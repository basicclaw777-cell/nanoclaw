// attention-ledger.js — Outcome-based feedback on attention/priority decisions.
// ESM module. SQLite via better-sqlite3.
//
// Tracks every event the priority engine classifies, then allows outcome review.
// Pure SQL aggregation for learnings — no LLM calls anywhere.

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
CREATE TABLE IF NOT EXISTS attention_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  source TEXT,
  priority_tier TEXT,
  attention_cost TEXT,
  content TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  outcome TEXT DEFAULT NULL,
  outcome_notes TEXT DEFAULT NULL,
  reviewed_at TEXT DEFAULT NULL,
  review_source TEXT DEFAULT NULL
)
`);

// ── ID generator ─────────────────────────────────────────────────────────────

const stmtMaxId = db.prepare(`
  SELECT id FROM attention_events
  WHERE id LIKE 'ATT-%'
  ORDER BY id DESC LIMIT 1
`);

function nextId() {
  const row = stmtMaxId.get();
  if (!row) return 'ATT-000001';
  const num = parseInt(row.id.replace('ATT-', ''), 10);
  return `ATT-${String(num + 1).padStart(6, '0')}`;
}

// ── Prepared statements ──────────────────────────────────────────────────────

const stmtInsert = db.prepare(`
  INSERT INTO attention_events (id, event_type, source, priority_tier, attention_cost, content)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const stmtReview = db.prepare(`
  UPDATE attention_events
  SET outcome = ?, outcome_notes = ?, reviewed_at = datetime('now'), review_source = ?
  WHERE id = ?
`);

const stmtGetById = db.prepare(`SELECT * FROM attention_events WHERE id = ?`);

const stmtUnreviewed = db.prepare(`
  SELECT * FROM attention_events
  WHERE outcome IS NULL
  ORDER BY created_at DESC
  LIMIT ?
`);

// ── Core functions ───────────────────────────────────────────────────────────

export function registerEvent(type, source, tier, content, costJson) {
  const id = nextId();
  const costStr = typeof costJson === 'string' ? costJson : JSON.stringify(costJson || {});
  const truncContent = (content || '').slice(0, 500);
  stmtInsert.run(id, type, source || null, tier || null, costStr, truncContent);
  return stmtGetById.get(id);
}

export function reviewEvent(id, outcome, notes, reviewSource) {
  const VALID_OUTCOMES = ['HIGH_VALUE', 'USEFUL', 'NEUTRAL', 'NOISE', 'HARMFUL'];
  if (!VALID_OUTCOMES.includes(outcome)) {
    return { error: `Invalid outcome. Must be one of: ${VALID_OUTCOMES.join(', ')}` };
  }
  const existing = stmtGetById.get(id);
  if (!existing) return { error: 'Event not found' };
  stmtReview.run(outcome, notes || null, reviewSource || 'paul', id);
  return stmtGetById.get(id);
}

export function getUnreviewed(limit = 20) {
  return stmtUnreviewed.all(limit);
}

export function getStats() {
  const total = db.prepare(`SELECT COUNT(*) as count FROM attention_events`).get().count;
  const reviewed = db.prepare(`SELECT COUNT(*) as count FROM attention_events WHERE outcome IS NOT NULL`).get().count;
  const unreviewed = total - reviewed;

  const byTierRows = db.prepare(`
    SELECT priority_tier, COUNT(*) as count FROM attention_events
    WHERE priority_tier IS NOT NULL
    GROUP BY priority_tier
  `).all();
  const byTier = Object.fromEntries(byTierRows.map(r => [r.priority_tier, r.count]));

  const byOutcomeRows = db.prepare(`
    SELECT outcome, COUNT(*) as count FROM attention_events
    WHERE outcome IS NOT NULL
    GROUP BY outcome
  `).all();
  const byOutcome = Object.fromEntries(byOutcomeRows.map(r => [r.outcome, r.count]));

  // Accuracy: for each tier, how many are correct vs over/under-escalated
  // CRITICAL should be HIGH_VALUE or USEFUL; BACKGROUND should be NEUTRAL or NOISE
  const accuracyRows = db.prepare(`
    SELECT priority_tier, outcome, COUNT(*) as count
    FROM attention_events
    WHERE outcome IS NOT NULL AND priority_tier IS NOT NULL
    GROUP BY priority_tier, outcome
  `).all();

  const accuracy = {};
  const TIER_RANK = { CRITICAL: 3, IMPORTANT: 2, ROUTINE: 1, BACKGROUND: 0 };
  const OUTCOME_RANK = { HIGH_VALUE: 3, USEFUL: 2, NEUTRAL: 1, NOISE: 0, HARMFUL: -1 };

  for (const row of accuracyRows) {
    if (!accuracy[row.priority_tier]) {
      accuracy[row.priority_tier] = { correct: 0, overEscalated: 0, underEscalated: 0 };
    }
    const tierR = TIER_RANK[row.priority_tier] ?? 1;
    const outcomeR = OUTCOME_RANK[row.outcome] ?? 1;
    const diff = tierR - outcomeR;

    if (Math.abs(diff) <= 1) {
      accuracy[row.priority_tier].correct += row.count;
    } else if (diff > 1) {
      accuracy[row.priority_tier].overEscalated += row.count;
    } else {
      accuracy[row.priority_tier].underEscalated += row.count;
    }
  }

  return { total, reviewed, unreviewed, byTier, byOutcome, accuracy };
}

export function getLearnings() {
  // Group by (source, priority_tier) → outcome distribution
  const rows = db.prepare(`
    SELECT source, priority_tier, outcome, COUNT(*) as count
    FROM attention_events
    WHERE outcome IS NOT NULL AND source IS NOT NULL AND priority_tier IS NOT NULL
    GROUP BY source, priority_tier, outcome
    ORDER BY source, priority_tier, count DESC
  `).all();

  // Build per-source-tier aggregation
  const agg = {};
  for (const row of rows) {
    const key = `${row.source}|${row.priority_tier}`;
    if (!agg[key]) {
      agg[key] = { source: row.source, tier: row.priority_tier, total: 0, outcomes: {} };
    }
    agg[key].total += row.count;
    agg[key].outcomes[row.outcome] = row.count;
  }

  const recommendations = [];
  for (const [, entry] of Object.entries(agg)) {
    if (entry.total < 3) continue; // Need minimum sample

    const noiseCount = (entry.outcomes.NOISE || 0) + (entry.outcomes.HARMFUL || 0);
    const noiseRate = noiseCount / entry.total;

    const highValueCount = (entry.outcomes.HIGH_VALUE || 0) + (entry.outcomes.USEFUL || 0);
    const highValueRate = highValueCount / entry.total;

    if (noiseRate > 0.5) {
      recommendations.push({
        type: 'DOWNGRADE',
        source: entry.source,
        currentTier: entry.tier,
        reason: `${Math.round(noiseRate * 100)}% of ${entry.tier} events from "${entry.source}" are NOISE/HARMFUL (${noiseCount}/${entry.total})`,
        suggestion: `Consider downgrading "${entry.source}" events from ${entry.tier}`
      });
    }

    if (entry.tier === 'BACKGROUND' || entry.tier === 'ROUTINE') {
      if (highValueRate > 0.5 && entry.total >= 3) {
        recommendations.push({
          type: 'UPGRADE',
          source: entry.source,
          currentTier: entry.tier,
          reason: `${Math.round(highValueRate * 100)}% of ${entry.tier} events from "${entry.source}" are HIGH_VALUE/USEFUL (${highValueCount}/${entry.total})`,
          suggestion: `Consider upgrading "${entry.source}" events from ${entry.tier}`
        });
      }
    }
  }

  // Top sources by volume
  const topSourcesRows = db.prepare(`
    SELECT source, COUNT(*) as count FROM attention_events
    WHERE source IS NOT NULL
    GROUP BY source ORDER BY count DESC LIMIT 10
  `).all();

  return {
    sourceTierBreakdown: Object.values(agg),
    recommendations,
    topSources: topSourcesRows,
    totalReviewed: db.prepare(`SELECT COUNT(*) as c FROM attention_events WHERE outcome IS NOT NULL`).get().c
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args[0] === 'stats') {
  console.log(JSON.stringify(getStats(), null, 2));
} else if (args[0] === 'unreviewed') {
  console.log(JSON.stringify(getUnreviewed(parseInt(args[1]) || 20), null, 2));
} else if (args[0] === 'learnings') {
  console.log(JSON.stringify(getLearnings(), null, 2));
}
