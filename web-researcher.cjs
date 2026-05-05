// ~/nanoclaw/web-researcher.js
// Web search + epistemic triage + vault deposit pipeline.
// Uses Gemini API with google_search grounding for web access.
// All findings tagged [EXTERNAL] and triaged before vault deposit.
//
// Exports: webSearch(query), triageWebResults(results), depositToVault(findings)

const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('fs');
const { join } = require('path');
const { appendProjectLog } = require('./project-log.cjs');

const HOME = process.env.HOME;
const OLLAMA_URL = 'http://localhost:11434';
const TRIAGE_MODEL = 'hermes3';
const STAGING_DIR = join(HOME, 'cathedral-vault', '00_Staging');

// Load .env
try {
  const envFile = readFileSync(join(HOME, 'nanoclaw', '.env'), 'utf8');
  for (const line of envFile.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {}

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;

// ── Gemini Web Search ───────────────────────────────────────────────────────

async function webSearch(query, maxResults = 5) {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not set');

  const prompt = `Search the web for: ${query}

Return ONLY a JSON array of objects with these fields:
- title: article/paper title
- url: source URL
- snippet: 2-3 sentence summary of the content
- date: publication date if available (YYYY-MM-DD format), or null
- source_type: one of "peer_reviewed", "preprint", "article", "forum", "wiki", "unknown"

Maximum ${maxResults} results. Prefer peer-reviewed sources and original research.
Return ONLY the JSON array, no other text.`;

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  if (!candidate) throw new Error('No candidates in Gemini response');

  const text = candidate.content?.parts?.[0]?.text || '';
  const grounding = candidate.groundingMetadata || {};
  const groundingChunks = grounding.groundingChunks || [];

  // Parse the JSON results from the text
  let results = extractJSON(text);
  if (!results || !Array.isArray(results)) {
    // Fallback: build results from grounding chunks
    results = groundingChunks.map(ch => ({
      title: ch.web?.title || 'Unknown',
      url: ch.web?.uri || '',
      snippet: '',
      date: null,
      source_type: 'unknown',
    }));
  }

  // Enrich with grounding source URLs where available
  for (let i = 0; i < results.length && i < groundingChunks.length; i++) {
    if (groundingChunks[i]?.web?.uri && !results[i].grounding_url) {
      results[i].grounding_url = groundingChunks[i].web.uri;
    }
  }

  return {
    query,
    results: results.slice(0, maxResults),
    grounding_chunks: groundingChunks.length,
    timestamp: new Date().toISOString(),
  };
}

// ── Epistemic Triage (lightweight, inline for web results) ──────────────────

const TRIAGE_WEIGHTS = {
  structural: 0.30,
  corroboration: 0.25,
  experimental: 0.25,
  provenance: 0.15,
  suppression: 0.05,
};

function computeGrade(scores) {
  const composite =
    (scores.structural || 0) * TRIAGE_WEIGHTS.structural +
    (scores.corroboration || 0) * TRIAGE_WEIGHTS.corroboration +
    (scores.experimental || 0) * TRIAGE_WEIGHTS.experimental +
    (scores.provenance || 0) * TRIAGE_WEIGHTS.provenance +
    (scores.suppression || 0) * TRIAGE_WEIGHTS.suppression;

  let grade;
  if (composite >= 0.80) grade = 'A';
  else if (composite >= 0.60) grade = 'B';
  else if (composite >= 0.40) grade = 'C';
  else if (composite >= 0.20) grade = 'D';
  else grade = 'F';

  return { composite: Math.round(composite * 100) / 100, grade };
}

async function queryOllama(model, system, prompt) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const data = await res.json();
  return data.message?.content || '';
}

async function triageWebResult(result) {
  const system = `You are an epistemic triage system. Score this web search finding on 5 dimensions.
Each score is 0.0 to 1.0.

WEB FINDINGS carry additional skepticism:
- A single web source with no cited references scores max 0.4 on corroboration
- Source type matters: peer_reviewed > preprint > article > forum > wiki > unknown
- Claims without methodology or data score max 0.3 on experimental

Return ONLY a JSON object:
{
  "structural": 0.0-1.0,
  "corroboration": 0.0-1.0,
  "experimental": 0.0-1.0,
  "provenance": 0.0-1.0,
  "suppression": 0.0-1.0,
  "key_claim": "the main claim in one sentence",
  "notes": "brief assessment"
}`;

  const prompt = `Title: ${result.title}
Source type: ${result.source_type || 'unknown'}
Date: ${result.date || 'unknown'}
URL: ${result.url || 'none'}

Content: ${result.snippet}`;

  try {
    const raw = await queryOllama(TRIAGE_MODEL, system, prompt);
    const scores = extractJSON(raw);
    if (!scores) return { grade: 'D', composite: 0.2, error: 'parse_failed', result };

    const { composite, grade } = computeGrade(scores);
    return {
      ...scores,
      composite,
      grade,
      title: result.title,
      url: result.url,
      source_type: result.source_type,
      date: result.date,
    };
  } catch (e) {
    return { grade: 'D', composite: 0.2, error: e.message, result };
  }
}

async function triageWebResults(searchResults) {
  const triaged = [];
  for (const result of searchResults.results) {
    const scored = await triageWebResult(result);
    triaged.push(scored);
  }
  return triaged;
}

// ── Vault Deposit ───────────────────────────────────────────────────────────

function depositToVault(triaged, query, domain = 'web-research') {
  const deposited = [];
  const domainDir = join(STAGING_DIR, domain);
  if (!existsSync(domainDir)) mkdirSync(domainDir, { recursive: true });

  for (const finding of triaged) {
    // Only deposit Grade B+ to vault
    if (finding.grade !== 'A' && finding.grade !== 'B') continue;

    const slug = (finding.title || query)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 60);
    const date = new Date().toISOString().slice(0, 10);
    const filename = `${date}-web-${slug}.md`;
    const filepath = join(domainDir, filename);

    const content = `---
title: "${(finding.title || '').replace(/"/g, '\\"')}"
date: ${date}
domain: ${domain}
source: "[EXTERNAL]"
source_url: "${finding.url || ''}"
source_type: ${finding.source_type || 'unknown'}
epistemic_grade: ${finding.grade}
composite_score: ${finding.composite}
tags: [web-research, external, epistemic-triage]
---

# ${finding.title || query}

**Source:** [EXTERNAL] ${finding.url || 'URL not available'}
**Grade:** ${finding.grade} (${finding.composite})
**Source type:** ${finding.source_type || 'unknown'}

## Key Claim
${finding.key_claim || 'No claim extracted'}

## Assessment
${finding.notes || 'No assessment available'}

## Triage Scores
- Structural: ${finding.structural || '?'}
- Corroboration: ${finding.corroboration || '?'}
- Experimental: ${finding.experimental || '?'}
- Provenance: ${finding.provenance || '?'}
- Suppression: ${finding.suppression || '?'}

## Original Snippet
${finding.snippet || triaged.find(t => t.title === finding.title)?.result?.snippet || ''}

---
*Deposited by The Researcher. Web findings are second-class citizens until independently verified against vault content.*
`;

    writeFileSync(filepath, content, 'utf8');
    deposited.push({ filepath, grade: finding.grade, title: finding.title });
  }

  if (deposited.length > 0) {
    appendProjectLog('cathedral', 'web_research_deposit', {
      query,
      domain: domain || 'web-research',
      deposited: deposited.length,
      grades: deposited.map(d => d.grade),
    });
    // Also log to the target domain
    if (domain && domain !== 'cathedral' && domain !== 'web-research') {
      appendProjectLog(domain, 'web_research_deposit', {
        query,
        deposited: deposited.length,
        grades: deposited.map(d => d.grade),
        source: 'web-researcher',
      });
    }
  }

  return deposited;
}

// ── Cross-reference against vault ───────────────────────────────────────────

async function crossReference(webFindings, query) {
  // Search vault for existing content on this topic
  try {
    const res = await fetch(`http://localhost:8080/vault/search?q=${encodeURIComponent(query)}&limit=5`, {
      headers: { 'x-api-key': 'cathedral-mcp-2026' },
    });
    if (!res.ok) return { vault_matches: 0, novel: webFindings.length };
    const vaultResults = await res.json();
    const vaultTitles = (vaultResults.results || vaultResults || [])
      .map(r => (r.title || r.path || '').toLowerCase());

    let novel = 0;
    let overlapping = 0;
    for (const f of webFindings) {
      const title = (f.title || '').toLowerCase();
      const hasOverlap = vaultTitles.some(vt =>
        vt.includes(title.slice(0, 30)) || title.includes(vt.slice(0, 30))
      );
      if (hasOverlap) overlapping++;
      else novel++;
    }

    return { vault_matches: overlapping, novel, total_vault_results: vaultTitles.length };
  } catch {
    return { vault_matches: 0, novel: webFindings.length, error: 'vault_search_failed' };
  }
}

// ── JSON extraction helper ──────────────────────────────────────────────────

function extractJSON(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch {} }
  const arrStart = cleaned.indexOf('[');
  const arrEnd = cleaned.lastIndexOf(']');
  if (arrStart !== -1 && arrEnd > arrStart) {
    try { return JSON.parse(cleaned.slice(arrStart, arrEnd + 1)); } catch {}
  }
  const objStart = cleaned.indexOf('{');
  const objEnd = cleaned.lastIndexOf('}');
  if (objStart !== -1 && objEnd > objStart) {
    try { return JSON.parse(cleaned.slice(objStart, objEnd + 1)); } catch {}
  }
  return null;
}

// ── Full web research pipeline ──────────────────────────────────────────────

async function researchWeb(query, opts = {}) {
  const { domain = 'web-research', maxResults = 5, onProgress } = opts;
  const progress = (msg) => {
    console.log(`[web-researcher] ${msg}`);
    if (onProgress) onProgress(msg);
  };

  progress(`Searching web: "${query.slice(0, 80)}"`);
  const searchResults = await webSearch(query, maxResults);
  progress(`Found ${searchResults.results.length} results (${searchResults.grounding_chunks} grounding chunks)`);

  progress('Cross-referencing against vault...');
  const xref = await crossReference(searchResults.results, query);
  progress(`Vault overlap: ${xref.vault_matches}, novel: ${xref.novel}`);

  progress(`Triaging ${searchResults.results.length} web findings...`);
  const triaged = await triageWebResults(searchResults);
  const gradeB = triaged.filter(t => t.grade === 'A' || t.grade === 'B').length;
  const gradeC = triaged.filter(t => t.grade === 'C').length;
  progress(`Triage complete: ${gradeB} Grade A/B, ${gradeC} Grade C, ${triaged.length - gradeB - gradeC} Grade D/F`);

  progress('Depositing Grade B+ findings to vault...');
  const deposited = depositToVault(triaged, query, domain);
  progress(`Deposited ${deposited.length} findings to ${domain}/`);

  return {
    query,
    search_results: searchResults.results.length,
    grounding_chunks: searchResults.grounding_chunks,
    vault_overlap: xref,
    triaged: triaged.map(t => ({
      title: t.title,
      grade: t.grade,
      composite: t.composite,
      key_claim: t.key_claim,
      url: t.url,
    })),
    deposited: deposited.length,
    grade_summary: {
      A: triaged.filter(t => t.grade === 'A').length,
      B: triaged.filter(t => t.grade === 'B').length,
      C: triaged.filter(t => t.grade === 'C').length,
      D: triaged.filter(t => t.grade === 'D').length,
      F: triaged.filter(t => t.grade === 'F').length,
    },
  };
}

module.exports = {
  webSearch,
  triageWebResult,
  triageWebResults,
  depositToVault,
  crossReference,
  researchWeb,
  computeGrade,
};
