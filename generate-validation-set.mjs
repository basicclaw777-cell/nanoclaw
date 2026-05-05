/**
 * Generate 50 Test Combinations for Coach Validation
 *
 * Produces combinations across 5 areas (10 each):
 * 1. Pure punch combos (2-5 punches)
 * 2. Defense chains (2-3 defenses)
 * 3. Footwork chains (2-4 atoms)
 * 4. Defense → counter (integrated)
 * 5. Mixed sequences (edge cases, boundary tests)
 *
 * Output: Markdown table Paul can grade on phone.
 * Each combo: physically coherent? would you drill it? stage assignment correct?
 */

import {
  PUNCHES, DEFENSES, FOOTWORK, WEIGHT_TRANSITIONS,
  validatePunchCombo, validateDefenseChain, validateFootworkChain,
  validateDefenseToCounter, validateIntegratedSequence,
} from './combination-validator.js';

const NOTATION = {
  jab: '1', cross: '2', lead_hook: '3', rear_hook: '4',
  lead_uppercut: '5', rear_uppercut: '6', lead_body: '3b',
  rear_body: '2b', jab_body: '1b', overhand: '2o',
};

function notate(seq) {
  return seq.map(s => NOTATION[s] || s).join('-');
}

// ─── AREA 1: Pure Punch Combos ──────────────────────────────────────────────
const punchCombos = [
  // Classic combos everyone knows
  { seq: ['jab', 'cross'], stage: 2, note: 'Classic 1-2' },
  { seq: ['jab', 'cross', 'lead_hook'], stage: 2, note: 'Classic 1-2-3' },
  { seq: ['jab', 'cross', 'lead_hook', 'cross'], stage: 3, note: '1-2-3-2 — four piece' },
  // Body work
  { seq: ['jab', 'rear_body', 'lead_hook'], stage: 3, note: 'Level change mid-combo' },
  { seq: ['jab_body', 'cross', 'lead_hook'], stage: 3, note: 'Low start, go high' },
  // Double jab patterns
  { seq: ['jab', 'jab', 'cross'], stage: 2, note: 'Double jab — timing disruption' },
  { seq: ['jab', 'jab', 'rear_body'], stage: 3, note: 'Double jab — drop to body' },
  // Power shots
  { seq: ['jab', 'overhand', 'lead_hook'], stage: 4, note: 'Overhand entry — high commitment' },
  { seq: ['jab', 'cross', 'lead_uppercut', 'cross'], stage: 4, note: '1-2-5-2 — uppercut in the middle' },
  // Deliberate edge case — should the validator catch this?
  { seq: ['jab', 'cross', 'lead_hook', 'lead_uppercut', 'cross'], stage: 4, note: '5-piece — sustained output test' },
];

// ─── AREA 2: Defense Chains ─────────────────────────────────────────────────
const defenseCombos = [
  { seq: ['slip_right', 'duck', 'slip_left'], stage: 3, note: 'Lateral → sagittal → lateral — strong axis rotation' },
  { seq: ['parry', 'slip_right'], stage: 2, note: 'Static → lateral — basic parry and move' },
  { seq: ['bob_weave_left', 'bob_weave_right'], stage: 3, note: 'Both rotational — same axis, weak chain?' },
  { seq: ['shoulder_roll', 'cross'], stage: 3, note: 'Philly shell counter — roll then fire' },
  { seq: ['pull_back', 'slip_left', 'duck'], stage: 3, note: 'Three-axis defense — sagittal, lateral, sagittal' },
  { seq: ['catch', 'slip_right', 'bob_weave_left'], stage: 4, note: 'Static → lateral → rotational — three different axes' },
  { seq: ['duck', 'pull_back'], stage: 2, note: 'Both sagittal — weak chain per axis rules' },
  { seq: ['parry', 'catch', 'slip_left'], stage: 3, note: 'Static → static → lateral' },
  { seq: ['slip_left', 'bob_weave_right', 'duck'], stage: 4, note: 'Lateral → rotational → sagittal — full rotation' },
  { seq: ['shoulder_roll', 'slip_left', 'duck', 'slip_right'], stage: 5, note: 'Four-defense chain — advanced evasion' },
];

// ─── AREA 3: Footwork Chains ────────────────────────────────────────────────
const footworkCombos = [
  { seq: ['step', 'step', 'step'], stage: 1, note: 'Basic advancing steps' },
  { seq: ['step', 'snap', 'step'], stage: 2, note: 'Step-snap-step — quick direction change' },
  { seq: ['step', 'pop', 'step'], stage: 3, note: 'Step into pop (loaded), resolve with step' },
  { seq: ['step', 'reset', 'snap'], stage: 3, note: 'Reset into snap — loaded then quick' },
  { seq: ['step', 'beat', 'step', 'step'], stage: 3, note: 'Beat creates hold moment' },
  { seq: ['snap', 'snap'], stage: 0, note: 'SHOULD FAIL — no step between snaps' },
  { seq: ['pop', 'pop'], stage: 0, note: 'SHOULD FAIL — pop cannot chain to pop' },
  { seq: ['step', 'snap', 'step', 'beat', 'step'], stage: 4, note: 'Complex flowing chain' },
  { seq: ['reset', 'step', 'snap', 'step'], stage: 3, note: 'Start loaded, flow out' },
  { seq: ['step', 'step', 'pop', 'step', 'snap', 'step'], stage: 4, note: '6-atom chain — full footwork phrase' },
];

// ─── AREA 4: Defense → Counter (Integrated) ────────────────────────────────
const integratedCombos = [
  { defense: 'slip_right', combo: ['cross', 'lead_hook'], stage: 3, note: 'Classic slip-counter: slip right, fire cross-hook' },
  { defense: 'slip_left', combo: ['lead_hook', 'cross'], stage: 3, note: 'Slip left, lead hook counter, follow with cross' },
  { defense: 'duck', combo: ['lead_uppercut', 'cross'], stage: 4, note: 'Under the hook, come up with uppercut' },
  { defense: 'pull_back', combo: ['cross', 'lead_hook', 'cross'], stage: 4, note: 'Pull back, spring forward with 2-3-2' },
  { defense: 'bob_weave_right', combo: ['cross', 'lead_hook'], stage: 4, note: 'Weave right, fire cross from loaded position' },
  { defense: 'shoulder_roll', combo: ['cross', 'lead_hook', 'cross'], stage: 5, note: 'Mayweather shell → counter combo' },
  { defense: 'parry', combo: ['jab', 'cross'], stage: 2, note: 'Parry jab, return jab-cross' },
  { defense: 'catch', combo: ['cross', 'lead_hook'], stage: 3, note: 'Catch hook, counter cross-hook' },
  { defense: 'slip_right', combo: ['rear_uppercut', 'lead_hook'], stage: 4, note: 'Slip right, uppercut from low, hook follow' },
  // Edge case — should fail
  { defense: 'parry', combo: ['lead_uppercut'], stage: 0, note: 'SHOULD FAIL — parry does not load uppercut' },
];

// ─── AREA 5: Mixed / Edge Cases ─────────────────────────────────────────────
const mixedCombos = [
  { type: 'punch', seq: ['lead_hook', 'lead_hook'], stage: 0, note: 'SHOULD FAIL — double lead hook, weight on rear after first' },
  { type: 'punch', seq: ['cross', 'overhand'], stage: 0, note: 'SHOULD FAIL — both rear hand from forward weight' },
  { type: 'punch', seq: ['jab'], stage: 1, note: 'Single jab — is this a valid "combination"?' },
  { type: 'punch', seq: ['lead_uppercut', 'rear_uppercut', 'lead_hook', 'cross'], stage: 5, note: 'Uppercut exchange into hooks — advanced' },
  { type: 'punch', seq: ['jab', 'cross', 'lead_body', 'cross', 'lead_hook'], stage: 4, note: '5-piece with body shot — sustained pressure' },
  { type: 'punch', seq: ['rear_body', 'lead_hook', 'cross'], stage: 3, note: 'Body-head-head — level change out' },
  { type: 'integrated', defense: 'duck', combo: ['rear_body', 'lead_hook'], stage: 4, note: 'Duck, stay low with body shot, come up with hook' },
  { type: 'punch', seq: ['jab', 'lead_hook'], stage: 3, note: 'Jab to same-hand hook — quick angle change' },
  { type: 'punch', seq: ['overhand', 'lead_hook', 'cross'], stage: 5, note: 'Overhand entry — maximum aggression' },
  { type: 'integrated', defense: 'bob_weave_left', combo: ['lead_hook', 'cross', 'lead_hook'], stage: 5, note: 'Weave left → triple: hook-cross-hook' },
];

// ─── RUN VALIDATION & OUTPUT ────────────────────────────────────────────────

let output = [];
output.push('# Coach Validation Sheet — 50 Combinations');
output.push('');
output.push('**Instructions:** For each combination, answer three questions:');
output.push('1. **Coherent?** — Is this physically possible and biomechanically sound? (Y/N)');
output.push('2. **Drill it?** — Would you teach this as a drill to a student at the assigned stage? (Y/N)');
output.push('3. **Stage correct?** — Is the difficulty stage assignment right? (Y/N, or correct stage)');
output.push('');
output.push('**Threshold:** >80% coherent (40/50) = proceed to build. <80% = stop, fix the rule engine.');
output.push('');
output.push('---');
output.push('');

let comboNum = 0;

function addSection(title, combos, type) {
  output.push(`## ${title}`);
  output.push('');
  output.push('| # | Combination | Stage | Validator | Coherent? | Drill? | Stage OK? | Notes |');
  output.push('|---|-------------|-------|-----------|-----------|--------|-----------|-------|');

  for (const c of combos) {
    comboNum++;
    let result, notation, display;

    if (type === 'punch') {
      result = validatePunchCombo(c.seq);
      notation = notate(c.seq);
      display = c.seq.join(' → ');
    } else if (type === 'defense') {
      result = validateDefenseChain(c.seq);
      notation = c.seq.join(' → ');
      display = notation;
    } else if (type === 'footwork') {
      result = validateFootworkChain(c.seq);
      notation = c.seq.join(' → ');
      display = notation;
    } else if (type === 'integrated') {
      result = validateIntegratedSequence(c.defense, c.combo);
      notation = `${c.defense} → ${notate(c.combo)}`;
      display = `${c.defense} → ${c.combo.join(' → ')}`;
      result = { valid: result.integrated };
    } else if (type === 'mixed') {
      if (c.type === 'punch') {
        result = validatePunchCombo(c.seq);
        notation = notate(c.seq);
        display = c.seq.join(' → ');
      } else {
        result = validateIntegratedSequence(c.defense, c.combo);
        notation = `${c.defense} → ${notate(c.combo)}`;
        display = `${c.defense} → ${c.combo.join(' → ')}`;
        result = { valid: result.integrated };
      }
    }

    const validatorSays = result.valid ? '✓' : '✗';
    const stage = c.stage === 0 ? 'FAIL' : `S${c.stage}`;

    output.push(`| ${comboNum} | ${notation} | ${stage} | ${validatorSays} | | | | ${c.note} |`);
  }
  output.push('');
}

addSection('Area 1 — Pure Punch Combinations', punchCombos, 'punch');
addSection('Area 2 — Defense Chains', defenseCombos, 'defense');
addSection('Area 3 — Footwork Chains', footworkCombos, 'footwork');
addSection('Area 4 — Defense → Counter (Integrated)', integratedCombos, 'integrated');
addSection('Area 5 — Mixed / Edge Cases', mixedCombos, 'mixed');

output.push('---');
output.push('');
output.push('## Scoring');
output.push('');
output.push('| Metric | Count | Percentage |');
output.push('|--------|-------|------------|');
output.push('| Coherent (Y) | /50 | |');
output.push('| Would drill (Y) | /50 | |');
output.push('| Stage correct (Y) | /50 | |');
output.push('| Validator agreed with coach | /50 | |');
output.push('');
output.push('**Pass threshold:** Coherent > 40/50 (80%)');
output.push('**If pass:** Proceed to build AI session generator');
output.push('**If fail:** Which rules produced the errors? Fix before proceeding.');
output.push('');

const text = output.join('\n');
process.stdout.write(text);

// Write to file
import { writeFileSync } from 'fs';
import { join } from 'path';
const outPath = join(process.env.HOME, 'br-gm-agent', 'drafts', 'coach-validation-50-combos.md');
writeFileSync(outPath, text);
console.error(`\nWritten to: ${outPath}`);
