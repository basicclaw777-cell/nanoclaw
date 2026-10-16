#!/usr/bin/env node
/**
 * run-lapsed-campaign.js — PM2 cron entry point
 * Runs daily from June 8: queues next batch of 20 lapsed members.
 * Does NOT send anything. Paul reviews via /comms queue.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchBatch, getCampaignStatus } from './lapsed-campaign.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8');
const BOT_TOKEN = envFile.match(/TELEGRAM_TOKEN=(.+)/)?.[1]?.trim();
const CHAT_ID = envFile.match(/PAUL_CHAT_ID=(.+)/)?.[1]?.trim();

async function sendTelegram(text) {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log('[lapsed-campaign] No Telegram config, printing:');
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
    console.error(`[lapsed-campaign] Telegram error: ${res.status} ${body.slice(0, 200)}`);
  }
}

const status = getCampaignStatus();

// Only run after launch date
if (!status.active) {
  console.log(`[lapsed-campaign] Not yet active. ${status.daysUntilLaunch} days until launch.`);
  process.exit(0);
}

// Check if campaign is complete
if (status.remaining <= 0) {
  console.log('[lapsed-campaign] Campaign complete. All members processed.');
  process.exit(0);
}

const result = launchBatch(true);

if (result.queued > 0) {
  let text = `📢 *Lapsed Campaign Batch #${status.batchCount + 1}*\n`;
  text += `Queued: ${result.queued} messages\n`;
  text += `Remaining: ${result.remaining}\n`;
  text += `Total sent: ${result.totalSent}\n`;
  if (result.complete) text += `\n✅ Campaign complete!`;
  text += `\nReview: /comms queue`;
  await sendTelegram(text);
}

console.log(`[lapsed-campaign] Batch done. Queued: ${result.queued}, Remaining: ${result.remaining}`);
