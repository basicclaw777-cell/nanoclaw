// studio-commons/rating-engine.js — Shared rating + progress layer for all departments
// ESM module. Any studio imports this for outcome tracking.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Rate a feed post ─────────────────────────────────────────────────────────
// Call this when a decision's outcome is known

export function ratePost(studioDir, postId, outcome) {
  // outcome: { result: 'acted'|'ignored'|'succeeded'|'failed'|'superseded', detail: string, metricDelta: number|null }
  const feedPath = path.join(studioDir, 'studio-feed.json');
  const feed = JSON.parse(fs.readFileSync(feedPath, 'utf-8'));

  const post = feed.posts.find(p => p.id === postId);
  if (!post) return null;

  post.outcome = {
    ...outcome,
    ratedAt: new Date().toISOString()
  };

  fs.writeFileSync(feedPath, JSON.stringify(feed, null, 2));

  // Also log to memory for pattern detection
  logRatedOutcome(studioDir, post);

  return post;
}

// ── Rate by Paul signal ──────────────────────────────────────────────────────
// Paul's reactions are the ultimate rating

export function ratePaulSignal(studioDir, type, context) {
  // type: 'selected'|'replaced'|'approved'|'rejected'|'feedback'
  const memoryPath = path.join(studioDir, 'studio-memory.json');
  const memory = JSON.parse(fs.readFileSync(memoryPath, 'utf-8'));

  if (!memory.paulRatings) memory.paulRatings = [];
  memory.paulRatings.push({
    type,
    context,
    date: new Date().toISOString(),
    weight: type === 'selected' || type === 'approved' ? 1 : type === 'replaced' || type === 'rejected' ? -1 : 0
  });

  // Keep last 200
  if (memory.paulRatings.length > 200) memory.paulRatings = memory.paulRatings.slice(-200);

  fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2));
  return { logged: true, total: memory.paulRatings.length };
}

// ── Progress snapshot ────────────────────────────────────────────────────────
// Records current metrics with timestamp for trend tracking

export function snapshotProgress(studioDir, metrics) {
  const progressPath = path.join(studioDir, 'progress.json');
  let progress;
  try { progress = JSON.parse(fs.readFileSync(progressPath, 'utf-8')); } catch { progress = { snapshots: [] }; }

  progress.snapshots.push({
    date: new Date().toISOString(),
    metrics
  });

  // Keep 90 days of daily snapshots
  if (progress.snapshots.length > 90) progress.snapshots = progress.snapshots.slice(-90);

  fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
  return progress;
}

// ── Compute trends ───────────────────────────────────────────────────────────
// Returns direction for each metric: up, down, flat

export function computeTrends(studioDir) {
  const progressPath = path.join(studioDir, 'progress.json');
  let progress;
  try { progress = JSON.parse(fs.readFileSync(progressPath, 'utf-8')); } catch { return {}; }

  const snapshots = progress.snapshots || [];
  if (snapshots.length < 2) return { insufficient: true };

  const latest = snapshots[snapshots.length - 1].metrics;
  const previous = snapshots[snapshots.length - 2].metrics;

  const trends = {};
  for (const key of Object.keys(latest)) {
    const curr = typeof latest[key] === 'number' ? latest[key] : null;
    const prev = typeof previous[key] === 'number' ? previous[key] : null;
    if (curr === null || prev === null) { trends[key] = 'unknown'; continue; }
    if (curr > prev) trends[key] = 'up';
    else if (curr < prev) trends[key] = 'down';
    else trends[key] = 'flat';
  }
  return trends;
}

// ── Decision effectiveness ───────────────────────────────────────────────────
// What % of orc decisions led to positive outcomes?

export function decisionEffectiveness(studioDir) {
  const feedPath = path.join(studioDir, 'studio-feed.json');
  let feed;
  try { feed = JSON.parse(fs.readFileSync(feedPath, 'utf-8')); } catch { return null; }

  const orcPosts = (feed.posts || []).filter(p => p.role === 'orc' && p.outcome);
  if (orcPosts.length === 0) return { rated: 0, effectiveness: null };

  const succeeded = orcPosts.filter(p => p.outcome.result === 'succeeded' || p.outcome.result === 'acted').length;
  return {
    rated: orcPosts.length,
    succeeded,
    effectiveness: Math.round((succeeded / orcPosts.length) * 100)
  };
}

// ── Memory quality score ─────────────────────────────────────────────────────
// How much of memory has been rated vs fire-and-forget?

export function memoryQuality(studioDir) {
  const feedPath = path.join(studioDir, 'studio-feed.json');
  let feed;
  try { feed = JSON.parse(fs.readFileSync(feedPath, 'utf-8')); } catch { return null; }

  const posts = feed.posts || [];
  const total = posts.length;
  const rated = posts.filter(p => p.outcome).length;
  const unrated = total - rated;

  return {
    total,
    rated,
    unrated,
    ratedPercent: total > 0 ? Math.round((rated / total) * 100) : 0
  };
}

// ── Internal: log rated outcome to memory ────────────────────────────────────

function logRatedOutcome(studioDir, post) {
  const memoryPath = path.join(studioDir, 'studio-memory.json');
  let memory;
  try { memory = JSON.parse(fs.readFileSync(memoryPath, 'utf-8')); } catch { return; }

  if (!memory.ratedOutcomes) memory.ratedOutcomes = [];
  memory.ratedOutcomes.push({
    postId: post.id,
    role: post.role,
    action: post.content?.slice(0, 100),
    outcome: post.outcome,
    date: post.outcome.ratedAt
  });

  // Keep last 100
  if (memory.ratedOutcomes.length > 100) memory.ratedOutcomes = memory.ratedOutcomes.slice(-100);

  fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2));
}

export default { ratePost, ratePaulSignal, snapshotProgress, computeTrends, decisionEffectiveness, memoryQuality };
