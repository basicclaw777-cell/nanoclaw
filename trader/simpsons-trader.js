#!/usr/bin/env node
/**
 * simpsons-trader.js — Dedicated Simpsons/Temporal Prediction Experiment
 *
 * Separate from the main trader. Tests ONE question:
 * Do Simpsons temporal correlations predict market moves?
 *
 * Key differences from main trader:
 * - No confluence requirement (testing single signal source)
 * - No bull-bear debate (nothing to debate — empirical test)
 * - Longer time horizons (predictions can be weeks ahead)
 * - Wider stops (timing is approximate)
 * - Maps to CRYPTO (main trader's universe), not stocks
 * - Own portfolio, own DB table, own elimination
 *
 * ESM.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DB_PATH = path.join(__dirname, 'logs', 'trades.db');
const PORTFOLIO_PATH = path.join(__dirname, 'simpsons-portfolio.json');
const WATCHLIST_PATH = path.join(__dirname, '..', 'simpsons-forensics', 'watchlist.json');
const MATCHES_PATH = path.join(__dirname, '..', 'simpsons-forensics', 'matches.json');
const EVENTS_PATH = path.join(__dirname, '..', 'simpsons-forensics', 'events.json');

const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL = process.env.SLACK_TRADING_CHANNEL || 'C0BSL8U56G4';

// ── DB Setup ────────────────────────────────────────────────────────────────

let db;
function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS simpsons_trades (
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
        prediction_claim TEXT,
        prediction_domain TEXT,
        prediction_episode TEXT,
        prediction_specificity INTEGER,
        signal_type TEXT NOT NULL,
        reasoning TEXT
      );

      CREATE TABLE IF NOT EXISTS simpsons_signals_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT (datetime('now')),
        asset TEXT NOT NULL,
        direction TEXT NOT NULL,
        strength REAL,
        prediction_claim TEXT,
        prediction_domain TEXT,
        action_taken TEXT,
        reasoning TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_st_status ON simpsons_trades(status);
      CREATE INDEX IF NOT EXISTS idx_st_signal ON simpsons_trades(signal_type);
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
  max_concurrent: 5,
  max_position_pct: 0.10,
  stop_loss_pct: 0.05,
  take_profit_pct: 0.12,
  stale_days: 7,
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

async function fetchPrices() {
  try {
    const ids = 'bitcoin,ethereum,solana,avalanche-2,chainlink,polkadot,arbitrum,dogecoin,cardano,cosmos,uniswap';
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`;
    const res = await fetch(url);
    const data = await res.json();

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
    return prices;
  } catch (e) {
    console.error(`[simpsons-trader] Price fetch failed: ${e.message}`);
    return null;
  }
}

// ── Domain → Crypto Mapping ─────────────────────────────────────────────────
// Unlike the original simpsons-signal.js which maps to stocks (QQQ, SPY),
// this maps to CRYPTO which is what we actually trade.

const DOMAIN_CRYPTO_MAP = {
  political: [
    { asset: 'BTC', direction: 'long', reasoning: 'Political instability → decentralized asset flight' },
    { asset: 'ETH', direction: 'long', reasoning: 'Political turmoil → smart contract platform demand' },
  ],
  technology: [
    { asset: 'ETH', direction: 'long', reasoning: 'Tech advancement → smart contract platform growth' },
    { asset: 'SOL', direction: 'long', reasoning: 'Tech disruption → high-performance chain demand' },
    { asset: 'LINK', direction: 'long', reasoning: 'Tech infrastructure → oracle network demand' },
  ],
  health: [
    { asset: 'BTC', direction: 'long', reasoning: 'Health crisis → decentralized finance demand' },
    { asset: 'ETH', direction: 'long', reasoning: 'Health crisis → DeFi infrastructure demand' },
  ],
  disaster: [
    { asset: 'BTC', direction: 'long', reasoning: 'Disaster/crisis → safe haven digital asset' },
    { asset: 'BTC', direction: 'short', reasoning: 'Disaster → risk-off, crypto sells with risk assets' },
  ],
  corporate: [
    { asset: 'BTC', direction: 'long', reasoning: 'Corporate distrust → decentralized alternative' },
    { asset: 'ETH', direction: 'short', reasoning: 'Corporate scandal → risk-off across all assets' },
  ],
  cultural: [
    { asset: 'DOGE', direction: 'long', reasoning: 'Cultural moment → meme asset surge' },
    { asset: 'BTC', direction: 'long', reasoning: 'Cultural shift → mainstream crypto adoption' },
  ],
  military: [
    { asset: 'BTC', direction: 'long', reasoning: 'Military conflict → censorship-resistant value store' },
    { asset: 'ETH', direction: 'short', reasoning: 'Military escalation → risk-off selling' },
  ],
  science: [
    { asset: 'ETH', direction: 'long', reasoning: 'Scientific breakthrough → smart contract innovation' },
    { asset: 'LINK', direction: 'long', reasoning: 'Scientific data → oracle network utility' },
  ],
  financial: [
    { asset: 'BTC', direction: 'long', reasoning: 'Financial disruption → Bitcoin as alternative' },
    { asset: 'ETH', direction: 'long', reasoning: 'Financial innovation → DeFi growth' },
    { asset: 'AVAX', direction: 'long', reasoning: 'Financial infrastructure → fast settlement demand' },
  ],
};

// ── Signal Generation ───────────────────────────────────────────────────────

function generateSignals() {
  if (!fs.existsSync(WATCHLIST_PATH)) {
    console.log('[simpsons-trader] No watchlist.json found');
    return [];
  }

  const watchlist = JSON.parse(fs.readFileSync(WATCHLIST_PATH, 'utf8'));
  const matches = fs.existsSync(MATCHES_PATH) ? JSON.parse(fs.readFileSync(MATCHES_PATH, 'utf8')) : [];
  const events = fs.existsSync(EVENTS_PATH) ? JSON.parse(fs.readFileSync(EVENTS_PATH, 'utf8')) : [];

  // Recent real-world events (last 30 days) that might activate predictions
  const recentEvents = events.filter(e => {
    const d = new Date(e.date);
    return (Date.now() - d.getTime()) < 30 * 86400000;
  });

  const signals = [];

  // Score each watchlist prediction
  for (const pred of watchlist) {
    if (!pred.claim || !pred.domain) continue;

    const trades = DOMAIN_CRYPTO_MAP[pred.domain];
    if (!trades) continue;

    let score = 0;
    let activationReason = '';

    // Base score from specificity
    score += (pred.specificity || 1) * 10;

    // Age bonus — older unfulfilled predictions carry more weight
    const airDate = new Date(pred.airDate);
    const ageYears = (Date.now() - airDate.getTime()) / (365.25 * 86400000);
    if (ageYears > 20) score += 15;
    else if (ageYears > 10) score += 10;

    // Check if recent events activate this prediction
    for (const event of recentEvents) {
      if (event.category === pred.domain) {
        score += 20;
        activationReason = `Recent event: "${event.event}" matches prediction domain`;
        break;
      }
    }

    // Check if prediction has partial match history
    const relatedMatch = matches.find(m =>
      m.prediction?.domain === pred.domain &&
      m.status === 'VERIFIED'
    );
    if (relatedMatch) {
      score += 15;
      activationReason += ` | Domain has verified match (anomaly: ${relatedMatch.anomalyScore})`;
    }

    // Normalize strength 0-1
    const strength = Math.min(score / 100, 0.95);

    // Only generate signals above threshold
    if (strength < 0.4) continue;

    for (const trade of trades) {
      signals.push({
        asset: trade.asset,
        direction: trade.direction,
        strength,
        claim: pred.claim,
        domain: pred.domain,
        episode: pred.episode,
        specificity: pred.specificity,
        reasoning: `${trade.reasoning}. Prediction: "${pred.claim}" (${pred.episode}, ${pred.airDate}). ${activationReason}`,
        signal_type: `simpsons_${pred.domain}`,
      });
    }
  }

  // Sort by strength, take top 10
  signals.sort((a, b) => b.strength - a.strength);
  return signals.slice(0, 10);
}

// ── Position Management ─────────────────────────────────────────────────────

function checkPositions(prices, portfolio) {
  const d = getDb();
  const openPositions = d.prepare('SELECT * FROM simpsons_trades WHERE status = ?').all('open');

  if (openPositions.length === 0) {
    console.log('  No open positions');
    return;
  }

  for (const pos of openPositions) {
    const priceData = prices[pos.asset];
    if (!priceData) continue;

    const currentPrice = priceData.price;
    const isLong = pos.direction === 'long';

    const moveFromEntry = isLong
      ? (currentPrice - pos.entry_price) / pos.entry_price
      : (pos.entry_price - currentPrice) / pos.entry_price;

    // Check stop-loss
    const hitSL = isLong ? currentPrice <= pos.stop_loss : currentPrice >= pos.stop_loss;
    // Check take-profit
    const hitTP = isLong ? currentPrice >= pos.take_profit : currentPrice <= pos.take_profit;
    // Stale exit
    const daysOpen = (Date.now() - new Date(pos.opened_at).getTime()) / 86400000;
    const isStale = daysOpen >= portfolio.stale_days && moveFromEntry < 0.02;

    if (hitSL || hitTP || isStale) {
      const pnl = isLong
        ? (currentPrice - pos.entry_price) * pos.position_size
        : (pos.entry_price - currentPrice) * pos.position_size;
      const pnlPct = moveFromEntry * (pnl >= 0 ? 1 : -1);

      d.prepare(`
        UPDATE simpsons_trades SET closed_at = datetime('now'), exit_price = ?, status = 'closed', pnl = ?, pnl_pct = ?
        WHERE id = ?
      `).run(currentPrice, pnl, pnlPct, pos.id);

      portfolio.balance += pnl;
      portfolio.total_pnl += pnl;
      portfolio.total_trades++;
      if (pnl >= 0) portfolio.wins++; else portfolio.losses++;

      const reason = hitSL ? 'STOP-LOSS' : hitTP ? 'TAKE-PROFIT' : 'STALE-EXIT';
      console.log(`  CLOSED ${pos.direction} ${pos.asset} @ ${currentPrice} (${reason}) PnL: $${pnl.toFixed(2)} (${(pnlPct * 100).toFixed(1)}%)`);
      notify(`[SIMPSONS] Closed ${pos.direction} ${pos.asset} @ $${currentPrice}\n${reason} | PnL: $${pnl.toFixed(2)}\nPrediction: "${pos.prediction_claim}"`);
    } else {
      const unrealised = isLong
        ? (currentPrice - pos.entry_price) * pos.position_size
        : (pos.entry_price - currentPrice) * pos.position_size;
      console.log(`  ${pos.asset} ${pos.direction}: ${pos.entry_price} → ${currentPrice} | $${unrealised.toFixed(2)} (${(moveFromEntry * 100).toFixed(1)}%) | "${pos.prediction_claim?.substring(0, 40)}..."`);
    }
  }
}

// ── Trade Execution ─────────────────────────────────────────────────────────

function executeTrade(signal, price, portfolio) {
  const d = getDb();

  // Check if already have position on this asset
  const existing = d.prepare('SELECT * FROM simpsons_trades WHERE asset = ? AND status = ?').get(signal.asset, 'open');
  if (existing) {
    console.log(`  Already have ${signal.asset} position — skipping`);
    return null;
  }

  // Check max concurrent
  const openCount = d.prepare('SELECT COUNT(*) as c FROM simpsons_trades WHERE status = ?').get('open').c;
  if (openCount >= portfolio.max_concurrent) {
    console.log(`  Max ${portfolio.max_concurrent} positions reached — skipping`);
    return null;
  }

  const isLong = signal.direction === 'long';
  const positionValue = portfolio.balance * portfolio.max_position_pct;
  const positionSize = positionValue / price;
  const stopLoss = isLong
    ? price * (1 - portfolio.stop_loss_pct)
    : price * (1 + portfolio.stop_loss_pct);
  const takeProfit = isLong
    ? price * (1 + portfolio.take_profit_pct)
    : price * (1 - portfolio.take_profit_pct);

  d.prepare(`
    INSERT INTO simpsons_trades (asset, direction, entry_price, position_size, stop_loss, take_profit,
      prediction_claim, prediction_domain, prediction_episode, prediction_specificity, signal_type, reasoning)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    signal.asset, signal.direction, price, positionSize, stopLoss, takeProfit,
    signal.claim, signal.domain, signal.episode, signal.specificity,
    signal.signal_type, signal.reasoning
  );

  // Log signal
  d.prepare(`
    INSERT INTO simpsons_signals_log (asset, direction, strength, prediction_claim, prediction_domain, action_taken, reasoning)
    VALUES (?, ?, ?, ?, ?, 'OPENED', ?)
  `).run(signal.asset, signal.direction, signal.strength, signal.claim, signal.domain, signal.reasoning);

  console.log(`  NEW: ${signal.direction} ${signal.asset} @ $${price}`);
  console.log(`    SL: $${stopLoss.toFixed(2)} | TP: $${takeProfit.toFixed(2)} | Size: $${positionValue.toFixed(2)}`);
  console.log(`    Prediction: "${signal.claim}"`);

  return { asset: signal.asset, direction: signal.direction, price };
}

// ── Slack ────────────────────────────────────────────────────────────────

async function notify(msg) {
  console.log('[notify]', msg);
  if (!SLACK_TOKEN) return;
  try {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SLACK_TOKEN}` },
      body: JSON.stringify({ channel: SLACK_CHANNEL, text: msg }),
    });
  } catch (e) {}
}

// ── Performance Report ──────────────────────────────────────────────────────

function getPerformance() {
  const d = getDb();
  const perf = d.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END) as losses,
      ROUND(SUM(pnl), 2) as total_pnl,
      ROUND(AVG(pnl), 2) as avg_pnl
    FROM simpsons_trades WHERE status = 'closed'
  `).get();

  const byDomain = d.prepare(`
    SELECT prediction_domain as domain,
      COUNT(*) as trades,
      SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
      ROUND(SUM(pnl), 2) as pnl
    FROM simpsons_trades WHERE status = 'closed'
    GROUP BY prediction_domain ORDER BY pnl DESC
  `).all();

  const byType = d.prepare(`
    SELECT signal_type,
      COUNT(*) as trades,
      SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
      ROUND(SUM(pnl), 2) as pnl
    FROM simpsons_trades WHERE status = 'closed'
    GROUP BY signal_type ORDER BY pnl DESC
  `).all();

  const open = d.prepare('SELECT * FROM simpsons_trades WHERE status = ?').all('open');

  return { overall: perf, byDomain, byType, open };
}

// ── Main Run ────────────────────────────────────────────────────────────────

async function run() {
  console.log('\n' + '='.repeat(60));
  console.log(`[SIMPSONS TRADER] Run — ${new Date().toISOString()}`);
  console.log('='.repeat(60) + '\n');

  const portfolio = loadPortfolio();
  const prices = await fetchPrices();
  if (!prices) {
    console.log('[ABORT] No price data');
    return;
  }

  // Step 1: Check positions
  console.log('[1/3] Checking positions...');
  checkPositions(prices, portfolio);

  // Step 2: Generate signals
  console.log('\n[2/3] Generating Simpsons signals...');
  const signals = generateSignals();
  console.log(`  ${signals.length} signals generated`);

  // Step 3: Execute trades (no debate, no confluence — direct test)
  console.log('\n[3/3] Executing trades...');
  let opened = 0;
  for (const signal of signals) {
    const priceData = prices[signal.asset];
    if (!priceData) continue;

    const result = executeTrade(signal, priceData.price, portfolio);
    if (result) {
      opened++;
      await notify(
        `[SIMPSONS] New ${signal.direction} ${signal.asset} @ $${priceData.price}\n` +
        `Prediction: "${signal.claim}"\n` +
        `Domain: ${signal.domain} | Strength: ${signal.strength.toFixed(2)}`
      );
    }
  }

  // Save portfolio
  savePortfolio(portfolio);

  // Summary
  const perf = getPerformance();
  console.log('\n' + '-'.repeat(40));
  console.log(`[SIMPSONS TRADER] Run complete`);
  console.log(`Balance: $${portfolio.balance.toFixed(2)} (${portfolio.total_pnl >= 0 ? '+' : ''}$${portfolio.total_pnl.toFixed(2)})`);
  console.log(`Open: ${perf.open.length} | Closed: ${perf.overall.total || 0} | Wins: ${perf.overall.wins || 0} | Losses: ${perf.overall.losses || 0}`);
  console.log(`Trades opened this run: ${opened}`);
  console.log();
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const arg = process.argv[2];

if (arg === 'status') {
  getDb();
  const portfolio = loadPortfolio();
  const perf = getPerformance();
  console.log('\n=== SIMPSONS TRADER STATUS ===\n');
  console.log(`Balance: $${portfolio.balance.toFixed(2)} (${portfolio.total_pnl >= 0 ? '+' : ''}$${portfolio.total_pnl.toFixed(2)})`);
  console.log(`Trades: ${perf.overall.total || 0} closed (${perf.overall.wins || 0}W/${perf.overall.losses || 0}L)`);
  if (perf.overall.total) {
    console.log(`Win rate: ${(100 * perf.overall.wins / perf.overall.total).toFixed(1)}%`);
    console.log(`Avg PnL: $${perf.overall.avg_pnl}`);
  }
  console.log(`\nOpen positions: ${perf.open.length}`);
  for (const p of perf.open) {
    console.log(`  ${p.direction} ${p.asset} @ ${p.entry_price} — "${p.prediction_claim?.substring(0, 50)}..."`);
  }
  if (perf.byDomain.length) {
    console.log(`\nBy domain:`);
    for (const d of perf.byDomain) {
      console.log(`  ${d.domain}: ${d.trades} trades, ${d.wins}W, $${d.pnl}`);
    }
  }
} else {
  run().catch(console.error);
}
