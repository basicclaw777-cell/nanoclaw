#!/usr/bin/env node
// grade-pending.js — Stage B of the PENDING fix.
//
// The 3-model ensemble gate can't run on 16GB → everything files PENDING. This replaces
// it with a SINGLE-model value grade, combined with Stage A's INDEPENDENT citation check
// (the unverified_citations field, set by `archaeologist.js --backfill --verify` against
// Semantic Scholar). Provenance can't be faked by the same model that confabulated it —
// so the external citation check is the load-bearing part; the LLM only judges VALUE.
//
// Promotes PENDING → VERIFIED / WATCH / REJECTED.
// CLI:  node grade-pending.js [--max N]
// Budget: GRADE_MAX DeepSeek calls/run (SI-31). Kill: touch grade-pending.PAUSED or GRADE_PAUSED=1.
// Run when the Archaeologist + Stage A are idle (shared DB — no concurrent writers).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME;
const DB_PATH = path.join(HOME, 'nanoclaw', 'vortex_data', 'archaeologist.db');
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || (() => {
  try { return fs.readFileSync(path.join(HOME, 'nanoclaw', '.env'), 'utf8').match(/DEEPSEEK_API_KEY=(.+)/)?.[1]?.trim(); } catch { return null; }
})();

const args = process.argv.slice(2);
const GRADE_MAX = parseInt(args[args.indexOf('--max') + 1], 10) || 20;
const paused = () => process.env.GRADE_PAUSED === '1' || fs.existsSync(path.join(__dirname, 'grade-pending.PAUSED'));

async function callDeepSeek(system, prompt) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify({ model: 'deepseek-chat', temperature: 0.2, max_tokens: 350,
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }),
  });
  const j = await res.json();
  return j.choices?.[0]?.message?.content || '';
}

const SYSTEM = `You grade whether a FORGOTTEN technique is worth reviving. Its citations were INDEPENDENTLY checked against a scholarly database — you'll be told how many came back UNVERIFIED. Judge on three axes, strictly:
- REAL: if key citations are unverified, the technique is likely confabulated — lean REJECTED.
- OVERLOOKED: genuinely abandoned/forgotten, not standard current textbook material.
- BUILDABLE: can actually be applied today.
Score 0-10. Be STRICT — most leads are generic, well-known, or unverifiable. Reserve 7+ for a real, overlooked, buildable technique.
Return ONLY JSON: {"score":<0-10 int>,"verdict":"VERIFIED|WATCH|REJECTED","why":"<one line>"}`;

function parse(t) { const m = t.match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } }

async function main() {
  if (paused()) return console.log('[grade-pending] PAUSED.');
  if (!DEEPSEEK_KEY) return console.log('[grade-pending] no DEEPSEEK_API_KEY.');
  const db = new Database(DB_PATH);
  db.pragma('busy_timeout = 8000');   // tolerate the live agent touching the DB
  // PENDING / unverdicted, preferring records whose citations Stage A already checked
  const rows = db.prepare(`
    SELECT id, technique, domain, origin, valid_reason, unverified_citations
    FROM discoveries
    WHERE (ensemble_verdict IS NULL OR ensemble_verdict IN ('PENDING','GATE_UNAVAILABLE'))
      AND technique IS NOT NULL
    ORDER BY (unverified_citations IS NULL), id DESC
    LIMIT ?`).all(GRADE_MAX);
  const upd = db.prepare(`UPDATE discoveries SET ensemble_verdict = ?, ensemble_score = ? WHERE id = ?`);

  console.log(`[grade-pending] grading ${rows.length} PENDING (cap ${GRADE_MAX})`);
  const tally = { VERIFIED: 0, WATCH: 0, REJECTED: 0, error: 0 };
  for (const r of rows) {
    let unver = [];
    try { unver = JSON.parse(r.unverified_citations || '[]'); } catch {}
    const prompt = `TECHNIQUE (${r.domain}): ${r.technique}\nORIGIN: ${(r.origin || '').slice(0, 200)}\nVALUE: ${(r.valid_reason || '').slice(0, 250)}\nUNVERIFIED CITATIONS: ${unver.length} ${unver.length ? '(' + unver.slice(0, 3).join('; ').slice(0, 150) + ')' : '(none flagged)'}\nGrade it.`;
    let j; try { j = parse(await callDeepSeek(SYSTEM, prompt)); } catch (e) { tally.error++; continue; }
    if (!j || !j.verdict) { tally.error++; continue; }
    // Provenance override: 2+ unverified citations → cannot be VERIFIED
    let verdict = j.verdict;
    if (unver.length >= 2 && verdict === 'VERIFIED') verdict = 'REJECTED';
    upd.run(verdict, typeof j.score === 'number' ? j.score : null, r.id);
    tally[verdict] = (tally[verdict] || 0) + 1;
    console.log(`  ${verdict === 'VERIFIED' ? '✅' : verdict === 'REJECTED' ? '❌' : '🟡'} ${verdict} ${j.score}/10 — ${r.technique.slice(0, 55)}${unver.length ? ' [' + unver.length + ' unverified cite]' : ''}`);
    await new Promise(r => setTimeout(r, 250));
  }
  db.close();
  console.log(`[grade-pending] done. VERIFIED ${tally.VERIFIED} · WATCH ${tally.WATCH} · REJECTED ${tally.REJECTED} · err ${tally.error}`);
}

main();
