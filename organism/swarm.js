#!/usr/bin/env node
/**
 * THE SELF-ELICITING ORGANISM — the swarm runner.
 * ================================================
 * The next frontier after the Elicitor + Standing Agency.
 *
 * Philosophy (vault: 00_Staging/cathedral/idea-the-self-eliciting-organism-2026-06-02.md,
 *             02_Refined_Gold/cathedral/the-elicitation-threshold.md + the-master-game.md):
 *
 *   Instead of ONE Elicitor asking Paul's questions, EVERY agent elicits gold in
 *   its OWN domain (a shared capability), a META-RANKER surfaces only the
 *   gold-of-gold to Paul, and the safe gold flows to the ONE governed
 *   Standing-Agency executor. Agents do NOT execute directly.
 *
 *   The two dangers this design exists to contain:
 *     - NOISE × N  → the meta-ranker (pool → dedup → rank → top-K) is the noise gate.
 *                    Only the gold-of-gold reaches Paul; the rest is logged, not pushed.
 *     - BLAST-RADIUS × N → agency stays CENTRALIZED. A-gold goes to the SINGLE
 *                    governed executor (agency/executor.js) for classify → auto-safe
 *                    / propose. Never N autonomous executors.
 *
 * GATED + CONSERVATIVE BY DESIGN:
 *   - HARD BUDGET CAP: max 6 agents × max 3 questions/agent per run (the primary gate).
 *   - DAILY CEILING:   shared-style daily DeepSeek-call ceiling in swarm-state.json.
 *   - KILL SWITCH:     ~/nanoclaw/organism/PAUSED  OR  ORGANISM_PAUSED=1.
 *   - MANUAL-TRIGGER FIRST: suggest a WEEKLY cron; do NOT start it here.
 *   - Budget/spend line in every digest.
 *
 * CJS. Loads ~/nanoclaw/.env (DEEPSEEK_API_KEY + Telegram).
 *
 * Usage:
 *   node swarm.js                          # default: 6 agents × 3 q, top-K 5
 *   node swarm.js --cap-agents 3 --cap-q 2 # cheaper test run (~12-18 DeepSeek calls)
 *   node swarm.js --top-k 5                # how many gold-of-gold reach Paul
 *   node swarm.js --dry                    # no Telegram, no writes, no agency feed (preview)
 *   node swarm.js --no-telegram
 *   node swarm.js --no-agency              # skip feeding A-gold to Standing Agency
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const NANOCLAW = path.join(HOME, 'nanoclaw');
try { require('dotenv').config({ path: path.join(NANOCLAW, '.env') }); } catch { /* fine for --dry */ }

// ── the shared elicitation capability (THE refactor) ─────────────────────────────
// One gold definition for the whole swarm — same rubric the personal Elicitor uses.
const { elicitForDomain, gradeForScore } = require(path.join(NANOCLAW, 'elicitor', 'elicitor.js'));

// ── paths ────────────────────────────────────────────────────────────────────
const HERE = __dirname;
const AGENT_DOMAINS = path.join(HERE, 'agent-domains.json');
const BRIEF_MD      = path.join(HERE, 'organism-brief.md');
const GOLD_JSONL    = path.join(HERE, 'organism-gold.jsonl');
const SEEDS_FILE    = path.join(HERE, 'seeds.json');
const STATE_FILE    = path.join(HERE, 'swarm-state.json');
const PAUSED_FILE   = path.join(HERE, 'PAUSED');
// where the SINGLE governed agency reads A-gold from (centralized agency, not a 2nd executor)
const AGENCY_FEED   = path.join(NANOCLAW, 'elicitor', 'gold-feed.json');

// ── config / gates ────────────────────────────────────────────────────────────
const MAX_AGENTS = 6;            // HARD CAP — the primary budget gate (× MAX_Q)
const MAX_Q      = 3;            // HARD CAP — questions per agent per run
const DEFAULT_TOP_K = 5;         // gold-of-gold that reach Paul; the rest are logged only
const DAILY_CALL_CEILING = 80;   // hard daily DeepSeek-call ceiling (organism-local)
const GOLD_BAR   = 8;            // A grade — same bar as the Elicitor

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || process.env.PAUL_CHAT_ID;

// ── args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function argVal(flag, def) { const i = args.indexOf(flag); return i >= 0 && args[i + 1] ? args[i + 1] : def; }
const CAP_AGENTS = Math.max(1, Math.min(MAX_AGENTS, parseInt(argVal('--cap-agents', String(MAX_AGENTS)), 10) || MAX_AGENTS));
const CAP_Q      = Math.max(1, Math.min(MAX_Q, parseInt(argVal('--cap-q', String(MAX_Q)), 10) || MAX_Q));
const TOP_K      = Math.max(1, Math.min(12, parseInt(argVal('--top-k', String(DEFAULT_TOP_K)), 10) || DEFAULT_TOP_K));
const DRY        = args.includes('--dry');
const NO_TELEGRAM = args.includes('--no-telegram') || DRY;
const NO_AGENCY   = args.includes('--no-agency') || DRY;

function log(...a) { console.log('[organism]', ...a); }
function today() { return new Date().toISOString().slice(0, 10); }
function nowISO() { return new Date().toISOString(); }
function readJSON(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } }
function writeJSON(p, o) { fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n'); }

// ── kill switch (gate) ─────────────────────────────────────────────────────────
function killSwitchEngaged() {
  if (process.env.ORGANISM_PAUSED === '1') return 'env ORGANISM_PAUSED=1';
  if (fs.existsSync(PAUSED_FILE)) return 'PAUSED file present';
  return null;
}

// ── cross-pollination (light) ──────────────────────────────────────────────────
// After ranking, note when one agent's top gold relates to ANOTHER agent's lane.
// Cheap + transparent: tokenize the focus/lane of every OTHER domain, and if a
// finding's text hits enough of another lane's distinctive keywords, tag a cross_lane
// link. No extra LLM call — just surface the link in the brief.
const STOP = new Set(('the a an and or of to in on for with as is are it its his her into not no but that this these those one ' +
  'paul cathedral master game lane focus agent domain gold one whole not just only across more most ' +
  'making building creating running finding turning under that already what which who when where why how ' +
  'value leverage truth healing consciousness wealth business systems tools mastery embodied').split(/\s+/));
function keywordsFor(domainSpec) {
  const text = `${domainSpec.lane || ''} ${domainSpec.focus || ''}`.toLowerCase();
  const set = new Set();
  for (const w of text.split(/[^a-z0-9-]+/)) {
    if (w.length >= 4 && !STOP.has(w)) set.add(w);
  }
  return set;
}
function findCrossLanes(finding, allDomains) {
  const hay = `${finding.question} ${finding.answer}`.toLowerCase();
  const links = [];
  for (const d of allDomains) {
    if (d.agent === finding.agent) continue;          // not its own lane
    const kw = keywordsFor(d);
    let hits = 0; const hit = [];
    for (const w of kw) { if (hay.includes(w)) { hits++; hit.push(w); if (hits >= 3) break; } }
    if (hits >= 2) links.push({ agent: d.agent, domain: d.domain, on: hit.slice(0, 3) });
  }
  return links;
}

// ── meta-ranker (THE noise gate) ────────────────────────────────────────────────
// Pool ALL agents' gold → cross-dedup by question hash (id) → rank by score →
// select the TOP K = the gold-of-gold. ONLY these reach Paul. The rest are logged.
function metaRank(pool, topK) {
  const seen = new Set();
  const deduped = [];
  // pool is already best-effort ordered; sort by score desc, keep highest per id.
  const sorted = pool.slice().sort((a, b) => b.score - a.score);
  for (const it of sorted) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    deduped.push(it);
  }
  const goldOfGold = deduped.slice(0, topK);
  const rest = deduped.slice(topK);
  return { goldOfGold, rest, dedupedCount: deduped.length, poolCount: pool.length };
}

// ── seeds carryover (light) ─────────────────────────────────────────────────────
// Optionally seed next run's questions from this run's top findings. Stored per-agent
// so each lane follows up its own best gold. Kept simple: just the top question text.
function loadSeeds() { return readJSON(SEEDS_FILE, {}); }
function writeSeeds(goldOfGold) {
  const seeds = {};
  for (const g of goldOfGold) {
    if (!seeds[g.agent]) seeds[g.agent] = [];
    if (seeds[g.agent].length < 2) seeds[g.agent].push(g.question);
  }
  writeJSON(SEEDS_FILE, { updated_at: nowISO(), seeds });
}

// ── Telegram ────────────────────────────────────────────────────────────────────
async function sendTelegram(message) {
  if (NO_TELEGRAM) return;
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) { log('Telegram not configured — skipping send.'); return; }
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'Markdown', disable_web_page_preview: true }),
    });
  } catch (e) { log('Telegram send failed:', e.message); }
}

// ── the brief ─────────────────────────────────────────────────────────────────
// The deliverable: the gold-of-gold from N minds, A/B/C ranked, each tagged with the
// agent that surfaced it + any cross-lane link. Honest empty when the seam is quiet.
function buildBrief(goldOfGold, meta) {
  const { mindCount, poolCount, dedupedCount, calls, dailyCalls, killSwitch } = meta;
  const L = [];
  L.push(`# 🧬 The Organism — gold-of-gold from ${mindCount} minds`);
  L.push(`*${today()}*`);
  L.push('');

  if (killSwitch) {
    L.push(`> ⏸ **Kill switch engaged (${killSwitch}).** No elicitation ran. This brief is the last state.`);
    L.push('');
  }

  if (!goldOfGold.length) {
    L.push(`**The organism mined quiet today.** ${mindCount} minds elicited across their lanes; ${poolCount} candidate findings pooled, ${dedupedCount} after dedup — nothing cleared the bar worth pushing. Honest empty, not a miss.`);
    L.push('');
    L.push(`---`);
    L.push(`_~${calls} DeepSeek calls this run · ${dailyCalls}/${DAILY_CALL_CEILING} today · ${mindCount} minds × up to ${CAP_Q} q · top-${TOP_K} gate_`);
    return L.join('\n') + '\n';
  }

  const aCount = goldOfGold.filter(g => g.grade === 'A').length;
  const bCount = goldOfGold.filter(g => g.grade === 'B').length;
  const cCount = goldOfGold.filter(g => g.grade === 'C').length;
  const bits = [];
  if (aCount) bits.push(`${aCount} worth acting on`);
  if (bCount) bits.push(`${bCount} worth knowing`);
  if (cCount) bits.push(`${cCount} I'd skip`);
  L.push(`**${bits.join(' · ')}.** The cream of ${poolCount} findings from ${mindCount} agent-minds — pooled, deduped to ${dedupedCount}, top ${goldOfGold.length} surfaced. The rest are logged, not pushed.`);
  L.push('');

  const grade = g => g.grade;
  const A = goldOfGold.filter(g => grade(g) === 'A');
  const B = goldOfGold.filter(g => grade(g) === 'B');
  const C = goldOfGold.filter(g => grade(g) === 'C');

  const card = (g, full) => {
    const lines = [];
    lines.push(`### **${g.grade} · ${g.score}/10** — surfaced by 🧬 *${g.agent}* (${g.domain})`);
    lines.push(g.question);
    if (full) { lines.push(''); lines.push(g.answer.trim()); }
    if (g.why_gold) { lines.push(''); lines.push(`> **Why gold:** ${g.why_gold}`); }
    if (g.cross_lane && g.cross_lane.length) {
      const links = g.cross_lane.map(c => `${c.agent}'s ${c.domain} lane`).join(', ');
      lines.push(`> 🔗 Also feeds: ${links}.`);
    }
    lines.push('');
    return lines.join('\n');
  };

  if (A.length) { L.push(`## A — do this`); A.forEach(g => L.push(card(g, true))); }
  if (B.length) { L.push(`## B — worth knowing`); B.forEach(g => L.push(card(g, false))); }
  if (C.length) { L.push(`## C — fun, but I'd skip`); C.forEach(g => L.push(card(g, false))); }

  L.push(`---`);
  L.push(`_~${calls} DeepSeek calls this run · ${dailyCalls}/${DAILY_CALL_CEILING} today · ${mindCount} minds × up to ${CAP_Q} q · top-${TOP_K} gate_`);
  L.push(`_A-gold routes to the single governed Standing Agency for classify → auto-safe / propose. Full board → localhost:8080/board#organism_`);
  return L.join('\n') + '\n';
}

async function sendDigest(goldOfGold, meta) {
  const { mindCount, poolCount, calls, dailyCalls } = meta;
  const spend = `_~${calls} DeepSeek calls this run · ${dailyCalls}/${DAILY_CALL_CEILING} today_`;
  let msg = `🧬 *The Organism — gold-of-gold from ${mindCount} minds* · ${today()}\n`;

  if (!goldOfGold.length) {
    msg += `\n*The organism mined quiet today.* ${poolCount} findings pooled across ${mindCount} lanes, nothing cleared the bar. Honest empty day.\n\n${spend}`;
    await sendTelegram(msg);
    return;
  }

  const A = goldOfGold.filter(g => g.grade === 'A');
  const B = goldOfGold.filter(g => g.grade === 'B');
  const C = goldOfGold.filter(g => g.grade === 'C');
  const stateBits = [];
  if (A.length) stateBits.push(`${A.length} worth acting on`);
  if (B.length) stateBits.push(`${B.length} worth knowing`);
  msg += `_The cream of ${poolCount} findings — ${stateBits.join(' · ') || 'ranked below'}._\n`;

  const xlink = g => (g.cross_lane && g.cross_lane.length)
    ? `\n🔗 _also feeds ${g.cross_lane.map(c => c.agent).join(', ')}_` : '';

  if (A.length) {
    msg += `\n*A — do this*\n`;
    A.forEach(g => {
      msg += `\n🧬 *[A · ${g.score}/10 · ${g.agent}]* ${g.question}\n`;
      msg += `${g.answer.slice(0, 520)}\n`;
      msg += `_Why gold: ${g.why_gold}_${xlink(g)}\n`;
    });
  }
  if (B.length) {
    msg += `\n*B — worth knowing*\n`;
    B.forEach(g => { msg += `\n🧬 *[B · ${g.score}/10 · ${g.agent}]* ${g.question}\n_${g.why_gold}_${xlink(g)}\n`; });
  }
  if (C.length) {
    msg += `\n*C — fun, but I'd skip*\n`;
    C.forEach(g => { msg += `🧬 _C · ${g.agent} · ${g.question.slice(0, 100)}_\n`; });
  }

  msg += `\nFull board → localhost:8080/board#organism\n${spend}`;
  await sendTelegram(msg);
}

// ── route A-gold to the SINGLE governed Standing Agency (centralized) ────────────
// Agency stays centralized. We append the organism's A-grade gold-of-gold to the
// SAME gold-feed.json the existing executor.js already reads (loadGoldA filters
// grade==='A'), then call its runCycle() so the A-gold flows through the SAME
// classify → auto-safe / propose / kill-switch / assertSafe / ledger path.
// We NEVER create a second executor. If the executor can't be loaded, we still write
// the A-gold to the feed so the existing weekly agency cron picks it up.
function appendAgencyFeed(aGold) {
  let feed = readJSON(AGENCY_FEED, []);
  if (!Array.isArray(feed)) feed = [];
  const existing = new Set(feed.map(g => g.id));
  const toAdd = [];
  for (const g of aGold) {
    if (existing.has(g.id)) continue;
    existing.add(g.id);
    toAdd.push({
      id: g.id,
      question: g.question,
      answer: g.answer,
      score: g.score,
      grade: 'A',
      why_gold: g.why_gold,
      domain: g.domain,
      route: `organism:${g.agent}`,
      class: 'normal',
      source: 'organism',
      surfaced_by: g.agent,
      ts: nowISO(),
      acted_on: null,
    });
  }
  if (toAdd.length) writeJSON(AGENCY_FEED, [...toAdd, ...feed]);
  return toAdd.length;
}

async function routeToAgency(aGold) {
  if (!aGold.length) { log('no A-gold to route to agency.'); return { added: 0, cycled: false }; }
  const added = appendAgencyFeed(aGold);
  log(`appended ${added} A-gold item(s) to the agency feed (gold-feed.json) — the single governed executor reads this.`);
  let cycled = false;
  try {
    const agency = require(path.join(NANOCLAW, 'agency', 'executor.js'));
    if (typeof agency.runCycle === 'function') {
      const r = await agency.runCycle({}); // honours its OWN kill switch + assertSafe + caps
      cycled = true;
      log(`agency runCycle: ${r.auto_done} auto · ${r.proposed} proposed · ${r.refused} refused (kill switch: ${r.kill_switch || 'none'})`);
    }
  } catch (e) {
    log(`agency runCycle skipped (${e.message}) — A-gold left in feed for the existing weekly agency cron to pick up.`);
  }
  return { added, cycled };
}

// ── main ────────────────────────────────────────────────────────────────────
async function run() {
  const killSwitch = killSwitchEngaged();
  log(`run start — ${CAP_AGENTS} agents × ${CAP_Q} q (hard cap ${MAX_AGENTS}×${MAX_Q}), top-K=${TOP_K}${DRY ? ', DRY' : ''}${killSwitch ? ', PAUSED' : ''}`);

  // daily ceiling
  const state = readJSON(STATE_FILE, { date: today(), calls: 0, runs: 0 });
  if (state.date !== today()) { state.date = today(); state.calls = 0; state.runs = 0; }

  const registry = readJSON(AGENT_DOMAINS, null);
  const allDomains = (registry && Array.isArray(registry.agents)) ? registry.agents : [];
  if (!allDomains.length) { log('no agent-domains found — aborting.'); return; }

  const selected = allDomains.slice(0, CAP_AGENTS);
  const seeds = loadSeeds().seeds || {};

  if (killSwitch) {
    log(`KILL SWITCH ENGAGED (${killSwitch}) — no elicitation, no spend. Writing honest paused brief.`);
    const briefMd = buildBrief([], { mindCount: 0, poolCount: 0, dedupedCount: 0, calls: 0, dailyCalls: state.calls, killSwitch });
    if (!DRY) fs.writeFileSync(BRIEF_MD, briefMd);
    await sendDigest([], { mindCount: selected.length, poolCount: 0, calls: 0, dailyCalls: state.calls });
    if (DRY) { console.log('\n──── DRY PREVIEW: organism-brief.md ────\n'); console.log(briefMd); }
    return;
  }

  if (state.calls >= DAILY_CALL_CEILING) {
    log(`daily call ceiling reached (${state.calls}/${DAILY_CALL_CEILING}) — aborting to protect budget.`);
    return;
  }

  // 1+2. SWARM: every selected agent elicits gold in its own lane (shared capability).
  const pool = [];
  const perAgent = [];
  let totalCalls = 0;
  for (const d of selected) {
    // map registry entry → elicitForDomain's domainSpec shape (name = the domain label).
    const domainSpec = { ...d, name: d.domain, seeds: seeds[d.agent] || [] };
    log(`  eliciting — 🧬 ${d.agent} (${d.domain})…`);
    const res = await elicitForDomain(domainSpec, { cap: CAP_Q, agent: d.agent });
    totalCalls += res.calls || 0;
    perAgent.push({ agent: d.agent, domain: d.domain, count: res.items.length, error: res.error });
    for (const it of res.items) pool.push(it);
    log(`    ${res.items.length} scored${res.error ? ` (note: ${res.error})` : ''} — ${res.items.map(i => i.score).join(',') || '—'}`);
    // soft daily-budget guard mid-swarm
    if (state.calls + totalCalls >= DAILY_CALL_CEILING) { log('  daily ceiling hit mid-swarm — stopping early.'); break; }
  }

  log(`swarm pooled ${pool.length} findings from ${perAgent.length} minds (${totalCalls} DeepSeek calls).`);

  // 3. META-RANKER (the noise gate): pool → dedup → rank → top-K = gold-of-gold.
  const { goldOfGold, rest, dedupedCount, poolCount } = metaRank(pool, TOP_K);

  // 3b. cross-pollination (light) — tag cross-lane links on the surfaced gold.
  for (const g of goldOfGold) {
    const links = findCrossLanes(g, selected);
    if (links.length) g.cross_lane = links;
  }

  const aCount = goldOfGold.filter(g => g.grade === 'A').length;
  const bCount = goldOfGold.filter(g => g.grade === 'B').length;
  log(`meta-ranker: ${poolCount} pooled → ${dedupedCount} deduped → top ${goldOfGold.length} gold-of-gold (${aCount}A ${bCount}B); ${rest.length} logged-not-pushed.`);

  // 4. build + write the brief
  const meta = { mindCount: perAgent.length, poolCount, dedupedCount, calls: totalCalls, dailyCalls: state.calls + totalCalls, killSwitch: null };
  const briefMd = buildBrief(goldOfGold, meta);
  if (!DRY) {
    fs.writeFileSync(BRIEF_MD, briefMd);
    log(`wrote organism-brief.md (${briefMd.length} chars)`);
  }

  // append the gold-of-gold to the jsonl (the organism's persistent record)
  if (!DRY && goldOfGold.length) {
    const rows = goldOfGold.map(g => JSON.stringify({
      ts: nowISO(), run: today(),
      id: g.id, agent: g.agent, domain: g.domain,
      score: g.score, grade: g.grade, question: g.question, answer: g.answer,
      why_gold: g.why_gold, cross_lane: (g.cross_lane || []).map(c => c.agent),
    })).join('\n');
    fs.appendFileSync(GOLD_JSONL, rows + '\n');
    log(`appended ${goldOfGold.length} gold-of-gold to organism-gold.jsonl`);
  }

  // seeds carryover (light) — next run follows up this run's top gold per lane.
  if (!DRY && goldOfGold.length) writeSeeds(goldOfGold);

  // 5. GOVERNANCE GATE: route A-gold-of-gold to the SINGLE governed Standing Agency.
  const aGold = goldOfGold.filter(g => g.grade === 'A');
  let agencyResult = { added: 0, cycled: false };
  if (!NO_AGENCY) {
    agencyResult = await routeToAgency(aGold);
  } else {
    log(`--no-agency / DRY — not routing ${aGold.length} A-gold to the agency.`);
  }

  // update budget state
  state.calls += totalCalls;
  state.runs += 1;
  state.last_run = nowISO();
  if (!DRY) writeJSON(STATE_FILE, state);

  // 6. Telegram digest (gold-of-gold only)
  await sendDigest(goldOfGold, meta);

  if (DRY) {
    console.log('\n──── DRY PREVIEW: organism-brief.md ────\n');
    console.log(briefMd);
  }

  // CLI summary
  log('--- summary ---');
  log(JSON.stringify({
    minds: perAgent.map(a => `${a.agent}:${a.count}`),
    pooled: poolCount, deduped: dedupedCount, gold_of_gold: goldOfGold.length,
    A: aGold.length, agency_added: agencyResult.added, agency_cycled: agencyResult.cycled,
    calls: totalCalls, daily: state.calls,
  }, null, 2));

  return { goldOfGold, rest, perAgent, briefMd, calls: totalCalls, agencyResult };
}

// ── entry ────────────────────────────────────────────────────────────────────
if (require.main === module) {
  run().catch(e => { console.error('[organism] fatal:', e.message, e.stack); process.exit(1); });
}

module.exports = { run, metaRank, findCrossLanes, killSwitchEngaged, buildBrief };
