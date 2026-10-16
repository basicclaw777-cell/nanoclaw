// ── Goldmine PhD Dissertation Miner ───────────────────────────────────────────
// Mines open-access PhD dissertations from CORE API (core.ac.uk).
// 280M+ documents, free API with key. Focused on sports science, biomechanics,
// motor learning, coaching methodology.
//
// Usage: node goldmine-phd-miner.js [--max N]
// Telegram: /dissertations
// PM2: goldmine-phds (weekly cron)
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME;
const DB_PATH = path.join(__dirname, 'vortex_data', 'archaeologist.db');
const OUTPUT_DIR = path.join(HOME, 'cathedral-vault', '00_Staging', 'archaeologist', 'dissertations');
const GOLDMINE_DIR = '/Volumes/KINGSTON2/goldmines/downloads/dissertations';

// Load .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
        val = val.slice(1, -1);
      if (!process.env[match[1].trim()]) process.env[match[1].trim()] = val;
    }
  }
}

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const PAUL_CHAT_ID = process.env.PAUL_CHAT_ID ? parseInt(process.env.PAUL_CHAT_ID) : null;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const CORE_API_KEY = process.env.CORE_API_KEY; // Register free at https://core.ac.uk/services/api
const OLLAMA_URL = 'http://localhost:11434';

// ── Search Queries ────────────────────────────────────────────────────────────

const SEARCH_QUERIES = [
  // Boxing / combat sports
  { q: 'boxing biomechanics punch analysis', category: 'boxing' },
  { q: 'boxing training methodology coaching', category: 'boxing' },
  { q: 'combat sport performance analysis', category: 'boxing' },
  { q: 'martial arts motion analysis', category: 'boxing' },
  // Motor learning
  { q: 'motor learning skill acquisition sport', category: 'motor_learning' },
  { q: 'implicit learning athletic performance', category: 'motor_learning' },
  { q: 'variability practice motor skill', category: 'motor_learning' },
  // Biomechanics
  { q: 'upper limb biomechanics sport', category: 'biomechanics' },
  { q: 'human pose estimation deep learning', category: 'computer_vision' },
  { q: 'skeleton tracking action recognition', category: 'computer_vision' },
  // Coaching
  { q: 'coaching expertise diagnostic skill', category: 'coaching' },
  { q: 'feedback timing motor learning', category: 'coaching' },
  // Forgotten techniques
  { q: 'periodization training abandoned methods', category: 'sports_science' },
  { q: 'Soviet sports science training methodology', category: 'soviet_science' },
  { q: 'Cuban boxing training system', category: 'boxing' },
];

// ── Telegram ──────────────────────────────────────────────────────────────────

async function sendTelegram(text) {
  if (!TELEGRAM_TOKEN || !PAUL_CHAT_ID) return;
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, 4000));
    remaining = remaining.slice(4000);
  }
  for (const chunk of chunks) {
    try {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: PAUL_CHAT_ID, text: chunk })
      });
    } catch { /* silent */ }
    if (chunks.length > 1) await new Promise(r => setTimeout(r, 500));
  }
}

// ── LLM ───────────────────────────────────────────────────────────────────────

async function callDeepSeek(system, prompt, maxTokens = 1000) {
  if (!DEEPSEEK_KEY) return callOllama(system, prompt, maxTokens);
  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
        max_tokens: maxTokens, temperature: 0.3
      })
    });
    const data = await res.json();
    if (data.error) return callOllama(system, prompt, maxTokens);
    return data.choices?.[0]?.message?.content || '';
  } catch { return callOllama(system, prompt, maxTokens); }
}

async function callOllama(system, prompt, maxTokens = 1000) {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma3:4b',
        messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
        stream: false, options: { temperature: 0.3, num_predict: maxTokens }
      })
    });
    const data = await res.json();
    return data.message?.content || '';
  } catch { return ''; }
}

// ── Database ──────────────────────────────────────────────────────────────────

function getDb() {
  if (!fs.existsSync(path.dirname(DB_PATH))) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS dissertations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      core_id TEXT UNIQUE,
      title TEXT,
      authors TEXT,
      year INTEGER,
      abstract TEXT,
      subjects TEXT,
      download_url TEXT,
      repository TEXT,
      search_category TEXT,
      relevance_score REAL,
      key_findings TEXT,
      cathedral_application TEXT,
      pdf_downloaded INTEGER DEFAULT 0,
      timestamp TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_diss_core ON dissertations(core_id);
    CREATE INDEX IF NOT EXISTS idx_diss_score ON dissertations(relevance_score);
  `);
  return db;
}

// ── CORE API ──────────────────────────────────────────────────────────────────
// Docs: https://api.core.ac.uk/docs/v3

async function searchCORE(query, maxResults = 10) {
  const headers = { 'Accept': 'application/json' };
  if (CORE_API_KEY) headers['Authorization'] = `Bearer ${CORE_API_KEY}`;

  // Filter for dissertations/theses
  const params = new URLSearchParams({
    q: query,
    limit: String(maxResults),
    // Filter for longer works (dissertations tend to be 50+ pages)
    scroll: 'false'
  });

  const url = `https://api.core.ac.uk/v3/search/works?${params}`;

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.error(`CORE API error: ${res.status} ${res.statusText}`);
      // Fallback: try Semantic Scholar
      return await searchSemanticScholar(query, maxResults);
    }
    const data = await res.json();
    return data.results || [];
  } catch (err) {
    console.error(`CORE API failed: ${err.message}`);
    return await searchSemanticScholar(query, maxResults);
  }
}

// Fallback: Semantic Scholar (free, no key needed for basic search)
async function searchSemanticScholar(query, maxResults = 10) {
  const params = new URLSearchParams({
    query,
    limit: String(maxResults),
    fields: 'title,authors,year,abstract,externalIds,openAccessPdf,publicationTypes'
  });

  try {
    const res = await fetch(`https://api.semanticscholar.org/graph/v1/paper/search?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    // Convert to CORE-like format
    return (data.data || []).map(p => ({
      id: p.externalIds?.DOI || p.paperId || '',
      title: p.title,
      authors: (p.authors || []).map(a => a.name),
      yearPublished: p.year,
      abstract: p.abstract || '',
      downloadUrl: p.openAccessPdf?.url || '',
      sourceFulltextUrls: p.openAccessPdf?.url ? [p.openAccessPdf.url] : [],
      _source: 'semantic_scholar'
    }));
  } catch { return []; }
}

// ── Scoring ───────────────────────────────────────────────────────────────────

const SCORING_SYSTEM = `You evaluate academic papers and dissertations for relevance to:
1. A boxing gym with AI coaching (Gym Eyes — pose estimation, punch detection, form analysis)
2. Motor learning and skill acquisition for combat sports
3. Forgotten or overlooked training methodologies
4. Computer vision applied to athletic movement

Score 0-10:
- 10: directly applicable to boxing coaching or Gym Eyes features
- 7-9: strong relevance to athletic training, biomechanics, or motor learning
- 4-6: useful background knowledge or methodology
- 1-3: tangentially related
- 0: irrelevant

Respond in this exact format:
SCORE: [number]
FINDINGS: [2-3 key findings relevant to boxing/coaching/CV]
APPLICATION: [how a boxing gym with AI could use this]`;

async function scorePaper(paper) {
  const prompt = `Title: ${paper.title}
Authors: ${Array.isArray(paper.authors) ? paper.authors.join(', ') : paper.authors || 'Unknown'}
Year: ${paper.yearPublished || 'Unknown'}
Abstract: ${(paper.abstract || 'No abstract').slice(0, 1000)}

Evaluate this paper for boxing/coaching/CV relevance.`;

  const response = await callDeepSeek(SCORING_SYSTEM, prompt, 400);

  const scoreMatch = response.match(/SCORE:\s*(\d+(?:\.\d+)?)/i);
  const findingsMatch = response.match(/FINDINGS:\s*(.+?)(?=APPLICATION:|$)/is);
  const appMatch = response.match(/APPLICATION:\s*(.+)/is);

  return {
    score: scoreMatch ? parseFloat(scoreMatch[1]) : 0,
    findings: findingsMatch ? findingsMatch[1].trim() : '',
    application: appMatch ? appMatch[1].trim() : ''
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const MAX_API_CALLS = parseInt(process.argv.find(a => a.startsWith('--max'))?.split('=')[1] || '10');

async function run() {
  console.log(`[PhD Miner] Starting. Max API calls: ${MAX_API_CALLS}`);
  if (!CORE_API_KEY) console.log('[PhD Miner] No CORE_API_KEY — using Semantic Scholar fallback');

  for (const dir of [OUTPUT_DIR, GOLDMINE_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  const db = getDb();
  const existingIds = new Set(
    db.prepare('SELECT core_id FROM dissertations').all().map(r => r.core_id)
  );

  let apiCalls = 0;
  let newFinds = 0;
  let highScoreFinds = [];

  const searches = [...SEARCH_QUERIES].sort(() => Math.random() - 0.5);

  for (const search of searches) {
    if (apiCalls >= MAX_API_CALLS) break;

    console.log(`[PhD Miner] Searching: "${search.q}" (${search.category})`);
    const papers = await searchCORE(search.q, 10);
    apiCalls++;
    console.log(`[PhD Miner] Found ${papers.length} papers`);

    await new Promise(r => setTimeout(r, 2000));

    for (const paper of papers) {
      const paperId = String(paper.id || paper.doi || '');
      if (!paperId || existingIds.has(paperId)) continue;
      if (!paper.abstract) continue;

      if (apiCalls >= MAX_API_CALLS) break;

      const { score, findings, application } = await scorePaper(paper);
      apiCalls++;
      await new Promise(r => setTimeout(r, 1500));

      const authors = Array.isArray(paper.authors)
        ? paper.authors.map(a => typeof a === 'string' ? a : a.name || '').join(', ')
        : String(paper.authors || '');

      const downloadUrl = paper.downloadUrl || paper.sourceFulltextUrls?.[0] || '';

      db.prepare(`INSERT OR IGNORE INTO dissertations
        (core_id, title, authors, year, abstract, subjects, download_url,
         repository, search_category, relevance_score, key_findings, cathedral_application)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        paperId, paper.title || '', authors,
        paper.yearPublished || 0, (paper.abstract || '').slice(0, 5000),
        '', downloadUrl, paper._source || 'core',
        search.category, score, findings, application
      );
      existingIds.add(paperId);
      newFinds++;

      if (score >= 6) {
        highScoreFinds.push({ id: paperId, title: paper.title, score, findings, application, downloadUrl });

        const slug = (paper.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
        const briefPath = path.join(OUTPUT_DIR, `paper-${slug}.md`);
        fs.writeFileSync(briefPath, `---
technique: "${paper.title}"
domain: phd_dissertations
status: DISCOVERY
relevance_score: ${score}
date: ${new Date().toISOString().split('T')[0]}
source: ${paper._source || 'CORE API'}
---

# ${paper.title}

## Details
- Authors: ${authors}
- Year: ${paper.yearPublished || 'Unknown'}
- Source: ${paper._source || 'CORE'}
${downloadUrl ? `- PDF: ${downloadUrl}` : '- PDF: Not available'}

## Key Findings
${findings}

## Cathedral Application
${application}

## Abstract
${(paper.abstract || '').slice(0, 2000)}
`);

        // Archaeologist discoveries table
        db.prepare(`INSERT OR IGNORE INTO discoveries
          (technique, domain, origin, abandoned_reason, valid_reason,
           cathedral_application, build_estimate, uniqueness, source_trigger)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          paper.title || '',
          'phd_dissertations',
          `${authors}, ${paper.yearPublished || 'Unknown'}`,
          'Buried in academic repository — never reached practitioners',
          findings,
          application,
          'Research reference',
          'Academic knowledge gap — practitioners never read dissertations',
          `Goldmine PhD Miner: "${search.q}"`
        );

        console.log(`  [HIGH] ${paper.title} (score: ${score})`);
      }
    }
  }

  db.prepare(`INSERT INTO scans (trigger_type, trigger_file, domain, discoveries_count)
    VALUES (?, ?, ?, ?)`).run('goldmine-phds', 'phd-miner', 'phd_dissertations', newFinds);

  db.close();

  const report = `PhD Dissertation Miner Complete
API calls: ${apiCalls}
New papers found: ${newFinds}
High-value (6+): ${highScoreFinds.length}

${highScoreFinds.length > 0 ? 'Top finds:\n' + highScoreFinds.map(f =>
  `  (${f.score}/10): ${f.title}\n  ${f.findings}`
).join('\n\n') : 'No high-value finds this run.'}`;

  console.log(report);
  await sendTelegram(`[PhD Miner]\n${report}`);

  if (fs.existsSync(path.dirname(GOLDMINE_DIR))) {
    fs.writeFileSync(path.join(GOLDMINE_DIR, `run-${new Date().toISOString().split('T')[0]}.json`),
      JSON.stringify({ date: new Date().toISOString(), apiCalls, newFinds, highScoreFinds }, null, 2));
  }
}

run().catch(err => {
  console.error('[PhD Miner] Fatal:', err);
  sendTelegram(`[PhD Miner] FAILED: ${err.message}`);
});
