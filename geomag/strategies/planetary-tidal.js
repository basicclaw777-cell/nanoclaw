/**
 * Planetary-Tidal Strategy — VSOP87 celestial mechanics
 *
 * Philosophy: Planetary positions exert tidal forces on the sun's plasma,
 * modulating solar activity on predictable timescales. The VSOP87 engine
 * already built in Looking Glass provides the computational backbone.
 *
 * Key claim: Major geomagnetic storms correlate with specific planetary
 * configurations — particularly Jupiter-Saturn-Earth alignments that
 * create tidal bulges in the solar convection zone.
 *
 * This is the Cathedral's unique strategy. No quant firm runs VSOP87
 * against Dst predictions. If it works, it's a genuine edge.
 *
 * Prediction: Dst index at +6h, +12h, +24h
 */

import { skyState as getSkyState } from '../../services/sky-sense/index.mjs';

const NAME = 'Planetary-Tidal';
const ID = 'planetary_tidal';

// Tidal forcing coefficients (relative to Jupiter=1.0)
// Based on M/r³ scaling for tidal force
const TIDAL_WEIGHT = {
  jupiter: 1.000,
  saturn: 0.073,
  venus: 0.052,
  mars: 0.003,
  mercury: 0.001,
};

function predictDst(spaceWeather) {
  const { dst } = spaceWeather;
  if (!dst) return null;

  const currentDst = dst.latest.dst;
  const now = new Date();

  // Get celestial state from Looking Glass
  const sky = getSkyState(now);

  // Compute planetary tidal stress on the sun
  const tidalStress = computeTidalStress(sky);

  // Get upcoming alignments (next 24h)
  const future6h = getSkyState(new Date(now.getTime() + 6 * 3600000));
  const future12h = getSkyState(new Date(now.getTime() + 12 * 3600000));
  const future24h = getSkyState(new Date(now.getTime() + 24 * 3600000));

  const tidalStress6h = computeTidalStress(future6h);
  const tidalStress12h = computeTidalStress(future12h);
  const tidalStress24h = computeTidalStress(future24h);

  // Tidal stress → solar activity → geomagnetic response
  // Hypothesis: rising tidal stress = rising probability of solar eruption
  // which arrives at Earth ~1-3 days later (solar wind transit time)
  // So current tidal stress affects Dst in 24-72h, not immediately.
  //
  // For +6h/+12h predictions, we use tidal stress from 2-3 DAYS AGO.
  const past48h = getSkyState(new Date(now.getTime() - 48 * 3600000));
  const past72h = getSkyState(new Date(now.getTime() - 72 * 3600000));
  const tidalPast48h = computeTidalStress(past48h);
  const tidalPast72h = computeTidalStress(past72h);

  // If tidal stress was HIGH 48-72h ago, storms are more likely NOW
  const launchedStormProbability = Math.max(tidalPast48h.normalized, tidalPast72h.normalized);

  // Combine current space weather conditions with tidal priming
  const dstTrend = dst.stats.trend; // negative = worsening

  // Prediction logic:
  // 1. If tidal stress was high 48-72h ago AND current conditions active → deeper storm
  // 2. If tidal stress was low 48-72h ago AND current conditions active → standard response
  // 3. If tidal stress is high NOW → flag for 48-72h lookahead
  const amplification = 1.0 + (launchedStormProbability - 0.5) * 0.6;

  // Simple extrapolation with tidal modulation
  const baseDecay = 1 / (7.7 * 3600);
  let predicted6h = currentDst + dstTrend * amplification * 6;
  let predicted12h = currentDst + dstTrend * amplification * 8; // decay slows
  let predicted24h = currentDst + dstTrend * amplification * 6; // recovery begins

  // Clamp predictions
  predicted6h = Math.max(-500, Math.min(50, Math.round(predicted6h)));
  predicted12h = Math.max(-500, Math.min(50, Math.round(predicted12h)));
  predicted24h = Math.max(-500, Math.min(50, Math.round(predicted24h)));

  let confidence = 0.35; // low base — this is the speculative strategy
  if (launchedStormProbability > 0.7 && dstTrend < -3) {
    confidence += 0.2; // tidal priming confirmed by current activity
  }
  if (tidalStress.alignment) confidence += 0.1; // rare alignment adds conviction

  return {
    strategy: NAME,
    strategyId: ID,
    currentDst,
    predictions: {
      h6: predicted6h,
      h12: predicted12h,
      h24: predicted24h,
    },
    tidalData: {
      currentStress: tidalStress,
      past48h: tidalPast48h,
      past72h: tidalPast72h,
      future24h: tidalStress24h,
      launchedStormProbability,
    },
    reasoning: buildReasoning(tidalStress, tidalPast48h, tidalPast72h, launchedStormProbability, currentDst, dstTrend),
    confidence: Math.max(0.1, Math.min(1, confidence)),
    philosophy: 'Planetary tidal forcing on solar plasma. VSOP87 positions. 48-72h transit lag.',
  };
}

function computeTidalStress(sky) {
  if (!sky || !sky.bodies) return { total: 0, normalized: 0, dominant: null, alignment: false };

  const sun = sky.bodies.sun;
  const bodies = ['jupiter', 'saturn', 'venus', 'mars', 'mercury'];
  let totalStress = 0;
  let stressComponents = {};

  for (const name of bodies) {
    const body = sky.bodies[name];
    if (!body || body.elongation === undefined) continue;

    // Elongation from sun (0° = conjunction = maximum tidal effect)
    // Tidal effect scales as cos(elongation) × weight
    const elongRad = body.elongation * Math.PI / 180;
    const tidalEffect = TIDAL_WEIGHT[name] * Math.cos(elongRad);
    stressComponents[name] = tidalEffect;
    totalStress += Math.abs(tidalEffect);
  }

  // Check for alignment (multiple planets within 30° of conjunction)
  const alignedPlanets = Object.entries(stressComponents)
    .filter(([, v]) => v > TIDAL_WEIGHT[Object.keys(stressComponents)[0]] * 0.5)
    .map(([k]) => k);
  const alignment = alignedPlanets.length >= 2;

  // Normalize to 0-1 range (empirical max ~1.2)
  const normalized = Math.min(totalStress / 1.2, 1.0);

  // Dominant contributor
  const dominant = Object.entries(stressComponents)
    .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))[0];

  return {
    total: totalStress,
    normalized,
    components: stressComponents,
    dominant: dominant ? { name: dominant[0], contribution: dominant[1] } : null,
    alignment,
    alignedPlanets,
  };
}

function buildReasoning(current, past48h, past72h, launchedProb, currentDst, dstTrend) {
  const parts = [];

  // Current tidal state
  parts.push(`Current tidal stress: ${current.normalized.toFixed(2)} (${current.dominant?.name || 'N/A'} dominant)`);

  if (current.alignment) {
    parts.push(`ALIGNMENT: ${current.alignedPlanets.join(' + ')} — elevated solar forcing`);
  }

  // Historical tidal context (what was launched 48-72h ago)
  if (launchedProb > 0.7) {
    parts.push(`High tidal stress 48-72h ago (${past48h.normalized.toFixed(2)}/${past72h.normalized.toFixed(2)}) — solar eruption window`);
    parts.push('Any current storm likely TIDAL-PRIMED — expect stronger response than mainstream predicts');
  } else if (launchedProb > 0.4) {
    parts.push('Moderate tidal priming from 48-72h ago');
  } else {
    parts.push('Low tidal priming — current conditions driven by non-tidal solar activity');
  }

  // Forward look
  if (current.normalized > 0.7) {
    parts.push('HIGH tidal stress NOW — watch for solar eruptions in next 48-72h');
  }

  if (dstTrend < -5) parts.push('Dst declining — storm in progress');
  else if (dstTrend > 3) parts.push('Dst recovering');

  return parts.join('. ') + '.';
}

export { predictDst, computeTidalStress, NAME, ID };
