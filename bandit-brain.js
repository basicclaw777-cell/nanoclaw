/**
 * Bandit Brain — Thompson Sampling with Swarm Mitigations
 *
 * Self-improving action selection for Cathedral agents.
 * Composes with Linda tuple space for cross-agent learning.
 *
 * Mitigations (from DeepSeek failure mode analysis):
 *   1. Temporal decay — old feedback fades via exp(-Δt/τ)
 *   2. Two-source confirmation — untrusted outcomes need corroboration
 *   3. Trusted agent list — Cathy, Sage Court, self bypass confirmation
 *
 * Each agent gets its own bandit. Actions are arbitrary strings.
 * State persists in SQLite.
 */

import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const DB_DIR = process.env.BANDIT_DB_DIR || join(process.env.HOME, 'nanoclaw', 'vortex_data');
const DB_PATH = join(DB_DIR, 'bandit-brain.db');
const TAU_MS = 7 * 24 * 60 * 60 * 1000; // 7-day decay half-life

// Trusted agents bypass two-source confirmation
const TRUSTED_AGENTS = new Set(
  (process.env.BANDIT_TRUSTED_AGENTS || 'cathy,sage,archaeologist,prospector,forge').split(',')
);

// Ensure DB directory exists
if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS arms (
    agent_id TEXT NOT NULL,
    action TEXT NOT NULL,
    alpha REAL NOT NULL DEFAULT 1.0,
    beta REAL NOT NULL DEFAULT 1.0,
    total_updates INTEGER NOT NULL DEFAULT 0,
    last_updated INTEGER,
    PRIMARY KEY (agent_id, action)
  );

  CREATE TABLE IF NOT EXISTS outcomes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    action TEXT NOT NULL,
    success INTEGER NOT NULL,
    source_agent TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    applied INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS pending_outcomes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    action TEXT NOT NULL,
    success INTEGER NOT NULL,
    source_agent TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    expires INTEGER NOT NULL
  );
`);

// Prepared statements
const getArm = db.prepare('SELECT * FROM arms WHERE agent_id = ? AND action = ?');
const upsertArm = db.prepare(`
  INSERT INTO arms (agent_id, action, alpha, beta, total_updates, last_updated)
  VALUES (?, ?, ?, ?, 1, ?)
  ON CONFLICT(agent_id, action) DO UPDATE SET
    alpha = excluded.alpha,
    beta = excluded.beta,
    total_updates = total_updates + 1,
    last_updated = excluded.last_updated
`);
const ensureArm = db.prepare(`
  INSERT OR IGNORE INTO arms (agent_id, action) VALUES (?, ?)
`);
const getAllArms = db.prepare('SELECT * FROM arms WHERE agent_id = ?');
const insertOutcome = db.prepare(`
  INSERT INTO outcomes (agent_id, action, success, source_agent, timestamp, applied)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const insertPending = db.prepare(`
  INSERT INTO pending_outcomes (agent_id, action, success, source_agent, timestamp, expires)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const findCorroborating = db.prepare(`
  SELECT * FROM pending_outcomes
  WHERE agent_id = ? AND action = ? AND success = ? AND source_agent != ? AND expires > ?
`);
const deletePending = db.prepare('DELETE FROM pending_outcomes WHERE id = ?');
const cleanExpired = db.prepare('DELETE FROM pending_outcomes WHERE expires < ?');

/**
 * Sample from Beta distribution using Jinks' method (fast, no dependencies)
 */
function sampleBeta(alpha, beta) {
  // Use gamma sampling: Beta(a,b) = Gamma(a,1) / (Gamma(a,1) + Gamma(b,1))
  const x = sampleGamma(alpha);
  const y = sampleGamma(beta);
  return x / (x + y);
}

function sampleGamma(shape) {
  // Marsaglia and Tsang's method
  if (shape < 1) {
    return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x, v;
    do {
      x = randn();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function randn() {
  // Box-Muller
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Temporal decay weight: recent feedback counts more
 */
function decayWeight(outcomeTimestamp) {
  const age = Date.now() - outcomeTimestamp;
  return Math.exp(-age / TAU_MS);
}

// ═══════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════

/**
 * Choose an action via Thompson sampling
 * @param {string} agentId - the agent choosing
 * @param {string[]} actions - possible actions
 * @returns {{ action: string, sample: number, arms: Object[] }}
 */
export function chooseAction(agentId, actions) {
  // Ensure all actions have arms
  for (const action of actions) {
    ensureArm.run(agentId, action);
  }

  // Clean expired pending outcomes
  cleanExpired.run(Date.now());

  const arms = getAllArms.all(agentId).filter(a => actions.includes(a.action));
  let best = null;
  let bestSample = -1;
  const samples = [];

  for (const arm of arms) {
    const sample = sampleBeta(arm.alpha, arm.beta);
    samples.push({ action: arm.action, sample: sample.toFixed(4), alpha: arm.alpha, beta: arm.beta, updates: arm.total_updates });
    if (sample > bestSample) {
      bestSample = sample;
      best = arm.action;
    }
  }

  return { action: best, sample: bestSample, arms: samples };
}

/**
 * Record an outcome — applies confirmation gating
 * @param {string} agentId - the agent whose bandit updates
 * @param {string} action - which action was taken
 * @param {boolean} success - did it work?
 * @param {string} sourceAgent - who reported the outcome
 * @param {number} [timestamp] - when the outcome occurred (default: now)
 * @returns {{ applied: boolean, reason: string }}
 */
export function recordOutcome(agentId, action, success, sourceAgent = 'self', timestamp = Date.now()) {
  const successInt = success ? 1 : 0;

  // Trusted agents bypass confirmation
  if (TRUSTED_AGENTS.has(sourceAgent) || sourceAgent === agentId) {
    applyOutcome(agentId, action, successInt, sourceAgent, timestamp);
    return { applied: true, reason: 'trusted_source' };
  }

  // Check for corroborating pending outcome
  const corroboration = findCorroborating.get(agentId, action, successInt, sourceAgent, Date.now());

  if (corroboration) {
    // Two sources agree — apply both
    applyOutcome(agentId, action, successInt, sourceAgent, timestamp);
    applyOutcome(agentId, action, corroboration.success, corroboration.source_agent, corroboration.timestamp);
    deletePending.run(corroboration.id);
    return { applied: true, reason: 'two_source_confirmed' };
  }

  // No corroboration yet — park it
  const expires = Date.now() + 24 * 60 * 60 * 1000; // 24h window
  insertPending.run(agentId, action, successInt, sourceAgent, timestamp, expires);
  return { applied: false, reason: 'awaiting_corroboration' };
}

/**
 * Internal: apply a confirmed outcome to the bandit
 */
function applyOutcome(agentId, action, success, sourceAgent, timestamp) {
  const weight = decayWeight(timestamp);
  const arm = getArm.get(agentId, action);
  const alpha = (arm?.alpha || 1) + (success ? weight : 0);
  const beta = (arm?.beta || 1) + (success ? 0 : weight);

  upsertArm.run(agentId, action, alpha, beta, timestamp);
  insertOutcome.run(agentId, action, success, sourceAgent, timestamp, 1);
}

/**
 * Get current state of all arms for an agent
 */
export function getState(agentId) {
  return getAllArms.all(agentId);
}

/**
 * Get pending (unconfirmed) outcomes
 */
export function getPending(agentId) {
  return db.prepare('SELECT * FROM pending_outcomes WHERE agent_id = ?').all(agentId);
}

/**
 * Reset an agent's bandit (for testing)
 */
export function reset(agentId) {
  db.prepare('DELETE FROM arms WHERE agent_id = ?').run(agentId);
  db.prepare('DELETE FROM outcomes WHERE agent_id = ?').run(agentId);
  db.prepare('DELETE FROM pending_outcomes WHERE agent_id = ?').run(agentId);
}

/**
 * Add a trusted agent at runtime
 */
export function addTrusted(agentId) {
  TRUSTED_AGENTS.add(agentId);
}

/**
 * Close database connection
 */
export function close() {
  db.close();
}

export default { chooseAction, recordOutcome, getState, getPending, reset, addTrusted, close };
