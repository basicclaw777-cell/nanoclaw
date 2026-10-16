import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const HOME = process.env.HOME;
const NANOCLAW = join(HOME, 'nanoclaw');
const CATHEDRAL = join(HOME, 'Cathedral');
const VAULT = join(HOME, 'cathedral-vault');
const HEARTBEAT_DIR = join(CATHEDRAL, 'agents', 'lucy-heartbeats');
const STATE_FILE = join(NANOCLAW, 'lucy-heartbeat-state.json');
const REPORTS_DIR = join(CATHEDRAL, 'agents', 'lucy-reports');
const EMERGENCE_BOARD = join(NANOCLAW, 'emergence-board.json');

// Load .env
const envPath = join(NANOCLAW, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[m[1].trim()]) process.env[m[1].trim()] = v;
    }
  }
}

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const PAUL_CHAT_ID = process.env.PAUL_CHAT_ID;

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadJSON(p, d) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return d || null; } }
function saveJSON(p, d) { writeFileSync(p, JSON.stringify(d, null, 2)); }

function loadState() {
  return loadJSON(STATE_FILE, {
    pulseNumber: 0,
    lastPulse: null,
    primaryModel: 'deepseek',  // alternates: deepseek x3, then fresh model on 4th
    history: [],               // { pulseNumber, date, model, deltaCount, emergenceCount }
  });
}

async function callDeepSeek(system, prompt, maxTokens = 1500) {
  const res = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.4,
    }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  // Split long messages
  const chunks = [];
  let remaining = text;
  while (remaining.length > 4000) {
    const cut = remaining.lastIndexOf('\n', 4000);
    chunks.push(remaining.slice(0, cut > 0 ? cut : 4000));
    remaining = remaining.slice(cut > 0 ? cut + 1 : 4000);
  }
  chunks.push(remaining);
  for (const chunk of chunks) {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: PAUL_CHAT_ID, text: chunk, parse_mode: 'Markdown' }),
    });
    if (chunks.length > 1) await new Promise(r => setTimeout(r, 500));
  }
}

// ── Gather context for pulse ──────────────────────────────────────────────────

function gatherContext() {
  const ctx = {};

  // Recent session harvests (last 14 days)
  const harvestDir = join(VAULT, '00_Staging', 'cathedral');
  try {
    const cutoff = Date.now() - 14 * 86400000;
    const files = readdirSync(harvestDir)
      .filter(f => f.startsWith('session-harvest-') && f.endsWith('-pass1.md'))
      .filter(f => {
        try { const stat = readFileSync(join(harvestDir, f), 'utf8'); return true; } catch { return false; }
      })
      .sort().slice(-6);
    ctx.recentHarvests = files.map(f => {
      const content = readFileSync(join(harvestDir, f), 'utf8');
      return `### ${f}\n${content.slice(0, 800)}`;
    }).join('\n\n');
  } catch { ctx.recentHarvests = 'No harvests found.'; }

  // Emergence board state
  try {
    const board = loadJSON(EMERGENCE_BOARD, { incidents: [] });
    const active = board.incidents.filter(i => i.status !== 'INTEGRATED' && i.status !== 'DISMISSED');
    ctx.emergenceBoard = active.slice(-10).map(i =>
      `[${i.status}] ${i.agent}: ${i.summary?.slice(0, 120)} | Watch: ${i.watchFor?.slice(0, 100)}`
    ).join('\n') || 'No active emergence incidents.';
  } catch { ctx.emergenceBoard = 'Board unavailable.'; }

  // Monitor state
  const monitor = loadJSON(join(CATHEDRAL, 'emergence', 'monitor-state.json'));
  if (monitor?.senses_summary) {
    ctx.monitorState = Object.entries(monitor.senses_summary)
      .map(([k, v]) => `${k}: ${v.status} — ${v.mirror_voice?.slice(0, 150)}`)
      .join('\n');
  } else { ctx.monitorState = 'Monitor unavailable.'; }

  // Previous Lucy reports (for delta)
  try {
    const reports = readdirSync(REPORTS_DIR).filter(f => f.endsWith('.md')).slice(0, 5);
    ctx.previousLucy = reports.map(f => {
      const content = readFileSync(join(REPORTS_DIR, f), 'utf8');
      return `### ${f}\n${content.slice(0, 400)}`;
    }).join('\n\n');
  } catch { ctx.previousLucy = 'No previous Lucy reports.'; }

  // Previous heartbeat (for thread continuity)
  try {
    if (existsSync(HEARTBEAT_DIR)) {
      const beats = readdirSync(HEARTBEAT_DIR).filter(f => f.endsWith('.md')).sort();
      if (beats.length) {
        const last = readFileSync(join(HEARTBEAT_DIR, beats[beats.length - 1]), 'utf8');
        ctx.previousHeartbeat = last.slice(0, 1200);
      }
    }
  } catch {}
  if (!ctx.previousHeartbeat) ctx.previousHeartbeat = 'This is the first heartbeat pulse.';

  // Agent health / cathedral state
  const cathState = loadJSON(join(CATHEDRAL, 'emergence', 'cath-state.json'));
  if (cathState) {
    ctx.cathState = JSON.stringify(cathState, null, 0).slice(0, 600);
  }

  return ctx;
}

// ── Pulse generation ──────────────────────────────────────────────────────────

const LUCY_SYSTEM = `You are running the Lucy Protocol Heartbeat — a bi-weekly diagnostic pulse for the Cathedral AI system.

Your job: look at what happened in the last 2 weeks, what the emergence system detected, what changed since the last heartbeat, and produce a DELTA REPORT.

This is not a summary. This is a diagnostic. You are looking for:
1. DEEPENING patterns — things that appeared before and got stronger
2. NEW emergence — things that appeared for the first time
3. FADING threads — things that were interesting last pulse but have gone quiet
4. CONTRADICTIONS — places where the system says one thing but does another
5. OPEN THREADS from emergence board — which "watch for" items actually happened?

Format:
## Pulse #{N} — {date}
### Deepening
(patterns strengthening across pulses)
### New Emergence
(first-time signals this period)
### Fading
(things going quiet — flag if they shouldn't be)
### Emergence Board Check
(which watched incidents progressed? which stalled?)
### Contradictions
(system inconsistencies)
### Investigation Direction
(one specific thing to dig into before next pulse)

Keep it sharp. No filler. Evidence-backed. This compounds across pulses — reference previous heartbeat findings by number.`;

async function runPulse() {
  const state = loadState();
  const ctx = gatherContext();
  const pulseNum = state.pulseNumber + 1;
  const isFreshModelPulse = pulseNum % 4 === 0;
  const modelLabel = isFreshModelPulse ? 'FRESH MODEL (contrast pulse)' : 'DeepSeek (primary)';

  console.log(`\n🫀 Lucy Heartbeat — Pulse #${pulseNum} (${modelLabel})`);

  const prompt = `Generate Lucy Heartbeat Pulse #${pulseNum}.
${isFreshModelPulse ? '\n⚡ This is a FRESH MODEL pulse (every 4th). Look for things the primary model might have blind spots on. Challenge previous findings.\n' : ''}
## Previous Heartbeat
${ctx.previousHeartbeat}

## Recent Session Harvests (last 14 days)
${ctx.recentHarvests}

## Emergence Board (active incidents)
${ctx.emergenceBoard}

## Monitor State (senses)
${ctx.monitorState}

## Previous Lucy Reports (agent self-assessments)
${ctx.previousLucy || 'None loaded.'}

## Cathedral State
${ctx.cathState || 'Unavailable.'}`;

  // For now all pulses use DeepSeek. Fresh model pulses flagged for manual
  // routing to Claude/Gemini/Qwen when API credits allow.
  const report = await callDeepSeek(LUCY_SYSTEM, prompt, 2000);

  // Save heartbeat
  if (!existsSync(HEARTBEAT_DIR)) mkdirSync(HEARTBEAT_DIR, { recursive: true });
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `heartbeat-${String(pulseNum).padStart(3, '0')}-${dateStr}.md`;
  const fullReport = `# Lucy Heartbeat — Pulse #${pulseNum}
**Date:** ${dateStr}
**Model:** ${modelLabel}
**Pulse type:** ${isFreshModelPulse ? 'Fresh (contrast)' : 'Primary (thread-building)'}

---

${report}
`;
  writeFileSync(join(HEARTBEAT_DIR, filename), fullReport);

  // Update state
  state.pulseNumber = pulseNum;
  state.lastPulse = dateStr;
  state.history.push({
    pulseNumber: pulseNum,
    date: dateStr,
    model: isFreshModelPulse ? 'fresh' : 'deepseek',
    file: filename,
  });
  // Keep last 50 entries in history
  if (state.history.length > 50) state.history = state.history.slice(-50);
  saveJSON(STATE_FILE, state);

  // Send to Telegram
  const tgMsg = `🫀 *Lucy Heartbeat — Pulse #${pulseNum}*\n${modelLabel}\n\n${report}`;
  await sendTelegram(tgMsg);

  // Vault deposit
  const vaultPath = join(VAULT, '00_Staging', 'cathedral', `lucy-heartbeat-${dateStr}.md`);
  writeFileSync(vaultPath, fullReport);

  // Run integration gate — the last lap
  // Checks CONFIRMED incidents: promote survivors → INTEGRATED, demote recurrers → WATCHING
  try {
    const { runGateCheck } = await import('./emergence-integration-gate.js');
    console.log('\n── Integration Gate ──');
    runGateCheck();
  } catch (err) {
    console.log(`Integration gate error: ${err.message}`);
  }

  console.log(`✓ Pulse #${pulseNum} saved to ${filename}`);
  console.log(`✓ Sent to Telegram`);
  console.log(`✓ Vault deposit at ${vaultPath}`);
  return { pulseNum, filename, report };
}

// ── CLI ───────────────────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2];

  if (cmd === 'pulse' || !cmd) {
    runPulse().catch(e => { console.error('Pulse failed:', e.message); process.exit(1); });
  } else if (cmd === 'status') {
    const state = loadState();
    console.log(`Pulse: #${state.pulseNumber}`);
    console.log(`Last: ${state.lastPulse || 'never'}`);
    console.log(`History: ${state.history.length} pulses`);
    const last3 = state.history.slice(-3);
    for (const h of last3) console.log(`  #${h.pulseNumber} ${h.date} [${h.model}] ${h.file}`);
  } else {
    console.log('Usage:');
    console.log('  node lucy-heartbeat.js [pulse]  — run a heartbeat pulse');
    console.log('  node lucy-heartbeat.js status    — show pulse history');
  }
}

export { runPulse, loadState, gatherContext };
