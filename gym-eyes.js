// gym-eyes.js — AI Vision Layer for Basic Reflex
// ESM module
// Orchestrates: YOLO pose extraction → punch classification → combo detection → technique scoring → reports
// Python backend (boxing_movement.py in cathedral-venv), Node.js orchestrator

import fs from 'fs';
import path from 'path';
import { execSync, exec } from 'child_process';

const HOME = process.env.HOME;
const MOVEMENT_SCRIPT = path.join(HOME, 'Cathedral', 'boxing_movement.py');
const VENV_PYTHON = path.join(HOME, 'cathedral-venv', 'bin', 'python3');
const INBOX_DIR = path.join(HOME, 'nanoclaw', 'gym-eyes', 'inbox');
const OUTPUT_DIR = path.join(HOME, 'nanoclaw', 'gym-eyes', 'output');
const CORPUS_MOVEMENT = path.join(HOME, 'boxing-corpus', 'movement');

// ── Canonical Form Reference ────────────────────────────────────────────────
// From Cuban boxing curriculum + technique library

const CANONICAL = {
  guard_height: { target: 0.75, min_acceptable: 0.55, label: 'Guard at chin level' },
  stance_width: { target: 0.15, min: 0.10, max: 0.22, label: 'Shoulder-width stance' },
  weight_distribution: { target: 'center', acceptable: ['center', 'rear'], label: 'Balanced or slight rear weight' },
  guard_return_threshold: 0.6, // guard must return above this after each punch
  punch_velocity: { jab: { good: 150, excellent: 200 }, cross: { good: 160, excellent: 220 }, hook: { good: 140, excellent: 190 } }
};

// ── Video Analysis ──────────────────────────────────────────────────────────

/**
 * Analyze a video using YOLO pose estimation
 * @param {string} videoPath — path to video file
 * @param {string} [category] — category label (default: 'class')
 * @returns {object} movement analysis JSON
 */
export function analyzeVideo(videoPath, category = 'class') {
  if (!fs.existsSync(videoPath)) throw new Error(`Video not found: ${videoPath}`);

  console.log(`[gym-eyes] Analyzing: ${path.basename(videoPath)}`);
  const startMs = Date.now();

  // Run boxing_movement.py in cathedral-venv
  const pythonCmd = fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python3';
  const cmd = `cd "${path.join(HOME, 'Cathedral')}" && "${pythonCmd}" "${MOVEMENT_SCRIPT}" "${videoPath}" "${category}"`;

  try {
    const stdout = execSync(cmd, {
      encoding: 'utf-8',
      timeout: 600000, // 10 min max for long videos
      env: { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: '1' }
    });
    console.log(`[gym-eyes] YOLO output:\n${stdout}`);
  } catch (e) {
    throw new Error(`YOLO processing failed: ${e.message.slice(0, 300)}`);
  }

  // Read the output JSON
  const videoName = path.basename(videoPath, path.extname(videoPath));
  const jsonPath = path.join(CORPUS_MOVEMENT, category, `${videoName}.json`);

  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Analysis output not found: ${jsonPath}`);
  }

  const movement = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const durationMs = Date.now() - startMs;

  // Enrich with Gym Eyes analysis
  const analysis = enrichAnalysis(movement);
  analysis._meta = { processingTimeMs: durationMs, analyzedAt: new Date().toISOString() };

  // Save enriched version
  const enrichedPath = path.join(OUTPUT_DIR, `analysis-${videoName}-${Date.now()}.json`);
  fs.writeFileSync(enrichedPath, JSON.stringify(analysis, null, 2));

  console.log(`[gym-eyes] Analysis complete: ${analysis.punch_summary.total} punches, ${analysis.combos_detected.length} combos (${durationMs}ms)`);

  return analysis;
}

/**
 * Analyze video asynchronously (for Telegram — doesn't block)
 */
export function analyzeVideoAsync(videoPath, category = 'class') {
  return new Promise((resolve, reject) => {
    const pythonCmd = fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python3';
    const cmd = `cd "${path.join(HOME, 'Cathedral')}" && "${pythonCmd}" "${MOVEMENT_SCRIPT}" "${videoPath}" "${category}"`;

    exec(cmd, {
      timeout: 600000,
      env: { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: '1' }
    }, (err, stdout) => {
      if (err) return reject(new Error(`YOLO failed: ${err.message.slice(0, 200)}`));

      const videoName = path.basename(videoPath, path.extname(videoPath));
      const jsonPath = path.join(CORPUS_MOVEMENT, category, `${videoName}.json`);

      try {
        const movement = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        const analysis = enrichAnalysis(movement);
        analysis._meta = { analyzedAt: new Date().toISOString() };

        const enrichedPath = path.join(OUTPUT_DIR, `analysis-${videoName}-${Date.now()}.json`);
        fs.writeFileSync(enrichedPath, JSON.stringify(analysis, null, 2));

        resolve(analysis);
      } catch (e) {
        reject(e);
      }
    });
  });
}

// ── Enrichment: Combos, Technique Scoring ───────────────────────────────────

/**
 * Enrich raw movement data with combo detection + technique scoring
 */
function enrichAnalysis(movement) {
  const analysis = { ...movement };

  // Detect combinations from punch sequences
  analysis.combos_detected = detectCombos(movement.punches_detected || []);
  analysis.combo_summary = {
    total: analysis.combos_detected.length,
    types: {}
  };
  for (const combo of analysis.combos_detected) {
    analysis.combo_summary.types[combo.combo] = (analysis.combo_summary.types[combo.combo] || 0) + 1;
  }

  // Technique scoring
  analysis.technique_score = scoreTechnique(movement);

  // Guard return analysis
  analysis.guard_return = analyzeGuardReturn(movement);

  // Session recommendations
  analysis.recommendations = generateRecommendations(analysis);

  return analysis;
}

/**
 * Detect combinations from sequential punches
 * Window: punches within 1.5 seconds of each other form a combo
 */
function detectCombos(punches) {
  if (punches.length < 2) return [];

  const combos = [];
  let currentCombo = [punches[0]];

  for (let i = 1; i < punches.length; i++) {
    const gap = punches[i].timestamp - punches[i - 1].timestamp;
    if (gap <= 1.5) {
      currentCombo.push(punches[i]);
    } else {
      if (currentCombo.length >= 2) {
        combos.push(buildCombo(currentCombo));
      }
      currentCombo = [punches[i]];
    }
  }
  // Last combo
  if (currentCombo.length >= 2) {
    combos.push(buildCombo(currentCombo));
  }

  return combos;
}

function buildCombo(punches) {
  const types = punches.map(p => p.type);
  const combo = types.join('-');
  const avgVelocity = punches.reduce((s, p) => s + (p.velocity || 0), 0) / punches.length;
  return {
    combo,
    punches: types,
    count: punches.length,
    startTime: punches[0].timestamp,
    endTime: punches[punches.length - 1].timestamp,
    duration: Math.round((punches[punches.length - 1].timestamp - punches[0].timestamp) * 100) / 100,
    avgVelocity: Math.round(avgVelocity)
  };
}

/**
 * Score technique against canonical form
 */
function scoreTechnique(movement) {
  const landmarks = movement.body_landmarks || [];
  if (landmarks.length === 0) return { overall: 0, details: {} };

  // Guard height scoring
  const guards = landmarks.map(l => l.guard_height).filter(g => g !== undefined);
  const avgGuard = guards.reduce((s, g) => s + g, 0) / guards.length;
  const guardScore = Math.min(1, avgGuard / CANONICAL.guard_height.target);

  // Stance width scoring
  const stances = landmarks.map(l => l.stance_width).filter(s => s !== undefined && s > 0);
  let stanceScore = 0.5;
  if (stances.length > 0) {
    const avgStance = stances.reduce((s, w) => s + w, 0) / stances.length;
    const diff = Math.abs(avgStance - CANONICAL.stance_width.target);
    stanceScore = Math.max(0, 1 - (diff / 0.1)); // 0.1 tolerance
  }

  // Guard drop penalty
  const guardDrops = (movement.technique_flags || []).filter(f => f.flag === 'guard_drop');
  const guardDropPenalty = Math.min(0.3, guardDrops.length * 0.05);

  // Punch velocity scoring
  const punches = movement.punches_detected || [];
  let velocityScore = 0.5;
  if (punches.length > 0) {
    const avgVel = punches.reduce((s, p) => s + (p.velocity || 0), 0) / punches.length;
    velocityScore = Math.min(1, avgVel / 180); // 180 = good average velocity
  }

  const overall = Math.round(((guardScore * 0.3 + stanceScore * 0.2 + velocityScore * 0.2 + (1 - guardDropPenalty) * 0.3) * 100));

  return {
    overall,
    details: {
      guard: { score: Math.round(guardScore * 100), avg: Math.round(avgGuard * 100) / 100, target: CANONICAL.guard_height.target },
      stance: { score: Math.round(stanceScore * 100), avg: stances.length > 0 ? Math.round((stances.reduce((s, w) => s + w, 0) / stances.length) * 1000) / 1000 : 'N/A' },
      velocity: { score: Math.round(velocityScore * 100), avg: punches.length > 0 ? Math.round(punches.reduce((s, p) => s + (p.velocity || 0), 0) / punches.length) : 0 },
      guard_drops: guardDrops.length,
      guard_drop_penalty: Math.round(guardDropPenalty * 100)
    }
  };
}

/**
 * Analyze guard return after punches
 */
function analyzeGuardReturn(movement) {
  const punches = movement.punches_detected || [];
  const landmarks = movement.body_landmarks || [];
  if (punches.length === 0 || landmarks.length === 0) return { rate: 0, total: 0 };

  let returns = 0;
  let checked = 0;

  for (const punch of punches) {
    // Find landmark ~0.5s after punch
    const afterLandmark = landmarks.find(l => l.timestamp >= punch.timestamp + 0.3 && l.timestamp <= punch.timestamp + 0.8);
    if (afterLandmark) {
      checked++;
      if (afterLandmark.guard_height >= CANONICAL.guard_return_threshold) {
        returns++;
      }
    }
  }

  return {
    rate: checked > 0 ? Math.round((returns / checked) * 100) : 0,
    returned: returns,
    total: checked
  };
}

/**
 * Generate coaching recommendations from analysis
 */
function generateRecommendations(analysis) {
  const recs = [];

  const tech = analysis.technique_score;
  if (tech.details.guard?.score < 60) {
    recs.push({ priority: 'high', area: 'guard', message: `Guard height ${tech.details.guard.avg} — target is ${CANONICAL.guard_height.target}. Focus: keep hands at chin level between punches.` });
  }

  if (tech.details.guard_drops > 3) {
    recs.push({ priority: 'high', area: 'guard_drops', message: `${tech.details.guard_drops} guard drops detected. Sustained low guard = vulnerability. Drill: shadow boxing with guard check between every combo.` });
  }

  if (analysis.guard_return.rate < 70 && analysis.guard_return.total > 0) {
    recs.push({ priority: 'high', area: 'guard_return', message: `Guard return rate ${analysis.guard_return.rate}% — must be 70%+. After every punch, hands snap back. Drill: slow combos, exaggerate guard return.` });
  }

  if (tech.details.stance?.score < 50 && tech.details.stance?.avg !== 'N/A') {
    recs.push({ priority: 'medium', area: 'stance', message: `Stance width ${tech.details.stance.avg} — target ~${CANONICAL.stance_width.target}. ${tech.details.stance.avg < CANONICAL.stance_width.target ? 'Wider stance needed for balance.' : 'Stance too wide — reduces mobility.'}` });
  }

  // Combo variety
  const comboTypes = Object.keys(analysis.combo_summary?.types || {});
  if (comboTypes.length <= 1 && analysis.punch_summary?.total > 10) {
    recs.push({ priority: 'medium', area: 'variety', message: `Only ${comboTypes.length} combo type(s) detected. Add variety: jab-cross-hook, jab-body-hook, double jab-cross.` });
  }

  if (tech.details.velocity?.score < 50) {
    recs.push({ priority: 'low', area: 'power', message: `Punch velocity below target. Focus on hip rotation and weight transfer for more power.` });
  }

  if (recs.length === 0) {
    recs.push({ priority: 'info', area: 'general', message: 'Solid session. Fundamentals look good. Push for more combo variety and speed.' });
  }

  return recs;
}

// ── Format for Telegram ─────────────────────────────────────────────────────

/**
 * Format analysis for Telegram display
 */
export function formatAnalysisTelegram(analysis) {
  const tech = analysis.technique_score;
  const scoreEmoji = tech.overall >= 80 ? '🟢' : tech.overall >= 60 ? '🟡' : '🔴';

  let msg = `👁 *Gym Eyes Analysis*\n`;
  msg += `📹 ${analysis.source} (${analysis.duration_seconds}s)\n\n`;

  // Overall score
  msg += `${scoreEmoji} *Technique Score: ${tech.overall}/100*\n\n`;

  // Punch summary
  const ps = analysis.punch_summary;
  msg += `*Punches:* ${ps.total} total\n`;
  msg += `  Jabs: ${ps.jabs} · Crosses: ${ps.crosses} · Hooks: ${ps.hooks}\n\n`;

  // Combos
  if (analysis.combos_detected.length > 0) {
    msg += `*Combos:* ${analysis.combos_detected.length} detected\n`;
    const types = analysis.combo_summary.types;
    for (const [combo, count] of Object.entries(types)) {
      msg += `  ${combo}: ×${count}\n`;
    }
    msg += '\n';
  }

  // Technique details
  msg += `*Details:*\n`;
  msg += `  Guard: ${tech.details.guard?.score || 0}% (avg ${tech.details.guard?.avg || 'N/A'})\n`;
  msg += `  Stance: ${tech.details.stance?.score || 0}%\n`;
  msg += `  Velocity: ${tech.details.velocity?.score || 0}% (avg ${tech.details.velocity?.avg || 0})\n`;
  msg += `  Guard drops: ${tech.details.guard_drops || 0}\n`;
  msg += `  Guard return: ${analysis.guard_return?.rate || 0}%\n\n`;

  // Recommendations
  if (analysis.recommendations?.length > 0) {
    msg += `*Coaching Notes:*\n`;
    for (const rec of analysis.recommendations) {
      const icon = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : rec.priority === 'info' ? '💡' : '🟢';
      msg += `${icon} ${rec.message}\n`;
    }
  }

  return msg;
}

/**
 * List recent analyses
 */
export function listAnalyses(limit = 10) {
  try {
    return fs.readdirSync(OUTPUT_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const stats = fs.statSync(path.join(OUTPUT_DIR, f));
        return { name: f, size: stats.size, modified: stats.mtime };
      })
      .sort((a, b) => b.modified - a.modified)
      .slice(0, limit);
  } catch { return []; }
}

export function formatStatusTelegram() {
  const analyses = listAnalyses(5);
  let msg = '👁 *Gym Eyes*\n\n';

  if (analyses.length === 0) {
    msg += 'No analyses yet.\n\n';
  } else {
    msg += `*Recent (${analyses.length}):*\n`;
    analyses.forEach(a => {
      const date = a.modified.toISOString().split('T')[0];
      msg += `  📹 \`${a.name}\` (${date})\n`;
    });
    msg += '\n';
  }

  msg += `*Commands:*
\`/eyes\` — this status
\`/eyes analyze\` — reply to video file to analyze
\`/eyes last\` — show last analysis
\`/eyes inbox\` — drop video in inbox for batch processing

Drop videos in: \`~/nanoclaw/gym-eyes/inbox/\`
YOLO pose → punch detection → combo detection → technique scoring → coaching notes`;

  return msg;
}

export default {
  analyzeVideo,
  analyzeVideoAsync,
  formatAnalysisTelegram,
  formatStatusTelegram,
  listAnalyses,
  CANONICAL
};
