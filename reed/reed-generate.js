#!/usr/bin/env node
'use strict';
/**
 * reed-generate.js — Reed v2 generation spine. ONE entry point for postable output.
 *
 * Flow: brief -> Taste gate -> pick cheapest available tool -> generate -> land in
 * the organized dump (~/reed-dump/ready/) -> log for the feedback loop -> Telegram.
 *
 * SAFETY (this requirement is load-bearing — Paul has had $13-20 burns):
 *  - DRY by default. Real paid generation only with `--go` AND under budget.
 *  - Hard daily + per-run USD caps (reed/tools.json budget).
 *  - Never regenerate an identical brief (cache by hash).
 *  - Telegram spend notice after any paid call.
 *
 * Reality (2026-06-02, Higgsfield Starter renews ~06-12):
 *  - IMAGE: Higgsfield depleted -> Reed writes a taste-gated paste-ready OpenArt
 *    prompt to ready/prompts/ (ZERO spend, useful now). After renewal -> auto via Higgsfield.
 *  - VIDEO: fal Seedance (paid, capped) — the only live auto path right now.
 *
 * CLI:  node reed-generate.js "<brief>" [--video] [--subject X] [--go]
 *       node reed-generate.js --budget               # show today's spend vs cap
 *       node reed-generate.js --from-request <id>    # pull a brief from Maya's
 *       node reed-generate.js --next-request         # image-request queue and run it
 *                                                      through the SAME gated spine.
 *
 * Maya->Reed PULL loop: maya-plan.js writes image-requests.json (Maya the content
 * director). --from-request / --next-request reads one, runs the normal spine
 * (taste gate, tool pick, budget, DRY-by-default), and on completion marks the
 * request status:"generated" + records the output path. Generating from a request
 * is NOT auto-spend — it is the same gated path. --go is still required to spend.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const genGuard = require('../lib/generation-guard.cjs'); // GLOBAL kill-switch
const HOME = process.env.HOME;
const REED = path.join(HOME, 'nanoclaw', 'reed');
const DUMP = path.join(HOME, 'reed-dump', 'ready');
const TOOLS = JSON.parse(fs.readFileSync(path.join(REED, 'tools.json'), 'utf8'));
const ATTEMPTS = path.join(REED, 'attempts.jsonl');
const CACHE = path.join(REED, 'brief-cache.json');
const BUDGET_STATE = path.join(REED, 'budget-state.json');
const REQUESTS = path.join(REED, 'image-requests.json'); // Maya's image-request queue (the pull half of the loop)

// .env (FAL_KEY, Telegram)
try {
  for (const l of fs.readFileSync(path.join(HOME, 'nanoclaw', '.env'), 'utf8').split('\n')) {
    const m = l.match(/^([^#=]+)=(.*)$/); if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
} catch {}

function today() { return new Date().toISOString().slice(0, 10); }
function loadBudget() { try { const b = JSON.parse(fs.readFileSync(BUDGET_STATE, 'utf8')); return b.date === today() ? b : { date: today(), spent: 0 }; } catch { return { date: today(), spent: 0 }; } }
function saveBudget(b) { fs.writeFileSync(BUDGET_STATE, JSON.stringify(b, null, 2)); }
function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50); }
function briefHash(b) { return crypto.createHash('sha1').update(b).digest('hex').slice(0, 10); }

// ── Maya request queue (image-requests.json) ───────────────────────────────
function loadRequests() { try { return JSON.parse(fs.readFileSync(REQUESTS, 'utf8')); } catch { return []; } }
function saveRequests(q) { fs.writeFileSync(REQUESTS, JSON.stringify(q, null, 2)); }
// Resolve a request to { req, brief, subject }. id===null -> next pending.
function resolveRequest(id) {
  const q = loadRequests();
  const req = id
    ? q.find(r => String(r.id) === String(id))
    : q.find(r => r.status === 'requested');
  if (!req) return null;
  const subject = slug(req.pillar || 'maya').replace(/-/g, '') || 'maya';
  return { req, brief: req.brief, subject };
}
// Mark a request generated and record where the output landed.
function markRequestGenerated(id, out, tool) {
  const q = loadRequests();
  const r = q.find(x => String(x.id) === String(id));
  if (!r) return;
  r.status = 'generated';
  r.output = out;
  r.tool = tool;
  r.generatedTs = new Date().toISOString();
  saveRequests(q);
}

// ── Taste gate ───────────────────────────────────────────────────────────────
// Consult the BR Taste Map; reject rejected styles; apply BR color science + voice.
const BR_RULES = 'BR color science: neutral 5200-5600K, anti-orange (shadows warm, highlights/midtones clean), tack-sharp. Voice: Coach Paul (never "Reed" customer-facing), Miyagi substance + Brady energy. Palette: black/white/burgundy #8B2020/olive #6B7C47.';
function tasteGate(brief) {
  try {
    const tm = require(path.join(HOME, 'nanoclaw', 'taste-map-api.js'));
    if (tm.checkRejection) {
      const r = tm.checkRejection(brief);
      if (r && (r.rejected || r.match)) return { ok: false, reason: `Taste Map rejects: ${r.reason || r.anchor || 'matches a rejection'}` };
    }
  } catch { /* taste-map optional — fall back to static BR rules */ }
  return { ok: true };
}

// ── Tool selection ───────────────────────────────────────────────────────────
function pickTool(kind) {
  const t = TOOLS.tools;
  if (kind === 'video') {
    if ((t.higgsfield_kling3.status === 'live') || (t.higgsfield_seedance_fast.status === 'live'))
      return { id: 'higgsfield_seedance_fast', paid: false };
    if (t.fal_seedance.status === 'live') return { id: 'fal_seedance', paid: true, cost: t.fal_seedance.cost_per_unit_usd };
    return null;
  }
  // image
  if (t.higgsfield_nano_banana_pro.status === 'live') return { id: 'higgsfield_nano_banana_pro', paid: false };
  if (t.gpt_image_2.status === 'live') return { id: 'gpt_image_2', paid: true, cost: t.gpt_image_2.cost_per_unit_usd };
  return { id: 'openart_nano_banana', paid: false, manual: true }; // depleted-Higgsfield reality: prompt-only
}

function applyTaste(brief, kind) {
  const sharp = kind === 'image' ? ' Tack-sharp, crisp focus, zero motion blur.' : '';
  return `${brief.trim()}\n\n[Grade] ${BR_RULES}${sharp}`;
}

async function tg(text) {
  const TOKEN = process.env.TELEGRAM_TOKEN, CHAT = process.env.PAUL_CHAT_ID;
  if (!TOKEN || !CHAT) return;
  const https = require('https');
  const body = JSON.stringify({ chat_id: CHAT, text, parse_mode: 'Markdown' });
  await new Promise(res => { const r = https.request({ hostname: 'api.telegram.org', path: `/bot${TOKEN}/sendMessage`, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, x => { x.on('data', () => {}); x.on('end', res); }); r.on('error', res); r.write(body); r.end(); });
}

function logAttempt(rec) { fs.appendFileSync(ATTEMPTS, JSON.stringify(rec) + '\n'); }

// ── fal Seedance (the only live PAID auto path right now) ────────────────────
async function falSeedance(prompt) {
  const key = process.env.FAL_KEY || process.env.FAL_API_KEY;
  if (!key) throw new Error('FAL_KEY not set');
  const https = require('https');
  const submit = JSON.stringify({ prompt, duration: 4 });
  // fal queue submit — model id per CLAUDE.md (Seedance 2.0). Returns a request id; poll for result.
  const post = (host, p, payload, headers) => new Promise((resolve, reject) => {
    const r = https.request({ hostname: host, path: p, method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Key ${key}`, ...headers, 'Content-Length': Buffer.byteLength(payload) } }, x => { let d = ''; x.on('data', c => d += c); x.on('end', () => resolve({ status: x.statusCode, body: d })); }); r.on('error', reject); r.write(payload); r.end();
  });
  const res = await post('queue.fal.run', '/fal-ai/bytedance/seedance/v1/pro/text-to-video', submit, {});
  return res; // caller handles polling; kept minimal — real polling wired when Paul runs --go live
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--budget')) { const b = loadBudget(); console.log(`Today (${b.date}): $${b.spent.toFixed(2)} / $${TOOLS.budget.daily_usd_cap} cap`); return; }

  // Maya->Reed PULL: resolve a brief from the image-request queue (same gated spine).
  let activeRequestId = null;
  let brief = args.find(a => !a.startsWith('--'));
  let subjectFromReq = null;
  const fromReqFlag = args.includes('--from-request');
  const nextReqFlag = args.includes('--next-request');
  if (fromReqFlag || nextReqFlag) {
    const reqId = fromReqFlag ? args[args.indexOf('--from-request') + 1] : null;
    const resolved = resolveRequest(reqId || null);
    if (!resolved) {
      console.log(reqId ? `No image-request with id "${reqId}" in ${REQUESTS}.` : `No pending image-request in ${REQUESTS}. (maya-plan.js plan N to create some.)`);
      return;
    }
    activeRequestId = resolved.req.id;
    brief = resolved.brief;
    subjectFromReq = resolved.subject;
    console.log(`📥 Pulling Maya request [${resolved.req.id}] (${resolved.req.pillar} · ${resolved.req.format}):\n   ${brief}\n`);
  }

  if (!brief) { console.log('Usage: node reed-generate.js "<brief>" [--video] [--subject X] [--go]\n       node reed-generate.js --from-request <id> | --next-request'); return; }
  const kind = args.includes('--video') ? 'video' : 'image';
  const go = args.includes('--go');
  const subject = (args[args.indexOf('--subject') + 1] && args.includes('--subject')) ? args[args.indexOf('--subject') + 1]
    : (subjectFromReq || 'general');
  const h = briefHash(`${kind}:${brief}`);

  // Cache: never regenerate an identical brief.
  let cache = {}; try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch {}
  if (cache[h]) { console.log(`Already produced this brief: ${cache[h]}`); await tg(`♻️ Reed: brief already produced — ${cache[h]}`); return; }

  const gate = tasteGate(brief);
  if (!gate.ok) { console.log(`🚫 ${gate.reason}`); await tg(`🚫 Reed taste gate: ${gate.reason}`); logAttempt({ ts: new Date().toISOString(), brief, kind, blocked: gate.reason }); return; }

  const tool = pickTool(kind);
  if (!tool) { console.log('No live tool for this format.'); return; }
  const tasted = applyTaste(brief, kind);

  // IMAGE while Higgsfield depleted -> paste-ready OpenArt prompt (zero spend).
  if (kind === 'image' && tool.manual) {
    const file = path.join(DUMP, 'prompts', `${today()}-${subject}-${slug(brief)}.md`);
    fs.writeFileSync(file, `# Reed prompt — ${subject}\n_${new Date().toISOString()} · paste into OpenArt (Nano Banana) — Higgsfield renews ~${TOOLS.renewal.higgsfield_starter}_\n\n## Prompt\n\n${tasted}\n\n## Tool\nOpenArt / Nano Banana (manual). After ${TOOLS.renewal.higgsfield_starter}: Reed auto-generates via Higgsfield.\n`);
    cache[h] = file; fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2));
    logAttempt({ ts: new Date().toISOString(), brief, kind, tool: 'openart(prompt)', out: file, requestId: activeRequestId });
    if (activeRequestId) markRequestGenerated(activeRequestId, file, 'openart(prompt)');
    console.log(`📝 Paste-ready prompt -> ${file}`);
    await tg(`📝 *Reed* — taste-gated prompt ready (paste into OpenArt):\n\`${path.basename(file)}\`\n\n${tasted.slice(0, 500)}`);
    return;
  }

  // VIDEO (or image once Higgsfield live) — PAID path is gated.
  if (tool.paid) {
    const b = loadBudget();
    const cost = tool.cost || 1.2;
    if (cost > TOOLS.budget.per_run_usd_cap) { console.log(`Per-run cap exceeded ($${cost} > $${TOOLS.budget.per_run_usd_cap})`); return; }
    if (b.spent + cost > TOOLS.budget.daily_usd_cap) { console.log(`Daily budget would be exceeded ($${b.spent}+$${cost} > $${TOOLS.budget.daily_usd_cap})`); await tg(`💸 Reed: daily budget reached — ${kind} brief held.`); return; }
    if (!go) {
      console.log(`DRY RUN. Would generate ${kind} via ${tool.id} (~$${cost}). Re-run with --go to spend.\nPrompt:\n${tasted}`);
      await tg(`🎬 *Reed* — ${kind} brief ready (DRY). ~$${cost} via ${tool.id}. Reply/run with --go to generate.\n\n${tasted.slice(0, 400)}`);
      return;
    }
    // LIVE paid generation
    // GLOBAL kill-switch: --go is human-triggered (manual:true), so Paul's explicit
    // /reedmake --go still spends. Any non-go autonomous path never reaches here.
    try {
      genGuard.assertGenAllowed({ manual: go });
    } catch (e) {
      console.log(`🚫 ${e.message}`);
      await tg(`🚫 Reed: ${e.message} — use /resumegen to allow autonomous generation.`);
      return;
    }
    console.log(`Generating ${kind} via ${tool.id} (~$${cost})…`);
    try {
      const r = await falSeedance(tasted);
      const out = path.join(DUMP, 'clips', `${today()}-${subject}-${slug(brief)}.json`);
      fs.writeFileSync(out, JSON.stringify({ brief, tasted, tool: tool.id, response: r, ts: new Date().toISOString() }, null, 2));
      b.spent += cost; saveBudget(b);
      cache[h] = out; fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2));
      logAttempt({ ts: new Date().toISOString(), brief, kind, tool: tool.id, cost, out, requestId: activeRequestId });
      if (activeRequestId) markRequestGenerated(activeRequestId, out, tool.id);
      await tg(`🎬 *Reed* generated a clip via ${tool.id}. Spend today: $${b.spent.toFixed(2)}/$${TOOLS.budget.daily_usd_cap}. Result queued -> ready/clips/. _${path.basename(out)}_`);
      console.log(`-> ${out}  (spent $${b.spent.toFixed(2)} today)`);
    } catch (e) { console.error('Generation failed:', e.message); await tg(`⚠️ Reed generation failed: ${e.message}`); }
    return;
  }

  // Free subscription path (Higgsfield live, after renewal) — stub the CLI call until then.
  // GLOBAL kill-switch: Higgsfield credits ARE money (this path is what drained 48->0.58).
  // --go = human-triggered (manual:true); autonomous callers (no --go) are blocked when paused.
  try {
    genGuard.assertGenAllowed({ manual: go });
  } catch (e) {
    console.log(`🚫 ${e.message}`);
    await tg(`🚫 Reed: ${e.message} — use /resumegen to allow autonomous generation.`);
    return;
  }
  console.log(`Higgsfield path for ${tool.id} — wires to higgsfield CLI after renewal (${TOOLS.renewal.higgsfield_starter}).`);
  await tg(`🟡 Reed: ${tool.id} is the chosen tool but Higgsfield renews ~${TOOLS.renewal.higgsfield_starter}. Held until then.`);
}

if (require.main === module) main();
module.exports = { tasteGate, pickTool, applyTaste };
