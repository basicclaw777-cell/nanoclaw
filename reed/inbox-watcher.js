#!/usr/bin/env node
// ~/nanoclaw/reed/inbox-watcher.js
// Reed v2 — INBOX watcher. Watches ~/reed-dump/inbox/ for raw drops Paul makes
// (gym photos/clips) and organizes them SAFELY (copy, never delete originals)
// into a dated, subject-tagged structure under inbox/organized/<YYYY-MM-DD>/.
//
// Each organized file gets a sidecar .json with metadata.
//
// PM2 (long-running watcher):
//   pm2 start ~/nanoclaw/reed/inbox-watcher.js --name reed-inbox-watcher
// One-shot (process existing files and exit, for testing):
//   node ~/nanoclaw/reed/inbox-watcher.js --scan

// NOTE: reed/package.json forces "type": "commonjs" (the Reed spine is CJS),
// so this file is CommonJS — consistent with reed-generate.js / reed-rate.js.
const {
  existsSync, mkdirSync, copyFileSync, writeFileSync, readdirSync, statSync
} = require('fs');
const { join, basename, extname } = require('path');
const { execFileSync } = require('child_process');
const chokidar = require('chokidar');
require('dotenv').config({ path: join(process.env.HOME, 'nanoclaw', '.env') });

const HOME = process.env.HOME;
const INBOX_DIR = join(HOME, 'reed-dump', 'inbox');
const ORGANIZED_DIR = join(INBOX_DIR, 'organized');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const PAUL_CHAT_ID = process.env.PAUL_CHAT_ID;

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.bmp', '.tiff', '.tif']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm', '.hevc']);

const ONESHOT = process.argv.includes('--scan');

// ── Telegram ────────────────────────────────────────────────────────────────

async function sendTelegram(text) {
  if (!TELEGRAM_TOKEN || !PAUL_CHAT_ID) {
    console.log('[reed-inbox] No Telegram credentials, skipping notification');
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: PAUL_CHAT_ID, text, parse_mode: 'Markdown' })
    });
  } catch (e) {
    console.error('[reed-inbox] Telegram error:', e.message);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function todayStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function detectType(file) {
  const ext = extname(file).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  return 'other';
}

// Derive a subject tag from the filename, e.g.
//   "coachpaul-bagwork.jpg" -> "coachpaul, bagwork"
//   "IMG_2931.HEIC"         -> "untagged"
function suggestSubject(file) {
  const stem = basename(file, extname(file));
  const cleaned = stem
    .replace(/[_]+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .toLowerCase();
  const parts = cleaned.split('-').filter((p) => p && !/^\d+$/.test(p) && !/^img$/.test(p));
  if (parts.length === 0) return 'untagged';
  return parts.join(', ');
}

// Cheap image dimensions via macOS native `sips`. Returns "WxH" or null.
function imageDimensions(filePath) {
  try {
    const out = execFileSync(
      'sips',
      ['-g', 'pixelWidth', '-g', 'pixelHeight', filePath],
      { encoding: 'utf8', timeout: 5000 }
    );
    const w = out.match(/pixelWidth:\s*(\d+)/);
    const h = out.match(/pixelHeight:\s*(\d+)/);
    if (w && h) return `${w[1]}x${h[1]}`;
  } catch { /* not an image sips understands, or sips missing */ }
  return null;
}

// Avoid clobbering: if a name already exists in the dest dir, suffix it.
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

// ── Core: organize one file ─────────────────────────────────────────────────

function organizeFile(filePath) {
  try {
    if (!existsSync(filePath)) return false;
    const st = statSync(filePath);
    if (!st.isFile()) return false;

    const name = basename(filePath);
    // Skip sidecars and hidden/system files.
    if (name.startsWith('.') || name.endsWith('.json')) return false;

    const type = detectType(filePath);
    const dateDir = join(ORGANIZED_DIR, todayStamp());
    mkdirSync(dateDir, { recursive: true });

    // COPY (never move/delete — Paul's originals stay untouched in inbox/).
    const dest = uniqueDest(dateDir, name);
    copyFileSync(filePath, dest);

    const dimensions = type === 'image' ? imageDimensions(filePath) : null;

    const sidecar = {
      original_name: name,
      type,
      dropped_at: st.mtime.toISOString(),
      organized_at: new Date().toISOString(),
      dimensions, // null when not cheaply available
      suggested_subject: suggestSubject(name),
      source_path: filePath,
      organized_path: dest
    };
    writeFileSync(`${dest}.json`, JSON.stringify(sidecar, null, 2));

    console.log(`[reed-inbox] organized: ${name} -> ${dest} (${type}${dimensions ? ', ' + dimensions : ''})`);
    return true;
  } catch (e) {
    console.error(`[reed-inbox] failed to organize ${filePath}:`, e.message);
    return false;
  }
}

// ── Scan mode (one-shot) ────────────────────────────────────────────────────

async function scanOnce() {
  if (!existsSync(INBOX_DIR)) {
    console.error('[reed-inbox] inbox dir missing:', INBOX_DIR);
    process.exit(1);
  }
  let count = 0;
  for (const entry of readdirSync(INBOX_DIR)) {
    const full = join(INBOX_DIR, entry);
    // Only top-level files; never descend into organized/.
    try {
      if (!statSync(full).isFile()) continue;
    } catch { continue; }
    if (organizeFile(full)) count++;
  }
  console.log(`[reed-inbox] scan complete: ${count} file(s) organized`);
  if (count > 0) await sendTelegram(`📥 Reed inbox: organized ${count} new file${count === 1 ? '' : 's'}`);
  return count;
}

// ── Watch mode (long-running) ───────────────────────────────────────────────

function startWatcher() {
  if (!existsSync(INBOX_DIR)) {
    console.error('[reed-inbox] inbox dir missing:', INBOX_DIR);
    process.exit(1);
  }
  console.log('[reed-inbox] watching', INBOX_DIR);

  // Batch rapid drops so a multi-file dump = one Telegram notice.
  let pending = 0;
  let flushTimer = null;
  const flush = async () => {
    flushTimer = null;
    const n = pending;
    pending = 0;
    if (n > 0) await sendTelegram(`📥 Reed inbox: organized ${n} new file${n === 1 ? '' : 's'}`);
  };

  const watcher = chokidar.watch(INBOX_DIR, {
    ignoreInitial: true,            // don't reprocess existing on boot
    depth: 0,                       // top-level only; ignore organized/ subdir
    awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 200 },
    ignored: [ORGANIZED_DIR, '**/*.json', /(^|[\/\\])\../]
  });

  watcher.on('add', (filePath) => {
    if (organizeFile(filePath)) {
      pending++;
      if (!flushTimer) flushTimer = setTimeout(flush, 3000);
    }
  });

  watcher.on('error', (e) => console.error('[reed-inbox] watcher error:', e.message));
}

// ── Entry ───────────────────────────────────────────────────────────────────

if (ONESHOT) {
  scanOnce().then((n) => process.exit(0)).catch((e) => {
    console.error('[reed-inbox] scan error:', e.message);
    process.exit(1);
  });
} else {
  startWatcher();
}
