/**
 * combo-watcher.js — File watcher for auto-validating combinations
 *
 * Watches ~/nanoclaw/combo-inbox/ for .txt and .csv files.
 * Parses punch sequences, validates them, writes results to combo-results/.
 * Can run standalone or be wired into telegram-bot.js.
 *
 * Input formats:
 *   .txt — one combo per line (space or comma separated punches)
 *   .csv — first column = combo name, remaining columns = punches
 */

import chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';
import { validatePunchCombo, validateDefenseChain, validateIntegratedSequence } from './combination-validator.js';
import { logPunchCombo, logDefenseChain, logIntegratedSequence } from './combo-logger.js';

const INBOX_DIR   = path.join(process.env.HOME, 'nanoclaw', 'combo-inbox');
const RESULTS_DIR = path.join(process.env.HOME, 'nanoclaw', 'combo-results');

// Ensure directories exist
for (const dir of [INBOX_DIR, RESULTS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Parse a combo file into arrays of sequences.
 */
function parseComboFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const content = fs.readFileSync(filePath, 'utf8').trim();
  const combos = [];

  if (ext === '.csv') {
    for (const line of content.split('\n')) {
      if (!line.trim() || line.startsWith('#')) continue;
      const parts = line.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      if (parts.length < 2) continue;
      const name = parts[0];
      const punches = parts.slice(1);
      combos.push({ name, punches });
    }
  } else {
    // .txt — one combo per line
    for (const line of content.split('\n')) {
      if (!line.trim() || line.startsWith('#')) continue;
      const punches = line.trim().split(/[\s,→\-]+/).map(s => s.toLowerCase()).filter(Boolean);
      if (punches.length > 0) {
        combos.push({ name: punches.join('-'), punches });
      }
    }
  }

  return combos;
}

/**
 * Process a combo file: validate all combos, write report.
 */
function processFile(filePath) {
  const fileName = path.basename(filePath);
  const combos = parseComboFile(filePath);

  if (combos.length === 0) return null;

  const results = [];
  let validCount = 0;

  for (const combo of combos) {
    const result = validatePunchCombo(combo.punches);
    try { logPunchCombo(result, 'file-watcher'); } catch {}

    if (result.valid) validCount++;

    results.push({
      name: combo.name,
      punches: combo.punches,
      valid: result.valid,
      weightTrace: result.weightTrace,
      comboType: result.comboType,
      failures: result.transitions
        .filter(t => t.verdict === 'INVALID')
        .map(t => ({ position: t.position, reason: t.reason, suggestion: t.suggestion })),
      suggestions: result.suggestions,
    });
  }

  // Write report
  const report = {
    source: fileName,
    processedAt: new Date().toISOString(),
    summary: {
      total: combos.length,
      valid: validCount,
      invalid: combos.length - validCount,
      passRate: `${((validCount / combos.length) * 100).toFixed(1)}%`,
    },
    results,
  };

  const reportName = `${path.basename(fileName, path.extname(fileName))}_report.json`;
  const reportPath = path.join(RESULTS_DIR, reportName);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Also write a human-readable version
  let readable = `COMBO VALIDATION REPORT\n`;
  readable += `Source: ${fileName}\n`;
  readable += `Date: ${report.processedAt}\n`;
  readable += `Pass rate: ${report.summary.passRate} (${validCount}/${combos.length})\n`;
  readable += `${'='.repeat(60)}\n\n`;

  for (const r of results) {
    const icon = r.valid ? 'VALID' : 'INVALID';
    readable += `[${icon}] ${r.name}\n`;
    readable += `  Punches: ${r.punches.join(' → ')}\n`;
    readable += `  Weight:  ${r.weightTrace.join(' → ')}\n`;
    readable += `  Type:    ${r.comboType}\n`;
    if (r.failures.length > 0) {
      for (const f of r.failures) {
        readable += `  FAIL at #${f.position}: ${f.reason}\n`;
        if (f.suggestion) readable += `    Fix: ${f.suggestion}\n`;
      }
    }
    readable += '\n';
  }

  const readablePath = path.join(RESULTS_DIR, `${path.basename(fileName, path.extname(fileName))}_report.txt`);
  fs.writeFileSync(readablePath, readable);

  return report;
}

/**
 * Start the file watcher. Returns the watcher instance.
 * @param {function} onResult — callback(report) when a file is processed
 */
export function startComboWatcher(onResult) {
  const watcher = chokidar.watch(`${INBOX_DIR}/*.{txt,csv}`, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  });

  watcher.on('add', (filePath) => {
    console.log(`[combo-watcher] New file: ${path.basename(filePath)}`);
    try {
      const report = processFile(filePath);
      if (report && onResult) onResult(report, filePath);
    } catch (e) {
      console.error(`[combo-watcher] Error processing ${filePath}:`, e.message);
    }
  });

  watcher.on('change', (filePath) => {
    console.log(`[combo-watcher] Updated file: ${path.basename(filePath)}`);
    try {
      const report = processFile(filePath);
      if (report && onResult) onResult(report, filePath);
    } catch (e) {
      console.error(`[combo-watcher] Error processing ${filePath}:`, e.message);
    }
  });

  console.log(`[combo-watcher] Watching ${INBOX_DIR}`);
  return watcher;
}

/**
 * Process a single file on demand (no watcher needed).
 */
export { processFile };

// ── CLI ──────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('combo-watcher.js')) {
  const file = process.argv[2];

  if (file) {
    // Process single file
    console.log(`Processing: ${file}`);
    const report = processFile(file);
    if (report) {
      console.log(`\nResults: ${report.summary.valid}/${report.summary.total} valid (${report.summary.passRate})`);
      console.log(`Report: ${RESULTS_DIR}/`);
    }
  } else {
    // Start watcher
    console.log('Starting combo file watcher...');
    startComboWatcher((report) => {
      console.log(`Processed: ${report.source} — ${report.summary.passRate} pass rate`);
    });
  }
}
