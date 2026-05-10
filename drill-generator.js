// drill-generator.js — Personalized drill prescriptions
// ESM module. Balmaseda error-correction FIRST, then combo generation.
// No LLM for corrections — pure lookup + validator.

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { getMemberProgress, BLOCKS } from './curriculum-tracker.js';
import { validatePunchCombo, PUNCHES } from './combination-validator.js';

const HOME = process.env.HOME;
const DB_PATH = path.join(HOME, 'nanoclaw', 'vortex_data', 'metrics.db');
const CORPUS_DIR = path.join(HOME, 'boxing-corpus');

// ── Balmaseda Error-Correction Lookup ───────────────────────────────────────
// Parsed from vault file at startup. No LLM.

const CORRECTIONS = [
  // Guard errors
  { flag: 'guard_drop',             block_min: 1, priority: 'high',   drill: 'Shadow boxing 3x2min. Partner calls "guard" randomly — hands at chin within 0.5s.' },
  { flag: 'guard_drop_after_cross', block_min: 3, priority: 'high',   drill: 'Cross-and-hold: throw cross, freeze at extension. Partner checks chin-to-shoulder + guard hand. 10 reps each side.' },
  { flag: 'guard_drop_sustained',   block_min: 1, priority: 'high',   drill: 'Wall drill: back to wall, elbows at guard height. Shadow punch, elbows return to wall. 3x1min.' },
  { flag: 'chin_up',               block_min: 2, priority: 'high',   drill: 'Cross with chin-to-shoulder cue. Partner checks from side at extension. 10 reps. Progress to hooks.' },
  // Punch errors — straights
  { flag: 'elbow_flare_straight',  block_min: 3, priority: 'medium', drill: 'Resistance band from wrist to hip. Throw straights — band pulls elbow down if it flares. 20 reps.' },
  { flag: 'telegraph_jab',         block_min: 3, priority: 'medium', drill: 'Mirror drill: shadow jab, watch for shoulder movement before punch. Partner calls "tell" on prep. 3x1min.' },
  { flag: 'overreach_cross',       block_min: 3, priority: 'medium', drill: 'Floor tape at front foot. Throw cross — knee must not pass tape. 20 reps.' },
  { flag: 'no_hip_rotation_cross', block_min: 3, priority: 'medium', drill: 'Hip isolation: hands on hips, rotate to cross position. Add punch when rotation is consistent. 10+10 reps.' },
  // Punch errors — hooks
  { flag: 'elbow_flare_hook',      block_min: 4, priority: 'medium', drill: 'Wall drill: arm length from wall, throw hook. If elbow touches wall, too high. 20 reps each side.' },
  { flag: 'wide_hook',             block_min: 4, priority: 'medium', drill: 'Shadow hook with towel under arm. If towel drops, hook is too wide. 3x2min.' },
  { flag: 'hook_no_pivot',         block_min: 4, priority: 'medium', drill: 'Pivot-only: no punch, just foot pivot + hip rotation. Add hook when pivot is automatic. 20 reps.' },
  // Body punch errors
  { flag: 'telegraph_level_change',block_min: 4, priority: 'medium', drill: 'Level change without punch: drop, return to guard. Partner watches for shoulder/head tell. 20 reps.' },
  { flag: 'head_drops_body_shot',  block_min: 4, priority: 'medium', drill: 'Pad drill: coach holds pad at body height + spare hand at head height. Head drops into hand = error. 10 reps.' },
  // Stance errors
  { flag: 'stance_width_narrow',   block_min: 1, priority: 'medium', drill: 'Floor tape markers at shoulder width. Step and check. 10min warm-up integration.' },
  { flag: 'stance_width_wide',     block_min: 1, priority: 'low',    drill: 'Same floor tape. Partner pushes lightly — wide stance can\'t recover balance. 10 reps.' },
  { flag: 'flat_footed',           block_min: 1, priority: 'medium', drill: 'Penny under rear heel. Balance on metatarsus without crushing penny. Shadow box 3x2min.' },
  // Defense errors
  { flag: 'late_guard_return',     block_min: 3, priority: 'high',   drill: 'Metronome drill: single punch on beat, guard returns before next beat. 60→100 BPM. 3x1min.' },
];

// ── Block-Appropriate Punch Sets ────────────────────────────────────────────

const BLOCK_PUNCHES = {
  1: [],  // No punches
  2: [],  // No punches
  3: ['jab', 'cross', 'jab_body', 'rear_body'],
  4: ['jab', 'cross', 'jab_body', 'rear_body', 'lead_hook', 'rear_hook', 'lead_body', 'lead_uppercut', 'rear_uppercut', 'overhand'],
  5: ['jab', 'cross', 'jab_body', 'rear_body', 'lead_hook', 'rear_hook', 'lead_body', 'lead_uppercut', 'rear_uppercut', 'overhand'],
  6: ['jab', 'cross', 'jab_body', 'rear_body', 'lead_hook', 'rear_hook', 'lead_body', 'lead_uppercut', 'rear_uppercut', 'overhand'],
  7: ['jab', 'cross', 'jab_body', 'rear_body', 'lead_hook', 'rear_hook', 'lead_body', 'lead_uppercut', 'rear_uppercut', 'overhand'],
  8: ['jab', 'cross', 'jab_body', 'rear_body', 'lead_hook', 'rear_hook', 'lead_body', 'lead_uppercut', 'rear_uppercut', 'overhand'],
  9: ['jab', 'cross', 'jab_body', 'rear_body', 'lead_hook', 'rear_hook', 'lead_body', 'lead_uppercut', 'rear_uppercut', 'overhand'],
  10: ['jab', 'cross', 'jab_body', 'rear_body', 'lead_hook', 'rear_hook', 'lead_body', 'lead_uppercut', 'rear_uppercut', 'overhand'],
};

const BLOCK_MAX_COMBO = { 1: 0, 2: 0, 3: 2, 4: 3, 5: 5, 6: 5, 7: 5, 8: 5, 9: 6, 10: 8 };

// ── Get Member's YOLO Weaknesses ────────────────────────────────────────────

function getRecentWeaknesses(name, maxSessions = 5) {
  const db = new Database(DB_PATH);

  // Get recent sessions for this member
  const sessions = db.prepare(`
    SELECT i.movement_json, i.category, i.standard_name
    FROM intake_log i
    JOIN attendance a ON i.standard_name = a.video_file
    WHERE a.member_name = ? AND i.movement_json IS NOT NULL
    ORDER BY i.processed_at DESC LIMIT ?
  `).all(name, maxSessions);

  db.close();

  const flagCounts = {};
  let totalPunches = 0;
  let totalGuardDrops = 0;
  let totalVelocity = 0;
  let velocitySamples = 0;

  for (const session of sessions) {
    if (!session.movement_json || !fs.existsSync(session.movement_json)) continue;

    try {
      const data = JSON.parse(fs.readFileSync(session.movement_json, 'utf-8'));
      const flags = data.technique_flags || [];
      const punches = data.punches_detected || [];

      totalPunches += punches.length;
      for (const p of punches) {
        if (p.velocity) { totalVelocity += p.velocity; velocitySamples++; }
      }

      for (const f of flags) {
        flagCounts[f.flag] = (flagCounts[f.flag] || 0) + 1;
        if (f.flag === 'guard_drop') totalGuardDrops++;
      }
    } catch {}
  }

  return {
    sessions_analyzed: sessions.length,
    flag_counts: flagCounts,
    total_punches: totalPunches,
    total_guard_drops: totalGuardDrops,
    avg_velocity: velocitySamples > 0 ? Math.round(totalVelocity / velocitySamples) : 0,
    guard_drop_rate: totalPunches > 0 ? Math.round(totalGuardDrops / totalPunches * 1000) / 10 : 0
  };
}

// ── Generate Combos for Block ───────────────────────────────────────────────

function generateBlockCombos(block, count = 3) {
  const available = BLOCK_PUNCHES[block] || [];
  const maxLen = BLOCK_MAX_COMBO[block] || 0;

  if (available.length === 0 || maxLen === 0) return [];

  const combos = [];
  const tried = new Set();
  let attempts = 0;

  while (combos.length < count && attempts < 100) {
    attempts++;
    const len = Math.min(maxLen, 2 + Math.floor(Math.random() * (maxLen - 1)));
    const combo = [];

    // Start with jab most of the time (Cuban teaching)
    if (Math.random() < 0.7 && available.includes('jab')) {
      combo.push('jab');
    } else {
      combo.push(available[Math.floor(Math.random() * available.length)]);
    }

    // Build rest of combo
    for (let i = 1; i < len; i++) {
      const candidates = available.filter(p => p !== combo[combo.length - 1] || p === 'jab');
      combo.push(candidates[Math.floor(Math.random() * candidates.length)]);
    }

    const key = combo.join('-');
    if (tried.has(key)) continue;
    tried.add(key);

    // Validate with combination-validator
    const result = validatePunchCombo(combo);
    if (result.valid) {
      combos.push({
        combo,
        display: combo.map(p => p.replace(/_/g, ' ')).join(' → '),
        weightTrace: result.weightTrace,
        type: result.comboType
      });
    }
  }

  return combos;
}

// ── Generate Full Drill Sheet ───────────────────────────────────────────────

export function generateDrill(name) {
  const progress = getMemberProgress(name);
  const block = progress.current_block;
  const weaknesses = getRecentWeaknesses(name);

  const drill = {
    name,
    date: new Date().toISOString().split('T')[0],
    block,
    block_name: progress.block_name,
    sections: []
  };

  // Section 1: Balmaseda corrections (FIRST — lookup, no LLM)
  const corrections = [];
  for (const [flag, count] of Object.entries(weaknesses.flag_counts)) {
    const correction = CORRECTIONS.find(c => c.flag === flag && c.block_min <= block);
    if (correction && count >= 2) {  // Only flag if occurred 2+ times
      corrections.push({
        flag,
        count,
        priority: correction.priority,
        drill: correction.drill
      });
    }
  }

  // Sort by priority
  corrections.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return (order[a.priority] || 3) - (order[b.priority] || 3);
  });

  if (corrections.length > 0) {
    drill.sections.push({
      title: 'Correction Drills',
      subtitle: 'From YOLO analysis — address these first',
      items: corrections.slice(0, 4)  // Max 4 corrections per session
    });
  }

  // Section 2: Block-appropriate combinations
  if (block >= 3) {
    const combos = generateBlockCombos(block, 4);
    if (combos.length > 0) {
      drill.sections.push({
        title: `Block ${block} Combinations`,
        subtitle: `Max ${BLOCK_MAX_COMBO[block]} punches. Practice on pads, shadow, then bag.`,
        items: combos.map(c => ({
          combo: c.display,
          weight_trace: c.weightTrace.join(' → '),
          type: c.type,
          drill: `3x each: shadow → pads → bag. Guard returns between every combo.`
        }))
      });
    }
  }

  // Section 3: Focus area based on weakness data
  if (weaknesses.guard_drop_rate > 5) {
    drill.sections.push({
      title: 'Guard Discipline Focus',
      subtitle: `Guard drop rate: ${weaknesses.guard_drop_rate}% — target <3%`,
      items: [{
        drill: 'Every combination this session: pause 1 second at guard after completion before next combo. Coach checks chin-to-shoulder and lead hand position.',
        priority: 'session-wide'
      }]
    });
  }

  if (weaknesses.avg_velocity > 0 && weaknesses.avg_velocity < 140) {
    drill.sections.push({
      title: 'Power Development',
      subtitle: `Avg velocity: ${weaknesses.avg_velocity} — target 160+`,
      items: [{
        drill: 'Hip rotation focus: throw 10 crosses at 50% speed, full hip rotation. Increase to 70%, then 100%. Power comes from rotation, not arms.',
        priority: 'medium'
      }]
    });
  }

  // Section 4: Block-specific focus
  if (block <= 2) {
    drill.sections.push({
      title: 'Foundation Focus',
      subtitle: block === 1 ? 'Guard position mastery' : 'Footwork fundamentals',
      items: [{
        drill: block === 1
          ? '3x3min rounds: shadow movement maintaining guard. Eyes above lead knuckles. Chin on shoulder. No tension.'
          : '4-direction flat step drill: forward, back, left, right. Maintain guard throughout. 3x2min.'
      }]
    });
  }

  // Summary stats
  drill.weakness_summary = {
    sessions_analyzed: weaknesses.sessions_analyzed,
    total_punches: weaknesses.total_punches,
    guard_drops: weaknesses.total_guard_drops,
    guard_drop_rate: weaknesses.guard_drop_rate,
    avg_velocity: weaknesses.avg_velocity,
    flags_detected: Object.keys(weaknesses.flag_counts).length
  };

  return drill;
}

// ── Telegram Formatting ─────────────────────────────────────────────────────

export function formatDrillTelegram(name) {
  const drill = generateDrill(name);

  let msg = `*${name} — Today's Drill*\n`;
  msg += `Block ${drill.block}: ${drill.block_name}\n`;
  msg += `${drill.date}\n\n`;

  if (drill.sections.length === 0) {
    msg += 'No YOLO data yet. Start training with the camera to get personalized drills.\n';
    return msg;
  }

  for (const section of drill.sections) {
    msg += `*${section.title}*\n`;
    if (section.subtitle) msg += `_${section.subtitle}_\n`;

    for (const item of section.items) {
      if (item.flag) {
        // Correction drill
        const icon = item.priority === 'high' ? '🔴' : item.priority === 'medium' ? '🟡' : '🟢';
        msg += `${icon} \`${item.flag}\` (${item.count}x)\n`;
        msg += `   ${item.drill}\n`;
      } else if (item.combo) {
        // Combination
        msg += `  ${item.combo}\n`;
        msg += `   _${item.weight_trace}_\n`;
        msg += `   ${item.drill}\n`;
      } else {
        // General drill
        msg += `  ${item.drill}\n`;
      }
    }
    msg += '\n';
  }

  // Stats footer
  const ws = drill.weakness_summary;
  if (ws.sessions_analyzed > 0) {
    msg += `_Based on ${ws.sessions_analyzed} sessions, ${ws.total_punches} punches_`;
  }

  return msg;
}

// ── Log Generated Drills ────────────────────────────────────────────────────

export function logDrill(name, drill) {
  const db = new Database(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS drill_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_name TEXT NOT NULL,
      block INTEGER,
      drill_json TEXT,
      generated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.prepare('INSERT INTO drill_history (member_name, block, drill_json) VALUES (?, ?, ?)').run(
    name, drill.block, JSON.stringify(drill)
  );
  db.close();
}

export default {
  generateDrill,
  formatDrillTelegram,
  logDrill,
  CORRECTIONS,
  BLOCK_PUNCHES,
  BLOCK_MAX_COMBO
};
