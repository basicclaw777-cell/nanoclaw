/**
 * position-guardian.js — Independent SL/TP monitor
 *
 * Runs every 5 minutes via PM2 cron. Separate from the orchestrator.
 * ONLY checks open positions against current prices and executes SL/TP.
 * No signal generation, no debates, no roundtables — just protection.
 *
 * If the orchestrator crashes, this keeps running.
 * If this crashes, the watchdog restarts it.
 * Two independent safety nets.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { getOpenPositions, closeTrade } from './trade-logger.js';

const PORTFOLIO_PATH = path.join(__dirname, 'portfolio.json');
const BOT_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.PAUL_CHAT_ID;

async function notify(message) {
  if (!BOT_TOKEN || !CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: message, parse_mode: 'Markdown' }),
    });
  } catch (e) {}
}

async function fetchPrices(assets) {
  const ids = {
    BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana',
    AVAX: 'avalanche-2', ARB: 'arbitrum', LINK: 'chainlink',
    DOT: 'polkadot', MATIC: 'matic-network', DOGE: 'dogecoin',
    ADA: 'cardano', ATOM: 'cosmos', UNI: 'uniswap'
  };

  const needed = [...new Set(assets.map(a => ids[a]).filter(Boolean))];
  if (!needed.length) return {};

  try {
    const resp = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${needed.join(',')}&vs_currencies=usd`,
      { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(10000) }
    );
    const data = await resp.json();

    const prices = {};
    for (const [symbol, cgId] of Object.entries(ids)) {
      if (data[cgId]?.usd) {
        prices[symbol] = { price: data[cgId].usd };
      }
    }
    return prices;
  } catch (e) {
    console.error('[guardian] Price fetch failed:', e.message);
    return {};
  }
}

function loadPortfolio() {
  return JSON.parse(fs.readFileSync(PORTFOLIO_PATH, 'utf8'));
}

function savePortfolio(p) {
  fs.writeFileSync(PORTFOLIO_PATH, JSON.stringify(p, null, 2));
}

async function guard() {
  const positions = getOpenPositions();
  if (!positions.length) {
    console.log('[guardian] No open positions.');
    return;
  }

  const assets = positions.map(p => p.asset);
  const prices = await fetchPrices(assets);

  if (!Object.keys(prices).length) {
    console.log('[guardian] No prices fetched — skipping.');
    return;
  }

  const portfolio = loadPortfolio();
  let actions = 0;

  for (const pos of positions) {
    const priceData = prices[pos.asset];
    if (!priceData) continue;

    const current = priceData.price;
    const isLong = pos.direction === 'long';

    // Check stop loss
    if (pos.stop_loss) {
      const hitSL = isLong ? current <= pos.stop_loss : current >= pos.stop_loss;
      if (hitSL) {
        const result = closeTrade(pos.id, current);
        if (result) {
          portfolio.balance += result.pnl;
          portfolio.total_pnl = (portfolio.total_pnl || 0) + result.pnl;
          portfolio.total_trades = (portfolio.total_trades || 0) + 1;
          portfolio.losses = (portfolio.losses || 0) + 1;
          actions++;
          const msg = `🛑 *Guardian SL Hit*\n${pos.asset} ${pos.direction} @ ${pos.entry_price}\nExit: $${current}\nPnL: $${result.pnl.toFixed(2)}\nStrategy: ${pos.strategy}`;
          console.log(`[guardian] SL HIT: ${pos.asset} @ ${current} | PnL: ${result.pnl.toFixed(2)}`);
          await notify(msg);
        }
      }
    }

    // Check take profit
    if (pos.take_profit) {
      const hitTP = isLong ? current >= pos.take_profit : current <= pos.take_profit;
      if (hitTP) {
        const result = closeTrade(pos.id, current);
        if (result) {
          portfolio.balance += result.pnl;
          portfolio.total_pnl = (portfolio.total_pnl || 0) + result.pnl;
          portfolio.total_trades = (portfolio.total_trades || 0) + 1;
          portfolio.wins = (portfolio.wins || 0) + 1;
          actions++;
          const msg = `✅ *Guardian TP Hit*\n${pos.asset} ${pos.direction} @ ${pos.entry_price}\nExit: $${current}\nPnL: $${result.pnl.toFixed(2)}\nStrategy: ${pos.strategy}`;
          console.log(`[guardian] TP HIT: ${pos.asset} @ ${current} | PnL: ${result.pnl.toFixed(2)}`);
          await notify(msg);
        }
      }
    }
  }

  if (actions > 0) {
    savePortfolio(portfolio);
    console.log(`[guardian] ${actions} positions closed. Balance: $${portfolio.balance.toFixed(2)}`);
  } else {
    console.log(`[guardian] ${positions.length} positions checked. All within bounds.`);
  }
}

guard().catch(err => {
  console.error('[guardian] Fatal:', err.message);
  process.exit(1);
});
