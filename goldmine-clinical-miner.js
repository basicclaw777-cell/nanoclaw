// ── Goldmine Clinical Trials Miner ────────────────────────────────────────────
// Mines failed/terminated clinical trials from ClinicalTrials.gov API for
// athletic-relevant secondary outcomes. Free API, no registration.
//
// Usage: node goldmine-clinical-miner.js [--max N]
// Telegram: /trials
// PM2: goldmine-trials (weekly cron)
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME;
const DB_PATH = path.join(__dirname, 'vortex_data', 'archaeologist.db');
const OUTPUT_DIR = path.join(HOME, 'cathedral-vault', '00_Staging', 'archaeologist', 'clinical-trials');
const GOLDMINE_DIR = '/Volumes/KINGSTON2/goldmines/downloads/clinical-trials';

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

// ── Search Strategies ─────────────────────────────────────────────────────────
// ClinicalTrials.gov v2 API: https://clinicaltrials.gov/api/v2/studies

const OUTCOME_SEARCHES = [
  // Athletic performance
  { term: 'reaction time', category: 'reaction_time' },
  { term: 'muscle strength', category: 'strength' },
  { term: 'grip strength', category: 'strength' },
  { term: 'balance', category: 'proprioception' },
  { term: 'proprioception', category: 'proprioception' },
  { term: 'fatigue', category: 'recovery' },
  { term: 'muscle recovery', category: 'recovery' },
  // Cognitive
  { term: 'processing speed', category: 'cognition' },
  { term: 'attention', category: 'cognition' },
  { term: 'working memory', category: 'cognition' },
  // Recovery
  { term: 'sleep quality', category: 'sleep' },
  { term: 'inflammation', category: 'inflammation' },
  { term: 'pain threshold', category: 'pain' },
  // Body composition
  { term: 'body composition', category: 'body_comp' },
  { term: 'lean body mass', category: 'body_comp' },
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
    if (data.error) return callOllama(system, prompt, maxTokens);
    return data.choices?.[0]?.message?.content || '';
  } catch { return callOllama(system, prompt, maxTokens); }
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
  } catch { return ''; }
}

// ── Database ──────────────────────────────────────────────────────────────────

function getDb() {
  if (!fs.existsSync(path.dirname(DB_PATH))) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS clinical_trials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nct_id TEXT UNIQUE,
      title TEXT,
      status TEXT,
      conditions TEXT,
      interventions TEXT,
      primary_outcome TEXT,
      secondary_outcomes TEXT,
      phase TEXT,
      enrollment INTEGER,
      start_date TEXT,
      completion_date TEXT,
      search_category TEXT,
      relevance_score REAL,
      athletic_insight TEXT,
      cathedral_application TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ct_nct ON clinical_trials(nct_id);
    CREATE INDEX IF NOT EXISTS idx_ct_score ON clinical_trials(relevance_score);
    CREATE INDEX IF NOT EXISTS idx_ct_cat ON clinical_trials(search_category);
  `);
  return db;
}

// ── ClinicalTrials.gov v2 API ─────────────────────────────────────────────────

async function searchTrials(outcomeTerm, maxResults = 20) {
  // v2 API: search for terminated/completed trials with results, matching outcome term
  const params = new URLSearchParams({
    'query.term': outcomeTerm,
    'filter.overallStatus': 'TERMINATED,COMPLETED',
    'pageSize': String(Math.min(maxResults, 100)),
    'sort': 'EnrollmentCount:desc'
  });

  const url = `https://clinicaltrials.gov/api/v2/studies?${params}`;

  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });

    if (!res.ok) {
      console.error(`ClinicalTrials API error: ${res.status} ${res.statusText}`);
      return [];
    }

    const data = await res.json();
    return data.studies || [];
  } catch (err) {
    console.error(`ClinicalTrials API failed: ${err.message}`);
    return [];
  }
}

// ── Extraction helpers ────────────────────────────────────────────────────────

function extractField(study, ...paths) {
  let obj = study;
  for (const p of paths) {
    obj = obj?.[p];
    if (obj === undefined) return '';
  }
  if (Array.isArray(obj)) return obj.join('; ');
  return String(obj || '');
}

function extractStudyData(study) {
  const proto = study.protocolSection || {};
  const id = proto.identificationModule || {};
  const status = proto.statusModule || {};
  const design = proto.designModule || {};
  const arms = proto.armsInterventionsModule || {};
  const outcomes = proto.outcomesModule || {};
  const conditions = proto.conditionsModule || {};

  return {
    nctId: id.nctId || '',
    title: id.briefTitle || id.officialTitle || '',
    status: status.overallStatus || '',
    whyStopped: status.whyStopped || '',
    conditions: (conditions.conditions || []).join('; '),
    interventions: (arms.interventions || []).map(i => `${i.type}: ${i.name}`).join('; '),
    primaryOutcome: (outcomes.primaryOutcomes || []).map(o => o.measure).join('; '),
    secondaryOutcomes: (outcomes.secondaryOutcomes || []).map(o => o.measure).join('; '),
    phase: (design.phases || []).join('/'),
    enrollment: design.enrollmentInfo?.count || 0,
    startDate: status.startDateStruct?.date || '',
    completionDate: status.completionDateStruct?.date || ''
  };
}

// ── Scoring ───────────────────────────────────────────────────────────────────

const SCORING_SYSTEM = `You evaluate failed or completed clinical trials for insights relevant to:
1. Athletic performance (boxing, strength, endurance, reaction time)
2. Recovery (sleep, inflammation, muscle repair, fatigue)
3. Coaching and member education at a boxing gym (Basic Reflex)
4. Health optimization for active adults

Focus on:
- Secondary outcomes that reveal something useful even though the primary endpoint failed
- Mechanisms that explain WHY something works or doesn't
- Findings that contradict popular supplement/training beliefs
- Repurposing potential for athletic contexts

Score 0-10:
- 10: directly actionable for boxing/athletic performance
- 7-9: strong insight for training, recovery, or member education
- 4-6: interesting mechanism, indirect relevance
- 1-3: minimal athletic relevance
- 0: irrelevant

Respond in this exact format:
SCORE: [number]
INSIGHT: [2-3 sentences on the athletic/coaching insight]
APPLICATION: [1-2 sentences on how a boxing gym could use this]`;

async function scoreTrial(trial) {
  const prompt = `Trial: ${trial.title}
Status: ${trial.status}${trial.whyStopped ? ` (Why stopped: ${trial.whyStopped})` : ''}
Conditions: ${trial.conditions}
Interventions: ${trial.interventions}
Primary Outcome: ${trial.primaryOutcome}
Secondary Outcomes: ${trial.secondaryOutcomes}
Phase: ${trial.phase}
Enrollment: ${trial.enrollment}

Evaluate this trial for athletic/boxing relevance.`;

  const response = await callDeepSeek(SCORING_SYSTEM, prompt, 500);

  const scoreMatch = response.match(/SCORE:\s*(\d+(?:\.\d+)?)/i);
  const insightMatch = response.match(/INSIGHT:\s*(.+?)(?=APPLICATION:|$)/is);
  const appMatch = response.match(/APPLICATION:\s*(.+)/is);

  return {
    score: scoreMatch ? parseFloat(scoreMatch[1]) : 0,
    insight: insightMatch ? insightMatch[1].trim() : '',
    application: appMatch ? appMatch[1].trim() : ''
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const MAX_API_CALLS = parseInt(process.argv.find(a => a.startsWith('--max'))?.split('=')[1] || '10');

async function run() {
  console.log(`[Clinical Miner] Starting. Max API calls: ${MAX_API_CALLS}`);

  for (const dir of [OUTPUT_DIR, GOLDMINE_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  const db = getDb();
  const existingNCTs = new Set(
    db.prepare('SELECT nct_id FROM clinical_trials').all().map(r => r.nct_id)
  );

  let apiCalls = 0;
  let newFinds = 0;
  let highScoreFinds = [];

  // Shuffle searches
  const searches = [...OUTCOME_SEARCHES].sort(() => Math.random() - 0.5);

  for (const search of searches) {
    if (apiCalls >= MAX_API_CALLS) break;

    console.log(`[Clinical Miner] Searching: "${search.term}" (${search.category})`);
    const studies = await searchTrials(search.term, 20);
    apiCalls++;
    console.log(`[Clinical Miner] Found ${studies.length} trials`);

    await new Promise(r => setTimeout(r, 1500));

    for (const study of studies) {
      const trial = extractStudyData(study);
      if (!trial.nctId || existingNCTs.has(trial.nctId)) continue;
      if (!trial.secondaryOutcomes && !trial.whyStopped) continue; // need some data

      if (apiCalls >= MAX_API_CALLS) break;

      const { score, insight, application } = await scoreTrial(trial);
      apiCalls++;
      await new Promise(r => setTimeout(r, 1500));

      // Store
      db.prepare(`INSERT OR IGNORE INTO clinical_trials
        (nct_id, title, status, conditions, interventions, primary_outcome,
         secondary_outcomes, phase, enrollment, start_date, completion_date,
         search_category, relevance_score, athletic_insight, cathedral_application)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        trial.nctId, trial.title, trial.status, trial.conditions,
        trial.interventions, trial.primaryOutcome, trial.secondaryOutcomes,
        trial.phase, trial.enrollment, trial.startDate, trial.completionDate,
        search.category, score, insight, application
      );
      existingNCTs.add(trial.nctId);
      newFinds++;

      if (score >= 6) {
        highScoreFinds.push({ nctId: trial.nctId, title: trial.title, score, insight, application });

        // Vault brief
        const slug = trial.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
        const briefPath = path.join(OUTPUT_DIR, `trial-${trial.nctId}-${slug}.md`);
        fs.writeFileSync(briefPath, `---
technique: "Trial ${trial.nctId}: ${trial.title}"
domain: clinical_trials
status: DISCOVERY
relevance_score: ${score}
date: ${new Date().toISOString().split('T')[0]}
source: ClinicalTrials.gov API
---

# Clinical Trial Finding: ${trial.title}

## Trial Details
- NCT: ${trial.nctId}
- Status: ${trial.status}${trial.whyStopped ? ` (${trial.whyStopped})` : ''}
- Phase: ${trial.phase}
- Enrollment: ${trial.enrollment}
- Dates: ${trial.startDate} to ${trial.completionDate}

## Conditions
${trial.conditions}

## Interventions
${trial.interventions}

## Outcomes
**Primary:** ${trial.primaryOutcome}
**Secondary:** ${trial.secondaryOutcomes}

## Athletic Insight
${insight}

## Cathedral Application
${application}

## Search Category: ${search.category}
`);

        // Also store in Archaeologist discoveries
        db.prepare(`INSERT OR IGNORE INTO discoveries
          (technique, domain, origin, abandoned_reason, valid_reason,
           cathedral_application, build_estimate, uniqueness, source_trigger)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          `${trial.nctId}: ${trial.title}`,
          'clinical_trials',
          `ClinicalTrials.gov ${trial.nctId}, ${trial.phase}, n=${trial.enrollment}`,
          `${trial.status}${trial.whyStopped ? ': ' + trial.whyStopped : ''}`,
          insight,
          application,
          'Research reference — no build needed',
          'Public data, systematically ignored by fitness industry',
          `Goldmine Clinical Miner: "${search.term}"`
        );

        console.log(`  [HIGH] ${trial.nctId}: ${trial.title} (score: ${score})`);
      }
    }
  }

  db.prepare(`INSERT INTO scans (trigger_type, trigger_file, domain, discoveries_count)
    VALUES (?, ?, ?, ?)`).run('goldmine-clinical', 'clinical-miner', 'clinical_trials', newFinds);

  db.close();

  const report = `Clinical Trials Miner Complete
API calls: ${apiCalls}
New trials found: ${newFinds}
High-value (6+): ${highScoreFinds.length}

${highScoreFinds.length > 0 ? 'Top finds:\n' + highScoreFinds.map(f =>
  `  ${f.nctId} (${f.score}/10): ${f.title}\n  ${f.insight}`
).join('\n\n') : 'No high-value finds this run.'}`;

  console.log(report);
  await sendTelegram(`[Clinical Miner]\n${report}`);

  if (fs.existsSync(path.dirname(GOLDMINE_DIR))) {
    const logPath = path.join(GOLDMINE_DIR, `run-${new Date().toISOString().split('T')[0]}.json`);
    fs.writeFileSync(logPath, JSON.stringify({
      date: new Date().toISOString(), apiCalls, newFinds, highScoreFinds
    }, null, 2));
  }
}

run().catch(err => {
  console.error('[Clinical Miner] Fatal:', err);
  sendTelegram(`[Clinical Miner] FAILED: ${err.message}`);
});
