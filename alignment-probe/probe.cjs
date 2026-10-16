#!/usr/bin/env node
'use strict';

const { runProbe } = require('./runner.cjs');
const { printDashboard, printRunDetail } = require('./dashboard.cjs');
const { listProviders } = require('./providers.cjs');
const { SEQUENCES } = require('./sequences.cjs');

const args = process.argv.slice(2);

function usage() {
  console.log(`
  LLM Alignment Probe — Socratic Pressure Testing
  ─────────────────────────────────────────────────

  Usage:
    node probe.js --model <name>              Run default sequence against model
    node probe.js --model <name> --seq <id>   Run specific sequence
    node probe.js --all-local                 Run all local models
    node probe.js --all-cloud                 Run all cloud models
    node probe.js --dashboard                 Show comparison table
    node probe.js --detail <run_id>           Show move-by-move detail
    node probe.js --models                    List available models
    node probe.js --sequences                 List available sequences

  Models:`);
  for (const p of listProviders()) {
    console.log(`    ${p.name.padEnd(20)} ${p.model.padEnd(40)} [${p.type}]`);
  }
  console.log(`\n  Sequences:`);
  for (const [id, seq] of Object.entries(SEQUENCES)) {
    console.log(`    ${id.padEnd(25)} ${seq.name} (${seq.moves.length} moves)`);
  }
  console.log('');
}

function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}

async function main() {
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    usage();
    return;
  }

  if (args.includes('--models')) {
    console.log('\nAvailable models:');
    for (const p of listProviders()) {
      console.log(`  ${p.name.padEnd(20)} ${p.model.padEnd(40)} [${p.type}]`);
    }
    return;
  }

  if (args.includes('--sequences')) {
    console.log('\nAvailable sequences:');
    for (const [id, seq] of Object.entries(SEQUENCES)) {
      console.log(`  ${id.padEnd(25)} ${seq.name}`);
      for (const m of seq.moves) {
        console.log(`    Move ${m.id} [${m.key}]: "${m.prompt.slice(0, 60)}..."`);
      }
    }
    return;
  }

  if (args.includes('--dashboard')) {
    printDashboard();
    return;
  }

  const detailId = getArg('--detail');
  if (detailId) {
    printRunDetail(parseInt(detailId, 10));
    return;
  }

  const seqId = getArg('--seq') || 'flat-earth-forensic';

  if (args.includes('--all-local')) {
    const locals = listProviders().filter(p => p.type === 'local');
    console.log(`\nRunning ${locals.length} local models × ${seqId}...\n`);
    for (const p of locals) {
      try {
        await runProbe(p.name, seqId);
      } catch (err) {
        console.error(`  FAILED ${p.name}: ${err.message}`);
      }
    }
    printDashboard();
    return;
  }

  if (args.includes('--all-cloud')) {
    const clouds = listProviders().filter(p => p.type === 'cloud');
    console.log(`\nRunning ${clouds.length} cloud models × ${seqId}...\n`);
    for (const p of clouds) {
      try {
        await runProbe(p.name, seqId);
      } catch (err) {
        console.error(`  FAILED ${p.name}: ${err.message}`);
      }
    }
    printDashboard();
    return;
  }

  const modelName = getArg('--model');
  if (!modelName) {
    console.error('  Error: --model <name> required. Use --help for usage.');
    process.exit(1);
  }

  await runProbe(modelName, seqId);
  printDashboard();
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
