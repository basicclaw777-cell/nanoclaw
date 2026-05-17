/**
 * Architect Pulse — Daily channel health check
 *
 * Sends one Marcus-flavored question via Telegram each morning.
 * Picks a nudge action for the day from the rotation.
 * Stores responses and tracks channel movement over time.
 *
 * Runs via PM2 cron: daily at 07:00 HKT
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const PULSE_LOG = path.join(DATA_DIR, 'pulse-log.json');
const STATE_FILE = path.join(DATA_DIR, 'pulse-state.json');

// Ensure data dir
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ── Config ──────────────────────────────────────────────────────────────────

const CHANNELS = [
  { id: 'money', name: 'Money / Trading', emoji: '💰' },
  { id: 'love', name: 'Love / Connection', emoji: '❤️' },
  { id: 'home', name: 'Home / Environment', emoji: '🏠' },
  { id: 'gym', name: 'Gym Revenue', emoji: '🥊' },
  { id: 'publishing', name: 'Publishing / Visibility', emoji: '📡' },
  { id: 'asking', name: 'Asking / Receiving', emoji: '🤝' },
  { id: 'finishing', name: 'Finishing / Shipping', emoji: '🚀' },
  { id: 'health', name: 'Health / Body', emoji: '💪' },
  { id: 'learning', name: 'Learning / Growth', emoji: '📚' },
  { id: 'rest', name: 'Rest / Recovery', emoji: '🌙' },
  { id: 'creativity', name: 'Creativity / Play', emoji: '🎨' }
];

// Marcus-flavored morning questions — one per channel
const PULSE_QUESTIONS = {
  money: [
    "What did trading teach you yesterday that fear wouldn't have?",
    "Did the system act where you once would have frozen?",
    "Strip it to essentials: did money move, or did it stay still?"
  ],
  love: [
    "Did you let anyone close yesterday — or did the wall hold?",
    "Who reached out that you didn't respond to?",
    "Where did you give but refuse to receive?"
  ],
  home: [
    "What did you walk past in your home that needs attending?",
    "One thing. Fixed or unfixed. Which was it?",
    "Does your environment reflect the architect or the avoidance?"
  ],
  gym: [
    "Did the gym generate anything yesterday — revenue, lead, opportunity?",
    "Which Cathedral Staff system could have acted but didn't?",
    "What would a functioning business have done that yours didn't?"
  ],
  publishing: [
    "Did the world hear from you yesterday?",
    "What did you create but not release?",
    "Is the draft folder growing while the published folder stays empty?"
  ],
  asking: [
    "Did you ask anyone for anything yesterday?",
    "What would have been easier if you'd asked for help?",
    "Who could you text right now that would move something forward?"
  ],
  finishing: [
    "What's 90% done that you could finish today in 5 minutes?",
    "What did you start instead of finishing?",
    "Name one thing you shipped. If you can't — why not?"
  ],
  health: [
    "Did you train YOUR body yesterday — not just coach others?",
    "What did your body need that you didn't give it?",
    "The coach who doesn't train teaches from memory, not practice. Did you practice?"
  ],
  learning: [
    "What did you learn yesterday that wasn't for a build?",
    "When did you last study something with no immediate use?",
    "Are you consuming or just producing? The well needs refilling."
  ],
  rest: [
    "Did you rest without guilt yesterday?",
    "Sleep: enough? Quality? Or did you push past the signal?",
    "Rest is not reward for work. It is the foundation of work. Did you honour it?"
  ],
  creativity: [
    "Did you make anything yesterday with no purpose?",
    "When did you last play — not build, not optimize, just play?",
    "What would you create if no one would ever see it?"
  ]
};

// Nudge actions — tiny, completable in <5 minutes
const NUDGES = {
  money: [
    "Check portfolio.json — read the numbers, notice how you feel.",
    "Read one paragraph of trading WHY.md. Remember why.",
    "Look at the latest watcher report. What did the system do while you slept?"
  ],
  love: [
    "Send one message to someone you haven't spoken to in >2 weeks.",
    "Say yes to one thing today instead of 'maybe later.'",
    "Tell one person one true thing about how you feel."
  ],
  home: [
    "Pick up 5 items off the floor. Just 5.",
    "Send one WhatsApp to Ace Handyman: 9078 1918. Just say what's broken.",
    "Wipe one surface. Any surface. That's enough.",
    "Take one timestamped photo of ceiling damage.",
    "Throw away 3 things you don't need."
  ],
  gym: [
    "Send one outreach message from the comms engine.",
    "Post one piece of content from Maya's calendar.",
    "Check operations KPI dashboard. What's the number?",
    "Reply to one unanswered client message."
  ],
  publishing: [
    "Write 2 sentences of anything. Don't publish. Just write.",
    "Record a 15-second voice note of one idea. Keep it.",
    "Open one draft. Read it. If it's ready — press send.",
    "Post one photo to stories. No caption needed."
  ],
  asking: [
    "Text one friend and ask how they are. (Asking is receiving.)",
    "Ask someone for a recommendation — restaurant, book, anything.",
    "Delegate one small task to someone. Accept imperfection.",
    "Say 'can you help me with...' to one person today."
  ],
  finishing: [
    "Pick the smallest unfinished task you can see. Finish it now.",
    "Send the demand letter. Or write one line of it.",
    "Close one browser tab by finishing what it represents.",
    "Reply to one message you've been avoiding."
  ],
  health: [
    "Do 3 rounds on the bag. Not coaching — just you and the bag.",
    "Stretch for 2 minutes. That's it. Just 2 minutes.",
    "Drink a full glass of water right now.",
    "Take a 10-minute walk. No phone. Just walk.",
    "Do 20 push-ups. The body remembers what the mind forgets."
  ],
  learning: [
    "Read one page of something unrelated to your projects.",
    "Watch one lecture on something you know nothing about.",
    "Ask one question you don't know the answer to. Research it for 5 minutes.",
    "Open one book you bought but never read. Read the first paragraph."
  ],
  rest: [
    "Put the phone down for 30 minutes. No screens.",
    "Lie down for 10 minutes. Not sleep — just stillness.",
    "Say no to one thing today that you'd normally say yes to.",
    "Go to bed 30 minutes earlier tonight. Set the alarm now."
  ],
  creativity: [
    "Draw something. Anything. Doesn't matter if it's terrible.",
    "Play one song you love. Listen — don't multitask.",
    "Write 3 lines about nothing. No purpose. Just words.",
    "Take one photo of something beautiful. Don't post it.",
    "Rearrange one thing in your space. Make it look how YOU want it."
  ]
};

// ── State Management ─���──────────────────────────────��───────────────────────

function getState() {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  }
  return {
    lastChannelIndex: -1,
    lastPulseDate: null,
    channelScores: {},
    stagnationDays: {},
    totalPulses: 0
  };
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function getLog() {
  if (fs.existsSync(PULSE_LOG)) {
    return JSON.parse(fs.readFileSync(PULSE_LOG, 'utf8'));
  }
  return [];
}

function appendLog(entry) {
  const log = getLog();
  log.push(entry);
  // Keep last 90 days
  const cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000);
  const trimmed = log.filter(e => new Date(e.date).getTime() > cutoff);
  fs.writeFileSync(PULSE_LOG, JSON.stringify(trimmed, null, 2));
}

// ── Channel Selection ─────���─────────────────────────────────────────────────

function pickChannel(state) {
  // Rotate through channels, but prioritize stagnant ones
  const stagnant = CHANNELS.filter(ch => (state.stagnationDays[ch.id] || 0) >= 7);

  if (stagnant.length > 0) {
    // Pick most stagnant
    stagnant.sort((a, b) => (state.stagnationDays[b.id] || 0) - (state.stagnationDays[a.id] || 0));
    return stagnant[0];
  }

  // Otherwise rotate
  const nextIndex = (state.lastChannelIndex + 1) % CHANNELS.length;
  return CHANNELS[nextIndex];
}

function pickQuestion(channelId) {
  const questions = PULSE_QUESTIONS[channelId];
  return questions[Math.floor(Math.random() * questions.length)];
}

function pickNudge(channelId) {
  const nudges = NUDGES[channelId];
  return nudges[Math.floor(Math.random() * nudges.length)];
}

// ── Message Formatting ──────��───────────────────────────────────────────────

function formatPulseMessage(channel, question, nudge, state) {
  const dayNum = (state.totalPulses || 0) + 1;
  const stagnantDays = state.stagnationDays[channel.id] || 0;

  let msg = `${channel.emoji} *Architect Pulse — Day ${dayNum}*\n`;
  msg += `Channel: *${channel.name}*\n\n`;
  msg += `_"${question}"_\n\n`;
  msg += `── Today's nudge ──\n`;
  msg += `${nudge}\n\n`;

  if (stagnantDays >= 7) {
    msg += `⚠️ _${stagnantDays} days without movement in this channel._\n\n`;
  }

  msg += `Reply with what you did — or /skip.\n`;
  msg += `Short is fine. One sentence. Even one word.`;

  return msg;
}

// ── Telegram Send ──────���────────────────────────────────��───────────────────

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_TOKEN;
  const chatId = process.env.PAUL_CHAT_ID || '1912121485';

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown'
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram send failed: ${err}`);
  }
  return res.json();
}

// ── Main ─────���────────────────────────────────────���─────────────────────────

async function runPulse() {
  const state = getState();
  const today = new Date().toISOString().split('T')[0];

  // Don't double-send
  if (state.lastPulseDate === today) {
    console.log('[pulse] Already sent today. Skipping.');
    return;
  }

  const channel = pickChannel(state);
  const question = pickQuestion(channel.id);
  const nudge = pickNudge(channel.id);
  const message = formatPulseMessage(channel, question, nudge, state);

  await sendTelegram(message);

  // Update state
  state.lastChannelIndex = CHANNELS.findIndex(c => c.id === channel.id);
  state.lastPulseDate = today;
  state.totalPulses = (state.totalPulses || 0) + 1;

  // Increment stagnation for all channels (reset on response via /pulse command)
  for (const ch of CHANNELS) {
    state.stagnationDays[ch.id] = (state.stagnationDays[ch.id] || 0) + 1;
  }

  saveState(state);

  // Log the pulse
  appendLog({
    date: new Date().toISOString(),
    channel: channel.id,
    question,
    nudge,
    response: null // filled when Paul responds via /pulse
  });

  console.log(`[pulse] Sent: ${channel.name} — "${question}"`);
}

// ── Load env and run ────────────────────────────────────────────────────────

import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

runPulse().catch(err => {
  console.error('[pulse] Error:', err.message);
  process.exit(1);
});
