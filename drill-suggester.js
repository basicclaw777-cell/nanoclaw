#!/usr/bin/env node
// drill-suggester.js — the GENERATIVE twin of taste-curator.js (which DISCOVERS drills
// from video). This one GENERATES new drill ideas from Paul's taste fingerprint.
//
// The loop, made generative:
//   Knowledge (taste map: dimensions, qualities, rejections, anchor palette)
//   + Outcome (what's been landing / failing — domain='boxing')
//   → generate NEW drills that HOLD the taste but CHANGE the goal/category/block
//   → gate against rejections (cheap pre-filter; Paul + the outcome loop are the real gate)
//   → queue to taste-candidates.json for review  (propose → Paul tries → outcome confirms)
//
// WORK IN PROGRESS — content is liquid. DeepSeek generation, fail-safe without a key.
//
// CLI:
//   node drill-suggester.js --goal "initiate clinch off the duck" \
//        [--category setups] [--block 5] [--seed "flow footwork"] [--n 3] [--queue]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getTasteProfile } from './taste-map-api.js';
import { getOutcomes } from './outcome-ledger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CANDIDATES_PATH = path.join(__dirname, 'taste-candidates.json');
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY
  || (() => { try { return fs.readFileSync(path.join(__dirname, '.env'), 'utf8').match(/DEEPSEEK_API_KEY=(.+)/)?.[1]?.trim(); } catch { return null; } })();

const args = process.argv.slice(2);
const flag = (f) => { const i = args.indexOf(f); return i >= 0 ? (args[i + 1] ?? true) : null; };

const profile = getTasteProfile('boxing_drills');
if (!profile) { console.log('No boxing_drills taste profile found.'); process.exit(1); }

// ── outcome feedback: what's landing / failing (closes the loop) ──────────────
function outcomeBias() {
  let outs = [];
  try { outs = getOutcomes({ domain: 'boxing', limit: 50 }); } catch {}
  const drillOf = (o) => (o.description || '').match(/drill:([^·]+)/)?.[1]?.trim();
  const landing = [...new Set(outs.filter(o => o.result === 'SUCCESS').map(drillOf).filter(Boolean))];
  const failing = [...new Set(outs.filter(o => o.result === 'FAILURE').map(drillOf).filter(Boolean))];
  return { landing, failing };
}

// ── rejection gate (cheap backstop — the human + outcome loop are the real gate) ──
const REJECT_TOKENS = profile.rejections.map(r => {
  const m = r.toLowerCase();
  if (m.includes('mindless')) return 'mindless';
  if (m.includes('speed or power')) return 'speed-or-power-only';
  if (m.includes('one-directional')) return 'one-directional';
  if (m.includes('broken down') || m.includes('chunk')) return 'not-chunkable';
  if (m.includes('no underlying principle')) return 'no-principle';
  if (m.includes('pure conditioning')) return 'pure-conditioning';
  if (m.includes('constant coach direction')) return 'coach-dependent';
  if (m.includes('winging')) return 'unstructured';
  return null;
}).filter(Boolean);

function gate(cand) {
  // LLM self-certification first
  if (cand.respects_rejections === false) return cand.rejection_risk || 'self-flagged';
  // keyword backstop on obvious anti-patterns
  const txt = `${cand.name} ${cand.how}`.toLowerCase();
  if (/mindless|just repeat|only speed|only power/.test(txt)) return 'anti-pattern phrasing';
  // must declare at least one taste dimension
  if (!Array.isArray(cand.dimensions) || !cand.dimensions.some(d => profile.dimensions.includes(d))) return 'no taste dimension';
  return null; // passes
}

const SYSTEM = `You generate NEW boxing drill ideas in the exact taste of one coach (Coach Paul). You are not listing famous drills — you invent fresh ones that carry his taste.

HIS TASTE — a drill is good when it has these qualities (the dimensions):
${profile.dimensions.map(d => '• ' + d).join('\n')}
Confirmed good qualities (anchors of his taste):
${profile.confirmed_qualities.slice(0, 12).map(q => '• ' + q).join('\n')}

HARD REJECTIONS — a drill that is any of these is WRONG, never propose it:
${profile.rejections.map(r => '✗ ' + r).join('\n')}

EXAMPLES he already loves (the palette — match this flavour, do not copy):
${profile.anchors.slice(0, 12).map(a => '• ' + a.item).join('\n')}

RULES:
- Hold the taste; change the GOAL. The output is a drill that FEELS like his palette but aims at the requested goal.
- Each drill: short, runnable, a real floor drill — not a paragraph of theory.
- Tag the dimensions it hits (use the exact dimension names above) and the 10-block it serves (1-10).
- Set respects_rejections=false and name rejection_risk if a drill drifts toward any rejection.

Return ONLY a JSON array, each item:
{"name":"","how":"<1-2 lines, how to run it>","dimensions":["",""],"category":"","block":<1-10>,"principle":"<one line: what it teaches>","isPartner":true|false,"why_taste":"<one line: why it's his taste>","respects_rejections":true,"rejection_risk":""}`;

function buildUserPrompt() {
  const goal = flag('--goal');
  const category = flag('--category');
  const block = flag('--block');
  const seedName = flag('--seed');
  const n = parseInt(flag('--n'), 10) || 3;
  const { landing, failing } = outcomeBias();

  let seedFp = null;
  if (typeof seedName === 'string') {
    const a = profile.anchors.find(x => x.item.toLowerCase().includes(seedName.toLowerCase()));
    if (a) seedFp = { item: a.item, dimensions: a.dimensions, categories: a.categories };
  }

  const lines = [`Generate ${n} new drills.`];
  if (goal && goal !== true) lines.push(`OUTPUT GOAL (what they should achieve): ${goal}`);
  if (category && category !== true) lines.push(`CATEGORY (must fit): ${category}`);
  if (block && block !== true) lines.push(`Serve 10-block: ${block}`);
  if (seedFp) lines.push(`SEED FINGERPRINT — keep THIS drill's taste: "${seedFp.item}" (dimensions: ${(seedFp.dimensions||[]).join(', ')}). Hold that feel, change the goal.`);
  if (landing.length) lines.push(`RECENTLY LANDING (lean toward this shape): ${landing.join('; ')}`);
  if (failing.length) lines.push(`RECENTLY FAILED (avoid this shape): ${failing.join('; ')}`);
  return { prompt: lines.join('\n'), goal, category, block, n };
}

async function callDeepSeek(system, prompt) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify({ model: 'deepseek-chat', temperature: 0.6, max_tokens: 1100,
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message);
  return j.choices?.[0]?.message?.content || '';
}

function queueCandidates(accepted, meta) {
  let store; try { store = JSON.parse(fs.readFileSync(CANDIDATES_PATH, 'utf8')); }
  catch { store = { candidates: [], lastScan: null, stats: { scanned: 0, queued: 0, accepted: 0, rejected: 0 } }; }
  let i = 0;
  for (const c of accepted) {
    store.candidates.push({
      id: 'gen-' + Date.now() + '-' + (i++),
      source: 'generated', domain: 'boxing_drills', status: 'pending',
      drillName: c.name, principle: c.principle, isPartner: !!c.isPartner,
      how: c.how, category: c.category, block: c.block, dimensions: c.dimensions,
      why_taste: c.why_taste, goal: meta.goal && meta.goal !== true ? meta.goal : null,
    });
  }
  store.stats = store.stats || {}; store.stats.queued = (store.stats.queued || 0) + accepted.length;
  fs.writeFileSync(CANDIDATES_PATH, JSON.stringify(store, null, 2));
}

async function main() {
  if (!DEEPSEEK_KEY) { console.log('[drill-suggester] no DEEPSEEK_API_KEY — generation unavailable (fail-safe).'); return; }
  const { prompt, goal, category, block, n } = buildUserPrompt();
  if (!goal && !category && !flag('--seed')) {
    console.log('Give it direction: --goal "..." and/or --category X --block N --seed "anchor name". [--queue to save, --n N]');
    return;
  }
  console.log(`[drill-suggester] generating ${n} drills · goal=${goal||'-'} category=${category||'-'} block=${block||'-'}\n`);
  let raw; try { raw = await callDeepSeek(SYSTEM, prompt); } catch (e) { console.log('DeepSeek error:', e.message); return; }
  const m = raw.match(/\[[\s\S]*\]/);
  let cands; try { cands = JSON.parse(m ? m[0] : raw); } catch { console.log('Could not parse generation. Raw:\n', raw.slice(0, 400)); return; }

  const accepted = [], rejected = [];
  for (const c of cands) { const why = gate(c); (why ? rejected : accepted).push(why ? { c, why } : c); }

  for (const c of accepted) {
    console.log(`✅ ${c.name}  [B${c.block} · ${c.category}${c.isPartner ? ' · partner' : ''}]`);
    console.log(`   ${c.how}`);
    console.log(`   taste: ${(c.dimensions || []).join(', ')} — ${c.why_taste}`);
    console.log(`   teaches: ${c.principle}\n`);
  }
  for (const r of rejected) console.log(`❌ gated: ${r.c.name} — ${r.why}`);

  if (flag('--queue') && accepted.length) { queueCandidates(accepted, { goal, category, block }); console.log(`\n→ queued ${accepted.length} to taste-candidates.json (status: pending) for review.`); }
  else if (accepted.length) console.log(`\n(${accepted.length} generated — add --queue to save them for review.)`);
}

main();
