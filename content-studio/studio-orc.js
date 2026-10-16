// content-studio/studio-orc.js — Compass's brain
// Cross-channel balance, priority assignment, rhythm detection
// ESM module

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FEED_PATH = path.join(__dirname, 'studio-feed.json');
const METRICS_PATH = path.join(__dirname, 'metrics.json');
const MEMORY_PATH = path.join(__dirname, 'studio-memory.json');

function loadJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

function saveJSON(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

// ── Post to internal feed ────────────────────────────────────────────────────

export function postToStudioFeed(role, content, tags = []) {
  const feed = loadJSON(FEED_PATH) || { posts: [], meta: {} };
  const post = {
    id: `${role}-${Date.now()}`,
    role,
    content,
    timestamp: new Date().toISOString(),
    tags: [role, ...tags]
  };
  feed.posts.unshift(post);
  if (feed.posts.length > 100) feed.posts = feed.posts.slice(0, 100);
  saveJSON(FEED_PATH, feed);
  return post;
}

// ── Priority Decision — Channel Balance ──────────────────────────────────────

export function orcDecide() {
  const metrics = loadJSON(METRICS_PATH);
  if (!metrics) return { priority: 'unknown', reason: 'No metrics available' };

  const priorities = [];
  const projects = metrics.projects;

  // Channel silence detection — which platform has gone cold?
  const silenceThreshold = 3; // days
  for (const [key, project] of Object.entries(projects)) {
    if (project.posts_this_week === 0 && project.status === 'production') {
      priorities.push({
        level: 'HIGH',
        action: 'break-silence',
        target: project.owner,
        reason: `${project.owner}'s channels silent this week. ${project.platforms.join(', ')} going cold.`
      });
    }
  }

  // Cross-platform imbalance — one channel hogging attention
  const postCounts = Object.values(projects).map(p => p.posts_this_week || 0);
  const maxPosts = Math.max(...postCounts);
  const minPosts = Math.min(...postCounts);
  if (maxPosts > 0 && minPosts === 0) {
    const coldProject = Object.entries(projects).find(([, p]) => (p.posts_this_week || 0) === 0);
    if (coldProject) {
      priorities.push({
        level: 'MEDIUM',
        action: 'rebalance',
        target: coldProject[1].owner,
        reason: `Imbalance detected. One channel active, ${coldProject[1].owner} dark. Rebalance needed.`
      });
    }
  }

  // Selection rate dropping — quality gate concern
  if (metrics.studio_health?.selection_rate_overall !== null &&
      metrics.studio_health.selection_rate_overall < 0.3) {
    priorities.push({
      level: 'MEDIUM',
      action: 'quality-review',
      target: 'cull',
      reason: `Selection rate ${(metrics.studio_health.selection_rate_overall * 100).toFixed(0)}% — below 30%. Either generating too much noise or standards too high.`
    });
  }

  // No content in queue — pipeline dry
  if (metrics.studio_health?.content_in_queue === 0) {
    priorities.push({
      level: 'LOW',
      action: 'fill-pipeline',
      target: 'all',
      reason: 'Content queue empty. No buffer for silent days.'
    });
  }

  // Post top priority
  if (priorities.length > 0) {
    const top = priorities[0];
    postToStudioFeed('compass', `PRIORITY: [${top.level}] ${top.action} → ${top.target}: ${top.reason}`, ['priority']);
  }

  return { priorities, decided: new Date().toISOString() };
}

// ── Conflict Resolution ──────────────────────────────────────────────────────

const ROLE_PRIORITY = ['compass', 'cull', 'reed', 'maya', 'ling', 'echo', 'wrench'];

export function resolveConflict(roleA, roleB, issue) {
  const prioA = ROLE_PRIORITY.indexOf(roleA);
  const prioB = ROLE_PRIORITY.indexOf(roleB);
  const winner = prioA <= prioB ? roleA : roleB;

  const resolution = {
    issue,
    roles: [roleA, roleB],
    winner,
    reason: `${winner} has higher priority in content context (rhythm > quality > creation > analysis)`,
    timestamp: new Date().toISOString()
  };

  postToStudioFeed('compass', `CONFLICT: ${roleA} vs ${roleB} on "${issue}" → ${winner} wins. ${resolution.reason}`, ['conflict']);
  return resolution;
}

// ── Learn from Paul ──────────────────────────────────────────────────────────

export function learnFromPaul(type, data) {
  const memory = loadJSON(MEMORY_PATH);
  if (!memory) return;

  if (type === 'content-feedback') {
    if (!memory.contentLearnings.paulFeedback) memory.contentLearnings.paulFeedback = [];
    memory.contentLearnings.paulFeedback.push({ ...data, date: new Date().toISOString() });
  } else if (type === 'platform-insight') {
    memory.crossPlatformLearnings.format_performance.push({ ...data, date: new Date().toISOString() });
  } else if (type === 'style-evolution') {
    const { character, style, verdict } = data;
    if (memory.styleEvolution[character]) {
      if (verdict === 'proven') memory.styleEvolution[character].proven_styles?.push(style);
      if (verdict === 'rejected') memory.styleEvolution[character].rejected?.push(style);
    }
  }

  saveJSON(MEMORY_PATH, memory);
  postToStudioFeed('compass', `PAUL SIGNAL: ${type} — ${JSON.stringify(data).slice(0, 200)}`, ['paul-signal']);
}

// ── Studio Status ────────────────────────────────────────────────────────────

export function getStudioStatus() {
  const metrics = loadJSON(METRICS_PATH);
  const feed = loadJSON(FEED_PATH);
  const memory = loadJSON(MEMORY_PATH);

  return {
    healthy: true,
    metrics: metrics ? 'loaded' : 'missing',
    feedPosts: feed?.posts?.length || 0,
    projects: metrics?.projects ? Object.keys(metrics.projects) : [],
    lastDecision: feed?.posts?.find(p => p.role === 'compass')?.timestamp || null
  };
}

export default { orcDecide, resolveConflict, postToStudioFeed, learnFromPaul, getStudioStatus };
