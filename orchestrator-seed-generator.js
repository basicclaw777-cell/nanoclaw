// ~/nanoclaw/orchestrator-seed-generator.js
// Orchestrator Seed Generator — assembles context briefing for Head Orchestrator sessions
// Reads: session harvests, operational map, standing instructions, paul-profile, timekeeper alerts
// Output: ~/nanoclaw/prompts/orchestrator-seed-latest.md (<2000 tokens, dense briefing)
//
// Triggers:
//   - /seed Telegram command
//   - Called by Timekeeper at 06:00 HKT daily
//   - CLI: node orchestrator-seed-generator.js

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, basename } from 'path';

const HOME = process.env.HOME;
const STAGING_DIR = join(HOME, 'cathedral-vault', '00_Staging', 'cathedral');
const OP_MAP_PATH = join(HOME, 'cathedral-vault', '06_Methods', 'operational-map.md');
const CLAUDE_MD_PATH = join(HOME, 'nanoclaw', 'CLAUDE.md');
const PROFILE_PATH = join(HOME, 'nanoclaw', 'memory', 'patterns', 'paul-profile.json');
const TIMEKEEPER_STATE = join(HOME, 'Cathedral', 'timekeeper-state.json');
const OUTPUT_PATH = join(HOME, 'nanoclaw', 'prompts', 'orchestrator-seed-latest.md');

// ── Harvest reader ──────────────────────────────────────────────────────────

function getRecentHarvests(count = 3) {
  if (!existsSync(STAGING_DIR)) return [];

  const files = readdirSync(STAGING_DIR)
    .filter(f => f.startsWith('session-harvest-') && f.endsWith('.md'))
    .map(f => ({
      name: f,
      path: join(STAGING_DIR, f),
      mtime: statSync(join(STAGING_DIR, f)).mtimeMs
    }))
    .sort((a, b) => b.mtime - a.mtime);

  // Group by date — take latest pass-set per date, up to count dates
  const seen = new Set();
  const grouped = [];
  for (const f of files) {
    const dateMatch = f.name.match(/session-harvest-(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) continue;
    const date = dateMatch[1];
    if (seen.has(date)) {
      // Add to existing group
      const group = grouped.find(g => g.date === date);
      if (group) group.files.push(f);
      continue;
    }
    if (seen.size >= count) break;
    seen.add(date);
    grouped.push({ date, files: [f] });
  }

  return grouped;
}

function summariseHarvest(group) {
  const lines = [`**${group.date}**`];
  const focusParts = [];

  // Only use pass-1 files (decisions/builds) — skip pass-2 (corrections) and pass-3 (calibration)
  const pass1Files = group.files.filter(f =>
    f.name.includes('pass1') || !f.name.match(/pass[23]/)
  );

  for (const f of pass1Files) {
    try {
      const content = readFileSync(f.path, 'utf8');
      const focusMatch = content.match(/focus:\s*"?([^"\n]+)"?/);
      if (focusMatch) focusParts.push(focusMatch[1]);
    } catch { /* skip */ }
  }

  if (focusParts.length > 0) {
    // Deduplicate and compress
    const unique = [...new Set(focusParts)].slice(0, 2);
    lines.push(unique.join(' · '));
  }

  return lines.join('\n');
}

// ── Operational map reader ──────────────────────────────────────────────────

function getOperationalMap() {
  if (!existsSync(OP_MAP_PATH)) return 'Operational map not found.';

  const content = readFileSync(OP_MAP_PATH, 'utf8');
  const sections = {};
  let current = null;

  for (const line of content.split('\n')) {
    if (/^## (NOW|PLANNED|PARKED)/.test(line)) {
      current = line.replace('## ', '');
      sections[current] = [];
    } else if (/^## /.test(line)) {
      current = null; // skip DONE and other sections
    } else if (current && /^- /.test(line)) {
      // Truncate long lines
      const item = line.slice(2).replace(/\s*—.*$/, '').trim();
      if (item.length > 3) sections[current].push(item);
    }
  }

  const lines = [];
  for (const [zone, items] of Object.entries(sections)) {
    if (items.length === 0) continue;
    lines.push(`**${zone}**`);
    items.slice(0, 6).forEach(i => lines.push(`· ${i}`));
  }

  return lines.join('\n');
}

// ── Standing instructions extractor ─────────────────────────────────────────

function getStandingInstructions() {
  if (!existsSync(CLAUDE_MD_PATH)) return [];

  const content = readFileSync(CLAUDE_MD_PATH, 'utf8');
  const instructions = [];

  // Numbered instructions (1-10 block)
  const numberedBlock = content.match(/### Standing Instructions Added\n([\s\S]*?)(?=\n###|\n##[^#])/);
  if (numberedBlock) {
    numberedBlock[1].split('\n')
      .filter(l => /^\d+\./.test(l))
      .forEach(l => instructions.push(l.trim()));
  }

  // Later numbered instructions (16+)
  const laterMatches = content.matchAll(/^(\d+)\.\s+(.+?)(?:\s*—.+)?$/gm);
  for (const m of laterMatches) {
    const num = parseInt(m[1]);
    if (num >= 16 && !instructions.some(i => i.startsWith(`${num}.`))) {
      instructions.push(m[0].trim());
    }
  }

  // Named standing instructions
  const named = content.matchAll(/### Standing Instruction (\d+)?\s*—?\s*(.+)\n([^\n#]+)/g);
  for (const m of named) {
    const num = m[1] || '';
    const title = m[2].trim();
    if (num && instructions.some(i => i.startsWith(`${num}.`))) continue;
    const prefix = num ? `${num}. ` : '';
    instructions.push(`${prefix}${title}`);
  }

  // Standalone standing instructions (like "No Build Is Complete Without a Trigger")
  const standalone = content.match(/## Standing Instruction — (.+)/g);
  if (standalone) {
    standalone.forEach(s => {
      const title = s.replace('## Standing Instruction — ', '');
      if (!instructions.some(i => i.includes(title))) {
        instructions.push(title);
      }
    });
  }

  return instructions;
}

// ── Open threads from paul-profile ──────────────────────────────────────────

function getOpenThreads() {
  try {
    const profile = JSON.parse(readFileSync(PROFILE_PATH, 'utf8'));
    return profile.emergingPatterns?.openThreads || [];
  } catch {
    return [];
  }
}

// ── Timekeeper alerts (last 24h) ────────────────────────────────────────────

function getRecentAlerts() {
  try {
    const state = JSON.parse(readFileSync(TIMEKEEPER_STATE, 'utf8'));
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const alerts = (state.alerts || []).filter(a => new Date(a.timestamp || a.time) > cutoff);

    if (alerts.length === 0 && state.lastCriticalAlert) {
      const last = new Date(state.lastCriticalAlert);
      if (last > cutoff) {
        return [`Critical alert at ${last.toISOString().slice(0, 16)}`];
      }
    }

    return alerts.map(a => a.message || a.description || JSON.stringify(a)).slice(0, 5);
  } catch {
    return [];
  }
}

// ── Assemble seed ───────────────────────────────────────────────────────────

export function generateSeed() {
  const date = new Date().toISOString().slice(0, 10);
  const time = new Date().toLocaleTimeString('en-HK', { timeZone: 'Asia/Hong_Kong', hour: '2-digit', minute: '2-digit' });
  const lines = [];

  lines.push(`# Cathedral Orchestrator Seed — ${date} ${time} HKT`);
  lines.push('');

  // Recent sessions
  lines.push('## Recent Sessions');
  const harvests = getRecentHarvests(3);
  if (harvests.length === 0) {
    lines.push('No session harvests found.');
  } else {
    harvests.forEach(g => lines.push(summariseHarvest(g)));
  }
  lines.push('');

  // Operational map (NOW/PLANNED/PARKED only — DONE is noise)
  lines.push('## Operational State');
  lines.push(getOperationalMap());
  lines.push('');

  // Standing instructions (compressed)
  lines.push('## Standing Instructions');
  const instructions = getStandingInstructions();
  instructions.forEach(i => lines.push(i));
  lines.push('');

  // Open threads
  const threads = getOpenThreads();
  if (threads.length > 0) {
    lines.push('## Open Threads');
    threads.slice(0, 8).forEach(t => lines.push(`· ${t}`));
    lines.push('');
  }

  // Alerts
  const alerts = getRecentAlerts();
  if (alerts.length > 0) {
    lines.push('## Alerts (24h)');
    alerts.forEach(a => lines.push(`⚠ ${a}`));
    lines.push('');
  }

  lines.push('---');
  lines.push('*Paste this into your Head Orchestrator chat as the first message.*');

  return lines.join('\n');
}

// ── Write output ────────────────────────────────────────────────────────────

export function writeSeed() {
  const seed = generateSeed();
  writeFileSync(OUTPUT_PATH, seed);
  console.log(`[orchestrator-seed] Written to ${OUTPUT_PATH}`);
  return seed;
}

// ── CLI entrypoint ──────────────────────────────────────────────────────────

const isMain = process.argv[1] && process.argv[1].endsWith('orchestrator-seed-generator.js');
if (isMain) {
  const seed = writeSeed();
  console.log('\n' + seed);
}
