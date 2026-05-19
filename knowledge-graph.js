// ── Knowledge Graph Embeddings (#4) — Epistemic Engine Phase 2a ───────────────
// Embeds vault nuggets in vector space. Finds hidden connections between domains.
// "Your boxing methodology nuggets are mathematically close to your cosmology notes."
//
// Uses existing vault_embeddings (SQLite) + nomic-embed (Ollama).
// Produces: proximity clusters, cross-domain bridges, surprise connections.
// Feeds: all agents' context windows.
// ──────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(process.env.HOME, 'nanoclaw', '.env') });

const HOME = process.env.HOME;
const METRICS_DB = path.join(HOME, 'nanoclaw', 'vortex_data', 'metrics.db');
const GRAPH_DB = path.join(HOME, 'nanoclaw', 'vortex_data', 'knowledge-graph.db');
const DASHBOARD_PATH = path.join(HOME, 'nanoclaw', 'knowledge-graph-dashboard.html');
const OLLAMA_URL = 'http://localhost:11434';
const EMBED_MODEL = 'nomic-embed-text';

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const PAUL_CHAT_ID = process.env.PAUL_CHAT_ID ? parseInt(process.env.PAUL_CHAT_ID) : null;

// ── Graph DB setup ───────────────────────────────────────────────────────────

function getGraphDb() {
  const db = new Database(GRAPH_DB);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_path TEXT NOT NULL,
      target_path TEXT NOT NULL,
      source_domain TEXT,
      target_domain TEXT,
      source_title TEXT,
      target_title TEXT,
      similarity REAL NOT NULL,
      is_cross_domain INTEGER DEFAULT 0,
      discovered_at TEXT DEFAULT (datetime('now')),
      UNIQUE(source_path, target_path)
    );
    CREATE TABLE IF NOT EXISTS clusters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cluster_id INTEGER,
      file_path TEXT,
      domain TEXT,
      title TEXT,
      centroid_distance REAL,
      computed_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS surprises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_path TEXT,
      target_path TEXT,
      source_domain TEXT,
      target_domain TEXT,
      source_title TEXT,
      target_title TEXT,
      similarity REAL,
      surprise_score REAL,
      explanation TEXT,
      discovered_at TEXT DEFAULT (datetime('now')),
      reported INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_conn_cross ON connections(is_cross_domain);
    CREATE INDEX IF NOT EXISTS idx_conn_sim ON connections(similarity);
    CREATE INDEX IF NOT EXISTS idx_surprises_reported ON surprises(reported);
  `);
  return db;
}

// ── Load embeddings from SQLite ──────────────────────────────────────────────

function loadEmbeddings() {
  const db = new Database(METRICS_DB, { readonly: true });
  const rows = db.prepare(`
    SELECT file_path, domain, tags, title, first_line, embedding
    FROM vault_embeddings
    WHERE embedding IS NOT NULL
  `).all();
  db.close();

  return rows.map(r => ({
    filePath: r.file_path,
    domain: r.domain,
    tags: r.tags ? JSON.parse(r.tags) : [],
    title: r.title,
    firstLine: r.first_line,
    vector: new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength / 4)
  }));
}

// ── Cosine similarity ────────────────────────────────────────────────────────

function cosineSim(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Get embedding for a query ────────────────────────────────────────────────

async function getEmbedding(text) {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text })
  });
  const data = await res.json();
  return data.embedding ? new Float32Array(data.embedding) : null;
}

// ── K-Means clustering ───────────────────────────────────────────────────────

function kMeansClusters(items, k = 12, iterations = 20) {
  const dim = items[0].vector.length;

  // Initialize centroids from random items
  const indices = new Set();
  while (indices.size < Math.min(k, items.length)) {
    indices.add(Math.floor(Math.random() * items.length));
  }
  const centroids = [...indices].map(i => Float32Array.from(items[i].vector));

  let assignments = new Array(items.length).fill(0);

  for (let iter = 0; iter < iterations; iter++) {
    // Assign each item to nearest centroid
    for (let i = 0; i < items.length; i++) {
      let bestDist = -1;
      let bestC = 0;
      for (let c = 0; c < centroids.length; c++) {
        const sim = cosineSim(items[i].vector, centroids[c]);
        if (sim > bestDist) { bestDist = sim; bestC = c; }
      }
      assignments[i] = bestC;
    }

    // Recompute centroids
    for (let c = 0; c < centroids.length; c++) {
      const members = items.filter((_, i) => assignments[i] === c);
      if (members.length === 0) continue;
      const newCentroid = new Float32Array(dim);
      for (const m of members) {
        for (let d = 0; d < dim; d++) newCentroid[d] += m.vector[d];
      }
      for (let d = 0; d < dim; d++) newCentroid[d] /= members.length;
      centroids[c] = newCentroid;
    }
  }

  // Compute distances to centroid
  return items.map((item, i) => ({
    ...item,
    clusterId: assignments[i],
    centroidDistance: 1 - cosineSim(item.vector, centroids[assignments[i]])
  }));
}

// ── Find cross-domain bridges ────────────────────────────────────────────────

function findCrossDomainBridges(items, topN = 50, minSimilarity = 0.75) {
  const bridges = [];

  // Pre-filter: skip staging/archive duplicates
  const skipDomainPairs = new Set(['00_Staging', '05_Archive_Graveyard']);

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (items[i].domain === items[j].domain) continue; // Same domain = boring
      // Skip staging<->refined duplicates (same filename = not a real connection)
      const nameI = path.basename(items[i].filePath);
      const nameJ = path.basename(items[j].filePath);
      if (nameI === nameJ) continue;
      // Skip staging/archive entirely — they're copies, not real connections
      if (skipDomainPairs.has(items[i].domain) || skipDomainPairs.has(items[j].domain)) continue;
      const sim = cosineSim(items[i].vector, items[j].vector);
      if (sim >= minSimilarity) {
        bridges.push({
          source: items[i],
          target: items[j],
          similarity: sim
        });
      }
    }
  }

  // Sort by similarity descending, take top N
  bridges.sort((a, b) => b.similarity - a.similarity);
  return bridges.slice(0, topN);
}

// ── Surprise scoring ─────────────────────────────────────────────────────────
// High similarity + different domain + no shared tags = maximum surprise

function scoreSurprise(source, target, similarity) {
  const domainDiff = source.domain !== target.domain ? 1 : 0;
  const sharedTags = source.tags.filter(t => target.tags.includes(t)).length;
  const tagPenalty = Math.min(sharedTags * 0.2, 0.6); // Shared tags reduce surprise
  const wikilinked = 0; // Could check wikilinks later

  // Surprise = similarity * domain_difference - tag_overlap
  return Math.max(0, similarity * domainDiff - tagPenalty - wikilinked);
}

// ── Query: find connections for a topic ──────────────────────────────────────

export async function findConnections(query, limit = 10) {
  const items = loadEmbeddings();
  const queryVec = await getEmbedding(query);
  if (!queryVec) return [];

  // Find most similar items
  const scored = items.map(item => ({
    ...item,
    similarity: cosineSim(item.vector, queryVec)
  }));
  scored.sort((a, b) => b.similarity - a.similarity);

  // Top matches
  const topMatches = scored.slice(0, limit);

  // Also find what those top matches connect to (second-degree connections)
  const secondDegree = [];
  for (const match of topMatches.slice(0, 3)) {
    const related = items
      .filter(it => it.filePath !== match.filePath && it.domain !== match.domain)
      .map(it => ({
        ...it,
        similarity: cosineSim(it.vector, match.vector),
        via: match.title
      }))
      .filter(it => it.similarity > 0.7)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3);
    secondDegree.push(...related);
  }

  return {
    direct: topMatches,
    bridges: secondDegree.filter((v, i, a) => a.findIndex(t => t.filePath === v.filePath) === i)
  };
}

// ── Full graph computation ───────────────────────────────────────────────────

export async function computeFullGraph() {
  console.log('[knowledge-graph] Loading embeddings...');
  const items = loadEmbeddings();
  console.log(`[knowledge-graph] ${items.length} items loaded`);

  if (items.length < 10) {
    console.log('[knowledge-graph] Too few embeddings. Run vault-embedder.js first.');
    return null;
  }

  // 1. Cluster
  console.log('[knowledge-graph] Computing clusters...');
  const k = Math.min(Math.max(Math.floor(items.length / 30), 5), 20);
  const clustered = kMeansClusters(items, k);

  // 2. Find cross-domain bridges
  console.log('[knowledge-graph] Finding cross-domain bridges...');
  const bridges = findCrossDomainBridges(items, 100, 0.72);

  // 3. Score surprises
  console.log('[knowledge-graph] Scoring surprises...');
  const surprises = bridges
    .map(b => ({
      ...b,
      surpriseScore: scoreSurprise(b.source, b.target, b.similarity)
    }))
    .filter(s => s.surpriseScore > 0.3)
    .sort((a, b) => b.surpriseScore - a.surpriseScore)
    .slice(0, 20);

  // 4. Store in DB
  const graphDb = getGraphDb();

  // Clear old data
  graphDb.exec('DELETE FROM clusters');
  graphDb.exec('DELETE FROM connections');

  // Store clusters
  const insertCluster = graphDb.prepare(
    'INSERT INTO clusters (cluster_id, file_path, domain, title, centroid_distance) VALUES (?, ?, ?, ?, ?)'
  );
  const clusterTx = graphDb.transaction(() => {
    for (const item of clustered) {
      insertCluster.run(item.clusterId, item.filePath, item.domain, item.title, item.centroidDistance);
    }
  });
  clusterTx();

  // Store bridges
  const insertConn = graphDb.prepare(
    'INSERT OR IGNORE INTO connections (source_path, target_path, source_domain, target_domain, source_title, target_title, similarity, is_cross_domain) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const connTx = graphDb.transaction(() => {
    for (const b of bridges) {
      insertConn.run(
        b.source.filePath, b.target.filePath,
        b.source.domain, b.target.domain,
        b.source.title, b.target.title,
        b.similarity, b.source.domain !== b.target.domain ? 1 : 0
      );
    }
  });
  connTx();

  // Store new surprises (check for duplicates)
  const insertSurprise = graphDb.prepare(`
    INSERT INTO surprises (source_path, target_path, source_domain, target_domain, source_title, target_title, similarity, surprise_score)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM surprises WHERE source_path = ? AND target_path = ?)
  `);
  const surpriseTx = graphDb.transaction(() => {
    for (const s of surprises) {
      insertSurprise.run(
        s.source.filePath, s.target.filePath,
        s.source.domain, s.target.domain,
        s.source.title, s.target.title,
        s.similarity, s.surpriseScore,
        s.source.filePath, s.target.filePath
      );
    }
  });
  surpriseTx();

  graphDb.close();

  // Compute cluster stats for return
  const clusterStats = {};
  for (const item of clustered) {
    if (!clusterStats[item.clusterId]) {
      clusterStats[item.clusterId] = { domains: {}, count: 0, titles: [] };
    }
    clusterStats[item.clusterId].count++;
    clusterStats[item.clusterId].domains[item.domain] = (clusterStats[item.clusterId].domains[item.domain] || 0) + 1;
    if (clusterStats[item.clusterId].titles.length < 5) {
      clusterStats[item.clusterId].titles.push(item.title?.slice(0, 60));
    }
  }

  return {
    totalItems: items.length,
    clusterCount: k,
    clusterStats,
    bridgeCount: bridges.length,
    surpriseCount: surprises.length,
    topSurprises: surprises.slice(0, 5).map(s => ({
      source: { domain: s.source.domain, title: s.source.title },
      target: { domain: s.target.domain, title: s.target.title },
      similarity: Math.round(s.similarity * 100) / 100,
      surpriseScore: Math.round(s.surpriseScore * 100) / 100
    }))
  };
}

// ── Get unreported surprises ─────────────────────────────────────────────────

export function getUnreportedSurprises(limit = 5) {
  try {
    const db = getGraphDb();
    const rows = db.prepare(`
      SELECT * FROM surprises WHERE reported = 0
      ORDER BY surprise_score DESC LIMIT ?
    `).all(limit);
    db.close();
    return rows;
  } catch { return []; }
}

export function markSurprisesReported(ids) {
  try {
    const db = getGraphDb();
    const stmt = db.prepare('UPDATE surprises SET reported = 1 WHERE id = ?');
    for (const id of ids) stmt.run(id);
    db.close();
  } catch {}
}

// ── Format for Telegram ──────────────────────────────────────────────────────

export function formatGraphReport(result) {
  if (!result) return 'Knowledge Graph: insufficient data. Run vault-embedder.js first.';

  let text = `KNOWLEDGE GRAPH — SCAN COMPLETE\n`;
  text += `${result.totalItems} nuggets | ${result.clusterCount} clusters | ${result.bridgeCount} cross-domain bridges\n\n`;

  if (result.topSurprises.length > 0) {
    text += `SURPRISE CONNECTIONS (high similarity, different domains, no shared tags):\n\n`;
    for (const s of result.topSurprises) {
      text += `[${s.source.domain}] ${s.source.title?.slice(0, 50)}\n`;
      text += `  <-> [${s.target.domain}] ${s.target.title?.slice(0, 50)}\n`;
      text += `  Similarity: ${(s.similarity * 100).toFixed(0)}% | Surprise: ${(s.surpriseScore * 100).toFixed(0)}%\n\n`;
    }
  }

  // Cluster summary — most interesting = most multi-domain
  const multiDomain = Object.entries(result.clusterStats)
    .map(([id, stats]) => ({ id, ...stats, domainCount: Object.keys(stats.domains).length }))
    .filter(c => c.domainCount >= 3)
    .sort((a, b) => b.domainCount - a.domainCount)
    .slice(0, 3);

  if (multiDomain.length > 0) {
    text += `MOST INTERCONNECTED CLUSTERS:\n`;
    for (const c of multiDomain) {
      const domStr = Object.entries(c.domains).sort((a, b) => b[1] - a[1]).map(([d, n]) => `${d}(${n})`).join(', ');
      text += `Cluster ${c.id}: ${c.count} nuggets across ${c.domainCount} domains\n`;
      text += `  Domains: ${domStr}\n`;
      text += `  Sample: ${c.titles.slice(0, 3).join(' | ')}\n\n`;
    }
  }

  return text;
}

export function formatConnectionsReport(result, query) {
  let text = `CONNECTIONS: "${query}"\n\n`;

  if (result.direct.length > 0) {
    text += `DIRECT MATCHES:\n`;
    for (const d of result.direct.slice(0, 7)) {
      text += `  ${(d.similarity * 100).toFixed(0)}% [${d.domain}] ${d.title?.slice(0, 60)}\n`;
    }
    text += '\n';
  }

  if (result.bridges.length > 0) {
    text += `HIDDEN BRIDGES (connected through top matches):\n`;
    for (const b of result.bridges.slice(0, 5)) {
      text += `  ${(b.similarity * 100).toFixed(0)}% [${b.domain}] ${b.title?.slice(0, 50)} (via ${b.via?.slice(0, 30)})\n`;
    }
  }

  return text;
}

// ── Dashboard generation ─────────────────────────────────────────────────────

export function generateGraphDashboard() {
  let clusterData = [];
  let connectionData = [];
  let surpriseData = [];

  try {
    const db = getGraphDb();
    clusterData = db.prepare(`
      SELECT cluster_id, domain, title, centroid_distance
      FROM clusters ORDER BY cluster_id, centroid_distance
    `).all();
    connectionData = db.prepare(`
      SELECT source_domain, target_domain, source_title, target_title, similarity
      FROM connections WHERE is_cross_domain = 1
      ORDER BY similarity DESC LIMIT 50
    `).all();
    surpriseData = db.prepare(`
      SELECT source_domain, target_domain, source_title, target_title, similarity, surprise_score
      FROM surprises ORDER BY surprise_score DESC LIMIT 20
    `).all();
    db.close();
  } catch {}

  // Compute cluster summaries for visualization
  const clusterMap = {};
  for (const row of clusterData) {
    if (!clusterMap[row.cluster_id]) clusterMap[row.cluster_id] = { domains: {}, items: [] };
    clusterMap[row.cluster_id].domains[row.domain] = (clusterMap[row.cluster_id].domains[row.domain] || 0) + 1;
    if (clusterMap[row.cluster_id].items.length < 8) {
      clusterMap[row.cluster_id].items.push({ domain: row.domain, title: row.title, dist: row.centroid_distance });
    }
  }

  // Domain color map
  const allDomains = [...new Set(clusterData.map(r => r.domain))];
  const domainColors = {};
  const palette = [
    '#58a6ff', '#3fb950', '#d29922', '#f85149', '#bc8cff',
    '#f778ba', '#79c0ff', '#56d364', '#e3b341', '#ff7b72',
    '#d2a8ff', '#ff9bce', '#a5d6ff', '#7ee787', '#f0c048',
    '#ffa198', '#cabffd', '#ffbedd'
  ];
  allDomains.forEach((d, i) => { domainColors[d] = palette[i % palette.length]; });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Knowledge Graph — Epistemic Engine</title>
<style>
  :root {
    --bg: #0d1117; --surface: #161b22; --border: #30363d;
    --text: #e6edf3; --dim: #8b949e; --accent: #58a6ff;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'SF Mono', 'Fira Code', monospace; background: var(--bg); color: var(--text); padding: 20px; }
  h1 { font-size: 1.4em; margin-bottom: 4px; }
  .subtitle { color: var(--dim); font-size: 0.85em; margin-bottom: 24px; }

  .stats-bar { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
  .stat-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
    padding: 16px 20px; min-width: 140px; flex: 1;
  }
  .stat-label { color: var(--dim); font-size: 0.75em; text-transform: uppercase; letter-spacing: 1px; }
  .stat-value { font-size: 1.8em; font-weight: bold; margin-top: 4px; color: var(--accent); }

  .section { margin-bottom: 32px; }
  .section-title { font-size: 1.1em; margin-bottom: 12px; color: var(--accent); }

  .domain-legend { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
  .domain-tag {
    font-size: 0.7em; padding: 2px 8px; border-radius: 4px;
    border: 1px solid transparent;
  }

  .cluster-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
  .cluster-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
    padding: 14px; cursor: pointer; transition: border-color 0.2s;
  }
  .cluster-card:hover { border-color: var(--accent); }
  .cluster-header { display: flex; justify-content: space-between; margin-bottom: 8px; }
  .cluster-id { font-weight: bold; color: var(--accent); }
  .cluster-count { color: var(--dim); font-size: 0.8em; }
  .cluster-domains { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
  .cluster-domain { font-size: 0.65em; padding: 1px 6px; border-radius: 3px; }
  .cluster-items { font-size: 0.75em; color: var(--dim); line-height: 1.6; }

  .surprise-list { display: flex; flex-direction: column; gap: 10px; }
  .surprise-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
    padding: 14px; border-left: 3px solid #f85149;
  }
  .surprise-domains { font-size: 0.8em; margin-bottom: 6px; }
  .surprise-titles { font-size: 0.85em; color: var(--dim); line-height: 1.5; }
  .surprise-score { font-size: 0.75em; color: #f85149; margin-top: 6px; }

  .bridge-list { display: flex; flex-direction: column; gap: 6px; }
  .bridge-row {
    display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: center;
    font-size: 0.8em; padding: 8px 12px;
    background: var(--surface); border: 1px solid var(--border); border-radius: 6px;
  }
  .bridge-arrow { color: var(--accent); font-weight: bold; }
  .bridge-sim { font-size: 0.7em; color: var(--dim); }
</style>
</head>
<body>
<h1>Knowledge Graph</h1>
<p class="subtitle">Epistemic Engine — Cross-Domain Connection Map</p>

<div class="stats-bar">
  <div class="stat-card">
    <div class="stat-label">Nuggets</div>
    <div class="stat-value">${clusterData.length}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Clusters</div>
    <div class="stat-value">${Object.keys(clusterMap).length}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Cross-Domain Bridges</div>
    <div class="stat-value">${connectionData.length}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Surprises</div>
    <div class="stat-value" style="color:#f85149">${surpriseData.length}</div>
  </div>
</div>

<div class="domain-legend">
  ${allDomains.map(d => `<span class="domain-tag" style="background:${domainColors[d]}22;color:${domainColors[d]};border-color:${domainColors[d]}44">${d}</span>`).join('')}
</div>

${surpriseData.length > 0 ? `
<div class="section">
  <h2 class="section-title" style="color:#f85149">Surprise Connections</h2>
  <p style="color:var(--dim);font-size:0.8em;margin-bottom:12px">High similarity between nuggets from different domains with no shared tags</p>
  <div class="surprise-list">
    ${surpriseData.slice(0, 10).map(s => `
    <div class="surprise-card">
      <div class="surprise-domains">
        <span class="domain-tag" style="background:${domainColors[s.source_domain] || '#888'}22;color:${domainColors[s.source_domain] || '#888'}">${s.source_domain}</span>
        <span style="color:var(--dim);margin:0 4px">↔</span>
        <span class="domain-tag" style="background:${domainColors[s.target_domain] || '#888'}22;color:${domainColors[s.target_domain] || '#888'}">${s.target_domain}</span>
      </div>
      <div class="surprise-titles">
        ${esc(s.source_title?.slice(0, 70))}<br>
        ${esc(s.target_title?.slice(0, 70))}
      </div>
      <div class="surprise-score">Similarity: ${(s.similarity * 100).toFixed(0)}% | Surprise: ${(s.surprise_score * 100).toFixed(0)}%</div>
    </div>`).join('')}
  </div>
</div>
` : ''}

<div class="section">
  <h2 class="section-title">Clusters</h2>
  <div class="cluster-grid">
    ${Object.entries(clusterMap).map(([id, c]) => {
      const domEntries = Object.entries(c.domains).sort((a, b) => b[1] - a[1]);
      return `
      <div class="cluster-card">
        <div class="cluster-header">
          <span class="cluster-id">Cluster ${id}</span>
          <span class="cluster-count">${domEntries.reduce((s, [, n]) => s + n, 0)} nuggets</span>
        </div>
        <div class="cluster-domains">
          ${domEntries.map(([d, n]) => `<span class="cluster-domain" style="background:${domainColors[d] || '#888'}22;color:${domainColors[d] || '#888'}">${d} (${n})</span>`).join('')}
        </div>
        <div class="cluster-items">
          ${c.items.slice(0, 5).map(it => `${esc(it.title?.slice(0, 50))}`).join('<br>')}
        </div>
      </div>`;
    }).join('')}
  </div>
</div>

${connectionData.length > 0 ? `
<div class="section">
  <h2 class="section-title">Strongest Cross-Domain Bridges</h2>
  <div class="bridge-list">
    ${connectionData.slice(0, 20).map(c => `
    <div class="bridge-row">
      <span><span class="domain-tag" style="background:${domainColors[c.source_domain] || '#888'}22;color:${domainColors[c.source_domain] || '#888'}">${c.source_domain}</span> ${esc(c.source_title?.slice(0, 40))}</span>
      <span class="bridge-arrow">↔ <span class="bridge-sim">${(c.similarity * 100).toFixed(0)}%</span></span>
      <span>${esc(c.target_title?.slice(0, 40))} <span class="domain-tag" style="background:${domainColors[c.target_domain] || '#888'}22;color:${domainColors[c.target_domain] || '#888'}">${c.target_domain}</span></span>
    </div>`).join('')}
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

// ── Telegram command registration ────────────────────────────────────────────

export function registerGraphCommands(bot) {
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

  // /connections <topic> — find what's secretly connected
  bot.onText(/^\/connections(?:@\w+)?\s+(.+)$/s, async (msg, match) => {
    const chatId = msg.chat.id;
    if (PAUL && chatId !== PAUL) return;
    const query = match[1].trim();
    await safeSend(chatId, `Searching connections for "${query.slice(0, 100)}"...`);
    try {
      const result = await findConnections(query);
      await safeSend(chatId, formatConnectionsReport(result, query));
    } catch (e) {
      await safeSend(chatId, `Connection search error: ${e.message}`);
    }
  });

  // /graph — run full graph computation
  bot.onText(/^\/graph(?:@\w+)?$/, async (msg) => {
    const chatId = msg.chat.id;
    if (PAUL && chatId !== PAUL) return;
    await safeSend(chatId, 'Computing knowledge graph... (clusters, bridges, surprises). ~30s.');
    try {
      const result = await computeFullGraph();
      await safeSend(chatId, formatGraphReport(result));
      const dash = generateGraphDashboard();
      await safeSend(chatId, `Dashboard: ${dash}`);
    } catch (e) {
      await safeSend(chatId, `Graph computation error: ${e.message}`);
    }
  });

  // /graph-dashboard — regenerate dashboard
  bot.onText(/^\/graph-dashboard(?:@\w+)?$/, async (msg) => {
    const chatId = msg.chat.id;
    if (PAUL && chatId !== PAUL) return;
    const dash = generateGraphDashboard();
    await safeSend(chatId, `Dashboard regenerated: ${dash}`);
  });
}

// ── Direct execution ─────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].includes('knowledge-graph')) {
  console.log('[knowledge-graph] Running full computation...');
  computeFullGraph().then(result => {
    if (result) {
      console.log(formatGraphReport(result));
      generateGraphDashboard();
      console.log('[knowledge-graph] Dashboard generated.');
    }
    process.exit(0);
  }).catch(e => {
    console.error('[knowledge-graph] Fatal:', e);
    process.exit(1);
  });
}
