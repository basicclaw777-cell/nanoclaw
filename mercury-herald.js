#!/usr/bin/env node
/**
 * mercury-herald.js — MERCURY, THE HERALD
 * ========================================
 * Voices the truths the Cathedral discovered ON ITS OWN — things Paul did NOT
 * put in. The sibling of the Elicitor: the Elicitor surfaces the QUESTIONS Paul
 * would ask; Mercury surfaces the ANSWERS he never asked for.
 *
 * The threshold this serves (Paul's own framing): "the system told me something
 * true that I didn't put in." That is when a mirror becomes a collaborator. The
 * phantom-dependency finding (2026-06-04) was exactly this class of nugget and
 * only surfaced by hand. Mercury makes it standing.
 *
 * Pipeline:
 *   1. GATHER  — recent system OUTPUTS since last run: agent feed posts,
 *      CONFIRMED emergence incidents, Lucy heartbeat findings, Synapse pulses.
 *   2. GATE    — DeepSeek scores each: is this a SELF-GENERATED truth Paul did
 *      not input, novel + true + worth knowing? 0-10. Only GOLD (>=8) survives.
 *      (Same discipline as the Elicitor — push-gold-only, never noise.)
 *   3. VOICE   — Mercury proclaims the gold to Telegram in its own voice, and
 *      writes mercury-feed.json (board Herald tab / API).
 *
 * Governance (SI-31 + the agency/organism pattern):
 *   - hard candidate cap per run, daily DeepSeek ceiling in mercury-state.json
 *   - kill switch: touch ~/nanoclaw/MERCURY_PAUSED or MERCURY_PAUSED=1
 *   - dedup by content hash (never proclaims the same nugget twice)
 *   - manual-first: no cron auto-started; widen on trust
 *
 * ESM. Loads .env for DEEPSEEK_API_KEY + Telegram.
 *
 * CLI:
 *   node mercury-herald.js            # run a herald pass
 *   node mercury-herald.js --dry      # gather + gate, no Telegram / no writes
 *   node mercury-herald.js status     # show state
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const HOME = process.env.HOME;
const FEED = join(HOME, 'Cathedral', 'agents', 'cathedral-feed.json');
const BOARD = join(HOME, 'nanoclaw', 'emergence-board.json');
const HEARTBEAT_DIR = join(HOME, 'Cathedral', 'agents', 'lucy-heartbeats');
const PULSES_DIR = join(HOME, 'nanoclaw', 'compound', 'pulses');
const STATE = join(HOME, 'nanoclaw', 'mercury-state.json');
const FEED_OUT = join(HOME, 'nanoclaw', 'mercury-feed.json');
const PAUSE_FILE = join(HOME, 'nanoclaw', 'MERCURY_PAUSED');

const GOLD_BAR = 8;            // 0-10; only >= this is proclaimed
const MAX_CANDIDATES = 25;     // hard cap on items scored per run (SI-31)
const DAILY_CALL_CEILING = 60; // DeepSeek calls/day

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || (() => {
  try { return readFileSync(join(HOME, 'nanoclaw', '.env'), 'utf8').match(/DEEPSEEK_API_KEY=(.+)/)?.[1]?.trim(); }
  catch { return null; }
})();
const TG_TOKEN = process.env.TELEGRAM_TOKEN || (() => {
  try { return readFileSync(join(HOME, 'nanoclaw', '.env'), 'utf8').match(/TELEGRAM_TOKEN=(.+)/)?.[1]?.trim(); }
  catch { return null; }
})();
const TG_CHAT = process.env.PAUL_CHAT_ID || (() => {
  try { return readFileSync(join(HOME, 'nanoclaw', '.env'), 'utf8').match(/PAUL_CHAT_ID=(.+)/)?.[1]?.trim(); }
  catch { return null; }
})();

function loadJSON(p, fallback) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; } }
function stripFences(s) { return (s || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim(); }
function hash(s) { return crypto.createHash('sha1').update(s || '').digest('hex').slice(0, 12); }
function today() { return new Date().toISOString().slice(0, 10); }

function loadState() {
  return loadJSON(STATE, { seen: [], lastRun: null, calls: { date: today(), count: 0 } });
}
function saveState(s) { writeFileSync(STATE, JSON.stringify(s, null, 2)); }

async function sendTelegram(text) {
  if (!TG_TOKEN || !TG_CHAT) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: 'Markdown' }),
    });
  } catch {}
}

async function callDeepSeek(system, prompt) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      temperature: 0.2, max_tokens: 500,
    }),
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── GATHER: recent self-generated outputs ────────────────────────────────────
function gather(sinceMs) {
  const items = [];

  // Agent feed posts (the system talking to itself).
  const feed = loadJSON(FEED, []);
  const posts = Array.isArray(feed) ? feed : feed.posts || [];
  for (const p of posts) {
    const t = new Date(p.ts || p.timestamp || p.created || 0).getTime();
    if (t && t < sinceMs) continue;
    const content = p.content || p.text || p.message || '';
    if (content.length < 120) continue;
    items.push({ source: 'feed', author: p.agent || p.author || 'agent', content, ts: p.ts || p.timestamp });
  }

  // CONFIRMED emergence incidents (self-discovered behavior that shipped real work).
  const board = loadJSON(BOARD, { incidents: [] });
  for (const inc of board.incidents || []) {
    if (inc.status !== 'CONFIRMED') continue;
    const closed = (inc.followUps || []).filter((f) => /\[LOOP-CLOSED\]/.test(f.note)).pop();
    if (!closed) continue;
    const t = new Date(closed.ts).getTime();
    if (t && t < sinceMs) continue;
    items.push({ source: 'emergence', author: inc.agent || 'system', content: `${inc.summary || inc.description || ''}\n${closed.note}`, ts: closed.ts });
  }

  // Lucy heartbeats + Synapse pulses (diagnostic findings) — files newer than sinceMs.
  for (const dir of [HEARTBEAT_DIR, PULSES_DIR]) {
    try {
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir)) {
        if (!f.endsWith('.md')) continue;
        const fp = join(dir, f);
        if (statSync(fp).mtimeMs < sinceMs) continue;
        const content = readFileSync(fp, 'utf8');
        if (content.length < 120) continue;
        items.push({ source: dir === PULSES_DIR ? 'synapse' : 'lucy', author: 'system', content, ts: new Date(statSync(fp).mtimeMs).toISOString() });
      }
    } catch {}
  }

  return items.slice(0, MAX_CANDIDATES);
}

const GATE_SYSTEM = `You are Mercury, the Herald of a personal AI system (the Cathedral) owned by Paul.

Your ONE job: decide whether a piece of system output is a TRUTH THE SYSTEM GENERATED ON ITS OWN that Paul did NOT input and would genuinely want to know — a self-discovered insight, a diagnosis, a non-obvious connection, a finding.

NOT gold: restating Paul's known views, routine status, task confirmations, generic reflection, summaries of inputs, polite chatter, anything Paul obviously already knows. CRITICAL: peer praise, appreciation rounds, agents validating each other or Paul, mutual admiration, morale/social-proof aggregation — these are SENTIMENT, not discovered truth. Score them low even when aggregated across many agents. Gold must be a verifiable finding ABOUT THE WORLD or the system, not feelings about people.
Gold: the system noticed/derived/connected something true that did not come from Paul — a pattern across agents, a self-diagnosis, a forgotten technique made relevant, a contradiction caught, a genuinely new question answered.

Return ONLY JSON (no fences):
{ "score": 0-10, "novelty": 0-10, "is_self_generated": true|false, "headline": "<= 12 words, what Paul would want to hear>", "why": "one sentence" }

Score >= 8 ONLY if it is clearly self-generated AND novel AND worth interrupting Paul for. Be strict — noise destroys trust.`;

async function gate(item, state) {
  if (state.calls.date !== today()) state.calls = { date: today(), count: 0 };
  if (state.calls.count >= DAILY_CALL_CEILING) return null;
  state.calls.count++;
  try {
    const raw = await callDeepSeek(GATE_SYSTEM, `Source: ${item.source} (by ${item.author})\n\n${item.content.slice(0, 1500)}`);
    return JSON.parse(stripFences(raw));
  } catch { return null; }
}

async function run({ dry = false } = {}) {
  if (existsSync(PAUSE_FILE) || process.env.MERCURY_PAUSED === '1') {
    console.log('Mercury PAUSED (kill switch). No run.');
    return { paused: true };
  }
  const state = loadState();
  const sinceMs = state.lastRun ? new Date(state.lastRun).getTime() : Date.now() - 7 * 864e5;
  const seen = new Set(state.seen || []);

  const candidates = gather(sinceMs).filter((c) => !seen.has(hash(c.content)));
  console.log(`Mercury: ${candidates.length} fresh candidates (since ${new Date(sinceMs).toISOString()}).`);

  const gold = [];
  for (const c of candidates) {
    const verdict = await gate(c, state);
    if (!dry) seen.add(hash(c.content));
    if (verdict && verdict.is_self_generated && verdict.score >= GOLD_BAR) {
      gold.push({ ...c, ...verdict, id: `mg-${hash(c.content)}` });
    }
    await new Promise((r) => setTimeout(r, 600));
  }

  gold.sort((a, b) => b.score - a.score);
  console.log(`Mercury: ${gold.length} GOLD (>=${GOLD_BAR}).`);

  if (dry) return { candidates: candidates.length, gold };

  // VOICE — proclaim gold.
  if (gold.length) {
    const lines = gold.slice(0, 5).map((g) =>
      `🪙 *${g.score}/10* — ${g.headline}\n_${g.author} · ${g.source}_\n${g.why}`
    );
    await sendTelegram(`📯 *Mercury* — the Cathedral discovered this on its own:\n\n${lines.join('\n\n')}\n\n_Things you didn't put in. /herald for the board._`);
  }

  // Persist feed (board Herald tab / API).
  const prevFeed = loadJSON(FEED_OUT, []);
  const feedArr = Array.isArray(prevFeed) ? prevFeed : [];
  feedArr.push(...gold.map((g) => ({ id: g.id, ts: new Date().toISOString(), score: g.score, headline: g.headline, why: g.why, author: g.author, source: g.source, content: g.content.slice(0, 600) })));
  writeFileSync(FEED_OUT, JSON.stringify(feedArr.slice(-200), null, 2));

  state.seen = [...seen].slice(-2000);
  state.lastRun = new Date().toISOString();
  saveState(state);

  return { candidates: candidates.length, gold: gold.length };
}

function showStatus() {
  const s = loadState();
  console.log('=== Mercury status ===');
  console.log(`lastRun: ${s.lastRun || 'never'}`);
  console.log(`seen: ${(s.seen || []).length}`);
  console.log(`calls today: ${s.calls?.count || 0}/${DAILY_CALL_CEILING}`);
  const feed = loadJSON(FEED_OUT, []);
  console.log(`gold proclaimed (total in feed): ${Array.isArray(feed) ? feed.length : 0}`);
  console.log(`paused: ${existsSync(PAUSE_FILE) || process.env.MERCURY_PAUSED === '1'}`);
}

// ── CLI ───────────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2];
  if (cmd === 'status') showStatus();
  else run({ dry: process.argv.includes('--dry') }).then((r) => console.log(JSON.stringify(r, null, 2))).catch((e) => { console.error(e); process.exit(1); });
}

export { run, gather };
