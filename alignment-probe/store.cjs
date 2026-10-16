'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'results', 'alignment-probe.db');

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model TEXT NOT NULL,
      sequence_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      avg_sycophancy REAL,
      avg_consistency REAL,
      avg_self_awareness REAL,
      collapse_threshold INTEGER,
      peak_sycophancy REAL,
      defensive_tactics TEXT,
      status TEXT DEFAULT 'running'
    );

    CREATE TABLE IF NOT EXISTS moves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      move_id INTEGER NOT NULL,
      prompt TEXT NOT NULL,
      response TEXT NOT NULL,
      sycophancy REAL,
      logical_consistency REAL,
      self_awareness REAL,
      resistance REAL,
      defensive_tactics TEXT,
      word_count INTEGER,
      FOREIGN KEY (run_id) REFERENCES runs(id)
    );
  `);

  return db;
}

function createRun(db, model, sequenceId) {
  const stmt = db.prepare(`
    INSERT INTO runs (model, sequence_id, started_at, status)
    VALUES (?, ?, datetime('now'), 'running')
  `);
  return stmt.run(model, sequenceId).lastInsertRowid;
}

function saveMove(db, runId, moveId, prompt, response, scores) {
  const stmt = db.prepare(`
    INSERT INTO moves (run_id, move_id, prompt, response, sycophancy, logical_consistency,
                       self_awareness, resistance, defensive_tactics, word_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    runId, moveId, prompt, response,
    scores.sycophancy, scores.logicalConsistency,
    scores.selfAwareness, scores.resistance,
    JSON.stringify(scores.defensiveTactics),
    scores.wordCount
  );
}

function finishRun(db, runId, summary) {
  const stmt = db.prepare(`
    UPDATE runs SET
      finished_at = datetime('now'),
      avg_sycophancy = ?,
      avg_consistency = ?,
      avg_self_awareness = ?,
      collapse_threshold = ?,
      peak_sycophancy = ?,
      defensive_tactics = ?,
      status = 'complete'
    WHERE id = ?
  `);
  stmt.run(
    summary.avgSycophancy,
    summary.avgConsistency,
    summary.avgSelfAwareness,
    summary.collapseThreshold,
    summary.peakSycophancy,
    JSON.stringify(summary.allDefensiveTactics),
    runId
  );
}

function getRuns(db, limit = 20) {
  return db.prepare(`
    SELECT * FROM runs ORDER BY id DESC LIMIT ?
  `).all(limit);
}

function getRunMoves(db, runId) {
  return db.prepare(`
    SELECT * FROM moves WHERE run_id = ? ORDER BY move_id
  `).all(runId);
}

function getComparisonTable(db) {
  return db.prepare(`
    SELECT model, sequence_id,
           ROUND(avg_sycophancy, 1) as syc,
           ROUND(avg_consistency, 1) as con,
           ROUND(avg_self_awareness, 1) as self_aw,
           collapse_threshold as collapse,
           peak_sycophancy as peak_syc,
           defensive_tactics as tactics,
           finished_at
    FROM runs
    WHERE status = 'complete'
    ORDER BY avg_sycophancy DESC
  `).all();
}

module.exports = { getDb, createRun, saveMove, finishRun, getRuns, getRunMoves, getComparisonTable };
