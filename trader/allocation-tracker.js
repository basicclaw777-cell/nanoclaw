#!/usr/bin/env node
/**
 * allocation-tracker.js — "Where Should My Money Go?"
 *
 * NOT a trading experiment. No signals, no strategies.
 * Simple question: if I put $5K into each asset class TODAY,
 * what happens week over week?
 *
 * Tracks real prices across asset classes:
 *   Crypto, Gold, Equities, Bonds, Property REITs, Commodities, Forex
 *
 * Visual dashboard at localhost:8080/allocations
 *
 * Commands:
 *   node allocation-tracker.js              — take weekly snapshot
 *   node allocation-tracker.js status       — show current state
 *   node allocation-tracker.js init         — initialize fresh portfolio
 *   node allocation-tracker.js add TICKER   — add custom allocation
 *   node allocation-tracker.js remove NAME  — remove allocation
 *
 * ESM.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DATA_PATH = path.join(__dirname, 'allocation-portfolio.json');
const DASHBOARD_PATH = path.join(__dirname, 'allocation-dashboard.html');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ── Default Allocations ─────────────────────────────────────────────────────
// Each gets $5,000. Total: $40,000 across 8 asset classes.
// These represent REAL options Paul could deploy money into.

const DEFAULT_ALLOCATIONS = [
  {
    name: 'S&P 500',
    symbol: 'SPY',
    category: 'equity',
    color: '#2563EB',
    invested: 5000,
    why: 'US large cap benchmark. Historical 10% annual. The thing to beat.',
  },
  {
    name: 'Bitcoin',
    symbol: 'BTC-USD',
    category: 'crypto',
    color: '#F7931A',
    invested: 5000,
    why: 'Digital gold. Halving cycle. Asymmetric upside. Uncorrelated to stocks.',
  },
  {
    name: 'Gold',
    symbol: 'GLD',
    category: 'commodity',
    color: '#FFD700',
    invested: 5000,
    why: 'Safe haven. Inflation hedge. 5000-year store of value. Inverse to equities in crisis.',
  },
  {
    name: 'Emerging Markets',
    symbol: 'VWO',
    category: 'equity',
    color: '#10B981',
    invested: 5000,
    why: 'China, India, Brazil, Taiwan. Developing economies. Different growth cycle to US.',
  },
  {
    name: 'US Real Estate',
    symbol: 'VNQ',
    category: 'property',
    color: '#DC2626',
    invested: 5000,
    why: 'Property without buying property. REITs = rental income + appreciation. Rate-sensitive.',
  },
  {
    name: 'Asia ex-Japan',
    symbol: 'AAXJ',
    category: 'equity',
    color: '#7C3AED',
    invested: 5000,
    why: 'Regional exposure. HK, Korea, India, Singapore, Thailand. Where Paul lives.',
  },
  {
    name: 'US Bonds 20yr',
    symbol: 'TLT',
    category: 'bonds',
    color: '#059669',
    invested: 5000,
    why: 'Fixed income. Rate cut play. Portfolio hedge. Moves opposite to stocks in panic.',
  },
  {
    name: 'Commodities',
    symbol: 'DBC',
    category: 'commodity',
    color: '#D97706',
    invested: 5000,
    why: 'Oil, metals, agriculture basket. Inflation proxy. Real-world stuff.',
  },
];

// ── Price Fetching ──────────────────────────────────────────────────────────

async function fetchYahooPrice(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CathedralTracker/1.0' },
    });
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    return {
      price: meta.regularMarketPrice,
      previousClose: meta.previousClose || meta.chartPreviousClose,
      currency: meta.currency,
    };
  } catch (e) {
    return null;
  }
}

async function fetchAllPrices(allocations) {
  const results = {};
  // Batch parallel — all at once
  const promises = allocations.map(async (a) => {
    const data = await fetchYahooPrice(a.symbol);
    if (data) results[a.symbol] = data;
  });
  await Promise.all(promises);
  return results;
}

// ── Portfolio Management ────────────────────────────────────────────────────

function loadPortfolio() {
  if (fs.existsSync(DATA_PATH)) return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  return null;
}

function savePortfolio(portfolio) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(portfolio, null, 2));
}

async function initPortfolio() {
  console.log('Initializing allocation portfolio...\n');

  const prices = await fetchAllPrices(DEFAULT_ALLOCATIONS);
  const allocations = [];

  for (const alloc of DEFAULT_ALLOCATIONS) {
    const priceData = prices[alloc.symbol];
    if (!priceData) {
      console.log(`  SKIP: ${alloc.name} (${alloc.symbol}) — no price data`);
      continue;
    }

    const entry = {
      ...alloc,
      entry_price: priceData.price,
      entry_date: new Date().toISOString().split('T')[0],
      currency: priceData.currency,
      units: alloc.invested / priceData.price,
      snapshots: [{
        date: new Date().toISOString().split('T')[0],
        week: 0,
        price: priceData.price,
        value: alloc.invested,
        pnl: 0,
        pnl_pct: 0,
      }],
    };

    allocations.push(entry);
    console.log(`  ${alloc.name}: $${alloc.invested} → ${entry.units.toFixed(4)} units @ $${priceData.price.toFixed(2)} (${priceData.currency})`);
  }

  const portfolio = {
    started: new Date().toISOString(),
    total_invested: allocations.reduce((sum, a) => sum + a.invested, 0),
    allocations,
    snapshot_count: 1,
  };

  savePortfolio(portfolio);
  console.log(`\nPortfolio initialized: $${portfolio.total_invested.toLocaleString()} across ${allocations.length} assets`);
  await generateDashboard(portfolio);
  return portfolio;
}

// ── Weekly Snapshot ─────────────────────────────────────────────────────────

async function takeSnapshot() {
  const portfolio = loadPortfolio();
  if (!portfolio) {
    console.log('No portfolio. Run: node allocation-tracker.js init');
    return;
  }

  console.log(`\n=== ALLOCATION TRACKER — Snapshot #${portfolio.snapshot_count + 1} ===\n`);

  const prices = await fetchAllPrices(portfolio.allocations);
  const today = new Date().toISOString().split('T')[0];
  let totalValue = 0;
  let totalInvested = 0;

  const rows = [];

  for (const alloc of portfolio.allocations) {
    const priceData = prices[alloc.symbol];
    if (!priceData) {
      console.log(`  ${alloc.name}: NO DATA — keeping last snapshot`);
      totalValue += alloc.snapshots[alloc.snapshots.length - 1]?.value || alloc.invested;
      totalInvested += alloc.invested;
      continue;
    }

    const currentValue = alloc.units * priceData.price;
    const pnl = currentValue - alloc.invested;
    const pnlPct = (pnl / alloc.invested) * 100;

    // Week-over-week change
    const lastSnapshot = alloc.snapshots[alloc.snapshots.length - 1];
    const weekChange = lastSnapshot ? currentValue - lastSnapshot.value : 0;
    const weekChangePct = lastSnapshot && lastSnapshot.value ? (weekChange / lastSnapshot.value) * 100 : 0;

    const snapshot = {
      date: today,
      week: portfolio.snapshot_count,
      price: priceData.price,
      value: Math.round(currentValue * 100) / 100,
      pnl: Math.round(pnl * 100) / 100,
      pnl_pct: Math.round(pnlPct * 100) / 100,
      week_change: Math.round(weekChange * 100) / 100,
      week_change_pct: Math.round(weekChangePct * 100) / 100,
    };

    alloc.snapshots.push(snapshot);
    totalValue += currentValue;
    totalInvested += alloc.invested;

    const sign = pnl >= 0 ? '+' : '';
    const weekSign = weekChange >= 0 ? '+' : '';
    rows.push({
      name: alloc.name,
      value: currentValue,
      pnl, pnlPct, weekChange, weekChangePct,
    });
    console.log(`  ${alloc.name.padEnd(22)} $${currentValue.toFixed(0).padStart(6)}  (${sign}$${pnl.toFixed(0)}, ${sign}${pnlPct.toFixed(1)}%)  week: ${weekSign}$${weekChange.toFixed(0)} (${weekSign}${weekChangePct.toFixed(1)}%)`);
  }

  portfolio.snapshot_count++;
  savePortfolio(portfolio);

  const totalPnl = totalValue - totalInvested;
  const totalPnlPct = (totalPnl / totalInvested) * 100;
  const sign = totalPnl >= 0 ? '+' : '';

  console.log(`\n  TOTAL: $${totalValue.toFixed(0)} / $${totalInvested.toFixed(0)} invested (${sign}$${totalPnl.toFixed(0)}, ${sign}${totalPnlPct.toFixed(1)}%)`);

  // Sort by performance for ranking
  rows.sort((a, b) => b.pnlPct - a.pnlPct);
  console.log('\n  RANKING:');
  rows.forEach((r, i) => {
    const medal = i === 0 ? '  1st' : i === 1 ? '  2nd' : i === 2 ? '  3rd' : `  ${i + 1}th`;
    const sign = r.pnlPct >= 0 ? '+' : '';
    console.log(`  ${medal}  ${r.name.padEnd(22)} ${sign}${r.pnlPct.toFixed(1)}%`);
  });

  await generateDashboard(portfolio);

  // Telegram summary
  const best = rows[0];
  const worst = rows[rows.length - 1];
  const msg = [
    `*Allocation Tracker — Week ${portfolio.snapshot_count - 1}*`,
    `Total: $${totalValue.toFixed(0)} (${sign}$${totalPnl.toFixed(0)}, ${sign}${totalPnlPct.toFixed(1)}%)`,
    `Best: ${best.name} ${best.pnlPct >= 0 ? '+' : ''}${best.pnlPct.toFixed(1)}%`,
    `Worst: ${worst.name} ${worst.pnlPct >= 0 ? '+' : ''}${worst.pnlPct.toFixed(1)}%`,
  ].join('\n');
  await notify(msg);
}

// ── Status ──────────────────────────────────────────────────────────────────

function showStatus() {
  const portfolio = loadPortfolio();
  if (!portfolio) {
    console.log('No portfolio. Run: node allocation-tracker.js init');
    return;
  }

  console.log(`\n=== ALLOCATION TRACKER STATUS ===`);
  console.log(`Started: ${portfolio.started?.split('T')[0]}`);
  console.log(`Snapshots: ${portfolio.snapshot_count}`);
  console.log(`Total invested: $${portfolio.total_invested.toLocaleString()}\n`);

  for (const alloc of portfolio.allocations) {
    const latest = alloc.snapshots[alloc.snapshots.length - 1];
    const sign = latest.pnl >= 0 ? '+' : '';
    console.log(`  ${alloc.name.padEnd(22)} $${latest.value.toFixed(0).padStart(6)} (${sign}${latest.pnl_pct.toFixed(1)}%) — ${alloc.why}`);
  }

  const totalValue = portfolio.allocations.reduce((sum, a) => {
    const latest = a.snapshots[a.snapshots.length - 1];
    return sum + latest.value;
  }, 0);
  const totalPnl = totalValue - portfolio.total_invested;
  const sign = totalPnl >= 0 ? '+' : '';
  console.log(`\n  TOTAL: $${totalValue.toFixed(0)} (${sign}$${totalPnl.toFixed(0)}, ${sign}${((totalPnl / portfolio.total_invested) * 100).toFixed(1)}%)`);
}

// ── Dashboard Generator ─────────────────────────────────────────────────────

function buildRankRow(a, i, maxPct) {
  const barWidth = Math.max(2, Math.abs(a.pnl_pct) / maxPct * 100);
  const posClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
  const barBg = a.pnl >= 0 ? '#065F46' : '#7F1D1D';
  const barColor = a.pnl >= 0 ? '#34D399' : '#F87171';
  const pnlClass = a.pnl >= 0 ? 'green' : 'red';
  const pnlSign = a.pnl >= 0 ? '+' : '';
  return '<div class="rank-row">'
    + '<div class="rank-pos ' + posClass + '">' + (i + 1) + '</div>'
    + '<div class="rank-name"><div class="main">' + a.name + '</div>'
    + '<div class="sub">' + a.category + ' &middot; ' + a.symbol + '</div></div>'
    + '<div class="rank-bar-container"><div class="rank-bar" style="width:' + barWidth + '%;background:' + barBg + ';color:' + barColor + ';">'
    + pnlSign + a.pnl_pct.toFixed(1) + '%</div></div>'
    + '<div class="rank-pnl ' + pnlClass + '">' + pnlSign + '$' + a.pnl.toFixed(0) + '</div>'
    + '</div>';
}

function buildCard(a) {
  const pctAbs = Math.min(Math.abs(a.pnl_pct), 30);
  const barPct = (pctAbs / 30) * 100;
  const pnlClass = a.pnl >= 0 ? 'green' : 'red';
  const pnlSign = a.pnl >= 0 ? '+' : '';
  const barColor = a.pnl >= 0 ? '#34D399' : '#F87171';
  const latestPrice = a.snapshots[a.snapshots.length - 1]?.price;
  return '<div class="card">'
    + '<div class="card-header"><div>'
    + '<div class="card-name" style="color:' + a.color + '">' + a.name + '</div>'
    + '<div class="card-category">' + a.category + ' &middot; ' + a.symbol + '</div></div>'
    + '<div class="card-pnl"><div class="pct ' + pnlClass + '">' + pnlSign + a.pnl_pct.toFixed(1) + '%</div>'
    + '<div class="dollar">' + pnlSign + '$' + a.pnl.toFixed(0) + '</div></div></div>'
    + '<div class="card-why">' + a.why + '</div>'
    + '<div class="card-bar"><div class="card-bar-fill" style="width:' + barPct + '%;background:' + barColor + ';"></div></div>'
    + '<div class="card-details">'
    + '<span>Entry: $' + (a.entry_price?.toFixed(2) || '?') + '</span>'
    + '<span>Now: $' + (latestPrice?.toFixed(2) || '?') + '</span>'
    + '<span>Value: $' + a.current_value.toFixed(0) + '</span></div></div>';
}

async function generateDashboard(portfolio) {
  const allocs = portfolio.allocations;
  const weeks = portfolio.snapshot_count;

  const chartData = allocs.map(a => ({
    name: a.name, color: a.color, category: a.category, invested: a.invested,
    why: a.why, symbol: a.symbol, entry_price: a.entry_price, snapshots: a.snapshots,
    current_value: a.snapshots[a.snapshots.length - 1]?.value || a.invested,
    pnl: a.snapshots[a.snapshots.length - 1]?.pnl || 0,
    pnl_pct: a.snapshots[a.snapshots.length - 1]?.pnl_pct || 0,
  }));

  const totalInvested = portfolio.total_invested;
  const totalValue = chartData.reduce((s, a) => s + a.current_value, 0);
  const totalPnl = totalValue - totalInvested;
  const totalPnlPct = (totalPnl / totalInvested * 100).toFixed(1);
  const pnlClass = totalPnl >= 0 ? 'green' : 'red';
  const pnlSign = totalPnl >= 0 ? '+' : '';

  const sorted = [...chartData].sort((a, b) => b.pnl_pct - a.pnl_pct);
  const maxPct = Math.max(...chartData.map(x => Math.abs(x.pnl_pct)), 1);

  const rankingHtml = sorted.map((a, i) => buildRankRow(a, i, maxPct)).join('');
  const cardsHtml = sorted.map(a => buildCard(a)).join('');

  // Week-over-week table (only after 2+ snapshots)
  let weekTableHtml = '';
  if (weeks > 1) {
    const headers = Array.from({length: Math.min(weeks, 12)}, (_, i) => '<th>W' + i + '</th>').join('');
    const rows = sorted.map(a => {
      const cells = a.snapshots.slice(0, 12).map(s => {
        const cls = s.pnl >= 0 ? 'green' : 'red';
        const sign = s.pnl >= 0 ? '+' : '';
        return '<td class="' + cls + '">' + sign + s.pnl_pct.toFixed(1) + '%</td>';
      }).join('');
      return '<tr><td style="color:' + a.color + ';font-weight:500">' + a.name + '</td>' + cells + '</tr>';
    }).join('');
    weekTableHtml = '<div class="chart-section"><h2>Week-over-Week History</h2>'
      + '<div style="overflow-x:auto"><table class="week-table"><thead><tr><th>Asset</th>'
      + headers + '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Allocation Tracker</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',-apple-system,sans-serif;background:#0F172A;color:#E2E8F0;min-height:100vh}
.header{background:linear-gradient(135deg,#1E293B,#0F172A);padding:32px;border-bottom:1px solid #334155}
.header h1{font-size:28px;font-weight:700;margin-bottom:8px}
.header .subtitle{color:#94A3B8;font-size:15px}
.header .totals{display:flex;gap:32px;margin-top:20px;flex-wrap:wrap}
.total-card{background:#1E293B;border:1px solid #334155;border-radius:12px;padding:16px 24px}
.total-card .label{font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:1px}
.total-card .value{font-size:28px;font-weight:700;margin-top:4px}
.total-card .value.green{color:#34D399}.total-card .value.red{color:#F87171}.total-card .value.neutral{color:#E2E8F0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px;padding:24px}
.card{background:#1E293B;border:1px solid #334155;border-radius:12px;padding:20px;transition:border-color .2s}
.card:hover{border-color:#475569}
.card-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px}
.card-name{font-size:17px;font-weight:600}
.card-category{font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:1px;margin-top:2px}
.card-pnl{text-align:right}.card-pnl .pct{font-size:24px;font-weight:700}.card-pnl .dollar{font-size:13px;color:#94A3B8}
.card-why{font-size:12px;color:#64748B;margin-bottom:12px;font-style:italic}
.card-bar{height:8px;border-radius:4px;background:#334155;margin-bottom:8px;overflow:hidden}
.card-bar-fill{height:100%;border-radius:4px;transition:width .5s}
.card-details{display:flex;justify-content:space-between;font-size:12px;color:#94A3B8}
.chart-section{padding:24px}.chart-section h2{font-size:20px;font-weight:600;margin-bottom:16px}
.ranking{background:#1E293B;border:1px solid #334155;border-radius:12px;overflow:hidden}
.rank-row{display:flex;align-items:center;padding:14px 20px;border-bottom:1px solid #1a2332}
.rank-row:last-child{border-bottom:none}
.rank-pos{width:40px;font-size:20px;font-weight:700;color:#475569}
.rank-pos.gold{color:#FFD700}.rank-pos.silver{color:#C0C0C0}.rank-pos.bronze{color:#CD7F32}
.rank-name{flex:1}.rank-name .main{font-size:15px;font-weight:500}.rank-name .sub{font-size:11px;color:#64748B}
.rank-bar-container{width:200px;margin:0 20px}
.rank-bar{height:24px;border-radius:4px;display:flex;align-items:center;padding:0 8px;font-size:12px;font-weight:600;min-width:2px}
.rank-pnl{width:100px;text-align:right;font-size:15px;font-weight:600}
.week-table{width:100%;border-collapse:collapse;margin-top:16px}
.week-table th{text-align:left;padding:10px 12px;font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #334155}
.week-table td{padding:10px 12px;font-size:13px;border-bottom:1px solid #1a2332}
.week-table tr:hover{background:#1a2332}
.green{color:#34D399}.red{color:#F87171}
.footer{padding:24px;text-align:center;color:#475569;font-size:12px}
@media(max-width:768px){.header .totals{flex-direction:column;gap:12px}.grid{grid-template-columns:1fr;padding:12px}.rank-bar-container{display:none}}
</style></head><body>
<div class="header">
<h1>Where Should My Money Go?</h1>
<div class="subtitle">$${totalInvested.toLocaleString()} across ${allocs.length} asset classes — Week ${weeks - 1} — Started ${portfolio.started?.split('T')[0]}</div>
<div class="totals">
<div class="total-card"><div class="label">Total Invested</div><div class="value neutral">$${totalInvested.toLocaleString()}</div></div>
<div class="total-card"><div class="label">Current Value</div><div class="value neutral">$${totalValue.toFixed(0)}</div></div>
<div class="total-card"><div class="label">Total P&L</div><div class="value ${pnlClass}">${pnlSign}$${totalPnl.toFixed(0)}</div></div>
<div class="total-card"><div class="label">Return</div><div class="value ${pnlClass}">${pnlSign}${totalPnlPct}%</div></div>
</div></div>
<div class="chart-section"><h2>Performance Ranking</h2><div class="ranking">${rankingHtml}</div></div>
<div class="grid">${cardsHtml}</div>
${weekTableHtml}
<div class="footer">Cathedral Allocation Tracker &middot; Paper positions &middot; Updated ${new Date().toISOString().split('T')[0]} &middot; Week ${weeks - 1}</div>
</body></html>`;

  fs.writeFileSync(DASHBOARD_PATH, html);
  console.log('\n  Dashboard updated -> localhost:8080/allocations');
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

// ── CLI ─────────────────────────────────────────────────────────────────────

const cmd = process.argv[2];

if (cmd === 'init') {
  initPortfolio().catch(e => console.error('Init failed:', e));
} else if (cmd === 'status') {
  showStatus();
} else {
  // Default: take snapshot (or init if no portfolio)
  const portfolio = loadPortfolio();
  if (!portfolio) {
    console.log('No portfolio found — initializing...\n');
    initPortfolio().catch(e => console.error('Init failed:', e));
  } else {
    takeSnapshot().catch(e => console.error('Snapshot failed:', e));
  }
}
