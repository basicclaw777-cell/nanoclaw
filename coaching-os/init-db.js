// init-db.js — Create coaching.db and import existing drill data
// ESM module. Run: node coaching-os/init-db.js
//
// Sources:
//   ~/basic-reflex/class-planner/drill-bank.json (flat: 46 drills)
//   ~/basic-reflex/class-system/drill-bank.json  (rich: 14 drills)
//   ~/basic-reflex/drill-scoring.json            (scores for 60 drills)

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const HOME = process.env.HOME;
const DB_PATH = path.join(HOME, 'nanoclaw', 'coaching-os', 'coaching.db');
const SCHEMA_PATH = path.join(HOME, 'nanoclaw', 'coaching-os', 'schema.sql');

const PLANNER_DRILLS = path.join(HOME, 'basic-reflex', 'class-planner', 'drill-bank.json');
const SYSTEM_DRILLS = path.join(HOME, 'basic-reflex', 'class-system', 'drill-bank.json');
const SCORING_DATA = path.join(HOME, 'basic-reflex', 'drill-scoring.json');

function loadJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

// ── Create DB ─────────────────────────────────────────────────────

const db = new Database(DB_PATH);
const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
db.exec(schema);
console.log(`DB created: ${DB_PATH}`);

// ── Segment Templates ─────────────────────────────────────────────

const insertTemplate = db.prepare(
  `INSERT OR IGNORE INTO segment_templates (id, name, description, segments) VALUES (?, ?, ?, ?)`
);

const standard6 = [
  { num: 1, name: 'Icebreaker', purpose: 'Break tension, learn names, establish energy', time_range: [5, 12] },
  { num: 2, name: 'Warm-Up', purpose: 'Raise heart rate, build coordination', time_range: [8, 15] },
  { num: 3, name: 'Main Drill', purpose: 'Teaching block. Technique on bags or shadow', time_range: [12, 20] },
  { num: 4, name: 'Correction', purpose: 'Self-correcting drills that expose bad habits', time_range: [8, 15] },
  { num: 5, name: 'Application', purpose: 'Partner work. Live but controlled', time_range: [8, 15] },
  { num: 6, name: 'Finisher', purpose: 'Fun, shared suffering, or cool-down', time_range: [5, 10] }
];

const paul8 = [
  { num: 1, name: 'Warm-Up', purpose: 'General movement, raise temperature', time_range: [5, 8] },
  { num: 2, name: 'Coordination Icebreaker', purpose: 'Fun coordination challenge, names, energy', time_range: [5, 10] },
  { num: 3, name: 'Agility', purpose: 'Footwork agility, line drills, reactions', time_range: [5, 8] },
  { num: 4, name: 'Footwork', purpose: 'Boxing-specific footwork patterns', time_range: [5, 10] },
  { num: 5, name: 'Bagwork', purpose: 'Technique on heavy bags', time_range: [10, 15] },
  { num: 6, name: 'Padwork', purpose: 'Partner pads — combinations and timing', time_range: [8, 12] },
  { num: 7, name: 'Partner Drill', purpose: 'Live partner work — defense, counters, pressure', time_range: [8, 12] },
  { num: 8, name: 'Conditioning', purpose: 'Finisher — high intensity or cool-down', time_range: [5, 10] }
];

const kids5 = [
  { num: 1, name: 'Game', purpose: 'High-energy game, set the tone', time_range: [8, 12] },
  { num: 2, name: 'Movement', purpose: 'Coordination and agility through play', time_range: [8, 10] },
  { num: 3, name: 'Technique', purpose: 'One thing. Keep it simple. Repetition.', time_range: [10, 15] },
  { num: 4, name: 'Challenge', purpose: 'Partner or bag challenge with technique', time_range: [8, 12] },
  { num: 5, name: 'Finisher', purpose: 'Team game or conditioning challenge', time_range: [5, 8] }
];

insertTemplate.run('standard_6', 'Standard 6-Stage', 'Original class spine from class-system', JSON.stringify(standard6));
insertTemplate.run('paul_8', 'Paul 8-Segment', 'How Paul actually teaches — full breadth', JSON.stringify(paul8));
insertTemplate.run('kids_5', 'Kids 5-Stage', 'Youth classes — game-heavy, one technique focus', JSON.stringify(kids5));
console.log('Segment templates: 3 inserted');

// ── Import Drills ─────────────────────────────────────────────────

const insertDrill = db.prepare(`
  INSERT OR REPLACE INTO drills
  (id, name, description, domain, mode, block_min, block_max, time_min, time_max,
   group_size_min, group_size_max, equipment, levels, energy_demand, engines, source)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertTag = db.prepare(
  `INSERT OR IGNORE INTO drill_tags (drill_id, tag) VALUES (?, ?)`
);

let imported = 0;

// Source 1: class-planner/drill-bank.json (flat format)
const plannerDrills = loadJSON(PLANNER_DRILLS);
if (plannerDrills) {
  for (const d of plannerDrills) {
    const engines = domainToEngines(d.domain);
    insertDrill.run(
      d.id, d.name, d.desc || null, d.domain, d.mode || null,
      d.block || 1, d.block || 10,
      null, null, 1, 30, null, null,
      'medium', JSON.stringify(engines), 'class-planner/drill-bank.json'
    );
    insertTag.run(d.id, d.domain);
    if (d.mode) insertTag.run(d.id, d.mode);
    imported++;
  }
  console.log(`Planner drills: ${plannerDrills.length} imported`);
}

// Source 2: class-system/drill-bank.json (rich format — overwrites planner if same id)
const systemData = loadJSON(SYSTEM_DRILLS);
if (systemData && systemData.drills) {
  for (const d of systemData.drills) {
    const timeRange = d.time_range || [null, null];
    const groupSize = d.group_size || [1, 30];
    const engines = d.engines || ['body'];
    const equipment = d.equipment && d.equipment.length ? JSON.stringify(d.equipment) : null;
    const levels = d.levels ? JSON.stringify(d.levels) : null;

    insertDrill.run(
      d.id, d.name, d.description || null,
      stageTosDomain(d.stage, d.tags),
      inferMode(d.tags, d.equipment),
      1, 10,
      timeRange[0] ? timeRange[0] * 60 : null,
      timeRange[1] ? timeRange[1] * 60 : null,
      groupSize[0], groupSize[1],
      equipment, levels, 'medium',
      JSON.stringify(engines), d.source || 'class-system/drill-bank.json'
    );

    if (d.tags) {
      for (const tag of d.tags) insertTag.run(d.id, tag);
    }
    imported++;
  }
  console.log(`System drills: ${systemData.drills.length} imported`);
}

// Source 3: drill-scoring.json (add scoring data to existing drills)
const scoringData = loadJSON(SCORING_DATA);
if (scoringData && scoringData.cards) {
  const updateScoring = db.prepare(`UPDATE drills SET scoring = ? WHERE id = ?`);
  let scored = 0;
  for (const card of scoringData.cards) {
    if (!card.drills) continue;
    for (const d of card.drills) {
      if (!d.id && !d.name) continue;
      const drillId = d.id || slugify(d.name);
      const existing = db.prepare('SELECT id FROM drills WHERE id = ?').get(drillId);
      if (existing) {
        const scores = { ...d };
        delete scores.id;
        delete scores.name;
        updateScoring.run(JSON.stringify(scores), drillId);
        scored++;
      }
    }
  }
  console.log(`Drill scores applied: ${scored}`);
}

console.log(`\nTotal drills in DB: ${db.prepare('SELECT count(*) as c FROM drills').get().c}`);

// ── Seed Themes ───────────────────────────────────────────────────

const insertTheme = db.prepare(
  `INSERT OR IGNORE INTO themes (id, name, layer, description, engines) VALUES (?, ?, ?, ?, ?)`
);

const seedThemes = [
  // Technique layer
  ['theme-jab', 'The Jab', 'technique', 'Everything about the jab — setup, power, timing, variations', '["body"]'],
  ['theme-cross', 'The Cross', 'technique', 'Straight right/rear hand — power generation, timing, setups', '["body"]'],
  ['theme-hook', 'The Hook', 'technique', 'Lead and rear hooks — short range power, body/head', '["body"]'],
  ['theme-uppercut', 'The Uppercut', 'technique', 'Inside fighting weapon — mechanics, timing, entries', '["body"]'],
  ['theme-slip', 'Slipping', 'technique', 'Head movement defense — inside/outside, with counters', '["body","mind"]'],
  ['theme-footwork-basics', 'Footwork Fundamentals', 'technique', 'Step-drag, lateral, pivot, distance management', '["body"]'],

  // Concept layer
  ['theme-distance', 'Distance Management', 'concept', 'Controlling range — when to be close, when to be far', '["mind"]'],
  ['theme-timing', 'Timing & Rhythm', 'concept', 'Breaking rhythm, creating openings, tempo changes', '["mind"]'],
  ['theme-pressure', 'Pressure Fighting', 'concept', 'Moving forward, cutting the ring, body work', '["body","mind","eq"]'],
  ['theme-counter', 'Counter Fighting', 'concept', 'Making them miss, making them pay', '["mind"]'],
  ['theme-defense-first', 'Defense First', 'concept', 'Nothing lands clean — shell, parry, slip, move', '["body","mind"]'],
  ['theme-angles', 'Angles & Positioning', 'concept', 'Off-angle attacks, pivots, lateral movement', '["mind"]'],

  // Combo family layer
  ['theme-1-2', 'The 1-2 Family', 'combo_family', 'Jab-cross and all variations/setups/exits', '["body"]'],
  ['theme-3-piece', '3-Piece Combinations', 'combo_family', 'Three-punch flows — 1-2-3, 2-3-2, 1-2-5', '["body"]'],
  ['theme-body-head', 'Body-Head Combinations', 'combo_family', 'Level changes — go low to go high', '["body","mind"]'],

  // Style layer
  ['theme-peek-a-boo', 'Peek-a-Boo Style', 'style', 'Tyson/Cus — head movement, inside fighting, angles', '["body","mind"]'],
  ['theme-outboxing', 'Outboxing', 'style', 'Long range, jab control, movement, Floyd/Ali principles', '["body","mind"]'],
  ['theme-switch-hitting', 'Switch Hitting', 'style', 'Southpaw/orthodox switching — Hagler, Crawford', '["body","mind"]'],

  // Physical layer
  ['theme-balance', 'Balance & Base', 'physical', 'Weight distribution, recovery, stability under pressure', '["body"]'],
  ['theme-coordination', 'Coordination', 'physical', 'Hand-eye, hand-foot, reaction time, multi-tasking', '["body","mind"]'],
  ['theme-power-generation', 'Power Generation', 'physical', 'Hip rotation, weight transfer, kinetic chain', '["body"]'],
  ['theme-conditioning', 'Boxing Conditioning', 'physical', 'Sport-specific fitness — rounds, recovery, gas tank', '["body"]']
];

for (const [id, name, layer, desc, engines] of seedThemes) {
  insertTheme.run(id, name, layer, desc, engines);
}
console.log(`Seed themes: ${seedThemes.length} inserted`);

// ── Seed Series (placeholders) ────────────────────────────────────

const insertSeries = db.prepare(
  `INSERT OR IGNORE INTO series (id, name, description, theme_layer, block_range, total_sessions, status, lifecycle)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);

const seedSeries = [
  ['series-jab-mastery', 'Jab Mastery', '7 sessions from basic to advanced jab', 'technique', '[1,4]', 7, 'placeholder', 'idea'],
  ['series-footwork-101', 'Footwork 101', 'Foundation footwork for beginners', 'technique', '[1,3]', 5, 'placeholder', 'idea'],
  ['series-counter-puncher', 'The Counter Puncher', 'Building a counter-fighting game', 'concept', '[4,7]', 6, 'placeholder', 'idea'],
  ['series-pressure-fighter', 'Pressure Fighting', 'Inside fighting and ring cutting', 'concept', '[3,6]', 6, 'placeholder', 'idea'],
  ['series-defense-toolkit', 'Defense Toolkit', 'Every defense in sequence', 'technique', '[2,5]', 8, 'placeholder', 'idea'],
  ['series-body-attack', 'Body Attack Series', 'Building a complete body game', 'combo_family', '[2,5]', 5, 'placeholder', 'idea'],
  ['series-1-2-variations', '1-2 Variations', 'The foundation combo and its 12 variations', 'combo_family', '[1,3]', 4, 'placeholder', 'idea'],
  ['series-peek-a-boo', 'Peek-a-Boo Fundamentals', 'Tyson/Cus style foundation', 'style', '[3,6]', 6, 'placeholder', 'idea'],
  ['series-outboxer', 'Outboxer Blueprint', 'Long-range game — jab, move, control', 'style', '[3,6]', 6, 'placeholder', 'idea'],
  ['series-power-dev', 'Power Development', 'Kinetic chain mastery', 'physical', '[2,5]', 5, 'placeholder', 'idea'],
  ['series-boxing-conditioning', 'Boxing Conditioning', 'Sport-specific fitness progression', 'physical', '[1,10]', 8, 'placeholder', 'idea'],
  ['series-sparring-ready', 'Sparring Ready', 'Fear gate preparation — blocks 4→5', 'concept', '[4,5]', 6, 'placeholder', 'idea'],
  ['series-first-10-classes', 'First 10 Classes', 'Absolute beginner onboarding', 'technique', '[1,2]', 10, 'placeholder', 'idea'],
  ['series-kids-intro', 'Kids Boxing Intro', 'Youth-specific progression', 'technique', '[1,3]', 8, 'placeholder', 'idea'],
  ['series-ring-iq', 'Ring IQ', 'Tactical intelligence development', 'concept', '[5,8]', 6, 'placeholder', 'idea'],
  ['series-combo-builder', 'Combo Builder', 'From 2-punch to 6-punch flows', 'combo_family', '[1,5]', 6, 'placeholder', 'idea'],
  ['series-angle-master', 'Angle Master', 'Positional dominance through footwork', 'concept', '[3,6]', 5, 'placeholder', 'idea'],
  ['series-remote-fundamentals', 'Home Fundamentals', 'No-equipment remote delivery', 'technique', '[1,3]', 6, 'placeholder', 'idea']
];

for (const [id, name, desc, layer, range, sessions, status, lifecycle] of seedSeries) {
  insertSeries.run(id, name, desc, layer, range, sessions, status, lifecycle);
}
console.log(`Seed series: ${seedSeries.length} inserted`);

// ── Seed Series Edges ─────────────────────────────────────────────

const insertEdge = db.prepare(
  `INSERT OR IGNORE INTO series_edges (from_id, to_id, edge_type, notes) VALUES (?, ?, ?, ?)`
);

const edges = [
  ['series-footwork-101', 'series-jab-mastery', 'PREPARES', 'Footwork enables effective jabbing'],
  ['series-jab-mastery', 'series-1-2-variations', 'FOLLOWS', 'Jab → 1-2 is natural progression'],
  ['series-1-2-variations', 'series-combo-builder', 'FOLLOWS', '1-2 → longer combos'],
  ['series-defense-toolkit', 'series-counter-puncher', 'PREPARES', 'Must defend before counter'],
  ['series-defense-toolkit', 'series-sparring-ready', 'PREPARES', 'Defense confidence enables sparring'],
  ['series-sparring-ready', 'series-ring-iq', 'FOLLOWS', 'Sparring entry → tactical depth'],
  ['series-pressure-fighter', 'series-counter-puncher', 'CONTRASTS', 'Opposite strategies'],
  ['series-outboxer', 'series-pressure-fighter', 'CONTRASTS', 'Opposite strategies'],
  ['series-peek-a-boo', 'series-pressure-fighter', 'COMBINES', 'Peek-a-boo IS a pressure style'],
  ['series-body-attack', 'series-pressure-fighter', 'REINFORCES', 'Body work supports pressure'],
  ['series-power-dev', 'series-body-attack', 'PREPARES', 'Power mechanics → body shot effectiveness'],
  ['series-first-10-classes', 'series-footwork-101', 'FOLLOWS', 'After intro, specialize'],
  ['series-first-10-classes', 'series-jab-mastery', 'FOLLOWS', 'After intro, specialize'],
  ['series-angle-master', 'series-outboxer', 'REINFORCES', 'Angles enhance outboxing'],
  ['series-footwork-101', 'series-angle-master', 'PREPARES', 'Must have basic movement first'],
  ['series-remote-fundamentals', 'series-first-10-classes', 'ALTERNATIVE', 'Same content, remote delivery']
];

for (const [from, to, type, notes] of edges) {
  insertEdge.run(from, to, type, notes);
}
console.log(`Series edges: ${edges.length} inserted`);

// ── Done ──────────────────────────────────────────────────────────

db.close();
console.log('\n✓ coaching.db initialized');

// ── Helpers ───────────────────────────────────────────────────────

function domainToEngines(domain) {
  const map = {
    footwork: ['body'],
    defense: ['body', 'mind'],
    combos: ['body'],
    conditioning: ['body'],
    mindset: ['mind', 'eq'],
    strategy: ['mind']
  };
  return map[domain] || ['body'];
}

function stageTosDomain(stage, tags) {
  if (!tags) return 'warm_up';
  if (tags.includes('icebreaker')) return 'icebreaker';
  if (tags.includes('footwork')) return 'footwork';
  if (tags.includes('agility')) return 'warm_up';
  if (tags.includes('defense') || tags.includes('counter')) return 'defense';
  if (tags.includes('conditioning')) return 'conditioning';
  if (stage <= 2) return 'warm_up';
  if (stage === 3) return 'combos';
  if (stage === 4) return 'defense';
  if (stage === 5) return 'combos';
  return 'conditioning';
}

function inferMode(tags, equipment) {
  if (!tags) return null;
  if (tags.includes('partner')) return 'partner';
  if (tags.includes('bag') || (equipment && equipment.includes('heavy bag'))) return 'bag';
  if (tags.includes('pads')) return 'pads';
  if (tags.includes('shadow')) return 'shadow';
  return 'solo';
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
