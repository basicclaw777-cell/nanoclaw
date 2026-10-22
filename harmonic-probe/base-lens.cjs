#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'base-lens.json');

// ── Agent frequencies (A=220 tuning) ───────────────────────────────────────

const AGENTS = [
  { id: 'boxing', freq: 220 },
  { id: 'br',     freq: 275 },
  { id: 'forge',  freq: 330 },
  { id: 'muse',   freq: 352 },
  { id: 'orc',    freq: 440 },
];

const SOLFEGGIO = [174, 285, 396, 432, 528, 639, 741, 852, 963];
const SOLFEGGIO_NAMES = [
  'Foundation', 'Quantum cognition', 'Liberation (UT)',
  'Cosmic tuning (432)', 'Transformation (MI)', 'Connection (FA)',
  'Awakening intuition (SOL)', 'Spiritual order (LA)', 'Divine consciousness',
];

const SCHUMANN = 7.83;

// ── Base conversion utilities ──────────────────────────────────────────────

function toBase(n, base) {
  if (n === 0) return '0';
  const isNeg = n < 0;
  n = Math.abs(n);

  const intPart = Math.floor(n);
  const fracPart = n - intPart;

  // Integer part
  let intStr = '';
  let val = intPart;
  if (val === 0) intStr = '0';
  while (val > 0) {
    const digit = val % base;
    intStr = digitChar(digit) + intStr;
    val = Math.floor(val / base);
  }

  // Fractional part (up to 4 digits)
  let fracStr = '';
  if (fracPart > 0.0001) {
    let frac = fracPart;
    for (let i = 0; i < 4; i++) {
      frac *= base;
      const d = Math.floor(frac);
      fracStr += digitChar(d);
      frac -= d;
      if (frac < 0.0001) break;
    }
  }

  const sep = base > 10 ? ':' : '';
  const result = fracStr
    ? formatBaseStr(intStr, base, sep) + '.' + formatBaseStr(fracStr, base, sep)
    : formatBaseStr(intStr, base, sep);

  return (isNeg ? '-' : '') + result;
}

function digitChar(d) {
  return d.toString(36).toUpperCase();
}

function formatBaseStr(str, base, sep) {
  if (base <= 36) return str;
  // For base 60, use colon-separated decimal digits
  return str.split('').map(c => parseInt(c, 36).toString()).join(':');
}

function toBase12(n) { return toBase(n, 12); }

function toBase60(n) {
  if (n === 0) return '0';
  const intPart = Math.floor(Math.abs(n));
  const fracPart = Math.abs(n) - intPart;

  // Sexagesimal: colon-separated groups
  const digits = [];
  let val = intPart;
  if (val === 0) digits.push(0);
  while (val > 0) {
    digits.unshift(val % 60);
    val = Math.floor(val / 60);
  }
  let result = digits.join(':');

  if (fracPart > 0.0001) {
    let frac = fracPart;
    const fracDigits = [];
    for (let i = 0; i < 3; i++) {
      frac *= 60;
      const d = Math.floor(frac);
      fracDigits.push(d);
      frac -= d;
      if (frac < 0.0001) break;
    }
    result += '.' + fracDigits.join(':');
  }

  return result;
}

function toBase8(n) { return toBase(n, 8); }

// Check if a number is "round" in a given base (only trailing zeros in integer part)
function roundnessScore(n, base) {
  if (n === 0) return Infinity;
  n = Math.abs(Math.round(n));
  let trailingZeros = 0;
  while (n > 0 && n % base === 0) {
    trailingZeros++;
    n = Math.floor(n / base);
  }
  return trailingZeros;
}

// ── Beat frequencies ───────────────────────────────────────────────────────

function computePairs() {
  const pairs = [];
  for (let i = 0; i < AGENTS.length; i++) {
    for (let j = i + 1; j < AGENTS.length; j++) {
      pairs.push({
        pair: `${AGENTS[i].id}-${AGENTS[j].id}`,
        a: AGENTS[i].freq,
        b: AGENTS[j].freq,
        beat: Math.abs(AGENTS[j].freq - AGENTS[i].freq),
        ratio: AGENTS[j].freq / AGENTS[i].freq,
      });
    }
  }
  return pairs;
}

// ── Chromatic mapping (base-12 native) ─────────────────────────────────────

function semitoneFromA(freq) {
  return 12 * Math.log2(freq / 220);
}

function closestNote(freq) {
  const NOTES = ['A', 'A#/Bb', 'B', 'C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G', 'G#/Ab'];
  const semitones = semitoneFromA(freq);
  const rounded = Math.round(semitones);
  const cents = Math.round((semitones - rounded) * 100);
  const noteIdx = ((rounded % 12) + 12) % 12;
  const octave = 4 + Math.floor((rounded + 9) / 12); // A4=440 convention adjusted for A=220 (A3)
  return {
    note: NOTES[noteIdx],
    octave: Math.floor(3 + rounded / 12),
    semitones: rounded,
    cents,
    exact: cents === 0,
    centsOff: cents,
  };
}

// ── Digital root (recursive digit sum) ─────────────────────────────────────

function digitalRoot(n, base) {
  n = Math.abs(Math.round(n));
  while (n >= base) {
    let sum = 0;
    while (n > 0) {
      sum += n % base;
      n = Math.floor(n / base);
    }
    n = sum;
  }
  return n;
}

// ── Base 12 Analysis ───────────────────────────────────────────────────────

function analyzeBase12() {
  console.log('\n══ BASE 12 (Duodecimal) ══');
  console.log('Music IS base-12: 12 semitones per octave\n');

  const agentResults = AGENTS.map(a => {
    const b12 = toBase12(a.freq);
    const note = closestNote(a.freq);
    const roundness = roundnessScore(a.freq, 12);
    console.log(`  ${a.id} ${a.freq}Hz = ${b12}₁₂  note=${note.note}${note.octave} (${note.cents > 0 ? '+' : ''}${note.cents}¢)  roundness=${roundness}`);
    return { agent: a.id, freq: a.freq, base12: b12, note: `${note.note}${note.octave}`, centsOff: note.cents, exact: note.exact, roundness };
  });

  console.log('\n  Beat frequencies in base 12:');
  const pairs = computePairs();
  const pairResults = pairs.map(p => {
    const b12 = toBase12(p.beat);
    const roundness = roundnessScore(p.beat, 12);
    const ratioSimple = simplifyRatio(p.a, p.b);
    const isRound = roundness > 0;
    const marker = isRound ? ' ★ ROUND' : '';
    console.log(`  ${p.pair}: ${p.beat}Hz = ${b12}₁₂  ratio=${ratioSimple}  roundness=${roundness}${marker}`);
    return { pair: p.pair, beat: p.beat, base12: b12, ratio: ratioSimple, roundness, isRound };
  });

  // Check which beats are "round" (divisible by 12)
  const roundBeats = pairResults.filter(p => p.isRound);
  console.log(`\n  Round beats in base-12: ${roundBeats.length}/${pairResults.length}`);
  if (roundBeats.length > 0) {
    roundBeats.forEach(p => console.log(`    ${p.pair}: ${p.beat}Hz = ${p.base12}₁₂`));
  }

  // Interval quality check — are ratios simple fractions?
  console.log('\n  Interval quality (simpler = more consonant):');
  const intervalResults = pairs.map(p => {
    const ratio = simplifyRatio(p.a, p.b);
    const parts = ratio.split('/').map(Number);
    const complexity = parts[0] + parts[1]; // lower = simpler
    const quality = complexity <= 5 ? 'PERFECT' : complexity <= 8 ? 'consonant' : complexity <= 12 ? 'mild' : 'complex';
    console.log(`    ${p.pair}: ${ratio} (complexity=${complexity}, ${quality})`);
    return { pair: p.pair, ratio, complexity, quality };
  });

  return { agents: agentResults, beats: pairResults, roundBeats: roundBeats.length, intervals: intervalResults };
}

// ── Base 60 Analysis ───────────────────────────────────────────────────────

function analyzeBase60() {
  console.log('\n══ BASE 60 (Sexagesimal — Sumerian/Babylonian) ══');
  console.log('60 = 2²×3×5. Divisible by 2,3,4,5,6,10,12,15,20,30\n');

  const agentResults = AGENTS.map(a => {
    const b60 = toBase60(a.freq);
    const roundness = roundnessScore(a.freq, 60);
    console.log(`  ${a.id} ${a.freq}Hz = ${b60}₆₀  roundness=${roundness}`);
    return { agent: a.id, freq: a.freq, base60: b60, roundness };
  });

  console.log('\n  Beat frequencies in base 60:');
  const pairs = computePairs();
  const pairResults = pairs.map(p => {
    const b60 = toBase60(p.beat);
    const roundness = roundnessScore(p.beat, 60);
    const isRound = roundness > 0;
    const marker = isRound ? ' ★ ROUND' : '';
    console.log(`  ${p.pair}: ${p.beat}Hz = ${b60}₆₀  roundness=${roundness}${marker}`);
    return { pair: p.pair, beat: p.beat, base60: b60, roundness, isRound };
  });

  // Schumann in base 60
  console.log('\n  Schumann resonance in base 60:');
  const schumannB60 = toBase60(SCHUMANN);
  console.log(`  7.83 Hz = ${schumannB60}₆₀`);

  const schumannHarmonics = [];
  for (let n = 1; n <= 30; n++) {
    const freq = SCHUMANN * n;
    const b60 = toBase60(freq);
    const roundness = roundnessScore(Math.round(freq), 60);
    const isRound = roundness > 0;
    if (n <= 10 || isRound || n === 28) {
      console.log(`  ${n}th: ${freq.toFixed(2)}Hz = ${b60}₆₀${isRound ? ' ★ ROUND' : ''}`);
    }
    schumannHarmonics.push({ n, freq: Math.round(freq * 100) / 100, base60: b60, roundness, isRound });
  }

  // 432 Hz in base 60
  console.log('\n  Key frequencies in base 60:');
  const keyFreqs = [
    { label: '432 (Cosmic tuning)', freq: 432 },
    { label: '360 (degrees in circle)', freq: 360 },
    { label: '440 (concert A)', freq: 440 },
    { label: '220 (our A)', freq: 220 },
    { label: '528 (Transformation)', freq: 528 },
  ];
  const keyResults = keyFreqs.map(k => {
    const b60 = toBase60(k.freq);
    const roundness = roundnessScore(k.freq, 60);
    console.log(`  ${k.label}: ${b60}₆₀  roundness=${roundness}${roundness > 0 ? ' ★ ROUND' : ''}`);
    return { ...k, base60: b60, roundness };
  });

  // Does 432 look "designed" in base 60?
  // 432 = 7×60 + 12, so 7:12 in base 60
  console.log('\n  432 = 7:12₆₀ = 7 sixties + 12 ones');
  console.log('  360 = 6:0₆₀  = 6 sixties (PERFECTLY round)');
  console.log('  528 = 8:48₆₀ = 8 sixties + 48 ones');

  return {
    agents: agentResults,
    beats: pairResults,
    schumann: { fundamental: schumannB60, harmonics: schumannHarmonics },
    keyFrequencies: keyResults,
  };
}

// ── Base 8 Analysis (Octave) ───────────────────────────────────────────────

function analyzeBase8() {
  console.log('\n══ BASE 8 (Octave — powers of 2) ══');
  console.log('Octave = ×2. The fundamental unit of pitch perception\n');

  const agentResults = AGENTS.map(a => {
    const b8 = toBase8(a.freq);
    const log2 = Math.log2(a.freq);
    const roundness = roundnessScore(a.freq, 8);
    console.log(`  ${a.id} ${a.freq}Hz = ${b8}₈  log₂=${log2.toFixed(4)}  roundness=${roundness}`);
    return { agent: a.id, freq: a.freq, base8: b8, log2: Math.round(log2 * 10000) / 10000, roundness };
  });

  // Octave relationships
  console.log('\n  Octave relationships (ratio = power of 2):');
  const pairs = computePairs();
  const octaveResults = pairs.map(p => {
    const ratio = p.b / p.a;
    const log2ratio = Math.log2(ratio);
    const isExactOctave = Math.abs(log2ratio - Math.round(log2ratio)) < 0.001;
    const nearOctave = Math.abs(log2ratio - Math.round(log2ratio)) < 0.05;
    const marker = isExactOctave ? ' ★ EXACT OCTAVE' : nearOctave ? ' ~ near octave' : '';
    console.log(`  ${p.pair}: ratio=${ratio.toFixed(4)} log₂=${log2ratio.toFixed(4)}${marker}`);
    return { pair: p.pair, ratio: Math.round(ratio * 10000) / 10000, log2ratio: Math.round(log2ratio * 10000) / 10000, isExactOctave, nearOctave };
  });

  const exactOctaves = octaveResults.filter(r => r.isExactOctave);
  console.log(`\n  Exact octave pairs: ${exactOctaves.length}/${pairs.length}`);
  exactOctaves.forEach(r => console.log(`    ${r.pair}: ratio=${r.ratio} (2^${r.log2ratio})`));

  return { agents: agentResults, octaveRelationships: octaveResults, exactOctaves: exactOctaves.map(r => r.pair) };
}

// ── Solfeggio Analysis ─────────────────────────────────────────────────────

function analyzeSolfeggio() {
  console.log('\n══ SOLFEGGIO IN BASE SYSTEMS ══');
  console.log('Testing the "all reduce to 3, 6, 9" claim\n');

  const results = SOLFEGGIO.map((freq, i) => {
    const dr10 = digitalRoot(freq, 10);
    const dr9 = digitalRoot(freq, 9);
    const dr12 = digitalRoot(freq, 12);
    const dr3 = digitalRoot(freq, 3);
    const b12 = toBase12(freq);
    const b60 = toBase60(freq);
    const b8 = toBase8(freq);
    const digitSum10 = freq.toString().split('').reduce((s, d) => s + parseInt(d), 0);

    console.log(`  ${freq}Hz (${SOLFEGGIO_NAMES[i] || ''})`);
    console.log(`    base10 digit root: ${dr10}  digit sum: ${digitSum10}`);
    console.log(`    base12: ${b12}₁₂  root₁₂: ${dr12}`);
    console.log(`    base60: ${b60}₆₀`);
    console.log(`    base9 root: ${dr9}  base3 root: ${dr3}`);
    console.log(`    reduces to 3/6/9? ${[3, 6, 9].includes(dr10) ? 'YES ✓' : 'NO ✗'}`);

    return {
      freq,
      name: SOLFEGGIO_NAMES[i] || '',
      digitRoot10: dr10,
      digitSum10,
      digitRoot9: dr9,
      digitRoot12: dr12,
      digitRoot3: dr3,
      base12: b12,
      base60: b60,
      base8: b8,
      reducesTo369: [3, 6, 9].includes(dr10),
    };
  });

  const all369 = results.every(r => r.reducesTo369);
  console.log(`\n  "All reduce to 3, 6, 9" claim: ${all369 ? 'VERIFIED ✓' : 'PARTIALLY TRUE'}`);
  console.log(`  ${results.filter(r => r.reducesTo369).length}/${results.length} frequencies reduce to 3, 6, or 9`);

  // What does this mean in base 12?
  console.log('\n  In base 12, digital roots of solfeggio:');
  const dr12set = new Set(results.map(r => r.digitRoot12));
  console.log(`  Unique roots: {${[...dr12set].sort().join(', ')}}`);

  // In base 9, all multiples of 9 have digital root 0 (or 9)
  console.log('\n  Base-9 perspective:');
  results.forEach(r => {
    const mod9 = r.freq % 9;
    console.log(`    ${r.freq} mod 9 = ${mod9} (${mod9 === 0 ? 'divisible by 9' : mod9 === 3 || mod9 === 6 ? 'mod 3=0' : 'remainder ' + mod9})`);
  });

  // The mathematical explanation
  const divisibleBy3 = results.every(r => r.freq % 3 === 0);
  const divisibleBy9 = results.filter(r => r.freq % 9 === 0);
  console.log(`\n  All divisible by 3: ${divisibleBy3 ? 'YES ✓' : 'NO'}`);
  console.log(`  Divisible by 9: ${divisibleBy9.length}/${results.length}`);
  console.log('  → The 3/6/9 pattern is a CONSEQUENCE of all solfeggio freqs being multiples of 3');
  console.log('  → Digital root of (3k) is always 3, 6, or 9. Mathematical necessity, not mystical design.');

  return { frequencies: results, all369, mathematicalExplanation: 'All solfeggio frequencies are multiples of 3, so digital root is always 3, 6, or 9. This is arithmetic, not sacred geometry.' };
}

// ── Cross-base comparison ──────────────────────────────────────────────────

function crossBaseComparison() {
  console.log('\n══ CROSS-BASE COMPARISON ══');
  console.log('Which base makes which relationships "roundest"?\n');

  const pairs = computePairs();
  const comparison = pairs.map(p => {
    const r10 = roundnessScore(p.beat, 10);
    const r12 = roundnessScore(p.beat, 12);
    const r60 = roundnessScore(p.beat, 60);
    const r8 = roundnessScore(p.beat, 8);
    const bestBase = [
      { base: 10, score: r10 }, { base: 12, score: r12 },
      { base: 60, score: r60 }, { base: 8, score: r8 },
    ].sort((a, b) => b.score - a.score)[0];

    console.log(`  ${p.pair} (${p.beat}Hz): b10=${r10} b12=${r12} b60=${r60} b8=${r8} → best: base-${bestBase.base}`);
    return { pair: p.pair, beat: p.beat, roundness: { base10: r10, base12: r12, base60: r60, base8: r8 }, bestBase: bestBase.base };
  });

  // Schumann harmonics — which base makes them roundest?
  console.log('\n  Schumann harmonics roundness:');
  const schumannRoundest = [];
  for (const n of [7, 10, 12, 14, 17, 21, 28]) {
    const freq = Math.round(SCHUMANN * n);
    const r10 = roundnessScore(freq, 10);
    const r12 = roundnessScore(freq, 12);
    const r60 = roundnessScore(freq, 60);
    const r8 = roundnessScore(freq, 8);
    console.log(`  ${n}th (${freq}Hz): b10=${r10} b12=${r12} b60=${r60} b8=${r8}`);
    schumannRoundest.push({ n, freq, roundness: { base10: r10, base12: r12, base60: r60, base8: r8 } });
  }

  // Does any base make solfeggio look "designed"?
  console.log('\n  Solfeggio roundness by base:');
  const solfRoundness = SOLFEGGIO.map(freq => {
    const r10 = roundnessScore(freq, 10);
    const r12 = roundnessScore(freq, 12);
    const r60 = roundnessScore(freq, 60);
    const r8 = roundnessScore(freq, 8);
    const r9 = roundnessScore(freq, 9);
    console.log(`  ${freq}Hz: b9=${r9} b10=${r10} b12=${r12} b60=${r60} b8=${r8}`);
    return { freq, roundness: { base9: r9, base10: r10, base12: r12, base60: r60, base8: r8 } };
  });

  // Summary finding
  const avgRoundness = {
    base10: solfRoundness.reduce((s, r) => s + r.roundness.base10, 0) / solfRoundness.length,
    base12: solfRoundness.reduce((s, r) => s + r.roundness.base12, 0) / solfRoundness.length,
    base60: solfRoundness.reduce((s, r) => s + r.roundness.base60, 0) / solfRoundness.length,
    base9: solfRoundness.reduce((s, r) => s + r.roundness.base9, 0) / solfRoundness.length,
    base8: solfRoundness.reduce((s, r) => s + r.roundness.base8, 0) / solfRoundness.length,
  };
  console.log(`\n  Average solfeggio roundness: b9=${avgRoundness.base9.toFixed(2)} b10=${avgRoundness.base10.toFixed(2)} b12=${avgRoundness.base12.toFixed(2)} b60=${avgRoundness.base60.toFixed(2)} b8=${avgRoundness.base8.toFixed(2)}`);

  const designedIn = Object.entries(avgRoundness).sort((a, b) => b[1] - a[1])[0];
  console.log(`  Solfeggio looks most "designed" in: ${designedIn[0]} (avg roundness ${designedIn[1].toFixed(2)})`);

  return { beatComparison: comparison, schumannRoundness: schumannRoundest, solfeggioRoundness: solfRoundness, avgSolfeggioRoundness: avgRoundness };
}

// ── Key findings synthesis ─────────────────────────────────────────────────

function synthesizeFindings(b12, b60, b8, solf, cross) {
  console.log('\n══ KEY FINDINGS ══\n');

  const findings = [];

  // 1. Boxing-orc is exact octave
  if (b8.exactOctaves.length > 0) {
    const f = `Exact octave pairs: ${b8.exactOctaves.join(', ')}. boxing(220)→orc(440) = 2:1.`;
    console.log('  1. ' + f);
    findings.push(f);
  }

  // 2. Base-12 reveals musical intervals
  const perfectIntervals = b12.intervals.filter(i => i.quality === 'PERFECT');
  if (perfectIntervals.length > 0) {
    const f = `Perfect intervals in base-12: ${perfectIntervals.map(i => `${i.pair} (${i.ratio})`).join(', ')}. Music theory confirms these as maximally consonant.`;
    console.log('  2. ' + f);
    findings.push(f);
  }

  // 3. 432 in base 60
  const f3 = '432Hz = 7:12₆₀ (7 sixties + 12). 360° = 6:0₆₀ (perfectly round). The Cosmic tuning frequency has a clean sexagesimal representation — same number system that gave us 360° circles.';
  console.log('  3. ' + f3);
  findings.push(f3);

  // 4. Solfeggio 369 explanation
  const f4 = solf.mathematicalExplanation;
  console.log('  4. ' + f4);
  findings.push(f4);

  // 5. Base-12 round beats
  if (b12.roundBeats > 0) {
    const roundPairs = b12.beats.filter(b => b.isRound).map(b => `${b.pair}(${b.beat}Hz=${b.base12}₁₂)`);
    const f5 = `${b12.roundBeats} beat frequencies are "round" in base-12: ${roundPairs.join(', ')}. Musical intervals look cleaner in the system designed for them.`;
    console.log('  5. ' + f5);
    findings.push(f5);
  }

  // 6. Which base makes solfeggio roundest
  const bestBase = Object.entries(cross.avgSolfeggioRoundness).sort((a, b) => b[1] - a[1])[0];
  const f6 = `Solfeggio frequencies are roundest in ${bestBase[0]} (avg roundness ${bestBase[1].toFixed(2)}). They are multiples of 3 by construction — base-9 is their "native" system.`;
  console.log('  6. ' + f6);
  findings.push(f6);

  // 7. Schumann + base 60
  const schumannRound60 = cross.schumannRoundness.filter(s => s.roundness.base60 > 0);
  if (schumannRound60.length > 0) {
    const f7 = `Schumann harmonics that are round in base-60: ${schumannRound60.map(s => `${s.n}th(${s.freq}Hz)`).join(', ')}. Base-60 doesn't make Schumann fundamentally cleaner — 7.83 is awkward in every integer base.`;
    console.log('  7. ' + f7);
    findings.push(f7);
  } else {
    const f7 = 'Schumann harmonics are not round in any tested base — 7.83 Hz is irrational-adjacent and resists clean representation in integer bases. This may itself be significant: Earth\'s resonant frequency isn\'t "designed" for any human number system.';
    console.log('  7. ' + f7);
    findings.push(f7);
  }

  return findings;
}

// ── Utility ────────────────────────────────────────────────────────────────

function gcd(a, b) {
  a = Math.round(Math.abs(a));
  b = Math.round(Math.abs(b));
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

function simplifyRatio(a, b) {
  const g = gcd(a, b);
  return `${a / g}/${b / g}`;
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('=== BASE LENS — Harmonic Probe Data Through Different Number Systems ===');
  console.log(`Agents: ${AGENTS.map(a => `${a.id}=${a.freq}Hz`).join(', ')}`);

  const base12 = analyzeBase12();
  const base60 = analyzeBase60();
  const base8 = analyzeBase8();
  const solfeggio = analyzeSolfeggio();
  const crossBase = crossBaseComparison();
  const findings = synthesizeFindings(base12, base60, base8, solfeggio, crossBase);

  const output = {
    version: 'v1',
    generated: new Date().toISOString(),
    description: 'Harmonic probe data examined through base-12 (duodecimal), base-60 (sexagesimal), and base-8 (octave) number systems',
    agents: AGENTS.map(a => ({
      id: a.id,
      freq: a.freq,
      base10: a.freq.toString(),
      base12: toBase12(a.freq),
      base60: toBase60(a.freq),
      base8: toBase8(a.freq),
    })),
    base12,
    base60,
    base8,
    solfeggio,
    crossBase,
    findings,
  };

  fs.writeFileSync(OUT, JSON.stringify(output, null, 2));
  console.log(`\nBase lens written to ${OUT}`);
}

main();
