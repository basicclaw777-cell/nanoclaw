// Sky Sense — Sun position (Meeus Ch. 25 higher-accuracy)
// Geocentric equatorial, apparent-of-date, includes nutation + aberration.
// Extracted from Alan Space Audits ephemerisCommon.js.

import { DEG, julianDay, norm360, meanObliquityDeg, moonNodeOmegaDeg } from './time.mjs';

// Geocentric equatorial coordinates of the Sun (RA, Dec in radians).
// Apparent-of-date. Accuracy ~1" across ±2000 years of J2000.
export function sunPosition(date) {
  const jd = julianDay(date);
  const T  = (jd - 2451545.0) / 36525;

  const L0 = norm360(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
  const M  = norm360(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
  const MR = M * DEG;
  const e  = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;
  const C  = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(MR)
           + (0.019993 - 0.000101 * T) * Math.sin(2 * MR)
           +  0.000289                  * Math.sin(3 * MR);

  const lambdaTrue = L0 + C;
  const omegaDeg = moonNodeOmegaDeg(T);
  const omega    = omegaDeg * DEG;

  // Apparent longitude (nutation + aberration correction)
  const lambda = lambdaTrue - 0.00569 - 0.00478 * Math.sin(omega);
  const epsDeg = meanObliquityDeg(T) + 0.00256 * Math.cos(omega);

  const lamR = lambda * DEG;
  const epsR = epsDeg * DEG;
  const ra   = Math.atan2(Math.cos(epsR) * Math.sin(lamR), Math.cos(lamR));
  const dec  = Math.asin(Math.sin(epsR) * Math.sin(lamR));

  // Ecliptic longitude for downstream use
  const eclipticLon = norm360(lambda);

  return {
    ra,
    dec,
    eclipticLon,
    meanAnomaly: M,
    eccentricity: e,
    equationOfCenter: C,
  };
}
