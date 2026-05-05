// ~/nanoclaw/obliteratus-engine.js
// 6-stage pipeline: DECOMPOSE → RETRIEVE → REASON → TRIAGE → SYNTHESIZE → ARCHIVE
//
// Fixes applied (2026-04-06):
//   Fix 1 — Sight pre-flight: domain coverage gate before pipeline runs
//   Fix 2 — Source tagging: [VAULT]/[MODEL-GENERATED]/[EXTERNAL], bracketed throughout
//   Fix 3 — Suppression conditional: section omitted when no evidence found
//   Fix 4 — Local model routing: hermes3 for heterodox, qwen3:14b for structural
//   Fix 5 — Logical fallacy detection: flagged in REASON stage, surfaced in report
//   Fix 6 — Decomposition quality gate: relevance check discards drifted sub-queries
//   Fix 7 — Ledger auto-log: Grade A/B claims auto-logged to falsifiable claims tracker

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { semanticSearch } from './vault-embedder.js';
import { triageClaim } from './epistemic-triage.js';

const HOME        = process.env.HOME;
const OLLAMA_URL  = 'http://localhost:11434';
const PROMPTS_DIR = join(HOME, 'nanoclaw', 'prompts');
const ARCHIVE_DIR = join(HOME, 'cathedral-vault', '04_Esoteric_Studies', 'obliteratus-reports');

// ── Fix 4: Domain-aware model routing ────────────────────────────────────────
// Heterodox domains require uncensored reasoning — hermes3.
// Structural/mathematical/general domains — qwen3:14b.

const DECOMPOSE_MODEL = 'qwen3:14b';
const SYNTH_MODEL     = 'hermes3';

const HETERODOX_DOMAINS = new Set([
  'suppressed_energy', 'aetheric_field', 'vortex_mathematics',
  'frequency_consciousness', 'cosmology', 'ancient_knowledge',
  'suppression_pattern', 'water_matter',
]);

function selectReasonModel(domains = []) {
  const heterodox = domains.filter(d => HETERODOX_DOMAINS.has(d));
  const model = heterodox.length > 0 ? 'hermes3' : 'qwen3:14b';
  return { model, heterodox_domains: heterodox };
}

// ── Core Ollama call ──────────────────────────────────────────────────────────

async function queryOllama({ model, system, prompt }) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: prompt },
      ],
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${res.statusText}`);
  const data = await res.json();
  return data.message?.content || '';
}

// ── JSON extraction ───────────────────────────────────────────────────────────
// Handles: raw JSON, markdown fences, qwen3 <think> blocks, partial wrapping

function extractJSON(raw) {
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  try { return JSON.parse(cleaned); } catch {}

  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch {} }

  const arrStart = cleaned.indexOf('[');
  const arrEnd   = cleaned.lastIndexOf(']');
  if (arrStart !== -1 && arrEnd > arrStart) {
    try { return JSON.parse(cleaned.slice(arrStart, arrEnd + 1)); } catch {}
  }

  const objStart = cleaned.indexOf('{');
  const objEnd   = cleaned.lastIndexOf('}');
  if (objStart !== -1 && objEnd > objStart) {
    try { return JSON.parse(cleaned.slice(objStart, objEnd + 1)); } catch {}
  }

  throw new Error('Could not extract JSON from model response');
}

function loadPrompt(name) {
  return readFileSync(join(PROMPTS_DIR, `${name}.txt`), 'utf8');
}

// ── Fix 7: Ledger spawn helper ────────────────────────────────────────────────

const LEDGER_PATH = join(HOME, 'Cathedral', 'ledger.py');

function spawnLedgerLog(claim, source = 'obliteratus', days = 90) {
  return new Promise((resolve) => {
    const proc = spawn('python3', [
      LEDGER_PATH, 'log', claim, '--source', source, '--days', String(days),
    ], { env: process.env });
    let stdout = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.on('close', code => {
      if (code === 0) {
        console.log(`[ledger] Logged: "${claim.slice(0, 60)}..." (${source}, ${days}d)`);
      } else {
        console.warn(`[ledger] Failed to log claim (exit ${code})`);
      }
      resolve(code === 0);
    });
    proc.on('error', () => resolve(false));
  });
}

// ── Stage 1: DECOMPOSE ────────────────────────────────────────────────────────

const DECOMPOSE_SYSTEM = `You are a forensic research decomposition engine. Your job is to break a research question into 3-6 specific, domain-tagged sub-queries for vault retrieval.

CRITICAL CONSTRAINT: Every sub-query must be directly relevant to the original question. A reader who sees only the original question must be able to recognise each sub-query as a necessary angle of investigation. Do not drift into adjacent topics, analogies, or cross-domain associations unless the original question explicitly spans those domains.

Return ONLY a valid JSON object — no preamble, no explanation, no markdown:
{
  "original_question": "the full question",
  "subqueries": [
    {
      "query": "specific sub-question to search for",
      "domain": "one of the domain tags below",
      "rationale": "why this angle is necessary for the original question"
    }
  ]
}

Valid domain tags: suppressed_energy, aetheric_field, sacred_geometry, vortex_mathematics, frequency_consciousness, cosmology, ancient_knowledge, water_matter, suppression_pattern, mathematics_physics, boxing, philosophy, general`;

// Fix 6: Relevance gate — single-batch check, discard drifted sub-queries

const RELEVANCE_CHECK_SYSTEM = `You are a relevance validator. Given an original research question and a list of sub-queries, determine which sub-queries are directly relevant.

For each sub-query, answer YES if someone who read only the original question would recognise this sub-query as a necessary angle of investigation. Answer NO if it drifts into unrelated territory.

Return ONLY a JSON array of objects — no preamble:
[{"query": "the sub-query", "relevant": true/false, "reason": "brief explanation"}]`;

async function checkRelevance(question, subqueries) {
  const sqList = subqueries.map((sq, i) => `${i + 1}. [${sq.domain}] ${sq.query}`).join('\n');

  try {
    const raw = await queryOllama({
      model: DECOMPOSE_MODEL,
      system: RELEVANCE_CHECK_SYSTEM,
      prompt: `Original question: ${question}\n\nSub-queries to validate:\n${sqList}`,
    });

    const parsed = extractJSON(raw);
    const results = Array.isArray(parsed) ? parsed : [];

    // Match back to original subqueries by index
    const kept = [];
    const discarded = [];
    for (let i = 0; i < subqueries.length; i++) {
      const check = results[i];
      if (check && check.relevant === false) {
        discarded.push({ ...subqueries[i], reason: check.reason || 'irrelevant' });
      } else {
        kept.push(subqueries[i]);
      }
    }

    return { kept, discarded };
  } catch (err) {
    console.warn(`[DECOMPOSE] Relevance check failed: ${err.message} — keeping all sub-queries`);
    return { kept: subqueries, discarded: [] };
  }
}

async function decompose(question) {
  let raw;
  try {
    raw = await queryOllama({
      model: DECOMPOSE_MODEL,
      system: DECOMPOSE_SYSTEM,
      prompt: `Decompose this research question into forensic sub-queries:\n\n${question}`,
    });
  } catch (err) {
    console.warn(`DECOMPOSE failed: ${err.message} — falling back to single query`);
    return {
      original_question: question,
      subqueries: [{ query: question, domain: 'general', rationale: 'Single-pass fallback' }],
      relevance_gate: { checked: false },
    };
  }

  let parsed;
  try {
    parsed = extractJSON(raw);
    if (!parsed.subqueries || !Array.isArray(parsed.subqueries) || parsed.subqueries.length === 0) {
      throw new Error('No subqueries');
    }
  } catch {
    return {
      original_question: question,
      subqueries: [{ query: question, domain: 'general', rationale: 'Parse fallback — single query' }],
      relevance_gate: { checked: false },
    };
  }

  // Fix 6: Relevance gate
  const { kept, discarded } = await checkRelevance(question, parsed.subqueries);

  if (discarded.length > 0) {
    console.log(`[DECOMPOSE] Relevance gate discarded ${discarded.length}/${parsed.subqueries.length}: ${discarded.map(d => d.query.slice(0, 40)).join('; ')}`);
  }

  // If >50% discarded, regenerate with tighter prompt
  if (kept.length === 0 || discarded.length > parsed.subqueries.length / 2) {
    console.log(`[DECOMPOSE] >50% discarded — regenerating with tighter constraint`);
    try {
      const retryRaw = await queryOllama({
        model: DECOMPOSE_MODEL,
        system: DECOMPOSE_SYSTEM,
        prompt: `Decompose this research question into forensic sub-queries. IMPORTANT: Every sub-query must be directly answerable by evidence about the specific topic asked. Do NOT drift into analogies or adjacent fields.\n\nQuestion: ${question}`,
      });
      const retryParsed = extractJSON(retryRaw);
      if (retryParsed.subqueries?.length > 0) {
        return {
          ...retryParsed,
          relevance_gate: { checked: true, first_pass_discarded: discarded.length, regenerated: true },
        };
      }
    } catch {}
    // If retry also fails, use whatever we kept
  }

  return {
    original_question: question,
    subqueries: kept.length > 0 ? kept : [{ query: question, domain: 'general', rationale: 'All sub-queries discarded — original question fallback' }],
    relevance_gate: { checked: true, discarded: discarded.length, kept: kept.length, regenerated: false },
  };
}

// ── Stage 2: RETRIEVE ─────────────────────────────────────────────────────────

async function retrieve(subqueries) {
  const nuggetMap = new Map();

  for (const sq of subqueries) {
    try {
      const results = await semanticSearch(sq.query, 8, null);
      for (const r of results) {
        if (!nuggetMap.has(r.file_path)) {
          nuggetMap.set(r.file_path, { ...r, matched_query: sq.query, matched_domain: sq.domain });
        }
      }
    } catch (err) {
      console.warn(`RETRIEVE failed for "${sq.query}": ${err.message}`);
    }
  }

  return [...nuggetMap.values()].sort((a, b) => (b.score || 0) - (a.score || 0));
}

// ── Fix 1: Sight pre-flight — domain coverage gate ───────────────────────────
// Checks per-domain nugget coverage before allowing the pipeline to continue.
// A thin vault produces model-hallucinated claims scored as if retrieved.

const MIN_NUGGETS_PER_DOMAIN = 3;  // Below this: THIN warning
const MIN_NUGGETS_TOTAL      = 5;  // Below this: BLOCK regardless

function sightGate(subqueries, nuggets) {
  // Count nuggets per domain
  const domainCounts = {};
  for (const sq of subqueries) {
    domainCounts[sq.domain] = 0;
  }
  for (const n of nuggets) {
    if (n.matched_domain && domainCounts[n.matched_domain] !== undefined) {
      domainCounts[n.matched_domain]++;
    }
  }

  const emptyDomains = Object.entries(domainCounts)
    .filter(([, count]) => count === 0)
    .map(([d]) => d);

  const thinDomains = Object.entries(domainCounts)
    .filter(([, count]) => count > 0 && count < MIN_NUGGETS_PER_DOMAIN)
    .map(([d, count]) => `${d}(${count})`);

  const blocked = nuggets.length < MIN_NUGGETS_TOTAL || emptyDomains.length > 0;

  return {
    pass: !blocked,
    domain_counts: domainCounts,
    empty_domains: emptyDomains,
    thin_domains:  thinDomains,
    total_nuggets: nuggets.length,
  };
}

// ── Stage 3: REASON ───────────────────────────────────────────────────────────
// Fix 2: Source tags use [VAULT]/[MODEL-GENERATED]/[EXTERNAL] format
// Fix 4: Model selected based on domain heterodoxy
// Fix 5: Fallacy detection integrated into claim extraction

const CLAIM_EXTRACT_SYSTEM = `You are a forensic claim extractor embedded in a sovereign research system.

Given a research question and vault context, extract 3-8 discrete, testable claims that directly address the question.

Requirements for each claim:
- Single specific, testable assertion (one idea per claim)
- Grounded in vault context or documented historical record
- Distinct from other claims — no near-duplicates
- Precise enough that evidence can be found for or against it

Return ONLY a valid JSON array of claim objects. No preamble, no explanation:
[{
  "claim": "exact claim text",
  "source": "VAULT | MODEL-GENERATED | EXTERNAL",
  "fallacies": ["appeal_to_authority" | "circular_reasoning" | "false_dichotomy" | "hasty_generalisation" | "ad_hominem" | "straw_man" | "false_cause" | "anecdotal"]
}]

Source rules:
- "VAULT" — directly grounded in the vault context provided
- "MODEL-GENERATED" — drawn from your own training priors without vault support
- "EXTERNAL" — from user-supplied external material not in vault

Fallacy rules:
- List any detected logical fallacies for each claim
- Return empty array [] if none detected
- appeal_to_authority: claim rests on who said it, not the evidence
- circular_reasoning: conclusion assumed in premise
- false_dichotomy: only two options presented when more exist
- hasty_generalisation: conclusion from insufficient sample
- false_cause: correlation treated as causation
- anecdotal: single case generalised to universal claim`;

async function reason(question, nuggets, domains = []) {
  const { model, heterodox_domains } = selectReasonModel(domains);

  const context = nuggets.slice(0, 15).map(n => {
    const title = n.title ? `## ${n.title}` : '';
    const body  = n.first_line || '';
    return [title, body].filter(Boolean).join('\n');
  }).join('\n---\n');

  let raw;
  try {
    raw = await queryOllama({
      model,
      system: CLAIM_EXTRACT_SYSTEM,
      prompt: `Research question: ${question}\n\nVault context:\n${context}\n\nExtract 3-8 discrete, testable claims relevant to this question. Tag source and flag fallacies.`,
    });
  } catch (err) {
    throw new Error(`REASON stage failed: ${err.message}`);
  }

  let parsed;
  try {
    parsed = extractJSON(raw);
  } catch {
    // Fallback: extract sentences, all tagged MODEL-GENERATED, no fallacy data
    const sentences = raw
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .split(/(?<=[.!?])\s+/)
      .filter(s => s.length > 20 && s.length < 400);
    return {
      claims: sentences.slice(0, 6).map(s => ({
        claim: s, source: 'MODEL-GENERATED', fallacies: [],
      })),
      model_used: model,
      heterodox_domains,
    };
  }

  const rawClaims = Array.isArray(parsed) ? parsed :
    (parsed.claims && Array.isArray(parsed.claims)) ? parsed.claims : [];

  const claims = rawClaims
    .map(c => typeof c === 'string'
      ? { claim: c, source: 'MODEL-GENERATED', fallacies: [] }
      : {
          claim:    c.claim    || '',
          source:   c.source   || 'MODEL-GENERATED',
          fallacies: Array.isArray(c.fallacies) ? c.fallacies : [],
        })
    .filter(c => c.claim.length > 15);

  return { claims, model_used: model, heterodox_domains };
}

// ── Stage 4: TRIAGE ───────────────────────────────────────────────────────────

async function triage(claims, nuggets, onProgress) {
  const graded = [];

  for (let i = 0; i < claims.length; i++) {
    const claimObj = typeof claims[i] === 'string'
      ? { claim: claims[i], source: null, fallacies: [] }
      : claims[i];
    const { claim, source, fallacies = [] } = claimObj;

    if (onProgress) onProgress({ current: i + 1, total: claims.length, claim: claim.slice(0, 60) });

    try {
      const result = await triageClaim(claim, nuggets, undefined, source);
      graded.push({ ...result, fallacies });
    } catch (err) {
      graded.push({
        claim,
        source_tag: source,
        fallacies,
        grade: 'F',
        composite: 0,
        structural_integrity: 0, structural_notes: `Triage error: ${err.message}`,
        independent_corroboration: 0, corroboration_sources: [],
        experimental_evidence: 0, experimental_notes: '',
        provenance_quality: 0, provenance_chain: '',
        suppression_signature: 0, suppression_notes: '',
        contamination_flag: false, contamination_analysis: '',
        open_questions: [],
        error: err.message,
      });
    }
  }

  return graded;
}

// ── Stage 5: SYNTHESIZE ───────────────────────────────────────────────────────
// Fix 2: Source tags shown in [BRACKETED] format
// Fix 3: Suppression section conditional — only when evidence exists

function formatClaimForSynthesis(c) {
  const tag =
    c.grade === 'A' ? '[VERIFIED]' :
    c.grade === 'B' ? '[STRONG LEAD]' :
    c.grade === 'C' ? '[OPEN THREAD]' :
    c.grade === 'D' ? '[UNVERIFIED]' : '[CONTAMINATED]';

  // Fix 2: bracketed source tags
  const sourceTag = c.source_tag ? `[${c.source_tag}]` : '[UNKNOWN]';

  // Fix 5: fallacy flags in claim block
  const fallacyLine = c.fallacies && c.fallacies.length > 0
    ? `\n  ⚠️ FALLACIES: ${c.fallacies.join(', ')}`
    : '';

  return (
    `CLAIM: ${c.claim}\n` +
    `  SOURCE: ${sourceTag}\n` +
    `  S:${(c.structural_integrity || 0).toFixed(2)}  ` +
    `I:${(c.independent_corroboration || 0).toFixed(2)}  ` +
    `E:${(c.experimental_evidence || 0).toFixed(2)}  ` +
    `P:${(c.provenance_quality || 0).toFixed(2)}  ` +
    `X:${(c.suppression_signature || 0).toFixed(2)}\n` +
    `  COMPOSITE: ${(c.composite || 0).toFixed(2)}  GRADE: ${c.grade}  ${tag}` +
    (c.contamination_flag ? `\n  ⚠️ CONTAMINATION: ${c.contamination_analysis}` : '') +
    fallacyLine
  );
}

async function synthesize(question, decomposed, gradedClaims, nuggetCount, reasonMeta) {
  const synthesisPrompt = loadPrompt('synthesis-engine');

  const subQueryList = decomposed.subqueries
    .map(sq => `  - [${sq.domain}] ${sq.query}`)
    .join('\n');

  const claimBlocks = gradedClaims.map(formatClaimForSynthesis).join('\n\n');

  // Fix 3: Suppression conditional
  const suppressionClaims = gradedClaims.filter(c => (c.suppression_signature || 0) > 0.3);
  const suppressionDirective = suppressionClaims.length === 0
    ? `SUPPRESSION NOTE: No suppression signatures found in this claim set (all suppression_signature scores ≤ 0.3). Do NOT fabricate suppression context. In Section 7 (SUPPRESSION CONTEXT), write only: "No suppression evidence found in this claim set."`
    : `SUPPRESSION NOTE: ${suppressionClaims.length} claim(s) carry suppression signatures. Include Section 7 normally.`;

  // Fix 4: Report which model was used for reasoning
  const modelLine = reasonMeta
    ? `REASON model: ${reasonMeta.model_used} (domains: ${reasonMeta.heterodox_domains.length > 0 ? reasonMeta.heterodox_domains.join(', ') : 'none heterodox'})`
    : '';

  // Fix 5: Fallacy summary
  const flaggedClaims = gradedClaims.filter(c => c.fallacies && c.fallacies.length > 0);
  const fallacyDirective = flaggedClaims.length > 0
    ? `FALLACY NOTE: ${flaggedClaims.length} claim(s) carry logical fallacy flags. Include these in the CONTAMINATION REPORT section alongside contamination_flag items.`
    : `FALLACY NOTE: No logical fallacies detected.`;

  const userPrompt =
    `Generate a complete Obliteratus forensic report.\n\n` +
    `RESEARCH QUESTION: ${question}\n\n` +
    `SUB-QUERIES INVESTIGATED:\n${subQueryList}\n\n` +
    `VAULT NUGGETS ACCESSED: ${nuggetCount}\n` +
    `CLAIMS TRIAGED: ${gradedClaims.length}\n` +
    `DATE: ${new Date().toISOString().split('T')[0]}\n` +
    `MODELS: ${DECOMPOSE_MODEL} (DECOMPOSE) | ${modelLine} | ${SYNTH_MODEL} (SYNTHESIZE)\n\n` +
    `${suppressionDirective}\n\n` +
    `${fallacyDirective}\n\n` +
    `PRE-GRADED CLAIMS — do not upgrade or downgrade these grades:\n\n` +
    `${claimBlocks}\n\n` +
    `Generate the 9-section Obliteratus report per your instructions. ` +
    `Use Paul's sovereign lexicon where it adds precision.`;

  return queryOllama({ model: SYNTH_MODEL, system: synthesisPrompt, prompt: userPrompt });
}

// ── Stage 6: ARCHIVE ──────────────────────────────────────────────────────────

function archive(question, reportText, gradedClaims, reasonMeta) {
  if (!existsSync(ARCHIVE_DIR)) mkdirSync(ARCHIVE_DIR, { recursive: true });

  const dateStr = new Date().toISOString().split('T')[0];
  const slug = question.slice(0, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
  const filename = `${dateStr}-obliteratus-${slug}.md`;
  const filePath = join(ARCHIVE_DIR, filename);

  const gs = {
    A:  gradedClaims.filter(c => c.grade === 'A').length,
    B:  gradedClaims.filter(c => c.grade === 'B').length,
    C:  gradedClaims.filter(c => c.grade === 'C').length,
    DF: gradedClaims.filter(c => c.grade === 'D' || c.grade === 'F').length,
  };

  const falacyCount = gradedClaims.filter(c => c.fallacies && c.fallacies.length > 0).length;
  const reasonModel = reasonMeta?.model_used || 'unknown';

  const content =
    `---\n` +
    `title: "Obliteratus: ${question.slice(0, 80).replace(/"/g, "'")}"\n` +
    `date: ${dateStr}\n` +
    `domain: obliteratus_report\n` +
    `tags: [obliteratus, research_report, epistemic_triage]\n` +
    `grade_distribution: "A:${gs.A} B:${gs.B} C:${gs.C} D/F:${gs.DF}"\n` +
    `fallacy_flags: ${falacyCount}\n` +
    `provenance: "Obliteratus Engine — DECOMPOSE(${DECOMPOSE_MODEL})/RETRIEVE/REASON(${reasonModel})/TRIAGE/SYNTHESIZE(${SYNTH_MODEL})/ARCHIVE"\n` +
    `---\n\n` +
    `# Obliteratus Report: ${question}\n\n` +
    `*Generated: ${new Date().toISOString()}*\n` +
    `*Claims: ${gradedClaims.length} | A:${gs.A} B:${gs.B} C:${gs.C} D/F:${gs.DF} | Fallacy flags: ${falacyCount}*\n\n` +
    `---\n\n` +
    `${reportText}\n`;

  writeFileSync(filePath, content, 'utf8');
  return { filePath, filename };
}

// ── Public: runObliteratus ────────────────────────────────────────────────────

/**
 * runObliteratus(question, opts)
 *
 * @param {string}   question         — Research question
 * @param {object}   [opts]
 * @param {function} [opts.onProgress] — Progress callback: ({ stage, message })
 * @returns {Promise<object>}         — Full structured result
 */
export async function runObliteratus(question, opts = {}) {
  const { onProgress } = opts;
  const progress = (stage, message) => {
    if (onProgress) onProgress({ stage, message });
  };

  const startTime = Date.now();

  // 0. HEALTH GATE — Obliteratus requires local models
  try {
    await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
  } catch {
    throw new Error('Ollama not reachable at localhost:11434. Obliteratus requires local models. Start Ollama first.');
  }

  // 1. DECOMPOSE
  progress('DECOMPOSE', `Breaking question into sub-queries via ${DECOMPOSE_MODEL}...`);
  const decomposed = await decompose(question);
  progress('DECOMPOSE', `${decomposed.subqueries.length} sub-queries identified`);

  // 2. RETRIEVE
  progress('RETRIEVE', `Searching vault across ${decomposed.subqueries.length} angles...`);
  const nuggets = await retrieve(decomposed.subqueries);
  progress('RETRIEVE', `${nuggets.length} unique nuggets retrieved`);

  // Fix 1: SIGHT PRE-FLIGHT — domain coverage gate
  const domains     = decomposed.subqueries.map(sq => sq.domain);
  const sightResult = sightGate(decomposed.subqueries, nuggets);

  if (!sightResult.pass) {
    const emptyList  = sightResult.empty_domains.join(', ') || 'none';
    const thinList   = sightResult.thin_domains.join(', ')  || 'none';
    progress('SIGHT_GATE', `BLOCKED — empty domains: ${emptyList}`);
    return {
      question,
      advisory:         true,
      advisory_type:    'SIGHT_GATE',
      advisory_message:
        `Vault coverage too thin to run Obliteratus.\n` +
        `Total nuggets: ${sightResult.total_nuggets} (minimum: ${MIN_NUGGETS_TOTAL})\n` +
        `Domains with zero coverage: ${emptyList}\n` +
        `Domains with thin coverage (<${MIN_NUGGETS_PER_DOMAIN}): ${thinList}\n\n` +
        `Harvest more material on these domains before running. Use /sight to check domain coverage.`,
      nuggets_retrieved: nuggets.length,
      domain_coverage:   sightResult.domain_counts,
      decomposed,
    };
  }

  // Thin domain warning — proceed but flag
  const thinWarning = sightResult.thin_domains.length > 0
    ? `⚠️ Thin coverage in: ${sightResult.thin_domains.join(', ')}. Some claims may be model-generated.`
    : null;

  if (thinWarning) progress('SIGHT_GATE', thinWarning);

  // 3. REASON (Fix 4: domain-aware model selection)
  progress('REASON', `Selecting reasoning model for domains: ${domains.join(', ')}...`);
  const reasonMeta = selectReasonModel(domains);
  progress('REASON', `Using ${reasonMeta.model}${reasonMeta.heterodox_domains.length > 0 ? ` [heterodox: ${reasonMeta.heterodox_domains.join(', ')}]` : ''}`);
  progress('REASON', `Extracting claims from ${nuggets.length} nuggets...`);

  const reasonResult = await reason(question, nuggets, domains);
  const rawClaims    = reasonResult.claims;
  progress('REASON', `${rawClaims.length} claims extracted | Fallacy scan complete`);

  // Log fallacy summary
  const flaggedCount = rawClaims.filter(c => c.fallacies && c.fallacies.length > 0).length;
  if (flaggedCount > 0) {
    progress('REASON', `⚠️ ${flaggedCount} claim(s) carry logical fallacy flags`);
  }

  // 4. TRIAGE
  progress('TRIAGE', `Triaging ${rawClaims.length} claims on 5 dimensions...`);
  const gradedClaims = await triage(rawClaims, nuggets, ({ current, total, claim }) => {
    progress('TRIAGE', `${current}/${total}: "${claim}..."`);
  });

  const gs = {
    A: gradedClaims.filter(c => c.grade === 'A').length,
    B: gradedClaims.filter(c => c.grade === 'B').length,
    C: gradedClaims.filter(c => c.grade === 'C').length,
    D: gradedClaims.filter(c => c.grade === 'D').length,
    F: gradedClaims.filter(c => c.grade === 'F').length,
  };
  progress('TRIAGE', `Grades — A:${gs.A} B:${gs.B} C:${gs.C} D:${gs.D} F:${gs.F}`);

  // Fix 7: Auto-log Grade A and B claims to the Ledger
  const ledgerClaims = gradedClaims.filter(c => c.grade === 'A' || c.grade === 'B');
  if (ledgerClaims.length > 0) {
    progress('LEDGER', `Auto-logging ${ledgerClaims.length} Grade A/B claims...`);
    let ledgerLogged = 0;
    for (const c of ledgerClaims) {
      const ok = await spawnLedgerLog(c.claim, 'obliteratus', 90);
      if (ok) ledgerLogged++;
    }
    progress('LEDGER', `${ledgerLogged}/${ledgerClaims.length} claims logged to Ledger (90-day verification)`);
  }

  // 5. SYNTHESIZE
  progress('SYNTHESIZE', `Generating forensic report via ${SYNTH_MODEL}...`);
  const reportText = await synthesize(question, decomposed, gradedClaims, nuggets.length, reasonResult);

  // 6. ARCHIVE
  progress('ARCHIVE', `Saving report to cathedral-vault...`);
  const archived = archive(question, reportText, gradedClaims, reasonResult);
  progress('ARCHIVE', `Saved: ${archived.filename}`);

  return {
    question,
    decomposed,
    nuggets_retrieved:  nuggets.length,
    domain_coverage:    sightResult.domain_counts,
    thin_warning:       thinWarning,
    claims_extracted:   rawClaims.length,
    graded_claims:      gradedClaims,
    report_text:        reportText,
    archived,
    elapsed_seconds:    Math.round((Date.now() - startTime) / 1000),
    timestamp:          new Date().toISOString(),
    grade_summary:      gs,
    reason_model:       reasonResult.model_used,
    heterodox_domains:  reasonResult.heterodox_domains,
    fallacy_flags:      flaggedCount,
    ledger_logged:      ledgerClaims.length,
  };
}

// ── Format for Telegram ───────────────────────────────────────────────────────

export function formatObliteratusHeader(result) {
  const { grade_summary: gs } = result;

  const modelLine = result.reason_model
    ? `🧠 Reason: ${result.reason_model}${result.heterodox_domains?.length > 0 ? ` [heterodox]` : ''}\n`
    : '';

  const thinLine = result.thin_warning ? `⚠️ ${result.thin_warning}\n` : '';

  const fallacyLine = result.fallacy_flags > 0
    ? `🚩 Fallacy flags: ${result.fallacy_flags}\n`
    : '';

  return (
    `🔬 *OBLITERATUS COMPLETE*\n` +
    `_${result.question.slice(0, 120)}_\n\n` +
    `⏱️ ${result.elapsed_seconds}s | 📚 ${result.nuggets_retrieved} nuggets | 🧪 ${result.claims_extracted} claims\n` +
    `Grades: 🟢A:${gs.A}  🔵B:${gs.B}  🟡C:${gs.C}  🟠D:${gs.D}  🔴F:${gs.F}\n` +
    modelLine +
    thinLine +
    fallacyLine +
    (result.ledger_logged > 0 ? `📋 ${result.ledger_logged} claims → Ledger (90d)\n` : '') +
    `\n📁 \`${result.archived.filename}\``
  );
}

// ── CLI entrypoint ────────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const question = process.argv.slice(2).join(' ');
  if (!question) {
    console.error('Usage: node obliteratus-engine.js <research question>');
    process.exit(1);
  }

  console.log(`\nObliteratus Engine\nQuestion: "${question}"\n${'─'.repeat(60)}\n`);

  runObliteratus(question, {
    onProgress: ({ stage, message }) => console.log(`[${stage}] ${message}`),
  }).then(result => {
    if (result.advisory) {
      console.log(`\n⚠️  ${result.advisory_type || 'ADVISORY'}`);
      console.log(result.advisory_message);
      return;
    }
    const { grade_summary: gs } = result;
    console.log('\n' + '═'.repeat(60));
    console.log(`COMPLETE in ${result.elapsed_seconds}s`);
    console.log(`Nuggets: ${result.nuggets_retrieved} | Claims: ${result.claims_extracted}`);
    console.log(`Grades — A:${gs.A} B:${gs.B} C:${gs.C} D:${gs.D} F:${gs.F}`);
    console.log(`Reason model: ${result.reason_model}`);
    if (result.fallacy_flags > 0) console.log(`Fallacy flags: ${result.fallacy_flags}`);
    if (result.thin_warning) console.log(result.thin_warning);
    console.log(`Archived: ${result.archived.filePath}`);
    console.log('\n' + '═'.repeat(60));
    console.log('\nREPORT:\n');
    console.log(result.report_text);
  }).catch(err => {
    console.error('\nFatal:', err.message);
    process.exit(1);
  });
}
