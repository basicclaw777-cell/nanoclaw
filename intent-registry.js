// intent-registry.js — The Cathedral's strategic intent layer.
// ESM module. SQLite via better-sqlite3.
//
// Military C2 concept: Commander's Intent survives when conditions change.
// 5-15 active intents that everything maps against.

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'vortex_data', 'metrics.db');

// ── Database init ────────────────────────────────────────────────────────────

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS intents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','ACHIEVED','PAUSED','RETIRED')),
  priority INTEGER DEFAULT 5,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS intent_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intent_id TEXT NOT NULL,
  signal_type TEXT NOT NULL CHECK(signal_type IN ('claim','emergence','priority_event','build','discovery')),
  signal_id TEXT,
  signal_summary TEXT NOT NULL,
  alignment TEXT DEFAULT 'ADVANCES' CHECK(alignment IN ('ADVANCES','NEUTRAL','THREATENS')),
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (intent_id) REFERENCES intents(id)
);
`);

// ── Seed intents ─────────────────────────────────────────────────────────────

const SEEDS = [
  {
    id: 'INTENT-001',
    title: 'Increase teaching leverage',
    description: "Scale Paul's coaching methodology beyond 1-on-1 through AI tools, curriculum products, and the 10-block system",
    priority: 9,
  },
  {
    id: 'INTENT-002',
    title: 'Strengthen sovereign capability',
    description: 'Reduce cloud dependency, increase local-first processing, own all data and infrastructure',
    priority: 8,
  },
  {
    id: 'INTENT-003',
    title: 'Expand Logan universe',
    description: "Develop Logan as BR's avatar character across stills, video, story, and curriculum delivery",
    priority: 6,
  },
  {
    id: 'INTENT-004',
    title: 'Prove Gym Eyes product-market fit',
    description: 'Validate AI punch tracking as a standalone product through paper trial and real student usage',
    priority: 9,
  },
  {
    id: 'INTENT-005',
    title: 'Compound vault intelligence',
    description: 'Increase cross-domain convergence detection, rosetta bridges, and research depth',
    priority: 7,
  },
  {
    id: 'INTENT-006',
    title: 'Generate BR revenue',
    description: 'Direct business outcomes: member retention, new signups, corporate, kids programme, digital products',
    priority: 10,
  },
  {
    id: 'INTENT-007',
    title: 'Build transferable methodology',
    description: 'Package Principled Practice, Fear Framework, and diagnostic methods as teachable IP',
    priority: 7,
  },
];

const seedStmt = db.prepare(`
  INSERT OR IGNORE INTO intents (id, title, description, priority)
  VALUES (@id, @title, @description, @priority)
`);
for (const s of SEEDS) seedStmt.run(s);

// ── Prepared statements ──────────────────────────────────────────────────────

const stmtInsert = db.prepare(`
  INSERT INTO intents (id, title, description, priority)
  VALUES (@id, @title, @description, @priority)
`);

const stmtGetAll = db.prepare(`
  SELECT i.*, COUNT(s.id) AS signal_count
  FROM intents i
  LEFT JOIN intent_signals s ON s.intent_id = i.id
  WHERE i.status = ?
  GROUP BY i.id
  ORDER BY i.priority DESC, i.created_at ASC
`);

const stmtGetOne = db.prepare(`SELECT * FROM intents WHERE id = ?`);

const stmtGetSignals = db.prepare(`
  SELECT * FROM intent_signals WHERE intent_id = ? ORDER BY created_at DESC
`);

const stmtUpdate = db.prepare(`
  UPDATE intents SET title = COALESCE(@title, title),
    description = COALESCE(@description, description),
    status = COALESCE(@status, status),
    priority = COALESCE(@priority, priority),
    updated_at = datetime('now')
  WHERE id = @id
`);

const stmtInsertSignal = db.prepare(`
  INSERT INTO intent_signals (intent_id, signal_type, signal_id, signal_summary, alignment)
  VALUES (@intent_id, @signal_type, @signal_id, @signal_summary, @alignment)
`);

const stmtHealthPerIntent = db.prepare(`
  SELECT
    intent_id,
    SUM(CASE WHEN alignment = 'ADVANCES' THEN 1 ELSE 0 END) AS signals_advancing,
    SUM(CASE WHEN alignment = 'THREATENS' THEN 1 ELSE 0 END) AS signals_threatening,
    MAX(created_at) AS last_signal_date,
    COUNT(*) AS total_signals
  FROM intent_signals
  WHERE intent_id = ?
`);

// ── Next ID ──────────────────────────────────────────────────────────────────

function nextId() {
  const row = db.prepare(`SELECT id FROM intents ORDER BY id DESC LIMIT 1`).get();
  if (!row) return 'INTENT-001';
  const num = parseInt(row.id.replace('INTENT-', ''), 10);
  return `INTENT-${String(num + 1).padStart(3, '0')}`;
}

// ── Exports ──────────────────────────────────────────────────────────────────

export function createIntent(title, description, priority = 5) {
  const id = nextId();
  stmtInsert.run({ id, title, description: description || null, priority });
  return stmtGetOne.get(id);
}

export function getIntents(status = 'ACTIVE') {
  return stmtGetAll.all(status);
}

export function getIntent(id) {
  const intent = stmtGetOne.get(id);
  if (!intent) return null;
  const signals = stmtGetSignals.all(id);
  return { ...intent, signals };
}

export function updateIntent(id, fields) {
  stmtUpdate.run({ id, title: fields.title || null, description: fields.description || null, status: fields.status || null, priority: fields.priority ?? null });
  return stmtGetOne.get(id);
}

export function registerSignal(intentId, signalType, signalId, summary, alignment = 'ADVANCES') {
  const trimmed = (summary || '').slice(0, 200);
  const info = stmtInsertSignal.run({
    intent_id: intentId,
    signal_type: signalType,
    signal_id: signalId || null,
    signal_summary: trimmed,
    alignment,
  });
  return { id: info.lastInsertRowid, intent_id: intentId, signal_type: signalType, signal_summary: trimmed, alignment };
}

export function getIntentHealth() {
  const intents = stmtGetAll.all('ACTIVE');
  const now = Date.now();
  return intents.map(intent => {
    const h = stmtHealthPerIntent.get(intent.id);
    const lastDate = h?.last_signal_date ? new Date(h.last_signal_date + 'Z').getTime() : null;
    const daysDormant = lastDate ? Math.floor((now - lastDate) / 86400000) : null;

    // velocity: signals in last 7 days
    const recentCount = db.prepare(
      `SELECT COUNT(*) AS c FROM intent_signals WHERE intent_id = ? AND created_at >= datetime('now', '-7 days')`
    ).get(intent.id);

    return {
      id: intent.id,
      title: intent.title,
      priority: intent.priority,
      signals_advancing: h?.signals_advancing || 0,
      signals_threatening: h?.signals_threatening || 0,
      total_signals: h?.total_signals || 0,
      last_signal_date: h?.last_signal_date || null,
      days_dormant: daysDormant,
      velocity: recentCount?.c || 0,
    };
  });
}

export function mapToIntents(content) {
  if (!content || typeof content !== 'string') return [];
  const lower = content.toLowerCase();
  const intents = stmtGetAll.all('ACTIVE');
  const matches = [];

  for (const intent of intents) {
    // Build keywords from title + description
    const source = `${intent.title} ${intent.description || ''}`.toLowerCase();
    const words = source
      .split(/[^a-z0-9]+/)
      .filter(w => w.length > 3)
      // Remove stop words
      .filter(w => !['through', 'across', 'increase', 'reduce', 'direct', 'business', 'system', 'with', 'from', 'that', 'this', 'into', 'than', 'real', 'paper'].includes(w));

    // Deduplicate
    const unique = [...new Set(words)];
    const hits = unique.filter(w => lower.includes(w));

    if (hits.length >= 2) {
      matches.push({
        id: intent.id,
        title: intent.title,
        matchedKeywords: hits,
        score: hits.length / unique.length,
      });
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}
