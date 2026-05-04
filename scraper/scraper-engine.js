/**
 * scraper-engine.js — Orchestrator for all scraper targets
 *
 * Triggers Python scrapers, reads outputs, deposits to vault,
 * sends Telegram summaries. Wired into telegram-bot.js.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, 'config.json');
const OUTPUTS_DIR = path.join(__dirname, 'outputs');
const PYTHON = path.join(process.env.HOME, 'cathedral-venv', 'bin', 'python3');

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

/**
 * Run a single scraper target.
 * @param {string} targetName — key from config.targets
 * @returns {Promise<object>} — { success, output, error, duration }
 */
export function runTarget(targetName) {
  const config = loadConfig();
  const target = config.targets[targetName];
  if (!target) return Promise.resolve({ success: false, error: `Unknown target: ${targetName}` });

  const scriptPath = path.join(__dirname, target.script);
  if (!fs.existsSync(scriptPath)) {
    return Promise.resolve({ success: false, error: `Script not found: ${target.script}` });
  }

  return new Promise((resolve) => {
    const start = Date.now();
    let stdout = '';
    let stderr = '';

    const proc = spawn(PYTHON, [scriptPath], {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      timeout: 120000,
    });

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      const duration = Date.now() - start;
      if (code === 0) {
        resolve({ success: true, output: stdout.trim(), duration, target: targetName });
      } else {
        resolve({ success: false, output: stdout.trim(), error: stderr.trim(), duration, target: targetName });
      }
    });

    proc.on('error', (err) => {
      resolve({ success: false, error: err.message, duration: Date.now() - start, target: targetName });
    });
  });
}

/**
 * Run all enabled targets sequentially.
 */
export async function runAll() {
  const config = loadConfig();
  const results = [];

  for (const [name, target] of Object.entries(config.targets)) {
    if (!target.enabled) {
      results.push({ target: name, skipped: true });
      continue;
    }

    console.log(`[scraper] Running ${name}...`);
    const result = await runTarget(name);
    results.push(result);
    console.log(`[scraper] ${name}: ${result.success ? 'OK' : 'FAIL'} (${result.duration}ms)`);

    // Brief pause between targets to avoid rate limiting
    await new Promise(r => setTimeout(r, 2000));
  }

  return results;
}

/**
 * Run a specific group of targets.
 */
export async function runGroup(targetNames) {
  const results = [];
  for (const name of targetNames) {
    const result = await runTarget(name);
    results.push(result);
    await new Promise(r => setTimeout(r, 2000));
  }
  return results;
}

/**
 * Get latest output for a target.
 */
export function getLatestOutput(targetName) {
  const outputMap = {
    hk_sentiment: 'sentiment-latest.json',
    competitor_gyms: 'competitors-latest.json',
    pubmed_science: 'science-latest.json',
    myth_watch: 'myths-latest.json',
    fight_data: 'fight-content-latest.json',
    content_gaps: 'fight-content-latest.json',
    corporate_leads: 'leads-grants-latest.json',
    grants: 'leads-grants-latest.json',
    reviews: 'reviews-sport-latest.json',
    cross_sport: 'reviews-sport-latest.json',
  };

  const filename = outputMap[targetName];
  if (!filename) return null;

  const filepath = path.join(OUTPUTS_DIR, filename);
  if (!fs.existsSync(filepath)) return null;

  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

/**
 * Get summary of all latest scraper data for dashboard.
 */
export function getDashboardData() {
  const config = loadConfig();
  const data = { generated: new Date().toISOString(), targets: {} };

  for (const name of Object.keys(config.targets)) {
    const output = getLatestOutput(name);
    const outputFiles = {
      hk_sentiment: 'sentiment-latest.json',
      competitor_gyms: 'competitors-latest.json',
      pubmed_science: 'science-latest.json',
      myth_watch: 'myths-latest.json',
      fight_data: 'fight-content-latest.json',
      corporate_leads: 'leads-grants-latest.json',
      grants: 'leads-grants-latest.json',
      reviews: 'reviews-sport-latest.json',
      cross_sport: 'reviews-sport-latest.json',
    };

    const filepath = path.join(OUTPUTS_DIR, outputFiles[name] || '');
    const stat = fs.existsSync(filepath) ? fs.statSync(filepath) : null;

    data.targets[name] = {
      enabled: config.targets[name].enabled,
      cron: config.targets[name].cron_hkt,
      lastRun: output?.date || null,
      lastModified: stat?.mtime?.toISOString() || null,
      hasData: !!output,
      summary: summarizeTarget(name, output),
    };
  }

  return data;
}

function summarizeTarget(name, output) {
  if (!output) return 'No data yet';

  switch (name) {
    case 'hk_sentiment':
      return `${output.results?.length || 0} posts found`;
    case 'competitor_gyms':
      return `${output.results?.length || 0} gyms scanned`;
    case 'pubmed_science':
      return `${output.pubmed?.length || 0} papers, ${output.citations?.length || 0} citations`;
    case 'myth_watch':
      return `${output.claims?.length || 0} claims tracked`;
    case 'fight_data':
      return `${output.fights?.length || 0} fights, ${output.videos?.length || 0} videos, ${output.gaps?.length || 0} curriculum gaps`;
    case 'corporate_leads':
      return `${output.leads?.length || 0} leads`;
    case 'grants':
      return `${output.grants?.length || 0} portals scanned`;
    case 'reviews':
      return output.reviews?.rating ? `${output.reviews.rating}/5 (${output.reviews.review_count} reviews)` : 'Pending';
    case 'cross_sport':
      return `${output.cross_sport?.length || 0} papers`;
    default:
      return 'Unknown';
  }
}

/**
 * Format scraper results as Telegram message.
 */
export function formatTelegramSummary(results) {
  let msg = 'Intelligence Agent Report\n\n';

  for (const r of results) {
    if (r.skipped) {
      msg += `⏭ ${r.target}: skipped (disabled)\n`;
    } else if (r.success) {
      const lines = r.output.split('\n').filter(l => l.startsWith('['));
      const summary = lines[lines.length - 1] || r.output.split('\n').pop();
      msg += `✅ ${r.target}: ${summary} (${(r.duration / 1000).toFixed(1)}s)\n`;
    } else {
      msg += `❌ ${r.target}: ${r.error?.slice(0, 100) || 'Unknown error'}\n`;
    }
  }

  return msg;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('scraper-engine.js')) {
  const target = process.argv[2];

  if (target === '--all') {
    console.log('Running all scrapers...');
    const results = await runAll();
    console.log('\n' + formatTelegramSummary(results));
  } else if (target === '--dashboard') {
    console.log(JSON.stringify(getDashboardData(), null, 2));
  } else if (target) {
    const result = await runTarget(target);
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('Usage:');
    console.log('  node scraper-engine.js <target>    — run one target');
    console.log('  node scraper-engine.js --all       — run all enabled');
    console.log('  node scraper-engine.js --dashboard — show dashboard data');
    console.log('\nTargets:', Object.keys(loadConfig().targets).join(', '));
  }
}
