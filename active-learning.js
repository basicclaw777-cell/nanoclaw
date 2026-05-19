// ── Active Learning (#5) — Epistemic Engine Phase 3 ───────────────────────────
// The meta-layer. Computes "what should the system investigate next?"
// Replaces random sampling with computed priority.
//
// Inputs:
//   - Ensemble Gate: which claims are uncertain?
//   - Knowledge Graph: which clusters are under-explored?
//   - Causal Net: which dependencies have gaps?
//   - Vault: which domains are thin?
//
// Outputs:
//   - Ranked question queue: what to investigate next
//   - Agent routing: which agent should handle each question
//   - Investigation briefs: context packets for agents
//
// This is the fix for "mandate without mechanism" at scale.
// ──────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(process.env.HOME, 'nanoclaw', '.env') });

const HOME = process.env.HOME;
const ACTIVE_DB = path.join(HOME, 'nanoclaw', 'vortex_data', 'active-learning.db');
const ENSEMBLE_DB = path.join(HOME, 'nanoclaw', 'vortex_data', 'ensemble.db');
const GRAPH_DB = path.join(HOME, 'nanoclaw', 'vortex_data', 'knowledge-graph.db');
const CAUSAL_DB = path.join(HOME, 'nanoclaw', 'vortex_data', 'causal-net.db');
const METRICS_DB = path.join(HOME, 'nanoclaw', 'vortex_data', 'metrics.db');
const DASHBOARD_PATH = path.join(HOME, 'nanoclaw', 'active-learning-dashboard.html');
const OLLAMA_URL = 'http://localhost:11434';

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const PAUL_CHAT_ID = process.env.PAUL_CHAT_ID ? parseInt(process.env.PAUL_CHAT_ID) : null;

// ── DB setup ─────────────────────────────────────────────────────────────────

function getDb() {
  const db = new Database(ACTIVE_DB);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS question_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      source TEXT NOT NULL,
      priority_score REAL NOT NULL,
      uncertainty_score REAL DEFAULT 0,
      connectivity_score REAL DEFAULT 0,
      gap_score REAL DEFAULT 0,
      domain TEXT,
      suggested_agent TEXT,
      status TEXT DEFAULT 'pending',
      resolution TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT
    );
    CREATE TABLE IF NOT EXISTS domain_health (
      domain TEXT PRIMARY KEY,
      nugget_count INTEGER,
      avg_ensemble_divergence REAL,
      cluster_coverage REAL,
      causal_density REAL,
      health_score REAL,
      computed_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS investigation_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER,
      agent TEXT,
      finding TEXT,
      impact_score REAL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_queue_priority ON question_queue(priority_score DESC);
    CREATE INDEX IF NOT EXISTS idx_queue_status ON question_queue(status);
  `);
  return db;
}

// ── Signal collectors ────────────────────────────────────────────────────────

function getEnsembleSignals() {
  try {
    const db = new Database(ENSEMBLE_DB, { readonly: true });
    const runs = db.prepare(`
      SELECT claim, divergence_score, verdict, model_responses, timestamp
      FROM ensemble_runs ORDER BY timestamp DESC LIMIT 50
    `).all();
    db.close();

    // High divergence = high uncertainty = needs investigation
    return runs
      .filter(r => r.divergence_score > 2.5)
      .map(r => ({
        claim: r.claim,
        uncertainty: r.divergence_score / 10,
        signal: r.verdict,
        source: 'ensemble-gate'
      }));
  } catch { return []; }
}

function getGraphSignals() {
  try {
    const db = new Database(GRAPH_DB, { readonly: true });

    // Unreported surprises = unexplored connections
    const surprises = db.prepare(`
      SELECT source_title, target_title, source_domain, target_domain, surprise_score
      FROM surprises WHERE reported = 0
      ORDER BY surprise_score DESC LIMIT 20
    `).all();

    // Thin clusters = under-explored areas
    const clusters = db.prepare(`
      SELECT cluster_id, COUNT(*) as size, GROUP_CONCAT(DISTINCT domain) as domains
      FROM clusters GROUP BY cluster_id ORDER BY size ASC LIMIT 10
    `).all();

    db.close();

    const signals = [];

    // Surprise connections → questions about why they're connected
    for (const s of surprises) {
      signals.push({
        question: `Why are "${s.source_title?.slice(0, 50)}" (${s.source_domain}) and "${s.target_title?.slice(0, 50)}" (${s.target_domain}) connected?`,
        connectivity: s.surprise_score,
        source: 'knowledge-graph-surprise',
        domains: [s.source_domain, s.target_domain]
      });
    }

    // Small clusters → under-explored areas
    for (const c of clusters.filter(c => c.size < 5)) {
      signals.push({
        question: `Domain gap: cluster ${c.cluster_id} has only ${c.size} nuggets across ${c.domains}. What's missing?`,
        gap: 0.8,
        source: 'knowledge-graph-gap',
        domains: c.domains?.split(',') || []
      });
    }

    return signals;
  } catch { return []; }
}

function getCausalSignals() {
  try {
    const db = new Database(CAUSAL_DB, { readonly: true });

    // High-risk blast reports = claims that need verification
    const blasts = db.prepare(`
      SELECT root_claim, blast_radius, risk_score
      FROM blast_reports WHERE risk_score > 1
      ORDER BY risk_score DESC LIMIT 10
    `).all();

    // Claims with CONTRADICTS edges = active conflicts
    const contradictions = db.prepare(`
      SELECT source_claim, target_claim, strength, reasoning
      FROM edges WHERE relationship = 'CONTRADICTS' AND strength > 0.3
      ORDER BY strength DESC LIMIT 10
    `).all();

    db.close();

    const signals = [];

    for (const b of blasts) {
      signals.push({
        question: `High-risk claim needs verification (blast radius ${b.blast_radius}): "${b.root_claim.slice(0, 100)}"`,
        uncertainty: b.risk_score / 10,
        source: 'causal-net-blast',
        domains: []
      });
    }

    for (const c of contradictions) {
      signals.push({
        question: `Contradiction: "${c.source_claim.slice(0, 60)}" vs "${c.target_claim.slice(0, 60)}". Which is correct?`,
        uncertainty: c.strength,
        source: 'causal-net-contradiction',
        domains: []
      });
    }

    return signals;
  } catch { return []; }
}

function getVaultDomainStats() {
  try {
    const db = new Database(METRICS_DB, { readonly: true });
    const stats = db.prepare(`
      SELECT domain, COUNT(*) as count
      FROM vault_embeddings
      GROUP BY domain ORDER BY count DESC
    `).all();
    db.close();

    const total = stats.reduce((s, r) => s + r.count, 0);
    return stats.map(s => ({
      domain: s.domain,
      count: s.count,
      proportion: s.count / total
    }));
  } catch { return []; }
}

// ── Agent routing ────────────────────────────────────────────────────────────

const AGENT_CAPABILITIES = {
  'Whisperer': ['conspiracy', 'universe', '04_Esoteric_Studies', 'suppression'],
  'Boxing': ['boxing', 'training', 'technique', 'physical'],
  'Universe': ['universe', 'cosmology', 'physics', 'philosophy'],
  'Cathy': ['personal', 'relationships', 'emotional', 'creative'],
  'Trading': ['finance', 'wealth', 'business', 'markets'],
  'Maya': ['business', 'social', 'growth', 'marketing'],
  'Skills Scout': ['technology', 'learning', 'methodology'],
  'Curiosity Loop': ['general', 'cross-domain', 'exploration'],
  'Archivist': ['vault', 'organization', 'metadata'],
};

function suggestAgent(question, domains) {
  const qLower = question.toLowerCase();
  let bestAgent = 'Curiosity Loop'; // Default for unmatched
  let bestScore = 0;

  for (const [agent, keywords] of Object.entries(AGENT_CAPABILITIES)) {
    let score = 0;
    for (const kw of keywords) {
      if (qLower.includes(kw)) score += 2;
      if (domains?.some(d => d?.toLowerCase().includes(kw))) score += 3;
    }
    if (score > bestScore) {
      bestScore = score;
      bestAgent = agent;
    }
  }

  return bestAgent;
}

// ── Priority computation ─────────────────────────────────────────────────────

export async function computePriorityQueue() {
  console.log('[active-learning] Computing priority queue...');

  const ensembleSignals = getEnsembleSignals();
  const graphSignals = getGraphSignals();
  const causalSignals = getCausalSignals();
  const domainStats = getVaultDomainStats();

  console.log(`[active-learning] Signals: ensemble=${ensembleSignals.length}, graph=${graphSignals.length}, causal=${causalSignals.length}`);

  const db = getDb();

  // Get existing pending questions to avoid duplicates
  const existing = new Set(
    db.prepare("SELECT question FROM question_queue WHERE status = 'pending'").all().map(r => r.question)
  );

  const newQuestions = [];

  // Process ensemble signals → uncertainty-driven questions
  for (const s of ensembleSignals) {
    const q = `Verify contested claim: "${s.claim.slice(0, 150)}"`;
    if (existing.has(q)) continue;
    newQuestions.push({
      question: q,
      source: s.source,
      uncertainty: s.uncertainty,
      connectivity: 0,
      gap: 0,
      domains: [],
      priority: s.uncertainty * 3 // Uncertainty weighted 3x
    });
  }

  // Process graph signals → connectivity-driven questions
  for (const s of graphSignals) {
    if (existing.has(s.question)) continue;
    newQuestions.push({
      question: s.question,
      source: s.source,
      uncertainty: 0,
      connectivity: s.connectivity || 0,
      gap: s.gap || 0,
      domains: s.domains,
      priority: (s.connectivity || 0) * 2 + (s.gap || 0) * 2.5
    });
  }

  // Process causal signals → risk-driven questions
  for (const s of causalSignals) {
    if (existing.has(s.question)) continue;
    newQuestions.push({
      question: s.question,
      source: s.source,
      uncertainty: s.uncertainty || 0,
      connectivity: 0,
      gap: 0,
      domains: s.domains,
      priority: (s.uncertainty || 0) * 4 // Risk weighted 4x
    });
  }

  // Domain health → gap questions for thin domains
  const avgCount = domainStats.reduce((s, d) => s + d.count, 0) / (domainStats.length || 1);
  for (const d of domainStats) {
    if (d.count < avgCount * 0.3 && !['00_Staging', '05_Archive_Graveyard', '03_The_Sages'].includes(d.domain)) {
      const q = `Domain "${d.domain}" has only ${d.count} nuggets (avg is ${Math.round(avgCount)}). What knowledge is missing?`;
      if (existing.has(q)) continue;
      newQuestions.push({
        question: q,
        source: 'domain-gap',
        uncertainty: 0,
        connectivity: 0,
        gap: 1 - (d.count / avgCount),
        domains: [d.domain],
        priority: (1 - (d.count / avgCount)) * 2
      });
    }
  }

  // Sort by priority
  newQuestions.sort((a, b) => b.priority - a.priority);

  // Store domain health
  const upsertHealth = db.prepare(`
    INSERT OR REPLACE INTO domain_health (domain, nugget_count, health_score, computed_at)
    VALUES (?, ?, ?, datetime('now'))
  `);
  for (const d of domainStats) {
    const healthScore = Math.min(1, d.count / avgCount);
    upsertHealth.run(d.domain, d.count, healthScore);
  }

  // Insert new questions
  const insertQ = db.prepare(`
    INSERT INTO question_queue (question, source, priority_score, uncertainty_score, connectivity_score, gap_score, domain, suggested_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const q of newQuestions.slice(0, 20)) { // Cap at 20 new per cycle
    const agent = suggestAgent(q.question, q.domains);
    insertQ.run(
      q.question, q.source, q.priority,
      q.uncertainty, q.connectivity, q.gap,
      q.domains?.[0] || 'general', agent
    );
  }

  db.close();

  return {
    newQuestions: newQuestions.length,
    queued: Math.min(newQuestions.length, 20),
    topQuestions: newQuestions.slice(0, 5).map(q => ({
      question: q.question.slice(0, 120),
      priority: Math.round(q.priority * 100) / 100,
      source: q.source,
      agent: suggestAgent(q.question, q.domains)
    })),
    signals: {
      ensemble: ensembleSignals.length,
      graph: graphSignals.length,
      causal: causalSignals.length
    },
    domainHealth: domainStats.slice(0, 10).map(d => ({
      domain: d.domain,
      count: d.count,
      health: Math.min(1, d.count / avgCount).toFixed(2)
    }))
  };
}

// ── Get the queue ────────────────────────────────────────────────────────────

export function getQueue(limit = 10, status = 'pending') {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM question_queue
      WHERE status = ?
      ORDER BY priority_score DESC LIMIT ?
    `).all(status, limit);
    db.close();
    return rows;
  } catch { return []; }
}

export function resolveQuestion(id, resolution) {
  try {
    const db = getDb();
    db.prepare(`
      UPDATE question_queue SET status = 'resolved', resolution = ?, resolved_at = datetime('now')
      WHERE id = ?
    `).run(resolution, id);
    db.close();
  } catch {}
}

// ── Format for Telegram ──────────────────────────────────────────────────────

export function formatQueueReport(result) {
  let text = `ACTIVE LEARNING — PRIORITY QUEUE\n`;
  text += `Signals: Ensemble(${result.signals.ensemble}) | Graph(${result.signals.graph}) | Causal(${result.signals.causal})\n`;
  text += `New questions: ${result.newQuestions} | Queued: ${result.queued}\n\n`;

  if (result.topQuestions.length > 0) {
    text += `TOP PRIORITY INVESTIGATIONS:\n\n`;
    for (let i = 0; i < result.topQuestions.length; i++) {
      const q = result.topQuestions[i];
      text += `${i + 1}. [${q.priority}] ${q.question}\n`;
      text += `   Source: ${q.source} | Agent: ${q.agent}\n\n`;
    }
  } else {
    text += 'No new questions generated. System is either well-explored or needs more data.\n\n';
  }

  if (result.domainHealth.length > 0) {
    text += `DOMAIN HEALTH:\n`;
    for (const d of result.domainHealth) {
      const bar = d.health >= 0.8 ? '████' : d.health >= 0.5 ? '███░' : d.health >= 0.3 ? '██░░' : '█░░░';
      text += `  ${bar} ${d.domain} (${d.count} nuggets, health ${d.health})\n`;
    }
  }

  return text;
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export function generateActiveDashboard() {
  let queue = [];
  let health = [];
  let resolved = [];

  try {
    const db = getDb();
    queue = db.prepare("SELECT * FROM question_queue WHERE status = 'pending' ORDER BY priority_score DESC LIMIT 30").all();
    health = db.prepare("SELECT * FROM domain_health ORDER BY health_score ASC").all();
    resolved = db.prepare("SELECT * FROM question_queue WHERE status = 'resolved' ORDER BY resolved_at DESC LIMIT 20").all();
    db.close();
  } catch {}

  const sourceColors = {
    'ensemble-gate': '#f85149',
    'knowledge-graph-surprise': '#bc8cff',
    'knowledge-graph-gap': '#d2a8ff',
    'causal-net-blast': '#db6d28',
    'causal-net-contradiction': '#f0883e',
    'domain-gap': '#d29922'
  };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Active Learning — Epistemic Engine</title>
<style>
  :root {
    --bg: #0d1117; --surface: #161b22; --border: #30363d;
    --text: #e6edf3; --dim: #8b949e; --accent: #58a6ff;
    --green: #3fb950; --yellow: #d29922; --orange: #db6d28; --red: #f85149;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'SF Mono', 'Fira Code', monospace; background: var(--bg); color: var(--text); padding: 20px; }
  h1 { font-size: 1.4em; margin-bottom: 4px; }
  .subtitle { color: var(--dim); font-size: 0.85em; margin-bottom: 24px; }

  .stats-bar { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
  .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px 20px; min-width: 120px; flex: 1; }
  .stat-label { color: var(--dim); font-size: 0.75em; text-transform: uppercase; letter-spacing: 1px; }
  .stat-value { font-size: 1.8em; font-weight: bold; margin-top: 4px; color: var(--accent); }

  .section { margin-bottom: 32px; }
  .section-title { font-size: 1.1em; margin-bottom: 12px; color: var(--accent); }

  .q-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
    padding: 14px; margin-bottom: 8px; position: relative;
    border-left: 3px solid var(--accent);
  }
  .q-priority { position: absolute; top: 10px; right: 14px; font-size: 1.2em; font-weight: bold; color: var(--accent); }
  .q-text { font-size: 0.85em; line-height: 1.5; padding-right: 50px; }
  .q-meta { font-size: 0.7em; color: var(--dim); margin-top: 6px; display: flex; gap: 12px; }
  .q-source { padding: 1px 6px; border-radius: 4px; font-size: 0.65em; }
  .q-agent { color: var(--green); }

  .health-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
  .health-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px; }
  .health-name { font-size: 0.85em; margin-bottom: 6px; }
  .health-bar-bg { height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
  .health-bar-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
  .health-count { font-size: 0.7em; color: var(--dim); margin-top: 4px; }
</style>
</head>
<body>
<h1>Active Learning</h1>
<p class="subtitle">Epistemic Engine — What Should We Investigate Next?</p>

<div class="stats-bar">
  <div class="stat-card">
    <div class="stat-label">Pending Questions</div>
    <div class="stat-value">${queue.length}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Resolved</div>
    <div class="stat-value" style="color:var(--green)">${resolved.length}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Domains Tracked</div>
    <div class="stat-value">${health.length}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Weakest Domain</div>
    <div class="stat-value" style="color:var(--red);font-size:1em">${health[0]?.domain || '—'}</div>
  </div>
</div>

${queue.length > 0 ? `
<div class="section">
  <h2 class="section-title">Priority Queue</h2>
  ${queue.map((q, i) => `
  <div class="q-card" style="border-left-color:${sourceColors[q.source] || 'var(--accent)'}">
    <div class="q-priority">#${i + 1}</div>
    <div class="q-text">${esc(q.question)}</div>
    <div class="q-meta">
      <span class="q-source" style="background:${sourceColors[q.source] || 'var(--accent)'}22;color:${sourceColors[q.source] || 'var(--accent)'}">${q.source}</span>
      <span class="q-agent">→ ${q.suggested_agent}</span>
      <span>Priority: ${q.priority_score.toFixed(2)}</span>
      <span>${q.domain || ''}</span>
    </div>
  </div>`).join('')}
</div>
` : '<div style="text-align:center;padding:40px;color:var(--dim)">No pending questions. Run /learn to compute priorities.</div>'}

${health.length > 0 ? `
<div class="section">
  <h2 class="section-title">Domain Health</h2>
  <div class="health-grid">
    ${health.map(h => {
      const pct = Math.round((h.health_score || 0) * 100);
      const color = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--yellow)' : pct >= 30 ? 'var(--orange)' : 'var(--red)';
      return `
      <div class="health-card">
        <div class="health-name">${esc(h.domain)}</div>
        <div class="health-bar-bg"><div class="health-bar-fill" style="width:${pct}%;background:${color}"></div></div>
        <div class="health-count">${h.nugget_count} nuggets — ${pct}% health</div>
      </div>`;
    }).join('')}
  </div>
</div>
` : ''}

<script>
function esc(t){return t?t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'):'';}
</script>
</body>
</html>`;

  function esc(t) { return t ? t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''; }

  fs.writeFileSync(DASHBOARD_PATH, html);
  return DASHBOARD_PATH;
}

// ── Telegram commands ────────────────────────────────────────────────────────

export function registerActiveCommands(bot) {
  const PAUL = process.env.PAUL_CHAT_ID ? parseInt(process.env.PAUL_CHAT_ID) : null;

  async function safeSend(chatId, text) {
    if (!text) return;
    const MAX = 4096;
    if (text.length <= MAX) return bot.sendMessage(chatId, text);
    const chunks = [];
    let rem = text;
    while (rem.length > 0) {
      if (rem.length <= MAX) { chunks.push(rem); break; }
      let cut = rem.lastIndexOf('\n', MAX);
      if (cut < MAX * 0.3) cut = MAX;
      chunks.push(rem.slice(0, cut));
      rem = rem.slice(cut).replace(/^\n+/, '');
    }
    for (const c of chunks) await bot.sendMessage(chatId, c);
  }

  // /learn — compute priority queue from all signals
  bot.onText(/^\/learn(?:@\w+)?$/, async (msg) => {
    const chatId = msg.chat.id;
    if (PAUL && chatId !== PAUL) return;
    await safeSend(chatId, 'Active Learning: scanning all signals...');
    try {
      const result = await computePriorityQueue();
      await safeSend(chatId, formatQueueReport(result));
      generateActiveDashboard();
      await safeSend(chatId, `Dashboard: ${DASHBOARD_PATH}`);
    } catch (e) {
      await safeSend(chatId, `Active Learning error: ${e.message}`);
    }
  });

  // /queue — show current priority queue
  bot.onText(/^\/queue(?:@\w+)?$/, async (msg) => {
    const chatId = msg.chat.id;
    if (PAUL && chatId !== PAUL) return;
    const queue = getQueue(10);
    if (queue.length === 0) {
      return safeSend(chatId, 'Queue empty. Use /learn to compute priorities.');
    }
    let text = 'INVESTIGATION QUEUE (top 10):\n\n';
    for (let i = 0; i < queue.length; i++) {
      const q = queue[i];
      text += `${i + 1}. [${q.priority_score.toFixed(1)}] ${q.question.slice(0, 100)}\n`;
      text += `   → ${q.suggested_agent} | ${q.source}\n\n`;
    }
    await safeSend(chatId, text);
  });

  // /resolve <id> <resolution> — mark a question resolved
  bot.onText(/^\/resolve(?:@\w+)?\s+(\d+)\s+(.+)$/s, async (msg, match) => {
    const chatId = msg.chat.id;
    if (PAUL && chatId !== PAUL) return;
    const id = parseInt(match[1]);
    const resolution = match[2].trim();
    resolveQuestion(id, resolution);
    await safeSend(chatId, `Question ${id} resolved.`);
  });
}

// ── Direct execution ─────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].includes('active-learning')) {
  computePriorityQueue().then(result => {
    console.log(formatQueueReport(result));
    generateActiveDashboard();
    console.log('[active-learning] Dashboard generated.');
    process.exit(0);
  }).catch(e => {
    console.error('[active-learning] Fatal:', e);
    process.exit(1);
  });
}
