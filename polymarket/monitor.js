import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadLedger, saveLedger, closePosition, getStatus } from './ledger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const GAMMA = CONFIG.gammaApi;

async function fetchMarketPrice(conditionId) {
  // Fetch current price from Gamma for a specific market
  try {
    const url = `${GAMMA}/markets/${conditionId}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const prices = data.outcomePrices ? JSON.parse(data.outcomePrices) : null;
    return prices ? { yes: Number(prices[0]), no: Number(prices[1]) } : null;
  } catch {
    return null;
  }
}

async function fetchMarketBySlug(slug) {
  try {
    const url = `${GAMMA}/markets?slug=${slug}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data[0] || null;
  } catch {
    return null;
  }
}

async function checkResolutions() {
  const ledger = loadLedger();
  const open = ledger.positions.filter(p => p.status === 'open');

  if (!open.length) {
    console.log('[MONITOR] No open positions.');
    return { checked: 0, resolved: [], priceUpdates: [] };
  }

  console.log(`[MONITOR] Checking ${open.length} open positions...`);

  const resolved = [];
  const priceUpdates = [];

  for (const pos of open) {
    // Try to get current market state from scan data
    const scanData = loadScanData();
    const allMarkets = [
      ...(scanData?.markets?.candidates || []),
      ...(scanData?.markets?.other || [])
    ];
    const market = allMarkets.find(m => m.marketId === pos.marketId);

    if (market) {
      const currentPrice = pos.side === 'YES' ? market.yesPrice : market.noPrice;
      const entryPrice = pos.sharePrice;
      const unrealizedPnl = (currentPrice - entryPrice) * pos.shares;

      priceUpdates.push({
        positionId: pos.id,
        question: pos.question,
        side: pos.side,
        entryPrice,
        currentPrice,
        unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
        daysToResolution: market.daysToResolution
      });

      // Check if market resolved (price at 0 or 1)
      if (market.yesPrice >= 0.99 || market.yesPrice <= 0.01) {
        const yesWon = market.yesPrice >= 0.99;
        const weWin = (pos.side === 'YES' && yesWon) || (pos.side === 'NO' && !yesWon);
        const outcome = weWin ? 'win' : 'loss';

        const result = closePosition(pos.id, outcome);
        if (!result.error) {
          resolved.push({
            ...pos,
            outcome,
            pnl: result.pnl
          });
          console.log(`[MONITOR] RESOLVED: "${pos.question}" → ${outcome.toUpperCase()} | PnL: ${result.pnl >= 0 ? '+' : ''}$${result.pnl}`);
        }
      }

      // Check if past end date
      if (market.daysToResolution !== null && market.daysToResolution < -3) {
        console.log(`[MONITOR] WARNING: "${pos.question}" is ${Math.abs(market.daysToResolution)} days past end date — check resolution`);
      }
    } else {
      console.log(`[MONITOR] Market not in scan data: ${pos.marketId} — "${pos.question}"`);
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 500));
  }

  return { checked: open.length, resolved, priceUpdates };
}

function loadScanData() {
  const fp = path.join(__dirname, 'markets.json');
  if (!fs.existsSync(fp)) return null;
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

function generateReport() {
  const status = getStatus();
  const scanData = loadScanData();
  const allMarkets = [
    ...(scanData?.markets?.candidates || []),
    ...(scanData?.markets?.other || [])
  ];

  const lines = [];
  lines.push('=== POLYMARKET PAPER TRIAL REPORT ===');
  lines.push(`Date: ${new Date().toISOString().split('T')[0]}`);
  lines.push(`Mode: ${status.mode.toUpperCase()}`);
  lines.push(`Bankroll: $${status.bankroll} (started $${status.startingBankroll})`);
  lines.push(`Return: ${status.returnPct}`);
  lines.push(`Trades: ${status.totalTrades} | W: ${status.wins} L: ${status.losses} | Win Rate: ${status.winRate}`);
  lines.push(`Total PnL: ${status.totalPnl >= 0 ? '+' : ''}$${status.totalPnl}`);
  lines.push(`Exposure: $${status.exposure}`);
  lines.push('');

  if (status.positions.length) {
    lines.push('--- Open Positions ---');
    for (const p of status.positions) {
      const market = allMarkets.find(m => m.marketId === p.marketId);
      const currentPrice = market
        ? (p.side === 'YES' ? market.yesPrice : market.noPrice)
        : null;
      const unrealized = currentPrice
        ? Math.round((currentPrice - p.sharePrice) * p.shares * 100) / 100
        : '?';
      const days = Math.floor((Date.now() - new Date(p.openedAt)) / 86400000);

      lines.push(`  ${p.side} "${p.question}"`);
      lines.push(`    ${p.shares}sh @ $${p.sharePrice} ($${p.cost}) | ${days}d | Edge: ${(p.edge * 100).toFixed(1)}%`);
      lines.push(`    Current: ${currentPrice ? '$' + currentPrice.toFixed(3) : '?'} | Unrealized: ${typeof unrealized === 'number' ? (unrealized >= 0 ? '+' : '') + '$' + unrealized : unrealized}`);
    }
  }

  return lines.join('\n');
}

// CLI
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const cmd = process.argv[2] || 'check';

  if (cmd === 'check') {
    checkResolutions().then(r => {
      if (r.priceUpdates.length) {
        console.log('\n--- Price Updates ---');
        for (const u of r.priceUpdates) {
          const pnlStr = u.unrealizedPnl >= 0 ? `+$${u.unrealizedPnl}` : `-$${Math.abs(u.unrealizedPnl)}`;
          console.log(`  ${u.side} "${u.question.slice(0, 50)}"`);
          console.log(`    Entry: $${u.entryPrice.toFixed(3)} → Now: $${u.currentPrice.toFixed(3)} | ${pnlStr}`);
        }
      }
      if (r.resolved.length) {
        console.log('\n--- Resolved ---');
        for (const r2 of r.resolved) {
          console.log(`  ${r2.outcome.toUpperCase()}: "${r2.question}" | PnL: ${r2.pnl >= 0 ? '+' : ''}$${r2.pnl}`);
        }
      }
    }).catch(console.error);
  } else if (cmd === 'report') {
    console.log(generateReport());
  } else {
    console.log('Usage: node monitor.js <check|report>');
  }
}

export { checkResolutions, generateReport };
