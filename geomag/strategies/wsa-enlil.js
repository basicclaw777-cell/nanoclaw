/**
 * WSA-Enlil Strategy — Mainstream solar wind propagation model
 *
 * Philosophy: Standard physics. Solar wind speed + density + Bz orientation
 * predict Dst depression via the Burton-McPherron-Russell coupling function.
 * The establishment approach — well-tested, conservative, misses edge cases.
 *
 * Prediction: Dst index at +6h, +12h, +24h
 */

const NAME = 'WSA-Enlil';
const ID = 'wsa_enlil';

/**
 * Burton-McPherron-Russell simplified coupling function.
 * dDst/dt = a * VBs - b * Dst
 *
 * Where:
 *   VBs = solar wind velocity × southward Bz (the energy input)
 *   a = injection rate (~-4.4e-6)
 *   b = decay rate (~3.6e-5 /s ≈ 1/7.7h)
 */
function predictDst(spaceWeather, horizon = 24) {
  const { plasma, mag, dst } = spaceWeather;
  if (!plasma || !mag || !dst) return null;

  const currentDst = dst.latest.dst;
  const v = plasma.latest.speed; // km/s
  // Use mean Bz over the 2h window, not instantaneous — reduces noise
  const bzMean = mag.stats.bz.mean;
  const bzSouth = Math.max(-bzMean, 0); // only southward component drives storms

  // O'Brien & McPherron (2000) revised Burton equation:
  // dDst*/dt = Q(Ey) - Dst*/tau(Ey)
  // Ey = V * Bs (dawn-dusk electric field, mV/m)
  // Q = -4.4 * (Ey - 0.49) when Ey > 0.49, else 0
  // tau depends on Ey: tau = 2.4 * exp(9.74 / (4.69 + Ey)) hours
  const Ey = v * bzSouth * 1e-3; // mV/m
  const EyThreshold = 0.49; // mV/m, below this no injection

  // Euler forward integration, 1-hour steps
  let predictedDst = currentDst;

  for (let i = 0; i < horizon; i++) {
    // Injection only above threshold
    const Q = Ey > EyThreshold ? -4.4 * (Ey - EyThreshold) : 0; // nT/hour
    // Dynamic decay timescale
    const tau = 2.4 * Math.exp(9.74 / (4.69 + Ey)); // hours
    const decay = -predictedDst / tau; // nT/hour (restoring toward 0)
    predictedDst += Q + decay;
  }

  // Confidence based on data quality
  let confidence = 0.7; // base
  if (v > 600) confidence -= 0.1; // high speed = more uncertain
  if (bzSouth > 15) confidence -= 0.1; // extreme Bz = model less accurate
  if (dst.count < 12) confidence -= 0.2; // insufficient history

  return {
    strategy: NAME,
    strategyId: ID,
    currentDst,
    predictions: {
      h6: horizon >= 6 ? Math.round(predictedDst) : null,
      h12: horizon >= 12 ? extrapolate(currentDst, Ey, 12) : null,
      h24: horizon >= 24 ? extrapolate(currentDst, Ey, 24) : null,
    },
    reasoning: buildReasoning(v, bzMean, bzSouth, currentDst, predictedDst),
    confidence: Math.max(0.1, Math.min(1, confidence)),
    philosophy: 'Standard solar wind coupling. Burton equation. Conservative.',
  };
}

function extrapolate(currentDst, Ey, hours) {
  let dst = currentDst;
  const EyThreshold = 0.49;
  for (let i = 0; i < hours; i++) {
    const Q = Ey > EyThreshold ? -4.4 * (Ey - EyThreshold) : 0;
    const tau = 2.4 * Math.exp(9.74 / (4.69 + Ey));
    dst += Q - dst / tau;
  }
  return Math.round(dst);
}

function buildReasoning(v, bz, bzSouth, currentDst, predictedDst) {
  const parts = [];
  if (bzSouth > 10) parts.push(`Strong southward Bz (${bz.toFixed(1)}nT) — significant energy coupling`);
  else if (bzSouth > 5) parts.push(`Moderate southward Bz (${bz.toFixed(1)}nT) — storm driving`);
  else if (bzSouth > 0) parts.push(`Weak southward Bz (${bz.toFixed(1)}nT) — mild coupling`);
  else parts.push(`Northward Bz (${bz.toFixed(1)}nT) — shielded, recovery expected`);

  if (v > 600) parts.push(`Fast solar wind (${v.toFixed(0)}km/s) — high energy input`);
  else if (v > 400) parts.push(`Moderate solar wind (${v.toFixed(0)}km/s)`);
  else parts.push(`Slow solar wind (${v.toFixed(0)}km/s) — minimal driving`);

  const delta = predictedDst - currentDst;
  if (delta < -20) parts.push(`Expecting significant Dst depression (${delta.toFixed(0)}nT drop)`);
  else if (delta < -5) parts.push(`Expecting mild Dst decrease`);
  else if (delta > 5) parts.push(`Expecting recovery toward quiet levels`);
  else parts.push('Expecting stable conditions');

  return parts.join('. ') + '.';
}

export { predictDst, NAME, ID };
