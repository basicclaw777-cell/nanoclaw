// br-revenue-digest-cron.js — PM2 cron runner for weekly revenue digest
// Sends digest to Telegram every Sunday 19:00 HKT

import { generateRevenueDigest } from './br-revenue-digest.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf-8');
const BOT_TOKEN = envFile.match(/TELEGRAM_TOKEN=(.+)/)?.[1]?.trim();
const CHAT_ID = envFile.match(/PAUL_CHAT_ID=(.+)/)?.[1]?.trim();

async function sendTelegram(text) {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log('[revenue-digest] No Telegram config, printing to stdout:');
    console.log(text);
    return;
  }

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'Markdown' }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[revenue-digest] Telegram error: ${res.status} ${body.slice(0, 200)}`);
  } else {
    console.log('[revenue-digest] Digest sent to Telegram.');
  }
}

const digest = generateRevenueDigest();
await sendTelegram(digest);
