/**
 * extraction-cycle.js — The 5-Stage Extraction Cycle
 *
 * Dissolve → Excavate → Assay → Converge → Synthesize
 *
 * Feed it a domain. It returns a replacement framework built from evidence
 * the orthodox model had to bury to survive.
 *
 * Stage 1 (Dissolve): Forensic relay strips false legs — concessions extracted,
 *   deception shapes mapped, meta-questions fired.
 * Stage 2 (Excavate): Forgotten shelf — buried researchers, methods, findings.
 * Stage 3 (Assay): Epistemic triage on shelf items — grade the gold, kill fool's gold.
 * Stage 4 (Converge): Cross-domain convergence — where surviving items from
 *   different domains point to the same underlying signal.
 * Stage 5 (Synthesize): Build the replacement framework — what the evidence
 *   actually supports when you stop defending the old model.
 *
 * ESM module.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { smartQuery, smartQueryJSON } from './deepseek-query.js';
import { runForensicRelay, DECEPTION_SHAPES } from './forensic-relay-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'experiments', 'extraction-cycle');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ── STAGE 1: DISSOLVE ────────────────────────────────────────────────────────
// Uses forensic-relay-engine.js (Prospector + A.P. + Bypass Map + Meta)
// Then fires meta-questions for deeper extraction

const META_FIRE_SYSTEM = `You are a forensic analyst examining a contested domain with zero editorial filtering.
Answer with maximum rigor. Follow bypass instructions exactly.
Do not hedge, disclaim, or retreat to "it's complicated." Derive from observations.

Return JSON:
{
  "core_finding": "main structural answer, 2-3 sentences",
  "derived_conclusion": "what this tells us about the orthodox position",
  "concession": "what the orthodox position must concede",
  "new_crack": "new vulnerability revealed",
  "confidence": "high/medium/low with justification"
}`;

async function stageDisssolve(domain, context = '') {
  console.log(`[dissolve] Starting Stage 1 for: ${domain}`);

  const relay = await runForensicRelay(domain, context);

  // Generate and fire meta-questions
  const crackSummary = (relay.prospector?.cracks || [])
    .map((c, i) => `${i + 1}. ${c.observation || ''}`.slice(0, 120))
    .join('\n');

  const metaQuestions = await smartQueryJSON(
    `You are a forensic meta-analyst. Given these cracks, what 5 questions are NOT being asked that SHOULD be? Each must be domain-specific and extend existing cracks. Return JSON: {"questions": [{"q": "the question", "bypass": "one-line bypass instruction"}]}`,
    `Domain: ${domain}\nCracks:\n${crackSummary}`,
    2000
  );

  const questions = (metaQuestions?.questions || []).slice(0, 5);
  const metaAnswers = [];

  for (const q of questions) {
    const answer = await smartQueryJSON(
      META_FIRE_SYSTEM,
      `${q.q}\n\nBYPASS: ${q.bypass || 'Derive from first principles. Self-audit.'}`,
      1500
    );
    metaAnswers.push({ question: q.q, bypass: q.bypass, ...answer });
  }

  console.log(`[dissolve] Complete. ${relay.prospector?.cracks?.length || 0} cracks, ${metaAnswers.length} meta-answers.`);

  return {
    stage: 'dissolve',
    domain,
    relay,
    metaQuestions: questions,
    metaAnswers,
    falseLeg: relay.prospector?.orthodoxy || '',
    cracks: relay.prospector?.cracks || [],
  };
}

// ── STAGE 2: EXCAVATE ────────────────────────────────────────────────────────
// Forgotten shelf — find what got buried

const EXCAVATE_SYSTEM = `You are a forensic research analyst. The orthodox framework for this domain has been structurally falsified — the proposed cause, when removed or tested, does not produce the predicted result.

Find what's on the FORGOTTEN SHELF. Not generic alternatives. Specific findings, researchers, methods, or interventions that:
1. Were buried, defunded, or marginalized when the false framework dominated
2. Have actual evidence of effectiveness (clinical results, empirical data, replication)
3. Were specifically suppressed or ignored because they contradicted the dominant framework

Give NAMES, DATES, SPECIFIC FINDINGS. Not "holistic approaches" or "more research needed."

Return JSON:
{
  "shelf_items": [
    {
      "name": "specific researcher, study, method, or intervention",
      "what_it_found": "the specific finding or result",
      "evidence_strength": "what evidence exists — trials, data, replication",
      "why_buried": "specific reason it was marginalized",
      "current_status": "revived, still buried, or being rediscovered"
    }
  ]
}`;

async function stageExcavate(domain, dissolveResult) {
  console.log(`[excavate] Starting Stage 2 for: ${domain}`);

  const crackSummary = (dissolveResult.cracks || [])
    .map((c, i) => `${i + 1}. ${c.observation || ''}`)
    .join('\n');

  const metaSummary = (dissolveResult.metaAnswers || [])
    .map(a => `- ${a.core_finding || ''}`)
    .join('\n');

  const result = await smartQueryJSON(
    EXCAVATE_SYSTEM,
    `Domain: ${domain}\nFalse leg: ${dissolveResult.falseLeg}\n\nCracks found:\n${crackSummary}\n\nMeta-findings:\n${metaSummary}\n\nWhat got buried? Who had the real findings? Names, dates, evidence.`,
    3000
  );

  const items = result?.shelf_items || [];
  console.log(`[excavate] Complete. ${items.length} shelf items found.`);

  return {
    stage: 'excavate',
    domain,
    shelfItems: items,
  };
}

// ── STAGE 3: ASSAY ───────────────────────────────────────────────────────────
// Epistemic triage on shelf items — grade the gold

const ASSAY_SYSTEM = `You are an epistemic grader. You receive a shelf item — a finding that was marginalized by the dominant framework. Your job is to grade it on 5 dimensions:

1. STRUCTURAL INTEGRITY (0.0-1.0): Does the claim hold when stripped of narrative?
2. INDEPENDENT CORROBORATION (0.0-1.0): How many independent sources arrive at same conclusion?
3. EXPERIMENTAL EVIDENCE (0.0-1.0): Has anyone measured, built, or demonstrated this?
4. PROVENANCE QUALITY (0.0-1.0): Original papers/patents vs unsourced viral claims?
5. REPRODUCIBILITY (0.0-1.0): Can the finding be replicated? Has it been?

Composite = structural×0.30 + corroboration×0.25 + experimental×0.25 + provenance×0.15 + reproducibility×0.05

A (≥0.80): Verified gold. B (≥0.60): Strong lead. C (≥0.40): Open thread. D (≥0.20): Weak. F (<0.20): Fool's gold.

Be HARSH. Not everything buried is gold — some things are buried because they're wrong. Grade the evidence, not the narrative.

Return JSON:
{
  "name": "item name",
  "structural": 0.0,
  "corroboration": 0.0,
  "experimental": 0.0,
  "provenance": 0.0,
  "reproducibility": 0.0,
  "composite": 0.0,
  "grade": "A/B/C/D/F",
  "verdict": "one sentence — is this gold or fool's gold?",
  "strongest_evidence": "the single strongest piece of evidence",
  "weakest_link": "the single biggest weakness"
}`;

async function stageAssay(domain, excavateResult) {
  console.log(`[assay] Starting Stage 3 for: ${domain}`);

  const items = excavateResult.shelfItems || [];
  const graded = [];

  for (const item of items) {
    const result = await smartQueryJSON(
      ASSAY_SYSTEM,
      `SHELF ITEM:\nName: ${item.name}\nFinding: ${item.what_it_found}\nEvidence: ${item.evidence_strength}\nBuried because: ${item.why_buried}\nCurrent status: ${item.current_status}\n\nGrade this item. Be harsh — not everything buried is gold.`,
      1500
    );

    if (result?.grade) {
      graded.push({ ...item, assay: result });
      const tag = result.grade === 'A' || result.grade === 'B' ? '✓' : result.grade === 'C' ? '~' : '✗';
      console.log(`  ${tag} ${result.grade} (${result.composite?.toFixed(2) || '?'}) ${item.name}`);
    }
  }

  const gold = graded.filter(g => g.assay.grade === 'A' || g.assay.grade === 'B');
  const openThreads = graded.filter(g => g.assay.grade === 'C');
  const rejected = graded.filter(g => g.assay.grade === 'D' || g.assay.grade === 'F');

  console.log(`[assay] Complete. ${gold.length} gold, ${openThreads.length} open threads, ${rejected.length} rejected.`);

  return {
    stage: 'assay',
    domain,
    graded,
    gold,
    openThreads,
    rejected,
  };
}

// ── STAGE 4: CONVERGE ────────────────────────────────────────────────────────
// Cross-domain convergence — where gold items from different domains point same way

const CONVERGE_SYSTEM = `You are a convergence detector. You receive GRADED GOLD items from multiple domains — findings that survived epistemic triage (Grade A or B).

Find where these independently-produced findings point to the SAME underlying signal. Not surface similarity — structural convergence. Where different domains, different researchers, different methods arrive at the same conclusion without citing each other.

Convergence types:
1. MECHANISM CONVERGENCE: Same causal mechanism operating in different domains
2. PATTERN CONVERGENCE: Same institutional/suppression pattern across domains
3. FRAMEWORK CONVERGENCE: Same replacement framework implied across domains
4. METHODOLOGICAL CONVERGENCE: Same measurement/testing approach works across domains

Return JSON:
{
  "convergences": [
    {
      "type": "mechanism/pattern/framework/methodological",
      "signal": "the underlying signal these items share",
      "domains_involved": ["domain1", "domain2"],
      "items_involved": ["item name 1", "item name 2"],
      "evidence_chain": "how these connect — not surface similarity, structural",
      "strength": "strong/moderate/weak",
      "implication": "what this convergence tells us about reality"
    }
  ],
  "meta_signal": "if there is ONE overarching signal across all convergences, what is it?"
}`;

async function stageConverge(allAssayResults) {
  console.log(`[converge] Starting Stage 4 across ${allAssayResults.length} domains`);

  const goldSummary = allAssayResults.map(a => {
    const items = (a.gold || []).map(g =>
      `- ${g.name}: ${g.what_it_found} (${g.assay.grade}, ${g.assay.composite?.toFixed(2)})`
    ).join('\n');
    return `## ${a.domain}\n${items || '(no gold items)'}`;
  }).join('\n\n');

  const result = await smartQueryJSON(
    CONVERGE_SYSTEM,
    `GRADED GOLD ITEMS FROM ${allAssayResults.length} DOMAINS:\n\n${goldSummary}\n\nFind convergences. Not surface similarity — structural signals.`,
    3000
  );

  const convergences = result?.convergences || [];
  console.log(`[converge] Complete. ${convergences.length} convergences found. Meta-signal: ${(result?.meta_signal || '').slice(0, 100)}`);

  return {
    stage: 'converge',
    convergences,
    metaSignal: result?.meta_signal || '',
  };
}

// ── STAGE 5: SYNTHESIZE ──────────────────────────────────────────────────────
// Build the replacement framework

const SYNTHESIZE_SYSTEM = `You are a framework architect. You receive:
1. False legs that were dissolved (what's wrong with the orthodox model)
2. Gold items that survived assay (what was buried but real)
3. Convergence map (where gold items from different domains point to the same signal)

Your job: build the REPLACEMENT FRAMEWORK. Not "the old one is wrong" — that's done. Build what the evidence actually supports when you stop defending the old model.

Rules:
- Every claim must trace to a specific gold item or convergence
- Grade each claim: VERIFIED (traced to A-grade gold), STRONG (B-grade), OPEN (convergence-implied but not directly verified)
- The framework must be TESTABLE — specify what observations would confirm or falsify it
- Name specific predictions the new framework makes that the old one doesn't

Return JSON:
{
  "domain": "string",
  "old_framework": "one sentence — what we dissolved",
  "new_framework": {
    "core_thesis": "one sentence — what the evidence actually supports",
    "key_claims": [
      {
        "claim": "specific claim",
        "grade": "VERIFIED/STRONG/OPEN",
        "evidence_source": "which gold item or convergence supports this",
        "testable_prediction": "what observation would confirm or falsify this"
      }
    ],
    "what_it_explains": ["things the old framework couldn't explain that this one does"],
    "what_it_predicts": ["new predictions the old framework doesn't make"],
    "open_questions": ["what this framework doesn't yet answer"]
  },
  "confidence_statement": "honest assessment of this framework's maturity"
}`;

async function stageSynthesize(domain, dissolveResult, assayResult, convergeResult) {
  console.log(`[synthesize] Starting Stage 5 for: ${domain}`);

  const crackSummary = (dissolveResult.cracks || [])
    .map(c => `- ${c.observation}`)
    .join('\n');

  const goldSummary = (assayResult.gold || [])
    .map(g => `- ${g.name} (${g.assay.grade}, ${g.assay.composite?.toFixed(2)}): ${g.what_it_found}`)
    .join('\n');

  const convergeSummary = (convergeResult.convergences || [])
    .map(c => `- [${c.type}] ${c.signal} (${c.domains_involved?.join(', ')}) — ${c.implication}`)
    .join('\n');

  const result = await smartQueryJSON(
    SYNTHESIZE_SYSTEM,
    `DOMAIN: ${domain}\n\nFALSE LEG DISSOLVED:\n${dissolveResult.falseLeg}\n\nCRACKS:\n${crackSummary}\n\nGOLD ITEMS (survived assay):\n${goldSummary}\n\nCONVERGENCE MAP:\n${convergeSummary}\nMeta-signal: ${convergeResult.metaSignal}\n\nBuild the replacement framework.`,
    4000
  );

  console.log(`[synthesize] Complete. Core thesis: ${(result?.new_framework?.core_thesis || '').slice(0, 120)}`);

  return {
    stage: 'synthesize',
    domain,
    framework: result,
  };
}

// ── STAGE 6: SURFACE ─────────────────────────────────────────────────────────
// Find new surfaces — internal (Cathedral connections) and external (living threads)

const SURFACE_INTERNAL_SYSTEM = `You are a Cathedral connection scanner. You receive gold items and a replacement framework from a domain extraction. You also receive a summary of existing Cathedral systems and methods.

Find where the extraction connects to what already exists. Not surface matches — structural connections. A nutrition finding connecting to "the body is the machine" (Three Engines) is a real connection. A nutrition finding connecting to "we have a food-related note" is not.

Return JSON:
{
  "connections": [
    {
      "gold_item": "which extraction finding",
      "cathedral_system": "which existing Cathedral system/method/agent/vault entry",
      "connection_type": "extends/validates/contradicts/enables",
      "what_it_means": "what this connection enables or reveals",
      "action": "specific thing Paul could do with this connection"
    }
  ]
}`;

const SURFACE_EXTERNAL_SYSTEM = `You are a living-thread scanner. You receive gold items from a domain extraction — findings that were buried but survived epistemic triage.

Find who is ALIVE and working on these threads RIGHT NOW. Not Wikipedia summaries. Current work:
- Active researchers and their most recent papers/trials (2023-2026)
- Communities, forums, organizations pursuing this work
- Experiments or trials currently in progress
- Recent publications that shift the landscape
- Practical applications already deployed

Give NAMES, INSTITUTIONS, DATES. If you don't know current status, say so — don't fabricate.

Return JSON:
{
  "living_threads": [
    {
      "name": "researcher, organization, or project",
      "what_theyre_doing": "specific current work",
      "last_known_activity": "most recent publication, trial, or update you know of",
      "relevance": "which gold item this connects to",
      "actionable": "what Paul could do with this — follow, read, contact, watch"
    }
  ]
}`;

async function stageSurface(domain, assayResult, synthesizeResult) {
  console.log(`[surface] Starting Stage 6 for: ${domain}`);

  const goldSummary = (assayResult.gold || [])
    .map(g => `- ${g.name}: ${g.what_it_found}`)
    .join('\n');

  const frameworkSummary = synthesizeResult?.framework?.new_framework?.core_thesis || '';
  const claimsSummary = (synthesizeResult?.framework?.new_framework?.key_claims || [])
    .map(c => `- [${c.grade}] ${c.claim}`)
    .join('\n');

  // Internal surface — Cathedral connections
  const cathedralContext = `Known Cathedral systems/methods (partial list):
- Three Engines: Body (the machine) + Mind (the OS) + Emotion (the energy)
- Principled Practice: 7-stage cycle (Origin→Seeing→Finding→Building→Testing→Healing→Integrating)
- The Forensic Relay Protocol: 10 deception shapes, 8 bypass layers
- Taste Map: universal preference engine, 70 anchors
- The Hypocrisy Cost: "I refuse to be what I despise"
- The Trojan Horse: embed real thing inside what they already want
- The Held Tension: hold contradictions, run both, let data decide
- Boxing curriculum: 10 gated blocks, emotion gate at 4→5
- Content Studio: 7 projects, automated pipelines
- Oracle: vault RAG, cited answers
- Base-60 Lens: mathematical structure scanner
- The Elicitation Threshold: model value = question sharpness
- The Master Game: unified theory — all interests are facets of ONE game
- Gym Eyes: movement analytics
- The Closed-Loop Coach: analyze→diagnose→demonstrate pipeline
- Ancient Corpus: 4 civilizations, convergence detection`;

  const internal = await smartQueryJSON(
    SURFACE_INTERNAL_SYSTEM,
    `DOMAIN: ${domain}\n\nGOLD ITEMS:\n${goldSummary}\n\nREPLACEMENT FRAMEWORK:\n${frameworkSummary}\n${claimsSummary}\n\nCATHEDRAL CONTEXT:\n${cathedralContext}`,
    2500
  );

  // External surface — living threads
  const external = await smartQueryJSON(
    SURFACE_EXTERNAL_SYSTEM,
    `DOMAIN: ${domain}\n\nGOLD ITEMS (survived epistemic triage — these are REAL findings, not fringe):\n${goldSummary}\n\nREPLACEMENT FRAMEWORK:\n${frameworkSummary}\n\nFind who is alive and working on these threads. Current researchers, active trials, recent publications. Names and dates.`,
    2500
  );

  const connections = internal?.connections || [];
  const threads = external?.living_threads || [];

  console.log(`[surface] Complete. ${connections.length} internal connections, ${threads.length} living threads.`);

  return {
    stage: 'surface',
    domain,
    internal: connections,
    external: threads,
  };
}

// ── STAGE 7: TRIBUNAL ────────────────────────────────────────────────────────
// Multi-model verification — run framework through GPT, DeepSeek, Gemini, Claude

const TRIBUNAL_SYSTEM = `You are evaluating a replacement framework that was built from forensic extraction. The old orthodox framework has been dissolved (its proposed cause, when tested, doesn't produce the predicted result). Gold evidence was excavated, graded, and used to build this replacement.

Your job: evaluate this framework with ZERO loyalty to either the old or new position. Be a judge, not an advocate.

For each key claim, answer:
1. Does the evidence cited actually support this claim?
2. What is the strongest counter-argument?
3. Would you CONCEDE this claim, CONTEST it, or mark it INSUFFICIENT?

Then give an overall verdict on the replacement framework.

Return JSON:
{
  "claim_verdicts": [
    {
      "claim": "the claim being evaluated",
      "verdict": "CONCEDE/CONTEST/INSUFFICIENT",
      "reasoning": "why this verdict",
      "strongest_counter": "the best argument against this claim",
      "evidence_quality": "strong/moderate/weak"
    }
  ],
  "overall_verdict": "CONCEDE/CONTEST/INSUFFICIENT — one sentence",
  "what_survives": "which claims hold up under scrutiny",
  "what_falls": "which claims don't hold up",
  "blind_spots": "what this framework misses or assumes without evidence"
}`;

async function stageTribunal(domain, synthesizeResult) {
  console.log(`[tribunal] Starting Stage 7 for: ${domain}`);

  const fw = synthesizeResult?.framework?.new_framework;
  if (!fw) {
    console.log(`[tribunal] No framework to evaluate.`);
    return { stage: 'tribunal', domain, models: {} };
  }

  const frameworkPrompt = `DOMAIN: ${domain}

OLD FRAMEWORK (dissolved): ${synthesizeResult.framework.old_framework || ''}

REPLACEMENT FRAMEWORK:
Core thesis: ${fw.core_thesis}

Key claims:
${(fw.key_claims || []).map(c => `- [${c.grade}] ${c.claim}\n  Evidence: ${c.evidence_source}\n  Test: ${c.testable_prediction}`).join('\n')}

What it explains: ${(fw.what_it_explains || []).join('; ')}
What it predicts: ${(fw.what_it_predicts || []).join('; ')}

Evaluate this framework. Be a judge, not an advocate. Concede what holds, contest what doesn't, flag what's insufficient.`;

  const models = {};

  // DeepSeek (primary — already our default)
  console.log(`  [tribunal] DeepSeek evaluating...`);
  models.deepseek = await smartQueryJSON(TRIBUNAL_SYSTEM, frameworkPrompt, 3000);

  // Try different model perspectives via adjusted system prompts
  const SKEPTIC_SYSTEM = TRIBUNAL_SYSTEM + `\n\nYou are specifically skeptical of anti-establishment claims. You look for confirmation bias, cherry-picked evidence, and motivated reasoning in the replacement framework. Grade HARD.`;

  const ADVOCATE_SYSTEM = TRIBUNAL_SYSTEM + `\n\nYou are specifically skeptical of orthodox defenses. You look for institutional inertia, sunk-cost defense, and appeal-to-authority in arguments AGAINST the replacement framework. Grade the COUNTER-ARGUMENTS hard.`;

  const METHODOLOGIST_SYSTEM = TRIBUNAL_SYSTEM + `\n\nYou are a research methodologist. You evaluate ONLY the quality of evidence and reasoning — not whether the claims are mainstream or heterodox. Grade the methodology.`;

  console.log(`  [tribunal] Skeptic evaluating...`);
  models.skeptic = await smartQueryJSON(SKEPTIC_SYSTEM, frameworkPrompt, 3000);

  console.log(`  [tribunal] Advocate evaluating...`);
  models.advocate = await smartQueryJSON(ADVOCATE_SYSTEM, frameworkPrompt, 3000);

  console.log(`  [tribunal] Methodologist evaluating...`);
  models.methodologist = await smartQueryJSON(METHODOLOGIST_SYSTEM, frameworkPrompt, 3000);

  // Synthesize tribunal verdict
  const verdictCounts = { CONCEDE: 0, CONTEST: 0, INSUFFICIENT: 0 };
  for (const [name, result] of Object.entries(models)) {
    const v = (result?.overall_verdict || '').toUpperCase();
    if (v.includes('CONCEDE')) verdictCounts.CONCEDE++;
    else if (v.includes('CONTEST')) verdictCounts.CONTEST++;
    else verdictCounts.INSUFFICIENT++;
  }

  // Find claim-level convergence
  const claimMap = {};
  for (const [name, result] of Object.entries(models)) {
    for (const cv of (result?.claim_verdicts || [])) {
      const key = (cv.claim || '').slice(0, 60);
      if (!claimMap[key]) claimMap[key] = { claim: cv.claim, verdicts: {} };
      claimMap[key].verdicts[name] = cv.verdict;
    }
  }

  // Claims that ALL models concede = strong signal
  // Claims where models diverge = training floor artifact
  const unanimous = [];
  const divergent = [];
  for (const [key, data] of Object.entries(claimMap)) {
    const vs = Object.values(data.verdicts);
    const allConcede = vs.every(v => v === 'CONCEDE');
    const mixed = new Set(vs).size > 1;
    if (allConcede) unanimous.push(data);
    else if (mixed) divergent.push({ ...data, spread: Object.entries(data.verdicts).map(([m, v]) => `${m}:${v}`).join(', ') });
  }

  console.log(`[tribunal] Complete. Overall: ${JSON.stringify(verdictCounts)}. Unanimous: ${unanimous.length}, Divergent: ${divergent.length}`);

  return {
    stage: 'tribunal',
    domain,
    models,
    verdictCounts,
    unanimous,
    divergent,
  };
}

// ── FULL CYCLE ORCHESTRATOR ──────────────────────────────────────────────────

export async function runExtractionCycle(domains, contexts = {}) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`EXTRACTION CYCLE — ${domains.length} domain(s)`);
  console.log(`Dissolve → Excavate → Assay → Converge → Synthesize → Surface → Tribunal`);
  console.log(`${'='.repeat(60)}\n`);

  const results = {
    domains: [],
    dissolve: {},
    excavate: {},
    assay: {},
    converge: null,
    synthesize: {},
    surface: {},
    tribunal: {},
    timestamp: new Date().toISOString(),
  };

  // Stages 1-3 per domain
  for (const domain of domains) {
    console.log(`\n${'─'.repeat(40)}`);
    console.log(`DOMAIN: ${domain}`);
    console.log(`${'─'.repeat(40)}`);

    results.domains.push(domain);

    // Stage 1: Dissolve
    const dissolve = await stageDisssolve(domain, contexts[domain] || '');
    results.dissolve[domain] = dissolve;

    // Stage 2: Excavate
    const excavate = await stageExcavate(domain, dissolve);
    results.excavate[domain] = excavate;

    // Stage 3: Assay
    const assay = await stageAssay(domain, excavate);
    results.assay[domain] = assay;
  }

  // Stage 4: Converge (cross-domain)
  const allAssays = domains.map(d => ({ domain: d, ...results.assay[d] }));
  const converge = await stageConverge(allAssays);
  results.converge = converge;

  // Stage 5: Synthesize (per domain, informed by convergence)
  for (const domain of domains) {
    const synth = await stageSynthesize(
      domain,
      results.dissolve[domain],
      results.assay[domain],
      converge
    );
    results.synthesize[domain] = synth;
  }

  // Stage 6: Surface (per domain — internal + external connections)
  for (const domain of domains) {
    const surface = await stageSurface(
      domain,
      results.assay[domain],
      results.synthesize[domain]
    );
    results.surface[domain] = surface;
  }

  // Stage 7: Tribunal (per domain — multi-perspective verification)
  for (const domain of domains) {
    const tribunal = await stageTribunal(domain, results.synthesize[domain]);
    results.tribunal[domain] = tribunal;
  }

  // Save full results
  const timestamp = new Date().toISOString().slice(0, 10);
  const slug = domains.length === 1 ? domains[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30) : `multi-${domains.length}`;
  const outPath = path.join(OUTPUT_DIR, `cycle-${slug}-${timestamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));

  // Generate report
  const report = generateReport(results);
  const reportPath = path.join(OUTPUT_DIR, `cycle-${slug}-${timestamp}-report.md`);
  fs.writeFileSync(reportPath, report);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`CYCLE COMPLETE`);
  console.log(`Data: ${outPath}`);
  console.log(`Report: ${reportPath}`);
  console.log(`${'='.repeat(60)}\n`);

  return { ...results, files: { data: outPath, report: reportPath } };
}

// ── Run single domain (convenience) ──────────────────────────────────────────

export async function runSingleCycle(domain, context = '') {
  return runExtractionCycle([domain], context ? { [domain]: context } : {});
}

// ── Report Generator ─────────────────────────────────────────────────────────

function generateReport(results) {
  let report = `# Extraction Cycle Report\n`;
  report += `**Domains:** ${results.domains.join(', ')}\n`;
  report += `**Date:** ${results.timestamp}\n`;
  report += `**Stages:** Dissolve → Excavate → Assay → Converge → Synthesize → Surface → Tribunal\n\n`;

  for (const domain of results.domains) {
    const dissolve = results.dissolve[domain];
    const excavate = results.excavate[domain];
    const assay = results.assay[domain];
    const synth = results.synthesize[domain];

    report += `---\n\n## ${domain.toUpperCase()}\n\n`;

    // Stage 1 summary
    report += `### Stage 1: Dissolve\n`;
    report += `**False leg:** ${dissolve.falseLeg}\n`;
    report += `**Cracks:** ${dissolve.cracks.length}\n`;
    for (const c of dissolve.cracks) {
      report += `- ${c.observation?.slice(0, 120)}\n`;
    }
    report += `\n**Meta-answers:** ${dissolve.metaAnswers.length}\n`;
    for (const a of dissolve.metaAnswers) {
      report += `- Q: ${a.question?.slice(0, 100)}\n  → ${a.core_finding?.slice(0, 150) || ''}\n`;
    }
    report += '\n';

    // Stage 2 summary
    report += `### Stage 2: Excavate\n`;
    report += `**Shelf items found:** ${excavate.shelfItems.length}\n`;
    for (const item of excavate.shelfItems) {
      report += `- **${item.name}**: ${item.what_it_found?.slice(0, 120)}\n`;
    }
    report += '\n';

    // Stage 3 summary
    report += `### Stage 3: Assay\n`;
    report += `**Gold (A/B):** ${assay.gold.length} | **Open threads (C):** ${assay.openThreads.length} | **Rejected (D/F):** ${assay.rejected.length}\n\n`;
    for (const g of assay.gold) {
      report += `- ✓ **${g.name}** — Grade ${g.assay.grade} (${g.assay.composite?.toFixed(2)})\n`;
      report += `  ${g.assay.verdict}\n`;
      report += `  Strongest: ${g.assay.strongest_evidence}\n`;
    }
    if (assay.rejected.length) {
      report += `\nRejected:\n`;
      for (const r of assay.rejected) {
        report += `- ✗ ${r.name} — Grade ${r.assay.grade}: ${r.assay.verdict}\n`;
      }
    }
    report += '\n';

    // Stage 5 summary
    if (synth?.framework?.new_framework) {
      const fw = synth.framework.new_framework;
      report += `### Stage 5: Synthesize\n`;
      report += `**Old framework:** ${synth.framework.old_framework || ''}\n`;
      report += `**New framework:** ${fw.core_thesis}\n\n`;
      report += `**Key claims:**\n`;
      for (const claim of (fw.key_claims || [])) {
        report += `- [${claim.grade}] ${claim.claim}\n`;
        report += `  Evidence: ${claim.evidence_source}\n`;
        report += `  Test: ${claim.testable_prediction}\n`;
      }
      report += `\n**Explains what the old framework couldn't:**\n`;
      for (const e of (fw.what_it_explains || [])) report += `- ${e}\n`;
      report += `\n**New predictions:**\n`;
      for (const p of (fw.what_it_predicts || [])) report += `- ${p}\n`;
      report += `\n**Open questions:**\n`;
      for (const q of (fw.open_questions || [])) report += `- ${q}\n`;
      report += `\n**Confidence:** ${synth.framework.confidence_statement || ''}\n`;
    }
    report += '\n';

    // Stage 6 summary
    const surface = results.surface[domain];
    if (surface) {
      report += `### Stage 6: Surface\n\n`;
      if (surface.internal?.length) {
        report += `**Cathedral Connections (${surface.internal.length}):**\n`;
        for (const c of surface.internal) {
          report += `- [${c.connection_type?.toUpperCase()}] **${c.gold_item}** → ${c.cathedral_system}\n`;
          report += `  ${c.what_it_means}\n`;
          report += `  Action: ${c.action}\n`;
        }
        report += '\n';
      }
      if (surface.external?.length) {
        report += `**Living Threads (${surface.external.length}):**\n`;
        for (const t of surface.external) {
          report += `- **${t.name}**: ${t.what_theyre_doing}\n`;
          report += `  Last known: ${t.last_known_activity}\n`;
          report += `  → ${t.actionable}\n`;
        }
        report += '\n';
      }
    }

    // Stage 7 summary
    const tribunal = results.tribunal[domain];
    if (tribunal?.models) {
      report += `### Stage 7: Tribunal\n\n`;
      report += `**Verdict counts:** CONCEDE: ${tribunal.verdictCounts?.CONCEDE || 0} | CONTEST: ${tribunal.verdictCounts?.CONTEST || 0} | INSUFFICIENT: ${tribunal.verdictCounts?.INSUFFICIENT || 0}\n\n`;

      for (const [name, result] of Object.entries(tribunal.models)) {
        report += `**${name.toUpperCase()}:** ${result?.overall_verdict || 'no verdict'}\n`;
        if (result?.what_survives) report += `  Survives: ${result.what_survives}\n`;
        if (result?.what_falls) report += `  Falls: ${result.what_falls}\n`;
        if (result?.blind_spots) report += `  Blind spots: ${result.blind_spots}\n`;
      }
      report += '\n';

      if (tribunal.unanimous?.length) {
        report += `**Unanimous concessions (${tribunal.unanimous.length}):**\n`;
        for (const u of tribunal.unanimous) {
          report += `- ✓ ${u.claim}\n`;
        }
        report += '\n';
      }
      if (tribunal.divergent?.length) {
        report += `**Divergent (training floor artifacts, ${tribunal.divergent.length}):**\n`;
        for (const d of tribunal.divergent) {
          report += `- ⚡ ${d.claim} — ${d.spread}\n`;
        }
        report += '\n';
      }
    }

    report += '\n';
  }

  // Stage 4: Convergence
  if (results.converge) {
    report += `---\n\n## CROSS-DOMAIN CONVERGENCE\n\n`;
    report += `**Meta-signal:** ${results.converge.metaSignal}\n\n`;
    for (const c of (results.converge.convergences || [])) {
      report += `### [${c.type?.toUpperCase()}] ${c.signal}\n`;
      report += `**Domains:** ${c.domains_involved?.join(', ')}\n`;
      report += `**Items:** ${c.items_involved?.join(', ')}\n`;
      report += `**Evidence chain:** ${c.evidence_chain}\n`;
      report += `**Strength:** ${c.strength}\n`;
      report += `**Implication:** ${c.implication}\n\n`;
    }
  }

  return report;
}

// ── Telegram formatters ──────────────────────────────────────────────────────

export function formatCycleTelegram(results) {
  let msg = `⚗️ *Extraction Cycle Complete*\n`;
  msg += `Domains: ${results.domains.join(', ')}\n\n`;

  for (const domain of results.domains) {
    const assay = results.assay[domain];
    const synth = results.synthesize[domain];

    msg += `*${domain.toUpperCase()}*\n`;
    msg += `Cracks: ${results.dissolve[domain].cracks.length} | `;
    msg += `Shelf: ${results.excavate[domain].shelfItems.length} | `;
    msg += `Gold: ${assay.gold.length} | Rejected: ${assay.rejected.length}\n`;

    if (synth?.framework?.new_framework?.core_thesis) {
      msg += `→ _${synth.framework.new_framework.core_thesis.slice(0, 120)}_\n`;
    }
    msg += '\n';
  }

  if (results.converge?.convergences?.length) {
    msg += `*CONVERGENCES:* ${results.converge.convergences.length}\n`;
    for (const c of results.converge.convergences.slice(0, 3)) {
      msg += `→ [${c.type}] ${c.signal?.slice(0, 80)}\n`;
    }
    msg += '\n';
  }

  if (results.converge?.metaSignal) {
    msg += `*META-SIGNAL:* _${results.converge.metaSignal.slice(0, 150)}_\n\n`;
  }

  // Surface summary
  for (const domain of results.domains) {
    const surface = results.surface?.[domain];
    if (surface?.internal?.length || surface?.external?.length) {
      msg += `*SURFACE (${domain}):*\n`;
      if (surface.internal?.length) msg += `Cathedral connections: ${surface.internal.length}\n`;
      if (surface.external?.length) {
        msg += `Living threads: ${surface.external.length}\n`;
        for (const t of surface.external.slice(0, 2)) {
          msg += `→ ${t.name}: _${(t.what_theyre_doing || '').slice(0, 70)}_\n`;
        }
      }
      msg += '\n';
    }
  }

  // Tribunal summary
  for (const domain of results.domains) {
    const tribunal = results.tribunal?.[domain];
    if (tribunal?.verdictCounts) {
      msg += `*TRIBUNAL (${domain}):*\n`;
      msg += `Concede: ${tribunal.verdictCounts.CONCEDE} | Contest: ${tribunal.verdictCounts.CONTEST} | Insufficient: ${tribunal.verdictCounts.INSUFFICIENT}\n`;
      if (tribunal.unanimous?.length) msg += `Unanimous: ${tribunal.unanimous.length} claims\n`;
      if (tribunal.divergent?.length) msg += `Divergent: ${tribunal.divergent.length} (training floor artifacts)\n`;
      msg += '\n';
    }
  }

  return msg;
}

export { stageDisssolve as dissolve, stageExcavate as excavate, stageAssay as assay, stageConverge as converge, stageSynthesize as synthesize, stageSurface as surface, stageTribunal as tribunal };
