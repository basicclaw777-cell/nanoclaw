// Sky Sense — Moon position (Meeus Ch. 47 expanded)
// 27 longitude + 18 latitude periodic terms.
// Extracted from Alan Space Audits ephemerisCommon.js.

import { DEG, julianDay, norm360, meanObliquityDeg, moonNodeOmegaDeg } from './time.mjs';

// Moon phase calculation
export function moonPhase(date) {
  const jd = julianDay(date);
  const T = (jd - 2451545.0) / 36525;
  const D = norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T);
  // Phase angle: 0=new, 180=full
  const phase = D / 360; // 0..1 cycle
  const illumination = (1 - Math.cos(D * DEG)) / 2;

  let name;
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.0625)      name = 'new moon';
  else if (p < 0.1875) name = 'waxing crescent';
  else if (p < 0.3125) name = 'first quarter';
  else if (p < 0.4375) name = 'waxing gibbous';
  else if (p < 0.5625) name = 'full moon';
  else if (p < 0.6875) name = 'waning gibbous';
  else if (p < 0.8125) name = 'last quarter';
  else if (p < 0.9375) name = 'waning crescent';
  else                  name = 'new moon';

  return { phase: p, illumination, name };
}

// Next new moon and full moon dates (approximate, within ~1 day)
export function nextPhases(date) {
  const synodic = 29.530588853; // days
  const jd = julianDay(date);
  const T = (jd - 2451545.0) / 36525;
  const D = norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T);
  const phase = ((D / 360) % 1 + 1) % 1;

  const daysToNew = phase < 0.001 ? synodic : (1 - phase) * synodic;
  const daysToFull = phase < 0.5 ? (0.5 - phase) * synodic : (1.5 - phase) * synodic;

  return {
    nextNew: new Date(date.getTime() + daysToNew * 86400000),
    nextFull: new Date(date.getTime() + daysToFull * 86400000),
  };
}

// Geocentric equatorial coordinates of the Moon (RA, Dec in radians).
// Apparent-of-date. Accuracy ~10" longitude, ~4" latitude.
export function moonPosition(date) {
  const jd = julianDay(date);
  const d = jd - 2451545.0;
  const T = d / 36525;

  const L0 = norm360(218.3164477 + 481267.88123421 * T - 0.0015786 * T * T);
  const D  = norm360(297.8501921 + 445267.1114034  * T - 0.0018819 * T * T);
  const M  = norm360(357.5291092 +  35999.0502909  * T - 0.0001536 * T * T);
  const Mp = norm360(134.9633964 + 477198.8675055  * T + 0.0087414 * T * T);
  const F  = norm360(93.2720950  + 483202.0175233  * T - 0.0036539 * T * T);

  const DR = D * DEG, MR = M * DEG, MpR = Mp * DEG, FR = F * DEG;

  const dLam =
      6.288774 * Math.sin(MpR)
   + -1.274027 * Math.sin(2 * DR - MpR)
   +  0.658314 * Math.sin(2 * DR)
   +  0.213618 * Math.sin(2 * MpR)
   + -0.185116 * Math.sin(MR)
   + -0.114332 * Math.sin(2 * FR)
   +  0.058793 * Math.sin(2 * DR - 2 * MpR)
   +  0.057066 * Math.sin(2 * DR - MR - MpR)
   +  0.053322 * Math.sin(2 * DR + MpR)
   +  0.045758 * Math.sin(2 * DR - MR)
   + -0.040923 * Math.sin(MR - MpR)
   + -0.034720 * Math.sin(DR)
   + -0.030383 * Math.sin(MR + MpR)
   +  0.015327 * Math.sin(2 * DR - 2 * FR)
   + -0.012528 * Math.sin(MpR + 2 * FR)
   +  0.010980 * Math.sin(MpR - 2 * FR)
   +  0.010675 * Math.sin(4 * DR - MpR)
   +  0.010034 * Math.sin(3 * MpR)
   +  0.008548 * Math.sin(4 * DR - 2 * MpR)
   + -0.007888 * Math.sin(2 * DR + MR - MpR)
   + -0.006766 * Math.sin(2 * DR + MR)
   + -0.005163 * Math.sin(DR - MpR)
   +  0.004987 * Math.sin(DR + MR)
   +  0.004036 * Math.sin(2 * DR - MR + MpR)
   +  0.003994 * Math.sin(2 * DR + 2 * MpR)
   +  0.003861 * Math.sin(4 * DR)
   +  0.003665 * Math.sin(2 * DR - 3 * MpR);

  const beta =
      5.128122 * Math.sin(FR)
   +  0.280602 * Math.sin(MpR + FR)
   +  0.277693 * Math.sin(MpR - FR)
   +  0.173237 * Math.sin(2 * DR - FR)
   +  0.055413 * Math.sin(2 * DR - MpR + FR)
   +  0.046271 * Math.sin(2 * DR - MpR - FR)
   +  0.032573 * Math.sin(2 * DR + FR)
   +  0.017198 * Math.sin(2 * MpR + FR)
   +  0.009266 * Math.sin(2 * DR + MpR - FR)
   +  0.008822 * Math.sin(2 * MpR - FR)
   +  0.008216 * Math.sin(2 * DR - MR - FR)
   +  0.004324 * Math.sin(2 * DR - 2 * MpR - FR)
   +  0.004200 * Math.sin(2 * DR + MpR + FR)
   + -0.003359 * Math.sin(2 * DR + MR - FR)
   +  0.002463 * Math.sin(2 * DR - MR - MpR + FR)
   +  0.002211 * Math.sin(2 * DR - MR + FR)
   +  0.002065 * Math.sin(2 * DR - MR - MpR - FR)
   + -0.001870 * Math.sin(MR - MpR - FR);

  const omegaDeg = moonNodeOmegaDeg(T);
  const omega    = omegaDeg * DEG;
  const lambda   = norm360(L0 + dLam) - 0.00478 * Math.sin(omega);
  const epsDeg   = meanObliquityDeg(T) + 0.00256 * Math.cos(omega);

  const lamR = lambda * DEG;
  const betR = beta * DEG;
  const epsR = epsDeg * DEG;
  const ra = Math.atan2(
    Math.sin(lamR) * Math.cos(epsR) - Math.tan(betR) * Math.sin(epsR),
    Math.cos(lamR),
  );
  const dec = Math.asin(
    Math.sin(betR) * Math.cos(epsR)
      + Math.cos(betR) * Math.sin(epsR) * Math.sin(lamR),
  );

  const phaseInfo = moonPhase(date);

  return { ra, dec, eclipticLon: lambda, eclipticLat: beta, ...phaseInfo };
}
