// intake-watcher.js — Boxing Camera Intake Pipeline
// ESM module. PM2 process.
// Watches ~/boxing-corpus/inbox/ for new video files.
// Auto-categorizes or prompts via Telegram inline keyboard.
// Renames to YYYYMMDD_HHMM_{category}.ext standard format.
// Triggers YOLO + Whisper + Gym Eyes enrichment. Sends summary.

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import chokidar from 'chokidar';
import Database from 'better-sqlite3';
import { scanVideoAttendance } from './attendance-logger.js';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(process.env.HOME, 'nanoclaw', '.env') });

const execAsync = promisify(exec);

const HOME = process.env.HOME;
const INBOX_DIR = path.join(HOME, 'boxing-corpus', 'inbox');
const CORPUS_DIR = path.join(HOME, 'boxing-corpus');
const VENV_PYTHON = path.join(HOME, 'cathedral-venv', 'bin', 'python3');
const MOVEMENT_SCRIPT = path.join(HOME, 'Cathedral', 'boxing_movement.py');
const DB_PATH = path.join(HOME, 'nanoclaw', 'vortex_data', 'metrics.db');
const PROCESSED_MARKER_DIR = path.join(INBOX_DIR, '.processed');
const VIDEO_EXTENSIONS = new Set(['.mov', '.mp4', '.avi', '.mkv', '.m4v']);

// ── Categories ──────────────────────────────────────────────────────────────

const CATEGORIES = {
  padwork:      { pattern: /pad|pads|mitt|mitts|feed/i,       curriculum: true,  persons: 2, label: 'Padwork' },
  sparring:     { pattern: /spar|fight|bout/i,                curriculum: true,  persons: 2, label: 'Sparring' },
  bagwork:      { pattern: /bag|heavy|banana/i,               curriculum: false, persons: 1, label: 'Bag Work' },
  shadowboxing: { pattern: /shadow|shad|mirror/i,             curriculum: false, persons: 1, label: 'Shadow Boxing' },
  technique:    { pattern: /tech|drill|demo|slow/i,           curriculum: true,  persons: 1, label: 'Technique' },
  class:        { pattern: /class|group|session/i,            curriculum: true,  persons: 'multi', label: 'Class' },
  solo:         { pattern: /solo|private|personal|1on1|1-1/i, curriculum: false, persons: 1, label: 'Solo' },
  other:        { pattern: /talk|fit|chat|warm|cool/i,        curriculum: false, persons: 1, label: 'Other' }
};

// ── Telegram Bot ────────────────────────────────────────────────────────────

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const PAUL_CHAT_ID = process.env.PAUL_CHAT_ID ? parseInt(process.env.PAUL_CHAT_ID) : null;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// Pending classifications: messageId → { filePath, resolve }
const pendingClassifications = new Map();

// Polling state
let lastUpdateId = 0;

async function telegramSend(method, body) {
  if (!TELEGRAM_TOKEN || !PAUL_CHAT_ID) return null;
  try {
    const res = await fetch(`${TELEGRAM_API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return await res.json();
  } catch (e) {
    console.error(`[intake] Telegram ${method} failed: ${e.message}`);
    return null;
  }
}

async function promptCategory(filePath, durationSec) {
  const filename = path.basename(filePath);
  const mins = Math.round(durationSec / 60);

  const buttons = [
    [
      { text: 'Padwork', callback_data: `intake_cat:padwork:${filename}` },
      { text: 'Sparring', callback_data: `intake_cat:sparring:${filename}` },
      { text: 'Bag Work', callback_data: `intake_cat:bagwork:${filename}` }
    ],
    [
      { text: 'Class', callback_data: `intake_cat:class:${filename}` },
      { text: 'Solo', callback_data: `intake_cat:solo:${filename}` },
      { text: 'Technique', callback_data: `intake_cat:technique:${filename}` }
    ],
    [
      { text: 'Shadow Boxing', callback_data: `intake_cat:shadowboxing:${filename}` },
      { text: 'Other', callback_data: `intake_cat:other:${filename}` }
    ]
  ];

  const result = await telegramSend('sendMessage', {
    chat_id: PAUL_CHAT_ID,
    text: `📹 New ${mins}min session detected.\n\`${filename}\`\n\nSession type?`,
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons }
  });

  if (!result?.result?.message_id) return null;

  // Wait for Paul's tap (timeout 30 min)
  return new Promise((resolve) => {
    const msgId = result.result.message_id;
    const timeout = setTimeout(() => {
      pendingClassifications.delete(msgId);
      console.log(`[intake] Classification timeout for ${filename} — defaulting to padwork`);
      resolve('padwork');
    }, 30 * 60 * 1000);

    pendingClassifications.set(msgId, { filePath, resolve, timeout });
  });
}

function handleCallbackQuery(update) {
  const cb = update.callback_query;
  if (!cb?.data?.startsWith('intake_cat:')) return false;

  const parts = cb.data.split(':');
  if (parts.length < 3) return false;

  const category = parts[1];
  const filename = parts.slice(2).join(':'); // handle colons in filename
  const msgId = cb.message?.message_id;

  // Find pending classification
  for (const [pendingMsgId, pending] of pendingClassifications) {
    if (pendingMsgId === msgId || path.basename(pending.filePath) === filename) {
      clearTimeout(pending.timeout);
      pendingClassifications.delete(pendingMsgId);

      // Update message to confirm
      telegramSend('editMessageText', {
        chat_id: PAUL_CHAT_ID,
        message_id: msgId,
        text: `📹 \`${filename}\` → *${CATEGORIES[category]?.label || category}*\nProcessing...`,
        parse_mode: 'Markdown'
      });

      // Answer callback
      telegramSend('answerCallbackQuery', {
        callback_query_id: cb.id,
        text: `${CATEGORIES[category]?.label || category} selected`
      });

      pending.resolve(category);
      return true;
    }
  }

  // Might be for a different handler — answer but don't claim
  return false;
}

// Simple polling for callback queries (doesn't interfere with main bot)
async function pollCallbacks() {
  if (!TELEGRAM_TOKEN || pendingClassifications.size === 0) return;

  try {
    const res = await fetch(
      `${TELEGRAM_API}/getUpdates?offset=${lastUpdateId + 1}&timeout=1&allowed_updates=["callback_query"]`
    );
    const data = await res.json();

    if (data.ok && data.result) {
      for (const update of data.result) {
        lastUpdateId = update.update_id;
        handleCallbackQuery(update);
      }
    }
  } catch {
    // Polling error — non-fatal
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

function ensureDirs() {
  fs.mkdirSync(INBOX_DIR, { recursive: true });
  fs.mkdirSync(PROCESSED_MARKER_DIR, { recursive: true });
  for (const cat of Object.keys(CATEGORIES)) {
    fs.mkdirSync(path.join(CORPUS_DIR, cat), { recursive: true });
    fs.mkdirSync(path.join(CORPUS_DIR, 'movement', cat), { recursive: true });
    fs.mkdirSync(path.join(CORPUS_DIR, 'transcripts', cat), { recursive: true });
  }
}

function initDb() {
  const db = new Database(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS intake_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      standard_name TEXT,
      category TEXT NOT NULL,
      original_path TEXT,
      corpus_path TEXT,
      movement_json TEXT,
      file_size_mb REAL,
      duration_seconds REAL,
      punches_total INTEGER,
      guard_drops INTEGER,
      technique_score INTEGER,
      auto_classified INTEGER DEFAULT 0,
      processed_at TEXT DEFAULT (datetime('now')),
      status TEXT DEFAULT 'pending'
    )
  `);
  db.close();
}

// ── Naming Convention ───────────────────────────────────────────────────────

function generateStandardName(category, ext) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${date}_${time}_${category}${ext.toLowerCase()}`;
}

// ── Category Detection ────────────────────────────────────────────────────────

function detectCategory(filename) {
  const name = path.basename(filename, path.extname(filename));
  for (const [category, config] of Object.entries(CATEGORIES)) {
    if (config.pattern.test(name)) return { category, auto: true };
  }
  return { category: null, auto: false };
}

// ── Video Duration ──────────────────────────────────────────────────────────

async function getVideoDuration(videoPath) {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`,
      { timeout: 15000 }
    );
    return parseFloat(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

// ── YOLO Movement Analysis ─────────────────────────────────────────────────

async function runMovementAnalysis(videoPath, category) {
  const videoName = path.basename(videoPath, path.extname(videoPath));
  const jsonPath = path.join(CORPUS_DIR, 'movement', category, `${videoName}.json`);

  if (fs.existsSync(jsonPath)) {
    console.log(`[intake] Movement JSON exists: ${jsonPath}`);
    return jsonPath;
  }

  console.log(`[intake] Running YOLO pose estimation...`);
  const pythonCmd = fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python3';

  try {
    await execAsync(
      `cd "${path.join(HOME, 'Cathedral')}" && "${pythonCmd}" "${MOVEMENT_SCRIPT}" "${videoPath}" "${category}"`,
      { timeout: 600000, env: { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: '1' } }
    );
    console.log(`[intake] Movement JSON saved: ${jsonPath}`);
    return jsonPath;
  } catch (e) {
    console.error(`[intake] YOLO failed: ${e.message.slice(0, 200)}`);
    return null;
  }
}

// ── Whisper Transcription ───────────────────────────────────────────────────

async function runWhisper(videoPath, category) {
  const videoName = path.basename(videoPath, path.extname(videoPath));
  const transcriptPath = path.join(CORPUS_DIR, 'transcripts', category, videoName);

  if (fs.existsSync(transcriptPath + '.txt')) return transcriptPath + '.txt';

  const wavPath = `/tmp/intake-${Date.now()}.wav`;
  const model = path.join(HOME, 'Cathedral', 'models', 'ggml-medium.bin');

  try {
    await execAsync(`ffmpeg -i "${videoPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${wavPath}" -y`, { timeout: 120000 });
    await execAsync(`whisper-cli -m "${model}" -f "${wavPath}" --vad-thold 0.6 -otxt -of "${transcriptPath}"`, { timeout: 300000 });
    try { fs.unlinkSync(wavPath); } catch {}
    return transcriptPath + '.txt';
  } catch (e) {
    console.error(`[intake] Whisper failed: ${e.message.slice(0, 200)}`);
    try { fs.unlinkSync(wavPath); } catch {}
    return null;
  }
}

// ── Gym Eyes Enrichment ─────────────────────────────────────────────────────

function enrichWithGymEyes(movementJsonPath) {
  try {
    const movement = JSON.parse(fs.readFileSync(movementJsonPath, 'utf-8'));
    const punches = movement.punches_detected || [];
    const guardDrops = (movement.technique_flags || []).filter(f => f.flag === 'guard_drop');

    const punchSummary = {
      total: punches.length,
      jabs: punches.filter(p => p.type === 'jab').length,
      crosses: punches.filter(p => p.type === 'cross').length,
      hooks: punches.filter(p => /hook/i.test(p.type)).length,
      uppercuts: punches.filter(p => /uppercut/i.test(p.type)).length,
      rate_per_min: movement.duration_seconds > 0
        ? Math.round(punches.length / (movement.duration_seconds / 60) * 10) / 10 : 0
    };

    const landmarks = movement.body_landmarks || [];
    const guards = landmarks.map(l => l.guard_height).filter(g => g !== undefined);
    const avgGuard = guards.length > 0 ? guards.reduce((s, g) => s + g, 0) / guards.length : 0;
    const avgVelocity = punches.length > 0
      ? Math.round(punches.reduce((s, p) => s + (p.velocity || 0), 0) / punches.length) : 0;

    const guardScore = Math.min(1, avgGuard / 0.75);
    const guardDropPenalty = Math.min(0.3, guardDrops.length * 0.05);
    const velocityScore = Math.min(1, avgVelocity / 180);
    const techniqueScore = Math.round((guardScore * 0.35 + velocityScore * 0.3 + (1 - guardDropPenalty) * 0.35) * 100);

    return {
      punches: punchSummary,
      guard_drops: guardDrops.length,
      guard_drops_high: guardDrops.filter(g => g.severity === 'high').length,
      avg_guard_height: Math.round(avgGuard * 100) / 100,
      avg_velocity: avgVelocity,
      technique_score: techniqueScore,
      duration_seconds: movement.duration_seconds || 0
    };
  } catch (e) {
    console.error(`[intake] Enrichment failed: ${e.message}`);
    return null;
  }
}

// ── Telegram Alerts ─────────────────────────────────────────────────────────

async function sendProcessedAlert(standardName, category, enrichment, durationSec, attendees = []) {
  const mins = Math.round(durationSec / 60);
  let msg = `📹 *Session Processed*\n`;
  msg += `\`${standardName}\`\n`;
  msg += `Category: *${CATEGORIES[category]?.label || category}*`;
  if (CATEGORIES[category]?.curriculum) msg += ` (curriculum ✓)`;
  msg += ` | ${mins} min\n\n`;

  if (enrichment) {
    const scoreEmoji = enrichment.technique_score >= 80 ? '🟢' : enrichment.technique_score >= 60 ? '🟡' : '🔴';
    msg += `${scoreEmoji} *Technique Score: ${enrichment.technique_score}/100*\n\n`;
    msg += `*Punches:* ${enrichment.punches.total} (${enrichment.punches.rate_per_min}/min)\n`;
    msg += `  Jabs: ${enrichment.punches.jabs} | Crosses: ${enrichment.punches.crosses}\n`;
    msg += `  Hooks: ${enrichment.punches.hooks} | Uppercuts: ${enrichment.punches.uppercuts}\n\n`;
    msg += `*Guard:* ${enrichment.guard_drops} drops (${enrichment.guard_drops_high} high severity)\n`;
    msg += `*Avg Velocity:* ${enrichment.avg_velocity}\n`;
  } else {
    msg += `Analysis incomplete — check logs`;
  }

  // Attendance info (passed via closure from processVideo)
  if (attendees && attendees.length > 0) {
    msg += `\n*Attendance:* ${attendees.map(a => a.name).join(', ')}\n`;
  }

  await telegramSend('sendMessage', {
    chat_id: PAUL_CHAT_ID,
    text: msg,
    parse_mode: 'Markdown'
  });
}

// ── Process Single Video ────────────────────────────────────────────────────

let processing = false;
const queue = [];

async function processVideo(videoPath) {
  const filename = path.basename(videoPath);
  const ext = path.extname(filename).toLowerCase();

  if (!VIDEO_EXTENSIONS.has(ext)) return;

  // Check processed marker
  const markerPath = path.join(PROCESSED_MARKER_DIR, `${filename}.done`);
  if (fs.existsSync(markerPath)) {
    console.log(`[intake] Already processed: ${filename}`);
    return;
  }

  console.log(`\n[intake] ═══════════════════════════════════════`);
  console.log(`[intake] New video: ${filename}`);

  const fileSizeMb = Math.round(fs.statSync(videoPath).size / 1024 / 1024 * 10) / 10;
  const duration = await getVideoDuration(videoPath);
  const mins = Math.round(duration / 60);

  console.log(`[intake] Size: ${fileSizeMb}MB | Duration: ${mins} min`);

  // ── Classify ──────────────────────────────────────────────────────────
  let { category, auto } = detectCategory(filename);

  if (!category) {
    console.log(`[intake] Can't auto-classify — prompting Telegram`);
    category = await promptCategory(videoPath, duration);
    if (!category) category = 'padwork'; // fallback
  } else {
    console.log(`[intake] Auto-classified: ${category}`);
  }

  // ── Standard name ─────────────────────────────────────────────────────
  const standardName = generateStandardName(category, ext);
  const destPath = path.join(CORPUS_DIR, category, standardName);

  console.log(`[intake] ${filename} → ${category}/${standardName}`);

  // ── Log to DB ─────────────────────────────────────────────────────────
  const db = new Database(DB_PATH);
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO intake_log (filename, standard_name, category, original_path, corpus_path, file_size_mb, duration_seconds, auto_classified, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'processing')
  `).run(filename, standardName, category, videoPath, destPath, fileSizeMb, duration, auto ? 1 : 0);
  db.close();

  try {
    // 1. Copy to corpus with standard name
    if (!fs.existsSync(destPath)) {
      fs.copyFileSync(videoPath, destPath);
      console.log(`[intake] Filed: ${destPath}`);
    }

    // 2. Whisper transcription (background, non-blocking)
    runWhisper(destPath, category).catch(e =>
      console.error(`[intake] Whisper background error: ${e.message.slice(0, 100)}`)
    );

    // 3. YOLO movement analysis
    const movementJson = await runMovementAnalysis(destPath, category);

    // 4. Gym Eyes enrichment
    let enrichment = null;
    if (movementJson && fs.existsSync(movementJson)) {
      enrichment = enrichWithGymEyes(movementJson);
    }

    // 4b. Attendance scan (face recognition)
    let attendanceResult = null;
    try {
      attendanceResult = await scanVideoAttendance(destPath, category, Math.round(duration / 60));
      if (attendanceResult.attendees?.length > 0) {
        console.log(`[intake] Attendance: ${attendanceResult.attendees.map(a => a.name).join(', ')}`);
      }
    } catch (e) {
      console.error(`[intake] Attendance scan error: ${e.message.slice(0, 100)}`);
    }

    // 5. Update DB
    const dbUp = new Database(DB_PATH);
    dbUp.prepare(`
      UPDATE intake_log SET
        movement_json = ?, punches_total = ?, guard_drops = ?,
        technique_score = ?, status = 'complete'
      WHERE id = ?
    `).run(
      movementJson,
      enrichment?.punches?.total || 0,
      enrichment?.guard_drops || 0,
      enrichment?.technique_score || 0,
      lastInsertRowid
    );
    dbUp.close();

    // 6. Mark processed, remove from inbox
    fs.writeFileSync(markerPath, new Date().toISOString());
    try { fs.unlinkSync(videoPath); } catch {}

    // 7. Telegram summary
    await sendProcessedAlert(standardName, category, enrichment, duration, attendanceResult?.attendees || []);

    console.log(`[intake] ✓ Complete: ${standardName}`);

  } catch (e) {
    console.error(`[intake] ✗ Failed: ${filename} — ${e.message}`);
    const dbErr = new Database(DB_PATH);
    dbErr.prepare(`UPDATE intake_log SET status = 'error' WHERE id = ?`).run(lastInsertRowid);
    dbErr.close();
  }
}

// ── Queue Processor ─────────────────────────────────────────────────────────

async function processQueue() {
  if (processing || queue.length === 0) return;
  processing = true;
  while (queue.length > 0) {
    const videoPath = queue.shift();
    await processVideo(videoPath);
  }
  processing = false;
}

// ── Exports for Telegram Bot Integration ────────────────────────────────────

export function getIntakeStats() {
  try {
    const db = new Database(DB_PATH);
    const total = db.prepare('SELECT COUNT(*) as count FROM intake_log WHERE status = "complete"').get();
    const recent = db.prepare(
      'SELECT standard_name, category, punches_total, technique_score, duration_seconds, auto_classified, processed_at FROM intake_log WHERE status = "complete" ORDER BY id DESC LIMIT 5'
    ).all();
    const byCategory = db.prepare(
      'SELECT category, COUNT(*) as count, AVG(technique_score) as avg_score, SUM(duration_seconds) as total_seconds FROM intake_log WHERE status = "complete" GROUP BY category'
    ).all();
    db.close();
    return { total: total.count, recent, byCategory };
  } catch {
    return { total: 0, recent: [], byCategory: [] };
  }
}

export function formatIntakeStatusTelegram() {
  const stats = getIntakeStats();
  let msg = '📹 *Intake Pipeline*\n\n';

  if (stats.total === 0) {
    msg += 'No sessions processed yet.\n';
    msg += 'Drop videos into `~/boxing-corpus/inbox/`\n';
  } else {
    msg += `*Total:* ${stats.total} sessions\n\n`;

    if (stats.byCategory.length > 0) {
      msg += '*By Category:*\n';
      for (const cat of stats.byCategory) {
        const hrs = Math.round(cat.total_seconds / 3600 * 10) / 10;
        const cur = CATEGORIES[cat.category]?.curriculum ? ' ✓' : '';
        msg += `  ${cat.category}${cur}: ${cat.count} (avg ${Math.round(cat.avg_score)}, ${hrs}h)\n`;
      }
      msg += '\n';
    }

    if (stats.recent.length > 0) {
      msg += '*Recent:*\n';
      for (const r of stats.recent) {
        const mins = Math.round((r.duration_seconds || 0) / 60);
        const autoTag = r.auto_classified ? 'auto' : 'manual';
        msg += `  ${r.standard_name} — ${r.punches_total}p, score ${r.technique_score}, ${mins}m [${autoTag}]\n`;
      }
    }
  }

  msg += '\n*Naming:* include keyword in filename for auto-classify\n';
  msg += '  pad/mitt | spar | bag | class | solo | shadow | tech';
  return msg;
}

// Handle intake callback queries from main bot
export function handleIntakeCallback(update) {
  return handleCallbackQuery(update);
}

// ── File Watcher ────────────────────────────────────────────────────────────

function startWatcher() {
  ensureDirs();
  initDb();

  console.log(`[intake] ═══════════════════════════════════════`);
  console.log(`[intake] Boxing Camera Intake Pipeline`);
  console.log(`[intake] Watching: ${INBOX_DIR}`);
  console.log(`[intake] Output: ~/boxing-corpus/{category}/YYYYMMDD_HHMM_{category}.ext`);
  console.log(`[intake] Categories: ${Object.keys(CATEGORIES).join(', ')}`);
  console.log(`[intake] Curriculum categories: ${Object.entries(CATEGORIES).filter(([,v]) => v.curriculum).map(([k]) => k).join(', ')}`);
  console.log(`[intake] ═══════════════════════════════════════\n`);

  // Process existing files in inbox
  try {
    const existing = fs.readdirSync(INBOX_DIR).filter(f => {
      const ext = path.extname(f).toLowerCase();
      return VIDEO_EXTENSIONS.has(ext) && !f.startsWith('.');
    });
    if (existing.length > 0) {
      console.log(`[intake] Found ${existing.length} file(s) in inbox`);
      for (const f of existing) queue.push(path.join(INBOX_DIR, f));
      processQueue();
    }
  } catch {}

  // Watch for new files
  const watcher = chokidar.watch(INBOX_DIR, {
    ignoreInitial: true,
    usePolling: true,
    interval: 3000,
    awaitWriteFinish: {
      stabilityThreshold: 5000,
      pollInterval: 1000
    },
    ignored: [/(^|[\/\\])\../, /\.processed/]
  });

  watcher.on('add', (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (!VIDEO_EXTENSIONS.has(ext)) return;
    console.log(`[intake] Detected: ${path.basename(filePath)}`);
    queue.push(filePath);
    processQueue();
  });

  watcher.on('error', (err) => console.error(`[intake] Watcher error: ${err.message}`));

  // Poll for Telegram callback responses (only when waiting for classification)
  setInterval(pollCallbacks, 2000);

  console.log(`[intake] Watcher active.\n`);
}

// Start watcher unless INTAKE_IMPORT_ONLY env var is set
// telegram-bot.js sets this before importing to prevent double-watcher
if (!process.env.INTAKE_IMPORT_ONLY) {
  startWatcher();
}

export { startWatcher };
