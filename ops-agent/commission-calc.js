/**
 * commission-calc.js — Coach commission calculator
 *
 * Reads PunchPass member-data.json, calculates commission per coach.
 * Commission rules (Paul's terms):
 *   - Group class: $180 base per head, 50% to coach ($90/head)
 *   - PT: 50% of session price to coach
 *   - Paul's own sessions: no commission (he's the owner)
 *
 * Output: monthly commission report to vault + Telegram-ready summary.
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

// Commission rates
const GROUP_RATE_PER_HEAD = 90;  // HKD — coach gets $90 per head per group session
const PT_COMMISSION_RATE = 0.50; // 50% of PT revenue

// Known PT pricing (from Opus record)
const PT_PRICES = {
  'Private 1-on-1':           900,
  'Private Group pass (2 people)':    600,  // per person
  'Private Group pass (3 people)':    500,
  'Private Group pass (4 people)':    400,
  'Private Group pass (5 people)':    375,
  '7-person Private session':         350,
};

// Coaches (update when roster changes)
const COACHES = {
  aman: { name: 'Aman', active: false, lastDay: '2026-06-11' },
  paul: { name: 'Paul', active: true, isOwner: true },
};

function loadMemberData() {
  if (!fs.existsSync(MEMBER_DATA)) {
    return { error: `member-data.json not found at ${MEMBER_DATA}. Run punchpass-export.py first.` };
  }
  return JSON.parse(fs.readFileSync(MEMBER_DATA, 'utf-8'));
}

/**
 * Calculate commission for a given month.
 * Note: PunchPass data doesn't track which coach ran which session.
 * This generates the STRUCTURE — Paul fills in coach assignments.
 * For now, outputs total group + PT revenue for commission estimation.
 */
export function calculateCommission() {
  const data = loadMemberData();
  if (data.error) return data;

  const members = data.members || [];
  const exportDate = data.export_date;

  // Count by pass type
  const passBreakdown = { unlimited: 0, pack: 0, PT: 0, trial: 0, drop_in: 0, kids: 0, bootcamp: 0, other: 0 };
  let ptMembers = 0;
  let groupMembers = 0;

  for (const m of members) {
    const type = m.pass_type || 'other';
    passBreakdown[type] = (passBreakdown[type] || 0) + 1;
    if (type === 'PT') ptMembers++;
    else groupMembers++;
  }

  // Estimate monthly revenue by type
  // Group: active members × average sessions/month × group rate
  // PT: PT members × average PT price × sessions/month
  const estimatedGroupRevenue = groupMembers * 4 * 180; // ~4 sessions/month avg, $180/session
  const estimatedPTRevenue = ptMembers * 5250; // average PT sale from Opus data

  // Commission estimates (when a coach is assigned)
  const coachCommissionGroup = groupMembers * 4 * GROUP_RATE_PER_HEAD;
  const coachCommissionPT = estimatedPTRevenue * PT_COMMISSION_RATE;

  const report = {
    generated: new Date().toISOString(),
    dataAsOf: exportDate,
    dataStaleDays: data.data_staleness_days,
    totalActiveMembers: data.total_active_members,
    passBreakdown,
    revenue: {
      estimatedGroupMonthly: estimatedGroupRevenue,
      estimatedPTMonthly: estimatedPTRevenue,
      estimatedTotalMonthly: estimatedGroupRevenue + estimatedPTRevenue,
      note: 'Estimates based on member count × average rates. Actual from PunchPass revenue report.',
    },
    commission: {
      groupPerHead: GROUP_RATE_PER_HEAD,
      ptRate: `${PT_COMMISSION_RATE * 100}%`,
      estimatedGroupCommission: coachCommissionGroup,
      estimatedPTCommission: coachCommissionPT,
      note: 'Coach assignment not tracked in PunchPass. Paul assigns manually.',
    },
    coaches: COACHES,
  };

  // Save report
  const month = new Date().toISOString().slice(0, 7);
  const filename = `commission-${month}.json`;
  fs.mkdirSync(LOCAL_REPORTS, { recursive: true });
  fs.mkdirSync(VAULT_REPORTS, { recursive: true });
  fs.writeFileSync(path.join(LOCAL_REPORTS, filename), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(VAULT_REPORTS, filename), JSON.stringify(report, null, 2));

  return report;
}

export function formatCommissionTelegram() {
  const r = calculateCommission();
  if (r.error) return `*Commission Report*\n\n${r.error}`;

  let msg = `*Commission Report*\n`;
  msg += `Data as of: ${r.dataAsOf} (${r.dataStaleDays}d stale)\n\n`;
  msg += `*Members: ${r.totalActiveMembers}*\n`;
  for (const [type, count] of Object.entries(r.passBreakdown)) {
    if (count > 0) msg += `  ${type}: ${count}\n`;
  }
  msg += `\n*Revenue Estimates (monthly)*\n`;
  msg += `  Group: $${r.revenue.estimatedGroupMonthly.toLocaleString()}\n`;
  msg += `  PT: $${r.revenue.estimatedPTMonthly.toLocaleString()}\n`;
  msg += `  Total: $${r.revenue.estimatedTotalMonthly.toLocaleString()}\n`;
  msg += `\n*Commission Rates*\n`;
  msg += `  Group: $${r.commission.groupPerHead}/head\n`;
  msg += `  PT: ${r.commission.ptRate}\n`;
  msg += `\n_Coach assignments manual — PunchPass doesn't track._`;

  return msg;
}

export default { calculateCommission, formatCommissionTelegram };
