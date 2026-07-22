import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join } from 'path';

const HOME = process.env.HOME;
const NANOCLAW = join(HOME, 'nanoclaw');
const VAULT = join(HOME, 'cathedral-vault');
const HARVEST_DIR = join(VAULT, '00_Staging/cathedral');
const MIRROR_LOG = join(VAULT, '02_Refined_Gold/cathedral/forge-mirror-log.md');
const STATE_FILE = join(NANOCLAW, 'paul-patterns-state.json');
const RESULTS_DIR = join(HOME, 'Cathedral/agents/paul-patterns');
const OLLAMA_URL = 'http://localhost:11434/api/chat';

const envPath = join(NANOCLAW, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[m[1].trim()]) process.env[m[1].trim()] = v;
    }
  }
}

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const PAUL_CHAT_ID = process.env.PAUL_CHAT_ID;

function loadJSON(p, fallback) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; }
}
function saveJSON(p, data) { writeFileSync(p, JSON.stringify(data, null, 2)); }
function today() { return new Date().toISOString().slice(0, 10); }

async function callOllama(system, prompt) {
  const res = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'hermes3',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt }
      ],
      stream: false,
      options: { temperature: 0.2 }
    })
  });
  const data = await res.json();
  return data.message?.content || '';
}

async function sendTelegram(text) {
  if (!TELEGRAM_TOKEN || !PAUL_CHAT_ID) return;
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const chunks = [];
  let remaining = text;
  while (remaining.length > 4000) {
    const cut = remaining.lastIndexOf('\n', 4000);
    chunks.push(remaining.slice(0, cut > 0 ? cut : 4000));
    remaining = remaining.slice(cut > 0 ? cut + 1 : 4000);
  }
  chunks.push(remaining);
  for (const chunk of chunks) {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: PAUL_CHAT_ID, text: chunk, parse_mode: 'Markdown' })
      });
    } catch (e) { console.error('[patterns] Telegram failed:', e.message); }
    if (chunks.length > 1) await new Promise(r => setTimeout(r, 500));
  }
}

// ── Data Gathering ──

function getAllHarvests() {
  if (!existsSync(HARVEST_DIR)) return [];
  const files = readdirSync(HARVEST_DIR)
    .filter(f => f.startsWith('session-harvest-') && f.endsWith('.md'))
    .sort();

  const sessions = {};
  for (const f of files) {
    const dateMatch = f.match(/session-harvest-([\d-]+[a-z]?)-pass(\d)/);
    if (!dateMatch) continue;
    const sessionId = dateMatch[1];
    const pass = parseInt(dateMatch[2]);
    if (!sessions[sessionId]) sessions[sessionId] = { id: sessionId, date: sessionId.replace(/[a-z]$/, ''), passes: {} };
    sessions[sessionId].passes[pass] = readFileSync(join(HARVEST_DIR, f), 'utf8');
  }
  return Object.values(sessions);
}

function getMirrorEntries() {
  if (!existsSync(MIRROR_LOG)) return [];
  const content = readFileSync(MIRROR_LOG, 'utf8');
  const entries = [];
  const blocks = content.split(/^## /m).filter(b => b.trim());
  for (const block of blocks) {
    const dateMatch = block.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) continue;
    entries.push({ date: dateMatch[1], content: block.slice(0, 800) });
  }
  return entries;
}

// ── Analysis Functions ──

function classifySession(session) {
  const p1 = (session.passes[1] || '').toLowerCase();
  const p3 = (session.passes[3] || '').toLowerCase();

  const relaySignals = ['relay', 'deepseek', 'gpt', 'stress-test', 'thread', 'follow-up prompt'];
  const buildSignals = ['built', 'build', 'pm2', 'route', 'dashboard', 'script', 'wired', 'created'];
  const convSignals = ['cup of tea', 'conversation', 'thinking out loud', 'strategy', 'philosophy', 'breakdown'];

  const relayScore = relaySignals.filter(s => p1.includes(s) || p3.includes(s)).length;
  const buildScore = buildSignals.filter(s => p1.includes(s)).length;
  const convScore = convSignals.filter(s => p3.includes(s)).length;

  if (relayScore >= 2 && buildScore >= 2) return 'mixed';
  if (relayScore >= 2) return 'relay';
  if (buildScore >= 3) return 'build';
  if (convScore >= 2) return 'conversation';
  if (buildScore >= 1) return 'build';
  return 'mixed';
}

function detectVaultDeposit(session) {
  const p1 = (session.passes[1] || '').toLowerCase();
  return p1.includes('vault') && (p1.includes('deposit') || p1.includes('filed') || p1.includes('refined_gold'));
}

function detectCupOfTea(session) {
  const p3 = (session.passes[3] || '').toLowerCase();
  return p3.includes('cup of tea') || p3.includes('digestible') || p3.includes('break it down') ||
    p3.includes('conversation') || p3.includes('teach') || p3.includes('human first');
}

function countBuilds(session) {
  const p1 = session.passes[1] || '';
  const headers = p1.match(/^###\s/gm);
  return headers ? headers.length : 0;
}

function extractTopics(session) {
  const p1 = session.passes[1] || '';
  const focusMatch = p1.match(/focus:\s*["']?([^"'\n]+)/);
  return focusMatch ? focusMatch[1].trim() : '';
}

function detectSharpMoment(session) {
  const p3 = session.passes[3] || '';
  const sharpMatch = p3.match(/worked|sharp|landed|best|highest.value/gi);
  return sharpMatch ? sharpMatch.length : 0;
}

// ── Main Analysis ──

async function analyze(windowDays = 30) {
  console.log('[patterns] Gathering session data...');
  const allSessions = getAllHarvests();
  const mirrorEntries = getMirrorEntries();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const recent = allSessions.filter(s => s.date >= cutoffStr);
  console.log(`[patterns] ${recent.length} sessions in last ${windowDays} days (${allSessions.length} total).`);

  if (recent.length < 3) {
    console.log('[patterns] Not enough recent sessions for pattern analysis.');
    return null;
  }

  // Classify each session
  const classified = recent.map(s => ({
    id: s.id,
    date: s.date,
    type: classifySession(s),
    vaultDeposit: detectVaultDeposit(s),
    cupOfTea: detectCupOfTea(s),
    buildCount: countBuilds(s),
    topics: extractTopics(s),
    sharpness: detectSharpMoment(s),
    passes: s.passes
  }));

  // Aggregate
  const typeCounts = { relay: 0, build: 0, mixed: 0, conversation: 0 };
  let vaultCount = 0, cupCount = 0, totalBuilds = 0, highLoadSessions = 0;

  for (const s of classified) {
    typeCounts[s.type] = (typeCounts[s.type] || 0) + 1;
    if (s.vaultDeposit) vaultCount++;
    if (s.cupOfTea) cupCount++;
    totalBuilds += s.buildCount;
    if (s.buildCount > 3) highLoadSessions++;
  }

  // Topic frequency
  const topicFreq = {};
  for (const s of classified) {
    if (!s.topics) continue;
    const words = s.topics.toLowerCase().split(/[,;+&/]+/).map(w => w.trim()).filter(w => w.length > 3);
    for (const w of words) {
      topicFreq[w] = (topicFreq[w] || 0) + 1;
    }
  }
  const topTopics = Object.entries(topicFreq).sort((a, b) => b[1] - a[1]).slice(0, 8);

  // Sharpness correlation
  const sharpByType = {};
  for (const s of classified) {
    if (!sharpByType[s.type]) sharpByType[s.type] = [];
    sharpByType[s.type].push(s.sharpness);
  }
  const avgSharp = {};
  for (const [type, scores] of Object.entries(sharpByType)) {
    avgSharp[type] = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
  }

  // High-load sessions vs cup-of-tea — quality comparison
  const highLoad = classified.filter(s => s.buildCount > 3);
  const teaSessions = classified.filter(s => s.cupOfTea);

  // Use hermes3 for deeper pattern recognition
  const recentSummaries = classified.slice(-10).map(s =>
    `${s.date} [${s.type}] builds:${s.buildCount} vault:${s.vaultDeposit} tea:${s.cupOfTea} topics:${s.topics}`
  ).join('\n');

  const mirrorSummary = mirrorEntries.slice(-5).map(e =>
    `${e.date}: ${e.content.slice(0, 300)}`
  ).join('\n\n');

  console.log('[patterns] Running hermes3 pattern analysis...');
  const patternAnalysis = await callOllama(
    `You analyze session patterns for a personal AI system builder named Paul.
You identify: what conditions produce his best work, what drains him, what he avoids but shouldn't, what he gravitates toward.
Be specific and honest. No flattery. Short observations, one per line.`,
    `SESSION DATA (last 10):
${recentSummaries}

FORGE MIRROR (self-observation, last 5):
${mirrorSummary}

STATISTICS:
- Session types: relay=${typeCounts.relay}, build=${typeCounts.build}, mixed=${typeCounts.mixed}, conversation=${typeCounts.conversation}
- Vault deposits: ${vaultCount}/${recent.length} sessions (${Math.round(vaultCount / recent.length * 100)}%)
- Cup-of-tea moments: ${cupCount}/${recent.length} sessions (${Math.round(cupCount / recent.length * 100)}%)
- Avg builds/session: ${(totalBuilds / recent.length).toFixed(1)}
- High-load sessions (>3 builds): ${highLoadSessions}
- Top topics: ${topTopics.map(([t, c]) => `${t}(${c})`).join(', ')}
- Avg sharpness by type: ${JSON.stringify(avgSharp)}

Answer these questions:
1. What SESSION TYPE produces Paul's highest-value output? Why?
2. What pattern do the high-load sessions share? Do they correlate with quality?
3. What topic has Paul been avoiding or neglecting?
4. What is Paul's most WASTEFUL habit across sessions?
5. What is Paul's most PRODUCTIVE habit?
6. One specific suggestion for next session.`
  );

  // Build result
  const result = {
    date: today(),
    windowDays,
    sessionCount: recent.length,
    totalSessions: allSessions.length,
    typeCounts,
    vaultRate: Math.round(vaultCount / recent.length * 100),
    cupOfTeaRate: Math.round(cupCount / recent.length * 100),
    avgBuildsPerSession: Math.round(totalBuilds / recent.length * 10) / 10,
    highLoadSessions,
    topTopics: topTopics.map(([topic, count]) => ({ topic, count })),
    avgSharpByType: avgSharp,
    patternAnalysis,
    sessions: classified.map(s => ({
      id: s.id, date: s.date, type: s.type,
      builds: s.buildCount, vault: s.vaultDeposit,
      tea: s.cupOfTea, topics: s.topics
    }))
  };

  return result;
}

async function run() {
  console.log('[patterns] Starting Paul Pattern Tracker...');

  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

  const result = await analyze(30);
  if (!result) {
    await sendTelegram('*Paul Patterns:* Not enough recent sessions to analyze.');
    process.exit(0);
  }

  // Save results
  saveJSON(join(RESULTS_DIR, `patterns-${result.date}.json`), result);
  saveJSON(join(NANOCLAW, 'paul-patterns-latest.json'), result);

  // Update state
  let state = loadJSON(STATE_FILE, { reports: [] });
  state.reports.push({
    date: result.date,
    sessionCount: result.sessionCount,
    vaultRate: result.vaultRate,
    cupOfTeaRate: result.cupOfTeaRate,
    avgBuilds: result.avgBuildsPerSession,
    topType: Object.entries(result.typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
  });
  if (state.reports.length > 52) state.reports = state.reports.slice(-52);
  saveJSON(STATE_FILE, state);

  // Telegram report
  const tc = result.typeCounts;
  const report = [
    `*PAUL PATTERNS* — ${result.date}`,
    `_${result.sessionCount} sessions analyzed (last 30 days)_`,
    '',
    `*Session Types:*`,
    `  Relay: ${tc.relay} | Build: ${tc.build} | Mixed: ${tc.mixed} | Conv: ${tc.conversation}`,
    '',
    `*Quality Signals:*`,
    `  Vault deposits: ${result.vaultRate}%`,
    `  Cup-of-tea moments: ${result.cupOfTeaRate}%`,
    `  Avg builds/session: ${result.avgBuildsPerSession}`,
    `  High-load (>3 builds): ${result.highLoadSessions}`,
    '',
    `*Top Topics:*`,
    result.topTopics.slice(0, 5).map(t => `  ${t.topic} (${t.count}x)`).join('\n'),
    '',
    `*Pattern Analysis:*`,
    result.patternAnalysis.slice(0, 1500)
  ].join('\n');

  await sendTelegram(report);
  console.log('[patterns] Report generated and sent.');
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[patterns] Fatal:', err);
    process.exit(1);
  });
