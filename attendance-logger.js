// attendance-logger.js — Auto-attendance from camera footage
// ESM module. Imported by intake-watcher.js and telegram-bot.js.
// Runs face recognition on video, logs attendance to SQLite.

import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import Database from 'better-sqlite3';
import { updateProgressFromAttendance } from './curriculum-tracker.js';

const execFileAsync = promisify(execFile);

const HOME = process.env.HOME;
const PYTHON = path.join(HOME, 'cathedral-venv', 'bin', 'python3');
const SCRIPT = path.join(HOME, 'Cathedral', 'face-registry.py');
const DB_PATH = path.join(HOME, 'nanoclaw', 'vortex_data', 'metrics.db');

// ── Init DB ─────────────────────────────────────────────────────────────────

function initDb() {
  const db = new Database(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_name TEXT NOT NULL,
      date TEXT NOT NULL,
      class_time TEXT,
      duration_minutes INTEGER,
      session_type TEXT,
      video_file TEXT,
      confidence REAL,
      logged_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_attendance_member ON attendance(member_name);
    CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
  `);
  db.close();
}

initDb();

// ── Scan Video for Attendance ───────────────────────────────────────────────

export async function scanVideoAttendance(videoPath, sessionType, durationMinutes) {
  try {
    const { stdout } = await execFileAsync(
      PYTHON, [SCRIPT, 'attendance', videoPath, '5', '30'],
      { timeout: 120000, env: { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: '1' } }
    );
    const result = JSON.parse(stdout.trim());

    if (result.status !== 'ok' || !result.attendees?.length) {
      return { status: 'ok', attendees: [], message: result.message || 'No faces matched' };
    }

    // Log each attendee
    const date = new Date().toISOString().split('T')[0];
    const classTime = new Date().toTimeString().split(' ')[0].slice(0, 5);
    const videoFile = path.basename(videoPath);

    const db = new Database(DB_PATH);
    const insert = db.prepare(`
      INSERT INTO attendance (member_name, date, class_time, duration_minutes, session_type, video_file, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // Avoid duplicate logging for same member + date + session type
    const checkDup = db.prepare(
      'SELECT id FROM attendance WHERE member_name = ? AND date = ? AND session_type = ? AND video_file = ?'
    );

    const logged = [];
    const progressUpdates = [];
    for (const attendee of result.attendees) {
      const existing = checkDup.get(attendee.name, date, sessionType, videoFile);
      if (!existing) {
        insert.run(attendee.name, date, classTime, durationMinutes || 0, sessionType, videoFile, attendee.confidence);
        logged.push(attendee);

        // Update curriculum progress
        try {
          const update = updateProgressFromAttendance(attendee.name, sessionType, date);
          if (update?.ready_to_advance) {
            progressUpdates.push(update);
          }
        } catch {}
      }
    }
    db.close();

    return {
      status: 'ok',
      attendees: logged,
      duplicates_skipped: result.attendees.length - logged.length,
      ready_to_advance: progressUpdates
    };

  } catch (e) {
    return { status: 'error', message: e.message.slice(0, 200) };
  }
}

// ── Query Attendance ────────────────────────────────────────────────────────

export function getMemberAttendance(name, days = 30) {
  const db = new Database(DB_PATH);
  const rows = db.prepare(`
    SELECT date, class_time, duration_minutes, session_type, confidence
    FROM attendance
    WHERE member_name = ? AND date >= date('now', ?)
    ORDER BY date DESC, class_time DESC
  `).all(name, `-${days} days`);

  const total = db.prepare(
    'SELECT COUNT(*) as count FROM attendance WHERE member_name = ?'
  ).get(name);

  const thisMonth = db.prepare(`
    SELECT COUNT(*) as count FROM attendance
    WHERE member_name = ? AND date >= date('now', 'start of month')
  `).get(name);

  db.close();
  return {
    name,
    sessions_last_n_days: rows.length,
    sessions_total: total.count,
    sessions_this_month: thisMonth.count,
    recent: rows.slice(0, 10),
    avg_per_week: days > 0 ? Math.round(rows.length / (days / 7) * 10) / 10 : 0
  };
}

export function getAttendanceSummary(days = 7) {
  const db = new Database(DB_PATH);

  const total = db.prepare(`
    SELECT COUNT(DISTINCT member_name) as members, COUNT(*) as sessions
    FROM attendance WHERE date >= date('now', ?)
  `).get(`-${days} days`);

  const byMember = db.prepare(`
    SELECT member_name, COUNT(*) as sessions,
      MAX(date) as last_seen, AVG(confidence) as avg_confidence
    FROM attendance WHERE date >= date('now', ?)
    GROUP BY member_name ORDER BY sessions DESC
  `).all(`-${days} days`);

  const byType = db.prepare(`
    SELECT session_type, COUNT(*) as count
    FROM attendance WHERE date >= date('now', ?)
    GROUP BY session_type ORDER BY count DESC
  `).all(`-${days} days`);

  // Members not seen in last N days who have attended before
  const absent = db.prepare(`
    SELECT member_name, MAX(date) as last_seen, COUNT(*) as total_sessions
    FROM attendance
    WHERE member_name NOT IN (
      SELECT DISTINCT member_name FROM attendance WHERE date >= date('now', ?)
    )
    GROUP BY member_name
    ORDER BY last_seen DESC
  `).all(`-${days} days`);

  db.close();

  return {
    period_days: days,
    unique_members: total.members,
    total_sessions: total.sessions,
    by_member: byMember,
    by_type: byType,
    absent: absent.slice(0, 10)
  };
}

// ── Telegram Formatting ─────────────────────────────────────────────────────

export function formatAttendanceTelegram(name) {
  const data = getMemberAttendance(name);
  if (data.sessions_total === 0) return `No attendance records for *${name}*.`;

  let msg = `*${name} — Attendance*\n\n`;
  msg += `Total: ${data.sessions_total} sessions\n`;
  msg += `This month: ${data.sessions_this_month}\n`;
  msg += `Last 30 days: ${data.sessions_last_n_days} (${data.avg_per_week}/week)\n\n`;

  if (data.recent.length > 0) {
    msg += '*Recent:*\n';
    for (const r of data.recent) {
      msg += `  ${r.date} ${r.class_time} — ${r.session_type} (${r.duration_minutes}min)\n`;
    }
  }
  return msg;
}

export function formatSummaryTelegram(days = 7) {
  const data = getAttendanceSummary(days);

  let msg = `*Attendance — Last ${days} days*\n\n`;
  msg += `${data.unique_members} members, ${data.total_sessions} sessions\n\n`;

  if (data.by_member.length > 0) {
    msg += '*Active:*\n';
    for (const m of data.by_member) {
      msg += `  ${m.member_name}: ${m.sessions}x (last ${m.last_seen})\n`;
    }
    msg += '\n';
  }

  if (data.by_type.length > 0) {
    msg += '*By Type:*\n';
    for (const t of data.by_type) {
      msg += `  ${t.session_type}: ${t.count}\n`;
    }
    msg += '\n';
  }

  if (data.absent.length > 0) {
    msg += '*Not seen recently:*\n';
    for (const a of data.absent) {
      msg += `  ${a.member_name}: last ${a.last_seen} (${a.total_sessions} total)\n`;
    }
  }

  return msg;
}

export default {
  scanVideoAttendance,
  getMemberAttendance,
  getAttendanceSummary,
  formatAttendanceTelegram,
  formatSummaryTelegram
};
