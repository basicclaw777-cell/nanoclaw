#!/usr/bin/env node
/**
 * thought-intake.js — THE MOUTH (the wider front door)
 * =====================================================
 * Raw thought in → classified → routed into the metabolism → matures on its own.
 *
 * The Cathedral already DIGESTS thought (lenses, feed, crons, densifier, the
 * production engine). What it lacked was a wide mouth: capture that ROUTES
 * instead of just storing. /capture was a drawer. This is a mouth.
 *
 * Every thought Paul throws in gets:
 *   1. PRESERVED  — deposited raw to vault staging (nothing is ever lost; the
 *      densifier links it into the graph).
 *   2. ROUTED     — classified by DeepSeek into a worker task on the planner
 *      queue, tagged with the right agent/lens, so the production engine picks
 *      it up and it matures (through the now-gated ship loop).
 *   3. TRACEABLE  — logged with an id to thought-intake-log.jsonl so a thought
 *      can be followed from raw → what it became (loop visibility).
 *
 * The maturation is the existing metabolism. This file only opens the mouth.
 *
 * CJS-free ESM (nanoclaw .js = ESM). Loads .env for DEEPSEEK_API_KEY.
 *
 * CLI:
 *   node thought-intake.js "raw thought text"      # route one thought
 *   node thought-intake.js --dry "thought"         # classify, don't write
 * Library:
 *   import { routeThought } from './thought-intake.js'
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const HOME = process.env.HOME;
const PLANNER = join(HOME, 'Cathedral', 'emergence', 'planner-tasks.json');
const CAPTURES = join(HOME, 'cathedral-vault', '00_Staging', 'captures');
const LOG = join(HOME, 'nanoclaw', 'thought-intake-log.jsonl');

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || (() => {
  try { return readFileSync(join(HOME, 'nanoclaw', '.env'), 'utf8').match(/DEEPSEEK_API_KEY=(.+)/)?.[1]?.trim(); }
  catch { return null; }
})();

// Known agents the mouth can route to (must match registry agent ids).
const AGENTS = [
  'boxing', 'br', 'trading', 'universe', 'reed-director', 'maya', 'ling',
  'orc', 'cathy', 'muse', 'prospector', 'archaeologist', 'leonardo', 'forge',
];

function safeReadJSON(p, fallback) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; }
}

function stripFences(s) {
  return (s || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
}

async function callDeepSeek(system, prompt) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 800,
    }),
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

const SYSTEM = `You are the intake router for a personal AI system (the Cathedral) owned by Paul — boxing-gym owner, builder, esoteric researcher in Hong Kong.

A raw thought arrives. Classify it so it can be routed to the right worker and mature on its own.

Return ONLY a JSON object (no prose, no fences):
{
  "type": "task" | "question" | "idea" | "note",
  "agent": "<one agent id from the list, or null>",
  "action": "<a concrete verb-first instruction for that agent, OR null if purely reflective>",
  "title": "<short kebab title for the vault file>",
  "lens": "<which intelligence should turn this over: e.g. forensic, creative, business, embodied, truth>",
  "rationale": "<one sentence: why this routing>"
}

Definitions:
- task   = actionable; Paul wants something built/done. action REQUIRED.
- question = Paul wants an answer/research. action = the research instruction.
- idea   = a concept/principle worth maturing; may route to an agent to develop, or just incubate. action optional.
- note   = a fragment to preserve; usually no agent, no action.

Agent ids: ${AGENTS.join(', ')}.
Pick the agent whose domain best fits. boxing=technique/coaching, br=gym operations/members, trading=markets, universe=cosmology/esoteric, reed-director=visuals, maya=social, ling=HK tech, muse=cross-domain bridges, prospector=productizable IP, archaeologist=forgotten techniques, leonardo=structure/architecture, cathy=quality/drift, forge=code/build, orc=coordination.
If no agent fits, agent=null and action=null (pure incubation).`;

export async function routeThought(text, { dry = false } = {}) {
  const id = `th-${Date.now().toString(36)}-${Math.floor(parseInt(text.length.toString(), 10)).toString(36)}`;
  let routing;
  try {
    const raw = await callDeepSeek(SYSTEM, `Raw thought:\n"""${text}"""`);
    routing = JSON.parse(stripFences(raw));
  } catch (err) {
    // Fail-open: never lose a thought. Default to incubate-as-note.
    routing = { type: 'note', agent: null, action: null, title: 'unrouted-thought', lens: 'unsorted', rationale: `classify failed: ${err.message}` };
  }

  if (!AGENTS.includes(routing.agent)) routing.agent = null;
  const stamp = new Date().toISOString();
  const dateStr = stamp.slice(0, 10);
  const safeTitle = (routing.title || 'thought').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);

  const result = { id, ts: stamp, text, ...routing, deposited: null, queued: false };

  if (dry) return result;

  // 1. PRESERVE — raw thought to vault staging (densifier links it later).
  try {
    if (!existsSync(CAPTURES)) mkdirSync(CAPTURES, { recursive: true });
    const vaultPath = join(CAPTURES, `thought-${dateStr}-${safeTitle}-${id}.md`);
    const frontmatter = [
      '---',
      `id: ${id}`,
      `captured: ${stamp}`,
      `type: ${routing.type}`,
      `lens: ${routing.lens || 'unsorted'}`,
      routing.agent ? `routed_to: ${routing.agent}` : 'routed_to: incubation',
      'source: thought-intake',
      '---',
      '',
      `# ${routing.title || 'Thought'}`,
      '',
      text,
      '',
      `> Routed: ${routing.rationale || '—'}`,
    ].join('\n');
    writeFileSync(vaultPath, frontmatter);
    result.deposited = vaultPath;
  } catch (err) {
    result.depositError = err.message;
  }

  // 2. ROUTE — actionable thoughts become planner tasks (production engine matures them).
  if (routing.agent && routing.action && (routing.type === 'task' || routing.type === 'question' || routing.type === 'idea')) {
    try {
      const tasks = safeReadJSON(PLANNER, []);
      const list = Array.isArray(tasks) ? tasks : [];
      list.push({
        agent: routing.agent,
        category: 'paul-thought',
        description: routing.action,
        source: 'thought-intake',
        thoughtId: id,
        lens: routing.lens || null,
        status: 'pending',
        created: stamp,
      });
      writeFileSync(PLANNER, JSON.stringify(list, null, 2));
      result.queued = true;
    } catch (err) {
      result.queueError = err.message;
    }
  }

  // 3. TRACE — log so the thought can be followed from raw → what it became.
  try { appendFileSync(LOG, JSON.stringify(result) + '\n'); } catch {}

  return result;
}

// ── CLI ───────────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const text = args.filter((a) => a !== '--dry').join(' ').trim();
  if (!text) { console.log('Usage: node thought-intake.js [--dry] "raw thought"'); process.exit(1); }
  routeThought(text, { dry }).then((r) => {
    console.log(JSON.stringify(r, null, 2));
  }).catch((e) => { console.error(e); process.exit(1); });
}
