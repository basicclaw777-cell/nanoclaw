/**
 * strategy-elimination.js — Natural selection for trading strategies
 *
 * Weekly: worst-performing strategy gets a strike.
 * 3 strikes → strategy removed from signal generation.
 * Survivors compound credibility. Only what works remains.
 *
 * The Money Machine concept applied to the Cathedral's 11 strategies.
 *
 * ESM.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'logs', 'trades.db');
const CONFIG_PATH = path.join(__dirname, 'config.json');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS strategy_elimination (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT (datetime('now')),
        strategy TEXT NOT NULL,
        strikes INTEGER DEFAULT 0,
        eliminated INTEGER DEFAULT 0,
        eliminated_at TEXT,
        reason TEXT,
        weekly_pnl REAL,
        cumulative_pnl REAL,
        total_trades INTEGER DEFAULT 0,
        win_rate REAL
      );

      CREATE TABLE IF NOT EXISTS elimination_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT (datetime('now')),
        week_number INTEGER,
        event TEXT NOT NULL,
        strategy TEXT,
        details TEXT
      );
    `);
  }
  return db;
}

// ── Get strategy performance for the week ────────────────────────────────────

function getWeeklyPerformance() {
  const d = getDb();

  // All strategies that have generated signals
  const strategies = d.prepare(`
    SELECT DISTINCT strategy FROM trades WHERE strategy IS NOT NULL
  `).all().map(r => r.strategy);

  const results = [];

  for (const strategy of strategies) {
    // Closed trades this week
    const weekly = d.prepare(`
      SELECT
        COUNT(*) as trades,
        SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END) as losses,
        COALESCE(SUM(pnl), 0) as weekly_pnl
      FROM trades
      WHERE strategy = ? AND status = 'closed'
      AND closed_at > datetime('now', '-7 days')
    `).get(strategy);

    // All-time performance
    const allTime = d.prepare(`
      SELECT
        COUNT(*) as total_trades,
        COALESCE(SUM(pnl), 0) as cumulative_pnl,
        ROUND(100.0 * SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) / MAX(COUNT(*), 1), 1) as win_rate
      FROM trades
      WHERE strategy = ? AND status = 'closed'
    `).get(strategy);

    // Open positions (unrealised commitment)
    const openCount = d.prepare(`
      SELECT COUNT(*) as c FROM trades WHERE strategy = ? AND status = 'open'
    `).get(strategy);

    // Current strike count
    let elimination = d.prepare(`
      SELECT * FROM strategy_elimination WHERE strategy = ? ORDER BY id DESC LIMIT 1
    `).get(strategy);

    if (!elimination) {
      // First time seeing this strategy — create record
      d.prepare(`
        INSERT INTO strategy_elimination (strategy, strikes, eliminated, total_trades, win_rate, cumulative_pnl)
        VALUES (?, 0, 0, ?, ?, ?)
      `).run(strategy, allTime.total_trades, allTime.win_rate, allTime.cumulative_pnl);

      elimination = { strikes: 0, eliminated: 0 };
    }

    results.push({
      strategy,
      weekly_pnl: weekly.weekly_pnl,
      weekly_trades: weekly.trades,
      weekly_wins: weekly.wins,
      weekly_losses: weekly.losses,
      cumulative_pnl: allTime.cumulative_pnl,
      total_trades: allTime.total_trades,
      win_rate: allTime.win_rate,
      open_positions: openCount.c,
      strikes: elimination.strikes,
      eliminated: elimination.eliminated,
    });
  }

  // Sort by weekly P&L (worst first)
  results.sort((a, b) => a.weekly_pnl - b.weekly_pnl);

  return results;
}

// ── Run weekly elimination ───────────────────────────────────────────────────

export function runElimination() {
  const d = getDb();
  const results = getWeeklyPerformance();

  if (results.length === 0) {
    return { message: 'No strategy data yet', results: [] };
  }

  // Count active (non-eliminated) strategies
  const active = results.filter(r => !r.eliminated);

  if (active.length <= 3) {
    return {
      message: 'Only 3 strategies remaining — no more eliminations',
      results,
      survivors: active.map(r => r.strategy),
    };
  }

  // Need at least 5 closed trades total across all strategies before eliminating
  const totalClosed = results.reduce((sum, r) => sum + r.total_trades, 0);
  if (totalClosed < 5) {
    return {
      message: `Only ${totalClosed} closed trades — need 5 before elimination starts`,
      results,
    };
  }

  // Find worst performer this week (among active, non-eliminated strategies with trades)
  const eligible = active.filter(r => r.weekly_trades > 0 || r.total_trades > 0);

  if (eligible.length === 0) {
    return { message: 'No eligible strategies for elimination this week', results };
  }

  const worst = eligible[0]; // Already sorted worst-first

  // Give strike
  const newStrikes = worst.strikes + 1;
  const eliminated = newStrikes >= 3;

  d.prepare(`
    UPDATE strategy_elimination
    SET strikes = ?, eliminated = ?, eliminated_at = ?, weekly_pnl = ?, cumulative_pnl = ?, total_trades = ?, win_rate = ?
    WHERE strategy = ?
  `).run(
    newStrikes,
    eliminated ? 1 : 0,
    eliminated ? new Date().toISOString() : null,
    worst.weekly_pnl,
    worst.cumulative_pnl,
    worst.total_trades,
    worst.win_rate,
    worst.strategy
  );

  // Log the event
  const weekNum = d.prepare('SELECT COUNT(DISTINCT week_number) + 1 as w FROM elimination_log').get().w;

  const event = eliminated
    ? `ELIMINATED: ${worst.strategy} (3 strikes — weekly PnL $${worst.weekly_pnl.toFixed(2)}, cumulative $${worst.cumulative_pnl.toFixed(2)})`
    : `STRIKE ${newStrikes}/3: ${worst.strategy} (worst performer — weekly PnL $${worst.weekly_pnl.toFixed(2)})`;

  d.prepare(`
    INSERT INTO elimination_log (week_number, event, strategy, details)
    VALUES (?, ?, ?, ?)
  `).run(weekNum, event, worst.strategy, JSON.stringify(worst));

  console.log(`[elimination] ${event}`);

  return {
    week: weekNum,
    event,
    struck: worst.strategy,
    strikes: newStrikes,
    eliminated,
    active_count: active.length - (eliminated ? 1 : 0),
    results,
  };
}

// ── Check if a strategy is eliminated ────────────────────────────────────────

export function isEliminated(strategy) {
  const d = getDb();
  const row = d.prepare(`
    SELECT eliminated FROM strategy_elimination WHERE strategy = ? ORDER BY id DESC LIMIT 1
  `).get(strategy);
  return row ? row.eliminated === 1 : false;
}

// ── Get current standings ────────────────────────────────────────────────────

export function getStandings() {
  const d = getDb();
  const results = getWeeklyPerformance();

  const log = d.prepare(`
    SELECT * FROM elimination_log ORDER BY id DESC LIMIT 20
  `).all();

  return {
    standings: results,
    active: results.filter(r => !r.eliminated).length,
    eliminated: results.filter(r => r.eliminated).map(r => r.strategy),
    log,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

if (process.argv[1]?.endsWith('strategy-elimination.js')) {
  const arg = process.argv[2];

  if (arg === 'run') {
    const result = runElimination();
    console.log(JSON.stringify(result, null, 2));
  } else if (arg === 'standings') {
    const standings = getStandings();
    console.log('\n=== STRATEGY ELIMINATION STANDINGS ===\n');
    for (const s of standings.standings) {
      const status = s.eliminated ? '💀' : s.strikes > 0 ? `⚠️ ${s.strikes}/3` : '✅';
      console.log(`${status} ${s.strategy.padEnd(25)} PnL: $${s.cumulative_pnl.toFixed(2).padStart(8)} | W/L: ${s.total_trades} trades | Win: ${s.win_rate || 0}%`);
    }
    console.log(`\nActive: ${standings.active} | Eliminated: ${standings.eliminated.join(', ') || 'none'}`);
  } else {
    console.log('Usage: node strategy-elimination.js [run|standings]');
  }
}
