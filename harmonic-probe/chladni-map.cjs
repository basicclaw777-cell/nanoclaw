#!/usr/bin/env node
'use strict';

// Chladni Map — bridges harmonic probe state to physical vibration patterns
//
// Reads voice-registry.json composite field → selects the Chladni plate pattern
// whose modal complexity best matches the system's current harmonic state.
//
// Circular Chladni plate: frequency ∝ (m + 2n)² where n=radial, m=angular nodes.
// Low n,m = simple pattern (high coherence). High n,m = complex (low coherence).
// Faraday patterns = wave interference on water, mapped by visual complexity.

const fs = require('fs');
const path = require('path');

const PROBE = __dirname;
const CYM_LIB = path.join(process.env.HOME, 'Cathedral/artifacts/crop-circles/lib/cym');
const META_PATH = path.join(process.env.HOME, 'Cathedral/artifacts/crop-circles/lib/meta.json');
const REGISTRY_PATH = path.join(PROBE, 'voice-registry.json');
const OUT_PATH = path.join(PROBE, 'chladni-state.json');

function loadJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

// Complexity score for a Chladni pattern: higher = more intricate
function patternComplexity(entry) {
  if (entry.family === 'circular plate') {
    return (entry.n || 0) + (entry.m || 0) * 1.5;
  }
  if (entry.family === 'circular mix') {
    const parts = entry.name.replace('circmix_', '').split('_').map(Number);
    return (parts[0] + parts[1]) / 20;
  }
  if (entry.family === 'faraday') {
    const parts = entry.name.replace('faraday_', '').split('_');
    return (Number(parts[0]) + Number(parts[1])) / 8;
  }
  return 5;
}

// Map probe composite state to a target complexity (0-1 scale)
function probeToComplexity(composite) {
  // Low coherence = complex pattern, high coherence = simple
  const coherenceFactor = 1 - composite.coherence;
  // High dissonance = more nodes/complexity
  const dissonanceFactor = composite.dissonance;
  // High cross-beat energy = more interference = more complex
  const beatFactor = composite.crossBeatEnergy;
  // Weight: coherence dominates, dissonance and beats add texture
  return coherenceFactor * 0.5 + dissonanceFactor * 0.25 + beatFactor * 0.25;
}

// Select the best-matching pattern from the library
function selectPattern(meta, targetComplexity) {
  const cymPatterns = meta.filter(e => e.kind === 'cym');
  const complexities = cymPatterns.map(p => ({
    ...p,
    complexity: patternComplexity(p),
  }));

  const maxC = Math.max(...complexities.map(p => p.complexity));
  const minC = Math.min(...complexities.map(p => p.complexity));
  const range = maxC - minC || 1;

  // Normalize complexities to 0-1
  const normalized = complexities.map(p => ({
    ...p,
    normComplexity: (p.complexity - minC) / range,
  }));

  // Sort by distance to target
  normalized.sort((a, b) =>
    Math.abs(a.normComplexity - targetComplexity) -
    Math.abs(b.normComplexity - targetComplexity)
  );

  // Return top 5 matches
  return normalized.slice(0, 5);
}

// Select a secondary pattern representing the dominant cross-layer beat
function selectBeatPattern(meta, composite) {
  if (!composite.crossLayerBeats || !composite.crossLayerBeats.length) return null;
  const topBeat = composite.crossLayerBeats[0];
  // Use beat frequency to pick a Faraday pattern (water interference)
  const faraday = meta.filter(e => e.kind === 'cym' && e.family === 'faraday');
  if (!faraday.length) return null;
  // Map beat amplitude to pattern: strong beat = more regular pattern
  const idx = Math.floor(topBeat.combinedAmplitude * (faraday.length - 1));
  return { ...faraday[Math.min(idx, faraday.length - 1)], beat: topBeat };
}

// Map chord quality to a pattern family preference
function chordPreference(chord) {
  const prefs = {
    'major': 'circular plate',
    'minor': 'circular plate',
    'diminished': 'circular mix',
    'augmented': 'faraday',
    'suspended': 'circular plate',
  };
  return prefs[chord] || 'circular plate';
}

function main() {
  const registry = loadJSON(REGISTRY_PATH);
  const meta = loadJSON(META_PATH);
  if (!registry || !meta) {
    console.error('Missing voice-registry.json or meta.json');
    process.exit(1);
  }

  const composite = registry.composite;
  const chord = registry.systemChord?.quality || 'diminished';

  const targetComplexity = probeToComplexity(composite);
  const preferredFamily = chordPreference(chord);

  console.log('=== Chladni Map ===');
  console.log(`System: coherence=${composite.coherence} energy=${composite.totalEnergy} dissonance=${composite.dissonance}`);
  console.log(`Chord: ${chord} → preferred family: ${preferredFamily}`);
  console.log(`Target complexity: ${targetComplexity.toFixed(3)} (0=simple, 1=complex)`);
  console.log('');

  // Get all matches, then prefer the chord-family
  const matches = selectPattern(meta, targetComplexity);
  const familyMatch = matches.find(m => m.family === preferredFamily) || matches[0];
  const primary = familyMatch;

  const imgPath = path.join(CYM_LIB, primary.name + '.png');
  const imgExists = fs.existsSync(imgPath);

  console.log(`Primary pattern: ${primary.name} (${primary.family})`);
  console.log(`  Complexity: ${primary.normComplexity.toFixed(3)} (target: ${targetComplexity.toFixed(3)})`);
  console.log(`  Image: ${imgExists ? imgPath : 'NOT FOUND'}`);

  // Beat pattern (Faraday)
  const beat = selectBeatPattern(meta, composite);
  let beatImgPath = null;
  if (beat) {
    beatImgPath = path.join(CYM_LIB, beat.name + '.png');
    console.log(`\nBeat pattern: ${beat.name} (${beat.family})`);
    console.log(`  From: ${beat.beat.pair} at ${beat.beat.beatFreq}Hz`);
    console.log(`  Image: ${fs.existsSync(beatImgPath) ? beatImgPath : 'NOT FOUND'}`);
  }

  // All top 5 for the dashboard to show alternatives
  console.log('\nTop 5 matches:');
  matches.forEach((m, i) => {
    const exists = fs.existsSync(path.join(CYM_LIB, m.name + '.png'));
    console.log(`  ${i + 1}. ${m.name} (${m.family}) complexity=${m.normComplexity.toFixed(3)} ${exists ? '✓' : '✗'}`);
  });

  // Build base64 data URIs for the dashboard
  function imgToDataUri(p) {
    if (!fs.existsSync(p)) return null;
    const buf = fs.readFileSync(p);
    return 'data:image/png;base64,' + buf.toString('base64');
  }

  const result = {
    generated: new Date().toISOString(),
    systemState: {
      coherence: composite.coherence,
      energy: composite.totalEnergy,
      dissonance: composite.dissonance,
      crossBeatEnergy: composite.crossBeatEnergy,
      chord,
    },
    targetComplexity,
    primary: {
      name: primary.name,
      family: primary.family,
      complexity: primary.normComplexity,
      imagePath: imgPath,
      dataUri: imgToDataUri(imgPath),
    },
    beat: beat ? {
      name: beat.name,
      family: beat.family,
      pair: beat.beat.pair,
      beatFreq: beat.beat.beatFreq,
      layers: beat.beat.layers,
      imagePath: beatImgPath,
      dataUri: imgToDataUri(beatImgPath),
    } : null,
    alternatives: matches.map(m => ({
      name: m.name,
      family: m.family,
      complexity: m.normComplexity,
      dataUri: imgToDataUri(path.join(CYM_LIB, m.name + '.png')),
    })),
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2));
  console.log(`\nWritten to ${OUT_PATH}`);
}

main();
