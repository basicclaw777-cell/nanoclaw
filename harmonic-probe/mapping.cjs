'use strict';

// Harmonic Parameter Mapping — State → Sound
// Hard rule: every parameter has exactly ONE documented source field.

const VOICES = {
  boxing:  { fundamental: 220.0,  ratio: '1:1',   note: 'A3'  },
  br:      { fundamental: 275.0,  ratio: '5:4',   note: 'C#4' },
  orc:     { fundamental: 330.0,  ratio: '3:2',   note: 'E4'  },
  forge:   { fundamental: 412.5,  ratio: '15:8',  note: 'G#4' },
  muse:    { fundamental: 440.0,  ratio: '2:1',   note: 'A4'  },
};

const GRADE_HARMONICS = { A: 12, B: 8, C: 5, D: 3, F: 1 };
const STABILITY_MAP   = { ROBUST: 1.0, STABLE: 0.7, FRAGILE: 0.4 };

const BOTTLENECK_AM = {
  FEAR:            { type: 'irregular', rate: 3.5, depth: 0.6 },
  'NO TRIGGER':    { type: 'flat',      rate: 0.5, depth: 0.3 },
  'INPUT OVERLOAD':{ type: 'fast',      rate: 8.0, depth: 0.5 },
  CONFUSION:       { type: 'random',    rate: 5.0, depth: 0.7 },
  DEPENDENCY:      { type: 'gated',     rate: 1.0, depth: 0.8 },
  WOUND:           { type: 'decay',     rate: 0.3, depth: 0.9 },
};

const STATUS_INTERVAL = { healthy: 0, active: 0, alert: 0, stale: 1, dead: 6 };

function mapAgent(agentId, snapshot) {
  const voice = VOICES[agentId];
  if (!voice) return null;

  const health   = snapshot.agentHealth  || {};
  const bottle   = snapshot.bottleneck   || {};
  const emerge   = snapshot.emergence    || {};
  const phySense = snapshot.physicianSenses || {};

  const score           = health.score ?? 5;
  const grade           = health.stewardGrade || 'C';
  const intel           = health.intelligenceClass || 'STRUCTURED';
  const bottleneckType  = bottle.type || null;

  const drift     = (phySense.proprioception || {}).drift_score || 0;
  const waste     = (phySense.smell || {}).waste_score || 0;

  const detuningCents = drift * 100;
  const detuningRatio = Math.pow(2, detuningCents / 1200);
  const frequency     = voice.fundamental * detuningRatio;

  const amplitude     = Math.max(0.05, score / 10);
  const harmonicCount = GRADE_HARMONICS[grade] || GRADE_HARMONICS.C;
  const waveform      = intel === 'SYNTHETIC' ? 'triangle' : 'sawtooth';

  let am = { type: 'none', rate: 0, depth: 0 };
  if (bottleneckType && BOTTLENECK_AM[bottleneckType]) {
    am = { ...BOTTLENECK_AM[bottleneckType] };
  }

  const emergenceRate = emerge.recentEventCount || 0;
  const transientEnergy = Math.min(1.0, emergenceRate / 5);

  return {
    agentId,
    frequency,
    detuningCents,
    amplitude,
    waveform,
    harmonicCount,
    am,
    noiseFloor: waste * 0.3,
    transientEnergy,
    systemStability: snapshot.systemStability || 0.4,
  };
}

function generateVoiceSamples(params, sampleRate, numSamples) {
  const out = new Float64Array(numSamples);
  const { frequency, amplitude, harmonicCount, waveform, am, noiseFloor, transientEnergy } = params;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;

    for (let h = 1; h <= harmonicCount; h++) {
      const hFreq = frequency * h;
      let hAmp;
      if (waveform === 'sawtooth') {
        hAmp = amplitude / h;
      } else {
        hAmp = (h % 2 === 1) ? amplitude * (8 / (Math.PI * Math.PI * h * h)) : 0;
      }
      if (hAmp > 0) {
        sample += hAmp * Math.sin(2 * Math.PI * hFreq * t);
      }
    }

    if (am.type !== 'none' && am.depth > 0) {
      let modulator;
      switch (am.type) {
        case 'irregular':
          modulator = 1 - am.depth * (0.5 + 0.5 * Math.sin(2 * Math.PI * am.rate * t + Math.sin(7.1 * t)));
          break;
        case 'flat':
          modulator = 1 - am.depth * 0.5;
          break;
        case 'fast':
          modulator = 1 - am.depth * (0.5 + 0.5 * Math.sin(2 * Math.PI * am.rate * t));
          break;
        case 'random':
          modulator = 1 - am.depth * (0.5 + 0.5 * Math.sin(2 * Math.PI * am.rate * t * (1 + 0.3 * Math.sin(13.7 * t))));
          break;
        case 'gated':
          modulator = Math.sin(2 * Math.PI * am.rate * t) > 0 ? 1 : 1 - am.depth;
          break;
        case 'decay':
          modulator = Math.exp(-am.depth * (t % (1 / am.rate)) * am.rate);
          break;
        default:
          modulator = 1;
      }
      sample *= modulator;
    }

    if (noiseFloor > 0) {
      sample += noiseFloor * (Math.random() * 2 - 1);
    }

    if (transientEnergy > 0) {
      sample += transientEnergy * 0.2 * Math.sin(2 * Math.PI * frequency * 3 * t) * Math.exp(-5 * (t % 0.2) * 5);
    }

    out[i] = sample;
  }

  return out;
}

function combinedSignal(voiceParamsArray, sampleRate, numSamples) {
  const combined = new Float64Array(numSamples);
  const voices = [];
  for (const params of voiceParamsArray) {
    const v = generateVoiceSamples(params, sampleRate, numSamples);
    voices.push(v);
    for (let i = 0; i < numSamples; i++) combined[i] += v[i];
  }
  const peak = Math.max(...combined.map(Math.abs));
  if (peak > 0) for (let i = 0; i < numSamples; i++) combined[i] /= peak;
  return { combined, voices };
}

function senseHealthChord(senses) {
  let healthy = 0, stale = 0, dead = 0;
  for (const s of Object.values(senses)) {
    const st = s.status || 'healthy';
    if (st === 'dead') dead++;
    else if (st === 'stale') stale++;
    else healthy++;
  }
  return { healthy, stale, dead, total: healthy + stale + dead };
}

module.exports = { VOICES, mapAgent, generateVoiceSamples, combinedSignal, senseHealthChord, STABILITY_MAP, GRADE_HARMONICS };
