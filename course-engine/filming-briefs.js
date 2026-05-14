/**
 * filming-briefs.js — Per-Module Filming Brief Generator
 *
 * Each brief: shots needed, talking points with citations,
 * duration estimate, equipment needed.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getCourseOutline } from './course-structure.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, 'reports');
const BRIEFS_DIR = path.join(REPORTS_DIR, 'filming-briefs');
const HOME = process.env.HOME || '/Users/basicclaw777';
const VAULT = path.join(HOME, 'cathedral-vault');

// ── Shot type definitions ────────────────────────────────────────────────────

const SHOT_TYPES = {
  technique_demo: { camera: 'Front + 45-degree angle', notes: 'Full speed then slow-mo. Coach demonstrates.' },
  drill_sequence: { camera: 'Wide to capture movement', notes: 'Full drill with reset. Coach + student if possible.' },
  combo_example: { camera: 'Front + side angle', notes: 'Build up from parts to full speed.' },
  common_error: { camera: 'Close on error point', notes: 'Show error, freeze, show correction. Split screen ideal.' },
  talking_head: { camera: 'Medium close-up, eye level', notes: 'Key concept explanation. Source citation on screen.' },
  overhead: { camera: 'Overhead / bird\'s eye', notes: 'Footwork patterns, ring positioning, weight distribution.' },
  pov_partner: { camera: 'Partner perspective', notes: 'What the technique looks like from the receiving end.' },
  detail_closeup: { camera: 'Tight on hands/feet', notes: 'Fist formation, foot placement, weight on metatarsus.' },
};

// ── Equipment list ───────────────────────────────────────────────────────────

const BASE_EQUIPMENT = [
  'Focus mitts (pair)',
  'Body pad',
  'Heavy bag',
  'Mirror (for shadow work)',
  'Phone/camera on tripod',
  'Ring or roped area',
];

const MODULE_EXTRA_EQUIPMENT = {
  5: ['Metronome / click track', 'Speaker for rhythm'],
  7: ['Timer (round timer)', 'Conditioning tools (rope, bands)'],
  8: ['Ropes/corner setup', 'Overhead camera mount'],
  9: ['Training partner (experienced)', 'Multiple round timer'],
  10: ['Full sparring gear', 'Multiple training partners'],
};

// ── Filming brief templates per module ───────────────────────────────────────

const BRIEF_TEMPLATES = {
  1: {
    durationEstimate: '45-60 min filming, 15-20 min final',
    shots: [
      { type: 'talking_head', desc: 'Introduction: the contract between coach and student. Why guard comes first.' },
      { type: 'technique_demo', desc: 'Guard position from front, side, behind, 45-degree. Hold for 10s each.' },
      { type: 'detail_closeup', desc: 'Fist formation close-up. Thumb placement. Knuckle alignment.' },
      { type: 'detail_closeup', desc: 'Foot placement: weight distribution 50/50, metatarsus, heel height.' },
      { type: 'detail_closeup', desc: 'Eye line: gaze above lead knuckles. Chin to shoulder.' },
      { type: 'common_error', desc: 'Error: chin up. Error: guard too low. Error: excessive tension. Show each then correct.' },
      { type: 'drill_sequence', desc: '3x3min shadow movement maintaining guard. Show the gate test.' },
      { type: 'talking_head', desc: 'Closing: obstacle-removal philosophy. Guard is resting AND returning state.' },
    ],
    talkingPoints: [
      { point: 'Guard is a POSITION, not a posture or halt', citation: 'Balmaseda Ch.II' },
      { point: 'Cuban system teaches one universal guard', citation: 'Balmaseda Ch.II' },
      { point: 'Eyes always above lead knuckles', citation: 'Balmaseda Ch.II' },
      { point: 'The obstacle-removal philosophy: mastery was always there', citation: 'Paul Logan methodology' },
    ],
  },
  2: {
    durationEstimate: '60-75 min filming, 20-25 min final',
    shots: [
      { type: 'talking_head', desc: 'Why footwork before punches. Movement IS defense at this stage.' },
      { type: 'technique_demo', desc: 'Flat step: forward, backward, left, right. Each direction 5 reps.' },
      { type: 'overhead', desc: 'Flat step pattern from above — smallest possible elevation.' },
      { type: 'technique_demo', desc: 'Pendulum step demonstration.' },
      { type: 'detail_closeup', desc: 'Weight on metatarsus during movement. Heel clearance.' },
      { type: 'common_error', desc: 'Error: crossing feet. Error: bouncing. Error: losing guard during movement.' },
      { type: 'drill_sequence', desc: 'Directional cue drill: coach calls direction, student responds within one beat. 2min.' },
      { type: 'talking_head', desc: 'Why double flat steps are rejected in Cuban system.' },
    ],
    talkingPoints: [
      { point: 'Flat step is foundation of ALL movement', citation: 'Balmaseda Ch.II p.34' },
      { point: 'Double flat steps explicitly rejected', citation: 'Balmaseda Ch.II p.34' },
      { point: 'No diagonal steps yet — those come at 13-14 (Block 4)', citation: 'Balmaseda Ch.II p.37' },
      { point: '11-12 age category: flat steps in all 4 directions', citation: 'Sagarra 2007' },
    ],
  },
  3: {
    durationEstimate: '90-120 min filming, 30-40 min final',
    shots: [
      { type: 'talking_head', desc: 'Why ONLY straight punches first. Cuban gating rule.' },
      { type: 'technique_demo', desc: 'Jab: full speed, slow-mo, from 3 angles.' },
      { type: 'technique_demo', desc: 'Cross: hip rotation emphasis. Weight transfer visible.' },
      { type: 'technique_demo', desc: 'Jab to body, cross to body: level change from knees, not arm.' },
      { type: 'detail_closeup', desc: 'Kinetic chain visualization: ground → hip → shoulder → knuckle.' },
      { type: 'technique_demo', desc: 'Parry defense. Catch defense.' },
      { type: 'combo_example', desc: 'Jab-cross (1-2): build up, full speed, with footwork.' },
      { type: 'technique_demo', desc: 'Feint with arm — no weight commitment.' },
      { type: 'common_error', desc: 'All 12 observable behaviours: show pass vs fail for each.' },
      { type: 'drill_sequence', desc: 'Full Block 3 gate test protocol (~15 min).' },
      { type: 'talking_head', desc: 'Three functions: offensive, defensive, counter-attack. Demo jab-cross in all three.' },
      { type: 'pov_partner', desc: 'What jab and cross look like from receiving end.' },
    ],
    talkingPoints: [
      { point: 'ONLY straight punches at this level — hooks prohibited', citation: 'Sagarra 2007 (11-12); Balmaseda Ch.II' },
      { point: 'Jab: zero weight commitment, neutral exit, universal setup', citation: 'Balmaseda Ch.II' },
      { point: 'Kinetic chain: 38% legs, 37% trunk, 24% arm', citation: 'Filimonov 1985' },
      { point: 'Max 2-punch combinations at beginner level', citation: 'Sagarra 2007 (11-12)' },
      { point: 'Every technique must serve three functions', citation: 'Balmaseda Ch.II' },
    ],
  },
};

// ── Generate brief for module ────────────────────────────────────────────────

export function generateFilmingBrief(moduleNum) {
  const outline = getCourseOutline();
  const mod = outline.modules.find(m => m.module === moduleNum);
  if (!mod) return null;

  const template = BRIEF_TEMPLATES[moduleNum];
  const equipment = [...BASE_EQUIPMENT, ...(MODULE_EXTRA_EQUIPMENT[moduleNum] || [])];

  const brief = {
    module: moduleNum,
    name: mod.name,
    subtitle: mod.subtitle,
    durationEstimate: template?.durationEstimate || '60-90 min filming, 20-30 min final',
    equipment,
    shots: template?.shots || generateDefaultShots(mod),
    talkingPoints: template?.talkingPoints || generateDefaultTalkingPoints(mod),
    loganNote: `Module ${moduleNum}: Digital Logan demonstrations could supplement live filming for ${mod.techniques.punches.length > 0 ? 'technique demos and' : ''} concept visualization. Character sheets (Kael, Logan, Vet\'s Mitts) as visual reference for course aesthetic.`,
    citations: mod.citations,
    status: template ? 'detailed' : 'outline',
    generated: new Date().toISOString(),
  };

  // Save
  if (!fs.existsSync(BRIEFS_DIR)) fs.mkdirSync(BRIEFS_DIR, { recursive: true });
  fs.writeFileSync(path.join(BRIEFS_DIR, `module-${moduleNum}.json`), JSON.stringify(brief, null, 2));

  // Vault sync
  try {
    const vaultFilming = path.join(VAULT, '10_Agents', 'course', 'filming');
    fs.writeFileSync(path.join(vaultFilming, `module-${moduleNum}-brief.json`), JSON.stringify(brief, null, 2));
  } catch {}

  return brief;
}

function generateDefaultShots(mod) {
  const shots = [
    { type: 'talking_head', desc: `Introduction: Module ${mod.module} — ${mod.subtitle}. Key principles and Cuban context.` },
  ];

  if (mod.techniques.punches.length > 0) {
    shots.push({ type: 'technique_demo', desc: `Demonstrate: ${mod.techniques.punches.join(', ')}` });
  }
  if (mod.techniques.defenses.length > 0) {
    shots.push({ type: 'technique_demo', desc: `Defense demonstrations: ${mod.techniques.defenses.join(', ')}` });
  }
  if (mod.techniques.footwork.length > 0) {
    shots.push({ type: 'overhead', desc: `Footwork patterns: ${mod.techniques.footwork.join(', ')}` });
  }
  if (mod.techniques.maxComboLength > 0) {
    shots.push({ type: 'combo_example', desc: `Combination examples up to ${mod.techniques.maxComboLength} punches` });
  }
  if (mod.techniques.rhythmUnlocked) {
    shots.push({ type: 'drill_sequence', desc: 'Rhythm drill with metronome/click track' });
  }

  shots.push({ type: 'common_error', desc: 'Common errors at this level with corrections' });
  shots.push({ type: 'drill_sequence', desc: `Gate test: ${mod.gate}` });
  shots.push({ type: 'talking_head', desc: 'Closing: key takeaways and what comes next' });

  return shots;
}

function generateDefaultTalkingPoints(mod) {
  return mod.citations.map(c => ({
    point: c.claim,
    citation: c.source,
  }));
}

export function getFilmingBrief(moduleNum) {
  const briefPath = path.join(BRIEFS_DIR, `module-${moduleNum}.json`);
  try {
    return JSON.parse(fs.readFileSync(briefPath, 'utf-8'));
  } catch {
    return null;
  }
}

export function getAllFilmingBriefs() {
  try {
    return fs.readdirSync(BRIEFS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => JSON.parse(fs.readFileSync(path.join(BRIEFS_DIR, f), 'utf-8')));
  } catch {
    return [];
  }
}
