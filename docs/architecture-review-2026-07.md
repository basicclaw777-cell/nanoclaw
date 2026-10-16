# Cathedral System Architecture Review — July 2026

> **Reviewer:** Forge (Opus 4.6)
> **Date:** 2026-07-05
> **System:** ~/nanoclaw/ (core), ~/Cathedral/ (services), ~/cathedral-vault/ (knowledge), ~/basic-reflex/ (BR product)
> **Scope:** Technical architecture only. No evaluation of agent prompts, research topics, or domain content.

## Coverage & Sampling Methodology

This review directly read or surveyed:
- All documentation files (CLAUDE.md, SYSTEM_MAP.md, KNOWN_ISSUES.md, master-architecture.md, nervous-system.md)
- All 29 agent JSON configs (19 sages + 10 skins)
- All core orchestration modules (telegram-bot.js, cath-bridge.cjs, cathedral-manifest.js, cathedral-manager.js, ecosystem.config.cjs, cathedral-heartbeat.cjs)
- Full vault/knowledge cluster (20 modules: vault-brain, vault-dig, vault-embedder, vault-graph-data, vault-health-injector, vault-metabolism, vault-promoter, vault-search-bridge, vault-state-generator, vector-embed, vector-pipeline, vector-prep, vector-search, vectorize-vault, search, knowledge-graph, convergence-atlas, oracle, gold-extractor)
- Full research/orchestration cluster (30+ modules: cosmology-*, looking-glass*, qanon-*, goldmine-*, panam-*, obliteratus-engine, harvesters x6, cathy-*, choir-dispatch, swarm-loop, neural-bus, agent-protocol, council-engine, bandit-brain, linda-vault, orchestrator-seed-generator, the-physician, lymphatic, cathedral-episodes, cathedral-memoir, triangulation-relay)
- Full Gym Eyes CV system (40+ Python files at ~/basic-reflex/gym-eyes/)
- Module dependency graph (all 246 top-level modules analyzed for imports/requires/spawns)
- PM2 process state (119 registered, 25 online)
- SQLite database inventory (17+ files)
- Hardcoded credential scan (all .js/.cjs/.mjs files)

**Not surveyed in detail:** trader/ (16 modules), content-studio/ (8), comms-engine/ (12), ops-agent/ (9), growth-agent/ (8), reed/ (8), reed-lab/ (9), polymarket/ (7), geomag/ (5), architect-pulse/ (3), merch-agent/ (3), course-engine/ (5). These were counted but not individually read. Findings about them are based on dependency graph and grep patterns, not source review.

---

## 1. System Map

### Architecture Overview

The Cathedral is a 246-module Node.js system (with a 40-file Python CV subsystem) grown organically over ~18 months. It has no central event bus, no shared service layer, and no dependency injection. Modules coordinate via:
- **Filesystem conventions** — JSON state files, timestamped outputs, shared directories
- **Shared SQLite databases** — primarily `vortex_data/metrics.db` as the hub
- **Direct HTTP calls** — modules call each other's localhost ports
- **Telegram as the UI bus** — 93 files implement their own `sendTelegram()` helper

### Module Inventory

| Layer | Count | Key Files |
|-------|-------|-----------|
| **Mega-hubs** | 2 | `telegram-bot.js` (9,208 lines, 69 imports, ~150 commands), `cath-bridge.cjs` (6,760 lines, 489 routes, 12 imports) |
| **Top-level modules** | 246 | .js (ESM), .cjs (CJS bridge/legacy), .mjs (ESM explicit) |
| **Subdirectory modules** | ~54 | trader/(16), comms-engine/(12), content-studio/(8), growth-agent/(8), reed/(8), reed-lab/(9), ops-agent/(9), polymarket/(7), geomag/(5), course-engine/(5), architect-pulse/(3), merch-agent/(3) |
| **Agent configs** | 29 | sages/(19 JSON), skins/(10 JSON) |
| **Gym Eyes (Python)** | 40+ | ~/basic-reflex/gym-eyes/ — MediaPipe + OpenCV boxing CV |
| **HTML dashboards** | 51+ | Served by cath-bridge on :8080 |

### Process Management

| Metric | Count |
|--------|-------|
| PM2 registered | 119 |
| Currently online | 25 |
| Currently stopped | 94 |
| Currently errored | 0 |
| Manifest entries | ~78 (cathedral-manifest.js) |
| ecosystem.config.cjs entries | 14 |

**Online processes (25):** archaeologist-weekly, buzz-monitor, cath-bridge, cath-local, cathedral-bot, cognitive-scanner, content-reviews, dispatch-bot, emergence-ingest, intake-watcher, lucy-heartbeat, lymphatic, maya-social, morning-view, orchestrator-seed, sentinel, telegram-tunnel, terminal-harvester, the-archivist, the-cartographer, ttyd-claude, vault-brain, vault-promoter, vault-state-refresh, vault-watcher.

**Manifest drift:** PM2 has 119 registered processes vs ~78 manifest entries. The 41-process gap represents processes registered in PM2 but not tracked in the manifest — orphaned registrations, experiments, or processes added before the manifest system existed.

### Database Inventory

| Database | Location | Size | Status |
|----------|----------|------|--------|
| metrics.db | vortex_data/ | Active | **Shared hub** — 9 modules read/write (vault_embeddings, gold_findings, convergence_atlas tables) |
| knowledge-graph.db | vortex_data/ | Active | Written by knowledge-graph.js, read by vault-dig.js |
| bandit-brain.db | vortex_data/ | 401KB | Active — Thompson sampling weights |
| active-learning.db | vortex_data/ | Active | Active learning state |
| ensemble.db | vortex_data/ | Active | Ensemble state |
| fusion-gate.db | vortex_data/ | Active | Fusion gate state |
| archaeologist.db | vortex_data/ | Active | Patent/PhD mining (goldmine-*) |
| claim-ledger.db | vortex_data/ | Active | Claim tracking |
| causal-net.db | vortex_data/ | Active | Causal network |
| q-knowledge-graph.db | vortex_data/ | Active | Q forensics graph |
| punchpass.db | vortex_data/ | Active | Gym attendance |
| trades.db | trader/ | Active | Trading state |
| trading.db | trader/ | Active | Trading data |
| messages.db | store/ | Active | Message store |
| meta-watcher.db | experiment-engine/ | Active | Meta-watcher state |
| bandit-brain.sqlite | root | 0 bytes | **DEAD** — empty file, superseded by vortex_data/bandit-brain.db |

### Vector Storage (3 competing implementations)

| Store | Backend | Location | Status |
|-------|---------|----------|--------|
| SQLite `vault_embeddings` | better-sqlite3 in metrics.db | vortex_data/metrics.db | **LIVE** — vault-embedder.js writes, 9 modules read |
| LanceDB | @lancedb/lancedb | cathedral-vectors/ (13MB) | **ABANDONED** — written by vector-pipeline.cjs (March 2026), no live consumers |
| Qdrant | @qdrant/js-client-rest | localhost:6333 | **ABANDONED** — written by vector-embed.cjs (March 2026), no live consumers |
| LanceDB (stray) | — | vectors/ (24KB) | **ORPHAN** — no known writer |
| File-based | nugget manifest | vector_data/ (2.3MB) | **ABANDONED** — prep stage for Qdrant pipeline |

### Network Ports

| Port | Service | Module |
|------|---------|--------|
| 8080 | cath-bridge (Express REST + dashboards) | cath-bridge.cjs |
| 8888 | Control panel | ~/Cathedral/ |
| 8079 | Neural bus WebSocket | neural-bus.cjs |
| 8078 | Neural bus HTTP receiver | neural-bus.cjs |
| 8000 | cath-local (FastAPI) | ~/Cathedral/ |
| 3001 | Open Web UI (Docker) | — |
| 11434 | Ollama | System service |

### LLM Backends

| Backend | Protocol | Used By (file count) |
|---------|----------|---------------------|
| Ollama (localhost:11434) | HTTP fetch/https.request | 62 files |
| DeepSeek (api.deepseek.com) | HTTP POST, Bearer token | 77 files |
| OpenRouter (openrouter.ai) | HTTP POST, Bearer token | ~10 files (hardcoded key) |
| Anthropic (api.anthropic.com) | HTTP POST, x-api-key | ~3 files |

---

## 2. Agent Audit

### Sage Configs (19 files in sages/)

| Agent | File | Loaded By | Status |
|-------|------|-----------|--------|
| archivist | archivist.json | telegram-bot.js, council-engine.js | Active |
| cartographer | cartographer.json | telegram-bot.js | Active |
| course-voices | course-voices.json | telegram-bot.js | Active (8 teaching voices, not a single agent) |
| guide-chain | guide-chain.json | telegram-bot.js /guide | Active |
| guide-foundation | guide-foundation.json | telegram-bot.js /guide | Active |
| guide-impact | guide-impact.json | telegram-bot.js /guide | Active |
| guide-pressure | guide-pressure.json | telegram-bot.js /guide | Active |
| guide-range | guide-range.json | telegram-bot.js /guide | Active |
| guide-resonance | guide-resonance.json | telegram-bot.js /guide | Active |
| guide-shield | guide-shield.json | telegram-bot.js /guide | Active |
| investment-coach | investment-coach.json | telegram-bot.js | Active |
| leonardo | leonardo.json | telegram-bot.js, council-engine.js | Active |
| librarian | librarian.json | telegram-bot.js, council-engine.js | Active |
| ling | ling.json | telegram-bot.js, ling-engine.js | Active |
| ling-memory | ling-memory.json | — | **DATA FILE, not an agent config** |
| marcus | marcus.json | telegram-bot.js, council-engine.js | Active |
| maya | maya.json | — | **ORPHAN** — defined but not loaded by any code |
| physicist | physicist.json | telegram-bot.js, council-engine.js | Active |
| reed | reed.json | telegram-bot.js | Active |

### Skin Configs (10 files in skins/)

| Agent | File | Status |
|-------|------|--------|
| mckinsey-consultant | mckinsey-consultant-skin.json | **BROKEN** — JSON parse error at line 2, column 1 |
| cuban-coach | cuban-coach-skin.json | Active |
| revenue-strategist | revenue-strategist-skin.json | Active |
| experimentalist | experimentalist-skin.json | Active |
| head-orchestrator | head-orchestrator-skin.json | Active |
| map-room-explorer | map-room-explorer-skin.json | Active |
| map-room-oracle | map-room-oracle-skin.json | Active |
| map-room-verifier | map-room-verifier-skin.json | Active |
| project-orchestrator | project-orchestrator-skin.json | Active |

**Config loading chain:** Only 4 modules load agent configs for LLM invocation: `telegram-bot.js`, `council-engine.js`, `ling-engine.js`, `seed-generator.js`.

### Agent Technical Issues

1. **maya.json** — fully defined sage with persona, but no code path loads it. Orphaned.
2. **ling-memory.json** — not an agent config; it is a data/state file stored alongside agents by naming convention accident.
3. **mckinsey-consultant-skin.json** — invalid JSON, will crash any loader that tries to parse it.

---

## 3. Overlap & Duplication Analysis

### Critical: sendTelegram() — 93 separate implementations

93 files each implement their own `sendTelegram()` helper using `fetch` or `https.request` to `api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`. This is the system's single largest duplication. Each implementation:
- Constructs the same HTTP POST
- Handles chunking (or doesn't) independently
- Reads TELEGRAM_TOKEN from env (or hardcodes it)
- Has its own error handling (or none)

**Recommendation:** Extract to a shared `lib/telegram.js` utility. Every module imports it. Single place to add chunking, rate limiting, retry logic.

### Critical: Ollama call helpers — 62 separate implementations

62 files each implement their own Ollama HTTP call. Variants include:
- `fetch()` to `/api/chat` or `/api/generate`
- `https.request()` hand-rolled (vault-search-bridge.cjs, vector-pipeline.cjs, vector-search.cjs)
- Different model defaults (hermes3, gemma3:4b, qwen3:14b, nomic-embed-text)
- Different timeout handling
- Different error recovery

**Recommendation:** Extract to `lib/ollama.js` with `chat()`, `generate()`, `embed()` methods. Centralizes model selection, timeout, fallback logic.

### Critical: DeepSeek call helpers — 77 separate implementations

77 files each implement their own DeepSeek API call. Same pattern: construct POST to `api.deepseek.com/chat/completions` with Bearer token.

**Recommendation:** Extract to `lib/deepseek.js`. Same rationale as Ollama.

### Critical: Embedding — 6+ implementations

Six separate code paths hit `nomic-embed-text` at Ollama:
- `vault-embedder.js:115` — `fetch /api/embeddings` (canonical, writes to SQLite)
- `knowledge-graph.js:112` — `fetch /api/embeddings`
- `vault-search-bridge.cjs:39-63` — `https.request` (CJS port of vault-embedder)
- `vector-pipeline.cjs:27` — `https.request` (LanceDB target, abandoned)
- `vector-search.cjs:17` — `https.request` (LanceDB search, abandoned)
- `vectorize-vault.cjs:30` — `fetch` (LanceDB, abandoned)

Live duplicates: vault-embedder and vault-search-bridge do the same embed+search over the same SQLite table, differing only in module system (ESM vs CJS).

### Critical: Semantic search — 3 implementations over 3 backends

1. `vault-embedder.js` `semanticSearch()` — SQLite vault_embeddings (LIVE)
2. `vault-search-bridge.cjs` — same SQLite table, CJS port (LIVE, used by CJS consumers)
3. `vector-search.cjs` / `vector-pipeline.cjs` — LanceDB (ABANDONED)
4. `vector-embed.cjs` — Qdrant (ABANDONED)

### High: Memory system duplication

- `memory-system.js` — 3-level memory (conversation/session/learning), writes to `paul-profile.json`
- `universal-memory.js` — duplicates the same architecture for "any interface," also writes to `paul-profile.json`

Both target the same file. Both use the same `callClaude()` pattern via OpenRouter. Risk of write conflicts or stale reads.

### High: Harvester duplication — 6 implementations

| Harvester | Input Source | LLM | Status |
|-----------|-------------|-----|--------|
| deep-harvester.js | ~/raw-chats/ | OpenRouter (hardcoded key) | **ABANDONED** (mtime 2026-03-10) |
| local-harvester.js | ~/raw-chats/ | Ollama llama3.1 | **ABANDONED** (mtime 2026-03-10) |
| obsidian-harvester.js | ~/raw-chats/ | OpenRouter (hardcoded key) | **ABANDONED** (mtime 2026-03-10) |
| deepseek-harvester.js | ~/raw-chats/deepseek/ | Ollama qwen3:14b | Active |
| pretta-harvester.js | Single transcript | Ollama + DeepSeek | One-shot, spent |
| terminal-harvester.js | ~/.claude/projects/ | Ollama | **ACTIVE** (PM2 online) |

`deep-harvester.js`, `local-harvester.js`, and `obsidian-harvester.js` share near-identical prompts ("meticulous knowledge archaeologist... BE AGGRESSIVE") and harvest the same `~/raw-chats/` directory. They differ only in LLM backend. All three are superseded by `deepseek-harvester.js`.

### Medium: Q forensics boilerplate

10 phase files (qanon-phase2.js through qanon-phase11.js) are one-shot CLI scripts with copy-pasted `callDeepSeek`/`callOllama`/`throttle`/`MIN_INTERVAL` boilerplate across phases 2-7. Phase 11 hardcodes earlier phases' findings inline rather than reading them from disk. These are spent scripts (the analysis is complete), not live modules.

### Medium: move-detector ESM/CJS dual

- `move-detector.js` (ESM) — cognitive pattern recognition
- `move-detector.cjs` (CJS) — bridge for agent-engine.js consumption

Same logic, two files. The CJS version exists solely because `agent-engine.js` is CJS. If agent-engine migrates to ESM, the CJS copy is dead weight.

### Medium: proposal-protocol ESM/CJS dual

- `proposal-protocol.js` (ESM)
- `proposal-protocol.cjs` (CJS bridge)

Both target `vortex_data/metrics.db`. Same justification as move-detector.

---

## 4. Dead Code Audit

### Confirmed Dead — Safe to Remove

| File/Directory | Evidence | Last Modified |
|----------------|----------|---------------|
| `Telegram-bot-memory.js` | Older version of telegram-bot.js. Not imported by anything. Contains hardcoded OpenRouter key. | Legacy |
| `bandit-brain.sqlite` (root) | 0 bytes. Superseded by `vortex_data/bandit-brain.db` (401KB, active). | Legacy |
| `deep-harvester.js` | mtime 2026-03-10, superseded by deepseek-harvester.js, harvests same dir, hardcoded API key. No importers. | 2026-03-10 |
| `local-harvester.js` | mtime 2026-03-10, near-identical to deep-harvester, no importers. | 2026-03-10 |
| `obsidian-harvester.js` | mtime 2026-03-10, near-identical to deep-harvester, hardcoded API key, no importers. | 2026-03-10 |
| `vector-embed.cjs` | Targets Qdrant (abandoned backend), CLI-only, mtime 2026-03-15, no importers. | 2026-03-15 |
| `vector-pipeline.cjs` | Targets LanceDB (abandoned), CLI-only, mtime 2026-03-15, no importers. | 2026-03-15 |
| `vector-prep.cjs` | Splits vault for Qdrant ingestion (abandoned pipeline), CLI-only, mtime 2026-03-15. | 2026-03-15 |
| `vectorize-vault.cjs` | Another LanceDB vectorizer (abandoned), CLI-only, mtime 2026-03-20. | 2026-03-20 |
| `search.cjs` | Minimal LanceDB query CLI, mtime 2026-03-15, no importers. | 2026-03-15 |
| `vector-search.cjs` | LanceDB search, mtime 2026-03-16. Importable but nothing imports it in the live system. | 2026-03-16 |
| `vector_data/` directory | 521 per-nugget files + manifest for abandoned Qdrant/LanceDB pipelines. | 2026-03-15 |
| `vectors/` directory | Orphan LanceDB nuggets.lance, no known writer. | Legacy |
| `cathedral-vectors/` directory | LanceDB store for abandoned vector pipeline. 13MB. telegram-bot.js imports LanceDB — verify before removing. | Legacy |
| `vortex-ready-harvester-backup.cjs` | Explicit backup file. Older (March 13) than main (March 22). | 2026-03-13 |
| `~/nanoclaw/~/nanoclaw/` directory | Stray nested directory — filesystem accident. | — |
| `pretta-harvester.js` | One-shot transcript processor for a specific founding document. Spent. | 2026-05-14 |

### Likely Dead — Verify Before Removing

| File | Evidence | Risk |
|------|----------|------|
| `cathedral-episodes.js` | Recent mtime (07-02) but zero inbound references found. May be manual-only CLI tool. | Low — standalone indexer |
| `cosmology-graph-builder.js` | No importers, CLI-only HTML generator. Still contains purged burgundy color #8B2020 at line 23-25. | Low — one-shot generator |
| `qanon-phase2.js` through `qanon-phase11.js` | One-shot analysis scripts. Corpus analysis complete. No cron, no guards, no importers. | Low — archival value only |
| `maya.json` (sages/) | Defined agent config but loaded by zero code paths. | None — config file |
| `ling-memory.json` (sages/) | Data file stored in agent config directory by naming accident. | Low — verify if anything reads it |

### Confirmed Alive But Stale

| File | Evidence |
|------|----------|
| `convergence-atlas.js` (mtime 2026-03-24) | Old, but still imported by telegram-bot.js:15 — wired and functional |
| `vault-search-bridge.cjs` | CJS duplicate of vault-embedder's search, but actively imported by CJS consumers |

---

## 5. Orchestration Gaps

### Gap 1: No shared utility layer

The system's most expensive structural gap. Every module reimplements:
- Telegram notifications (93 files)
- Ollama calls (62 files)
- DeepSeek calls (77 files)
- Embedding generation (6+ implementations)
- Environment variable loading (many modules manually parse .env)

A `lib/` directory with `telegram.js`, `ollama.js`, `deepseek.js`, `embed.js`, `env.js` would eliminate ~500 duplicated functions across the codebase.

### Gap 2: No central event bus (by design, but with consequences)

Per `docs/nervous-system.md`: "There is no central bus. Agents coordinate via filesystem conventions, timestamp-based staleness detection, and exclusive ownership of state files."

The `neural-bus.cjs` (WS on 8079, HTTP on 8078) exists but is **telemetry only** — cath-bridge posts every request as an event, and the neural-map dashboard subscribes. It is not an agent coordination bus. Actual agent coordination uses:
- **linda-vault.js** — Linda tuple-space (Gelernter 1985) for decoupled pub/sub. Used by swarm-loop, bandit-brain, and a handful of agents.
- **Filesystem polling** — most modules read/write JSON state files with timestamps.

The linda-vault is the closest thing to a coordination layer, but adoption is sparse (~5 modules). Most modules are fire-and-forget with no coordination.

### Gap 3: Three coexisting dispatch philosophies

1. **cathy-router.js** — centralized regex routing. Scores incoming messages and dispatches to claude/gemini/ollama/cathy. Imperative, synchronous.
2. **swarm-loop.js + bandit-brain.js + linda-vault.js** — decentralized Thompson sampling. Agents post discovery/outcome tuples, bandit updates domain weights. Event-driven, asynchronous.
3. **orchestrator-seed-generator.js** — context assembly. Builds dense text briefings for the Head Orchestrator. No routing, just priming.

These three are not competing for the same job, but they are not connected either. The routing layer does not feed learning signals to the bandit. The bandit does not influence routing. The seed generator operates independently of both.

### Gap 4: PM2 manifest vs PM2 reality drift

119 PM2-registered processes vs ~78 manifest entries = 41 orphaned registrations. The manifest-watcher reconciles every ~2h (per CLAUDE.md G2), but only for processes IN the manifest. The 41 extras drift unchecked. Stopping a manifest-tracked process gets reconciled back online within 2h — a feature that has caused cost overruns (Higgsfield credit drain documented in CLAUDE.md G2).

### Gap 5: No auth on cath-bridge

Per `docs/KNOWN_ISSUES.md`: cath-bridge runs on `0.0.0.0:8080` with no authentication on ~30 state-changing POST endpoints. While Surfshark VPN provides network-level isolation, any process on the local machine (or anything that reaches port 8080) can invoke any endpoint. The vault bridge auth key exists in .env but is not consistently enforced across all routes.

### Gap 6: telegram-bot.js is a God Object

At 9,208 lines with 69 imports, ~150 slash commands, 288 try/catch blocks, and 70 spawn/exec calls, `telegram-bot.js` is a single point of failure for the entire system. Any syntax error, uncaught exception, or import failure takes down all 150 commands simultaneously.

The bot does not have a command-registration system — commands are wired inline via `bot.onText()` calls scattered throughout the file. Adding a new command requires editing the 9K-line file directly.

### Gap 7: No error reporting aggregation

Error handling varies dramatically across modules:
- **Defensive** (18 try/catch blocks): the-physician.mjs, triangulation-relay.js, cathedral-memoir.js
- **Fragile** (0 try/catch): qanon-forensics.js (unguarded JSON.parse), bandit-brain.js (trusts sqlite)
- **Fail-fast CLI** (process.exit on error): cosmology-researcher, deepseek-harvester, council-engine, choir-dispatch
- **Swallow-everything**: cathy-swarm-watcher.js (`.catch(()=>{})`)

No central error logger. No crash notification pipeline. When a PM2 process crashes, the only signal is PM2's restart counter incrementing.

### Gap 8: Gym Eyes has no JS bridge to the Cathedral

The Gym Eyes CV system (40+ Python files, MediaPipe + OpenCV, working and calibrated) lives entirely in `~/basic-reflex/gym-eyes/`. The JS files referenced in the user's request (`gym-eyes.js`, `gym-eyes-v2.js`, `coaching-engine.js`, `combination-validator.js`, `move_detector.js/.cjs`) **do not exist** in the gym-eyes directory. There is a `coaching-engine.js` and `move-detector.js` in `~/nanoclaw/`, but these are Cathedral modules, not Gym Eyes components. The CV pipeline and the Cathedral orchestration layer are completely unwired.

---

## 6. Infrastructure Health

### Security: Hardcoded API Keys — CRITICAL

**10 files contain a hardcoded OpenRouter API key** (`sk-or-v1-1e9b...`):
1. `cathedral-manager.js:11` (line 12 per earlier read)
2. `seed-generator.js:11`
3. `universal-memory.js:12`
4. `deep-harvester.js:5`
5. `obsidian-harvester.js:9`
6. `Telegram-bot-memory.js:22`
7. `terminal-chat.mjs:4`
8. `claude-extractor.cjs:13`
9. `vortex-analyst.js:16`
10. `vortex-report.js:13`

**ecosystem.config.cjs contains a hardcoded Telegram bot token** on lines 34, 57, 179, 199, 220 — literal `TELEGRAM_TOKEN: '8284790243:AAHoc...'` in the PM2 config file.

**cathy-router.js:178** contains a hardcoded fallback vault auth key `'cathedral-mcp-2026'`.

All other modules correctly use `process.env` for secrets. The hardcoded keys are concentrated in older files (March-April 2026 vintage). The 3 dead harvesters and Telegram-bot-memory.js account for 4 of the 10 — removing dead code (Section 4) would eliminate those. The remaining 6 need manual remediation.

### Brand Color Contamination

`cosmology-graph-builder.js` lines 23-25 contain burgundy `#8B2020` — the AI-hallucinated brand color that CLAUDE.md says to "purge on sight." This file has not been touched since the brand cleanup.

### Module System Confusion

Per SI-13: `~/nanoclaw/` uses `.js` = ESM, `.cjs` = CJS. This convention is followed, but creates friction:
- ESM/CJS bridge files exist for cross-system consumption (move-detector, proposal-protocol, vault-brain-runner, vault-search-bridge)
- The CJS vector family (vector-*.cjs, search.cjs) are legacy pre-ESM modules
- cathedral-heartbeat.cjs is CJS despite being recent — likely because PM2 cron runners prefer CJS

### RAM Pressure

16GB hardware with hermes3 as default model. CLAUDE.md documents gemma4:26b crashes the system (SI-24). qwen3:14b has a known bug (thinking mode eats output with stream:false). The Ollama model selection is constrained by hardware. Multiple always-on PM2 processes (25 online) compete for RAM with Ollama model loading.

### ecosystem.config.cjs Copy-Paste Error

`ops-mpf` process entry points to `run-hr.js` — appears to be copy-pasted from `ops-hr` without updating the script path.

### KNOWN_ISSUES.md Open Items

- EMFILE "too many open files" — chokidar file watchers accumulate across PM2 processes
- Express 5 path-to-regexp breaking change affecting route patterns
- cath-bridge auth gap (documented, not fixed)

---

## 7. Prioritized Recommendations

### P0 — Security (do this week)

1. **Rotate the OpenRouter API key** — it is exposed in 10 source files. Move all 10 to `process.env.OPENROUTER_KEY` and rotate the key on the OpenRouter dashboard.
2. **Move Telegram token out of ecosystem.config.cjs** — reference .env instead of hardcoding the literal token 5 times.
3. **Remove hardcoded vault auth fallback** from `cathy-router.js:178`.
4. **Add basic auth to cath-bridge** — even a shared API key header check on state-changing endpoints. The 489 routes include POST endpoints that modify databases, trigger processes, and write to the vault.

### P1 — Structural (this month)

5. **Create `lib/` shared utility layer:**
   - `lib/telegram.js` — single sendTelegram() with chunking, rate limiting, retry
   - `lib/ollama.js` — chat(), generate(), embed() with model defaults and timeout
   - `lib/deepseek.js` — single call helper with fallback
   - `lib/env.js` — standardized .env loading
   
   Migrate the 93/62/77 duplicated helpers incrementally. Start with the 25 online PM2 processes.

6. **Remove confirmed dead code** (Section 4) — 15+ files, 3 directories, ~0 risk. Reduces attack surface (removes 4 hardcoded API key instances), reduces cognitive load, clarifies what is live.

7. **Fix mckinsey-consultant-skin.json** — invalid JSON parse error. Either fix the JSON or remove the file.

8. **Purge burgundy #8B2020** from `cosmology-graph-builder.js:23-25`.

### P2 — Architecture (this quarter)

9. **Split telegram-bot.js** — Extract command handlers into per-domain modules (e.g., `commands/vault.js`, `commands/research.js`, `commands/trading.js`). Keep the bot instance and routing in the main file. The 9,208-line God Object is the system's biggest maintenance risk.

10. **Reconcile PM2 vs manifest** — Audit the 41 PM2-registered processes not in the manifest. Either add them to the manifest or `pm2 delete` them. The current state makes it impossible to know what is intentionally running.

11. **Consolidate memory system** — `memory-system.js` and `universal-memory.js` both write to `paul-profile.json`. Merge into a single module or add write-locking.

12. **Wire Gym Eyes to the Cathedral** — The CV system is functional and calibrated but completely isolated. The `coaching-engine.js` in nanoclaw and the Python CV pipeline in gym-eyes have no connection. A bridge module (Node.js spawning Python, or a REST API on the Python side) would close the "80% built unwired" gap documented in MEMORY.md.

### P3 — Cleanup (ongoing)

13. **Archive the CJS vector family** — Move `vector-embed.cjs`, `vector-pipeline.cjs`, `vector-prep.cjs`, `vector-search.cjs`, `vectorize-vault.cjs`, `search.cjs` to an `archive/` directory. They represent March 2026 experiments that were superseded by the SQLite embedding system.

14. **Archive Q forensics phase files** — The 10 `qanon-phase*.js` scripts are spent one-shot analyses. Move to `archive/` to reduce top-level clutter (246 modules is a lot to navigate).

15. **Clean up vault-search-bridge.cjs** — It is a manual CJS re-implementation of `vault-embedder.js`'s search. If the CJS consumers can be migrated to dynamic import (`await import('./vault-embedder.js')`), this bridge file can be eliminated.

16. **Address ecosystem.config.cjs ops-mpf bug** — Either fix the script path or remove the entry if ops-mpf is not a real process.

---

## 8. Unified Orchestration Proposal

### Current State: Archipelago Architecture

The Cathedral is an archipelago — 246 islands connected by ad-hoc bridges (filesystem, shared databases, Telegram). This architecture emerged organically and has been productive (the system works, ships features, and compounds knowledge), but it has three scaling problems:

1. **Duplication cost** — Every new module reimplements the same 4-5 HTTP helpers. This is not just wasted lines; it is 93 places where a Telegram API change would need updating, 62 places where an Ollama model change needs propagating.

2. **Coordination opacity** — With no event bus, no logging aggregation, and no dependency graph enforcement, it is impossible to answer "what happens when X fires?" without reading the source of every module that might be affected.

3. **Single point of failure** — telegram-bot.js. One uncaught exception takes down 150 commands. One import failure (e.g., a CJS/ESM mismatch) takes down the entire user interface.

### Proposed: Hub-and-Spoke with Shared Foundation

**Layer 1: Shared Foundation (`lib/`)**

```
lib/
  telegram.js    — sendTelegram(), sendPhoto(), sendDocument()
  ollama.js      — chat(), generate(), embed() with model registry
  deepseek.js    — callDeepSeek() with rate limiting
  anthropic.js   — callAnthropic() with fallback
  env.js         — loadEnv() with validation
  db.js          — getDb(name) returns cached better-sqlite3 instance
  log.js         — structured logging with Telegram error forwarding
```

**Migration path:** Create the lib/ modules. In each module, export a function with the same signature as the most common inline implementation. Then migrate modules one at a time, starting with the 25 online PM2 processes. No big-bang rewrite required.

**Layer 2: Bot Decomposition**

```
telegram-bot.js (slim: ~500 lines)
  — bot instance creation
  — command router (reads commands/ directory)
  — middleware (auth, rate limiting, error boundary)

commands/
  vault.js       — /search, /vault-dig, /vault-health, etc.
  research.js    — /obliteratus, /gold, /oracle, etc.
  trading.js     — /trader, /portfolio, etc.
  gym.js         — /gym-eyes, /drill, /student, etc.
  admin.js       — /status, /pm2, /manifest, etc.
  guide.js       — /guide and all guide-* sages
```

**Migration path:** Extract one command group at a time. Each `commands/*.js` file exports a `register(bot)` function. The slim bot loops through the directory and calls `register()` on each. Existing functionality is preserved; the change is organizational only.

**Layer 3: Event Bus (linda-vault evolution)**

The linda-vault tuple-space is already the right primitive. The gap is adoption — only ~5 modules use it. Expanding adoption requires:
- Making it importable without ceremony (it already is)
- Defining a small set of standard event types (e.g., `build.complete`, `research.finding`, `error.critical`)
- Having the lib/ helpers auto-publish events (e.g., `log.error()` also publishes a tuple)

This is NOT a rewrite. It is making the existing linda-vault the default coordination layer by wiring it into the shared foundation.

**Layer 4: Observability**

- `lib/log.js` writes structured JSON logs
- PM2 process metrics are collected by a lightweight dashboard
- Error events auto-forward to Telegram (already happens ad-hoc; standardize it)
- A `/health` endpoint on cath-bridge returns all PM2 process states, last-event times, and error counts

### What This Does NOT Propose

- **No framework adoption** — no Express replacement, no message queue, no container orchestration. The system works on a Mac Mini with PM2 and that is fine.
- **No agent removal** — the 29 agents serve different purposes. This review identifies only technical orphans (maya.json, ling-memory.json) and broken configs (mckinsey-consultant-skin.json). Agent domain decisions are Paul's.
- **No database consolidation** — the SQLite-per-domain pattern works. The only recommendation is eliminating the 3 abandoned vector backends.
- **No rewrite of telegram-bot.js** — decomposition preserves all existing functionality. It is a refactor, not a rewrite.

### Estimated Effort

| Phase | Work | Effort |
|-------|------|--------|
| P0 Security | Rotate key, move tokens to .env, add cath-bridge auth | 1-2 sessions |
| P1 lib/ foundation | Create 6 shared modules, migrate 25 online processes | 3-5 sessions |
| P1 Dead code removal | Delete confirmed dead files, archive CJS vector family | 1 session |
| P2 Bot decomposition | Extract command groups, test routing | 3-4 sessions |
| P2 PM2 reconciliation | Audit 41 orphans, update manifest | 1 session |
| P3 Ongoing cleanup | Bridge consolidation, archive Q phases, memory merge | 2-3 sessions |

Total: ~12-16 sessions spread across 4-6 weeks, done incrementally alongside regular building. No downtime required. Each phase delivers standalone value.

---

## Appendix A: Files With Hardcoded API Keys

| File | Line | Key Type |
|------|------|----------|
| cathedral-manager.js | 12 | OpenRouter `sk-or-v1-*` |
| seed-generator.js | 12 | OpenRouter `sk-or-v1-*` |
| universal-memory.js | 12 | OpenRouter `sk-or-v1-*` |
| deep-harvester.js | 5 | OpenRouter `sk-or-v1-*` |
| obsidian-harvester.js | 9 | OpenRouter `sk-or-v1-*` |
| Telegram-bot-memory.js | 22 | OpenRouter `sk-or-v1-*` |
| terminal-chat.mjs | 4 | OpenRouter `sk-or-v1-*` |
| claude-extractor.cjs | 13 | OpenRouter `sk-or-v1-*` |
| vortex-analyst.js | 16 | OpenRouter `sk-or-v1-*` |
| vortex-report.js | 13 | OpenRouter `sk-or-v1-*` |
| ecosystem.config.cjs | 34,57,179,199,220 | Telegram bot token |
| cathy-router.js | 178 | Vault auth key fallback |

## Appendix B: Gym Eyes System Status

The Gym Eyes computer vision system at `~/basic-reflex/gym-eyes/` is a **40-file, ~15,800-line Python system** built on MediaPipe PoseLandmarker + OpenCV. It is **actively developed and functional**, not a prototype.

**Working components:**
- **detector.py** (1,731 lines) — Central detection engine. Punches (jab/cross/hook/uppercut), defense (slips/rolls), footwork (6 types), stance, guard height, combinations. Calibrated against ground-truth Cuba clips.
- **pose_classifier.py** (892 lines) — KNN on 8-frame temporal windows. Trained on 744 labeled samples. Model exists at `models/punch_classifier.pkl`.
- **elm_classifier.py** (337 lines) — Extreme Learning Machine, single-frame classification. Trained.
- **fscl_codebook.py** (250 lines) — 32-neuron frequency-sensitive competitive learning. Trained.
- **temporal_classifier.py** (250 lines) — Ensemble orchestrator voting across KNN/ELM/FSCL with weighted confidence.
- **session_analytics.py** (343 lines) — Per-fighter metrics, fatigue detection, activity heatmaps, coach attention alerts.
- **student_profiles.py** (857 lines) — Per-student cumulative tracking. 2 real profiles exist (Sarah with 2 sessions / 126 punches).
- **combo_matcher.py** (270 lines) — Matches against 34 Cuba combos from coach demonstration videos.
- **virtual_tutor.py** (415 lines) — DTW-based coach/student skeleton alignment with per-joint deviation grading.
- **cuba_trainer.py** (432 lines) — Training pipeline from Cuba coach videos. Has been executed.
- **drill_engine.py** (808 lines) — Personalized drill generation from BR Syllabus based on detected gaps.
- **calibrate.py** (170 lines) — Ground-truth calibration harness.

**Gaps:**
- No type-level accuracy metrics (calibration tests count, not classification)
- 2-fighter limit (no group class support)
- No automated test suite
- 744 training samples is small for 5-class classification
- No JS bridge to Cathedral orchestration layer

## Appendix C: Module Dependency Summary

**telegram-bot.js imports (69):** The mega-hub imports from nearly every functional cluster — vault, research, trading, content, coaching, agents, memory, analytics.

**cath-bridge.cjs imports (12):** Lighter than the bot. Serves HTML dashboards and proxies to other modules.

**Modules never imported by another module (~135):** A mix of CLI tools, PM2 cron entry points, one-shot scripts, and genuinely orphaned code. Many are legitimate standalone processes (PM2-managed) rather than dead code. Not all were individually verified.

**Circular dependencies:** None detected in the direct import graph. The system avoids circularity by having the two mega-hubs (bot, bridge) import leaf modules, which do not import back.
