#!/usr/bin/env node
/**
 * cathedral-manifest-watcher.js — Auto-reconcile on boot + periodic audit.
 *
 * Runs reconcile immediately (catches post-crash drift), then audits every 2h.
 * Sends Telegram alert on drift detection.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const MANIFEST_SCRIPT = path.join(__dirname, 'cathedral-manifest.js');
const AUDIT_INTERVAL = 2 * 60 * 60 * 1000; // 2 hours
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegram(text) {
  if (!BOT_TOKEN || !CHAT_ID) return;
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' }),
    });
    if (!res.ok) console.error('[manifest-watcher] Telegram send failed:', res.status);
  } catch (e) {
    console.error('[manifest-watcher] Telegram error:', e.message);
  }
}

function runReconcile() {
  try {
    const output = execSync(`node "${MANIFEST_SCRIPT}" --reconcile`, { encoding: 'utf8', timeout: 30000 });
    console.log(`[manifest-watcher] Reconcile:\n${output}`);
    return output;
  } catch (e) {
    console.error('[manifest-watcher] Reconcile failed:', e.message);
    return null;
  }
}

function runAudit() {
  try {
    const output = execSync(`node "${MANIFEST_SCRIPT}"`, { encoding: 'utf8', timeout: 30000 });
    return output;
  } catch (e) {
    console.error('[manifest-watcher] Audit failed:', e.message);
    return null;
  }
}

// ── Boot: reconcile immediately ──
console.log('[manifest-watcher] Boot reconcile...');
const bootResult = runReconcile();
if (bootResult && bootResult.includes('FIX') || bootResult && bootResult.includes('DELETE') || bootResult && bootResult.includes('START')) {
  sendTelegram(`<b>Cathedral Manifest — Boot Reconcile</b>\n\n<pre>${bootResult.slice(0, 3000)}</pre>`);
} else {
  console.log('[manifest-watcher] No drift on boot.');
}

// ── Periodic audit every 2h ──
setInterval(() => {
  console.log(`[manifest-watcher] Periodic audit at ${new Date().toISOString()}`);
  const audit = runAudit();
  if (!audit) return;

  if (audit.includes('DRIFT')) {
    console.log('[manifest-watcher] Drift detected — reconciling...');
    const fix = runReconcile();
    sendTelegram(`<b>Cathedral Manifest — Drift Detected + Fixed</b>\n\n<pre>${fix ? fix.slice(0, 3000) : 'reconcile failed'}</pre>`);
  } else {
    console.log('[manifest-watcher] All healthy.');
  }
}, AUDIT_INTERVAL);

console.log(`[manifest-watcher] Running. Audit every ${AUDIT_INTERVAL / 3600000}h.`);
