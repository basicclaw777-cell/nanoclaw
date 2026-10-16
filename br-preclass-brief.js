// br-preclass-brief.js — Daily pre-class coaching brief for Paul
// ESM module. PM2 cron: 7am HKT daily (0 23 * * * UTC)
// Reads: student profiles, gym eyes sessions, coaching notes, challenge state
// Sends: formatted Telegram message + HTML visual brief

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME || '/Users/basicclaw777';

// ── Config ──────────────────────────────────────────────────────────────────

const PROFILES_DIR_SI = path.join(HOME, 'nanoclaw', 'student-intelligence', 'profiles');
const PROFILES_DIR_GE = path.join(HOME, 'basic-reflex', 'gym-eyes', 'students');
const GYM_EYES_SESSIONS = path.join(HOME, 'basic-reflex', 'gym-eyes', 'sessions');
const CHALLENGE_FILE = path.join(HOME, 'basic-reflex', 'gym-eyes', 'challenge.json');
const BRIEF_DIR = path.join(HOME, 'nanoclaw', 'br-briefs');
const HTML_OUT = path.join(BRIEF_DIR, 'latest-brief.html');

// Telegram
const envFile = fs.readFileSync(path.join(HOME, 'nanoclaw', '.env'), 'utf-8');
const TOKEN = envFile.match(/TELEGRAM_TOKEN=(.+)/)?.[1]?.trim();
const CHAT_ID = envFile.match(/PAUL_CHAT_ID=(.+)/)?.[1]?.trim();
const API = `https://api.telegram.org/bot${TOKEN}`;

// ── Helpers ─────────────────────────────────────────────────────────────────

function daysSince(dateStr) {
  if (!dateStr) return Infinity;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function loadJSON(fp) {
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); }
  catch { return null; }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── Data Collection ─────────────────────────────────────────────────────────

function loadAllProfiles() {
  const profiles = [];
  // Load from both locations (student-intelligence and gym-eyes)
  for (const dir of [PROFILES_DIR_SI, PROFILES_DIR_GE]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const p = loadJSON(path.join(dir, f));
      if (p && p.name && !profiles.find(x => x.name === p.name)) {
        profiles.push(p);
      }
    }
  }
  return profiles;
}

function loadRecentSessions(days = 7) {
  if (!fs.existsSync(GYM_EYES_SESSIONS)) return [];
  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
  return fs.readdirSync(GYM_EYES_SESSIONS)
    .filter(f => f.startsWith('session-') && f.endsWith('.json'))
    .map(f => {
      const data = loadJSON(path.join(GYM_EYES_SESSIONS, f));
      if (!data) return null;
      const dateMatch = f.match(/session-(\d{8})/);
      if (dateMatch) data._filename = f;
      return data;
    })
    .filter(d => d && d._meta?.analyzedAt && new Date(d._meta.analyzedAt).getTime() > cutoff);
}

function loadChallenge() {
  return loadJSON(CHALLENGE_FILE);
}

// ── Analysis ────────────────────────────────────────────────────────────────

function analyzeProfiles(profiles) {
  const now = new Date();
  const today = now.toLocaleDateString('en-US', { weekday: 'long' });

  const atRisk = [];      // attendance dropping
  const improving = [];   // technique trending up
  const milestones = [];  // approaching milestones
  const notSeen = [];     // 7+ days absent
  const expiring = [];    // membership expiring within 14 days

  for (const p of profiles) {
    if (!p || !p.name) continue;

    // At risk: attendance dropping or red risk level
    if (p.risk_level === 'red' || p.risk_level === 'yellow') {
      atRisk.push({
        name: p.name,
        risk: p.risk_level,
        classes: p.attendance?.total_classes || 0,
        last30: p.attendance?.last_30_days || 0,
        trend: p.attendance?.trend || 'unknown'
      });
    }

    // Not seen recently
    const lastAttendance = p.attendance?.history?.slice(-1)[0]?.date;
    const absent = daysSince(lastAttendance);
    if (absent >= 7 && absent < 60) {
      notSeen.push({ name: p.name, days: absent });
    }

    // Technique improvement
    const scores = p.technique?.overall_scores || [];
    if (scores.length >= 2) {
      const recent = scores.slice(-1)[0]?.score || 0;
      const prev = scores.slice(-2, -1)[0]?.score || 0;
      if (recent > prev + 0.05) {
        improving.push({ name: p.name, from: prev, to: recent, delta: ((recent - prev) * 100).toFixed(0) });
      }
    }

    // Membership expiring
    if (p.membership?.expiry) {
      const daysLeft = -daysSince(p.membership.expiry);
      if (daysLeft > 0 && daysLeft <= 14) {
        expiring.push({ name: p.name, days: daysLeft, type: p.membership.type });
      }
    }

    // Milestones
    const totalClasses = p.attendance?.total_classes || 0;
    const milestoneMarks = [10, 25, 50, 75, 100, 150, 200, 250, 300];
    for (const m of milestoneMarks) {
      if (totalClasses >= m - 2 && totalClasses < m) {
        milestones.push({ name: p.name, classes: totalClasses, milestone: m });
        break;
      }
    }
  }

  return { today, atRisk, improving, milestones, notSeen, expiring, totalStudents: profiles.length };
}

function analyzeChallenge(challenge) {
  if (!challenge?.participants) return null;
  const active = Object.entries(challenge.participants)
    .filter(([_, p]) => p.streak > 0)
    .sort((a, b) => b[1].totalPunches - a[1].totalPunches)
    .slice(0, 5);
  return { active, total: Object.keys(challenge.participants).length };
}

// ── Format Telegram Message ─────────────────────────────────────────────────

function formatBrief(analysis, sessions, challenge) {
  const lines = [];
  const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });

  lines.push(`BASIC REFLEX — ${date}`);
  lines.push(`${analysis.totalStudents} students tracked`);
  lines.push('');

  // At Risk
  if (analysis.atRisk.length > 0) {
    lines.push('AT RISK');
    for (const s of analysis.atRisk.slice(0, 5)) {
      const icon = s.risk === 'red' ? '!!' : '!';
      lines.push(`  ${icon} ${s.name} — ${s.last30} classes last 30d, ${s.trend}`);
    }
    lines.push('');
  }

  // Not Seen
  if (analysis.notSeen.length > 0) {
    lines.push('HAVEN\'T SEEN');
    for (const s of analysis.notSeen.sort((a, b) => b.days - a.days).slice(0, 5)) {
      lines.push(`  ${s.name} — ${s.days} days`);
    }
    lines.push('');
  }

  // Improving
  if (analysis.improving.length > 0) {
    lines.push('IMPROVING');
    for (const s of analysis.improving) {
      lines.push(`  ${s.name} — +${s.delta}% technique score`);
    }
    lines.push('');
  }

  // Milestones
  if (analysis.milestones.length > 0) {
    lines.push('APPROACHING MILESTONES');
    for (const s of analysis.milestones) {
      lines.push(`  ${s.name} — ${s.classes} classes (${s.milestone} milestone)`);
    }
    lines.push('');
  }

  // Expiring memberships
  if (analysis.expiring.length > 0) {
    lines.push('MEMBERSHIPS EXPIRING');
    for (const s of analysis.expiring) {
      lines.push(`  ${s.name} — ${s.days} days left (${s.type || 'pass'})`);
    }
    lines.push('');
  }

  // Recent sessions
  if (sessions.length > 0) {
    lines.push(`RECENT SESSIONS: ${sessions.length} in last 7 days`);
    lines.push('');
  }

  // Challenge
  const challengeInfo = analyzeChallenge(challenge);
  if (challengeInfo && challengeInfo.active.length > 0) {
    lines.push('100 PUNCHES CHALLENGE');
    for (const [name, data] of challengeInfo.active) {
      lines.push(`  ${name} — ${data.totalPunches} punches, ${data.streak}d streak`);
    }
    lines.push('');
  }

  // Focus suggestions
  lines.push('FOCUS TODAY');
  if (analysis.atRisk.length > 0) {
    lines.push(`  Check in with ${analysis.atRisk[0].name} — attendance dropping`);
  }
  if (analysis.milestones.length > 0) {
    lines.push(`  Celebrate ${analysis.milestones[0].name} — near ${analysis.milestones[0].milestone} classes`);
  }
  if (analysis.improving.length > 0) {
    lines.push(`  Acknowledge ${analysis.improving[0].name} — technique jumping`);
  }
  if (analysis.atRisk.length === 0 && analysis.milestones.length === 0 && analysis.improving.length === 0) {
    lines.push('  All good — focus on quality coaching');
  }

  return lines.join('\n');
}

// ── HTML Visual Brief ───────────────────────────────────────────────────────

function generateHTML(analysis, sessions, challenge) {
  const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
  const challengeInfo = analyzeChallenge(challenge);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BR Daily Brief — ${date}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'SF Pro Display', -apple-system, system-ui, sans-serif;
    background: #0a0a0a;
    color: #e5e5e5;
    min-height: 100vh;
    padding: 20px;
  }
  .container { max-width: 600px; margin: 0 auto; }
  .header {
    text-align: center;
    padding: 30px 0 20px;
    border-bottom: 1px solid #222;
    margin-bottom: 24px;
  }
  .header h1 {
    font-size: 14px;
    letter-spacing: 4px;
    text-transform: uppercase;
    color: #8B2020;
    margin-bottom: 8px;
  }
  .header .date {
    font-size: 28px;
    font-weight: 300;
    color: #fff;
  }
  .header .count {
    font-size: 13px;
    color: #666;
    margin-top: 6px;
  }
  .section {
    margin-bottom: 24px;
    padding: 16px;
    background: #111;
    border-radius: 8px;
    border-left: 3px solid #333;
  }
  .section.risk { border-left-color: #ef4444; }
  .section.absent { border-left-color: #f59e0b; }
  .section.improving { border-left-color: #22c55e; }
  .section.milestone { border-left-color: #8B2020; }
  .section.expiring { border-left-color: #f97316; }
  .section.challenge { border-left-color: #a855f7; }
  .section.focus { border-left-color: #3b82f6; background: #0d1117; }
  .section h2 {
    font-size: 11px;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: #666;
    margin-bottom: 12px;
  }
  .student-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid #1a1a1a;
  }
  .student-row:last-child { border-bottom: none; }
  .student-name { font-weight: 500; color: #fff; }
  .student-detail { font-size: 13px; color: #888; }
  .risk-badge {
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 10px;
    font-weight: 600;
    text-transform: uppercase;
  }
  .risk-red { background: #2d1111; color: #ef4444; }
  .risk-yellow { background: #2d2511; color: #f59e0b; }
  .focus-item {
    padding: 10px 0;
    border-bottom: 1px solid #1a1a1a;
    font-size: 15px;
    color: #ccc;
  }
  .focus-item:last-child { border-bottom: none; }
  .focus-name { color: #fff; font-weight: 500; }
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 24px;
  }
  .stat-card {
    background: #111;
    border-radius: 8px;
    padding: 16px;
    text-align: center;
  }
  .stat-value {
    font-size: 28px;
    font-weight: 300;
    color: #fff;
  }
  .stat-label {
    font-size: 10px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #666;
    margin-top: 4px;
  }
  .delta-positive { color: #22c55e; }
  .delta-negative { color: #ef4444; }
  .empty-state {
    color: #444;
    font-style: italic;
    font-size: 14px;
    padding: 8px 0;
  }
  .footer {
    text-align: center;
    padding: 20px 0;
    color: #333;
    font-size: 11px;
    letter-spacing: 2px;
    text-transform: uppercase;
  }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>Basic Reflex</h1>
    <div class="date">${date}</div>
    <div class="count">${analysis.totalStudents} students tracked</div>
  </div>

  <div class="stat-grid">
    <div class="stat-card">
      <div class="stat-value ${analysis.atRisk.length > 0 ? 'delta-negative' : ''}">${analysis.atRisk.length}</div>
      <div class="stat-label">At Risk</div>
    </div>
    <div class="stat-card">
      <div class="stat-value ${analysis.improving.length > 0 ? 'delta-positive' : ''}">${analysis.improving.length}</div>
      <div class="stat-label">Improving</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${sessions.length}</div>
      <div class="stat-label">Sessions (7d)</div>
    </div>
  </div>

  ${analysis.atRisk.length > 0 ? `
  <div class="section risk">
    <h2>At Risk</h2>
    ${analysis.atRisk.slice(0, 5).map(s => `
    <div class="student-row">
      <div>
        <span class="student-name">${s.name}</span>
        <div class="student-detail">${s.last30} classes last 30d &middot; ${s.trend}</div>
      </div>
      <span class="risk-badge risk-${s.risk}">${s.risk}</span>
    </div>`).join('')}
  </div>` : ''}

  ${analysis.notSeen.length > 0 ? `
  <div class="section absent">
    <h2>Haven't Seen</h2>
    ${analysis.notSeen.sort((a, b) => b.days - a.days).slice(0, 5).map(s => `
    <div class="student-row">
      <span class="student-name">${s.name}</span>
      <span class="student-detail">${s.days} days</span>
    </div>`).join('')}
  </div>` : ''}

  ${analysis.improving.length > 0 ? `
  <div class="section improving">
    <h2>Improving</h2>
    ${analysis.improving.map(s => `
    <div class="student-row">
      <span class="student-name">${s.name}</span>
      <span class="student-detail delta-positive">+${s.delta}%</span>
    </div>`).join('')}
  </div>` : ''}

  ${analysis.milestones.length > 0 ? `
  <div class="section milestone">
    <h2>Approaching Milestones</h2>
    ${analysis.milestones.map(s => `
    <div class="student-row">
      <span class="student-name">${s.name}</span>
      <span class="student-detail">${s.classes} / ${s.milestone} classes</span>
    </div>`).join('')}
  </div>` : ''}

  ${analysis.expiring.length > 0 ? `
  <div class="section expiring">
    <h2>Memberships Expiring</h2>
    ${analysis.expiring.map(s => `
    <div class="student-row">
      <div>
        <span class="student-name">${s.name}</span>
        <div class="student-detail">${s.type || 'pass'}</div>
      </div>
      <span class="student-detail">${s.days}d left</span>
    </div>`).join('')}
  </div>` : ''}

  ${challengeInfo && challengeInfo.active.length > 0 ? `
  <div class="section challenge">
    <h2>100 Punches Challenge</h2>
    ${challengeInfo.active.map(([name, data]) => `
    <div class="student-row">
      <div>
        <span class="student-name">${name}</span>
        <div class="student-detail">${data.streak}d streak</div>
      </div>
      <span class="student-detail">${data.totalPunches} punches</span>
    </div>`).join('')}
  </div>` : ''}

  <div class="section focus">
    <h2>Focus Today</h2>
    ${analysis.atRisk.length > 0 ? `<div class="focus-item">Check in with <span class="focus-name">${analysis.atRisk[0].name}</span> — attendance dropping</div>` : ''}
    ${analysis.milestones.length > 0 ? `<div class="focus-item">Celebrate <span class="focus-name">${analysis.milestones[0].name}</span> — near ${analysis.milestones[0].milestone} classes</div>` : ''}
    ${analysis.improving.length > 0 ? `<div class="focus-item">Acknowledge <span class="focus-name">${analysis.improving[0].name}</span> — technique jumping</div>` : ''}
    ${analysis.expiring.length > 0 ? `<div class="focus-item">Renew conversation with <span class="focus-name">${analysis.expiring[0].name}</span> — ${analysis.expiring[0].days}d left on pass</div>` : ''}
    ${analysis.atRisk.length === 0 && analysis.milestones.length === 0 && analysis.improving.length === 0 && analysis.expiring.length === 0 ? `<div class="focus-item">All good — focus on quality coaching</div>` : ''}
  </div>

  <div class="footer">Coach Paul &middot; Basic Reflex</div>
</div>
</body>
</html>`;
}

// ── Send ─────────────────────────────────────────────────────────────────────

async function sendTelegram(text) {
  if (!TOKEN || !CHAT_ID) {
    console.log('[br-brief] No Telegram config, printing to stdout:');
    console.log(text);
    return;
  }
  try {
    const res = await fetch(`${API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: undefined })
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[br-brief] Telegram error: ${res.status} ${body.slice(0, 200)}`);
    } else {
      console.log('[br-brief] Brief sent to Telegram.');
    }
  } catch (err) {
    console.error('[br-brief] Send failed:', err.message);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log('[br-brief] Generating daily brief...');

  const profiles = loadAllProfiles();
  const sessions = loadRecentSessions(7);
  const challenge = loadChallenge();
  const analysis = analyzeProfiles(profiles);

  // Telegram text brief
  const text = formatBrief(analysis, sessions, challenge);
  await sendTelegram(text);

  // HTML visual brief
  ensureDir(BRIEF_DIR);
  const html = generateHTML(analysis, sessions, challenge);
  fs.writeFileSync(HTML_OUT, html);
  console.log(`[br-brief] HTML brief: ${HTML_OUT}`);
  console.log(`[br-brief] ${profiles.length} profiles, ${sessions.length} recent sessions, ${analysis.atRisk.length} at risk`);
}

run().catch(err => {
  console.error('[br-brief] Fatal:', err);
  process.exit(1);
});

export { loadAllProfiles, analyzeProfiles, formatBrief, generateHTML };
