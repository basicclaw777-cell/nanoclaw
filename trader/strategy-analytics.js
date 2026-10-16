/**
 * strategy-analytics.js — Correlation matrix + t-test vs coinflip
 *
 * Measures:
 * 1. Strategy correlation: are strategies winning/losing together? (one bet or many?)
 * 2. t-test: is each strategy's return statistically different from coinflip?
 *
 * Run: node trader/strategy-analytics.js
 * Output: terminal report + logs/strategy-analytics.json
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'logs', 'trades.db');
const OUT_PATH = path.join(__dirname, 'logs', 'strategy-analytics.json');

const db = new Database(DB_PATH, { readonly: true });

// --- Data extraction ---

function getClosedTrades() {
  return db.prepare(`
    SELECT strategy, closed_at, pnl, pnl_pct, asset, direction, position_size
    FROM trades
    WHERE status = 'closed' AND pnl_pct IS NOT NULL
    ORDER BY closed_at
  `).all();
}

function groupByStrategy(trades) {
  const groups = {};
  for (const t of trades) {
    if (!groups[t.strategy]) groups[t.strategy] = [];
    groups[t.strategy].push(t);
  }
  return groups;
}

// --- Statistics ---

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function variance(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
}

function std(arr) {
  return Math.sqrt(variance(arr));
}

/**
 * Welch's t-test (unequal variances, unequal sample sizes)
 * Returns { t, df, p, significant }
 */
function welchTTest(a, b) {
  const nA = a.length, nB = b.length;
  if (nA < 2 || nB < 2) return { t: NaN, df: NaN, p: NaN, significant: false, reason: 'insufficient samples' };

  const mA = mean(a), mB = mean(b);
  const vA = variance(a), vB = variance(b);
  const seA = vA / nA, seB = vB / nB;
  const seDiff = Math.sqrt(seA + seB);

  if (seDiff === 0) return { t: 0, df: NaN, p: 1, significant: false, reason: 'zero variance' };

  const t = (mA - mB) / seDiff;

  // Welch-Satterthwaite degrees of freedom
  const df = (seA + seB) ** 2 / ((seA ** 2) / (nA - 1) + (seB ** 2) / (nB - 1));

  // Approximate two-tailed p-value using t-distribution CDF
  const p = tDistPValue(Math.abs(t), df);

  return { t: round(t, 4), df: round(df, 2), p: round(p, 6), significant: p < 0.05 };
}

/**
 * Approximate two-tailed p-value for t-distribution
 * Uses the regularized incomplete beta function approximation
 */
function tDistPValue(t, df) {
  if (!isFinite(t) || !isFinite(df) || df <= 0) return 1;
  const x = df / (df + t * t);
  return betaIncomplete(df / 2, 0.5, x);
}

/**
 * Regularized incomplete beta function I_x(a, b) via continued fraction
 * Good enough for p-value approximation
 */
function betaIncomplete(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta);

  if (x < (a + 1) / (a + b + 2)) {
    return front * betaCF(a, b, x) / a;
  } else {
    return 1 - front * betaCF(b, a, 1 - x) / b;
  }
}

function betaCF(a, b, x) {
  const maxIter = 200;
  const eps = 1e-10;
  let qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < eps) d = eps;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= maxIter; m++) {
    let m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < eps) d = eps; d = 1 / d;
    c = 1 + aa / c; if (Math.abs(c) < eps) c = eps;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < eps) d = eps; d = 1 / d;
    c = 1 + aa / c; if (Math.abs(c) < eps) c = eps;
    let delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < eps) break;
  }
  return h;
}

function lnGamma(z) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let x = z, y = z;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

// --- Correlation ---

/**
 * Bucket trades into weekly periods, compute per-strategy weekly return,
 * then compute Pearson correlation between strategy return series.
 */
function weeklyReturns(trades) {
  const byWeek = {};
  for (const t of trades) {
    const d = new Date(t.closed_at);
    // ISO week bucket
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const key = weekStart.toISOString().slice(0, 10);
    if (!byWeek[key]) byWeek[key] = {};
    if (!byWeek[key][t.strategy]) byWeek[key][t.strategy] = [];
    byWeek[key][t.strategy].push(t.pnl_pct);
  }

  const weeks = Object.keys(byWeek).sort();
  const strategies = [...new Set(trades.map(t => t.strategy))].sort();

  // Per strategy: array of weekly mean returns (NaN if no trades that week)
  const series = {};
  for (const s of strategies) {
    series[s] = weeks.map(w => {
      const trades = byWeek[w]?.[s];
      if (!trades || !trades.length) return null;
      return mean(trades);
    });
  }

  return { weeks, strategies, series };
}

function pearsonCorrelation(a, b) {
  // Only use weeks where both have data
  const pairs = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== null && b[i] !== null) pairs.push([a[i], b[i]]);
  }
  if (pairs.length < 3) return { r: NaN, n: pairs.length, reason: 'insufficient overlap' };

  const ax = pairs.map(p => p[0]), bx = pairs.map(p => p[1]);
  const mA = mean(ax), mB = mean(bx);
  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < pairs.length; i++) {
    const da = ax[i] - mA, db = bx[i] - mB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  if (den === 0) return { r: 0, n: pairs.length };
  return { r: round(num / den, 4), n: pairs.length };
}

function round(v, d) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

// --- Main ---

function run() {
  const trades = getClosedTrades();
  const groups = groupByStrategy(trades);
  const stratNames = Object.keys(groups).sort();

  console.log('═══════════════════════════════════════════════════════');
  console.log('  STRATEGY ANALYTICS — Correlation + t-test vs Coinflip');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  ${trades.length} closed trades | ${stratNames.length} strategies`);
  console.log(`  Date range: ${trades[0]?.closed_at?.slice(0, 10)} → ${trades[trades.length - 1]?.closed_at?.slice(0, 10)}`);
  console.log();

  // --- Per-strategy summary ---
  console.log('─── STRATEGY SUMMARY ───');
  console.log(`${'Strategy'.padEnd(22)} ${'N'.padStart(4)} ${'Mean%'.padStart(8)} ${'Std%'.padStart(8)} ${'Total$'.padStart(10)} ${'Win%'.padStart(6)}`);

  const summaries = {};
  for (const s of stratNames) {
    const returns = groups[s].map(t => t.pnl_pct);
    const wins = returns.filter(r => r > 0).length;
    summaries[s] = {
      n: returns.length,
      mean_pct: round(mean(returns) * 100, 4),
      std_pct: round(std(returns) * 100, 4),
      total_pnl: round(groups[s].reduce((sum, t) => sum + t.pnl, 0), 2),
      win_rate: round(wins / returns.length, 4),
      returns
    };
    const sm = summaries[s];
    console.log(
      `${s.padEnd(22)} ${String(sm.n).padStart(4)} ${sm.mean_pct.toFixed(2).padStart(8)} ${sm.std_pct.toFixed(2).padStart(8)} ${sm.total_pnl.toFixed(2).padStart(10)} ${(sm.win_rate * 100).toFixed(0).padStart(5)}%`
    );
  }

  // --- t-test vs each coinflip ---
  console.log();
  console.log('─── WELCH t-TEST vs COINFLIP_1 ───');
  console.log('H0: strategy mean return = coinflip_1 mean return');
  console.log('Significance level: α = 0.05');
  console.log();

  const coinflipReturns = (groups.coinflip_1 || []).map(t => t.pnl_pct);
  if (coinflipReturns.length < 2) {
    console.log('  coinflip_1 has < 2 trades — cannot run t-test');
  } else {
    console.log(`  coinflip_1 baseline: n=${coinflipReturns.length}, mean=${(mean(coinflipReturns) * 100).toFixed(4)}%, std=${(std(coinflipReturns) * 100).toFixed(4)}%`);
    console.log();
    console.log(`${'Strategy'.padEnd(22)} ${'t-stat'.padStart(8)} ${'df'.padStart(6)} ${'p-value'.padStart(10)} ${'Sig?'.padStart(6)} ${'vs CF'.padStart(8)}`);

    for (const s of stratNames) {
      if (s.startsWith('coinflip')) continue;
      const returns = groups[s].map(t => t.pnl_pct);
      const result = welchTTest(returns, coinflipReturns);
      const direction = mean(returns) > mean(coinflipReturns) ? 'BETTER' : 'WORSE';
      const sigMark = result.significant ? '  **' : '';
      console.log(
        `${s.padEnd(22)} ${(isNaN(result.t) ? 'N/A' : result.t.toFixed(3)).padStart(8)} ${(isNaN(result.df) ? 'N/A' : result.df.toFixed(1)).padStart(6)} ${(isNaN(result.p) ? 'N/A' : result.p.toFixed(6)).padStart(10)} ${(result.significant ? 'YES' : 'no').padStart(6)} ${direction.padStart(8)}${sigMark}`);
    }
  }

  // --- t-test vs zero (does each strategy have non-zero expected return?) ---
  console.log();
  console.log('─── ONE-SAMPLE t-TEST vs ZERO ───');
  console.log('H0: strategy mean return = 0');
  console.log();
  console.log(`${'Strategy'.padEnd(22)} ${'Mean%'.padStart(8)} ${'t-stat'.padStart(8)} ${'p-value'.padStart(10)} ${'Sig?'.padStart(6)}`);

  for (const s of stratNames) {
    const returns = groups[s].map(t => t.pnl_pct);
    if (returns.length < 2) {
      console.log(`${s.padEnd(22)} ${(mean(returns) * 100).toFixed(2).padStart(8)} ${'N/A'.padStart(8)} ${'N/A'.padStart(10)} ${'n<2'.padStart(6)}`);
      continue;
    }
    const m = mean(returns);
    const se = std(returns) / Math.sqrt(returns.length);
    const t = se === 0 ? 0 : m / se;
    const df = returns.length - 1;
    const p = tDistPValue(Math.abs(t), df);
    const sig = p < 0.05;
    console.log(
      `${s.padEnd(22)} ${(m * 100).toFixed(2).padStart(8)} ${t.toFixed(3).padStart(8)} ${p.toFixed(6).padStart(10)} ${(sig ? 'YES **' : 'no').padStart(6)}`
    );
  }

  // --- Correlation matrix ---
  console.log();
  console.log('─── STRATEGY CORRELATION MATRIX (weekly returns) ───');

  const { strategies: corrStrats, series } = weeklyReturns(trades);
  // Only include strategies with enough data points
  const activeCorrStrats = corrStrats.filter(s => {
    const nonNull = series[s].filter(v => v !== null).length;
    return nonNull >= 3;
  });

  if (activeCorrStrats.length < 2) {
    console.log('  Too few strategies with >= 3 weekly data points for correlation');
  } else {
    const corrMatrix = {};
    const highCorrs = [];

    // Print header
    const shortNames = activeCorrStrats.map(s => s.slice(0, 8));
    console.log('         ' + shortNames.map(s => s.padStart(9)).join(''));

    for (let i = 0; i < activeCorrStrats.length; i++) {
      const row = activeCorrStrats[i];
      let line = row.slice(0, 8).padEnd(9);
      for (let j = 0; j < activeCorrStrats.length; j++) {
        const col = activeCorrStrats[j];
        if (i === j) {
          line += '    1.00 ';
          continue;
        }
        const { r, n } = pearsonCorrelation(series[row], series[col]);
        const key = [row, col].sort().join('|');
        if (!corrMatrix[key]) corrMatrix[key] = { r, n, a: row, b: col };
        if (!isNaN(r) && n >= 3) {
          line += `${r >= 0 ? ' ' : ''}${r.toFixed(2).padStart(6)}(${n}) `;
          if (Math.abs(r) > 0.6 && i < j) {
            highCorrs.push({ a: row, b: col, r, n });
          }
        } else {
          line += '     --- ';
        }
      }
      console.log(line);
    }

    if (highCorrs.length > 0) {
      console.log();
      console.log('─── HIGH CORRELATIONS (|r| > 0.6) ───');
      console.log('These strategies may be the same bet in different clothes:');
      highCorrs.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
      for (const { a, b, r, n } of highCorrs) {
        console.log(`  ${a} ↔ ${b}: r=${r.toFixed(3)} (${n} overlapping weeks)`);
      }
    } else {
      console.log();
      console.log('  No high correlations (|r| > 0.6) found — strategies appear independent');
    }
  }

  // --- Position sizing analysis (Coinflip 2 bug check) ---
  console.log();
  console.log('─── POSITION SIZING ANALYSIS ───');
  for (const s of ['coinflip_1', 'coinflip_2', 'coinflip_3']) {
    if (!groups[s]) continue;
    const trades = groups[s];
    console.log(`  ${s}:`);
    for (const t of trades) {
      console.log(`    ${t.closed_at?.slice(0, 10) || 'open'} | size=$${t.position_size.toFixed(2)} | pnl=$${t.pnl.toFixed(2)} | pnl%=${(t.pnl_pct * 100).toFixed(2)}% | ${t.asset} ${t.direction}`);
    }
  }

  // --- Save results ---
  const results = {
    generated_at: new Date().toISOString(),
    total_trades: trades.length,
    strategies: summaries,
    coinflip_comparison: {},
    high_correlations: [],
  };

  if (coinflipReturns.length >= 2) {
    for (const s of stratNames) {
      if (s.startsWith('coinflip')) continue;
      const returns = groups[s].map(t => t.pnl_pct);
      results.coinflip_comparison[s] = welchTTest(returns, coinflipReturns);
    }
  }

  writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));
  console.log();
  console.log(`Results saved to ${OUT_PATH}`);
}

run();
db.close();
