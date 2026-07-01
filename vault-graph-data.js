// vault-graph-data.js — Generate graph JSON from vault embeddings
// Reads vault_embeddings (SQLite), computes cross-domain connections,
// outputs vault-graph-data.json for the visual brain.
// ESM (SI-13). Run: node vault-graph-data.js

import Database from 'better-sqlite3';
import { writeFileSync } from 'fs';
import { join, relative } from 'path';

const HOME = process.env.HOME;
const METRICS_DB = join(HOME, 'nanoclaw', 'vortex_data', 'metrics.db');
const VAULT_DIR = join(HOME, 'cathedral-vault');
const OUTPUT = join(HOME, 'nanoclaw', 'vault-graph-data.json');

const EXCLUDED_DOMAINS = ['00_Staging', '05_Archive_Graveyard', '01_Raw_Transcripts'];
const SIM_THRESHOLD = 0.65;
const TOP_K = 8;

function cosineSim(a, b) {
  let dot = 0, nA = 0, nB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    nA += a[i] * a[i];
    nB += b[i] * b[i];
  }
  const d = Math.sqrt(nA) * Math.sqrt(nB);
  return d === 0 ? 0 : dot / d;
}

function run() {
  const start = Date.now();
  const db = new Database(METRICS_DB, { readonly: true });

  const rows = db.prepare(`
    SELECT file_path, domain, title, tags, wikilinks, embedding
    FROM vault_embeddings
    WHERE domain NOT IN (${EXCLUDED_DOMAINS.map(() => '?').join(',')})
      AND embedding IS NOT NULL
  `).all(...EXCLUDED_DOMAINS);
  db.close();

  console.log(`Loaded ${rows.length} files`);

  const files = rows.map((r, idx) => ({
    idx,
    path: r.file_path,
    rel: relative(VAULT_DIR, r.file_path),
    domain: r.domain,
    title: r.title || r.file_path.split('/').pop().replace('.md', ''),
    tags: JSON.parse(r.tags || '[]'),
    wikilinks: JSON.parse(r.wikilinks || '[]'),
    vec: new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength / 4)
  }));

  // domain → canonical color index
  const domains = [...new Set(files.map(f => f.domain))].sort();
  const domainIndex = Object.fromEntries(domains.map((d, i) => [d, i]));

  // Compute cross-domain edges: for each file, top-K cross-domain connections
  console.log('Computing cross-domain connections...');
  const edgeSet = new Map(); // "i-j" → { source, target, similarity }

  for (let i = 0; i < files.length; i++) {
    if (i % 200 === 0) process.stdout.write(`  ${i}/${files.length}\r`);

    const fi = files[i];
    const candidates = [];

    for (let j = 0; j < files.length; j++) {
      if (i === j) continue;
      const fj = files[j];
      if (fi.domain === fj.domain) continue;

      const sim = cosineSim(fi.vec, fj.vec);
      if (sim >= SIM_THRESHOLD) {
        candidates.push({ j, sim });
      }
    }

    candidates.sort((a, b) => b.sim - a.sim);
    for (const c of candidates.slice(0, TOP_K)) {
      const key = Math.min(i, c.j) + '-' + Math.max(i, c.j);
      const existing = edgeSet.get(key);
      if (!existing || c.sim > existing.similarity) {
        edgeSet.set(key, {
          source: Math.min(i, c.j),
          target: Math.max(i, c.j),
          similarity: Math.round(c.sim * 1000) / 1000
        });
      }
    }
  }

  const edges = [...edgeSet.values()];
  console.log(`\nEdges: ${edges.length}`);

  // Find connected nodes (files with at least one edge)
  const connectedIdx = new Set();
  for (const e of edges) {
    connectedIdx.add(e.source);
    connectedIdx.add(e.target);
  }

  // Build index remap: only connected nodes go into the graph
  const oldToNew = new Map();
  let newIdx = 0;
  for (const idx of [...connectedIdx].sort((a, b) => a - b)) {
    oldToNew.set(idx, newIdx++);
  }

  const nodes = [...connectedIdx].sort((a, b) => a - b).map(idx => {
    const f = files[idx];
    return {
      id: oldToNew.get(idx),
      title: f.title,
      domain: f.domain,
      domainIdx: domainIndex[f.domain],
      rel: f.rel,
      tags: f.tags.slice(0, 5),
      connections: 0
    };
  });

  const remappedEdges = edges.map(e => ({
    source: oldToNew.get(e.source),
    target: oldToNew.get(e.target),
    similarity: e.similarity
  }));

  // Count connections per node
  for (const e of remappedEdges) {
    nodes[e.source].connections++;
    nodes[e.target].connections++;
  }

  // Domain stats
  const domainStats = {};
  for (const n of nodes) {
    domainStats[n.domain] = (domainStats[n.domain] || 0) + 1;
  }

  const graph = {
    generated: new Date().toISOString(),
    totalFiles: files.length,
    connectedFiles: nodes.length,
    edgeCount: remappedEdges.length,
    simThreshold: SIM_THRESHOLD,
    domains: domains.map(d => ({ name: d, count: domainStats[d] || 0 })),
    nodes,
    edges: remappedEdges
  };

  writeFileSync(OUTPUT, JSON.stringify(graph));
  const sizeMB = (JSON.stringify(graph).length / 1024 / 1024).toFixed(1);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\nDone in ${elapsed}s`);
  console.log(`  ${nodes.length} nodes, ${remappedEdges.length} edges`);
  console.log(`  ${domains.length} domains`);
  console.log(`  Output: ${OUTPUT} (${sizeMB}MB)`);
}

run();
