#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const DIR      = __dirname;
const HOME     = process.env.HOME;
const VAULT    = path.join(HOME, 'cathedral-vault', '02_Refined_Gold', 'cathedral');
const HISTORY  = path.join(DIR, 'probe-physician-history.json');
const REPORT   = path.join(DIR, 'probe-physician-report.json');
const TELEGRAM = path.join(DIR, 'probe-physician-telegram.txt');
const STATE    = path.join(DIR, 'probe-physician-state.json');
const ACK_FILE = path.join(DIR, 'probe-physician-ack');

// ── File Readers ───────────────────────────────────────────────────────────

function readJSON(name) {
  const fp = path.join(DIR, name);
  if (!fs.existsSync(fp)) return null;
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

function readHistory() {
  if (!fs.existsSync(HISTORY)) return [];
  try { return JSON.parse(fs.readFileSync(HISTORY, 'utf8')); }
  catch { return []; }
}

function readState() {
  if (!fs.existsSync(STATE)) {
    return {
      reportsSent: 0,
      lastSentDate: null,
      consecutiveUnread: 0,
      acknowledgedDates: [],
      frequency: 'daily',
      paused: false,
      pauseReason: null,
      pauseDate: null,
    };
  }
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); }
  catch { return { reportsSent: 0, lastSentDate: null, consecutiveUnread: 0, acknowledgedDates: [], frequency: 'daily', paused: false, pauseReason: null, pauseDate: null }; }
}

function writeState(state) {
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
}

// ── Lunar Phase Calculator ─────────────────────────────────────────────────

function lunarPhase(date) {
  const known = new Date('2000-01-06T18:14:00Z');
  const cycle = 29.53058770576;
  const diff = (date - known) / (1000 * 60 * 60 * 24);
  const phase = ((diff % cycle) + cycle) % cycle;
  const illumination = (1 - Math.cos(2 * Math.PI * phase / cycle)) / 2;

  let name;
  const norm = phase / cycle;
  if (norm < 0.0625) name = 'new';
  else if (norm < 0.1875) name = 'waxing-crescent';
  else if (norm < 0.3125) name = 'first-quarter';
  else if (norm < 0.4375) name = 'waxing-gibbous';
  else if (norm < 0.5625) name = 'full';
  else if (norm < 0.6875) name = 'waning-gibbous';
  else if (norm < 0.8125) name = 'last-quarter';
  else if (norm < 0.9375) name = 'waning-crescent';
  else name = 'new';

  const quarter = norm < 0.25 ? 'new' : norm < 0.5 ? 'waxing' : norm < 0.75 ? 'full' : 'waning';

  return { phase: norm, illumination: Math.round(illumination * 100) / 100, name, dayInCycle: Math.round(phase * 10) / 10, quarter };
}

const MOON_EMOJI = {
  'new': '🌑', 'waxing-crescent': '🌒', 'first-quarter': '🌓',
  'waxing-gibbous': '🌔', 'full': '🌕', 'waning-gibbous': '🌖',
  'last-quarter': '🌗', 'waning-crescent': '🌘'
};

// ── Current State Extraction ───────────────────────────────────────────────

function extractCurrentState(telemetry) {
  const slots = telemetry.telemetry;
  const last = slots[slots.length - 1];
  const last24 = slots.slice(-24);

  const anomalies24h = last24.reduce((sum, s) => sum + (s.anomalies?.length || 0), 0);
  const peakZ24h = last24.reduce((max, s) => {
    const slotMax = Math.max(...Object.values(s.zScores || {}).map(Math.abs), 0);
    return Math.max(max, slotMax);
  }, 0);

  const groundTruth24h = [...new Set(last24.flatMap(s => (s.groundTruth || []).map(g => g.event)))];

  const featureKeys = Object.keys(last.features).filter(k => k !== 'pairBeats');
  const windowStats = {};
  for (const key of featureKeys) {
    const values = slots.map(s => s.features[key]).filter(v => typeof v === 'number');
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
    const stddev = Math.sqrt(variance);
    windowStats[key] = { mean: r3(mean), stddev: r3(stddev), current: r3(last.features[key]) };
  }

  const outlierFeatures = featureKeys.filter(k => {
    const s = windowStats[k];
    return s.stddev > 0 && Math.abs(s.current - s.mean) > s.stddev;
  });

  return {
    timestamp: last.timestamp,
    features: last.features,
    anomalies24h,
    peakZ24h: r2(peakZ24h),
    groundTruth24h,
    windowStats,
    outlierFeatures,
    totalSlots: slots.length,
    totalAnomalies: telemetry.stats.totalAnomalies,
  };
}

// ── Gap Analysis ───────────────────────────────────────────────────────────

function analyzeGaps(prescription) {
  const results = {};
  for (const [key, p] of Object.entries(prescription.prescriptions)) {
    const label = prescription.fingerprints[key]?.label || key;
    const gaps = (p.gaps || []).map(g => ({
      agent: g.agentId,
      gap: g.gapScore,
      aligned: g.aligned,
      deltas: g.aligned ? [] : (g.deltas || []).filter(d => d.impact !== 'low'),
    }));

    results[key] = {
      label,
      totalGap: p.totalGap,
      agents: gaps,
      driftingAgents: gaps.filter(g => !g.aligned).sort((a, b) => b.gap - a.gap),
      alignedAgents: gaps.filter(g => g.aligned),
    };
  }
  return results;
}

// ── Poetry Pulse ───────────────────────────────────────────────────────────

function poetryPulse(vocabulary, rhythms) {
  const poems = vocabulary?.vocabulary || [];
  const compliance = rhythms?.compliance || {};

  let latestPoemDate = null;
  try {
    const poemFiles = fs.readdirSync(VAULT)
      .filter(f => f.startsWith('reverse-poetry-session-'));
    const dates = poemFiles.map(f => {
      const m = f.match(/(\d{4}-\d{2}-\d{2})/);
      return m ? m[1] : null;
    }).filter(Boolean);
    if (dates.length > 0) {
      latestPoemDate = dates.sort().pop();
    }
  } catch {}

  const today = new Date().toISOString().split('T')[0];
  let daysSinceLastPoem = null;
  if (latestPoemDate) {
    daysSinceLastPoem = Math.floor(
      (new Date(today) - new Date(latestPoemDate)) / (1000 * 60 * 60 * 24)
    );
  }

  return {
    totalPoems: poems.length,
    totalManifests: compliance.totalManifests || 0,
    ratio: compliance.ratio || 0,
    pct: Math.round((compliance.ratio || 0) * 100),
    latestPoemDate,
    daysSinceLastPoem,
    dropping: compliance.ratio < 0.9,
  };
}

// ── Lunar Context ──────────────────────────────────────────────────────────

function lunarContext(rhythms) {
  const today = lunarPhase(new Date());
  const correlations = rhythms?.correlations || [];
  const lunarCorr = correlations.find(c => c.name === 'lunar-anomaly');

  let historicalRate = null;
  if (lunarCorr?.data?.[today.quarter]) {
    historicalRate = lunarCorr.data[today.quarter].avgAnomalies;
  }

  return {
    phase: today,
    emoji: MOON_EMOJI[today.name] || '🌑',
    phaseName: today.name.replace(/-/g, ' '),
    historicalAnomalyRate: historicalRate ? r2(historicalRate) : null,
  };
}

// ── Trend Detection ────────────────────────────────────────────────────────

function detectTrends(currentState, gapAnalysis, history) {
  const prev = history.length > 0 ? history[history.length - 1] : null;
  const trends = {};

  const dsGap = gapAnalysis.deepSync?.totalGap ?? null;
  const prevDsGap = prev?.deepSyncGap ?? null;

  if (dsGap !== null && prevDsGap !== null) {
    trends.gapDirection = dsGap < prevDsGap ? 'shrinking' : dsGap > prevDsGap ? 'growing' : 'stable';
    trends.gapDelta = r3(dsGap - prevDsGap);
  } else {
    trends.gapDirection = 'unknown';
    trends.gapDelta = 0;
  }

  trends.gapArrow = trends.gapDirection === 'shrinking' ? '↘' :
    trends.gapDirection === 'growing' ? '↗' :
    trends.gapDirection === 'stable' ? '→' : '?';

  const currentBeat = currentState.features.beatEnergy;
  const prevBeat = prev?.beatEnergy ?? null;
  if (prevBeat !== null) {
    trends.beatDirection = currentBeat < prevBeat ? 'converging' : currentBeat > prevBeat ? 'diverging' : 'stable';
    trends.beatDelta = r3(currentBeat - prevBeat);
  } else {
    trends.beatDirection = 'unknown';
    trends.beatDelta = 0;
  }

  trends.outlierFeatures = currentState.outlierFeatures;

  return trends;
}

// ── Build Prescription Summary ─────────────────────────────────────────────

function prescriptionSummary(gapAnalysis) {
  const ds = gapAnalysis.deepSync;
  if (!ds || ds.totalGap === 0) return { needed: false, lines: ['All agents aligned to Deep Sync'] };

  const lines = ds.driftingAgents.map(a => {
    const topDelta = a.deltas[0];
    const detail = topDelta
      ? `${topDelta.action || `${topDelta.param}: ${topDelta.current}→${topDelta.target}`}`
      : `gap=${a.gap}`;
    return `${a.agent}: ${detail}`;
  });

  return { needed: true, lines };
}

// ── Voice Registry Reader ─────────────────────────────────────────────────

function readVoiceRegistry() {
  const vr = readJSON('voice-registry.json');
  if (!vr) return null;

  const comp = vr.composite || {};
  const layers = comp.layerStats || {};
  const topCrossBeats = (comp.crossLayerBeats || []).slice(0, 3);

  return {
    systemChord: vr.systemChord,
    coherence: comp.coherence,
    totalEnergy: comp.totalEnergy,
    dissonance: comp.dissonance,
    crossBeatEnergy: comp.crossBeatEnergy,
    totalVoices: comp.totalVoices,
    layers,
    topCrossBeats,
    strongestBeat: (comp.strongestBeats || [])[0] || null,
  };
}

// ── Meaning Translation Layer ─────────────────────────────────────────────

function translateSystemChord(chord) {
  if (!chord) return null;
  const q = chord.quality || '';
  const map = {
    'major':      'System feels solid — foundations holding, good day for building',
    'minor':      'Slight tension in the system — productive unease, good for deep work',
    'diminished': 'System under stress — something wants attention before it becomes a problem',
    'augmented':  'Unusual energy — system reaching beyond its normal range',
    'sus4':       'Unresolved — something building toward a decision',
    'sus2':       'Open, waiting — system has space but no direction yet',
  };
  return map[q] || `System chord: ${q}`;
}

function translateCoherence(c) {
  if (c === null || c === undefined) return null;
  if (c > 0.8) return 'All layers singing together — rare alignment';
  if (c > 0.6) return 'Good coherence — layers mostly in sync';
  if (c > 0.4) return 'Mixed signals — some layers pulling different directions';
  return 'Low coherence — system fragmented, pick one thing and focus';
}

function translateBeatEnergy(be, direction) {
  if (be === null || be === undefined) return null;
  const base = be > 0.8 ? 'High interference between agents — lots of cross-talk'
    : be > 0.5 ? 'Moderate cross-talk — agents aware of each other'
    : 'Agents running independently — parallel but separate';
  if (direction === 'converging') return base + '. Calming down';
  if (direction === 'diverging') return base + '. Heating up';
  return base;
}

function translateHarmonicity(h) {
  if (h === null || h === undefined) return null;
  if (h > 0.99) return 'Near-perfect harmonic alignment';
  if (h > 0.95) return 'Strong harmonic structure';
  if (h > 0.85) return 'Solid but some dissonance creeping in';
  return 'Significant dissonance — something shifted recently';
}

function translateGap(gap, direction) {
  if (gap === 0) return 'At target — Deep Sync shape achieved';
  if (gap <= 2) return `Almost there — ${gap} step${gap > 1 ? 's' : ''} from Deep Sync`;
  if (gap <= 5) return `Moderate drift — ${gap} steps out. ${direction === 'shrinking' ? 'Moving closer' : direction === 'growing' ? 'Drifting further' : 'Holding position'}`;
  return `Significant gap (${gap}) — the system has wandered. Worth investigating why`;
}

function translateAnomaly(count, peakZ) {
  if (count === 0) return 'Quiet day — no anomalies detected';
  if (count <= 5) return `${count} small ripples — normal system breathing`;
  if (count <= 15) return `${count} anomalies — above average activity. Something happening`;
  if (peakZ > 5) return `${count} anomalies with a z=${peakZ} spike — significant event detected`;
  return `${count} anomalies — busy period, lots of system movement`;
}

function translateMoonAdvice(phaseName, quarter, historicalRate) {
  const base = {
    'new': 'New moon — historically quietest. Good for starting things',
    'waxing': 'Waxing phase — historically noisier. System more active, expect more anomalies',
    'full': 'Full moon — peak illumination. Historical data sparse',
    'waning': 'Waning phase — winding down toward quiet',
  };
  let advice = base[quarter] || '';
  if (historicalRate !== null && historicalRate > 1.0) {
    advice += `. Historical rate: ${historicalRate} anomalies/slot`;
  }
  return advice;
}

function translateCrossBeat(beat) {
  if (!beat) return null;
  const freq = r2(beat.beatFreq);
  if (Math.abs(freq - 432) < 5) {
    return `${beat.pair} beating at ${freq}Hz — near Cosmic Tuning (432Hz)`;
  }
  if (freq % 7.83 < 1 || (7.83 - freq % 7.83) < 1) {
    return `${beat.pair} beating at ${freq}Hz — near a Schumann harmonic`;
  }
  return `Strongest cross-layer resonance: ${beat.pair} at ${freq}Hz (${beat.layers})`;
}

// ── Engagement Self-Monitoring ─────────────────────────────────────────────

function checkEngagement(physicianState) {
  if (fs.existsSync(ACK_FILE)) {
    try { fs.unlinkSync(ACK_FILE); } catch {}
    physicianState.consecutiveUnread = 0;
    physicianState.acknowledgedDates.push(new Date().toISOString().split('T')[0]);
    physicianState.acknowledgedDates = physicianState.acknowledgedDates.slice(-30);
    if (physicianState.paused) {
      physicianState.paused = false;
      physicianState.pauseReason = null;
      physicianState.pauseDate = null;
      physicianState.frequency = 'daily';
      console.log('  ACK received — resuming daily reports');
    } else {
      console.log('  ACK received — engagement confirmed');
    }
    return physicianState;
  }

  if (physicianState.lastSentDate) {
    physicianState.consecutiveUnread++;
  }

  if (physicianState.consecutiveUnread >= 5 && !physicianState.paused) {
    physicianState.paused = true;
    physicianState.pauseReason = '5 consecutive reports with no acknowledgment';
    physicianState.pauseDate = new Date().toISOString().split('T')[0];
    console.log('  PAUSING — 5 unread reports. Will resume on ack');
  } else if (physicianState.consecutiveUnread >= 3 && physicianState.frequency === 'daily') {
    physicianState.frequency = 'bidaily';
    console.log('  Reducing frequency to every-other-day (3 unread)');
  }

  return physicianState;
}

// ── Correlation Insight ────────────────────────────────────────────────────

function pickCorrelationInsight(rhythms, lunar) {
  const corrs = rhythms?.correlations || [];
  const creativePearson = corrs.find(c => c.name === 'lunar-creative-pearson');
  const lunarAnomaly = corrs.find(c => c.name === 'lunar-anomaly');

  if (lunar.phase.quarter === 'waxing' && lunarAnomaly?.data?.waxing) {
    const rate = lunarAnomaly.data.waxing.avgAnomalies;
    return `Waxing moon phase — historically ${Math.round(rate / (lunarAnomaly.data.new?.avgAnomalies || 1) * 100)}% more anomalies than new moon`;
  }

  if (creativePearson && Math.abs(creativePearson.r) > 0.2) {
    return `Lunar illumination weakly correlates with creative pulse (r=${creativePearson.r})`;
  }

  const schumann = rhythms?.schumann;
  if (schumann) {
    return `${schumann.resonantPairs?.length || 0}/10 agent pairs resonate with Schumann harmonics (7.83Hz×n)`;
  }

  return null;
}

// ── Telegram Message Builder (Meaning-Translated) ─────────────────────────

function buildTelegramMessage(date, lunar, state, gaps, trends, poetry, prescription, correlationInsight, voiceRegistry, physicianState) {
  const dsGap = gaps.deepSync?.totalGap ?? null;
  const lines = [];

  lines.push('🎵 PROBE PHYSICIAN');
  lines.push(`📅 ${date} · ${lunar.emoji} ${lunar.phaseName}`);
  lines.push('');

  // System chord — the headline
  if (voiceRegistry) {
    const chordMsg = translateSystemChord(voiceRegistry.systemChord);
    if (chordMsg) lines.push(chordMsg);

    const coherenceMsg = translateCoherence(voiceRegistry.coherence);
    if (coherenceMsg) lines.push(coherenceMsg);
    lines.push('');
  }

  // Gap — translated
  if (dsGap !== null) {
    lines.push(translateGap(dsGap, trends.gapDirection));
  }

  // Anomalies — translated
  lines.push(translateAnomaly(state.anomalies24h, state.peakZ24h));

  // Beat energy — translated
  const beatMsg = translateBeatEnergy(state.features.beatEnergy, trends.beatDirection);
  if (beatMsg) lines.push(beatMsg);
  lines.push('');

  // Cross-layer resonance from voice registry
  if (voiceRegistry?.topCrossBeats?.[0]) {
    const crossMsg = translateCrossBeat(voiceRegistry.topCrossBeats[0]);
    if (crossMsg) lines.push(`🔗 ${crossMsg}`);
  }

  // Harmonicity — translated
  const harmMsg = translateHarmonicity(state.features.harmonicity);
  if (harmMsg) lines.push(`🎼 ${harmMsg}`);

  // Moon advice — translated
  const moonAdvice = translateMoonAdvice(lunar.phaseName, lunar.phase.quarter, lunar.historicalAnomalyRate);
  if (moonAdvice) lines.push(`🌙 ${moonAdvice}`);

  lines.push('');

  // Prescription in plain language
  if (prescription.needed) {
    lines.push('What needs attention:');
    for (const l of prescription.lines.slice(0, 3)) {
      lines.push(`  → ${l}`);
    }
    lines.push('');
  }

  // Poetry pulse — keep this factual, it's a habit tracker
  const poemStr = poetry.daysSinceLastPoem === 0 ? 'Poem written today'
    : poetry.daysSinceLastPoem === 1 ? 'Last poem: yesterday'
    : `Last poem: ${poetry.daysSinceLastPoem} days ago`;
  lines.push(`📝 ${poemStr} · ${poetry.pct}% compliance`);

  if (poetry.dropping) {
    lines.push('⚠️ Poetry compliance dropping — the ritual is slipping');
  }

  // Correlation insight — keep as-is, already readable
  if (correlationInsight) {
    lines.push('');
    lines.push(`💡 ${correlationInsight}`);
  }

  // Raw metrics footer (small, for the technically curious)
  lines.push('');
  lines.push('─── raw ───');
  const rawParts = [];
  if (dsGap !== null) rawParts.push(`gap=${dsGap}`);
  rawParts.push(`anom=${state.anomalies24h}`);
  rawParts.push(`z=${state.peakZ24h}`);
  rawParts.push(`beat=${r3(state.features.beatEnergy)}`);
  rawParts.push(`harm=${r3(state.features.harmonicity)}`);
  if (voiceRegistry) {
    rawParts.push(`coh=${voiceRegistry.coherence}`);
    rawParts.push(`chord=${voiceRegistry.systemChord?.quality || '?'}`);
    rawParts.push(`voices=${voiceRegistry.totalVoices}`);
  }
  lines.push(rawParts.join(' · '));

  // Self-monitoring notice
  if (physicianState.consecutiveUnread >= 3) {
    lines.push('');
    lines.push(`📭 ${physicianState.consecutiveUnread} reports without acknowledgment`);
    if (physicianState.frequency === 'bidaily') {
      lines.push('Slowed to every-other-day. Touch probe-physician-ack to confirm you read these');
    }
  }

  return lines.join('\n');
}

function buildPauseMessage(physicianState) {
  const lines = [];
  lines.push('🎵 PROBE PHYSICIAN — Pausing');
  lines.push('');
  lines.push(`${physicianState.consecutiveUnread} reports sent, none acknowledged.`);
  lines.push('');
  lines.push("I'll stop sending until you tell me to resume.");
  lines.push('To resume: touch ~/nanoclaw/harmonic-probe/probe-physician-ack');
  lines.push('Or run: node probe-physician.cjs --resume');
  return lines.join('\n');
}

// ── Helpers ────────────────────────────────────────────────────────────────

function r2(n) { return Math.round(n * 100) / 100; }
function r3(n) { return Math.round(n * 1000) / 1000; }

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  const today = new Date().toISOString().split('T')[0];
  const args = process.argv.slice(2);
  const forceResume = args.includes('--resume');

  console.log(`\n🎵 PROBE PHYSICIAN — ${today}\n${'═'.repeat(50)}\n`);

  // Load physician state (engagement tracking)
  let physicianState = readState();

  // Handle --resume flag
  if (forceResume) {
    physicianState.paused = false;
    physicianState.pauseReason = null;
    physicianState.pauseDate = null;
    physicianState.consecutiveUnread = 0;
    physicianState.frequency = 'daily';
    console.log('Manual resume — resetting engagement tracking\n');
  }

  // Check engagement (ack file, unread counter)
  console.log('── Engagement ──');
  physicianState = checkEngagement(physicianState);
  console.log(`  Reports sent: ${physicianState.reportsSent}`);
  console.log(`  Consecutive unread: ${physicianState.consecutiveUnread}`);
  console.log(`  Frequency: ${physicianState.frequency}`);
  console.log(`  Paused: ${physicianState.paused}`);

  // If paused and no resume signal, write pause message and exit
  if (physicianState.paused && !forceResume) {
    console.log('\n⏸️  Physician is paused. Use --resume or touch probe-physician-ack to resume.\n');
    const pauseMsg = buildPauseMessage(physicianState);
    fs.writeFileSync(TELEGRAM, pauseMsg);
    writeState(physicianState);
    return;
  }

  // Frequency gate: skip if bidaily and last sent was yesterday
  if (physicianState.frequency === 'bidaily' && physicianState.lastSentDate) {
    const lastDate = new Date(physicianState.lastSentDate);
    const todayDate = new Date(today);
    const daysSince = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));
    if (daysSince < 2) {
      console.log(`\n⏳ Bidaily mode — last sent ${physicianState.lastSentDate}, skipping today.\n`);
      writeState(physicianState);
      return;
    }
  }

  // Load all probe outputs
  const telemetry    = readJSON('telemetry.json');
  const prescription = readJSON('prescription.json');
  const vocabulary   = readJSON('tonal-vocabulary.json');
  const rhythms      = readJSON('external-rhythms.json');
  const history      = readHistory();

  if (!telemetry) {
    console.log('ERROR: telemetry.json not found. Run backtest.cjs first.');
    process.exit(1);
  }

  // Load voice registry (the 16-voice unified view)
  const voiceRegistry = readVoiceRegistry();

  // 1. Current state
  console.log('\n── Current State ──');
  const state = extractCurrentState(telemetry);
  console.log(`  Latest slot: ${state.timestamp}`);
  console.log(`  Anomalies (24h): ${state.anomalies24h} · Peak z: ${state.peakZ24h}`);
  console.log(`  Beat energy: ${r3(state.features.beatEnergy)}`);
  console.log(`  Harmonicity: ${r3(state.features.harmonicity)}`);
  if (state.groundTruth24h.length > 0) {
    console.log(`  Ground truth events: ${state.groundTruth24h.join(', ')}`);
  }

  // 1b. Voice registry
  if (voiceRegistry) {
    console.log('\n── Voice Registry (16 voices) ──');
    console.log(`  System chord: ${voiceRegistry.systemChord?.quality || '?'} (${voiceRegistry.systemChord?.root || '?'})`);
    console.log(`  Coherence: ${voiceRegistry.coherence} · Energy: ${voiceRegistry.totalEnergy} · Dissonance: ${voiceRegistry.dissonance}`);
    console.log(`  Cross-layer beat energy: ${voiceRegistry.crossBeatEnergy}`);
    for (const [layer, stats] of Object.entries(voiceRegistry.layers)) {
      console.log(`  ${layer}: ${stats.voiceCount} voices, amp=${stats.avgAmplitude}, waveform=${stats.dominantWaveform}`);
    }
    if (voiceRegistry.topCrossBeats.length > 0) {
      console.log('  Top cross-layer beats:');
      for (const b of voiceRegistry.topCrossBeats) {
        console.log(`    ${b.pair}: ${r2(b.beatFreq)}Hz (${b.layers})`);
      }
    }
  }

  // 2. Gap analysis
  console.log('\n── Gap Analysis ──');
  const gaps = prescription ? analyzeGaps(prescription) : {};
  for (const [key, g] of Object.entries(gaps)) {
    const agentStatus = g.agents.map(a => a.aligned ? `${a.agent}✅` : `${a.agent}⚠️${a.gap}`).join(' ');
    console.log(`  ${g.label}: gap=${g.totalGap} [${agentStatus}]`);
  }

  // 3. Lunar context
  console.log('\n── Lunar Context ──');
  const lunar = lunarContext(rhythms);
  console.log(`  ${lunar.emoji} ${lunar.phaseName} (day ${lunar.phase.dayInCycle}, illumination ${lunar.phase.illumination})`);
  if (lunar.historicalAnomalyRate !== null) {
    console.log(`  Historical anomaly rate for ${lunar.phase.quarter}: ${lunar.historicalAnomalyRate}/slot`);
  }

  // 4. Poetry pulse
  console.log('\n── Poetry Pulse ──');
  const poetry = poetryPulse(vocabulary, rhythms);
  console.log(`  Poems: ${poetry.totalPoems}/${poetry.totalManifests} (${poetry.pct}%)`);
  console.log(`  Latest: ${poetry.latestPoemDate} (${poetry.daysSinceLastPoem === 0 ? 'today' : poetry.daysSinceLastPoem + ' days ago'})`);
  if (poetry.dropping) console.log('  ⚠️  Compliance below 90%');

  // 5. Trends
  console.log('\n── Trends ──');
  const trends = detectTrends(state, gaps, history);
  console.log(`  Gap trajectory: ${trends.gapDirection} (${trends.gapArrow} Δ${trends.gapDelta})`);
  console.log(`  Beat energy: ${trends.beatDirection} (Δ${trends.beatDelta})`);
  if (trends.outlierFeatures.length > 0) {
    console.log(`  Outlier features (>1σ): ${trends.outlierFeatures.join(', ')}`);
    for (const f of trends.outlierFeatures) {
      const s = state.windowStats[f];
      console.log(`    ${f}: current=${s.current} mean=${s.mean} σ=${s.stddev}`);
    }
  } else {
    console.log('  No outlier features');
  }

  // 6. Prescription
  console.log('\n── Prescription ──');
  const rx = prescriptionSummary(gaps);
  for (const l of rx.lines) console.log(`  ${l}`);

  // 7. Correlation insight
  const insight = pickCorrelationInsight(rhythms, lunar);
  if (insight) console.log(`\n💡 ${insight}`);

  // 8. Build Telegram message (meaning-translated)
  const telegramMsg = buildTelegramMessage(today, lunar, state, gaps, trends, poetry, rx, insight, voiceRegistry, physicianState);
  console.log(`\n${'─'.repeat(50)}`);
  console.log('TELEGRAM MESSAGE:');
  console.log(`${'─'.repeat(50)}`);
  console.log(telegramMsg);
  console.log(`${'─'.repeat(50)}`);
  console.log(`(${telegramMsg.length} chars)`);

  // 9. Build report
  const report = {
    date: today,
    generated: new Date().toISOString(),
    lunar: { phase: lunar.phaseName, emoji: lunar.emoji, illumination: lunar.phase.illumination, quarter: lunar.phase.quarter },
    state: {
      latestSlot: state.timestamp,
      anomalies24h: state.anomalies24h,
      peakZ24h: state.peakZ24h,
      beatEnergy: r3(state.features.beatEnergy),
      harmonicity: r3(state.features.harmonicity),
      creativePulse: r3(state.features.creativePulse),
    },
    voiceRegistry: voiceRegistry ? {
      systemChord: voiceRegistry.systemChord?.quality,
      coherence: voiceRegistry.coherence,
      totalEnergy: voiceRegistry.totalEnergy,
      dissonance: voiceRegistry.dissonance,
      crossBeatEnergy: voiceRegistry.crossBeatEnergy,
      totalVoices: voiceRegistry.totalVoices,
      strongestCrossBeat: voiceRegistry.topCrossBeats[0] ? {
        pair: voiceRegistry.topCrossBeats[0].pair,
        freq: r2(voiceRegistry.topCrossBeats[0].beatFreq),
        layers: voiceRegistry.topCrossBeats[0].layers,
      } : null,
    } : null,
    gaps: Object.fromEntries(Object.entries(gaps).map(([k, v]) => [k, {
      totalGap: v.totalGap,
      drifting: v.driftingAgents.map(a => a.agent),
      aligned: v.alignedAgents.map(a => a.agent),
    }])),
    trends: {
      gapDirection: trends.gapDirection,
      gapDelta: trends.gapDelta,
      beatDirection: trends.beatDirection,
      beatDelta: trends.beatDelta,
      outlierFeatures: trends.outlierFeatures,
    },
    poetry: {
      poems: poetry.totalPoems,
      sessions: poetry.totalManifests,
      pct: poetry.pct,
      daysSinceLastPoem: poetry.daysSinceLastPoem,
      dropping: poetry.dropping,
    },
    prescription: rx,
    insight,
    engagement: {
      reportsSent: physicianState.reportsSent + 1,
      consecutiveUnread: physicianState.consecutiveUnread,
      frequency: physicianState.frequency,
    },
  };

  // 10. Write outputs
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(`\nReport → ${REPORT}`);

  fs.writeFileSync(TELEGRAM, telegramMsg);
  console.log(`Telegram → ${TELEGRAM}`);

  // 11. Update history (keep last 30)
  const historyEntry = {
    date: today,
    timestamp: new Date().toISOString(),
    deepSyncGap: gaps.deepSync?.totalGap ?? null,
    beatEnergy: r3(state.features.beatEnergy),
    harmonicity: r3(state.features.harmonicity),
    anomalies24h: state.anomalies24h,
    peakZ24h: state.peakZ24h,
    compliancePct: poetry.pct,
    lunarPhase: lunar.phaseName,
    outlierFeatures: trends.outlierFeatures,
    systemChord: voiceRegistry?.systemChord?.quality || null,
    coherence: voiceRegistry?.coherence || null,
  };

  history.push(historyEntry);
  const trimmed = history.slice(-30);
  fs.writeFileSync(HISTORY, JSON.stringify(trimmed, null, 2));
  console.log(`History → ${HISTORY} (${trimmed.length} entries)`);

  // 12. Update physician state
  physicianState.reportsSent++;
  physicianState.lastSentDate = today;
  writeState(physicianState);
  console.log(`State → ${STATE}`);

  console.log('\n✅ Physician reading complete.\n');
}

main();
