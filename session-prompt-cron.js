// ~/nanoclaw/session-prompt-cron.js
// PM2 cron — sends session prompts to Paul on Telegram
// Schedule: daily at 20:00 HKT (after most sessions end)
//
// Reads session-clients.json, checks today's day name,
// sends inline keyboard for each matching client.

import dotenv from 'dotenv';
dotenv.config();
import TelegramBot from 'node-telegram-bot-api';
import { runDailyPrompts } from './session-tracker.js';

const token = process.env.TELEGRAM_TOKEN;
const chatId = parseInt(process.env.PAUL_CHAT_ID);

if (!token || !chatId) {
  console.error('[session-cron] Missing TELEGRAM_TOKEN or PAUL_CHAT_ID');
  process.exit(1);
}

const bot = new TelegramBot(token);

async function main() {
  try {
    const count = await runDailyPrompts(bot, chatId);
    if (count > 0) {
      console.log(`[session-cron] Sent ${count} session prompt(s)`);
    } else {
      console.log('[session-cron] No sessions scheduled today');
    }
  } catch (e) {
    console.error('[session-cron] Error:', e.message);
  }
  process.exit(0);
}

main();
