/**
 * ling-engine.js — Ling's intelligence and content pipeline.
 *
 * Capabilities:
 *   - Ask Ling anything (advisory mode — she evaluates with her lens)
 *   - Generate draft posts (GitHub drops, reviews, sovereignty pieces)
 *   - Track her memory (past reviews, positions, predictions)
 *   - Surface draft queue for Paul's review
 *
 * Usage: imported by telegram-bot.js for /ling commands
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { smartQuery } from './deepseek-query.js';

const SAGE_PATH = join(process.cwd(), 'sages', 'ling.json');
const MEMORY_PATH = join(process.cwd(), 'sages', 'ling-memory.json');
// Registry-declared memoryFile — the live markdown corpus where 20+ days of real
// LING activity accumulate (What Works / What Doesn't Work / Interactions). The JSON
// above is a frozen legacy store; this is the one that actually grows. Read both.
const MD_MEMORY_PATH = join(process.env.HOME, 'Cathedral', 'agents', 'memory', 'ling.md');
const DRAFTS_DIR = join(process.env.HOME, 'cathedral-vault', '09_Artifacts', 'cathedral-intelligence-hk', 'drafts');
const REVIEWS_DIR = join(process.env.HOME, 'cathedral-vault', '09_Artifacts', 'cathedral-intelligence-hk');

if (!existsSync(DRAFTS_DIR)) mkdirSync(DRAFTS_DIR, { recursive: true });

// ── Load sage ──────────────────────────────────────────────────────────────

function loadSage() {
  return JSON.parse(readFileSync(SAGE_PATH, 'utf8'));
}

// ── Memory ─────────────────────────────────────────────────────────────────

function loadMemory() {
  if (!existsSync(MEMORY_PATH)) {
    return { reviews: [], positions: [], predictions: [], github_drops: [], conversations: 0 };
  }
  return JSON.parse(readFileSync(MEMORY_PATH, 'utf8'));
}

function saveMemory(mem) {
  writeFileSync(MEMORY_PATH, JSON.stringify(mem, null, 2));
}

// Load the live markdown memory corpus (registry memoryFile). Guarded — returns
// '' if the file is missing so the JSON-only path still works.
function loadMarkdownMemory() {
  if (!existsSync(MD_MEMORY_PATH)) return '';
  try {
    return readFileSync(MD_MEMORY_PATH, 'utf8').trim();
  } catch {
    return '';
  }
}

function getMemoryContext() {
  const mem = loadMemory();
  const mdMemory = loadMarkdownMemory();

  // If the JSON store is empty, the markdown corpus is now the real memory — don't
  // short-circuit to "early days" while 20+ days of activity sit in ling.md.
  if (mem.reviews.length === 0 && mem.positions.length === 0) {
    return mdMemory
      ? `Your accumulated working memory (from ling.md):\n\n${mdMemory}`
      : 'No prior reviews or positions yet. This is early days.';
  }
  let ctx = '';
  if (mem.reviews.length > 0) {
    ctx += 'Past reviews:\n' + mem.reviews.slice(-10).map(r =>
      `- ${r.tool}: ${r.verdict} (${r.date}). ${r.summary}`
    ).join('\n') + '\n\n';
  }
  if (mem.positions.length > 0) {
    ctx += 'Current positions:\n' + mem.positions.slice(-10).map(p =>
      `- ${p.topic}: ${p.stance} (${p.date})`
    ).join('\n') + '\n\n';
  }
  if (mem.predictions.length > 0) {
    ctx += 'Active predictions:\n' + mem.predictions.slice(-5).map(p =>
      `- ${p.claim} (${p.date}) — ${p.status || 'unresolved'}`
    ).join('\n') + '\n\n';
  }
  if (mem.github_drops.length > 0) {
    ctx += 'Recent GitHub drops:\n' + mem.github_drops.slice(-5).map(g =>
      `- ${g.repo}: ${g.summary} (${g.date})`
    ).join('\n');
  }
  // Append the live markdown corpus (registry memoryFile) — the accumulating record
  // of what LING has actually learned, beyond the frozen JSON above.
  if (mdMemory) {
    ctx += `\n\nYour accumulated working memory (from ling.md):\n\n${mdMemory}`;
  }
  return ctx;
}

// ── Ask Ling (advisory mode) ───────────────────────────────────────────────

export async function askLing(question) {
  const sage = loadSage();
  const memoryCtx = getMemoryContext();
  const systemPrompt = sage.sage.system_prompt + '\n\nYour memory of past work:\n' + memoryCtx;

  const response = await smartQuery(systemPrompt, question, 600);

  const mem = loadMemory();
  mem.conversations = (mem.conversations || 0) + 1;
  saveMemory(mem);

  return response;
}

// ── Generate draft ─────────────────────────────────────────────────────────

export async function generateDraft(pillar, topic, notes = '') {
  const sage = loadSage();
  const memoryCtx = getMemoryContext();
  const pillarConfig = sage.content_pillars[pillar];

  if (!pillarConfig) {
    return { error: `Unknown pillar: ${pillar}. Options: ${Object.keys(sage.content_pillars).join(', ')}` };
  }

  const draftPrompt = `${sage.sage.system_prompt}

Your memory:
${memoryCtx}

Write a LinkedIn post for the "${pillar.replace(/_/g, ' ')}" content pillar.
Format: ${pillarConfig.format}
Topic: ${topic}
${notes ? `Additional notes/data: ${notes}` : ''}

Write the complete post. End with "— LING 🔴"
Do not include metadata or frontmatter. Just the post text.`;

  const draft = await smartQuery(draftPrompt, `Write the ${pillar} post about: ${topic}`, 1200);

  if (!draft) return { error: 'DeepSeek returned no content.' };

  const date = new Date().toISOString().split('T')[0];
  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50);
  const filename = `draft-${date}-${pillar}-${slug}.md`;
  const filepath = join(DRAFTS_DIR, filename);

  const content = `---
title: "${topic}"
pillar: ${pillar}
date: ${date}
status: draft
---

${draft}
`;
  writeFileSync(filepath, content);

  return { draft, filename, filepath, pillar };
}

// ── Memory logging ─────────────────────────────────────────────────────────

export function logReview(tool, verdict, summary) {
  const mem = loadMemory();
  mem.reviews.push({ tool, verdict, summary, date: new Date().toISOString().split('T')[0] });
  saveMemory(mem);
}

export function logPosition(topic, stance) {
  const mem = loadMemory();
  const existing = mem.positions.findIndex(p => p.topic === topic);
  const entry = { topic, stance, date: new Date().toISOString().split('T')[0] };
  if (existing >= 0) mem.positions[existing] = entry;
  else mem.positions.push(entry);
  saveMemory(mem);
}

export function logPrediction(claim) {
  const mem = loadMemory();
  mem.predictions.push({ claim, date: new Date().toISOString().split('T')[0], status: 'unresolved' });
  saveMemory(mem);
}

export function logGitHubDrop(repo, summary) {
  const mem = loadMemory();
  mem.github_drops.push({ repo, summary, date: new Date().toISOString().split('T')[0] });
  saveMemory(mem);
}

// ── Drafts ─────────────────────────────────────────────────────────────────

export function getDrafts() {
  if (!existsSync(DRAFTS_DIR)) return [];
  return readdirSync(DRAFTS_DIR)
    .filter(f => f.startsWith('draft-') && f.endsWith('.md'))
    .sort()
    .reverse();
}

export function readDraft(filename) {
  const filepath = join(DRAFTS_DIR, filename);
  if (!existsSync(filepath)) return null;
  return readFileSync(filepath, 'utf8');
}

// ── Status ─────────────────────────────────────────────────────────────────

export function getStatus() {
  const mem = loadMemory();
  const drafts = getDrafts();

  let published = 0;
  try {
    published = readdirSync(REVIEWS_DIR).filter(f => f.startsWith('ling-post-')).length;
  } catch { /* ignore */ }

  return {
    published,
    drafts: drafts.length,
    reviews: mem.reviews?.length || 0,
    positions: mem.positions?.length || 0,
    predictions: mem.predictions?.length || 0,
    github_drops: mem.github_drops?.length || 0,
    conversations: mem.conversations || 0
  };
}
