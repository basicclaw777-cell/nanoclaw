// Cathedral Rosetta — Internal Convergence Detector
// Turns the ancient corpus lens inward on the Cathedral's own vault
// Scans 7,400+ nuggets across 12+ domains for cross-domain structural patterns

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, basename, dirname, relative } from 'path';

const VAULT = '/Users/basicclaw777/cathedral-vault';
const OUTPUT_DIR = join(VAULT, '00_Staging/cathedral');
const CONVERGENCE_FILE = join(OUTPUT_DIR, 'cathedral-convergences.json');
const DASHBOARD_FILE = '/Users/basicclaw777/nanoclaw/cathedral-rosetta-dashboard.html';

// Load env
const envPath = '/Users/basicclaw777/nanoclaw/.env';
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const DEEPSEEK_KEY = env.DEEPSEEK_API_KEY;
const TELEGRAM_TOKEN = env.TELEGRAM_TOKEN;
const CHAT_ID = env.PAUL_CHAT_ID;

async function sendTelegram(text) {
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'Markdown' })
    });
  } catch (e) { /* silent */ }
}

async function callDeepSeek(messages, jsonMode = false) {
  const body = {
    model: 'deepseek-chat',
    messages,
    temperature: 0.2,
    max_tokens: 4000
  };
  if (jsonMode) body.response_format = { type: 'json_object' };

  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify(body)
  });

  const data = await resp.json();
  if (!data || data.error) throw new Error(data?.error?.message || 'Empty response');
  if (!data.choices || !data.choices[0]) throw new Error('No choices in response');
  return data.choices[0].message.content;
}

// ─── Domain Mapping ───

const DOMAIN_MAP = {
  // Boxing & coaching
  boxing: ['boxing', 'boxing-app', 'csob'],
  // Cathedral architecture & methods
  cathedral: ['cathedral'],
  // Agents & emergence
  agents: ['10_Agents'],
  // Cosmology & universe
  cosmology: ['cosmological-models', 'cosmology', 'wave-cosmology', 'universe'],
  // Physics & resonance
  physics: ['electromagnetism', 'frequency-resonance', 'frequency', 'Cymatics and Standing Wave Patterns',
    'Electromagnetic Resonance', 'sacred-geometry', 'toroidal-geometry', 'vortex-dynamics',
    'zero-point-energy', 'aether-medium', 'thermodynamics-entropy', 'water-science', 'water'],
  // Consciousness
  consciousness: ['consciousness', 'consciousness-observer'],
  // Suppression research
  suppression: ['suppression', 'suppression-history'],
  // Business & trading
  business: ['business', 'trading', 'grants'],
  // Personal & identity
  personal: ['personal', 'paul-directed', 'relationships', 'pretta-origin'],
  // Epistemology & philosophy
  epistemology: ['epistemology', 'philosophy', 'model-building'],
  // Mathematics
  mathematics: ['mathematics', 'numerology'],
  // Ancient research
  ancient: ['ancient', 'archaeologist', 'qanon-forensics', 'map-room', 'looking-glass'],
  // Methods & methodology
  methods: ['06_Methods'],
  // Creative & characters
  creative: ['characters', 'illustrations', 'creative']
};

function classifyFile(filePath) {
  const rel = relative(VAULT, filePath);
  const parts = rel.split('/');

  // Direct top-level directory match
  if (parts[0] === '06_Methods') return 'methods';
  if (parts[0] === '10_Agents') return 'agents';
  if (parts[0] === '06_Basic_Reflex_Syllabus') return 'boxing';
  if (parts[0] === '04_Esoteric_Studies') return 'physics';
  if (parts[0] === '03_The_Sages') return 'cathedral';

  // Subdirectory matching (00_Staging/domain/ or 02_Refined_Gold/domain/)
  if (parts.length >= 2) {
    const subdir = parts[1];
    for (const [domain, dirs] of Object.entries(DOMAIN_MAP)) {
      if (dirs.includes(subdir)) return domain;
    }
  }

  return null; // unclassified
}

// ─── Vault Scanner ───

function scanVault() {
  const domains = {};
  let totalFiles = 0;
  let classified = 0;

  function walk(dir) {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }

    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      const full = join(dir, entry);
      let stat;
      try { stat = statSync(full); } catch { continue; }

      if (stat.isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.md')) {
        totalFiles++;
        const domain = classifyFile(full);
        if (domain) {
          classified++;
          if (!domains[domain]) domains[domain] = [];
          domains[domain].push(full);
        }
      }
    }
  }

  walk(VAULT);
  return { domains, totalFiles, classified };
}

// ─── Concept Extraction ───

function extractConcepts(filePath) {
  let content;
  try { content = readFileSync(filePath, 'utf8'); } catch { return []; }

  const concepts = [];

  // 1. Wikilinks [[term]]
  const wikilinks = content.match(/\[\[([^\]]+)\]\]/g) || [];
  for (const wl of wikilinks) {
    const term = wl.slice(2, -2).split('|')[0].trim(); // handle [[term|display]]
    if (term.length > 2 && term.length < 80) {
      concepts.push({ text: term, type: 'wikilink' });
    }
  }

  // 2. YAML frontmatter tags
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const tagMatch = fmMatch[1].match(/tags?:\s*\[([^\]]+)\]/);
    if (tagMatch) {
      const tags = tagMatch[1].split(',').map(t => t.trim().replace(/['"]/g, ''));
      for (const tag of tags) {
        if (tag.length > 1) concepts.push({ text: tag, type: 'tag' });
      }
    }
  }

  // 3. Cathedral vocabulary — known recurring concepts
  const CATHEDRAL_VOCAB = [
    'Fear Gate', 'Greenhouse Model', 'Emergence', 'Convergence', 'Resonance',
    'Suppression', 'Vortex', 'Torus', 'Sacred Geometry', 'Golden Ratio',
    'Fibonacci', 'Base-60', 'Frequency', 'Consciousness', 'Zero Point',
    'Schumann', 'Tesla', 'Schauberger', 'Frame Collapse', 'Ensemble Gate',
    'Epistemic Triage', 'Diagnostic', 'Gate', 'Forgery', 'Sovereignty',
    'OmissionOS', 'IntegrityOS', 'Hypocrisy Cost', 'Mental Forge',
    'Wound', 'Healing Registry', 'Internship', 'Proactivity', 'Calibration',
    'Collapsible Anchor', 'Seed Loop', 'Cup of Tea', 'Perfection Detector',
    'Zimbardo', 'Partnership Relay', 'Paul Kernel', 'Department Intelligence',
    'Paper Trial', 'Forgotten Shelf', 'Mandate Without Mechanism',
    'Builder', 'Architect', 'Saper Vedere', 'Cross-Domain', 'Provenance',
    'Tribunal', 'Oracle', 'Muse', 'Archivist', 'Cartographer',
    'Whisperer', 'Steward', 'Timekeeper', 'Groundskeeper', 'Physician',
    'Prospector', 'Archaeologist', 'Looking Glass', 'Rosetta',
    'Pyramid', 'Cymatics', 'Standing Wave', 'Implosion', 'Plasma',
    'Aether', 'Longitudinal Wave', 'Scalar', 'Phi', 'Pi',
    'Hero Twins', 'Xibalba', 'Popol Vuh', 'Oracle Bones', 'Sumerian',
    'Egyptian', 'Dead Sea Scrolls', 'Venus Cycle', 'Eclipse',
    'Divination', 'Calendar', 'Sacrifice', 'Underworld', 'Creation',
    'Base-20', 'Sexagenary', 'Cuneiform', 'Hieroglyphic',
    'YOLO', 'MediaPipe', 'Gym Eyes', 'Reed', 'Logan', 'Ling', 'Maya',
    'Cathy', 'Kit', 'Boxing', 'Footwork', 'Guard', 'Combo', 'Rhythm',
    'Sugar Principle', 'Processor Model', 'Left Hand Apology',
    'Trojan Horse', 'Diagnostic Empathy', 'Surgical Naming',
    'Knowledge Graph', 'Bandit Brain', 'Linda Tuple', 'Thompson Sampling',
    'Roundtable', 'Town Hall', 'Dissent Round', 'Sprint', 'Appreciation',
    'Trading', 'Gann', 'Lunar', 'Fibonacci', 'Momentum', 'DCA',
    'Polymarket', 'Sentiment', 'Relative Strength',
    'Principle', 'Method', 'Pattern', 'Signal', 'Noise',
    'Coherence', 'Contradiction', 'Drift', 'Decay', 'Metabolism'
  ];

  const lower = content.toLowerCase();
  for (const term of CATHEDRAL_VOCAB) {
    if (lower.includes(term.toLowerCase())) {
      concepts.push({ text: term, type: 'vocabulary' });
    }
  }

  // 4. Capitalized multi-word phrases (potential Cathedral concepts)
  const capPhrases = content.match(/(?:The |A )?[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}/g) || [];
  const seen = new Set();
  for (const phrase of capPhrases) {
    const clean = phrase.replace(/^(The |A )/, '').trim();
    if (clean.length > 5 && clean.length < 50 && !seen.has(clean.toLowerCase())) {
      seen.add(clean.toLowerCase());
      // Skip common English phrases
      if (/^(This Is|That Is|What Is|How To|There Are|They Were|It Was|He Was|She Was|We Are|You Can)/.test(clean)) continue;
      concepts.push({ text: clean, type: 'phrase' });
    }
  }

  return concepts;
}

// ─── Cross-Domain Index ───

function buildCrossDomainIndex(domainConcepts) {
  // concept → { domain → count }
  const index = {};

  for (const [domain, concepts] of Object.entries(domainConcepts)) {
    for (const concept of concepts) {
      const key = concept.text.toLowerCase().trim();
      if (!key || key.length < 3) continue;
      if (!index[key]) index[key] = {};
      index[key][domain] = (index[key][domain] || 0) + 1;
    }
  }

  return index;
}

function findCrossDomainConcepts(index, minDomains = 3) {
  const crossDomain = [];

  for (const [concept, domains] of Object.entries(index)) {
    const domainList = Object.keys(domains);
    if (domainList.length >= minDomains) {
      const totalMentions = Object.values(domains).reduce((a, b) => a + b, 0);
      crossDomain.push({
        concept,
        domains: domainList,
        domainCount: domainList.length,
        mentions: totalMentions,
        distribution: domains
      });
    }
  }

  return crossDomain.sort((a, b) => b.domainCount - a.domainCount || b.mentions - a.mentions);
}

// ─── Top Concepts Per Domain ───

function topConceptsPerDomain(domainConcepts, topN = 25) {
  const result = {};

  for (const [domain, concepts] of Object.entries(domainConcepts)) {
    const counts = {};
    for (const c of concepts) {
      const key = c.text.toLowerCase().trim();
      if (!key || key.length < 3) continue;
      counts[key] = (counts[key] || 0) + 1;
    }
    result[domain] = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([text, count]) => ({ text, count }));
  }

  return result;
}

// ─── Semantic Convergence via DeepSeek ───

async function detectCathedralConvergences(topConcepts, crossDomainConcepts) {
  const analysisPrompts = [
    {
      name: 'structural_patterns',
      description: 'Recurring structural patterns, architectural metaphors, and design principles',
      hint: 'Gates, loops, hierarchies, layers, feedback systems, emergence patterns'
    },
    {
      name: 'diagnostic_methods',
      description: 'Diagnostic and analytical methods that appear across domains',
      hint: 'How Paul diagnoses in boxing, agents, research, coaching, trading — same underlying move?'
    },
    {
      name: 'fear_and_growth',
      description: 'Fear, resistance, growth, transformation, and healing patterns',
      hint: 'Fear gates in boxing, agent blocks, suppression in research, personal growth — same mechanism?'
    },
    {
      name: 'mathematical_convergence',
      description: 'Mathematical constants, ratios, cycles, and numerical patterns across domains',
      hint: 'Base-60, phi, Fibonacci, Schumann, cycles, frequencies appearing in multiple contexts'
    },
    {
      name: 'authority_and_sovereignty',
      description: 'Power structures, institutional patterns, sovereignty, and independence',
      hint: 'Suppression playbook, OmissionOS, self-hosting, open source, sovereignty — same structural pattern?'
    },
    {
      name: 'emergence_and_intelligence',
      description: 'How intelligence, awareness, and capability emerge across different substrates',
      hint: 'Agent emergence, student emergence, ancient civilization patterns, consciousness research — convergent?'
    },
    {
      name: 'the_builders_method',
      description: 'Paul\'s actual working method as revealed across all domains',
      hint: 'What does Paul actually DO that\'s the same whether he\'s coaching, building, researching, or trading?'
    },
    {
      name: 'ancient_and_modern',
      description: 'Where ancient corpus research echoes modern Cathedral infrastructure',
      hint: 'Temple→Cathedral, scribe→agent, oracle→DeepSeek, cuneiform→markdown — structural parallels?'
    }
  ];

  const convergences = [];

  for (const analysis of analysisPrompts) {
    console.log(`  Analyzing: ${analysis.name}...`);

    // Build domain summary for this analysis
    const domainSummaries = Object.entries(topConcepts).map(([domain, items]) =>
      `**${domain.toUpperCase()}**: ${items.slice(0, 15).map(i => `${i.text} (×${i.count})`).join(', ')}`
    ).join('\n');

    // Top cross-domain concepts
    const crossDomainSummary = crossDomainConcepts.slice(0, 30).map(c =>
      `"${c.concept}" — ${c.domains.join(', ')} (×${c.mentions})`
    ).join('\n');

    try {
      const result = await callDeepSeek([
        {
          role: 'system',
          content: `You are analyzing the internal knowledge architecture of "The Cathedral" — a personal sovereign AI research system built by Paul, a boxing gym owner in Hong Kong who builds AI infrastructure, researches ancient civilisations, studies suppressed physics, coaches boxing, and creates digital products.

The Cathedral contains 7,400+ notes across 14 domains. You are looking for GENUINE cross-domain convergences — places where the same structural pattern, method, or principle appears independently in multiple domains.

Return JSON with "convergences" array. Each convergence has:
- pattern: name of the convergent pattern (Cathedral vocabulary preferred)
- type: one of [structural_isomorphism, method_transfer, unconscious_recurrence, mathematical_echo, architectural_parallel, diagnostic_signature]
- domains: which Cathedral domains share this (array)
- evidence: specific concepts/terms from each domain that converge
- insight: what this convergence reveals about Paul's mind or the Cathedral's architecture
- grade: A (deep structural match across 3+ domains), B (clear parallel in 2+ domains), C (suggestive but uncertain)
- actionable: what Paul could DO with this knowledge (build, connect, investigate)

Be rigorous. "Both mention 'pattern'" is not a convergence. Look for the SAME STRUCTURAL MOVE appearing in different substrates. The best convergences are ones Paul hasn't noticed yet.`
        },
        {
          role: 'user',
          content: `Analysis domain: ${analysis.description}
Hint: ${analysis.hint}

Top concepts by Cathedral domain:
${domainSummaries}

Top cross-domain concepts (appearing in 3+ domains):
${crossDomainSummary}

Find genuine convergences in the "${analysis.name}" domain.`
        }
      ], true);

      const parsed = JSON.parse(result);
      const items = parsed.convergences || parsed;
      if (Array.isArray(items)) {
        for (const item of items) {
          convergences.push({ ...item, analysisDomain: analysis.name });
        }
      }
    } catch (err) {
      console.error(`  Error in ${analysis.name}: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 500));
  }

  return convergences;
}

// ─── Dashboard Generator ───

function generateDashboard(stats, crossDomainConcepts, convergences, domainStats) {
  const gradeA = convergences.filter(c => c.grade === 'A');
  const gradeB = convergences.filter(c => c.grade === 'B');

  // Domain colors
  const COLORS = {
    boxing: '#ef4444', cathedral: '#8b5cf6', agents: '#06b6d4', cosmology: '#3b82f6',
    physics: '#f59e0b', consciousness: '#ec4899', suppression: '#6b7280', business: '#22c55e',
    personal: '#f97316', epistemology: '#a78bfa', mathematics: '#14b8a6', ancient: '#d97706',
    methods: '#6366f1', creative: '#e879f9'
  };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cathedral Rosetta — Internal Convergence Map</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0a0f; color: #e0e0e8; font-family: 'DM Sans', system-ui, sans-serif; }

  .header { padding: 32px 40px 24px; border-bottom: 1px solid #1a1a2e; }
  .header h1 { font-family: 'Bebas Neue', system-ui; font-size: 42px; letter-spacing: 2px; color: #fff; }
  .header .subtitle { color: #8888aa; font-size: 14px; margin-top: 4px; }

  .stats-bar { display: flex; gap: 32px; padding: 20px 40px; background: #0d0d14; border-bottom: 1px solid #1a1a2e; flex-wrap: wrap; }
  .stat { text-align: center; }
  .stat .value { font-size: 28px; font-weight: 700; color: #fff; font-family: 'Share Tech Mono', monospace; }
  .stat .label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; }

  .tabs { display: flex; gap: 0; padding: 0 40px; border-bottom: 1px solid #1a1a2e; background: #0d0d14; }
  .tab { padding: 12px 24px; cursor: pointer; color: #666; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid transparent; transition: all 0.2s; }
  .tab:hover { color: #aaa; }
  .tab.active { color: #8b5cf6; border-bottom-color: #8b5cf6; }

  .content { padding: 32px 40px; max-width: 1400px; }
  .view { display: none; }
  .view.active { display: block; }

  /* Convergence cards */
  .conv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 20px; }
  .conv-card { background: #12121a; border: 1px solid #1a1a2e; border-radius: 12px; padding: 20px; transition: border-color 0.2s; }
  .conv-card:hover { border-color: #333; }
  .conv-card.grade-a { border-left: 3px solid #22c55e; }
  .conv-card.grade-b { border-left: 3px solid #3b82f6; }
  .conv-card.grade-c { border-left: 3px solid #666; }
  .conv-card .pattern { font-size: 16px; font-weight: 600; color: #fff; margin-bottom: 8px; }
  .conv-card .type-badge { display: inline-block; font-size: 10px; padding: 2px 8px; border-radius: 4px; background: #1a1a2e; color: #8888aa; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }
  .conv-card .domains { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
  .conv-card .domain-pill { font-size: 11px; padding: 2px 10px; border-radius: 12px; font-weight: 500; }
  .conv-card .insight { font-size: 13px; color: #aaa; line-height: 1.5; margin-bottom: 10px; }
  .conv-card .actionable { font-size: 12px; color: #8b5cf6; background: rgba(139,92,246,0.1); padding: 8px 12px; border-radius: 6px; line-height: 1.4; }
  .conv-card .evidence { font-size: 12px; color: #888; margin-bottom: 8px; }

  /* Domain map */
  .domain-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
  .domain-card { background: #12121a; border: 1px solid #1a1a2e; border-radius: 10px; padding: 16px; }
  .domain-card .name { font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
  .domain-card .file-count { font-size: 24px; font-weight: 700; color: #fff; font-family: 'Share Tech Mono', monospace; }
  .domain-card .concept-count { font-size: 11px; color: #666; margin-top: 4px; }
  .domain-card .top-concepts { margin-top: 10px; }
  .domain-card .top-concepts span { display: inline-block; font-size: 11px; padding: 1px 6px; margin: 2px; border-radius: 3px; background: #1a1a2e; color: #aaa; }

  /* Cross-domain concepts */
  .cross-table { width: 100%; border-collapse: collapse; }
  .cross-table th { text-align: left; padding: 10px 12px; font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #1a1a2e; }
  .cross-table td { padding: 8px 12px; border-bottom: 1px solid #0d0d14; font-size: 13px; }
  .cross-table tr:hover { background: #12121a; }
  .cross-table .concept-name { color: #fff; font-weight: 500; }
  .cross-table .domain-dots { display: flex; gap: 4px; flex-wrap: wrap; }
  .cross-table .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }

  /* Network visualization */
  .network-container { position: relative; width: 100%; height: 600px; background: #08080c; border-radius: 12px; border: 1px solid #1a1a2e; overflow: hidden; }
  canvas { width: 100%; height: 100%; }

  .grade-legend { display: flex; gap: 20px; margin-bottom: 20px; }
  .grade-legend .item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #888; }
  .grade-legend .dot-a { width: 10px; height: 10px; border-radius: 50%; background: #22c55e; }
  .grade-legend .dot-b { width: 10px; height: 10px; border-radius: 50%; background: #3b82f6; }
  .grade-legend .dot-c { width: 10px; height: 10px; border-radius: 50%; background: #666; }

  .section-title { font-size: 18px; font-weight: 600; color: #fff; margin-bottom: 16px; }
  .section-subtitle { font-size: 13px; color: #666; margin-bottom: 20px; }

  @media (max-width: 768px) {
    .header { padding: 20px; }
    .content { padding: 20px; }
    .conv-grid { grid-template-columns: 1fr; }
    .stats-bar { gap: 16px; padding: 16px 20px; }
  }
</style>
</head>
<body>

<div class="header">
  <h1>CATHEDRAL ROSETTA</h1>
  <div class="subtitle">Internal Convergence Map — ${stats.totalFiles.toLocaleString()} vault files across ${Object.keys(domainStats).length} domains — Generated ${new Date().toISOString().split('T')[0]}</div>
</div>

<div class="stats-bar">
  <div class="stat"><div class="value">${stats.totalFiles.toLocaleString()}</div><div class="label">Vault Files</div></div>
  <div class="stat"><div class="value">${stats.classified.toLocaleString()}</div><div class="label">Classified</div></div>
  <div class="stat"><div class="value">${Object.keys(domainStats).length}</div><div class="label">Domains</div></div>
  <div class="stat"><div class="value">${stats.totalConcepts.toLocaleString()}</div><div class="label">Concepts</div></div>
  <div class="stat"><div class="value">${crossDomainConcepts.length}</div><div class="label">Cross-Domain</div></div>
  <div class="stat"><div class="value">${convergences.length}</div><div class="label">Convergences</div></div>
  <div class="stat"><div class="value grade-a-val" style="color:#22c55e">${gradeA.length}</div><div class="label">Grade A</div></div>
  <div class="stat"><div class="value" style="color:#3b82f6">${gradeB.length}</div><div class="label">Grade B</div></div>
</div>

<div class="tabs">
  <div class="tab active" onclick="showView('convergences')">Convergences</div>
  <div class="tab" onclick="showView('network')">Network</div>
  <div class="tab" onclick="showView('domains')">Domains</div>
  <div class="tab" onclick="showView('crossdomain')">Cross-Domain</div>
</div>

<div class="content">

  <!-- Convergences View -->
  <div class="view active" id="view-convergences">
    <div class="grade-legend">
      <div class="item"><div class="dot-a"></div> Grade A — Deep structural match</div>
      <div class="item"><div class="dot-b"></div> Grade B — Clear parallel</div>
      <div class="item"><div class="dot-c"></div> Grade C — Suggestive</div>
    </div>
    <div class="conv-grid" id="conv-grid"></div>
  </div>

  <!-- Network View -->
  <div class="view" id="view-network">
    <div class="section-title">Convergence Network</div>
    <div class="section-subtitle">Domains connected by shared convergences. Thicker lines = more shared patterns.</div>
    <div class="network-container">
      <canvas id="network-canvas"></canvas>
    </div>
  </div>

  <!-- Domains View -->
  <div class="view" id="view-domains">
    <div class="section-title">Domain Landscape</div>
    <div class="domain-grid" id="domain-grid"></div>
  </div>

  <!-- Cross-Domain View -->
  <div class="view" id="view-crossdomain">
    <div class="section-title">Cross-Domain Concepts</div>
    <div class="section-subtitle">Concepts appearing in 3+ independent domains</div>
    <table class="cross-table" id="cross-table">
      <thead><tr><th>Concept</th><th>Domains</th><th>Mentions</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>

</div>

<script>
const COLORS = ${JSON.stringify(COLORS)};
const convergences = ${JSON.stringify(convergences)};
const crossDomainConcepts = ${JSON.stringify(crossDomainConcepts.slice(0, 100))};
const domainStats = ${JSON.stringify(domainStats)};

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  event.target.classList.add('active');
  if (name === 'network') drawNetwork();
}

// Render convergence cards
function renderConvergences() {
  const grid = document.getElementById('conv-grid');
  // Sort: A first, then B, then C
  const sorted = [...convergences].sort((a, b) => {
    const order = { A: 0, B: 1, C: 2 };
    return (order[a.grade] || 3) - (order[b.grade] || 3);
  });

  grid.innerHTML = sorted.map(c => {
    const domains = (c.domains || []).map(d =>
      \`<span class="domain-pill" style="background:\${COLORS[d] || '#333'}22;color:\${COLORS[d] || '#888'}">\${d}</span>\`
    ).join('');

    const evidence = typeof c.evidence === 'object' && !Array.isArray(c.evidence)
      ? Object.entries(c.evidence).map(([k, v]) => \`\${k}: \${Array.isArray(v) ? v.join(', ') : v}\`).join(' | ')
      : (Array.isArray(c.evidence) ? c.evidence.join(', ') : (c.evidence || ''));

    return \`<div class="conv-card grade-\${(c.grade || 'c').toLowerCase()}">
      <div class="pattern">\${c.pattern || 'Unnamed'}</div>
      <span class="type-badge">\${c.type || c.analysisDomain || ''}</span>
      <div class="domains">\${domains}</div>
      \${evidence ? \`<div class="evidence">\${evidence.slice(0, 200)}</div>\` : ''}
      <div class="insight">\${c.insight || ''}</div>
      \${c.actionable ? \`<div class="actionable">\${c.actionable}</div>\` : ''}
    </div>\`;
  }).join('');
}

// Render domain cards
function renderDomains() {
  const grid = document.getElementById('domain-grid');
  const sorted = Object.entries(domainStats).sort((a, b) => b[1].files - a[1].files);

  grid.innerHTML = sorted.map(([name, data]) => \`
    <div class="domain-card" style="border-top: 3px solid \${COLORS[name] || '#333'}">
      <div class="name" style="color:\${COLORS[name] || '#888'}">\${name}</div>
      <div class="file-count">\${data.files}</div>
      <div class="concept-count">\${data.concepts.toLocaleString()} concepts extracted</div>
      <div class="top-concepts">
        \${(data.topConcepts || []).slice(0, 8).map(c => \`<span>\${c.text} \${c.count > 1 ? '×' + c.count : ''}</span>\`).join('')}
      </div>
    </div>
  \`).join('');
}

// Render cross-domain table
function renderCrossDomain() {
  const tbody = document.querySelector('#cross-table tbody');
  tbody.innerHTML = crossDomainConcepts.map(c => {
    const dots = c.domains.map(d =>
      \`<span class="dot" style="background:\${COLORS[d] || '#666'}" title="\${d}"></span>\`
    ).join('');
    return \`<tr>
      <td class="concept-name">\${c.concept}</td>
      <td><div class="domain-dots">\${dots}</div> <span style="color:#666;font-size:11px">\${c.domains.join(', ')}</span></td>
      <td>\${c.mentions}</td>
    </tr>\`;
  }).join('');
}

// Network visualization
function drawNetwork() {
  const canvas = document.getElementById('network-canvas');
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * 2;
  canvas.height = rect.height * 2;
  ctx.scale(2, 2);
  const W = rect.width, H = rect.height;

  // Build domain connection weights from convergences
  const connections = {};
  const domainSet = new Set();
  for (const c of convergences) {
    const doms = c.domains || [];
    for (let i = 0; i < doms.length; i++) {
      domainSet.add(doms[i]);
      for (let j = i + 1; j < doms.length; j++) {
        const key = [doms[i], doms[j]].sort().join('::');
        const weight = c.grade === 'A' ? 3 : c.grade === 'B' ? 2 : 1;
        connections[key] = (connections[key] || 0) + weight;
      }
    }
  }

  // Layout domains in a circle
  const domains = [...domainSet];
  const cx = W / 2, cy = H / 2, radius = Math.min(W, H) * 0.35;
  const positions = {};
  domains.forEach((d, i) => {
    const angle = (i / domains.length) * Math.PI * 2 - Math.PI / 2;
    positions[d] = { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
  });

  // Draw connections
  const maxWeight = Math.max(...Object.values(connections), 1);
  for (const [key, weight] of Object.entries(connections)) {
    const [d1, d2] = key.split('::');
    if (!positions[d1] || !positions[d2]) continue;
    const alpha = 0.15 + (weight / maxWeight) * 0.5;
    const lineWidth = 1 + (weight / maxWeight) * 4;
    ctx.beginPath();
    ctx.moveTo(positions[d1].x, positions[d1].y);
    ctx.lineTo(positions[d2].x, positions[d2].y);
    ctx.strokeStyle = \`rgba(139, 92, 246, \${alpha})\`;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  // Draw domain nodes
  for (const d of domains) {
    const p = positions[d];
    const stats = domainStats[d];
    const nodeSize = stats ? 8 + Math.sqrt(stats.files) * 1.5 : 10;

    // Glow
    ctx.beginPath();
    ctx.arc(p.x, p.y, nodeSize + 8, 0, Math.PI * 2);
    ctx.fillStyle = (COLORS[d] || '#666') + '22';
    ctx.fill();

    // Node
    ctx.beginPath();
    ctx.arc(p.x, p.y, nodeSize, 0, Math.PI * 2);
    ctx.fillStyle = COLORS[d] || '#666';
    ctx.fill();

    // Label
    ctx.fillStyle = '#e0e0e8';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(d.toUpperCase(), p.x, p.y + nodeSize + 16);
  }
}

// Init
renderConvergences();
renderDomains();
renderCrossDomain();
</script>
</body>
</html>`;

  return html;
}

// ─── Main ───

async function run() {
  console.log('Scanning vault...');
  const { domains, totalFiles, classified } = scanVault();

  const domainStats = {};
  const allDomainConcepts = {};
  let totalConcepts = 0;

  console.log(`\nVault: ${totalFiles} files, ${classified} classified across ${Object.keys(domains).length} domains\n`);

  // Extract concepts per domain
  for (const [domain, files] of Object.entries(domains)) {
    console.log(`  ${domain}: ${files.length} files`);
    const concepts = [];
    for (const file of files) {
      concepts.push(...extractConcepts(file));
    }
    allDomainConcepts[domain] = concepts;
    totalConcepts += concepts.length;
  }

  console.log(`\nTotal concepts extracted: ${totalConcepts.toLocaleString()}`);

  // Build cross-domain index
  console.log('\nBuilding cross-domain index...');
  const index = buildCrossDomainIndex(allDomainConcepts);
  const crossDomainConcepts = findCrossDomainConcepts(index, 3);
  console.log(`  Cross-domain concepts (3+ domains): ${crossDomainConcepts.length}`);

  // Top concepts per domain
  const topConcepts = topConceptsPerDomain(allDomainConcepts);

  // Domain stats for dashboard
  for (const [domain, files] of Object.entries(domains)) {
    domainStats[domain] = {
      files: files.length,
      concepts: allDomainConcepts[domain].length,
      topConcepts: topConcepts[domain] || []
    };
  }

  // Save cross-domain analysis
  writeFileSync(
    join(OUTPUT_DIR, 'cathedral-cross-domain.json'),
    JSON.stringify(crossDomainConcepts.slice(0, 200), null, 2)
  );

  // Semantic convergence detection via DeepSeek
  console.log('\nDetecting internal convergences across 8 analysis domains...');
  const convergences = await detectCathedralConvergences(topConcepts, crossDomainConcepts);
  console.log(`  Convergences found: ${convergences.length}`);

  const grades = {};
  for (const c of convergences) {
    grades[c.grade] = (grades[c.grade] || 0) + 1;
  }
  console.log(`  Grades: ${JSON.stringify(grades)}`);

  // Save convergences
  const stats = { totalFiles, classified, totalConcepts };
  writeFileSync(CONVERGENCE_FILE, JSON.stringify({
    generated: new Date().toISOString(),
    stats,
    domainStats,
    crossDomainCount: crossDomainConcepts.length,
    convergences,
    grades
  }, null, 2));

  // Generate dashboard
  console.log('\nGenerating visual dashboard...');
  const dashboard = generateDashboard(stats, crossDomainConcepts, convergences, domainStats);
  writeFileSync(DASHBOARD_FILE, dashboard);

  // Grade A convergences
  const gradeA = convergences.filter(c => c.grade === 'A');
  const gradeB = convergences.filter(c => c.grade === 'B');

  const report = [
    `*Cathedral Rosetta — Internal Convergence Map*`,
    ``,
    `Files scanned: ${totalFiles.toLocaleString()}`,
    `Domains: ${Object.keys(domains).length}`,
    `Concepts: ${totalConcepts.toLocaleString()}`,
    `Cross-domain: ${crossDomainConcepts.length}`,
    `Convergences: ${convergences.length} (${gradeA.length} Grade A, ${gradeB.length} Grade B)`,
    ``
  ];

  if (gradeA.length > 0) {
    report.push(`*Grade A — Deep Structural Matches:*`);
    for (const c of gradeA.slice(0, 10)) {
      report.push(`• ${c.pattern} [${(c.domains || []).join(', ')}]`);
    }
    report.push('');
  }

  if (gradeB.length > 0) {
    report.push(`*Grade B — Clear Parallels:*`);
    for (const c of gradeB.slice(0, 8)) {
      report.push(`• ${c.pattern} [${(c.domains || []).join(', ')}]`);
    }
  }

  report.push('');
  report.push(`Dashboard: localhost:8080/cathedral-rosetta`);

  const reportText = report.join('\n');
  console.log(`\n${reportText}`);
  await sendTelegram(reportText);

  // Top cross-domain concepts
  console.log('\nTop cross-domain concepts:');
  for (const c of crossDomainConcepts.slice(0, 15)) {
    console.log(`  "${c.concept}" — ${c.domains.join(', ')} (×${c.mentions})`);
  }

  console.log(`\nDashboard: ${DASHBOARD_FILE}`);
  console.log(`Data: ${CONVERGENCE_FILE}`);
}

run().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
