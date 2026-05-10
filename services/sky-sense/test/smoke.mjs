// Sky Sense — Smoke test
// Validates all pipelines produce reasonable output for known dates.

import { skyState, skyStateLight, findEvents, comparePipelines } from '../index.mjs';

function log(label, val) {
  console.log(`\n── ${label} ──`);
  if (typeof val === 'object') {
    console.log(JSON.stringify(val, (k, v) => {
      if (v instanceof Date) return v.toISOString();
      if (typeof v === 'number') return Number(v.toFixed(6));
      return v;
    }, 2));
  } else {
    console.log(val);
  }
}

const DEG = 180 / Math.PI;

// Test 1: Current sky state
console.log('═══════════════════════════════════════════');
console.log('  SKY SENSE — Smoke Test');
console.log('═══════════════════════════════════════════');

const now = new Date();
const state = skyState(now);

log('Timestamp', state.timestamp);
log('Julian Day', state.jd);
log('GMST (hours)', state.gmst);
log('Obliquity (deg)', state.obliquity);

console.log('\n── Body Positions (RA/Dec in degrees) ──');
for (const [name, body] of Object.entries(state.bodies)) {
  const ra = (body.ra * DEG).toFixed(2);
  const dec = (body.dec * DEG).toFixed(2);
  const extra = [];
  if (body.elongation) extra.push(`elong=${body.elongation.toFixed(1)}°`);
  if (body.name) extra.push(body.name);
  if (body.constellation) extra.push(`in ${body.constellation}`);
  console.log(`  ${name.padEnd(8)} RA=${ra.padStart(8)}°  Dec=${dec.padStart(8)}°  ${extra.join(' | ')}`);
}

log('Moon Phase', state.events.moonPhase);
log('Retrogrades', state.events.currentRetrogrades);

console.log('\n── Pipeline Divergence ──');
for (const [name, comp] of Object.entries(state.pipelines.comparison)) {
  const div = comp.divergenceDeg.toFixed(3);
  const status = comp.consensus ? '✓ CONSENSUS' : '✗ CONTESTED';
  console.log(`  ${name.padEnd(8)} ${div}°  ${status}`);
}
log('Frontier', state.pipelines.frontier);

// Test 2: Known eclipse date — 2024 April 8 total solar eclipse
console.log('\n\n═══════════════════════════════════════════');
console.log('  Validation: 2024-04-08 Solar Eclipse');
console.log('═══════════════════════════════════════════');

const eclipseDate = new Date('2024-04-08T18:00:00Z');
const eclipseState = skyState(eclipseDate);
const sunMoonSep = Math.sqrt(
  Math.pow((eclipseState.bodies.sun.ra - eclipseState.bodies.moon.ra) * Math.cos(eclipseState.bodies.sun.dec), 2) +
  Math.pow(eclipseState.bodies.sun.dec - eclipseState.bodies.moon.dec, 2)
) * DEG;
console.log(`  Sun-Moon separation: ${sunMoonSep.toFixed(2)}° (should be near 0° for eclipse)`);
console.log(`  Moon phase: ${eclipseState.events.moonPhase.name} (should be new moon)`);
console.log(`  Moon illumination: ${(eclipseState.events.moonPhase.illumination * 100).toFixed(1)}% (should be near 0%)`);

// Test 3: Pipeline comparison for Mercury (known max divergence)
console.log('\n\n═══════════════════════════════════════════');
console.log('  Pipeline Stress: Mercury Comparison');
console.log('═══════════════════════════════════════════');

const mercComp = comparePipelines('mercury', now);
console.log('  Pipeline results (RA in degrees):');
for (const [pName, pos] of Object.entries(mercComp.pipelines)) {
  const ra = isNaN(pos.ra) ? 'NaN' : (pos.ra * DEG).toFixed(3);
  const dec = isNaN(pos.dec) ? 'NaN' : (pos.dec * DEG).toFixed(3);
  console.log(`    ${pName.padEnd(8)} RA=${ra.padStart(10)}  Dec=${dec.padStart(10)}`);
}
console.log(`  Max divergence: ${mercComp.divergenceDeg.toFixed(3)}°`);
console.log(`  Consensus: ${mercComp.consensus}`);

// Test 4: Light state (fast path)
console.log('\n\n═══════════════════════════════════════════');
console.log('  Light State (fast path)');
console.log('═══════════════════════════════════════════');
const t0 = performance.now();
const light = skyStateLight(now);
const elapsed = performance.now() - t0;
console.log(`  Computed in ${elapsed.toFixed(1)}ms`);
console.log(`  Moon: ${light.moonPhase}`);
console.log(`  Retrogrades: ${light.retrogrades.join(', ') || 'none'}`);

// Test 5: Event detection
console.log('\n\n═══════════════════════════════════════════');
console.log('  Event Detection (next 90 days)');
console.log('═══════════════════════════════════════════');
const t1 = performance.now();
const events = findEvents(now, 90);
const elapsed2 = performance.now() - t1;
console.log(`  Computed in ${elapsed2.toFixed(0)}ms`);
if (events.nextConjunction) {
  console.log(`  Next conjunction: ${events.nextConjunction.bodies.join('-')} on ${events.nextConjunction.date.toISOString().split('T')[0]} (${events.nextConjunction.separation.toFixed(1)}°)`);
}
console.log(`  Next new moon: ${events.nextNewMoon.toISOString().split('T')[0]}`);
console.log(`  Next full moon: ${events.nextFullMoon.toISOString().split('T')[0]}`);
if (events.eclipses.nextSolar) {
  console.log(`  Next solar eclipse: ${events.eclipses.nextSolar.date.toISOString().split('T')[0]}`);
}
if (events.eclipses.nextLunar) {
  console.log(`  Next lunar eclipse: ${events.eclipses.nextLunar.date.toISOString().split('T')[0]}`);
}

console.log('\n═══════════════════════════════════════════');
console.log('  ALL TESTS COMPLETE');
console.log('═══════════════════════════════════════════\n');
