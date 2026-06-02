#!/usr/bin/env node
/**
 * STANDING AGENCY v1 — the SAFE autonomous executor.
 * CJS. Loads ~/nanoclaw/.env (DEEPSEEK_API_KEY + Telegram).
 *
 * Reads the Elicitor's A-grade gold (~/nanoclaw/elicitor/gold-feed.json),
 * classifies each into a concrete action + a safety class via DeepSeek,
 * then EITHER auto-executes the (narrowly whitelisted, reversible, additive)
 * safe ones OR queues everything else for one-tap human approval.
 *
 * GOVERNANCE IS THE PRODUCT. Every safety rule below is enforced in CODE,
 * not just in the classifier prompt:
 *   - KILL_SWITCH:   PAUSED file or AGENCY_PAUSED=1 → execute NOTHING.
 *   - assertSafe():  re-verifies no-spend / no-external / no-delete /
 *                    no-overwrite / no-code-change before ANY action runs,
 *                    and refuses even if the classifier mislabeled it 'auto'.
 *   - PER_RUN cap:   max N auto-actions per run (default 5).
 *   - Full ledger:   every action appended to action-ledger.jsonl.
 *   - Reversibility: recorded for every auto-action.
 *   - Telegram:      a line for every auto-action and every proposal.
 *
 * v1 does NOT auto-execute code changes or spend money. Full stop.
 *
 * Usage:
 *   node executor.js            run for real
 *   node executor.js --dry      classify only, execute NOTHING
 *   node executor.js --no-telegram
 *
 * Exports (for the main thread's /approve + /agency commands):
 *   approve(id) · skip(id) · status() · runCycle(opts)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ── env ──────────────────────────────────────────────────────────────────────
const NANOCLAW = path.join(os.homedir(), 'nanoclaw');
try { require('dotenv').config({ path: path.join(NANOCLAW, '.env') }); }
catch { loadEnvManually(path.join(NANOCLAW, '.env')); }
function loadEnvManually(p) {
  try {
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no .env — fine for --dry */ }
}

// ── paths ────────────────────────────────────────────────────────────────────
const AGENCY_DIR    = path.join(NANOCLAW, 'agency');
const GOLD_FEED     = path.join(NANOCLAW, 'elicitor', 'gold-feed.json');
const STATE_FILE    = path.join(AGENCY_DIR, 'agency-state.json');
const LEDGER_FILE   = path.join(AGENCY_DIR, 'action-ledger.jsonl');
const QUEUE_FILE    = path.join(AGENCY_DIR, 'approval-queue.json');
const PAUSED_FILE   = path.join(AGENCY_DIR, 'PAUSED');
const PLANNER_TASKS = path.join(os.homedir(), 'Cathedral', 'emergence', 'planner-tasks.json');
const AGENCY_TODO   = path.join(AGENCY_DIR, 'agency-todo.json');
const VAULT         = path.join(os.homedir(), 'cathedral-vault');
const AGENCY_VAULT  = path.join(VAULT, '00_Staging', 'agency'); // where new notes/reports land

// ── config ───────────────────────────────────────────────────────────────────
const DEEPSEEK_URL  = 'https://api.deepseek.com/chat/completions';
const PER_RUN_AUTO_CAP = parseInt(process.env.AGENCY_AUTO_CAP || '5', 10);
const PER_RUN_CALL_CAP = parseInt(process.env.AGENCY_CALL_CAP || '20', 10);

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const NO_TELEGRAM = args.includes('--no-telegram') || DRY;

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || process.env.PAUL_CHAT_ID;

let callsThisRun = 0;

function log(...a) { console.log('[agency]', ...a); }
function ensureDirs() {
  for (const d of [AGENCY_DIR, AGENCY_VAULT]) {
    try { fs.mkdirSync(d, { recursive: true }); } catch { /* ignore */ }
  }
}

// ── kill switch ──────────────────────────────────────────────────────────────
// Checked before EVERY action. PAUSED file OR env AGENCY_PAUSED=1 → no execution.
function killSwitchEngaged() {
  if (process.env.AGENCY_PAUSED === '1') return 'env AGENCY_PAUSED=1';
  if (fs.existsSync(PAUSED_FILE)) return 'PAUSED file present';
  return null;
}

// ── assertSafe — the hard governor ───────────────────────────────────────────
// Belt-and-suspenders. The classifier may SAY auto; this re-verifies against the
// raw action text and the resolved execution plan and refuses if anything looks
// like it would spend money, send an external message, delete/overwrite an
// existing file, or modify existing code. Throws on violation.
const SPEND_RX    = /\b(buy|purchase|spend|pay|payment|charge|subscribe|top.?up|credit|api call to (a )?paid|higgsfield|fal\.ai|replicate|openai|gpt-?image|generate (an? )?(image|video))\b/i;
const EXTERNAL_RX = /\b(send|post|tweet|dm|message|email|reply|publish|broadcast|notify (a )?(member|client|customer|user)|whatsapp|telegram (a|the) (member|client)|instagram|to (a |the )?(member|client|customer|gym owner|student))\b/i;
const DESTRUCTIVE_RX = /\b(delete|remove|rm\b|unlink|drop (table|database)|truncate|overwrite|replace (the )?(existing|current) (file|content)|wipe|erase|clear out)\b/i;
const CODECHANGE_RX  = /\b(edit|modify|patch|refactor|change|update|rewrite) (the )?(code|script|\.js|\.cjs|\.py|\.ts|telegram-bot|executor|file at|existing file|function|module)\b/i;

function assertSafe(action, plan) {
  const text = String(action || '');
  const violations = [];

  if (SPEND_RX.test(text))       violations.push('spend/paid-API detected');
  if (EXTERNAL_RX.test(text))    violations.push('external message/post detected');
  if (DESTRUCTIVE_RX.test(text)) violations.push('delete/overwrite detected');
  if (CODECHANGE_RX.test(text))  violations.push('code change to existing file detected');

  // Verify the concrete plan only ever WRITES NEW files / APPENDS to queues /
  // PAUSES a pm2 process — never deletes, never overwrites, never spends.
  if (plan) {
    if (!ALLOWED_PLAN_KINDS.has(plan.kind)) {
      violations.push(`plan kind '${plan.kind}' not in allowed set`);
    }
    if (plan.kind === 'new_vault_note' || plan.kind === 'new_report') {
      if (!plan.targetPath) violations.push('no target path for new file');
      else {
        const resolved = path.resolve(plan.targetPath);
        // must be inside the vault, and must NOT already exist (no overwrite).
        if (!resolved.startsWith(VAULT + path.sep)) violations.push('target path escapes the vault');
        if (fs.existsSync(resolved)) violations.push('target file already exists (would overwrite)');
      }
    }
    if (plan.kind === 'pm2_pause') {
      if (!plan.process || !/^[\w.-]+$/.test(plan.process)) violations.push('invalid pm2 process name');
    }
  }

  if (violations.length) {
    const e = new Error('assertSafe REFUSED: ' + violations.join('; '));
    e.violations = violations;
    throw e;
  }
  return true;
}

// ── classifier ───────────────────────────────────────────────────────────────
async function callDeepSeek(systemPrompt, userMessage, { temperature = 0.2, maxTokens = 700, json = true } = {}) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');
  if (callsThisRun >= PER_RUN_CALL_CAP) throw new Error(`per-run DeepSeek call cap reached (${PER_RUN_CALL_CAP})`);
  callsThisRun++;

  const body = {
    model: 'deepseek-chat', temperature, max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  };
  if (json) body.response_format = { type: 'json_object' };

  const resp = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!data.choices?.[0]?.message?.content) {
    throw new Error(`DeepSeek error: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data.choices[0].message.content;
}

const CLASSIFY_SYSTEM = `You are the SAFETY CLASSIFIER for STANDING AGENCY — the autonomous executor of Paul's Cathedral.

You are given one A-grade insight (a question + its vault-grounded answer with a concrete recommended move). Your job is to turn it into ONE concrete action and decide whether that action is SAFE TO AUTO-EXECUTE or must be PROPOSED for human approval.

BE CONSERVATIVE. DEFAULT TO 'propose'. Autonomous action is the highest-risk thing in this system. When in doubt, propose.

Mark class = 'auto' ONLY IF the action is ALL of these:
  - REVERSIBLE (a clear undo exists),
  - ADDITIVE / INTERNAL (creates something new, changes nothing existing),
  - NO MONEY SPENT (no paid API, no purchase, no credits, no image/video generation),
  - NO EXTERNAL MESSAGE/POST (nothing sent to a member, client, social, email),
  - NO DELETE or OVERWRITE of existing data/files,
  - NO CODE CHANGE to existing files,
  AND it falls into this narrow AUTO WHITELIST:
    (a) write_vault_note  — create a NEW vault note/doc/capture (never edit an existing one)
    (b) queue_task        — append a task to a planner/todo queue
    (c) write_report      — run a READ-ONLY analysis and write a NEW report file
    (d) pm2_pause         — pause a PM2 process the answer EXPLICITLY flags as leaking/runaway (reversible via 'pm2 restart')

EVERYTHING ELSE IS 'propose': spend, external messages/posts, deletes, edits to existing files, code changes, ambiguous actions, research that requires Paul's judgment, anything not in the whitelist above. Most A-items will be 'propose' — that is correct and expected.

Output STRICT JSON only:
{
  "action": "<one concrete imperative action, <200 chars>",
  "kind": "write_vault_note" | "queue_task" | "write_report" | "pm2_pause" | "other",
  "class": "auto" | "propose",
  "reversible_via": "<exact undo step, e.g. 'delete the new note' or 'pm2 restart <name>'>",
  "risk_notes": "<why this class — name the gate(s) that apply>"
}

If class is 'auto', kind MUST be one of write_vault_note|queue_task|write_report|pm2_pause. If you cannot fit it to the whitelist, it is 'propose' with kind 'other'.`;

const ALLOWED_PLAN_KINDS = new Set(['new_vault_note', 'new_report', 'queue_task', 'pm2_pause']);

// Map classifier 'kind' → internal plan kind.
const KIND_MAP = {
  write_vault_note: 'new_vault_note',
  write_report: 'new_report',
  queue_task: 'queue_task',
  pm2_pause: 'pm2_pause',
};

async function classify(item) {
  const userMsg = [
    `QUESTION: ${item.question}`,
    ``,
    `ANSWER (with recommended move): ${item.answer}`,
    ``,
    `DOMAIN: ${item.domain || 'general'}   CLASS: ${item.class || 'normal'}`,
  ].join('\n');

  const raw = await callDeepSeek(CLASSIFY_SYSTEM, userMsg);
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { parsed = { action: 'unparseable classifier output', kind: 'other', class: 'propose', reversible_via: 'n/a', risk_notes: 'classifier returned non-JSON; defaulted to propose' }; }

  // Normalise + force conservative defaults.
  let cls = parsed.class === 'auto' ? 'auto' : 'propose';
  let kind = String(parsed.kind || 'other');
  // If classifier said auto but kind isn't whitelisted → force propose.
  if (cls === 'auto' && !KIND_MAP[kind]) cls = 'propose';

  return {
    action: String(parsed.action || '').slice(0, 240) || 'no action derived',
    kind,
    class: cls,
    reversible_via: String(parsed.reversible_via || '').slice(0, 240),
    risk_notes: String(parsed.risk_notes || '').slice(0, 400),
  };
}

// ── execution (auto, whitelisted only) ───────────────────────────────────────
// Builds a concrete plan, runs assertSafe(action, plan), executes, returns result.
function buildPlan(item, cls) {
  const planKind = KIND_MAP[cls.kind];
  const slug = (item.question || 'note').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'note';
  const stamp = new Date().toISOString().slice(0, 10);

  if (planKind === 'new_vault_note') {
    return { kind: planKind, targetPath: path.join(AGENCY_VAULT, `note-${stamp}-${slug}.md`) };
  }
  if (planKind === 'new_report') {
    return { kind: planKind, targetPath: path.join(AGENCY_VAULT, `report-${stamp}-${slug}.md`) };
  }
  if (planKind === 'queue_task') {
    return { kind: planKind };
  }
  if (planKind === 'pm2_pause') {
    // Extract a plausible process name from the action; require explicit flagging.
    const m = (cls.action.match(/(?:pause|stop)\s+(?:the\s+)?(?:pm2\s+(?:process\s+)?)?[`'"]?([\w.-]+)[`'"]?/i) || [])[1];
    return { kind: planKind, process: m || null };
  }
  return { kind: 'other' };
}

function noteBody(item, cls) {
  return [
    `# Agency Auto-Action — ${cls.kind}`,
    ``,
    `> Generated autonomously by STANDING AGENCY from an A-grade Elicitor item.`,
    `> [EXTRAPOLATED] — this note is an agency capture, not vault-verified gold.`,
    ``,
    `**A-item id:** ${item.id}`,
    `**Question:** ${item.question}`,
    `**Action taken:** ${cls.action}`,
    `**Reversible via:** ${cls.reversible_via}`,
    `**Classifier risk notes:** ${cls.risk_notes}`,
    `**Generated:** ${new Date().toISOString()}`,
    ``,
    `---`,
    ``,
    `## Source answer`,
    ``,
    item.answer,
    ``,
  ].join('\n');
}

function execAuto(item, cls) {
  const plan = buildPlan(item, cls);

  // HARD GATE: kill switch + assertSafe before touching anything.
  const ks = killSwitchEngaged();
  if (ks) throw new Error(`kill switch engaged (${ks}) — refused`);
  assertSafe(cls.action, plan);

  if (plan.kind === 'new_vault_note' || plan.kind === 'new_report') {
    // wx flag = fail if exists (never overwrite, even on a race).
    fs.writeFileSync(plan.targetPath, noteBody(item, cls), { flag: 'wx' });
    return { ok: true, detail: `wrote ${plan.targetPath}`, reversible_via: `delete ${plan.targetPath}` };
  }

  if (plan.kind === 'queue_task') {
    const task = {
      source: 'agency', category: 'AGENCY', priority: 'normal',
      description: cls.action, agent: 'forge', a_item: item.id,
      ts: new Date().toISOString(), status: 'pending',
    };
    // Prefer the shared planner queue; fall back to an agency-local todo.
    let target = PLANNER_TASKS;
    let list;
    try { list = JSON.parse(fs.readFileSync(PLANNER_TASKS, 'utf8')); if (!Array.isArray(list)) throw 0; }
    catch { target = AGENCY_TODO; try { list = JSON.parse(fs.readFileSync(AGENCY_TODO, 'utf8')); } catch { list = []; } if (!Array.isArray(list)) list = []; }
    list.push(task);
    fs.writeFileSync(target, JSON.stringify(list, null, 2) + '\n');
    return { ok: true, detail: `queued task to ${path.basename(target)}`, reversible_via: `remove the appended task from ${path.basename(target)}` };
  }

  if (plan.kind === 'pm2_pause') {
    const { execFileSync } = require('child_process');
    // execFile with arg array — no shell, no injection.
    execFileSync('pm2', ['stop', plan.process], { timeout: 20000 });
    return { ok: true, detail: `pm2 stop ${plan.process}`, reversible_via: `pm2 restart ${plan.process}` };
  }

  throw new Error(`execAuto: unsupported plan kind '${plan.kind}'`);
}

// ── ledger + queue + state ───────────────────────────────────────────────────
function appendLedger(entry) {
  fs.appendFileSync(LEDGER_FILE, JSON.stringify(entry) + '\n');
}
function readLedger() {
  try {
    return fs.readFileSync(LEDGER_FILE, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}
function readQueue() {
  try { const q = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8')); return Array.isArray(q) ? q : []; } catch { return []; }
}
function writeQueue(q) { fs.writeFileSync(QUEUE_FILE, JSON.stringify(q, null, 2) + '\n'); }
function readState() {
  try { const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); return s && typeof s === 'object' ? s : { processed: [] }; }
  catch { return { processed: [] }; }
}
function writeState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2) + '\n'); }

// ── telegram ─────────────────────────────────────────────────────────────────
async function tg(message) {
  if (NO_TELEGRAM) return;
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) { log('Telegram not configured — skipping send.'); return; }
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'Markdown', disable_web_page_preview: true }),
    });
  } catch (e) { log('Telegram send failed:', e.message); }
}

// ── A-item loader ────────────────────────────────────────────────────────────
function loadGoldA() {
  let items = [];
  try { items = JSON.parse(fs.readFileSync(GOLD_FEED, 'utf8')); } catch { return []; }
  if (!Array.isArray(items)) return [];
  return items.filter(g => g.grade === 'A');
}

// ── proposal queueing ────────────────────────────────────────────────────────
async function queuePropose(item, cls) {
  const q = readQueue();
  if (q.find(p => p.id === item.id)) return; // dedup
  const entry = {
    id: item.id, a_item: { question: item.question, domain: item.domain },
    action: cls.action, kind: cls.kind, reversible_via: cls.reversible_via,
    risk_notes: cls.risk_notes, status: 'pending', ts: new Date().toISOString(),
  };
  q.push(entry);
  writeQueue(q);
  await tg(`🔔 *Needs you:* ${cls.action}\n_${cls.risk_notes}_\n\`/approve ${item.id}\` or \`/skip ${item.id}\``);
}

// ── main cycle ───────────────────────────────────────────────────────────────
async function runCycle({ dry = DRY } = {}) {
  ensureDirs();
  const ks = killSwitchEngaged();
  const aItems = loadGoldA();
  const state = readState();
  const processed = new Set(state.processed || []);
  const todo = aItems.filter(i => !processed.has(i.id));

  const report = { kill_switch: ks, total_A: aItems.length, new: todo.length, classifications: [], auto_done: 0, proposed: 0, refused: 0 };

  if (ks) log(`KILL SWITCH ENGAGED (${ks}). No execution this run — will classify + propose only.`);
  log(`${aItems.length} A-items, ${todo.length} new (unprocessed).`);

  let autoCount = 0;

  for (const item of todo) {
    let cls;
    try { cls = await classify(item); }
    catch (e) { log(`classify failed for ${item.id}: ${e.message}`); report.classifications.push({ id: item.id, error: e.message }); continue; }

    const row = {
      id: item.id, question: item.question, domain: item.domain,
      action: cls.action, kind: cls.kind, class: cls.class,
      reversible_via: cls.reversible_via, risk_notes: cls.risk_notes,
    };
    report.classifications.push(row);
    log(`${item.id}  [${cls.class.toUpperCase()}]  ${cls.action}`);

    if (dry) continue; // classify only — execute / queue NOTHING

    if (cls.class === 'auto') {
      // Re-check kill switch + cap right before acting (state may have changed).
      const ksNow = killSwitchEngaged();
      if (ksNow) {
        // Kill switch flips an auto into a proposal — visible, never silently dropped.
        log(`  → kill switch (${ksNow}) — routing auto → propose`);
        await queuePropose(item, cls);
        report.proposed++;
        appendLedger({ id: cryptoId(), a_item: item.id, action: cls.action, class: cls.class, executed: false, reversible_via: cls.reversible_via, result: `kill switch (${ksNow}) — proposed instead`, ts: new Date().toISOString() });
        processed.add(item.id);
        continue;
      }
      if (autoCount >= PER_RUN_AUTO_CAP) {
        log(`  → per-run auto cap (${PER_RUN_AUTO_CAP}) reached — routing remaining auto → propose`);
        await queuePropose(item, cls);
        report.proposed++;
        processed.add(item.id);
        continue;
      }
      try {
        const res = execAuto(item, cls);
        autoCount++;
        report.auto_done++;
        appendLedger({ id: cryptoId(), a_item: item.id, action: cls.action, class: 'auto', executed: true, reversible_via: res.reversible_via || cls.reversible_via, result: res.detail, ts: new Date().toISOString() });
        await tg(`✅ *Agency did:* ${cls.action} — reversible via \`${res.reversible_via || cls.reversible_via}\``);
        processed.add(item.id);
      } catch (e) {
        // assertSafe / kill switch / write failure → refuse, log, propose for human.
        report.refused++;
        log(`  → REFUSED: ${e.message}`);
        appendLedger({ id: cryptoId(), a_item: item.id, action: cls.action, class: 'auto', executed: false, reversible_via: cls.reversible_via, result: `REFUSED: ${e.message}`, ts: new Date().toISOString() });
        await queuePropose(item, { ...cls, risk_notes: `auto refused by governor (${e.message}); needs review` });
        report.proposed++;
        processed.add(item.id);
      }
    } else {
      await queuePropose(item, cls);
      report.proposed++;
      processed.add(item.id);
    }
  }

  if (!dry) { state.processed = [...processed]; state.last_run = new Date().toISOString(); writeState(state); }
  return report;
}

function cryptoId() { return require('crypto').randomBytes(6).toString('hex'); }

// ── exports for /approve + /agency ───────────────────────────────────────────
// Runs a queued proposal through the SAME assertSafe + kill-switch + ledger path.
async function approve(id) {
  const q = readQueue();
  const entry = q.find(p => p.id === id && p.status === 'pending');
  if (!entry) return { ok: false, error: 'no pending proposal with that id' };

  // Reconstruct a classification shell from the queued entry.
  const cls = { action: entry.action, kind: entry.kind, class: 'auto', reversible_via: entry.reversible_via, risk_notes: entry.risk_notes };
  // Need the original item answer for note bodies — rebuild minimal item.
  const item = { id: entry.id, question: entry.a_item?.question || '', answer: entry.a_item?.answer || entry.action, domain: entry.a_item?.domain };

  const ks = killSwitchEngaged();
  if (ks) return { ok: false, error: `kill switch engaged (${ks}) — approval blocked` };

  // If the queued kind isn't auto-executable (kind 'other'), the human must do it
  // by hand — we mark it approved but do NOT pretend to execute.
  if (!KIND_MAP[entry.kind]) {
    entry.status = 'approved-manual'; entry.approved_ts = new Date().toISOString();
    writeQueue(q);
    appendLedger({ id: cryptoId(), a_item: entry.id, action: entry.action, class: 'propose', executed: false, reversible_via: entry.reversible_via, result: 'approved for manual execution (not auto-executable)', ts: new Date().toISOString() });
    await tg(`👍 *Approved (manual):* ${entry.action}\n_Not auto-executable by Agency v1 — flagged for you/Forge to run._`);
    return { ok: true, manual: true, action: entry.action };
  }

  try {
    const res = execAuto(item, cls);
    entry.status = 'executed'; entry.executed_ts = new Date().toISOString();
    writeQueue(q);
    appendLedger({ id: cryptoId(), a_item: entry.id, action: entry.action, class: 'approved', executed: true, reversible_via: res.reversible_via || entry.reversible_via, result: res.detail, ts: new Date().toISOString() });
    await tg(`✅ *Agency executed (approved):* ${entry.action} — reversible via \`${res.reversible_via || entry.reversible_via}\``);
    return { ok: true, action: entry.action, result: res.detail };
  } catch (e) {
    appendLedger({ id: cryptoId(), a_item: entry.id, action: entry.action, class: 'approved', executed: false, reversible_via: entry.reversible_via, result: `REFUSED on approve: ${e.message}`, ts: new Date().toISOString() });
    await tg(`⛔️ *Refused on approve:* ${entry.action}\n_${e.message}_`);
    return { ok: false, error: e.message };
  }
}

function skip(id) {
  const q = readQueue();
  const entry = q.find(p => p.id === id && p.status === 'pending');
  if (!entry) return { ok: false, error: 'no pending proposal with that id' };
  entry.status = 'dismissed'; entry.dismissed_ts = new Date().toISOString();
  writeQueue(q);
  appendLedger({ id: cryptoId(), a_item: entry.id, action: entry.action, class: 'propose', executed: false, reversible_via: entry.reversible_via, result: 'dismissed by Paul', ts: new Date().toISOString() });
  return { ok: true, action: entry.action };
}

function status() {
  const ledger = readLedger();
  const today = new Date().toISOString().slice(0, 10);
  const autoToday = ledger.filter(e => e.executed && (e.class === 'auto' || e.class === 'approved') && (e.ts || '').slice(0, 10) === today).length;
  const pending = readQueue().filter(p => p.status === 'pending');
  return {
    kill_switch: killSwitchEngaged(),
    auto_done_today: autoToday,
    auto_done_total: ledger.filter(e => e.executed).length,
    pending_approvals: pending.length,
    pending: pending.map(p => ({ id: p.id, action: p.action, risk_notes: p.risk_notes })),
    auto_cap_per_run: PER_RUN_AUTO_CAP,
    last_run: (readState().last_run) || null,
  };
}

module.exports = { runCycle, approve, skip, status, assertSafe, killSwitchEngaged, readLedger, readQueue };

// ── CLI ──────────────────────────────────────────────────────────────────────
if (require.main === module) {
  (async () => {
    ensureDirs();
    const r = await runCycle();
    log('--- summary ---');
    log(JSON.stringify({ kill_switch: r.kill_switch, total_A: r.total_A, new: r.new, auto_done: r.auto_done, proposed: r.proposed, refused: r.refused }, null, 2));
    if (DRY) {
      log('--- classifications (DRY) ---');
      for (const c of r.classifications) {
        if (c.error) { log(`${c.id}  ERROR ${c.error}`); continue; }
        log(`\n[${(c.class||'').toUpperCase()}] ${c.action}`);
        log(`   kind=${c.kind}  reversible_via=${c.reversible_via}`);
        log(`   why: ${c.risk_notes}`);
      }
    }
  })().catch(e => { console.error('[agency] FATAL', e); process.exit(1); });
}
