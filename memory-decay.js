// memory-decay.js
// Ebbinghaus decay engine for Cathedral memory
// Core math: retention = e^(-t/S), S compounds with recall
// Run dream() as nightly cron for consolidation

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.env.HOME, 'nanoclaw', 'vortex_data', 'metrics.db');

const BASE_STABILITY = 7;       // days — new memories start here
const EVICTION_THRESHOLD = 0.15; // below this = ARCHIVED
const WEAK_THRESHOLD = 0.30;     // below this = WEAKENED
const AGING_THRESHOLD = 0.50;    // below this = AGING
const VITAL_THRESHOLD = 0.85;    // above this = VITAL

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  return db;
}

function ensureTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_decay (
      item_id       TEXT PRIMARY KEY,
      item_type     TEXT NOT NULL,
      stability     REAL NOT NULL DEFAULT ${BASE_STABILITY},
      recall_count  INTEGER NOT NULL DEFAULT 0,
      last_accessed INTEGER NOT NULL,
      created_at    INTEGER NOT NULL,
      retention     REAL NOT NULL DEFAULT 1.0,
      label         TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_decay_type ON memory_decay(item_type)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_decay_retention ON memory_decay(retention)`);
}

// Core Ebbinghaus: retention = e^(-t/S)
function computeRetention(stabilityDays, elapsedDays) {
  if (elapsedDays <= 0) return 1.0;
  return Math.exp(-elapsedDays / stabilityDays);
}

// Stability compounds with each recall: S_new = S_old * (1 + ln(1 + recall_count))
function computeStability(baseStability, recallCount) {
  return baseStability * (1 + Math.log(1 + recallCount));
}

// Health state from retention score
function retentionToHealth(retention) {
  if (retention >= VITAL_THRESHOLD) return 'VITAL';
  if (retention >= AGING_THRESHOLD) return 'STABLE';
  if (retention >= WEAK_THRESHOLD) return 'AGING';
  if (retention >= EVICTION_THRESHOLD) return 'WEAKENED';
  return 'ARCHIVED';
}

// Register a memory item (idempotent — skips if exists)
export function register(itemId, itemType, label = null) {
  const db = getDb();
  ensureTable(db);
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`
    INSERT OR IGNORE INTO memory_decay (item_id, item_type, stability, recall_count, last_accessed, created_at, retention, label)
    VALUES (?, ?, ?, 0, ?, ?, 1.0, ?)
  `).run(itemId, itemType, BASE_STABILITY, now, now, label);
  db.close();
}

// Record a recall — boosts stability
export function recall(itemId) {
  const db = getDb();
  ensureTable(db);
  const now = Math.floor(Date.now() / 1000);

  const row = db.prepare('SELECT * FROM memory_decay WHERE item_id = ?').get(itemId);
  if (!row) {
    db.close();
    return null;
  }

  const newRecallCount = row.recall_count + 1;
  const newStability = computeStability(BASE_STABILITY, newRecallCount);

  db.prepare(`
    UPDATE memory_decay
    SET recall_count = ?, stability = ?, last_accessed = ?, retention = 1.0
    WHERE item_id = ?
  `).run(newRecallCount, newStability, now, itemId);

  db.close();
  return { itemId, stability: newStability, recallCount: newRecallCount };
}

// Get current retention for an item (recomputes from elapsed time)
export function getRetention(itemId) {
  const db = getDb();
  ensureTable(db);
  const row = db.prepare('SELECT * FROM memory_decay WHERE item_id = ?').get(itemId);
  db.close();
  if (!row) return null;

  const now = Math.floor(Date.now() / 1000);
  const elapsedDays = (now - row.last_accessed) / 86400;
  const retention = computeRetention(row.stability, elapsedDays);

  return {
    itemId: row.item_id,
    itemType: row.item_type,
    label: row.label,
    stability: row.stability,
    recallCount: row.recall_count,
    retention,
    health: retentionToHealth(retention),
    daysSinceAccess: Math.round(elapsedDays * 10) / 10,
    createdDaysAgo: Math.round((now - row.created_at) / 86400 * 10) / 10
  };
}

// The "Dream" — nightly consolidation pass
// Updates all retention scores, syncs nugget_health, reports changes
export function dream() {
  const db = getDb();
  ensureTable(db);
  const now = Math.floor(Date.now() / 1000);

  const items = db.prepare('SELECT * FROM memory_decay').all();
  const updateStmt = db.prepare('UPDATE memory_decay SET retention = ? WHERE item_id = ?');
  const updateHealthStmt = db.prepare(`
    UPDATE nugget_health SET health_state = ?, last_scanned = ?
    WHERE file_path = ? AND health_state != ?
  `);

  const report = {
    total: items.length,
    vital: 0,
    stable: 0,
    aging: 0,
    weakened: 0,
    archived: 0,
    stateChanges: [],
    topRecalled: [],
    nearEviction: []
  };

  const updateMany = db.transaction(() => {
    for (const item of items) {
      const elapsedDays = (now - item.last_accessed) / 86400;
      const newRetention = computeRetention(item.stability, elapsedDays);
      const oldHealth = retentionToHealth(item.retention);
      const newHealth = retentionToHealth(newRetention);

      updateStmt.run(newRetention, item.item_id);

      // Sync nugget_health for vault nuggets
      if (item.item_type === 'nugget') {
        updateHealthStmt.run(newHealth, now, item.item_id, newHealth);
      }

      // Track state changes
      if (oldHealth !== newHealth) {
        report.stateChanges.push({
          item: item.label || item.item_id,
          type: item.item_type,
          from: oldHealth,
          to: newHealth,
          retention: Math.round(newRetention * 1000) / 1000
        });
      }

      // Classify
      if (newHealth === 'VITAL') report.vital++;
      else if (newHealth === 'STABLE') report.stable++;
      else if (newHealth === 'AGING') report.aging++;
      else if (newHealth === 'WEAKENED') report.weakened++;
      else report.archived++;

      // Near eviction warning
      if (newRetention < WEAK_THRESHOLD && newRetention >= EVICTION_THRESHOLD) {
        report.nearEviction.push({
          item: item.label || item.item_id,
          retention: Math.round(newRetention * 1000) / 1000,
          daysSinceAccess: Math.round(elapsedDays)
        });
      }
    }
  });

  updateMany();

  // Top recalled items
  const topRecalled = db.prepare(
    'SELECT item_id, label, item_type, recall_count, stability, retention FROM memory_decay ORDER BY recall_count DESC LIMIT 10'
  ).all();
  report.topRecalled = topRecalled.map(r => ({
    item: r.label || r.item_id,
    type: r.item_type,
    recalls: r.recall_count,
    stability: Math.round(r.stability * 10) / 10
  }));

  db.close();
  return report;
}

// Seed vault nuggets into decay tracking
// Reads nugget_health, registers any untracked nuggets
export function seedFromVault() {
  const db = getDb();
  ensureTable(db);

  const nuggets = db.prepare('SELECT file_path, health_state, last_referenced FROM nugget_health').all();
  const existing = new Set(
    db.prepare("SELECT item_id FROM memory_decay WHERE item_type = 'nugget'").all().map(r => r.item_id)
  );

  const now = Math.floor(Date.now() / 1000);
  let added = 0;

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO memory_decay (item_id, item_type, stability, recall_count, last_accessed, created_at, retention, label)
    VALUES (?, 'nugget', ?, ?, ?, ?, 1.0, ?)
  `);

  const insertMany = db.transaction(() => {
    for (const n of nuggets) {
      if (existing.has(n.file_path)) continue;

      // If nugget was previously referenced, give it credit
      const refs = n.last_referenced ? 1 : 0;
      const stability = computeStability(BASE_STABILITY, refs);
      const lastAccess = n.last_referenced || now;
      const label = path.basename(n.file_path, '.md');

      insertStmt.run(n.file_path, stability, refs, lastAccess, now, label);
      added++;
    }
  });

  insertMany();
  db.close();
  return { total: nuggets.length, added, alreadyTracked: nuggets.length - added };
}

// Seed profile patterns/themes into decay tracking
export function seedFromProfile(profilePath) {
  const db = getDb();
  ensureTable(db);
  const now = Math.floor(Date.now() / 1000);

  try {
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    let added = 0;

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO memory_decay (item_id, item_type, stability, recall_count, last_accessed, created_at, retention, label)
      VALUES (?, ?, ?, 0, ?, ?, 1.0, ?)
    `);

    const insertMany = db.transaction(() => {
      for (const pattern of (profile.corePatterns || [])) {
        const id = `pattern:${pattern.substring(0, 100)}`;
        insertStmt.run(id, 'pattern', BASE_STABILITY, now, now, pattern.substring(0, 120));
        added++;
      }
      for (const theme of (profile.recurringThemes || [])) {
        const id = `theme:${theme.substring(0, 100)}`;
        insertStmt.run(id, 'theme', BASE_STABILITY, now, now, theme.substring(0, 120));
        added++;
      }
      for (const focus of (profile.currentFocus || [])) {
        const id = `focus:${focus.substring(0, 100)}`;
        insertStmt.run(id, 'focus', BASE_STABILITY, now, now, focus.substring(0, 120));
        added++;
      }
      for (const thread of (profile.openThreads || [])) {
        const id = `thread:${thread.substring(0, 100)}`;
        insertStmt.run(id, 'thread', BASE_STABILITY, now, now, thread.substring(0, 120));
        added++;
      }
    });

    insertMany();
    db.close();
    return { added };
  } catch (e) {
    db.close();
    return { error: e.message };
  }
}

// Get decay summary stats
export function stats() {
  const db = getDb();
  ensureTable(db);
  const now = Math.floor(Date.now() / 1000);

  const items = db.prepare('SELECT * FROM memory_decay').all();
  const summary = { total: items.length, byType: {}, byHealth: {} };

  for (const item of items) {
    const elapsedDays = (now - item.last_accessed) / 86400;
    const retention = computeRetention(item.stability, elapsedDays);
    const health = retentionToHealth(retention);

    summary.byType[item.item_type] = (summary.byType[item.item_type] || 0) + 1;
    summary.byHealth[health] = (summary.byHealth[health] || 0) + 1;
  }

  db.close();
  return summary;
}

// CLI entry point
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const cmd = process.argv[2];

  if (cmd === 'seed') {
    console.log('Seeding vault nuggets...');
    const vaultResult = seedFromVault();
    console.log(`Vault: ${vaultResult.added} added, ${vaultResult.alreadyTracked} already tracked`);

    const profilePath = path.join(process.env.HOME, 'nanoclaw', 'memory', 'patterns', 'paul-profile.json');
    if (fs.existsSync(profilePath)) {
      console.log('Seeding profile items...');
      const profileResult = seedFromProfile(profilePath);
      console.log(`Profile: ${profileResult.added || 0} added`);
    }
  } else if (cmd === 'dream') {
    console.log('Running dream consolidation...');
    const report = dream();
    console.log(`\n=== DREAM REPORT ===`);
    console.log(`Total items: ${report.total}`);
    console.log(`VITAL: ${report.vital} | STABLE: ${report.stable} | AGING: ${report.aging} | WEAKENED: ${report.weakened} | ARCHIVED: ${report.archived}`);
    if (report.stateChanges.length > 0) {
      console.log(`\nState changes:`);
      report.stateChanges.forEach(c => console.log(`  ${c.item} (${c.type}): ${c.from} → ${c.to} [${c.retention}]`));
    }
    if (report.nearEviction.length > 0) {
      console.log(`\nNear eviction:`);
      report.nearEviction.forEach(e => console.log(`  ${e.item}: retention=${e.retention}, ${e.daysSinceAccess}d since access`));
    }
    if (report.topRecalled.length > 0) {
      console.log(`\nTop recalled:`);
      report.topRecalled.forEach(r => console.log(`  ${r.item} (${r.type}): ${r.recalls} recalls, stability=${r.stability}d`));
    }
  } else if (cmd === 'stats') {
    const s = stats();
    console.log(JSON.stringify(s, null, 2));
  } else {
    console.log('Usage: node memory-decay.js [seed|dream|stats]');
  }
}
