/**
 * daily-pick.js — Paul vs Machine parallel experiment
 *
 * Daily quiz: real market data, simplified to A/B/C choice.
 * Paul picks via Telegram callback buttons.
 * System tracks both portfolios. Weekly scoreboard.
 *
 * DB: trades.db (daily_picks table)
 * PM2 cron: 09:00 HKT daily
 *
 * ESM.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DB_PATH = path.join(__dirname, 'logs', 'trades.db');
const SIGNALS_PATH = path.join(__dirname, 'signals', 'crypto-signals-latest.json');
const CATHEDRAL_SIGNALS_PATH = path.join(__dirname, 'signals', 'cathedral-signals-latest.json');

const BOT_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.PAUL_CHAT_ID;

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS daily_picks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        asset TEXT NOT NULL,
        price_at_pick REAL NOT NULL,
        option_a TEXT NOT NULL,
        option_b TEXT NOT NULL,
        option_c TEXT NOT NULL,
        context TEXT,
        paul_pick TEXT,
        paul_picked_at TEXT,
        ai_pick TEXT,
        ai_reasoning TEXT,
        price_24h_later REAL,
        paul_result TEXT,
        ai_result TEXT,
        paul_pnl REAL DEFAULT 0,
        ai_pnl REAL DEFAULT 0,
        resolved INTEGER DEFAULT 0,
        lesson_id TEXT
      );

      CREATE TABLE IF NOT EXISTS pick_portfolio (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player TEXT NOT NULL,
        balance REAL DEFAULT 10000,
        total_picks INTEGER DEFAULT 0,
        correct INTEGER DEFAULT 0,
        total_pnl REAL DEFAULT 0,
        last_updated TEXT
      );

      CREATE TABLE IF NOT EXISTS trading_lessons (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        content TEXT NOT NULL,
        source_pick_id INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        times_shown INTEGER DEFAULT 0
      );
    `);

    // Initialize portfolios if empty
    const count = db.prepare('SELECT COUNT(*) as c FROM pick_portfolio').get().c;
    if (count === 0) {
      db.prepare('INSERT INTO pick_portfolio (player, balance) VALUES (?, ?)').run('paul', 10000);
      db.prepare('INSERT INTO pick_portfolio (player, balance) VALUES (?, ?)').run('ai', 10000);
    }
  }
  return db;
}

// ── Load market data ────────────────────────────────────────────────────────

function loadSignals() {
  const data = {};
  try {
    if (fs.existsSync(SIGNALS_PATH)) {
      const raw = JSON.parse(fs.readFileSync(SIGNALS_PATH, 'utf8'));
      data.prices = raw.prices || {};
      data.fear_greed = raw.fear_greed;
      data.sentiment = raw.reddit_sentiment;
      data.signals = raw.signals || [];
      data.news = raw.news || [];
    }
  } catch (e) {}

  try {
    if (fs.existsSync(CATHEDRAL_SIGNALS_PATH)) {
      const cat = JSON.parse(fs.readFileSync(CATHEDRAL_SIGNALS_PATH, 'utf8'));
      data.signals = [...(data.signals || []), ...(cat.signals || [])];
    }
  } catch (e) {}

  return data;
}

// ── Pick the best asset for today's quiz ────────────────────────────────────

function selectAssetForQuiz(data) {
  const candidates = ['BTC', 'ETH', 'SOL', 'AVAX', 'LINK', 'DOGE', 'ADA'];

  // Find asset with most signal activity (most interesting to quiz on)
  const signalCounts = {};
  for (const s of (data.signals || [])) {
    if (s.asset === 'MARKET') continue;
    signalCounts[s.asset] = (signalCounts[s.asset] || 0) + 1;
  }

  // Sort by signal count, prefer assets with signals
  const ranked = candidates
    .filter(c => data.prices?.[c]?.price)
    .sort((a, b) => (signalCounts[b] || 0) - (signalCounts[a] || 0));

  // Don't repeat yesterday's asset
  const d = getDb();
  const yesterday = d.prepare('SELECT asset FROM daily_picks ORDER BY id DESC LIMIT 1').get();
  const filtered = ranked.filter(a => a !== yesterday?.asset);

  return filtered[0] || ranked[0] || 'BTC';
}

// ── Build the quiz ──────────────────────────────────────────────────────────

function buildQuiz(data) {
  const d = getDb();
  const today = new Date().toISOString().split('T')[0];

  // Check if already sent today
  const existing = d.prepare('SELECT id FROM daily_picks WHERE date = ?').get(today);
  if (existing) {
    console.log(`[daily-pick] Already sent quiz for ${today}`);
    return null;
  }

  const asset = selectAssetForQuiz(data);
  const priceData = data.prices[asset];
  if (!priceData?.price) {
    console.log(`[daily-pick] No price for ${asset}`);
    return null;
  }

  const price = priceData.price;
  const change24h = priceData.change_24h || 0;

  // Gather signals for this asset
  const assetSignals = (data.signals || []).filter(s => s.asset === asset);
  const longSignals = assetSignals.filter(s => s.direction === 'long');
  const shortSignals = assetSignals.filter(s => s.direction === 'short');

  // Build context string
  const contextParts = [];
  contextParts.push(`${asset} @ $${price < 10 ? price.toFixed(2) : price.toLocaleString()}`);
  contextParts.push(`24h: ${change24h >= 0 ? '+' : ''}${change24h.toFixed(1)}%`);

  if (data.fear_greed) {
    contextParts.push(`Fear/Greed: ${data.fear_greed.value} (${data.fear_greed.label})`);
  }

  if (longSignals.length > 0) {
    const types = [...new Set(longSignals.map(s => s.type || s.source))];
    contextParts.push(`${longSignals.length} strategy says LONG [${types.slice(0, 3).join(', ')}]`);
  }
  if (shortSignals.length > 0) {
    const types = [...new Set(shortSignals.map(s => s.type || s.source))];
    contextParts.push(`${shortSignals.length} strategy says SHORT [${types.slice(0, 3).join(', ')}]`);
  }

  if (data.sentiment) {
    contextParts.push(`Reddit: ${data.sentiment.sentiment_label} (${data.sentiment.sentiment_score.toFixed(2)})`);
  }

  // Add one interesting detail
  const bestSignal = assetSignals.sort((a, b) => b.strength - a.strength)[0];
  if (bestSignal) {
    contextParts.push(`Strongest signal: ${bestSignal.reasoning.slice(0, 80)}`);
  }

  // Options always same structure
  const option_a = `LONG ${asset} — buy the dip / ride momentum`;
  const option_b = `SHORT ${asset} — fade the move / protect`;
  const option_c = `SIT OUT — signals unclear, patience`;

  // AI's pick (from confluence)
  let ai_pick = 'C';
  let ai_reasoning = 'Signals conflicting — no clear edge.';

  if (longSignals.length >= 2 && longSignals.length > shortSignals.length) {
    ai_pick = 'A';
    const types = [...new Set(longSignals.map(s => s.type || s.source))];
    ai_reasoning = `${longSignals.length} strategies agree LONG [${types.join(', ')}]. Confluence = edge.`;
  } else if (shortSignals.length >= 2 && shortSignals.length > longSignals.length) {
    ai_pick = 'B';
    const types = [...new Set(shortSignals.map(s => s.type || s.source))];
    ai_reasoning = `${shortSignals.length} strategies agree SHORT [${types.join(', ')}]. Confluence = edge.`;
  }

  const context = contextParts.join('\n');

  // Save to DB
  d.prepare(`
    INSERT INTO daily_picks (date, asset, price_at_pick, option_a, option_b, option_c, context, ai_pick, ai_reasoning)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(today, asset, price, option_a, option_b, option_c, context, ai_pick, ai_reasoning);

  return {
    date: today,
    asset,
    price,
    change24h,
    context,
    option_a,
    option_b,
    option_c,
    ai_pick,
    ai_reasoning,
    longCount: longSignals.length,
    shortCount: shortSignals.length,
  };
}

// ── Send to Telegram ────────────────────────────────────────────────────────

async function sendQuiz(quiz) {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log('[daily-pick] No Telegram config');
    return;
  }

  const priceStr = quiz.price < 10 ? `$${quiz.price.toFixed(2)}` : `$${quiz.price.toLocaleString()}`;
  const changeStr = `${quiz.change24h >= 0 ? '+' : ''}${quiz.change24h.toFixed(1)}%`;

  const text = [
    `DAILY PICK — ${quiz.date}`,
    ``,
    quiz.context,
    ``,
    `A) ${quiz.option_a}`,
    `B) ${quiz.option_b}`,
    `C) ${quiz.option_c}`,
    ``,
    `Tap your pick. AI already locked in.`,
  ].join('\n');

  const keyboard = {
    inline_keyboard: [[
      { text: 'A) LONG', callback_data: `pick_A_${quiz.date}` },
      { text: 'B) SHORT', callback_data: `pick_B_${quiz.date}` },
      { text: 'C) SIT OUT', callback_data: `pick_C_${quiz.date}` },
    ]],
  };

  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        reply_markup: keyboard,
      }),
    });
    console.log(`[daily-pick] Quiz sent: ${quiz.asset} @ ${priceStr}`);
  } catch (e) {
    console.error('[daily-pick] Send failed:', e.message);
  }
}

// ── Handle Paul's pick (called from telegram-bot.js callback) ───────────────

export function handlePick(pick, date) {
  const d = getDb();
  let row = d.prepare('SELECT * FROM daily_picks WHERE date = ? AND paul_pick IS NULL').get(date);
  if (!row) {
    // Allow overriding MISS picks (late pick still has value)
    row = d.prepare("SELECT * FROM daily_picks WHERE date = ? AND paul_pick = 'MISS'").get(date);
  }
  if (!row) return null;

  d.prepare('UPDATE daily_picks SET paul_pick = ?, paul_picked_at = datetime("now") WHERE id = ?')
    .run(pick, row.id);

  const pickLabel = pick === 'A' ? 'LONG' : pick === 'B' ? 'SHORT' : 'SIT OUT';
  const aiLabel = row.ai_pick === 'A' ? 'LONG' : row.ai_pick === 'B' ? 'SHORT' : 'SIT OUT';
  const agree = pick === row.ai_pick;

  return {
    asset: row.asset,
    paulPick: pickLabel,
    aiPick: aiLabel,
    agree,
    message: agree
      ? `You and AI both picked ${pickLabel} on ${row.asset}. Great minds...`
      : `You: ${pickLabel} | AI: ${aiLabel} on ${row.asset}. Let's see who's right tomorrow.`,
  };
}

// ── Resolve yesterday's picks (called daily before new quiz) ────────────────

export async function resolveYesterday() {
  const d = getDb();

  const unresolved = d.prepare(`
    SELECT * FROM daily_picks WHERE resolved = 0 AND paul_pick IS NOT NULL
    AND date < date('now')
  `).all();

  if (unresolved.length === 0) return [];

  // Fetch current prices
  const assets = [...new Set(unresolved.map(u => u.asset))];
  const COIN_IDS = {
    BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana',
    AVAX: 'avalanche-2', LINK: 'chainlink', DOT: 'polkadot',
    ARB: 'arbitrum', DOGE: 'dogecoin', ADA: 'cardano',
    ATOM: 'cosmos', UNI: 'uniswap',
  };

  let prices = {};
  try {
    const ids = assets.map(a => COIN_IDS[a]).filter(Boolean).join(',');
    const resp = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) }
    );
    const data = await resp.json();
    for (const [sym, cgId] of Object.entries(COIN_IDS)) {
      if (data[cgId]?.usd) prices[sym] = data[cgId].usd;
    }
  } catch (e) {
    console.error('[daily-pick] Price fetch failed:', e.message);
    return [];
  }

  const results = [];

  for (const pick of unresolved) {
    const currentPrice = prices[pick.asset];
    if (!currentPrice) continue;

    const priceDelta = (currentPrice - pick.price_at_pick) / pick.price_at_pick;
    const positionSize = 1000; // $1000 per pick for tracking

    // Determine results
    function scoreResult(choice) {
      if (choice === 'C') return { result: 'sat_out', pnl: 0 };
      if (choice === 'A') {
        // LONG — profit if price went up
        return {
          result: priceDelta > 0.005 ? 'correct' : priceDelta < -0.005 ? 'wrong' : 'flat',
          pnl: priceDelta * positionSize,
        };
      }
      if (choice === 'B') {
        // SHORT — profit if price went down
        return {
          result: priceDelta < -0.005 ? 'correct' : priceDelta > 0.005 ? 'wrong' : 'flat',
          pnl: -priceDelta * positionSize,
        };
      }
      return { result: 'unknown', pnl: 0 };
    }

    const paulScore = scoreResult(pick.paul_pick);
    const aiScore = scoreResult(pick.ai_pick);

    // Generate lesson from this pick
    let lessonId = null;
    if (paulScore.result !== aiScore.result) {
      lessonId = `lesson_${pick.date}_${pick.asset}`;
      const lesson = generateLesson(pick, paulScore, aiScore, priceDelta, currentPrice);
      if (lesson) {
        d.prepare(`
          INSERT OR REPLACE INTO trading_lessons (id, title, category, content, source_pick_id)
          VALUES (?, ?, ?, ?, ?)
        `).run(lessonId, lesson.title, lesson.category, lesson.content, pick.id);
      }
    }

    // Update pick record
    d.prepare(`
      UPDATE daily_picks SET
        price_24h_later = ?, paul_result = ?, ai_result = ?,
        paul_pnl = ?, ai_pnl = ?, resolved = 1, lesson_id = ?
      WHERE id = ?
    `).run(currentPrice, paulScore.result, aiScore.result,
      paulScore.pnl, aiScore.pnl, lessonId, pick.id);

    // Update portfolios
    d.prepare(`
      UPDATE pick_portfolio SET
        balance = balance + ?, total_picks = total_picks + 1,
        correct = correct + ?, total_pnl = total_pnl + ?,
        last_updated = datetime('now')
      WHERE player = 'paul'
    `).run(paulScore.pnl, paulScore.result === 'correct' ? 1 : 0, paulScore.pnl);

    d.prepare(`
      UPDATE pick_portfolio SET
        balance = balance + ?, total_picks = total_picks + 1,
        correct = correct + ?, total_pnl = total_pnl + ?,
        last_updated = datetime('now')
      WHERE player = 'ai'
    `).run(aiScore.pnl, aiScore.result === 'correct' ? 1 : 0, aiScore.pnl);

    results.push({
      date: pick.date,
      asset: pick.asset,
      priceAtPick: pick.price_at_pick,
      currentPrice,
      priceDelta: (priceDelta * 100).toFixed(2),
      paulPick: pick.paul_pick,
      paulResult: paulScore.result,
      paulPnl: paulScore.pnl.toFixed(2),
      aiPick: pick.ai_pick,
      aiResult: aiScore.result,
      aiPnl: aiScore.pnl.toFixed(2),
      lessonId,
    });
  }

  return results;
}

// ── Generate lesson from pick outcome ───────────────────────────────────────

function generateLesson(pick, paulScore, aiScore, priceDelta, currentPrice) {
  const categories = {
    contrarian: 'Contrarian Thinking',
    momentum: 'Momentum & Trend',
    risk: 'Risk Management',
    sentiment: 'Sentiment Reading',
    patience: 'Patience & Discipline',
    confluence: 'Signal Confluence',
  };

  let title, category, content;

  if (paulScore.result === 'wrong' && aiScore.result === 'correct') {
    // AI was right, Paul was wrong
    if (pick.ai_pick === 'C') {
      category = 'patience';
      title = 'When sitting out wins';
      content = `${pick.asset} moved ${(priceDelta * 100).toFixed(1)}% — signals were conflicting and AI sat out. Sometimes the best trade is no trade. The edge was unclear, and forcing a pick cost $${Math.abs(paulScore.pnl).toFixed(2)}.`;
    } else {
      category = 'confluence';
      title = `Confluence called ${pick.asset} correctly`;
      content = `AI pick was based on ${pick.ai_reasoning}. Multiple strategies agreeing creates a stronger signal than gut feeling alone. Result: AI +$${aiScore.pnl.toFixed(2)} vs Paul -$${Math.abs(paulScore.pnl).toFixed(2)}.`;
    }
  } else if (paulScore.result === 'correct' && aiScore.result === 'wrong') {
    // Paul was right, AI was wrong
    category = 'sentiment';
    title = `Paul's instinct beat the machine`;
    content = `${pick.asset}: Paul picked ${pick.paul_pick === 'A' ? 'LONG' : 'SHORT'} while AI went ${pick.ai_pick === 'A' ? 'LONG' : pick.ai_pick === 'B' ? 'SHORT' : 'SIT OUT'}. Human intuition caught something the algorithms missed. Worth investigating: what did Paul see that the data didn't show?`;
  } else if (paulScore.result === 'correct' && aiScore.result === 'sat_out') {
    category = 'momentum';
    title = 'Conviction vs caution';
    content = `Paul took a position while AI sat out. The move proved Paul right (+$${paulScore.pnl.toFixed(2)}). Sometimes hesitation costs more than risk. Key: was this repeatable conviction or lucky guess?`;
  } else {
    return null; // No interesting lesson
  }

  return { title, category: categories[category] || category, content };
}

// ── Scoreboard ──────────────────────────────────────────────────────────────

export function getScoreboard() {
  const d = getDb();

  const paul = d.prepare('SELECT * FROM pick_portfolio WHERE player = ?').get('paul');
  const ai = d.prepare('SELECT * FROM pick_portfolio WHERE player = ?').get('ai');

  const recentPicks = d.prepare(`
    SELECT * FROM daily_picks WHERE resolved = 1 ORDER BY date DESC LIMIT 10
  `).all();

  const streak = d.prepare(`
    SELECT paul_result FROM daily_picks WHERE resolved = 1 AND paul_pick IS NOT NULL
    ORDER BY date DESC LIMIT 10
  `).all();

  let paulStreak = 0;
  for (const s of streak) {
    if (s.paul_result === 'correct') paulStreak++;
    else break;
  }

  return { paul, ai, recentPicks, paulStreak };
}

// ── Get lessons ─────────────────────────────────────────────────────────────

export function getLessons(category = null) {
  const d = getDb();
  if (category) {
    return d.prepare('SELECT * FROM trading_lessons WHERE category = ? ORDER BY created_at DESC').all(category);
  }
  return d.prepare('SELECT * FROM trading_lessons ORDER BY created_at DESC').all();
}

export function getLesson(id) {
  const d = getDb();
  const lesson = d.prepare('SELECT * FROM trading_lessons WHERE id = ?').get(id);
  if (lesson) {
    d.prepare('UPDATE trading_lessons SET times_shown = times_shown + 1 WHERE id = ?').run(id);
  }
  return lesson;
}

// ── Main: daily cron ────────────────────────────────────────────────────────

async function run() {
  console.log(`[daily-pick] Running — ${new Date().toISOString()}`);

  // 0. Mark quizzes older than 3 days as missed (gives Paul time to pick late)
  const d = getDb();
  const missed = d.prepare(`
    UPDATE daily_picks SET paul_pick = 'MISS', paul_picked_at = datetime('now')
    WHERE paul_pick IS NULL AND date < date('now', '-3 days')
  `).run();
  if (missed.changes > 0) console.log(`[daily-pick] Marked ${missed.changes} missed picks (>3 days old)`);

  // 1. Resolve yesterday's picks first
  const resolved = await resolveYesterday();
  if (resolved.length > 0) {
    console.log(`[daily-pick] Resolved ${resolved.length} picks`);

    // Send results to Telegram
    for (const r of resolved) {
      const paulEmoji = r.paulResult === 'correct' ? 'W' : r.paulResult === 'wrong' ? 'L' : '-';
      const aiEmoji = r.aiResult === 'correct' ? 'W' : r.aiResult === 'wrong' ? 'L' : '-';
      const msg = [
        `YESTERDAY'S RESULT`,
        `${r.asset}: $${r.priceAtPick} -> $${r.currentPrice} (${r.priceDelta}%)`,
        `Paul: ${r.paulPick === 'A' ? 'LONG' : r.paulPick === 'B' ? 'SHORT' : 'SAT OUT'} [${paulEmoji}] $${r.paulPnl}`,
        `AI: ${r.aiPick === 'A' ? 'LONG' : r.aiPick === 'B' ? 'SHORT' : 'SAT OUT'} [${aiEmoji}] $${r.aiPnl}`,
      ].join('\n');

      try {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: CHAT_ID, text: msg }),
        });
      } catch (e) {}
    }
  }

  // 2. Build and send today's quiz
  const data = loadSignals();
  if (!data.prices || Object.keys(data.prices).length === 0) {
    console.log('[daily-pick] No price data — waiting for next signals run');
    return;
  }

  const quiz = buildQuiz(data);
  if (quiz) {
    await sendQuiz(quiz);
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('daily-pick.js')) {
  const arg = process.argv[2];
  if (arg === 'scoreboard') {
    const sb = getScoreboard();
    console.log('\n=== PAUL vs MACHINE ===\n');
    console.log(`Paul:  $${sb.paul.balance.toFixed(2)} | ${sb.paul.correct}/${sb.paul.total_picks} correct | PnL: $${sb.paul.total_pnl.toFixed(2)}`);
    console.log(`AI:    $${sb.ai.balance.toFixed(2)} | ${sb.ai.correct}/${sb.ai.total_picks} correct | PnL: $${sb.ai.total_pnl.toFixed(2)}`);
    console.log(`Paul streak: ${sb.paulStreak}`);
  } else if (arg === 'lessons') {
    const lessons = getLessons();
    for (const l of lessons) {
      console.log(`[${l.category}] ${l.title}`);
      console.log(`  ${l.content.slice(0, 100)}...`);
    }
  } else {
    run().catch(e => { console.error('[FATAL]', e); process.exit(1); });
  }
}
