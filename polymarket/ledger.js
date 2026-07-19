import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { recordCalibration } from './calibration-tracker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const LEDGER_PATH = path.join(__dirname, 'ledger.json');
const HISTORY_PATH = path.join(__dirname, 'trade-history.json');

function loadLedger() {
  if (!fs.existsSync(LEDGER_PATH)) {
    return {
      mode: CONFIG.mode,
      bankroll: CONFIG.paperBankroll,
      startingBankroll: CONFIG.paperBankroll,
      positions: [],
      stats: { totalTrades: 0, wins: 0, losses: 0, totalPnl: 0 },
      createdAt: new Date().toISOString()
    };
  }
  return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
}

function saveLedger(ledger) {
  ledger.updatedAt = new Date().toISOString();
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2));
}

function loadHistory() {
  if (!fs.existsSync(HISTORY_PATH)) return [];
  return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
}

function saveHistory(history) {
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
}

function openPosition(marketId, question, side, shares, sharePrice, edge, confidence, reasoning) {
  const ledger = loadLedger();
  const cost = Math.round(shares * sharePrice * 100) / 100;

  // Check bankroll
  if (cost > ledger.bankroll) {
    return { error: `Insufficient bankroll: $${cost} > $${ledger.bankroll.toFixed(2)}` };
  }

  // Check if already have position in this market
  const existing = ledger.positions.find(p => p.marketId === marketId && p.status === 'open');
  if (existing) {
    return { error: `Already have open position in this market (${existing.side} ${existing.shares} shares)` };
  }

  const position = {
    id: `pos-${Date.now()}`,
    marketId,
    question,
    side,
    shares,
    sharePrice,
    cost,
    edge,
    confidence,
    reasoning: reasoning?.slice(0, 500),
    status: 'open',
    openedAt: new Date().toISOString(),
    potentialProfit: Math.round(shares * (1 - sharePrice) * 100) / 100
  };

  ledger.positions.push(position);
  ledger.bankroll = Math.round((ledger.bankroll - cost) * 100) / 100;
  ledger.stats.totalTrades++;
  saveLedger(ledger);

  console.log(`[LEDGER] OPENED: ${side} ${shares} shares of "${question}" @ ${sharePrice} = $${cost}`);
  return position;
}

function closePosition(positionId, outcome) {
  // outcome: 'win' | 'loss'
  const ledger = loadLedger();
  const pos = ledger.positions.find(p => p.id === positionId);
  if (!pos) return { error: `Position ${positionId} not found` };
  if (pos.status !== 'open') return { error: `Position already ${pos.status}` };

  let pnl;
  if (outcome === 'win') {
    // Shares pay out $1 each
    pnl = Math.round(pos.shares * (1 - pos.sharePrice) * 100) / 100;
    ledger.bankroll = Math.round((ledger.bankroll + pos.shares) * 100) / 100; // $1 per share
    ledger.stats.wins++;
  } else {
    // Shares worth $0
    pnl = -pos.cost;
    ledger.stats.losses++;
  }

  pos.status = outcome === 'win' ? 'won' : 'lost';
  pos.closedAt = new Date().toISOString();
  pos.pnl = pnl;
  ledger.stats.totalPnl = Math.round((ledger.stats.totalPnl + pnl) * 100) / 100;

  saveLedger(ledger);

  // Append to history
  const history = loadHistory();
  history.push({ ...pos });
  saveHistory(history);

  console.log(`[LEDGER] CLOSED: ${pos.question} → ${outcome.toUpperCase()} | PnL: ${pnl >= 0 ? '+' : ''}$${pnl}`);

  try { recordCalibration(pos); } catch (e) { console.error(`[CALIBRATION] Error: ${e.message}`); }

  return pos;
}

function getStatus() {
  const ledger = loadLedger();
  const open = ledger.positions.filter(p => p.status === 'open');
  const exposure = open.reduce((sum, p) => sum + p.cost, 0);
  const potentialProfit = open.reduce((sum, p) => sum + p.potentialProfit, 0);
  const completed = ledger.stats.wins + ledger.stats.losses;
  const winRate = completed > 0
    ? ((ledger.stats.wins / completed) * 100).toFixed(1) + '%'
    : 'N/A';

  return {
    mode: ledger.mode,
    bankroll: ledger.bankroll,
    startingBankroll: ledger.startingBankroll,
    returnPct: (((ledger.bankroll - ledger.startingBankroll + exposure) / ledger.startingBankroll) * 100).toFixed(1) + '%',
    openPositions: open.length,
    exposure: Math.round(exposure * 100) / 100,
    potentialProfit: Math.round(potentialProfit * 100) / 100,
    totalPnl: ledger.stats.totalPnl,
    winRate,
    totalTrades: ledger.stats.totalTrades,
    wins: ledger.stats.wins,
    losses: ledger.stats.losses,
    positions: open
  };
}

// CLI
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const cmd = process.argv[2];

  if (cmd === 'status') {
    const s = getStatus();
    console.log(`\n=== POLYMARKET PAPER LEDGER ===`);
    console.log(`Mode: ${s.mode.toUpperCase()} | Bankroll: $${s.bankroll} | Return: ${s.returnPct}`);
    console.log(`Open: ${s.openPositions} positions | Exposure: $${s.exposure} | Potential: +$${s.potentialProfit}`);
    console.log(`Trades: ${s.totalTrades} | Wins: ${s.wins} | Losses: ${s.losses} | Win Rate: ${s.winRate}`);
    console.log(`Total PnL: ${s.totalPnl >= 0 ? '+' : ''}$${s.totalPnl}`);
    if (s.positions.length) {
      console.log(`\nOpen Positions:`);
      for (const p of s.positions) {
        const days = p.openedAt ? Math.floor((Date.now() - new Date(p.openedAt)) / 86400000) : '?';
        console.log(`  ${p.side} ${p.shares}sh "${p.question}" @ ${p.sharePrice} ($${p.cost}) | ${days}d | Edge: ${(p.edge * 100).toFixed(1)}%`);
      }
    }
  } else if (cmd === 'open') {
    // node ledger.js open <marketId> <question> <side> <shares> <price> <edge>
    const [, , , mId, question, side, shares, price, edge] = process.argv;
    if (!mId) { console.log('Usage: node ledger.js open <marketId> <question> <side> <shares> <price> <edge>'); process.exit(1); }
    openPosition(mId, question, side, parseInt(shares), parseFloat(price), parseFloat(edge), 'medium');
  } else if (cmd === 'close') {
    const [, , , posId, outcome] = process.argv;
    if (!posId || !outcome) { console.log('Usage: node ledger.js close <positionId> <win|loss>'); process.exit(1); }
    closePosition(posId, outcome);
  } else if (cmd === 'history') {
    const history = loadHistory();
    if (!history.length) { console.log('No trade history.'); process.exit(0); }
    console.log(`\n=== TRADE HISTORY (${history.length} trades) ===\n`);
    for (const h of history.slice(-20)) {
      const pnlStr = h.pnl >= 0 ? `+$${h.pnl}` : `-$${Math.abs(h.pnl)}`;
      console.log(`  [${h.status.toUpperCase()}] ${h.side} ${h.shares}sh "${h.question}" | ${pnlStr}`);
    }
  } else {
    console.log('Usage: node ledger.js <status|open|close|history>');
  }
}

export { loadLedger, saveLedger, openPosition, closePosition, getStatus, loadHistory };
