#!/usr/bin/env node
// build-openings-map.js — first read of the leverage map from the accumulated openings.
//
// Reads generative-openings.json, scores each opening on LEVERAGE, plots the substrate,
// finds the white space, and writes a self-contained HTML map + a vault markdown summary.
//
// Leverage model (encodes the session's core insight — FIDELITY GATES EVERYTHING):
//   leverage = (verifier_fidelity/10) × mean(verifier_cheapness, generation_tractability, fabrication_cost)
//   → a loop that's cheap but whose cheap check LIES (low fidelity) collapses to ~0.
//   neglect is NOT used — it's self-reported by the model, untrustworthy until checked.
//
// Re-run anytime; reads the json live (safe while the grind appends).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME;
const STORE = path.join(__dirname, 'generative-openings.json');
const HTML_OUT = path.join(__dirname, 'openings-leverage-map.html');
const MD_OUT = path.join(HOME, 'cathedral-vault', '00_Staging', 'cathedral', 'leverage-map-2026-06-10.md');

const FAM_COLOR = { design: '#1971c2', sensing: '#2f9e44', strategy: '#e8590c', optimize: '#7048e8' };

const store = JSON.parse(fs.readFileSync(STORE, 'utf8'));
const all = store.openings || [];
const pts = all.filter(o => o.substrate && o.substrate.verifier_fidelity !== undefined);

function lev(o) {
  const s = o.substrate;
  const vf = +s.verifier_fidelity || 0;
  const cheap = ((+s.verifier_cheapness || 0) + (+s.generation_tractability || 0) + (+s.fabrication_cost || 0)) / 3;
  return +(vf / 10 * cheap).toFixed(2);
}
for (const o of pts) o._lev = lev(o);
pts.sort((a, b) => b._lev - a._lev);

// per-family profile
const fams = [...new Set(pts.map(p => p.family))];
const profile = fams.map(f => {
  const g = pts.filter(p => p.family === f);
  const avg = (k) => +(g.reduce((s, p) => s + (+p.substrate[k] || 0), 0) / g.length).toFixed(1);
  return { family: f, n: g.length, lev: +(g.reduce((s, p) => s + p._lev, 0) / g.length).toFixed(2),
    vCheap: avg('verifier_cheapness'), vFid: avg('verifier_fidelity'), fab: avg('fabrication_cost'), gen: avg('generation_tractability') };
}).sort((a, b) => b.lev - a.lev);

// white space: the high-leverage zone (vCheap>=8 & vFid>=8) — who's there, who's absent
const elite = pts.filter(p => +p.substrate.verifier_cheapness >= 8 && +p.substrate.verifier_fidelity >= 8);
const eliteByFam = fams.map(f => ({ f, n: elite.filter(e => e.family === f).length }));
// the trap zone: cheap but low-fidelity (vCheap>=8 & vFid<=5) — looks great, lies
const trap = pts.filter(p => +p.substrate.verifier_cheapness >= 8 && +p.substrate.verifier_fidelity <= 5);

// ── SVG scatter (vCheap x · vFid y · color=family · size=leverage) ──
const W = 560, H = 520, M = 70;
const hash = (i) => ((i * 2654435761) % 1000) / 1000 - 0.5;
function dot(o, i) {
  const s = o.substrate;
  const x = M + (Math.max(0, Math.min(10, (+s.verifier_cheapness) + hash(i) * 0.5)) / 10) * W;
  const y = M + (1 - Math.max(0, Math.min(10, (+s.verifier_fidelity) + hash(i + 7) * 0.5)) / 10) * H;
  const r = 2.5 + o._lev * 0.55;
  return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${FAM_COLOR[o.family] || '#888'}" fill-opacity="0.6" stroke="${FAM_COLOR[o.family] || '#888'}" stroke-width="0.5"><title>${(o.domain || '').replace(/"/g, '')} — lev ${o._lev} (${o.family})</title></circle>`;
}
const svg = `<svg viewBox="0 0 ${W + M * 2} ${H + M * 2}" xmlns="http://www.w3.org/2000/svg" style="max-width:760px;width:100%">
  <rect x="${M + W * 0.7}" y="${M}" width="${W * 0.3}" height="${H * 0.3}" fill="#f7b408" fill-opacity="0.10"/>
  <rect x="${M + W * 0.7}" y="${M + H * 0.7}" width="${W * 0.3}" height="${H * 0.3}" fill="#e03131" fill-opacity="0.08"/>
  <text x="${M + W * 0.85}" y="${M + 18}" text-anchor="middle" font-size="11" fill="#b8890a" font-family="sans-serif">HIGH LEVERAGE</text>
  <text x="${M + W * 0.85}" y="${M + H - 8}" text-anchor="middle" font-size="11" fill="#c92a2a" font-family="sans-serif">THE TRAP (cheap but lies)</text>
  <line x1="${M}" y1="${M + H}" x2="${M + W}" y2="${M + H}" stroke="#1e1e1e" stroke-width="1.5"/>
  <line x1="${M}" y1="${M}" x2="${M}" y2="${M + H}" stroke="#1e1e1e" stroke-width="1.5"/>
  <text x="${M + W / 2}" y="${M + H + 45}" text-anchor="middle" font-size="14" fill="#1e1e1e" font-family="sans-serif">verifier cheapness →</text>
  <text x="${M - 45}" y="${M + H / 2}" text-anchor="middle" font-size="14" fill="#1e1e1e" font-family="sans-serif" transform="rotate(-90 ${M - 45} ${M + H / 2})">verifier fidelity →</text>
  ${pts.map((o, i) => dot(o, i)).join('\n  ')}
</svg>`;

const top = pts.slice(0, 15);
const legend = fams.map(f => `<span style="color:${FAM_COLOR[f] || '#888'}">● ${f}</span>`).join('  ');

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Leverage Map</title>
<style>body{font-family:-apple-system,sans-serif;max-width:880px;margin:30px auto;padding:0 20px;color:#1e1e1e}
h1{margin-bottom:2px}.sub{color:#868e96;margin-top:0}table{border-collapse:collapse;width:100%;font-size:13px;margin:10px 0}
th,td{text-align:left;padding:5px 8px;border-bottom:1px solid #eee}th{color:#868e96;font-weight:600}
.note{background:#fff8e1;border-left:3px solid #f7b408;padding:8px 12px;font-size:13px;margin:14px 0}
.legend{font-size:13px;margin:8px 0}</style></head><body>
<h1>The Leverage Map <span style="color:#f7b408">·</span> ${pts.length} openings</h1>
<p class="sub">where AI has the most leverage = cheap loop × honest verifier. fidelity gates everything.</p>
<div class="legend">${legend}  ·  dot size = leverage</div>
${svg}
<div class="note"><b>Read it honestly:</b> top-right = real leverage (cheap AND truthful). Bottom-right = <b>the trap</b> — cheap to run but the check lies; the most dangerous quadrant. Neglect is excluded (self-reported). 0 gated out across the grind → "listed" ≠ "verified"; the real gate is the hands-on registration test.</div>

<h3>Top 15 by leverage</h3>
<table><tr><th>Domain</th><th>Family</th><th>Lev</th><th>vCheap</th><th>vFid</th><th>verifier</th></tr>
${top.map(o => `<tr><td>${o.domain || ''}</td><td style="color:${FAM_COLOR[o.family] || '#888'}">${o.family}</td><td><b>${o._lev}</b></td><td>${o.substrate.verifier_cheapness}</td><td>${o.substrate.verifier_fidelity}</td><td style="font-size:11px;color:#666">${(o.verifier || o.simulator || o.objective || o.sensor || '').slice(0, 70)}</td></tr>`).join('\n')}
</table>

<h3>By family</h3>
<table><tr><th>Family</th><th>n</th><th>avg leverage</th><th>vCheap</th><th>vFid</th><th>fab</th></tr>
${profile.map(p => `<tr><td style="color:${FAM_COLOR[p.family] || '#888'}">${p.family}</td><td>${p.n}</td><td><b>${p.lev}</b></td><td>${p.vCheap}</td><td>${p.vFid}</td><td>${p.fab}</td></tr>`).join('\n')}
</table>

<h3>White space</h3>
<div class="note">Elite zone (vCheap≥8 & vFid≥8): <b>${elite.length}</b> points — ${eliteByFam.map(e => e.f + ' ' + e.n).join(' · ')}.
${trap.length ? `<br>Trap zone (cheap but vFid≤5): <b>${trap.length}</b> — verify these hardest.` : ''}</div>
<p style="color:#868e96;font-size:12px">Generated 2026-06-10 · re-run <code>node build-openings-map.js</code> as the cloud grows. The map is "substrate" only once its axes predict a held-out domain.</p>
</body></html>`;

fs.writeFileSync(HTML_OUT, html);

// vault markdown summary
const md = ['---', 'title: "The Leverage Map — first read"', 'date: 2026-06-10', 'type: research', '---', '',
  `# The Leverage Map (${pts.length} openings)`, '',
  'Leverage = (verifier_fidelity/10) × mean(cheapness, generation, fabrication). **Fidelity gates everything** — a cheap loop whose check lies scores ~0. Neglect excluded (self-reported).', '',
  '## Top 15 by leverage', '', '| Domain | Family | Lev | vCheap | vFid |', '|---|---|---|---|---|',
  ...top.map(o => `| ${o.domain} | ${o.family} | ${o._lev} | ${o.substrate.verifier_cheapness} | ${o.substrate.verifier_fidelity} |`), '',
  '## By family', '', '| Family | n | avg leverage | vCheap | vFid | fab |', '|---|---|---|---|---|---|',
  ...profile.map(p => `| ${p.family} | ${p.n} | ${p.lev} | ${p.vCheap} | ${p.vFid} | ${p.fab} |`), '',
  '## White space', '', `- Elite (vCheap≥8 & vFid≥8): **${elite.length}** — ${eliteByFam.map(e => e.f + ' ' + e.n).join(', ')}`,
  `- Trap (vCheap≥8 & vFid≤5): **${trap.length}** — looks cheap, the check lies; verify hardest`, '',
  '## Honest gates', '- 0 gated out across the grind → listed ≠ verified; the real gate is the hands-on registration test.',
  '- Neglect is self-reported by the model — untrusted.', '- "Substrate" only once the axes predict a held-out domain.'];
try { fs.writeFileSync(MD_OUT, md.join('\n')); } catch {}

console.log(`map built — ${pts.length} points`);
console.log(`  HTML: ${HTML_OUT}`);
console.log(`  elite zone: ${elite.length} · trap zone: ${trap.length}`);
console.log('  top 5:'); top.slice(0, 5).forEach(o => console.log(`    ${o._lev}  ${o.domain} (${o.family})`));
console.log('  family leverage:', profile.map(p => `${p.family} ${p.lev}`).join(' · '));
