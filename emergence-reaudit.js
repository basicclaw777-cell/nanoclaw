#!/usr/bin/env node
// emergence-reaudit.js — one-shot retroactive audit of CONFIRMED incidents.
// Applies the production-engine ship-gate to already-closed loops: any CONFIRMED
// whose closing output was a refusal/error/block, or a batch-reconciliation close
// with no verified persistence, gets reverted to WATCHING with an honest note.
//
//   node emergence-reaudit.js          # dry run (report only)
//   node emergence-reaudit.js --apply  # write changes

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

const HOME = process.env.HOME;
const BOARD = join(HOME, 'nanoclaw', 'emergence-board.json');
const MEMORY_DIR = join(HOME, 'Cathedral', 'agents', 'memory');
const APPLY = process.argv.includes('--apply');

// Mirror of production-engine.js classifyDeliverable (keep in sync).
const MIN = 200;
const BLOCKED = [
  /\bI need (?:to DM|to ask|the raw|more) /i,
  /\bneed .{0,40} (?:from|before I can)\b/i,
  /\bcan(?:'|no)t (?:complete|proceed|continue) .{0,30}(?:without|until)\b/i,
  /\bwaiting on (?:Paul|the user|input)\b/i,
];
const REFUSAL = [
  /\bI (?:need to be honest|have to be honest|must be honest)\b/i,
  /\bI (?:cannot|can't|won't|will not) (?:apply|complete|do|fulfil|fulfill|generate|produce)\b/i,
  /\bI'm (?:not able|unable) to\b/i,
  /\bthis task (?:asks|requires) me to .{0,60}(?:fabricate|invent|make up|lie)\b/i,
  /\b(?:refuse|declining|decline) to\b/i,
];
// trustLength=false when the only output we have is the 120-char note snippet
// (truncated, so a short string is NOT evidence of a short deliverable).
function classify(output, trustLength) {
  const t = (output || '').trim();
  if (!t) return 'empty';
  if (trustLength && t.length < MIN) return 'too-short';
  const head = t.slice(0, 500);
  if (/^ERROR:/i.test(head)) return 'error';
  if (BLOCKED.some((re) => re.test(head))) return 'blocked-on-paul';
  if (REFUSAL.some((re) => re.test(head))) return 'refusal';
  return 'real';
}

// Pull the 500-char deliverable the engine persisted to agent memory, by emergenceId.
function memoryOutput(inc) {
  const agent = inc.target || inc.agent;
  const f = join(MEMORY_DIR, `${agent}-memory.json`);
  if (!existsSync(f)) return null;
  try {
    const mem = JSON.parse(readFileSync(f, 'utf8'));
    const entries = Array.isArray(mem.entries) ? mem.entries : [];
    const hit = entries.filter((e) => e.emergenceId === inc.id && e.output).pop();
    return hit ? hit.output : null;
  } catch { return null; }
}

function shipTime(inc) {
  for (const f of inc.followUps || []) {
    if (/\[LOOP-CLOSED\]/.test(f.note)) return new Date(f.ts).getTime();
  }
  return inc.lastCheckedAt ? new Date(inc.lastCheckedAt).getTime() : null;
}

// Gate-1 persistence: agent memory file modified after ship time.
function persisted(inc) {
  const agent = inc.target || inc.agent;
  const st = shipTime(inc);
  if (!st || !existsSync(MEMORY_DIR)) return false;
  try {
    for (const f of readdirSync(MEMORY_DIR)) {
      if (!f.endsWith('.json')) continue;
      const a = f.replace('-memory.json', '').replace('.json', '');
      if (a !== agent) continue;
      if (statSync(join(MEMORY_DIR, f)).mtimeMs > st) return true;
    }
  } catch {}
  return false;
}

const board = JSON.parse(readFileSync(BOARD, 'utf8'));
const confirmed = board.incidents.filter((i) => i.status === 'CONFIRMED');

let revert = 0, keep = 0;
const log = [];

for (const inc of confirmed) {
  const closeNote = (inc.followUps || []).filter((f) => /\[LOOP-CLOSED\]/.test(f.note)).pop();
  const note = closeNote?.note || '';
  const isBatch = /batch reconciliation/i.test(note);
  // Pull the "Output: ..." snippet from the engine close note.
  const m = note.match(/Output:\s*([\s\S]*)$/);
  const outputSnippet = m ? m[1] : '';

  let verdict, reason;
  if (isBatch) {
    // No real output captured in the note. Prefer the persisted memory deliverable;
    // if none, trust only if memory was written after ship (Gate-1 persistence).
    const memOut = memoryOutput(inc);
    if (memOut) { verdict = classify(memOut, true); reason = 'batch+memory'; }
    else { verdict = persisted(inc) ? 'real' : 'unverified-batch'; reason = 'batch-reconciliation'; }
  } else {
    // Prefer full 500-char memory output; fall back to truncated 120-char note
    // (length not trusted on the truncated snippet).
    const memOut = memoryOutput(inc);
    if (memOut) { verdict = classify(memOut, true); reason = 'engine+memory'; }
    else { verdict = classify(outputSnippet, false); reason = 'engine-note'; }
  }

  if (verdict === 'real') {
    keep++;
    log.push(`KEEP   [${inc.agent}] ${reason} — ${verdict}`);
  } else {
    revert++;
    log.push(`REVERT [${inc.agent}] ${reason} — ${verdict} :: ${outputSnippet.slice(0, 70).replace(/\n/g, ' ')}`);
    if (APPLY) {
      inc.status = 'WATCHING';
      inc.lastCheckedAt = new Date().toISOString();
      const tag = verdict === 'blocked-on-paul' ? 'BLOCKED-ON-PAUL'
        : verdict === 'refusal' ? 'REFUSED'
        : verdict === 'error' ? 'ERRORED'
        : verdict === 'unverified-batch' ? 'UNVERIFIED'
        : 'NOT-SHIPPED';
      inc.followUps.push({
        ts: new Date().toISOString(),
        note: `[RE-AUDIT ${tag}] Retroactive ship-gate: prior CONFIRMED was not a real deliverable (${verdict}). Reverted to WATCHING. Loop re-opened.`,
      });
    }
  }
}

console.log(`Re-audit of ${confirmed.length} CONFIRMED incidents:`);
console.log(log.join('\n'));
console.log(`\nKEEP: ${keep}  REVERT: ${revert}  ${APPLY ? '(APPLIED)' : '(dry run — pass --apply to write)'}`);

if (APPLY) {
  writeFileSync(BOARD, JSON.stringify(board, null, 2));
  const stats = {};
  for (const i of board.incidents) stats[i.status] = (stats[i.status] || 0) + 1;
  console.log('Board now:', JSON.stringify(stats));
}
