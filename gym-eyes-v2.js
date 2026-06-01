// gym-eyes-v2.js — Bridge to MediaPipe detector + student profiles + drill engine
// ESM module. Replaces old YOLO-based gym-eyes.js for Telegram integration.

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';

const HOME = process.env.HOME;
const GYM_EYES_DIR = path.join(HOME, 'basic-reflex', 'gym-eyes');
const DETECTOR = path.join(GYM_EYES_DIR, 'detector.py');
const STUDENT_PROFILES = path.join(GYM_EYES_DIR, 'student_profiles.py');
const DRILL_ENGINE = path.join(GYM_EYES_DIR, 'drill_engine.py');
const FIGHT_LAB = path.join(GYM_EYES_DIR, 'fight_lab.py');
const SESSIONS_DIR = path.join(GYM_EYES_DIR, 'sessions');
const STUDENTS_DIR = path.join(GYM_EYES_DIR, 'students');
const PYTHON = 'python3';

// ── Caption Parser ──────────────────────────────────────────────────────────
// Parses "Sarah round 1 bag work" → { name: "Sarah", round: 1, type: "bag work" }

const SESSION_TYPES = ['bag work', 'bagwork', 'pad work', 'padwork', 'shadow', 'shadowboxing', 'sparring', 'drills', 'class', 'mitts'];

export function parseCaption(caption) {
  if (!caption) return null;

  const text = caption.trim();
  const result = { name: null, round: null, type: null };

  // Extract round number: "round 1", "r1", "rd 1", "round1"
  const roundMatch = text.match(/(?:round|r|rd)\s*(\d+)/i);
  if (roundMatch) result.round = parseInt(roundMatch[1]);

  // Extract session type
  for (const st of SESSION_TYPES) {
    if (text.toLowerCase().includes(st)) {
      result.type = st.replace(/([a-z])(work)$/i, '$1 $2'); // normalize "bagwork" → "bag work"
      break;
    }
  }

  // Extract name: first word(s) before "round" or session type keywords
  let nameEnd = text.length;
  if (roundMatch) nameEnd = Math.min(nameEnd, text.indexOf(roundMatch[0]));
  for (const st of SESSION_TYPES) {
    const idx = text.toLowerCase().indexOf(st);
    if (idx >= 0) nameEnd = Math.min(nameEnd, idx);
  }

  const nameCandidate = text.slice(0, nameEnd).trim();
  if (nameCandidate && nameCandidate.length > 0 && nameCandidate.length < 40) {
    result.name = nameCandidate;
  }

  if (!result.type) result.type = 'class';

  return result.name ? result : null;
}

// ── Detector Runner ─────────────────────────────────────────────────────────

/**
 * Run MediaPipe detector on video, return session JSON path
 */
export function runDetector(videoPath, profile = 'solo') {
  // Homework loop is single-person footage (student films themselves), so default
  // to the 'solo' detection profile — a low velocity floor that catches slow,
  // controlled technique punches. 'sparring' (fast, two-fighter) silently reads 0
  // on technique/bag footage. Pass profile='sparring' for two-fighter clips.
  return new Promise((resolve, reject) => {
    execFile(PYTHON, [DETECTOR, '--video', videoPath, '--no-display', '--profile', profile], {
      timeout: 600000, // 10 min
      cwd: GYM_EYES_DIR,
      env: { ...process.env }
    }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`Detector failed: ${(stderr || err.message).slice(0, 300)}`));

      // Find saved session file from stdout
      const match = stdout.match(/Session saved: (.+\.json)/);
      if (match) return resolve(match[1].trim());

      // Fallback: find most recent session file
      try {
        const files = fs.readdirSync(SESSIONS_DIR)
          .filter(f => f.startsWith('session-') && f.endsWith('.json'))
          .sort()
          .reverse();
        if (files.length > 0) {
          return resolve(path.join(SESSIONS_DIR, files[0]));
        }
      } catch {}

      reject(new Error('No session file generated'));
    });
  });
}

// ── Student Profile Operations ──────────────────────────────────────────────

function runPython(script, args) {
  return new Promise((resolve, reject) => {
    execFile(PYTHON, [script, ...args], {
      timeout: 30000,
      cwd: GYM_EYES_DIR
    }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).slice(0, 300)));
      resolve(stdout);
    });
  });
}

export function studentExists(name) {
  const safeName = name.toLowerCase().replace(/ /g, '-');
  return fs.existsSync(path.join(STUDENTS_DIR, `${safeName}.json`));
}

export function loadStudent(name) {
  const safeName = name.toLowerCase().replace(/ /g, '-');
  const profilePath = path.join(STUDENTS_DIR, `${safeName}.json`);
  if (!fs.existsSync(profilePath)) return null;
  return JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
}

export async function createStudent(name, level = 'beginner', stance = 'orthodox') {
  return runPython(STUDENT_PROFILES, ['create', '--name', name, '--level', level, '--stance', stance]);
}

export async function importSession(name, sessionPath, fighterLabel) {
  const args = ['import', '--name', name, '--session', sessionPath];
  if (fighterLabel) args.push('--fighter-label', fighterLabel);
  return runPython(STUDENT_PROFILES, args);
}

export async function autoAssignDrills(name) {
  return runPython(DRILL_ENGINE, ['assign', '--name', name]);
}

// ── Fight Lab ───────────────────────────────────────────────────────────────

export function runFightLab(videoPath, fighter1, fighter2, rounds = 1) {
  return new Promise((resolve, reject) => {
    const args = [FIGHT_LAB, '--video', videoPath, '--fighter1', fighter1, '--fighter2', fighter2];
    if (rounds > 1) args.push('--rounds', String(rounds));

    execFile(PYTHON, args, {
      timeout: 600000,
      cwd: GYM_EYES_DIR,
      env: { ...process.env }
    }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`Fight Lab failed: ${(stderr || err.message).slice(0, 300)}`));

      // Find session file
      const match = stdout.match(/Session saved: (.+\.json)/);
      if (match) return resolve(match[1].trim());

      // Fallback
      try {
        const files = fs.readdirSync(SESSIONS_DIR)
          .filter(f => f.startsWith('session-') && f.endsWith('.json'))
          .sort()
          .reverse();
        if (files.length > 0) return resolve(path.join(SESSIONS_DIR, files[0]));
      } catch {}

      reject(new Error('No session file generated'));
    });
  });
}

// ── Telegram Formatting ─────────────────────────────────────────────────────

export function formatSessionTelegram(sessionData, studentName) {
  const fighters = sessionData.fighters || [];
  if (fighters.length === 0) return '👁 No fighter data detected.';

  let msg = '👁 *Gym Eyes Analysis*\n\n';

  for (const f of fighters) {
    const label = studentName || f.label || 'Fighter';
    msg += `*${label}*\n`;
    msg += `  Total punches: ${f.total}\n`;
    msg += `  Jab: ${f.jab} · Cross: ${f.cross} · Hook: ${f.hook}\n`;

    const fw = f.footwork || {};
    if (fw.total_steps > 0) {
      msg += `  Footwork: ${fw.total_steps} steps\n`;
      const st = fw.step_types || {};
      const types = Object.entries(st).filter(([_, v]) => v > 0).map(([k, v]) => `${k}:${v}`);
      if (types.length) msg += `    ${types.join(' · ')}\n`;
    }

    if (fw.flat_footed_alerts > 0) msg += `  Flat-footed alerts: ${fw.flat_footed_alerts}\n`;
    if (fw.stance_type) msg += `  Stance: ${fw.stance_type}\n`;
    msg += '\n';
  }

  return msg;
}

export function formatStudentProgressTelegram(profile) {
  if (!profile) return '';

  const cum = profile.cumulative;
  const sessions = profile.sessions || [];
  let msg = '';

  // Session count + trend
  msg += `*Progress (${cum.total_sessions} sessions):*\n`;
  msg += `  Lifetime punches: ${cum.total_punches}\n`;
  msg += `  Lifetime steps: ${cum.total_steps}\n`;

  // Compare last 2 sessions
  if (sessions.length >= 2) {
    const last = sessions[sessions.length - 1];
    const prev = sessions[sessions.length - 2];
    const punchDelta = last.punches.total - prev.punches.total;
    const arrow = punchDelta > 0 ? '📈' : punchDelta < 0 ? '📉' : '➡️';
    msg += `  vs last session: ${arrow} ${punchDelta > 0 ? '+' : ''}${punchDelta} punches\n`;
  }

  // Flags
  const flags = profile.flags || [];
  if (flags.length > 0) {
    msg += '\n*Flags:*\n';
    for (const flag of flags.slice(0, 3)) {
      const icon = flag.severity === 'high' ? '🔴' : '🟡';
      msg += `  ${icon} ${flag.type.replace(/_/g, ' ')}: ${flag.suggested_drill || ''}\n`;
    }
  }

  // Recent milestones
  const milestones = profile.milestones || [];
  if (milestones.length > 0) {
    const recent = milestones.slice(-2);
    msg += '\n*Milestones:*\n';
    for (const m of recent) {
      msg += `  🏆 ${m.description}\n`;
    }
  }

  return msg;
}

export function formatDrillsTelegram(profile) {
  if (!profile) return '';

  const drills = profile.drill_assignments || [];
  const active = drills.filter(d => d.status === 'active');
  if (active.length === 0) return '';

  let msg = '\n*Assigned Drills:*\n';
  for (const d of active) {
    const scores = d.scores || [];
    const progress = scores.length > 0 ? ` (best: ${Math.max(...scores.map(s => s.score))}/10)` : '';
    msg += `  📋 ${d.drill_id.replace(/-/g, ' ')}${progress}\n`;
  }

  return msg;
}

export function formatStatusTelegram() {
  // List recent sessions + students
  let msg = '👁 *Gym Eyes v2 — MediaPipe*\n\n';

  // Recent sessions
  try {
    const sessions = fs.readdirSync(SESSIONS_DIR)
      .filter(f => f.startsWith('session-') && f.endsWith('.json'))
      .sort().reverse().slice(0, 5);

    if (sessions.length > 0) {
      msg += `*Recent sessions (${sessions.length}):*\n`;
      for (const s of sessions) {
        msg += `  📹 \`${s}\`\n`;
      }
    } else {
      msg += 'No sessions yet.\n';
    }
  } catch { msg += 'No sessions yet.\n'; }

  msg += '\n';

  // Students
  try {
    const students = fs.readdirSync(STUDENTS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
    if (students.length > 0) {
      msg += `*Students (${students.length}):* ${students.join(', ')}\n`;
    }
  } catch {}

  msg += `\n*Commands:*
\`/eyes\` — status
\`/eyes analyze\` — reply to video
\`/eyes last\` — last session
\`/eyes student [name]\` — student profile
\`/students\` — list all students
\`/drill [name]\` — active drills
\`/drill assign [name]\` — auto-assign drills
\`/drill score [name] [drill] [1-10]\` — score drill
\`/note [name] [text]\` — add coach note
\`/analyze [f1] vs [f2]\` — Fight Lab (reply to video)

*Student homework:* send video with caption:
\`Sarah round 1 bag work\``;

  return msg;
}

// ── List Recent Sessions ────────────────────────────────────────────────────

export function listAnalyses(limit = 10) {
  try {
    return fs.readdirSync(SESSIONS_DIR)
      .filter(f => f.startsWith('session-') && f.endsWith('.json'))
      .map(f => {
        const stats = fs.statSync(path.join(SESSIONS_DIR, f));
        return { name: f, path: path.join(SESSIONS_DIR, f), size: stats.size, modified: stats.mtime };
      })
      .sort((a, b) => b.modified - a.modified)
      .slice(0, limit);
  } catch { return []; }
}

export async function scoreDrill(name, drillId, score) {
  return runPython(DRILL_ENGINE, ['score', '--name', name, '--drill', drillId, '--score', String(score)]);
}

export async function addCoachNote(name, note) {
  return runPython(STUDENT_PROFILES, ['note', '--name', name, '--note', note]);
}

export function listStudents() {
  try {
    return fs.readdirSync(STUDENTS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const profile = JSON.parse(fs.readFileSync(path.join(STUDENTS_DIR, f), 'utf-8'));
        return {
          name: profile.name,
          level: profile.level,
          sessions: profile.cumulative?.total_sessions || 0,
          punches: profile.cumulative?.total_punches || 0,
          flags: (profile.flags || []).length,
        };
      });
  } catch { return []; }
}

export function formatStudentListTelegram() {
  const students = listStudents();
  if (students.length === 0) return '👁 No students yet. Send a video with caption to create one.';

  let msg = `👁 *Students (${students.length}):*\n\n`;
  for (const s of students) {
    const flagIcon = s.flags > 0 ? ` ⚠️${s.flags}` : '';
    msg += `*${s.name}* — ${s.level}, ${s.sessions} sessions, ${s.punches} punches${flagIcon}\n`;
  }
  return msg;
}

export default {
  parseCaption,
  runDetector,
  runFightLab,
  studentExists,
  loadStudent,
  createStudent,
  importSession,
  autoAssignDrills,
  scoreDrill,
  addCoachNote,
  listStudents,
  formatSessionTelegram,
  formatStudentProgressTelegram,
  formatDrillsTelegram,
  formatStatusTelegram,
  formatStudentListTelegram,
  listAnalyses,
};
