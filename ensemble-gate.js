// ── Ensemble Gate ─────────────────────────────────────────────────────────────
// The sensory organ of the Epistemic Engine.
// Runs same claim through 3 diverse Ollama models, measures divergence.
// High agreement = probably solid. High divergence = needs investigation.
//
// Models: qwen3:14b (Alibaba) | gemma3:4b (Google) | phi4-mini (Microsoft)
// Three different corporate training bases = three different bias profiles.
// ──────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const OLLAMA_URL = 'http://localhost:11434';
const MODELS = ['qwen3:14b', 'gemma3:4b', 'phi4-mini'];
const DB_PATH = path.join(process.env.HOME, 'nanoclaw', 'vortex_data', 'ensemble.db');
const DASHBOARD_PATH = path.join(process.env.HOME, 'nanoclaw', 'ensemble-dashboard.html');

// ── Database setup ───────────────────────────────────────────────────────────

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS ensemble_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      claim TEXT NOT NULL,
      timestamp TEXT DEFAULT (datetime('now')),
      divergence_score REAL,
      verdict TEXT,
      model_responses TEXT,
      pairwise_scores TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ensemble_timestamp ON ensemble_runs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_ensemble_divergence ON ensemble_runs(divergence_score);
  `);
  return db;
}

// ── Core: query a single model ───────────────────────────────────────────────

const EVAL_PROMPT = `You are an epistemic evaluator. Assess the following claim on these 5 dimensions. For each, give a score 1-10 and a one-sentence reason.

1. EMPIRICAL SUPPORT — Is there verifiable evidence?
2. LOGICAL COHERENCE — Does the reasoning hold?
3. SOURCE RELIABILITY — Are the sources credible?
4. FALSIFIABILITY — Could this be proven wrong?
5. CONSENSUS — Do experts broadly agree?

Then give an OVERALL VERDICT: one of STRONG, MODERATE, WEAK, CONTESTED, or INSUFFICIENT.

Format your response EXACTLY as:
EMPIRICAL: [score] — [reason]
LOGICAL: [score] — [reason]
SOURCE: [score] — [reason]
FALSIFIABLE: [score] — [reason]
CONSENSUS: [score] — [reason]
VERDICT: [verdict]
REASONING: [one paragraph summary]`;

async function queryModel(model, claim) {
  const start = Date.now();
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: EVAL_PROMPT },
          { role: 'user', content: `Claim: "${claim}"` }
        ],
        stream: false,
        options: { temperature: 0.3, num_predict: 800 }
      })
    });
    const data = await res.json();
    const elapsed = Date.now() - start;
    return {
      model,
      response: data.message?.content || 'No response',
      elapsed,
      error: null
    };
  } catch (e) {
    return { model, response: null, elapsed: Date.now() - start, error: e.message };
  }
}

// ── Parse structured response ────────────────────────────────────────────────

function parseScores(text) {
  const dims = ['EMPIRICAL', 'LOGICAL', 'SOURCE', 'FALSIFIABLE', 'CONSENSUS'];
  const scores = {};
  for (const dim of dims) {
    const match = text.match(new RegExp(`${dim}:\\s*(\\d+)`, 'i'));
    scores[dim] = match ? parseInt(match[1], 10) : null;
  }
  const verdictMatch = text.match(/VERDICT:\s*(STRONG|MODERATE|WEAK|CONTESTED|INSUFFICIENT)/i);
  scores.VERDICT = verdictMatch ? verdictMatch[1].toUpperCase() : 'UNKNOWN';
  const reasonMatch = text.match(/REASONING:\s*(.+)/is);
  scores.REASONING = reasonMatch ? reasonMatch[1].trim().split('\n')[0] : '';
  return scores;
}

// ── Divergence calculation ───────────────────────────────────────────────────

function calculateDivergence(parsedResults) {
  const dims = ['EMPIRICAL', 'LOGICAL', 'SOURCE', 'FALSIFIABLE', 'CONSENSUS'];
  const pairwise = {};
  let totalDiv = 0;
  let pairCount = 0;

  // Pairwise score differences per dimension
  for (let i = 0; i < parsedResults.length; i++) {
    for (let j = i + 1; j < parsedResults.length; j++) {
      const key = `${parsedResults[i].model} vs ${parsedResults[j].model}`;
      const diffs = {};
      let pairDiv = 0;
      let dimCount = 0;
      for (const dim of dims) {
        const a = parsedResults[i].scores[dim];
        const b = parsedResults[j].scores[dim];
        if (a !== null && b !== null) {
          diffs[dim] = Math.abs(a - b);
          pairDiv += diffs[dim];
          dimCount++;
        }
      }
      const avgDiff = dimCount > 0 ? pairDiv / dimCount : 0;
      pairwise[key] = { diffs, avgDiff };
      totalDiv += avgDiff;
      pairCount++;
    }
  }

  // Verdict agreement
  const verdicts = parsedResults.map(r => r.scores.VERDICT);
  const uniqueVerdicts = [...new Set(verdicts)];
  const verdictAgreement = uniqueVerdicts.length === 1 ? 1.0 :
    uniqueVerdicts.length === 2 ? 0.5 : 0.0;

  // Overall divergence: 0-10 scale. 0 = perfect agreement, 10 = max disagreement
  const scoreDivergence = pairCount > 0 ? totalDiv / pairCount : 0;
  const verdictPenalty = (1 - verdictAgreement) * 3; // Up to 3 extra points for verdict disagreement
  const overall = Math.min(10, scoreDivergence + verdictPenalty);

  return {
    overall: Math.round(overall * 10) / 10,
    scoreDivergence: Math.round(scoreDivergence * 10) / 10,
    verdictAgreement,
    uniqueVerdicts,
    pairwise
  };
}

// ── Main ensemble run ────────────────────────────────────────────────────────

export async function runEnsemble(claim) {
  // Run all 3 models sequentially (Ollama runs one at a time anyway on 16GB)
  const results = [];
  for (const model of MODELS) {
    const result = await queryModel(model, claim);
    if (result.response) {
      result.scores = parseScores(result.response);
    } else {
      result.scores = { EMPIRICAL: null, LOGICAL: null, SOURCE: null, FALSIFIABLE: null, CONSENSUS: null, VERDICT: 'ERROR', REASONING: result.error };
    }
    results.push(result);
  }

  const divergence = calculateDivergence(results);

  // Determine overall signal
  let signal;
  if (divergence.overall <= 2) signal = 'CONSENSUS';
  else if (divergence.overall <= 4) signal = 'MILD_DIVERGENCE';
  else if (divergence.overall <= 6) signal = 'SIGNIFICANT_DIVERGENCE';
  else signal = 'HIGH_DIVERGENCE';

  const run = {
    claim,
    timestamp: new Date().toISOString(),
    results,
    divergence,
    signal
  };

  // Store in DB
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO ensemble_runs (claim, timestamp, divergence_score, verdict, model_responses, pairwise_scores)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      claim,
      run.timestamp,
      divergence.overall,
      signal,
      JSON.stringify(results.map(r => ({ model: r.model, scores: r.scores, elapsed: r.elapsed }))),
      JSON.stringify(divergence.pairwise)
    );
    db.close();
  } catch (e) {
    console.error('[ensemble-gate] DB write error:', e.message);
  }

  return run;
}

// ── Get history ──────────────────────────────────────────────────────────────

export function getHistory(limit = 50) {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM ensemble_runs ORDER BY timestamp DESC LIMIT ?
    `).all(limit);
    db.close();
    return rows.map(r => ({
      ...r,
      model_responses: JSON.parse(r.model_responses),
      pairwise_scores: JSON.parse(r.pairwise_scores)
    }));
  } catch (e) {
    return [];
  }
}

// ── Format for Telegram ──────────────────────────────────────────────────────

export function formatTelegram(run) {
  const signalEmoji = {
    'CONSENSUS': '🟢',
    'MILD_DIVERGENCE': '🟡',
    'SIGNIFICANT_DIVERGENCE': '🟠',
    'HIGH_DIVERGENCE': '🔴'
  };

  const dims = ['EMPIRICAL', 'LOGICAL', 'SOURCE', 'FALSIFIABLE', 'CONSENSUS'];
  let text = `${signalEmoji[run.signal] || '⚪'} ENSEMBLE GATE — ${run.signal}\n`;
  text += `Divergence: ${run.divergence.overall}/10\n\n`;
  text += `Claim: "${run.claim.slice(0, 200)}${run.claim.length > 200 ? '...' : ''}"\n\n`;

  // Score comparison table
  text += `         ${MODELS.map(m => m.split(':')[0].padEnd(8)).join(' ')}\n`;
  text += `${'─'.repeat(40)}\n`;
  for (const dim of dims) {
    const scores = run.results.map(r => {
      const s = r.scores[dim];
      return s !== null ? String(s).padEnd(8) : '?'.padEnd(8);
    });
    text += `${dim.slice(0, 8).padEnd(9)} ${scores.join(' ')}\n`;
  }
  text += `${'─'.repeat(40)}\n`;

  // Verdicts
  text += `VERDICT  ${run.results.map(r => r.scores.VERDICT.padEnd(8)).join(' ')}\n\n`;

  // Biggest disagreements
  const pairEntries = Object.entries(run.divergence.pairwise);
  if (pairEntries.length > 0) {
    const worst = pairEntries.sort((a, b) => b[1].avgDiff - a[1].avgDiff)[0];
    if (worst[1].avgDiff > 2) {
      text += `Biggest gap: ${worst[0]} (avg ${worst[1].avgDiff.toFixed(1)} pts)\n`;
      const bigDims = Object.entries(worst[1].diffs).filter(([, d]) => d >= 3).map(([dim]) => dim);
      if (bigDims.length) text += `Hot dimensions: ${bigDims.join(', ')}\n`;
    }
  }

  // Reasoning summaries
  text += `\nModel reasoning:\n`;
  for (const r of run.results) {
    if (r.scores.REASONING) {
      text += `• ${r.model.split(':')[0]}: ${r.scores.REASONING.slice(0, 150)}\n`;
    }
  }

  // Timing
  const totalTime = run.results.reduce((sum, r) => sum + r.elapsed, 0);
  text += `\nTime: ${(totalTime / 1000).toFixed(1)}s total`;

  return text;
}

// ── Generate HTML dashboard ──────────────────────────────────────────────────

export function generateDashboard() {
  const history = getHistory(100);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ensemble Gate — Epistemic Engine</title>
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

  .stats-bar {
    display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap;
  }
  .stat-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
    padding: 16px 20px; min-width: 140px; flex: 1;
  }
  .stat-label { color: var(--dim); font-size: 0.75em; text-transform: uppercase; letter-spacing: 1px; }
  .stat-value { font-size: 1.8em; font-weight: bold; margin-top: 4px; }
  .stat-value.green { color: var(--green); }
  .stat-value.yellow { color: var(--yellow); }
  .stat-value.orange { color: var(--orange); }
  .stat-value.red { color: var(--red); }

  .chart-container {
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
    padding: 20px; margin-bottom: 24px;
  }
  .chart-title { font-size: 0.9em; color: var(--dim); margin-bottom: 12px; }
  .bar-chart { display: flex; align-items: flex-end; gap: 3px; height: 120px; }
  .bar {
    flex: 1; min-width: 8px; max-width: 24px; border-radius: 2px 2px 0 0;
    position: relative; cursor: pointer; transition: opacity 0.2s;
  }
  .bar:hover { opacity: 0.8; }
  .bar .tooltip {
    display: none; position: absolute; bottom: 105%; left: 50%; transform: translateX(-50%);
    background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
    padding: 8px 10px; font-size: 0.7em; white-space: nowrap; z-index: 10;
    color: var(--text);
  }
  .bar:hover .tooltip { display: block; }

  .run-list { display: flex; flex-direction: column; gap: 8px; }
  .run-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
    padding: 16px; cursor: pointer; transition: border-color 0.2s;
  }
  .run-card:hover { border-color: var(--accent); }
  .run-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .run-signal { font-size: 0.8em; font-weight: bold; padding: 2px 8px; border-radius: 4px; }
  .signal-CONSENSUS { background: rgba(63,185,80,0.15); color: var(--green); }
  .signal-MILD_DIVERGENCE { background: rgba(210,153,34,0.15); color: var(--yellow); }
  .signal-SIGNIFICANT_DIVERGENCE { background: rgba(219,109,40,0.15); color: var(--orange); }
  .signal-HIGH_DIVERGENCE { background: rgba(248,81,73,0.15); color: var(--red); }
  .run-claim { font-size: 0.85em; color: var(--dim); line-height: 1.4; }
  .run-meta { font-size: 0.7em; color: var(--dim); margin-top: 6px; }

  .score-grid {
    display: grid; grid-template-columns: auto repeat(3, 1fr); gap: 4px 12px;
    font-size: 0.8em; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border);
    display: none;
  }
  .run-card.expanded .score-grid { display: grid; }
  .score-header { color: var(--accent); font-weight: bold; }
  .score-dim { color: var(--dim); }
  .score-val { text-align: center; }
  .score-val.high { color: var(--green); }
  .score-val.mid { color: var(--yellow); }
  .score-val.low { color: var(--red); }

  .empty-state { text-align: center; padding: 60px; color: var(--dim); }
  .empty-state p { margin-top: 8px; font-size: 0.85em; }
</style>
</head>
<body>
<h1>Ensemble Gate</h1>
<p class="subtitle">Epistemic Engine — Divergence Tracker</p>

${history.length === 0 ? `
<div class="empty-state">
  <h2>No runs yet</h2>
  <p>Use /ensemble [claim] in Telegram to start testing claims</p>
</div>
` : `
<div class="stats-bar">
  <div class="stat-card">
    <div class="stat-label">Total Runs</div>
    <div class="stat-value">${history.length}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Avg Divergence</div>
    <div class="stat-value ${avgDivClass(history)}">${(history.reduce((s, r) => s + r.divergence_score, 0) / history.length).toFixed(1)}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">High Divergence</div>
    <div class="stat-value red">${history.filter(r => r.divergence_score > 6).length}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Consensus</div>
    <div class="stat-value green">${history.filter(r => r.divergence_score <= 2).length}</div>
  </div>
</div>

<div class="chart-container">
  <div class="chart-title">Divergence History (most recent right)</div>
  <div class="bar-chart">
    ${history.slice().reverse().map(r => {
      const h = Math.max(4, (r.divergence_score / 10) * 100);
      const c = r.divergence_score <= 2 ? 'var(--green)' : r.divergence_score <= 4 ? 'var(--yellow)' : r.divergence_score <= 6 ? 'var(--orange)' : 'var(--red)';
      return `<div class="bar" style="height:${h}%;background:${c}"><div class="tooltip">${r.claim.slice(0, 60)}...<br>Div: ${r.divergence_score}</div></div>`;
    }).join('')}
  </div>
</div>

<div class="run-list">
  ${history.map(r => {
    const responses = r.model_responses;
    const dims = ['EMPIRICAL', 'LOGICAL', 'SOURCE', 'FALSIFIABLE', 'CONSENSUS'];
    return `
    <div class="run-card" onclick="this.classList.toggle('expanded')">
      <div class="run-header">
        <span class="run-signal signal-${r.verdict}">${r.verdict.replace(/_/g, ' ')} (${r.divergence_score})</span>
        <span class="run-meta">${new Date(r.timestamp).toLocaleDateString()} ${new Date(r.timestamp).toLocaleTimeString()}</span>
      </div>
      <div class="run-claim">${escapeHtml(r.claim.slice(0, 300))}</div>
      <div class="score-grid">
        <div class="score-header"></div>
        ${responses.map(m => `<div class="score-header">${m.model.split(':')[0]}</div>`).join('')}
        ${dims.map(dim => `
          <div class="score-dim">${dim}</div>
          ${responses.map(m => {
            const s = m.scores[dim];
            const cls = s >= 7 ? 'high' : s >= 4 ? 'mid' : 'low';
            return `<div class="score-val ${s !== null ? cls : ''}">${s !== null ? s : '?'}</div>`;
          }).join('')}
        `).join('')}
        <div class="score-dim" style="font-weight:bold">VERDICT</div>
        ${responses.map(m => `<div class="score-val" style="font-weight:bold">${m.scores.VERDICT}</div>`).join('')}
      </div>
    </div>`;
  }).join('')}
</div>
`}

<script>
function escapeHtml(t){return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
</script>
</body>
</html>`;

  function avgDivClass(h) {
    const avg = h.reduce((s, r) => s + r.divergence_score, 0) / h.length;
    return avg <= 2 ? 'green' : avg <= 4 ? 'yellow' : avg <= 6 ? 'orange' : 'red';
  }

  function escapeHtml(t) {
    return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  fs.writeFileSync(DASHBOARD_PATH, html);
  return DASHBOARD_PATH;
}

// ── Telegram command registration ────────────────────────────────────────────

export function registerEnsembleCommands(bot) {
  const PAUL_CHAT_ID = process.env.PAUL_CHAT_ID ? parseInt(process.env.PAUL_CHAT_ID) : null;

  async function safeSend(chatId, text) {
    if (!text) return;
    text = String(text);
    const MAX = 4096;
    if (text.length <= MAX) return bot.sendMessage(chatId, text);
    const chunks = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= MAX) { chunks.push(remaining); break; }
      let cut = remaining.lastIndexOf('\n', MAX);
      if (cut < MAX * 0.3) cut = MAX;
      chunks.push(remaining.slice(0, cut));
      remaining = remaining.slice(cut).replace(/^\n+/, '');
    }
    for (const chunk of chunks) {
      await bot.sendMessage(chatId, chunk);
    }
  }

  // /ensemble <claim> — run ensemble gate on a claim
  bot.onText(/^\/ensemble(?:@\w+)?\s+(.+)$/s, async (msg, match) => {
    const chatId = msg.chat.id;
    if (PAUL_CHAT_ID && chatId !== PAUL_CHAT_ID) return;

    const claim = match[1].trim();
    await safeSend(chatId, `🔬 Ensemble Gate running...\n3 models evaluating claim. ~60-90s.\n\n"${claim.slice(0, 200)}${claim.length > 200 ? '...' : ''}"`);

    try {
      const run = await runEnsemble(claim);
      const text = formatTelegram(run);
      await safeSend(chatId, text);

      // Auto-generate dashboard
      const dashPath = generateDashboard();
      await safeSend(chatId, `Dashboard updated: ${dashPath}`);
    } catch (e) {
      await safeSend(chatId, `Ensemble Gate error: ${e.message}`);
    }
  });

  // /ensemble-history — show last 5 runs
  bot.onText(/^\/ensemble-history(?:@\w+)?$/, async (msg) => {
    const chatId = msg.chat.id;
    if (PAUL_CHAT_ID && chatId !== PAUL_CHAT_ID) return;

    const history = getHistory(5);
    if (history.length === 0) {
      return safeSend(chatId, 'No ensemble runs yet. Use /ensemble <claim> to start.');
    }

    const signalEmoji = { 'CONSENSUS': '🟢', 'MILD_DIVERGENCE': '🟡', 'SIGNIFICANT_DIVERGENCE': '🟠', 'HIGH_DIVERGENCE': '🔴' };
    let text = 'Last 5 Ensemble Runs:\n\n';
    for (const r of history) {
      text += `${signalEmoji[r.verdict] || '⚪'} ${r.divergence_score}/10 — "${r.claim.slice(0, 80)}..."\n`;
      text += `   ${new Date(r.timestamp).toLocaleDateString()}\n\n`;
    }
    await safeSend(chatId, text);
  });

  // /ensemble-dashboard — regenerate and link dashboard
  bot.onText(/^\/ensemble-dashboard(?:@\w+)?$/, async (msg) => {
    const chatId = msg.chat.id;
    if (PAUL_CHAT_ID && chatId !== PAUL_CHAT_ID) return;
    const dashPath = generateDashboard();
    await safeSend(chatId, `Dashboard regenerated: ${dashPath}`);
  });
}
