// ── Q Drops Phase 2: Claim Extraction + Event Cross-Reference ───────────────
// DeepSeek extracts testable claims, timestamps against public events,
// grades: CONFIRMED / PARTIAL / WRONG / UNFALSIFIABLE
// Source: INSIDER / OPEN-SOURCE / FABRICATED / AMBIGUOUS
// ────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';
dotenv.config();

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const OLLAMA_URL = 'http://localhost:11434';
const CORPUS_PATH = join(process.env.HOME, 'cathedral-vault/00_Staging/qanon-forensics/posts.json');
const OUTPUT_DIR = join(process.env.HOME, 'cathedral-vault/00_Staging/qanon-forensics');

// ── Rate limiter ────────────────────────────────────────────────────────────
let lastCall = 0;
const MIN_INTERVAL = 1500; // 1.5s between calls — budget safe

async function throttle() {
  const now = Date.now();
  const wait = MIN_INTERVAL - (now - lastCall);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastCall = Date.now();
}

// ── LLM Calls ───────────────────────────────────────────────────────────────
async function callDeepSeek(system, prompt, maxTokens = 3000) {
  if (!DEEPSEEK_KEY) return callOllama(system, prompt, maxTokens);
  await throttle();
  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt }
        ],
        max_tokens: maxTokens,
        temperature: 0.1
      })
    });
    const data = await res.json();
    if (data.error) {
      console.error(`DeepSeek error: ${data.error.message}. Falling back to Ollama.`);
      return callOllama(system, prompt, maxTokens);
    }
    return data.choices?.[0]?.message?.content || '';
  } catch (err) {
    console.error('DeepSeek failed, Ollama fallback:', err.message);
    return callOllama(system, prompt, maxTokens);
  }
}

async function callOllama(system, prompt, maxTokens = 3000) {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma3:4b',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt }
        ],
        stream: false,
        options: { num_predict: maxTokens }
      })
    });
    const data = await res.json();
    return data.message?.content || '';
  } catch (err) {
    console.error('Ollama also failed:', err.message);
    return '';
  }
}

// ── Claim extraction system prompt ──────────────────────────────────────────
const EXTRACTION_SYSTEM = `You are a forensic intelligence analyst. Extract TESTABLE CLAIMS from Q drops.

Rules:
1. Only extract claims that make a specific, verifiable assertion about reality
2. Ignore rhetorical questions, motivational slogans, cryptic fragments with no clear assertion
3. For each claim, provide:
   - claim: the assertion in plain English
   - original: exact quote from the post
   - type: PREDICTION (future event) | ASSERTION (present/past fact) | IMPLICATION (strongly implied but not stated)
   - specificity: HIGH (names, dates, specific events) | MEDIUM (identifiable actors/topics) | LOW (vague/interpretable)
   - testable: true/false — can this be checked against public record?

Return ONLY valid JSON array. If no testable claims exist, return [].
Example: [{"claim":"...", "original":"...", "type":"PREDICTION", "specificity":"HIGH", "testable":true}]`;

const GRADING_SYSTEM = `You are a forensic fact-checker. Grade each claim against known public events.

For each claim, determine:
1. verdict: CONFIRMED (verified by public record) | PARTIAL (partly true, key details wrong) | WRONG (demonstrably false) | UNFALSIFIABLE (cannot be tested) | UNRESOLVED (insufficient public evidence)
2. source_class: INSIDER (info not publicly available at time of posting) | OPEN-SOURCE (info was already public) | FABRICATED (contradicts known facts) | AMBIGUOUS (can't determine)
3. evidence: brief explanation citing specific public events/records
4. time_delta: if a prediction, how many days before the public event was this posted? null if not applicable
5. confidence: HIGH | MEDIUM | LOW — your confidence in this grading

Return ONLY valid JSON array matching input order.
Example: [{"verdict":"CONFIRMED", "source_class":"OPEN-SOURCE", "evidence":"This was reported by NYT on...", "time_delta":3, "confidence":"HIGH"}]`;

// ── Batch posts into chunks for extraction ──────────────────────────────────
function batchPosts(posts, batchSize = 15) {
  const batches = [];
  for (let i = 0; i < posts.length; i += batchSize) {
    batches.push(posts.slice(i, i + batchSize));
  }
  return batches;
}

function formatPostsForExtraction(posts) {
  return posts.map(p => {
    const date = new Date(p.post_metadata.time * 1000).toISOString().split('T')[0];
    const id = p.post_metadata.id || p.post_metadata.post_id;
    const trip = p.post_metadata.tripcode || 'no-trip';
    return `[Post #${id} | ${date} | ${trip}]\n${p.text}`;
  }).join('\n\n---\n\n');
}

// ── Filter posts worth analyzing ────────────────────────────────────────────
function filterAnalyzablePosts(posts) {
  return posts.filter(p => {
    if (!p.text || p.text.trim().length < 20) return false;
    // Skip image-only or link-only posts
    const text = p.text.trim();
    if (text.match(/^https?:\/\/\S+$/)) return false;
    // Skip very short posts that are just slogans
    const words = text.split(/\s+/).length;
    if (words < 5) return false;
    return true;
  });
}

// ── Parse JSON from LLM response ────────────────────────────────────────────
function parseJSON(raw) {
  try {
    // Strip markdown code blocks if present
    let cleaned = raw.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    // Try to find JSON array in response
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { return []; }
    }
    return [];
  }
}

// ── Load checkpoint ─────────────────────────────────────────────────────────
function loadCheckpoint() {
  const cpPath = join(OUTPUT_DIR, 'phase2-checkpoint.json');
  if (existsSync(cpPath)) {
    return JSON.parse(readFileSync(cpPath, 'utf8'));
  }
  return { extractedBatches: 0, claims: [], graded: [] };
}

function saveCheckpoint(state) {
  writeFileSync(join(OUTPUT_DIR, 'phase2-checkpoint.json'), JSON.stringify(state, null, 2));
}

// ── Main pipeline ───────────────────────────────────────────────────────────
async function main() {
  console.log('Loading Q drops corpus...');
  const raw = JSON.parse(readFileSync(CORPUS_PATH, 'utf8'));
  const allPosts = raw.posts;
  console.log(`Total posts: ${allPosts.length}`);

  const analyzable = filterAnalyzablePosts(allPosts);
  console.log(`Analyzable posts (>20 chars, >5 words): ${analyzable.length}`);

  const batches = batchPosts(analyzable, 15);
  console.log(`Batches of 15: ${batches.length}`);

  // Load checkpoint
  let state = loadCheckpoint();
  console.log(`Checkpoint: ${state.extractedBatches} batches done, ${state.claims.length} claims found`);

  // ── Phase 2a: Extract claims ──────────────────────────────────────────
  console.log('\n=== PHASE 2a: Claim Extraction ===\n');

  for (let i = state.extractedBatches; i < batches.length; i++) {
    const batch = batches[i];
    const formatted = formatPostsForExtraction(batch);

    process.stdout.write(`Batch ${i + 1}/${batches.length}... `);

    const result = await callDeepSeek(EXTRACTION_SYSTEM, formatted);
    const claims = parseJSON(result);

    if (claims.length > 0) {
      // Tag each claim with batch index for tracing
      const tagged = claims.map(c => ({
        ...c,
        batchIndex: i,
        postRange: `${batch[0].post_metadata.id || batch[0].post_metadata.post_id}-${batch[batch.length - 1].post_metadata.id || batch[batch.length - 1].post_metadata.post_id}`
      }));
      state.claims.push(...tagged);
      console.log(`${claims.length} claims`);
    } else {
      console.log('0 claims');
    }

    state.extractedBatches = i + 1;

    // Save checkpoint every 10 batches
    if ((i + 1) % 10 === 0) {
      saveCheckpoint(state);
      console.log(`  [checkpoint saved: ${state.claims.length} total claims]`);
    }
  }

  saveCheckpoint(state);
  console.log(`\nExtraction complete: ${state.claims.length} claims from ${analyzable.length} posts`);

  // ── Phase 2b: Grade claims ────────────────────────────────────────────
  console.log('\n=== PHASE 2b: Claim Grading ===\n');

  const ungradedClaims = state.claims.slice(state.graded.length);
  const gradeBatches = batchPosts(ungradedClaims, 10);

  for (let i = 0; i < gradeBatches.length; i++) {
    const batch = gradeBatches[i];
    const prompt = JSON.stringify(batch.map(c => ({
      claim: c.claim,
      original: c.original,
      type: c.type,
      postRange: c.postRange
    })), null, 2);

    process.stdout.write(`Grading batch ${i + 1}/${gradeBatches.length}... `);

    const result = await callDeepSeek(GRADING_SYSTEM, prompt);
    const grades = parseJSON(result);

    if (grades.length > 0) {
      // Merge grades with claims
      for (let j = 0; j < Math.min(grades.length, batch.length); j++) {
        state.graded.push({ ...batch[j], ...grades[j] });
      }
      console.log(`${grades.length} graded`);
    } else {
      // Push ungraded
      batch.forEach(c => state.graded.push({ ...c, verdict: 'GRADING_FAILED', source_class: 'UNKNOWN' }));
      console.log('grading failed, marked');
    }

    // Checkpoint every 5 grade batches
    if ((i + 1) % 5 === 0) {
      saveCheckpoint(state);
    }
  }

  saveCheckpoint(state);

  // ── Generate report ───────────────────────────────────────────────────
  console.log('\n=== Generating Phase 2 Report ===\n');
  generateReport(state);
}

function generateReport(state) {
  const claims = state.graded;
  const total = claims.length;

  // Verdict breakdown
  const verdicts = {};
  const sourceClasses = {};
  const types = {};
  const specificities = {};

  claims.forEach(c => {
    verdicts[c.verdict] = (verdicts[c.verdict] || 0) + 1;
    sourceClasses[c.source_class] = (sourceClasses[c.source_class] || 0) + 1;
    types[c.type] = (types[c.type] || 0) + 1;
    specificities[c.specificity] = (specificities[c.specificity] || 0) + 1;
  });

  // Confirmed claims with insider classification
  const insiderConfirmed = claims.filter(c =>
    c.verdict === 'CONFIRMED' && c.source_class === 'INSIDER'
  );

  // Confirmed with time delta (predictions that came true)
  const predictionsConfirmed = claims.filter(c =>
    c.verdict === 'CONFIRMED' && c.type === 'PREDICTION' && c.time_delta
  );

  // Wrong claims
  const wrong = claims.filter(c => c.verdict === 'WRONG');

  // High specificity claims
  const highSpec = claims.filter(c => c.specificity === 'HIGH');

  let report = `---
title: "Q Drops Forensic Analysis — Phase 2 (Claim Extraction + Grading)"
date: 2026-05-24
type: forensic-analysis
status: draft
grade: pending
tags: [qanon, forensics, claim-extraction, fact-checking]
---

# Q Drops — Phase 2: Claim Extraction & Grading

## Summary

- **Total claims extracted:** ${total}
- **From ${state.extractedBatches} batches** of analyzable posts

## Verdict Breakdown

| Verdict | Count | % |
|---|---|---|
${Object.entries(verdicts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} | ${(v / total * 100).toFixed(1)}% |`).join('\n')}

## Source Classification

| Source | Count | % |
|---|---|---|
${Object.entries(sourceClasses).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} | ${(v / total * 100).toFixed(1)}% |`).join('\n')}

## Claim Types

| Type | Count | % |
|---|---|---|
${Object.entries(types).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} | ${(v / total * 100).toFixed(1)}% |`).join('\n')}

## Specificity Distribution

| Level | Count | % |
|---|---|---|
${Object.entries(specificities).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} | ${(v / total * 100).toFixed(1)}% |`).join('\n')}

## Key Findings

### Confirmed + Insider (${insiderConfirmed.length} claims)

These are the signal — claims that were confirmed AND classified as containing non-public information at time of posting.

${insiderConfirmed.length > 0 ? insiderConfirmed.slice(0, 30).map((c, i) => `${i + 1}. **${c.claim}**
   - Original: "${c.original?.substring(0, 150)}..."
   - Evidence: ${c.evidence || 'N/A'}
   - Time delta: ${c.time_delta ? c.time_delta + ' days before public' : 'N/A'}
   - Confidence: ${c.confidence || 'N/A'}
`).join('\n') : 'None found.'}

### Predictions That Came True (${predictionsConfirmed.length})

${predictionsConfirmed.length > 0 ? predictionsConfirmed.slice(0, 20).map((c, i) => `${i + 1}. **${c.claim}** (${c.time_delta} days early)
   - Evidence: ${c.evidence || 'N/A'}
`).join('\n') : 'None found.'}

### Wrong Claims (${wrong.length})

${wrong.length > 0 ? wrong.slice(0, 20).map((c, i) => `${i + 1}. **${c.claim}**
   - Evidence: ${c.evidence || 'N/A'}
`).join('\n') : 'None found.'}

### High-Specificity Claims (${highSpec.length})

Claims with names, dates, specific events — the hardest to fake.

${highSpec.length > 0 ? highSpec.slice(0, 20).map((c, i) => `${i + 1}. **${c.claim}** [${c.verdict}/${c.source_class}]
   - Evidence: ${c.evidence || 'N/A'}
`).join('\n') : 'None found.'}

## Forensic Assessment

### Signal-to-Noise Ratio
- Testable claims: ${total} from ~4966 posts = ${(total / 4966 * 100).toFixed(1)}% of corpus contains testable assertions
- Confirmed rate: ${verdicts['CONFIRMED'] || 0}/${total} = ${((verdicts['CONFIRMED'] || 0) / total * 100).toFixed(1)}%
- Wrong rate: ${verdicts['WRONG'] || 0}/${total} = ${((verdicts['WRONG'] || 0) / total * 100).toFixed(1)}%
- Unfalsifiable rate: ${verdicts['UNFALSIFIABLE'] || 0}/${total} = ${((verdicts['UNFALSIFIABLE'] || 0) / total * 100).toFixed(1)}%

### Source Intelligence Assessment
- Insider-classified: ${sourceClasses['INSIDER'] || 0} claims (${((sourceClasses['INSIDER'] || 0) / total * 100).toFixed(1)}%)
- Open-source only: ${sourceClasses['OPEN-SOURCE'] || 0} claims (${((sourceClasses['OPEN-SOURCE'] || 0) / total * 100).toFixed(1)}%)
- Fabricated: ${sourceClasses['FABRICATED'] || 0} claims (${((sourceClasses['FABRICATED'] || 0) / total * 100).toFixed(1)}%)

---

## Phase 3 (Queued): Epistemic Triage + Auditor Res

5-dimension scoring. Cross-domain convergence with Cathedral vault.
`;

  writeFileSync(join(OUTPUT_DIR, 'q-drops-phase2-report.md'), report);
  writeFileSync(join(OUTPUT_DIR, 'phase2-claims.json'), JSON.stringify(state.graded, null, 2));

  console.log(`Report: ${join(OUTPUT_DIR, 'q-drops-phase2-report.md')}`);
  console.log(`Raw claims: ${join(OUTPUT_DIR, 'phase2-claims.json')}`);
  console.log(`\nTotal claims: ${total}`);
  console.log(`Verdicts: ${JSON.stringify(verdicts)}`);
  console.log(`Sources: ${JSON.stringify(sourceClasses)}`);
}

main().catch(err => {
  console.error('Phase 2 failed:', err);
  process.exit(1);
});
