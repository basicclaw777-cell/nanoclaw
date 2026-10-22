#!/usr/bin/env node
'use strict';

// Voice Registry — Unified Harmonic Voice Extraction
//
// Takes ALL Cathedral monitoring system outputs and maps them to harmonic voices.
// Each voice = a frequency + amplitude + waveform + modulation.
// The harmonic probe then renders the composite interference pattern.
//
// Existing systems produce DATA. This produces TONE.
//
// Voice sources:
//   Layer 1 — 5 original agent voices (boxing, br, forge, muse, orc)
//   Layer 2 — 6 emergence senses (vitality, surprise, goals, temporal, dialogue, smell)
//   Layer 3 — 3 stress battery chambers (compression, contradiction, identity)
//   Layer 4 — system-level voices (heartbeat cascade, synapse coherence)

const fs = require('fs');
const path = require('path');

const HOME = process.env.HOME;
const CATH = path.join(HOME, 'Cathedral');
const NANO = path.join(HOME, 'nanoclaw');
const PROBE = __dirname;
const OUT = path.join(PROBE, 'voice-registry.json');

function loadJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

// ── Voice Fundamentals ─────────────────────────────────────────────────────
// Layer 1: Original 5 agents — pentatonic spacing from A=220
// Layer 2: Emergence senses — mapped to a DIFFERENT register (higher octave)
//          so they don't mask the agent voices but interfere with them
// Layer 3: Stress chambers — low register (sub-bass), felt not heard
// Layer 4: System-level — drone frequencies, continuous background

const VOICE_FUNDAMENTALS = {
  // Layer 1: Agent voices (A3-G4 range, 220-440Hz)
  boxing:        { freq: 220.0,  layer: 'agent',     register: 'mid' },
  br:            { freq: 275.0,  layer: 'agent',     register: 'mid' },
  forge:         { freq: 330.0,  layer: 'agent',     register: 'mid' },
  muse:          { freq: 352.0,  layer: 'agent',     register: 'mid' },
  orc:           { freq: 440.0,  layer: 'agent',     register: 'mid' },

  // Layer 2: Emergence senses (C5-B5 range, 523-988Hz — one octave up)
  vitality:      { freq: 523.25, layer: 'emergence', register: 'high' },
  surprise:      { freq: 587.33, layer: 'emergence', register: 'high' },
  goals:         { freq: 659.25, layer: 'emergence', register: 'high' },
  temporal:      { freq: 739.99, layer: 'emergence', register: 'high' },
  dialogue:      { freq: 830.61, layer: 'emergence', register: 'high' },
  smell:         { freq: 932.33, layer: 'emergence', register: 'high' },

  // Layer 3: Stress chambers (sub-bass, 55-110Hz — felt more than heard)
  compression:   { freq: 55.0,   layer: 'stress',    register: 'sub' },
  contradiction: { freq: 73.42,  layer: 'stress',    register: 'sub' },
  identity:      { freq: 110.0,  layer: 'stress',    register: 'sub' },

  // Layer 4: System drones (continuous background reference)
  heartbeat:     { freq: 7.83,   layer: 'system',    register: 'infra' },  // Schumann fundamental
  synapse:       { freq: 15.66,  layer: 'system',    register: 'infra' },  // 2nd Schumann harmonic
};

// ── Status → Harmonic Parameter Maps ────────────────────────────────────────

const STATUS_TO_AMPLITUDE = {
  'healthy': 1.0, 'active': 0.9, 'tracking': 0.8,
  'alert': 0.6, 'warning': 0.4, 'critical': 0.2, 'dead': 0.0
};

const STATUS_TO_WAVEFORM = {
  'healthy': 'sine', 'active': 'sine', 'tracking': 'triangle',
  'alert': 'sawtooth', 'warning': 'square', 'critical': 'noise', 'dead': 'silence'
};

const GRADE_TO_WAVEFORM = {
  'A': 'sine', 'B': 'triangle', 'C': 'sawtooth', 'D': 'square', 'F': 'noise'
};

const STRESS_TO_CHORD = {
  'ROBUST': 'major', 'STABLE': 'sus4', 'FRAGILE': 'diminished', 'CRITICAL': 'cluster'
};

// ── Extract Layer 1: Agent Voices ───────────────────────────────────────────

function extractAgentVoices() {
  const agentHealth = loadJSON(path.join(CATH, 'agents', 'agent-health.json'));
  const physician = loadJSON(path.join(CATH, 'physician-state.json'));
  const voices = [];

  const latestPhysician = physician?.history?.slice(-1)[0] || {};
  const senses = latestPhysician.senses || {};

  for (const agentId of ['boxing', 'br', 'forge', 'muse', 'orc']) {
    const vf = VOICE_FUNDAMENTALS[agentId];
    const health = agentHealth?.[agentId] || {};

    const driftScore = senses[agentId]?.drift_score || 0;
    const wasteScore = senses[agentId]?.waste_score || 0;

    voices.push({
      id: agentId,
      layer: 'agent',
      fundamental: vf.freq,
      register: vf.register,
      amplitude: Math.min(1, (health.score || 5) / 10),
      waveform: GRADE_TO_WAVEFORM[health.stewardGrade] || 'triangle',
      detuning_cents: driftScore * 50,
      jitter: wasteScore * 0.3,
      intelligenceClass: health.intelligenceClass || 'STRUCTURED',
      source: {
        score: health.score,
        grade: health.stewardGrade,
        intel: health.intelligenceClass,
        drift: driftScore,
        waste: wasteScore
      }
    });
  }

  return voices;
}

// ── Extract Layer 2: Emergence Sense Voices ─────────────────────────────────

function extractEmergenceVoices() {
  const monitor = loadJSON(path.join(CATH, 'emergence', 'monitor-state.json'));
  if (!monitor || !monitor.senses_summary) return [];

  const voices = [];
  for (const [sense, data] of Object.entries(monitor.senses_summary)) {
    const vf = VOICE_FUNDAMENTALS[sense];
    if (!vf) continue;

    const status = data.status || 'dead';
    const mirrorVoice = data.mirror_voice || '';

    // Extract numeric signals from mirror_voice where possible
    let intensity = 0.5;
    const pctMatch = mirrorVoice.match(/(\d+\.?\d*)%/);
    if (pctMatch) intensity = parseFloat(pctMatch[1]) / 100;

    const countMatch = mirrorVoice.match(/(\d+)\s+(unresolved|waste|active|pending)/i);
    const issueCount = countMatch ? parseInt(countMatch[1]) : 0;

    voices.push({
      id: sense,
      layer: 'emergence',
      fundamental: vf.freq,
      register: vf.register,
      amplitude: STATUS_TO_AMPLITUDE[status] || 0.5,
      waveform: STATUS_TO_WAVEFORM[status] || 'triangle',
      detuning_cents: issueCount * 5,  // more issues = more detuned
      jitter: status === 'alert' ? 0.15 : status === 'warning' ? 0.25 : 0.05,
      status,
      issueCount,
      source: {
        status,
        mirrorExcerpt: mirrorVoice.slice(0, 120)
      }
    });
  }

  return voices;
}

// ── Extract Layer 3: Stress Battery Voices ──────────────────────────────────

function extractStressVoices() {
  const battery = loadJSON(path.join(NANO, 'stress-battery-state.json'));
  if (!battery || !battery.history) return [];

  const latest = battery.history.slice(-1)[0];
  if (!latest) return [];

  const voices = [];
  for (const chamber of ['compression', 'contradiction', 'identity']) {
    const vf = VOICE_FUNDAMENTALS[chamber];
    const score = latest[chamber] || 0;

    // Chamber score: 0 = failed, higher = more resilient
    // Map: 0 = silence (failed), 1-3 = weak, 4-7 = moderate, 8-10 = strong
    const amplitude = Math.min(1, score / 10);
    const waveform = score === 0 ? 'noise' : score < 4 ? 'square' : score < 7 ? 'sawtooth' : 'sine';

    voices.push({
      id: chamber,
      layer: 'stress',
      fundamental: vf.freq,
      register: vf.register,
      amplitude,
      waveform,
      detuning_cents: score === 0 ? 25 : (10 - score) * 3,
      jitter: score === 0 ? 0.4 : 0.1,
      chamberScore: score,
      source: {
        score,
        overall: latest.overall,
        testNumber: latest.testNumber,
        date: latest.date
      }
    });
  }

  return voices;
}

// ── Extract Layer 4: System Drone Voices ────────────────────────────────────

function extractSystemVoices() {
  const voices = [];

  // Heartbeat — based on emergence monitor overall score
  const monitor = loadJSON(path.join(CATH, 'emergence', 'monitor-state.json'));
  const emergenceScore = monitor?.score || 0;

  voices.push({
    id: 'heartbeat',
    layer: 'system',
    fundamental: VOICE_FUNDAMENTALS.heartbeat.freq,
    register: 'infra',
    amplitude: emergenceScore / 100,
    waveform: emergenceScore > 80 ? 'sine' : emergenceScore > 50 ? 'triangle' : 'square',
    detuning_cents: (100 - emergenceScore) * 0.5,
    jitter: 0.02,
    source: { emergenceScore }
  });

  // Synapse — based on latest pulse coherence (check if pulse produced output)
  const pulsesDir = path.join(NANO, 'compound', 'pulses');
  let pulseRecency = 0;
  try {
    const pulses = fs.readdirSync(pulsesDir).filter(f => f.endsWith('.md')).sort();
    if (pulses.length > 0) {
      const latest = pulses.slice(-1)[0];
      const dateMatch = latest.match(/pulse-(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        const pulseDate = new Date(dateMatch[1]);
        const now = new Date();
        const hoursAgo = (now - pulseDate) / (1000 * 60 * 60);
        pulseRecency = Math.max(0, 1 - hoursAgo / 24); // 1 = just fired, 0 = 24h+ ago
      }
    }
  } catch {}

  voices.push({
    id: 'synapse',
    layer: 'system',
    fundamental: VOICE_FUNDAMENTALS.synapse.freq,
    register: 'infra',
    amplitude: pulseRecency,
    waveform: pulseRecency > 0.5 ? 'sine' : 'triangle',
    detuning_cents: (1 - pulseRecency) * 10,
    jitter: 0.01,
    source: { pulseRecency: Math.round(pulseRecency * 100) / 100 }
  });

  return voices;
}

// ── Composite Field Calculation ─────────────────────────────────────────────

function calculateCompositeField(voices) {
  if (voices.length === 0) return null;

  // Per-layer statistics
  const layers = {};
  for (const v of voices) {
    if (!layers[v.layer]) layers[v.layer] = [];
    layers[v.layer].push(v);
  }

  const layerStats = {};
  for (const [layer, lvs] of Object.entries(layers)) {
    const avgAmp = lvs.reduce((s, v) => s + v.amplitude, 0) / lvs.length;
    const avgDetune = lvs.reduce((s, v) => s + v.detuning_cents, 0) / lvs.length;
    const avgJitter = lvs.reduce((s, v) => s + v.jitter, 0) / lvs.length;

    const waveforms = {};
    for (const v of lvs) waveforms[v.waveform] = (waveforms[v.waveform] || 0) + 1;
    const dominantWaveform = Object.entries(waveforms).sort((a, b) => b[1] - a[1])[0][0];

    layerStats[layer] = {
      voiceCount: lvs.length,
      avgAmplitude: Math.round(avgAmp * 1000) / 1000,
      avgDetuning: Math.round(avgDetune * 100) / 100,
      avgJitter: Math.round(avgJitter * 1000) / 1000,
      dominantWaveform
    };
  }

  // Pairwise beat frequencies (all voices, not just agents)
  const beats = [];
  for (let i = 0; i < voices.length; i++) {
    for (let j = i + 1; j < voices.length; j++) {
      const beatFreq = Math.abs(voices[i].fundamental - voices[j].fundamental);
      const crossLayer = voices[i].layer !== voices[j].layer;
      beats.push({
        pair: `${voices[i].id}-${voices[j].id}`,
        beatFreq: Math.round(beatFreq * 100) / 100,
        crossLayer,
        layers: `${voices[i].layer}↔${voices[j].layer}`,
        combinedAmplitude: Math.round(voices[i].amplitude * voices[j].amplitude * 1000) / 1000
      });
    }
  }

  // Sort by combined amplitude (strongest interactions first)
  beats.sort((a, b) => b.combinedAmplitude - a.combinedAmplitude);

  // Overall coherence: how in-tune is everything?
  const totalDetuning = voices.reduce((s, v) => s + Math.abs(v.detuning_cents), 0);
  const maxDetuning = voices.length * 50; // worst case
  const coherence = Math.round((1 - totalDetuning / maxDetuning) * 1000) / 1000;

  // Overall energy: how loud is everything?
  const totalEnergy = voices.reduce((s, v) => s + v.amplitude, 0) / voices.length;

  // Dissonance: how much jitter + detuning across the system?
  const totalJitter = voices.reduce((s, v) => s + v.jitter, 0) / voices.length;
  const dissonance = Math.round((totalJitter + totalDetuning / maxDetuning) / 2 * 1000) / 1000;

  // Cross-layer beat energy (the interesting part — how do different systems interact?)
  const crossBeats = beats.filter(b => b.crossLayer);
  const crossBeatEnergy = crossBeats.length > 0
    ? Math.round(crossBeats.reduce((s, b) => s + b.combinedAmplitude, 0) / crossBeats.length * 1000) / 1000
    : 0;

  return {
    totalVoices: voices.length,
    layerStats,
    coherence,
    totalEnergy: Math.round(totalEnergy * 1000) / 1000,
    dissonance,
    crossBeatEnergy,
    strongestBeats: beats.slice(0, 15),
    crossLayerBeats: crossBeats.slice(0, 10)
  };
}

// ── Stress Battery Overall → System Chord ───────────────────────────────────

function getSystemChord() {
  const battery = loadJSON(path.join(NANO, 'stress-battery-state.json'));
  if (!battery?.history?.length) return { quality: 'unknown', intervals: [0, 4, 7] };

  const latest = battery.history.slice(-1)[0];
  const overall = latest.overall || 'STABLE';
  const chord = STRESS_TO_CHORD[overall] || 'sus4';

  const intervals = {
    'major': [0, 4, 7],
    'sus4': [0, 5, 7],
    'diminished': [0, 3, 6],
    'cluster': [0, 1, 2]
  };

  return { quality: chord, overall, intervals: intervals[chord] };
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Cathedral Voice Registry ===\n');

  const agentVoices = extractAgentVoices();
  console.log(`Layer 1 — Agent voices: ${agentVoices.length}`);
  for (const v of agentVoices) {
    console.log(`  ${v.id}: ${v.fundamental}Hz amp=${v.amplitude} ${v.waveform} detune=${v.detuning_cents}¢ [${v.intelligenceClass}]`);
  }

  const emergenceVoices = extractEmergenceVoices();
  console.log(`\nLayer 2 — Emergence senses: ${emergenceVoices.length}`);
  for (const v of emergenceVoices) {
    console.log(`  ${v.id}: ${v.fundamental}Hz amp=${v.amplitude} ${v.waveform} [${v.status}] issues=${v.issueCount}`);
  }

  const stressVoices = extractStressVoices();
  console.log(`\nLayer 3 — Stress chambers: ${stressVoices.length}`);
  for (const v of stressVoices) {
    console.log(`  ${v.id}: ${v.fundamental}Hz amp=${v.amplitude} ${v.waveform} score=${v.chamberScore}`);
  }

  const systemVoices = extractSystemVoices();
  console.log(`\nLayer 4 — System drones: ${systemVoices.length}`);
  for (const v of systemVoices) {
    console.log(`  ${v.id}: ${v.fundamental}Hz amp=${v.amplitude} ${v.waveform}`);
  }

  const allVoices = [...agentVoices, ...emergenceVoices, ...stressVoices, ...systemVoices];
  console.log(`\nTotal voices: ${allVoices.length}`);

  const chord = getSystemChord();
  console.log(`\nSystem chord: ${chord.quality} (${chord.overall}) intervals=[${chord.intervals}]`);

  console.log('\n── Composite Field ──');
  const composite = calculateCompositeField(allVoices);
  console.log(`Coherence: ${composite.coherence}`);
  console.log(`Energy: ${composite.totalEnergy}`);
  console.log(`Dissonance: ${composite.dissonance}`);
  console.log(`Cross-layer beat energy: ${composite.crossBeatEnergy}`);

  console.log('\nLayer breakdown:');
  for (const [layer, stats] of Object.entries(composite.layerStats)) {
    console.log(`  ${layer}: ${stats.voiceCount} voices, amp=${stats.avgAmplitude}, detune=${stats.avgDetuning}¢, ${stats.dominantWaveform}`);
  }

  console.log('\nStrongest beats (top 10):');
  for (const b of composite.strongestBeats.slice(0, 10)) {
    const cross = b.crossLayer ? ` ★ cross-layer (${b.layers})` : '';
    console.log(`  ${b.pair}: ${b.beatFreq}Hz energy=${b.combinedAmplitude}${cross}`);
  }

  console.log('\nCross-layer beats (top 5):');
  for (const b of composite.crossLayerBeats.slice(0, 5)) {
    console.log(`  ${b.pair}: ${b.beatFreq}Hz energy=${b.combinedAmplitude} (${b.layers})`);
  }

  // Write output
  const output = {
    version: 'v1',
    generated: new Date().toISOString(),
    description: 'Cathedral Voice Registry — all monitoring systems mapped to harmonic voices',
    systemChord: chord,
    voices: allVoices,
    composite,
    voiceMap: Object.fromEntries(
      Object.entries(VOICE_FUNDAMENTALS).map(([k, v]) => [k, { ...v, id: k }])
    )
  };

  fs.writeFileSync(OUT, JSON.stringify(output, null, 2));
  console.log(`\nVoice registry written to ${OUT}`);
}

main();
