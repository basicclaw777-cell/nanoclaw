/**
 * geomag-orchestrator.js — Geomagnetic Prediction Engine
 *
 * Experiment Lab Domain F1 — Track 1 of the Electromagnetic Spine.
 *
 * Runs the full prediction loop:
 * 1. Fetch space weather (NOAA SWPC)
 * 2. Score pending outcomes from previous runs
 * 3. Run 4 competing strategies
 * 4. Bull-bear debate on disagreements
 * 5. Log predictions + notify
 *
 * ESM. Runs via PM2 cron every 4 hours.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { fetchAllSpaceWeather } from './space-weather-fetcher.js';
import { logPrediction, logOutcome, scorePredictions, getPendingOutcomes, getLeaderboard } from './prediction-logger.js';

import { predictDst as wsaEnlil } from './strategies/wsa-enlil.js';
import { predictDst as electricUniverse } from './strategies/electric-universe.js';
import { predictDst as resonantCavity } from './strategies/resonant-cavity.js';
import { predictDst as planetaryTidal } from './strategies/planetary-tidal.js';

const BOT_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.PAUL_CHAT_ID;

const STRATEGIES = [
  { id: 'wsa_enlil', fn: wsaEnlil },
  { id: 'electric_universe', fn: electricUniverse },
  { id: 'resonant_cavity', fn: resonantCavity },
  { id: 'planetary_tidal', fn: planetaryTidal },
];

async function notify(message) {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log('[notify]', message);
    return;
  }
  try {
    const text = message.length > 4000 ? message.slice(0, 3990) + '...' : message;
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'Markdown' }),
    });
  } catch (e) {
    console.error('[notify] Telegram error:', e.message);
  }
}

// ── Step 1: Fetch space weather ──────────────────────────────────────────────

async function fetchData() {
  console.log('[1/4] Fetching space weather...');
  const data = await fetchAllSpaceWeather();
  if (!data || data.sources.dst === 'FAILED') {
    console.error('[geomag] Critical: Dst data unavailable');
    return null;
  }
  return data;
}

// ── Step 2: Score pending outcomes ───────────────────────────────────────────

async function scoreOutcomes(spaceWeather) {
  console.log('[2/4] Scoring pending outcomes...');
  const pending = getPendingOutcomes();
  if (pending.length === 0) {
    console.log('  No pending outcomes to score');
    return;
  }

  const currentDst = spaceWeather.dst.latest.dst;
  const now = new Date();
  let scored = 0;

  for (const run of pending) {
    const runTime = new Date(run.timestamp);
    const hoursSince = (now - runTime) / 3600000;

    // Score h6 predictions after 6+ hours
    if (hoursSince >= 6 && run.any_h6 !== null) {
      logOutcome(run.run_id, 'h6', now.toISOString(), currentDst);
      const scores = scorePredictions(run.run_id, 'h6', currentDst);
      if (scores.length > 0) {
        const winner = scores[0];
        console.log(`  Scored h6 (run ${run.run_id.slice(0, 8)}): winner=${winner.strategy} (error=${winner.error.toFixed(1)}nT)`);
        scored++;
      }
    }

    // Score h12 predictions after 12+ hours
    if (hoursSince >= 12 && run.any_h12 !== null) {
      logOutcome(run.run_id, 'h12', now.toISOString(), currentDst);
      scored++;
    }

    // Score h24 predictions after 24+ hours
    if (hoursSince >= 24 && run.any_h24 !== null) {
      logOutcome(run.run_id, 'h24', now.toISOString(), currentDst);
      scored++;
    }
  }

  console.log(`  Scored ${scored} outcomes from ${pending.length} pending runs`);
}

// ── Step 3: Run strategies ───────────────────────────────────────────────────

function runStrategies(spaceWeather) {
  console.log('[3/4] Running 4 competing strategies...');
  const results = [];

  for (const { id, fn } of STRATEGIES) {
    try {
      const prediction = fn(spaceWeather);
      if (prediction) {
        results.push(prediction);
        console.log(`  ${prediction.strategy}: h6=${prediction.predictions.h6}nT, h12=${prediction.predictions.h12}nT, h24=${prediction.predictions.h24}nT (conf=${prediction.confidence.toFixed(2)})`);
      } else {
        console.log(`  ${id}: insufficient data`);
      }
    } catch (e) {
      console.error(`  ${id}: ERROR — ${e.message}`);
    }
  }

  return results;
}

// ── Step 4: Analyze disagreements + log + notify ─────────────────────────────

async function analyzeAndLog(spaceWeather, predictions) {
  console.log('[4/4] Analyzing disagreements, logging predictions...');

  if (predictions.length === 0) {
    console.log('  No predictions to analyze');
    return;
  }

  const runId = crypto.randomUUID().slice(0, 12);

  // Log all predictions
  for (const p of predictions) {
    logPrediction(runId, p);
  }

  // Find disagreements
  const h6Values = predictions.map(p => p.predictions.h6).filter(v => v !== null);
  const h6Spread = Math.max(...h6Values) - Math.min(...h6Values);
  const h6Consensus = avg(h6Values);

  const mostBullish = predictions.reduce((a, b) =>
    (b.predictions.h6 || -999) > (a.predictions.h6 || -999) ? b : a);
  const mostBearish = predictions.reduce((a, b) =>
    (b.predictions.h6 || 0) < (a.predictions.h6 || 0) ? b : a);

  // Build briefing
  const activity = spaceWeather.activity;
  const currentDst = spaceWeather.dst.latest.dst;

  let briefing = `*GEOMAG PREDICTION — ${new Date().toISOString().slice(0, 16)}*\n\n`;
  briefing += `Activity: ${activity.level} (${activity.score.toFixed(1)}/10)\n`;
  if (activity.factors.length) briefing += `Drivers: ${activity.factors.join(', ')}\n`;
  briefing += `Current Dst: ${currentDst}nT (${spaceWeather.dst.stormLevel})\n\n`;

  briefing += `*Strategy Predictions (Dst @ +6h):*\n`;
  for (const p of predictions.sort((a, b) => a.predictions.h6 - b.predictions.h6)) {
    const emoji = p.predictions.h6 < currentDst - 10 ? '🔴' :
                  p.predictions.h6 > currentDst + 5 ? '🟢' : '🟡';
    briefing += `${emoji} ${p.strategy}: ${p.predictions.h6}nT (conf: ${(p.confidence * 100).toFixed(0)}%)\n`;
  }

  briefing += `\nConsensus h6: ${Math.round(h6Consensus)}nT | Spread: ${h6Spread.toFixed(0)}nT\n`;

  if (h6Spread > 30) {
    briefing += `\n⚠️ *MAJOR DISAGREEMENT* (spread ${h6Spread.toFixed(0)}nT)\n`;
    briefing += `Bull: ${mostBullish.strategy} (${mostBullish.predictions.h6}nT)\n`;
    briefing += `Bear: ${mostBearish.strategy} (${mostBearish.predictions.h6}nT)\n`;
  }

  // Planetary-tidal special data
  const tidal = predictions.find(p => p.strategyId === 'planetary_tidal');
  if (tidal && tidal.tidalData) {
    const td = tidal.tidalData;
    briefing += `\n*Tidal Context:*\n`;
    briefing += `Current stress: ${td.currentStress.normalized.toFixed(2)}`;
    if (td.currentStress.alignment) briefing += ` (ALIGNMENT: ${td.currentStress.alignedPlanets.join('+')})`;
    briefing += `\n`;
    briefing += `Storm priming (48-72h ago): ${td.launchedStormProbability.toFixed(2)}\n`;
  }

  // Leaderboard snapshot
  const leaderboard = getLeaderboard(30);
  if (leaderboard.length > 0 && leaderboard[0].avg_error_h6 !== null) {
    briefing += `\n*30-Day Leaderboard (avg h6 error):*\n`;
    for (const row of leaderboard) {
      if (row.avg_error_h6 !== null) {
        briefing += `${row.strategy_name}: ${row.avg_error_h6.toFixed(1)}nT (n=${row.total_predictions})\n`;
      }
    }
  }

  console.log(briefing.replace(/\*/g, ''));

  // Only notify if something interesting
  const shouldNotify = activity.score >= 3 || h6Spread > 20 || Math.abs(currentDst) > 30;
  if (shouldNotify) {
    await notify(briefing);
  } else {
    console.log('  Quiet conditions — skipping Telegram notification');
  }

  // Save run summary
  const summaryPath = path.join(__dirname, 'logs', `run-${runId}.json`);
  fs.writeFileSync(summaryPath, JSON.stringify({
    runId,
    timestamp: new Date().toISOString(),
    activity: spaceWeather.activity,
    currentDst,
    predictions: predictions.map(p => ({
      strategy: p.strategy,
      h6: p.predictions.h6,
      h12: p.predictions.h12,
      h24: p.predictions.h24,
      confidence: p.confidence,
    })),
    consensus: { h6: Math.round(h6Consensus), spread: h6Spread },
  }, null, 2));

  return { runId, consensus: h6Consensus, spread: h6Spread };
}

function avg(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log('\n========================================');
  console.log(`GEOMAG PREDICTION ENGINE — ${new Date().toISOString()}`);
  console.log('========================================\n');

  const spaceWeather = await fetchData();
  if (!spaceWeather) {
    console.error('ABORT: no space weather data');
    return;
  }

  await scoreOutcomes(spaceWeather);
  const predictions = runStrategies(spaceWeather);
  await analyzeAndLog(spaceWeather, predictions);

  console.log('\n[done]');
}

run().catch(e => {
  console.error('[geomag] Fatal:', e);
  process.exit(1);
});

export { run };
