#!/usr/bin/env node
/**
 * run-monthly-newsletter.js — PM2 cron: 1st of month
 * Generates newsletter draft, notifies Paul.
 */

import { generateNewsletter, formatNewsletterTelegram } from './newsletter-engine.js';

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
  console.log('[growth-newsletter] Generating monthly newsletter...');
  const nl = await generateNewsletter();
  console.log(`[growth-newsletter] Generated: ${nl.monthName}`);

  const text = `📰 *Newsletter Draft Ready*\n\n` + formatNewsletterTelegram(nl);
  await sendTelegram(text);
  console.log('[growth-newsletter] Done.');
}

main().catch(err => { console.error('[growth-newsletter] Fatal:', err); process.exit(1); });
