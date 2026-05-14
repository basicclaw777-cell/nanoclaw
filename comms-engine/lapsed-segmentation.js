/**
 * lapsed-segmentation.js — Reads reactivation-tracker.json,
 * generates segment-appropriate WhatsApp messages, queues them.
 *
 * Reads: ~/br-gm-agent/reports/reactivation-tracker.json
 * Writes: comms-engine/outbox/queue.json (via comms-queue.js)
 */

import fs from 'fs';
import path from 'path';
import { generateMessage } from './whatsapp-templates.js';
import { enqueue, getPending } from './comms-queue.js';

const HOME = process.env.HOME || '/Users/basicclaw777';
const TRACKER_PATH = path.join(HOME, 'br-gm-agent', 'reports', 'reactivation-tracker.json');

const SEGMENT_TEMPLATE_MAP = {
  warm: 'lapsed_warm',
  cool: 'lapsed_cool',
  cold: 'lapsed_cold',
};

/**
 * Scan lapsed members and generate outbox messages.
 * @param {object} [opts] - { segments: ['warm','cool','cold'], limit: 20 }
 */
export function scanLapsed(opts = {}) {
  const segments = opts.segments || ['warm', 'cool', 'cold'];
  const limit = opts.limit || 20; // don't flood outbox
  const result = { generated: 0, skippedDuplicate: 0, skippedContacted: 0, bySegment: {} };

  let tracker;
  try {
    tracker = JSON.parse(fs.readFileSync(TRACKER_PATH, 'utf-8'));
  } catch (err) {
    return { ...result, errors: [`Cannot read reactivation-tracker.json: ${err.message}`] };
  }

  const members = tracker.members || [];
  const pendingNames = new Set(getPending().map(m => m.memberName));
  let count = 0;

  for (const member of members) {
    if (count >= limit) break;

    const segment = member.segment;
    if (!segments.includes(segment)) continue;

    // Skip already contacted
    if (member.contacted) {
      result.skippedContacted++;
      continue;
    }

    // Skip if already in outbox
    if (pendingNames.has(member.name)) {
      result.skippedDuplicate++;
      continue;
    }

    const templateName = SEGMENT_TEMPLATE_MAP[segment];
    if (!templateName) continue;

    const message = generateMessage(templateName, member);
    if (message) {
      enqueue(templateName, member, message);
      result.generated++;
      count++;
      pendingNames.add(member.name);

      if (!result.bySegment[segment]) result.bySegment[segment] = 0;
      result.bySegment[segment]++;
    }
  }

  return result;
}

/**
 * Format scan results for Telegram
 */
export function formatLapsedTelegram(opts = {}) {
  const result = scanLapsed(opts);
  let text = `🔄 *Lapsed Member Scan*\n`;
  text += `Generated: ${result.generated} messages\n`;
  if (Object.keys(result.bySegment).length > 0) {
    for (const [seg, count] of Object.entries(result.bySegment)) {
      text += `  • ${seg}: ${count}\n`;
    }
  }
  text += `Skipped (already queued): ${result.skippedDuplicate}\n`;
  text += `Skipped (already contacted): ${result.skippedContacted}\n`;
  if (result.errors?.length > 0) {
    text += `\nErrors: ${result.errors[0]}\n`;
  }
  return text;
}
