/**
 * space-weather-fetcher.js — NOAA SWPC real-time space weather data
 *
 * All endpoints free, public, no API key. JSON responses.
 * Data sources:
 *   - GOES X-ray flux (solar flare indicator)
 *   - DSCOVR solar wind plasma (density, velocity)
 *   - DSCOVR solar wind magnetometer (Bz component — southward = storm driver)
 *   - Planetary Kp index (3-hour geomagnetic activity)
 *   - Dst index (hourly ring current — primary prediction target)
 *
 * ESM. Zero dependencies beyond Node.js fetch.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, 'signals');

// NOAA SWPC endpoints — all free, real-time, public JSON
const ENDPOINTS = {
  xray: 'https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json',
  plasma: 'https://services.swpc.noaa.gov/products/solar-wind/plasma-2-hour.json',
  mag: 'https://services.swpc.noaa.gov/products/solar-wind/mag-2-hour.json',
  kp: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',
  dst: 'https://services.swpc.noaa.gov/products/kyoto-dst.json',
};

async function fetchJSON(url, label) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error(`[geomag/${label}] Fetch failed: ${e.message}`);
    return null;
  }
}

// Parse GOES X-ray flux — latest reading + recent peak
function parseXray(data) {
  if (!data || !Array.isArray(data) || data.length === 0) return null;

  // Data: [{time_tag, satellite, flux, observed_flux, energy}]
  const latest = data[data.length - 1];
  const fluxValues = data
    .filter(d => d.flux != null)
    .map(d => ({ time: d.time_tag, flux: d.flux, class: classifyXrayFlux(d.flux) }));

  const peak = fluxValues.reduce((max, d) => d.flux > max.flux ? d : max, fluxValues[0]);

  return {
    latest: {
      time: latest.time_tag,
      flux: latest.flux,
      class: classifyXrayFlux(latest.flux),
    },
    peak6h: peak,
    count: fluxValues.length,
  };
}

function classifyXrayFlux(flux) {
  if (!flux || flux <= 0) return 'A0';
  if (flux >= 1e-4) return 'X' + (flux / 1e-4).toFixed(1);
  if (flux >= 1e-5) return 'M' + (flux / 1e-5).toFixed(1);
  if (flux >= 1e-6) return 'C' + (flux / 1e-6).toFixed(1);
  if (flux >= 1e-7) return 'B' + (flux / 1e-7).toFixed(1);
  return 'A' + (flux / 1e-8).toFixed(1);
}

// Parse DSCOVR solar wind plasma — density and velocity
function parsePlasma(data) {
  if (!data || !Array.isArray(data) || data.length < 2) return null;

  // First row is headers: ["time_tag","density","speed","temperature"]
  const headers = data[0];
  const rows = data.slice(1).filter(r => r[1] !== null && r[2] !== null);
  if (rows.length === 0) return null;

  const latest = rows[rows.length - 1];
  const densities = rows.map(r => parseFloat(r[1])).filter(v => !isNaN(v));
  const speeds = rows.map(r => parseFloat(r[2])).filter(v => !isNaN(v));

  return {
    latest: {
      time: latest[0],
      density: parseFloat(latest[1]),
      speed: parseFloat(latest[2]),
      temperature: parseFloat(latest[3]),
    },
    stats: {
      density: { mean: avg(densities), max: Math.max(...densities), min: Math.min(...densities) },
      speed: { mean: avg(speeds), max: Math.max(...speeds), min: Math.min(...speeds) },
    },
    count: rows.length,
  };
}

// Parse DSCOVR magnetometer — Bz component (southward = negative = storm driver)
function parseMag(data) {
  if (!data || !Array.isArray(data) || data.length < 2) return null;

  // Headers: ["time_tag","bx_gsm","by_gsm","bz_gsm","lon_gsm","lat_gsm","bt"]
  const rows = data.slice(1).filter(r => r[3] !== null);
  if (rows.length === 0) return null;

  const latest = rows[rows.length - 1];
  const bzValues = rows.map(r => parseFloat(r[3])).filter(v => !isNaN(v));
  const btValues = rows.map(r => parseFloat(r[6])).filter(v => !isNaN(v));

  return {
    latest: {
      time: latest[0],
      bz: parseFloat(latest[3]),
      bt: parseFloat(latest[6]),
    },
    stats: {
      bz: { mean: avg(bzValues), min: Math.min(...bzValues), max: Math.max(...bzValues) },
      bt: { mean: avg(btValues), max: Math.max(...btValues) },
    },
    // Key metric: sustained southward Bz drives storms
    southwardMinutes: bzValues.filter(v => v < -5).length * (120 / bzValues.length), // approx minutes in 2h window
    count: rows.length,
  };
}

// Parse Kp index — latest + trend
function parseKp(data) {
  if (!data || !Array.isArray(data) || data.length === 0) return null;

  // Last 30 entries (each is a 3-hour window)
  const recent = data.slice(-30);
  const latest = recent[recent.length - 1];

  const kpValues = recent.map(d => parseFloat(d.Kp)).filter(v => !isNaN(v));
  const last3 = kpValues.slice(-3);
  const prev3 = kpValues.slice(-6, -3);

  return {
    latest: {
      time: latest.time_tag,
      kp: parseFloat(latest.Kp),
      kpText: String(latest.Kp),
    },
    stats: {
      mean24h: avg(kpValues.slice(-8)),
      max24h: Math.max(...kpValues.slice(-8)),
      trend: avg(last3) - avg(prev3), // positive = increasing activity
    },
    stormLevel: classifyKp(parseFloat(latest.kp_index)),
    count: recent.length,
  };
}

// Parse Dst index — hourly ring current, primary prediction target
function parseDst(data) {
  if (!data || !Array.isArray(data) || data.length === 0) return null;

  const recent = data.slice(-48); // last 48 hours
  const latest = recent[recent.length - 1];

  const dstValues = recent.map(d => parseFloat(d.dst)).filter(v => !isNaN(v));
  const last6 = dstValues.slice(-6);
  const prev6 = dstValues.slice(-12, -6);

  return {
    latest: {
      time: latest.time_tag,
      dst: parseFloat(latest.dst),
    },
    stats: {
      mean24h: avg(dstValues.slice(-24)),
      min24h: Math.min(...dstValues.slice(-24)),
      min48h: Math.min(...dstValues),
      trend: avg(last6) - avg(prev6), // negative trend = storm developing
    },
    stormLevel: classifyDst(parseFloat(latest.dst)),
    count: recent.length,
  };
}

function classifyKp(kp) {
  if (kp >= 8) return 'G4-G5 SEVERE';
  if (kp >= 7) return 'G3 STRONG';
  if (kp >= 6) return 'G2 MODERATE';
  if (kp >= 5) return 'G1 MINOR';
  if (kp >= 4) return 'ACTIVE';
  return 'QUIET';
}

function classifyDst(dst) {
  if (dst <= -200) return 'INTENSE STORM';
  if (dst <= -100) return 'MAJOR STORM';
  if (dst <= -50) return 'MODERATE STORM';
  if (dst <= -30) return 'WEAK STORM';
  return 'QUIET';
}

function avg(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * fetchAllSpaceWeather() — main entry point
 * Returns structured space weather snapshot.
 */
export async function fetchAllSpaceWeather() {
  console.log('[geomag] Fetching space weather data...');

  const [xrayRaw, plasmaRaw, magRaw, kpRaw, dstRaw] = await Promise.all([
    fetchJSON(ENDPOINTS.xray, 'xray'),
    fetchJSON(ENDPOINTS.plasma, 'plasma'),
    fetchJSON(ENDPOINTS.mag, 'mag'),
    fetchJSON(ENDPOINTS.kp, 'kp'),
    fetchJSON(ENDPOINTS.dst, 'dst'),
  ]);

  const xray = parseXray(xrayRaw);
  const plasma = parsePlasma(plasmaRaw);
  const mag = parseMag(magRaw);
  const kp = parseKp(kpRaw);
  const dst = parseDst(dstRaw);

  const snapshot = {
    timestamp: new Date().toISOString(),
    sources: {
      xray: xray ? 'OK' : 'FAILED',
      plasma: plasma ? 'OK' : 'FAILED',
      mag: mag ? 'OK' : 'FAILED',
      kp: kp ? 'OK' : 'FAILED',
      dst: dst ? 'OK' : 'FAILED',
    },
    xray,
    plasma,
    mag,
    kp,
    dst,
    // Composite activity level
    activity: computeActivityLevel(xray, plasma, mag, kp, dst),
  };

  // Cache to disk
  const cachePath = path.join(CACHE_DIR, 'space-weather-latest.json');
  fs.writeFileSync(cachePath, JSON.stringify(snapshot, null, 2));
  console.log(`[geomag] Space weather cached. Activity: ${snapshot.activity.level} (${snapshot.activity.score.toFixed(1)}/10)`);

  return snapshot;
}

function computeActivityLevel(xray, plasma, mag, kp, dst) {
  let score = 0;
  const factors = [];

  // Kp contribution (0-3 points)
  if (kp) {
    const kpVal = kp.latest.kp;
    score += Math.min(kpVal / 3, 3);
    if (kpVal >= 5) factors.push(`Kp=${kpVal} (${kp.stormLevel})`);
  }

  // Dst contribution (0-3 points, more negative = more active)
  if (dst) {
    const dstVal = Math.abs(Math.min(dst.latest.dst, 0));
    score += Math.min(dstVal / 50, 3);
    if (dst.latest.dst <= -30) factors.push(`Dst=${dst.latest.dst}nT (${dst.stormLevel})`);
  }

  // Bz contribution (0-2 points, southward Bz drives storms)
  if (mag) {
    const bzSouth = Math.abs(Math.min(mag.latest.bz, 0));
    score += Math.min(bzSouth / 10, 2);
    if (mag.latest.bz < -5) factors.push(`Bz=${mag.latest.bz.toFixed(1)}nT (southward)`);
  }

  // Solar wind speed (0-1 point)
  if (plasma) {
    const speed = plasma.latest.speed;
    score += speed > 600 ? 1 : speed > 500 ? 0.5 : 0;
    if (speed > 500) factors.push(`SW=${speed.toFixed(0)}km/s`);
  }

  // X-ray flux (0-1 point)
  if (xray && xray.latest.flux) {
    const flux = xray.latest.flux;
    score += flux > 1e-4 ? 1 : flux > 1e-5 ? 0.5 : 0;
    if (xray.latest.class && xray.latest.class.startsWith('M')) factors.push(`Flare: ${xray.latest.class}`);
    if (xray.latest.class && xray.latest.class.startsWith('X')) factors.push(`Flare: ${xray.latest.class} (MAJOR)`);
  }

  let level;
  if (score >= 7) level = 'EXTREME';
  else if (score >= 5) level = 'SEVERE';
  else if (score >= 3) level = 'ACTIVE';
  else if (score >= 1.5) level = 'UNSETTLED';
  else level = 'QUIET';

  return { score: Math.min(score, 10), level, factors };
}

// CLI test
if (process.argv[1] && process.argv[1].endsWith('space-weather-fetcher.js')) {
  fetchAllSpaceWeather().then(data => {
    console.log('\n--- Space Weather Snapshot ---');
    console.log(`Activity: ${data.activity.level} (${data.activity.score.toFixed(1)}/10)`);
    if (data.activity.factors.length) console.log(`Factors: ${data.activity.factors.join(', ')}`);
    if (data.kp) console.log(`Kp: ${data.kp.latest.kp} (${data.kp.stormLevel})`);
    if (data.dst) console.log(`Dst: ${data.dst.latest.dst}nT (${data.dst.stormLevel})`);
    if (data.mag) console.log(`Bz: ${data.mag.latest.bz.toFixed(1)}nT`);
    if (data.plasma) console.log(`Solar wind: ${data.plasma.latest.speed.toFixed(0)}km/s, density ${data.plasma.latest.density.toFixed(1)}/cm³`);
    if (data.xray) console.log(`X-ray: ${data.xray.latest.class || 'N/A'}`);
  });
}

export { ENDPOINTS, classifyKp, classifyDst };
