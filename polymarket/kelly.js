import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const ESTIMATES_PATH = path.join(__dirname, 'estimates.json');
const LEDGER_PATH = path.join(__dirname, 'ledger.json');

// Kelly Criterion: f* = (bp - q) / b
// where b = odds offered (decimal - 1), p = our probability, q = 1 - p
// Half-Kelly: f*/2 for bankroll protection

function kellyFraction(ourProb, marketPrice, side) {
  // For YES side: we buy YES at marketPrice, pays 1.00 if correct
  // For NO side: we buy NO at (1 - marketPrice), pays 1.00 if correct
  const price = side === 'YES' ? marketPrice : (1 - marketPrice);
  const p = side === 'YES' ? ourProb : (1 - ourProb);

  // Decimal odds from price
  const odds = 1 / price;
  const b = odds - 1; // net odds
  const q = 1 - p;

  // Kelly formula
  const fullKelly = (b * p - q) / b;

  // Clamp to 0 — negative Kelly = no bet
  if (fullKelly <= 0) return { fullKelly: 0, fractionalKelly: 0, noBet: true };

  const fractionalKelly = fullKelly * CONFIG.risk.kellyFraction;

  return { fullKelly, fractionalKelly, noBet: false };
}

function sizeTrade(estimate, bankroll) {
  const { edge } = estimate;
  if (!edge || !edge.tradeable) return null;

  const kelly = kellyFraction(estimate.ourEstimate, estimate.marketPrice, edge.side);
  if (kelly.noBet) return null;

  // Apply position limits
  const maxPct = CONFIG.risk.maxSinglePositionPct;
  const allocPct = Math.min(kelly.fractionalKelly, maxPct);
  const dollarSize = Math.floor(allocPct * bankroll * 100) / 100;

  // Price per share
  const sharePrice = edge.side === 'YES' ? estimate.marketPrice : (1 - estimate.marketPrice);
  const shares = Math.floor(dollarSize / sharePrice);
  const cost = Math.round(shares * sharePrice * 100) / 100;

  // Expected value
  const winProb = edge.side === 'YES' ? estimate.ourEstimate : (1 - estimate.ourEstimate);
  const profit = shares * (1 - sharePrice); // payout per share = $1 - cost
  const loss = cost;
  const ev = (winProb * profit) - ((1 - winProb) * loss);

  return {
    side: edge.side,
    edge: edge.edge,
    edgePct: edge.edgePct,
    confidence: estimate.confidence,
    fullKelly: (kelly.fullKelly * 100).toFixed(1) + '%',
    halfKelly: (kelly.fractionalKelly * 100).toFixed(1) + '%',
    allocPct: (allocPct * 100).toFixed(1) + '%',
    sharePrice: sharePrice.toFixed(3),
    shares,
    cost,
    potentialProfit: Math.round(profit * 100) / 100,
    potentialLoss: cost,
    expectedValue: Math.round(ev * 100) / 100,
    evRatio: ev > 0 ? '+$' + ev.toFixed(2) : '-$' + Math.abs(ev).toFixed(2)
  };
}

function getCurrentBankroll() {
  if (!fs.existsSync(LEDGER_PATH)) return CONFIG.paperBankroll;
  const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  return ledger.bankroll || CONFIG.paperBankroll;
}

function getTotalExposure() {
  if (!fs.existsSync(LEDGER_PATH)) return 0;
  const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  if (!ledger.positions) return 0;
  return ledger.positions
    .filter(p => p.status === 'open')
    .reduce((sum, p) => sum + p.cost, 0);
}

function sizeAll() {
  if (!fs.existsSync(ESTIMATES_PATH)) {
    console.log('[KELLY] No estimates found. Run researcher first.');
    return [];
  }

  const estimates = JSON.parse(fs.readFileSync(ESTIMATES_PATH, 'utf8'));
  const bankroll = getCurrentBankroll();
  const currentExposure = getTotalExposure();
  const maxExposure = bankroll * CONFIG.risk.maxTotalExposurePct;
  const availableCapital = Math.max(0, maxExposure - currentExposure);

  console.log(`[KELLY] Bankroll: $${bankroll} | Exposure: $${currentExposure.toFixed(2)} / $${maxExposure.toFixed(2)} max | Available: $${availableCapital.toFixed(2)}`);

  const sized = [];
  for (const [marketId, est] of Object.entries(estimates)) {
    const trade = sizeTrade(est, bankroll);
    if (!trade) continue;

    // Check total exposure limit
    if (trade.cost > availableCapital) {
      trade.blocked = true;
      trade.blockReason = `Exceeds max exposure ($${availableCapital.toFixed(2)} available)`;
    }

    sized.push({
      marketId,
      question: est.question,
      ...trade
    });
  }

  // Sort by EV descending
  sized.sort((a, b) => b.expectedValue - a.expectedValue);

  return sized;
}

// CLI
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const sized = sizeAll();
  if (!sized.length) {
    console.log('\nNo tradeable positions.');
  } else {
    console.log(`\n=== POSITION SIZING (Half-Kelly, $${getCurrentBankroll()} bankroll) ===\n`);
    for (const s of sized) {
      const blocked = s.blocked ? ' [BLOCKED]' : '';
      console.log(`  ${s.side} ${s.question}${blocked}`);
      console.log(`    Edge: ${s.edgePct} | Kelly: ${s.fullKelly} → ${s.halfKelly} (capped ${s.allocPct})`);
      console.log(`    ${s.shares} shares @ ${s.sharePrice} = $${s.cost} | EV: ${s.evRatio} | Profit: $${s.potentialProfit} | Loss: $${s.potentialLoss}`);
      if (s.blockReason) console.log(`    BLOCKED: ${s.blockReason}`);
      console.log('');
    }
  }
}

export { kellyFraction, sizeTrade, sizeAll, getCurrentBankroll, getTotalExposure };
