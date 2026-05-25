// ── Q Drops Phase 4: Knowledge Graph Construction ────────────────────────────
// Entity extraction → relationship mapping → SQLite graph → cluster analysis
// Same pattern as Phase 2: DeepSeek + checkpoint/resume + rate limiting
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
dotenv.config();

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const OLLAMA_URL = 'http://localhost:11434';
const CORPUS_PATH = join(process.env.HOME, 'cathedral-vault/00_Staging/qanon-forensics/posts.json');
const OUTPUT_DIR = join(process.env.HOME, 'cathedral-vault/00_Staging/qanon-forensics');
const DB_PATH = join(process.env.HOME, 'nanoclaw/vortex_data/q-knowledge-graph.db');
const CHECKPOINT_PATH = join(OUTPUT_DIR, 'phase4-checkpoint.json');

// ── Rate limiter ─────────────────────────────────────────────────────────────
let lastCall = 0;
const MIN_INTERVAL = 1500;

async function throttle() {
  const now = Date.now();
  const wait = MIN_INTERVAL - (now - lastCall);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastCall = Date.now();
}

// ── LLM Calls ────────────────────────────────────────────────────────────────
async function callDeepSeek(system, prompt, maxTokens = 4000) {
  if (!DEEPSEEK_KEY) return callOllama(system, prompt, maxTokens);
  await throttle();
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
        temperature: 0.1
      })
    });
    const data = await res.json();
    if (data.error) {
      console.error(`DeepSeek error: ${data.error.message}. Falling back to Ollama.`);
      return callOllama(system, prompt, maxTokens);
    }
    return data.choices?.[0]?.message?.content || '';
  } catch (err) {
    console.error('DeepSeek failed, Ollama fallback:', err.message);
    return callOllama(system, prompt, maxTokens);
  }
}

async function callOllama(system, prompt, maxTokens = 4000) {
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
        options: { num_predict: maxTokens }
      })
    });
    const data = await res.json();
    return data.message?.content || '';
  } catch (err) {
    console.error('Ollama also failed:', err.message);
    return '';
  }
}

// ── Entity extraction system prompt ──────────────────────────────────────────
const ENTITY_SYSTEM = `You are a forensic intelligence analyst extracting ENTITIES and RELATIONSHIPS from Q drops.

For each post, extract:

ENTITIES — every named or clearly referenced:
- PERSON: named individuals (e.g. "Hillary Clinton", "John McCain", "Edward Snowden")
- ORGANIZATION: agencies, companies, groups (e.g. "CIA", "FBI", "Clinton Foundation", "Muslim Brotherhood")
- OPERATION: named operations, projects, programs (e.g. "Operation Mockingbird", "PRISM", "Fast and Furious")
- DOCUMENT: named documents, reports, memos (e.g. "Steele Dossier", "FISA warrant", "IG Report")
- EVENT: named events (e.g. "Benghazi", "Uranium One", "Las Vegas shooting")
- LOCATION: specific places relevant to claims (e.g. "Epstein Island", "Guantanamo Bay", "NK")
- CONCEPT: recurring analytical concepts (e.g. "The Map", "Future proves past", "Keystone")

RELATIONSHIPS between entities in the SAME post:
- type: CONTROLS | FUNDS | INVESTIGATES | COVERS_UP | WORKS_WITH | OPPOSES | LEAKED | CREATED | ATTENDED | OWNS
- source: entity name
- target: entity name
- context: brief description from post

Rules:
1. Extract ONLY entities explicitly named or clearly referenced — no inference
2. Normalize names: "HRC" = "Hillary Clinton", "POTUS" = "Donald Trump", "BO" = "Barack Obama", "BHO" = "Barack Obama", "SA" = "Saudi Arabia", "NK" = "North Korea", "MSM" = "Mainstream Media", "No Such Agency" = "NSA", "C_A" or "Clowns" = "CIA", "MI" = "Military Intelligence"
3. For acronyms, use full name if identifiable
4. Each entity needs: name, type, aliases (if any)
5. Maximum 20 entities and 15 relationships per batch

Return ONLY valid JSON:
{
  "entities": [{"name":"...", "type":"PERSON|ORG|...", "aliases":["..."]}],
  "relationships": [{"source":"...", "target":"...", "type":"...", "context":"..."}]
}`;

// ── Database setup ───────────────────────────────────────────────────────────
function initDB() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      aliases TEXT DEFAULT '[]',
      first_seen_post INTEGER,
      last_seen_post INTEGER,
      first_seen_date TEXT,
      last_seen_date TEXT,
      mention_count INTEGER DEFAULT 1,
      UNIQUE(name, type)
    );

    CREATE TABLE IF NOT EXISTS relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_entity TEXT NOT NULL,
      target_entity TEXT NOT NULL,
      type TEXT NOT NULL,
      context TEXT,
      post_id INTEGER,
      post_date TEXT,
      UNIQUE(source_entity, target_entity, type, post_id)
    );

    CREATE TABLE IF NOT EXISTS entity_posts (
      entity_name TEXT NOT NULL,
      post_id INTEGER NOT NULL,
      post_date TEXT,
      PRIMARY KEY(entity_name, post_id)
    );

    CREATE TABLE IF NOT EXISTS clusters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      entities TEXT,
      relationship_count INTEGER,
      density REAL,
      temporal_span TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
    CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
    CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(source_entity);
    CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(target_entity);
    CREATE INDEX IF NOT EXISTS idx_entity_posts_entity ON entity_posts(entity_name);
    CREATE INDEX IF NOT EXISTS idx_entity_posts_post ON entity_posts(post_id);
  `);

  return db;
}

// ── Insert entities + relationships ──────────────────────────────────────────
function insertEntities(db, entities, relationships, postId, postDate) {
  const upsertEntity = db.prepare(`
    INSERT INTO entities (name, type, aliases, first_seen_post, last_seen_post, first_seen_date, last_seen_date, mention_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(name, type) DO UPDATE SET
      last_seen_post = excluded.last_seen_post,
      last_seen_date = excluded.last_seen_date,
      mention_count = mention_count + 1,
      aliases = CASE
        WHEN length(excluded.aliases) > 4 THEN excluded.aliases
        ELSE aliases
      END
  `);

  const insertRel = db.prepare(`
    INSERT OR IGNORE INTO relationships (source_entity, target_entity, type, context, post_id, post_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertEntityPost = db.prepare(`
    INSERT OR IGNORE INTO entity_posts (entity_name, post_id, post_date)
    VALUES (?, ?, ?)
  `);

  const insertMany = db.transaction(() => {
    for (const ent of entities) {
      if (!ent.name || !ent.type) continue;
      const name = ent.name.trim();
      const aliases = JSON.stringify(ent.aliases || []);
      upsertEntity.run(name, ent.type, aliases, postId, postId, postDate, postDate);
      insertEntityPost.run(name, postId, postDate);
    }

    for (const rel of relationships) {
      if (!rel.source || !rel.target || !rel.type) continue;
      insertRel.run(rel.source.trim(), rel.target.trim(), rel.type, rel.context || '', postId, postDate);
    }
  });

  insertMany();
}

// ── Batch posts ──────────────────────────────────────────────────────────────
function batchPosts(posts, batchSize = 10) {
  const batches = [];
  for (let i = 0; i < posts.length; i += batchSize) {
    batches.push(posts.slice(i, i + batchSize));
  }
  return batches;
}

function formatPostsForExtraction(posts) {
  return posts.map(p => {
    const date = new Date(p.post_metadata.time * 1000).toISOString().split('T')[0];
    const id = p.post_metadata.id || p.post_metadata.post_id;
    const trip = p.post_metadata.tripcode || 'no-trip';
    return `[Post #${id} | ${date} | ${trip}]\n${p.text}`;
  }).join('\n\n---\n\n');
}

function filterAnalyzablePosts(posts) {
  return posts.filter(p => {
    if (!p.text || p.text.trim().length < 20) return false;
    const text = p.text.trim();
    if (text.match(/^https?:\/\/\S+$/)) return false;
    if (text.split(/\s+/).length < 5) return false;
    return true;
  });
}

function parseJSON(raw) {
  try {
    let cleaned = raw.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { return null; }
    }
    return null;
  }
}

// ── Checkpoint ───────────────────────────────────────────────────────────────
function loadCheckpoint() {
  if (existsSync(CHECKPOINT_PATH)) {
    return JSON.parse(readFileSync(CHECKPOINT_PATH, 'utf8'));
  }
  return { extractedBatches: 0, totalEntities: 0, totalRelationships: 0 };
}

function saveCheckpoint(state) {
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(state, null, 2));
}

// ── Cluster detection ────────────────────────────────────────────────────────
function detectClusters(db) {
  console.log('\n=== Cluster Detection ===\n');

  // Find entities that co-occur in many posts (co-occurrence = shared posts)
  const cooccurrence = db.prepare(`
    SELECT a.entity_name AS entity_a, b.entity_name AS entity_b, COUNT(*) AS shared_posts
    FROM entity_posts a
    JOIN entity_posts b ON a.post_id = b.post_id AND a.entity_name < b.entity_name
    GROUP BY a.entity_name, b.entity_name
    HAVING shared_posts >= 3
    ORDER BY shared_posts DESC
  `).all();

  console.log(`Co-occurrence pairs (>=3 shared posts): ${cooccurrence.length}`);

  // Simple greedy clustering: build adjacency, then connected components
  const adjacency = new Map();
  for (const pair of cooccurrence) {
    if (!adjacency.has(pair.entity_a)) adjacency.set(pair.entity_a, new Set());
    if (!adjacency.has(pair.entity_b)) adjacency.set(pair.entity_b, new Set());
    adjacency.get(pair.entity_a).add(pair.entity_b);
    adjacency.get(pair.entity_b).add(pair.entity_a);
  }

  const visited = new Set();
  const clusters = [];

  for (const node of adjacency.keys()) {
    if (visited.has(node)) continue;
    const cluster = [];
    const queue = [node];
    while (queue.length > 0) {
      const current = queue.pop();
      if (visited.has(current)) continue;
      visited.add(current);
      cluster.push(current);
      const neighbors = adjacency.get(current) || new Set();
      for (const n of neighbors) {
        if (!visited.has(n)) queue.push(n);
      }
    }
    if (cluster.length >= 3) {
      clusters.push(cluster);
    }
  }

  // Sort clusters by size
  clusters.sort((a, b) => b.length - a.length);

  console.log(`Clusters found (>=3 entities): ${clusters.length}`);

  // Store clusters
  const insertCluster = db.prepare(`
    INSERT INTO clusters (name, entities, relationship_count, density, temporal_span)
    VALUES (?, ?, ?, ?, ?)
  `);

  // Clear old clusters
  db.exec('DELETE FROM clusters');

  for (let i = 0; i < clusters.length; i++) {
    const entities = clusters[i];
    const entitiesJSON = JSON.stringify(entities);

    // Count internal relationships
    const placeholders = entities.map(() => '?').join(',');
    const relCount = db.prepare(`
      SELECT COUNT(*) as cnt FROM relationships
      WHERE source_entity IN (${placeholders}) AND target_entity IN (${placeholders})
    `).get(...entities, ...entities).cnt;

    // Density = relationships / max possible
    const maxPossible = entities.length * (entities.length - 1);
    const density = maxPossible > 0 ? relCount / maxPossible : 0;

    // Temporal span
    const temporal = db.prepare(`
      SELECT MIN(post_date) as first_date, MAX(post_date) as last_date
      FROM entity_posts
      WHERE entity_name IN (${placeholders})
    `).get(...entities);

    const span = temporal ? `${temporal.first_date} → ${temporal.last_date}` : 'unknown';

    insertCluster.run(
      `Cluster ${i + 1} (${entities.length} entities)`,
      entitiesJSON,
      relCount,
      Math.round(density * 1000) / 1000,
      span
    );
  }

  return clusters;
}

// ── Temporal evolution analysis ──────────────────────────────────────────────
function analyzeTemporalEvolution(db) {
  console.log('\n=== Temporal Evolution ===\n');

  // Entities by first appearance month
  const byMonth = db.prepare(`
    SELECT substr(first_seen_date, 1, 7) as month, COUNT(*) as new_entities
    FROM entities
    WHERE first_seen_date IS NOT NULL
    GROUP BY month
    ORDER BY month
  `).all();

  console.log('New entities by month:');
  for (const row of byMonth) {
    const bar = '█'.repeat(Math.min(row.new_entities, 50));
    console.log(`  ${row.month}: ${bar} ${row.new_entities}`);
  }

  // Most mentioned entities
  const topEntities = db.prepare(`
    SELECT name, type, mention_count, first_seen_date, last_seen_date
    FROM entities
    ORDER BY mention_count DESC
    LIMIT 30
  `).all();

  return { byMonth, topEntities };
}

// ── Generate report ──────────────────────────────────────────────────────────
function generateReport(db, clusters, temporal) {
  const entityCount = db.prepare('SELECT COUNT(*) as cnt FROM entities').get().cnt;
  const relCount = db.prepare('SELECT COUNT(*) as cnt FROM relationships').get().cnt;
  const entityPostCount = db.prepare('SELECT COUNT(*) as cnt FROM entity_posts').get().cnt;

  // Type breakdown
  const typeBreakdown = db.prepare(`
    SELECT type, COUNT(*) as cnt FROM entities GROUP BY type ORDER BY cnt DESC
  `).all();

  // Relationship type breakdown
  const relBreakdown = db.prepare(`
    SELECT type, COUNT(*) as cnt FROM relationships GROUP BY type ORDER BY cnt DESC
  `).all();

  // Top 30 entities by mention
  const topEntities = db.prepare(`
    SELECT name, type, mention_count, first_seen_date, last_seen_date, aliases
    FROM entities ORDER BY mention_count DESC LIMIT 30
  `).all();

  // Most connected (by relationship count)
  const mostConnected = db.prepare(`
    SELECT entity, SUM(cnt) as connections FROM (
      SELECT source_entity as entity, COUNT(*) as cnt FROM relationships GROUP BY source_entity
      UNION ALL
      SELECT target_entity as entity, COUNT(*) as cnt FROM relationships GROUP BY target_entity
    ) GROUP BY entity ORDER BY connections DESC LIMIT 30
  `).all();

  // Entities that appear then disappear (temporal gaps)
  const disappeared = db.prepare(`
    SELECT name, type, mention_count, first_seen_date, last_seen_date
    FROM entities
    WHERE mention_count >= 3
    AND julianday(last_seen_date) - julianday(first_seen_date) < 90
    ORDER BY mention_count DESC
    LIMIT 20
  `).all();

  let report = `---
title: "Q Drops Forensic Analysis — Phase 4 (Knowledge Graph)"
date: 2026-05-25
type: forensic-analysis
status: complete
tags: [qanon, forensics, knowledge-graph, entity-extraction, cluster-analysis]
---

# Q Drops — Phase 4: Knowledge Graph Construction

## Summary

- **Entities extracted:** ${entityCount}
- **Relationships mapped:** ${relCount}
- **Entity-post connections:** ${entityPostCount}
- **Clusters detected:** ${clusters.length}
- **Database:** \`vortex_data/q-knowledge-graph.db\`

## Entity Type Breakdown

| Type | Count | % |
|---|---|---|
${typeBreakdown.map(r => `| ${r.type} | ${r.cnt} | ${(r.cnt / entityCount * 100).toFixed(1)}% |`).join('\n')}

## Relationship Type Breakdown

| Type | Count | % |
|---|---|---|
${relBreakdown.map(r => `| ${r.type} | ${r.cnt} | ${(r.cnt / relCount * 100).toFixed(1)}% |`).join('\n')}

## Top 30 Entities by Mention Count

| Rank | Entity | Type | Mentions | First Seen | Last Seen |
|---|---|---|---|---|---|
${topEntities.map((e, i) => `| ${i + 1} | ${e.name} | ${e.type} | ${e.mention_count} | ${e.first_seen_date || '?'} | ${e.last_seen_date || '?'} |`).join('\n')}

## Top 30 Most Connected Entities

| Rank | Entity | Connections |
|---|---|---|
${mostConnected.map((e, i) => `| ${i + 1} | ${e.entity} | ${e.connections} |`).join('\n')}

## Cluster Analysis

${clusters.slice(0, 15).map((c, i) => {
    const clusterRow = db.prepare('SELECT * FROM clusters WHERE name LIKE ?').get(`Cluster ${i + 1}%`);
    return `### Cluster ${i + 1} (${c.length} entities, density: ${clusterRow?.density || '?'})

**Span:** ${clusterRow?.temporal_span || '?'}

**Entities:** ${c.slice(0, 20).join(', ')}${c.length > 20 ? ` ... +${c.length - 20} more` : ''}
`;
  }).join('\n')}

## Temporal Evolution

### New Entities by Month

| Month | New Entities |
|---|---|
${temporal.byMonth.map(r => `| ${r.month} | ${r.new_entities} |`).join('\n')}

## Entities That Appeared Then Disappeared (<90 day span, >=3 mentions)

These entities were discussed intensely then dropped — potential narrative focal points or resolved threads.

| Entity | Type | Mentions | First Seen | Last Seen |
|---|---|---|---|---|
${disappeared.map(e => `| ${e.name} | ${e.type} | ${e.mention_count} | ${e.first_seen_date} | ${e.last_seen_date} |`).join('\n')}

## Forensic Observations

### Graph Architecture
- The knowledge graph reveals the structural skeleton of Q's attention — which entities are central, how they connect, and how focus shifts over time.
- Cluster analysis shows whether Q operated as a single narrative thread or multiple independent investigation tracks.
- Entity lifespan analysis shows the "attention economy" of the drops — what gets introduced, discussed, then abandoned.

### For Phase 10 (Cross-Domain Convergence)
- Top entities and clusters should be mapped against Cathedral vault entity graphs (Map Room, Sumerian Observatory, financial architecture, Looking Glass).
- Entity type distribution reveals Q's analytical focus: ratio of PERSON to ORGANIZATION to OPERATION tells us whether this is personality-driven or systems-driven analysis.
- Temporal evolution compared against public event timeline (Phase 6) will show whether Q's attention preceded or followed events.
`;

  writeFileSync(join(OUTPUT_DIR, 'q-drops-phase4-report.md'), report);
  console.log(`\nReport: ${join(OUTPUT_DIR, 'q-drops-phase4-report.md')}`);
}

// ── Main pipeline ────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Q Drops Phase 4: Knowledge Graph Construction ===\n');

  console.log('Loading corpus...');
  const raw = JSON.parse(readFileSync(CORPUS_PATH, 'utf8'));
  const allPosts = raw.posts;
  console.log(`Total posts: ${allPosts.length}`);

  const analyzable = filterAnalyzablePosts(allPosts);
  console.log(`Analyzable posts: ${analyzable.length}`);

  const batches = batchPosts(analyzable, 10);
  console.log(`Batches of 10: ${batches.length}`);

  // Init DB
  const db = initDB();
  console.log('Database initialized.');

  // Load checkpoint
  let state = loadCheckpoint();
  console.log(`Checkpoint: ${state.extractedBatches} batches done, ${state.totalEntities} entities, ${state.totalRelationships} relationships\n`);

  // ── Entity extraction ────────────────────────────────────────────────
  console.log('=== Phase 4a: Entity Extraction ===\n');

  for (let i = state.extractedBatches; i < batches.length; i++) {
    const batch = batches[i];
    const formatted = formatPostsForExtraction(batch);

    process.stdout.write(`Batch ${i + 1}/${batches.length}... `);

    const result = await callDeepSeek(ENTITY_SYSTEM, formatted);
    const parsed = parseJSON(result);

    if (parsed && parsed.entities) {
      const entities = parsed.entities || [];
      const relationships = parsed.relationships || [];

      // Get post ID and date for the batch midpoint
      const midPost = batch[Math.floor(batch.length / 2)];
      const postId = midPost.post_metadata.id || midPost.post_metadata.post_id;
      const postDate = new Date(midPost.post_metadata.time * 1000).toISOString().split('T')[0];

      // Insert with per-post granularity where possible
      for (const post of batch) {
        const pid = post.post_metadata.id || post.post_metadata.post_id;
        const pdate = new Date(post.post_metadata.time * 1000).toISOString().split('T')[0];

        // Match entities to this specific post by checking if entity name appears in post text
        const postEntities = entities.filter(e =>
          post.text.toLowerCase().includes(e.name.toLowerCase()) ||
          (e.aliases || []).some(a => post.text.toLowerCase().includes(a.toLowerCase()))
        );

        const postRels = relationships.filter(r =>
          post.text.toLowerCase().includes(r.source?.toLowerCase() || '') &&
          post.text.toLowerCase().includes(r.target?.toLowerCase() || '')
        );

        if (postEntities.length > 0 || postRels.length > 0) {
          insertEntities(db, postEntities, postRels, pid, pdate);
        }
      }

      state.totalEntities += entities.length;
      state.totalRelationships += relationships.length;
      console.log(`${entities.length} entities, ${relationships.length} relationships`);
    } else {
      console.log('parse failed, skipped');
    }

    state.extractedBatches = i + 1;

    // Checkpoint every 10 batches
    if ((i + 1) % 10 === 0) {
      saveCheckpoint(state);
      const dbEntities = db.prepare('SELECT COUNT(*) as cnt FROM entities').get().cnt;
      const dbRels = db.prepare('SELECT COUNT(*) as cnt FROM relationships').get().cnt;
      console.log(`  [checkpoint: batch ${i + 1}, DB has ${dbEntities} entities, ${dbRels} relationships]`);
    }
  }

  saveCheckpoint(state);

  // ── DB stats ─────────────────────────────────────────────────────────
  const entityCount = db.prepare('SELECT COUNT(*) as cnt FROM entities').get().cnt;
  const relCount = db.prepare('SELECT COUNT(*) as cnt FROM relationships').get().cnt;
  console.log(`\nExtraction complete.`);
  console.log(`Database: ${entityCount} entities, ${relCount} relationships`);

  // ── Cluster detection ────────────────────────────────────────────────
  const clusters = detectClusters(db);

  // ── Temporal evolution ───────────────────────────────────────────────
  const temporal = analyzeTemporalEvolution(db);

  // ── Generate report ──────────────────────────────────────────────────
  console.log('\n=== Generating Phase 4 Report ===');
  generateReport(db, clusters, temporal);

  db.close();
  console.log('\nPhase 4 complete.');
}

main().catch(err => {
  console.error('Phase 4 failed:', err);
  process.exit(1);
});
