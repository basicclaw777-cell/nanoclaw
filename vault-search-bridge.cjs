'use strict';

/**
 * vault-search-bridge.cjs — CJS bridge for vault-embedder.js semantic search.
 *
 * Uses the same SQLite DB + Ollama embeddings directly in CJS,
 * no ESM dynamic import needed.
 *
 * Exports: semanticSearch(query, topK, domainFilter) → Promise<results[]>
 *          getRelated(filePath, topK) → Promise<results[]>
 *          getEmbeddingStats() → { total, domains }
 */

const Database = require('better-sqlite3');
const path = require('path');
const http = require('http');

const HOME = process.env.HOME;
const DB_PATH = path.join(HOME, 'nanoclaw', 'vortex_data', 'metrics.db');
const OLLAMA_URL = 'http://localhost:11434';
const EMBED_MODEL = 'nomic-embed-text';

let db = null;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH, { readonly: true });
  }
  return db;
}

// ── Ollama embedding ──────────────────────────────────────────────────────────

function getEmbedding(text) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ model: EMBED_MODEL, prompt: text });
    const options = {
      hostname: 'localhost',
      port: 11434,
      path: '/api/embeddings',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (!parsed.embedding) return reject(new Error('No embedding in response'));
          resolve(parsed.embedding);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Ollama timeout')); });
    req.write(payload);
    req.end();
  });
}

// ── Vector math ───────────────────────────────────────────────────────────────

function blobToEmbedding(blob) {
  return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Semantic search ───────────────────────────────────────────────────────────

async function semanticSearch(query, topK = 5, domainFilter = null) {
  const queryVec = await getEmbedding(query);
  const d = getDb();

  const rows = domainFilter
    ? d.prepare('SELECT * FROM vault_embeddings WHERE domain = ?').all(domainFilter)
    : d.prepare('SELECT * FROM vault_embeddings').all();

  if (rows.length === 0) return [];

  const scored = rows.map(row => {
    const rowVec = blobToEmbedding(row.embedding);
    const score = cosineSimilarity(queryVec, rowVec);
    return {
      file_path: row.file_path,
      title: row.title,
      domain: row.domain,
      first_line: row.first_line,
      tags: JSON.parse(row.tags || '[]'),
      wikilinks: JSON.parse(row.wikilinks || '[]'),
      score
    };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}

// ── Related files (semantic proximity + wikilinks) ────────────────────────────

async function getRelated(filePath, topK = 10) {
  const d = getDb();

  // Get source file's embedding and wikilinks
  const source = d.prepare('SELECT * FROM vault_embeddings WHERE file_path = ?').get(filePath);
  if (!source) return [];

  const sourceVec = blobToEmbedding(source.embedding);
  const sourceLinks = new Set(JSON.parse(source.wikilinks || '[]').map(w => w.toLowerCase()));

  const rows = d.prepare('SELECT * FROM vault_embeddings WHERE file_path != ?').all(filePath);

  const scored = rows.map(row => {
    const rowVec = blobToEmbedding(row.embedding);
    const semanticScore = cosineSimilarity(sourceVec, rowVec);

    // Wikilink boost: +0.15 if source links to this file or vice versa
    const rowLinks = new Set(JSON.parse(row.wikilinks || '[]').map(w => w.toLowerCase()));
    const sourceTitle = path.basename(source.file_path, '.md').toLowerCase();
    const rowTitle = path.basename(row.file_path, '.md').toLowerCase();

    let linkBoost = 0;
    if (sourceLinks.has(rowTitle)) linkBoost += 0.15;
    if (rowLinks.has(sourceTitle)) linkBoost += 0.15;

    // Tag overlap boost
    const sourceTags = new Set(JSON.parse(source.tags || '[]').map(t => t.toLowerCase()));
    const rowTags = JSON.parse(row.tags || '[]').map(t => t.toLowerCase());
    const tagOverlap = rowTags.filter(t => sourceTags.has(t)).length;
    const tagBoost = Math.min(tagOverlap * 0.05, 0.15);

    return {
      file_path: row.file_path,
      title: row.title,
      domain: row.domain,
      first_line: row.first_line,
      tags: JSON.parse(row.tags || '[]'),
      wikilinks: JSON.parse(row.wikilinks || '[]'),
      score: semanticScore + linkBoost + tagBoost,
      semantic_score: semanticScore,
      link_boost: linkBoost,
      tag_boost: tagBoost
    };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function getEmbeddingStats() {
  const d = getDb();
  const total = d.prepare('SELECT COUNT(*) as n FROM vault_embeddings').get().n;
  const domains = d.prepare(
    'SELECT domain, COUNT(*) as n FROM vault_embeddings GROUP BY domain ORDER BY n DESC'
  ).all();
  return { total, domains };
}

// ── Format for agent context ──────────────────────────────────────────────────

function formatForContext(results, maxChars = 2000) {
  if (!results || results.length === 0) return '';
  let output = '';
  for (const r of results) {
    const line = `- [${(r.score * 100).toFixed(0)}%] ${r.title} (${r.domain}): ${(r.first_line || '').slice(0, 120)}\n`;
    if (output.length + line.length > maxChars) break;
    output += line;
  }
  return output;
}

module.exports = {
  semanticSearch,
  getRelated,
  getEmbeddingStats,
  formatForContext,
  getEmbedding
};
