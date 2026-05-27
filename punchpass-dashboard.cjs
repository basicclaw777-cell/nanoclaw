const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'vortex_data', 'punchpass.db');

function createRouter() {
  const router = express.Router();

  router.get('/punchpass', (req, res) => {
    const db = new Database(DB_PATH, { readonly: true });

    try {
      // Latest run
      const latestRun = db.prepare(`SELECT * FROM scrape_runs ORDER BY id DESC LIMIT 1`).get();

      // Last 30 daily snapshots
      const snapshots = db.prepare(`SELECT * FROM daily_snapshot ORDER BY date DESC LIMIT 30`).all();

      // Latest attendance data
      const runId = latestRun?.id;
      const attendance = runId ? db.prepare(`SELECT * FROM customer_attendance WHERE scrape_run_id = ? ORDER BY attended DESC`).all(runId) : [];
      const activePasses = runId ? db.prepare(`SELECT * FROM active_passes WHERE scrape_run_id = ? ORDER BY last_name`).all(runId) : [];
      const noPass = runId ? db.prepare(`SELECT * FROM no_active_pass WHERE scrape_run_id = ? ORDER BY last_name`).all(runId) : [];
      const expiring = runId ? db.prepare(`SELECT * FROM passes_expiring WHERE scrape_run_id = ? ORDER BY expires_on ASC`).all(runId) : [];
      const sales = runId ? db.prepare(`SELECT * FROM sales_details WHERE scrape_run_id = ?`).all(runId) : [];
      const noShows = runId ? db.prepare(`SELECT * FROM no_shows WHERE scrape_run_id = ? ORDER BY date DESC`).all(runId) : [];
      const classRev = runId ? db.prepare(`SELECT * FROM class_revenue WHERE scrape_run_id = ? ORDER BY total_attendances DESC`).all(runId) : [];

      // All runs for history
      const runs = db.prepare(`SELECT * FROM scrape_runs ORDER BY id DESC LIMIT 30`).all();

      const today = snapshots[0] || {};
      const yesterday = snapshots[1] || {};

      res.send(renderDashboard({
        latestRun, snapshots, attendance, activePasses, noPass,
        expiring, sales, noShows, classRev, runs, today, yesterday
      }));
    } finally {
      db.close();
    }
  });

  // API endpoints for Telegram bot
  router.get('/api/punchpass/summary', (req, res) => {
    const db = new Database(DB_PATH, { readonly: true });
    try {
      const snap = db.prepare(`SELECT * FROM daily_snapshot ORDER BY date DESC LIMIT 1`).get();
      res.json(snap || { error: 'No data yet' });
    } finally {
      db.close();
    }
  });

  router.get('/api/punchpass/expiring', (req, res) => {
    const db = new Database(DB_PATH, { readonly: true });
    try {
      const runId = db.prepare(`SELECT MAX(id) as id FROM scrape_runs WHERE status = 'completed'`).get()?.id;
      const data = runId ? db.prepare(`SELECT * FROM passes_expiring WHERE scrape_run_id = ? ORDER BY expires_on ASC`).all(runId) : [];
      res.json(data);
    } finally {
      db.close();
    }
  });

  router.get('/api/punchpass/no-pass', (req, res) => {
    const db = new Database(DB_PATH, { readonly: true });
    try {
      const runId = db.prepare(`SELECT MAX(id) as id FROM scrape_runs WHERE status = 'completed'`).get()?.id;
      const data = runId ? db.prepare(`SELECT * FROM no_active_pass WHERE scrape_run_id = ? ORDER BY last_name`).all(runId) : [];
      res.json(data);
    } finally {
      db.close();
    }
  });

  return router;
}

function renderDashboard(data) {
  const { today, yesterday, attendance, activePasses, noPass, expiring, sales, noShows, classRev, runs, snapshots } = data;

  const delta = (curr, prev, key) => {
    if (!prev || !prev[key]) return '';
    const diff = (curr[key] || 0) - (prev[key] || 0);
    if (diff === 0) return '';
    return diff > 0 ? `<span class="up">+${diff}</span>` : `<span class="down">${diff}</span>`;
  };

  const sparkData = snapshots.reverse().map(s => s.month_attendances || 0);

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Punchpass Dashboard — Basic Reflex</title>
<style>
  :root { --bg: #0a0a0f; --card: #12121a; --border: #1e1e2e; --text: #e0e0e0; --dim: #666; --amber: #f0a030; --green: #30d060; --red: #e04040; --blue: #4080f0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', sans-serif; padding: 20px; }
  h1 { color: var(--amber); margin-bottom: 4px; font-size: 24px; }
  .subtitle { color: var(--dim); margin-bottom: 20px; font-size: 13px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .kpi { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
  .kpi .label { color: var(--dim); font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
  .kpi .value { font-size: 28px; font-weight: 700; margin: 4px 0; }
  .kpi .up { color: var(--green); font-size: 13px; }
  .kpi .down { color: var(--red); font-size: 13px; }
  .section { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 16px; margin-bottom: 16px; }
  .section h2 { color: var(--amber); font-size: 16px; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; color: var(--dim); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 6px; border-bottom: 1px solid var(--border); }
  td { padding: 8px 6px; border-bottom: 1px solid var(--border); }
  tr:hover { background: rgba(240, 160, 48, 0.05); }
  .status-ok { color: var(--green); }
  .status-warn { color: var(--amber); }
  .status-bad { color: var(--red); }
  .tabs { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
  .tab { padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; background: var(--border); color: var(--dim); border: none; }
  .tab.active { background: var(--amber); color: #000; font-weight: 600; }
  .tab-content { display: none; }
  .tab-content.active { display: block; }
  .run-status { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
  .run-status.completed { background: var(--green); }
  .run-status.failed { background: var(--red); }
  .run-status.running { background: var(--amber); animation: pulse 1s infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
  .empty { color: var(--dim); text-align: center; padding: 40px; }
  canvas { width: 100%; height: 60px; }
</style>
</head><body>

<h1>📊 Punchpass — Basic Reflex</h1>
<div class="subtitle">Last scrape: ${data.latestRun ? `${data.latestRun.completed_at || data.latestRun.started_at} — <span class="run-status ${data.latestRun.status}"></span>${data.latestRun.status}` : 'Never'}</div>

<div class="grid">
  <div class="kpi"><div class="label">Active Customers</div><div class="value">${today.total_customers || '—'}</div>${delta(today, yesterday, 'total_customers')}</div>
  <div class="kpi"><div class="label">Active Passes</div><div class="value">${today.active_passes || '—'}</div>${delta(today, yesterday, 'active_passes')}</div>
  <div class="kpi"><div class="label">Month Revenue</div><div class="value">${today.month_revenue || '—'}</div></div>
  <div class="kpi"><div class="label">Month Attendances</div><div class="value">${today.month_attendances || '—'}</div>${delta(today, yesterday, 'month_attendances')}</div>
  <div class="kpi"><div class="label">No-Shows</div><div class="value">${today.month_no_shows || '—'}</div></div>
  <div class="kpi"><div class="label">Expiring Soon</div><div class="value ${(today.passes_expiring_soon || 0) > 3 ? 'status-warn' : ''}">${today.passes_expiring_soon || '—'}</div></div>
  <div class="kpi"><div class="label">No Active Pass</div><div class="value ${(today.no_active_pass || 0) > 5 ? 'status-bad' : ''}">${today.no_active_pass || '—'}</div></div>
  <div class="kpi"><div class="label">Memberships</div><div class="value">${today.memberships_active || '—'}</div></div>
</div>

<div class="tabs">
  <button class="tab active" onclick="showTab('attendance')">Attendance</button>
  <button class="tab" onclick="showTab('sales')">Sales</button>
  <button class="tab" onclick="showTab('passes')">Active Passes</button>
  <button class="tab" onclick="showTab('expiring')">Expiring</button>
  <button class="tab" onclick="showTab('nopass')">No Pass</button>
  <button class="tab" onclick="showTab('noshows')">No-Shows</button>
  <button class="tab" onclick="showTab('classes')">Classes</button>
  <button class="tab" onclick="showTab('history')">Scrape History</button>
</div>

<div class="section tab-content active" id="tab-attendance">
  <h2>Customer Attendance Summary</h2>
  ${attendance.length === 0 ? '<div class="empty">No data yet — run the scraper first</div>' : `
  <table>
    <tr><th>Name</th><th>Last Attendance</th><th>Attended</th><th>Late Cancel</th><th>No Shows</th></tr>
    ${attendance.map(a => `<tr><td>${a.first_name} ${a.last_name}</td><td>${a.last_attendance || '—'}</td><td>${a.attended}</td><td>${a.late_cancel}</td><td class="${a.no_shows > 0 ? 'status-bad' : ''}">${a.no_shows}</td></tr>`).join('')}
  </table>`}
</div>

<div class="section tab-content" id="tab-sales">
  <h2>Pass Sales Details</h2>
  ${sales.length === 0 ? '<div class="empty">No data yet</div>' : `
  <table>
    <tr><th>Pass</th><th>Sold</th><th>Revenue</th></tr>
    ${sales.map(s => `<tr><td>${s.pass_name || '—'}</td><td>${s.number_sold}</td><td>${s.revenue}</td></tr>`).join('')}
  </table>`}
</div>

<div class="section tab-content" id="tab-passes">
  <h2>Active Passes (${activePasses.length})</h2>
  ${activePasses.length === 0 ? '<div class="empty">No data yet</div>' : `
  <table>
    <tr><th>Name</th><th>Pass</th><th>Active</th><th>Expires</th><th>Value</th><th>Punches Left</th><th>Status</th></tr>
    ${activePasses.map(p => `<tr><td>${p.first_name} ${p.last_name}</td><td>${p.pass || '—'}</td><td>${p.active_on || '—'}</td><td>${p.expires_on || '—'}</td><td>${p.remaining_value || '—'}</td><td>${p.punches_left || '—'}</td><td>${p.status || '—'}</td></tr>`).join('')}
  </table>`}
</div>

<div class="section tab-content" id="tab-expiring">
  <h2>Passes Expiring Soon (${expiring.length})</h2>
  ${expiring.length === 0 ? '<div class="empty">No expiring passes</div>' : `
  <table>
    <tr><th>Name</th><th>Pass</th><th>Expires</th><th>Punches Left</th></tr>
    ${expiring.map(e => `<tr><td>${e.first_name} ${e.last_name}</td><td>${e.pass || '—'}</td><td class="status-warn">${e.expires_on || '—'}</td><td>${e.punches_left || '—'}</td></tr>`).join('')}
  </table>`}
</div>

<div class="section tab-content" id="tab-nopass">
  <h2>Customers Without Active Pass (${noPass.length})</h2>
  ${noPass.length === 0 ? '<div class="empty">Everyone has a pass!</div>' : `
  <table>
    <tr><th>Name</th><th>Email</th><th>Last Attendance</th><th>Total Attended</th></tr>
    ${noPass.map(n => `<tr><td>${n.first_name} ${n.last_name}</td><td>${n.email || '—'}</td><td>${n.last_attendance || '—'}</td><td>${n.total_attended || 0}</td></tr>`).join('')}
  </table>`}
</div>

<div class="section tab-content" id="tab-noshows">
  <h2>No-Shows & Late Cancels (${noShows.length})</h2>
  ${noShows.length === 0 ? '<div class="empty">No no-shows this period</div>' : `
  <table>
    <tr><th>Name</th><th>Date</th><th>Class</th><th>Type</th></tr>
    ${noShows.map(n => `<tr><td>${n.first_name} ${n.last_name}</td><td>${n.date || '—'}</td><td>${n.class_name || '—'}</td><td class="${n.type === 'No Show' ? 'status-bad' : 'status-warn'}">${n.type || '—'}</td></tr>`).join('')}
  </table>`}
</div>

<div class="section tab-content" id="tab-classes">
  <h2>Attendance & Revenue by Class</h2>
  ${classRev.length === 0 ? '<div class="empty">No data yet</div>' : `
  <table>
    <tr><th>Class</th><th>Total Classes</th><th>Total Attendance</th><th>Avg Attendance</th><th>Total Revenue</th><th>Avg Revenue</th></tr>
    ${classRev.map(c => `<tr><td>${c.class_name || '—'}</td><td>${c.total_classes || 0}</td><td>${c.total_attendances || 0}</td><td>${(c.avg_attendance || 0).toFixed(1)}</td><td>${c.total_revenue || '—'}</td><td>${c.avg_revenue || '—'}</td></tr>`).join('')}
  </table>`}
</div>

<div class="section tab-content" id="tab-history">
  <h2>Scrape History</h2>
  <table>
    <tr><th>Run</th><th>Started</th><th>Completed</th><th>Status</th><th>Reports</th><th>Error</th></tr>
    ${runs.map(r => `<tr><td>#${r.id}</td><td>${r.started_at}</td><td>${r.completed_at || '—'}</td><td><span class="run-status ${r.status}"></span>${r.status}</td><td>${r.reports_scraped}</td><td class="status-bad">${r.error || ''}</td></tr>`).join('')}
  </table>
</div>

<script>
function showTab(name) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  event.target.classList.add('active');
}
</script>
</body></html>`;
}

module.exports = { createRouter };
