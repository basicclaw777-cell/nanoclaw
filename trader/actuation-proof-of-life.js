/**
 * actuation-proof-of-life.js — The verifier that can't be the builder
 *
 * For each wired system, checks:
 *   1. Does the intermediary file/column exist?
 *   2. Was it modified within expected frequency?
 *   3. Is the data non-empty / structurally valid?
 *
 * GREEN = loop alive. RED = loop broken or stale.
 * Surfaces via Telegram so Paul sees it without asking Forge.
 *
 * ESM. Run weekly via PM2 or manually: node actuation-proof-of-life.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const CHECKS = [
  {
    id: 'orchestrator-weights',
    name: '#11 Orchestrator Weight Persistence',
    type: 'json-file',
    path: path.join(__dirname, 'feedback-weights.json'),
    maxAgeHours: 24,
    validate: (data) => data.weights && Object.keys(data.weights).length > 0 && data.saved_at,
  },
  {
    id: 'genome-inheritance',
    name: '#10 Genome Inheritance',
    type: 'db-query',
    dbPath: path.join(__dirname, 'logs', 'trades.db'),
    query: `SELECT COUNT(*) as count FROM genome_archive`,
    check: (row) => row.count > 0,
    note: 'Genomes exist in archive',
  },
  {
    id: 'genome-inheritance-wired',
    name: '#10 getInheritedBias() Import',
    type: 'grep',
    file: path.join(__dirname, 'trading-orchestrator.js'),
    pattern: 'getInheritedBias',
    note: 'Import still present in orchestrator',
  },
  {
    id: 'elimination-wired',
    name: '#10b isEliminated() Consumed',
    type: 'grep',
    file: path.join(__dirname, 'trading-orchestrator.js'),
    pattern: 'isEliminated',
    note: 'Elimination check still in processSignal',
  },
];

function checkJsonFile(check) {
  const result = { id: check.id, name: check.name, status: 'RED', detail: '' };

  if (!fs.existsSync(check.path)) {
    result.detail = 'File does not exist (loop has not fired yet or was reset)';
    return result;
  }

  try {
    const stat = fs.statSync(check.path);
    const ageHours = (Date.now() - stat.mtimeMs) / 3600000;

    if (ageHours > check.maxAgeHours) {
      result.status = 'YELLOW';
      result.detail = `File exists but stale (${ageHours.toFixed(1)}h old, max ${check.maxAgeHours}h)`;
      return result;
    }

    const data = JSON.parse(fs.readFileSync(check.path, 'utf8'));
    if (check.validate && !check.validate(data)) {
      result.status = 'YELLOW';
      result.detail = 'File exists and fresh but data validation failed';
      return result;
    }

    result.status = 'GREEN';
    result.detail = `Alive — last updated ${ageHours.toFixed(1)}h ago`;
    if (data.saved_at) result.detail += ` (${data.saved_at})`;
  } catch (e) {
    result.detail = `Error reading: ${e.message}`;
  }

  return result;
}

function checkDbQuery(check) {
  const result = { id: check.id, name: check.name, status: 'RED', detail: '' };

  if (!fs.existsSync(check.dbPath)) {
    result.detail = 'Database file not found';
    return result;
  }

  try {
    const db = new Database(check.dbPath, { readonly: true });
    const row = db.prepare(check.query).get();
    db.close();

    if (check.check(row)) {
      result.status = 'GREEN';
      result.detail = `${check.note} (${JSON.stringify(row)})`;
    } else {
      result.detail = `Query returned but check failed: ${JSON.stringify(row)}`;
    }
  } catch (e) {
    result.detail = `DB error: ${e.message}`;
  }

  return result;
}

function checkGrep(check) {
  const result = { id: check.id, name: check.name, status: 'RED', detail: '' };

  if (!fs.existsSync(check.file)) {
    result.detail = `File not found: ${check.file}`;
    return result;
  }

  try {
    const content = fs.readFileSync(check.file, 'utf8');
    if (content.includes(check.pattern)) {
      result.status = 'GREEN';
      result.detail = check.note;
    } else {
      result.detail = `Pattern "${check.pattern}" not found — wire was removed`;
    }
  } catch (e) {
    result.detail = `Read error: ${e.message}`;
  }

  return result;
}

function runAllChecks() {
  const results = [];

  for (const check of CHECKS) {
    switch (check.type) {
      case 'json-file':
        results.push(checkJsonFile(check));
        break;
      case 'db-query':
        results.push(checkDbQuery(check));
        break;
      case 'grep':
        results.push(checkGrep(check));
        break;
    }
  }

  return results;
}

function formatReport(results) {
  const icons = { GREEN: '🟢', YELLOW: '🟡', RED: '🔴' };
  const lines = ['⚡ ACTUATION PROOF OF LIFE', ''];

  const greens = results.filter(r => r.status === 'GREEN').length;
  const total = results.length;
  lines.push(`${greens}/${total} loops alive\n`);

  for (const r of results) {
    lines.push(`${icons[r.status]} ${r.name}`);
    lines.push(`   ${r.detail}`);
  }

  const reds = results.filter(r => r.status === 'RED');
  if (reds.length > 0) {
    lines.push('\n⚠️ BROKEN LOOPS:');
    for (const r of reds) {
      lines.push(`  ${r.name}: ${r.detail}`);
    }
  }

  lines.push(`\n📅 ${new Date().toISOString()}`);
  return lines.join('\n');
}

async function sendTelegram(message) {
  const token = process.env.TELEGRAM_TOKEN;
  const chatId = process.env.PAUL_CHAT_ID;
  if (!token || !chatId) {
    console.log('[proof-of-life] No Telegram creds — printing only');
    return;
  }

  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
    });
    if (!resp.ok) console.error('[proof-of-life] Telegram error:', await resp.text());
  } catch (e) {
    console.error('[proof-of-life] Telegram failed:', e.message);
  }
}

// ── Learning Digest: what changed and what it means ──

const WEIGHTS_PATH = path.join(__dirname, 'feedback-weights.json');
const WEIGHTS_SNAPSHOT_PATH = path.join(__dirname, 'feedback-weights-previous.json');
const CONFIG_PATH = path.join(__dirname, 'config.json');

function generateLearningDigest() {
  const lines = ['\n📊 LEARNING DIGEST — What the system changed\n'];

  if (!fs.existsSync(WEIGHTS_PATH)) {
    lines.push('  No weights file yet — first cycle hasn\'t run.');
    return lines.join('\n');
  }

  const current = JSON.parse(fs.readFileSync(WEIGHTS_PATH, 'utf8'));
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const factory = config.strategy_weights || {};

  let previous = null;
  if (fs.existsSync(WEIGHTS_SNAPSHOT_PATH)) {
    try { previous = JSON.parse(fs.readFileSync(WEIGHTS_SNAPSHOT_PATH, 'utf8')); } catch {}
  }

  const baseline = previous ? previous.weights : factory;
  const changes = [];

  for (const [strategy, weight] of Object.entries(current.weights)) {
    const base = baseline[strategy] || factory[strategy] || 1.0;
    const diff = weight - base;
    if (Math.abs(diff) < 0.01) continue;

    const pct = ((diff / base) * 100).toFixed(0);
    const direction = diff > 0 ? '↑' : '↓';
    const meaning = explainChange(strategy, base, weight, diff);

    changes.push({ strategy, base, weight, diff, pct, direction, meaning });
  }

  if (changes.length === 0) {
    lines.push('  No weight changes since last check. System is steady.');
  } else {
    for (const c of changes) {
      lines.push(`  ${c.direction} ${c.strategy}: ${c.base} → ${c.weight} (${c.pct > 0 ? '+' : ''}${c.pct}%)`);
      lines.push(`     → ${c.meaning}`);
    }
  }

  // Genome inheritance check
  try {
    const db = new Database(path.join(__dirname, 'logs', 'trades.db'), { readonly: true });
    const genomes = db.prepare('SELECT strategy, genome FROM genome_archive ORDER BY id DESC LIMIT 5').all();
    db.close();
    if (genomes.length > 0) {
      lines.push(`\n  🧬 ${genomes.length} dead strategy genome(s) feeding the living:`);
      for (const g of genomes) {
        const data = JSON.parse(g.genome);
        const assets = data.bestAssets?.map(a => a.asset).join(', ') || 'none';
        lines.push(`     ${g.strategy}: bias=${data.directionBias}, strong assets=${assets}`);
        lines.push(`     → Dead strategy's wins now boost living strategies on ${assets}`);
      }
    }
  } catch {}

  // Snapshot current weights for next diff
  fs.writeFileSync(WEIGHTS_SNAPSHOT_PATH, JSON.stringify(current, null, 2));

  lines.push(`\n  Last learning cycle: ${current.saved_at}`);
  return lines.join('\n');
}

function explainChange(strategy, base, weight, diff) {
  if (diff > 0.5) return `Strong winner. System is trusting this strategy more — it will get bigger positions.`;
  if (diff > 0.1) return `Performing above average. Getting slightly more trust and larger position sizes.`;
  if (diff > 0) return `Small improvement. System is gently favouring this strategy.`;
  if (diff < -0.4) return `Heavy losses. System is cutting this strategy's position sizes in half — limiting damage.`;
  if (diff < -0.1) return `Underperforming. Getting less trust, smaller positions. Proving ground.`;
  return `Slight pullback. System is being cautious with this strategy.`;
}

// ── Main ──
const results = runAllChecks();
const report = formatReport(results);
const digest = generateLearningDigest();

console.log(report);
console.log(digest);

const fullReport = report + '\n' + digest;
const hasRed = results.some(r => r.status === 'RED');
const hasYellow = results.some(r => r.status === 'YELLOW');

if (hasRed || hasYellow || process.argv.includes('--force')) {
  await sendTelegram(fullReport);
}
