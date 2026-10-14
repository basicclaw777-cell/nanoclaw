# Market Node Template

When Paul says "activate [node]", create a directory and these files:

## Directory: `~/nanoclaw/market-nodes/[node-name]/`

### 1. `spec.json` — What to watch
```json
{
  "name": "ram-memory",
  "label": "RAM / Memory Modules",
  "data_sources": [
    { "name": "PCPartPicker", "url": "...", "type": "scrape", "frequency": "weekly" }
  ],
  "watch_list": [],
  "alert_rules": [
    { "condition": "price_drop_pct > 15", "action": "telegram" }
  ]
}
```

### 2. `taste-memory.json` — Paul's signals (same pattern as property-scout)
```json
{
  "interactions": [],
  "last_displayed": { "items": [], "timestamp": null }
}
```

### 3. `[node]-commands.js` — Telegram commands (copy from property pattern)
- `/[node]` — market overview
- `/[node]list` — current watchlist with numbered items
- `/like [n]`, `/pass [n]`, `/note [n] [text]` — taste signals
- `/[node]taste` — taste summary

### 4. `data/` — scraped data lives here
- `latest.json` — current scan
- `history/` — weekly snapshots for delta

## Activation checklist
1. Create directory + files from template
2. Build scraper for data sources
3. Wire commands into `telegram-bot.js`
4. Add API route to `cath-bridge.cjs`
5. Update `registry.json` status → "active"
6. Set PM2 cron if needed
7. Test: Paul can `/[node]` and see data

## Ground truth gate (from Fable triage)
- Does Paul check this market at least weekly? If no, don't activate
- Is there a real data source to scrape? If no, it's decorative
- Will Paul use /like and /pass? If no, taste memory is theater
- Zero AI scoring. Paul's signals only. Mechanical matching only.

## What the registry IS and ISN'T
- IS: a map of what's possible, ready to activate
- ISN'T: 30 running agents producing reports nobody reads
- Dormant nodes cost nothing. Active nodes must have a human consumer.
