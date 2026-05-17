/**
 * Architect Pulse — Telegram command handlers
 *
 * /pulse <response>  — log movement in today's channel
 * /skip             — skip today's nudge (tracked)
 * /channels         — show current channel health scores
 * /streak           — show pulse response streak
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const PULSE_LOG = path.join(DATA_DIR, 'pulse-log.json');
const STATE_FILE = path.join(DATA_DIR, 'pulse-state.json');

const CHANNELS = [
  { id: 'money', name: 'Money / Trading', emoji: '💰' },
  { id: 'love', name: 'Love / Connection', emoji: '❤️' },
  { id: 'home', name: 'Home / Environment', emoji: '🏠' },
  { id: 'gym', name: 'Gym Revenue', emoji: '🥊' },
  { id: 'publishing', name: 'Publishing / Visibility', emoji: '📡' },
  { id: 'asking', name: 'Asking / Receiving', emoji: '🤝' },
  { id: 'finishing', name: 'Finishing / Shipping', emoji: '🚀' },
  { id: 'health', name: 'Health / Body', emoji: '💪' },
  { id: 'learning', name: 'Learning / Growth', emoji: '📚' },
  { id: 'rest', name: 'Rest / Recovery', emoji: '🌙' },
  { id: 'creativity', name: 'Creativity / Play', emoji: '🎨' }
];

function getState() {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  }
  return { channelScores: {}, stagnationDays: {}, totalPulses: 0 };
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function getLog() {
  if (fs.existsSync(PULSE_LOG)) {
    return JSON.parse(fs.readFileSync(PULSE_LOG, 'utf8'));
  }
  return [];
}

function saveLog(log) {
  fs.writeFileSync(PULSE_LOG, JSON.stringify(log, null, 2));
}

function getTodaysEntry() {
  const log = getLog();
  const today = new Date().toISOString().split('T')[0];
  // Find most recent entry for today
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].date.startsWith(today)) return { entry: log[i], index: i };
  }
  return null;
}

// ── Score Calculator ────────────────────────────────────────────────────────

function calculateChannelHealth(state) {
  const log = getLog();
  const now = Date.now();
  const weekAgo = now - (7 * 24 * 60 * 60 * 1000);

  const health = {};
  for (const ch of CHANNELS) {
    const channelEntries = log.filter(e =>
      e.channel === ch.id &&
      new Date(e.date).getTime() > weekAgo
    );
    const responded = channelEntries.filter(e => e.response && e.response !== 'SKIP');
    const skipped = channelEntries.filter(e => e.response === 'SKIP');
    const total = channelEntries.length;

    let score = 0;
    if (total > 0) {
      // Base: response rate
      score = Math.round((responded.length / total) * 100);
    }

    // Penalty for stagnation
    const stagnant = state.stagnationDays[ch.id] || 0;
    if (stagnant >= 14) score = Math.max(0, score - 30);
    else if (stagnant >= 7) score = Math.max(0, score - 15);

    health[ch.id] = {
      score,
      responded: responded.length,
      skipped: skipped.length,
      stagnantDays: stagnant,
      status: score >= 70 ? '🟢' : score >= 40 ? '🟡' : '🔴'
    };
  }
  return health;
}

// ── Command Registration ────────────────────────────────────────────────────

export function registerPulseCommands(bot) {

  // /pulse <response> — log today's movement
  bot.onText(/^\/pulse(?:@\w+)?\s+(.+)$/s, async (msg, match) => {
    const chatId = msg.chat.id;
    const response = match[1].trim();

    const todayData = getTodaysEntry();
    if (!todayData) {
      bot.sendMessage(chatId, "No pulse sent today yet. Wait for tomorrow's pulse or run manually.");
      return;
    }

    const { entry, index } = todayData;
    const log = getLog();
    log[index].response = response;
    log[index].respondedAt = new Date().toISOString();
    saveLog(log);

    // Reset stagnation for this channel
    const state = getState();
    state.stagnationDays[entry.channel] = 0;
    saveState(state);

    const channel = CHANNELS.find(c => c.id === entry.channel);
    bot.sendMessage(chatId,
      `${channel.emoji} Logged. Channel *${channel.name}* — stagnation reset.\n\n` +
      `_"${response}"_\n\n` +
      `The architect moved today.`,
      { parse_mode: 'Markdown' }
    );
  });

  // /skip — skip today
  bot.onText(/^\/skip(?:@\w+)?$/, async (msg) => {
    const chatId = msg.chat.id;

    const todayData = getTodaysEntry();
    if (!todayData) {
      bot.sendMessage(chatId, "Nothing to skip — no pulse today.");
      return;
    }

    const { entry, index } = todayData;
    const log = getLog();
    log[index].response = 'SKIP';
    log[index].respondedAt = new Date().toISOString();
    saveLog(log);

    // Track consecutive skips
    const state = getState();
    const recentSkips = log.slice(-3).filter(e => e.response === 'SKIP').length;
    saveState(state);

    let msg_text = `Skipped. No judgment.\n`;
    if (recentSkips >= 3) {
      msg_text += `\n⚠️ 3 consecutive skips. The actions might be too big. Tomorrow's nudge will be smaller.`;
    }

    bot.sendMessage(chatId, msg_text);
  });

  // /channels — health overview
  bot.onText(/^\/channels(?:@\w+)?$/, async (msg) => {
    const chatId = msg.chat.id;
    const state = getState();
    const health = calculateChannelHealth(state);

    let text = `*Architect Channels — Health Report*\n\n`;
    for (const ch of CHANNELS) {
      const h = health[ch.id];
      const stag = h.stagnantDays > 0 ? ` (${h.stagnantDays}d stagnant)` : '';
      text += `${h.status} ${ch.emoji} *${ch.name}*: ${h.score}%${stag}\n`;
    }

    // Overall score
    const scores = Object.values(health).map(h => h.score);
    const overall = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    text += `\n*Architect Emergence Score: ${overall}/100*`;

    const totalPulses = state.totalPulses || 0;
    text += `\n\n_${totalPulses} pulses sent total._`;

    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  });

  // /streak — response streak
  bot.onText(/^\/streak(?:@\w+)?$/, async (msg) => {
    const chatId = msg.chat.id;
    const log = getLog();

    let streak = 0;
    for (let i = log.length - 1; i >= 0; i--) {
      if (log[i].response && log[i].response !== 'SKIP') {
        streak++;
      } else {
        break;
      }
    }

    const total = log.filter(e => e.response && e.response !== 'SKIP').length;
    const skips = log.filter(e => e.response === 'SKIP').length;

    let text = `*Pulse Streak: ${streak}*\n\n`;
    text += `Total responses: ${total}\n`;
    text += `Skips: ${skips}\n`;
    text += `Response rate: ${log.length > 0 ? Math.round((total / log.length) * 100) : 0}%`;

    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  });
}
