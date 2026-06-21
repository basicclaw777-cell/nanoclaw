// quarry-watcher.js — The Quarry
// ESM module. PM2 process. Cathy's suggestion (2026-06-21), built same session.
//
// "A permission slip for Paul to be messy." Drop ANYTHING into ~/Downloads/quarry/ —
// voice notes, fail logs, half-formed thoughts, raw clips, gut reactions. No filing,
// no triage, no structure required. The Cathedral MINES it; Paul doesn't refine it.
//
// On every drop: register it (quarry_drops table) → ping Paul it landed → emit a
// neural-bus signal so the organism sees raw signal arrived. Mining is the agents' job.

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import Database from 'better-sqlite3';
import chokidar from 'chokidar';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(process.env.HOME, 'nanoclaw', '.env') });
const execAsync = promisify(exec);

const HOME = process.env.HOME;
const QUARRY_DIR = path.join(HOME, 'Downloads', 'quarry');
const PROCESSED_DIR = path.join(QUARRY_DIR, '.mined');
const DB_PATH = path.join(HOME, 'nanoclaw', 'vortex_data', 'metrics.db');
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const PAUL_CHAT_ID = process.env.PAUL_CHAT_ID ? parseInt(process.env.PAUL_CHAT_ID) : null;

const TEXT_EXT = new Set(['.txt', '.md', '.markdown', '.rtf']);
const AUDIO_EXT = new Set(['.m4a', '.mp3', '.wav', '.aac', '.ogg', '.opus']);
const VIDEO_EXT = new Set(['.mov', '.mp4', '.avi', '.mkv', '.m4v']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.heic', '.webp', '.gif']);

function bucket(ext) {
  ext = ext.toLowerCase();
  if (TEXT_EXT.has(ext)) return 'text';
  if (AUDIO_EXT.has(ext)) return 'audio';
  if (VIDEO_EXT.has(ext)) return 'video';
  if (IMAGE_EXT.has(ext)) return 'image';
  return 'other';
}

// Routing hint — which agent should mine this kind of raw signal (suggestion, not a gate)
const ROUTE = {
  text:  'Cathy',     // half-thoughts → developed
  audio: 'Cathy',     // voice notes (transcribed first) → developed
  video: 'Boxing',    // footage/technique → Gym Eyes / analysis
  image: 'Reed',      // visual → Reed / Maya
  other: 'Orc',       // unknown → triage
};

// ── DB ────────────────────────────────────────────────────────────────────────
const db = new Database(DB_PATH);
db.exec(`CREATE TABLE IF NOT EXISTS quarry_drops (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  dropped_at  INTEGER NOT NULL,
  filename    TEXT NOT NULL,
  kind        TEXT NOT NULL,
  size_bytes  INTEGER,
  content     TEXT,            -- raw text (note) or transcript (audio); null for other media
  route       TEXT,            -- suggested mining agent
  mined       INTEGER NOT NULL DEFAULT 0,   -- agents flip this when they've used it
  mined_by    TEXT,
  mined_at    INTEGER
)`);
try { db.exec(`ALTER TABLE quarry_drops ADD COLUMN route TEXT`); } catch { /* already has it */ }
const insertDrop = db.prepare(
  `INSERT INTO quarry_drops (dropped_at, filename, kind, size_bytes, content, route) VALUES (?, ?, ?, ?, ?, ?)`);
const setContent = db.prepare(`UPDATE quarry_drops SET content = ? WHERE id = ?`);

// Audio → text. Voice note at 3am becomes mineable. Local Whisper (base.en), proven this session.
async function transcribeAudio(filePath, dropId, name) {
  const outDir = path.dirname(filePath);
  const stem = path.basename(filePath, path.extname(filePath));
  const txt = path.join(outDir, stem + '.txt');
  try {
    await execAsync(
      `whisper ${JSON.stringify(filePath)} --model base.en --output_format txt --output_dir ${JSON.stringify(outDir)} --language en --verbose False`,
      { timeout: 600000 });
    if (fs.existsSync(txt)) {
      const transcript = fs.readFileSync(txt, 'utf8').slice(0, 20000);
      setContent.run(transcript, dropId);
      console.log(`[quarry] transcribed #${dropId}: ${name} (${transcript.length} chars)`);
      pingPaul(name, 'voice note (transcribed)');
      emitBus({ id: dropId, filename: name, kind: 'audio', route: ROUTE.audio, transcribed: true });
    }
  } catch (e) { console.error(`[quarry] whisper failed for ${name}: ${e.message}`); }
}

// ── notify ──────────────────────────────────────────────────────────────────
async function pingPaul(name, kind) {
  if (!TELEGRAM_TOKEN || !PAUL_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: PAUL_CHAT_ID,
        text: `🪨 Quarry: ${kind} dropped — “${name}”. Landed raw, no filing needed. The Cathedral will mine it.` }),
    });
  } catch (e) { console.error('[quarry] telegram', e.message); }
}

function emitBus(drop) {
  try {
    const bus = require('./neural-bus.cjs');
    if (bus && typeof bus.emit === 'function') {
      bus.emit({ kind: 'quarry_drop', path: ['quarry'], drop });
    }
  } catch { /* bus optional */ }
}

// ── handle a drop ─────────────────────────────────────────────────────────────
function onDrop(filePath) {
  const name = path.basename(filePath);
  if (name.startsWith('.')) return;
  const ext = path.extname(name);
  const kind = bucket(ext);
  let size = 0, content = null;
  try { size = fs.statSync(filePath).size; } catch {}
  if (kind === 'text') {
    try { content = fs.readFileSync(filePath, 'utf8').slice(0, 20000); } catch {}
  }
  const route = ROUTE[kind] || 'Orc';
  const info = insertDrop.run(Date.now(), name, kind, size, content, route);
  const id = info.lastInsertRowid;
  console.log(`[quarry] mined-in: ${name} (${kind}, ${size}b) → drop #${id} → ${route}`);
  emitBus({ id, filename: name, kind, size, route });
  pingPaul(name, `${kind} → ${route}`);
  if (kind === 'audio') transcribeAudio(filePath, id, name);   // async: voice note → transcript
  // leave a marker so we never double-register (file itself stays for agents to read)
  try {
    fs.mkdirSync(PROCESSED_DIR, { recursive: true });
    fs.writeFileSync(path.join(PROCESSED_DIR, name + '.seen'), String(Date.now()));
  } catch {}
}

// ── watcher ───────────────────────────────────────────────────────────────────
fs.mkdirSync(QUARRY_DIR, { recursive: true });
const seen = (n) => fs.existsSync(path.join(PROCESSED_DIR, path.basename(n) + '.seen'));

const watcher = chokidar.watch(QUARRY_DIR, {
  ignoreInitial: false,                 // catch drops made before the watcher woke
  usePolling: true,
  interval: 3000,
  awaitWriteFinish: { stabilityThreshold: 4000, pollInterval: 1000 },
  ignored: [/(^|[\/\\])\../],           // ignore dotfiles + .mined dir
});
watcher.on('add', (fp) => { if (!seen(fp)) onDrop(fp); });
watcher.on('error', (e) => console.error(`[quarry] watcher: ${e.message}`));

console.log(`[quarry] Watching ${QUARRY_DIR} — drop anything. No filing. The Cathedral mines it.`);
