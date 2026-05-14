/**
 * Basic Reflex — Combination Validator Engine
 *
 * Encodes Paul Logan's weight-state relay, defense axis compatibility,
 * and footwork rhythm compatibility matrix as a generative rule system.
 *
 * Evaluates any proposed boxing combination for biomechanical validity.
 * Reasons from principle, not pattern — can evaluate novel combinations
 * that have never appeared in training data.
 *
 * (c) Basic Reflex / Paul Logan 2026
 */

// ─── PUNCH DEFINITIONS ──────────────────────────────────────────────────────

const PUNCHES = {
  // Orthodox stance assumed. Mirror for southpaw.
  jab:            { hand: 'lead',  trajectory: 'straight', weightExit: 'neutral',  powerLevel: 'light',  commitmentGap: false },
  cross:          { hand: 'rear',  trajectory: 'straight', weightExit: 'forward',  powerLevel: 'heavy',  commitmentGap: true  },
  lead_hook:      { hand: 'lead',  trajectory: 'lateral',  weightExit: 'rear',     powerLevel: 'heavy',  commitmentGap: true  },
  rear_hook:      { hand: 'rear',  trajectory: 'lateral',  weightExit: 'lead',     powerLevel: 'heavy',  commitmentGap: true  },
  lead_uppercut:  { hand: 'lead',  trajectory: 'vertical', weightExit: 'loaded_lead',  powerLevel: 'heavy', commitmentGap: true },
  rear_uppercut:  { hand: 'rear',  trajectory: 'vertical', weightExit: 'loaded_rear',  powerLevel: 'heavy', commitmentGap: true },
  lead_body:      { hand: 'lead',  trajectory: 'lateral',  weightExit: 'rear',     powerLevel: 'medium', commitmentGap: true  },
  rear_body:      { hand: 'rear',  trajectory: 'straight', weightExit: 'forward',  powerLevel: 'medium', commitmentGap: true  },
  jab_body:       { hand: 'lead',  trajectory: 'straight', weightExit: 'neutral',  powerLevel: 'light',  commitmentGap: false },
  overhand:       { hand: 'rear',  trajectory: 'arc',      weightExit: 'forward',  powerLevel: 'heavy',  commitmentGap: true  },
};

// ─── WEIGHT STATE TRANSITION RULES ──────────────────────────────────────────
//
// The weight-state relay: every punch leaves the body in a specific weight state.
// The next punch is constrained by that state.
// "neutral" = can go anywhere. The jab is the only universal setup.

const WEIGHT_TRANSITIONS = {
  neutral: {
    // From neutral, everything is available
    jab: true, cross: true, lead_hook: true, rear_hook: true,
    lead_uppercut: true, rear_uppercut: true, lead_body: true,
    rear_body: true, jab_body: true, overhand: true,
  },
  forward: {
    // Weight forward (after cross, rear_body): rear hand spent, lead hand loaded
    jab: true, cross: false, lead_hook: true, rear_hook: false,
    lead_uppercut: true, rear_uppercut: false, lead_body: true,
    rear_body: false, jab_body: true, overhand: false,
    _reason: 'Weight is forward — rear hand has no base to fire from',
  },
  rear: {
    // Weight shifted to rear side (after lead_hook, lead_body)
    jab: false, cross: true, lead_hook: false, rear_hook: true,
    lead_uppercut: false, rear_uppercut: true, lead_body: false,
    rear_body: true, jab_body: false, overhand: true,
    _reason: 'Weight is on rear side — lead hand has no base to fire from',
  },
  lead: {
    // Weight shifted to lead side (after rear_hook)
    jab: true, cross: false, lead_hook: true, rear_hook: false,
    lead_uppercut: true, rear_uppercut: false, lead_body: true,
    rear_body: false, jab_body: true, overhand: false,
    _reason: 'Weight is on lead side — rear hand has no base to fire from',
  },
  loaded_lead: {
    // Lead side loaded down (after lead_uppercut) — committed low
    jab: false, cross: true, lead_hook: false, rear_hook: true,
    lead_uppercut: false, rear_uppercut: true, lead_body: false,
    rear_body: true, jab_body: false, overhand: true,
    _reason: 'Lead side loaded low from uppercut — cross or rear hook follow naturally',
  },
  loaded_rear: {
    // Rear side loaded down (after rear_uppercut) — committed low
    jab: true, cross: false, lead_hook: true, rear_hook: false,
    lead_uppercut: true, rear_uppercut: false, lead_body: true,
    rear_body: false, jab_body: true, overhand: false,
    _reason: 'Rear side loaded low from uppercut — jab or lead hook follow naturally',
  },
};

// ─── DEFENSE DEFINITIONS ────────────────────────────────────────────────────

const DEFENSES = {
  slip_left:      { axis: 'lateral',    weightExit: 'lead',    loadsCounter: ['lead_hook', 'lead_uppercut', 'lead_body'] },
  slip_right:     { axis: 'lateral',    weightExit: 'rear',    loadsCounter: ['cross', 'rear_hook', 'rear_uppercut', 'overhand'] },
  duck:           { axis: 'sagittal',   weightExit: 'neutral', loadsCounter: ['lead_uppercut', 'rear_uppercut', 'lead_body', 'rear_body'] },
  pull_back:      { axis: 'sagittal',   weightExit: 'rear',    loadsCounter: ['cross', 'overhand'] },
  bob_weave_left: { axis: 'rotational', weightExit: 'lead',    loadsCounter: ['lead_hook', 'lead_uppercut'] },
  bob_weave_right:{ axis: 'rotational', weightExit: 'rear',    loadsCounter: ['cross', 'rear_hook', 'rear_uppercut'] },
  parry:          { axis: 'static',     weightExit: 'neutral', loadsCounter: ['jab', 'cross'] },
  catch:          { axis: 'static',     weightExit: 'neutral', loadsCounter: ['jab', 'cross', 'lead_hook', 'rear_hook'] },
  shoulder_roll:  { axis: 'rotational', weightExit: 'rear',    loadsCounter: ['cross', 'rear_hook', 'overhand'] },
};

// ─── DEFENSE AXIS COMPATIBILITY ─────────────────────────────────────────────
//
// Strong defensive chains alternate axis.
// Same-axis chains compound instability in one direction.

const AXIS_COMPATIBILITY = {
  sagittal:   { sagittal: 'weak',   lateral: 'strong', rotational: 'strong', static: 'neutral' },
  lateral:    { sagittal: 'strong', lateral: 'weak',   rotational: 'strong', static: 'neutral' },
  rotational: { sagittal: 'strong', lateral: 'strong', rotational: 'weak',   static: 'neutral' },
  static:     { sagittal: 'neutral', lateral: 'neutral', rotational: 'neutral', static: 'weak' },
};

// ─── FOOTWORK DEFINITIONS ───────────────────────────────────────────────────

const FOOTWORK = {
  step:  { beats: 1,   rhythm: 'flowing', hold: false, chainsWith: ['step', 'snap', 'pop', 'reset', 'beat'] },
  snap:  { beats: 0.5, rhythm: 'flowing', hold: false, chainsWith: ['step', 'reset'],
           incompatible: ['snap', 'pop', 'beat'],
           rule: 'Requires stabilising step between two snaps' },
  pop:   { beats: 1.5, rhythm: 'loaded',  hold: true,  chainsWith: ['step'],
           incompatible: ['pop', 'snap', 'beat'],
           rule: 'Has a hang moment mid-execution — chains only to steps after landing' },
  reset: { beats: 1.5, rhythm: 'loaded',  hold: true,  chainsWith: ['step', 'snap'],
           incompatible: ['reset', 'pop'],
           rule: 'A loading atom — chains to steps and snaps after full resolution' },
  beat:  { beats: 1,   rhythm: 'loaded',  hold: true,  chainsWith: ['step', 'reset'],
           incompatible: ['pop', 'beat'],
           rule: 'Requires hold before next atom — incompatible with pops and beats' },
};

// ─── VALIDATION ENGINE ──────────────────────────────────────────────────────

/**
 * Validate a punch combination sequence.
 * @param {string[]} sequence - Array of punch names (e.g., ['jab', 'cross', 'lead_hook'])
 * @returns {object} Validation result with per-transition verdicts
 */
function validatePunchCombo(sequence) {
  if (!sequence || sequence.length === 0) {
    return { valid: false, error: 'Empty sequence' };
  }

  const results = {
    sequence,
    valid: true,
    transitions: [],
    weightTrace: ['neutral'],
    commitmentGaps: [],
    comboType: 'flowing', // becomes 'loaded' if any heavy commitment
    suggestions: [],
  };

  let currentWeight = 'neutral';

  for (let i = 0; i < sequence.length; i++) {
    const punchName = sequence[i];
    const punch = PUNCHES[punchName];

    if (!punch) {
      results.valid = false;
      results.transitions.push({
        position: i + 1,
        action: punchName,
        verdict: 'INVALID',
        reason: `Unknown punch: "${punchName}". Valid punches: ${Object.keys(PUNCHES).join(', ')}`,
      });
      continue;
    }

    if (i === 0) {
      // First punch is always valid from neutral
      results.transitions.push({
        position: 1,
        action: punchName,
        verdict: 'VALID',
        weightBefore: 'neutral',
        weightAfter: punch.weightExit,
      });
      currentWeight = punch.weightExit;
      results.weightTrace.push(currentWeight);
      if (punch.commitmentGap) {
        results.commitmentGaps.push({ position: 1, punch: punchName });
        results.comboType = 'loaded';
      }
      continue;
    }

    // Check weight-state transition
    const allowed = WEIGHT_TRANSITIONS[currentWeight];
    if (!allowed) {
      results.valid = false;
      results.transitions.push({
        position: i + 1,
        action: punchName,
        verdict: 'ERROR',
        reason: `Unknown weight state: "${currentWeight}"`,
      });
      continue;
    }

    if (allowed[punchName]) {
      results.transitions.push({
        position: i + 1,
        action: punchName,
        verdict: 'VALID',
        weightBefore: currentWeight,
        weightAfter: punch.weightExit,
      });
    } else {
      results.valid = false;
      const reason = allowed._reason || `Weight state "${currentWeight}" does not load "${punchName}"`;

      // Generate suggestion: what CAN follow from this weight state?
      const validFollows = Object.keys(PUNCHES).filter(p => allowed[p]);

      results.transitions.push({
        position: i + 1,
        action: punchName,
        verdict: 'INVALID',
        reason,
        weightBefore: currentWeight,
        suggestion: `From ${currentWeight} weight, valid punches: ${validFollows.join(', ')}`,
      });
    }

    currentWeight = punch.weightExit;
    results.weightTrace.push(currentWeight);

    if (punch.commitmentGap) {
      results.commitmentGaps.push({ position: i + 1, punch: punchName });
      results.comboType = 'loaded';
    }
  }

  // Check for consecutive same-hand punches (except jab doubles)
  for (let i = 1; i < sequence.length; i++) {
    const prev = PUNCHES[sequence[i - 1]];
    const curr = PUNCHES[sequence[i]];
    if (prev && curr && prev.hand === curr.hand && prev.powerLevel === 'heavy' && curr.powerLevel === 'heavy') {
      results.suggestions.push({
        position: i + 1,
        warning: `Two consecutive heavy same-hand punches (${sequence[i-1]} → ${sequence[i]}). Consider alternating hands or inserting a jab.`,
      });
    }
  }

  return results;
}

/**
 * Validate a defensive chain sequence.
 * @param {string[]} sequence - Array of defense names
 * @returns {object} Validation result with axis compatibility per transition
 */
function validateDefenseChain(sequence) {
  if (!sequence || sequence.length === 0) {
    return { valid: false, error: 'Empty sequence' };
  }

  const results = {
    sequence,
    valid: true,
    transitions: [],
    axisTrace: [],
    countersLoaded: [],
    warnings: [],
  };

  for (let i = 0; i < sequence.length; i++) {
    const defName = sequence[i];
    const def = DEFENSES[defName];

    if (!def) {
      results.valid = false;
      results.transitions.push({
        position: i + 1,
        action: defName,
        verdict: 'INVALID',
        reason: `Unknown defense: "${defName}". Valid: ${Object.keys(DEFENSES).join(', ')}`,
      });
      continue;
    }

    results.axisTrace.push(def.axis);
    results.countersLoaded.push({ defense: defName, counters: def.loadsCounter });

    if (i === 0) {
      results.transitions.push({
        position: 1,
        action: defName,
        verdict: 'VALID',
        axis: def.axis,
      });
      continue;
    }

    // Check axis compatibility with previous defense
    const prevDef = DEFENSES[sequence[i - 1]];
    if (prevDef) {
      const compat = AXIS_COMPATIBILITY[prevDef.axis][def.axis];
      results.transitions.push({
        position: i + 1,
        action: defName,
        verdict: compat === 'weak' ? 'WEAK' : 'VALID',
        axis: def.axis,
        prevAxis: prevDef.axis,
        compatibility: compat,
        reason: compat === 'weak'
          ? `Same-axis chain (${prevDef.axis} → ${def.axis}) compounds instability — consider alternating axis`
          : undefined,
      });

      if (compat === 'weak') {
        results.warnings.push({
          position: i + 1,
          warning: `${sequence[i-1]} (${prevDef.axis}) → ${defName} (${def.axis}): same axis compounds instability`,
        });
      }
    }
  }

  return results;
}

/**
 * Validate a footwork sequence.
 * @param {string[]} sequence - Array of footwork atom names
 * @returns {object} Validation result with rhythm compatibility
 */
function validateFootworkChain(sequence) {
  if (!sequence || sequence.length === 0) {
    return { valid: false, error: 'Empty sequence' };
  }

  const results = {
    sequence,
    valid: true,
    transitions: [],
    totalBeats: 0,
    comboType: 'flowing',
    commitmentMoments: [],
  };

  for (let i = 0; i < sequence.length; i++) {
    const atomName = sequence[i];
    const atom = FOOTWORK[atomName];

    if (!atom) {
      results.valid = false;
      results.transitions.push({
        position: i + 1,
        action: atomName,
        verdict: 'INVALID',
        reason: `Unknown footwork atom: "${atomName}". Valid: ${Object.keys(FOOTWORK).join(', ')}`,
      });
      continue;
    }

    results.totalBeats += atom.beats;
    if (atom.rhythm === 'loaded') {
      results.comboType = 'loaded';
      results.commitmentMoments.push({ position: i + 1, atom: atomName });
    }

    if (i === 0) {
      results.transitions.push({ position: 1, action: atomName, verdict: 'VALID', beats: atom.beats });
      continue;
    }

    // Check chaining compatibility
    const prevAtom = FOOTWORK[sequence[i - 1]];
    if (prevAtom && prevAtom.incompatible && prevAtom.incompatible.includes(atomName)) {
      results.valid = false;
      results.transitions.push({
        position: i + 1,
        action: atomName,
        verdict: 'INVALID',
        reason: `${sequence[i-1]} cannot chain directly to ${atomName}. ${prevAtom.rule || ''}`,
        suggestion: `Insert a step between ${sequence[i-1]} and ${atomName}`,
      });
    } else if (atom.incompatible && atom.incompatible.includes(sequence[i - 1])) {
      results.valid = false;
      results.transitions.push({
        position: i + 1,
        action: atomName,
        verdict: 'INVALID',
        reason: `${atomName} cannot follow ${sequence[i-1]}. ${atom.rule || ''}`,
        suggestion: `Insert a step between ${sequence[i-1]} and ${atomName}`,
      });
    } else {
      results.transitions.push({
        position: i + 1,
        action: atomName,
        verdict: 'VALID',
        beats: atom.beats,
      });
    }
  }

  return results;
}

/**
 * Validate a defense-to-counter transition.
 * Checks whether the counter punch is loaded by the preceding defense.
 * @param {string} defense - Defense action name
 * @param {string} counter - Counter punch name
 * @returns {object} Validation result
 */
function validateDefenseToCounter(defense, counter) {
  const def = DEFENSES[defense];
  const punch = PUNCHES[counter];

  if (!def) return { valid: false, error: `Unknown defense: "${defense}"` };
  if (!punch) return { valid: false, error: `Unknown punch: "${counter}"` };

  const loaded = def.loadsCounter.includes(counter);
  const weightCompatible = WEIGHT_TRANSITIONS[def.weightExit]?.[counter];

  return {
    defense,
    counter,
    loaded,
    weightCompatible: !!weightCompatible,
    valid: loaded && weightCompatible,
    weightState: def.weightExit,
    reason: !loaded
      ? `${defense} does not load ${counter}. Loaded counters: ${def.loadsCounter.join(', ')}`
      : !weightCompatible
        ? `Weight state after ${defense} (${def.weightExit}) does not support ${counter}`
        : `${defense} → ${counter}: mechanically loaded and weight-compatible`,
  };
}

/**
 * Full integrated validation: defense → counter → follow-up combination.
 * @param {string} defense - Initial defensive action
 * @param {string[]} counterCombo - Punch sequence starting from the counter
 * @returns {object} Full validation result
 */
function validateIntegratedSequence(defense, counterCombo) {
  const defenseCheck = validateDefenseToCounter(defense, counterCombo[0]);
  const comboCheck = validatePunchCombo(counterCombo);

  // Override the first punch's weight state to start from the defense exit
  const def = DEFENSES[defense];
  if (def && counterCombo.length > 1) {
    const firstPunchFromDefense = WEIGHT_TRANSITIONS[def.weightExit]?.[counterCombo[0]];
    if (!firstPunchFromDefense) {
      comboCheck.valid = false;
      comboCheck.transitions[0] = {
        ...comboCheck.transitions[0],
        verdict: 'INVALID',
        reason: `Defense ${defense} leaves weight at ${def.weightExit} — ${counterCombo[0]} cannot fire from there`,
      };
    }
  }

  return {
    defense: defenseCheck,
    combination: comboCheck,
    integrated: defenseCheck.valid && comboCheck.valid,
    fourOutputs: defenseCheck.valid ? {
      counterLoaded: true,
      frameDisrupted: '(context-dependent — requires live opponent)',
      opponentExposed: '(context-dependent — requires live opponent)',
      positionalIntelligence: `After ${defense}: you know where they are for the duration of their commitment`,
    } : null,
  };
}

// ─── BLOCK-AWARE VALIDATION ─────────────────────────────────────────────────
// Loads block-config.json to enforce per-block constraints.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, 'block-config.json');
const _blockConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

/**
 * Validate a punch combo against a student's current block constraints.
 * Checks: punch availability, combo length, defense availability, footwork availability.
 * @param {string[]} sequence - Punch names
 * @param {number} blockNum - Student's current block (1-10)
 * @returns {object} Block validation + standard weight-state validation
 */
function validateForBlock(sequence, blockNum) {
  const block = _blockConfig.blocks.find(b => b.num === blockNum);
  if (!block) return { valid: false, error: `Unknown block: ${blockNum}` };

  const errors = [];

  // Check combo length
  if (block.maxComboLength > 0 && sequence.length > block.maxComboLength) {
    errors.push(`Combo length ${sequence.length} exceeds Block ${blockNum} max of ${block.maxComboLength}`);
  }
  if (block.maxComboLength === 0 && sequence.length > 0) {
    errors.push(`Block ${blockNum} (${block.name}) has no punches yet`);
  }

  // Check each punch is available at this block
  const available = new Set(block.punches || []);
  for (const punch of sequence) {
    if (!available.has(punch)) {
      errors.push(`"${punch}" not available at Block ${blockNum} (${block.name})`);
    }
  }

  // Run standard weight-state validation
  const weightCheck = validatePunchCombo(sequence);

  return {
    valid: errors.length === 0 && weightCheck.valid,
    blockErrors: errors,
    block: { num: block.num, name: block.name, maxComboLength: block.maxComboLength },
    weightValidation: weightCheck,
  };
}

/**
 * Check if a defense is available at a given block.
 */
function validateDefenseForBlock(defenseNames, blockNum) {
  const block = _blockConfig.blocks.find(b => b.num === blockNum);
  if (!block) return { valid: false, error: `Unknown block: ${blockNum}` };

  const available = new Set(block.defenses || []);
  const errors = [];
  for (const d of defenseNames) {
    if (!available.has(d)) errors.push(`"${d}" not available at Block ${blockNum} (${block.name})`);
  }
  return { valid: errors.length === 0, errors, available: [...available] };
}

/**
 * Check if a footwork atom is available at a given block.
 */
function validateFootworkForBlock(footworkNames, blockNum) {
  const block = _blockConfig.blocks.find(b => b.num === blockNum);
  if (!block) return { valid: false, error: `Unknown block: ${blockNum}` };

  const available = new Set(block.footwork || []);
  const errors = [];
  for (const f of footworkNames) {
    if (!available.has(f)) errors.push(`"${f}" not available at Block ${blockNum} (${block.name})`);
  }
  return { valid: errors.length === 0, errors, available: [...available] };
}

// ─── EXPORTS ────────────────────────────────────────────────────────────────

export {
  PUNCHES,
  DEFENSES,
  FOOTWORK,
  WEIGHT_TRANSITIONS,
  AXIS_COMPATIBILITY,
  validatePunchCombo,
  validateDefenseChain,
  validateFootworkChain,
  validateDefenseToCounter,
  validateIntegratedSequence,
  validateForBlock,
  validateDefenseForBlock,
  validateFootworkForBlock,
};

// ─── CLI TEST HARNESS ───────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('combination-validator.js')) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  BASIC REFLEX — COMBINATION VALIDATOR ENGINE');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Test 1: Classic 1-2-3 (Jab-Cross-Lead Hook) — should be VALID
  console.log('TEST 1: Jab → Cross → Lead Hook (classic 1-2-3)');
  const t1 = validatePunchCombo(['jab', 'cross', 'lead_hook']);
  console.log(`  Result: ${t1.valid ? '✓ VALID' : '✗ INVALID'}`);
  console.log(`  Weight trace: ${t1.weightTrace.join(' → ')}`);
  console.log(`  Type: ${t1.comboType}\n`);

  // Test 2: Cross-Cross — should FAIL (weight forward, can't re-fire cross)
  console.log('TEST 2: Cross → Cross (double rear hand from forward weight)');
  const t2 = validatePunchCombo(['cross', 'cross']);
  console.log(`  Result: ${t2.valid ? '✓ VALID' : '✗ INVALID'}`);
  if (!t2.valid) {
    const fail = t2.transitions.find(t => t.verdict === 'INVALID');
    console.log(`  Reason: ${fail?.reason}`);
    console.log(`  Suggestion: ${fail?.suggestion}`);
  }
  console.log();

  // Test 3: Jab-Jab-Cross-Lead Hook-Cross — should FAIL at final cross
  console.log('TEST 3: Jab → Jab → Cross → Lead Hook → Cross');
  const t3 = validatePunchCombo(['jab', 'jab', 'cross', 'lead_hook', 'cross']);
  console.log(`  Result: ${t3.valid ? '✓ VALID' : '✗ INVALID'}`);
  t3.transitions.forEach(t => {
    const icon = t.verdict === 'VALID' ? '✓' : '✗';
    console.log(`  ${icon} [${t.position}] ${t.action}: ${t.verdict}${t.reason ? ' — ' + t.reason : ''}`);
  });
  console.log();

  // Test 4: Defense chain — slip right → pull back (same sagittal? no, slip is lateral, pull is sagittal — should be STRONG)
  console.log('TEST 4: Defense chain — Slip Right → Duck → Pull Back');
  const t4 = validateDefenseChain(['slip_right', 'duck', 'pull_back']);
  t4.transitions.forEach(t => {
    console.log(`  [${t.position}] ${t.action} (${t.axis}): ${t.verdict}${t.compatibility ? ' [' + t.compatibility + ']' : ''}`);
  });
  if (t4.warnings.length) t4.warnings.forEach(w => console.log(`  ⚠ ${w.warning}`));
  console.log();

  // Test 5: Bad defense chain — duck → pull back (both sagittal)
  console.log('TEST 5: Defense chain — Duck → Pull Back (same axis)');
  const t5 = validateDefenseChain(['duck', 'pull_back']);
  t5.transitions.forEach(t => {
    console.log(`  [${t.position}] ${t.action} (${t.axis}): ${t.verdict}${t.reason ? ' — ' + t.reason : ''}`);
  });
  console.log();

  // Test 6: Footwork — step → snap → pop (snap can't chain to pop)
  console.log('TEST 6: Footwork — Step → Snap → Pop');
  const t6 = validateFootworkChain(['step', 'snap', 'pop']);
  t6.transitions.forEach(t => {
    const icon = t.verdict === 'VALID' ? '✓' : '✗';
    console.log(`  ${icon} [${t.position}] ${t.action}: ${t.verdict}${t.reason ? ' — ' + t.reason : ''}`);
  });
  console.log();

  // Test 7: Integrated — slip right → cross → lead hook → cross
  console.log('TEST 7: Integrated — Slip Right → Cross → Lead Hook → Cross');
  const t7 = validateIntegratedSequence('slip_right', ['cross', 'lead_hook', 'cross']);
  console.log(`  Defense → Counter: ${t7.defense.valid ? '✓' : '✗'} ${t7.defense.reason}`);
  console.log(`  Combination: ${t7.combination.valid ? '✓ VALID' : '✗ INVALID'}`);
  console.log(`  Integrated: ${t7.integrated ? '✓ FULL CHAIN VALID' : '✗ CHAIN BROKEN'}`);
  if (t7.fourOutputs) console.log(`  Four outputs: Counter loaded ✓ | Intel: ${t7.fourOutputs.positionalIntelligence}`);
  console.log();

  // Test 8: Bad integrated — parry → lead_uppercut (parry doesn't load uppercuts)
  console.log('TEST 8: Integrated — Parry → Lead Uppercut (not loaded by parry)');
  const t8 = validateIntegratedSequence('parry', ['lead_uppercut']);
  console.log(`  Defense → Counter: ${t8.defense.valid ? '✓' : '✗'} ${t8.defense.reason}`);
  console.log(`  Integrated: ${t8.integrated ? '✓' : '✗ CHAIN BROKEN'}`);

  console.log('\n═══════════════════════════════════════════════════════════');
}
