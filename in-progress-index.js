#!/usr/bin/env node
// ~/nanoclaw/in-progress-index.js
// Module B — Cathedral Status Board, IN PROGRESS / BASKET view.
// Reads the live work queues and groups them into "to make" vs "running":
//   - ~/nanoclaw/reed/image-requests.json   (Maya's requested images)
//   - ~/nanoclaw/reed/capture-wishlist.json (shots Paul must film)
//   - ~/nanoclaw/reed/sprint-plan.json      (Logan sprint allocation + status)
//
// Output: ~/nanoclaw/in-progress-index.json
// The dashboard reads it. CLI: node in-progress-index.js [--quiet]
//
// No external calls — pure file read. Cheap to regenerate on every board load.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REED_DIR = path.join(__dirname, 'reed');
const OUT_FILE = path.join(__dirname, 'in-progress-index.json');
const QUIET = process.argv.includes('--quiet');

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(path.join(REED_DIR, file), 'utf8')); }
  catch { return null; }
}

// "to make" = nothing produced yet · "running" = generation underway/done-pending-review
const RUNNING_STATES = new Set(['generated', 'generating', 'in-progress', 'running', 'rendering']);

function build() {
  // ── Maya image requests ──────────────────────────────────────────────────
  const imageReqRaw = readJson('image-requests.json') || [];
  const imageRequests = imageReqRaw.map((r) => ({
    id: r.id,
    kind: 'image-request',
    title: r.pillar || 'Image',
    detail: r.brief || '',
    format: r.format || null,
    status: r.status || 'requested',
    bucket: RUNNING_STATES.has((r.status || '').toLowerCase()) ? 'running' : 'to_make',
    output: r.output || null,
    tool: r.tool || null,
    source: r.source || 'maya-plan',
    ts: r.ts || r.generatedTs || null,
  }));

  // ── Capture wishlist (shots Paul must film) ──────────────────────────────
  const wishlistRaw = readJson('capture-wishlist.json') || { requests: [] };
  const wishlist = (wishlistRaw.requests || []).map((w) => ({
    id: w.id,
    kind: 'capture',
    title: w.suggestedName || w.id,
    detail: w.what || '',
    purpose: w.for || '',
    priority: w.priority || null,
    format: w.format || null,
    status: w.status || 'open',
    // capture items are ALWAYS "to make" until Paul films them (then captured)
    bucket: (w.status || 'open').toLowerCase() === 'captured' ? 'running' : 'to_make',
    note: w.corpusNote || null,
    requestedBy: w.requestedBy || 'reed',
  }));

  // ── Sprint plan (Logan + Maya tracks, allocation + status) ───────────────
  const sprintRaw = readJson('sprint-plan.json') || {};
  const sprintTracks = [];
  for (const key of Object.keys(sprintRaw)) {
    const t = sprintRaw[key];
    if (!t || typeof t !== 'object' || !('credits' in t)) continue;
    if (key === 'reserve' || key === 'totals') {
      sprintTracks.push({
        id: key, kind: 'sprint-meta', title: prettyKey(key),
        credits: t.credits ?? null, note: t.note || null, items: [],
      });
      continue;
    }
    sprintTracks.push({
      id: key,
      kind: 'sprint-track',
      title: prettyKey(key),
      focus: t.focus || t.what || '',
      credits: t.credits ?? null,
      gens: t.gens ?? null,
      gate: t.gate || null,
      note: t.note || null,
      items: Array.isArray(t.items) ? t.items.map((it) => ({
        item: it.item, gens: it.gens ?? null, credits: it.credits ?? null,
      })) : [],
    });
  }
  const sprint = {
    comment: sprintRaw._comment || null,
    status: sprintRaw.status || null,
    discipline: sprintRaw.discipline || null,
    expected_keepers: sprintRaw.expected_keepers || null,
    totals: sprintRaw.totals || null,
    reserve: sprintRaw.reserve || null,
    pre_run_checklist: sprintRaw.pre_run_checklist || [],
    tracks: sprintTracks,
  };

  // ── Buckets summary ──────────────────────────────────────────────────────
  const basket = [...imageRequests, ...wishlist];
  const toMake = basket.filter((b) => b.bucket === 'to_make');
  const running = basket.filter((b) => b.bucket === 'running');

  const out = {
    generated_at: new Date().toISOString(),
    counts: {
      to_make: toMake.length,
      running: running.length,
      image_requests: imageRequests.length,
      capture_wishlist: wishlist.length,
      sprint_tracks: sprintTracks.filter((t) => t.kind === 'sprint-track').length,
    },
    image_requests: imageRequests,
    capture_wishlist: wishlist,
    sprint,
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));

  if (!QUIET) {
    console.log('[in-progress-index]',
      `${out.counts.to_make} to-make, ${out.counts.running} running · ` +
      `${imageRequests.length} image reqs, ${wishlist.length} capture shots, ` +
      `${out.counts.sprint_tracks} sprint tracks`);
    console.log('[in-progress-index] wrote', OUT_FILE);
  }
  return out;
}

function prettyKey(k) {
  return k.replace(/^phase_/, 'Phase ').replace(/^track_/, 'Track ')
    .replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { build(); }
  catch (e) { console.error('[in-progress-index] error:', e.message); process.exit(1); }
}

export { build };
