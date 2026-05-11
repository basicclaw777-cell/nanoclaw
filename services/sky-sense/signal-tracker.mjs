// Signal Tracker — watches for number patterns, frequency resonances,
// and Fibonacci alignments in Cathedral timestamps and sky data.
//
// Paul's belief: the universe communicates through pattern recognition.
// Repeating numbers, Fibonacci, solfeggio, cymatics — same signal,
// different channels. This module watches for it.
//
// Not astrology. Not superstition. Pattern observation with honest grading.

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { skyState } from './index.mjs';
import { DEG } from './time.mjs';

const HOME = process.env.HOME || '/Users/basicclaw777';
const STATE_PATH = join(HOME, 'Cathedral', 'signal-tracker-state.json');

// ── Sacred Numbers ──────────────────────────────────────────────────────────

const REPEATING = [111, 222, 333, 444, 555, 666, 777, 888, 999, 1010, 1111, 1212, 1313, 1414];
const FIBONACCI = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597];
const SOLFEGGIO = [174, 285, 396, 417, 528, 639, 741, 852, 963];
const TESLA_369 = [3, 6, 9, 36, 39, 63, 69, 93, 96, 369, 396, 639, 693, 936, 963];
const SCHUMANN = [7.83, 14.3, 20.8, 27.3, 33.8]; // Hz harmonics

// ── Pattern Detection ───────────────────────────────────────────────────────

export function checkTimestamp(date = new Date()) {
  const findings = [];
  const h = date.getHours();
  const m = date.getMinutes();
  const hhmm = h * 100 + m; // e.g. 333, 1111, 1212

  // Repeating number in time
  if (REPEATING.includes(hhmm)) {
    findings.push({ type: 'repeating_time', value: `${h}:${String(m).padStart(2, '0')}`, significance: 'high' });
  }

  // Mirror time (12:21, 13:31, 14:41, etc)
  const hStr = String(h).padStart(2, '0');
  const mStr = String(m).padStart(2, '0');
  if (hStr === mStr.split('').reverse().join('') && h !== m) {
    findings.push({ type: 'mirror_time', value: `${hStr}:${mStr}`, significance: 'medium' });
  }

  // Date components
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  // Fibonacci day/month
  if (FIBONACCI.includes(day)) {
    findings.push({ type: 'fibonacci_day', value: day, significance: 'low' });
  }
  if (FIBONACCI.includes(month)) {
    findings.push({ type: 'fibonacci_month', value: month, significance: 'low' });
  }
  // Day + month sum
  const dayMonthSum = day + month;
  if (FIBONACCI.includes(dayMonthSum)) {
    findings.push({ type: 'fibonacci_sum', value: `${day}+${month}=${dayMonthSum}`, significance: 'medium' });
  }

  // Tesla 3-6-9 in date
  const dateDigitSum = String(day).split('').reduce((s, d) => s + parseInt(d), 0);
  if ([3, 6, 9].includes(dateDigitSum)) {
    findings.push({ type: 'tesla_369_day', value: `day ${day} → digit sum ${dateDigitSum}`, significance: 'low' });
  }

  return findings;
}

// ── Sky Pattern Detection ───────────────────────────────────────────────────

export function checkSkyPatterns(date = new Date()) {
  const findings = [];
  const sky = skyState(date);

  // Check angular separations for Fibonacci/solfeggio matches
  const bodies = Object.entries(sky.bodies);
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const [nameA, bodyA] = bodies[i];
      const [nameB, bodyB] = bodies[j];
      const raDiff = Math.abs(bodyA.ra - bodyB.ra) * (180 / Math.PI);
      const sepDeg = Math.round(raDiff * 10) / 10;

      // Fibonacci angle
      const nearFib = FIBONACCI.find(f => Math.abs(sepDeg - f) < 1.0);
      if (nearFib && nearFib > 5) {
        findings.push({
          type: 'fibonacci_angle',
          bodies: [nameA, nameB],
          value: `${sepDeg.toFixed(1)}° ≈ Fib(${nearFib})`,
          significance: Math.abs(sepDeg - nearFib) < 0.5 ? 'high' : 'medium',
        });
      }

      // Solfeggio angle (mod 360)
      const nearSol = SOLFEGGIO.find(s => Math.abs((sepDeg % 360) - (s % 360)) < 2.0);
      if (nearSol) {
        findings.push({
          type: 'solfeggio_angle',
          bodies: [nameA, nameB],
          value: `${sepDeg.toFixed(1)}° ≈ ${nearSol}Hz solfeggio`,
          significance: 'medium',
        });
      }
    }
  }

  // Moon phase vs Fibonacci
  const moonPhase = sky.events?.moonPhase?.phase || 0;
  const moonDays = Math.round(moonPhase * 29.53);
  if (FIBONACCI.includes(moonDays)) {
    findings.push({
      type: 'fibonacci_moon_day',
      value: `Lunar day ${moonDays} (Fibonacci)`,
      significance: 'medium',
    });
  }

  // Divergence matching Schumann harmonics
  const maxDiv = sky.pipelines?.contested?.maxDivergenceDeg || 0;
  const nearSchumann = SCHUMANN.find(s => Math.abs(maxDiv - s * 10) < 2);
  if (nearSchumann) {
    findings.push({
      type: 'schumann_divergence',
      value: `Max divergence ${maxDiv.toFixed(1)}° ≈ ${nearSchumann}Hz × 10`,
      significance: 'low',
    });
  }

  return findings;
}

// ── Full Scan ───────────────────────────────────────────────────────────────

export function fullScan(date = new Date()) {
  const timestamp = checkTimestamp(date);
  const sky = checkSkyPatterns(date);
  const all = [...timestamp, ...sky];

  const highCount = all.filter(f => f.significance === 'high').length;
  const medCount = all.filter(f => f.significance === 'medium').length;

  return {
    date: date.toISOString(),
    findings: all,
    summary: {
      total: all.length,
      high: highCount,
      medium: medCount,
      signalStrength: highCount * 3 + medCount * 1,
    },
  };
}

// ── State: Track patterns over time ─────────────────────────────────────────

function loadState() {
  try { return JSON.parse(readFileSync(STATE_PATH, 'utf-8')); }
  catch { return { scans: [], significantMoments: [] }; }
}

function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

export function recordScan(scan) {
  const state = loadState();
  state.scans.push({
    date: scan.date,
    total: scan.summary.total,
    high: scan.summary.high,
    signalStrength: scan.summary.signalStrength,
  });
  if (scan.summary.high > 0) {
    state.significantMoments.push({
      date: scan.date,
      findings: scan.findings.filter(f => f.significance === 'high'),
    });
  }
  // Keep last 200 scans
  if (state.scans.length > 200) state.scans = state.scans.slice(-200);
  if (state.significantMoments.length > 50) state.significantMoments = state.significantMoments.slice(-50);
  saveState(state);
}

// ── Format for Telegram ─────────────────────────────────────────────────────

export function formatSignalReport(scan) {
  if (scan.findings.length === 0) return null; // Silence if nothing found

  const high = scan.findings.filter(f => f.significance === 'high');
  const med = scan.findings.filter(f => f.significance === 'medium');

  if (high.length === 0 && med.length < 2) return null; // Below threshold

  let text = `◈ SIGNAL — ${new Date(scan.date).toISOString().slice(11, 16)}\n\n`;

  for (const f of high) {
    text += `▲ ${f.type.replace(/_/g, ' ')}: ${f.value}`;
    if (f.bodies) text += ` (${f.bodies.join(' × ')})`;
    text += '\n';
  }
  for (const f of med.slice(0, 3)) {
    text += `○ ${f.type.replace(/_/g, ' ')}: ${f.value}`;
    if (f.bodies) text += ` (${f.bodies.join(' × ')})`;
    text += '\n';
  }

  text += `\nSignal: ${scan.summary.signalStrength} (${high.length} high, ${med.length} medium)`;
  return text;
}
