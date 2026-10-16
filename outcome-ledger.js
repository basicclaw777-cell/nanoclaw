// outcome-ledger.js — The Cathedral's fifth memory type: what actually happened.
// ESM module. SQLite via better-sqlite3.
//
// DESIGN PRINCIPLE: Paul is the sensor. The system cannot observe its own real-world
// results. This ledger records what Paul reports happened, then cross-references with
// what the system believed (claims), prioritized (attention), and intended (intents).
//
// The learning loop closes here:
//   Claim Ledger  → what we believe
//   Attention      → what we prioritized
//   Intent         → what we're trying to do
//   COP Dashboard  → where we are now
//   Outcome Ledger → what actually happened

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
CREATE TABLE IF NOT EXISTS outcomes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  domain TEXT,
  result TEXT NOT NULL CHECK(result IN ('SUCCESS','PARTIAL','NEUTRAL','FAILURE','UNEXPECTED')),
  magnitude INTEGER DEFAULT 5 CHECK(magnitude BETWEEN 1 AND 10),
  recorded_at TEXT DEFAULT (datetime('now')),
  recorded_by TEXT DEFAULT 'paul'
);

CREATE TABLE IF NOT EXISTS outcome_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outcome_id TEXT NOT NULL,
  linked_type TEXT NOT NULL CHECK(linked_type IN ('claim','attention','intent','emergence')),
  linked_id TEXT NOT NULL,
  relationship TEXT DEFAULT 'RELATED' CHECK(relationship IN ('PREDICTED_BY','CONTRADICTED_BY','ADVANCED','THREATENED','RELATED')),
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (outcome_id) REFERENCES outcomes(id)
)
`);

// ── ID generator ─────────────────────────────────────────────────────────────

const stmtMaxId = db.prepare(`
  SELECT id FROM outcomes
  WHERE id LIKE 'OUT-%'
  ORDER BY id DESC LIMIT 1
`);

function nextId() {
  const row = stmtMaxId.get();
  if (!row) return 'OUT-000001';
  const num = parseInt(row.id.replace('OUT-', ''), 10);
  return `OUT-${String(num + 1).padStart(6, '0')}`;
}

// ── Prepared statements ──────────────────────────────────────────────────────

const stmtInsert = db.prepare(`
  INSERT INTO outcomes (id, title, description, domain, result, magnitude, recorded_by)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const stmtInsertLink = db.prepare(`
  INSERT INTO outcome_links (outcome_id, linked_type, linked_id, relationship)
  VALUES (?, ?, ?, ?)
`);

const stmtGetById = db.prepare(`SELECT * FROM outcomes WHERE id = ?`);

const stmtGetLinks = db.prepare(`
  SELECT * FROM outcome_links WHERE outcome_id = ? ORDER BY created_at DESC
`);

// ── Core functions ───────────────────────────────────────────────────────────

export function recordOutcome(title, description, domain, result, magnitude, links) {
  const id = nextId();
  const mag = Math.max(1, Math.min(10, magnitude || 5));
  const VALID_RESULTS = ['SUCCESS', 'PARTIAL', 'NEUTRAL', 'FAILURE', 'UNEXPECTED'];
  const normalResult = (result || 'NEUTRAL').toUpperCase();
  if (!VALID_RESULTS.includes(normalResult)) {
    return { error: `Invalid result. Must be one of: ${VALID_RESULTS.join(', ')}` };
  }

  stmtInsert.run(id, title, description || null, domain || null, normalResult, mag, 'paul');

  if (links && Array.isArray(links)) {
    for (const link of links) {
      if (link.type && link.id) {
        const rel = link.relationship || 'RELATED';
        stmtInsertLink.run(id, link.type, link.id, rel);
      }
    }
  }

  return stmtGetById.get(id);
}

export function getOutcome(id) {
  const outcome = stmtGetById.get(id);
  if (!outcome) return null;
  const links = stmtGetLinks.all(id);
  return { ...outcome, links };
}

export function getOutcomes(opts = {}) {
  let sql = 'SELECT * FROM outcomes WHERE 1=1';
  const params = [];

  if (opts.domain) {
    sql += ' AND domain = ?';
    params.push(opts.domain);
  }
  if (opts.result) {
    sql += ' AND result = ?';
    params.push(opts.result.toUpperCase());
  }
  if (opts.since) {
    sql += ' AND recorded_at >= ?';
    params.push(opts.since);
  }

  sql += ' ORDER BY recorded_at DESC';

  if (opts.limit) {
    sql += ' LIMIT ?';
    params.push(opts.limit);
  }

  return db.prepare(sql).all(...params);
}

export function linkOutcome(outcomeId, linkedType, linkedId, relationship) {
  const outcome = stmtGetById.get(outcomeId);
  if (!outcome) return { error: 'Outcome not found' };

  const VALID_TYPES = ['claim', 'attention', 'intent', 'emergence'];
  if (!VALID_TYPES.includes(linkedType)) {
    return { error: `Invalid linked_type. Must be one of: ${VALID_TYPES.join(', ')}` };
  }

  const rel = relationship || 'RELATED';
  stmtInsertLink.run(outcomeId, linkedType, linkedId, rel);
  return { ok: true, outcomeId, linkedType, linkedId, relationship: rel };
}

export function getStats() {
  const total = db.prepare('SELECT COUNT(*) as count FROM outcomes').get().count;

  const byResultRows = db.prepare(
    'SELECT result, COUNT(*) as count FROM outcomes GROUP BY result'
  ).all();
  const byResult = Object.fromEntries(byResultRows.map(r => [r.result, r.count]));

  const byDomainRows = db.prepare(
    'SELECT domain, COUNT(*) as count FROM outcomes WHERE domain IS NOT NULL GROUP BY domain ORDER BY count DESC'
  ).all();
  const byDomain = Object.fromEntries(byDomainRows.map(r => [r.domain, r.count]));

  const avgMag = db.prepare('SELECT AVG(magnitude) as avg FROM outcomes').get().avg || 0;

  const recentCount = db.prepare(
    "SELECT COUNT(*) as count FROM outcomes WHERE recorded_at >= datetime('now', '-30 days')"
  ).get().count;

  const thisMonth = db.prepare(
    "SELECT COUNT(*) as count FROM outcomes WHERE strftime('%Y-%m', recorded_at) = strftime('%Y-%m', 'now')"
  ).get().count;

  return {
    total,
    byResult,
    byDomain,
    avgMagnitude: Math.round(avgMag * 10) / 10,
    recentCount,
    thisMonth
  };
}

// ── Learning loop functions (the crown jewels) ───────────────────────────────

/**
 * Which agents' claims predicted real outcomes?
 * Joins outcomes -> outcome_links (PREDICTED_BY) -> claims -> origin_agent
 */
export function getAgentAccuracy() {
  // Note: claims table is in a SEPARATE DB (claim-ledger.db), not metrics.db.
  // We join via outcome_links where linked_type='claim' and relationship='PREDICTED_BY'.
  // Since the claims DB is separate, we do a two-step: get linked claim IDs, then look them up.

  const predictedLinks = db.prepare(`
    SELECT ol.outcome_id, ol.linked_id, o.result
    FROM outcome_links ol
    JOIN outcomes o ON o.id = ol.outcome_id
    WHERE ol.linked_type = 'claim'
      AND ol.relationship = 'PREDICTED_BY'
  `).all();

  if (predictedLinks.length === 0) {
    return { agents: [], note: 'No claim-outcome links with PREDICTED_BY yet' };
  }

  // Try to open the claim ledger DB to get origin_agent
  let claimDb;
  try {
    const claimDbPath = path.join(__dirname, 'vortex_data', 'claim-ledger.db');
    claimDb = new Database(claimDbPath, { readonly: true });
  } catch (e) {
    return { agents: [], note: 'Could not open claim-ledger.db: ' + e.message };
  }

  const stmtClaim = claimDb.prepare('SELECT id, origin_agent FROM claims WHERE id = ?');
  const agentMap = {};

  for (const link of predictedLinks) {
    const claim = stmtClaim.get(link.linked_id);
    const agent = claim?.origin_agent || 'unknown';

    if (!agentMap[agent]) {
      agentMap[agent] = { agent, predictions: 0, correct: 0, wrong: 0 };
    }
    agentMap[agent].predictions++;

    if (link.result === 'SUCCESS' || link.result === 'PARTIAL') {
      agentMap[agent].correct++;
    } else if (link.result === 'FAILURE') {
      agentMap[agent].wrong++;
    }
  }

  claimDb.close();

  const agents = Object.values(agentMap).map(a => ({
    ...a,
    accuracy: a.predictions > 0 ? Math.round(a.correct / a.predictions * 100) : 0
  }));

  return { agents: agents.sort((a, b) => b.accuracy - a.accuracy) };
}

/**
 * Which intents generate real value?
 * Joins outcomes -> outcome_links (ADVANCED) -> intents
 */
export function getIntentROI() {
  const rows = db.prepare(`
    SELECT
      ol.linked_id AS intent_id,
      o.result,
      o.magnitude
    FROM outcome_links ol
    JOIN outcomes o ON o.id = ol.outcome_id
    WHERE ol.linked_type = 'intent'
      AND ol.relationship = 'ADVANCED'
  `).all();

  if (rows.length === 0) {
    return { intents: [], note: 'No intent-outcome links with ADVANCED yet' };
  }

  // Get intent titles from the intents table (same DB)
  const stmtIntent = db.prepare('SELECT id, title FROM intents WHERE id = ?');
  const intentMap = {};

  for (const row of rows) {
    if (!intentMap[row.intent_id]) {
      const intent = stmtIntent.get(row.intent_id);
      intentMap[row.intent_id] = {
        intentId: row.intent_id,
        title: intent?.title || row.intent_id,
        successes: 0,
        failures: 0,
        totalMagnitude: 0
      };
    }

    const entry = intentMap[row.intent_id];
    if (row.result === 'SUCCESS' || row.result === 'PARTIAL') {
      entry.successes++;
      entry.totalMagnitude += row.magnitude || 5;
    } else if (row.result === 'FAILURE') {
      entry.failures++;
    }
  }

  return {
    intents: Object.values(intentMap).sort((a, b) => b.totalMagnitude - a.totalMagnitude)
  };
}

/**
 * Cross-references with attention ledger.
 * Which attention events that were escalated led to good outcomes?
 */
export function getSourceReliability() {
  const rows = db.prepare(`
    SELECT
      ol.linked_id AS attn_id,
      o.result,
      o.magnitude
    FROM outcome_links ol
    JOIN outcomes o ON o.id = ol.outcome_id
    WHERE ol.linked_type = 'attention'
  `).all();

  if (rows.length === 0) {
    return { sources: [], note: 'No attention-outcome links yet' };
  }

  // attention_events is in the same DB (metrics.db)
  const stmtAttn = db.prepare('SELECT id, source, priority_tier FROM attention_events WHERE id = ?');
  const sourceMap = {};

  for (const row of rows) {
    const attn = stmtAttn.get(row.attn_id);
    const source = attn?.source || 'unknown';

    if (!sourceMap[source]) {
      sourceMap[source] = { source, escalations: 0, goodOutcomes: 0, noiseOutcomes: 0 };
    }
    sourceMap[source].escalations++;

    if (row.result === 'SUCCESS' || row.result === 'PARTIAL') {
      sourceMap[source].goodOutcomes++;
    } else if (row.result === 'FAILURE' || row.result === 'NEUTRAL') {
      sourceMap[source].noiseOutcomes++;
    }
  }

  return {
    sources: Object.values(sourceMap).map(s => ({
      ...s,
      noiseRate: s.escalations > 0
        ? Math.round(s.noiseOutcomes / s.escalations * 100)
        : 0
    })).sort((a, b) => b.escalations - a.escalations)
  };
}

/**
 * The big picture — closes the full feedback loop.
 * Combines agent accuracy + intent ROI + source reliability.
 * Pure SQL aggregation, NO LLM.
 */
export function getLearningLoop() {
  const accuracy = getAgentAccuracy();
  const intentROI = getIntentROI();
  const reliability = getSourceReliability();
  const stats = getStats();

  // Top-performing intent (most magnitude from successes)
  const topIntent = intentROI.intents[0] || null;

  // Most accurate agent
  const topAgent = accuracy.agents.find(a => a.predictions >= 2) || accuracy.agents[0] || null;

  // Noisiest source
  const noisiest = reliability.sources.find(s => s.noiseRate > 50 && s.escalations >= 3) || null;

  return {
    summary: {
      totalOutcomes: stats.total,
      successRate: stats.total > 0
        ? Math.round(((stats.byResult.SUCCESS || 0) + (stats.byResult.PARTIAL || 0)) / stats.total * 100)
        : 0,
      avgMagnitude: stats.avgMagnitude,
      recentCount: stats.recentCount,
    },
    topIntent,
    topAgent,
    noisiest,
    agentAccuracy: accuracy,
    intentROI,
    sourceReliability: reliability,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args[0] === 'stats') {
  console.log(JSON.stringify(getStats(), null, 2));
} else if (args[0] === 'learning-loop') {
  console.log(JSON.stringify(getLearningLoop(), null, 2));
} else if (args[0] === 'agent-accuracy') {
  console.log(JSON.stringify(getAgentAccuracy(), null, 2));
} else if (args[0] === 'intent-roi') {
  console.log(JSON.stringify(getIntentROI(), null, 2));
}
