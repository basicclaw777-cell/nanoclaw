// gym-challenge.js — 100 Punches a Day Challenge
// ESM module. Daily punch target, streak tracking, leaderboard.
// State: ~/basic-reflex/gym-eyes/challenge.json

import fs from 'fs';
import path from 'path';

const HOME = process.env.HOME;
const STATE_FILE = path.join(HOME, 'basic-reflex', 'gym-eyes', 'challenge.json');

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {}
  return { participants: {} };
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function todayKey() {
  // HKT = UTC+8
  const now = new Date(Date.now() + 8 * 3600000);
  return now.toISOString().split('T')[0];
}

function yesterdayKey() {
  const now = new Date(Date.now() + 8 * 3600000 - 86400000);
  return now.toISOString().split('T')[0];
}

// ── Join Challenge ──────────────────────────────────────────────────────────

export function joinChallenge(name, target = 100) {
  const state = loadState();
  const key = name.toLowerCase();
  const today = todayKey();

  if (state.participants[key]) {
    // Update target
    state.participants[key].target = target;
    saveState(state);
    return { status: 'updated', name, target, message: `${name} target updated to ${target} punches/day.` };
  }

  state.participants[key] = {
    name,
    target,
    joined: today,
    days: {},
    streak: 0,
    bestStreak: 0,
    totalPunches: 0,
    completedDays: 0,
  };

  saveState(state);
  return { status: 'joined', name, target, message: `${name} joined the ${target} Punches a Day challenge!` };
}

// ── Add Punches ─────────────────────────────────────────────────────────────

export function addPunches(name, punchCount) {
  const state = loadState();
  const key = name.toLowerCase();
  const p = state.participants[key];
  if (!p) return null;

  const today = todayKey();

  if (!p.days[today]) {
    p.days[today] = { punches: 0, completed: false, clips: 0 };
  }

  const day = p.days[today];
  const wasBelowTarget = day.punches < p.target;
  day.punches += punchCount;
  day.clips += 1;
  p.totalPunches += punchCount;

  const justCompleted = wasBelowTarget && day.punches >= p.target && !day.completed;

  if (justCompleted) {
    day.completed = true;
    p.completedDays += 1;
    updateStreak(p);
  }

  saveState(state);

  return {
    name: p.name,
    todayPunches: day.punches,
    target: p.target,
    remaining: Math.max(0, p.target - day.punches),
    justCompleted,
    streak: p.streak,
    bestStreak: p.bestStreak,
    totalPunches: p.totalPunches,
    completedDays: p.completedDays,
  };
}

function updateStreak(p) {
  // Count consecutive completed days ending today
  let streak = 0;
  let checkDate = new Date(Date.now() + 8 * 3600000);

  while (true) {
    const key = checkDate.toISOString().split('T')[0];
    if (p.days[key]?.completed) {
      streak++;
      checkDate = new Date(checkDate.getTime() - 86400000);
    } else {
      break;
    }
  }

  p.streak = streak;
  if (streak > p.bestStreak) p.bestStreak = streak;
}

// ── Check if participant ────────────────────────────────────────────────────

export function isParticipant(name) {
  const state = loadState();
  return !!state.participants[name.toLowerCase()];
}

// ── Get Stats ───────────────────────────────────────────────────────────────

export function getStats(name) {
  const state = loadState();
  const p = state.participants[name.toLowerCase()];
  if (!p) return null;

  const today = todayKey();
  const todayData = p.days[today] || { punches: 0, completed: false, clips: 0 };

  return {
    name: p.name,
    target: p.target,
    joined: p.joined,
    todayPunches: todayData.punches,
    todayCompleted: todayData.completed,
    remaining: Math.max(0, p.target - todayData.punches),
    streak: p.streak,
    bestStreak: p.bestStreak,
    totalPunches: p.totalPunches,
    completedDays: p.completedDays,
    totalDays: Object.keys(p.days).length,
  };
}

// ── Streak ──────────────────────────────────────────────────────────────────

export function formatStreakTelegram(name) {
  const stats = getStats(name);
  if (!stats) return `❌ ${name} not in challenge. Join with \`/challenge join ${name}\``;

  const pct = stats.target > 0 ? Math.round((stats.todayPunches / stats.target) * 100) : 0;
  const bar = progressBar(pct);

  let msg = `🥊 *${stats.name} — Challenge*\n\n`;
  msg += `*Today:* ${stats.todayPunches}/${stats.target} punches ${bar}\n`;

  if (stats.todayCompleted) {
    msg += `✅ *TARGET HIT!*\n`;
  } else {
    msg += `${stats.remaining} to go\n`;
  }

  msg += `\n*Streak:* ${stats.streak} day${stats.streak !== 1 ? 's' : ''} 🔥\n`;
  msg += `*Best streak:* ${stats.bestStreak} days\n`;
  msg += `*Total punches:* ${stats.totalPunches}\n`;
  msg += `*Days completed:* ${stats.completedDays}/${stats.totalDays}\n`;

  return msg;
}

function progressBar(pct) {
  const filled = Math.min(10, Math.round(pct / 10));
  return '▓'.repeat(filled) + '░'.repeat(10 - filled);
}

// ── Leaderboard ─────────────────────────────────────────────────────────────

export function formatLeaderboardTelegram() {
  const state = loadState();
  const participants = Object.values(state.participants);

  if (participants.length === 0) return '🥊 *Challenge Leaderboard*\n\nNo participants yet.';

  // Sort by streak, then total punches
  participants.sort((a, b) => b.streak - a.streak || b.totalPunches - a.totalPunches);

  const today = todayKey();

  let msg = '🥊 *Challenge Leaderboard*\n\n';

  const medals = ['🥇', '🥈', '🥉'];
  participants.forEach((p, i) => {
    const medal = medals[i] || `${i + 1}.`;
    const todayData = p.days[today] || { punches: 0, completed: false };
    const check = todayData.completed ? '✅' : `${todayData.punches}/${p.target}`;
    msg += `${medal} *${p.name}* — ${p.streak}🔥 · ${p.totalPunches} total · today: ${check}\n`;
  });

  return msg;
}

// ── Celebration Message ─────────────────────────────────────────────────────

export function celebrationMessage(result) {
  const msgs = [
    `🔔 *${result.name} — TARGET HIT!*\n\n${result.todayPunches} punches today. ${result.target} target smashed.\n\n🔥 Streak: ${result.streak} day${result.streak !== 1 ? 's' : ''}!\n\n_Basic Reflex. Every punch counts._`,
    `💥 *DONE.* ${result.todayPunches} punches.\n\n${result.name} hit ${result.target} today.\nStreak: ${result.streak} 🔥\n\n_Keep going. Basic Reflex._`,
    `🥊 *${result.name} COMPLETED THE CHALLENGE!*\n\n${result.todayPunches}/${result.target} ✅\nDay ${result.streak} in a row.\nLifetime: ${result.totalPunches} punches.\n\n_100 Punches a Day. Basic Reflex._`,
  ];

  // Milestone celebrations
  if (result.streak === 7) return `🏆 *ONE WEEK STREAK!*\n\n${result.name} — 7 days straight. ${result.totalPunches} lifetime punches.\n\nYou're not trying anymore. You're training.\n\n_Basic Reflex. Sheung Wan._`;
  if (result.streak === 30) return `👑 *30 DAY STREAK!*\n\n${result.name} — one full month. ${result.totalPunches} lifetime punches.\n\nYou built a habit. Come see what else you can build.\n\n_Basic Reflex. Sheung Wan._`;
  if (result.completedDays === 10) return `🎯 *10 DAYS COMPLETED!*\n\n${result.name} has hit target 10 times.\n${result.totalPunches} lifetime punches.\n\nDouble digits. Keep stacking.\n\n_Basic Reflex._`;

  return msgs[Math.floor(Math.random() * msgs.length)];
}

// ── Leave Challenge ─────────────────────────────────────────────────────────

export function leaveChallenge(name) {
  const state = loadState();
  const key = name.toLowerCase();
  if (!state.participants[key]) return false;
  delete state.participants[key];
  saveState(state);
  return true;
}

export default {
  joinChallenge,
  addPunches,
  isParticipant,
  getStats,
  formatStreakTelegram,
  formatLeaderboardTelegram,
  celebrationMessage,
  leaveChallenge,
};
