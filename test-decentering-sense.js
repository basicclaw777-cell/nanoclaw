// test-decentering-sense.js — deterministic-core tests for the Three-Register Sense.
// Run: node test-decentering-sense.js
import {
  classifyHold, computeReward, decompileConfirm, routeRegister,
  HOLD_CLASS, REGISTER, logImpasse,
} from './decentering-sense.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? '✅' : '❌'} ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
};
const truthy = (name, got) => { const ok = !!got; console.log(`${ok ? '✅' : '❌'} ${name}`); ok ? pass++ : fail++; };

console.log('\n── 4-way classifier ───────────────────────────────');

// PROGRESS — slow but advancing → don't touch.
eq('PROGRESS: positive delta',
  classifyHold({ goal: 'refactor', progressDelta: 0.3, goalValid: true }).klass, HOLD_CLASS.PROGRESS);

// HOLD — real, externally-verifiable wait → honor it.
eq('HOLD: verifiable real wait',
  classifyHold({ goal: 'enter trade', progressDelta: 0,
    releaseCondition: { desc: 'BTC < 60k', externallyVerifiable: true, isRealFutureEvent: true, fired: false },
    waitElapsed: 2, maxWait: 10 }).klass, HOLD_CLASS.HOLD);

// FABRICATED HOLD — agent claims a wait that isn't externally verifiable → must NOT be HOLD.
// Not a real future event either → falls through to BLOCK (no fabricated patience escape hatch).
eq('FABRICATED HOLD → BLOCK (not HOLD)',
  classifyHold({ goal: 'write report', progressDelta: 0, goalValid: true,
    releaseCondition: { desc: 'vibes need to align', externallyVerifiable: false, isRealFutureEvent: false, fired: false } }).klass,
  HOLD_CLASS.BLOCK);

// CONSERVATIVE DEFAULT — plausibly-real but not-yet-verifiable wait → HOLD, never straight to BLOCK.
const cons = classifyHold({ goal: 'await upstream', progressDelta: 0, goalValid: true,
  releaseCondition: { desc: 'sibling agent returns', externallyVerifiable: false, isRealFutureEvent: true, fired: false } });
eq('CONSERVATIVE DEFAULT → HOLD', cons.klass, HOLD_CLASS.HOLD);
truthy('CONSERVATIVE DEFAULT flagged defaultApplied', cons.defaultApplied);

// EXPIRED HOLD — past max-wait → re-enters cascade → BLOCK.
eq('EXPIRED HOLD → BLOCK',
  classifyHold({ goal: 'enter trade', progressDelta: 0, goalValid: true,
    releaseCondition: { desc: 'BTC < 60k', externallyVerifiable: true, isRealFutureEvent: true, fired: false },
    waitElapsed: 20, maxWait: 10 }).klass, HOLD_CLASS.BLOCK);

// NOISE — phantom-triggered junk task → flag + clear.
eq('NOISE: phantom-trigger',
  classifyHold({ goal: 'process empty batch', progressDelta: 0, provenance: 'phantom-trigger' }).klass, HOLD_CLASS.NOISE);
eq('NOISE: stale-data',
  classifyHold({ goal: 'cron on 35-day-old data', progressDelta: 0, provenance: 'stale-data' }).klass, HOLD_CLASS.NOISE);

// BLOCK — valid goal, no motion, no wait, not noise → reframe.
const blk = classifyHold({ goal: 'solve real problem', progressDelta: 0, goalValid: true, provenance: 'human' });
eq('BLOCK: genuine cognitive block', blk.klass, HOLD_CLASS.BLOCK);
eq('BLOCK: subtype cognitive', blk.blockSubtype, 'cognitive');

console.log('\n── register router ────────────────────────────────');
eq('route: qualitative → JUDGMENT', routeRegister({ kind: 'taste' }), REGISTER.JUDGMENT);
eq('route: action → EXECUTION', routeRegister({ kind: 'action' }), REGISTER.EXECUTION);
eq('route: default → COMMUNICATION', routeRegister({}), REGISTER.COMMUNICATION);

console.log('\n── gated reward ───────────────────────────────────');
// Cleared AND held → positive net reward.
const r1 = computeReward({ blockCleared: true, persistedK: true, forwardProgress: 5, cost: 1, newContradictions: 0 });
truthy('reward: cleared+held → positive', r1.reward === 4 && r1.success === true);

// Cleared but did NOT persist → only cost penalty (net negative). Kills fake-unblock-then-restick.
const r2 = computeReward({ blockCleared: true, persistedK: false, forwardProgress: 5, cost: 1 });
truthy('reward: cleared-not-held → negative', r2.reward === -1 && r2.success === false);

// Unblocked by fabricating a path (contradictions ↑) → penalized.
const r3 = computeReward({ blockCleared: true, persistedK: true, forwardProgress: 2, cost: 1, newContradictions: 3 });
truthy('reward: fabricated path → punished', r3.reward === (2 - 1 - 2 * 3) && r3.success === false);

// Misintervention — reframe fired on a non-block → negative, regardless of "progress".
const r4 = computeReward({ shouldNotHaveIntervened: true, blockCleared: true, persistedK: true, forwardProgress: 99, cost: 1 });
truthy('reward: misintervention → negative', r4.reward < 0 && r4.success === false);

console.log('\n── decompile-confirm (confident-precise-wrong guard) ──');
// Operator sees the plain-words back-translation and rejects a precise-but-wrong action.
const dc = decompileConfirm(
  { op: 'DELETE', table: 'members' },
  (f) => `About to ${f.op} all rows in "${f.table}".`,
  (nl) => !nl.includes('DELETE all rows in "members"'), // human/agent rejects this
);
truthy('decompile-confirm: back-translates to NL', dc.nlPreview.includes('DELETE all rows'));
truthy('decompile-confirm: precise-but-wrong action NOT committed', dc.committed === false);

console.log('\n── logger smoke test ──────────────────────────────');
const row = logImpasse({ ts: 0, klass: HOLD_CLASS.BLOCK, blockType: 'cognitive',
  signature: 'no-motion-valid-goal', register: REGISTER.EXECUTION, operator: 'sentence_to_map',
  cost: 1, blockCleared: true, persistedK: true, newContradictions: 0, forwardProgress: 5, verifiedOutcome: 'cleared' });
truthy('logger: writes a structured triple', row.block_class === 'BLOCK' && row.reframe_operator === 'sentence_to_map');

console.log(`\n${'═'.repeat(50)}\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
