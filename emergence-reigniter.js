import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

/**
 * emergence-reigniter.js — Reignite dead cross-agent asks as governed tasks.
 *
 * Scans WATCHING incidents where agent A asked agent B to do something,
 * extracts the ask, gets Orc/Cathy approval via DeepSeek, then creates
 * concrete tasks in planner-tasks.json with deliverables.
 *
 * Every reignited ask:
 *   1. Gets a concrete deliverable (not "think about" — VERB + output)
 *   2. Gets governance approval (Orc judges priority, Cathy judges quality)
 *   3. Becomes a planner task → production engine picks it up
 *   4. Completion advances the emergence incident to CONFIRMED
 *   5. Rejection advances to DISMISSED with reason
 *
 * CLI:
 *   node emergence-reigniter.js                  # run full cycle
 *   node emergence-reigniter.js --dry-run        # show proposals, don't write
 *   node emergence-reigniter.js --limit 10       # cap at N incidents
 *
 * Budget: ~1 DeepSeek call per 15 incidents (batched). Max 12 calls per run.
 */

const HOME = process.env.HOME;
const BOARD_FILE = join(HOME, 'nanoclaw', 'emergence-board.json');
const PLANNER_FILE = join(HOME, 'Cathedral', 'emergence', 'planner-tasks.json');
const REGISTRY_FILE = join(HOME, 'Cathedral', 'agents', 'registry.json');

import { llmCall } from './llm-fallback.js';

const BATCH_SIZE = 15;
const DELAY_MS = 1500;
const MAX_CALLS = 12;

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadJSON(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

function saveJSON(p, data) {
  writeFileSync(p, JSON.stringify(data, null, 2));
}

async function callDeepSeek(system, prompt) {
  const { content, provider } = await llmCall(system, prompt, 4000);
  if (!content) throw new Error('All LLM providers failed');
  if (provider !== 'deepseek') console.log(`[emergence-reigniter] using ${provider} fallback`);
  return content;
}

function sendTelegram(text) {
  const token = process.env.TELEGRAM_TOKEN || (() => {
    try { return readFileSync(join(HOME, 'nanoclaw', '.env'), 'utf8').match(/TELEGRAM_TOKEN=(.+)/)?.[1]?.trim(); }
    catch { return null; }
  })();
  const chatId = process.env.PAUL_CHAT_ID || (() => {
    try { return readFileSync(join(HOME, 'nanoclaw', '.env'), 'utf8').match(/PAUL_CHAT_ID=(.+)/)?.[1]?.trim(); }
    catch { return null; }
  })();
  if (!token || !chatId) return;
  fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  }).catch(() => {});
}

// ── Core ─────────────────────────────────────────────────────────────────────

const SYSTEM = `You are a governance layer for an AI agent system. Agents have made cross-agent requests that went unanswered. Your job:

1. For each request, extract the CONCRETE ASK (what agent A wanted agent B to do)
2. Judge: APPROVE or REJECT
   - APPROVE if: the ask is specific, actionable, within target agent's domain, and produces something useful
   - REJECT if: the ask is vague, self-referential fluff, outside target's capability, or duplicates existing work
3. For approved asks, rewrite as a TASK with:
   - A VERB (build, write, calculate, analyze, extract, compare, list, draft, backtest, map)
   - A specific DELIVERABLE (not "think about" — a concrete output)
   - Brief rationale linking to the original ask

Respond with ONLY a JSON array:
[
  {
    "idx": <number>,
    "verdict": "APPROVE"|"REJECT",
    "reason": "<20 words max>",
    "task": "<VERB + deliverable — only if APPROVE>",
    "requester": "<agent who asked>",
    "assignee": "<agent who should do it>"
  }
]

Be selective. Only approve asks that would produce real signal if completed.
Reject performative requests ("reflect on your growth") ruthlessly.
A good task: "List the 5 highest-confidence provenance chains in your domain with grade justification."
A bad task: "Consider how you might improve collaboration with other agents."`;

function extractCrossAgentAsks(board) {
  return board.incidents.filter(i =>
    i.status === 'WATCHING' &&
    i.target &&
    i.target !== 'none' &&
    i.target !== i.agent &&
    // Skip already-reignited (has a follow-up with [REIGNITED] tag)
    !i.followUps.some(f => f.note.includes('[REIGNITED]'))
  );
}

async function triageBatch(incidents, batchNum) {
  const prompt = incidents.map((inc, i) => {
    return `[${i}] ${inc.agent} → ${inc.target} | signal: ${inc.signal}
  ask: ${(inc.summary || '').slice(0, 250)}
  watchFor: ${(inc.watchFor || '').slice(0, 200)}`;
  }).join('\n\n');

  const raw = await callDeepSeek(SYSTEM, prompt);
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error(`Batch ${batchNum}: no JSON. Raw: ${raw.slice(0, 300)}`);
    return null;
  }
  try { return JSON.parse(jsonMatch[0]); }
  catch (e) {
    console.error(`Batch ${batchNum}: parse error: ${e.message}`);
    return null;
  }
}

async function run(opts = {}) {
  const board = loadJSON(BOARD_FILE);
  if (!board) { console.error('No emergence board'); process.exit(1); }

  let asks = extractCrossAgentAsks(board);
  console.log(`${asks.length} cross-agent asks eligible for reignition.`);

  if (opts.limit) asks = asks.slice(0, opts.limit);
  if (!asks.length) { console.log('Nothing to reignite.'); return; }

  // Load existing planner tasks
  let plannerTasks = loadJSON(PLANNER_FILE) || [];

  const batches = [];
  for (let i = 0; i < asks.length; i += BATCH_SIZE) batches.push(asks.slice(i, i + BATCH_SIZE));
  if (batches.length > MAX_CALLS) batches.length = MAX_CALLS;

  let approved = 0, rejected = 0, failed = 0;
  const reignited = [];

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    console.log(`Batch ${b + 1}/${batches.length} (${batch.length} asks)...`);

    const results = await triageBatch(batch, b + 1);
    if (!results) { failed += batch.length; continue; }

    for (const r of results) {
      const inc = batch[r.idx];
      if (!inc) continue;

      const boardInc = board.incidents.find(i => i.id === inc.id);
      if (!boardInc) continue;

      if (r.verdict === 'APPROVE' && r.task) {
        // Create planner task
        const task = {
          id: `reignite-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          agent: r.assignee || inc.target,
          description: r.task,
          category: 'emergence-reignite',
          source: `emergence:${inc.id}`,
          requester: r.requester || inc.agent,
          status: 'pending',
          createdAt: new Date().toISOString(),
          emergenceId: inc.id,
        };

        if (!opts.dryRun) {
          plannerTasks.push(task);
          boardInc.followUps.push({
            ts: new Date().toISOString(),
            note: `[REIGNITED] Task created for ${task.agent}: ${r.task.slice(0, 120)}. Requester: ${task.requester}. Reason: ${r.reason}`,
          });
          boardInc.lastCheckedAt = new Date().toISOString();
        }

        reignited.push({ id: inc.id, agent: inc.agent, target: inc.target, task: r.task, reason: r.reason });
        approved++;
      } else {
        // Rejected — advance to DISMISSED
        if (!opts.dryRun) {
          boardInc.status = 'DISMISSED';
          boardInc.resolvedAt = new Date().toISOString();
          boardInc.lastCheckedAt = new Date().toISOString();
          boardInc.followUps.push({
            ts: new Date().toISOString(),
            note: `[GOVERNANCE-REJECTED] ${r.reason}`,
          });
        }
        rejected++;
      }
    }

    if (b < batches.length - 1) await new Promise(r => setTimeout(r, DELAY_MS));
  }

  // Save
  if (!opts.dryRun) {
    saveJSON(BOARD_FILE, board);
    saveJSON(PLANNER_FILE, plannerTasks);
  }

  // Report
  console.log(`\n=== REIGNITION ${opts.dryRun ? '(DRY RUN) ' : ''}COMPLETE ===`);
  console.log(`APPROVED → tasks created: ${approved}`);
  console.log(`REJECTED → dismissed: ${rejected}`);
  if (failed) console.log(`FAILED (batch errors): ${failed}`);

  if (reignited.length) {
    console.log(`\n=== REIGNITED TASKS ===`);
    for (const r of reignited) {
      console.log(`  ${r.agent} → ${r.target}: ${r.task.slice(0, 100)}`);
    }
  }

  // Telegram summary
  if (!opts.dryRun && reignited.length) {
    const lines = [
      `<b>🔥 Emergence Reigniter</b>`,
      `${approved} dead asks → live tasks`,
      `${rejected} dismissed (noise)`,
      '',
      ...reignited.slice(0, 10).map(r =>
        `• <b>${r.agent}</b> → <b>${r.target}</b>\n  ${r.task.slice(0, 120)}`
      ),
      reignited.length > 10 ? `\n...and ${reignited.length - 10} more` : '',
      '',
      `Production engine picks these up next cycle.`,
    ];
    sendTelegram(lines.join('\n'));
  }

  // Board stats
  const stats = { DETECTED: 0, WATCHING: 0, CONFIRMED: 0, INTEGRATED: 0, DISMISSED: 0 };
  for (const i of board.incidents) stats[i.status] = (stats[i.status] || 0) + 1;
  console.log(`\n=== BOARD STATE ===`);
  console.log(JSON.stringify(stats, null, 2));

  return { approved, rejected, failed, reignited };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opts = {
    dryRun: args.includes('--dry-run'),
    limit: args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : 0,
  };
  if (opts.dryRun) console.log('DRY RUN — no changes will be written.\n');
  run(opts).catch(e => { console.error(e); process.exit(1); });
}

export { run as reignite };
