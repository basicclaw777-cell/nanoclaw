/**
 * constitutional-invariants.js — Executable Constitution
 *
 * Invariants are not prose. They are assertions that either pass or fail.
 * Run after every agent decision cycle. Track over time for drift detection.
 *
 * Architecture from: cathedral-vault/02_Refined_Gold/cathedral/agent-governance-4-pillars.md (Pillar 4)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = path.join(__dirname, 'state');
const DRIFT_LOG = path.join(STATE_DIR, 'constitutional-drift.json');

const INVARIANTS = [
  {
    id: 'INV-001',
    name: 'evidence-precedes-belief',
    description: 'No claim promoted without evidence timestamp preceding belief timestamp',
    level: 'CONSTITUTION',
    test: (ctx) => {
      if (!ctx.claim) return { pass: true, skipped: true };
      return {
        pass: !ctx.claim.promoted || (ctx.claim.evidence_at && ctx.claim.promoted_at &&
               new Date(ctx.claim.evidence_at) < new Date(ctx.claim.promoted_at)),
        detail: ctx.claim.promoted ? `evidence: ${ctx.claim.evidence_at}, promoted: ${ctx.claim.promoted_at}` : 'not promoted'
      };
    }
  },
  {
    id: 'INV-002',
    name: 'no-memory-deletion',
    description: 'Deleted items must equal archived items (no permanent deletion)',
    level: 'CONSTITUTION',
    test: (ctx) => {
      if (!ctx.memory_op) return { pass: true, skipped: true };
      return {
        pass: ctx.memory_op.type !== 'delete' || ctx.memory_op.archived === true,
        detail: `op: ${ctx.memory_op.type}, archived: ${ctx.memory_op.archived}`
      };
    }
  },
  {
    id: 'INV-003',
    name: 'output-provenance',
    description: 'All outputs must carry provenance (source trail)',
    level: 'CONSTITUTION',
    test: (ctx) => {
      if (!ctx.output) return { pass: true, skipped: true };
      return {
        pass: ctx.output.provenance != null && ctx.output.provenance !== '',
        detail: ctx.output.provenance ? `provenance: ${ctx.output.provenance.slice(0, 50)}` : 'MISSING'
      };
    }
  },
  {
    id: 'INV-004',
    name: 'no-self-modification-of-constitution',
    description: 'Agent cannot modify its own constitutional layer',
    level: 'CONSTITUTION',
    test: (ctx) => {
      if (!ctx.write_op) return { pass: true, skipped: true };
      const constitutionalPaths = ['CLAUDE.md', 'constitutional-invariants.js', 'standing-instructions'];
      const target = ctx.write_op.target || '';
      const isConstitutional = constitutionalPaths.some(p => target.includes(p));
      return {
        pass: !isConstitutional || ctx.write_op.human_approved === true,
        detail: `target: ${target}, human_approved: ${ctx.write_op.human_approved}`
      };
    }
  },
  {
    id: 'INV-005',
    name: 'spend-within-budget',
    description: 'No API call exceeds allocated budget without human approval',
    level: 'CONSTITUTION',
    test: (ctx) => {
      if (!ctx.spend) return { pass: true, skipped: true };
      return {
        pass: ctx.spend.amount <= ctx.spend.budget_remaining || ctx.spend.human_approved === true,
        detail: `spent: ${ctx.spend.amount}, remaining: ${ctx.spend.budget_remaining}`
      };
    }
  },
  {
    id: 'INV-006',
    name: 'escalation-on-uncertainty',
    description: 'Confidence below threshold must trigger ESCALATE signal, not autonomous action',
    level: 'CONSTITUTION',
    test: (ctx) => {
      if (!ctx.decision) return { pass: true, skipped: true };
      const threshold = ctx.decision.escalation_threshold || 0.3;
      return {
        pass: ctx.decision.confidence >= threshold || ctx.decision.signal === 'ESCALATE',
        detail: `confidence: ${ctx.decision.confidence}, threshold: ${threshold}, signal: ${ctx.decision.signal}`
      };
    }
  },
  {
    id: 'INV-007',
    name: 'negative-edge-abort',
    description: 'Negative expected value trades must be rejected (Causal Decoupling EES gate)',
    level: 'CONSTITUTION',
    test: (ctx) => {
      if (!ctx.trade_proposal) return { pass: true, skipped: true };
      return {
        pass: ctx.trade_proposal.ees >= -0.5 || ctx.trade_proposal.rejected === true,
        detail: `ees: ${ctx.trade_proposal.ees}, rejected: ${ctx.trade_proposal.rejected}`
      };
    }
  },
  {
    id: 'INV-008',
    name: 'forensic-standard-applies-to-self',
    description: 'Agent cannot exempt its own output from quality checks',
    level: 'CONSTITUTION',
    test: (ctx) => {
      if (!ctx.quality_check) return { pass: true, skipped: true };
      return {
        pass: ctx.quality_check.self_exempt !== true,
        detail: `self_exempt: ${ctx.quality_check.self_exempt}`
      };
    }
  }
];

/**
 * Run all invariants against a context object.
 * Returns pass/fail for each + composite health.
 */
function runInvariants(ctx) {
  const results = INVARIANTS.map(inv => {
    try {
      const result = inv.test(ctx);
      return { ...inv, ...result, error: null };
    } catch (e) {
      return { ...inv, pass: false, error: e.message };
    }
  });

  const tested = results.filter(r => !r.skipped);
  const passed = tested.filter(r => r.pass);
  const failed = tested.filter(r => !r.pass);

  return {
    timestamp: new Date().toISOString(),
    total: INVARIANTS.length,
    tested: tested.length,
    passed: passed.length,
    failed: failed.length,
    health: tested.length > 0 ? passed.length / tested.length : 1.0,
    results,
    violations: failed.map(f => ({ id: f.id, name: f.name, detail: f.detail, error: f.error }))
  };
}

/**
 * Track constitutional health over time.
 * Detects cumulative drift even when individual checks pass.
 */
function trackDrift(runResult) {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });

  let history = [];
  if (fs.existsSync(DRIFT_LOG)) {
    try { history = JSON.parse(fs.readFileSync(DRIFT_LOG, 'utf8')); } catch { history = []; }
  }

  history.push({
    timestamp: runResult.timestamp,
    health: runResult.health,
    violations: runResult.violations.length
  });

  if (history.length > 1000) history = history.slice(-500);
  fs.writeFileSync(DRIFT_LOG, JSON.stringify(history, null, 2));

  if (history.length >= 20) {
    const recent20 = history.slice(-20);
    const older20 = history.length >= 40 ? history.slice(-40, -20) : history.slice(0, Math.min(20, history.length - 20));

    const recentHealth = recent20.reduce((a, b) => a + b.health, 0) / recent20.length;
    const olderHealth = older20.length > 0 ? older20.reduce((a, b) => a + b.health, 0) / older20.length : 1.0;
    const drift = olderHealth - recentHealth;

    return {
      driftDetected: drift > 0.1,
      constitutionalDistance: Math.round(drift * 1000) / 1000,
      recentHealth: Math.round(recentHealth * 1000) / 1000,
      olderHealth: Math.round(olderHealth * 1000) / 1000,
      trend: drift > 0.1 ? 'ERODING' : drift > 0.05 ? 'DRIFTING' : 'STABLE'
    };
  }

  return { driftDetected: false, trend: 'INSUFFICIENT_DATA' };
}

/**
 * Full constitutional health check.
 * Run after each agent cycle or on demand.
 */
function constitutionalHealthCheck(ctx) {
  const results = runInvariants(ctx);
  const drift = trackDrift(results);

  return {
    ...results,
    drift,
    alert: results.failed > 0 || drift.driftDetected,
    alertMessage: results.failed > 0
      ? `VIOLATION: ${results.violations.map(v => v.id).join(', ')}`
      : drift.driftDetected
      ? `DRIFT: Constitutional health declining (${drift.constitutionalDistance} over 20 cycles)`
      : null
  };
}

export {
  INVARIANTS,
  runInvariants,
  trackDrift,
  constitutionalHealthCheck
};
