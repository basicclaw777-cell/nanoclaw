/**
 * leave-tracker.js — Staff leave accrual and tracking
 *
 * HK Employment Ordinance:
 *   - 7 days annual leave after 1 year of continuous employment
 *   - Increases by 1 day per year up to 14 days max
 *   - Statutory holidays: 13 per year (2026)
 *
 * Tracks: leave taken, accrued, balance per staff member.
 * Data stored in ops-config.json under hr.staff[].leave
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

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function yearsOfService(startDate) {
  const start = new Date(startDate);
  const now = new Date();
  return (now - start) / (365.25 * 24 * 60 * 60 * 1000);
}

function annualEntitlement(yearsService) {
  if (yearsService < 1) return 0;
  return Math.min(14, 6 + Math.floor(yearsService));
}

export function getLeaveBalances() {
  const config = loadConfig();
  const staff = config.hr?.staff || config.mpf?.staff || [];

  return staff.map(person => {
    const years = person.startDate ? yearsOfService(person.startDate) : 0;
    const entitlement = annualEntitlement(years);
    const leave = person.leave || { taken: 0, sick: 0 };

    return {
      name: person.name,
      startDate: person.startDate,
      yearsService: Math.round(years * 10) / 10,
      annualEntitlement: entitlement,
      taken: leave.taken || 0,
      sick: leave.sick || 0,
      balance: entitlement - (leave.taken || 0),
    };
  });
}

export function logLeave(staffName, days, type = 'annual') {
  const config = loadConfig();
  const staff = config.hr?.staff || config.mpf?.staff || [];
  const person = staff.find(s => s.name.toLowerCase() === staffName.toLowerCase());

  if (!person) return { error: `Staff "${staffName}" not found in config` };

  if (!person.leave) person.leave = { taken: 0, sick: 0 };
  if (type === 'sick') person.leave.sick += days;
  else person.leave.taken += days;

  saveConfig(config);
  return { ok: true, name: person.name, type, days, newBalance: getLeaveBalances().find(b => b.name === person.name) };
}

export function formatLeaveTelegram() {
  const balances = getLeaveBalances();
  if (balances.length === 0) return '*Leave Tracker*\n\nNo staff configured. Edit ops-config.json.';

  let msg = '*Leave Balances*\n\n';
  for (const b of balances) {
    msg += `*${b.name}*\n`;
    msg += `  Service: ${b.yearsService}yr | Entitlement: ${b.annualEntitlement}d\n`;
    msg += `  Taken: ${b.taken}d | Sick: ${b.sick}d | *Balance: ${b.balance}d*\n\n`;
  }

  return msg;
}

export default { getLeaveBalances, logLeave, formatLeaveTelegram };
