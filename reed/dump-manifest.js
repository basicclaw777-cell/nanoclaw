#!/usr/bin/env node
// ~/nanoclaw/reed/dump-manifest.js
// Reed v2 — DAILY OFFLOAD manifest. Scans ~/reed-dump/ready/{clips,images,prompts}
// and produces a clean, scannable MANIFEST.md (newest first, grouped by type) plus
// a machine-readable manifest.json. This is the queue Paul offloads from daily.
//
// Flags:
//   (none)      generate MANIFEST.md + manifest.json, send Telegram summary line
//   --archive   first move items older than 7 days out of ready/ into
//               ~/reed-dump/archive/<YYYY-MM>/ so the queue only shows fresh items,
//               then regenerate the manifest.
//
// PM2 cron suggestion (daily 07:00 HKT = 23:00 UTC previous day) — DO NOT auto-start:
//   pm2 start ~/nanoclaw/reed/dump-manifest.js --name reed-manifest \
//     --no-autorestart --cron-restart "0 23 * * *" -- --archive

// NOTE: reed/package.json forces "type": "commonjs" (the Reed spine is CJS),
// so this file is CommonJS — consistent with reed-generate.js / reed-rate.js.
const {
  existsSync, mkdirSync, readdirSync, statSync, readFileSync, writeFileSync, renameSync
} = require('fs');
const { join, basename, extname } = require('path');
require('dotenv').config({ path: join(process.env.HOME, 'nanoclaw', '.env') });

const HOME = process.env.HOME;
const READY_DIR = join(HOME, 'reed-dump', 'ready');
const CLIPS_DIR = join(READY_DIR, 'clips');
const IMAGES_DIR = join(READY_DIR, 'images');
const PROMPTS_DIR = join(READY_DIR, 'prompts');
const ARCHIVE_DIR = join(HOME, 'reed-dump', 'archive');
const MANIFEST_MD = join(READY_DIR, 'MANIFEST.md');
const MANIFEST_JSON = join(READY_DIR, 'manifest.json');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const PAUL_CHAT_ID = process.env.PAUL_CHAT_ID;

const PROMPT_EXTS = new Set(['.txt', '.md', '.prompt', '.json']);
const ARCHIVE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const DO_ARCHIVE = process.argv.includes('--archive');

// ── Telegram ────────────────────────────────────────────────────────────────

async function sendTelegram(text) {
  if (!TELEGRAM_TOKEN || !PAUL_CHAT_ID) {
    console.log('[reed-manifest] No Telegram credentials, skipping notification');
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: PAUL_CHAT_ID, text, parse_mode: 'Markdown' })
    });
  } catch (e) {
    console.error('[reed-manifest] Telegram error:', e.message);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function ymd(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}
function ym(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}`;
}

function suggestSubject(file) {
  const stem = basename(file, extname(file));
  const cleaned = stem.replace(/[_]+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
  const parts = cleaned.split('-').filter((p) => p && !/^\d+$/.test(p) && !/^img$/.test(p));
  return parts.length ? parts.join(', ') : 'untagged';
}

// List real files in a dir (skip dirs, hidden, sidecars).
function listFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (!st.isFile()) continue;
    out.push({ name: entry, path: full, mtime: st.mtime, size: st.size });
  }
  return out;
}

function firstLine(filePath) {
  try {
    const raw = readFileSync(filePath, 'utf8');
    const line = raw.split(/\r?\n/).find((l) => l.trim().length > 0);
    if (!line) return '';
    return line.trim().slice(0, 160);
  } catch {
    return '';
  }
}

function uniqueDest(dir, name) {
  let candidate = join(dir, name);
  if (!existsSync(candidate)) return candidate;
  const ext = extname(name);
  const stem = basename(name, ext);
  let i = 1;
  while (existsSync(candidate)) {
    candidate = join(dir, `${stem}__${i}${ext}`);
    i++;
  }
  return candidate;
}

// ── Archive step ────────────────────────────────────────────────────────────

function archiveOld() {
  const now = Date.now();
  let moved = 0;
  for (const dir of [CLIPS_DIR, IMAGES_DIR, PROMPTS_DIR]) {
    for (const f of listFiles(dir)) {
      if (now - f.mtime.getTime() < ARCHIVE_AGE_MS) continue;
      const monthDir = join(ARCHIVE_DIR, ym(f.mtime));
      mkdirSync(monthDir, { recursive: true });
      const dest = uniqueDest(monthDir, f.name);
      try {
        renameSync(f.path, dest);
        moved++;
        console.log(`[reed-manifest] archived: ${f.name} -> ${dest}`);
      } catch (e) {
        console.error(`[reed-manifest] archive failed for ${f.name}:`, e.message);
      }
    }
  }
  console.log(`[reed-manifest] archive complete: ${moved} item(s) moved`);
  return moved;
}

// ── Build manifest data ─────────────────────────────────────────────────────

function buildItems(dir, type, withPrompt) {
  return listFiles(dir)
    .map((f) => {
      const item = {
        type,
        filename: f.name,
        subject: suggestSubject(f.name),
        date: ymd(f.mtime),
        mtime: f.mtime.toISOString(),
        size: f.size,
        path: f.path
      };
      if (withPrompt) item.prompt_first_line = firstLine(f.path);
      return item;
    })
    .sort((a, b) => new Date(b.mtime) - new Date(a.mtime)); // newest first
}

function renderMarkdown(clips, images, prompts) {
  const total = clips.length + images.length + prompts.length;
  const lines = [];
  lines.push('# Reed Offload Queue');
  lines.push('');
  lines.push(
    `> Offload queue: **${total} items ready** ` +
    `(${clips.length} clips, ${images.length} images, ${prompts.length} prompts)`
  );
  lines.push('');
  lines.push(`_Generated ${new Date().toISOString()}_`);
  lines.push('');

  const section = (title, items, isPrompt) => {
    lines.push(`## ${title} (${items.length})`);
    lines.push('');
    if (items.length === 0) {
      lines.push('_none_');
      lines.push('');
      return;
    }
    for (const it of items) {
      let line = `- **${it.filename}** — ${it.subject} — ${it.date}`;
      if (isPrompt && it.prompt_first_line) line += `\n  > ${it.prompt_first_line}`;
      lines.push(line);
    }
    lines.push('');
  };

  section('Clips', clips, false);
  section('Images', images, false);
  section('Prompts', prompts, true);

  return lines.join('\n');
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (DO_ARCHIVE) archiveOld();

  const clips = buildItems(CLIPS_DIR, 'clip', false);
  const images = buildItems(IMAGES_DIR, 'image', false);
  const prompts = buildItems(PROMPTS_DIR, 'prompt', true);
  const total = clips.length + images.length + prompts.length;

  const md = renderMarkdown(clips, images, prompts);
  writeFileSync(MANIFEST_MD, md);

  const json = {
    generated_at: new Date().toISOString(),
    counts: { total, clips: clips.length, images: images.length, prompts: prompts.length },
    items: { clips, images, prompts }
  };
  writeFileSync(MANIFEST_JSON, JSON.stringify(json, null, 2));

  const summary =
    `📤 Reed offload queue: ${total} items ready ` +
    `(${clips.length} clips, ${images.length} images, ${prompts.length} prompts)`;
  console.log('[reed-manifest]', summary);
  console.log('[reed-manifest] wrote', MANIFEST_MD);
  console.log('[reed-manifest] wrote', MANIFEST_JSON);

  await sendTelegram(summary);
}

main().catch((e) => {
  console.error('[reed-manifest] error:', e.message);
  process.exit(1);
});
