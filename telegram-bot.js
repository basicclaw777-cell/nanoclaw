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
import { generatePlan, generateHTML, generateMermaid, depositToVault, formatPlanTelegram, listPlans } from './architect.js';
import djCurator from './dj-curator.js';
import soundStudio from './sound-studio/engine.js';
import gymEyes from './gym-eyes.js';

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
        const cartRes = await fetch('http://localhost:11434/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'hermes3',
            messages: [{
              role: 'system',
              content: `You are the Cartographer of the Cathedral. You define new system cards.
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
}`
            }, {
              role: 'user',
              content: `Define card #${nextId}: "${cardName}"`
            }],
            stream: false,
            options: { temperature: 0.3, num_predict: 500 },
            format: 'json',
          }),
        });

        const cartData = await cartRes.json();
        let cardDef;
        try {
          cardDef = JSON.parse(cartData.message?.content || '{}');
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

    const cartRes = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'hermes3',
        messages: [
          { role: 'system', content: cartographerPrompt },
          { role: 'user', content: `Write the slide brief for: "${topic}"` }
        ],
        stream: false,
        options: { temperature: 0.3, num_predict: 400 },
        format: 'json',
      }),
    });

    const cartData = await cartRes.json();
    let brief;
    try {
      brief = JSON.parse(cartData.message?.content || '{}');
    } catch(e) {
      brief = { title: topic, subtitle: 'Cathedral architecture', highlights: [], visual_metaphor: '' };
    }

    if (!brief.title) brief.title = topic;

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

// ── Gym Eyes commands ────────────────────────────────────────────────────────

bot.onText(/^\/eyes(?:@\w+)?\s*$/, async (msg) => {
  safeSend(msg.chat.id, gymEyes.formatStatusTelegram(), { parse_mode: 'Markdown' });
});

bot.onText(/^\/eyes(?:@\w+)?\s+last\s*$/i, async (msg) => {
  const chatId = msg.chat.id;
  const analyses = gymEyes.listAnalyses(1);
  if (analyses.length === 0) return safeSend(chatId, '👁 No analyses yet.');

  try {
    const data = JSON.parse(fs.readFileSync(path.join(process.env.HOME, 'nanoclaw', 'gym-eyes', 'output', analyses[0].name), 'utf8'));
    safeSend(chatId, gymEyes.formatAnalysisTelegram(data), { parse_mode: 'Markdown' });
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
  if (!fileId) {
    return safeSend(chatId, '❌ Reply must be a video or document file.');
  }

  await safeSend(chatId, '👁 Gym Eyes: downloading video + running YOLO pose analysis...\nThis may take 1-5 min depending on video length.');

  try {
    const fileLink = await bot.getFileLink(fileId);
    const tmpPath = `/tmp/gym-eyes-${Date.now()}.mp4`;
    execSync(`curl -sL "${fileLink}" -o "${tmpPath}"`, { timeout: 120000 });

    const analysis = await gymEyes.analyzeVideoAsync(tmpPath, 'telegram');
    await safeSend(chatId, gymEyes.formatAnalysisTelegram(analysis), { parse_mode: 'Markdown' });

    // Clean up
    try { fs.unlinkSync(tmpPath); } catch {}
  } catch (err) {
    safeSend(chatId, `❌ Gym Eyes error: ${err.message.slice(0, 300)}`);
  }
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
      // Content Machine → Taste Map passive learning
      const isApprove = data.startsWith('content_approve:');
      const filename = data.split(':').slice(1).join(':');
      // Extract style from filename pattern: {source}-{style}-captioned.jpg
      const styleMatch = filename.match(/-(bw|neon|film|comic|cinematic|pro_photo|dramatic|manga|ippo|noir|poster|oil)-/i);
      const style = styleMatch ? styleMatch[1] : 'unknown';

      if (isApprove) {
        addAnchor('visual_style', 'anchors', {
          item: filename,
          status: 'YES',
          style,
          reason: 'Paul approved via Content Machine',
          timestamp: new Date().toISOString()
        });
        await bot.answerCallbackQuery(query.id, { text: `✅ Approved + taste map updated (${style})` });
        await bot.editMessageReplyMarkup(
          { inline_keyboard: [[{ text: `✅ Approved (${style})`, callback_data: 'noop' }]] },
          { chat_id: chatId, message_id: msgId }
        );
      } else {
        const { addRejection } = await import('./taste-map-api.js');
        addRejection('visual_style', `Rejected: ${filename} — ${style} style`);
        await bot.answerCallbackQuery(query.id, { text: `❌ Rejected + taste map updated (${style})` });
        await bot.editMessageReplyMarkup(
          { inline_keyboard: [[{ text: `❌ Rejected (${style})`, callback_data: 'noop' }]] },
          { chat_id: chatId, message_id: msgId }
        );
      }
    } else if (data.startsWith('content_edit:')) {
      // Edit flow — just acknowledge, no taste map update (ambiguous signal)
      await bot.answerCallbackQuery(query.id, { text: 'Edit noted — no taste map update (ambiguous)' });
    } else if (data.startsWith('decay_')) {
      await bot.answerCallbackQuery(query.id, { text: 'Noted' });
    } else if (data === 'noop') {
      await bot.answerCallbackQuery(query.id);
    }
  } catch (err) {
    console.error('Callback error:', err.message);
    await bot.answerCallbackQuery(query.id, { text: `Error: ${err.message.slice(0, 150)}` });
  }
});
