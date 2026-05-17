// engineering-studio/studio-orc.js — Scope's brain
// Reads KPIs, assigns priority, resolves conflicts, posts to feed
// ESM module

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FEED_PATH = path.join(__dirname, 'studio-feed.json');
const METRICS_PATH = path.join(__dirname, 'metrics.json');
const MEMORY_PATH = path.join(__dirname, 'studio-memory.json');
const CHARACTERS_PATH = path.join(__dirname, 'characters.json');

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
  // Keep last 100 posts
  if (feed.posts.length > 100) feed.posts = feed.posts.slice(0, 100);
  saveJSON(FEED_PATH, feed);
  return post;
}

// ── Priority Decision ────────────────────────────────────────────────────────

export function orcDecide() {
  const metrics = loadJSON(METRICS_PATH);
  if (!metrics) return { priority: 'unknown', reason: 'No metrics available' };

  const priorities = [];
  const projects = metrics.projects;

  // Ingestion pipeline is marked priority — check if blocked
  if (projects.ingestion_pipeline?.status === 'priority' && projects.ingestion_pipeline.days_running_unattended === 0) {
    priorities.push({
      level: 'HIGH',
      action: 'build-ingestion',
      target: 'deployer',
      reason: 'Ingestion pipeline not running. Everything downstream blocked on frame data.'
    });
  }

  // CNN blocked on data
  if (projects.cnn_training?.status === 'blocked' && projects.cnn_training.frames_collected < projects.cnn_training.target_frames * 0.1) {
    priorities.push({
      level: 'HIGH',
      action: 'collect-frames',
      target: 'programmer',
      reason: `CNN training blocked. ${projects.cnn_training.frames_collected}/${projects.cnn_training.target_frames} frames collected.`
    });
  }

  // Detection accuracy unknown — needs ground truth
  if (projects.gym_eyes?.detection_accuracy === 'unknown') {
    priorities.push({
      level: 'MEDIUM',
      action: 'build-ground-truth',
      target: 'tester',
      reason: 'Detection accuracy unmeasured. Cannot improve what we cannot measure.'
    });
  }

  // No experiments this week
  if (metrics.lab_health?.experiments_this_week === 0) {
    priorities.push({
      level: 'LOW',
      action: 'run-experiment',
      target: 'researcher',
      reason: 'Zero experiments this week. Lab is dormant.'
    });
  }

  // No post-mortems this month
  if (metrics.lab_health?.post_mortems_this_month === 0) {
    priorities.push({
      level: 'LOW',
      action: 'write-postmortem',
      target: 'archivist',
      reason: 'No post-mortems filed this month. Lessons not being captured.'
    });
  }

  // Post top priority to feed
  if (priorities.length > 0) {
    const top = priorities[0];
    postToStudioFeed('orc', `PRIORITY ASSIGNMENT:\n[${top.level}] ${top.action} → ${top.target}: ${top.reason}`, ['priority']);
  }

  return { priorities, decided: new Date().toISOString() };
}

// ── Conflict Resolution ──────────────────────────────────────────────────────

const ROLE_PRIORITY = ['director', 'calibrator', 'tester', 'deployer', 'researcher', 'programmer', 'archivist'];

export function resolveConflict(roleA, roleB, issue) {
  const prioA = ROLE_PRIORITY.indexOf(roleA);
  const prioB = ROLE_PRIORITY.indexOf(roleB);
  const winner = prioA <= prioB ? roleA : roleB;

  const resolution = {
    issue,
    roles: [roleA, roleB],
    winner,
    reason: `${winner} has higher priority in engineering context (accuracy > stability > research)`,
    timestamp: new Date().toISOString()
  };

  postToStudioFeed('orc', `CONFLICT RESOLVED: ${roleA} vs ${roleB} on "${issue}" → ${winner} wins. Reason: ${resolution.reason}`, ['conflict']);
  return resolution;
}

// ── Learn from Paul ──────────────────────────────────────────────────────────

export function learnFromPaul(type, data) {
  const memory = loadJSON(MEMORY_PATH);
  if (!memory) return;

  if (type === 'detection-feedback') {
    // Paul says detection was wrong/right
    if (!memory.pipelineLearnings.paulFeedback) memory.pipelineLearnings.paulFeedback = [];
    memory.pipelineLearnings.paulFeedback.push({ ...data, date: new Date().toISOString() });
  } else if (type === 'post-mortem') {
    memory.postMortems.entries.push({ ...data, date: new Date().toISOString() });
  } else if (type === 'model-tip') {
    const model = data.model;
    if (memory.modelLearnings[model]) {
      memory.modelLearnings[model].tips.push(data.tip);
    }
  }

  saveJSON(MEMORY_PATH, memory);
  postToStudioFeed('orc', `PAUL SIGNAL: ${type} — ${JSON.stringify(data).slice(0, 200)}`, ['paul-signal']);
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
    postMortems: memory?.postMortems?.entries?.length || 0,
    lastDecision: feed?.posts?.find(p => p.role === 'orc')?.timestamp || null
  };
}

export default { orcDecide, resolveConflict, postToStudioFeed, learnFromPaul, getStudioStatus };
