// taste-dimensions.js — Taste Dimension Engine
// Extracts WHY from anchors, finds cross-domain coherence
// ESM module
//
// The taste map knows WHAT Paul likes. This engine knows WHY.
// Items are examples. Dimensions are taste. Cross-domain coherence is the unlock.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TASTE_MAP_PATH = path.join(__dirname, 'taste-map.json');
const DIMENSIONS_PATH = path.join(__dirname, 'taste-dimensions.json');

// ── Core Taste Dimensions ────────────────────────────────────────────────────
// Extracted from 9 domains. These are the WHY behind Paul's preferences.
// Each dimension is a frequency that resonates across multiple domains.

const CORE_DIMENSIONS = {
  // --- Cross-domain universals (appear in 4+ domains) ---
  competence_without_ego: {
    description: "Skill expressed through restraint. Never performed, always present.",
    appears_in: ['music', 'visual_style', 'writing_voice', 'teaching_tone', 'values', 'collaboration', 'boxing_drills'],
    anchors: [
      'Miyagi substance, zero Miyagi performance',
      'mate who happens to know deep things',
      'confidence / swagger — never desperate or try-hard',
      'drills that reward patience and correct technique'
    ],
    anti_pattern: 'guru performance, showmanship, try-hard energy'
  },

  principle_over_technique: {
    description: "The WHY survives. The HOW expires. Teach the mechanism, not the recipe.",
    appears_in: ['teaching_tone', 'research_style', 'decision_making', 'values', 'boxing_drills'],
    anchors: [
      'principles survive techniques expire',
      'forensic standard — does it hold when stripped of narrative?',
      'teach the WHY not just the WHAT',
      'drills that teach a principle in unexpected and unignorable way'
    ],
    anti_pattern: 'memorisation without understanding, shortcuts that skip fundamentals'
  },

  authenticity_over_polish: {
    description: "Real over perfect. Visible substance, invisible processing.",
    appears_in: ['music', 'visual_style', 'writing_voice', 'class_energy', 'values'],
    anchors: [
      'must not look AI-generated',
      'authentic — not AI-generated sounding',
      'high-end photography look on ORDINARY photos',
      'rawness dimension in music (0.5-0.95 range)',
      'integrity over popularity'
    ],
    anti_pattern: 'corporate, hedging, over-produced, visible AI artifacts'
  },

  rhythm_and_flow: {
    description: "Loopable patterns. Getting into the zone. Head-nodding energy.",
    appears_in: ['music', 'class_energy', 'boxing_drills', 'collaboration'],
    anchors: [
      'bumping your head energy',
      'cool and in the flow > frantic and intense',
      'sequences that loop — you can get into a rhythm',
      'partner drills that loop and flow',
      'match energy — execute when he executes, think when he thinks'
    ],
    anti_pattern: 'frantic, chaotic, unpredictable without resolution'
  },

  surprise_within_structure: {
    description: "Unexpected moments within a predictable framework. The wildcard slot.",
    appears_in: ['music', 'teaching_tone', 'boxing_drills', 'class_energy'],
    anchors: [
      'Sweet Home Alabama as class closer — genre rules bend when energy + surprise factor is right',
      'tennis ball left/right — makes people conscious of their thinking',
      'medicine ball balance + tennis ball catch — unexpected, unignorable',
      'dancing occasionally instead of boxing = peak energy sign'
    ],
    anti_pattern: 'predictable-only or random-only (needs both)'
  },

  chunking_and_composition: {
    description: "Break into segments, master each, combine. The build-up is the method.",
    appears_in: ['boxing_drills', 'teaching_tone', 'decision_making', 'collaboration'],
    anchors: [
      'jab-slip → slip-1-2-slip → slip-cross → put together',
      'build to peak, dont start at 10',
      'diagnosis before prescription',
      'cross-domain bridge-building — single question → five concepts'
    ],
    anti_pattern: 'everything at once, no progression, no segmentation'
  },

  fair_exchange: {
    description: "Mutual benefit. Size is not everything. Patience rewarded.",
    appears_in: ['values', 'boxing_drills', 'collaboration', 'teaching_tone'],
    anchors: [
      'fair exchange — the only system worth playing',
      'push hands — balance, size is not everything',
      'drills that reward patience and correct technique',
      'creative tension over agreement — The Counter',
      'two-way street — learning is teaching and vice versa'
    ],
    anti_pattern: 'authority-based, one-directional, power-over'
  },

  consciousness_forcing: {
    description: "Makes you aware of what you're doing while you're doing it. Meta-cognition through action.",
    appears_in: ['boxing_drills', 'teaching_tone', 'research_style', 'values'],
    anchors: [
      'throwing tennis ball — left or right hand — forces conscious catching',
      'learn from mistakes — mistakes are data, not failure',
      'friction as epistemological tool',
      'the student who asks why > the student who memorises what'
    ],
    anti_pattern: 'autopilot, mindless repetition, unconscious compliance'
  },

  self_governing_systems: {
    description: "Built-in feedback loops. The system scores itself, resets on failure, escalates on success. Coach becomes observer.",
    appears_in: ['boxing_drills', 'teaching_tone', 'values', 'research_style'],
    anchors: [
      '10 consecutive catches — drop resets to zero (self-punishing)',
      'gear system: 1→2→3→4 escalation based on success',
      'point scoring: jab=1, hook=2, uppercut=3, combo=4 (self-rewarding)',
      'restriction drills: left only forces weakness confrontation',
      'paper trials — system runs itself, graduates when data says ready'
    ],
    anti_pattern: 'coach-dependent scoring, no internal feedback, no consequence for failure'
  },

  play_as_training: {
    description: "Games, races, challenges that train without feeling like training. The fun IS the method.",
    appears_in: ['boxing_drills', 'teaching_tone', 'class_energy'],
    anchors: [
      'skipping — rhythm + coordination disguised as warmup',
      'tag — agility + reaction disguised as game',
      'keep-ups — hand-eye + rhythm disguised as challenge',
      'races with movement constraints',
      'Sweet Home Alabama closing — genre rules bend when fun is right'
    ],
    anti_pattern: 'pure conditioning, joyless repetition, training that feels like punishment'
  }
};

// ── Boxing Drill Taste Dimensions ─────────────────────────────────────────────
// Paul's 7 drill taste dimensions, extracted from direct input 2026-05-30

const DRILL_DIMENSIONS = {
  principle_teaching: {
    description: "Teaches a principle in an unexpected and unignorable way",
    examples: [
      'medicine ball balance + tennis ball catch = foot awareness',
      'push hands = balance, size not everything'
    ],
    score_question: "Does this drill teach a principle the student can FEEL, not just hear?"
  },
  loopability: {
    description: "Sequence can loop — you get into a rhythm",
    examples: [
      'partner flow drills',
      'slip-counter-slip patterns'
    ],
    score_question: "Can this drill loop without stopping? Does it have a natural cycle?"
  },
  consciousness_forcing: {
    description: "Makes people conscious of their thinking",
    examples: [
      'tennis ball: say left or right, they catch with that hand',
      'call-and-response drills with decision points'
    ],
    score_question: "Does this drill force the student to THINK, not just react?"
  },
  chunkability: {
    description: "Can break into segments and reassemble",
    examples: [
      'jab-slip → slip-1-2-slip → slip-cross → full combo',
      'footwork pattern → add punches → add defence → full sequence'
    ],
    score_question: "Can this drill be taught in 3+ segments that combine into something bigger?"
  },
  partner_flow: {
    description: "Partner drills that loop and flow naturally",
    examples: [
      'push hands',
      'attack-defend loops',
      'mirror drills'
    ],
    score_question: "Do both partners have active roles? Does it flow without stopping?"
  },
  patience_reward: {
    description: "Rewards patience and correct technique over speed/power",
    examples: [
      'form scoring over speed',
      'slow-motion technique work',
      'balance challenges'
    ],
    score_question: "Does rushing this drill make it worse? Does patience make it better?"
  },
  principle_embodiment: {
    description: "Teaches abstract principle through physical experience",
    examples: [
      'balance on unstable surface = body awareness',
      'size-mismatch partner work = technique beats strength'
    ],
    score_question: "After this drill, does the student UNDERSTAND a principle they couldn't articulate before?"
  },
  self_regulating: {
    description: "Built-in scoring, consequences, or reset mechanics. The drill governs itself.",
    examples: [
      '10 consecutive wall catches — drop resets to zero',
      'point system: 1 jab, 2 hook, 3 uppercut, 4 combo',
      'gears: 1=singles, 2=doubles/triples, 3=3-4 punch, 4=all out',
      'restriction rounds: left only, footwork only, body only'
    ],
    score_question: "Does this drill have built-in consequences, scoring, or progression without coach intervention?"
  },
  rhythm_agility: {
    description: "Teaches rhythm, timing, agility through play — not just conditioning",
    examples: [
      'skipping (rhythm + coordination)',
      'tag games (agility + reaction)',
      'races with movement constraints',
      'keep-ups (hand-eye + rhythm)',
      'cone weaving with punch stations'
    ],
    score_question: "Does this drill build rhythm or agility through a game-like structure?"
  }
};

// ── Cross-Domain Coherence ──────────────────────────────────────────────────
// The same frequency expressed differently across domains

const COHERENCE_MAP = [
  {
    frequency: "Competence through restraint",
    music: "confidence/swagger — never desperate or try-hard",
    visual: "high-end look on ordinary photos — not over-processed",
    writing: "mate who knows deep things — never a guru",
    teaching: "principle hidden in action — wax on wax off",
    drills: "rewards patience and correct technique",
    research: "evidence-first, narrative-second"
  },
  {
    frequency: "Structured surprise",
    music: "Sweet Home Alabama closing a hip-hop boxing class",
    visual: "ippo style breaking the B&W rejection rule",
    teaching: "tennis ball left/right — unexpected cognitive load",
    drills: "medicine ball + tennis ball = unexpected awareness",
    research: "cross-domain convergence — finding same pattern in unrelated fields"
  },
  {
    frequency: "Build-up composition",
    music: "transition from modern to old school IS the cooldown arc",
    teaching: "build to peak, don't start at 10",
    drills: "jab-slip → slip-1-2-slip → full combo",
    research: "forensic standard → triage → synthesis → convergence",
    collaboration: "trust earned through results — Bandwidth principle"
  },
  {
    frequency: "Flow state looping",
    music: "head-nodding in breaks — never dead silence",
    teaching: "cool and in the flow > frantic and intense",
    drills: "partner drills that loop and flow",
    collaboration: "compound on previous sessions — Continuity principle"
  },
  {
    frequency: "Consciousness through friction",
    music: "two modes force selection — never autopilot",
    teaching: "the student who asks why > memorises what",
    drills: "left or right hand catch — forces conscious thinking",
    research: "friction as epistemological tool — names the category error"
  },
  {
    frequency: "Self-governing systems",
    drills: "10 catches reset to zero — drill punishes and rewards itself",
    teaching: "student manages own standard — coach becomes observer",
    research: "paper trials — system runs, graduates when data says ready",
    values: "sovereignty — AI informs, Paul decides",
    collaboration: "trust earned through results — no external validation needed"
  },
  {
    frequency: "Play as serious training",
    drills: "tag, skipping, keep-ups, races — training disguised as games",
    music: "dancing occasionally instead of boxing = peak energy sign",
    teaching: "the student who enjoys the process > the student who endures it",
    class_energy: "cool and in the flow > frantic and intense"
  }
];

// ── Scoring Engine ─────────────────────────────────────────────────────────
// Score any candidate against taste dimensions

/**
 * Score a drill against Paul's drill taste dimensions
 * @param {object} drill - { name, description, principle?, partner?, segments? }
 * @returns {object} dimension scores + total + verdict
 */
export function scoreDrill(drill) {
  const scores = {};
  const desc = (drill.description || '').toLowerCase();
  const name = (drill.name || '').toLowerCase();
  const full = `${name} ${desc} ${drill.principle || ''} ${JSON.stringify(drill)}`.toLowerCase();

  // Heuristic scoring — will be replaced by LLM scoring when wired
  scores.principle_teaching = 0;
  if (drill.principle || full.includes('teach') || full.includes('learn') || full.includes('aware')) scores.principle_teaching += 0.5;
  if (full.includes('unexpected') || full.includes('surprise') || full.includes('unignorable')) scores.principle_teaching += 0.3;

  scores.loopability = 0;
  if (full.includes('loop') || full.includes('repeat') || full.includes('rhythm') || full.includes('cycle')) scores.loopability += 0.6;
  if (full.includes('flow') || full.includes('continuous')) scores.loopability += 0.3;

  scores.consciousness_forcing = 0;
  if (full.includes('think') || full.includes('conscious') || full.includes('decision') || full.includes('choice')) scores.consciousness_forcing += 0.6;
  if (full.includes('react') && full.includes('choose')) scores.consciousness_forcing += 0.2;

  scores.chunkability = 0;
  if (drill.segments && drill.segments > 1) scores.chunkability += 0.3 * Math.min(drill.segments / 4, 1);
  if (full.includes('segment') || full.includes('chunk') || full.includes('build') || full.includes('progress')) scores.chunkability += 0.4;

  scores.partner_flow = 0;
  if (drill.partner || full.includes('partner') || full.includes('pair')) scores.partner_flow += 0.5;
  if (full.includes('flow') || full.includes('loop') || full.includes('mutual') || full.includes('mirror')) scores.partner_flow += 0.3;

  scores.patience_reward = 0;
  if (full.includes('patience') || full.includes('slow') || full.includes('technique') || full.includes('form')) scores.patience_reward += 0.5;
  if (full.includes('control') || full.includes('precision') || full.includes('balance')) scores.patience_reward += 0.3;

  scores.principle_embodiment = 0;
  if (full.includes('embod') || full.includes('feel') || full.includes('experience') || full.includes('understand')) scores.principle_embodiment += 0.5;
  if (drill.principle) scores.principle_embodiment += 0.3;

  scores.self_regulating = 0;
  if (full.includes('reset') || full.includes('score') || full.includes('point') || full.includes('consecutive')) scores.self_regulating += 0.5;
  if (full.includes('gear') || full.includes('level') || full.includes('restrict') || full.includes('only')) scores.self_regulating += 0.3;
  if (full.includes('self') || full.includes('auto') || full.includes('consequence')) scores.self_regulating += 0.2;

  scores.rhythm_agility = 0;
  if (full.includes('rhythm') || full.includes('skip') || full.includes('agil')) scores.rhythm_agility += 0.5;
  if (full.includes('tag') || full.includes('race') || full.includes('game') || full.includes('play') || full.includes('keep-up') || full.includes('keepup')) scores.rhythm_agility += 0.3;
  if (full.includes('fun') || full.includes('challenge') || full.includes('compete')) scores.rhythm_agility += 0.2;

  // Cap all at 1.0
  for (const k of Object.keys(scores)) scores[k] = Math.min(1, scores[k]);

  const total = Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length;
  const topDimensions = Object.entries(scores)
    .filter(([_, v]) => v >= 0.5)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);

  return {
    scores,
    total: Math.round(total * 100) / 100,
    topDimensions,
    verdict: total >= 0.5 ? 'STRONG_MATCH' : total >= 0.3 ? 'PARTIAL_MATCH' : 'WEAK_MATCH'
  };
}

/**
 * Score any content against core cross-domain dimensions
 * @param {string} domain - domain to score in
 * @param {string} content - text description of candidate
 * @returns {object} matching dimensions + coherence score
 */
export function scoreAgainstDimensions(domain, content) {
  const contentLower = content.toLowerCase();
  const matches = [];

  for (const [dimName, dim] of Object.entries(CORE_DIMENSIONS)) {
    if (!dim.appears_in.includes(domain)) continue;

    let score = 0;
    // Check against anchors
    for (const anchor of dim.anchors) {
      const words = anchor.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const matchCount = words.filter(w => contentLower.includes(w)).length;
      if (matchCount >= 2) score += 0.3;
    }
    // Check against anti-pattern (negative)
    if (dim.anti_pattern) {
      const antiWords = dim.anti_pattern.toLowerCase().split(/[,\s]+/).filter(w => w.length > 3);
      const antiMatch = antiWords.filter(w => contentLower.includes(w)).length;
      if (antiMatch >= 2) score -= 0.4;
    }

    if (score > 0) {
      matches.push({ dimension: dimName, score: Math.min(1, score), description: dim.description });
    }
  }

  matches.sort((a, b) => b.score - a.score);

  return {
    domain,
    matches,
    coherenceScore: matches.length > 0 ? matches.reduce((a, m) => a + m.score, 0) / matches.length : 0,
    dimensionCount: matches.length
  };
}

/**
 * Find cross-domain coherence — what connects preferences across domains
 * @returns {object[]} coherence frequencies with domain mappings
 */
export function getCrossCoherence() {
  return COHERENCE_MAP;
}

/**
 * Get all core dimensions
 */
export function getCoreDimensions() {
  return CORE_DIMENSIONS;
}

/**
 * Get drill-specific dimensions
 */
export function getDrillDimensions() {
  return DRILL_DIMENSIONS;
}

/**
 * Sweet spot analysis — is the taste map over-saturated?
 * @returns {object} health metrics
 */
export function tasteHealth() {
  let map;
  try {
    map = JSON.parse(fs.readFileSync(TASTE_MAP_PATH, 'utf8'));
  } catch { return { error: 'Cannot read taste map' }; }

  let totalAnchors = 0;
  let totalRejections = 0;
  const domainStats = {};

  for (const [name, domain] of Object.entries(map.domains || {})) {
    let anchors = 0;
    for (const [key, val] of Object.entries(domain)) {
      if (key.startsWith('anchors') && Array.isArray(val)) anchors += val.length;
    }
    const rejections = (domain.rejections || []).length;
    domainStats[name] = { anchors, rejections, ratio: rejections > 0 ? anchors / rejections : Infinity };
    totalAnchors += anchors;
    totalRejections += rejections;
  }

  const overallRatio = totalRejections > 0 ? totalAnchors / totalRejections : Infinity;

  // Sweet spot: ratio between 3:1 and 8:1 (anchors:rejections)
  // Below 3:1 = too restrictive (rejecting more than accepting)
  // Above 8:1 = diluted (accepting almost everything)
  let health;
  if (overallRatio < 3) health = 'TOO_RESTRICTIVE';
  else if (overallRatio <= 8) health = 'SWEET_SPOT';
  else if (overallRatio <= 15) health = 'GETTING_DILUTED';
  else health = 'NO_TASTE';

  // Dimension coverage
  const dimensionCoverage = Object.keys(CORE_DIMENSIONS).length;
  const domainCoverage = Object.keys(map.domains || {}).length;

  return {
    totalAnchors,
    totalRejections,
    overallRatio: Math.round(overallRatio * 10) / 10,
    health,
    healthAdvice: {
      TOO_RESTRICTIVE: 'More rejections than anchors suggests. Add anchors or soften rejections.',
      SWEET_SPOT: 'Healthy discrimination. Anchors and rejections in balance.',
      GETTING_DILUTED: 'Many anchors, few rejections. Taste getting broad. Add more rejections or extract dimensions from anchor clusters.',
      NO_TASTE: 'Too many anchors with almost no rejections. Everything is liked = nothing is distinctive.'
    }[health],
    domainStats,
    coreDimensions: dimensionCoverage,
    domainCount: domainCoverage,
    strongestDomains: Object.entries(domainStats)
      .filter(([_, s]) => s.ratio >= 3 && s.ratio <= 8)
      .map(([name]) => name),
    weakestDomains: Object.entries(domainStats)
      .filter(([_, s]) => s.ratio > 15 || s.rejections === 0)
      .map(([name]) => name)
  };
}

// ── Save dimensions to file ──────────────────────────────────────────────────

export function saveDimensions() {
  const data = {
    version: 1,
    lastUpdated: new Date().toISOString().split('T')[0],
    coreDimensions: CORE_DIMENSIONS,
    drillDimensions: DRILL_DIMENSIONS,
    coherenceMap: COHERENCE_MAP,
    health: tasteHealth()
  };
  fs.writeFileSync(DIMENSIONS_PATH, JSON.stringify(data, null, 2));
  return data;
}

export default {
  scoreDrill,
  scoreAgainstDimensions,
  getCrossCoherence,
  getCoreDimensions,
  getDrillDimensions,
  tasteHealth,
  saveDimensions
};
