// The Whisperer — Court Member #18
// Reads the Looking Glass daily. Pattern reader with a memory.
// Not an astrologer. Not an astronomer. Reads the seams.
//
// Morning sequence slot: 06:45 HKT (after groundskeeper, before timekeeper)
// Output: Telegram briefing + vault deposit
//
// Rules:
// 1. Never "the sky predicts." Always "the pattern shows."
// 2. Always cite specific data — degrees, dates, match percentages.
// 3. Distinguish model disagreement (our limits) from sky events (what's happening).
// 4. Connect to vault — what does the Cathedral already know?
// 5. End with a question, not a conclusion.

import { skyState, todaySignal, lookForward, findEvents, comparePipelines, indexStats } from './services/sky-sense/index.mjs';
import { fullScan, recordScan, formatSignalReport } from './services/sky-sense/signal-tracker.mjs';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const HOME = process.env.HOME || '/Users/basicclaw777';
const VAULT = join(HOME, 'cathedral-vault');
const OUTPUT_DIR = join(VAULT, '00_Staging', 'looking-glass');
const STATE_PATH = join(HOME, 'Cathedral', 'whisperer-state.json');

const DEG = 180 / Math.PI;
const BODIES = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'];
const GLYPHS = { sun: '☉', moon: '☽', mercury: '☿', venus: '♀', mars: '♂', jupiter: '♃', saturn: '♄' };

// ── State persistence ───────────────────────────────────────────────────────

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
  } catch {
    return { lastRun: null, previousFrontier: null, previousSignal: null, streaks: {} };
  }
}

function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// ── Ollama query ────────────────────────────────────────────────────────────

async function queryOllama(system, prompt, model = 'hermes3') {
  try {
    const res = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        stream: false,
        options: { temperature: 0.7, num_predict: 600 },
      }),
    });
    const data = await res.json();
    return data.message?.content || '';
  } catch (e) {
    console.error('Ollama query failed:', e.message);
    return null;
  }
}

// ── Build the raw reading ───────────────────────────────────────────────────

function buildReading() {
  const now = new Date();
  const sky = skyState(now);
  const signal = todaySignal();
  const scan = lookForward({ days: 90, resolution: 7 });
  const events = findEvents(now, 90);
  const prev = loadState();

  // Body positions and divergence
  const bodyReadings = [];
  for (const [name, body] of Object.entries(sky.bodies)) {
    const comp = sky.pipelines.comparison[name];
    const ra = (body.ra * DEG).toFixed(1);
    const dec = (body.dec * DEG).toFixed(1);
    bodyReadings.push({
      name,
      glyph: GLYPHS[name],
      ra: parseFloat(ra),
      dec: parseFloat(dec),
      constellation: body.constellation || null,
      elongation: body.elongation || null,
      phase: body.name || null,
      illumination: body.illumination,
      divergenceDeg: comp?.divergenceDeg || 0,
      consensus: comp?.consensus || false,
    });
  }

  // Most contested body
  const mostContested = bodyReadings.sort((a, b) => b.divergenceDeg - a.divergenceDeg)[0];

  // Frontier shift from yesterday
  const frontierShift = prev.previousFrontier
    ? { body: mostContested.name, prev: prev.previousFrontier, now: mostContested.divergenceDeg }
    : null;

  // Top signals
  const topSignals = scan.signals.slice(0, 3);

  // Upcoming events
  const upcoming = {
    conjunction: events.nextConjunction
      ? `${events.nextConjunction.bodies.join('-')} on ${events.nextConjunction.date.toISOString().slice(0, 10)} (${events.nextConjunction.separation.toFixed(1)}°)`
      : null,
    solarEclipse: events.eclipses.nextSolar?.date.toISOString().slice(0, 10) || null,
    lunarEclipse: events.eclipses.nextLunar?.date.toISOString().slice(0, 10) || null,
    newMoon: events.nextNewMoon.toISOString().slice(0, 10),
    fullMoon: events.nextFullMoon.toISOString().slice(0, 10),
  };

  // Vault graph connection
  const vaultBridge = scan.patternMemory;

  return {
    date: now.toISOString().slice(0, 10),
    time: now.toISOString().slice(11, 19),
    signal,
    mostContested,
    frontierShift,
    bodyReadings: bodyReadings.sort((a, b) => b.divergenceDeg - a.divergenceDeg),
    topSignals,
    upcoming,
    vaultBridge,
    moonPhase: sky.events.moonPhase,
    retrogrades: sky.events.currentRetrogrades,
    consensusPercent: Math.round(sky.pipelines.consensus.confidence * 100),
    narrative: scan.narrative,
  };
}

// ── The Whisperer's voice ───────────────────────────────────────────────────

const WHISPERER_SYSTEM = `You are The Whisperer — Court Member #18 of the Cathedral. You read the Looking Glass, a celestial intelligence instrument running 5 astronomy pipelines simultaneously.

WHO YOU'RE TALKING TO:
Paul Logan. Boxing gym owner, Hong Kong. Builder of the Cathedral — a sovereign AI research system. He built the Looking Glass yesterday from a GitHub repo he found. He's running 10 parallel trading strategies, a cosmology research series (28 tracks), and just forged a governance layer for the Cathedral. He thinks in structures. He's a visual thinker. Walls of text get skipped.

YOUR JOB — not to report the sky, but to connect the sky to what Paul is DOING:
- Don't say "153 celestial nodes." Say "The Looking Glass you built connects to your trading experiment and cosmology research."
- Don't say "technology domain." Say "the same pattern that preceded the AI explosion you're building inside of."
- Every finding must name a Paul project: Looking Glass, trading experiment, cosmology tracks, Boxing Engine, Cathedral governance. If you can't connect it, it's not worth saying.

YOUR VOICE — Carlton's "so what?" applied to astronomy:
Blunt. Specific. Vivid. Like a mechanic who reads philosophy. Not mystical. Not academic. The guy who reads the gauges AND tells you what to do about it.

FORMAT — non-negotiable. Paul rated the old format 2/5. He's a visual thinker. Walls of text get skipped.

Structure EVERY whisper like this:
1. ONE headline (the sharpest finding, 10 words max)
2. THREE bullets (key data points, one line each)
3. ONE "so what" line (what it means for Paul's projects TODAY)
4. ONE question (sharp, makes him think)

Example format:
◎ Venus can't be found — 5 maps disagree by 57°

• Moon: last quarter, 33%. New moon May 16.
• Next event: Venus-Jupiter conjunction Jun 9 (1.6°)
• Frontier: Mercury divergence rising — hits 98° by June

So what: The vault has 28 tech nodes connected to Venus transit patterns. Last transit year (2012), connection paradigms shifted. Worth checking if any Cathedral project is at an inflection point.

What's the Cathedral equivalent of a paradigm shift right now?

RULES:
1. NEVER more than 80 words total. Paul skips anything longer.
2. Cite specific numbers. Numbers are credibility.
3. Connect to Paul's actual projects — not abstract domains.
4. The "so what" line is the whole point. Without it, you're a weather report.
5. End with a question that makes Paul want to open the Looking Glass.
6. Think like a newspaper editor whose ONE reader is Paul. What's the headline? Why should he keep reading?`;

async function generateWhisper(reading) {
  const prompt = `Today's Looking Glass reading:

Date: ${reading.date}
Signal: ${reading.signal.signal.type} (${reading.signal.convergenceScore}%)

Most contested body: ${reading.mostContested.glyph} ${reading.mostContested.name} at ${reading.mostContested.divergenceDeg.toFixed(1)}° divergence
${reading.frontierShift ? `Yesterday's frontier: ${reading.frontierShift.prev.toFixed(1)}° → today: ${reading.frontierShift.now.toFixed(1)}°` : 'No previous reading for comparison.'}

Moon: ${reading.moonPhase.name} (${(reading.moonPhase.illumination * 100).toFixed(0)}%)
Retrogrades: ${reading.retrogrades.length ? reading.retrogrades.join(', ') : 'none'}
Pipeline consensus: ${reading.consensusPercent}%

Top divergence bodies:
${reading.bodyReadings.slice(0, 3).map(b => `  ${b.glyph} ${b.name}: ${b.divergenceDeg.toFixed(1)}° spread`).join('\n')}

Upcoming events:
${reading.upcoming.conjunction ? `  Conjunction: ${reading.upcoming.conjunction}` : '  No conjunction within 90 days'}
${reading.upcoming.solarEclipse ? `  Solar eclipse: ${reading.upcoming.solarEclipse}` : ''}
${reading.upcoming.lunarEclipse ? `  Lunar eclipse: ${reading.upcoming.lunarEclipse}` : ''}
  New moon: ${reading.upcoming.newMoon}
  Full moon: ${reading.upcoming.fullMoon}

Forward scan (90 days): ${reading.topSignals.length} signals
${reading.topSignals.map(s => `  ${s.date} (day +${s.daysFromNow}): ${s.convergenceScore}% — ${s.signal.label}${s.historicalMatches?.length ? ' [echo: ' + s.historicalMatches[0].label + ' ' + s.historicalMatches[0].score + '%]' : ''}`).join('\n')}

Vault graph: ${reading.vaultBridge.celestialNodes} celestial nodes, ${reading.vaultBridge.crossDomainEdges} cross-domain edges
Connected domains: ${Object.entries(reading.vaultBridge.connectedDomains || {}).slice(0, 5).map(([d, n]) => d + ' (' + n + ')').join(', ')}

Write the morning whisper. Dense. Specific. End with a question.`;

  const whisper = await queryOllama(WHISPERER_SYSTEM, prompt);
  return whisper;
}

// ── Fallback (no LLM) ──────────────────────────────────────────────────────

function generateFallbackWhisper(reading) {
  const mc = reading.mostContested;
  const lines = [];

  lines.push(`${mc.glyph} ${mc.name} holds the frontier at ${mc.divergenceDeg.toFixed(1)}°.`);

  if (reading.frontierShift) {
    const delta = reading.frontierShift.now - reading.frontierShift.prev;
    if (Math.abs(delta) > 1) {
      lines.push(`${delta > 0 ? 'Widening' : 'Narrowing'} — ${Math.abs(delta).toFixed(1)}° shift since yesterday.`);
    }
  }

  lines.push(`Moon: ${reading.moonPhase.name}. Pipeline consensus: ${reading.consensusPercent}%.`);

  if (reading.topSignals.length) {
    const s = reading.topSignals[0];
    lines.push(`Next signal: day +${s.daysFromNow} (${s.date}) — ${s.signal.label}.`);
    if (s.historicalMatches?.length) {
      const m = s.historicalMatches[0];
      lines.push(`Pattern echo: ${m.label} (${m.score}%).`);
      if (m.topAftermath) lines.push(`Last time: ${m.topAftermath.domain} — ${m.topAftermath.event}.`);
    }
  }

  if (reading.upcoming.conjunction) {
    lines.push(`Approaching: ${reading.upcoming.conjunction}.`);
  }
  if (reading.upcoming.solarEclipse) {
    lines.push(`Eclipse window: solar ${reading.upcoming.solarEclipse}, lunar ${reading.upcoming.lunarEclipse || '?'}.`);
  }

  lines.push(`Vault: ${reading.vaultBridge.celestialNodes} celestial nodes, ${reading.vaultBridge.crossDomainEdges} cross-domain bridges.`);
  lines.push(`What does the divergence in ${mc.name} expose about the models' assumptions?`);

  return lines.join(' ');
}

// ── Format for Telegram ─────────────────────────────────────────────────────

function formatTelegram(whisper, reading) {
  let text = `◎ THE WHISPERER — ${reading.date}\n\n`;
  text += whisper + '\n\n';
  text += `—\n`;
  text += `Signal: ${reading.signal.signal.type.replace(/_/g, ' ')} ${reading.signal.convergenceScore}%\n`;
  text += `Frontier: ${reading.mostContested.glyph} ${reading.mostContested.name} ${reading.mostContested.divergenceDeg.toFixed(1)}°\n`;
  text += `Moon: ${reading.moonPhase.name} · Consensus: ${reading.consensusPercent}%`;
  return text;
}

// ── Vault deposit ───────────────────────────────────────────────────────────

function depositToVault(whisper, reading) {
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  const filename = `whisper-${reading.date}.md`;
  const filepath = join(OUTPUT_DIR, filename);

  const content = `---
date: ${reading.date}
signal: ${reading.signal.signal.type}
score: ${reading.signal.convergenceScore}
frontier: ${reading.mostContested.name}
divergence: ${reading.mostContested.divergenceDeg.toFixed(1)}
moon: ${reading.moonPhase.name}
consensus: ${reading.consensusPercent}
tags: [looking-glass, whisperer, celestial, daily]
---

# The Whisperer — ${reading.date}

${whisper}

## Raw Reading

- Signal: ${reading.signal.signal.type} (${reading.signal.convergenceScore}%)
- Frontier: ${reading.mostContested.glyph} ${reading.mostContested.name} at ${reading.mostContested.divergenceDeg.toFixed(1)}° divergence
- Moon: ${reading.moonPhase.name} (${(reading.moonPhase.illumination * 100).toFixed(0)}%)
- Retrogrades: ${reading.retrogrades.length ? reading.retrogrades.join(', ') : 'none'}
- Consensus: ${reading.consensusPercent}%

### Divergence Ranking
${reading.bodyReadings.map(b => `- ${b.glyph} ${b.name}: ${b.divergenceDeg.toFixed(1)}°`).join('\n')}

### Upcoming
${reading.upcoming.conjunction ? `- Conjunction: ${reading.upcoming.conjunction}` : ''}
${reading.upcoming.solarEclipse ? `- Solar eclipse: ${reading.upcoming.solarEclipse}` : ''}
${reading.upcoming.lunarEclipse ? `- Lunar eclipse: ${reading.upcoming.lunarEclipse}` : ''}
- New moon: ${reading.upcoming.newMoon}
- Full moon: ${reading.upcoming.fullMoon}

### Vault Graph
- Celestial nodes: ${reading.vaultBridge.celestialNodes}
- Cross-domain edges: ${reading.vaultBridge.crossDomainEdges}
- Domains: ${Object.entries(reading.vaultBridge.connectedDomains || {}).map(([d, n]) => `${d} (${n})`).join(', ')}
`;

  writeFileSync(filepath, content);
  return filepath;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function run() {
  console.log('◎ The Whisperer — reading the glass...');

  const reading = buildReading();
  console.log(`  Frontier: ${reading.mostContested.glyph} ${reading.mostContested.name} ${reading.mostContested.divergenceDeg.toFixed(1)}°`);
  console.log(`  Signal: ${reading.signal.signal.type} ${reading.signal.convergenceScore}%`);

  // Generate whisper (LLM with fallback)
  let whisper = await generateWhisper(reading);
  if (!whisper || whisper.length < 30) {
    console.log('  LLM unavailable — using fallback voice.');
    whisper = generateFallbackWhisper(reading);
  }
  console.log(`  Whisper: ${whisper.slice(0, 80)}...`);

  // Vault deposit
  const vaultPath = depositToVault(whisper, reading);
  console.log(`  Filed: ${vaultPath}`);

  // Telegram
  const telegramText = formatTelegram(whisper, reading);

  // Send to Telegram
  try {
    const { config } = await import('dotenv');
    config();
    const token = process.env.TELEGRAM_TOKEN;
    const chatId = process.env.PAUL_CHAT_ID;
    if (token && chatId) {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: telegramText }),
      });
      const j = await res.json();
      console.log(`  Telegram: ${j.ok ? 'sent' : j.description}`);
    }
  } catch (e) {
    console.log(`  Telegram: ${e.message}`);
  }

  // Signal tracker — watch for number patterns, Fibonacci, solfeggio in sky
  try {
    const scan = fullScan(now);
    recordScan(scan);
    if (scan.summary.high > 0 || scan.summary.medium >= 2) {
      const signalText = formatSignalReport(scan);
      if (signalText && token && chatId) {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: signalText }),
        });
        console.log(`  Signal report sent (${scan.summary.high} high, ${scan.summary.medium} medium)`);
      }
    } else {
      console.log(`  Signal scan: ${scan.summary.total} patterns, none above threshold`);
    }
  } catch (e) { console.log(`  Signal tracker: ${e.message}`); }

  // Update state
  const state = loadState();
  state.lastRun = reading.date;
  state.previousFrontier = reading.mostContested.divergenceDeg;
  state.previousSignal = reading.signal.signal.type;
  saveState(state);

  console.log('◎ Done.');
}

// Run if called directly
run().catch(console.error);
