// Cognitive Bridge — connects Paul's thinking data to Cathedral agent behavior.
// The missing link: data goes in (harvests, profile, belief tracker, taste map)
// → synthesis → Paul Kernel update → agents read updated Kernel → behavior shifts.
//
// PM2 cron: weekly Sunday 05:00 HKT (after vault-promoter at 04:00)
// Also callable: /bridge on Telegram
//
// What it does:
// 1. Reads all cognitive data sources
// 2. Synthesizes into actionable patterns
// 3. Updates Paul Kernel with confirmed patterns
// 4. Reports what changed to Telegram

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const HOME = process.env.HOME || '/Users/basicclaw777';
const VAULT = join(HOME, 'cathedral-vault');
const NANOCLAW = join(HOME, 'nanoclaw');
const MEMORY = join(HOME, '.claude/projects/-Users-basicclaw777/memory');

// ── Data Sources ────────────────────────────────────────────────────────────

function loadCalibrationPasses() {
  const dir = join(VAULT, '00_Staging/cathedral');
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter(f => f.includes('pass3'));
  return files.map(f => {
    try {
      return { file: f, content: readFileSync(join(dir, f), 'utf-8') };
    } catch { return null; }
  }).filter(Boolean);
}

function loadInvestigatorProfile() {
  const path = join(VAULT, '06_Methods/pauls-investigator-profile.md');
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

function loadPaulKernel() {
  const path = join(VAULT, '06_Methods/paul-kernel.md');
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

function loadBehaviourLibrary() {
  const dir = join(VAULT, '06_Methods/behaviour-library');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).map(f => {
    try {
      return { file: f, content: readFileSync(join(dir, f), 'utf-8') };
    } catch { return null; }
  }).filter(Boolean);
}

function loadMemoryFiles() {
  if (!existsSync(MEMORY)) return [];
  return readdirSync(MEMORY).filter(f => f.endsWith('.md')).map(f => {
    try {
      return { file: f, content: readFileSync(join(MEMORY, f), 'utf-8') };
    } catch { return null; }
  }).filter(Boolean);
}

function loadCognitiveSynthesis() {
  const path = join(HOME, 'Cathedral/cognitive-synthesis-2026-05-11.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch { return null; }
}

async function loadBeliefTracker() {
  try {
    const { default: Database } = await import('better-sqlite3');
    const db = new Database(join(NANOCLAW, 'vortex_data/metrics.db'), { readonly: true });
    const rows = db.prepare('SELECT * FROM belief_trajectory ORDER BY rowid DESC LIMIT 50').all();
    db.close();
    return rows;
  } catch { return []; }
}

function loadTasteMap() {
  const path = join(NANOCLAW, 'taste-map.json');
  if (!existsSync(path)) return { anchors: [], rejections: [] };
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch { return { anchors: [], rejections: [] }; }
}

// ── Pattern Extraction ──────────────────────────────────────────────────────

function extractPatternsFromPasses(passes) {
  const patternCounts = {};
  const keywords = {
    'recognition over planning': /recogni[tz]|sees? what.*could|naming before|named.*before.*exist/gi,
    '4-to-8 elevation': /4.to.8|four.to.eight|elevation|upgrade.*specific/gi,
    'intuition-led': /intuit|gut|felt.*right|recognition.*not.*planning/gi,
    'visual thinker': /visual|sees?.*structure|diagram|html.*output/gi,
    'sequential trust': /trust.*architecture|phase.*\d.*without|sequential.*trust/gi,
    'raw material finder': /found.*raw|external.*repo|github.*link|raw.*material/gi,
    'parallel execution': /parallel.*agent|simultaneous|3.*agent|multiple.*terminal/gi,
    'naming instruments': /named.*instrument|named.*before|concept.*before.*build/gi,
    'conversation after build': /cup.*tea|conversation.*after|post.build|real.*output.*conversation/gi,
    'builds by recognizing': /recogni[tz].*not.*plan|sees?.*the.*8|build.*by.*recogni/gi,
    'cross-domain bridging': /cross.domain|bridge|connect.*system.*that.*had.*no/gi,
    'no filler tolerance': /no.*filler|stop.*telling|don.*t.*summarise|terse|brief/gi,
  };

  for (const pass of passes) {
    for (const [pattern, regex] of Object.entries(keywords)) {
      const matches = (pass.content.match(regex) || []).length;
      if (matches > 0) {
        patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
      }
    }
  }

  const confirmed = [];
  const emerging = [];
  for (const [pattern, count] of Object.entries(patternCounts)) {
    if (count >= 3) {
      confirmed.push({ name: pattern, sessions: count });
    } else if (count >= 1) {
      emerging.push({ name: pattern, sessions: count });
    }
  }

  return { confirmed: confirmed.sort((a, b) => b.sessions - a.sessions), emerging };
}

// ── Kernel Delta ────────────────────────────────────────────────────────────

function computeKernelDelta(kernel, confirmedPatterns, synthesis) {
  const missing = [];

  for (const p of confirmedPatterns) {
    const nameNormalized = p.name.toLowerCase().replace(/[^a-z]/g, '');
    if (!kernel.toLowerCase().replace(/[^a-z]/g, '').includes(nameNormalized)) {
      missing.push(p);
    }
  }

  // Check synthesis recommendations if available
  if (synthesis?.recommended_kernel_updates) {
    for (const rec of synthesis.recommended_kernel_updates) {
      if (!kernel.includes(rec.substring(0, 30))) {
        missing.push({ name: 'synthesis', recommendation: rec });
      }
    }
  }

  return missing;
}

// ── Report ──────────────────────────────────────────────────────────────────

function generateReport(passes, patterns, kernelDelta, beliefs, taste, synthesis) {
  const lines = [];
  lines.push('◎ COGNITIVE BRIDGE — Weekly Synthesis');
  lines.push(`Sources: ${passes.length} calibration passes, ${beliefs.length} belief entries, ${taste.anchors?.length || 0} taste anchors`);
  lines.push('');

  lines.push('CONFIRMED PATTERNS (3+ sessions):');
  for (const p of patterns.confirmed) {
    lines.push(`  ${p.name} (${p.sessions} sessions)`);
  }

  if (patterns.emerging.length) {
    lines.push('');
    lines.push('EMERGING (1-2 sessions):');
    for (const p of patterns.emerging) {
      lines.push(`  ${p.name} (${p.sessions})`);
    }
  }

  if (kernelDelta.length) {
    lines.push('');
    lines.push('KERNEL GAPS — patterns confirmed but not in Paul Kernel:');
    for (const d of kernelDelta) {
      lines.push(`  → ${d.name}${d.recommendation ? ': ' + d.recommendation : ''}`);
    }
  }

  if (beliefs.length <= 1) {
    lines.push('');
    lines.push('BELIEF TRACKER: ' + beliefs.length + ' entries. Still underfeeding.');
  }

  const anchorCount = taste.anchors?.length || 0;
  if (anchorCount < 10) {
    lines.push('TASTE MAP: ' + anchorCount + ' anchors. Needs more data.');
  }

  if (synthesis) {
    lines.push('');
    lines.push('SYNTHESIS AVAILABLE: ~/Cathedral/cognitive-synthesis-2026-05-11.json');
    if (synthesis.evolution?.length) {
      lines.push('EVOLUTION DETECTED:');
      for (const e of synthesis.evolution.slice(0, 3)) {
        lines.push(`  ${e.from} → ${e.to}`);
      }
    }
  }

  return lines.join('\n');
}

// ── Main ────────────────────────────────────────────────────────────────────

async function run() {
  console.log('◎ Cognitive Bridge — synthesizing...');

  const passes = loadCalibrationPasses();
  console.log(`  Calibration passes: ${passes.length}`);

  const kernel = loadPaulKernel();
  const synthesis = loadCognitiveSynthesis();
  const taste = loadTasteMap();

  // Extract patterns from passes
  const patterns = extractPatternsFromPasses(passes);
  console.log(`  Confirmed patterns: ${patterns.confirmed.length}`);
  console.log(`  Emerging patterns: ${patterns.emerging.length}`);

  // Compute kernel delta
  const kernelDelta = computeKernelDelta(kernel, patterns.confirmed, synthesis);
  console.log(`  Kernel gaps: ${kernelDelta.length}`);

  // Belief tracker (try to load, don't crash if unavailable)
  let beliefs = [];
  try {
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(join(NANOCLAW, 'vortex_data/metrics.db'), { readonly: true });
    beliefs = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='belief_trajectory'").all().length
      ? db.prepare('SELECT * FROM belief_trajectory ORDER BY rowid DESC LIMIT 50').all()
      : [];
    db.close();
  } catch (e) {
    console.log(`  Belief tracker: ${e.message}`);
  }

  // Generate report
  const report = generateReport(passes, patterns, kernelDelta, beliefs, taste, synthesis);
  console.log('\n' + report);

  // Save report
  const reportPath = join(HOME, 'Cathedral/cognitive-bridge-report.md');
  writeFileSync(reportPath, `# Cognitive Bridge Report — ${new Date().toISOString().slice(0, 10)}\n\n${report}`);
  console.log(`\n  Report saved: ${reportPath}`);

  // Send to Telegram
  try {
    const { config } = await import('dotenv');
    config();
    const token = process.env.TELEGRAM_TOKEN;
    const chatId = process.env.PAUL_CHAT_ID;
    if (token && chatId) {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: report }),
      });
      const j = await res.json();
      console.log(`  Telegram: ${j.ok ? 'sent' : j.description}`);
    }
  } catch (e) {
    console.log(`  Telegram: ${e.message}`);
  }

  console.log('◎ Done.');
}

run().catch(console.error);
