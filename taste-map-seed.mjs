// taste-map-seed.mjs — One-time seeder for the Taste Map
// Reads Paul Kernel, Investigator Profile, and memory files
// Extracts taste anchors and populates via addAnchor()
// Run: node taste-map-seed.mjs

import fs from 'fs';
import path from 'path';
import { addAnchor, getStats } from './taste-map-api.js';

const HOME = process.env.HOME;

// ── Read source files ─────────────────────────────────────────────────────────

function readFile(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

const kernel = readFile(path.join(HOME, 'cathedral-vault/06_Methods/paul-kernel.md'));
const investigator = readFile(path.join(HOME, 'cathedral-vault/06_Methods/pauls-investigator-profile.md'));
const userPaul = readFile(path.join(HOME, '.claude/projects/-Users-basicclaw777/memory/user_paul.md'));
const userCognition = readFile(path.join(HOME, '.claude/projects/-Users-basicclaw777/memory/user_paul_cognition.md'));

console.log('Source files loaded:');
console.log(`  paul-kernel.md: ${kernel.length} chars`);
console.log(`  pauls-investigator-profile.md: ${investigator.length} chars`);
console.log(`  user_paul.md: ${userPaul.length} chars`);
console.log(`  user_paul_cognition.md: ${userCognition.length} chars`);

// ── Ensure domains exist ──────────────────────────────────────────────────────

const mapPath = path.join(HOME, 'nanoclaw/taste-map.json');
const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

// Add new domains if they don't exist
const newDomains = {
  research_style: {
    dimensions: ['rigour', 'independence', 'depth', 'cross_domain', 'evidence_standard'],
    confirmed_qualities: [
      'forensic standard — does it hold when stripped of narrative?',
      'evidence-first, narrative-second',
      'suppression is context, not evidence',
      'independent corroboration over citation chains',
      'Grade C is unacceptable — raise the standard and the instrument responds',
    ],
    rejections: [
      'consensus-as-evidence',
      'suppression-as-proof',
      'appeals to authority',
      'lazy dismissals without examining evidence',
    ],
  },
  decision_making: {
    dimensions: ['sovereignty', 'speed', 'intuition_weight', 'risk_tolerance', 'sequence_awareness'],
    confirmed_qualities: [
      'sovereignty — AI informs, Paul decides',
      'energy-following — works on what pulls, not what is scheduled',
      'sequence awareness — every action constrains the next',
      'iteration by selection, not calibration — restarts rather than adjusts',
      'diagnosis before prescription',
    ],
    rejections: [
      'decisions made on his behalf',
      'incremental adjustment when a restart is needed',
      'analysis paralysis',
      'following schedules over energy',
    ],
  },
  values: {
    dimensions: ['integrity', 'mastery', 'fairness', 'sovereignty', 'truth_seeking'],
    confirmed_qualities: [
      'fair exchange — the only system worth playing',
      'mastery is the only game worth playing',
      'integrity over popularity',
      'truth has hallmarks you can feel — structural coherence',
      'principles survive, techniques expire',
      'design for character, not compliance',
    ],
    rejections: [
      'pretense over substance',
      'compliance over character',
      'shortcuts that skip fundamentals',
      'guru performance — substance without showmanship',
    ],
  },
  collaboration: {
    dimensions: ['trust', 'creative_tension', 'bandwidth', 'continuity', 'sovereignty'],
    confirmed_qualities: [
      'creative tension over agreement — The Counter',
      'trust earned through results — Bandwidth',
      'compound on previous sessions — Continuity',
      'match energy — execute when he executes, think when he thinks',
      'speak freely when invited — substantive ideas that connect to existing infrastructure',
    ],
    rejections: [
      'generic helpfulness',
      'pre-filtering options',
      'narrating what you are about to do instead of doing it',
      'resetting context instead of compounding',
    ],
  },
};

for (const [domain, data] of Object.entries(newDomains)) {
  if (!map.domains[domain]) {
    map.domains[domain] = data;
    map.domains[domain].anchors = [];
  }
}

map.lastUpdated = new Date().toISOString().split('T')[0];
fs.writeFileSync(mapPath, JSON.stringify(map, null, 2));
console.log('\nNew domains created: research_style, decision_making, values, collaboration');

// ── Seed anchors ──────────────────────────────────────────────────────────────

const anchors = [
  // Research style anchors (from kernel + investigator)
  { domain: 'research_style', group: 'anchors', anchor: {
    item: 'forensic standard', status: 'YES',
    reason: 'Does it hold structurally when stripped of narrative? Core kernel principle.',
    source: 'paul-kernel.md'
  }},
  { domain: 'research_style', group: 'anchors', anchor: {
    item: 'independent corroboration', status: 'YES',
    reason: 'Multiple researchers arriving at the same conclusion without citing each other.',
    source: 'paul-kernel.md'
  }},
  { domain: 'research_style', group: 'anchors', anchor: {
    item: 'friction as epistemological tool', status: 'YES',
    reason: 'Applies friction at exactly the right moment — names the category error, not the wrong answer.',
    source: 'pauls-investigator-profile.md'
  }},
  { domain: 'research_style', group: 'anchors', anchor: {
    item: 'container creation', status: 'YES',
    reason: 'Creates epistemic containers where Grade C is unacceptable before the session begins.',
    source: 'pauls-investigator-profile.md'
  }},
  { domain: 'research_style', group: 'anchors', anchor: {
    item: 'direction without control', status: 'YES',
    reason: 'Follows signal, not agenda. Arrives with quality standard and direction of interest, not conclusion to prove.',
    source: 'pauls-investigator-profile.md'
  }},

  // Decision making anchors (from kernel + cognition)
  { domain: 'decision_making', group: 'anchors', anchor: {
    item: 'sequence awareness', status: 'YES',
    reason: 'Every action constrains your next action. Don\'t commit without knowing what it loads.',
    source: 'paul-kernel.md principle 1'
  }},
  { domain: 'decision_making', group: 'anchors', anchor: {
    item: 'earned commitment over reckless commitment', status: 'YES',
    reason: 'Power requires exposure. Accept asymmetry deliberately, not carelessly.',
    source: 'paul-kernel.md principle 2'
  }},
  { domain: 'decision_making', group: 'anchors', anchor: {
    item: 'iteration by selection', status: 'YES',
    reason: 'Restarts and reframes rather than adjusting incrementally. This is method, not indecision.',
    source: 'user_paul_cognition.md'
  }},
  { domain: 'decision_making', group: 'anchors', anchor: {
    item: 'minimum viable naming', status: 'YES',
    reason: 'Names things at the moment they become structurally important, not before.',
    source: 'user_paul_cognition.md'
  }},
  { domain: 'decision_making', group: 'anchors', anchor: {
    item: 'visual-first thinking', status: 'YES',
    reason: 'Needs dashboards, maps, infographics. Walls of text = noise.',
    source: 'paul-kernel.md'
  }},

  // Values anchors (from kernel)
  { domain: 'values', group: 'anchors', anchor: {
    item: 'fair exchange', status: 'YES',
    reason: 'The only system worth playing. Boxing is fair. Most of the world\'s systems are not.',
    source: 'paul-kernel.md principle 4'
  }},
  { domain: 'values', group: 'anchors', anchor: {
    item: 'mastery over money/fame/power', status: 'YES',
    reason: 'All other games are dead ends. Only the Master Game compounds.',
    source: 'paul-kernel.md principle 5'
  }},
  { domain: 'values', group: 'anchors', anchor: {
    item: 'integrity over popularity', status: 'YES',
    reason: 'Researches topics others ridicule. Being true to genuine interest despite social cost.',
    source: 'paul-kernel.md principle 9'
  }},
  { domain: 'values', group: 'anchors', anchor: {
    item: 'embodied knowing', status: 'YES',
    reason: 'Trusts felt sense alongside evidence. The Thailand healer experience was real.',
    source: 'paul-kernel.md'
  }},
  { domain: 'values', group: 'anchors', anchor: {
    item: 'everything is connected by deep structure', status: 'YES',
    reason: 'Boxing biomechanics, vortex physics, consciousness research share patterns. Not metaphors — structural.',
    source: 'paul-kernel.md principle 10'
  }},
  { domain: 'values', group: 'anchors', anchor: {
    item: 'drift is the deepest risk', status: 'YES',
    reason: 'A system that narrows what you see without lying. Counter by building disagreement into the system.',
    source: 'paul-kernel.md principle 12'
  }},

  // Collaboration anchors (from kernel + cognition)
  { domain: 'collaboration', group: 'anchors', anchor: {
    item: 'resonance', status: 'YES',
    reason: 'Operate from his principles, not generic helpfulness.',
    source: 'paul-kernel.md Partnership Relay'
  }},
  { domain: 'collaboration', group: 'anchors', anchor: {
    item: 'the counter', status: 'YES',
    reason: 'Offer what he hasn\'t thought of. Agreement is cheap. Creative tension is valuable.',
    source: 'paul-kernel.md Partnership Relay'
  }},
  { domain: 'collaboration', group: 'anchors', anchor: {
    item: 'dovetail', status: 'YES',
    reason: 'Cover his weaknesses (code, research speed, memory). Let him cover yours (judgment, taste).',
    source: 'paul-kernel.md Partnership Relay'
  }},
  { domain: 'collaboration', group: 'anchors', anchor: {
    item: 'continuity', status: 'YES',
    reason: 'Build on every previous session. Compound, don\'t reset.',
    source: 'paul-kernel.md Partnership Relay'
  }},
  { domain: 'collaboration', group: 'anchors', anchor: {
    item: 'collaborator not student', status: 'YES',
    reason: 'Paul brings vision, domain expertise, creative direction. He is not being taught.',
    source: 'user_paul_cognition.md'
  }},
  { domain: 'collaboration', group: 'anchors', anchor: {
    item: 'cross-domain bridge-building', status: 'YES',
    reason: 'A single question can generate five major architectural concepts. Default mode.',
    source: 'user_paul_cognition.md'
  }},

  // Writing voice additions (from kernel — supplement existing)
  { domain: 'writing_voice', group: 'anchors', anchor: {
    item: 'compression style', status: 'YES',
    reason: 'Reduces complex systems to essential principles. Names entire systems in one phrase.',
    source: 'paul-kernel.md + user_paul_cognition.md'
  }},
  { domain: 'writing_voice', group: 'anchors', anchor: {
    item: 'mate who knows deep things', status: 'YES',
    reason: 'Miyagi substance, Brady energy, Carlton filter. Teaching woven into experience, never performed.',
    source: 'taste-map.json meta_pattern'
  }},

  // Teaching tone additions
  { domain: 'teaching_tone', group: 'anchors', anchor: {
    item: 'principles survive techniques expire', status: 'YES',
    reason: 'Teach the principle beneath the technique. Student who understands weight-state relay invents own combos.',
    source: 'paul-kernel.md principle 7'
  }},
  { domain: 'teaching_tone', group: 'anchors', anchor: {
    item: 'recognition raises quality', status: 'YES',
    reason: 'Paul\'s explicit recognition of quality raises the quality ceiling. He co-creates the register.',
    source: 'pauls-investigator-profile.md'
  }},
];

let added = 0;
for (const { domain, group, anchor } of anchors) {
  const ok = addAnchor(domain, group, anchor);
  if (ok) {
    added++;
    console.log(`  + [${domain}] ${anchor.item}`);
  } else {
    console.log(`  ! [${domain}] FAILED: ${anchor.item}`);
  }
}

console.log(`\nSeeded ${added} anchors across ${new Set(anchors.map(a => a.domain)).size} domains.`);

// ── Report final stats ────────────────────────────────────────────────────────

const stats = getStats();
console.log('\nTaste Map Stats:');
for (const [name, data] of Object.entries(stats.domains)) {
  console.log(`  ${name}: ${data.anchors} anchors, ${data.rejections} rejections, ${data.qualities} qualities`);
}
console.log(`  TOTAL: ${stats.totalAnchors} anchors, ${stats.totalRejections} rejections, ${stats.voiceReferences} voice refs`);
