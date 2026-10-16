// ── Goldmine Patent Miner ─────────────────────────────────────────────────────
// Mines expired patents from PatentsView API (free, no registration needed).
// Deposits to Archaeologist DB + vault. Rate-limited per SI31.
//
// Usage: node goldmine-patent-miner.js [--seed-only] [--max N]
// Telegram: /patents
// PM2: goldmine-patents (weekly cron)
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME;
const DB_PATH = path.join(__dirname, 'vortex_data', 'archaeologist.db');
const OUTPUT_DIR = path.join(HOME, 'cathedral-vault', '00_Staging', 'archaeologist', 'patents');
const GOLDMINE_DIR = '/Volumes/KINGSTON2/goldmines/downloads/patents';

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
const LENS_API_KEY = process.env.LENS_API_KEY;
const OLLAMA_URL = 'http://localhost:11434';

// ── Seed Queries ──────────────────────────────────────────────────────────────

const SEED_QUERIES = [
  // ── GROUP 1: GYM EYES + WEARABLES ─────────────────────────────────────────
  // Boxing & combat
  { q: 'boxing training device force measurement', cpc: 'A63B', group: 'gym_eyes' },
  { q: 'punching bag sensor impact detection', cpc: 'A63B', group: 'gym_eyes' },
  { q: 'combat sport training feedback system', cpc: 'A63B', group: 'gym_eyes' },
  { q: 'impact force glove accelerometer', cpc: 'A63B', group: 'gym_eyes' },
  // Computer vision
  { q: 'human pose estimation real-time video', cpc: 'G06V', group: 'gym_eyes' },
  { q: 'body movement tracking camera sports', cpc: 'G06V', group: 'gym_eyes' },
  { q: 'skeleton detection exercise feedback', cpc: 'G06V', group: 'gym_eyes' },
  { q: 'multi-person tracking persistent identity video', cpc: 'G06T', group: 'gym_eyes' },
  { q: 'silhouette matching human action recognition', cpc: 'G06V', group: 'gym_eyes' },
  { q: 'optical flow motion segmentation sports analysis', cpc: 'G06T', group: 'gym_eyes' },
  // Coaching & feedback
  { q: 'sports coaching automated feedback', cpc: 'G09B', group: 'gym_eyes' },
  { q: 'training form analysis comparison template', cpc: 'G09B', group: 'gym_eyes' },
  { q: 'real-time movement correction coaching', cpc: 'G09B', group: 'gym_eyes' },
  { q: 'adaptive training difficulty progression athlete', cpc: 'G09B', group: 'gym_eyes' },
  // Sensors & wearables
  { q: 'wearable sensor athletic performance', cpc: 'A61B', group: 'gym_eyes' },
  { q: 'inertial measurement unit motion capture', cpc: 'G01P', group: 'gym_eyes' },
  { q: 'piezoelectric force sensor contact sport', cpc: 'G01L', group: 'gym_eyes' },
  { q: 'piezoelectric energy harvesting vibration wearable', cpc: 'H02N', group: 'gym_eyes' },
  { q: 'fatigue detection physiological signal wearable', cpc: 'A61B', group: 'gym_eyes' },
  { q: 'heart rate variability biofeedback training', cpc: 'A61B', group: 'gym_eyes' },
  // Smart glasses / heads-up display
  { q: 'head mounted display augmented reality sport', cpc: 'G02B', group: 'gym_eyes' },
  { q: 'smart glasses real-time information overlay', cpc: 'G02B', group: 'gym_eyes' },
  // Biomechanics
  { q: 'force plate ground reaction measurement gait', cpc: 'A61B', group: 'gym_eyes' },
  { q: 'biomechanical analysis joint angle velocity', cpc: 'A61B', group: 'gym_eyes' },
  { q: 'rehabilitation movement assessment feedback', cpc: 'A61H', group: 'gym_eyes' },
  { q: 'gesture recognition 3D tracking', cpc: 'G06F', group: 'gym_eyes' },
  // Gamification & retention (gym business)
  { q: 'exercise gamification reward progression system', cpc: 'A63B', group: 'gym_eyes' },
  { q: 'fitness competition leaderboard tracking', cpc: 'A63B', group: 'gym_eyes' },

  // ── GROUP 2: AI ARCHITECTURE ───────────────────────────────────────────────
  { q: 'autonomous learning reasoning agent case-based', cpc: 'G06N', group: 'ai_arch' },
  { q: 'knowledge graph inference reasoning engine', cpc: 'G06F', group: 'ai_arch' },
  { q: 'multi-agent coordination distributed decision', cpc: 'G06N', group: 'ai_arch' },
  { q: 'swarm intelligence collective behavior optimization', cpc: 'G06N', group: 'ai_arch' },
  { q: 'belief revision truth maintenance system', cpc: 'G06N', group: 'ai_arch' },
  { q: 'epistemic reasoning uncertainty knowledge base', cpc: 'G06N', group: 'ai_arch' },
  { q: 'case-based reasoning retrieval adaptation learning', cpc: 'G06N', group: 'ai_arch' },
  { q: 'ontology mapping semantic alignment knowledge', cpc: 'G06F', group: 'ai_arch' },
  { q: 'recommendation engine collaborative filtering preference', cpc: 'G06F', group: 'ai_arch' },
  { q: 'adaptive learning spaced repetition tutoring', cpc: 'G09B', group: 'ai_arch' },
  { q: 'pattern recognition time series anomaly detection', cpc: 'G06F', group: 'ai_arch' },
  { q: 'natural language understanding semantic extraction', cpc: 'G06F', group: 'ai_arch' },
  { q: 'conversational agent dialogue state management', cpc: 'G06F', group: 'ai_arch' },
  { q: 'provenance tracking data lineage attribution', cpc: 'G06F', group: 'ai_arch' },

  // ── GROUP 3: CATHEDRAL RESEARCH ────────────────────────────────────────────
  // Vortex / implosion / Schauberger territory
  { q: 'vortex implosion energy water turbine', cpc: 'F03B', group: 'cathedral' },
  { q: 'water vortex treatment structuring device', cpc: 'C02F', group: 'cathedral' },
  { q: 'implosion engine centripetal force generation', cpc: 'F03G', group: 'cathedral' },
  // Frequency / resonance / Rife territory
  { q: 'frequency resonance therapeutic biological tissue', cpc: 'A61N', group: 'cathedral' },
  { q: 'pulsed electromagnetic field therapy device', cpc: 'A61N', group: 'cathedral' },
  { q: 'resonant frequency identification material structure', cpc: 'G01N', group: 'cathedral' },
  { q: 'Schumann resonance detection measurement earth', cpc: 'G01V', group: 'cathedral' },
  // Acoustic / cymatics
  { q: 'acoustic levitation standing wave manipulation', cpc: 'B06B', group: 'cathedral' },
  { q: 'cymatics pattern formation acoustic vibration', cpc: 'G01H', group: 'cathedral' },
  { q: 'ultrasonic standing wave particle manipulation', cpc: 'B06B', group: 'cathedral' },
  { q: 'archaeoacoustic measurement resonance chamber', cpc: 'G01H', group: 'cathedral' },
  // Scalar / electromagnetic
  { q: 'scalar wave longitudinal electromagnetic transmission', cpc: 'H01Q', group: 'cathedral' },
  { q: 'tesla coil resonant wireless power transmission', cpc: 'H02J', group: 'cathedral' },
  { q: 'fractal antenna resonator fibonacci spiral', cpc: 'H01Q', group: 'cathedral' },
  { q: 'electromagnetic shielding measurement field detection', cpc: 'H05K', group: 'cathedral' },
  // Sacred geometry as engineering
  { q: 'golden ratio phi proportion structural design', cpc: 'E04B', group: 'cathedral' },
  { q: 'toroidal magnetic field confinement generator', cpc: 'H01F', group: 'cathedral' },
  // Neuroscience / consciousness
  { q: 'neurofeedback EEG brainwave cognitive training', cpc: 'A61B', group: 'cathedral' },
  { q: 'binaural beat auditory brainwave entrainment', cpc: 'A61M', group: 'cathedral' },
  { q: 'transcranial stimulation cognitive enhancement', cpc: 'A61N', group: 'cathedral' },
  // Suppression-adjacent (real tech that got buried)
  { q: 'cold fusion low energy nuclear reaction', cpc: 'G21B', group: 'cathedral' },
  { q: 'zero point energy vacuum fluctuation extraction', cpc: 'H02N', group: 'cathedral' },
  { q: 'overunity magnetic motor permanent magnet', cpc: 'H02K', group: 'cathedral' },
  { q: 'radiant energy collection atmospheric electricity', cpc: 'H02N', group: 'cathedral' },
  { q: 'brown gas hydrogen oxygen water fuel', cpc: 'C25B', group: 'cathedral' },
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

async function callDeepSeek(system, prompt, maxTokens = 1500) {
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
    if (data.error) {
      console.error(`DeepSeek error: ${data.error.message}`);
      return callOllama(system, prompt, maxTokens);
    }
    return data.choices?.[0]?.message?.content || '';
  } catch (err) {
    console.error('DeepSeek failed:', err.message);
    return callOllama(system, prompt, maxTokens);
  }
}

async function callOllama(system, prompt, maxTokens = 1500) {
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
  } catch (err) {
    console.error('Ollama failed:', err.message);
    return '';
  }
}

// ── Database ──────────────────────────────────────────────────────────────────

function getDb() {
  if (!fs.existsSync(path.dirname(DB_PATH))) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  // Use existing archaeologist discoveries table — patents are domain='expired_patents'
  // Add patent-specific table for raw results
  db.exec(`
    CREATE TABLE IF NOT EXISTS patent_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patent_number TEXT UNIQUE,
      title TEXT,
      abstract TEXT,
      filing_date TEXT,
      grant_date TEXT,
      expiry_date TEXT,
      cpc_codes TEXT,
      assignee TEXT,
      inventors TEXT,
      relevance_score REAL,
      plain_summary TEXT,
      cathedral_application TEXT,
      seed_query TEXT,
      status TEXT DEFAULT 'RAW',
      timestamp TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_pat_number ON patent_results(patent_number);
    CREATE INDEX IF NOT EXISTS idx_pat_score ON patent_results(relevance_score);
  `);
  return db;
}

// ── The Lens Patent API ──────────────────────────────────────────────────────
// Direct patent search via lens.org API. Returns real patents with
// patent numbers, abstracts, CPC codes, filing dates, assignees.

async function searchPatents(query, maxResults = 10, cpcCode = '') {
  if (!LENS_API_KEY) {
    console.error('No LENS_API_KEY set');
    return [];
  }

  // Build query: match title + date range (1995-2010 = expired patent era)
  const must = [
    { match: { title: query } },
    { range: { date_published: { gte: '1995-01-01', lte: '2010-12-31' } } }
  ];
  // Prefer US patents (English, clearer claims)
  if (!cpcCode) must.push({ terms: { jurisdiction: ['US', 'EP', 'WO'] } });

  const body = {
    query: { bool: { must } },
    size: maxResults,
    sort: [{ relevance: 'desc' }]
  };

  try {
    const res = await fetch('https://api.lens.org/patent/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LENS_API_KEY}`
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`Lens API error: ${res.status} — ${err}`);
      return [];
    }

    const data = await res.json();
    return (data.data || []).map(p => {
      const biblio = p.biblio || {};
      const titles = biblio.invention_title || [];
      const enTitle = titles.find(t => t.lang === 'en')?.text || titles[0]?.text || '';
      const applicants = (biblio.parties?.applicants || []).map(a => a.extracted_name?.value).filter(Boolean);
      const inventors = (biblio.parties?.inventors || []).map(i => i.extracted_name?.value).filter(Boolean);
      const cpcCodes = (biblio.classifications_cpc?.classifications || []).map(c => c.symbol).join(', ');
      const filingDate = biblio.application_reference?.date || '';
      const grantDate = biblio.publication_reference?.date || '';
      // Abstract is array of {text, lang} objects — prefer English
      let abstract = '';
      if (Array.isArray(p.abstract)) {
        const enAbs = p.abstract.find(a => a.lang === 'en');
        abstract = enAbs?.text || p.abstract[0]?.text || '';
      } else if (typeof p.abstract === 'string') {
        abstract = p.abstract;
      }

      return {
        patent_number: `${p.jurisdiction || ''}${p.doc_number || ''}`,
        lens_id: p.lens_id || '',
        patent_title: enTitle,
        patent_abstract: abstract,
        patent_date: filingDate,
        grant_date: grantDate,
        assignee: applicants.join('; '),
        inventors: inventors.join(', '),
        cpc_codes: cpcCodes,
        jurisdiction: p.jurisdiction || '',
        _source: 'lens'
      };
    });
  } catch (err) {
    console.error(`Lens API failed: ${err.message}`);
    return [];
  }
}

// ── Scoring ───────────────────────────────────────────────────────────────────

const SCORING_SYSTEM = `You score expired patents for relevance to The Cathedral — a sovereign research and building system. Three domains:

DOMAIN 1 — GYM EYES (Boxing AI):
Computer vision pose estimation, punch detection, coaching feedback, smart glasses overlay, multi-person tracking, wearable sensors, force measurement, biomechanics, gamification for a boxing gym.

DOMAIN 2 — AI ARCHITECTURE:
Autonomous agents with memory and reasoning, knowledge graphs, multi-agent coordination, epistemic reasoning (truth-tracking), case-based learning, recommendation engines, adaptive tutoring, provenance tracking, swarm intelligence. Building sovereign AI that compounds knowledge over time.

DOMAIN 3 — CATHEDRAL RESEARCH:
Suppressed or forgotten technologies. Vortex/implosion energy (Schauberger), frequency therapy (Rife), structured water, scalar/longitudinal waves, acoustic levitation, cymatics, fractal antennas, sacred geometry as engineering, Tesla wireless power, neurofeedback, zero-point energy, cold fusion/LENR. The forensic standard: does the patent describe something that was actually built and measured?

Score 0-10 where:
- 9-10: patent describes a WORKING DEVICE with measurements/specs that could be replicated
- 7-8: highly relevant, clear mechanism described, buildable
- 5-6: relevant concept, partial implementation details
- 3-4: tangentially useful, mostly theoretical
- 1-2: generic, minimal relevance
- 0: irrelevant

Bonus points for: specific measurements, test results in abstract, named materials/components, replication instructions. Penalty for: vague claims, no mechanism described, pure theory.

Respond in this exact format:
SCORE: [number]
SUMMARY: [text — 2-3 sentences, no legal jargon, what does it ACTUALLY DO]
APPLICATION: [text — 1-2 sentences, specific Cathedral/Gym Eyes/AI use]`;

async function scorePatent(patent) {
  const prompt = `Patent: ${patent.patent_title}
Filed: ${patent.patent_date}
Abstract: ${patent.patent_abstract || 'No abstract available'}

Score this patent for relevance.`;

  const response = await callDeepSeek(SCORING_SYSTEM, prompt, 500);

  const scoreMatch = response.match(/SCORE:\s*(\d+(?:\.\d+)?)/i);
  const summaryMatch = response.match(/SUMMARY:\s*(.+?)(?=APPLICATION:|$)/is);
  const appMatch = response.match(/APPLICATION:\s*(.+)/is);

  return {
    score: scoreMatch ? parseFloat(scoreMatch[1]) : 0,
    summary: summaryMatch ? summaryMatch[1].trim() : '',
    application: appMatch ? appMatch[1].trim() : ''
  };
}

// ── Main Mining Loop ──────────────────────────────────────────────────────────

const MAX_API_CALLS_PER_RUN = parseInt(process.argv.find(a => a.startsWith('--max'))?.split('=')[1] || '10');
const SEED_ONLY = process.argv.includes('--seed-only');

async function run() {
  console.log(`[Patent Miner] Starting. Max API calls: ${MAX_API_CALLS_PER_RUN}`);

  // Ensure output dirs
  for (const dir of [OUTPUT_DIR, GOLDMINE_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  const db = getDb();
  const existingPatents = new Set(
    db.prepare('SELECT patent_number FROM patent_results').all().map(r => r.patent_number)
  );

  let apiCalls = 0;
  let newFinds = 0;
  let highScoreFinds = [];

  // Shuffle seeds so each run covers different queries
  const seeds = [...SEED_QUERIES].sort(() => Math.random() - 0.5);

  for (const seed of seeds) {
    if (apiCalls >= MAX_API_CALLS_PER_RUN) {
      console.log(`[Patent Miner] Hit API call limit (${MAX_API_CALLS_PER_RUN}). Stopping.`);
      break;
    }

    console.log(`[Patent Miner] Searching: "${seed.q}"`);
    const patents = await searchPatents(seed.q, 25, seed.cpc);
    apiCalls++;

    console.log(`[Patent Miner] Found ${patents.length} patents for "${seed.q}"`);

    // Rate limit: 1 second between Lens API calls (14 req/min on scholarly plan)
    await new Promise(r => setTimeout(r, 1000));

    for (const pat of patents) {
      const num = pat.patent_number;
      if (!num || existingPatents.has(num)) continue;

      const filingYear = parseInt(pat.patent_date?.split('-')[0] || '0');
      if (filingYear < 1995 || filingYear > 2010) continue;

      // Score with LLM (rate-limited)
      if (apiCalls >= MAX_API_CALLS_PER_RUN) break;

      const { score, summary, application } = await scorePatent(pat);
      apiCalls++;

      // Rate limit
      await new Promise(r => setTimeout(r, 1500));

      // Store
      db.prepare(`INSERT OR IGNORE INTO patent_results
        (patent_number, title, abstract, filing_date, grant_date, cpc_codes,
         assignee, inventors, relevance_score, plain_summary, cathedral_application, seed_query, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        num, pat.patent_title, pat.patent_abstract || '',
        pat.patent_date, pat.grant_date || pat.patent_date, pat.cpc_codes || seed.cpc,
        pat.assignee || '', pat.inventors || '',
        score, summary, application, seed.q,
        score >= 7 ? 'HIGH_VALUE' : score >= 4 ? 'RELEVANT' : 'LOW'
      );
      existingPatents.add(num);
      newFinds++;

      // High scores get vault deposit + Archaeologist DB entry
      if (score >= 7) {
        highScoreFinds.push({ num, title: pat.patent_title, score, summary, application, assignee: pat.assignee });

        // Vault brief
        const slug = pat.patent_title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
        const safeNum = num.replace(/[\/\\:]/g, '_');
        const briefPath = path.join(OUTPUT_DIR, `patent-${safeNum}-${slug}.md`);
        fs.writeFileSync(briefPath, `---
technique: "Patent ${num}: ${pat.patent_title}"
domain: expired_patents
status: DISCOVERY
relevance_score: ${score}
date: ${new Date().toISOString().split('T')[0]}
source: The Lens (lens.org)
lens_id: "${pat.lens_id || ''}"
---

# Expired Patent: ${pat.patent_title}

## Patent Details
- Number: ${num}
- Filed: ${pat.patent_date}
- Published: ${pat.grant_date || 'N/A'}
- Jurisdiction: ${pat.jurisdiction || 'N/A'}
- Status: Expired (20-year term from ${filingYear}, expired ${filingYear + 20})
- CPC: ${pat.cpc_codes || seed.cpc}
- Assignee: ${pat.assignee || 'N/A'}
- Inventors: ${pat.inventors || 'N/A'}

## Plain English Summary
${summary}

## Cathedral Application
${application}

## Original Abstract
${pat.patent_abstract || 'Not available'}

## Seed Query
"${seed.q}"
`);

        // Also store in Archaeologist discoveries table
        db.prepare(`INSERT OR IGNORE INTO discoveries
          (technique, domain, origin, abandoned_reason, valid_reason,
           cathedral_application, build_estimate, uniqueness, source_trigger)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          `Patent ${num}: ${pat.patent_title}`,
          'expired_patents',
          `Patent ${num} (${pat.jurisdiction || 'US'}), filed ${pat.patent_date}, assignee: ${pat.assignee || 'unknown'}`,
          'Patent expired — 20-year term ended',
          summary,
          application,
          'Variable — depends on implementation complexity',
          'Public domain — free to implement, no licensing',
          `Goldmine Patent Miner: "${seed.q}"`
        );

        console.log(`  [HIGH] US${num}: ${pat.patent_title} (score: ${score})`);
      }
    }
  }

  // Log scan
  db.prepare(`INSERT INTO scans (trigger_type, trigger_file, domain, discoveries_count)
    VALUES (?, ?, ?, ?)`).run('goldmine-patents', 'patent-miner', 'expired_patents', newFinds);

  db.close();

  // Report
  const report = `Patent Miner Complete
API calls: ${apiCalls}
New patents found: ${newFinds}
High-value (7+): ${highScoreFinds.length}

${highScoreFinds.length > 0 ? 'Top finds:\n' + highScoreFinds.map(f =>
  `  ${f.num} (${f.score}/10): ${f.title}${f.assignee ? ` [${f.assignee}]` : ''}\n  ${f.summary}`
).join('\n\n') : 'No high-value finds this run.'}`;

  console.log(report);
  await sendTelegram(`[Patent Miner]\n${report}`);

  // Save run log to KINGSTON2
  if (fs.existsSync(path.dirname(GOLDMINE_DIR))) {
    const logPath = path.join(GOLDMINE_DIR, `run-${new Date().toISOString().split('T')[0]}.json`);
    fs.writeFileSync(logPath, JSON.stringify({
      date: new Date().toISOString(),
      apiCalls, newFinds,
      highScoreFinds,
      seedsUsed: seeds.slice(0, apiCalls).map(s => s.q)
    }, null, 2));
  }
}

run().catch(err => {
  console.error('[Patent Miner] Fatal:', err);
  sendTelegram(`[Patent Miner] FAILED: ${err.message}`);
});
