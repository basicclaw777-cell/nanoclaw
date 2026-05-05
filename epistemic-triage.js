// ~/nanoclaw/epistemic-triage.js
// Session 2: Epistemic Triage Framework
// Scores any claim on 5 dimensions, grades A–F, detects disinfo.
// Uses hermes3 via Ollama for uncensored analysis.

import { readFileSync } from 'fs';
import { join } from 'path';

const HOME = process.env.HOME;
const OLLAMA_URL = 'http://localhost:11434';
const TRIAGE_MODEL = 'hermes3';

// ── Weights ───────────────────────────────────────────────────────────────────

export const WEIGHTS = {
  structural:     0.30,
  corroboration:  0.25,
  experimental:   0.25,
  provenance:     0.15,
  suppression:    0.05,
};

// ── Grade calculation ─────────────────────────────────────────────────────────

export function computeGrade(scores) {
  const composite =
    scores.structural_integrity     * WEIGHTS.structural     +
    scores.independent_corroboration * WEIGHTS.corroboration  +
    scores.experimental_evidence    * WEIGHTS.experimental   +
    scores.provenance_quality       * WEIGHTS.provenance      +
    scores.suppression_signature    * WEIGHTS.suppression;

  let grade;
  if      (composite >= 0.80) grade = 'A';
  else if (composite >= 0.60) grade = 'B';
  else if (composite >= 0.40) grade = 'C';
  else if (composite >= 0.20) grade = 'D';
  else                         grade = 'F';

  return { composite: parseFloat(composite.toFixed(3)), grade };
}

// ── Prompt loader ─────────────────────────────────────────────────────────────

function loadPrompt(name) {
  const promptPath = join(HOME, 'nanoclaw', 'prompts', `${name}.txt`);
  return readFileSync(promptPath, 'utf8');
}

// ── Ollama call ───────────────────────────────────────────────────────────────

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

// ── JSON extraction (hermes3 sometimes wraps in markdown) ─────────────────────

function extractJSON(raw) {
  // Try direct parse first
  try {
    return JSON.parse(raw.trim());
  } catch { /* fall through */ }

  // Strip markdown code fences
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch { /* fall through */ }
  }

  // Try to find first { ... } block
  const start = raw.indexOf('{');
  const end   = raw.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)); } catch { /* fall through */ }
  }

  throw new Error('Could not extract valid JSON from model response');
}

// ── Validate + normalise scores ───────────────────────────────────────────────

function normaliseScores(parsed) {
  const clamp = (v) => {
    const n = parseFloat(v);
    return isNaN(n) ? 0.5 : Math.min(1.0, Math.max(0.0, n));
  };

  return {
    claim:                    parsed.claim                    || '',
    structural_integrity:     clamp(parsed.structural_integrity),
    structural_notes:         parsed.structural_notes         || '',
    independent_corroboration: clamp(parsed.independent_corroboration),
    corroboration_sources:    Array.isArray(parsed.corroboration_sources) ? parsed.corroboration_sources : [],
    experimental_evidence:    clamp(parsed.experimental_evidence),
    experimental_notes:       parsed.experimental_notes       || '',
    provenance_quality:       clamp(parsed.provenance_quality),
    provenance_chain:         parsed.provenance_chain         || '',
    suppression_signature:    clamp(parsed.suppression_signature),
    suppression_notes:        parsed.suppression_notes        || '',
    contamination_flag:       !!parsed.contamination_flag,
    contamination_analysis:   parsed.contamination_analysis   || '',
    open_questions:           Array.isArray(parsed.open_questions) ? parsed.open_questions : [],
  };
}

// ── Public: triage a single claim ─────────────────────────────────────────────

/**
 * triageClaim(claim, vaultNuggets, model)
 *
 * @param {string}   claim         — The claim to evaluate
 * @param {Array}    vaultNuggets  — Array of nugget objects with .first_line/.title or plain strings
 * @param {string}   [model]       — Override model (default: hermes3)
 * @returns {Promise<object>}      — Scored + graded claim object
 */
export async function triageClaim(claim, vaultNuggets = [], model = TRIAGE_MODEL, sourceTag = null) {
  const systemPrompt = loadPrompt('reasoning-engine');

  const context = vaultNuggets.length > 0
    ? vaultNuggets.map(n => {
        if (typeof n === 'string') return n;
        const title = n.title ? `## ${n.title}` : '';
        const body  = n.first_line || '';
        return [title, body].filter(Boolean).join('\n');
      }).join('\n---\n')
    : 'No vault context available.';

  const userPrompt = `Analyze this claim:\n\n${claim}\n\nVault context (may contain relevant evidence):\n${context}`;

  let raw;
  try {
    raw = await queryOllama({ model, system: systemPrompt, prompt: userPrompt });
  } catch (err) {
    throw new Error(`Ollama query failed: ${err.message}`);
  }

  let parsed;
  try {
    parsed = extractJSON(raw);
  } catch (err) {
    throw new Error(`JSON parse failed: ${err.message}\n\nRaw output:\n${raw.slice(0, 500)}`);
  }

  const normalised = normaliseScores(parsed);
  if (sourceTag === 'MODEL-GENERATED') normalised.provenance_quality = Math.min(normalised.provenance_quality, 0.5);
  const { composite, grade } = computeGrade(normalised);

  return {
    ...normalised,
    composite,
    grade,
    source_tag: sourceTag,
    model_used: model,
    triage_timestamp: new Date().toISOString(),
  };
}

// ── Public: format result for Telegram ───────────────────────────────────────

export function formatTriageResult(result) {
  const gradeEmoji = {
    A: '🟢', B: '🔵', C: '🟡', D: '🟠', F: '🔴',
  };

  const contaminationLine = result.contamination_flag
    ? `\n⚠️ CONTAMINATION: ${result.contamination_analysis}`
    : '';

  const questions = result.open_questions.length > 0
    ? `\n\n❓ Open questions:\n${result.open_questions.map(q => `• ${q}`).join('\n')}`
    : '';

  const sources = result.corroboration_sources.length > 0
    ? `\n📚 Sources: ${result.corroboration_sources.join(', ')}`
    : '';

  return (
    `${gradeEmoji[result.grade] || '⬜'} *GRADE ${result.grade}* — ${(result.composite * 100).toFixed(0)}%\n` +
    `\`\`\`\n` +
    `S:${result.structural_integrity.toFixed(2)}  I:${result.independent_corroboration.toFixed(2)}  ` +
    `E:${result.experimental_evidence.toFixed(2)}  P:${result.provenance_quality.toFixed(2)}  ` +
    `X:${result.suppression_signature.toFixed(2)}\n` +
    `\`\`\`\n` +
    `*Structural:* ${result.structural_notes}\n` +
    `*Provenance:* ${result.provenance_chain}\n` +
    `*Experimental:* ${result.experimental_notes}` +
    contaminationLine +
    sources +
    questions
  );
}

// ── Public: batch triage ──────────────────────────────────────────────────────

export async function triageBatch(claims, vaultNuggets = [], model = TRIAGE_MODEL) {
  const results = [];
  for (const claim of claims) {
    try {
      const result = await triageClaim(claim, vaultNuggets, model);
      results.push(result);
    } catch (err) {
      results.push({ claim, error: err.message, grade: 'F', composite: 0 });
    }
  }
  return results;
}

// ── CLI entrypoint ────────────────────────────────────────────────────────────

import { fileURLToPath } from 'url';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const claim = process.argv.slice(2).join(' ');
  if (!claim) {
    console.error('Usage: node epistemic-triage.js <claim text>');
    process.exit(1);
  }

  console.log(`\nTriaging claim: "${claim}"`);
  console.log(`Model: ${TRIAGE_MODEL}\n`);

  triageClaim(claim, [])
    .then(result => {
      console.log('─'.repeat(60));
      console.log(`GRADE: ${result.grade}  COMPOSITE: ${(result.composite * 100).toFixed(1)}%`);
      console.log(`S:${result.structural_integrity.toFixed(2)}  I:${result.independent_corroboration.toFixed(2)}  E:${result.experimental_evidence.toFixed(2)}  P:${result.provenance_quality.toFixed(2)}  X:${result.suppression_signature.toFixed(2)}`);
      console.log('─'.repeat(60));
      console.log('STRUCTURAL:', result.structural_notes);
      console.log('CORROBORATION:', result.corroboration_sources.join(', ') || 'none cited');
      console.log('EXPERIMENTAL:', result.experimental_notes);
      console.log('PROVENANCE:', result.provenance_chain);
      console.log('SUPPRESSION:', result.suppression_notes);
      if (result.contamination_flag) {
        console.log('\n⚠️  CONTAMINATION FLAGGED:', result.contamination_analysis);
      }
      if (result.open_questions.length > 0) {
        console.log('\nOpen questions:');
        result.open_questions.forEach(q => console.log(' •', q));
      }
    })
    .catch(err => {
      console.error('Triage failed:', err.message);
      process.exit(1);
    });
}
