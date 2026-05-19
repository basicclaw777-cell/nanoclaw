// ── Bayesian Causal Net (#2) — Epistemic Engine Phase 2b ──────────────────────
// Maps causal dependencies between vault claims.
// "If claim A is wrong, what else falls?"
//
// Uses: Ensemble Gate output (flagged claims) + Knowledge Graph (embeddings)
//       + LLM to identify causal relationships
// Produces: dependency graph, blast radius scores, cascade warnings
// Feeds: Genius Council
// ──────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(process.env.HOME, 'nanoclaw', '.env') });

const HOME = process.env.HOME;
const CAUSAL_DB = path.join(HOME, 'nanoclaw', 'vortex_data', 'causal-net.db');
const ENSEMBLE_DB = path.join(HOME, 'nanoclaw', 'vortex_data', 'ensemble.db');
const METRICS_DB = path.join(HOME, 'nanoclaw', 'vortex_data', 'metrics.db');
const DASHBOARD_PATH = path.join(HOME, 'nanoclaw', 'causal-net-dashboard.html');
const OLLAMA_URL = 'http://localhost:11434';

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const PAUL_CHAT_ID = process.env.PAUL_CHAT_ID ? parseInt(process.env.PAUL_CHAT_ID) : null;

// ── DB setup ─────────────────────────────────────────────────────────────────

function getCausalDb() {
  const db = new Database(CAUSAL_DB);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_claim TEXT NOT NULL,
      target_claim TEXT NOT NULL,
      relationship TEXT NOT NULL,
      strength REAL DEFAULT 0.5,
      direction TEXT DEFAULT 'supports',
      reasoning TEXT,
      discovered_at TEXT DEFAULT (datetime('now')),
      UNIQUE(source_claim, target_claim)
    );
    CREATE TABLE IF NOT EXISTS blast_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      root_claim TEXT NOT NULL,
      blast_radius INTEGER,
      cascade_depth INTEGER,
      affected_claims TEXT,
      risk_score REAL,
      computed_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS claim_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      claim TEXT UNIQUE NOT NULL,
      source TEXT,
      domain TEXT,
      ensemble_score REAL,
      ensemble_signal TEXT,
      last_evaluated TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_claim);
    CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_claim);
    CREATE INDEX IF NOT EXISTS idx_blast_risk ON blast_reports(risk_score);
  `);
  return db;
}

// ── Get embedding for similarity search ──────────────────────────────────────

async function getEmbedding(text) {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'nomic-embed-text', prompt: text })
  });
  const data = await res.json();
  return data.embedding ? new Float32Array(data.embedding) : null;
}

function cosineSim(a, b) {
  let dot = 0, nA = 0, nB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; nA += a[i] * a[i]; nB += b[i] * b[i];
  }
  const d = Math.sqrt(nA) * Math.sqrt(nB);
  return d === 0 ? 0 : dot / d;
}

// ── Find related claims from vault embeddings ────────────────────────────────

function findRelatedClaims(claimVec, limit = 15) {
  try {
    const db = new Database(METRICS_DB, { readonly: true });
    const rows = db.prepare(`
      SELECT file_path, domain, title, first_line, embedding
      FROM vault_embeddings WHERE embedding IS NOT NULL
    `).all();
    db.close();

    const scored = rows.map(r => {
      const vec = new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength / 4);
      return {
        filePath: r.file_path,
        domain: r.domain,
        title: r.title,
        firstLine: r.first_line,
        similarity: cosineSim(claimVec, vec)
      };
    });
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, limit);
  } catch (e) {
    console.error('[causal-net] Related claims error:', e.message);
    return [];
  }
}

// ── LLM: identify causal relationships ───────────────────────────────────────

const CAUSAL_PROMPT = `You are a causal relationship analyzer. Given a ROOT CLAIM and a RELATED NUGGET, determine if there is a causal or dependency relationship.

Possible relationships:
- SUPPORTS: the nugget provides evidence or foundation for the root claim
- DEPENDS: the root claim depends on the nugget being true
- CONTRADICTS: the nugget contradicts or undermines the root claim
- EXTENDS: the nugget extends or builds upon the root claim
- NONE: no meaningful causal connection

Respond in EXACTLY this format:
RELATIONSHIP: [one of above]
STRENGTH: [0.1 to 1.0, how strong the connection is]
DIRECTION: [which way causality flows: "nugget->claim" or "claim->nugget" or "bidirectional"]
REASONING: [one sentence explaining the causal link]

If NONE, still fill all fields with STRENGTH: 0.0.`;

async function identifyCausalLink(rootClaim, nuggetTitle, nuggetContent) {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen3:14b',
        messages: [
          { role: 'system', content: CAUSAL_PROMPT },
          { role: 'user', content: `ROOT CLAIM: "${rootClaim}"\n\nRELATED NUGGET:\nTitle: ${nuggetTitle}\nContent: ${nuggetContent?.slice(0, 500) || 'N/A'}` }
        ],
        stream: false,
        options: { temperature: 0.2, num_predict: 300 }
      })
    });
    const data = await res.json();
    const text = data.message?.content || '';

    const relMatch = text.match(/RELATIONSHIP:\s*(SUPPORTS|DEPENDS|CONTRADICTS|EXTENDS|NONE)/i);
    const strMatch = text.match(/STRENGTH:\s*([\d.]+)/);
    const dirMatch = text.match(/DIRECTION:\s*(.+)/i);
    const reasonMatch = text.match(/REASONING:\s*(.+)/i);

    return {
      relationship: relMatch ? relMatch[1].toUpperCase() : 'NONE',
      strength: strMatch ? parseFloat(strMatch[1]) : 0,
      direction: dirMatch ? dirMatch[1].trim() : 'unknown',
      reasoning: reasonMatch ? reasonMatch[1].trim() : ''
    };
  } catch (e) {
    return { relationship: 'NONE', strength: 0, direction: 'error', reasoning: e.message };
  }
}

// ── Build causal edges for a claim ───────────────────────────────────────────

export async function mapCausalEdges(claim, source = 'manual') {
  console.log(`[causal-net] Mapping edges for: "${claim.slice(0, 80)}..."`);

  // Get embedding for the claim
  const claimVec = await getEmbedding(claim);
  if (!claimVec) return { error: 'Failed to embed claim' };

  // Find related vault nuggets
  const related = findRelatedClaims(claimVec, 10);
  console.log(`[causal-net] Found ${related.length} related nuggets`);

  const db = getCausalDb();

  // Register claim as node
  db.prepare(`
    INSERT OR REPLACE INTO claim_nodes (claim, source, domain, last_evaluated)
    VALUES (?, ?, ?, datetime('now'))
  `).run(claim, source, related[0]?.domain || 'unknown');

  const edges = [];

  // Analyze top 8 related nuggets for causal links (skip very weak matches)
  const candidates = related.filter(r => r.similarity > 0.5).slice(0, 8);

  for (const nugget of candidates) {
    // Read nugget content
    let content = '';
    try {
      content = fs.readFileSync(nugget.filePath, 'utf8').slice(0, 1000);
    } catch {}

    const link = await identifyCausalLink(claim, nugget.title, content);

    if (link.relationship !== 'NONE' && link.strength > 0.2) {
      edges.push({
        target: nugget.title,
        targetDomain: nugget.domain,
        similarity: nugget.similarity,
        ...link
      });

      // Store edge
      db.prepare(`
        INSERT OR REPLACE INTO edges (source_claim, target_claim, relationship, strength, direction, reasoning)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(claim, nugget.title, link.relationship, link.strength, link.direction, link.reasoning);
    }
  }

  db.close();
  console.log(`[causal-net] ${edges.length} causal edges found`);
  return { claim, edges, candidatesChecked: candidates.length };
}

// ── Compute blast radius ─────────────────────────────────────────────────────

export function computeBlastRadius(claim) {
  const db = getCausalDb();

  // BFS from the claim through all dependency edges
  const visited = new Set();
  const queue = [{ claim, depth: 0 }];
  const affected = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current.claim)) continue;
    visited.add(current.claim);

    // Find all edges where this claim is the source
    const outgoing = db.prepare(`
      SELECT target_claim, relationship, strength, reasoning
      FROM edges WHERE source_claim = ? AND relationship IN ('SUPPORTS', 'DEPENDS', 'EXTENDS')
    `).all(current.claim);

    // Find edges where this claim is the target and relationship is DEPENDS
    const incoming = db.prepare(`
      SELECT source_claim as target_claim, relationship, strength, reasoning
      FROM edges WHERE target_claim = ? AND relationship = 'DEPENDS'
    `).all(current.claim);

    for (const edge of [...outgoing, ...incoming]) {
      if (!visited.has(edge.target_claim)) {
        const item = {
          claim: edge.target_claim,
          depth: current.depth + 1,
          relationship: edge.relationship,
          strength: edge.strength,
          reasoning: edge.reasoning,
          via: current.claim
        };
        affected.push(item);
        queue.push({ claim: edge.target_claim, depth: current.depth + 1 });
      }
    }
  }

  // Risk score: sum of (strength / depth) for all affected nodes
  const riskScore = affected.reduce((sum, a) => sum + (a.strength / (a.depth || 1)), 0);
  const maxDepth = affected.reduce((max, a) => Math.max(max, a.depth), 0);

  // Store report
  db.prepare(`
    INSERT INTO blast_reports (root_claim, blast_radius, cascade_depth, affected_claims, risk_score)
    VALUES (?, ?, ?, ?, ?)
  `).run(claim, affected.length, maxDepth, JSON.stringify(affected), riskScore);

  db.close();

  return {
    rootClaim: claim,
    blastRadius: affected.length,
    cascadeDepth: maxDepth,
    riskScore: Math.round(riskScore * 100) / 100,
    affected: affected.sort((a, b) => a.depth - b.depth)
  };
}

// ── Auto-process Ensemble Gate flags ─────────────────────────────────────────

export async function processEnsembleFlags() {
  console.log('[causal-net] Checking Ensemble Gate for flagged claims...');

  let flaggedClaims = [];
  try {
    const eDb = new Database(ENSEMBLE_DB, { readonly: true });
    flaggedClaims = eDb.prepare(`
      SELECT claim, divergence_score, verdict
      FROM ensemble_runs
      WHERE divergence_score > 3
      ORDER BY timestamp DESC LIMIT 10
    `).all();
    eDb.close();
  } catch (e) {
    console.error('[causal-net] Cannot read ensemble DB:', e.message);
    return [];
  }

  // Check which haven't been mapped yet
  const cDb = getCausalDb();
  const mapped = new Set(
    cDb.prepare('SELECT claim FROM claim_nodes').all().map(r => r.claim)
  );
  cDb.close();

  const unmapped = flaggedClaims.filter(f => !mapped.has(f.claim));
  console.log(`[causal-net] ${flaggedClaims.length} flagged, ${unmapped.length} unmapped`);

  const results = [];
  for (const flag of unmapped.slice(0, 3)) { // Process max 3 per run
    const edgeResult = await mapCausalEdges(flag.claim, 'ensemble-gate');
    if (edgeResult.edges?.length > 0) {
      const blast = computeBlastRadius(flag.claim);
      results.push({ flag, edges: edgeResult.edges, blast });
    }
  }

  return results;
}

// ── Format for Telegram ──────────────────────────────────────────────────────

export function formatBlastReport(blast) {
  const riskEmoji = blast.riskScore > 5 ? '🔴' : blast.riskScore > 2 ? '🟠' : blast.riskScore > 1 ? '🟡' : '🟢';

  let text = `${riskEmoji} CAUSAL NET — BLAST RADIUS\n`;
  text += `Risk Score: ${blast.riskScore} | Affected: ${blast.blastRadius} | Depth: ${blast.cascadeDepth}\n\n`;
  text += `Root: "${blast.rootClaim.slice(0, 200)}"\n\n`;

  if (blast.affected.length === 0) {
    text += 'No downstream dependencies found. Claim is isolated.\n';
    return text;
  }

  text += `CASCADE:\n`;
  for (const a of blast.affected.slice(0, 10)) {
    const indent = '  '.repeat(a.depth);
    const arrow = a.relationship === 'DEPENDS' ? '⬆ depends on' :
                  a.relationship === 'SUPPORTS' ? '⬇ supports' :
                  a.relationship === 'EXTENDS' ? '↗ extends' : '↔';
    text += `${indent}${arrow} [${a.strength.toFixed(1)}] ${a.claim.slice(0, 60)}\n`;
    if (a.reasoning) text += `${indent}   ${a.reasoning.slice(0, 80)}\n`;
  }

  if (blast.affected.length > 10) {
    text += `\n... and ${blast.affected.length - 10} more affected claims\n`;
  }

  return text;
}

export function formatEdgeReport(result) {
  let text = `CAUSAL NET — EDGE MAP\n`;
  text += `Claim: "${result.claim.slice(0, 150)}"\n`;
  text += `${result.edges.length} causal edges found (${result.candidatesChecked} candidates checked)\n\n`;

  const grouped = {};
  for (const e of result.edges) {
    if (!grouped[e.relationship]) grouped[e.relationship] = [];
    grouped[e.relationship].push(e);
  }

  for (const [rel, edges] of Object.entries(grouped)) {
    const emoji = rel === 'SUPPORTS' ? '🟢' : rel === 'DEPENDS' ? '🔵' :
                  rel === 'CONTRADICTS' ? '🔴' : rel === 'EXTENDS' ? '🟡' : '⚪';
    text += `${emoji} ${rel}:\n`;
    for (const e of edges) {
      text += `  [${e.strength.toFixed(1)}] ${e.target.slice(0, 50)} (${e.targetDomain})\n`;
      if (e.reasoning) text += `     ${e.reasoning.slice(0, 80)}\n`;
    }
    text += '\n';
  }

  return text;
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export function generateCausalDashboard() {
  let nodes = [];
  let edges = [];
  let blasts = [];

  try {
    const db = getCausalDb();
    nodes = db.prepare('SELECT * FROM claim_nodes ORDER BY last_evaluated DESC').all();
    edges = db.prepare('SELECT * FROM edges ORDER BY strength DESC').all();
    blasts = db.prepare('SELECT * FROM blast_reports ORDER BY risk_score DESC LIMIT 20').all();
    db.close();
  } catch {}

  // Count relationships
  const relCounts = {};
  for (const e of edges) {
    relCounts[e.relationship] = (relCounts[e.relationship] || 0) + 1;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Causal Net — Epistemic Engine</title>
<style>
  :root {
    --bg: #0d1117; --surface: #161b22; --border: #30363d;
    --text: #e6edf3; --dim: #8b949e; --accent: #58a6ff;
    --green: #3fb950; --yellow: #d29922; --orange: #db6d28; --red: #f85149;
    --blue: #58a6ff; --purple: #bc8cff;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'SF Mono', 'Fira Code', monospace; background: var(--bg); color: var(--text); padding: 20px; }
  h1 { font-size: 1.4em; margin-bottom: 4px; }
  .subtitle { color: var(--dim); font-size: 0.85em; margin-bottom: 24px; }

  .stats-bar { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
  .stat-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
    padding: 16px 20px; min-width: 120px; flex: 1;
  }
  .stat-label { color: var(--dim); font-size: 0.75em; text-transform: uppercase; letter-spacing: 1px; }
  .stat-value { font-size: 1.8em; font-weight: bold; margin-top: 4px; color: var(--accent); }

  .section { margin-bottom: 32px; }
  .section-title { font-size: 1.1em; margin-bottom: 12px; color: var(--accent); }

  .rel-bar { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
  .rel-chip {
    font-size: 0.75em; padding: 4px 10px; border-radius: 12px;
    display: flex; align-items: center; gap: 4px;
  }
  .rel-supports { background: rgba(63,185,80,0.15); color: var(--green); }
  .rel-depends { background: rgba(88,166,255,0.15); color: var(--blue); }
  .rel-contradicts { background: rgba(248,81,73,0.15); color: var(--red); }
  .rel-extends { background: rgba(210,153,34,0.15); color: var(--yellow); }

  .blast-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
    padding: 16px; margin-bottom: 10px;
  }
  .blast-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .blast-risk { font-weight: bold; }
  .risk-high { color: var(--red); }
  .risk-med { color: var(--orange); }
  .risk-low { color: var(--green); }
  .blast-claim { font-size: 0.85em; color: var(--dim); line-height: 1.4; }
  .blast-stats { font-size: 0.75em; color: var(--dim); margin-top: 6px; }

  .edge-row {
    display: grid; grid-template-columns: 1fr auto auto 1fr; gap: 8px; align-items: center;
    font-size: 0.8em; padding: 8px 12px;
    background: var(--surface); border: 1px solid var(--border); border-radius: 6px;
    margin-bottom: 4px;
  }
  .edge-rel { font-size: 0.7em; padding: 2px 6px; border-radius: 8px; text-align: center; }
  .edge-strength { color: var(--dim); font-size: 0.7em; }

  .empty-state { text-align: center; padding: 60px; color: var(--dim); }
</style>
</head>
<body>
<h1>Causal Net</h1>
<p class="subtitle">Epistemic Engine — Dependency & Blast Radius Map</p>

<div class="stats-bar">
  <div class="stat-card">
    <div class="stat-label">Claims Mapped</div>
    <div class="stat-value">${nodes.length}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Causal Edges</div>
    <div class="stat-value">${edges.length}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Blast Reports</div>
    <div class="stat-value">${blasts.length}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Avg Risk</div>
    <div class="stat-value ${blasts.length > 0 ? (blasts.reduce((s, b) => s + b.risk_score, 0) / blasts.length > 3 ? 'risk-high' : 'risk-low') : ''}">${blasts.length > 0 ? (blasts.reduce((s, b) => s + b.risk_score, 0) / blasts.length).toFixed(1) : '—'}</div>
  </div>
</div>

${edges.length > 0 ? `
<div class="rel-bar">
  ${Object.entries(relCounts).map(([rel, count]) => `<span class="rel-chip rel-${rel.toLowerCase()}">${rel} (${count})</span>`).join('')}
</div>
` : ''}

${blasts.length > 0 ? `
<div class="section">
  <h2 class="section-title" style="color:var(--red)">Blast Radius Reports</h2>
  ${blasts.map(b => {
    const riskClass = b.risk_score > 5 ? 'risk-high' : b.risk_score > 2 ? 'risk-med' : 'risk-low';
    return `
    <div class="blast-card">
      <div class="blast-header">
        <span class="blast-risk ${riskClass}">Risk: ${b.risk_score.toFixed(1)}</span>
        <span style="color:var(--dim);font-size:0.75em">${new Date(b.computed_at).toLocaleDateString()}</span>
      </div>
      <div class="blast-claim">${esc(b.root_claim.slice(0, 200))}</div>
      <div class="blast-stats">Affected: ${b.blast_radius} claims | Cascade depth: ${b.cascade_depth}</div>
    </div>`;
  }).join('')}
</div>
` : ''}

${edges.length > 0 ? `
<div class="section">
  <h2 class="section-title">Causal Edges (strongest first)</h2>
  ${edges.slice(0, 30).map(e => {
    const relClass = e.relationship.toLowerCase();
    return `
    <div class="edge-row">
      <span>${esc(e.source_claim.slice(0, 50))}</span>
      <span class="edge-rel rel-${relClass}">${e.relationship}</span>
      <span class="edge-strength">${e.strength.toFixed(1)}</span>
      <span>${esc(e.target_claim.slice(0, 50))}</span>
    </div>`;
  }).join('')}
</div>
` : `
<div class="empty-state">
  <h2>No causal edges yet</h2>
  <p>Use /causemap [claim] or let the auto-processor run on Ensemble Gate flags</p>
</div>
`}

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

export function registerCausalCommands(bot) {
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

  // /causemap <claim> — map causal edges for a claim
  bot.onText(/^\/causemap(?:@\w+)?\s+(.+)$/s, async (msg, match) => {
    const chatId = msg.chat.id;
    if (PAUL && chatId !== PAUL) return;
    const claim = match[1].trim();
    await safeSend(chatId, `Mapping causal edges for "${claim.slice(0, 100)}..."...\nChecking vault for dependencies. ~60-90s.`);
    try {
      const result = await mapCausalEdges(claim);
      await safeSend(chatId, formatEdgeReport(result));

      if (result.edges?.length > 0) {
        const blast = computeBlastRadius(claim);
        await safeSend(chatId, formatBlastReport(blast));
      }

      generateCausalDashboard();
      await safeSend(chatId, `Dashboard updated: ${DASHBOARD_PATH}`);
    } catch (e) {
      await safeSend(chatId, `Causal mapping error: ${e.message}`);
    }
  });

  // /blast <claim> — compute blast radius only (if edges already mapped)
  bot.onText(/^\/blast(?:@\w+)?\s+(.+)$/s, async (msg, match) => {
    const chatId = msg.chat.id;
    if (PAUL && chatId !== PAUL) return;
    const claim = match[1].trim();
    try {
      const blast = computeBlastRadius(claim);
      await safeSend(chatId, formatBlastReport(blast));
    } catch (e) {
      await safeSend(chatId, `Blast radius error: ${e.message}`);
    }
  });

  // /causal-dashboard — regenerate dashboard
  bot.onText(/^\/causal-dashboard(?:@\w+)?$/, async (msg) => {
    const chatId = msg.chat.id;
    if (PAUL && chatId !== PAUL) return;
    const dash = generateCausalDashboard();
    await safeSend(chatId, `Dashboard regenerated: ${dash}`);
  });
}

// ── Direct execution ─────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].includes('causal-net')) {
  console.log('[causal-net] Processing Ensemble Gate flags...');
  processEnsembleFlags().then(results => {
    if (results.length === 0) {
      console.log('[causal-net] No new flagged claims to process.');
    } else {
      for (const r of results) {
        console.log(formatEdgeReport({ claim: r.flag.claim, edges: r.edges, candidatesChecked: r.edges.length }));
        console.log(formatBlastReport(r.blast));
      }
    }
    generateCausalDashboard();
    process.exit(0);
  }).catch(e => {
    console.error('[causal-net] Fatal:', e);
    process.exit(1);
  });
}
