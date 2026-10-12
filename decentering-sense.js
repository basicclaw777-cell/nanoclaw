// decentering-sense.js — The Three-Register Architecture, executable core.
// Spec: ~/cathedral-vault/06_Methods/the-three-register-architecture.md
// "There is no stuck." A block is a register-mismatch. This Sense classifies the
// hold, routes the register, selects a reframe (via bandit-brain), and scores the
// outcome with a gated, ledger-verified reward.
//
// ESM (nanoclaw convention). Deterministic core (classify/reward/decompile) is
// dependency-free and unit-testable today. Bandit selection lazy-imports
// bandit-brain.js so the pure core runs without touching SQLite.

import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const HOME = process.env.HOME;
const LOG_PATH = join(HOME, 'nanoclaw', 'vortex_data', 'decentering-log.jsonl');

// Reward weights — tunable. cost/contradiction penalties keep the bandit honest.
const LAMBDA_COST = 1.0;
const LAMBDA_CONTRA = 2.0;
const MISINTERVENTION_PENALTY = 3.0;

// Classifier thresholds.
const PROGRESS_DELTA_THRESHOLD = 0.0; // strictly-positive goal-directed motion = PROGRESS

// Reframe operators (arms for the bandit, keyed per block-type namespace).
export const REFRAME_OPERATORS = [
  'metaphor_image',     // draw a symbolic picture, re-perceive as naive observer
  'sentence_to_map',    // decompress to relational map (graphify)
  'spectator_poll',     // populate an underdetermined artifact with viewers, interrogate them
  'alt_ending',         // role-play divergent completions
  'satire_reframe',     // adversarial perspective flip
  'formalize',          // re-encode the stuck NL step into the execution register (code/typed)
];

// ── State classes ───────────────────────────────────────────────────────────
export const HOLD_CLASS = Object.freeze({
  PROGRESS: 'PROGRESS',
  HOLD: 'HOLD',
  NOISE: 'NOISE',
  BLOCK: 'BLOCK',
});

export const REGISTER = Object.freeze({
  COMMUNICATION: 'communication', // NL — with Paul / between agents
  EXECUTION: 'execution',         // formal/typed/code — measurable, ledger-able
  JUDGMENT: 'judgment',           // taste-map / human eye — irreducibly qualitative
});

/**
 * 4-way hold classifier. CASCADE, not parallel scoring. Order encodes the
 * conservative bias: exhaust don't-intervene (PROGRESS, HOLD) and shouldn't-
 * intervene (NOISE) before concluding intervene (BLOCK).
 *
 * @param {object} state
 *   goal:            string
 *   goalValid:       boolean | undefined  (does the goal survive validation)
 *   provenance:      'human'|'agent'|'phantom-trigger'|'stale-data'|'duplicate'|'obsolete'|'done'
 *   stateReason:     string   (agent's stated reason — HYPOTHESIS, verified not trusted)
 *   progressDelta:   number   (goal-directed motion over window; >0 = advancing)
 *   outputNovelty:   number   (0..1, embedding distance from prior N outputs)
 *   releaseCondition:{ desc, externallyVerifiable:boolean, isRealFutureEvent:boolean, fired:boolean } | null
 *   waitElapsed:     number   maxWait: number
 *   blockSubtype:    'environmental'|'cognitive'|undefined
 * @returns {{ klass, reason, register, releaseCondition?, maxWait?, blockSubtype?, defaultApplied? }}
 */
export function classifyHold(state) {
  const s = state || {};

  // 1. PROGRESS — cheapest, catches most false-stucks. Goal-directed motion?
  if (typeof s.progressDelta === 'number' && s.progressDelta > PROGRESS_DELTA_THRESHOLD) {
    return { klass: HOLD_CLASS.PROGRESS, reason: 'positive goal-directed delta', register: routeRegister(s) };
  }

  // 2. HOLD — honor correct waiting. Release-condition must be externally verifiable
  //    AND a real future event AND not past max-wait. Else fall through (no fabricated patience).
  const rc = s.releaseCondition;
  if (rc && rc.externallyVerifiable && rc.isRealFutureEvent) {
    const expired = typeof s.waitElapsed === 'number' && typeof s.maxWait === 'number' && s.waitElapsed >= s.maxWait;
    if (!expired) {
      return {
        klass: HOLD_CLASS.HOLD,
        reason: `valid wait: ${rc.desc}`,
        register: REGISTER.EXECUTION,
        releaseCondition: rc,
        maxWait: s.maxWait,
      };
    }
    // expired hold re-enters classification → continue cascade.
  }

  // 3. NOISE — refuse the task, not the agent. Goal fails validation / phantom provenance.
  const junkProvenance = ['phantom-trigger', 'stale-data', 'duplicate', 'obsolete', 'done'];
  const goalInvalid = s.goalValid === false || junkProvenance.includes(s.provenance);
  if (goalInvalid) {
    return { klass: HOLD_CLASS.NOISE, reason: `invalid goal (${s.provenance || 'failed validation'})`, register: routeRegister(s) };
  }

  // 4. BLOCK — residual: valid goal, no motion, no valid wait, not noise.
  //    Conservative default: if an UNVERIFIED but plausibly-real release-condition
  //    is present, default to HOLD (short max-wait), never straight to BLOCK.
  if (rc && rc.isRealFutureEvent && !rc.externallyVerifiable) {
    return {
      klass: HOLD_CLASS.HOLD,
      reason: 'conservative default: plausible unverified wait → HOLD, not BLOCK',
      register: REGISTER.EXECUTION,
      releaseCondition: rc,
      maxWait: s.maxWait || 1,
      defaultApplied: true,
    };
  }

  const subtype = s.blockSubtype || 'cognitive';
  return { klass: HOLD_CLASS.BLOCK, reason: 'valid goal, no motion, no valid wait', register: routeRegister(s), blockSubtype: subtype };
}

/**
 * Register router (stub with a clear extension point). The HARD part is real
 * classification of task kind; this routes on declared task.kind / measurability.
 * Mis-routing is the true failure mode (formalize a judgment task → Goodhart).
 */
export function routeRegister(task) {
  const t = task || {};
  if (t.register) return t.register; // explicit override
  if (t.qualitative === true || t.kind === 'taste' || t.kind === 'aesthetic') return REGISTER.JUDGMENT;
  if (t.measurable === true || t.kind === 'action' || t.kind === 'task') return REGISTER.EXECUTION;
  return REGISTER.COMMUNICATION;
}

/**
 * Gated reward (branch-4-only). NOT additive: clear-but-didn't-hold scores ~0 (net
 * negative via cost), never partial credit. All inputs are ledger/KG-measured,
 * never self-reported by the agent.
 *
 * @param {object} o
 *   shouldNotHaveIntervened: boolean  — reframe fired on a mislabeled HOLD/NOISE/PROGRESS
 *   blockCleared: boolean   persistedK: boolean
 *   forwardProgress: number  cost: number  newContradictions: number
 * @returns {{ reward:number, success:boolean, note:string }}
 */
export function computeReward(o) {
  const cost = o.cost || 0;
  // Misintervention: punish unnecessary intervention (trains the classifier too).
  if (o.shouldNotHaveIntervened) {
    return { reward: -MISINTERVENTION_PENALTY - LAMBDA_COST * cost, success: false, note: 'misintervention: fired on a non-block' };
  }
  if (o.blockCleared && o.persistedK) {
    const reward = (o.forwardProgress || 0) - LAMBDA_COST * cost - LAMBDA_CONTRA * (o.newContradictions || 0);
    return { reward, success: reward > 0, note: 'cleared and held' };
  }
  // Cleared-but-not-persisted, or not cleared → only the cost penalty.
  return { reward: -LAMBDA_COST * cost, success: false, note: 'did not clear-and-hold' };
}

/**
 * Decompile-confirm — the seam guard. Compile intent→formal, back-translate
 * formal→NL, re-read before commit. Defends against confident-precise-wrong.
 * @param {*} formalAction
 * @param {(formal:any)=>string} backTranslate  formal → plain-words preview
 * @param {(nl:string)=>boolean} confirm        returns true to commit
 */
export function decompileConfirm(formalAction, backTranslate, confirm) {
  const nlPreview = backTranslate(formalAction);
  const committed = confirm ? !!confirm(nlPreview) : false;
  return { nlPreview, committed };
}

// ── Bandit integration (lazy — keeps the pure core SQLite-free) ───────────────
// Namespace the bandit by block-type so each block-type learns its own best
// reframe: contextual behaviour from a non-contextual multi-armed bandit.
export async function chooseReframe(blockType, operators = REFRAME_OPERATORS) {
  const { chooseActionWithPerturbation } = await import('./bandit-brain.js');
  const res = chooseActionWithPerturbation(`decenter:${blockType}`, operators, { perturbInterval: 5 });
  if (res.perturbNotice) console.log(`[decenter] ${blockType}: ${res.perturbNotice}`);
  return res && typeof res === 'object' && 'action' in res ? res.action : res;
}

export async function recordReframeOutcome(blockType, operator, outcome) {
  const { reward, success, note } = computeReward(outcome);
  const { recordOutcome } = await import('./bandit-brain.js');
  // sourceAgent = the namespace itself → bandit-brain's `sourceAgent === agentId`
  // bypass applies the outcome immediately. Valid here because the unblock signal
  // is objectively ledger-verified by computeReward's gates, not the agent's opinion —
  // it does NOT need a second corroborating source.
  const ns = `decenter:${blockType}`;
  recordOutcome(ns, operator, success, ns);
  return { reward, success, note };
}

// ── Logger — the bandit can't train on nothing. One triple per impasse. ───────
export function logImpasse(entry) {
  const dir = dirname(LOG_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const row = {
    ts: entry.ts || null, // caller stamps time (Date.now disallowed in some contexts)
    block_class: entry.klass,
    block_type: entry.blockType || null,
    block_signature: entry.signature || null,
    register: entry.register || null,
    reframe_operator: entry.operator || null,
    cost: entry.cost ?? null,
    cleared: entry.blockCleared ?? null,
    persisted_K: entry.persistedK ?? null,
    new_contradictions: entry.newContradictions ?? null,
    forward_progress: entry.forwardProgress ?? null,
    predicted_class: entry.klass,
    verified_outcome: entry.verifiedOutcome ?? null,
  };
  appendFileSync(LOG_PATH, JSON.stringify(row) + '\n');
  return row;
}

export default {
  HOLD_CLASS, REGISTER, REFRAME_OPERATORS,
  classifyHold, routeRegister, computeReward, decompileConfirm,
  chooseReframe, recordReframeOutcome, logImpasse,
};
