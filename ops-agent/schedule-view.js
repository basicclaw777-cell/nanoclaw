/**
 * schedule-view.js — Class schedule view from PunchPass data
 *
 * Reads member-data.json for active members + class attendance patterns.
 * Shows: today's classes, this week's bookings, peak/dead slots.
 * ESM module.
 */

import fs from 'fs';
import path from 'path';

const HOME = process.env.HOME;
const MEMBER_DATA = path.join(HOME, 'br-gm-agent', 'reports', 'member-data.json');

export function getScheduleSummary() {
  if (!fs.existsSync(MEMBER_DATA)) {
    return { error: 'member-data.json not found. Run punchpass-export.py first.' };
  }

  const data = JSON.parse(fs.readFileSync(MEMBER_DATA, 'utf-8'));
  const members = data.members || [];

  // Aggregate class types
  const classCounts = {};
  let totalVisits = 0;

  for (const m of members) {
    for (const cls of m.classes_attended || []) {
      classCounts[cls] = (classCounts[cls] || 0) + 1;
    }
    totalVisits += m.visit_count_in_export || 0;
  }

  // Sort classes by popularity
  const classRanking = Object.entries(classCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, attendees: count }));

  // Active vs at-risk
  const active = members.filter(m => !m.churn_risk).length;
  const atRisk = members.filter(m => m.churn_risk).length;
  const expiringSoon = members.filter(m => m.is_expiring).length;

  return {
    generated: new Date().toISOString(),
    dataAsOf: data.export_date,
    totalMembers: data.total_active_members,
    activeEngaged: active,
    atRisk,
    expiringSoon,
    totalVisitsInExport: totalVisits,
    classRanking,
    note: 'PunchPass export is point-in-time. For live class schedule, check PunchPass dashboard.',
  };
}

export function formatScheduleTelegram() {
  const r = getScheduleSummary();
  if (r.error) return `*Schedule*\n\n${r.error}`;

  let msg = `*Schedule Overview*\n`;
  msg += `Data: ${r.dataAsOf}\n\n`;
  msg += `*Members: ${r.totalMembers}*\n`;
  msg += `  Active: ${r.activeEngaged} | At risk: ${r.atRisk} | Expiring: ${r.expiringSoon}\n\n`;
  msg += `*Class Popularity:*\n`;
  for (const c of r.classRanking.slice(0, 10)) {
    msg += `  ${c.name}: ${c.attendees} members\n`;
  }
  msg += `\nTotal visits in export: ${r.totalVisitsInExport}`;
  msg += `\n\n_Live schedule → PunchPass dashboard_`;

  return msg;
}

export default { getScheduleSummary, formatScheduleTelegram };
