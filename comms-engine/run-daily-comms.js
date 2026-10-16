#!/usr/bin/env node
/**
 * run-daily-comms.js — PM2 cron entry point
 * Runs daily: scans pass expiry + birthdays, queues messages.
 * Does NOT send anything. Paul reviews via /comms queue.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scanPassExpiry } from './pass-expiry-trigger.js';
import { scanBirthdays } from './birthday-tracker.js';
import { scanAbsences } from './absence-scanner.js';
import { scanMilestones } from './milestone-scanner.js';
import { getQueueSummary } from './comms-queue.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8');
const TELEGRAM_TOKEN = envFile.match(/TELEGRAM_TOKEN=(.+)/)?.[1]?.trim();
const PAUL_CHAT_ID = envFile.match(/PAUL_CHAT_ID=(.+)/)?.[1]?.trim();

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

  const absences = scanAbsences();
  console.log(`[comms-daily] Absences: ${absences.generated} nudges, ${absences.skippedDuplicate} skipped`);

  const milestones = scanMilestones();
  console.log(`[comms-daily] Milestones: ${milestones.generated} celebrations`);

  const summary = getQueueSummary();
  const total = expiry.generated + birthdays.generated + absences.generated + milestones.generated;

  if (total > 0) {
    let text = `📬 *Daily Comms Scan*\n`;
    text += `Pass expiry: ${expiry.generated} new messages\n`;
    text += `Birthdays: ${birthdays.generated} new messages\n`;
    text += `No-show nudges: ${absences.generated} new messages\n`;
    text += `Milestones: ${milestones.generated} celebrations\n`;
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
