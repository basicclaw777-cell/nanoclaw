// agent-protocol.js — Sovereign Agent-to-Agent Exchange (STUB — Fable fills)
// ESM module
// v2: CAPABILITY-BASED, not agent-based. Expose capabilities, not agents.
// Borrows Agent Card pattern from A2A but stays closed + permissioned.
// Sovereignty: never expose internal state, vault, rules, evidence, or confidence scores.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const REGISTRY_PATH = path.join(process.env.HOME, 'nanoclaw', 'agent-protocol-registry.json');
const LOG_PATH = path.join(process.env.HOME, 'nanoclaw', 'agent-protocol-log.json');
const CAPABILITIES_PATH = path.join(process.env.HOME, 'nanoclaw', 'agent-capabilities.json');

const PROTOCOL_VERSION = 'cathedral-agent-v1';

function loadJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
function saveJSON(p, d) { fs.writeFileSync(p, JSON.stringify(d, null, 2)); }

function loadRegistry() { return loadJSON(REGISTRY_PATH) || { counterparties: [] }; }
function loadLog() { return loadJSON(LOG_PATH) || []; }

function loadCapabilities() {
  return loadJSON(CAPABILITIES_PATH) || {
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
}

function appendLog(entry) {
  const log = loadLog();
  log.push({ ...entry, timestamp: new Date().toISOString() });
  saveJSON(LOG_PATH, log);
}

/**
 * Get published capability registry (safe for external consumption — no internals)
 * @returns {object} CapabilityRegistry
 */
export function getCapabilities() {
  return loadCapabilities();
}

/**
 * Validate an inbound message against capability schemas
 * @param {object} message — raw inbound
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateInbound(message) {
  const errors = [];
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
 * Process a validated exchange — route through capability handler
 * @param {object} inbound — validated message
 * @returns {object} OutboundMessage | { taskId, pollUrl }
 */
export function processExchange(inbound) {
  // STUB — Fable implements
  // Should route through coaching-engine.js based on capability name:
  //   EvaluateBoxingSession → coaching-engine.diagnose()
  //   GetStudentProgress → student profile lookup
  // For now: acknowledge receipt, return stub response

  const outbound = {
    protocol: PROTOCOL_VERSION,
    capability: inbound.capability,
    version: inbound.version,
    counterparty: inbound.counterparty.id,
    payload: {
      diagnoses: [],
      prescriptions: [],
      constraints_acknowledged: inbound.payload?.constraints || [],
      next_check: null
    },
    timestamp: new Date().toISOString()
  };

  appendLog({
    direction: 'exchange',
    counterparty: inbound.counterparty.id,
    capability: inbound.capability,
    capabilityVersion: inbound.version,
    payloadSize: JSON.stringify(inbound.payload).length,
    responseTime: 0
  });

  return outbound;
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
  saveJSON(REGISTRY_PATH, reg);
  appendLog({ direction: 'revoke', counterparty: id });
  return true;
}

/**
 * Get exchange log with optional filters
 * @param {object} filters — { counterparty, direction, capability, since }
 * @returns {Array} ExchangeRecord[]
 */
export function getExchangeLog(filters = {}) {
  let log = loadLog();
  if (filters.counterparty) log = log.filter(e => e.counterparty === filters.counterparty);
  if (filters.direction) log = log.filter(e => e.direction === filters.direction);
  if (filters.capability) log = log.filter(e => e.capability === filters.capability);
  if (filters.since) log = log.filter(e => e.timestamp >= filters.since);
  return log;
}
