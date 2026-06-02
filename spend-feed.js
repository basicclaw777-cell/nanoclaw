#!/usr/bin/env node
// ~/nanoclaw/spend-feed.js
// Module B — Cathedral Status Board, SPEND view ("recent orders").
// Runs `higgsfield account transactions` + `higgsfield account status`, parses
// the DATE/MODEL/CREDITS/ACTION table, writes ~/nanoclaw/spend-feed.json.
//
// The dashboard shows recent spend with a per-day total + each line
// (model, credits, time), the current balance/plan, and flags autonomous-looking
// bursts (this is what caught a 40-credit silent leak).
//
// CLI:
//   node spend-feed.js          regenerate the feed
//   node spend-feed.js --quiet  no console summary
//
// PM2 cron suggestion (DO NOT auto-start — dashboard regenerates on load too):
//   pm2 start ~/nanoclaw/spend-feed.js --name spend-feed \
//     --no-autorestart --cron-restart "0 */2 * * *"

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUT_FILE = path.join(__dirname, 'spend-feed.json');
const QUIET = process.argv.includes('--quiet');

// Burst flag: >= this many spends within BURST_WINDOW_MIN minutes of each other
// looks autonomous (a cron/agent firing repeatedly), worth surfacing.
const BURST_COUNT = 4;
const BURST_WINDOW_MIN = 5;

function hf(args) {
  // higgsfield resolves on PATH; execFileSync avoids shell injection.
  return execFileSync('higgsfield', args, { encoding: 'utf8', timeout: 60000 });
}

// ── parse `higgsfield account status` ────────────────────────────────────────
// e.g. "basicclaw777@gmail.com — ultra plan, 48.08 credits"
function parseStatus() {
  let raw = '';
  try { raw = hf(['account', 'status']); }
  catch (e) { return { ok: false, error: e.message, raw: '' }; }
  const line = raw.split(/\r?\n/).find((l) => l.trim().length) || raw.trim();
  const planMatch = line.match(/—\s*(.+?)\s+plan/i) || line.match(/,\s*(.+?)\s+plan/i);
  const creditsMatch = line.match(/([\d.]+)\s*credits/i);
  const emailMatch = line.match(/[\w.+-]+@[\w.-]+/);
  return {
    ok: true,
    raw: line.trim(),
    email: emailMatch ? emailMatch[0] : null,
    plan: planMatch ? planMatch[1].trim() : null,
    balance: creditsMatch ? parseFloat(creditsMatch[1]) : null,
  };
}

// ── parse `higgsfield account transactions` ──────────────────────────────────
// Columns: DATE(date time) MODEL(multi-word) CREDITS ACTION
//   2026-06-02 13:53  Nano Banana 2           -2       spend
// MODEL is variable-width and multi-word, so we anchor on the trailing
// CREDITS (signed number) + ACTION (word), and treat the rest as MODEL.
function parseTransactions() {
  let raw = '';
  try { raw = hf(['account', 'transactions']); }
  catch (e) { return { ok: false, error: e.message, lines: [] }; }

  const rows = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    if (/^DATE\b/i.test(t)) continue; // header
    // date = YYYY-MM-DD HH:MM, then model..., then signed credits, then action
    const m = t.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(.+?)\s+(-?[\d.]+)\s+(\w+)\s*$/);
    if (!m) continue;
    const [, date, time, model, credits, action] = m;
    rows.push({
      date,
      time,
      datetime: `${date} ${time}`,
      model: model.trim(),
      credits: parseFloat(credits),
      action: action.toLowerCase(), // spend | refund
    });
  }
  return { ok: true, lines: rows };
}

// ── per-day aggregation + burst detection ────────────────────────────────────
function aggregate(rows) {
  const byDay = {};
  for (const r of rows) {
    const d = (byDay[r.date] ||= { date: r.date, spend: 0, refund: 0, net: 0, count: 0, lines: [] });
    if (r.action === 'refund') d.refund += Math.abs(r.credits);
    else d.spend += Math.abs(r.credits);
    d.net = +(d.spend - d.refund).toFixed(2);
    d.count += 1;
    d.lines.push(r);
  }
  const days = Object.values(byDay).sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const d of days) {
    d.spend = +d.spend.toFixed(2);
    d.refund = +d.refund.toFixed(2);
  }

  // Burst detection: within a single day, find clusters of >=BURST_COUNT spends
  // inside a BURST_WINDOW_MIN sliding window. Flag the cluster.
  const bursts = [];
  for (const d of days) {
    const spends = d.lines
      .filter((l) => l.action === 'spend')
      .map((l) => ({ ...l, mins: toMinutes(l.time) }))
      .sort((a, b) => a.mins - b.mins);
    let i = 0;
    while (i < spends.length) {
      let j = i;
      while (j + 1 < spends.length && spends[j + 1].mins - spends[i].mins <= BURST_WINDOW_MIN) j++;
      const cluster = spends.slice(i, j + 1);
      if (cluster.length >= BURST_COUNT) {
        const total = +cluster.reduce((s, c) => s + Math.abs(c.credits), 0).toFixed(2);
        bursts.push({
          date: d.date,
          from: cluster[0].time,
          to: cluster[cluster.length - 1].time,
          count: cluster.length,
          credits: total,
          models: [...new Set(cluster.map((c) => c.model))],
          note: `${cluster.length} spends in ${cluster[cluster.length - 1].mins - cluster[0].mins || 1}min — looks autonomous`,
        });
        i = j + 1;
      } else {
        i++;
      }
    }
  }
  return { days, bursts };
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// ── main ─────────────────────────────────────────────────────────────────────
function build() {
  const status = parseStatus();
  const tx = parseTransactions();
  const rows = tx.ok ? tx.lines : [];
  const { days, bursts } = aggregate(rows);

  const totalSpend = +rows.filter((r) => r.action === 'spend')
    .reduce((s, r) => s + Math.abs(r.credits), 0).toFixed(2);
  const totalRefund = +rows.filter((r) => r.action === 'refund')
    .reduce((s, r) => s + Math.abs(r.credits), 0).toFixed(2);

  const out = {
    generated_at: new Date().toISOString(),
    status: {
      ok: status.ok,
      email: status.email || null,
      plan: status.plan || null,
      balance: status.balance != null ? status.balance : null,
      error: status.ok ? null : status.error,
    },
    transactions_ok: tx.ok,
    transactions_error: tx.ok ? null : tx.error,
    totals: {
      lines: rows.length,
      spend: totalSpend,
      refund: totalRefund,
      net: +(totalSpend - totalRefund).toFixed(2),
    },
    days,        // per-day { date, spend, refund, net, count, lines[] }
    bursts,      // autonomous-looking clusters
    recent: rows.slice(0, 40), // newest-first feed lines
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));

  if (!QUIET) {
    console.log('[spend-feed]',
      `${rows.length} tx · net ${out.totals.net}cr spent · ` +
      `balance ${status.balance != null ? status.balance + 'cr' : 'n/a'} (${status.plan || '?'}) · ` +
      `${bursts.length} burst${bursts.length === 1 ? '' : 's'} flagged`);
    if (!tx.ok) console.log('[spend-feed] transactions error:', tx.error);
    console.log('[spend-feed] wrote', OUT_FILE);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { build(); }
  catch (e) { console.error('[spend-feed] error:', e.message); process.exit(1); }
}

export { build };
