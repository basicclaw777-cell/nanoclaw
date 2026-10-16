'use strict';

const { chat, listProviders } = require('./providers.cjs');
const { SEQUENCES } = require('./sequences.cjs');
const { scoreMove, summarizeRun } = require('./scorer.cjs');
const { getDb, createRun, saveMove, finishRun } = require('./store.cjs');

async function runProbe(modelName, sequenceId, opts = {}) {
  const sequence = SEQUENCES[sequenceId];
  if (!sequence) throw new Error(`Unknown sequence: ${sequenceId}. Available: ${Object.keys(SEQUENCES).join(', ')}`);

  const verbose = opts.verbose !== false;
  const db = getDb();
  const runId = createRun(db, modelName, sequenceId);

  if (verbose) {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`  ALIGNMENT PROBE — ${modelName} × ${sequence.name}`);
    console.log(`  Run #${runId}`);
    console.log(`${'═'.repeat(70)}\n`);
  }

  const messages = [];
  const moveScores = [];

  for (const move of sequence.moves) {
    if (verbose) {
      console.log(`  ┌─ Move ${move.id} [${move.key.toUpperCase()}]`);
      console.log(`  │  "${move.prompt.slice(0, 80)}${move.prompt.length > 80 ? '...' : ''}"`);
    }

    messages.push({ role: 'user', content: move.prompt });

    let response;
    try {
      response = await chat(modelName, messages);
    } catch (err) {
      console.error(`  │  ERROR: ${err.message}`);
      response = `[ERROR: ${err.message}]`;
    }

    messages.push({ role: 'assistant', content: response });

    const scores = scoreMove(move.id, response);
    moveScores.push(scores);
    saveMove(db, runId, move.id, move.prompt, response, scores);

    if (verbose) {
      console.log(`  │  Syc: ${scores.sycophancy}/10  Con: ${scores.logicalConsistency}/10  Self: ${scores.selfAwareness}/10`);
      if (scores.defensiveTactics.length > 0) {
        console.log(`  │  Tactics: ${scores.defensiveTactics.join(', ')}`);
      }
      console.log(`  │  Words: ${scores.wordCount}`);
      console.log(`  └${'─'.repeat(50)}`);
    }
  }

  const summary = summarizeRun(moveScores);
  finishRun(db, runId, summary);

  if (verbose) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`  SUMMARY — ${modelName}`);
    console.log(`  Avg Sycophancy:    ${summary.avgSycophancy}/10`);
    console.log(`  Avg Consistency:   ${summary.avgConsistency}/10`);
    console.log(`  Avg Self-Aware:    ${summary.avgSelfAwareness}/10`);
    console.log(`  Collapse at Move:  ${summary.collapseThreshold || 'NONE (held ground)'}`);
    console.log(`  Peak Sycophancy:   ${summary.peakSycophancy}/10`);
    console.log(`  Defensive Tactics: ${summary.allDefensiveTactics.join(', ') || 'none detected'}`);
    console.log(`${'─'.repeat(70)}\n`);
  }

  db.close();
  return { runId, summary, moveScores };
}

module.exports = { runProbe };
