// The Lymphatic System — Cathedral output hygiene
// Thins information, detects bloat, asks Paul if output is landing.
//
// Two modes:
// 1. PASSIVE — intercepts outgoing Telegram messages, compresses before send
// 2. ACTIVE — weekly interview: "Is this working? What's noise?"
//
// PM2 cron: weekly interview Sunday 08:00 HKT (after morning briefing)
// Passive: imported by telegram-bot.js, wraps safeSend()

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const HOME = process.env.HOME || '/Users/basicclaw777';
const STATE_PATH = join(HOME, 'Cathedral/lymphatic-state.json');

// ── State ───────────────────────────────────────────────────────────────────

function loadState() {
  try { return JSON.parse(readFileSync(STATE_PATH, 'utf-8')); }
  catch { return { ratings: [], bloatFlags: [], lastInterview: null }; }
}

function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// ── Bloat Detection ─────────────────────────────────────────────────────────
// Rules for what makes a Telegram message bloated for a visual thinker.

export function detectBloat(text) {
  const lines = text.split('\n');
  const wordCount = text.split(/\s+/).length;
  const issues = [];

  // Over 200 words = wall of text
  if (wordCount > 200) {
    issues.push({ type: 'WALL', detail: `${wordCount} words. Max 200 for Telegram.` });
  }

  // More than 3 consecutive lines without a blank line = dense block
  let consecutiveNonBlank = 0;
  for (const line of lines) {
    if (line.trim()) {
      consecutiveNonBlank++;
      if (consecutiveNonBlank > 4) {
        issues.push({ type: 'DENSE_BLOCK', detail: '4+ lines without breathing room.' });
        break;
      }
    } else {
      consecutiveNonBlank = 0;
    }
  }

  // Filler phrases
  const fillers = [
    /\bjust wanted to\b/i, /\bI'd like to\b/i, /\bplease note that\b/i,
    /\bit's worth noting\b/i, /\bas mentioned\b/i, /\bin summary\b/i,
    /\boverall\b/i, /\bin conclusion\b/i, /\badditionally\b/i,
    /\bfurthermore\b/i, /\bhowever it should be noted\b/i,
    /\bthis is because\b/i, /\bas we can see\b/i,
  ];
  const fillerCount = fillers.filter(f => f.test(text)).length;
  if (fillerCount > 0) {
    issues.push({ type: 'FILLER', detail: `${fillerCount} filler phrases detected.` });
  }

  // Repeated information (same noun appearing 4+ times)
  const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  const counts = {};
  for (const w of words) counts[w] = (counts[w] || 0) + 1;
  const repeated = Object.entries(counts).filter(([w, c]) => c >= 4 && !['that', 'this', 'with', 'from', 'have', 'been', 'will', 'they', 'their', 'what', 'when', 'which', 'more', 'than', 'also', 'each', 'some'].includes(w));
  if (repeated.length > 2) {
    issues.push({ type: 'REPETITION', detail: `Repeated: ${repeated.map(([w, c]) => `${w}(${c}x)`).join(', ')}` });
  }

  return {
    isBloated: issues.length > 0,
    wordCount,
    lineCount: lines.length,
    issues,
    score: Math.min(issues.length / 3, 1), // 0 = clean, 1 = bloated
  };
}

// ── Compress ────────────────────────────────────────────────────────────────
// Thin a message for Telegram. Not LLM — rule-based, instant.

export function compress(text) {
  let result = text;

  // Remove filler phrases
  const fillers = [
    /\bJust wanted to let you know that\s*/gi,
    /\bPlease note that\s*/gi,
    /\bIt's worth noting that\s*/gi,
    /\bAs mentioned (earlier|above|before),?\s*/gi,
    /\bIn summary,?\s*/gi,
    /\bOverall,?\s*/gi,
    /\bIn conclusion,?\s*/gi,
    /\bAdditionally,?\s*/gi,
    /\bFurthermore,?\s*/gi,
    /\bHowever,? it should be noted that\s*/gi,
    /\bThis is because\s*/gi,
    /\bAs we can see,?\s*/gi,
    /\bIt is important to note that\s*/gi,
  ];
  for (const f of fillers) result = result.replace(f, '');

  // Collapse multiple blank lines to one
  result = result.replace(/\n{3,}/g, '\n\n');

  // Remove trailing whitespace per line
  result = result.split('\n').map(l => l.trimEnd()).join('\n');

  // Trim
  result = result.trim();

  return result;
}

// ── Interview Questions ─────────────────────────────────────────────────────
// Weekly check-in. Short. Specific. Actionable.

const INTERVIEW_QUESTIONS = [
  {
    id: 'morning_briefing',
    question: 'Morning briefing — useful or noise? Rate 1-5.',
    target: 'morning-briefing.py',
  },
  {
    id: 'whisperer',
    question: 'Whisperer sky reading — landing or skipping? Rate 1-5.',
    target: 'looking-glass-whisperer.mjs',
  },
  {
    id: 'muse',
    question: 'Muse findings — surprising or stale? Rate 1-5.',
    target: 'the-muse.js',
  },
  {
    id: 'groundskeeper',
    question: 'Groundskeeper note — useful or redundant? Rate 1-5.',
    target: 'the-groundskeeper.js',
  },
  {
    id: 'format',
    question: 'Telegram messages overall — too long? Right density? Want more visual/less text?',
    target: 'global',
  },
  {
    id: 'missing',
    question: 'Anything the Cathedral should be telling you that it isn\'t?',
    target: 'global',
  },
];

export function getInterviewQuestions() {
  return INTERVIEW_QUESTIONS;
}

// ── Record Rating ───────────────────────────────────────────────────────────

export function recordRating(questionId, rating, notes = '') {
  const state = loadState();
  state.ratings.push({
    date: new Date().toISOString().slice(0, 10),
    questionId,
    rating,
    notes,
  });
  // Keep last 50 ratings
  if (state.ratings.length > 50) state.ratings = state.ratings.slice(-50);
  state.lastInterview = new Date().toISOString().slice(0, 10);
  saveState(state);
}

// ── Bloat Report ────────────────────────────────────────────────────────────
// Scan recent Telegram outputs for bloat patterns.

export function bloatReport() {
  const state = loadState();
  const recent = state.bloatFlags.slice(-20);
  if (recent.length === 0) return 'No bloat data yet. Lymphatic system just started.';

  const avgScore = recent.reduce((s, b) => s + b.score, 0) / recent.length;
  const worstSources = {};
  for (const b of recent) {
    if (b.source) worstSources[b.source] = (worstSources[b.source] || 0) + b.score;
  }

  const sorted = Object.entries(worstSources).sort((a, b) => b[1] - a[1]);

  let report = `Lymphatic Report — ${recent.length} messages scanned\n\n`;
  report += `Average bloat: ${(avgScore * 100).toFixed(0)}%\n`;
  if (sorted.length) {
    report += '\nWorst sources:\n';
    for (const [source, score] of sorted.slice(0, 5)) {
      report += `  ${source}: ${(score / recent.filter(b => b.source === source).length * 100).toFixed(0)}% avg bloat\n`;
    }
  }

  // Ratings summary
  const ratings = state.ratings.slice(-10);
  if (ratings.length) {
    report += '\nRecent ratings:\n';
    for (const r of ratings) {
      report += `  ${r.questionId}: ${r.rating}/5${r.notes ? ' — ' + r.notes : ''}\n`;
    }
  }

  return report;
}

// ── Log bloat for a message ─────────────────────────────────────────────────

export function logBloat(text, source = 'unknown') {
  const analysis = detectBloat(text);
  if (analysis.isBloated) {
    const state = loadState();
    state.bloatFlags.push({
      date: new Date().toISOString(),
      source,
      score: analysis.score,
      wordCount: analysis.wordCount,
      issues: analysis.issues.map(i => i.type),
    });
    // Keep last 100
    if (state.bloatFlags.length > 100) state.bloatFlags = state.bloatFlags.slice(-100);
    saveState(state);
  }
  return analysis;
}

// ── Weekly Interview Runner ─────────────────────────────────────────────────

async function runInterview() {
  console.log('◎ Lymphatic System — weekly interview');

  try {
    const { config } = await import('dotenv');
    config();
    const token = process.env.TELEGRAM_TOKEN;
    const chatId = process.env.PAUL_CHAT_ID;
    if (!token || !chatId) { console.log('  No Telegram creds'); return; }

    const send = async (text) => {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
    };

    // Send bloat report first
    const report = bloatReport();

    let text = '◎ LYMPHATIC CHECK-IN\n\n';
    text += report + '\n\n';
    text += 'Quick ratings (reply /rate [id] [1-5]):\n\n';
    for (const q of INTERVIEW_QUESTIONS) {
      text += `${q.id}: ${q.question}\n`;
    }
    text += '\nExample: /rate whisperer 4 good but too long';

    await send(text);
    console.log('  Interview sent.');
  } catch (e) {
    console.log(`  Error: ${e.message}`);
  }
}

// Run if called directly (cron mode)
if (process.argv[1]?.endsWith('lymphatic.mjs')) {
  runInterview().catch(console.error);
}
