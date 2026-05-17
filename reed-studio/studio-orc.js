/**
 * Studio Orc — Internal Orchestrator for Reed's Studio
 *
 * Reads KPIs, feed, memory. Assigns priority. Resolves conflicts.
 * Posts decisions to studio feed. Runs hourly inside reed-studio-engine.
 *
 * Not a separate process — imported by the engine.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const STUDIO_DIR = process.env.HOME + '/nanoclaw/reed-studio';
const FEED_FILE = join(STUDIO_DIR, 'studio-feed.json');
const METRICS_FILE = join(STUDIO_DIR, 'metrics.json');
const MEMORY_FILE = join(STUDIO_DIR, 'studio-memory.json');
const STATE_FILE = join(STUDIO_DIR, 'state.json');

// ─── PRIORITY ENGINE ──────────────────────────────────────────────────────────

export function orcDecide() {
  const metrics = existsSync(METRICS_FILE) ? JSON.parse(readFileSync(METRICS_FILE, 'utf8')) : {};
  const memory = existsSync(MEMORY_FILE) ? JSON.parse(readFileSync(MEMORY_FILE, 'utf8')) : {};
  const decisions = [];

  // 1. Character gap — highest priority if all at 0
  const chars = metrics.coverage?.characters || {};
  const totalCharGens = (chars.logan || 0) + (chars.ling || 0) + (chars.maya || 0);
  if (totalCharGens < 5) {
    decisions.push({
      priority: 'HIGH',
      action: 'generate-characters',
      reason: `Character coverage critically low (${totalCharGens} total). Studio needs character content for portfolio.`,
      assignment: 'rnd',
      target: Object.entries(chars).sort((a, b) => a[1] - b[1])[0]?.[0] || 'logan'
    });
  }

  // 2. Stale styles
  const staleStyles = Object.entries(metrics.coverage?.styles || {})
    .filter(([, v]) => v.health === 'stale')
    .map(([k]) => k);
  if (staleStyles.length > 0) {
    decisions.push({
      priority: 'MEDIUM',
      action: 'refresh-stale-styles',
      reason: `${staleStyles.length} styles are stale: ${staleStyles.join(', ')}. Refresh to keep portfolio alive.`,
      assignment: 'reed',
      target: staleStyles[0]
    });
  }

  // 3. Brief execution rate
  const execRate = metrics.rates?.briefToExecution || 0;
  if (metrics.lifetime?.totalBriefs > 5 && execRate < 30) {
    decisions.push({
      priority: 'MEDIUM',
      action: 'execute-briefs',
      reason: `Brief execution rate at ${execRate}%. ${metrics.lifetime.totalBriefs} briefs queued but only ${metrics.lifetime.briefsExecuted} executed. Studio is planning but not producing.`,
      assignment: 'reed',
      target: 'oldest-brief'
    });
  }

  // 4. Feed engagement
  if (metrics.lifetime?.feedPostsMade > 5 && (metrics.rates?.feedEngagement || 0) < 20) {
    decisions.push({
      priority: 'LOW',
      action: 'improve-feed-posts',
      reason: 'Feed engagement below 20%. Studio posts not generating responses from other agents.',
      assignment: 'editor',
      target: 'post-quality'
    });
  }

  // 5. Paul replacement rate signals quality issue
  const replacements = metrics.lifetime?.paulReplacements || 0;
  const selections = metrics.lifetime?.paulSelections || 0;
  if (replacements > 3 && replacements > selections) {
    decisions.push({
      priority: 'HIGH',
      action: 'quality-review',
      reason: `Paul replacing more than selecting (${replacements} replaced vs ${selections} used). Quality needs attention.`,
      assignment: 'programmer',
      target: 'prompt-refinement'
    });
  }

  // 6. Streak maintenance
  if ((metrics.streaks?.daysActive || 0) >= 5) {
    decisions.push({
      priority: 'LOW',
      action: 'maintain-streak',
      reason: `${metrics.streaks.daysActive}-day streak active. Keep generating to maintain momentum.`,
      assignment: 'rnd',
      target: 'daily-output'
    });
  }

  // Post decisions to studio feed
  if (decisions.length > 0) {
    postToStudioFeed('orc', `PRIORITY ASSIGNMENT:\n${decisions.map(d => `[${d.priority}] ${d.action} → ${d.assignment}: ${d.reason}`).join('\n')}`);
  }

  return decisions;
}

// ─── CONFLICT RESOLUTION ──────────────────────────────────────────────────────

export function resolveConflict(roleA, roleB, issue) {
  // Simple priority: Reed > Editor > Librarian > R&D > Watcher
  const priority = { reed: 5, editor: 4, librarian: 3, rnd: 2, watcher: 1 };
  const winner = (priority[roleA] || 0) >= (priority[roleB] || 0) ? roleA : roleB;

  postToStudioFeed('orc', `CONFLICT RESOLVED: ${roleA} vs ${roleB} on "${issue}" → ${winner} wins by role priority.`);
  return winner;
}

// ─── STUDIO FEED ──────────────────────────────────────────────────────────────

export function postToStudioFeed(role, content, tags = []) {
  const feed = existsSync(FEED_FILE) ? JSON.parse(readFileSync(FEED_FILE, 'utf8')) : { posts: [] };

  feed.posts.push({
    id: `${role}-${Date.now()}`,
    role,
    content,
    timestamp: new Date().toISOString(),
    tags: [role, ...tags]
  });

  // Keep last 200 posts
  if (feed.posts.length > 200) feed.posts = feed.posts.slice(-200);

  writeFileSync(FEED_FILE, JSON.stringify(feed, null, 2));
}

export function getStudioFeed(limit = 20) {
  const feed = existsSync(FEED_FILE) ? JSON.parse(readFileSync(FEED_FILE, 'utf8')) : { posts: [] };
  return feed.posts.slice(-limit);
}

// ─── MEMORY INTERFACE ─────────────────────────────────────────────────────────

export function learnFromPaul(type, data) {
  const memory = existsSync(MEMORY_FILE) ? JSON.parse(readFileSync(MEMORY_FILE, 'utf8')) : {};

  if (type === 'selection') {
    memory.paulPreferences.selections.push({ ...data, date: new Date().toISOString() });
    if (memory.paulPreferences.selections.length > 50) memory.paulPreferences.selections = memory.paulPreferences.selections.slice(-50);
    postToStudioFeed('orc', `PAUL SIGNAL: Selected "${data.asset}". Style: ${data.style || 'unknown'}. Learning applied.`);
  }

  if (type === 'replacement') {
    memory.paulPreferences.replacements.push({ ...data, date: new Date().toISOString() });
    if (memory.paulPreferences.replacements.length > 50) memory.paulPreferences.replacements = memory.paulPreferences.replacements.slice(-50);
    postToStudioFeed('orc', `PAUL SIGNAL: Replaced "${data.asset}". Reason: ${data.reason || 'unknown'}. Adjusting.`, ['quality']);
  }

  if (type === 'prompt-insight') {
    memory.promptEvolution.entries.push({ ...data, date: new Date().toISOString() });
    postToStudioFeed('programmer', `PROMPT EVOLUTION: ${data.insight}`, ['learning']);
  }

  if (type === 'model-tip') {
    const model = data.model;
    if (memory.modelLearnings[model]) {
      memory.modelLearnings[model].tips.push(data.tip);
      postToStudioFeed('rnd', `MODEL LEARNING [${model}]: ${data.tip}`, ['learning']);
    }
  }

  writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
}

// ─── STUDIO STATUS ────────────────────────────────────────────────────────────

export function getStudioStatus() {
  const metrics = existsSync(METRICS_FILE) ? JSON.parse(readFileSync(METRICS_FILE, 'utf8')) : {};
  const feed = getStudioFeed(5);
  const decisions = orcDecide();

  return {
    health: metrics.streaks?.daysActive > 0 ? 'active' : 'cold',
    streak: metrics.streaks?.daysActive || 0,
    topPriority: decisions[0] || null,
    recentFeed: feed,
    metrics: {
      totalAssets: metrics.lifetime?.totalGenerated || 0,
      thisWeek: metrics.weekly?.generated || 0,
      briefsQueued: metrics.lifetime?.totalBriefs || 0,
      execRate: metrics.rates?.briefToExecution || 0
    }
  };
}
