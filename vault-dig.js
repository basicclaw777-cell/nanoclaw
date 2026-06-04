// ── Vault Dig — 7 extraction capabilities on existing infrastructure ─────────
// 1. Principle-Action Gap Detector (zero LLM — file scan + grep)
// 2. Contradiction Synthesizer (LLM on existing surprise pairs, budget-capped)
// 3. Topology Metrics (betweenness centrality, gateways, orphans)
// 4. Bandit feedback wiring for vault mining findings
// 5. Hole-Value Scoring (Swanson ABC — foundational x maturity x persistence)
// 6. Anomaly Gradient (4-factor rubric: independence x persistence x theory-edge x resolution-power)
// 7. Phase-Coherence Matrix (cross-domain cycle correlation: celestial x trading x vault)
//
// Telegram: /vault-dig (runs all 7, outputs combined report)
// CLI: node vault-dig.js
// ──────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.env.HOME, 'nanoclaw', '.env') });

const HOME = process.env.HOME;
const VAULT = path.join(HOME, 'cathedral-vault');
const GRAPH_DB = path.join(HOME, 'nanoclaw', 'vortex_data', 'knowledge-graph.db');
const AGENT_CONTEXTS = path.join(HOME, 'Cathedral', 'agents', 'contexts');
const AGENT_REGISTRY = path.join(HOME, 'Cathedral', 'agents', 'registry.json');
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const OLLAMA_URL = 'http://localhost:11434';
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const PAUL_CHAT_ID = process.env.PAUL_CHAT_ID ? parseInt(process.env.PAUL_CHAT_ID) : null;

const CONTRADICTION_BUDGET = 10; // max DeepSeek calls per run

// ── Telegram ────────────────────────────────────────────────────────────────

async function sendTelegram(text) {
  if (!TELEGRAM_TOKEN || !PAUL_CHAT_ID) { console.log(text); return; }
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

// ── LLM ─────────────────────────────────────────────────────────────────────

async function callLLM(system, prompt, maxTokens = 1500) {
  if (DEEPSEEK_KEY) {
    try {
      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
          max_tokens: maxTokens, temperature: 0.4
        })
      });
      const data = await res.json();
      if (!data.error) return data.choices?.[0]?.message?.content || '';
    } catch { /* fall through */ }
  }
  // Ollama fallback
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma3:4b',
        messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
        stream: false, options: { temperature: 0.4, num_predict: maxTokens }
      })
    });
    const data = await res.json();
    return data.message?.content || '';
  } catch { return ''; }
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. PRINCIPLE-ACTION GAP DETECTOR — zero LLM, pure filesystem
// ═════════════════════════════════════════════════════════════════════════════

function detectPrincipleGaps() {
  const results = [];

  // Only scan real principle/method locations — NOT bulk gold nuggets
  const principlesDirs = [
    path.join(VAULT, '02_Refined_Gold', 'cathedral'),  // Cathedral principles only
    path.join(VAULT, '06_Methods')                       // Named methods
  ];

  // Skip these subdirs — not principles, they're reference material
  const skipDirs = new Set(['skills', 'transmissions', 'behaviour-library', 'candidates', 'templates']);

  // Skip these filename patterns — session harvests, dated captures, not named principles
  const skipPatterns = [
    /^session-harvest-/,
    /^terminal-harvest-/,
    /^orchestrator-harvest-/,
    /^emergence-capture-/,
    /^session-transcript-/,
    /^court-sensory-responses/,
    /^2026-\d{2}-\d{2}_cathedral_session/,
    /^2026-\d{2}-\d{2}_cathedral_faithful-grpo/,
    /^2026-\d{2}-\d{2}_cathedral_supernova/,
    /^field-session-/,
    /^town-hall-/,
    /^cross-corpus-/,
    /_gold\.md$/
  ];

  const principleFiles = [];
  for (const dir of principlesDirs) {
    if (!fs.existsSync(dir)) continue;
    const walk = (d) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (skipDirs.has(entry.name)) continue;
          walk(path.join(d, entry.name));
        } else if (entry.name.endsWith('.md')) {
          const skip = skipPatterns.some(p => p.test(entry.name));
          if (!skip) principleFiles.push(path.join(d, entry.name));
        }
      }
    };
    walk(dir);
  }

  // Extract principle names (title from frontmatter or first heading)
  const principles = [];
  for (const fp of principleFiles) {
    const content = fs.readFileSync(fp, 'utf8');
    let name = null;

    // Try YAML title
    const titleMatch = content.match(/^title:\s*["']?(.+?)["']?\s*$/m);
    if (titleMatch) name = titleMatch[1];

    // Try first heading
    if (!name) {
      const headingMatch = content.match(/^#+\s+(.+)$/m);
      if (headingMatch) name = headingMatch[1];
    }

    if (!name) name = path.basename(fp, '.md').replace(/-/g, ' ');

    principles.push({
      name: name.trim(),
      file: fp,
      searchTerms: [
        name.trim().toLowerCase(),
        path.basename(fp, '.md').replace(/-/g, ' ').toLowerCase(),
        path.basename(fp, '.md').replace(/-/g, '_').toLowerCase()
      ]
    });
  }

  // Load all agent context text
  let agentText = '';
  if (fs.existsSync(AGENT_CONTEXTS)) {
    for (const f of fs.readdirSync(AGENT_CONTEXTS)) {
      if (f.endsWith('.md')) {
        agentText += fs.readFileSync(path.join(AGENT_CONTEXTS, f), 'utf8') + '\n';
      }
    }
  }

  // Load registry
  if (fs.existsSync(AGENT_REGISTRY)) {
    agentText += fs.readFileSync(AGENT_REGISTRY, 'utf8');
  }

  // Load CLAUDE.md
  const claudeMd = path.join(HOME, 'nanoclaw', 'CLAUDE.md');
  if (fs.existsSync(claudeMd)) {
    agentText += fs.readFileSync(claudeMd, 'utf8');
  }

  const agentTextLower = agentText.toLowerCase();

  // Check each principle for references
  for (const p of principles) {
    const found = p.searchTerms.some(term =>
      term.length > 4 && agentTextLower.includes(term)
    );
    if (!found) {
      // Skip generic filenames
      if (p.name.length < 5) continue;
      results.push({
        principle: p.name,
        file: p.file.replace(HOME, '~'),
        referenced: false
      });
    }
  }

  return results;
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. CONTRADICTION SYNTHESIZER — LLM on unreported surprise pairs
// ═════════════════════════════════════════════════════════════════════════════

async function synthesizeContradictions() {
  const results = [];

  let surprises = [];
  try {
    const db = new Database(GRAPH_DB, { readonly: true });
    surprises = db.prepare(`
      SELECT id, source_path, target_path, source_domain, target_domain,
             source_title, target_title, similarity, surprise_score
      FROM surprises
      WHERE reported = 0
      ORDER BY surprise_score DESC
      LIMIT ?
    `).all(CONTRADICTION_BUDGET);
    db.close();
  } catch (e) {
    console.error('[vault-dig] Graph DB error:', e.message);
    return results;
  }

  if (surprises.length === 0) return results;

  const system = `You are a philosophical synthesis engine. Given two vault notes from different domains that are semantically similar but unlinked, determine:
1. Do they CONTRADICT each other? (opposing claims)
2. Do they ENTAIL each other? (one follows from the other)
3. Do they jointly IMPLY something new? (a third unstated insight)

Reply in this exact format:
RELATIONSHIP: CONTRADICT | ENTAIL | IMPLY_NEW | NEUTRAL
INSIGHT: [one sentence — the contradiction, the entailment, or the new implication]
ACTION: [one sentence — what to do with this finding]

Be specific. Reference concepts from both notes. If neutral, say so — don't force connections.`;

  const processedIds = [];

  for (const s of surprises) {
    // Read both notes (first 500 chars each)
    let noteA = '', noteB = '';
    try {
      noteA = fs.readFileSync(s.source_path, 'utf8').slice(0, 500);
    } catch { noteA = `[unreadable: ${s.source_title}]`; }
    try {
      noteB = fs.readFileSync(s.target_path, 'utf8').slice(0, 500);
    } catch { noteB = `[unreadable: ${s.target_title}]`; }

    const prompt = `NOTE A [${s.source_domain}]: ${s.source_title}
${noteA}

NOTE B [${s.target_domain}]: ${s.target_title}
${noteB}

Similarity: ${(s.similarity * 100).toFixed(0)}%. These are from completely different domains.`;

    const response = await callLLM(system, prompt, 300);

    if (response) {
      const relMatch = response.match(/RELATIONSHIP:\s*(\w+)/);
      const insightMatch = response.match(/INSIGHT:\s*(.+)/);
      const actionMatch = response.match(/ACTION:\s*(.+)/);

      const relationship = relMatch ? relMatch[1] : 'UNKNOWN';

      if (relationship !== 'NEUTRAL') {
        results.push({
          id: s.id,
          sourceTitle: s.source_title,
          targetTitle: s.target_title,
          sourceDomain: s.source_domain,
          targetDomain: s.target_domain,
          relationship,
          insight: insightMatch ? insightMatch[1].trim() : response.slice(0, 200),
          action: actionMatch ? actionMatch[1].trim() : ''
        });
      }
    }

    processedIds.push(s.id);
  }

  // Mark processed surprises as reported
  if (processedIds.length > 0) {
    try {
      const db = new Database(GRAPH_DB);
      const stmt = db.prepare('UPDATE surprises SET reported = 1 WHERE id = ?');
      for (const id of processedIds) stmt.run(id);
      db.close();
    } catch { /* silent */ }
  }

  return results;
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. TOPOLOGY METRICS — betweenness, gateways, orphans from existing graph
// ═════════════════════════════════════════════════════════════════════════════

function computeTopologyMetrics() {
  const metrics = { gateways: [], orphans: [], bridgeNodes: [] };

  let connections = [];
  let clusters = [];
  try {
    const db = new Database(GRAPH_DB, { readonly: true });
    connections = db.prepare(`
      SELECT source_path, target_path, source_domain, target_domain,
             source_title, target_title, similarity
      FROM connections WHERE is_cross_domain = 1
    `).all();
    clusters = db.prepare(`
      SELECT cluster_id, file_path, domain, title FROM clusters
    `).all();
    db.close();
  } catch (e) {
    console.error('[vault-dig] Topology DB error:', e.message);
    return metrics;
  }

  if (connections.length === 0) return metrics;

  // Build adjacency from connections
  const degree = {}; // path -> number of cross-domain connections
  const communityOf = {}; // path -> cluster_id
  const titleOf = {}; // path -> title
  const domainOf = {}; // path -> domain

  for (const c of clusters) {
    communityOf[c.file_path] = c.cluster_id;
    titleOf[c.file_path] = c.title;
    domainOf[c.file_path] = c.domain;
  }

  // Degree centrality (cross-domain connections)
  for (const c of connections) {
    degree[c.source_path] = (degree[c.source_path] || 0) + 1;
    degree[c.target_path] = (degree[c.target_path] || 0) + 1;
    if (!titleOf[c.source_path]) titleOf[c.source_path] = c.source_title;
    if (!titleOf[c.target_path]) titleOf[c.target_path] = c.target_title;
    if (!domainOf[c.source_path]) domainOf[c.source_path] = c.source_domain;
    if (!domainOf[c.target_path]) domainOf[c.target_path] = c.target_domain;
  }

  // Community gateway detection: nodes that connect to multiple clusters
  const commConnections = {}; // path -> Set of cluster_ids it connects to
  for (const c of connections) {
    const srcComm = communityOf[c.source_path];
    const tgtComm = communityOf[c.target_path];
    if (srcComm !== undefined && tgtComm !== undefined && srcComm !== tgtComm) {
      if (!commConnections[c.source_path]) commConnections[c.source_path] = new Set();
      if (!commConnections[c.target_path]) commConnections[c.target_path] = new Set();
      commConnections[c.source_path].add(srcComm);
      commConnections[c.source_path].add(tgtComm);
      commConnections[c.target_path].add(srcComm);
      commConnections[c.target_path].add(tgtComm);
    }
  }

  // Gateways: nodes connecting 3+ communities
  metrics.gateways = Object.entries(commConnections)
    .filter(([, comms]) => comms.size >= 3)
    .map(([p, comms]) => ({
      path: p.replace(HOME, '~'),
      title: titleOf[p]?.slice(0, 60) || path.basename(p, '.md'),
      domain: domainOf[p] || 'unknown',
      communitiesConnected: comms.size,
      crossDomainDegree: degree[p] || 0
    }))
    .sort((a, b) => b.communitiesConnected - a.communitiesConnected)
    .slice(0, 15);

  // Bridge nodes: highest cross-domain degree (proxy for betweenness)
  metrics.bridgeNodes = Object.entries(degree)
    .map(([p, d]) => ({
      path: p.replace(HOME, '~'),
      title: titleOf[p]?.slice(0, 60) || path.basename(p, '.md'),
      domain: domainOf[p] || 'unknown',
      crossDomainDegree: d
    }))
    .sort((a, b) => b.crossDomainDegree - a.crossDomainDegree)
    .slice(0, 10);

  // Orphans: in clusters but with zero cross-domain connections
  const connectedPaths = new Set(Object.keys(degree));
  const clusterPaths = new Set(clusters.map(c => c.file_path));
  const orphanPaths = [...clusterPaths].filter(p => !connectedPaths.has(p));

  // Sample orphans by domain
  const orphansByDomain = {};
  for (const p of orphanPaths) {
    const d = domainOf[p] || 'unknown';
    if (!orphansByDomain[d]) orphansByDomain[d] = [];
    orphansByDomain[d].push({ path: p.replace(HOME, '~'), title: titleOf[p]?.slice(0, 60) || '' });
  }
  metrics.orphans = {
    total: orphanPaths.length,
    totalClustered: clusterPaths.size,
    percentage: clusterPaths.size ? Math.round(orphanPaths.length / clusterPaths.size * 100) : 0,
    byDomain: Object.entries(orphansByDomain)
      .map(([domain, items]) => ({ domain, count: items.length, sample: items[0]?.title }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
  };

  return metrics;
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. HOLE-VALUE SCORING — Swanson ABC structural holes in bridge pairs
//    Score = foundational(shared neighbor weight) × maturity(domain size) × persistence(gap age)
// ═════════════════════════════════════════════════════════════════════════════

function scoreHoleValues() {
  const results = [];

  let connections = [];
  let clusters = [];
  try {
    const db = new Database(GRAPH_DB, { readonly: true });
    connections = db.prepare(`
      SELECT source_path, target_path, source_domain, target_domain,
             source_title, target_title, similarity, discovered_at
      FROM connections WHERE is_cross_domain = 1
      ORDER BY similarity DESC
    `).all();
    clusters = db.prepare(`
      SELECT cluster_id, file_path, domain, title FROM clusters
    `).all();
    db.close();
  } catch (e) {
    console.error('[vault-dig] Hole-value DB error:', e.message);
    return results;
  }

  if (connections.length === 0) return results;

  // Domain maturity = nugget count per domain (more nuggets = more mature literature)
  const domainSize = {};
  for (const c of clusters) {
    domainSize[c.domain] = (domainSize[c.domain] || 0) + 1;
  }

  // Build adjacency: which nodes connect to which (for shared-neighbor detection)
  const neighbors = {}; // path -> Set of connected paths
  for (const c of connections) {
    if (!neighbors[c.source_path]) neighbors[c.source_path] = new Set();
    if (!neighbors[c.target_path]) neighbors[c.target_path] = new Set();
    neighbors[c.source_path].add(c.target_path);
    neighbors[c.target_path].add(c.source_path);
  }

  // Find structural holes: bridge pairs that share a common neighbor but never link directly
  // In our graph, "connections" ARE the bridges, so we score them by Swanson's 3 factors
  const titleOf = {};
  for (const c of clusters) titleOf[c.file_path] = c.title;

  for (const conn of connections) {
    // Factor 1: Foundational shared neighbor
    // Count shared neighbors between source and target — shared foundations indicate ABC pattern
    const srcNeighbors = neighbors[conn.source_path] || new Set();
    const tgtNeighbors = neighbors[conn.target_path] || new Set();
    let sharedCount = 0;
    for (const n of srcNeighbors) {
      if (tgtNeighbors.has(n)) sharedCount++;
    }
    // More shared neighbors without direct strong link = higher foundational score
    const foundational = Math.min(sharedCount / 3, 1.0); // cap at 3 shared

    // Factor 2: Literature maturity — both domains should be mature
    const sizeA = domainSize[conn.source_domain] || 1;
    const sizeB = domainSize[conn.target_domain] || 1;
    const maturity = Math.min(Math.sqrt(sizeA * sizeB) / 50, 1.0); // cap at 2500 combined

    // Factor 3: Gap persistence — how long since discovered but still unlinked?
    const discoveredAt = conn.discovered_at ? new Date(conn.discovered_at) : new Date();
    const gapDays = Math.max(0, (Date.now() - discoveredAt.getTime()) / 86400000);
    const persistence = Math.min(gapDays / 90, 1.0); // ramps to max at 90 days

    // Composite hole-value score
    const holeValue = (foundational * 0.40 + maturity * 0.35 + persistence * 0.25) * conn.similarity;

    if (holeValue > 0.15) {
      results.push({
        sourceTitle: conn.source_title?.slice(0, 50) || path.basename(conn.source_path, '.md'),
        targetTitle: conn.target_title?.slice(0, 50) || path.basename(conn.target_path, '.md'),
        sourceDomain: conn.source_domain,
        targetDomain: conn.target_domain,
        similarity: conn.similarity,
        foundational: +foundational.toFixed(2),
        maturity: +maturity.toFixed(2),
        persistence: +persistence.toFixed(2),
        holeValue: +holeValue.toFixed(3)
      });
    }
  }

  results.sort((a, b) => b.holeValue - a.holeValue);
  return results.slice(0, 20);
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. ANOMALY GRADIENT — 4-factor rubric for paradigm-shift potential
//    Score = independence × persistence × theory-edge × resolution-power
// ═════════════════════════════════════════════════════════════════════════════

const ANOMALY_GRADIENT_BUDGET = 8; // max LLM calls

async function scoreAnomalyGradient() {
  const results = [];

  // Find Grade B/C nuggets that describe anomalies — scan vault for anomaly keywords
  // Priority order: refined gold first, then esoteric, then archaeologist, then cosmology staging
  const anomalyDirs = [
    path.join(VAULT, '02_Refined_Gold'),
    path.join(VAULT, '04_Esoteric_Studies'),
    path.join(VAULT, '00_Staging', 'archaeologist'),
    path.join(VAULT, '00_Staging', 'cosmology')
  ];

  const anomalyKeywords = /anomal|unexplain|contradic|paradox|deviat|outlier|violat|forbidden|impossible|unaccounted/i;

  const candidates = [];
  for (const dir of anomalyDirs) {
    if (!fs.existsSync(dir)) continue;
    const walk = (d) => {
      try {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
          if (entry.isDirectory()) walk(path.join(d, entry.name));
          else if (entry.name.endsWith('.md')) {
            const fp = path.join(d, entry.name);
            try {
              const content = fs.readFileSync(fp, 'utf8');
              if (anomalyKeywords.test(content)) {
                // Extract title and grade
                const titleMatch = content.match(/^title:\s*["']?(.+?)["']?\s*$/m);
                const gradeMatch = content.match(/^grade:\s*["']?([A-F][+-]?)["']?\s*$/m);
                const title = titleMatch ? titleMatch[1] : path.basename(fp, '.md').replace(/-/g, ' ');
                const grade = gradeMatch ? gradeMatch[1] : 'C';
                // Only B and C grade — A is already established, D/F too weak
                if (grade.startsWith('B') || grade.startsWith('C')) {
                  candidates.push({ path: fp, title, grade, content: content.slice(0, 800) });
                }
              }
            } catch { /* skip unreadable */ }
          }
        }
      } catch { /* skip unreadable dirs */ }
    };
    walk(dir);
  }

  if (candidates.length === 0) return results;

  // Score top candidates via LLM (budget-capped)
  const toScore = candidates.slice(0, ANOMALY_GRADIENT_BUDGET);

  const system = `You are an anomaly assessment engine. Score this claim/finding on 4 factors (each 0.0-1.0):

1. INDEPENDENCE: multiple independent labs/sources report this? 1.0=3+ independent, 0.5=2, 0.0=single source
2. PERSISTENCE: survives skeptic's fire / repeated attempts to debunk? 1.0=decades of failed debunking, 0.5=some criticism weathered, 0.0=never challenged
3. THEORY_EDGE: at the boundary of current theory, not well-tested core? 1.0=exactly at theory boundary, 0.5=in gray zone, 0.0=well within tested core
4. RESOLUTION_POWER: explaining this would resolve multiple OTHER anomalies? 1.0=resolves 3+, 0.5=resolves 1-2, 0.0=standalone

Reply ONLY in this format:
INDEPENDENCE: 0.X
PERSISTENCE: 0.X
THEORY_EDGE: 0.X
RESOLUTION_POWER: 0.X
SUMMARY: [one sentence — what makes this anomalous and why it matters]`;

  for (const candidate of toScore) {
    const response = await callLLM(system, `FINDING [Grade ${candidate.grade}]: ${candidate.title}\n\n${candidate.content}`, 300);

    if (response) {
      const parse = (key) => {
        const m = response.match(new RegExp(`${key}:\\s*([0-9.]+)`));
        return m ? parseFloat(m[1]) : 0;
      };
      const independence = parse('INDEPENDENCE');
      const persistence = parse('PERSISTENCE');
      const theoryEdge = parse('THEORY_EDGE');
      const resolutionPower = parse('RESOLUTION_POWER');
      const summaryMatch = response.match(/SUMMARY:\s*(.+)/);

      // Composite: multiplicative (all 4 must be non-zero for high score)
      const gradient = Math.pow(independence * persistence * theoryEdge * resolutionPower, 0.25);

      results.push({
        title: candidate.title.slice(0, 60),
        grade: candidate.grade,
        file: candidate.path.replace(HOME, '~'),
        independence: +independence.toFixed(2),
        persistence: +persistence.toFixed(2),
        theoryEdge: +theoryEdge.toFixed(2),
        resolutionPower: +resolutionPower.toFixed(2),
        gradient: +gradient.toFixed(3),
        summary: summaryMatch ? summaryMatch[1].trim().slice(0, 120) : ''
      });
    }
  }

  results.sort((a, b) => b.gradient - a.gradient);
  return results;
}

// ═════════════════════════════════════════════════════════════════════════════
// 7. PHASE-COHERENCE MATRIX — cross-domain cycle correlation
//    Celestial (Looking Glass) × Trading × Vault historical cycles
// ═════════════════════════════════════════════════════════════════════════════

async function computePhaseCoherence() {
  const matrix = { celestialTrades: [], celestialVault: [], summary: {} };

  // Load celestial events with aftermath
  let celestialEvents = [];
  try {
    const eventsModule = await import('./services/sky-sense/events-index.mjs');
    celestialEvents = eventsModule.EVENTS_DB || [];
  } catch (e) {
    console.log(`[vault-dig] Sky-sense import skipped: ${e.message}`);
  }

  if (celestialEvents.length === 0) return matrix;

  // Load trading data from both main and cyclical tables
  let trades = [];
  const tradesDb = path.join(HOME, 'nanoclaw', 'trader', 'logs', 'trades.db');
  try {
    const db = new Database(tradesDb, { readonly: true });
    trades = db.prepare(`
      SELECT strategy, asset, entry_price, exit_price, pnl, pnl_pct,
             opened_at, closed_at, status
      FROM trades
      ORDER BY opened_at DESC
    `).all();
    // Also pull cyclical trades (gann, lunar, fibonacci, historical_cycles)
    try {
      const cyclical = db.prepare(`
        SELECT strategy, asset, entry_price, exit_price, pnl, pnl_pct,
               opened_at, closed_at, status
        FROM cyclical_trades
        ORDER BY opened_at DESC
      `).all();
      trades = trades.concat(cyclical);
    } catch { /* cyclical table may not exist */ }
    db.close();
  } catch (e) {
    console.log(`[vault-dig] Trades DB skipped: ${e.message}`);
  }

  // --- Celestial × Trading: which celestial categories correlate with trade outcomes ---
  if (trades.length > 0 && celestialEvents.length > 0) {
    // Group events by category
    const categories = {};
    for (const ev of celestialEvents) {
      if (!categories[ev.category]) categories[ev.category] = [];
      categories[ev.category].push(ev);
    }

    // For each category, check if aftermath finance domain predictions align with trade data
    for (const [cat, events] of Object.entries(categories)) {
      const financeAftermaths = events
        .flatMap(e => (e.aftermath || []).filter(a => a.domain === 'finance'))
        .map(a => a.event);

      if (financeAftermaths.length === 0) continue;

      // Count strategies active near celestial events
      const nearEvents = [];
      for (const ev of events) {
        const evDate = new Date(ev.date).getTime();
        const nearTrades = trades.filter(t => {
          const tradeDate = new Date(t.opened_at).getTime();
          return Math.abs(tradeDate - evDate) < 90 * 86400000; // within 90 days
        });
        if (nearTrades.length > 0) {
          const avgPnl = nearTrades.reduce((s, t) => s + (t.pnl || 0), 0) / nearTrades.length;
          nearEvents.push({
            event: ev.label,
            date: ev.date,
            tradesNear: nearTrades.length,
            avgPnl: +avgPnl.toFixed(2),
            strategies: [...new Set(nearTrades.map(t => t.strategy))]
          });
        }
      }

      if (nearEvents.length > 0) {
        matrix.celestialTrades.push({
          category: cat,
          eventCount: events.length,
          financeAftermaths,
          nearEvents,
          coherenceSignal: nearEvents.length > 0 ? 'DATA_OVERLAP' : 'NO_OVERLAP'
        });
      }
    }
  }

  // --- Celestial × Vault: which domains in aftermath map to vault domains ---
  const vaultDomains = new Set();
  try {
    const db = new Database(GRAPH_DB, { readonly: true });
    const domains = db.prepare('SELECT DISTINCT domain FROM clusters').all();
    for (const d of domains) vaultDomains.add(d.domain);
    db.close();
  } catch { /* silent */ }

  // Map aftermath domains to vault coverage
  const aftermathDomains = {};
  for (const ev of celestialEvents) {
    for (const a of ev.aftermath || []) {
      if (!aftermathDomains[a.domain]) aftermathDomains[a.domain] = { events: [], vaultCoverage: false };
      aftermathDomains[a.domain].events.push(ev.label);
    }
  }

  // Check vault coverage of aftermath domains
  const domainMap = {
    finance: ['trading', 'finance', 'suppressed_technology', '00_Staging'],
    governance: ['governance', 'cathedral', 'suppression'],
    technology: ['technology', 'cathedral', '02_Refined_Gold'],
    social: ['social', 'boxing', 'cathedral'],
    geopolitics: ['governance', 'suppression'],
    health: ['health', 'frequency'],
    environment: ['cosmology', 'universe']
  };

  for (const [domain, info] of Object.entries(aftermathDomains)) {
    const mappedVaultDomains = domainMap[domain] || [domain];
    info.vaultCoverage = mappedVaultDomains.some(d => vaultDomains.has(d));
    matrix.celestialVault.push({
      aftermathDomain: domain,
      eventCount: info.events.length,
      vaultCovered: info.vaultCoverage,
      sampleEvents: info.events.slice(0, 3)
    });
  }

  // Summary stats
  const coveredCount = matrix.celestialVault.filter(v => v.vaultCovered).length;
  matrix.summary = {
    celestialEvents: celestialEvents.length,
    tradingOverlaps: matrix.celestialTrades.length,
    aftermathDomains: matrix.celestialVault.length,
    vaultCoveredDomains: coveredCount,
    vaultGapDomains: matrix.celestialVault.length - coveredCount,
    dataMaturity: trades.length >= 20 ? 'ADEQUATE' : trades.length > 0 ? 'THIN' : 'NONE'
  };

  return matrix;
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. BANDIT FEEDBACK — report vault-dig findings as swarm outcomes
// ═════════════════════════════════════════════════════════════════════════════

async function reportToBandit(contradictions) {
  // Only wire if swarm-loop is importable
  try {
    const { joinLoop } = await import('./swarm-loop.js');
    const loop = joinLoop('vault-dig', ['principle_gaps', 'contradictions', 'topology']);

    // Report contradiction findings as discoveries
    for (const c of contradictions) {
      if (c.relationship === 'IMPLY_NEW') {
        loop.reportDiscovery('contradictions', 0.9);
      } else if (c.relationship === 'CONTRADICT') {
        loop.reportDiscovery('contradictions', 0.7);
      }
    }

    return true;
  } catch (e) {
    console.log(`[vault-dig] Bandit wiring skipped: ${e.message}`);
    return false;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// COMBINED REPORT
// ═════════════════════════════════════════════════════════════════════════════

function formatReport(gaps, contradictions, topology, holeValues, anomalies, phaseCoherence) {
  let report = 'VAULT DIG REPORT\n\n';

  // 1. Principle-Action Gaps
  report += `[1] PRINCIPLE-ACTION GAPS (${gaps.length} orphan principles)\n`;
  if (gaps.length === 0) {
    report += 'All principles referenced by at least one agent.\n\n';
  } else {
    for (const g of gaps.slice(0, 15)) {
      report += `  ${g.principle}\n    ${g.file}\n`;
    }
    if (gaps.length > 15) report += `  ...and ${gaps.length - 15} more\n`;
    report += '\n';
  }

  // 2. Contradiction Synthesis
  report += `[2] CONTRADICTION SYNTHESIS (${contradictions.length} non-neutral findings)\n`;
  if (contradictions.length === 0) {
    report += 'No contradictions or implications found in surprise pairs.\n\n';
  } else {
    for (const c of contradictions) {
      report += `  ${c.relationship}: [${c.sourceDomain}] ${c.sourceTitle?.slice(0, 40)}\n`;
      report += `    x [${c.targetDomain}] ${c.targetTitle?.slice(0, 40)}\n`;
      report += `    ${c.insight}\n`;
      if (c.action) report += `    -> ${c.action}\n`;
      report += '\n';
    }
  }

  // 3. Topology
  report += `[3] TOPOLOGY METRICS\n`;

  if (topology.gateways.length > 0) {
    report += `  Gateway nodes (connect 3+ communities):\n`;
    for (const g of topology.gateways.slice(0, 5)) {
      report += `    ${g.title} [${g.domain}] — ${g.communitiesConnected} communities, ${g.crossDomainDegree} bridges\n`;
    }
    report += '\n';
  }

  if (topology.bridgeNodes.length > 0) {
    report += `  Highest cross-domain degree:\n`;
    for (const b of topology.bridgeNodes.slice(0, 5)) {
      report += `    ${b.title} [${b.domain}] — ${b.crossDomainDegree} connections\n`;
    }
    report += '\n';
  }

  if (topology.orphans.total > 0) {
    report += `  Orphans: ${topology.orphans.total}/${topology.orphans.totalClustered} (${topology.orphans.percentage}%) have zero cross-domain links\n`;
    for (const d of topology.orphans.byDomain.slice(0, 5)) {
      report += `    ${d.domain}: ${d.count} orphans (e.g. "${d.sample}")\n`;
    }
    report += '\n';
  }

  // 5. Hole-Value Scoring
  report += `[5] HOLE-VALUE SCORING — Swanson ABC (${holeValues.length} structural holes)\n`;
  if (holeValues.length === 0) {
    report += 'No high-value structural holes detected.\n\n';
  } else {
    for (const h of holeValues.slice(0, 8)) {
      report += `  ${h.holeValue} — [${h.sourceDomain}] ${h.sourceTitle}\n`;
      report += `    x [${h.targetDomain}] ${h.targetTitle}\n`;
      report += `    F=${h.foundational} M=${h.maturity} P=${h.persistence} sim=${h.similarity.toFixed(2)}\n`;
    }
    report += '\n';
  }

  // 6. Anomaly Gradient
  report += `[6] ANOMALY GRADIENT (${anomalies.length} scored)\n`;
  if (anomalies.length === 0) {
    report += 'No anomaly candidates found.\n\n';
  } else {
    for (const a of anomalies) {
      report += `  ${a.gradient} [${a.grade}] ${a.title}\n`;
      report += `    I=${a.independence} P=${a.persistence} T=${a.theoryEdge} R=${a.resolutionPower}\n`;
      if (a.summary) report += `    ${a.summary}\n`;
    }
    report += '\n';
  }

  // 7. Phase-Coherence Matrix
  report += `[7] PHASE-COHERENCE MATRIX\n`;
  if (!phaseCoherence || !phaseCoherence.summary) {
    report += 'Phase coherence data unavailable.\n\n';
  } else {
    const s = phaseCoherence.summary;
    report += `  ${s.celestialEvents} celestial events, ${s.tradingOverlaps} trade overlaps, data maturity: ${s.dataMaturity}\n`;
    report += `  Vault covers ${s.vaultCoveredDomains}/${s.aftermathDomains} aftermath domains (${s.vaultGapDomains} gaps)\n`;

    if (phaseCoherence.celestialTrades.length > 0) {
      report += '  Celestial x Trading:\n';
      for (const ct of phaseCoherence.celestialTrades.slice(0, 4)) {
        for (const ne of ct.nearEvents.slice(0, 2)) {
          report += `    ${ct.category}: ${ne.event} — ${ne.tradesNear} trades near, avg PnL $${ne.avgPnl}\n`;
        }
      }
    }

    const gaps = phaseCoherence.celestialVault.filter(v => !v.vaultCovered);
    if (gaps.length > 0) {
      report += '  Vault gaps in aftermath domains:\n';
      for (const g of gaps) {
        report += `    ${g.aftermathDomain} (${g.eventCount} events) — no vault coverage\n`;
      }
    }
    report += '\n';
  }

  return report;
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════════════

export async function runVaultDig() {
  console.log('[vault-dig] Starting...');

  // 1. Principle gaps (instant, zero cost)
  console.log('[vault-dig] Scanning principle-action gaps...');
  const gaps = detectPrincipleGaps();
  console.log(`[vault-dig] ${gaps.length} orphan principles found`);

  // 2. Topology metrics (instant, zero cost)
  console.log('[vault-dig] Computing topology metrics...');
  const topology = computeTopologyMetrics();
  console.log(`[vault-dig] ${topology.gateways.length} gateways, ${topology.orphans.total || 0} orphans`);

  // 5. Hole-value scoring (instant, zero cost — reads existing graph DB)
  console.log('[vault-dig] Scoring structural holes (Swanson ABC)...');
  const holeValues = scoreHoleValues();
  console.log(`[vault-dig] ${holeValues.length} high-value holes`);

  // 3. Contradiction synthesis (LLM, budget-capped at 10)
  console.log('[vault-dig] Synthesizing contradictions from surprise pairs...');
  const contradictions = await synthesizeContradictions();
  console.log(`[vault-dig] ${contradictions.length} non-neutral findings`);

  // 6. Anomaly gradient (LLM, budget-capped at 8)
  console.log('[vault-dig] Scoring anomaly gradient...');
  const anomalies = await scoreAnomalyGradient();
  console.log(`[vault-dig] ${anomalies.length} anomalies scored`);

  // 7. Phase-coherence matrix (instant for data; dynamic import for sky-sense)
  console.log('[vault-dig] Computing phase-coherence matrix...');
  const phaseCoherence = await computePhaseCoherence();
  console.log(`[vault-dig] ${phaseCoherence.celestialTrades.length} celestial-trade overlaps`);

  // 4. Bandit feedback
  await reportToBandit(contradictions);

  // Format and send
  const report = formatReport(gaps, contradictions, topology, holeValues, anomalies, phaseCoherence);
  await sendTelegram(report);

  return { gaps, contradictions, topology, holeValues, anomalies, phaseCoherence, report };
}

// ── Telegram command registration ────────────────────────────────────────────

export function registerVaultDigCommands(bot) {
  const PAUL = process.env.PAUL_CHAT_ID ? parseInt(process.env.PAUL_CHAT_ID) : null;

  bot.onText(/^\/vault-dig(?:@\w+)?$/, async (msg) => {
    const chatId = msg.chat.id;
    if (PAUL && chatId !== PAUL) return;
    await bot.sendMessage(chatId, 'Vault Dig running... (7 capabilities: gaps + topology + holes + contradictions + anomalies + phase-coherence). ~90s.');
    try {
      const result = await runVaultDig();
      // Report already sent via sendTelegram, but also reply directly
      const summary = `Vault Dig complete: ${result.gaps.length} orphan principles, ${result.contradictions.length} contradictions, ${result.holeValues.length} structural holes, ${result.anomalies.length} anomalies, ${result.phaseCoherence.celestialTrades.length} phase overlaps`;
      await bot.sendMessage(chatId, summary);
    } catch (e) {
      await bot.sendMessage(chatId, `Vault Dig error: ${e.message}`);
    }
  });
}

// ── Direct execution ─────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].includes('vault-dig')) {
  runVaultDig().then(result => {
    console.log('\n' + result.report);
    process.exit(0);
  }).catch(e => {
    console.error('[vault-dig] Fatal:', e);
    process.exit(1);
  });
}
