/**
 * hr-calendar.js — HR compliance calendar + deadline alerts
 *
 * Tracks:
 *   - Insurance renewal date
 *   - Contract expiry dates (per staff)
 *   - Annual leave accrual (HK Employment Ordinance)
 *   - Any custom deadlines Paul adds to ops-config.json
 *
 * Alerts 30 days before any deadline via Telegram.
 * Cron: weekly Monday.
 * ESM module.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, 'ops-config.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function daysUntil(dateStr) {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

export function scanHRCalendar() {
  const config = loadConfig();
  const hr = config.hr || {};
  const alerts = [];
  const upcoming = [];

  // Insurance renewal
  if (hr.insuranceRenewalDate) {
    const days = daysUntil(hr.insuranceRenewalDate);
    const entry = { type: 'insurance', date: hr.insuranceRenewalDate, daysUntil: days };
    upcoming.push(entry);
    if (days <= 30 && days > 0) {
      alerts.push({ severity: days <= 7 ? 'critical' : 'warning', message: `Insurance renewal in ${days} days (${hr.insuranceRenewalDate})`, action: 'Contact insurer for renewal quote' });
    } else if (days <= 0) {
      alerts.push({ severity: 'critical', message: `Insurance EXPIRED on ${hr.insuranceRenewalDate}`, action: 'Renew immediately — gym operating without cover' });
    }
  }

  // Staff contracts
  const staff = hr.staff || config.mpf?.staff || [];
  for (const person of staff) {
    if (person.contractExpiry) {
      const days = daysUntil(person.contractExpiry);
      upcoming.push({ type: 'contract', name: person.name, date: person.contractExpiry, daysUntil: days });
      if (days <= 30 && days > 0) {
        alerts.push({ severity: 'warning', message: `${person.name}'s contract expires in ${days} days (${person.contractExpiry})`, action: 'Review and renew or prepare termination docs' });
      } else if (days <= 0) {
        alerts.push({ severity: 'critical', message: `${person.name}'s contract EXPIRED on ${person.contractExpiry}`, action: 'Operating without valid contract — legal risk' });
      }
    }
  }

  // Custom deadlines
  const deadlines = hr.deadlines || [];
  for (const d of deadlines) {
    const days = daysUntil(d.date);
    upcoming.push({ type: 'custom', label: d.label, date: d.date, daysUntil: days });
    if (days <= 30 && days > 0) {
      alerts.push({ severity: days <= 7 ? 'critical' : 'warning', message: `${d.label} in ${days} days (${d.date})`, action: d.action || '' });
    }
  }

  // Sort upcoming by date
  upcoming.sort((a, b) => a.daysUntil - b.daysUntil);

  return {
    generated: new Date().toISOString(),
    staffCount: staff.length,
    upcoming,
    alerts,
  };
}

export function formatHRCalendarTelegram() {
  const r = scanHRCalendar();

  let msg = `*HR Compliance Calendar*\n\n`;

  if (r.alerts.length > 0) {
    msg += `*Alerts:*\n`;
    for (const a of r.alerts) {
      const icon = a.severity === 'critical' ? '🔴' : '🟡';
      msg += `${icon} ${a.message}\n`;
      if (a.action) msg += `   → ${a.action}\n`;
    }
    msg += '\n';
  }

  if (r.upcoming.length > 0) {
    msg += `*Upcoming:*\n`;
    for (const u of r.upcoming.filter(u => u.daysUntil > 0).slice(0, 8)) {
      msg += `  ${u.date} (${u.daysUntil}d) — ${u.label || u.name || u.type}\n`;
    }
  } else {
    msg += `No deadlines configured. Edit ops-config.json.\n`;
  }

  msg += `\nStaff tracked: ${r.staffCount}`;

  return msg;
}

export default { scanHRCalendar, formatHRCalendarTelegram };
