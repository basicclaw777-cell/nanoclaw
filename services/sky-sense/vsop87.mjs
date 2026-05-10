// Sky Sense — VSOP87 pipeline (Bretagnon & Francou analytical theory)
// Sub-arcsecond planetary accuracy near J2000, ±4000 year range.
// Extracted from Alan Space Audits ephemerisVsop87.js.

import VSOP87_MERCURY from './data/vsop87-mercury.mjs';
import VSOP87_VENUS   from './data/vsop87-venus.mjs';
import VSOP87_EARTH   from './data/vsop87-earth.mjs';
import VSOP87_MARS    from './data/vsop87-mars.mjs';
import VSOP87_JUPITER from './data/vsop87-jupiter.mjs';
import VSOP87_SATURN  from './data/vsop87-saturn.mjs';
import { DEG, julianDay, meanObliquityDeg } from './time.mjs';
import { moonPosition } from './meeus-moon.mjs';

const VSOP = {
  mercury: VSOP87_MERCURY, venus: VSOP87_VENUS, earth: VSOP87_EARTH,
  mars: VSOP87_MARS, jupiter: VSOP87_JUPITER, saturn: VSOP87_SATURN,
};

// Evaluate VSOP87 Fourier series: sum of A·cos(B + C·T) across 6 power orders.
function evalSeries(series, T) {
  let total = 0, Tpow = 1;
  for (let p = 0; p <= 5; p++) {
    const terms = series[String(p)];
    if (terms) {
      let sum = 0;
      for (let i = 0; i < terms.length; i++) {
        sum += terms[i][0] * Math.cos(terms[i][1] + terms[i][2] * T);
      }
      total += sum * Tpow;
    }
    Tpow *= T;
  }
  return total;
}

// Heliocentric ecliptic (L, B, R) at T millennia from J2000.
function heliocentric(body, T) {
  const data = VSOP[body];
  return { L: evalSeries(data.L, T), B: evalSeries(data.B, T), R: evalSeries(data.R, T) };
}

function sphToRect(L, B, R) {
  const cosB = Math.cos(B);
  return { x: R * cosB * Math.cos(L), y: R * cosB * Math.sin(L), z: R * Math.sin(B) };
}

// FK5 correction (Meeus 32.3)
const ARCSEC_TO_RAD = Math.PI / (180 * 3600);
function fk5Correction(L, B, T_cent) {
  const Lp = L - (1.397 + 0.00031 * T_cent) * T_cent * DEG;
  const dL = (-0.09033 + 0.03916 * (Math.cos(Lp) + Math.sin(Lp)) * Math.tan(B)) * ARCSEC_TO_RAD;
  const dB = 0.03916 * (Math.cos(Lp) - Math.sin(Lp)) * ARCSEC_TO_RAD;
  return { L: L + dL, B: B + dB };
}

// Ecliptic → equatorial
function eclipToEq(L, B, T_cent) {
  const eps = meanObliquityDeg(T_cent) * DEG;
  const sinL = Math.sin(L), cosL = Math.cos(L), tanB = Math.tan(B);
  let ra = Math.atan2(sinL * Math.cos(eps) - tanB * Math.sin(eps), cosL);
  const dec = Math.asin(Math.sin(B) * Math.cos(eps) + Math.cos(B) * Math.sin(eps) * sinL);
  ra = ((ra % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return { ra, dec };
}

// Geocentric equatorial for a planet via VSOP87.
export function vsop87Position(name, date) {
  if (name === 'moon') return moonPosition(date);
  if (!VSOP[name] && name !== 'sun') return { ra: NaN, dec: NaN };

  const jd = julianDay(date);
  const T_mil  = (jd - 2451545.0) / 365250;
  const T_cent = (jd - 2451545.0) / 36525;

  if (name === 'sun') {
    const e = heliocentric('earth', T_mil);
    const L = e.L + Math.PI;
    const B = -e.B;
    const fk5 = fk5Correction(L, B, T_cent);
    return eclipToEq(fk5.L, fk5.B, T_cent);
  }

  const p = heliocentric(name, T_mil);
  const e = heliocentric('earth', T_mil);
  const pr = sphToRect(p.L, p.B, p.R);
  const er = sphToRect(e.L, e.B, e.R);
  const gx = pr.x - er.x, gy = pr.y - er.y, gz = pr.z - er.z;
  const R = Math.sqrt(gx * gx + gy * gy + gz * gz);
  const L = Math.atan2(gy, gx);
  const B = Math.asin(gz / R);
  const fk5 = fk5Correction(L, B, T_cent);
  return eclipToEq(fk5.L, fk5.B, T_cent);
}

export const SUPPORTED_BODIES = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'];
