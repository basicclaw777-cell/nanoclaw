#!/usr/bin/env node
// generative-openings.js — standing hunt for UNTAPPED Noyron-able domains.
//
// The thesis (Noyron / Leap71): an AI that GENERATES from principles + a CHEAP external
// VERIFIER + a huge search space → "alien" outputs no human would design. The opening
// isn't compute — it's finding a domain whose verifier is already cheap and that big labs
// have skipped. This hunts those.
//
// A candidate qualifies ONLY if all three hold — the gate is condition 1:
//   1. CHEAP VERIFIER — a named sim / formal check / bench test that runs on a laptop or
//      cheap workstation in < 1 day. (Wet lab / wind tunnel / clinical / slow-human = DISQUALIFY.)
//   2. BIG SEARCH SPACE — combinatorial/geometric, beyond human hand-enumeration.
//   3. NEGLECTED — niche/unsexy enough a sovereign solo operator could be first.
//
// Forensic: a fabricated verifier is worse than no candidate. No concrete cheap verifier → omit.
// WIP. DeepSeek, fail-safe without key. Budget-capped per run (SI-31).
//
// CLI:
//   node generative-openings.js --n 6 [--seed "acoustics"] [--report]

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
const N = Math.min(parseInt(flag('--n'), 10) || 6, 12); // budget cap

const SYSTEM = `You hunt UNTAPPED generative-design domains — places where an AI that generates from first principles, scored by a CHEAP external verifier, could produce solutions no human would design (the Noyron/Leap71 pattern).

A domain qualifies ONLY if ALL THREE hold:
1. CHEAP VERIFIER — name a REAL, specific simulator / formal check / measurable bench test that runs on a laptop or cheap workstation in under a day (e.g. OpenFOAM, NEC2/openEMS, Elmer/CalculiX FEA, KLayout/gdstk, a compiler, an audio FDTD sim, RDKit). If the only honest verifier is a wet lab, wind tunnel, clinical trial, fab run, or slow human judgement → this is NOT a valid candidate, drop it.
2. BIG SEARCH SPACE — combinatorial or geometric, too large for a human to enumerate by hand.
3. NEGLECTED — niche / unglamorous enough that the big labs (DeepMind et al) have NOT saturated it; a sovereign solo operator could be first or competitive.

Be STRICT and HONEST. A fabricated or hand-wavy verifier is worse than no candidate — if you cannot name a concrete cheap verifier, omit the domain. Avoid the saturated big-lab targets (protein folding, general code-gen, aerospace CFD, drug discovery). Favour overlooked niches.

Return ONLY a JSON array, each item:
{"domain":"","verifier":"<named tool + how it scores a candidate>","verifier_cost":"laptop|workstation|expensive","search_space":"<one line>","neglect_reason":"<why big labs skip it>","alien_example":"<a plausible non-obvious output>","score":<0-10 int>,"why_now":"<one line>"}`;

function userPrompt() {
  const seed = flag('--seed');
  let p = `Generate ${N} untapped generative-design domains that pass all three conditions. Diverse — span physical (acoustics, EM, structural, thermal, fluidic, optical) and formal (combinatorial, layout, scheduling) spaces.`;
  if (typeof seed === 'string') p += `\nFocus on domains adjacent to: ${seed}.`;
  return p;
}

async function callDeepSeek(system, prompt) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}` },
    body: JSON.stringify({ model: 'deepseek-chat', temperature: 0.7, max_tokens: 3600,
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message);
  return j.choices?.[0]?.message?.content || '';
}

// gate: condition 1 is the discriminator — must have a concrete laptop/workstation verifier.
function gate(c) {
  if (!c.verifier || c.verifier.length < 8) return 'no concrete verifier';
  if (!['laptop', 'workstation'].includes((c.verifier_cost || '').toLowerCase())) return 'verifier not cheap (' + c.verifier_cost + ')';
  if (typeof c.score !== 'number' || c.score < 5) return 'low score';
  return null;
}

function load() { try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch { return { openings: [], lastScan: null }; } }

async function main() {
  if (!KEY) { console.log('[generative-openings] no DEEPSEEK_API_KEY — fail-safe, nothing run.'); return; }
  console.log(`[generative-openings] hunting ${N} candidates...\n`);
  let raw; try { raw = await callDeepSeek(SYSTEM, userPrompt()); } catch (e) { console.log('DeepSeek error:', e.message); return; }
  const m = raw.match(/\[[\s\S]*\]/);
  let cands; try { cands = JSON.parse(m ? m[0] : raw); } catch { console.log('parse fail. raw:\n', raw.slice(0, 400)); return; }

  const store = load();
  const have = new Set(store.openings.map(o => o.domain.toLowerCase()));
  const accepted = [], rejected = [];
  for (const c of cands) { const why = gate(c); if (why) { rejected.push({ c, why }); continue; }
    if (have.has(c.domain.toLowerCase())) continue;
    accepted.push(c); have.add(c.domain.toLowerCase()); }

  for (const c of accepted) {
    console.log(`✅ ${c.domain}  [${c.score}/10 · verifier: ${c.verifier_cost}]`);
    console.log(`   verifier: ${c.verifier}`);
    console.log(`   space: ${c.search_space}`);
    console.log(`   neglected: ${c.neglect_reason}`);
    console.log(`   alien e.g.: ${c.alien_example}\n`);
  }
  for (const r of rejected) console.log(`❌ ${r.c.domain} — ${r.why}`);

  store.openings.push(...accepted.map(c => ({ ...c, added: '2026-06-10' })));
  store.lastScan = '2026-06-10';
  fs.writeFileSync(STORE, JSON.stringify(store, null, 2));
  console.log(`\n→ ${accepted.length} new openings stored (${store.openings.length} total). ${rejected.length} gated out.`);

  if (flag('--report')) {
    const lines = ['---', 'title: "Generative-Design Openings — hunt log"', 'date: 2026-06-10', 'type: research', '---', '',
      '# Untapped Noyron-able domains', '', 'Gate: cheap named verifier (laptop/workstation, <1 day) × big search space × neglected. The registration test before any build: **can we run the verifier in one afternoon?**', '',
      '| Domain | Score | Verifier (cheap) | Why neglected | Alien example |', '|---|---|---|---|---|',
      ...store.openings.map(o => `| ${o.domain} | ${o.score} | ${o.verifier} | ${o.neglect_reason} | ${o.alien_example} |`)];
    const p = path.join(REPORT_DIR, 'generative-openings-2026-06-10.md');
    try { fs.writeFileSync(p, lines.join('\n')); console.log('   report:', p); } catch (e) { console.log('   (report skip:', e.message + ')'); }
  }
}

main();
