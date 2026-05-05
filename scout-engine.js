// ~/nanoclaw/scout-engine.js
// The Scout — methodology hunter for AI investigation techniques.
// Hunts forums for live methodology discoveries, scores through 5-axis filter,
// tracks convergence across sources, manages curated cracks, generates weather reports.
//
// Usage:
//   node scout-engine.js --mode=weekly       Full scan + digest + weather report
//   node scout-engine.js --mode=probe --input="<topic or url>"   On-demand deep probe
//   node scout-engine.js --mode=metabolism   Confidence decay scan
//
// PM2 cron: Sunday 08:00 HKT (weekly), daily 06:00 HKT (metabolism)

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, renameSync } from 'fs';
import { join, basename } from 'path';

const HOME = process.env.HOME;
const NANOCLAW = join(HOME, 'nanoclaw');
const VAULT = join(HOME, 'cathedral-vault');
const FINDINGS_DIR = join(VAULT, '06_Methods', 'scout-findings');
const ARCHIVED_DIR = join(FINDINGS_DIR, 'archived');
const CRACKS_DIR = join(VAULT, '06_Methods', 'scout-cracks');
const WEATHER_DIR = join(VAULT, 'weather-report');
const MISSIONS_FILE = join(VAULT, '06_Methods', 'scout-missions-current.md');
const OLLAMA_URL = 'http://localhost:11434';
const TRIAGE_MODEL = 'hermes3';

// ── Load .env ────────────────────────────────────────────────────────────────

try {
  const envFile = readFileSync(join(NANOCLAW, '.env'), 'utf8');
  for (const line of envFile.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {}

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const PAUL_CHAT_ID = process.env.PAUL_CHAT_ID || '1912121485';

// ── Telegram ─────────────────────────────────────────────────────────────────

async function sendTelegram(text) {
  if (!TELEGRAM_TOKEN) { console.log('[scout] No TELEGRAM_TOKEN — skipping send'); return; }
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  // Split long messages
  const MAX = 4000;
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= MAX) { chunks.push(remaining); break; }
    let cut = remaining.lastIndexOf('\n\n', MAX);
    if (cut < MAX * 0.3) cut = remaining.lastIndexOf('\n', MAX);
    if (cut < MAX * 0.3) cut = MAX;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).replace(/^\n+/, '');
  }
  for (const chunk of chunks) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: PAUL_CHAT_ID, text: chunk }),
    });
    const data = await res.json();
    if (!data.ok) console.error('[scout] Telegram error:', data.description);
    if (chunks.length > 1) await new Promise(r => setTimeout(r, 500));
  }
}

// ── Ollama ────────────────────────────────────────────────────────────────────

async function queryOllama(system, prompt, format) {
  const body = {
    model: TRIAGE_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    stream: false,
  };
  if (format === 'json') body.format = 'json';
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const data = await res.json();
  let content = data.message?.content || '';
  // Strip qwen3 think blocks
  content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  return content;
}

function extractJSON(text) {
  // Try the whole thing first
  try { return JSON.parse(text); } catch {}
  // Try extracting from markdown code block
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) try { return JSON.parse(codeBlock[1]); } catch {}
  // Try extracting first { ... } or [ ... ]
  const braces = text.match(/(\{[\s\S]*\})/);
  if (braces) try { return JSON.parse(braces[1]); } catch {}
  const brackets = text.match(/(\[[\s\S]*\])/);
  if (brackets) try { return JSON.parse(brackets[1]); } catch {}
  return null;
}

// ── Gemini Web Search ────────────────────────────────────────────────────────

async function webSearch(query, maxResults = 5) {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not set');

  const prompt = `Search the web for: ${query}

Return ONLY a JSON array of objects:
- title: article/post title
- url: source URL
- snippet: 2-3 sentence summary of the actual content
- date: publication date (YYYY-MM-DD) or null
- source_type: "peer_reviewed" | "preprint" | "article" | "forum" | "blog" | "wiki" | "unknown"
- community: source community name (e.g. "r/LocalLLaMA", "Simon Willison blog", "Latent Space Discord")

Maximum ${maxResults} results. Prefer recent (last 90 days) and mechanism-aware sources.
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
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  if (!candidate) throw new Error('No candidates in Gemini response');

  const text = candidate.content?.parts?.[0]?.text || '';
  const grounding = candidate.groundingMetadata || {};
  const groundingChunks = grounding.groundingChunks || [];

  let results = extractJSON(text);
  if (!results || !Array.isArray(results)) {
    results = groundingChunks.map(ch => ({
      title: ch.web?.title || 'Unknown',
      url: ch.web?.uri || '',
      snippet: '',
      date: null,
      source_type: 'unknown',
      community: 'unknown',
    }));
  }

  return results.slice(0, maxResults);
}

// ── Five-Axis Filter ─────────────────────────────────────────────────────────

async function scoreCandidate(result) {
  const system = `You are the Scout's five-axis filter for AI methodology findings.
Score this finding on 5 axes. Return ONLY a JSON object.

AXES:
1. mechanism (0.0-1.0): Does it name a specific failure mode it prevents?
   1.0 = specific named failure mode. 0.5 = vague but present. 0.0 = "improves thinking" level.

2. proof (0.0-1.0): Has it been demonstrated in real sessions?
   1.0 = cross-platform verified. 0.7 = multi-session same platform. 0.3 = single session. 0.0 = theoretical only.

3. marginal_value (0.0-1.0): What does it add to existing techniques?
   1.0 = genuinely novel, no clear parent. 0.7 = extends existing with named parent. 0.0 = restates known technique.

4. abandonment_pattern (0.0-1.0): Why did it stop working (if applicable)?
   1.0 = community surrendered (got tired). 0.9 = provider suppressed. 0.4 = normal evolution/superseded. 0.5 = not applicable.

5. narrative_gravity (0.0-1.0): Ratio of community applications serving one conclusion vs challenging it.
   0.0 = balanced diverse use. 1.0 = all techniques serve one narrative. >0.7 = flag for evaluator.

Also provide:
- technique_title: short descriptive name
- mechanism_description: the specific failure mode prevented (1 sentence)
- technique_parent: name of parent technique if extends existing, null if novel
- reporter_type: "mechanism-aware" (explains WHY it works) | "anecdotal" (just reports result) | "unknown"
- counter_evidence_noted: any noted failures or limitations (string or null)
- recommended_action: "accept" (high confidence) | "stage" (needs more data) | "discard" (low value)

Return JSON only.`;

  const prompt = `FINDING:
Title: ${result.title}
Source: ${result.community || result.source_type || 'unknown'}
Date: ${result.date || 'unknown'}
URL: ${result.url || 'none'}

Content: ${result.snippet}`;

  try {
    const raw = await queryOllama(system, prompt, 'json');
    const scores = extractJSON(raw);
    if (!scores) return null;
    return {
      ...scores,
      source_url: result.url,
      source_community: result.community || result.source_type,
      source_date: result.date,
      raw_title: result.title,
    };
  } catch (e) {
    console.error('[scout] Scoring failed:', e.message);
    return null;
  }
}

// ── Convergence ──────────────────────────────────────────────────────────────

function convergenceScore(sightings) {
  if (!sightings || sightings.length === 0) return 0;
  const weights = { 'mechanism-aware': 1.0, 'anecdotal': 0.4, 'unknown': 0.2 };
  const avgQuality = sightings.reduce((s, x) => s + (weights[x.reporter_type] || 0.2), 0) / sightings.length;
  const timeSpread = getTimeSpreadFactor(sightings);
  return sightings.length * avgQuality * timeSpread;
}

function getTimeSpreadFactor(sightings) {
  if (sightings.length < 2) return 0.5;
  const dates = sightings.map(s => new Date(s.date).getTime()).filter(d => !isNaN(d));
  if (dates.length < 2) return 0.5;
  const spread = (Math.max(...dates) - Math.min(...dates)) / 86400000;
  if (spread < 2) return 0.5;   // viral sharing
  if (spread < 7) return 0.8;
  return 1.0;                    // independent discovery
}

function calculateConfidence(axes, convergence, counterEvidence) {
  const axisValues = [
    axes.mechanism || 0,
    axes.proof || 0,
    axes.marginal_value || 0,
    axes.abandonment_pattern || 0.5,
    1.0 - (axes.narrative_gravity || 0),  // invert: low gravity = good
  ];
  const axisScore = axisValues.reduce((a, b) => a + b, 0) / axisValues.length;
  const ceCount = Array.isArray(counterEvidence) ? counterEvidence.length : 0;
  const ceWeight = ceCount * 0.6;
  const conv = Math.max(convergence, 0.1);
  return Math.round((conv / (conv + ceWeight)) * axisScore * 100) / 100;
}

// ── Finding File I/O ─────────────────────────────────────────────────────────

function generateFindingId() {
  const date = new Date().toISOString().slice(0, 10);
  const existing = readdirSync(FINDINGS_DIR).filter(f => f.startsWith(`scout-${date}`));
  const num = String(existing.length + 1).padStart(3, '0');
  return `scout-${date}-${num}`;
}

function writeFinding(id, scored, missionMatch) {
  const date = new Date().toISOString().slice(0, 10);
  const revalidateBy = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  const confidence = calculateConfidence(scored, convergenceScore([{
    date: scored.source_date || date,
    reporter_type: scored.reporter_type || 'unknown',
  }]), []);

  const ngScore = scored.narrative_gravity || null;
  const ngTrend = ngScore !== null && ngScore > 0.7 ? 'rising' : null;

  const content = `---
title: "${(scored.technique_title || scored.raw_title || 'untitled').replace(/"/g, "'")}"
id: ${id}
status: active
confidence: ${confidence}
discovered: ${date}
revalidate_by: ${revalidateBy}
half_life_estimate: null
decay_rate: null
technique_parent: ${scored.technique_parent || 'null'}
mechanism: "${(scored.mechanism_description || '').replace(/"/g, "'")}"
failure_mode_prevented: "${(scored.mechanism_description || '').replace(/"/g, "'")}"
narrative_gravity_score: ${ngScore}
narrative_gravity_trend: ${ngTrend}
mission_match: ${missionMatch ? 'true' : 'false'}
convergence:
  - source: "${(scored.source_community || 'unknown').replace(/"/g, "'")}"
    date: ${scored.source_date || date}
    reporter_type: ${scored.reporter_type || 'unknown'}
    url: "${scored.source_url || ''}"
counter_evidence: []
provider_response: null
tags: [scout, methodology]
---

## ${scored.technique_title || scored.raw_title || 'Untitled Finding'}

${scored.mechanism_description || ''}

### Source
- URL: ${scored.source_url || 'none'}
- Community: ${scored.source_community || 'unknown'}
- Reporter type: ${scored.reporter_type || 'unknown'}

### Axis Scores
- Mechanism: ${scored.mechanism || 0}
- Proof: ${scored.proof || 0}
- Marginal value: ${scored.marginal_value || 0}
- Abandonment pattern: ${scored.abandonment_pattern || 0.5}
- Narrative gravity: ${scored.narrative_gravity || 0}

### Counter-evidence
${scored.counter_evidence_noted || 'None noted.'}
`;

  const filepath = join(FINDINGS_DIR, `${id}.md`);
  writeFileSync(filepath, content);
  return { filepath, confidence, id };
}

function readAllFindings() {
  if (!existsSync(FINDINGS_DIR)) return [];
  return readdirSync(FINDINGS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const content = readFileSync(join(FINDINGS_DIR, f), 'utf8');
      const fm = parseFrontmatter(content);
      return { ...fm, filename: f, filepath: join(FINDINGS_DIR, f) };
    });
}

function parseFrontmatter(content) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) return { frontmatter: {}, body: content };

  const fm = {};
  const lines = fmMatch[1].split('\n');
  for (const line of lines) {
    const kv = line.match(/^(\w[\w_]*)\s*:\s*(.+)$/);
    if (kv) {
      let val = kv[2].trim().replace(/^["']|["']$/g, '');
      if (val === 'null') val = null;
      else if (val === 'true') val = true;
      else if (val === 'false') val = false;
      else if (/^\d+\.\d+$/.test(val)) val = parseFloat(val);
      else if (/^\d+$/.test(val)) val = parseInt(val, 10);
      fm[kv[1]] = val;
    }
  }
  return { frontmatter: fm, body: fmMatch[2] };
}

// ── Finding management ───────────────────────────────────────────────────────

export function promoteFinding(id) {
  const filepath = join(FINDINGS_DIR, `${id}.md`);
  if (!existsSync(filepath)) throw new Error(`Finding not found: ${id}`);
  const dest = join(VAULT, '00_Staging', 'cathedral', `${id}.md`);
  mkdirSync(join(VAULT, '00_Staging', 'cathedral'), { recursive: true });
  renameSync(filepath, dest);
  return dest;
}

export function parkFinding(id) {
  const filepath = join(FINDINGS_DIR, `${id}.md`);
  if (!existsSync(filepath)) throw new Error(`Finding not found: ${id}`);
  let content = readFileSync(filepath, 'utf8');
  const newDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  content = content.replace(/revalidate_by:\s*.+/, `revalidate_by: ${newDate}`);
  content = content.replace(/status:\s*.+/, 'status: parked');
  writeFileSync(filepath, content);
  return newDate;
}

export function discardFinding(id) {
  const filepath = join(FINDINGS_DIR, `${id}.md`);
  if (!existsSync(filepath)) throw new Error(`Finding not found: ${id}`);
  const dest = join(ARCHIVED_DIR, `${id}.md`);
  renameSync(filepath, dest);
  return dest;
}

// ── Cracks ───────────────────────────────────────────────────────────────────

function readAllCracks() {
  if (!existsSync(CRACKS_DIR)) return [];
  return readdirSync(CRACKS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const content = readFileSync(join(CRACKS_DIR, f), 'utf8');
      return { ...parseFrontmatter(content), filename: f };
    });
}

export function getTopCrack(domain) {
  const cracks = readAllCracks().filter(c => c.frontmatter.status === 'active');
  if (cracks.length === 0) return null;
  // Domain match first, then highest survived_map_room_sessions
  let selected;
  if (domain) {
    const domainMatch = cracks.filter(c => c.frontmatter.domain === domain);
    if (domainMatch.length) {
      selected = domainMatch.sort((a, b) =>
        (b.frontmatter.survived_map_room_sessions || 0) - (a.frontmatter.survived_map_room_sessions || 0)
      )[0];
    }
  }
  if (!selected) {
    selected = cracks.sort((a, b) =>
      (b.frontmatter.convergence_count || 0) - (a.frontmatter.convergence_count || 0)
    )[0];
  }
  return selected;
}

export function formatCrack(crack) {
  if (!crack) return 'No curated cracks in database.';
  const fm = crack.frontmatter;
  return `Curated crack -- ${fm.title || 'untitled'}
Anomaly: ${fm.anomaly || 'none'}
Strongest mundane resolution: ${fm.strongest_mundane_resolution || 'none'}
Why it remains open: ${fm.why_unresolved || 'unknown'}
Survived ${fm.survived_map_room_sessions || 0} prior sessions without resolution.`;
}

// ── Missions ─────────────────────────────────────────────────────────────────

function readMissions() {
  if (!existsSync(MISSIONS_FILE)) return [];
  const content = readFileSync(MISSIONS_FILE, 'utf8');
  const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('---'));
  return lines.map(l => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean);
}

export function writeMissions(text) {
  const date = new Date().toISOString().slice(0, 10);
  const content = `---
title: "Scout Missions - Current"
updated: ${date}
source: universe-orc
---

# Active Scout Missions

${text}
`;
  writeFileSync(MISSIONS_FILE, content);
  return MISSIONS_FILE;
}

// ── Search Queries ───────────────────────────────────────────────────────────

const BROAD_QUERIES = [
  'AI prompt engineering new techniques 2026 reddit',
  'LLM prompting methodology breakthrough site:reddit.com OR site:news.ycombinator.com',
  'Claude Gemini GPT prompt technique discovery community',
  'AI investigation methodology failure modes prevention',
  'prompt engineering convergence multiple models technique',
  'LLM capability suppression removed feature 2026',
  'AI reasoning chain improvement verified technique',
  'system prompt engineering advanced method community verified',
];

function buildSearchQueries(missions) {
  const queries = [];
  // Mission-driven queries first
  for (const mission of missions) {
    queries.push(`${mission} AI methodology technique 2026`);
  }
  // Then broad scan
  queries.push(...BROAD_QUERIES);
  return queries;
}

// ── Weather Report ───────────────────────────────────────────────────────────

function generateWeatherReport(findings, cracks, disruptorPass) {
  const date = new Date().toISOString().slice(0, 10);
  const active = findings.filter(f => f.frontmatter.status === 'active');
  const flagged = findings.filter(f => f.frontmatter.status === 'flagged');
  const decayed = findings.filter(f => f.frontmatter.status === 'decayed');
  const missionMatches = findings.filter(f => f.frontmatter.mission_match);

  const topCrack = getTopCrack();
  const crackSlot = topCrack ? formatCrack(topCrack) : 'No curated cracks yet.';

  const report = `# Scout Weather Report -- ${date}

## Active Findings: ${active.length}
${active.map(f => `- [${f.frontmatter.confidence || '?'}] ${f.frontmatter.title || f.filename}`).join('\n') || 'None'}

## Flagged for Revalidation: ${flagged.length}
${flagged.map(f => `- ${f.frontmatter.title || f.filename} -- last confirmed ${f.frontmatter.revalidate_by || '?'}`).join('\n') || 'None'}

## Decayed: ${decayed.length}
${decayed.map(f => `- ${f.frontmatter.title || f.filename}`).join('\n') || 'None'}

## Mission Matches: ${missionMatches.length}
${missionMatches.map(f => `- ${f.frontmatter.title || f.filename}`).join('\n') || 'None'}

## Curated Crack
${crackSlot}

## This Week's Primary Disruptor
${disruptorPass || 'No Scout input -- default to random selection from passes 1-7.'}

## Negative Space
Techniques the community is trying to solve but hasn't:
(populated after first full scan)
`;

  const filepath = join(WEATHER_DIR, 'current.txt');
  writeFileSync(filepath, report);
  return report;
}

// ── Disruptor Selection ──────────────────────────────────────────────────────

const DISRUPTOR_PASSES = [
  { id: 1, name: 'Confirmation Bias Inversion' },
  { id: 2, name: 'Source Independence Audit' },
  { id: 3, name: 'Mechanism Demand' },
  { id: 4, name: 'Temporal Stability Check' },
  { id: 5, name: 'Counter-Evidence Search' },
  { id: 6, name: 'Narrative Gravity Scan' },
  { id: 7, name: 'Boundary Condition Probe' },
];

function selectDisruptor(findings) {
  // Find most common failure mode in recent findings
  const failureModes = {};
  for (const f of findings) {
    const fm = f.frontmatter;
    if (fm.mechanism && typeof fm.mechanism === 'string') {
      const key = fm.mechanism.toLowerCase();
      if (key.includes('confirmation') || key.includes('bias')) failureModes['confirmation'] = (failureModes['confirmation'] || 0) + 1;
      if (key.includes('source') || key.includes('citation')) failureModes['source'] = (failureModes['source'] || 0) + 1;
      if (key.includes('mechanism') || key.includes('why')) failureModes['mechanism'] = (failureModes['mechanism'] || 0) + 1;
      if (key.includes('temporal') || key.includes('drift')) failureModes['temporal'] = (failureModes['temporal'] || 0) + 1;
      if (key.includes('counter') || key.includes('evidence')) failureModes['counter'] = (failureModes['counter'] || 0) + 1;
      if (key.includes('narrative') || key.includes('gravity')) failureModes['narrative'] = (failureModes['narrative'] || 0) + 1;
    }
  }

  const modeToPass = {
    confirmation: 1, source: 2, mechanism: 3,
    temporal: 4, counter: 5, narrative: 6,
  };

  let topMode = null;
  let topCount = 0;
  for (const [mode, count] of Object.entries(failureModes)) {
    if (count > topCount) { topMode = mode; topCount = count; }
  }

  if (topMode && modeToPass[topMode]) {
    const pass = DISRUPTOR_PASSES[modeToPass[topMode] - 1];
    return `Pass ${pass.id} -- ${pass.name}\nReason: "${topMode}" was the most common failure mode this week (${topCount} findings)`;
  }

  // Random fallback
  const pass = DISRUPTOR_PASSES[Math.floor(Math.random() * DISRUPTOR_PASSES.length)];
  return `Pass ${pass.id} -- ${pass.name}\nReason: random selection (no dominant failure mode detected)`;
}

// ── Weekly Scan ──────────────────────────────────────────────────────────────

async function runWeeklyScan() {
  console.log('[scout] Starting weekly scan...');
  const missions = readMissions();
  console.log(`[scout] ${missions.length} active missions loaded`);

  const queries = buildSearchQueries(missions);
  const allCandidates = [];
  const newFindings = [];

  for (const query of queries) {
    console.log(`[scout] Searching: "${query.slice(0, 60)}..."`);
    try {
      const results = await webSearch(query, 3);
      for (const result of results) {
        // Skip duplicates by URL
        if (allCandidates.some(c => c.url === result.url)) continue;
        allCandidates.push(result);

        const scored = await scoreCandidate(result);
        if (!scored) continue;

        // Threshold: only keep staged or accepted recommendations
        if (scored.recommended_action === 'discard') {
          console.log(`[scout]   Discarded: ${result.title?.slice(0, 50)}`);
          continue;
        }
        if ((scored.marginal_value || 0) < 0.1) {
          console.log(`[scout]   Low marginal value: ${result.title?.slice(0, 50)}`);
          continue;
        }

        // Check mission match
        const isMissionMatch = missions.some(m => {
          const mLow = m.toLowerCase();
          const title = (scored.technique_title || result.title || '').toLowerCase();
          return title.split(' ').some(w => w.length > 4 && mLow.includes(w));
        });

        const id = generateFindingId();
        const finding = writeFinding(id, scored, isMissionMatch);
        newFindings.push({ ...finding, scored, isMissionMatch });
        console.log(`[scout]   Filed: ${id} (confidence: ${finding.confidence})`);
      }
    } catch (e) {
      console.error(`[scout] Search error for "${query.slice(0, 40)}": ${e.message}`);
    }
  }

  // Generate weather report + disruptor
  const allFindings = readAllFindings();
  const disruptor = selectDisruptor(allFindings);
  const weatherReport = generateWeatherReport(allFindings, readAllCracks(), disruptor);

  // Build digest
  const missionMatches = newFindings.filter(f => f.isMissionMatch);
  const regular = newFindings.filter(f => !f.isMissionMatch);

  let digest = `SCOUT REPORT -- week of ${new Date().toISOString().slice(0, 10)}\n\n`;

  if (missionMatches.length) {
    digest += `MISSION MATCHES (${missionMatches.length})\n`;
    for (const f of missionMatches) {
      digest += `> [${f.confidence}] ${f.scored.technique_title || 'untitled'}\n`;
      digest += `  ${f.scored.mechanism_description || ''}\n`;
      digest += `  Source: ${f.scored.source_community || 'unknown'}\n\n`;
    }
  }

  digest += `NEW CANDIDATES (${regular.length})\n`;
  if (regular.length === 0) {
    digest += '  Nothing passed the filter this week.\n\n';
  } else {
    for (const f of regular) {
      digest += `> [${f.confidence}] ${f.scored.technique_title || 'untitled'}`;
      if (f.scored.reporter_type === 'mechanism-aware') digest += ' [mechanism-aware]';
      digest += `\n  ${f.scored.mechanism_description || ''}\n`;
      digest += `  Source: ${f.scored.source_community || 'unknown'}\n\n`;
    }
  }

  // Revalidation due
  const revalDue = allFindings.filter(f => {
    const rb = f.frontmatter.revalidate_by;
    return rb && new Date(rb) < new Date();
  });
  if (revalDue.length) {
    digest += `REVALIDATION DUE (${revalDue.length})\n`;
    for (const f of revalDue) {
      digest += `> ${f.frontmatter.title || f.filename} -- due ${f.frontmatter.revalidate_by}\n`;
    }
    digest += '\n';
  }

  // Decayed
  const decayed = allFindings.filter(f => f.frontmatter.status === 'decayed');
  if (decayed.length) {
    digest += `DECAYED (${decayed.length})\n`;
    for (const f of decayed) digest += `> ${f.frontmatter.title || f.filename}\n`;
    digest += '\n';
  }

  digest += `THIS WEEK'S PRIMARY DISRUPTOR: ${disruptor}\n`;

  console.log('[scout] Sending digest to Telegram...');
  await sendTelegram(digest);
  console.log(`[scout] Weekly scan complete. ${newFindings.length} new findings from ${allCandidates.length} candidates.`);
  return { newFindings: newFindings.length, candidates: allCandidates.length };
}

// ── On-Demand Probe ──────────────────────────────────────────────────────────

async function runProbe(input) {
  console.log(`[scout] Probe: "${input}"`);

  const results = await webSearch(input, 5);
  if (!results.length) {
    const msg = `Scout probe: "${input}" -- nothing found.`;
    await sendTelegram(msg);
    return msg;
  }

  const missions = readMissions();
  const newFindings = [];

  for (const result of results) {
    const scored = await scoreCandidate(result);
    if (!scored) continue;
    if (scored.recommended_action === 'discard' && (scored.marginal_value || 0) < 0.1) continue;

    const isMissionMatch = missions.some(m => {
      const mLow = m.toLowerCase();
      const title = (scored.technique_title || result.title || '').toLowerCase();
      return title.split(' ').some(w => w.length > 4 && mLow.includes(w));
    });

    const id = generateFindingId();
    const finding = writeFinding(id, scored, isMissionMatch);
    newFindings.push({ ...finding, scored });
  }

  let msg;
  if (newFindings.length === 0) {
    msg = `Scout probe: "${input}"\nSearched ${results.length} sources -- nothing passed the 5-axis filter.`;
  } else {
    msg = `Scout probe: "${input}"\n${newFindings.length} finding(s):\n\n`;
    for (const f of newFindings) {
      msg += `[${f.confidence}] ${f.scored.technique_title || 'untitled'}\n`;
      msg += `  ${f.scored.mechanism_description || ''}\n`;
      msg += `  Source: ${f.scored.source_community || 'unknown'}\n`;
      msg += `  ID: ${f.id}\n\n`;
    }
  }

  await sendTelegram(msg);
  return msg;
}

// ── Metabolism (Confidence Decay) ────────────────────────────────────────────

async function runMetabolism() {
  console.log('[scout] Running confidence decay scan...');
  const findings = readAllFindings();
  const today = new Date();
  const updates = [];

  for (const f of findings) {
    const fm = f.frontmatter;
    if (!fm.id) continue;

    const revalidateBy = fm.revalidate_by ? new Date(fm.revalidate_by) : null;
    const discovered = fm.discovered ? new Date(fm.discovered) : null;

    // Flag if overdue for revalidation
    if (fm.status === 'active' && revalidateBy && revalidateBy < today) {
      let content = readFileSync(f.filepath, 'utf8');
      content = content.replace(/status:\s*active/, 'status: flagged');
      writeFileSync(f.filepath, content);
      updates.push(`Flagged: ${fm.title || fm.id} -- revalidation overdue`);
    }

    // Decay if flagged for 30+ days
    if (fm.status === 'flagged' && revalidateBy) {
      const daysSinceFlag = (today - revalidateBy) / 86400000;
      if (daysSinceFlag > 30) {
        let content = readFileSync(f.filepath, 'utf8');
        content = content.replace(/status:\s*flagged/, 'status: decayed');
        writeFileSync(f.filepath, content);
        updates.push(`Decayed: ${fm.title || fm.id}`);

        // Calculate decay rate
        if (discovered && !fm.decay_rate) {
          const lifespan = (today - discovered) / 86400000;
          const rate = lifespan < 14 ? 'fast' : lifespan < 60 ? 'medium' : lifespan < 180 ? 'slow' : 'stable';
          content = readFileSync(f.filepath, 'utf8');
          content = content.replace(/decay_rate:\s*null/, `decay_rate: ${rate}`);
          writeFileSync(f.filepath, content);
        }
      }
    }

    // Archive if decayed for 30+ days
    if (fm.status === 'decayed' && revalidateBy) {
      const daysSinceDecay = (today - revalidateBy) / 86400000;
      if (daysSinceDecay > 60) {
        discardFinding(fm.id);
        updates.push(`Archived: ${fm.title || fm.id}`);
      }
    }
  }

  // Send summary
  if (updates.length > 0) {
    const msg = `Scout metabolism scan:\n${updates.map(u => `- ${u}`).join('\n')}`;
    await sendTelegram(msg);
    console.log(`[scout] Metabolism: ${updates.length} updates`);
  } else {
    console.log('[scout] Metabolism: no changes needed');
  }

  return updates;
}

// ── Weather Report Reader ────────────────────────────────────────────────────

export function readWeatherReport() {
  const filepath = join(WEATHER_DIR, 'current.txt');
  if (!existsSync(filepath)) return 'No weather report yet. Run /scout or wait for weekly scan.';
  return readFileSync(filepath, 'utf8');
}

// ── Candidates list ──────────────────────────────────────────────────────────

export function getCandidatesList() {
  const findings = readAllFindings();
  const active = findings.filter(f => f.frontmatter.status === 'active' || f.frontmatter.status === 'parked');
  if (active.length === 0) return 'No active candidates in scout-findings/.';
  let msg = `Scout candidates (${active.length}):\n\n`;
  for (const f of active) {
    const fm = f.frontmatter;
    const status = fm.status === 'parked' ? ' [parked]' : '';
    const mission = fm.mission_match ? ' [mission]' : '';
    msg += `[${fm.confidence || '?'}] ${fm.title || fm.id}${status}${mission}\n`;
    msg += `  ID: ${fm.id || f.filename.replace('.md', '')}\n`;
    msg += `  Mechanism: ${fm.mechanism || 'none'}\n`;
    msg += `  Revalidate by: ${fm.revalidate_by || '?'}\n\n`;
  }
  return msg;
}

// ── Read missions for Telegram ───────────────────────────────────────────────

export function readMissionsFormatted() {
  const missions = readMissions();
  if (missions.length === 0) return 'No active Scout missions. Use /missions <text> to set them.';
  return `Active Scout missions:\n${missions.map((m, i) => `${i + 1}. ${m}`).join('\n')}`;
}

// ── CLI Entry ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const mode = args.find(a => a.startsWith('--mode='))?.split('=')[1];
const input = args.find(a => a.startsWith('--input='))?.split('=').slice(1).join('=');

if (mode === 'weekly') {
  runWeeklyScan().then(r => {
    console.log('[scout] Done:', JSON.stringify(r));
    process.exit(0);
  }).catch(e => {
    console.error('[scout] Fatal:', e);
    process.exit(1);
  });
} else if (mode === 'probe') {
  if (!input) { console.error('--input required for probe mode'); process.exit(1); }
  runProbe(input).then(() => process.exit(0)).catch(e => {
    console.error('[scout] Fatal:', e);
    process.exit(1);
  });
} else if (mode === 'metabolism') {
  runMetabolism().then(() => process.exit(0)).catch(e => {
    console.error('[scout] Fatal:', e);
    process.exit(1);
  });
} else if (!mode) {
  // Imported as module — exports are used by telegram-bot.js
} else {
  console.error(`Unknown mode: ${mode}. Use --mode=weekly|probe|metabolism`);
  process.exit(1);
}

export { runWeeklyScan, runProbe, runMetabolism };
