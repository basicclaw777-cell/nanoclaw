// curriculum-tracker.js — Per-member curriculum progression
// ESM module. Reads canonical curriculum, maps attendance to blocks.
// Tracks progress through 10-block Basic Reflex system.

import Database from 'better-sqlite3';
import path from 'path';

const HOME = process.env.HOME;
const DB_PATH = path.join(HOME, 'nanoclaw', 'vortex_data', 'metrics.db');

// ── Canonical 10-Block Curriculum ───────────────────────────────────────────
// Source: ~/cathedral-vault/10_Agents/kit/decisions/canonical-curriculum-2026-05-03.md

const BLOCKS = [
  { num: 1,  name: 'Foundation',  sessions_to_advance: 4,  focus: 'Guard position, mindset',          session_types: ['class', 'padwork', 'technique'] },
  { num: 2,  name: 'Level',       sessions_to_advance: 6,  focus: 'Footwork fundamentals',             session_types: ['class', 'padwork', 'technique'] },
  { num: 3,  name: 'Angle',       sessions_to_advance: 8,  focus: 'Straight punches + turns',          session_types: ['class', 'padwork', 'technique'] },
  { num: 4,  name: 'Inside',      sessions_to_advance: 8,  focus: 'Hooks, crosses, body work',         session_types: ['class', 'padwork', 'technique'] },
  { num: 5,  name: 'Rhythm',      sessions_to_advance: 10, focus: 'Timing, broken rhythm',             session_types: ['class', 'padwork', 'technique', 'sparring'] },
  { num: 6,  name: 'Counter',     sessions_to_advance: 10, focus: 'Defense-to-offense integration',    session_types: ['class', 'padwork', 'technique', 'sparring'] },
  { num: 7,  name: 'Pressure',    sessions_to_advance: 12, focus: 'Technique under fatigue',           session_types: ['class', 'padwork', 'sparring'] },
  { num: 8,  name: 'Escape',      sessions_to_advance: 12, focus: 'Ring craft, rope/corner escape',    session_types: ['class', 'sparring'] },
  { num: 9,  name: 'Control',     sessions_to_advance: 15, focus: 'Strategy, opponent reading',        session_types: ['sparring'] },
  { num: 10, name: 'Arena',       sessions_to_advance: 0,  focus: 'Full integration, independence',    session_types: ['sparring'] }
];

// Session types that count toward curriculum progress
const CURRICULUM_SESSION_TYPES = new Set(['class', 'padwork', 'technique', 'sparring']);

// ── Init DB ─────────────────────────────────────────────────────────────────

function initDb() {
  const db = new Database(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS member_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_name TEXT NOT NULL UNIQUE,
      current_block INTEGER DEFAULT 1,
      sessions_at_block INTEGER DEFAULT 0,
      mastery_status TEXT DEFAULT 'in_progress',
      enrolled_date TEXT DEFAULT (date('now')),
      last_session_date TEXT,
      notes TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS block_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_name TEXT NOT NULL,
      block_number INTEGER NOT NULL,
      started_date TEXT,
      completed_date TEXT,
      sessions_taken INTEGER,
      advanced_by TEXT DEFAULT 'auto'
    )
  `);
  db.close();
}

initDb();

// ── Member Progress ─────────────────────────────────────────────────────────

export function getMemberProgress(name) {
  const db = new Database(DB_PATH);

  let progress = db.prepare('SELECT * FROM member_progress WHERE member_name = ?').get(name);

  if (!progress) {
    // Auto-create on first query
    db.prepare(`
      INSERT INTO member_progress (member_name, current_block, sessions_at_block)
      VALUES (?, 1, 0)
    `).run(name);
    progress = db.prepare('SELECT * FROM member_progress WHERE member_name = ?').get(name);
  }

  const block = BLOCKS[progress.current_block - 1] || BLOCKS[0];
  const history = db.prepare(
    'SELECT * FROM block_history WHERE member_name = ? ORDER BY block_number'
  ).all(name);

  // Count curriculum-eligible sessions from attendance
  const totalSessions = db.prepare(
    'SELECT COUNT(*) as count FROM attendance WHERE member_name = ? AND session_type IN (?, ?, ?, ?)'
  ).get(name, 'class', 'padwork', 'technique', 'sparring');

  // Sessions at current block from attendance (since last advancement)
  const lastAdvance = history.length > 0 ? history[history.length - 1].completed_date : progress.enrolled_date;
  const sessionsAtBlock = db.prepare(`
    SELECT COUNT(*) as count FROM attendance
    WHERE member_name = ? AND session_type IN (?, ?, ?, ?)
    AND date >= ?
  `).get(name, ...['class', 'padwork', 'technique', 'sparring'], lastAdvance || '2020-01-01');

  db.close();

  const readyToAdvance = block.sessions_to_advance > 0 && sessionsAtBlock.count >= block.sessions_to_advance;

  return {
    name,
    current_block: progress.current_block,
    block_name: block.name,
    block_focus: block.focus,
    sessions_at_block: sessionsAtBlock.count,
    sessions_to_advance: block.sessions_to_advance,
    progress_pct: block.sessions_to_advance > 0
      ? Math.min(100, Math.round(sessionsAtBlock.count / block.sessions_to_advance * 100))
      : 100,
    ready_to_advance: readyToAdvance,
    total_sessions: totalSessions.count,
    mastery_status: progress.mastery_status,
    last_session: progress.last_session_date,
    enrolled: progress.enrolled_date,
    history,
    eligible_session_types: block.session_types
  };
}

export function advanceMember(name, advancedBy = 'coach') {
  const db = new Database(DB_PATH);
  const progress = db.prepare('SELECT * FROM member_progress WHERE member_name = ?').get(name);
  if (!progress) {
    db.close();
    return { status: 'error', message: `Member ${name} not found` };
  }

  if (progress.current_block >= 10) {
    db.close();
    return { status: 'error', message: `${name} already at Block 10 (Arena)` };
  }

  const newBlock = progress.current_block + 1;

  // Log history
  db.prepare(`
    INSERT INTO block_history (member_name, block_number, started_date, completed_date, sessions_taken, advanced_by)
    VALUES (?, ?, ?, date('now'), ?, ?)
  `).run(name, progress.current_block, progress.enrolled_date, progress.sessions_at_block, advancedBy);

  // Advance
  db.prepare(`
    UPDATE member_progress SET current_block = ?, sessions_at_block = 0, updated_at = datetime('now')
    WHERE member_name = ?
  `).run(newBlock, name);

  db.close();

  const block = BLOCKS[newBlock - 1];
  return {
    status: 'ok',
    name,
    previous_block: progress.current_block,
    new_block: newBlock,
    block_name: block.name,
    block_focus: block.focus
  };
}

export function setMemberBlock(name, blockNum) {
  if (blockNum < 1 || blockNum > 10) return { status: 'error', message: 'Block must be 1-10' };

  const db = new Database(DB_PATH);
  const exists = db.prepare('SELECT id FROM member_progress WHERE member_name = ?').get(name);

  if (exists) {
    db.prepare('UPDATE member_progress SET current_block = ?, sessions_at_block = 0, updated_at = datetime(\'now\') WHERE member_name = ?').run(blockNum, name);
  } else {
    db.prepare('INSERT INTO member_progress (member_name, current_block, sessions_at_block) VALUES (?, ?, 0)').run(name, blockNum);
  }
  db.close();

  const block = BLOCKS[blockNum - 1];
  return { status: 'ok', name, block: blockNum, block_name: block.name };
}

// ── Update from Attendance ──────────────────────────────────────────────────

export function updateProgressFromAttendance(name, sessionType, date) {
  if (!CURRICULUM_SESSION_TYPES.has(sessionType)) return null;

  const db = new Database(DB_PATH);
  let progress = db.prepare('SELECT * FROM member_progress WHERE member_name = ?').get(name);

  if (!progress) {
    db.prepare('INSERT INTO member_progress (member_name, current_block, sessions_at_block) VALUES (?, 1, 0)').run(name);
    progress = db.prepare('SELECT * FROM member_progress WHERE member_name = ?').get(name);
  }

  const block = BLOCKS[progress.current_block - 1];

  // Check if this session type counts for current block
  if (!block.session_types.includes(sessionType)) {
    db.close();
    return { counted: false, reason: `${sessionType} doesn't count for Block ${block.num} (${block.name})` };
  }

  // Increment sessions at block
  db.prepare(`
    UPDATE member_progress SET sessions_at_block = sessions_at_block + 1,
    last_session_date = ?, updated_at = datetime('now')
    WHERE member_name = ?
  `).run(date, name);

  const newCount = progress.sessions_at_block + 1;
  const readyToAdvance = block.sessions_to_advance > 0 && newCount >= block.sessions_to_advance;

  db.close();

  return {
    counted: true,
    name,
    block: block.num,
    block_name: block.name,
    sessions_at_block: newCount,
    sessions_to_advance: block.sessions_to_advance,
    ready_to_advance: readyToAdvance
  };
}

// ── All Members Overview ────────────────────────────────────────────────────

export function getAllProgress() {
  const db = new Database(DB_PATH);
  const members = db.prepare('SELECT * FROM member_progress ORDER BY current_block DESC, member_name').all();
  db.close();

  return members.map(m => {
    const block = BLOCKS[m.current_block - 1] || BLOCKS[0];
    return {
      name: m.member_name,
      block: m.current_block,
      block_name: block.name,
      sessions: m.sessions_at_block,
      target: block.sessions_to_advance,
      pct: block.sessions_to_advance > 0 ? Math.min(100, Math.round(m.sessions_at_block / block.sessions_to_advance * 100)) : 100,
      last_session: m.last_session_date
    };
  });
}

// ── Telegram Formatting ─────────────────────────────────────────────────────

export function formatProgressTelegram(name) {
  const p = getMemberProgress(name);

  const bar = makeProgressBar(p.progress_pct);
  let msg = `*${name} — Curriculum Progress*\n\n`;
  msg += `*Block ${p.current_block}: ${p.block_name}*\n`;
  msg += `${p.block_focus}\n\n`;
  msg += `${bar} ${p.progress_pct}%\n`;
  msg += `Sessions: ${p.sessions_at_block}/${p.sessions_to_advance || '∞'}\n`;
  msg += `Total sessions: ${p.total_sessions}\n`;

  if (p.ready_to_advance) {
    msg += `\n*Ready to advance to Block ${p.current_block + 1}!*\n`;
    msg += `Use /advance ${name} when mastery confirmed.\n`;
  }

  msg += `\nEligible types: ${p.eligible_session_types.join(', ')}\n`;

  if (p.history.length > 0) {
    msg += '\n*Block History:*\n';
    for (const h of p.history) {
      msg += `  Block ${h.block_number}: ${h.sessions_taken} sessions (${h.completed_date})\n`;
    }
  }

  return msg;
}

export function formatAllProgressTelegram() {
  const all = getAllProgress();
  if (all.length === 0) return '*Curriculum*\n\nNo members tracked yet.\nMembers auto-enroll when attendance is logged.';

  let msg = `*Curriculum — ${all.length} Members*\n\n`;

  // Group by block
  const byBlock = {};
  for (const m of all) {
    if (!byBlock[m.block]) byBlock[m.block] = [];
    byBlock[m.block].push(m);
  }

  for (const [blockNum, members] of Object.entries(byBlock).sort((a, b) => Number(b[0]) - Number(a[0]))) {
    const block = BLOCKS[Number(blockNum) - 1];
    msg += `*Block ${blockNum} — ${block.name}:*\n`;
    for (const m of members) {
      const bar = makeProgressBar(m.pct, 8);
      msg += `  ${m.name} ${bar} ${m.sessions}/${m.target || '∞'}\n`;
    }
    msg += '\n';
  }

  return msg;
}

function makeProgressBar(pct, width = 10) {
  const filled = Math.round(pct / 100 * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

// ── Block Info ──────────────────────────────────────────────────────────────

export function getBlockInfo(num) {
  const block = BLOCKS[num - 1];
  if (!block) return null;

  let msg = `*Block ${block.num} — ${block.name}*\n\n`;
  msg += `${block.focus}\n`;
  msg += `Sessions to advance: ${block.sessions_to_advance || 'N/A (final block)'}\n`;
  msg += `Eligible session types: ${block.session_types.join(', ')}\n`;

  return msg;
}

export { BLOCKS };

export default {
  getMemberProgress,
  advanceMember,
  setMemberBlock,
  updateProgressFromAttendance,
  getAllProgress,
  formatProgressTelegram,
  formatAllProgressTelegram,
  getBlockInfo,
  BLOCKS
};
