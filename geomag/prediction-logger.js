/**
 * prediction-logger.js — SQLite storage for geomagnetic predictions + outcomes
 *
 * Tables:
 *   geomag_predictions — every prediction from every strategy
 *   geomag_outcomes — actual Dst values at prediction horizons
 *   geomag_leaderboard — per-strategy accuracy stats (materialized)
 *
 * ESM. Uses better-sqlite3.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'vortex_data', 'metrics.db');

let db;
function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initTables();
  }
  return db;
}

function initTables() {
  const d = getDb();

  d.exec(`
    CREATE TABLE IF NOT EXISTS geomag_predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      strategy_id TEXT NOT NULL,
      strategy_name TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      current_dst REAL,
      predicted_h6 REAL,
      predicted_h12 REAL,
      predicted_h24 REAL,
      confidence REAL,
      reasoning TEXT,
      philosophy TEXT,
      extra_data TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS geomag_outcomes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      target_time TEXT NOT NULL,
      horizon TEXT NOT NULL,
      actual_dst REAL,
      recorded_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_geomag_pred_run ON geomag_predictions(run_id);
    CREATE INDEX IF NOT EXISTS idx_geomag_pred_strategy ON geomag_predictions(strategy_id);
    CREATE INDEX IF NOT EXISTS idx_geomag_outcome_run ON geomag_outcomes(run_id);
  `);
}

export function logPrediction(runId, prediction) {
  const d = getDb();
  const stmt = d.prepare(`
    INSERT INTO geomag_predictions
      (run_id, strategy_id, strategy_name, timestamp, current_dst,
       predicted_h6, predicted_h12, predicted_h24,
       confidence, reasoning, philosophy, extra_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    runId,
    prediction.strategyId,
    prediction.strategy,
    new Date().toISOString(),
    prediction.currentDst,
    prediction.predictions.h6,
    prediction.predictions.h12,
    prediction.predictions.h24,
    prediction.confidence,
    prediction.reasoning,
    prediction.philosophy,
    JSON.stringify(prediction.tidalData || prediction.resonanceFactor || null),
  );
}

export function logOutcome(runId, horizon, targetTime, actualDst) {
  const d = getDb();
  d.prepare(`
    INSERT INTO geomag_outcomes (run_id, target_time, horizon, actual_dst)
    VALUES (?, ?, ?, ?)
  `).run(runId, targetTime, horizon, actualDst);
}

export function scorePredictions(runId, horizon, actualDst) {
  const d = getDb();
  const predictions = d.prepare(`
    SELECT strategy_id, strategy_name,
      CASE ?
        WHEN 'h6' THEN predicted_h6
        WHEN 'h12' THEN predicted_h12
        WHEN 'h24' THEN predicted_h24
      END as predicted,
      confidence
    FROM geomag_predictions WHERE run_id = ?
  `).all(horizon, runId);

  return predictions.map(p => ({
    strategy: p.strategy_name,
    strategyId: p.strategy_id,
    predicted: p.predicted,
    actual: actualDst,
    error: Math.abs(p.predicted - actualDst),
    confidence: p.confidence,
    // Weighted score: lower error × higher confidence = better
    score: p.confidence / (1 + Math.abs(p.predicted - actualDst) / 10),
  })).sort((a, b) => b.score - a.score);
}

export function getLeaderboard(days = 30) {
  const d = getDb();
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();

  const rows = d.prepare(`
    SELECT
      p.strategy_id,
      p.strategy_name,
      COUNT(*) as total_predictions,
      AVG(ABS(p.predicted_h6 - o.actual_dst)) as avg_error_h6,
      AVG(ABS(p.predicted_h12 - o2.actual_dst)) as avg_error_h12,
      AVG(ABS(p.predicted_h24 - o3.actual_dst)) as avg_error_h24,
      AVG(p.confidence) as avg_confidence
    FROM geomag_predictions p
    LEFT JOIN geomag_outcomes o ON o.run_id = p.run_id AND o.horizon = 'h6'
    LEFT JOIN geomag_outcomes o2 ON o2.run_id = p.run_id AND o2.horizon = 'h12'
    LEFT JOIN geomag_outcomes o3 ON o3.run_id = p.run_id AND o3.horizon = 'h24'
    WHERE p.created_at > ?
    GROUP BY p.strategy_id
    ORDER BY avg_error_h6 ASC
  `).all(cutoff);

  return rows;
}

export function getRecentPredictions(limit = 20) {
  const d = getDb();
  return d.prepare(`
    SELECT * FROM geomag_predictions
    ORDER BY created_at DESC LIMIT ?
  `).all(limit);
}

export function getPendingOutcomes() {
  const d = getDb();
  // Find runs that have predictions but missing outcomes
  return d.prepare(`
    SELECT DISTINCT p.run_id, p.timestamp,
      MAX(p.predicted_h6) as any_h6,
      MAX(p.predicted_h12) as any_h12,
      MAX(p.predicted_h24) as any_h24
    FROM geomag_predictions p
    LEFT JOIN geomag_outcomes o ON o.run_id = p.run_id
    WHERE o.id IS NULL
    AND p.created_at > datetime('now', '-48 hours')
    GROUP BY p.run_id
    ORDER BY p.timestamp DESC
  `).all();
}
