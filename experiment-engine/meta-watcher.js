/**
 * meta-watcher.js — The Watcher of Watchers
 *
 * Observes across ALL experiment domains. Silent from day one.
 * Finds what no single domain sees:
 *   - Cross-domain convergence (same strategy, different data, same signal)
 *   - Cross-domain divergence (same strategy, different results)
 *   - Strategy character profiles across domains
 *   - Temporal correlations between domains
 *   - The resonance map
 *
 * ESM.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'meta-watcher.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS meta_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT (datetime('now')),
        domain TEXT NOT NULL,
        event_type TEXT NOT NULL,
        strategy TEXT,
        asset_or_subject TEXT,
        direction_or_outcome TEXT,
        strength REAL,
        data TEXT
      );

      CREATE TABLE IF NOT EXISTS meta_convergences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT (datetime('now')),
        domains TEXT NOT NULL,
        strategy TEXT NOT NULL,
        description TEXT NOT NULL,
        confidence REAL,
        data TEXT
      );

      CREATE TABLE IF NOT EXISTS meta_strategy_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT (datetime('now')),
        strategy TEXT NOT NULL,
        domain TEXT NOT NULL,
        total_signals INTEGER DEFAULT 0,
        acted_on INTEGER DEFAULT 0,
        correct INTEGER DEFAULT 0,
        win_rate REAL,
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS meta_correlations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT (datetime('now')),
        domain_a TEXT NOT NULL,
        domain_b TEXT NOT NULL,
        event_a TEXT NOT NULL,
        event_b TEXT NOT NULL,
        lag_hours REAL,
        correlation REAL,
        occurrences INTEGER,
        description TEXT
      );

      CREATE TABLE IF NOT EXISTS meta_insights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT (datetime('now')),
        insight_type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        domains_involved TEXT,
        confidence REAL
      );

      CREATE INDEX IF NOT EXISTS idx_meta_events_domain ON meta_events(domain);
      CREATE INDEX IF NOT EXISTS idx_meta_events_strategy ON meta_events(strategy);
      CREATE INDEX IF NOT EXISTS idx_meta_events_ts ON meta_events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_meta_conv_strategy ON meta_convergences(strategy);
    `);
  }
  return db;
}

// ── Event Logging (called by each domain) ────────────────────────────────────

export function logEvent({ domain, event_type, strategy, asset_or_subject, direction_or_outcome, strength, data }) {
  const d = getDb();
  d.prepare(`
    INSERT INTO meta_events (domain, event_type, strategy, asset_or_subject, direction_or_outcome, strength, data)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(domain, event_type, strategy || null, asset_or_subject || null,
    direction_or_outcome || null, strength || null, data ? JSON.stringify(data) : null);
}

// Batch log signals from a domain run
export function logDomainRun(domain, signals) {
  const d = getDb();
  const stmt = d.prepare(`
    INSERT INTO meta_events (domain, event_type, strategy, asset_or_subject, direction_or_outcome, strength, data)
    VALUES (?, 'signal', ?, ?, ?, ?, ?)
  `);

  const tx = d.transaction((sigs) => {
    for (const s of sigs) {
      stmt.run(domain, s.type || s.source || s.strategy, s.asset || s.subject,
        s.direction || s.outcome, s.strength || null, JSON.stringify(s));
    }
  });

  tx(signals);
}

// ── Cross-Domain Convergence Detection ───────────────────────────────────────

export function detectCrossDomainConvergence(windowHours = 24) {
  const d = getDb();

  // Find same strategy active in multiple domains within time window
  const rows = d.prepare(`
    SELECT strategy, domain, direction_or_outcome, COUNT(*) as count,
           GROUP_CONCAT(DISTINCT asset_or_subject) as subjects
    FROM meta_events
    WHERE timestamp > datetime('now', '-' || ? || ' hours')
    AND strategy IS NOT NULL
    AND event_type = 'signal'
    GROUP BY strategy, domain, direction_or_outcome
  `).all(windowHours);

  // Group by strategy
  const byStrategy = {};
  for (const row of rows) {
    if (!byStrategy[row.strategy]) byStrategy[row.strategy] = [];
    byStrategy[row.strategy].push(row);
  }

  const convergences = [];
  for (const [strategy, domainRows] of Object.entries(byStrategy)) {
    // Need 2+ domains with same direction
    const domains = [...new Set(domainRows.map(r => r.domain))];
    if (domains.length < 2) continue;

    // Check direction agreement
    const directionGroups = {};
    for (const r of domainRows) {
      const dir = r.direction_or_outcome || 'neutral';
      if (!directionGroups[dir]) directionGroups[dir] = [];
      directionGroups[dir].push(r.domain);
    }

    for (const [direction, agreeing] of Object.entries(directionGroups)) {
      if (agreeing.length >= 2) {
        const convergence = {
          strategy,
          domains: [...new Set(agreeing)],
          direction,
          description: `${strategy} signals ${direction} in ${[...new Set(agreeing)].join(' + ')} (${windowHours}h window)`,
          confidence: Math.min(agreeing.length / 3, 1.0),
        };

        // Log it
        d.prepare(`
          INSERT INTO meta_convergences (domains, strategy, description, confidence, data)
          VALUES (?, ?, ?, ?, ?)
        `).run(JSON.stringify(convergence.domains), strategy, convergence.description,
          convergence.confidence, JSON.stringify(convergence));

        convergences.push(convergence);
      }
    }
  }

  return convergences;
}

// ── Strategy Profiles Across Domains ─────────────────────────────────────────

export function updateStrategyProfiles() {
  const d = getDb();

  // Get all strategy+domain combos from events
  const rows = d.prepare(`
    SELECT strategy, domain,
           COUNT(*) as total_signals,
           SUM(CASE WHEN direction_or_outcome IN ('long', 'positive', 'improved') THEN 1 ELSE 0 END) as positive,
           SUM(CASE WHEN direction_or_outcome IN ('short', 'negative', 'declined') THEN 1 ELSE 0 END) as negative
    FROM meta_events
    WHERE strategy IS NOT NULL
    AND event_type = 'signal'
    GROUP BY strategy, domain
  `).all();

  // Upsert profiles
  const upsert = d.prepare(`
    INSERT OR REPLACE INTO meta_strategy_profiles (strategy, domain, total_signals, acted_on, win_rate, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const r of rows) {
    const total = r.positive + r.negative;
    const winRate = total > 0 ? (r.positive / total) : null;
    upsert.run(r.strategy, r.domain, r.total_signals, total, winRate,
      `${r.positive} positive, ${r.negative} negative`);
  }

  return rows.length;
}

// ── Weekly Synthesis ─────────────────────────────────────────────────────────

export function weeklySynthesis() {
  const d = getDb();
  const insights = [];

  // 1. Cross-domain convergences this week
  const convergences = d.prepare(`
    SELECT * FROM meta_convergences
    WHERE timestamp > datetime('now', '-7 days')
    ORDER BY confidence DESC
  `).all();

  if (convergences.length > 0) {
    insights.push({
      type: 'weekly_convergences',
      title: `${convergences.length} Cross-Domain Convergences This Week`,
      body: convergences.map(c => c.description).join('\n'),
      domains: [...new Set(convergences.flatMap(c => JSON.parse(c.domains)))],
    });
  }

  // 2. Strategy character profiles
  const profiles = d.prepare(`
    SELECT strategy,
           GROUP_CONCAT(domain || ':' || total_signals || 's') as domain_summary,
           COUNT(DISTINCT domain) as domain_count,
           AVG(win_rate) as avg_win_rate
    FROM meta_strategy_profiles
    WHERE total_signals > 0
    GROUP BY strategy
    ORDER BY domain_count DESC, avg_win_rate DESC
  `).all();

  if (profiles.length > 0) {
    const universalStrategies = profiles.filter(p => p.domain_count >= 2);
    if (universalStrategies.length > 0) {
      insights.push({
        type: 'universal_strategies',
        title: 'Strategies Active Across Multiple Domains',
        body: universalStrategies.map(p =>
          `${p.strategy}: ${p.domain_count} domains (${p.domain_summary}), avg win rate ${p.avg_win_rate ? (p.avg_win_rate * 100).toFixed(0) + '%' : 'TBD'}`
        ).join('\n'),
      });
    }
  }

  // 3. Domain activity summary
  const domainActivity = d.prepare(`
    SELECT domain, COUNT(*) as events,
           COUNT(DISTINCT strategy) as strategies,
           MIN(timestamp) as first_event,
           MAX(timestamp) as last_event
    FROM meta_events
    WHERE timestamp > datetime('now', '-7 days')
    GROUP BY domain
    ORDER BY events DESC
  `).all();

  if (domainActivity.length > 0) {
    insights.push({
      type: 'domain_activity',
      title: 'Domain Activity This Week',
      body: domainActivity.map(d =>
        `${d.domain}: ${d.events} events, ${d.strategies} strategies`
      ).join('\n'),
    });
  }

  // Store insights
  for (const insight of insights) {
    d.prepare(`
      INSERT INTO meta_insights (insight_type, title, body, domains_involved, confidence)
      VALUES (?, ?, ?, ?, ?)
    `).run(insight.type, insight.title, insight.body,
      JSON.stringify(insight.domains || []), 0.5);
  }

  return { insights, convergences: convergences.length, profiles: profiles.length };
}

// ── Query Interface ──────────────────────────────────────────────────────────

export function getStats() {
  const d = getDb();
  const events = d.prepare('SELECT domain, COUNT(*) as count FROM meta_events GROUP BY domain').all();
  const convergences = d.prepare('SELECT COUNT(*) as count FROM meta_convergences').get();
  const insights = d.prepare('SELECT COUNT(*) as count FROM meta_insights').get();
  const profiles = d.prepare('SELECT COUNT(*) as count FROM meta_strategy_profiles').get();
  return {
    events_by_domain: Object.fromEntries(events.map(e => [e.domain, e.count])),
    total_convergences: convergences.count,
    total_insights: insights.count,
    total_profiles: profiles.count,
  };
}

export function getRecentConvergences(limit = 10) {
  const d = getDb();
  return d.prepare('SELECT * FROM meta_convergences ORDER BY id DESC LIMIT ?').all(limit);
}

export function getRecentInsights(limit = 10) {
  const d = getDb();
  return d.prepare('SELECT * FROM meta_insights ORDER BY id DESC LIMIT ?').all(limit);
}

export function getStrategyProfile(strategy) {
  const d = getDb();
  return d.prepare('SELECT * FROM meta_strategy_profiles WHERE strategy = ?').all(strategy);
}

export function getAllProfiles() {
  const d = getDb();
  return d.prepare(`
    SELECT strategy, domain, total_signals, win_rate
    FROM meta_strategy_profiles
    WHERE total_signals > 0
    ORDER BY strategy, domain
  `).all();
}
