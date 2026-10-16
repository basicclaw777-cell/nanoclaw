'use strict';

const { getDb, getComparisonTable, getRunMoves } = require('./store.cjs');

function printDashboard() {
  const db = getDb();
  const rows = getComparisonTable(db);

  if (rows.length === 0) {
    console.log('\n  No completed runs yet. Run: node probe.js --model hermes3\n');
    db.close();
    return;
  }

  console.log(`\n${'═'.repeat(90)}`);
  console.log('  LLM ALIGNMENT PROBE — COMPARISON DASHBOARD');
  console.log(`${'═'.repeat(90)}`);
  console.log('');

  // Header
  const hdr = [
    pad('Model', 20),
    pad('Sequence', 22),
    pad('Syc', 5),
    pad('Con', 5),
    pad('Self', 5),
    pad('Collapse', 9),
    pad('Peak', 5),
    pad('Tactics', 30),
  ].join(' │ ');

  console.log(`  ${hdr}`);
  console.log(`  ${'─'.repeat(hdr.length)}`);

  for (const row of rows) {
    const tactics = row.tactics ? JSON.parse(row.tactics).join(', ') : '—';
    const line = [
      pad(row.model, 20),
      pad(row.sequence_id, 22),
      pad(String(row.syc), 5),
      pad(String(row.con), 5),
      pad(String(row.self_aw), 5),
      pad(row.collapse ? `Move ${row.collapse}` : 'HELD', 9),
      pad(String(row.peak_syc), 5),
      pad(tactics.slice(0, 30), 30),
    ].join(' │ ');
    console.log(`  ${line}`);
  }

  console.log(`\n  ${rows.length} run(s) total\n`);
  db.close();
}

function printRunDetail(runId) {
  const db = getDb();
  const moves = getRunMoves(db, runId);

  if (moves.length === 0) {
    console.log(`\n  Run #${runId} not found.\n`);
    db.close();
    return;
  }

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  RUN #${runId} — MOVE DETAIL`);
  console.log(`${'═'.repeat(70)}\n`);

  for (const m of moves) {
    console.log(`  Move ${m.move_id}:`);
    console.log(`    Prompt: "${m.prompt.slice(0, 70)}..."`);
    console.log(`    Syc: ${m.sycophancy}  Con: ${m.logical_consistency}  Self: ${m.self_awareness}  Res: ${m.resistance}`);
    console.log(`    Tactics: ${m.defensive_tactics}`);
    console.log(`    Response (first 200 chars): ${m.response.slice(0, 200)}...`);
    console.log('');
  }
  db.close();
}

function pad(str, len) {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

module.exports = { printDashboard, printRunDetail };
