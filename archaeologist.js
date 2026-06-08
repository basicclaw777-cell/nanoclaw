// ── The Archaeologist — Court Member #28 ────────────────────────────────────
// Mines forgotten techniques across domains. Level 3 agent: file watcher +
// weekly cron fallback. Watches vault for new domain additions, session
// harvests mentioning new fields. Weekly full scan as safety net.
//
// Trigger: chokidar on vault staging + session harvests (Level 3)
// Fallback: weekly cron Sunday 5am HKT (Level 2)
// Model: DeepSeek primary, hermes3 fallback
// Output: vault briefs + Cathedral feed + Ensemble Gate validation
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chokidar from 'chokidar';
import Database from 'better-sqlite3';
import { joinLoop } from './swarm-loop.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME;
const VAULT = path.join(HOME, 'cathedral-vault');
const STAGING = path.join(VAULT, '00_Staging');
const HARVESTS = path.join(STAGING, 'cathedral');
const OUTPUT_DIR = path.join(STAGING, 'archaeologist');
const FEED_PATH = path.join(HOME, 'Cathedral', 'cathedral-feed.json');
const SHELF_PATH = path.join(VAULT, '06_Methods', 'the-forgotten-shelf.md');
const DB_PATH = path.join(__dirname, 'vortex_data', 'archaeologist.db');
const ENSEMBLE_GATE = path.join(__dirname, 'ensemble-gate.js');

// Load .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[match[1].trim()]) process.env[match[1].trim()] = val;
    }
  }
}

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const PAUL_CHAT_ID = process.env.PAUL_CHAT_ID ? parseInt(process.env.PAUL_CHAT_ID) : null;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const OLLAMA_URL = 'http://localhost:11434';

// ── Database ────────────────────────────────────────────────────────────────

function getDb() {
  if (!fs.existsSync(path.dirname(DB_PATH))) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS discoveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      technique TEXT NOT NULL,
      domain TEXT,
      origin TEXT,
      abandoned_reason TEXT,
      valid_reason TEXT,
      cathedral_application TEXT,
      build_estimate TEXT,
      uniqueness TEXT,
      ensemble_score REAL,
      ensemble_verdict TEXT,
      status TEXT DEFAULT 'DISCOVERY',
      source_trigger TEXT,
      unverified_citations TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trigger_type TEXT,
      trigger_file TEXT,
      domain TEXT,
      discoveries_count INTEGER DEFAULT 0,
      timestamp TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_disc_domain ON discoveries(domain);
    CREATE INDEX IF NOT EXISTS idx_disc_status ON discoveries(status);
    CREATE INDEX IF NOT EXISTS idx_disc_technique ON discoveries(technique);
  `);
  // Migration: add unverified_citations to pre-existing DBs (CREATE IF NOT EXISTS won't)
  const cols = db.prepare("PRAGMA table_info(discoveries)").all();
  if (!cols.some(c => c.name === 'unverified_citations')) {
    db.exec('ALTER TABLE discoveries ADD COLUMN unverified_citations TEXT');
  }
  return db;
}

// ── Ensure output dir ───────────────────────────────────────────────────────

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ── Telegram ────────────────────────────────────────────────────────────────

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
        body: JSON.stringify({ chat_id: PAUL_CHAT_ID, text: chunk, parse_mode: 'Markdown' })
      });
    } catch {
      // retry without markdown
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: PAUL_CHAT_ID, text: chunk })
      }).catch(() => {});
    }
    if (chunks.length > 1) await new Promise(r => setTimeout(r, 500));
  }
}

// ── LLM Calls ───────────────────────────────────────────────────────────────

async function callDeepSeek(system, prompt, maxTokens = 2000) {
  if (!DEEPSEEK_KEY) return callOllama(system, prompt, maxTokens);
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
        temperature: 0.7
      })
    });
    const data = await res.json();
    if (data.error) {
      console.error(`DeepSeek API error: ${data.error.message}. Falling back to Ollama.`);
      return callOllama(system, prompt, maxTokens);
    }
    return data.choices?.[0]?.message?.content || '';
  } catch (err) {
    console.error('DeepSeek failed, falling back to Ollama:', err.message);
    return callOllama(system, prompt, maxTokens);
  }
}

async function callOllama(system, prompt, maxTokens = 2000) {
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
        options: { temperature: 0.7, num_predict: maxTokens }
      })
    });
    const data = await res.json();
    return data.message?.content || '';
  } catch (err) {
    console.error('Ollama failed:', err.message);
    return '';
  }
}

// ── Ensemble Gate ───────────────────────────────────────────────────────────

async function runEnsembleGate(claim) {
  try {
    const { runEnsemble } = await import(ENSEMBLE_GATE);
    return await runEnsemble(claim);
  } catch (err) {
    console.error('Ensemble Gate unavailable:', err.message);
    return { divergence_score: null, verdict: 'GATE_UNAVAILABLE' };
  }
}

// ── Cathedral Feed ──────────────────────────────────────────────────────────

function postToFeed(message) {
  try {
    let feed = [];
    if (fs.existsSync(FEED_PATH)) {
      feed = JSON.parse(fs.readFileSync(FEED_PATH, 'utf8'));
    }
    feed.push({
      agent: 'The Archaeologist',
      courtMember: 28,
      content: message,
      timestamp: new Date().toISOString(),
      type: 'discovery'
    });
    // Keep last 500 entries
    if (feed.length > 500) feed = feed.slice(-500);
    fs.writeFileSync(FEED_PATH, JSON.stringify(feed, null, 2));
  } catch (err) {
    console.error('Feed post failed:', err.message);
  }
}

// ── Domain Detection ────────────────────────────────────────────────────────

const DOMAIN_KEYWORDS = {
  'ai_ml': ['machine learning', 'neural network', 'deep learning', 'transformer', 'LLM', 'model training', 'computer science', 'algorithm'],
  'computer_vision': ['computer vision', 'image recognition', 'object detection', 'pose estimation', 'YOLO', 'CNN', 'image processing'],
  'signal_processing': ['signal processing', 'DSP', 'frequency analysis', 'fourier', 'wavelet', 'time series', 'spectral'],
  'sports_science': ['sports science', 'training', 'periodisation', 'motor learning', 'biomechanics', 'coaching', 'athletic', 'exercise'],
  'knowledge_management': ['knowledge management', 'information architecture', 'taxonomy', 'ontology', 'cataloguing', 'indexing'],
  'audio_acoustics': ['audio', 'acoustics', 'sound', 'speech', 'music', 'frequency', 'resonance'],
  'finance_trading': ['trading', 'finance', 'market', 'investment', 'portfolio', 'risk', 'quant', 'analysis'],
  'coaching_psychology': ['coaching', 'psychology', 'diagnostic', 'counselling', 'therapy', 'behavior', 'cognitive'],
  'researcher_suppression': ['scientist death', 'researcher disappearance', 'suppressed research', 'classified technology', 'anti-gravity', 'exotic propulsion', 'directed energy weapon', 'DEW', 'whistleblower', 'patent seizure', 'secrecy order', 'invention secrecy act', 'black budget', 'SAP', 'USAP'],
  'negative_results': ['null result', 'failed experiment', 'negative finding', 'disproven', 'replication failure', 'file drawer', 'non-significant', 'drug repurposing', 'off-label', 'abandoned trial', 'phase II failure', 'retracted'],
  'cognitive_error': ['cognitive bias', 'heuristic', 'decision error', 'bounded rationality', 'framing effect', 'anchoring', 'base rate neglect', 'availability heuristic', 'confirmation bias', 'prospect theory'],
  // Universal-Key seams (2026-06-08): archives AI now unlocks — where the next Conrad Haas sits unread
  'forgotten_manuscripts': ['manuscript', 'archive', 'handwritten treatise', 'codex', 'notebook', 'marginalia', 'unread document', 'arsenal master', 'Conrad Haas', 'HTR', 'palaeography'],
  'undeciphered_scripts': ['undeciphered', 'Linear A', 'Indus script', 'Rongorongo', 'proto-Elamite', 'Cypro-Minoan', 'lost language', 'decipherment', 'unread writing system'],
  'lost_libraries': ['Herculaneum', 'carbonized scroll', 'Vesuvius', 'lost library', 'destroyed archive', 'burned manuscript', 'virtual unrolling', 'recovered text'],
  'pre_digital_science': ['pre-digital journal', 'paper-only', 'un-digitized', 'pre-1990 research', 'forgotten journal', 'OCR archive', 'lost paper'],
  'oral_knowledge': ['oral history', 'untranscribed', 'audio archive', 'indigenous knowledge', 'master recording', 'field recording', 'apprentice knowledge', 'practitioner tape']
};

// ── Swarm Loop ────────────────────────────────────────────────────────────────
const ALL_DOMAINS = Object.keys(DOMAIN_KEYWORDS);
const loop = joinLoop('archaeologist', ALL_DOMAINS);

function detectDomains(text) {
  const lower = text.toLowerCase();
  const detected = [];
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    const hits = keywords.filter(k => lower.includes(k.toLowerCase()));
    if (hits.length >= 2) detected.push(domain);
  }
  return detected;
}

// ── Core Research Function ──────────────────────────────────────────────────

const ARCHAEOLOGIST_SYSTEM = fs.readFileSync(
  path.join(HOME, 'Cathedral', 'agents', 'contexts', 'archaeologist.md'), 'utf8'
);

async function researchDomain(domain, triggerContext = '') {
  const domainNames = {
    ai_ml: 'AI and Machine Learning',
    computer_vision: 'Computer Vision',
    signal_processing: 'Signal Processing',
    sports_science: 'Sports Science and Athletic Training',
    knowledge_management: 'Knowledge Management',
    audio_acoustics: 'Audio and Acoustics',
    finance_trading: 'Finance and Trading',
    coaching_psychology: 'Coaching and Psychology',
    researcher_suppression: 'Researcher Suppression and Classified Technology Seizure',
    negative_results: 'Negative Results, Failed Experiments, and Null Findings (Swanson-style undiscovered public knowledge)',
    cognitive_error: 'Cognitive Biases, Decision Errors, and Systematic Human Error Patterns',
    forgotten_manuscripts: 'Forgotten Manuscripts and Unread Archive Knowledge (the Conrad Haas vein — handwritten treatises AI handwriting-recognition can now read at scale)',
    undeciphered_scripts: 'Undeciphered Scripts and Lost Languages (AI-assisted decipherment)',
    lost_libraries: 'Lost and Damaged Libraries (Herculaneum/Vesuvius carbonized scrolls, virtually unrolled and AI-read)',
    pre_digital_science: 'Pre-Digital Paper Science (pre-1990 journals never digitised, now OCR-accessible)',
    oral_knowledge: 'Oral, Indigenous, and Untranscribed Audio Knowledge (mass AI transcription)'
  };

  const domainName = domainNames[domain] || domain;
  const db = getDb();

  // Check what we've already found to avoid duplicates
  const existing = db.prepare('SELECT technique FROM discoveries WHERE domain = ?').all(domain);
  const existingNames = existing.map(r => r.technique.toLowerCase());

  const prompt = `In the field of ${domainName}, what powerful techniques, methods, or approaches were abandoned or overlooked when newer trends took over?

${triggerContext ? `Context that triggered this search:\n${triggerContext}\n\n` : ''}
I need 3-5 specific techniques that are:
1. VALID — backed by peer-reviewed research, mathematical proof, or replicated experiments
2. FORGOTTEN — buried by newer trends, not because they failed
3. BUILDABLE — could be implemented with Node.js, Python, or local AI models on a Mac Mini
4. NOT already in common use

${existingNames.length > 0 ? `Already discovered (skip these): ${existingNames.join(', ')}` : ''}

For each technique, provide:
TECHNIQUE: [exact name]
ORIGIN: [researcher/paper/year]
DOMAIN: ${domain}
ABANDONED_BECAUSE: [what replaced it]
STILL_VALID_BECAUSE: [specific evidence]
CATHEDRAL_APPLICATION: [how it could be used in a sovereign AI research system with boxing gym, trading experiment, knowledge vault, visual production, and coaching]
BUILD_ESTIMATE: [hours or days]
UNIQUENESS: [is anyone else using this? why not?]

Be specific. Name real researchers, real papers, real techniques. No hand-waving.`;

  console.log(`[Archaeologist] Researching ${domainName}...`);
  const response = await callDeepSeek(ARCHAEOLOGIST_SYSTEM, prompt, 3000);

  // RAW DEBUG — see what DeepSeek actually returns
  console.log(`[Archaeologist] RAW RESPONSE (first 2000 chars):\n${response.slice(0, 2000)}`);
  console.log(`[Archaeologist] Response length: ${response.length}`);

  if (!response) {
    console.log(`[Archaeologist] No response for ${domainName}`);
    return [];
  }

  // Parse discoveries
  const discoveries = parseDiscoveries(response, domain);
  console.log(`[Archaeologist] Parsed ${discoveries.length} discoveries`);
  let validatedCount = 0;

  // Check for --no-ensemble flag or skip ensemble when system is low on memory
  const skipEnsemble = process.argv.includes('--no-ensemble') || process.env.ARCHAEOLOGIST_SKIP_ENSEMBLE === '1';
  // Opt-in citation verification (Semantic Scholar). OFF by default so the
  // rate-limited watcher never makes extra network calls. Tagging always runs.
  const verifyCitations = process.argv.includes('--verify') || process.env.ARCHAEOLOGIST_VERIFY === '1';

  for (const disc of discoveries) {
    // Skip if already exists
    if (existingNames.includes(disc.technique.toLowerCase())) continue;

    // Citation honesty: tag fabricated-looking citations [UNVERIFIED] inline
    // (or [VERIFIED: src] with --verify) and record unverified list on the record.
    await tagDiscoveryCitations(disc, { verify: verifyCitations });

    if (!skipEnsemble) {
      // Run through Ensemble Gate
      try {
        const claim = `The technique "${disc.technique}" from ${disc.origin} is a valid, peer-reviewed method in ${domainName} that was abandoned when ${disc.abandoned_reason}. It remains valid because: ${disc.valid_reason}`;
        const gateResult = await runEnsembleGate(claim);
        disc.ensemble_score = gateResult.divergence_score;
        disc.ensemble_verdict = gateResult.verdict || 'PENDING';
        // Swarm: report gate pass/fail so bandit learns which domains yield validated discoveries
        const passedGate = disc.ensemble_score !== null && disc.ensemble_score > 0.5;
        loop.reportOutcome(domain, passedGate);
      } catch (err) {
        console.log(`[Archaeologist] Ensemble gate failed for ${disc.technique}: ${err.message}. Filing as PENDING.`);
        disc.ensemble_score = null;
        disc.ensemble_verdict = 'PENDING';
      }
    } else {
      console.log(`[Archaeologist] Skipping ensemble gate (--no-ensemble). Filing ${disc.technique} as PENDING.`);
    }

    // Store in DB
    db.prepare(`INSERT INTO discoveries (technique, domain, origin, abandoned_reason, valid_reason,
      cathedral_application, build_estimate, uniqueness, ensemble_score, ensemble_verdict, source_trigger,
      unverified_citations)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      disc.technique, disc.domain, disc.origin, disc.abandoned_reason, disc.valid_reason,
      disc.cathedral_application, disc.build_estimate, disc.uniqueness,
      disc.ensemble_score, disc.ensemble_verdict, triggerContext.slice(0, 200),
      JSON.stringify(disc.unverified_citations || [])
    );

    // File brief to vault — truncate filename to 80 chars max
    const slug = disc.technique.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
    const briefPath = path.join(OUTPUT_DIR, `${slug}.md`);
    const briefContent = `---
technique: "${disc.technique}"
domain: ${disc.domain}
status: DISCOVERY
ensemble_score: ${disc.ensemble_score ?? 'pending'}
ensemble_verdict: ${disc.ensemble_verdict}
unverified_citations: ${(disc.unverified_citations || []).length}
date: ${new Date().toISOString().split('T')[0]}
---

# ${disc.technique}
${(disc.unverified_citations || []).length > 0 ? `
> ⚠️ **Unverified citations** — DO NOT build on these without checking the source:
${disc.unverified_citations.map(c => `> - ${c} \`[UNVERIFIED]\``).join('\n')}
` : ''}
## Origin
${disc.origin}

## Abandoned Because
${disc.abandoned_reason}

## Still Valid Because
${disc.valid_reason}

## Cathedral Application
${disc.cathedral_application}

## Build Estimate
${disc.build_estimate}

## Uniqueness
${disc.uniqueness}

## Ensemble Gate
- Score: ${disc.ensemble_score ?? 'not run'}
- Verdict: ${disc.ensemble_verdict}
`;
    fs.writeFileSync(briefPath, briefContent);

    // Post to Cathedral feed
    postToFeed(`[DISCOVERY] ${disc.technique} (${disc.domain}) — ${disc.valid_reason.slice(0, 100)}... Ensemble: ${disc.ensemble_verdict}`);

    validatedCount++;
  }

  // Swarm: report discovery yield (confidence = normalized count, capped at 1.0)
  if (validatedCount > 0) {
    loop.reportDiscovery(domain, Math.min(validatedCount / 5, 1.0));
  }

  // Log scan
  db.prepare('INSERT INTO scans (trigger_type, trigger_file, domain, discoveries_count) VALUES (?, ?, ?, ?)').run(
    triggerContext ? 'watcher' : 'scheduled', triggerContext.slice(0, 200), domain, validatedCount
  );

  db.close();
  return discoveries.filter(d => !existingNames.includes(d.technique.toLowerCase()));
}

// ── Citation Honesty ──────────────────────────────────────────────────────────
// DeepSeek invents researchers, papers, and "Protocols" with confidence. A
// training protocol built on a fabricated study collapses Cathedral credibility.
// Every citation-like claim gets detected and tagged [UNVERIFIED] inline by
// default. Optional opt-in verification (--verify) checks against Semantic
// Scholar (free, no key) and upgrades confirmed citations to [VERIFIED: <source>].
// Verification NEVER runs inside the rate-limited watcher — opt-in only.

// Detect citation-like spans: "Author 1989", "Smith & Jones 2002", "et al.",
// "X Protocol/Method/Technique/Study", "Dr. Name". Returns deduped list of
// { text, type } where text is the exact substring to tag.
function extractCitations(text) {
  if (!text || typeof text !== 'string') return [];
  const found = new Map(); // text -> type (first match wins)
  const add = (raw, type) => {
    const t = raw.trim().replace(/[.,;:]+$/, '');
    if (t.length < 3) return;
    if (!found.has(t)) found.set(t, type);
  };

  // Author(s) + year: "Kuznetsov 1989", "Rosenberger & Lachin, 2002", "Minsky (1986)"
  const authorYear = /\b([A-Z][a-zà-ÿ]+(?:\s*(?:&|and|,)\s*[A-Z][a-zà-ÿ]+)*)\s*[,(]?\s*(1[89]\d{2}|20\d{2})\)?/g;
  for (const m of text.matchAll(authorYear)) add(m[0], 'author_year');

  // "et al." constructions: "Garvican-Lewis et al. 2015"
  const etAl = /\b[A-Z][a-zà-ÿ-]+\s+et\s+al\.?(?:\s*,?\s*(?:1[89]\d{2}|20\d{2}))?/g;
  for (const m of text.matchAll(etAl)) add(m[0], 'et_al');

  // Named Protocol/Method/Technique/Study/Model/Effect: "Skorikov Protocol",
  // "Snap-Reset Protocol", "Dynamic Baseline Protocol" (leading token may be hyphenated)
  const namedThing = /\b((?:[A-Z][A-Za-zà-ÿ-]+\s+){1,3}(?:Protocol|Method|Technique|Study|Model|Effect|Principle|Law|Theorem|Equation))\b/g;
  for (const m of text.matchAll(namedThing)) add(m[1], 'named_method');

  // Titled researcher: "Dr. Elena Vos", "Professor Bernstein"
  const titled = /\b(?:Dr\.?|Prof(?:essor)?\.?)\s+[A-Z][a-zà-ÿ-]+(?:\s+[A-Z][a-zà-ÿ-]+)?/g;
  for (const m of text.matchAll(titled)) add(m[0], 'titled_person');

  // Named institutes/labs: "Soviet Boxing Science Institute"
  const institute = /\b((?:[A-Z][a-zà-ÿ-]+\s+){1,4}(?:Institute|Laboratory|University|Academy))\b/g;
  for (const m of text.matchAll(institute)) add(m[1], 'institution');

  return Array.from(found, ([text, type]) => ({ text, type }));
}

// Verify a single citation against Semantic Scholar (free, keyless).
// Returns { verified: bool, source: string|null }. Opt-in only.
async function verifyCitation(citation) {
  try {
    const params = new URLSearchParams({ query: citation.text, limit: '3', fields: 'title,authors,year,externalIds' });
    const res = await fetch(`https://api.semanticscholar.org/graph/v1/paper/search?${params}`);
    if (!res.ok) return { verified: false, source: null };
    const data = await res.json();
    const hits = data.data || [];
    if (hits.length === 0) return { verified: false, source: null };
    // Confirm an author surname or named-method token actually appears in a result
    const tokens = citation.text.split(/[\s,&.()]+/).filter(w => w.length > 3 && /^[A-Z]/.test(w));
    for (const p of hits) {
      const hay = `${p.title || ''} ${(p.authors || []).map(a => a.name).join(' ')}`.toLowerCase();
      if (tokens.some(t => hay.includes(t.toLowerCase()))) {
        const doi = p.externalIds?.DOI;
        const src = doi ? `Semantic Scholar DOI:${doi}` : `Semantic Scholar: ${(p.title || '').slice(0, 60)}`;
        return { verified: true, source: src };
      }
    }
    return { verified: false, source: null };
  } catch {
    return { verified: false, source: null };
  }
}

// Tag citation spans inline. verifications: Map<citationText, {verified, source}>.
// Untracked / unverified spans get [UNVERIFIED]; confirmed get [VERIFIED: src].
// Idempotent: skips spans already followed by a tag.
function tagCitations(text, citations, verifications) {
  if (!text) return text;
  let out = text;
  // Longest first so "Rosenberger & Lachin 2002" tags before "Lachin 2002"
  const sorted = [...citations].sort((a, b) => b.text.length - a.text.length);
  for (const c of sorted) {
    const v = verifications && verifications.get(c.text);
    const tag = v && v.verified ? ` [VERIFIED: ${v.source}]` : ' [UNVERIFIED]';
    // Escape regex metachars, match the span when NOT already followed by a tag
    const esc = c.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(${esc})(?!\\s*\\[(?:UNVERIFIED|VERIFIED))`, 'g');
    out = out.replace(re, `$1${tag}`);
  }
  return out;
}

// Process one discovery: tag origin + valid_reason fields, attach citation list.
// verify=true performs opt-in Semantic Scholar checks (slow, opt-in only).
async function tagDiscoveryCitations(disc, { verify = false } = {}) {
  const fields = ['origin', 'valid_reason', 'cathedral_application', 'abandoned_reason'];
  const all = new Map();
  for (const f of fields) {
    for (const c of extractCitations(disc[f] || '')) {
      if (!all.has(c.text)) all.set(c.text, c);
    }
  }
  const citations = Array.from(all.values());

  const verifications = new Map();
  if (verify) {
    for (const c of citations) {
      verifications.set(c.text, await verifyCitation(c));
      await new Promise(r => setTimeout(r, 350)); // gentle on the free endpoint
    }
  }

  for (const f of fields) {
    if (disc[f]) disc[f] = tagCitations(disc[f], citations, verifications);
  }

  disc.unverified_citations = citations
    .filter(c => !(verifications.get(c.text)?.verified))
    .map(c => c.text);
  return disc;
}

function parseDiscoveries(text, defaultDomain) {
  const discoveries = [];

  // Strip markdown formatting
  let cleaned = text.replace(/\*\*/g, '').replace(/\*/g, '');
  cleaned = cleaned.replace(/^#{1,4}\s*/gm, '');

  // Known field keys in order — used for boundary detection
  const FIELD_KEYS = [
    'TECHNIQUE', 'ORIGIN', 'DOMAIN',
    'ABANDONED BECAUSE', 'ABANDONED_BECAUSE',
    'STILL VALID BECAUSE', 'STILL_VALID_BECAUSE',
    'CATHEDRAL APPLICATION', 'CATHEDRAL_APPLICATION',
    'BUILD ESTIMATE', 'BUILD_ESTIMATE',
    'UNIQUENESS', 'ENSEMBLE GATE', 'ENSEMBLE_GATE', 'STATUS'
  ];

  // Build a regex that matches any known field key at start of line (with optional numbering)
  const keyPatterns = FIELD_KEYS.map(k => k.replace(/ /g, '[_ ]')).join('|');
  const fieldBoundary = new RegExp(`^\\s*(?:${keyPatterns})\\s*:`, 'im');

  // Normalize TECHNIQUE #N: or TECHNIQUE 1: etc
  cleaned = cleaned.replace(/TECHNIQUE\s*[#]?\d+\s*:/gi, 'TECHNIQUE:');

  // Remove "## DISCOVERY N:" headings entirely — they duplicate the TECHNIQUE: line below them
  cleaned = cleaned.replace(/^DISCOVERY\s*[#]?\d+\s*[:\-—]\s*[^\n]*/gim, '');

  // Split into technique blocks
  const blocks = cleaned.split(/(?=^[ \t]*TECHNIQUE\s*:)/im).filter(b => /TECHNIQUE\s*:/i.test(b));

  for (const block of blocks) {
    // Extract fields by finding each key and capturing until the next key
    const extractField = (key) => {
      const keyPat = key.replace(/_/g, '[_ ]');
      const startRe = new RegExp(`(?:^|\\n)\\s*${keyPat}\\s*:\\s*`, 'i');
      const startMatch = block.match(startRe);
      if (!startMatch) return '';

      const startIdx = startMatch.index + startMatch[0].length;
      const rest = block.slice(startIdx);

      // Find where the next field key starts
      const nextKeyMatch = rest.match(fieldBoundary);
      const value = nextKeyMatch ? rest.slice(0, nextKeyMatch.index) : rest;

      // Clean: collapse whitespace, strip trailing dashes/separators
      return value.replace(/\n+/g, ' ').replace(/\s+/g, ' ').replace(/\s*---\s*$/, '').trim();
    };

    let technique = extractField('TECHNIQUE');
    if (!technique || technique.length < 3) continue;
    // Cap technique name — DeepSeek sometimes swallows entire paragraphs into this field
    // Take up to first sentence boundary or 150 chars, whichever is shorter
    const sentenceEnd = technique.search(/[.!?]\s/);
    if (sentenceEnd > 0 && sentenceEnd < 150) {
      technique = technique.slice(0, sentenceEnd);
    } else if (technique.length > 150) {
      technique = technique.slice(0, 150).replace(/\s\S*$/, '');
    }

    // Domain: take first word only (avoid paragraph swallow)
    const rawDomain = extractField('DOMAIN');
    const domain = rawDomain ? rawDomain.split(/[\s,;—]/)[0].trim() : defaultDomain;

    discoveries.push({
      technique,
      domain: domain || defaultDomain,
      origin: extractField('ORIGIN'),
      abandoned_reason: extractField('ABANDONED_BECAUSE') || extractField('ABANDONED BECAUSE'),
      valid_reason: extractField('STILL_VALID_BECAUSE') || extractField('STILL VALID BECAUSE'),
      cathedral_application: extractField('CATHEDRAL_APPLICATION') || extractField('CATHEDRAL APPLICATION'),
      build_estimate: extractField('BUILD_ESTIMATE') || extractField('BUILD ESTIMATE'),
      uniqueness: extractField('UNIQUENESS'),
      ensemble_score: null,
      ensemble_verdict: 'PENDING'
    });
  }

  return discoveries;
}

// ── File Watcher (Level 3) ──────────────────────────────────────────────────

const WATCH_PATHS = [
  path.join(HARVESTS, '*.md'),           // session harvests
  path.join(STAGING, '**', '*.md'),      // new staging entries (new domains)
];

// Debounce: don't re-scan same file within 30 min
const recentTriggers = new Map();
// Rate limiter: max 10 API calls per hour (prevents $20 burn on batch triggers)
let apiCallsThisHour = 0;
let hourResetTime = Date.now() + 3600000;
const MAX_CALLS_PER_HOUR = 10;

function checkRateLimit() {
  const now = Date.now();
  if (now > hourResetTime) {
    apiCallsThisHour = 0;
    hourResetTime = now + 3600000;
  }
  if (apiCallsThisHour >= MAX_CALLS_PER_HOUR) {
    console.log(`[Archaeologist] Rate limit hit (${MAX_CALLS_PER_HOUR}/hr). Skipping until ${new Date(hourResetTime).toISOString()}`);
    return false;
  }
  apiCallsThisHour++;
  return true;
}

function shouldProcess(filePath) {
  const now = Date.now();
  const last = recentTriggers.get(filePath);
  if (last && now - last < 30 * 60 * 1000) return false;
  recentTriggers.set(filePath, now);
  // Clean old entries
  for (const [k, v] of recentTriggers) {
    if (now - v > 60 * 60 * 1000) recentTriggers.delete(k);
  }
  return true;
}

async function onFileChange(filePath) {
  // Prevent cascade: ignore our own output files
  if (filePath.includes('/archaeologist/') || filePath.includes('\\archaeologist\\')) return;
  if (!shouldProcess(filePath)) return;

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const domains = detectDomains(content);

    if (domains.length === 0) return; // No relevant domain detected

    // Rate limit check BEFORE making any API calls
    if (!checkRateLimit()) return;

    // Bandit picks domain — file content narrows candidates, bandit selects best
    const pick = loop.choose();
    const banditDomain = domains.includes(pick.action) ? pick.action : domains[0];

    console.log(`[Archaeologist] Triggered by ${path.basename(filePath)} — bandit chose: ${banditDomain} (sample: ${pick.sample?.toFixed?.(3) || pick.sample})`);

    const context = `Triggered by: ${path.basename(filePath)}\nFirst 500 chars: ${content.slice(0, 500)}`;
    const discoveries = await researchDomain(banditDomain, context);
    const totalDiscoveries = discoveries.length;

    if (totalDiscoveries > 0) {
      await sendTelegram(`🏺 *The Archaeologist* found ${totalDiscoveries} forgotten technique(s)\nTriggered by: \`${path.basename(filePath)}\`\nDomains: ${domains.join(', ')}\n\nCheck /archaeologist for details`);
    }
  } catch (err) {
    console.error(`[Archaeologist] Error processing ${filePath}:`, err.message);
  }
}

// ── Weekly Full Scan (Level 2 fallback) ─────────────────────────────────────

async function weeklyFullScan() {
  console.log('[Archaeologist] Starting weekly full scan...');
  const allDomains = Object.keys(DOMAIN_KEYWORDS);
  let totalDiscoveries = 0;

  for (const domain of allDomains) {
    try {
      const discoveries = await researchDomain(domain, 'Weekly scheduled scan');
      totalDiscoveries += discoveries.length;
      // Rate limit between domains
      await new Promise(r => setTimeout(r, 5000));
    } catch (err) {
      console.error(`[Archaeologist] Error scanning ${domain}:`, err.message);
    }
  }

  if (totalDiscoveries > 0) {
    await sendTelegram(`🏺 *The Archaeologist — Weekly Scan*\n${totalDiscoveries} new discoveries across ${allDomains.length} domains\n\nCheck /archaeologist for full report`);
  } else {
    console.log('[Archaeologist] Weekly scan complete — no new discoveries');
  }

  return totalDiscoveries;
}

// ── Status / Stats ──────────────────────────────────────────────────────────

function getStats() {
  const db = getDb();
  const total = db.prepare('SELECT COUNT(*) as count FROM discoveries').get().count;
  const byDomain = db.prepare('SELECT domain, COUNT(*) as count FROM discoveries GROUP BY domain ORDER BY count DESC').all();
  const byStatus = db.prepare('SELECT status, COUNT(*) as count FROM discoveries GROUP BY status').all();
  const recent = db.prepare('SELECT technique, domain, ensemble_verdict, timestamp FROM discoveries ORDER BY id DESC LIMIT 5').all();
  const scans = db.prepare('SELECT COUNT(*) as count FROM scans').get().count;
  db.close();
  return { total, byDomain, byStatus, recent, scans };
}

// ── Backfill (one-shot) ───────────────────────────────────────────────────────
// Tag citations on existing discovery records. Cheap and safe: tagging only
// (no API calls) unless --verify is passed. Updates origin/valid_reason/etc
// in-place and populates unverified_citations.

async function backfillCitations({ verify = false } = {}) {
  const db = getDb();
  const rows = db.prepare(
    'SELECT id, origin, valid_reason, cathedral_application, abandoned_reason, unverified_citations FROM discoveries'
  ).all();
  const update = db.prepare(`UPDATE discoveries SET origin = ?, valid_reason = ?,
    cathedral_application = ?, abandoned_reason = ?, unverified_citations = ? WHERE id = ?`);

  let tagged = 0;
  for (const row of rows) {
    // Skip rows already processed (avoid double-tagging on re-run)
    if (row.unverified_citations != null) continue;
    const disc = {
      origin: row.origin, valid_reason: row.valid_reason,
      cathedral_application: row.cathedral_application, abandoned_reason: row.abandoned_reason
    };
    await tagDiscoveryCitations(disc, { verify });
    update.run(disc.origin, disc.valid_reason, disc.cathedral_application,
      disc.abandoned_reason, JSON.stringify(disc.unverified_citations || []), row.id);
    if ((disc.unverified_citations || []).length > 0) tagged++;
  }
  db.close();
  console.log(`[Archaeologist] Backfill complete. ${rows.length} records scanned, ${tagged} carry unverified citations.`);
  return { scanned: rows.length, withCitations: tagged };
}

// ── CLI / Telegram interface ────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args[0] === '--scan') {
  // Manual full scan
  weeklyFullScan().then(count => {
    console.log(`[Archaeologist] Scan complete. ${count} discoveries.`);
    process.exit(0);
  });
} else if (args[0] === '--domain') {
  // Scan specific domain
  const domain = args[1];
  if (!domain || !DOMAIN_KEYWORDS[domain]) {
    console.log('Available domains:', Object.keys(DOMAIN_KEYWORDS).join(', '));
    process.exit(1);
  }
  researchDomain(domain, 'Manual CLI scan').then(discoveries => {
    console.log(`[Archaeologist] Found ${discoveries.length} discoveries in ${domain}`);
    process.exit(0);
  });
} else if (args[0] === '--stats') {
  const stats = getStats();
  console.log(`\nThe Archaeologist — Stats`);
  console.log(`Total discoveries: ${stats.total}`);
  console.log(`Total scans: ${stats.scans}`);
  console.log(`\nBy domain:`);
  for (const d of stats.byDomain) console.log(`  ${d.domain}: ${d.count}`);
  console.log(`\nBy status:`);
  for (const s of stats.byStatus) console.log(`  ${s.status}: ${s.count}`);
  console.log(`\nRecent:`);
  for (const r of stats.recent) console.log(`  ${r.technique} (${r.domain}) — ${r.ensemble_verdict} — ${r.timestamp}`);
  process.exit(0);
} else if (args[0] === '--weekly') {
  // Called by PM2 cron
  weeklyFullScan().then(() => process.exit(0));
} else if (args[0] === '--backfill') {
  // One-shot: tag citations on existing records. Add --verify for live checks.
  backfillCitations({ verify: process.argv.includes('--verify') }).then(() => process.exit(0));
} else {
  // Default: start watcher (persistent PM2 process)
  console.log('[Archaeologist] Starting file watchers (Level 3)...');

  const watcher = chokidar.watch([
    path.join(HARVESTS),
    path.join(STAGING)
  ], {
    persistent: true,
    ignoreInitial: true,
    usePolling: true,
    interval: 30000,  // 30s poll — vault doesn't change every second
    depth: 2,
    ignored: [
      /(^|[\/\\])\./,
      '**/archaeologist/**'  // Don't trigger on own output
    ]
  });

  watcher.on('add', (filePath) => {
    if (filePath.endsWith('.md')) {
      onFileChange(filePath);
    }
  });

  watcher.on('error', (err) => {
    console.error('[Archaeologist] Watcher error:', err.message);
  });

  console.log('[Archaeologist] Watching vault staging + session harvests');
  console.log('[Archaeologist] Ready. Level 3 agent — event-driven with weekly fallback.');
}

// ── Exports for Telegram bot integration ────────────────────────────────────

export {
  researchDomain, weeklyFullScan, getStats, runEnsembleGate, parseDiscoveries,
  extractCitations, tagCitations, verifyCitation, tagDiscoveryCitations, backfillCitations
};
