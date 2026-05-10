/**
 * trading-orchestrator.js — The ignition switch
 *
 * Runs the full trading loop:
 * 1. Fetch fresh signals (crypto-signals.py)
 * 2. Check open positions against current prices (SL/TP)
 * 3. For actionable signals, run bull-bear debate
 * 4. Validate passing trades via strategy-validator
 * 5. Execute paper trades, log everything
 *
 * ESM. Runs via PM2 cron every 4 hours.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });

import { logSignal, openTrade, closeTrade, getOpenPositions, logDecision, getPerformance } from './trade-logger.js';
import { validateTrade, calculatePositionSize } from './strategy-validator.js';
import { debate } from './bull-bear-debate.js';
import { watchRun, watchClose, synthesizeInsights, getWatcherStats } from './meta-watcher.js';
import { runRoundtable } from './strategy-roundtable.js';
import { logDomainRun, detectCrossDomainConvergence } from '../experiment-engine/meta-watcher.js';
import { isEliminated, runElimination } from './strategy-elimination.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, 'config.json');
const PORTFOLIO_PATH = path.join(__dirname, 'portfolio.json');
const SIGNALS_PATH = path.join(__dirname, 'signals', 'crypto-signals-latest.json');
const CATHEDRAL_SIGNALS_PATH = path.join(__dirname, 'signals', 'cathedral-signals-latest.json');

// Telegram notify (optional — uses cathedral-bot's sendMessage if available)
const BOT_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.PAUL_CHAT_ID;

async function notify(message) {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log('[notify]', message);
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: message, parse_mode: 'Markdown' }),
    });
  } catch (e) {
    console.error('[notify] Telegram error:', e.message);
  }
}

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function loadPortfolio() {
  return JSON.parse(fs.readFileSync(PORTFOLIO_PATH, 'utf8'));
}

function savePortfolio(portfolio) {
  fs.writeFileSync(PORTFOLIO_PATH, JSON.stringify(portfolio, null, 2));
}

// ── Step 1: Fetch fresh signals ──────────────────────────────────────────────

async function fetchSignals() {
  console.log('[1/5] Fetching fresh signals (10 strategies)...');

  let baseData = null;

  // Run market data + strategies 1-2 (sentiment, momentum)
  try {
    execSync('python3 signals/crypto-signals.py', {
      cwd: __dirname,
      stdio: 'pipe',
      timeout: 60000,
    });
    baseData = JSON.parse(fs.readFileSync(SIGNALS_PATH, 'utf8'));
    console.log(`  Market signals: ${baseData.signals.length} from sentiment/momentum`);
  } catch (e) {
    console.error('[signals] Market fetch failed:', e.message);
    if (fs.existsSync(SIGNALS_PATH)) {
      const raw = fs.readFileSync(SIGNALS_PATH, 'utf8');
      const data = JSON.parse(raw);
      const age = (Date.now() - new Date(data.timestamp).getTime()) / 3600000;
      if (age < 6) {
        console.log(`  Using cached market signals (${age.toFixed(1)}h old)`);
        baseData = data;
      }
    }
  }

  if (!baseData) return null;

  // Run strategies 3-10 (cathedral strategies)
  try {
    execSync('python3 strategies/cathedral-strategies.py', {
      cwd: __dirname,
      stdio: 'pipe',
      timeout: 120000,
    });
    const cathedralData = JSON.parse(fs.readFileSync(CATHEDRAL_SIGNALS_PATH, 'utf8'));
    console.log(`  Cathedral signals: ${cathedralData.total_signals} from 8 strategies`);

    // Merge cathedral signals into base data
    baseData.signals = [...baseData.signals, ...cathedralData.signals];
    baseData.strategy_count = 10;
    console.log(`  Total: ${baseData.signals.length} signals from 10 strategies`);
  } catch (e) {
    console.error('[cathedral-strategies] Failed:', e.message);
    // Continue with just market signals
  }

  // Run strategy 12: Simpsons Temporal Signal
  try {
    const simpsonsModule = await import('./strategies/simpsons-signal.js');
    const simpsonsData = simpsonsModule.generateSimpsonsSignals();
    if (simpsonsData.signals.length > 0) {
      baseData.signals = [...baseData.signals, ...simpsonsData.signals];
      baseData.strategy_count = (baseData.strategy_count || 10) + 1;
      console.log(`  Simpsons temporal signals: ${simpsonsData.signals.length} from ${simpsonsData.predictions_scored} predictions`);
      console.log(`  Top prediction: "${simpsonsData.top_prediction}"`);
    }
  } catch (e) {
    console.error('[simpsons-signal] Failed:', e.message);
  }

  return baseData;
}

// ── Step 2: Check open positions ─────────────────────────────────────────────

function checkOpenPositions(prices, portfolio) {
  console.log('[2/5] Checking open positions...');
  const openPositions = getOpenPositions();

  if (openPositions.length === 0) {
    console.log('  No open positions');
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  if (portfolio.daily_pnl_date !== today) {
    portfolio.daily_pnl = 0;
    portfolio.daily_pnl_date = today;
  }

  for (const pos of openPositions) {
    const priceData = prices[pos.asset];
    if (!priceData || !priceData.price) {
      console.log(`  ${pos.asset}: no price data, skipping`);
      continue;
    }

    const currentPrice = priceData.price;
    const isLong = pos.direction === 'long';

    // Check stop loss
    if (pos.stop_loss) {
      const hitSL = isLong ? currentPrice <= pos.stop_loss : currentPrice >= pos.stop_loss;
      if (hitSL) {
        const result = closeTrade(pos.id, pos.stop_loss);
        if (result) {
          portfolio.balance += result.pnl;
          portfolio.daily_pnl += result.pnl;
          portfolio.total_pnl += result.pnl;
          portfolio.total_trades++;
          portfolio.losses++;
          const msg = `STOP LOSS HIT: ${pos.direction} ${pos.asset} @ ${pos.stop_loss} | PnL: $${result.pnl.toFixed(2)} (${(result.pnlPct * 100).toFixed(2)}%)`;
          console.log(`  ${msg}`);
          notify(`[TRADER] ${msg}`);
          watchClose({ ...pos, pnl: result.pnl, pnl_pct: result.pnlPct }, pos.stop_loss);
        }
        continue;
      }
    }

    // Check take profit
    if (pos.take_profit) {
      const hitTP = isLong ? currentPrice >= pos.take_profit : currentPrice <= pos.take_profit;
      if (hitTP) {
        const result = closeTrade(pos.id, pos.take_profit);
        if (result) {
          portfolio.balance += result.pnl;
          portfolio.daily_pnl += result.pnl;
          portfolio.total_pnl += result.pnl;
          portfolio.total_trades++;
          portfolio.wins++;
          const msg = `TAKE PROFIT HIT: ${pos.direction} ${pos.asset} @ ${pos.take_profit} | PnL: $${result.pnl.toFixed(2)} (${(result.pnlPct * 100).toFixed(2)}%)`;
          watchClose({ ...pos, pnl: result.pnl, pnl_pct: result.pnlPct }, pos.take_profit);
          console.log(`  ${msg}`);
          notify(`[TRADER] ${msg}`);
        }
        continue;
      }
    }

    // Unrealised P&L
    const unrealised = isLong
      ? (currentPrice - pos.entry_price) * pos.position_size
      : (pos.entry_price - currentPrice) * pos.position_size;
    const unrealisedPct = isLong
      ? (currentPrice - pos.entry_price) / pos.entry_price
      : (pos.entry_price - currentPrice) / pos.entry_price;
    console.log(`  ${pos.asset} ${pos.direction}: entry ${pos.entry_price} → ${currentPrice} | unrealised $${unrealised.toFixed(2)} (${(unrealisedPct * 100).toFixed(2)}%)`);
  }
}

// ── Step 3: Evaluate signals ─────────────────────────────────────────────────

function filterActionableSignals(signals, config) {
  console.log('[3/5] Filtering actionable signals...');

  // Only trade specific asset signals (not MARKET-wide)
  // Need strength > 0.5 for action
  const actionable = signals.filter(s =>
    s.asset !== 'MARKET' &&
    config.watchlist.includes(s.asset) &&
    s.strength >= 0.5 &&
    s.direction !== 'neutral'
  );

  // Also consider MARKET signals as context for individual assets
  const marketSignals = signals.filter(s => s.asset === 'MARKET');
  const marketBias = marketSignals.reduce((acc, s) => {
    if (s.direction === 'long') return acc + s.strength;
    if (s.direction === 'short') return acc - s.strength;
    return acc;
  }, 0) / Math.max(marketSignals.length, 1);

  console.log(`  ${signals.length} total signals, ${actionable.length} actionable, market bias: ${marketBias.toFixed(2)}`);

  // If no asset-specific signals but market signal is strong, generate signals for top movers
  if (actionable.length === 0 && Math.abs(marketBias) > 0.3) {
    console.log('  No asset signals — checking price action for candidates...');
  }

  return { actionable, marketBias };
}

// ── Step 4: Debate + Validate + Execute ──────────────────────────────────────

async function processSignal(signal, prices, portfolio, config, marketBias) {
  const priceData = prices[signal.asset];
  if (!priceData || !priceData.price) return null;

  const entryPrice = priceData.price;
  const direction = signal.direction; // 'long' or 'short'

  console.log(`\n  --- ${signal.asset} ${direction} @ ${entryPrice} (strength ${signal.strength}) ---`);

  // Skip if strategy has been eliminated
  try {
    if (isEliminated(signal.type)) {
      console.log(`  ${signal.type} ELIMINATED — skipping`);
      return null;
    }
  } catch(e) {}

  // Skip if already have open position for this asset+strategy
  const existingPositions = getOpenPositions();
  const duplicate = existingPositions.find(p => p.asset === signal.asset && p.strategy === signal.type);
  if (duplicate) {
    console.log(`  Already have ${signal.type} position on ${signal.asset} — skipping`);
    return null;
  }

  // Log the signal
  logSignal(signal.source, signal.asset, signal.direction, signal.strength, signal.reasoning, signal);

  // Build context for debate
  const context = [
    `Market bias: ${marketBias > 0.2 ? 'bullish' : marketBias < -0.2 ? 'bearish' : 'neutral'} (${marketBias.toFixed(2)})`,
    `24h change: ${priceData.change_24h?.toFixed(2) || 'N/A'}%`,
    `Volume: $${(priceData.volume_24h / 1e6).toFixed(1)}M`,
    `Signal type: ${signal.type}`,
    `Signal strength: ${signal.strength}`,
  ].join('. ');

  // Run bull-bear debate
  console.log('  Running bull-bear debate...');
  let debateResult;
  try {
    debateResult = await debate({
      asset: signal.asset,
      direction,
      entryPrice,
      signals: [signal],
      context,
    });
  } catch (e) {
    console.error(`  Debate failed: ${e.message}`);
    logDecision(signal.asset, 'ERROR', `Debate failed: ${e.message}`, [signal], '', '', '', 'error');
    return null;
  }

  console.log(`  Bull: ${debateResult.bullCase.substring(0, 80)}...`);
  console.log(`  Bear: ${debateResult.bearCase.substring(0, 80)}...`);
  console.log(`  Decision: ${debateResult.decision} — ${debateResult.reasoning}`);

  if (debateResult.decision !== 'BUY') {
    console.log(`  Skipped (${debateResult.decision})`);
    return null;
  }

  // Calculate position sizing
  const isLong = direction === 'long';
  const stopLoss = isLong
    ? entryPrice * (1 - config.risk_rules.stop_loss_pct)
    : entryPrice * (1 + config.risk_rules.stop_loss_pct);
  const takeProfit = isLong
    ? entryPrice * (1 + config.risk_rules.take_profit_pct)
    : entryPrice * (1 - config.risk_rules.take_profit_pct);

  const sizing = calculatePositionSize(portfolio.balance, entryPrice, stopLoss, 0.02);

  // Cap position to max allowed percentage
  const maxPositionValue = portfolio.balance * config.risk_rules.max_position_pct;
  const positionValue = Math.min(sizing.positionValue, maxPositionValue);
  const positionSize = positionValue / entryPrice;

  // Validate trade
  const openPositions = getOpenPositions();
  const validation = validateTrade(
    {
      asset: signal.asset,
      direction,
      entryPrice,
      positionSize: positionValue,
      stopLoss,
      takeProfit,
      strategy: signal.type,
    },
    {
      balance: portfolio.balance,
      openPositions: openPositions.length,
      dailyLoss: portfolio.daily_pnl < 0 ? portfolio.daily_pnl : 0,
    }
  );

  console.log(`  Validation: ${validation.summary}`);

  if (!validation.valid) {
    logDecision(signal.asset, 'REJECTED', validation.summary, [signal],
      debateResult.bullCase, debateResult.bearCase,
      JSON.stringify(validation.checks), 'rejected');
    return null;
  }

  // Execute paper trade
  const result = openTrade(
    signal.asset, direction, entryPrice,
    positionSize, stopLoss, takeProfit,
    signal.type, debateResult.reasoning,
    debateResult.bullCase, debateResult.bearCase,
    signal.strength
  );

  logDecision(signal.asset, 'OPENED', debateResult.reasoning, [signal],
    debateResult.bullCase, debateResult.bearCase,
    JSON.stringify(validation.checks), 'executed');

  const posPct = ((positionValue / portfolio.balance) * 100).toFixed(1);
  const msg = `NEW TRADE: ${direction} ${signal.asset} @ $${entryPrice}\nSL: $${stopLoss.toFixed(2)} | TP: $${takeProfit.toFixed(2)}\nSize: $${positionValue.toFixed(2)} (${posPct}% of balance)\nStrategy: ${signal.type}\nReasoning: ${debateResult.reasoning}`;
  console.log(`  ${msg}`);
  await notify(`[TRADER] ${msg}`);

  return result;
}

// ── Step 5: Summary ──────────────────────────────────────────────────────────

function generateSummary(portfolio) {
  const openPositions = getOpenPositions();
  const perf = getPerformance(30);
  const today = new Date().toISOString().split('T')[0];

  const lines = [
    `[TRADER] Run complete — ${today}`,
    `Balance: $${portfolio.balance.toFixed(2)} (${portfolio.total_pnl >= 0 ? '+' : ''}$${portfolio.total_pnl.toFixed(2)})`,
    `Open positions: ${openPositions.length}`,
  ];

  if (openPositions.length > 0) {
    for (const p of openPositions) {
      lines.push(`  ${p.direction} ${p.asset} @ ${p.entry_price} (SL: ${p.stop_loss}, TP: ${p.take_profit})`);
    }
  }

  if (perf && perf.total_trades > 0) {
    lines.push(`Closed trades: ${perf.total_trades} | Win rate: ${perf.win_rate}% | Total PnL: $${perf.total_pnl}`);
  }

  return lines.join('\n');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const startTime = Date.now();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[TRADER] Orchestrator run — ${new Date().toISOString()}`);
  console.log(`${'='.repeat(60)}\n`);

  const config = loadConfig();
  const portfolio = loadPortfolio();

  // Step 1: Fetch signals
  const signalData = await fetchSignals();
  if (!signalData) {
    console.log('[ABORT] No signal data available');
    await notify('[TRADER] Run aborted — no signal data');
    return;
  }

  // Step 2: Check open positions
  checkOpenPositions(signalData.prices, portfolio);

  // Step 3: Filter actionable signals
  const { actionable, marketBias } = filterActionableSignals(signalData.signals, config);

  // Step 4: Process each actionable signal (sequential — debate is slow)
  let tradesOpened = 0;
  for (const signal of actionable) {
    const result = await processSignal(signal, signalData.prices, portfolio, config, marketBias);
    if (result) tradesOpened++;
  }

  // If no asset-specific signals, log market-level signals anyway
  if (signalData.signals.length > 0 && actionable.length === 0) {
    for (const signal of signalData.signals) {
      logSignal(signal.source, signal.asset, signal.direction, signal.strength, signal.reasoning, signal);
    }
    console.log(`[4/5] No actionable trades — ${signalData.signals.length} market signals logged`);
  }

  // Step 5: Roundtable — strategies argue about what they see
  console.log('\n[5/7] Strategy Roundtable...');
  try {
    const roundtableResults = await runRoundtable(signalData.signals, signalData.prices);
    if (roundtableResults.length > 0) {
      for (const r of roundtableResults) {
        console.log(`  ${r.asset}: ${r.metaSignal} (${r.personas} voices, convergence ${(r.convergenceScore * 10).toFixed(0)}/10)`);
      }
    }
  } catch (e) {
    console.error('[roundtable] Error:', e.message);
  }

  // Step 6: Meta-watcher — silent observer logs everything
  console.log('[6/7] Meta-watcher logging...');
  try {
    const recentDecisions = signalData.signals
      .filter(s => s.asset !== 'MARKET')
      .map(s => ({ asset: s.asset, action: s.direction, outcome: 'signal' }));
    watchRun(signalData.signals, recentDecisions, signalData.prices, portfolio);

    // Periodic insight synthesis (every 10 runs)
    const stats = getWatcherStats();
    const snapshotCount = stats.log_counts.find(c => c.run_type === 'run_snapshot')?.count || 0;
    if (snapshotCount > 0 && snapshotCount % 10 === 0) {
      console.log('  [watcher] Synthesizing insights...');
      const result = synthesizeInsights();
      if (result.ready) {
        if (result.insights) console.log(`  [watcher] ${result.insights.length} insights generated from ${result.runs} runs`);
      }
    }
  } catch (e) {
    console.error('[watcher] Error:', e.message);
  }

  // Step 6b: Meta-watcher-of-watchers — cross-domain event logging
  try {
    logDomainRun('trading', signalData.signals.map(s => ({
      type: s.type || s.source,
      asset: s.asset,
      direction: s.direction,
      strength: s.strength,
    })));
    const crossDomain = detectCrossDomainConvergence(24);
    if (crossDomain.length > 0) {
      console.log(`  [meta-watcher] ${crossDomain.length} cross-domain convergences detected`);
      for (const c of crossDomain) {
        console.log(`    ${c.strategy}: ${c.direction} in ${c.domains.join(' + ')}`);
      }
    }
  } catch (e) {
    // Meta-watcher is optional — don't fail the run
    console.error('[meta-watcher] Error:', e.message);
  }

  // Step 6c: Weekly strategy elimination (Sundays only)
  if (new Date().getDay() === 0) {
    try {
      console.log('[6c/7] Running weekly strategy elimination...');
      const elimResult = runElimination();
      if (elimResult.event) {
        console.log(`  ${elimResult.event}`);
        console.log(`  Active strategies: ${elimResult.active_count}`);
        await notify(`[TRADER] ${elimResult.event}\nActive strategies: ${elimResult.active_count}`);
      } else {
        console.log(`  ${elimResult.message}`);
      }
    } catch (e) {
      console.error('[elimination] Error:', e.message);
    }
  }

  // Step 7: Save and report
  portfolio.last_run = new Date().toISOString();
  savePortfolio(portfolio);

  const summary = generateSummary(portfolio);
  console.log(`\n[7/7] Summary:\n${summary}`);
  await notify(summary);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n[TRADER] Done in ${elapsed}s — ${tradesOpened} trades opened\n`);
}

run().catch(e => {
  console.error('[FATAL]', e);
  notify(`[TRADER] FATAL ERROR: ${e.message}`).catch(() => {});
  process.exit(1);
});
