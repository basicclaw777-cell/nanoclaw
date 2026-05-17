// engineering-studio-engine.js — Persistent PM2 engine for Engineering Studio
// ESM module. Event-driven via chokidar + scheduled R&D cycle.
// Mirrors reed-studio-engine.js pattern.

import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import { orcDecide, postToStudioFeed, getStudioStatus } from './engineering-studio/studio-orc.js';
import { analyzeAndImprove } from './engineering-studio/studio-programmer.js';
import { computeMetrics, getAgentBriefing } from './engineering-studio/metrics-tracker.js';

const HOME = process.env.HOME;
const STUDIO_DIR = path.join(HOME, 'nanoclaw', 'engineering-studio');
const STATE_PATH = path.join(STUDIO_DIR, 'state.json');
const GYM_EYES_DIR = path.join(HOME, 'basic-reflex', 'gym-eyes');
const SESSIONS_DIR = path.join(GYM_EYES_DIR, 'sessions');
const CATHEDRAL_FEED = path.join(HOME, 'nanoclaw', 'cathedral-feed.json');

// ── State ────────────────────────────────────────────────────────────────────

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8')); }
  catch { return { lastEvent: null, lastCycle: null, lastSnapshot: null, eventsProcessed: 0 }; }
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// ── Event Handlers ───────────────────────────────────────────────────────────

function onNewSession(filePath) {
  const state = loadState();
  state.lastEvent = { type: 'new-session', file: path.basename(filePath), time: new Date().toISOString() };
  state.eventsProcessed++;
  saveState(state);

  // Recompute metrics
  computeMetrics();

  // Notify feed
  postToStudioFeed('deployer', `NEW SESSION DETECTED: ${path.basename(filePath)}. Metrics refreshed.`, ['event', 'session']);

  console.log(`[eng-studio] New session: ${path.basename(filePath)}`);
}

function onCathedralFeedUpdate() {
  // Read cathedral feed for inspiration/cross-pollination
  try {
    const feed = JSON.parse(fs.readFileSync(CATHEDRAL_FEED, 'utf-8'));
    const recent = (feed.posts || []).slice(0, 3);
    const relevant = recent.filter(p =>
      (p.content || '').toLowerCase().match(/detection|video|camera|gym eyes|punch|pose|cv|vision/)
    );
    if (relevant.length > 0) {
      postToStudioFeed('researcher', `CATHEDRAL SIGNAL: ${relevant.length} relevant post(s) in main feed. Latest: "${(relevant[0].content || '').slice(0, 80)}..."`, ['external', 'cathedral-feed']);
    }
  } catch {}
}

// ── Scheduled Cycle ──────────────────────────────────────────────────────────
// Runs every 6 hours: Orc decides, Programmer analyzes, Metrics refresh

function runCycle() {
  const state = loadState();
  const now = new Date();

  // Throttle: no more than once per 6 hours
  if (state.lastCycle) {
    const elapsed = now - new Date(state.lastCycle);
    if (elapsed < 6 * 3600000) return;
  }

  console.log(`[eng-studio] Running cycle at ${now.toISOString()}`);

  // 1. Refresh metrics from live data
  const metrics = computeMetrics();

  // 2. Orc assigns priorities
  const decision = orcDecide();

  // 3. Programmer analyzes pipeline
  const analysis = analyzeAndImprove();

  // 4. Snapshot progress
  const progressPath = path.join(STUDIO_DIR, 'progress.json');
  let progress;
  try { progress = JSON.parse(fs.readFileSync(progressPath, 'utf-8')); } catch { progress = { snapshots: [] }; }

  // Only snapshot once per day
  const lastSnap = progress.snapshots[progress.snapshots.length - 1];
  const lastSnapDate = lastSnap ? new Date(lastSnap.date).toDateString() : null;
  if (lastSnapDate !== now.toDateString()) {
    progress.snapshots.push({ date: now.toISOString(), metrics });
    if (progress.snapshots.length > 90) progress.snapshots = progress.snapshots.slice(-90);
    fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
    state.lastSnapshot = now.toISOString();
  }

  state.lastCycle = now.toISOString();
  saveState(state);

  console.log(`[eng-studio] Cycle complete. Priorities: ${decision.priorities?.length || 0}, Findings: ${analysis.findings?.length || 0}`);
}

// ── Post to Cathedral Feed ───────────────────────────────────────────────────

function postToCathedralFeed(content) {
  try {
    const feedPath = CATHEDRAL_FEED;
    let feed;
    try { feed = JSON.parse(fs.readFileSync(feedPath, 'utf-8')); } catch { feed = { posts: [] }; }
    feed.posts.unshift({
      id: `eng-studio-${Date.now()}`,
      source: 'engineering-studio',
      content,
      timestamp: new Date().toISOString()
    });
    if (feed.posts.length > 200) feed.posts = feed.posts.slice(0, 200);
    fs.writeFileSync(feedPath, JSON.stringify(feed, null, 2));
  } catch {}
}

// ── File Watchers ────────────────────────────────────────────────────────────

console.log('[eng-studio] Engineering Studio Engine starting...');

// Watch for new session files (video analysis results)
if (fs.existsSync(SESSIONS_DIR)) {
  const sessionWatcher = chokidar.watch(path.join(SESSIONS_DIR, '*.json'), {
    ignoreInitial: true,
    usePolling: true,
    interval: 5000
  });
  sessionWatcher.on('add', onNewSession);
  console.log(`[eng-studio] Watching sessions: ${SESSIONS_DIR}`);
}

// Watch cathedral feed for cross-pollination
if (fs.existsSync(CATHEDRAL_FEED)) {
  const catFeedWatcher = chokidar.watch(CATHEDRAL_FEED, {
    ignoreInitial: true,
    usePolling: true,
    interval: 30000
  });
  catFeedWatcher.on('change', onCathedralFeedUpdate);
  console.log(`[eng-studio] Watching cathedral feed`);
}

// Run initial cycle
runCycle();

// Schedule cycle every 6 hours
setInterval(runCycle, 6 * 3600000);

// Post startup to cathedral feed
postToCathedralFeed('Engineering Studio online. Watching sessions, computing metrics, running 6h cycles.');

console.log('[eng-studio] Engine running. Watchers active. Cycle interval: 6h.');
