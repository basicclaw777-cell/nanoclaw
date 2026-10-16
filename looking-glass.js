#!/usr/bin/env node
// looking-glass.js — the thin Looking Glass. Finishes Paul's unfinished thoughts.
//
// Composes the parts already built: his QUESTION-MOVES (elicitation-patterns.json) applied
// to his UNEXPLORED TERRITORY (voids.json) → GHOST IDEAS he might have had → scored on TWO
// lenses (PREFERENCE = will he enjoy it · YIELD = will it produce gold when run) → top N.
// Accumulates (ghost → verdict → outcome) triples = the seed of the prediction layer / second brain.
//
// The dial, not a dichotomy: --lens both|preference|yield. The verifier still rides it —
// a ghost is gold only when RUN, no matter how much it sounds like you.
// WIP. DeepSeek default, Fable optional, fail-safe.
//
// CLI:
//   node looking-glass.js [--n 12] [--lens both|preference|yield] [--engine fable] [--save]
//   node looking-glass.js --review
//   node looking-glass.js --verdict <id> <love|meh|reject|gold> ["note"]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE = path.join(__dirname, 'looking-glass.json');
const env = (() => { try { return fs.readFileSync(path.join(__dirname, '.env'), 'utf8'); } catch { return ''; } })();
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || env.match(/DEEPSEEK_API_KEY=(.+)/)?.[1]?.trim() || null;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || env.match(/ANTHROPIC_API_KEY=(.+)/)?.[1]?.trim() || null;

const args = process.argv.slice(2);
const flag = (f) => { const i = args.indexOf(f); return i >= 0 ? (args[i + 1] ?? true) : null; };
const N = Math.min(parseInt(flag('--n'), 10) || 12, 20);
const LENS = (flag('--lens') || 'both').toString();
const ENGINE = (flag('--engine') || 'deepseek').toString();

function loadJSON(p, d) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } }
function store() { return loadJSON(STORE, { ghosts: [] }); }
function saveStore(s) { fs.writeFileSync(STORE, JSON.stringify(s, null, 2)); }

async function callGen(system, prompt) {
  if (ENGINE === 'fable') {
    if (!ANTHROPIC_KEY) throw new Error('no ANTHROPIC_API_KEY');
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-fable-5', max_tokens: 2600, temperature: 0.85, system, messages: [{ role: 'user', content: prompt }] }) });
    const j = await r.json(); if (j.error) throw new Error(j.error.message); return (j.content || []).map(b => b.text || '').join('');
  }
  if (!DEEPSEEK_KEY) throw new Error('no DEEPSEEK_API_KEY');
  const r = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify({ model: 'deepseek-chat', temperature: 0.85, max_tokens: 2600, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }) });
  const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.choices?.[0]?.message?.content || '';
}

const SYS = `You generate GHOST IDEAS for Paul — ideas he might have had but hasn't formed yet. You apply HIS question-moves to HIS unexplored territory.
Paul: systems-architect builder — boxing-gym owner (Basic Reflex) + sovereign AI builder (the Cathedral) + esoteric/truth researcher. Seeks the mechanism underneath; builds ideas into artifacts; bridges domains; demands a cheap faithful verifier; sovereignty/$0; cross-domain synthesis.
Generate concrete ghost ideas — real things he could build or explore, NOT platitudes. Each MUST name what RUNNING it would produce (the verifier — how he'd know it's real), and be scored honestly on TWO lenses:
- preference (0-10): how much PAUL would ENJOY this — his taste, fun, resonance.
- yield (0-10): how likely it produces real GOLD when RUN — externally checkable value, growth.
A great ghost can be high on one and low on the other; be honest, don't inflate both.
Return ONLY a JSON array: {"idea":"","from":"<which void/move/interest spawned it>","preference":<0-10>,"yield":<0-10>,"run_to_verify":"<what running it produces>","why_paul":"<one line>"}`;

function buildPrompt() {
  const patterns = (loadJSON(path.join(__dirname, 'elicitation-patterns.json'), { patterns: [] }).patterns || []).map(p => `${p.name}: ${p.move}`);
  const voids = (loadJSON(path.join(__dirname, 'voids.json'), { voids: [] }).voids || []).map(v => `${v.a} × ${v.b}`);
  return `Apply HIS question-moves:\n${patterns.slice(0, 12).map(p => '- ' + p).join('\n')}\n\nto HIS unexplored VOIDS (deep but never bridged):\n${voids.map(v => '- ' + v).join('\n')}\n\nAlso draw on his abandoned seeds (interests he touched but didn't deepen). Generate ${N} ghost ideas. Honest two-lens scores.`;
}

const composite = (g) => LENS === 'preference' ? g.preference : LENS === 'yield' ? g.yield : (g.preference + g.yield) / 2;

async function generate() {
  let raw; try { raw = await callGen(SYS, buildPrompt()); } catch (e) { console.log(`${ENGINE} error:`, e.message); return; }
  const m = raw.match(/\[[\s\S]*\]/); let ghosts; try { ghosts = JSON.parse(m ? m[0] : raw); } catch { console.log('parse fail:\n', raw.slice(0, 300)); return; }
  ghosts = ghosts.filter(g => g.idea && g.run_to_verify && typeof g.preference === 'number' && typeof g.yield === 'number');
  ghosts.sort((a, b) => composite(b) - composite(a));

  console.log(`\n🔮 THE LOOKING GLASS — ${ghosts.length} ghost ideas · lens=${LENS} · engine=${ENGINE}`);
  console.log(`   (P = will you enjoy it · Y = will it yield gold when run)\n`);
  ghosts.forEach((g, i) => {
    const star = i < 3 ? '★' : ' ';
    console.log(`${star} P${g.preference} Y${g.yield}  ${g.idea}`);
    console.log(`     from: ${g.from}`);
    console.log(`     run → ${g.run_to_verify}\n`);
  });
  console.log(`★ = top 3 by ${LENS}. The verifier rides it: a ghost is gold only when RUN, however much it sounds like you.`);

  if (flag('--save')) {
    const s = store(); let id = s.ghosts.length;
    for (const g of ghosts) s.ghosts.push({ id: id++, ...g, lens: LENS, verdict: null, outcome: null, added: '2026-06-11' });
    saveStore(s);
    console.log(`\n→ saved ${ghosts.length} ghosts (ids ${id - ghosts.length}–${id - 1}). Verdict them: looking-glass.js --verdict <id> <love|meh|reject|gold>`);
  } else console.log('\n(--save to bank these + build the prediction layer)');
}

function review() {
  const s = store(); const pending = s.ghosts.filter(g => !g.verdict);
  console.log(`\n📋 ${pending.length} ghosts awaiting verdict (of ${s.ghosts.length} total)\n`);
  for (const g of pending) console.log(`  [${g.id}] P${g.preference} Y${g.yield}  ${g.idea}`);
}

function verdict() {
  const s = store(); const id = parseInt(args[args.indexOf('--verdict') + 1], 10);
  const v = (args[args.indexOf('--verdict') + 2] || '').toLowerCase();
  const note = args[args.indexOf('--verdict') + 3];
  const g = s.ghosts.find(x => x.id === id);
  if (!g) { console.log(`no ghost id ${id}. --review to list.`); return; }
  if (!['love', 'meh', 'reject', 'gold'].includes(v)) { console.log('verdict must be: love | meh | reject | gold'); return; }
  g.verdict = v; if (note) g.note = note;
  saveStore(s);
  console.log(`✅ ghost ${id} → ${v}. (predicted P${g.preference}/Y${g.yield}) — the prediction layer learns your gap between predicted and actual.`);
}

if (args.includes('--verdict')) verdict();
else if (flag('--review')) review();
else generate();
