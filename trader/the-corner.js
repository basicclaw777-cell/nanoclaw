#!/usr/bin/env node
/**
 * the-corner.js — The coach between rounds.
 *
 * After every closed trade: what worked? What didn't? Adjust weights.
 * After every N trades: strategy review. Kill what's dead, boost what's winning.
 *
 * Like a boxing corner between rounds:
 *   - "The jab is landing, keep throwing it" → boost winning strategy
 *   - "Stop reaching with the right hand" → mute losing strategy
 *   - "He drops his left after the jab, go upstairs" → spot opportunities
 *
 * Outputs:
 *   - corner-advice.json — current multipliers per strategy
 *   - corner-log.json — history of adjustments
 *   - Console report — what changed and why
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
const ADVICE_PATH = path.join(__dirname, 'corner-advice.json');
const LOG_PATH = path.join(__dirname, 'corner-log.json');

function getDb() {
  return new Database(DB_PATH, { readonly: true });
}

/**
 * Analyze closed trades and generate strategy performance report.
 */
function analyzeStrategies() {
  const db = getDb();

  const strategies = db.prepare(`
    SELECT
      strategy,
      COUNT(*) as total,
      SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END) as losses,
      SUM(pnl) as total_pnl,
      AVG(pnl) as avg_pnl,
      AVG(CASE WHEN pnl > 0 THEN pnl ELSE NULL END) as avg_win,
      AVG(CASE WHEN pnl <= 0 THEN pnl ELSE NULL END) as avg_loss,
      MAX(pnl) as best_trade,
      MIN(pnl) as worst_trade,
      AVG(julianday(closed_at) - julianday(opened_at)) as avg_hold_days
    FROM cyclical_trades
    WHERE status = 'closed'
    GROUP BY strategy
    ORDER BY total_pnl DESC
  `).all();

  // Recent performance (last 10 trades per strategy)
  const recentPerf = {};
  for (const s of strategies) {
    const recent = db.prepare(`
      SELECT pnl, pnl_pct, closed_at
      FROM cyclical_trades
      WHERE status = 'closed' AND strategy = ?
      ORDER BY closed_at DESC
      LIMIT 10
    `).all(s.strategy);

    const recentWins = recent.filter(t => t.pnl > 0).length;
    const recentPnl = recent.reduce((sum, t) => sum + t.pnl, 0);
    const streak = countStreak(recent);

    recentPerf[s.strategy] = {
      trades: recent.length,
      wins: recentWins,
      pnl: recentPnl,
      win_rate: recent.length > 0 ? recentWins / recent.length : 0,
      streak,
    };
  }

  // Direction analysis — which strategies are better long vs short?
  const directionStats = db.prepare(`
    SELECT
      strategy,
      direction,
      COUNT(*) as total,
      SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
      SUM(pnl) as total_pnl
    FROM cyclical_trades
    WHERE status = 'closed'
    GROUP BY strategy, direction
  `).all();

  db.close();
  return { strategies, recentPerf, directionStats };
}

function countStreak(trades) {
  if (trades.length === 0) return { type: 'none', count: 0 };
  const firstWin = trades[0].pnl > 0;
  let count = 0;
  for (const t of trades) {
    if ((t.pnl > 0) === firstWin) count++;
    else break;
  }
  return { type: firstWin ? 'winning' : 'losing', count };
}

/**
 * Generate corner advice — multipliers based on performance.
 */
function generateAdvice(analysis) {
  const { strategies, recentPerf, directionStats } = analysis;
  const advice = {};
  const reasoning = {};

  for (const s of strategies) {
    const recent = recentPerf[s.strategy];
    const winRate = s.total > 0 ? s.wins / s.total : 0;
    const recentWinRate = recent.win_rate;
    const profitFactor = s.avg_loss !== null && s.avg_loss !== 0
      ? Math.abs(s.avg_win || 0) / Math.abs(s.avg_loss)
      : 0;

    let multiplier = 1.0;
    const notes = [];

    // Rule 1: Overall P&L
    if (s.total_pnl > 50) {
      multiplier *= 1.2;
      notes.push(`profitable (+$${s.total_pnl.toFixed(0)})`);
    } else if (s.total_pnl < -50) {
      multiplier *= 0.6;
      notes.push(`losing ($${s.total_pnl.toFixed(0)})`);
    }

    // Rule 2: Win rate
    if (winRate >= 0.6 && s.total >= 5) {
      multiplier *= 1.15;
      notes.push(`high WR (${(winRate * 100).toFixed(0)}%)`);
    } else if (winRate < 0.35 && s.total >= 5) {
      multiplier *= 0.5;
      notes.push(`low WR (${(winRate * 100).toFixed(0)}%)`);
    }

    // Rule 3: Recent form (more weight than all-time)
    if (recent.trades >= 3) {
      if (recentWinRate >= 0.7) {
        multiplier *= 1.2;
        notes.push(`hot streak (${recent.wins}/${recent.trades} recent)`);
      } else if (recentWinRate <= 0.2) {
        multiplier *= 0.5;
        notes.push(`cold streak (${recent.wins}/${recent.trades} recent)`);
      }
    }

    // Rule 4: Process Score (Causal Decoupling — logic quality, not luck)
    try {
      const ps = getStrategyProcessScore(s.strategy);
      if (ps.sufficient) {
        if (ps.score > 0.5) {
          multiplier *= 1.25;
          notes.push(`strong logic (PS: ${ps.score.toFixed(3)})`);
        } else if (ps.score > 0.2) {
          notes.push(`decent logic (PS: ${ps.score.toFixed(3)})`);
        } else if (ps.score < -0.2) {
          multiplier *= 0.4;
          notes.push(`weak logic (PS: ${ps.score.toFixed(3)}) — reasoning errors`);
        }
        if (ps.trend !== null && ps.trend < -0.3) {
          multiplier *= 0.7;
          notes.push('PS declining');
        }
      }
    } catch {}

    // Rule 5: Losing streak kill-switch
    if (recent.streak.type === 'losing' && recent.streak.count >= 4) {
      multiplier *= 0.3;
      notes.push(`${recent.streak.count}-loss streak — BENCHING`);
    }

    // Rule 6: Profit factor
    if (profitFactor > 2.0 && s.total >= 3) {
      multiplier *= 1.1;
      notes.push(`strong PF (${profitFactor.toFixed(1)})`);
    } else if (profitFactor < 0.5 && s.total >= 3) {
      multiplier *= 0.7;
      notes.push(`weak PF (${profitFactor.toFixed(1)})`);
    }

    // Rule 7: Too few trades — don't over-weight
    if (s.total < 3) {
      multiplier = Math.min(multiplier, 1.0);
      notes.push(`only ${s.total} trades — no boost`);
    }

    // Clamp
    multiplier = Math.max(0.1, Math.min(2.0, multiplier));

    advice[s.strategy] = +multiplier.toFixed(2);
    reasoning[s.strategy] = notes.join('; ');
  }

  return { multipliers: advice, reasoning };
}

/**
 * Direction advice — should a strategy be long-only, short-only, or both?
 */
function directionAdvice(directionStats) {
  const advice = {};
  const byStrategy = {};

  for (const d of directionStats) {
    if (!byStrategy[d.strategy]) byStrategy[d.strategy] = {};
    byStrategy[d.strategy][d.direction] = { total: d.total, wins: d.wins, pnl: d.total_pnl };
  }

  for (const [strategy, dirs] of Object.entries(byStrategy)) {
    const long = dirs.long || { total: 0, wins: 0, pnl: 0 };
    const short = dirs.short || { total: 0, wins: 0, pnl: 0 };

    if (long.total >= 3 && short.total >= 3) {
      const longWR = long.wins / long.total;
      const shortWR = short.wins / short.total;

      if (longWR > 0.6 && shortWR < 0.3) {
        advice[strategy] = { lock: 'long_only', reason: `long ${(longWR*100).toFixed(0)}% WR vs short ${(shortWR*100).toFixed(0)}%` };
      } else if (shortWR > 0.6 && longWR < 0.3) {
        advice[strategy] = { lock: 'short_only', reason: `short ${(shortWR*100).toFixed(0)}% WR vs long ${(longWR*100).toFixed(0)}%` };
      }
    }
  }

  return advice;
}

/**
 * Run the corner — full analysis and advice.
 */
export function runCorner() {
  const analysis = analyzeStrategies();
  const { multipliers, reasoning } = generateAdvice(analysis);
  const dirAdvice = directionAdvice(analysis.directionStats);

  const cornerState = {
    timestamp: new Date().toISOString(),
    multipliers,
    reasoning,
    direction_locks: dirAdvice,
    strategy_rankings: analysis.strategies.map(s => ({
      strategy: s.strategy,
      total: s.total,
      wins: s.wins,
      losses: s.losses,
      pnl: +(s.total_pnl || 0).toFixed(2),
      win_rate: s.total > 0 ? +((s.wins / s.total) * 100).toFixed(1) : 0,
      avg_hold_days: +(s.avg_hold_days || 0).toFixed(1),
      profit_factor: s.avg_loss ? +(Math.abs(s.avg_win || 0) / Math.abs(s.avg_loss)).toFixed(2) : null,
      corner_multiplier: multipliers[s.strategy] || 1.0,
    })),
  };

  fs.writeFileSync(ADVICE_PATH, JSON.stringify(cornerState, null, 2));

  // Append to log
  const log = fs.existsSync(LOG_PATH) ? JSON.parse(fs.readFileSync(LOG_PATH, 'utf8')) : [];
  log.push({
    timestamp: cornerState.timestamp,
    multipliers,
    summary: Object.fromEntries(
      analysis.strategies.map(s => [s.strategy, `${s.wins}W/${s.losses}L $${(s.total_pnl||0).toFixed(0)}`])
    ),
  });
  // Keep last 60 entries
  fs.writeFileSync(LOG_PATH, JSON.stringify(log.slice(-60), null, 2));

  return cornerState;
}

/**
 * Load corner advice multipliers for use in the trader.
 */
export function loadCornerAdvice() {
  if (!fs.existsSync(ADVICE_PATH)) return {};
  try {
    const state = JSON.parse(fs.readFileSync(ADVICE_PATH, 'utf8'));
    return state.multipliers || {};
  } catch { return {}; }
}

// ── Standalone run ──
function main() {
  console.log('\n============================================================');
  console.log(`[THE CORNER] Between-rounds analysis — ${new Date().toISOString()}`);
  console.log('============================================================\n');

  const result = runCorner();

  // Strategy scorecard
  console.log('--- STRATEGY SCORECARD ---\n');
  for (const s of result.strategy_rankings) {
    const bar = s.pnl >= 0 ? '+' : '';
    const mult = s.corner_multiplier;
    const multLabel = mult > 1.1 ? ' BOOST' : mult < 0.5 ? ' BENCH' : mult < 0.8 ? ' REDUCE' : '';
    console.log(`  ${s.strategy.padEnd(22)} ${s.total}t ${s.wins}W/${s.losses}L ${s.win_rate}%WR  ${bar}$${s.pnl.toFixed(0).padStart(6)}  ×${mult}${multLabel}`);
    if (result.reasoning[s.strategy]) {
      console.log(`    → ${result.reasoning[s.strategy]}`);
    }
  }

  // Direction locks
  if (Object.keys(result.direction_locks).length > 0) {
    console.log('\n--- DIRECTION ADVICE ---\n');
    for (const [strat, d] of Object.entries(result.direction_locks)) {
      console.log(`  ${strat}: ${d.lock} — ${d.reason}`);
    }
  }

  // Overall assessment
  const totalPnl = result.strategy_rankings.reduce((s, r) => s + r.pnl, 0);
  const benched = result.strategy_rankings.filter(s => s.corner_multiplier < 0.5);
  const boosted = result.strategy_rankings.filter(s => s.corner_multiplier > 1.1);

  console.log('\n--- CORNER CALL ---\n');
  if (boosted.length) console.log(`  KEEP THROWING: ${boosted.map(s => s.strategy).join(', ')}`);
  if (benched.length) console.log(`  SIT DOWN:      ${benched.map(s => s.strategy).join(', ')}`);
  console.log(`  TOTAL P&L:     ${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`);

  console.log(`\nSaved → ${ADVICE_PATH}`);
}

if (process.argv[1] && process.argv[1].includes('the-corner')) {
  main();
}
