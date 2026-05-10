// Sky Sense — Cathedral Astronomy Module
// The Looking Glass Layer 1: celestial state at any timestamp.
//
// 5 pipelines extracted from Alan Space Audits' conceptual_flat_earth_model:
//   1. VSOP87 (Bretagnon & Francou) — sub-arcsecond, gold standard
//   2. Meeus Sun/Moon — apparent-of-date, ~1" accuracy
//   3. GeoC (Schlyter geocentric Kepler) — unlimited date range
//   4. HelioC (Schlyter heliocentric) — comparison pipeline
//   5. Ptolemy (Almagest deferent+epicycle) — 2000-year-old historical model
//
// Zero external dependencies. Pure math.
// Attribution: astronomical algorithms from Alan Space Audits (MIT-compatible),
// Meeus "Astronomical Algorithms" 2nd ed., VSOP87D (Bretagnon & Francou 1988),
// Ptolemy pipeline from R.H. van Gent (Utrecht University).

import { julianDay, julianCenturies, julianMillennia, gmstDeg, gmstHours, meanObliquityDeg, norm360, DEG } from './time.mjs';
import { sunPosition } from './meeus-sun.mjs';
import { moonPosition, moonPhase, nextPhases } from './meeus-moon.mjs';
import { vsop87Position } from './vsop87.mjs';
import { geoCPosition, helioCPosition, solveKepler } from './kepler.mjs';
import { ptolemyPosition } from './ptolemy.mjs';
import { detectRetrogrades, findNextConjunction, findNextEclipses, solarElongation, angularSeparation, eclipticConstellation } from './events.mjs';

const BODIES = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'];

const PIPELINES = {
  vsop87:  vsop87Position,
  meeus:   (name, date) => name === 'sun' ? sunPosition(date) : name === 'moon' ? moonPosition(date) : vsop87Position(name, date),
  geoC:    geoCPosition,
  helioC:  helioCPosition,
  ptolemy: ptolemyPosition,
};

// Compare all 5 pipelines for a single body at a timestamp.
// Returns per-pipeline positions + consensus/divergence metrics.
function comparePipelines(name, date) {
  const results = {};
  const raValues = [];
  const decValues = [];

  for (const [pName, fn] of Object.entries(PIPELINES)) {
    const pos = fn(name, date);
    results[pName] = pos;
    if (!isNaN(pos.ra) && !isNaN(pos.dec)) {
      raValues.push(pos.ra);
      decValues.push(pos.dec);
    }
  }

  // Divergence: max angular spread across pipelines
  let maxDivergence = 0;
  for (let i = 0; i < raValues.length; i++) {
    for (let j = i + 1; j < raValues.length; j++) {
      const sep = angularSeparation(
        { ra: raValues[i], dec: decValues[i] },
        { ra: raValues[j], dec: decValues[j] }
      );
      if (sep > maxDivergence) maxDivergence = sep;
    }
  }

  return {
    pipelines: results,
    divergenceDeg: maxDivergence / DEG,
    pipelineCount: raValues.length,
    consensus: maxDivergence / DEG < 0.5, // <0.5° = all agree
  };
}

// ── Main API ────────────────────────────────────────────────────────────────

/**
 * skyState(date) → complete celestial state at a given moment.
 * This is the Looking Glass Layer 1 entry point.
 *
 * @param {Date|number|string} input - Date object, unix ms, or ISO string
 * @returns {Object} Full sky state with bodies, events, pipeline comparison
 */
export function skyState(input) {
  const date = input instanceof Date ? input : new Date(input);
  const jd = julianDay(date);
  const T = julianCenturies(date);

  // Primary positions (VSOP87 + Meeus = best accuracy)
  const sun = sunPosition(date);
  const moon = moonPosition(date);
  const phases = nextPhases(date);

  const bodies = { sun: { ...sun }, moon: { ...moon } };

  // Planets via VSOP87
  for (const name of ['mercury', 'venus', 'mars', 'jupiter', 'saturn']) {
    const pos = vsop87Position(name, date);
    const elong = solarElongation(pos, sun);
    bodies[name] = { ...pos, elongation: elong };
  }

  // Add constellation info
  if (sun.eclipticLon !== undefined) {
    bodies.sun.constellation = eclipticConstellation(sun.eclipticLon);
  }
  if (moon.eclipticLon !== undefined) {
    bodies.moon.constellation = eclipticConstellation(moon.eclipticLon);
  }

  // Moon enrichment
  bodies.moon.nextNew = phases.nextNew;
  bodies.moon.nextFull = phases.nextFull;

  // Events
  const retrogrades = detectRetrogrades(date);

  // Pipeline comparison (for research frontier detection)
  const pipelineComparison = {};
  let maxDivergenceBody = null;
  let maxDivergence = 0;

  for (const name of BODIES) {
    const comparison = comparePipelines(name, date);
    pipelineComparison[name] = comparison;
    if (comparison.divergenceDeg > maxDivergence) {
      maxDivergence = comparison.divergenceDeg;
      maxDivergenceBody = name;
    }
  }

  // Consensus bodies: divergence < 0.5°
  const consensusBodies = BODIES.filter(b => pipelineComparison[b].consensus);
  const contestedBodies = BODIES.filter(b => !pipelineComparison[b].consensus);

  return {
    timestamp: date.toISOString(),
    jd,
    T,
    gmst: gmstHours(date),
    obliquity: meanObliquityDeg(T),

    bodies,

    events: {
      currentRetrogrades: retrogrades,
      moonPhase: { name: moon.name, illumination: moon.illumination, phase: moon.phase },
      nextNew: phases.nextNew,
      nextFull: phases.nextFull,
    },

    pipelines: {
      comparison: pipelineComparison,
      consensus: { bodies: consensusBodies, confidence: consensusBodies.length / BODIES.length },
      contested: {
        bodies: contestedBodies,
        maxDivergenceBody,
        maxDivergenceDeg: maxDivergence,
      },
      frontier: maxDivergence > 1
        ? `${maxDivergenceBody} — ${maxDivergence.toFixed(1)}° spread across 5 models. Research zone.`
        : 'All pipelines within 1° consensus.',
    },
  };
}

/**
 * skyStateLight(date) → minimal sky state (no pipeline comparison).
 * Fast path for when you just need positions.
 */
export function skyStateLight(input) {
  const date = input instanceof Date ? input : new Date(input);
  const sun = sunPosition(date);
  const moon = moonPosition(date);
  const phases = nextPhases(date);

  const bodies = { sun, moon };
  for (const name of ['mercury', 'venus', 'mars', 'jupiter', 'saturn']) {
    bodies[name] = { ...vsop87Position(name, date), elongation: solarElongation(vsop87Position(name, date), sun) };
  }

  return {
    timestamp: date.toISOString(),
    gmst: gmstHours(date),
    bodies,
    moonPhase: moon.name,
    retrogrades: detectRetrogrades(date),
    nextNew: phases.nextNew,
    nextFull: phases.nextFull,
  };
}

/**
 * findEvents(date, windowDays) → upcoming celestial events.
 */
export function findEvents(date, windowDays = 90) {
  const eclipses = findNextEclipses(date, Math.max(windowDays, 400));
  const conjunction = findNextConjunction(date, windowDays);
  const phases = nextPhases(date);

  return {
    eclipses,
    nextConjunction: conjunction,
    nextNewMoon: phases.nextNew,
    nextFullMoon: phases.nextFull,
    retrogrades: detectRetrogrades(date),
  };
}

// Re-export individual pipelines for direct access
export { sunPosition, moonPosition, moonPhase, nextPhases };
export { vsop87Position };
export { geoCPosition, helioCPosition, solveKepler };
export { ptolemyPosition };
export { angularSeparation, solarElongation, eclipticConstellation };
export { julianDay, julianCenturies, gmstDeg, gmstHours, meanObliquityDeg };
export { comparePipelines };

// Re-export events index (Layer 1b)
export { EVENTS_DB, skyFingerprint, findSimilarConfigs, scanForPatternEchoes, indexStats } from './events-index.mjs';

// Re-export convergence detector (Layer 3)
export { lookForward, todaySignal, formatForTelegram } from './convergence-detector.mjs';
