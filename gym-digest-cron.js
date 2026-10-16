// gym-digest-cron.js — PM2 cron runner for weekly gym digest
// Sends digest to Telegram every Sunday 20:00 HKT

import { generateDigest } from './gym-digest.js';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.PAUL_CHAT_ID;

async function sendTelegram(text) {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log('[gym-digest] No Telegram config, printing to stdout:');
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
    console.error(`[gym-digest] Telegram error: ${res.status} ${body.slice(0, 200)}`);
  } else {
    console.log('[gym-digest] Digest sent to Telegram.');
  }
}

const digest = generateDigest();
await sendTelegram(digest);
