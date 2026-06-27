/**
 * trade-logger.js — SQLite logging for all trading activity
 *
 * Every signal, every decision, every trade, every outcome.
 * The combination-validator approach applied to trading:
 * log everything, learn from patterns, compound knowledge.
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
      CREATE TABLE IF NOT EXISTS signals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT (datetime('now')),
        source TEXT NOT NULL,
        asset TEXT NOT NULL,
        direction TEXT NOT NULL,
        strength REAL,
        reasoning TEXT,
        raw_data TEXT
      );

      CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        opened_at TEXT DEFAULT (datetime('now')),
        closed_at TEXT,
        asset TEXT NOT NULL,
        direction TEXT NOT NULL,
        entry_price REAL NOT NULL,
        exit_price REAL,
        position_size REAL NOT NULL,
        stop_loss REAL,
        take_profit REAL,
        status TEXT DEFAULT 'open',
        pnl REAL,
        pnl_pct REAL,
        strategy TEXT NOT NULL,
        reasoning TEXT,
        bull_case TEXT,
        bear_case TEXT,
        risk_score REAL,
        phase INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT (datetime('now')),
        asset TEXT NOT NULL,
        action TEXT NOT NULL,
        reasoning TEXT,
        signals_used TEXT,
        bull_summary TEXT,
        bear_summary TEXT,
        risk_check TEXT,
        outcome TEXT
      );

      CREATE TABLE IF NOT EXISTS daily_summary (
        date TEXT PRIMARY KEY,
        total_trades INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        total_pnl REAL DEFAULT 0,
        max_drawdown REAL DEFAULT 0,
        notes TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_trades_asset ON trades(asset);
      CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
      CREATE INDEX IF NOT EXISTS idx_signals_asset ON signals(asset);
    `);
  }
  return db;
}

// ── Signal logging ───────────────────────────────────────────────────────────

export function logSignal(source, asset, direction, strength, reasoning, rawData = null) {
  const d = getDb();
  let raw = null;
  if (rawData) {
    const seen = new WeakSet();
    raw = JSON.stringify(rawData, (key, value) => {
      if (key.startsWith('_')) return undefined;
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[circular]';
        seen.add(value);
      }
      return value;
    });
  }
  return d.prepare(`
    INSERT INTO signals (source, asset, direction, strength, reasoning, raw_data)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(source, asset, direction, strength, reasoning, raw);
}

// ── Trade logging ────────────────────────────────────────────────────────────

export function openTrade(asset, direction, entryPrice, positionSize, stopLoss, takeProfit, strategy, reasoning, bullCase, bearCase, riskScore) {
  const d = getDb();
  return d.prepare(`
    INSERT INTO trades (asset, direction, entry_price, position_size, stop_loss, take_profit, strategy, reasoning, bull_case, bear_case, risk_score, phase)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(asset, direction, entryPrice, positionSize, stopLoss, takeProfit, strategy, reasoning, bullCase, bearCase, riskScore, 0);
}

export function closeTrade(tradeId, exitPrice) {
  const d = getDb();
  const trade = d.prepare('SELECT * FROM trades WHERE id = ?').get(tradeId);
  if (!trade) return null;

  const pnl = trade.direction === 'long'
    ? (exitPrice - trade.entry_price) * trade.position_size
    : (trade.entry_price - exitPrice) * trade.position_size;
  const pnlPct = trade.direction === 'long'
    ? (exitPrice - trade.entry_price) / trade.entry_price
    : (trade.entry_price - exitPrice) / trade.entry_price;

  d.prepare(`
    UPDATE trades SET closed_at = datetime('now'), exit_price = ?, status = 'closed', pnl = ?, pnl_pct = ?
    WHERE id = ?
  `).run(exitPrice, pnl, pnlPct, tradeId);

  return { tradeId, pnl, pnlPct };
}

// ── Decision logging ─────────────────────────────────────────────────────────

export function logDecision(asset, action, reasoning, signalsUsed, bullSummary, bearSummary, riskCheck, outcome) {
  const d = getDb();
  const seen = new WeakSet();
  const safeStringify = (obj) => JSON.stringify(obj, (key, value) => {
    if (key.startsWith('_')) return undefined;
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[circular]';
      seen.add(value);
    }
    return value;
  });
  return d.prepare(`
    INSERT INTO decisions (asset, action, reasoning, signals_used, bull_summary, bear_summary, risk_check, outcome)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(asset, action, reasoning, safeStringify(signalsUsed), bullSummary, bearSummary, riskCheck, outcome);
}

// ── Analytics ────────────────────────────────────────────────────────────────

export function getPerformance(days = 30) {
  const d = getDb();
  return d.prepare(`
    SELECT
      COUNT(*) as total_trades,
      SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END) as losses,
      ROUND(100.0 * SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) / MAX(COUNT(*), 1), 1) as win_rate,
      ROUND(SUM(pnl), 2) as total_pnl,
      ROUND(AVG(pnl), 2) as avg_pnl,
      ROUND(MAX(pnl), 2) as best_trade,
      ROUND(MIN(pnl), 2) as worst_trade,
      ROUND(SUM(CASE WHEN pnl > 0 THEN pnl ELSE 0 END) / ABS(MIN(SUM(CASE WHEN pnl < 0 THEN pnl ELSE 0 END), -0.01)), 2) as profit_factor
    FROM trades
    WHERE status = 'closed' AND closed_at > datetime('now', '-' || ? || ' days')
  `).get(days);
}

export function getStrategyPerformance() {
  const d = getDb();
  return d.prepare(`
    SELECT
      strategy,
      COUNT(*) as trades,
      SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
      ROUND(100.0 * SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) / COUNT(*), 1) as win_rate,
      ROUND(SUM(pnl), 2) as total_pnl,
      ROUND(AVG(pnl_pct), 4) as avg_return
    FROM trades
    WHERE status = 'closed'
    GROUP BY strategy
    ORDER BY total_pnl DESC
  `).all();
}

export function getOpenPositions() {
  const d = getDb();
  return d.prepare('SELECT * FROM trades WHERE status = ?').all('open');
}

export function getRecentSignals(limit = 20) {
  const d = getDb();
  return d.prepare('SELECT * FROM signals ORDER BY id DESC LIMIT ?').all(limit);
}

export function getRecentDecisions(limit = 10) {
  const d = getDb();
  return d.prepare('SELECT * FROM decisions ORDER BY id DESC LIMIT ?').all(limit);
}

// ── Phase promotion check ────────────────────────────────────────────────────

export function checkPromotion(config) {
  const perf = getPerformance(config.promotion_rules.min_days);
  if (!perf || perf.total_trades < config.promotion_rules.min_trades) {
    return { eligible: false, reason: `Need ${config.promotion_rules.min_trades} trades, have ${perf?.total_trades || 0}` };
  }
  if (perf.win_rate / 100 < config.promotion_rules.min_win_rate) {
    return { eligible: false, reason: `Win rate ${perf.win_rate}% below ${config.promotion_rules.min_win_rate * 100}%` };
  }
  if (perf.profit_factor < config.promotion_rules.min_profit_factor) {
    return { eligible: false, reason: `Profit factor ${perf.profit_factor} below ${config.promotion_rules.min_profit_factor}` };
  }
  return { eligible: true, performance: perf };
}
