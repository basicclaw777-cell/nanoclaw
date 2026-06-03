#!/usr/bin/env node
/**
 * cyclical-trader.js — Dedicated Cyclical/Calendar Signal Experiment
 *
 * Tests: Do time-based patterns (lunar, Gann, Fibonacci, historical cycles)
 * predict market moves?
 *
 * Key differences from main trader:
 * - No debate (Phase 0 = data collection)
 * - No confluence requirement (testing individual cyclical signals)
 * - LONGER hold times (14 days stale vs 3 days) — cycles are slow
 * - WIDER stops (7% SL, 15% TP) — timing is approximate
 * - Own portfolio, own DB table, own P&L tracking
 * - Calls cathedral-strategies.py directly for the 4 cyclical strategies
 *
 * Cyclical strategies:
 *   1. historical_cycles — BTC halving, Kondratiev, Benner
 *   2. lunar_cycles — Moon phases, Mercury retrograde
 *   3. gann_geometry — Square of Nine geometric price levels
 *   4. fibonacci_time — Phi ratios in price AND time
 *
 * ESM.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DB_PATH = path.join(__dirname, 'logs', 'trades.db');
const PORTFOLIO_PATH = path.join(__dirname, 'cyclical-portfolio.json');
const STRATEGY_SCRIPT = path.join(__dirname, 'strategies', 'cathedral-strategies.py');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const CYCLICAL_STRATEGIES = ['historical_cycles', 'lunar_cycles', 'gann_geometry', 'fibonacci_time'];

// ── DB Setup ────────────────────────────────────────────────────────────────

let db;
function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS cyclical_trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        opened_at TEXT DEFAULT (datetime('now')),
        closed_at TEXT,
        asset TEXT NOT NULL,
        direction TEXT NOT NULL,
        entry_price REAL NOT NULL,
        exit_price REAL,
        position_size REAL NOT NULL,
        stop_loss REAL,
        take_profit REAL,
        status TEXT DEFAULT 'open',
        pnl REAL,
        pnl_pct REAL,
        strategy TEXT NOT NULL,
        reasoning TEXT
      );

      CREATE TABLE IF NOT EXISTS cyclical_signals_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT (datetime('now')),
        asset TEXT NOT NULL,
        direction TEXT NOT NULL,
        strength REAL,
        strategy TEXT NOT NULL,
        action_taken TEXT,
        reasoning TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_ct_status ON cyclical_trades(status);
      CREATE INDEX IF NOT EXISTS idx_ct_strategy ON cyclical_trades(strategy);
    `);
  }
  return db;
}

// ── Portfolio ───────────────────────────────────────────────────────────────

const DEFAULT_PORTFOLIO = {
  balance: 5000,
  starting_balance: 5000,
  total_pnl: 0,
  total_trades: 0,
  wins: 0,
  losses: 0,
  max_concurrent: 8,        // more positions — slow signals, many assets
  max_position_pct: 0.10,
  stop_loss_pct: 0.07,      // 7% — wider than main trader's 3%
  take_profit_pct: 0.15,    // 15% — wider than main trader's 6%
  stale_days: 14,           // 14 days — cycles are slow
  started_at: new Date().toISOString(),
};

function loadPortfolio() {
  if (fs.existsSync(PORTFOLIO_PATH)) return JSON.parse(fs.readFileSync(PORTFOLIO_PATH, 'utf8'));
  fs.writeFileSync(PORTFOLIO_PATH, JSON.stringify(DEFAULT_PORTFOLIO, null, 2));
  return { ...DEFAULT_PORTFOLIO };
}

function savePortfolio(p) {
  fs.writeFileSync(PORTFOLIO_PATH, JSON.stringify(p, null, 2));
}

// ── Price Fetching ──────────────────────────────────────────────────────────

const CRYPTO_SIGNALS_PATH = path.join(__dirname, 'signals', 'crypto-signals-latest.json');

async function fetchPrices() {
  // Try CoinGecko first
  try {
    const ids = 'bitcoin,ethereum,solana,avalanche-2,chainlink,polkadot,arbitrum,dogecoin,cardano,cosmos,uniswap';
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.error || data.status?.error_code) throw new Error('CoinGecko rate limited');

    const map = {
      bitcoin: 'BTC', ethereum: 'ETH', solana: 'SOL', 'avalanche-2': 'AVAX',
      chainlink: 'LINK', polkadot: 'DOT', arbitrum: 'ARB', dogecoin: 'DOGE',
      cardano: 'ADA', cosmos: 'ATOM', uniswap: 'UNI'
    };

    const prices = {};
    for (const [id, symbol] of Object.entries(map)) {
      if (data[id]) {
        prices[symbol] = {
          price: data[id].usd,
          change_24h: data[id].usd_24h_change,
          volume_24h: data[id].usd_24h_vol,
        };
      }
    }
    if (Object.keys(prices).length > 0) return prices;
  } catch (e) {
    console.log(`  CoinGecko unavailable: ${e.message}`);
  }

  // Fallback: read prices from main trader's signal file
  try {
    if (fs.existsSync(CRYPTO_SIGNALS_PATH)) {
      const data = JSON.parse(fs.readFileSync(CRYPTO_SIGNALS_PATH, 'utf8'));
      if (data.prices && Object.keys(data.prices).length > 0) {
        console.log('  Using cached prices from crypto-signals-latest.json');
        return data.prices;
      }
    }
  } catch (e) {}

  console.error('[cyclical-trader] No price data available');
  return null;
}

// ── Generate Cyclical Signals ───────────────────────────────────────────────
// Reads from cathedral-signals-latest.json (generated by main trader's cron)
// and filters to cyclical strategies only

const CATHEDRAL_SIGNALS_PATH = path.join(__dirname, 'signals', 'cathedral-signals-latest.json');

function generateSignals() {
  try {
    // If cathedral signals file is fresh enough (<12h), use it
    if (fs.existsSync(CATHEDRAL_SIGNALS_PATH)) {
      const stat = fs.statSync(CATHEDRAL_SIGNALS_PATH);
      const ageHours = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);

      if (ageHours < 12) {
        const data = JSON.parse(fs.readFileSync(CATHEDRAL_SIGNALS_PATH, 'utf8'));
        const cyclical = (data.signals || []).filter(s => CYCLICAL_STRATEGIES.includes(s.type || s.source));
        return cyclical;
      }
    }

    // If stale or missing, run the Python script ourselves
    console.log('  Cathedral signals stale — running strategy generator...');
    execFileSync('python3', [STRATEGY_SCRIPT], {
      cwd: __dirname,
      timeout: 60000,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'], // suppress stdout/stderr
    });

    if (fs.existsSync(CATHEDRAL_SIGNALS_PATH)) {
      const data = JSON.parse(fs.readFileSync(CATHEDRAL_SIGNALS_PATH, 'utf8'));
      const cyclical = (data.signals || []).filter(s => CYCLICAL_STRATEGIES.includes(s.type || s.source));
      return cyclical;
    }

    return [];
  } catch (e) {
    console.error(`[cyclical-trader] Signal generation failed: ${e.message}`);
    return [];
  }
}

// ── Telegram ────────────────────────────────────────────────────────────────

async function notify(msg) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: msg, parse_mode: 'Markdown' }),
    });
  } catch (e) {}
}

// ── Position Management ────────────────────────────────────────────────────

function getOpenPositions() {
  return getDb().prepare('SELECT * FROM cyclical_trades WHERE status = ?').all('open');
}

function checkPositions(prices, portfolio) {
  const open = getOpenPositions();
  let closedCount = 0;

  for (const pos of open) {
    const priceData = prices[pos.asset];
    if (!priceData) continue;
    const currentPrice = priceData.price;

    const isLong = pos.direction === 'long';
    const hitSL = isLong ? currentPrice <= pos.stop_loss : currentPrice >= pos.stop_loss;
    const hitTP = isLong ? currentPrice >= pos.take_profit : currentPrice <= pos.take_profit;

    // Stale check: close if flat or losing after stale_days
    const openedAt = new Date(pos.opened_at);
    const daysOpen = (Date.now() - openedAt.getTime()) / (1000 * 60 * 60 * 24);
    const moveFromEntry = isLong
      ? (currentPrice - pos.entry_price) / pos.entry_price
      : (pos.entry_price - currentPrice) / pos.entry_price;
    const isStale = daysOpen > portfolio.stale_days && moveFromEntry < 0.03; // close flat/losing, winners run

    let closeReason = null;
    if (hitSL) closeReason = 'STOP_LOSS';
    else if (hitTP) closeReason = 'TAKE_PROFIT';
    else if (isStale) closeReason = 'STALE_EXIT';

    if (closeReason) {
      const pnl = isLong
        ? (currentPrice - pos.entry_price) * pos.position_size / pos.entry_price
        : (pos.entry_price - currentPrice) * pos.position_size / pos.entry_price;
      const pnlPct = isLong
        ? (currentPrice - pos.entry_price) / pos.entry_price * 100
        : (pos.entry_price - currentPrice) / pos.entry_price * 100;

      getDb().prepare(`
        UPDATE cyclical_trades SET status = 'closed', closed_at = datetime('now'),
        exit_price = ?, pnl = ?, pnl_pct = ? WHERE id = ?
      `).run(currentPrice, pnl, pnlPct, pos.id);

      portfolio.balance += pnl;
      portfolio.total_pnl += pnl;
      portfolio.total_trades++;
      if (pnl > 0) portfolio.wins++;
      else portfolio.losses++;

      const emoji = pnl > 0 ? '+' : '';
      console.log(`  CLOSED: ${pos.direction} ${pos.asset} — ${closeReason} — ${emoji}$${pnl.toFixed(2)} (${emoji}${pnlPct.toFixed(1)}%)`);
      notify(`[CYCLICAL] Closed ${pos.direction} ${pos.asset} — ${closeReason}\nP&L: ${emoji}$${pnl.toFixed(2)} (${emoji}${pnlPct.toFixed(1)}%)\nStrategy: ${pos.strategy}`);
      closedCount++;
    }
  }

  return closedCount;
}

// ── Trade Execution ─────────────────────────────────────────────────────────

function executeTrade(signal, prices, portfolio) {
  const priceData = prices[signal.asset];
  if (!priceData || !priceData.price) return null;

  const entryPrice = priceData.price;
  const direction = signal.direction;
  const isLong = direction === 'long';

  // Position sizing
  const maxPositionValue = portfolio.balance * portfolio.max_position_pct;
  const positionValue = Math.min(maxPositionValue, 500); // cap at $500 per trade

  const stopLoss = isLong
    ? entryPrice * (1 - portfolio.stop_loss_pct)
    : entryPrice * (1 + portfolio.stop_loss_pct);
  const takeProfit = isLong
    ? entryPrice * (1 + portfolio.take_profit_pct)
    : entryPrice * (1 - portfolio.take_profit_pct);

  getDb().prepare(`
    INSERT INTO cyclical_trades (asset, direction, entry_price, position_size, stop_loss, take_profit, strategy, reasoning)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(signal.asset, direction, entryPrice, positionValue, stopLoss, takeProfit,
    signal.type || signal.source, signal.reasoning);

  return { asset: signal.asset, direction, entryPrice, positionValue, stopLoss, takeProfit };
}

// ── Main Run ────────────────────────────────────────────────────────────────

async function run() {
  console.log('\n============================================================');
  console.log(`[CYCLICAL TRADER] Run — ${new Date().toISOString()}`);
  console.log('============================================================\n');

  const prices = await fetchPrices();
  if (!prices || Object.keys(prices).length === 0) {
    console.log('No price data — aborting');
    return;
  }

  const portfolio = loadPortfolio();

  // Step 1: Check existing positions
  console.log('[1/3] Checking positions...');
  const closedCount = checkPositions(prices, portfolio);
  const openPositions = getOpenPositions();
  if (closedCount > 0) console.log(`  Closed ${closedCount} positions`);
  if (openPositions.length > 0) {
    for (const p of openPositions) {
      const cur = prices[p.asset]?.price;
      const isLong = p.direction === 'long';
      const pnlPct = cur ? ((isLong ? (cur - p.entry_price) : (p.entry_price - cur)) / p.entry_price * 100) : 0;
      console.log(`  Open: ${p.direction} ${p.asset} @ $${p.entry_price} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%) [${p.strategy}]`);
    }
  } else {
    console.log('  No open positions');
  }

  // Step 2: Generate cyclical signals
  console.log('\n[2/3] Generating cyclical signals...');
  const signals = generateSignals();
  console.log(`  ${signals.length} signals generated`);

  for (const s of signals) {
    console.log(`    ${s.asset} ${s.direction} (${s.type}) str=${s.strength}`);
  }

  // Step 3: Execute trades
  console.log('\n[3/3] Executing trades...');
  let tradesOpened = 0;

  for (const signal of signals) {
    // Log signal
    getDb().prepare(`
      INSERT INTO cyclical_signals_log (asset, direction, strength, strategy, reasoning, action_taken)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(signal.asset, signal.direction, signal.strength, signal.type || signal.source,
      signal.reasoning, 'pending');

    // Skip if already have position on this asset+strategy
    const existing = openPositions.find(p => p.asset === signal.asset && p.strategy === (signal.type || signal.source));
    if (existing) {
      console.log(`  Already have ${signal.asset} [${signal.type}] — skipping`);
      continue;
    }

    // Skip if at max concurrent
    if (openPositions.length + tradesOpened >= portfolio.max_concurrent) {
      console.log(`  Max concurrent (${portfolio.max_concurrent}) reached — skipping ${signal.asset}`);
      continue;
    }

    // Skip weak signals
    if (signal.strength < 0.45) {
      console.log(`  ${signal.asset} strength ${signal.strength} < 0.45 — skipping`);
      continue;
    }

    const result = executeTrade(signal, prices, portfolio);
    if (result) {
      console.log(`  NEW: ${result.direction} ${result.asset} @ $${result.entryPrice}`);
      console.log(`    SL: $${result.stopLoss.toFixed(2)} | TP: $${result.takeProfit.toFixed(2)} | Size: $${result.positionValue.toFixed(2)}`);
      console.log(`    Strategy: ${signal.type} — ${signal.reasoning.substring(0, 80)}`);
      tradesOpened++;
    }
  }

  // Save portfolio
  savePortfolio(portfolio);

  console.log('\n----------------------------------------');
  console.log(`[CYCLICAL TRADER] Run complete`);
  console.log(`Balance: $${portfolio.balance.toFixed(2)} (${portfolio.total_pnl >= 0 ? '+' : ''}$${portfolio.total_pnl.toFixed(2)})`);
  console.log(`Open: ${openPositions.length + tradesOpened} | Closed: ${portfolio.total_trades} | Wins: ${portfolio.wins} | Losses: ${portfolio.losses}`);
  console.log(`Trades opened this run: ${tradesOpened}`);

  if (tradesOpened > 0) {
    await notify(`[CYCLICAL TRADER] ${tradesOpened} new trades opened\nBalance: $${portfolio.balance.toFixed(2)} (${portfolio.total_pnl >= 0 ? '+' : ''}$${portfolio.total_pnl.toFixed(2)})\nOpen: ${openPositions.length + tradesOpened}`);
  }
}

// ── Status Command ──────────────────────────────────────────────────────────

function showStatus() {
  const portfolio = loadPortfolio();
  const open = getOpenPositions();
  const winRate = portfolio.total_trades > 0 ? (portfolio.wins / portfolio.total_trades * 100).toFixed(1) : 'N/A';

  // Per-strategy breakdown
  const stratStats = getDb().prepare(`
    SELECT strategy, COUNT(*) as total,
      SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
      SUM(pnl) as total_pnl
    FROM cyclical_trades WHERE status = 'closed'
    GROUP BY strategy
  `).all();

  console.log(`\n=== CYCLICAL TRADER STATUS ===\n`);
  console.log(`Balance: $${portfolio.balance.toFixed(2)} (${portfolio.total_pnl >= 0 ? '+' : ''}$${portfolio.total_pnl.toFixed(2)})`);
  console.log(`Trades: ${portfolio.total_trades} closed (${portfolio.wins}W/${portfolio.losses}L) — ${winRate}% win rate`);

  if (stratStats.length > 0) {
    console.log('\nPer-strategy P&L:');
    for (const s of stratStats) {
      const wr = s.total > 0 ? (s.wins / s.total * 100).toFixed(0) : 'N/A';
      console.log(`  ${s.strategy}: ${s.total} trades, ${wr}% WR, ${s.total_pnl >= 0 ? '+' : ''}$${(s.total_pnl || 0).toFixed(2)}`);
    }
  }

  if (open.length > 0) {
    console.log(`\nOpen positions: ${open.length}`);
    for (const p of open) {
      console.log(`  ${p.direction} ${p.asset} @ ${p.entry_price} [${p.strategy}] — "${p.reasoning?.substring(0, 60)}..."`);
    }
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────

if (process.argv[2] === 'status') {
  showStatus();
} else {
  run().catch(e => console.error('[cyclical-trader] Fatal:', e));
}
