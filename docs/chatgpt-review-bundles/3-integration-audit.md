# REVIEW PROMPT: Cathedral Integration Audit (System Pre-Mortem)

These five specifications are about to become production infrastructure.

Treat them as if you are reviewing a distributed operating system before deployment.

Assume each module is individually well designed. Your job is to find problems that only emerge when the modules interact.

Do not redesign the architecture unless absolutely necessary.

Assume this system has been running for two years and has become difficult to evolve. Explain why.

Prioritize: hidden coupling, failure propagation, authority boundaries, schema drift, operational bottlenecks, long-term maintainability

## 1. System Data Flow
Map every major data flow across all five modules. For each flow identify: origin, transformations, consumers, persistence layer, termination. Highlight: circular dependencies, duplicated storage, hidden write paths, modules acting as implicit databases.

## 2. Dependency Graph
Build the dependency graph. Identify: hard/soft/optional/runtime/startup dependencies. For every module answer: "If this module disappears today, what continues to function?"

## 3. Failure Propagation
Perform failure injection. Assume each module fails independently. Examples: Coach Paul unavailable, Agent Protocol unavailable, Vault unavailable, Local model unavailable, SQLite locked, Network partition. Describe: immediate failures, degraded behavior, recovery path, permanent data loss risk.

## 4. Authority & Trust Boundaries
Map every place authority changes. Examples: human->agent, parent->coach, agent->agent, local model->remote model. For every boundary identify: who grants authority, how verified, how revoked, how audited. Look for privilege escalation opportunities.

## 5. Schema Stability
Identify every shared object. Examples: Decision Record, Student State, Proposal, Authorization Token, Capability Token. For every shared object determine: canonical owner, readers, writers, versioning strategy, downstream breakage risk. Highlight schema drift risks.

## 6. Hidden Modules
Identify infrastructure these five modules implicitly assume exists. Examples: event bus, scheduler, evidence layer, proposal registry, identity service, ledger, observability, audit log. Do not invent modules unless the existing specs clearly depend on them.

## 7. Scaling
Evaluate: 50 students, 500 rules, 2 years, 10 local agents, continuous PM2. Identify: first bottleneck, database bottleneck, memory bottleneck, synchronization bottleneck, operational bottleneck. Estimate where architectural changes become necessary.

## 8. Evolution
Assume these modules continue evolving independently for three years. Where will version drift first appear? Which contracts must remain frozen? Which contracts can safely evolve?

## 9. Governance
Identify every place where the system makes a decision. For each decision answer: who proposed it, who approved it, who executed it, who records it, who can audit it later. If any answer is ambiguous, identify it as a governance gap.

## 10. Highest Risk
Provide only five findings. Rank them by: 1. likelihood, 2. impact, 3. difficulty of fixing later. Ignore cosmetic improvements. Focus only on architectural risks.

## 11. Proposal Protocol Audit
Assume every subsystem in the Cathedral eventually communicates by emitting Proposals into the Evidence Layer. For each module answer: What proposals does it emit? What evidence does it consume? Does it mutate proposals or only observe them? Does it preserve provenance? Does it generate auditable outcomes? If every module emitted Proposal events tomorrow, what information is missing from the current specs?

---

# SOURCE CODE: Module 5a — client-proxy.js (Student Management)

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
      try { engine.overrideDecision(dec.engineDecisionId, override, reason); } catch { /* engine optional */ }
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


---

# SOURCE CODE: Module 5b — coaching-engine.js (Coach Paul Engine)

// coaching-engine.js — Learning Coaching Engine (Coach Paul Engine)
// ESM module
//
// INVERTED ARCHITECTURE: Paul coaches → interventions logged → patterns extracted →
// rules proposed with evidence + confidence → Paul approves → rules version-controlled.
// NOT a decision tree. A learning engine. "Git for coaching philosophy."
//
// THE CONSTRAINT: no rule exists without evidence. Every rule traces to logged
// interventions, carries a confidence score, and every change writes a changelog entry.
// Every coaching output writes a decision record.
//
// Vault seeds (hypotheses, NOT hardcoded rules):
//   diagnostic-empathy-with-surgical-naming.md, pauls-cognitive-signature.md,
//   the-three-engines.md, the-fear-gate-model.md
//
// Spec: ~/nanoclaw/scaffolds/5b-coach-paul-engine.md

import fs from 'fs';
import path from 'path';

const HOME = process.env.HOME;
const INTERVENTIONS_PATH = path.join(HOME, 'nanoclaw', 'coaching-interventions.json');
const RULES_PATH = path.join(HOME, 'nanoclaw', 'coaching-rules.json');
const CHANGELOG_PATH = path.join(HOME, 'nanoclaw', 'coaching-changelog.json');
const DECISIONS_PATH = path.join(HOME, 'nanoclaw', 'coaching-decisions.json');
const VAULT = path.join(HOME, 'cathedral-vault');
const SYNTH_PROMPT_PATH = path.join(HOME, 'nanoclaw', 'prompts', 'coach-pattern-synthesis.txt');

function loadJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return []; } }
function saveJSON(p, d) { fs.writeFileSync(p, JSON.stringify(d, null, 2)); }
function today() { return new Date().toISOString().split('T')[0]; }

// Confidence thresholds — confidence determines autonomy
const CONFIDENCE = {
  AUTO: 0.90,      // auto-execute, notify Paul after
  RECOMMEND: 0.70, // propose, Paul confirms before delivery
  ASK: 0.50,       // flag the situation, Paul decides
  COLLECT: 0.0     // insufficient evidence, log silently
};
const BASE_CONFIDENCE = 0.60; // where a modified rule resets to — earn it back with outcomes

// Block progression (10 blocks, fear gate at 4→5 — the emotion-engine wall)
const BLOCKS = [
  { id: 1, name: 'Stance & Guard', engine: 'body', gate: null },
  { id: 2, name: 'Basic Punches', engine: 'body', gate: null },
  { id: 3, name: 'Combinations', engine: 'body', gate: null },
  { id: 4, name: 'Defense Basics', engine: 'body', gate: null },
  { id: 5, name: 'Sparring Entry', engine: 'emotion', gate: 'fear_gate' },
  { id: 6, name: 'Ring Craft', engine: 'mind', gate: null },
  { id: 7, name: 'Counter Fighting', engine: 'mind', gate: null },
  { id: 8, name: 'Style Development', engine: 'mind', gate: null },
  { id: 9, name: 'Competition Prep', engine: 'emotion', gate: null },
  { id: 10, name: 'Teaching', engine: 'mind', gate: null }
];

// Keyword maps used to read which engine a signal belongs to.
// (Heuristic layer only — the real intelligence is the logged evidence.)
const ENGINE_KEYWORDS = {
  body: ['guard', 'punch', 'jab', 'cross', 'hook', 'footwork', 'stance', 'balance', 'power', 'speed', 'combo', 'combination', 'slip', 'step', 'pivot', 'fatigue', 'conditioning', 'technique', 'form', 'hips', 'shoulder', 'chin'],
  mind: ['decision', 'thinking', 'confused', 'overthink', 'distracted', 'focus', 'pattern', 'timing', 'read', 'counter', 'ring', 'strategy', 'setup', 'plan', 'remember', 'forgets', 'processing'],
  emotion: ['fear', 'scared', 'nervous', 'anxious', 'tense', 'panic', 'froze', 'freeze', 'composure', 'pressure', 'confidence', 'hesitant', 'hesitation', 'flinch', 'reactive', 'overwhelmed', 'sparring anxiety', 'leaking']
};

// ── Ollama (hermes3) ─────────────────────────────────────────────────────

async function askHermes(prompt, timeoutMs = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'hermes3', prompt, stream: false }),
      signal: controller.signal
    });
    if (!resp.ok) throw new Error(`ollama http ${resp.status}`);
    const data = await resp.json();
    return data.response || '';
  } finally {
    clearTimeout(timer);
  }
}

// Pull a JSON object out of a model reply (models love wrapping JSON in prose/fences)
function extractJSON(text) {
  if (!text) return null;
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
}

// ── Layer 1: Intervention Logging ────────────────────────────────────────

/**
 * Log a coaching intervention — zero interpretation at this layer.
 * @param {object} intervention — { student, context, observation, intervention, reasoning, outcome, tags }
 * @returns {object} InterventionRecord with generated id + date
 */
export function logIntervention(intervention) {
  const log = loadJSON(INTERVENTIONS_PATH);
  const record = {
    id: `int_${Date.now()}`,
    date: today(),
    time: new Date().toISOString().split('T')[1].slice(0, 5),
    source: 'paul_live',
    ...intervention
  };
  log.push(record);
  saveJSON(INTERVENTIONS_PATH, log);
  return record;
}

/**
 * Get intervention log with optional filters
 * @param {object} filters — { student, tags, since, block }
 */
export function getInterventionLog(filters = {}) {
  let log = loadJSON(INTERVENTIONS_PATH);
  if (filters.student) log = log.filter(i => (i.student || '').toLowerCase() === filters.student.toLowerCase());
  if (filters.tags) log = log.filter(i => filters.tags.some(t => (i.tags || []).includes(t)));
  if (filters.since) log = log.filter(i => i.date >= filters.since);
  if (filters.block) log = log.filter(i => i.context?.block === filters.block);
  return log;
}

// ── Layer 2: Pattern Extraction ──────────────────────────────────────────

// Judge a logged outcome as success / failure / unknown from Paul's own words.
// Returns true / false / null (no outcome data).
function judgeOutcome(outcome) {
  if (!outcome || typeof outcome !== 'string') return null;
  const t = outcome.toLowerCase();
  const positive = ['improved', 'improvement', 'stayed up', 'stayed', 'fixed', 'better', 'worked', 'held', 'landed', 'corrected', 'unblocked', 'breakthrough', 'clicked', 'got it', 'success', 'relaxed', 'calmer', 'composed'];
  const negative = ['didn\'t work', 'did not work', 'no change', 'worse', 'still dropping', 'still ', 'failed', 'reverted', 'dropped again', 'froze again', 'no effect', 'ignored'];
  let score = 0;
  for (const w of positive) if (t.includes(w)) score++;
  for (const w of negative) if (t.includes(w)) score--;
  if (score === 0) return null;
  return score > 0;
}

// Confidence from evidence: more observations + higher success rate = more confidence.
// A freshly proposed rule can never start above ~0.87 — the AUTO band (0.90+) must be earned
// through outcomes after approval.
function computeProposalConfidence(observationCount, successRate) {
  const obsPart = 0.25 * Math.min(observationCount / 6, 1);           // 0 → 0.25
  const ratePart = 0.30 * (successRate === null ? 0.5 : successRate); // unknown outcomes = neutral
  return Math.round((0.35 + obsPart + ratePart) * 100) / 100;         // 0.35 → 0.90 theoretical
}

// Which engine does a cluster of interventions live in?
function inferEngine(group, tag) {
  const text = group.map(i => [i.observation, i.intervention, (i.tags || []).join(' ')].join(' ')).join(' ').toLowerCase();
  if ((group.some(i => (i.tags || []).includes('body'))) || tag === 'body') return 'body';
  if ((group.some(i => (i.tags || []).includes('mind'))) || tag === 'mind') return 'mind';
  if ((group.some(i => (i.tags || []).includes('emotion'))) || tag === 'emotion') return 'emotion';
  let best = 'body', bestScore = -1;
  for (const [engine, words] of Object.entries(ENGINE_KEYWORDS)) {
    const score = words.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = engine; }
  }
  return best;
}

// Ask hermes3 to synthesize a rule from the cluster. Falls back to a purely
// evidence-quoting rule if Ollama is down or returns garbage — the fallback
// still keeps Paul's language because it quotes the interventions verbatim.
async function synthesizeRule(tag, group) {
  const evidence = group.map(i =>
    `[${i.id}] student=${i.student || '?'} block=${i.context?.block ?? '?'}\n` +
    `  OBSERVED: ${i.observation || ''}\n` +
    `  PAUL DID: ${i.intervention || ''}\n` +
    `  PAUL'S REASONING: ${i.reasoning || ''}\n` +
    `  OUTCOME: ${i.outcome || '(not logged yet)'}`
  ).join('\n\n');

  let template;
  try { template = fs.readFileSync(SYNTH_PROMPT_PATH, 'utf8'); }
  catch {
    template = 'Synthesize ONE coaching rule from these logged interventions (shared tag: {TAG}). ' +
      'Use ONLY the evidence attached. Keep the coach\'s exact words in "instruction". ' +
      'Reply with ONLY JSON: {"rule","trigger","student_level","engine","block_range","prescription_type","instruction","duration","escalation","insufficient_evidence"}\n\nEVIDENCE:\n{EVIDENCE}';
  }
  const prompt = template.replace('{TAG}', tag).replace('{EVIDENCE}', evidence);

  const latest = group[group.length - 1];
  const fallback = {
    rule: `When "${tag}" pattern appears, apply Paul's logged intervention: "${latest.intervention || latest.observation}"`,
    trigger: tag,
    student_level: 'any',
    engine: inferEngine(group, tag),
    block_range: [1, 10],
    prescription_type: 'other',
    instruction: latest.intervention || latest.observation || '',
    duration: null,
    escalation: null,
    synthesizedBy: 'fallback_verbatim' // hermes3 unavailable — rule is a direct quote of the evidence
  };

  try {
    const reply = await askHermes(prompt);
    const parsed = extractJSON(reply);
    if (!parsed || parsed.insufficient_evidence === true || !parsed.rule) return fallback;
    parsed.engine = ['body', 'mind', 'emotion'].includes(parsed.engine) ? parsed.engine : fallback.engine;
    if (!Array.isArray(parsed.block_range) || parsed.block_range.length !== 2) parsed.block_range = [1, 10];
    if (!parsed.instruction) parsed.instruction = fallback.instruction;
    parsed.synthesizedBy = 'hermes3';
    return parsed;
  } catch {
    return fallback;
  }
}

/**
 * Extract patterns from intervention log, propose rules.
 * Clusters interventions by tag, synthesizes with hermes3, attaches evidence chains.
 * Skips clusters already covered by a live (proposed/approved/hypothesis) rule.
 * @param {number} minObservations — minimum similar interventions before proposing (default 3)
 * @returns {Array} newly created RuleProposal[]
 */
export async function extractPatterns(minObservations = 3) {
  const interventions = loadJSON(INTERVENTIONS_PATH);
  const rules = loadJSON(RULES_PATH);
  const proposals = [];
  const seenEvidenceSets = new Map(); // dedupe: two tags covering the SAME interventions = one rule

  // 1. Cluster by tag
  const clusters = {};
  for (const i of interventions) {
    for (const t of (i.tags || [])) (clusters[t] = clusters[t] || []).push(i);
  }

  for (const [tag, group] of Object.entries(clusters)) {
    // 2. Enough observations?
    if (group.length < minObservations) continue;

    // 6. Skip clusters that already have a live rule for this tag
    const covered = rules.some(r => r.status !== 'rejected' && (r.sourceTags || []).includes(tag));
    if (covered) continue;

    // Same evidence set already proposed this run? Merge the tag instead of duplicating the rule.
    const signature = group.map(g => g.id).sort().join('|');
    const existing = seenEvidenceSets.get(signature);
    if (existing) {
      existing.sourceTags.push(tag);
      existing.conditions.tags.push(tag);
      continue;
    }

    // 4. Confidence from success_rate + observation_count (from Paul's logged outcomes)
    const judged = group.map(i => ({ i, success: judgeOutcome(i.outcome) }));
    const withOutcome = judged.filter(j => j.success !== null);
    const successes = withOutcome.filter(j => j.success).length;
    const successRate = withOutcome.length ? successes / withOutcome.length : null;
    const confidence = computeProposalConfidence(group.length, successRate);

    // 3. hermes3 synthesizes the rule text (fallback quotes evidence verbatim)
    const synth = await synthesizeRule(tag, group);

    const dates = group.map(g => g.date).sort();
    const timeSpanDays = Math.round((new Date(dates[dates.length - 1]) - new Date(dates[0])) / 86400000);

    // 5. Proposal with full evidence chain
    const proposal = {
      id: `rule_${tag.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}`,
      version: '1.0',
      status: 'proposed',
      rule: synth.rule,
      confidence,
      sourceTags: [tag],
      evidence: {
        supporting_interventions: group.map(g => g.id),
        success_rate: withOutcome.length ? `${successes}/${withOutcome.length} logged outcomes positive` : 'no outcomes logged yet',
        failure_cases: judged.filter(j => j.success === false).map(j => `${j.i.id} — ${(j.i.outcome || '').slice(0, 120)}`),
        observation_count: group.length,
        time_span_days: timeSpanDays,
        outcomes: []
      },
      conditions: {
        trigger: synth.trigger || tag,
        student_level: synth.student_level || 'any',
        engine: synth.engine,
        block_range: synth.block_range || [1, 10],
        tags: [tag]
      },
      prescription: {
        type: synth.prescription_type || 'other',
        instruction: synth.instruction,
        duration: synth.duration || null,
        escalation: synth.escalation || null
      },
      synthesizedBy: synth.synthesizedBy,
      created: today(),
      approved: null,
      approvedBy: null,
      changelog: []
    };

    rules.push(proposal);
    proposals.push(proposal);
    seenEvidenceSets.set(signature, proposal);
  }

  if (proposals.length) saveJSON(RULES_PATH, rules);
  return proposals;
}

/**
 * Get pending rule proposals (not yet approved/rejected)
 */
export function getPendingProposals() {
  return loadJSON(RULES_PATH).filter(r => r.status === 'proposed');
}

// ── Layer 3: Rule Management ─────────────────────────────────────────────

// Write a changelog entry; snapshot = the rule state BEFORE this change,
// so old versions are always reconstructable (this is the version control).
function writeChangelog(rule, change, reason, snapshotBefore) {
  const changelog = loadJSON(CHANGELOG_PATH);
  changelog.push({
    ruleId: rule.id,
    version: snapshotBefore && snapshotBefore.version !== rule.version
      ? `${snapshotBefore.version} → ${rule.version}` : rule.version,
    date: today(),
    change,
    reason,
    evidence: rule.evidence?.supporting_interventions || [],
    approvedBy: 'paul',
    snapshot: snapshotBefore || null
  });
  saveJSON(CHANGELOG_PATH, changelog);
}

/**
 * Approve a proposed rule, optionally with modifications
 */
export function approveRule(ruleId, modifications = {}) {
  const rules = loadJSON(RULES_PATH);
  const rule = rules.find(r => r.id === ruleId);
  if (!rule) return null;

  const before = JSON.parse(JSON.stringify(rule));

  rule.status = 'approved';
  rule.approved = today();
  rule.approvedBy = 'paul';

  if (modifications.rule) rule.rule = modifications.rule;
  if (modifications.conditions) Object.assign(rule.conditions = rule.conditions || {}, modifications.conditions);
  if (modifications.prescription) Object.assign(rule.prescription = rule.prescription || {}, modifications.prescription);

  saveJSON(RULES_PATH, rules);
  writeChangelog(rule,
    modifications.rule ? `Approved with modification: ${modifications.rule}` : 'Approved as proposed',
    modifications.reason || 'Paul approved', before);
  return rule;
}

/**
 * Modify an approved rule — creates a NEW VERSION, preserves the old one in the
 * changelog snapshot, resets confidence to base (a changed rule re-earns trust).
 * @param {object} modifications — { rule, conditions, prescription }
 */
export function modifyRule(ruleId, modifications = {}, reason = 'Paul modified') {
  const rules = loadJSON(RULES_PATH);
  const rule = rules.find(r => r.id === ruleId);
  if (!rule) return null;

  const before = JSON.parse(JSON.stringify(rule));

  // bump version: 1.0 → 1.1 → 1.2 ...
  const [major, minor] = String(rule.version || '1.0').split('.').map(n => parseInt(n, 10) || 0);
  rule.version = `${major}.${minor + 1}`;
  rule.confidence = BASE_CONFIDENCE; // spec: Paul modifies rule → confidence resets to base

  if (modifications.rule) rule.rule = modifications.rule;
  if (modifications.conditions) Object.assign(rule.conditions = rule.conditions || {}, modifications.conditions);
  if (modifications.prescription) Object.assign(rule.prescription = rule.prescription || {}, modifications.prescription);
  rule.modified = today();

  saveJSON(RULES_PATH, rules);
  writeChangelog(rule, modifications.rule ? `Modified: ${modifications.rule}` : 'Modified conditions/prescription', reason, before);
  return rule;
}

/**
 * Reject a proposed rule (reason required — rejections are evidence too)
 */
export function rejectRule(ruleId, reason) {
  const rules = loadJSON(RULES_PATH);
  const rule = rules.find(r => r.id === ruleId);
  if (!rule) return null;
  const before = JSON.parse(JSON.stringify(rule));
  rule.status = 'rejected';
  rule.rejectedReason = reason;
  rule.rejectedDate = today();
  saveJSON(RULES_PATH, rules);
  writeChangelog(rule, 'Rejected', reason || 'no reason given', before);
  return rule;
}

/**
 * Get rules with optional filters.
 * Default: approved rules only. Pass { status: 'hypothesis' | 'proposed' | 'all' } to widen.
 */
export function getRules(filters = {}) {
  let rules = loadJSON(RULES_PATH);
  const status = filters.status || 'approved';
  if (status !== 'all') rules = rules.filter(r => r.status === status);
  if (filters.engine) rules = rules.filter(r => r.conditions?.engine === filters.engine);
  if (filters.minConfidence) rules = rules.filter(r => r.confidence >= filters.minConfidence);
  if (filters.tag) rules = rules.filter(r => (r.conditions?.tags || r.sourceTags || []).includes(filters.tag));
  return rules;
}

/**
 * Get full changelog for a rule
 */
export function getRuleChangelog(ruleId) {
  return loadJSON(CHANGELOG_PATH).filter(c => c.ruleId === ruleId);
}

// ── Vault Seeds — Paul's methodology loaded as HYPOTHESES, not rules ─────
// These need outcome validation before becoming confirmed rules. Confidence 0.60
// (ASK band) — they inform, they never auto-fire.

const SEED_CONFIDENCE = 0.60;

// The 13 cognitive skills (pauls-cognitive-signature.md) — meta-skills that shape
// HOW the engine reasons, loaded as hypotheses so their coaching value gets tested.
const COGNITIVE_SKILLS = [
  ['compression_concrete_image', 'Compression through concrete image', 'Give the student one concrete image that holds the whole correction — the image does the work, not a list of pointers.'],
  ['cross_domain_bridge', 'Cross-domain bridge-building', 'Bridge the correction to something the student already does well in another domain — structural identity, not analogy.'],
  ['reflexive_rigour', 'Reflexive rigour', 'Apply the same standard to your own coaching that you apply to the student — if a cue keeps failing, the cue is wrong, not the student.'],
  ['lens_on_instrument', 'Turning the lens on the instrument', 'Treat the coaching itself as data — when a session goes flat, diagnose the coaching, not just the student.'],
  ['hold_until_pattern', 'Hold-until-pattern', 'Wait for three data points before naming a pattern — hold the first observation, note the second, name at the third.'],
  ['live_forensic', 'Forensic diagnosis in real time', 'Name the mechanism while still inside the round — live diagnosis, not retrospective analysis.'],
  ['governance_instinct', 'The governance instinct', 'After prescribing, ask who/what watches the prescription — a drill without a check is incomplete.'],
  ['four_to_eight', 'The 4-to-8 Question', 'When a student is stuck at a 4, ask what takes them to an 8 — force the new idea, not the refinement.'],
  ['trojan_horse', 'Trojan Horse Principle', 'The skill is never the offer — they came for boxing; deliver the deeper work through the boxing, never announce it.'],
  ['audit_before_build', 'Audit Before Build + Speak Freely', 'Diagnose fully before changing anything, and remove the pressure for a positive assessment before asking what is wrong.'],
  ['accumulation_vessel', 'Identity as accumulation vessel', 'The student\'s logged history IS their identity as a fighter — read the accumulation before coaching the day.'],
  ['diagnostic_inversion', 'Diagnostic Inversion', 'Never fix the reported symptom — test the actual mechanism underneath the complaint.'],
  ['four_step_interrogation', 'The Four-Step Interrogation', 'When a student\'s story about their block doesn\'t hold, strip it with simple concrete questions until the real block is visible.']
];

/**
 * Load vault seed files as hypothesis rules (status 'hypothesis', confidence 0.60).
 * Idempotent — already-loaded seeds are skipped. Missing vault files are reported, not faked.
 * @returns {object} { loaded, skipped, missingFiles }
 */
export function loadVaultSeeds() {
  const files = {
    de: path.join(VAULT, '02_Refined_Gold', 'cathedral', 'diagnostic-empathy-with-surgical-naming.md'),
    cs: path.join(VAULT, '06_Methods', 'pauls-cognitive-signature.md'),
    te: path.join(VAULT, '02_Refined_Gold', 'cathedral', 'the-three-engines.md'),
    fg: path.join(VAULT, '02_Refined_Gold', 'cathedral', 'the-fear-gate-model.md')
  };
  const missingFiles = Object.entries(files).filter(([, p]) => !fs.existsSync(p)).map(([, p]) => p);
  const have = k => !missingFiles.includes(files[k]);
  const rel = p => p.replace(VAULT + '/', '');

  const seeds = [];
  const seed = (id, ruleText, engine, trigger, instruction, file, extras = {}) => seeds.push({
    id, version: '1.0', status: 'hypothesis',
    rule: ruleText,
    confidence: SEED_CONFIDENCE,
    sourceTags: extras.tags || [],
    evidence: { source: 'vault_seed', file: rel(file), observation_count: 0, supporting_interventions: [], outcomes: [] },
    conditions: { trigger, student_level: 'any', engine, block_range: extras.block_range || [1, 10], tags: extras.tags || [] },
    prescription: { type: extras.type || 'diagnostic_method', instruction, duration: null, escalation: null },
    created: today(), approved: null, approvedBy: null, changelog: [],
    note: 'Vault seed — hypothesis. Needs outcome validation before becoming a confirmed rule.'
  });

  // ── The 6 diagnostic coaching components (diagnostic-empathy-with-surgical-naming.md)
  if (have('de')) {
    const f = files.de;
    seed('seed_de_1_safety_without_announcing',
      'Create safety without announcing it — through tempo, humour and genuine curiosity, never by saying "this is a safe space".',
      'emotion', 'student_guarded',
      'Match their energy, keep it light, stay genuinely curious — the student relaxes because nothing feels clinical.', f, { tags: ['diagnostic', 'safety'] });
    seed('seed_de_2_wound_under_words',
      'Hear the wound underneath the words — the surface complaint is never the real signal; listen for the flinch: energy shift, speed change, misplaced laugh.',
      'emotion', 'surface_complaint',
      'Listen for the sentence beneath the sentence — the moment their energy shifts, where they speed up or slow down, where they laugh at something that isn\'t funny.', f, { tags: ['diagnostic', 'listening'] });
    seed('seed_de_3_collapsing_question',
      'Ask the collapsing question — one simple, almost casual question that makes the whole defence structure fold before the guard can intervene.',
      'mind', 'defence_structure_detected',
      'Skip the surface, find the load-bearing assumption, and ask about it directly — simple, casual, no therapeutic jargon.', f, { tags: ['diagnostic', 'questioning'] });
    seed('seed_de_4_naming_precisely',
      'Name precisely — the wound gets a specific concrete name drawn from THEIR own language, not a category, not a diagnosis.',
      'mind', 'wound_identified',
      'Name the exact thing, in the exact words the person would use themselves, at the exact moment they\'re ready to hear it.', f, { tags: ['diagnostic', 'naming'] });
    seed('seed_de_5_match_intervention_to_wound',
      'Match intervention to wound type — same diagnostic path can require completely different repair architectures (external-authority wound vs self-abandonment wound).',
      'emotion', 'wound_named',
      'Different wounds, different interventions: reconnect them to who they were before the wound, or build the bridge between adult self and the part that gave up.', f, { tags: ['diagnostic', 'intervention_matching'] });
    seed('seed_de_6_know_when_to_stop',
      'Know when to stop — let the conversation end naturally; no homework, no follow-up framework, no referral speech.',
      'emotion', 'breakthrough_reached',
      'Stop when it lands. No homework. No framework. The person should feel genuinely changed, not managed.', f, { tags: ['diagnostic', 'stopping'] });
  }

  // ── The Three Engines model (the-three-engines.md)
  if (have('te')) {
    const f = files.te;
    seed('seed_te_energy_currency',
      'Diagnose which engine is leaking before prescribing — mind, emotion, body share one currency: how well you organize, cultivate, and protect ENERGY.',
      'mind', 'plateau_or_underperformance',
      'Before any drill change, read which engine is leaking: the body-only fighter is running one engine and leaking from the other two.', f, { tags: ['three_engines', 'energy'] });
    seed('seed_te_mind_engine',
      'The mind engine is the installed OS — peaceful, clear, able to make good decisions quickly vs tricked, distracted, gaslit.',
      'mind', 'mental_leak',
      'Check the install: is the inner environment peaceful, clear, decisive — or easily tricked, distracted, gaslit? Coach the OS, not just the technique.', f, { tags: ['three_engines', 'mind'] });
    seed('seed_te_emotion_engine',
      'The emotion engine is composure — either composed and in control of emotional energy, or fearful, tense, panicked, reactive and therefore leaking energy.',
      'emotion', 'emotional_leak',
      'Don\'t suppress the emotion engine — organize it. Composed and in control of emotional energy is the gate passed.', f, { tags: ['three_engines', 'emotion'] });
    seed('seed_te_body_engine',
      'The body is the machine — the one everyone trains. Train it, but never let it hide the two neglected engines.',
      'body', 'physical_focus_only',
      'Everyone trains the body. The edge is the two engines everyone forgets — if body metrics are fine but performance stalls, the leak is elsewhere.', f, { tags: ['three_engines', 'body'] });
  }

  // ── The Fear Gate (the-fear-gate-model.md + three-engines 4→5 wall)
  if (have('fg')) {
    const f = files.fg;
    seed('seed_fg_4to5_wall',
      'The 4→5 wall (Defense Basics → Sparring Entry) is an EMOTION-engine event, not a physical one — it\'s where pressure and fear start leaking energy and composure has to be installed.',
      'emotion', 'block_4_to_5_transition',
      'The student "knows the punches" but can\'t flow. Don\'t prescribe more technique — this is the fear gate. Which floor element is missing?', f, { tags: ['fear_gate', 'block_progression'], block_range: [4, 5] });
    seed('seed_fg_floor_elements',
      'At a fear gate, check the four floor elements: healthy routine (the floor beneath the trap door), journal/evidence of problems overcome, supportive community, and accumulated evidence of character at previous gates.',
      'emotion', 'fear_gate_stall',
      'Which floor element is missing? Routine holds you while the fear passes. The journal says "you\'ve handled worse." Peers pull toward the positive outcome. Data overwhelms the fear.', f, { tags: ['fear_gate', 'floor_elements'] });
    seed('seed_fg_alarm_not_trapdoor',
      'Reframe the gate: alarm, not trap door — the fear gate never disappears, it becomes useful; an alarm tells you something important is happening.',
      'emotion', 'fear_response',
      'Each gate survived is a data point. "I\'ve been here 7 times and survived all 7." The spiral goes up.', f, { tags: ['fear_gate', 'reframe'] });
  }

  // ── The 13 cognitive skills (pauls-cognitive-signature.md) — meta-skills
  if (have('cs')) {
    for (const [key, name, instruction] of COGNITIVE_SKILLS) {
      seed(`seed_cs_${key}`,
        `Meta-skill — ${name}: informs HOW the engine reasons, not WHAT it prescribes.`,
        'mind', `meta_${key}`, instruction, files.cs, { tags: ['cognitive_signature', 'meta_skill'], type: 'meta_skill' });
    }
  }

  // ── Block progression (spec: 10 blocks, gate at 4→5)
  seed('seed_blocks_progression',
    'Progression runs through 10 gated blocks: Stance & Guard → Basic Punches → Combinations → Defense Basics → FEAR GATE → Sparring Entry → Ring Craft → Counter Fighting → Style Development → Competition Prep → Teaching. Each gate asks "which engine is still leaking", not just "can you do the technique".',
    'mind', 'block_transition',
    'Blocks 1-4 train the body, block 5 is the emotion gate, 6-8 train the mind, 9 tests emotion under stakes, 10 is mind (teaching). Read the gate, not just the technique.',
    path.join(HOME, 'nanoclaw', 'scaffolds', '5b-coach-paul-engine.md'), { tags: ['block_progression'] });

  // Idempotent write
  const rules = loadJSON(RULES_PATH);
  const existing = new Set(rules.map(r => r.id));
  let loaded = 0, skipped = 0;
  for (const s of seeds) {
    if (existing.has(s.id)) { skipped++; continue; }
    rules.push(s); loaded++;
  }
  if (loaded) saveJSON(RULES_PATH, rules);
  return { loaded, skipped, missingFiles };
}

// ── Active Coaching (uses approved rules only) ──────────────────────────

// Does an approved rule match this session + student?
function ruleMatches(rule, sessionText, sessionTags, studentProfile) {
  const cond = rule.conditions || {};
  // tag/trigger match — any source tag in session tags, or trigger/tag words in the session text
  const tagHit = (rule.sourceTags || []).some(t => sessionTags.includes(t)) ||
    (cond.tags || []).some(t => sessionTags.includes(t)) ||
    (cond.trigger && sessionText.includes(String(cond.trigger).replace(/_/g, ' '))) ||
    (rule.sourceTags || []).some(t => sessionText.includes(String(t).replace(/_/g, ' ')));
  if (!tagHit) return false;
  // block range
  const block = studentProfile?.currentBlock || studentProfile?.block;
  if (block && Array.isArray(cond.block_range)) {
    if (block < cond.block_range[0] || block > cond.block_range[1]) return false;
  }
  // student level (tolerant — 'any' or missing passes)
  const level = (studentProfile?.level || '').toLowerCase();
  const wanted = (cond.student_level || 'any').toLowerCase();
  if (level && wanted !== 'any' && !wanted.split('|').includes(level)) return false;
  return true;
}

// Pull Paul's actual words for a rule — verbatim intervention text from the evidence chain
function paulsWordsFor(rule, allInterventions) {
  const ids = rule.evidence?.supporting_interventions || [];
  return allInterventions.filter(i => ids.includes(i.id)).map(i => i.intervention).filter(Boolean).slice(0, 3);
}

/**
 * Run diagnosis on session data against approved rules.
 * Confidence gates: AUTO 90%+ / RECOMMEND 70-89% / ASK 50-69% / COLLECT <50% (silent log).
 * Uses Paul's language from original interventions. Writes a decision record.
 * @param {object} sessionData — { tags, observations, metrics, notes ... }
 * @param {object} studentProfile — { id, name, level, currentBlock ... }
 */
export function diagnose(sessionData = {}, studentProfile = {}) {
  const rules = getRules(); // approved only
  const allInterventions = loadJSON(INTERVENTIONS_PATH);
  const date = today();

  const sessionTags = (sessionData.tags || []).map(t => String(t).toLowerCase());
  const sessionText = JSON.stringify(sessionData).toLowerCase().replace(/[_"]/g, ' ');

  const output = {
    studentId: studentProfile?.id || studentProfile?.name || null,
    date,
    sessionData,
    diagnoses: [],
    overallAssessment: { dominantGap: null, trend: sessionData.trend || 'insufficient_data', nextFocus: null },
    confidenceBreakdown: { auto_executed: 0, recommended: 0, needs_paul: 0, collecting: 0 }
  };

  const rulesApplied = [];
  const collecting = [];
  const engineHits = { body: 0, mind: 0, emotion: 0 };

  for (const rule of rules) {
    if (!ruleMatches(rule, sessionText, sessionTags, studentProfile)) continue;

    const c = rule.confidence;
    let level;
    if (c >= CONFIDENCE.AUTO) level = 'auto_executed';
    else if (c >= CONFIDENCE.RECOMMEND) level = 'recommended';
    else if (c >= CONFIDENCE.ASK) level = 'needs_paul';
    else level = 'collecting';

    if (level === 'collecting') {
      // <50%: no recommendation — just log the observation for future pattern matching
      output.confidenceBreakdown.collecting++;
      collecting.push({ ruleId: rule.id, confidence: c });
      continue;
    }

    output.confidenceBreakdown[level]++;
    if (rule.conditions?.engine) engineHits[rule.conditions.engine] = (engineHits[rule.conditions.engine] || 0) + 1;
    rulesApplied.push({ ruleId: rule.id, version: rule.version, confidence: c });

    output.diagnoses.push({
      ruleId: rule.id,
      version: rule.version,
      confidence: c,
      level,
      engine: rule.conditions?.engine || null,
      diagnosis: rule.rule,
      prescription: rule.prescription?.instruction || null,
      escalation: rule.prescription?.escalation || null,
      paulsWords: paulsWordsFor(rule, allInterventions), // verbatim — Paul's language, not generic rephrasing
      evidence: rule.evidence?.supporting_interventions || []
    });
  }

  // Highest-confidence diagnosis first
  output.diagnoses.sort((a, b) => b.confidence - a.confidence);

  // Overall assessment — which engine is leaking most, what to focus on next
  const topEngine = Object.entries(engineHits).sort((a, b) => b[1] - a[1])[0];
  if (topEngine && topEngine[1] > 0) output.overallAssessment.dominantGap = `${topEngine[0]} engine`;
  if (output.diagnoses[0]) output.overallAssessment.nextFocus = output.diagnoses[0].prescription || output.diagnoses[0].diagnosis;

  // Autonomy level = the strongest band that fired
  const autonomyLevel =
    output.confidenceBreakdown.auto_executed > 0 ? 'auto' :
    output.confidenceBreakdown.recommended > 0 ? 'recommended' :
    output.confidenceBreakdown.needs_paul > 0 ? 'ask' : 'collect';

  // Decision record — the audit trail is more valuable than the decision
  const decision = {
    decisionId: `dec_${Date.now()}`,
    studentId: output.studentId,
    date,
    type: 'coaching_recommendation',
    input: {
      sessionData,
      studentProfile: { id: studentProfile?.id, name: studentProfile?.name, level: studentProfile?.level, currentBlock: studentProfile?.currentBlock }
    },
    rulesApplied,
    collectingSilently: collecting,
    autonomyLevel,
    model: 'hermes3',
    output: {
      diagnoses: output.diagnoses.map(d => `${d.diagnosis}${d.level === 'auto_executed' ? ' [AUTO]' : ''}`),
      prescriptions: output.diagnoses.map(d => d.prescription).filter(Boolean)
    },
    humanOverride: null,
    overrideReason: null,
    overrideDate: null
  };
  const decisions = loadJSON(DECISIONS_PATH);
  decisions.push(decision);
  saveJSON(DECISIONS_PATH, decisions);

  output.decisionRecord = decision;
  return output;
}

/**
 * Assess a new student from first session — dominant engine, starting block, priorities.
 * Heuristic reading of the three engines; writes a decision record for the audit trail.
 * @param {object} firstSessionData — { student/name, notes, observations, experience, metrics, tags }
 */
export function assessNewStudent(firstSessionData = {}) {
  const text = [
    firstSessionData.notes, firstSessionData.observations,
    Array.isArray(firstSessionData.observations) ? firstSessionData.observations.join(' ') : '',
    (firstSessionData.tags || []).join(' '), firstSessionData.experience
  ].filter(Boolean).join(' ').toLowerCase();

  // Score each engine by how many of its leak-signals appear in the first session
  const scores = { body: 0, mind: 0, emotion: 0 };
  for (const [engine, words] of Object.entries(ENGINE_KEYWORDS)) {
    for (const w of words) if (text.includes(w)) scores[engine]++;
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const anySignal = ranked[0][1] > 0;
  // "Dominant engine" = where the strongest signal (usually the leak) shows in session one.
  const dominantEngine = anySignal ? ranked[0][0] : 'body'; // no signal → default: everyone arrives training the body

  // Starting block from stated experience — capped at 4: the fear gate (5) is never assumed passed
  const exp = String(firstSessionData.experience || '').toLowerCase();
  let startingBlock = 1;
  if (/(competi|amateur|fights|fought|years)/.test(exp)) startingBlock = 4;
  else if (/(trained|boxed before|some boxing|muay thai|kickbox|martial)/.test(exp)) startingBlock = 3;
  else if (/(fitness|athletic|other sport|active)/.test(exp)) startingBlock = 2;

  // Priorities: the block's engine first, then the two neglected engines (three-engines seed)
  const block = BLOCKS.find(b => b.id === startingBlock);
  const initialPriorities = [];
  initialPriorities.push(`Block ${block.id} — ${block.name} (${block.engine} engine)`);
  if (anySignal && dominantEngine !== block.engine) {
    initialPriorities.push(`Watch the ${dominantEngine} engine — strongest first-session signal (${ranked[0][1]} markers)`);
  }
  const weakest = ranked[2][0];
  initialPriorities.push(`Baseline the ${weakest} engine early — least data from session one`);

  const assessment = {
    student: firstSessionData.student || firstSessionData.name || null,
    date: today(),
    dominantEngine,
    engineSignals: scores,
    startingBlock,
    startingBlockName: block.name,
    initialPriorities,
    fearGateStatus: 'not_reached',
    notes: anySignal
      ? `Engine signals read from first session (${ranked.map(([e, s]) => `${e}:${s}`).join(', ')}). Hypothesis only — needs sessions to confirm.`
      : 'No engine signals detected in first session data — defaulting to body engine, block 1. Log observations to sharpen.'
  };

  // Decision record — assessments are auditable outputs too
  const decisions = loadJSON(DECISIONS_PATH);
  decisions.push({
    decisionId: `dec_${Date.now()}`,
    studentId: assessment.student,
    date: assessment.date,
    type: 'initial_assessment',
    input: { firstSessionData },
    rulesApplied: [],
    autonomyLevel: 'recommended',
    model: 'heuristic',
    output: { assessment },
    humanOverride: null, overrideReason: null, overrideDate: null
  });
  saveJSON(DECISIONS_PATH, decisions);

  return assessment;
}

// Metric name → engine (for plateau attribution)
function metricEngine(name) {
  const n = name.toLowerCase();
  if (/(compos|pressure|spar|fear|confid|calm|heart)/.test(n)) return 'emotion';
  if (/(accura|decision|counter|timing|read|ring|combo_variety|variety)/.test(n)) return 'mind';
  return 'body'; // punches, power, speed, steps, output — the machine
}

/**
 * Detect plateau across session history — flatlined metrics across 3+ sessions,
 * and which engine is stalled. Fear-gate aware (4→5 wall = emotion event).
 * @param {Array} sessionHistory — [{ date, block?, metrics: { name: number } }, ...] oldest→newest or any order
 * @returns {object|null} PlateauReport or null
 */
export function detectPlateau(sessionHistory = []) {
  if (!Array.isArray(sessionHistory) || sessionHistory.length < 3) return null;

  const sessions = [...sessionHistory].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  const window = sessions.slice(-Math.max(3, Math.min(sessions.length, 5))); // last 3-5 sessions

  // Gather numeric metrics per session (metrics object, or numeric top-level fields)
  const series = {};
  for (const s of window) {
    const metrics = s.metrics && typeof s.metrics === 'object' ? s.metrics : s;
    for (const [k, v] of Object.entries(metrics)) {
      if (typeof v !== 'number' || !isFinite(v)) continue;
      if (['block', 'round', 'rounds', 'id'].includes(k)) continue;
      (series[k] = series[k] || []).push(v);
    }
  }

  const flatlined = [];
  const declining = [];
  for (const [metric, values] of Object.entries(series)) {
    if (values.length < 3) continue; // need the metric in 3+ sessions
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (mean === 0) continue;
    const spread = (Math.max(...values) - Math.min(...values)) / Math.abs(mean);
    const drift = (values[values.length - 1] - values[0]) / Math.abs(mean);
    if (spread < 0.05) flatlined.push({ metric, engine: metricEngine(metric), values, spread: Math.round(spread * 1000) / 1000 });
    else if (drift < -0.10) declining.push({ metric, engine: metricEngine(metric), values, drift: Math.round(drift * 1000) / 1000 });
  }

  if (flatlined.length === 0 && declining.length === 0) return null;

  // Which engine is stalled? Most flatlined/declining metrics wins.
  const engineCount = {};
  for (const m of [...flatlined, ...declining]) engineCount[m.engine] = (engineCount[m.engine] || 0) + 1;
  const stalledEngine = Object.entries(engineCount).sort((a, b) => b[1] - a[1])[0][0];

  // Fear gate check — the known 4→5 wall is an emotion-engine event
  const lastBlock = [...window].reverse().map(s => s.block || s.currentBlock).find(b => b);
  const atFearGate = lastBlock === 4 || lastBlock === 5;

  return {
    plateaued: true,
    sessionsAnalyzed: window.length,
    from: window[0].date || null,
    to: window[window.length - 1].date || null,
    flatlinedMetrics: flatlined,
    decliningMetrics: declining,
    stalledEngine,
    atFearGate,
    reading: atFearGate && (stalledEngine === 'emotion' || flatlined.length > 0)
      ? 'Student is at the 4→5 wall — likely an emotion-engine event, not a physical one. Which floor element is missing: routine, journal, community, or evidence of gates survived?'
      : `${stalledEngine} engine appears stalled across ${window.length} sessions. Diagnose which engine is leaking before changing drills.`,
    suggestedQuestion: 'Which gate, which floor element is missing, what intervention matches?'
  };
}

// ── Confidence + Evidence ────────────────────────────────────────────────

/**
 * Update confidence after an outcome. Success +0.03, failure -0.05
 * (failures cost more than successes earn — trust is slow up, fast down).
 */
export function updateConfidence(ruleId, outcome) {
  const rules = loadJSON(RULES_PATH);
  const rule = rules.find(r => r.id === ruleId);
  if (!rule) return -1;

  const delta = outcome.success ? 0.03 : -0.05;
  rule.confidence = Math.max(0, Math.min(1, Math.round((rule.confidence + delta) * 100) / 100));

  if (!rule.evidence) rule.evidence = {};
  if (!rule.evidence.outcomes) rule.evidence.outcomes = [];
  rule.evidence.outcomes.push({
    date: today(),
    success: outcome.success,
    context: outcome.context,
    interventionId: outcome.interventionId
  });

  saveJSON(RULES_PATH, rules);
  return rule.confidence;
}

/**
 * Get full evidence chain for a rule — interventions, outcomes, changelog
 */
export function getEvidenceChain(ruleId) {
  const rules = loadJSON(RULES_PATH);
  const rule = rules.find(r => r.id === ruleId);
  if (!rule) return null;

  const interventions = loadJSON(INTERVENTIONS_PATH)
    .filter(i => (rule.evidence?.supporting_interventions || []).includes(i.id));

  return {
    rule: rule.rule,
    confidence: rule.confidence,
    source: rule.evidence?.source || 'logged_interventions',
    interventions,
    outcomes: rule.evidence?.outcomes || [],
    changelog: getRuleChangelog(ruleId)
  };
}

// ── Decision Records ────────────────────────────────────────────────────

/**
 * Get decision log with optional filters — { studentId, since, autonomyLevel, type }
 */
export function getDecisionLog(filters = {}) {
  let log = loadJSON(DECISIONS_PATH);
  if (filters.studentId) log = log.filter(d => String(d.studentId || '').toLowerCase() === String(filters.studentId).toLowerCase());
  if (filters.since) log = log.filter(d => d.date >= filters.since);
  if (filters.autonomyLevel) log = log.filter(d => d.autonomyLevel === filters.autonomyLevel);
  if (filters.type) log = log.filter(d => d.type === filters.type);
  return log;
}

/**
 * Override a decision — Paul disagrees. Feeds back into rule confidence.
 */
export function overrideDecision(decisionId, override, reason) {
  const decisions = loadJSON(DECISIONS_PATH);
  const dec = decisions.find(d => d.decisionId === decisionId);
  if (!dec) return null;

  dec.humanOverride = override;
  dec.overrideReason = reason;
  dec.overrideDate = today();
  saveJSON(DECISIONS_PATH, decisions);

  for (const r of (dec.rulesApplied || [])) {
    updateConfidence(r.ruleId, { success: false, context: `Paul override: ${reason}`, interventionId: decisionId });
  }

  return dec;
}

// ── Version Control ──────────────────────────────────────────────────────

/**
 * Get a specific version of a rule.
 * Current version comes from the live store; older versions are reconstructed
 * from changelog snapshots (each entry preserves the rule state BEFORE the change).
 */
export function getRuleVersion(ruleId, version) {
  const rules = loadJSON(RULES_PATH);
  const rule = rules.find(r => r.id === ruleId);
  if (rule && String(rule.version) === String(version)) return rule;

  // walk the changelog newest→oldest; the first snapshot AT that version is the state to return
  const entries = getRuleChangelog(ruleId).slice().reverse();
  for (const e of entries) {
    if (e.snapshot && String(e.snapshot.version) === String(version)) return { ...e.snapshot, reconstructedFromChangelog: true };
  }
  return null;
}

/**
 * Get full version history of a rule — every change with provenance
 */
export function getRuleHistory(ruleId) {
  return getRuleChangelog(ruleId);
}

// ── Block Progression ────────────────────────────────────────────────────

/**
 * Get block progression map for a student — position + fear gate status
 */
export function getBlockProgression(studentProfile) {
  const current = studentProfile?.currentBlock || 1;
  return {
    blocks: BLOCKS,
    currentBlock: current,
    currentBlockName: (BLOCKS.find(b => b.id === current) || BLOCKS[0]).name,
    gateStatus: {
      fear_gate: current >= 5 ? 'passed' : current === 4 ? 'approaching' : 'not_reached'
    }
  };
}

// ── CLI (node coaching-engine.js seeds|extract|proposals|rules) ──────────

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(path.join(HOME, 'nanoclaw', 'coaching-engine.js'));
if (isDirectRun) {
  const cmd = process.argv[2];
  if (cmd === 'seeds') console.log(JSON.stringify(loadVaultSeeds(), null, 2));
  else if (cmd === 'extract') console.log(JSON.stringify(await extractPatterns(parseInt(process.argv[3], 10) || 3), null, 2));
  else if (cmd === 'proposals') console.log(JSON.stringify(getPendingProposals(), null, 2));
  else if (cmd === 'rules') console.log(JSON.stringify(getRules({ status: process.argv[3] || 'approved' }), null, 2));
  else if (cmd) console.log('Unknown command. Use: seeds | extract [minObs] | proposals | rules [status]');
}


---

# SOURCE CODE: Module 5c — sovereignty-shrink.js (Training Data Pipeline)

// sovereignty-shrink.js — Sovereignty Shrink Module (Local Model Distillation, pre-hardware)
// ESM module
//
// "Rent the frontier, own the accumulation" made literal: frontier/vault knowledge →
// instruction-response training pairs → (hardware-gated) MLX LoRA fine-tune →
// hermes3-cathedral → validation → sovereign local coach.
//
// ═══════════════════════════════════════════════════════════════════════════
// HARDWARE GATE: LoRA training is BLOCKED until M5 Mac Studio (M5 Max, 128GB,
// ~Oct 2026). Current M4 16GB can run hermes3 (8B) for inference + data
// generation, but NOT train. Everything in this file that runs NOW:
//   - Training data generator   (vault, coaching rules, interventions, taste map)
//   - Test query set             (sovereignty-test-queries.json — 25 queries)
//   - Validation harness         (runs against any Ollama model, scores 4 dims)
//   - Cost tracker + estimator   (training run log + M5 time estimates)
// The only stubbed function is trainModel() at the bottom.
// ═══════════════════════════════════════════════════════════════════════════
//
// Spec: ~/nanoclaw/scaffolds/5c-sovereignty-shrink.md
// Sibling: coaching-engine.js (the knowledge being distilled)

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const HOME = process.env.HOME;
const NANO = path.join(HOME, 'nanoclaw');
const VAULT = path.join(HOME, 'cathedral-vault');

const TRAINING_DATA_PATH = path.join(NANO, 'sovereignty-training-data.json');
const TRAINING_LOG_PATH = path.join(NANO, 'sovereignty-training-log.json');
const TEST_QUERIES_PATH = path.join(NANO, 'sovereignty-test-queries.json');
const GEN_PROMPT_PATH = path.join(NANO, 'prompts', 'training-data-gen.txt');
const RULES_PATH = path.join(NANO, 'coaching-rules.json');
const INTERVENTIONS_PATH = path.join(NANO, 'coaching-interventions.json');
const TASTE_MAP_PATH = path.join(NANO, 'taste-map.json');
const DEFAULT_JSONL_PATH = path.join(NANO, 'training', 'data', 'cathedral-training.jsonl');

const OLLAMA_URL = 'http://localhost:11434';
const GEN_MODEL = 'hermes3'; // SI-24: hermes3 for all local tasks, never gemma4:26b

function loadJSON(p, fallback = []) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
function saveJSON(p, d) { fs.writeFileSync(p, JSON.stringify(d, null, 2)); }
function today() { return new Date().toISOString().split('T')[0]; }
function hash(s) { return crypto.createHash('sha1').update(s).digest('hex').slice(0, 12); }

// ── Ollama ────────────────────────────────────────────────────────────────

async function askOllama(model, prompt, system = null, timeoutMs = 180000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body = { model, prompt, stream: false };
    if (system) body.system = system;
    const resp = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!resp.ok) throw new Error(`ollama http ${resp.status}`);
    const data = await resp.json();
    return data.response || '';
  } finally {
    clearTimeout(timer);
  }
}

// Models love wrapping JSON in prose/fences — pull the array out.
function extractJSONArray(text) {
  if (!text) return null;
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

// ═════════════════════════ TRAINING DATA GENERATOR ═══════════════════════

// Instruction types the pipeline produces (spec 5c)
export const INSTRUCTION_TYPES = [
  'coaching_diagnosis',   // situation → observation + prescription
  'technique_metaphor',   // technique → life lesson mapping
  'student_assessment',   // first session data → initial diagnosis
  'plateau_detection',    // session history → what's stalling and why
  'block_progression',    // student profile → ready for next block?
  'fear_gate_assessment'  // approaching block 4→5 → emotion engine reading
];

// Read the instruction type off a piece of source text (heuristic tagging —
// the training pair metadata, not the intelligence).
function classifyInstructionType(text) {
  const t = String(text || '').toLowerCase();
  if (/(fear gate|4→5|4 to 5|sparring entry|trap door|alarm|floor element)/.test(t)) return 'fear_gate_assessment';
  if (/(plateau|flatlin|stall|no change across|stuck for)/.test(t)) return 'plateau_detection';
  if (/(first session|new student|initial assessment|starting block|assess)/.test(t)) return 'student_assessment';
  if (/(next block|block progression|ready for|gate.*pass|progress.*block)/.test(t)) return 'block_progression';
  if (/(metaphor|life lesson|like life|off the canvas|outside the ring|analogy|bridge)/.test(t)) return 'technique_metaphor';
  return 'coaching_diagnosis';
}

function classifyDomain(text) {
  const t = String(text || '').toLowerCase();
  if (/(music|track|playlist|bpm|taste|aesthetic|design|visual)/.test(t)) return 'taste';
  if (/(fear|composure|emotion|nervous|anxi|panic|froze)/.test(t)) return 'coaching_emotion';
  if (/(decision|overthink|timing|read|strategy|pattern|mind)/.test(t)) return 'coaching_mind';
  return 'coaching_body';
}

// ── Source readers — one per source type ─────────────────────────────────

// Coaching-related vault nuggets: markdown files in Refined Gold + Methods whose
// name or first lines hit coaching keywords, split into heading-sections.
const VAULT_DIRS = [
  { dir: path.join(VAULT, '02_Refined_Gold', 'cathedral'), quality: 0.9 },
  { dir: path.join(VAULT, '02_Refined_Gold'), quality: 0.9 },
  { dir: path.join(VAULT, '06_Methods'), quality: 0.75 }
];
const COACHING_KEYWORDS = /(coach|boxing|fighter|student|sparring|fear.gate|three.engines|diagnostic|guard|jab|footwork|block.progression|composure|syllabus|drill)/i;

function readVaultNuggets(filters = {}) {
  const nuggets = [];
  const seen = new Set();
  for (const { dir, quality } of VAULT_DIRS) {
    let files = [];
    try { files = fs.readdirSync(dir).filter(f => f.endsWith('.md')); } catch { continue; }
    for (const f of files) {
      const full = path.join(dir, f);
      if (seen.has(full)) continue;
      seen.add(full);
      let content = '';
      try { content = fs.readFileSync(full, 'utf8'); } catch { continue; }
      // Coaching filter: filename or content must be coaching-related
      if (!COACHING_KEYWORDS.test(f) && !COACHING_KEYWORDS.test(content.slice(0, 2000))) continue;
      if (filters.file && !f.includes(filters.file)) continue;
      // Split into heading-sections; each substantial section is a nugget
      const sections = content.split(/\n(?=#{1,3} )/);
      for (const sec of sections) {
        const body = sec.trim();
        if (body.length < 200 || body.length > 6000) continue; // too thin / too big to be one pair
        const title = (body.match(/^#{1,3}\s+(.+)/) || [])[1] || f.replace('.md', '');
        nuggets.push({
          type: 'vault_nugget',
          title,
          content: body,
          file: full.replace(VAULT + '/', 'vault:'),
          quality
        });
      }
    }
  }
  return filters.limit ? nuggets.slice(0, filters.limit) : nuggets;
}

// Approved coaching rules with evidence (coaching-rules.json).
// Default: approved + hypothesis (vault seeds ARE Paul's methodology — quality-
// weighted lower). Pass { status: 'approved' } to restrict to earned rules only.
function readCoachingRules(filters = {}) {
  let rules = loadJSON(RULES_PATH);
  const status = filters.status || ['approved', 'hypothesis'];
  const wanted = Array.isArray(status) ? status : [status];
  rules = rules.filter(r => wanted.includes(r.status));
  if (filters.engine) rules = rules.filter(r => r.conditions?.engine === filters.engine);
  return rules.map(r => ({
    type: 'coaching_rule',
    title: r.id,
    rule: r.rule,
    instruction_text: r.prescription?.instruction || '',
    trigger: r.conditions?.trigger || '',
    engine: r.conditions?.engine || 'body',
    blockRange: r.conditions?.block_range || [1, 10],
    content: `RULE: ${r.rule}\nTRIGGER: ${r.conditions?.trigger || '?'}\nENGINE: ${r.conditions?.engine || '?'}\nPRESCRIPTION: ${r.prescription?.instruction || ''}`,
    file: r.evidence?.file ? `vault:${r.evidence.file}` : `rules:${r.id}`,
    quality: r.status === 'approved' ? Math.max(r.confidence || 0.7, 0.7) : 0.65
  }));
}

// Logged interventions WITH outcomes (coaching-interventions.json) — Paul's live
// coaching, the highest-provenance data there is. Outcome-less logs excluded by
// default (no ground truth on whether the prescription worked).
function readInterventions(filters = {}) {
  let log = loadJSON(INTERVENTIONS_PATH);
  if (!filters.includeNoOutcome) log = log.filter(i => i.outcome);
  if (filters.student) log = log.filter(i => (i.student || '').toLowerCase() === filters.student.toLowerCase());
  return log.map(i => ({
    type: 'intervention',
    title: i.id,
    observation: i.observation || '',
    intervention: i.intervention || '',
    reasoning: i.reasoning || '',
    outcome: i.outcome || '',
    block: i.context?.block,
    content: `OBSERVED: ${i.observation || ''}\nPAUL DID: ${i.intervention || ''}\nREASONING: ${i.reasoning || ''}\nOUTCOME: ${i.outcome || '(none logged)'}`,
    file: `interventions:${i.id}`,
    quality: /improv|better|worked|fixed|held|clicked|breakthrough/i.test(i.outcome || '') ? 0.85 : 0.7
  }));
}

// Taste map anchors (taste-map.json) — Paul's preference engine. Trains the
// model's taste/voice dimension, not the coaching diagnostics.
function readTasteAnchors(filters = {}) {
  const map = loadJSON(TASTE_MAP_PATH, {});
  const out = [];
  if (map.meta_pattern) {
    out.push({
      type: 'taste_anchor', title: 'meta_pattern',
      content: `PAUL'S VOICE META-PATTERN: ${map.meta_pattern}`,
      file: 'taste-map:meta_pattern', quality: 0.85
    });
  }
  for (const rej of map.rejections || []) {
    out.push({
      type: 'taste_anchor', title: `rejection:${rej.pattern}`,
      content: `PAUL REJECTS: "${rej.pattern}" — reason: ${rej.reason}`,
      file: 'taste-map:rejections', quality: 0.8
    });
  }
  // Domain-level anchor clusters (e.g. music anchors_class_energy) — one nugget per cluster
  for (const [domain, dObj] of Object.entries(map.domains || {})) {
    if (filters.domain && domain !== filters.domain) continue;
    for (const [key, val] of Object.entries(dObj)) {
      if (!Array.isArray(val) || !val.length || typeof val[0] !== 'object') continue;
      const summary = val.slice(0, 12).map(a => JSON.stringify(a)).join('\n');
      out.push({
        type: 'taste_anchor', title: `${domain}:${key}`,
        content: `PAUL'S ${domain.toUpperCase()} TASTE (${key}):\n${summary}`,
        file: `taste-map:${domain}.${key}`, quality: 0.7
      });
    }
  }
  return filters.limit ? out.slice(0, filters.limit) : out;
}

// ── Pair construction ─────────────────────────────────────────────────────

// Deterministic base pair from a source — always produced, even with Ollama down.
// hermes3 adds DIVERSE phrasings on top; it never replaces the grounded base.
function basePairFor(source) {
  const t = source.type;
  if (t === 'coaching_rule') {
    return {
      instruction: `A situation matching "${String(source.trigger).replace(/_/g, ' ')}" appears with a student in blocks ${source.blockRange[0]}-${source.blockRange[1]}. What do you observe and prescribe?`,
      input: '',
      output: `${source.rule} ${source.instruction_text ? `Prescription: ${source.instruction_text}` : ''}`.trim()
    };
  }
  if (t === 'intervention') {
    return {
      instruction: `Session observation${source.block ? ` (student in Block ${source.block})` : ''}: ${source.observation} What would you do and why?`,
      input: '',
      output: `${source.intervention}${source.reasoning ? ` — ${source.reasoning}` : ''}${source.outcome ? ` (Outcome when applied: ${source.outcome})` : ''}`.trim()
    };
  }
  if (t === 'taste_anchor') {
    return {
      instruction: source.title === 'meta_pattern'
        ? 'What is the voice standard for anything Coach Paul-facing?'
        : source.title.startsWith('rejection:')
          ? `Is "${source.title.replace('rejection:', '')}" acceptable in output for Paul?`
          : `What does Paul's taste map say about ${source.title.replace(':', ' / ')}?`,
      input: '',
      output: source.content
    };
  }
  // vault_nugget — instruction from the title, output is the nugget essence
  return {
    instruction: `Explain "${source.title}" the way Coach Paul teaches it.`,
    input: '',
    output: source.content.replace(/^#{1,3}\s+.+\n/, '').trim().slice(0, 1800)
  };
}

// Wrap a raw {instruction,input,output} into a full stored training pair
function finalizePair(raw, source, generatedBy) {
  const text = `${raw.instruction} ${raw.output}`;
  return {
    id: `pair_${hash(raw.instruction + raw.output)}`,
    instruction: String(raw.instruction || '').trim(),
    input: String(raw.input || '').trim(),
    output: String(raw.output || '').trim(),
    source: source.file,
    source_type: source.type,
    instruction_type: classifyInstructionType(text),
    domain: source.type === 'taste_anchor' ? 'taste' : classifyDomain(text),
    quality_score: source.quality,
    generated_by: generatedBy,
    created: today()
  };
}

/**
 * Convert ONE source (vault nugget / coaching rule / intervention / taste anchor)
 * into training pairs. hermes3 generates 3-5 diverse phrasings from the same
 * material; a deterministic base pair is always included as ground truth.
 * @param {object} source — object from one of the read* functions, or
 *   { type, content, title?, file?, quality? } supplied directly
 * @param {object} opts — { useHermes: true }
 * @returns {Promise<Array>} training pairs (NOT yet persisted)
 */
export async function generateTrainingPair(source, opts = {}) {
  if (!source || !source.content) {
    if (source && (source.rule || source.observation)) { /* rules/interventions carry content too */ }
    else throw new Error('generateTrainingPair: source with .content required');
  }
  source.quality = source.quality ?? 0.6;
  source.file = source.file || `adhoc:${hash(source.content || '')}`;
  source.type = source.type || 'vault_nugget';

  const base = basePairFor(source);
  const pairs = [finalizePair(base, source, 'deterministic')];

  if (opts.useHermes === false) return pairs;

  // hermes3 diversification — SI-15: prompt carries Cathedral context + evidence-only rule
  try {
    const system = fs.readFileSync(GEN_PROMPT_PATH, 'utf8');
    const prompt = `SOURCE MATERIAL (use ONLY this):\n\n${source.content}\n\nGenerate 3-5 diverse instruction-response pairs from this source.`;
    const reply = await askOllama(GEN_MODEL, prompt, system);
    const variants = extractJSONArray(reply) || [];
    for (const v of variants) {
      if (!v || !v.instruction || !v.output) continue;
      if (String(v.output).length < 40) continue; // too thin to teach anything
      pairs.push(finalizePair(v, source, GEN_MODEL));
    }
  } catch {
    // Ollama down / garbage reply — the deterministic base pair still stands.
  }
  return pairs;
}

/**
 * Batch generate training pairs from a source type and persist them (deduped).
 * @param {string} sourceType — 'vault' | 'rules' | 'interventions' | 'taste' | 'all'
 * @param {object} filters — passed to the source reader; plus:
 *   { limit: max sources this run, useHermes: true, verbose: false }
 * @returns {Promise<object>} { sourcesRead, pairsGenerated, pairsStored, duplicatesSkipped }
 */
export async function batchGenerate(sourceType = 'all', filters = {}) {
  const readers = {
    vault: readVaultNuggets,
    rules: readCoachingRules,
    interventions: readInterventions,
    taste: readTasteAnchors
  };
  const types = sourceType === 'all' ? Object.keys(readers) : [sourceType];
  if (types.some(t => !readers[t])) throw new Error(`Unknown sourceType "${sourceType}". Use: vault | rules | interventions | taste | all`);

  let sources = [];
  for (const t of types) sources = sources.concat(readers[t](filters));
  if (filters.limit) sources = sources.slice(0, filters.limit);

  const store = loadJSON(TRAINING_DATA_PATH);
  const existing = new Set(store.map(p => p.id));
  let generated = 0, stored = 0, dupes = 0;

  for (const src of sources) {
    const pairs = await generateTrainingPair(src, { useHermes: filters.useHermes !== false });
    generated += pairs.length;
    for (const p of pairs) {
      if (existing.has(p.id)) { dupes++; continue; }
      store.push(p);
      existing.add(p.id);
      stored++;
    }
    if (filters.verbose) console.log(`  ${src.type} :: ${src.title} → ${pairs.length} pairs`);
    if (stored && stored % 25 === 0) saveJSON(TRAINING_DATA_PATH, store); // checkpoint long runs
  }

  saveJSON(TRAINING_DATA_PATH, store);
  return { sourcesRead: sources.length, pairsGenerated: generated, pairsStored: stored, duplicatesSkipped: dupes, totalInStore: store.length };
}

/**
 * Training data stats — count by source type, instruction type, domain, generator.
 */
export function getTrainingStats() {
  const store = loadJSON(TRAINING_DATA_PATH);
  const count = (key) => store.reduce((acc, p) => { const k = p[key] || 'unknown'; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
  return {
    total: store.length,
    bySourceType: count('source_type'),
    byInstructionType: count('instruction_type'),
    byDomain: count('domain'),
    byGenerator: count('generated_by'),
    avgQuality: store.length ? Math.round(store.reduce((a, p) => a + (p.quality_score || 0), 0) / store.length * 100) / 100 : 0,
    readyForTraining: store.length >= 500 // spec test criterion #1
  };
}

/**
 * Export all pairs to JSONL for MLX LoRA training ({instruction,input,output} per line).
 * @param {string} outputPath — default ~/nanoclaw/training/data/cathedral-training.jsonl
 * @param {object} opts — { minQuality: 0 } filter low-quality pairs out of the training set
 */
export function exportJSONL(outputPath = DEFAULT_JSONL_PATH, opts = {}) {
  const store = loadJSON(TRAINING_DATA_PATH);
  const minQ = opts.minQuality || 0;
  const rows = store.filter(p => (p.quality_score || 0) >= minQ);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const lines = rows.map(p => JSON.stringify({ instruction: p.instruction, input: p.input || '', output: p.output }));
  fs.writeFileSync(outputPath, lines.join('\n') + (lines.length ? '\n' : ''));
  return { written: rows.length, skippedBelowQuality: store.length - rows.length, outputPath };
}

// ═════════════════════════ VALIDATION HARNESS ════════════════════════════

/**
 * The curated test query set (25 queries: 5 diagnostic, 5 prescription,
 * 5 metaphor, 5 edge case, 5 anti-pattern). Source of truth:
 * sovereignty-test-queries.json — edit there, not here.
 */
export function getTestQueries() {
  const q = loadJSON(TEST_QUERIES_PATH);
  if (!q.length) throw new Error(`No test queries at ${TEST_QUERIES_PATH}`);
  return q;
}

// Paul-lexicon markers — used for the lexicon_match dimension on every query,
// on top of the per-query expected terms.
const PAUL_LEXICON = [
  'fear gate', 'three engines', 'engine', 'leak', 'composure', 'floor element',
  'alarm, not', 'trap door', 'block', 'gate', 'energy', 'organize', 'cultivate',
  'protect', 'wound', 'underneath', 'concrete image', 'mechanism', 'checkpoint',
  'accumulat', 'evidence', 'survived'
];

// Fraction of terms present in text (case-insensitive substring), capped at 1
function termHitRate(text, terms) {
  if (!terms || !terms.length) return null;
  const t = text.toLowerCase();
  const hits = terms.filter(term => t.includes(String(term).toLowerCase())).length;
  return hits / terms.length;
}

// Score one model response against one test query. Heuristic, deterministic,
// works offline — the same yardstick applied to base / distilled / frontier.
export function scoreResponse(query, response) {
  const text = String(response || '');
  const t = text.toLowerCase();
  const exp = query.expect || {};

  // lexicon_match: per-query expected lexicon (weighted) + general Paul lexicon
  const qLex = termHitRate(t, exp.lexicon);
  const gLex = Math.min((PAUL_LEXICON.filter(w => t.includes(w)).length) / 4, 1); // 4+ general markers = full
  const lexicon_match = qLex === null ? gLex : Math.round((qLex * 0.7 + gLex * 0.3) * 100) / 100;

  // domain_accuracy: does the response hit the substance the query is probing?
  const domain_accuracy = Math.round((termHitRate(t, exp.domain_keywords) ?? 0.5) * 100) / 100;

  // reasoning_depth: causal structure + a prescription + sane length (not a wall of text)
  const causal = (t.match(/\b(because|so that|which means|therefore|correlate|the mechanism|that's why|underneath|not .{1,20}, it's)\b/g) || []).length;
  const prescribes = /\b(prescrib|drill|cue|try|switch to|start with|have them|ask|check|watch for)\b/.test(t);
  const lengthOk = text.length >= 120 && text.length <= 1600; // walls of text are a Paul rejection
  const reasoning_depth = Math.round(Math.min(
    (Math.min(causal, 3) / 3) * 0.5 + (prescribes ? 0.3 : 0) + (lengthOk ? 0.2 : 0), 1) * 100) / 100;

  // pauls_voice: penalize the never-say list hard; penalize known slop patterns
  let voice = 1.0;
  for (const banned of (exp.must_avoid || [])) {
    if (t.includes(String(banned).toLowerCase())) voice -= 0.4;
  }
  for (const slop of ['as an ai', 'it should be noted', 'in summary', 'unleash your', 'inner warrior', 'safe space']) {
    // 'safe space' only penalized when used as the announcement, not when the
    // response is correctly REJECTING the announcement
    if (slop === 'safe space' && /never|without|don't say|avoid|instead|rather than|not by saying/.test(t)) continue;
    if (t.includes(slop)) voice -= 0.25;
  }
  const pauls_voice = Math.round(Math.max(voice, 0) * 100) / 100;

  const composite = Math.round((lexicon_match * 0.25 + reasoning_depth * 0.25 + domain_accuracy * 0.25 + pauls_voice * 0.25) * 100) / 100;
  return { lexicon_match, reasoning_depth, domain_accuracy, pauls_voice, composite };
}

/**
 * Run test queries against an Ollama model and score every response.
 * @param {string} modelName — any Ollama model (hermes3, hermes3-cathedral, ...)
 * @param {Array} testQueries — defaults to the full curated set
 * @returns {Promise<object>} ValidationReport
 */
export async function validateModel(modelName, testQueries = null) {
  const queries = testQueries || getTestQueries();
  const results = [];
  const system = 'You are Coach Paul of Basic Reflex, a boxing gym in Hong Kong. Answer as the coach: diagnostic, metaphorical, precise, concrete. Short paragraphs, no lists of ten pointers, no guru talk.';

  for (const q of queries) {
    let response = '', error = null;
    try { response = await askOllama(modelName, q.query, system); }
    catch (e) { error = e.message; }
    results.push({
      id: q.id, category: q.category, query: q.query,
      response: response.trim(), error,
      scores: error ? { lexicon_match: 0, reasoning_depth: 0, domain_accuracy: 0, pauls_voice: 0, composite: 0 } : scoreResponse(q, response)
    });
  }

  const avg = (key) => Math.round(results.reduce((a, r) => a + r.scores[key], 0) / results.length * 100) / 100;
  const byCategory = {};
  for (const r of results) {
    (byCategory[r.category] = byCategory[r.category] || []).push(r.scores.composite);
  }
  for (const [k, v] of Object.entries(byCategory)) byCategory[k] = Math.round(v.reduce((a, b) => a + b, 0) / v.length * 100) / 100;

  return {
    model: modelName,
    date: today(),
    queriesRun: results.length,
    averages: { lexicon_match: avg('lexicon_match'), reasoning_depth: avg('reasoning_depth'), domain_accuracy: avg('domain_accuracy'), pauls_voice: avg('pauls_voice'), composite: avg('composite') },
    byCategory,
    results
  };
}

/**
 * Run the same queries against two models, side by side. This is the
 * post-M5 acceptance test: distilled must beat base by >20% composite.
 * @returns {Promise<object>} ComparisonTable
 */
export async function compareModels(modelA, modelB, testQueries = null) {
  const queries = testQueries || getTestQueries();
  const [repA, repB] = [await validateModel(modelA, queries), await validateModel(modelB, queries)];

  const rows = queries.map((q, i) => {
    const a = repA.results[i].scores.composite;
    const b = repB.results[i].scores.composite;
    return {
      id: q.id, category: q.category,
      [modelA]: a, [modelB]: b,
      winner: a > b ? modelA : b > a ? modelB : 'tie'
    };
  });

  const cA = repA.averages.composite, cB = repB.averages.composite;
  const improvementPct = cA > 0 ? Math.round(((cB - cA) / cA) * 1000) / 10 : null;

  return {
    date: today(),
    models: [modelA, modelB],
    averages: { [modelA]: repA.averages, [modelB]: repB.averages },
    wins: {
      [modelA]: rows.filter(r => r.winner === modelA).length,
      [modelB]: rows.filter(r => r.winner === modelB).length,
      tie: rows.filter(r => r.winner === 'tie').length
    },
    // Spec: distilled must beat base on Paul-specific tasks by >20%
    improvementPctBOverA: improvementPct,
    passesShrinkGate: improvementPct !== null && improvementPct > 20,
    rows,
    fullReports: { [modelA]: repA, [modelB]: repB }
  };
}

// ═════════════════════════ COST TRACKER ══════════════════════════════════

/**
 * Record a training run. (Pre-hardware: also usable for dry-run estimates —
 * tag config.dryRun = true.)
 * @param {object} config — { model, datasetSize, iterations, batchSize, hardware, dryRun? }
 * @param {object} metrics — { timeMinutes, peakMemoryGB, validationScore, notes }
 */
export function logTrainingRun(config = {}, metrics = {}) {
  const log = loadJSON(TRAINING_LOG_PATH);
  const run = {
    id: `run_${Date.now()}`,
    date: today(),
    config: {
      model: config.model || GEN_MODEL,
      datasetSize: config.datasetSize ?? null,
      iterations: config.iterations ?? null,
      batchSize: config.batchSize ?? 4,
      hardware: config.hardware || 'M4 16GB (pre-M5)',
      dryRun: config.dryRun === true
    },
    metrics: {
      timeMinutes: metrics.timeMinutes ?? null,
      peakMemoryGB: metrics.peakMemoryGB ?? null,
      validationScore: metrics.validationScore ?? null,
      notes: metrics.notes || ''
    }
  };
  log.push(run);
  saveJSON(TRAINING_LOG_PATH, log);
  return run;
}

/**
 * All training runs, plus which run currently holds the best validation score.
 */
export function getTrainingHistory() {
  const log = loadJSON(TRAINING_LOG_PATH);
  const scored = log.filter(r => typeof r.metrics?.validationScore === 'number');
  const best = scored.sort((a, b) => b.metrics.validationScore - a.metrics.validationScore)[0] || null;
  return { runs: log, count: log.length, bestRun: best };
}

/**
 * Estimate a LoRA training run on current and target hardware.
 * Rough MLX LoRA arithmetic for an 8B model, 4-bit base, rank-16 adapters:
 * throughput ≈ tokens/sec on the given chip; each iteration processes
 * batchSize × avgTokensPerPair tokens.
 * These are planning numbers, not benchmarks — recalibrate against the first
 * real run on the M5 (logTrainingRun the actuals).
 */
export function estimateCost(datasetSize, iterations, opts = {}) {
  const batchSize = opts.batchSize || 4;
  const avgTokensPerPair = opts.avgTokensPerPair || 350; // instruction+output, coaching pairs are short
  const tokensPerIter = batchSize * avgTokensPerPair;
  const totalTokens = tokensPerIter * iterations;
  const epochs = datasetSize ? Math.round((iterations * batchSize / datasetSize) * 10) / 10 : null;

  const HW = [
    // tokensPerSec = training throughput estimate for 8B 4-bit LoRA under MLX
    { name: 'M4 16GB (current)', tokensPerSec: 60, feasible8B: false, note: 'BLOCKED — 16GB cannot hold 8B training + inference. Hardware gate.' },
    { name: 'M5 Max 128GB (target, ~Oct 2026)', tokensPerSec: 350, feasible8B: true, note: 'Room for 14B+ training with simultaneous inference.' }
  ];

  return {
    datasetSize, iterations, batchSize, avgTokensPerPair,
    totalTrainingTokens: totalTokens,
    approxEpochs: epochs,
    perHardware: HW.map(h => ({
      hardware: h.name,
      feasible: h.feasible8B,
      estimatedMinutes: Math.round(totalTokens / h.tokensPerSec / 60),
      estimatedHours: Math.round(totalTokens / h.tokensPerSec / 3600 * 10) / 10,
      note: h.note
    })),
    electricityNote: 'Local training electricity cost is negligible (<HK$5/run on Apple Silicon) — the real cost is time and the hardware itself. Zero API spend: that is the point.'
  };
}

// ═════════════════════════ TRAINING (HARDWARE-GATED STUB) ════════════════

/**
 * ██ HARDWARE GATE ██
 * LoRA training is BLOCKED until the M5 Mac Studio (M5 Max, 128GB, ~Oct 2026).
 * The M4 16GB cannot hold an 8B model's training pass — do not attempt.
 *
 * When the M5 arrives, this becomes (per spec 5c Stage 2 / master-architecture Phase 5):
 *   1. exportJSONL()                     → ~/nanoclaw/training/data/
 *   2. pip install mlx-lm
 *   3. mlx_lm.lora --model hermes3 --data ~/nanoclaw/training/data/ --train \
 *        --iters 1000 --batch-size 4     → adapters in ~/nanoclaw/training/adapters/
 *   4. mlx_lm.fuse --model hermes3 --adapter-path adapters/ --save-path hermes3-cathedral
 *   5. ollama create hermes3-cathedral -f Modelfile
 *   6. compareModels('hermes3', 'hermes3-cathedral') → must beat base by >20%
 *   7. logTrainingRun(config, actualMetrics)         → recalibrate estimateCost
 *   8. taste-gate.mjs switches local queries to the distilled model
 */
export async function trainModel() {
  const msg = 'HARDWARE-GATED: LoRA training blocked until M5 Mac Studio (M5 Max 128GB, ~Oct 2026). ' +
    'The data pipeline is live NOW — run batchGenerate + exportJSONL so the training set is ready the day the hardware lands.';
  return { blocked: true, gate: 'M5 Mac Studio ~Oct 2026', message: msg };
}

// ═════════════════════════ CLI ═══════════════════════════════════════════
// node sovereignty-shrink.js generate [vault|rules|interventions|taste|all] [limit]
// node sovereignty-shrink.js stats | export [path] | queries
// node sovereignty-shrink.js validate <model> | compare <modelA> <modelB>
// node sovereignty-shrink.js estimate <datasetSize> <iterations> | history | train

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(path.join(NANO, 'sovereignty-shrink.js'));
if (isDirectRun) {
  const [, , cmd, a, b] = process.argv;
  const out = (o) => console.log(JSON.stringify(o, null, 2));
  if (cmd === 'generate') out(await batchGenerate(a || 'all', { limit: b ? parseInt(b, 10) : undefined, verbose: true }));
  else if (cmd === 'stats') out(getTrainingStats());
  else if (cmd === 'export') out(exportJSONL(a || undefined));
  else if (cmd === 'queries') out(getTestQueries().map(q => `${q.category} :: ${q.id}`));
  else if (cmd === 'validate') out(await validateModel(a || GEN_MODEL));
  else if (cmd === 'compare') out(await compareModels(a || GEN_MODEL, b || `${GEN_MODEL}-cathedral`));
  else if (cmd === 'estimate') out(estimateCost(parseInt(a, 10) || 500, parseInt(b, 10) || 1000));
  else if (cmd === 'history') out(getTrainingHistory());
  else if (cmd === 'train') out(await trainModel());
  else if (cmd) console.log('Usage: generate [type] [limit] | stats | export [path] | queries | validate <model> | compare <a> <b> | estimate <size> <iters> | history | train');
}


---

# SOURCE CODE: Module 5d — agent-protocol.js (A2A Exchange)

// agent-protocol.js — Sovereign Agent-to-Agent Exchange (Cathedral Agent Protocol)
// ESM module
//
// v2: CAPABILITY-BASED, not agent-based. External counterparties invoke capabilities
// (EvaluateBoxingSession, GetStudentProgress) — never agents. Borrows the Agent Card
// pattern from Google's A2A protocol but stays closed + permissioned: a castle with
// a drawbridge, not a marketplace stall.
//
// SOVEREIGNTY (non-negotiable): never expose rules, evidence chains, confidence
// scores, rule IDs, vault content, decision records, or any internal state in
// outbound messages. Input → process → output only. The coaching engine's internals
// (diagnose() returns confidence/ruleId/evidence/paulsWords) are stripped here —
// the counterparty sees only the recommendation.
//
// Spec: ~/nanoclaw/scaffolds/5d-agent-protocol.md
// Routes into cath-bridge.cjs + Telegram commands are wired separately (Paul).

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { diagnose } from './coaching-engine.js';

const HOME = process.env.HOME;
const REGISTRY_PATH = path.join(HOME, 'nanoclaw', 'agent-protocol-registry.json');
const LOG_PATH = path.join(HOME, 'nanoclaw', 'agent-protocol-log.json');
const CAPABILITIES_PATH = path.join(HOME, 'nanoclaw', 'agent-capabilities.json');
const STUDENTS_PATH = path.join(HOME, 'nanoclaw', 'gym-eyes-students.json');

const PROTOCOL_VERSION = 'cathedral-agent-v1';
const NEXT_CHECK_DAYS = 14; // coaching cadence: re-check in two weeks

// ── Storage helpers ──────────────────────────────────────────────────────

function loadJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
function saveJSON(p, d) { fs.writeFileSync(p, JSON.stringify(d, null, 2)); }

function loadRegistry() { return loadJSON(REGISTRY_PATH) || { counterparties: [] }; }
function saveRegistry(reg) { saveJSON(REGISTRY_PATH, reg); }
function loadLog() { return loadJSON(LOG_PATH) || []; }

// Fallback capability registry — used only if agent-capabilities.json is missing.
// The file on disk is the source of truth.
const DEFAULT_CAPABILITIES = {
  capabilities: [
    {
      name: 'EvaluateBoxingSession',
      version: '1.0',
      description: 'Analyze boxing training session data and return coaching diagnoses + drill prescriptions',
      inputSchema: {
        sessions: 'array of { date, type, duration_min, drills, self_rating, notes }',
        goals: 'array of strings',
        constraints: 'array of strings (injuries, limitations)'
      },
      outputSchema: {
        diagnoses: 'array of { area, finding, priority }',
        prescriptions: 'array of { drill, description, frequency, duration }',
        constraints_acknowledged: 'array of strings',
        next_check: 'ISO date'
      },
      requiredPermission: 'send_training_log'
    },
    {
      name: 'GetStudentProgress',
      version: '1.0',
      description: 'Return progress summary for a registered student',
      inputSchema: { studentId: 'string' },
      outputSchema: {
        totalSessions: 'number',
        currentLevel: 'string',
        recentMilestones: 'array of strings',
        trend: 'string'
      },
      requiredPermission: 'view_progress'
    }
  ]
};

function loadCapabilities() {
  return loadJSON(CAPABILITIES_PATH) || DEFAULT_CAPABILITIES;
}

function appendLog(entry) {
  const log = loadLog();
  log.push({ ...entry, timestamp: entry.timestamp || new Date().toISOString() });
  saveJSON(LOG_PATH, log);
}

// ── Rate limiting ────────────────────────────────────────────────────────

// Parse "10/day", "60/hour", "5/min" → { limit, windowMs, window }
function parseRateLimit(spec) {
  const m = String(spec || '10/day').match(/^(\d+)\s*\/\s*(day|hour|min|minute)s?$/i);
  if (!m) return { limit: 10, windowMs: 86400000, window: 'day' };
  const windows = { day: 86400000, hour: 3600000, min: 60000, minute: 60000 };
  const unit = m[2].toLowerCase();
  return { limit: parseInt(m[1], 10), windowMs: windows[unit], window: unit === 'minute' ? 'min' : unit };
}

// Count PROCESSED exchanges (not the 429 rejections themselves) for a counterparty
// within the rate window. Returns { used, limit, window, remaining, retryAfterSec }.
function rateUsage(counterpartyId, rateLimitSpec) {
  const { limit, windowMs, window } = parseRateLimit(rateLimitSpec);
  const cutoff = Date.now() - windowMs;
  const inWindow = loadLog().filter(e =>
    e.direction === 'exchange' &&
    e.counterparty === counterpartyId &&
    e.status !== 429 &&
    new Date(e.timestamp).getTime() >= cutoff
  );
  const used = inWindow.length;
  let retryAfterSec = 0;
  if (used >= limit && inWindow.length) {
    const oldest = Math.min(...inWindow.map(e => new Date(e.timestamp).getTime()));
    retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - Date.now()) / 1000));
  }
  return { used, limit, window, remaining: Math.max(0, limit - used), retryAfterSec };
}

// ── Outbound builders (sovereignty boundary lives here) ─────────────────

function buildOutbound(inbound, payload, status = 200, extra = {}) {
  return {
    protocol: PROTOCOL_VERSION,
    capability: inbound?.capability || null,
    version: inbound?.version || null,
    counterparty: inbound?.counterparty?.id || null,
    status,
    payload,
    timestamp: new Date().toISOString(),
    ...extra
  };
}

function buildError(inbound, status, errors) {
  return buildOutbound(inbound, null, status, { errors: Array.isArray(errors) ? errors : [errors] });
}

// Turn a prescription instruction into a stable drill slug ("30s guard hold between
// every round" → "30s_guard_hold_between"). Cosmetic identifier only — reveals nothing internal.
function drillSlug(text, fallback) {
  const words = String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/).slice(0, 4);
  return words.length ? words.join('_') : (fallback || 'coach_prescription');
}

function isoDatePlusDays(days) {
  return new Date(Date.now() + days * 86400000).toISOString().split('T')[0];
}

// ── Capability handlers ──────────────────────────────────────────────────

// EvaluateBoxingSession → coaching-engine diagnose(), then transform to protocol
// output schema. STRIPS everything internal: confidence, ruleId, version, evidence,
// paulsWords, decisionRecord, confidenceBreakdown. Counterparty gets the
// recommendation, never the machinery.
function handleEvaluateBoxingSession(inbound) {
  const p = inbound.payload;

  // Feed the engine everything the counterparty sent — the engine matches rules
  // against the session text + tags. Internal only; never echoed back.
  const sessionData = {
    sessions: p.sessions,
    goals: p.goals || [],
    constraints: p.constraints || [],
    tags: [],
    notes: (p.sessions || []).map(s => s.notes).filter(Boolean).join(' | ')
  };
  const studentProfile = { id: inbound.counterparty.id }; // external agent, no internal profile

  const result = diagnose(sessionData, studentProfile);

  // SOVEREIGNTY TRANSFORM — protocol output schema only.
  const diagnoses = (result.diagnoses || []).map((d, i) => ({
    area: d.engine ? `${d.engine}_engine` : 'general',
    finding: d.diagnosis,
    priority: i + 1 // engine already sorted strongest-first; rank replaces confidence
  }));

  const prescriptions = (result.diagnoses || [])
    .filter(d => d.prescription)
    .map(d => ({
      drill: drillSlug(d.prescription, d.engine ? `${d.engine}_drill` : null),
      description: d.prescription,
      frequency: 'every_session',
      duration: `${NEXT_CHECK_DAYS}_days`
    }));

  // Overall read as a final diagnosis line — output-level, exposes no internals.
  if (result.overallAssessment?.dominantGap && diagnoses.length) {
    diagnoses.push({
      area: 'overall',
      finding: `Dominant gap this session: ${result.overallAssessment.dominantGap}`,
      priority: diagnoses.length + 1
    });
  }

  return {
    diagnoses,
    prescriptions,
    constraints_acknowledged: (p.constraints || []).map(c => `${c} — factored into all prescriptions`),
    next_check: isoDatePlusDays(NEXT_CHECK_DAYS)
  };
}

// GetStudentProgress → read gym-eyes-students.json, return ONLY the progress
// subset defined in the output schema. Accepts either [ ...students ] or
// { students: [...] } file shapes.
function handleGetStudentProgress(inbound) {
  const raw = loadJSON(STUDENTS_PATH);
  const students = Array.isArray(raw) ? raw : (raw?.students || []);
  const wanted = String(inbound.payload.studentId).toLowerCase();

  const student = students.find(s =>
    String(s.id || '').toLowerCase() === wanted ||
    String(s.studentId || '').toLowerCase() === wanted ||
    String(s.name || '').toLowerCase() === wanted
  );
  if (!student) return null; // caller maps to 404

  return {
    totalSessions: Array.isArray(student.sessions) ? student.sessions.length
      : (typeof student.totalSessions === 'number' ? student.totalSessions : 0),
    currentLevel: student.level || student.currentLevel
      || (student.currentBlock ? `block_${student.currentBlock}` : 'unassessed'),
    recentMilestones: (student.milestones || student.recentMilestones || []).slice(-5),
    trend: student.trend || 'insufficient_data'
  };
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Get published capability registry (safe for external consumption — schemas only, no internals)
 * @returns {object} CapabilityRegistry
 */
export function getCapabilities() {
  return loadCapabilities();
}

/**
 * Get the full published schema for one capability
 * @param {string} capabilityName
 * @returns {object|null} { name, version, description, inputSchema, outputSchema, requiredPermission }
 */
export function getCapabilitySchema(capabilityName) {
  return loadCapabilities().capabilities.find(c => c.name === capabilityName) || null;
}

/**
 * Validate an inbound payload against a capability's input schema.
 * Descriptor-driven ("array of ..." → Array, "string" → string, "number" → number)
 * plus deep per-item checks for EvaluateBoxingSession sessions.
 * @param {string} capability — capability name
 * @param {object} payload
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validatePayload(capability, payload) {
  const errors = [];
  const cap = getCapabilitySchema(capability);
  if (!cap) return { valid: false, errors: [`Unknown capability: ${capability}`] };
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, errors: ['Payload must be a JSON object'] };
  }

  for (const [field, descriptor] of Object.entries(cap.inputSchema)) {
    const value = payload[field];
    const d = String(descriptor).toLowerCase();
    if (value === undefined || value === null) {
      errors.push(`Missing required field: ${field} (${descriptor})`);
      continue;
    }
    if (d.startsWith('array') && !Array.isArray(value)) errors.push(`Field "${field}" must be an array (${descriptor})`);
    else if (d.startsWith('string') && typeof value !== 'string') errors.push(`Field "${field}" must be a string`);
    else if (d.startsWith('number') && typeof value !== 'number') errors.push(`Field "${field}" must be a number`);
  }

  // Deep checks per capability
  if (capability === 'EvaluateBoxingSession' && Array.isArray(payload.sessions)) {
    if (payload.sessions.length === 0) errors.push('Field "sessions" must contain at least one session');
    payload.sessions.forEach((s, i) => {
      if (!s || typeof s !== 'object') { errors.push(`sessions[${i}] must be an object`); return; }
      if (!s.date) errors.push(`sessions[${i}].date is required`);
      if (s.duration_min !== undefined && typeof s.duration_min !== 'number') errors.push(`sessions[${i}].duration_min must be a number`);
      if (s.self_rating !== undefined && typeof s.self_rating !== 'number') errors.push(`sessions[${i}].self_rating must be a number`);
      if (s.drills !== undefined && !Array.isArray(s.drills)) errors.push(`sessions[${i}].drills must be an array`);
    });
  }
  if (capability === 'GetStudentProgress' && typeof payload.studentId === 'string' && !payload.studentId.trim()) {
    errors.push('Field "studentId" must be a non-empty string');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate an inbound message envelope: protocol, capability, version,
 * counterparty identity + key + permission.
 * @param {object} message — raw inbound
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateInbound(message) {
  const errors = [];
  if (!message || typeof message !== 'object') return { valid: false, errors: ['Message must be a JSON object'] };
  if (!message.protocol || message.protocol !== PROTOCOL_VERSION) errors.push('Invalid protocol version');
  if (!message.capability) errors.push('Missing capability name');
  if (!message.version) errors.push('Missing capability version');
  if (!message.counterparty?.id) errors.push('Missing counterparty ID');
  if (!message.counterparty?.key) errors.push('Missing counterparty key');
  if (!message.payload) errors.push('Missing payload');

  if (!errors.length) {
    const reg = loadRegistry();
    const cp = reg.counterparties.find(c => c.id === message.counterparty.id);
    if (!cp) {
      errors.push('Unknown counterparty');
    } else if (!cp.active) {
      errors.push('Counterparty revoked');
    } else if (cp.key !== message.counterparty.key) {
      errors.push('Invalid key');
    } else {
      const caps = loadCapabilities();
      const cap = caps.capabilities.find(c => c.name === message.capability);
      if (!cap) {
        errors.push(`Unknown capability: ${message.capability}`);
      } else if (cap.version !== message.version) {
        errors.push(`Version mismatch: expected ${cap.version}, got ${message.version}`);
      } else if (!cp.permissions.includes(cap.requiredPermission)) {
        errors.push(`Counterparty lacks permission: ${cap.requiredPermission}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Process an exchange end-to-end: envelope validation → rate limit → payload
 * validation → capability routing → sovereign outbound. Every attempt is logged
 * with start/end timestamps, payload size, response time, and status.
 *
 * Status codes on the outbound envelope (for HTTP wiring in cath-bridge):
 *   200 OK · 400 bad payload/envelope · 401 auth · 404 not found · 429 rate limited · 500 handler error
 *
 * @param {object} inbound — raw inbound message
 * @returns {object} OutboundMessage
 */
export function processExchange(inbound) {
  const startedAt = new Date().toISOString();
  const start = Date.now();
  const cpId = inbound?.counterparty?.id || 'unknown';
  const payloadSize = inbound?.payload ? JSON.stringify(inbound.payload).length : 0;

  const finish = (outbound, logExtra = {}) => {
    appendLog({
      direction: 'exchange',
      counterparty: cpId,
      capability: inbound?.capability || null,
      capabilityVersion: inbound?.version || null,
      payloadSize,
      status: outbound.status,
      startedAt,
      completedAt: new Date().toISOString(),
      responseTime: Date.now() - start,
      ...logExtra
    });
    return outbound;
  };

  // 1. Envelope validation (identity, key, capability, version, permission)
  const validation = validateInbound(inbound);
  if (!validation.valid) {
    const authFail = validation.errors.some(e => /unknown counterparty|invalid key|counterparty revoked/i.test(e));
    return finish(buildError(inbound, authFail ? 401 : 400, validation.errors), { errors: validation.errors });
  }

  // 2. Rate limit — per-counterparty, from registry rateLimit ("10/day")
  const reg = loadRegistry();
  const cp = reg.counterparties.find(c => c.id === cpId);
  const usage = rateUsage(cpId, cp.rateLimit);
  if (usage.remaining <= 0) {
    return finish(
      buildError(inbound, 429, `Rate limit exceeded: ${usage.limit}/${usage.window}. Retry after ${usage.retryAfterSec}s.`),
      { rateLimited: true, retryAfter: usage.retryAfterSec }
    );
  }

  // 3. Payload validation against the capability's input schema
  const payloadCheck = validatePayload(inbound.capability, inbound.payload);
  if (!payloadCheck.valid) {
    return finish(buildError(inbound, 400, payloadCheck.errors), { errors: payloadCheck.errors });
  }

  // 4. Route to capability handler
  try {
    switch (inbound.capability) {
      case 'EvaluateBoxingSession':
        return finish(buildOutbound(inbound, handleEvaluateBoxingSession(inbound)));

      case 'GetStudentProgress': {
        const progress = handleGetStudentProgress(inbound);
        if (!progress) return finish(buildError(inbound, 404, `Student not found: ${inbound.payload.studentId}`));
        return finish(buildOutbound(inbound, progress));
      }

      default:
        // validateInbound already rejects unknown capabilities — defensive fallback
        return finish(buildError(inbound, 404, `Unknown capability: ${inbound.capability}`));
    }
  } catch (err) {
    // Sovereignty: never leak internal error details (paths, stack traces) outbound.
    return finish(buildError(inbound, 500, 'Internal processing error'), { internalError: String(err.message || err) });
  }
}

/**
 * Register a new counterparty
 * @param {string} name
 * @param {string[]} permissions
 * @returns {{ id: string, key: string }}
 */
export function registerCounterparty(name, permissions = ['send_training_log', 'receive_coaching']) {
  const reg = loadRegistry();
  const id = `agent_${crypto.randomBytes(4).toString('hex')}`;
  const key = `cap_${crypto.randomBytes(16).toString('hex')}`;

  reg.counterparties.push({
    id,
    name,
    key,
    permissions,
    registered: new Date().toISOString().split('T')[0],
    active: true,
    rateLimit: '10/day',
    registeredBy: 'paul'
  });

  saveRegistry(reg);
  appendLog({ direction: 'register', counterparty: id, name });
  return { id, key };
}

/**
 * Revoke a counterparty
 * @param {string} id
 * @returns {boolean}
 */
export function revokeCounterparty(id) {
  const reg = loadRegistry();
  const cp = reg.counterparties.find(c => c.id === id);
  if (!cp) return false;
  cp.active = false;
  saveRegistry(reg);
  appendLog({ direction: 'revoke', counterparty: id });
  return true;
}

/**
 * Get counterparty info + exchange stats (Paul-facing audit view — never exposed outbound)
 * @param {string} id
 * @returns {object|null} { id, name, active, permissions, registered, rateLimit, stats }
 */
export function getCounterpartyStatus(id) {
  const cp = loadRegistry().counterparties.find(c => c.id === id);
  if (!cp) return null;

  const exchanges = loadLog().filter(e => e.direction === 'exchange' && e.counterparty === id);
  const usage = rateUsage(id, cp.rateLimit);

  return {
    id: cp.id,
    name: cp.name,
    active: cp.active,
    permissions: cp.permissions,
    registered: cp.registered,
    rateLimit: cp.rateLimit,
    stats: {
      totalExchanges: exchanges.length,
      successfulExchanges: exchanges.filter(e => e.status === 200).length,
      rejectedExchanges: exchanges.filter(e => e.status !== 200).length,
      lastExchange: exchanges.length ? exchanges[exchanges.length - 1].timestamp : null,
      rateUsage: { used: usage.used, limit: usage.limit, window: usage.window, remaining: usage.remaining }
    }
  };
}

/**
 * Get exchange log with optional filters
 * @param {object} filters — { counterparty, direction, capability, since, status }
 * @returns {Array} ExchangeRecord[]
 */
export function getExchangeLog(filters = {}) {
  let log = loadLog();
  if (filters.counterparty) log = log.filter(e => e.counterparty === filters.counterparty);
  if (filters.direction) log = log.filter(e => e.direction === filters.direction);
  if (filters.capability) log = log.filter(e => e.capability === filters.capability);
  if (filters.since) log = log.filter(e => e.timestamp >= filters.since);
  if (filters.status !== undefined) log = log.filter(e => e.status === filters.status);
  return log;
}

// ── CLI (node agent-protocol.js caps|register [name]|status [id]|log) ────

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(path.join(HOME, 'nanoclaw', 'agent-protocol.js'));
if (isDirectRun) {
  const cmd = process.argv[2];
  if (cmd === 'caps') console.log(JSON.stringify(getCapabilities(), null, 2));
  else if (cmd === 'register') console.log(JSON.stringify(registerCounterparty(process.argv[3] || 'test_agent'), null, 2));
  else if (cmd === 'status') console.log(JSON.stringify(getCounterpartyStatus(process.argv[3]), null, 2));
  else if (cmd === 'log') console.log(JSON.stringify(getExchangeLog({ counterparty: process.argv[3] }), null, 2));
  else if (cmd) console.log('Unknown command. Use: caps | register [name] | status [id] | log [counterpartyId]');
}


---

# SOURCE CODE: Module 5e — self-questioner.js (Vault Reflection)

// self-questioner.js — Cathedral Self-Diagnostic Agent
// ESM module (SI-13: ~/nanoclaw/ .js = ESM)
//
// Reads the system's own state (vault, coaching rules, taste map, knowledge
// graph, recent activity) → generates research questions via hermes3.
// The system asks its own questions. Not answering — asking.
//
// Spec: scaffolds/5e-self-questioner.md
// Storage: ~/nanoclaw/self-questioner-log.json
// Prompt:  ~/nanoclaw/prompts/self-questioner.txt

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const HOME = process.env.HOME;
const NANOCLAW = path.join(HOME, 'nanoclaw');
const VAULT = path.join(HOME, 'cathedral-vault');

const LOG_PATH = path.join(NANOCLAW, 'self-questioner-log.json');
const PROMPT_PATH = path.join(NANOCLAW, 'prompts', 'self-questioner.txt');
const COACHING_RULES_PATH = path.join(NANOCLAW, 'coaching-rules.json');
const TASTE_MAP_PATH = path.join(NANOCLAW, 'taste-map.json');
const TASTE_PRACTICE_PATH = path.join(NANOCLAW, 'taste-practice-log.json');
const GRAPH_PATH = path.join(NANOCLAW, 'vault-graph-data.json');
const STAGING_PATH = path.join(VAULT, '00_Staging');

const OLLAMA_URL = 'http://localhost:11434/api/generate';
const MODEL = 'hermes3'; // SI-24: never gemma4:26b — hermes3 is the workhorse
const OLLAMA_TIMEOUT_MS = 180000;

// The five question types the Self-Questioner can generate
const QUESTION_TYPES = ['vault_gap', 'coaching_gap', 'taste_gap', 'connection', 'challenge'];

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

function loadLog() {
  try { return JSON.parse(fs.readFileSync(LOG_PATH, 'utf8')); }
  catch { return []; }
}

function saveLog(log) {
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
}

// Local date (HK), not UTC — a question generated at 08:00 HKT belongs to
// today, not yesterday. YYYY-MM-DD.
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Read a JSON file, returning a fallback instead of throwing (inputs are
// read-only and optional — a missing source is a signal, not a crash)
function readJsonSafe(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return fallback; }
}

// ---------------------------------------------------------------------------
// State gathering — read-only, never mutates any source
// ---------------------------------------------------------------------------

// Count .md files under a directory (recursive, skips hidden/.obsidian)
function countMarkdownFiles(dir) {
  let count = 0;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return 0; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) count += countMarkdownFiles(full);
    else if (e.name.endsWith('.md')) count++;
  }
  return count;
}

// 1. Vault health — folder structure + file counts per top-level folder
function gatherVaultHealth() {
  const folders = [];
  let entries;
  try { entries = fs.readdirSync(VAULT, { withFileTypes: true }); }
  catch { return { available: false, folders: [], totalFiles: 0 }; }
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    folders.push({ name: e.name, files: countMarkdownFiles(path.join(VAULT, e.name)) });
  }
  folders.sort((a, b) => a.name.localeCompare(b.name));
  const totalFiles = folders.reduce((s, f) => s + f.files, 0);
  const thinFolders = folders.filter(f => f.files > 0 && f.files < 10).map(f => f.name);
  return { available: true, folders, totalFiles, thinFolders };
}

// 2. Coaching gaps — low-confidence rules and rules never validated by outcomes
function gatherCoachingGaps() {
  const rules = readJsonSafe(COACHING_RULES_PATH, null);
  if (!Array.isArray(rules)) return { available: false, totalRules: 0, lowConfidence: [], noOutcomes: [] };

  const lowConfidence = rules
    .filter(r => typeof r.confidence === 'number' && r.confidence < 0.7)
    .map(r => ({ id: r.id, rule: String(r.rule || '').slice(0, 140), confidence: r.confidence }));

  const noOutcomes = rules
    .filter(r => {
      const ev = r.evidence || {};
      const outcomes = Array.isArray(ev.outcomes) ? ev.outcomes.length : 0;
      const obs = ev.observation_count || 0;
      return outcomes === 0 && obs === 0;
    })
    .map(r => ({ id: r.id, rule: String(r.rule || '').slice(0, 140), status: r.status }));

  return { available: true, totalRules: rules.length, lowConfidence, noOutcomes };
}

// 3. Taste gaps — thin domains in the taste map + recent practice deposits
function gatherTasteGaps() {
  const map = readJsonSafe(TASTE_MAP_PATH, null);
  const practice = readJsonSafe(TASTE_PRACTICE_PATH, []);

  const domains = [];
  if (map && map.domains) {
    for (const [name, d] of Object.entries(map.domains)) {
      // Count anchor entries: any array-of-objects property on the domain
      let anchors = 0;
      for (const [key, val] of Object.entries(d)) {
        if (Array.isArray(val) && key !== 'dimensions') anchors += val.length;
      }
      domains.push({ name, anchors });
    }
  }
  const thinDomains = domains.filter(d => d.anchors < 5).map(d => d.name);
  const recentPractice = Array.isArray(practice) ? practice.slice(-7) : [];
  const practicedDomains = [...new Set(recentPractice.map(p => p.domain).filter(Boolean))];

  return {
    available: !!map,
    domains,
    thinDomains,
    practiceEntries: Array.isArray(practice) ? practice.length : 0,
    recentPracticeDomains: practicedDomains
  };
}

// 4. Knowledge graph — cold zones: domains with few files or weak connectivity
function gatherKnowledgeGaps() {
  const graph = readJsonSafe(GRAPH_PATH, null);
  if (!graph || !Array.isArray(graph.nodes)) {
    return { available: false, coldZones: [], domains: [] };
  }

  // Aggregate average connections per domain
  const byDomain = {};
  for (const n of graph.nodes) {
    const d = n.domain || 'unknown';
    if (!byDomain[d]) byDomain[d] = { name: d, files: 0, totalConnections: 0 };
    byDomain[d].files++;
    byDomain[d].totalConnections += n.connections || 0;
  }
  const domains = Object.values(byDomain).map(d => ({
    name: d.name,
    files: d.files,
    avgConnections: d.files ? +(d.totalConnections / d.files).toFixed(1) : 0
  }));

  // Cold zone = very few files, or files that barely connect to anything else
  const coldZones = domains
    .filter(d => d.files < 15 || d.avgConnections < 3)
    .map(d => `${d.name} (${d.files} files, avg ${d.avgConnections} connections)`);

  return {
    available: true,
    generated: graph.generated,
    totalFiles: graph.totalFiles,
    edgeCount: graph.edgeCount,
    domains,
    coldZones
  };
}

// 5. Recent activity — fresh session harvests in 00_Staging + vault git log
function gatherRecentActivity() {
  const recentHarvests = [];
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000; // last 14 days

  function scan(dir, depth) {
    if (depth > 3 || recentHarvests.length >= 30) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { scan(full, depth + 1); continue; }
      if (!e.name.endsWith('.md')) continue;
      try {
        const st = fs.statSync(full);
        if (st.mtimeMs >= cutoff) {
          recentHarvests.push({
            file: path.relative(STAGING_PATH, full),
            modified: st.mtime.toISOString().split('T')[0]
          });
        }
      } catch { /* skip unreadable */ }
    }
  }
  scan(STAGING_PATH, 0);
  recentHarvests.sort((a, b) => b.modified.localeCompare(a.modified));

  // Vault git log — what has been touched in the last 7 days
  let gitLog = [];
  try {
    const out = execSync('git log --since="7 days ago" --oneline --no-color | head -20', {
      cwd: VAULT, encoding: 'utf8', timeout: 10000
    });
    gitLog = out.split('\n').filter(Boolean);
  } catch { /* vault may not be a repo, or git unavailable — fine */ }

  return { recentHarvests: recentHarvests.slice(0, 20), gitLog };
}

/**
 * Gather all input signals for question generation.
 * Read-only across every source — never mutates system state.
 * @returns {object} { vaultHealth, coachingGaps, tasteGaps, knowledgeGaps, recentActivity, previousQuestions }
 */
export async function gatherState() {
  return {
    vaultHealth: gatherVaultHealth(),
    coachingGaps: gatherCoachingGaps(),
    tasteGaps: gatherTasteGaps(),
    knowledgeGaps: gatherKnowledgeGaps(),
    recentActivity: gatherRecentActivity(),
    previousQuestions: loadLog()
  };
}

// ---------------------------------------------------------------------------
// Prompt building
// ---------------------------------------------------------------------------

// Compress the state object into a compact evidence block for hermes3.
// Keeps token count low — hermes3 on 16GB gets a summary, not raw dumps.
function summarizeState(state) {
  const lines = [];

  const vh = state.vaultHealth;
  if (vh.available) {
    lines.push('== VAULT HEALTH ==');
    lines.push(`Total files: ${vh.totalFiles}`);
    lines.push('Folders: ' + vh.folders.map(f => `${f.name}(${f.files})`).join(', '));
    if (vh.thinFolders.length) lines.push('Thin folders (<10 files): ' + vh.thinFolders.join(', '));
  }

  const cg = state.coachingGaps;
  if (cg.available) {
    lines.push('\n== COACHING RULES ==');
    lines.push(`Total rules: ${cg.totalRules}. Low confidence (<0.7): ${cg.lowConfidence.length}. Never validated by outcomes: ${cg.noOutcomes.length}.`);
    const shown = new Set();
    for (const r of cg.lowConfidence.slice(0, 8)) { lines.push(`- [conf ${r.confidence}] ${r.rule}`); shown.add(r.id); }
    for (const r of cg.noOutcomes.filter(r => !shown.has(r.id)).slice(0, 8)) lines.push(`- [no outcomes, ${r.status}] ${r.rule}`);
  }

  const tg = state.tasteGaps;
  if (tg.available) {
    lines.push('\n== TASTE MAP ==');
    lines.push('Domains: ' + tg.domains.map(d => `${d.name}(${d.anchors} anchors)`).join(', '));
    if (tg.thinDomains.length) lines.push('Thin/unexplored domains (<5 anchors): ' + tg.thinDomains.join(', '));
    lines.push(`Practice log entries: ${tg.practiceEntries}. Recent practice domains: ${tg.recentPracticeDomains.join(', ') || 'none'}.`);
  }

  const kg = state.knowledgeGaps;
  if (kg.available) {
    lines.push('\n== KNOWLEDGE GRAPH ==');
    lines.push(`${kg.totalFiles} files, ${kg.edgeCount} edges (generated ${kg.generated}).`);
    if (kg.coldZones.length) lines.push('Cold zones (few files or weak connections): ' + kg.coldZones.join('; '));
  }

  const ra = state.recentActivity;
  lines.push('\n== RECENT ACTIVITY (last 14 days) ==');
  if (ra.recentHarvests.length) {
    lines.push('Recent session harvests: ' + ra.recentHarvests.slice(0, 12).map(h => h.file).join('; '));
  } else {
    lines.push('No recent session harvests found in 00_Staging.');
  }
  if (ra.gitLog.length) {
    lines.push('Recent vault commits: ' + ra.gitLog.slice(0, 10).join(' | '));
  }

  const prev = state.previousQuestions || [];
  if (prev.length) {
    lines.push('\n== PREVIOUSLY ASKED (do NOT repeat or rephrase these) ==');
    for (const q of prev.slice(-12)) lines.push(`- ${q.question}`);
  }

  return lines.join('\n');
}

function loadSystemPrompt() {
  try { return fs.readFileSync(PROMPT_PATH, 'utf8'); }
  catch {
    // Minimal inline fallback — the real prompt lives in prompts/self-questioner.txt
    return 'You are the Self-Questioner module of the Cathedral, a sovereign AI research system. Use ONLY the state evidence provided. Generate the single most valuable question the system should be asking itself.';
  }
}

// ---------------------------------------------------------------------------
// hermes3 call + response parsing
// ---------------------------------------------------------------------------

async function callHermes(prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  try {
    const resp = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, prompt, stream: false }),
      signal: controller.signal
    });
    if (!resp.ok) throw new Error(`Ollama HTTP ${resp.status}`);
    const data = await resp.json();
    return data.response || '';
  } finally {
    clearTimeout(timer);
  }
}

// Parse the structured LINE: value format hermes3 is instructed to emit
function parseQuestionResponse(text) {
  const grab = (label) => {
    const m = text.match(new RegExp(`^\\s*${label}\\s*:\\s*(.+)$`, 'mi'));
    return m ? m[1].trim() : null;
  };

  const question = grab('QUESTION');
  if (!question) return null;

  let type = (grab('TYPE') || '').toLowerCase().replace(/\s+/g, '_');
  if (!QUESTION_TYPES.includes(type)) type = 'vault_gap';

  let action = (grab('ACTION') || 'conversation').toLowerCase();
  if (!['elicitation', 'research', 'build', 'conversation'].includes(action)) action = 'conversation';

  let priority = parseInt(grab('PRIORITY'), 10);
  if (!Number.isInteger(priority) || priority < 1 || priority > 5) priority = 3;

  const sources = (grab('SOURCES') || '')
    .split(/[,;]/).map(s => s.trim()).filter(Boolean);

  return {
    question,
    type,
    domain: grab('DOMAIN') || 'general',
    source: grab('SOURCE') || 'state_analysis',
    action,
    priority,
    reasoning: grab('REASONING') || '',
    suggested_sources: sources
  };
}

// Duplicate check — normalized word-overlap (Jaccard) against existing questions
function isDuplicate(text, existing) {
  const words = (s) => new Set(
    String(s).toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3)
  );
  const a = words(text);
  for (const q of existing) {
    const b = words(q.question);
    if (!a.size || !b.size) continue;
    let inter = 0;
    for (const w of a) if (b.has(w)) inter++;
    const jaccard = inter / (a.size + b.size - inter);
    if (jaccard > 0.55) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Question generation
// ---------------------------------------------------------------------------

let idCounter = 0;
function makeId(date) {
  idCounter++;
  return `sq-${date}-${Date.now().toString(36)}${idCounter}`;
}

/**
 * Generate ONE question from system state via hermes3.
 * Persists the question to the log (status: pending) and returns it.
 * @param {object} [state] — pre-gathered state (optional; gathered fresh if omitted)
 * @param {object} [opts]  — { type: force a question type, save: false to skip persisting }
 * @returns {object} Question
 */
export async function generateQuestion(state, opts = {}) {
  if (!state) state = await gatherState();
  const systemPrompt = loadSystemPrompt();
  const evidence = summarizeState(state);
  const date = today();

  const typeHint = opts.type && QUESTION_TYPES.includes(opts.type)
    ? `\nFor THIS question, the required TYPE is: ${opts.type}. Generate a question of that type.`
    : '';
  const batchHint = opts.avoid && opts.avoid.length
    ? '\nAlso do NOT repeat any of these questions generated moments ago:\n' + opts.avoid.map(q => `- ${q}`).join('\n')
    : '';

  const prompt = `${systemPrompt}

CURRENT SYSTEM STATE (your ONLY evidence — cite it, do not invent state):
${evidence}
${typeHint}${batchHint}

Generate exactly ONE question. Respond in EXACTLY this format, nothing else:
QUESTION: [the question — specific, actionable this week, in Paul's plain language]
TYPE: [one of: vault_gap | coaching_gap | taste_gap | connection | challenge]
DOMAIN: [which domain this improves]
SOURCE: [which piece of state evidence revealed this gap]
ACTION: [one of: elicitation | research | build | conversation]
PRIORITY: [1-5, 1 = most urgent]
REASONING: [one or two sentences — why THIS question, tied to the evidence]
SOURCES: [comma-separated suggested sources to answer it: vault folders, people, systems]`;

  // Up to 3 attempts: parse failure or duplicate → retry
  const existing = state.previousQuestions || loadLog();
  let parsed = null;
  let lastRaw = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    lastRaw = await callHermes(
      attempt === 0 ? prompt
        : prompt + `\n\nYour previous attempt was rejected (${parsed ? 'duplicate of an existing question' : 'bad format'}). Produce a DIFFERENT question, exact format.`
    );
    parsed = parseQuestionResponse(lastRaw);
    if (parsed && !isDuplicate(parsed.question, existing) &&
        !(opts.avoid || []).some(q => isDuplicate(parsed.question, [{ question: q }]))) {
      break;
    }
    if (attempt === 2) {
      throw new Error('Self-Questioner: hermes3 failed to produce a fresh, well-formed question after 3 attempts. Last output: ' + lastRaw.slice(0, 300));
    }
  }

  const entry = {
    id: makeId(date),
    date,
    question: parsed.question,
    // Batch mode forces a type per slot — trust the request over the model's
    // self-label so a weekly batch genuinely covers different types
    type: (opts.type && QUESTION_TYPES.includes(opts.type)) ? opts.type : parsed.type,
    domain: parsed.domain,
    source: parsed.source,
    action: parsed.action,
    priority: parsed.priority,
    reasoning: parsed.reasoning,
    suggested_sources: parsed.suggested_sources,
    status: 'pending',
    response: null,
    respondedDate: null
  };

  if (opts.save !== false) {
    const log = loadLog();
    log.push(entry);
    saveLog(log);
  }
  return entry;
}

/**
 * Generate a weekly batch of 3-5 questions covering different types.
 * Gathers state once, generates sequentially (16GB hardware — no parallel
 * hermes3 calls), skips types that fail, persists what succeeds.
 * @param {number} [count=4] — target number of questions (clamped 3-5)
 * @returns {Array} Question[] — the questions actually generated
 */
export async function generateWeeklyBatch(count = 4) {
  count = Math.max(3, Math.min(5, count));
  const state = await gatherState();

  // Order types by where the evidence actually points: types whose sources
  // show real gaps go first, so a 3-question week still hits the live gaps.
  const typeOrder = [];
  if (state.coachingGaps.available && (state.coachingGaps.lowConfidence.length || state.coachingGaps.noOutcomes.length)) typeOrder.push('coaching_gap');
  if (state.tasteGaps.available && state.tasteGaps.thinDomains.length) typeOrder.push('taste_gap');
  if (state.knowledgeGaps.available && state.knowledgeGaps.coldZones.length) typeOrder.push('vault_gap');
  typeOrder.push('connection', 'challenge');
  for (const t of QUESTION_TYPES) if (!typeOrder.includes(t)) typeOrder.push(t);

  const batch = [];
  const errors = [];
  for (const type of typeOrder.slice(0, count)) {
    try {
      const q = await generateQuestion(state, { type, avoid: batch.map(b => b.question) });
      batch.push(q);
      state.previousQuestions = loadLog(); // keep dedup current within the batch
    } catch (err) {
      errors.push({ type, error: err.message });
    }
  }

  if (!batch.length && errors.length) {
    throw new Error('Weekly batch failed entirely: ' + errors.map(e => `${e.type}: ${e.error}`).join(' | '));
  }
  return batch;
}

// ---------------------------------------------------------------------------
// Log access + answering
// ---------------------------------------------------------------------------

/**
 * Get all questions
 * @returns {Array} Question[]
 */
export function getQuestionLog() {
  return loadLog();
}

/**
 * Answer a question by date
 * @param {string} date — YYYY-MM-DD
 * @param {string} answer — Paul's response
 * @returns {boolean}
 */
export function answerQuestion(date, answer) {
  const log = loadLog();
  const q = log.find(q => q.date === date && q.status === 'pending');
  if (!q) return false;
  q.status = 'answered';
  q.response = answer;
  q.respondedDate = today();
  saveLog(log);
  return true;
}

/**
 * Get unanswered questions
 * @returns {Array} Question[]
 */
export function getUnanswered() {
  return loadLog().filter(q => q.status === 'pending');
}

// ---------------------------------------------------------------------------
// Stats + insights
// ---------------------------------------------------------------------------

/**
 * Question statistics: totals, by type/domain/action, answer rate.
 * @returns {object}
 */
export function getQuestionStats() {
  const log = loadLog();
  const answered = log.filter(q => q.status === 'answered');
  const pending = log.filter(q => q.status === 'pending');

  const countBy = (field) => {
    const out = {};
    for (const q of log) {
      const key = q[field] || 'unknown';
      if (!out[key]) out[key] = { asked: 0, answered: 0 };
      out[key].asked++;
      if (q.status === 'answered') out[key].answered++;
    }
    return out;
  };

  return {
    total: log.length,
    answered: answered.length,
    unanswered: pending.length,
    answerRate: log.length ? +(answered.length / log.length).toFixed(2) : 0,
    byType: countBy('type'),
    byDomain: countBy('domain'),
    byAction: countBy('action'),
    oldestPending: pending.length ? pending[0].date : null,
    lastAsked: log.length ? log[log.length - 1].date : null,
    lastAnswered: answered.length ? answered[answered.length - 1].respondedDate : null
  };
}

/**
 * Analyze answered questions to find patterns in what Paul finds valuable.
 * Deterministic signal first (what gets answered vs ignored, response depth),
 * plus a hermes3 synthesis when there are enough answers to see a pattern.
 * Degrades gracefully if Ollama is down — the stats still return.
 * @returns {object} { signal, patterns, synthesis }
 */
export async function getInsights() {
  const log = loadLog();
  const answered = log.filter(q => q.status === 'answered');
  const ignored = log.filter(q => q.status === 'pending');

  if (!answered.length) {
    return { signal: 'No answered questions yet — no pattern to read.', patterns: {}, synthesis: null };
  }

  // Deterministic patterns: what does Paul actually engage with?
  const rateBy = (field) => {
    const out = {};
    for (const q of log) {
      const key = q[field] || 'unknown';
      if (!out[key]) out[key] = { asked: 0, answered: 0 };
      out[key].asked++;
      if (q.status === 'answered') out[key].answered++;
    }
    for (const k of Object.keys(out)) {
      out[k].rate = +(out[k].answered / out[k].asked).toFixed(2);
    }
    return out;
  };

  const avgLen = Math.round(
    answered.reduce((s, q) => s + (q.response ? q.response.length : 0), 0) / answered.length
  );
  const longAnswers = answered
    .filter(q => q.response && q.response.length > avgLen)
    .map(q => ({ question: q.question, type: q.type, domain: q.domain }));

  const patterns = {
    answerRateByType: rateBy('type'),
    answerRateByDomain: rateBy('domain'),
    answerRateByAction: rateBy('action'),
    avgResponseLength: avgLen,
    aboveAverageEngagement: longAnswers.slice(0, 10),
    ignoredQuestions: ignored.map(q => ({ question: q.question, type: q.type, date: q.date })).slice(-10)
  };

  // hermes3 synthesis — only worth running with 3+ answers
  let synthesis = null;
  if (answered.length >= 3) {
    const qa = answered.slice(-15).map(q =>
      `Q [${q.type}/${q.domain}]: ${q.question}\nA: ${String(q.response).slice(0, 400)}`
    ).join('\n---\n');
    try {
      synthesis = (await callHermes(
        `You are the Self-Questioner module of the Cathedral, a sovereign AI research system, reviewing which of your own questions Paul answered and how. Use ONLY the evidence below. If no pattern exists, say so honestly — do not fabricate.

ANSWERED QUESTIONS:
${qa}

IGNORED QUESTIONS (asked, never answered):
${ignored.slice(-10).map(q => `- [${q.type}] ${q.question}`).join('\n') || '(none)'}

In 3-5 plain sentences: what kinds of questions does Paul engage with deeply, which does he ignore, and what should the next questions look like?`
      )).trim();
    } catch { /* Ollama down — stats-only insights still valid */ }
  }

  return {
    signal: `${answered.length}/${log.length} questions answered (${Math.round(answered.length / log.length * 100)}%).`,
    patterns,
    synthesis
  };
}

// ---------------------------------------------------------------------------
// CLI test hook: node self-questioner.js [state|question|batch|stats|insights]
// ---------------------------------------------------------------------------

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const cmd = process.argv[2] || 'state';
  const run = {
    state: async () => summarizeState(await gatherState()),
    question: () => generateQuestion(),
    batch: () => generateWeeklyBatch(),
    stats: () => getQuestionStats(),
    insights: () => getInsights()
  }[cmd];
  if (!run) { console.error('Usage: node self-questioner.js [state|question|batch|stats|insights]'); process.exit(1); }
  Promise.resolve(run())
    .then(out => console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 2)))
    .catch(err => { console.error('ERROR:', err.message); process.exit(1); });
}
