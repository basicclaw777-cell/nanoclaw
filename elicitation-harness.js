#!/usr/bin/env node
// elicitation-harness.js — the engine-families loop, pointed at Paul's own question-moves.
//
// Knows his best ELICITATION PATTERNS (ways of asking that make curiosity generative),
// lets him ADD new ones, PREDICTS new ones in his style, and learns which YIELD via an
// outcome loop. Same shape as generative-openings: library × generator × verifier.
// The verifier here = "does running this move yield gold?" (cheap, faithful, neglected).
//
// WIP. DeepSeek default, Fable optional, fail-safe without a key.
//
// CLI:
//   node elicitation-harness.js --list
//   node elicitation-harness.js --predict [--n 5] [--engine fable] [--save]
//   node elicitation-harness.js --log "<pattern name>" <yield 0-10> ["note"]
//   node elicitation-harness.js --surface          (push a high-yield move you haven't used lately)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE = path.join(__dirname, 'elicitation-patterns.json');
const env = (() => { try { return fs.readFileSync(path.join(__dirname, '.env'), 'utf8'); } catch { return ''; } })();
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || env.match(/DEEPSEEK_API_KEY=(.+)/)?.[1]?.trim() || null;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || env.match(/ANTHROPIC_API_KEY=(.+)/)?.[1]?.trim() || null;

const args = process.argv.slice(2);
const flag = (f) => { const i = args.indexOf(f); return i >= 0 ? (args[i + 1] ?? true) : null; };
const ENGINE = (flag('--engine') || 'deepseek').toString();

const SEED = [
  ['The 4-to-8', 'ask "what takes this from a 4 to an 8?"', 'output is decent but not great', 'creative leaps; skips planning, trusts the builder'],
  ['Mechanism-underneath', 'ask "what does X actually DO / how does it work underneath?"', 'any new tool, material, or concept', 'transferable models, not facts'],
  ['Floorplan-not-spray', 'ask "where does this structurally tend to be?" — navigate by priors', 'before a search', 'targeted finds instead of blind spray'],
  ['The non-obvious thread', 'ask "what\'s the deeper connection here?"', 'several threads present at once', 'the gold others miss'],
  ['What-would-have-to-be-true', 'ask "for all of this to connect, what must hold?"', 'a pile of findings', 'the hidden assumption; the synthesis'],
  ['Bigger-picture-unprompted', 'ask "what larger move is this an instance of?"', 'mid-build', 'the meta-frame; platform vs tool'],
  ['Cross-domain bridge', 'ask "map X from another field onto this"', 'stuck, or genuinely curious', 'novel combinations (jet engine → coaching)'],
  ['Held tension', 'ask "can we run both and let data decide?"', 'a binary choice', 'avoids premature resolution'],
  ['Prove-it', 'ask "what\'s the falsifiable test with a known key?"', 'a real-vs-performative doubt', 'a blind, scored experiment'],
  ['Registration test', 'ask "did I predict this BEFORE, or am I retrofitting?"', 'a conviction or a read on someone', 'separates signal from story'],
  ['Where\'s-the-verifier', 'ask "what\'s the cheap, faithful truth-check here?"', 'any AI-leverage or build question', 'the leverage diagnostic'],
  ['Steal-the-blueprint', 'ask "what\'s the reusable pattern under this product, rebuilt sovereign?"', 'an external tool or product', 'the architecture, not the dependency'],
];

function load() {
  try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch {
    const patterns = SEED.map(([name, move, fires_when, yields]) => ({ name, move, fires_when, yields, yield_score: 7, uses: 0, source: 'seed', added: '2026-06-11' }));
    const db = { patterns };
    fs.writeFileSync(STORE, JSON.stringify(db, null, 2));
    return db;
  }
}
function save(db) { fs.writeFileSync(STORE, JSON.stringify(db, null, 2)); }

function list() {
  const db = load();
  const ps = [...db.patterns].sort((a, b) => (b.yield_score || 0) - (a.yield_score || 0));
  console.log(`\n🧠 ELICITATION PATTERNS — ${ps.length} (ranked by yield)\n`);
  for (const p of ps) console.log(`  ${String(p.yield_score).padStart(2)}  ${p.name}${p.source === 'candidate' ? ' [candidate]' : ''}\n      ${p.move}\n      fires: ${p.fires_when} · yields: ${p.yields} · used ${p.uses}×\n`);
}

function logYield() {
  const db = load();
  const name = (flag('--log') || '').toString().toLowerCase();
  const score = parseFloat(args[args.indexOf('--log') + 2]);
  const note = args[args.indexOf('--log') + 3];
  const p = db.patterns.find(x => x.name.toLowerCase().includes(name) || name.includes(x.name.toLowerCase()));
  if (!p) { console.log(`no pattern matching "${name}". --list to see names.`); return; }
  if (isNaN(score)) { console.log('need a yield 0-10: --log "name" 8 "note"'); return; }
  // running mean
  p.yield_score = +(((p.yield_score || 5) * (p.uses || 0) + score) / ((p.uses || 0) + 1)).toFixed(2);
  p.uses = (p.uses || 0) + 1;
  if (note) { p.notes = p.notes || []; p.notes.push(note); }
  if (p.source === 'candidate' && p.uses >= 1) p.source = 'confirmed';
  save(db);
  console.log(`✅ logged yield ${score} for "${p.name}" → score ${p.yield_score} (${p.uses}×). The loop turns.`);
}

function surface() {
  const db = load();
  // push a high-yield pattern that's been used least recently / least often
  const ps = [...db.patterns].filter(p => p.source !== 'candidate')
    .sort((a, b) => (b.yield_score - a.yield_score) || (a.uses - b.uses));
  const pick = ps.filter(p => p.uses <= 1)[0] || ps[Math.min(2, ps.length - 1)];
  console.log(`\n💡 ELICITATION NUDGE (pull → push)\n`);
  console.log(`   Try the "${pick.name}" move — you under-use it (used ${pick.uses}×, yield ${pick.yield_score}).`);
  console.log(`   → ${pick.move}`);
  console.log(`   on whatever you're circling right now. It tends to yield: ${pick.yields}.\n`);
}

async function callGen(system, prompt) {
  if (ENGINE === 'fable') {
    if (!ANTHROPIC_KEY) throw new Error('no ANTHROPIC_API_KEY');
    const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-fable-5', max_tokens: 1600, temperature: 0.8, system, messages: [{ role: 'user', content: prompt }] }) });
    const j = await res.json(); if (j.error) throw new Error(j.error.message); return (j.content || []).map(b => b.text || '').join('');
  }
  if (!DEEPSEEK_KEY) throw new Error('no DEEPSEEK_API_KEY');
  const res = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify({ model: 'deepseek-chat', temperature: 0.8, max_tokens: 1600, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }) });
  const j = await res.json(); if (j.error) throw new Error(j.error.message); return j.choices?.[0]?.message?.content || '';
}

const PREDICT_SYS = `You study Paul's ELICITATION PATTERNS — the question-MOVES that make his curiosity generative. A move is a reusable WAY OF ASKING that triggers across many domains, NOT a topic.
His style: seeks the mechanism underneath; picks the non-obvious thread; builds answers into artifacts; bridges domains; demands a cheap faithful verifier / falsifiable check; hunts the bigger move; steals architectures and rebuilds sovereign.
Propose NEW, DISTINCT moves that fit his style but aren't already in his library. Be honest — a generic "ask why" is worse than no candidate. Each must be a phrasing he could actually deploy.
Return ONLY a JSON array: {"name":"","move":"<the question-form / a phrasing>","fires_when":"","yields":"","why_his_style":""}`;

async function predict() {
  const db = load();
  const n = parseInt(flag('--n'), 10) || 5;
  const have = db.patterns.map(p => p.name);
  const prompt = `His catalogued moves:\n${have.map(h => '- ' + h).join('\n')}\n\nPropose ${n} NEW distinct elicitation moves in his style, not already listed.`;
  let raw; try { raw = await callGen(PREDICT_SYS, prompt); } catch (e) { console.log(`${ENGINE} error:`, e.message); return; }
  const m = raw.match(/\[[\s\S]*\]/); let cands; try { cands = JSON.parse(m ? m[0] : raw); } catch { console.log('parse fail:\n', raw.slice(0, 300)); return; }
  const haveLower = new Set(have.map(h => h.toLowerCase()));
  const fresh = cands.filter(c => c.name && c.move && !haveLower.has(c.name.toLowerCase()));
  console.log(`\n🔮 PREDICTED elicitation moves (${ENGINE}) — new, in your style:\n`);
  for (const c of fresh) console.log(`  ◆ ${c.name}\n      ${c.move}\n      fires: ${c.fires_when} · yields: ${c.yields}\n      why you: ${c.why_his_style}\n`);
  if (flag('--save') && fresh.length) {
    for (const c of fresh) db.patterns.push({ name: c.name, move: c.move, fires_when: c.fires_when, yields: c.yields, yield_score: 5, uses: 0, source: 'candidate', added: '2026-06-11' });
    save(db); console.log(`→ saved ${fresh.length} as candidates (yield 5, unproven). Confirm them by using them + --log the yield.`);
  } else if (fresh.length) console.log('(--save to add as candidates)');
}

if (flag('--list')) list();
else if (args.includes('--log')) logYield();
else if (flag('--surface')) surface();
else if (flag('--predict')) predict();
else console.log('usage: --list | --predict [--n N --engine fable --save] | --log "name" <0-10> ["note"] | --surface');
