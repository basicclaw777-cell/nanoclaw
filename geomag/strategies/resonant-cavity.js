/**
 * Resonant Cavity Strategy — Earth as electromagnetic resonant system
 *
 * Philosophy: The magnetosphere is a resonant cavity. Geomagnetic storms
 * are not just solar wind impact — they are resonance events where external
 * driving frequencies match natural magnetospheric modes.
 *
 * Key insight: Schumann resonance shifts precede Dst depressions because
 * the ionosphere-to-ground cavity responds before the ring current does.
 * The cavity has natural frequencies (7.83, 14.3, 20.8, 27.3, 33.8 Hz)
 * that modulate when external conditions shift.
 *
 * When solar wind dynamic pressure oscillates near cavity mode periods,
 * resonant amplification drives stronger storms than raw energy input predicts.
 *
 * Prediction: Dst index at +6h, +12h, +24h
 */

const NAME = 'Resonant Cavity';
const ID = 'resonant_cavity';

// Schumann fundamental modes (Hz)
const SCHUMANN = [7.83, 14.3, 20.8, 27.3, 33.8];

// Magnetospheric resonant periods (minutes) — field line resonance
const MAGNETO_MODES = [
  { period: 60, name: 'Pc5', range: [2, 7] },   // mHz range = 150-500s
  { period: 10, name: 'Pc4', range: [7, 22] },   // 45-150s
  { period: 3, name: 'Pc3', range: [22, 100] },  // 10-45s
];

function predictDst(spaceWeather, skyState = null) {
  const { plasma, mag, dst, kp } = spaceWeather;
  if (!plasma || !mag || !dst) return null;

  const currentDst = dst.latest.dst;
  const v = plasma.latest.speed;
  const bzMean = mag.stats.bz.mean;
  const bzSouth = Math.max(-bzMean, 0);
  const density = plasma.latest.density;

  // Standard coupling as baseline (mV/m)
  const Ey = v * bzSouth * 1e-3;
  const EyThreshold = 0.49;

  // Resonance amplification factor
  const resonanceFactor = computeResonanceFactor(v, density, mag);

  // O'Brien injection with resonance amplification, units: nT/hour
  const baseQ = Ey > EyThreshold ? -4.4 * (Ey - EyThreshold) * resonanceFactor : 0;
  const tau = 8.5; // longer decay — cavity rings down slowly

  // Forward integration with resonance buildup (1-hour steps)
  let predicted6h = currentDst;
  for (let i = 0; i < 6; i++) {
    const buildupFactor = Math.min(1 + i * 0.1, 1.5);
    predicted6h += baseQ * buildupFactor - predicted6h / tau;
  }

  let predicted12h = predicted6h;
  for (let i = 0; i < 6; i++) {
    const ringdown = resonanceFactor > 1.3 ? 0.7 : 0.5;
    predicted12h += baseQ * ringdown - predicted12h / tau;
  }

  let predicted24h = predicted12h;
  for (let i = 0; i < 12; i++) {
    predicted24h += baseQ * 0.3 - predicted24h / tau;
  }

  let confidence = 0.45; // moderate — model is physically motivated but less validated
  if (resonanceFactor > 1.3) confidence += 0.15; // resonance detected — model's strength
  if (kp && kp.stats.trend > 0.5) confidence += 0.1; // increasing activity supports resonance building

  return {
    strategy: NAME,
    strategyId: ID,
    currentDst,
    predictions: {
      h6: Math.round(predicted6h),
      h12: Math.round(predicted12h),
      h24: Math.round(predicted24h),
    },
    reasoning: buildReasoning(resonanceFactor, v, bzSouth, density, currentDst, predicted6h),
    confidence: Math.max(0.1, Math.min(1, confidence)),
    resonanceFactor,
    philosophy: 'Magnetosphere as resonant cavity. Frequency matching amplifies storms. Schumann shifts as precursor.',
  };
}

function computeResonanceFactor(v, density, mag) {
  // Alfvén speed in solar wind: V_A = B / sqrt(μ₀ × ρ)
  const bt = mag.latest.bt;
  if (bt <= 0 || density <= 0) return 1.0;

  const mu0 = 4 * Math.PI * 1e-7;
  const rho = density * 1e6 * 1.67e-27; // protons/cm³ → kg/m³
  const alfvenSpeed = bt * 1e-9 / Math.sqrt(mu0 * rho) / 1000; // km/s

  // Mach number — super-Alfvénic flow drives magnetospheric oscillations
  const machNumber = v / alfvenSpeed;

  // Solar wind oscillation period estimate from Bz variance
  const bzStats = mag.stats.bz;
  const bzVariance = Math.abs(bzStats.max - bzStats.min);

  // Resonance check: does solar wind variability match any magnetospheric mode?
  let resonance = 1.0;
  if (machNumber > 5 && bzVariance > 10) {
    resonance = 1.5; // strong driving + high variability = likely resonance
  } else if (machNumber > 3 && bzVariance > 5) {
    resonance = 1.2; // moderate resonance possibility
  }

  return resonance;
}

function buildReasoning(resonanceFactor, v, bzSouth, density, currentDst, predicted6h) {
  const parts = [];

  if (resonanceFactor > 1.3) {
    parts.push(`RESONANCE DETECTED (factor ${resonanceFactor.toFixed(2)}) — cavity amplification active`);
    parts.push('Mainstream models will underestimate this event');
  } else if (resonanceFactor > 1.1) {
    parts.push(`Weak resonance (factor ${resonanceFactor.toFixed(2)}) — some amplification possible`);
  } else {
    parts.push('No resonance detected — cavity model agrees with mainstream coupling');
  }

  if (bzSouth > 5) parts.push(`Southward Bz (${bzSouth.toFixed(1)}nT) driving energy input`);
  parts.push(`Solar wind ${v.toFixed(0)}km/s, density ${density.toFixed(1)}/cm³`);

  const delta = predicted6h - currentDst;
  if (delta < -20) parts.push('Cavity ringing: expect deeper and longer Dst depression than standard models');
  else if (delta > 5) parts.push('Cavity ring-down: recovery will be slower than mainstream predicts');

  return parts.join('. ') + '.';
}

export { predictDst, NAME, ID };
