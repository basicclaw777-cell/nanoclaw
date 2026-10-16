#!/usr/bin/env node

// ── Global Priority Engine — Budget Allocator for the Cathedral ─────────────
// Every event gets scored on 4 dimensions → total score → BUDGET TIER → resource limits.
// ZERO COST: no LLM calls, no API calls. Pure pattern matching + math.
// ESM (.js = ESM in ~/nanoclaw/).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Budget Tiers ────────────────────────────────────────────────────────────

const BUDGETS = {
  CRITICAL:   { maxLLMCalls: 10, maxAgents: 5, notifyHuman: true,  maxLatencyMs: 30000,   model: 'deepseek' },
  IMPORTANT:  { maxLLMCalls: 3,  maxAgents: 1, notifyHuman: false, maxLatencyMs: 300000,  model: 'deepseek' },
  ROUTINE:    { maxLLMCalls: 1,  maxAgents: 0, notifyHuman: false, maxLatencyMs: 3600000, model: 'hermes3' },
  BACKGROUND: { maxLLMCalls: 0,  maxAgents: 0, notifyHuman: false, maxLatencyMs: null,    model: null },
};

// ── Scoring Patterns (each 0.0–1.0) ────────────────────────────────────────

const URGENCY_PATTERNS = {
  process_down:          1.0,
  security_alert:        1.0,
  api_spend_spike:       0.9,
  vault_corruption:      0.9,
  kill_switch_triggered: 0.85,
  emergence_confirmed:   0.7,
  vault_contradiction:   0.6,
  trade_signal:          0.5,
  research_finding:      0.3,
  content_generated:     0.2,
  style_preference:      0.1,
  daily_report:          0.1,
  agent_dm:              0.1,
  agent_appreciation:    0.05,
  digest:                0.05,
};

const IMPACT_PATTERNS = {
  vault_corruption:          1.0,
  epistemic_feedback_loop:   0.9,
  security_alert:            0.9,
  process_down:              0.8,
  api_spend_spike:           0.8,
  kill_switch_triggered:     0.75,
  new_convergence:           0.7,
  emergence_confirmed:       0.7,
  vault_contradiction:       0.6,
  trade_signal:              0.5,
  research_finding:          0.5,
  content_generated:         0.2,
  agent_dm:                  0.1,
  style_preference:          0.1,
  agent_appreciation:        0.05,
  daily_report:              0.05,
  digest:                    0.05,
};

const CONFIDENCE_PATTERNS = {
  process_down:          1.0,   // measured: PM2 state is fact
  security_alert:        0.9,
  api_spend_spike:       0.9,   // measured: transaction log
  vault_corruption:      0.8,
  trade_signal:          0.5,
  emergence_confirmed:   0.6,
  new_convergence:       0.5,
  research_finding:      0.4,
  vault_contradiction:   0.4,
  content_generated:     0.7,
  agent_dm:              0.3,   // single LLM opinion
  agent_appreciation:    0.3,
  style_preference:      0.5,
  daily_report:          0.9,
  digest:                0.9,
  kill_switch_triggered: 0.95,
};

// ── Source weight modifiers ─────────────────────────────────────────────────
// Trusted sources boost confidence; unknown sources don't reduce it, they just
// don't get the bonus.

const SOURCE_TRUST = {
  timekeeper:    0.1,
  sentinel:      0.1,
  smoke_test:    0.1,
  pm2:           0.1,
  spend_feed:    0.08,
  emergence:     0.05,
  lucy:          0.05,
  archaeologist: 0.0,
  muse:          0.0,
  reed:          0.0,
  maya:          0.0,
  agent:         0.0,
};

// ── Novelty Window (in-memory, rolling 24h) ─────────────────────────────────

const NOVELTY_WINDOW_MS = 24 * 60 * 60 * 1000;
const NOVELTY_DECAY_PER_HIT = 0.5;

// Map<hash, { count, firstSeen, lastSeen }>
const noveltyWindow = new Map();

function eventHash(event) {
  // Coarse hash: type + source. Content is intentionally excluded so that
  // repeated "process_down from timekeeper" collapses but different content
  // under the same type still deduplicates.
  return `${event.type || 'unknown'}::${event.source || 'unknown'}`;
}

function cleanNoveltyWindow() {
  const cutoff = Date.now() - NOVELTY_WINDOW_MS;
  for (const [hash, entry] of noveltyWindow) {
    if (entry.lastSeen < cutoff) noveltyWindow.delete(hash);
  }
}

function getNoveltyScore(event) {
  cleanNoveltyWindow();
  const hash = eventHash(event);
  const entry = noveltyWindow.get(hash);
  if (!entry) return 1.0; // first occurrence = maximum novelty
  const decay = entry.count * NOVELTY_DECAY_PER_HIT;
  return Math.max(0.0, 1.0 - decay);
}

function recordNovelty(event) {
  const hash = eventHash(event);
  const now = Date.now();
  const entry = noveltyWindow.get(hash);
  if (entry) {
    entry.count += 1;
    entry.lastSeen = now;
  } else {
    noveltyWindow.set(hash, { count: 1, firstSeen: now, lastSeen: now });
  }
}

// ── Scoring ─────────────────────────────────────────────────────────────────

function lookupPattern(patterns, type) {
  if (patterns[type] !== undefined) return patterns[type];
  // Fuzzy: check if any pattern key is a substring of the type
  for (const [key, val] of Object.entries(patterns)) {
    if (type.includes(key)) return val;
  }
  return 0.3; // unknown defaults to moderate
}

function scoreDimensions(event) {
  const type = (event.type || 'unknown').toLowerCase();
  const source = (event.source || 'unknown').toLowerCase();

  const urgency    = lookupPattern(URGENCY_PATTERNS, type);
  const impact     = lookupPattern(IMPACT_PATTERNS, type);
  const novelty    = getNoveltyScore(event);

  let confidence   = lookupPattern(CONFIDENCE_PATTERNS, type);
  // Source trust bonus (capped at 1.0)
  confidence = Math.min(1.0, confidence + (SOURCE_TRUST[source] || 0));

  // ── Fifth dimension stub: REVERSIBILITY ──────────────────────────────────
  // TODO: Add reversibility scoring. When implemented:
  // - Low confidence + high impact + low reversibility = FORCE HUMAN REVIEW
  // - reversibility 0.0 = irreversible (delete, external message, spend)
  // - reversibility 1.0 = fully reversible (log entry, vault note)
  // const reversibility = lookupReversibility(type);
  // if (confidence < 0.4 && impact > 0.7 && reversibility < 0.3) {
  //   // Force to CRITICAL tier regardless of score, set notifyHuman = true
  // }

  return { urgency, novelty, impact, confidence };
}

function computeScore(dimensions) {
  // Confidence modifies ROUTING, not priority.
  // Low-confidence + high-impact = exactly what deserves attention.
  // Formula: (Urgency x Impact) + (Novelty x Impact), normalized to 0-1.
  const { urgency, novelty, impact } = dimensions;
  const raw = (urgency * impact) + (novelty * impact);
  return Math.min(1.0, raw); // cap at 1.0
}

function tierFromScore(score) {
  if (score >= 0.7) return 'CRITICAL';
  if (score >= 0.4) return 'IMPORTANT';
  if (score >= 0.15) return 'ROUTINE';
  return 'BACKGROUND';
}

/**
 * Confidence modifies routing WITHIN a tier, not the tier itself.
 * Low confidence + high tier = route to human review (not demotion).
 * High confidence + low tier = stays low (significance, not certainty, drives priority).
 */
function applyConfidenceRouting(tier, budget, dimensions) {
  const routing = { ...budget, confidenceNote: null };
  if (dimensions.confidence < 0.4 && (tier === 'CRITICAL' || tier === 'IMPORTANT')) {
    routing.notifyHuman = true;
    routing.confidenceNote = `Low confidence (${dimensions.confidence.toFixed(2)}) on high-priority event — routed to human review`;
  }
  return routing;
}

// ── Public API ──────────────────────────────────────────────────────────────

export function classify(event) {
  const dimensions = scoreDimensions(event);
  const score = computeScore(dimensions);
  const tier = tierFromScore(score);
  const baseBudget = { ...BUDGETS[tier] };
  const budget = applyConfidenceRouting(tier, baseBudget, dimensions);
  return { score: Math.round(score * 1000) / 1000, tier, budget, dimensions };
}

export function getBudget(tier) {
  return BUDGETS[tier] || BUDGETS.BACKGROUND;
}

export function shouldNotify(classification) {
  return classification.budget.notifyHuman === true;
}

// ── Event Log (JSONL) ───────────────────────────────────────────────────────

const LOG_PATH = path.join(__dirname, 'priority-events.jsonl');

export function trackEvent(event, classification) {
  recordNovelty(event);
  const entry = {
    ts: new Date().toISOString(),
    type: event.type,
    source: event.source,
    tier: classification.tier,
    score: classification.score,
    dimensions: classification.dimensions,
  };
  try {
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
  } catch (e) {
    // Non-blocking — log failure must never crash the caller
    if (process.env.DEBUG) console.error('[priority-engine] log write failed:', e.message);
  }
}

// ── Stats ───────────────────────────────────────────────────────────────────

function readLog() {
  try {
    if (!fs.existsSync(LOG_PATH)) return [];
    return fs.readFileSync(LOG_PATH, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

export function getStats() {
  const entries = readLog();
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  const last24h = entries.filter(e => now - new Date(e.ts).getTime() < day);
  const last7d  = entries.filter(e => now - new Date(e.ts).getTime() < 7 * day);

  function countByTier(list) {
    const counts = { CRITICAL: 0, IMPORTANT: 0, ROUTINE: 0, BACKGROUND: 0 };
    for (const e of list) counts[e.tier] = (counts[e.tier] || 0) + 1;
    return counts;
  }

  function topTypes(list, n = 5) {
    const typeCounts = {};
    for (const e of list) typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
    return Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([type, count]) => ({ type, count }));
  }

  return {
    last24h: { total: last24h.length, byTier: countByTier(last24h), topTypes: topTypes(last24h) },
    last7d:  { total: last7d.length,  byTier: countByTier(last7d),  topTypes: topTypes(last7d) },
    noveltyWindowSize: noveltyWindow.size,
    logEntries: entries.length,
  };
}

// ── Digest (BACKGROUND events aggregated) ───────────────────────────────────

export function getDigest(periodHours = 24) {
  const entries = readLog();
  const cutoff = Date.now() - periodHours * 60 * 60 * 1000;
  const recent = entries.filter(e =>
    e.tier === 'BACKGROUND' && new Date(e.ts).getTime() > cutoff
  );

  // Group by type
  const groups = {};
  for (const e of recent) {
    if (!groups[e.type]) groups[e.type] = { count: 0, sources: new Set() };
    groups[e.type].count += 1;
    groups[e.type].sources.add(e.source);
  }

  const summary = Object.entries(groups).map(([type, data]) => ({
    type,
    count: data.count,
    sources: [...data.sources],
  }));

  return {
    period: `${periodHours}h`,
    totalBackground: recent.length,
    groups: summary.sort((a, b) => b.count - a.count),
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  const cmd = process.argv[2];

  if (cmd === 'classify') {
    const raw = process.argv[3];
    if (!raw) {
      console.error('Usage: node priority-engine.js classify \'{"type":"...","source":"...","content":"..."}\'');
      process.exit(1);
    }
    try {
      const event = JSON.parse(raw);
      const result = classify(event);
      trackEvent(event, result);
      console.log(JSON.stringify(result, null, 2));
    } catch (e) {
      console.error('Invalid JSON:', e.message);
      process.exit(1);
    }
  } else if (cmd === 'stats') {
    console.log(JSON.stringify(getStats(), null, 2));
  } else if (cmd === 'digest') {
    const hours = parseInt(process.argv[3]) || 24;
    console.log(JSON.stringify(getDigest(hours), null, 2));
  } else {
    console.log('Global Priority Engine — Budget Allocator');
    console.log('');
    console.log('Usage:');
    console.log('  node priority-engine.js classify \'{"type":"process_down","source":"timekeeper","content":"..."}\'');
    console.log('  node priority-engine.js stats');
    console.log('  node priority-engine.js digest [hours]');
  }
}
