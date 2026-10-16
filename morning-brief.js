// morning-brief.js — Daily pressure report generator
// Reads proposal-protocol, gym-eyes, and metrics DB. Gracefully degrades on missing data.

import { pending, overdue, committed, needsCommitment } from './proposal-protocol.js';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'vortex_data', 'metrics.db');
const GYM_EYES_PATH = path.join(__dirname, 'gym-eyes-students.json');

// ── Data readers (each one never crashes) ──

function readProposalPressure() {
  try {
    const pendingItems = pending();
    const overdueItems = overdue();
    const needsCommit = needsCommitment();

    // Committed proposals scheduled this week
    const now = new Date();
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
    const weekEndISO = weekEnd.toISOString();

    const allCommitted = committed(200);
    const thisWeek = allCommitted.filter(p =>
      p.scheduled_at && p.scheduled_at <= weekEndISO
    );

    return {
      approvals_waiting: pendingItems,
      overdue: overdueItems,
      needs_commitment: needsCommit,
      deadlines_this_week: thisWeek,
    };
  } catch (err) {
    return { approvals_waiting: [], overdue: [], needs_commitment: [], deadlines_this_week: [], error: err.message };
  }
}

function readRevenue() {
  try {
    if (!existsSync(DB_PATH)) return null;
    const db = new Database(DB_PATH, { readonly: true });

    // Check if any revenue-related tables exist
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);

    // Look for trading outcomes in the outcomes table
    let revenue = null;
    if (tables.includes('outcomes')) {
      const recentOutcomes = db.prepare(`
        SELECT * FROM outcomes
        WHERE domain IN ('finance', 'trading', 'revenue')
        ORDER BY recorded_at DESC LIMIT 5
      `).all();

      if (recentOutcomes.length) {
        const successes = recentOutcomes.filter(o => o.result === 'SUCCESS').length;
        revenue = {
          recent_outcomes: recentOutcomes,
          summary: `${recentOutcomes.length} recent finance outcomes (${successes} success)`,
        };
      }
    }

    db.close();
    return revenue;
  } catch (err) {
    return null;
  }
}

function readStudentsAtRisk() {
  try {
    if (!existsSync(GYM_EYES_PATH)) return [];
    const raw = readFileSync(GYM_EYES_PATH, 'utf8');
    const students = JSON.parse(raw);

    if (!Array.isArray(students) || !students.length) return [];

    // Flag at-risk students: absent > 14 days, declining attendance, or explicitly flagged
    const now = Date.now();
    const TWO_WEEKS = 14 * 86400000;

    return students.filter(s => {
      if (s.at_risk || s.flagged) return true;
      if (s.last_seen || s.last_attendance) {
        const lastDate = new Date(s.last_seen || s.last_attendance);
        if (now - lastDate.getTime() > TWO_WEEKS) return true;
      }
      if (s.status === 'at_risk' || s.status === 'lapsed') return true;
      return false;
    }).map(s => ({
      name: s.name || s.student_name || 'Unknown',
      reason: s.at_risk_reason || s.reason || (s.status === 'lapsed' ? 'lapsed' : 'absent >14 days'),
      last_seen: s.last_seen || s.last_attendance || null,
      student_id: s.id || s.student_id || null,
    }));
  } catch (err) {
    return [];
  }
}

// ── Main generator ──

export async function generateBrief() {
  const date = new Date().toISOString().slice(0, 10);

  const proposalData = readProposalPressure();
  const revenue = readRevenue();
  const studentsAtRisk = readStudentsAtRisk();

  const sections = {
    approvals_waiting: proposalData.approvals_waiting,
    overdue: proposalData.overdue,
    deadlines_this_week: proposalData.deadlines_this_week,
    students_at_risk: studentsAtRisk,
    schedule_changes: [], // stub — optimizations suggested later
  };

  // Only include revenue section if data exists
  if (revenue) {
    sections.revenue = revenue;
  }

  // Only include needs_commitment if there are items
  if (proposalData.needs_commitment.length) {
    sections.needs_commitment = proposalData.needs_commitment;
  }

  // Pick the most pressing CTA
  let reply_action = 'OPEN APPROVALS';
  if (proposalData.overdue.length) {
    reply_action = `${proposalData.overdue.length} OVERDUE — REVIEW NOW`;
  } else if (proposalData.approvals_waiting.length) {
    reply_action = `${proposalData.approvals_waiting.length} APPROVALS WAITING`;
  } else if (studentsAtRisk.length) {
    reply_action = `${studentsAtRisk.length} STUDENTS AT RISK`;
  }

  return { date, sections, reply_action };
}

// ── Text renderer ──

export function renderBriefAsText(briefData) {
  const lines = [`CATHEDRAL BRIEF — ${briefData.date}`, '='.repeat(40)];
  const s = briefData.sections;

  if (s.overdue && s.overdue.length) {
    lines.push('', `OVERDUE (${s.overdue.length}):`);
    s.overdue.forEach(p => {
      lines.push(`  #${p.id} ${trunc(p.proposal, 50)} — due ${p.scheduled_end || '?'}`);
    });
  }

  if (s.approvals_waiting && s.approvals_waiting.length) {
    lines.push('', `APPROVALS WAITING (${s.approvals_waiting.length}):`);
    s.approvals_waiting.forEach(p => {
      lines.push(`  #${p.id} [${p.agent}] ${trunc(p.proposal, 50)}`);
    });
  }

  if (s.needs_commitment && s.needs_commitment.length) {
    lines.push('', `NEEDS TIME ALLOCATED (${s.needs_commitment.length}):`);
    s.needs_commitment.forEach(p => {
      lines.push(`  #${p.id} [${p.agent}] ${trunc(p.proposal, 50)}`);
    });
  }

  if (s.deadlines_this_week && s.deadlines_this_week.length) {
    lines.push('', `THIS WEEK (${s.deadlines_this_week.length}):`);
    s.deadlines_this_week.forEach(p => {
      lines.push(`  #${p.id} ${trunc(p.proposal, 40)} — ${fmtDate(p.scheduled_at)}`);
    });
  }

  if (s.students_at_risk && s.students_at_risk.length) {
    lines.push('', `STUDENTS AT RISK (${s.students_at_risk.length}):`);
    s.students_at_risk.forEach(st => {
      lines.push(`  ${st.name}: ${st.reason}${st.last_seen ? ` (last: ${st.last_seen.slice(0, 10)})` : ''}`);
    });
  }

  if (s.revenue && s.revenue.summary) {
    lines.push('', `REVENUE: ${s.revenue.summary}`);
  }

  const hasContent = lines.length > 2;
  if (!hasContent) {
    lines.push('', 'All clear. No pressure items today.');
  }

  lines.push('', '-'.repeat(40), `ACTION: ${briefData.reply_action}`);
  return lines.join('\n');
}

// ── HTML renderer (cockpit aesthetic: dark #0d1117, gold #f7b408, monospace) ──

export function renderBriefAsHTML(briefData) {
  const s = briefData.sections;

  const sectionHTML = [];

  if (s.overdue && s.overdue.length) {
    sectionHTML.push(htmlSection('OVERDUE', s.overdue.map(p =>
      `<span class="id">#${p.id}</span> ${esc(trunc(p.proposal, 50))} <span class="meta">due ${esc(p.scheduled_end || '?')}</span>`
    ), 'danger'));
  }

  if (s.approvals_waiting && s.approvals_waiting.length) {
    sectionHTML.push(htmlSection('APPROVALS WAITING', s.approvals_waiting.map(p =>
      `<span class="id">#${p.id}</span> <span class="agent">[${esc(p.agent)}]</span> ${esc(trunc(p.proposal, 50))}`
    ), 'warn'));
  }

  if (s.needs_commitment && s.needs_commitment.length) {
    sectionHTML.push(htmlSection('NEEDS TIME ALLOCATED', s.needs_commitment.map(p =>
      `<span class="id">#${p.id}</span> <span class="agent">[${esc(p.agent)}]</span> ${esc(trunc(p.proposal, 50))}`
    ), 'warn'));
  }

  if (s.deadlines_this_week && s.deadlines_this_week.length) {
    sectionHTML.push(htmlSection('THIS WEEK', s.deadlines_this_week.map(p =>
      `<span class="id">#${p.id}</span> ${esc(trunc(p.proposal, 40))} <span class="meta">${esc(fmtDate(p.scheduled_at))}</span>`
    ), 'info'));
  }

  if (s.students_at_risk && s.students_at_risk.length) {
    sectionHTML.push(htmlSection('STUDENTS AT RISK', s.students_at_risk.map(st =>
      `<span class="name">${esc(st.name)}</span>: ${esc(st.reason)}${st.last_seen ? ` <span class="meta">(last: ${st.last_seen.slice(0, 10)})</span>` : ''}`
    ), 'danger'));
  }

  if (s.revenue && s.revenue.summary) {
    sectionHTML.push(htmlSection('REVENUE', [`${esc(s.revenue.summary)}`], 'info'));
  }

  if (!sectionHTML.length) {
    sectionHTML.push('<div class="section info"><div class="section-title">ALL CLEAR</div><div class="item">No pressure items today.</div></div>');
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cathedral Brief — ${esc(briefData.date)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0d1117;
    color: #c9d1d9;
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 13px;
    line-height: 1.5;
    padding: 24px;
  }
  .header {
    border-bottom: 1px solid #f7b408;
    padding-bottom: 12px;
    margin-bottom: 20px;
  }
  .header h1 {
    color: #f7b408;
    font-size: 16px;
    font-weight: 600;
    letter-spacing: 2px;
    text-transform: uppercase;
  }
  .header .date { color: #8b949e; font-size: 12px; margin-top: 4px; }
  .section { margin-bottom: 16px; }
  .section-title {
    font-size: 11px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    padding: 4px 8px;
    margin-bottom: 6px;
    font-weight: 600;
  }
  .danger .section-title { color: #0d1117; background: #f85149; }
  .warn .section-title { color: #0d1117; background: #f7b408; }
  .info .section-title { color: #c9d1d9; background: #21262d; border-left: 3px solid #f7b408; }
  .item {
    padding: 3px 8px;
    border-left: 2px solid #21262d;
    margin-left: 4px;
    margin-bottom: 2px;
  }
  .id { color: #f7b408; }
  .agent { color: #8b949e; }
  .meta { color: #6e7681; font-size: 11px; }
  .name { color: #f0f6fc; font-weight: 600; }
  .cta {
    margin-top: 24px;
    padding: 10px 16px;
    border: 1px solid #f7b408;
    color: #f7b408;
    text-align: center;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
  }
</style>
</head>
<body>
  <div class="header">
    <h1>Cathedral Brief</h1>
    <div class="date">${esc(briefData.date)}</div>
  </div>
  ${sectionHTML.join('\n  ')}
  <div class="cta">${esc(briefData.reply_action)}</div>
</body>
</html>`;
}

// ── Utilities ──

function htmlSection(title, items, cls) {
  const itemsHTML = items.map(i => `<div class="item">${i}</div>`).join('\n    ');
  return `<div class="section ${cls}">
    <div class="section-title">${esc(title)}</div>
    ${itemsHTML}
  </div>`;
}

function trunc(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len - 1) + '...' : str;
}

function fmtDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${days[d.getDay()]} ${iso.slice(5, 10)} ${iso.slice(11, 16)}`;
  } catch {
    return iso.slice(0, 16);
  }
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
