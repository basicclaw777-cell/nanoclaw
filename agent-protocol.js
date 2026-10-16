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
// lazy import — coaching-engine crash must not take down A2A protocol
const lazyEngine = () => import('./coaching-engine.js');

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
async function handleEvaluateBoxingSession(inbound) {
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

  let result;
  try {
    const { diagnose } = await lazyEngine();
    result = diagnose(sessionData, studentProfile);
  } catch (e) {
    return { status: 'error', message: 'Coaching engine unavailable', code: 'ENGINE_DOWN' };
  }

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
export async function processExchange(inbound) {
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
        return finish(buildOutbound(inbound, await handleEvaluateBoxingSession(inbound)));

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
