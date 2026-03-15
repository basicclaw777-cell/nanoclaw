import TelegramBot from 'node-telegram-bot-api';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { generateReport } from './vortex-report.js';
import { logConversation, getProfileContext } from './universal-memory.js';


import { addToConversation, formatHistoryForPrompt, formatSessionMemoryForPrompt, formatPaulProfileForPrompt } from './memory-system.js';
import { scanCathedral, getDailyBriefing, answerManagerQuery, getQuickStatus } from './cathedral-manager.js';

import { createSeed, getSeedTopics } from './seed-generator.js';

const TELEGRAM_TOKEN = '8284790243:AAHocCsFhjkzmRsGPI0t1I_NMF4ZcPV--v4';
const OPENROUTER_KEY = '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';
const KNOWLEDGEBASE_PATH = path.join(process.env.HOME, 'nanoclaw-data', 'knowledgebase');
const SAGES_PATH = path.join(process.env.HOME, 'nanoclaw', 'sages');
const DB_PATH = path.join(process.env.HOME, 'nanoclaw', 'vortex_data', 'metrics.db');

const MODELS = {
  fast: 'gemma3:4b',
  balanced: 'llama3.1',
  powerful: 'qwen3:14b',
  cloud: 'anthropic/claude-3.5-sonnet'
};

const QUALITY_THRESHOLD = 70;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const userModes = {};

// ============================================
// DATABASE
// ============================================
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error('DB error:', err.message);
  else console.log('📊 Vortex Keeper DB connected');
});

db.run(`CREATE TABLE IF NOT EXISTS cascade_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  mode TEXT,
  question TEXT,
  local_model TEXT,
  local_response TEXT,
  local_quality_score REAL,
  escalated BOOLEAN,
  final_model TEXT,
  final_response TEXT,
  tokens_local INTEGER DEFAULT 0,
  tokens_cloud INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  latency_ms INTEGER
)`);

// ============================================
// HELPERS
// ============================================
function loadSage(sageName) {
  try {
    const sagePath = path.join(SAGES_PATH, `${sageName}.json`);
    if (fs.existsSync(sagePath)) return JSON.parse(fs.readFileSync(sagePath, 'utf8'));
    return null;
  } catch (error) {
    return null;
  }
}

function getKnowledgebaseContent() {
  try {
    if (!fs.existsSync(KNOWLEDGEBASE_PATH)) return "Knowledgebase is empty.";
    const files = fs.readdirSync(KNOWLEDGEBASE_PATH);
    let content = "";
    files.forEach(file => {
      const filePath = path.join(KNOWLEDGEBASE_PATH, file);
      if (fs.statSync(filePath).isFile()) {
        content += `\n--- ${file} ---\n${fs.readFileSync(filePath, 'utf8')}\n`;
      }
    });
    return content || "Knowledgebase is empty.";
  } catch (error) {
    return `Error: ${error.message}`;
  }
}

// ============================================
// QUALITY SCORER
// ============================================
function scoreQuality(response, sageName) {
  if (!response || response.length < 20) return 0;
  let score = 50;
  const sage = loadSage(sageName);
  const lexicon = sage ? Object.keys(sage.sovereign_lexicon || {}) : [];
  const signaturePhrases = sage ? (sage.response_style?.signature_phrases || []) : [];
  const responseLower = response.toLowerCase();

  if (response.length > 100) score += 10;
  if (response.length > 300) score += 10;

  let lexiconHits = 0;
  lexicon.forEach(term => {
    if (responseLower.includes(term.toLowerCase())) lexiconHits++;
  });
  score += Math.min(20, lexiconHits * 5);

  signaturePhrases.forEach(phrase => {
    if (responseLower.includes(phrase.toLowerCase().substring(0, 15))) score += 5;
  });

  const genericPhrases = ["i'm an ai", "as an ai", "i cannot", "i don't have", "i apologize", "how can i help"];
  genericPhrases.forEach(phrase => {
    if (responseLower.includes(phrase)) score -= 15;
  });

  if (sageName === 'leonardo' && responseLower.includes('architect')) score += 10;
  if (sageName === 'marcus' && responseLower.includes('citadel')) score += 10;

  return Math.max(0, Math.min(100, score));
}

// ============================================
// LOCAL LLM
// ============================================
async function callLocal(model, systemPrompt, userMessage) {
  const startTime = Date.now();
  const payload = JSON.stringify({
    model,
    prompt: `${systemPrompt}\n\nUser: ${userMessage}\n\nResponse:`,
    stream: false,
    options: { temperature: 0.7, num_ctx: 4096 }
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost', port: 11434, path: '/api/generate', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ response: parsed.response || '', latency: Date.now() - startTime, tokens: parsed.eval_count || 0 });
        } catch (e) { reject(e); }
      });
    });
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Local LLM timeout')); });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ============================================
// CLOUD LLM
// ============================================
async function callCloud(systemPrompt, userMessage) {
  const startTime = Date.now();
  const data = JSON.stringify({
    model: MODELS.cloud,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ]
  });
  const options = {
    hostname: 'openrouter.ai', path: '/api/v1/chat/completions', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENROUTER_KEY}`, 'Content-Length': Buffer.byteLength(data) }
  };
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let response = '';
      res.on('data', chunk => response += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(response);
          resolve({ response: parsed.choices[0].message.content, latency: Date.now() - startTime, tokens: parsed.usage?.total_tokens || 0 });
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ============================================
// CASCADE ROUTER
// ============================================
async function cascadeAsk(sageName, question) {
  const sage = loadSage(sageName);
  if (!sage) return `⚠️ Sage ${sageName} not found.`;

  const kbContent = getKnowledgebaseContent();
  const systemPrompt = `${sage.system_prompt}\n\nPaul's knowledge vault:\n${kbContent}`;

  let localResult = null;
  let localScore = 0;
  let escalated = false;
  let finalResult = null;
  let finalModel = '';

  console.log(`🔄 [${sageName}] Trying local: ${MODELS.balanced}`);
  try {
    localResult = await callLocal(MODELS.balanced, systemPrompt, question);
    localScore = scoreQuality(localResult.response, sageName);
    console.log(`📊 Local quality: ${localScore}%`);

    if (localScore >= QUALITY_THRESHOLD) {
      finalResult = localResult;
      finalModel = MODELS.balanced;
      console.log(`✅ Local passed (${localScore}%)`);
    } else {
      console.log(`⬆️ Trying ${MODELS.powerful}...`);
      try {
        const powerfulResult = await callLocal(MODELS.powerful, systemPrompt, question);
        const powerfulScore = scoreQuality(powerfulResult.response, sageName);
        console.log(`📊 Powerful local: ${powerfulScore}%`);
        if (powerfulScore >= QUALITY_THRESHOLD) {
          finalResult = powerfulResult;
          finalModel = MODELS.powerful;
          localScore = powerfulScore;
        } else {
          escalated = true;
        }
      } catch {
        escalated = true;
      }
    }
  } catch {
    escalated = true;
  }

  if (escalated || !finalResult) {
    console.log(`☁️ Escalating to cloud`);
    try {
      finalResult = await callCloud(systemPrompt, question);
      finalModel = MODELS.cloud;
    } catch (err) {
      return `⚠️ All models failed: ${err.message}`;
    }
  }

  const costEstimate = escalated ? (finalResult.tokens * 0.000003) : 0;
  db.run(`INSERT INTO cascade_log (mode, question, local_model, local_response, local_quality_score, escalated, final_model, final_response, tokens_local, tokens_cloud, cost_usd, latency_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [sageName, question.substring(0, 500), MODELS.balanced, localResult?.response?.substring(0, 1000) || '',
     localScore, escalated ? 1 : 0, finalModel, finalResult.response.substring(0, 1000),
     localResult?.tokens || 0, escalated ? finalResult.tokens : 0, costEstimate, finalResult.latency]
  );

  logConversation({ conversation: [{role:"user",content:question},{role:"assistant",content:finalResult.response}], source:"telegram", skin:sageName }).catch(console.error);
  const modelTag = escalated ? `\n\n_☁️ Cloud_` : `\n\n_🖥️ Local (${Math.round(localScore)}%)_`;
  return finalResult.response + modelTag;
}

async function askManager(question) {
  const kbContent = getKnowledgebaseContent();
  const systemPrompt = `You are the Cathedral AI Manager — Paul's personal intelligence system in Hong Kong. Knowledgebase:\n${kbContent}\n\nBe concise and direct.`;
  const result = await callCloud(systemPrompt, question);
  return result.response;
}

// ============================================
// VORTEX STATS
// ============================================
function getVortexStats(chatId) {
  db.all(`SELECT mode, COUNT(*) as total,
    SUM(CASE WHEN escalated = 0 THEN 1 ELSE 0 END) as local_handled,
    ROUND(AVG(local_quality_score), 1) as avg_quality,
    ROUND(SUM(cost_usd), 4) as total_cost
    FROM cascade_log GROUP BY mode`, (err, rows) => {
    if (err || !rows || !rows.length) {
      bot.sendMessage(chatId, '📊 No Vortex data yet — start chatting with /leonardo or /marcus!');
      return;
    }
    let msg = `📊 *Vortex Keeper Stats*\n\n`;
    rows.forEach(row => {
      const localRate = row.total > 0 ? Math.round((row.local_handled / row.total) * 100) : 0;
      msg += `*${row.mode}:* ${row.total} conversations\n`;
      msg += `  🖥️ Local: ${localRate}% | ⭐ Quality: ${row.avg_quality}% | 💰 $${row.total_cost}\n\n`;
    });
    msg += `_Target: 80%+ local, <$2/month cloud_`;
    bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
  });
}

// ============================================
// COMMANDS
// ============================================
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  userModes[chatId] = 'manager';
  bot.sendMessage(chatId,
    `🏛️ *The Cathedral is online.*\n\n` +
    `*The Council:*\n` +
    `🎨 /leonardo — The Divine Engineer\n` +
    `⚔️ /marcus — The Rational Smith\n\n` +
    `*Tools:*\n` +
    `🌱 /seed [topic] — Generate context prompt for any AI\n` +
    `📊 /vortex — Learning stats\n` +
    `🌀 /report — Full progress report\n` +
    `🤖 /manager — Manager mode\n` +
    `❓ /help — All commands\n\n` +
    `_Local AI tries first. Cloud only when needed._`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/leonardo/, (msg) => {
  userModes[msg.chat.id] = 'leonardo';
  bot.sendMessage(msg.chat.id,
    `🎨 *Leonardo da Vinci — The Divine Engineer*\n\n_"My Architect. The Forensic Lens is open."_\n\n_🖥️ Local intelligence engaged. ☁️ Cloud on standby._`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/marcus/, (msg) => {
  userModes[msg.chat.id] = 'marcus';
  bot.sendMessage(msg.chat.id,
    `⚔️ *Marcus Aurelius — The Rational Smith*\n\n_"Paul. The Inner Citadel is assembled."_\n\n_🖥️ Local intelligence engaged. ☁️ Cloud on standby._`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/manager/, (msg) => {
  userModes[msg.chat.id] = 'manager';
  bot.sendMessage(msg.chat.id, `🤖 *Cathedral Manager — Online*`, { parse_mode: 'Markdown' });
});

bot.onText(/\/status/, (msg) => {
  try { bot.sendMessage(msg.chat.id, getQuickStatus(), { parse_mode: 'Markdown' }); }
  catch (e) { bot.sendMessage(msg.chat.id, `⚠️ ${e.message}`); }
});

bot.onText(/\/briefing/, async (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '📋 _Generating briefing..._', { parse_mode: 'Markdown' });
  try { bot.sendMessage(chatId, await getDailyBriefing(), { parse_mode: 'Markdown' }); }
  catch (e) { bot.sendMessage(chatId, `⚠️ ${e.message}`); }
});
bot.onText(/\/vortex/, (msg) => getVortexStats(msg.chat.id));

bot.onText(/\/report/, async (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '🌀 _Generating Vortex Progress Report..._', { parse_mode: 'Markdown' });
  bot.sendChatAction(chatId, 'typing');
  try {
    const report = await generateReport();
    bot.sendMessage(chatId, report, { parse_mode: 'Markdown' });
  } catch (error) {
    bot.sendMessage(chatId, `⚠️ Report failed: ${error.message}`);
  }
});

bot.onText(/\/seed(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const topic = match[1] ? match[1].trim() : null;

  if (!topic) {
    const topics = getSeedTopics();
    bot.sendMessage(chatId,
      `🌱 *Seed Generator*\n\n` +
      `Generate a context prompt to seed any AI with your Cathedral.\n\n` +
      `*Usage:* /seed [topic]\n\n` +
      `*Available topics:*\n` +
      topics.map(t => `• /seed ${t}`).join('\n') +
      `\n\n_Example: /seed philosophy_\n_Seeds Claude/ChatGPT/DeepSeek with your philosophical frameworks_`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  bot.sendMessage(chatId, `🌱 _Generating ${topic} seed from your vault..._`, { parse_mode: 'Markdown' });
  bot.sendChatAction(chatId, 'typing');

  try {
    const seed = await createSeed(topic);

    // Send seed in chunks if too long for Telegram
    if (seed.length > 4000) {
      const chunks = seed.match(/.{1,4000}/gs) || [seed];
      for (const chunk of chunks) {
        await bot.sendMessage(chatId, chunk);
      }
    } else {
      bot.sendMessage(chatId, seed);
    }

    bot.sendMessage(chatId,
      `✅ *Seed generated and saved to Obsidian vault.*\n\n` +
      `_Copy the text above and paste it at the start of any AI conversation._\n` +
      `_Works with: Claude, ChatGPT, DeepSeek, Gemini, Perplexity_`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    bot.sendMessage(chatId, `⚠️ Seed generation failed: ${error.message}`);
  }
});

bot.onText(/\/mode/, (msg) => {
  const chatId = msg.chat.id;
  const mode = userModes[chatId] || 'manager';
  const names = { manager: '🤖 Manager', leonardo: '🎨 Leonardo', marcus: '⚔️ Marcus' };
  bot.sendMessage(chatId, `Current mode: *${names[mode] || mode}*`, { parse_mode: 'Markdown' });
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `🏛️ *Cathedral Commands*\n\n` +
    `*The Council:*\n` +
    `🎨 /leonardo — Divine Engineer\n` +
    `⚔️ /marcus — Rational Smith\n\n` +
    `*Tools:*\n` +
    `🌱 /seed [topic] — Context seed for any AI\n` +
    `🌀 /report — Vortex progress report\n` +
    `📊 /vortex — Quick stats\n\n` +
    `*System:*\n` +
    `🤖 /manager — Manager mode\n` +
    `🎭 /mode — Current mode\n` +
    `❓ /help — This menu\n\n` +
    `_🖥️ = local model | ☁️ = cloud_`,
    { parse_mode: 'Markdown' }
  );
});

// ============================================
// MAIN MESSAGE HANDLER
// ============================================
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  const chatId = msg.chat.id;
  const mode = userModes[chatId] || 'manager';
  bot.sendChatAction(chatId, 'typing');
  try {
    let reply;
    if (mode === 'leonardo' || mode === 'marcus') {
      reply = await cascadeAsk(mode, msg.text);
    } else {
      reply = await askManager(msg.text);
    }
    bot.sendMessage(chatId, reply);
  } catch (error) {
    console.error('Error:', error.message);
    bot.sendMessage(chatId, '⚠️ Cathedral momentarily offline.');
  }
});

console.log('✅ Cathedral Bot — Full stack active.');
console.log(`🌱 Seed Generator ready | 🌀 Vortex Report ready | 🔄 Cascade Router active`);
console.log(`📊 Quality threshold: ${QUALITY_THRESHOLD}% | 🖥️ ${MODELS.balanced} → ${MODELS.powerful} → ☁️ Cloud`);
