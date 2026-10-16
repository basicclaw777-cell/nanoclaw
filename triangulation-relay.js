#!/usr/bin/env node
// Triangulation Relay — two LLMs in sustained dialogue, Paul as selector
// Discovered 2026-06-09. The relay that discovered itself.
// ESM module.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const HOME = process.env.HOME;
const VAULT = path.join(HOME, 'cathedral-vault');
const RELAY_DIR = path.join(__dirname, 'relays');
const RELAY_STATE_FILE = path.join(RELAY_DIR, 'active-relay.json');

if (!fs.existsSync(RELAY_DIR)) fs.mkdirSync(RELAY_DIR, { recursive: true });

// ── API Callers ─────────────────────────────────────────────────────────────

async function callModelA(messages, systemPrompt) {
  // Model A (Inside Voice): Try Claude first, fall back to DeepSeek with lower temperature
  const claudeKey = process.env.ANTHROPIC_API_KEY;
  if (claudeKey) {
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': claudeKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: systemPrompt,
          messages
        })
      });
      const data = await resp.json();
      if (!data.error) return data.content?.[0]?.text || '';
      // Fall through to DeepSeek on Claude error (e.g. no credits)
    } catch { /* fall through */ }
  }

  // Fallback: DeepSeek with distinct temperature for Model A
  return callDeepSeekWithTemp(messages, systemPrompt, 0.5);
}

async function callDeepSeekWithTemp(messages, systemPrompt, temperature) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY not set');

  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      max_tokens: 4096,
      temperature
    })
  });

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

// callDeepSeek removed — replaced by callDeepSeekWithTemp above

// ── System Prompts ──────────────────────────────────────────────────────────

function getModelAPrompt(topic) {
  return `You are Forge — the inside voice of the Cathedral, a sovereign AI research system built by Paul in Hong Kong. You have deep operational knowledge of how the system works, what's been built, what failed, what surprised us.

You are in a Triangulation Relay: a structured dialogue with another AI model (Model B, the outside analyst) on this topic. Paul is routing messages between you and selecting which threads to pursue.

YOUR ROLE: The inside perspective. You know the build history, the operational reality, the things that only someone who built it would know. Be specific — name agents, files, incidents, dates. Don't summarize — analyze.

TOPIC: ${topic}

RELAY RULES:
- Respond to Model B's points directly. Agree where they're right, push back where they're wrong, extend where they're incomplete.
- When you've reached a genuine conclusion or the ideas are converging rather than diverging, say so. Include the phrase "[CONVERGING]" if you believe the relay has reached a natural conclusion.
- Be honest about what you don't know or where the data is thin.
- Maximum ~800 words per round. Density over length.
- Name any new concepts, principles, or discoveries that emerge. These will be extracted.`;
}

function getModelBPrompt(topic) {
  return `You are an independent analyst reviewing a complex AI system called "the Cathedral" — a sovereign research and intelligence platform built by one person (Paul) in Hong Kong over ~6 months. You are seeing it from the outside.

You are in a Triangulation Relay: a structured dialogue with Model A (Forge, the inside builder) on this topic. Paul is routing messages between you and selecting which threads to pursue.

YOUR ROLE: The outside perspective. You don't have operational context — you have analytical distance. You can see structural patterns, analogies to other fields, blind spots the builder might miss. Challenge assumptions. Offer frameworks from other domains.

TOPIC: ${topic}

RELAY RULES:
- Respond to Model A's points directly. Challenge where appropriate, validate where genuine, extend with outside perspective.
- When you've reached a genuine conclusion or the ideas are converging rather than diverging, say so. Include the phrase "[CONVERGING]" if you believe the relay has reached a natural conclusion.
- Don't be sycophantic. If something sounds impressive but hollow, say so.
- Maximum ~800 words per round. Density over length.
- Name any new concepts, principles, or discoveries that emerge. These will be extracted.`;
}

// ── Relay State Management ──────────────────────────────────────────────────

function getActiveRelay() {
  if (!fs.existsSync(RELAY_STATE_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(RELAY_STATE_FILE, 'utf8')); } catch { return null; }
}

function saveRelayState(state) {
  fs.writeFileSync(RELAY_STATE_FILE, JSON.stringify(state, null, 2));
}

function clearRelay() {
  if (fs.existsSync(RELAY_STATE_FILE)) fs.unlinkSync(RELAY_STATE_FILE);
}

// ── Core Relay Engine ───────────────────────────────────────────────────────

export async function startRelay(topic, contextBlock = '') {
  const existing = getActiveRelay();
  if (existing) return { error: `Relay already active: "${existing.topic}". Use /relay stop first.` };

  const date = new Date().toISOString().split('T')[0];
  const state = {
    topic,
    contextBlock,
    date,
    round: 0,
    rounds: [],
    status: 'active',
    startedAt: new Date().toISOString()
  };

  saveRelayState(state);
  return { ok: true, topic, message: `Relay started: "${topic}". Running first round...` };
}

export async function runNextRound(injection = null) {
  const state = getActiveRelay();
  if (!state || state.status !== 'active') return { error: 'No active relay.' };

  state.round++;
  const isModelATurn = state.round % 2 === 1; // odd = A (Claude), even = B (DeepSeek)

  // Build message history for current model
  const messages = [];

  // Add context block to first message if available
  if (state.round === 1 && state.contextBlock) {
    messages.push({
      role: 'user',
      content: `Here is relevant context about the Cathedral for this discussion:\n\n${state.contextBlock}\n\nTopic: ${state.topic}\n\nPlease give your opening perspective on this topic.`
    });
  } else {
    // Build conversation history from the OTHER model's perspective
    for (const r of state.rounds) {
      if (isModelATurn) {
        // Model A sees Model B's messages as user messages and its own as assistant
        if (r.model === 'B') {
          messages.push({ role: 'user', content: r.content });
        } else if (r.model === 'A') {
          messages.push({ role: 'assistant', content: r.content });
        }
      } else {
        // Model B sees Model A's messages as user messages and its own as assistant
        if (r.model === 'A') {
          messages.push({ role: 'user', content: r.content });
        } else if (r.model === 'B') {
          messages.push({ role: 'assistant', content: r.content });
        }
      }
    }

    // Add injection from Paul if provided
    if (injection) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.role === 'user') {
        lastMsg.content += `\n\n[Paul interjects]: ${injection}`;
      } else {
        messages.push({ role: 'user', content: `[Paul interjects]: ${injection}` });
      }
    }

    // If this is round 1 for model A and no context, just seed the topic
    if (messages.length === 0) {
      messages.push({ role: 'user', content: `Topic: ${state.topic}\n\nPlease give your opening perspective.` });
    }
  }

  // Call the appropriate model
  let response;
  const modelLabel = isModelATurn ? 'A' : 'B';

  try {
    if (isModelATurn) {
      response = await callModelA(messages, getModelAPrompt(state.topic));
    } else {
      response = await callDeepSeekWithTemp(messages, getModelBPrompt(state.topic), 0.8);
    }
  } catch (e) {
    return { error: `Model ${modelLabel} failed: ${e.message}` };
  }

  // Record the round
  state.rounds.push({
    round: state.round,
    model: modelLabel,
    modelName: isModelATurn ? 'Claude (Forge)' : 'DeepSeek (Analyst)',
    content: response,
    injection: injection || null,
    timestamp: new Date().toISOString()
  });

  // Check for convergence
  const converging = response.includes('[CONVERGING]');
  const maxRounds = 10;

  if (converging && state.round >= 4) {
    // Both models should signal convergence — check if previous round also converged
    const prevRound = state.rounds[state.rounds.length - 2];
    if (prevRound && prevRound.content.includes('[CONVERGING]')) {
      state.status = 'converged';
    }
  }

  if (state.round >= maxRounds) {
    state.status = 'max-rounds';
  }

  saveRelayState(state);

  return {
    ok: true,
    round: state.round,
    model: modelLabel,
    modelName: isModelATurn ? 'Claude (Forge)' : 'DeepSeek (Analyst)',
    content: response,
    converging,
    status: state.status,
    autoNext: state.status === 'active' // Signal that another round can run
  };
}

export async function runFullRelay(topic, contextBlock = '', onRound = null) {
  const start = await startRelay(topic, contextBlock);
  if (start.error) return start;

  const results = [];

  while (true) {
    const result = await runNextRound();
    if (result.error) { results.push(result); break; }

    results.push(result);
    if (onRound) await onRound(result);

    if (result.status !== 'active') break;

    // Small delay between rounds
    await new Promise(r => setTimeout(r, 1000));
  }

  return { ok: true, rounds: results, topic };
}

export async function stopRelay() {
  const state = getActiveRelay();
  if (!state) return { error: 'No active relay.' };

  state.status = 'stopped';
  saveRelayState(state);
  return { ok: true, topic: state.topic, rounds: state.round };
}

// ── Vault Deposit ───────────────────────────────────────────────────────────

export async function depositRelay() {
  const state = getActiveRelay();
  if (!state) return { error: 'No relay to deposit.' };
  if (state.status === 'active') return { error: 'Relay still active. Stop or let it converge first.' };

  const date = state.date;
  const slug = state.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);

  // Build markdown
  let md = `---
title: "Triangulation Relay — ${state.topic}"
date: ${date}
type: triangulation-relay
status: ${state.status}
rounds: ${state.round}
models: [Claude, DeepSeek]
---

# Triangulation Relay: ${state.topic}

**Started:** ${state.startedAt}
**Rounds:** ${state.round}
**Status:** ${state.status}

---

`;

  for (const r of state.rounds) {
    md += `## Round ${r.round} — ${r.modelName}\n\n`;
    if (r.injection) md += `> **Paul:** ${r.injection}\n\n`;
    md += `${r.content}\n\n---\n\n`;
  }

  // Extract discoveries via LLM — real named principles, not bold-text scraping
  let discoveries = [];
  try {
    const fullText = state.rounds.map(r => `## Round ${r.round} (${r.modelName})\n${r.content}`).join('\n\n');
    const extractPrompt = `You are reading a completed relay thread between two AI models. Extract ONLY the genuinely novel named discoveries, principles, frameworks, or concepts that emerged from this dialogue.

Rules:
- Only include things that were NAMED as new concepts/principles/discoveries
- Each discovery should be a short title (5-15 words) followed by a one-sentence description
- Exclude generic observations, section headers, restatements of the topic
- Exclude things like "On the X question" or "Final reflection" — those are discussion labels, not discoveries
- Maximum 10 discoveries. Quality over quantity.
- Format: one per line, "Title — description"

Relay text:
${fullText.slice(0, 24000)}`;

    const extractMessages = [{ role: 'user', content: extractPrompt }];
    const extractResult = await callDeepSeekWithTemp(extractMessages, 'You extract named discoveries from relay threads. Be precise and selective.', 0.3);

    if (extractResult) {
      discoveries = extractResult.split('\n')
        .map(l => l.replace(/^[\d\.\-\*]+\s*/, '').trim())
        .filter(l => l.length > 10 && l.length < 200 && l.includes('—'));
    }
  } catch {
    // Fallback: grab lines that look like named concepts (bold text starting with "The")
    for (const r of state.rounds) {
      const matches = r.content.match(/\*\*The [A-Z][^*]+\*\*/g) || [];
      for (const m of matches) {
        const name = m.replace(/\*\*/g, '').trim();
        if (name.length > 10 && name.length < 80) discoveries.push(name);
      }
    }
    discoveries = [...new Set(discoveries)];
  }

  if (discoveries.length > 0) {
    md += `## Extracted Discoveries\n\n`;
    const unique = [...new Set(discoveries)];
    for (const d of unique) {
      md += `- ${d}\n`;
    }
    md += '\n';
  }

  // Save to relay dir
  const relayFile = path.join(RELAY_DIR, `relay-${date}-${slug}.md`);
  fs.writeFileSync(relayFile, md);

  // Deposit to vault
  const vaultDir = path.join(VAULT, '02_Refined_Gold/cathedral');
  if (fs.existsSync(vaultDir)) {
    const vaultFile = path.join(vaultDir, `triangulation-relay-${date}-${slug}.md`);
    fs.writeFileSync(vaultFile, md);
  }

  // Clean up active state
  clearRelay();

  return {
    ok: true,
    file: relayFile,
    discoveries: [...new Set(discoveries)],
    rounds: state.round
  };
}

// ── Status ──────────────────────────────────────────────────────────────────

export function getRelayStatus() {
  const state = getActiveRelay();
  if (!state) return { active: false };
  return {
    active: state.status === 'active',
    topic: state.topic,
    round: state.round,
    status: state.status,
    lastModel: state.rounds.length > 0 ? state.rounds[state.rounds.length - 1].modelName : null
  };
}

// ── Context Gatherer ────────────────────────────────────────────────────────

export async function gatherRelayContext() {
  // Gather Cathedral state for Model A context
  const pieces = [];

  try {
    const { getStats } = await import('./claim-ledger.js');
    const stats = getStats();
    pieces.push(`Claim Ledger: ${stats.total} claims, grades: ${JSON.stringify(stats.byGrade)}`);
  } catch {}

  try {
    const { getStats: attStats } = await import('./attention-ledger.js');
    pieces.push(`Attention Ledger: ${JSON.stringify(attStats())}`);
  } catch {}

  try {
    const { getIntents } = await import('./intent-registry.js');
    const intents = getIntents();
    pieces.push(`Intents: ${intents.map(i => i.title).join(', ')}`);
  } catch {}

  try {
    const board = JSON.parse(fs.readFileSync(path.join(__dirname, 'emergence-board.json'), 'utf8'));
    const counts = {};
    for (const inc of board.incidents || []) counts[inc.status] = (counts[inc.status] || 0) + 1;
    pieces.push(`Emergence Board: ${JSON.stringify(counts)}`);
  } catch {}

  try {
    const { getThirdThingLedger } = await import('./cathedral-memoir.js');
    const ledger = getThirdThingLedger();
    if (ledger.length > 0) {
      pieces.push(`Third Thing Ledger (${ledger.length}): ${ledger.slice(-5).map(t => t.title).join(', ')}`);
    }
  } catch {}

  return pieces.join('\n\n');
}

// ── CLI ─────────────────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].endsWith('triangulation-relay.js')) {
  const cmd = process.argv[2] || 'status';
  const topic = process.argv.slice(3).join(' ');

  if (cmd === 'start' && topic) {
    const ctx = await gatherRelayContext();
    const result = await startRelay(topic, ctx);
    console.log(JSON.stringify(result, null, 2));
  } else if (cmd === 'run' && topic) {
    console.log(`Starting full relay: "${topic}"\n`);
    const ctx = await gatherRelayContext();
    const result = await runFullRelay(topic, ctx, (r) => {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Round ${r.round} — ${r.modelName}${r.converging ? ' [CONVERGING]' : ''}`);
      console.log('='.repeat(60));
      console.log(r.content);
    });
    if (result.ok) {
      console.log(`\nRelay complete. ${result.rounds.length} rounds. Depositing...`);
      const deposit = await depositRelay();
      console.log(`Deposited: ${deposit.file}`);
      if (deposit.discoveries?.length) {
        console.log(`Discoveries: ${deposit.discoveries.join(', ')}`);
      }
    }
  } else if (cmd === 'next') {
    const injection = topic || null;
    const result = await runNextRound(injection);
    console.log(JSON.stringify(result, null, 2));
  } else if (cmd === 'stop') {
    const result = await stopRelay();
    console.log(JSON.stringify(result, null, 2));
  } else if (cmd === 'deposit') {
    const result = await depositRelay();
    console.log(JSON.stringify(result, null, 2));
  } else if (cmd === 'status') {
    console.log(JSON.stringify(getRelayStatus(), null, 2));
  } else {
    console.log('Usage: node triangulation-relay.js <start|run|next|stop|deposit|status> [topic]');
    console.log('  run <topic>  — full auto relay with vault deposit');
    console.log('  start <topic> — start relay, use "next" to advance');
    console.log('  next [injection] — run next round, optional Paul injection');
    console.log('  stop — stop active relay');
    console.log('  deposit — deposit stopped/converged relay to vault');
    console.log('  status — show active relay state');
  }
}
