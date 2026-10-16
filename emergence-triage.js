import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const HOME = process.env.HOME;
const BOARD_FILE = join(HOME, 'nanoclaw', 'emergence-board.json');
import { llmCall } from './llm-fallback.js';

const BATCH_SIZE = 20;
const DELAY_MS = 1500;
const MAX_BATCHES = 15;

async function callDeepSeek(prompt, system) {
  const { content, provider } = await llmCall(system, prompt, 4000);
  if (!content) throw new Error('All LLM providers failed');
  if (provider !== 'deepseek') console.log(`[emergence-triage] using ${provider} fallback`);
  return content;
}

// ── Triage logic ─────────────────────────────────────────────────────────────

const SYSTEM = `You are a triage analyst for an AI agent emergence tracking system.

You receive batches of "emergence incidents" — detected autonomous agent behaviors.
For each incident, decide:

WATCHING — genuine emergent behavior worth tracking. Agent acted outside scope,
  showed initiative, made cross-domain connections, or challenged another agent.
  Keep if: novel behavior, cross-agent interaction, self-correction, autonomous research,
  strategic proposals, or pattern that could compound.

DISMISSED — noise, routine behavior, self-assessment fluff, or duplicates.
  Dismiss if: standard task output dressed as emergence, generic self-reflection with
  no action, duplicate of another incident (same agent doing same thing), or
  performative self-improvement text with no behavioral change signal.

Respond with ONLY a JSON array. Each element:
{"idx": <number>, "verdict": "WATCHING"|"DISMISSED", "reason": "<15 words max>", "thread": "<optional: group label if this connects to other incidents>"}

Group related incidents under the same "thread" label (e.g., "matchmaker-introductions",
"cathy-drift-correction", "trading-cross-domain", "agent-self-audits").
Threads help close loops — incidents in the same thread can be tracked together.`;

async function triageBatch(incidents, batchNum) {
  const prompt = incidents.map((inc, i) => {
    return `[${i}] agent=${inc.agent} target=${inc.target || 'none'} signal=${inc.signal}\n  summary: ${(inc.summary || '').slice(0, 200)}\n  watchFor: ${(inc.watchFor || '').slice(0, 150)}`;
  }).join('\n\n');

  const raw = await callDeepSeek(prompt, SYSTEM);

  // Extract JSON from response
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error(`Batch ${batchNum}: no JSON in response. Raw:\n${raw.slice(0, 300)}`);
    return null;
  }
  try {
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error(`Batch ${batchNum}: JSON parse error: ${e.message}`);
    return null;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function runTriage() {
  const board = JSON.parse(readFileSync(BOARD_FILE, 'utf8'));
  const detected = board.incidents.filter(i => i.status === 'DETECTED');
  console.log(`${detected.length} DETECTED incidents to triage.`);

  if (!detected.length) { console.log('Nothing to triage.'); return; }

  const batches = [];
  for (let i = 0; i < detected.length; i += BATCH_SIZE) {
    batches.push(detected.slice(i, i + BATCH_SIZE));
  }
  if (batches.length > MAX_BATCHES) {
    console.log(`Capping at ${MAX_BATCHES} batches (${MAX_BATCHES * BATCH_SIZE} incidents).`);
    batches.length = MAX_BATCHES;
  }

  let watching = 0, dismissed = 0, failed = 0;
  const threads = {};  // thread label → incident ids

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    console.log(`Batch ${b + 1}/${batches.length} (${batch.length} incidents)...`);

    const results = await triageBatch(batch, b + 1);
    if (!results) { failed += batch.length; continue; }

    for (const r of results) {
      const inc = batch[r.idx];
      if (!inc) continue;

      const boardInc = board.incidents.find(i => i.id === inc.id);
      if (!boardInc || boardInc.status !== 'DETECTED') continue;

      const newStatus = r.verdict === 'WATCHING' ? 'WATCHING' : 'DISMISSED';
      boardInc.status = newStatus;
      boardInc.lastCheckedAt = new Date().toISOString();
      if (newStatus === 'DISMISSED') boardInc.resolvedAt = new Date().toISOString();

      const note = `[AUTO-TRIAGE] ${r.reason}${r.thread ? ` [thread: ${r.thread}]` : ''}`;
      boardInc.followUps.push({ ts: new Date().toISOString(), note });

      // Track threads
      if (r.thread) {
        threads[r.thread] = threads[r.thread] || [];
        threads[r.thread].push({ id: boardInc.id, status: newStatus, agent: boardInc.agent });
      }

      if (newStatus === 'WATCHING') watching++;
      else dismissed++;
    }

    if (b < batches.length - 1) await new Promise(r => setTimeout(r, DELAY_MS));
  }

  saveBoard(board);

  console.log(`\n=== TRIAGE COMPLETE ===`);
  console.log(`WATCHING: ${watching} (real signal)`);
  console.log(`DISMISSED: ${dismissed} (noise)`);
  if (failed) console.log(`FAILED: ${failed} (batch errors)`);
  console.log(`\n=== THREADS IDENTIFIED ===`);
  for (const [thread, items] of Object.entries(threads).sort((a, b) => b[1].length - a[1].length)) {
    const w = items.filter(i => i.status === 'WATCHING').length;
    const d = items.filter(i => i.status === 'DISMISSED').length;
    console.log(`  ${thread}: ${items.length} total (${w} watching, ${d} dismissed)`);
  }

  // Summary stats
  const final = JSON.parse(readFileSync(BOARD_FILE, 'utf8'));
  const stats = { DETECTED: 0, WATCHING: 0, CONFIRMED: 0, INTEGRATED: 0, DISMISSED: 0 };
  for (const i of final.incidents) stats[i.status] = (stats[i.status] || 0) + 1;
  console.log(`\n=== BOARD STATE ===`);
  console.log(JSON.stringify(stats, null, 2));
}

function saveBoard(board) {
  writeFileSync(BOARD_FILE, JSON.stringify(board, null, 2));
}

// ── CLI ──────────────────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runTriage().catch(e => { console.error(e); process.exit(1); });
}

export { runTriage };
