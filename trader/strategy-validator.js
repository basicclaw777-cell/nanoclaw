/**
 * strategy-validator.js — Trade Setup Validation Engine
 *
 * Like combination-validator.js but for trades.
 * A trade must pass validation before execution.
 * Hard rules, no exceptions. The jab protocol for capital.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, 'config.json');

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

/**
 * Validate a proposed trade against risk rules.
 * Like validatePunchCombo — pass/fail with reasons.
 *
 * @param {object} trade — { asset, direction, entryPrice, positionSize, stopLoss, takeProfit, strategy }
 * @param {object} portfolio — { balance, openPositions }
 * @returns {object} — { valid, checks[], reason }
 */
export function validateTrade(trade, portfolio) {
  const config = loadConfig();
  const rules = config.risk_rules;
  const checks = [];
  let valid = true;

  // 1. Position size check
  const positionPct = trade.positionSize / portfolio.balance;
  if (positionPct > rules.max_position_pct) {
    valid = false;
    checks.push({
      rule: 'max_position_pct',
      verdict: 'FAIL',
      reason: `Position ${(positionPct * 100).toFixed(1)}% exceeds max ${rules.max_position_pct * 100}%`,
    });
  } else {
    checks.push({ rule: 'max_position_pct', verdict: 'PASS', value: `${(positionPct * 100).toFixed(1)}%` });
  }

  // 2. Concurrent positions check
  if (portfolio.openPositions >= rules.max_concurrent_positions) {
    valid = false;
    checks.push({
      rule: 'max_concurrent_positions',
      verdict: 'FAIL',
      reason: `Already ${portfolio.openPositions} open (max ${rules.max_concurrent_positions})`,
    });
  } else {
    checks.push({ rule: 'max_concurrent_positions', verdict: 'PASS', value: `${portfolio.openPositions}/${rules.max_concurrent_positions}` });
  }

  // 3. Stop loss must exist
  if (!trade.stopLoss) {
    valid = false;
    checks.push({ rule: 'stop_loss_required', verdict: 'FAIL', reason: 'No stop loss set. Every trade needs a stop.' });
  } else {
    const slDistance = Math.abs(trade.entryPrice - trade.stopLoss) / trade.entryPrice;
    if (slDistance > rules.stop_loss_pct * 2) {
      valid = false;
      checks.push({ rule: 'stop_loss_distance', verdict: 'FAIL', reason: `Stop loss ${(slDistance * 100).toFixed(1)}% away — too wide (max ${rules.stop_loss_pct * 200}%)` });
    } else {
      checks.push({ rule: 'stop_loss_distance', verdict: 'PASS', value: `${(slDistance * 100).toFixed(1)}%` });
    }
  }

  // 4. Risk:reward ratio
  if (trade.stopLoss && trade.takeProfit) {
    const risk = Math.abs(trade.entryPrice - trade.stopLoss);
    const reward = Math.abs(trade.takeProfit - trade.entryPrice);
    const rr = reward / risk;
    if (rr < 1.5) {
      valid = false;
      checks.push({ rule: 'risk_reward', verdict: 'FAIL', reason: `R:R ${rr.toFixed(2)} below minimum 1.5` });
    } else {
      checks.push({ rule: 'risk_reward', verdict: 'PASS', value: `${rr.toFixed(2)}:1` });
    }
  }

  // 5. Daily loss limit
  if (portfolio.dailyLoss && Math.abs(portfolio.dailyLoss) / portfolio.balance > rules.daily_loss_limit_pct) {
    valid = false;
    checks.push({ rule: 'daily_loss_limit', verdict: 'FAIL', reason: `Daily loss limit hit (${(Math.abs(portfolio.dailyLoss) / portfolio.balance * 100).toFixed(1)}%). No more trades today.` });
  } else {
    checks.push({ rule: 'daily_loss_limit', verdict: 'PASS' });
  }

  // 6. Asset in watchlist
  if (!config.watchlist.includes(trade.asset)) {
    checks.push({ rule: 'watchlist', verdict: 'WARN', reason: `${trade.asset} not in watchlist. Proceed with caution.` });
  } else {
    checks.push({ rule: 'watchlist', verdict: 'PASS' });
  }

  // 7. Strategy must be named
  if (!trade.strategy) {
    valid = false;
    checks.push({ rule: 'strategy_named', verdict: 'FAIL', reason: 'No strategy named. No unnamed trades.' });
  } else {
    checks.push({ rule: 'strategy_named', verdict: 'PASS', value: trade.strategy });
  }

  return {
    valid,
    checks,
    summary: valid
      ? `APPROVED: ${trade.direction} ${trade.asset} @ ${trade.entryPrice} (${trade.strategy})`
      : `REJECTED: ${checks.filter(c => c.verdict === 'FAIL').map(c => c.reason).join('; ')}`,
  };
}

/**
 * Calculate position size from risk rules.
 * "How much can I risk on this trade?"
 */
export function calculatePositionSize(balance, entryPrice, stopLoss, riskPct = 0.02) {
  const riskAmount = balance * riskPct;
  const slDistance = Math.abs(entryPrice - stopLoss);
  const positionSize = riskAmount / slDistance;
  const positionValue = positionSize * entryPrice;
  const positionPct = positionValue / balance;

  return {
    positionSize: Math.round(positionSize * 10000) / 10000,
    positionValue: Math.round(positionValue * 100) / 100,
    positionPct: Math.round(positionPct * 1000) / 10,
    riskAmount: Math.round(riskAmount * 100) / 100,
    riskPct: riskPct * 100,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('strategy-validator.js')) {
  // Example validation
  const trade = {
    asset: 'BTC',
    direction: 'long',
    entryPrice: 60000,
    positionSize: 100,
    stopLoss: 57000,
    takeProfit: 66000,
    strategy: 'sentiment_reversal',
  };

  const portfolio = {
    balance: 1000,
    openPositions: 1,
    dailyLoss: -20,
  };

  console.log('Trade Validation:');
  console.log(JSON.stringify(trade, null, 2));
  console.log('\nPortfolio:');
  console.log(JSON.stringify(portfolio, null, 2));
  console.log('\nResult:');
  const result = validateTrade(trade, portfolio);
  console.log(JSON.stringify(result, null, 2));

  console.log('\nPosition Size Calculator:');
  const pos = calculatePositionSize(1000, 60000, 57000, 0.02);
  console.log(JSON.stringify(pos, null, 2));
}
