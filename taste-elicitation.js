// taste-elicitation.js — Interactive preference elicitation via Telegram
// ESM module

import fs from 'fs';
import path from 'path';
import { getTasteProfile, addAnchor, addRejection, getStats, getVoicePattern } from './taste-map-api.js';

const SESSIONS_DIR = path.join(process.env.HOME, 'nanoclaw', 'taste-sessions');
const VAULT_TASTE_DIR = path.join(process.env.HOME, 'cathedral-vault', '09_Artifacts', 'taste-map');

// Ensure directories exist
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
if (!fs.existsSync(VAULT_TASTE_DIR)) fs.mkdirSync(VAULT_TASTE_DIR, { recursive: true });

// Active elicitation sessions (in-memory, one per chat)
const activeSessions = new Map();

const DOMAINS = ['music', 'visual_style', 'writing_voice', 'teaching_tone', 'class_energy'];

/**
 * Format taste map stats for display
 */
export function formatStats() {
  const stats = getStats();
  let msg = '🎯 *Taste Map Status*\n\n';
  for (const [domain, data] of Object.entries(stats.domains)) {
    const bar = data.anchors > 10 ? '🟢' : data.anchors > 3 ? '🟡' : '🔴';
    msg += `${bar} *${domain}*: ${data.anchors} anchors, ${data.rejections} rejections, ${data.qualities} qualities\n`;
  }
  msg += `\n📊 Total: ${stats.totalAnchors} anchors, ${stats.totalRejections} rejections`;
  msg += `\n🗣 Voice references: ${stats.voiceReferences}`;
  msg += `\n\n✍️ Pattern: _${getVoicePattern()}_`;
  return msg;
}

/**
 * Format domain profile for display
 */
export function formatProfile(domain) {
  const profile = getTasteProfile(domain);
  if (!profile) return `❌ Unknown domain: ${domain}`;

  let msg = `🎯 *Taste Map: ${domain}*\n\n`;

  if (profile.confirmed_qualities?.length) {
    msg += '*Confirmed qualities:*\n';
    profile.confirmed_qualities.forEach(q => { msg += `  • ${q}\n`; });
    msg += '\n';
  }

  if (profile.rejections?.length) {
    msg += '*Rejections:*\n';
    profile.rejections.forEach(r => { msg += `  ✗ ${r}\n`; });
    msg += '\n';
  }

  if (profile.anchors?.length) {
    const count = profile.anchors.length;
    msg += `*Anchors:* ${count} items\n`;
    // Show first 10
    profile.anchors.slice(0, 10).forEach(a => {
      const label = a.artist || a.item || a.genre || a.name || a.category || 'item';
      msg += `  → ${label}`;
      if (a.energy !== undefined) msg += ` (energy: ${a.energy})`;
      if (a.mood) msg += ` [${a.mood}]`;
      msg += '\n';
    });
    if (count > 10) msg += `  ... and ${count - 10} more\n`;
  }

  if (profile.taste_rule) {
    msg += `\n💡 _${profile.taste_rule}_`;
  }

  return msg;
}

/**
 * Start an elicitation session
 */
export function startSession(chatId, domain) {
  if (!DOMAINS.includes(domain)) {
    return `Unknown domain. Choose: ${DOMAINS.join(', ')}`;
  }

  const session = {
    chatId,
    domain,
    startedAt: new Date().toISOString(),
    rounds: [],
    state: 'active'
  };

  activeSessions.set(chatId, session);

  return `🎯 *Elicitation: ${domain}*\n\nI'll ask you questions to map your preferences. Reply naturally — "yes", "no", "more like X", "less Y".\n\nType /taste stop to end session.\n\nLet's start...`;
}

/**
 * Process an elicitation response
 */
export function processResponse(chatId, text) {
  const session = activeSessions.get(chatId);
  if (!session) return null; // No active session

  session.rounds.push({
    response: text,
    timestamp: new Date().toISOString()
  });

  return session;
}

/**
 * Stop an elicitation session and save
 */
export function stopSession(chatId) {
  const session = activeSessions.get(chatId);
  if (!session) return 'No active elicitation session.';

  session.state = 'completed';
  session.endedAt = new Date().toISOString();

  // Save session to disk
  const filename = `session-${session.domain}-${Date.now()}.json`;
  fs.writeFileSync(path.join(SESSIONS_DIR, filename), JSON.stringify(session, null, 2));

  // Also save to vault
  fs.writeFileSync(path.join(VAULT_TASTE_DIR, filename), JSON.stringify(session, null, 2));

  activeSessions.delete(chatId);

  return `✅ Elicitation session saved (${session.rounds.length} rounds).\nFile: ${filename}`;
}

/**
 * Check if there's an active session for a chat
 */
export function hasActiveSession(chatId) {
  return activeSessions.has(chatId);
}

/**
 * Record a quick preference (from passive collection)
 * e.g., Paul approves a Reed image → visual anchor
 */
export function recordPreference(domain, type, data) {
  if (type === 'anchor') {
    const group = data.group || 'anchors';
    addAnchor(domain, group, data);
    return true;
  } else if (type === 'rejection') {
    addRejection(domain, data.reason || data);
    return true;
  }
  return false;
}

/**
 * Get help text for /taste command
 */
export function getHelpText() {
  return `🎯 *Taste Map — Preference Engine*

*Commands:*
\`/taste\` — this help
\`/taste status\` — map coverage per domain
\`/taste music\` — view music profile
\`/taste visual\` — view visual style profile
\`/taste writing\` — view writing voice profile
\`/taste teaching\` — view teaching tone profile
\`/taste energy\` — view class energy profile
\`/taste voices\` — view voice references
\`/taste add music <artist/track>\` — add music anchor
\`/taste reject <domain> <reason>\` — add rejection
\`/taste elicit <domain>\` — start interactive session

*Passive collection:*
Taste map also learns from your daily actions — approving Reed images, rating playlists, rejecting AI output.`;
}

export default {
  formatStats,
  formatProfile,
  startSession,
  processResponse,
  stopSession,
  hasActiveSession,
  recordPreference,
  getHelpText,
  DOMAINS
};
