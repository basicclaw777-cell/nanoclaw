/**
 * milestone-scanner.js — Detects student milestones and queues celebration messages
 *
 * Reads Gym Eyes student profiles for session counts.
 * Milestones: 10, 25, 50, 100, 200, 500 sessions.
 * Tracks which milestones already celebrated in milestone-state.json.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateMessage } from './whatsapp-templates.js';
import { enqueue, getPending } from './comms-queue.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME || '/Users/basicclaw777';
const PROFILES_DIR = path.join(HOME, 'basic-reflex', 'gym-eyes', 'students');
const STATE_PATH = path.join(__dirname, 'milestone-state.json');

const MILESTONES = [10, 25, 50, 100, 200, 500];

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8')); }
  catch { return {}; }
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

export function scanMilestones() {
  const result = { generated: 0, skippedDuplicate: 0, milestones: [] };
  const state = loadState();
  const pendingNames = new Set(getPending().filter(m => m.templateName === 'milestone').map(m => m.memberName));

  let profiles;
  try {
    const files = fs.readdirSync(PROFILES_DIR).filter(f => f.endsWith('.json'));
    profiles = files.map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(PROFILES_DIR, f), 'utf-8')); }
      catch { return null; }
    }).filter(Boolean);
  } catch {
    // No student profiles yet — that's fine
    return result;
  }

  for (const profile of profiles) {
    const name = profile.name || profile.studentName;
    if (!name) continue;

    const sessions = profile.totalSessions || profile.sessionCount || 0;
    if (!state[name]) state[name] = [];

    for (const milestone of MILESTONES) {
      if (sessions >= milestone && !state[name].includes(milestone)) {
        // New milestone reached
        state[name].push(milestone);
        result.milestones.push({ name, milestone, sessions });

        if (pendingNames.has(name)) {
          result.skippedDuplicate++;
          continue;
        }

        const member = { name, first_name: name.split(' ')[0] };
        const message = generateMessage('milestone', member, {
          milestone: `you've hit ${milestone} sessions at Basic Reflex`
        });

        if (message) {
          enqueue('milestone', member, message);
          result.generated++;
          pendingNames.add(name);
        }
      }
    }
  }

  saveState(state);
  return result;
}

export function formatMilestoneTelegram() {
  const result = scanMilestones();
  let text = `🏆 *Milestone Scan*\n`;

  if (result.milestones.length === 0) {
    text += `_No new milestones._\n`;
    return text;
  }

  text += `New milestones: ${result.milestones.length}\n`;
  for (const m of result.milestones) {
    text += `  • ${m.name} — ${m.milestone} sessions (total: ${m.sessions})\n`;
  }
  text += `\nQueued: ${result.generated} messages\n`;
  return text;
}
