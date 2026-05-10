/**
 * cathedral-health.js — The Cathedral's self-awareness of its own goal
 *
 * One question: "How close are we to flow state?"
 * Flow = finance flowing + projects live + system sustains itself
 *
 * Four dimensions:
 * 1. Revenue Flow — is money coming in?
 * 2. Project Liveness — are things running without Paul pushing?
 * 3. Compound Rate — is the system accelerating?
 * 4. Paul's Freedom — is the ratio shifting toward leverage?
 *
 * Outputs a single score (0-100%) and visual breakdown.
 * Runs weekly. Tracks over time. Shows the gap closing.
 *
 * ESM.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const HOME = process.env.HOME || '/Users/basicclaw777';
const HEALTH_PATH = path.join(__dirname, 'cathedral-health.json');
const BOT_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.PAUL_CHAT_ID;

// ── Dimension 1: Revenue Flow ────────────────────────────────────────────────

function scoreRevenueFlow() {
  const streams = [];
  let score = 0;

  // Gym income (existing, assumed stable)
  streams.push({ name: 'Gym memberships', status: 'active', monthly: 'existing', score: 20 });
  score += 20;

  // Trading experiment
  try {
    const portfolio = JSON.parse(fs.readFileSync(path.join(__dirname, 'trader', 'portfolio.json'), 'utf8'));
    if (portfolio.total_pnl > 0) {
      streams.push({ name: 'Active trading (paper)', status: 'profitable', pnl: portfolio.total_pnl, score: 5 });
      score += 5;
    } else {
      streams.push({ name: 'Active trading (paper)', status: 'running', pnl: portfolio.total_pnl, score: 2 });
      score += 2;
    }
  } catch(e) {
    streams.push({ name: 'Active trading', status: 'not running', score: 0 });
  }

  // Long-term portfolio
  try {
    const lt = JSON.parse(fs.readFileSync(path.join(__dirname, 'trader', 'long-term-portfolio.json'), 'utf8'));
    if (lt.total_invested > 0) {
      streams.push({ name: 'Long-term portfolio (paper)', status: 'accumulating', invested: lt.total_invested, score: 5 });
      score += 5;
    } else {
      streams.push({ name: 'Long-term portfolio', status: 'initialized', score: 2 });
      score += 2;
    }
  } catch(e) {
    streams.push({ name: 'Long-term portfolio', status: 'not started', score: 0 });
  }

  // Course (not yet productised)
  const courseExists = fs.existsSync(path.join(HOME, 'cathedral-vault', '02_Refined_Gold', 'boxing', 'curriculum-mandala-complete.md'));
  if (courseExists) {
    streams.push({ name: 'Online course', status: 'content exists, not productised', score: 3 });
    score += 3;
  }

  // Instagram/content (not yet automated to post)
  streams.push({ name: 'Content → Instagram', status: 'generates but not posting', score: 2 });
  score += 2;

  // Max possible: 50 (gym 20 + trading real 15 + LT real 10 + course live 10 + instagram flowing 10)
  // Normalise to 0-25 (this dimension is 25% of total)
  const normalised = Math.min(Math.round((score / 50) * 25), 25);

  return { score: normalised, max: 25, streams, raw: score };
}

// ── Dimension 2: Project Liveness ────────────────────────────────────────────

function scoreProjectLiveness() {
  let live = 0;
  let total = 0;
  const projects = [];

  // Check PM2 processes
  try {
    const pm2List = execSync('pm2 jlist', { encoding: 'utf8', timeout: 10000 });
    const processes = JSON.parse(pm2List);
    const online = processes.filter(p => p.pm2_env.status === 'online').length;
    const stopped = processes.filter(p => p.pm2_env.status === 'stopped').length;
    projects.push({ name: 'PM2 processes', online, stopped, total: processes.length });
    live += Math.min(online, 15); // Cap contribution
    total += 15;
  } catch(e) {
    projects.push({ name: 'PM2', status: 'error' });
    total += 15;
  }

  // Trading runs autonomously
  try {
    const p = JSON.parse(fs.readFileSync(path.join(__dirname, 'trader', 'portfolio.json'), 'utf8'));
    const lastRun = new Date(p.last_run);
    const hoursSince = (Date.now() - lastRun.getTime()) / 3600000;
    if (hoursSince < 5) { live += 5; projects.push({ name: 'Trading cron', status: 'active', hours_since: hoursSince.toFixed(1) }); }
    else { projects.push({ name: 'Trading cron', status: 'stale', hours_since: hoursSince.toFixed(1) }); }
    total += 5;
  } catch(e) { total += 5; }

  // Morning briefing (check if recent)
  // Muse (check if recent finding)
  // Reed daily lab
  // These are "alive" indicators

  // Deck/slides gallery
  const deckExists = fs.existsSync(path.join(__dirname, 'reed-lab', 'deck.json'));
  if (deckExists) { live += 3; projects.push({ name: 'Cathedral Deck', status: 'live' }); }
  total += 3;

  // 10 Blocks deployed to students?
  projects.push({ name: '10 Blocks syllabus', status: 'designed, not deployed to students', live: false });
  total += 5;

  // Normalise to 0-25
  const normalised = Math.min(Math.round((live / total) * 25), 25);

  return { score: normalised, max: 25, projects, live, total };
}

// ── Dimension 3: Compound Rate ───────────────────────────────────────────────

function scoreCompoundRate() {
  let score = 0;
  const indicators = [];

  // Vault size (growth indicator)
  try {
    const vaultFiles = execSync(`find ${HOME}/cathedral-vault -name "*.md" | wc -l`, { encoding: 'utf8' }).trim();
    const count = parseInt(vaultFiles);
    indicators.push({ name: 'Vault nuggets', count });
    if (count > 1500) score += 5;
    else if (count > 1000) score += 3;
    else score += 1;
  } catch(e) {}

  // Deck cards (system components)
  try {
    const deck = JSON.parse(fs.readFileSync(path.join(__dirname, 'reed-lab', 'deck.json'), 'utf8'));
    indicators.push({ name: 'Deck cards', count: deck.length });
    if (deck.length > 15) score += 4;
    else if (deck.length > 10) score += 3;
    else score += 1;
  } catch(e) {}

  // Experiment domains running
  try {
    const metaDb = path.join(__dirname, 'experiment-engine', 'meta-watcher.db');
    if (fs.existsSync(metaDb)) {
      indicators.push({ name: 'Experiment domains', status: 'meta-watcher active' });
      score += 4;
    }
  } catch(e) {}

  // Sages created
  try {
    const sages = fs.readdirSync(path.join(__dirname, 'sages')).filter(f => f.endsWith('.json'));
    indicators.push({ name: 'Sages/agents', count: sages.length });
    if (sages.length > 10) score += 4;
    else if (sages.length > 5) score += 3;
    else score += 1;
  } catch(e) {}

  // Connections (missing connections = gaps = room to grow)
  try {
    const missing = JSON.parse(fs.readFileSync(path.join(__dirname, 'reed-lab', 'missing-connections.json'), 'utf8'));
    const gaps = missing.missing?.length || 0;
    indicators.push({ name: 'Known gaps', count: gaps, note: 'fewer = more connected' });
    if (gaps < 5) score += 3;
    else if (gaps < 10) score += 2;
    else score += 1;
  } catch(e) {}

  // Normalise to 0-25
  const normalised = Math.min(Math.round((score / 20) * 25), 25);

  return { score: normalised, max: 25, indicators };
}

// ── Dimension 4: Paul's Freedom ──────────────────────────────────────────────

function scorePaulsFreedom() {
  let score = 0;
  const indicators = [];

  // Autonomous systems (run without Paul triggering)
  const autonomous = [
    { name: 'Trading (4h cron)', auto: true },
    { name: 'Long-term DCA (weekly)', auto: true },
    { name: 'Muse (3am daily)', auto: true },
    { name: 'Morning briefing (7:30 daily)', auto: true },
    { name: 'Vault backup (nightly)', auto: true },
    { name: 'Timekeeper (15min)', auto: true },
    { name: 'Roundtable debate', auto: true },
    { name: 'Meta-watcher', auto: true },
    { name: 'Reed Daily Lab (2am)', auto: true },
    { name: 'Content → Instagram', auto: false },
    { name: '10 Blocks teaching', auto: false },
    { name: 'Course revenue', auto: false },
  ];

  const autoCount = autonomous.filter(a => a.auto).length;
  const manualCount = autonomous.filter(a => !a.auto).length;
  indicators.push({ name: 'Autonomous systems', count: autoCount });
  indicators.push({ name: 'Still manual', count: manualCount });

  score += Math.min(autoCount * 2, 15);

  // Can Paul leave for a week?
  // If trading + briefing + muse + DCA all run without him = yes
  const canLeave = autoCount >= 7;
  indicators.push({ name: 'Can leave for a week?', answer: canLeave ? 'Yes (core systems run)' : 'Not yet' });
  if (canLeave) score += 5;

  // Normalise to 0-25
  const normalised = Math.min(Math.round((score / 20) * 25), 25);

  return { score: normalised, max: 25, indicators, autonomous };
}

// ── Main: Calculate Total Health ─────────────────────────────────────────────

async function run() {
  console.log('\n=== CATHEDRAL HEALTH CHECK ===\n');

  const revenue = scoreRevenueFlow();
  const liveness = scoreProjectLiveness();
  const compound = scoreCompoundRate();
  const freedom = scorePaulsFreedom();

  const totalScore = revenue.score + liveness.score + compound.score + freedom.score;
  const maxScore = 100;

  const health = {
    timestamp: new Date().toISOString(),
    score: totalScore,
    max: maxScore,
    percentage: `${totalScore}%`,
    dimensions: {
      revenue_flow: revenue,
      project_liveness: liveness,
      compound_rate: compound,
      pauls_freedom: freedom,
    },
    target: 'Flow state: finance flowing + projects live + system sustains itself',
    phase: totalScore < 25 ? 'Building' : totalScore < 50 ? 'Assembling' : totalScore < 75 ? 'Approaching' : 'Flow',
  };

  // Save history
  let history = [];
  if (fs.existsSync(HEALTH_PATH)) {
    try { history = JSON.parse(fs.readFileSync(HEALTH_PATH, 'utf8')).history || []; } catch(e) {}
  }
  history.push({ date: health.timestamp.split('T')[0], score: totalScore });
  if (history.length > 52) history = history.slice(-52);

  health.history = history;
  fs.writeFileSync(HEALTH_PATH, JSON.stringify(health, null, 2));

  // Display
  const bar = '█'.repeat(Math.round(totalScore / 5)) + '░'.repeat(20 - Math.round(totalScore / 5));
  console.log(`  FLOW STATE: [${bar}] ${totalScore}% — ${health.phase}`);
  console.log();
  console.log(`  Revenue Flow:      ${revenue.score}/${revenue.max}`);
  console.log(`  Project Liveness:  ${liveness.score}/${liveness.max}`);
  console.log(`  Compound Rate:     ${compound.score}/${compound.max}`);
  console.log(`  Paul's Freedom:    ${freedom.score}/${freedom.max}`);
  console.log();

  // Telegram
  if (BOT_TOKEN && CHAT_ID) {
    const msg = [
      `🏛 CATHEDRAL HEALTH: ${totalScore}% — ${health.phase}`,
      `[${bar}]`,
      ``,
      `Revenue Flow: ${revenue.score}/${revenue.max}`,
      `Project Liveness: ${liveness.score}/${liveness.max}`,
      `Compound Rate: ${compound.score}/${compound.max}`,
      `Paul's Freedom: ${freedom.score}/${freedom.max}`,
      ``,
      `Target: Flow state (finance + projects + sustains)`,
    ].join('\n');

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: msg }),
    }).catch(() => {});
  }

  console.log('Health saved to cathedral-health.json');
}

run().catch(e => { console.error(e); process.exit(1); });
