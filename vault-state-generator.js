// ~/nanoclaw/vault-state-generator.js
// Vault State Injector — generates compressed vault state for seed prompt Section 6
// Scans staging subdirectories for research domain counts and researchers
// Reads paul-profile.json for open threads
// Outputs: vault-state-latest.txt (standalone) + appends to seed prompt
//
// Triggers:
//   - Cron daily 06:00 HKT via Timekeeper
//   - /vault-state Telegram command
//   - CLI: node vault-state-generator.js

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const HOME = process.env.HOME;
const STAGING_DIR = join(HOME, 'cathedral-vault', '00_Staging');
const PROFILE_PATH = join(HOME, 'nanoclaw', 'memory', 'patterns', 'paul-profile.json');
const SEED_PROMPT_PATH = join(HOME, 'nanoclaw', 'prompts', 'deepseek-research-seed.txt');
const OUTPUT_PATH = join(HOME, 'nanoclaw', 'prompts', 'vault-state-latest.txt');

// Research domains to scan (skip operational folders)
const SKIP_DIRS = new Set([
  'boxing', 'business', 'cathedral', 'characters', 'creative',
  'csob', 'illustrations', 'muse-findings', 'personal', 'philosophy',
  'relationships', 'scout', 'technology', 'voice-notes'
]);

// ── Scan staging for domain stats ────────────────────────────────────────────

function scanDomains() {
  const domains = {};

  for (const entry of readdirSync(STAGING_DIR)) {
    const full = join(STAGING_DIR, entry);
    if (!statSync(full).isDirectory()) continue;
    if (SKIP_DIRS.has(entry)) continue;

    const files = readdirSync(full).filter(f => extname(f) === '.md');
    if (files.length === 0) continue;

    // Extract researchers from frontmatter
    const researchers = new Set();
    for (const f of files) {
      try {
        const content = readFileSync(join(full, f), 'utf8');
        const fmEnd = content.indexOf('\n---', 3);
        if (!content.startsWith('---') || fmEnd === -1) continue;
        const fm = content.slice(3, fmEnd);
        const match = fm.match(/researchers:\s*\[([^\]]*)\]/);
        if (match) {
          match[1].split(',').forEach(r => {
            const name = r.trim().replace(/['"]/g, '');
            if (name && name.length > 1) researchers.add(name);
          });
        }
      } catch { /* skip unreadable */ }
    }

    domains[entry] = {
      count: files.length,
      researchers: [...researchers].slice(0, 5)
    };
  }

  return domains;
}

// ── Load open threads from paul-profile ──────────────────────────────────────

function loadOpenThreads() {
  try {
    const profile = JSON.parse(readFileSync(PROFILE_PATH, 'utf8'));
    return profile.emergingPatterns?.openThreads || [];
  } catch {
    return [];
  }
}

// ── Coverage grade ───────────────────────────────────────────────────────────

function coverageGrade(count) {
  if (count >= 15) return 'DEEP';
  if (count >= 8) return 'ADEQUATE';
  if (count >= 3) return 'THIN';
  return 'GAP';
}

// ── Generate vault state text ────────────────────────────────────────────────

export function generateVaultState() {
  const domains = scanDomains();
  const openThreads = loadOpenThreads();
  const date = new Date().toISOString().slice(0, 10);
  const totalNuggets = Object.values(domains).reduce((s, d) => s + d.count, 0);

  const sorted = Object.entries(domains).sort((a, b) => b[1].count - a[1].count);

  let lines = [];
  lines.push(`VAULT STATE (auto-generated ${date}, ${totalNuggets} research nuggets)`);
  lines.push('');

  for (const [domain, data] of sorted) {
    const grade = coverageGrade(data.count);
    const researcherStr = data.researchers.length > 0
      ? `. Key: ${data.researchers.join(', ')}`
      : '';
    lines.push(`- ${domain} (${data.count} nuggets, ${grade})${researcherStr}`);
  }

  if (openThreads.length > 0) {
    lines.push('');
    lines.push('OPEN THREADS (from paul-profile):');
    openThreads.forEach(t => lines.push(`- ${t}`));
  }

  return lines.join('\n');
}

// ── Write outputs ────────────────────────────────────────────────────────────

export function writeVaultState() {
  const stateText = generateVaultState();

  // Write standalone file
  writeFileSync(OUTPUT_PATH, stateText);
  console.log(`[vault-state] Written to ${OUTPUT_PATH}`);

  // Update seed prompt — replace existing vault state block or append
  const MARKER_START = '--- VAULT STATE ---';
  const MARKER_END = '--- END VAULT STATE ---';

  let seedPrompt = readFileSync(SEED_PROMPT_PATH, 'utf8');

  const startIdx = seedPrompt.indexOf(MARKER_START);
  const endIdx = seedPrompt.indexOf(MARKER_END);

  const block = `${MARKER_START}\n${stateText}\n${MARKER_END}`;

  if (startIdx !== -1 && endIdx !== -1) {
    // Replace existing block
    seedPrompt = seedPrompt.slice(0, startIdx) + block + seedPrompt.slice(endIdx + MARKER_END.length);
  } else {
    // Append block
    seedPrompt = seedPrompt.trimEnd() + '\n\n' + block + '\n';
  }

  writeFileSync(SEED_PROMPT_PATH, seedPrompt);
  console.log(`[vault-state] Seed prompt updated`);

  return stateText;
}

// ── CLI entrypoint ───────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const stateText = writeVaultState();
  console.log('\n' + stateText);
}
