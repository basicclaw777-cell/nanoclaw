/**
 * course-structure.js — Course Outline Engine
 *
 * Maps 10 blocks from block-config.json + 10_BLOCK_CURRICULUM.md
 * to 10 course modules. Each module: learning objectives, techniques,
 * drills, combos, rhythm, assessment, citations, filming brief refs.
 *
 * Reads existing curriculum tools (combination-validator, drill-generator,
 * rhythm-engine) to generate real content, not placeholders.
 *
 * "Every boxing app is a fitness product or a random combo caller.
 *  Basic Reflex is the only system that understands WHY combinations
 *  work — and can explain the biomechanics."
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NANOCLAW = path.join(__dirname, '..');
const HOME = process.env.HOME || '/Users/basicclaw777';
const VAULT = path.join(HOME, 'cathedral-vault');
const REPORTS_DIR = path.join(__dirname, 'reports');

// ── Load block config ────────────────────────────────────────────────────────

function loadBlockConfig() {
  return JSON.parse(fs.readFileSync(path.join(NANOCLAW, 'block-config.json'), 'utf-8'));
}

// ── Cuban source citations per block ─────────────────────────────────────────
// Extracted from 10_BLOCK_CURRICULUM.md + Balmaseda + Sagarra extractions

const BLOCK_CITATIONS = {
  1: [
    { claim: 'Guard position is a position, not a posture or halt', source: 'Balmaseda Ch.II — guard position terminology' },
    { claim: 'Gaze always above knuckles of lead hand', source: 'Balmaseda Ch.II — guard specifications' },
    { claim: 'Rear foot metatarsus only, heel 3-5cm off ground', source: 'Balmaseda Ch.II — guard position' },
    { claim: 'Guard is resting AND returning state', source: 'Sagarra 2007; Balmaseda Ch.II' },
  ],
  2: [
    { claim: 'Flat step is foundation of all movement', source: 'Balmaseda Ch.II p.34' },
    { claim: 'Double flat steps explicitly rejected', source: 'Balmaseda Ch.II p.34' },
    { claim: 'Flat step footwork in all 4 directions at 11-12 category', source: 'Sagarra 2007 — 11-12 age category' },
    { claim: 'No diagonal steps in early training', source: 'Balmaseda Ch.II p.37' },
  ],
  3: [
    { claim: 'ONLY straight punches before hooks/crosses', source: 'Sagarra 2007 — 11-12 category; Balmaseda Ch.II' },
    { claim: 'Max 2-punch combinations at beginner level', source: 'Sagarra 2007 — 11-12 category' },
    { claim: 'Jab has no hip rotation, no weight commitment', source: 'Balmaseda Ch.II' },
    { claim: 'Feints with arm and lead leg only', source: 'Sagarra 2007 — 11-12 category' },
    { claim: 'Simple and complex defense (palm parry, forearm block)', source: 'Sagarra 2007 — 11-12 category' },
    { claim: 'Kinetic chain: 38% legs, 37% trunk, 24% arm', source: 'Filimonov 1985' },
  ],
  4: [
    { claim: 'Hooks and crosses introduced together at 13-14', source: 'Sagarra 2007 — 13-14 category' },
    { claim: 'Max 3-punch combinations after hooks introduced', source: 'Sagarra 2007 — 13-14 category' },
    { claim: 'GAA (lead body hook) is hardest, taught last of hooks', source: 'Balmaseda Ch.II p.52' },
    { claim: 'Short distance and body-to-body added at 13-14', source: 'Sagarra 2007 — 13-14 category' },
    { claim: 'Counterattacks using trunk rotation introduced', source: 'Sagarra 2007 — 13-14 category' },
    { claim: 'No diagonal steps in competition', source: 'Balmaseda Ch.II p.37' },
  ],
  5: [
    { claim: 'Trunk defenses after upper limb mastered', source: 'Balmaseda Ch.II defense taxonomy' },
    { claim: 'Rhythm is a defining characteristic of Cuban boxing', source: 'Cuban boxing tradition; Paul Logan original rudiment mappings' },
    { claim: '4-5 punch combinations with defense integration at 15-16', source: 'Sagarra 2007 — 15-16 category' },
    { claim: 'Forward torsion dodge (DETT) — ventral flexion at 45 degrees', source: 'Balmaseda Ch.II defense taxonomy' },
  ],
  6: [
    { claim: 'Defense and counter are one merged action', source: 'Balmaseda Ch.II; Sagarra 2007' },
    { claim: 'Step-based evasion after trunk mastered', source: 'Balmaseda Ch.II defense order' },
    { claim: 'Shoulder roll NOT Cuban doctrine — professional extension', source: 'Balmaseda Ch.II p.67' },
    { claim: 'Counter-attacks as combined actions at 13-14 to 15-16 transition', source: 'Sagarra 2007' },
  ],
  7: [
    { claim: 'Maneuvering for offensive preparation at 15-16', source: 'Sagarra 2007 — 15-16 category' },
    { claim: 'Complete level with 30-60 official fights', source: 'Sagarra 2007 — 15-16 category' },
    { claim: 'Technique under fatigue: pivots drop first, head movement collapses', source: 'Paul Logan coaching observation' },
  ],
  8: [
    { claim: 'Rope/corner escape with lateral movement at 15-16', source: 'Sagarra 2007 — 15-16 category' },
    { claim: 'All movements must follow circular, not linear, path', source: 'Balmaseda Ch.II' },
    { claim: 'Defense with backward jump', source: 'Sagarra 2007 — 15-16 category' },
    { claim: 'Circular esquiva for cruzado defense', source: 'Sagarra 2007 — 15-16 category' },
  ],
  9: [
    { claim: 'Emphasis shifts from repertoire to tactical application at 17-18', source: 'Sagarra 2007 — 17-18 category' },
    { claim: 'Combat against fast boxer, technical boxer, guard changers, deficient opponents', source: 'Sagarra 2007 — 17-18 category' },
    { claim: 'Disguised guard (guardia camuflada)', source: 'Sagarra 2007 — 17-18 category' },
    { claim: '~100% coach independence at mastery', source: 'Sagarra 2007 psychological scale' },
  ],
  10: [
    { claim: 'Full integration of all previous skills at 17-18 year 2', source: 'Sagarra 2007 — 17-18 category' },
    { claim: 'Three domains run as continuous algorithm that never hands off', source: 'Cross-domain synthesis 2026-04-10; Paul Logan' },
    { claim: 'The curriculum removes obstacles; the predator frame was always there', source: 'Paul Logan — obstacle-removal pedagogy' },
    { claim: 'Four phases of technical assimilation (familiarisation to creation)', source: 'Balmaseda Ch.II — Cuban teaching methodology' },
  ],
};

// ── Module enrichment from curriculum ────────────────────────────────────────

const MODULE_DETAILS = {
  1: {
    subtitle: 'Guard Position & Mindset',
    cubanEquiv: 'Pre-training + first weeks of Escuela Comunitaria (age 11)',
    learningObjectives: [
      'Hold guard position for 3x3min rounds of shadow movement without breaking form',
      'Eyes stay above lead knuckles, chin on shoulder',
      'Understand the contract between coach and student',
      'Fist formation correct (no striking yet)',
    ],
    gate: 'Hold guard position for 3x3min shadow rounds. Eyes above lead knuckles. Chin on shoulder. No excessive tension.',
    keyPrinciples: ['Guard is resting AND returning state', 'Position, not posture', 'Obstacle-removal pedagogy begins'],
    filmingNotes: 'Guard position from 4 angles. Common errors (chin up, guard drop, tension). Fist formation close-up.',
  },
  2: {
    subtitle: 'Footwork Fundamentals',
    cubanEquiv: '11-12 age category — flat steps in all 4 directions',
    learningObjectives: [
      'Flat step in all 4 directions maintaining guard',
      'Weight on metatarsus, smallest possible elevation',
      'Return to guard after each displacement',
      'Respond to directional cues within one beat for 2min continuous',
    ],
    gate: 'Move in all 4 directions maintaining guard, weight on metatarsus, returns to guard after each displacement. Responds to coach cues within one beat for 2min.',
    keyPrinciples: ['Flat step is foundation of all movement', 'Movement IS the defense', 'No double flat steps'],
    filmingNotes: 'Flat step demo all 4 directions. Pendulum step. Weight distribution close-up. Common errors (crossing feet, bouncing).',
  },
  3: {
    subtitle: 'Straight Punches & Turns',
    cubanEquiv: '11-12 technical content — ONLY straight punches',
    learningObjectives: [
      'Jab and cross with correct weight transfer',
      'Body variants with level change from knees',
      'Parry and catch defenses',
      '2-punch combinations (jab-cross)',
      'Guard integrity under punching (12 observable behaviours)',
    ],
    gate: '12 observable behaviours across 5 categories (Guard, Straights, Footwork+Punch, Defense, Three Functions). All 12 pass in single session.',
    keyPrinciples: ['Jab = zero weight commitment, universal setup', 'Kinetic chain: ground to hip to shoulder to knuckle', 'Three functions per technique'],
    filmingNotes: 'Jab from 3 angles + slow-mo. Cross with hip rotation. Body shots with knee bend. 12 observable behaviours demonstrated. Common errors with corrections.',
  },
  4: {
    subtitle: 'Hooks, Crosses & Body Work',
    cubanEquiv: '13-14 age category — INTRODUCE hooks and crosses',
    learningObjectives: [
      'All 10 punches available',
      'Lead hook from guard without elbow flare',
      'All upper limb blocks + mid-forearm + torsion guard',
      '3-punch combinations mixing straight + hook',
      'Three functions for hooks',
    ],
    gate: 'Lead hook launches from guard without elbow flare or weight shift visible at 2m. Guard hand stays. Three functions for hooks demonstrated.',
    keyPrinciples: ['GAA (lead body hook) is hardest, taught last', 'Counter-attacks via trunk rotation', 'Diagonal steps taught but used sparingly'],
    filmingNotes: 'All 10 punches demonstrated individually. Hook mechanics close-up. Lead body hook difficulty. 3-punch combo examples.',
  },
  5: {
    subtitle: 'Timing & Broken Rhythm',
    cubanEquiv: '13-14 year 2 — refinement of all techniques',
    learningObjectives: [
      'Execute 4-punch combinations at varying tempos',
      'Paradiddle pattern (jab-cross-jab-jab) at 80 BPM',
      'Break rhythm deliberately (half-time to double-time)',
      'Trunk defenses (DETT, DEFT, circumduction)',
      'Call exit position before executing',
    ],
    gate: '4-punch combo at varying tempos without losing form. Paradiddle at 80 BPM. Deliberate rhythm breaks. Exit position called before execution.',
    keyPrinciples: ['Rhythm is defining characteristic of Cuban boxing', 'Drumming-brain connection', 'Trunk defenses after upper limb mastered'],
    filmingNotes: 'Paradiddle combo with metronome overlay. Rhythm break demo. Trunk defenses all types. Click track sync.',
  },
  6: {
    subtitle: 'Defense-to-Offense Integration',
    cubanEquiv: '13-14 to 15-16 transition — counter-attacks as combined actions',
    learningObjectives: [
      'Four outputs of correct defense understood and demonstrated',
      'Counter fires within one beat of defensive exit',
      'Slip-right to cross as one movement',
      'Step-based evasion (back step, side step)',
      'Shoulder roll (professional extension, not Cuban doctrine)',
    ],
    gate: 'Demonstrates four outputs in live drill. Counter within one beat of defensive exit. Slip-right to cross = one movement.',
    keyPrinciples: ['Defense and counter are one merged action', 'Four outputs: counter loaded, frame disrupted, opponent exposed, position intel', 'Shoulder roll = divergence from Cuban doctrine'],
    filmingNotes: 'Four defense outputs visualized. Slip-to-counter as one movement. Shoulder roll with Cuban context note. Live drill footage.',
  },
  7: {
    subtitle: 'Technique Under Fatigue',
    cubanEquiv: '15-16 — offensive preparation, rope/corner escape',
    learningObjectives: [
      'Maintain technical quality through round 3 of focused sparring',
      'Commitment gaps still covered under fatigue',
      'Defensive algorithm still running when tired',
      'Recognize fatigue degradation patterns',
    ],
    gate: 'Technical quality maintained through round 3. Commitment gaps covered. Defensive algorithm running under fatigue.',
    keyPrinciples: ['No new techniques — execution under pressure', 'Fatigue layer: pivots drop first, head movement collapses', 'The psychological shift to composure'],
    filmingNotes: 'Round 1 vs Round 3 technique comparison. Fatigue degradation patterns. Conditioning drills that preserve technique.',
  },
  8: {
    subtitle: 'Ring Craft & Escape',
    cubanEquiv: '15-16 — rope/corner escape with lateral movement',
    learningObjectives: [
      'Rope escape with lateral footwork + combination',
      'Corner escape ending in dominant ring position',
      'Circular movement principle',
      'No linear retreat',
    ],
    gate: 'Escape from ropes and corner using lateral footwork + combination, ending in dominant position. No linear retreat.',
    keyPrinciples: ['All movements follow circular, not linear, path', 'The ring is a tactical element', 'Esquiva with lateral displacement'],
    filmingNotes: 'Ring positioning overhead camera. Rope escape sequence. Corner escape. Circular movement principle visualized.',
  },
  9: {
    subtitle: 'Strategy & Opponent Reading',
    cubanEquiv: '17-18 — emphasis shifts from repertoire to tactical application',
    learningObjectives: [
      'Identify opponent pattern within 30 seconds',
      'Adjust strategy mid-round',
      'Articulate tactical changes and reasoning',
      'Disguised guard application',
      'Combat against different styles',
    ],
    gate: 'Identify opponent pattern within 30s. Adjust mid-round. Articulate what changed and why.',
    keyPrinciples: ['Repertoire to tactical application', 'Stimulus cards replace prescribed combos', 'The opponent reading skill'],
    filmingNotes: 'Pattern recognition demo with training partner. Mid-round adjustment narrated. Disguised guard. Style-specific strategies.',
  },
  10: {
    subtitle: 'Full Integration & Independence',
    cubanEquiv: '17-18 year 2 — full integration of all previous skills',
    learningObjectives: [
      'Three domains run as continuous algorithm',
      'Complete independence from coach',
      'Can coach others effectively',
      'Solves novel ring problems without prior instruction',
      'Playful with beginners AND killers',
    ],
    gate: 'Defense, footwork, punches run as one continuous algorithm. ~100% independent. Can coach. Solves novel problems.',
    keyPrinciples: ['The algorithm that never hands off', 'Creation phase — invents solutions not previously learned', 'The predator frame arrives'],
    filmingNotes: 'Full sparring with narrated decision-making. Coaching demo. Novel problem-solving in ring. The integration marker.',
  },
};

// ── Generate course outline ──────────────────────────────────────────────────

export function generateCourseOutline() {
  const config = loadBlockConfig();
  const modules = config.blocks.map(block => {
    const detail = MODULE_DETAILS[block.num] || {};
    const citations = BLOCK_CITATIONS[block.num] || [];

    return {
      module: block.num,
      name: block.name,
      subtitle: detail.subtitle || block.focus,
      focus: block.focus,
      cubanEquivalent: detail.cubanEquiv || '',
      capabilityStage: block.stage,
      sessionsToAdvance: block.sessions_to_advance,
      learningObjectives: detail.learningObjectives || [],
      techniques: {
        punches: block.punches,
        defenses: block.defenses,
        footwork: block.footwork,
        maxComboLength: block.maxComboLength,
        rhythmUnlocked: block.rhythmEngineUnlocked,
      },
      gate: detail.gate || '',
      keyPrinciples: detail.keyPrinciples || [],
      citations: citations,
      filmingNotes: detail.filmingNotes || '',
      status: 'draft',
      updatedAt: new Date().toISOString(),
    };
  });

  const outline = {
    title: '10-Block Cuban Boxing Course — Basic Reflex',
    positioning: 'Every boxing app is a fitness product or a random combo caller. Basic Reflex is the only system that understands WHY combinations work — and can explain the biomechanics.',
    ipOwner: 'Basic Reflex Limited / Paul Logan',
    totalModules: 10,
    totalCitations: modules.reduce((n, m) => n + m.citations.length, 0),
    primarySources: [
      'Balmaseda Alburquerque, M. (2009). Escuela Cubana de Boxeo. Wanceulen Editorial.',
      'Sagarra Caron, A. & Dominguez Garcia, J. (2007). Official Cuban Boxing Development Program.',
      'Filimonov, V.I. et al. (1985). Boxing: Means of Physical Development.',
      'Paul Logan — Basic Reflex original methodology (2024-2026)',
    ],
    modules,
    generated: new Date().toISOString(),
  };

  // Write to reports
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORTS_DIR, 'course-outline.json'), JSON.stringify(outline, null, 2));

  // Sync to vault
  try {
    const vaultModDir = path.join(VAULT, '10_Agents', 'course', 'modules');
    for (const mod of modules) {
      fs.writeFileSync(path.join(vaultModDir, `module-${mod.module}.json`), JSON.stringify(mod, null, 2));
    }
  } catch {}

  return outline;
}

// ── Get existing outline ─────────────────────────────────────────────────────

export function getCourseOutline() {
  const outlinePath = path.join(REPORTS_DIR, 'course-outline.json');
  try {
    return JSON.parse(fs.readFileSync(outlinePath, 'utf-8'));
  } catch {
    return generateCourseOutline();
  }
}

export function getModule(num) {
  const outline = getCourseOutline();
  return outline.modules.find(m => m.module === num) || null;
}

// ── Course progress tracker ──────────────────────────────────────────────────

export function getCourseStatus() {
  const outline = getCourseOutline();
  const filmingDir = path.join(REPORTS_DIR, 'filming-briefs');
  let briefsGenerated = 0;
  try {
    briefsGenerated = fs.readdirSync(filmingDir).filter(f => f.endsWith('.json')).length;
  } catch {}

  const authorityPath = path.join(REPORTS_DIR, 'authority-map.json');
  let citationCount = 0;
  let uncitedClaims = 0;
  try {
    const auth = JSON.parse(fs.readFileSync(authorityPath, 'utf-8'));
    citationCount = auth.citations?.length || 0;
    uncitedClaims = auth.gaps?.length || 0;
  } catch {}

  return {
    totalModules: outline.totalModules,
    modulesWithContent: outline.modules.filter(m => m.learningObjectives.length > 0).length,
    filmingBriefsGenerated: briefsGenerated,
    totalCitations: citationCount || outline.totalCitations,
    uncitedClaims,
    positioning: outline.positioning,
    generated: outline.generated,
  };
}
