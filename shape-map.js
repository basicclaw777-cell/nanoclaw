#!/usr/bin/env node
// shape-map.js — the shape of Paul's answers, and the voids in it (to steer the harness).
//
// Each curated vault file is a point; the cloud is his explored territory. The VOIDS —
// concepts both deep but never bridged — are the next questions worth asking.
// This is the CHEAP faithful version (filename-concept level, instant, no embedding).
// The graduation (full content embeddings via nomic) is specced in the vault; run it only
// if this cheap version shows signal — the registration-test discipline.
//
// Output: voids.json (targets) → fed to elicitation-harness --predict to grow new moves
// that reach them.  CLI:  node shape-map.js [--top 18]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VAULT = path.join(process.env.HOME, 'cathedral-vault');
const DIRS = ['02_Refined_Gold', '06_Methods', '06_Basic_Reflex_Syllabus'];
const OUT = path.join(__dirname, 'voids.json');
const TOP = parseInt(process.argv[process.argv.indexOf('--top') + 1], 10) || 18;

const STOP = new Set(['the', 'and', 'for', 'with', 'of', 'a', 'to', 'in', 'on', 'is', 'as', 'by', 'md',
  'cathedral', 'method', 'note', 'notes', 'session', 'harvest', 'pass', 'draft', 'v1', 'v2', 'v3',
  'part', 'index', 'readme', 'final', 'new', 'old', 'how', 'what', 'why', 'an', 'or', 'at', 'it',
  // cron-ingested research artifacts — NOT Paul's answers (caught by the cheap pass)
  'arxiv', 'extracted', 'paper', 'papers', 'abstract', 'summary', 'report', 'daily', 'weekly',
  'scan', 'log', 'queue', 'dump', 'raw', 'auto', 'ingest', 'feed', 'analysis', 'data', 'gold']);

// gather files
let files = [];
for (const d of DIRS) {
  try { files.push(...execSync(`find "${path.join(VAULT, d)}" -name '*.md'`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean)); } catch {}
}

// per-file concept token set (from filename slug)
function tokens(f) {
  const base = path.basename(f, '.md').toLowerCase();
  return [...new Set(base.split(/[-_\s]+/).filter(w => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w) && !/^\d{4}$/.test(w)))];
}
const docSets = files.map(tokens).filter(s => s.length);

// concept frequency = density of explored territory
const freq = {};
for (const s of docSets) for (const t of s) freq[t] = (freq[t] || 0) + 1;
const concepts = Object.entries(freq).sort((a, b) => b[1] - a[1]);
const top = concepts.slice(0, TOP).map(c => c[0]);

// co-occurrence among top concepts
const pair = {};
const key = (a, b) => [a, b].sort().join(' × ');
for (const s of docSets) {
  const hits = s.filter(t => top.includes(t));
  for (let i = 0; i < hits.length; i++) for (let j = i + 1; j < hits.length; j++) pair[key(hits[i], hits[j])] = (pair[key(hits[i], hits[j])] || 0) + 1;
}

// VOIDS = pairs of strong concepts that are NEVER (or barely) bridged. Rank by combined strength.
const voids = [];
for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) {
  const a = top[i], b = top[j], co = pair[key(a, b)] || 0;
  if (co <= 1) voids.push({ a, b, co, strength: freq[a] + freq[b], target: `bridge "${a}" × "${b}"` });
}
voids.sort((x, y) => y.strength - x.strength);

console.log(`\n🗺  SHAPE OF YOUR ANSWERS — ${files.length} curated files (cheap, filename-level)\n`);
console.log('Densest territory (your strong themes):');
console.log('  ' + concepts.slice(0, 12).map(([t, n]) => `${t}(${n})`).join(' · '));
console.log(`\n🕳  TOP VOIDS — strong concepts you've never bridged (the next questions):\n`);
const topVoids = voids.slice(0, 10);
for (const v of topVoids) console.log(`  ◇ ${v.a} × ${v.b}   (each deep: ${freq[v.a]}+${freq[v.b]} files, bridged ${v.co}×)`);

fs.writeFileSync(OUT, JSON.stringify({ generated: '2026-06-11', method: 'filename-concept (cheap proxy)', territory: concepts.slice(0, TOP), voids: topVoids }, null, 2));
console.log(`\n→ ${topVoids.length} voids → voids.json. Feed the harness:  node elicitation-harness.js --predict --void\n`);
console.log('⚠ cheap version (filename-level). Graduation = embed file CONTENT via nomic → real geometric voids. Run only if these voids look real (the registration test).');
