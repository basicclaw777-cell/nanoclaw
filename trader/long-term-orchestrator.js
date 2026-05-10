/**
 * long-term-orchestrator.js — The patient portfolio
 *
 * Different game from active trading:
 * - Weekly DCA into BTC + ETH (the boring engine)
 * - Cycle-based positions (halving cycle timing)
 * - High-convergence holds (3+ strategies agree on monthly)
 * - 15% SL, 30% TP — much wider than active
 *
 * Runs weekly (Mondays). Separate from 4-hour active trading.
 *
 * ESM.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const PORTFOLIO_PATH = path.join(__dirname, 'long-term-portfolio.json');
const SIGNALS_PATH = path.join(__dirname, 'signals', 'crypto-signals-latest.json');

const BOT_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.PAUL_CHAT_ID;

async function notify(message) {
  if (!BOT_TOKEN || !CHAT_ID) { console.log('[notify]', message); return; }
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: message }),
    });
  } catch (e) { console.error('[notify]', e.message); }
}

function loadPortfolio() {
  return JSON.parse(fs.readFileSync(PORTFOLIO_PATH, 'utf8'));
}

function savePortfolio(p) {
  fs.writeFileSync(PORTFOLIO_PATH, JSON.stringify(p, null, 2));
}

function loadPrices() {
  if (!fs.existsSync(SIGNALS_PATH)) return null;
  return JSON.parse(fs.readFileSync(SIGNALS_PATH, 'utf8')).prices;
}

// ── DCA: Dollar Cost Average ─────────────────────────────────────────────────

function executeDCA(portfolio, prices) {
  const today = new Date().toISOString().split('T')[0];

  // Only DCA once per week
  if (portfolio.last_dca === today) return false;

  const dca = portfolio.dca_schedule;
  let bought = [];

  // BTC weekly buy
  if (dca.btc_weekly > 0 && prices.BTC?.price) {
    const amount = dca.btc_weekly;
    const qty = amount / prices.BTC.price;
    if (!portfolio.positions.BTC) {
      portfolio.positions.BTC = { qty: 0, total_cost: 0, avg_price: 0, first_buy: today };
    }
    portfolio.positions.BTC.qty += qty;
    portfolio.positions.BTC.total_cost += amount;
    portfolio.positions.BTC.avg_price = portfolio.positions.BTC.total_cost / portfolio.positions.BTC.qty;
    portfolio.balance_cash -= amount;
    portfolio.total_invested += amount;
    bought.push(`BTC: $${amount} → ${qty.toFixed(6)} @ $${prices.BTC.price.toLocaleString()}`);
  }

  // ETH weekly buy
  if (dca.eth_weekly > 0 && prices.ETH?.price) {
    const amount = dca.eth_weekly;
    const qty = amount / prices.ETH.price;
    if (!portfolio.positions.ETH) {
      portfolio.positions.ETH = { qty: 0, total_cost: 0, avg_price: 0, first_buy: today };
    }
    portfolio.positions.ETH.qty += qty;
    portfolio.positions.ETH.total_cost += amount;
    portfolio.positions.ETH.avg_price = portfolio.positions.ETH.total_cost / portfolio.positions.ETH.qty;
    portfolio.balance_cash -= amount;
    portfolio.total_invested += amount;
    bought.push(`ETH: $${amount} → ${qty.toFixed(4)} @ $${prices.ETH.price.toLocaleString()}`);
  }

  portfolio.last_dca = today;

  if (bought.length > 0) {
    console.log(`[DCA] Weekly buys executed: ${bought.join(', ')}`);
  }

  return bought.length > 0;
}

// ── Value Calculation ────────────────────────────────────────────────────────

function calculateValue(portfolio, prices) {
  let totalValue = portfolio.balance_cash;
  let unrealised = 0;

  for (const [asset, pos] of Object.entries(portfolio.positions)) {
    const currentPrice = prices[asset]?.price;
    if (!currentPrice) continue;

    const currentValue = pos.qty * currentPrice;
    const costBasis = pos.total_cost;
    const pnl = currentValue - costBasis;

    totalValue += currentValue;
    unrealised += pnl;

    pos.current_value = Math.round(currentValue * 100) / 100;
    pos.unrealised_pnl = Math.round(pnl * 100) / 100;
    pos.unrealised_pct = Math.round((pnl / costBasis) * 10000) / 100;
  }

  portfolio.total_value = Math.round(totalValue * 100) / 100;
  portfolio.unrealised_pnl = Math.round(unrealised * 100) / 100;

  return { totalValue, unrealised };
}

// ── Weekly Report ────────────────────────────────────────────────────────────

function generateReport(portfolio, prices) {
  const lines = [
    `[LONG-TERM PORTFOLIO] Weekly Report`,
    `Balance: $${portfolio.total_value.toLocaleString()} (cash: $${portfolio.balance_cash.toLocaleString()})`,
    `Invested: $${portfolio.total_invested.toLocaleString()}`,
    `Unrealised P&L: $${portfolio.unrealised_pnl >= 0 ? '+' : ''}${portfolio.unrealised_pnl.toLocaleString()}`,
    ``,
    `Positions:`,
  ];

  for (const [asset, pos] of Object.entries(portfolio.positions)) {
    const price = prices[asset]?.price;
    if (!price) continue;
    lines.push(`  ${asset}: ${pos.qty.toFixed(6)} @ avg $${pos.avg_price.toFixed(2)} → now $${price.toLocaleString()} (${pos.unrealised_pct >= 0 ? '+' : ''}${pos.unrealised_pct}%)`);
  }

  lines.push(`\nDCA: $${portfolio.dca_schedule.btc_weekly}/wk BTC + $${portfolio.dca_schedule.eth_weekly}/wk ETH`);
  lines.push(`Week ${Math.ceil((Date.now() - new Date(portfolio.started).getTime()) / 604800000)} since start`);

  return lines.join('\n');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`[LONG-TERM] Weekly run — ${new Date().toISOString()}`);
  console.log(`${'='.repeat(50)}\n`);

  const portfolio = loadPortfolio();
  const prices = loadPrices();

  if (!prices) {
    console.log('[ABORT] No price data');
    return;
  }

  // Execute weekly DCA
  const dcaExecuted = executeDCA(portfolio, prices);

  // Calculate current portfolio value
  calculateValue(portfolio, prices);

  // Record history
  portfolio.history.push({
    date: new Date().toISOString().split('T')[0],
    total_value: portfolio.total_value,
    unrealised_pnl: portfolio.unrealised_pnl,
    btc_price: prices.BTC?.price,
    eth_price: prices.ETH?.price,
  });

  // Keep last 52 weeks of history
  if (portfolio.history.length > 52) {
    portfolio.history = portfolio.history.slice(-52);
  }

  // Save
  savePortfolio(portfolio);

  // Report
  const report = generateReport(portfolio, prices);
  console.log(report);
  await notify(report);

  console.log('\n[LONG-TERM] Done.\n');
}

run().catch(e => {
  console.error('[FATAL]', e);
  process.exit(1);
});
