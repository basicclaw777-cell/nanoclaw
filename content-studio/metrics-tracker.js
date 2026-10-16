// content-studio/metrics-tracker.js — Echo's brain
// Tracks content performance, updates metrics.json, detects patterns
// ESM module

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const METRICS_PATH = path.join(__dirname, 'metrics.json');
const PROGRESS_PATH = path.join(__dirname, 'progress.json');
const FEED_PATH = path.join(__dirname, 'studio-feed.json');

function loadJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

function saveJSON(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function postToFeed(content, tags = []) {
  const feed = loadJSON(FEED_PATH) || { posts: [], meta: {} };
  feed.posts.unshift({
    id: `echo-${Date.now()}`,
    role: 'echo',
    content,
    timestamp: new Date().toISOString(),
    tags: ['echo', ...tags]
  });
  if (feed.posts.length > 100) feed.posts = feed.posts.slice(0, 100);
  saveJSON(FEED_PATH, feed);
}

// ── Record a content event ───────────────────────────────────────────────────

export function recordEvent(project, eventType, data = {}) {
  const metrics = loadJSON(METRICS_PATH);
  if (!metrics || !metrics.projects[project]) return null;

  const p = metrics.projects[project];
  const now = new Date().toISOString();

  switch (eventType) {
    case 'post_published':
      p.posts_this_week = (p.posts_this_week || 0) + 1;
      p.posts_this_month = (p.posts_this_month || 0) + 1;
      p.last_generation = now;
      break;
    case 'engagement':
      if (data.rate !== undefined) p.engagement_rate = data.rate;
      break;
    case 'member_celebrated':
      p.members_celebrated = (p.members_celebrated || 0) + 1;
      break;
    case 'article_published':
      p.articles_this_week = (p.articles_this_week || 0) + 1;
      p.articles_this_month = (p.articles_this_month || 0) + 1;
      break;
    case 'story_posted':
      p.stories_this_week = (p.stories_this_week || 0) + 1;
      break;
  }

  // Update studio health
  const allPosts = Object.values(metrics.projects).reduce((sum, proj) =>
    sum + (proj.posts_this_week || 0) + (proj.articles_this_week || 0) + (proj.stories_this_week || 0), 0);
  metrics.studio_health.channels_active = Object.values(metrics.projects)
    .filter(proj => (proj.posts_this_week || 0) + (proj.articles_this_week || 0) > 0).length;

  metrics.generated = now;
  saveJSON(METRICS_PATH, metrics);

  postToFeed(`EVENT: ${project} → ${eventType}${data.note ? ` (${data.note})` : ''}`, ['event', project]);
  return { recorded: true, project, eventType };
}

// ── Take snapshot for progress tracking ──────────────────────────────────────

export function takeSnapshot() {
  const metrics = loadJSON(METRICS_PATH);
  const progress = loadJSON(PROGRESS_PATH) || { snapshots: [] };

  progress.snapshots.unshift({
    date: new Date().toISOString(),
    metrics: JSON.parse(JSON.stringify(metrics))
  });

  // Keep last 30 snapshots
  if (progress.snapshots.length > 30) progress.snapshots = progress.snapshots.slice(0, 30);
  saveJSON(PROGRESS_PATH, progress);

  return { snapshotTaken: true, total: progress.snapshots.length };
}

// ── Detect patterns ──────────────────────────────────────────────────────────

export function detectPatterns() {
  const progress = loadJSON(PROGRESS_PATH);
  if (!progress || progress.snapshots.length < 2) return { patterns: [], insufficient: true };

  const patterns = [];
  const latest = progress.snapshots[0]?.metrics;
  const previous = progress.snapshots[1]?.metrics;

  if (!latest || !previous) return { patterns: [], insufficient: true };

  // Detect which projects are growing/stalling
  for (const [key, project] of Object.entries(latest.projects)) {
    const prev = previous.projects[key];
    if (!prev) continue;

    const currentActivity = (project.posts_this_week || 0) + (project.articles_this_week || 0);
    const prevActivity = (prev.posts_this_week || 0) + (prev.articles_this_week || 0);

    if (currentActivity > prevActivity) {
      patterns.push({ project: key, trend: 'accelerating', delta: currentActivity - prevActivity });
    } else if (currentActivity < prevActivity && prevActivity > 0) {
      patterns.push({ project: key, trend: 'decelerating', delta: currentActivity - prevActivity });
    }
  }

  if (patterns.length > 0) {
    const summary = patterns.map(p => `${p.project}: ${p.trend} (${p.delta > 0 ? '+' : ''}${p.delta})`).join(', ');
    postToFeed(`PATTERNS: ${summary}`, ['pattern-detection']);
  }

  return { patterns, analyzedAt: new Date().toISOString() };
}

// ── Weekly reset ─────────────────────────────────────────────────────────────

export function weeklyReset() {
  const metrics = loadJSON(METRICS_PATH);
  if (!metrics) return;

  // Snapshot before reset
  takeSnapshot();

  // Reset weekly counters
  for (const project of Object.values(metrics.projects)) {
    if ('posts_this_week' in project) project.posts_this_week = 0;
    if ('stories_this_week' in project) project.stories_this_week = 0;
    if ('articles_this_week' in project) project.articles_this_week = 0;
    if ('members_celebrated' in project) project.members_celebrated = 0;
  }

  metrics.generated = new Date().toISOString();
  saveJSON(METRICS_PATH, metrics);
  postToFeed('WEEKLY RESET: counters cleared. New week begins.', ['reset']);
}

export default { recordEvent, takeSnapshot, detectPatterns, weeklyReset };
