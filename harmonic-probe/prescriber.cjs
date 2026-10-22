#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const HOME = process.env.HOME;
const CATH = path.join(HOME, 'Cathedral');
const TELEMETRY = path.join(__dirname, 'telemetry.json');
const OUT  = path.join(__dirname, 'prescription.json');

// ── Reverse Mapping Tables ──────────────────────────────────────────────────
// Forward: state → harmonics. Reverse: harmonics → state targets.

const BOTTLENECK_FROM_TENSION = [
  { tension: 0.0,  bottleneck: 'NONE',           interval: 'major' },
  { tension: 0.4,  bottleneck: 'DEPENDENCY',      interval: 'minor' },
  { tension: 0.5,  bottleneck: 'NO TRIGGER',      interval: 'suspended' },
  { tension: 0.7,  bottleneck: 'INPUT OVERLOAD',  interval: 'augmented' },
  { tension: 0.8,  bottleneck: 'CONFUSION',        interval: 'chromatic' },
  { tension: 0.9,  bottleneck: 'FEAR',             interval: 'diminished' },
  { tension: 0.95, bottleneck: 'WOUND',            interval: 'tritone' },
];

const GRADE_FROM_AMPLITUDE = [
  { min: 0.9, grade: 'A' },
  { min: 0.7, grade: 'B' },
  { min: 0.5, grade: 'C' },
  { min: 0.3, grade: 'D' },
  { min: 0.0, grade: 'F' },
];

const INTELLIGENCE_FROM_WAVEFORM = {
  sine:     'STRUCTURED',
  sawtooth: 'SYNTHETIC',
};

const PROBE_AGENTS = {
  boxing: { fundamental: 220 },
  br:     { fundamental: 275 },
  forge:  { fundamental: 330 },
  muse:   { fundamental: 352 },
  orc:    { fundamental: 440 },
};

// ── Load Current State ──────────────────────────────────────────────────────

function loadCurrentState() {
  const agentHealth = JSON.parse(fs.readFileSync(path.join(CATH, 'agents', 'agent-health.json'), 'utf8'));
  const bottlenecks = JSON.parse(fs.readFileSync(path.join(CATH, 'agents', 'bottleneck-state.json'), 'utf8'));
  const bnData = bottlenecks.bottlenecks || bottlenecks;

  const physicianRaw = JSON.parse(fs.readFileSync(path.join(CATH, 'physician-state.json'), 'utf8'));
  const latest = (physicianRaw.history || []).sort((a, b) => b.date.localeCompare(a.date))[0] || null;

  const current = {};
  for (const agentId of Object.keys(PROBE_AGENTS)) {
    const health = agentHealth[agentId] || {};
    const bn = bnData[agentId];

    let driftScore = 0.3;
    if (latest && latest.diagnoses) {
      const prop = latest.diagnoses.find(d => d.sense === 'proprioception');
      if (prop) {
        driftScore = prop.drift_score !== undefined ? prop.drift_score :
          prop.status === 'healthy' ? 0.1 : prop.status === 'stale' ? 0.5 : 0.3;
      }
    }

    current[agentId] = {
      healthScore: health.score || 5,
      stewardGrade: health.stewardGrade || 'C',
      bottleneck: bn ? bn.bottleneck : 'NONE',
      intelligenceClass: health.intelligenceClass || 'STRUCTURED',
      driftScore,
    };
  }
  return current;
}

// ── Reverse Voice → State Targets ───────────────────────────────────────────

function reverseVoice(voice) {
  const fundamental = PROBE_AGENTS[voice.agentId].fundamental;

  // detuning → drift_score: detuning = drift * fundamental * 0.05
  const targetDrift = voice.detuning / (fundamental * 0.05);

  // coherence → health_score: coherence = score / 10
  const targetHealthScore = Math.round(voice.coherence * 10 * 10) / 10;

  // intervalTension → bottleneck: nearest match
  const sorted = [...BOTTLENECK_FROM_TENSION].sort(
    (a, b) => Math.abs(a.tension - voice.intervalTension) - Math.abs(b.tension - voice.intervalTension)
  );
  const targetBottleneck = sorted[0].bottleneck;

  // amplitude → steward_grade: nearest match
  const baseAmplitude = voice.amplitude;
  const targetGrade = GRADE_FROM_AMPLITUDE.find(g => baseAmplitude >= g.min)?.grade || 'F';

  // waveform → intelligence class
  const targetIntelligence = INTELLIGENCE_FROM_WAVEFORM[voice.waveform] || 'STRUCTURED';

  return {
    agentId: voice.agentId,
    targetDrift: Math.round(targetDrift * 1000) / 1000,
    targetHealthScore,
    targetBottleneck,
    targetGrade,
    targetIntelligence,
    targetCoherence: voice.coherence,
    targetAmplitude: voice.amplitude,
    targetDetuning: voice.detuning,
    targetInterval: voice.interval,
    targetTension: voice.intervalTension,
  };
}

// ── Gap Analysis ────────────────────────────────────────────────────────────

function computeGap(target, current) {
  const deltas = [];

  if (target.targetBottleneck !== current.bottleneck) {
    deltas.push({
      param: 'bottleneck',
      current: current.bottleneck,
      target: target.targetBottleneck,
      impact: 'high',
      action: `Shift bottleneck from ${current.bottleneck} to ${target.targetBottleneck}`,
    });
  }

  if (target.targetIntelligence !== current.intelligenceClass) {
    deltas.push({
      param: 'intelligenceClass',
      current: current.intelligenceClass,
      target: target.targetIntelligence,
      impact: 'high',
      action: `Shift intelligence from ${current.intelligenceClass} to ${target.targetIntelligence}`,
    });
  }

  const healthDelta = target.targetHealthScore - current.healthScore;
  if (Math.abs(healthDelta) > 0.5) {
    deltas.push({
      param: 'healthScore',
      current: current.healthScore,
      target: target.targetHealthScore,
      delta: Math.round(healthDelta * 10) / 10,
      impact: Math.abs(healthDelta) > 2 ? 'high' : 'medium',
      action: `${healthDelta > 0 ? 'Raise' : 'Lower'} health score by ${Math.abs(healthDelta).toFixed(1)}`,
    });
  }

  if (target.targetGrade !== current.stewardGrade) {
    deltas.push({
      param: 'stewardGrade',
      current: current.stewardGrade,
      target: target.targetGrade,
      impact: 'medium',
      action: `Shift steward grade from ${current.stewardGrade} to ${target.targetGrade}`,
    });
  }

  const driftDelta = target.targetDrift - current.driftScore;
  if (Math.abs(driftDelta) > 0.05) {
    deltas.push({
      param: 'driftScore',
      current: current.driftScore,
      target: target.targetDrift,
      delta: Math.round(driftDelta * 1000) / 1000,
      impact: Math.abs(driftDelta) > 0.3 ? 'high' : 'low',
      action: `${driftDelta > 0 ? 'Allow' : 'Reduce'} drift by ${Math.abs(driftDelta).toFixed(3)}`,
    });
  }

  return {
    agentId: target.agentId,
    deltas,
    aligned: deltas.length === 0,
    gapScore: deltas.reduce((s, d) => s + (d.impact === 'high' ? 3 : d.impact === 'medium' ? 2 : 1), 0),
  };
}

// ── Listener Feature Comparison ─────────────────────────────────────────────

function compareFeatures(targetFeatures, referenceFeatures) {
  const features = ['detuning', 'harmonicity', 'phaseVariance', 'pairCoherence', 'beatEnergy', 'spectralEntropy'];
  const comparison = {};

  for (const f of features) {
    const target = targetFeatures[f];
    const reference = referenceFeatures[f];
    comparison[f] = {
      target,
      reference,
      delta: Math.round((target - reference) * 1000) / 1000,
      direction: target > reference ? 'higher' : target < reference ? 'lower' : 'same',
    };
  }

  return comparison;
}

// ── Named Fingerprints ──────────────────────────────────────────────────────

function findNamedFingerprints(telemetry) {
  const slots = telemetry.telemetry;
  const named = {};

  // Best sync (lowest beat energy)
  let bestSync = { idx: 0, beat: Infinity };
  // Worst disruption (highest beat energy)
  let worstDisruption = { idx: 0, beat: -Infinity };
  // Baseline (first slot)
  named.baseline = { slot: 0, label: 'Baseline (Oct 15 00:00)', features: slots[0].features };

  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s.features.beatEnergy < bestSync.beat) {
      bestSync = { idx: i, beat: s.features.beatEnergy };
    }
    if (s.features.beatEnergy > worstDisruption.beat) {
      worstDisruption = { idx: i, beat: s.features.beatEnergy };
    }
  }

  named.deepSync = {
    slot: bestSync.idx,
    label: `Deep Sync (${slots[bestSync.idx].timestamp.slice(0,16)})`,
    features: slots[bestSync.idx].features,
  };

  named.peakDisruption = {
    slot: worstDisruption.idx,
    label: `Peak Disruption (${slots[worstDisruption.idx].timestamp.slice(0,16)})`,
    features: slots[worstDisruption.idx].features,
  };

  // Average of non-anomaly slots = "healthy normal"
  const normalSlots = slots.filter(s => !s.anomalies || s.anomalies.length === 0);
  if (normalSlots.length > 0) {
    const avgFeatures = {};
    for (const f of Object.keys(normalSlots[0].features)) {
      avgFeatures[f] = Math.round(
        (normalSlots.reduce((s, sl) => s + sl.features[f], 0) / normalSlots.length) * 1000
      ) / 1000;
    }
    named.healthyNormal = {
      slot: null,
      label: `Healthy Normal (avg of ${normalSlots.length} non-anomaly slots)`,
      features: avgFeatures,
    };
  }

  return named;
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log('Loading telemetry...');
  const telemetry = JSON.parse(fs.readFileSync(TELEMETRY, 'utf8'));
  const slots = telemetry.telemetry;

  console.log('Loading current agent state...');
  const currentState = loadCurrentState();

  console.log('Computing named fingerprints...');
  const fingerprints = findNamedFingerprints(telemetry);

  // Target = deepSync (the best state we've observed)
  const targetSlotIdx = fingerprints.deepSync.slot;
  const targetSlot = slots[targetSlotIdx];
  const currentSlot = slots[slots.length - 1];

  console.log(`\nTarget fingerprint: ${fingerprints.deepSync.label}`);
  console.log(`Current state: slot ${slots.length - 1} (${currentSlot.timestamp.slice(0,16)})`);

  // Reverse-map target voices → state targets
  console.log('\nReverse-mapping target voices to state targets...');
  const targetVoices = targetSlot.voices.filter(Boolean);
  const stateTargets = targetVoices.map(v => reverseVoice(v));

  // Gap analysis: target vs current
  console.log('\n── Gap Analysis (current → deepSync target) ──');
  const gaps = stateTargets.map(target => {
    const current = currentState[target.agentId];
    return computeGap(target, current);
  });

  let totalGap = 0;
  for (const gap of gaps) {
    totalGap += gap.gapScore;
    if (gap.aligned) {
      console.log(`  ${gap.agentId}: ALIGNED`);
    } else {
      console.log(`  ${gap.agentId}: ${gap.deltas.length} adjustments needed (gap=${gap.gapScore})`);
      for (const d of gap.deltas) {
        console.log(`    [${d.impact}] ${d.action}`);
      }
    }
  }

  // Feature comparison
  console.log('\n── Feature Comparison (current → target) ──');
  const featureComparison = compareFeatures(currentSlot.features, targetSlot.features);
  for (const [f, comp] of Object.entries(featureComparison)) {
    const arrow = comp.direction === 'higher' ? '↑' : comp.direction === 'lower' ? '↓' : '=';
    console.log(`  ${f}: ${comp.reference} → ${comp.target} (${arrow} ${comp.delta})`);
  }

  // Build full prescription for all named fingerprints
  console.log('\n── Prescriptions for all named fingerprints ──');
  const prescriptions = {};
  for (const [name, fp] of Object.entries(fingerprints)) {
    if (fp.slot === null) {
      // Synthetic fingerprint (average) — skip voice-level prescription
      prescriptions[name] = {
        label: fp.label,
        features: fp.features,
        featureComparison: compareFeatures(currentSlot.features, fp.features),
        voiceTargets: null,
        gaps: null,
        totalGap: null,
      };
      continue;
    }

    const fpSlot = slots[fp.slot];
    const fpVoices = fpSlot.voices.filter(Boolean);
    const fpTargets = fpVoices.map(v => reverseVoice(v));
    const fpGaps = fpTargets.map(target => computeGap(target, currentState[target.agentId]));
    const fpTotalGap = fpGaps.reduce((s, g) => s + g.gapScore, 0);

    prescriptions[name] = {
      label: fp.label,
      slot: fp.slot,
      timestamp: fpSlot.timestamp,
      features: fp.features,
      featureComparison: compareFeatures(currentSlot.features, fp.features),
      voiceTargets: fpTargets,
      gaps: fpGaps,
      totalGap: fpTotalGap,
    };

    console.log(`  ${name} (${fp.label}): total gap = ${fpTotalGap}`);
  }

  // Write output
  const output = {
    version: 'v1',
    generated: new Date().toISOString(),
    description: 'Harmonic Prescriber: reverse-maps target cymatic fingerprints to agent state targets',
    currentState,
    currentFeatures: currentSlot.features,
    currentTimestamp: currentSlot.timestamp,
    fingerprints,
    prescriptions,
    summary: {
      recommendedTarget: 'deepSync',
      totalGap: totalGap,
      agentsMostOff: gaps.sort((a, b) => b.gapScore - a.gapScore).map(g => ({
        agent: g.agentId,
        gap: g.gapScore,
        topAction: g.deltas[0]?.action || 'aligned',
      })),
    },
  };

  fs.writeFileSync(OUT, JSON.stringify(output, null, 2));
  console.log(`\nPrescription written to ${OUT}`);
  console.log(`Total gap score: ${totalGap} (lower = closer to target)`);
}

main();
