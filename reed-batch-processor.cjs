#!/usr/bin/env node
'use strict';
/**
 * Reed Batch Processor — sequential prompt-to-image pipeline
 * Reads a JSON batch file, runs each prompt through Higgsfield CLI, downloads results.
 *
 * Usage:
 *   node reed-batch-processor.cjs --batch-file ~/basic-reflex/aether-universe/batch-queue-books-3-5-8.json
 *   node reed-batch-processor.cjs --batch-file batch.json --telegram
 *   node reed-batch-processor.cjs --batch-file batch.json --dry-run
 *   node reed-batch-processor.cjs --batch-file batch.json --model-override flux_2 --delay 10
 *
 * Batch JSON format: array of items, each with:
 *   { id, prompt, model?, outputDir, aspectRatio?, resolution?, tags? }
 *
 * Flags:
 *   --batch-file <path>       Required. Path to the JSON batch file.
 *   --dry-run                 Print what would be generated without calling Higgsfield.
 *   --telegram                Send each result to Telegram (Paul's chat).
 *   --model-override <model>  Force all items through one model.
 *   --delay <seconds>         Seconds between generations (default 5).
 *   --manual                  Treat as human-triggered (bypass generation guard pause).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

// Generation guard — global kill-switch
const genGuard = require('./lib/generation-guard.cjs');

// Load .env manually (no external deps — just parse KEY=VALUE lines)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envLines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of envLines) {
    const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.PAUL_CHAT_ID || '1912121485';

// ── Arg parsing ──────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    batchFile: null,
    dryRun: false,
    telegram: false,
    modelOverride: null,
    delay: 5,
    manual: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--batch-file' && argv[i + 1])    args.batchFile = argv[++i];
    else if (a === '--dry-run')                  args.dryRun = true;
    else if (a === '--telegram')                 args.telegram = true;
    else if (a === '--manual')                   args.manual = true;
    else if (a === '--model-override' && argv[i + 1]) args.modelOverride = argv[++i];
    else if (a === '--delay' && argv[i + 1])     args.delay = parseInt(argv[++i], 10) || 5;
  }

  return args;
}

// ── Helpers ──────────────────────────────────────────────────────

function expandHome(p) {
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

function ensureDir(dir) {
  const resolved = expandHome(dir);
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  }
  return resolved;
}

function cleanFilename(id, model) {
  // Strip anything that isn't alphanumeric, dash, or underscore
  const clean = (s) => s.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${clean(id)}-${clean(model)}.png`;
}

function sleep(seconds) {
  if (seconds <= 0) return;
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    // busy-wait is fine for a short delay between generations
  }
}

function sendTelegramPhoto(filePath, caption) {
  if (!TELEGRAM_TOKEN) {
    console.log('  [telegram] No TELEGRAM_TOKEN — skipping');
    return false;
  }
  try {
    execFileSync('curl', ['-s', '-X', 'POST',
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`,
      '-F', `chat_id=${CHAT_ID}`,
      '-F', `photo=@${filePath}`,
      '-F', `caption=${caption.slice(0, 1024)}`
    ], { stdio: 'pipe', timeout: 60000 });
    console.log(`  [telegram] Sent photo`);
    return true;
  } catch (_e) {
    // Fallback to sendDocument for large files
    try {
      execFileSync('curl', ['-s', '-X', 'POST',
        `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendDocument`,
        '-F', `chat_id=${CHAT_ID}`,
        '-F', `document=@${filePath}`,
        '-F', `caption=${caption.slice(0, 1024)}`
      ], { stdio: 'pipe', timeout: 60000 });
      console.log(`  [telegram] Sent as document`);
      return true;
    } catch (e2) {
      console.log(`  [telegram] Failed: ${e2.message}`);
      return false;
    }
  }
}

// ── Batch log ────────────────────────────────────────────────────

function appendBatchLog(outputDir, entry) {
  const logPath = path.join(outputDir, 'batch-log.json');
  let log = [];
  if (fs.existsSync(logPath)) {
    try {
      log = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
    } catch (_e) {
      log = [];
    }
  }
  log.push(entry);
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2), 'utf-8');
}

// ── Core: generate one item ──────────────────────────────────────

function generateItem(item, opts) {
  const model = opts.modelOverride || item.model || 'nano_banana_2';
  const aspectRatio = item.aspectRatio || '9:16';
  const resolution = item.resolution || '2k';
  const outputDir = ensureDir(item.outputDir);
  const filename = cleanFilename(item.id, model);
  const outFile = path.join(outputDir, filename);

  // Check generation guard
  if (genGuard.isPaused() && !opts.manual) {
    return { status: 'skipped', reason: 'generation paused', file: null };
  }

  // Build higgsfield args
  const hfArgs = [
    'generate', 'create', model,
    '--prompt', item.prompt,
    '--aspect_ratio', aspectRatio,
    '--resolution', resolution,
    '--wait'
  ];

  try {
    const result = execFileSync('higgsfield', hfArgs, {
      encoding: 'utf-8',
      timeout: 600000  // 10 min per generation
    }).trim();

    // The CLI returns a URL on success
    if (!result.startsWith('http')) {
      return { status: 'failed', reason: `Unexpected output: ${result.slice(0, 200)}`, file: null };
    }

    // Download the image
    execFileSync('curl', ['-sL', result, '-o', outFile], { timeout: 120000 });

    if (!fs.existsSync(outFile)) {
      return { status: 'failed', reason: 'Download produced no file', file: null };
    }

    const stats = fs.statSync(outFile);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1);

    // Send to Telegram if requested
    if (opts.telegram) {
      const tags = (item.tags || []).join(', ');
      const caption = `Reed Batch: ${item.id}\nModel: ${model}\nTags: ${tags}`;
      sendTelegramPhoto(outFile, caption);
    }

    return { status: 'succeeded', file: outFile, sizeMB, url: result };
  } catch (e) {
    return { status: 'failed', reason: e.message.slice(0, 300), file: null };
  }
}

// ── Main ─────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.batchFile) {
    console.log('Reed Batch Processor');
    console.log('');
    console.log('Usage:');
    console.log('  node reed-batch-processor.cjs --batch-file <path.json> [options]');
    console.log('');
    console.log('Options:');
    console.log('  --dry-run                Print what would be generated');
    console.log('  --telegram               Send results to Telegram');
    console.log('  --model-override <model> Force all items through one model');
    console.log('  --delay <seconds>        Delay between generations (default 5)');
    console.log('  --manual                 Bypass generation guard pause');
    console.log('');
    console.log('Batch JSON format: [{ id, prompt, model?, outputDir, aspectRatio?, resolution?, tags? }, ...]');
    process.exit(1);
  }

  // Load batch file
  const batchPath = expandHome(args.batchFile);
  if (!fs.existsSync(batchPath)) {
    console.error(`Batch file not found: ${batchPath}`);
    process.exit(1);
  }

  let items;
  try {
    items = JSON.parse(fs.readFileSync(batchPath, 'utf-8'));
  } catch (e) {
    console.error(`Failed to parse batch file: ${e.message}`);
    process.exit(1);
  }

  if (!Array.isArray(items) || items.length === 0) {
    console.error('Batch file must contain a non-empty JSON array');
    process.exit(1);
  }

  const total = items.length;
  const startTime = Date.now();

  console.log(`\nReed Batch Processor`);
  console.log(`  Batch: ${path.basename(batchPath)} (${total} items)`);
  if (args.modelOverride) console.log(`  Model override: ${args.modelOverride}`);
  if (args.dryRun) console.log(`  Mode: DRY RUN`);
  if (args.telegram) console.log(`  Telegram: enabled`);
  console.log(`  Delay: ${args.delay}s between generations`);
  console.log(`  Guard: ${genGuard.isPaused() ? 'PAUSED' : 'active'}${args.manual ? ' (manual override)' : ''}`);
  console.log('');

  // Track results
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < total; i++) {
    const item = items[i];
    const model = args.modelOverride || item.model || 'nano_banana_2';
    const num = `[${i + 1}/${total}]`;

    console.log(`${num} Generating: ${item.id} (${model})`);

    if (args.dryRun) {
      const outputDir = expandHome(item.outputDir);
      const filename = cleanFilename(item.id, model);
      console.log(`  Output: ${path.join(outputDir, filename)}`);
      console.log(`  Prompt: ${item.prompt.slice(0, 120)}...`);
      console.log(`  Aspect: ${item.aspectRatio || '9:16'} | Res: ${item.resolution || '2k'}`);
      console.log(`  Tags: ${(item.tags || []).join(', ')}`);
      console.log('');
      continue;
    }

    const result = generateItem(item, args);

    if (result.status === 'succeeded') {
      succeeded++;
      console.log(`  OK: ${result.file} (${result.sizeMB}MB)`);
    } else if (result.status === 'skipped') {
      skipped++;
      console.log(`  SKIPPED: ${result.reason}`);
    } else {
      failed++;
      console.log(`  FAILED: ${result.reason}`);
    }

    // Log to batch-log.json in the output directory
    const outputDir = ensureDir(item.outputDir);
    appendBatchLog(outputDir, {
      id: item.id,
      model,
      status: result.status,
      file: result.file || null,
      reason: result.reason || null,
      timestamp: new Date().toISOString(),
    });

    console.log('');

    // Delay between generations (skip after last item)
    if (!args.dryRun && i < total - 1 && result.status !== 'skipped') {
      sleep(args.delay);
    }
  }

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log('─'.repeat(50));
  console.log(`Batch complete: ${succeeded} succeeded, ${failed} failed, ${skipped} skipped (paused)`);
  console.log(`Elapsed: ${elapsed}s`);

  if (args.dryRun) {
    console.log('(Dry run — nothing was generated)');
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
