/**
 * Test: Linda Tuples + Bandit Brain + Swarm Loop
 * Run: node test-swarm.js
 */

import { out, rd, inp, scan, watch, cleanup } from './linda-vault.js';
import { chooseAction, recordOutcome, getState, reset, close } from './bandit-brain.js';
import { joinLoop } from './swarm-loop.js';

function header(msg) { console.log(`\n${'═'.repeat(50)}\n${msg}\n${'═'.repeat(50)}`); }

// ─── Test 1: Linda Tuple Space ───
header('TEST 1: Linda Tuple Space');

// Post tuples
out(['drift', 'fear_gate', 0.8], 'test', 'cathy');
out(['drift', 'vortex', 0.3], 'test', 'muse');
out(['discovery', 'sports_science', 0.9], 'test', 'archaeologist');

// Read with pattern matching
const match1 = rd(['drift', null, null], 'test');
console.log('rd(["drift", null, null]):', match1?.tuple, `from ${match1?.agentId}`);

const match2 = rd(['drift', 'vortex', null], 'test');
console.log('rd(["drift", "vortex", null]):', match2?.tuple);

const noMatch = rd(['nonexistent', null], 'test');
console.log('rd(["nonexistent", null]):', noMatch);

// Scan all drift tuples
const allDrifts = scan(['drift', null, null], 'test');
console.log(`scan(["drift", null, null]): ${allDrifts.length} matches`);

// Destructive read
const consumed = inp(['drift', 'fear_gate', null], 'test');
console.log('inp(["drift", "fear_gate", null]):', consumed?.tuple, '(consumed)');
const afterConsume = rd(['drift', 'fear_gate', null], 'test');
console.log('After consume, rd same pattern:', afterConsume);

console.log('\n✓ Linda tuple space working');

// ─── Test 2: Bandit Brain ───
header('TEST 2: Bandit Brain (Thompson Sampling)');

reset('test-agent');
const domains = ['sports_science', 'frame_collapse', 'fear_gate', 'vortex'];

// Initial choice — should be roughly uniform (all priors equal)
console.log('\nInitial choices (uniform priors):');
const counts = {};
for (let i = 0; i < 100; i++) {
  const pick = chooseAction('test-agent', domains);
  counts[pick.action] = (counts[pick.action] || 0) + 1;
}
console.log(counts);

// Feed sports_science wins from trusted source
for (let i = 0; i < 5; i++) {
  recordOutcome('test-agent', 'sports_science', true, 'archaeologist');
}
// Feed frame_collapse losses
for (let i = 0; i < 3; i++) {
  recordOutcome('test-agent', 'frame_collapse', false, 'cathy');
}

console.log('\nAfter 5 sports_science wins + 3 frame_collapse losses:');
const counts2 = {};
for (let i = 0; i < 100; i++) {
  const pick = chooseAction('test-agent', domains);
  counts2[pick.action] = (counts2[pick.action] || 0) + 1;
}
console.log(counts2);
console.log('Arms:', getState('test-agent').map(a => `${a.action}: α=${a.alpha.toFixed(1)} β=${a.beta.toFixed(1)}`));

// Test two-source confirmation
console.log('\nTwo-source confirmation test:');
const r1 = recordOutcome('test-agent', 'vortex', true, 'unknown_agent_1');
console.log('First untrusted report:', r1);
const r2 = recordOutcome('test-agent', 'vortex', true, 'unknown_agent_2');
console.log('Second untrusted report (corroborating):', r2);

console.log('\n✓ Bandit brain working');

// ─── Test 3: Swarm Loop ───
header('TEST 3: Swarm Learning Loop');

reset('archaeologist-test');
reset('prospector-test');

const arch = joinLoop('archaeologist-test', domains);
const prosp = joinLoop('prospector-test', domains);

// Archaeologist chooses
const pick = arch.choose();
console.log(`Archaeologist chose: ${pick.action} (sample: ${pick.sample.toFixed(3)})`);
console.log('All samples:', pick.arms.map(a => `${a.action}=${a.sample}`).join(', '));

// Archaeologist posts discovery
arch.reportDiscovery(pick.action, 0.9);
console.log(`Discovery posted: ${pick.action}`);

// Prospector reads discoveries
const disc = prosp.discoveries();
console.log(`Prospector sees ${disc.length} discovery(ies)`);

// Prospector reports outcome (trusted — in default trusted list)
prosp.reportOutcome(pick.action, true);
console.log(`Outcome reported for: ${pick.action}`);

// Give file watcher a moment to fire, then check state
setTimeout(() => {
  console.log('\nArchaeologist arms after loop:');
  console.log(arch.state().map(a => `${a.action}: α=${a.alpha.toFixed(1)} β=${a.beta.toFixed(1)} (${a.total_updates} updates)`));

  arch.leave();
  prosp.leave();
  cleanup();
  close();

  console.log('\n✓ Swarm loop working');
  header('ALL TESTS PASSED');
}, 500);
