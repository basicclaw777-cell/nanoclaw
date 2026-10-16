/**
 * Electric Universe Strategy — Plasma cosmology approach
 *
 * Philosophy: The heliosphere is a z-pinch plasma system, not a fluid.
 * Geomagnetic activity driven by external galactic current sheet interactions,
 * not just solar wind ram pressure. Birkeland currents, double layers,
 * and plasma instabilities are the real drivers.
 *
 * Key disagreement with mainstream: EU predicts that solar wind SPEED
 * matters more than Bz orientation because the magnetosphere is a plasma
 * discharge system, not a magnetic reconnection system.
 *
 * Prediction: Dst index at +6h, +12h, +24h
 */

const NAME = 'Electric Universe';
const ID = 'electric_universe';

function predictDst(spaceWeather) {
  const { plasma, mag, dst, xray } = spaceWeather;
  if (!plasma || !mag || !dst) return null;

  const currentDst = dst.latest.dst;
  const v = plasma.latest.speed;
  const density = plasma.latest.density;
  const bz = mag.latest.bz;
  const bt = mag.latest.bt; // total field strength

  // EU model: ram pressure (ρv²) is primary driver, not VBs coupling
  // Double layer voltage scales with v² × density
  const ramPressure = density * v * v * 1.67e-6; // nPa equivalent
  const electricField = bt * v * 1e-3; // total field × velocity (not just Bz)

  // EU predicts stronger response to velocity spikes than mainstream
  const velocityFactor = v > 700 ? 2.0 : v > 500 ? 1.3 : v > 400 ? 1.0 : 0.7;

  // X-ray flux as proxy for heliospheric current sheet disruption
  let flareFactor = 1.0;
  if (xray && xray.latest.flux) {
    if (xray.latest.flux > 1e-4) flareFactor = 1.8; // M-class or above
    else if (xray.latest.flux > 1e-5) flareFactor = 1.3; // C-class
  }

  // EU coupling: ram pressure driven. Units: nT/hour
  // Scaled so typical conditions produce ~few nT/hour change
  const dstRate = -0.8 * ramPressure * velocityFactor * flareFactor; // nT/hour

  // Decay: EU predicts faster recovery (currents reroute, not ring current decay)
  const tau = 5.0; // hours (faster than mainstream 7.7h)

  // Forward integration (1-hour steps)
  let predicted6h = currentDst;
  for (let i = 0; i < 6; i++) {
    predicted6h += dstRate - predicted6h / tau;
  }

  let predicted12h = predicted6h;
  for (let i = 0; i < 6; i++) {
    const reducedRate = dstRate * 0.8; // velocity drops after CME passage
    predicted12h += reducedRate - predicted12h / tau;
  }

  let predicted24h = predicted12h;
  for (let i = 0; i < 12; i++) {
    const reducedRate = dstRate * 0.5;
    predicted24h += reducedRate - predicted24h / tau;
  }

  // EU tends to predict MORE extreme events (claims mainstream underestimates)
  let confidence = 0.5; // lower base — EU is a minority view
  if (v > 600 && density > 10) confidence += 0.15; // EU's sweet spot: high ram pressure
  if (bt > 15) confidence += 0.1; // strong field supports plasma model

  const reasoning = buildReasoning(ramPressure, v, density, bt, flareFactor, currentDst, predicted6h);

  return {
    strategy: NAME,
    strategyId: ID,
    currentDst,
    predictions: {
      h6: Math.round(predicted6h),
      h12: Math.round(predicted12h),
      h24: Math.round(predicted24h),
    },
    reasoning,
    confidence: Math.max(0.1, Math.min(1, confidence)),
    philosophy: 'Plasma cosmology. Ram pressure over magnetic reconnection. Birkeland currents.',
  };
}

function buildReasoning(ramPressure, v, density, bt, flareFactor, currentDst, predicted6h) {
  const parts = [];

  parts.push(`Ram pressure: ${ramPressure.toFixed(2)}nPa (v=${v.toFixed(0)}km/s, n=${density.toFixed(1)}/cm³)`);

  if (v > 600) parts.push('High-velocity plasma stream — EU predicts stronger response than mainstream');
  if (bt > 15) parts.push(`Strong total field (${bt.toFixed(1)}nT) — significant current system`);
  if (flareFactor > 1) parts.push('Flare activity indicates heliospheric current disruption');

  const delta = predicted6h - currentDst;
  if (delta < -30) parts.push('EU model: severe storm developing — mainstream likely underestimates');
  else if (delta < -10) parts.push('EU model: moderate storm, velocity-driven coupling');
  else if (delta > 10) parts.push('EU model: rapid recovery via current rerouting');
  else parts.push('Conditions stable under plasma model');

  return parts.join('. ') + '.';
}

export { predictDst, NAME, ID };
