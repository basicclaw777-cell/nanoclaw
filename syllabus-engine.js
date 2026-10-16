/**
 * Syllabus Engine — Structured curriculum of Cathedral research fundamentals.
 *
 * 20 foundational concepts sequenced by prerequisite graph.
 * Reads syllabus-config.json (source of truth), generates study packs via study-lab.js.
 *
 * Usage:
 *   import { getProgress, getNextTopic, markCompleted } from './syllabus-engine.js';
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const CONFIG_PATH = join(__dirname, 'syllabus-config.json');

// ── Config I/O ──────────────────────────────────────────────────────────────

function readConfig() {
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
}

function writeConfig(config) {
  config._updated = new Date().toISOString().split('T')[0];
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
}

// ── Progress ────────────────────────────────────────────────────────────────

export function getProgress() {
  const config = readConfig();
  const topics = config.topics;
  const total = topics.length;
  const completed = topics.filter(t => t.status === 'completed').length;
  const inProgress = topics.filter(t => t.status === 'in_progress').length;
  const available = topics.filter(t => {
    if (t.status !== 'not_started') return false;
    return t.prerequisites.every(pid =>
      topics.find(p => p.id === pid)?.status === 'completed'
    );
  }).length;
  const locked = total - completed - inProgress - available;

  return {
    total,
    completed,
    inProgress,
    available,
    locked,
    percent: Math.round((completed / total) * 100),
    topics: topics.map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      difficulty: t.difficulty,
      completedAt: t.completedAt || null
    }))
  };
}

// ── Next Topic ──────────────────────────────────────────────────────────────

export function getNextTopic() {
  const config = readConfig();
  const topics = config.topics;

  // First: any in_progress topics
  const current = topics.find(t => t.status === 'in_progress');
  if (current) return { topic: current, reason: 'Currently in progress' };

  // Find all available (prerequisites met, not started)
  const available = topics.filter(t => {
    if (t.status !== 'not_started') return false;
    return t.prerequisites.every(pid =>
      topics.find(p => p.id === pid)?.status === 'completed'
    );
  });

  if (available.length === 0) {
    const remaining = topics.filter(t => t.status !== 'completed');
    if (remaining.length === 0) return { topic: null, reason: 'All 20 fundamentals completed!' };
    return { topic: null, reason: 'No topics available — complete prerequisites first' };
  }

  // Pick lowest difficulty first, then by config order
  available.sort((a, b) => a.difficulty - b.difficulty);
  return { topic: available[0], reason: `Lowest difficulty available (${available.length} total unlocked)` };
}

// ── Suggest Topic ───────────────────────────────────────────────────────────

export function suggestTopic(currentThread) {
  if (!currentThread) return getNextTopic();

  const config = readConfig();
  const topics = config.topics;
  const threadLower = currentThread.toLowerCase();

  // Score each topic by keyword relevance to the current thread
  const scored = topics
    .filter(t => t.status !== 'completed')
    .map(t => {
      let score = 0;
      // Check vault keywords
      for (const kw of t.vaultKeywords) {
        if (threadLower.includes(kw.toLowerCase())) score += 3;
      }
      // Check domains
      for (const d of t.domains) {
        if (threadLower.includes(d.replace(/_/g, ' '))) score += 2;
      }
      // Check title
      if (threadLower.includes(t.title.toLowerCase())) score += 5;
      // Check id
      if (threadLower.includes(t.id.replace(/-/g, ' '))) score += 4;

      // Bonus for available (prerequisites met)
      const available = t.prerequisites.every(pid =>
        topics.find(p => p.id === pid)?.status === 'completed'
      );
      if (available && t.status === 'not_started') score += 1;

      return { topic: t, score, available };
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return { topic: null, reason: `No syllabus concepts match "${currentThread}"`, suggestion: getNextTopic() };
  }

  const best = scored[0];
  const lockNote = best.available ? '' : ' (prerequisites not yet complete)';
  return {
    topic: best.topic,
    reason: `Matches your current thread "${currentThread}" (score: ${best.score})${lockNote}`,
    available: best.available,
    alternatives: scored.slice(1, 4).map(s => ({ id: s.topic.id, title: s.topic.title, score: s.score }))
  };
}

// ── Mark Status ─────────────────────────────────────────────────────────────

export function markCompleted(topicId) {
  const config = readConfig();
  const topic = config.topics.find(t => t.id === topicId);
  if (!topic) return { ok: false, error: `Topic "${topicId}" not found` };

  topic.status = 'completed';
  topic.completedAt = new Date().toISOString();
  writeConfig(config);

  // Find newly unlocked topics
  const unlocked = config.topics.filter(t => {
    if (t.status !== 'not_started') return false;
    return t.prerequisites.every(pid =>
      config.topics.find(p => p.id === pid)?.status === 'completed'
    );
  });

  return {
    ok: true,
    completed: topic.title,
    newlyUnlocked: unlocked.map(t => ({ id: t.id, title: t.title }))
  };
}

export function markInProgress(topicId) {
  const config = readConfig();
  const topic = config.topics.find(t => t.id === topicId);
  if (!topic) return { ok: false, error: `Topic "${topicId}" not found` };

  topic.status = 'in_progress';
  topic.startedAt = new Date().toISOString();
  writeConfig(config);

  return { ok: true, started: topic.title };
}

// ── Generate Study Pack ─────────────────────────────────────────────────────

export async function generateStudyPack(topicId) {
  const config = readConfig();
  const topic = config.topics.find(t => t.id === topicId);
  if (!topic) return { ok: false, error: `Topic "${topicId}" not found` };

  // Build a rich search query from topic metadata
  const searchQuery = [topic.title, ...topic.vaultKeywords.slice(0, 3)].join(' ');

  // Import study-lab functions dynamically
  const { createSlides, createMindMap, createQuiz } = await import('./study-lab.js');

  const results = {};

  try {
    console.log(`Generating slides for: ${topic.title}`);
    results.slides = await createSlides(searchQuery);
  } catch (e) {
    console.error(`Slides error: ${e.message}`);
    results.slidesError = e.message;
  }

  try {
    console.log(`Generating mind map for: ${topic.title}`);
    results.mindmap = await createMindMap(searchQuery);
  } catch (e) {
    console.error(`Mind map error: ${e.message}`);
    results.mindmapError = e.message;
  }

  try {
    console.log(`Generating quiz for: ${topic.title}`);
    results.quiz = await createQuiz(searchQuery);
  } catch (e) {
    console.error(`Quiz error: ${e.message}`);
    results.quizError = e.message;
  }

  return { ok: true, topic: topic.title, topicId, results };
}

// ── Prerequisite Graph ──────────────────────────────────────────────────────

export function getPrerequisiteGraph() {
  const config = readConfig();
  const topics = config.topics;

  const nodes = topics.map(t => ({
    id: t.id,
    title: t.title,
    status: t.status,
    difficulty: t.difficulty,
    domains: t.domains,
    description: t.description,
    completedAt: t.completedAt || null,
    startedAt: t.startedAt || null,
    available: t.status === 'not_started' && t.prerequisites.every(pid =>
      topics.find(p => p.id === pid)?.status === 'completed'
    )
  }));

  const edges = [];
  for (const t of topics) {
    for (const pid of t.prerequisites) {
      edges.push({ source: pid, target: t.id });
    }
  }

  return { nodes, edges };
}

// ── Full config (for API) ───────────────────────────────────────────────────

export function getFullConfig() {
  return readConfig();
}

// ── CLI ─────────────────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].endsWith('syllabus-engine.js')) {
  const [cmd, ...rest] = process.argv.slice(2);
  const arg = rest.join(' ');

  if (!cmd || cmd === '--help') {
    console.log('Usage:');
    console.log('  node syllabus-engine.js progress');
    console.log('  node syllabus-engine.js next');
    console.log('  node syllabus-engine.js suggest "standing waves"');
    console.log('  node syllabus-engine.js start <topic-id>');
    console.log('  node syllabus-engine.js done <topic-id>');
    console.log('  node syllabus-engine.js generate <topic-id>');
    console.log('  node syllabus-engine.js graph');
    process.exit(0);
  }

  if (cmd === 'progress') {
    const p = getProgress();
    console.log(`Syllabus Progress: ${p.completed}/${p.total} (${p.percent}%)`);
    console.log(`  In Progress: ${p.inProgress}`);
    console.log(`  Available:   ${p.available}`);
    console.log(`  Locked:      ${p.locked}`);
    process.exit(0);
  }

  if (cmd === 'next') {
    const n = getNextTopic();
    if (n.topic) {
      console.log(`Next: ${n.topic.title} (${n.topic.id})`);
      console.log(`  ${n.reason}`);
      console.log(`  ${n.topic.description}`);
    } else {
      console.log(n.reason);
    }
    process.exit(0);
  }

  if (cmd === 'suggest') {
    const s = suggestTopic(arg);
    if (s.topic) {
      console.log(`Suggested: ${s.topic.title} (${s.topic.id})`);
      console.log(`  ${s.reason}`);
    } else {
      console.log(s.reason);
    }
    process.exit(0);
  }

  if (cmd === 'start') {
    const r = markInProgress(arg.trim());
    console.log(r.ok ? `Started: ${r.started}` : `Error: ${r.error}`);
    process.exit(0);
  }

  if (cmd === 'done') {
    const r = markCompleted(arg.trim());
    if (r.ok) {
      console.log(`Completed: ${r.completed}`);
      if (r.newlyUnlocked.length > 0) {
        console.log(`  Newly unlocked: ${r.newlyUnlocked.map(t => t.title).join(', ')}`);
      }
    } else {
      console.log(`Error: ${r.error}`);
    }
    process.exit(0);
  }

  if (cmd === 'generate') {
    generateStudyPack(arg.trim()).then(r => {
      console.log(r.ok ? `Generated pack for: ${r.topic}` : `Error: ${r.error}`);
      if (r.results) console.log(r.results);
    });
  }

  if (cmd === 'graph') {
    const g = getPrerequisiteGraph();
    console.log(`Nodes: ${g.nodes.length}, Edges: ${g.edges.length}`);
    console.log(JSON.stringify(g, null, 2));
    process.exit(0);
  }
}
