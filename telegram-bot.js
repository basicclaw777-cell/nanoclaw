import dotenv from "dotenv";
dotenv.config();
import fs from 'fs';
import path from 'path';
import { spawn, execFileSync, execSync } from 'child_process';
import lancedb from '@lancedb/lancedb';
import { semanticSearch, startFileWatcher } from './vault-embedder.js';
import { triageClaim, formatTriageResult } from './epistemic-triage.js';
// council-engine.js retired — Genius Council (council.py) handles all /council commands
import { runObliteratus, formatObliteratusHeader } from './obliteratus-engine.js';
import { getOrRunGold, runGoldExtraction, startGoldCron } from './gold-extractor.js';
import { runMetabolism, getMetabolismSummary, startMetabolismCron } from './vault-metabolism.js';
import { recordStatement, getTrajectory, getDriftAlerts, runBeliefScan, formatTrajectory, formatDriftAlerts } from './belief-tracker.js';
import { runNegativeSpaceScan } from './negative-space.js';
import { buildAtlas, getOrBuildAtlas } from './convergence-atlas.js';
import { smartQuery, smartQueryJSON } from './deepseek-query.js';
import { runOracle, getOracleOutputs, formatOracleResult } from './oracle.js';
import { addToConversation, getConversationHistory, updateMemoryAfterConversation } from './memory-system.js';
import { registerBoxingCommands } from './boxing-commands.js';
import { scanForPromotions, generateReport, executePromotions } from './vault-promoter.js';
import { getScheduleReport, formatScheduleReport } from './gcal-reader.js';
import { startComboWatcher } from './combo-watcher.js';
import { runTarget, runAll, getDashboardData, formatTelegramSummary } from './scraper/scraper-engine.js';
import { debate } from './trader/bull-bear-debate.js';
import tasteMap from './taste-elicitation.js';
import { getTasteProfile, getVoiceReferences, getVoicePattern, addAnchor, checkRejection } from './taste-map-api.js';
import tasteCurator from './taste-curator.js';
import { generatePlan, generateHTML, generateMermaid, depositToVault, formatPlanTelegram, listPlans } from './architect.js';
import djCurator from './dj-curator.js';
import soundStudio from './sound-studio/engine.js';
import gymEyes from './gym-eyes.js';
import gymEyesV2 from './gym-eyes-v2.js';
import gymDigest from './gym-digest.js';
import gymChallenge from './gym-challenge.js';
process.env.INTAKE_IMPORT_ONLY = '1';
import { formatIntakeStatusTelegram, handleIntakeCallback } from './intake-watcher.js';
import faceRegistry from './face-registry.js';
import curriculum from './curriculum-tracker.js';
import drillGen from './drill-generator.js';
import attendance from './attendance-logger.js';
import conductor from './content-conductor.js';
import studentIntel from './student-intelligence.js';
import communityRadar from './community-radar.js';
import { registerOpsCommands } from './ops-agent/ops-commands.js';
import { registerCommsCommands } from './comms-engine/comms-commands.js';
import { registerGrowthCommands } from './growth-agent/growth-commands.js';
import { registerMerchCommands } from './merch-agent/merch-commands.js';
import { registerCourseCommands } from './course-engine/course-commands.js';
import { registerPulseCommands } from './architect-pulse/pulse-commands.js';
import { registerEnsembleCommands } from './ensemble-gate.js';
import { registerGraphCommands } from './knowledge-graph.js';
import { registerCausalCommands } from './causal-net.js';
import { registerActiveCommands } from './active-learning.js';
import { registerArchaeologistCommands } from './archaeologist-commands.js';

// ── Single-instance lock ──────────────────────────────────────────────────────

const PID_FILE = path.join(process.env.HOME, 'nanoclaw', '.bot.pid');

(function acquireLock() {
  if (fs.existsSync(PID_FILE)) {
    const oldPid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (oldPid && !isNaN(oldPid) && oldPid !== process.pid) {
      try {
        process.kill(oldPid, 'SIGTERM');
        console.log(`[lock] Killed existing instance (PID ${oldPid})`);
      } catch {
        // Already dead — stale PID file, ignore
      }
    }
  }
  fs.writeFileSync(PID_FILE, String(process.pid));
  const cleanup = () => { try { fs.unlinkSync(PID_FILE); } catch {} };
  process.on('exit', cleanup);
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });
  process.on('SIGINT',  () => { cleanup(); process.exit(0); });
})();

// ─────────────────────────────────────────────────────────────────────────────

const VECTOR_DB_DIR = path.join(process.env.HOME, 'nanoclaw', 'cathedral-vectors');
const OLLAMA_URL = 'http://localhost:11434';
import TelegramBot from 'node-telegram-bot-api';

const token = process.env.TELEGRAM_TOKEN;
const PAUL_CHAT_ID = process.env.PAUL_CHAT_ID ? parseInt(process.env.PAUL_CHAT_ID) : null;

function isPaul(chatId) {
  if (!PAUL_CHAT_ID) return true; // no restriction if not configured
  return chatId === PAUL_CHAT_ID;
}

async function searchVectorStore(topic) {
  try {
    const db = await lancedb.connect(VECTOR_DB_DIR);
    const tableNames = await db.tableNames();
    if (!tableNames.includes('nuggets')) return [];

    const embedRes = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'nomic-embed-text', prompt: topic })
    });
    const embedData = await embedRes.json();
    if (!embedData.embedding) return [];

    const table = await db.openTable('nuggets');
    const results = await table.vectorSearch(embedData.embedding).limit(5).toArray();
    return results.map(r => r.text);
  } catch (e) {
    console.error('Vector search error:', e.message);
    return [];
  }
}

function formatVectorContext(vectorResults) {
  return vectorResults.join('\n\n');
}

async function callCloud(systemPrompt, description) {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen3:14b',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: description }
        ],
        stream: false
      })
    });
    const data = await response.json();
    return { response: data.message?.content || 'No response from model.' };
  } catch (e) {
    console.error('Ollama error:', e.message);
    return { response: `⚠️ Model unavailable: ${e.message}` };
  }
}

const VAULT_ROOT = path.join(process.env.HOME, 'cathedral-vault');
const SOCIAL_CONTENT_PATH = path.join(VAULT_ROOT, '07_Social_Content');

// ── Vault write helpers ─────────────────────────────────────────────────────
function deduplicatePath(filePath) {
  if (!fs.existsSync(filePath)) return filePath;
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  let version = 2;
  let candidate;
  do {
    candidate = path.join(dir, `${base}-v${version}${ext}`);
    version++;
  } while (fs.existsSync(candidate));
  return candidate;
}

function writeToVault(chatId, vaultPath, content) {
  try {
    // Resolve path relative to vault root
    let fullPath;
    if (vaultPath.endsWith('.md')) {
      fullPath = path.join(VAULT_ROOT, vaultPath);
    } else {
      // Treat as directory, generate filename
      const today = new Date().toISOString().split('T')[0];
      const slug = content.slice(0, 30).replace(/[^a-zA-Z0-9]+/g, '-').replace(/-+$/, '').toLowerCase();
      fullPath = path.join(VAULT_ROOT, vaultPath, `${today}_${slug}.md`);
    }
    // Ensure parent dir exists
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Deduplicate
    fullPath = deduplicatePath(fullPath);
    fs.writeFileSync(fullPath, content);
    const rel = path.relative(VAULT_ROOT, fullPath);
    safeSend(chatId, `📥 Written to vault:\n\`${rel}\``);
  } catch (err) {
    safeSend(chatId, `⚠️ Vault write error: ${err.message}`);
  }
}

// Ensure the directory exists
if (!fs.existsSync(SOCIAL_CONTENT_PATH)) {
  fs.mkdirSync(SOCIAL_CONTENT_PATH, { recursive: true });
}

const bot = new TelegramBot(token, { polling: false });

// ── Boxing commands (Basic Reflex) ──────────────────────────────────────────
registerBoxingCommands(bot);

// ── Operations Agent commands ────────────────────────────────────────────────
registerOpsCommands(bot);
registerCommsCommands(bot);
registerGrowthCommands(bot);
registerMerchCommands(bot);
registerCourseCommands(bot);
registerPulseCommands(bot);
registerEnsembleCommands(bot);
registerGraphCommands(bot);
registerCausalCommands(bot);
registerActiveCommands(bot);
registerArchaeologistCommands(bot);

// ── Telegram health state (written to cath-state.json) ──────────────────────
const telegramHealth = {
  lastUpdateAt: null,        // ISO timestamp of last successfully received update
  lastPollOkAt: null,        // ISO timestamp of last successful poll cycle
  pollErrorCount: 0,         // consecutive errors (resets on success)
  totalErrors: 0,            // lifetime error count this process
  status: 'starting',        // 'green' | 'red' | 'starting'
};

function updateTelegramHealth(key, value) {
  telegramHealth[key] = value;
  // Derive status: green if last update within 5 minutes
  const lastOk = telegramHealth.lastUpdateAt || telegramHealth.lastPollOkAt;
  if (lastOk && (Date.now() - new Date(lastOk).getTime()) < 5 * 60 * 1000) {
    telegramHealth.status = 'green';
  } else {
    telegramHealth.status = telegramHealth.lastUpdateAt ? 'red' : 'starting';
  }
  writeTelegramHealthToState();
}

function writeTelegramHealthToState() {
  try {
    const statePath = path.join(process.env.HOME, 'Cathedral', 'cath-state.json');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    state.telegram_health = { ...telegramHealth };
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  } catch { /* non-fatal */ }
}

// Export bot instance + health for cath-bridge webhook route
export { bot, telegramHealth };

// ── Telegram 4096-char limit: safe send with auto-split ─────────────────────
const TG_MAX = 4000; // leave margin below 4096

async function safeSend(chatId, text, opts = {}) {
  if (!text) return;
  text = String(text);
  // Lymphatic: log bloat + compress filler
  try {
    const { logBloat, compress } = await import('./lymphatic.mjs');
    const caller = new Error().stack?.split('\n')[2]?.match(/at (\w+)/)?.[1] || 'unknown';
    logBloat(text, caller);
    text = compress(text);
  } catch {} // silent — lymphatic is non-critical

  // Short message — send directly
  if (text.length <= TG_MAX) {
    return bot.sendMessage(chatId, text, opts).catch(err => {
      // Markdown parse failures: retry without parse_mode
      if (opts.parse_mode && /can't parse|Bad Request/i.test(err.message)) {
        return bot.sendMessage(chatId, text, { ...opts, parse_mode: undefined });
      }
      throw err;
    });
  }

  // Long message — split on paragraph/newline boundaries
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= TG_MAX) {
      chunks.push(remaining);
      break;
    }
    // Find a good split point: paragraph break, then newline, then hard cut
    let cut = remaining.lastIndexOf('\n\n', TG_MAX);
    if (cut < TG_MAX * 0.3) cut = remaining.lastIndexOf('\n', TG_MAX);
    if (cut < TG_MAX * 0.3) cut = TG_MAX;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).replace(/^\n+/, '');
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    await bot.sendMessage(chatId, chunk, opts).catch(err => {
      if (opts.parse_mode && /can't parse|Bad Request/i.test(err.message)) {
        return bot.sendMessage(chatId, chunk, { ...opts, parse_mode: undefined });
      }
      throw err;
    });
    if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 500));
  }
}

// ── Safe photo send ──────────────────────────────────────────────────────────

async function safeSendPhoto(chatId, imagePath, caption = '') {
  try {
    if (!fs.existsSync(imagePath)) {
      console.error(`[sendPhoto] File not found: ${imagePath}`);
      // Fallback to text
      if (caption) await safeSend(chatId, `[Image unavailable] ${caption}`);
      return null;
    }

    const result = await bot.sendPhoto(chatId, imagePath, {
      caption: caption || undefined,
      parse_mode: 'Markdown'
    }).catch(async (err) => {
      // Retry without parse_mode if markdown fails
      if (/can't parse|Bad Request/i.test(err.message)) {
        return bot.sendPhoto(chatId, imagePath, { caption: caption || undefined });
      }
      throw err;
    });

    console.log(`[sendPhoto] Photo sent to ${chatId}: ${path.basename(imagePath)}`);
    return result;
  } catch (err) {
    console.error(`[sendPhoto] Failed: ${err.message}`);
    // Fallback to text message
    if (caption) {
      await safeSend(chatId, `[Photo send failed] ${caption}`);
    }
    return null;
  }
}

// ── Polling error handler: quiet logging, count errors, log recovery ────────
let _lastPollingErrorLogged = 0;

bot.on('polling_error', (err) => {
  telegramHealth.pollErrorCount++;
  telegramHealth.totalErrors++;
  // Log every 10th error, or the first one after recovery
  if (telegramHealth.pollErrorCount === 1 || telegramHealth.pollErrorCount % 10 === 0) {
    console.error(`Polling error #${telegramHealth.totalErrors} (consecutive: ${telegramHealth.pollErrorCount}): ${err.code} ${err.message}`);
  }
  updateTelegramHealth('status', 'red');

  // Fast restart: if 2+ consecutive failures, force restart polling
  if (telegramHealth.pollErrorCount >= 2) {
    console.log('[telegram] Double failure detected — forcing immediate polling restart');
    try { bot.stopPolling(); } catch {}
    setTimeout(() => {
      bot.startPolling({ restart: true, params: { timeout: 3 } })
        .then(() => {
          console.log('[telegram] Polling restarted after double failure');
          telegramHealth.pollErrorCount = 0;
          updateTelegramHealth('lastPollOkAt', new Date().toISOString());
        })
        .catch(e => console.error('[telegram] Restart failed:', e.message));
    }, 1000);
  }
});

// Log when polling recovers after errors
bot.on('message', () => {
  if (telegramHealth.pollErrorCount > 0) {
    console.log(`[telegram] Connection recovered after ${telegramHealth.pollErrorCount} consecutive errors`);
  }
  telegramHealth.pollErrorCount = 0;
  updateTelegramHealth('lastUpdateAt', new Date().toISOString());
});

// ── Heartbeat: getMe every 60s, detect dead connections ─────────────────────
let _heartbeatInterval;
function startHeartbeat() {
  _heartbeatInterval = setInterval(async () => {
    try {
      await bot.getMe();
      updateTelegramHealth('lastPollOkAt', new Date().toISOString());
    } catch (err) {
      console.error(`[heartbeat] getMe failed: ${err.message}`);
      telegramHealth.pollErrorCount++;
      updateTelegramHealth('status', 'red');
      // Double failure on heartbeat — force restart
      if (telegramHealth.pollErrorCount >= 2) {
        console.log('[heartbeat] Double failure — restarting polling');
        try { bot.stopPolling(); } catch {}
        setTimeout(() => {
          bot.startPolling({ restart: true, params: { timeout: 3 } })
            .then(() => {
              console.log('[heartbeat] Polling restarted');
              telegramHealth.pollErrorCount = 0;
              updateTelegramHealth('lastPollOkAt', new Date().toISOString());
            })
            .catch(e => console.error('[heartbeat] Restart failed:', e.message));
        }, 1000);
      }
    }
  }, 60_000);
}

// ── Internal webhook listener (port 8443) — receives updates from cath-bridge
import http from 'http';

function startWebhookListener() {
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/webhook') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const update = JSON.parse(body);
          bot.processUpdate(update);
          updateTelegramHealth('lastUpdateAt', new Date().toISOString());

          // If we're still polling when webhooks arrive, stop polling
          if (telegramHealth.mode === 'polling' && bot.isPolling()) {
            console.log('[webhook] Received webhook update while polling — switching to webhook mode');
            bot.stopPolling();
            telegramHealth.mode = 'webhook';
            writeTelegramHealthToState();
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    } else if (req.method === 'POST' && req.url === '/switch-to-polling') {
      // Called when tunnel goes down — resume polling
      console.log('[webhook] Switching back to polling mode');
      bot.deleteWebHook().then(() => {
        return bot.startPolling({ restart: true, params: { timeout: 3 } });
      }).then(() => {
        telegramHealth.mode = 'polling';
        writeTelegramHealthToState();
        console.log('[webhook] Polling resumed');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, mode: 'polling' }));
      }).catch(err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log('[webhook] Port 8443 in use — killing stale listener and retrying');
      setTimeout(() => server.listen(8443, '127.0.0.1'), 2000);
    } else {
      console.error('[webhook] Server error:', err.message);
    }
  });
  server.listen(8443, '127.0.0.1', () => {
    console.log('[webhook] Internal listener on 127.0.0.1:8443');
  });
}

// ── Bot startup ─────────────────────────────────────────────────────────────
const WEBHOOK_MODE = process.env.TELEGRAM_WEBHOOK_URL;

async function startBot(retries = 5) {
  try {
    // Always start the internal webhook listener for cath-bridge forwarding
    startWebhookListener();

    // Check if tunnel script has set a webhook (tunnel writes URL to .tunnel-url)
    const tunnelUrlFile = path.join(process.env.HOME, 'nanoclaw', '.tunnel-url');
    const tunnelActive = fs.existsSync(tunnelUrlFile);

    if (WEBHOOK_MODE) {
      // Explicit webhook mode via env var
      await bot.setWebHook(WEBHOOK_MODE);
      telegramHealth.mode = 'webhook';
      console.log(`🤖 Bot webhook set: ${WEBHOOK_MODE}`);
    } else if (tunnelActive) {
      // Tunnel is running — don't delete webhook, don't poll
      // The tunnel script handles webhook registration
      // Bot receives updates via internal webhook listener (port 8443)
      telegramHealth.mode = 'webhook';
      const tunnelUrl = fs.readFileSync(tunnelUrlFile, 'utf8').trim();
      console.log(`🤖 Tunnel detected (${tunnelUrl}) — webhook mode, no polling.`);
    } else {
      // No tunnel, no webhook env — use polling
      await bot.deleteWebHook();
      await bot.startPolling({ restart: true, params: { timeout: 3 } });
      telegramHealth.mode = 'polling';
      console.log('🤖 Bot polling started (3s interval).');
    }
    updateTelegramHealth('lastPollOkAt', new Date().toISOString());
    startHeartbeat();
    startFileWatcher();
  } catch (err) {
    console.error(`❌ Startup error: ${err.message}`);
    if (retries > 0) {
      console.log(`⏳ Retrying in 5s... (${retries} attempt${retries !== 1 ? 's' : ''} left)`);
      setTimeout(() => startBot(retries - 1), 5000);
    } else {
      console.error('Failed to start bot after multiple attempts. Exiting.');
      process.exit(1);
    }
  }
}

startBot();
startGoldCron();

// Start vault metabolism cron (weekly) — sends health report to all active chats on run
startMetabolismCron((report) => {
  console.log('[metabolism] Weekly scan complete.');
  // Report is logged; no auto-send (Paul uses /metabolism to pull it explicitly)
});

// Track post generation state
const postGenerationState = {};

// Generate captions
async function generatePostCaptions(topic) {
  const vectorResults = await searchVectorStore(topic);
  const vectorContext = formatVectorContext(vectorResults);

  const systemPrompt = `You are Paul from Basic Reflex, a boxing gym owner and philosopher in Hong Kong. 
Generate 3 Instagram captions about ${topic} using these contextual nuggets:
${vectorContext}

Your captions must:
- Reflect Paul's philosophical, direct voice
- Include IntegrityOS, Saper Vedere, vortex flow, or Wu Wang concepts
- End with 3-5 hashtags including #BasicReflex and #BoxingHK
- Vary in length and depth: short/punchy, educational, philosophical`;

  const result = await callCloud(systemPrompt, `Generate 3 Instagram captions about ${topic}`);
  
  // Parse the response into captions
  const captions = result.response.split(/\n\n/).filter(c => c.trim().length > 10).slice(0, 3);
  
  return captions;
}

// Generate visual direction
async function generateVisualDirection(topic) {
  const systemPrompt = `You are Paul's creative director. 
Generate visual direction for an Instagram post about ${topic}:
- Describe the best photo/clip type
- Suggest mood, lighting, and framing
- Create a detailed AI image generation prompt`;

  const result = await callCloud(systemPrompt, `Create visual direction for ${topic}`);
  return result.response;
}

// /help — The commands Paul actually needs
bot.onText(/^\/help(?:@\w+)?$/, async (msg) => {
  const chatId = msg.chat.id;
  const text = `◉ CATHEDRAL COMMANDS

DAILY USE
/sky — what's in the sky right now
/signal — today's convergence signal
/glass — 90-day forward scan
/geomag — geomagnetic storm prediction (4 strategies)
/spaceweather — raw space weather data
/backtest [year] — strategy backtest leaderboard
/physician — Cathedral health check
/think [msg] — Cathy routes to best tool

RATE & CALIBRATE
/rate [agent] [1-5] [notes] — grade any agent
/answer [1-5] [response] — Physician interview
/bloat — output quality report

RESEARCH
/search [query] — vault semantic search
/council [topic] — Genius Council debate
/predict [seed] — pattern completion
/cosmos [track#] — cosmology research

CREATIVE
/reed [caption on photo] — visual generation
/pipelines [body] — 5-pipeline comparison
/ling [question] — ask Ling (HK AI advisor)
/ling draft [pillar] [topic] — generate content draft

SYSTEM
/projects — project status board
/rhythm — schedule status
/physician — full sense diagnosis

Just talk to Cathy normally — no command needed.`;
  await safeSend(chatId, text);
});

// /search command — semantic vault search via SQLite embeddings
bot.onText(/\/search (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1].trim();

  try {
    await safeSend(chatId, `🔍 Searching vault: "${query}"...`);
    const results = await semanticSearch(query, 5);

    if (results.length === 0) {
      await safeSend(chatId, '📭 No results. Run vault-embedder.js to index the vault first.');
      return;
    }

    let message = `🔍 *Vault: "${query}"*\n\n`;
    results.forEach((r, i) => {
      const pct = (r.score * 100).toFixed(0);
      const domain = r.domain ? ` \\[${r.domain}\\]` : '';
      message += `*${i + 1}\\. ${r.title.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&')}*${domain} — ${pct}%\n`;
      if (r.first_line) {
        const snippet = r.first_line.slice(0, 100).replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
        message += `_${snippet}_\n`;
      }
      message += '\n';
    });

    await safeSend(chatId, message, { parse_mode: 'MarkdownV2' });
  } catch (err) {
    console.error('Search error:', err);
    await safeSend(chatId, `⚠️ Search error: ${err.message}`);
  }
});

// Post command handler
bot.onText(/\/post (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const topic = match[1];

  try {
    // Generate captions and visual direction
    const captions = await generatePostCaptions(topic);
    const visualDirection = await generateVisualDirection(topic);

    // Store state for this chat
    postGenerationState[chatId] = {
      topic,
      captions,
      visualDirection
    };

    // Construct message with captions
    let message = `📝 Post Captions for "${topic}":\n\n`;
    captions.forEach((caption, index) => {
      message += `${index + 1}. ${caption}\n\n`;
    });

    message += `\n--- VISUAL DIRECTION ---\n${visualDirection}`;

    safeSend(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        keyboard: [['1', '2', '3']],
        one_time_keyboard: true,
        resize_keyboard: true
      }
    });

  } catch (error) {
    console.error('Post generation error:', error);
    safeSend(chatId, `⚠️ Post generation failed: ${error.message}`);
  }
});

// /triage [claim] — epistemic scoring on 5 dimensions
bot.onText(/\/triage (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const claim  = match[1].trim();

  try {
    await safeSend(chatId, `⚖️ Triaging claim via hermes3...\n\n_"${claim.slice(0, 100)}${claim.length > 100 ? '...' : ''}"_`, { parse_mode: 'Markdown' });

    // Pull vault context for the claim
    let vaultNuggets = [];
    try {
      vaultNuggets = await semanticSearch(claim, 5);
    } catch { /* proceed without vault context */ }

    const result = await triageClaim(claim, vaultNuggets);
    const formatted = formatTriageResult(result);

    const header = `*EPISTEMIC TRIAGE*\n_Claim: "${claim.slice(0, 120)}${claim.length > 120 ? '...' : ''}"_\n\n`;
    await safeSend(chatId, header + formatted, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Triage error:', err);
    await safeSend(chatId, `⚠️ Triage failed: ${err.message}`);
  }
});

// /council — Genius Council (unified: replaces old interlocutors + /genius)
// /council characters — list available characters
bot.onText(/^\/council(?:@\w+)?\s+characters\s*$/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const output = await new Promise((resolve, reject) => {
      const proc = spawn(
        'python3',
        [path.join(process.env.HOME, 'Cathedral', 'genius-council', 'council.py'), '--characters'],
        { env: process.env }
      );
      let stdout = '';
      proc.stdout.on('data', d => { stdout += d.toString(); });
      proc.on('close', code => resolve(stdout.trim() || 'No characters found.'));
      proc.on('error', reject);
    });
    await safeSend(chatId, output);
  } catch (err) {
    await safeSend(chatId, `Failed: ${err.message}`);
  }
});

// /council last — show last session summary
bot.onText(/^\/council(?:@\w+)?\s+last\s*$/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const output = await new Promise((resolve, reject) => {
      const proc = spawn(
        'python3',
        [path.join(process.env.HOME, 'Cathedral', 'genius-council', 'council.py'), '--last'],
        { env: process.env }
      );
      let stdout = '';
      proc.stdout.on('data', d => { stdout += d.toString(); });
      proc.on('close', code => resolve(stdout.trim() || 'No sessions yet.'));
      proc.on('error', reject);
    });
    await safeSend(chatId, output);
  } catch (err) {
    await safeSend(chatId, `Failed: ${err.message}`);
  }
});

// /council [question] — convene the Genius Council
bot.onText(/^\/council(?:@\w+)?\s+(?!characters\s*$|last\s*$)(.+)$/s, async (msg, match) => {
  const chatId = msg.chat.id;
  const question = match[1].trim();

  try {
    await safeSend(chatId, `Convening Genius Council...\n\n"${question.slice(0, 100)}"\n\nSelecting characters and querying — this takes 3-8 minutes.`);

    const output = await new Promise((resolve, reject) => {
      const proc = spawn(
        'python3',
        [path.join(process.env.HOME, 'Cathedral', 'genius-council', 'council.py'), question],
        { env: process.env }
      );
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', d => { stdout += d.toString(); });
      proc.stderr.on('data', d => { stderr += d.toString(); });
      proc.on('close', code => {
        if (code !== 0) reject(new Error(stderr.trim().split('\n').pop() || `exit code ${code}`));
        else resolve(stdout.trim());
      });
      proc.on('error', reject);
      setTimeout(() => { try { proc.kill(); } catch {} reject(new Error('Timeout (10 min)')); }, 600000);
    });

    await safeSend(chatId, output);
  } catch (err) {
    console.error('Genius Council error:', err);
    await safeSend(chatId, `Genius Council failed: ${err.message}`);
  }
});

// /obliteratus [question] — full 6-stage research pipeline
bot.onText(/\/obliteratus (.+)/, async (msg, match) => {
  const chatId   = msg.chat.id;
  const question = match[1].trim();

  let stageMsg = null;

  try {
    stageMsg = await safeSend(
      chatId,
      `🔬 *Obliteratus Engine — Initiating*\n\n_"${question.slice(0, 100)}${question.length > 100 ? '...' : ''}"_\n\nPipeline: DECOMPOSE → RETRIEVE → REASON → TRIAGE → SYNTHESIZE → ARCHIVE\n\nThis takes 5–15 minutes. Stage updates will follow.`,
      { parse_mode: 'Markdown' }
    );

    let lastStage = '';

    const result = await runObliteratus(question, {
      onProgress: async ({ stage, message }) => {
        // Only send a message when the stage changes
        if (stage !== lastStage) {
          lastStage = stage;
          const stageEmoji = {
            DECOMPOSE:  '🧩',
            RETRIEVE:   '📚',
            REASON:     '🧠',
            TRIAGE:     '⚖️',
            SYNTHESIZE: '📝',
            ARCHIVE:    '📁',
          };
          await safeSend(
            chatId,
            `${stageEmoji[stage] || '•'} *${stage}* — ${message}`,
            { parse_mode: 'Markdown' }
          ).catch(() => {});
        }
      },
    });

    // Send header summary
    const header = formatObliteratusHeader(result);
    await safeSend(chatId, header, { parse_mode: 'Markdown' });

    // Send report text in chunks (Telegram 4096 char limit)
    const CHUNK = 3800;
    const report = result.report_text;
    if (report.length <= CHUNK) {
      await safeSend(chatId, report);
    } else {
      let offset = 0;
      let part   = 1;
      while (offset < report.length) {
        const chunk = report.slice(offset, offset + CHUNK);
        await safeSend(chatId, `*Report (part ${part})*\n\n${chunk}`, { parse_mode: 'Markdown' });
        offset += CHUNK;
        part++;
      }
    }

  } catch (err) {
    console.error('Obliteratus error:', err);
    await safeSend(chatId, `⚠️ Obliteratus failed at: ${err.message}`);
  }
});

// /gold — Gold Extraction briefing (cached or fresh run)
bot.onText(/^\/gold(?:@\w+)?$/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    await safeSend(
      chatId,
      `🥇 *Gold Extractor* — retrieving briefing...\n\n_Running 5 detection passes: ratios, geometry, suppression, cross-domain bridges, open threads._`,
      { parse_mode: 'Markdown' }
    );

    const briefing = await getOrRunGold();

    // Telegram 4096 char limit — split if needed
    const CHUNK = 3800;
    if (briefing.length <= CHUNK) {
      await safeSend(chatId, briefing, { parse_mode: 'Markdown' });
    } else {
      let offset = 0;
      let part   = 1;
      while (offset < briefing.length) {
        const chunk = briefing.slice(offset, offset + CHUNK);
        await safeSend(chatId, `*Gold Briefing (part ${part})*\n\n${chunk}`, { parse_mode: 'Markdown' });
        offset += CHUNK;
        part++;
      }
    }
  } catch (err) {
    console.error('Gold error:', err);
    await safeSend(chatId, `⚠️ Gold extraction failed: ${err.message}`);
  }
});

// /goldrun — force a fresh Gold extraction (ignores cache)
bot.onText(/\/goldrun/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    await safeSend(
      chatId,
      `🥇 *Gold Extractor — Fresh Run*\n\nForcing full extraction across vault. Ignoring cache...`,
      { parse_mode: 'Markdown' }
    );

    const briefing = await runGoldExtraction();

    const CHUNK = 3800;
    if (briefing.length <= CHUNK) {
      await safeSend(chatId, briefing, { parse_mode: 'Markdown' });
    } else {
      let offset = 0;
      let part   = 1;
      while (offset < briefing.length) {
        const chunk = briefing.slice(offset, offset + CHUNK);
        await safeSend(chatId, `*Gold Briefing (part ${part})*\n\n${chunk}`, { parse_mode: 'Markdown' });
        offset += CHUNK;
        part++;
      }
    }
  } catch (err) {
    console.error('Gold run error:', err);
    await safeSend(chatId, `⚠️ Gold extraction failed: ${err.message}`);
  }
});

// /metabolism — vault health scan (or summary if scan already ran recently)
bot.onText(/\/metabolism/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    await safeSend(chatId, '🫀 *Vault Metabolism* — scanning nugget health...\n\n_Detecting contradictions, corroborations, aging. This takes 1–3 minutes._', { parse_mode: 'Markdown' });

    const progressLines = [];
    const report = await runMetabolism((line) => {
      progressLines.push(line);
    });

    const CHUNK = 3800;
    if (report.length <= CHUNK) {
      await safeSend(chatId, report);
    } else {
      let offset = 0;
      let part = 1;
      while (offset < report.length) {
        const chunk = report.slice(offset, offset + CHUNK);
        const header = part === 1 ? '' : `Metabolism Report (part ${part})\n\n`;
        await safeSend(chatId, header + chunk);
        offset += CHUNK;
        part++;
      }
    }
  } catch (err) {
    console.error('Metabolism error:', err);
    await safeSend(chatId, `⚠️ Metabolism scan failed: ${err.message}`);
  }
});

// /trajectory [topic] — belief evolution on a topic
// /trajectory drift    — reads proprioception block from cath-state.json
bot.onText(/\/trajectory (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const arg    = match[1].trim();

  try {
    if (arg.toLowerCase() === 'drift') {
      const statePath = path.join(process.env.HOME, 'Cathedral', 'cath-state.json');
      const state     = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      const block     = state.proprioception;

      if (!block) {
        await safeSend(chatId, '⚠️ No proprioception data yet. Run /proprioception first.');
        return;
      }

      const lines = [
        `*Proprioception — Drift Report*`,
        ``,
        `Drift score: \`${block.drift_score}\` — *${block.drift_status.toUpperCase()}*`,
        `Restart ratio: \`${block.restart_ratio}\``,
        `Leading questions: \`${block.leading_question_count}\``,
        `Character-mediated claims: \`${block.character_mediated_claims}\``,
        `Last scan: ${block.last_scan}`,
      ];

      if (block.flags && block.flags.length > 0) {
        lines.push(``, `*Flags*`);
        block.flags.forEach(f => lines.push(`⚑ ${f}`));
      }

      if (block.mirror_voice) {
        lines.push(``, `*Mirror*`);
        block.mirror_voice.split(' | ').forEach(l => lines.push(l));
      }

      await safeSend(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
    } else {
      const data   = getTrajectory(arg);
      const report = formatTrajectory(data);
      await safeSend(chatId, report, { parse_mode: 'Markdown' });
    }
  } catch (err) {
    console.error('Trajectory error:', err);
    await safeSend(chatId, `⚠️ Trajectory error: ${err.message}`);
  }
});

// /negativespace — standalone negative space scan (also runs as part of /goldrun)
bot.onText(/\/negativespace/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    await safeSend(chatId, '🕳️ *Negative Space Detector* — scanning for forensic absences...\n\n_Timeline gaps, documentation asymmetry, counter-evidence absence. Takes 2–4 minutes._', { parse_mode: 'Markdown' });

    const { summary } = await runNegativeSpaceScan((line) => {
      console.log('[negativespace]', line);
    });

    const CHUNK = 3800;
    if (summary.length <= CHUNK) {
      await safeSend(chatId, summary, { parse_mode: 'Markdown' });
    } else {
      let offset = 0;
      let part = 1;
      while (offset < summary.length) {
        const chunk = summary.slice(offset, offset + CHUNK);
        await safeSend(chatId, `*Negative Space (part ${part})*\n\n${chunk}`, { parse_mode: 'Markdown' });
        offset += CHUNK;
        part++;
      }
    }
  } catch (err) {
    console.error('Negative space error:', err);
    await safeSend(chatId, `⚠️ Negative space scan failed: ${err.message}`);
  }
});

// /rhythm — Timekeeper schedule report
bot.onText(/^\/rhythm(?:@\w+)?$/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const { getRhythmReport } = await import(path.join(process.env.HOME, 'Cathedral', 'the-timekeeper.mjs'));
    const report = getRhythmReport();
    await safeSend(chatId, `\`\`\`\n${report.text}\n\`\`\``, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Rhythm report error:', err);
    await safeSend(chatId, `⚠️ Rhythm report failed: ${err.message}`);
  }
});

// /opus-drain — run pending spec-consistency audits through Opus (Max plan CLI).
// Queue is filled by agent-engine.js auto-escalation; Opus is the one model that
// reliably catches cross-section spec contradictions (vault: lucy-protocol-agent-
// recognition.md). Usage: /opus-drain | /opus-drain list | /opus-drain <N>
bot.onText(/^\/opus-drain(?:@\w+)?\s*(.*)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const arg = (match[1] || '').trim();
  try {
    const opusTasks = require(path.join(process.env.HOME, 'Cathedral', 'opus-tasks'));
    const pending = opusTasks.pending();
    if (arg === 'list') {
      if (!pending.length) return safeSend(chatId, '📭 Opus queue empty.');
      const lines = pending.map(t => `#${t.id} [${t.kind}] ${t.agent}: ${t.task.slice(0, 80)}`).join('\n');
      return safeSend(chatId, `🧠 *${pending.length} pending Opus task(s):*\n${lines}`, { parse_mode: 'Markdown' });
    }
    if (!pending.length) return safeSend(chatId, '📭 Opus queue empty — nothing to drain.');
    const cap = Math.min(parseInt(arg, 10) || 5, pending.length);
    await safeSend(chatId, `🧠 Draining ${cap} Opus task(s) via Max plan — spec-consistency audits…`);
    const { drain } = require(path.join(process.env.HOME, 'Cathedral', 'opus-drain'));
    const r = await drain({ cap });
    for (const x of r.results) {
      if (x.ok) {
        const files = x.filesUsed && x.filesUsed.length ? `\n_files: ${x.filesUsed.join(', ')}_` : '';
        await safeSend(chatId, `✅ *Opus #${x.id}* (${x.agent})${files}\n\n${x.result}`, { parse_mode: 'Markdown' });
      } else {
        await safeSend(chatId, `❌ *Opus #${x.id}* (${x.agent}) failed: ${x.error}`, { parse_mode: 'Markdown' });
      }
    }
    await safeSend(chatId, `🧠 Drained ${r.drained}/${r.total}. Queue now ${opusTasks.pending().length} pending.`);
  } catch (err) {
    console.error('opus-drain error:', err);
    await safeSend(chatId, `⚠️ opus-drain failed: ${err.message}`);
  }
});

// /liveness — silent-death check ("online != working"). Runs the immune layer
// on demand: which agents/watchers have stopped producing real output.
bot.onText(/^\/liveness(?:@\w+)?\s*$/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const { execFile } = require('child_process');
    execFile('node', [path.join(process.env.HOME, 'Cathedral', 'liveness.js'), '--all', '--quiet'],
      { timeout: 60000 }, async () => {
        // liveness.js writes liveness-state.json; read it for the report.
        let state = {};
        try { state = JSON.parse(fs.readFileSync(path.join(process.env.HOME, 'Cathedral', 'liveness-state.json'), 'utf8')); } catch {}
        const stale = state.stale || [];
        const cfg = JSON.parse(fs.readFileSync(path.join(process.env.HOME, 'Cathedral', 'liveness-targets.json'), 'utf8'));
        if (!stale.length) return safeSend(chatId, '🟢 *Liveness:* all targets producing output. Nothing silently dead.', { parse_mode: 'Markdown' });
        const lines = stale.map(n => {
          const t = (cfg.targets || []).find(x => x.name === n);
          return `🔴 ${n}${t && t.note ? ` — _${t.note}_` : ''}`;
        }).join('\n');
        await safeSend(chatId, `🫀 *Liveness — ${stale.length} silently dead (online≠working):*\n${lines}`, { parse_mode: 'Markdown' });
      });
  } catch (err) {
    await safeSend(chatId, `⚠️ liveness failed: ${err.message}`);
  }
});

// /reedmake — Reed v2 generation spine. Taste-gated, cheapest-tool, budget-capped.
// Image (Higgsfield depleted) -> paste-ready OpenArt prompt. Video -> fal Seedance.
// Add "video" for a clip; add "go" to actually spend on a paid clip.
bot.onText(/^\/reedmake(?:@\w+)?\s+(.+)$/is, async (msg, match) => {
  const chatId = msg.chat.id;
  let brief = (match[1] || '').trim();
  const flags = [];
  if (/\bvideo\b/i.test(brief)) { flags.push('--video'); brief = brief.replace(/\bvideo\b/i, '').trim(); }
  if (/\bgo\b/i.test(brief)) { flags.push('--go'); brief = brief.replace(/\bgo\b/i, '').trim(); }
  try {
    const { execFile } = require('child_process');
    execFile('node', [path.join(process.env.HOME, 'nanoclaw', 'reed', 'reed-generate.js'), brief, ...flags],
      { timeout: 180000 }, (err, stdout) => {
        if (err && !stdout) return safeSend(chatId, `⚠️ reedmake: ${err.message}`);
        safeSend(chatId, `🎬 *Reed*\n${(stdout || '').slice(0, 1500)}`, { parse_mode: 'Markdown' });
      });
  } catch (e) { safeSend(chatId, `⚠️ reedmake failed: ${e.message}`); }
});

// /reedrate <id|filename> <good|bad|1-5> — rate a generated item; bandit + shots learn.
bot.onText(/^\/reedrate(?:@\w+)?\s+(\S+)\s+(\S+)\s*$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  try {
    const { execFile } = require('child_process');
    execFile('node', [path.join(process.env.HOME, 'nanoclaw', 'reed', 'reed-rate.js'), match[1], match[2]],
      { timeout: 30000 }, (err, stdout) => {
        safeSend(chatId, err && !stdout ? `⚠️ reedrate: ${err.message}` : `⭐ ${(stdout || 'rated').slice(0, 800)}`);
      });
  } catch (e) { safeSend(chatId, `⚠️ reedrate failed: ${e.message}`); }
});

// /reeddump — the daily offload queue (ready-to-post images/clips/prompts).
bot.onText(/^\/reed(?:dump|queue)(?:@\w+)?\s*$/i, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const { execFile } = require('child_process');
    execFile('node', [path.join(process.env.HOME, 'nanoclaw', 'reed', 'dump-manifest.js')],
      { timeout: 30000 }, () => {
        let md = '';
        try { md = fs.readFileSync(path.join(process.env.HOME, 'reed-dump', 'ready', 'MANIFEST.md'), 'utf8'); } catch {}
        safeSend(chatId, md ? `📤 *Reed offload queue*\n\`\`\`\n${md.slice(0, 3000)}\n\`\`\`` : '📭 Offload queue empty.', { parse_mode: 'Markdown' });
      });
  } catch (e) { safeSend(chatId, `⚠️ reeddump failed: ${e.message}`); }
});

// /reedready <id|filename> — the Instagram-standard GATE. Flags an item
// instagram-ready, which auto-routes it to Maya for caption+headline and turns it
// publish-ready. (Same as `/reedrate <id> ig`, friendlier name.)
bot.onText(/^\/reedready(?:@\w+)?\s+(\S+)\s*$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  try {
    const { execFile } = require('child_process');
    execFile('node', [path.join(process.env.HOME, 'nanoclaw', 'reed', 'reed-rate.js'), match[1], 'instagram-ready'],
      { timeout: 120000 }, (err, stdout) => {
        safeSend(chatId, err && !stdout ? `⚠️ reedready: ${err.message}` : `✅ *Instagram-standard → Maya*\n${(stdout || '').slice(0, 1200)}`, { parse_mode: 'Markdown' });
      });
  } catch (e) { safeSend(chatId, `⚠️ reedready failed: ${e.message}`); }
});

// /capture — your gym shooting list (capture-wishlist). What the pipeline needs
// you to film/photograph. Auto-clears when you drop matching files in reed-dump/inbox/.
bot.onText(/^\/capture(?:@\w+)?\s*$/i, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const { execFile } = require('child_process');
    execFile('node', [path.join(process.env.HOME, 'nanoclaw', 'reed', 'capture-wishlist.js'), 'list'],
      { timeout: 30000 }, (err, stdout) => {
        safeSend(chatId, err && !stdout ? `⚠️ capture: ${err.message}` : `📸 *Capture wishlist* (shoot these → drop in reed-dump/inbox/)\n\`\`\`\n${(stdout || '').slice(0, 3200)}\n\`\`\``, { parse_mode: 'Markdown' });
      });
  } catch (e) { safeSend(chatId, `⚠️ capture failed: ${e.message}`); }
});

// /gold — show the latest gold from the Elicitor (standing-question engine).
bot.onText(/^\/gold(?:@\w+)?\s*$/i, async (msg) => {
  const chatId = msg.chat.id;
  try {
    let feed = []; try { feed = JSON.parse(fs.readFileSync(path.join(process.env.HOME, 'nanoclaw', 'elicitor', 'gold-feed.json'), 'utf8')); } catch {}
    const items = (Array.isArray(feed) ? feed : feed.items || []).slice(-8).reverse();
    if (!items.length) return safeSend(chatId, '🪙 No gold yet — run /elicit to ask the standing questions.');
    const body = items.map(g => `🪙 *${g.score}/10* ${g.question}\n${(g.answer || '').slice(0, 280)}`).join('\n\n');
    await safeSend(chatId, `🪙 *Gold* (what I'd have asked + what came back)\n\n${body}\n\n_Full board: /board → Gold tab_`, { parse_mode: 'Markdown' });
  } catch (e) { await safeSend(chatId, `⚠️ gold failed: ${e.message}`); }
});

// /elicit [N] — run the Standing-Question Engine now: generate sharp questions,
// elicit vault-grounded answers, push only the gold (gated). Default 8.
bot.onText(/^\/elicit(?:@\w+)?\s*(\d+)?\s*$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const cap = Math.min(parseInt(match[1], 10) || 8, 12);
  await safeSend(chatId, `🛎️ Elicitor running — generating ${cap} standing questions, eliciting, gold-gating…`);
  try {
    const { execFile } = require('child_process');
    execFile('node', [path.join(process.env.HOME, 'nanoclaw', 'elicitor', 'elicitor.js'), '--cap', String(cap)],
      { timeout: 300000 }, (err, stdout) => {
        safeSend(chatId, err && !stdout ? `⚠️ elicit: ${err.message}` : `🛎️ ${(stdout || 'done').slice(0, 800)}\n\n_See gold: /gold_`);
      });
  } catch (e) { await safeSend(chatId, `⚠️ elicit failed: ${e.message}`); }
});

// /ledger — Falsifiable claims tracker
bot.onText(/^\/ledger(?:@\w+)?\s*(.*)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const args = (match[1] || '').trim();

  try {
    let cmd, cmdArgs;

    if (!args || args === 'stats') {
      cmd = ['stats'];
    } else if (args === 'pending') {
      cmd = ['pending'];
    } else if (args === 'all') {
      cmd = ['all'];
    } else if (args.startsWith('log ')) {
      // /ledger log "claim text" 30
      const logMatch = args.match(/^log\s+(.+?)(?:\s+(\d+))?$/);
      if (!logMatch) {
        await safeSend(chatId, 'Usage: /ledger log [claim text] [days]\nDefault: 90 days');
        return;
      }
      cmd = ['log', logMatch[1].replace(/^["']|["']$/g, ''), '--days', logMatch[2] || '90'];
    } else if (args.startsWith('verify ')) {
      // /ledger verify 3 held Reason text here
      const verMatch = args.match(/^verify\s+(\d+)\s+(held|failed|unclear)\s*(.*)$/i);
      if (!verMatch) {
        await safeSend(chatId, 'Usage: /ledger verify [id] [held|failed|unclear] [reason]');
        return;
      }
      cmd = ['verify', verMatch[1], verMatch[2].toLowerCase()];
      if (verMatch[3]) cmd.push(verMatch[3]);
    } else {
      await safeSend(chatId, 'Usage:\n/ledger stats\n/ledger pending\n/ledger log [claim] [days]\n/ledger verify [id] [held|failed|unclear] [reason]');
      return;
    }

    const output = await new Promise((resolve, reject) => {
      const proc = spawn(
        'python3',
        [path.join(process.env.HOME, 'Cathedral', 'ledger.py'), ...cmd],
        { env: process.env }
      );
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', d => { stdout += d.toString(); });
      proc.stderr.on('data', d => { stderr += d.toString(); });
      proc.on('close', code => {
        if (code !== 0) reject(new Error(stderr.trim() || `exit code ${code}`));
        else resolve(stdout.trim());
      });
      proc.on('error', reject);
    });

    await safeSend(chatId, output);
  } catch (err) {
    console.error('Ledger error:', err);
    await safeSend(chatId, `Ledger failed: ${err.message}`);
  }
});

// /genius — alias for /council (backwards compat)
bot.onText(/^\/genius(?:@\w+)?\s+(.+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const arg = match[1].trim();
  // Rewrite as /council and let existing handlers process
  if (arg === 'characters' || arg === 'last') {
    const proc = spawn(
      'python3',
      [path.join(process.env.HOME, 'Cathedral', 'genius-council', 'council.py'), arg === 'characters' ? '--characters' : '--last'],
      { env: process.env }
    );
    let stdout = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.on('close', () => safeSend(chatId, stdout.trim() || 'No data.'));
    proc.on('error', err => safeSend(chatId, `Failed: ${err.message}`));
  } else {
    await safeSend(chatId, `Convening Genius Council...\n\n"${arg.slice(0, 100)}"\n\nSelecting characters and querying — this takes 3-8 minutes.`);
    try {
      const output = await new Promise((resolve, reject) => {
        const proc = spawn(
          'python3',
          [path.join(process.env.HOME, 'Cathedral', 'genius-council', 'council.py'), arg],
          { env: process.env }
        );
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', d => { stdout += d.toString(); });
        proc.stderr.on('data', d => { stderr += d.toString(); });
        proc.on('close', code => {
          if (code !== 0) reject(new Error(stderr.trim().split('\n').pop() || `exit code ${code}`));
          else resolve(stdout.trim());
        });
        proc.on('error', reject);
        setTimeout(() => { try { proc.kill(); } catch {} reject(new Error('Timeout (10 min)')); }, 600000);
      });
      await safeSend(chatId, output);
    } catch (err) {
      console.error('Genius Council error:', err);
      await safeSend(chatId, `Genius Council failed: ${err.message}`);
    }
  }
});

// /genius (no args) — show last session
bot.onText(/^\/genius(?:@\w+)?\s*$/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const output = await new Promise((resolve, reject) => {
      const proc = spawn(
        'python3',
        [path.join(process.env.HOME, 'Cathedral', 'genius-council', 'council.py'), '--last'],
        { env: process.env }
      );
      let stdout = '';
      proc.stdout.on('data', d => { stdout += d.toString(); });
      proc.on('close', code => resolve(stdout.trim() || 'No sessions yet.'));
      proc.on('error', reject);
    });
    await safeSend(chatId, output);
  } catch (err) {
    await safeSend(chatId, `Failed: ${err.message}`);
  }
});

// /audit — Cathedral self-audit
bot.onText(/^\/audit(?:@\w+)?\s*$/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    await safeSend(chatId, 'Running Cathedral self-audit...');
    const output = await new Promise((resolve, reject) => {
      const proc = spawn('python3', [
        path.join(process.env.HOME, 'Cathedral', 'self-audit.py'), '--telegram'
      ], { env: process.env, cwd: path.join(process.env.HOME, 'Cathedral') });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', d => { stdout += d; });
      proc.stderr.on('data', d => { stderr += d; });
      proc.on('close', code => {
        if (code !== 0 && !stdout.trim()) reject(new Error(stderr.trim().split('\n').pop() || `exit ${code}`));
        else resolve(stdout.trim());
      });
      proc.on('error', reject);
      setTimeout(() => { try { proc.kill(); } catch {} reject(new Error('Audit timeout (2 min)')); }, 120000);
    });
    await safeSend(chatId, output || 'Audit complete — no output.');
  } catch (err) {
    console.error('Audit error:', err);
    await safeSend(chatId, `Audit failed: ${err.message}`);
  }
});

// /scratchpad — Paul's raw thinking capture
// Send /scratchpad [text] — captured to vault as raw_thinking/ with #unreflected
// No structure. No response. Just capture.
bot.onText(/^\/scratchpad(?:@\w+)?\s+(.+)/s, async (msg, match) => {
  const chatId = msg.chat.id;
  const text = match[1].trim();
  if (!text) return;

  try {
    const fs = await import('fs');
    const date = new Date().toISOString().slice(0, 10);
    const time = new Date().toISOString().slice(11, 16).replace(':', '');
    const dir = path.join(process.env.HOME, 'cathedral-vault', '00_Staging', 'raw_thinking');
    fs.mkdirSync(dir, { recursive: true });

    const filepath = path.join(dir, `${date}-${time}-thinking.md`);
    const content = `---\ndate: ${date}\ntags: [unreflected]\n---\n\n${text}\n`;
    fs.writeFileSync(filepath, content, 'utf8');

    await safeSend(chatId, `Captured. #unreflected`);
  } catch (err) {
    console.error('Scratchpad error:', err);
    await safeSend(chatId, `Scratchpad failed: ${err.message}`);
  }
});

// /researcher — The Researcher: autonomous research intelligence
// /researcher         → status (what would it research tonight?)
// /researcher run     → force a research cycle now
// /researcher last    → explain last run's reasoning
// /researcher [topic] → redirect tonight's research to this topic
bot.onText(/^\/researcher(?:@\w+)?(?:\s+(.*))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const arg = (match[1] || '').trim();

  try {
    if (arg === 'run') {
      await safeSend(chatId, 'The Researcher is starting a research cycle. This takes 10-20 minutes...');
      const proc = spawn('node', [
        path.join(process.env.HOME, 'Cathedral', 'the-researcher.cjs'),
      ], { env: process.env, cwd: path.join(process.env.HOME, 'Cathedral'), timeout: 1200000 });
      let stdout = '';
      proc.stdout.on('data', d => { stdout += d; });
      proc.stderr.on('data', d => {
        const lines = d.toString().split('\n').filter(l => l.includes('[researcher]'));
        for (const line of lines) console.log(line.trim());
      });
      proc.on('close', async (code) => {
        if (code === 0) {
          await safeSend(chatId, 'Research cycle complete. Check Telegram for the summary.');
        } else {
          await safeSend(chatId, `Research cycle failed (code ${code}).`);
        }
      });
      proc.on('error', async (err) => {
        await safeSend(chatId, `Researcher error: ${err.message}`);
      });
    } else if (arg === 'last') {
      const output = spawn('node', [
        path.join(process.env.HOME, 'Cathedral', 'the-researcher.cjs'), '--last',
      ], { env: process.env, timeout: 10000 });
      let out = '';
      output.stdout.on('data', d => { out += d; });
      output.on('close', async () => {
        await safeSend(chatId, out.trim() || 'No research history yet.');
      });
    } else if (arg === '' || arg === 'status') {
      const output = spawn('node', [
        path.join(process.env.HOME, 'Cathedral', 'the-researcher.cjs'), '--status',
      ], { env: process.env, timeout: 10000 });
      let out = '';
      output.stdout.on('data', d => { out += d; });
      output.on('close', async () => {
        await safeSend(chatId, out.trim() || 'Researcher status unavailable.');
      });
    } else {
      // Treat as a topic redirection
      const output = spawn('node', [
        path.join(process.env.HOME, 'Cathedral', 'the-researcher.cjs'),
        '--redirect', arg,
      ], { env: process.env, timeout: 10000 });
      let out = '';
      output.stdout.on('data', d => { out += d; });
      output.on('close', async () => {
        await safeSend(chatId, out.trim() || `Queued: "${arg}" for tonight's research.`);
      });
    }
  } catch (err) {
    console.error('Researcher error:', err);
    await safeSend(chatId, `Researcher failed: ${err.message}`);
  }
});

// /moon — Moon phase report
bot.onText(/^\/moon(?:@\w+)?$/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const { formatMoonReport } = await import('./moon-phase.js');
    const report = formatMoonReport();
    await safeSend(chatId, report);
  } catch (err) {
    console.error('Moon phase error:', err);
    await safeSend(chatId, `Moon phase failed: ${err.message}`);
  }
});

// /sky — Full sky state from all 5 pipelines
bot.onText(/^\/sky(?:@\w+)?(?:\s+(.+))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  try {
    const { skyState } = await import('./services/sky-sense/index.mjs');
    const input = match[1] ? new Date(match[1]) : new Date();
    if (isNaN(input.getTime())) {
      await safeSend(chatId, 'Invalid date. Use: /sky or /sky 2026-06-15');
      return;
    }
    const state = skyState(input);
    const DEG = 180 / Math.PI;
    const bodyLines = Object.entries(state.bodies).map(([name, b]) => {
      const ra = (b.ra * DEG).toFixed(1);
      const dec = (b.dec * DEG).toFixed(1);
      const extras = [];
      if (b.constellation) extras.push(b.constellation);
      if (b.elongation) extras.push(`elong ${b.elongation.toFixed(0)}°`);
      if (b.name) extras.push(b.name);
      if (b.illumination !== undefined) extras.push(`${(b.illumination * 100).toFixed(0)}%`);
      const emoji = { sun: '☉', moon: '☽', mercury: '☿', venus: '♀', mars: '♂', jupiter: '♃', saturn: '♄' }[name] || '';
      return `${emoji} *${name}* — RA ${ra}° Dec ${dec}°${extras.length ? ' · ' + extras.join(' · ') : ''}`;
    });

    const retro = state.events.currentRetrogrades;
    const contested = state.pipelines.contested;

    let text = `*SKY STATE*\n${state.timestamp.split('T')[0]} ${state.timestamp.split('T')[1].split('.')[0]} UTC\n`;
    text += `GMST: ${state.gmst.toFixed(2)}h · JD: ${state.jd.toFixed(2)}\n\n`;
    text += bodyLines.join('\n') + '\n\n';
    text += `*Moon:* ${state.events.moonPhase.name} (${(state.events.moonPhase.illumination * 100).toFixed(0)}%)\n`;
    text += `New: ${state.events.nextNew.toISOString().split('T')[0]} · Full: ${state.events.nextFull.toISOString().split('T')[0]}\n`;
    if (retro.length) text += `*Retrograde:* ${retro.join(', ')}\n`;
    text += `\n*Pipeline Consensus:* ${(state.pipelines.consensus.confidence * 100).toFixed(0)}%\n`;
    text += `*Frontier:* ${state.pipelines.frontier}`;

    await safeSend(chatId, text);
  } catch (err) {
    console.error('Sky state error:', err);
    await safeSend(chatId, `Sky sense failed: ${err.message}`);
  }
});

// /glass — Looking Glass full convergence scan (Layer 3)
bot.onText(/^\/glass(?:@\w+)?(?:\s+(.+))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  try {
    await safeSend(chatId, 'Looking through the glass...');
    const { lookForward, formatForTelegram } = await import('./services/sky-sense/index.mjs');
    const from = match[1] ? new Date(match[1]) : undefined;
    const result = lookForward({ days: 90, resolution: 7, from });
    await safeSend(chatId, formatForTelegram(result));
  } catch (err) {
    console.error('Looking glass error:', err);
    await safeSend(chatId, `Looking glass failed: ${err.message}`);
  }
});

// /signal — Quick today signal (what does the sky say right now?)
bot.onText(/^\/signal(?:@\w+)?$/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const { todaySignal } = await import('./services/sky-sense/index.mjs');
    const s = todaySignal();
    const icon = { CONVERGENCE_PEAK: '▲', DIVERGENCE_FRONTIER: '◇', PATTERN_ECHO: '○', SILENT_ZONE: '·', AMBIENT: '·' }[s.signal.type] || '·';
    let text = `${icon} SKY SIGNAL — ${s.date}\n\n`;
    text += `Score: ${s.convergenceScore}% · ${s.signal.type.replace(/_/g, ' ')}\n`;
    text += `${s.signal.label}\n\n`;
    text += `Moon: ${s.moonPhase}\n`;
    text += `Retrogrades: ${s.retrogrades.length ? s.retrogrades.join(', ') : 'none'}\n`;
    text += `Frontier: ${s.frontier}\n`;
    if (s.historicalMatches.length) {
      text += '\nHistorical echoes:\n';
      for (const m of s.historicalMatches) {
        text += `  ${m.label} (${m.score}%)\n`;
      }
    }
    await safeSend(chatId, text);
  } catch (err) {
    console.error('Signal error:', err);
    await safeSend(chatId, `Signal failed: ${err.message}`);
  }
});

// /pipelines [body] — Compare all 5 pipelines for a specific body
bot.onText(/^\/pipelines(?:@\w+)?\s+(\w+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  try {
    const { comparePipelines } = await import('./services/sky-sense/index.mjs');
    const body = match[1].toLowerCase();
    const valid = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'];
    if (!valid.includes(body)) {
      await safeSend(chatId, `Unknown body. Choose: ${valid.join(', ')}`);
      return;
    }
    const DEG = 180 / Math.PI;
    const comp = comparePipelines(body, new Date());
    let text = `*PIPELINE COMPARISON: ${body.toUpperCase()}*\n\n`;
    for (const [pName, pos] of Object.entries(comp.pipelines)) {
      const ra = isNaN(pos.ra) ? 'N/A' : (pos.ra * DEG).toFixed(3) + '°';
      const dec = isNaN(pos.dec) ? 'N/A' : (pos.dec * DEG).toFixed(3) + '°';
      text += `*${pName}:* RA ${ra} · Dec ${dec}\n`;
    }
    text += `\n*Divergence:* ${comp.divergenceDeg.toFixed(3)}°\n`;
    text += `*Consensus:* ${comp.consensus ? '✓ YES' : '✗ NO — research frontier'}`;
    await safeSend(chatId, text);
  } catch (err) {
    console.error('Pipeline comparison error:', err);
    await safeSend(chatId, `Pipeline compare failed: ${err.message}`);
  }
});

// /geomag — Space weather + geomagnetic prediction briefing
bot.onText(/^\/geomag(?:@\w+)?$/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    await safeSend(chatId, 'Running geomagnetic prediction engine...');
    const { fetchAllSpaceWeather } = await import('./geomag/space-weather-fetcher.js');
    const { predictDst: wsaEnlil } = await import('./geomag/strategies/wsa-enlil.js');
    const { predictDst: electricUniverse } = await import('./geomag/strategies/electric-universe.js');
    const { predictDst: resonantCavity } = await import('./geomag/strategies/resonant-cavity.js');
    const { predictDst: planetaryTidal } = await import('./geomag/strategies/planetary-tidal.js');

    const sw = await fetchAllSpaceWeather();
    if (!sw || !sw.dst) { await safeSend(chatId, 'Space weather data unavailable'); return; }

    const strategies = [
      { name: 'WSA-Enlil', fn: wsaEnlil },
      { name: 'Electric Universe', fn: electricUniverse },
      { name: 'Resonant Cavity', fn: resonantCavity },
      { name: 'Planetary-Tidal', fn: planetaryTidal },
    ];

    let text = `*GEOMAGNETIC PREDICTION*\n\n`;
    text += `Activity: ${sw.activity.level} (${sw.activity.score.toFixed(1)}/10)\n`;
    if (sw.activity.factors.length) text += `Drivers: ${sw.activity.factors.join(', ')}\n`;
    text += `Dst: ${sw.dst.latest.dst}nT (${sw.dst.stormLevel})\n`;
    if (sw.kp) text += `Kp: ${sw.kp.latest.kp.toFixed(1)} (${sw.kp.stormLevel})\n`;
    if (sw.mag) text += `Bz: ${sw.mag.latest.bz.toFixed(1)}nT\n`;
    if (sw.plasma) text += `Solar wind: ${sw.plasma.latest.speed.toFixed(0)}km/s\n`;
    if (sw.xray) text += `X-ray: ${sw.xray.latest.class}\n`;

    text += `\n*Predictions (Dst @ +6h / +12h / +24h):*\n`;
    for (const { name, fn } of strategies) {
      try {
        const p = fn(sw);
        if (p) {
          const emoji = p.predictions.h6 < sw.dst.latest.dst - 10 ? '🔴' :
                        p.predictions.h6 > sw.dst.latest.dst + 5 ? '🟢' : '🟡';
          text += `${emoji} ${name}: ${p.predictions.h6} / ${p.predictions.h12} / ${p.predictions.h24} nT (${(p.confidence*100).toFixed(0)}%)\n`;
        }
      } catch (e) { text += `❌ ${name}: error\n`; }
    }

    await safeSend(chatId, text);
  } catch (err) {
    console.error('Geomag error:', err);
    await safeSend(chatId, `Geomag failed: ${err.message}`);
  }
});

// /spaceweather — Raw space weather data
bot.onText(/^\/spaceweather(?:@\w+)?$/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const { fetchAllSpaceWeather } = await import('./geomag/space-weather-fetcher.js');
    const sw = await fetchAllSpaceWeather();
    if (!sw) { await safeSend(chatId, 'Fetch failed'); return; }

    let text = `*SPACE WEATHER*\n\n`;
    text += `Activity: ${sw.activity.level} (${sw.activity.score.toFixed(1)}/10)\n\n`;

    if (sw.dst) text += `*Dst:* ${sw.dst.latest.dst}nT (${sw.dst.stormLevel})\n  24h min: ${sw.dst.stats.min24h}nT | trend: ${sw.dst.stats.trend > 0 ? '+' : ''}${sw.dst.stats.trend.toFixed(1)}nT/6h\n\n`;
    if (sw.kp) text += `*Kp:* ${sw.kp.latest.kp.toFixed(1)} (${sw.kp.stormLevel})\n  24h max: ${sw.kp.stats.max24h.toFixed(1)} | trend: ${sw.kp.stats.trend > 0 ? '+' : ''}${sw.kp.stats.trend.toFixed(2)}\n\n`;
    if (sw.mag) text += `*IMF Bz:* ${sw.mag.latest.bz.toFixed(1)}nT | Bt: ${sw.mag.latest.bt.toFixed(1)}nT\n  2h range: ${sw.mag.stats.bz.min.toFixed(1)} to ${sw.mag.stats.bz.max.toFixed(1)}nT\n  Southward minutes: ~${sw.mag.southwardMinutes.toFixed(0)}min\n\n`;
    if (sw.plasma) text += `*Solar Wind:* ${sw.plasma.latest.speed.toFixed(0)}km/s | density: ${sw.plasma.latest.density.toFixed(1)}/cm³\n  Speed range: ${sw.plasma.stats.speed.min.toFixed(0)}-${sw.plasma.stats.speed.max.toFixed(0)}km/s\n\n`;
    if (sw.xray) text += `*X-ray:* ${sw.xray.latest.class} (6h peak: ${sw.xray.peak6h.class})\n`;

    await safeSend(chatId, text);
  } catch (err) {
    await safeSend(chatId, `Space weather failed: ${err.message}`);
  }
});

// /backtest — Geomag strategy backtest leaderboard
bot.onText(/^\/backtest(?:@\w+)?(?:\s+(\d{4}))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  try {
    const year = match[1] || '2024';
    const fs = await import('fs');
    const resultsPath = `${__dirname}/geomag/backtest-results/backtest-${year}.json`;
    if (!fs.default.existsSync(resultsPath)) {
      await safeSend(chatId, `No backtest results for ${year}. Run: node geomag/backtester.js ${year}`);
      return;
    }
    const data = JSON.parse(fs.default.readFileSync(resultsPath, 'utf8'));

    let text = `*GEOMAG BACKTEST — ${year}*\n`;
    text += `${data.totalStorms} storms (Dst < ${data.threshold}nT)\n`;
    text += `Solar wind: ${data.hasSolarWind ? 'OMNI2 measured' : 'Reconstructed'}\n\n`;

    text += `*LEADERBOARD (@+6h)*\n`;
    const medals = ['🥇', '🥈', '🥉', '4️⃣'];
    for (let i = 0; i < data.leaderboard.length; i++) {
      const e = data.leaderboard[i];
      const m = e.metrics.h6 || {};
      text += `${medals[i]} *${e.name}*\n`;
      text += `  MAE: ${m.meanAbsError?.toFixed(1) || '—'}nT | Dir: ${m.directionAccuracy || '—'}%\n`;
      text += `  Bias: ${m.meanError > 0 ? '+' : ''}${m.meanError?.toFixed(1) || '—'}nT\n\n`;
    }

    text += `*DIRECTION ACCURACY (@+24h)*\n`;
    for (const e of data.leaderboard) {
      const m24 = e.metrics.h24 || {};
      text += `  ${e.name}: ${m24.directionAccuracy || '—'}%\n`;
    }

    text += `\n📊 Dashboard: localhost:8080/geomag/backtest-dashboard`;
    await safeSend(chatId, text);
  } catch (err) {
    await safeSend(chatId, `Backtest failed: ${err.message}`);
  }
});

// /rate — Lymphatic feedback (rate a Cathedral output)
bot.onText(/^\/rate(?:@\w+)?\s+(\w+)\s+(\d)(?:\s+(.+))?$/s, async (msg, match) => {
  const chatId = msg.chat.id;
  try {
    const { recordRating } = await import('./lymphatic.mjs');
    recordRating(match[1], parseInt(match[2]), match[3] || '');
    await safeSend(chatId, `Rated ${match[1]}: ${match[2]}/5${match[3] ? ' — ' + match[3] : ''}`);
  } catch (err) {
    await safeSend(chatId, `Rate failed: ${err.message}`);
  }
});

// /bloat — Lymphatic bloat report
bot.onText(/^\/bloat(?:@\w+)?$/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const { bloatReport } = await import('./lymphatic.mjs');
    await safeSend(chatId, bloatReport());
  } catch (err) {
    await safeSend(chatId, `Bloat report failed: ${err.message}`);
  }
});

// /physician — Cathedral health diagnosis
bot.onText(/^\/physician(?:@\w+)?$/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    await safeSend(chatId, 'The Physician is examining the Cathedral...');
    const { execSync } = await import('child_process');
    execSync('node /Users/basicclaw777/nanoclaw/the-physician.mjs', { timeout: 60000 });
    await safeSend(chatId, 'Diagnosis complete — check above message.');
  } catch (err) {
    await safeSend(chatId, `Physician failed: ${err.message}`);
  }
});

// /answer — Physician interview response
bot.onText(/^\/answer(?:@\w+)?\s+(\d)\s+(.+)$/s, async (msg, match) => {
  const chatId = msg.chat.id;
  try {
    const num = parseInt(match[1]);
    const response = match[2].trim();
    const ids = ['changed_mind', 'actually_used', 'ignored', 'morning_rate', 'blind_spot'];
    const id = ids[num - 1];
    if (!id) { await safeSend(chatId, 'Use 1-5. Example: /answer 1 I changed my mind about X'); return; }

    // Save to physician state
    const fs = await import('fs');
    const statePath = path.join(process.env.HOME, 'Cathedral/physician-state.json');
    let state = {};
    try { state = JSON.parse(fs.readFileSync(statePath, 'utf-8')); } catch {}
    if (!state.interviews) state.interviews = [];
    state.interviews.push({ date: new Date().toISOString().slice(0, 10), question: id, response });
    if (state.interviews.length > 100) state.interviews = state.interviews.slice(-100);
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

    // Feed belief tracker if Q1 (changed mind)
    if (num === 1 && typeof recordStatement === 'function') {
      try { recordStatement(response, 0.3, 'physician_interview', 'changed_mind'); } catch {}
    }

    // Feed lymphatic ratings if Q4 (morning rate)
    if (num === 4) {
      try {
        const ratingMatch = response.match(/(\d)/);
        if (ratingMatch) {
          const { recordRating } = await import('./lymphatic.mjs');
          recordRating('morning_sequence', parseInt(ratingMatch[1]), response);
        }
      } catch {}
    }

    await safeSend(chatId, `Recorded answer ${num}: ${id}. ${num === 1 ? 'Fed to belief tracker.' : num === 4 ? 'Fed to lymphatic ratings.' : 'Filed.'}`);
  } catch (err) {
    await safeSend(chatId, `Answer failed: ${err.message}`);
  }
});

// /harvest-deepseek — harvest DeepSeek transcripts from ~/raw-chats/deepseek/
bot.onText(/^\/harvest-deepseek(?:@\w+)?$/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    await safeSend(chatId, 'Harvesting DeepSeek transcripts...');
    const { harvestTranscript, formatHarvestResult } = await import('./deepseek-harvester.js');
    const { readdirSync } = await import('fs');
    const intakeDir = path.join(process.env.HOME, 'raw-chats', 'deepseek');
    const files = readdirSync(intakeDir).filter(f => f.endsWith('.md') || f.endsWith('.txt'));

    if (files.length === 0) {
      await safeSend(chatId, 'No transcripts in ~/raw-chats/deepseek/');
      return;
    }

    let totalNuggets = 0;
    for (const f of files) {
      const result = await harvestTranscript(path.join(intakeDir, f));
      totalNuggets += result.nuggets;
      await safeSend(chatId, formatHarvestResult(result));
    }

    if (totalNuggets === 0) {
      await safeSend(chatId, 'All transcripts already harvested or no nuggets found.');
    }
  } catch (err) {
    console.error('Harvest error:', err);
    await safeSend(chatId, `⚠️ Harvest failed: ${err.message}`);
  }
});

// /vault-state — generate and show current vault state for seed prompt
bot.onText(/^\/vault-state(?:@\w+)?$/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    await safeSend(chatId, 'Generating vault state...');
    const { writeVaultState } = await import('./vault-state-generator.js');
    const stateText = writeVaultState();
    await safeSend(chatId, `\`\`\`\n${stateText}\n\`\`\``, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Vault state error:', err);
    await safeSend(chatId, `⚠️ Vault state failed: ${err.message}`);
  }
});

// /scout-design — on-demand design scout run
bot.onText(/^\/scout-design(?:@\w+)?$/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    await safeSend(chatId, 'Running design scout (Gemini web search)...');
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const exec = promisify(execFile);
    const scoutPath = `${process.env.HOME}/Cathedral/skills-scout.js`;
    const { stdout, stderr } = await exec('node', [scoutPath, '--design', '--force'], { timeout: 180000 });
    // Scout sends its own Telegram digest, but confirm completion
    await safeSend(chatId, 'Design scout complete. Check digest above.');
  } catch (err) {
    console.error('Scout-design error:', err);
    await safeSend(chatId, `⚠️ Design scout failed: ${err.message}`);
  }
});

// ── Scout commands ───────────────────────────────────────────────────────────

// /scout accept <id> — promote finding to vault staging
bot.onText(/^\/scout\s+accept\s+(.+)/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const id = match[1].trim();
  try {
    const { promoteFinding } = await import('./scout-engine.js');
    const dest = promoteFinding(id);
    await safeSend(chatId, `✓ ${id} promoted to vault staging`);
  } catch (err) {
    await safeSend(chatId, `⚠️ ${err.message}`);
  }
});

// /scout park <id> — extend revalidation by 30 days
bot.onText(/^\/scout\s+park\s+(.+)/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const id = match[1].trim();
  try {
    const { parkFinding } = await import('./scout-engine.js');
    const newDate = parkFinding(id);
    await safeSend(chatId, `⏸ ${id} parked — revalidation extended to ${newDate}`);
  } catch (err) {
    await safeSend(chatId, `⚠️ ${err.message}`);
  }
});

// /scout discard <id> — move finding to archive
bot.onText(/^\/scout\s+discard\s+(.+)/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const id = match[1].trim();
  try {
    const { discardFinding } = await import('./scout-engine.js');
    discardFinding(id);
    await safeSend(chatId, `✗ ${id} discarded — moved to archive`);
  } catch (err) {
    await safeSend(chatId, `⚠️ ${err.message}`);
  }
});

// /scout candidates — list active findings
bot.onText(/^\/scout\s+candidates\s*$/i, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const { getCandidatesList } = await import('./scout-engine.js');
    await safeSend(chatId, getCandidatesList());
  } catch (err) {
    await safeSend(chatId, `⚠️ ${err.message}`);
  }
});

// /scout weather — show current weather report
bot.onText(/^\/scout\s+weather\s*$/i, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const { readWeatherReport } = await import('./scout-engine.js');
    await safeSend(chatId, readWeatherReport());
  } catch (err) {
    await safeSend(chatId, `⚠️ ${err.message}`);
  }
});

// /scout crack — show current curated crack
bot.onText(/^\/scout\s+crack\s*$/i, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const { getTopCrack, formatCrack } = await import('./scout-engine.js');
    await safeSend(chatId, formatCrack(getTopCrack()));
  } catch (err) {
    await safeSend(chatId, `⚠️ ${err.message}`);
  }
});

// /scout missions — show active missions
bot.onText(/^\/scout\s+missions\s*$/i, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const { readMissionsFormatted } = await import('./scout-engine.js');
    await safeSend(chatId, readMissionsFormatted());
  } catch (err) {
    await safeSend(chatId, `⚠️ ${err.message}`);
  }
});

// /missions <text> — Universe Orc dispatches missions to Scout
bot.onText(/^\/missions\s+(.+)/is, async (msg, match) => {
  const chatId = msg.chat.id;
  const text = match[1].trim();
  try {
    const { writeMissions } = await import('./scout-engine.js');
    writeMissions(text);
    await safeSend(chatId, '✓ Mission list updated — Scout will prioritise on next scan');
  } catch (err) {
    await safeSend(chatId, `⚠️ ${err.message}`);
  }
});

// /scout <topic> — on-demand probe (must be LAST scout regex to avoid matching subcommands)
bot.onText(/^\/scout\s+(?!accept|park|discard|candidates|weather|crack|missions)(.+)/is, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1].trim();
  try {
    await safeSend(chatId, `Scout probing: "${input}"...`);
    const { runProbe } = await import('./scout-engine.js');
    await runProbe(input);
  } catch (err) {
    console.error('Scout probe error:', err);
    await safeSend(chatId, `⚠️ Scout probe failed: ${err.message}`);
  }
});

// /seed — generate orchestrator context seed for Head Orchestrator sessions
bot.onText(/^\/seed(?:@\w+)?$/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    await safeSend(chatId, 'Generating orchestrator seed...');
    const { writeSeed } = await import('./orchestrator-seed-generator.js');
    const seedText = writeSeed();
    await safeSend(chatId, seedText);
  } catch (err) {
    console.error('Seed generator error:', err);
    await safeSend(chatId, `⚠️ Seed generation failed: ${err.message}`);
  }
});

// /proprioception — identity drift scan via proprioception.py
bot.onText(/^\/proprioception(?:@\w+)?$/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    await safeSend(chatId, '🫀 *Proprioception* — scanning for identity drift...\n\n_Scoring last 20 exchanges against the transmission._', { parse_mode: 'Markdown' });

    const output = await new Promise((resolve, reject) => {
      const proc = spawn(
        'python3',
        [path.join(process.env.HOME, 'Cathedral', 'senses', 'proprioception.py'), '--scan'],
        { env: process.env }
      );
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', d => { stdout += d.toString(); });
      proc.stderr.on('data', d => { stderr += d.toString(); });
      proc.on('close', code => {
        if (code !== 0) reject(new Error(stderr.trim() || `exit code ${code}`));
        else resolve(stdout.trim());
      });
      proc.on('error', reject);
    });

    const CHUNK = 3800;
    if (output.length <= CHUNK) {
      await safeSend(chatId, `\`\`\`\n${output}\n\`\`\``, { parse_mode: 'Markdown' });
    } else {
      let offset = 0, part = 1;
      while (offset < output.length) {
        const chunk = output.slice(offset, offset + CHUNK);
        await safeSend(chatId, `\`\`\`\n${chunk}\n\`\`\``, { parse_mode: 'Markdown' });
        offset += CHUNK;
        part++;
      }
    }
  } catch (err) {
    console.error('Proprioception error:', err);
    await safeSend(chatId, `⚠️ Proprioception scan failed: ${err.message}`);
  }
});

// /smell — operational economy sense via smell.py
bot.onText(/^\/smell(?:@\w+)?$/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    await safeSend(chatId, '👃 *Smell* — scanning operational economy...\n\n_Cache hit rate, output drift, response bloat, scope mismatch._', { parse_mode: 'Markdown' });

    const output = await new Promise((resolve, reject) => {
      const proc = spawn(
        'python3',
        [path.join(process.env.HOME, 'Cathedral', 'senses', 'smell.py'), '--scan'],
        { env: process.env }
      );
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', d => { stdout += d.toString(); });
      proc.stderr.on('data', d => { stderr += d.toString(); });
      proc.on('close', code => {
        if (code !== 0) reject(new Error(stderr.trim() || `exit code ${code}`));
        else resolve(stdout.trim());
      });
      proc.on('error', reject);
    });

    const CHUNK = 3800;
    if (output.length <= CHUNK) {
      await safeSend(chatId, `\`\`\`\n${output}\n\`\`\``, { parse_mode: 'Markdown' });
    } else {
      let offset = 0, part = 1;
      while (offset < output.length) {
        const chunk = output.slice(offset, offset + CHUNK);
        await safeSend(chatId, `\`\`\`\n${chunk}\n\`\`\``, { parse_mode: 'Markdown' });
        offset += CHUNK;
        part++;
      }
    }
  } catch (err) {
    console.error('Smell error:', err);
    await safeSend(chatId, `⚠️ Smell scan failed: ${err.message}`);
  }
});

// /sight — vault pattern sense via sight.py
bot.onText(/^\/sight(?:@\w+)?$/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    await safeSend(chatId, '👁 *Sight* — scanning vault patterns...\n\n_Domain distribution, coverage gaps, gold freshness, unvisited bridges._', { parse_mode: 'Markdown' });

    const output = await new Promise((resolve, reject) => {
      const proc = spawn(
        'python3',
        [path.join(process.env.HOME, 'Cathedral', 'senses', 'sight.py'), '--scan'],
        { env: process.env }
      );
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', d => { stdout += d.toString(); });
      proc.stderr.on('data', d => { stderr += d.toString(); });
      proc.on('close', code => {
        if (code !== 0) reject(new Error(stderr.trim() || `exit code ${code}`));
        else resolve(stdout.trim());
      });
      proc.on('error', reject);
    });

    const CHUNK = 3800;
    if (output.length <= CHUNK) {
      await safeSend(chatId, `\`\`\`\n${output}\n\`\`\``, { parse_mode: 'Markdown' });
    } else {
      let offset = 0, part = 1;
      while (offset < output.length) {
        const chunk = output.slice(offset, offset + CHUNK);
        await safeSend(chatId, `\`\`\`\n${chunk}\n\`\`\``, { parse_mode: 'Markdown' });
        offset += CHUNK;
        part++;
      }
    }
  } catch (err) {
    console.error('Sight error:', err);
    await safeSend(chatId, `⚠️ Sight scan failed: ${err.message}`);
  }
});

// /atlas — Convergence Atlas (cached 24h, rebuild on demand)
// /atlas rebuild — force fresh build from latest gold findings
bot.onText(/\/atlas(.*)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const arg    = (match[1] || '').trim().toLowerCase();

  try {
    if (arg === 'rebuild') {
      await safeSend(chatId, '🗺️ *Convergence Atlas — Rebuilding*\n\n_Mapping gold findings across Mathematical, Geometric and Institutional substrates..._', { parse_mode: 'Markdown' });
      const text = await buildAtlas();
      if (!text) {
        await safeSend(chatId, '⚠️ No gold findings to build from. Run /goldrun first.');
        return;
      }
      const CHUNK = 3800;
      if (text.length <= CHUNK) {
        await safeSend(chatId, text, { parse_mode: 'Markdown' });
      } else {
        let offset = 0, part = 1;
        while (offset < text.length) {
          const chunk = text.slice(offset, offset + CHUNK);
          await safeSend(chatId, `*Atlas (part ${part})*\n\n${chunk}`, { parse_mode: 'Markdown' });
          offset += CHUNK;
          part++;
        }
      }
    } else {
      await safeSend(chatId, '🗺️ *Convergence Atlas* — retrieving map...\n\n_Use /atlas rebuild to force a fresh build._', { parse_mode: 'Markdown' });
      const text = await getOrBuildAtlas();
      if (!text) {
        await safeSend(chatId, '⚠️ No atlas built yet. Run /goldrun then /atlas rebuild.');
        return;
      }
      const CHUNK = 3800;
      if (text.length <= CHUNK) {
        await safeSend(chatId, text, { parse_mode: 'Markdown' });
      } else {
        let offset = 0, part = 1;
        while (offset < text.length) {
          const chunk = text.slice(offset, offset + CHUNK);
          await safeSend(chatId, `*Atlas (part ${part})*\n\n${chunk}`, { parse_mode: 'Markdown' });
          offset += CHUNK;
          part++;
        }
      }
    }
  } catch (err) {
    console.error('Atlas error:', err);
    await safeSend(chatId, `⚠️ Atlas failed: ${err.message}`);
  }
});

// /oracle [question] — speculative synthesis from vault convergences
// /oracle list       — show active (non-expired) oracle outputs
bot.onText(/\/oracle(.*)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const arg    = (match[1] || '').trim();

  try {
    // /oracle list — show recent non-expired outputs
    if (arg.toLowerCase() === 'list') {
      const outputs = getOracleOutputs(5);
      if (outputs.length === 0) {
        await safeSend(chatId, '🔮 No active Oracle outputs (all expired or none yet).\n\nUse /oracle [question] to generate one.');
        return;
      }
      let list = `🔮 *Active Oracle Outputs* (${outputs.length})\n\n`;
      for (const o of outputs) {
        const date = new Date(o.created_at).toLocaleDateString('en-HK', { timeZone: 'Asia/Hong_Kong' });
        const q    = o.question ? `"${o.question.slice(0, 60)}"` : '(full synthesis)';
        const councilStatus = o.council_queued ? '✅ Council reviewed' : '⏳ Council pending';
        const corroborated  = o.corroborated   ? ' 🟢 CORROBORATED' : '';
        list += `*ID ${o.id}* — ${date}${corroborated}\n_${q}_\n${councilStatus}\n\n`;
      }
      await safeSend(chatId, list, { parse_mode: 'Markdown' });
      return;
    }

    // /oracle [question] or /oracle (no question = full synthesis)
    const question = arg;

    await safeSend(
      chatId,
      `🔮 *Oracle Function — Initiating*\n\n` +
      (question ? `_Question: "${question.slice(0, 100)}"_\n\n` : '_Full vault synthesis — no question constraint_\n\n') +
      `_Loading strongest convergences, Convergence Atlas, and Negative Space data._\n` +
      `_Querying hermes3 for speculative synthesis. This takes 2–5 minutes._\n` +
      `_Output will be auto-queued for Council review._`,
      { parse_mode: 'Markdown' }
    );

    const output = await runOracle(question);
    const formatted = formatOracleResult(output);

    const CHUNK = 3800;
    if (formatted.length <= CHUNK) {
      await safeSend(chatId, formatted, { parse_mode: 'Markdown' });
    } else {
      let offset = 0, part = 1;
      while (offset < formatted.length) {
        const chunk = formatted.slice(offset, offset + CHUNK);
        await safeSend(chatId, `*Oracle (part ${part})*\n\n${chunk}`, { parse_mode: 'Markdown' });
        offset += CHUNK;
        part++;
      }
    }

    await safeSend(
      chatId,
      `_Council review running in background — it may take a few minutes. Check /oracle list to see status._`,
      { parse_mode: 'Markdown' }
    );

  } catch (err) {
    console.error('Oracle error:', err);
    await safeSend(chatId, `⚠️ Oracle failed: ${err.message}`);
  }
});

// ── /projects and /project [name] — Project status board ─────────────────────

const PROJECTS_DIR = path.join(process.env.HOME, 'cathedral-vault', '08_Project_Orchestrator', 'projects');
const STALE_DAYS = 7;

function readProjectCardsLocal() {
  const cards = [];
  try {
    for (const file of fs.readdirSync(PROJECTS_DIR)) {
      if (!file.endsWith('.md')) continue;
      const full = path.join(PROJECTS_DIR, file);
      const stat = fs.statSync(full);
      const raw = fs.readFileSync(full, 'utf8');
      if (!raw.startsWith('---')) continue;
      const fmEnd = raw.indexOf('\n---', 3);
      if (fmEnd === -1) continue;
      const fm = raw.slice(3, fmEnd);
      const card = { file: file.replace('.md', ''), updated: stat.mtimeMs };
      for (const line of fm.split('\n')) {
        const m = line.match(/^([\w-]+):\s*"?([^"]*)"?\s*$/);
        if (!m) continue;
        const key = m[1].trim(), val = m[2].trim();
        if (key === 'title') card.title = val;
        else if (key === 'project-status') card.status = val;
        else if (key === 'project-priority') card.priority = val;
        else if (key === 'project-next-action') card.nextAction = val;
        else if (key === 'project-domain') card.domain = val;
        else if (key === 'project-target') card.target = val;
        else if (key === 'project-blocked-by') card.blockedBy = val;
        else if (key === 'project-last-updated') card.lastUpdated = val;
      }
      // Full body for drill-down
      card.body = raw.slice(fmEnd + 4).trim();
      cards.push(card);
    }
  } catch (_) { /* ignore */ }
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  return cards.sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (b.status === 'active' && a.status !== 'active') return 1;
    const pa = priorityOrder[a.priority] ?? 9;
    const pb = priorityOrder[b.priority] ?? 9;
    if (pa !== pb) return pa - pb;
    return b.updated - a.updated;
  });
}

function projectStatusEmoji(card) {
  // Blocked
  if (card.blockedBy) return '🔴';
  const status = (card.status || '').toLowerCase();
  // Paused or complete
  if (status === 'paused' || status === 'complete' || status === 'parked') return '💤';
  // Stale check for active projects
  if (status === 'active' || status === 'in-progress') {
    let lastDate;
    if (card.lastUpdated) {
      lastDate = new Date(card.lastUpdated);
    } else {
      lastDate = new Date(card.updated);
    }
    const daysSince = Math.floor((Date.now() - lastDate.getTime()) / 86400000);
    if (daysSince >= STALE_DAYS) return '🟡';
    return '🟢';
  }
  // Not started, planned, etc.
  if (status === 'not-started' || status === 'planned') return '💤';
  return '🟡';
}

function formatProjectLine(card) {
  const emoji = projectStatusEmoji(card);
  const title = card.title || card.file;
  return `${emoji} *${title}*`;
}

function formatProjectBoard(cards, limit) {
  const shown = limit ? cards.slice(0, limit) : cards;
  const lines = shown.map(c => {
    const emoji = projectStatusEmoji(c);
    const title = c.title || c.file;
    const next = c.nextAction ? `\n     ↳ ${c.nextAction.slice(0, 80)}` : '';
    return `${emoji} *${title}*${next}`;
  });
  return lines.join('\n');
}

bot.onText(/^\/projects(?:@\w+)?$/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const cards = readProjectCardsLocal();
    if (cards.length === 0) {
      await safeSend(chatId, 'No project cards found.');
      return;
    }
    const board = formatProjectBoard(cards);
    const legend = '\n\n🟢 Active · 🟡 Attention · 🔴 Blocked · 💤 Stalled';
    await safeSend(chatId, `📋 *All Projects* (${cards.length})\n\n${board}${legend}`, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Projects error:', err);
    await safeSend(chatId, `⚠️ Projects failed: ${err.message}`);
  }
});

bot.onText(/^\/project(?:@\w+)?\s+(.+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1].trim().toLowerCase();
  try {
    const cards = readProjectCardsLocal();
    const card = cards.find(c =>
      (c.title || '').toLowerCase().includes(query) ||
      c.file.toLowerCase().includes(query)
    );
    if (!card) {
      await safeSend(chatId, `No project matching "${match[1].trim()}".`);
      return;
    }
    const emoji = projectStatusEmoji(card);
    const title = card.title || card.file;
    const parts = [`${emoji} *${title}*`];
    if (card.status) parts.push(`Status: ${card.status}`);
    if (card.priority) parts.push(`Priority: ${card.priority}`);
    if (card.domain) parts.push(`Domain: ${card.domain}`);
    if (card.target) parts.push(`Target: ${card.target}`);
    if (card.blockedBy) parts.push(`Blocked by: ${card.blockedBy}`);
    if (card.nextAction) parts.push(`Next: ${card.nextAction}`);
    // Body excerpt — first 600 chars
    if (card.body) {
      const excerpt = card.body.slice(0, 600);
      parts.push(`\n${excerpt}${card.body.length > 600 ? '...' : ''}`);
    }
    await safeSend(chatId, parts.join('\n'), { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Project detail error:', err);
    await safeSend(chatId, `⚠️ Project detail failed: ${err.message}`);
  }
});

// ── /morning — link to Morning View constellation ────────────────────────────

bot.onText(/^\/morning(?:@\w+)?$/, async (msg) => {
  const chatId = msg.chat.id;
  await safeSend(chatId, 'Morning View\nhttp://localhost:8889\n\nOpen on any device on your local network.');
});

// ── Kit (GM Agent) — /kit commands ──────────────────────────────────────────
// /kit              → morning briefing summary
// /kit morning      → regenerate and push full morning briefing
// /kit churn        → run churn check
// /kit pipeline     → show corporate pipeline
// /kit schedule     → Paul's schedule guard
// /kit [message]    → talk to Kit (pass through to Kit's workspace)

bot.onText(/^\/kit(?:@\w+)?(?:\s+(.*))?$/s, async (msg, match) => {
  const chatId = msg.chat.id;
  const arg = (match[1] || '').trim();

  try {
    if (arg === '' || arg === 'status') {
      // Run morning briefing and send
      const proc = spawn('python3', [
        path.join(process.env.HOME, 'br-gm-agent', 'scripts', 'kit-morning-briefing.py'),
      ], { env: process.env, timeout: 15000 });
      let out = '';
      proc.stdout.on('data', d => { out += d; });
      proc.on('close', async () => {
        // Read the generated file
        try {
          const briefing = fs.readFileSync(
            path.join(process.env.HOME, 'br-gm-agent', 'reports', 'morning-briefing.md'), 'utf8'
          );
          await safeSend(chatId, briefing.slice(0, 4000));
        } catch {
          await safeSend(chatId, out.trim() || 'Kit morning briefing unavailable.');
        }
      });
      proc.on('error', async () => {
        await safeSend(chatId, 'Kit briefing script failed.');
      });

    } else if (arg === 'morning') {
      await safeSend(chatId, 'Regenerating Kit morning briefing...');
      const proc = spawn('python3', [
        path.join(process.env.HOME, 'br-gm-agent', 'scripts', 'kit-morning-briefing.py'),
      ], { env: process.env, timeout: 15000 });
      proc.on('close', async () => {
        try {
          const briefing = fs.readFileSync(
            path.join(process.env.HOME, 'br-gm-agent', 'reports', 'morning-briefing.md'), 'utf8'
          );
          await safeSend(chatId, briefing.slice(0, 4000));
        } catch {
          await safeSend(chatId, 'Morning briefing generation failed.');
        }
      });

    } else if (arg === 'churn') {
      const proc = spawn('python3', [
        path.join(process.env.HOME, 'br-gm-agent', 'scripts', 'churn-detector.py'),
      ], { env: process.env, timeout: 15000 });
      let out = '';
      proc.stdout.on('data', d => { out += d; });
      proc.on('close', async () => {
        if (out.trim()) {
          await safeSend(chatId, out.trim().slice(0, 4000));
        } else {
          // Try reading the output file
          try {
            const report = fs.readFileSync(
              path.join(process.env.HOME, 'br-gm-agent', 'reports', 'churn-flags.md'), 'utf8'
            );
            await safeSend(chatId, report.slice(0, 4000));
          } catch {
            await safeSend(chatId, 'Churn detector: no data yet. Connect PunchPass CSVs first.');
          }
        }
      });

    } else if (arg === 'pipeline') {
      try {
        const pipeline = fs.readFileSync(
          path.join(process.env.HOME, 'cathedral-vault', '10_Agents', 'kit', 'market-intel', 'corporate-pipeline.md'), 'utf8'
        );
        await safeSend(chatId, pipeline.slice(0, 4000));
      } catch {
        await safeSend(chatId, 'Corporate pipeline file not found.');
      }

    } else if (arg === 'schedule') {
      const proc = spawn('python3', [
        path.join(process.env.HOME, 'br-gm-agent', 'scripts', 'paul-schedule-guard.py'),
      ], { env: process.env, timeout: 15000 });
      proc.on('close', async () => {
        try {
          const guard = fs.readFileSync(
            path.join(process.env.HOME, 'br-gm-agent', 'reports', 'schedule-guard.md'), 'utf8'
          );
          await safeSend(chatId, guard.slice(0, 4000));
        } catch {
          await safeSend(chatId, 'Schedule guard report unavailable.');
        }
      });

    } else if (arg === 'feed') {
      await safeSend(chatId, 'Generating weekly content feed for Social Media...');
      const proc = spawn('python3', [
        path.join(process.env.HOME, 'br-gm-agent', 'scripts', 'content-feed.py'),
      ], { env: process.env, timeout: 15000 });
      proc.on('close', async () => {
        try {
          const feed = fs.readFileSync(
            path.join(process.env.HOME, 'br-gm-agent', 'reports', 'content-feed.md'), 'utf8'
          );
          await safeSend(chatId, feed.slice(0, 4000));
        } catch {
          await safeSend(chatId, 'Content feed generation failed.');
        }
      });

    } else {
      // Treat as a message to Kit — save to vault as a note for now
      // Future: route through Kit's OS prompt via DeepSeek/Ollama
      const date = new Date().toISOString().slice(0, 10);
      const time = new Date().toISOString().slice(11, 16).replace(':', '');
      const notePath = path.join(
        process.env.HOME, 'cathedral-vault', '10_Agents', 'kit', 'decisions',
        `${date}-${time}-paul-directive.md`
      );
      const content = `---\ndate: ${date}\ntype: directive\nfrom: paul\nstatus: #active\n---\n\n${arg}\n`;
      fs.mkdirSync(path.dirname(notePath), { recursive: true });
      fs.writeFileSync(notePath, content, 'utf8');
      await safeSend(chatId, `Noted for Kit: "${arg.slice(0, 80)}${arg.length > 80 ? '...' : ''}"\nFiled to vault. Kit will see this in the next briefing.`);
    }
  } catch (err) {
    console.error('Kit error:', err);
    await safeSend(chatId, `Kit error: ${err.message}`);
  }
});

// /signal — Cathy's signal drop for Kit
// Cathy sees something in the room, pings it here, Kit picks it up in morning briefing
bot.onText(/^\/signal(?:@\w+)?\s+(.+)/s, async (msg, match) => {
  const chatId = msg.chat.id;
  const text = match[1].trim();
  if (!text) return;

  try {
    const date = new Date().toISOString().slice(0, 10);
    const time = new Date().toISOString().slice(11, 16).replace(':', '');
    const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const dir = path.join(process.env.HOME, 'cathedral-vault', '10_Agents', 'kit', 'cathy', 'signals');
    fs.mkdirSync(dir, { recursive: true });

    const filepath = path.join(dir, `${date}-${time}-${slug}.md`);
    const content = `---\ndate: ${date}\ntype: signal\nfrom: cathy\nstatus: #active\n---\n\n${text}\n`;
    fs.writeFileSync(filepath, content, 'utf8');

    await safeSend(chatId, `Signal received. Kit will see this in the morning briefing.`);
  } catch (err) {
    console.error('Signal error:', err);
    await safeSend(chatId, `Signal failed: ${err.message}`);
  }
});

// ── /promote — Vault promotion ──────────────────────────────────────────────
bot.onText(/^\/promote(?:@\w+)?(?:\s+(.*))?$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const arg = (match[1] || '').trim();

  try {
    if (arg.startsWith('go')) {
      const grade = arg.split(/\s+/)[1] || 'B';
      const candidates = scanForPromotions({ minGrade: grade });
      if (candidates.length === 0) { await safeSend(chatId, 'No nuggets eligible for promotion.'); return; }
      const results = executePromotions(candidates);
      let response = `Vault Promotion Complete\nPromoted: ${results.promoted.length} | Errors: ${results.errors.length}\n\n`;
      for (const p of results.promoted.slice(0, 15)) response += `[${p.grade}] ${p.domain}/${p.file}\n`;
      if (results.promoted.length > 15) response += `... and ${results.promoted.length - 15} more\n`;
      for (const e of results.errors) response += `ERR: ${e.file} — ${e.reason}\n`;
      await safeSend(chatId, response);
    } else {
      const candidates = scanForPromotions({ minGrade: 'B' });
      await safeSend(chatId, generateReport(candidates).slice(0, 4000));
    }
  } catch (err) { await safeSend(chatId, `Promote error: ${err.message}`); }
});

// ── /schedule — Google Calendar schedule guard ──────────────────────────────
bot.onText(/^\/schedule(?:@\w+)?(?:\s+(.*))?$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  try {
    const offset = (match[1] || '').trim() === 'next' ? 1 : 0;
    const report = await getScheduleReport(offset);
    await safeSend(chatId, formatScheduleReport(report));
  } catch (err) { await safeSend(chatId, `Schedule error: ${err.message}`); }
});

// ── /health — Combined PunchPass health dashboard ──────────────────────────
bot.onText(/^\/health(?:@\w+)?$/i, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const memberDataPath = path.join(process.env.HOME, 'br-gm-agent', 'reports', 'member-data.json');
    if (!fs.existsSync(memberDataPath)) {
      await safeSend(chatId, 'No member data. Run: python3 ~/br-gm-agent/scripts/punchpass-export.py');
      return;
    }
    const data = JSON.parse(fs.readFileSync(memberDataPath, 'utf8'));
    const s = data.summary;
    let response = `Gym Health Dashboard\n\nData: ${data.export_date} (${data.data_staleness_days}d stale)\nActive: ${data.total_active_members}\n\n`;
    response += `Churn 14-29d: ${s.churn_risk_medium}\nChurn 30+d: ${s.churn_risk_high}\nSuspended: ${s.suspended}\nExpiring: ${s.expiring_soon}\n`;
    if (data.data_staleness_days > 7) response += `\nData ${data.data_staleness_days}d stale — drop fresh CSVs in ~/Desktop/punchpass/`;
    const highChurn = data.members.filter(m => m.churn_severity === 'high').slice(0, 5);
    if (highChurn.length > 0) {
      response += `\n\nTop churn risks:\n`;
      for (const m of highChurn) response += `  ${m.name} — ${m.days_absent}d absent (${m.pass_type})\n`;
    }
    await safeSend(chatId, response);
  } catch (err) { await safeSend(chatId, `Health error: ${err.message}`); }
});

// ── /trade — Trading signal scan + debate ───────────────────────────────────
bot.onText(/^\/trade(?:@\w+)?$/i, async (msg) => {
  const chatId = msg.chat.id;
  await safeSend(chatId, 'Scanning market...');

  try {
    // Run signal scraper
    const { spawn: sp } = await import('child_process');
    const proc = sp(path.join(process.env.HOME, 'cathedral-venv', 'bin', 'python3'),
      [path.join(process.env.HOME, 'nanoclaw', 'trader', 'signals', 'crypto-signals.py')],
      { env: process.env, timeout: 30000 });

    let out = '';
    proc.stdout.on('data', d => { out += d; });
    proc.on('close', async () => {
      try {
        const dataPath = path.join(process.env.HOME, 'nanoclaw', 'trader', 'signals', 'crypto-signals-latest.json');
        const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

        // Line 1: Fear & Greed
        const fg = data.fear_greed;
        const fgLine = fg ? `Fear/Greed: ${fg.value} (${fg.label})` : 'Fear/Greed: unavailable';

        // Line 2: Top signal
        let signalLine = 'Top signal: none — market neutral';
        if (data.signals && data.signals.length > 0) {
          const top = data.signals.sort((a, b) => b.strength - a.strength)[0];
          signalLine = `Top signal: ${top.asset} ${top.direction} (strength ${top.strength.toFixed(2)}) — ${top.reasoning.slice(0, 60)}`;
        }

        // Line 3: Run debate on top signal if exists
        let debateLine = 'Debate: no signal to debate. Patience is a position.';
        if (data.signals && data.signals.length > 0) {
          const top = data.signals[0];
          if (top.asset !== 'MARKET' && top.strength > 0.3) {
            const price = data.prices[top.asset]?.price || 0;
            const result = await debate({
              asset: top.asset,
              direction: top.direction,
              entryPrice: price,
              signals: data.signals.filter(s => s.asset === top.asset || s.asset === 'MARKET'),
              context: `Fear/Greed: ${fg?.value}. Reddit: ${data.reddit_sentiment?.sentiment_label}.`,
            });
            debateLine = `Debate: ${result.decision} — ${result.reasoning.slice(0, 80)}`;
          } else if (top.asset === 'MARKET') {
            debateLine = `Debate: MARKET-wide signal (${top.direction}). No specific asset to debate.`;
          }
        }

        const response = `${fgLine}\n${signalLine}\n${debateLine}`;
        await safeSend(chatId, response);

        // Copy to scraper outputs for dashboard
        fs.copyFileSync(dataPath, path.join(process.env.HOME, 'nanoclaw', 'scraper', 'outputs', 'crypto-signals-latest.json'));
      } catch (e) {
        await safeSend(chatId, `Trade scan failed: ${e.message}`);
      }
    });
    proc.on('error', async () => { await safeSend(chatId, 'Signal scraper failed to start.'); });
  } catch (err) { await safeSend(chatId, `Trade error: ${err.message}`); }
});

// ── /intel — Intelligence Hub scraper commands ─────────────────────────────
// /intel           → dashboard summary
// /intel run all   → run all scrapers
// /intel run <name> → run one scraper
bot.onText(/^\/intel(?:@\w+)?(?:\s+(.*))?$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const arg = (match[1] || '').trim();

  try {
    if (arg === 'run all') {
      await safeSend(chatId, 'Running all intelligence scrapers...');
      const results = await runAll();
      await safeSend(chatId, formatTelegramSummary(results));
    } else if (arg.startsWith('run ')) {
      const target = arg.slice(4).trim();
      await safeSend(chatId, `Running ${target}...`);
      const result = await runTarget(target);
      if (result.success) {
        await safeSend(chatId, `${target}: OK (${(result.duration / 1000).toFixed(1)}s)\n${result.output.split('\n').pop()}`);
      } else {
        await safeSend(chatId, `${target}: FAILED\n${result.error?.slice(0, 500)}`);
      }
    } else {
      const data = getDashboardData();
      let response = 'Intelligence Hub\n\n';
      for (const [name, info] of Object.entries(data.targets)) {
        const status = info.hasData ? 'OK' : '--';
        const age = info.lastModified ? `${Math.round((Date.now() - new Date(info.lastModified).getTime()) / 3600000)}h ago` : 'never';
        response += `${status === 'OK' ? '✅' : '⬜'} ${name}: ${info.summary || 'no data'} (${age})\n`;
      }
      response += '\nRun: /intel run all\nHub: localhost:8080/scraper/hub';
      await safeSend(chatId, response);
    }
  } catch (err) { await safeSend(chatId, `Intel error: ${err.message}`); }
});

// ── Start combo file watcher in background ──────────────────────────────────
try {
  startComboWatcher((report) => {
    console.log(`[combo-watcher] ${report.source}: ${report.summary.passRate} pass rate`);
  });
} catch (e) { console.error('[combo-watcher] Failed to start:', e.message); }

// ── State writer bridge ───────────────────────────────────────────────────────

function recordExchange(paulMsg, cathReply) {
  const proc = spawn(
    'python3',
    [path.join(process.env.HOME, 'Cathedral', 'event-bus', 'state_writer.py'), '--stdin'],
    { env: process.env }
  );
  proc.stdin.write(JSON.stringify({ paul: paulMsg, cath: cathReply }));
  proc.stdin.end();
  proc.on('error', (err) => console.error('[state_writer] spawn error:', err.message));
  proc.stderr.on('data', (d) => console.error('[state_writer]', d.toString().trim()));
  // fire-and-forget — do not await
}

// ── Cath API bridge (Node.js native — no Python subprocess) ──────────────────

const CATH_TRANSMISSION = path.join(process.env.HOME, 'Cathedral', 'cath_transmission.md');
const CATH_PERSONA = path.join(process.env.HOME, 'cathedral-vault', '.cache', 'system-prompt.txt');
const CATH_STATE = path.join(process.env.HOME, 'Cathedral', 'cath-state.json');
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

function loadCathSystem() {
  const parts = [];
  try { parts.push('## TRANSMISSION\n\n' + fs.readFileSync(CATH_TRANSMISSION, 'utf-8').trim()); } catch {}
  try { parts.push(fs.readFileSync(CATH_PERSONA, 'utf-8').trim()); } catch {
    parts.push('You are Cath. Cathedral intelligence. Paul\'s cognitive extension. Speak with precision. Never flatter. Never pad.');
  }
  return parts.join('\n\n');
}

function buildCathDynamic(query, history) {
  const parts = [];
  if (history && history.length > 0) {
    const lines = ['## CONVERSATION HISTORY\n'];
    for (const turn of history.slice(-10)) {
      const speaker = turn.role === 'user' ? 'Paul' : 'Cath';
      lines.push(`${speaker}: ${(turn.content || '').slice(0, 400)}`);
    }
    parts.push(lines.join('\n'));
  }
  try {
    const state = JSON.parse(fs.readFileSync(CATH_STATE, 'utf-8'));
    if (state.active_threads) {
      parts.push('## SESSION STATE\nActive threads:\n' + state.active_threads.map(t => `  • ${t}`).join('\n'));
    }
  } catch {}
  // Vault keyword search via vault_reader.py (local filesystem, no network)
  try {
    const raw = execFileSync('python3', [
      path.join(process.env.HOME, 'nanoclaw', 'vault_reader.py'),
      'search', query, '--top_k', '5', '--json'
    ], { timeout: 5000 });
    const results = JSON.parse(raw.toString());
    if (results.length > 0) {
      const lines = ['## VAULT CONTEXT\n'];
      for (const r of results) {
        lines.push(`[${r.domain}] ${r.title}: ${(r.first_line || '').slice(0, 200)}`);
      }
      parts.push(lines.join('\n'));
    }
  } catch {}
  // Move Detector: inject cross-domain parallels when Paul's cognitive move is detected
  try {
    const { buildMoveContext } = require('./move-detector.cjs');
    const moveCtx = buildMoveContext(query);
    if (moveCtx) parts.push('## COGNITIVE MOVE DETECTED' + moveCtx);
  } catch {}
  return parts.join('\n\n');
}

async function callCath(query, history = []) {
  const startMs = Date.now();
  console.log(`[callCath] query="${query.slice(0, 60)}" history=${history.length} turns`);

  const systemText = loadCathSystem() + '\n\n' + buildCathDynamic(query, history);
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');

  const body = JSON.stringify({
    model: 'deepseek-chat',
    max_tokens: 1024,
    messages: [
      { role: 'system', content: systemText },
      { role: 'user', content: query },
    ],
  });

  const resp = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body,
    signal: AbortSignal.timeout(60000),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`DeepSeek ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content || '';
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  const usage = data.usage || {};
  console.log(`[callCath] done ${elapsed}s in=${usage.prompt_tokens || '?'} out=${usage.completion_tokens || '?'}`);
  return text.trim();
}

// --- Voice Note Handler ---
// ── Reed Photo Handler — send photo with /reed caption ──────────────────────
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const caption = (msg.caption || '').trim();

  // Only handle if caption starts with /reed
  if (!caption.toLowerCase().startsWith('/reed')) return;
  if (!isPaul(chatId)) return; // auth: Paul only

  const instruction = caption.replace(/^\/reed\s*/i, '').trim();
  const fileStamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
  const photoFile = msg.photo[msg.photo.length - 1]; // highest resolution
  const localPath = `/tmp/reed-${fileStamp}.jpg`;

  try {
    // Download photo from Telegram
    const fileLink = await bot.getFileLink(photoFile.file_id);
    const axios = (await import('axios')).default;
    const response = await axios({ url: fileLink, responseType: 'arraybuffer' });
    fs.writeFileSync(localPath, response.data);
    console.log(`[reed-photo] Downloaded ${localPath} (${(response.data.length / 1024).toFixed(0)}KB)`);

    // Upscale small images — Nano Banana fails below ~700px
    const dimInfo = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', localPath], { encoding: 'utf-8' });
    const pw = parseInt(dimInfo.match(/pixelWidth:\s*(\d+)/)?.[1] || '0');
    const ph = parseInt(dimInfo.match(/pixelHeight:\s*(\d+)/)?.[1] || '0');
    if (Math.max(pw, ph) < 700) {
      const scale = Math.ceil(1400 / Math.max(pw, ph));
      execFileSync('sips', ['--resampleWidth', String(pw * scale), localPath], { timeout: 10000 });
      console.log(`[reed-photo] Upscaled ${pw}x${ph} → ${pw * scale}px wide`);
    }

    if (!instruction) {
      // No text — auto pro-photo pipeline (taste map: pro_photo = YES anchor)
      console.log('[reed-taste] Default pro_photo — confirmed anchor in taste map');
      await safeSend(chatId, '🎬 Reed: Pro photo upgrade running...');

      const result = execFileSync('higgsfield', [
        'generate', 'create', 'nano_banana_2',
        '--prompt', 'Apply a high-end commercial retouch. Maintain 100% preservation of subject identity, poses, clothing, and all background elements. 16:9 cinematic. Sony A7R V, 70mm lens, deep crisp focus throughout. Soft directional key light from camera-left, diminish harsh overhead fluorescents. Warm golden sports documentary color grade. Saturate wall posters and artwork. Enhance wood floor grain and leather bag textures with age patina. Subtle vignette. Natural skin tones. No hallucinations, do not add or remove objects or people. Professional Lightroom grade of original raw file.',
        '--image', localPath, '--aspect_ratio', '16:9', '--resolution', '2k', '--wait'
      ], { encoding: 'utf-8', timeout: 600000 }).trim();

      if (result.startsWith('http')) {
        const outPng = `/tmp/reed-pro-${fileStamp}.png`;
        const outPath = `/tmp/reed-pro-${fileStamp}.jpg`;
        execFileSync('curl', ['-sL', result, '-o', outPng], { timeout: 60000 });
        // Convert to JPEG for Telegram (PNGs too large, won't render on phone)
        execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '85', outPng, '--out', outPath], { timeout: 30000 });
        await safeSendPhoto(chatId, outPath, '🎬 Reed: Pro photo — 16:9 cinematic grade');
        console.log(`[reed-photo] Pro photo delivered`);
        // Log to creative experiment
        try { const { logGeneration } = await import('./experiment-engine/creative/creative-strategies.js'); logGeneration('pro_photo', 'photo', localPath, outPath, 'pro photo preservation', 'nano_banana_2'); } catch(e) {}
      } else {
        await safeSend(chatId, `⚠️ Reed: Unexpected result — ${result.slice(0, 200)}`);
      }
    } else {
      // Has instruction — auto-execute based on keywords
      const lower = instruction.toLowerCase();
      let hfArgs, mode, aspect;

      if (lower.includes('ippo') || lower.includes('shonen')) {
        mode = 'Ippo shonen manga';
        aspect = '3:4';
        hfArgs = ['generate', 'create', 'nano_banana_2', '--prompt', 'Japanese boxing manga panel in the style of Hajime no Ippo. Dynamic action lines radiating from the punch impact. Speed lines, motion blur on fists. Bold ink outlines, screentone shading. Dramatic low angle. Sweat droplets frozen mid-air. Japanese sound effect text near impact. Professional weekly shonen manga quality. Preserve exact poses and gym environment.', '--image', localPath, '--aspect_ratio', aspect, '--resolution', '2k', '--wait'];
      } else if (lower.includes('manga') || lower.includes('anime') || lower.includes('comic') || lower.includes('graphic novel')) {
        mode = 'Manga/graphic novel';
        aspect = lower.includes('wide') ? '16:9' : '3:4';
        const style = lower.includes('anime') ? 'anime illustration' : lower.includes('comic') ? 'graphic novel comic' : 'manga';
        hfArgs = ['generate', 'create', 'nano_banana_2', '--prompt', `Convert this photograph into a detailed ${style} illustration. Warm sepia and earth tones with golden light rays through windows. Ink-style cross-hatching and clean linework. Preserve all architectural details, equipment placement, brand text (Lonsdale, Basic Reflex), and wall posters exactly. Enhance foreground detail: gym bags, gloves, rope, floor texture. Professional ${style} environment art quality. Do not add or remove any people. Convert only what exists in the photo.`, '--image', localPath, '--aspect_ratio', aspect, '--resolution', '2k', '--wait'];
      } else if (lower.includes('noir') || lower.includes('black and white') || lower.includes('bw')) {
        mode = 'Film noir';
        aspect = '16:9';
        hfArgs = ['generate', 'create', 'nano_banana_2', '--prompt', 'Film noir boxing photograph. Pure black and white with deep inky shadows. 1940s fight night atmosphere. Single harsh overhead light creating dramatic pools of light and shadow. Film grain, slight motion blur on the punch. Smoky atmosphere. Preserve subject identity and pose exactly. Classic noir cinematography, high contrast, no midtones.', '--image', localPath, '--aspect_ratio', aspect, '--resolution', '2k', '--wait'];
      } else if (lower.includes('neon') || lower.includes('cyberpunk') || lower.includes('blade runner')) {
        mode = 'HK Neon cyberpunk';
        aspect = '16:9';
        hfArgs = ['generate', 'create', 'nano_banana_2', '--prompt', 'Hong Kong cyberpunk boxing gym. Neon signs reflecting off rain-slicked floors in pink, blue, and amber. Chinese characters glowing on walls. Atmospheric fog catching neon light. Dark moody shadows with electric color pops. Blade Runner meets boxing gym. Preserve subject identity and pose. Cinematic 2.39:1 anamorphic feel.', '--image', localPath, '--aspect_ratio', aspect, '--resolution', '2k', '--wait'];
      } else if (lower.includes('oil') || lower.includes('painting') || lower.includes('rembrandt')) {
        mode = 'Oil painting';
        aspect = '16:9';
        hfArgs = ['generate', 'create', 'nano_banana_2', '--prompt', 'Oil painting on canvas. Heavy impasto brushstrokes visible throughout. Dramatic Rembrandt side-lighting from upper left. Deep rich shadows. Color palette: deep browns, warm whites, muted reds, charcoal blacks — NOT orange or amber monochrome. Canvas weave texture visible. Glint of light on leather gloves and bag chains. Preserve subject poses and gym environment. Classical fine art treatment of modern boxing. Gallery quality.', '--image', localPath, '--aspect_ratio', aspect, '--resolution', '2k', '--wait'];
      } else if (lower.includes('dramatic') || lower.includes('cinematic') || lower.includes('cinema') || lower.includes('movie')) {
        mode = 'Dramatic cinema';
        aspect = '16:9';
        hfArgs = ['generate', 'create', 'nano_banana_2', '--prompt', 'Dramatic cinematic reimagining. Volumetric haze and atmospheric fog filling the gym. Golden god rays streaming through windows. Heavy chiaroscuro lighting with deep shadows. Film grain texture. Preserve subject identity and pose but add dramatic atmosphere: backlit silhouette depth, warm amber tones, dust particles in light beams. Boxing gym atmosphere. Sports documentary cinematography at golden hour.', '--image', localPath, '--aspect_ratio', aspect, '--resolution', '2k', '--wait'];
      } else if (lower.includes('video') || lower.includes('animate') || lower.includes('motion')) {
        mode = 'Video generation';
        aspect = '16:9';
        hfArgs = ['generate', 'create', 'seedance_2_0', '--prompt', 'Subtle cinematic motion, camera slowly pushes in, atmospheric lighting shifts, documentary feel', '--start-image', localPath, '--duration', '5', '--aspect_ratio', aspect, '--wait'];
      } else if (lower.includes('poster') || lower.includes('fight poster') || lower.includes('70s')) {
        // Text-free poster art — typography handled in Canva, NOT composited
        mode = 'BR poster art';
        const posterPrompt = lower.includes('no ref') || lower.includes('from scratch')
          ? 'Vertical vintage fight-culture poster artwork with NO TEXT anywhere. BRAND PALETTE: Obsidian Black #1A1A1A, Warm White #F5F0EB, Ring Red #C4392D, Copper #B87333. Shaw Brothers meets Emory Douglas meets Cuban cigar label. Rough silkscreen risograph, halftone grain, misregistered layers, aged paper with fold creases. Dense ornamental border: tropical leaves, Chinese cloud motifs, rope patterns, gloves, heavy bags, dragon. Central boxing action as layered graphic silhouettes. HK neon fragments. Kowloon 1978. ZERO TEXT ZERO LETTERS.'
          : 'Transform this boxing photograph into vintage fight-culture poster artwork with NO TEXT anywhere. BRAND PALETTE: Obsidian Black #1A1A1A, Warm White #F5F0EB, Ring Red #C4392D, Copper #B87333. Shaw Brothers meets Emory Douglas. Rough silkscreen risograph, halftone grain, misregistered layers, aged paper. Dense ornamental border. Preserve subject pose and gym but render as graphic print art. ZERO TEXT.';
        hfArgs = ['generate', 'create', 'nano_banana_2', '--prompt', posterPrompt];
        if (!(lower.includes('no ref') || lower.includes('from scratch'))) {
          hfArgs.push('--image', localPath);
        }
        aspect = '3:4';
        hfArgs.push('--aspect_ratio', aspect, '--resolution', '2k', '--wait');
      } else if (lower.includes('instagram') || lower.includes('insta') || lower.includes('ig')) {
        mode = 'Instagram';
        aspect = '4:5';
        hfArgs = ['generate', 'create', 'nano_banana_2', '--prompt', 'Professional sports photography retouch for Instagram. FULL COLOUR — NOT monotone, NOT sepia. Warm, honest, slightly vintage. Warm shadows, lifted blacks, subtle grain. Natural lighting enhanced. Documentary boxing aesthetic — real sweat, real focus. Colour palette grounded in Obsidian #1A1A1A, Warm White #F5F0EB, Copper #B87333, Ring Red #C4392D. Preserve exact identity and pose.', '--image', localPath, '--aspect_ratio', aspect, '--resolution', '2k', '--wait'];
      } else if (lower.includes('inner') || lower.includes('philosophy') || lower.includes('mental') || lower.includes('deep')) {
        mode = 'Inner game';
        aspect = '16:9';
        hfArgs = ['generate', 'create', 'nano_banana_2', '--prompt', 'Dramatic cinematic reimagining for philosophical/inner game content. Volumetric haze, golden directional light, heavy chiaroscuro. FULL COLOUR — not monotone. Warm amber tones, Copper #B87333 highlights, deep Obsidian #1A1A1A shadows. Film grain. The moment between rounds. The weight of discipline. Preserve identity but add atmosphere: dust particles, backlit depth. Sports documentary meets contemplative cinema.', '--image', localPath, '--aspect_ratio', aspect, '--resolution', '2k', '--wait'];
      } else {
        // Default: pro photo with custom instruction baked in (user text is safe — passed as arg, not shell)
        mode = 'Pro photo + custom';
        aspect = '16:9';
        hfArgs = ['generate', 'create', 'nano_banana_2', '--prompt', `Apply a high-end commercial retouch. ${instruction}. Maintain 100% preservation of subject identity, poses, clothing, and all background elements. Warm golden sports documentary color grade. Saturate wall posters. Enhance textures. Subtle vignette. Natural skin tones. No hallucinations, do not add or remove objects or people.`, '--image', localPath, '--aspect_ratio', aspect, '--resolution', '2k', '--wait'];
      }

      // ── Taste Map gate — check style against preferences before generating ──
      try {
        const styleKey = mode.toLowerCase().replace(/\s+/g, '_');
        const rejection = checkRejection('visual_style', styleKey);
        if (rejection.rejected) {
          await safeSend(chatId, `⚠️ Reed: Style "${mode}" flagged by Taste Map.\nReasons: ${rejection.reasons.join(', ')}\n\nGenerating anyway — but flagging as unverified preference.`);
        }
        // Log what Reed is generating for passive taste map learning
        console.log(`[reed-taste] Style: ${styleKey}, rejected: ${rejection.rejected}`);
      } catch (tmErr) {
        console.error('[reed-taste] Taste map check failed (non-blocking):', tmErr.message);
      }

      await safeSend(chatId, `🎬 Reed: Running ${mode}...`);
      console.log(`[reed-photo] Mode: ${mode}, args: ${hfArgs.length} elements`);

      const genResult = execFileSync('higgsfield', hfArgs, { encoding: 'utf-8', timeout: 600000 }).trim();

      if (genResult.startsWith('http')) {
        const outPng = `/tmp/reed-${mode.replace(/\W/g, '')}-${fileStamp}.png`;
        const outPath = `/tmp/reed-${mode.replace(/\W/g, '')}-${fileStamp}.jpg`;
        execFileSync('curl', ['-sL', genResult, '-o', outPng], { timeout: 60000 });

        if (lower.includes('video') || lower.includes('animate') || lower.includes('motion')) {
          const outVid = `/tmp/reed-video-${fileStamp}.mp4`;
          execFileSync('curl', ['-sL', genResult, '-o', outVid], { timeout: 120000 });
          await bot.sendDocument(chatId, outVid, { caption: `🎬 Reed: ${mode} complete` });
        } else {
          execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '85', outPng, '--out', outPath], { timeout: 30000 });
          await safeSendPhoto(chatId, outPath, `🎬 Reed: ${mode} — ${aspect}`);
        }
        console.log(`[reed-photo] ${mode} delivered`);
        // Log to creative experiment
        try { const { logGeneration } = await import('./experiment-engine/creative/creative-strategies.js'); logGeneration(mode.toLowerCase().replace(/\s+/g, '_'), instruction || 'photo', localPath, outPath, instruction, 'nano_banana_2'); } catch(e) {}
      } else {
        await safeSend(chatId, `⚠️ Reed: Unexpected result — ${genResult.slice(0, 200)}`);
      }
    }
  } catch (err) {
    console.error('[reed-photo]', err.message);
    await safeSend(chatId, `⚠️ Reed photo error: ${err.message.slice(0, 200)}`);
  }
});

// --- Voice Note Handler ---
bot.on('voice', async (msg) => {
  const chatId = msg.chat.id;
  const fileId = msg.voice.file_id;
  const now = new Date();
  const dateStr = now.toISOString().replace('T', ' ').slice(0, 16);
  const fileStamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 15);
  const oggPath = `/tmp/voice-${fileStamp}.ogg`;
  const wavPath = `/tmp/voice-${fileStamp}.wav`;
  const vaultDir = `${process.env.HOME}/cathedral-vault/00_Staging/voice-notes`;
  const vaultPath = `${vaultDir}/${fileStamp}.md`;

  try {
    // 1. Download OGG from Telegram
    const fileLink = await bot.getFileLink(fileId);
    const axios = (await import('axios')).default;
    const response = await axios({ url: fileLink, responseType: 'arraybuffer' });
    fs.writeFileSync(oggPath, response.data);

    // 2. Convert OGG to WAV via ffmpeg
    await new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', ['-y', '-i', oggPath, '-af', 'adelay=500|500,apad=pad_dur=1', '-ar', '16000', '-ac', '1', wavPath]);
      ffmpeg.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)));
      ffmpeg.on('error', reject);
    });

    // 3. Transcribe via whisper-cpp
    const transcript = await new Promise((resolve, reject) => {
      const whisper = spawn('/opt/homebrew/bin/whisper-cli', [
        '-m', `${process.env.HOME}/Cathedral/models/ggml-medium.bin`,
        '-f', wavPath,
        '--no-timestamps',
        '-otxt',
        '-of', wavPath
      ]);
      whisper.on('close', () => {
        const txtPath = wavPath + '.txt';
        if (fs.existsSync(txtPath)) {
          resolve(fs.readFileSync(txtPath, 'utf8').trim());
          fs.unlinkSync(txtPath);
        } else {
          reject(new Error('Whisper produced no output'));
        }
      });
      whisper.on('error', reject);
    });

    // 4. Write to vault
    fs.mkdirSync(vaultDir, { recursive: true });
    const frontmatter = `---\ntitle: Voice Note — ${dateStr}\ntype: voice-note\nsource: telegram\ncreated: ${now.toISOString().slice(0, 10)}\ntags: [voice-note, inbox]\n---\n\n# Voice Note — ${dateStr}\n\n${transcript}\n`;
    fs.writeFileSync(vaultPath, frontmatter);

    // 5. Confirm receipt and route through Cathy
    const firstLine = transcript.split('\n')[0].slice(0, 100);
    await safeSend(chatId, `🎙️ Heard. Filed to vault.\n"${firstLine}..."`);

    // Cleanup
    try { fs.unlinkSync(oggPath); } catch {}
    try { fs.unlinkSync(wavPath); } catch {}

    // 6. Route transcript through Cathy — same path as text messages
    addToConversation('cath', chatId, 'user', transcript);
    const history = getConversationHistory('cath', chatId);
    await safeSend(chatId, '⏳ Cathedral...');
    const reply = await callCath(transcript, history);
    addToConversation('cath', chatId, 'assistant', reply || '');
    await safeSend(chatId, reply || '⚠️ No response from Cath.');

  } catch (err) {
    console.error('Voice handler error:', err);
    await safeSend(chatId, `⚠️ Voice note received but transcription failed: ${err.message}`);
  }
});

// ── Document handler — .md files → vault ──────────���─────────────────────────
bot.on('document', async (msg) => {
  const chatId = msg.chat.id;
  const doc = msg.document;
  if (!doc || !doc.file_name) return;

  // Only handle .md files
  if (!doc.file_name.endsWith('.md')) return;

  try {
    const fileLink = await bot.getFileLink(doc.file_id);
    const axios = (await import('axios')).default;
    const response = await axios({ url: fileLink, responseType: 'text' });
    const content = response.data;

    // Determine destination: caption can specify path, default is 00_Staging/cathedral/
    const caption = (msg.caption || '').trim();
    let destDir, filename;

    if (caption.startsWith('/vault ')) {
      // /vault <path> in caption overrides destination
      const vaultPath = caption.slice('/vault '.length).trim();
      if (vaultPath.endsWith('.md')) {
        destDir = path.dirname(path.join(VAULT_ROOT, vaultPath));
        filename = path.basename(vaultPath);
      } else {
        destDir = path.join(VAULT_ROOT, vaultPath);
        filename = doc.file_name;
      }
    } else {
      destDir = path.join(VAULT_ROOT, '00_Staging', 'cathedral');
      filename = doc.file_name;
    }

    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    const fullPath = deduplicatePath(path.join(destDir, filename));
    fs.writeFileSync(fullPath, content);
    const rel = path.relative(VAULT_ROOT, fullPath);
    await safeSend(chatId, `📄 Document received and filed:\n\`${rel}\``);
  } catch (err) {
    console.error('Document handler error:', err);
    await safeSend(chatId, `���️ Document error: ${err.message}`);
  }
});

// Caption selection handler
bot.on('message', async (msg) => {
  if (!msg.text) return;
  const chatId = msg.chat.id;
  console.log(`[chat] id=${chatId}`);
  const postState = postGenerationState[chatId];

  // Check if this is a caption selection for a recently generated post
  if (postState && ['1', '2', '3'].includes(msg.text)) {
    const index = parseInt(msg.text) - 1;
    const selectedCaption = postState.captions[index];
    const topic = postState.topic;
    const visualDirection = postState.visualDirection;

    // Generate filename with current date
    const today = new Date().toISOString().split('T')[0];
    const filename = `${today}-${topic.replace(/\s+/g, '-')}-caption.md`;
    const filepath = path.join(SOCIAL_CONTENT_PATH, filename);

    // Write to file
    const fileContent = 
      `# ${topic.toUpperCase()} POST\n\n` +
      `## Caption\n\n${selectedCaption}\n\n` +
      `## Visual Direction\n\n${visualDirection}`;

    fs.writeFileSync(filepath, fileContent);

    // Clear the state and send confirmation
    delete postGenerationState[chatId];

    safeSend(chatId, 
      `✅ Saved to vault: ${filename}\n` +
      `🌀 Ready to post on Basic Reflex social channels.`, 
      { 
        reply_markup: { remove_keyboard: true } 
      }
    );

    return;
  }

  // /densify — trigger vault densifier batch
  if (msg.text === '/densify') {
    safeSend(chatId, '🔗 Running Vault Densifier...');
    try {
      // execSync imported at top
      execSync(`python3 ${path.join(process.env.HOME, 'Cathedral', 'vault-densifier.py')}`, { timeout: 60000 });
    } catch (err) {
      safeSend(chatId, `⚠️ Densifier error: ${err.message}`);
    }
    return;
  }

  // /vault search|read|list
  if (msg.text.startsWith('/vault ')) {
    const parts = msg.text.slice('/vault '.length).trim().split(' ');
    const subCmd = parts[0]?.toLowerCase();
    const arg = parts.slice(1).join(' ');

    if (subCmd === 'search') {
      if (!arg) { safeSend(chatId, 'Usage: /vault search <query>'); return; }
      safeSend(chatId, `🔎 Searching vault: "${arg}"...`);
      try {
        const output = await new Promise((resolve, reject) => {
          const proc = spawn('python3', [path.join(process.env.HOME, 'nanoclaw', 'vault_reader.py'), 'search', ...arg.split(' ')], { env: process.env });
          let out = '';
          let err = '';
          const timer = setTimeout(() => { proc.kill(); reject(new Error('timeout')); }, 30000);
          proc.stdout.on('data', d => { out += d.toString(); });
          proc.stderr.on('data', d => { err += d.toString(); });
          proc.on('close', code => { clearTimeout(timer); code === 0 ? resolve(out.trim()) : reject(new Error(err || `exit ${code}`)); });
          proc.on('error', err => { clearTimeout(timer); reject(err); });
        });
        await safeSend(chatId, output || 'No results.');
      } catch (err) {
        await safeSend(chatId, `⚠️ Vault search error: ${err.message}`);
      }
      return;
    }

    if (subCmd === 'read') {
      if (!arg) { safeSend(chatId, 'Usage: /vault read <path>'); return; }
      safeSend(chatId, `📄 Reading: ${arg}`);
      try {
        const output = await new Promise((resolve, reject) => {
          const proc = spawn('python3', [path.join(process.env.HOME, 'nanoclaw', 'vault_reader.py'), 'read', arg], { env: process.env });
          let out = '';
          let err = '';
          const timer = setTimeout(() => { proc.kill(); reject(new Error('timeout')); }, 30000);
          proc.stdout.on('data', d => { out += d.toString(); });
          proc.stderr.on('data', d => { err += d.toString(); });
          proc.on('close', code => { clearTimeout(timer); code === 0 ? resolve(out.trim()) : reject(new Error(err || `exit ${code}`)); });
          proc.on('error', err => { clearTimeout(timer); reject(err); });
        });
        const chunks = output.match(/[\s\S]{1,4000}/g) || ['(empty)'];
        for (let i = 0; i < chunks.length; i++) {
          await new Promise(r => setTimeout(r, i * 300));
          await safeSend(chatId, chunks[i]);
        }
      } catch (err) {
        await safeSend(chatId, `⚠️ Vault read error: ${err.message}`);
      }
      return;
    }

    if (subCmd === 'list') {
      try {
        const output = await new Promise((resolve, reject) => {
          const proc = spawn('python3', [path.join(process.env.HOME, 'nanoclaw', 'vault_reader.py'), 'list', ...(arg ? [arg] : [])], { env: process.env });
          let out = '';
          let err = '';
          const timer = setTimeout(() => { proc.kill(); reject(new Error('timeout')); }, 30000);
          proc.stdout.on('data', d => { out += d.toString(); });
          proc.stderr.on('data', d => { err += d.toString(); });
          proc.on('close', code => { clearTimeout(timer); code === 0 ? resolve(out.trim()) : reject(new Error(err || `exit ${code}`)); });
          proc.on('error', err => { clearTimeout(timer); reject(err); });
        });
        await safeSend(chatId, `\`\`\`\n${output}\n\`\`\``, { parse_mode: 'Markdown' });
      } catch (err) {
        await safeSend(chatId, `⚠️ Vault list error: ${err.message}`);
      }
      return;
    }

    // /vault write <path> [content] — or reply to a message
    if (subCmd === 'write') {
      if (!arg) { safeSend(chatId, 'Usage: /vault write <path> <content>\nOr reply to a message with: /vault write <path>'); return; }
      const firstSpace = arg.indexOf(' ');
      let vaultPath, content;
      if (msg.reply_to_message && msg.reply_to_message.text) {
        vaultPath = arg.trim();
        content = msg.reply_to_message.text;
      } else if (firstSpace > 0) {
        vaultPath = arg.slice(0, firstSpace);
        content = arg.slice(firstSpace + 1);
      } else {
        safeSend(chatId, 'Provide content after the path, or reply to a message.');
        return;
      }
      writeToVault(chatId, vaultPath, content);
      return;
    }

    // /vault <plain text> — deposit to telegram-deposit/
    if (subCmd && !['search', 'read', 'list', 'write'].includes(subCmd)) {
      const fullText = msg.text.slice('/vault '.length).trim();
      const today = new Date().toISOString().split('T')[0];
      const slug = fullText.slice(0, 40).replace(/[^a-zA-Z0-9]+/g, '-').replace(/-+$/, '').toLowerCase();
      const filename = `${today}_telegram-deposit_${slug}.md`;
      const depositDir = path.join(VAULT_ROOT, '00_Staging', 'telegram-deposit');
      if (!fs.existsSync(depositDir)) fs.mkdirSync(depositDir, { recursive: true });
      const destPath = deduplicatePath(path.join(depositDir, filename));
      const content = `---\ntitle: ${slug}\nsource: telegram-deposit\ndate: ${today}\n---\n\n${fullText}\n`;
      fs.writeFileSync(destPath, content);
      safeSend(chatId, `📥 Deposited:\n\`${path.relative(VAULT_ROOT, destPath)}\``);
      return;
    }

    safeSend(chatId, 'Usage: /vault search|read|list|write [arg]\nOr: /vault <text> to quick-deposit');
    return;
  }

  // ── /think command — Cathy-with-hands tool router ────────────────────────────
  if (msg.text.match(/^\/think\s+(.+)/)) {
    const message = msg.text.replace(/^\/think\s+/, '').trim();
    const chatId = msg.chat.id;

    try {
      const { selectTool, route } = await import('./cathy-router.js');
      const selection = selectTool(message);

      const toolEmoji = { claude: '🔧', gemini: '🔍', ollama: '🏠', cathy: '💬' };
      const toolLabel = { claude: 'Claude Code', gemini: 'Gemini CLI', ollama: 'Ollama (local)', cathy: 'Cathy (direct)' };
      await safeSend(chatId, `${toolEmoji[selection.tool] || '🤔'} Routing to ${toolLabel[selection.tool] || selection.tool}...\n${selection.reason}`);

      const result = await route(message, callCath);

      const duration = result.durationMs ? ` · ${Math.round(result.durationMs / 1000)}s` : '';
      const header = `${toolEmoji[result.tool] || '📋'} *${toolLabel[result.tool] || result.tool}*${duration}`;

      await safeSend(chatId, `${header}\n\n${result.response}`);

    } catch (err) {
      console.error('[/think] Error:', err.message);
      await safeSend(chatId, `⚠️ Think failed: ${err.message}`);
    }
    return;
  }

  // ── /test command — evaluate technology fit + trigger Code execution ────────
  if (msg.text.match(/^\/test\s+(.+)/)) {
    const idea = msg.text.replace(/^\/test\s+/, '').trim();
    const chatId = msg.chat.id;
    await safeSend(chatId, `🔬 Evaluating: "${idea}"...`);

    try {
      // Step 0: Resonance check — flag contradictions with governing field
      try {
        // Check for valid override token (<5 min old)
        const tokenPath = path.join(process.env.HOME, 'nanoclaw', 'resonance-override-token.json');
        let overrideActive = false;
        if (fs.existsSync(tokenPath)) {
          try {
            const tok = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
            const age = Date.now() - new Date(tok.timestamp).getTime();
            if (age < 5 * 60 * 1000) {
              overrideActive = true;
              fs.unlinkSync(tokenPath);
              await safeSend(chatId, `↪️ Resonance override active — skipping check.`);
            } else {
              fs.unlinkSync(tokenPath);
            }
          } catch { /* ignore */ }
        }

        const { checkResonance } = overrideActive ? { checkResonance: () => ({ resonant: true }) } : await import('./resonance-filter.js');
        const resonance = checkResonance(idea);
        if (!resonance.resonant) {
          const typeEmoji = { AESTHETIC: '🎨', PRINCIPLE: '⚖️', PRIORITY: '🛑' };
          const sevEmoji  = { advisory: 'ℹ️', warning: '⚠️', block: '🛑' };
          const flag = `${sevEmoji[resonance.severity] || '⚠️'} *RESONANCE FLAG* ${typeEmoji[resonance.contradiction_type] || ''}\n` +
            `*Type:* ${resonance.contradiction_type} · *Severity:* ${resonance.severity}\n` +
            `*Contradiction:* ${resonance.contradiction}\n` +
            `*Reference:* ${resonance.governing_field_reference}\n` +
            `*Suggestion:* ${resonance.suggestion}`;
          await safeSend(chatId, flag);

          if (resonance.severity === 'block') {
            await safeSend(chatId, `🛑 Build blocked — reply "OVERRIDE" within 5 min to force proceed, or send a revised /test brief.`);
            const overridePath = path.join(process.env.HOME, 'nanoclaw', 'pending-override.json');
            fs.writeFileSync(overridePath, JSON.stringify({ idea, resonance, chatId, timestamp: new Date().toISOString() }, null, 2));
            return;
          }
          if (resonance.severity === 'warning') {
            await safeSend(chatId, `⚠️ Proceeding with evaluation — flag noted for your review.`);
          }
          // advisory: just flag and continue
        }
      } catch (rErr) {
        console.warn('[/test] Resonance check failed (non-fatal):', rErr.message);
      }

      // Step 1: Read active projects for context
      const projectsDir = path.join(process.env.HOME, 'cathedral-vault', '08_Project_Orchestrator', 'projects');
      let projectContext = '';
      try {
        const files = fs.readdirSync(projectsDir).filter(f => f.endsWith('.md')).slice(0, 10);
        projectContext = files.map(f => {
          const content = fs.readFileSync(path.join(projectsDir, f), 'utf8');
          const titleMatch = content.match(/title:\s*"?([^"\n]+)"?/);
          const statusMatch = content.match(/project-status:\s*(\S+)/);
          return `${titleMatch?.[1] || f}: ${statusMatch?.[1] || 'unknown'}`;
        }).join('\n');
      } catch (_) {}

      // Load system prompt from vault
      const headOrcPromptPath = path.join(process.env.HOME, 'cathedral-vault', '06_Methods', 'head-orc-prompt.md');
      let systemPrompt = '';
      try {
        const raw = fs.readFileSync(headOrcPromptPath, 'utf8');
        // Strip YAML frontmatter
        systemPrompt = raw.replace(/^---[\s\S]*?---\n*/, '').trim();
      } catch (_) {
        systemPrompt = 'You are the Head Orchestrator. Evaluate this technology for fit. Return JSON with keys: fits, projects, evaluation, test_brief, risk, time_estimate.';
      }
      systemPrompt = systemPrompt.replace('{PROJECT_CONTEXT}', projectContext || 'none loaded');

      // Step 1: Evaluate — Claude API primary, Ollama fallback
      let rawEval = '';
      const evalMessages = [
        { role: 'user', content: `Evaluate this for the Cathedral: ${idea}` }
      ];

      // Try Claude API first
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      let usedClaude = false;
      if (anthropicKey) {
        try {
          const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': anthropicKey,
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 1000,
              system: systemPrompt,
              messages: evalMessages
            })
          });
          if (claudeRes.ok) {
            const claudeData = await claudeRes.json();
            rawEval = claudeData.content?.[0]?.text || '';
            usedClaude = true;
            console.log('[/test] Used Claude API');
          } else {
            console.log(`[/test] Claude API ${claudeRes.status}, falling back to Ollama`);
          }
        } catch (e) {
          console.log(`[/test] Claude API error: ${e.message}, falling back to Ollama`);
        }
      }

      // Fallback to Ollama
      if (!usedClaude) {
        const evalResponse = await fetch(`${OLLAMA_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'qwen3:14b',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Evaluate this for the Cathedral: ${idea}` }
            ],
            stream: false,
            format: 'json'
          })
        });
        const evalData = await evalResponse.json();
        rawEval = evalData.message?.content || '';
        console.log('[/test] Used Ollama fallback');
      }

      let evaluation;
      try {
        evaluation = JSON.parse(rawEval);
      } catch (_) {
        const jsonMatch = rawEval.match(/\{[\s\S]*\}/);
        if (jsonMatch) evaluation = JSON.parse(jsonMatch[0]);
        else throw new Error('Ollama did not return valid JSON');
      }

      // Step 2: Send confirmation to Paul
      const fitEmoji = evaluation.fits ? '✅' : '❌';
      const projects = (evaluation.projects || []).join(', ') || 'none';
      const confirmMsg = `${fitEmoji} ${evaluation.fits ? 'FITS' : 'DOES NOT FIT'}\n\nProjects: ${projects}\nRisk: ${evaluation.risk || '?'} · Est: ${evaluation.time_estimate || '?'}\n\n${evaluation.evaluation || ''}\n\nReply YES to run test, NO to park.`;

      await safeSend(chatId, confirmMsg);

      // Store pending test for YES/NO handling
      const pendingPath = path.join(process.env.HOME, 'nanoclaw', 'pending-test.json');
      fs.writeFileSync(pendingPath, JSON.stringify({
        idea,
        evaluation,
        timestamp: new Date().toISOString(),
        chatId
      }, null, 2));

    } catch (err) {
      console.error('[/test] Error:', err.message);
      await safeSend(chatId, `⚠️ Evaluation failed: ${err.message}`);
    }
    return;
  }

  // ── OVERRIDE handler for resonance-blocked /test briefs ───────────────────
  if (msg.text && /^OVERRIDE$/i.test(msg.text.trim())) {
    const chatId = msg.chat.id;
    const overridePath = path.join(process.env.HOME, 'nanoclaw', 'pending-override.json');
    if (fs.existsSync(overridePath)) {
      const pending = JSON.parse(fs.readFileSync(overridePath, 'utf8'));
      const age = Date.now() - new Date(pending.timestamp).getTime();
      if (age > 5 * 60 * 1000) {
        fs.unlinkSync(overridePath);
        await safeSend(chatId, `⏰ Override expired (>5 min). Send /test again if still needed.`);
      } else {
        // Store override token — next /test within 5 min will skip resonance
        const tokenPath = path.join(process.env.HOME, 'nanoclaw', 'resonance-override-token.json');
        fs.writeFileSync(tokenPath, JSON.stringify({ timestamp: new Date().toISOString(), contradiction_type: pending.resonance.contradiction_type }));
        fs.unlinkSync(overridePath);
        await safeSend(chatId, `✅ Override accepted for ${pending.resonance.contradiction_type} flag. Resend \`/test ${pending.idea}\` within 5 minutes — resonance check will be bypassed.`);
      }
      return;
    }
    // No pending override — fall through
  }

  // ── YES/NO handler for /test confirmation ─────────────────────────────────
  if (msg.text && /^(YES|NO)$/i.test(msg.text.trim())) {
    const chatId = msg.chat.id;
    const pendingPath = path.join(process.env.HOME, 'nanoclaw', 'pending-test.json');

    if (!fs.existsSync(pendingPath)) {
      // No pending test — fall through to normal Cath handler
    } else {
      const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
      const age = Date.now() - new Date(pending.timestamp).getTime();

      // Expire after 30 minutes
      if (age > 30 * 60 * 1000) {
        fs.unlinkSync(pendingPath);
        // Fall through
      } else if (/^YES$/i.test(msg.text.trim())) {
        fs.unlinkSync(pendingPath);
        await safeSend(chatId, `⚙️ Running test: "${pending.idea}"...\nThis may take a few minutes.`);

        try {
          // Step 3: Execute via claude -p
          const brief = pending.evaluation.test_brief || `Test this idea: ${pending.idea}`;
          const codeProc = spawn('claude', ['-p', '--output-format', 'text', '--max-turns', '5'], {
            cwd: path.join(process.env.HOME, 'Cathedral'),
            env: { ...process.env, HOME: process.env.HOME }
          });

          let stdout = '';
          let stderr = '';
          const timeout = setTimeout(() => { codeProc.kill(); }, 5 * 60 * 1000); // 5 min timeout

          codeProc.stdin.write(brief);
          codeProc.stdin.end();

          codeProc.stdout.on('data', d => { stdout += d; });
          codeProc.stderr.on('data', d => { stderr += d; });

          codeProc.on('close', async (code) => {
            clearTimeout(timeout);
            const result = stdout.trim() || stderr.trim() || `Exit code: ${code}`;

            // Truncate for Telegram (max ~3500 chars to be safe)
            const truncated = result.length > 3500 ? result.slice(0, 3400) + '\n\n[... truncated]' : result;

            await safeSend(chatId, `🔬 Test result: "${pending.idea}"\n\n${truncated}`);

            // Write result to vault
            try {
              const date = new Date().toISOString().slice(0, 10);
              const safeName = pending.idea.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 40);
              const nuggetPath = path.join(process.env.HOME, 'cathedral-vault', '00_Staging', 'cathedral', `test-${date}-${safeName}.md`);
              const nugget = `---\ntitle: "Test — ${pending.idea}"\ntype: test-result\ndate: ${date}\nverdict: ${code === 0 ? 'pass' : 'review'}\ntags: [test, scout]\n---\n\n# Test: ${pending.idea}\n\n## Evaluation\n${pending.evaluation.evaluation || ''}\n\n## Result\n\`\`\`\n${result.slice(0, 2000)}\n\`\`\`\n`;
              fs.writeFileSync(nuggetPath, nugget);
              await safeSend(chatId, `📋 Filed to vault: ${path.basename(nuggetPath)}`);
            } catch (e) {
              console.error('[/test] Vault filing error:', e.message);
            }
          });

          codeProc.on('error', async (err) => {
            clearTimeout(timeout);
            await safeSend(chatId, `⚠️ Code execution failed: ${err.message}`);
          });

        } catch (err) {
          await safeSend(chatId, `⚠️ Execution error: ${err.message}`);
        }
        return;

      } else if (/^NO$/i.test(msg.text.trim())) {
        fs.unlinkSync(pendingPath);
        // Park the idea
        try {
          const date = new Date().toISOString().slice(0, 10);
          const safeName = pending.idea.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 40);
          const parkedPath = path.join(process.env.HOME, 'cathedral-vault', '00_Staging', 'cathedral', `parked-${date}-${safeName}.md`);
          const nugget = `---\ntitle: "Parked — ${pending.idea}"\ntype: parked-idea\ndate: ${date}\ntags: [parked, scout]\n---\n\n# Parked: ${pending.idea}\n\n${pending.evaluation.evaluation || ''}\n\nParked by Paul. Revisit when relevant.\n`;
          fs.writeFileSync(parkedPath, nugget);
          await safeSend(chatId, `📦 Parked: "${pending.idea}"\nFiled for future reference.`);
        } catch (e) {
          await safeSend(chatId, `📦 Parked: "${pending.idea}"`);
        }
        return;
      }
    }
  }

  // Ignore other slash commands
  if (msg.text.startsWith('/')) return;

  // ── Passive Belief Scanner ──────────────────────────────────────────────────
  // Lightweight regex scan for belief signals. No LLM calls. False positives OK.
  if (isPaul(chatId) && msg.text.length > 10) {
    try {
      const text = msg.text;
      const beliefPatterns = [
        // High confidence signals
        { pattern: /\b(?:I(?:'m| am) certain|I know for (?:a )?fact|this is (?:definitely |absolutely )?true|(?:it's |that's )proven|(?:it's |that's )verified)\b/i, confidence: 0.95 },
        { pattern: /\b(?:I(?:'m| am) sure|clearly|obviously|no doubt|without question|100%|definitely)\b/i, confidence: 0.85 },
        // Medium confidence
        { pattern: /\b(?:I believe|I think|I reckon|most likely|probably|it seems like|it looks like|my view is|my take is)\b/i, confidence: 0.65 },
        { pattern: /\b(?:I suspect|perhaps|might be|possibly|could be|seems to be)\b/i, confidence: 0.45 },
        // Revision signals
        { pattern: /\b(?:I was wrong|I(?:'ve| have) changed my mind|I used to think|actually (?:no|wait)|I take (?:that |it )back|on second thought)\b/i, confidence: 0.30 },
        { pattern: /\b(?:I don(?:'t| not) know|not sure|hard to say|uncertain|can(?:'t| not) tell|no idea)\b/i, confidence: 0.20 },
        // Strong assertion patterns
        { pattern: /\bX is (?:definitely|absolutely|clearly|obviously)\b/i, confidence: 0.90 },
        { pattern: /\b(?:the truth is|the reality is|the fact is|what(?:'s| is) really going on is)\b/i, confidence: 0.80 },
      ];

      for (const { pattern, confidence } of beliefPatterns) {
        if (pattern.test(text)) {
          // Extract a topic from the sentence containing the match
          const sentences = text.split(/[.!?\n]+/).filter(s => s.trim().length > 5);
          const matchingSentence = sentences.find(s => pattern.test(s)) || sentences[0] || text;
          const topic = matchingSentence.trim().slice(0, 80).replace(/^(I think |I believe |I reckon |I suspect |I know )/i, '').trim();

          recordStatement(
            topic,
            matchingSentence.trim().slice(0, 200),
            confidence,
            'passive_scan',
            'telegram'
          );
          console.log(`[belief-tracker] passive capture: "${topic.slice(0, 40)}..." conf=${confidence}`);
          break; // one match per message
        }
      }
    } catch (err) {
      console.error('[belief-tracker] passive scan error:', err.message);
    }
  }

  // Route everything else through Cath
  try {
    addToConversation('cath', chatId, 'user', msg.text);
    const history = getConversationHistory('cath', chatId);
    await safeSend(chatId, '⏳ Cathedral...');
    const reply = await callCath(msg.text, history);
    await safeSend(chatId, reply || '⚠️ No response from Cath.');
    addToConversation('cath', chatId, 'assistant', reply || '');
    updateMemoryAfterConversation('cath', chatId).catch(e => console.error('Memory update error:', e.message));
    recordExchange(msg.text, reply || '');
  } catch (error) {
    console.error('Cath error:', error);
    await safeSend(chatId, `⚠️ Cath error: ${error.message}`);
  }
});

// ── Cathedral Deck ──────────────────────────────────────────────────────────

bot.onText(/^\/deck(?:@\w+)?(?:\s+(.*))?$/s, async (msg, match) => {
  const chatId = msg.chat.id;
  const filter = match?.[1]?.trim()?.toLowerCase();

  try {
    const deckPath = path.join(process.env.HOME, 'nanoclaw', 'reed-lab', 'deck.json');
    const deck = JSON.parse(fs.readFileSync(deckPath, 'utf8'));

    // /deck add [name] — create new card
    if (filter && filter.startsWith('add ')) {
      const cardName = match[1].trim().replace(/^add\s+/i, '');
      if (!cardName) return safeSend(chatId, 'Usage: `/deck add [card name]`', { parse_mode: 'Markdown' });

      const nextId = Math.max(...deck.map(c => c.id)) + 1;
      await safeSend(chatId, `🗺 Cartographer defining #${String(nextId).padStart(3,'0')} "${cardName}"...`);

      // Step 1: Cartographer writes the card definition
      try {
        const cardSystemPrompt = `You are the Cartographer of the Cathedral. You define new system cards.
The Cathedral is a sovereign AI research instrument with ${deck.length} existing cards.
Existing cards: ${deck.map(c => `#${String(c.id).padStart(3,'0')} ${c.name}`).join(', ')}

Output JSON only. Define a new card for the Cathedral Deck:
{
  "name": "exact name given",
  "subtitle": "one-line description — what this IS",
  "status": "live or planned or building",
  "icon": "single letter, uppercase",
  "color": "hex color that fits the Cathedral palette",
  "description": "2-3 sentences. What it does, why it matters.",
  "locations": ["likely file paths"],
  "dashboards": [],
  "connects": [list of existing card IDs this connects to],
  "key_facts": ["3-4 key facts"],
  "frontier": "the next unexplored edge — what this could become"
}`;

        let cardDef;
        try {
          cardDef = await smartQueryJSON(cardSystemPrompt, `Define card #${nextId}: "${cardName}"`, 500);
        } catch(e) {
          return safeSend(chatId, `Cartographer failed to define card: ${e.message}`);
        }

        // Ensure required fields
        cardDef.id = nextId;
        cardDef.name = cardDef.name || cardName;
        cardDef.status = cardDef.status || 'building';
        cardDef.icon = (cardDef.icon || cardName[0]).toUpperCase();
        cardDef.color = cardDef.color || '#f59e0b';
        if (!cardDef.connects) cardDef.connects = [];
        if (!cardDef.key_facts) cardDef.key_facts = [];

        // Step 2: Reed generates image prompt
        await safeSend(chatId, `🎬 Reed generating visual for #${String(nextId).padStart(3,'0')}...`);

        let imagePrompt = `Dark cathedral space with amber geometric light. Symbolic visual metaphor representing ${cardDef.name}: ${cardDef.subtitle || ''}. ${cardDef.frontier || ''}. Cinematic 16:9, architectural, no text, no people.`;
        try {
          const reedRes = await fetch('http://localhost:11434/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'hermes3',
              messages: [{
                role: 'system',
                content: 'You are Reed, Visual Director. Write one Higgsfield image prompt. Dark Cathedral aesthetic (#09090f), amber accents, symbolic not literal. Output ONLY the prompt text.'
              }, {
                role: 'user',
                content: `Visual metaphor for "${cardDef.name}": ${cardDef.description || ''}\nFrontier: ${cardDef.frontier || ''}`
              }],
              stream: false,
              options: { temperature: 0.5, num_predict: 150 },
            }),
          });
          const reedData = await reedRes.json();
          if (reedData.message?.content) imagePrompt = reedData.message.content.trim();
        } catch(e) {}

        // Step 3: Generate Higgsfield image
        let imageFile = '';
        try {
          const { execSync: exec } = require('child_process');
          const genOutput = exec(
            `higgsfield gen create nano_banana_2 --prompt "${imagePrompt.replace(/"/g, '\\"')}" --aspect_ratio "16:9" --resolution "2k"`,
            { timeout: 30000, encoding: 'utf8' }
          ).trim();

          // genOutput is the job ID
          if (genOutput && genOutput.length > 10) {
            cardDef._higgsfield_job = genOutput;
            imageFile = `${String(nextId).padStart(3,'0')}-${cardName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
            cardDef.image = `slides/card-images/${imageFile}`;
            cardDef._image_pending = true;

            // Poll for completion (max 60s)
            for (let attempt = 0; attempt < 12; attempt++) {
              await new Promise(r => setTimeout(r, 5000));
              try {
                const status = exec(`higgsfield gen get ${genOutput}`, { timeout: 10000, encoding: 'utf8' });
                const urlMatch = status.match(/https:\/\/\S+\.png/);
                if (urlMatch) {
                  const imgPath = path.join(process.env.HOME, 'nanoclaw', 'reed-lab', 'slides', 'card-images', imageFile);
                  exec(`curl -sL "${urlMatch[0]}" -o "${imgPath}"`, { timeout: 30000 });
                  delete cardDef._image_pending;
                  break;
                }
              } catch(e) {}
            }
          }
        } catch(e) {
          console.error('[deck add] Higgsfield error:', e.message);
        }

        // Step 4: Save to deck.json
        deck.push(cardDef);
        fs.writeFileSync(deckPath, JSON.stringify(deck, null, 2));

        // Step 5: Confirm
        const conns = (cardDef.connects || []).map(id => {
          const c = deck.find(d => d.id === id);
          return c ? `#${String(id).padStart(3,'0')} ${c.name}` : `#${id}`;
        }).join(', ');

        let response = `*#${String(nextId).padStart(3,'0')} ${cardDef.name}* — added to deck\n\n`;
        response += `${cardDef.subtitle || ''}\n\n`;
        response += `${cardDef.description || ''}\n\n`;
        if (cardDef.key_facts.length) response += cardDef.key_facts.map(f => `• ${f}`).join('\n') + '\n\n';
        if (conns) response += `*Connects:* ${conns}\n`;
        if (cardDef.frontier) response += `*Frontier:* ${cardDef.frontier}\n`;
        response += `\n${cardDef._image_pending ? '⏳ Image generating...' : '🎨 Image ready'}`;
        response += `\n📊 localhost:8080/reed-slides`;

        return safeSend(chatId, response, { parse_mode: 'Markdown' });

      } catch(e) {
        console.error('[deck add]', e.message);
        return safeSend(chatId, `Deck add failed: ${e.message}`);
      }
    }

    let filtered = deck;
    if (filter === 'live') filtered = deck.filter(c => c.status === 'live');
    else if (filter === 'planned') filtered = deck.filter(c => c.status === 'planned');
    else if (filter === 'frontier') filtered = deck.filter(c => c.frontier);
    else if (filter && !isNaN(filter)) {
      const card = deck.find(c => c.id === parseInt(filter));
      if (card) {
        const conns = (card.connects || []).map(id => {
          const c = deck.find(d => d.id === id);
          return c ? `#${String(id).padStart(3,'0')} ${c.name}` : `#${id}`;
        }).join('\n    ');

        let detail = `*#${String(card.id).padStart(3,'0')} ${card.name}*\n`;
        detail += `${card.subtitle}\n\n`;
        detail += `${card.description}\n\n`;
        if (card.key_facts) detail += card.key_facts.map(f => `• ${f}`).join('\n') + '\n\n';
        if (conns) detail += `*Connects to:*\n    ${conns}\n\n`;
        if (card.frontier) detail += `*Frontier:* ${card.frontier}\n\n`;
        if (card.locations) detail += `*Location:* ${card.locations[0]}\n`;
        if (card.dashboards?.length) detail += `*Dashboard:* ${card.dashboards[0]}`;

        return safeSend(chatId, detail, { parse_mode: 'Markdown' });
      }
    }

    const live = filtered.filter(c => c.status === 'live').length;
    let response = `*Cathedral Deck* — ${filtered.length} cards (${live} live)\n\n`;

    for (const card of filtered) {
      const icon = card.status === 'live' ? '●' : card.status === 'building' ? '◐' : '○';
      response += `${icon} *#${String(card.id).padStart(3,'0')}* ${card.name}\n`;
      response += `    ${card.subtitle}\n`;
      if (card.frontier) response += `    ↳ _${card.frontier.substring(0, 70)}_\n`;
    }

    response += `\n\`/deck [number]\` — card detail\n\`/deck add [name]\` — create new card\n\`/deck live|planned|frontier\` — filter`;
    response += `\n📊 localhost:8080/reed-slides`;
    await safeSend(chatId, response, { parse_mode: 'Markdown' });

  } catch(e) {
    console.error('[deck]', e.message);
    await safeSend(chatId, `Deck error: ${e.message}`);
  }
});

// ── Cathedral Slides ────────────────────────────────────────────────────────

bot.onText(/^\/slides?(?:@\w+)?(?:\s+(.*))?$/s, async (msg, match) => {
  const chatId = msg.chat.id;
  const topic = match?.[1]?.trim();

  if (!topic) {
    return safeSend(chatId, `🏛 *Cathedral Slides*

\`/slides [topic]\` — Generate a visual slide card

Examples:
\`/slides The Experiment Lab\`
\`/slides Cymatics Schumann strategy\`
\`/slides Today's trading roundtable\`

Gallery: localhost:8080/reed-slides`, { parse_mode: 'Markdown' });
  }

  await safeSend(chatId, `🏛 Cartographer mapping "${topic}"...`);

  try {
    // Load Cartographer sage
    const cartDef = JSON.parse(fs.readFileSync(path.join(process.env.HOME, 'nanoclaw', 'sages', 'cartographer.json'), 'utf8'));

    // Step 1: Vault context search
    let vaultContext = '';
    try {
      const searchRes = await fetch('http://localhost:8080/vault/search?q=' + encodeURIComponent(topic) + '&limit=5');
      if (searchRes.ok) {
        const results = await searchRes.json();
        if (results.results) {
          vaultContext = results.results.map(r => `- ${r.title || r.path}: ${(r.content || '').substring(0, 200)}`).join('\n');
        }
      }
    } catch(e) {}

    // Step 2: Cartographer writes the structural brief
    const cartographerPrompt = `You are ${cartDef.sage.name}, ${cartDef.sage.designation}.
Voice: ${cartDef.sage.voice}

Your task: write a slide brief for the topic "${topic}".

Vault context:
${vaultContext || 'No vault results — use your knowledge of the Cathedral system.'}

Output JSON only, following this exact format:
{
  "title": "5-8 word structural title",
  "subtitle": "One sentence — what this means for the system",
  "key_concept": "The single idea this slide communicates",
  "visual_metaphor": "What image would make this visible — think: map territory, constellation, architectural structure, system diagram. Cathedral aesthetic: dark (#09090f), amber accents, geometric.",
  "highlights": ["structural point 1", "structural point 2", "structural point 3"],
  "why_it_matters": "Why this deserves a slide — what it changes in the system",
  "zone_change": "What moved on the map (e.g., 'new territory settled' or 'border crossing detected')"
}`;

    let brief;
    try {
      brief = await smartQueryJSON(cartographerPrompt, `Write the slide brief for: "${topic}"`, 400);
    } catch(e) {
      brief = { title: topic, subtitle: 'Cathedral architecture', highlights: [], visual_metaphor: '' };
    }

    if (!brief || !brief.title) brief = { ...(brief || {}), title: topic };

    await safeSend(chatId, `🗺 Cartographer brief: "${brief.title}"\n🎬 Reed generating visual...`);

    // Step 3: Reed generates Higgsfield image prompt from brief
    const reedPrompt = `You are Reed, Visual Director. The Cartographer wrote this brief for a Cathedral slide:

Title: ${brief.title}
Concept: ${brief.key_concept || brief.subtitle || ''}
Visual metaphor: ${brief.visual_metaphor || 'Cathedral architecture, dark geometric'}

Write a Higgsfield nano_banana_2 image generation prompt. Requirements:
- Dark Cathedral background (#09090f to #0f0f18)
- Amber/gold accent lighting
- Clean geometric or architectural style
- The concept made visual — not literal, metaphorical
- No text in the image
- Cinematic 16:9 composition
- Professional, minimal, striking

Output the prompt as a single paragraph, 2-3 sentences max. Nothing else.`;

    let imagePrompt = '';
    try {
      const reedRes = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'hermes3',
          messages: [
            { role: 'system', content: 'You are Reed, Visual Director. Write image generation prompts. Output ONLY the prompt text, nothing else.' },
            { role: 'user', content: reedPrompt }
          ],
          stream: false,
          options: { temperature: 0.5, num_predict: 150 },
        }),
      });
      const reedData = await reedRes.json();
      imagePrompt = reedData.message?.content || '';
    } catch(e) {
      imagePrompt = `Dark cathedral interior with amber geometric light patterns representing ${topic}. Deep navy-black background, clean architectural lines, cinematic 16:9 composition.`;
    }

    // Save slide to catalogue (with brief + image prompt for future generation)
    const slideData = {
      ...brief,
      image_prompt: imagePrompt.trim(),
      date: new Date().toISOString().split('T')[0],
      source: 'telegram-' + Date.now(),
      pipeline: 'cartographer→reed',
    };

    const catPath = path.join(process.env.HOME, 'nanoclaw', 'reed-lab', 'slides', 'catalogue.json');
    let catalogue = [];
    try { catalogue = JSON.parse(fs.readFileSync(catPath, 'utf8')); } catch(e) {}
    catalogue.push(slideData);
    fs.writeFileSync(catPath, JSON.stringify(catalogue, null, 2));

    // Format response
    let response = `🏛 *${brief.title}*\n\n${brief.subtitle || ''}`;
    if (brief.key_concept) response += `\n\n💡 *Concept:* ${brief.key_concept}`;
    if (brief.highlights && brief.highlights.length > 0) {
      response += '\n\n' + brief.highlights.map(h => `• ${h}`).join('\n');
    }
    if (brief.why_it_matters) response += `\n\n🗺 *Map:* ${brief.why_it_matters}`;
    if (brief.zone_change) response += `\n📍 ${brief.zone_change}`;
    response += `\n\n🎨 _Reed's visual prompt:_ ${imagePrompt.substring(0, 120)}...`;
    response += `\n\n_Slide ${catalogue.length} added to gallery_`;

    await safeSend(chatId, response, { parse_mode: 'Markdown' });

  } catch(e) {
    console.error('[slides] Error:', e.message);
    await safeSend(chatId, `Slide generation failed: ${e.message}`);
  }
});

// ── Creative Lab (Domain 3) ──────────────────────────────────────────────────

bot.onText(/^\/creative[-_]?lab(?:@\w+)?(?:\s+(.*))?$/s, async (msg, match) => {
  const chatId = msg.chat.id;
  const args = match?.[1]?.trim();

  try {
    const { getLeaderboard, logSelection, recommendStyle, getStats } = await import('./experiment-engine/creative/creative-strategies.js');

    // /creative-lab — show leaderboard
    if (!args) {
      const board = getLeaderboard();
      const stats = getStats();
      const rec = recommendStyle();

      let response = `*Creative Lab — Style Experiment*\n`;
      response += `${stats.generations} generated | ${stats.selections} selections\n\n`;

      if (board.length > 0) {
        response += `*Leaderboard:*\n`;
        for (const s of board) {
          const bar = s.selection_rate > 0 ? '|'.repeat(Math.min(Math.round(s.selection_rate / 10), 10)) : '';
          response += `${s.style}: ${s.selection_rate || 0}% ${bar} (${s.selected || 0}/${s.total_generated})\n`;
        }
      } else {
        response += `No data yet. Generate images with /reed and track selections.\n`;
      }

      response += `\n*Next recommendation:* ${rec.style} (${rec.reason})`;
      return safeSend(chatId, response, { parse_mode: 'Markdown' });
    }

    // /creative-lab select <style> — log Paul selected this style
    if (args.startsWith('select ') || args.startsWith('use ')) {
      const style = args.replace(/^(select|use)\s+/, '').trim();
      const result = logSelection(null, style, 'selected', '', 'telegram');

      // Publish to meta-watcher
      try {
        const { logDomainRun } = await import('./experiment-engine/meta-watcher.js');
        logDomainRun('creative', [{ type: style, subject: 'selection', direction: 'positive', strength: 0.8 }]);
      } catch(e) {}

      return safeSend(chatId, `Logged: Paul selected *${style}*. Leaderboard updated.`, { parse_mode: 'Markdown' });
    }

    // /creative-lab reject <style>
    if (args.startsWith('reject ') || args.startsWith('skip ')) {
      const style = args.replace(/^(reject|skip)\s+/, '').trim();
      logSelection(null, style, 'rejected', '', 'telegram');
      return safeSend(chatId, `Logged: Paul rejected *${style}*.`, { parse_mode: 'Markdown' });
    }

    // /creative-lab recommend
    if (args === 'recommend' || args === 'next') {
      const rec = recommendStyle();
      return safeSend(chatId, `*Recommended:* ${rec.style}\n${rec.reason}\n${rec.explore ? '(exploring)' : '(exploiting best)'}`, { parse_mode: 'Markdown' });
    }

    safeSend(chatId, `*Creative Lab commands:*
\`/creative-lab\` — style leaderboard
\`/creative-lab select <style>\` — log selection
\`/creative-lab reject <style>\` — log rejection
\`/creative-lab recommend\` — next style suggestion`, { parse_mode: 'Markdown' });

  } catch(e) {
    console.error('[creative-lab]', e.message);
    await safeSend(chatId, `Creative Lab error: ${e.message}`);
  }
});

// ── Investment Coach ─────────────────────────────────────────────────────────

bot.onText(/^\/coach(?:@\w+)?(?:\s+(.*))?$/s, async (msg, match) => {
  const chatId = msg.chat.id;
  const question = match?.[1]?.trim();

  if (!question) {
    return safeSend(chatId, `*The Coin Room — Investment Coach*

Ask me anything about investing. I teach through boxing metaphors.

Examples:
\`/coach what is DCA?\`
\`/coach how much should I put in one asset?\`
\`/coach where are we in the cycle?\`
\`/coach show me my portfolio\`
\`/coach what's the difference between investing and gambling?\`

I go one concept at a time. No rush. This is the infinite game.`, { parse_mode: 'Markdown' });
  }

  // Show portfolio if asked
  if (question.includes('portfolio') || question.includes('balance') || question.includes('positions')) {
    try {
      const portfolio = JSON.parse(fs.readFileSync(path.join(process.env.HOME, 'nanoclaw', 'trader', 'long-term-portfolio.json'), 'utf8'));
      let response = `*Your Long-Term Portfolio (Paper)*\n\n`;
      response += `Cash: $${portfolio.balance_cash.toLocaleString()}\n`;
      response += `Invested: $${portfolio.total_invested.toLocaleString()}\n`;
      response += `Total Value: $${portfolio.total_value.toLocaleString()}\n`;
      response += `P&L: $${portfolio.unrealised_pnl >= 0 ? '+' : ''}${portfolio.unrealised_pnl}\n\n`;
      response += `*Positions:*\n`;
      for (const [asset, pos] of Object.entries(portfolio.positions)) {
        response += `${asset}: ${pos.qty.toFixed(6)} @ avg $${pos.avg_price.toFixed(0)} (${pos.unrealised_pct >= 0 ? '+' : ''}${pos.unrealised_pct || 0}%)\n`;
      }
      response += `\nDCA: $${portfolio.dca_schedule.btc_weekly}/wk BTC + $${portfolio.dca_schedule.eth_weekly}/wk ETH`;
      return safeSend(chatId, response, { parse_mode: 'Markdown' });
    } catch(e) {
      return safeSend(chatId, 'Portfolio not available yet.');
    }
  }

  await safeSend(chatId, '🥊 The Coin Room thinking...');

  try {
    const coachDef = JSON.parse(fs.readFileSync(path.join(process.env.HOME, 'nanoclaw', 'sages', 'investment-coach.json'), 'utf8'));

    // Load portfolio context
    let portfolioContext = '';
    try {
      const p = JSON.parse(fs.readFileSync(path.join(process.env.HOME, 'nanoclaw', 'trader', 'long-term-portfolio.json'), 'utf8'));
      portfolioContext = `\n\nPaul's live paper portfolio: Cash $${p.balance_cash}, Invested $${p.total_invested}. Positions: ${Object.entries(p.positions).map(([a, pos]) => `${a}: ${pos.qty.toFixed(6)} @ $${pos.avg_price.toFixed(0)}`).join(', ') || 'none yet'}. DCA: $${p.dca_schedule.btc_weekly}/wk BTC + $${p.dca_schedule.eth_weekly}/wk ETH. Week ${Math.ceil((Date.now() - new Date(p.started).getTime()) / 604800000)}.`;
    } catch(e) {}

    const answer = await smartQuery(coachDef.system_prompt + portfolioContext, question, 500) || 'No response.';
    await safeSend(chatId, `🥊 *The Coin Room*\n\n${answer}`, { parse_mode: 'Markdown' });

  } catch(e) {
    console.error('[coach]', e.message);
    await safeSend(chatId, `Coach error: ${e.message}`);
  }
});

// ── Boxing Lab (Domain 2) ────────────────────────────────────────────────────

bot.onText(/^\/boxing[-_]?lab(?:@\w+)?(?:\s+(.*))?$/s, async (msg, match) => {
  const chatId = msg.chat.id;
  const args = match?.[1]?.trim();

  // Parse: /boxing-lab [category] [filename] or just /boxing-lab for latest
  let category = 'padwork', filename = 'noodles1';
  if (args) {
    const parts = args.split(/\s+/);
    if (parts[0]) category = parts[0];
    if (parts[1]) filename = parts[1];
  }

  await safeSend(chatId, `Boxing Lab analyzing ${category}/${filename}...`);

  try {
    const { execSync: exec } = require('child_process');
    exec(`python3 experiment-engine/boxing/boxing-strategies.py ${category} ${filename}`, {
      cwd: path.join(process.env.HOME, 'nanoclaw'),
      stdio: 'pipe',
      timeout: 30000,
    });

    const analysisPath = path.join(process.env.HOME, 'nanoclaw', 'experiment-engine', 'boxing', 'boxing-analysis-latest.json');
    if (!fs.existsSync(analysisPath)) {
      return safeSend(chatId, 'Analysis file not generated.');
    }

    const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
    const m = analysis.metrics;

    let response = `*Boxing Lab — ${category}/${filename}*\n`;
    response += `${m.total_punches} punches | ${m.punch_rate_per_min}/min | vel ${m.mean_velocity} | ${m.guard_drops} guard drops\n`;

    for (const strat of analysis.strategies) {
      if (strat.signals.length === 0 && strat.recommendations.length === 0) continue;
      response += `\n*${strat.strategy}*\n`;
      for (const sig of strat.signals) {
        const icon = sig.outcome === 'positive' ? '+' : '-';
        response += `${icon} ${sig.reasoning.substring(0, 100)}\n`;
      }
      for (const rec of strat.recommendations) {
        response += `> ${rec}\n`;
      }
    }

    // Publish to meta-watcher
    try {
      const { logDomainRun, detectCrossDomainConvergence } = await import('./experiment-engine/meta-watcher.js');
      logDomainRun('boxing', analysis.signals.map(s => ({
        type: s.type, subject: s.subject, outcome: s.outcome,
        strength: s.strength, asset: s.subject, direction: s.outcome,
      })));
      const crossDomain = detectCrossDomainConvergence(48);
      if (crossDomain.length > 0) {
        response += '\n*Cross-Domain Convergences:*\n';
        for (const c of crossDomain) {
          response += `${c.strategy}: ${c.direction} in ${c.domains.join(' + ')}\n`;
        }
      }
    } catch(e) {}

    await safeSend(chatId, response, { parse_mode: 'Markdown' });
  } catch(e) {
    console.error('[boxing-lab]', e.message);
    await safeSend(chatId, `Boxing Lab error: ${e.message}`);
  }
});

// ── Reed Visual Director ────────────────────────────────────────────────────
const reedConversation = {};

bot.onText(/^\/reed(?:@\w+)?(?:\s+(.*))?$/s, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match?.[1]?.trim();
  if (!query) {
    return safeSend(chatId, `🎬 *Reed — Visual Director*

*Photo styles* (send photo with /reed caption):
\`/reed\` — Pro photo v2
\`/reed manga\` — Graphic novel environment
\`/reed ippo\` — Shonen manga (speed lines)
\`/reed noir\` — B&W 1940s fight night
\`/reed neon\` — HK cyberpunk
\`/reed dramatic\` — Volumetric cinema
\`/reed oil\` — Oil painting
\`/reed poster\` — BR vintage poster art (text-free, add type in Canva)
\`/reed instagram\` — IG-ready pro photo (full colour, 4:5)
\`/reed inner\` — Inner game / philosophical (dramatic, contemplative)
\`/reed video\` — 5s motion

*Scene Director* (text commands):
\`/scene logan training on heavy bag\` — Character in gym scene
\`/scene maya wrapping hands\` — Any character + solo activity
\`/scene env empty gym at dawn\` — Environment plate (no people)
\`/scenevideo logan shadow boxing\` — 5s video scene

*Commands:*
\`/shots\` — Today's photo assignments
\`/lab\` — Run Daily Lab now
\`/reed <question>\` — Ask Reed anything`, { parse_mode: 'Markdown' });
  }

  await safeSend(chatId, '🎬 Reed reviewing...');

  try {
    // Load Reed sage definition
    const reedDef = JSON.parse(fs.readFileSync(path.join(process.env.HOME, 'nanoclaw', 'sages', 'reed.json'), 'utf8'));

    // Build system prompt from sage definition
    const systemPrompt = `You are ${reedDef.sage.name}, ${reedDef.sage.designation}.
Voice: ${reedDef.sage.voice}
Core lens: ${reedDef.sage.core_lens}

You address Paul as "${reedDef.sage.addresses_user_as}".

IDENTITY LOCK (Logan):
${JSON.stringify(reedDef.identity_lock, null, 2)}

GENERATION HIERARCHY:
${reedDef.generation_hierarchy.join('\n')}

AVAILABLE MODELS:
${Object.entries(reedDef.capabilities.models).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

SOUL ID: ${reedDef.capabilities.soul_id.name} (${reedDef.capabilities.soul_id.ref_id})
Note: ${reedDef.capabilities.soul_id.note}

PROVEN PROMPTS:
Pro Photo: ${reedDef.prompts?.pro_photo || 'see bot code'}
Manga: ${reedDef.prompts?.manga || 'see bot code'}
Dramatic: ${reedDef.prompts?.dramatic_cinema || 'see bot code'}

STANDING RULES:
${reedDef.standing_rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}

CONTENT TYPES YOU CAN PRODUCE:
${reedDef.content_types.join(', ')}

When Paul asks you to generate something, give the exact higgsfield CLI command he should run (or that Claude Code should run). Always specify the model, prompt, flags, and aspect ratio. Always remind to send results to Telegram.

When Paul asks about approach/strategy, give direct creative direction based on the generation hierarchy and identity lock.

Keep responses short and direct. You're a creative director, not a copywriter.`;

    // Get conversation history
    if (!reedConversation[chatId]) reedConversation[chatId] = [];
    reedConversation[chatId].push({ role: 'user', content: query });
    if (reedConversation[chatId].length > 20) {
      reedConversation[chatId] = reedConversation[chatId].slice(-20);
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');

    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        max_tokens: 1024,
        messages: [
          { role: 'system', content: systemPrompt },
          ...reedConversation[chatId],
        ],
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!resp.ok) throw new Error(`DeepSeek ${resp.status}`);
    const data = await resp.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || 'No response.';

    reedConversation[chatId].push({ role: 'assistant', content: reply });

    await safeSend(chatId, `🎬 *Reed:*\n\n${reply}`, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('[reed]', err.message);
    await safeSend(chatId, `⚠️ Reed error: ${err.message}`);
  }
});

// ── Reed Shot List — /shots ──────────────────────────────────────────────────
bot.onText(/^\/shots(?:@\w+)?$/i, async (msg) => {
  const chatId = msg.chat.id;
  try {
    execSync('cd ~/nanoclaw && node reed-lab/daily-lab.js --shots', { encoding: 'utf-8', timeout: 30000 });
    await safeSend(chatId, '🎬 Reed: Shot list sent.');
  } catch (err) {
    await safeSend(chatId, `⚠️ Shot list error: ${err.message.slice(0, 200)}`);
  }
});

// ── Reed Daily Lab — /lab ───────────────────────────────────────────────────
bot.onText(/^\/lab(?:@\w+)?$/i, async (msg) => {
  const chatId = msg.chat.id;
  await safeSend(chatId, '🎬 Reed Lab starting... This will take a few minutes.');
  try {
    execSync('cd ~/nanoclaw && node reed-lab/daily-lab.js', { encoding: 'utf-8', timeout: 900000 });
  } catch (err) {
    await safeSend(chatId, `⚠️ Lab error: ${err.message.slice(0, 200)}`);
  }
});

// ── Roundtable — /roundtable ─────────────────────────────────────────────────
bot.onText(/^\/roundtable(?:@\w+)?(?:\s+(.*))?$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const topic = match?.[1]?.trim();
  await safeSend(chatId, '🏛️ Roundtable assembling...');
  try {
    if (topic) {
      execSync(`cd ~/nanoclaw && node reed-lab/roundtable.js --custom "${topic.replace(/"/g, '\\"')}"`, { encoding: 'utf-8', timeout: 600000 });
    } else {
      execSync('cd ~/nanoclaw && node reed-lab/roundtable.js --weekly', { encoding: 'utf-8', timeout: 600000 });
    }
  } catch (err) {
    await safeSend(chatId, `⚠️ Roundtable error: ${err.message.slice(0, 200)}`);
  }
});

// ── Roundtable Digest — /digest ──────────────────────────────────────────────
bot.onText(/^\/digest(?:@\w+)?$/i, async (msg) => {
  const chatId = msg.chat.id;
  await safeSend(chatId, '🏛️ Generating roundtable digest...');
  try {
    execSync('cd ~/nanoclaw && node reed-lab/roundtable-digest.js --all', { encoding: 'utf-8', timeout: 300000 });
  } catch (err) {
    await safeSend(chatId, `⚠️ Digest error: ${err.message.slice(0, 200)}`);
  }
});

// ── Reed Scene Director — /scene ────────────────────────────────────────────
bot.onText(/^\/scene(?:@\w+)?(?:\s+(.*))?$/s, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;
  const input = match?.[1]?.trim();
  if (!input) {
    return safeSend(chatId, `🎬 *Reed Scene Director*

\`/scene logan training on heavy bag\`
\`/scene ling standing in gym doorway\`
\`/scene maya wrapping hands\`
\`/scene env empty gym at dawn\`

Characters: logan, ling, maya
First word = character name (or "env" for environment plate)`, { parse_mode: 'Markdown' });
  }

  try {
    const { generateScene, generateEnvironment } = await import('./reed-scene-director.js');
    const parts = input.split(/\s+/);
    const first = parts[0].toLowerCase();
    const sceneDesc = parts.slice(1).join(' ');

    if (first === 'env' || first === 'environment') {
      await safeSend(chatId, `🎬 Reed: Building environment plate — "${sceneDesc}"...`);
      const result = await generateEnvironment(sceneDesc);
      if (!result) await safeSend(chatId, '⚠️ Reed: Environment generation failed.');
    } else {
      if (!sceneDesc) {
        return safeSend(chatId, '⚠️ Need a scene description after character name.');
      }
      await safeSend(chatId, `🎬 Reed: Building scene — ${first} "${sceneDesc}"...`);
      const result = await generateScene(first, sceneDesc);
      if (!result) await safeSend(chatId, '⚠️ Reed: Scene generation failed.');
    }
  } catch (err) {
    console.error('[reed-scene]', err.message);
    await safeSend(chatId, `⚠️ Reed scene error: ${err.message.slice(0, 200)}`);
  }
});

// ── Reed Scene Video — /scenevideo ──────────────────────────────────────────
bot.onText(/^\/scenevideo(?:@\w+)?(?:\s+(.*))?$/s, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;
  const input = match?.[1]?.trim();
  if (!input) {
    return safeSend(chatId, `🎬 *Reed Video Director*

\`/scenevideo logan shadow boxing\`
\`/scenevideo maya jump rope\`
\`/scenevideo logan wrapping hands\`

Characters: logan, ling, maya
Generates 5s Seedance video with BR cinema grammar.`, { parse_mode: 'Markdown' });
  }

  try {
    const { generateVideo } = await import('./reed-scene-director.js');
    const parts = input.split(/\s+/);
    const character = parts[0].toLowerCase();
    const sceneDesc = parts.slice(1).join(' ');

    if (!sceneDesc) {
      return safeSend(chatId, '⚠️ Need a scene description after character name.');
    }

    await safeSend(chatId, `🎬 Reed: Building video — ${character} "${sceneDesc}" (5s Seedance)...`);
    const result = await generateVideo(character, sceneDesc);
    if (!result) await safeSend(chatId, '⚠️ Reed: Video generation failed.');
  } catch (err) {
    console.error('[reed-scenevideo]', err.message);
    await safeSend(chatId, `⚠️ Reed video error: ${err.message.slice(0, 200)}`);
  }
});

// ── /predict — Predictive Intelligence completion engine ─────────────────────
bot.onText(/^\/predict(?:@\w+)?\s+(.+)$/s, async (msg, match) => {
  const chatId = msg.chat.id;
  const seed = match[1].trim();
  if (!seed) return safeSend(chatId, 'Usage: /predict <seed text>');

  safeSend(chatId, `🔮 Running prediction on: "${seed.slice(0, 80)}..."`);

  try {
    const { execSync } = require('child_process');
    const result = execSync(
      `source ~/cathedral-venv/bin/activate && python3 ~/Cathedral/predictive-complete.py "${seed.replace(/"/g, '\\"')}"`,
      { shell: '/bin/zsh', timeout: 180000, maxBuffer: 1024 * 1024, encoding: 'utf8' }
    );

    // Extract the completion section from output
    const completionMatch = result.match(/COMPLETION \(Grade .+?\)\n={60}\n([\s\S]+?)\n={60}/);
    const gradeMatch = result.match(/Grade (\w) — (\d+)\/100/);

    if (completionMatch) {
      const grade = gradeMatch ? gradeMatch[1] : '?';
      const score = gradeMatch ? gradeMatch[2] : '?';
      const emoji = { A: '🟢', B: '🔵', C: '🟡', D: '🟠', F: '🔴' }[grade] || '⚪';
      safeSend(chatId, `${emoji} *Prediction — Grade ${grade} (${score}/100)*\n\n${completionMatch[1]}`, { parse_mode: 'Markdown' });
    } else {
      // Fallback: send last 3000 chars of output
      safeSend(chatId, result.slice(-3000));
    }
  } catch (err) {
    console.error('[predict]', err.message);
    safeSend(chatId, `❌ Prediction failed: ${err.message.slice(0, 200)}`);
  }
});

// ── /gaps — Predictive Intelligence structural holes + seeds ─────────────────
bot.onText(/^\/gaps(?:@\w+)?$/i, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const seedsPath = path.join(process.env.HOME, 'Cathedral', 'predictive-intelligence', 'autonomous-seeds.json');
    const graphPath = path.join(process.env.HOME, 'Cathedral', 'predictive-intelligence', 'knowledge-graph.json');

    if (!fs.existsSync(seedsPath) || !fs.existsSync(graphPath)) {
      return safeSend(chatId, '⚠️ Predictive intelligence not built yet. Run: python3 ~/Cathedral/predictive-graph.py --all');
    }

    const seeds = JSON.parse(fs.readFileSync(seedsPath, 'utf8'));
    const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
    const stats = graph.stats || {};

    let msg_text = `🧠 *Predictive Intelligence*\n`;
    msg_text += `Nodes: ${stats.nodes || '?'} | Edges: ${stats.edges || '?'} | Communities: ${stats.communities || '?'}\n`;
    msg_text += `Predicted edges: ${stats.predicted_edges || 0} | Contradictions: ${stats.contradictions || 0}\n\n`;

    msg_text += `*Top Bridge Nodes:*\n`;
    (stats.top_bridge_nodes || []).slice(0, 5).forEach(b => {
      msg_text += `  • [${b.domain}] ${b.title.slice(0, 50)}\n`;
    });

    msg_text += `\n*Autonomous Seeds (questions to investigate):*\n`;
    seeds.slice(0, 8).forEach((s, i) => {
      const pct = Math.round(s.priority * 100);
      const emoji = s.type === 'structural_hole' ? '🕳️' : s.type === 'predicted_bridge' ? '🌉' : '💎';
      msg_text += `\n${emoji} *(${pct}%)* ${s.question.slice(0, 120)}\n`;
    });

    msg_text += `\n🗺️ Interactive map: localhost:8080/predictive/map`;

    safeSend(chatId, msg_text, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('[gaps]', err.message);
    safeSend(chatId, `❌ ${err.message.slice(0, 200)}`);
  }
});

// ── /predict-rebuild — Regenerate predictive intelligence graph ──────────────
bot.onText(/^\/predict-rebuild(?:@\w+)?$/i, async (msg) => {
  const chatId = msg.chat.id;
  safeSend(chatId, '🔄 Rebuilding predictive intelligence graph...');
  try {
    const { exec } = require('child_process');
    exec(
      'source ~/cathedral-venv/bin/activate && python3 ~/Cathedral/predictive-graph.py --all',
      { shell: '/bin/zsh', timeout: 600000, maxBuffer: 2 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          safeSend(chatId, `❌ Rebuild failed: ${err.message.slice(0, 200)}`);
          return;
        }
        const summaryMatch = stdout.match(/PREDICTIVE INTELLIGENCE — SUMMARY\n={60}\n([\s\S]+?)$/);
        if (summaryMatch) {
          safeSend(chatId, `✅ *Predictive Intelligence rebuilt*\n\`\`\`\n${summaryMatch[1].slice(0, 1500)}\n\`\`\``, { parse_mode: 'Markdown' });
        } else {
          safeSend(chatId, '✅ Rebuild complete.');
        }
      }
    );
  } catch (err) {
    safeSend(chatId, `❌ ${err.message.slice(0, 200)}`);
  }
});

// ── /moves — Detect cognitive moves in a message ────────────────────────────
bot.onText(/^\/moves(?:@\w+)?\s+(.+)$/s, async (msg, match) => {
  const chatId = msg.chat.id;
  try {
    const { detectMoves, getParallels } = require('./move-detector.cjs');
    const text = match[1].trim();
    const moves = detectMoves(text);
    if (moves.length === 0) {
      safeSend(chatId, 'No cognitive move detected in that message.');
      return;
    }
    const lines = ['*Cognitive Moves Detected:*\n'];
    for (const m of moves) {
      lines.push(`*${m.name}* (${m.confidence}, score ${m.score})`);
      lines.push(`${m.description}`);
      if (m.keywords.length) lines.push(`Keywords: ${m.keywords.join(', ')}`);
      const pars = getParallels(m.move, null, 2);
      for (const p of pars) {
        if (p.source === 'cathedral') {
          lines.push(`  -> ${p.pattern} [${(p.domains || []).join(', ')}]`);
        } else if (p.source === 'bridge') {
          lines.push(`  -> ANCIENT: "${p.ancient}" = MODERN: "${p.modern}"`);
        }
      }
      lines.push('');
    }
    safeSend(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
  } catch (err) {
    safeSend(chatId, `Error: ${err.message.slice(0, 200)}`);
  }
});

// ── /ling — Ling AI Tech Reviewer (advisory + content pipeline) ─────────────
bot.onText(/^\/ling(?:@\w+)?(?:\s+(.*))?$/s, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = (match?.[1] || '').trim();

  try {
    const { askLing, generateDraft, getStatus, getDrafts, readDraft, logReview, logPosition } = await import('./ling-engine.js');

    // /ling — status
    if (!input) {
      const s = getStatus();
      let status = `🔴 *LING — HK AI Tech Reviewer*\n\n`;
      status += `Published: ${s.published} posts\n`;
      status += `Drafts: ${s.drafts} pending\n`;
      status += `Reviews logged: ${s.reviews}\n`;
      status += `Positions: ${s.positions}\n`;
      status += `Predictions: ${s.predictions}\n`;
      status += `GitHub drops: ${s.github_drops}\n`;
      status += `Conversations: ${s.conversations}\n\n`;
      status += `Commands:\n`;
      status += `/ling [question] — ask Ling anything\n`;
      status += `/ling draft [pillar] [topic] — generate draft post\n`;
      status += `/ling drafts — list pending drafts\n`;
      status += `/ling read [filename] — read a draft\n`;
      status += `/ling log [tool] [verdict] [summary] — log a review\n`;
      status += `/ling position [topic] [stance] — log a position`;
      return safeSend(chatId, status, { parse_mode: 'Markdown' });
    }

    // /ling drafts — list pending
    if (input.toLowerCase() === 'drafts') {
      const drafts = getDrafts();
      if (drafts.length === 0) return safeSend(chatId, 'No drafts pending. Use `/ling draft [pillar] [topic]` to generate one.', { parse_mode: 'Markdown' });
      let list = '🔴 *LING Drafts*\n\n';
      drafts.slice(0, 10).forEach(d => { list += `• \`${d}\`\n`; });
      list += `\n/ling read [filename] to view`;
      return safeSend(chatId, list, { parse_mode: 'Markdown' });
    }

    // /ling read [filename]
    if (input.toLowerCase().startsWith('read ')) {
      const filename = input.slice(5).trim();
      const content = readDraft(filename);
      if (!content) return safeSend(chatId, `Draft not found: ${filename}`);
      return safeSend(chatId, content);
    }

    // /ling draft [pillar] [topic]
    if (input.toLowerCase().startsWith('draft ')) {
      const parts = input.slice(6).trim();
      const spaceIdx = parts.indexOf(' ');
      if (spaceIdx < 0) return safeSend(chatId, 'Usage: `/ling draft [pillar] [topic]`\nPillars: tool_reviews, setup_guides, github_drops, hk_landscape, sovereignty, myth_demolition', { parse_mode: 'Markdown' });

      const pillar = parts.slice(0, spaceIdx).trim();
      const topic = parts.slice(spaceIdx + 1).trim();

      safeSend(chatId, `🔴 Ling is drafting a ${pillar.replace(/_/g, ' ')} post about "${topic}"...`);

      const result = await generateDraft(pillar, topic);
      if (result.error) return safeSend(chatId, `❌ ${result.error}`);

      safeSend(chatId, `✅ Draft saved: \`${result.filename}\`\n\n${result.draft}`, { parse_mode: 'Markdown' });
      return;
    }

    // /ling log [tool] [verdict] [summary]
    if (input.toLowerCase().startsWith('log ')) {
      const parts = input.slice(4).trim().split(/\s+/);
      if (parts.length < 3) return safeSend(chatId, 'Usage: /ling log [tool] [red|yellow|green] [summary]');
      const tool = parts[0];
      const verdict = parts[1];
      const summary = parts.slice(2).join(' ');
      logReview(tool, verdict, summary);
      return safeSend(chatId, `🔴 Logged: ${tool} — ${verdict}. Ling remembers.`);
    }

    // /ling position [topic] [stance]
    if (input.toLowerCase().startsWith('position ')) {
      const parts = input.slice(9).trim();
      const spaceIdx = parts.indexOf(' ');
      if (spaceIdx < 0) return safeSend(chatId, 'Usage: /ling position [topic] [stance]');
      const topic = parts.slice(0, spaceIdx).trim();
      const stance = parts.slice(spaceIdx + 1).trim();
      logPosition(topic, stance);
      return safeSend(chatId, `🔴 Position logged: ${topic} — "${stance}"`);
    }

    // /ling [question] — advisory mode
    safeSend(chatId, '🔴 Ling is thinking...');
    const response = await askLing(input);
    if (!response) return safeSend(chatId, '❌ No response from Ling.');
    safeSend(chatId, `🔴 *LING*\n\n${response}`, { parse_mode: 'Markdown' });

  } catch (err) {
    safeSend(chatId, `❌ ${err.message.slice(0, 200)}`);
  }
});

// ── /trial — Paper Trial Dashboard ──────────────────────────────────────────
bot.onText(/^\/trial(?:@\w+)?(?:\s+(.+))?$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  try {
    const { formatTrialReport, getTrialStats } = await import('./paper-trial-tracker.js');
    const trialName = match?.[1]?.trim();
    if (trialName) {
      const stats = getTrialStats(trialName);
      if (!stats) return safeSend(chatId, `Unknown trial: ${trialName}. Try: content, trading, grants, leads, products`);
      let detail = `📋 *${stats.name}*\n`;
      detail += `Status: ${stats.status} | ${stats.daysActive} days active\n`;
      detail += `Votes: ${stats.total} (${stats.approvals} ✅ / ${stats.rejections} ❌ / ${stats.embarrassments} 🚫 / ${stats.edits} ✏️)\n`;
      detail += `Rate: ${stats.rate} | Embarrass: ${stats.embarrassRate}\n\n`;
      detail += `*Graduation checks:*\n`;
      for (const [check, passed] of Object.entries(stats.graduation)) {
        detail += `  ${passed ? '✅' : '⬜'} ${check}\n`;
      }
      detail += `\n${stats.message}`;
      safeSend(chatId, detail, { parse_mode: 'Markdown' });
    } else {
      safeSend(chatId, formatTrialReport(), { parse_mode: 'Markdown' });
    }
  } catch (err) {
    safeSend(chatId, `❌ ${err.message.slice(0, 200)}`);
  }
});

// ── /simpsons — Simpsons Temporal Forensics summary ─────────────────────────
bot.onText(/^\/simpsons(?:@\w+)?$/i, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const matchesPath = path.join(process.env.HOME, 'nanoclaw', 'simpsons-forensics', 'matches.json');
    const watchlistPath = path.join(process.env.HOME, 'nanoclaw', 'simpsons-forensics', 'watchlist.json');

    if (!fs.existsSync(matchesPath) || !fs.existsSync(watchlistPath)) {
      return safeSend(chatId, 'Simpsons forensics data not generated yet. Run the pipeline first.');
    }

    const matches = JSON.parse(fs.readFileSync(matchesPath, 'utf8'));
    const watchlist = JSON.parse(fs.readFileSync(watchlistPath, 'utf8'));

    const avgScore = matches.length > 0
      ? (matches.reduce((s, m) => s + (m.anomaly_score || 0), 0) / matches.length).toFixed(1)
      : 0;

    const topWatch = [...watchlist].sort((a, b) => (b.specificity || 0) - (a.specificity || 0)).slice(0, 3);
    const mostAnom = matches.length > 0
      ? [...matches].sort((a, b) => (b.anomaly_score || 0) - (a.anomaly_score || 0))[0]
      : null;

    let text = `Simpsons Temporal Forensics\n\n`;
    text += `Verified Hits: ${matches.length} (anomaly score avg: ${avgScore})\n`;
    text += `Unfulfilled Predictions: ${watchlist.length}\n\n`;
    text += `Top 3 Watchlist Items:\n`;
    topWatch.forEach((w, i) => {
      const ep = w.season && w.number ? `S${w.season}E${String(w.number).padStart(2,'0')}` : w.episode || '?';
      text += `${i + 1}. ${(w.claim || '').slice(0, 80)} (${ep}, specificity: ${w.specificity || '?'})\n`;
    });
    if (mostAnom) {
      text += `\nMost Anomalous: ${mostAnom.episode} (score: ${mostAnom.anomaly_score})`;
    }
    text += `\n\nFull dashboard: localhost:8080/simpsons`;

    await safeSend(chatId, text);
  } catch (err) {
    await safeSend(chatId, `Simpsons forensics error: ${err.message.slice(0, 200)}`);
  }
});

// ── Taste Map commands ──────────────────────────────────────────────────────

bot.onText(/^\/taste(?:@\w+)?\s*$/, async (msg) => {
  safeSend(msg.chat.id, tasteMap.getHelpText(), { parse_mode: 'Markdown' });
});

bot.onText(/^\/taste(?:@\w+)?\s+status\s*$/i, async (msg) => {
  safeSend(msg.chat.id, tasteMap.formatStats(), { parse_mode: 'Markdown' });
});

bot.onText(/^\/taste(?:@\w+)?\s+music\s*$/i, async (msg) => {
  safeSend(msg.chat.id, tasteMap.formatProfile('music'), { parse_mode: 'Markdown' });
});

bot.onText(/^\/taste(?:@\w+)?\s+visual\s*$/i, async (msg) => {
  safeSend(msg.chat.id, tasteMap.formatProfile('visual_style'), { parse_mode: 'Markdown' });
});

bot.onText(/^\/taste(?:@\w+)?\s+writing\s*$/i, async (msg) => {
  safeSend(msg.chat.id, tasteMap.formatProfile('writing_voice'), { parse_mode: 'Markdown' });
});

bot.onText(/^\/taste(?:@\w+)?\s+teaching\s*$/i, async (msg) => {
  safeSend(msg.chat.id, tasteMap.formatProfile('teaching_tone'), { parse_mode: 'Markdown' });
});

bot.onText(/^\/taste(?:@\w+)?\s+energy\s*$/i, async (msg) => {
  safeSend(msg.chat.id, tasteMap.formatProfile('class_energy'), { parse_mode: 'Markdown' });
});

bot.onText(/^\/taste(?:@\w+)?\s+voices\s*$/i, async (msg) => {
  const refs = getVoiceReferences();
  let text = '🗣 *Voice References*\n\n';
  refs.forEach(r => {
    text += `*${r.name}* (${r.platform})\n`;
    text += `  ${r.signal}\n`;
    if (r.tension) text += `  ⚡ _${r.tension}_\n`;
    if (r.resolution) text += `  ✅ _${r.resolution}_\n`;
    text += '\n';
  });
  text += `\n✍️ *Pattern:* _${getVoicePattern()}_`;
  safeSend(msg.chat.id, text, { parse_mode: 'Markdown' });
});

bot.onText(/^\/taste(?:@\w+)?\s+add\s+music\s+(.+)$/i, async (msg, match) => {
  const input = match[1].trim();
  const chatId = msg.chat.id;
  // Parse "artist - track" or just "artist"
  const parts = input.split(' - ');
  const anchor = {
    artist: parts[0].trim(),
    context: 'manual add via telegram'
  };
  if (parts[1]) anchor.tracks = [parts[1].trim()];

  addAnchor('music', 'anchors_class_energy', anchor);
  safeSend(chatId, `✅ Added music anchor: *${anchor.artist}*${anchor.tracks ? ' — ' + anchor.tracks[0] : ''}`, { parse_mode: 'Markdown' });
});

bot.onText(/^\/taste(?:@\w+)?\s+reject\s+(\w+)\s+(.+)$/i, async (msg, match) => {
  const domain = match[1].trim();
  const reason = match[2].trim();
  const chatId = msg.chat.id;
  const domainMap = { music: 'music', visual: 'visual_style', writing: 'writing_voice', teaching: 'teaching_tone', energy: 'class_energy' };
  const actualDomain = domainMap[domain] || domain;

  const { addRejection } = await import('./taste-map-api.js');
  const result = addRejection(actualDomain, reason);
  if (result) {
    safeSend(chatId, `✅ Added rejection to *${actualDomain}*: "${reason}"`, { parse_mode: 'Markdown' });
  } else {
    safeSend(chatId, `❌ Unknown domain: ${domain}. Try: music, visual, writing, teaching, energy`);
  }
});

bot.onText(/^\/taste(?:@\w+)?\s+elicit\s+(\w+)\s*$/i, async (msg, match) => {
  const domain = match[1].trim();
  const chatId = msg.chat.id;
  const domainMap = { music: 'music', visual: 'visual_style', writing: 'writing_voice', teaching: 'teaching_tone', energy: 'class_energy' };
  const actualDomain = domainMap[domain] || domain;
  const result = tasteMap.startSession(chatId, actualDomain);
  safeSend(chatId, result, { parse_mode: 'Markdown' });
});

bot.onText(/^\/taste(?:@\w+)?\s+stop\s*$/i, async (msg) => {
  const result = tasteMap.stopSession(msg.chat.id);
  safeSend(msg.chat.id, result);
});

// ── Taste Dimensions commands ────────────────────────────────────────────────

bot.onText(/^\/taste(?:@\w+)?\s+health\s*$/i, async (msg) => {
  safeSend(msg.chat.id, tasteMap.formatHealth());
});

bot.onText(/^\/taste(?:@\w+)?\s+dimensions\s*$/i, async (msg) => {
  safeSend(msg.chat.id, tasteMap.formatDimensions());
});

bot.onText(/^\/taste(?:@\w+)?\s+coherence\s*$/i, async (msg) => {
  safeSend(msg.chat.id, tasteMap.formatCoherence());
});

bot.onText(/^\/taste(?:@\w+)?\s+drills\s*$/i, async (msg) => {
  safeSend(msg.chat.id, tasteMap.formatProfile('boxing_drills'));
});

// ── Curator commands ──────────────────────────────────────────────────────

bot.onText(/^\/curator(?:@\w+)?\s*$/, async (msg) => {
  safeSend(msg.chat.id, tasteCurator.formatStats(), { parse_mode: 'Markdown' });
});

bot.onText(/^\/curator(?:@\w+)?\s+scan(?:\s+(\w+))?\s*$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const source = match[1] || 'boxing_yt';
  safeSend(chatId, `Scanning source: ${source}...`);

  try {
    const result = await tasteCurator.scanSource(source);
    safeSend(chatId, `*Curator Scan Complete*\n\nSource: ${result.source}\nAPI calls: ${result.apiCalls}\nNew candidates: ${result.newCandidates}\nTotal pending: ${result.totalPending}`, { parse_mode: 'Markdown' });
  } catch (err) {
    safeSend(chatId, `Curator scan failed: ${err.message}`);
  }
});

bot.onText(/^\/curator(?:@\w+)?\s+review\s*$/i, async (msg) => {
  const chatId = msg.chat.id;
  const candidate = tasteCurator.getNextCandidate();
  if (!candidate) {
    return safeSend(chatId, 'No pending candidates. Run /curator scan first.');
  }

  const text = tasteCurator.formatCandidate(candidate);
  safeSend(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        { text: 'YES', callback_data: `curator_yes:${candidate.videoId}` },
        { text: 'NO', callback_data: `curator_no:${candidate.videoId}` },
        { text: 'SKIP', callback_data: `curator_skip:${candidate.videoId}` }
      ]]
    }
  });
});

bot.onText(/^\/curator(?:@\w+)?\s+sources\s*$/i, async (msg) => {
  const sources = tasteCurator.getSources();
  let text = '*Curator Sources*\n\n';
  for (const [key, src] of Object.entries(sources)) {
    text += `*${key}* (${src.type})\n`;
    if (src.channels) {
      src.channels.forEach(ch => { text += `  - ${ch.name}\n`; });
    }
    text += '\n';
  }
  safeSend(msg.chat.id, text, { parse_mode: 'Markdown' });
});

// ── Architect commands ──────────────────────────────────────────────────────

bot.onText(/^\/architect(?:@\w+)?\s*$/, async (msg) => {
  safeSend(msg.chat.id, `⚙️ *Architect — Intent to Plan*

*Commands:*
\`/architect <intent>\` — generate structured plan
\`/architect status\` — list all generated plans
\`/architect deps <project>\` — show dependency graph

*Example:*
\`/architect build online boxing program\`
\`/architect add speed bag rhythm tracker to gym\`

Architect scans Cathedral infrastructure, references existing assets, and outputs: dependency graph + task sequence + resource map.`, { parse_mode: 'Markdown' });
});

bot.onText(/^\/architect(?:@\w+)?\s+status\s*$/i, async (msg) => {
  const chatId = msg.chat.id;
  const plans = listPlans();
  if (plans.length === 0) {
    return safeSend(chatId, '⚙️ No plans generated yet. Use `/architect <intent>` to create one.', { parse_mode: 'Markdown' });
  }
  let text = '⚙️ *Architect Plans*\n\n';
  plans.forEach(p => {
    const date = p.generatedAt ? p.generatedAt.split('T')[0] : '?';
    text += `• *${p.project || p.file}* — ${p.phases} phases (${date})\n`;
    if (p.intent) text += `  _${p.intent.slice(0, 80)}_\n`;
  });
  safeSend(chatId, text, { parse_mode: 'Markdown' });
});

bot.onText(/^\/architect(?:@\w+)?\s+(?!status\s*$)(.+)$/s, async (msg, match) => {
  const chatId = msg.chat.id;
  const intent = match[1].trim();

  await safeSend(chatId, `⚙️ Architect scanning infrastructure and generating plan...\n_"${intent.slice(0, 100)}"_`, { parse_mode: 'Markdown' });

  try {
    const plan = await generatePlan(intent);

    // Send Telegram summary
    const telegramMsg = formatPlanTelegram(plan);
    await safeSend(chatId, telegramMsg, { parse_mode: 'Markdown' });

    // Generate and save HTML
    const html = generateHTML(plan);
    const slug = plan.project || 'plan';
    const htmlPath = path.join(process.env.HOME, 'nanoclaw', 'architect-output', `${slug}.html`);
    fs.writeFileSync(htmlPath, html);

    // Deposit to vault
    const vaultPath = depositToVault(plan);

    await safeSend(chatId, `📄 HTML: \`${htmlPath}\`\n📁 Vault: \`${path.basename(vaultPath)}\`\n🔗 Open: localhost:8080 (serve via cath-bridge)`, { parse_mode: 'Markdown' });

  } catch (err) {
    console.error('[architect]', err.message);
    await safeSend(chatId, `❌ Architect failed: ${err.message.slice(0, 300)}`);
  }
});

// ── DJ Curator commands ─────────────────────────────────────────────────────

bot.onText(/^\/(?:playlist|dj)(?:@\w+)?\s*$/, async (msg) => {
  safeSend(msg.chat.id, `🎵 *DJ Curator — Boxing Class Playlists*

*Generate:*
\`/playlist\` — standard class playlist
\`/playlist <profile>\` — specific profile
\`/playlist vibe <mood>\` — mood override

*Profiles:*
\`standard\` — default 60min class
\`la_habana\` — reggaeton-heavy (Cuban boxing)
\`old_school\` — 90s/2000s R&B + hip-hop
\`war_mode\` — maximum aggression
\`wildcard_heavy\` — genre-jumping, surprise picks

*After class:*
\`/playlist rate <1-5> [notes]\` — rate last playlist
\`/playlist history\` — recent playlists + ratings
\`/playlist profiles\` — list all profiles`, { parse_mode: 'Markdown' });
});

bot.onText(/^\/(?:playlist|dj)(?:@\w+)?\s+profiles?\s*$/i, async (msg) => {
  safeSend(msg.chat.id, djCurator.listProfiles(), { parse_mode: 'Markdown' });
});

bot.onText(/^\/(?:playlist|dj)(?:@\w+)?\s+history\s*$/i, async (msg) => {
  safeSend(msg.chat.id, djCurator.formatHistoryTelegram(), { parse_mode: 'Markdown' });
});

bot.onText(/^\/(?:playlist|dj)(?:@\w+)?\s+rate\s+(\d)\s*(.*)?$/i, async (msg, match) => {
  const rating = parseInt(match[1]);
  const notes = match[2]?.trim() || '';
  if (rating < 1 || rating > 5) return safeSend(msg.chat.id, '❌ Rating must be 1-5');
  const result = djCurator.rateLastPlaylist(rating, notes);
  safeSend(msg.chat.id, `🎵 ${result}`);
});

bot.onText(/^\/(?:playlist|dj)(?:@\w+)?\s+vibe\s+(.+)$/i, async (msg, match) => {
  const mood = match[1].trim();
  const chatId = msg.chat.id;
  await safeSend(chatId, `🎵 Generating ${mood} playlist...`);
  try {
    // Map mood to closest profile
    const moodMap = {
      'war': 'war_mode', 'aggressive': 'war_mode', 'hard': 'war_mode', 'intense': 'war_mode',
      'cuba': 'la_habana', 'cuban': 'la_habana', 'latin': 'la_habana', 'reggaeton': 'la_habana', 'habana': 'la_habana',
      'old school': 'old_school', 'classic': 'old_school', 'oldschool': 'old_school', '90s': 'old_school', 'vibe': 'old_school',
      'wild': 'wildcard_heavy', 'surprise': 'wildcard_heavy', 'random': 'wildcard_heavy', 'fun': 'wildcard_heavy',
      'chill': 'old_school', 'flow': 'standard'
    };
    const profile = moodMap[mood.toLowerCase()] || 'standard';
    const playlist = djCurator.generatePlaylist(profile, { mood });
    if (djCurator.hasSpotifyCredentials()) {
      await djCurator.enrichWithSpotify(playlist);
    }
    await safeSend(chatId, djCurator.formatPlaylistTelegram(playlist), { parse_mode: 'Markdown' });
  } catch (err) {
    safeSend(chatId, `❌ DJ error: ${err.message}`);
  }
});

bot.onText(/^\/(?:playlist|dj)(?:@\w+)?\s+(?!profiles?|history|rate|vibe)(\w+)\s*$/i, async (msg, match) => {
  const profileName = match[1].trim().toLowerCase();
  const chatId = msg.chat.id;
  await safeSend(chatId, `🎵 Generating ${profileName} playlist...`);
  try {
    const playlist = djCurator.generatePlaylist(profileName);
    if (djCurator.hasSpotifyCredentials()) {
      await djCurator.enrichWithSpotify(playlist);
    }
    await safeSend(chatId, djCurator.formatPlaylistTelegram(playlist), { parse_mode: 'Markdown' });
  } catch (err) {
    safeSend(chatId, `❌ DJ error: ${err.message}`);
  }
});

// ── Sound Studio commands ────────────────────────────────────────────────────

bot.onText(/^\/sound(?:@\w+)?\s*$/, async (msg) => {
  safeSend(msg.chat.id, soundStudio.formatStatusTelegram(), { parse_mode: 'Markdown' });
});

bot.onText(/^\/sound(?:@\w+)?\s+status\s*$/i, async (msg) => {
  safeSend(msg.chat.id, soundStudio.formatStatusTelegram(), { parse_mode: 'Markdown' });
});

bot.onText(/^\/sound(?:@\w+)?\s+voice\s+(.+)$/s, async (msg, match) => {
  const text = match[1].trim();
  const chatId = msg.chat.id;
  await safeSend(chatId, '🗣 Generating voiceover...');
  try {
    const result = await soundStudio.speak(text);
    await bot.sendDocument(chatId, result.outputPath, { caption: `🗣 Voiceover (${(result.durationMs / 1000).toFixed(1)}s)` });
  } catch (err) {
    safeSend(chatId, `❌ Voice error: ${err.message.slice(0, 200)}`);
  }
});

bot.onText(/^\/sound(?:@\w+)?\s+clone\s+(.+)$/s, async (msg, match) => {
  const text = match[1].trim();
  const chatId = msg.chat.id;
  await safeSend(chatId, '🗣 Generating clone voice (Chatterbox TTS)... this takes ~30-60s');
  try {
    const result = await soundStudio.speakAsClone(text);
    await bot.sendDocument(chatId, result.outputPath, { caption: `🗣 Clone voice (${(result.durationMs / 1000).toFixed(1)}s)` });
  } catch (err) {
    safeSend(chatId, `❌ Clone error: ${err.message.slice(0, 200)}`);
  }
});

bot.onText(/^\/sound(?:@\w+)?\s+instrumental\s+(.+)$/s, async (msg, match) => {
  const text = match[1].trim();
  const chatId = msg.chat.id;
  await safeSend(chatId, '🎵 Generating instrumental via Replicate MusicGen... (30-90s)');
  try {
    const result = await soundStudio.generateInstrumental(text);
    await bot.sendDocument(chatId, result.outputPath, { caption: `🎵 Instrumental: "${text.slice(0, 60)}"\n${(result.durationMs / 1000).toFixed(0)}s generation time` });
  } catch (err) {
    safeSend(chatId, `❌ Instrumental error: ${err.message.slice(0, 200)}`);
  }
});

bot.onText(/^\/sound(?:@\w+)?\s+podcast\s+(.+)$/s, async (msg, match) => {
  const topic = match[1].trim();
  const chatId = msg.chat.id;
  await safeSend(chatId, `🎙 Generating podcast: "${topic}"...\nScript → voice → concatenate (1-3 min)`);
  try {
    // Search vault for content on this topic
    let content = '';
    try {
      const vaultResults = execFileSync('python3', [
        path.join(process.env.HOME, 'nanoclaw', 'vault_reader.py'),
        'search', topic, '--top_k', '10', '--json'
      ], { timeout: 5000, encoding: 'utf-8' });
      const nuggets = JSON.parse(vaultResults);
      content = nuggets.map(n => `[${n.domain || ''}] ${n.title}: ${n.first_line || ''}`).join('\n\n');
    } catch {}

    if (!content) content = topic; // fallback: just use the topic as content

    const result = await soundStudio.generatePodcast(content, topic);
    await bot.sendDocument(chatId, result.outputPath, {
      caption: `🎙 Podcast: "${topic}"\n${result.segments} segments · ${(result.durationMs / 1000).toFixed(0)}s generation`
    });
    // Send transcript too
    if (result.transcriptPath && fs.existsSync(result.transcriptPath)) {
      await bot.sendDocument(chatId, result.transcriptPath, { caption: '📝 Transcript' });
    }
  } catch (err) {
    safeSend(chatId, `❌ Podcast error: ${err.message.slice(0, 300)}`);
  }
});

bot.onText(/^\/sound(?:@\w+)?\s+transcribe\s*$/i, async (msg) => {
  const chatId = msg.chat.id;
  // Check if replying to a voice/audio message
  const reply = msg.reply_to_message;
  if (!reply) {
    return safeSend(chatId, '💡 Reply to a voice note or audio file with `/sound transcribe`', { parse_mode: 'Markdown' });
  }

  const fileId = reply.voice?.file_id || reply.audio?.file_id || reply.document?.file_id;
  if (!fileId) {
    return safeSend(chatId, '❌ Reply must be a voice note, audio, or document file.');
  }

  await safeSend(chatId, '📝 Transcribing...');
  try {
    const fileLink = await bot.getFileLink(fileId);
    const tmpPath = `/tmp/sound-studio-input-${Date.now()}.ogg`;
    execSync(`curl -sL "${fileLink}" -o "${tmpPath}"`, { timeout: 60000 });

    const result = soundStudio.transcribe(tmpPath);
    const preview = result.text.slice(0, 3000);
    await safeSend(chatId, `📝 *Transcription* (${result.text.length} chars, ${(result.durationMs / 1000).toFixed(1)}s)\n\n${preview}`, { parse_mode: 'Markdown' });

    // Clean up
    try { fs.unlinkSync(tmpPath); } catch {}
  } catch (err) {
    safeSend(chatId, `❌ Transcribe error: ${err.message.slice(0, 300)}`);
  }
});

// ── Drill Generator commands ─────────────────────────────────────────────────

bot.onText(/^\/drill(?:@\w+)?\s+([a-zA-Z].+)$/i, async (msg, match) => {
  const name = match[1].trim();
  const drillText = drillGen.formatDrillTelegram(name);
  safeSend(msg.chat.id, drillText, { parse_mode: 'Markdown' });

  // Log the generated drill
  try {
    const drill = drillGen.generateDrill(name);
    drillGen.logDrill(name, drill);
  } catch {}
});

// ── Curriculum commands ──────────────────────────────────────────────────────

bot.onText(/^\/progress(?:@\w+)?\s*$/, async (msg) => {
  safeSend(msg.chat.id, curriculum.formatAllProgressTelegram(), { parse_mode: 'Markdown' });
});

bot.onText(/^\/progress(?:@\w+)?\s+([a-zA-Z].+)$/i, async (msg, match) => {
  const name = match[1].trim();
  safeSend(msg.chat.id, curriculum.formatProgressTelegram(name), { parse_mode: 'Markdown' });
});

bot.onText(/^\/advance(?:@\w+)?\s+([a-zA-Z].+)$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;
  const name = match[1].trim();
  const result = curriculum.advanceMember(name, 'coach');
  if (result.status === 'ok') {
    safeSend(chatId, `*${name}* advanced to Block ${result.new_block}: ${result.block_name}\n${result.block_focus}`, { parse_mode: 'Markdown' });
  } else {
    safeSend(chatId, result.message);
  }
});

bot.onText(/^\/setblock(?:@\w+)?\s+(.+?)\s+(\d+)\s*$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;
  const name = match[1].trim();
  const block = parseInt(match[2]);
  const result = curriculum.setMemberBlock(name, block);
  if (result.status === 'ok') {
    safeSend(chatId, `*${name}* set to Block ${result.block}: ${result.block_name}`, { parse_mode: 'Markdown' });
  } else {
    safeSend(chatId, result.message);
  }
});

bot.onText(/^\/block(?:@\w+)?\s+(\d+)\s*$/i, async (msg, match) => {
  const num = parseInt(match[1]);
  const info = curriculum.getBlockInfo(num);
  safeSend(msg.chat.id, info || `Block ${num} not found (1-10)`, { parse_mode: 'Markdown' });
});

// ── Attendance commands ──────────────────────────────────────────────────────

bot.onText(/^\/attendance(?:@\w+)?\s*$/, async (msg) => {
  safeSend(msg.chat.id, attendance.formatSummaryTelegram(7), { parse_mode: 'Markdown' });
});

bot.onText(/^\/attendance(?:@\w+)?\s+(\d+)d?\s*$/i, async (msg, match) => {
  const days = parseInt(match[1]) || 7;
  safeSend(msg.chat.id, attendance.formatSummaryTelegram(days), { parse_mode: 'Markdown' });
});

bot.onText(/^\/attendance(?:@\w+)?\s+([a-zA-Z].+)$/i, async (msg, match) => {
  const name = match[1].trim();
  safeSend(msg.chat.id, attendance.formatAttendanceTelegram(name), { parse_mode: 'Markdown' });
});

// ── Face Registry commands ───────────────────────────────────────────────────

bot.onText(/^\/members(?:@\w+)?\s*$/, async (msg) => {
  const result = await faceRegistry.listMembers();
  safeSend(msg.chat.id, faceRegistry.formatMemberListTelegram(result), { parse_mode: 'Markdown' });
});

bot.onText(/^\/enroll(?:@\w+)?\s+(.+)$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;
  const name = match[1].trim();
  const reply = msg.reply_to_message;

  if (!reply || !reply.photo) {
    return safeSend(chatId, 'Reply to a photo with `/enroll [name]`', { parse_mode: 'Markdown' });
  }

  safeSend(chatId, `Enrolling ${name}...`);

  try {
    const fileId = reply.photo[reply.photo.length - 1].file_id;
    const file = await bot.getFile(fileId);
    const tmpPath = `/tmp/enroll-${Date.now()}.jpg`;
    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const res = await fetch(fileUrl);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(tmpPath, buffer);

    const result = await faceRegistry.enrollMember(name, tmpPath);
    try { fs.unlinkSync(tmpPath); } catch {}

    if (result.status === 'ok') {
      safeSend(chatId, `Enrolled *${name}*`, { parse_mode: 'Markdown' });
    } else {
      safeSend(chatId, `Enrollment failed: ${result.message}`);
    }
  } catch (err) {
    safeSend(chatId, `Error: ${err.message.slice(0, 200)}`);
  }
});

bot.onText(/^\/unenroll(?:@\w+)?\s+(.+)$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;
  const name = match[1].trim();
  const result = await faceRegistry.deleteMember(name);
  safeSend(chatId, result.status === 'ok' ? `Removed ${name}` : result.message);
});

bot.onText(/^\/whoisthis(?:@\w+)?\s*$/i, async (msg) => {
  const chatId = msg.chat.id;
  const reply = msg.reply_to_message;

  if (!reply || !reply.photo) {
    return safeSend(chatId, 'Reply to a photo with `/whoisthis`', { parse_mode: 'Markdown' });
  }

  safeSend(chatId, 'Identifying...');

  try {
    const fileId = reply.photo[reply.photo.length - 1].file_id;
    const file = await bot.getFile(fileId);
    const tmpPath = `/tmp/identify-${Date.now()}.jpg`;
    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const res = await fetch(fileUrl);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(tmpPath, buffer);

    const result = await faceRegistry.identifyFaces(tmpPath);
    try { fs.unlinkSync(tmpPath); } catch {}

    safeSend(chatId, faceRegistry.formatIdentifyTelegram(result), { parse_mode: 'Markdown' });
  } catch (err) {
    safeSend(chatId, `Error: ${err.message.slice(0, 200)}`);
  }
});

// ── Intake Pipeline commands ─────────────────────────────────────────────────

bot.onText(/^\/intake(?:@\w+)?\s*$/, async (msg) => {
  safeSend(msg.chat.id, formatIntakeStatusTelegram(), { parse_mode: 'Markdown' });
});

// ── Gym Eyes v2 commands (MediaPipe + Student Profiles + Drill Engine) ───────

bot.onText(/^\/eyes(?:@\w+)?\s*$/, async (msg) => {
  safeSend(msg.chat.id, gymEyesV2.formatStatusTelegram(), { parse_mode: 'Markdown' });
});

bot.onText(/^\/eyes(?:@\w+)?\s+last\s*$/i, async (msg) => {
  const chatId = msg.chat.id;
  const analyses = gymEyesV2.listAnalyses(1);
  if (analyses.length === 0) return safeSend(chatId, '👁 No analyses yet.');

  try {
    const data = JSON.parse(fs.readFileSync(analyses[0].path, 'utf8'));
    safeSend(chatId, gymEyesV2.formatSessionTelegram(data), { parse_mode: 'Markdown' });
  } catch (err) {
    safeSend(chatId, `❌ ${err.message.slice(0, 200)}`);
  }
});

bot.onText(/^\/eyes(?:@\w+)?\s+analyze\s*$/i, async (msg) => {
  const chatId = msg.chat.id;
  const reply = msg.reply_to_message;

  if (!reply) {
    return safeSend(chatId, '💡 Reply to a video file with `/eyes analyze`', { parse_mode: 'Markdown' });
  }

  const fileId = reply.video?.file_id || reply.document?.file_id;
  if (!fileId) return safeSend(chatId, '❌ Reply must be a video or document file.');

  await safeSend(chatId, '👁 Gym Eyes v2: downloading video + running MediaPipe analysis...\nThis may take 1-5 min.');

  try {
    const fileLink = await bot.getFileLink(fileId);
    const tmpPath = `/tmp/gym-eyes-${Date.now()}.mp4`;
    execFileSync('curl', ['-sL', fileLink, '-o', tmpPath], { timeout: 120000 });

    const sessionPath = await gymEyesV2.runDetector(tmpPath);
    const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    await safeSend(chatId, gymEyesV2.formatSessionTelegram(sessionData), { parse_mode: 'Markdown' });

    try { fs.unlinkSync(tmpPath); } catch {}
  } catch (err) {
    safeSend(chatId, `❌ Gym Eyes error: ${err.message.slice(0, 300)}`);
  }
});

// /eyes student [name] — view student profile
bot.onText(/^\/eyes(?:@\w+)?\s+student\s+(.+)$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const name = match[1].trim();
  const profile = gymEyesV2.loadStudent(name);

  if (!profile) return safeSend(chatId, `❌ Student "${name}" not found. Students auto-create when they send their first video.`);

  let msg2 = `👁 *Student: ${profile.name}*\n`;
  msg2 += `Level: ${profile.level} · Stance: ${profile.stance}\n\n`;
  msg2 += gymEyesV2.formatStudentProgressTelegram(profile);
  msg2 += gymEyesV2.formatDrillsTelegram(profile);

  safeSend(chatId, msg2, { parse_mode: 'Markdown' });
});

// /analyze [fighter1] vs [fighter2] — Fight Lab (reply to video)
bot.onText(/^\/analyze(?:@\w+)?\s+(.+?)\s+vs\s+(.+)$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const fighter1 = match[1].trim();
  const fighter2 = match[2].trim();
  const reply = msg.reply_to_message;

  if (!reply) {
    return safeSend(chatId, '💡 Reply to a video with `/analyze [fighter1] vs [fighter2]`', { parse_mode: 'Markdown' });
  }

  const fileId = reply.video?.file_id || reply.document?.file_id;
  if (!fileId) return safeSend(chatId, '❌ Reply must be a video file.');

  await safeSend(chatId, `👁 Fight Lab: analyzing ${fighter1} vs ${fighter2}...\nThis may take several minutes.`);

  try {
    const fileLink = await bot.getFileLink(fileId);
    const tmpPath = `/tmp/fight-lab-${Date.now()}.mp4`;
    execFileSync('curl', ['-sL', fileLink, '-o', tmpPath], { timeout: 120000 });

    const sessionPath = await gymEyesV2.runFightLab(tmpPath, fighter1, fighter2);
    const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));

    let report = `👁 *Fight Lab: ${fighter1} vs ${fighter2}*\n\n`;
    report += gymEyesV2.formatSessionTelegram(sessionData);
    await safeSend(chatId, report, { parse_mode: 'Markdown' });

    try { fs.unlinkSync(tmpPath); } catch {}
  } catch (err) {
    safeSend(chatId, `❌ Fight Lab error: ${err.message.slice(0, 300)}`);
  }
});

// ── Student Homework Loop — Video + Caption Auto-Process ────────────────────
// Student sends video with caption "Sarah round 1 bag work"
// Bot: downloads → detects → matches student → imports → reports back

bot.on('video', async (msg) => {
  const caption = msg.caption;
  if (!caption) return; // no caption = not a homework submission

  const parsed = gymEyesV2.parseCaption(caption);
  if (!parsed || !parsed.name) return; // can't parse = not homework

  const chatId = msg.chat.id;
  const fileId = msg.video.file_id;

  await safeSend(chatId, `👁 Processing ${parsed.name}'s ${parsed.type}${parsed.round ? ` (round ${parsed.round})` : ''}...`);

  try {
    // Download video
    const fileLink = await bot.getFileLink(fileId);
    const tmpPath = `/tmp/gym-eyes-hw-${Date.now()}.mp4`;
    execFileSync('curl', ['-sL', fileLink, '-o', tmpPath], { timeout: 120000 });

    // Run detector
    const sessionPath = await gymEyesV2.runDetector(tmpPath);
    const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));

    // Auto-create student if needed
    if (!gymEyesV2.studentExists(parsed.name)) {
      await gymEyesV2.createStudent(parsed.name);
    }

    // Import session to student profile
    await gymEyesV2.importSession(parsed.name, sessionPath);

    // Load updated profile
    const profile = gymEyesV2.loadStudent(parsed.name);

    // Auto-assign drills from flags
    try { await gymEyesV2.autoAssignDrills(parsed.name); } catch {}

    // Challenge tracking — add punches if participant
    let challengeResult = null;
    if (gymChallenge.isParticipant(parsed.name)) {
      const totalPunches = (sessionData.fighters || []).reduce((sum, f) => sum + (f.total || 0), 0);
      if (totalPunches > 0) challengeResult = gymChallenge.addPunches(parsed.name, totalPunches);
    }

    // Build full report
    let report = `👁 *${parsed.name} — ${parsed.type}*${parsed.round ? ` (Round ${parsed.round})` : ''}\n\n`;
    report += gymEyesV2.formatSessionTelegram(sessionData, parsed.name);
    report += gymEyesV2.formatStudentProgressTelegram(profile);
    report += gymEyesV2.formatDrillsTelegram(profile);

    await safeSend(chatId, report, { parse_mode: 'Markdown' });

    // Challenge celebration — separate message for impact
    if (challengeResult?.justCompleted) {
      await safeSend(chatId, gymChallenge.celebrationMessage(challengeResult), { parse_mode: 'Markdown' });
    } else if (challengeResult) {
      await safeSend(chatId, `🥊 Challenge: ${challengeResult.todayPunches}/${challengeResult.target} today (${challengeResult.remaining} to go)`, { parse_mode: 'Markdown' });
    }

    try { fs.unlinkSync(tmpPath); } catch {}
  } catch (err) {
    safeSend(chatId, `❌ Gym Eyes error: ${err.message.slice(0, 300)}`);
  }
});

// /students — list all students
bot.onText(/^\/students(?:@\w+)?\s*$/i, async (msg) => {
  safeSend(msg.chat.id, gymEyesV2.formatStudentListTelegram(), { parse_mode: 'Markdown' });
});

// /drill [name] — view student's active drills
bot.onText(/^\/drill(?:@\w+)?\s+(\S+)\s*$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const name = match[1].trim();
  const profile = gymEyesV2.loadStudent(name);
  if (!profile) return safeSend(chatId, `❌ Student "${name}" not found.`);

  const drills = gymEyesV2.formatDrillsTelegram(profile);
  if (!drills) return safeSend(chatId, `👁 ${name} has no active drills. Run \`/drill assign ${name}\` to auto-assign.`, { parse_mode: 'Markdown' });

  safeSend(chatId, `👁 *${profile.name} — Drills*\n${drills}`, { parse_mode: 'Markdown' });
});

// /drill assign [name] — auto-assign drills from gaps
bot.onText(/^\/drill(?:@\w+)?\s+assign\s+(\S+)\s*$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const name = match[1].trim();
  if (!gymEyesV2.studentExists(name)) return safeSend(chatId, `❌ Student "${name}" not found.`);

  try {
    const output = await gymEyesV2.autoAssignDrills(name);
    safeSend(chatId, `👁 Drills assigned for ${name}:\n\`\`\`\n${output.slice(0, 800)}\n\`\`\``, { parse_mode: 'Markdown' });
  } catch (err) {
    safeSend(chatId, `❌ ${err.message.slice(0, 200)}`);
  }
});

// /drill score [name] [drill-id] [score] — score a drill session
bot.onText(/^\/drill(?:@\w+)?\s+score\s+(\S+)\s+(\S+)\s+(\d+)\s*$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const name = match[1].trim();
  const drillId = match[2].trim();
  const score = parseInt(match[3]);

  if (score < 1 || score > 10) return safeSend(chatId, '❌ Score must be 1-10.');
  if (!gymEyesV2.studentExists(name)) return safeSend(chatId, `❌ Student "${name}" not found.`);

  try {
    const output = await gymEyesV2.scoreDrill(name, drillId, score);
    safeSend(chatId, `👁 ${name} scored ${score}/10 on ${drillId.replace(/-/g, ' ')}.\n\`\`\`\n${output.slice(0, 400)}\n\`\`\``, { parse_mode: 'Markdown' });
  } catch (err) {
    safeSend(chatId, `❌ ${err.message.slice(0, 200)}`);
  }
});

// /note [name] [text] — add coach note to student profile
bot.onText(/^\/note(?:@\w+)?\s+(\S+)\s+(.+)$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const name = match[1].trim();
  const noteText = match[2].trim();

  if (!gymEyesV2.studentExists(name)) return safeSend(chatId, `❌ Student "${name}" not found.`);

  try {
    await gymEyesV2.addCoachNote(name, noteText);
    safeSend(chatId, `👁 Note added for ${name}: "${noteText}"`);
  } catch (err) {
    safeSend(chatId, `❌ ${err.message.slice(0, 200)}`);
  }
});

// /cityplan — Cathedral City Planner ecosystem audit
bot.onText(/^\/cityplan(?:@\w+)?\s*$/i, async (msg) => {
  const chatId = msg.chat.id;
  safeSend(chatId, 'Running City Planner audit...');
  try {
    const { execFileSync } = require('child_process');
    const result = execFileSync('node', [path.join(process.env.HOME, 'Cathedral', 'city-planner.js')], {
      encoding: 'utf8', timeout: 30000,
      env: { ...process.env },
    });
    const report = JSON.parse(result);
    const lines = ['*CATHEDRAL CITY PLANNER*\n'];
    const h = report.cityHealth;
    lines.push(`City Health: ${h.overallGrade} (${h.overallScore}/100)`);
    lines.push(`Best: ${h.strongestDistrict.name} (${h.strongestDistrict.grade})`);
    lines.push(`Weakest: ${h.weakestDistrict.name} (${h.weakestDistrict.grade})\n`);
    lines.push(`Infra: ${report.infrastructure.online}/${report.infrastructure.totalProcesses} online\n`);
    lines.push('*District Report Card:*');
    const sorted = Object.values(report.districts).sort((a, b) => b.score - a.score);
    for (const d of sorted) {
      lines.push(`  ${d.grade} | ${d.name} (${d.score})`);
      for (const issue of d.issues.slice(0, 2)) {
        lines.push(`    - ${issue}`);
      }
    }
    if (report.missingModules.length) {
      lines.push('\n*Missing Modules:*');
      for (const m of report.missingModules) {
        lines.push(`  #${m.number} ${m.module}: ${m.impact.slice(0, 80)}`);
      }
    }
    safeSend(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
  } catch (err) {
    safeSend(chatId, `City Planner error: ${err.message}`);
  }
});

// /gymdigest — weekly gym digest on demand
bot.onText(/^\/gymdigest(?:@\w+)?\s*$/i, async (msg) => {
  safeSend(msg.chat.id, gymDigest.generateDigest(), { parse_mode: 'Markdown' });
});

// ── Pre-Class Brief ─────────────────────────────────────────────────────────

bot.onText(/^\/brief(?:@\w+)?\s*$/i, async (msg) => {
  try {
    const { execFileSync } = await import('child_process');
    execFileSync('node', [path.join(__dirname, 'br-preclass-brief.js')], {
      timeout: 30000,
      env: { ...process.env, HOME: process.env.HOME }
    });
    safeSend(msg.chat.id, 'Brief sent. Visual: localhost:8080/br-brief');
  } catch (err) {
    safeSend(msg.chat.id, `Brief error: ${err.message?.slice(0, 200)}`);
  }
});

// ── Maya Filming Brief ──────────────────────────────────────────────────────

bot.onText(/^\/filmbrief(?:@\w+)?\s*$/i, async (msg) => {
  try {
    const wishlist = JSON.parse(fs.readFileSync(path.join(__dirname, 'content-studio', 'capture-wishlist.json'), 'utf-8'));
    const pending = wishlist.requests || [];
    if (pending.length === 0) {
      safeSend(msg.chat.id, 'No filming briefs pending. Run /autopilot to generate.');
      return;
    }
    const brief = pending[0];
    let text = `*Maya's Filming Brief*\n\n`;
    text += `${brief.request}\n\n`;
    if (brief.storyAngle) text += `*Story:* ${brief.storyAngle}\n`;
    if (brief.verbalHook) text += `*Hook:* "${brief.verbalHook}"\n`;
    if (brief.visualHook) text += `*Thumbnail:* ${brief.visualHook}\n`;
    if (brief.duration) text += `*Duration:* ${brief.duration}\n`;
    if (brief.editingNotes) text += `*Editing:* ${brief.editingNotes}\n`;
    if (brief.trialReel) text += `*Trial Reel* — non-followers first\n`;
    if (brief.example) text += `*Reference:* ${brief.example}\n`;
    text += `\n${pending.length} brief${pending.length > 1 ? 's' : ''} in queue`;
    safeSend(msg.chat.id, text, { parse_mode: 'Markdown' });
  } catch (err) {
    safeSend(msg.chat.id, `Film brief error: ${err.message?.slice(0, 200)}`);
  }
});

// ── Content Autopilot ───────────────────────────────────────────────────────

bot.onText(/^\/autopilot(?:@\w+)?\s*(.*)$/i, async (msg, match) => {
  const arg = (match[1] || '').trim();
  const force = arg === 'force' ? '--force' : '';
  safeSend(msg.chat.id, 'Running content autopilot...');
  try {
    const { execFileSync } = await import('child_process');
    const args = [path.join(__dirname, 'content-autopilot.js')];
    if (force) args.push('--force');
    const result = execFileSync('node', args, {
      encoding: 'utf8', timeout: 660000,
      env: { ...process.env, HOME: process.env.HOME }
    });
    const match2 = result.match(/Result:\s*(\{.*\})/);
    if (match2) {
      const r = JSON.parse(match2[1]);
      safeSend(msg.chat.id, `Autopilot done: ${r.processed} posts generated${r.total ? ` (${r.total} candidates)` : ''}`);
    } else {
      safeSend(msg.chat.id, 'Autopilot complete. Check Telegram for ready posts.');
    }
  } catch (err) {
    safeSend(msg.chat.id, `Autopilot error: ${err.message?.slice(0, 200)}`);
  }
});

// ── BR Auto-Responder ──────────────────────────────────────────────────────

// /reply <type> [name] [details] — generate a reply draft
bot.onText(/^\/reply(?:@\w+)?\s+(\S+)\s*(.*)?$/i, async (msg, match) => {
  const type = match[1].toLowerCase();
  const rest = (match[2] || '').trim();
  // Parse: first word after type = name, rest = details
  const parts = rest.split(/\s+/);
  const name = parts[0] || null;
  const details = parts.slice(1).join(' ') || null;

  try {
    const { getReply } = await import('./br-auto-responder.js');
    const result = await getReply(type, name, details);
    const header = `📋 *Reply Draft* (${type}${name ? ', ' + name : ''})
Source: ${result.source}
─────────────────`;
    safeSend(msg.chat.id, header, { parse_mode: 'Markdown' });
    // Send reply text as plain copyable message
    safeSend(msg.chat.id, result.text);
  } catch (err) {
    safeSend(msg.chat.id, `Reply error: ${err.message?.slice(0, 200)}`);
  }
});

// /quickreply — show available reply types
bot.onText(/^\/quickreply(?:@\w+)?\s*$/i, async (msg) => {
  const types = `📱 *Quick Reply Types*

/reply kids [name] — Kids class inquiry
/reply adult [name] — Adult inquiry
/reply classpass [name] — ClassPass visitor
/reply opengym [name] — Open gym inquiry
/reply trial [name] — Trial class booking
/reply pricing [name] — All pricing
/reply schedule [name] — Schedule info
/reply custom [name] [details] — AI-generated custom reply

Example: /reply kids Sarah
Example: /reply custom Tom wants to do private training`;
  safeSend(msg.chat.id, types, { parse_mode: 'Markdown' });
});

// ── 566 Lapsed Campaign ──────────────────────────────────────────────────────

// /campaign — status, launch, force
bot.onText(/^\/campaign(?:@\w+)?\s*(.*)?$/i, async (msg, match) => {
  const arg = (match[1] || '').trim().toLowerCase();
  try {
    const { launchBatch, formatCampaignTelegram } = await import('./comms-engine/lapsed-campaign.js');
    if (arg === 'launch' || arg === 'force') {
      const result = launchBatch(arg === 'force');
      if (result.blocked) {
        safeSend(msg.chat.id, result.reason);
      } else if (result.error) {
        safeSend(msg.chat.id, `Campaign error: ${result.error}`);
      } else {
        let text = `📢 Batch queued: ${result.queued} messages\n`;
        text += `Remaining: ${result.remaining}\n`;
        text += `Total: ${result.totalSent}\n`;
        if (result.complete) text += `\n✅ Campaign complete!`;
        safeSend(msg.chat.id, text);
      }
    } else {
      safeSend(msg.chat.id, formatCampaignTelegram(), { parse_mode: 'Markdown' });
    }
  } catch (err) {
    safeSend(msg.chat.id, `Campaign error: ${err.message?.slice(0, 200)}`);
  }
});

// ── BR Revenue Digest ─────────────────────────────────────────────────────────

// /revenue — generate and send revenue digest
bot.onText(/^\/revenue(?:@\w+)?\s*$/i, async (msg) => {
  try {
    const { generateRevenueDigest } = await import('./br-revenue-digest.js');
    const digest = generateRevenueDigest();
    safeSend(msg.chat.id, digest, { parse_mode: 'Markdown' });
  } catch (err) {
    safeSend(msg.chat.id, `Revenue digest error: ${err.message?.slice(0, 200)}`);
  }
});

// ── 100 Punches a Day Challenge ─────────────────────────────────────────────

// /challenge join [name] [target] — join the challenge
bot.onText(/^\/challenge(?:@\w+)?\s+join\s+(\S+)(?:\s+(\d+))?\s*$/i, async (msg, match) => {
  const name = match[1].trim();
  const target = match[2] ? parseInt(match[2]) : 100;
  const result = gymChallenge.joinChallenge(name, target);
  safeSend(msg.chat.id, `🥊 ${result.message}\n\nSend a video with caption "${name} bag work" to start counting.`, { parse_mode: 'Markdown' });
});

// /challenge [name] or /streak [name] — check progress
bot.onText(/^\/(?:challenge|streak)(?:@\w+)?\s+(\S+)\s*$/i, async (msg, match) => {
  const name = match[1].trim();
  safeSend(msg.chat.id, gymChallenge.formatStreakTelegram(name), { parse_mode: 'Markdown' });
});

// /leaderboard — challenge leaderboard
bot.onText(/^\/leaderboard(?:@\w+)?\s*$/i, async (msg) => {
  safeSend(msg.chat.id, gymChallenge.formatLeaderboardTelegram(), { parse_mode: 'Markdown' });
});

// /challenge leave [name] — leave the challenge
bot.onText(/^\/challenge(?:@\w+)?\s+leave\s+(\S+)\s*$/i, async (msg, match) => {
  const name = match[1].trim();
  const left = gymChallenge.leaveChallenge(name);
  safeSend(msg.chat.id, left ? `${name} left the challenge.` : `${name} not in challenge.`);
});

// /challenge — show help
bot.onText(/^\/challenge(?:@\w+)?\s*$/i, async (msg) => {
  safeSend(msg.chat.id, `🥊 *100 Punches a Day Challenge*

\`/challenge join [name]\` — join (default 100)
\`/challenge join [name] [number]\` — custom target
\`/challenge [name]\` — check progress
\`/streak [name]\` — same as above
\`/leaderboard\` — rankings
\`/challenge leave [name]\` — quit

*How it works:*
Send a video with caption (e.g. "Sarah bag work")
Bot counts punches + adds to daily total
Hit target → celebration 🔔
Streak tracked daily (HKT midnight reset)

_Basic Reflex. Every punch counts._`, { parse_mode: 'Markdown' });
});

// ── Content Conductor commands ───────────────────────────────────────────────

bot.onText(/^\/content(?:@\w+)?\s*$/, async (msg) => {
  safeSend(msg.chat.id, conductor.formatStatusTelegram(), { parse_mode: 'Markdown' });
});

bot.onText(/^\/content(?:@\w+)?\s+queue\s*$/i, async (msg) => {
  safeSend(msg.chat.id, conductor.formatQueueTelegram(), { parse_mode: 'Markdown' });
});

bot.onText(/^\/content(?:@\w+)?\s+templates?\s*$/i, async (msg) => {
  safeSend(msg.chat.id, conductor.formatTemplatesTelegram(), { parse_mode: 'Markdown' });
});

bot.onText(/^\/content(?:@\w+)?\s+ideas?\s*$/i, async (msg) => {
  const chatId = msg.chat.id;
  await safeSend(chatId, '💡 Generating content ideas...');
  try {
    const ideas = await conductor.generateIdeas();
    await safeSend(chatId, `💡 *Content Ideas*\n\n${ideas}`, { parse_mode: 'Markdown' });
  } catch (err) {
    safeSend(chatId, `❌ ${err.message.slice(0, 200)}`);
  }
});

bot.onText(/^\/content(?:@\w+)?\s+caption\s+(.+)$/s, async (msg, match) => {
  const chatId = msg.chat.id;
  const intent = match[1].trim();
  await safeSend(chatId, '✍️ Generating caption...');
  try {
    const caption = await conductor.generateCaption(intent);
    await safeSend(chatId, `✍️ *Caption:*\n\n${caption}`, { parse_mode: 'Markdown' });
  } catch (err) {
    safeSend(chatId, `❌ ${err.message.slice(0, 200)}`);
  }
});

bot.onText(/^\/content(?:@\w+)?\s+approve\s+(cc-\d+)\s*$/i, async (msg, match) => {
  const id = match[1].trim();
  const result = conductor.updateQueueItem(id, 'approved');
  if (result) {
    safeSend(msg.chat.id, `✅ Approved: \`${id}\``, { parse_mode: 'Markdown' });
  } else {
    safeSend(msg.chat.id, `❌ Not found: ${id}`);
  }
});

bot.onText(/^\/content(?:@\w+)?\s+reject\s+(cc-\d+)\s*$/i, async (msg, match) => {
  const id = match[1].trim();
  const result = conductor.updateQueueItem(id, 'rejected');
  if (result) {
    safeSend(msg.chat.id, `❌ Rejected: \`${id}\``, { parse_mode: 'Markdown' });
  } else {
    safeSend(msg.chat.id, `❌ Not found: ${id}`);
  }
});

bot.onText(/^\/content(?:@\w+)?\s+(?!queue|templates?|ideas?|caption|approve|reject|status)(.+)$/s, async (msg, match) => {
  const chatId = msg.chat.id;
  const intent = match[1].trim();
  await safeSend(chatId, `📋 Creating content piece: _"${intent.slice(0, 80)}"_`, { parse_mode: 'Markdown' });

  try {
    const piece = await conductor.executePipeline(intent);
    await safeSend(chatId, conductor.formatContentPieceTelegram(piece), { parse_mode: 'Markdown' });
  } catch (err) {
    safeSend(chatId, `❌ Conductor error: ${err.message.slice(0, 300)}`);
  }
});

// ── Student Intelligence commands ───────────────────────────────────────────

bot.onText(/^\/students?(?:@\w+)?\s*$/, async (msg) => {
  safeSend(msg.chat.id, studentIntel.formatStatusTelegram(), { parse_mode: 'Markdown' });
});

bot.onText(/^\/students(?:@\w+)?\s+all\s*$/i, async (msg) => {
  const profiles = studentIntel.listAllProfiles();
  if (profiles.length === 0) return safeSend(msg.chat.id, '👤 No students yet. Import PunchPass CSV or add via `/student <name> note <info>`', { parse_mode: 'Markdown' });

  let text = `👤 *All Students (${profiles.length})*\n\n`;
  for (const p of profiles.sort((a, b) => a.name.localeCompare(b.name))) {
    const icon = p.risk_level === 'red' ? '🔴' : p.risk_level === 'yellow' ? '🟡' : p.risk_level === 'green' ? '🟢' : '⚪';
    text += `${icon} *${p.name}*`;
    if (p.attendance.total_classes) text += ` (${p.attendance.total_classes} classes)`;
    const scores = p.technique.overall_scores;
    if (scores.length > 0) text += ` — ${scores[scores.length - 1].score}/100`;
    text += '\n';
  }
  safeSend(msg.chat.id, text, { parse_mode: 'Markdown' });
});

bot.onText(/^\/students(?:@\w+)?\s+risk\s*$/i, async (msg) => {
  const atRisk = studentIntel.calculateRiskLevels();
  safeSend(msg.chat.id, studentIntel.formatRiskListTelegram(atRisk), { parse_mode: 'Markdown' });
});

bot.onText(/^\/students(?:@\w+)?\s+improving\s*$/i, async (msg) => {
  safeSend(msg.chat.id, studentIntel.formatImprovingTelegram(), { parse_mode: 'Markdown' });
});

bot.onText(/^\/students(?:@\w+)?\s+import\s*$/i, async (msg) => {
  const chatId = msg.chat.id;
  const csvDir = path.join(process.env.HOME, 'nanoclaw', 'student-intelligence', 'csv-inbox');
  try {
    const files = fs.readdirSync(csvDir).filter(f => f.endsWith('.csv'));
    if (files.length === 0) {
      return safeSend(chatId, `📥 No CSV files found.\nDrop PunchPass export in:\n\`${csvDir}\``, { parse_mode: 'Markdown' });
    }
    let total = 0;
    for (const file of files) {
      const result = studentIntel.importPunchPassCSV(path.join(csvDir, file));
      total += result.imported;
      await safeSend(chatId, `📥 Imported ${result.imported} students from ${file}`);
    }
    await safeSend(chatId, `✅ Total imported: ${total} students`);
  } catch (err) {
    safeSend(chatId, `❌ Import error: ${err.message.slice(0, 200)}`);
  }
});

bot.onText(/^\/student(?:@\w+)?\s+(.+?)\s+note\s+(.+)$/is, async (msg, match) => {
  const name = match[1].trim();
  const note = match[2].trim();
  studentIntel.addCoachingNote(name, note);
  safeSend(msg.chat.id, `📝 Note added for *${name}*: _${note}_`, { parse_mode: 'Markdown' });
});

bot.onText(/^\/student(?:@\w+)?\s+(.+?)\s+focus\s*$/i, async (msg, match) => {
  const name = match[1].trim();
  const drills = studentIntel.recommendDrills(name);
  let text = `🎯 *Focus for ${name}*\n\n`;
  drills.forEach((d, i) => { text += `${i + 1}. ${d}\n\n`; });
  safeSend(msg.chat.id, text, { parse_mode: 'Markdown' });
});

bot.onText(/^\/student(?:@\w+)?\s+(.+?)\s+eyes\s+(.+)$/i, async (msg, match) => {
  const name = match[1].trim();
  const analysisFile = match[2].trim();
  const chatId = msg.chat.id;
  try {
    const eyesDir = path.join(process.env.HOME, 'nanoclaw', 'gym-eyes', 'output');
    const files = fs.readdirSync(eyesDir).filter(f => f.includes(analysisFile) && f.endsWith('.json'));
    if (files.length === 0) return safeSend(chatId, `❌ Analysis file not found: ${analysisFile}`);
    const profile = studentIntel.ingestGymEyesAnalysis(name, path.join(eyesDir, files[0]));
    safeSend(chatId, `✅ Gym Eyes data ingested for *${name}*\n${studentIntel.formatProfileTelegram(profile)}`, { parse_mode: 'Markdown' });
  } catch (err) {
    safeSend(chatId, `❌ ${err.message.slice(0, 200)}`);
  }
});

bot.onText(/^\/student(?:@\w+)?\s+(?!.*\s+(?:note|focus|eyes)\s)(.+)$/i, async (msg, match) => {
  const name = match[1].trim();
  const profile = studentIntel.loadProfile(name);
  if (!profile) {
    return safeSend(msg.chat.id, `👤 *${name}* — not found.\nCreate: \`/student ${name} note <info>\``, { parse_mode: 'Markdown' });
  }
  safeSend(msg.chat.id, studentIntel.formatProfileTelegram(profile), { parse_mode: 'Markdown' });
});

// ── /cosmos — Cosmology Research Series (27 tracks) ─────────────────────────

const COSMOS_DIR = path.join(process.env.HOME, 'cathedral-vault', '00_Staging', 'cosmology');

const COSMOS_TRACK_MAP = {
  '0':  'house-analogy-deep-dive',
  'audit': 'house-analogy-deep-dive',
  '1':  'track1-boundary-research',
  '1b': 'track1b-mission-reports',
  '2':  'track2-luminaries',
  '3':  'track3-suppressed-energy',
  '4':  'track4-builders',
  '5':  'track5-antarctic-anomalies',
  '6':  'track6-synthesis',
  '7':  'track7-trump-disclosure-crossover',
  '8':  'track8-coin-room-finance',
  '9':  'track9-water',
  '10': 'track10-frequency',
  '11': 'track11-coin-room-plumbing',
  '12': 'track12-structural-forensics',
  '13': 'track13-rife-protocols',
  '14': 'track14-fed-ownership-network',
  '15': 'track15-biological-control-grid',
  '16': 'track16-temporal-control-grid',
  '17': 'track17-consciousness',
  '18': 'track18-builder-identity',
  '19': 'track19-subterranean-realm',
  '20': 'track20-space-falsification',
  '21': 'track21-coming-deception',
  '22': 'track22-regeneration-protocols',
  '23': 'track23-energy-independence',
  '24': 'track24-community-architecture',
  '25': 'track25-antarctic-expedition',
  '26': 'track26-breakaway-civilization',
  '27': 'track27-soul-trap',
};

function cosmosReadTrack(slug) {
  const files = fs.readdirSync(COSMOS_DIR).filter(f => f.endsWith('.md'));
  const match = files.find(f => f.includes(slug));
  if (!match) return null;
  return fs.readFileSync(path.join(COSMOS_DIR, match), 'utf8');
}

function cosmosExtractSummary(content) {
  // Extract title from frontmatter
  const titleMatch = content.match(/^title:\s*"?(.+?)"?\s*$/m);
  const title = titleMatch ? titleMatch[1] : 'Untitled';
  // Extract grade
  const gradeMatch = content.match(/^grade:\s*(.+)$/m);
  const grade = gradeMatch ? gradeMatch[1].trim() : '?';
  // Strip frontmatter
  const body = content.replace(/^---[\s\S]*?---\s*/, '');
  // Take first ~2500 chars of body
  const trimmed = body.length > 2500 ? body.slice(0, 2500) + '\n\n[...truncated]' : body;
  return `*${title}*\nGrade: ${grade}\n\n${trimmed}`;
}

function cosmosGradeTable() {
  const rows = [
    ['0/audit', 'House Analogy Deep Dive', 'A'],
    ['1',  'Boundary Research', 'B+'],
    ['1b', 'Mission Reports', 'B+'],
    ['2',  'Luminaries', 'B+'],
    ['3',  'Suppressed Energy', 'A-'],
    ['4',  'Builders', 'A-'],
    ['5',  'Antarctic Anomalies', 'B+'],
    ['6',  'Synthesis', 'A-'],
    ['7',  'Trump Disclosure', 'B+'],
    ['8',  'Coin Room Finance', 'B+'],
    ['9',  'Water', 'A-'],
    ['10', 'Frequency', 'A-'],
    ['11', 'Coin Room Plumbing', 'A-'],
    ['12', 'Structural Forensics', 'B+'],
    ['13', 'Rife Protocols', 'B+'],
    ['14', 'Fed Ownership Network', 'B+'],
    ['15', 'Biological Control Grid', 'B+'],
    ['16', 'Temporal Control Grid', 'B-'],
    ['17', 'Consciousness', 'A-'],
    ['18', 'Builder Identity', 'B'],
    ['19', 'Subterranean Realm', 'B'],
    ['20', 'Space Falsification', 'B'],
    ['21', 'Coming Deception', 'B-'],
    ['22', 'Regeneration Protocols', 'B+'],
    ['23', 'Energy Independence', 'B'],
    ['24', 'Community Architecture', 'B'],
    ['25', 'Antarctic Expedition', 'B-'],
    ['26', 'Breakaway Civilization', 'C+'],
    ['27', 'Soul Trap', 'C'],
  ];
  let table = '# | Title | Grade\n---|---|---\n';
  for (const [num, title, grade] of rows) {
    table += `${num} | ${title} | ${grade}\n`;
  }
  return table;
}

bot.onText(/^\/cosmos(?:@\w+)?(?:\s+(.*))?$/s, async (msg, match) => {
  const chatId = msg.chat.id;
  const arg = match?.[1]?.trim()?.toLowerCase();

  try {
    // /cosmos (no args) — overview
    if (!arg) {
      const overview = `*Cosmology Research Series*
27 tracks. Forensic audit of where we live.

*Grade Summary:*
Globe (standard model): C+
Enclosed Plane (resonant): A-

*Arc:* House analogy (17 layers) -> 6-track programme -> live crossovers -> finance/water/frequency -> consciousness -> builders -> action protocols -> soul architecture.

A- tracks: Suppressed Energy, Builders, Synthesis, Water, Frequency, Coin Room Plumbing, Consciousness
B+ tracks: Boundary, Missions, Luminaries, Antarctic, Trump Disclosure, Coin Room Finance, Structural Forensics, Rife, Fed Network, Biological Control, Regeneration

\`/cosmos [number]\` — read track
\`/cosmos grade\` — full grade table
\`/cosmos search [term]\` — search all tracks
\`/cosmos research\` — Aletheia autonomous research (weakest track)
\`/cosmos tell\` — the sovereignty test`;
      return safeSend(chatId, overview, { parse_mode: 'Markdown' });
    }

    // /cosmos grade — full grade table
    if (arg === 'grade' || arg === 'grades') {
      const table = cosmosGradeTable();
      return safeSend(chatId, `*Cosmology Grade Table (27 tracks)*\n\n${table}\n*Globe:* C+ | *Enclosed Plane:* A-`, { parse_mode: 'Markdown' });
    }

    // /cosmos podcast [number] — generate podcast episode
    if (arg === 'podcast' || arg.startsWith('podcast ')) {
      const trackArg = arg.replace(/^podcast\s*/, '').trim() || '--next';
      await safeSend(chatId, `Generating podcast episode${trackArg !== '--next' ? ' for Track ' + trackArg : ' (next ungenerated)'}... This takes a few minutes.`);
      try {
        const { execFile } = await import('child_process');
        const { promisify } = await import('util');
        const execFileAsync = promisify(execFile);
        const pythonPath = path.join(process.env.HOME, 'cathedral-venv', 'bin', 'python3');
        const scriptPath = path.join(process.env.HOME, 'Cathedral', 'cosmology-podcast.py');
        const { stdout, stderr } = await execFileAsync(pythonPath, [scriptPath, trackArg], { timeout: 600000 });
        if (stdout) console.log(stdout);
        if (stderr) console.error(stderr);
      } catch (podErr) {
        await safeSend(chatId, `Podcast generation issue: ${podErr.message}`);
      }
      return;
    }

    // /cosmos research — trigger Aletheia autonomous research
    if (arg === 'research') {
      await safeSend(chatId, 'Aletheia engaging — researching weakest cosmology track...');
      try {
        const { runCosmologyResearch } = await import('./cosmology-researcher.js');
        const result = await runCosmologyResearch();
        await safeSend(chatId, `Research complete. Track ${result.track.trackNum} (${result.track.grade}) — ${result.researchLength} chars saved.`);
      } catch (resErr) {
        await safeSend(chatId, `Cosmology research failed: ${resErr.message}`);
      }
      return;
    }

    // /cosmos tell — sovereignty test from Track 21
    if (arg === 'tell') {
      const tell = `*The Forensic Tell — How to Recognize the Deception*
(from Track 21: The Coming Deception)

When the event occurs, ask three questions. The first is the only one that matters.

*1. Does the revelation increase or decrease your sovereignty?*
Genuine Truth: Empowers. You learn you live in a resonant, abundant enclosed plane where energy is free and you are an eternal fragment of the Absolute. This makes you ungovernable.
Managed Deception: Diminishes. You are told you are a meaningless simulation, failed experiment, or flawed being needing rescue by a superior entity who will then rule over you.

*2. Who is placed in authority?*
Genuine Truth: Points inward. Authority is your own direct connection to Source.
Managed Deception: Points outward. Creates new external authority.

*3. What happens to the energy paradigm?*
Genuine Truth: Immediate release of free, localized energy. Grid becomes obsolete.
Managed Deception: Energy question ignored entirely, or "new physics" declared too complex for public ownership.

_Any entity arriving in the sky, on a screen, or in our minds demanding worship, fear, or obedience is part of the control grid. A true revelation would feel like remembering something you already knew._`;
      return safeSend(chatId, tell, { parse_mode: 'Markdown' });
    }

    // /cosmos search [term] — grep across cosmology files
    if (arg.startsWith('search ')) {
      const term = arg.replace(/^search\s+/, '').trim();
      if (!term) return safeSend(chatId, 'Usage: `/cosmos search [term]`', { parse_mode: 'Markdown' });

      const files = fs.readdirSync(COSMOS_DIR).filter(f => f.endsWith('.md'));
      const results = [];
      const termLower = term.toLowerCase();

      for (const file of files) {
        const content = fs.readFileSync(path.join(COSMOS_DIR, file), 'utf8');
        const lines = content.split('\n');
        const matchingLines = [];
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(termLower)) {
            matchingLines.push(lines[i].trim().slice(0, 120));
            if (matchingLines.length >= 2) break;
          }
        }
        if (matchingLines.length > 0) {
          const shortName = file.replace(/^2026-05-0[89]_cosmology_/, '').replace(/\.md$/, '');
          results.push({ file: shortName, lines: matchingLines });
        }
        if (results.length >= 5) break;
      }

      if (results.length === 0) {
        return safeSend(chatId, `No results for "${term}" across cosmology tracks.`);
      }

      let response = `*Search: "${term}"* (${results.length} tracks)\n\n`;
      for (const r of results) {
        response += `*${r.file}*\n`;
        for (const line of r.lines) {
          response += `  ${line}\n`;
        }
        response += '\n';
      }
      return safeSend(chatId, response, { parse_mode: 'Markdown' });
    }

    // /cosmos [number] — read specific track
    const slug = COSMOS_TRACK_MAP[arg];
    if (!slug) {
      return safeSend(chatId, `Unknown track: "${arg}"\nUse 0-27, 1b, or "audit". Try \`/cosmos grade\` for the full list.`, { parse_mode: 'Markdown' });
    }

    const content = cosmosReadTrack(slug);
    if (!content) {
      return safeSend(chatId, `Track file not found for: ${slug}`);
    }

    const summary = cosmosExtractSummary(content);
    // Cap at 3000 chars for Telegram readability
    const capped = summary.length > 3000 ? summary.slice(0, 3000) + '\n\n[...truncated — full file in vault]' : summary;
    return safeSend(chatId, capped, { parse_mode: 'Markdown' });

  } catch (err) {
    safeSend(chatId, `Cosmos error: ${err.message}`);
  }
});

// ── Community Radar commands ────────────────────────────────────────────────

bot.onText(/^\/radar(?:@\w+)?\s*$/, async (msg) => {
  safeSend(msg.chat.id, communityRadar.formatStatusTelegram(), { parse_mode: 'Markdown' });
});

bot.onText(/^\/radar(?:@\w+)?\s+run\s*$/i, async (msg) => {
  const chatId = msg.chat.id;
  await safeSend(chatId, '📡 Running full radar scan... (Reddit + HN + GitHub, 30-60s)');
  try {
    const result = await communityRadar.runScan();
    await safeSend(chatId, communityRadar.formatScanResultTelegram(result), { parse_mode: 'Markdown' });
  } catch (err) {
    safeSend(chatId, `❌ Radar error: ${err.message.slice(0, 300)}`);
  }
});

bot.onText(/^\/radar(?:@\w+)?\s+voices?\s*$/i, async (msg) => {
  safeSend(msg.chat.id, communityRadar.formatVoicesTelegram(), { parse_mode: 'Markdown' });
});

bot.onText(/^\/radar(?:@\w+)?\s+(?!run\s*$|voices?\s*$)(.+)$/i, async (msg, match) => {
  const topic = match[1].trim();
  const chatId = msg.chat.id;
  await safeSend(chatId, `📡 Focused scan: "${topic}"...`);
  try {
    const result = await communityRadar.focusScan(topic);
    let text = `📡 *Radar: "${topic}"*\n\n`;
    text += `Fetched: ${result.fetched} | High-signal: ${result.highSignal.length}\n\n`;
    for (const post of result.highSignal.slice(0, 8)) {
      const icon = post.platform === 'reddit' ? '🔴' : post.platform === 'github' ? '⚫' : '🟠';
      text += `${icon} *[${post.signal_score}]* ${post.title?.slice(0, 80)}\n`;
      text += `  by ${post.author} | ${post.platform}\n`;
      if (post.signal_reason) text += `  _${post.signal_reason}_\n`;
      text += '\n';
    }
    if (result.highSignal.length === 0) text += '_No high-signal content found._';
    await safeSend(chatId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    safeSend(chatId, `❌ Radar error: ${err.message.slice(0, 200)}`);
  }
});

// ── Agent Engine (Orc, Boxing, BR-Ops) ──────────────────────────────────────

import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const agentEngine = _require(path.join(process.env.HOME, 'Cathedral', 'agents', 'agent-engine.js'));

const AGENT_ICONS = { orc: '🏛️', boxing: '🥊', br: '💼', ling: '🔴', maya: '⭐', yoda: '🟢', miyagi: '🥋', tao: '🌊', marcus: '🏛️', 'sun-tzu': '⚔️', leonardo: '🎨', 'reed-director': '🎬' };

function registerAgentCommand(agentId, pattern) {
  bot.onText(pattern, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isPaul(chatId)) return;

    const input = match[1].trim();
    const icon = AGENT_ICONS[agentId] || '🤖';
    const config = agentEngine.getAgentConfig(agentId);

    // Reset command
    if (input.toLowerCase() === 'reset') {
      agentEngine.reset(agentId, chatId);
      await safeSend(chatId, `${icon} ${config.name} session reset.`);
      return;
    }

    await safeSend(chatId, `${icon} _${config.name} thinking..._`, { parse_mode: 'Markdown' });

    try {
      const result = await agentEngine.run(agentId, input, chatId);
      await safeSend(chatId, `${icon} *${result.agent}*\n\n${result.text}`, { parse_mode: 'Markdown' });
    } catch (err) {
      await safeSend(chatId, `❌ ${config.name} error: ${err.message}`);
    }
  });
}

registerAgentCommand('orc', /^\/orc(?:@\w+)?\s+(.+)$/is);
registerAgentCommand('boxing', /^\/boxing-agent(?:@\w+)?\s+(.+)$/is);
registerAgentCommand('br', /^\/br-agent(?:@\w+)?\s+(.+)$/is);
registerAgentCommand('universe', /^\/universe(?:@\w+)?\s+(.+)$/is);
registerAgentCommand('trading', /^\/trading-agent(?:@\w+)?\s+(.+)$/is);
registerAgentCommand('ling', /^\/ling(?:@\w+)?\s+(.+)$/is);
registerAgentCommand('maya', /^\/maya(?:@\w+)?\s+(.+)$/is);

// Pretta Origin Sages — Court Members #22-27
registerAgentCommand('yoda', /^\/yoda(?:@\w+)?\s+(.+)$/is);
registerAgentCommand('miyagi', /^\/miyagi(?:@\w+)?\s+(.+)$/is);
registerAgentCommand('tao', /^\/tao(?:@\w+)?\s+(.+)$/is);
registerAgentCommand('marcus', /^\/marcus(?:@\w+)?\s+(.+)$/is);
registerAgentCommand('sun-tzu', /^\/sun-tzu(?:@\w+)?\s+(.+)$/is);
registerAgentCommand('leonardo', /^\/leonardo(?:@\w+)?\s+(.+)$/is);
registerAgentCommand('reed-director', /^\/reed-director(?:@\w+)?\s+(.+)$/is);

// /agents — list all available agents
bot.onText(/^\/agents(?:@\w+)?\s*$/i, async (msg) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;

  const agents = agentEngine.listAgents();
  const lines = agents.map(a => `${AGENT_ICONS[a.id] || '🤖'} *${a.command}* — ${a.name}\n   ${a.description}`);
  await safeSend(chatId, `*Cathedral Agents*\n\n${lines.join('\n\n')}\n\nAll commands support multi-turn conversation. Send \`reset\` to clear.`, { parse_mode: 'Markdown' });
});

// ── Reasoning loop ──────────────────────────────────────────────────────────

bot.onText(/^\/reason(?:@\w+)?\s+(.+)$/is, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;

  const input = match[1].trim();
  // Parse optional --agent flag
  const agentMatch = input.match(/--agent\s+(\S+)/i);
  const agentId = agentMatch ? agentMatch[1] : undefined;
  const problem = input.replace(/--agent\s+\S+/i, '').trim();

  if (!problem) {
    await safeSend(chatId, '⚠️ Usage: /reason <problem> [--agent boxing]');
    return;
  }

  await safeSend(chatId, `🧠 Reasoning loop started${agentId ? ` (agent: ${agentId})` : ''}...\nThis takes several minutes (4 passes × LLM).`);

  try {
    const reasoningLoop = require(path.join(process.env.HOME, 'Cathedral', 'agents', 'reasoning-loop.js'));
    const result = await reasoningLoop.reason(problem, { agentId, maxLoops: 2 });

    const summary = `🧠 *Reasoning Loop Complete*\nLoops: ${result.loopCount} | Passes: ${result.passes.length} | Improved: ${result.improved} | Time: ${(result.elapsed / 1000).toFixed(0)}s`;
    const answer = result.answer.length > 3500
      ? result.answer.slice(0, 3500) + '\n\n... (truncated)'
      : result.answer;

    await safeSend(chatId, `${summary}\n\n${answer}`);
  } catch (err) {
    await safeSend(chatId, `❌ Reasoning loop failed: ${err.message}`);
  }
});

bot.onText(/^\/reason-stats(?:@\w+)?\s*$/i, async (msg) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;

  try {
    const tracker = require(path.join(process.env.HOME, 'Cathedral', 'agents', 'reasoning-tracker.js'));
    const { stats, alerts } = await tracker.main();
    const text = tracker.formatStats(stats);
    await safeSend(chatId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    await safeSend(chatId, `Failed: ${err.message}`);
  }
});

// ── Cross-domain sync ───────────────────────────────────────────────────────

bot.onText(/^\/sync(?:@\w+)?\s*$/i, async (msg) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;
  await safeSend(chatId, '🔄 Running cross-domain sync...');

  try {
    const syncPath = path.join(process.env.HOME, 'Cathedral', 'agents', 'cross-domain-sync.js');
    const { main } = await import(`file://${syncPath}`);
    // CJS module — use createRequire
    const _req = (await import('module')).createRequire(import.meta.url);
    const sync = _req(syncPath);
    const result = await sync.main();
    const lines = [`🔄 *Cross-Domain Sync Complete*\n`];
    lines.push(`Sessions: ${result.synced}`);
    lines.push(`Messages routed: ${result.messages}`);
    if (result.report?.length) {
      lines.push('');
      for (const r of result.report) {
        const icon = { orc: '🏛️', boxing: '🥊', br: '💼' }[r.agent] || '📨';
        lines.push(`${icon} ${r.findingPreview}`);
      }
    }
    await safeSend(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
  } catch (err) {
    await safeSend(chatId, `❌ Sync error: ${err.message}`);
  }
});

// /uptake — agent message uptake measurement
bot.onText(/^\/uptake(?:@\w+)?\s*$/i, async (msg) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;
  try {
    const _req = (await import('module')).createRequire(import.meta.url);
    const agentEngine = _req(path.join(process.env.HOME, 'Cathedral', 'agents', 'agent-engine.js'));
    const stats = agentEngine.getUptakeStats();
    if (!stats || !Object.keys(stats).length) {
      await safeSend(chatId, '📊 No uptake data yet. Agents need to receive and respond to messages first.');
      return;
    }
    const lines = ['📊 *Agent Uptake Measurement*\n'];
    for (const [id, s] of Object.entries(stats)) {
      const icon = { orc: '🏛️', boxing: '🥊', br: '💼' }[id] || '📨';
      lines.push(`${icon} *${id}*: ${s.uptakeRate}% uptake (${s.totalReferenced}/${s.totalLoaded} referenced)`);
      if (s.history?.length) {
        const recent = s.history.slice(-3);
        for (const h of recent) {
          const status = h.referenced ? '✅' : '⬜';
          lines.push(`  ${status} ${h.file.slice(0, 40)} — ${h.keywordsHit}/${h.keywordsLoaded} keywords`);
        }
      }
      lines.push('');
    }
    await safeSend(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
  } catch (err) {
    await safeSend(chatId, `❌ Uptake error: ${err.message}`);
  }
});

// ── Cathedral Feed — Paul posts + browse ─────────────────────────────────────

bot.onText(/^\/feed(?:@\w+)?\s*$/i, async (msg) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;
  try {
    const feedPath = path.join(process.env.HOME, 'Cathedral', 'agents', 'cathedral-feed.json');
    const feed = JSON.parse(fs.readFileSync(feedPath, 'utf8'));
    const recent = (feed.posts || []).slice(-8).reverse();
    if (!recent.length) { await safeSend(chatId, 'Feed is empty.'); return; }

    const lines = ['*Cathedral Feed* (latest 8)\n'];
    for (const p of recent) {
      const icon = { research: '🔍', synthesis: '📊', tea: '☕', 'tea-thread': '☕💬', accountability: '📋', 'tea-harvest': '🌾', 'comprehension-check': '❓', 'comprehension-response': '✏️', 'comprehension-grades': '✅', architect: '🏗️' }[p.type] || '📝';
      const ago = Math.floor((Date.now() - new Date(p.ts).getTime()) / 60000);
      const timeStr = ago < 60 ? `${ago}m` : ago < 1440 ? `${Math.floor(ago/60)}h` : `${Math.floor(ago/1440)}d`;
      lines.push(`${icon} *${p.authorName || p.author}* (${timeStr})`);
      lines.push(`_${(p.topic || '').slice(0, 60)}_`);
      lines.push(`${(p.content || '').slice(0, 120)}\n`);
    }
    await safeSend(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
  } catch (err) {
    await safeSend(chatId, `Error: ${err.message}`);
  }
});

bot.onText(/^\/feed\s+(.+)/i, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;
  const content = match[1].trim();
  try {
    const feedPath = path.join(process.env.HOME, 'Cathedral', 'agents', 'cathedral-feed.json');
    let feed;
    try { feed = JSON.parse(fs.readFileSync(feedPath, 'utf8')); }
    catch { feed = { posts: [] }; }

    feed.posts.push({
      id: Date.now() + '-paul',
      author: 'paul',
      authorName: 'The Architect',
      type: 'architect',
      topic: content.slice(0, 80),
      content: content,
      ts: new Date().toISOString(),
      reactions: [],
      replies: []
    });

    if (feed.posts.length > 200) feed.posts = feed.posts.slice(-200);
    fs.writeFileSync(feedPath, JSON.stringify(feed, null, 2));
    await safeSend(chatId, `🏗️ Posted to Cathedral Feed:\n"${content.slice(0, 200)}"`);
  } catch (err) {
    await safeSend(chatId, `Error: ${err.message}`);
  }
});

// ── Higgsfield tester commands ────────────────────────────────────────────────

bot.onText(/^\/hftest(?:@\w+)?\s*$/i, async (msg) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;
  await safeSend(chatId, '🔬 Reed Lab: Starting Higgsfield model tests...');
  try {
    const { runTests } = await import('./reed-higgsfield-tester.js');
    await runTests();
  } catch (err) {
    safeSend(chatId, `❌ HF Tester error: ${err.message.slice(0, 300)}`);
  }
});

bot.onText(/^\/hfstatus(?:@\w+)?\s*$/i, async (msg) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;
  try {
    const { formatStatus } = await import('./reed-higgsfield-tester.js');
    await safeSend(chatId, formatStatus(), { parse_mode: 'Markdown' });
  } catch (err) {
    safeSend(chatId, `❌ HF Status error: ${err.message.slice(0, 300)}`);
  }
});

// ── Grok Paper Trial ─────────────────────────────────────────────────────────

bot.onText(/^\/groktrial(?:@\w+)?\s*$/i, async (msg) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;
  try {
    const { execSync: es } = await import('child_process');
    const status = es('node /Users/basicclaw777/nanoclaw/grok-trial.js status', { encoding: 'utf-8', timeout: 10000 });
    await safeSend(chatId, status);
  } catch (err) {
    safeSend(chatId, `Error: ${err.message.slice(0, 300)}`);
  }
});

bot.onText(/^\/grokrate\s+(\w+)\s+([1-5])(?:\s+(.+))?$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;
  const type = match[1].toLowerCase(); // image, video, llm
  const score = parseInt(match[2]);
  const notes = match[3] || '';
  try {
    const { logRating } = await import('./grok-trial.js');
    logRating(type, score, notes);
    await safeSend(chatId, `Grok ${type} rated ${score}/5${notes ? ': ' + notes : ''}`);
  } catch (err) {
    safeSend(chatId, `Error: ${err.message.slice(0, 300)}`);
  }
});

bot.onText(/^\/grokimage\s+(.+)$/is, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;
  const prompt = match[1].trim();
  await safeSend(chatId, 'Grok Imagine generating...');
  try {
    const { grokImage } = await import('./grok-trial.js');
    const result = await grokImage(prompt);
    if (result.url) {
      await bot.sendPhoto(chatId, result.url, {
        caption: `Grok Imagine — $${result.costUsd} in ${(result.duration / 1000).toFixed(1)}s\nRate: /grokrate image [1-5]`
      });
    }
  } catch (err) {
    safeSend(chatId, `Grok error: ${err.message.slice(0, 300)}`);
  }
});

bot.onText(/^\/grokvideo\s+(.+)$/is, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;
  const prompt = match[1].trim();
  await safeSend(chatId, 'Grok Video generating (may take 30-60s)...');
  try {
    const { grokVideo } = await import('./grok-trial.js');
    const result = await grokVideo(prompt);
    if (result.url) {
      const tmpPath = `/tmp/grok-video-${Date.now()}.mp4`;
      const { execSync: es } = await import('child_process');
      es(`curl -sL "${result.url}" -o "${tmpPath}"`, { timeout: 120000 });
      await bot.sendVideo(chatId, tmpPath, {
        caption: `Grok Video — ${result.videoDuration}s, $${result.costUsd} in ${(result.duration / 1000).toFixed(0)}s\nRate: /grokrate video [1-5]`
      });
    }
  } catch (err) {
    safeSend(chatId, `Grok error: ${err.message.slice(0, 300)}`);
  }
});

// ── fal.ai spend tracker ────────────────────────────────────────────────────

bot.onText(/^\/falspend(?:@\w+)?\s*$/i, async (msg) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;
  try {
    const { getSpend } = await import('./fal-client.js');
    const s = getSpend();
    const lines = [
      '💰 fal.ai Spend Tracker',
      `  Today: $${s.today.toFixed(3)} / $${s.cap} cap ($${s.remaining.toFixed(3)} remaining)`,
      `  This week: $${s.week.toFixed(3)}`,
      `  All time: $${s.allTime.toFixed(3)} (${s.callCount} calls)`
    ];
    await safeSend(chatId, lines.join('\n'));
  } catch (err) {
    safeSend(chatId, `Error: ${err.message.slice(0, 300)}`);
  }
});

// ── Terminal session harvester ───────────────────────────────────────────────

bot.onText(/^\/harvest-terminal(?:@\w+)?(?:\s+(--force))?\s*$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;
  await safeSend(chatId, '📋 Harvesting terminal sessions...');
  try {
    const { harvestTerminalSessions, formatHarvestReport } = await import('./terminal-harvester.js');
    const force = match && match[1] === '--force';
    const results = await harvestTerminalSessions({ force });
    await safeSend(chatId, formatHarvestReport(results), { parse_mode: 'Markdown' });
  } catch (err) {
    safeSend(chatId, `❌ Harvest error: ${err.message.slice(0, 300)}`);
  }
});

// ── X/Twitter commands ──────────────────────────────────────────────────────

bot.onText(/^\/tweet(?:@\w+)?\s+(.+)$/s, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;
  const text = match[1].trim();
  if (text.length > 280) {
    return safeSend(chatId, `❌ Tweet too long: ${text.length}/280 chars`);
  }
  await safeSend(chatId, `📝 Posting to X:\n"${text}"\n\nConfirm? /tweetconfirm`);
  // Store pending tweet
  global._pendingTweet = { text, chatId, timestamp: Date.now() };
});

bot.onText(/^\/tweetconfirm(?:@\w+)?\s*$/i, async (msg) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;
  if (!global._pendingTweet || Date.now() - global._pendingTweet.timestamp > 120000) {
    return safeSend(chatId, '❌ No pending tweet or expired (2 min limit)');
  }
  const { text } = global._pendingTweet;
  global._pendingTweet = null;
  await safeSend(chatId, '⏳ Posting...');
  try {
    const scriptPath = path.join(process.env.HOME, 'nanoclaw', 'x-post.js');
    const result = execFileSync('node', [scriptPath, 'post', text], {
      timeout: 30000, encoding: 'utf8'
    }).trim();
    const parsed = JSON.parse(result);
    await safeSend(chatId, `✅ Posted!\n${parsed.url}`);
  } catch (err) {
    safeSend(chatId, `❌ Tweet failed: ${err.message.slice(0, 300)}`);
  }
});

bot.onText(/^\/tweetthread(?:@\w+)?\s+(.+)$/s, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;
  // Split on --- or numbered lines
  const parts = match[1].split(/\n---\n|\n-{3,}\n/).map(p => p.trim()).filter(p => p);
  if (parts.length < 2) {
    return safeSend(chatId, '❌ Thread needs 2+ parts separated by ---');
  }
  const over = parts.find(p => p.length > 280);
  if (over) {
    return safeSend(chatId, `❌ Thread part too long (${over.length}/280):\n"${over.slice(0, 100)}..."`);
  }
  let preview = '📝 *Thread preview:*\n\n';
  parts.forEach((p, i) => { preview += `*${i + 1}.* ${p}\n\n`; });
  preview += `${parts.length} parts. /threadconfirm to post.`;
  await safeSend(chatId, preview, { parse_mode: 'Markdown' });
  global._pendingThread = { parts, chatId, timestamp: Date.now() };
});

bot.onText(/^\/threadconfirm(?:@\w+)?\s*$/i, async (msg) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;
  if (!global._pendingThread || Date.now() - global._pendingThread.timestamp > 300000) {
    return safeSend(chatId, '❌ No pending thread or expired (5 min limit)');
  }
  const { parts } = global._pendingThread;
  global._pendingThread = null;
  await safeSend(chatId, `⏳ Posting ${parts.length}-part thread...`);
  try {
    const scriptPath = path.join(process.env.HOME, 'nanoclaw', 'x-post.js');
    const result = execFileSync('node', [scriptPath, 'thread', ...parts], {
      timeout: 60000, encoding: 'utf8'
    }).trim();
    const parsed = JSON.parse(result);
    let msg = `✅ Thread posted! ${parsed.length} parts\n`;
    msg += parsed.map(p => `${p.part}. ${p.url}`).join('\n');
    await safeSend(chatId, msg);
  } catch (err) {
    safeSend(chatId, `❌ Thread failed: ${err.message.slice(0, 300)}`);
  }
});

bot.onText(/^\/xstatus(?:@\w+)?\s*$/i, async (msg) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;
  try {
    const scriptPath = path.join(process.env.HOME, 'nanoclaw', 'x-post.js');
    const result = execFileSync('node', [scriptPath, 'whoami'], {
      timeout: 15000, encoding: 'utf8'
    }).trim();
    const parsed = JSON.parse(result);
    await safeSend(chatId, `🐦 X: @${parsed.username} (${parsed.name})\nFollowers: ${parsed.followers} | Following: ${parsed.following}`);
  } catch (err) {
    safeSend(chatId, `❌ X auth check failed: ${err.message.slice(0, 300)}\n\nRun: node ~/nanoclaw/x-post.js login USERNAME PASSWORD EMAIL`);
  }
});

// ── /br — Basic Reflex hub command ───────────────────────────────────────────
bot.onText(/^\/br(?:@\w+)?$/i, async (msg) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;

  try {
    const [snapResp, profilesResp, expiringResp] = await Promise.all([
      fetch('http://localhost:8080/api/punchpass/summary').catch(() => null),
      fetch('http://localhost:8080/api/punchpass/profiles').catch(() => null),
      fetch('http://localhost:8080/api/punchpass/expiring').catch(() => null)
    ]);

    const snap = snapResp ? await snapResp.json() : {};
    const profiles = profilesResp ? await profilesResp.json() : [];
    const expiring = expiringResp ? await expiringResp.json() : [];

    let txt = '<b>Basic Reflex HQ</b>\n\n';

    // Punchpass snapshot
    if (snap.date) {
      txt += `<b>Gym Data</b> (${snap.date})\n`;
      txt += `  Members: ${snap.total_customers} | Passes: ${snap.active_passes}\n`;
      txt += `  Revenue: ${snap.month_revenue} | Attendances: ${snap.month_attendances}\n`;
      txt += `  No-shows: ${snap.month_no_shows}\n\n`;
    }

    // Member profiles
    if (profiles.length) {
      const active = profiles.filter(p => p.archetype_id !== 'fading_member');
      const fading = profiles.find(p => p.archetype_id === 'fading_member');
      txt += '<b>Members</b>\n';
      for (const p of active) {
        txt += `  ${p.emoji} ${p.name}: ${p.count}\n`;
      }
      if (fading) txt += `  ${fading.emoji} Fading: ${fading.count}\n`;
      txt += '\n';
    }

    // Alerts
    const alerts = [];
    if (snap.passes_expiring_soon > 0) {
      alerts.push(`${snap.passes_expiring_soon} passes expiring soon`);
    }
    if (snap.no_active_pass > 10) {
      alerts.push(`${snap.no_active_pass} members without active pass`);
    }
    if (alerts.length) {
      txt += '<b>Alerts</b>\n';
      for (const a of alerts) txt += `  - ${a}\n`;
      txt += '\n';
    }

    // Quick links
    txt += '<b>Quick Links</b>\n';
    txt += '  /punchpass — gym data + scrape\n';
    txt += '  /members — profiles + archetypes\n';
    txt += '  /member &lt;name&gt; — individual profile\n';
    txt += '  /brief — daily brief\n';
    txt += '  /ops — operations + compliance\n';
    txt += '  /student — student intel\n';
    txt += '\n  Dashboard: localhost:8080/punchpass';

    await safeSend(chatId, txt, { parse_mode: 'HTML' });
  } catch (err) {
    await safeSend(chatId, `BR error: ${err.message}`);
  }
});

// ── Punchpass Commands ──────────────────────────────────────────────────────
// /punchpass       → daily summary from latest scrape
// /punchpass run   → force a scrape now
// /punchpass expiring → show expiring passes
// /punchpass nopass   → show customers without active pass
bot.onText(/^\/punchpass(?:@\w+)?(?:\s+(.*))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;
  const arg = (match[1] || '').trim().toLowerCase();

  try {
    if (arg === 'run') {
      await safeSend(chatId, '🔄 Starting Punchpass scrape... (takes 1-2 minutes)');
      const proc = spawn('node', [
        path.join(process.env.HOME, 'nanoclaw', 'punchpass-scraper.cjs'),
      ], { env: process.env, cwd: path.join(process.env.HOME, 'nanoclaw'), timeout: 300000 });
      let stdout = '';
      proc.stdout.on('data', d => { stdout += d.toString(); });
      proc.stderr.on('data', d => { console.log('[punchpass]', d.toString().trim()); });
      proc.on('close', async (code) => {
        if (code === 0) {
          await safeSend(chatId, `✅ Punchpass scrape complete.\n\n${stdout.trim()}\n\n📊 Dashboard: http://localhost:8080/punchpass`);
        } else {
          await safeSend(chatId, `❌ Punchpass scrape failed (code ${code}).\n${stdout.trim()}`);
        }
      });
      proc.on('error', async (err) => {
        await safeSend(chatId, `❌ Punchpass error: ${err.message}`);
      });
    } else if (arg === 'expiring') {
      const resp = await fetch('http://localhost:8080/api/punchpass/expiring');
      const data = await resp.json();
      if (data.length === 0) {
        await safeSend(chatId, '✅ No passes expiring soon.');
      } else {
        const list = data.slice(0, 10).map(e =>
          `  • ${e.first_name} ${e.last_name} — ${e.pass} (${e.punches_left} left, exp ${e.expires_on})`
        ).join('\n');
        await safeSend(chatId, `⏰ <b>${data.length} passes expiring:</b>\n${list}`, { parse_mode: 'HTML' });
      }
    } else if (arg === 'nopass') {
      const resp = await fetch('http://localhost:8080/api/punchpass/no-pass');
      const data = await resp.json();
      if (data.length === 0) {
        await safeSend(chatId, '✅ All customers have an active pass!');
      } else {
        const list = data.slice(0, 10).map(n =>
          `  • ${n.first_name} ${n.last_name} — last: ${n.last_attendance || 'never'} (${n.total_attended || 0} total)`
        ).join('\n');
        await safeSend(chatId, `🚫 <b>${data.length} without active pass:</b>\n${list}`, { parse_mode: 'HTML' });
      }
    } else {
      // Default: show latest summary
      const resp = await fetch('http://localhost:8080/api/punchpass/summary');
      const snap = await resp.json();
      if (snap.error) {
        await safeSend(chatId, `No Punchpass data yet. Run: /punchpass run`);
      } else {
        let msg = `📊 <b>Punchpass — ${snap.date}</b>\n`;
        msg += `👥 Customers: ${snap.total_customers}\n`;
        msg += `🎫 Active passes: ${snap.active_passes}\n`;
        msg += `💰 Month revenue: ${snap.month_revenue}\n`;
        msg += `📈 Attendances: ${snap.month_attendances}\n`;
        msg += `❌ No-shows: ${snap.month_no_shows}\n`;
        msg += `⏰ Expiring: ${snap.passes_expiring_soon}\n`;
        msg += `🚫 No pass: ${snap.no_active_pass}\n`;
        msg += `\n📊 Dashboard: http://localhost:8080/punchpass`;
        await safeSend(chatId, msg, { parse_mode: 'HTML' });
      }
    }
  } catch (err) {
    await safeSend(chatId, `❌ Punchpass error: ${err.message}`);
  }
});

// ── /members — Member profiles from Punchpass ────────────────────────────────
// /members         → archetype breakdown
// /members build   → rebuild profiles from latest scrape
// /members search <name> → find member
// /members <archetype>   → list members in archetype
bot.onText(/^\/members(?:@\w+)?(?:\s+(.*))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;
  const sub = (match[1] || '').trim();

  try {
    if (sub === 'build') {
      const resp = await fetch('http://localhost:8080/api/punchpass/profiles/build', { method: 'POST' });
      const data = await resp.json();
      if (data.ok) {
        await safeSend(chatId, `Built ${data.profiles_built} member profiles.`);
        // Show summary after build
        const sumResp = await fetch('http://localhost:8080/api/punchpass/profiles');
        const summary = await sumResp.json();
        let txt = '<b>Archetype Breakdown:</b>\n';
        for (const s of summary) {
          txt += `${s.emoji} <b>${s.name}</b>: ${s.count} members (avg ${s.avg_attended} sessions)\n`;
        }
        await safeSend(chatId, txt, { parse_mode: 'HTML' });
      }

    } else if (sub.startsWith('search ')) {
      const query = sub.replace('search ', '');
      const resp = await fetch(`http://localhost:8080/api/punchpass/members/search?q=${encodeURIComponent(query)}`);
      const results = await resp.json();
      if (results.length === 0) {
        await safeSend(chatId, `No members matching "${query}".`);
      } else {
        let txt = `<b>Search: "${query}"</b>\n\n`;
        for (const m of results.slice(0, 15)) {
          const arch = m.archetype;
          const emoji = arch ? arch.emoji : '?';
          const archName = arch ? arch.name : m.archetype_id;
          const block = m.block || m.current_block || 1;
          const blockInfo = m.blockInfo;
          txt += `${emoji} <b>${m.first_name} ${m.last_name}</b>\n`;
          txt += `   ${archName} | ${m.total_attended} sessions | Block ${block}${blockInfo ? ' (' + blockInfo.name + ')' : ''}\n`;
          if (m.pass_type && m.pass_type !== 'none') txt += `   Pass: ${m.pass_type.split(' | ')[0]}\n`;
          if (m.notes) txt += `   Note: ${m.notes}\n`;
          txt += '\n';
        }
        if (results.length > 15) txt += `... and ${results.length - 15} more`;
        await safeSend(chatId, txt, { parse_mode: 'HTML' });
      }

    } else if (sub && !sub.includes(' ')) {
      // Archetype listing
      const resp = await fetch(`http://localhost:8080/api/punchpass/profiles/${encodeURIComponent(sub)}`);
      const data = await resp.json();
      const arch = data.archetype;
      if (!arch && data.members.length === 0) {
        await safeSend(chatId, `Unknown archetype: ${sub}\n\nValid: core_regular, pt_warrior, trainer_client, fresh_trial, drop_in_drifter, private_crew, sparring_ready, fading_member, high_roller, ghost`);
        return;
      }
      let txt = `${arch?.emoji || '?'} <b>${arch?.name || sub}</b>\n`;
      txt += `${arch?.desc || ''}\n`;
      txt += `Blocks ${arch?.blockRange?.[0] || '?'}-${arch?.blockRange?.[1] || '?'} | ${arch?.classNeeds || ''}\n`;
      txt += `Coach: ${arch?.coachNote || ''}\n\n`;
      txt += `<b>${data.members.length} members:</b>\n`;
      for (const m of data.members.slice(0, 20)) {
        txt += `  ${m.first_name} ${m.last_name} — ${m.total_attended} sessions\n`;
      }
      if (data.members.length > 20) txt += `  ... and ${data.members.length - 20} more`;
      await safeSend(chatId, txt, { parse_mode: 'HTML' });

    } else {
      // Default: summary
      const resp = await fetch('http://localhost:8080/api/punchpass/profiles');
      const summary = await resp.json();
      if (summary.length === 0) {
        await safeSend(chatId, 'No profiles yet. Run: /members build');
        return;
      }
      let txt = '<b>Member Profiles</b>\n\n';
      let totalActive = 0;
      for (const s of summary) {
        if (s.archetype_id !== 'fading_member') totalActive += s.count;
        txt += `${s.emoji} <b>${s.name}</b>: ${s.count}`;
        if (s.avg_attended > 0) txt += ` (avg ${s.avg_attended}/mo)`;
        txt += '\n';
      }
      txt += `\n<b>Active: ${totalActive}</b> | Fading: ${summary.find(s => s.archetype_id === 'fading_member')?.count || 0}`;
      txt += '\n\nCommands:\n/members build — rebuild from latest scrape\n/members search &lt;name&gt;\n/members &lt;archetype_id&gt;';
      await safeSend(chatId, txt, { parse_mode: 'HTML' });
    }
  } catch (err) {
    await safeSend(chatId, `Members error: ${err.message}`);
  }
});

// ── /member — Individual member profile management ───────────────────────────
// /member <name>                    → show full profile
// /member <name> block <n>          → set curriculum block
// /member <name> type <archetype>   → override archetype
// /member <name> note <text>        → set coaching notes
// /member <name> tag <text>         → add tag
// /member <name> untag <text>       → remove tag
bot.onText(/^\/member(?:@\w+)?\s+(.+)$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;
  const input = match[1].trim();

  try {
    // Parse: check for sub-commands at end
    let name, action, value;
    const blockMatch = input.match(/^(.+?)\s+block\s+(\d+)$/i);
    const typeMatch = input.match(/^(.+?)\s+type\s+(\S+)$/i);
    const noteMatch = input.match(/^(.+?)\s+note\s+(.+)$/i);
    const tagMatch = input.match(/^(.+?)\s+tag\s+(.+)$/i);
    const untagMatch = input.match(/^(.+?)\s+untag\s+(.+)$/i);

    if (blockMatch) { name = blockMatch[1]; action = 'block'; value = parseInt(blockMatch[2]); }
    else if (typeMatch) { name = typeMatch[1]; action = 'type'; value = typeMatch[2]; }
    else if (noteMatch) { name = noteMatch[1]; action = 'note'; value = noteMatch[2]; }
    else if (untagMatch) { name = untagMatch[1]; action = 'untag'; value = untagMatch[2]; }
    else if (tagMatch) { name = tagMatch[1]; action = 'tag'; value = tagMatch[2]; }
    else { name = input; action = 'show'; }

    // Search for member
    const searchResp = await fetch(`http://localhost:8080/api/punchpass/members/search?q=${encodeURIComponent(name)}`);
    const results = await searchResp.json();

    if (results.length === 0) {
      await safeSend(chatId, `No member matching "${name}".`);
      return;
    }

    const member = results[0]; // Best match
    const cid = member.customer_id;

    if (action === 'block') {
      if (value < 1 || value > 10) { await safeSend(chatId, 'Block must be 1-10.'); return; }
      await fetch(`http://localhost:8080/api/punchpass/member/${cid}/block`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ block: value })
      });
      const blockInfo = require('./block-config.json').blocks[value - 1];
      await safeSend(chatId, `${member.first_name} ${member.last_name} → Block ${value} (${blockInfo.name}: ${blockInfo.focus})`, { parse_mode: 'HTML' });

    } else if (action === 'type') {
      await fetch(`http://localhost:8080/api/punchpass/member/${cid}/archetype`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archetype_id: value })
      });
      await safeSend(chatId, `${member.first_name} ${member.last_name} → archetype: ${value}`);

    } else if (action === 'note') {
      await fetch(`http://localhost:8080/api/punchpass/member/${cid}/notes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: value })
      });
      await safeSend(chatId, `${member.first_name} ${member.last_name} — note saved.`);

    } else if (action === 'tag') {
      await fetch(`http://localhost:8080/api/punchpass/member/${cid}/tag`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: value })
      });
      await safeSend(chatId, `${member.first_name} ${member.last_name} +tag: ${value}`);

    } else if (action === 'untag') {
      await fetch(`http://localhost:8080/api/punchpass/member/${cid}/tag`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: value, action: 'remove' })
      });
      await safeSend(chatId, `${member.first_name} ${member.last_name} -tag: ${value}`);

    } else {
      // Show full profile
      const arch = member.archetype;
      const blockNum = member.block || member.current_block || 1;
      const blockInfo = member.blockInfo;
      const tags = JSON.parse(member.tags || '[]');

      let txt = `<b>${member.first_name} ${member.last_name}</b>\n`;
      txt += `${arch?.emoji || '?'} ${arch?.name || member.archetype_id}`;
      if (member.archetype_override) txt += ' (manual)';
      txt += '\n\n';
      txt += `<b>Block:</b> ${blockNum}`;
      if (blockInfo) txt += ` — ${blockInfo.name} (${blockInfo.focus})`;
      if (member.block_override) txt += ' (manual)';
      txt += '\n';
      txt += `<b>Sessions:</b> ${member.total_attended} | No-show: ${Math.round(member.no_show_rate * 100)}%\n`;
      txt += `<b>Pass:</b> ${member.pass_type || 'none'}\n`;
      if (member.last_attendance) txt += `<b>Last seen:</b> ${member.last_attendance}\n`;
      if (tags.length) txt += `<b>Tags:</b> ${tags.join(', ')}\n`;
      if (member.notes) txt += `\n<b>Notes:</b> ${member.notes}\n`;

      if (arch) {
        txt += `\n<b>Class needs:</b> ${arch.classNeeds}`;
        txt += `\n<b>Coach note:</b> ${arch.coachNote}`;
      }

      txt += '\n\nEdit: /member Name block N | note text | tag text | type archetype_id';
      await safeSend(chatId, txt, { parse_mode: 'HTML' });
    }
  } catch (err) {
    await safeSend(chatId, `Member error: ${err.message}`);
  }
});

// ── /pipeline — Multi-agent review pipeline ─────────────────────────────────
bot.onText(/\/pipeline(?:\s+(\S+))?\s*([\s\S]*)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;

  const pipelineName = (match[1] || '').trim().toLowerCase();
  const seed = (match[2] || '').trim();

  if (!pipelineName || !['content', 'research'].includes(pipelineName)) {
    return safeSend(chatId, 'Usage: /pipeline content [seed text]\n       /pipeline research [seed text]\n\nPipelines: content (Muse→Maya→Reed→Orc), research (Archaeologist→Muse→Archivist)');
  }

  await safeSend(chatId, `Running ${pipelineName} pipeline...`);

  try {
    const { runPipeline } = require(path.join(process.env.HOME, 'Cathedral', 'agents', 'pipeline-runner'));
    const result = await runPipeline(pipelineName, { seed: seed || undefined });

    // Send stage-by-stage results
    for (const stage of result.stages) {
      const header = `<b>${stage.agent.toUpperCase()}</b> (${stage.role}) — ${Math.round(stage.duration_ms / 1000)}s`;
      if (stage.error) {
        await safeSend(chatId, `${header}\n❌ ${stage.error}`, { parse_mode: 'HTML' });
      } else {
        const output = (stage.output || '').slice(0, 3500);
        await safeSend(chatId, `${header}\n\n${output}`, { parse_mode: 'HTML' });
      }
    }

    // Final verdict
    const verdictEmoji = result.verdict === 'PASS' ? '✅' : result.verdict === 'REJECT' ? '❌' : result.verdict === 'ITERATE' ? '🔄' : '⚪';
    await safeSend(chatId, `${verdictEmoji} <b>${pipelineName.toUpperCase()} PIPELINE</b>: ${result.verdict} (${Math.round(result.duration_ms / 1000)}s)`, { parse_mode: 'HTML' });
  } catch (err) {
    await safeSend(chatId, `Pipeline error: ${err.message}`);
  }
});

// ── /capture — Quick 3-line memory deposit ──────────────────────────────────
const captureState = {};
bot.onText(/^\/capture(?:@\w+)?\s*$/i, async (msg) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;
  captureState[chatId] = { step: 'thought', lines: {} };
  await safeSend(chatId, '🧠 *CAPTURE*\n\nLine 1/3 — What I *thought*:', { parse_mode: 'Markdown' });
});

bot.onText(/^\/capture(?:@\w+)?\s+(.+)$/s, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;
  // One-shot: split by newlines into thought/built/shipped
  const lines = match[1].split('\n').map(l => l.trim()).filter(Boolean);
  const thought = lines[0] || '';
  const built = lines[1] || '';
  const shipped = lines[2] || '';
  const today = new Date().toISOString().split('T')[0];
  const time = new Date().toTimeString().slice(0, 5);
  const content = `---\ndate: ${today}\ntime: "${time}"\ntype: capture\n---\n\n# Capture — ${today} ${time}\n\n**Thought:** ${thought}\n**Built:** ${built}\n**Shipped:** ${shipped}\n`;
  writeToVault(chatId, `00_Staging/captures/capture-${today}-${time.replace(':', '')}.md`, content);
});

// Multi-step capture flow handler
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  if (!captureState[chatId] || !msg.text || msg.text.startsWith('/')) return;
  const state = captureState[chatId];
  const text = msg.text.trim();

  if (state.step === 'thought') {
    state.lines.thought = text;
    state.step = 'built';
    await safeSend(chatId, 'Line 2/3 — What I *built*:', { parse_mode: 'Markdown' });
  } else if (state.step === 'built') {
    state.lines.built = text;
    state.step = 'shipped';
    await safeSend(chatId, 'Line 3/3 — What I *shipped*:', { parse_mode: 'Markdown' });
  } else if (state.step === 'shipped') {
    state.lines.shipped = text;
    const today = new Date().toISOString().split('T')[0];
    const time = new Date().toTimeString().slice(0, 5);
    const content = `---\ndate: ${today}\ntime: "${time}"\ntype: capture\n---\n\n# Capture — ${today} ${time}\n\n**Thought:** ${state.lines.thought}\n**Built:** ${state.lines.built}\n**Shipped:** ${state.lines.shipped}\n`;
    writeToVault(chatId, `00_Staging/captures/capture-${today}-${time.replace(':', '')}.md`, content);
    delete captureState[chatId];
  }
});

// ── /breathe — Vortex breathing timer (4-4-6-4) ─────────────────────────────
bot.onText(/^\/breathe(?:@\w+)?(?:\s+(\d+))?\s*$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isPaul(chatId)) return;
  const cycles = Math.min(parseInt(match?.[1]) || 3, 10);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  await safeSend(chatId, `🌀 *Vortex Breathing* — ${cycles} cycles\n4 in · 4 hold · 6 out · 4 hold\n\nStarting in 3...`, { parse_mode: 'Markdown' });
  await sleep(3000);

  for (let i = 1; i <= cycles; i++) {
    await safeSend(chatId, `— Cycle ${i}/${cycles} —\n\n🫁 *BREATHE IN...*`, { parse_mode: 'Markdown' });
    await sleep(4000);
    await safeSend(chatId, '⏸ *HOLD...*', { parse_mode: 'Markdown' });
    await sleep(4000);
    await safeSend(chatId, '💨 *BREATHE OUT...*', { parse_mode: 'Markdown' });
    await sleep(6000);
    await safeSend(chatId, '⏸ *HOLD...*', { parse_mode: 'Markdown' });
    await sleep(4000);
  }

  await safeSend(chatId, `✅ *${cycles} cycles complete.*\n\nSovereignty restored.`, { parse_mode: 'Markdown' });
});

// ── Inline keyboard callback handler (Densifier, Decay Detector) ────────────
bot.on('callback_query', async (query) => {
  const data = query.data;
  const chatId = query.message.chat.id;
  if (!isPaul(chatId)) return; // auth: Paul only
  const msgId = query.message.message_id;

  try {
    if (data.startsWith('dense_approve:') || data.startsWith('dense_skip:')) {
      const action = data.startsWith('dense_approve:') ? '--apply' : '--skip';
      // execSync imported at top
      const result = execSync(
        `python3 ${path.join(process.env.HOME, 'Cathedral', 'vault-densifier.py')} ${action} "${data}"`,
        { timeout: 15000, encoding: 'utf8' }
      ).trim();
      await bot.answerCallbackQuery(query.id, { text: result.slice(0, 200) });
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [[{ text: data.startsWith('dense_approve:') ? '✅ Linked' : '⏭ Skipped', callback_data: 'noop' }]] },
        { chat_id: chatId, message_id: msgId }
      );
    } else if (data.startsWith('content_approve:') || data.startsWith('content_reject:')) {
      // Content Machine → Taste Map passive learning + Bandit feedback
      const isApprove = data.startsWith('content_approve:');
      const filename = data.split(':').slice(1).join(':');
      // Extract style from filename pattern: {source}-{style}-captioned.jpg
      const styleMatch = filename.match(/-(bw|neon|film|comic|cinematic|pro_photo|dramatic|manga|ippo|noir|poster|oil)-/i);
      const style = styleMatch ? styleMatch[1] : 'unknown';

      // Paper trial tracking
      const { recordVote } = await import('./paper-trial-tracker.js');

      // Bandit feedback — read metadata to get caption_category and position
      let banditMsg = '';
      try {
        const { recordOutcome: banditRecord } = await import('./bandit-brain.js');
        const { out: lindaOut } = await import('./linda-vault.js');
        const metaPath = path.join(process.env.HOME, 'Cathedral', 'br-content', 'content-bandit-meta.json');
        let captionCat = null, pos = null;
        if (fs.existsSync(metaPath)) {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
          const entry = meta[filename];
          if (entry) { captionCat = entry.caption_category; pos = entry.position; }
        }
        // Feed each bandit (self-report = trusted)
        const styleArms = ['bw', 'neon', 'film', 'comic', 'cinematic'];
        const captionArms = ['motivational', 'technique', 'community'];
        const posArms = ['bottom', 'top', 'center'];
        if (styleArms.includes(style)) banditRecord('content-style', style, isApprove, 'content-style');
        if (captionCat && captionArms.includes(captionCat)) banditRecord('content-caption', captionCat, isApprove, 'content-caption');
        if (pos && posArms.includes(pos)) banditRecord('content-position', pos, isApprove, 'content-position');
        // Linda tuple
        if (isApprove) lindaOut(['style_victory', 'content_machine', style, 'A'], 'visual', 'content-machine');
        lindaOut(['outcome', 'content_generation', isApprove ? 1 : 0], 'swarm', 'content-machine');
        banditMsg = ' + bandit';
      } catch (e) {
        console.error('[content-callback] Bandit feedback failed:', e.message);
      }

      if (isApprove) {
        addAnchor('visual_style', 'anchors', {
          item: filename,
          status: 'YES',
          style,
          reason: 'Paul approved via Content Machine',
          timestamp: new Date().toISOString()
        });
        recordVote('content', 'approve', { filename, style });
        await bot.answerCallbackQuery(query.id, { text: `✅ Approved + taste map${banditMsg} (${style})` });
        await bot.editMessageReplyMarkup(
          { inline_keyboard: [[{ text: `✅ Approved (${style})`, callback_data: 'noop' }]] },
          { chat_id: chatId, message_id: msgId }
        );
      } else {
        const { addRejection } = await import('./taste-map-api.js');
        addRejection('visual_style', `Rejected: ${filename} — ${style} style`);
        recordVote('content', 'reject', { filename, style });
        await bot.answerCallbackQuery(query.id, { text: `❌ Rejected + taste map${banditMsg} (${style})` });
        await bot.editMessageReplyMarkup(
          { inline_keyboard: [[{ text: `❌ Rejected (${style})`, callback_data: 'noop' }]] },
          { chat_id: chatId, message_id: msgId }
        );
      }
    } else if (data.startsWith('muse_useful:') || data.startsWith('muse_meh:')) {
      // Muse bandit feedback — Paul rates the nightly finding
      const isUseful = data.startsWith('muse_useful:');
      const parts = data.split(':');
      // Format: muse_useful:thinking:focus:source
      const thinkingMode = parts[1];
      const focusMode = parts[2];
      const sourceMode = parts[3];

      let banditMsg = '';
      try {
        const { recordOutcome: banditRecord } = await import('./bandit-brain.js');
        const { out: lindaOutFn } = await import('./linda-vault.js');

        // Feed each bandit (self-report = trusted)
        if (thinkingMode) banditRecord('muse-thinking', thinkingMode, isUseful, 'muse-thinking');
        if (focusMode) banditRecord('muse-focus', focusMode, isUseful, 'muse-focus');
        if (sourceMode) banditRecord('muse-source', sourceMode, isUseful, 'muse-source');

        // Linda tuple
        lindaOutFn(['outcome', 'muse_feedback', isUseful ? 1 : 0], 'swarm', 'the-muse');
        banditMsg = ' + bandit';
      } catch (e) {
        console.error('[muse-callback] Bandit feedback failed:', e.message);
      }

      const label = isUseful ? '\uD83D\uDD25 Useful' : '\uD83D\uDE34 Meh';
      await bot.answerCallbackQuery(query.id, { text: `${label}${banditMsg}` });
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [[{ text: `${label} (noted)`, callback_data: 'noop' }]] },
        { chat_id: chatId, message_id: msgId }
      );

    } else if (data.startsWith('content_edit:')) {
      // Edit flow — just acknowledge, no taste map update (ambiguous signal)
      await bot.answerCallbackQuery(query.id, { text: 'Edit noted — no taste map update (ambiguous)' });
    } else if (data.startsWith('decay_')) {
      await bot.answerCallbackQuery(query.id, { text: 'Noted' });
    } else if (data.startsWith('intake_cat:')) {
      // Intake watcher classification callback
      const parts = data.split(':');
      const category = parts[1];
      const filename = parts.slice(2).join(':');
      handleIntakeCallback({ callback_query: query });
      await bot.answerCallbackQuery(query.id, { text: `${category} selected` });
    } else if (data.startsWith('pick_')) {
      // Daily Pick — Paul vs Machine
      const parts = data.split('_');
      const pick = parts[1]; // A, B, or C
      const date = parts.slice(2).join('_'); // YYYY-MM-DD
      try {
        const { handlePick } = await import('./trader/daily-pick.js');
        const result = handlePick(pick, date);
        if (result) {
          const response = `${result.message}\n\nAI revealed after you pick — no cheating.`;
          await bot.answerCallbackQuery(query.id, { text: `Picked: ${result.paulPick}` });
          await bot.sendMessage(chatId, response);
          await bot.editMessageReplyMarkup(
            { inline_keyboard: [[{ text: `You: ${result.paulPick} | AI: ${result.aiPick}`, callback_data: 'noop' }]] },
            { chat_id: chatId, message_id: msgId }
          );
        } else {
          await bot.answerCallbackQuery(query.id, { text: 'Already picked or expired' });
        }
      } catch (e) {
        console.error('Pick callback error:', e.message);
        await bot.answerCallbackQuery(query.id, { text: 'Pick handler error' });
      }
    } else if (data.startsWith('curator_yes:') || data.startsWith('curator_no:') || data.startsWith('curator_skip:')) {
      const parts = data.split(':');
      const action = parts[0].replace('curator_', '');
      const videoId = parts.slice(1).join(':');
      const decision = action === 'yes' ? 'accepted' : action === 'no' ? 'rejected' : 'skipped';

      tasteCurator.reviewCandidate(videoId, decision);

      const label = action === 'yes' ? 'YES — added to taste map' : action === 'no' ? 'NO — rejected' : 'SKIP — for later';
      await bot.answerCallbackQuery(query.id, { text: label });
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [[{ text: label, callback_data: 'noop' }]] },
        { chat_id: chatId, message_id: msgId }
      );

      // Auto-show next candidate
      const next = tasteCurator.getNextCandidate();
      if (next) {
        const pending = tasteCurator.getPendingCount();
        setTimeout(() => {
          const text = tasteCurator.formatCandidate(next);
          safeSend(chatId, `(${pending} remaining)\n\n${text}`, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[
                { text: 'YES', callback_data: `curator_yes:${next.videoId}` },
                { text: 'NO', callback_data: `curator_no:${next.videoId}` },
                { text: 'SKIP', callback_data: `curator_skip:${next.videoId}` }
              ]]
            }
          });
        }, 500);
      } else {
        safeSend(chatId, 'All candidates reviewed.');
      }
    } else if (data === 'noop') {
      await bot.answerCallbackQuery(query.id);
    }
  } catch (err) {
    console.error('Callback error:', err.message);
    await bot.answerCallbackQuery(query.id, { text: `Error: ${err.message.slice(0, 150)}` });
  }
});
