// client-proxy.js — Client Proxy Layer (Gym Eyes student/parent access)
// ESM module
//
// The Cathedral serves Paul's students directly. This layer owns:
//   1. Student profiles + session records        (~/nanoclaw/gym-eyes-students.json)
//   2. Scoped access tokens (student / parent)   (stored on the student profile)
//   3. Parent flag/question → Paul-resolves workflow
//   4. Decision records on every coaching output (~/nanoclaw/gym-eyes-decisions.json)
//
// AUTHORIZATION LAW (spec 5a v2 — never weaken):
//   - Students see RECOMMENDATIONS ONLY. Never rules, evidence chains,
//     confidence scores, or internal engine state.
//   - Parents see a read-only progress subset + their own flags.
//   - Paul sees everything. The system informs, Paul governs.
//   - The system NEVER auto-resolves a dispute.
//
// Coaching engine plug: coaching-engine.js (scaffold 5b) is imported lazily.
// If it loads and has approved rules, logSession runs diagnose() and folds the
// result into the decision record. If it is unavailable or silent, the decision
// record is still written (rulesApplied: []) — the audit trail never skips.
//
// Spec: ~/nanoclaw/scaffolds/5a-client-proxy.md

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const HOME = process.env.HOME;
const STUDENTS_PATH = path.join(HOME, 'nanoclaw', 'gym-eyes-students.json');
const DECISIONS_PATH = path.join(HOME, 'nanoclaw', 'gym-eyes-decisions.json');

function loadJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return []; } }
function saveJSON(p, d) { fs.writeFileSync(p, JSON.stringify(d, null, 2)); }
function today() { return new Date().toISOString().split('T')[0]; }

// Default scoped permissions per token type (spec 5a)
const DEFAULT_PERMISSIONS = {
  student: ['submit_homework', 'view_own_progress'],
  parent: ['view_progress', 'question_decision']
};

// ── Coaching engine (lazy plug — 5b) ────────────────────────────────────

let _engine; // undefined = not tried, null = unavailable, object = loaded
async function getEngine() {
  if (_engine !== undefined) return _engine;
  try { _engine = await import('./coaching-engine.js'); }
  catch { _engine = null; }
  return _engine;
}

// ── Student Management ───────────────────────────────────────────────────

function nextStudentId(students) {
  // sequential: student_001, student_002 ... (spec data shape)
  const max = students.reduce((m, s) => {
    const n = parseInt(String(s.id || '').replace('student_', ''), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `student_${String(max + 1).padStart(3, '0')}`;
}

/**
 * Register a new student. Paul only (enforced at the route/command layer).
 * @returns {object} the new student profile
 */
export function registerStudent(name) {
  if (!name || !String(name).trim()) throw new Error('registerStudent: name required');
  const students = loadJSON(STUDENTS_PATH);
  const profile = {
    id: nextStudentId(students),
    name: String(name).trim(),
    startDate: today(),
    level: 'beginner',
    sessions: [],
    strengths: [],   // recent entries double as milestones in the parent/student views
    gaps: [],        // gaps[0] doubles as "next goal"
    currentBlock: 1,
    notes: '',       // Paul's internal notes — NEVER exposed to student/parent views
    accessTokens: [],
    flags: [],
    active: true
  };
  students.push(profile);
  saveJSON(STUDENTS_PATH, students);
  return profile;
}

/**
 * Soft delete — profile and history are kept, access stops.
 * All access tokens are deactivated too (a deactivated student's links go dead).
 */
export function deactivateStudent(id) {
  const students = loadJSON(STUDENTS_PATH);
  const s = students.find(x => x.id === id);
  if (!s) return null;
  s.active = false;
  s.deactivatedDate = today();
  for (const t of (s.accessTokens || [])) t.active = false;
  saveJSON(STUDENTS_PATH, students);
  return s;
}

/** Full profile (Paul-side use — includes tokens, notes, flags). */
export function getStudent(id) {
  return loadJSON(STUDENTS_PATH).find(s => s.id === id) || null;
}

/** Find a student by (case-insensitive) name — for Telegram commands. */
export function findStudentByName(name) {
  const n = String(name || '').trim().toLowerCase();
  return loadJSON(STUDENTS_PATH).find(s => s.name.toLowerCase() === n) || null;
}

// Trend from the last few sessions' metrics: improving / steady / declining / insufficient_data
function computeTrend(sessions) {
  const withMetrics = (sessions || []).filter(s => s.metrics && typeof s.metrics.comboAccuracy === 'number');
  if (withMetrics.length < 3) return 'insufficient_data';
  const last = withMetrics.slice(-3).map(s => s.metrics.comboAccuracy);
  const delta = last[2] - last[0];
  if (delta > 0.03) return 'improving';
  if (delta < -0.03) return 'declining';
  return 'steady';
}

/**
 * All students with trend indicators + pending flag counts (Paul's list view).
 * @param {boolean} includeInactive — default false
 */
export function getAllStudents(includeInactive = false) {
  return loadJSON(STUDENTS_PATH)
    .filter(s => includeInactive || s.active !== false)
    .map(s => ({
      id: s.id,
      name: s.name,
      level: s.level,
      currentBlock: s.currentBlock,
      totalSessions: (s.sessions || []).length,
      lastSession: s.sessions?.length ? s.sessions[s.sessions.length - 1].date : null,
      trend: computeTrend(s.sessions),
      pendingFlags: (s.flags || []).filter(f => f.status === 'pending').length,
      activeTokens: (s.accessTokens || []).filter(t => t.active).length,
      active: s.active !== false
    }));
}

/**
 * Log a session for a student. Auto-creates a decision record (the audit trail
 * never skips). If the coaching engine (5b) is loaded and has approved rules,
 * its diagnose() output is folded in; otherwise the record is written with
 * rulesApplied: [] and coaching notes from whatever the caller supplied
 * (e.g. virtual_tutor.py scoring, homework_processor.py).
 *
 * @param {string} studentId
 * @param {object} sessionData — { date?, type, metrics, coachingNotes?, videoPath?, block?, tags?, strengths?, gaps? }
 * @returns {object} { session, decision } or null if student not found
 */
export async function logSession(studentId, sessionData = {}) {
  const students = loadJSON(STUDENTS_PATH);
  const s = students.find(x => x.id === studentId);
  if (!s) return null;

  const session = {
    studentId: s.id,
    date: sessionData.date || today(),
    type: sessionData.type || 'class', // class | homework | assessment
    metrics: {
      punchCount: 0, comboAccuracy: 0.0, powerGrade: 'C',
      fatigueOnset: null, guardCoverage: null,
      ...(sessionData.metrics || {})
    },
    coachingNotes: sessionData.coachingNotes || [],
    videoPath: sessionData.videoPath || null,
    block: sessionData.block || s.currentBlock
  };
  s.sessions.push(session);

  // Optional profile updates riding on the session (strengths double as milestones)
  for (const st of (sessionData.strengths || [])) if (!s.strengths.includes(st)) s.strengths.push(st);
  for (const g of (sessionData.gaps || [])) if (!s.gaps.includes(g)) s.gaps.push(g);

  saveJSON(STUDENTS_PATH, students);

  // ── Decision record — every coaching output carries its trace ──────────
  let engineResult = null;
  const engine = await getEngine();
  if (engine && typeof engine.diagnose === 'function') {
    try {
      engineResult = engine.diagnose(
        { tags: sessionData.tags || [], metrics: session.metrics, notes: (session.coachingNotes || []).join(' ') },
        { id: s.id, name: s.name, level: s.level, currentBlock: s.currentBlock }
      );
    } catch { engineResult = null; } // engine failure never blocks the session log
  }

  const rulesApplied = engineResult?.decisionRecord?.rulesApplied || [];
  const confidenceScores = {};
  for (const r of rulesApplied) confidenceScores[r.ruleId] = r.confidence;

  const decision = {
    decisionId: `dec_${today().replace(/-/g, '')}_${Date.now()}`,
    studentId: s.id,
    date: session.date,
    type: 'coaching_recommendation',
    input: {
      sessionData: session,
      studentProfile: { id: s.id, name: s.name, level: s.level, currentBlock: s.currentBlock }
    },
    rulesApplied: rulesApplied.map(r => `${r.ruleId} v${r.version}`),
    confidenceScores,
    autonomyLevel: engineResult?.decisionRecord?.autonomyLevel || 'collect',
    engineDecisionId: engineResult?.decisionRecord?.decisionId || null, // link into coaching-decisions.json
    output: {
      diagnoses: engineResult ? engineResult.diagnoses.map(d => d.diagnosis) : [],
      // engine silent (unavailable OR no approved rules fired) → the caller's
      // coaching notes (virtual_tutor.py scoring etc.) are the recommendation
      prescriptions: (() => {
        const p = engineResult ? engineResult.diagnoses.map(d => d.prescription).filter(Boolean) : [];
        return p.length ? p : (session.coachingNotes || []);
      })()
    },
    humanOverride: null,
    overrideReason: null,
    overrideDate: null
  };
  const decisions = loadJSON(DECISIONS_PATH);
  decisions.push(decision);
  saveJSON(DECISIONS_PATH, decisions);

  return { session, decision };
}

/**
 * Session history with filters — { since, type, block }
 */
export function getStudentSessions(studentId, filters = {}) {
  const s = getStudent(studentId);
  if (!s) return null;
  let sessions = s.sessions || [];
  if (filters.since) sessions = sessions.filter(x => x.date >= filters.since);
  if (filters.type) sessions = sessions.filter(x => x.type === filters.type);
  if (filters.block) sessions = sessions.filter(x => x.block === filters.block);
  return sessions;
}

// ── Access Token System ──────────────────────────────────────────────────

/**
 * Generate a scoped access token for a student or parent. Paul only.
 * @param {string} type — 'student' | 'parent'
 * @param {string[]} [permissions] — defaults per type (spec 5a)
 */
export function generateToken(studentId, type, permissions) {
  if (!['student', 'parent'].includes(type)) throw new Error(`generateToken: type must be student|parent, got "${type}"`);
  const students = loadJSON(STUDENTS_PATH);
  const s = students.find(x => x.id === studentId);
  if (!s) return null;

  const token = {
    token: `stp_${crypto.randomBytes(16).toString('hex')}`,
    type,
    studentId: s.id,
    permissions: permissions && permissions.length ? permissions : [...DEFAULT_PERMISSIONS[type]],
    created: today(),
    createdBy: 'paul',
    active: true
  };
  s.accessTokens = s.accessTokens || [];
  s.accessTokens.push(token);
  saveJSON(STUDENTS_PATH, students);
  return token;
}

/**
 * Validate a token. A token is only good while BOTH it and its student are active.
 * @returns {object} { valid, studentId?, type?, permissions?, reason? }
 */
export function validateToken(token) {
  if (!token || !String(token).startsWith('stp_')) return { valid: false, reason: 'malformed token' };
  for (const s of loadJSON(STUDENTS_PATH)) {
    const t = (s.accessTokens || []).find(x => x.token === token);
    if (!t) continue;
    if (!t.active) return { valid: false, reason: 'token revoked' };
    if (s.active === false) return { valid: false, reason: 'student deactivated' };
    return { valid: true, studentId: s.id, type: t.type, permissions: t.permissions };
  }
  return { valid: false, reason: 'unknown token' };
}

/**
 * Revoke a token. Paul only. Deactivates, never deletes (revocations are audit data).
 */
export function revokeToken(studentId, token) {
  const students = loadJSON(STUDENTS_PATH);
  const s = students.find(x => x.id === studentId);
  if (!s) return null;
  const t = (s.accessTokens || []).find(x => x.token === token);
  if (!t) return null;
  t.active = false;
  t.revokedDate = today();
  saveJSON(STUDENTS_PATH, students);
  return t;
}

// ── Parent Interaction (flag → Paul resolves — NEVER auto-resolved) ─────

/**
 * Parent raises a question about a decision. Requires a valid token carrying
 * the 'question_decision' permission, scoped to this student.
 * The Telegram notification to Paul is wired at the bot layer (route/command wiring).
 * @returns {object} { ok, flag?, error? }
 */
export function flagDecision(studentId, question, token) {
  if (!question || !String(question).trim()) return { ok: false, error: 'question required' };
  const auth = validateToken(token);
  if (!auth.valid) return { ok: false, error: `unauthorized: ${auth.reason}` };
  if (auth.studentId !== studentId) return { ok: false, error: 'unauthorized: token is for a different student' };
  if (!auth.permissions.includes('question_decision')) return { ok: false, error: 'unauthorized: token cannot raise questions' };

  const students = loadJSON(STUDENTS_PATH);
  const s = students.find(x => x.id === studentId);
  if (!s) return { ok: false, error: 'student not found' };

  const flag = {
    flagId: `flag_${Date.now()}`,
    date: today(),
    question: String(question).trim(),
    raisedBy: auth.type,
    status: 'pending',
    response: null,
    respondedBy: null,
    respondedDate: null
  };
  s.flags = s.flags || [];
  s.flags.push(flag);
  saveJSON(STUDENTS_PATH, students);
  return { ok: true, flag, studentName: s.name };
}

/**
 * Paul responds to a parent question (confirm / modify / override — his words).
 * The response becomes visible on the parent progress page.
 */
export function respondToFlag(studentId, flagId, response) {
  const students = loadJSON(STUDENTS_PATH);
  const s = students.find(x => x.id === studentId);
  if (!s) return null;
  const flag = (s.flags || []).find(f => f.flagId === flagId);
  if (!flag) return null;
  flag.response = String(response || '').trim();
  flag.respondedBy = 'paul';
  flag.respondedDate = today();
  flag.status = 'resolved';
  saveJSON(STUDENTS_PATH, students);
  return flag;
}

/** All unresolved parent questions across all students (Paul's queue). */
export function getPendingFlags() {
  const out = [];
  for (const s of loadJSON(STUDENTS_PATH)) {
    for (const f of (s.flags || [])) {
      if (f.status === 'pending') out.push({ studentId: s.id, studentName: s.name, ...f });
    }
  }
  return out;
}

// ── Progress Views — THE AUTHORIZATION BOUNDARY ─────────────────────────
// Everything below builds sanitized subsets. Rules, evidence chains,
// confidence scores, engine internals, and Paul's notes NEVER cross this line.

// Recommendations only — strip every trace of rule/confidence/evidence.
function sanitizedRecommendations(studentId, limit = 5) {
  return loadJSON(DECISIONS_PATH)
    .filter(d => d.studentId === studentId && d.type === 'coaching_recommendation')
    .slice(-limit)
    .flatMap(d => d.output?.prescriptions || [])
    .filter(Boolean);
}

/**
 * Student view — own progress. Recommendations only; no rules, no evidence,
 * no confidence, no Paul-internal notes.
 */
export function getStudentProgress(studentId) {
  const s = getStudent(studentId);
  if (!s) return null;
  const sessions = s.sessions || [];
  return {
    studentId: s.id,
    studentName: s.name,
    currentLevel: s.level,
    currentBlock: s.currentBlock,
    totalSessions: sessions.length,
    recentMilestones: (s.strengths || []).slice(-3),
    assignedDrills: sanitizedRecommendations(s.id),
    recentSessions: sessions.slice(-5).map(x => ({
      date: x.date, type: x.type,
      // student sees their own numbers — numbers are theirs; the reasoning is not
      punchCount: x.metrics?.punchCount ?? null,
      comboAccuracy: x.metrics?.comboAccuracy ?? null,
      powerGrade: x.metrics?.powerGrade ?? null
    })),
    trend: computeTrend(sessions)
  };
}

/**
 * Parent view — read-only subset (spec 5a data shape) + their flags with
 * Paul's responses. No rules, no evidence, no confidence, no internal notes.
 */
export function getParentView(studentId) {
  const s = getStudent(studentId);
  if (!s) return null;
  return {
    studentId: s.id, // needed by the progress page to post flags
    studentName: s.name,
    totalSessions: (s.sessions || []).length,
    currentLevel: s.level,
    currentBlock: s.currentBlock,
    recentMilestones: (s.strengths || []).slice(-3),
    nextGoal: (s.gaps || [])[0] || null,
    trend: computeTrend(s.sessions),
    flags: (s.flags || []).map(f => ({
      flagId: f.flagId, date: f.date, question: f.question, status: f.status,
      response: f.response, respondedBy: f.respondedBy, respondedDate: f.respondedDate
    }))
  };
}

/**
 * Coach view — Paul sees EVERYTHING: full profile, sessions, tokens, flags,
 * decision records with rules + confidence, pending disputes.
 */
export function getCoachView(studentId) {
  const s = getStudent(studentId);
  if (!s) return null;
  return {
    profile: s,
    trend: computeTrend(s.sessions),
    decisions: getDecisionLog(studentId),
    pendingFlags: (s.flags || []).filter(f => f.status === 'pending')
  };
}

// ── Decision Records ─────────────────────────────────────────────────────

/**
 * Full audit trail for a student (or everything if no studentId). Paul only.
 */
export function getDecisionLog(studentId) {
  const log = loadJSON(DECISIONS_PATH);
  return studentId ? log.filter(d => d.studentId === studentId) : log;
}

/**
 * Paul overrides a decision. Logged on the record; if the record is linked to
 * a coaching-engine decision, the override is forwarded so rule confidence
 * takes the hit there too (trust is slow up, fast down).
 */
export async function overrideDecision(decisionId, override, reason) {
  const decisions = loadJSON(DECISIONS_PATH);
  const dec = decisions.find(d => d.decisionId === decisionId);
  if (!dec) return null;
  dec.humanOverride = override;
  dec.overrideReason = reason || null;
  dec.overrideDate = today();
  saveJSON(DECISIONS_PATH, decisions);

  if (dec.engineDecisionId) {
    const engine = await getEngine();
    if (engine && typeof engine.overrideDecision === 'function') {
      try {
        engine.overrideDecision(dec.engineDecisionId, override, reason);
        dec.engineOverrideSynced = true;
      } catch (e) {
        dec.engineOverrideSynced = false;
        dec.engineSyncError = e.message;
        saveJSON(DECISIONS_PATH, decisions);
      }
    }
  }
  return dec;
}

// ── CLI (node client-proxy.js <cmd> ...) — hands-on testing ─────────────

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(path.join(HOME, 'nanoclaw', 'client-proxy.js'));
if (isDirectRun) {
  const [cmd, a, b, c] = process.argv.slice(2);
  const show = x => console.log(JSON.stringify(x, null, 2));
  if (cmd === 'register') show(registerStudent(a));
  else if (cmd === 'students') show(getAllStudents(a === 'all'));
  else if (cmd === 'student') show(getStudent(a));
  else if (cmd === 'deactivate') show(deactivateStudent(a));
  else if (cmd === 'token') show(generateToken(a, b || 'student'));
  else if (cmd === 'validate') show(validateToken(a));
  else if (cmd === 'revoke') show(revokeToken(a, b));
  else if (cmd === 'session') show(await logSession(a, b ? JSON.parse(b) : {}));
  else if (cmd === 'sessions') show(getStudentSessions(a));
  else if (cmd === 'flag') show(flagDecision(a, b, c));
  else if (cmd === 'respond') show(respondToFlag(a, b, c));
  else if (cmd === 'flags') show(getPendingFlags());
  else if (cmd === 'progress') show(getStudentProgress(a));
  else if (cmd === 'parent') show(getParentView(a));
  else if (cmd === 'coach') show(getCoachView(a));
  else if (cmd === 'decisions') show(getDecisionLog(a));
  else if (cmd === 'override') show(await overrideDecision(a, b, c));
  else console.log('Commands: register <name> | students [all] | student <id> | deactivate <id> | token <id> <student|parent> | validate <tok> | revoke <id> <tok> | session <id> [json] | sessions <id> | flag <id> <question> <tok> | respond <id> <flagId> <text> | flags | progress <id> | parent <id> | coach <id> | decisions [id] | override <decId> <text> <reason>');
}
