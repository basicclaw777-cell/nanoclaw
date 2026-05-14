#!/usr/bin/env node
/**
 * run-monthly-seo.js — PM2 cron: 1st of month
 * Runs SEO audit, notifies Paul.
 */

import { runAudit, formatSEOTelegram } from './seo-checklist.js';

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
  console.log('[growth-seo] Running monthly SEO audit...');
  const audit = runAudit();
  console.log(`[growth-seo] Audit: ${audit.pagesWithMeta}/${audit.totalPages} pages with meta`);

  const text = `🔍 *Monthly SEO Audit*\n\n` + formatSEOTelegram();
  await sendTelegram(text);
  console.log('[growth-seo] Done.');
}

main().catch(err => { console.error('[growth-seo] Fatal:', err); process.exit(1); });
