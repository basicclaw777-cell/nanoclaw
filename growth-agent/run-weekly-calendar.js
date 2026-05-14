#!/usr/bin/env node
/**
 * run-weekly-calendar.js — PM2 cron: Sunday 8pm HKT
 * Generates next week's content calendar, notifies Paul.
 */

import { generateWeeklyCalendar, formatCalendarTelegram } from './content-calendar.js';

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
  console.log('[growth-calendar] Generating weekly content calendar...');
  const cal = await generateWeeklyCalendar();
  console.log(`[growth-calendar] Generated: ${cal.posts?.length || 0} posts for ${cal.week}`);

  const text = `📅 *Weekly Content Plan Ready*\n\n` + formatCalendarTelegram(cal);
  await sendTelegram(text);
  console.log('[growth-calendar] Done.');
}

main().catch(err => { console.error('[growth-calendar] Fatal:', err); process.exit(1); });
