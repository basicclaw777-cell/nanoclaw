/**
 * br-revenue-digest.js — Sunday Revenue Digest for Basic Reflex
 *
 * Pulls all numbers into one Telegram message:
 * - Member count + churn indicators
 * - Revenue streams status
 * - Comms queue status
 * - Content pipeline status
 * - Sprint progress
 *
 * Trigger: PM2 cron Sunday 19:00 HKT + /revenue Telegram command
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME || '/Users/basicclaw777';

function safeRead(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
  catch { return null; }
}

function countFiles(dir, ext = '.json') {
  try { return fs.readdirSync(dir).filter(f => f.endsWith(ext)).length; }
  catch { return 0; }
}

export function generateRevenueDigest() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });

  let msg = `💰 *BR Revenue Digest*\n_${dateStr}_\n\n`;

  // ── Members ────────────────────────────────────────────────────────────
  const memberData = safeRead(path.join(HOME, 'nanoclaw', 'command-centre', 'member-data.json'));
  if (memberData) {
    const active = memberData.total_active || memberData.activeMembers || '?';
    const expiring = memberData.expiring_soon || memberData.expiringSoon || 0;
    const highChurn = memberData.high_churn || memberData.highChurn || 0;
    msg += `*Members*\n`;
    msg += `  Active: ${active}\n`;
    if (expiring > 0) msg += `  Expiring soon: ${expiring}\n`;
    if (highChurn > 0) msg += `  High churn risk: ${highChurn}\n`;
    msg += '\n';
  } else {
    msg += `*Members:* Data stale — export fresh PunchPass CSV\n\n`;
  }

  // ── Lapsed ─────────────────────────────────────────────────────────────
  const crmData = safeRead(path.join(HOME, 'Cathedral', 'br-crm', 'data', 'members.json'));
  if (crmData) {
    const lapsed = Array.isArray(crmData) ? crmData.length : (crmData.members?.length || 0);
    msg += `*Lapsed Pool:* ${lapsed} members (campaign queued)\n\n`;
  }

  // ── Revenue Streams ────────────────────────────────────────────────────
  msg += `*Revenue Streams*\n`;

  // Kids class
  const kidsPackage = safeRead(path.join(HOME, 'basic-reflex', 'kids-class', 'package.json'));
  if (kidsPackage) {
    msg += `  Kids Class: $${kidsPackage.pricing?.dropIn}/class, $${kidsPackage.pricing?.block10}/10-block — LIVE\n`;
  }

  // Open gym
  const openGymPackage = safeRead(path.join(HOME, 'basic-reflex', 'open-gym', 'package.json'));
  if (openGymPackage) {
    msg += `  Open Gym: $${openGymPackage.pricing?.dropIn}/session — LIVE\n`;
  }

  // 10-block pathway
  const pathwayPackage = safeRead(path.join(HOME, 'basic-reflex', '10-block-pathway', 'package.json'));
  if (pathwayPackage) {
    msg += `  10-Block: $${pathwayPackage.pricing?.tenBlock}/block — LIVE\n`;
  }

  msg += `  ClassPass: PENDING (Paul setup)\n`;
  msg += `  Lapsed Campaign: QUEUED (fires post-departure)\n`;
  msg += '\n';

  // ── Comms Queue ────────────────────────────────────────────────────────
  const queuePath = path.join(HOME, 'nanoclaw', 'comms-engine', 'outbox', 'queue.json');
  const queue = safeRead(queuePath);
  if (queue && Array.isArray(queue)) {
    const pending = queue.filter(m => m.status === 'pending').length;
    const sent = queue.filter(m => m.status === 'sent').length;
    const skipped = queue.filter(m => m.status === 'skipped').length;
    msg += `*Comms Queue:* ${pending} pending, ${sent} sent, ${skipped} skipped\n\n`;
  }

  // ── Content Pipeline ───────────────────────────────────────────────────
  const contentQueue = safeRead(path.join(HOME, 'nanoclaw', 'content-studio', 'content-queue.json'));
  if (contentQueue && Array.isArray(contentQueue)) {
    const queued = contentQueue.filter(i => i.status === 'queued').length;
    const posted = contentQueue.filter(i => i.status === 'posted').length;
    msg += `*Content Pipeline:* ${queued} queued, ${posted} posted\n`;
  }

  // Ready-to-post count
  const readyDir = path.join(HOME, 'nanoclaw', 'content-autopilot', 'ready');
  try {
    const readyFiles = fs.readdirSync(readyDir).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
    if (readyFiles.length > 0) msg += `  Ready to post: ${readyFiles.length} images\n`;
  } catch {}
  msg += '\n';

  // ── Sprint Progress ────────────────────────────────────────────────────
  // Count done items from br-command.html
  const commandHtml = (() => {
    try { return fs.readFileSync(path.join(HOME, 'basic-reflex', 'br-command.html'), 'utf-8'); }
    catch { return ''; }
  })();
  const doneCount = (commandHtml.match(/status-done/g) || []).length;
  const totalItems = 12;
  const pct = Math.round((doneCount / totalItems) * 100);
  msg += `*Sprint:* ${doneCount}/${totalItems} (${pct}%)\n`;

  // Countdown
  const target = new Date('2026-06-08T00:00:00+08:00');
  const daysLeft = Math.ceil((target - now) / 86400000);
  if (daysLeft > 0) {
    msg += `*Solo in:* ${daysLeft} days\n`;
  } else {
    msg += `*Solo Mode:* ACTIVE\n`;
  }

  msg += '\n_Coach Paul · Basic Reflex Boxing_';
  return msg;
}

export default { generateRevenueDigest };
