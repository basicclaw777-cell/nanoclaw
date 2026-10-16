/**
 * lapsed-campaign.js — "Before We Say Goodbye" campaign for 566 lapsed members
 *
 * Hook: CRM upgrade, cleaning the list. 2 free classes or we remove you.
 * Two CTAs: Claim / Remove
 *
 * Fires post-departure (2026-06-08) via PM2 cron or /campaign launch.
 * Batched: 20 members per day to avoid flood. Tracks progress.
 *
 * Nothing auto-sends. All queued for Paul to review via /comms queue.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { enqueue, getPending } from './comms-queue.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME || '/Users/basicclaw777';
const CRM_PATH = path.join(HOME, 'Cathedral', 'br-crm', 'data', 'members.json');
const STATE_PATH = path.join(__dirname, 'campaign-state.json');

const BATCH_SIZE = 20;
const LAUNCH_DATE = new Date('2026-06-08T00:00:00+08:00');

// The campaign message — Coach Paul voice
function generateCampaignMessage(member) {
  const firstName = member.name.split(' ')[0].replace(/-.*$/, '').trim();
  // Skip obviously bad names
  if (firstName.includes('MERGED') || firstName.includes('DELETE') || firstName.length < 2) return null;

  return {
    subject: `Before we say goodbye — ${firstName}`,
    body: `Hey ${firstName},

We're upgrading our system at Basic Reflex and cleaning up the member list.

You haven't trained with us in a while, and that's completely fine — life happens. But before we remove you from the list, I wanted to reach out one last time.

If you want to come back, I've got 2 free classes waiting for you. No strings, no pitch — just come hit pads and see how it feels.

If you're done with boxing, no worries at all. Just let me know and I'll remove you from the list. No hard feelings.

Either way, thanks for being part of Basic Reflex.

Coach Paul
Basic Reflex Boxing, Kennedy Town`,
    type: 'lapsed_campaign',
    priority: 'high',
  };
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8')); }
  catch { return { launched: false, batches: [], totalQueued: 0, totalSkipped: 0 }; }
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

/**
 * Launch next batch of campaign messages.
 * Returns { queued, skipped, remaining, complete }
 */
export function launchBatch(force = false) {
  const now = new Date();
  if (!force && now < LAUNCH_DATE) {
    const daysUntil = Math.ceil((LAUNCH_DATE - now) / 86400000);
    return { queued: 0, skipped: 0, remaining: 0, blocked: true, reason: `Campaign launches ${daysUntil} days from now (June 8). Use /campaign force to override.` };
  }

  let members;
  try {
    members = JSON.parse(fs.readFileSync(CRM_PATH, 'utf-8'));
  } catch (err) {
    return { queued: 0, skipped: 0, remaining: 0, error: `Cannot read CRM: ${err.message}` };
  }

  const state = loadState();
  state.launched = true;

  const pendingNames = new Set(getPending().map(m => m.memberName));
  const contactedIds = new Set(state.batches.flatMap(b => b.ids));

  // Filter eligible members
  const eligible = members.filter(m =>
    m.campaign_status === 'not_contacted' &&
    !contactedIds.has(m.id) &&
    !m.name.includes('MERGED') &&
    !m.name.includes('DELETE') &&
    m.name.length > 2
  );

  let queued = 0;
  let skipped = 0;
  const batchIds = [];

  for (const member of eligible) {
    if (queued >= BATCH_SIZE) break;

    if (pendingNames.has(member.name)) {
      skipped++;
      continue;
    }

    const message = generateCampaignMessage(member);
    if (!message) {
      skipped++;
      continue;
    }

    enqueue('lapsed_campaign', member, message);
    batchIds.push(member.id);
    queued++;
    pendingNames.add(member.name);
  }

  // Record batch
  state.batches.push({
    date: now.toISOString(),
    ids: batchIds,
    count: queued,
  });
  state.totalQueued += queued;
  state.totalSkipped += skipped;
  saveState(state);

  const remaining = eligible.length - queued;
  const complete = remaining <= 0;

  return { queued, skipped, remaining, complete, totalSent: state.totalQueued };
}

/**
 * Get campaign status
 */
export function getCampaignStatus() {
  const state = loadState();
  const now = new Date();

  let members;
  try {
    members = JSON.parse(fs.readFileSync(CRM_PATH, 'utf-8'));
  } catch {
    members = [];
  }

  const contactedIds = new Set(state.batches.flatMap(b => b.ids));
  const eligible = members.filter(m =>
    m.campaign_status === 'not_contacted' &&
    !contactedIds.has(m.id) &&
    !m.name.includes('MERGED') &&
    !m.name.includes('DELETE')
  );

  const daysUntil = Math.ceil((LAUNCH_DATE - now) / 86400000);

  return {
    launched: state.launched,
    totalMembers: members.length,
    totalQueued: state.totalQueued,
    remaining: eligible.length,
    batchCount: state.batches.length,
    daysUntilLaunch: daysUntil > 0 ? daysUntil : 0,
    active: now >= LAUNCH_DATE,
    estimatedDays: Math.ceil(eligible.length / BATCH_SIZE),
  };
}

/**
 * Format for Telegram
 */
export function formatCampaignTelegram() {
  const status = getCampaignStatus();
  let text = `📢 *566 Lapsed Campaign*\n`;
  text += `"Before We Say Goodbye"\n\n`;

  if (!status.active) {
    text += `⏳ Launches in ${status.daysUntilLaunch} days (June 8)\n`;
    text += `Use /campaign force to test one batch now\n\n`;
  } else {
    text += `✅ Campaign active\n\n`;
  }

  text += `Total members: ${status.totalMembers}\n`;
  text += `Queued so far: ${status.totalQueued}\n`;
  text += `Remaining: ${status.remaining}\n`;
  text += `Batches sent: ${status.batchCount}\n`;
  text += `Est. days to complete: ${status.estimatedDays}\n`;

  return text;
}
