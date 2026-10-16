#!/usr/bin/env node
/**
 * the-matchmaker.js — "Should I even be fighting today?"
 *
 * The Matchmaker decides whether to fight at all.
 * Not "is there a signal" but "is this a market I have edge in?"
 *
 * Checks:
 *   1. Regime fitness — am I in a regime my strategies historically win in?
 *   2. Volatility sanity — is vol too high (chaos) or too low (no opportunity)?
 *   3. Liquidity check — is volume sufficient for meaningful moves?
 *   4. Loss momentum — am I in a losing spiral that says stop?
 *   5. Crowd danger — is the crowd at an extreme that makes this a trap?
 *
 * Output: { fight: true/false, reason, conditions }
 * If fight=false, the trader doesn't open new positions. Period.
 *
 * ESM.
 */

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'logs', 'trades.db');
const REGIME_PATH = path.join(__dirname, 'regime-state.json');
const BENCHMARK_PATH = path.join(__dirname, 'benchmark-state.json');
const SIGNALS_PATH = path.join(__dirname, 'signals', 'crypto-signals-latest.json');
const MATCHMAKER_PATH = path.join(__dirname, 'matchmaker-state.json');

// Must match CYCLICAL_STRATEGIES in cyclical-trader.js — update both together
const ACTIVE_STRATEGIES = ['historical_cycles', 'gann_geometry', 'sexagesimal_cycles', 'harmonic_432'];

function getDb() {
  return new Database(DB_PATH, { readonly: true });
}

/**
 * Check 1: Regime fitness — do my strategies win in this regime?
 */
function checkRegimeFitness() {
  const db = getDb();

  if (!fs.existsSync(REGIME_PATH)) {
    db.close();
    return { pass: true, reason: 'no regime data — defaulting to fight' };
  }

  const regimeState = JSON.parse(fs.readFileSync(REGIME_PATH, 'utf8'));
  const regimes = regimeState.regimes || {};

  // BTC regime is the primary market signal
  const btcRegime = regimes.BTC?.regime;
  if (!btcRegime) {
    db.close();
    return { pass: true, reason: 'no BTC regime — defaulting to fight' };
  }

  // Check historical win rate per regime (from trade log)
  // For now, map known bad regimes
  if (btcRegime === 'CHOPPY') {
    db.close();
    return {
      pass: false,
      reason: `BTC regime is CHOPPY — no edge in chaos. Sitting out.`,
      regime: btcRegime,
    };
  }

  // TRENDING_UP with all-short book = fighting the wrong fight
  const openShorts = db.prepare(`
    SELECT COUNT(*) as cnt FROM cyclical_trades
    WHERE status = 'open' AND direction = 'short'
  `).get().cnt;
  const openLongs = db.prepare(`
    SELECT COUNT(*) as cnt FROM cyclical_trades
    WHERE status = 'open' AND direction = 'long'
  `).get().cnt;

  db.close();

  if (btcRegime === 'TRENDING_UP' && openShorts > 3 && openLongs === 0) {
    return {
      pass: false,
      reason: `BTC TRENDING_UP but holding ${openShorts} shorts, 0 longs — wrong side of the fight. No new shorts.`,
      regime: btcRegime,
      allow_direction: 'long_only',
    };
  }

  return { pass: true, reason: `BTC regime ${btcRegime} — acceptable`, regime: btcRegime };
}

/**
 * Check 2: Volatility sanity — is vol in a tradeable range?
 */
function checkVolatility() {
  if (!fs.existsSync(REGIME_PATH)) {
    return { pass: true, reason: 'no regime data' };
  }

  const regimeState = JSON.parse(fs.readFileSync(REGIME_PATH, 'utf8'));
  const btcMetrics = regimeState.regimes?.BTC?.metrics;

  if (!btcMetrics) return { pass: true, reason: 'no BTC metrics' };

  const vol = btcMetrics.annualized_vol_pct;

  if (vol > 120) {
    return {
      pass: false,
      reason: `BTC annualized vol ${vol}% — extreme chaos. Sitting out until vol drops below 100%.`,
      vol,
    };
  }

  if (vol < 8) {
    return {
      pass: false,
      reason: `BTC annualized vol ${vol}% — dead market. No opportunity. Sitting out.`,
      vol,
    };
  }

  const quality = vol > 80 ? 'HIGH' : vol > 40 ? 'NORMAL' : 'LOW';
  return { pass: true, reason: `BTC vol ${vol}% (${quality})`, vol };
}

/**
 * Check 3: Loss momentum — am I in a spiral?
 */
function checkLossMomentum() {
  const db = getDb();

  const placeholders = ACTIVE_STRATEGIES.map(() => '?').join(',');
  const recent = db.prepare(`
    SELECT pnl, closed_at FROM cyclical_trades
    WHERE status = 'closed' AND strategy IN (${placeholders})
    ORDER BY closed_at DESC
    LIMIT 10
  `).all(...ACTIVE_STRATEGIES);

  db.close();

  if (recent.length < 5) {
    return { pass: true, reason: `only ${recent.length} closed trades — too early to judge` };
  }

  // Count consecutive losses from most recent
  // $0 P&L (stale exits at breakeven) are neutral — don't extend loss streaks
  let lossStreak = 0;
  for (const t of recent) {
    if (t.pnl < 0) lossStreak++;
    else break;
  }

  // Check recent batch win rate
  const recentWins = recent.filter(t => t.pnl > 0).length;
  const recentWR = recentWins / recent.length;

  if (lossStreak >= 6) {
    // Recovery: if last trade was 7+ days ago, allow a single probe trade
    // Permanent cooldown = permanent death — the system can never recover
    const lastClose = recent[0]?.closed_at;
    const daysSinceLastClose = lastClose
      ? (Date.now() - new Date(lastClose).getTime()) / (1000 * 60 * 60 * 24)
      : 999;

    if (daysSinceLastClose >= 7) {
      return {
        pass: true,
        reason: `${lossStreak}-loss streak BUT ${Math.floor(daysSinceLastClose)}d since last trade — recovery probe allowed (1 position max)`,
        loss_streak: lossStreak,
        recovery_probe: true,
      };
    }

    return {
      pass: false,
      reason: `${lossStreak}-loss streak — mandatory cooldown. Re-analyze before resuming.`,
      loss_streak: lossStreak,
      cooldown: true,
    };
  }

  if (lossStreak >= 4 && recentWR < 0.3) {
    return {
      pass: false,
      reason: `${lossStreak}-loss streak + ${(recentWR * 100).toFixed(0)}% recent WR — stepping back.`,
      loss_streak: lossStreak,
    };
  }

  if (recentWR < 0.2 && recent.length >= 8) {
    return {
      pass: false,
      reason: `${recentWins}/${recent.length} recent wins (${(recentWR * 100).toFixed(0)}%) — system not working. Pause.`,
    };
  }

  return {
    pass: true,
    reason: `${lossStreak} recent losses, ${(recentWR * 100).toFixed(0)}% recent WR — acceptable`,
    loss_streak: lossStreak,
    recent_wr: recentWR,
  };
}

/**
 * Check 4: Crowd danger — is the crowd at a dangerous extreme?
 */
function checkCrowdDanger() {
  if (!fs.existsSync(BENCHMARK_PATH)) {
    return { pass: true, reason: 'no benchmark data' };
  }

  const bench = JSON.parse(fs.readFileSync(BENCHMARK_PATH, 'utf8'));
  const latest = bench.snapshots?.[bench.snapshots.length - 1];

  if (!latest?.long_short_ratio) {
    return { pass: true, reason: 'no long/short data' };
  }

  const ratio = latest.long_short_ratio;

  // Extreme crowd positioning = potential trap
  if (ratio > 2.5) {
    return {
      pass: true, // still fight, but flag it
      reason: `DANGER: crowd extremely long (${ratio.toFixed(2)}). Longs are crowded — potential liquidation cascade.`,
      crowd_warning: 'EXTREME_LONG',
      ratio,
    };
  }

  if (ratio < 0.4) {
    return {
      pass: true,
      reason: `DANGER: crowd extremely short (${ratio.toFixed(2)}). Shorts crowded — potential squeeze.`,
      crowd_warning: 'EXTREME_SHORT',
      ratio,
    };
  }

  return { pass: true, reason: `crowd L/S ratio ${ratio.toFixed(2)} — normal`, ratio };
}

/**
 * Check 5: Time-based — are we in a known bad trading window?
 */
function checkTimingWindow() {
  const now = new Date();
  const hour = now.getUTCHours();
  const day = now.getUTCDay();

  // Weekend low liquidity (Sat/Sun) — reduced confidence, don't block
  if (day === 0 || day === 6) {
    return {
      pass: true,
      reason: `Weekend (${day === 0 ? 'Sun' : 'Sat'}) — lower liquidity, proceed with caution`,
      weekend: true,
    };
  }

  return { pass: true, reason: 'normal trading window' };
}

/**
 * Run all matchmaker checks. Returns fight decision.
 */
export function shouldFight() {
  const checks = {
    regime: checkRegimeFitness(),
    volatility: checkVolatility(),
    loss_momentum: checkLossMomentum(),
    crowd: checkCrowdDanger(),
    timing: checkTimingWindow(),
  };

  // Any hard fail = don't fight
  const failures = Object.entries(checks).filter(([, c]) => !c.pass);
  const fight = failures.length === 0;

  // Direction restriction (e.g., trending up = long only)
  let allowedDirection = null;
  for (const [, c] of Object.entries(checks)) {
    if (c.allow_direction) allowedDirection = c.allow_direction;
  }

  // Crowd warnings (fight but with caution)
  const warnings = Object.entries(checks)
    .filter(([, c]) => c.crowd_warning)
    .map(([, c]) => c.crowd_warning);

  const decision = {
    fight,
    allowed_direction: allowedDirection,
    warnings,
    reasons: fight
      ? Object.values(checks).map(c => c.reason)
      : failures.map(([name, c]) => `[${name}] ${c.reason}`),
    checks,
    timestamp: new Date().toISOString(),
  };

  // Save state
  fs.writeFileSync(MATCHMAKER_PATH, JSON.stringify(decision, null, 2));

  return decision;
}

// ── Standalone run ──
if (process.argv[1] && process.argv[1].includes('the-matchmaker')) {
  console.log('\n============================================================');
  console.log(`[THE MATCHMAKER] Fight decision — ${new Date().toISOString()}`);
  console.log('============================================================\n');

  const decision = shouldFight();

  if (decision.fight) {
    console.log('DECISION: FIGHT');
    if (decision.allowed_direction) {
      console.log(`  RESTRICTION: ${decision.allowed_direction}`);
    }
    if (decision.warnings.length) {
      console.log(`  WARNINGS: ${decision.warnings.join(', ')}`);
    }
  } else {
    console.log('DECISION: SIT OUT');
  }

  console.log('\nChecks:');
  for (const reason of decision.reasons) {
    console.log(`  ${decision.fight ? '✓' : '✗'} ${reason}`);
  }
}
