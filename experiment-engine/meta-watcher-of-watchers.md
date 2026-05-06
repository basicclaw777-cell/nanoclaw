---
title: "Meta-Watcher-of-Watchers — Design Document"
date: 2026-05-07
status: design-complete, build-before-domain-2
---

# Meta-Watcher-of-Watchers

## Principle
Same as the trading watcher: silent from day one, reveals later.
Must be live BEFORE Boxing (domain 2) goes live.
Retrofitting loses data. Design now, build next session.

## What It Watches

### 1. Cross-Domain Convergence
When strategies from different domains accidentally agree:
- Lunar cycles predicting both market moves AND boxing performance
- Schumann resonance appearing in price oscillations AND movement rhythm
- Vortex compression detected in markets AND in pad session tempo
- Fibonacci timing in price AND in training periodisation

These are the Cathedral's highest-signal findings. If two completely independent
data streams produce the same pattern through the same lens — that's structural,
not narrative.

### 2. Cross-Domain Divergence
When the same strategy works in one domain but fails in another:
- Gann geometry predicts markets but not boxing → geometry is market-specific
- Lunar cycles predict nothing anywhere → rhythm hypothesis is noise
- Suppression signal works in markets AND gym business → institutional narrative patterns are universal

Divergence maps the boundaries of each worldview.

### 3. Strategy Character Profiles (across domains)
Each strategy builds a track record ACROSS domains:
- "Fibonacci is 60% win rate in trading, 45% in boxing, 70% in creative direction"
- "Vortex Flow is the best cross-domain strategy at 58% average"
- "Lunar Cycles is noise everywhere except creative direction where it's 72%"

The universal strategies emerge from the data, not from theory.

### 4. Temporal Correlation
When events in one domain precede events in another:
- Market compression → boxing session quality improves 2 days later (or vice versa)
- City mood (HK Pulse) → gym attendance next day
- Paul's research depth → creative output quality same week

These lag correlations are invisible to any single domain watcher.

### 5. The Resonance Map
After enough data: which domains vibrate together?
- Do trading and boxing data show the same weekly rhythm?
- Does creative output peak when research is deepest?
- Is there a meta-frequency across all domains?

This is the Cathedral's ultimate question: unified pattern language.

## Architecture

### Data Model

```sql
-- Cross-domain event log
CREATE TABLE meta_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT DEFAULT (datetime('now')),
  domain TEXT NOT NULL,        -- 'trading', 'boxing', 'creative', etc.
  event_type TEXT NOT NULL,    -- 'signal', 'convergence', 'trade_close', 'session', etc.
  strategy TEXT,               -- which strategy generated this
  asset_or_subject TEXT,       -- what it's about
  direction_or_outcome TEXT,   -- long/short, improved/declined, selected/rejected
  strength REAL,
  data TEXT                    -- JSON blob with full context
);

-- Cross-domain convergence detections
CREATE TABLE meta_convergences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT DEFAULT (datetime('now')),
  domains TEXT NOT NULL,       -- JSON array: ["trading", "boxing"]
  strategy TEXT NOT NULL,      -- which strategy converged
  description TEXT NOT NULL,
  confidence REAL,
  data TEXT
);

-- Strategy cross-domain performance
CREATE TABLE meta_strategy_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT DEFAULT (datetime('now')),
  strategy TEXT NOT NULL,
  domain TEXT NOT NULL,
  total_signals INTEGER,
  acted_on INTEGER,
  correct INTEGER,
  win_rate REAL,
  notes TEXT
);

-- Temporal correlations
CREATE TABLE meta_correlations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT DEFAULT (datetime('now')),
  domain_a TEXT NOT NULL,
  domain_b TEXT NOT NULL,
  event_a TEXT NOT NULL,
  event_b TEXT NOT NULL,
  lag_hours REAL,              -- how far apart
  correlation REAL,            -- strength of pattern
  occurrences INTEGER,
  description TEXT
);

-- Periodic synthesis (weekly)
CREATE TABLE meta_insights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT DEFAULT (datetime('now')),
  insight_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  domains_involved TEXT,       -- JSON array
  confidence REAL
);
```

### Integration Points

Each domain watcher publishes events to the meta-watcher:

```javascript
// Called by each domain's watcher/orchestrator at end of run
metaWatcher.logEvent({
  domain: 'trading',
  event_type: 'convergence',
  strategy: 'fibonacci_time',
  asset_or_subject: 'AVAX',
  direction_or_outcome: 'long',
  strength: 1.0,
  data: { convergence_score: 10, strategies: ['fibonacci', 'vortex', 'fibonacci_time'] }
});
```

### Analysis Runs

**After every domain run:**
- Log all events from that run
- Check: did any other domain produce a signal from the same strategy in the last 24h?
- If yes: log cross-domain convergence

**Daily (06:00 HKT, before morning briefing):**
- Scan all events from last 24h across all domains
- Detect strategy character patterns (which strategies are active across domains)
- Check temporal correlations (lag analysis)
- Generate daily meta-note (silent, stored)

**Weekly (Sunday):**
- Full synthesis: strategy profiles across all domains
- Resonance map update
- Surface top 3 cross-domain findings
- Feed into morning briefing

### Morning Briefing Integration

The meta-watcher adds a "cross-domain" section:
"Interesting pattern this week: Fibonacci called both the AVAX breakout in trading
and the tempo shift in your Thursday pad session. Two completely different data
streams, same mathematical lens, same timing. Either phi is everywhere or we're
seeing patterns in noise. The leaderboard will tell us which."

### File Location
~/nanoclaw/experiment-engine/meta-watcher.js

### Build Checklist
- [ ] Create ~/nanoclaw/experiment-engine/ directory
- [ ] meta-watcher.js with SQLite tables + event logging
- [ ] logEvent() function callable from any domain
- [ ] Wire trading watcher to publish events
- [ ] Daily analysis cron (06:00 HKT)
- [ ] Weekly synthesis
- [ ] Morning briefing cross-domain section
- [ ] Build BEFORE domain 2 (boxing) goes live
