/**
 * backtester.js — Run prediction strategies against historical storm data
 *
 * Scores each strategy by comparing predictions vs actual Dst outcomes.
 * Planetary-Tidal runs immediately (VSOP87 computes any date).
 * Solar wind strategies need historical plasma/mag data.
 *
 * ESM.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { findStorms } from './historical-loader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'historical');
const RESULTS_DIR = path.join(__dirname, 'backtest-results');

if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

/**
 * Load all strategies dynamically.
 */
async function loadStrategies() {
  const strategies = [];

  // Planetary-Tidal — always available (VSOP87, no external data needed)
  try {
    const pt = await import('./strategies/planetary-tidal.js');
    strategies.push({ id: 'planetary_tidal', name: pt.NAME, predict: pt.predictDst, needsSolarWind: false });
  } catch (e) { console.error('Failed to load planetary-tidal:', e.message); }

  // These need historical solar wind data
  try {
    const wsa = await import('./strategies/wsa-enlil.js');
    strategies.push({ id: 'wsa_enlil', name: wsa.NAME, predict: wsa.predictDst, needsSolarWind: true });
  } catch (e) { console.error('Failed to load wsa-enlil:', e.message); }

  try {
    const eu = await import('./strategies/electric-universe.js');
    strategies.push({ id: 'electric_universe', name: eu.NAME, predict: eu.predictDst, needsSolarWind: true });
  } catch (e) { console.error('Failed to load electric-universe:', e.message); }

  try {
    const rc = await import('./strategies/resonant-cavity.js');
    strategies.push({ id: 'resonant_cavity', name: rc.NAME, predict: rc.predictDst, needsSolarWind: true });
  } catch (e) { console.error('Failed to load resonant-cavity:', e.message); }

  return strategies;
}

/**
 * Build a minimal spaceWeather object from historical Dst records.
 * For Planetary-Tidal: only needs dst block.
 * For solar wind strategies: also needs plasma + mag (from OMNI data if available).
 */
function buildSpaceWeather(records, targetIdx, solarWindData = null) {
  const target = records[targetIdx];
  const currentDst = target.dst;

  // Compute Dst trend from previous hours
  const windowStart = Math.max(0, targetIdx - 6);
  const window = records.slice(windowStart, targetIdx + 1);
  const dstValues = window.map(r => r.dst);

  // Linear trend (nT/hour)
  let trend = 0;
  if (dstValues.length >= 3) {
    const n = dstValues.length;
    const xMean = (n - 1) / 2;
    const yMean = dstValues.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - xMean) * (dstValues[i] - yMean);
      den += (i - xMean) * (i - xMean);
    }
    trend = den > 0 ? num / den : 0;
  }

  const sw = {
    dst: {
      latest: { dst: currentDst, time: target.time },
      stats: {
        trend,
        mean: dstValues.reduce((a, b) => a + b, 0) / dstValues.length,
        min: Math.min(...dstValues),
        max: Math.max(...dstValues),
      },
      count: dstValues.length,
    },
  };

  // Add solar wind if available
  if (solarWindData) {
    const hour = new Date(target.time).toISOString().slice(0, 13);
    const swRecord = solarWindData[hour];
    if (swRecord) {
      sw.plasma = {
        latest: { speed: swRecord.speed, density: swRecord.density },
      };
      sw.mag = {
        latest: { bz: swRecord.bz, bt: swRecord.bt },
        stats: {
          bz: {
            mean: swRecord.bz,
            min: swRecord.bz - 3,
            max: swRecord.bz + 3,
          },
        },
        southwardMinutes: swRecord.bz < 0 ? 60 : 0,
      };
      if (swRecord.xrayFlux) {
        sw.xray = {
          latest: { flux: swRecord.xrayFlux, class: classifyXray(swRecord.xrayFlux) },
        };
      }
    }
  }

  return sw;
}

function classifyXray(flux) {
  if (flux >= 1e-4) return 'X';
  if (flux >= 1e-5) return 'M';
  if (flux >= 1e-6) return 'C';
  if (flux >= 1e-7) return 'B';
  return 'A';
}

/**
 * Find actual Dst values at +6h, +12h, +24h from a given index.
 */
function getActualOutcomes(records, idx) {
  const outcomes = {};
  for (const [label, offset] of [['h6', 6], ['h12', 12], ['h24', 24]]) {
    const futureIdx = idx + offset;
    if (futureIdx < records.length) {
      outcomes[label] = records[futureIdx].dst;
    }
  }
  return outcomes;
}

/**
 * Score a single prediction against actual outcomes.
 */
function scorePrediction(prediction, actual) {
  if (!prediction || !prediction.predictions) return null;

  const scores = {};
  for (const horizon of ['h6', 'h12', 'h24']) {
    const pred = prediction.predictions[horizon];
    const act = actual[horizon];
    if (pred != null && act != null) {
      const error = pred - act;
      const absError = Math.abs(error);
      const pctError = act !== 0 ? Math.abs(error / act) * 100 : absError;
      scores[horizon] = { predicted: pred, actual: act, error, absError, pctError };
    }
  }
  return scores;
}

/**
 * Run backtester against a year of storms.
 */
async function backtest(year, options = {}) {
  const { threshold = -50, predictionPoint = 'onset', solarWindData = null } = options;

  // Load historical Dst
  const cachePath = path.join(DATA_DIR, `dst-${year}.json`);
  if (!fs.existsSync(cachePath)) {
    console.error(`No historical data for ${year}. Run: node historical-loader.js ${year}`);
    return null;
  }
  const records = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  console.log(`Loaded ${records.length} hourly records for ${year}`);

  // Find storms
  const storms = findStorms(records, threshold);
  console.log(`Found ${storms.length} storms (Dst < ${threshold}nT)\n`);

  // Load strategies
  const strategies = await loadStrategies();
  const hasSolarWind = solarWindData != null;
  const activeStrategies = strategies.filter(s => !s.needsSolarWind || hasSolarWind);
  console.log(`Active strategies: ${activeStrategies.map(s => s.name).join(', ')}`);
  if (!hasSolarWind) {
    console.log(`(Solar wind strategies skipped — no historical plasma/mag data)\n`);
  }

  // Results accumulator
  const results = {};
  for (const s of activeStrategies) {
    results[s.id] = {
      name: s.name,
      predictions: [],
      totalError: { h6: 0, h12: 0, h24: 0 },
      totalAbsError: { h6: 0, h12: 0, h24: 0 },
      count: { h6: 0, h12: 0, h24: 0 },
      correctDirection: { h6: 0, h12: 0, h24: 0 },
      directionCount: { h6: 0, h12: 0, h24: 0 },
    };
  }

  // For each storm, predict at onset (first hour below threshold)
  for (const storm of storms) {
    // Find the index in records for storm onset
    const onsetTime = storm.start;
    const onsetIdx = records.findIndex(r => r.time === onsetTime);
    if (onsetIdx < 0) continue;

    // Pick prediction point: onset or 6h before minimum
    let predIdx;
    if (predictionPoint === 'pre-minimum') {
      const minIdx = records.findIndex(r => r.time === storm.minTime);
      predIdx = Math.max(0, minIdx - 6);
    } else {
      predIdx = onsetIdx;
    }

    const actual = getActualOutcomes(records, predIdx);
    if (!actual.h6) continue; // need at least 6h ahead

    for (const strategy of activeStrategies) {
      const sw = buildSpaceWeather(records, predIdx, solarWindData);
      try {
        const prediction = strategy.predict(sw);
        const scores = scorePrediction(prediction, actual);
        if (!scores) continue;

        const result = {
          stormStart: storm.start,
          stormMinDst: storm.minDst,
          predictionTime: records[predIdx].time,
          currentDst: records[predIdx].dst,
          prediction: prediction.predictions,
          actual,
          scores,
          confidence: prediction.confidence,
        };

        results[strategy.id].predictions.push(result);

        // Accumulate errors
        for (const h of ['h6', 'h12', 'h24']) {
          if (scores[h]) {
            results[strategy.id].totalError[h] += scores[h].error;
            results[strategy.id].totalAbsError[h] += scores[h].absError;
            results[strategy.id].count[h]++;

            // Direction accuracy: did it predict deepening/recovery correctly?
            const actualDirection = actual[h] - records[predIdx].dst;
            const predDirection = prediction.predictions[h] - records[predIdx].dst;
            results[strategy.id].directionCount[h]++;
            if ((actualDirection < 0 && predDirection < 0) || (actualDirection >= 0 && predDirection >= 0)) {
              results[strategy.id].correctDirection[h]++;
            }
          }
        }
      } catch (e) {
        // Strategy failed on this storm — skip silently
      }
    }
  }

  // Compute summary stats
  const leaderboard = [];
  for (const [id, data] of Object.entries(results)) {
    const summary = {
      id,
      name: data.name,
      stormsScored: data.count.h6,
      metrics: {},
    };

    for (const h of ['h6', 'h12', 'h24']) {
      if (data.count[h] > 0) {
        summary.metrics[h] = {
          meanError: data.totalError[h] / data.count[h],
          meanAbsError: data.totalAbsError[h] / data.count[h],
          directionAccuracy: data.directionCount[h] > 0
            ? (data.correctDirection[h] / data.directionCount[h] * 100).toFixed(1)
            : 'N/A',
          count: data.count[h],
        };
      }
    }

    leaderboard.push(summary);
  }

  // Sort by h6 mean absolute error (lower = better)
  leaderboard.sort((a, b) => {
    const aErr = a.metrics.h6?.meanAbsError ?? Infinity;
    const bErr = b.metrics.h6?.meanAbsError ?? Infinity;
    return aErr - bErr;
  });

  // Save full results
  const output = {
    year,
    threshold,
    predictionPoint,
    totalStorms: storms.length,
    hasSolarWind,
    leaderboard,
    details: results,
    generatedAt: new Date().toISOString(),
  };

  const outPath = path.join(RESULTS_DIR, `backtest-${year}.json`);
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  return output;
}

/**
 * Print leaderboard to console.
 */
function printLeaderboard(output) {
  if (!output) return;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  BACKTEST LEADERBOARD — ${output.year} (${output.totalStorms} storms, Dst < ${output.threshold}nT)`);
  console.log(`${'='.repeat(70)}\n`);

  for (let i = 0; i < output.leaderboard.length; i++) {
    const entry = output.leaderboard[i];
    const rank = i + 1;
    console.log(`  #${rank} ${entry.name} (${entry.stormsScored} storms scored)`);

    for (const h of ['h6', 'h12', 'h24']) {
      const m = entry.metrics[h];
      if (m) {
        const bias = m.meanError > 0 ? `+${m.meanError.toFixed(1)}` : m.meanError.toFixed(1);
        console.log(`      ${h}: MAE ${m.meanAbsError.toFixed(1)}nT | bias ${bias}nT | direction ${m.directionAccuracy}% | n=${m.count}`);
      }
    }
    console.log();
  }

  // Print top 10 storm detail for best strategy
  const best = output.leaderboard[0];
  if (best) {
    const details = output.details[best.id];
    const topStorms = details.predictions
      .sort((a, b) => a.stormMinDst - b.stormMinDst)
      .slice(0, 10);

    console.log(`--- Top 10 storms, ${best.name} predictions ---\n`);
    console.log('  Storm Date          | Min Dst | At Pred | Pred@6h | Actual@6h | Error');
    console.log('  ' + '-'.repeat(75));

    for (const s of topStorms) {
      const date = new Date(s.stormStart).toISOString().slice(0, 16);
      const err6 = s.scores.h6 ? `${s.scores.h6.error > 0 ? '+' : ''}${s.scores.h6.error}nT` : 'N/A';
      const pred6 = s.scores.h6 ? `${s.prediction.h6}nT` : 'N/A';
      const act6 = s.scores.h6 ? `${s.actual.h6}nT` : 'N/A';
      console.log(`  ${date} | ${String(s.stormMinDst).padStart(6)}nT | ${String(s.currentDst).padStart(6)}nT | ${pred6.padStart(7)} | ${act6.padStart(9)} | ${err6}`);
    }
  }
}

/**
 * Reconstruct approximate solar wind conditions from Dst data.
 * Uses empirical statistical relationships from O'Brien & McPherron (2000)
 * and Gonzalez et al. (1994) to estimate Bz, speed, density from Dst changes.
 *
 * NOT circular: reconstructs plausible physical conditions, then each strategy
 * applies its OWN physics to those conditions. Different strategies weight
 * speed vs Bz vs density differently, so they diverge.
 */
function reconstructSolarWind(records) {
  console.log('  Reconstructing solar wind from Dst empirical relationships...');
  const data = {};

  for (let i = 1; i < records.length; i++) {
    const dst = records[i].dst;
    const prevDst = records[i - 1].dst;
    const dDstDt = dst - prevDst; // nT/hour
    const hour = new Date(records[i].time).toISOString().slice(0, 13);

    // Empirical speed-Dst relationship (Gonzalez et al. 1994, Richardson & Cane 2010):
    // Storms with deeper Dst tend to have faster solar wind
    // v ≈ 400 + 0.8 * |min_Dst_recent| (capped at 900)
    const recentMinDst = Math.min(dst, prevDst);
    const speed = Math.min(900, Math.max(350, 400 + 0.8 * Math.abs(recentMinDst)));

    // Bz from Dst rate of change:
    // From Burton: Q = dDst/dt + Dst/tau ≈ -4.4 * (Ey - 0.49)
    // Ey = v * Bs * 1e-3
    // Solve for Bs (southward Bz)
    const tau = 7.7; // hours (standard)
    const Q = dDstDt + dst / tau;
    let bz;
    if (Q < 0) {
      // Storm driving — reconstruct southward Bz
      const Ey = Math.max(0.49, (Q / -4.4) + 0.49);
      const bs = Ey / (speed * 1e-3);
      bz = -bs; // southward = negative
    } else {
      // Recovery — northward Bz
      bz = Math.min(5, Q * 0.5); // mild northward during recovery
    }

    // Density from empirical relationship:
    // Higher density during CME passage, correlates with storm depth
    const density = Math.max(2, Math.min(50, 5 + Math.abs(dDstDt) * 0.3 + Math.abs(dst) * 0.02));

    // Total field from Bz + random By component
    const bt = Math.max(Math.abs(bz), Math.abs(bz) * 1.3);

    data[hour] = { bz, speed, density, bt };
  }

  console.log(`  Reconstructed ${Object.keys(data).length} hourly solar wind records`);
  return data;
}

/**
 * Try to load OMNI2 historical solar wind data.
 * Falls back to empirical reconstruction from Dst if not available.
 */
function loadSolarWindData(year) {
  const swPath = path.join(DATA_DIR, `solar-wind-${year}.json`);
  if (fs.existsSync(swPath)) {
    console.log(`  Loading cached OMNI2 solar wind for ${year}`);
    return JSON.parse(fs.readFileSync(swPath, 'utf8'));
  }
  return null;
}

/**
 * Fetch NOAA OMNI2 hourly solar wind data for a year.
 * Source: NASA GSFC OMNIWeb
 */
async function fetchSolarWind(year) {
  console.log(`[backtest] Attempting to fetch OMNI2 solar wind for ${year}...`);

  // OMNI2 hourly data via OMNIWeb form
  const startDate = `${year}0101`;
  const endDate = `${year}1231`;

  // Try NOAA SWPC real-time archive first (only has recent data)
  // Then try NASA OMNI2
  const omniUrl = `https://omniweb.gsfc.nasa.gov/cgi/nx1.cgi`;
  const body = new URLSearchParams({
    activity: 'retrieve',
    res: 'hour',
    spacecraft: 'omni2',
    start_date: startDate,
    end_date: endDate,
    vars: '24,25,26,28', // 24=Bz, 25=speed, 26=density, 28=Bt
    output: 'text',
  });

  try {
    const res = await fetch(omniUrl, {
      method: 'POST',
      body: body.toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      console.error(`  OMNI2 fetch failed: ${res.status}`);
      return null;
    }

    const text = await res.text();
    return parseOmniData(text, year);
  } catch (e) {
    console.error(`  OMNI2 fetch error: ${e.message}`);
    console.log('  (VPN may be blocking NASA servers — try without VPN or use DeepSeek Tui)');
    return null;
  }
}

/**
 * Parse OMNI2 text output into hour-keyed lookup.
 */
function parseOmniData(text, year) {
  const lines = text.split('\n').filter(l => l.trim() && !l.startsWith('#') && /^\s*\d{4}/.test(l));
  const data = {};
  let parsed = 0;

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) continue;

    const yr = parseInt(parts[0]);
    const doy = parseInt(parts[1]);
    const hr = parseInt(parts[2]);

    // Convert DOY to date
    const date = new Date(yr, 0, doy);
    date.setHours(hr);
    const key = date.toISOString().slice(0, 13);

    const bz = parseFloat(parts[3]);
    const speed = parseFloat(parts[4]);
    const density = parseFloat(parts[5]);
    const bt = parts.length > 6 ? parseFloat(parts[6]) : Math.abs(bz) * 1.2;

    // OMNI uses 9999.9 or 999.9 for fill values
    if (bz > 999 || speed > 9999 || density > 999) continue;

    data[key] = { bz, speed, density, bt };
    parsed++;
  }

  if (parsed > 0) {
    console.log(`  Parsed ${parsed} hourly solar wind records`);
    const outPath = path.join(DATA_DIR, `solar-wind-${year}.json`);
    fs.writeFileSync(outPath, JSON.stringify(data));
    console.log(`  Cached to ${outPath}`);
    return data;
  }

  return null;
}

// CLI
if (process.argv[1]?.endsWith('backtester.js')) {
  const year = parseInt(process.argv[2]) || 2024;
  const threshold = parseInt(process.argv[3]) || -50;

  (async () => {
    // Try to load cached OMNI2 solar wind
    let solarWind = loadSolarWindData(year);

    // Try to fetch from NASA if not cached
    if (!solarWind) {
      solarWind = await fetchSolarWind(year);
    }

    // Fall back to empirical reconstruction from Dst
    if (!solarWind) {
      const cachePath = path.join(DATA_DIR, `dst-${year}.json`);
      if (fs.existsSync(cachePath)) {
        const records = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        solarWind = reconstructSolarWind(records);
        console.log('  (Using reconstructed solar wind — approximate, not measured)\n');
      }
    }

    const output = await backtest(year, {
      threshold,
      solarWindData: solarWind,
    });

    if (output) {
      printLeaderboard(output);
      console.log(`\nFull results saved to geomag/backtest-results/backtest-${year}.json`);
    }
  })();
}

export { backtest, printLeaderboard, loadSolarWindData, fetchSolarWind, reconstructSolarWind };
