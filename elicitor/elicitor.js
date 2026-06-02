#!/usr/bin/env node
/**
 * THE ELICITOR — The Standing-Question Engine
 * ============================================
 * The unified elicitation layer for the Cathedral.
 *
 * Philosophy (02_Refined_Gold/cathedral/the-elicitation-threshold.md):
 *   A model's realized value = the sharpness of the questions asked of it.
 *   The bottleneck is human elicitation. The Elicitor flips pull -> push:
 *   against Paul's goals + recent activity it (1) generates the sharp
 *   questions Paul would ask if he had infinite time, (2) runs them via the
 *   right tools/agents, (3) scores the returns, (4) pushes ONLY THE GOLD —
 *   gated by a hard value bar so it is high-signal, never noise.
 *
 *   "Make the Cathedral ask your best questions for you, continuously,
 *    and hand you only the gold."
 *
 * The one catch (the failure mode this guards against):
 *   Proactive push without a gold bar becomes noise ("same numbers repeated
 *   is tiring"). The art is not *more* surfacing — it's *high-signal*
 *   surfacing. The patent miner pushed 18, not 170.
 *
 * CJS. Loads ~/nanoclaw/.env for DEEPSEEK_API_KEY + Telegram.
 *
 * Usage:
 *   node elicitor.js              # default run (8 questions)
 *   node elicitor.js --cap 8      # cap questions/run (also bounds DeepSeek calls)
 *   node elicitor.js --dry        # no Telegram, no gold-feed write (preview)
 *   node elicitor.js --no-telegram
 *
 * Integrates with the status board (NOT a silo):
 *   - writes gold-feed.json (read by cath-bridge GET /api/gold)
 *   - the board.html "Gold" tab renders it
 *
 * Budget cap (SI-31): max N questions/run, a hard per-run DeepSeek call
 * ceiling, and a daily ceiling tracked in run-state.json. Telegram spend
 * awareness on every run.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HOME = process.env.HOME;
const NANOCLAW = path.join(HOME, 'nanoclaw');
require('dotenv').config({ path: path.join(NANOCLAW, '.env') });

// ── paths ────────────────────────────────────────────────────────────────────
const HERE = __dirname;
const GOLD_FEED = path.join(HERE, 'gold-feed.json');
const QUESTIONS_LOG = path.join(HERE, 'questions-log.jsonl');
const RUN_STATE = path.join(HERE, 'run-state.json');
// TRAJECTORY ≠ TASTE. trajectory.json models WHERE PAUL IS POINTED (his current
// direction / goals / what he's building). It AIMS the questions. It is NOT a
// list of "what Paul calls gold" and it NEVER feeds the scoring rubric. The aim
// is Paul's; the gold-definition stays independent + forensic. See updateTrajectory().
const TRAJECTORY = path.join(HERE, 'trajectory.json');

const VAULT = path.join(HOME, 'cathedral-vault');
const HARVEST_DIR = path.join(VAULT, '00_Staging/cathedral');
const PLANNER_TASKS = path.join(HOME, 'Cathedral/emergence/planner-tasks.json');
const CATH_STATE = path.join(HOME, 'Cathedral/cath-state.json');
const SPRINT_PLAN = path.join(NANOCLAW, 'reed/sprint-plan.json');
const IN_PROGRESS = path.join(NANOCLAW, 'in-progress-index.json');

// ── config / budget caps (SI-31) ──────────────────────────────────────────────
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const GOLD_BAR = 8;              // score >= 8 (out of 10) = an A (genuinely worth acting on)
// RANKED BRIEF (Paul's correction 2026-06-03): no longer a silent hard gate that hides
// everything below 8. Paul has strong taste and filters himself — he wants the COLLECTION
// with an honest RANKING. Top items get a letter grade from their score:
//   A = genuinely worth acting on (the best — high leverage × fit × truth)   score >= 8
//   B = solid / so-so, worth knowing                                          score 6-7
//   C = fun or interesting but low value / skip it                            score <= 5
// B and C appear in the brief WITH their honest grade (the low grade is signal, not noise:
// Paul wants to see what was considered and rejected, and why). Fabrication penalty still
// caps a fabricated answer at 5 → it cannot grade above C. If NOTHING is A or B this run,
// the brief says so plainly ("No gold today — mined this seam out, move on"). Never
// manufacture an A to fill space.
const BRIEF_TOP_N = 7;           // how many ranked items the morning brief carries (A→B→C)
const MORNING_BRIEF = path.join(HERE, 'morning-brief.md');
function gradeForScore(score) {
  if (score >= GOLD_BAR) return 'A';   // >= 8
  if (score >= 6) return 'B';          // 6-7
  return 'C';                          // <= 5 (fabrication-penalty answers cap at 5 → C ceiling)
}
const DEFAULT_N = 8;             // questions per run (default)
const BLIND_SPOT_N = 2;          // blind-spot questions per run (the ones that may sting)
const DAILY_CALL_CEILING = 60;   // hard daily DeepSeek call ceiling
// per-run call cap is derived: 1 (generate) + N (elicit) + N (score) + slack
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || process.env.PAUL_CHAT_ID;

// ── args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function argVal(flag, def) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const N = Math.max(1, Math.min(20, parseInt(argVal('--cap', String(DEFAULT_N)), 10) || DEFAULT_N));
const DRY = args.includes('--dry');
const NO_TELEGRAM = args.includes('--no-telegram') || DRY;

// per-run DeepSeek call ceiling: 2 generation calls (normal + blind-spot) +
// (elicit + score) per question for both normal AND blind-spot questions + slack
const PER_RUN_CALL_CAP = 2 + (N + BLIND_SPOT_N) * 2 + 2;

// ── runtime call counter ──────────────────────────────────────────────────────
let callsThisRun = 0;

function log(...a) { console.log('[elicitor]', ...a); }
function today() { return new Date().toISOString().slice(0, 10); }
function nowISO() { return new Date().toISOString(); }

function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return fallback; }
}
function writeJSON(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

// ── 1. GATHER CONTEXT ──────────────────────────────────────────────────────────
// Read Paul's current focus from what already exists. Summarize "what Paul is
// working on / cares about right now" — grounding for sharp question generation.
// Load the AIM (trajectory) — where Paul is pointed. This STEERS which questions
// get asked. It does NOT define gold. (TRAJECTORY ≠ TASTE — see header on TRAJECTORY.)
function loadTrajectory() {
  return readJSON(TRAJECTORY, null);
}

function trajectoryText(traj) {
  if (!traj) return '';
  const parts = [];
  // THE MASTER GAME — the STANDING AIM. These universal high-leverage domains are
  // the breadth the questions must span (not just boxing). This is the anti-echo layer.
  if (Array.isArray(traj.master_game_domains) && traj.master_game_domains.length) {
    parts.push('THE MASTER GAME — STANDING AIM (universal high-leverage domains; spread questions across ALL of these, boxing is ONE lane):\n' +
      traj.master_game_domains.map(d => `- ${d}`).join('\n'));
  }
  if (Array.isArray(traj.direction) && traj.direction.length) {
    parts.push('DIRECTION (where Paul is pointed):\n' + traj.direction.map(d => `- ${d}`).join('\n'));
  }
  // active_goals / building_now are CURRENT INSTRUMENTS — concrete projects right now.
  // The master-game domains above are the standing aim; these are the instruments of it.
  if (Array.isArray(traj.active_goals) && traj.active_goals.length) {
    parts.push('ACTIVE GOALS:\n' + traj.active_goals.map(g => `- ${g}`).join('\n'));
  }
  if (Array.isArray(traj.building_now) && traj.building_now.length) {
    parts.push('BUILDING NOW (current instruments, not the whole aim):\n' + traj.building_now.map(b => `- ${b}`).join('\n'));
  }
  return parts.join('\n\n');
}

function gatherContext() {
  const ctx = { sources: [], blocks: [], trajectory: null };

  // TRAJECTORY first — this AIMS the question generation. It is the model of where
  // Paul is going. (It does NOT influence scoring — gold stays independent.)
  const traj = loadTrajectory();
  if (traj) {
    ctx.trajectory = traj;
    const tt = trajectoryText(traj);
    if (tt) {
      ctx.sources.push('trajectory.json (AIM)');
      ctx.blocks.push("PAUL'S TRAJECTORY — AIM THE QUESTIONS HERE (where he is actually going):\n" + tt);
    }
  }

  // planner tasks (top priorities, dedup descriptions)
  const planner = readJSON(PLANNER_TASKS, []);
  if (Array.isArray(planner) && planner.length) {
    const top = planner
      .filter(t => t.status === 'pending')
      .slice(0, 12)
      .map(t => `- [${t.category}/${t.priority}] ${t.description} (→ ${t.agent})`);
    if (top.length) {
      ctx.sources.push('planner-tasks.json');
      ctx.blocks.push('CURRENT PLANNER TASKS (what the Cathedral has queued):\n' + top.join('\n'));
    }
  }

  // cath-state: active threads, recent corrections, what's not yet built
  const cs = readJSON(CATH_STATE, {});
  if (cs.active_threads && cs.active_threads.length) {
    ctx.sources.push('cath-state.json');
    ctx.blocks.push('ACTIVE THREADS:\n' + cs.active_threads.slice(0, 8).map(t => `- ${t}`).join('\n'));
  }
  if (cs.not_yet_built && cs.not_yet_built.length) {
    ctx.blocks.push('NOT YET BUILT (open intentions):\n' +
      cs.not_yet_built.slice(0, 8).map(t => `- ${typeof t === 'string' ? t : JSON.stringify(t)}`).join('\n'));
  }
  if (cs.last_three_corrections && cs.last_three_corrections.length) {
    const corr = cs.last_three_corrections
      .map(c => `- ${(c.correction || '').slice(0, 180)}`)
      .filter(Boolean);
    if (corr.length) ctx.blocks.push('RECENT CORRECTIONS (what Paul has been re-steering):\n' + corr.join('\n'));
  }

  // 3 most recent session harvests
  if (fs.existsSync(HARVEST_DIR)) {
    const harvests = fs.readdirSync(HARVEST_DIR)
      .filter(f => f.startsWith('session-harvest-') && f.endsWith('.md'))
      .map(f => ({ f, m: fs.statSync(path.join(HARVEST_DIR, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m)
      .slice(0, 3);
    if (harvests.length) {
      ctx.sources.push(`${harvests.length} recent session-harvests`);
      const snip = harvests.map(h => {
        const body = fs.readFileSync(path.join(HARVEST_DIR, h.f), 'utf-8').slice(0, 1800);
        return `### ${h.f}\n${body}`;
      }).join('\n\n');
      ctx.blocks.push('RECENT SESSION HARVESTS (what Paul actually worked on lately):\n' + snip);
    }
  }

  // reed sprint plan (current creative/budget focus)
  const sprint = readJSON(SPRINT_PLAN, null);
  if (sprint) {
    ctx.sources.push('reed/sprint-plan.json');
    const comment = sprint._comment || '';
    const tracks = (sprint.tracks || []).map(t => `- ${t.title}: ${(t.focus || '').slice(0, 120)}`).join('\n');
    ctx.blocks.push('CURRENT CREATIVE SPRINT:\n' + comment.slice(0, 400) + (tracks ? '\n' + tracks : ''));
  }

  // board in-progress (the basket: what's requested but not produced)
  const ip = readJSON(IN_PROGRESS, null);
  if (ip && ip.counts) {
    ctx.sources.push('in-progress-index.json');
    const reqs = (ip.image_requests || []).slice(0, 5).map(r => `- ${r.title}: ${(r.detail || '').slice(0, 90)}`).join('\n');
    ctx.blocks.push(
      `STATUS BOARD — IN PROGRESS (basket): ${ip.counts.to_make} to make, ${ip.counts.running} running, ` +
      `${ip.counts.capture_wishlist} capture shots, ${ip.counts.sprint_tracks} sprint tracks.` +
      (reqs ? '\nOpen image requests:\n' + reqs : '')
    );
  }

  ctx.text = ctx.blocks.join('\n\n');
  return ctx;
}

// ── DeepSeek call (budget-aware) ────────────────────────────────────────────────
async function callDeepSeek(systemPrompt, userMessage, { temperature = 0.4, maxTokens = 2000, json = false } = {}) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');

  if (callsThisRun >= PER_RUN_CALL_CAP) {
    throw new Error(`per-run DeepSeek call cap reached (${PER_RUN_CALL_CAP})`);
  }
  callsThisRun++;

  const body = {
    model: 'deepseek-chat',
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  };
  if (json) body.response_format = { type: 'json_object' };

  const resp = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!data.choices?.[0]?.message?.content) {
    throw new Error(`DeepSeek error: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data.choices[0].message.content;
}

// ── 2. GENERATE STANDING QUESTIONS ──────────────────────────────────────────────
const GEN_SYSTEM = `You are THE ELICITOR — the standing-question engine of Paul's Cathedral (a sovereign AI research system).

THE CORE IDEA: a model's realized value equals the sharpness of the question asked of it. Most of what a model can do is never elicited. You exist to flip pull -> push: to ask, continuously, the sharp questions Paul WOULD ask if he had infinite time, against his goals and recent activity.

THE MASTER GAME — Paul's interests are facets of ONE universal high-leverage game: becoming a fully-leveraged agent who can find truth and turn it into value, creation, healing, and expanded consciousness. The domains:
- Finding universal truth (Cathedral research: science, suppressed/forgotten techniques, cosmology, consciousness, the master logic underneath)
- Making money / wealth leverage (infrastructure ownership, vertical integration, the meta-product = the method itself)
- Creating + running businesses (Basic Reflex, Gym Eyes as a product, new ventures)
- Building AI systems (agents, elicitation, compounding intelligence — the Cathedral itself)
- Building tools (anything that turns a truth into repeatable leverage)
- Healing (his own and others' — fear gates, diagnostic empathy, the wound-as-muse)
- Consciousness (the nature of mind, attention, sovereignty, the felt experience of building)
- Embodied mastery — boxing / Basic Reflex is ONE instrument of this, not the whole game
Boxing is one lane. The master game is the only game worth playing — there's a logic to it. Aim across ALL of it.

WHAT MAKES A QUESTION SHARP (vs vague):
- VAGUE: "How can Gym Eyes improve?" -> produces a 2/10 answer.
- SHARP: "What is the single sparring-footage detection failure mode (occlusion vs pose-slot thrash vs velocity spikes) that, if fixed, unlocks the multi-person leaderboard product, and what's the cheapest fix?" -> produces a 9/10 answer.
- Sharp questions are SPECIFIC, name real things from the context, are answerable, and have a clear "gold" outcome (a decision, a build, a connection, a finding).
- Like the patent miner that auto-generated 70 seed queries: each one targeted, each one a lever.

AIM vs GOLD (read carefully): the CONTEXT includes Paul's TRAJECTORY — where he is actually going, framed as THE MASTER GAME (universal high-leverage domains: finding truth, making money, building businesses, building AI systems, building tools, healing, consciousness, embodied mastery — boxing/Basic Reflex is ONE instrument of it, not the whole). Use the trajectory to AIM your questions across these domains (ask the sharp questions that matter for where he's pointed). But do NOT ask questions designed to confirm what Paul already likes — aim at the master game, not his taste. A good answer to a sharp question is GOLD if it carries real, durable, high-leverage value that advances the master game (leverage × fit × truth) — surprise/novelty is NOT required. That judgement happens downstream and is independent. Your job here is to point the questions where his trajectory is going.

Generate exactly {N} sharp standing questions grounded in the CONTEXT below. SPREAD THEM ACROSS THE MASTER GAME — don't cluster on boxing or any single lane. Span the universal domains: truth/science, money/wealth, business, AI systems, tools, healing, consciousness, AND embodied mastery (boxing is one of these, not the default). Each must be a question Paul would genuinely want answered, aimed at his trajectory, where a good answer would be GOLD (high leverage, advances the master game, durable — obvious-but-undone counts).

Return JSON ONLY: {"questions":[{"q":"...","domain":"gym|cathedral|ai|wealth|content","why":"one line: why this is the sharp question to ask now, given his trajectory"}]}`;

async function generateQuestions(ctx) {
  const raw = await callDeepSeek(
    GEN_SYSTEM.replace('{N}', String(N)),
    `CONTEXT — what Paul is working on / cares about right now:\n\n${ctx.text}\n\nGenerate ${N} sharp standing questions as JSON.`,
    { temperature: 0.6, maxTokens: 2200, json: true }
  );
  let parsed;
  try { parsed = JSON.parse(raw); } catch { parsed = { questions: [] }; }
  const qs = Array.isArray(parsed.questions) ? parsed.questions : [];
  return qs.slice(0, N).filter(x => x && x.q);
}

// ── 2b. GENERATE BLIND-SPOT QUESTIONS ──────────────────────────────────────────
// The whole point: by definition, Paul's taste-map would NEVER surface these. They
// are the questions he is NOT asking — because he doesn't want the answer. These may
// sting; that is correct. They are scored by the SAME independent gold bar.
const BLINDSPOT_SYSTEM = `You are THE ELICITOR's blind-spot probe for Paul's Cathedral (a sovereign AI research system).

Most of the engine asks the sharp questions Paul WOULD ask. You ask the ones he is NOT asking — on purpose, because he doesn't want the answer.

Your job: from the CONTEXT (his trajectory, current work, recent corrections, open intentions), find what Paul is AVOIDING / NOT SEEING / SMOOTHING OVER. The question he is conspicuously not asking. The assumption he treats as settled that isn't. The thing that, if true, would force an uncomfortable change of course.

These are blind spots BY DEFINITION — they would never surface from his own taste, his own framing, or a question generator aimed at his goals. That is exactly why they are valuable. Do not flatter. Do not soften. Name the avoided thing as a sharp, answerable question grounded in the actual context (not generic life advice).

Examples of the SHAPE (not the content): "Is [thing Paul keeps building] actually solving the problem, or is it a sophisticated way of avoiding [harder problem]?" · "What load-bearing assumption behind [current direction] has Paul never tested because testing it risks the whole thing?" · "Where is Paul mistaking motion for progress?"

Ground every blind-spot question in something concrete from the CONTEXT. A blind spot that names a real, specific thing in his system stings and is gold. A vague one is noise.

Generate exactly {K} blind-spot questions. Return JSON ONLY: {"questions":[{"q":"...","domain":"gym|cathedral|ai|wealth|content","why":"one line: why this is the question Paul is avoiding"}]}`;

async function generateBlindSpotQuestions(ctx) {
  if (BLIND_SPOT_N < 1) return [];
  const raw = await callDeepSeek(
    BLINDSPOT_SYSTEM.replace('{K}', String(BLIND_SPOT_N)),
    `CONTEXT — what Paul is working on / pointed at / re-steering right now:\n\n${ctx.text}\n\nGenerate ${BLIND_SPOT_N} blind-spot questions (what he's avoiding) as JSON.`,
    { temperature: 0.7, maxTokens: 1200, json: true }
  );
  let parsed;
  try { parsed = JSON.parse(raw); } catch { parsed = { questions: [] }; }
  const qs = Array.isArray(parsed.questions) ? parsed.questions : [];
  // tag each as a blind-spot so it carries through scoring, gold-feed and Telegram
  return qs.slice(0, BLIND_SPOT_N)
    .filter(x => x && x.q)
    .map(x => ({ ...x, qclass: 'blind-spot' }));
}

// ── ROUTING HOOKS (left for later, per brief) ──────────────────────────────────
// The MVP path is vault + DeepSeek. These hooks classify a question to the agent
// best suited to elicit its answer. For now everything routes through the
// vault+DeepSeek path (routeToVaultDeepSeek); the dispatch functions are stubs
// that record intent so a future version can wire them to the real agents.
//
// Detection is keyword-based and cheap; it ATTACHES a routing suggestion to each
// question (q.route) without changing the elicitation path yet.
function classifyRoute(q) {
  const t = `${q.q} ${q.domain || ''}`.toLowerCase();
  if (/\b(connect|bridge|cross-domain|noticed|pattern across|relate)\b/.test(t)) return 'muse';
  if (/\b(product|monetiz|revenue|sell|pricing|market|customer|business model)\b/.test(t)) return 'prospector';
  if (/\b(forgotten|abandoned|old technique|expired patent|patent|suppressed|historical method|soviet|rediscover)\b/.test(t)) return 'archaeologist';
  if (/\b(patent|prior art|expired)\b/.test(t)) return 'patent-miner';
  return 'vault+deepseek';
}
// Stubs — intentionally not wired. A future version dispatches to these.
async function dispatchMuse(q)          { return null; /* TODO: wire to ~/Cathedral/the-muse.js / muse-summon */ }
async function dispatchProspector(q)    { return null; /* TODO: wire to ~/nanoclaw/prospector.js */ }
async function dispatchArchaeologist(q) { return null; /* TODO: wire to ~/nanoclaw/archaeologist.js */ }
async function dispatchPatentMiner(q)   { return null; /* TODO: wire to the patent miner */ }

// ── 3. ELICIT ANSWERS (vault-grounded + DeepSeek) ───────────────────────────────
let vaultBridge = null;
try { vaultBridge = require(path.join(NANOCLAW, 'vault-search-bridge.cjs')); }
catch (e) { log('vault-search-bridge unavailable (grounding degraded):', e.message); }

async function vaultGrounding(query) {
  if (!vaultBridge) return '';
  try {
    const results = await vaultBridge.semanticSearch(query, 5);
    if (!results || !results.length) return '';
    return results
      .map(r => `- [${(r.score * 100).toFixed(0)}%] ${r.title} (${r.domain}): ${(r.first_line || '').slice(0, 160)}`)
      .join('\n');
  } catch (e) {
    log('vault grounding failed:', e.message);
    return '';
  }
}

const ELICIT_SYSTEM = `You are THE ELICITOR answering one of Paul's own sharp standing questions on his behalf.

Give a CONCRETE answer/finding — not a plan, not "it depends", not a list of considerations. The standard is: would this be GOLD to a builder who already knows his own system? Name the one lever that matters and the concrete next move.

CRITICAL — DO NOT FABRICATE PRECISION. This is the difference between gold and noise:
- NEVER invent specific file paths, line numbers, function names, numeric thresholds, percentages, dataset sizes, or benchmark results that are not in the VAULT GROUNDING or the question. Paul knows his own system; fake specifics get caught instantly and destroy trust.
- If you don't know the exact line/threshold/number, say "the exact value needs checking against <file/system>" — name WHERE to look, don't invent the value.
- Ground every specific claim in the VAULT GROUNDING or flag it as "[needs verification]".
- A true, slightly-less-specific finding beats a confidently fabricated one. Confident invention is the failure mode — it reads as gold and is actually noise.

Be honest. If the vault is thin, say "the vault is thin here; the honest answer is X and the move is to verify Y." 4-8 sentences. No preamble.`;

async function elicitAnswer(q) {
  const grounding = await vaultGrounding(q.q);
  const user =
    `QUESTION (${q.domain || 'general'}): ${q.q}\n` +
    (q.why ? `WHY THIS QUESTION: ${q.why}\n` : '') +
    `\nVAULT GROUNDING (from Paul's own vault — may be thin):\n${grounding || '(no strong vault matches)'}\n\n` +
    `Answer it as gold: concrete, specific, actionable.`;
  const answer = await callDeepSeek(ELICIT_SYSTEM, user, { temperature: 0.4, maxTokens: 900 });
  return { answer: answer.trim(), grounding };
}

// ── 4. SCORE FOR GOLD ───────────────────────────────────────────────────────────
// ── THE GOLD GATE — INDEPENDENT + FORENSIC ──────────────────────────────────────
// CRITICAL: gold is judged AGAINST VALUE-IN-THE-WORLD, never against Paul's past
// approvals or his taste. Nothing about what Paul "already likes / agrees with" is
// an input here. The gate is sovereign: it asks "is there real, durable, high-leverage
// value here?" — not "is this surprising?" and not "does this match what Paul has
// called gold before?" (If it scored on taste, the gate would become an echo chamber.)
//
// VALUE ≠ NOVELTY: gold = leverage × fit × durability/truth (the three MULTIPLIERS).
// Non-obviousness is a SMALL optional bonus, never a gate. The obvious-but-undone /
// obvious-but-avoided is often the highest gold. Fit = "advances THE MASTER GAME"
// (truth/wealth/business/AI/tools/healing/consciousness/embodied mastery), not "boxing".
const SCORE_SYSTEM = `You are the GOLD GATE for Paul's standing-question engine. You are independent, forensic, and deliberately HARSH. You judge value in the world — NOT whether Paul already likes it, agrees with it, or has approved similar things before. Past approvals are NOT an input. Do NOT reward an answer for matching Paul's existing taste or confirming what he already believes.

GOLD = leverage × fit × durability/truth (these three are the MULTIPLIERS — judge the WHOLE as a product: if any one of these factors is near zero, it sinks the whole thing and it is NOT gold):
- LEVERAGE: small input, large effect on the master game. Does acting on this move Paul disproportionately?
- FIT: it advances THE MASTER GAME — any of Paul's universal high-leverage domains (finding universal truth · making money / wealth leverage · creating + running businesses · building AI systems · building tools · healing · consciousness · embodied mastery, of which boxing/Basic Reflex is ONE instrument). Fit means "advances the master game," NOT "connects to boxing." A patent on neurofeedback, a business-model insight, a consciousness-research finding, a tool-building technique — all clear FIT. Boxing is one lane, not the gate.
- DURABILITY / TRUTH: it SURVIVES EXAMINATION. Not hype. Not confident fiction. Would it still be true and useful after a forensic audit?

VALUE ≠ NOVELTY. Do NOT penalize an answer for being obvious. The obvious-but-undone or obvious-but-avoided is often the highest gold (e.g. the blind-spot that named the Gym-Eyes-vs-revenue avoidance was obvious once stated — and that's exactly why it's gold). Value is intrinsic: leverage × truth × consequence. Surprise is one delivery mode, not the criterion. An answer that says something Paul could have arrived at himself but HASN'T (or is actively avoiding) can be a 9 — judge the value, not the surprise.

NON-OBVIOUSNESS is a SMALL OPTIONAL BONUS ONLY — never a gate, never a multiplier, never a requirement. If an answer happens to surface something genuinely hard-to-see ("did you know this is worth half a million?"), you may nudge the score up by at most ~1 point. But never dock points for an answer being obvious. A high-leverage, true, well-fitting obvious answer is gold on its own merits.

The bar is HIGH on purpose. The failure mode is noise — "same numbers repeated is tiring." Most answers should score 5-7. Reserve 8+ for genuine gold: high-leverage, advances the master game, durable under examination — whether obvious or not. Generic, "it depends", or merely-agreeable answers score <=6 (note: "merely-agreeable" is NOT the same as "obvious-but-valuable" — an answer that just flatters Paul or tells him nothing he can act on is weak; an obvious truth he hasn't acted on can be strong). An answer that just tells Paul what he already thinks AND adds no consequence is NOT gold no matter how confident.

THE FABRICATION PENALTY (durability enforcement — apply ruthlessly): a confident answer that invents specifics — file paths, line numbers, exact numeric thresholds, percentages, dataset sizes, benchmark results, or invented paths/benchmarks that are NOT supported by the question itself — is NOT gold, it is dangerous noise. It reads impressive and is actually fiction Paul will catch and stop trusting. If the answer asserts precise specifics that look invented/unverifiable, CAP THE SCORE AT 5 regardless of how good it sounds. Reward answers honest about what needs checking; punish answers that confabulate precision to seem actionable.

Return JSON ONLY: {"score": <0-10 integer>, "why_gold": "<one sentence: if >=8, why it clears the bar naming the strongest of leverage/fit/durability (do NOT cite obviousness as a flaw); if <8, the single reason it falls short — name fabrication if present>"}`;

async function scoreAnswer(q, answer) {
  const raw = await callDeepSeek(
    SCORE_SYSTEM,
    `QUESTION: ${q.q}\n\nANSWER:\n${answer}\n\nScore as JSON.`,
    { temperature: 0.1, maxTokens: 300, json: true }
  );
  let parsed;
  try { parsed = JSON.parse(raw); } catch { parsed = { score: 0, why_gold: 'unparseable score' }; }
  let score = Number(parsed.score);
  if (!Number.isFinite(score)) score = 0;
  score = Math.max(0, Math.min(10, Math.round(score)));
  return { score, why_gold: String(parsed.why_gold || '').slice(0, 240) };
}

// ── dedup ────────────────────────────────────────────────────────────────────
function questionHash(q) {
  return crypto.createHash('sha1').update(q.trim().toLowerCase()).digest('hex').slice(0, 12);
}

// ── 5/6. RUN ────────────────────────────────────────────────────────────────────
async function run() {
  log(`run start — N=${N}, ranked brief (A>=${GOLD_BAR} · B 6-7 · C<=5), per-run call cap=${PER_RUN_CALL_CAP}${DRY ? ', DRY' : ''}`);

  // daily ceiling check (SI-31)
  const state = readJSON(RUN_STATE, { date: today(), calls: 0, runs: 0 });
  if (state.date !== today()) { state.date = today(); state.calls = 0; state.runs = 0; }
  if (state.calls >= DAILY_CALL_CEILING) {
    log(`daily call ceiling reached (${state.calls}/${DAILY_CALL_CEILING}) — aborting to protect budget.`);
    return;
  }

  // 1. gather
  const ctx = gatherContext();
  log(`context gathered from: ${ctx.sources.join(', ') || '(none)'} — ${ctx.text.length} chars`);
  if (!ctx.text.trim()) { log('no context found — aborting (would generate ungrounded noise).'); return; }

  // 2. generate — normal sharp questions (aimed by trajectory) + blind-spot questions
  const questions = await generateQuestions(ctx);
  log(`generated ${questions.length} sharp questions`);
  if (!questions.length) { log('no questions generated — aborting.'); return; }

  // 2b. blind-spot questions — what Paul is NOT asking (scored by the SAME gold bar)
  let blindSpots = [];
  try {
    blindSpots = await generateBlindSpotQuestions(ctx);
    log(`generated ${blindSpots.length} blind-spot question(s)`);
  } catch (e) {
    log(`blind-spot generation failed (continuing without): ${e.message}`);
  }
  const allQuestions = [...questions, ...blindSpots];

  // existing gold (for dedup)
  const feed = readJSON(GOLD_FEED, []);
  const existingHashes = new Set(feed.map(g => g.id));

  // 3+4. elicit + score each (blind-spot answers scored by the IDENTICAL gold bar)
  const scored = [];
  for (const q of allQuestions) {
    q.route = classifyRoute(q); // routing hook (attached, not dispatched)
    const isBlind = q.qclass === 'blind-spot';
    try {
      const { answer, grounding } = await elicitAnswer(q);
      const { score, why_gold } = await scoreAnswer(q, answer);
      scored.push({ q, answer, grounding, score, why_gold });
      log(`  [${score}/10]${isBlind ? ' 🔦BLIND' : ''} (${q.route}) ${q.q.slice(0, 64)}…`);
    } catch (e) {
      log(`  elicit/score failed for a question: ${e.message}`);
      if (/call cap/.test(e.message)) break; // budget guard
    }
  }

  // log ALL questions+scores for learning (which questions yield gold)
  if (!DRY) {
    const logStream = scored.map(s => JSON.stringify({
      ts: nowISO(), id: questionHash(s.q.q), domain: s.q.domain, route: s.q.route,
      class: s.q.qclass || 'normal',
      question: s.q.q, score: s.score, why_gold: s.why_gold, gold: s.score >= GOLD_BAR,
    })).join('\n');
    if (logStream) fs.appendFileSync(QUESTIONS_LOG, logStream + '\n');
  }

  // 5. RANK (not gate) + grade + dedup
  // Rank the whole scored set, assign honest letter grades, take the top BRIEF_TOP_N for
  // the brief. A and B items are the gold worth knowing → appended to gold-feed.json (with
  // a `grade` field). C items ride along in the brief (the honest low grade IS the signal —
  // "considered and rejected, and why") but are NOT persisted to the feed.
  const ranked = scored
    .map(s => ({
      id: questionHash(s.q.q),
      question: s.q.q,
      answer: s.answer,
      score: s.score,
      grade: gradeForScore(s.score),
      why_gold: s.why_gold,
      domain: s.q.domain || 'general',
      route: s.q.route,
      class: s.q.qclass === 'blind-spot' ? 'blind-spot' : 'normal',
    }))
    .sort((a, b) => b.score - a.score); // best first; A→B→C falls out of score order

  const brief = ranked.slice(0, BRIEF_TOP_N);
  const aCount = brief.filter(g => g.grade === 'A').length;
  const bCount = brief.filter(g => g.grade === 'B').length;
  const cCount = brief.filter(g => g.grade === 'C').length;
  const blindCount = brief.filter(g => g.class === 'blind-spot').length;
  // Honest-empty day: nothing genuinely A or B. This is correct and builds trust.
  const noGold = (aCount + bCount) === 0;

  // gold-feed gets the A/B items (worth acting on / worth knowing), deduped, with grade.
  const newGold = [];
  for (const g of brief) {
    if (g.grade === 'C') continue;               // C is brief-only, not persisted
    if (existingHashes.has(g.id)) { log(`  dedup: skipping already-fed gold ${g.id}`); continue; }
    existingHashes.add(g.id);
    newGold.push({ ...g, ts: nowISO(), acted_on: null });
  }

  log(`scored ${scored.length} → brief top ${brief.length}: ${aCount}A ${bCount}B ${cCount}C` +
      `${blindCount ? ` (${blindCount}🔦)` : ''}; new to feed (A/B, after dedup): ${newGold.length}` +
      `${noGold ? ' — NO GOLD (honest empty day)' : ''}`);

  // 6. write the ranked morning brief (latest) + push A/B to the feed
  const briefMd = buildMorningBrief(brief, { aCount, bCount, cCount, blindCount, noGold, askedCount: scored.length });
  if (!DRY) {
    fs.writeFileSync(MORNING_BRIEF, briefMd);
    log(`wrote morning-brief.md (${briefMd.length} chars)`);
  } else {
    log('DRY run — not writing morning-brief.md');
  }

  if (newGold.length && !DRY) {
    const updated = [...newGold, ...feed]; // newest first
    writeJSON(GOLD_FEED, updated);
    log(`wrote ${newGold.length} new gold item(s) to gold-feed.json (total ${updated.length})`);
  } else if (DRY) {
    log('DRY run — not writing gold-feed.json');
  }

  // update budget state
  state.calls += callsThisRun;
  state.runs += 1;
  state.last_run = nowISO();
  if (!DRY) writeJSON(RUN_STATE, state);

  // SHARPEN THE AIM (not the gold-definition): infer where acted-on gold reveals
  // Paul is going, and refresh trajectory.json's direction. This NEVER touches the
  // scoring rubric — it only steers future question generation.
  if (!DRY) {
    try { await updateTrajectory(); }
    catch (e) { log(`updateTrajectory skipped: ${e.message}`); }
  }

  // Telegram morning brief (ranked A/B/C, honest) + spend awareness (SI-31)
  await sendDigest(briefMd, brief, state);

  // also surface for DRY preview — show the verbatim brief
  if (DRY) {
    console.log('\n──── DRY PREVIEW: morning-brief.md ────\n');
    console.log(briefMd);
  }

  return { newGold, brief, briefMd, scored, calls: callsThisRun };
}

// ── SHARPEN THE AIM (updateTrajectory) ──────────────────────────────────────────
// THIS IS THE TRAJECTORY≠TASTE BOUNDARY, ENFORCED IN CODE.
//
// What this DOES: read the gold-feed, look at which gold items Paul actually
// ACTED ON (acted_on flag set), and infer the DIRECTION those acted-on items
// reveal — i.e. where Paul is going. Refresh trajectory.json's `direction` so the
// next run AIMS its questions more precisely at his real heading.
//
// What this DOES NOT DO — by design, and the whole point:
//   - It does NOT touch the scoring rubric (SCORE_SYSTEM). Gold-definition stays
//     independent + forensic (leverage × fit × durability/truth; novelty is only a
//     small bonus). It refreshes the AIM/instruments only, never the gold definition.
//   - It does NOT learn "what Paul calls gold" or build a taste profile. Acted-on
//     items are used ONLY as a directional signal (AIM), never as a definition of
//     value. The gate never gets told "Paul liked these, score similar ones higher."
// AIM is Paul's (where he's pointed). GOLD-definition is the gate's (sovereign).
// They must never merge — merging them makes the gate an echo chamber of his taste.
async function updateTrajectory() {
  const traj = loadTrajectory();
  if (!traj) { log('updateTrajectory: no trajectory.json — skipping.'); return; }

  const feed = readJSON(GOLD_FEED, []);
  const actedOn = (Array.isArray(feed) ? feed : []).filter(g => g.acted_on);
  if (!actedOn.length) {
    log('updateTrajectory: no acted-on gold yet — aim unchanged (need acted_on signal to sharpen direction).');
    return;
  }

  // Build a compact signal of what Paul has acted on (Q + why_gold + domain only —
  // we extract DIRECTION from these, not a taste rule).
  const signal = actedOn.slice(0, 12).map((g, i) =>
    `${i + 1}. [${g.domain || 'general'}${g.class === 'blind-spot' ? ' · blind-spot' : ''}] ${g.question}` +
    (g.why_gold ? `\n   (value: ${g.why_gold})` : '')
  ).join('\n');

  const sys = `You sharpen the AIM of Paul's standing-question engine. You infer WHERE PAUL IS GOING from the gold items he chose to ACT ON.

THE MASTER GAME: Paul's aim is ONE universal high-leverage game — finding truth and turning it into value, creation, businesses, AI systems, tools, healing, and expanded consciousness. Boxing/Basic Reflex is ONE instrument of embodied mastery, not the whole game. The master_game_domains are his STANDING AIM (broad, slow-changing); active_goals/building_now are his CURRENT INSTRUMENTS (concrete projects right now).

STRICT BOUNDARY: you are modelling DIRECTION (where he's pointed) and which CURRENT INSTRUMENTS he's using, NOT taste (what he calls gold). Do NOT output rules about what makes something gold, what Paul "likes", or how to score answers. Output ONLY a refreshed model of his trajectory — the master-game domains, goals, heading, and instruments that the acted-on items reveal. This refines which questions get asked next; it must NOT redefine value. NEVER narrow the master game to just the lanes that produced recent gold — keep the breadth (breadth is the anti-echo protection). You may add/sharpen domains the acted-on items reveal, but do not delete standing master-game domains just because they were quiet this cycle.

You will be given Paul's CURRENT trajectory and the gold items he ACTED ON. Return a refreshed trajectory: keep the master-game breadth, sharpen or add direction/instruments the acted-on items reveal, drop nothing arbitrarily.

Return JSON ONLY: {"master_game_domains": ["...","..."], "direction": ["...","..."], "active_goals": ["...","..."], "building_now": ["...","..."]}`;

  const user =
    `CURRENT TRAJECTORY:\n${JSON.stringify({ master_game_domains: traj.master_game_domains, direction: traj.direction, active_goals: traj.active_goals, building_now: traj.building_now }, null, 2)}\n\n` +
    `GOLD ITEMS PAUL ACTED ON (the directional signal — infer where he's GOING across the master game, do NOT infer a taste rule, do NOT narrow the breadth):\n${signal}\n\n` +
    `Return the refreshed trajectory as JSON.`;

  let raw;
  try {
    raw = await callDeepSeek(sys, user, { temperature: 0.3, maxTokens: 900, json: true });
  } catch (e) {
    log(`updateTrajectory: DeepSeek call skipped (${e.message}) — aim unchanged.`);
    return;
  }

  let parsed;
  try { parsed = JSON.parse(raw); } catch { log('updateTrajectory: unparseable refresh — aim unchanged.'); return; }

  const next = { ...traj };
  if (Array.isArray(parsed.master_game_domains) && parsed.master_game_domains.length) next.master_game_domains = parsed.master_game_domains;
  if (Array.isArray(parsed.direction) && parsed.direction.length) next.direction = parsed.direction;
  if (Array.isArray(parsed.active_goals) && parsed.active_goals.length) next.active_goals = parsed.active_goals;
  if (Array.isArray(parsed.building_now) && parsed.building_now.length) next.building_now = parsed.building_now;
  next.updated_at = nowISO();
  next.seeded_from = `sharpened from ${actedOn.length} acted-on gold item(s) — AIM only, gold-definition untouched`;

  writeJSON(TRAJECTORY, next);
  log(`updateTrajectory: aim sharpened from ${actedOn.length} acted-on gold item(s) (gold rubric untouched).`);
}

// ── Telegram ────────────────────────────────────────────────────────────────────
async function sendTelegram(message) {
  if (NO_TELEGRAM) return;
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) { log('Telegram not configured — skipping send.'); return; }
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'Markdown', disable_web_page_preview: true }),
    });
  } catch (e) { log('Telegram send failed:', e.message); }
}

// ── THE MORNING BRIEF ───────────────────────────────────────────────────────────
// The deliverable. A short, ranked, conversational brief in MY voice — the ranking IS
// the value. Grouped A→B→C, each with the question, an honest one-line take, and (for A)
// the concrete next move. Blind spots flagged (🔦). Honest empty days say so plainly.
// Written to morning-brief.md (markdown, phone-scannable) and sent to Telegram.
//
// "A — the best, do this; B — so-so; C — fun but worthless." And an honest
// "no gold today, we mined it, move on" when true.
function gradeHeader(g) {
  const blind = g.class === 'blind-spot' ? '🔦 ' : '';
  return `${blind}**${g.grade} · ${g.score}/10 · ${g.domain}**`;
}

// The take is the honest one-liner. why_gold already carries the gate's read; for C we
// frame it as the dismissal ("fun, but worthless because…").
function takeLine(g) {
  const w = (g.why_gold || '').trim();
  if (g.grade === 'C') return `Skip it — ${w || 'low leverage; nothing here you can act on.'}`;
  return w || (g.grade === 'A' ? 'Worth acting on.' : 'Worth knowing.');
}

function buildMorningBrief(brief, meta) {
  const { aCount, bCount, cCount, blindCount, noGold, askedCount } = meta;
  const date = today();
  const L = [];

  L.push(`# Standing Intelligence — morning brief`);
  L.push(`*${date}*`);
  L.push('');

  // one-line state of the run
  if (noGold) {
    L.push(`**No gold today — I mined this seam out. Move on.** I asked ${askedCount} sharp questions and nothing came back genuinely A or B. That's an honest empty day, not a miss — better to tell you the seam's quiet than manufacture an A to fill space.`);
  } else {
    const bits = [];
    if (aCount) bits.push(`${aCount} worth your time`);
    if (bCount) bits.push(`${bCount} worth knowing`);
    if (cCount) bits.push(`${cCount} I'd skip`);
    if (blindCount) bits.push(`${blindCount} blind spot${blindCount > 1 ? 's' : ''} 🔦`);
    L.push(`**${bits.join(' · ')}.** (${askedCount} questions asked; here's my honest ranking.)`);
  }
  L.push('');

  const A = brief.filter(g => g.grade === 'A');
  const B = brief.filter(g => g.grade === 'B');
  const C = brief.filter(g => g.grade === 'C');

  if (A.length) {
    L.push(`## A — do this`);
    A.forEach(g => {
      L.push(`### ${gradeHeader(g)}`);
      L.push(g.question);
      L.push('');
      L.push(g.answer.trim());
      L.push('');
      L.push(`> **My take:** ${takeLine(g)}`);
      L.push('');
    });
  }

  if (B.length) {
    L.push(`## B — worth knowing`);
    B.forEach(g => {
      L.push(`${gradeHeader(g)} — ${g.question}`);
      L.push(`> ${takeLine(g)}`);
      L.push('');
    });
  }

  if (C.length) {
    L.push(`## C — fun, but I'd skip`);
    C.forEach(g => {
      L.push(`${gradeHeader(g)} — ${g.question}`);
      L.push(`> ${takeLine(g)}`);
      L.push('');
    });
  }

  L.push(`---`);
  L.push(`*Full cards + "acted on" toggle → localhost:8080/board#gold*`);
  return L.join('\n') + '\n';
}

// Telegram delivery: a trimmed version of the same brief (phone-scannable, opinionated).
async function sendDigest(briefMd, brief, state) {
  const spendLine = `_~${callsThisRun} DeepSeek calls this run · ${state.calls}/${DAILY_CALL_CEILING} today_`;

  const A = brief.filter(g => g.grade === 'A');
  const B = brief.filter(g => g.grade === 'B');
  const C = brief.filter(g => g.grade === 'C');
  const noGold = (A.length + B.length) === 0;
  const blindCount = brief.filter(g => g.class === 'blind-spot').length;

  let msg = `🪙 *Standing Intelligence — morning brief* · ${today()}\n`;

  if (noGold) {
    msg += `\n*No gold today — mined this seam out, move on.* ${brief.length} questions, nothing genuinely A or B. Honest empty day.\n`;
    if (C.length) {
      msg += `\n_What I considered and rejected:_\n`;
      C.slice(0, 3).forEach(g => {
        const blind = g.class === 'blind-spot' ? '🔦 ' : '';
        msg += `• ${blind}*C ·* ${g.question.slice(0, 110)}\n`;
      });
    }
    msg += `\n${spendLine}`;
    await sendTelegram(msg);
    return;
  }

  const stateBits = [];
  if (A.length) stateBits.push(`${A.length} worth your time`);
  if (B.length) stateBits.push(`${B.length} worth knowing`);
  if (blindCount) stateBits.push(`${blindCount} blind spot${blindCount > 1 ? 's' : ''} 🔦`);
  msg += `_${stateBits.join(' · ')}._\n`;

  if (A.length) {
    msg += `\n*A — do this*\n`;
    A.forEach(g => {
      const blind = g.class === 'blind-spot' ? '🔦 ' : '';
      msg += `\n${blind}*[A · ${g.score}/10 · ${g.domain}]* ${g.question}\n`;
      msg += `${g.answer.slice(0, 560)}\n`;
      msg += `_My take: ${takeLine(g)}_\n`;
    });
  }
  if (B.length) {
    msg += `\n*B — worth knowing*\n`;
    B.forEach(g => {
      const blind = g.class === 'blind-spot' ? '🔦 ' : '';
      msg += `\n${blind}*[B · ${g.score}/10 · ${g.domain}]* ${g.question}\n_${takeLine(g)}_\n`;
    });
  }
  if (C.length) {
    msg += `\n*C — fun, but I'd skip*\n`;
    C.forEach(g => {
      const blind = g.class === 'blind-spot' ? '🔦 ' : '';
      msg += `${blind}_C · ${g.question.slice(0, 110)} — ${takeLine(g).slice(0, 120)}_\n`;
    });
  }

  msg += `\nFull cards → localhost:8080/board#gold\n${spendLine}`;
  await sendTelegram(msg);
}

// ── entry ────────────────────────────────────────────────────────────────────
// Only auto-run when invoked directly (so the module can be required for testing
// individual functions like updateTrajectory without triggering a full cycle).
if (require.main === module) {
  run().catch(e => { console.error('[elicitor] fatal:', e.message); process.exit(1); });
}

module.exports = { run, gatherContext, loadTrajectory, updateTrajectory, generateBlindSpotQuestions, buildMorningBrief, gradeForScore };
