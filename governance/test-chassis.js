#!/usr/bin/env node
/**
 * test-chassis.js — Prove the Autonomy Constitution works.
 *
 * Runs the chassis with mock organs from two different domains
 * to prove the interface is domain-agnostic.
 *
 * ESM.
 */

import { AgentOrgan } from './organ.js';
import { AutonomyChassis } from './chassis.js';
import { SIGNALS } from './escalation.js';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Mock organs (no external deps) ──

class MockMatchmaker extends AgentOrgan {
  constructor(domain, shouldFight = true) {
    super('matchmaker', 'PERCEPTION');
    this.domain = domain;
    this.shouldFight = shouldFight;
  }

  observe() {
    return { domain: this.domain, fight: this.shouldFight };
  }

  evaluate(obs) {
    return {
      signal: obs.fight ? SIGNALS.CONTINUE : SIGNALS.ABORT,
      findings: [{ key: 'fitness', value: obs.fight ? `${this.domain} conditions acceptable` : `${this.domain} conditions hostile` }],
      score: obs.fight ? 80 : 20,
    };
  }

  recommend(eval_) {
    return {
      actions: eval_.signal === SIGNALS.CONTINUE ? ['proceed'] : ['sit_out'],
      message: eval_.findings[0].value,
    };
  }

  enforce(action, eval_) {
    if (eval_?.signal === SIGNALS.ABORT) {
      return { blocked: true, reason: `${this.domain} matchmaker says sit out` };
    }
    return { blocked: false };
  }
}

class MockCorner extends AgentOrgan {
  constructor(domain, multipliers = {}) {
    super('corner', 'EXECUTION');
    this.domain = domain;
    this.mults = multipliers;
  }

  observe() { return { multipliers: this.mults }; }

  evaluate(obs) {
    const boosted = Object.entries(obs.multipliers).filter(([, v]) => v > 1.0);
    const benched = Object.entries(obs.multipliers).filter(([, v]) => v < 0.5);
    return {
      signal: SIGNALS.CONTINUE,
      findings: [
        ...boosted.map(([k, v]) => ({ key: k, value: `BOOST ×${v}` })),
        ...benched.map(([k, v]) => ({ key: k, value: `BENCH ×${v}` })),
      ],
      score: 70,
    };
  }

  recommend(eval_) {
    return {
      multipliers: this.mults,
      message: `${eval_.findings.length} adjustments`,
    };
  }
}

class MockBalanceCheck extends AgentOrgan {
  constructor(domain, balanced = true) {
    super('balance_check', 'EXECUTION');
    this.domain = domain;
    this.isBalanced = balanced;
  }

  observe() { return { balanced: this.isBalanced }; }

  evaluate(obs) {
    return {
      signal: obs.balanced ? SIGNALS.CONTINUE : SIGNALS.PAUSE,
      findings: [{ key: 'balance', value: obs.balanced ? 'balanced' : 'UNBALANCED' }],
      score: obs.balanced ? 85 : 35,
    };
  }

  recommend(eval_) {
    return {
      actions: eval_.signal === SIGNALS.CONTINUE ? [] : ['rebalance'],
      message: eval_.findings[0].value,
    };
  }
}

// ── Test 1: Trading agent — all organs green ──

console.log('============================================================');
console.log('TEST 1: Trading agent — all clear');
console.log('============================================================\n');

const trader = new AutonomyChassis('cyclical-trader', __dirname, {
  style: 'contrarian',
  riskTolerance: 0.6,
  timeHorizon: 'medium',
});

trader.register(new MockMatchmaker('trading', true));
trader.register(new MockCorner('trading', { momentum: 1.2, mean_reversion: 0.8, lunar: 0.1 }));
trader.register(new MockBalanceCheck('trading', true));

const result1 = trader.run();
console.log(`Signal: ${result1.signal}`);
console.log(`Organs: ${result1.organCount} | Blocking: ${result1.blockingCount}`);
console.log(`Healthy: ${result1.signal === 'CONTINUE' || result1.signal === 'PASS'}`);
console.log('');

// ── Test 2: Trading agent — matchmaker says sit out ──

console.log('============================================================');
console.log('TEST 2: Trading agent — matchmaker ABORT');
console.log('============================================================\n');

const trader2 = new AutonomyChassis('cyclical-trader', __dirname, {
  style: 'contrarian',
  riskTolerance: 0.6,
});

trader2.register(new MockMatchmaker('trading', false)); // ABORT
trader2.register(new MockCorner('trading', { momentum: 1.2 }));
trader2.register(new MockBalanceCheck('trading', true));

const result2 = trader2.run();
console.log(`Signal: ${result2.signal}`);
console.log(`Blocking: ${result2.blockingCount}`);
console.log(`Reasons: ${result2.reasons.map(r => `[${r.organ}] ${r.reason}`).join(', ')}`);
console.log('');

// ── Test 3: Reed agent — same interface, different domain ──

console.log('============================================================');
console.log('TEST 3: Reed agent — same chassis, different domain');
console.log('============================================================\n');

const reed = new AutonomyChassis('reed-visual-director', __dirname, {
  style: 'cinematic',
  riskTolerance: 0.3,
  timeHorizon: 'short',
});

reed.register(new MockMatchmaker('visual', true));
reed.register(new MockCorner('visual', { cinematic: 1.3, sketch: 0.9, abstract: 0.2 }));
reed.register(new MockBalanceCheck('visual', true));

const result3 = reed.run();
console.log(`Signal: ${result3.signal}`);
console.log(`Organs: ${result3.organCount} | Blocking: ${result3.blockingCount}`);
console.log('');

// ── Test 4: Reed unbalanced — same contract catches it ──

console.log('============================================================');
console.log('TEST 4: Reed unbalanced — balance check PAUSE');
console.log('============================================================\n');

const reed2 = new AutonomyChassis('reed-visual-director', __dirname, {
  style: 'cinematic',
});

reed2.register(new MockMatchmaker('visual', true));
reed2.register(new MockCorner('visual', { cinematic: 1.3 }));
reed2.register(new MockBalanceCheck('visual', false)); // unbalanced

const result4 = reed2.run();
console.log(`Signal: ${result4.signal}`);
console.log(`Reasons: ${result4.reasons.map(r => `[${r.organ}] ${r.reason}`).join(', ')}`);
console.log('');

// ── Test 5: Enforce — same action blocked differently per domain ──

console.log('============================================================');
console.log('TEST 5: Enforce — action gating');
console.log('============================================================\n');

const enforceResult1 = trader.enforce({ direction: 'short', asset: 'BTC' });
console.log(`Trader enforce (fighting): blocked=${enforceResult1.blocked}`);

const enforceResult2 = trader2.enforce({ direction: 'short', asset: 'BTC' });
console.log(`Trader enforce (sitting out): blocked=${enforceResult2.blocked}, reason=${enforceResult2.reason}`);
console.log('');

// ── Test 6: Fleet report — both agents reporting same shape ──

console.log('============================================================');
console.log('TEST 6: Fleet report — both agents, same shape');
console.log('============================================================\n');

const fleet = [trader.report(), reed.report()];
for (const report of fleet) {
  console.log(`${report.agentId}: signal=${report.signal} healthy=${report.healthy} organs=${report.organCount}`);
}
console.log('');

// ── Test 7: Explain — both agents explain themselves ──

console.log('============================================================');
console.log('TEST 7: Explain — both agents explain themselves');
console.log('============================================================\n');

const traderExplain = trader.explain();
const reedExplain = reed.explain();

console.log(`Trader (${traderExplain.identity.style}):`);
for (const [level, organs] of Object.entries(traderExplain.levels)) {
  for (const o of organs) {
    console.log(`  [${level}] ${o.summary}`);
  }
}

console.log(`\nReed (${reedExplain.identity.style}):`);
for (const [level, organs] of Object.entries(reedExplain.levels)) {
  for (const o of organs) {
    console.log(`  [${level}] ${o.summary}`);
  }
}

console.log('\n============================================================');
console.log('All tests complete. Same interface, two domains.');
console.log('============================================================');
