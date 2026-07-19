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
import { getStrategyProcessScore } from './causal-critic.js';

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

      CREATE TABLE IF NOT EXISTS genome_archive (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT (datetime('now')),
        strategy TEXT NOT NULL,
        genome TEXT NOT NULL
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

  // Load elimination config
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const elimConfig = config.elimination || {};
  const strikesToKill = elimConfig.strikes_to_kill || 3;
  const minTradesBeforeElim = elimConfig.min_trades_before_elimination || 3;

  // Need minimum closed trades before eliminating
  const totalClosed = results.reduce((sum, r) => sum + r.total_trades, 0);
  if (totalClosed < minTradesBeforeElim) {
    return {
      message: `Only ${totalClosed} closed trades — need ${minTradesBeforeElim} before elimination starts`,
      results,
    };
  }

  // Find worst performer this week (among active, non-eliminated strategies with trades)
  const eligible = active.filter(r => r.weekly_trades > 0 || r.total_trades > 0);

  if (eligible.length === 0) {
    return { message: 'No eligible strategies for elimination this week', results };
  }

  // Process Score is primary signal (Causal Decoupling — score logic, not luck)
  // Fall back to P&L only if insufficient Process Score data
  for (const candidate of eligible) {
    const ps = getStrategyProcessScore(candidate.strategy);
    candidate._processScore = ps.score;
    candidate._psSufficient = ps.sufficient;
  }

  // Re-sort: strategies with sufficient Process Score data sort by PS (worst first)
  // Strategies without sufficient data sort by cumulative P&L (original behavior)
  eligible.sort((a, b) => {
    if (a._psSufficient && b._psSufficient) return (a._processScore || -2) - (b._processScore || -2);
    if (a._psSufficient) return 1; // has data = protected from being "unknown worst"
    if (b._psSufficient) return -1;
    return a.weekly_pnl - b.weekly_pnl; // fallback: weekly P&L
  });

  // Protection: profitable strategies survive. PS demotes allocation (via Corner), not life/death.
  let worst = null;
  for (const candidate of eligible) {
    if (candidate.cumulative_pnl > 0) {
      const psNote = candidate._psSufficient ? ` PS: ${candidate._processScore.toFixed(3)}` : '';
      console.log(`[elimination] ${candidate.strategy} — profitable ($${candidate.cumulative_pnl.toFixed(2)})${psNote} — protected (P&L decides life, PS decides sizing)`);
      continue;
    }
    if (candidate._psSufficient && candidate._processScore > 0.3) {
      console.log(`[elimination] ${candidate.strategy} — good logic (PS: ${candidate._processScore.toFixed(3)}) despite losses — protected`);
      continue;
    }
    worst = candidate;
    break;
  }

  if (!worst) {
    return {
      message: 'All active strategies are profitable overall — no elimination this week',
      results,
    };
  }

  // Give strike
  const newStrikes = worst.strikes + 1;
  const eliminated = newStrikes >= strikesToKill;

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

  const psLabel = worst._psSufficient ? `, PS: ${worst._processScore.toFixed(3)}` : ', PS: insufficient data';
  const event = eliminated
    ? `ELIMINATED: ${worst.strategy} (3 strikes — weekly PnL $${worst.weekly_pnl.toFixed(2)}, cumulative $${worst.cumulative_pnl.toFixed(2)}${psLabel})`
    : `STRIKE ${newStrikes}/3: ${worst.strategy} (worst performer — weekly PnL $${worst.weekly_pnl.toFixed(2)}${psLabel})`;

  d.prepare(`
    INSERT INTO elimination_log (week_number, event, strategy, details)
    VALUES (?, ?, ?, ?)
  `).run(weekNum, event, worst.strategy, JSON.stringify(worst));

  console.log(`[elimination] ${event}`);

  let genome = null;
  if (eliminated) {
    genome = extractGenome(worst.strategy);
  }

  return {
    week: weekNum,
    event,
    struck: worst.strategy,
    strikes: newStrikes,
    eliminated,
    genome,
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

// ── Genome Extraction (Death-to-Rebirth Pipeline) ───────────────────────────

export function extractGenome(strategy) {
  const d = getDb();

  const trades = d.prepare(`
    SELECT asset, direction, pnl, pnl_pct, entry_price,
           strftime('%H', opened_at) as hour,
           julianday(closed_at) - julianday(opened_at) as hold_days
    FROM trades WHERE strategy = ? AND status = 'closed'
  `).all(strategy);

  if (trades.length < 3) return null;

  const byAsset = {};
  const byDirection = { long: { trades: 0, wins: 0, pnl: 0 }, short: { trades: 0, wins: 0, pnl: 0 } };
  const byHour = {};

  for (const t of trades) {
    if (!byAsset[t.asset]) byAsset[t.asset] = { trades: 0, wins: 0, pnl: 0 };
    byAsset[t.asset].trades++;
    if (t.pnl > 0) byAsset[t.asset].wins++;
    byAsset[t.asset].pnl += t.pnl;

    const dir = t.direction || 'long';
    byDirection[dir].trades++;
    if (t.pnl > 0) byDirection[dir].wins++;
    byDirection[dir].pnl += t.pnl;

    if (t.hour) {
      if (!byHour[t.hour]) byHour[t.hour] = { trades: 0, wins: 0 };
      byHour[t.hour].trades++;
      if (t.pnl > 0) byHour[t.hour].wins++;
    }
  }

  const bestAssets = Object.entries(byAsset)
    .filter(([, v]) => v.trades >= 2 && v.pnl > 0)
    .sort((a, b) => b[1].pnl - a[1].pnl)
    .slice(0, 3)
    .map(([asset, v]) => ({ asset, winRate: v.wins / v.trades, pnl: Math.round(v.pnl * 100) / 100 }));

  const directionBias = byDirection.long.pnl > byDirection.short.pnl ? 'long' : 'short';
  const avgHoldDays = trades.reduce((s, t) => s + (t.hold_days || 0), 0) / trades.length;

  const bestHours = Object.entries(byHour)
    .filter(([, v]) => v.trades >= 2)
    .sort((a, b) => (b[1].wins / b[1].trades) - (a[1].wins / a[1].trades))
    .slice(0, 3)
    .map(([hour, v]) => ({ hour: parseInt(hour), winRate: v.wins / v.trades }));

  const genome = {
    strategy,
    totalTrades: trades.length,
    bestAssets,
    directionBias,
    directionStats: {
      long: { winRate: byDirection.long.trades > 0 ? byDirection.long.wins / byDirection.long.trades : 0, pnl: Math.round(byDirection.long.pnl * 100) / 100 },
      short: { winRate: byDirection.short.trades > 0 ? byDirection.short.wins / byDirection.short.trades : 0, pnl: Math.round(byDirection.short.pnl * 100) / 100 },
    },
    avgHoldDays: Math.round(avgHoldDays * 10) / 10,
    bestHours,
    extractedAt: new Date().toISOString(),
  };

  d.prepare('INSERT INTO genome_archive (strategy, genome) VALUES (?, ?)').run(strategy, JSON.stringify(genome));
  console.log(`[GENOME] Extracted from ${strategy}: ${bestAssets.length} strong assets, bias=${directionBias}, ${trades.length} trades`);
  return genome;
}

export function getInheritedBias(asset, direction) {
  const d = getDb();
  const rows = d.prepare('SELECT genome FROM genome_archive ORDER BY id DESC').all();
  if (!rows.length) return { boost: 0, sources: [] };

  let totalBoost = 0;
  const sources = [];

  for (const row of rows) {
    const genome = JSON.parse(row.genome);
    const assetMatch = genome.bestAssets.find(a => a.asset === asset);
    if (assetMatch) {
      totalBoost += 0.05;
      sources.push({ from: genome.strategy, reason: `${asset} was strong (WR: ${(assetMatch.winRate * 100).toFixed(0)}%, PnL: $${assetMatch.pnl})` });
    }
    if (genome.directionBias === direction && genome.directionStats[direction]?.winRate > 0.55) {
      totalBoost += 0.03;
      sources.push({ from: genome.strategy, reason: `${direction} bias confirmed (WR: ${(genome.directionStats[direction].winRate * 100).toFixed(0)}%)` });
    }
  }

  return { boost: Math.min(totalBoost, 0.15), sources };
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
  } else if (arg === 'genome') {
    const strategy = process.argv[3];
    if (!strategy) { console.log('Usage: node strategy-elimination.js genome <strategy>'); process.exit(1); }
    const g = extractGenome(strategy);
    if (g) console.log(JSON.stringify(g, null, 2));
    else console.log('Insufficient trades for genome extraction');
  } else if (arg === 'genomes') {
    const d = getDb();
    const rows = d.prepare('SELECT strategy, genome FROM genome_archive ORDER BY id DESC').all();
    if (!rows.length) { console.log('No archived genomes yet.'); process.exit(0); }
    for (const r of rows) {
      const g = JSON.parse(r.genome);
      console.log(`\n[${g.strategy}] ${g.totalTrades} trades, bias=${g.directionBias}, hold=${g.avgHoldDays}d`);
      for (const a of g.bestAssets) console.log(`  strong: ${a.asset} WR=${(a.winRate*100).toFixed(0)}% PnL=$${a.pnl}`);
    }
  } else {
    console.log('Usage: node strategy-elimination.js [run|standings|genome <name>|genomes]');
  }
}
