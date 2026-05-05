// ~/nanoclaw/gold-extractor.js
// Session 8 (build-sequence): Gold Extraction Layer
//
// Five detection passes:
//   1. Ratio Convergence        — same mathematical constant in 2+ independent domains
//   2. Geometric Recurrence     — same geometric form across independent research traditions
//   3. Suppression Pattern      — researchers sharing 2+ documented playbook stages
//   4. Cross-Domain Bridges     — high embedding similarity between domains with few wikilinks
//   5. Open Threads             — paul-profile.json threads mapped against vault coverage
//
// Runs on a 6-hour internal cron. Stores briefings in SQLite gold_findings table.
// Exports: runGoldExtraction(), getOrRunGold(), startGoldCron()

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join }         from 'path';
import { createRequire } from 'module';
const _requireGE = createRequire(join(process.env.HOME, 'nanoclaw', 'package.json'));
const { appendProjectLog } = _requireGE('./project-log.cjs');
import { runNegativeSpaceScan, formatNegativeSpaceFindings } from './negative-space.js';

const HOME              = process.env.HOME;
const DB_PATH           = join(HOME, 'nanoclaw', 'vortex_data', 'metrics.db');
const PAUL_PROFILE_PATH = join(HOME, 'nanoclaw', 'memory', 'patterns', 'paul-profile.json');
const OLLAMA_URL        = 'http://localhost:11434';

const db = new Database(DB_PATH);

// ── Schema ────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS gold_findings (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    run_at        INTEGER NOT NULL,
    briefing      TEXT    NOT NULL,
    findings_json TEXT
  )
`);

// ── Known ratios to detect ────────────────────────────────────────────────────

const KNOWN_RATIOS = [
  {
    name:     'Golden Ratio (φ)',
    keywords: ['1.618', 'phi', 'golden ratio', 'fibonacci', 'golden mean', 'golden section', 'golden spiral'],
  },
  {
    name:     'Inverse Phi (1/φ)',
    keywords: ['0.618', 'inverse phi', '0.618033'],
  },
  {
    name:     'Square Root of 2',
    keywords: ['1.414', 'sqrt 2', 'square root of 2', 'root 2', '√2'],
  },
  {
    name:     'Square Root of 3',
    keywords: ['1.732', 'sqrt 3', 'square root of 3', 'root 3', '√3'],
  },
  {
    name:     'Pi (π)',
    keywords: ['3.14159', 'pi ratio', 'pi constant', 'value of pi'],
  },
  {
    name:     'Schumann Resonance (7.83 Hz)',
    keywords: ['7.83', 'schumann', 'earth resonance frequency', 'schumann resonance', 'earth frequency'],
  },
  {
    name:     '432 Hz',
    keywords: ['432 hz', '432hz', '432 hertz', 'a = 432'],
  },
  {
    name:     '528 Hz',
    keywords: ['528 hz', '528hz', '528 hertz', 'love frequency', 'miracle tone'],
  },
];

// ── Geometric forms to detect ─────────────────────────────────────────────────

const GEOMETRY_FORMS = [
  'torus',
  'toroidal',
  'vortex',
  'spiral',
  'fibonacci',
  'platonic solid',
  'hexagonal',
  'crystalline',
  'fractal',
  'standing wave',
  'resonant cavity',
  'logarithmic spiral',
  'vesica piscis',
  'flower of life',
  'merkaba',
  'sacred geometry',
  'implosion',
];

// ── Suppression playbook stages ───────────────────────────────────────────────

const SUPPRESSION_STAGES = ['marginalise', 'marginalize', 'seize', 'discredit', 'erase', 'replace', 'suppress', 'confiscate'];

const KEY_RESEARCHERS = [
  'tesla', 'schauberger', 'rife', 'moray', 'hutchison', 'reich', 'keely',
  'priore', 'bearden', 'leedskalnin', 'kozyrev', 'halton arp', 'bedini',
  'haramein', 'searl', 'meyl',
];

// ── Embedding helpers ─────────────────────────────────────────────────────────

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

// ── Detection Pass 1: Ratio Convergence ──────────────────────────────────────
// Looks for nuggets mentioning known constants, groups by domain.
// Flags any ratio found in 2+ distinct domains.

function detectRatioConvergences(rows) {
  const findings = [];

  for (const ratio of KNOWN_RATIOS) {
    const matching = rows.filter(row => {
      const text = `${row.title} ${row.first_line} ${row.tags}`.toLowerCase();
      return ratio.keywords.some(kw => text.includes(kw.toLowerCase()));
    });

    if (matching.length < 2) continue;

    const domainMap = {};
    for (const row of matching) {
      const domain = (row.domain || 'unknown').trim();
      if (!domainMap[domain]) domainMap[domain] = [];
      domainMap[domain].push(row.title);
    }

    const domains = Object.keys(domainMap);
    if (domains.length < 2) continue;

    // Confidence scales with domain count and nugget count
    const confidence = Math.min(0.95, 0.40 + domains.length * 0.12 + matching.length * 0.01);

    findings.push({
      type:          'RATIO',
      name:          ratio.name,
      domains,
      examples:      matching.slice(0, 3).map(r => r.title),
      total_nuggets: matching.length,
      confidence:    +confidence.toFixed(2),
    });
  }

  // Sort by confidence descending
  return findings.sort((a, b) => b.confidence - a.confidence);
}

// ── Detection Pass 2: Geometric Recurrence ───────────────────────────────────
// Finds geometric vocabulary across domains.
// Flags forms present in 2+ independent domains.

function detectGeometricRecurrences(rows) {
  const findings = [];

  for (const form of GEOMETRY_FORMS) {
    const matching = rows.filter(row => {
      const text = `${row.title} ${row.first_line} ${row.tags}`.toLowerCase();
      return text.includes(form.toLowerCase());
    });

    if (matching.length < 2) continue;

    const domainMap = {};
    for (const row of matching) {
      const domain = (row.domain || 'unknown').trim();
      if (!domainMap[domain]) domainMap[domain] = [];
      domainMap[domain].push(row.title);
    }

    const domains = Object.keys(domainMap);
    if (domains.length < 2) continue;

    findings.push({
      type:          'GEOMETRY',
      form,
      domains,
      examples:      matching.slice(0, 3).map(r => r.title),
      total_nuggets: matching.length,
    });
  }

  // Sort by total nuggets descending
  return findings.sort((a, b) => b.total_nuggets - a.total_nuggets);
}

// ── Detection Pass 3: Suppression Pattern Matching ───────────────────────────
// Finds researchers documented with suppression vocabulary.
// Matches pairs sharing 2+ suppression stages.

function detectSuppressionMatches(rows) {
  const researcherData = {};

  for (const researcher of KEY_RESEARCHERS) {
    const matching = rows.filter(row => {
      const text = `${row.title} ${row.first_line}`.toLowerCase();
      return text.includes(researcher);
    });

    if (matching.length === 0) continue;

    const stagesFound = [];
    for (const stage of SUPPRESSION_STAGES) {
      const inVault = matching.some(row => {
        const text = `${row.title} ${row.first_line} ${row.tags}`.toLowerCase();
        return text.includes(stage);
      });
      if (inVault && !stagesFound.includes(stage)) stagesFound.push(stage);
    }

    researcherData[researcher] = { nuggets: matching.length, stages: stagesFound };
  }

  const researchers = Object.keys(researcherData);
  const findings    = [];

  for (let i = 0; i < researchers.length; i++) {
    for (let j = i + 1; j < researchers.length; j++) {
      const a = researchers[i];
      const b = researchers[j];
      const sharedStages = researcherData[a].stages.filter(s => researcherData[b].stages.includes(s));

      if (sharedStages.length >= 2) {
        findings.push({
          type:          'SUPPRESSION',
          researcher_a:  a,
          researcher_b:  b,
          shared_stages: sharedStages,
          stages_of_a:   researcherData[a].stages,
          stages_of_b:   researcherData[b].stages,
          nuggets_a:     researcherData[a].nuggets,
          nuggets_b:     researcherData[b].nuggets,
        });
      }
    }
  }

  return findings.sort((a, b) => b.shared_stages.length - a.shared_stages.length);
}

// ── Detection Pass 4: Cross-Domain Bridges ───────────────────────────────────
// Computes domain centroid embeddings (average of all nugget vectors).
// Flags domain pairs with high semantic similarity but sparse cross-linking.
// These are conceptual bridges that haven't been explicitly mapped yet.

function detectCrossDomainBridges() {
  const allRows = db
    .prepare('SELECT domain, embedding, wikilinks FROM vault_embeddings WHERE embedding IS NOT NULL')
    .all();

  // Group by domain
  const domainData = {};
  for (const row of allRows) {
    const domain = (row.domain || 'unknown').trim();
    if (!domainData[domain]) domainData[domain] = { embeddings: [], wikilinks: [] };
    try {
      domainData[domain].embeddings.push(blobToEmbedding(row.embedding));
      if (row.wikilinks) {
        const links = JSON.parse(row.wikilinks);
        domainData[domain].wikilinks.push(...links.map(l => l.toLowerCase()));
      }
    } catch { /* skip corrupt rows */ }
  }

  // Only domains with at least 3 nuggets
  const domains = Object.keys(domainData).filter(d => domainData[d].embeddings.length >= 3);
  if (domains.length < 2) return [];

  // Compute centroids
  const centroids = {};
  for (const domain of domains) {
    const embeddings = domainData[domain].embeddings;
    const dim        = embeddings[0].length;
    const centroid   = new Float32Array(dim);
    for (const emb of embeddings) {
      for (let i = 0; i < dim; i++) centroid[i] += emb[i];
    }
    for (let i = 0; i < dim; i++) centroid[i] /= embeddings.length;
    centroids[domain] = centroid;
  }

  // Find high-similarity pairs with few explicit cross-links
  const findings = [];
  for (let i = 0; i < domains.length; i++) {
    for (let j = i + 1; j < domains.length; j++) {
      const a   = domains[i];
      const b   = domains[j];
      const sim = cosineSimilarity(centroids[a], centroids[b]);

      // Count bidirectional wikilink overlap between domains
      const aLinks     = domainData[a].wikilinks;
      const bLinks     = domainData[b].wikilinks;
      const crossLinks = aLinks.filter(l => bLinks.some(bl => bl === l || bl.includes(l) || l.includes(bl)));

      // High semantic similarity + sparse explicit mapping = bridge candidate
      if (sim > 0.60 && crossLinks.length < 5) {
        findings.push({
          type:        'BRIDGE',
          domain_a:    a,
          domain_b:    b,
          similarity:  +sim.toFixed(3),
          cross_links: crossLinks.length,
          nuggets_a:   domainData[a].embeddings.length,
          nuggets_b:   domainData[b].embeddings.length,
        });
      }
    }
  }

  return findings
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 6);
}

// ── Detection Pass 5: Open Threads from paul-profile.json ────────────────────
// Pulls emergingPatterns.openThreads and measures vault coverage for each thread.

function surfaceOpenThreads(rows) {
  try {
    const profile = JSON.parse(readFileSync(PAUL_PROFILE_PATH, 'utf8'));
    const threads = [
      ...(profile.emergingPatterns?.openThreads || []),
      ...(profile.emergingPatterns?.currentFocus || []),
    ];

    return threads.map(thread => {
      const words = thread.toLowerCase().split(/\s+/).filter(w => w.length > 4);
      const matching = rows.filter(row => {
        const text = `${row.title} ${row.first_line}`.toLowerCase();
        return words.some(word => text.includes(word));
      });

      let coverage;
      if (matching.length >= 10)     coverage = 'ADEQUATE';
      else if (matching.length >= 3) coverage = 'THIN';
      else                           coverage = 'GAP';

      return {
        type:         'THREAD',
        thread,
        coverage,
        nugget_count: matching.length,
      };
    });
  } catch (err) {
    console.error('[gold-extractor] Paul profile read error:', err.message);
    return [];
  }
}

// ── Format Gold Briefing ──────────────────────────────────────────────────────

function formatGoldBriefing(findings, runAt, negativeSpaceSummary = '') {
  const date       = new Date(runAt).toLocaleString('en-HK', { timeZone: 'Asia/Hong_Kong' });
  const vaultCount = db.prepare('SELECT COUNT(*) as c FROM vault_embeddings').get()?.c ?? 0;
  const domainCount = db.prepare('SELECT COUNT(DISTINCT domain) as c FROM vault_embeddings').get()?.c ?? 0;

  const ratios      = findings.filter(f => f.type === 'RATIO');
  const geos        = findings.filter(f => f.type === 'GEOMETRY');
  const suppressions = findings.filter(f => f.type === 'SUPPRESSION');
  const bridges     = findings.filter(f => f.type === 'BRIDGE');
  const threads     = findings.filter(f => f.type === 'THREAD');

  let out = `🥇 *GOLD BRIEFING*\n`;
  out += `_${date} HKT_\n`;
  out += `Vault: ${vaultCount} nuggets · ${domainCount} domains\n`;
  out += `\n`;

  // ── Ratio Convergences
  out += `*RATIO CONVERGENCES:* ${ratios.length} finding${ratios.length !== 1 ? 's' : ''}\n`;
  if (ratios.length === 0) {
    out += `  _No multi-domain ratio convergences detected_\n`;
  } else {
    for (const r of ratios.slice(0, 5)) {
      out += `  → *${r.name}* in: ${r.domains.slice(0, 4).join(', ')}`;
      if (r.domains.length > 4) out += ` +${r.domains.length - 4} more`;
      out += `. ${r.total_nuggets} nuggets. Confidence: ${r.confidence}\n`;
    }
  }
  out += `\n`;

  // ── Geometric Recurrences
  out += `*GEOMETRIC RECURRENCES:* ${geos.length} finding${geos.length !== 1 ? 's' : ''}\n`;
  if (geos.length === 0) {
    out += `  _No cross-domain geometric recurrences detected_\n`;
  } else {
    for (const g of geos.slice(0, 5)) {
      out += `  → *${g.form}* across: ${g.domains.slice(0, 4).join(', ')}`;
      if (g.domains.length > 4) out += ` +${g.domains.length - 4} more`;
      out += `. ${g.total_nuggets} nuggets\n`;
    }
  }
  out += `\n`;

  // ── Suppression Pattern Matches
  out += `*SUPPRESSION PATTERN MATCH:* ${suppressions.length} match${suppressions.length !== 1 ? 'es' : ''}\n`;
  if (suppressions.length === 0) {
    out += `  _No multi-researcher pattern matches detected_\n`;
  } else {
    for (const s of suppressions.slice(0, 5)) {
      out += `  → *${s.researcher_a}* + *${s.researcher_b}*: ${s.shared_stages.length}/5 stages`;
      out += ` [${s.shared_stages.join(', ')}]\n`;
    }
  }
  out += `\n`;

  // ── Cross-Domain Bridges
  out += `*CROSS-DOMAIN BRIDGES:* ${bridges.length} candidate${bridges.length !== 1 ? 's' : ''}\n`;
  if (bridges.length === 0) {
    out += `  _No undocumented bridges detected_\n`;
  } else {
    for (const b of bridges) {
      const simPct = (b.similarity * 100).toFixed(0);
      out += `  → *${b.domain_a}* ↔ *${b.domain_b}*`;
      out += ` — ${simPct}% semantic similarity, ${b.cross_links} explicit cross-links\n`;
    }
  }
  out += `\n`;

  // ── Open Threads
  out += `*OPEN THREADS (from your profile):*\n`;
  if (threads.length === 0) {
    out += `  _No open threads in profile_\n`;
  } else {
    for (const t of threads) {
      const icon = t.coverage === 'GAP' ? '🔴' : t.coverage === 'THIN' ? '🟡' : '🟢';
      out += `  ${icon} "${t.thread}" — ${t.coverage} (${t.nugget_count} nuggets)\n`;
    }
  }
  out += `\n`;

  // ── Negative Space (Pass 6)
  if (negativeSpaceSummary) {
    out += negativeSpaceSummary;
  }

  return out;
}

// ── Main extraction runner ────────────────────────────────────────────────────

export async function runGoldExtraction() {
  console.log('[gold-extractor] Running extraction passes...');
  const runAt = Date.now();

  // Load all rows once — shared across text-based passes
  const rows = db
    .prepare('SELECT id, domain, title, tags, first_line FROM vault_embeddings')
    .all();

  console.log(`[gold-extractor] Loaded ${rows.length} nuggets from vault.`);

  const ratioFindings       = detectRatioConvergences(rows);
  const geoFindings         = detectGeometricRecurrences(rows);
  const suppressionFindings = detectSuppressionMatches(rows);
  const bridgeFindings      = detectCrossDomainBridges();  // reads embeddings separately
  const threadFindings      = surfaceOpenThreads(rows);

  // Pass 6: Negative Space (forensic absence detection)
  const { findings: negativeSpaceFindings, summary: negativeSpaceSummary } =
    await runNegativeSpaceScan();

  const allFindings = [
    ...ratioFindings,
    ...geoFindings,
    ...suppressionFindings,
    ...bridgeFindings,
    ...threadFindings,
    ...negativeSpaceFindings.map(f => ({ type: 'NEGATIVE_SPACE', ...f })),
  ];

  const briefing = formatGoldBriefing(allFindings, runAt, negativeSpaceSummary);

  db.prepare(
    'INSERT INTO gold_findings (run_at, briefing, findings_json) VALUES (?, ?, ?)'
  ).run(runAt, briefing, JSON.stringify(allFindings));

  const total = allFindings.length;
  console.log(`[gold-extractor] Done. ${total} findings. Briefing stored.`);
  appendProjectLog('cathedral', 'gold_convergence', { findings: total, ratios: allFindings.filter(f => f.type === 'RATIO').length, geometric: allFindings.filter(f => f.type === 'GEOMETRIC').length });

  return briefing;
}

// ── Get latest or run ─────────────────────────────────────────────────────────
// Returns cached briefing if younger than maxAgeMs. Otherwise runs fresh.

export async function getOrRunGold(maxAgeMs = 6 * 60 * 60 * 1000) {
  const latest = db
    .prepare('SELECT * FROM gold_findings ORDER BY run_at DESC LIMIT 1')
    .get();

  if (latest && (Date.now() - latest.run_at) < maxAgeMs) {
    const ageMin = Math.round((Date.now() - latest.run_at) / 60000);
    return `${latest.briefing}\n\n_Cached result · ${ageMin}m ago_`;
  }

  return runGoldExtraction();
}

// ── Internal cron: every 6 hours ─────────────────────────────────────────────

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export function startGoldCron() {
  console.log('[gold-extractor] Gold cron started — runs every 6 hours.');

  // Run immediately if no recent briefing exists
  getOrRunGold().catch(err =>
    console.error('[gold-extractor] Initial run error:', err.message)
  );

  setInterval(() => {
    runGoldExtraction().catch(err =>
      console.error('[gold-extractor] Cron run error:', err.message)
    );
  }, SIX_HOURS_MS);
}
