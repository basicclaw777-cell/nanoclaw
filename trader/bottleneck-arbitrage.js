#!/usr/bin/env node
/**
 * bottleneck-arbitrage.js — Strategy: 13F Bottleneck Arbitrage
 *
 * Thesis: AI infrastructure bottleneck owners outperform the obvious plays.
 * Method: Clone 13F filings → convert CAPEX to physical units → find bottleneck →
 * weight portfolio toward bottleneck owners, not the crowd favorites.
 *
 * Source: Leopold Aschenbrenner's Situational Awareness LP (CIK 0002045724)
 * Market: US equities (paper trading only — Phase 0)
 *
 * Own portfolio, own DB table, own P&L. Runs weekly (13F filings are quarterly,
 * but price tracking is daily).
 *
 * ESM.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DB_PATH = path.join(__dirname, 'logs', 'trades.db');
const PORTFOLIO_PATH = path.join(__dirname, 'bottleneck-portfolio.json');
const HOLDINGS_PATH = path.join(__dirname, 'signals', 'sa-13f-holdings.json');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const PAPER_BALANCE = 100000;

const BOTTLENECK_LAYERS = {
  'MEMORY': {
    tickers: ['WDC', 'MU', 'STM'],
    thesis: 'HBM is the binding constraint for this AI cycle. 3 producers control 100%.',
    bottleneck_score: 0.9,
  },
  'POWER_GRID': {
    tickers: ['BE', 'BWC', 'KEI'],
    thesis: 'Grid connection queue: 2600 GW, 4-5 year wait. Cannot be bought faster.',
    bottleneck_score: 1.0,
  },
  'FAB_CAPACITY': {
    tickers: ['TSM'],
    thesis: 'Only 3 companies on Earth make advanced chips. TSMC is the one.',
    bottleneck_score: 0.85,
  },
  'DATA_CENTER_INFRA': {
    tickers: ['NBIS', 'CRWV', 'CORZ', 'APLD'],
    thesis: 'GPU hosts need power + land + grid before GPUs matter.',
    bottleneck_score: 0.7,
  },
  'MINING_POWER_PROXY': {
    tickers: ['RIOT', 'IREN', 'CLSK', 'BTDR', 'HIVE'],
    thesis: 'BTC miners own secured grid + land. AI companies will lease at premium.',
    bottleneck_score: 0.75,
  },
};

const TICKER_MAP = {
  'SANDISK CORP': 'WDC',
  'MICRON TECHNOLOGY INC': 'MU',
  'BLOOM ENERGY CORP': 'BE',
  'TAIWAN SEMICONDUCTOR MANUFAC': 'TSM',
  'NEBIUS GROUP N.V.': 'NBIS',
  'COREWEAVE INC': 'CRWV',
  'CORE SCIENTIFIC INC NEW': 'CORZ',
  'STMICROELECTRONICS': 'STM',
  'APPLIED DIGITAL CORP': 'APLD',
  'RIOT PLATFORMS INC': 'RIOT',
  'SHARONAI HOLDINGS INC': 'SHAR',
  'IREN LIMITED': 'IREN',
  'CLEANSPARK INC': 'CLSK',
  'KEEL INFRASTRUCTURE CORP': 'KEI',
  'SOLARIS ENERGY INFRAS INC': 'SEI',
  'WHITEFIBER INC': 'WFBR',
  'BITDEER TECHNOLOGIES GROUP': 'BTDR',
  'T1 ENERGY INC': 'TONE',
  'HIVE DIGITAL TECHNOLOGIES LT': 'HIVE',
  'BABCOCK & WILCOX ENTERPRISES': 'BWC',
  'PROPETRO HLDG CORP': 'PUMP',
  'VISHAY INTERTECHNOLOGY INC': 'VSH',
  'CEREBRAS SYSTEMS INC': 'CBRS',
};

// ── DB Setup ────────────────────────────────────────────────────────────────

let db;
function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS bottleneck_positions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        opened_at TEXT DEFAULT (datetime('now')),
        closed_at TEXT,
        ticker TEXT NOT NULL,
        layer TEXT NOT NULL,
        entry_price REAL NOT NULL,
        exit_price REAL,
        shares REAL NOT NULL,
        allocation_pct REAL NOT NULL,
        status TEXT DEFAULT 'open',
        pnl REAL,
        pnl_pct REAL,
        reasoning TEXT
      );

      CREATE TABLE IF NOT EXISTS bottleneck_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT (datetime('now')),
        filing_date TEXT,
        portfolio_value REAL,
        layer_breakdown TEXT,
        top_holding TEXT,
        bottleneck_verdict TEXT
      );

      CREATE TABLE IF NOT EXISTS bottleneck_prices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT (datetime('now')),
        ticker TEXT NOT NULL,
        price REAL NOT NULL,
        source TEXT DEFAULT 'coingecko'
      );
    `);
  }
  return db;
}

// ── Portfolio Management ────────────────────────────────────────────────────

function loadPortfolio() {
  if (fs.existsSync(PORTFOLIO_PATH)) {
    return JSON.parse(fs.readFileSync(PORTFOLIO_PATH, 'utf8'));
  }
  const initial = {
    balance: PAPER_BALANCE,
    initial_balance: PAPER_BALANCE,
    total_pnl: 0,
    total_trades: 0,
    wins: 0,
    losses: 0,
    last_rebalance: null,
    last_13f_pull: null,
    filing_period: null,
    positions: {},
    layer_exposure: {},
  };
  fs.writeFileSync(PORTFOLIO_PATH, JSON.stringify(initial, null, 2));
  return initial;
}

function savePortfolio(portfolio) {
  portfolio.last_run = new Date().toISOString();
  fs.writeFileSync(PORTFOLIO_PATH, JSON.stringify(portfolio, null, 2));
}

// ── SEC EDGAR 13F Fetcher ───────────────────────────────────────────────────

function secFetch(url) {
  return new Promise((resolve, reject) => {
    const options = new URL(url);
    const req = https.request({
      hostname: options.hostname,
      path: options.pathname + options.search,
      method: 'GET',
      headers: { 'User-Agent': 'Cathedral Research basicclaw777@gmail.com' },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) resolve(data);
        else reject(new Error(`SEC returned ${res.statusCode}`));
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('SEC timeout')); });
    req.end();
  });
}

async function pull13F() {
  console.log('[13F] Pulling latest filing from SEC EDGAR...');

  const submissionsRaw = await secFetch(
    'https://data.sec.gov/submissions/CIK0002045724.json'
  );
  const submissions = JSON.parse(submissionsRaw);
  const filings = submissions.filings.recent;

  let latestIdx = -1;
  for (let i = 0; i < filings.form.length; i++) {
    if (filings.form[i] === '13F-HR') { latestIdx = i; break; }
  }
  if (latestIdx === -1) throw new Error('No 13F-HR filing found');

  const accession = filings.accessionNumber[latestIdx].replace(/-/g, '');
  const accessionDash = filings.accessionNumber[latestIdx];
  const filingDate = filings.filingDate[latestIdx];

  console.log(`[13F] Latest: ${filingDate} (accession: ${accessionDash})`);

  const xmlRaw = await secFetch(
    `https://www.sec.gov/Archives/edgar/data/2045724/${accession}/form13fInfoTable.xml`
  );

  const holdings = [];
  const regex = /<ns1:infoTable[^>]*>([\s\S]*?)<\/ns1:infoTable>/gi;
  let match;
  while ((match = regex.exec(xmlRaw)) !== null) {
    const block = match[1];
    const get = (tag) => {
      const m = block.match(new RegExp(`<ns1:${tag}[^>]*>([^<]+)</ns1:${tag}>`, 'i'));
      return m ? m[1].trim() : null;
    };
    const putCall = get('putCall');
    if (putCall) continue;

    const name = get('nameOfIssuer') || '?';
    const value = parseInt(get('value') || '0', 10);
    const shares = parseInt(get('sshPrnamt') || '0', 10);
    holdings.push({ name, value_thousands: value, shares });
  }

  if (holdings.length === 0) {
    const regexNoNs = /<infoTable>([\s\S]*?)<\/infoTable>/gi;
    while ((match = regexNoNs.exec(xmlRaw)) !== null) {
      const block = match[1];
      const get = (tag) => {
        const m = block.match(new RegExp(`<${tag}>([^<]+)</${tag}>`, 'i'));
        return m ? m[1].trim() : null;
      };
      const putCall = get('putCall');
      if (putCall) continue;
      const name = get('nameOfIssuer') || '?';
      const value = parseInt(get('value') || '0', 10);
      const shares = parseInt(get('sshPrnamt') || '0', 10);
      holdings.push({ name, value_thousands: value, shares });
    }
  }

  const totalValue = holdings.reduce((s, h) => s + h.value_thousands, 0);

  const result = {
    filing_date: filingDate,
    period: filings.reportDate?.[latestIdx] || 'unknown',
    holdings: holdings.map(h => ({
      ...h,
      ticker: TICKER_MAP[h.name] || null,
      pct: totalValue > 0 ? +(h.value_thousands / totalValue * 100).toFixed(2) : 0,
    })),
    total_value_thousands: totalValue,
  };

  fs.writeFileSync(HOLDINGS_PATH, JSON.stringify(result, null, 2));
  console.log(`[13F] ${holdings.length} long positions, total $${(totalValue * 1000).toLocaleString()}`);
  return result;
}

// ── Price Fetcher (Yahoo Finance via query) ─────────────────────────────────

async function fetchPrice(ticker) {
  try {
    const raw = await secFetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`
    );
    const data = JSON.parse(raw);
    const closes = data.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
    if (closes && closes.length > 0) {
      const price = closes[closes.length - 1];
      if (price) return price;
    }
  } catch (e) {
    console.log(`  [price] ${ticker}: Yahoo failed (${e.message}), trying backup...`);
  }

  try {
    const raw = await secFetch(
      `https://www.google.com/finance/quote/${ticker}:NASDAQ`
    );
    const match = raw.match(/data-last-price="([0-9.]+)"/);
    if (match) return parseFloat(match[1]);
  } catch (e) {
    // silent
  }

  return null;
}

async function fetchAllPrices(tickers) {
  const prices = {};
  for (const ticker of tickers) {
    const price = await fetchPrice(ticker);
    if (price) {
      prices[ticker] = price;
      getDb().prepare(
        'INSERT INTO bottleneck_prices (ticker, price, source) VALUES (?, ?, ?)'
      ).run(ticker, price, 'yahoo');
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return prices;
}

// ── Bottleneck Analysis ─────────────────────────────────────────────────────

function analyzeBottleneck(holdings) {
  const layers = {};

  for (const [layer, config] of Object.entries(BOTTLENECK_LAYERS)) {
    const layerHoldings = holdings.filter(h => config.tickers.includes(h.ticker));
    const layerPct = layerHoldings.reduce((s, h) => s + h.pct, 0);
    layers[layer] = {
      pct: +layerPct.toFixed(2),
      tickers: layerHoldings.map(h => h.ticker),
      bottleneck_score: config.bottleneck_score,
      weighted_conviction: +(layerPct * config.bottleneck_score / 100).toFixed(4),
      thesis: config.thesis,
    };
  }

  const sorted = Object.entries(layers).sort((a, b) =>
    b[1].weighted_conviction - a[1].weighted_conviction
  );

  return {
    layers,
    verdict: sorted[0][0],
    verdict_detail: sorted[0][1].thesis,
    sorted: sorted.map(([k, v]) => `${k}: ${v.pct}% (score: ${v.bottleneck_score})`),
  };
}

// ── Portfolio Sizing ────────────────────────────────────────────────────────

function sizePortfolio(holdings, balance) {
  const allocations = {};
  const tickerHoldings = holdings.filter(h => h.ticker);
  const totalPct = tickerHoldings.reduce((s, h) => s + h.pct, 0);

  for (const h of tickerHoldings) {
    const normalizedPct = totalPct > 0 ? h.pct / totalPct * 100 : 0;
    allocations[h.ticker] = {
      pct: +normalizedPct.toFixed(2),
      dollar_amount: +(balance * normalizedPct / 100).toFixed(2),
      name: h.name,
    };
  }

  return allocations;
}

// ── Telegram Notification ───────────────────────────────────────────────────

async function notify(msg) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const text = encodeURIComponent(msg);
  try {
    await secFetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=${text}&parse_mode=Markdown`
    );
  } catch (e) {
    console.error('[telegram]', e.message);
  }
}

// ── Main Run ────────────────────────────────────────────────────────────────

async function run() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  BOTTLENECK ARBITRAGE — Paper Trading    ║');
  console.log('╚══════════════════════════════════════════╝');

  const portfolio = loadPortfolio();
  const now = new Date();

  // Pull 13F if never pulled or older than 30 days
  let holdings;
  const daysSincePull = portfolio.last_13f_pull
    ? (now - new Date(portfolio.last_13f_pull)) / 86400000
    : Infinity;

  if (daysSincePull > 30 || !fs.existsSync(HOLDINGS_PATH)) {
    const filing = await pull13F();
    holdings = filing.holdings;
    portfolio.last_13f_pull = now.toISOString();
    portfolio.filing_period = filing.period;
    console.log(`[13F] Fresh pull: ${holdings.length} positions`);
  } else {
    const cached = JSON.parse(fs.readFileSync(HOLDINGS_PATH, 'utf8'));
    holdings = cached.holdings || cached.longs?.map(h => ({
      ...h, ticker: TICKER_MAP[h.name] || null,
      pct: cached.long_total_thousands > 0
        ? +(h.value_thousands / cached.long_total_thousands * 100).toFixed(2) : 0,
    })) || [];
    console.log(`[13F] Using cached data (${daysSincePull.toFixed(0)} days old)`);
  }

  // Bottleneck analysis
  const bottleneck = analyzeBottleneck(holdings);
  console.log('\n[BOTTLENECK ANALYSIS]');
  console.log(`  Verdict: ${bottleneck.verdict}`);
  for (const line of bottleneck.sorted) console.log(`  ${line}`);

  // Get all tickers we track
  const allTickers = [...new Set(holdings.filter(h => h.ticker).map(h => h.ticker))];
  console.log(`\n[PRICES] Fetching ${allTickers.length} tickers...`);
  const prices = await fetchAllPrices(allTickers);
  const pricedCount = Object.keys(prices).length;
  console.log(`[PRICES] Got ${pricedCount}/${allTickers.length} prices`);

  if (pricedCount === 0) {
    console.log('[ABORT] No prices available. Skipping rebalance.');
    savePortfolio(portfolio);
    return;
  }

  // Size the portfolio
  const allocations = sizePortfolio(holdings, portfolio.balance);

  // Check if rebalance needed (first run or weekly)
  const daysSinceRebalance = portfolio.last_rebalance
    ? (now - new Date(portfolio.last_rebalance)) / 86400000
    : Infinity;

  if (daysSinceRebalance >= 7 || Object.keys(portfolio.positions).length === 0) {
    console.log('\n[REBALANCE] Opening/adjusting positions...');

    // Close any positions for tickers no longer in the 13F
    for (const [ticker, pos] of Object.entries(portfolio.positions)) {
      if (!allocations[ticker] && prices[ticker]) {
        const pnl = (prices[ticker] - pos.entry_price) * pos.shares;
        const pnlPct = (prices[ticker] - pos.entry_price) / pos.entry_price;
        portfolio.balance += pos.dollar_amount + pnl;
        portfolio.total_pnl += pnl;
        portfolio.total_trades++;
        if (pnl >= 0) portfolio.wins++; else portfolio.losses++;

        getDb().prepare(`
          INSERT INTO bottleneck_positions (ticker, layer, entry_price, exit_price, shares, allocation_pct, status, pnl, pnl_pct, reasoning, closed_at)
          VALUES (?, ?, ?, ?, ?, ?, 'closed', ?, ?, ?, datetime('now'))
        `).run(ticker, pos.layer || '?', pos.entry_price, prices[ticker], pos.shares, pos.pct, pnl, pnlPct, 'Removed from 13F');

        console.log(`  CLOSED ${ticker}: $${pnl.toFixed(2)} (${(pnlPct * 100).toFixed(1)}%) — dropped from filing`);
        delete portfolio.positions[ticker];
      }
    }

    // Open or adjust positions
    for (const [ticker, alloc] of Object.entries(allocations)) {
      if (!prices[ticker]) {
        console.log(`  SKIP ${ticker}: no price`);
        continue;
      }

      const price = prices[ticker];
      const shares = +(alloc.dollar_amount / price).toFixed(4);
      const layer = Object.entries(BOTTLENECK_LAYERS)
        .find(([, v]) => v.tickers.includes(ticker))?.[0] || 'OTHER';

      if (portfolio.positions[ticker]) {
        portfolio.positions[ticker].current_price = price;
        portfolio.positions[ticker].current_value = +(shares * price).toFixed(2);
        portfolio.positions[ticker].unrealized_pnl = +((price - portfolio.positions[ticker].entry_price) * portfolio.positions[ticker].shares).toFixed(2);
      } else {
        portfolio.positions[ticker] = {
          entry_price: price,
          shares,
          dollar_amount: alloc.dollar_amount,
          pct: alloc.pct,
          layer,
          name: alloc.name,
          opened_at: now.toISOString(),
          current_price: price,
          current_value: alloc.dollar_amount,
          unrealized_pnl: 0,
        };

        getDb().prepare(`
          INSERT INTO bottleneck_positions (ticker, layer, entry_price, shares, allocation_pct, reasoning)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(ticker, layer, price, shares, alloc.pct, `13F clone: ${alloc.name} @ ${alloc.pct}%`);

        console.log(`  OPEN ${ticker} (${layer}): ${shares} shares @ $${price} = $${alloc.dollar_amount.toFixed(2)} (${alloc.pct}%)`);
      }
    }

    portfolio.last_rebalance = now.toISOString();
    portfolio.layer_exposure = {};
    for (const [layer, config] of Object.entries(BOTTLENECK_LAYERS)) {
      const layerTickers = config.tickers.filter(t => portfolio.positions[t]);
      const layerValue = layerTickers.reduce((s, t) => s + (portfolio.positions[t]?.dollar_amount || 0), 0);
      portfolio.layer_exposure[layer] = +(layerValue / portfolio.balance * 100).toFixed(1);
    }
  } else {
    // Mark-to-market only
    console.log('\n[MARK-TO-MARKET]');
    let totalUnrealized = 0;
    for (const [ticker, pos] of Object.entries(portfolio.positions)) {
      if (prices[ticker]) {
        pos.current_price = prices[ticker];
        pos.unrealized_pnl = +((prices[ticker] - pos.entry_price) * pos.shares).toFixed(2);
        totalUnrealized += pos.unrealized_pnl;
        const pctMove = ((prices[ticker] - pos.entry_price) / pos.entry_price * 100).toFixed(1);
        console.log(`  ${ticker}: $${prices[ticker]} (${pctMove > 0 ? '+' : ''}${pctMove}%) unrealized: $${pos.unrealized_pnl.toFixed(2)}`);
      }
    }
    console.log(`  Total unrealized P&L: $${totalUnrealized.toFixed(2)}`);
  }

  // Snapshot
  getDb().prepare(`
    INSERT INTO bottleneck_snapshots (filing_date, portfolio_value, layer_breakdown, top_holding, bottleneck_verdict)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    portfolio.filing_period || 'unknown',
    portfolio.balance,
    JSON.stringify(portfolio.layer_exposure),
    holdings[0]?.ticker || '?',
    bottleneck.verdict
  );

  savePortfolio(portfolio);

  // Build report
  const posCount = Object.keys(portfolio.positions).length;
  const unrealizedTotal = Object.values(portfolio.positions)
    .reduce((s, p) => s + (p.unrealized_pnl || 0), 0);

  const report = [
    '📊 *BOTTLENECK ARBITRAGE*',
    `Filing: ${portfolio.filing_period || 'Q2 2026'}`,
    `Positions: ${posCount}`,
    `Balance: $${portfolio.balance.toFixed(2)}`,
    `Unrealized: $${unrealizedTotal.toFixed(2)}`,
    `Realized P&L: $${portfolio.total_pnl.toFixed(2)}`,
    `Trades: ${portfolio.total_trades} (${portfolio.wins}W/${portfolio.losses}L)`,
    '',
    '*Layer Exposure:*',
    ...Object.entries(portfolio.layer_exposure || {}).map(([k, v]) => `  ${k}: ${v}%`),
    '',
    `Bottleneck: ${bottleneck.verdict}`,
  ].join('\n');

  console.log('\n' + report);
  await notify(report);

  console.log('\n[DONE]');
}

run().catch(e => {
  console.error('[FATAL]', e);
  process.exit(1);
});
