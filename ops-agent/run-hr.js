#!/usr/bin/env node
/**
 * run-hr.js — Weekly HR compliance cron entry point
 * Scans calendar + MPF, alerts via Telegram if anything due.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { scanHRCalendar } from './hr-calendar.js';
import { checkMPFCompliance } from './mpf-compliance.js';

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

const hr = scanHRCalendar();
const mpf = checkMPFCompliance();
const allAlerts = [...hr.alerts, ...mpf.alerts];

if (allAlerts.length > 0) {
  let msg = `*Ops Weekly — ${allAlerts.length} alert(s)*\n\n`;
  for (const a of allAlerts) {
    const icon = a.severity === 'critical' ? '🔴' : a.severity === 'warning' ? '🟡' : 'ℹ️';
    msg += `${icon} ${a.message}\n`;
    if (a.action) msg += `   → ${a.action}\n`;
  }
  msg += `\nMPF deadline: ${mpf.nextDeadline} (${mpf.daysUntilDeadline}d)`;
  await send(msg);
  console.log(`HR scan: ${allAlerts.length} alerts sent.`);
} else {
  console.log('HR scan: no alerts.');
}
