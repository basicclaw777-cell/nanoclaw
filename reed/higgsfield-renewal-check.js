#!/usr/bin/env node
'use strict';
/**
 * higgsfield-renewal-check.js — one-shot reminder (PM2 cron, fires 2026-06-13 09:00 HKT).
 *
 * Higgsfield Starter renews ~2026-06-12. Paul asked to check whether Higgsfield's
 * Kling 3.0 exposes a MOTION-CONTROL mode (reference-video -> static-image motion
 * transfer) once renewed — that decides whether to buy official Kling $6.99 / test
 * Luma free / buy nothing. Context lives in ~/nanoclaw/reed/tools.json research block.
 *
 * The actual probe is reasoning-heavy (interpret higgsfield CLI modes), so this just
 * NUDGES Paul to run a Reed/Forge session. Local — has the authed CLI + tools.json.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const HOME = process.env.HOME;
try { for (const l of fs.readFileSync(path.join(HOME, 'nanoclaw', '.env'), 'utf8').split('\n')) { const m = l.match(/^([^#=]+)=(.*)$/); if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, ''); } } catch {}

const TOKEN = process.env.TELEGRAM_TOKEN, CHAT = process.env.PAUL_CHAT_ID;
const msg = [
  '🔔 *Higgsfield renewal check* (Starter renewed ~yesterday)',
  '',
  'DECISION GATE for motion-control: does Higgsfield Kling 3.0 expose a *motion-control* mode (reference-video → static-image transfer)?',
  '',
  '→ Run a Reed/Forge session: probe the `higgsfield` CLI, then update `~/nanoclaw/reed/tools.json` research.motion_control + decide:',
  '• HAS it → buy nothing (Higgsfield covers it, ~533 clips/mo).',
  '• LACKS it → test Luma free tier, or official Kling $6.99 (only if Standard tier confirmed to include 3.0+motion-control).',
  '',
  '_Context: reed/tools.json research block. /reedmake is live for testing._',
].join('\n');

if (!TOKEN || !CHAT) { console.log('No Telegram creds — reminder:\n' + msg); process.exit(0); }
const body = JSON.stringify({ chat_id: CHAT, text: msg, parse_mode: 'Markdown' });
const req = https.request({ hostname: 'api.telegram.org', path: `/bot${TOKEN}/sendMessage`, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, r => { r.on('data', () => {}); r.on('end', () => process.exit(0)); });
req.on('error', e => { console.error(e.message); process.exit(0); });
req.write(body); req.end();
