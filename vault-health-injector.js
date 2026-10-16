// vault-health-injector.js — Living Knowledge Graph frontmatter health injection
// Scans vault .md files, calculates health state, injects into YAML frontmatter
// ESM — .js in nanoclaw = ESM always
//
// CLI: node vault-health-injector.js [--dry]
//   --dry = report only, don't write files

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'fs';
import { join, basename, dirname, relative, extname } from 'path';

const HOME = process.env.HOME;
const VAULT = join(HOME, 'cathedral-vault');
const SCAN_DIRS = [
  join(VAULT, '00_Staging'),
  join(VAULT, '02_Refined_Gold'),
];
const STATS_OUTPUT = join(HOME, 'nanoclaw', 'study-lab-output', 'vault-health-stats.json');
const DRY = process.argv.includes('--dry');
const NOW = Date.now();
const DAY_MS = 86400 * 1000;

// ── Collect all .md files recursively ──────────────────────────────────────────

function walkDir(dir) {
  const results = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // skip hidden dirs and .obsidian
      if (entry.name.startsWith('.')) continue;
      results.push(...walkDir(full));
    } else if (entry.name.endsWith('.md') && !entry.name.startsWith('.')) {
      results.push(full);
    }
  }
  return results;
}

// ── YAML frontmatter parser/writer ─────────────────────────────────────────────

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { fields: {}, body: content, hasFrontmatter: false };

  const yamlBlock = match[1];
  const body = content.slice(match[0].length);
  const fields = {};
  let currentKey = null;
  let inArray = false;

  for (const line of yamlBlock.split('\n')) {
    // Array continuation (  - value)
    if (inArray && /^\s+-\s+/.test(line)) {
      const val = line.replace(/^\s+-\s+/, '').trim();
      if (Array.isArray(fields[currentKey])) {
        fields[currentKey].push(val);
      }
      continue;
    }

    // Key: value
    const kvMatch = line.match(/^(\w[\w-]*)\s*:\s*(.*)/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      let val = kvMatch[2].trim();
      currentKey = key;
      inArray = false;

      if (val === '') {
        // Could be start of array block
        inArray = true;
        fields[key] = [];
      } else if (val.startsWith('[') && val.endsWith(']')) {
        // Inline array [a, b, c]
        fields[key] = val.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
      } else {
        // Strip quotes
        fields[key] = val.replace(/^['"]|['"]$/g, '');
      }
    }
  }

  return { fields, body, hasFrontmatter: true, rawYaml: yamlBlock };
}

function serializeFields(fields) {
  const lines = [];
  for (const [key, val] of Object.entries(fields)) {
    if (Array.isArray(val)) {
      if (val.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of val) {
          lines.push(`  - ${item}`);
        }
      }
    } else if (val === null || val === undefined || val === '') {
      lines.push(`${key}: ''`);
    } else {
      // Quote strings that contain special YAML chars
      const sv = String(val);
      if (/[:#\[\]{}>|&!%@`,]/.test(sv) || sv.startsWith("'") || sv.startsWith('"')) {
        lines.push(`${key}: '${sv.replace(/'/g, "''")}'`);
      } else {
        lines.push(`${key}: ${sv}`);
      }
    }
  }
  return lines.join('\n');
}

function writeFrontmatter(content, fields) {
  const yaml = serializeFields(fields);
  const { body, hasFrontmatter } = parseFrontmatter(content);
  if (hasFrontmatter) {
    // Replace existing frontmatter
    return `---\n${yaml}\n---${body}`;
  } else {
    // Prepend new frontmatter
    return `---\n${yaml}\n---\n\n${content}`;
  }
}

// ── Wikilink scanning ──────────────────────────────────────────────────────────

function extractWikilinks(content) {
  const links = [];
  const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    links.push(m[1].trim());
  }
  return links;
}

// ── Domain extraction ──────────────────────────────────────────────────────────

function getDomain(filePath) {
  const rel = relative(VAULT, filePath);
  const parts = rel.split('/');
  // Domain = second-level directory (after 00_Staging/ or 02_Refined_Gold/)
  if (parts.length >= 2) {
    return parts[1];
  }
  return parts[0];
}

function getSection(filePath) {
  const rel = relative(VAULT, filePath);
  const parts = rel.split('/');
  return parts[0]; // 00_Staging or 02_Refined_Gold
}

// ── Main scan ──────────────────────────────────────────────────────────────────

function runScan() {
  console.log('=== Vault Health Injector ===');
  console.log(`Mode: ${DRY ? 'DRY RUN (no writes)' : 'LIVE (will update files)'}`);
  console.log(`Scanning: ${SCAN_DIRS.join(', ')}\n`);

  // Phase 1: Collect all files
  const allFiles = [];
  for (const dir of SCAN_DIRS) {
    allFiles.push(...walkDir(dir));
  }
  console.log(`Found ${allFiles.length} .md files\n`);

  // Phase 2: Build wikilink index (who links to whom)
  // Map: filename (without .md, lowercased) -> { linkers: [{ path, mtime }] }
  const linkIndex = {};  // target filename -> [{ sourcePath, sourceMtime }]
  const filesByName = {}; // filename (no ext, lower) -> full path

  for (const fp of allFiles) {
    const name = basename(fp, '.md').toLowerCase();
    filesByName[name] = fp;
  }

  for (const fp of allFiles) {
    let content;
    try {
      content = readFileSync(fp, 'utf8');
    } catch { continue; }

    const links = extractWikilinks(content);
    const mtime = statSync(fp).mtimeMs;

    for (const linkTarget of links) {
      const targetKey = linkTarget.toLowerCase();
      if (!linkIndex[targetKey]) linkIndex[targetKey] = [];
      linkIndex[targetKey].push({ sourcePath: fp, sourceMtime: mtime });
    }
  }

  // Phase 3: Calculate health for each file
  const results = [];
  const domainStats = {};
  const healthCounts = { VITAL: 0, STABLE: 0, AGING: 0, WEAKENED: 0 };

  for (const fp of allFiles) {
    let content;
    try {
      content = readFileSync(fp, 'utf8');
    } catch { continue; }

    const { fields } = parseFrontmatter(content);
    const name = basename(fp, '.md').toLowerCase();
    const domain = getDomain(fp);
    const section = getSection(fp);
    const mtime = statSync(fp).mtimeMs;

    // Connections: count of inbound wikilinks
    const inbound = linkIndex[name] || [];
    const connections = inbound.length;

    // Last referenced: most recent mtime among files that link to this one
    let lastReferenced = null;
    if (inbound.length > 0) {
      const maxMtime = Math.max(...inbound.map(l => l.sourceMtime));
      lastReferenced = new Date(maxMtime).toISOString().split('T')[0];
    }

    // Grade: keep existing, don't assign new
    const grade = fields.grade || '';

    // Health calculation
    let health = 'STABLE';

    // For "last referenced" age: use inbound link dates
    // For "file age" (how old the nugget itself is): use frontmatter date > created > mtime
    const fileDate = fields.date || fields.created || null;
    const fileAgeMs = fileDate
      ? (NOW - new Date(fileDate).getTime())
      : (NOW - mtime);
    const fileAgeDays = fileAgeMs / DAY_MS;

    const daysSinceRef = lastReferenced
      ? (NOW - new Date(lastReferenced).getTime()) / DAY_MS
      : fileAgeDays; // no references: use file age

    const isGradeAB = grade === 'A' || grade === 'B' || grade === 'A-' || grade === 'B+';

    if (daysSinceRef <= 90 && isGradeAB) {
      health = 'VITAL';
    } else if (connections === 0 && fileAgeDays > 180) {
      // Isolated AND old = AGING
      health = 'AGING';
    } else if (daysSinceRef > 180) {
      health = 'AGING';
    } else {
      health = 'STABLE';
    }
    // WEAKENED: check if any vault file explicitly contradicts this one
    // We look for [WEAKENED] or "contradicts" in linking files — lightweight heuristic
    for (const link of inbound) {
      try {
        const linkerContent = readFileSync(link.sourcePath, 'utf8');
        if (/contradict|weakened|refuted|superseded/i.test(linkerContent)) {
          // Only if the contradiction references this file specifically
          const thisName = basename(fp, '.md');
          if (linkerContent.includes(thisName)) {
            health = 'WEAKENED';
            break;
          }
        }
      } catch { /* skip unreadable */ }
    }

    // Update frontmatter fields
    fields.health = health;
    fields.connections = String(connections);
    if (lastReferenced) fields.lastReferenced = lastReferenced;
    if (grade) fields.grade = grade;

    // Write back
    if (!DRY) {
      const updated = writeFrontmatter(content, fields);
      writeFileSync(fp, updated, 'utf8');
    }

    // Track stats
    healthCounts[health]++;
    if (!domainStats[domain]) {
      domainStats[domain] = {
        domain,
        section,
        total: 0,
        vital: 0,
        stable: 0,
        aging: 0,
        weakened: 0,
        totalConnections: 0,
        files: [],
      };
    }
    const ds = domainStats[domain];
    ds.total++;
    ds[health.toLowerCase()]++;
    ds.totalConnections += connections;
    ds.files.push({ path: fp, health, connections, grade, lastReferenced });

    results.push({ path: fp, domain, health, connections, grade, lastReferenced });
  }

  // Phase 4: Summary
  const total = results.length;
  const mostConnected = [...results].sort((a, b) => b.connections - a.connections).slice(0, 10);
  const mostIsolated = results.filter(r => r.connections === 0).length;

  console.log('--- SUMMARY ---');
  console.log(`Total scanned: ${total}`);
  console.log(`VITAL:    ${healthCounts.VITAL}`);
  console.log(`STABLE:   ${healthCounts.STABLE}`);
  console.log(`AGING:    ${healthCounts.AGING}`);
  console.log(`WEAKENED: ${healthCounts.WEAKENED}`);
  console.log(`Isolated (0 connections): ${mostIsolated}`);
  console.log('');
  console.log('Most connected:');
  for (const f of mostConnected) {
    const short = relative(VAULT, f.path);
    console.log(`  ${f.connections} links <- ${short} [${f.health}]`);
  }

  // Phase 5: Write stats JSON for dashboard
  const statsDir = dirname(STATS_OUTPUT);
  if (!existsSync(statsDir)) mkdirSync(statsDir, { recursive: true });

  const domainArray = Object.values(domainStats).map(d => ({
    domain: d.domain,
    section: d.section,
    total: d.total,
    vital: d.vital,
    stable: d.stable,
    aging: d.aging,
    weakened: d.weakened,
    avgConnections: d.total > 0 ? +(d.totalConnections / d.total).toFixed(1) : 0,
    pctVital: d.total > 0 ? +((d.vital / d.total) * 100).toFixed(1) : 0,
    pctAging: d.total > 0 ? +((d.aging / d.total) * 100).toFixed(1) : 0,
  }));

  const stats = {
    generated: new Date().toISOString(),
    total,
    healthCounts,
    isolated: mostIsolated,
    mostConnected: mostConnected.map(f => ({
      file: relative(VAULT, f.path),
      connections: f.connections,
      health: f.health,
      grade: f.grade,
    })),
    domains: domainArray.sort((a, b) => b.total - a.total),
  };

  writeFileSync(STATS_OUTPUT, JSON.stringify(stats, null, 2), 'utf8');
  console.log(`\nStats written to: ${STATS_OUTPUT}`);

  return stats;
}

// ── CLI entry ──────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  runScan();
}

export { runScan };
