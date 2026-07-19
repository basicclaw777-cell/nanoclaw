/**
 * spend-circuit-breaker.js — Constitutional Spend Guard
 *
 * Hard mathematical cap on API spend. Not "please don't overspend" — physically prevented.
 * Import in any module that calls paid APIs.
 *
 * Prevents the Higgsfield overnight drain incident (G2) from recurring.
 *
 * Architecture from: agent-governance-4-pillars.md (Pillar 4, INV-005)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPEND_LOG = path.join(__dirname, 'state', 'spend-ledger.json');

function loadLedger() {
  if (!fs.existsSync(SPEND_LOG)) return { entries: [], dailyTotals: {} };
  try { return JSON.parse(fs.readFileSync(SPEND_LOG, 'utf8')); } catch { return { entries: [], dailyTotals: {} }; }
}

function saveLedger(ledger) {
  const dir = path.dirname(SPEND_LOG);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (ledger.entries.length > 5000) ledger.entries = ledger.entries.slice(-2500);
  fs.writeFileSync(SPEND_LOG, JSON.stringify(ledger, null, 2));
}

function today() { return new Date().toISOString().slice(0, 10); }

/**
 * Record a spend event.
 * Call AFTER every paid API call with the actual cost.
 */
function recordSpend(source, amount, details = '') {
  const ledger = loadLedger();
  const date = today();

  ledger.entries.push({
    timestamp: new Date().toISOString(),
    source,
    amount,
    details,
  });

  ledger.dailyTotals[date] = (ledger.dailyTotals[date] || 0) + amount;
  saveLedger(ledger);

  return { todayTotal: ledger.dailyTotals[date] };
}

/**
 * Check if a spend is allowed BEFORE making the API call.
 * Returns { allowed: boolean, reason: string, todaySpent: number, remaining: number }
 */
function canSpend(source, amount, caps = {}) {
  const dailyCap = caps.dailyCap || 10.0;
  const perCallCap = caps.perCallCap || 5.0;

  if (amount > perCallCap) {
    return {
      allowed: false,
      reason: `Per-call cap exceeded: $${amount.toFixed(2)} > $${perCallCap.toFixed(2)} cap`,
      todaySpent: getTodaySpend(),
      remaining: 0
    };
  }

  const ledger = loadLedger();
  const todaySpent = ledger.dailyTotals[today()] || 0;
  const remaining = dailyCap - todaySpent;

  if (todaySpent + amount > dailyCap) {
    return {
      allowed: false,
      reason: `Daily cap would be exceeded: $${todaySpent.toFixed(2)} spent + $${amount.toFixed(2)} = $${(todaySpent + amount).toFixed(2)} > $${dailyCap.toFixed(2)} cap`,
      todaySpent,
      remaining: Math.max(0, remaining)
    };
  }

  return {
    allowed: true,
    reason: 'Within budget',
    todaySpent,
    remaining: remaining - amount
  };
}

/**
 * Get today's total spend.
 */
function getTodaySpend() {
  const ledger = loadLedger();
  return ledger.dailyTotals[today()] || 0;
}

/**
 * Get spend summary for the last N days.
 */
function getSpendSummary(days = 7) {
  const ledger = loadLedger();
  const result = {};
  const now = new Date();

  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    result[dateStr] = ledger.dailyTotals[dateStr] || 0;
  }

  const total = Object.values(result).reduce((a, b) => a + b, 0);
  const avg = total / days;

  return {
    daily: result,
    totalPeriod: Math.round(total * 100) / 100,
    avgPerDay: Math.round(avg * 100) / 100,
    todaySpent: ledger.dailyTotals[today()] || 0,
  };
}

/**
 * Wrap a paid API call with the circuit breaker.
 * Usage: const result = await guardedCall('reed', 1.20, { dailyCap: 5 }, () => callApi());
 */
async function guardedCall(source, estimatedCost, caps, fn) {
  const check = canSpend(source, estimatedCost, caps);
  if (!check.allowed) {
    return { blocked: true, reason: check.reason, todaySpent: check.todaySpent };
  }

  const result = await fn();
  recordSpend(source, estimatedCost, typeof result === 'string' ? result.slice(0, 100) : '');
  return { blocked: false, result, todaySpent: check.todaySpent + estimatedCost };
}

export {
  recordSpend,
  canSpend,
  getTodaySpend,
  getSpendSummary,
  guardedCall
};
