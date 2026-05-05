# Cathedral Nervous System Architecture

## Provenance
Authored by Claude Code (Opus 4.6), 2026-04-24 session. Investigation-derived from live system state, not sourced from vault.

---

## Overview

The Cathedral's nervous system is a set of autonomous agents, shared state files, and polling endpoints that keep Paul's projects alive without manual intervention. There is no central bus. Agents coordinate via filesystem conventions, timestamp-based staleness detection, and exclusive ownership of state files.

Villa (localhost:8888) = Paul's workspace. The face.
Constellation (localhost:8889) = the nervous system made visible. The body.

---

## Data Flow Architecture

### Villa (Control Panel) — Pull-Only

| Endpoint | Interval | Data Source |
|----------|----------|-------------|
| `/villa/snapshot` | 30s | PM2 state + vault counts + muse finding + senses + board + recent files |
| `/status` | 5s | PM2 process list (Cathy presence only) |
| `/villa/projects` | 60s | Vault frontmatter from `08_Project_Orchestrator/projects/*.md` |
| `/villa/artifacts` | Initial load | Filesystem scan of `09_Artifacts/` |

No WebSocket. No SSE. No push. cath-bridge assembles everything on-demand from filesystem + `pm2 jlist`.

### Constellation — Pull-Only

| Endpoint | Interval | Data Source |
|----------|----------|-------------|
| `/constellation` | 30s | Registry.json + PM2 state + vault cards + cath-state.json + vault activity |

---

## Agent Ecosystem

### File Watchers (Event-Driven)

**the-archivist** (`~/Cathedral/the-archivist.js`)
- TRIGGER: chokidar on `~/cathedral-vault/00_Staging/muse-findings/*.md`
- INPUT: muse findings + vault-embedder semantic search
- OUTPUT: enriches muse finding IN-PLACE (cross-links, related domains, wikilinks)
- PUSH: Telegram 📚
- KEY: Only agent that modifies the file it watches

**the-cartographer** (`~/Cathedral/the-cartographer.js`)
- TRIGGER: chokidar on `session-harvest-*.md` (pass1/evening only)
- INPUT: session harvests + CLAUDE.md + Ollama qwen3:14b
- OUTPUT: rewrites `~/cathedral-vault/06_Methods/operational-map.md` (DONE/NOW/PLANNED/PARKED)
- PUSH: none (silent mapper)
- KEY: Deterministic — never deletes, only adds and reorders

**cognitive-scanner** (`~/nanoclaw/cognitive-scanner.js`)
- TRIGGER: chokidar on `session-harvest-*.md`
- INPUT: harvest content + Ollama qwen3:14b (12 known patterns)
- OUTPUT: appends to `pauls-investigator-profile.md` + updates `paul-cognitive-graph.html`
- PUSH: Telegram 🧠
- KEY: Biographical accumulator — extends Paul's profile with every harvest

### Cron Jobs (Time-Driven)

**the-muse** (`~/Cathedral/the-muse.js`) — 3am daily
- INPUT: GRAPH_REPORT.md + vault-embedder semantic search
- OUTPUT: `~/cathedral-vault/00_Staging/muse-findings/{date}-muse-finding.md`
- PUSH: Telegram 🔮 (or silence if nothing meets bar)
- KEY: Only agent that stays silent when bar isn't met

**the-timekeeper** (`~/Cathedral/the-timekeeper.js`) — every 15 min + 07:15 daily
- INPUT: `cathedral-schedule.json` + PM2 state
- OUTPUT: `timekeeper-state.json` (exclusive owner)
- PUSH: Telegram ⚠️ critical alerts (max 1/hr) + daily rhythm report
- KEY: Pure schedule parsing, no LLM calls

**the-groundskeeper** (`~/Cathedral/the-groundskeeper.js`) — 06:30 daily
- INPUT: vault domain folders (mtime scan) + latest muse finding
- OUTPUT: `groundskeeper-note-{date}.md` in staging
- PUSH: Telegram 🌱
- KEY: Stateless soil sampler — runs fresh each time

**vault-state-generator** (`~/nanoclaw/vault-state-generator.js`) — 06:00 daily
- INPUT: vault staging domains + paul-profile.json
- OUTPUT: `vault-state-latest.txt` + updates deepseek-research-seed.txt
- KEY: Compresses vault inventory into dense context block

**orchestrator-seed** (`~/nanoclaw/orchestrator-seed-generator.js`) — 06:00 daily
- INPUT: last 3 harvests + operational-map.md + CLAUDE.md + paul-profile.json + timekeeper alerts
- OUTPUT: `orchestrator-seed-latest.md` (<2000 tokens)
- KEY: Briefing compiler for Head Orchestrator chat

### Morning Sequence

```
06:00 HKT  vault-state-refresh + orchestrator-seed
06:30 HKT  the-groundskeeper
07:15 HKT  the-timekeeper (daily rhythm report)
07:30 HKT  morning-briefing (voice + text)
```

---

## Shared State Files

### Primary State

| File | Owner (writes) | Readers | Purpose |
|------|----------------|---------|---------|
| `CLAUDE.md` | Paul only | All agents | Constitution — source of truth |
| `cath-state.json` | local-orchestrator.js | telegram-bot, vault-state-gen, local-orc | Session state, senses, ledger |
| `paul-profile.json` | universal-memory.js + cognitive-scanner | local-orc, vault-state-gen, gold-extractor, memory-system | Paul's evolving profile |
| `cathedral-schedule.json` | Paul (manual) | the-timekeeper, cathedral-manager | PM2 schedule definitions |
| `timekeeper-state.json` | the-timekeeper (exclusive) | orchestrator-seed | Pulse tracking, alerts, deferrals |
| `operational-map.md` | the-cartographer | orchestrator-seed | Zone tracking |
| `metrics.db` | vault-embedder, belief-tracker, gold-extractor | telegram-bot, vortex-analyst | SQLite embeddings + metrics |
| `registry.json` | Manual / future orchestrator | /constellation endpoint | Project definitions |

### Append-Only Logs

| File | Writers | Purpose |
|------|---------|---------|
| `conversations.jsonl` | state_writer.py, telegram-bot | Exchange audit trail |
| `events.jsonl` | event bus (bus.py) | System events |

### Coordination Rules

1. **Exclusive ownership** — each agent owns its state file's writes. No conflicts.
2. **Timestamp-based staleness** — agents check freshness before using shared data.
3. **Append-only immutability** — JSONL logs never delete, never truncate.
4. **SQLite transactions** — metrics.db handles concurrent access.
5. **Graceful degradation** — missing/corrupted state doesn't cascade.

---

## Constellation Architecture

### Registry

`~/Cathedral/projects/registry.json` — 22 projects with manual x,y positions, connections, PM2 process mappings, vault card references.

### /constellation Endpoint

Reads registry, enriches each project with:
- PM2 process health (online/errored/stopped/crash-looping)
- Vault card frontmatter (status, phase, priority)
- Activity score (0.05–1.0, exponential decay over 7 days)
- Live status string
- Briefing (lede, body, stats)

### Activity Scoring

- PM2 process health: up to 0.4
- Vault domain recent modifications: up to 0.4
- Project card status: up to 0.2
- Floor: 0.05 (never invisible)

### Visual Treatment

- active >= 0.7: full accent glow, pulsing core
- active 0.3–0.7: dimmer accent, no pulse
- active < 0.3: very dim, no glow
- uncharted: dotted ring, "UNCHARTED" label
- concept: dashed ring
- center (Cathedral): largest glow, breathing animation

---

## Future: Per-Project Memory

### Design (not yet built)

```
~/Cathedral/projects/memory/
  cathedral.jsonl
  basic-reflex.jsonl
  universe.jsonl
  ...
```

One shared function all agents call after their existing work:

```javascript
function appendProjectLog(projectId, event, data = {}) {
  const logPath = path.join(HOME, 'Cathedral', 'projects', 'memory', `${projectId}.jsonl`);
  const entry = JSON.stringify({ ts: Date.now(), event, ...data }) + '\n';
  fs.appendFileSync(logPath, entry);
}
```

This makes agent activity visible per project. The Constellation reads the tail of each log for activity scoring and briefing generation. No new processes — just a logging function that surfaces what agents already do.

### Build Sequence

- Session 2: appendProjectLog + wire into existing agents + project-aware config
- Session 3: Activity decay from memory.jsonl + briefing generation + Villa integration

---

## Services Map

| Port | Service | PM2 Name | Purpose |
|------|---------|----------|---------|
| 8080 | cath-bridge | cath-bridge | Vault REST API + Villa + Constellation endpoints |
| 8888 | cathedral-panel | cathedral-panel | Villa control panel |
| 8889 | morning-view | morning-view | Constellation view |
| 8000 | cath-local | cath-local | Local inference (uvicorn) |
| — | cathedral-bot | cathedral-bot | Telegram interface |
| — | vault-watcher | vault-watcher | File watcher, auto-embeds |
| — | sentinel | sentinel | Write monitoring, safety limits |
