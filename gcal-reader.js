/**
 * gcal-reader.js — Google Calendar integration for Kit morning briefing
 *
 * Reads Paul's schedule, enforces work limits:
 *   - Max 25 hours/week coaching
 *   - Max 5 hours/day direct coaching
 *   - Max 5 coaching days/week
 *   - 2 rest days sacrosanct
 *   - 1-3pm = PT only
 *
 * Setup:
 *   1. Go to Google Cloud Console → APIs & Services → Credentials
 *   2. Create OAuth 2.0 Client ID (Desktop app)
 *   3. Download JSON → save as ~/nanoclaw/gcal-credentials.json
 *   4. Run: node gcal-reader.js --setup
 *   5. Follow the browser auth flow
 *   6. Token saved to ~/nanoclaw/gcal-token.json
 *
 * Usage:
 *   node gcal-reader.js              — Print this week's schedule
 *   node gcal-reader.js --setup      — Run OAuth setup
 *   node gcal-reader.js --json       — Output JSON for Kit
 *   node gcal-reader.js --guardrails — Show limit violations
 */

import fs from 'fs';
import path from 'path';
import { createServer } from 'http';

const HOME = process.env.HOME;
const CREDS_PATH = path.join(HOME, 'nanoclaw', 'gcal-credentials.json');
const TOKEN_PATH = path.join(HOME, 'nanoclaw', 'gcal-token.json');
const OUTPUT_PATH = path.join(HOME, 'br-gm-agent', 'reports', 'paul-schedule.json');

// ── Schedule limits ──────────────────────────────────────────────────────────

const LIMITS = {
  maxWeeklyHours: 25,
  maxDailyHours: 5,
  maxCoachingDays: 5,
  restDaysRequired: 2,
  ptOnlyStart: 13, // 1pm
  ptOnlyEnd: 15,   // 3pm
};

// ── Google Calendar API (lightweight, no googleapis dep) ─────────────────────

const GCAL_API = 'https://www.googleapis.com/calendar/v3';
const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly';

function loadCredentials() {
  if (!fs.existsSync(CREDS_PATH)) {
    return null;
  }
  const raw = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8'));
  return raw.installed || raw.web || raw;
}

function loadToken() {
  if (!fs.existsSync(TOKEN_PATH)) return null;
  return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
}

function saveToken(token) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
}

async function refreshToken(creds, token) {
  const params = new URLSearchParams({
    client_id: creds.client_id,
    client_secret: creds.client_secret,
    refresh_token: token.refresh_token,
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await res.json();
  if (data.error) throw new Error(`Token refresh failed: ${data.error_description}`);

  const newToken = { ...token, access_token: data.access_token, expiry_date: Date.now() + data.expires_in * 1000 };
  saveToken(newToken);
  return newToken;
}

async function getAccessToken(creds) {
  let token = loadToken();
  if (!token) throw new Error('No token. Run: node gcal-reader.js --setup');

  if (token.expiry_date && Date.now() > token.expiry_date - 60000) {
    token = await refreshToken(creds, token);
  }

  return token.access_token;
}

/**
 * OAuth setup — opens browser, catches redirect, exchanges code for token.
 */
async function runSetup(creds) {
  const redirectUri = 'http://localhost:3847/callback';
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${creds.client_id}&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code&scope=${encodeURIComponent(SCOPES)}&access_type=offline&prompt=consent`;

  console.log('\nOpen this URL in your browser:\n');
  console.log(authUrl);
  console.log('\nWaiting for callback on port 3847...');

  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, 'http://localhost:3847');
      if (!url.pathname.startsWith('/callback')) return;

      const code = url.searchParams.get('code');
      if (!code) {
        res.end('No code received');
        reject(new Error('No auth code'));
        server.close();
        return;
      }

      // Exchange code for token
      const params = new URLSearchParams({
        code,
        client_id: creds.client_id,
        client_secret: creds.client_secret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      });

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      const tokenData = await tokenRes.json();
      if (tokenData.error) {
        res.end(`Error: ${tokenData.error_description}`);
        reject(new Error(tokenData.error_description));
      } else {
        tokenData.expiry_date = Date.now() + tokenData.expires_in * 1000;
        saveToken(tokenData);
        res.end('Google Calendar connected! You can close this tab.');
        console.log('\nToken saved. Calendar connected.');
        resolve(tokenData);
      }
      server.close();
    });

    server.listen(3847);
  });
}

// ── Calendar reading ─────────────────────────────────────────────────────────

async function fetchEvents(accessToken, startDate, endDate) {
  const params = new URLSearchParams({
    timeMin: startDate.toISOString(),
    timeMax: endDate.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });

  const res = await fetch(`${GCAL_API}/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await res.json();
  if (data.error) throw new Error(`Calendar API: ${data.error.message}`);

  return (data.items || []).map(e => ({
    id: e.id,
    summary: e.summary || '(no title)',
    start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date,
    allDay: !!e.start?.date,
    location: e.location || null,
    description: e.description || null,
    status: e.status,
  }));
}

function getWeekBounds(offsetWeeks = 0) {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (now.getDay() || 7) + 1 + offsetWeeks * 7);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 7);

  return { start: monday, end: sunday };
}

function isCoaching(event) {
  const s = (event.summary || '').toLowerCase();
  return s.includes('class') || s.includes('pt') || s.includes('session') ||
    s.includes('coaching') || s.includes('training') || s.includes('boxing') ||
    s.includes('bootcamp') || s.includes('boot camp') || s.includes('private');
}

function getEventHours(event) {
  if (event.allDay) return 0;
  const start = new Date(event.start);
  const end = new Date(event.end);
  return (end - start) / (1000 * 60 * 60);
}

function getEventDay(event) {
  return new Date(event.start).toISOString().slice(0, 10);
}

function getEventHour(event) {
  return new Date(event.start).getHours();
}

// ── Analysis ─────────────────────────────────────────────────────────────────

/**
 * Analyze a week's events against Paul's schedule limits.
 */
export function analyzeWeek(events) {
  const coaching = events.filter(isCoaching);
  const nonCoaching = events.filter(e => !isCoaching(e));

  // Daily breakdown
  const dailyHours = {};
  for (const e of coaching) {
    const day = getEventDay(e);
    if (!dailyHours[day]) dailyHours[day] = 0;
    dailyHours[day] += getEventHours(e);
  }

  const coachingDays = Object.keys(dailyHours).length;
  const totalHours = Object.values(dailyHours).reduce((a, b) => a + b, 0);
  const daysInWeek = 7;
  const restDays = daysInWeek - coachingDays;

  // Check violations
  const violations = [];

  if (totalHours > LIMITS.maxWeeklyHours) {
    violations.push({
      type: 'weekly_hours',
      severity: 'high',
      message: `${totalHours.toFixed(1)}h scheduled this week (limit: ${LIMITS.maxWeeklyHours}h)`,
      overage: totalHours - LIMITS.maxWeeklyHours,
    });
  }

  for (const [day, hours] of Object.entries(dailyHours)) {
    if (hours > LIMITS.maxDailyHours) {
      violations.push({
        type: 'daily_hours',
        severity: 'medium',
        message: `${day}: ${hours.toFixed(1)}h coaching (limit: ${LIMITS.maxDailyHours}h)`,
        day,
        overage: hours - LIMITS.maxDailyHours,
      });
    }
  }

  if (coachingDays > LIMITS.maxCoachingDays) {
    violations.push({
      type: 'coaching_days',
      severity: 'high',
      message: `${coachingDays} coaching days (limit: ${LIMITS.maxCoachingDays})`,
    });
  }

  if (restDays < LIMITS.restDaysRequired) {
    violations.push({
      type: 'rest_days',
      severity: 'critical',
      message: `Only ${restDays} rest day(s) this week (need: ${LIMITS.restDaysRequired})`,
    });
  }

  // Check PT window violations (non-PT events during 1-3pm)
  for (const e of events) {
    if (e.allDay) continue;
    const hour = getEventHour(e);
    const summary = (e.summary || '').toLowerCase();
    const isPT = summary.includes('pt') || summary.includes('private') || summary.includes('personal');

    if (hour >= LIMITS.ptOnlyStart && hour < LIMITS.ptOnlyEnd && !isPT && isCoaching(e)) {
      violations.push({
        type: 'pt_window',
        severity: 'medium',
        message: `${getEventDay(e)} ${hour}:00 — "${e.summary}" during PT-only window (1-3pm)`,
      });
    }
  }

  return {
    totalCoachingHours: Math.round(totalHours * 10) / 10,
    coachingDays,
    restDays,
    dailyBreakdown: dailyHours,
    coachingEvents: coaching.length,
    totalEvents: events.length,
    violations,
    status: violations.length === 0 ? 'healthy' :
      violations.some(v => v.severity === 'critical') ? 'critical' :
        violations.some(v => v.severity === 'high') ? 'warning' : 'attention',
    limits: LIMITS,
  };
}

/**
 * Full schedule read + analysis. Returns JSON-serializable object.
 */
export async function getScheduleReport(offsetWeeks = 0) {
  const creds = loadCredentials();
  if (!creds) {
    return {
      error: 'no_credentials',
      message: 'Google Calendar not set up. Save OAuth credentials to ~/nanoclaw/gcal-credentials.json and run: node gcal-reader.js --setup',
    };
  }

  try {
    const accessToken = await getAccessToken(creds);
    const { start, end } = getWeekBounds(offsetWeeks);
    const events = await fetchEvents(accessToken, start, end);
    const analysis = analyzeWeek(events);

    const report = {
      week: { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) },
      generatedAt: new Date().toISOString(),
      ...analysis,
      events: events.map(e => ({
        ...e,
        isCoaching: isCoaching(e),
        hours: getEventHours(e),
      })),
    };

    // Save for Kit morning briefing
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2));

    return report;
  } catch (e) {
    if (e.message.includes('No token')) {
      return { error: 'no_token', message: e.message };
    }
    return { error: 'api_error', message: e.message };
  }
}

/**
 * Format schedule report as human-readable text.
 */
export function formatScheduleReport(report) {
  if (report.error) {
    return `Schedule Guard: ${report.message}`;
  }

  let text = `Schedule Guard — ${report.week.start} to ${report.week.end}\n\n`;
  text += `Coaching: ${report.totalCoachingHours}h / ${report.limits.maxWeeklyHours}h limit\n`;
  text += `Days: ${report.coachingDays} coaching, ${report.restDays} rest\n`;
  text += `Events: ${report.coachingEvents} coaching, ${report.totalEvents} total\n\n`;

  if (report.violations.length > 0) {
    text += `VIOLATIONS (${report.violations.length}):\n`;
    for (const v of report.violations) {
      const icon = v.severity === 'critical' ? '🔴' : v.severity === 'high' ? '🟠' : '🟡';
      text += `  ${icon} ${v.message}\n`;
    }
  } else {
    text += `✅ All limits within range.\n`;
  }

  // Daily breakdown
  text += `\nDaily breakdown:\n`;
  for (const [day, hours] of Object.entries(report.dailyBreakdown || {})) {
    const bar = '█'.repeat(Math.round(hours));
    const over = hours > report.limits.maxDailyHours ? ' ⚠' : '';
    text += `  ${day}: ${hours.toFixed(1)}h ${bar}${over}\n`;
  }

  return text;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('gcal-reader.js')) {
  const args = process.argv.slice(2);

  if (args.includes('--setup')) {
    const creds = loadCredentials();
    if (!creds) {
      console.error(`No credentials found at ${CREDS_PATH}`);
      console.error('Download OAuth 2.0 Client ID JSON from Google Cloud Console');
      console.error('Save as: ~/nanoclaw/gcal-credentials.json');
      process.exit(1);
    }
    await runSetup(creds);
  } else {
    const report = await getScheduleReport();
    if (args.includes('--json')) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatScheduleReport(report));
    }
  }
}
