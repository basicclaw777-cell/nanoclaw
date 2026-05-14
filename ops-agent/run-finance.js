#!/usr/bin/env node
/**
 * run-finance.js — Monthly finance cron entry point
 * Generates P&L + commission, sends to Telegram.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { formatPnLTelegram } from './monthly-pnl.js';
import { formatCommissionTelegram } from './commission-calc.js';

const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.PAUL_CHAT_ID;

async function send(text) {
  if (!TOKEN || !CHAT_ID) { console.log(text); return; }
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'Markdown' }),
  });
}

const pnl = formatPnLTelegram();
const commission = formatCommissionTelegram();
await send(pnl);
await send(commission);
console.log('Finance report sent.');
