#!/usr/bin/env node
// fusion-gate.js — second-pass CROSS-DOMAIN synthesis over Archaeologist finds.
// The Universal-Key edge isn't finding forgotten techniques — it's FUSING them across
// fields into something buildable nobody has. (Relay Third Thing, 2026-06-09.)
//
// Reads archaeologist.db (readonly), pairs strong finds from DIFFERENT domains, asks
// DeepSeek whether the pair fuses into a novel buildable capability, gold-gates, and
// files candidate fusions. Sources are PENDING → fusions are LEADS to verify, not facts.
//
// CLI:  node fusion-gate.js [--max N] [--min-score 7]
// Budget: FUSION_MAX DeepSeek calls/run (SI-31). Kill switch: touch fusion-gate.PAUSED or FUSION_PAUSED=1.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME;
const ARCH_DB = path.join(HOME, 'nanoclaw', 'vortex_data', 'archaeologist.db');
const OUT_DB  = path.join(HOME, 'nanoclaw', 'vortex_data', 'fusion-gate.db');   // separate — no contention with live agent
const VAULT   = path.join(HOME, 'cathedral-vault', '00_Staging', 'fusion-gate');
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || (() => {
  try { return fs.readFileSync(path.join(HOME, 'nanoclaw', '.env'), 'utf8').match(/DEEPSEEK_API_KEY=(.+)/)?.[1]?.trim(); } catch { return null; }
})();

const args = process.argv.slice(2);
const FUSION_MAX = parseInt(args[args.indexOf('--max') + 1], 10) || 12;
const MIN_SCORE  = parseInt(args[args.indexOf('--min-score') + 1], 10) || 7;

function paused() {
  return process.env.FUSION_PAUSED === '1' || fs.existsSync(path.join(__dirname, 'fusion-gate.PAUSED'));
}

async function callDeepSeek(system, prompt) {
  if (!DEEPSEEK_KEY) throw new Error('no DEEPSEEK_API_KEY');
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify({ model: 'deepseek-chat', temperature: 0.4, max_tokens: 500,
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }),
  });
  const j = await res.json();
  return j.choices?.[0]?.message?.content || '';
}

function initOut() {
  const db = new Database(OUT_DB);
  db.exec(`CREATE TABLE IF NOT EXISTS fusions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fusion_name TEXT, score REAL, what_it_enables TEXT, buildable TEXT, why TEXT,
    source_a TEXT, domain_a TEXT, source_b TEXT, domain_b TEXT,
    status TEXT DEFAULT 'CANDIDATE', timestamp TEXT DEFAULT (datetime('now')));`);
  return db;
}

// Pool v2: ONE strongest find per DISTINCT domain → maximum cross-field diversity
// (v1 grabbed top-40 by score, which clustered on whatever was freshly run).
function selectPool() {
  const db = new Database(ARCH_DB, { readonly: true });
  const rows = db.prepare(`
    SELECT technique, domain, valid_reason, cathedral_application, ensemble_score
    FROM discoveries
    WHERE technique IS NOT NULL AND domain IS NOT NULL
    ORDER BY (ensemble_score IS NULL), ensemble_score DESC, timestamp DESC`).all();
  db.close();
  const byDomain = {};
  for (const r of rows) (byDomain[r.domain] ||= []).push(r);
  return Object.values(byDomain).map(arr => arr[0]);   // one best per domain (~all domains)
}

// Pairs v2: diversity-first — greedily cap each domain to ≤2 uses so the run spans MANY
// fields instead of clustering 3-4 (the v1 failure: everything was "read old text").
function crossPairs(pool, cap) {
  const pairs = [];
  for (let i = 0; i < pool.length; i++)
    for (let j = i + 1; j < pool.length; j++)
      pairs.push([pool[i], pool[j]]);   // one-per-domain pool → all pairs already cross-domain
  // deterministic mix (no Math.random): hash on domain names
  pairs.sort((a, b) => ((a[0].domain + a[1].domain).length % 11) - ((b[0].domain + b[1].domain).length % 11));
  const used = {}, picked = [];
  for (const p of pairs) {
    if (picked.length >= cap) break;
    const [da, db_] = [p[0].domain, p[1].domain];
    if ((used[da] || 0) < 2 && (used[db_] || 0) < 2) {
      picked.push(p); used[da] = (used[da] || 0) + 1; used[db_] = (used[db_] || 0) + 1;
    }
  }
  for (const p of pairs) { if (picked.length >= cap) break; if (!picked.includes(p)) picked.push(p); }
  return picked;
}

const SYSTEM = `You are the Cathedral's Fusion Gate. Judge whether two FORGOTTEN techniques from DIFFERENT fields combine into a genuinely NEW, BUILDABLE capability — a specific tool or method, not a vague analogy.
SCORING — default LOW, spread the scores, MOST pairs do NOT fuse:
 0-3 = no real fusion: basically the same field, generic, or only a loose analogy. THE MAJORITY land here.
 4-6 = plausible but speculative; needs a leap.
 7-8 = genuine, specific, buildable combination.
 9-10 = rare: a capability nobody has, clearly buildable now.
Be strict. "Use A's method on B's data" when both are the same kind of problem (e.g. two ways to read old manuscripts) is NOT a fusion → score <=3. Real fusion crosses genuinely different problem-domains. Sources are unverified leads — judge the fusion's potential, not their truth.
Return ONLY JSON: {"fusion_name":"...","score":<0-10 int>,"what_it_enables":"<one line>","buildable":"<one line: how>","why":"<one line>"}`;

function parse(txt) { const m = txt.match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } }

async function main() {
  if (paused()) { console.log('[fusion-gate] PAUSED — skipping.'); return; }
  if (!DEEPSEEK_KEY) { console.log('[fusion-gate] no DEEPSEEK_API_KEY.'); return; }
  fs.mkdirSync(VAULT, { recursive: true });
  const pool = selectPool();
  const pairs = crossPairs(pool, FUSION_MAX);
  console.log(`[fusion-gate] pool ${pool.length} finds → evaluating ${pairs.length} cross-domain pairs (cap ${FUSION_MAX})`);
  const out = initOut();
  const ins = out.prepare(`INSERT INTO fusions (fusion_name,score,what_it_enables,buildable,why,source_a,domain_a,source_b,domain_b) VALUES (?,?,?,?,?,?,?,?,?)`);
  const gold = [];
  for (const [a, b] of pairs) {
    const prompt = `TECHNIQUE A (${a.domain}): ${a.technique}\n  use: ${(a.valid_reason || a.cathedral_application || '').slice(0, 200)}\nTECHNIQUE B (${b.domain}): ${b.technique}\n  use: ${(b.valid_reason || b.cathedral_application || '').slice(0, 200)}\nDo these fuse into a novel buildable capability?`;
    let j; try { j = parse(await callDeepSeek(SYSTEM, prompt)); } catch (e) { console.log('  call failed:', e.message); continue; }
    if (!j || typeof j.score !== 'number') continue;
    if (j.score >= MIN_SCORE) {
      ins.run(j.fusion_name, j.score, j.what_it_enables, j.buildable, j.why, a.technique, a.domain, b.technique, b.domain);
      gold.push({ ...j, a, b });
      console.log(`  🔗 ${j.score}/10  ${j.fusion_name}  [${a.domain} × ${b.domain}]`);
    }
    await new Promise(r => setTimeout(r, 300));
  }
  out.close();
  // vault deposit
  const date = new Date().toISOString().slice(0, 10);
  const md = [`# Fusion Gate — Candidate Cross-Domain Fusions (${date})`, '',
    `> CANDIDATES, not verified — source techniques are PENDING Archaeologist leads. Fusions = combinations to investigate.`, '',
    `Evaluated ${pairs.length} cross-domain pairs · ${gold.length} scored ≥${MIN_SCORE}.`, ''];
  for (const g of gold) md.push(`## 🔗 ${g.fusion_name} (${g.score}/10)`, `- **${g.a.domain}** × **${g.b.domain}**`, `- Enables: ${g.what_it_enables}`, `- Buildable: ${g.buildable}`, `- Why: ${g.why}`, `- Sources: "${g.a.technique}" + "${g.b.technique}"`, '');
  fs.writeFileSync(path.join(VAULT, `fusions-${date}.md`), md.join('\n'));
  console.log(`[fusion-gate] ${gold.length} candidate fusions filed → 00_Staging/fusion-gate/fusions-${date}.md (DB: fusion-gate.db)`);
}

main();
