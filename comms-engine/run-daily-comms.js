#!/usr/bin/env node
/**
 * run-daily-comms.js — PM2 cron entry point
 * Runs daily: scans pass expiry + birthdays, queues messages.
 * Does NOT send anything. Paul reviews via /comms queue.
 */

import { scanPassExpiry } from './pass-expiry-trigger.js';
import { scanBirthdays } from './birthday-tracker.js';
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
  console.log('[comms-daily] Starting daily scan...');

  const expiry = scanPassExpiry();
  console.log(`[comms-daily] Expiry: ${expiry.generated} generated, ${expiry.skippedDuplicate} skipped`);

  const birthdays = scanBirthdays(7);
  console.log(`[comms-daily] Birthdays: ${birthdays.generated} generated`);

  const summary = getQueueSummary();
  const total = expiry.generated + birthdays.generated;

  if (total > 0) {
    let text = `📬 *Daily Comms Scan*\n`;
    text += `Pass expiry: ${expiry.generated} new messages\n`;
    text += `Birthdays: ${birthdays.generated} new messages\n`;
    text += `\nOutbox total: ${summary.pending} pending\n`;
    text += `Review: /comms queue`;
    await sendTelegram(text);
  }

  console.log(`[comms-daily] Done. Outbox: ${summary.pending} pending.`);
}

main().catch(err => {
  console.error('[comms-daily] Fatal:', err);
  process.exit(1);
});
