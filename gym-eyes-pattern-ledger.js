#!/usr/bin/env node
/**
 * gym-eyes-pattern-ledger.js — The Memory Layer
 *
 * Gym Eyes sees. The Pattern Ledger remembers.
 * The Priority Engine decides what matters. The Coach decides what to do.
 *
 * Operates on class harvest output. Tracks patterns across sessions per member.
 * Manages the lifecycle: DETECTED → RECURRING → PRIORITISED → INTERVENTION → MONITORING → IMPROVED → RESOLVED
 *
 * Data lives in ~/nanoclaw/gym-eyes-patterns/
 *   members.json        — member registry (id, name, first_seen, sessions)
 *   patterns.json       — all patterns with lifecycle state
 *   interventions.json  — coach interventions linked to patterns
 *   milestones.json     — detected milestones and celebrations
 *
 * Usage:
 *   node gym-eyes-pattern-ledger.js ingest <class-dir> --member <name>
 *   node gym-eyes-pattern-ledger.js status <member-name>
 *   node gym-eyes-pattern-ledger.js queue [--limit 5]
 *   node gym-eyes-pattern-ledger.js intervene <pattern-id> --action "recovery cue given"
 *   node gym-eyes-pattern-ledger.js progress <member-name> [--months 3]
 *   node gym-eyes-pattern-ledger.js brief [--date today]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const HOME = process.env.HOME;
const DATA_DIR = join(HOME, 'nanoclaw', 'gym-eyes-patterns');
const CLASS_DIR = join(HOME, 'nanoclaw', 'gym-eyes-classes');
const BLOCK_CONFIG_PATH = join(HOME, 'nanoclaw', 'block-config.json');

// ── 10-Block Curriculum ────────────────────────────────────────────────────────

let BLOCKS = [];
try {
  BLOCKS = JSON.parse(readFileSync(BLOCK_CONFIG_PATH, 'utf8')).blocks;
} catch {
  console.warn('Warning: block-config.json not found — block mapping disabled');
}

const BLOCK_MAP = {
  guard_drop:           { block: 1, name: 'Foundation', reason: 'Guard position is Block 1 core' },
  guard_recovery:       { block: 3, name: 'Angle', reason: 'Return to guard after punching = Block 3 gate' },
  stance_instability:   { block: 1, name: 'Foundation', reason: 'Stance fundamentals = Block 1' },
  balance_loss:         { block: 2, name: 'Level', reason: 'Balance during movement = Block 2 gate' },
  foot_crossing:        { block: 2, name: 'Level', reason: 'No crossing feet = Block 2 gate criteria' },
  overextension:        { block: 3, name: 'Angle', reason: 'Balance after punch = Block 3 gate' },
  telegraphing:         { block: 5, name: 'Rhythm', reason: 'Timing/deception = Block 5 domain' },
  punch_variety:        { block: 4, name: 'Inside', reason: 'Hooks, body work, combo variety = Block 4' },
  rhythm_consistency:   { block: 5, name: 'Rhythm', reason: 'Timing and broken rhythm = Block 5 core' },
  distance_control:     { block: 9, name: 'Control', reason: 'Range control = Block 9 gate' },
  exit_structure:       { block: 2, name: 'Level', reason: 'Movement in balance = Block 2' },
  power_generation:     { block: 3, name: 'Angle', reason: 'Straight punch mechanics = Block 3' },
  head_movement:        { block: 6, name: 'Counter', reason: 'Slips/ducks = Block 6 defense integration' },
  weight_transfer:      { block: 3, name: 'Angle', reason: 'Punch mechanics = Block 3' },
  reset_quality:        { block: 2, name: 'Level', reason: 'Balance on stop = Block 2 gate' },
  fatigue_pattern:      { block: 7, name: 'Pressure', reason: 'Technique under fatigue = Block 7 core' },
  low_output:           { block: 5, name: 'Rhythm', reason: 'Output volume relates to rhythm/composure' },
  stance_clarity:       { block: 1, name: 'Foundation', reason: 'Stance fundamentals = Block 1' },
  stance_switching:     { block: 9, name: 'Control', reason: 'Strategic stance switching = advanced' },
  default:              { block: null, name: null, reason: 'Unmapped — needs manual block assignment' }
};

// ── Schema ─────────────────────────────────────────────────────────────────────

/*
PATTERN LIFECYCLE:
  DETECTED    — first observation in a single session
  RECURRING   — same pattern seen in 2+ sessions
  PRIORITISED — priority score exceeds threshold (auto or manual)
  INTERVENTION — coach has acted on it
  MONITORING  — watching post-intervention
  IMPROVED    — measurable improvement detected
  RESOLVED    — no longer appearing, closed

PRIORITY SCORE:
  frequency × persistence × importance × (1 + trend_modifier)

  frequency:    how often per session (0-1, normalized)
  persistence:  sessions_seen / total_sessions (0-1)
  importance:   technical weight (guard=0.9, rhythm=0.4, etc.)
  trend:        getting worse = +0.3, stable = 0, improving = -0.2
*/

const IMPORTANCE_WEIGHTS = {
  guard_drop:           0.9,
  guard_recovery:       0.9,
  stance_instability:   0.8,
  balance_loss:         0.8,
  foot_crossing:        0.8,
  overextension:        0.7,
  telegraphing:         0.7,
  punch_variety:        0.6,
  rhythm_consistency:   0.5,
  distance_control:     0.7,
  exit_structure:       0.7,
  power_generation:     0.5,
  head_movement:        0.6,
  weight_transfer:      0.6,
  reset_quality:        0.5,
  fatigue_pattern:      0.4,
  low_output:           0.4,
  stance_clarity:       0.5,
  stance_switching:     0.4,
  default:              0.5
};

const LIFECYCLE = ['DETECTED', 'RECURRING', 'PRIORITISED', 'INTERVENTION', 'MONITORING', 'IMPROVED', 'RESOLVED'];

// ── Data Access ────────────────────────────────────────────────────────────────

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadJSON(filename) {
  const path = join(DATA_DIR, filename);
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, 'utf8'));
}

function saveJSON(filename, data) {
  ensureDataDir();
  writeFileSync(join(DATA_DIR, filename), JSON.stringify(data, null, 2));
}

function loadMembers() { return loadJSON('members.json'); }
function saveMembers(d) { saveJSON('members.json', d); }
function loadPatterns() { return loadJSON('patterns.json'); }
function savePatterns(d) { saveJSON('patterns.json', d); }
function loadInterventions() { return loadJSON('interventions.json'); }
function saveInterventions(d) { saveJSON('interventions.json', d); }
function loadMilestones() { return loadJSON('milestones.json'); }
function saveMilestones(d) { saveJSON('milestones.json', d); }

// ── Member Registry ────────────────────────────────────────────────────────────

function findOrCreateMember(name) {
  const members = loadMembers();
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  let member = members.find(m => m.slug === slug);
  if (!member) {
    member = {
      id: `member-${slug}`,
      slug,
      name,
      first_seen: new Date().toISOString().slice(0, 10),
      current_block: 1,
      sessions: [],
      total_sessions: 0,
      active_patterns: 0,
      resolved_patterns: 0
    };
    members.push(member);
    saveMembers(members);
    console.log(`New member registered: ${name}`);
  }
  return member;
}

// ── Pattern Extraction from Class Data ─────────────────────────────────────────

function extractPatternsFromClassData(classDir) {
  const recordPath = join(classDir, 'class-record.md');
  const dataPath = join(classDir, 'class-data.json');

  if (!existsSync(recordPath)) {
    console.error(`No class-record.md in ${classDir}`);
    return null;
  }

  const record = readFileSync(recordPath, 'utf8');
  const classData = existsSync(dataPath) ? JSON.parse(readFileSync(dataPath, 'utf8')) : {};

  const extracted = {
    classId: classData.id || null,
    date: classData.date || new Date().toISOString().slice(0, 10),
    video: classData.video || null,
    patterns: [],
    strengths: [],
    unresolved: []
  };

  // Extract recurring patterns (strengths and issues)
  const patternSection = record.match(/## Recurring Movement Patterns\n([\s\S]*?)(?=\n## )/);
  if (patternSection) {
    const lines = patternSection[1].split('\n').filter(l => l.startsWith('- **'));
    for (const line of lines) {
      const nameMatch = line.match(/\*\*(.+?)\*\*/);
      const windowsMatch = line.match(/seen at[:\s]*(.+?)[\.\n]/i);
      if (nameMatch) {
        extracted.strengths.push({
          name: nameMatch[1],
          windows: windowsMatch ? windowsMatch[1].trim() : '',
          raw: line
        });
      }
    }
  }

  // Extract unresolved issues (these become patterns to track)
  const unresolvedSection = record.match(/## Unresolved Issues\n([\s\S]*?)(?=\n## )/);
  if (unresolvedSection) {
    const lines = unresolvedSection[1].split('\n').filter(l => l.startsWith('- **'));
    for (const line of lines) {
      const nameMatch = line.match(/\*\*(.+?)\*\*/);
      const detail = line.replace(/^- \*\*.+?\*\*[:\s]*/, '').trim();
      if (nameMatch) {
        extracted.unresolved.push({
          name: nameMatch[1],
          detail,
          category: categorizePattern(nameMatch[1])
        });
      }
    }
  }

  return extracted;
}

function isSamePattern(existingName, newName) {
  const a = existingName.toLowerCase();
  const b = newName.toLowerCase();
  if (a === b) return true;
  const aWords = new Set(a.split(/\s+/));
  const bWords = new Set(b.split(/\s+/));
  const intersection = [...aWords].filter(w => bWords.has(w) && w.length > 3);
  const union = new Set([...aWords, ...bWords]);
  return intersection.length / union.size > 0.4;
}

function categorizePattern(name) {
  const lower = name.toLowerCase();
  if (lower.includes('guard') && (lower.includes('drop') || lower.includes('lower'))) return 'guard_drop';
  if (lower.includes('guard') && lower.includes('recover')) return 'guard_recovery';
  if (lower.includes('stance') && (lower.includes('narrow') || lower.includes('wide') || lower.includes('cross'))) return 'stance_instability';
  if (lower.includes('balance')) return 'balance_loss';
  if (lower.includes('foot') && lower.includes('cross')) return 'foot_crossing';
  if (lower.includes('overext') || lower.includes('over-ext') || lower.includes('reach')) return 'overextension';
  if (lower.includes('telegraph')) return 'telegraphing';
  if (lower.includes('variety') || lower.includes('reliance') || lower.includes('over-reliance')) return 'punch_variety';
  if (lower.includes('rhythm')) return 'rhythm_consistency';
  if (lower.includes('distance')) return 'distance_control';
  if (lower.includes('exit')) return 'exit_structure';
  if (lower.includes('power')) return 'power_generation';
  if (lower.includes('head')) return 'head_movement';
  if (lower.includes('weight')) return 'weight_transfer';
  if (lower.includes('reset')) return 'reset_quality';
  if (lower.includes('fatigue') || lower.includes('burst')) return 'fatigue_pattern';
  if (lower.includes('output') || lower.includes('volume') || lower.includes('low output')) return 'low_output';
  if (lower.includes('stance') && lower.includes('clar')) return 'stance_clarity';
  if (lower.includes('stance') && lower.includes('switch')) return 'stance_switching';
  return 'default';
}

// ── Pattern Lifecycle Management ───────────────────────────────────────────────

function computePriority(pattern, memberBlock) {
  const freq = Math.min(pattern.frequency / 5, 1);
  const persistence = pattern.sessions_seen / Math.max(pattern.total_member_sessions, 1);
  const importance = IMPORTANCE_WEIGHTS[pattern.category] || IMPORTANCE_WEIGHTS.default;

  let trend = 0;
  if (pattern.trend === 'worsening') trend = 0.3;
  else if (pattern.trend === 'stable') trend = 0;
  else if (pattern.trend === 'improving') trend = -0.2;

  // Block relevance: patterns at or below member's current block edge matter most
  // Patterns ahead of them are noise — not yet relevant
  let blockWeight = 1.0;
  const patternBlock = pattern.block || null;
  if (patternBlock !== null && memberBlock) {
    if (patternBlock <= memberBlock) {
      // At or below current level — these should be addressed
      // Patterns at the exact edge get a boost
      blockWeight = patternBlock === memberBlock ? 1.3 : 1.0;
    } else if (patternBlock === memberBlock + 1) {
      // One block ahead — relevant preview, slight discount
      blockWeight = 0.7;
    } else {
      // Multiple blocks ahead — noise, heavy discount
      blockWeight = 0.2;
    }
  }

  return Math.round((freq * persistence * importance * (1 + trend) * blockWeight) * 100) / 100;
}

function ingestClassForMember(classDir, memberName) {
  const extracted = extractPatternsFromClassData(classDir);
  if (!extracted) return;

  const member = findOrCreateMember(memberName);
  const patterns = loadPatterns();
  const milestones = loadMilestones();

  // Record session
  const sessionEntry = {
    classId: extracted.classId,
    date: extracted.date,
    video: extracted.video,
    classDir
  };

  if (!member.sessions.find(s => s.classId === extracted.classId)) {
    member.sessions.push(sessionEntry);
    member.total_sessions = member.sessions.length;
  }

  // Process unresolved issues → patterns
  for (const issue of extracted.unresolved) {
    const existing = patterns.find(p =>
      p.member_id === member.id &&
      p.category === issue.category &&
      p.status !== 'RESOLVED'
    );

    if (existing && isSamePattern(existing.name, issue.name)) {
      // Pattern seen again
      existing.sessions_seen++;
      existing.last_seen = extracted.date;
      existing.total_member_sessions = member.total_sessions;
      existing.observations.push({
        date: extracted.date,
        classId: extracted.classId,
        detail: issue.detail
      });

      // Auto-advance lifecycle
      if (existing.status === 'DETECTED' && existing.sessions_seen >= 2) {
        existing.status = 'RECURRING';
        existing.status_changed = extracted.date;
        console.log(`  Pattern RECURRING: ${existing.name} (${existing.sessions_seen} sessions)`);
      }

      // Compute trend from last 3 observations
      if (existing.observations.length >= 3) {
        const recent = existing.observations.slice(-3);
        existing.trend = detectTrend(recent);
      }

      existing.frequency = existing.observations.length;
      if (!existing.block) {
        const blockInfo = BLOCK_MAP[existing.category] || BLOCK_MAP.default;
        existing.block = blockInfo.block;
        existing.block_name = blockInfo.name;
        existing.block_reason = blockInfo.reason;
      }
      existing.priority = computePriority(existing, member.current_block);

      // Auto-prioritise if score exceeds threshold
      if (existing.status === 'RECURRING' && existing.priority >= 0.3) {
        existing.status = 'PRIORITISED';
        existing.status_changed = extracted.date;
        console.log(`  Pattern PRIORITISED: ${existing.name} (priority: ${existing.priority})`);
      }
    } else {
      // New pattern
      const blockInfo = BLOCK_MAP[issue.category] || BLOCK_MAP.default;
      const newPattern = {
        id: `pat-${member.slug}-${issue.category}-${Date.now()}`,
        member_id: member.id,
        member_name: member.name,
        name: issue.name,
        category: issue.category,
        block: blockInfo.block,
        block_name: blockInfo.name,
        block_reason: blockInfo.reason,
        status: 'DETECTED',
        status_changed: extracted.date,
        first_seen: extracted.date,
        last_seen: extracted.date,
        sessions_seen: 1,
        total_member_sessions: member.total_sessions,
        frequency: 1,
        trend: 'new',
        priority: 0,
        observations: [{
          date: extracted.date,
          classId: extracted.classId,
          detail: issue.detail
        }],
        interventions: []
      };
      newPattern.priority = computePriority(newPattern, member.current_block);
      patterns.push(newPattern);
      console.log(`  Pattern DETECTED: ${issue.name} [${issue.category}]`);
    }
  }

  // Process strengths → potential milestones
  for (const strength of extracted.strengths) {
    const cat = categorizePattern(strength.name);
    const resolvedPattern = patterns.find(p =>
      p.member_id === member.id &&
      p.category === cat &&
      (p.status === 'MONITORING' || p.status === 'IMPROVED')
    );

    if (resolvedPattern) {
      // Something that was a problem is now appearing as a strength
      resolvedPattern.status = 'IMPROVED';
      resolvedPattern.status_changed = extracted.date;
      console.log(`  Pattern IMPROVED: ${resolvedPattern.name}`);

      const existingMilestone = milestones.find(m =>
        m.member_id === member.id && m.pattern_id === resolvedPattern.id
      );
      if (!existingMilestone) {
        milestones.push({
          id: `ms-${member.slug}-${Date.now()}`,
          member_id: member.id,
          member_name: member.name,
          pattern_id: resolvedPattern.id,
          type: 'improvement',
          title: `${strength.name} — now a strength`,
          date: extracted.date,
          detail: `Previously flagged as issue. Now appearing as consistent positive pattern.`
        });
        console.log(`  MILESTONE: ${strength.name} is now a strength`);
      }
    }
  }

  // Update member stats
  member.active_patterns = patterns.filter(p =>
    p.member_id === member.id && !['IMPROVED', 'RESOLVED'].includes(p.status)
  ).length;
  member.resolved_patterns = patterns.filter(p =>
    p.member_id === member.id && ['IMPROVED', 'RESOLVED'].includes(p.status)
  ).length;

  const members = loadMembers();
  const idx = members.findIndex(m => m.id === member.id);
  if (idx >= 0) members[idx] = member;
  saveMembers(members);
  savePatterns(patterns);
  saveMilestones(milestones);

  console.log(`\nIngested ${extracted.classId} for ${memberName}`);
  console.log(`  Issues tracked: ${extracted.unresolved.length}`);
  console.log(`  Strengths noted: ${extracted.strengths.length}`);
  console.log(`  Active patterns: ${member.active_patterns}`);
  console.log(`  Total sessions: ${member.total_sessions}`);
}

function detectTrend(observations) {
  // Simple: compare detail length/severity keywords across observations
  // In production this would be LLM-assisted comparison
  // For now: stable unless keywords suggest change
  const last = observations[observations.length - 1].detail.toLowerCase();
  if (last.includes('improv') || last.includes('better') || last.includes('less frequent')) return 'improving';
  if (last.includes('worse') || last.includes('more frequent') || last.includes('persist')) return 'worsening';
  return 'stable';
}

// ── Intervention Recording ─────────────────────────────────────────────────────

function recordIntervention(patternId, action, drill) {
  const patterns = loadPatterns();
  const interventions = loadInterventions();

  const pattern = patterns.find(p => p.id === patternId);
  if (!pattern) {
    console.error(`Pattern not found: ${patternId}`);
    return;
  }

  const intervention = {
    id: `int-${Date.now()}`,
    pattern_id: patternId,
    member_id: pattern.member_id,
    member_name: pattern.member_name,
    date: new Date().toISOString().slice(0, 10),
    action,
    drill: drill || null,
    outcome: null,
    sessions_since: 0
  };

  interventions.push(intervention);
  pattern.interventions.push(intervention.id);

  if (pattern.status === 'PRIORITISED' || pattern.status === 'RECURRING' || pattern.status === 'DETECTED') {
    pattern.status = 'INTERVENTION';
    pattern.status_changed = intervention.date;
  }

  savePatterns(patterns);
  saveInterventions(interventions);

  console.log(`Intervention recorded for ${pattern.member_name}: ${pattern.name}`);
  console.log(`  Action: ${action}`);
  if (drill) console.log(`  Drill: ${drill}`);
  console.log(`  Status → INTERVENTION`);
  console.log(`  Next: ingest more sessions to track if it resolves`);
}

// ── Coach Attention Queue ──────────────────────────────────────────────────────

function generateAttentionQueue(limit = 5) {
  const patterns = loadPatterns();
  const members = loadMembers();
  const milestones = loadMilestones();

  const queue = [];

  // Prioritised / recurring patterns (needs attention)
  const urgent = patterns
    .filter(p => ['PRIORITISED', 'RECURRING'].includes(p.status))
    .sort((a, b) => b.priority - a.priority);

  for (const p of urgent) {
    if (queue.find(q => q.member_id === p.member_id && q.type === 'attention')) continue;
    queue.push({
      type: 'attention',
      priority: 'high',
      member_id: p.member_id,
      member_name: p.member_name,
      reason: `${p.name} — ${p.sessions_seen} sessions, ${p.trend}`,
      pattern_id: p.id,
      action: p.status === 'PRIORITISED' ? 'Needs intervention' : 'Monitor closely'
    });
  }

  // Recent improvements (reinforce)
  const recentImproved = patterns
    .filter(p => p.status === 'IMPROVED')
    .sort((a, b) => b.status_changed?.localeCompare(a.status_changed));

  for (const p of recentImproved.slice(0, 3)) {
    if (queue.find(q => q.member_id === p.member_id && q.type === 'improvement')) continue;
    queue.push({
      type: 'improvement',
      priority: 'positive',
      member_id: p.member_id,
      member_name: p.member_name,
      reason: `${p.name} — improved after ${p.interventions.length} interventions`,
      action: 'Reinforce — don\'t over-correct'
    });
  }

  // Monitoring patterns (post-intervention check)
  const monitoring = patterns
    .filter(p => p.status === 'MONITORING' || p.status === 'INTERVENTION')
    .sort((a, b) => b.priority - a.priority);

  for (const p of monitoring.slice(0, 3)) {
    if (queue.find(q => q.member_id === p.member_id)) continue;
    queue.push({
      type: 'monitoring',
      priority: 'watch',
      member_id: p.member_id,
      member_name: p.member_name,
      reason: `${p.name} — intervention given, watching`,
      action: 'Check if pattern persists'
    });
  }

  // Recent milestones (celebrate)
  const recentMs = milestones.slice(-3);
  for (const ms of recentMs) {
    if (queue.find(q => q.member_id === ms.member_id)) continue;
    queue.push({
      type: 'milestone',
      priority: 'celebrate',
      member_id: ms.member_id,
      member_name: ms.member_name,
      reason: ms.title,
      action: 'Acknowledge progress'
    });
  }

  // Sort: high first, then positive, then watch, then celebrate
  const priorityOrder = { high: 0, positive: 1, watch: 2, celebrate: 3 };
  queue.sort((a, b) => (priorityOrder[a.priority] || 9) - (priorityOrder[b.priority] || 9));

  return queue.slice(0, limit);
}

// ── Member Status Report ───────────────────────────────────────────────────────

function memberStatus(memberName) {
  const members = loadMembers();
  const slug = memberName.toLowerCase().replace(/\s+/g, '-');
  const member = members.find(m => m.slug === slug);
  if (!member) {
    console.error(`Member not found: ${memberName}`);
    return;
  }

  const patterns = loadPatterns().filter(p => p.member_id === member.id);
  const milestones = loadMilestones().filter(m => m.member_id === member.id);

  const blockDef = BLOCKS.find(b => b.num === member.current_block);
  console.log(`\n═══ ${member.name.toUpperCase()} ═══`);
  console.log(`Member since: ${member.first_seen}`);
  console.log(`Current block: ${member.current_block} — ${blockDef ? blockDef.name.toUpperCase() : '?'} (${blockDef ? blockDef.focus : '?'})`);
  console.log(`Sessions analysed: ${member.total_sessions}`);
  console.log(`Active patterns: ${member.active_patterns}`);
  console.log(`Resolved: ${member.resolved_patterns}`);

  const active = patterns.filter(p => !['IMPROVED', 'RESOLVED'].includes(p.status));
  if (active.length) {
    console.log(`\n── Active Patterns ──`);
    for (const p of active.sort((a, b) => b.priority - a.priority)) {
      const icon = p.status === 'PRIORITISED' ? '🔴' :
                   p.status === 'INTERVENTION' ? '🟡' :
                   p.status === 'MONITORING' ? '🔵' :
                   p.status === 'RECURRING' ? '🟠' : '⚪';
      const blockLabel = p.block ? `Block ${p.block} (${p.block_name})` : 'Unmapped';
      console.log(`${icon} [${p.status}] ${p.name}`);
      console.log(`   ${blockLabel} | Sessions: ${p.sessions_seen}/${member.total_sessions} | Priority: ${p.priority} | Trend: ${p.trend}`);
      if (p.interventions.length) console.log(`   Interventions: ${p.interventions.length}`);
    }
  }

  const resolved = patterns.filter(p => ['IMPROVED', 'RESOLVED'].includes(p.status));
  if (resolved.length) {
    console.log(`\n── Resolved ──`);
    for (const p of resolved) {
      console.log(`✅ ${p.name} (${p.first_seen} → ${p.status_changed})`);
    }
  }

  if (milestones.length) {
    console.log(`\n── Milestones ──`);
    for (const ms of milestones) {
      console.log(`🏆 ${ms.date}: ${ms.title}`);
    }
  }
}

// ── Coach Morning Brief ────────────────────────────────────────────────────────

function coachBrief() {
  const queue = generateAttentionQueue(8);
  const members = loadMembers();
  const patterns = loadPatterns();

  const icons = { high: '🔴', positive: '🟢', watch: '🔵', celebrate: '⭐' };

  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║   COACH ATTENTION — ${new Date().toISOString().slice(0, 10)}     ║`);
  console.log(`╚══════════════════════════════════════╝\n`);

  if (queue.length === 0) {
    console.log('No items requiring attention. All clear.');
    return;
  }

  for (const item of queue) {
    const icon = icons[item.priority] || '•';
    console.log(`${icon} ${item.member_name.toUpperCase()}`);
    console.log(`  ${item.reason}`);
    console.log(`  → ${item.action}`);
    console.log('');
  }

  // Summary stats
  const activeCount = patterns.filter(p => !['IMPROVED', 'RESOLVED'].includes(p.status)).length;
  const memberCount = members.length;
  console.log(`─────────────────────────────────────`);
  console.log(`Members tracked: ${memberCount} | Active patterns: ${activeCount}`);
}

// ── CLI ────────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0];
  const opts = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--member' && args[i + 1]) opts.member = args[++i];
    else if (args[i] === '--action' && args[i + 1]) opts.action = args[++i];
    else if (args[i] === '--drill' && args[i + 1]) opts.drill = args[++i];
    else if (args[i] === '--limit' && args[i + 1]) opts.limit = parseInt(args[++i]);
    else if (args[i] === '--months' && args[i + 1]) opts.months = parseInt(args[++i]);
    else if (args[i] === '--block' && args[i + 1]) opts.block = parseInt(args[++i]);
    else if (!args[i].startsWith('--')) opts.target = args[i];
  }

  return { command, ...opts };
}

function printUsage() {
  console.log(`
Gym Eyes Pattern Ledger — The Memory Layer

  Gym Eyes sees. The Pattern Ledger remembers.
  The Priority Engine decides what matters. The Coach decides what to do.

Commands:
  ingest <class-dir> --member <name>    Ingest class harvest, track patterns against 10 Blocks
  status <member-name>                  Show member status (block, patterns, milestones)
  queue [--limit N]                     Coach attention queue (default: 5)
  intervene <pattern-id> --action "..." Record a coaching intervention
  set-block <member-name> --block N     Set member's current block (1-10)
  brief                                 Morning coaching briefing
  members                               List all tracked members
  patterns [--member <name>]            List all patterns with block addresses

Examples:
  node gym-eyes-pattern-ledger.js ingest ~/nanoclaw/gym-eyes-classes/Tsewei\\ amy-20260825T0646 --member "Tsewei"
  node gym-eyes-pattern-ledger.js set-block Tsewei --block 3
  node gym-eyes-pattern-ledger.js status Tsewei
  node gym-eyes-pattern-ledger.js intervene pat-tsewei-guard_drop-123 --action "Recovery cue: return hand before feet"
  node gym-eyes-pattern-ledger.js brief
`);
}

const { command, target, member, action, drill, limit, block } = parseArgs();

switch (command) {
  case 'ingest':
    if (!target || !member) { console.error('Usage: ingest <class-dir> --member <name>'); break; }
    ingestClassForMember(target, member);
    break;
  case 'status':
    memberStatus(target || member || '');
    break;
  case 'queue':
    const q = generateAttentionQueue(limit || 5);
    if (q.length === 0) { console.log('Queue empty — no patterns tracked yet.'); break; }
    const icons = { high: '🔴', positive: '🟢', watch: '🔵', celebrate: '⭐' };
    for (const item of q) {
      console.log(`${icons[item.priority] || '•'} ${item.member_name}: ${item.reason} → ${item.action}`);
    }
    break;
  case 'intervene':
    if (!target || !action) { console.error('Usage: intervene <pattern-id> --action "..."'); break; }
    recordIntervention(target, action, drill);
    break;
  case 'brief':
    coachBrief();
    break;
  case 'members': {
    const ms = loadMembers();
    if (ms.length === 0) { console.log('No members tracked yet.'); break; }
    for (const m of ms) {
      console.log(`${m.name} — ${m.total_sessions} sessions, ${m.active_patterns} active, ${m.resolved_patterns} resolved`);
    }
    break;
  }
  case 'patterns': {
    const ps = loadPatterns();
    const filtered = member ? ps.filter(p => p.member_name.toLowerCase().includes(member.toLowerCase())) : ps;
    if (filtered.length === 0) { console.log('No patterns tracked yet.'); break; }
    for (const p of filtered.sort((a, b) => b.priority - a.priority)) {
      const bl = p.block ? `B${p.block}` : '?';
      console.log(`[${p.status}] ${p.member_name}: ${p.name} — ${bl} | priority: ${p.priority}, seen: ${p.sessions_seen}x, trend: ${p.trend}`);
    }
    break;
  }
  case 'set-block': {
    if (!target || !block) { console.error('Usage: set-block <member-name> --block <1-10>'); break; }
    const allMembers = loadMembers();
    const memberSlug = target.toLowerCase().replace(/\s+/g, '-');
    const found = allMembers.find(m => m.slug === memberSlug);
    if (!found) { console.error(`Member not found: ${target}`); break; }
    const oldBlock = found.current_block;
    found.current_block = block;
    saveMembers(allMembers);
    const blockDef = BLOCKS.find(b => b.num === block);
    console.log(`${found.name}: Block ${oldBlock} → Block ${block} (${blockDef ? blockDef.name : '?'})`);
    // Recompute all pattern priorities with new block
    const allPatterns = loadPatterns();
    let recomputed = 0;
    for (const p of allPatterns.filter(pp => pp.member_id === found.id)) {
      p.priority = computePriority(p, block);
      recomputed++;
    }
    savePatterns(allPatterns);
    console.log(`Recomputed priority for ${recomputed} patterns`);
    break;
  }
  default:
    printUsage();
}
