#!/usr/bin/env node
'use strict';
/**
 * capture-wishlist.js — the front of the Reed->Maya content pipeline.
 *
 * Paul is the capture point. This tool tells him EXACTLY what gym footage /
 * photos to shoot. The pipeline:
 *
 *   capture-wishlist (what to shoot)  <-- you are here
 *      -> Paul shoots
 *      -> drops into ~/reed-dump/inbox/
 *      -> inbox-watcher.js organizes it (inbox/organized/<date>/)
 *      -> becomes motion-reference / raw material for Reed.
 *
 * Backing store: capture-wishlist.json (next to this file). Code obeys the JSON.
 *
 * CLI:
 *   node capture-wishlist.js list                 # open requests by priority (auto-reconciles inbox)
 *   node capture-wishlist.js add "<description>" [--priority P1|P2] [--for "asset"] [--format clip|photo]
 *   node capture-wishlist.js done <id>            # mark captured manually
 *   node capture-wishlist.js reconcile            # just run inbox auto-match
 *
 * Module:
 *   const wl = require('./capture-wishlist');
 *   wl.pending();          // open items (for /capture Telegram command + Reed lookahead)
 *   wl.reconcileInbox();   // auto-mark items whose file already landed in inbox
 *   wl.list();             // {P1:[...], P2:[...]}
 *   wl.add({...}); wl.done(id);
 *
 * reed/package.json forces type:commonjs — this file is CJS (require/module.exports),
 * consistent with inbox-watcher.js / reed-generate.js / reed-rate.js.
 */

const fs = require('fs');
const path = require('path');

const HOME = process.env.HOME;
const WISHLIST_PATH = path.join(__dirname, 'capture-wishlist.json');
const INBOX_DIR = path.join(HOME, 'reed-dump', 'inbox');
const ORGANIZED_DIR = path.join(INBOX_DIR, 'organized');

// ── store ─────────────────────────────────────────────────────────────────

function load() {
  const raw = fs.readFileSync(WISHLIST_PATH, 'utf8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data.requests)) data.requests = [];
  if (!Array.isArray(data.captured)) data.captured = [];
  return data;
}

function save(data) {
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(WISHLIST_PATH, JSON.stringify(data, null, 2) + '\n');
}

// ── filename matching ───────────────────────────────────────────────────────

// Normalise a filename to a hyphen/space-split set of lowercase tokens,
// matching how inbox-watcher.js derives subject tags.
function tokens(name) {
  const stem = name.replace(/\.[^.]+$/, ''); // strip extension
  return stem
    .replace(/[_]+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .toLowerCase()
    .split('-')
    .filter(Boolean);
}

function stemOf(suggestedName) {
  return (suggestedName || '').replace(/\.[^.]+$/, '').toLowerCase();
}

// Does dropped file `fileName` fulfil wishlist `item`?
//   1. filename contains the item's suggestedName stem (e.g. "logan-ref-jab"), OR
//   2. the filename tokens contain ALL of the item's matchKeywords.
function fileMatchesItem(fileName, item) {
  const lower = fileName.toLowerCase();
  const stem = stemOf(item.suggestedName);
  if (stem && lower.includes(stem)) return true;

  const kws = (item.matchKeywords || []).map((k) => k.toLowerCase());
  if (kws.length === 0) return false;
  const toks = tokens(fileName);
  return kws.every((k) => toks.includes(k));
}

// Collect candidate dropped files: top-level inbox/ + organized/**.
function inboxFiles() {
  const out = [];
  const skip = (n) => n.startsWith('.') || n.endsWith('.json');

  // top-level inbox drops (before watcher organizes them)
  try {
    for (const n of fs.readdirSync(INBOX_DIR)) {
      if (skip(n)) continue;
      const full = path.join(INBOX_DIR, n);
      try { if (fs.statSync(full).isFile()) out.push({ name: n, path: full }); } catch {}
    }
  } catch {}

  // organized files (after watcher has copied them, dated subdirs)
  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (!skip(e.name)) out.push({ name: e.name, path: full });
    }
  };
  walk(ORGANIZED_DIR);

  return out;
}

// ── core operations ─────────────────────────────────────────────────────────

// Scan the inbox; for every OPEN item whose file has already been dropped,
// mark it captured and record which file fulfilled it. Returns the items
// that were auto-cleared this run.
function reconcileInbox() {
  const data = load();
  const files = inboxFiles();
  if (files.length === 0) return [];

  const cleared = [];
  for (const item of data.requests) {
    if (item.status !== 'open') continue;
    const hit = files.find((f) => fileMatchesItem(f.name, item));
    if (hit) {
      item.status = 'captured';
      item.capturedAt = new Date().toISOString();
      item.fulfilledBy = hit.name;
      item.autoMatched = true;
      data.captured.push(item.id);
      cleared.push(item);
    }
  }
  if (cleared.length > 0) save(data);
  return cleared;
}

// Open items, for /capture Telegram command + Reed lookahead.
function pending() {
  return load().requests.filter((r) => r.status === 'open');
}

// Open items grouped by priority. Runs reconcileInbox() first so the list
// self-updates from whatever Paul already dropped.
function list({ reconcile = true } = {}) {
  if (reconcile) reconcileInbox();
  const open = pending();
  const grouped = {};
  for (const r of open) {
    const p = r.priority || 'P2';
    (grouped[p] = grouped[p] || []).push(r);
  }
  return grouped;
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'capture';
}

function add({ what, priority = 'P2', forAsset = '', format = 'clip', suggestedName, matchKeywords, requestedBy = 'paul' } = {}) {
  if (!what || !what.trim()) throw new Error('add: description ("what") is required');
  const data = load();

  let id = slugify(what);
  // ensure unique id
  const existing = new Set(data.requests.map((r) => r.id));
  if (existing.has(id)) {
    let i = 2;
    while (existing.has(`${id}-${i}`)) i++;
    id = `${id}-${i}`;
  }

  const ext = format === 'photo' ? 'jpg' : 'mov';
  const item = {
    id,
    priority,
    format,
    what: what.trim(),
    for: forAsset,
    suggestedName: suggestedName || `${id}.${ext}`,
    matchKeywords: matchKeywords || id.split('-').slice(0, 2),
    status: 'open',
    requestedBy,
    timestamp: new Date().toISOString()
  };
  data.requests.push(item);
  save(data);
  return item;
}

function done(id) {
  const data = load();
  const item = data.requests.find((r) => r.id === id);
  if (!item) throw new Error(`done: no wishlist item with id "${id}"`);
  item.status = 'captured';
  item.capturedAt = new Date().toISOString();
  item.autoMatched = false;
  if (!data.captured.includes(id)) data.captured.push(id);
  save(data);
  return item;
}

module.exports = {
  WISHLIST_PATH,
  load,
  pending,
  list,
  add,
  done,
  reconcileInbox,
  fileMatchesItem,
  inboxFiles
};

// ── CLI ──────────────────────────────────────────────────────────────────────

function fmtItem(r) {
  const lines = [];
  lines.push(`  • [${r.id}] ${r.format === 'photo' ? '📷 photo' : '🎬 clip'} — ${r.what}`);
  if (r.for) lines.push(`      for: ${r.for}`);
  lines.push(`      drop as: ${r.suggestedName}`);
  if (r.corpusNote) lines.push(`      note: ${r.corpusNote}`);
  return lines.join('\n');
}

function printList() {
  const cleared = reconcileInbox();
  if (cleared.length > 0) {
    console.log(`✓ auto-captured ${cleared.length} item(s) from inbox:`);
    for (const c of cleared) console.log(`    [${c.id}] fulfilled by ${c.fulfilledBy}`);
    console.log('');
  }
  const grouped = list({ reconcile: false });
  const order = ['P1', 'P2'];
  const keys = [...order, ...Object.keys(grouped).filter((k) => !order.includes(k))];
  const open = pending();
  console.log(`CAPTURE WISHLIST — ${open.length} open request(s)\n`);
  let any = false;
  for (const p of keys) {
    if (!grouped[p] || grouped[p].length === 0) continue;
    any = true;
    console.log(`${p} (${grouped[p].length}):`);
    for (const r of grouped[p]) console.log(fmtItem(r));
    console.log('');
  }
  if (!any) console.log('  (nothing open — all captured)');
}

function parseFlags(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { flags[a.slice(2)] = argv[++i]; }
    else positional.push(a);
  }
  return { flags, positional };
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case undefined:
    case 'list':
      printList();
      break;
    case 'reconcile': {
      const cleared = reconcileInbox();
      if (cleared.length === 0) console.log('No new inbox matches.');
      else for (const c of cleared) console.log(`✓ [${c.id}] captured — fulfilled by ${c.fulfilledBy}`);
      break;
    }
    case 'add': {
      const { flags, positional } = parseFlags(rest);
      const what = positional.join(' ');
      const item = add({
        what,
        priority: flags.priority || 'P2',
        forAsset: flags.for || '',
        format: flags.format || 'clip',
        suggestedName: flags.name,
        requestedBy: flags.by || 'paul'
      });
      console.log(`✓ added [${item.id}] ${item.priority} — drop as ${item.suggestedName}`);
      break;
    }
    case 'done': {
      const id = rest[0];
      if (!id) { console.error('usage: capture-wishlist.js done <id>'); process.exit(1); }
      const item = done(id);
      console.log(`✓ [${item.id}] marked captured`);
      break;
    }
    default:
      console.error(`unknown command: ${cmd}`);
      console.error('usage: list | add "<desc>" [--priority P1|P2] [--for "..."] [--format clip|photo] [--name file] | done <id> | reconcile');
      process.exit(1);
  }
}

if (require.main === module) main();
