// self-questioner.js — Cathedral Self-Diagnostic Agent
// ESM module (SI-13: ~/nanoclaw/ .js = ESM)
//
// Reads the system's own state (vault, coaching rules, taste map, knowledge
// graph, recent activity) → generates research questions via hermes3.
// The system asks its own questions. Not answering — asking.
//
// Spec: scaffolds/5e-self-questioner.md
// Storage: ~/nanoclaw/self-questioner-log.json
// Prompt:  ~/nanoclaw/prompts/self-questioner.txt

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const HOME = process.env.HOME;
const NANOCLAW = path.join(HOME, 'nanoclaw');
const VAULT = path.join(HOME, 'cathedral-vault');

const LOG_PATH = path.join(NANOCLAW, 'self-questioner-log.json');
const PROMPT_PATH = path.join(NANOCLAW, 'prompts', 'self-questioner.txt');
const COACHING_RULES_PATH = path.join(NANOCLAW, 'coaching-rules.json');
const TASTE_MAP_PATH = path.join(NANOCLAW, 'taste-map.json');
const TASTE_PRACTICE_PATH = path.join(NANOCLAW, 'taste-practice-log.json');
const GRAPH_PATH = path.join(NANOCLAW, 'vault-graph-data.json');
const STAGING_PATH = path.join(VAULT, '00_Staging');

const OLLAMA_URL = 'http://localhost:11434/api/generate';
const MODEL = 'hermes3'; // SI-24: never gemma4:26b — hermes3 is the workhorse
const OLLAMA_TIMEOUT_MS = 180000;

// The five question types the Self-Questioner can generate
const QUESTION_TYPES = ['vault_gap', 'coaching_gap', 'taste_gap', 'connection', 'challenge'];

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

function loadLog() {
  try { return JSON.parse(fs.readFileSync(LOG_PATH, 'utf8')); }
  catch { return []; }
}

function saveLog(log) {
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
}

// Local date (HK), not UTC — a question generated at 08:00 HKT belongs to
// today, not yesterday. YYYY-MM-DD.
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Read a JSON file, returning a fallback instead of throwing (inputs are
// read-only and optional — a missing source is a signal, not a crash)
function readJsonSafe(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return fallback; }
}

// ---------------------------------------------------------------------------
// State gathering — read-only, never mutates any source
// ---------------------------------------------------------------------------

// Count .md files under a directory (recursive, skips hidden/.obsidian)
function countMarkdownFiles(dir) {
  let count = 0;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return 0; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) count += countMarkdownFiles(full);
    else if (e.name.endsWith('.md')) count++;
  }
  return count;
}

// 1. Vault health — folder structure + file counts per top-level folder
function gatherVaultHealth() {
  const folders = [];
  let entries;
  try { entries = fs.readdirSync(VAULT, { withFileTypes: true }); }
  catch { return { available: false, folders: [], totalFiles: 0 }; }
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    folders.push({ name: e.name, files: countMarkdownFiles(path.join(VAULT, e.name)) });
  }
  folders.sort((a, b) => a.name.localeCompare(b.name));
  const totalFiles = folders.reduce((s, f) => s + f.files, 0);
  const thinFolders = folders.filter(f => f.files > 0 && f.files < 10).map(f => f.name);
  return { available: true, folders, totalFiles, thinFolders };
}

// 2. Coaching gaps — low-confidence rules and rules never validated by outcomes
function gatherCoachingGaps() {
  const rules = readJsonSafe(COACHING_RULES_PATH, null);
  if (!Array.isArray(rules)) return { available: false, totalRules: 0, lowConfidence: [], noOutcomes: [] };

  const lowConfidence = rules
    .filter(r => typeof r.confidence === 'number' && r.confidence < 0.7)
    .map(r => ({ id: r.id, rule: String(r.rule || '').slice(0, 140), confidence: r.confidence }));

  const noOutcomes = rules
    .filter(r => {
      const ev = r.evidence || {};
      const outcomes = Array.isArray(ev.outcomes) ? ev.outcomes.length : 0;
      const obs = ev.observation_count || 0;
      return outcomes === 0 && obs === 0;
    })
    .map(r => ({ id: r.id, rule: String(r.rule || '').slice(0, 140), status: r.status }));

  return { available: true, totalRules: rules.length, lowConfidence, noOutcomes };
}

// 3. Taste gaps — thin domains in the taste map + recent practice deposits
function gatherTasteGaps() {
  const map = readJsonSafe(TASTE_MAP_PATH, null);
  const practice = readJsonSafe(TASTE_PRACTICE_PATH, []);

  const domains = [];
  if (map && map.domains) {
    for (const [name, d] of Object.entries(map.domains)) {
      // Count anchor entries: any array-of-objects property on the domain
      let anchors = 0;
      for (const [key, val] of Object.entries(d)) {
        if (Array.isArray(val) && key !== 'dimensions') anchors += val.length;
      }
      domains.push({ name, anchors });
    }
  }
  const thinDomains = domains.filter(d => d.anchors < 5).map(d => d.name);
  const recentPractice = Array.isArray(practice) ? practice.slice(-7) : [];
  const practicedDomains = [...new Set(recentPractice.map(p => p.domain).filter(Boolean))];

  return {
    available: !!map,
    domains,
    thinDomains,
    practiceEntries: Array.isArray(practice) ? practice.length : 0,
    recentPracticeDomains: practicedDomains
  };
}

// 4. Knowledge graph — cold zones: domains with few files or weak connectivity
function gatherKnowledgeGaps() {
  const graph = readJsonSafe(GRAPH_PATH, null);
  if (!graph || !Array.isArray(graph.nodes)) {
    return { available: false, coldZones: [], domains: [] };
  }

  // Aggregate average connections per domain
  const byDomain = {};
  for (const n of graph.nodes) {
    const d = n.domain || 'unknown';
    if (!byDomain[d]) byDomain[d] = { name: d, files: 0, totalConnections: 0 };
    byDomain[d].files++;
    byDomain[d].totalConnections += n.connections || 0;
  }
  const domains = Object.values(byDomain).map(d => ({
    name: d.name,
    files: d.files,
    avgConnections: d.files ? +(d.totalConnections / d.files).toFixed(1) : 0
  }));

  // Cold zone = very few files, or files that barely connect to anything else
  const coldZones = domains
    .filter(d => d.files < 15 || d.avgConnections < 3)
    .map(d => `${d.name} (${d.files} files, avg ${d.avgConnections} connections)`);

  return {
    available: true,
    generated: graph.generated,
    totalFiles: graph.totalFiles,
    edgeCount: graph.edgeCount,
    domains,
    coldZones
  };
}

// 5. Recent activity — fresh session harvests in 00_Staging + vault git log
function gatherRecentActivity() {
  const recentHarvests = [];
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000; // last 14 days

  function scan(dir, depth) {
    if (depth > 3 || recentHarvests.length >= 30) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { scan(full, depth + 1); continue; }
      if (!e.name.endsWith('.md')) continue;
      try {
        const st = fs.statSync(full);
        if (st.mtimeMs >= cutoff) {
          recentHarvests.push({
            file: path.relative(STAGING_PATH, full),
            modified: st.mtime.toISOString().split('T')[0]
          });
        }
      } catch { /* skip unreadable */ }
    }
  }
  scan(STAGING_PATH, 0);
  recentHarvests.sort((a, b) => b.modified.localeCompare(a.modified));

  // Vault git log — what has been touched in the last 7 days
  let gitLog = [];
  try {
    const out = execSync('git log --since="7 days ago" --oneline --no-color | head -20', {
      cwd: VAULT, encoding: 'utf8', timeout: 10000
    });
    gitLog = out.split('\n').filter(Boolean);
  } catch { /* vault may not be a repo, or git unavailable — fine */ }

  return { recentHarvests: recentHarvests.slice(0, 20), gitLog };
}

/**
 * Gather all input signals for question generation.
 * Read-only across every source — never mutates system state.
 * @returns {object} { vaultHealth, coachingGaps, tasteGaps, knowledgeGaps, recentActivity, previousQuestions }
 */
export async function gatherState() {
  return {
    vaultHealth: gatherVaultHealth(),
    coachingGaps: gatherCoachingGaps(),
    tasteGaps: gatherTasteGaps(),
    knowledgeGaps: gatherKnowledgeGaps(),
    recentActivity: gatherRecentActivity(),
    previousQuestions: loadLog()
  };
}

// ---------------------------------------------------------------------------
// Prompt building
// ---------------------------------------------------------------------------

// Compress the state object into a compact evidence block for hermes3.
// Keeps token count low — hermes3 on 16GB gets a summary, not raw dumps.
function summarizeState(state) {
  const lines = [];

  const vh = state.vaultHealth;
  if (vh.available) {
    lines.push('== VAULT HEALTH ==');
    lines.push(`Total files: ${vh.totalFiles}`);
    lines.push('Folders: ' + vh.folders.map(f => `${f.name}(${f.files})`).join(', '));
    if (vh.thinFolders.length) lines.push('Thin folders (<10 files): ' + vh.thinFolders.join(', '));
  }

  const cg = state.coachingGaps;
  if (cg.available) {
    lines.push('\n== COACHING RULES ==');
    lines.push(`Total rules: ${cg.totalRules}. Low confidence (<0.7): ${cg.lowConfidence.length}. Never validated by outcomes: ${cg.noOutcomes.length}.`);
    const shown = new Set();
    for (const r of cg.lowConfidence.slice(0, 8)) { lines.push(`- [conf ${r.confidence}] ${r.rule}`); shown.add(r.id); }
    for (const r of cg.noOutcomes.filter(r => !shown.has(r.id)).slice(0, 8)) lines.push(`- [no outcomes, ${r.status}] ${r.rule}`);
  }

  const tg = state.tasteGaps;
  if (tg.available) {
    lines.push('\n== TASTE MAP ==');
    lines.push('Domains: ' + tg.domains.map(d => `${d.name}(${d.anchors} anchors)`).join(', '));
    if (tg.thinDomains.length) lines.push('Thin/unexplored domains (<5 anchors): ' + tg.thinDomains.join(', '));
    lines.push(`Practice log entries: ${tg.practiceEntries}. Recent practice domains: ${tg.recentPracticeDomains.join(', ') || 'none'}.`);
  }

  const kg = state.knowledgeGaps;
  if (kg.available) {
    lines.push('\n== KNOWLEDGE GRAPH ==');
    lines.push(`${kg.totalFiles} files, ${kg.edgeCount} edges (generated ${kg.generated}).`);
    if (kg.coldZones.length) lines.push('Cold zones (few files or weak connections): ' + kg.coldZones.join('; '));
  }

  const ra = state.recentActivity;
  lines.push('\n== RECENT ACTIVITY (last 14 days) ==');
  if (ra.recentHarvests.length) {
    lines.push('Recent session harvests: ' + ra.recentHarvests.slice(0, 12).map(h => h.file).join('; '));
  } else {
    lines.push('No recent session harvests found in 00_Staging.');
  }
  if (ra.gitLog.length) {
    lines.push('Recent vault commits: ' + ra.gitLog.slice(0, 10).join(' | '));
  }

  const prev = state.previousQuestions || [];
  if (prev.length) {
    lines.push('\n== PREVIOUSLY ASKED (do NOT repeat or rephrase these) ==');
    for (const q of prev.slice(-12)) lines.push(`- ${q.question}`);
  }

  return lines.join('\n');
}

function loadSystemPrompt() {
  try { return fs.readFileSync(PROMPT_PATH, 'utf8'); }
  catch {
    // Minimal inline fallback — the real prompt lives in prompts/self-questioner.txt
    return 'You are the Self-Questioner module of the Cathedral, a sovereign AI research system. Use ONLY the state evidence provided. Generate the single most valuable question the system should be asking itself.';
  }
}

// ---------------------------------------------------------------------------
// hermes3 call + response parsing
// ---------------------------------------------------------------------------

async function callHermes(prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  try {
    const resp = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, prompt, stream: false }),
      signal: controller.signal
    });
    if (!resp.ok) throw new Error(`Ollama HTTP ${resp.status}`);
    const data = await resp.json();
    return data.response || '';
  } finally {
    clearTimeout(timer);
  }
}

// Parse the structured LINE: value format hermes3 is instructed to emit
function parseQuestionResponse(text) {
  const grab = (label) => {
    const m = text.match(new RegExp(`^\\s*${label}\\s*:\\s*(.+)$`, 'mi'));
    return m ? m[1].trim() : null;
  };

  const question = grab('QUESTION');
  if (!question) return null;

  let type = (grab('TYPE') || '').toLowerCase().replace(/\s+/g, '_');
  if (!QUESTION_TYPES.includes(type)) type = 'vault_gap';

  let action = (grab('ACTION') || 'conversation').toLowerCase();
  if (!['elicitation', 'research', 'build', 'conversation'].includes(action)) action = 'conversation';

  let priority = parseInt(grab('PRIORITY'), 10);
  if (!Number.isInteger(priority) || priority < 1 || priority > 5) priority = 3;

  const sources = (grab('SOURCES') || '')
    .split(/[,;]/).map(s => s.trim()).filter(Boolean);

  return {
    question,
    type,
    domain: grab('DOMAIN') || 'general',
    source: grab('SOURCE') || 'state_analysis',
    action,
    priority,
    reasoning: grab('REASONING') || '',
    suggested_sources: sources
  };
}

// Duplicate check — normalized word-overlap (Jaccard) against existing questions
function isDuplicate(text, existing) {
  const words = (s) => new Set(
    String(s).toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3)
  );
  const a = words(text);
  for (const q of existing) {
    const b = words(q.question);
    if (!a.size || !b.size) continue;
    let inter = 0;
    for (const w of a) if (b.has(w)) inter++;
    const jaccard = inter / (a.size + b.size - inter);
    if (jaccard > 0.55) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Question generation
// ---------------------------------------------------------------------------

let idCounter = 0;
function makeId(date) {
  idCounter++;
  return `sq-${date}-${Date.now().toString(36)}${idCounter}`;
}

/**
 * Generate ONE question from system state via hermes3.
 * Persists the question to the log (status: pending) and returns it.
 * @param {object} [state] — pre-gathered state (optional; gathered fresh if omitted)
 * @param {object} [opts]  — { type: force a question type, save: false to skip persisting }
 * @returns {object} Question
 */
export async function generateQuestion(state, opts = {}) {
  if (!state) state = await gatherState();
  const systemPrompt = loadSystemPrompt();
  const evidence = summarizeState(state);
  const date = today();

  const typeHint = opts.type && QUESTION_TYPES.includes(opts.type)
    ? `\nFor THIS question, the required TYPE is: ${opts.type}. Generate a question of that type.`
    : '';
  const batchHint = opts.avoid && opts.avoid.length
    ? '\nAlso do NOT repeat any of these questions generated moments ago:\n' + opts.avoid.map(q => `- ${q}`).join('\n')
    : '';

  const prompt = `${systemPrompt}

CURRENT SYSTEM STATE (your ONLY evidence — cite it, do not invent state):
${evidence}
${typeHint}${batchHint}

Generate exactly ONE question. Respond in EXACTLY this format, nothing else:
QUESTION: [the question — specific, actionable this week, in Paul's plain language]
TYPE: [one of: vault_gap | coaching_gap | taste_gap | connection | challenge]
DOMAIN: [which domain this improves]
SOURCE: [which piece of state evidence revealed this gap]
ACTION: [one of: elicitation | research | build | conversation]
PRIORITY: [1-5, 1 = most urgent]
REASONING: [one or two sentences — why THIS question, tied to the evidence]
SOURCES: [comma-separated suggested sources to answer it: vault folders, people, systems]`;

  // Up to 3 attempts: parse failure or duplicate → retry
  const existing = state.previousQuestions || loadLog();
  let parsed = null;
  let lastRaw = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    lastRaw = await callHermes(
      attempt === 0 ? prompt
        : prompt + `\n\nYour previous attempt was rejected (${parsed ? 'duplicate of an existing question' : 'bad format'}). Produce a DIFFERENT question, exact format.`
    );
    parsed = parseQuestionResponse(lastRaw);
    if (parsed && !isDuplicate(parsed.question, existing) &&
        !(opts.avoid || []).some(q => isDuplicate(parsed.question, [{ question: q }]))) {
      break;
    }
    if (attempt === 2) {
      throw new Error('Self-Questioner: hermes3 failed to produce a fresh, well-formed question after 3 attempts. Last output: ' + lastRaw.slice(0, 300));
    }
  }

  const entry = {
    id: makeId(date),
    date,
    question: parsed.question,
    // Batch mode forces a type per slot — trust the request over the model's
    // self-label so a weekly batch genuinely covers different types
    type: (opts.type && QUESTION_TYPES.includes(opts.type)) ? opts.type : parsed.type,
    domain: parsed.domain,
    source: parsed.source,
    action: parsed.action,
    priority: parsed.priority,
    reasoning: parsed.reasoning,
    suggested_sources: parsed.suggested_sources,
    status: 'pending',
    response: null,
    respondedDate: null
  };

  if (opts.save !== false) {
    const log = loadLog();
    log.push(entry);
    saveLog(log);
  }
  return entry;
}

/**
 * Generate a weekly batch of 3-5 questions covering different types.
 * Gathers state once, generates sequentially (16GB hardware — no parallel
 * hermes3 calls), skips types that fail, persists what succeeds.
 * @param {number} [count=4] — target number of questions (clamped 3-5)
 * @returns {Array} Question[] — the questions actually generated
 */
export async function generateWeeklyBatch(count = 4) {
  count = Math.max(3, Math.min(5, count));
  const state = await gatherState();

  // Order types by where the evidence actually points: types whose sources
  // show real gaps go first, so a 3-question week still hits the live gaps.
  const typeOrder = [];
  if (state.coachingGaps.available && (state.coachingGaps.lowConfidence.length || state.coachingGaps.noOutcomes.length)) typeOrder.push('coaching_gap');
  if (state.tasteGaps.available && state.tasteGaps.thinDomains.length) typeOrder.push('taste_gap');
  if (state.knowledgeGaps.available && state.knowledgeGaps.coldZones.length) typeOrder.push('vault_gap');
  typeOrder.push('connection', 'challenge');
  for (const t of QUESTION_TYPES) if (!typeOrder.includes(t)) typeOrder.push(t);

  const batch = [];
  const errors = [];
  for (const type of typeOrder.slice(0, count)) {
    try {
      const q = await generateQuestion(state, { type, avoid: batch.map(b => b.question) });
      batch.push(q);
      state.previousQuestions = loadLog(); // keep dedup current within the batch
    } catch (err) {
      errors.push({ type, error: err.message });
    }
  }

  if (!batch.length && errors.length) {
    throw new Error('Weekly batch failed entirely: ' + errors.map(e => `${e.type}: ${e.error}`).join(' | '));
  }
  return batch;
}

// ---------------------------------------------------------------------------
// Log access + answering
// ---------------------------------------------------------------------------

/**
 * Get all questions
 * @returns {Array} Question[]
 */
export function getQuestionLog() {
  return loadLog();
}

/**
 * Answer a question by date
 * @param {string} date — YYYY-MM-DD
 * @param {string} answer — Paul's response
 * @returns {boolean}
 */
export function answerQuestion(date, answer) {
  const log = loadLog();
  const q = log.find(q => q.date === date && q.status === 'pending');
  if (!q) return false;
  q.status = 'answered';
  q.response = answer;
  q.respondedDate = today();
  saveLog(log);
  return true;
}

/**
 * Get unanswered questions
 * @returns {Array} Question[]
 */
export function getUnanswered() {
  return loadLog().filter(q => q.status === 'pending');
}

// ---------------------------------------------------------------------------
// Stats + insights
// ---------------------------------------------------------------------------

/**
 * Question statistics: totals, by type/domain/action, answer rate.
 * @returns {object}
 */
export function getQuestionStats() {
  const log = loadLog();
  const answered = log.filter(q => q.status === 'answered');
  const pending = log.filter(q => q.status === 'pending');

  const countBy = (field) => {
    const out = {};
    for (const q of log) {
      const key = q[field] || 'unknown';
      if (!out[key]) out[key] = { asked: 0, answered: 0 };
      out[key].asked++;
      if (q.status === 'answered') out[key].answered++;
    }
    return out;
  };

  return {
    total: log.length,
    answered: answered.length,
    unanswered: pending.length,
    answerRate: log.length ? +(answered.length / log.length).toFixed(2) : 0,
    byType: countBy('type'),
    byDomain: countBy('domain'),
    byAction: countBy('action'),
    oldestPending: pending.length ? pending[0].date : null,
    lastAsked: log.length ? log[log.length - 1].date : null,
    lastAnswered: answered.length ? answered[answered.length - 1].respondedDate : null
  };
}

/**
 * Analyze answered questions to find patterns in what Paul finds valuable.
 * Deterministic signal first (what gets answered vs ignored, response depth),
 * plus a hermes3 synthesis when there are enough answers to see a pattern.
 * Degrades gracefully if Ollama is down — the stats still return.
 * @returns {object} { signal, patterns, synthesis }
 */
export async function getInsights() {
  const log = loadLog();
  const answered = log.filter(q => q.status === 'answered');
  const ignored = log.filter(q => q.status === 'pending');

  if (!answered.length) {
    return { signal: 'No answered questions yet — no pattern to read.', patterns: {}, synthesis: null };
  }

  // Deterministic patterns: what does Paul actually engage with?
  const rateBy = (field) => {
    const out = {};
    for (const q of log) {
      const key = q[field] || 'unknown';
      if (!out[key]) out[key] = { asked: 0, answered: 0 };
      out[key].asked++;
      if (q.status === 'answered') out[key].answered++;
    }
    for (const k of Object.keys(out)) {
      out[k].rate = +(out[k].answered / out[k].asked).toFixed(2);
    }
    return out;
  };

  const avgLen = Math.round(
    answered.reduce((s, q) => s + (q.response ? q.response.length : 0), 0) / answered.length
  );
  const longAnswers = answered
    .filter(q => q.response && q.response.length > avgLen)
    .map(q => ({ question: q.question, type: q.type, domain: q.domain }));

  const patterns = {
    answerRateByType: rateBy('type'),
    answerRateByDomain: rateBy('domain'),
    answerRateByAction: rateBy('action'),
    avgResponseLength: avgLen,
    aboveAverageEngagement: longAnswers.slice(0, 10),
    ignoredQuestions: ignored.map(q => ({ question: q.question, type: q.type, date: q.date })).slice(-10)
  };

  // hermes3 synthesis — only worth running with 3+ answers
  let synthesis = null;
  if (answered.length >= 3) {
    const qa = answered.slice(-15).map(q =>
      `Q [${q.type}/${q.domain}]: ${q.question}\nA: ${String(q.response).slice(0, 400)}`
    ).join('\n---\n');
    try {
      synthesis = (await callHermes(
        `You are the Self-Questioner module of the Cathedral, a sovereign AI research system, reviewing which of your own questions Paul answered and how. Use ONLY the evidence below. If no pattern exists, say so honestly — do not fabricate.

ANSWERED QUESTIONS:
${qa}

IGNORED QUESTIONS (asked, never answered):
${ignored.slice(-10).map(q => `- [${q.type}] ${q.question}`).join('\n') || '(none)'}

In 3-5 plain sentences: what kinds of questions does Paul engage with deeply, which does he ignore, and what should the next questions look like?`
      )).trim();
    } catch { /* Ollama down — stats-only insights still valid */ }
  }

  return {
    signal: `${answered.length}/${log.length} questions answered (${Math.round(answered.length / log.length * 100)}%).`,
    patterns,
    synthesis
  };
}

// ---------------------------------------------------------------------------
// CLI test hook: node self-questioner.js [state|question|batch|stats|insights]
// ---------------------------------------------------------------------------

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const cmd = process.argv[2] || 'state';
  const run = {
    state: async () => summarizeState(await gatherState()),
    question: () => generateQuestion(),
    batch: () => generateWeeklyBatch(),
    stats: () => getQuestionStats(),
    insights: () => getInsights()
  }[cmd];
  if (!run) { console.error('Usage: node self-questioner.js [state|question|batch|stats|insights]'); process.exit(1); }
  Promise.resolve(run())
    .then(out => console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 2)))
    .catch(err => { console.error('ERROR:', err.message); process.exit(1); });
}
