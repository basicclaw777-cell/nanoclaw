/**
 * Basic Reflex — Drumming-Brain Rhythm Engine
 *
 * Maps drum rudiments onto boxing combinations using musical subdivision grids.
 * Generates rhythmic click tracks with punch callouts.
 * Validates each generated combination against the weight-state relay.
 *
 * Original concept by Paul Logan (Basic Reflex), April 2026.
 * (c) Basic Reflex / Paul Logan 2026
 */

import { validatePunchCombo, WEIGHT_TRANSITIONS, PUNCHES } from './combination-validator.js';

// ─── SUBDIVISION DEFINITIONS ────────────────────────────────────────────────

const SUBDIVISIONS = {
  quarter:           { name: 'Quarter Notes',           beatsPerPulse: 1,    feel: 'march',   description: 'Heavy single shots — march time' },
  eighth:            { name: 'Eighth Notes',            beatsPerPulse: 0.5,  feel: 'double',  description: 'Double-time jabs, basic 1-2' },
  eighth_triplet:    { name: 'Eighth-Note Triplets',    beatsPerPulse: 0.33, feel: 'cuban',   description: 'Slip-roll flow — Cuban rhythm feel' },
  sixteenth:         { name: 'Sixteenth Notes',         beatsPerPulse: 0.25, feel: 'standard', description: 'Standard combination grid' },
  sixteenth_triplet: { name: 'Sixteenth-Note Triplets', beatsPerPulse: 0.17, feel: 'flurry',  description: 'Flurry — burst combinations' },
};

// ─── HAND MAPPING ───────────────────────────────────────────────────────────
// R = rear hand, L = lead hand (orthodox convention)
// In drumming: R = right stick, L = left stick
// Mapping: drummer's dominant hand → boxer's rear hand (power)

const HAND_MAP = {
  R: 'rear',   // Rear hand (cross, rear hook, rear uppercut)
  L: 'lead',   // Lead hand (jab, lead hook, lead uppercut)
};

// ─── RUDIMENT DEFINITIONS ───────────────────────────────────────────────────

// ─── PAUL'S ORIGINAL RUDIMENT→COMBINATION MAPPINGS ───────────────────────────
// These are Paul Logan's specific creative mappings (IP dated 2026-04-28).
// Each maps a drum rudiment to a specific punch sequence validated against
// the weight-state relay. The sticking pattern provides the RHYTHM;
// the punch assignment is Paul's coaching decision.

const RUDIMENTS = {
  paradiddle: {
    name: 'Paradiddle',
    sticking: ['R','L','R','R', 'L','R','L','L'],
    accents:  [1, 0, 0, 0,    1, 0, 0, 0],
    subdivision: 'sixteenth',
    // Paul's mapping: Jab-Cross-Jab-Jab / Cross-Jab-Cross-Cross (two phrases)
    fixedCombo: ['jab', 'cross', 'jab', 'jab', 'cross', 'jab', 'cross', 'jab'],
    description: 'The foundational mapping. Jab-Cross-Jab-Jab — jab dominance with cross punctuation.',
  },
  inverted_paradiddle: {
    name: 'Inverted Paradiddle',
    sticking: ['L','R','L','L', 'R','L','R','R'],
    accents:  [1, 0, 0, 0,    1, 0, 0, 0],
    subdivision: 'sixteenth',
    fixedCombo: ['cross', 'jab', 'cross', 'jab', 'jab', 'cross', 'jab', 'cross'],
    description: 'Paradiddle reversed — cross leads, jab punctuates.',
  },
  single_stroke_roll: {
    name: 'Single Stroke Roll',
    sticking: ['R','L','R','L', 'R','L','R','L'],
    accents:  [1, 0, 1, 0,    1, 0, 1, 0],
    subdivision: 'sixteenth',
    fixedCombo: ['jab', 'cross', 'jab', 'cross', 'jab', 'cross', 'jab', 'cross'],
    description: 'Alternating Jab-Cross in sixteenths — the machine gun.',
  },
  double_stroke_roll: {
    name: 'Double Stroke Roll',
    sticking: ['R','R','L','L', 'R','R','L','L'],
    accents:  [1, 0, 1, 0,    1, 0, 1, 0],
    subdivision: 'sixteenth',
    fixedCombo: ['jab', 'jab', 'cross', 'lead_hook', 'jab', 'jab', 'cross', 'lead_hook'],
    description: 'Jab-Jab-Cross-Hook repeated — doubled setup into power.',
  },
  flam: {
    name: 'Flam',
    sticking: ['l','R'],
    accents:  [0, 1],
    subdivision: 'eighth',
    fixedCombo: ['FEINT', 'cross'],
    description: 'Feint jab (ghost note) into power cross.',
  },
  drag: {
    name: 'Drag',
    sticking: ['L','L','R'],
    accents:  [0, 0, 1],
    subdivision: 'eighth_triplet',
    fixedCombo: ['jab', 'jab', 'cross'],
    description: 'Double jab into cross — the classic 1-1-2.',
  },
  flam_tap: {
    name: 'Flam Tap',
    sticking: ['l','R','R', 'r','L','L'],
    accents:  [0, 1, 0,    0, 1, 0],
    subdivision: 'sixteenth',
    fixedCombo: ['FEINT', 'lead_hook', 'jab', 'FEINT', 'cross', 'jab'],
    description: 'Feint-hook-jab / feint-cross-jab — alternating lead setups.',
  },
  swiss_army_triplet: {
    name: 'Swiss Army Triplet',
    sticking: ['l','R','L'],
    accents:  [0, 1, 0],
    subdivision: 'eighth_triplet',
    fixedCombo: ['FEINT', 'cross', 'lead_hook'],
    description: 'Slip-cross-hook on triplet grid.',
  },
  five_stroke_roll: {
    name: 'Five Stroke Roll',
    sticking: ['R','R','L','L','R'],
    accents:  [0, 0, 0, 0, 1],
    subdivision: 'sixteenth',
    fixedCombo: ['jab', 'jab', 'cross', 'lead_hook', 'cross'],
    description: 'Build through jab-jab-cross-hook to accented power cross on 5.',
  },
  half_time_shuffle: {
    name: 'Half-Time Shuffle',
    sticking: ['R','L','R'],
    accents:  [1, 0, 1],
    subdivision: 'eighth_triplet',
    fixedCombo: ['jab', 'cross', 'lead_hook'],
    description: 'The classic 1-2-3 on a triplet groove — Bonham feel.',
  },
};

// ─── PUNCH ASSIGNMENT RULES ─────────────────────────────────────────────────
//
// How sticking patterns map to punches:
// - Accented R → power rear hand (cross, rear hook, overhand)
// - Accented L → power lead hand (lead hook, lead uppercut)
// - Unaccented R → light rear hand (jab_body, rear_body)
// - Unaccented L → light lead hand (jab)
// - Ghost note (lowercase) → feint (no punch, rhythmic placeholder)
// - Specific mappings can be overridden per context

const PUNCH_POOLS = {
  accented_rear:   ['cross', 'rear_hook', 'overhand', 'rear_uppercut'],
  accented_lead:   ['lead_hook', 'lead_uppercut', 'lead_body'],
  unaccented_rear: ['rear_body', 'cross'],
  unaccented_lead: ['jab', 'jab_body'],
  ghost:           ['FEINT'],
};

// ─── COMBINATION GENERATOR ──────────────────────────────────────────────────

/**
 * Generate a boxing combination from a drum rudiment.
 * @param {string} rudimentName — key from RUDIMENTS
 * @param {object} options — { level, mapping }
 *   level: 'beginner'|'intermediate'|'advanced'
 *   mapping: 'standard' (R=rear) or 'paul' (R=lead, as in Paul's original paradiddle)
 * @returns {object} Generated combination with validation
 */
function generateFromRudiment(rudimentName, options = {}) {
  const rudiment = RUDIMENTS[rudimentName];
  if (!rudiment) {
    return { error: `Unknown rudiment: "${rudimentName}". Valid: ${Object.keys(RUDIMENTS).join(', ')}` };
  }

  const level = options.level || 'intermediate';

  // If the rudiment has Paul's fixed combo mapping, use it directly
  if (rudiment.fixedCombo) {
    const combo = [...rudiment.fixedCombo];
    const punchesOnly = combo.filter(p => p !== 'FEINT');
    const validation = punchesOnly.length > 0 ? validatePunchCombo(punchesOnly) : { valid: true };

    const rhythmPattern = combo.map((p, i) => ({
      beat: i + 1,
      type: rudiment.accents[i] ? 'accent' : (rudiment.sticking[i] === rudiment.sticking[i].toLowerCase() ? 'ghost' : 'tap'),
      punch: p,
    }));

    return {
      rudiment: rudiment.name,
      subdivision: SUBDIVISIONS[rudiment.subdivision],
      sticking: rudiment.sticking.join('-'),
      combination: combo,
      combinationDisplay: combo.map((p, i) => {
        if (p === 'FEINT') return '(feint)';
        return rudiment.accents[i] ? `**${p.toUpperCase()}**` : p;
      }),
      rhythmPattern,
      validation,
      bpmSuggestion: level === 'beginner' ? 60 : level === 'intermediate' ? 80 : 100,
      description: rudiment.description,
    };
  }

  // Fallback: auto-generate (for custom rudiments without fixed mappings)
  const mapping = options.mapping || 'paul';
  const handMap = mapping === 'paul'
    ? { R: 'lead', L: 'rear' }
    : { R: 'rear', L: 'lead' };

  const combo = [];
  const rhythmPattern = [];

  for (let i = 0; i < rudiment.sticking.length; i++) {
    const stick = rudiment.sticking[i];
    const accent = rudiment.accents[i];
    const isGhost = stick === stick.toLowerCase() && stick !== stick.toUpperCase();
    const hand = stick.toUpperCase();

    if (isGhost) {
      combo.push('FEINT');
      rhythmPattern.push({ beat: i + 1, type: 'ghost', hand: handMap[hand] });
      continue;
    }

    const resolvedHand = handMap[hand]; // 'lead' or 'rear'
    let pool;
    if (accent && resolvedHand === 'rear') pool = PUNCH_POOLS.accented_rear;
    else if (accent && resolvedHand === 'lead') pool = PUNCH_POOLS.accented_lead;
    else if (!accent && resolvedHand === 'rear') pool = PUNCH_POOLS.unaccented_rear;
    else pool = PUNCH_POOLS.unaccented_lead;

    // Level filtering
    if (level === 'beginner') {
      // Beginners: jab and cross only (straight punches — Cuban 11-12 rule)
      pool = pool.filter(p => ['jab', 'cross', 'jab_body', 'rear_body', 'FEINT'].includes(p));
      if (pool.length === 0) pool = ['jab'];
    }

    // Weight-state-aware selection with look-ahead
    const prevPunches = combo.filter(p => p !== 'FEINT');
    let currentWeight = 'neutral';
    if (prevPunches.length > 0) {
      const lastPunch = PUNCHES[prevPunches[prevPunches.length - 1]];
      if (lastPunch) currentWeight = lastPunch.weightExit;
    }

    const transitions = WEIGHT_TRANSITIONS[currentWeight] || WEIGHT_TRANSITIONS.neutral;

    // Look ahead: what hand does the NEXT note need?
    let nextHand = null;
    if (i + 1 < rudiment.sticking.length) {
      const nextStick = rudiment.sticking[i + 1];
      const nextIsGhost = nextStick === nextStick.toLowerCase() && nextStick !== nextStick.toUpperCase();
      if (!nextIsGhost) nextHand = handMap[nextStick.toUpperCase()];
    }

    // Pick a punch that (a) is valid from current weight AND (b) leaves weight
    // in a state where the next hand can fire
    let punch = null;
    for (const candidate of pool) {
      if (!transitions[candidate]) continue;
      if (!nextHand) { punch = candidate; break; }
      // Check: does this candidate's weight exit allow any punch from nextHand?
      const candidateExit = PUNCHES[candidate]?.weightExit || 'neutral';
      const nextTransitions = WEIGHT_TRANSITIONS[candidateExit] || {};
      const nextPool = nextHand === 'rear'
        ? ['cross', 'rear_hook', 'overhand', 'rear_uppercut', 'rear_body']
        : ['jab', 'lead_hook', 'lead_uppercut', 'lead_body', 'jab_body'];
      if (nextPool.some(p => nextTransitions[p])) { punch = candidate; break; }
    }
    // Fallback: if look-ahead fails, just pick first valid from current weight
    if (!punch) punch = pool.find(p => transitions[p]) || pool[0];

    combo.push(punch);
    rhythmPattern.push({ beat: i + 1, type: accent ? 'accent' : 'tap', hand: HAND_MAP[hand], punch });
  }

  // Filter out feints for validation (feints don't affect weight state)
  const punchesOnly = combo.filter(p => p !== 'FEINT');
  const validation = punchesOnly.length > 0 ? validatePunchCombo(punchesOnly) : { valid: true, note: 'All feints' };

  return {
    rudiment: rudiment.name,
    subdivision: SUBDIVISIONS[rudiment.subdivision],
    sticking: rudiment.sticking.join('-'),
    combination: combo,
    combinationDisplay: combo.map((p, i) => {
      const stick = rudiment.sticking[i];
      const accent = rudiment.accents[i];
      const isGhost = stick === stick.toLowerCase() && stick !== stick.toUpperCase();
      if (isGhost) return `(${p})`;
      return accent ? `**${p.toUpperCase()}**` : p;
    }),
    rhythmPattern,
    validation,
    bpmSuggestion: level === 'beginner' ? 60 : level === 'intermediate' ? 80 : 100,
    description: rudiment.description,
  };
}

/**
 * Generate a click track timing array for a rudiment at a given BPM.
 * @param {string} rudimentName
 * @param {number} bpm — beats per minute (quarter note = 1 beat)
 * @param {number} repeats — how many times to repeat the pattern
 * @returns {object[]} Array of { timeMs, punch, accent, hand }
 */
function generateClickTrack(rudimentName, bpm = 80, repeats = 4) {
  const rudiment = RUDIMENTS[rudimentName];
  if (!rudiment) return { error: `Unknown rudiment: "${rudimentName}"` };

  const sub = SUBDIVISIONS[rudiment.subdivision];
  const msPerBeat = 60000 / bpm;
  const msPerPulse = msPerBeat * sub.beatsPerPulse;

  const combo = generateFromRudiment(rudimentName);
  const track = [];

  for (let rep = 0; rep < repeats; rep++) {
    const offset = rep * rudiment.sticking.length * msPerPulse;
    for (let i = 0; i < combo.combination.length; i++) {
      track.push({
        timeMs: Math.round(offset + (i * msPerPulse)),
        punch: combo.combination[i],
        accent: rudiment.accents[i] === 1,
        hand: rudiment.sticking[i].toUpperCase() === 'R' ? 'lead' : 'rear', // Paul mapping: R=lead
        isGhost: rudiment.sticking[i] === rudiment.sticking[i].toLowerCase() &&
                 rudiment.sticking[i] !== rudiment.sticking[i].toUpperCase(),
      });
    }
  }

  return {
    rudiment: rudiment.name,
    bpm,
    subdivision: sub.name,
    totalDurationMs: Math.round(repeats * rudiment.sticking.length * msPerPulse),
    repeats,
    track,
  };
}

/**
 * List all available rudiments with their combinations.
 */
function listRudiments(level = 'intermediate') {
  const results = [];
  for (const [key, rud] of Object.entries(RUDIMENTS)) {
    const combo = generateFromRudiment(key, { level });
    results.push({
      key,
      name: rud.name,
      sticking: rud.sticking.join('-'),
      subdivision: SUBDIVISIONS[rud.subdivision].name,
      combination: combo.combination.join(' → '),
      valid: combo.validation.valid,
      description: rud.description,
    });
  }
  return results;
}

// ─── EXPORTS ────────────────────────────────────────────────────────────────

export {
  SUBDIVISIONS,
  RUDIMENTS,
  PUNCH_POOLS,
  generateFromRudiment,
  generateClickTrack,
  listRudiments,
};

// ─── CLI TEST HARNESS ───────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('rhythm-engine.js')) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  BASIC REFLEX — DRUMMING-BRAIN RHYTHM ENGINE');
  console.log('═══════════════════════════════════════════════════════════\n');

  // List all rudiments
  console.log('ALL RUDIMENTS (intermediate level):\n');
  const all = listRudiments('intermediate');
  for (const r of all) {
    const icon = r.valid ? '✓' : '✗';
    console.log(`  ${icon} ${r.name} (${r.subdivision})`);
    console.log(`    Sticking: ${r.sticking}`);
    console.log(`    Combo:    ${r.combination}`);
    console.log(`    ${r.description}\n`);
  }

  // Detailed paradiddle
  console.log('─── DETAILED: Paradiddle ───\n');
  const para = generateFromRudiment('paradiddle', { level: 'intermediate' });
  console.log(`  Sticking:    ${para.sticking}`);
  console.log(`  Combination: ${para.combination.join(' → ')}`);
  console.log(`  Display:     ${para.combinationDisplay.join(' → ')}`);
  console.log(`  Valid:        ${para.validation.valid ? '✓' : '✗'}`);
  console.log(`  Weight trace: ${para.validation.weightTrace?.join(' → ')}`);
  console.log(`  Suggested BPM: ${para.bpmSuggestion}\n`);

  // Click track
  console.log('─── CLICK TRACK: Paradiddle @ 80 BPM × 2 reps ───\n');
  const track = generateClickTrack('paradiddle', 80, 2);
  console.log(`  Duration: ${track.totalDurationMs}ms (${(track.totalDurationMs / 1000).toFixed(1)}s)`);
  console.log(`  Events:\n`);
  for (const t of track.track) {
    const marker = t.accent ? '>' : t.isGhost ? '.' : '-';
    const feint = t.punch === 'FEINT' ? ' (feint)' : '';
    console.log(`    ${String(t.timeMs).padStart(5)}ms  ${marker} ${t.hand.padEnd(4)} ${t.punch}${feint}`);
  }

  // Beginner mode
  console.log('\n─── BEGINNER MODE: Paradiddle (straight punches only) ───\n');
  const beginnerPara = generateFromRudiment('paradiddle', { level: 'beginner' });
  console.log(`  Combo: ${beginnerPara.combination.join(' → ')}`);
  console.log(`  Valid: ${beginnerPara.validation.valid ? '✓' : '✗'}`);
  console.log(`  (Cuban rule: ages 11-12 learn straight punches only)\n`);

  console.log('═══════════════════════════════════════════════════════════');
}
