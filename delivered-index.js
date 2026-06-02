#!/usr/bin/env node
// ~/nanoclaw/delivered-index.js
// Module B — Cathedral Status Board, DELIVERED view.
// "Where's my stuff — let me SEE it." Aggregates every finished output into one
// viewable inbox index that the /board dashboard reads.
//
// Sources scanned:
//   1. ~/reed-dump/ready/{clips,images,prompts}/  — Reed offload queue. Real files.
//      Each item: name, type, full path, mtime, matching .caption.md sidecar (publish-ready).
//   2. ~/cathedral-vault/00_Staging/  — recent research reports (POINTER entries, not read).
//   3. /Volumes/KINGSTON2/goldmines/  — patents/goldmines location (POINTER, just listed).
//
// Output: ~/nanoclaw/delivered-index.json
//   { generated_at, counts, items: [ {id,type,name,path,thumb,made_at,source,publish_ready,...} ] }
//
// The dashboard serves clips/images/captions via the cath-bridge static route
// /board/file?path=... (whitelisted to ~/reed-dump/ready/).
//
// CLI:
//   node delivered-index.js          regenerate the index
//   node delivered-index.js --quiet  no console summary
//
// PM2 cron suggestion (DO NOT auto-start — dashboard also regenerates on load):
//   pm2 start ~/nanoclaw/delivered-index.js --name delivered-index \
//     --no-autorestart --cron-restart "*/30 * * * *"

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOME = process.env.HOME;
const READY_DIR = path.join(HOME, 'reed-dump', 'ready');
const CLIPS_DIR = path.join(READY_DIR, 'clips');
const IMAGES_DIR = path.join(READY_DIR, 'images');
const PROMPTS_DIR = path.join(READY_DIR, 'prompts');
const STAGING_DIR = path.join(HOME, 'cathedral-vault', '00_Staging');
const GOLDMINES_DIR = '/Volumes/KINGSTON2/goldmines';
const OUT_FILE = path.join(__dirname, 'delivered-index.json');

const QUIET = process.argv.includes('--quiet');

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.m4v']);
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif']);

// ── helpers ──────────────────────────────────────────────────────────────────

function captionSidecar(itemPath) { return `${itemPath}.caption.md`; }

function captionHeadline(itemPath) {
  try {
    const raw = fs.readFileSync(captionSidecar(itemPath), 'utf8')
      .replace(/^---[\s\S]*?---\n/, '');
    const line = raw.split(/\r?\n/).find((l) => l.trim().startsWith('# '));
    return line ? line.replace(/^#\s+/, '').trim().slice(0, 100) : '';
  } catch { return ''; }
}

function subjectFromName(file) {
  const stem = path.basename(file, path.extname(file));
  const cleaned = stem.replace(/[_]+/g, '-').replace(/[^a-zA-Z0-9-]/g, ' ').trim();
  // strip leading ISO date + pillar slug noise, keep readable
  return cleaned.replace(/^\d{4}-\d{2}-\d{2}-?/, '').replace(/-/g, ' ').trim() || stem;
}

function firstTextLine(filePath, max = 200) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const line = raw.split(/\r?\n/).find((l) => l.trim().length > 0);
    return line ? line.trim().slice(0, max) : '';
  } catch { return ''; }
}

// rel path under READY_DIR — used to build the /board/file?path= URL the
// static route whitelists.
function readyRel(fullPath) {
  return path.relative(READY_DIR, fullPath);
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    if (entry.endsWith('.caption.md')) continue; // sidecar, not a queue item
    const full = path.join(dir, entry);
    let st;
    try { st = fs.statSync(full); } catch { continue; }
    if (!st.isFile()) continue;
    out.push({ name: entry, path: full, mtime: st.mtime, size: st.size });
  }
  return out;
}

// ── reed-dump items (clips / images / prompts) ───────────────────────────────

function reedItems(dir, declaredType) {
  return listFiles(dir).map((f) => {
    const ext = path.extname(f.name).toLowerCase();
    let type = declaredType;
    if (declaredType === 'clip' || VIDEO_EXTS.has(ext)) type = 'clip';
    else if (declaredType === 'image' || IMAGE_EXTS.has(ext)) type = 'image';
    else type = 'prompt';

    const captioned = fs.existsSync(captionSidecar(f.path));
    const rel = readyRel(f.path);
    const fileUrl = `/board/file?path=${encodeURIComponent(rel)}`;

    const item = {
      id: `reed-${type}-${f.name}`,
      type,                                   // clip | image | prompt
      name: f.name,
      subject: subjectFromName(f.name),
      path: f.path,                           // where-it-lives (full path)
      url: type === 'prompt' ? null : fileUrl, // playable/viewable URL (clips+images)
      thumb: type === 'image' ? fileUrl : (type === 'clip' ? fileUrl : null),
      made_at: f.mtime.toISOString(),
      size: f.size,
      source: 'reed-dump',
      publish_ready: captioned,
      caption_url: captioned
        ? `/board/file?path=${encodeURIComponent(readyRel(captionSidecar(f.path)))}`
        : null,
      caption_headline: captioned ? captionHeadline(f.path) : '',
    };
    if (type === 'prompt') {
      item.prompt_text = firstTextLine(f.path, 300);
      item.text_url = fileUrl; // the .md itself is viewable text
    }
    return item;
  });
}

// ── research pointers (00_Staging recent reports) ────────────────────────────

function recentResearchPointers(limit = 12) {
  if (!fs.existsSync(STAGING_DIR)) return [];
  const found = [];
  // shallow-ish walk: scan each domain subfolder one level deep for .md
  let domains;
  try { domains = fs.readdirSync(STAGING_DIR, { withFileTypes: true }); } catch { return []; }
  for (const d of domains) {
    if (!d.isDirectory()) continue;
    const sub = path.join(STAGING_DIR, d.name);
    let files;
    try { files = fs.readdirSync(sub); } catch { continue; }
    for (const fn of files) {
      if (!fn.endsWith('.md')) continue;
      const full = path.join(sub, fn);
      let st;
      try { st = fs.statSync(full); } catch { continue; }
      if (!st.isFile()) continue;
      found.push({
        domain: d.name,
        name: fn,
        path: full,
        mtime: st.mtime,
        size: st.size,
      });
    }
  }
  found.sort((a, b) => b.mtime - a.mtime);
  return found.slice(0, limit).map((f) => ({
    id: `research-${f.domain}-${f.name}`,
    type: 'research',
    name: f.name.replace(/\.md$/, '').replace(/[-_]/g, ' '),
    subject: f.domain,
    path: f.path,                 // pointer only — open in Obsidian, not served
    url: null,
    thumb: null,
    made_at: f.mtime.toISOString(),
    size: f.size,
    source: `vault/00_Staging/${f.domain}`,
    publish_ready: false,
  }));
}

// ── goldmine / patents pointer (just point, don't read 4500 lines) ───────────

function goldminePointers() {
  if (!fs.existsSync(GOLDMINES_DIR)) {
    return [{
      id: 'goldmines-unmounted',
      type: 'pointer',
      name: 'Goldmines / Patents (drive not mounted)',
      subject: 'research archive',
      path: GOLDMINES_DIR,
      url: null, thumb: null,
      made_at: null,
      source: 'KINGSTON2 (offline)',
      publish_ready: false,
      note: 'Mount KINGSTON2 to access. 10 goldmine sources, ~4,500 lines of research.',
    }];
  }
  let files;
  try { files = fs.readdirSync(GOLDMINES_DIR).filter((f) => f.endsWith('.md')); }
  catch { files = []; }
  return [{
    id: 'goldmines-archive',
    type: 'pointer',
    name: `Goldmines / Patents archive (${files.length} sources)`,
    subject: 'research archive',
    path: GOLDMINES_DIR,
    url: null, thumb: null,
    made_at: null,
    source: '/Volumes/KINGSTON2/goldmines',
    publish_ready: false,
    note: `Expired patents, PhD dissertations, failed trials, Soviet sports science and more. ${files.length} source files — open the drive to read.`,
    listing: files,
  }];
}

// ── main ─────────────────────────────────────────────────────────────────────

function build() {
  const clips = reedItems(CLIPS_DIR, 'clip');
  const images = reedItems(IMAGES_DIR, 'image');
  const prompts = reedItems(PROMPTS_DIR, 'prompt');
  const research = recentResearchPointers();
  const pointers = goldminePointers();

  const items = [...clips, ...images, ...prompts, ...research, ...pointers]
    .sort((a, b) => {
      if (!a.made_at) return 1;
      if (!b.made_at) return -1;
      return new Date(b.made_at) - new Date(a.made_at);
    });

  const counts = {
    total: items.length,
    clips: clips.length,
    images: images.length,
    prompts: prompts.length,
    research: research.length,
    pointers: pointers.length,
    publish_ready: items.filter((i) => i.publish_ready).length,
  };

  const out = { generated_at: new Date().toISOString(), counts, items };
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));

  if (!QUIET) {
    console.log('[delivered-index]',
      `${counts.total} items · ${counts.clips} clips, ${counts.images} images, ` +
      `${counts.prompts} prompts, ${counts.research} research, ${counts.pointers} pointers · ` +
      `${counts.publish_ready} publish-ready`);
    console.log('[delivered-index] wrote', OUT_FILE);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { build(); }
  catch (e) { console.error('[delivered-index] error:', e.message); process.exit(1); }
}

export { build };
