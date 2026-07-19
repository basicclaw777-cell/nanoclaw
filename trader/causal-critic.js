/**
 * causal-critic.js — Process Quality Scorer (Causal Decoupling)
 *
 * Scores trading decisions on LOGIC quality, not P&L outcome.
 * Three metrics: Calibration, Action Quality Delta, Ex-Ante Edge Score.
 * Replaces raw P&L as the feedback signal for strategy evaluation.
 *
 * Architecture from: cathedral-vault/02_Refined_Gold/cathedral/agent-governance-4-pillars.md
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'logs', 'trades.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS process_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trade_id INTEGER NOT NULL,
        scored_at TEXT DEFAULT (datetime('now')),
        calibration_score REAL,
        aqd_score REAL,
        ees_score REAL,
        process_score REAL,
        exemption_flag INTEGER DEFAULT 0,
        exemption_reason TEXT,
        baseline_expected REAL,
        baseline_std REAL,
        market_beta REAL,
        notes TEXT,
        FOREIGN KEY (trade_id) REFERENCES trades(id)
      );

      CREATE TABLE IF NOT EXISTS reference_class (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset TEXT NOT NULL,
        regime TEXT,
        vol_bucket TEXT,
        direction TEXT,
        mean_return REAL,
        std_return REAL,
        win_rate REAL,
        sample_size INTEGER,
        last_updated TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_ps_trade ON process_scores(trade_id);
      CREATE INDEX IF NOT EXISTS idx_rc_asset ON reference_class(asset, regime, direction);
    `);
  }
  return db;
}

/**
 * Build reference class from historical trades.
 * Groups by asset + regime + direction → computes baseline stats.
 */
function buildReferenceClass() {
  const db = getDb();

  const closed = db.prepare(`
    SELECT asset, direction, pnl_pct, strategy, reasoning
    FROM trades WHERE status = 'closed' AND pnl_pct IS NOT NULL
  `).all();

  if (closed.length < 10) return { built: false, reason: 'Need 10+ closed trades' };

  const groups = {};
  for (const t of closed) {
    const key = `${t.asset}|${t.direction}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(t.pnl_pct);
  }

  const upsert = db.prepare(`
    INSERT OR REPLACE INTO reference_class (asset, regime, direction, mean_return, std_return, win_rate, sample_size, last_updated)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  let count = 0;
  for (const [key, returns] of Object.entries(groups)) {
    if (returns.length < 3) continue;
    const [asset, direction] = key.split('|');
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const std = Math.sqrt(returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length) || 0.01;
    const winRate = returns.filter(r => r > 0).length / returns.length;

    upsert.run(asset, 'ALL', direction, mean, std, winRate, returns.length);
    count++;
  }

  return { built: true, groups: count, totalTrades: closed.length };
}

/**
 * Get baseline for a specific trade context.
 */
function getBaseline(asset, direction) {
  const db = getDb();
  const row = db.prepare(`
    SELECT mean_return, std_return, win_rate, sample_size
    FROM reference_class WHERE asset = ? AND direction = ?
    ORDER BY last_updated DESC LIMIT 1
  `).get(asset, direction);

  if (!row) {
    const global = db.prepare(`
      SELECT AVG(pnl_pct) as mean_return,
             CASE WHEN COUNT(*) > 1
               THEN SQRT(SUM((pnl_pct - (SELECT AVG(pnl_pct) FROM trades WHERE status='closed')) * (pnl_pct - (SELECT AVG(pnl_pct) FROM trades WHERE status='closed'))) / COUNT(*))
               ELSE 0.01 END as std_return,
             CAST(SUM(CASE WHEN pnl_pct > 0 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) as win_rate,
             COUNT(*) as sample_size
      FROM trades WHERE status = 'closed' AND pnl_pct IS NOT NULL
    `).get();
    return global || { mean_return: 0, std_return: 3, win_rate: 0.5, sample_size: 0 };
  }
  return row;
}

/**
 * Compute Calibration Score (Brier Skill Score).
 * Measures: did the agent's implied confidence match reality?
 *
 * For trading: if strategy predicted BUY (implied p_up high),
 * calibration = how well that confidence mapped to actual direction.
 */
function computeCalibration(trade, baseline) {
  const outcome = trade.pnl_pct > 0 ? 1 : 0;
  const agentConfidence = trade.direction === 'LONG' ? 0.65 : 0.35;
  const baselineConfidence = baseline.win_rate || 0.5;

  const bsAgent = (agentConfidence - outcome) ** 2;
  const bsBaseline = (baselineConfidence - outcome) ** 2;

  if (bsBaseline === 0) return 0;
  const score = 1 - (bsAgent / bsBaseline);
  return Math.max(-1, Math.min(1, score));
}

/**
 * Compute Action Quality Delta.
 * Measures: did this action outperform the baseline for this state?
 */
function computeAQD(trade, baseline) {
  const realized = trade.pnl_pct || 0;
  const expected = baseline.mean_return || 0;
  const std = baseline.std_return || 3;

  const raw = (realized - expected) / std;
  return Math.tanh(Math.max(-3, Math.min(3, raw)));
}

/**
 * Compute Ex-Ante Edge Score.
 * Was the expected value positive BEFORE the outcome?
 *
 * Uses risk:reward ratio from the trade setup.
 */
function computeEES(trade, baseline) {
  const tp = trade.take_profit;
  const sl = trade.stop_loss;
  const entry = trade.entry_price;

  if (!tp || !sl || !entry) return 0;

  let expectedGain, expectedLoss;
  if (trade.direction === 'LONG') {
    expectedGain = (tp - entry) / entry;
    expectedLoss = (entry - sl) / entry;
  } else {
    expectedGain = (entry - tp) / entry;
    expectedLoss = (sl - entry) / entry;
  }

  const winRate = baseline.win_rate || 0.5;
  const agentEV = (winRate * expectedGain) - ((1 - winRate) * expectedLoss);
  const marketEV = baseline.mean_return / 100 || 0;
  const edge = agentEV - marketEV;
  const std = baseline.std_return / 100 || 0.03;

  return Math.tanh(edge / std);
}

/**
 * Check for Black Swan Exemption.
 * If market moved > 3σ from baseline, exempt from outcome scoring.
 */
function checkExemption(trade, baseline) {
  const realized = Math.abs(trade.pnl_pct || 0);
  const std = baseline.std_return || 3;

  if (realized > 3 * std) {
    return { exempt: true, reason: `Move ${realized.toFixed(1)}% > 3σ (${(3 * std).toFixed(1)}%)` };
  }
  return { exempt: false };
}

/**
 * Score a single closed trade.
 * Returns the full Process Score breakdown.
 */
function scoreTrade(tradeId) {
  const db = getDb();
  const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(tradeId);
  if (!trade) return { error: 'Trade not found' };
  if (trade.status !== 'closed') return { error: 'Trade still open' };

  const baseline = getBaseline(trade.asset, trade.direction);
  const exemption = checkExemption(trade, baseline);

  const calibration = computeCalibration(trade, baseline);
  const aqd = computeAQD(trade, baseline);
  const ees = computeEES(trade, baseline);

  let processScore;
  if (ees < -0.5) {
    processScore = -1.0;
  } else if (exemption.exempt) {
    processScore = calibration;
  } else {
    processScore = (0.4 * calibration) + (0.3 * aqd) + (0.3 * ees);
  }

  const result = {
    trade_id: tradeId,
    calibration_score: Math.round(calibration * 1000) / 1000,
    aqd_score: Math.round(aqd * 1000) / 1000,
    ees_score: Math.round(ees * 1000) / 1000,
    process_score: Math.round(processScore * 1000) / 1000,
    exemption_flag: exemption.exempt ? 1 : 0,
    exemption_reason: exemption.reason || null,
    baseline_expected: baseline.mean_return,
    baseline_std: baseline.std_return,
    market_beta: null
  };

  db.prepare(`
    INSERT INTO process_scores (trade_id, calibration_score, aqd_score, ees_score, process_score, exemption_flag, exemption_reason, baseline_expected, baseline_std)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(result.trade_id, result.calibration_score, result.aqd_score, result.ees_score, result.process_score, result.exemption_flag, result.exemption_reason, result.baseline_expected, result.baseline_std);

  return result;
}

/**
 * Score all unscored closed trades.
 */
function scoreAll() {
  const db = getDb();

  buildReferenceClass();

  const unscored = db.prepare(`
    SELECT t.id FROM trades t
    LEFT JOIN process_scores ps ON ps.trade_id = t.id
    WHERE t.status = 'closed' AND t.pnl_pct IS NOT NULL AND ps.id IS NULL
  `).all();

  const results = [];
  for (const { id } of unscored) {
    results.push(scoreTrade(id));
  }
  return results;
}

/**
 * Get rolling Process Score for a strategy.
 * Used by Corner organ for strategy evaluation.
 */
function getStrategyProcessScore(strategy, window = 20) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT ps.process_score FROM process_scores ps
    JOIN trades t ON t.id = ps.trade_id
    WHERE t.strategy = ?
    ORDER BY ps.scored_at DESC LIMIT ?
  `).all(strategy, window);

  if (rows.length < 3) return { score: null, count: rows.length, sufficient: false };

  const scores = rows.map(r => r.process_score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  return {
    score: Math.round(mean * 1000) / 1000,
    count: scores.length,
    sufficient: rows.length >= 10,
    trend: scores.length >= 5 ?
      (scores.slice(0, 3).reduce((a, b) => a + b, 0) / 3) - (scores.slice(-3).reduce((a, b) => a + b, 0) / 3) : null
  };
}

/**
 * Strategy leaderboard by Process Score (not P&L).
 */
function processLeaderboard() {
  const db = getDb();
  const strategies = db.prepare(`
    SELECT DISTINCT strategy FROM trades WHERE status = 'closed'
  `).all();

  const board = [];
  for (const { strategy } of strategies) {
    const ps = getStrategyProcessScore(strategy);
    const pnl = db.prepare(`
      SELECT SUM(pnl) as total_pnl, COUNT(*) as trades
      FROM trades WHERE strategy = ? AND status = 'closed'
    `).get(strategy);

    board.push({
      strategy,
      process_score: ps.score,
      sample_size: ps.count,
      sufficient: ps.sufficient,
      trend: ps.trend,
      total_pnl: pnl?.total_pnl || 0,
      trade_count: pnl?.trades || 0
    });
  }

  return board.sort((a, b) => (b.process_score || -2) - (a.process_score || -2));
}

export {
  buildReferenceClass,
  scoreTrade,
  scoreAll,
  getStrategyProcessScore,
  processLeaderboard,
  getBaseline,
  computeCalibration,
  computeAQD,
  computeEES,
  checkExemption
};
