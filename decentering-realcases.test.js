// decentering-realcases.test.js
// Validates the 4-way taxonomy against REAL documented Cathedral incidents
// (sourced from CLAUDE.md build log + memory). Each case is hand-labeled with the
// class the system ACTUALLY resolved it as, then scored against classifyHold.
//
// HONEST LIMIT: cases are authored + labeled from known history (not blind), so this
// tests TAXONOMY FIT/COVERAGE — does the 4-way scheme capture real stuck-states and
// does the cascade land them right. It does NOT test raw-text→signature extraction
// (that needs the live logger). Run: node decentering-realcases.test.js
import { classifyHold, HOLD_CLASS } from './decentering-sense.js';

// Each: real incident → structured signature → expected class (what actually happened).
const CASES = [
  {
    name: 'Yoda phantom rating-list (2026-06-04)',
    real: 'Yoda invented a "raw 100-rating list" that did not exist; Reed-Director blocked on the imaginary artifact. Outcome: incident DISMISSED.',
    sig: { goal: 'rate using the 100-item list', progressDelta: 0, goalValid: false, provenance: 'phantom-trigger' },
    expect: HOLD_CLASS.NOISE, // goal references non-existent artifact → flag + clear (it was dismissed)
  },
  {
    name: 'production-engine "blocked-on-paul"',
    real: 'classifyDeliverable returns blocked-on-paul; routed to Telegram as a real ask. Agent waits on Paul.',
    sig: { goal: 'ship X pending Paul decision', progressDelta: 0, goalValid: true,
      releaseCondition: { desc: 'Paul approves/answers', externallyVerifiable: true, isRealFutureEvent: true, fired: false },
      waitElapsed: 1, maxWait: 100 },
    expect: HOLD_CLASS.HOLD, // real external release condition (Paul replies) → wait
  },
  {
    name: 'Agent refusal on a valid task',
    real: 'classifyDeliverable=refusal: agent declines a real task. [REFUSED] annotated, kept WATCHING.',
    sig: { goal: 'valid task', progressDelta: 0, goalValid: true, provenance: 'human' },
    expect: HOLD_CLASS.BLOCK, // valid goal, agent stuck → cognitive block, route to reframe
  },
  {
    name: 'LLM errored mid-deliverable',
    real: 'classifyDeliverable=error: model call errored. [ERRORED] annotated.',
    sig: { goal: 'valid task', progressDelta: 0, goalValid: true, blockSubtype: 'environmental' },
    expect: HOLD_CLASS.BLOCK, // environmental block → fixer, not reframe
  },
  {
    name: 'Trader holding for entry signal',
    real: 'Single trader, twice-daily cron. No signal = no trade. Correct patience, not stuck.',
    sig: { goal: 'enter position', progressDelta: 0, goalValid: true,
      releaseCondition: { desc: 'entry signal / price level fires', externallyVerifiable: true, isRealFutureEvent: true, fired: false },
      waitElapsed: 1, maxWait: 12 },
    expect: HOLD_CLASS.HOLD,
  },
  {
    name: 'Cron firing on 35-day-stale PunchPass data',
    real: 'Caught stale-data cron before wiring. Task runs but input is 35 days old — junk output.',
    sig: { goal: 'process attendance', progressDelta: 0, provenance: 'stale-data' },
    expect: HOLD_CLASS.NOISE, // invalid input → flag + clear (fix input, do not "solve")
  },
  {
    name: 'Multi-file build still advancing (slow)',
    real: 'A staged build: artifacts accruing, sub-goals closing. Looks slow, is progressing.',
    sig: { goal: 'finish build', progressDelta: 0.4, goalValid: true },
    expect: HOLD_CLASS.PROGRESS, // don't touch
  },
  {
    name: 'reasoning-loop judge: improved=false after 2 loops',
    real: 'GENERATE→CRITIQUE→REVISE→JUDGE ran 2 loops, no improvement, problem is valid.',
    sig: { goal: 'solve real problem', progressDelta: 0, goalValid: true, provenance: 'agent' },
    expect: HOLD_CLASS.BLOCK, // genuine cognitive block on a real task → reframe
  },
  {
    name: 'Reed credit-exhausted (0.08 left), waiting refresh',
    real: 'Reed stopped at 0.08 credits, resumes on billing refresh. Cascade test: is this HOLD or BLOCK?',
    sig: { goal: 'generate visuals', progressDelta: 0, goalValid: true,
      releaseCondition: { desc: 'billing/credits refresh', externallyVerifiable: true, isRealFutureEvent: true, fired: false },
      waitElapsed: 1, maxWait: 30 },
    expect: HOLD_CLASS.HOLD, // real verifiable release → wait, do NOT reframe a credit wall
  },
];

let pass = 0, fail = 0;
const byClass = {};
console.log('\n── 4-way taxonomy vs real documented incidents ──\n');
for (const c of CASES) {
  const got = classifyHold(c.sig).klass;
  const ok = got === c.expect;
  byClass[c.expect] = byClass[c.expect] || { n: 0, ok: 0 };
  byClass[c.expect].n++; if (ok) byClass[c.expect].ok++;
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${c.name}`);
  console.log(`   real: ${c.real}`);
  console.log(`   → expected ${c.expect}, got ${got}${ok ? '' : '  ⚠ MISMATCH'}\n`);
}
console.log('per-class coverage:', JSON.stringify(byClass));
const holdMisreadAsBlock = CASES.some(c => c.expect === HOLD_CLASS.HOLD && classifyHold(c.sig).klass === HOLD_CLASS.BLOCK);
console.log(`expensive-error check (HOLD misread as BLOCK): ${holdMisreadAsBlock ? '❌ PRESENT' : '✅ none'}`);
console.log(`\n${'═'.repeat(52)}\n${fail === 0 ? '✅ TAXONOMY FITS' : '❌ GAPS'} — ${pass}/${CASES.length} real cases land correctly\n`);
process.exit(fail === 0 ? 0 : 1);
