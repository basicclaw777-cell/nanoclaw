// vault-metabolism.js
// Vault health engine — nugget decay, corroboration tracking, contradiction detection, archiving.
// Spec: docs/addendum.md Section 2

import Database  from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { join, basename } from 'path';

const HOME     = process.env.HOME;
const DB_PATH  = join(HOME, 'nanoclaw', 'vortex_data', 'metrics.db');
const VAULT    = join(HOME, 'cathedral-vault');
const GRAVEYARD = join(VAULT, '05_Archive_Graveyard');
const OLLAMA_URL = 'http://localhost:11434';

const db = new Database(DB_PATH);

// ─── Schema ──────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS nugget_health (
    file_path        TEXT PRIMARY KEY,
    health_state     TEXT NOT NULL DEFAULT 'STABLE',
    last_scanned     INTEGER,
    last_referenced  INTEGER,
    weakened_by      TEXT,
    corroborations   INTEGER DEFAULT 0,
    notes            TEXT
  );

  CREATE TABLE IF NOT EXISTS nugget_contradictions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    nugget_a     TEXT NOT NULL,
    nugget_b     TEXT NOT NULL,
    description  TEXT,
    detected_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS nugget_corroborations (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    nugget_a     TEXT NOT NULL,
    nugget_b     TEXT NOT NULL,
    description  TEXT,
    detected_at  INTEGER NOT NULL
  );
`);

// ─── Constants ───────────────────────────────────────────────────────────────

const DECAY = {
  corroborationWindow: 90  * 86400 * 1000,   // 90 days in ms
  agingThreshold:      180 * 86400 * 1000,   // 180 days
  archiveThreshold:    365 * 86400 * 1000,   // 365 days in WEAKENED
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function queryOllama(model, system, prompt) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system',  content: system },
        { role: 'user',    content: prompt },
      ],
      stream: false,
    }),
  });
  const data = await res.json();
  return data.message?.content ?? '';
}

function daysBetween(tsA, tsB) {
  return Math.abs(tsA - tsB) / 86400000;
}

// ─── Health Calculation ───────────────────────────────────────────────────────

function calculateHealth(filePath, now) {
  const row = db.prepare('SELECT * FROM nugget_health WHERE file_path = ?').get(filePath);
  if (!row) return 'STABLE';

  const ageDays = daysBetween(row.last_referenced ?? row.last_scanned ?? now, now);

  const recentCorroborations = db.prepare(`
    SELECT COUNT(*) as n FROM nugget_corroborations
    WHERE (nugget_a = ? OR nugget_b = ?)
      AND detected_at > ?
  `).get(filePath, filePath, now - DECAY.corroborationWindow).n;

  const contradictions = db.prepare(`
    SELECT COUNT(*) as n FROM nugget_contradictions
    WHERE nugget_a = ? OR nugget_b = ?
  `).get(filePath, filePath).n;

  // VITAL: corroborated within 90 days
  if (recentCorroborations > 0) return 'VITAL';

  // WEAKENED: contradicted with no recent corroboration
  if (contradictions > 0) return 'WEAKENED';

  // AGING: over 180 days without reference
  if (ageDays > 180) return 'AGING';

  return 'STABLE';
}

// ─── Contradiction Detection (LLM-assisted) ───────────────────────────────────

async function detectContradictions(nuggets) {
  if (nuggets.length < 2) return [];

  // Sample pairs — compare similar-domain nuggets to avoid O(n²) explosion
  const findings = [];
  const SAMPLE_LIMIT = 20;   // max pairs per run to keep it tractable
  const pairs = [];

  for (let i = 0; i < Math.min(nuggets.length, 40); i++) {
    for (let j = i + 1; j < Math.min(nuggets.length, 40); j++) {
      if (nuggets[i].domain === nuggets[j].domain) {
        pairs.push([nuggets[i], nuggets[j]]);
      }
    }
  }

  const sample = pairs.slice(0, SAMPLE_LIMIT);

  for (const [a, b] of sample) {
    const prompt = `Compare these two vault nuggets. Do they DIRECTLY CONTRADICT each other?
Answer JSON only: {"contradicts": true/false, "description": "brief reason or null"}

NUGGET A (${a.title}): ${(a.first_line ?? '').slice(0, 300)}
NUGGET B (${b.title}): ${(b.first_line ?? '').slice(0, 300)}`;

    try {
      const raw = await queryOllama('hermes3',
        'You are a contradiction detector. Reply with JSON only, no commentary.',
        prompt
      );
      const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
      if (json.contradicts === true && json.description) {
        findings.push({ nugget_a: a.file_path, nugget_b: b.file_path, description: json.description });
      }
    } catch { /* skip parse errors */ }
  }

  return findings;
}

// ─── Corroboration Detection (LLM-assisted) ──────────────────────────────────

async function detectCorroborations(nuggets) {
  if (nuggets.length < 2) return [];

  const findings = [];
  const SAMPLE_LIMIT = 20;
  const pairs = [];

  for (let i = 0; i < Math.min(nuggets.length, 40); i++) {
    for (let j = i + 1; j < Math.min(nuggets.length, 40); j++) {
      if (nuggets[i].domain !== nuggets[j].domain) {  // cross-domain = stronger corroboration
        pairs.push([nuggets[i], nuggets[j]]);
      }
    }
  }

  const sample = pairs.slice(0, SAMPLE_LIMIT);

  for (const [a, b] of sample) {
    const prompt = `Do these two vault nuggets INDEPENDENTLY CORROBORATE the same claim?
Answer JSON only: {"corroborates": true/false, "description": "brief reason or null"}

NUGGET A (${a.title}, domain: ${a.domain ?? 'unknown'}): ${(a.first_line ?? '').slice(0, 300)}
NUGGET B (${b.title}, domain: ${b.domain ?? 'unknown'}): ${(b.first_line ?? '').slice(0, 300)}`;

    try {
      const raw = await queryOllama('hermes3',
        'You are a corroboration detector. Reply with JSON only, no commentary.',
        prompt
      );
      const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
      if (json.corroborates === true && json.description) {
        findings.push({ nugget_a: a.file_path, nugget_b: b.file_path, description: json.description });
      }
    } catch { /* skip */ }
  }

  return findings;
}

// ─── Archive Engine ───────────────────────────────────────────────────────────

function archiveNugget(filePath) {
  if (!existsSync(GRAVEYARD)) mkdirSync(GRAVEYARD, { recursive: true });
  if (!existsSync(filePath)) return false;

  const dest = join(GRAVEYARD, basename(filePath));
  try {
    renameSync(filePath, dest);
    db.prepare("UPDATE nugget_health SET health_state = 'ARCHIVED', notes = ? WHERE file_path = ?")
      .run(`Archived on ${new Date().toISOString()}`, filePath);
    return true;
  } catch (e) {
    console.error(`Archive failed for ${filePath}: ${e.message}`);
    return false;
  }
}

// ─── Main Scan ────────────────────────────────────────────────────────────────

export async function runMetabolism(onProgress) {
  const now = Date.now();
  const log = (msg) => { console.log(msg); onProgress?.(msg); };

  log('🫀 Vault Metabolism — scanning nuggets...');

  const nuggets = db.prepare('SELECT * FROM vault_embeddings').all();
  log(`   Loaded ${nuggets.length} nuggets from vault_embeddings`);

  // Ensure all nuggets have a health row
  const upsertHealth = db.prepare(`
    INSERT INTO nugget_health (file_path, last_scanned, last_referenced)
    VALUES (?, ?, ?)
    ON CONFLICT(file_path) DO UPDATE SET last_scanned = excluded.last_scanned
  `);

  for (const n of nuggets) {
    upsertHealth.run(n.file_path, now, n.created_at ?? now);
  }

  // Detect contradictions and corroborations
  log('   Running contradiction detection (sample)...');
  const contradictions = await detectContradictions(nuggets);

  const insertContra = db.prepare(`
    INSERT INTO nugget_contradictions (nugget_a, nugget_b, description, detected_at)
    VALUES (?, ?, ?, ?)
  `);
  for (const c of contradictions) {
    // Avoid duplicates
    const exists = db.prepare(`
      SELECT id FROM nugget_contradictions
      WHERE (nugget_a = ? AND nugget_b = ?) OR (nugget_a = ? AND nugget_b = ?)
    `).get(c.nugget_a, c.nugget_b, c.nugget_b, c.nugget_a);
    if (!exists) insertContra.run(c.nugget_a, c.nugget_b, c.description, now);
  }
  log(`   Contradictions detected: ${contradictions.length}`);

  log('   Running corroboration detection (sample)...');
  const corroborations = await detectCorroborations(nuggets);

  const insertCorro = db.prepare(`
    INSERT INTO nugget_corroborations (nugget_a, nugget_b, description, detected_at)
    VALUES (?, ?, ?, ?)
  `);
  for (const c of corroborations) {
    const exists = db.prepare(`
      SELECT id FROM nugget_corroborations
      WHERE (nugget_a = ? AND nugget_b = ?) OR (nugget_a = ? AND nugget_b = ?)
    `).get(c.nugget_a, c.nugget_b, c.nugget_b, c.nugget_a);
    if (!exists) insertCorro.run(c.nugget_a, c.nugget_b, c.description, now);
  }
  log(`   Corroborations detected: ${corroborations.length}`);

  // Update health states
  const updateHealth = db.prepare(`
    UPDATE nugget_health SET health_state = ?, last_scanned = ? WHERE file_path = ?
  `);

  const states = { VITAL: 0, STABLE: 0, AGING: 0, WEAKENED: 0, ARCHIVED: 0 };
  const toArchive = [];

  for (const n of nuggets) {
    const state = calculateHealth(n.file_path, now);
    updateHealth.run(state, now, n.file_path);
    states[state] = (states[state] ?? 0) + 1;

    // Flag long-WEAKENED nuggets for archival
    if (state === 'WEAKENED') {
      const row = db.prepare('SELECT last_scanned FROM nugget_health WHERE file_path = ?').get(n.file_path);
      if (row?.last_scanned && (now - row.last_scanned) > DECAY.archiveThreshold) {
        toArchive.push(n.file_path);
      }
    }
  }

  log(`   Health states — VITAL: ${states.VITAL}, STABLE: ${states.STABLE}, AGING: ${states.AGING}, WEAKENED: ${states.WEAKENED}`);

  // Archive long-term weakened nuggets
  let archived = 0;
  for (const fp of toArchive) {
    if (archiveNugget(fp)) archived++;
  }
  if (archived > 0) log(`   Archived ${archived} long-term weakened nuggets to graveyard.`);

  // ── Scout findings decay scan ──────────────────────────────────────────────
  let scoutUpdates = [];
  try {
    const { runMetabolism: runScoutMetabolism } = await import('./scout-engine.js');
    scoutUpdates = await runScoutMetabolism();
    if (scoutUpdates.length) log(`   Scout findings: ${scoutUpdates.length} decay updates`);
  } catch (e) {
    log(`   Scout metabolism skipped: ${e.message}`);
  }

  return buildHealthReport(states, nuggets, contradictions, corroborations, archived, scoutUpdates);
}

// ─── Health Report ────────────────────────────────────────────────────────────

function buildHealthReport(states, nuggets, contradictions, corroborations, archived, scoutUpdates = []) {
  const total = nuggets.length;

  // Domains with most aging nuggets
  const agingByDomain = db.prepare(`
    SELECT ve.domain, COUNT(*) as n
    FROM nugget_health nh
    JOIN vault_embeddings ve ON nh.file_path = ve.file_path
    WHERE nh.health_state = 'AGING'
    GROUP BY ve.domain
    ORDER BY n DESC
    LIMIT 5
  `).all();

  // Top contradictions to surface
  const recentContras = db.prepare(`
    SELECT nc.nugget_a, nc.nugget_b, nc.description,
           vea.title as title_a, veb.title as title_b
    FROM nugget_contradictions nc
    LEFT JOIN vault_embeddings vea ON nc.nugget_a = vea.file_path
    LEFT JOIN vault_embeddings veb ON nc.nugget_b = veb.file_path
    ORDER BY nc.detected_at DESC
    LIMIT 5
  `).all();

  let report = `🫀 VAULT METABOLISM REPORT\n`;
  report += `${new Date().toLocaleDateString('en-HK', { dateStyle: 'medium' })}\n\n`;

  report += `VAULT HEALTH\n`;
  report += `Total nuggets: ${total}\n`;
  report += `• VITAL    ${states.VITAL}  (corroborated within 90 days)\n`;
  report += `• STABLE   ${states.STABLE}  (no contradictions, active)\n`;
  report += `• AGING    ${states.AGING}  (180+ days without reference)\n`;
  report += `• WEAKENED ${states.WEAKENED}  (contradicted, needs review)\n`;
  if (archived > 0) report += `• ARCHIVED ${archived}  (moved to graveyard this scan)\n`;

  if (agingByDomain.length > 0) {
    report += `\nAGING BY DOMAIN (review targets)\n`;
    for (const row of agingByDomain) {
      report += `  ${row.domain ?? 'untagged'}: ${row.n} aging nuggets\n`;
    }
  }

  if (recentContras.length > 0) {
    report += `\nNEW CONTRADICTIONS DETECTED\n`;
    for (const c of recentContras) {
      const a = c.title_a ?? c.nugget_a.split('/').pop();
      const b = c.title_b ?? c.nugget_b.split('/').pop();
      report += `  ⚔️ "${a}" vs "${b}"\n     ${c.description}\n`;
    }
  }

  if (corroborations.length > 0) {
    report += `\nCORROBORATIONS FOUND\n`;
    for (const c of corroborations.slice(0, 5)) {
      const a = c.nugget_a.split('/').pop().replace('.md', '');
      const b = c.nugget_b.split('/').pop().replace('.md', '');
      report += `  ✅ "${a}" <-> "${b}": ${c.description}\n`;
    }
  }

  if (scoutUpdates.length > 0) {
    report += `\nSCOUT FINDINGS DECAY\n`;
    for (const u of scoutUpdates) report += `  ${u}\n`;
  }

  report += `\nRun /metabolism again next week to track decay.`;
  return report;
}

// ─── Mark Referenced (called when vault search hits a nugget) ─────────────────

export function markReferenced(filePath) {
  const now = Date.now();
  db.prepare(`
    INSERT INTO nugget_health (file_path, last_scanned, last_referenced)
    VALUES (?, ?, ?)
    ON CONFLICT(file_path) DO UPDATE SET last_referenced = excluded.last_referenced
  `).run(filePath, now, now);
}

// ─── Public Report (no scan) ──────────────────────────────────────────────────

export function getMetabolismSummary() {
  const states = db.prepare(`
    SELECT health_state, COUNT(*) as n FROM nugget_health GROUP BY health_state
  `).all();
  const stateMap = Object.fromEntries(states.map(r => [r.health_state, r.n]));
  const total = db.prepare('SELECT COUNT(*) as n FROM vault_embeddings').get()?.n ?? 0;

  return { total, states: stateMap };
}

// ─── Weekly Cron ──────────────────────────────────────────────────────────────

export function startMetabolismCron(onReport) {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const run = async () => {
    try {
      const report = await runMetabolism();
      onReport?.(report);
    } catch (e) {
      console.error('Metabolism cron error:', e.message);
    }
  };

  setInterval(run, WEEK_MS);
  console.log('🫀 Vault Metabolism cron scheduled (weekly).');
}
