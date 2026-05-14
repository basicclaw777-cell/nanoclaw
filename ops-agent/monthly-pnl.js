/**
 * monthly-pnl.js — Auto-generate P&L from PunchPass + known fixed costs
 *
 * Fixed costs (from Opus Architect Record):
 *   - Rent: $52,000/month
 *   - Cleaning: configurable
 *   - Insurance: configurable
 *   - MPF contributions: configurable
 *
 * Revenue: from PunchPass member-data.json estimates
 * Output: vault + Telegram summary
 * ESM module.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME;
const MEMBER_DATA = path.join(HOME, 'br-gm-agent', 'reports', 'member-data.json');
const VAULT_REPORTS = path.join(HOME, 'cathedral-vault', '10_Agents', 'ops', 'finance', 'reports');
const LOCAL_REPORTS = path.join(__dirname, 'reports');
const CONFIG_PATH = path.join(__dirname, 'ops-config.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

// Fixed costs — Paul updates ops-config.json
const DEFAULT_COSTS = {
  rent: 52000,
  cleaning: 3000,
  insurance: 2000,
  mpf: 1500,        // employer MPF contribution estimate
  utilities: 2000,
  misc: 1500,
};

export function generatePnL() {
  const config = loadConfig();
  const costs = { ...DEFAULT_COSTS, ...config.fixedCosts };

  // Load revenue data
  let revenue = {};
  if (fs.existsSync(MEMBER_DATA)) {
    const data = JSON.parse(fs.readFileSync(MEMBER_DATA, 'utf-8'));
    const members = data.members || [];
    const groupMembers = members.filter(m => m.pass_type !== 'PT').length;
    const ptMembers = members.filter(m => m.pass_type === 'PT').length;

    revenue = {
      dataAsOf: data.export_date,
      staleDays: data.data_staleness_days,
      groupEstimate: groupMembers * 4 * 180,
      ptEstimate: ptMembers * 5250,
      activeMembers: data.total_active_members,
    };
    revenue.totalEstimate = revenue.groupEstimate + revenue.ptEstimate;
  } else {
    revenue = { error: 'member-data.json not found', totalEstimate: 0 };
  }

  const totalCosts = Object.values(costs).reduce((a, b) => a + b, 0);
  const netIncome = revenue.totalEstimate - totalCosts;

  const report = {
    generated: new Date().toISOString(),
    month: new Date().toISOString().slice(0, 7),
    revenue,
    costs,
    totalCosts,
    netIncome,
    profitable: netIncome > 0,
    note: 'Revenue is estimated from member count. For actual P&L, Paul inputs PunchPass revenue report figures.',
  };

  // Save
  const filename = `pnl-${report.month}.json`;
  fs.mkdirSync(LOCAL_REPORTS, { recursive: true });
  fs.mkdirSync(VAULT_REPORTS, { recursive: true });
  fs.writeFileSync(path.join(LOCAL_REPORTS, filename), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(VAULT_REPORTS, filename), JSON.stringify(report, null, 2));

  return report;
}

export function formatPnLTelegram() {
  const r = generatePnL();

  let msg = `*P&L — ${r.month}*\n`;
  if (r.revenue.dataAsOf) msg += `Data: ${r.revenue.dataAsOf} (${r.revenue.staleDays}d stale)\n`;
  msg += `\n*Revenue (estimated)*\n`;
  if (r.revenue.error) {
    msg += `  ${r.revenue.error}\n`;
  } else {
    msg += `  Group: $${r.revenue.groupEstimate?.toLocaleString()}\n`;
    msg += `  PT: $${r.revenue.ptEstimate?.toLocaleString()}\n`;
    msg += `  *Total: $${r.revenue.totalEstimate?.toLocaleString()}*\n`;
    msg += `  Active members: ${r.revenue.activeMembers}\n`;
  }
  msg += `\n*Costs*\n`;
  for (const [name, amount] of Object.entries(r.costs)) {
    msg += `  ${name}: $${amount.toLocaleString()}\n`;
  }
  msg += `  *Total: $${r.totalCosts.toLocaleString()}*\n`;
  msg += `\n${r.profitable ? '+' : ''}*Net: $${r.netIncome.toLocaleString()}* ${r.profitable ? '' : '(loss)'}\n`;
  msg += `\n_Edit ~/nanoclaw/ops-agent/ops-config.json to update costs._`;

  return msg;
}

export default { generatePnL, formatPnLTelegram };
