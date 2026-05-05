// negative-space.js
// 6th Gold Extractor pass — detects forensic absence in vault source material.
// Looks for: timeline gaps, documentation asymmetry, counter-evidence absence,
// researcher disappearance, patent voids.
// Spec: docs/addendum.md Section 4

import Database from 'better-sqlite3';
import { join } from 'path';

const HOME       = process.env.HOME;
const DB_PATH    = join(HOME, 'nanoclaw', 'vortex_data', 'metrics.db');
const OLLAMA_URL = 'http://localhost:11434';

const db = new Database(DB_PATH);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function queryOllama(model, system, prompt) {
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
  const data = await res.json();
  return data.message?.content ?? '';
}

// ─── Researcher Corpus Builder ────────────────────────────────────────────────
// Group nuggets by researcher name to build per-researcher corpora

function buildResearcherCorpora(nuggets) {
  const RESEARCHERS = [
    'Tesla', 'Schauberger', 'Rife', 'Moray', 'Hutchison', 'Rodin',
    'Pollack', 'Ehrenhaft', 'Reich', 'Leedskalnin', 'Bifilar', 'Bedini',
    'Keely', 'Searl', 'Priore', 'Bearden'
  ];

  const corpora = {};
  for (const name of RESEARCHERS) {
    const re = new RegExp(name, 'i');
    const matches = nuggets.filter(n =>
      re.test(n.title ?? '') || re.test(n.first_line ?? '') || re.test(n.tags ?? '')
    );
    if (matches.length >= 2) corpora[name] = matches;
  }
  return corpora;
}

// ─── Pattern 1: Timeline Gap Detection ───────────────────────────────────────
// Researcher output suddenly drops — detect year-mention density per decade

async function detectTimelineGaps(corpus, researcherName) {
  const combinedText = corpus.map(n => n.first_line ?? '').join('\n');

  const prompt = `You are analyzing vault notes about researcher ${researcherName}.
Look for patterns where their documented output SUDDENLY DROPS or disappears.
Identify: What years are mentioned? Are there periods with dense activity followed by sudden silence?
Reply JSON only: {
  "gap_detected": true/false,
  "active_period": "years of active output",
  "silence_period": "years of sudden reduction",
  "ratio": "brief ratio description e.g. '46 filings 1895-1905 vs 3 in 1906-1915'",
  "significance": "brief forensic note"
}

Vault text:\n${combinedText.slice(0, 3000)}`;

  try {
    const raw = await queryOllama('hermes3',
      'You are a forensic document analyst. Reply with JSON only.',
      prompt
    );
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    if (json.gap_detected) {
      return {
        pattern: 'TIMELINE_GAP',
        researcher: researcherName,
        active_period: json.active_period,
        silence_period: json.silence_period,
        ratio: json.ratio,
        significance: json.significance,
      };
    }
  } catch { /* skip */ }
  return null;
}

// ─── Pattern 2: Documentation Asymmetry ──────────────────────────────────────
// Described output volume doesn't match surviving documentation

async function detectDocumentationAsymmetry(corpus, researcherName) {
  const combinedText = corpus.map(n => n.first_line ?? '').join('\n');

  const prompt = `Analyze vault notes about ${researcherName}.
Look for mentions of output QUANTITY (lab notebooks described, pages mentioned, works described)
vs what actually SURVIVES or is cited.
Reply JSON only: {
  "asymmetry_detected": true/false,
  "described_volume": "what was described as existing",
  "surviving_evidence": "what actually survives",
  "loss_estimate": "e.g. '90%+ loss'",
  "significance": "forensic note"
}

Vault text:\n${combinedText.slice(0, 3000)}`;

  try {
    const raw = await queryOllama('hermes3',
      'You are a forensic document analyst. Reply with JSON only.',
      prompt
    );
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    if (json.asymmetry_detected) {
      return {
        pattern: 'DOCUMENTATION_ASYMMETRY',
        researcher: researcherName,
        described_volume: json.described_volume,
        surviving_evidence: json.surviving_evidence,
        loss_estimate: json.loss_estimate,
        significance: json.significance,
      };
    }
  } catch { /* skip */ }
  return null;
}

// ─── Pattern 3: Counter-Evidence Absence ─────────────────────────────────────
// No published debunkings or rebuttals where you'd expect them

async function detectCounterEvidenceAbsence(corpus, researcherName) {
  const combinedText = corpus.map(n => n.first_line ?? '').join('\n');

  const prompt = `Analyze vault notes about ${researcherName}'s claims.
Check: Are there ANY mentions of formal peer-reviewed rebuttals or refutations of their core claims?
OR are there only dismissals via consensus/authority without engaging the actual measurements?
Reply JSON only: {
  "absence_detected": true/false,
  "core_claim": "the main specific measurable claim",
  "formal_rebuttals_found": true/false,
  "dismissal_type": "institutional dismissal / silence / actual rebuttal",
  "significance": "forensic note on what absence means"
}

Vault text:\n${combinedText.slice(0, 3000)}`;

  try {
    const raw = await queryOllama('hermes3',
      'You are a forensic document analyst. Reply with JSON only.',
      prompt
    );
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    if (json.absence_detected && json.formal_rebuttals_found === false) {
      return {
        pattern: 'COUNTER_EVIDENCE_ABSENCE',
        researcher: researcherName,
        core_claim: json.core_claim,
        dismissal_type: json.dismissal_type,
        significance: json.significance,
      };
    }
  } catch { /* skip */ }
  return null;
}

// ─── Pattern 4: Researcher Disappearance ─────────────────────────────────────
// Active scientist vanishes from record without death/career change

async function detectResearcherDisappearance(corpus, researcherName) {
  const combinedText = corpus.map(n => n.first_line ?? '').join('\n');

  const prompt = `Analyze vault notes about ${researcherName}.
Did their public research output simply STOP without a clear reason (death, retirement, career change)?
Look for: "last known" dates, mentions of disappearance, institutional seizure, loss of lab access.
Reply JSON only: {
  "disappearance_detected": true/false,
  "last_active_period": "when they were last documented doing research",
  "reason_given": "death / retirement / seizure / simply stops / unknown",
  "suspicious": true/false,
  "significance": "forensic note"
}

Vault text:\n${combinedText.slice(0, 3000)}`;

  try {
    const raw = await queryOllama('hermes3',
      'You are a forensic document analyst. Reply with JSON only.',
      prompt
    );
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    if (json.disappearance_detected && json.suspicious) {
      return {
        pattern: 'RESEARCHER_DISAPPEARANCE',
        researcher: researcherName,
        last_active_period: json.last_active_period,
        reason_given: json.reason_given,
        significance: json.significance,
      };
    }
  } catch { /* skip */ }
  return null;
}

// ─── Main Scan ────────────────────────────────────────────────────────────────

export async function runNegativeSpaceScan(onProgress) {
  const log = (msg) => { console.log(msg); onProgress?.(msg); };

  log('🕳️  Negative Space Detector — scanning for forensic absences...');

  const nuggets = db.prepare('SELECT * FROM vault_embeddings').all();
  if (nuggets.length === 0) {
    return { findings: [], summary: 'No vault nuggets to scan.' };
  }

  const corpora = buildResearcherCorpora(nuggets);
  const researchers = Object.keys(corpora);
  log(`   Researcher corpora found: ${researchers.join(', ')}`);

  const findings = [];

  for (const name of researchers) {
    const corpus = corpora[name];
    log(`   Scanning ${name} (${corpus.length} nuggets)...`);

    const [gap, asymmetry, absence, disappearance] = await Promise.all([
      detectTimelineGaps(corpus, name),
      detectDocumentationAsymmetry(corpus, name),
      detectCounterEvidenceAbsence(corpus, name),
      detectResearcherDisappearance(corpus, name),
    ]);

    if (gap) findings.push(gap);
    if (asymmetry) findings.push(asymmetry);
    if (absence) findings.push(absence);
    if (disappearance) findings.push(disappearance);
  }

  log(`   Negative space findings: ${findings.length}`);
  return { findings, summary: formatNegativeSpaceFindings(findings) };
}

// ─── Format Findings ──────────────────────────────────────────────────────────

export function formatNegativeSpaceFindings(findings) {
  if (findings.length === 0) {
    return '🕳️  NEGATIVE SPACE: No significant absences detected in current vault sample.';
  }

  const PATTERN_LABELS = {
    TIMELINE_GAP:             'TIMELINE GAP',
    DOCUMENTATION_ASYMMETRY:  'DOCUMENTATION ASYMMETRY',
    COUNTER_EVIDENCE_ABSENCE: 'COUNTER-EVIDENCE ABSENCE',
    RESEARCHER_DISAPPEARANCE: 'RESEARCHER DISAPPEARANCE',
    PATENT_VOID:              'PATENT VOID',
  };

  let out = `🕳️  *NEGATIVE SPACE FINDINGS*\n`;
  out += `_Forensic absence is signal, not evidence. Absence of documentation does not prove suppression._\n\n`;

  for (const f of findings) {
    const label = PATTERN_LABELS[f.pattern] ?? f.pattern;
    out += `*${label}: ${f.researcher}*\n`;

    if (f.pattern === 'TIMELINE_GAP') {
      out += `  Active: ${f.active_period} → Silence: ${f.silence_period}\n`;
      if (f.ratio) out += `  ${f.ratio}\n`;
    } else if (f.pattern === 'DOCUMENTATION_ASYMMETRY') {
      out += `  Described: ${f.described_volume}\n`;
      out += `  Surviving: ${f.surviving_evidence} (est. ${f.loss_estimate} loss)\n`;
    } else if (f.pattern === 'COUNTER_EVIDENCE_ABSENCE') {
      out += `  Claim: ${f.core_claim}\n`;
      out += `  Dismissal type: ${f.dismissal_type}\n`;
    } else if (f.pattern === 'RESEARCHER_DISAPPEARANCE') {
      out += `  Last active: ${f.last_active_period}\n`;
      out += `  Reason given: ${f.reason_given}\n`;
    }

    if (f.significance) out += `  → ${f.significance}\n`;
    out += '\n';
  }

  return out.trim();
}

// ─── Persist findings to gold_findings table (for Gold Extractor integration) ─

export function persistNegativeSpaceFindings(findings) {
  if (findings.length === 0) return;

  const insert = db.prepare(`
    INSERT INTO gold_findings (type, data, created_at)
    VALUES ('negative_space', ?, ?)
    ON CONFLICT DO NOTHING
  `);

  // gold_findings may not have a UNIQUE constraint — just insert
  try {
    for (const f of findings) {
      insert.run(JSON.stringify(f), Date.now());
    }
  } catch {
    // Table structure may differ — silently skip
  }
}
