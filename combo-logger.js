/**
 * combo-logger.js — SQLite logging for combination validator
 *
 * Logs every validation to metrics.db for analysis over time.
 * Tracks what Paul tests, what passes, what fails, patterns of exploration.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'vortex_data', 'metrics.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS combo_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT (datetime('now')),
        type TEXT NOT NULL,
        sequence TEXT NOT NULL,
        valid INTEGER NOT NULL,
        weight_trace TEXT,
        combo_type TEXT,
        failure_position INTEGER,
        failure_reason TEXT,
        source TEXT DEFAULT 'telegram'
      );

      CREATE INDEX IF NOT EXISTS idx_combo_log_type ON combo_log(type);
      CREATE INDEX IF NOT EXISTS idx_combo_log_valid ON combo_log(valid);
      CREATE INDEX IF NOT EXISTS idx_combo_log_timestamp ON combo_log(timestamp);
    `);
  }
  return db;
}

/**
 * Log a punch combo validation result.
 */
export function logPunchCombo(result, source = 'telegram') {
  const d = getDb();
  const firstFail = result.transitions?.find(t => t.verdict === 'INVALID');
  d.prepare(`
    INSERT INTO combo_log (type, sequence, valid, weight_trace, combo_type, failure_position, failure_reason, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'punch',
    JSON.stringify(result.sequence),
    result.valid ? 1 : 0,
    result.weightTrace ? JSON.stringify(result.weightTrace) : null,
    result.comboType || null,
    firstFail?.position || null,
    firstFail?.reason || null,
    source,
  );
}

/**
 * Log a defense chain validation result.
 */
export function logDefenseChain(result, source = 'telegram') {
  const d = getDb();
  const firstWeak = result.transitions?.find(t => t.verdict === 'WEAK' || t.verdict === 'INVALID');
  d.prepare(`
    INSERT INTO combo_log (type, sequence, valid, weight_trace, combo_type, failure_position, failure_reason, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'defense',
    JSON.stringify(result.sequence),
    result.valid ? 1 : 0,
    result.axisTrace ? JSON.stringify(result.axisTrace) : null,
    null,
    firstWeak?.position || null,
    firstWeak?.reason || null,
    source,
  );
}

/**
 * Log a footwork chain validation result.
 */
export function logFootworkChain(result, source = 'telegram') {
  const d = getDb();
  const firstFail = result.transitions?.find(t => t.verdict === 'INVALID');
  d.prepare(`
    INSERT INTO combo_log (type, sequence, valid, weight_trace, combo_type, failure_position, failure_reason, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'footwork',
    JSON.stringify(result.sequence),
    result.valid ? 1 : 0,
    null,
    result.comboType || null,
    firstFail?.position || null,
    firstFail?.reason || null,
    source,
  );
}

/**
 * Log an integrated sequence validation result.
 */
export function logIntegratedSequence(result, source = 'telegram') {
  const d = getDb();
  d.prepare(`
    INSERT INTO combo_log (type, sequence, valid, weight_trace, combo_type, failure_position, failure_reason, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'integrated',
    JSON.stringify({ defense: result.defense, combination: result.combination?.sequence }),
    result.integrated ? 1 : 0,
    result.combination?.weightTrace ? JSON.stringify(result.combination.weightTrace) : null,
    null,
    null,
    !result.integrated ? (result.defense?.reason || 'Chain broken') : null,
    source,
  );
}

// ── Analytics queries ────────────────────────────────────────────────────────

/**
 * Get summary stats for combo validations.
 */
export function getComboStats(days = 30) {
  const d = getDb();
  return d.prepare(`
    SELECT
      type,
      COUNT(*) as total,
      SUM(valid) as valid_count,
      COUNT(*) - SUM(valid) as invalid_count,
      ROUND(100.0 * SUM(valid) / COUNT(*), 1) as pass_rate
    FROM combo_log
    WHERE timestamp > datetime('now', '-' || ? || ' days')
    GROUP BY type
    ORDER BY total DESC
  `).all(days);
}

/**
 * Get most tested combinations.
 */
export function getMostTested(limit = 10) {
  const d = getDb();
  return d.prepare(`
    SELECT sequence, type, COUNT(*) as times_tested, SUM(valid) as times_valid
    FROM combo_log
    GROUP BY sequence, type
    ORDER BY times_tested DESC
    LIMIT ?
  `).all(limit);
}

/**
 * Get most common failure reasons.
 */
export function getCommonFailures(limit = 10) {
  const d = getDb();
  return d.prepare(`
    SELECT failure_reason, type, COUNT(*) as count
    FROM combo_log
    WHERE valid = 0 AND failure_reason IS NOT NULL
    GROUP BY failure_reason, type
    ORDER BY count DESC
    LIMIT ?
  `).all(limit);
}

/**
 * Get recent validations.
 */
export function getRecentValidations(limit = 20) {
  const d = getDb();
  return d.prepare(`
    SELECT timestamp, type, sequence, valid, failure_reason, source
    FROM combo_log
    ORDER BY id DESC
    LIMIT ?
  `).all(limit);
}

/**
 * Get daily validation activity.
 */
export function getDailyActivity(days = 14) {
  const d = getDb();
  return d.prepare(`
    SELECT
      DATE(timestamp) as day,
      COUNT(*) as total,
      SUM(valid) as valid_count
    FROM combo_log
    WHERE timestamp > datetime('now', '-' || ? || ' days')
    GROUP BY DATE(timestamp)
    ORDER BY day DESC
  `).all(days);
}
