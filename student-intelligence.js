// student-intelligence.js — AI Coaching Dashboard
// ESM module
// Per-student progress tracking: attendance, technique, combos, coaching notes
// Data sources: PunchPass CSV, combo-logger SQLite, Gym Eyes, manual notes

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const HOME = process.env.HOME;
const SI_DIR = path.join(HOME, 'nanoclaw', 'student-intelligence');
const PROFILES_DIR = path.join(SI_DIR, 'profiles');
const CSV_INBOX = path.join(SI_DIR, 'csv-inbox');
const DB_PATH = path.join(HOME, 'nanoclaw', 'vortex_data', 'metrics.db');
const GYM_EYES_OUTPUT = path.join(HOME, 'nanoclaw', 'gym-eyes', 'output');

// ── Student Profile Model ───────────────────────────────────────────────────

function createEmptyProfile(name) {
  return {
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    attendance: {
      total_classes: 0,
      last_30_days: 0,
      trend: 'new',
      history: [], // [{ date, class_type }]
      favourite_day: null
    },
    membership: {
      status: 'unknown',
      type: null,
      expiry: null
    },
    technique: {
      guard_return: [],   // [{ date, score }]
      guard_height: [],
      stance_width: [],
      punch_velocity: [],
      overall_scores: []  // [{ date, score }]
    },
    combos: {
      history: [],  // [{ date, combo, count }]
      most_thrown: null,
      variety_score: 0
    },
    coaching_notes: [], // [{ date, note, author }]
    risk_level: 'unknown', // green / yellow / red
    recommended_focus: []
  };
}

// ── Profile Management ──────────────────────────────────────────────────────

function profilePath(slug) {
  return path.join(PROFILES_DIR, `${slug}.json`);
}

export function loadProfile(name) {
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  const fp = profilePath(slug);
  if (fs.existsSync(fp)) {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  }
  return null;
}

export function saveProfile(profile) {
  profile.updatedAt = new Date().toISOString();
  const fp = profilePath(profile.slug);
  fs.writeFileSync(fp, JSON.stringify(profile, null, 2));
}

export function getOrCreateProfile(name) {
  let profile = loadProfile(name);
  if (!profile) {
    profile = createEmptyProfile(name);
    saveProfile(profile);
  }
  return profile;
}

export function listAllProfiles() {
  try {
    return fs.readdirSync(PROFILES_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          return JSON.parse(fs.readFileSync(path.join(PROFILES_DIR, f), 'utf8'));
        } catch { return null; }
      })
      .filter(Boolean);
  } catch { return []; }
}

// ── PunchPass CSV Import ────────────────────────────────────────────────────

/**
 * Import PunchPass CSV export
 * Expected columns: name, email, phone, pass_type, expiry, classes_attended, last_class
 * Flexible — handles various CSV formats from PunchPass
 */
export function importPunchPassCSV(csvPath) {
  if (!fs.existsSync(csvPath)) throw new Error(`CSV not found: ${csvPath}`);

  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw.split('\n').filter(l => l.trim());
  if (lines.length < 2) throw new Error('CSV has no data rows');

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  const imported = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < 2) continue;

    const row = {};
    headers.forEach((h, idx) => { row[h] = values[idx]?.trim().replace(/^["']|["']$/g, '') || ''; });

    // Find name column (various PunchPass formats)
    const name = row.name || row.client || row['client name'] || row['full name'] || row.first_name;
    if (!name) continue;

    const profile = getOrCreateProfile(name);

    // Update membership
    if (row.pass_type || row['pass type'] || row.membership) {
      profile.membership.type = row.pass_type || row['pass type'] || row.membership;
    }
    if (row.expiry || row['expiry date'] || row.expires) {
      profile.membership.expiry = row.expiry || row['expiry date'] || row.expires;
      profile.membership.status = isExpired(profile.membership.expiry) ? 'expired' : 'active';
    }

    // Update attendance
    const classes = parseInt(row.classes_attended || row.classes || row['total classes'] || '0');
    if (classes > 0) profile.attendance.total_classes = classes;

    const lastClass = row.last_class || row['last visit'] || row['last attended'];
    if (lastClass) {
      const lastDate = new Date(lastClass);
      const daysSince = Math.floor((Date.now() - lastDate) / (1000 * 60 * 60 * 24));
      if (daysSince > 30) profile.risk_level = 'red';
      else if (daysSince > 14) profile.risk_level = 'yellow';
      else profile.risk_level = 'green';
    }

    saveProfile(profile);
    imported.push(name);
  }

  return { imported: imported.length, names: imported };
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; continue; }
    if (char === ',' && !inQuotes) { result.push(current); current = ''; continue; }
    current += char;
  }
  result.push(current);
  return result;
}

function isExpired(dateStr) {
  try {
    return new Date(dateStr) < new Date();
  } catch { return false; }
}

// ── Gym Eyes Integration ────────────────────────────────────────────────────

/**
 * Ingest Gym Eyes analysis into student profile
 * Note: currently assigns to a named student (Paul identifies who in the video)
 */
export function ingestGymEyesAnalysis(studentName, analysisPath) {
  const profile = getOrCreateProfile(studentName);

  let analysis;
  if (typeof analysisPath === 'string') {
    analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
  } else {
    analysis = analysisPath; // already parsed
  }

  const date = analysis._meta?.analyzedAt?.split('T')[0] || new Date().toISOString().split('T')[0];

  // Technique scores
  if (analysis.technique_score) {
    profile.technique.overall_scores.push({ date, score: analysis.technique_score.overall });
    if (analysis.technique_score.details.guard) {
      profile.technique.guard_height.push({ date, score: analysis.technique_score.details.guard.score });
    }
    if (analysis.technique_score.details.velocity) {
      profile.technique.punch_velocity.push({ date, score: analysis.technique_score.details.velocity.score });
    }
  }

  // Guard return
  if (analysis.guard_return) {
    profile.technique.guard_return.push({ date, score: analysis.guard_return.rate });
  }

  // Combos
  if (analysis.combos_detected) {
    for (const combo of analysis.combos_detected) {
      profile.combos.history.push({ date, combo: combo.combo, velocity: combo.avgVelocity });
    }
    // Update most thrown
    const comboCounts = {};
    profile.combos.history.forEach(c => { comboCounts[c.combo] = (comboCounts[c.combo] || 0) + 1; });
    const sorted = Object.entries(comboCounts).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) profile.combos.most_thrown = sorted[0][0];
    profile.combos.variety_score = sorted.length;
  }

  // Recommendations from Gym Eyes
  if (analysis.recommendations) {
    profile.recommended_focus = analysis.recommendations.map(r => r.message);
  }

  saveProfile(profile);
  return profile;
}

// ── Coaching Notes ──────────────────────────────────────────────────────────

export function addCoachingNote(studentName, note) {
  const profile = getOrCreateProfile(studentName);
  profile.coaching_notes.push({
    date: new Date().toISOString().split('T')[0],
    note,
    author: 'Paul'
  });
  saveProfile(profile);
  return profile;
}

// ── Churn Prediction ────────────────────────────────────────────────────────

/**
 * Calculate risk level for all students
 */
export function calculateRiskLevels() {
  const profiles = listAllProfiles();
  const atRisk = [];

  for (const profile of profiles) {
    // Check last attendance
    const lastEntry = profile.attendance.history[profile.attendance.history.length - 1];
    if (lastEntry) {
      const daysSince = Math.floor((Date.now() - new Date(lastEntry.date)) / (1000 * 60 * 60 * 24));
      if (daysSince > 30) profile.risk_level = 'red';
      else if (daysSince > 14) profile.risk_level = 'yellow';
      else profile.risk_level = 'green';
    }

    // Technique plateau check
    const scores = profile.technique.overall_scores;
    if (scores.length >= 3) {
      const recent = scores.slice(-3).map(s => s.score);
      const variance = Math.max(...recent) - Math.min(...recent);
      if (variance < 3) {
        // Plateau — not improving
        if (profile.risk_level === 'yellow') profile.risk_level = 'red'; // plateau + absence = high risk
      }
    }

    if (profile.risk_level === 'red' || profile.risk_level === 'yellow') {
      atRisk.push(profile);
    }

    saveProfile(profile);
  }

  return atRisk.sort((a, b) => (a.risk_level === 'red' ? 0 : 1) - (b.risk_level === 'red' ? 0 : 1));
}

// ── Drill Recommender ───────────────────────────────────────────────────────

/**
 * Generate personalized drill recommendations
 */
export function recommendDrills(studentName) {
  const profile = loadProfile(studentName);
  if (!profile) return [`Student "${studentName}" not found. Add with /student ${studentName} note <info>`];

  const recs = [];

  // Guard return
  const guardReturn = profile.technique.guard_return;
  if (guardReturn.length > 0) {
    const latest = guardReturn[guardReturn.length - 1].score;
    if (latest < 70) {
      recs.push(`Guard return ${latest}% — needs work. Drill: slow shadow boxing, exaggerate guard snap-back after every punch. 3 rounds.`);
    }
  }

  // Guard height
  const guardHeight = profile.technique.guard_height;
  if (guardHeight.length > 0) {
    const latest = guardHeight[guardHeight.length - 1].score;
    if (latest < 60) {
      recs.push(`Guard height low (${latest}%). Drill: partner feeds jabs while student keeps guard. Drop guard = partner scores. 2 rounds.`);
    }
  }

  // Combo variety
  if (profile.combos.variety_score <= 2 && profile.combos.history.length > 5) {
    recs.push(`Only ${profile.combos.variety_score} combo types thrown. Introduce: jab-cross-hook, double jab-cross, jab-body-cross. Call combos by number to build vocabulary.`);
  }

  // Velocity
  const velocity = profile.technique.punch_velocity;
  if (velocity.length > 0 && velocity[velocity.length - 1].score < 50) {
    recs.push(`Punch velocity below target. Drill: speed bag 2 rounds (rhythm), then heavy bag focusing on hip rotation for power transfer.`);
  }

  // Coaching notes context
  if (profile.coaching_notes.length > 0) {
    const lastNote = profile.coaching_notes[profile.coaching_notes.length - 1];
    recs.push(`Last coaching note (${lastNote.date}): "${lastNote.note}"`);
  }

  if (recs.length === 0) {
    recs.push('No specific weaknesses flagged. Push for advanced combinations and controlled sparring.');
  }

  return recs;
}

// ── Format for Telegram ─────────────────────────────────────────────────────

export function formatProfileTelegram(profile) {
  const riskIcon = profile.risk_level === 'red' ? '🔴' : profile.risk_level === 'yellow' ? '🟡' : profile.risk_level === 'green' ? '🟢' : '⚪';

  let msg = `👤 *${profile.name}* ${riskIcon}\n`;

  // Attendance
  msg += `\n*Attendance:*\n`;
  msg += `  Classes: ${profile.attendance.total_classes}`;
  if (profile.attendance.last_30_days > 0) msg += ` (${profile.attendance.last_30_days} last 30d)`;
  msg += '\n';
  if (profile.membership.type) msg += `  Pass: ${profile.membership.type}\n`;
  if (profile.membership.status) msg += `  Status: ${profile.membership.status}\n`;
  if (profile.membership.expiry) msg += `  Expiry: ${profile.membership.expiry}\n`;

  // Technique
  const scores = profile.technique.overall_scores;
  if (scores.length > 0) {
    const latest = scores[scores.length - 1];
    const previous = scores.length > 1 ? scores[scores.length - 2] : null;
    const trend = previous ? (latest.score > previous.score ? '📈' : latest.score < previous.score ? '📉' : '➡️') : '';
    msg += `\n*Technique Score:* ${latest.score}/100 ${trend}\n`;

    const gr = profile.technique.guard_return;
    if (gr.length > 0) msg += `  Guard return: ${gr[gr.length - 1].score}%\n`;
    const gh = profile.technique.guard_height;
    if (gh.length > 0) msg += `  Guard height: ${gh[gh.length - 1].score}%\n`;
    const pv = profile.technique.punch_velocity;
    if (pv.length > 0) msg += `  Punch velocity: ${pv[pv.length - 1].score}%\n`;
  }

  // Combos
  if (profile.combos.most_thrown) {
    msg += `\n*Combos:*\n`;
    msg += `  Most thrown: ${profile.combos.most_thrown}\n`;
    msg += `  Variety: ${profile.combos.variety_score} types\n`;
  }

  // Coaching notes
  if (profile.coaching_notes.length > 0) {
    const last = profile.coaching_notes[profile.coaching_notes.length - 1];
    msg += `\n*Last note (${last.date}):*\n  _${last.note}_\n`;
  }

  // Recommendations
  if (profile.recommended_focus.length > 0) {
    msg += `\n*Focus areas:*\n`;
    profile.recommended_focus.slice(0, 3).forEach(r => { msg += `  → ${r}\n`; });
  }

  return msg;
}

export function formatRiskListTelegram(atRisk) {
  if (atRisk.length === 0) return '🟢 No at-risk students.';

  let msg = '⚠️ *At-Risk Students*\n\n';
  for (const p of atRisk) {
    const icon = p.risk_level === 'red' ? '🔴' : '🟡';
    msg += `${icon} *${p.name}*`;
    if (p.attendance.total_classes) msg += ` (${p.attendance.total_classes} classes)`;
    if (p.membership.status === 'expired') msg += ' — EXPIRED';
    msg += '\n';
  }
  return msg;
}

export function formatImprovingTelegram() {
  const profiles = listAllProfiles();
  const improving = profiles
    .filter(p => {
      const scores = p.technique.overall_scores;
      if (scores.length < 2) return false;
      return scores[scores.length - 1].score > scores[scores.length - 2].score;
    })
    .sort((a, b) => {
      const aScores = a.technique.overall_scores;
      const bScores = b.technique.overall_scores;
      const aDelta = aScores[aScores.length - 1].score - aScores[aScores.length - 2].score;
      const bDelta = bScores[bScores.length - 1].score - bScores[bScores.length - 2].score;
      return bDelta - aDelta;
    });

  if (improving.length === 0) return '📊 No improvement data yet. Analyze more videos with Gym Eyes.';

  let msg = '📈 *Improving Students*\n\n';
  for (const p of improving) {
    const scores = p.technique.overall_scores;
    const delta = scores[scores.length - 1].score - scores[scores.length - 2].score;
    msg += `🟢 *${p.name}* — +${delta} points (${scores[scores.length - 1].score}/100)\n`;
  }
  return msg;
}

export function formatStatusTelegram() {
  const profiles = listAllProfiles();
  const atRisk = profiles.filter(p => p.risk_level === 'red' || p.risk_level === 'yellow');

  let msg = '👤 *Student Intelligence*\n\n';
  msg += `Students tracked: ${profiles.length}\n`;
  msg += `At-risk: ${atRisk.length}\n\n`;

  msg += `*Commands:*
\`/student <name>\` — student profile
\`/student <name> focus\` — recommended drills
\`/student <name> note <text>\` — add coaching note
\`/students risk\` — at-risk list
\`/students improving\` — biggest improvers
\`/students all\` — full roster
\`/students import\` — import PunchPass CSV (drop in inbox)
\`/student <name> eyes <analysis_file>\` — ingest Gym Eyes data`;

  return msg;
}

export default {
  getOrCreateProfile,
  loadProfile,
  saveProfile,
  listAllProfiles,
  importPunchPassCSV,
  ingestGymEyesAnalysis,
  addCoachingNote,
  calculateRiskLevels,
  recommendDrills,
  formatProfileTelegram,
  formatRiskListTelegram,
  formatImprovingTelegram,
  formatStatusTelegram
};
