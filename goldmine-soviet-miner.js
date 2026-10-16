// ── Goldmine Soviet Sports Science Miner ──────────────────────────────────────
// Mines CyberLeninka (open access Russian academic papers) and Semantic Scholar
// for Soviet/Russian sports science, training methodology, biomechanics.
//
// CyberLeninka has 3.7M+ papers, all open access. Russian sports science from
// 1950s-1990s is the deepest vein of training methodology ever produced.
//
// Usage: node goldmine-soviet-miner.js [--max N]
// Telegram: /soviet
// PM2: goldmine-soviet (weekly cron)
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME;
const DB_PATH = path.join(__dirname, 'vortex_data', 'archaeologist.db');
const OUTPUT_DIR = path.join(HOME, 'cathedral-vault', '00_Staging', 'archaeologist', 'soviet-science');
const GOLDMINE_DIR = '/Volumes/KINGSTON2/goldmines/downloads/soviet-papers';

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
const OLLAMA_URL = 'http://localhost:11434';

// ── Search Queries ────────────────────────────────────────────────────────────
// Mix of English + transliterated Russian terms for maximum coverage

const SEARCH_QUERIES = [
  // Soviet training methodology
  { q: 'periodization training Matveyev Verkhoshansky', category: 'periodization' },
  { q: 'block periodization athletic training', category: 'periodization' },
  { q: 'conjugate method Simmons Zatsiorsky', category: 'periodization' },
  // Boxing specific
  { q: 'boxing biomechanics punch force kinematics', category: 'boxing' },
  { q: 'boxing training Cuban methodology Sagarra', category: 'boxing' },
  { q: 'combat sport reaction time decision making', category: 'boxing' },
  // Motor control (Bernstein tradition)
  { q: 'Bernstein motor coordination degrees of freedom', category: 'motor_control' },
  { q: 'motor learning contextual interference sport', category: 'motor_control' },
  { q: 'dynamical systems approach motor skill', category: 'motor_control' },
  // Soviet specific researchers
  { q: 'Verkhoshansky supercompensation shock method', category: 'soviet_training' },
  { q: 'Lesgaft physical education classification', category: 'soviet_training' },
  { q: 'Anokhin functional systems theory sport', category: 'soviet_training' },
  { q: 'Krestovnikov sports physiology conditioning', category: 'soviet_training' },
  // Cross-domain Soviet science
  { q: 'biofeedback training performance sport', category: 'biofeedback' },
  { q: 'proprioceptive training balance sport', category: 'proprioception' },
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
    CREATE TABLE IF NOT EXISTS soviet_papers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paper_id TEXT UNIQUE,
      title TEXT,
      authors TEXT,
      year INTEGER,
      abstract TEXT,
      journal TEXT,
      download_url TEXT,
      source TEXT,
      language TEXT DEFAULT 'en',
      search_category TEXT,
      relevance_score REAL,
      key_methodology TEXT,
      cathedral_application TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sov_id ON soviet_papers(paper_id);
    CREATE INDEX IF NOT EXISTS idx_sov_score ON soviet_papers(relevance_score);
  `);
  return db;
}

// ── Semantic Scholar API ──────────────────────────────────────────────────────
// Free, no key needed. Good coverage of translated Russian papers.

async function searchSemanticScholar(query, maxResults = 10) {
  const params = new URLSearchParams({
    query,
    limit: String(maxResults),
    fields: 'title,authors,year,abstract,externalIds,openAccessPdf,venue,publicationTypes'
  });

  try {
    const res = await fetch(`https://api.semanticscholar.org/graph/v1/paper/search?${params}`);
    if (!res.ok) {
      console.error(`Semantic Scholar error: ${res.status}`);
      return [];
    }
    const data = await res.json();
    return (data.data || []).map(p => ({
      id: p.externalIds?.DOI || p.paperId || '',
      title: p.title || '',
      authors: (p.authors || []).map(a => a.name).join(', '),
      year: p.year,
      abstract: p.abstract || '',
      journal: p.venue || '',
      downloadUrl: p.openAccessPdf?.url || '',
      source: 'semantic_scholar'
    }));
  } catch (err) {
    console.error(`Semantic Scholar failed: ${err.message}`);
    return [];
  }
}

// ── CyberLeninka Search ───────────────────────────────────────────────────────
// CyberLeninka doesn't have a formal API but we can scrape search results.
// Since WebFetch may not work, we use Semantic Scholar as primary with
// CyberLeninka URLs constructed for manual follow-up.

function buildCyberLeninkaUrl(query) {
  const encoded = encodeURIComponent(query);
  return `https://cyberleninka.ru/search?q=${encoded}&page=1`;
}

// ── Scoring ───────────────────────────────────────────────────────────────────

const SCORING_SYSTEM = `You evaluate sports science papers for relevance to:
1. A boxing gym with AI coaching (Gym Eyes — pose estimation, punch detection, form analysis)
2. Soviet/Eastern Bloc training methodology that Western coaches never learned
3. Motor learning and skill acquisition for combat sports
4. Forgotten or overlooked training techniques

Prioritize:
- Methodology papers (how to train, not just what was measured)
- Papers from Soviet/Russian/Cuban/Eastern European traditions
- Cross-domain applications (biomechanics applied to coaching)
- Papers that describe techniques still valid but no longer taught

Score 0-10:
- 10: directly applicable training methodology for boxing
- 7-9: strong methodology or technique with clear coaching application
- 4-6: useful background, mechanism explanation
- 1-3: generic sports science
- 0: irrelevant

Respond in this exact format:
SCORE: [number]
METHODOLOGY: [key training method or finding, 2-3 sentences]
APPLICATION: [how a boxing gym could implement this]`;

async function scorePaper(paper) {
  const prompt = `Title: ${paper.title}
Authors: ${paper.authors}
Year: ${paper.year || 'Unknown'}
Journal: ${paper.journal || 'Unknown'}
Abstract: ${(paper.abstract || 'No abstract').slice(0, 1000)}

Evaluate for boxing/coaching relevance and Soviet methodology value.`;

  const response = await callDeepSeek(SCORING_SYSTEM, prompt, 400);

  const scoreMatch = response.match(/SCORE:\s*(\d+(?:\.\d+)?)/i);
  const methMatch = response.match(/METHODOLOGY:\s*(.+?)(?=APPLICATION:|$)/is);
  const appMatch = response.match(/APPLICATION:\s*(.+)/is);

  return {
    score: scoreMatch ? parseFloat(scoreMatch[1]) : 0,
    methodology: methMatch ? methMatch[1].trim() : '',
    application: appMatch ? appMatch[1].trim() : ''
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const MAX_API_CALLS = parseInt(process.argv.find(a => a.startsWith('--max'))?.split('=')[1] || '10');

async function run() {
  console.log(`[Soviet Miner] Starting. Max API calls: ${MAX_API_CALLS}`);

  for (const dir of [OUTPUT_DIR, GOLDMINE_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  const db = getDb();
  const existingIds = new Set(
    db.prepare('SELECT paper_id FROM soviet_papers').all().map(r => r.paper_id)
  );

  let apiCalls = 0;
  let newFinds = 0;
  let highScoreFinds = [];

  // Also build CyberLeninka URLs for manual follow-up
  const cyberLeninkaUrls = [];

  const searches = [...SEARCH_QUERIES].sort(() => Math.random() - 0.5);

  for (const search of searches) {
    if (apiCalls >= MAX_API_CALLS) break;

    console.log(`[Soviet Miner] Searching: "${search.q}" (${search.category})`);

    // Build CyberLeninka URL for manual follow-up
    cyberLeninkaUrls.push({
      query: search.q,
      url: buildCyberLeninkaUrl(search.q),
      category: search.category
    });

    const papers = await searchSemanticScholar(search.q, 10);
    apiCalls++;
    console.log(`[Soviet Miner] Found ${papers.length} papers`);

    await new Promise(r => setTimeout(r, 3000)); // Semantic Scholar rate limit: 100/5min

    for (const paper of papers) {
      if (!paper.id || existingIds.has(paper.id)) continue;
      if (!paper.abstract) continue;

      if (apiCalls >= MAX_API_CALLS) break;

      const { score, methodology, application } = await scorePaper(paper);
      apiCalls++;
      await new Promise(r => setTimeout(r, 1500));

      db.prepare(`INSERT OR IGNORE INTO soviet_papers
        (paper_id, title, authors, year, abstract, journal, download_url,
         source, search_category, relevance_score, key_methodology, cathedral_application)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        paper.id, paper.title, paper.authors, paper.year || 0,
        (paper.abstract || '').slice(0, 5000), paper.journal,
        paper.downloadUrl, paper.source, search.category,
        score, methodology, application
      );
      existingIds.add(paper.id);
      newFinds++;

      if (score >= 6) {
        highScoreFinds.push({
          id: paper.id, title: paper.title, score, methodology, application,
          downloadUrl: paper.downloadUrl
        });

        const slug = paper.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
        const briefPath = path.join(OUTPUT_DIR, `soviet-${slug}.md`);
        fs.writeFileSync(briefPath, `---
technique: "${paper.title}"
domain: soviet_sports_science
status: DISCOVERY
relevance_score: ${score}
date: ${new Date().toISOString().split('T')[0]}
source: ${paper.source}
---

# ${paper.title}

## Details
- Authors: ${paper.authors}
- Year: ${paper.year || 'Unknown'}
- Journal: ${paper.journal || 'Unknown'}
${paper.downloadUrl ? `- PDF: ${paper.downloadUrl}` : ''}

## Key Methodology
${methodology}

## Cathedral Application
${application}

## Abstract
${(paper.abstract || '').slice(0, 2000)}
`);

        // Archaeologist discoveries
        db.prepare(`INSERT OR IGNORE INTO discoveries
          (technique, domain, origin, abandoned_reason, valid_reason,
           cathedral_application, build_estimate, uniqueness, source_trigger)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          paper.title,
          'soviet_sports_science',
          `${paper.authors}, ${paper.year || 'Unknown'}, ${paper.journal || ''}`,
          'Language barrier — never translated or adopted in Western coaching',
          methodology,
          application,
          'Training methodology — implement in curriculum',
          'Soviet/Eastern Bloc tradition unknown to most Western coaches',
          `Goldmine Soviet Miner: "${search.q}"`
        );

        console.log(`  [HIGH] ${paper.title} (score: ${score})`);
      }
    }
  }

  db.prepare(`INSERT INTO scans (trigger_type, trigger_file, domain, discoveries_count)
    VALUES (?, ?, ?, ?)`).run('goldmine-soviet', 'soviet-miner', 'soviet_sports_science', newFinds);

  // Save CyberLeninka URLs for manual follow-up
  const clUrlsPath = path.join(GOLDMINE_DIR, 'cyberleninka-search-urls.json');
  fs.writeFileSync(clUrlsPath, JSON.stringify(cyberLeninkaUrls, null, 2));

  db.close();

  const report = `Soviet Science Miner Complete
API calls: ${apiCalls}
New papers found: ${newFinds}
High-value (6+): ${highScoreFinds.length}
CyberLeninka URLs saved: ${cyberLeninkaUrls.length}

${highScoreFinds.length > 0 ? 'Top finds:\n' + highScoreFinds.map(f =>
  `  (${f.score}/10): ${f.title}\n  ${f.methodology}`
).join('\n\n') : 'No high-value finds this run.'}`;

  console.log(report);
  await sendTelegram(`[Soviet Miner]\n${report}`);

  if (fs.existsSync(path.dirname(GOLDMINE_DIR))) {
    fs.writeFileSync(path.join(GOLDMINE_DIR, `run-${new Date().toISOString().split('T')[0]}.json`),
      JSON.stringify({ date: new Date().toISOString(), apiCalls, newFinds, highScoreFinds }, null, 2));
  }
}

run().catch(err => {
  console.error('[Soviet Miner] Fatal:', err);
  sendTelegram(`[Soviet Miner] FAILED: ${err.message}`);
});
