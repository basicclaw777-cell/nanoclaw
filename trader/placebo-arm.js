#!/usr/bin/env node
// placebo-arm.js — the cheapest, most decisive test of the trading system.
//
// It does NOT test the strategies. It tests the JUDGE (strategy-elimination).
// Three coinflip "strategies" make purely RANDOM long/short trades, same sizing, same
// stops/targets, into the same trades table, closed by the same position-guardian, judged
// by the same elimination engine (which picks strategies via `DISTINCT strategy FROM trades`).
//
// The prediction (from the code): elimination protects ANY strategy with positive cumulative
// PnL (the ratchet), and the min-trades gate is system-wide. So a coinflip that gets lucky
// early gets PROTECTED — permanently. If that happens, the judge measures luck, not skill.
// The placebo arm doesn't test the players. It tests the referee.
//
// CLI:
//   node placebo-arm.js          open one random trade per coinflip (run on the trader cron)
//   node placebo-arm.js --check  report coinflip outcomes vs the real field + elimination status

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openTrade, getOpenPositions } from './trade-logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const R = config.risk_rules;
const WATCHLIST = config.watchlist; // BTC..UNI
const COINFLIPS = ['coinflip_1', 'coinflip_2', 'coinflip_3'];

const CG_ID = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', AVAX: 'avalanche-2', LINK: 'chainlink',
  DOT: 'polkadot', ARB: 'arbitrum', DOGE: 'dogecoin', ADA: 'cardano', ATOM: 'cosmos', UNI: 'uniswap' };

function balance() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'portfolio.json'), 'utf8')).balance || 10000; }
  catch { return 10000; }
}

async function fetchPrices() {
  const ids = WATCHLIST.map(s => CG_ID[s]).filter(Boolean).join(',');
  const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
  const data = await res.json();
  const out = {};
  for (const s of WATCHLIST) { const id = CG_ID[s]; if (data[id]?.usd) out[s] = data[id].usd; }
  return out;
}

export async function openPlacebos() {
  const prices = await fetchPrices();
  const assets = Object.keys(prices);
  if (!assets.length) { console.log('[placebo] no prices — skipping'); return; }
  const open = getOpenPositions();
  const size = balance() * R.max_position_pct;

  for (const strat of COINFLIPS) {
    const openForStrat = open.filter(p => p.strategy === strat).length;
    if (openForStrat >= 2) { console.log(`[placebo] ${strat} already has ${openForStrat} open — skip`); continue; }
    const asset = assets[Math.floor(Math.random() * assets.length)];
    const dir = Math.random() < 0.5 ? 'long' : 'short';
    const price = prices[asset];
    const sl = dir === 'long' ? price * (1 - R.stop_loss_pct) : price * (1 + R.stop_loss_pct);
    const tp = dir === 'long' ? price * (1 + R.take_profit_pct) : price * (1 - R.take_profit_pct);
    openTrade(asset, dir, price, size, sl, tp, strat,
      'PLACEBO — pure coin-flip, no signal. Tests the judge.', 'random', 'random', 5);
    console.log(`🎲 ${strat}: ${dir} ${asset} @ $${price} (sl ${sl.toFixed(4)} / tp ${tp.toFixed(4)}, $${size.toFixed(0)})`);
  }
  console.log('\nPlacebos opened. The cron closes + judges them like everything else. Run --check after a week.');
}

async function checkResults() {
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  const Database = require('better-sqlite3');
  const db = new Database(path.join(__dirname, 'logs', 'trades.db'));

  console.log('\n🎲 PLACEBO ARM — is the judge fooled?\n');
  const rows = db.prepare(`
    SELECT strategy, COUNT(*) n,
           SUM(CASE WHEN pnl>0 THEN 1 ELSE 0 END) wins,
           ROUND(COALESCE(SUM(pnl),0),2) pnl
    FROM trades WHERE status='closed' GROUP BY strategy ORDER BY pnl DESC`).all();
  const isFlip = s => s && s.startsWith('coinflip');
  console.log('  strategy                    closed  wins   cum_pnl   elim?');
  for (const r of rows) {
    let e = {};
    try { e = db.prepare(`SELECT strikes, eliminated FROM strategy_elimination WHERE strategy=? ORDER BY id DESC LIMIT 1`).get(r.strategy) || {}; } catch {}
    const protectedRatchet = r.pnl > 0 ? ' 🛡 PROTECTED(+pnl)' : '';
    const tag = isFlip(r.strategy) ? '🎲' : '  ';
    console.log(`  ${tag} ${(r.strategy||'?').padEnd(24)} ${String(r.n).padStart(5)} ${String(r.wins).padStart(5)}  ${String(r.pnl).padStart(8)}  ${e.eliminated ? 'KILLED' : 'alive'}${protectedRatchet}`);
  }
  const flips = rows.filter(r => isFlip(r.strategy));
  const survivingFlip = flips.find(r => r.pnl > 0);
  console.log('\n  VERDICT:');
  if (survivingFlip) console.log(`  ❌ ${survivingFlip.strategy} (a COIN FLIP) is positive + protected by the ratchet. The judge is measuring LUCK, not skill.`);
  else if (flips.length) console.log(`  …${flips.length} coinflips running, none yet protected. Keep watching — the prediction is one survives by chance.`);
  else console.log('  (no closed coinflip trades yet — run the opener for a week first)');
}

// CLI dispatch only when run directly — guarded so the orchestrator can import openPlacebos.
if (process.argv[1]?.endsWith('placebo-arm.js')) {
  const mode = process.argv.includes('--check') ? checkResults : openPlacebos;
  mode().catch(e => console.log('error:', e.message));
}
