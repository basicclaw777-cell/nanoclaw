'use strict';

// Harmonic Agent State — V1 Mapping Engine
// GPT hard rule: every harmonic parameter has exactly one documented source field.
// Relay convergence: drift→detuning, identity→fundamental, health→coherence, relationships→interference.

// ── Agent fundamentals (fixed per agent, identity = pitch) ──
// Each agent gets a unique base frequency in Hz. Chosen to form a
// pentatonic-ish spacing so consonance = natural state, drift = audible.
const AGENT_FUNDAMENTALS = {
  boxing:  220.0,   // A3
  br:      261.63,  // C4
  muse:    293.66,  // D4
  orc:     329.63,  // E4
  forge:   392.0    // G4
};

// ── Mapping registry (the falsification gate) ──
// Format: { harmonicParam, sourceField, transform, unit, rationale }
const MAPPING_REGISTRY = [
  {
    harmonicParam: 'fundamental',
    sourceField: 'AGENT_FUNDAMENTALS[agentId]',
    transform: 'fixed lookup',
    unit: 'Hz',
    rationale: 'Identity = fixed pitch. Agent identity does not change; detuning from this = drift.'
  },
  {
    harmonicParam: 'detuning_cents',
    sourceField: 'physician.proprioception.drift_score',
    transform: 'drift_score * 50',
    unit: 'cents',
    rationale: 'drift_score 0→1 maps to 0→50 cents sharp. >25 cents = audibly out of tune.'
  },
  {
    harmonicParam: 'amplitude',
    sourceField: 'agentHealth[agent].score',
    transform: 'score / 10',
    unit: '0-1 linear',
    rationale: 'Health score 0-10 → amplitude 0-1. Dead agent = silent.'
  },
  {
    harmonicParam: 'waveform',
    sourceField: 'agentHealth[agent].stewardGrade',
    transform: 'A→sine, B→triangle, C→sawtooth, D→square, F→noise',
    unit: 'waveform type',
    rationale: 'Grade = harmonic purity. A=pure tone, F=inharmonic noise. Degraded stewardship adds harsh partials.'
  },
  {
    harmonicParam: 'harmonic_richness',
    sourceField: 'emergence[agent].tier',
    transform: '1 + (tier - 1) * 0.5',
    unit: 'harmonic count multiplier',
    rationale: 'Higher emergence tier = richer harmonic series. Tier 1 = fundamental only. Tier 5 = 3 harmonics.'
  },
  {
    harmonicParam: 'amplitude_jitter',
    sourceField: 'physician.smell.waste_score',
    transform: 'waste_score * 0.3',
    unit: 'jitter amplitude',
    rationale: 'Waste/bloat → unstable signal. waste_score 0→1 maps to 0→30% amplitude modulation noise.'
  },
  {
    harmonicParam: 'bottleneck_interval',
    sourceField: 'bottlenecks[agent].type',
    transform: 'FEAR→tritone(+6st), NO_TRIGGER→min2nd(+1st), INPUT_OVERLOAD→maj7th(+11st), WOUND→dim5th(+6st)',
    unit: 'semitones from fundamental',
    rationale: 'Bottleneck adds a dissonant partial at a specific interval. Type determines the interval character.'
  },
  {
    harmonicParam: 'system_chord',
    sourceField: 'stressBattery.overall',
    transform: 'ROBUST→[0,4,7](major), STABLE→[0,5,7](sus4), FRAGILE→[0,3,6](diminished)',
    unit: 'semitone intervals',
    rationale: 'System-wide stress = chord quality backdrop. FRAGILE=diminished=maximum tension.'
  },
  {
    harmonicParam: 'compression_mod',
    sourceField: 'stressBattery.compression',
    transform: '(100 - compression) / 100 → low-frequency tremolo depth',
    unit: '0-1 tremolo depth',
    rationale: 'Low compression = system cannot recover knowledge → tremolo (shaky signal). 0=stable, 1=maximum wobble.'
  },
  {
    harmonicParam: 'identity_detune',
    sourceField: 'stressBattery.identity',
    transform: '(1 - identity) * 100',
    unit: 'cents',
    rationale: 'Identity similarity 1→0 maps to 0→100 cents system-wide detuning. identity=0 on Oct 17 = massive drift.'
  }
];

// ── Bottleneck → dissonant interval (semitones) ──
const BOTTLENECK_INTERVALS = {
  'FEAR': 6,            // tritone — maximum dissonance
  'NO TRIGGER': 1,      // minor 2nd — grating proximity
  'INPUT OVERLOAD': 11, // major 7th — tension
  'WOUND': 6,           // diminished 5th
  'DEPENDENCY': 10      // minor 7th
};

// ── Steward grade → waveform type ──
const GRADE_WAVEFORMS = {
  'A': 'sine',
  'B': 'triangle',
  'C': 'sawtooth',
  'D': 'square',
  'F': 'noise'
};

// ── Stress battery → chord intervals ──
const STRESS_CHORDS = {
  'ROBUST': [0, 4, 7],      // major triad
  'STABLE': [0, 5, 7],      // sus4
  'FRAGILE': [0, 3, 6]      // diminished
};

// ── Core mapping function ──
// Takes a single snapshot of state and returns harmonic parameters per agent
function mapStateToHarmonics(snapshot) {
  const { physician, agentHealth, emergence, bottlenecks, stressBattery } = snapshot;

  // System-level parameters (from physician + stress battery)
  const proprioception = physician?.senses?.proprioception || {};
  const smell = physician?.senses?.smell || {};
  const battery = stressBattery || {};

  const systemParams = {
    drift_score: proprioception.drift_score ?? 0,
    drift_status: proprioception.drift_status ?? 'aligned',
    waste_score: smell.waste_score ?? 0,
    stress_overall: battery.overall ?? 'STABLE',
    stress_compression: battery.compression ?? 100,
    stress_identity: battery.identity ?? 1,
    system_chord: STRESS_CHORDS[battery.overall] || STRESS_CHORDS['STABLE'],
    identity_detune_cents: ((1 - (battery.identity ?? 1)) * 100)
  };

  // Per-agent harmonic parameters
  const agents = {};
  for (const [agentId, fundamental] of Object.entries(AGENT_FUNDAMENTALS)) {
    const health = agentHealth?.[agentId] || {};
    const emerg = emergence?.[agentId] || {};
    const bottleneck = bottlenecks?.[agentId];

    // Detuned frequency = fundamental shifted by drift + identity drift
    const driftCents = (systemParams.drift_score * 50) + systemParams.identity_detune_cents;
    const detunedHz = fundamental * Math.pow(2, driftCents / 1200);

    // Amplitude from health score
    const amplitude = Math.max(0.05, (health.score || 0) / 10);

    // Waveform from steward grade
    const waveform = GRADE_WAVEFORMS[health.stewardGrade] || 'sawtooth';

    // Harmonic richness from emergence tier
    const harmonicCount = 1 + ((emerg.tier || 1) - 1) * 0.5;

    // Amplitude jitter from waste
    const jitter = systemParams.waste_score * 0.3;

    // Bottleneck dissonant partial
    let bottleneckPartial = null;
    if (bottleneck) {
      const interval = BOTTLENECK_INTERVALS[bottleneck.type] || 6;
      bottleneckPartial = {
        type: bottleneck.type,
        interval,
        hz: fundamental * Math.pow(2, interval / 12),
        amplitude: 0.3
      };
    }

    // Compression tremolo
    const tremoloDepth = (100 - systemParams.stress_compression) / 100;
    const tremoloRate = 4; // Hz — slow wobble

    agents[agentId] = {
      fundamental,
      detunedHz,
      driftCents,
      amplitude,
      waveform,
      harmonicCount,
      jitter,
      bottleneckPartial,
      tremoloDepth,
      tremoloRate,
      stewardGrade: health.stewardGrade || '?',
      intelligenceClass: health.intelligenceClass || 'STRUCTURED',
      emergenceTier: emerg.tier || 1,
      emergenceLevel: emerg.level || 1
    };
  }

  return { system: systemParams, agents, timestamp: snapshot.date };
}

// ── Pairwise coherence ──
// Measure harmonic consonance between two agents
function pairwiseCoherence(a, b) {
  const ratio = Math.max(a.detunedHz, b.detunedHz) / Math.min(a.detunedHz, b.detunedHz);

  // Simple consonance: how close is the ratio to a simple fraction?
  const CONSONANT_RATIOS = [1, 1.5, 1.333, 1.25, 1.2, 1.667, 2];
  let minDistance = Infinity;
  let closestRatio = 1;
  for (const cr of CONSONANT_RATIOS) {
    const d = Math.abs(ratio - cr);
    if (d < minDistance) {
      minDistance = d;
      closestRatio = cr;
    }
  }

  // Coherence = 1 when perfectly consonant, 0 when maximally dissonant
  const coherence = Math.max(0, 1 - minDistance * 5);

  // Beat frequency = difference between the two frequencies
  const beatHz = Math.abs(a.detunedHz - b.detunedHz);

  // Waveform compatibility
  const waveformMatch = a.waveform === b.waveform ? 1.0 :
    (a.waveform === 'sine' || b.waveform === 'sine') ? 0.7 : 0.4;

  return {
    agents: [a.agentId || '?', b.agentId || '?'],
    ratio: Math.round(ratio * 1000) / 1000,
    closestConsonance: closestRatio,
    coherence: Math.round(coherence * 1000) / 1000,
    beatHz: Math.round(beatHz * 100) / 100,
    waveformMatch
  };
}

// ── Composite harmonic field ──
// All agents together: what does the ensemble sound like?
function compositeField(agentParams) {
  const agents = Object.entries(agentParams);
  const pairs = [];
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const [idA, a] = agents[i];
      const [idB, b] = agents[j];
      pairs.push(pairwiseCoherence(
        { ...a, agentId: idA },
        { ...b, agentId: idB }
      ));
    }
  }

  const avgCoherence = pairs.reduce((s, p) => s + p.coherence, 0) / (pairs.length || 1);
  const maxBeat = Math.max(...pairs.map(p => p.beatHz));
  const minCoherence = Math.min(...pairs.map(p => p.coherence));

  // Dissonance index: combination of low coherence + high beating + bottleneck count
  const bottleneckCount = agents.filter(([, a]) => a.bottleneckPartial).length;
  const dissonanceIndex = (1 - avgCoherence) * 0.4 +
    Math.min(1, maxBeat / 50) * 0.3 +
    (bottleneckCount / agents.length) * 0.3;

  return {
    avgCoherence: Math.round(avgCoherence * 1000) / 1000,
    minCoherence: Math.round(minCoherence * 1000) / 1000,
    maxBeatHz: Math.round(maxBeat * 100) / 100,
    bottleneckCount,
    dissonanceIndex: Math.round(dissonanceIndex * 1000) / 1000,
    pairs
  };
}

module.exports = {
  AGENT_FUNDAMENTALS,
  MAPPING_REGISTRY,
  BOTTLENECK_INTERVALS,
  GRADE_WAVEFORMS,
  STRESS_CHORDS,
  mapStateToHarmonics,
  pairwiseCoherence,
  compositeField
};
