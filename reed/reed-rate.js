#!/usr/bin/env node
'use strict';
/**
 * reed-rate.js — Reed v2's FEEDBACK LOOP. The thing the audit found dead.
 *
 * The spine (reed-generate.js) generates -> lands in ~/reed-dump/ready/ + logs to
 * attempts.jsonl. This file is the OTHER half: Paul (or engagement) rates an item,
 * and the rating teaches three things:
 *   1. ratings.jsonl — the permanent record (item, subject, tool, rating, ts)
 *   2. shots.json     — the "what works" library (rolling rating per subject+format)
 *   3. bandit-brain   — reed-tool + reed-subject arms (Thompson sampling) so the
 *                       spine's NEXT tool/subject pick actually learns from outcomes.
 *
 * Without this, Reed is the blind-generation machine: 1205 images, 0 ratings.
 * "Eyes never opened." This opens them.
 *
 * CLI:
 *   node reed-rate.js list                       # recent un-rated items (attempts + dump)
 *   node reed-rate.js <item-id|filename> <good|bad|1-5>
 *
 * Module:
 *   const { recordRating } = require('./reed-rate');   // for manifest / Telegram
 *   recordRating(itemIdOrFilename, 'good')             // -> { ok, item, subject, tool, ... }
 */

const fs = require('fs');
const path = require('path');
const HOME = process.env.HOME;
const REED = path.join(HOME, 'nanoclaw', 'reed');
const DUMP = path.join(HOME, 'reed-dump', 'ready');
const ATTEMPTS = path.join(REED, 'attempts.jsonl');
const RATINGS = path.join(REED, 'ratings.jsonl');
const SHOTS = path.join(REED, 'shots.json');
const BANDIT = path.join(HOME, 'nanoclaw', 'vortex_data', 'bandit-brain.db');

// ── helpers ──────────────────────────────────────────────────────────────────
function readJsonl(file) {
  try {
    return fs.readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

// An attempt row's stable id: explicit `id`, else its output filename, else hash of ts+brief.
function attemptId(a) {
  if (a.id) return a.id;
  if (a.out) return path.basename(a.out);
  return `${(a.ts || '').replace(/[^0-9]/g, '').slice(0, 14)}-${(a.brief || a.subject || 'item').toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`;
}

function toolOf(a) { return a.tool || a.model || a.engine || 'unknown'; }
// The content subject (e.g. "boxing"). The spine's attempt rows often only carry
// `kind` (image/video) — the real subject lives in the output filename
// (YYYY-MM-DD-<subject>-slug). Prefer an explicit subject; else recover it from
// the filename; else fall back to kind.
function subjectOf(a) {
  if (a.subject) return a.subject;
  if (a.out) {
    const fromName = subjectFromFilename(path.basename(a.out), '');
    if (fromName && fromName !== 'general') return fromName;
  }
  return a.kind || 'general';
}

// Normalise a rating into { label: 'good'|'bad'|'neutral', score: 1-5, igReady? }.
// `instagram-ready` (alias `ig`) is a POSITIVE rating: it implies "good" (so it
// rewards the bandit/shots exactly like good) AND flags the Maya handoff.
function normalizeRating(raw) {
  const s = String(raw).trim().toLowerCase();
  if (s === 'instagram-ready' || s === 'instagram' || s === 'ig' || s === 'ig-ready' || s === 'igready') {
    return { label: 'good', score: 5, igReady: true };
  }
  if (s === 'good' || s === 'g' || s === '+' || s === 'yes') return { label: 'good', score: 4 };
  if (s === 'bad' || s === 'b' || s === '-' || s === 'no') return { label: 'bad', score: 2 };
  const n = parseInt(s, 10);
  if (!isNaN(n) && n >= 1 && n <= 5) return { label: n >= 4 ? 'good' : (n <= 2 ? 'bad' : 'neutral'), score: n };
  return null;
}

// Walk ~/reed-dump/ready/ recursively, return [{ filename, full, subdir }].
function dumpItems() {
  const out = [];
  let subs = [];
  try { subs = fs.readdirSync(DUMP, { withFileTypes: true }); } catch { return out; }
  for (const d of subs) {
    if (d.isDirectory()) {
      const dir = path.join(DUMP, d.name);
      let files = [];
      try { files = fs.readdirSync(dir); } catch {}
      for (const f of files) {
        if (f.startsWith('.')) continue;
        out.push({ filename: f, full: path.join(dir, f), subdir: d.name });
      }
    } else if (d.isFile() && !d.name.startsWith('.')) {
      out.push({ filename: d.name, full: path.join(DUMP, d.name), subdir: '' });
    }
  }
  return out;
}

// Set of already-rated item keys (so list/rate can skip / annotate).
function ratedSet() {
  return new Set(readJsonl(RATINGS).map(r => r.item));
}

// Resolve a user-supplied id-or-filename to a source record.
// Returns { item, subject, tool, source } or null.
function resolveItem(idOrName) {
  const attempts = readJsonl(ATTEMPTS);
  // 1. exact attempt id
  for (const a of attempts) {
    if (attemptId(a) === idOrName) return { item: attemptId(a), subject: subjectOf(a), tool: toolOf(a), source: 'attempt' };
  }
  // 2. attempt whose output basename matches
  for (const a of attempts) {
    if (a.out && path.basename(a.out) === idOrName) return { item: idOrName, subject: subjectOf(a), tool: toolOf(a), source: 'attempt' };
  }
  // 3. a file in the dump
  const di = dumpItems().find(d => d.filename === idOrName || d.full === idOrName);
  if (di) {
    // Try to enrich subject/tool from any attempt that produced this file.
    const match = attempts.find(a => a.out && path.basename(a.out) === di.filename);
    const subject = match ? subjectOf(match) : subjectFromFilename(di.filename, di.subdir);
    const tool = match ? toolOf(match) : toolFromSubdir(di.subdir);
    return { item: di.filename, subject, tool, source: 'dump' };
  }
  return null;
}

// Dump filenames follow YYYY-MM-DD-<subject>-<slug>.ext — recover the subject.
function subjectFromFilename(filename, subdir) {
  const m = filename.match(/^\d{4}-\d{2}-\d{2}-([a-z0-9]+)-/i);
  if (m) return m[1];
  return subdir || 'general';
}
function toolFromSubdir(subdir) {
  if (subdir === 'prompts') return 'openart(prompt)';
  if (subdir === 'clips') return 'fal_seedance';
  if (subdir === 'images') return 'higgsfield_nano_banana_pro';
  return 'unknown';
}

// ── shots.json — the "what works" library (read-modify-write, never clobber) ──
function shotKey(subject, format) { return `${subject}__${format}`; }

function updateShots(subject, format, score, note) {
  let data = { shots: [] };
  try { data = JSON.parse(fs.readFileSync(SHOTS, 'utf8')); } catch {}
  if (!data || typeof data !== 'object') data = { shots: [] };
  if (!Array.isArray(data.shots)) data.shots = [];

  const id = shotKey(subject, format);
  // Match by explicit id OR by subject+format (another agent may seed with its own ids).
  let shot = data.shots.find(s =>
    s && (s.id === id || (s.subject === subject && (s.format === format || s.format == null)))
  );
  if (!shot) {
    shot = { id, subject, format, rating: null, uses: 0, notes: [] };
    data.shots.push(shot);
  }
  // Rolling average rating.
  const prevUses = shot.uses || 0;
  const prevRating = (typeof shot.rating === 'number') ? shot.rating : score;
  shot.uses = prevUses + 1;
  shot.rating = +(((prevRating * prevUses) + score) / shot.uses).toFixed(3);
  shot.subject = shot.subject || subject;
  if (shot.format == null) shot.format = format;
  if (!Array.isArray(shot.notes)) shot.notes = [];
  shot.notes.push(note);
  if (shot.notes.length > 25) shot.notes = shot.notes.slice(-25);
  shot.last_rated = new Date().toISOString();

  fs.writeFileSync(SHOTS, JSON.stringify(data, null, 2));
  return shot;
}

// ── bandit-brain — reward the reed arms (matches production-engine.js pattern) ─
function rewardArm(agentId, action, good) {
  if (!fs.existsSync(BANDIT)) return { wired: false, reason: 'bandit-brain.db missing' };
  let Database;
  try { Database = require('better-sqlite3'); }
  catch { return { wired: false, reason: 'better-sqlite3 not available' }; }
  const db = new Database(BANDIT);
  try {
    const now = Date.now();
    db.prepare('INSERT OR IGNORE INTO arms (agent_id, action) VALUES (?, ?)').run(agentId, action);
    if (good) {
      db.prepare('UPDATE arms SET alpha = alpha + 1, total_updates = total_updates + 1, last_updated = ? WHERE agent_id = ? AND action = ?').run(now, agentId, action);
    } else {
      db.prepare('UPDATE arms SET beta = beta + 1, total_updates = total_updates + 1, last_updated = ? WHERE agent_id = ? AND action = ?').run(now, agentId, action);
    }
    const row = db.prepare('SELECT * FROM arms WHERE agent_id = ? AND action = ?').get(agentId, action);
    return { wired: true, arm: row };
  } finally {
    db.close();
  }
}

// ── the loop: record a rating, teach shots + bandit ──────────────────────────
function recordRating(idOrName, rawRating) {
  const norm = normalizeRating(rawRating);
  if (!norm) return { ok: false, error: `bad rating "${rawRating}" — use good|bad|1-5|instagram-ready` };
  const resolved = resolveItem(idOrName);
  if (!resolved) return { ok: false, error: `item not found: ${idOrName}. Run \`node reed-rate.js list\`.` };

  const { item, subject, tool } = resolved;
  const ts = new Date().toISOString();
  // good (4-5) rewards alpha; bad (1-2) rewards beta; neutral (3) leaves bandit untouched.
  const good = norm.label === 'good';
  const teachBandit = norm.label !== 'neutral';

  // 1. append to ratings.jsonl
  const rec = { item, subject, tool, rating: norm.label, score: norm.score, ts };
  fs.appendFileSync(RATINGS, JSON.stringify(rec) + '\n');

  // 2. shots.json (format == the tool family / kind)
  const format = subject === 'video' || /seedance|kling|veo|video/i.test(tool) ? 'video' : 'image';
  const note = `${ts.slice(0, 10)} ${norm.label}(${norm.score}) via ${tool} — ${item}`;
  const shot = updateShots(subject, format, norm.score, note);

  // 3. bandit-brain: reward reed-tool and reed-subject arms
  const arms = {};
  if (teachBandit) {
    arms.tool = rewardArm('reed-tool', tool, good);
    arms.subject = rewardArm('reed-subject', subject, good);
  }

  const result = { ok: true, item, subject, tool, rating: norm.label, score: norm.score, ts, shot, arms, banditTaught: teachBandit };

  // instagram-ready → auto-route to Maya for caption + headline. The handoff is
  // async (DeepSeek call); we expose a promise so callers can await the sidecar
  // without changing recordRating's synchronous contract for plain good/bad/1-5.
  if (norm.igReady) {
    result.igReady = true;
    try {
      const { handoff } = require('./reed-to-maya');
      result.handoffPromise = handoff(item).catch(e => ({ ok: false, error: e.message }));
    } catch (e) {
      result.handoffPromise = Promise.resolve({ ok: false, error: `reed-to-maya unavailable: ${e.message}` });
    }
  }

  return result;
}

// ── list ─────────────────────────────────────────────────────────────────────
function listUnrated(limit = 20) {
  const rated = ratedSet();
  const rows = [];

  // attempts.jsonl (newest last in file -> show newest first)
  const attempts = readJsonl(ATTEMPTS);
  for (const a of attempts.slice().reverse()) {
    const id = attemptId(a);
    if (rated.has(id)) continue;
    rows.push({ src: 'attempt', id, subject: subjectOf(a), tool: toolOf(a), blocked: a.blocked || null });
    if (rows.length >= limit) break;
  }

  // dump files not already represented + not rated
  const seen = new Set(rows.map(r => r.id));
  for (const d of dumpItems()) {
    if (rated.has(d.filename) || seen.has(d.filename)) continue;
    rows.push({
      src: `dump/${d.subdir || '.'}`,
      id: d.filename,
      subject: subjectFromFilename(d.filename, d.subdir),
      tool: toolFromSubdir(d.subdir),
      blocked: null
    });
    if (rows.length >= limit) break;
  }
  return rows;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
async function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  if (!cmd || cmd === 'help' || cmd === '-h' || cmd === '--help') {
    console.log('Reed feedback loop — close the blind-generation gap.\n');
    console.log('  node reed-rate.js list');
    console.log('  node reed-rate.js <item-id|filename> <good|bad|1-5|instagram-ready>');
    console.log('\n  instagram-ready (alias: ig) — rates good AND hands off to Maya');
    console.log('  for a caption + headline sidecar (publish-ready).');
    return;
  }

  if (cmd === 'list') {
    const rows = listUnrated(30);
    if (!rows.length) { console.log('No un-rated items. (Spine generates -> they appear here.)'); return; }
    console.log(`Un-rated Reed items (${rows.length}):\n`);
    for (const r of rows) {
      const flag = r.blocked ? `  [BLOCKED: ${r.blocked}]` : '';
      console.log(`  • ${r.id}`);
      console.log(`      ${r.src}  subject=${r.subject}  tool=${r.tool}${flag}`);
    }
    console.log(`\nRate one:  node reed-rate.js "<id>" good`);
    return;
  }

  // rate
  const [idOrName, rating] = [cmd, rest[0]];
  if (!rating) { console.log(`Usage: node reed-rate.js "${idOrName}" <good|bad|1-5>`); return; }
  const res = recordRating(idOrName, rating);
  if (!res.ok) { console.error(`✗ ${res.error}`); process.exitCode = 1; return; }

  console.log(`✓ rated ${res.item}`);
  console.log(`    subject=${res.subject}  tool=${res.tool}  rating=${res.rating}(${res.score})`);
  console.log(`    shots.json: ${res.shot.id} -> rating ${res.shot.rating} over ${res.shot.uses} use(s)`);
  if (res.banditTaught) {
    const t = res.arms.tool, s = res.arms.subject;
    if (t && t.wired) console.log(`    bandit reed-tool/${res.tool}: α=${t.arm.alpha} β=${t.arm.beta} (n=${t.arm.total_updates})`);
    else if (t) console.log(`    bandit reed-tool: not wired (${t.reason})`);
    if (s && s.wired) console.log(`    bandit reed-subject/${res.subject}: α=${s.arm.alpha} β=${s.arm.beta} (n=${s.arm.total_updates})`);
    else if (s) console.log(`    bandit reed-subject: not wired (${s.reason})`);
  } else {
    console.log(`    bandit: neutral (3) — arms untouched`);
  }

  // instagram-ready: await the Maya handoff and report the sidecar.
  if (res.igReady && res.handoffPromise) {
    console.log(`\n  📲 instagram-ready → handing off to Maya for caption + headline...`);
    const h = await res.handoffPromise;
    if (h && h.ok) {
      console.log(`    ✓ Maya ${h.placeholder ? 'PLACEHOLDER (offline)' : 'captioned'}: "${h.headline}"`);
      console.log(`    sidecar: ${h.sidecar}`);
      if (h.placeholder) console.log(`    ⚠ Maya offline: ${h.reason}`);
    } else {
      console.log(`    ✗ Maya handoff failed: ${h && h.error}`);
    }
  }

  console.log(`\n  Loop closed: rating -> ratings.jsonl + shots.json + bandit-brain. Next gen picks better.`);
}

if (require.main === module) main();
module.exports = { recordRating, listUnrated, resolveItem, updateShots, rewardArm, normalizeRating };
