// Sky Sense — Time utilities
// Julian Day, GMST, epoch conversions.
// Extracted from Alan Space Audits (ephemerisCommon.js) + Meeus Ch. 7, 12.

const DEG = Math.PI / 180;

// Julian Day number from a JS Date (UTC).
export function julianDay(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

// Julian centuries from J2000.0
export function julianCenturies(date) {
  return (julianDay(date) - 2451545.0) / 36525;
}

// Julian millennia from J2000.0 (used by VSOP87)
export function julianMillennia(date) {
  return (julianDay(date) - 2451545.0) / 365250;
}

// Greenwich Mean Sidereal Time in degrees (0..360). Meeus Ch. 12 eq 12.4.
export function gmstDeg(date) {
  const jd = julianDay(date);
  const T = (jd - 2451545.0) / 36525;
  const gst = 280.46061837
            + 360.98564736629 * (jd - 2451545.0)
            + 0.000387933 * T * T
            - (T * T * T) / 38710000;
  return ((gst % 360) + 360) % 360;
}

// GMST in hours (0..24)
export function gmstHours(date) {
  return gmstDeg(date) / 15;
}

// Mean obliquity of the ecliptic in degrees (Meeus 22.2).
export function meanObliquityDeg(T) {
  return 23 + 26 / 60 + 21.448 / 3600
       - (46.8150 * T + 0.00059 * T * T - 0.001813 * T * T * T) / 3600;
}

// Longitude of Moon's ascending node (degrees) — nutation driver.
export function moonNodeOmegaDeg(T) {
  return norm360(125.04452 - 1934.136261 * T + 0.0020708 * T * T + T * T * T / 450000);
}

// Normalize angle to 0..360
export function norm360(x) { return ((x % 360) + 360) % 360; }

// Date from Julian Day
export function jdToDate(jd) {
  return new Date((jd - 2440587.5) * 86400000);
}

export { DEG };
