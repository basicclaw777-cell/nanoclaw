/**
 * comms-queue.js — Outbox manager for Basic Reflex comms
 *
 * Nothing auto-sends. Everything goes to outbox. Paul reviews and sends personally.
 *
 * Outbox format: JSON array in comms-engine/outbox/queue.json
 * Each item: { id, created, templateName, member, message, status, sentAt, notes }
 * Statuses: pending | approved | sent | skipped
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUEUE_PATH = path.join(__dirname, 'outbox', 'queue.json');

function loadQueue() {
  try { return JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf-8')); }
  catch { return []; }
}

function saveQueue(queue) {
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2));
}

/**
 * Add a message to the outbox
 */
export function enqueue(templateName, member, message) {
  const queue = loadQueue();
  const item = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    created: new Date().toISOString(),
    templateName,
    memberName: member.name || member.first_name || 'Unknown',
    memberPhone: member.phone || null,
    memberEmail: member.email || null,
    message,
    status: 'pending',
    sentAt: null,
    notes: '',
  };
  queue.push(item);
  saveQueue(queue);
  return item;
}

/**
 * Get all pending messages
 */
export function getPending() {
  return loadQueue().filter(m => m.status === 'pending');
}

/**
 * Get queue summary by status
 */
export function getQueueSummary() {
  const queue = loadQueue();
  const summary = { pending: 0, approved: 0, sent: 0, skipped: 0, total: queue.length };
  for (const item of queue) {
    summary[item.status] = (summary[item.status] || 0) + 1;
  }
  return summary;
}

/**
 * Mark a message as approved
 */
export function approve(messageId) {
  const queue = loadQueue();
  const item = queue.find(m => m.id === messageId);
  if (!item) return null;
  item.status = 'approved';
  saveQueue(queue);
  return item;
}

/**
 * Mark a message as sent (Paul sent it manually)
 */
export function markSent(messageId) {
  const queue = loadQueue();
  const item = queue.find(m => m.id === messageId);
  if (!item) return null;
  item.status = 'sent';
  item.sentAt = new Date().toISOString();
  saveQueue(queue);
  return item;
}

/**
 * Skip a message (Paul decided not to send)
 */
export function skip(messageId) {
  const queue = loadQueue();
  const item = queue.find(m => m.id === messageId);
  if (!item) return null;
  item.status = 'skipped';
  saveQueue(queue);
  return item;
}

/**
 * Get queue grouped by type for Telegram display
 */
export function getQueueByType() {
  const pending = getPending();
  const grouped = {};
  for (const item of pending) {
    const type = item.message?.type || 'other';
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(item);
  }
  return grouped;
}

/**
 * Clear all sent/skipped messages older than days
 */
export function purgeOld(days = 30) {
  const queue = loadQueue();
  const cutoff = Date.now() - days * 86400000;
  const kept = queue.filter(m => {
    if (m.status === 'pending' || m.status === 'approved') return true;
    return new Date(m.created).getTime() > cutoff;
  });
  saveQueue(kept);
  return queue.length - kept.length;
}

/**
 * Format queue for Telegram
 */
export function formatQueueTelegram() {
  const summary = getQueueSummary();
  const pending = getPending();

  let text = `📬 *Comms Outbox*\n`;
  text += `Pending: ${summary.pending} | Sent: ${summary.sent} | Skipped: ${summary.skipped}\n\n`;

  if (pending.length === 0) {
    text += `_No messages waiting._`;
    return text;
  }

  // Group by type
  const grouped = getQueueByType();
  for (const [type, items] of Object.entries(grouped)) {
    text += `*${type.toUpperCase()}* (${items.length})\n`;
    for (const item of items.slice(0, 5)) {
      text += `  • ${item.memberName}: "${item.message?.body?.slice(0, 60)}..."\n`;
    }
    if (items.length > 5) text += `  ... +${items.length - 5} more\n`;
    text += '\n';
  }

  return text;
}
