#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const HOME = process.env.HOME;
const TELEMETRY   = path.join(__dirname, 'telemetry.json');
const MANIFEST_DIR = path.join(HOME, 'cathedral-vault', '00_Staging', 'cathedral');
const POEM_DIR     = path.join(HOME, 'cathedral-vault', '02_Refined_Gold', 'cathedral');
const PORTFOLIO    = path.join(HOME, 'nanoclaw', 'trader', 'simpsons-portfolio.json');
const GOAL_PULSE   = path.join(HOME, 'Cathedral', 'goals', 'pulse-log.json');
const OUT          = path.join(__dirname, 'external-rhythms.json');

// ── Constants ──────────────────────────────────────────────────────────────

const SCHUMANN_FUNDAMENTAL = 7.83; // Hz
const SCHUMANN_HARMONICS = [1, 2, 3, 4, 5, 6, 7, 8].map(n => n * SCHUMANN_FUNDAMENTAL);

const SOLFEGGIO = [
  { freq: 174, name: 'Foundation' },
  { freq: 285, name: 'Quantum cognition' },
  { freq: 396, name: 'Liberation (UT)' },
  { freq: 417, name: 'Facilitating change (RE)' },
  { freq: 432, name: 'Cosmic tuning' },
  { freq: 528, name: 'Transformation (MI)' },
  { freq: 639, name: 'Connection (FA)' },
  { freq: 741, name: 'Awakening intuition (SOL)' },
  { freq: 852, name: 'Spiritual order (LA)' },
  { freq: 963, name: 'Divine consciousness' },
];

const AGENT_FUNDAMENTALS = {
  boxing: 220,
  br: 275,
  forge: 330,
  muse: 352,
  orc: 440,
};

const SYNODIC_PERIOD = 29.53059; // days
// Known new moon: 2024-01-11 11:57 UTC (well-established reference)
const KNOWN_NEW_MOON = new Date('2024-01-11T11:57:00Z');

// ── Lunar Phase ────────────────────────────────────────────────────────────

function lunarPhase(date) {
  const d = new Date(date);
  const daysSince = (d - KNOWN_NEW_MOON) / (1000 * 60 * 60 * 24);
  const cyclePosition = ((daysSince % SYNODIC_PERIOD) + SYNODIC_PERIOD) % SYNODIC_PERIOD;
  const phase = cyclePosition / SYNODIC_PERIOD; // 0=new, 0.5=full

  let name;
  if (phase < 0.0625) name = 'new';
  else if (phase < 0.1875) name = 'waxing-crescent';
  else if (phase < 0.3125) name = 'first-quarter';
  else if (phase < 0.4375) name = 'waxing-gibbous';
  else if (phase < 0.5625) name = 'full';
  else if (phase < 0.6875) name = 'waning-gibbous';
  else if (phase < 0.8125) name = 'last-quarter';
  else if (phase < 0.9375) name = 'waning-crescent';
  else name = 'new';

  return {
    phase: Math.round(phase * 1000) / 1000,
    illumination: Math.round(Math.abs(Math.cos(phase * 2 * Math.PI) * -0.5 + 0.5) * 1000) / 1000,
    name,
    dayInCycle: Math.round(cyclePosition * 10) / 10,
  };
}

// ── Schumann Analysis ──────────────────────────────────────────────────────

function schumannAnalysis() {
  const agents = Object.keys(AGENT_FUNDAMENTALS);
  const pairs = [];

  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const a = agents[i], b = agents[j];
      const freqA = AGENT_FUNDAMENTALS[a];
      const freqB = AGENT_FUNDAMENTALS[b];
      const beatFreq = Math.abs(freqA - freqB);

      // Find closest Schumann harmonic
      let closestHarmonic = 1;
      let closestDist = Infinity;
      for (let n = 1; n <= 30; n++) {
        const schumannH = n * SCHUMANN_FUNDAMENTAL;
        const dist = Math.abs(beatFreq - schumannH);
        if (dist < closestDist) {
          closestDist = dist;
          closestHarmonic = n;
        }
      }

      const schumannTarget = closestHarmonic * SCHUMANN_FUNDAMENTAL;
      const deviationPct = Math.round((closestDist / schumannTarget) * 10000) / 100;
      const isResonant = deviationPct < 5; // within 5% of a Schumann harmonic

      pairs.push({
        pair: `${a}-${b}`,
        beatFreq,
        closestSchumannHarmonic: closestHarmonic,
        schumannTarget: Math.round(schumannTarget * 100) / 100,
        deviationHz: Math.round(closestDist * 100) / 100,
        deviationPct,
        resonant: isResonant,
      });
    }
  }

  return pairs.sort((a, b) => a.deviationPct - b.deviationPct);
}

// ── Solfeggio Proximity ────────────────────────────────────────────────────

function solfeggioProximity() {
  const results = [];

  for (const [agent, freq] of Object.entries(AGENT_FUNDAMENTALS)) {
    let closest = SOLFEGGIO[0];
    let closestDist = Infinity;

    for (const s of SOLFEGGIO) {
      const dist = Math.abs(freq - s.freq);
      if (dist < closestDist) {
        closestDist = dist;
        closest = s;
      }
    }

    // Also check harmonics (2x, 3x)
    let harmonicMatch = null;
    for (const s of SOLFEGGIO) {
      for (const mult of [0.5, 1, 2, 3]) {
        const target = s.freq * mult;
        const dist = Math.abs(freq - target);
        if (dist < 5) { // within 5 Hz
          harmonicMatch = {
            solfeggio: s.name,
            solfeggioFreq: s.freq,
            harmonic: mult === 0.5 ? 'sub-harmonic' : mult === 1 ? 'fundamental' : `${mult}x harmonic`,
            targetFreq: target,
            deviationHz: Math.round(dist * 100) / 100,
          };
        }
      }
    }

    results.push({
      agent,
      fundamental: freq,
      closestSolfeggio: closest.name,
      closestSolfeggioFreq: closest.freq,
      distanceHz: closestDist,
      harmonicMatch,
    });
  }

  // Also check beat frequencies against solfeggio
  const agents = Object.keys(AGENT_FUNDAMENTALS);
  const beatMatches = [];
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const beat = Math.abs(AGENT_FUNDAMENTALS[agents[i]] - AGENT_FUNDAMENTALS[agents[j]]);
      for (const s of SOLFEGGIO) {
        for (const mult of [0.5, 1, 2]) {
          const target = s.freq * mult;
          if (Math.abs(beat - target) < 5) {
            beatMatches.push({
              pair: `${agents[i]}-${agents[j]}`,
              beatFreq: beat,
              solfeggio: s.name,
              solfeggioFreq: s.freq,
              harmonic: mult === 0.5 ? 'sub' : mult === 1 ? 'fund' : `${mult}x`,
              deviationHz: Math.round(Math.abs(beat - target) * 100) / 100,
            });
          }
        }
      }
    }
  }

  return { agents: results, beatMatches };
}

// ── Session Close Compliance ───────────────────────────────────────────────

function sessionCloseCompliance() {
  const manifests = fs.readdirSync(MANIFEST_DIR)
    .filter(f => f.startsWith('session-manifest-') && f.endsWith('.yaml'))
    .map(f => {
      const m = f.match(/session-manifest-(\d{4}-\d{2}-\d{2})/);
      return m ? { file: f, date: m[1] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));

  const poems = fs.readdirSync(POEM_DIR)
    .filter(f => f.startsWith('reverse-poetry-session-'))
    .map(f => {
      const m = f.match(/session-(?:self-audit-)?(\d{4}-\d{2}-\d{2})/);
      return m ? { file: f, date: m[1] } : null;
    })
    .filter(Boolean);

  const poemDates = new Set(poems.map(p => p.date));

  // Build cumulative compliance timeline
  const timeline = [];
  let cumManifests = 0;
  let cumPoems = 0;

  const dateGroups = {};
  for (const m of manifests) {
    if (!dateGroups[m.date]) dateGroups[m.date] = { manifests: 0, hasPoem: poemDates.has(m.date) };
    dateGroups[m.date].manifests++;
  }

  for (const [date, data] of Object.entries(dateGroups).sort((a, b) => a[0].localeCompare(b[0]))) {
    cumManifests += data.manifests;
    if (data.hasPoem) cumPoems++;
    timeline.push({
      date,
      manifests: data.manifests,
      hasPoem: data.hasPoem,
      cumManifests,
      cumPoems,
      ratio: Math.round((cumPoems / cumManifests) * 1000) / 1000,
    });
  }

  return {
    totalManifests: manifests.length,
    totalPoems: poems.length,
    ratio: Math.round((poems.length / manifests.length) * 1000) / 1000,
    timeline,
  };
}

// ── Trading Activity Overlay ───────────────────────────────────────────────

function tradingOverlay(startDate, endDate) {
  // No detailed trade log in DB — use portfolio summary dates if available
  // For now, load what we can from the trading state files
  const trades = [];

  try {
    const stateFile = path.join(HOME, 'Cathedral', 'agents', 'state', 'trading-ledger.json');
    if (fs.existsSync(stateFile)) {
      const ledger = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      if (Array.isArray(ledger.trades || ledger)) {
        const items = ledger.trades || ledger;
        for (const t of items) {
          const ts = t.timestamp || t.opened_at || t.date;
          if (ts && ts >= startDate && ts <= endDate) {
            trades.push({
              timestamp: ts,
              asset: t.asset || t.symbol || 'unknown',
              action: t.action || t.type || 'trade',
              pnl: t.pnl || 0,
            });
          }
        }
      }
    }
  } catch (e) { /* no trading data available */ }

  return { trades, count: trades.length };
}

// ── Goal Pulse Overlay ─────────────────────────────────────────────────────

function goalPulseOverlay(startDate, endDate) {
  const snapshots = [];

  try {
    if (fs.existsSync(GOAL_PULSE)) {
      const pulse = JSON.parse(fs.readFileSync(GOAL_PULSE, 'utf8'));
      const entries = pulse.entries || [];
      for (const e of entries) {
        if (e.timestamp >= startDate && e.timestamp <= endDate) {
          const goals = e.goals || {};
          const activeCount = Object.values(goals).filter(g => g.active).length;
          const totalActivity = Object.values(goals).reduce((s, g) => s + (g.activity_count || 0), 0);
          snapshots.push({
            timestamp: e.timestamp,
            activeGoals: activeCount,
            totalActivity,
          });
        }
      }
    }
  } catch (e) { /* no goal data */ }

  return { snapshots, count: snapshots.length };
}

// ── Telemetry Overlay (per-slot lunar + compliance) ────────────────────────

function buildSlotOverlay(telemetry) {
  const slots = telemetry.telemetry;
  const overlaid = [];

  for (const slot of slots) {
    const lunar = lunarPhase(slot.timestamp);
    overlaid.push({
      timestamp: slot.timestamp,
      lunar,
    });
  }

  return overlaid;
}

// ── Correlation Analysis ───────────────────────────────────────────────────

function correlationAnalysis(telemetry, slotOverlay) {
  const slots = telemetry.telemetry;
  const correlations = [];

  // Lunar phase vs anomaly count
  const phases = slotOverlay.map(s => s.lunar.phase);
  const anomalyCounts = slots.map(s => (s.anomalies || []).length);
  const beatEnergies = slots.map(s => s.features?.beatEnergy || 0);
  const creativePulses = slots.map(s => s.features?.creativePulse || 0);

  // Bin by lunar quarter for correlation
  const quarters = { 'new': [], 'waxing': [], 'full': [], 'waning': [] };
  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];
    const quarter = p < 0.25 ? 'new' : p < 0.5 ? 'waxing' : p < 0.75 ? 'full' : 'waning';
    quarters[quarter].push({
      anomalies: anomalyCounts[i],
      beatEnergy: beatEnergies[i],
      creativePulse: creativePulses[i],
    });
  }

  const quarterStats = {};
  for (const [q, data] of Object.entries(quarters)) {
    if (data.length === 0) continue;
    quarterStats[q] = {
      n: data.length,
      avgAnomalies: Math.round((data.reduce((s, d) => s + d.anomalies, 0) / data.length) * 100) / 100,
      avgBeatEnergy: Math.round((data.reduce((s, d) => s + d.beatEnergy, 0) / data.length) * 1000) / 1000,
      avgCreativePulse: Math.round((data.reduce((s, d) => s + d.creativePulse, 0) / data.length) * 1000) / 1000,
    };
  }

  correlations.push({
    name: 'lunar-anomaly',
    description: 'Anomaly density by lunar quarter',
    data: quarterStats,
    finding: summarizeLunarCorrelation(quarterStats),
  });

  // Lunar illumination vs beat energy (continuous)
  const illuminations = slotOverlay.map(s => s.lunar.illumination);
  const pearsonR = pearsonCorrelation(illuminations, beatEnergies);

  correlations.push({
    name: 'lunar-beat-pearson',
    description: 'Pearson correlation: lunar illumination vs beat energy',
    r: pearsonR,
    interpretation: Math.abs(pearsonR) < 0.1 ? 'No correlation' :
      Math.abs(pearsonR) < 0.3 ? 'Weak correlation' :
      Math.abs(pearsonR) < 0.5 ? 'Moderate correlation' : 'Strong correlation',
    direction: pearsonR > 0 ? 'More light = more dissonance' : 'More light = less dissonance',
  });

  // Creative pulse vs lunar
  const pearsonCP = pearsonCorrelation(illuminations, creativePulses);
  correlations.push({
    name: 'lunar-creative-pearson',
    description: 'Pearson correlation: lunar illumination vs creative pulse',
    r: pearsonCP,
    interpretation: Math.abs(pearsonCP) < 0.1 ? 'No correlation' :
      Math.abs(pearsonCP) < 0.3 ? 'Weak correlation' :
      Math.abs(pearsonCP) < 0.5 ? 'Moderate correlation' : 'Strong correlation',
  });

  return correlations;
}

function summarizeLunarCorrelation(stats) {
  const quarters = Object.entries(stats);
  if (quarters.length < 2) return 'Insufficient data';

  const sorted = quarters.sort((a, b) => b[1].avgAnomalies - a[1].avgAnomalies);
  const highest = sorted[0];
  const lowest = sorted[sorted.length - 1];

  return `${highest[0]} moon: ${highest[1].avgAnomalies} avg anomalies (n=${highest[1].n}). ` +
    `${lowest[0]} moon: ${lowest[1].avgAnomalies} avg anomalies (n=${lowest[1].n}). ` +
    `Delta: ${Math.round((highest[1].avgAnomalies - lowest[1].avgAnomalies) * 100) / 100}`;
}

function pearsonCorrelation(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  const meanX = x.reduce((s, v) => s + v, 0) / n;
  const meanY = y.reduce((s, v) => s + v, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : Math.round((num / den) * 1000) / 1000;
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('=== External Rhythms Engine ===\n');

  // Load telemetry
  const telemetry = JSON.parse(fs.readFileSync(TELEMETRY, 'utf8'));
  const slots = telemetry.telemetry;
  const startDate = slots[0].timestamp;
  const endDate = slots[slots.length - 1].timestamp;

  console.log(`Window: ${startDate.slice(0, 10)} → ${endDate.slice(0, 10)} (${slots.length} slots)\n`);

  // 1. Schumann analysis
  console.log('── Schumann Harmonic Analysis ──');
  const schumann = schumannAnalysis();
  for (const p of schumann) {
    const tag = p.resonant ? ' ★ RESONANT' : '';
    console.log(`  ${p.pair}: beat=${p.beatFreq}Hz → ${p.closestSchumannHarmonic}th harmonic (${p.schumannTarget}Hz) deviation=${p.deviationPct}%${tag}`);
  }

  // 2. Solfeggio proximity
  console.log('\n── Solfeggio Proximity ──');
  const solfeggio = solfeggioProximity();
  for (const a of solfeggio.agents) {
    const hmatch = a.harmonicMatch ? ` ★ ${a.harmonicMatch.harmonic} of ${a.harmonicMatch.solfeggio} (${a.harmonicMatch.deviationHz}Hz off)` : '';
    console.log(`  ${a.agent} (${a.fundamental}Hz) → nearest: ${a.closestSolfeggio} (${a.closestSolfeggioFreq}Hz, ${a.distanceHz}Hz off)${hmatch}`);
  }
  if (solfeggio.beatMatches.length > 0) {
    console.log('  Beat frequency matches:');
    for (const m of solfeggio.beatMatches) {
      console.log(`    ${m.pair} beat=${m.beatFreq}Hz → ${m.harmonic} of ${m.solfeggio} (${m.deviationHz}Hz off)`);
    }
  }

  // 3. Lunar overlay
  console.log('\n── Lunar Phase Overlay ──');
  const slotOverlay = buildSlotOverlay(telemetry);
  const firstLunar = slotOverlay[0].lunar;
  const lastLunar = slotOverlay[slotOverlay.length - 1].lunar;
  console.log(`  Start: ${firstLunar.name} (phase=${firstLunar.phase}, illum=${firstLunar.illumination}, day ${firstLunar.dayInCycle})`);
  console.log(`  End:   ${lastLunar.name} (phase=${lastLunar.phase}, illum=${lastLunar.illumination}, day ${lastLunar.dayInCycle})`);

  // 4. Session close compliance
  console.log('\n── Session Close Compliance ──');
  const compliance = sessionCloseCompliance();
  console.log(`  Manifests: ${compliance.totalManifests}`);
  console.log(`  Poems: ${compliance.totalPoems}`);
  console.log(`  Ratio: ${compliance.ratio} (${Math.round(compliance.ratio * 100)}%)`);

  // 5. Trading overlay
  console.log('\n── Trading Activity ──');
  const trading = tradingOverlay(startDate, endDate);
  console.log(`  Trades in window: ${trading.count}`);

  // 6. Goal pulse
  console.log('\n── Goal Pulse ──');
  const goals = goalPulseOverlay(startDate, endDate);
  console.log(`  Snapshots in window: ${goals.count}`);

  // 7. Correlation analysis
  console.log('\n── Correlation Analysis ──');
  const correlations = correlationAnalysis(telemetry, slotOverlay);
  for (const c of correlations) {
    console.log(`  ${c.name}: ${c.finding || `r=${c.r} (${c.interpretation})`}`);
    if (c.direction) console.log(`    Direction: ${c.direction}`);
  }

  // Build output
  const output = {
    version: 'v1',
    generated: new Date().toISOString(),
    window: { start: startDate, end: endDate, slots: slots.length },
    schumann: {
      fundamental: SCHUMANN_FUNDAMENTAL,
      harmonics: SCHUMANN_HARMONICS,
      agentPairs: schumann,
      resonantPairs: schumann.filter(p => p.resonant),
    },
    solfeggio: {
      scale: SOLFEGGIO,
      agents: solfeggio.agents,
      beatMatches: solfeggio.beatMatches,
    },
    lunar: {
      slotOverlay,
      startPhase: firstLunar,
      endPhase: lastLunar,
    },
    compliance,
    trading,
    goals,
    correlations,
  };

  fs.writeFileSync(OUT, JSON.stringify(output, null, 2));
  console.log(`\nExternal rhythms written to ${OUT}`);
}

main();
