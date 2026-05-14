/**
 * pass-expiry-trigger.js — Scans member-data.json for expiring/low-punch passes,
 * generates WhatsApp messages, queues them in outbox.
 *
 * Reads: ~/br-gm-agent/reports/member-data.json
 * Writes: comms-engine/outbox/queue.json (via comms-queue.js)
 */

import fs from 'fs';
import path from 'path';
import { generateMessage } from './whatsapp-templates.js';
import { enqueue, getPending } from './comms-queue.js';

const HOME = process.env.HOME || '/Users/basicclaw777';
const MEMBER_DATA_PATH = path.join(HOME, 'br-gm-agent', 'reports', 'member-data.json');

/**
 * Scan for expiring passes and generate outbox messages.
 * Returns { generated, skippedDuplicate, errors }
 */
export function scanPassExpiry() {
  const result = { generated: 0, skippedDuplicate: 0, errors: [] };

  let memberData;
  try {
    memberData = JSON.parse(fs.readFileSync(MEMBER_DATA_PATH, 'utf-8'));
  } catch (err) {
    result.errors.push(`Cannot read member-data.json: ${err.message}`);
    return result;
  }

  const members = memberData.members || [];
  const pendingNames = new Set(getPending().map(m => m.memberName));

  for (const member of members) {
    try {
      // Skip if already has pending message
      const name = member.name || member.first_name || 'Unknown';
      if (pendingNames.has(name)) {
        result.skippedDuplicate++;
        continue;
      }

      // Check pass status
      const pass = member.passes?.[0];
      if (!pass) continue;

      let templateName = null;

      // Last punch remaining
      if (pass.punches_left !== null && pass.punches_left <= 1 && pass.punches_left > 0) {
        templateName = 'last_punch_remaining';
      }

      // Expiring soon (flagged by Kit's pipeline)
      if (member.is_expiring && member.expiry_info) {
        templateName = 'pass_expiring_soon';
      }

      // Expired (pass has expired date in the past)
      if (pass.expires_on) {
        const expiryDate = new Date(pass.expires_on);
        if (expiryDate < new Date()) {
          templateName = 'pass_expired';
        }
      }

      // Trial members get follow-up instead
      if (member.pass_type === 'trial' && member.visit_count_in_export <= 1) {
        templateName = 'trial_followup';
      }

      if (!templateName) continue;

      const message = generateMessage(templateName, member);
      if (message) {
        enqueue(templateName, member, message);
        result.generated++;
        pendingNames.add(name);
      }
    } catch (err) {
      result.errors.push(`${member.name}: ${err.message}`);
    }
  }

  return result;
}

/**
 * Format scan results for Telegram
 */
export function formatExpiryTelegram() {
  const result = scanPassExpiry();
  let text = `📋 *Pass Expiry Scan*\n`;
  text += `Generated: ${result.generated} messages\n`;
  text += `Skipped (already queued): ${result.skippedDuplicate}\n`;
  if (result.errors.length > 0) {
    text += `\nErrors:\n`;
    for (const err of result.errors.slice(0, 5)) {
      text += `  • ${err}\n`;
    }
  }
  return text;
}
