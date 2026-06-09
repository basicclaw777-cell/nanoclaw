#!/usr/bin/env node
// boxing-loop.js — the boxing-domain closed loop over the Executive Control Layer.
//
// WORK IN PROGRESS. The SPINE is stable (the 5 memory types + the loop + the return
// path); the CONTENT (which drills, dimensions, constraints) stays liquid by design.
// Reuses the Cathedral ledgers — NO new DB, NO new silo. All writes land in
// vortex_data/metrics.db alongside the rest of the executive-control layer.
//
//   Knowledge  = taste-map.json (boxing_drills)        [elsewhere]
//   Strategic  = intent-registry.js  (INTENT-001/006)  ← we register signals
//   Attention  = attention-ledger.js (constraints/watch) ← we seed + add
//   Outcome    = outcome-ledger.js   (domain='boxing')  ← PAUL AS SENSOR, the return path
//
// CLI:
//   node boxing-loop.js --seed
//       register the handover cohort as strategic signals + seed client constraints as attention. Idempotent.
//   node boxing-loop.js --outcome "<what happened>" --result SUCCESS|PARTIAL|NEUTRAL|FAILURE|UNEXPECTED
//                       [--client NAME] [--drill NAME] [--mag 1-10]
//       Paul-as-sensor: record a coaching outcome. THIS is the loop closing.
//   node boxing-loop.js --status
//       show boxing outcomes + cohort signals + open attention items.

import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerSignal } from './intent-registry.js';
import { registerEvent, getUnreviewed } from './attention-ledger.js';
import { recordOutcome, getOutcomes } from './outcome-ledger.js';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, 'vortex_data', 'metrics.db'));

const args = process.argv.slice(2);
const flag = (f) => { const i = args.indexOf(f); return i >= 0 ? (args[i + 1] || true) : null; };

// Client constraints worth standing attention (the things to watch each session).
// Liquid: edit freely as we learn — these are seeds, not a fixed list.
const COHORT_WATCH = [
  ['Josh',    'Right-foot fracture — no pivot on right, no jumping; keep him calm'],
  ['Linda',   'Knee flares + shoulder tweak — warm shoulder first, low-impact knee'],
  ['Jackie',  'Knee (cruciate hx?), drags back foot, falls forward — confirm ACL before loading'],
  ['Hyomi',   'NO physical contact, germophobe, mask — verbal-only, sanitise, distance'],
  ['Francis', 'Weak left foot — targeted left-side work, do not ignore'],
];

function seeded() { return !!db.prepare(`SELECT 1 FROM intent_signals WHERE signal_id = 'br-handover-cohort' LIMIT 1`).get(); }

function seed() {
  if (seeded()) { console.log('[boxing-loop] already seeded — skipping (idempotent).'); return; }
  // Strategic: the cohort advances two existing intents.
  registerSignal('INTENT-006', 'priority_event', 'br-handover-cohort',
    '6 PT clients inherited from Aman (handover 2026-06-12) — retain + upgrade the experience', 'ADVANCES');
  registerSignal('INTENT-001', 'build', 'br-handover-cohort',
    'Closed-loop coaching test: taste map + 10-block CRM + outcome return path on a real cohort', 'ADVANCES');
  // Attention: each medical/handling constraint becomes a standing watch item.
  for (const [name, note] of COHORT_WATCH) {
    registerEvent('client_constraint', 'boxing', 'client', `${name}: ${note}`, {});
  }
  console.log(`[boxing-loop] seeded: 2 strategic signals + ${COHORT_WATCH.length} attention items.`);
}

function outcome() {
  const text = flag('--outcome');
  if (typeof text !== 'string') { console.log('Need --outcome "<what happened>".'); return; }
  const result = (flag('--result') || 'NEUTRAL').toString().toUpperCase();
  const client = flag('--client'); const drill = flag('--drill');
  const mag = parseInt(flag('--mag'), 10) || 5;
  const desc = [client ? `client:${client}` : null, drill ? `drill:${drill}` : null].filter(Boolean).join(' · ') || null;
  // Link to the teaching-leverage intent so the loop rolls up strategically.
  const r = recordOutcome(text, desc, 'boxing', result, mag,
    [{ type: 'intent', id: 'INTENT-001', relationship: result === 'SUCCESS' ? 'ADVANCED' : 'RELATED' }]);
  if (r.error) { console.log('✗', r.error); return; }
  console.log(`✅ outcome logged [${result} ${mag}/10] ${text}${desc ? '  ('+desc+')' : ''}`);
  console.log('   → loop closed: this feeds taste-map refinement + attention.');
}

function status() {
  const outs = getOutcomes({ domain: 'boxing', limit: 15 });
  console.log(`\n🥊 BOXING LOOP — ${outs.length} outcomes logged`);
  for (const o of outs) console.log(`  ${o.result==='SUCCESS'?'✅':o.result==='FAILURE'?'❌':'•'} [${o.result}] ${o.title}${o.description?'  ('+o.description+')':''}`);
  const sigs = db.prepare(`SELECT intent_id, signal_summary FROM intent_signals WHERE signal_id = 'br-handover-cohort'`).all();
  console.log(`\n🎯 strategic signals (${sigs.length}):`);
  for (const s of sigs) console.log(`  ${s.intent_id} — ${s.signal_summary}`);
  const watch = getUnreviewed(30).filter(e => e.source === 'boxing');
  console.log(`\n👁  open attention — client constraints (${watch.length}):`);
  for (const w of watch) console.log(`  • ${w.content}`);
  console.log('');
}

if (flag('--seed')) seed();
else if (args.includes('--outcome')) outcome();
else if (flag('--status')) status();
else console.log('usage: --seed | --outcome "<text>" --result <R> [--client X --drill Y --mag N] | --status');

db.close();
