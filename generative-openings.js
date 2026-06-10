#!/usr/bin/env node
// generative-openings.js — standing hunt for UNTAPPED Noyron-able domains.
//
// The thesis (Noyron / Leap71): AI that searches a space too big for humans, scored by a
// CHEAP external verifier, in a NEGLECTED domain → "alien" outputs. Two families so far:
//
//   --mode design   (forward): generate an artifact, a cheap sim scores it.
//                    Gate: a concrete laptop/workstation simulator must exist.
//   --mode sensing  (inverse): decode a cheap ambient signal into a hidden truth
//                    ("treat the noise as a sensor"). Gate: cheap sensor + a ground-truth
//                    verifier YOU control + CONSTRUCTIVE non-surveillance target.
//
// Forensic: a fabricated verifier/coupling is worse than no candidate — omit if unsure.
// WIP. DeepSeek, fail-safe without key. Budget-capped per run (SI-31).
//
// CLI:  node generative-openings.js --mode sensing --n 7 [--seed "vibration"] [--report]

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
const MODE = (flag('--mode') || 'design').toString();

const DESIGN_SYSTEM = `You hunt UNTAPPED generative-design domains — where an AI generating from first principles, scored by a CHEAP external verifier, could produce solutions no human would design (the Noyron/Leap71 pattern).

A domain qualifies ONLY if ALL THREE hold:
1. CHEAP VERIFIER — name a REAL simulator/formal check that runs on a laptop or cheap workstation in under a day (OpenFOAM, NEC2/openEMS, Elmer/CalculiX FEA, k-Wave, KLayout/gdstk, OR-Tools, a compiler, RDKit). Wet lab / wind tunnel / clinical / fab / slow-human → NOT valid, drop it.
2. BIG SEARCH SPACE — combinatorial/geometric, beyond human hand-enumeration.
3. NEGLECTED — niche/unglamorous; the big labs have NOT saturated it.

Be STRICT and HONEST. A fabricated or hand-wavy verifier is worse than no candidate — omit if you cannot name a concrete cheap one. Avoid saturated targets (protein folding, code-gen, aerospace CFD, drug discovery).

Return ONLY a JSON array, each: {"domain":"","verifier":"<named tool + how it scores>","verifier_cost":"laptop|workstation|expensive","search_space":"<one line>","neglect_reason":"","alien_example":"","score":<0-10 int>,"why_now":""}`;

const SENSING_SYSTEM = `You hunt UNTAPPED inverse-sensing openings — where a CHEAP ambient signal is decoded back into a hidden truth ("treat the noise as a sensor": vibration->audio, RF->vitals, sound->fault).

A candidate qualifies ONLY if ALL hold:
1. CHEAP SENSOR — junk hardware most people have: phone mic/camera, $30 SDR (RTL-SDR), WiFi card, contact/piezo mic, accelerometer, webcam, photodiode.
2. REAL PHYSICAL COUPLING — name HOW the hidden cause modulates the signal. It must be genuine physics, not wishful.
3. GROUND-TRUTH VERIFIER YOU CONTROL — you can cheaply capture the TRUE answer independently and check the decode against it (e.g. record real audio AND the vibration video; chest-strap HR vs RF; a known fault vs the sound). Name it.
4. CONSTRUCTIVE, NON-SURVEILLANCE TARGET — aim ONLY at machines, structures, nature, materials, the environment, or one's OWN body with consent. DO NOT propose covert monitoring or identification of people. Diagnostics / health / conservation / repair / science / accessibility only.
5. NEGLECTED — a specific rig nobody bothered to build.

Be STRICT and HONEST. A fabricated coupling or verifier is worse than no candidate — omit if unsure. Reject anything whose main use is spying on people.

Return ONLY a JSON array, each: {"domain":"","signal":"","sensor":"","coupling":"<the physics>","verifier":"<ground truth + how checked>","target_class":"machine|structure|nature|material|self|environment","constructive_use":"","neglect_reason":"","alien_example":"","score":<0-10 int>}`;

function userPrompt() {
  const seed = flag('--seed');
  let p;
  if (MODE === 'sensing') {
    p = `Generate ${N} untapped inverse-sensing openings that pass all five conditions. Span signals: RF/WiFi, vibration, acoustic, optical/light, EM, power, thermal. CONSTRUCTIVE targets only — machines, structures, nature, materials, environment, self-with-consent. NO surveillance of people.`;
  } else {
    p = `Generate ${N} untapped generative-design domains passing all three conditions. Span physical (acoustic, EM, structural, thermal, fluidic, optical) and formal (combinatorial, layout, scheduling) spaces.`;
  }
  if (typeof seed === 'string') p += `\nFocus near: ${seed}.`;
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

const ALLOWED_TARGETS = ['machine', 'structure', 'nature', 'material', 'self', 'environment'];

function gate(c) {
  if (typeof c.score !== 'number' || c.score < 5) return 'low score';
  if (MODE === 'sensing') {
    if (!c.sensor || !c.verifier || c.verifier.length < 8) return 'no concrete sensor/verifier';
    const t = (c.target_class || '').toLowerCase();
    if (!ALLOWED_TARGETS.includes(t)) return 'target not constructive/non-surveillance (' + c.target_class + ')';
    return null;
  }
  if (!c.verifier || c.verifier.length < 8) return 'no concrete verifier';
  if (!['laptop', 'workstation'].includes((c.verifier_cost || '').toLowerCase())) return 'verifier not cheap (' + c.verifier_cost + ')';
  return null;
}

function printCand(c) {
  if (MODE === 'sensing') {
    console.log(`✅ ${c.domain}  [${c.score}/10 · ${c.target_class}]`);
    console.log(`   signal→truth: ${c.signal}  (sensor: ${c.sensor})`);
    console.log(`   physics: ${c.coupling}`);
    console.log(`   verifier: ${c.verifier}`);
    console.log(`   use: ${c.constructive_use}`);
    console.log(`   alien e.g.: ${c.alien_example}\n`);
  } else {
    console.log(`✅ ${c.domain}  [${c.score}/10 · verifier: ${c.verifier_cost}]`);
    console.log(`   verifier: ${c.verifier}`);
    console.log(`   space: ${c.search_space}`);
    console.log(`   alien e.g.: ${c.alien_example}\n`);
  }
}

function load() { try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch { return { openings: [], lastScan: null }; } }

async function main() {
  if (!KEY) { console.log('[generative-openings] no DEEPSEEK_API_KEY — fail-safe, nothing run.'); return; }
  console.log(`[generative-openings] mode=${MODE} · hunting ${N}...\n`);
  let raw; try { raw = await callDeepSeek(MODE === 'sensing' ? SENSING_SYSTEM : DESIGN_SYSTEM, userPrompt()); }
  catch (e) { console.log('DeepSeek error:', e.message); return; }
  const m = raw.match(/\[[\s\S]*\]/);
  let cands; try { cands = JSON.parse(m ? m[0] : raw); } catch { console.log('parse fail. raw:\n', raw.slice(0, 400)); return; }

  const store = load();
  const have = new Set(store.openings.map(o => o.domain.toLowerCase()));
  const accepted = [], rejected = [];
  for (const c of cands) { const why = gate(c); if (why) { rejected.push({ c, why }); continue; }
    if (have.has(c.domain.toLowerCase())) continue;
    accepted.push(c); have.add(c.domain.toLowerCase()); }

  for (const c of accepted) printCand(c);
  for (const r of rejected) console.log(`❌ ${r.c.domain} — ${r.why}`);

  store.openings.push(...accepted.map(c => ({ ...c, family: MODE, added: '2026-06-10' })));
  store.lastScan = '2026-06-10';
  fs.writeFileSync(STORE, JSON.stringify(store, null, 2));
  console.log(`\n→ ${accepted.length} new ${MODE} openings stored (${store.openings.length} total). ${rejected.length} gated out.`);

  if (flag('--report')) {
    const fam = store.openings.filter(o => o.family === MODE || (MODE === 'design' && !o.family));
    const head = MODE === 'sensing'
      ? ['| Domain | Score | Target | Sensor | Verifier (ground truth) | Constructive use |', '|---|---|---|---|---|---|',
         ...fam.map(o => `| ${o.domain} | ${o.score} | ${o.target_class} | ${o.sensor} | ${o.verifier} | ${o.constructive_use} |`)]
      : ['| Domain | Score | Verifier (cheap) | Why neglected | Alien example |', '|---|---|---|---|---|',
         ...fam.map(o => `| ${o.domain} | ${o.score} | ${o.verifier} | ${o.neglect_reason} | ${o.alien_example} |`)];
    const lines = ['---', `title: "Generative-Design Openings — ${MODE} hunt"`, 'date: 2026-06-10', 'type: research', '---', '',
      `# Untapped Noyron-able domains — ${MODE} family`, '',
      'Registration test before any build: **can we run the verifier in one afternoon?**', '', ...head];
    const p = path.join(REPORT_DIR, `generative-openings-${MODE}-2026-06-10.md`);
    try { fs.writeFileSync(p, lines.join('\n')); console.log('   report:', p); } catch (e) { console.log('   (report skip:', e.message + ')'); }
  }
}

main();
