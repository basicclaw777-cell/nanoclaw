#!/usr/bin/env node
// generative-openings.js — standing hunt for UNTAPPED Noyron-able domains, across the
// engine families, with SUBSTRATE tagging so the points are map-ready from the first one.
//
// Thesis: AI searches a space too big for humans, scored by a CHEAP verifier, in a
// NEGLECTED domain → "alien" outputs. AI's leverage ≈ how cheap+true the verifier is.
//
// Families (--mode):
//   design    forward synthesis — make an artifact, a cheap SIM scores it.
//   sensing   inverse — decode a cheap ambient signal → hidden truth (constructive only).
//   strategy  invent a METHOD/policy/algorithm — a cheap sim/benchmark scores it.
//   optimize  pack/route/schedule — a cheap INSTANT objective scores it.
//
// Every candidate is ALSO tagged on the SUBSTRATE axes (the hidden dimensions that predict
// leverage) so the accumulating points form a map. The substrate is "real" only when it
// predicts held-out leverage — not yet, we're collecting points.
//
// Forensic: a fabricated verifier/coupling is worse than no candidate — omit if unsure.
// WIP. DeepSeek, fail-safe without key. Budget-capped per run (SI-31).
//
// CLI:  node generative-openings.js --mode strategy --n 7 [--seed "..."] [--report]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME;
const STORE = path.join(__dirname, 'generative-openings.json');
const REPORT_DIR = path.join(HOME, 'cathedral-vault', '00_Staging', 'cathedral');
const KEY = process.env.DEEPSEEK_API_KEY
  || (() => { try { return fs.readFileSync(path.join(__dirname, '.env'), 'utf8').match(/DEEPSEEK_API_KEY=(.+)/)?.[1]?.trim(); } catch { return null; } })();

const args = process.argv.slice(2);
const flag = (f) => { const i = args.indexOf(f); return i >= 0 ? (args[i + 1] ?? true) : null; };
const N = Math.min(parseInt(flag('--n'), 10) || 6, 12);
const MODE = (flag('--mode') || 'design').toString();
const ENGINE = (flag('--engine') || 'deepseek').toString();  // deepseek | fable
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
  || (() => { try { return fs.readFileSync(path.join(__dirname, '.env'), 'utf8').match(/ANTHROPIC_API_KEY=(.+)/)?.[1]?.trim(); } catch { return null; } })();
const FABLE_MODEL = process.env.FABLE_MODEL || 'claude-fable-5';

// Shared SUBSTRATE schema — the axes the map will resolve. Appended to every return spec.
const SUBSTRATE = `"substrate":{"verifier_cheapness":<0-10, 10=instant/free truth-check>,"verifier_fidelity":<0-10, 10=the cheap check perfectly matches reality (the sim-to-real gap)>,"search_structure":"continuous|geometric|combinatorial|symbolic|sequential","generation_tractability":<0-10, can AI parameterise+propose candidates>,"fabrication_cost":<0-10, 10=cheap/none to build+test the winner; pure-software=10>,"data_availability":<0-10>,"neglect_density":<0-10, 10=wide open>}`;
const SUBSTRATE_NOTE = `Also score each candidate honestly on the SUBSTRATE axes — these become a map of where AI leverage lives, so do not inflate them.`;

const SYS = {
  design: `You hunt UNTAPPED generative-design domains — an AI generating from first principles, scored by a CHEAP simulator, producing designs no human would draw (Noyron/Leap71).
Qualify ONLY if ALL hold: (1) CHEAP VERIFIER — name a REAL simulator running on a laptop/cheap workstation in <1 day (OpenFOAM, k-Wave, Elmer/CalculiX, openEMS, KLayout, RDKit); wet lab / wind tunnel / clinical / fab → drop. (2) BIG SEARCH SPACE. (3) NEGLECTED — big labs haven't saturated it.
Be STRICT — a hand-wavy verifier is worse than none; omit it. Avoid protein folding, code-gen, aerospace CFD, drug discovery. ${SUBSTRATE_NOTE}
Return ONLY a JSON array, each: {"domain":"","verifier":"<named tool + how it scores>","verifier_cost":"laptop|workstation|expensive","search_space":"","neglect_reason":"","alien_example":"","score":<0-10>,${SUBSTRATE}}`,

  sensing: `You hunt UNTAPPED inverse-sensing openings — a CHEAP ambient signal decoded into a hidden truth ("treat the noise as a sensor").
Qualify ONLY if ALL hold: (1) CHEAP SENSOR everyone has (phone mic/cam, $30 SDR, WiFi card, contact mic, accelerometer, photodiode). (2) REAL PHYSICAL COUPLING — name how the hidden cause modulates the signal. (3) GROUND-TRUTH VERIFIER YOU CONTROL — independently capture the true answer cheaply and check the decode (name it). (4) CONSTRUCTIVE, NON-SURVEILLANCE TARGET — machines/structures/nature/materials/environment/self-with-consent ONLY; NEVER covert monitoring or ID of people. (5) NEGLECTED.
Be STRICT — fabricated coupling/verifier is worse than none; omit. Reject anything whose main use is spying on people. ${SUBSTRATE_NOTE}
Return ONLY a JSON array, each: {"domain":"","signal":"","sensor":"","coupling":"<physics>","verifier":"<ground truth + how checked>","target_class":"machine|structure|nature|material|self|environment","constructive_use":"","neglect_reason":"","alien_example":"","score":<0-10>,${SUBSTRATE}}`,

  strategy: `You hunt UNTAPPED strategy/algorithm-discovery openings — AI invents a METHOD, policy, heuristic, or algorithm, and a CHEAP simulation or benchmark scores how well it performs (AlphaZero-shaped, in neglected niches).
Qualify ONLY if ALL hold: (1) CHEAP SIM/BENCHMARK — name a concrete simulator/benchmark/executable model that scores a proposed strategy in seconds-minutes on a laptop (SUMO traffic, ns-3, MuJoCo/PyBullet, a market replay, a discrete-event sim). (2) BIG STRATEGY SPACE — many possible policies/heuristics, beyond hand-search. (3) A BETTER METHOD MATTERS. (4) NEGLECTED — NOT chess/Go/standard RL benchmarks.
Be STRICT — name a REAL cheap scorer or omit. ${SUBSTRATE_NOTE}
Return ONLY a JSON array, each: {"domain":"","strategy_space":"","simulator":"<named + how it scores a strategy>","value_if_found":"","neglect_reason":"","alien_example":"","score":<0-10>,${SUBSTRATE}}`,

  optimize: `You hunt UNTAPPED combinatorial-optimization openings — pack/route/schedule/assign/layout problems with a CHEAP, INSTANT objective function, in neglected real-world niches.
Qualify ONLY if ALL hold: (1) CHEAP INSTANT OBJECTIVE — a clear computable score for any candidate solution (named: OR-Tools/CP-SAT model, packing-density calc, wirelength metric). (2) HUGE COMBINATORIAL SPACE. (3) REAL NEGLECTED NICHE — a specific applied problem, NOT generic TSP/VRP/bin-packing demos.
Be STRICT — name the concrete objective or omit. ${SUBSTRATE_NOTE}
Return ONLY a JSON array, each: {"domain":"","objective":"<named + what it scores>","space":"","value_if_solved":"","neglect_reason":"","alien_example":"","score":<0-10>,${SUBSTRATE}}`,
};

function userPrompt() {
  const seed = flag('--seed');
  const spans = {
    design: 'Span physical (acoustic, EM, structural, thermal, fluidic, optical) and formal spaces.',
    sensing: 'Span signals: RF/WiFi, vibration, acoustic, optical/light, EM, power, thermal. CONSTRUCTIVE targets only — NO surveillance of people.',
    strategy: 'Span control, routing, networking, markets/auctions, resource policies, evolutionary heuristics.',
    optimize: 'Span layout, packing, scheduling, assignment, routing in specific applied niches.',
  };
  let p = `Generate ${N} untapped ${MODE} openings passing all conditions. ${spans[MODE] || ''}`;
  if (typeof seed === 'string') p += `\nFocus near: ${seed}.`;
  return p;
}

async function callDeepSeek(system, prompt) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}` },
    body: JSON.stringify({ model: 'deepseek-chat', temperature: 0.7, max_tokens: 4000,
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message);
  return j.choices?.[0]?.message?.content || '';
}

async function callFable(system, prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: FABLE_MODEL, max_tokens: 4000, temperature: 0.7,
      system, messages: [{ role: 'user', content: prompt }] }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
  return (j.content || []).map(b => b.text || '').join('') || '';
}

async function callGen(system, prompt) {
  if (ENGINE === 'fable') { if (!ANTHROPIC_KEY) throw new Error('no ANTHROPIC_API_KEY'); return callFable(system, prompt); }
  if (!KEY) throw new Error('no DEEPSEEK_API_KEY'); return callDeepSeek(system, prompt);
}

const SUB_KEYS = ['verifier_cheapness', 'verifier_fidelity', 'search_structure', 'generation_tractability', 'fabrication_cost', 'data_availability', 'neglect_density'];
const ALLOWED_TARGETS = ['machine', 'structure', 'nature', 'material', 'self', 'environment'];

function gate(c) {
  if (typeof c.score !== 'number' || c.score < 5) return 'low score';
  if (!c.substrate || !SUB_KEYS.every(k => c.substrate[k] !== undefined)) return 'no substrate tags';
  if (MODE === 'design') {
    if (!c.verifier || c.verifier.length < 8) return 'no concrete verifier';
    if (!['laptop', 'workstation'].includes((c.verifier_cost || '').toLowerCase())) return 'verifier not cheap (' + c.verifier_cost + ')';
  } else if (MODE === 'sensing') {
    if (!c.sensor || !c.verifier || c.verifier.length < 8) return 'no concrete sensor/verifier';
    if (!ALLOWED_TARGETS.includes((c.target_class || '').toLowerCase())) return 'target not constructive (' + c.target_class + ')';
  } else if (MODE === 'strategy') {
    if (!c.simulator || c.simulator.length < 8) return 'no concrete simulator';
  } else if (MODE === 'optimize') {
    if (!c.objective || c.objective.length < 8) return 'no concrete objective';
  }
  return null;
}

function subLine(s) {
  return `   substrate: vCheap${s.verifier_cheapness} vFid${s.verifier_fidelity} ${s.search_structure} gen${s.generation_tractability} fab${s.fabrication_cost} data${s.data_availability} neglect${s.neglect_density}`;
}
function printCand(c) {
  const head = { design: c.verifier, sensing: `${c.signal} (sensor ${c.sensor})`, strategy: c.simulator, optimize: c.objective }[MODE];
  console.log(`✅ ${c.domain}  [${c.score}/10]`);
  console.log(`   verifier: ${head}`);
  console.log(`   alien e.g.: ${c.alien_example}`);
  console.log(subLine(c.substrate) + '\n');
}

function load() { try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch { return { openings: [], lastScan: null }; } }

async function main() {
  if (ENGINE === 'deepseek' && !KEY) { console.log('[generative-openings] no DEEPSEEK_API_KEY — fail-safe, nothing run.'); return; }
  if (ENGINE === 'fable' && !ANTHROPIC_KEY) { console.log('[generative-openings] no ANTHROPIC_API_KEY — fail-safe, nothing run.'); return; }
  if (!SYS[MODE]) { console.log(`unknown mode "${MODE}". use: design | sensing | strategy | optimize`); return; }
  console.log(`[generative-openings] mode=${MODE} · engine=${ENGINE} · hunting ${N}...\n`);
  let raw; try { raw = await callGen(SYS[MODE], userPrompt()); } catch (e) { console.log(`${ENGINE} error:`, e.message); return; }
  const m = raw.match(/\[[\s\S]*\]/);
  let cands; try { cands = JSON.parse(m ? m[0] : raw); } catch { console.log('parse fail. raw:\n', raw.slice(0, 400)); return; }

  const store = load();
  const have = new Set(store.openings.map(o => o.domain.toLowerCase()));
  const accepted = [], rejected = [];
  for (const c of cands) { const why = gate(c); if (why) { rejected.push({ c, why }); continue; }
    if (have.has(c.domain.toLowerCase())) continue;
    accepted.push(c); have.add(c.domain.toLowerCase()); }

  for (const c of accepted) printCand(c);
  for (const r of rejected) console.log(`❌ ${r.c.domain || '(unnamed)'} — ${r.why}`);

  store.openings.push(...accepted.map(c => ({ ...c, family: MODE, engine: ENGINE, added: '2026-06-10' })));
  store.lastScan = '2026-06-10';
  fs.writeFileSync(STORE, JSON.stringify(store, null, 2));
  console.log(`\n→ ${accepted.length} new ${MODE} openings stored (${store.openings.length} total). ${rejected.length} gated out.`);

  if (flag('--report')) {
    const fam = store.openings.filter(o => o.family === MODE || (MODE === 'design' && !o.family));
    const lines = ['---', `title: "Engine Openings — ${MODE} family"`, 'date: 2026-06-10', 'type: research', '---', '',
      `# Untapped openings — ${MODE} family`, '', 'Registration test before any build: **can we run the verifier in one afternoon?** Substrate cols feed the leverage map.', '',
      '| Domain | Score | vCheap | vFid | Structure | Neglect | Alien example |', '|---|---|---|---|---|---|---|',
      ...fam.map(o => { const s = o.substrate || {}; return `| ${o.domain} | ${o.score} | ${s.verifier_cheapness ?? '-'} | ${s.verifier_fidelity ?? '-'} | ${s.search_structure ?? '-'} | ${s.neglect_density ?? '-'} | ${o.alien_example || ''} |`; })];
    const p = path.join(REPORT_DIR, `engine-openings-${MODE}-2026-06-10.md`);
    try { fs.writeFileSync(p, lines.join('\n')); console.log('   report:', p); } catch (e) { console.log('   (report skip:', e.message + ')'); }
  }
}

main();
