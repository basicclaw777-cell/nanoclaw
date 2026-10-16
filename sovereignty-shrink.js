// sovereignty-shrink.js — Sovereignty Shrink Module (Local Model Distillation, pre-hardware)
// ESM module
//
// "Rent the frontier, own the accumulation" made literal: frontier/vault knowledge →
// instruction-response training pairs → (hardware-gated) MLX LoRA fine-tune →
// hermes3-cathedral → validation → sovereign local coach.
//
// ═══════════════════════════════════════════════════════════════════════════
// HARDWARE GATE: LoRA training is BLOCKED until M5 Mac Studio (M5 Max, 128GB,
// ~Oct 2026). Current M4 16GB can run hermes3 (8B) for inference + data
// generation, but NOT train. Everything in this file that runs NOW:
//   - Training data generator   (vault, coaching rules, interventions, taste map)
//   - Test query set             (sovereignty-test-queries.json — 25 queries)
//   - Validation harness         (runs against any Ollama model, scores 4 dims)
//   - Cost tracker + estimator   (training run log + M5 time estimates)
// The only stubbed function is trainModel() at the bottom.
// ═══════════════════════════════════════════════════════════════════════════
//
// Spec: ~/nanoclaw/scaffolds/5c-sovereignty-shrink.md
// Sibling: coaching-engine.js (the knowledge being distilled)

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const HOME = process.env.HOME;
const NANO = path.join(HOME, 'nanoclaw');
const VAULT = path.join(HOME, 'cathedral-vault');

const TRAINING_DATA_PATH = path.join(NANO, 'sovereignty-training-data.json');
const TRAINING_LOG_PATH = path.join(NANO, 'sovereignty-training-log.json');
const TEST_QUERIES_PATH = path.join(NANO, 'sovereignty-test-queries.json');
const GEN_PROMPT_PATH = path.join(NANO, 'prompts', 'training-data-gen.txt');
const RULES_PATH = path.join(NANO, 'coaching-rules.json');
const INTERVENTIONS_PATH = path.join(NANO, 'coaching-interventions.json');
const TASTE_MAP_PATH = path.join(NANO, 'taste-map.json');
const DEFAULT_JSONL_PATH = path.join(NANO, 'training', 'data', 'cathedral-training.jsonl');

const OLLAMA_URL = 'http://localhost:11434';
const GEN_MODEL = 'hermes3'; // SI-24: hermes3 for all local tasks, never gemma4:26b

function loadJSON(p, fallback = []) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
function saveJSON(p, d) { fs.writeFileSync(p, JSON.stringify(d, null, 2)); }
function today() { return new Date().toISOString().split('T')[0]; }
function hash(s) { return crypto.createHash('sha1').update(s).digest('hex').slice(0, 12); }

// ── Ollama ────────────────────────────────────────────────────────────────

async function askOllama(model, prompt, system = null, timeoutMs = 180000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body = { model, prompt, stream: false };
    if (system) body.system = system;
    const resp = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!resp.ok) throw new Error(`ollama http ${resp.status}`);
    const data = await resp.json();
    return data.response || '';
  } finally {
    clearTimeout(timer);
  }
}

// Models love wrapping JSON in prose/fences — pull the array out.
function extractJSONArray(text) {
  if (!text) return null;
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

// ═════════════════════════ TRAINING DATA GENERATOR ═══════════════════════

// Instruction types the pipeline produces (spec 5c)
export const INSTRUCTION_TYPES = [
  'coaching_diagnosis',   // situation → observation + prescription
  'technique_metaphor',   // technique → life lesson mapping
  'student_assessment',   // first session data → initial diagnosis
  'plateau_detection',    // session history → what's stalling and why
  'block_progression',    // student profile → ready for next block?
  'fear_gate_assessment'  // approaching block 4→5 → emotion engine reading
];

// Read the instruction type off a piece of source text (heuristic tagging —
// the training pair metadata, not the intelligence).
function classifyInstructionType(text) {
  const t = String(text || '').toLowerCase();
  if (/(fear gate|4→5|4 to 5|sparring entry|trap door|alarm|floor element)/.test(t)) return 'fear_gate_assessment';
  if (/(plateau|flatlin|stall|no change across|stuck for)/.test(t)) return 'plateau_detection';
  if (/(first session|new student|initial assessment|starting block|assess)/.test(t)) return 'student_assessment';
  if (/(next block|block progression|ready for|gate.*pass|progress.*block)/.test(t)) return 'block_progression';
  if (/(metaphor|life lesson|like life|off the canvas|outside the ring|analogy|bridge)/.test(t)) return 'technique_metaphor';
  return 'coaching_diagnosis';
}

function classifyDomain(text) {
  const t = String(text || '').toLowerCase();
  if (/(music|track|playlist|bpm|taste|aesthetic|design|visual)/.test(t)) return 'taste';
  if (/(fear|composure|emotion|nervous|anxi|panic|froze)/.test(t)) return 'coaching_emotion';
  if (/(decision|overthink|timing|read|strategy|pattern|mind)/.test(t)) return 'coaching_mind';
  return 'coaching_body';
}

// ── Source readers — one per source type ─────────────────────────────────

// Coaching-related vault nuggets: markdown files in Refined Gold + Methods whose
// name or first lines hit coaching keywords, split into heading-sections.
const VAULT_DIRS = [
  { dir: path.join(VAULT, '02_Refined_Gold', 'cathedral'), quality: 0.9 },
  { dir: path.join(VAULT, '02_Refined_Gold'), quality: 0.9 },
  { dir: path.join(VAULT, '06_Methods'), quality: 0.75 }
];
const COACHING_KEYWORDS = /(coach|boxing|fighter|student|sparring|fear.gate|three.engines|diagnostic|guard|jab|footwork|block.progression|composure|syllabus|drill)/i;

function readVaultNuggets(filters = {}) {
  const nuggets = [];
  const seen = new Set();
  for (const { dir, quality } of VAULT_DIRS) {
    let files = [];
    try { files = fs.readdirSync(dir).filter(f => f.endsWith('.md')); } catch { continue; }
    for (const f of files) {
      const full = path.join(dir, f);
      if (seen.has(full)) continue;
      seen.add(full);
      let content = '';
      try { content = fs.readFileSync(full, 'utf8'); } catch { continue; }
      // Coaching filter: filename or content must be coaching-related
      if (!COACHING_KEYWORDS.test(f) && !COACHING_KEYWORDS.test(content.slice(0, 2000))) continue;
      if (filters.file && !f.includes(filters.file)) continue;
      // Split into heading-sections; each substantial section is a nugget
      const sections = content.split(/\n(?=#{1,3} )/);
      for (const sec of sections) {
        const body = sec.trim();
        if (body.length < 200 || body.length > 6000) continue; // too thin / too big to be one pair
        const title = (body.match(/^#{1,3}\s+(.+)/) || [])[1] || f.replace('.md', '');
        nuggets.push({
          type: 'vault_nugget',
          title,
          content: body,
          file: full.replace(VAULT + '/', 'vault:'),
          quality
        });
      }
    }
  }
  return filters.limit ? nuggets.slice(0, filters.limit) : nuggets;
}

// Approved coaching rules with evidence (coaching-rules.json).
// Default: approved + hypothesis (vault seeds ARE Paul's methodology — quality-
// weighted lower). Pass { status: 'approved' } to restrict to earned rules only.
function readCoachingRules(filters = {}) {
  let rules = loadJSON(RULES_PATH);
  const status = filters.status || ['approved', 'hypothesis'];
  const wanted = Array.isArray(status) ? status : [status];
  rules = rules.filter(r => wanted.includes(r.status));
  if (filters.engine) rules = rules.filter(r => r.conditions?.engine === filters.engine);
  return rules.map(r => ({
    type: 'coaching_rule',
    title: r.id,
    rule: r.rule,
    instruction_text: r.prescription?.instruction || '',
    trigger: r.conditions?.trigger || '',
    engine: r.conditions?.engine || 'body',
    blockRange: r.conditions?.block_range || [1, 10],
    content: `RULE: ${r.rule}\nTRIGGER: ${r.conditions?.trigger || '?'}\nENGINE: ${r.conditions?.engine || '?'}\nPRESCRIPTION: ${r.prescription?.instruction || ''}`,
    file: r.evidence?.file ? `vault:${r.evidence.file}` : `rules:${r.id}`,
    quality: r.status === 'approved' ? Math.max(r.confidence || 0.7, 0.7) : 0.65
  }));
}

// Logged interventions WITH outcomes (coaching-interventions.json) — Paul's live
// coaching, the highest-provenance data there is. Outcome-less logs excluded by
// default (no ground truth on whether the prescription worked).
function readInterventions(filters = {}) {
  let log = loadJSON(INTERVENTIONS_PATH);
  if (!filters.includeNoOutcome) log = log.filter(i => i.outcome);
  if (filters.student) log = log.filter(i => (i.student || '').toLowerCase() === filters.student.toLowerCase());
  return log.map(i => ({
    type: 'intervention',
    title: i.id,
    observation: i.observation || '',
    intervention: i.intervention || '',
    reasoning: i.reasoning || '',
    outcome: i.outcome || '',
    block: i.context?.block,
    content: `OBSERVED: ${i.observation || ''}\nPAUL DID: ${i.intervention || ''}\nREASONING: ${i.reasoning || ''}\nOUTCOME: ${i.outcome || '(none logged)'}`,
    file: `interventions:${i.id}`,
    quality: /improv|better|worked|fixed|held|clicked|breakthrough/i.test(i.outcome || '') ? 0.85 : 0.7
  }));
}

// Taste map anchors (taste-map.json) — Paul's preference engine. Trains the
// model's taste/voice dimension, not the coaching diagnostics.
function readTasteAnchors(filters = {}) {
  const map = loadJSON(TASTE_MAP_PATH, {});
  const out = [];
  if (map.meta_pattern) {
    out.push({
      type: 'taste_anchor', title: 'meta_pattern',
      content: `PAUL'S VOICE META-PATTERN: ${map.meta_pattern}`,
      file: 'taste-map:meta_pattern', quality: 0.85
    });
  }
  for (const rej of map.rejections || []) {
    out.push({
      type: 'taste_anchor', title: `rejection:${rej.pattern}`,
      content: `PAUL REJECTS: "${rej.pattern}" — reason: ${rej.reason}`,
      file: 'taste-map:rejections', quality: 0.8
    });
  }
  // Domain-level anchor clusters (e.g. music anchors_class_energy) — one nugget per cluster
  for (const [domain, dObj] of Object.entries(map.domains || {})) {
    if (filters.domain && domain !== filters.domain) continue;
    for (const [key, val] of Object.entries(dObj)) {
      if (!Array.isArray(val) || !val.length || typeof val[0] !== 'object') continue;
      const summary = val.slice(0, 12).map(a => JSON.stringify(a)).join('\n');
      out.push({
        type: 'taste_anchor', title: `${domain}:${key}`,
        content: `PAUL'S ${domain.toUpperCase()} TASTE (${key}):\n${summary}`,
        file: `taste-map:${domain}.${key}`, quality: 0.7
      });
    }
  }
  return filters.limit ? out.slice(0, filters.limit) : out;
}

// ── Pair construction ─────────────────────────────────────────────────────

// Deterministic base pair from a source — always produced, even with Ollama down.
// hermes3 adds DIVERSE phrasings on top; it never replaces the grounded base.
function basePairFor(source) {
  const t = source.type;
  if (t === 'coaching_rule') {
    return {
      instruction: `A situation matching "${String(source.trigger).replace(/_/g, ' ')}" appears with a student in blocks ${source.blockRange[0]}-${source.blockRange[1]}. What do you observe and prescribe?`,
      input: '',
      output: `${source.rule} ${source.instruction_text ? `Prescription: ${source.instruction_text}` : ''}`.trim()
    };
  }
  if (t === 'intervention') {
    return {
      instruction: `Session observation${source.block ? ` (student in Block ${source.block})` : ''}: ${source.observation} What would you do and why?`,
      input: '',
      output: `${source.intervention}${source.reasoning ? ` — ${source.reasoning}` : ''}${source.outcome ? ` (Outcome when applied: ${source.outcome})` : ''}`.trim()
    };
  }
  if (t === 'taste_anchor') {
    return {
      instruction: source.title === 'meta_pattern'
        ? 'What is the voice standard for anything Coach Paul-facing?'
        : source.title.startsWith('rejection:')
          ? `Is "${source.title.replace('rejection:', '')}" acceptable in output for Paul?`
          : `What does Paul's taste map say about ${source.title.replace(':', ' / ')}?`,
      input: '',
      output: source.content
    };
  }
  // vault_nugget — instruction from the title, output is the nugget essence
  return {
    instruction: `Explain "${source.title}" the way Coach Paul teaches it.`,
    input: '',
    output: source.content.replace(/^#{1,3}\s+.+\n/, '').trim().slice(0, 1800)
  };
}

// Wrap a raw {instruction,input,output} into a full stored training pair
function finalizePair(raw, source, generatedBy) {
  const text = `${raw.instruction} ${raw.output}`;
  return {
    id: `pair_${hash(raw.instruction + raw.output)}`,
    instruction: String(raw.instruction || '').trim(),
    input: String(raw.input || '').trim(),
    output: String(raw.output || '').trim(),
    source: source.file,
    source_type: source.type,
    instruction_type: classifyInstructionType(text),
    domain: source.type === 'taste_anchor' ? 'taste' : classifyDomain(text),
    quality_score: source.quality,
    generated_by: generatedBy,
    created: today()
  };
}

/**
 * Convert ONE source (vault nugget / coaching rule / intervention / taste anchor)
 * into training pairs. hermes3 generates 3-5 diverse phrasings from the same
 * material; a deterministic base pair is always included as ground truth.
 * @param {object} source — object from one of the read* functions, or
 *   { type, content, title?, file?, quality? } supplied directly
 * @param {object} opts — { useHermes: true }
 * @returns {Promise<Array>} training pairs (NOT yet persisted)
 */
export async function generateTrainingPair(source, opts = {}) {
  if (!source || !source.content) {
    if (source && (source.rule || source.observation)) { /* rules/interventions carry content too */ }
    else throw new Error('generateTrainingPair: source with .content required');
  }
  source.quality = source.quality ?? 0.6;
  source.file = source.file || `adhoc:${hash(source.content || '')}`;
  source.type = source.type || 'vault_nugget';

  const base = basePairFor(source);
  const pairs = [finalizePair(base, source, 'deterministic')];

  if (opts.useHermes === false) return pairs;

  // hermes3 diversification — SI-15: prompt carries Cathedral context + evidence-only rule
  try {
    const system = fs.readFileSync(GEN_PROMPT_PATH, 'utf8');
    const prompt = `SOURCE MATERIAL (use ONLY this):\n\n${source.content}\n\nGenerate 3-5 diverse instruction-response pairs from this source.`;
    const reply = await askOllama(GEN_MODEL, prompt, system);
    const variants = extractJSONArray(reply) || [];
    for (const v of variants) {
      if (!v || !v.instruction || !v.output) continue;
      if (String(v.output).length < 40) continue; // too thin to teach anything
      pairs.push(finalizePair(v, source, GEN_MODEL));
    }
  } catch {
    // Ollama down / garbage reply — the deterministic base pair still stands.
  }
  return pairs;
}

/**
 * Batch generate training pairs from a source type and persist them (deduped).
 * @param {string} sourceType — 'vault' | 'rules' | 'interventions' | 'taste' | 'all'
 * @param {object} filters — passed to the source reader; plus:
 *   { limit: max sources this run, useHermes: true, verbose: false }
 * @returns {Promise<object>} { sourcesRead, pairsGenerated, pairsStored, duplicatesSkipped }
 */
export async function batchGenerate(sourceType = 'all', filters = {}) {
  const readers = {
    vault: readVaultNuggets,
    rules: readCoachingRules,
    interventions: readInterventions,
    taste: readTasteAnchors
  };
  const types = sourceType === 'all' ? Object.keys(readers) : [sourceType];
  if (types.some(t => !readers[t])) throw new Error(`Unknown sourceType "${sourceType}". Use: vault | rules | interventions | taste | all`);

  let sources = [];
  for (const t of types) sources = sources.concat(readers[t](filters));
  if (filters.limit) sources = sources.slice(0, filters.limit);

  const store = loadJSON(TRAINING_DATA_PATH);
  const existing = new Set(store.map(p => p.id));
  let generated = 0, stored = 0, dupes = 0;

  for (const src of sources) {
    const pairs = await generateTrainingPair(src, { useHermes: filters.useHermes !== false });
    generated += pairs.length;
    for (const p of pairs) {
      if (existing.has(p.id)) { dupes++; continue; }
      store.push(p);
      existing.add(p.id);
      stored++;
    }
    if (filters.verbose) console.log(`  ${src.type} :: ${src.title} → ${pairs.length} pairs`);
    if (stored && stored % 25 === 0) saveJSON(TRAINING_DATA_PATH, store); // checkpoint long runs
  }

  saveJSON(TRAINING_DATA_PATH, store);
  return { sourcesRead: sources.length, pairsGenerated: generated, pairsStored: stored, duplicatesSkipped: dupes, totalInStore: store.length };
}

/**
 * Training data stats — count by source type, instruction type, domain, generator.
 */
export function getTrainingStats() {
  const store = loadJSON(TRAINING_DATA_PATH);
  const count = (key) => store.reduce((acc, p) => { const k = p[key] || 'unknown'; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
  return {
    total: store.length,
    bySourceType: count('source_type'),
    byInstructionType: count('instruction_type'),
    byDomain: count('domain'),
    byGenerator: count('generated_by'),
    avgQuality: store.length ? Math.round(store.reduce((a, p) => a + (p.quality_score || 0), 0) / store.length * 100) / 100 : 0,
    readyForTraining: store.length >= 500 // spec test criterion #1
  };
}

/**
 * Export all pairs to JSONL for MLX LoRA training ({instruction,input,output} per line).
 * @param {string} outputPath — default ~/nanoclaw/training/data/cathedral-training.jsonl
 * @param {object} opts — { minQuality: 0 } filter low-quality pairs out of the training set
 */
export function exportJSONL(outputPath = DEFAULT_JSONL_PATH, opts = {}) {
  const store = loadJSON(TRAINING_DATA_PATH);
  const minQ = opts.minQuality || 0;
  const rows = store.filter(p => (p.quality_score || 0) >= minQ);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const lines = rows.map(p => JSON.stringify({ instruction: p.instruction, input: p.input || '', output: p.output }));
  fs.writeFileSync(outputPath, lines.join('\n') + (lines.length ? '\n' : ''));
  return { written: rows.length, skippedBelowQuality: store.length - rows.length, outputPath };
}

// ═════════════════════════ VALIDATION HARNESS ════════════════════════════

/**
 * The curated test query set (25 queries: 5 diagnostic, 5 prescription,
 * 5 metaphor, 5 edge case, 5 anti-pattern). Source of truth:
 * sovereignty-test-queries.json — edit there, not here.
 */
export function getTestQueries() {
  const q = loadJSON(TEST_QUERIES_PATH);
  if (!q.length) throw new Error(`No test queries at ${TEST_QUERIES_PATH}`);
  return q;
}

// Paul-lexicon markers — used for the lexicon_match dimension on every query,
// on top of the per-query expected terms.
const PAUL_LEXICON = [
  'fear gate', 'three engines', 'engine', 'leak', 'composure', 'floor element',
  'alarm, not', 'trap door', 'block', 'gate', 'energy', 'organize', 'cultivate',
  'protect', 'wound', 'underneath', 'concrete image', 'mechanism', 'checkpoint',
  'accumulat', 'evidence', 'survived'
];

// Fraction of terms present in text (case-insensitive substring), capped at 1
function termHitRate(text, terms) {
  if (!terms || !terms.length) return null;
  const t = text.toLowerCase();
  const hits = terms.filter(term => t.includes(String(term).toLowerCase())).length;
  return hits / terms.length;
}

// Score one model response against one test query. Heuristic, deterministic,
// works offline — the same yardstick applied to base / distilled / frontier.
export function scoreResponse(query, response) {
  const text = String(response || '');
  const t = text.toLowerCase();
  const exp = query.expect || {};

  // lexicon_match: per-query expected lexicon (weighted) + general Paul lexicon
  const qLex = termHitRate(t, exp.lexicon);
  const gLex = Math.min((PAUL_LEXICON.filter(w => t.includes(w)).length) / 4, 1); // 4+ general markers = full
  const lexicon_match = qLex === null ? gLex : Math.round((qLex * 0.7 + gLex * 0.3) * 100) / 100;

  // domain_accuracy: does the response hit the substance the query is probing?
  const domain_accuracy = Math.round((termHitRate(t, exp.domain_keywords) ?? 0.5) * 100) / 100;

  // reasoning_depth: causal structure + a prescription + sane length (not a wall of text)
  const causal = (t.match(/\b(because|so that|which means|therefore|correlate|the mechanism|that's why|underneath|not .{1,20}, it's)\b/g) || []).length;
  const prescribes = /\b(prescrib|drill|cue|try|switch to|start with|have them|ask|check|watch for)\b/.test(t);
  const lengthOk = text.length >= 120 && text.length <= 1600; // walls of text are a Paul rejection
  const reasoning_depth = Math.round(Math.min(
    (Math.min(causal, 3) / 3) * 0.5 + (prescribes ? 0.3 : 0) + (lengthOk ? 0.2 : 0), 1) * 100) / 100;

  // pauls_voice: penalize the never-say list hard; penalize known slop patterns
  let voice = 1.0;
  for (const banned of (exp.must_avoid || [])) {
    if (t.includes(String(banned).toLowerCase())) voice -= 0.4;
  }
  for (const slop of ['as an ai', 'it should be noted', 'in summary', 'unleash your', 'inner warrior', 'safe space']) {
    // 'safe space' only penalized when used as the announcement, not when the
    // response is correctly REJECTING the announcement
    if (slop === 'safe space' && /never|without|don't say|avoid|instead|rather than|not by saying/.test(t)) continue;
    if (t.includes(slop)) voice -= 0.25;
  }
  const pauls_voice = Math.round(Math.max(voice, 0) * 100) / 100;

  const composite = Math.round((lexicon_match * 0.25 + reasoning_depth * 0.25 + domain_accuracy * 0.25 + pauls_voice * 0.25) * 100) / 100;
  return { lexicon_match, reasoning_depth, domain_accuracy, pauls_voice, composite };
}

/**
 * Run test queries against an Ollama model and score every response.
 * @param {string} modelName — any Ollama model (hermes3, hermes3-cathedral, ...)
 * @param {Array} testQueries — defaults to the full curated set
 * @returns {Promise<object>} ValidationReport
 */
export async function validateModel(modelName, testQueries = null) {
  const queries = testQueries || getTestQueries();
  const results = [];
  const system = 'You are Coach Paul of Basic Reflex, a boxing gym in Hong Kong. Answer as the coach: diagnostic, metaphorical, precise, concrete. Short paragraphs, no lists of ten pointers, no guru talk.';

  for (const q of queries) {
    let response = '', error = null;
    try { response = await askOllama(modelName, q.query, system); }
    catch (e) { error = e.message; }
    results.push({
      id: q.id, category: q.category, query: q.query,
      response: response.trim(), error,
      scores: error ? { lexicon_match: 0, reasoning_depth: 0, domain_accuracy: 0, pauls_voice: 0, composite: 0 } : scoreResponse(q, response)
    });
  }

  const avg = (key) => Math.round(results.reduce((a, r) => a + r.scores[key], 0) / results.length * 100) / 100;
  const byCategory = {};
  for (const r of results) {
    (byCategory[r.category] = byCategory[r.category] || []).push(r.scores.composite);
  }
  for (const [k, v] of Object.entries(byCategory)) byCategory[k] = Math.round(v.reduce((a, b) => a + b, 0) / v.length * 100) / 100;

  return {
    model: modelName,
    date: today(),
    queriesRun: results.length,
    averages: { lexicon_match: avg('lexicon_match'), reasoning_depth: avg('reasoning_depth'), domain_accuracy: avg('domain_accuracy'), pauls_voice: avg('pauls_voice'), composite: avg('composite') },
    byCategory,
    results
  };
}

/**
 * Run the same queries against two models, side by side. This is the
 * post-M5 acceptance test: distilled must beat base by >20% composite.
 * @returns {Promise<object>} ComparisonTable
 */
export async function compareModels(modelA, modelB, testQueries = null) {
  const queries = testQueries || getTestQueries();
  const [repA, repB] = [await validateModel(modelA, queries), await validateModel(modelB, queries)];

  const rows = queries.map((q, i) => {
    const a = repA.results[i].scores.composite;
    const b = repB.results[i].scores.composite;
    return {
      id: q.id, category: q.category,
      [modelA]: a, [modelB]: b,
      winner: a > b ? modelA : b > a ? modelB : 'tie'
    };
  });

  const cA = repA.averages.composite, cB = repB.averages.composite;
  const improvementPct = cA > 0 ? Math.round(((cB - cA) / cA) * 1000) / 10 : null;

  return {
    date: today(),
    models: [modelA, modelB],
    averages: { [modelA]: repA.averages, [modelB]: repB.averages },
    wins: {
      [modelA]: rows.filter(r => r.winner === modelA).length,
      [modelB]: rows.filter(r => r.winner === modelB).length,
      tie: rows.filter(r => r.winner === 'tie').length
    },
    // Spec: distilled must beat base on Paul-specific tasks by >20%
    improvementPctBOverA: improvementPct,
    passesShrinkGate: improvementPct !== null && improvementPct > 20,
    rows,
    fullReports: { [modelA]: repA, [modelB]: repB }
  };
}

// ═════════════════════════ COST TRACKER ══════════════════════════════════

/**
 * Record a training run. (Pre-hardware: also usable for dry-run estimates —
 * tag config.dryRun = true.)
 * @param {object} config — { model, datasetSize, iterations, batchSize, hardware, dryRun? }
 * @param {object} metrics — { timeMinutes, peakMemoryGB, validationScore, notes }
 */
export function logTrainingRun(config = {}, metrics = {}) {
  const log = loadJSON(TRAINING_LOG_PATH);
  const run = {
    id: `run_${Date.now()}`,
    date: today(),
    config: {
      model: config.model || GEN_MODEL,
      datasetSize: config.datasetSize ?? null,
      iterations: config.iterations ?? null,
      batchSize: config.batchSize ?? 4,
      hardware: config.hardware || 'M4 16GB (pre-M5)',
      dryRun: config.dryRun === true
    },
    metrics: {
      timeMinutes: metrics.timeMinutes ?? null,
      peakMemoryGB: metrics.peakMemoryGB ?? null,
      validationScore: metrics.validationScore ?? null,
      notes: metrics.notes || ''
    }
  };
  log.push(run);
  saveJSON(TRAINING_LOG_PATH, log);
  return run;
}

/**
 * All training runs, plus which run currently holds the best validation score.
 */
export function getTrainingHistory() {
  const log = loadJSON(TRAINING_LOG_PATH);
  const scored = log.filter(r => typeof r.metrics?.validationScore === 'number');
  const best = scored.sort((a, b) => b.metrics.validationScore - a.metrics.validationScore)[0] || null;
  return { runs: log, count: log.length, bestRun: best };
}

/**
 * Estimate a LoRA training run on current and target hardware.
 * Rough MLX LoRA arithmetic for an 8B model, 4-bit base, rank-16 adapters:
 * throughput ≈ tokens/sec on the given chip; each iteration processes
 * batchSize × avgTokensPerPair tokens.
 * These are planning numbers, not benchmarks — recalibrate against the first
 * real run on the M5 (logTrainingRun the actuals).
 */
export function estimateCost(datasetSize, iterations, opts = {}) {
  const batchSize = opts.batchSize || 4;
  const avgTokensPerPair = opts.avgTokensPerPair || 350; // instruction+output, coaching pairs are short
  const tokensPerIter = batchSize * avgTokensPerPair;
  const totalTokens = tokensPerIter * iterations;
  const epochs = datasetSize ? Math.round((iterations * batchSize / datasetSize) * 10) / 10 : null;

  const HW = [
    // tokensPerSec = training throughput estimate for 8B 4-bit LoRA under MLX
    { name: 'M4 16GB (current)', tokensPerSec: 60, feasible8B: false, note: 'BLOCKED — 16GB cannot hold 8B training + inference. Hardware gate.' },
    { name: 'M5 Max 128GB (target, ~Oct 2026)', tokensPerSec: 350, feasible8B: true, note: 'Room for 14B+ training with simultaneous inference.' }
  ];

  return {
    datasetSize, iterations, batchSize, avgTokensPerPair,
    totalTrainingTokens: totalTokens,
    approxEpochs: epochs,
    perHardware: HW.map(h => ({
      hardware: h.name,
      feasible: h.feasible8B,
      estimatedMinutes: Math.round(totalTokens / h.tokensPerSec / 60),
      estimatedHours: Math.round(totalTokens / h.tokensPerSec / 3600 * 10) / 10,
      note: h.note
    })),
    electricityNote: 'Local training electricity cost is negligible (<HK$5/run on Apple Silicon) — the real cost is time and the hardware itself. Zero API spend: that is the point.'
  };
}

// ═════════════════════════ TRAINING (HARDWARE-GATED STUB) ════════════════

/**
 * ██ HARDWARE GATE ██
 * LoRA training is BLOCKED until the M5 Mac Studio (M5 Max, 128GB, ~Oct 2026).
 * The M4 16GB cannot hold an 8B model's training pass — do not attempt.
 *
 * When the M5 arrives, this becomes (per spec 5c Stage 2 / master-architecture Phase 5):
 *   1. exportJSONL()                     → ~/nanoclaw/training/data/
 *   2. pip install mlx-lm
 *   3. mlx_lm.lora --model hermes3 --data ~/nanoclaw/training/data/ --train \
 *        --iters 1000 --batch-size 4     → adapters in ~/nanoclaw/training/adapters/
 *   4. mlx_lm.fuse --model hermes3 --adapter-path adapters/ --save-path hermes3-cathedral
 *   5. ollama create hermes3-cathedral -f Modelfile
 *   6. compareModels('hermes3', 'hermes3-cathedral') → must beat base by >20%
 *   7. logTrainingRun(config, actualMetrics)         → recalibrate estimateCost
 *   8. taste-gate.mjs switches local queries to the distilled model
 */
export async function trainModel() {
  const msg = 'HARDWARE-GATED: LoRA training blocked until M5 Mac Studio (M5 Max 128GB, ~Oct 2026). ' +
    'The data pipeline is live NOW — run batchGenerate + exportJSONL so the training set is ready the day the hardware lands.';
  return { blocked: true, gate: 'M5 Mac Studio ~Oct 2026', message: msg };
}

// ═════════════════════════ CLI ═══════════════════════════════════════════
// node sovereignty-shrink.js generate [vault|rules|interventions|taste|all] [limit]
// node sovereignty-shrink.js stats | export [path] | queries
// node sovereignty-shrink.js validate <model> | compare <modelA> <modelB>
// node sovereignty-shrink.js estimate <datasetSize> <iterations> | history | train

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(path.join(NANO, 'sovereignty-shrink.js'));
if (isDirectRun) {
  const [, , cmd, a, b] = process.argv;
  const out = (o) => console.log(JSON.stringify(o, null, 2));
  if (cmd === 'generate') out(await batchGenerate(a || 'all', { limit: b ? parseInt(b, 10) : undefined, verbose: true }));
  else if (cmd === 'stats') out(getTrainingStats());
  else if (cmd === 'export') out(exportJSONL(a || undefined));
  else if (cmd === 'queries') out(getTestQueries().map(q => `${q.category} :: ${q.id}`));
  else if (cmd === 'validate') out(await validateModel(a || GEN_MODEL));
  else if (cmd === 'compare') out(await compareModels(a || GEN_MODEL, b || `${GEN_MODEL}-cathedral`));
  else if (cmd === 'estimate') out(estimateCost(parseInt(a, 10) || 500, parseInt(b, 10) || 1000));
  else if (cmd === 'history') out(getTrainingHistory());
  else if (cmd === 'train') out(await trainModel());
  else if (cmd) console.log('Usage: generate [type] [limit] | stats | export [path] | queries | validate <model> | compare <a> <b> | estimate <size> <iters> | history | train');
}
