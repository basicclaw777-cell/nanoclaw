// studio-commons/progress-tracker.js — Daily progress snapshots for all studios
// ESM module. Run via cron or on-demand to capture studio state over time.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { snapshotProgress, computeTrends, decisionEffectiveness, memoryQuality } from './rating-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NANOCLAW = path.join(process.env.HOME, 'nanoclaw');

// ── Studio registry ──────────────────────────────────────────────────────────

const STUDIOS = [
  {
    id: 'reed-studio',
    dir: path.join(NANOCLAW, 'reed-studio'),
    extractMetrics: () => {
      const metricsPath = path.join(NANOCLAW, 'reed-studio', 'metrics.json');
      try {
        const m = JSON.parse(fs.readFileSync(metricsPath, 'utf-8'));
        return {
          totalAssets: m.lifetime?.totalGenerated || 0,
          weeklyGenerated: m.weekly?.generated || 0,
          briefExecRate: m.rates?.briefToExecution || 0,
          paulSelections: m.lifetime?.paulSelections || 0,
          paulReplacements: m.lifetime?.paulReplacements || 0,
          streak: m.streaks?.daysActive || 0,
          feedPosts: m.lifetime?.feedPostsMade || 0
        };
      } catch { return {}; }
    }
  },
  {
    id: 'engineering-studio',
    dir: path.join(NANOCLAW, 'engineering-studio'),
    extractMetrics: () => {
      const metricsPath = path.join(NANOCLAW, 'engineering-studio', 'metrics.json');
      try {
        const m = JSON.parse(fs.readFileSync(metricsPath, 'utf-8'));
        return {
          sessionsTotal: m.projects?.gym_eyes?.sessions_processed_total || 0,
          sessionsWeek: m.projects?.gym_eyes?.sessions_processed_week || 0,
          students: m.projects?.gym_eyes?.students_tracked || 0,
          ingestionDays: m.projects?.ingestion_pipeline?.days_running_unattended || 0,
          cnnFrames: m.projects?.cnn_training?.frames_collected || 0,
          experiments: m.lab_health?.experiments_this_week || 0,
          postMortems: m.lab_health?.post_mortems_this_month || 0,
          failures: m.lab_health?.pipeline_failures_week || 0
        };
      } catch { return {}; }
    }
  }
];

// ── Run daily snapshot for all studios ───────────────────────────────────────

export function runAllSnapshots() {
  const results = [];

  for (const studio of STUDIOS) {
    if (!fs.existsSync(studio.dir)) continue;

    const metrics = studio.extractMetrics();
    const progress = snapshotProgress(studio.dir, metrics);
    const trends = computeTrends(studio.dir);
    const effectiveness = decisionEffectiveness(studio.dir);
    const quality = memoryQuality(studio.dir);

    results.push({
      id: studio.id,
      metrics,
      trends,
      effectiveness,
      quality,
      snapshotCount: progress.snapshots.length
    });
  }

  return results;
}

// ── Get progress summary for one studio ──────────────────────────────────────

export function getStudioProgress(studioId) {
  const studio = STUDIOS.find(s => s.id === studioId);
  if (!studio || !fs.existsSync(studio.dir)) return null;

  const progressPath = path.join(studio.dir, 'progress.json');
  let progress;
  try { progress = JSON.parse(fs.readFileSync(progressPath, 'utf-8')); } catch { progress = { snapshots: [] }; }

  const trends = computeTrends(studio.dir);
  const effectiveness = decisionEffectiveness(studio.dir);
  const quality = memoryQuality(studio.dir);

  return {
    id: studioId,
    snapshots: progress.snapshots.length,
    latest: progress.snapshots[progress.snapshots.length - 1] || null,
    trends,
    effectiveness,
    quality
  };
}

// ── CLI: run if called directly ──────────────────────────────────────────────

const isMain = process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
if (isMain) {
  const results = runAllSnapshots();
  for (const r of results) {
    console.log(`\n=== ${r.id} ===`);
    console.log('Metrics:', JSON.stringify(r.metrics, null, 2));
    console.log('Trends:', JSON.stringify(r.trends));
    console.log('Decision effectiveness:', r.effectiveness?.effectiveness !== null ? `${r.effectiveness.effectiveness}%` : 'no rated decisions yet');
    console.log('Memory quality:', r.quality ? `${r.quality.ratedPercent}% rated (${r.quality.rated}/${r.quality.total})` : 'no posts');
  }
}

export default { runAllSnapshots, getStudioProgress, STUDIOS };
