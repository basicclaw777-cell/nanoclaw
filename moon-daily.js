// moon-daily.js — Daily moon phase to Telegram
// PM2 cron: runs once daily at 06:45 HKT (22:45 UTC previous day)

import dotenv from 'dotenv';
dotenv.config();
import TelegramBot from 'node-telegram-bot-api';
import { formatMoonReport } from './moon-phase.js';

const token = process.env.TELEGRAM_TOKEN;
const chatId = process.env.PAUL_CHAT_ID;

if (!token || !chatId) {
  console.error('Missing TELEGRAM_TOKEN or PAUL_CHAT_ID');
  process.exit(1);
}

const bot = new TelegramBot(token);

async function send() {
  const report = formatMoonReport();
  await bot.sendMessage(chatId, report);
  console.log(`[moon-daily] Sent moon phase to ${chatId}`);
  process.exit(0);
}

send().catch(err => {
  console.error('[moon-daily] Failed:', err.message);
  process.exit(1);
});
