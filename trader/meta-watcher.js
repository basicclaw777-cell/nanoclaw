/**
 * meta-watcher.js — The hindsight analyst
 *
 * Watches every run silently. Logs what happened, what was missed,
 * what the opposite trade would have done. After enough data,
 * synthesizes patterns into insights nobody asked for.
 *
 * Doesn't trade. Doesn't advise. Just watches and writes notes.
 * Strategy 11 emerges from here.
 *
 * ESM.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'logs', 'trades.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS watcher_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT (datetime('now')),
        run_type TEXT NOT NULL,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS watcher_insights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT (datetime('now')),
        insight_type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        confidence REAL,
        supporting_data TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_watcher_type ON watcher_log(run_type);
      CREATE INDEX IF NOT EXISTS idx_insights_type ON watcher_insights(insight_type);
    `);
  }
  return db;
}

// ── Run Snapshot: log everything that happened this cycle ─────────────────────

export function watchRun(signals, decisions, prices, portfolio) {
  const d = getDb();

  // Snapshot the full signal landscape
  const signalsByStrategy = {};
  for (const s of signals) {
    const type = s.type || s.source || 'unknown';
    if (!signalsByStrategy[type]) signalsByStrategy[type] = [];
    signalsByStrategy[type].push({
      asset: s.asset,
      direction: s.direction,
      strength: s.strength,
    });
  }

  // What assets had signals? What was acted on?
  const assetsWithSignals = [...new Set(signals.filter(s => s.asset !== 'MARKET').map(s => s.asset))];
  const assetsActedOn = decisions
    .filter(d => d.outcome === 'executed' || d.action === 'OPENED')
    .map(d => d.asset);
  const assetsMissed = assetsWithSignals.filter(a => !assetsActedOn.includes(a));

  // Strategy agreement/disagreement matrix
  const assetVotes = {};
  for (const s of signals) {
    if (s.asset === 'MARKET') continue;
    if (!assetVotes[s.asset]) assetVotes[s.asset] = { long: [], short: [], neutral: [] };
    assetVotes[s.asset][s.direction || 'neutral'].push(s.type || s.source);
  }

  // Find convergence: where 3+ strategies agree
  const convergences = [];
  const divergences = [];
  for (const [asset, votes] of Object.entries(assetVotes)) {
    const longCount = votes.long.length;
    const shortCount = votes.short.length;
    if (longCount >= 3) {
      convergences.push({ asset, direction: 'long', strategies: votes.long, count: longCount });
    }
    if (shortCount >= 3) {
      convergences.push({ asset, direction: 'short', strategies: votes.short, count: shortCount });
    }
    if (longCount >= 2 && shortCount >= 2) {
      divergences.push({ asset, long: votes.long, short: votes.short });
    }
  }

  const snapshot = {
    signals_total: signals.length,
    signals_by_strategy: signalsByStrategy,
    assets_with_signals: assetsWithSignals,
    assets_acted_on: assetsActedOn,
    assets_missed: assetsMissed,
    convergences,
    divergences,
    asset_votes: assetVotes,
    portfolio_balance: portfolio?.balance,
    prices_snapshot: Object.fromEntries(
      Object.entries(prices || {}).map(([k, v]) => [k, v?.price || null])
    ),
  };

  d.prepare('INSERT INTO watcher_log (run_type, data) VALUES (?, ?)').run(
    'run_snapshot',
    JSON.stringify(snapshot)
  );

  // Log convergences as notable events
  for (const c of convergences) {
    d.prepare('INSERT INTO watcher_log (run_type, data) VALUES (?, ?)').run(
      'convergence',
      JSON.stringify(c)
    );
  }

  // Log divergences (strategies fighting)
  for (const div of divergences) {
    d.prepare('INSERT INTO watcher_log (run_type, data) VALUES (?, ?)').run(
      'divergence',
      JSON.stringify(div)
    );
  }

  console.log(`  [watcher] Snapshot: ${signals.length} signals, ${convergences.length} convergences, ${divergences.length} divergences, ${assetsMissed.length} assets missed`);
}

// ── Trade Close Analysis: counterfactual ─────────────────────────────────────

export function watchClose(trade, currentPrice) {
  const d = getDb();

  // What would the opposite trade have done?
  const oppositeDirection = trade.direction === 'long' ? 'short' : 'long';
  const oppositePnl = oppositeDirection === 'long'
    ? (currentPrice - trade.entry_price) * trade.position_size
    : (trade.entry_price - currentPrice) * trade.position_size;

  // Find which signals were active when this trade opened
  const openTime = trade.opened_at;
  const nearbySnapshot = d.prepare(`
    SELECT data FROM watcher_log
    WHERE run_type = 'run_snapshot'
    AND timestamp <= ?
    ORDER BY timestamp DESC LIMIT 1
  `).get(openTime);

  let signalsAtOpen = {};
  if (nearbySnapshot) {
    const snap = JSON.parse(nearbySnapshot.data);
    signalsAtOpen = snap.signals_by_strategy || {};
  }

  // Which strategies called this asset at open time?
  const strategiesForAsset = [];
  for (const [strategy, sigs] of Object.entries(signalsAtOpen)) {
    for (const sig of sigs) {
      if (sig.asset === trade.asset) {
        strategiesForAsset.push({
          strategy,
          direction: sig.direction,
          correct: sig.direction === trade.direction && trade.pnl > 0,
          wouldHaveWorked: (sig.direction === 'long' && currentPrice > trade.entry_price) ||
                           (sig.direction === 'short' && currentPrice < trade.entry_price),
        });
      }
    }
  }

  const analysis = {
    trade_id: trade.id,
    asset: trade.asset,
    direction: trade.direction,
    strategy: trade.strategy,
    entry_price: trade.entry_price,
    exit_price: currentPrice,
    pnl: trade.pnl,
    pnl_pct: trade.pnl_pct,
    opposite_would_have: oppositePnl,
    strategies_at_open: strategiesForAsset,
    closest_caller: null,
  };

  // Which strategy was closest to calling the actual move?
  if (strategiesForAsset.length > 0) {
    const correctCallers = strategiesForAsset.filter(s => s.wouldHaveWorked);
    if (correctCallers.length > 0) {
      analysis.closest_caller = correctCallers.map(s => s.strategy);
    }
  }

  d.prepare('INSERT INTO watcher_log (run_type, data) VALUES (?, ?)').run(
    'trade_close_analysis',
    JSON.stringify(analysis)
  );

  console.log(`  [watcher] Close analysis: ${trade.asset} ${trade.direction} PnL $${trade.pnl?.toFixed(2)} | opposite: $${oppositePnl.toFixed(2)} | callers: ${analysis.closest_caller?.join(', ') || 'none'}`);
}

// ── Periodic Insight Synthesis (called weekly or after N closes) ──────────────

export function synthesizeInsights() {
  const d = getDb();

  // Gather all snapshots
  const snapshots = d.prepare(`
    SELECT data FROM watcher_log WHERE run_type = 'run_snapshot' ORDER BY timestamp
  `).all().map(r => JSON.parse(r.data));

  const closeAnalyses = d.prepare(`
    SELECT data FROM watcher_log WHERE run_type = 'trade_close_analysis' ORDER BY timestamp
  `).all().map(r => JSON.parse(r.data));

  const convergences = d.prepare(`
    SELECT data FROM watcher_log WHERE run_type = 'convergence' ORDER BY timestamp
  `).all().map(r => JSON.parse(r.data));

  if (snapshots.length < 5) {
    return { ready: false, runs: snapshots.length, needed: 5 };
  }

  const insights = [];

  // 1. Which strategies generate the most signals?
  const strategyCounts = {};
  for (const snap of snapshots) {
    for (const [strat, sigs] of Object.entries(snap.signals_by_strategy || {})) {
      strategyCounts[strat] = (strategyCounts[strat] || 0) + sigs.length;
    }
  }
  insights.push({
    type: 'signal_volume',
    title: 'Signal Volume by Strategy',
    body: JSON.stringify(strategyCounts),
  });

  // 2. Convergence frequency — which strategies agree most often?
  const convergencePairs = {};
  for (const c of convergences) {
    const strats = c.strategies.sort();
    for (let i = 0; i < strats.length; i++) {
      for (let j = i + 1; j < strats.length; j++) {
        const pair = `${strats[i]}+${strats[j]}`;
        convergencePairs[pair] = (convergencePairs[pair] || 0) + 1;
      }
    }
  }
  if (Object.keys(convergencePairs).length > 0) {
    insights.push({
      type: 'convergence_pairs',
      title: 'Strategy Pairs That Agree Most Often',
      body: JSON.stringify(convergencePairs),
    });
  }

  // 3. Counterfactual analysis — how often was the opposite trade better?
  if (closeAnalyses.length > 0) {
    let oppositeWins = 0;
    let totalCloses = closeAnalyses.length;
    const bestCallers = {};

    for (const ca of closeAnalyses) {
      if (ca.opposite_would_have > (ca.pnl || 0)) oppositeWins++;
      if (ca.closest_caller) {
        for (const caller of ca.closest_caller) {
          bestCallers[caller] = (bestCallers[caller] || 0) + 1;
        }
      }
    }

    insights.push({
      type: 'counterfactual',
      title: 'Opposite Trade Would Have Been Better',
      body: `${oppositeWins}/${totalCloses} times (${((oppositeWins / totalCloses) * 100).toFixed(0)}%)`,
    });

    if (Object.keys(bestCallers).length > 0) {
      insights.push({
        type: 'best_callers',
        title: 'Strategies That Called The Actual Move',
        body: JSON.stringify(bestCallers),
      });
    }
  }

  // 4. Missed opportunities — assets with signals that were never traded
  const missedAssets = {};
  for (const snap of snapshots) {
    for (const asset of (snap.assets_missed || [])) {
      missedAssets[asset] = (missedAssets[asset] || 0) + 1;
    }
  }
  if (Object.keys(missedAssets).length > 0) {
    insights.push({
      type: 'missed_opportunities',
      title: 'Assets With Signals That Were Never Traded',
      body: JSON.stringify(missedAssets),
    });
  }

  // Store insights
  for (const insight of insights) {
    d.prepare('INSERT INTO watcher_insights (insight_type, title, body, confidence) VALUES (?, ?, ?, ?)').run(
      insight.type, insight.title, insight.body, 0.5
    );
  }

  return { ready: true, runs: snapshots.length, closes: closeAnalyses.length, insights };
}

// ── Query interface ──────────────────────────────────────────────────────────

export function getWatcherNotes(limit = 20) {
  const d = getDb();
  return d.prepare('SELECT * FROM watcher_log ORDER BY id DESC LIMIT ?').all(limit);
}

export function getWatcherInsights() {
  const d = getDb();
  return d.prepare('SELECT * FROM watcher_insights ORDER BY id DESC LIMIT 20').all();
}

export function getWatcherStats() {
  const d = getDb();
  const counts = d.prepare(`
    SELECT run_type, COUNT(*) as count FROM watcher_log GROUP BY run_type
  `).all();
  const insightCount = d.prepare('SELECT COUNT(*) as count FROM watcher_insights').get();
  return { log_counts: counts, insight_count: insightCount.count };
}
