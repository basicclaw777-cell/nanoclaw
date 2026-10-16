// coaching-engine.js — Learning Coaching Engine (STUB — Fable fills)
// ESM module
// INVERTED ARCHITECTURE: logs interventions → extracts patterns → proposes rules → Paul approves
// NOT a decision tree. A learning engine.
// Source: diagnostic-empathy-with-surgical-naming.md, pauls-cognitive-signature.md, the-three-engines.md

import fs from 'fs';
import path from 'path';

const INTERVENTIONS_PATH = path.join(process.env.HOME, 'nanoclaw', 'coaching-interventions.json');
const RULES_PATH = path.join(process.env.HOME, 'nanoclaw', 'coaching-rules.json');
const CHANGELOG_PATH = path.join(process.env.HOME, 'nanoclaw', 'coaching-changelog.json');
const DECISIONS_PATH = path.join(process.env.HOME, 'nanoclaw', 'coaching-decisions.json');

function loadJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return []; } }
function saveJSON(p, d) { fs.writeFileSync(p, JSON.stringify(d, null, 2)); }

// Confidence thresholds
const CONFIDENCE = {
  AUTO: 0.90,      // auto-execute, notify Paul after
  RECOMMEND: 0.70, // propose, Paul confirms before delivery
  ASK: 0.50,       // flag the situation, Paul decides
  COLLECT: 0.0     // insufficient evidence, log silently
};

// Block progression (10 blocks, fear gate at 4→5)
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

// ── Layer 1: Intervention Logging ────────────────────────────────────────

/**
 * Log a coaching intervention
 * @param {object} intervention — { student, context, observation, intervention, reasoning, outcome, tags }
 * @returns {object} InterventionRecord with generated id + date
 */
export function logIntervention(intervention) {
  const log = loadJSON(INTERVENTIONS_PATH);
  const record = {
    id: `int_${Date.now()}`,
    date: new Date().toISOString().split('T')[0],
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
 * @returns {Array} InterventionRecord[]
 */
export function getInterventionLog(filters = {}) {
  let log = loadJSON(INTERVENTIONS_PATH);
  if (filters.student) log = log.filter(i => i.student === filters.student);
  if (filters.tags) log = log.filter(i => filters.tags.some(t => (i.tags || []).includes(t)));
  if (filters.since) log = log.filter(i => i.date >= filters.since);
  return log;
}

// ── Layer 2: Pattern Extraction ──────────────────────────────────────────

/**
 * Extract patterns from intervention log, propose rules
 * @param {number} minObservations — minimum similar interventions before proposing (default 3)
 * @returns {Array} RuleProposal[]
 */
export async function extractPatterns(minObservations = 3) {
  // STUB — Fable implements
  // Should:
  // 1. Cluster interventions by tags
  // 2. Find clusters with >= minObservations entries
  // 3. Use hermes3 to synthesize a rule from the cluster
  // 4. Calculate confidence from success_rate + observation_count
  // 5. Return proposals with evidence chains
  // 6. Skip clusters that already have an approved rule
  return [];
}

/**
 * Get pending rule proposals (not yet approved/rejected)
 * @returns {Array} RuleProposal[]
 */
export function getPendingProposals() {
  return loadJSON(RULES_PATH).filter(r => r.status === 'proposed');
}

// ── Layer 3: Rule Management ─────────────────────────────────────────────

/**
 * Approve a proposed rule, optionally with modifications
 * @param {string} ruleId
 * @param {object} modifications — optional changes to the rule
 * @returns {object} approved Rule
 */
export function approveRule(ruleId, modifications = {}) {
  const rules = loadJSON(RULES_PATH);
  const rule = rules.find(r => r.id === ruleId);
  if (!rule) return null;

  rule.status = 'approved';
  rule.approved = new Date().toISOString().split('T')[0];
  rule.approvedBy = 'paul';

  if (modifications.rule) rule.rule = modifications.rule;
  if (modifications.conditions) Object.assign(rule.conditions, modifications.conditions);
  if (modifications.prescription) Object.assign(rule.prescription, modifications.prescription);

  saveJSON(RULES_PATH, rules);

  const changelog = loadJSON(CHANGELOG_PATH);
  changelog.push({
    ruleId,
    version: rule.version,
    date: rule.approved,
    change: modifications.rule ? `Approved with modification: ${modifications.rule}` : 'Approved as proposed',
    reason: modifications.reason || 'Paul approved',
    evidence: rule.evidence?.supporting_interventions || [],
    approvedBy: 'paul'
  });
  saveJSON(CHANGELOG_PATH, changelog);

  return rule;
}

/**
 * Reject a proposed rule
 * @param {string} ruleId
 * @param {string} reason
 */
export function rejectRule(ruleId, reason) {
  const rules = loadJSON(RULES_PATH);
  const rule = rules.find(r => r.id === ruleId);
  if (!rule) return;
  rule.status = 'rejected';
  rule.rejectedReason = reason;
  rule.rejectedDate = new Date().toISOString().split('T')[0];
  saveJSON(RULES_PATH, rules);
}

/**
 * Get active rules with optional filters
 * @param {object} filters — { engine, block, minConfidence, tag }
 * @returns {Array} Rule[]
 */
export function getRules(filters = {}) {
  let rules = loadJSON(RULES_PATH).filter(r => r.status === 'approved');
  if (filters.engine) rules = rules.filter(r => r.conditions?.engine === filters.engine);
  if (filters.minConfidence) rules = rules.filter(r => r.confidence >= filters.minConfidence);
  if (filters.tag) rules = rules.filter(r => (r.conditions?.tags || []).includes(filters.tag));
  return rules;
}

/**
 * Get full changelog for a rule
 * @param {string} ruleId
 * @returns {Array} ChangelogEntry[]
 */
export function getRuleChangelog(ruleId) {
  return loadJSON(CHANGELOG_PATH).filter(c => c.ruleId === ruleId);
}

// ── Active Coaching (uses approved rules) ────────────────────────────────

/**
 * Run diagnosis on session data against approved rules
 * @param {object} sessionData — metrics from detector/analytics
 * @param {object} studentProfile — from students JSON
 * @returns {object} CoachingOutput with confidence-gated recommendations
 */
export function diagnose(sessionData, studentProfile) {
  // STUB — Fable implements
  // Should:
  // 1. Load approved rules
  // 2. Match rules against session data + student context
  // 3. Apply confidence thresholds:
  //    - AUTO (90%+): include in output as "executed"
  //    - RECOMMEND (70-89%): include as "recommended"
  //    - ASK (50-69%): include as "needs_paul"
  //    - COLLECT (<50%): don't include, just log
  // 4. Use Paul's language from the original interventions
  // 5. Include evidence chain for each diagnosis
  const date = new Date().toISOString().split('T')[0];
  const output = {
    studentId: studentProfile?.id,
    date,
    sessionData,
    diagnoses: [],
    overallAssessment: {
      dominantGap: null,
      trend: 'insufficient_data',
      nextFocus: null
    },
    confidenceBreakdown: {
      auto_executed: 0,
      recommended: 0,
      needs_paul: 0,
      collecting: 0
    }
  };

  const decision = {
    decisionId: `dec_${Date.now()}`,
    studentId: studentProfile?.id,
    date,
    type: 'coaching_recommendation',
    input: { sessionData, studentProfile: { id: studentProfile?.id, level: studentProfile?.level, currentBlock: studentProfile?.currentBlock } },
    rulesApplied: [],
    autonomyLevel: 'collect',
    model: 'hermes3',
    output: { diagnoses: output.diagnoses, prescriptions: [] },
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
 * Assess a new student from first session
 * @param {object} firstSessionData
 * @returns {object} InitialAssessment
 */
export function assessNewStudent(firstSessionData) {
  // STUB — Fable implements
  return {
    dominantEngine: null,
    startingBlock: 1,
    initialPriorities: [],
    notes: 'Assessment engine not yet implemented — needs intervention log data'
  };
}

/**
 * Detect plateau across session history
 * @param {Array} sessionHistory
 * @returns {object|null} PlateauReport or null
 */
export function detectPlateau(sessionHistory) {
  // STUB — Fable implements
  return null;
}

// ── Confidence + Evidence ────────────────────────────────────────────────

/**
 * Update confidence after an outcome
 * @param {string} ruleId
 * @param {object} outcome — { success: boolean, context: string, interventionId: string }
 * @returns {number} new confidence
 */
export function updateConfidence(ruleId, outcome) {
  const rules = loadJSON(RULES_PATH);
  const rule = rules.find(r => r.id === ruleId);
  if (!rule) return -1;

  const delta = outcome.success ? 0.03 : -0.05;
  rule.confidence = Math.max(0, Math.min(1, rule.confidence + delta));

  if (!rule.evidence.outcomes) rule.evidence.outcomes = [];
  rule.evidence.outcomes.push({
    date: new Date().toISOString().split('T')[0],
    success: outcome.success,
    context: outcome.context,
    interventionId: outcome.interventionId
  });

  saveJSON(RULES_PATH, rules);
  return rule.confidence;
}

/**
 * Get full evidence chain for a rule
 * @param {string} ruleId
 * @returns {object} { interventions, outcomes, changelog }
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
    interventions,
    outcomes: rule.evidence?.outcomes || [],
    changelog: getRuleChangelog(ruleId)
  };
}

// ── Decision Records ────────────────────────────────────────────────────

/**
 * Get decision log with optional filters
 * @param {object} filters — { studentId, since, autonomyLevel }
 * @returns {Array} DecisionRecord[]
 */
export function getDecisionLog(filters = {}) {
  let log = loadJSON(DECISIONS_PATH);
  if (filters.studentId) log = log.filter(d => d.studentId === filters.studentId);
  if (filters.since) log = log.filter(d => d.date >= filters.since);
  if (filters.autonomyLevel) log = log.filter(d => d.autonomyLevel === filters.autonomyLevel);
  return log;
}

/**
 * Override a decision — Paul disagrees with the recommendation
 * Feeds back into rule confidence via updateConfidence
 * @param {string} decisionId
 * @param {string} override — what Paul did instead
 * @param {string} reason — why
 * @returns {object|null} updated DecisionRecord
 */
export function overrideDecision(decisionId, override, reason) {
  const decisions = loadJSON(DECISIONS_PATH);
  const dec = decisions.find(d => d.decisionId === decisionId);
  if (!dec) return null;

  dec.humanOverride = override;
  dec.overrideReason = reason;
  dec.overrideDate = new Date().toISOString().split('T')[0];
  saveJSON(DECISIONS_PATH, decisions);

  for (const r of dec.rulesApplied) {
    updateConfidence(r.ruleId, { success: false, context: `Override: ${reason}`, interventionId: decisionId });
  }

  return dec;
}

// ── Version Control ──────────────────────────────────────────────────────

/**
 * Get a specific version of a rule
 * @param {string} ruleId
 * @param {string} version
 * @returns {object|null} Rule at that version
 */
export function getRuleVersion(ruleId, version) {
  // STUB — Fable implements
  // Should reconstruct rule state at a given version from changelog
  return null;
}

/**
 * Get full version history of a rule
 * @param {string} ruleId
 * @returns {Array} Rule versions with diffs
 */
export function getRuleHistory(ruleId) {
  return getRuleChangelog(ruleId);
}

// ── Block Progression ────────────────────────────────────────────────────

/**
 * Get block progression map for a student
 * @param {object} studentProfile
 * @returns {object} BlockMap with current position + gate status
 */
export function getBlockProgression(studentProfile) {
  return {
    blocks: BLOCKS,
    currentBlock: studentProfile?.currentBlock || 1,
    gateStatus: {
      fear_gate: studentProfile?.currentBlock >= 5 ? 'passed' :
                 studentProfile?.currentBlock === 4 ? 'approaching' : 'not_reached'
    }
  };
}
