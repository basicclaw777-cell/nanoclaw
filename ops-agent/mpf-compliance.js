/**
 * mpf-compliance.js — MPF contribution tracker + deadline alerts
 *
 * Hong Kong MPF rules:
 *   - Employer must contribute 5% of employee relevant income (cap $1,500/month)
 *   - Contribution due by 10th of following month
 *   - Late = surcharge (5% of outstanding) + possible prosecution
 *
 * Tracks: contribution dates, amounts, staff covered.
 * Alerts: Telegram when contribution due within 14 days.
 * ESM module.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, 'ops-config.json');
const VAULT_HR = path.join(process.env.HOME, 'cathedral-vault', '10_Agents', 'ops', 'hr', 'compliance');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function daysUntil(dateStr) {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

function nextMPFDeadline() {
  // MPF due by 10th of following month
  const now = new Date();
  const year = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  const month = (now.getMonth() + 1) % 12 + 1;
  return `${year}-${String(month).padStart(2, '0')}-10`;
}

export function checkMPFCompliance() {
  const config = loadConfig();
  const mpf = config.mpf || {};
  const staff = mpf.staff || [];
  const lastContribution = mpf.lastContributionDate || null;
  const deadline = nextMPFDeadline();
  const daysLeft = daysUntil(deadline);

  const alerts = [];

  if (daysLeft <= 14) {
    alerts.push({
      type: 'mpf_due',
      severity: daysLeft <= 3 ? 'critical' : 'warning',
      message: `MPF contribution due ${deadline} (${daysLeft} days)`,
      action: 'Submit MPF contribution via HSBC/provider portal',
    });
  }

  if (lastContribution) {
    const daysSinceLast = -daysUntil(lastContribution);
    if (daysSinceLast > 40) {
      alerts.push({
        type: 'mpf_overdue',
        severity: 'critical',
        message: `Last MPF contribution was ${lastContribution} (${daysSinceLast} days ago). Possible missed month.`,
        action: 'Check provider portal immediately. Late surcharge = 5%.',
      });
    }
  }

  if (staff.length === 0) {
    alerts.push({
      type: 'mpf_no_staff',
      severity: 'info',
      message: 'No staff listed in ops-config.json. Add staff to track MPF.',
    });
  }

  return {
    generated: new Date().toISOString(),
    nextDeadline: deadline,
    daysUntilDeadline: daysLeft,
    lastContribution,
    staffCount: staff.length,
    staff,
    alerts,
  };
}

export function formatMPFTelegram() {
  const r = checkMPFCompliance();

  let msg = `*MPF Compliance*\n\n`;
  msg += `Next deadline: ${r.nextDeadline} (${r.daysUntilDeadline} days)\n`;
  if (r.lastContribution) msg += `Last contribution: ${r.lastContribution}\n`;
  msg += `Staff tracked: ${r.staffCount}\n`;

  if (r.alerts.length > 0) {
    msg += `\n*Alerts:*\n`;
    for (const a of r.alerts) {
      const icon = a.severity === 'critical' ? '🔴' : a.severity === 'warning' ? '🟡' : 'ℹ️';
      msg += `${icon} ${a.message}\n`;
      if (a.action) msg += `   → ${a.action}\n`;
    }
  } else {
    msg += `\n✅ No MPF alerts.`;
  }

  return msg;
}

export default { checkMPFCompliance, formatMPFTelegram };
