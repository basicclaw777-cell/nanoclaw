#!/usr/bin/env node
'use strict';
/**
 * maya-plan.js — Maya's content brain. The Maya->Reed PULL half of the loop.
 *
 * THE LOOP (Flow 2):
 *   Maya content plan -> image REQUEST (brief) -> Reed request-queue
 *   -> Reed generates (gated spine) -> GATE -> Maya caption -> publish.
 *
 * Reed used to PUSH images that Maya only captioned. This makes Maya the
 * content DIRECTOR: she reads her plan (maya-content-plan.json) + her recent
 * output, then emits N concrete IMAGE REQUESTS (visual briefs) for Reed.
 * reed-generate.js --from-request <id> pulls them through the normal gated
 * spine (taste gate, tool pick, budget, DRY-by-default). No auto-spend.
 *
 * Maya runs via agent-engine.run('maya', ...) — DeepSeek, cheap, BR voice.
 *
 * CLI:
 *   node maya-plan.js plan [N]   # Maya emits N image requests -> image-requests.json
 *   node maya-plan.js list       # show the request queue
 *
 * Exports: pending() -> array of requests with status:"requested".
 */

const fs = require('fs');
const path = require('path');
const HOME = process.env.HOME;
const REED = path.join(HOME, 'nanoclaw', 'reed');
const DUMP_READY = path.join(HOME, 'reed-dump', 'ready');
const PLAN_FILE = path.join(REED, 'maya-content-plan.json');
const QUEUE_FILE = path.join(REED, 'image-requests.json');
const ATTEMPTS = path.join(REED, 'attempts.jsonl');
const AGENT_ENGINE = path.join(HOME, 'Cathedral', 'agents', 'agent-engine.js');

// ── helpers ───────────────────────────────────────────────────────────────
function loadJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function loadQueue() { return loadJSON(QUEUE_FILE, []); }
function saveQueue(q) { fs.writeFileSync(QUEUE_FILE, JSON.stringify(q, null, 2)); }
function pending() { return loadQueue().filter(r => r.status === 'requested'); }
function nextId(q) {
  const n = q.reduce((m, r) => {
    const x = parseInt(String(r.id).replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(x) && x > m ? x : m;
  }, 0);
  return `req-${String(n + 1).padStart(3, '0')}`;
}

// What has Reed produced recently — so Maya doesn't repeat herself.
function recentOutput(limit = 8) {
  const lines = [];
  try {
    const raw = fs.readFileSync(ATTEMPTS, 'utf8').trim().split('\n').filter(Boolean);
    for (const l of raw.slice(-limit)) {
      try { const r = JSON.parse(l); lines.push(`- ${r.kind}: "${r.brief}"`); } catch {}
    }
  } catch {}
  // Also peek at any landed prompt/image files for awareness.
  try {
    const pdir = path.join(DUMP_READY, 'prompts');
    for (const f of fs.readdirSync(pdir).slice(-limit)) lines.push(`- prompt-on-disk: ${f}`);
  } catch {}
  return lines.length ? lines.join('\n') : '(no recent Reed output on record — fresh feed)';
}

// ── the brain: ask Maya for N image requests ───────────────────────────────
function buildDirectorMessage(plan, n) {
  const pillars = plan.pillars.map(p =>
    `  • ${p.name} (${p.weekly_target}) — ${p.description} [example: ${p.example_post_type}]`
  ).join('\n');

  return [
    `You are acting as Basic Reflex's CONTENT DIRECTOR, not just a caption writer.`,
    `Your job right now: look at the content plan and recent output, then REQUEST the exact images you need Reed to generate next.`,
    ``,
    `CONTENT PLAN — PILLARS (cadence: ${plan.cadence.posts_per_week} posts/week):`,
    pillars,
    ``,
    `RECENT REED OUTPUT (don't duplicate these):`,
    recentOutput(),
    ``,
    `TASK: Emit exactly ${n} concrete IMAGE REQUESTS. Each one is a short visual brief for Reed — what the image should SHOW, grounded in a pillar, in real BR voice (warm, genuine, never salesy; "Coach Paul" never "Reed"; member is the story, not a prop). Spread across different pillars where it makes sense. Keep each brief shootable and specific (subject + what's happening + mood), not a finished caption.`,
    ``,
    `Respond with ONLY a JSON array, no prose, no markdown fences. Each element:`,
    `{ "pillar": "<one of the pillar names above>", "brief": "<the visual brief, one or two sentences>", "format": "<post | reel | story | carousel>" }`,
  ].join('\n');
}

// Pull the first JSON array out of an LLM response (tolerates fences / stray prose).
function extractJSONArray(text) {
  if (!text) return null;
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = t.indexOf('[');
  const end = t.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return null;
  const slice = t.slice(start, end + 1);
  try { return JSON.parse(slice); } catch { return null; }
}

async function plan(n) {
  const planData = loadJSON(PLAN_FILE, null);
  if (!planData || !Array.isArray(planData.pillars)) {
    console.error(`No content plan at ${PLAN_FILE}. Aborting.`);
    process.exitCode = 1;
    return [];
  }

  let run;
  try { ({ run } = require(AGENT_ENGINE)); }
  catch (e) {
    console.error(`Could not load agent-engine (${e.message}). Cannot run Maya.`);
    process.exitCode = 1;
    return [];
  }

  const message = buildDirectorMessage(planData, n);
  let resText = '';
  try {
    const res = await run('maya', message, 'maya-plan-cli', {});
    resText = (res && (res.text || res.reply || res.content)) || (typeof res === 'string' ? res : '');
  } catch (e) {
    console.error(`Maya run failed: ${e.message}`);
    console.error(`(Blocker: agent-engine.run('maya') errored — likely DeepSeek key/credits or network. No requests written.)`);
    process.exitCode = 1;
    return [];
  }

  const arr = extractJSONArray(resText);
  if (!arr || !arr.length) {
    console.error('Maya did not return a parseable JSON array. Raw response below:');
    console.error(resText.slice(0, 1200));
    process.exitCode = 1;
    return [];
  }

  const validPillars = new Set(planData.pillars.map(p => p.name));
  const q = loadQueue();
  const created = [];
  for (const item of arr.slice(0, n)) {
    if (!item || !item.brief) continue;
    const id = nextId(q.concat(created));
    const rec = {
      id,
      pillar: validPillars.has(item.pillar) ? item.pillar : (item.pillar || 'Unsorted'),
      brief: String(item.brief).trim(),
      format: (item.format || 'post').trim(),
      status: 'requested',
      ts: new Date().toISOString(),
      source: 'maya-plan',
    };
    created.push(rec);
  }
  saveQueue(q.concat(created));

  console.log(`Maya requested ${created.length} image(s):\n`);
  for (const r of created) {
    console.log(`  [${r.id}] (${r.pillar} · ${r.format})`);
    console.log(`    ${r.brief}\n`);
  }
  console.log(`Queue: ${QUEUE_FILE}`);
  console.log(`Generate one (gated, DRY by default): node reed-generate.js --from-request ${created[0]?.id || '<id>'}`);
  return created;
}

function list() {
  const q = loadQueue();
  if (!q.length) { console.log('Image request queue is empty.'); return; }
  console.log(`Image request queue (${q.length}):\n`);
  for (const r of q) {
    const out = r.output ? ` -> ${path.basename(r.output)}` : '';
    console.log(`  [${r.id}] ${r.status.toUpperCase()} · ${r.pillar} · ${r.format}${out}`);
    console.log(`    ${r.brief}`);
    console.log(`    ${r.ts}\n`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (cmd === 'plan') {
    const n = Math.max(1, Math.min(10, parseInt(args[1], 10) || 3));
    await plan(n);
  } else if (cmd === 'list') {
    list();
  } else {
    console.log('Usage:\n  node maya-plan.js plan [N]   # Maya emits N image requests\n  node maya-plan.js list       # show the request queue');
  }
}

if (require.main === module) main();
module.exports = { pending, loadQueue, plan, list };
