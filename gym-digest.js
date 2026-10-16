// gym-digest.js — Weekly Gym Eyes Digest
// ESM module. PM2 cron Sunday 20:00 HKT + /gymdigest Telegram command.
// Summarizes all student activity, improvements, regressions, milestones, absences.

import fs from 'fs';
import path from 'path';

const HOME = process.env.HOME;
const STUDENTS_DIR = path.join(HOME, 'basic-reflex', 'gym-eyes', 'students');
const SESSIONS_DIR = path.join(HOME, 'basic-reflex', 'gym-eyes', 'sessions');

function loadAllStudents() {
  try {
    return fs.readdirSync(STUDENTS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => JSON.parse(fs.readFileSync(path.join(STUDENTS_DIR, f), 'utf-8')));
  } catch { return []; }
}

function daysSince(dateStr) {
  if (!dateStr) return Infinity;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

export function generateDigest() {
  const students = loadAllStudents();
  if (students.length === 0) return '👁 *Weekly Gym Digest*\n\nNo students registered yet.';

  const now = new Date();
  const weekAgo = new Date(now - 7 * 86400000);

  let totalSessionsThisWeek = 0;
  let totalPunchesThisWeek = 0;
  const active = [];
  const improved = [];
  const regressed = [];
  const newMilestones = [];
  const flagged = [];
  const absent = [];

  for (const student of students) {
    const sessions = student.sessions || [];
    const recentSessions = sessions.filter(s => new Date(s.date) >= weekAgo);
    const weekPunches = recentSessions.reduce((sum, s) => sum + (s.punches?.total || 0), 0);
    const weekSteps = recentSessions.reduce((sum, s) => sum + (s.steps?.total || 0), 0);

    totalSessionsThisWeek += recentSessions.length;
    totalPunchesThisWeek += weekPunches;

    if (recentSessions.length > 0) {
      active.push({ name: student.name, sessions: recentSessions.length, punches: weekPunches, steps: weekSteps });
    }

    // Compare last 2 weeks
    const twoWeeksAgo = new Date(now - 14 * 86400000);
    const prevWeekSessions = sessions.filter(s => {
      const d = new Date(s.date);
      return d >= twoWeeksAgo && d < weekAgo;
    });
    const prevPunches = prevWeekSessions.reduce((sum, s) => sum + (s.punches?.total || 0), 0);

    if (recentSessions.length > 0 && prevWeekSessions.length > 0) {
      const delta = weekPunches - prevPunches;
      const pct = prevPunches > 0 ? Math.round((delta / prevPunches) * 100) : 0;
      if (pct > 10) improved.push({ name: student.name, pct, delta });
      else if (pct < -10) regressed.push({ name: student.name, pct, delta });
    }

    // New milestones this week
    const weekMilestones = (student.milestones || []).filter(m => new Date(m.date) >= weekAgo);
    for (const m of weekMilestones) {
      newMilestones.push({ name: student.name, milestone: m.description });
    }

    // Active flags
    const flags = student.flags || [];
    if (flags.length > 0) {
      flagged.push({ name: student.name, flags: flags.map(f => f.type.replace(/_/g, ' ')) });
    }

    // Absent (registered but no session in 7+ days)
    const lastSessionDate = sessions.length > 0 ? sessions[sessions.length - 1].date : student.created;
    const daysSinceLast = daysSince(lastSessionDate);
    if (daysSinceLast >= 7 && recentSessions.length === 0) {
      absent.push({ name: student.name, days: daysSinceLast });
    }
  }

  // Build digest message
  let msg = `👁 *Weekly Gym Digest*\n`;
  msg += `_${weekAgo.toLocaleDateString()} — ${now.toLocaleDateString()}_\n\n`;

  // Summary stats
  msg += `*This Week:* ${totalSessionsThisWeek} sessions · ${totalPunchesThisWeek} punches · ${students.length} students\n\n`;

  // Active students
  if (active.length > 0) {
    msg += '*Active:*\n';
    active.sort((a, b) => b.sessions - a.sessions);
    for (const s of active) {
      msg += `  ${s.name}: ${s.sessions} session${s.sessions > 1 ? 's' : ''} · ${s.punches} punches · ${s.steps} steps\n`;
    }
    msg += '\n';
  }

  // Improvements
  if (improved.length > 0) {
    msg += '*Improving:*\n';
    for (const s of improved) {
      msg += `  📈 ${s.name}: +${s.pct}% punches vs last week\n`;
    }
    msg += '\n';
  }

  // Regressions
  if (regressed.length > 0) {
    msg += '*Dropping:*\n';
    for (const s of regressed) {
      msg += `  📉 ${s.name}: ${s.pct}% punches vs last week\n`;
    }
    msg += '\n';
  }

  // Milestones
  if (newMilestones.length > 0) {
    msg += '*Milestones:*\n';
    for (const m of newMilestones) {
      msg += `  🏆 ${m.name}: ${m.milestone}\n`;
    }
    msg += '\n';
  }

  // Flags
  if (flagged.length > 0) {
    msg += '*Needs Work:*\n';
    for (const s of flagged) {
      msg += `  ⚠️ ${s.name}: ${s.flags.join(', ')}\n`;
    }
    msg += '\n';
  }

  // Absent
  if (absent.length > 0) {
    msg += '*Missing (7+ days):*\n';
    for (const s of absent) {
      msg += `  💤 ${s.name}: ${s.days} days since last session\n`;
    }
    msg += '\n';
  }

  // No activity
  if (active.length === 0) {
    msg += '_No sessions tracked this week._\n';
  }

  return msg;
}

export default { generateDigest };
