#!/usr/bin/env node
/**
 * trading-mentor.js — Weekly Investment Mentor
 *
 * Watches ALL 4 experiments. Teaches Paul. Alerts when things go wrong.
 * Sends one Telegram digest per week (Sunday after allocation snapshot).
 * Also runs mid-week health check (Wednesday) — silent unless something needs attention.
 *
 * Commands:
 *   node trading-mentor.js              — weekly digest (default)
 *   node trading-mentor.js check        — mid-week health check (alerts only)
 *   node trading-mentor.js lesson       — send just the lesson
 *
 * ESM.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.PAUL_CHAT_ID;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

const PORTFOLIO_PATH = path.join(__dirname, 'portfolio.json');
const SIMPSONS_PATH = path.join(__dirname, 'simpsons-portfolio.json');
const CYCLICAL_PATH = path.join(__dirname, 'cyclical-portfolio.json');
const ALLOCATION_PATH = path.join(__dirname, 'allocation-portfolio.json');
const MENTOR_STATE_PATH = path.join(__dirname, 'mentor-state.json');
const WHY_PATH = path.join(__dirname, 'WHY.md');

// ── Investment concepts to teach (one per week, cycles) ─────────────────────

const LESSONS = [
  {
    topic: 'Correlation',
    hook: 'When one goes up and another goes down at the same time — that\'s negative correlation. It\'s why we hold different asset classes.',
    key: 'Watch your stocks vs bonds this week. When one zigs, does the other zag?',
  },
  {
    topic: 'Compound Returns',
    hook: 'A 2% weekly gain doesn\'t sound like much. But 2% compounding over 52 weeks = 180% annual return. Small consistent gains beat big swings.',
    key: 'Look at which of your 8 allocations has the steadiest growth, not the biggest spike.',
  },
  {
    topic: 'Position Sizing',
    hook: 'The DYA lesson: putting a full month\'s salary on one bet is a sizing problem, not a picking problem. Our traders risk max 10% per position.',
    key: 'Notice how even if one trader\'s worst position tanks, the portfolio barely moves.',
  },
  {
    topic: 'Drawdown',
    hook: 'A 50% loss needs a 100% gain to recover. A 10% loss needs only 11%. This is why stop losses exist — limiting downside is more important than maximizing upside.',
    key: 'Check if any position hit its stop loss this week. That\'s the system protecting capital.',
  },
  {
    topic: 'Diversification',
    hook: 'Your 8 allocations are deliberately uncorrelated. If they all move together, diversification isn\'t working. If some are up while others are down, that IS the plan working.',
    key: 'Count how many are green vs red. If it\'s roughly split, the portfolio is well-diversified.',
  },
  {
    topic: 'Risk-Adjusted Returns',
    hook: 'Making 20% sounds great. Making 20% with stomach-churning 40% swings is very different from making 15% with calm 5% swings. The Sharpe ratio measures return per unit of risk.',
    key: 'Which allocation gives you the smoothest ride? That might be better than the highest return.',
  },
  {
    topic: 'Mean Reversion vs Momentum',
    hook: 'Some things bounce back to average (mean reversion). Others keep running in the same direction (momentum). Knowing which is which is half the game.',
    key: 'Look at your worst performer. Is it recovering or still falling? That tells you which force is winning.',
  },
  {
    topic: 'The Cost of Doing Nothing',
    hook: 'Cash loses ~3-5% per year to inflation. Doing nothing isn\'t safe — it\'s a guaranteed slow loss. Every asset class in your tracker is an attempt to beat that invisible tax.',
    key: 'Your $40K in cash would be worth ~$38K in a year. How\'s the portfolio doing vs that?',
  },
  {
    topic: 'Liquidity',
    hook: 'Bitcoin trades 24/7. Property takes months to sell. Bonds are somewhere between. Liquidity = how fast you can turn it back into cash without losing value.',
    key: 'Your allocations are all ETFs — highly liquid. Real property isn\'t. That\'s a trade-off.',
  },
  {
    topic: 'Dollar Cost Averaging',
    hook: 'Instead of investing $40K at once, investing $1K per week over 40 weeks averages out the entry price. You buy more when it\'s cheap, less when it\'s expensive — automatically.',
    key: 'We went all-in at one price point. Watch how entry timing affects your results.',
  },
  {
    topic: 'Volatility Is Not Risk',
    hook: 'Bitcoin swings 5% daily but trends up over years. A savings account never swings but barely beats inflation. Volatility is noise. Risk is permanent loss of capital.',
    key: 'Which allocation swings the most? Is it also the worst performer, or just the loudest?',
  },
  {
    topic: 'Rebalancing',
    hook: 'If Bitcoin doubles and bonds stay flat, your portfolio is now 60% crypto. Rebalancing means selling winners and buying losers to maintain your target mix. Sounds crazy — but it forces buy-low, sell-high.',
    key: 'Check if any allocation has grown to dominate your portfolio. That\'s when rebalancing matters.',
  },
];

// ── Data Loading ────────────────────────────────────────────────────────────

function loadJSON(filepath) {
  try {
    if (fs.existsSync(filepath)) return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (e) { /* ignore */ }
  return null;
}

function loadMentorState() {
  return loadJSON(MENTOR_STATE_PATH) || { lessonIndex: 0, weekNumber: 0, alerts: [] };
}

function saveMentorState(state) {
  fs.writeFileSync(MENTOR_STATE_PATH, JSON.stringify(state, null, 2));
}

// ── Portfolio Analysis ──────────────────────────────────────────────────────

function analyzeMainTrader() {
  const p = loadJSON(PORTFOLIO_PATH);
  if (!p) return null;
  const pnl = (p.balance || 10000) - 10000;
  const pnlPct = (pnl / 10000) * 100;
  const closedTrades = p.closed_trades || p.closedTrades || [];
  const wins = closedTrades.filter(t => (t.pnl || 0) > 0).length;
  const losses = closedTrades.filter(t => (t.pnl || 0) <= 0).length;
  const winRate = closedTrades.length > 0 ? (wins / closedTrades.length * 100) : 0;
  const positions = p.positions || [];
  return {
    name: 'Main Trader',
    balance: p.balance || 10000,
    initial: 10000,
    pnl, pnlPct,
    positions: positions.length,
    closedTrades: closedTrades.length,
    wins, losses, winRate,
    strategies: [...new Set(closedTrades.map(t => t.strategy || t.signal_type || 'unknown'))],
  };
}

function analyzeSimpsons() {
  const p = loadJSON(SIMPSONS_PATH);
  if (!p) return null;
  const pnl = (p.balance || 5000) - 5000;
  const positions = p.positions || [];
  const closed = p.closed_trades || p.closedTrades || [];
  return {
    name: 'Simpsons Trader',
    balance: p.balance || 5000,
    initial: 5000,
    pnl,
    pnlPct: (pnl / 5000) * 100,
    positions: positions.length,
    closedTrades: closed.length,
    openPositions: positions,
  };
}

function analyzeCyclical() {
  const p = loadJSON(CYCLICAL_PATH);
  if (!p) return null;
  const pnl = (p.balance || 5000) - 5000;
  const positions = p.positions || [];
  const closed = p.closed_trades || p.closedTrades || [];
  return {
    name: 'Cyclical Trader',
    balance: p.balance || 5000,
    initial: 5000,
    pnl,
    pnlPct: (pnl / 5000) * 100,
    positions: positions.length,
    closedTrades: closed.length,
    openPositions: positions,
  };
}

function analyzeAllocations() {
  const p = loadJSON(ALLOCATION_PATH);
  if (!p) return null;
  const allocs = p.allocations || [];
  const results = allocs.map(a => {
    const latest = a.snapshots?.[a.snapshots.length - 1];
    const prev = a.snapshots?.length > 1 ? a.snapshots[a.snapshots.length - 2] : null;
    return {
      name: a.name,
      symbol: a.symbol,
      category: a.category,
      invested: a.invested,
      value: latest?.value || a.invested,
      pnl: latest?.pnl || 0,
      pnlPct: latest?.pnl_pct || 0,
      weekChange: prev ? (latest?.value || 0) - prev.value : 0,
      weekChangePct: prev && prev.value ? ((latest?.value || 0) - prev.value) / prev.value * 100 : 0,
    };
  });
  results.sort((a, b) => b.pnlPct - a.pnlPct);
  const totalValue = results.reduce((s, a) => s + a.value, 0);
  const totalInvested = p.total_invested || 40000;
  return {
    name: 'Allocation Tracker',
    assets: results,
    totalValue,
    totalInvested,
    pnl: totalValue - totalInvested,
    pnlPct: ((totalValue - totalInvested) / totalInvested) * 100,
    weeks: p.snapshot_count || 1,
    best: results[0],
    worst: results[results.length - 1],
  };
}

// ── Alert Detection ─────────────────────────────────────────────────────────

function detectAlerts(main, simpsons, cyclical, alloc) {
  const alerts = [];

  // Main trader drawdown
  if (main && main.pnlPct < -5) {
    alerts.push({ severity: 'warning', msg: `Main trader down ${main.pnlPct.toFixed(1)}% — watch for strategy problems.` });
  }
  if (main && main.pnlPct < -10) {
    alerts.push({ severity: 'critical', msg: `Main trader down ${main.pnlPct.toFixed(1)}% — review strategy elimination.` });
  }

  // Simpsons/Cyclical drawdown
  for (const exp of [simpsons, cyclical]) {
    if (exp && exp.pnlPct < -10) {
      alerts.push({ severity: 'warning', msg: `${exp.name} down ${exp.pnlPct.toFixed(1)}%. Consider pausing.` });
    }
  }

  // Allocation alerts
  if (alloc) {
    for (const a of alloc.assets) {
      if (a.pnlPct < -10) {
        alerts.push({ severity: 'warning', msg: `${a.name} down ${a.pnlPct.toFixed(1)}% — significant loss territory.` });
      }
      if (a.weekChangePct < -5) {
        alerts.push({ severity: 'alert', msg: `${a.name} dropped ${a.weekChangePct.toFixed(1)}% THIS WEEK — sharp move.` });
      }
    }
    // All correlated (all same direction > 3%)
    const allUp = alloc.assets.every(a => a.pnlPct > 3);
    const allDown = alloc.assets.every(a => a.pnlPct < -3);
    if (allUp || allDown) {
      alerts.push({ severity: 'info', msg: `All 8 allocations moving ${allUp ? 'up' : 'down'} together — diversification not helping right now.` });
    }
  }

  // Stale data check
  const mainAge = main ? daysSince(PORTFOLIO_PATH) : 999;
  const allocAge = alloc ? daysSince(ALLOCATION_PATH) : 999;
  if (mainAge > 3) alerts.push({ severity: 'warning', msg: `Main trader data is ${mainAge} days old — cron may not be running.` });
  if (allocAge > 10) alerts.push({ severity: 'warning', msg: `Allocation data is ${allocAge} days old — weekly snapshot may have missed.` });

  return alerts;
}

function daysSince(filepath) {
  try {
    const stat = fs.statSync(filepath);
    return Math.floor((Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24));
  } catch { return 999; }
}

// ── DeepSeek Digest Generator ───────────────────────────────────────────────

async function generateDigest(main, simpsons, cyclical, alloc, lesson, alerts, state) {
  const why = fs.existsSync(WHY_PATH) ? fs.readFileSync(WHY_PATH, 'utf8').slice(0, 1500) : '';

  const dataBlock = [
    '=== PORTFOLIO DATA ===',
    '',
    main ? `MAIN TRADER ($10K paper): Balance $${main.balance.toFixed(0)} (${main.pnl >= 0 ? '+' : ''}${main.pnlPct.toFixed(1)}%). ${main.closedTrades} closed trades, ${main.winRate.toFixed(0)}% win rate. ${main.positions} open positions.` : 'MAIN TRADER: no data',
    '',
    simpsons ? `SIMPSONS TRADER ($5K paper): Balance $${simpsons.balance.toFixed(0)} (${simpsons.pnl >= 0 ? '+' : ''}${simpsons.pnlPct.toFixed(1)}%). ${simpsons.positions} open, ${simpsons.closedTrades} closed.` : 'SIMPSONS: no data',
    '',
    cyclical ? `CYCLICAL TRADER ($5K paper): Balance $${cyclical.balance.toFixed(0)} (${cyclical.pnl >= 0 ? '+' : ''}${cyclical.pnlPct.toFixed(1)}%). ${cyclical.positions} open, ${cyclical.closedTrades} closed.` : 'CYCLICAL: no data',
    '',
    alloc ? [
      `ALLOCATION TRACKER ($40K, week ${alloc.weeks - 1}):`,
      `Total: $${alloc.totalValue.toFixed(0)} (${alloc.pnl >= 0 ? '+' : ''}$${alloc.pnl.toFixed(0)}, ${alloc.pnlPct >= 0 ? '+' : ''}${alloc.pnlPct.toFixed(1)}%)`,
      'Ranking:',
      ...alloc.assets.map((a, i) => `  ${i + 1}. ${a.name}: ${a.pnlPct >= 0 ? '+' : ''}${a.pnlPct.toFixed(1)}% ($${a.value.toFixed(0)})${a.weekChange ? ` week: ${a.weekChange >= 0 ? '+' : ''}$${a.weekChange.toFixed(0)}` : ''}`),
    ].join('\n') : 'ALLOCATIONS: no data',
    '',
    alerts.length > 0 ? `ALERTS:\n${alerts.map(a => `  [${a.severity.toUpperCase()}] ${a.msg}`).join('\n')}` : 'No alerts.',
  ].join('\n');

  const prompt = `You are Paul's investment mentor. He's learning investing from scratch after a bad experience 20 years ago (lost a month's salary on a friend's stock tip, avoided markets ever since). He's now running paper trading experiments to rebuild confidence with SYSTEMS, not guessing.

Your job: write a SHORT weekly Telegram digest (max 300 words). Paul is visual, direct, doesn't know finance jargon (explain any you use).

TONE: Like a smart friend who happens to know finance. Not a textbook. Not condescending. Celebrate wins honestly. Name problems directly. This is real — his money will follow once the system proves itself.

STRUCTURE (use these exact sections, keep each SHORT):
1. THE SCOREBOARD — one-line summary of each experiment. Who's winning, who's losing.
2. WHAT HAPPENED — 2-3 sentences explaining the moves this week in plain language. Why did things move?
3. EYES ON — anything concerning. Alerts, drawdowns, stale data, experiments not running. If nothing wrong, skip this section entirely.
4. THIS WEEK'S LESSON: "${lesson.topic}" — teach this concept using HIS ACTUAL DATA as the example. 3-4 sentences max. Make it stick.
5. THE BIGGER PICTURE — one sentence connecting this week to his goal: making money work for him instead of the opposite.

${dataBlock}

CONTEXT (do not repeat this, just let it inform your tone):
${why.slice(0, 800)}

Week ${state.weekNumber + 1}. Keep it real. Keep it short. Use * for bold in Telegram markdown.`;

  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 800,
        temperature: 0.7,
      }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (e) {
    console.error('DeepSeek failed:', e.message);
    return null;
  }
}

// ── Fallback Static Digest ──────────────────────────────────────────────────

function buildStaticDigest(main, simpsons, cyclical, alloc, lesson, alerts) {
  const lines = ['*Trading Mentor — Weekly Digest*\n'];

  lines.push('*SCOREBOARD*');
  if (main) lines.push(`Main Trader: $${main.balance.toFixed(0)} (${main.pnl >= 0 ? '+' : ''}${main.pnlPct.toFixed(1)}%)`);
  if (simpsons) lines.push(`Simpsons: $${simpsons.balance.toFixed(0)} (${simpsons.pnl >= 0 ? '+' : ''}${simpsons.pnlPct.toFixed(1)}%)`);
  if (cyclical) lines.push(`Cyclical: $${cyclical.balance.toFixed(0)} (${cyclical.pnl >= 0 ? '+' : ''}${cyclical.pnlPct.toFixed(1)}%)`);
  if (alloc) {
    lines.push(`Allocations: $${alloc.totalValue.toFixed(0)} (${alloc.pnl >= 0 ? '+' : ''}${alloc.pnlPct.toFixed(1)}%)`);
    lines.push(`  Best: ${alloc.best.name} ${alloc.best.pnlPct >= 0 ? '+' : ''}${alloc.best.pnlPct.toFixed(1)}%`);
    lines.push(`  Worst: ${alloc.worst.name} ${alloc.worst.pnlPct >= 0 ? '+' : ''}${alloc.worst.pnlPct.toFixed(1)}%`);
  }

  if (alerts.length > 0) {
    lines.push('\n*EYES ON*');
    for (const a of alerts) lines.push(`${a.severity === 'critical' ? '🔴' : '🟡'} ${a.msg}`);
  }

  lines.push(`\n*LESSON: ${lesson.topic}*`);
  lines.push(lesson.hook);
  lines.push(`_${lesson.key}_`);

  return lines.join('\n');
}

// ── Telegram ────────────────────────────────────────────────────────────────

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('No Telegram config — printing only.\n');
    console.log(text);
    return;
  }
  try {
    // Split if too long
    const chunks = [];
    if (text.length <= 4000) {
      chunks.push(text);
    } else {
      const lines = text.split('\n');
      let chunk = '';
      for (const line of lines) {
        if (chunk.length + line.length + 1 > 4000) {
          chunks.push(chunk);
          chunk = line;
        } else {
          chunk += (chunk ? '\n' : '') + line;
        }
      }
      if (chunk) chunks.push(chunk);
    }

    for (const c of chunks) {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: c,
          parse_mode: 'Markdown',
        }),
      });
    }
  } catch (e) {
    console.error('Telegram send failed:', e.message);
    console.log(text);
  }
}

// ── Commands ────────────────────────────────────────────────────────────────

async function weeklyDigest() {
  console.log('\n=== TRADING MENTOR — Weekly Digest ===\n');

  const main = analyzeMainTrader();
  const simpsons = analyzeSimpsons();
  const cyclical = analyzeCyclical();
  const alloc = analyzeAllocations();
  const state = loadMentorState();
  const lesson = LESSONS[state.lessonIndex % LESSONS.length];
  const alerts = detectAlerts(main, simpsons, cyclical, alloc);

  console.log('Experiments loaded:', [main, simpsons, cyclical, alloc].filter(Boolean).length, '/ 4');
  console.log('Alerts:', alerts.length);
  console.log('Lesson:', lesson.topic);

  let digest = null;
  if (DEEPSEEK_API_KEY) {
    console.log('Generating digest via DeepSeek...');
    digest = await generateDigest(main, simpsons, cyclical, alloc, lesson, alerts, state);
  }

  if (!digest) {
    console.log('Using static digest...');
    digest = buildStaticDigest(main, simpsons, cyclical, alloc, lesson, alerts);
  }

  await sendTelegram(digest);

  // Update state
  state.lessonIndex = (state.lessonIndex + 1) % LESSONS.length;
  state.weekNumber++;
  state.lastDigest = new Date().toISOString();
  state.lastAlerts = alerts;
  saveMentorState(state);

  console.log('\nDigest sent. Week', state.weekNumber, 'complete.');
}

async function healthCheck() {
  console.log('\n=== TRADING MENTOR — Mid-Week Health Check ===\n');

  const main = analyzeMainTrader();
  const simpsons = analyzeSimpsons();
  const cyclical = analyzeCyclical();
  const alloc = analyzeAllocations();
  const alerts = detectAlerts(main, simpsons, cyclical, alloc);

  const serious = alerts.filter(a => a.severity === 'critical' || a.severity === 'warning');

  if (serious.length === 0) {
    console.log('All clear. No alerts.');
    return;
  }

  console.log(`${serious.length} alert(s) found. Sending to Telegram...`);

  const msg = [
    '*Trading Mentor — Mid-Week Check*\n',
    ...serious.map(a => `${a.severity === 'critical' ? '🔴' : '🟡'} ${a.msg}`),
  ].join('\n');

  await sendTelegram(msg);
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const cmd = process.argv[2];

if (cmd === 'check') {
  healthCheck().catch(e => console.error('Health check failed:', e));
} else if (cmd === 'lesson') {
  const state = loadMentorState();
  const lesson = LESSONS[state.lessonIndex % LESSONS.length];
  const msg = `*This Week's Lesson: ${lesson.topic}*\n\n${lesson.hook}\n\n_${lesson.key}_`;
  sendTelegram(msg).catch(e => console.error(e));
} else {
  weeklyDigest().catch(e => console.error('Digest failed:', e));
}
