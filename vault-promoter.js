/**
 * vault-promoter.js — Automated vault promotion from 00_Staging to 02_Refined_Gold
 *
 * Scans staging folders, checks grade tags in frontmatter,
 * proposes promotions for A/B grade nuggets.
 * Generates approval report. Moves files on confirmation.
 */

import fs from 'fs';
import path from 'path';

const HOME = process.env.HOME;
const VAULT = path.join(HOME, 'cathedral-vault');
const STAGING = path.join(VAULT, '00_Staging');
const GOLD = path.join(VAULT, '02_Refined_Gold');

/**
 * Parse frontmatter from a markdown file.
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const fm = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const val = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
    fm[key] = val;
  }
  return fm;
}

/**
 * Scan all staging folders for promotable nuggets.
 * @param {object} options — { minGrade: 'B', domains: null (all) or ['boxing', 'philosophy'] }
 * @returns {object[]} Array of { file, domain, grade, title, reason }
 */
export function scanForPromotions(options = {}) {
  const minGrade = (options.minGrade || 'B').toUpperCase();
  const targetDomains = options.domains || null;
  const gradeOrder = ['A', 'B', 'C', 'D', 'F'];
  const minIndex = gradeOrder.indexOf(minGrade);

  if (!fs.existsSync(STAGING)) return [];

  const candidates = [];
  const domains = fs.readdirSync(STAGING, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_'));

  for (const domain of domains) {
    if (targetDomains && !targetDomains.includes(domain.name)) continue;

    const domainPath = path.join(STAGING, domain.name);
    const files = fs.readdirSync(domainPath).filter(f => f.endsWith('.md'));

    for (const file of files) {
      const filePath = path.join(domainPath, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const fm = parseFrontmatter(content);

      const grade = (fm.grade || fm.epistemic_grade || '').toUpperCase().charAt(0);
      const gradeIndex = gradeOrder.indexOf(grade);

      if (gradeIndex === -1 || gradeIndex > minIndex) continue;

      // Check health state if present
      const health = (fm.health_state || fm.health || 'STABLE').toUpperCase();
      if (health === 'WEAKENED' || health === 'ARCHIVED') continue;

      candidates.push({
        file: filePath,
        relativePath: path.relative(VAULT, filePath),
        fileName: file,
        domain: domain.name,
        grade,
        title: fm.title || file.replace('.md', ''),
        health,
        tags: fm.tags || '',
        wordCount: content.split(/\s+/).length,
        reason: `Grade ${grade}${health === 'VITAL' ? ', VITAL health' : ''} — eligible for Gold`,
      });
    }
  }

  // Sort: A before B, VITAL before STABLE, longer before shorter
  candidates.sort((a, b) => {
    if (a.grade !== b.grade) return gradeOrder.indexOf(a.grade) - gradeOrder.indexOf(b.grade);
    if (a.health !== b.health) return a.health === 'VITAL' ? -1 : 1;
    return b.wordCount - a.wordCount;
  });

  return candidates;
}

/**
 * Generate a human-readable promotion report.
 */
export function generateReport(candidates) {
  if (candidates.length === 0) {
    return 'No nuggets eligible for promotion.\n';
  }

  let report = `VAULT PROMOTION REPORT\n`;
  report += `Date: ${new Date().toISOString().slice(0, 10)}\n`;
  report += `Candidates: ${candidates.length}\n`;
  report += `${'='.repeat(60)}\n\n`;

  const byDomain = {};
  for (const c of candidates) {
    if (!byDomain[c.domain]) byDomain[c.domain] = [];
    byDomain[c.domain].push(c);
  }

  for (const [domain, items] of Object.entries(byDomain)) {
    report += `## ${domain} (${items.length} nuggets)\n\n`;
    for (const c of items) {
      report += `  [${c.grade}] ${c.title}\n`;
      report += `      ${c.relativePath}\n`;
      report += `      ${c.wordCount} words | ${c.health} | ${c.reason}\n\n`;
    }
  }

  report += `${'='.repeat(60)}\n`;
  report += `To promote all: node vault-promoter.js --promote\n`;
  report += `To promote one domain: node vault-promoter.js --promote --domain boxing\n`;

  return report;
}

/**
 * Execute promotions — move files from staging to Gold.
 * @param {object[]} candidates — from scanForPromotions()
 * @param {boolean} dryRun — if true, don't actually move files
 * @returns {object} { promoted: [], errors: [] }
 */
export function executePromotions(candidates, dryRun = false) {
  const results = { promoted: [], errors: [], dryRun };

  for (const c of candidates) {
    const targetDomain = path.join(GOLD, c.domain);
    const targetPath = path.join(targetDomain, c.fileName);

    try {
      if (fs.existsSync(targetPath)) {
        results.errors.push({ file: c.fileName, reason: 'Already exists in Gold — manual review needed' });
        continue;
      }

      if (!dryRun) {
        if (!fs.existsSync(targetDomain)) {
          fs.mkdirSync(targetDomain, { recursive: true });
        }

        // Read content, update frontmatter with promotion metadata
        let content = fs.readFileSync(c.file, 'utf8');
        const promotionDate = new Date().toISOString().slice(0, 10);

        if (content.startsWith('---')) {
          // Add promotion metadata to frontmatter
          content = content.replace(
            /^---\n/,
            `---\npromoted_from: ${c.relativePath}\npromoted_date: ${promotionDate}\n`
          );
        }

        fs.writeFileSync(targetPath, content);
        fs.unlinkSync(c.file);
      }

      results.promoted.push({
        file: c.fileName,
        from: c.relativePath,
        to: path.relative(VAULT, targetPath),
        grade: c.grade,
        domain: c.domain,
      });
    } catch (e) {
      results.errors.push({ file: c.fileName, reason: e.message });
    }
  }

  return results;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('vault-promoter.js')) {
  const args = process.argv.slice(2);
  const doPromote = args.includes('--promote');
  const dryRun = args.includes('--dry-run');
  const domainIdx = args.indexOf('--domain');
  const domains = domainIdx !== -1 ? [args[domainIdx + 1]] : null;
  const gradeIdx = args.indexOf('--grade');
  const minGrade = gradeIdx !== -1 ? args[gradeIdx + 1] : 'B';

  const candidates = scanForPromotions({ minGrade, domains });

  if (!doPromote) {
    // Report mode
    console.log(generateReport(candidates));
  } else {
    // Promote mode
    console.log(`Promoting ${candidates.length} nuggets${dryRun ? ' (DRY RUN)' : ''}...`);
    const results = executePromotions(candidates, dryRun);

    for (const p of results.promoted) {
      console.log(`  ${dryRun ? '[DRY] ' : ''}${p.from} -> ${p.to}`);
    }
    for (const e of results.errors) {
      console.log(`  ERROR: ${e.file} — ${e.reason}`);
    }

    console.log(`\nPromoted: ${results.promoted.length} | Errors: ${results.errors.length}`);
  }
}
