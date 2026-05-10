// Sky Sense — Celestial event detection
// Conjunctions, retrogrades, eclipses, moon phases.

import { julianDay, norm360, DEG } from './time.mjs';
import { sunPosition } from './meeus-sun.mjs';
import { moonPosition, nextPhases } from './meeus-moon.mjs';
import { vsop87Position } from './vsop87.mjs';

const BODIES = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];

// Angular separation between two equatorial positions (radians)
export function angularSeparation(pos1, pos2) {
  const dot = Math.cos(pos1.dec) * Math.cos(pos2.dec) * Math.cos(pos1.ra - pos2.ra)
            + Math.sin(pos1.dec) * Math.sin(pos2.dec);
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

// Solar elongation of a body (degrees)
export function solarElongation(bodyPos, sunPos) {
  return angularSeparation(bodyPos, sunPos) / DEG;
}

// Detect which planets are in retrograde (simplified: check RA change over 2 days)
export function detectRetrogrades(date) {
  const retro = [];
  const d1 = new Date(date.getTime() - 86400000);
  const d2 = new Date(date.getTime() + 86400000);

  for (const body of BODIES) {
    const pos1 = vsop87Position(body, d1);
    const pos2 = vsop87Position(body, d2);
    if (isNaN(pos1.ra) || isNaN(pos2.ra)) continue;

    // RA change — handle wrapping
    let dRA = pos2.ra - pos1.ra;
    if (dRA > Math.PI) dRA -= 2 * Math.PI;
    if (dRA < -Math.PI) dRA += 2 * Math.PI;

    // Negative dRA = retrograde (RA decreasing)
    if (dRA < 0) retro.push(body);
  }
  return retro;
}

// Find next conjunction between any two planets (within next N days)
export function findNextConjunction(date, windowDays = 90) {
  let bestSep = Infinity;
  let bestDate = null;
  let bestPair = null;

  const step = 86400000; // 1 day
  for (let d = 0; d < windowDays; d++) {
    const t = new Date(date.getTime() + d * step);
    for (let i = 0; i < BODIES.length; i++) {
      for (let j = i + 1; j < BODIES.length; j++) {
        const p1 = vsop87Position(BODIES[i], t);
        const p2 = vsop87Position(BODIES[j], t);
        if (isNaN(p1.ra) || isNaN(p2.ra)) continue;
        const sep = angularSeparation(p1, p2) / DEG;
        if (sep < bestSep) {
          bestSep = sep;
          bestDate = t;
          bestPair = [BODIES[i], BODIES[j]];
        }
      }
    }
  }

  return bestPair ? { bodies: bestPair, date: bestDate, separation: bestSep } : null;
}

// Find next solar/lunar eclipse (syzygy search)
export function findNextEclipses(date, windowDays = 400) {
  const stepMs = 3600 * 1000;
  const start = date.getTime();
  let nextSolar = null, nextLunar = null;
  let prevSolar = null, prevPrevSolar = null;
  let prevLunar = null, prevPrevLunar = null;
  const threshold = 1.5 * DEG;

  const totalSteps = windowDays * 24;
  for (let i = 0; i <= totalSteps; i++) {
    const t = new Date(start + i * stepMs);
    const sun = sunPosition(t);
    const moon = moonPosition(t);

    const sunVec = [Math.cos(sun.dec) * Math.cos(sun.ra), Math.cos(sun.dec) * Math.sin(sun.ra), Math.sin(sun.dec)];
    const moonVec = [Math.cos(moon.dec) * Math.cos(moon.ra), Math.cos(moon.dec) * Math.sin(moon.ra), Math.sin(moon.dec)];
    const antiMoon = [-moonVec[0], -moonVec[1], -moonVec[2]];

    const dotSolar = sunVec[0]*moonVec[0] + sunVec[1]*moonVec[1] + sunVec[2]*moonVec[2];
    const dotLunar = sunVec[0]*antiMoon[0] + sunVec[1]*antiMoon[1] + sunVec[2]*antiMoon[2];
    const solarSep = Math.acos(Math.max(-1, Math.min(1, dotSolar)));
    const lunarSep = Math.acos(Math.max(-1, Math.min(1, dotLunar)));

    if (!nextSolar && prevPrevSolar !== null
        && prevSolar <= prevPrevSolar && prevSolar <= solarSep
        && prevSolar < threshold) {
      nextSolar = { date: new Date(start + (i - 1) * stepMs), type: 'solar', minSeparation: prevSolar / DEG };
    }
    if (!nextLunar && prevPrevLunar !== null
        && prevLunar <= prevPrevLunar && prevLunar <= lunarSep
        && prevLunar < threshold) {
      nextLunar = { date: new Date(start + (i - 1) * stepMs), type: 'lunar', minSeparation: prevLunar / DEG };
    }
    if (nextSolar && nextLunar) break;

    prevPrevSolar = prevSolar; prevSolar = solarSep;
    prevPrevLunar = prevLunar; prevLunar = lunarSep;
  }

  return { nextSolar, nextLunar };
}

// Constellation lookup (simplified — 12 zodiac sectors of 30° each)
const ZODIAC = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
export function eclipticConstellation(eclipticLonDeg) {
  const idx = Math.floor(((eclipticLonDeg % 360 + 360) % 360) / 30);
  return ZODIAC[idx];
}
