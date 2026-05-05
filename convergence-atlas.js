// ~/nanoclaw/convergence-atlas.js
// Session 6: Convergence Atlas
//
// Maps Gold Extractor findings across three substrate layers:
//   Mathematical  — same constants appearing across domains
//   Geometric     — same forms appearing across research traditions
//   Institutional — same suppression playbook across researchers
//
// Detects Meta-Convergences where 2+ substrate layers align on the same domain.
// Stores in SQLite convergence_atlas table.
// Exports: buildAtlas(), getLatestAtlas(), getOrBuildAtlas()

import Database from 'better-sqlite3';
import { join } from 'path';
import { fileURLToPath } from 'url';

const HOME    = process.env.HOME;
const DB_PATH = join(HOME, 'nanoclaw', 'vortex_data', 'metrics.db');

const db = new Database(DB_PATH);

// ── Schema ────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS convergence_atlas (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    built_at               INTEGER NOT NULL,
    mathematical_json      TEXT,
    geometric_json         TEXT,
    institutional_json     TEXT,
    meta_convergences_json TEXT,
    map_text               TEXT
  )
`);

// ── Load latest gold findings ─────────────────────────────────────────────────

function loadLatestGoldFindings() {
  const row = db
    .prepare('SELECT findings_json FROM gold_findings ORDER BY run_at DESC LIMIT 1')
    .get();
  if (!row) return [];
  try {
    return JSON.parse(row.findings_json);
  } catch {
    return [];
  }
}

// ── Substrate 1: Mathematical ─────────────────────────────────────────────────
// Groups RATIO findings. Finds hotspot domains (multiple constants) and
// strong convergences (ratio appearing in 3+ independent domains).

function buildMathematicalSubstrate(findings) {
  const ratios = findings.filter(f => f.type === 'RATIO');

  // domain → which ratios appear there
  const domainToRatios = {};
  for (const r of ratios) {
    for (const domain of r.domains) {
      if (!domainToRatios[domain]) domainToRatios[domain] = [];
      domainToRatios[domain].push(r.name);
    }
  }

  // Domains carrying 2+ independent constants
  const hotspots = Object.entries(domainToRatios)
    .filter(([, rs]) => rs.length >= 2)
    .map(([domain, rs]) => ({ domain, ratios: rs, count: rs.length }))
    .sort((a, b) => b.count - a.count);

  // Ratios spanning 3+ domains = strongest mathematical convergences
  const strong = ratios
    .filter(r => r.domains.length >= 3)
    .map(r => ({ name: r.name, domains: r.domains, confidence: r.confidence, nuggets: r.total_nuggets }));

  return {
    ratios:   ratios.map(r => ({ name: r.name, domains: r.domains, confidence: r.confidence, nuggets: r.total_nuggets })),
    hotspots,
    strong,
  };
}

// ── Substrate 2: Geometric ────────────────────────────────────────────────────
// Groups GEOMETRY findings. Finds hotspot domains and cross-domain forms.

function buildGeometricSubstrate(findings) {
  const geos = findings.filter(f => f.type === 'GEOMETRY');

  const domainToForms = {};
  for (const g of geos) {
    for (const domain of g.domains) {
      if (!domainToForms[domain]) domainToForms[domain] = [];
      domainToForms[domain].push(g.form);
    }
  }

  const hotspots = Object.entries(domainToForms)
    .filter(([, fs]) => fs.length >= 2)
    .map(([domain, forms]) => ({ domain, forms, count: forms.length }))
    .sort((a, b) => b.count - a.count);

  const crossDomain = geos
    .filter(g => g.domains.length >= 2)
    .map(g => ({ form: g.form, domains: g.domains, nuggets: g.total_nuggets }));

  return {
    forms:       geos.map(g => ({ form: g.form, domains: g.domains, nuggets: g.total_nuggets })),
    hotspots,
    crossDomain,
  };
}

// ── Substrate 3: Institutional ────────────────────────────────────────────────
// Groups SUPPRESSION findings into a researcher actor-network.
// Tracks which playbook stages are most documented.

function buildInstitutionalSubstrate(findings) {
  const suppressions = findings.filter(f => f.type === 'SUPPRESSION');

  if (suppressions.length === 0) {
    return { pairs: [], network: {}, playbook_coverage: {} };
  }

  const network    = {};
  const stageCounts = {};

  for (const s of suppressions) {
    const a = s.researcher_a;
    const b = s.researcher_b;

    if (!network[a]) network[a] = { connections: [], stages: s.stages_of_a || [] };
    if (!network[b]) network[b] = { connections: [], stages: s.stages_of_b || [] };

    network[a].connections.push({ to: b, shared_stages: s.shared_stages });
    network[b].connections.push({ to: a, shared_stages: s.shared_stages });

    for (const stage of (s.shared_stages || [])) {
      stageCounts[stage] = (stageCounts[stage] || 0) + 1;
    }
  }

  const playbook_coverage = Object.entries(stageCounts)
    .sort((a, b) => b[1] - a[1])
    .reduce((acc, [stage, count]) => { acc[stage] = count; return acc; }, {});

  return {
    pairs: suppressions.map(s => ({
      a:            s.researcher_a,
      b:            s.researcher_b,
      shared:       s.shared_stages,
      total_shared: s.shared_stages.length,
    })),
    network,
    playbook_coverage,
  };
}

// ── Meta-Convergence Detection ────────────────────────────────────────────────
// Fires when the SAME domain appears in 2+ substrate hotspot layers.
// Full Meta-Convergence = all three substrates point to same domain.
// Also detects ratio-form overlap (e.g. Fibonacci as both constant and geometry).

function detectMetaConvergences(math, geo, institutional) {
  const mathDomains         = new Set(math.hotspots.map(h => h.domain));
  const geoDomains          = new Set(geo.hotspots.map(h => h.domain));
  const institutionalResearchers = new Set(Object.keys(institutional.network || {}));

  const metaConvergences = [];

  // Domain appears in Mathematical AND Geometric hotspots
  for (const domain of mathDomains) {
    if (!geoDomains.has(domain)) continue;

    const mathEntry = math.hotspots.find(h => h.domain === domain);
    const geoEntry  = geo.hotspots.find(h => h.domain === domain);

    const alert = {
      type:         'MATH_GEO',
      domain,
      description:  `Domain "${domain}" is a hotspot in both Mathematical and Geometric substrates`,
      mathematical: mathEntry?.ratios  || [],
      geometric:    geoEntry?.forms    || [],
      confidence:   'HIGH',
    };

    // Upgrade if institutional network also covers this domain (researcher name match)
    const hasInstitutional = [...institutionalResearchers].some(r =>
      domain.toLowerCase().includes(r.toLowerCase())
    );
    if (hasInstitutional) {
      alert.type        = 'FULL_META';
      alert.confidence  = 'VERY HIGH';
      alert.description = `FULL META-CONVERGENCE: "${domain}" appears across Mathematical, Geometric AND Institutional substrates`;
    }

    metaConvergences.push(alert);
  }

  // Fibonacci/Phi appears as both a mathematical constant AND a geometric form
  const fibRatio = math.ratios.find(r =>
    r.name.toLowerCase().includes('fibonacci') || r.name.toLowerCase().includes('golden')
  );
  const fibGeo = geo.forms.find(g =>
    g.form.toLowerCase().includes('fibonacci') || g.form.toLowerCase().includes('spiral')
  );

  if (fibRatio && fibGeo) {
    const domainOverlap = fibRatio.domains.filter(d => fibGeo.domains.includes(d));
    if (domainOverlap.length >= 2) {
      metaConvergences.push({
        type:        'RATIO_FORM_OVERLAP',
        description: `Fibonacci / Golden Ratio manifests as BOTH a mathematical constant AND a geometric form in: ${domainOverlap.join(', ')}`,
        domains:     domainOverlap,
        mathematical: [fibRatio.name],
        geometric:    [fibGeo.form],
        confidence:   'HIGH',
      });
    }
  }

  // Vortex as mathematical AND geometric marker
  const vortexGeo = geo.forms.find(g => g.form.toLowerCase().includes('vortex'));
  const schumannRatio = math.ratios.find(r => r.name.toLowerCase().includes('schumann'));
  if (vortexGeo && schumannRatio) {
    const overlap = vortexGeo.domains.filter(d => schumannRatio.domains.includes(d));
    if (overlap.length >= 1) {
      metaConvergences.push({
        type:        'FREQ_FORM',
        description: `Vortex geometry and Schumann resonance co-appear in: ${overlap.join(', ')} — frequency and form converging`,
        domains:     overlap,
        mathematical: [schumannRatio.name],
        geometric:    [vortexGeo.form],
        confidence:   'MEDIUM',
      });
    }
  }

  return metaConvergences;
}

// ── Format Atlas Map ──────────────────────────────────────────────────────────

function formatAtlasMap(math, geo, institutional, metaConvergences, builtAt) {
  const date = new Date(builtAt).toLocaleString('en-HK', { timeZone: 'Asia/Hong_Kong' });

  let out = `🗺️ *CONVERGENCE ATLAS*\n`;
  out += `_Built: ${date} HKT_\n\n`;

  // ── Mathematical Substrate
  out += `*MATHEMATICAL SUBSTRATE*\n`;
  out += `_Recurring constants across independent domains_\n`;

  if (math.strong.length === 0) {
    out += `  No strong multi-domain ratio convergences detected\n`;
  } else {
    for (const r of math.strong.slice(0, 5)) {
      out += `  • *${r.name}* → ${r.domains.slice(0, 4).join(' | ')}`;
      if (r.domains.length > 4) out += ` +${r.domains.length - 4} more`;
      out += ` [conf: ${r.confidence}]\n`;
    }
  }

  if (math.hotspots.length > 0) {
    out += `\n  _Multi-constant domains (hotspots):_\n`;
    for (const h of math.hotspots.slice(0, 4)) {
      out += `  ★ ${h.domain}: ${h.ratios.join(', ')}\n`;
    }
  }
  out += `\n`;

  // ── Geometric Substrate
  out += `*GEOMETRIC SUBSTRATE*\n`;
  out += `_Recurring forms across research traditions_\n`;

  if (geo.crossDomain.length === 0) {
    out += `  No cross-domain geometric recurrences detected\n`;
  } else {
    for (const g of geo.crossDomain.slice(0, 6)) {
      out += `  • *${g.form}* → ${g.domains.slice(0, 4).join(' | ')}`;
      if (g.domains.length > 4) out += ` +${g.domains.length - 4} more`;
      out += `\n`;
    }
  }

  if (geo.hotspots.length > 0) {
    out += `\n  _Multi-form domains (hotspots):_\n`;
    for (const h of geo.hotspots.slice(0, 4)) {
      out += `  ★ ${h.domain}: ${h.forms.join(', ')}\n`;
    }
  }
  out += `\n`;

  // ── Institutional Substrate
  out += `*INSTITUTIONAL SUBSTRATE*\n`;
  out += `_Suppression playbook across researchers_\n`;

  if (institutional.pairs.length === 0) {
    out += `  No documented suppression matches in vault\n`;
    out += `  _Gap: vault needs more suppression documentation_\n`;
  } else {
    for (const p of institutional.pairs.slice(0, 5)) {
      out += `  • *${p.a}* + *${p.b}*: ${p.total_shared}/5 shared stages [${p.shared.join(', ')}]\n`;
    }
    if (Object.keys(institutional.playbook_coverage).length > 0) {
      out += `\n  _Most documented playbook stages:_\n`;
      for (const [stage, count] of Object.entries(institutional.playbook_coverage).slice(0, 4)) {
        out += `  ★ ${stage}: ${count} pair${count !== 1 ? 's' : ''}\n`;
      }
    }
  }
  out += `\n`;

  // ── Meta-Convergences
  out += `*META-CONVERGENCES*\n`;
  out += `_Where substrate layers align_\n`;

  if (metaConvergences.length === 0) {
    out += `  No cross-substrate convergences detected\n`;
    out += `  _Run /goldrun then /atlas as vault grows_\n`;
  } else {
    for (const m of metaConvergences) {
      const prefix = m.type === 'FULL_META' ? '🔴 FULL META' : '🟡 PARTIAL';
      out += `\n  ${prefix} [${m.confidence}]\n`;
      out += `  ${m.description}\n`;
      if (m.mathematical?.length > 0) out += `    Math: ${m.mathematical.join(', ')}\n`;
      if (m.geometric?.length > 0)    out += `    Geo:  ${m.geometric.join(', ')}\n`;
      if (m.domains?.length > 0)      out += `    Domains: ${m.domains.join(', ')}\n`;
    }
  }

  out += `\n\n_Use /oracle to speculate on what these convergences mean._`;

  return out.trim();
}

// ── Build Atlas ───────────────────────────────────────────────────────────────

export async function buildAtlas() {
  console.log('[convergence-atlas] Building atlas from latest gold findings...');

  const findings = loadLatestGoldFindings();
  if (findings.length === 0) {
    console.warn('[convergence-atlas] No gold findings. Run /goldrun first.');
    return null;
  }

  const builtAt = Date.now();

  const math          = buildMathematicalSubstrate(findings);
  const geo           = buildGeometricSubstrate(findings);
  const institutional = buildInstitutionalSubstrate(findings);
  const metaConvergences = detectMetaConvergences(math, geo, institutional);

  const mapText = formatAtlasMap(math, geo, institutional, metaConvergences, builtAt);

  db.prepare(`
    INSERT INTO convergence_atlas
      (built_at, mathematical_json, geometric_json, institutional_json, meta_convergences_json, map_text)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    builtAt,
    JSON.stringify(math),
    JSON.stringify(geo),
    JSON.stringify(institutional),
    JSON.stringify(metaConvergences),
    mapText,
  );

  console.log(`[convergence-atlas] Done. ${metaConvergences.length} meta-convergences. ${math.strong.length} strong math ratios. ${geo.crossDomain.length} geometric cross-domain forms.`);

  return mapText;
}

// ── Get Latest Atlas ──────────────────────────────────────────────────────────

export function getLatestAtlas() {
  return db.prepare('SELECT * FROM convergence_atlas ORDER BY built_at DESC LIMIT 1').get() || null;
}

// ── Get or Build (cached 24h) ─────────────────────────────────────────────────

export async function getOrBuildAtlas(maxAgeMs = 24 * 60 * 60 * 1000) {
  const latest = getLatestAtlas();

  if (latest && (Date.now() - latest.built_at) < maxAgeMs) {
    const ageH = Math.round((Date.now() - latest.built_at) / 3600000);
    return `${latest.map_text}\n\n_Cached · ${ageH}h ago · /atlas rebuild for fresh_`;
  }

  return buildAtlas();
}

// ── CLI entrypoint ────────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildAtlas()
    .then(text => {
      if (text) {
        // Strip markdown for CLI
        console.log('\n' + text.replace(/[*_`]/g, ''));
      } else {
        console.log('No gold findings to build from. Run: node gold-extractor.js first.');
      }
    })
    .catch(err => {
      console.error('Atlas build failed:', err.message);
      process.exit(1);
    });
}
