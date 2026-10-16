#!/usr/bin/env node
/**
 * benchmark.js — The control group.
 *
 * Answers: "Would doing nothing have been better?"
 *
 * Tracks buy-and-hold BTC from each trader's start date.
 * Compares every trader's P&L against the simplest possible strategy.
 * Also tracks top Binance futures leaderboard + aggregate funding rates
 * to see what the crowd is doing vs what we're doing.
 *
 * Run: node benchmark.js
 * Cron: runs alongside cyclical-trader on the same schedule.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BENCHMARK_PATH = path.join(__dirname, 'benchmark-state.json');
const SIGNALS_PATH = path.join(__dirname, 'signals', 'crypto-signals-latest.json');

function fetch(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'cathedral-benchmark/1.0' } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetch(res.headers.location).then(resolve).catch(reject);
      }
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch { resolve(d); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function loadState() {
  if (fs.existsSync(BENCHMARK_PATH)) {
    return JSON.parse(fs.readFileSync(BENCHMARK_PATH, 'utf8'));
  }
  return {
    traders: {},
    snapshots: [],
    funding_history: [],
    created_at: new Date().toISOString(),
  };
}

function saveState(state) {
  state.last_updated = new Date().toISOString();
  fs.writeFileSync(BENCHMARK_PATH, JSON.stringify(state, null, 2));
}

function getCurrentPrices() {
  if (!fs.existsSync(SIGNALS_PATH)) return null;
  const sigs = JSON.parse(fs.readFileSync(SIGNALS_PATH, 'utf8'));
  return sigs.prices || null;
}

// Get BTC price at a historical date via CoinGecko
async function getHistoricalPrice(coinId, date) {
  // date format: dd-mm-yyyy
  const url = `https://api.coingecko.com/api/v3/coins/${coinId}/history?date=${date}&localization=false`;
  try {
    const data = await fetch(url);
    return data?.market_data?.current_price?.usd || null;
  } catch {
    return null;
  }
}

function formatDate(isoStr) {
  const d = new Date(isoStr);
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

// Load each trader's portfolio
function loadTraders() {
  const configs = [
    { id: 'main', file: 'portfolio.json', balanceKey: 'balance', startKey: 'initial_balance', dateKey: 'trial_start' },
    { id: 'cyclical', file: 'cyclical-portfolio.json', balanceKey: 'balance', startKey: 'start_balance', dateKey: 'started_at' },
    { id: 'simpsons', file: 'simpsons-portfolio.json', balanceKey: 'balance', startKey: 'start_balance', dateKey: 'started_at' },
  ];

  const traders = {};
  for (const c of configs) {
    try {
      const p = JSON.parse(fs.readFileSync(path.join(__dirname, c.file), 'utf8'));
      traders[c.id] = {
        balance: p[c.balanceKey],
        start_balance: p[c.startKey],
        start_date: p[c.dateKey],
        total_pnl: p.total_pnl || (p[c.balanceKey] - p[c.startKey]),
        wins: p.wins || 0,
        losses: p.losses || 0,
        total_trades: p.total_trades || 0,
      };
    } catch { /* skip */ }
  }
  return traders;
}

// Fetch Binance aggregate funding rate
async function getFundingRate() {
  try {
    const data = await fetch('https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1');
    if (Array.isArray(data) && data.length > 0) {
      return {
        rate: parseFloat(data[0].fundingRate),
        time: data[0].fundingTime,
        interpretation: parseFloat(data[0].fundingRate) > 0.0001
          ? 'CROWD_LONG'
          : parseFloat(data[0].fundingRate) < -0.0001
            ? 'CROWD_SHORT'
            : 'NEUTRAL',
      };
    }
  } catch { /* */ }
  return null;
}

// Fetch Binance open interest
async function getOpenInterest() {
  try {
    const data = await fetch('https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT');
    return data ? { oi: parseFloat(data.openInterest), symbol: 'BTCUSDT' } : null;
  } catch { return null; }
}

// Fetch top Binance leaderboard (public endpoint — limited)
async function getLeaderboardSnapshot() {
  try {
    const data = await fetch('https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=BTCUSDT');
    if (data) {
      return {
        btc_24h_volume: parseFloat(data.quoteVolume),
        btc_24h_change_pct: parseFloat(data.priceChangePercent),
        long_short_ratio: null, // requires authenticated endpoint
      };
    }
  } catch { /* */ }
  return null;
}

// Fetch long/short ratio
async function getLongShortRatio() {
  try {
    const data = await fetch('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=1');
    if (Array.isArray(data) && data.length > 0) {
      const ratio = parseFloat(data[0].longShortRatio);
      return {
        ratio,
        long_pct: parseFloat(data[0].longAccount) * 100,
        short_pct: parseFloat(data[0].shortAccount) * 100,
        interpretation: ratio > 1.5 ? 'HEAVILY_LONG' : ratio < 0.67 ? 'HEAVILY_SHORT' : ratio > 1.1 ? 'LEANING_LONG' : ratio < 0.9 ? 'LEANING_SHORT' : 'BALANCED',
      };
    }
  } catch { /* */ }
  return null;
}

async function run() {
  console.log('\n============================================================');
  console.log(`[BENCHMARK] Run — ${new Date().toISOString()}`);
  console.log('============================================================\n');

  const state = loadState();
  const prices = getCurrentPrices();
  if (!prices || !prices.BTC) {
    console.log('No price data — aborting');
    return;
  }
  const btcNow = prices.BTC.price;
  console.log(`BTC now: $${btcNow}`);

  // ── Load traders ──
  const traders = loadTraders();

  // ── Initialize benchmarks for new traders ──
  for (const [id, t] of Object.entries(traders)) {
    if (!state.traders[id] && t.start_date && t.start_balance) {
      const dateStr = formatDate(t.start_date);
      console.log(`\nInitializing benchmark for ${id} (started ${dateStr})...`);

      const startPrice = await getHistoricalPrice('bitcoin', dateStr);
      if (startPrice) {
        const btcQty = t.start_balance / startPrice;
        state.traders[id] = {
          start_date: t.start_date,
          start_balance: t.start_balance,
          btc_start_price: startPrice,
          btc_qty_if_held: btcQty,
        };
        console.log(`  BTC was $${startPrice} on ${dateStr} — $${t.start_balance} would buy ${btcQty.toFixed(6)} BTC`);
      } else {
        console.log(`  Could not fetch historical price for ${dateStr} — will retry`);
      }
    }
  }

  // ── Compute benchmarks ──
  console.log('\n--- TRADER vs BUY-AND-HOLD ---');
  console.log('');

  for (const [id, t] of Object.entries(traders)) {
    const bench = state.traders[id];
    if (!bench) continue;

    const holdValue = bench.btc_qty_if_held * btcNow;
    const holdPnl = holdValue - bench.start_balance;
    const holdPct = (holdPnl / bench.start_balance) * 100;

    const traderPnl = t.total_pnl || 0;
    const traderPct = (traderPnl / bench.start_balance) * 100;

    const diff = traderPnl - holdPnl;
    const diffEmoji = diff > 0 ? 'BEATING' : 'LOSING TO';

    console.log(`${id.toUpperCase()}:`);
    console.log(`  Trader:     $${t.balance.toFixed(2)} (${traderPnl >= 0 ? '+' : ''}$${traderPnl.toFixed(2)} / ${traderPct >= 0 ? '+' : ''}${traderPct.toFixed(1)}%)  ${t.wins}W/${t.losses}L`);
    console.log(`  Buy & Hold: $${holdValue.toFixed(2)} (${holdPnl >= 0 ? '+' : ''}$${holdPnl.toFixed(2)} / ${holdPct >= 0 ? '+' : ''}${holdPct.toFixed(1)}%)`);
    console.log(`  Verdict:    ${diffEmoji} buy-and-hold by $${Math.abs(diff).toFixed(2)}`);
    console.log('');
  }

  // ── Market sentiment snapshot ──
  console.log('--- WHAT THE CROWD IS DOING ---');

  const [funding, oi, market, lsRatio] = await Promise.all([
    getFundingRate(),
    getOpenInterest(),
    getLeaderboardSnapshot(),
    getLongShortRatio(),
  ]);

  if (funding) {
    console.log(`  Funding rate: ${(funding.rate * 100).toFixed(4)}% → ${funding.interpretation}`);
  }
  if (lsRatio) {
    console.log(`  Long/Short:   ${lsRatio.ratio.toFixed(2)} (${lsRatio.long_pct.toFixed(1)}%L / ${lsRatio.short_pct.toFixed(1)}%S) → ${lsRatio.interpretation}`);
  }
  if (oi) {
    console.log(`  Open Interest: ${(parseFloat(oi.oi)).toLocaleString()} BTC`);
  }
  if (market) {
    console.log(`  BTC 24h:      ${market.btc_24h_change_pct >= 0 ? '+' : ''}${market.btc_24h_change_pct.toFixed(2)}% | Vol: $${(market.btc_24h_volume / 1e9).toFixed(2)}B`);
  }

  // ── Our positioning vs crowd ──
  const ourDirection = 'SHORT'; // all cyclical positions are short right now
  const crowdDirection = lsRatio?.interpretation || funding?.interpretation || 'UNKNOWN';
  console.log(`\n  Us: ${ourDirection} | Crowd: ${crowdDirection}`);
  if (crowdDirection.includes('LONG') && ourDirection === 'SHORT') {
    console.log('  ⚠ We are AGAINST the crowd — contrarian position');
  } else if (crowdDirection.includes('SHORT') && ourDirection === 'SHORT') {
    console.log('  We are WITH the crowd — consensus position');
  }

  // ── Save snapshot ──
  state.snapshots.push({
    timestamp: new Date().toISOString(),
    btc_price: btcNow,
    funding: funding?.rate || null,
    long_short_ratio: lsRatio?.ratio || null,
    open_interest: oi?.oi || null,
    traders: Object.fromEntries(
      Object.entries(traders).map(([id, t]) => {
        const bench = state.traders[id];
        const holdValue = bench ? bench.btc_qty_if_held * btcNow : null;
        return [id, {
          balance: t.balance,
          pnl: t.total_pnl,
          hold_value: holdValue,
          hold_pnl: holdValue ? holdValue - bench.start_balance : null,
        }];
      })
    ),
  });

  // Keep last 90 snapshots (~3 months daily)
  if (state.snapshots.length > 90) {
    state.snapshots = state.snapshots.slice(-90);
  }

  if (funding) {
    state.funding_history.push({
      timestamp: new Date().toISOString(),
      rate: funding.rate,
      interpretation: funding.interpretation,
    });
    if (state.funding_history.length > 180) {
      state.funding_history = state.funding_history.slice(-180);
    }
  }

  saveState(state);
  console.log(`\n[BENCHMARK] State saved → ${BENCHMARK_PATH}`);
}

run().catch(console.error);
