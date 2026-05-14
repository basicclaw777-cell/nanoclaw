/**
 * birthday-tracker.js — Scans member data for upcoming birthdays,
 * generates birthday messages, queues them.
 *
 * PunchPass doesn't export birthdays natively. This reads from a
 * manually-maintained birthdays.json file.
 *
 * File: comms-engine/birthdays.json
 * Format: [{ "name": "...", "first_name": "...", "phone": "...", "birthday": "MM-DD" }, ...]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateMessage } from './whatsapp-templates.js';
import { enqueue, getPending } from './comms-queue.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIRTHDAYS_PATH = path.join(__dirname, 'birthdays.json');

/**
 * Scan for birthdays in the next N days
 * @param {number} [daysAhead=7] — how far ahead to look
 */
export function scanBirthdays(daysAhead = 7) {
  const result = { generated: 0, skippedDuplicate: 0, upcoming: [] };

  let birthdays;
  try {
    birthdays = JSON.parse(fs.readFileSync(BIRTHDAYS_PATH, 'utf-8'));
  } catch {
    return { ...result, note: 'No birthdays.json found. Create comms-engine/birthdays.json with member birthdays.' };
  }

  const pendingNames = new Set(getPending().filter(m => m.templateName === 'birthday').map(m => m.memberName));
  const now = new Date();

  for (const member of birthdays) {
    if (!member.birthday) continue;

    // Parse MM-DD
    const [mm, dd] = member.birthday.split('-').map(Number);
    if (!mm || !dd) continue;

    // Build this year's birthday date
    const bday = new Date(now.getFullYear(), mm - 1, dd);
    // If already passed this year, check next year
    if (bday < now) bday.setFullYear(bday.getFullYear() + 1);

    const daysUntil = Math.ceil((bday - now) / 86400000);
    if (daysUntil > daysAhead) continue;

    result.upcoming.push({ name: member.name, daysUntil, date: `${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}` });

    // Skip if already queued
    const name = member.name || member.first_name || 'Unknown';
    if (pendingNames.has(name)) {
      result.skippedDuplicate++;
      continue;
    }

    const message = generateMessage('birthday', member);
    if (message) {
      enqueue('birthday', member, message);
      result.generated++;
      pendingNames.add(name);
    }
  }

  return result;
}

/**
 * Format for Telegram
 */
export function formatBirthdaysTelegram(daysAhead = 7) {
  const result = scanBirthdays(daysAhead);
  let text = `🎂 *Birthday Scan* (next ${daysAhead} days)\n`;

  if (result.note) {
    text += `_${result.note}_\n`;
    return text;
  }

  if (result.upcoming.length === 0) {
    text += `_No birthdays in the next ${daysAhead} days._\n`;
    return text;
  }

  text += `Upcoming: ${result.upcoming.length}\n`;
  for (const b of result.upcoming) {
    text += `  • ${b.name} — ${b.daysUntil === 0 ? 'TODAY' : `in ${b.daysUntil} days`} (${b.date})\n`;
  }
  text += `\nGenerated: ${result.generated} messages\n`;
  text += `Already queued: ${result.skippedDuplicate}\n`;
  return text;
}
