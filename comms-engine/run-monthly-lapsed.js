#!/usr/bin/env node
/**
 * run-monthly-lapsed.js — PM2 cron entry point
 * Runs monthly: scans lapsed members, generates outbox messages.
 * Does NOT send anything. Paul reviews via /comms queue.
 */

import { scanLapsed } from './lapsed-segmentation.js';
import { getQueueSummary } from './comms-queue.js';

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const PAUL_CHAT_ID = process.env.PAUL_CHAT_ID;

async function sendTelegram(text) {
  if (!TELEGRAM_TOKEN || !PAUL_CHAT_ID) return;
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: PAUL_CHAT_ID, text, parse_mode: 'Markdown' }),
  });
}

async function main() {
  console.log('[comms-monthly] Starting lapsed member scan...');

  // Scan warm first (highest recovery chance), then cool
  const result = scanLapsed({ segments: ['warm', 'cool'], limit: 30 });
  console.log(`[comms-monthly] Generated: ${result.generated}, Contacted: ${result.skippedContacted}, Dupes: ${result.skippedDuplicate}`);

  const summary = getQueueSummary();

  if (result.generated > 0) {
    let text = `🔄 *Monthly Lapsed Scan*\n`;
    text += `Generated: ${result.generated} recovery messages\n`;
    for (const [seg, count] of Object.entries(result.bySegment || {})) {
      text += `  • ${seg}: ${count}\n`;
    }
    text += `\nOutbox total: ${summary.pending} pending\n`;
    text += `Review: /comms queue`;
    await sendTelegram(text);
  }

  console.log(`[comms-monthly] Done. Outbox: ${summary.pending} pending.`);
}

main().catch(err => {
  console.error('[comms-monthly] Fatal:', err);
  process.exit(1);
});
