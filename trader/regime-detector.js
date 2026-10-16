#!/usr/bin/env node
/**
 * regime-detector.js — Read the other fighter's style in round 1.
 *
 * Classifies market into regimes:
 *   TRENDING_UP   — strong directional move upward
 *   TRENDING_DOWN — strong directional move downward
 *   RANGING       — price bouncing between levels, mean-reverting
 *   CHOPPY        — high volatility, no direction — worst regime, sit out
 *
 * Each regime tells the trader which strategies to trust and which to mute.
 * Like a boxing coach reading the opponent in round 1 before calling the gameplan.
 *
 * Uses: slope (trend), volatility ratio (energy), range-bound score (containment).
 * No external deps — pure math on price arrays.
 *
 * ESM.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SIGNALS_PATH = path.join(__dirname, 'signals', 'crypto-signals-latest.json');
const REGIME_PATH = path.join(__dirname, 'regime-state.json');

// Which strategies perform in which regime
// 1.0 = full weight, 0.5 = half weight, 0.0 = muted
const REGIME_STRATEGY_MAP = {
  TRENDING_UP: {
    historical_cycles: 0.3,   // cycle timing less relevant in strong trend
    lunar_cycles: 0.3,
    gann_geometry: 0.7,       // geometric levels still matter as targets
    fibonacci_time: 0.8,      // fib levels work as continuation targets
    harmonic_year: 0.5,
    harmonic_432: 0.5,
    sexagesimal_cycles: 0.6,  // convergence less useful when trend dominates
    range_trader: 0.0,        // ranging strategy in a trend = death
  },
  TRENDING_DOWN: {
    historical_cycles: 0.8,   // cycles often call tops well
    lunar_cycles: 0.5,
    gann_geometry: 0.9,       // geometric support levels = high value
    fibonacci_time: 0.9,      // fib retracements shine in downtrends
    harmonic_year: 0.7,
    harmonic_432: 0.6,
    sexagesimal_cycles: 0.9,  // our shorts align with the trend
    range_trader: 0.0,
  },
  RANGING: {
    historical_cycles: 0.5,
    lunar_cycles: 0.4,
    gann_geometry: 1.0,       // geometric levels = range boundaries
    fibonacci_time: 0.7,
    harmonic_year: 0.6,
    harmonic_432: 0.5,
    sexagesimal_cycles: 0.8,  // retracement levels = range levels
    range_trader: 1.0,        // this is its moment
  },
  CHOPPY: {
    historical_cycles: 0.2,
    lunar_cycles: 0.2,
    gann_geometry: 0.3,
    fibonacci_time: 0.3,
    harmonic_year: 0.2,
    harmonic_432: 0.2,
    sexagesimal_cycles: 0.3,
    range_trader: 0.3,
  },
};

function linearRegression(values) {
  const n = values.length;
  if (n < 2) return { slope: 0, r2: 0 };

  const xMean = (n - 1) / 2;
  const yMean = values.reduce((s, v) => s + v, 0) / n;

  let slopeNum = 0, slopeDen = 0, ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    slopeNum += (i - xMean) * (values[i] - yMean);
    slopeDen += (i - xMean) ** 2;
  }

  const slope = slopeDen !== 0 ? slopeNum / slopeDen : 0;
  const intercept = yMean - slope * xMean;

  for (let i = 0; i < n; i++) {
    const predicted = slope * i + intercept;
    ssRes += (values[i] - predicted) ** 2;
    ssTot += (values[i] - yMean) ** 2;
  }

  const r2 = ssTot !== 0 ? 1 - ssRes / ssTot : 0;
  return { slope, r2, intercept };
}

function stdDev(values) {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function dailyReturns(prices) {
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  return returns;
}

/**
 * Detect market regime for a single asset.
 *
 * @param {number[]} prices — daily prices, oldest first
 * @param {string} symbol — for labeling
 * @returns {{ regime, confidence, metrics, strategy_multipliers }}
 */
export function detectRegime(prices, symbol = 'BTC') {
  if (!prices || prices.length < 14) {
    return { regime: 'UNKNOWN', confidence: 0, metrics: {}, strategy_multipliers: {} };
  }

  // Use last 30 days (or all if shorter)
  const window = prices.slice(-30);
  const shortWindow = prices.slice(-7);

  // 1. Trend — normalized slope (% per day)
  const { slope, r2 } = linearRegression(window);
  const avgPrice = window.reduce((s, v) => s + v, 0) / window.length;
  const normalizedSlope = (slope / avgPrice) * 100; // % per day
  const trendStrength = Math.abs(normalizedSlope);

  // 2. Volatility — short-term vs long-term return volatility
  const returns = dailyReturns(window);
  const shortReturns = dailyReturns(shortWindow);
  const longVol = stdDev(returns);
  const shortVol = shortReturns.length >= 3 ? stdDev(shortReturns) : longVol;
  const volRatio = longVol > 0 ? shortVol / longVol : 1;
  const annualizedVol = longVol * Math.sqrt(365) * 100; // annualized %

  // 3. Range-bound score — how much price stays within a band
  const high = Math.max(...window);
  const low = Math.min(...window);
  const range = high - low;
  const rangePct = range / avgPrice * 100;

  // Count how many days price is in the middle 60% of the range
  const lower = low + range * 0.2;
  const upper = high - range * 0.2;
  const daysInRange = window.filter(p => p >= lower && p <= upper).length;
  const rangeScore = daysInRange / window.length;

  // 4. Classify
  let regime, confidence;

  if (trendStrength > 0.3 && r2 > 0.4) {
    // Strong directional move with good fit
    regime = normalizedSlope > 0 ? 'TRENDING_UP' : 'TRENDING_DOWN';
    confidence = Math.min(r2 * 100, 95);
  } else if (rangePct < 15 && rangeScore > 0.5) {
    // Tight range, price staying contained
    regime = 'RANGING';
    confidence = Math.min(rangeScore * 100, 90);
  } else if (annualizedVol > 80 && trendStrength < 0.2) {
    // High volatility, no direction
    regime = 'CHOPPY';
    confidence = Math.min(annualizedVol / 1.5, 90);
  } else if (trendStrength > 0.15) {
    // Weak trend
    regime = normalizedSlope > 0 ? 'TRENDING_UP' : 'TRENDING_DOWN';
    confidence = Math.min(trendStrength * 150, 60);
  } else {
    // Default — not enough signal
    regime = rangePct < 20 ? 'RANGING' : 'CHOPPY';
    confidence = 40;
  }

  const multipliers = REGIME_STRATEGY_MAP[regime] || {};

  return {
    symbol,
    regime,
    confidence: Math.round(confidence),
    metrics: {
      trend_slope_pct_per_day: +normalizedSlope.toFixed(4),
      trend_r2: +r2.toFixed(3),
      annualized_vol_pct: +annualizedVol.toFixed(1),
      vol_ratio_short_long: +volRatio.toFixed(2),
      range_pct: +rangePct.toFixed(1),
      range_containment: +rangeScore.toFixed(2),
      days_analyzed: window.length,
    },
    strategy_multipliers: multipliers,
  };
}

/**
 * Detect regime for all assets and save state.
 *
 * @param {Object} history — { BTC: [prices], ETH: [prices], ... }
 * @returns {Object} — { BTC: {regime, ...}, ETH: {regime, ...}, ... }
 */
export function detectAllRegimes(history) {
  const regimes = {};
  for (const [sym, prices] of Object.entries(history)) {
    regimes[sym] = detectRegime(prices, sym);
  }
  return regimes;
}

/**
 * Apply regime multipliers to a signal's strength.
 */
export function applyRegimeFilter(signal, regime) {
  if (!regime || !regime.strategy_multipliers) return signal;
  const mult = regime.strategy_multipliers[signal.type] ?? 1.0;
  return {
    ...signal,
    strength: +(signal.strength * mult).toFixed(3),
    regime_multiplier: mult,
    regime: regime.regime,
  };
}

// ── Standalone run ──
async function main() {
  console.log('\n============================================================');
  console.log(`[REGIME DETECTOR] ${new Date().toISOString()}`);
  console.log('============================================================\n');

  // Load price history from cathedral strategies
  const { execFileSync } = await import('child_process');

  // Fetch history via python helper
  let history;
  try {
    const raw = execFileSync('python3', ['-c', `
import json, sys
sys.path.insert(0, '${path.join(__dirname, 'strategies')}')
from importlib.util import spec_from_file_location, module_from_spec
spec = spec_from_file_location('cs', '${path.join(__dirname, 'strategies', 'cathedral-strategies.py')}')
cs = module_from_spec(spec)
spec.loader.exec_module(cs)
h = cs.fetch_all_history(['BTC', 'ETH', 'SOL', 'AVAX', 'LINK'], days=30)
print(json.dumps(h))
`], { timeout: 30000 }).toString();
    history = JSON.parse(raw);
  } catch (e) {
    console.log('Failed to fetch history:', e.message);
    return;
  }

  const regimes = detectAllRegimes(history);

  for (const [sym, r] of Object.entries(regimes)) {
    const bar = r.regime.padEnd(15);
    console.log(`${sym.padEnd(5)} ${bar} (${r.confidence}% confidence)`);
    console.log(`       slope: ${r.metrics.trend_slope_pct_per_day}%/day | vol: ${r.metrics.annualized_vol_pct}% | range: ${r.metrics.range_pct}% | R²: ${r.metrics.trend_r2}`);

    // Show strategy adjustments
    const muted = Object.entries(r.strategy_multipliers).filter(([, v]) => v <= 0.3).map(([k]) => k);
    const boosted = Object.entries(r.strategy_multipliers).filter(([, v]) => v >= 0.8).map(([k]) => k);
    if (boosted.length) console.log(`       TRUST: ${boosted.join(', ')}`);
    if (muted.length) console.log(`       MUTE:  ${muted.join(', ')}`);
    console.log('');
  }

  // Save state
  const state = {
    timestamp: new Date().toISOString(),
    regimes,
    summary: Object.fromEntries(Object.entries(regimes).map(([k, v]) => [k, v.regime])),
  };
  fs.writeFileSync(REGIME_PATH, JSON.stringify(state, null, 2));
  console.log(`Saved → ${REGIME_PATH}`);
}

// Run standalone
if (process.argv[1] && process.argv[1].includes('regime-detector')) {
  main().catch(console.error);
}
