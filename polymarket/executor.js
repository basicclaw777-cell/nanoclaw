import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sizeAll, getCurrentBankroll } from './kelly.js';
import { openPosition, getStatus } from './ledger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const EXEC_LOG_PATH = path.join(__dirname, 'execution-log.json');

function loadExecLog() {
  if (!fs.existsSync(EXEC_LOG_PATH)) return [];
  return JSON.parse(fs.readFileSync(EXEC_LOG_PATH, 'utf8'));
}

function saveExecLog(log) {
  fs.writeFileSync(EXEC_LOG_PATH, JSON.stringify(log, null, 2));
}

async function execute(dryRun = false) {
  const sized = sizeAll();
  if (!sized.length) {
    console.log('[EXECUTOR] No tradeable positions from Kelly sizing.');
    return { executed: [], skipped: [], errors: [] };
  }

  const status = getStatus();
  const execLog = loadExecLog();
  const executed = [];
  const skipped = [];
  const errors = [];

  for (const trade of sized) {
    // Skip blocked trades
    if (trade.blocked) {
      skipped.push({ ...trade, reason: trade.blockReason });
      continue;
    }

    // Skip if already have position in this market
    const hasPosition = status.positions.some(p => p.marketId === trade.marketId);
    if (hasPosition) {
      skipped.push({ ...trade, reason: 'Already have open position' });
      continue;
    }

    // Skip if already executed this market today (avoid duplicate trades)
    const today = new Date().toISOString().split('T')[0];
    const alreadyToday = execLog.some(e =>
      e.marketId === trade.marketId && e.date === today
    );
    if (alreadyToday) {
      skipped.push({ ...trade, reason: 'Already executed today' });
      continue;
    }

    // Skip negative or zero EV
    if (trade.expectedValue <= 0) {
      skipped.push({ ...trade, reason: `Negative EV: ${trade.evRatio}` });
      continue;
    }

    if (dryRun) {
      console.log(`[DRY RUN] Would open: ${trade.side} ${trade.shares}sh "${trade.question}" @ $${trade.sharePrice} = $${trade.cost}`);
      executed.push({ ...trade, dryRun: true });
      continue;
    }

    // Execute paper trade
    const result = openPosition(
      trade.marketId,
      trade.question,
      trade.side,
      trade.shares,
      parseFloat(trade.sharePrice),
      trade.edge,
      trade.confidence
    );

    if (result.error) {
      errors.push({ ...trade, error: result.error });
      console.error(`[EXECUTOR] Error: ${result.error}`);
    } else {
      executed.push({ ...trade, positionId: result.id });
      execLog.push({
        marketId: trade.marketId,
        question: trade.question,
        side: trade.side,
        shares: trade.shares,
        cost: trade.cost,
        edge: trade.edgePct,
        date: today,
        executedAt: new Date().toISOString()
      });
      console.log(`[EXECUTOR] OPENED: ${trade.side} ${trade.shares}sh "${trade.question}" @ $${trade.sharePrice} = $${trade.cost} | EV: ${trade.evRatio}`);
    }
  }

  saveExecLog(execLog);

  console.log(`\n[EXECUTOR] Done: ${executed.length} executed, ${skipped.length} skipped, ${errors.length} errors`);
  return { executed, skipped, errors };
}

// CLI
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const dryRun = process.argv.includes('--dry');
  execute(dryRun).then(r => {
    if (r.skipped.length) {
      console.log('\nSkipped:');
      for (const s of r.skipped) console.log(`  ${s.question.slice(0, 50)} — ${s.reason}`);
    }
    if (!dryRun && r.executed.length) {
      const s = getStatus();
      console.log(`\nLedger: $${s.bankroll} bankroll | ${s.openPositions} positions | $${s.exposure} exposure`);
    }
  }).catch(console.error);
}

export { execute };
