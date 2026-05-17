// engineering-studio/studio-programmer.js — Torque's brain
// Reads metrics, identifies inefficiencies, proposes improvements
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
    id: `programmer-${Date.now()}`,
    role: 'programmer',
    content,
    timestamp: new Date().toISOString(),
    tags: ['programmer', ...tags]
  });
  if (feed.posts.length > 100) feed.posts = feed.posts.slice(0, 100);
  saveJSON(FEED_PATH, feed);
}

// ── Analyze and Improve ──────────────────────────────────────────────────────

export function analyzeAndImprove() {
  const metrics = loadJSON(METRICS_PATH);
  const memory = loadJSON(MEMORY_PATH);
  if (!metrics || !memory) return { findings: [], proposals: [] };

  const findings = [];
  const proposals = [];

  // Check: ingestion pipeline not running
  const ingestion = metrics.projects?.ingestion_pipeline;
  if (ingestion && ingestion.fps_processed === 0) {
    findings.push({
      type: 'bottleneck',
      finding: 'Ingestion pipeline not processing any frames. All downstream projects starved of data.',
      severity: 'critical'
    });
    proposals.push({
      action: 'Build minimal ingestion: webcam capture → timestamped frames → storage. Even 1fps is better than 0.',
      priority: 'immediate'
    });
  }

  // Check: detection accuracy unmeasured
  const gymEyes = metrics.projects?.gym_eyes;
  if (gymEyes && gymEyes.detection_accuracy === 'unknown') {
    findings.push({
      type: 'measurement-gap',
      finding: 'Cannot improve detection without measuring it. No ground truth dataset exists.',
      severity: 'high'
    });
    proposals.push({
      action: 'Label 100 frames manually as ground truth. Measure current model against it. Establishes baseline for all future work.',
      priority: 'this-sprint'
    });
  }

  // Check: known edge cases not being addressed
  const edgeCases = memory.pipelineLearnings?.known_edge_cases || [];
  if (edgeCases.length > 0 && metrics.lab_health?.experiments_this_week === 0) {
    findings.push({
      type: 'stagnation',
      finding: `${edgeCases.length} known edge cases documented but zero experiments running to address them.`,
      severity: 'medium'
    });
    proposals.push({
      action: `Pick easiest edge case and run targeted experiment. Suggestion: "${edgeCases[0]}"`,
      priority: 'this-sprint'
    });
  }

  // Check: no post-mortems means no learning loop
  const postMortems = memory.postMortems?.entries || [];
  if (postMortems.length === 0) {
    findings.push({
      type: 'knowledge-loss',
      finding: 'Zero post-mortems. Lab is not learning from its own failures.',
      severity: 'medium'
    });
  }

  // Post findings to feed
  if (findings.length > 0) {
    const summary = findings.map(f => `- [${f.severity}] ${f.finding}`).join('\n');
    postToFeed(`PIPELINE ANALYSIS:\n${summary}`, ['analysis']);
  }

  if (proposals.length > 0) {
    const summary = proposals.map(p => `- [${p.priority}] ${p.action}`).join('\n');
    postToFeed(`IMPROVEMENT PROPOSALS:\n${summary}`, ['improvement']);
  }

  return { findings, proposals, analyzedAt: new Date().toISOString() };
}

// ── Propose Specific Fix ─────────────────────────────────────────────────────

export function proposefix(problem, context) {
  const memory = loadJSON(MEMORY_PATH);

  // Check if we've seen this problem before
  const pastFailures = memory?.postMortems?.entries?.filter(e =>
    e.finding?.toLowerCase().includes(problem.toLowerCase())
  ) || [];

  if (pastFailures.length > 0) {
    const lastFix = pastFailures[pastFailures.length - 1];
    postToFeed(`RECURRING ISSUE: "${problem}" — seen before. Last post-mortem: ${lastFix.lesson || 'no lesson recorded'}. Don't repeat same fix.`, ['recurring']);
    return { recurring: true, pastAttempts: pastFailures };
  }

  return { recurring: false, suggestion: `New problem. Investigate root cause before proposing fix.` };
}

export default { analyzeAndImprove, proposefix };
