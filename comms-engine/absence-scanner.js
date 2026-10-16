/**
 * absence-scanner.js — Detects no-show members and queues nudge messages
 *
 * Reads member-data.json for attendance patterns.
 * Members with active pass but no visit in 14+ days get absence_check queued.
 * Dedup: won't queue if member already has pending message.
 */

import fs from 'fs';
import path from 'path';
import { generateMessage } from './whatsapp-templates.js';
import { enqueue, getPending } from './comms-queue.js';

const HOME = process.env.HOME || '/Users/basicclaw777';
const MEMBER_DATA_PATH = path.join(HOME, 'br-gm-agent', 'reports', 'member-data.json');

const ABSENCE_THRESHOLD_DAYS = 14;

export function scanAbsences() {
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
  const now = new Date();

  for (const member of members) {
    try {
      const name = member.name || member.first_name || 'Unknown';

      // Skip if already has pending message
      if (pendingNames.has(name)) {
        result.skippedDuplicate++;
        continue;
      }

      // Need active pass
      const pass = member.passes?.[0];
      if (!pass) continue;

      // Skip expired passes (pass-expiry-trigger handles those)
      if (pass.expires_on && new Date(pass.expires_on) < now) continue;

      // Check last visit date
      const lastVisit = member.last_visit || member.lastVisit || member.last_attendance;
      if (!lastVisit) continue;

      const daysSinceVisit = Math.floor((now - new Date(lastVisit)) / 86400000);

      if (daysSinceVisit >= ABSENCE_THRESHOLD_DAYS) {
        const message = generateMessage('absence_check', member);
        if (message) {
          enqueue('absence_check', member, message);
          result.generated++;
          pendingNames.add(name);
        }
      }
    } catch (err) {
      result.errors.push(`${member.name}: ${err.message}`);
    }
  }

  return result;
}

export function formatAbsenceTelegram() {
  const result = scanAbsences();
  let text = `👀 *Absence Scan*\n`;
  text += `No-show (${ABSENCE_THRESHOLD_DAYS}+ days): ${result.generated} nudges queued\n`;
  text += `Already queued: ${result.skippedDuplicate}\n`;
  if (result.errors.length > 0) {
    text += `\nErrors:\n`;
    for (const err of result.errors.slice(0, 5)) {
      text += `  • ${err}\n`;
    }
  }
  return text;
}
