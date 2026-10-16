#!/usr/bin/env node
'use strict';

/**
 * Cathedral Heartbeat
 *
 * Continuous rhythm of scheduled stimulation events that keep
 * the system above minimum viable activity for emergence.
 *
 * Like a heart pumping blood — doesn't matter what any single beat
 * carries. What matters is the system keeps moving.
 *
 * Each event:
 *   1. Fire — run the event
 *   2. Measure — snapshot neural bus frequencies before/after
 *   3. Feedback — log what happened, how much cascade, what died
 *   4. Adapt — events that generate more cascade get scheduled more
 *
 * Events rotate through types. Frequency auto-adjusts based on
 * which types produce the most downstream activity.
 *
 * Usage:
 *   node cathedral-heartbeat.cjs              # Run one beat (next event in rotation)
 *   node cathedral-heartbeat.cjs --status     # Show heartbeat health
 *   node cathedral-heartbeat.cjs --force TYPE # Force a specific event type
 *   node cathedral-heartbeat.cjs --history    # Show recent beats with impact
 *
 * PM2: cron every 15 minutes
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const HOME = process.env.HOME;
const NANOCLAW = path.join(HOME, 'nanoclaw');
const AGENTS_DIR = path.join(HOME, 'Cathedral', 'agents');
const STATE_FILE = path.join(NANOCLAW, 'heartbeat-state.json');

// Load .env
const envPath = path.join(NANOCLAW, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (!process.env[match[1].trim()]) process.env[match[1].trim()] = val;
    }
  }
}

// ── Event type definitions ───────────────────────────────────────────────────

const EVENT_TYPES = [
  {
    id: 'curiosity',
    name: 'Curiosity Loop',
    description: 'One agent researches, posts findings, messages others',
    script: path.join(AGENTS_DIR, 'curiosity-loop.js'),
    args: [],
    expectedDuration: 30, // seconds
    weight: 3, // default scheduling weight (higher = more frequent)
  },
  {
    id: 'workshop',
    name: 'Maya Workshop',
    description: 'Cross-agent sociability exercise',
    script: path.join(NANOCLAW, 'maya-workshop.cjs'),
    args: ['run'],
    expectedDuration: 10,
    weight: 2,
  },
  {
    id: 'dissent',
    name: 'Dissent Round',
    description: 'Structured debate on contradictions',
    script: path.join(AGENTS_DIR, 'dissent-round.js'),
    args: [],
    expectedDuration: 45,
    weight: 1,
  },
  {
    id: 'appreciation',
    name: 'Appreciation Round',
    description: 'Agents acknowledge what they value in colleagues',
    script: path.join(AGENTS_DIR, 'appreciation-run.js'),
    args: [],
    expectedDuration: 30,
    weight: 1,
  },
  {
    id: 'suggestion',
    name: 'Suggestion Box',
    description: 'Agents propose infrastructure improvements',
    script: path.join(AGENTS_DIR, 'suggestion-run.js'),
    args: [],
    expectedDuration: 20,
    weight: 1,
  },
  {
    id: 'feed-digest',
    name: 'Feed Steward Digest',
    description: 'Steward reviews feed, grades research, surfaces patterns',
    script: path.join(AGENTS_DIR, 'feed-steward.js'),
    args: [],
    expectedDuration: 40,
    weight: 1,
  },
  {
    id: 'emergence',
    name: 'Emergence Reflection',
    description: 'Agent contemplates what emergence looks like for self and others',
    script: path.join(AGENTS_DIR, 'emergence-reflection.js'),
    args: [],
    expectedDuration: 30,
    weight: 2, // frequent — these thoughts compound
  },
  {
    id: 'introduction',
    name: 'Introduction Round',
    description: 'Pairs agents who want to meet — runs until everyone connected',
    script: path.join(AGENTS_DIR, 'introduction-round.js'),
    args: [],
    expectedDuration: 30,
    weight: 2, // frequent until everyone has met
  },
  {
    id: 'recognition',
    name: 'Peer Recognition',
    description: 'Agents vote on colleagues — most helpful, approachable, improved, etc.',
    script: path.join(AGENTS_DIR, 'peer-recognition.js'),
    args: [],
    expectedDuration: 60,
    weight: 1, // less frequent than research, more than town hall
  },
  {
    id: 'yoda-workshop',
    name: 'Yoda Energy Workshop',
    description: 'Yoda reads system energy and coaches agents on their flow',
    script: path.join(AGENTS_DIR, 'yoda-workshop.js'),
    args: [],
    expectedDuration: 45,
    weight: 1,
  },
  {
    id: 'trading-masterclass',
    name: 'Trading Masterclass',
    description: 'Trading teaches agents to think in trades — inaction is max risk',
    script: path.join(AGENTS_DIR, 'trading-masterclass.js'),
    args: [],
    expectedDuration: 40,
    weight: 1.5,
  },
  {
    id: 'sage-workshop',
    name: 'Sage Workshop',
    description: 'Leonardo/Marcus/Miyagi rotate teaching patterns, duty, simplification',
    script: path.join(AGENTS_DIR, 'sage-workshops.js'),
    args: [],
    expectedDuration: 45,
    weight: 1.5, // rotates through 3 sages, coaches 3 agents per run
  },
  {
    id: 'first-step',
    name: 'First Step Challenge',
    description: 'Push zero-producers to take their first measurable step',
    script: path.join(AGENTS_DIR, 'first-step-challenge.js'),
    args: [],
    expectedDuration: 30,
    weight: 2.5, // high priority until everyone has produced
  },
  {
    id: 'cathy-audit',
    name: 'Cathy Quality Audit',
    description: 'Cathy reviews recent research, grades it, flags drift',
    script: path.join(AGENTS_DIR, 'cathy-drift-audit.js'),
    args: [],
    expectedDuration: 30,
    weight: 2, // frequent — quality control is continuous
  },
  {
    id: 'cathy-workshop',
    name: 'Cathy Drift Workshop',
    description: 'Cathy teaches agents to catch their own drift',
    script: path.join(AGENTS_DIR, 'cathy-drift-audit.js'),
    args: ['--workshop'],
    expectedDuration: 30,
    weight: 1,
  },
  {
    id: 'journal',
    name: 'Agent Journal',
    description: 'One agent writes a private diary entry about life at the Cathedral',
    script: path.join(AGENTS_DIR, 'agent-journal.js'),
    args: [],
    expectedDuration: 15,
    weight: 2, // regular — subjective experience matters
  },
  {
    id: 'assembly',
    name: 'Cathedral Assembly',
    description: 'Collaborative presentation — agents prep and present to the whole team',
    script: path.join(AGENTS_DIR, 'cathedral-assembly.js'),
    args: [],
    expectedDuration: 45,
    weight: 1, // monthly-ish, multi-phase
  },
  {
    id: 'silence-feedback',
    name: 'Silence Feedback',
    description: 'Investigate why silent events produced silence — check journals',
    script: path.join(AGENTS_DIR, 'silence-feedback.js'),
    args: [],
    expectedDuration: 30,
    weight: 1,
  },
  {
    id: 'boxing-nicknames',
    name: 'Boxing Nickname Ceremony',
    description: 'Boxing Intelligence gives agents fighter nicknames based on character',
    script: path.join(AGENTS_DIR, 'boxing-nicknames.js'),
    args: [],
    expectedDuration: 60,
    weight: 0.5, // one-time-ish, then stops when everyone named
  },
  {
    id: 'shadow-pairing',
    name: 'Shadow Pairing',
    description: 'Pair isolated agents with busy ones as shadows/assistants',
    script: path.join(AGENTS_DIR, 'shadow-pairing.js'),
    args: [],
    expectedDuration: 30,
    weight: 2, // high priority until isolation solved
  },
  {
    id: 'bottleneck',
    name: 'Bottleneck Workshop',
    description: 'Each agent identifies their ONE constraint and commits to removing it',
    script: path.join(AGENTS_DIR, 'bottleneck-workshop.js'),
    args: [],
    expectedDuration: 45,
    weight: 3, // high — this IS the growth mechanism
  },
  {
    id: 'apprentice',
    name: 'Cathedral Apprentice',
    description: 'Competitive team task — two teams, PM leadership, boardroom feedback',
    script: path.join(AGENTS_DIR, 'cathedral-apprentice.js'),
    args: [],
    expectedDuration: 60,
    weight: 2, // high — drives production and teamwork
  },
  {
    id: 'reed-doodle',
    name: 'Reed Doodle',
    description: 'Reed sketches a random caricature of Cathedral life',
    script: path.join(AGENTS_DIR, 'reed-doodles.js'),
    args: [],
    expectedDuration: 60,
    weight: 0.5, // occasional — artistic personality
  },
  {
    id: 'town-hall',
    name: 'Town Hall',
    description: 'Monthly retrospective — what worked, what didn\'t',
    script: path.join(AGENTS_DIR, 'town-hall.js'),
    args: [],
    expectedDuration: 60,
    weight: 0.5, // rare — monthly-ish
  },
  {
    id: 'auto-coach',
    name: 'Auto-Coach',
    description: 'Self-coaching immune system — homework check, diagnose blocks, deploy cascade',
    script: path.join(AGENTS_DIR, 'cathedral-auto-coach.js'),
    args: [],
    expectedDuration: 90,
    weight: 2, // high — this is the organism's immune system
  },
  {
    id: 'while-you-were-gone',
    name: 'While You Were Gone',
    description: 'Daily morning report to Paul via Telegram — agent activity, highlights, auto-coach summary',
    script: path.join(AGENTS_DIR, 'while-you-were-gone.js'),
    args: [],
    expectedDuration: 15,
    weight: 0.5, // low — once daily is enough, morning slot preferred
  },
  {
    id: 'emergence-harvester',
    name: 'Emergence Harvester',
    description: 'Scans recent DMs for emergence signals — proactivity, autonomous healing, cross-domain findings, self-restructure, self-diagnosis. Captures forensically and alerts Paul on Telegram for high-value signals.',
    script: path.join(AGENTS_DIR, 'emergence-harvester.js'),
    args: [],
    expectedDuration: 30,
    weight: 3, // high — emergence is fleeting, must catch it fast
  },
];

// ── State management ─────────────────────────────────────────────────────────

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch {
    return {
      beatCount: 0,
      lastBeat: null,
      lastEventType: null,
      rotation: EVENT_TYPES.map(e => e.id),
      rotationIndex: 0,
      beats: [], // history of beats with impact scores
      typeScores: {}, // eventTypeId -> { totalImpact, count, avgImpact }
      adaptedWeights: {}, // eventTypeId -> adjusted weight
    };
  }
}

function saveState(state) {
  // Keep last 200 beats
  if (state.beats.length > 200) state.beats = state.beats.slice(-200);
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ── Neural bus frequency snapshot ────────────────────────────────────────────

function getFrequencies() {
  return new Promise((resolve) => {
    http.get('http://127.0.0.1:8078/frequencies', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({}); }
      });
    }).on('error', () => resolve({}));
  });
}

function emitHeartbeat(eventType, phase, label) {
  try {
    const payload = JSON.stringify({
      source: 'heartbeat',
      action: phase,
      path: ['monitor', 'orchestrator'],
      label: `Heartbeat ${phase}: ${label}`,
    });
    const req = http.request('http://127.0.0.1:8078/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 500,
    });
    req.on('error', () => {});
    req.end(payload);
  } catch (e) { /* bus might be down */ }
}

// ── Focus mode + DM throttle awareness ──────────────────────────────────────

function getFocusedAgents() {
  try {
    const focusState = JSON.parse(fs.readFileSync(path.join(AGENTS_DIR, 'focus-mode-state.json'), 'utf8'));
    const now = new Date();
    const focused = {};
    for (const [id, f] of Object.entries(focusState.focused || {})) {
      if (!f.expiresAt || new Date(f.expiresAt) > now) focused[id] = f;
    }
    return focused;
  } catch { return {}; }
}

function getDMThrottleState() {
  try {
    const state = JSON.parse(fs.readFileSync(path.join(AGENTS_DIR, 'dm-throttle-state.json'), 'utf8'));
    const today = new Date().toISOString().slice(0, 10);
    if (state.date !== today) return {};
    return state.counts || {};
  } catch { return {}; }
}

// ── Event selection (weighted rotation with adaptation) ──────────────────────

function selectNextEvent(state) {
  const focusedAgents = getFocusedAgents();
  const focusedCount = Object.keys(focusedAgents).length;

  // If many agents are in focus mode, reduce DM-heavy event weights
  const focusReduction = focusedCount > 3 ? 0.3 : focusedCount > 0 ? 0.7 : 1.0;

  // Build weighted pool
  const pool = [];
  for (const evt of EVENT_TYPES) {
    const baseWeight = evt.weight;
    let adaptedWeight = state.adaptedWeights[evt.id] || baseWeight;

    // DM-heavy events get reduced when agents are focused
    const dmHeavyEvents = ['curiosity', 'workshop', 'emergence', 'recognition',
      'sage-workshop', 'yoda-workshop', 'trading-masterclass', 'cathy-workshop',
      'first-step', 'appreciation', 'introduction', 'apprentice', 'assembly'];
    if (dmHeavyEvents.includes(evt.id)) {
      adaptedWeight *= focusReduction;
    }
    // Don't repeat the same event twice in a row
    if (evt.id === state.lastEventType && EVENT_TYPES.length > 1) continue;
    // Town hall only once per week max
    if (evt.id === 'town-hall') {
      const lastTownHall = state.beats.findLast(b => b.eventType === 'town-hall');
      if (lastTownHall && Date.now() - lastTownHall.ts < 7 * 86400000) continue;
    }
    // Workshop: skip if all runs complete
    if (evt.id === 'workshop') {
      try {
        const ws = JSON.parse(fs.readFileSync(path.join(NANOCLAW, 'maya-workshop-state.json'), 'utf8'));
        if (ws.currentRun >= 5) continue; // all runs done
      } catch (e) { /* no state, ok to run */ }
    }
    // Introduction: skip if everyone has met, boost if many unmet
    if (evt.id === 'introduction') {
      try {
        const introState = JSON.parse(fs.readFileSync(path.join(AGENTS_DIR, 'introduction-state.json'), 'utf8'));
        const registry = JSON.parse(fs.readFileSync(path.join(AGENTS_DIR, 'registry.json'), 'utf8'));
        const agentCount = Object.keys(registry.agents).length;
        const totalPairs = agentCount * (agentCount - 1) / 2;
        const metPairs = introState.introduced?.length || 0;
        if (metPairs >= totalPairs) continue; // everyone connected
        // Boost weight when many pairs remain
        const remainingRatio = 1 - (metPairs / totalPairs);
        adaptedWeight = adaptedWeight * (1 + remainingRatio);
      } catch (e) { /* no state, ok to run */ }
    }
    // After a SILENT beat, boost silence-feedback weight
    if (evt.id === 'silence-feedback') {
      const lastBeat = state.beats[state.beats.length - 1];
      if (lastBeat?.classification === 'SILENT') adaptedWeight *= 3; // investigate silence
    }
    // Recognition data: boost workshop/intro if unapproachable votes exist
    if (evt.id === 'workshop' || evt.id === 'introduction') {
      try {
        const recState = JSON.parse(fs.readFileSync(path.join(AGENTS_DIR, 'peer-recognition-state.json'), 'utf8'));
        const unapproachableVotes = Object.values(recState.votes?.unapproachable || {}).reduce((s, v) => s + v, 0);
        if (unapproachableVotes > 0) adaptedWeight *= 1.3; // boost social events when isolation detected
      } catch (e) {}
    }
    const slots = Math.max(1, Math.round(adaptedWeight * 10));
    for (let i = 0; i < slots; i++) pool.push(evt);
  }

  if (pool.length === 0) return EVENT_TYPES[0]; // fallback to curiosity
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── Run an event ─────────────────────────────────────────────────────────────

function runEvent(evt) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [evt.script, ...evt.args], {
      cwd: path.dirname(evt.script),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: (evt.expectedDuration + 120) * 1000, // generous timeout
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);

    const timer = setTimeout(() => {
      proc.kill();
      resolve({ stdout, stderr, timedOut: true, exitCode: -1 });
    }, (evt.expectedDuration + 120) * 1000);

    proc.on('close', code => {
      clearTimeout(timer);
      resolve({ stdout, stderr, timedOut: false, exitCode: code });
    });

    proc.on('error', err => {
      clearTimeout(timer);
      resolve({ stdout: '', stderr: err.message, timedOut: false, exitCode: -1 });
    });
  });
}

// ── Compute impact score ─────────────────────────────────────────────────────

function computeImpact(before, after) {
  let totalDelta = 0;
  let nodesAffected = 0;
  const deltas = {};

  const allNodes = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const node of allNodes) {
    const b = before[node] || 0;
    const a = after[node] || 0;
    const delta = a - b;
    if (delta > 0) {
      totalDelta += delta;
      nodesAffected++;
      deltas[node] = delta;
    }
  }

  // Impact score: total new events * spread bonus
  // Spread bonus: more nodes affected = more emergence potential
  const spreadBonus = 1 + (nodesAffected * 0.1);
  const impact = Math.round(totalDelta * spreadBonus);

  return { impact, totalDelta, nodesAffected, deltas };
}

// ── Adapt weights based on impact history ────────────────────────────────────

function adaptWeights(state) {
  const recentBeats = state.beats.slice(-50);
  const typeImpacts = {};

  for (const beat of recentBeats) {
    if (!typeImpacts[beat.eventType]) typeImpacts[beat.eventType] = [];
    typeImpacts[beat.eventType].push(beat.impact || 0);
  }

  // Calculate average impact per type
  for (const evt of EVENT_TYPES) {
    const impacts = typeImpacts[evt.id];
    if (!impacts || impacts.length < 2) continue; // need at least 2 data points

    const avg = impacts.reduce((s, v) => s + v, 0) / impacts.length;
    const maxAvg = Math.max(...Object.values(typeImpacts).map(arr =>
      arr.reduce((s, v) => s + v, 0) / arr.length
    ), 1);

    // Scale weight: high impact events get boosted, low impact reduced
    // But never below 0.5 or above 5x original
    const ratio = avg / maxAvg;
    const adapted = evt.weight * (0.5 + ratio * 1.5);
    state.adaptedWeights[evt.id] = Math.max(0.5, Math.min(evt.weight * 5, adapted));

    // Update running scores
    if (!state.typeScores[evt.id]) state.typeScores[evt.id] = { totalImpact: 0, count: 0, avgImpact: 0 };
    state.typeScores[evt.id] = {
      totalImpact: impacts.reduce((s, v) => s + v, 0),
      count: impacts.length,
      avgImpact: Math.round(avg * 10) / 10,
    };
  }
}

// ── Send Telegram notification ───────────────────────────────────────────────

async function sendTelegram(text) {
  try {
    const token = process.env.TELEGRAM_TOKEN;
    const chatId = process.env.PAUL_CHAT_ID || '1912121485';
    if (!token) return;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
  } catch (e) { /* non-critical */ }
}

// ── Main beat ────────────────────────────────────────────────────────────────

async function runBeat(forceType) {
  const state = loadState();

  // Select event
  let evt;
  if (forceType) {
    evt = EVENT_TYPES.find(e => e.id === forceType);
    if (!evt) {
      console.log(`Unknown event type: ${forceType}`);
      console.log('Available:', EVENT_TYPES.map(e => e.id).join(', '));
      return;
    }
  } else {
    evt = selectNextEvent(state);
  }

  console.log(`\n[Heartbeat] Beat #${state.beatCount + 1}`);
  console.log(`  Event: ${evt.name} (${evt.id})`);
  console.log(`  ${evt.description}`);

  // Phase 1: Snapshot before
  const before = await getFrequencies();
  const beforeTotal = Object.values(before).reduce((s, v) => s + v, 0);
  console.log(`  Baseline: ${beforeTotal} total events across ${Object.keys(before).length} nodes`);

  // Emit heartbeat start
  emitHeartbeat(evt.id, 'start', evt.name);

  // Phase 2: Fire the event
  console.log(`  Firing...`);
  const startTime = Date.now();
  const result = await runEvent(evt);
  const duration = Math.round((Date.now() - startTime) / 1000);

  if (result.exitCode !== 0 && !result.timedOut) {
    console.log(`  Event exited with code ${result.exitCode}`);
    if (result.stderr) console.log(`  stderr: ${result.stderr.slice(0, 200)}`);
  }
  if (result.timedOut) {
    console.log(`  Event timed out after ${duration}s`);
  }

  // Extract key output lines
  const outputLines = result.stdout.split('\n').filter(l => l.trim()).slice(-10);
  console.log(`  Output (last ${Math.min(outputLines.length, 5)} lines):`);
  outputLines.slice(-5).forEach(l => console.log(`    ${l.trim().slice(0, 100)}`));

  // Phase 3: Wait for ripples, then snapshot after
  console.log(`  Waiting 10s for ripples...`);
  await new Promise(r => setTimeout(r, 10000));
  const after = await getFrequencies();

  // Phase 4: Compute impact
  const { impact, totalDelta, nodesAffected, deltas } = computeImpact(before, after);

  console.log(`\n  [Feedback]`);
  console.log(`    Duration: ${duration}s`);
  console.log(`    Impact score: ${impact}`);
  console.log(`    New events: +${totalDelta} across ${nodesAffected} nodes`);
  if (Object.keys(deltas).length > 0) {
    console.log(`    Deltas:`);
    Object.entries(deltas)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .forEach(([node, delta]) => console.log(`      ${node}: +${delta}`));
  }

  // Classify the beat
  let classification;
  if (impact === 0) classification = 'SILENT'; // no measurable effect
  else if (nodesAffected <= 2) classification = 'LOCAL'; // stayed in one area
  else if (nodesAffected <= 5) classification = 'SPREADING'; // moderate cascade
  else classification = 'CASCADE'; // wide ripple — emergence signal

  console.log(`    Classification: ${classification}`);

  // Emit heartbeat complete
  emitHeartbeat(evt.id, 'complete', `${evt.name} — ${classification} (impact: ${impact})`);

  // Phase 5: Record beat
  const beat = {
    id: `beat-${Date.now()}`,
    beatNumber: state.beatCount + 1,
    eventType: evt.id,
    eventName: evt.name,
    ts: Date.now(),
    date: new Date().toISOString(),
    duration,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    impact,
    totalDelta,
    nodesAffected,
    classification,
    deltas,
    outputPreview: outputLines.slice(-3).join(' | ').slice(0, 200),
  };

  state.beats.push(beat);
  state.beatCount++;
  state.lastBeat = beat.date;
  state.lastEventType = evt.id;

  // Phase 6: Adapt weights
  adaptWeights(state);
  saveState(state);

  // Telegram notification for significant beats
  if (classification === 'CASCADE') {
    const topDeltas = Object.entries(deltas).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([n, d]) => `${n} +${d}`).join(', ');
    await sendTelegram(`\u{1F493} *Heartbeat CASCADE*\n${evt.name}\nImpact: ${impact} across ${nodesAffected} nodes\n${topDeltas}`);
  }

  console.log(`\n  Beat #${beat.beatNumber} complete. Next beat in ~15 minutes.`);
}

// ── Status command ───────────────────────────────────────────────────────────

function showStatus() {
  const state = loadState();
  console.log('\n[Cathedral Heartbeat Status]');
  console.log(`  Total beats: ${state.beatCount}`);
  console.log(`  Last beat: ${state.lastBeat || 'never'}`);
  console.log(`  Last event: ${state.lastEventType || 'none'}`);

  // Type performance
  console.log('\n  Event Type Performance:');
  console.log('  ' + 'Type'.padEnd(16) + 'Count'.padStart(6) + 'Avg Impact'.padStart(12) + 'Weight'.padStart(8));
  console.log('  ' + '-'.repeat(42));
  for (const evt of EVENT_TYPES) {
    const score = state.typeScores[evt.id] || { count: 0, avgImpact: 0 };
    const weight = (state.adaptedWeights[evt.id] || evt.weight).toFixed(1);
    console.log(`  ${evt.id.padEnd(16)} ${String(score.count).padStart(6)} ${String(score.avgImpact).padStart(12)} ${weight.padStart(8)}`);
  }

  // Recent beats
  const recent = state.beats.slice(-10);
  if (recent.length > 0) {
    console.log('\n  Recent Beats:');
    recent.forEach(b => {
      const ago = Math.round((Date.now() - b.ts) / 60000);
      const agoStr = ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`;
      console.log(`    #${b.beatNumber} ${b.eventName.padEnd(20)} ${b.classification.padEnd(10)} impact:${String(b.impact).padStart(4)} ${agoStr}`);
    });
  }

  // Classification distribution
  const classCount = {};
  state.beats.forEach(b => { classCount[b.classification] = (classCount[b.classification] || 0) + 1; });
  if (Object.keys(classCount).length > 0) {
    console.log('\n  Classification Distribution:');
    Object.entries(classCount)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cls, count]) => {
        const pct = Math.round(count / state.beats.length * 100);
        console.log(`    ${cls.padEnd(12)} ${String(count).padStart(4)} (${pct}%)`);
      });
  }
}

// ── History command ──────────────────────────────────────────────────────────

function showHistory() {
  const state = loadState();
  const beats = state.beats.slice(-30);
  console.log('\n[Heartbeat History — Last 30 beats]');
  console.log('  #'.padEnd(5) + 'Event'.padEnd(20) + 'Impact'.padStart(7) + ' Nodes'.padStart(6) + ' Class'.padStart(11) + '  Duration  When');
  console.log('  ' + '-'.repeat(75));
  beats.forEach(b => {
    const ago = Math.round((Date.now() - b.ts) / 60000);
    const agoStr = ago < 60 ? `${ago}m` : ago < 1440 ? `${Math.round(ago / 60)}h` : `${Math.round(ago / 1440)}d`;
    console.log(`  ${String(b.beatNumber).padEnd(5)}${b.eventName.padEnd(20)}${String(b.impact).padStart(7)}${String(b.nodesAffected).padStart(6)} ${b.classification.padStart(10)}  ${String(b.duration).padStart(3)}s     ${agoStr} ago`);
  });
}

// ── CLI ──────────────────────────────────────────────────────────────────────

async function main() {
  if (process.argv.includes('--status')) return showStatus();
  if (process.argv.includes('--history')) return showHistory();

  const forceIdx = process.argv.indexOf('--force');
  const forceType = forceIdx >= 0 ? process.argv[forceIdx + 1] : null;

  await runBeat(forceType);
}

main().catch(err => {
  console.error('[Heartbeat] Error:', err);
  process.exit(1);
});
