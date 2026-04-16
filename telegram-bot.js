import dotenv from "dotenv";
dotenv.config();
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import lancedb from '@lancedb/lancedb';
import { semanticSearch, startFileWatcher } from './vault-embedder.js';
import { triageClaim, formatTriageResult } from './epistemic-triage.js';
import { runCouncil, formatCouncilResult } from './council-engine.js';
import { runObliteratus, formatObliteratusHeader } from './obliteratus-engine.js';
import { getOrRunGold, runGoldExtraction, startGoldCron } from './gold-extractor.js';
import { runMetabolism, getMetabolismSummary, startMetabolismCron } from './vault-metabolism.js';
import { recordStatement, getTrajectory, getDriftAlerts, runBeliefScan, formatTrajectory, formatDriftAlerts } from './belief-tracker.js';
import { runNegativeSpaceScan } from './negative-space.js';
import { buildAtlas, getOrBuildAtlas } from './convergence-atlas.js';
import { runOracle, getOracleOutputs, formatOracleResult } from './oracle.js';
import { addToConversation, getConversationHistory, updateMemoryAfterConversation } from './memory-system.js';

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

const SOCIAL_CONTENT_PATH = path.join(process.env.HOME, 'cathedral-vault', '07_Social_Content');

// Ensure the directory exists
if (!fs.existsSync(SOCIAL_CONTENT_PATH)) {
  fs.mkdirSync(SOCIAL_CONTENT_PATH, { recursive: true });
}

const bot = new TelegramBot(token, { polling: false });

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

bot.on('polling_error', (err) => {
  console.error('Polling error:', err.code, err.message);
});

async function startBot(retries = 5) {
  try {
    await bot.deleteWebHook({ drop_pending_updates: true });
    await bot.startPolling({ restart: true });
    console.log('🤖 Bot polling started.');
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

// /council [claim] — all four interlocutors assess the same claim
bot.onText(/\/council (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const topic  = match[1].trim();

  try {
    await safeSend(chatId, `🏛️ Convening Council on:\n\n_"${topic.slice(0, 100)}${topic.length > 100 ? '...' : ''}"_\n\nQuerying 4 interlocutors — this takes ~2 minutes...`, { parse_mode: 'Markdown' });

    const result = await runCouncil(topic);
    const formatted = formatCouncilResult(result);

    // Telegram has a 4096 char limit — split if needed
    if (formatted.length <= 4000) {
      await safeSend(chatId, formatted, { parse_mode: 'Markdown' });
    } else {
      // Send each section separately
      const sections = formatted.split('\n\n─────────────────────\n\n');
      for (const section of sections) {
        if (section.trim()) {
          await safeSend(chatId, section, { parse_mode: 'Markdown' });
        }
      }
    }
  } catch (err) {
    console.error('Council error:', err);
    await safeSend(chatId, `⚠️ Council failed: ${err.message}`);
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
    const { getRhythmReport } = await import(path.join(process.env.HOME, 'Cathedral', 'the-timekeeper.js'));
    const report = getRhythmReport();
    await safeSend(chatId, `\`\`\`\n${report.text}\n\`\`\``, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Rhythm report error:', err);
    await safeSend(chatId, `⚠️ Rhythm report failed: ${err.message}`);
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

// ── Cath API bridge ───────────────────────────────────────────────────────────

function callCath(query, history = []) {
  const pyArgs = [path.join(process.env.HOME, 'nanoclaw', 'cath_api.py'), '--query', query];
  if (history.length > 0) {
    pyArgs.push('--history', JSON.stringify(history));
  }
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', pyArgs, { env: process.env });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data; });
    proc.stderr.on('data', (data) => { stderr += data; });

    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error('Cath timed out after 90s'));
    }, 90000);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(stderr.trim() || `Exited with code ${code}`));
      } else {
        resolve(stdout.trim());
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

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

    safeSend(chatId, 'Usage: /vault search|read|list [arg]');
    return;
  }

  // ── /test command — evaluate technology fit + trigger Code execution ────────
  if (msg.text.match(/^\/test\s+(.+)/)) {
    const idea = msg.text.replace(/^\/test\s+/, '').trim();
    const chatId = msg.chat.id;
    await safeSend(chatId, `🔬 Evaluating: "${idea}"...`);

    try {
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
