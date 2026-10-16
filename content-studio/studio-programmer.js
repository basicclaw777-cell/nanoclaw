// content-studio/studio-programmer.js — Wrench's brain
// Pipeline analysis, automation proposals, friction detection
// ESM module

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const METRICS_PATH = path.join(__dirname, 'metrics.json');
const MEMORY_PATH = path.join(__dirname, 'studio-memory.json');
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
    id: `wrench-${Date.now()}`,
    role: 'wrench',
    content,
    timestamp: new Date().toISOString(),
    tags: ['wrench', ...tags]
  });
  if (feed.posts.length > 100) feed.posts = feed.posts.slice(0, 100);
  saveJSON(FEED_PATH, feed);
}

// ── Analyze Pipeline Efficiency ──────────────────────────────────────────────

export function analyzeAndImprove() {
  const metrics = loadJSON(METRICS_PATH);
  const memory = loadJSON(MEMORY_PATH);
  if (!metrics || !memory) return { findings: [], proposals: [] };

  const findings = [];
  const proposals = [];

  // Check: Reed Daily Lab running?
  const reed = metrics.projects?.reed_visuals;
  if (reed && reed.posts_this_week === 0 && reed.style_experiments_running === 0) {
    findings.push({
      type: 'pipeline-stall',
      finding: 'Reed pipeline idle — no posts, no experiments. Daily Lab may be stopped.',
      severity: 'high'
    });
    proposals.push({
      action: 'Verify reed-lab PM2 cron running. Check reed-inbox for stuck files.',
      priority: 'immediate'
    });
  }

  // Check: LING publishing cadence
  const ling = metrics.projects?.ling_publishing;
  if (ling && ling.articles_this_month === 0) {
    findings.push({
      type: 'cadence-gap',
      finding: 'LING has published nothing this month. LinkedIn/Substack going dark.',
      severity: 'medium'
    });
    proposals.push({
      action: 'Draft one piece from existing vault material. Topic: latest AI tool review or Cathedral build insight.',
      priority: 'this-week'
    });
  }

  // Check: Maya celebration deficit
  const maya = metrics.projects?.maya_social;
  if (maya && maya.members_celebrated === 0 && maya.posts_this_week === 0) {
    findings.push({
      type: 'community-gap',
      finding: 'Zero member celebrations. Community energy not being reflected back.',
      severity: 'medium'
    });
    proposals.push({
      action: 'Pull recent class attendance or milestones. Generate one celebration post.',
      priority: 'this-week'
    });
  }

  // Check: cross-platform repurposing not happening
  if (metrics.studio_health?.cross_platform_posts === 0) {
    findings.push({
      type: 'efficiency-gap',
      finding: 'Zero cross-platform posts. Content created once, used once. Wasteful.',
      severity: 'low'
    });
    proposals.push({
      action: 'Reed visual → Instagram + Telegram + Website. One asset, three touches. Automate the repurpose.',
      priority: 'backlog'
    });
  }

  // Post findings
  if (findings.length > 0) {
    const summary = findings.map(f => `- [${f.severity}] ${f.finding}`).join('\n');
    postToFeed(`PIPELINE ANALYSIS:\n${summary}`, ['analysis']);
  }

  if (proposals.length > 0) {
    const summary = proposals.map(p => `- [${p.priority}] ${p.action}`).join('\n');
    postToFeed(`PROPOSALS:\n${summary}`, ['improvement']);
  }

  return { findings, proposals, analyzedAt: new Date().toISOString() };
}

// ── Propose Fix ──────────────────────────────────────────────────────────────

export function proposeFix(problem, context) {
  const memory = loadJSON(MEMORY_PATH);
  const pastPatterns = memory?.contentLearnings?.known_patterns || [];

  // Check if a known pattern addresses this
  const relevant = pastPatterns.filter(p =>
    p.toLowerCase().includes(problem.toLowerCase().split(' ')[0])
  );

  if (relevant.length > 0) {
    postToFeed(`KNOWN PATTERN for "${problem}": ${relevant[0]}`, ['pattern-match']);
    return { knownPattern: true, pattern: relevant[0] };
  }

  return { knownPattern: false, suggestion: 'New problem. Check existing pipelines before building new.' };
}

export default { analyzeAndImprove, proposeFix };
