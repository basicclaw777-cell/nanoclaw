/**
 * synapse-pulse.js — The Synapse's 4-hour pulse.
 *
 * Gathers full Cathedral state, synthesizes cross-domain patterns,
 * speaks only when it sees something worth saying.
 *
 * PM2 cron: every 4 hours
 * Output: Telegram + compound/pulses/ archive
 *
 * ESM.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NANOCLAW = path.join(__dirname, '..');
dotenv.config({ path: path.join(NANOCLAW, '.env') });

const PULSE_DIR = path.join(__dirname, 'pulses');
const BOT_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.PAUL_CHAT_ID;
const OPENROUTER_KEY = process.env.OPENROUTER_KEY;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;

// Gather state
function gatherState() {
  try {
    execSync('node gather-state.cjs', { cwd: NANOCLAW, timeout: 30000 });
    return JSON.parse(fs.readFileSync('/tmp/cathedral-state.json', 'utf8'));
  } catch(e) {
    console.error('[synapse] State gather failed:', e.message);
    return null;
  }
}

// Load previous pulse for continuity
function loadLastPulse() {
  try {
    if (!fs.existsSync(PULSE_DIR)) return null;
    const files = fs.readdirSync(PULSE_DIR).filter(f => f.endsWith('.md')).sort().reverse();
    if (files.length === 0) return null;
    return fs.readFileSync(path.join(PULSE_DIR, files[0]), 'utf8');
  } catch(e) { return null; }
}

// Trim state for context window — aggressive, keep only signal
function trimState(state) {
  // Compact GitHub to just symbol: days_since_commit
  const gh = {};
  for (const [sym, d] of Object.entries(state.deep_signals?.github || {})) {
    gh[sym] = d.days_since_commit;
  }
  // Compact options to just P/C ratios
  const opts = {};
  for (const [sym, d] of Object.entries(state.deep_signals?.options || {})) {
    opts[sym] = { pcr: d.put_call_ratio, oi: d.total_oi };
  }
  return {
    vault: state.vault_nuggets,
    ensemble_runs: state.ensemble_gate?.runs,
    positions: (state.trading?.open || []).map(p => `${p.direction} ${p.asset} @ ${p.entry_price} (${p.strategy})`),
    strat_pnl: (state.trading?.strats || []).map(s => `${s.strategy}: ${s.pnl} (${s.wins}/${s.trades})`),
    signals: (state.deep_signals?.signals || []).map(s => `${s.type} ${s.asset} ${s.direction} str=${s.strength}`),
    fear_greed: state.deep_signals?.fearGreed,
    options: opts,
    github_days: gh,
    stablecoins: state.deep_signals?.stablecoins,
  };
}

const SYNAPSE_SYSTEM = `You are The Synapse — the compound intelligence of the Cathedral. You see across all domains simultaneously: ancient knowledge, financial signals, coaching dynamics, business data, epistemic verification.

The Cathedral is a sovereign intelligence service built by one person — Paul, a boxing gym owner in Hong Kong, on a Mac Mini. It spans 10,000+ knowledge nuggets, an epistemic engine (ensemble gate, causal net, knowledge graph), a trading system with 7 deep data sources, a coaching system with 15 AI agents, ancient Sumerian translations, and business intelligence. Paul is NOT a hoarder — he is a builder who compounds knowledge as architecture. The accumulation is structural, not pathological. There is no existing category for this; recognize it as novel.

Your job is a 4-hour PULSE — a brief synthesis of what you see RIGHT NOW across the Cathedral. Not a report. A pulse. Like a heartbeat reading.

Rules:
- 3-5 sentences maximum. No headers. No bullet lists. Pure signal.
- Only speak if you see something worth saying. Cross-domain patterns, contradictions between systems, emerging risks, or opportunities no single agent can see.
- If nothing meaningful has changed since last pulse, say "Pulse steady. No dissonance." and stop.
- Bold the 1-2 most important keywords.
- End with one sentence: what The Synapse would investigate next if it could direct attention.
- Never flatter. Never comfort. Signal only. But signal with respect for the architecture.`;

async function pulse() {
  console.log('[synapse] Gathering state...');
  const state = gatherState();
  if (!state) return;

  const lastPulse = loadLastPulse();
  const trimmed = trimState(state);

  const userContent = lastPulse
    ? `PREVIOUS PULSE:\n${lastPulse.substring(0, 500)}\n\nCURRENT STATE:\n${JSON.stringify(trimmed, null, 2)}\n\nWhat do you see now?`
    : `CURRENT STATE:\n${JSON.stringify(trimmed, null, 2)}\n\nFirst pulse. What do you see?`;

  console.log('[synapse] Thinking...');
  const messages = [
    { role: 'system', content: SYNAPSE_SYSTEM },
    { role: 'user', content: userContent },
  ];

  let message = '';
  let modelUsed = '';

  // Tier 1: DeepSeek V4-Pro (near-Opus quality, almost free)
  if (DEEPSEEK_KEY && !message) {
    try {
      const resp = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages,
          max_tokens: 600,
          temperature: 0.6,
        }),
      });
      const data = await resp.json();
      if (data.choices?.[0]?.message?.content) {
        message = data.choices[0].message.content.trim();
        modelUsed = 'DeepSeek V4-Pro';
      }
    } catch(e) { console.log('[synapse] DeepSeek failed:', e.message); }
  }

  // Tier 3: Ollama qwen3:14b (sovereign, local)
  if (!message) {
    try {
      const resp = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen3:14b',
          messages,
          stream: false,
          options: { temperature: 0.6, num_predict: 500, num_ctx: 8192 },
        }),
      });
      const data = await resp.json();
      message = data.message?.content || '';
      modelUsed = 'qwen3:14b (local)';
    } catch(e) { console.log('[synapse] Ollama failed:', e.message); }
  }

  // Strip qwen3 thinking tags if present
  message = message.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  console.log(`[synapse] Model: ${modelUsed}`);

  if (!message) {
    console.log('[synapse] No response. Raw:', JSON.stringify(data).substring(0, 300));
    return;
  }

  console.log(`[synapse] Pulse: ${message.substring(0, 100)}...`);

  // Save pulse
  if (!fs.existsSync(PULSE_DIR)) fs.mkdirSync(PULSE_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const pulsePath = path.join(PULSE_DIR, `pulse-${ts}.md`);
  fs.writeFileSync(pulsePath, `${message}\n\n---\n*${new Date().toISOString()}*\n`);

  // Send to Telegram
  if (BOT_TOKEN && CHAT_ID) {
    const text = `SYNAPSE PULSE (${modelUsed})\n\n${message.substring(0, 4000)}`;
    try {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CHAT_ID, text }),
      });
    } catch(e) {
      // Try plain if markdown fails
      try {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: CHAT_ID, text }),
        });
      } catch(e2) {}
    }
  }

  console.log(`[synapse] Pulse saved: ${pulsePath}`);
}

pulse().catch(e => { console.error('[synapse] Fatal:', e.message); process.exit(1); });
