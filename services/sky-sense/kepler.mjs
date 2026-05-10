// Sky Sense — Kepler equation solver + Schlyter orbital elements
// Two pipelines: GeoC (Earth-focus) and HelioC (heliocentric composition)
// Extracted from Alan Space Audits ephemerisGeo.js + ephemerisHelio.js.

import { DEG } from './time.mjs';
import { sunPosition } from './meeus-sun.mjs';
import { moonPosition } from './meeus-moon.mjs';

// Schlyter epoch: 1999-12-31 00:00 UT (JD 2451543.5)
function schlyterDay(date) {
  return date.getTime() / 86400000 - 10956;
}

// Solve Kepler's equation M = E - e·sin(E) via Newton's method.
export function solveKepler(M, e) {
  let E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
  for (let k = 0; k < 6; k++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

// Orbital elements: [N0, dN, i0, di, w0, dw, a0, da, e0, de, M0, dM]
const GEO_ELEMENTS = {
  mercury: [48.3313, 3.24587e-5, 7.0047, 5.00e-8, 29.1241, 1.01444e-5, 0.387098, 0, 0.205635, 5.59e-10, 168.6562, 4.0923344368],
  venus:   [76.6799, 2.46590e-5, 3.3946, 2.75e-8, 54.8910, 1.38374e-5, 0.723330, 0, 0.006773, -1.302e-9, 48.0052, 1.6021302244],
  mars:    [49.5574, 2.11081e-5, 1.8497, -1.78e-8, 286.5016, 2.92961e-5, 1.523688, 0, 0.093405, 2.516e-9, 18.6021, 0.5240207766],
  jupiter: [100.4542, 2.76854e-5, 1.3030, -1.557e-7, 273.8777, 1.64505e-5, 5.20256, 0, 0.048498, 4.469e-9, 19.8950, 0.0830853001],
  saturn:  [113.6634, 2.38980e-5, 2.4886, -1.081e-7, 339.3939, 2.97661e-5, 9.55475, 0, 0.055546, -9.499e-9, 316.9670, 0.0334442282],
};

// Heliocentric elements (includes pre-negated Earth/Sun row)
const HELIO_ELEMENTS = {
  ...GEO_ELEMENTS,
  earth: [0, 0, 0.0000, 0, 282.9404, 4.70935e-5, 1.000000, 0, 0.016709, -1.151e-9, 356.0470, 0.9856002585],
};

function elementsAt(table, name, d) {
  const el = table[name];
  if (!el) return null;
  return {
    N: el[0] + el[1] * d, i: el[2] + el[3] * d,
    w: el[4] + el[5] * d, a: el[6] + el[7] * d,
    e: el[8] + el[9] * d, M: el[10] + el[11] * d,
  };
}

function keplerPosition(el) {
  const { N, i, w, a, e, M } = el;
  const Mr = M * DEG;
  const E = solveKepler(((Mr % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2), e);
  const xv = a * (Math.cos(E) - e);
  const yv = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const v = Math.atan2(yv, xv);
  const r = Math.hypot(xv, yv);
  const Nr = N * DEG, ir = i * DEG, wr = w * DEG;
  const vw = v + wr;
  return {
    x: r * (Math.cos(Nr) * Math.cos(vw) - Math.sin(Nr) * Math.sin(vw) * Math.cos(ir)),
    y: r * (Math.sin(Nr) * Math.cos(vw) + Math.cos(Nr) * Math.sin(vw) * Math.cos(ir)),
    z: r * Math.sin(vw) * Math.sin(ir),
  };
}

function eclipticToEquatorial(x, y, z, d) {
  const eclip = (23.4393 - 3.563e-7 * d) * DEG;
  const xeq = x;
  const yeq = y * Math.cos(eclip) - z * Math.sin(eclip);
  const zeq = y * Math.sin(eclip) + z * Math.cos(eclip);
  const ra  = Math.atan2(yeq, xeq);
  const dec = Math.atan2(zeq, Math.hypot(xeq, yeq));
  return { ra, dec };
}

// GeoC pipeline: Earth-focus Keplerian elements
export function geoCPosition(name, date) {
  if (name === 'sun') return sunPosition(date);
  if (name === 'moon') return moonPosition(date);
  const d = schlyterDay(date);
  const el = elementsAt(GEO_ELEMENTS, name, d);
  if (!el) return { ra: NaN, dec: NaN };
  const pos = keplerPosition(el);
  return eclipticToEquatorial(pos.x, pos.y, pos.z, d);
}

// HelioC pipeline: heliocentric composition with Sun
export function helioCPosition(name, date) {
  if (name === 'sun') return sunPosition(date);
  if (name === 'moon') return moonPosition(date);
  const d = schlyterDay(date);
  const el = elementsAt(HELIO_ELEMENTS, name, d);
  if (!el) return { ra: NaN, dec: NaN };
  const sg = keplerPosition(elementsAt(HELIO_ELEMENTS, 'earth', d));
  const p = keplerPosition(el);
  return eclipticToEquatorial(p.x + sg.x, p.y + sg.y, p.z + sg.z, d);
}

export const SUPPORTED_BODIES = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'];
