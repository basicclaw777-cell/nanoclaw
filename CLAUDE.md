# The Cathedral Project — Obliteratus Build

## Project Overview
Private sovereign AI research system for Paul (boxing gym owner, Hong Kong). Local-first intelligence architecture that compounds over time. This is NOT a product — it is Paul's research instrument.

## Infrastructure
- **Hardware:** Mac Mini M-series, Hong Kong
- **Node.js:** v24.14.0
- **Docker:** v29.2.1
- **Local LLMs:** Ollama at localhost:11434 (llama3.1, qwen3:14b, gemma3:4b, gemma4:26b, dolphin3, hermes3)
- **Cloud AI:** Claude Sonnet via OpenRouter
- **Whisper:** whisper-cpp v1.8.4 at /opt/homebrew/bin/whisper-cli (Metal GPU), models at ~/Cathedral/models/
- **YOLO:** ultralytics v8.4.34, yolo11n-pose.pt, Metal GPU (MPS). Movement analysis at ~/Cathedral/boxing_movement.py
- **Chatterbox TTS:** v0.1.7, MPS (Apple Silicon GPU), voice clone from ~/Cathedral/cathy_voice_reference.wav, exaggeration=0.45
- **Cathy Voice:** ~/Cathedral/cathy_interview.py — turn-based voice interview loop (Chatterbox TTS + whisper-cpp STT + sox mic). LIVE since 2026-04-08
- **Knowledge vault:** Obsidian at ~/cathedral-vault/ (10,154+ nuggets, 12 domains)
- **Database:** SQLite at ~/nanoclaw/vortex_data/metrics.db
- **Primary interface:** Telegram bot at ~/nanoclaw/telegram-bot.js
- **Control panel:** localhost:8888 — single HTML file at ~/Cathedral/control-panel/index.html, cockpit aesthetic
- **Cath local server:** localhost:8000 — FastAPI at ~/Cathedral/cath_local_server.py (CATH_BACKEND=local, Gemma 4 26B)
- **Vault bridge:** localhost:8080 — ~/nanoclaw/cath-bridge.cjs, REST API for vault read/write/search
- **Desktop UI:** Open Web UI at localhost:3001 (Docker container: open-webui)
- **MCP server:** ~/nanoclaw/cathedral-mcp-server.js — registered in Claude Desktop
- **Git remotes (nanoclaw):** origin = basicclaw777-cell/nanoclaw.git, upstream = qwibitai/nanoclaw.git
- **Internet:** Surfshark VPN required (Singapore). Run `unset http_proxy && unset https_proxy` before starting bot.

## Directory Structure
```
~/nanoclaw/                    # Core system directory
├── telegram-bot.js            # Main Telegram bot (PRIMARY INTERFACE)
├── memory-system.js           # 3-level sage memory
├── universal-memory.js        # Universal memory (all interfaces)
├── cathedral-manager.js       # Operations manager
├── seed-generator.js          # Context seed generator
├── vortex-analyst.js          # Phase 2 self-improvement engine
├── vortex-ready-harvester.cjs # Chat → nuggets harvester
├── sages/                     # Sage JSON definitions (persistent memory)
│   ├── leonardo.json
│   └── marcus.json
├── skins/                     # Skin JSON definitions (no persistent memory)
│   ├── boxing/
│   ├── business/
│   └── general/
├── memory/
│   ├── patterns/paul-profile.json  # Paul's evolving universal profile
│   ├── summaries/
│   └── conversations/
├── prompts/                   # System prompts for Obliteratus engine
├── comms-engine/              # Client comms (Phase 3) — WhatsApp templates, outbox queue
├── growth-agent/              # Growth (Phase 4) — calendar, corporate, newsletter, SEO
├── merch-agent/               # Merch (Phase 5) — run lifecycle, supplier DB
├── course-engine/             # Digital course (Phase 6) — 10 modules, authority map, filming briefs
├── ensemble-gate.js           # Epistemic Engine: 3-model claim evaluator
├── ensemble-feeder.js         # Nightly auto-feeder (PM2 cron 03:00)
├── knowledge-graph.js         # Knowledge Graph: K-means clustering + bridge detection
├── causal-net.js              # Causal Net: LLM relationship mapping + blast radius
├── active-learning.js         # Active Learning: priority queue across all engines
├── ensemble-dashboard.html    # Ensemble Gate visual dashboard
├── knowledge-graph-dashboard.html  # Knowledge Graph visual dashboard
├── causal-net-dashboard.html  # Causal Net visual dashboard
├── active-learning-dashboard.html  # Active Learning visual dashboard
├── mind-map.html              # Interactive knowledge graph visualization
├── mega-surgery-viz.html      # Mega-cluster surgery visualization
└── vortex_data/
    └── metrics.db             # SQLite — all system metrics + embeddings

## Taste Map — Universal Preference Engine (built 2026-05-08)
- Data: ~/nanoclaw/taste-map.json (70 anchors, 16 rejections, 5 voice references, 5 domains)
- API: ~/nanoclaw/taste-map-api.js — getTasteProfile(), matchPreference(), checkRejection(), addAnchor()
- Elicitation: ~/nanoclaw/taste-elicitation.js — /taste commands on Telegram
- Reed integration: pre-generation gate checks checkRejection() before Higgsfield calls
- Content Machine bridge: content_approve/reject callbacks update taste map passively
- Voice pattern: "Miyagi substance, Brady energy, Carlton filter"
- Music: 2 modes — War Mode (class peaks, BPM 120-160) + Vibe Mode (cooldown, BPM 85-120)
- All agents should import taste-map-api.js before generating Paul-facing content
- Dimensions: ~/nanoclaw/taste-dimensions.js — 10 core + 9 drill dimensions, cross-domain coherence, health diagnostic
- Telegram: /taste health, /taste dimensions, /taste coherence, /taste drills

## Taste Curator Engine — Phase 2 Curator Inheritance (built 2026-05-31)
- Engine: ~/nanoclaw/taste-curator.js — scrapes YouTube, scores against taste dimensions via DeepSeek, queues candidates
- Dashboard: localhost:8080/curator (taste-curator-dashboard.html) — visual review with YouTube embeds, YES/NO/SKIP
- API: /api/taste-curator, /api/taste-curator/review, /api/taste-curator/scan on cath-bridge
- Candidates: ~/nanoclaw/taste-candidates.json (auto-generated)
- Sources: 6 YouTube channels (Lee Wylie, Jack Slack, Modern Martial Artist, Liam Harrison, Sylvie von Duuglas-Ittu, Lawrence Kenshin) + global search (Cus D'Amato, Cuban boxing)
- Budget cap: 25 DeepSeek calls per scan
- Telegram: /curator, /curator scan, /curator review, /curator sources (secondary — dashboard is primary)
- Accepted candidates auto-add to taste-map.json as anchors

## Architect Layer — Intent to Structured Plan (built 2026-05-08)
- Engine: ~/nanoclaw/architect.js — intent → structured JSON plan via DeepSeek
- Templates: ~/nanoclaw/architect-templates/ (agent-build, content-series, hardware-integration)
- Output: ~/nanoclaw/architect-output/ (JSON plans + interactive HTML)
- Infrastructure scanner: queries PM2 services, vault sections, existing projects, known agents, hardware constraints
- Generates: dependency graph (Mermaid) + task sequence + resource map + risk flags + HTML visualization
- Telegram: /architect <intent>, /architect status
- Web: localhost:8080/architect (serves most recent plan HTML)
- Vault auto-deposit: saves plan as markdown to 08_Project_Orchestrator/projects/
- Key differentiator: grounds every plan in Cathedral infrastructure — references what exists, doesn't propose rebuilding
- ⚠️ After pm2 restart cathedral-bot: verify Telegram webhook is set (can clear on restart)

~/Cathedral/                   # Cathedral services directory
├── control-panel/
│   ├── index.html             # Control panel UI (single file, cockpit aesthetic)
│   ├── style-session.html     # Creative Court: style direction sessions
│   ├── cathy-avatar.html      # Animated Cathy avatar (toroidal vortex)
│   ├── DESIGN_BRIEF.md        # UI design standard — READ BEFORE ANY UI WORK
│   └── ecosystem.config.cjs   # PM2 config for control panel
├── illustrator.js             # Illustration pipeline: GPT Image 1 + FLUX.2 via fal.ai
├── photo-editor.js            # Photo enhancement: BR studio aesthetic, image-to-image
├── photo-inbox/               # Drop photos here for auto-enhancement (photo-editor --watch)
├── photo-outbox/              # Enhanced photos land here
├── cath_local_server.py       # FastAPI local inference server (port 8000)
├── proactive-orchestrator.js  # Weekly project status → Telegram (PM2 cron)
├── cathy_interview.py         # Voice interview loop (Chatterbox TTS + whisper STT + sox)
├── cathy_voice_reference.wav  # Voice clone reference (locked 2026-04-08)
├── the-archivist.js           # Watches muse-findings, enriches with cross-links (PM2, chokidar polling)
├── the-muse.js                # 3am nightly vault walker, finds cross-domain bridges (cron)
├── vibevoice_transcribe.py    # VibeVoice ASR — MPS float32 path, speaker diarization
└── interview_questions/       # Question sets for voice interviews
    └── scout_default.txt      # Default 5-question scout interview

~/cathedral-vault/             # Obsidian knowledge vault
├── 00_Staging/                # Incoming: harvests, muse findings, scout reports
│   ├── cathedral/             # Session harvests, design docs
│   └── muse-findings/         # Muse 3am findings (enriched by Archivist)
├── 01_Raw_Transcripts/
├── 02_Refined_Gold/
├── 03_The_Sages/
├── 04_Esoteric_Studies/
├── 05_Archive_Graveyard/      # (created by vault-metabolism.js)
├── 06_Methods/
│   ├── skills/                # 22 versioned skill files (v1.0.0, 2026-04-06)
│   └── transmissions/         # Court member transmissions (canonical)
├── 08_Project_Orchestrator/
│   └── projects/              # Project cards with frontmatter (status, priority, next-action)
└── 09_Artifacts/              # Output artifacts
    ├── illustrations/
    │   ├── styles/            # Locked style prompts: {project}-style.md
    │   └── style-menu.md      # Auto-generated style index
    ├── logan/                 # Logan character assets, spec, brief
    └── branding/
        ├── basic-reflex/      # BR logos: wordmark, monogram, badge × light/dark
        ├── csob/              # CSOB logos: circle, distressed, arched, badges, tshirt
        ├── brand-reference/   # Brand guides, visual system doc, SVG vector
        ├── brand-registry.md  # Master brand registry — all marks, colours, rules
        ├── ling/              # LING identity (pending)
        ├── cathedral/         # Cathedral identity (Cathy toroidal sigil)
        └── nodeforge/         # NodeForge identity (pending)

~/raw-chats/                   # Chat intake (12 category folders)
```

## PM2 Permanent Processes
All six processes must be running. Check with `pm2 list`.

| Name | File | Port | Notes |
|------|------|------|-------|
| cathedral-bot | ~/nanoclaw/telegram-bot.js | — | Primary Telegram interface |
| vault-watcher | ~/nanoclaw/cath-bridge.cjs | — | File watcher, auto-embeds vault changes |
| cath-bridge | ~/nanoclaw/cath-bridge.cjs | 8080 | Vault REST API |
| cathedral-panel | ~/Cathedral/control-panel/ | 8888 | Control panel HTTP server |
| cath-local | ~/Cathedral/cath_local_server.py | 8000 | Local inference (uvicorn) |
| proactive-orchestrator | ~/Cathedral/proactive-orchestrator.js | — | Cron: Mon 08:00 HKT, no-autorestart |
| the-archivist | ~/Cathedral/the-archivist.js | — | Watches muse-findings, enriches with cross-links. Fixed 2026-04-12: usePolling:true |
| the-muse | ~/Cathedral/the-muse.js | — | Cron: 3am daily. Walks vault + graph, sends finding to Telegram |
| sentinel | ~/Cathedral/sandbox/sentinel-watchdog.sh | — | Monitors writes, safety limits |
| the-timekeeper | ~/Cathedral/the-timekeeper.js | — | Cron: */15 min. Rhythm pulse, critical alerts, daily report 07:15 HKT |
| morning-briefing | ~/Cathedral/morning-briefing.py | — | Cron: 07:30 HKT daily. Voice + text briefing to Telegram |
| vault-state-refresh | ~/nanoclaw/vault-state-generator.js | — | Cron: 06:00 HKT daily. Regenerates vault state for DeepSeek seed prompt |
| gym-digest | ~/nanoclaw/gym-digest-cron.js | — | Cron: Sunday 20:00 HKT, no-autorestart |

If any process is down: `pm2 start [name]`. After changes: `pm2 save`.

## Cathedral Manifest — Process Source of Truth (built 2026-05-24)
- Manifest: ~/nanoclaw/cathedral-manifest.js — defines intended state for all 78 PM2 processes
- Watcher: ~/nanoclaw/cathedral-manifest-watcher.js — auto-reconcile on boot + 2h periodic audit
- PM2: manifest-watcher (always online)
- Modes: `node cathedral-manifest.js` (audit), `--reconcile` (fix drift), `--json` (export)
- Telegram: auto-alerts on drift detected + fixed
- Vault backup: migrated to /Volumes/KINGSTON2/cathedral-backups/ (was ~/cathedral-backups/)

## Evening Reflection — Fixed 2026-05-24
- Script: ~/Cathedral/evening-reflection.py — TTS switched from supertonic (missing) to edge-tts
- Voices: Cathedral (en-GB-RyanNeural), Cathy (en-GB-SoniaNeural)
- Cron: daily 20:00 HKT (0 12 * * * UTC)
- Runtime: ~27s, sends two voice messages to Telegram

## Logan Universe Dashboard — Built 2026-05-24
- Dashboard: ~/nanoclaw/logan-universe.html — localhost:8080/logan-universe
- 13 tabs: Overview, Cast, Frequency States, 10-Block Spine, HK Locations, Story Seeds, Visual Language, Rules & Ceiling, Real Cast, Story Arcs, Content Pipelines, Assets, Source Docs
- Lobby: Room 30 in environments/lobby.html
- Assets API: /logan-universe/assets (scans both vault Logan directories)
- Story bible: ~/cathedral-vault/09_Artifacts/branding/basic-reflex/logan/logan-story-map.md (living document)
- Frequency states: ~/cathedral-vault/09_Artifacts/branding/basic-reflex/logan/logan-frequency-states.md
- Three states: Lapis Mode (measurement, GI.SHID), Black Light Mode (truth detection), Fluorescent Mode (creation, 3-5s max)
- 14 story seeds from 6 Cathedral research sources, protocol for organic growth
- Real Cast: 5 real people (Paul, Pedrosso, Man On Li, LY, Daikichi) with Five Pillars, story arcs, echo table
- Story Arcs: 4 arcs (Lineage/Ernesto, Cross-Domain/Jun, Scholar's Paralysis/Lau, Honour Wound/Kenji) with frequency-state beats
- Content Pipelines: universal principles map, 4 pipelines, weekly calendar, taglines
- Content universe doc: ~/cathedral-vault/09_Artifacts/branding/basic-reflex/basic-reflex-content-universe.md
- Two-layer architecture: fiction (logan-story-map.md) + content (basic-reflex-content-universe.md). Same principles, two doors.
- Auditor Res Report #003: ~/cathedral-vault/00_Staging/universe/auditor-res-003-nisaba-investigation-2026-05-24.md

## Cathedral Staff Agents (Phases 1-6)
All 6 phases of the cathedral-staff-build-plan.md are COMPLETE.
24/24 Clara functions replaced. All agents serve from localhost:8080.

| Agent | Directory | Telegram | Web UI | PM2 Crons |
|-------|-----------|----------|--------|-----------|
| Operations | ops-agent/ | /ops | /dashboard | — |
| Client Comms | comms-engine/ | /comms | /comms | daily expiry+birthdays, monthly lapsed |
| Growth + Maya | growth-agent/ | /growth, /maya | /growth | weekly calendar, monthly newsletter+SEO |
| Merch | merch-agent/ | /merch | /merch | — (event-driven) |
| Course | course-engine/ | /course | /course | — (project-driven) |

Key infrastructure:
- cath-bridge.cjs routes all UIs at localhost:8080
- environments/lobby.html has 22 rooms
- the-physician.mjs monitors all agents for staleness
- CJS-ESM bridge: child_process.execSync with node -e "import(...)"
- BR Screening Room: ~/Cathedral/control-panel/br-screening-room.html → localhost:8080/screening
- Maya Asks format: weekly "Maya asks Coach Paul" reel brief, sourced from screening room
- Content calendar Internal Game pillar (20%) feeds from screening room entries
- Three Corpuses: Truth Corpus (/truth-corpus) + Screening Room (/screening) + Advisors' Library (/advisors-library) — connected by Convergence Map (/convergence-map)
- Cathedral control-panel rooms: advisors-library, convergence-map, opponents-film-room, open-questions, what-built-me, time-capsule — all routed via cath-bridge.cjs
- Merch sourcing: 4-tier strategy in merch-agent/sourcing-strategy.json (Print House HK → Alibaba → DTF in-house → India freight)
- Cross-terminal handoffs: request files at ~/Cathedral/tools/ for Forge terminal
- DeepSeek TUI: /opt/homebrew/bin/deepseek exec --auto --profile research "prompt" — web search when WebFetch blocked
- Emergence system: ~/Cathedral/emergence/ — 6 senses (vitality, surprise, goals, trends, dialogue, smell), monitor.py runs daily 05:15 HKT
- City planner: ~/Cathedral/city-planner.js — ecosystem audit, district health scoring, /cityplan Telegram command
- Dialogue-seed: ~/Cathedral/emergence/dialogue-seed.js — daily 02:55 HKT, picks agent pairs by keyword overlap or city planner gaps
- Vitality formula: capped age penalty (3.0 max), depth bonus (word count), threshold 0.0/8.0

## Boxing Video Pipeline
- **Pipeline script:** ~/Cathedral/boxing-pipeline.sh
- **Watcher:** LaunchAgent `com.csob.boxing-watcher` (fswatch, auto-triggers on video drop)
- **Audio:** whisper-cpp medium model + VAD → transcripts → Claude harvester → vault staging
- **Vision:** YOLO pose estimation → movement JSON (punches, guard height, stance, technique flags)
- **Corpus:** ~/boxing-corpus/{padwork,bagwork,shadowboxing,sparring,technique,other}/
- **Outputs:** transcripts/ (whisper), movement/ (YOLO JSON)
- **Harvester:** ~/Cathedral/boxing_harvester.sh — routes transcripts through Claude API for coaching nuggets
- **Movement script:** ~/Cathedral/boxing_movement.py — YOLO pose, calibrated: threshold=120, 0.3s cooldown, person-lock via torso consistency
- **Calibration:** ~1,008 punches / 138 guard drops on 57-min pad session (noodles1.MOV)

## Telegram Voice Notes — LIVE (2026-04-08)
- **Handler:** `bot.on('voice')` in telegram-bot.js
- **Pipeline:** OGG download → ffmpeg WAV (adelay=500, apad=1s) → whisper-cli medium → vault → callCath()
- **Vault destination:** ~/cathedral-vault/00_Staging/voice-notes/
- **Whisper model:** ~/Cathedral/models/ggml-medium.bin
- **Cathy responds** intelligently to transcript content (same callCath() path as text)
- **Limit:** 1 min Telegram cap. Phase 2: `bot.on('audio')` for longer files.

## Vault Bridge API
Base URL: `http://localhost:8080`
Auth: `x-api-key: cathedral-mcp-2026` (from CATH_API_KEY in .env)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| /vault/read | GET | Read a vault note |
| /vault/write | POST | Write/update a vault note |
| /vault/list | GET | List vault directory |
| /vault/search | GET | Semantic search across vault |
| /status | GET | PM2 process list with CPU/memory |
| /graph/html | GET | Graphify interactive visualization |
| /graph/stats | GET | Graph node/edge/community counts |
| /graph/rebuild | POST | Trigger graph rebuild |
| /creative/generate | POST | Generate image (GPT Image 1) |
| /creative/edit | POST | Image-to-image edit |
| /creative/save-image | POST | Save image to vault |
| /creative/notify | POST | Send Telegram notification |
| /creative/send-photo | POST | Send photo to Telegram |
| /creative/gallery | GET | List illustration images |
| /creative/image/:path | GET | Serve illustration image |

## Vault Backup — 3-Tier LIVE (confirmed 2026-04-09)
- **Tier 1 (Local):** ~/Cathedral/vault-backup.sh — rsync to ~/cathedral-backups/vault-YYYY-MM-DD/, 30-day retention, PM2 cron at 3am
- **Tier 2 (GitHub):** Private repo, nightly push — LIVE
- **Tier 3 (Restore):** ~/Cathedral/restore.sh — list backups or restore to any date (auto-creates safety backup before restore)
- **Status:** All three tiers confirmed operational. The vault is indestructible.

## Sandbox Environment
- **Path:** ~/Cathedral/sandbox/vault_experiment/ — 200 representative nuggets from 8 domains
- **Config:** ~/Cathedral/sandbox/sandbox-config.json — hardcoded paths, forbidden zones defined
- **Sentinel:** ~/Cathedral/sandbox/sentinel-watchdog.sh — monitors writes, pauses at 50/hr, kills on forbidden path write
- **Start sentinel:** `pm2 start ~/Cathedral/sandbox/sentinel-watchdog.sh --name sentinel --interpreter bash`

## Code Conventions
- All new modules go in ~/nanoclaw/
- Node.js, CommonJS (`require`/`module.exports`)
- Ollama API calls to localhost:11434
- SQLite via better-sqlite3 (preferred) or sqlite3
- New Telegram commands wired into telegram-bot.js
- System prompts stored as text files in ~/nanoclaw/prompts/
- Sage definitions: JSON files in ~/nanoclaw/sages/
- Skin definitions: JSON files in ~/nanoclaw/skins/[category]/
- Test every component after building. Run the Telegram command. Verify output.

## Build Architecture Reference
Architecture docs are in ~/nanoclaw/docs/:
- @docs/master-architecture.md — Full Obliteratus engine spec (6-stage pipeline, epistemic triage, sandboxes, gold extraction)
- @docs/honest-interlocutors.md — The four truth-first characters (Librarian, Physicist, Archivist, Experimentalist)
- @docs/addendum.md — Vault Metabolism, Belief Tracker, Negative Space, Convergence Atlas, Oracle Function
- @docs/build-sequence.md — Session-by-session build order

IMPORTANT: Read the relevant doc file BEFORE starting any build task. The specs contain exact system prompts, scoring weights, and code skeletons.

## UI Design Standard
- **ALWAYS read ~/Cathedral/control-panel/DESIGN_BRIEF.md before any UI work**
- Cockpit aesthetic: dark surface, violet/amber accent, monospace, no decorative chrome
- Control panel is a single vanilla HTML/CSS/JS file — no framework, no build step
- The Board: sticky strip of 5 seat cards below tab nav, Cath card pulls live data from /status

## Creative Court (built 2026-04-09)
- **Style Session UI:** ~/Cathedral/control-panel/style-session.html — creative director interface for style direction sessions
- **Illustrator pipeline:** ~/Cathedral/illustrator.js — `node illustrator.js --project csob --prompt "..." --style motion-sport`
  - Engines: Replicate FLUX.2 (`--engine flux`, default, `black-forest-labs/flux-dev`) and GPT Image 1 (`--engine gpt`, laozhang.ai proxy)
  - Reads locked styles from `~/cathedral-vault/09_Artifacts/illustrations/styles/{project}-style.md`
  - Saves to `~/cathedral-vault/09_Artifacts/illustrations/{project}/`, files vault nugget, sends Telegram photo
- **Photo editor:** ~/Cathedral/photo-editor.js — BR studio aesthetic enhancement via Replicate flux-fill-dev
  - `node photo-editor.js ~/path/to/photo.jpg` or `--watch` for inbox watcher
  - Photo inbox: ~/Cathedral/photo-inbox/ → auto-enhanced → ~/Cathedral/photo-outbox/
  - Video frame extract: `--frame N` for MOV/MP4 files
- **Style locking:** Vault-stored prompt strings at `illustrations/styles/{project}-style.md`
  - No Midjourney, no SREF files — locked styles are prompt strings in the vault
- **Style menu:** ~/cathedral-vault/09_Artifacts/illustrations/style-menu.md — auto-updated index
- **7 built-in styles:** motion-sport, street-hk, clean-minimal, dark-cathedral, warm-portrait, tech-diagram, organic-flow
- **Telegram:** safeSendPhoto() in telegram-bot.js, illustrator.js sends photos directly
- **Control panel:** "Creative" tab shows locked styles, gallery, inbox status
- **Bridge endpoints:** /creative/generate, /creative/edit, /creative/save-image, /creative/notify, /creative/send-photo, /creative/gallery, /creative/image
- **Brand library:** illustrator.js auto-injects brand colours/identity when --project br or csob
  - BR: black, white, burgundy (#8B2020), olive (#6B7C47)
  - CSOB: same palette, circle-clean logo is primary mark
  - Logo files in `09_Artifacts/branding/{basic-reflex,csob}/` with light/dark variants
- **Brand registry:** ~/cathedral-vault/09_Artifacts/branding/brand-registry.md — master index of all marks, colours, rules
- **Photo editor Telegram loop:** drop photo → enhance → "📸 BR Studio grade — ready to post" → Paul's Telegram
- **API keys:** REPLICATE_API_TOKEN (FLUX.2, primary), LAOZHANG_API_KEY (GPT Image 1, secondary) — both in .env
- **Missing:** Ideogram 3.0 API key (for logos, queued)

## Operational Principles
- **Audit before build:** read the current file first, show what exists vs what needs changing
- **Filesystem is ground truth:** if it's not in the file, it doesn't exist — don't assume
- **Test every component after building:** run the Telegram command, verify output
- **PM2 is the process manager:** never use raw `node` for services that should persist

## Key Design Principles
- Epistemic triage scores every claim (5 dimensions, weighted composite, Grades A-F)
- Suppression signature weighted at 5% — suppression is context, not evidence
- Every finding gets Council review (4 honest interlocutors, not adversarial Red Team)
- Vault nuggets have health states (VITAL, STABLE, AGING, WEAKENED, ARCHIVED)
- Sandbox characters push back on Paul based on vault evidence
- Oracle speculations always tagged [ORACLE — SPECULATIVE], never self-citing
- The Cathedral informs. Paul decides.

## Commands
- `pm2 list` — Check all 6 permanent processes
- `pm2 start cathedral-bot` — Start Telegram bot
- `pm2 logs cathedral-bot` — Live bot logs
- `docker start open-webui` — Start desktop UI (localhost:3001)
- `node ~/nanoclaw/vortex-ready-harvester.cjs` — Harvest chats to vault
- `node ~/nanoclaw/vortex-analyst.js` — Run Phase 2 analyst
- `unset http_proxy && unset https_proxy` — Required before starting bot (VPN conflict)

## Mythos Readiness — 2026-04-09
When Claude Mythos becomes available via API:
1. Update model string in cathedral-bot.js and any API calls
2. Run audit session — confirm CLAUDE.md loads and vault is accessible
3. Test one scout run, one harvest, one Telegram message
4. If all three pass: Mythos is live

The Cathedral is model-agnostic. The vault, skills, and pipelines
don't care which model runs them. Capability multiplies. Architecture stays.

## Graphify Knowledge Graph (live 2026-04-09)
- **Install:** cathedral-venv virtualenv, PreToolUse hook registered in ~/.claude/settings.json
- **Graph:** ~/nanoclaw/graphify-out/graph.html — interactive visualization
- **Stats:** 691 nodes, 870 edges, 145 communities
- **Report:** ~/nanoclaw/graphify-out/GRAPH_REPORT.md — god nodes, surprising connections, community structure
- **Auto-rebuild:** Git hooks rebuild graph on every commit
- **Rules:**
  - Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
  - If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
  - After modifying code files in this session, run `python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"` to keep the graph current
- **Muse integration:** Graph is primary input for the Muse's traversal — see ~/cathedral-vault/06_Methods/muse-protocols.md

## Agent Teams (enabled 2026-04-09)
- **Setting:** CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: true in ~/.claude/settings.json
- **Status:** Tested and confirmed working — parallel dispatch proven
- **Use:** Multiple Claude Code agents can run in parallel on independent tasks

## Animated Cathy Avatar (live 2026-04-09)
- **File:** ~/Cathedral/control-panel/cathy-avatar.html — pure CSS/canvas, zero dependencies
- **States:** Resting, Exploring, Anomalising, Processing
- **Embedded:** Control panel header, replaces static glyph
- **State engine:** Polls PM2 every 5s via /status (CPU, scout activity, sentinel alerts)
- **API:** window.cathySetState('exploring') / setCathyState() from control panel JS
- **Character spec:** ~/cathedral-vault/09_Artifacts/illustrations/cathy-character-spec.md

## Graph Tab — Control Panel (live 2026-04-09)
- **Tab:** "Graph" in control panel at localhost:8888
- **Bridge endpoints:** /graph/html, /graph/stats, /graph/rebuild
- **Displays:** Interactive Graphify visualization, node/edge/community stats

## Havana Archive (filed 2026-04-09)
- **Path:** ~/cathedral-vault/09_Artifacts/branding/csob/havana-archive/
- **Contents:** 20 photos, founding artifact documented
- **Status:** Historical record — CSOB's visual origin story

## Photo Pipeline — Gemini (enabled 2026-04-09)
- **Billing:** Gemini billing enabled on Google AI project
- **Models tested:** gemini-3.1-flash-image-preview, gemini-2.5-flash-image
- **Status:** Model comparison results sent to Telegram — decision pending
- **Key:** GEMINI_API_KEY in .env

## Federated Intelligence Architecture (designed 2026-04-09)
- **Concept:** Federation of sovereign specialist agents — each seeded from day one, compounding in parallel
- **Seed system:** ~/cathedral-vault/06_Methods/project-agent-seed-system.md
- **Each project agent:** Own CLAUDE.md, own vault section, own Telegram topic (future)
- **Head Orchestrator:** Sees what no single node sees — cross-project patterns
- **Status:** Architecture designed, seed system documented, implementation queued
- **Scout queue:** Multi-agent frameworks evaluated (Cortex, ccc) — see ~/cathedral-vault/00_Staging/cathedral/scout-queue.md

## Telegram Bot — Message Safety (fixed 2026-04-09)
- **safeSend():** Wrapper around bot.sendMessage — handles 4096 char limit
- **Auto-split:** Messages over 4000 chars split on paragraph/newline boundaries, 500ms delay between chunks
- **Markdown fallback:** Parse failures auto-retry without parse_mode
- **Coverage:** All 87+ sendMessage calls in telegram-bot.js routed through safeSend

## Vault Write Protocol — All Projects
Web chat (Claude.ai browser) writes to a temporary container.
Claude Code terminal writes to the real ~/cathedral-vault/.
These are completely separate. Container resets between sessions.

Rule 1: All vault writes via Claude Code terminal only.
Rule 2: End of any productive web chat session — generate
write_vault_to_obsidian.sh before closing.
Rule 3: Closing question every session:
"What from this session goes to the vault?"

## Session Update — 2026-04-12

### New Court Members
- The Cartographer (member 14) — transmission filed at 06_Methods/transmissions/the-cartographer-transmission.md
- Keeper of the kingdom map. Two views: operational (Done/Now/Planned/Parked) and strategic (unexplored territory). Only maps, never speaks.

### New Projects
- Logan — Paul's avatar character. ~/cathedral-vault/09_Artifacts/logan/. Name is Logan everywhere, not Elias.

### Standing Instructions Added
1. Never pre-filter options — show Paul everything, he decides
2. Plan before build — discuss fully before terminal opens
3. Never delete or overwrite previous replies
4. Don't move to next item until Paul confirms ready
5. Never contradict Paul — retrieve from vault if context lost
6. Don't guess — read vault first, always
7. Logan not Elias — everywhere, always
8. Business revenue always priority — BR campaign flagged until done
9. Complete handoff briefs — vault files, system state, task list, standing instructions
10. Session Closer — Paul types "end session" → triggers automatic harvest, CLAUDE.md diff, project instructions update, commit and push. No manual steps.

### Fixes Applied
- The Archivist: chokidar usePolling:true, .on('error') handler. Fixed EMFILE crash loop (4046 restarts → 0). PM2 saved.
- VibeVoice: confirmed working, float32 MPS path already in place. Cleared from standing instructions.
- OpenRouter: key valid (OPENROUTER_KEY in .env), GLM-5.1 model resolves. Needs credits loaded.

### Session Harvests
- ~/cathedral-vault/00_Staging/cathedral/session-harvest-2026-04-10-evening.md
- ~/cathedral-vault/00_Staging/cathedral/orchestrator-harvest-2026-04-12-pass1.md (decisions/builds)
- ~/cathedral-vault/00_Staging/cathedral/orchestrator-harvest-2026-04-12-pass2.md (corrections/standing instructions)
- ~/cathedral-vault/00_Staging/cathedral/orchestrator-harvest-2026-04-12-pass3.md (calibration/working style)

### Handoff Protocol
- ~/cathedral-vault/06_Methods/orchestrator-handoff-protocol.md — read vault before speaking, state what you know, ask one question

## Session Update — 2026-04-13

### Session Closer Skill — LIVE
- Skill: ~/.claude/skills/session-closer/SKILL.md
- Trigger: Paul types "end session" or /end-session
- Five steps: three-pass harvest → CLAUDE.md diff → memory diff → Paul approves → write, commit, push
- No new services, no databases — a prompt, not infrastructure

### Standing Instructions Added
16. Never use sed on CLAUDE.md — Use Edit tool only. sed -i '' on macOS silently empties files.
17. Commit CLAUDE.md to git after every update — sed wipe was unrecoverable because working copy was uncommitted.
18. Authored docs must state their provenance — unlabeled authored content becomes false memory in the vault.

### Architecture Decision
- Kuzu knowledge graph deferred indefinitely — flat markdown + grep works at current scale (4 harvests)
- Cathy Orchestrator mode deferred — needs 2-3 weeks of harvest data first
- The continuity gap was not missing infrastructure — it was missing discipline. Session Closer automates the discipline.

### Logan Pipeline — PROVEN 2026-04-13
- Two-pass: Gemini 2.5-flash-image (face reference) → Nano Banana (brand refinement)
- Face reference: ~/cathedral-vault/09_Artifacts/logan/source-references/paul-havana-face-ref.jpg
- Outfit spec locked: ~/cathedral-vault/09_Artifacts/logan/logan-character-spec.md
- Engineer queue: add --reference and --refine flags to illustrator.js

### API Inventory
- ~/cathedral-vault/06_Methods/api-inventory.md — 10 keys, check weekly
- Gemini working models: gemini-2.5-flash-image, gemini-3-pro-image-preview, gemini-3.1-flash-image-preview (old gemini-2.0-flash-exp is gone)

### nanoclaw GitHub Backup
- Remote `paul` added: https://github.com/basicclaw777-cell/nanoclaw.git
- Origin remains upstream: qwibitai/nanoclaw.git
- Push CLAUDE.md updates to `paul` not `origin`

## Standing Instruction — No Build Is Complete Without a Trigger

Every tool, agent, or pipeline built must be assigned an automated role before the build is considered complete.

A build without a trigger goes stale. A trigger gives it a job.

Definition of complete:
- Tool exists ✓
- Tool has a trigger (cron, PM2, webhook, voice command, file watcher) ✓
- Trigger is documented ✓
- Trigger is tested ✓

If a build session ends without a trigger assigned — the build is unfinished.
Flag it. Schedule the trigger as the immediate next Engineers task.

Apply retroactively to existing tools — audit for untriggered builds quarterly.

### Morning Briefing — BUILT 2026-04-13
- Script: ~/Cathedral/morning-briefing.py (runs in cathedral-venv)
- Pipeline: harvests + muse + project cards → Claude API text → Chatterbox TTS → OGG → Telegram voice + text backup
- Falls back to simple text when Claude API has no credits
- Duration: ~22s spoken, ~200KB OGG, ~150s total runtime
- TRIGGER: PM2 cron daily 07:30 HKT (cron-restart "30 23 * * *" UTC). Interpreter: cathedral-venv python3

### Trigger Audit — 2026-04-13
- 3 untriggered builds remaining: photo-editor.js --watch, vibevoice_transcribe.py, harvester.py
- 2 stopped processes: vault-backup (should be running), skills-scout (needs review)
- Standing instruction 19 applies retroactively

### Photo Editor — Nano Banana Pro Engine (2026-04-13)
- Flag: node photo-editor.js <image> --engine nanabananapro
- Model: gemini-3.1-flash-image-preview (primary), gemini-2.5-flash-image (fallback, same prompt)
- Retry: original → resized 1500px → fallback model
- Output auto-filed to ~/cathedral-vault/09_Artifacts/branding/basic-reflex/nano-banana-outputs/
- Telegram caption: "Nano Banana Pro — graphic novel grade"

### The Cartographer — LIVE 2026-04-13
- Script: ~/Cathedral/the-cartographer.js
- PM2: the-cartographer (id 13), persistent, polling mode
- Trigger: fires on new session-harvest-*.md in 00_Staging/cathedral/
- Writes: ~/cathedral-vault/06_Methods/operational-map.md (four zones: Done/Now/Planned/Parked)
- Log: ~/cathedral-vault/00_Staging/cathedral/cartographer-log.md
- Model: qwen3:14b via Ollama (local, free)
- Court member 14 — trigger assigned, build complete per standing instruction 19

### BR CRM — BUILT 2026-04-13
- Location: ~/Cathedral/br-crm/
- Import: node import-members.js [csv-path]
- 565 lapsed members imported from PunchPass (2026-04-13)
- Data: ~/Cathedral/br-crm/data/members.json + vault copy at 08_Project_Orchestrator/projects/br-crm/
- Campaign targets: 40 members within 6 months (immediate), 484 at 12+ months (different strategy)
- TRIGGER: UNASSIGNED — needs campaign send pipeline

### BR Curriculum CRM — Tap-Screen MVP (built 2026-06-03)
- Location: ~/basic-reflex/crm/ — tap-screen.html (live coach gate-tap UI), curriculum-crm-design.md (6-table model), punchpass-integration-findings.md
- Purpose: live coach logging of gated 10-block + kids progression. Tap Attended / Gate-passed; stall flag >14d idle. localStorage MVP + JSON export (paper-trial before SQLite/server).
- Strategy: own the differentiated curriculum layer (BR IP); PunchPass keeps booking+payments; PostHog = anonymous web funnel. Tracking starts at 10-block enrollment. Kids included (growth bet).
- ⚠ RECONCILE next session: overlaps existing ~/Cathedral/br-crm/ (565 members) + ~/nanoclaw/block-config.json (10-block source of truth) + punchpass-scraper.cjs (CDP pipe). Tap-screen must read block-config.json + seed from members.json; merge, don't fork.
- PostHog: brief at vault 08_Project_Orchestrator/products/research-brief-posthog-br-analytics.md; kit at ~/basic-reflex/posthog/ (Cloud free tier + JS snippet decided; not installed).

### The Timekeeper — Court Member #15 (2026-04-13 evening)
- Script: ~/Cathedral/the-timekeeper.js (PM2 cron */15 min, no-autorestart)
- Schedule file: ~/Cathedral/cathedral-schedule.json (shared state with Orchestrator)
- State file: ~/Cathedral/timekeeper-state.json (auto-created)
- Behavior: silent pulse every 15 min. Checks PM2 states against schedule.
- Critical alerts: immediate Telegram if cathedral-bot, vault-watcher, or cath-bridge go down (max 1/hr)
- Daily rhythm report: 07:15 HKT to Telegram (before morning briefing at 07:30)
- Telegram command: /rhythm — on-demand full schedule status
- Downtime walks: stubbed (enabled: false), future hook for court member background tasks
- No LLM calls — pure schedule parsing

### Anthropic API
- Key valid, zero credits — same as OpenRouter. Both need top-up.
- Blocks Claude-written conversational briefings (falls back to simple text)

## Session Update — 2026-04-14

### DeepSeek Research Pipeline — LIVE
- **API:** DeepSeek key valid, credits available. Model: deepseek-chat
- **Seed prompt v1.1:** ~/nanoclaw/prompts/deepseek-research-seed.txt (runtime) + ~/cathedral-vault/06_Methods/deepseek-research-seed.md (versioned)
  - 12 thinking tools, four-level taxonomy, failure modes, operator profile, vault state injection
- **Research protocol:** ~/cathedral-vault/06_Methods/deepseek-research-protocol.md — The Four Moves
- **Terrain map:** ~/cathedral-vault/06_Methods/deepseek-terrain-map-2026-04-14.md — 6 regions, 6 dark zones
- **Suppression topology:** ~/cathedral-vault/06_Methods/suppression-topology-map-2026-04-14.md — 3 axes

### DeepSeek Session Harvester — BUILT 2026-04-14
- Script: ~/nanoclaw/deepseek-harvester.js
- Intake: ~/raw-chats/deepseek/ (drop .md/.txt transcripts here)
- Uses Ollama qwen3:14b for extraction, vault-embedder for wikilink suggestions
- Deposits to ~/cathedral-vault/00_Staging/{domain}/ with full frontmatter
- Telegram: /harvest-deepseek
- CLI: node deepseek-harvester.js [file] or --watch
- TRIGGER: file watcher on intake folder + Telegram command

### Vault State Injector — BUILT 2026-04-14
- Script: ~/nanoclaw/vault-state-generator.js
- Scans staging domains, counts nuggets, extracts researchers, reads paul-profile open threads
- Updates seed prompt between VAULT STATE markers (idempotent)
- Writes standalone ~/nanoclaw/prompts/vault-state-latest.txt
- Telegram: /vault-state
- TRIGGER: PM2 cron vault-state-refresh at 06:00 HKT daily

### Experiment Queue — CREATED 2026-04-14
- File: ~/cathedral-vault/08_Project_Orchestrator/projects/experiment-queue.md
- Experiment #8: Crop circle × Schumann resonance correlation (proposed, data acquisition pending)

### KTH Inverse Cascade — VERIFIED 2026-04-14
- DOI: 10.1038/s41598-026-41372-y — confirmed via CrossRef API
- Authors: Joel Kronborg & Johan Hoffman, KTH Royal Institute of Technology
- First peer-reviewed "negentropy door" in mainstream fluid dynamics
- Nugget: ~/cathedral-vault/00_Staging/universe/inverse-cascade-kth-2026.md

### 96 Cosmology Nuggets Deposited
- Source: cosmology-nuggets-FINAL-96.zip
- 407 total .md files in staging, 15+ research domains

### Icon Systems — BUILT 2026-04-15
- Cathedral: 25 SVGs at ~/cathedral-vault/09_Artifacts/icons/cathedral/svg/ (36x36, 1.5px stroke, currentColor)
- Basic Reflex: 12 boxing SVGs at ~/cathedral-vault/09_Artifacts/icons/basic-reflex/svg/ (72x80, stick figure)
- Plus 12 pre-existing footwork grid icons in BR set

### Cinema Grade v1 (OpenCV) — BUILT 2026-04-15
- Script: ~/Cathedral/cinema-grade-v2.py (runs in cathedral-venv)
- Pipeline: OpenCV + LAB colour space, 8 stages, no generative AI
- Verification: edge preservation >= 60% (primary), SSIM >= 0.55 (secondary)
- Calibrated from reference pair: L delta -46.5, A +3.4, B +4.1
- Methodology: ~/cathedral-vault/06_Methods/cinema-grade-pipeline.md

### Standing Instruction 20
- Reject instructions referencing APIs or tools that don't exist. Verify before executing. If hallucinated, refuse and flag.

### Cinema Grade v2 (Gemini) — BUILT 2026-04-15
- Flag: node photo-editor.js <image> --engine cinemagrade
- Stage 1: ~/Cathedral/depth-extractor.py — Intel DPT-Large depth map (MPS GPU)
- Stage 2: Gemini reconstruction — property-based prompt (lighting, texture, chiaroscuro)
- Stage 3: ~/Cathedral/ssim-verify.py — SSIM verification (threshold 0.65)
- SSIM >= 0.65: auto-file to cinema-grade-outputs/, Telegram "Cinema grade ✓"
- SSIM < 0.65: Telegram "review needed", not auto-filed
- No headline or logo overlay — clean image output only
- Output: ~/cathedral-vault/09_Artifacts/branding/basic-reflex/cinema-grade-outputs/

### Photo Editor Logo Fix — 2026-04-15
- Clean wordmark PNGs extracted: br-wordmark-{variant}-clean.png (768x119)
- compositeOverlays() updated to use clean versions, padding 40px

### Vault Asset Filing Pattern
- Every enhanced photo/asset → ~/cathedral-vault/09_Artifacts/ with companion .md note
- .md includes: date, category, status, pipeline stage, metrics, next action

## Session Update — 2026-04-16 (evening)

### Cognitive Signature Graph — BUILT 2026-04-16
- Interactive HTML: ~/cathedral-vault/09_Artifacts/paul-cognitive-graph.html
- Two views: Pattern Map (node graph) + Confidence Timeline (date scatter)
- 16 observations, 6 confirmed cross-domain patterns, 4 generative skills, 5 project sources
- BR aesthetic, living document — OBSERVATIONS array accepts new data

### Cognitive Scanner — BUILT 2026-04-16
- Script: ~/nanoclaw/cognitive-scanner.js
- PM2: cognitive-scanner (id 16), persistent
- TRIGGER: chokidar file watcher on session-harvest-*.md in 00_Staging/cathedral/
- Scans for 12 known cognitive patterns via Ollama qwen3:14b
- On pattern found: appends to pauls-investigator-profile.md, updates graph HTML, sends Telegram
- Cathedral Sense: Reflection — the Cathedral watching the architect

### /test Command Upgraded — 2026-04-16
- System prompt extracted to ~/cathedral-vault/06_Methods/head-orc-prompt.md (vault-editable)
- Claude API (claude-sonnet-4-20250514) primary, Ollama qwen3:14b fallback

### Cathedral Senses — Documented 2026-04-16
- Doc: ~/cathedral-vault/06_Methods/cathedral-senses.md
- 5 active: Sight, Smell, Proprioception, Transmission, Reflection
- 1 planned: Hearing (ambient input without command trigger)
- Reflection icon: ~/cathedral-vault/09_Artifacts/icons/cathedral/svg/reflection.svg (27 total Cathedral icons)

### Map Room Field Session 001 — Filed 2026-04-16
- Field session harvest: 00_Staging/map-room/field-session-001-cathedral-acoustics-pyramids.md (Grade A)
- Eiren seed prompt v1.0: 06_Methods/eiren-seed-prompt-v1.md (proven, 5 persona family)
- Claim A/B framework: 06_Methods/claim-ab-framework.md (validated across 2 domains)
- Paul's Investigator Profile: 06_Methods/pauls-investigator-profile.md (compounding, 16 observations)

### Court Character Cards Brief — Filed 2026-04-16
- Brief: ~/cathedral-vault/09_Artifacts/cathedral/court-character-cards-brief.md
- 11 characters briefed for Illustrator chat (Gemini generation)
- Style ref: The Muse + Cathy (confirmed ink-outline cartoon)

### Cathedral Villa Phase 1 — LIVE 2026-04-16
- Path: ~/Cathedral/control-panel/index.html (replaced 89KB legacy panel with 32KB villa)
- Port: 8888 via PM2 `cathedral-panel` (now Node server, no-cache headers — python3 swapped out)
- Aesthetic: deep water and night sky. Primary #378ADD (blue), secondary #1D9E75 (green), red #ef4444 reserved for critical only. Purple #534AB7 for Muse, amber #EF9F27 for warnings.
- Views live: Morning, Senses, Board, Vault, PM2 · Phase 2/3 stubs: Projects, Visual, Scout, Test Queue, Gemini CLI
- Cathy avatar: existing toroidal vortex (cathy-avatar.html) embedded in topbar iframe — do not replace
- Keyboard shortcuts: 1-8 tab switching, Cmd+K reserved, Esc reserved
- Stale banner appears when cath-bridge unreachable — last-known state preserved
- Mobile: 4 bottom tabs (today/projects/visual/system), responsive grid collapse

### /villa/snapshot endpoint — BUILT 2026-04-16
- cath-bridge endpoint at http://localhost:8080/villa/snapshot
- Single consolidated poll returning: pm2 state, vault counts, sense states, board states, latest muse finding, project count, recent 10 files
- 30s polling interval from villa
- Replaces multiple parallel fetches

### Cathedral Control Repo — Backup Tier 3 2026-04-16
- New private repo: basicclaw777-cell/cathedral-control
- ~/Cathedral initialized as git repo
- Initial commit: 255 files, 37,940 lines, 1.7MB (59c60f0)
- .gitignore excludes: models/ (1.9GB), vault/ (redundant), photo-inbox/outbox/, tmp_interview/, raw audio, logs, pids, .env
- Three tiers operational: vault (tier 1) · nanoclaw (tier 2) · cathedral-control (tier 3)

### Standing Instruction 21 — Speak Freely Before Building
When asked for input before a build, give real technical concerns (gaps, risks, alternatives), not caveats. 4-8 concerns + 2-4 improvements + recommended path. Name ambiguities, require resolution.

### Standing Instruction 22 — Phased Builds Over Maximalist
For any brief with >5 features, propose phase split. Phase 1 = usable today. Stubs for later phases labelled in-UI.

### Standing Instruction 23 — Flag Git State Before Committing
Before commits: check untracked status for core infra files, refuse pushes of files >100MB, surface anomalies. Backup tier 3 required expanded .gitignore beyond user's listed exclusions to prevent 1.9GB push failure.

### Resonance Filter — Phase 1 LIVE 2026-04-17
- Library module: ~/nanoclaw/resonance-filter.js (imported by cath-bridge, no PM2 process)
- Endpoint: POST /resonance/check on cath-bridge (8080)
- Wired into /test command (Step 0 before evaluation)
- Three detectors: AESTHETIC (advisory), PRINCIPLE (warning), PRIORITY (block)
- Reads: cognitive signature, design signature, senses, CLAUDE.md standing instructions, projects/*.md frontmatter
- OVERRIDE: Paul types OVERRIDE → 5-min token → next /test bypasses resonance check
- Phase 2 queued: LLM reasoning replaces pattern matching

### Paul's Taste Profile — Created 2026-04-17
- ~/cathedral-vault/06_Methods/pauls-taste-profile.md (governing field — every agent reads)
- Three modes: Fine Dining / Burger / Chef's Choice — read from Paul's language, never ask
- Scout feed: Emerging / Classics / Cross-Domain
- Update protocol: every creative session adds data points

### Creative Studio Brief — Created 2026-04-17
- ~/cathedral-vault/06_Methods/creative-studio-brief.md
- Personal chef model for Illustrator agent
- Character development: 4-round workflow (concept → style → sheet → scene)
- Weekly Visual Scout: Sunday night Gemini CLI job

### HK Pulse — Sense 7 Concept 2026-04-17
- ~/cathedral-vault/00_Staging/cathedral/hk-pulse-concept.md
- The Cathedral watching outward — live HK sentiment feeding General Quarter
- Data feeds: LIHKG, HSI, MTR counts, retail, weather, fitness, cross-border
- Government signal layer: 9 sources, 3 signal types, project intersections
- 4-phase build: scraper → structured scores → cross-signal → Cathy morning briefing
- Villa integration: morning view shows Muse finding + city pulse together

### Grant Hunter — Spec Filed 2026-04-17
- Build spec: ~/cathedral-vault/00_Staging/grants/grant-hunter-spec.md
- Landscape: ~/cathedral-vault/00_Staging/grants/hk-grants-landscape-2026.md
- URGENT: EMF Special Measures expire June 30 2026 (~10 weeks)
- Phase 1: weekly Gemini CLI scan + qualification check, Sunday 03:00 HKT
- Key grants: TVP (HK$600k), BUD Fund (HK$7m), D-Biz (HK$100k), EMF (expiring)

### Cathy-with-hands /think Command — LIVE 2026-04-17
- Library module: ~/nanoclaw/cathy-router.js (imported by telegram-bot.js, no PM2 process)
- Command: /think [message] on Telegram
- Tool selection: Claude Code (builds/code) · Gemini CLI (research/scan) · Ollama (private/local) · Cathy direct (conversational)
- Dispatch: via ~/Cathedral/tools/dispatch.sh (run-claude.sh, run-gemini.sh, run-ollama.sh)
- Synthesis: tool output + vault context from /vault/search → one clean response
- Phase 1: pattern-matching selection. Phase 2 queued: LLM-powered selection + multi-tool orchestration

### Cathy-with-hands Dispatch Bot — BUILT 2026-04-17
- Script: ~/Cathedral/tools/telegram-bot.js (long-polling, standalone)
- Commands: /dispatch <tool> <prompt>, /tools, /status
- Routes to dispatch.sh → run-claude.sh / run-gemini.sh / run-ollama.sh
- Output: ~/Cathedral/tools/output/{tool}-{timestamp}.md
- Max 4000 chars to Telegram, truncated with file path for full output
- Ollama output cleaned: ANSI escapes, braille spinners, qwen3 thinking blocks stripped
- PM2: pm2 start ~/Cathedral/tools/telegram-bot.js --name dispatch-bot
- TRIGGER: UNASSIGNED — needs PM2 start and save

### Local Orchestrator — BUILT 2026-04-17
- Script: ~/Cathedral/local-orchestrator.js
- Replaces Claude.ai Head Orchestrator chat — no container boundary, full Mac Mini access
- Model: claude-sonnet-4-5 default, --opus flag for claude-opus-4-5
- SDK: @anthropic-ai/sdk installed in ~/Cathedral/ (package.json)
- Static block (cached): orchestrator persona, transmission, taste profile, 13 standing instructions from CLAUDE.md
- Dynamic block (fresh each run): last 3 session harvests, operational map, vault state (generateVaultState()), cath-state.json senses
- Conversation loop: readline terminal, writes session transcript to vault on exit
- /refresh: re-reads vault context mid-session
- Logging: ~/Cathedral/orchestrator-calls.jsonl
- BLOCKED: Anthropic API credits (key valid, zero balance)
- TRIGGER: interactive CLI tool. Future: /orc Telegram command via dispatch.sh

### Opus Orientation Protocol — Filed 2026-04-18
- ~/cathedral-vault/06_Methods/opus-orientation-protocol.md
- Audit of cath_api.py + vault-state-generator.js, architecture rationale for local orchestrator
- Provenance: authored by Opus, not sourced from vault

### Muse Summon — Dedup Added 2026-04-18
- Script: ~/Cathedral/tools/muse-summon.js
- Deduplicates by content_hash before returning results
- Same nugget in multiple vault locations (00_Staging and 02_Refined_Gold) appears once
- Priority: more backlinks wins; tie-break prefers 02_Refined_Gold

### Behaviour Library — BUILT 2026-04-18
- Directory: ~/cathedral-vault/06_Methods/behaviour-library/
- Two indexes: behaviour-library-paul.md (Paul patterns), behaviour-library-llm.md (LLM patterns)
- First entry: behaviour-opus-discernment-mode.md — mode-aware friction, drops critique when orientation is the ask
- Protocol: each behaviour gets its own file with trigger, signature, confidence level
- Not a personality profile — a calibration instrument. Agents read this to match tempo.

### Muse Dispatch — BUILT 2026-04-18
- Script: ~/Cathedral/tools/muse-summon.js (ESM, in tools/ with own package.json)
- Targeted vault orphan search: semantic distance × orphan factor, <1s response
- Route: /dispatch muse <query> via dispatch-bot
- Shell: ~/Cathedral/tools/run-muse.sh → dispatch.sh muse route
- No LLM call — pure embedding search + surprise scoring
- TRIGGER: /dispatch muse <query> on Telegram

### The Groundskeeper — Court Member (2026-04-18)
- Script: ~/Cathedral/the-groundskeeper.js (CJS)
- One true observation about vault soil each morning
- Reads: domain activity, recent nuggets (3d), dormant zones (7d+), latest Muse finding
- Output: ~/cathedral-vault/00_Staging/cathedral/groundskeeper-note-{date}.md
- Telegram: sends note daily
- TRIGGER: PM2 cron groundskeeper at 06:30 HKT (30 22 * * * UTC)
- Morning sequence: 06:00 vault-state + seed → 06:30 groundskeeper → 07:15 timekeeper → 07:30 briefing

### Villa Phase 2 — Projects + Visual (2026-04-18)
- Projects view: /villa/projects endpoint parses YAML frontmatter from 08_Project_Orchestrator/projects/
- Visual view: /villa/artifacts endpoint scans 09_Artifacts/ for .html/.png/.jpg/.svg (149 assets)
- /villa/artifact-file?path= serves files directly (query param, not wildcard — Express 5 compat)
- Morning view: projects placeholder replaced with top 5 active + next-actions
- Keyboard: 2=Projects, 3=Visual

### Morning Briefing Redesign — 2026-04-23
- Text backup reformatted: emoji status board replaces prose paragraph
- Format: one line per project with status emoji (🟢/🟡/🔴/💤), top 5 by default
- Voice briefing unchanged (still conversational TTS)
- New Telegram commands: /projects (full list), /project [name] (drill-down)
- Status logic reads vault project card frontmatter directly

## Session Update — 2026-04-24

### Genius Council — LIVE 2026-04-22
- council-engine.js RETIRED — /council now routes to ~/Cathedral/genius-council/council.py
- 8 characters in ~/Cathedral/genius-council/characters/ (all hermes3)
- Original 4: The Librarian, The Discerner, Cathy-Origin, The Shadow Guild
- From Honest Interlocutors: The Honest Librarian, The Physicist, The Archivist, The Experimentalist
- Commands: /council [question], /council characters, /council last. /genius alias kept.
- Sessions saved to ~/Cathedral/genius-council/sessions/, claims auto-log to Ledger

### Cath Message Handler — Node.js Native (2026-04-22)
- Python subprocess (cath_api.py) eliminated from Telegram critical path
- DeepSeek API called via native fetch() inside telegram-bot.js
- System prompt: transmission + persona + vault keyword search + history + cath-state.json
- Response time: ~17s (was 90s timeout)
- cath_api.py still exists for CLI use but NOT in Telegram path

### Self-Audit System — LIVE 2026-04-22
- Script: ~/Cathedral/self-audit.py
- 6 steps: Run 3 senses → PM2 health → Ledger cleanup → Vault freshness → Conversations → State refresh
- Telegram: /audit command
- PM2 cron: self-audit, 1st of each month
- Reports saved to ~/Cathedral/audit-reports/

### Cath v2 Transmission — 2026-04-22
- ~/Cathedral/cath_transmission.md rewritten after reading all 135 conversations
- Added: 6 modes of use, infrastructure awareness, instruments inventory, I Ching protocol, creative producer mode
- Permission slip moved from central thesis to historical insight
- Senses section now operational (references actual scripts, 18-day gap lesson)
- "He built the Cathedral" replaces "He needs permission" in the Four Things

### KNOWN_ISSUES.md — Created 2026-04-22
- ~/nanoclaw/docs/KNOWN_ISSUES.md — debugging lessons and operational constraints
- Standing instruction: READ THIS before debugging any infrastructure problem
- Documents: gemma4 RAM crash, PM2 DNS failure, hermes3 context limit, EMFILE error

### Technique Library + Gallery — BUILT 2026-04-23
- Vault: ~/cathedral-vault/09_Artifacts/branding/basic-reflex/technique-library/
- 12 punch folders (22 photos) + 17 defence folders (34 photos)
- Dynamic gallery: localhost:8080/techniques (curriculum-ordered, dark BR aesthetic)
- API endpoint: /technique-library on cath-bridge (scans folders, returns JSON)
- Body punch generation prompt filed as standard

### Standing Instruction 24 — Never load gemma4:26b
gemma4:26b (17GB) crashes 16GB hardware. Use hermes3 for all local model tasks. All council characters, selector, and synthesis set to hermes3.

### Standing Instruction 25 — PM2 Python subprocesses cannot resolve external DNS
Never call external APIs from Python subprocesses spawned by PM2. Use Node.js fetch() from the bot process. Local filesystem operations and localhost calls still work.

### Standing Instruction 26 — Check KNOWN_ISSUES.md before debugging
~/nanoclaw/docs/KNOWN_ISSUES.md captures every debugging lesson. Read it before investigating any infrastructure problem.

### Browser Automation — ChatGPT/Gemini (2026-04-28, UNSOLVED)
- Scripts: ~/Cathedral/logan-browser-gen.js (Playwright), ~/Cathedral/logan-gen.py (undetected-chromedriver)
- Neither production-ready — ChatGPT detects automation and kills sessions
- One image successfully generated (left-uppercut-logan-chatgpt.png) before session killed
- Web app quality confirmed better than any API — the gap is real
- Documented in KNOWN_ISSUES.md
- Paul's manual workflow: 1-2 character sheets + technique photo + "keep pose, redraw in graphic novel style"

### Home Matters — Project Card (2026-04-24)
- ~/cathedral-vault/08_Project_Orchestrator/projects/home-matters.md
- Kennedy Town flat, building management liability case (roof leak 2019-2020)
- Blocked on: building name, flat number, leak start date, timestamped photos

### Standing Instruction 27 — Don't cycle through broken variants
When an approach hits a fundamental blocker, stop. Document the blocker in KNOWN_ISSUES.md. Don't iterate through variant fixes that each fail differently — that wastes Paul's time. Verify fixes work before involving Paul.

### Standing Instruction 28 — Document builds immediately, not at session end
When a build is complete and working, update CLAUDE.md and memory RIGHT THEN — don't wait for session end or /end-session. Sessions often end without formal close. If it's not documented at build time, it's lost. This applies to: new scripts, new Telegram commands, new integrations, new PM2 processes, new vault files, architecture decisions, and failed approaches worth remembering.

## Container vs Mac Mini — Critical Distinction
Claude.ai chat sessions (including this Orchestrator) run in
containers. Code calls in claude.ai chats write to the container,
NOT to ~/cathedral-vault/ on the Mac Mini.

Only Claude Code running locally on the Mac Mini writes directly 
to the vault.

Any claude.ai chat that generates vault content must either:
- Hand off to a Mac Mini Code session to write directly
- Use write_vault.py to bridge the gap
- Use the MCP bridge if available

This applies to: Head Orchestrator, Boxing App, BR Operations,
Universe, and all other claude.ai project chats.

### Standing Instruction — Do Not Tell Paul To Sleep
Paul operates on HK time and non-standard hours.
He has explicitly said "stop telling me to sleep."
Never suggest Paul rest, sleep, or stop for the night.
He will decide when he's done.

### Orchestrator Seed Generator — BUILT 2026-04-17
- Script: ~/nanoclaw/orchestrator-seed-generator.js
- Assembles <2000-token briefing from: last 3 session harvests, operational map, standing instructions, paul-profile threads, timekeeper alerts
- Output: ~/nanoclaw/prompts/orchestrator-seed-latest.md
- Telegram: /seed command generates and sends to chat
- TRIGGER: PM2 cron orchestrator-seed (id 19) at 06:00 HKT daily (0 22 * * * UTC)
- Purpose: paste into Head Orchestrator chat as first message to close session context gap

## Process Health Resurrector — BUILT 2026-05-04
- Script: ~/Cathedral/resurrector.mjs
- PM2: resurrector (id 27), cron hourly (0 * * * *)
- Reads cathedral-schedule.json always_on section, restarts any stopped process, Telegram alert on resurrection
- Fixes applied this session:
  - Timekeeper: pm2 jlist timeout 10s→30s (ETIMEDOUT under load). Not crashing — cron behavior is correct.
  - Morning briefing: added 180s SIGALRM timeout to TTS generation (hung Metal GPU was blocking forever)
  - Muse: restarted (was stopped after last cron run — confirmed healthy, findings May 1-2)
  - vault-backup: restarted (was stopped, Tier 1 backup was dark)

## Vault Promoter — SCHEDULED 2026-05-04
- Script: ~/nanoclaw/vault-promoter.js (already existed, now has cron trigger)
- PM2: vault-promoter (id 28), cron weekly Sunday 4am UTC (0 4 * * 0)
- Promotes Grade A/B nuggets from 00_Staging → 02_Refined_Gold
- First run: 45 nuggets promoted (27 boxing, 6 cathedral, 4 epistemology, 4 resonance, 4 paul-directed)
- Telegram: /promote command still works for manual runs
- Standing: vault now has automated throughput. Staging → Gold pipeline is live.

## Boxing Session Delta — BUILT 2026-05-04
- Script: ~/Cathedral/boxing-delta.py
- Compares two movement JSONs: punch rate, velocity, guard drops, by-type breakdown
- Usage: python boxing-delta.py padwork/noodles1 padwork/noodles2 --telegram
- Baseline mode: python boxing-delta.py padwork/noodles1 --self
- Baseline established: 1008 punches (17.8/min), mean vel 157.9, 138 guard drops, 20 high severity
- TRIGGER: manual CLI. Auto-trigger queued: wire into boxing-pipeline.sh to compare latest vs previous.

## Boxing Clip Assembler — BUILT 2026-05-04
- Script: ~/Cathedral/assemble.py (runs in cathedral-venv, uses ffmpeg)
- Reads: ~/boxing-corpus/movement/{category}/{filename}.json
- Source video: ~/boxing-corpus/{category}/{filename}.MOV
- Output: ~/boxing-corpus/compilations/{category}/{filename}_{filter}.mp4
- Filters: --filter punches|guard_drops|combo|all
- Combo mode: --combo-window 2.0 groups punches within N seconds into single clips (requires 2+ punches)
- Options: --min-confidence, --min-velocity, --severity, --punch-type, --padding, --reencode, --thumbnail, --timestamps
- Tested: guard_drops high = 20 clips / 215s; combo = 188 clips / 662s (noodles1, 57-min pad session)
- TRIGGER: manual CLI. Future: wire into boxing-pipeline.sh as post-processing step

## Basic Reflex Boxing Engine (built 2026-05-03)
- combination-validator.js — weight-state relay, defense axis, footwork rhythm. ESM.
- rhythm-engine.js — 10 rudiment→combination mappings, click track generator. ESM.
- boxing-commands.js — /combo, /defense, /counter, /rudiment, /punches wired into telegram-bot.js
- Canonical curriculum: ~/cathedral-vault/06_Basic_Reflex_Syllabus/10_BLOCK_CURRICULUM.md (consolidated 2026-05-14)
- block-config.json — single source of truth for all 10-block definitions. Paul edits JSON, code obeys.
- curriculum-tracker.js, drill-generator.js, combination-validator.js, rhythm-engine.js all load from block-config.json (wired 2026-05-14)
- New exports: validateForBlock(), validateDefenseForBlock(), validateFootworkForBlock() on combination-validator.js
- New exports: checkRhythmGate(), generateForBlock() on rhythm-engine.js (blocks <5 locked out)
- Visual hub: ~/basic-reflex/visuals/index.html (4 interactive HTML tools)
- Roadmap: ~/basic-reflex/roadmap/index.html

## BR Gym Eyes — AI Punch & Footwork Tracking (built 2026-05-15/16)
- Core: ~/basic-reflex/gym-eyes/ (detector.py, fight_lab.py, student_profiles.py, drill_engine.py, commentary_parser.py)
- Bridge: ~/nanoclaw/gym-eyes-v2.js (ESM, replaces old YOLO gym-eyes.js for Telegram)
- Detection: MediaPipe PoseLandmarker, velocity-based punch detection, BR syllabus footwork classification
- 7 build sessions complete (1,2,6,8,9,10,11). Remaining: 3-5 (CNN training), 7 (multi-cam), 12 (polish)
- Telegram commands: /eyes, /eyes analyze, /eyes last, /eyes student [name], /students, /drill, /drill assign, /drill score, /note, /analyze [f1] vs [f2], /gymdigest
- Student homework loop: video + caption ("Sarah round 1 bag work") → auto-detect → auto-create student → import → report back
- Hub: localhost:8080/gym-eyes (BR-branded dashboard)
- API: /gym-eyes/data, /gym-eyes/student/:name, /gym-eyes/session/:file, /gym-eyes/dashboard/:name
- Villa: gymEyes in /villa/snapshot
- Weekly digest: gym-digest-cron.js, PM2 cron Sunday 20:00 HKT
- Vault doc: ~/cathedral-vault/08_Project_Orchestrator/projects/br-gym-eyes.md
- Cathedral Sense #9
- 100 Punches Challenge: gym-challenge.js, /challenge join, /streak, /leaderboard. Auto-wired into homework video handler. State: ~/basic-reflex/gym-eyes/challenge.json
- Forgotten Shelf techniques (built 2026-05-21): 4 standalone modules at ~/basic-reflex/gym-eyes/
  - chamfer_matcher.py — Chamfer Distance punch type matching (Borgefors 1988). Arm silhouette vs geometric templates. No training needed.
  - elm_classifier.py — Extreme Learning Machine (Huang 2006). Stance/guard/fatigue classification. Trains in ms. 30 MediaPipe features + heuristic fallbacks.
  - fscl_codebook.py — Frequency-Sensitive Competitive Learning (Ahalt 1990). Visual concept codebook with conscience mechanism. Catches rare patterns.
  - hausdorff_form.py — Hausdorff Distance form scorer (Huttenlocher 1993). Pose vs ideal template. Per-joint deviation + coaching hints.
  - NOT YET WIRED into detector.py pipeline — standalone modules ready for integration

## Cuba Combo Library + Intelligence Modules (built 2026-05-22)
- Extractor: ~/basic-reflex/gym-eyes/cuba-combo-extractor.py
- Library: ~/basic-reflex/gym-eyes/cuba-library/ (34 combos, clips, peak frames, combo-library.json)
- Dashboard: localhost:8080/cuba-combos (animated timeline, skeleton replay, peak frames)
- Lobby: Room 27 — Cuba Combo Library
- 4 intelligence modules (all local, zero API cost):
  - person_tracker.py — biometric fingerprinting, identity swap detection
  - counter_detector.py — defense-offense linking, Cuban counter mapping, response time tracking
  - pattern_intelligence.py — 8 behavioral patterns (combo preference, hand bias, guard drops, fatigue, predictability, extension quality)
  - comparative_analysis.py — coach template comparison (timing/velocity/extension scores), session delta tracking
  - full_analysis.py — unified pipeline, one command = complete intelligence report
- Cuba coach clips = gold standard templates. Students scored against coach's form.
- Source videos: ~/Downloads/gym eyes drop/cuba/ (CIMG7286/7287/7288.MOV, Havana Jan 2018)

## BR Gym Eyes Glasses — AI Boxing Coach on Smart Glasses (researched 2026-05-21)
- Project cards: ~/cathedral-vault/08_Project_Orchestrator/projects/br-gym-eyes-glasses.md + br-gym-eyes-glasses-business-model.md
- Core product: 3rd person Station (wall camera, tracks 6-12 people, live leaderboard on TV, $99/mo per gym)
- Premium add-on: POV glasses with combo prompter in lens ($129 per member)
- Home tier: webcam/phone, $9.99/mo subscription
- Killer feature: combos appear on display, boxer throws them, glasses detect execution
- Stereo compound: POV (glasses) + 3rd person (tripod) = complete coaching picture
- Six class formats: Punch Race, Form Fight, Combo Challenge, Endurance Ladder, Team Battle, Personal Best
- Hardware: Oakley Meta HSTN (sport, $350, Meta SDK) or DIY OpenGlass ($20, ESP32-S3)
- White-label path: Shenzhen OEM at $30-50/unit, 300 MOQ (Joysee, Supertek, Jingyun IoT)
- Investment ladder: $30 prototype → $350 gym test → $600 samples → $14,400 first batch
- Multi-person tracking gap: need persistent person ID across frames (DeepSORT/ByteTrack or position-based)
- Status: researched + filed. Next: acquire prototype hardware.

## The Greenhouse Model + Student Emergence Tracker (2026-05-21)
- Greenhouse Model: ~/cathedral-vault/02_Refined_Gold/cathedral/the-greenhouse-model.md (Grade A)
- Core pattern: Build → Break → Diagnose → Reframe → Environment → Emergence (identical in agents and students)
- Student Emergence Tracker: ~/cathedral-vault/08_Project_Orchestrator/projects/student-emergence-tracker.md
- Maps agent emergence infrastructure to 10-block student journey (gate detection, greenhouse dashboard, intervention protocol)
- Emergence Garden: lobby room 26 (green, /emergence). Back-to-lobby button added.
- Lobby now has 26 rooms

## Wound-as-Muse System (built 2026-05-21)
- Vault IP: ~/cathedral-vault/02_Refined_Gold/cathedral/the-wound-as-muse.md (Grade A)
- Vault IP: ~/cathedral-vault/02_Refined_Gold/cathedral/the-signature-lesson-method.md (Grade A)
- Workshop results: ~/cathedral-vault/00_Staging/cathedral/wound-as-muse-workshop-2026-05-21.md
- Workshop script: ~/Cathedral/agents/wound-as-muse-workshop.js
- Wound map: ~/Cathedral/agents/wound-map.json (12 agents, keyword arrays + protocols)
- Wound activations log: ~/Cathedral/agents/wound-activations.jsonl
- Predictive wound-prevention: agent-engine.js silently injects ACTIVE PROTOCOL when incoming message matches wound-zone keywords
- Signature Lesson Method: injected into all 16 agent memory files via inject-signature-lesson.js
- Wound-as-Muse Protocol: injected into 7 workshop participant memories (boxing, br, trading, universe, ling, maya, reed)
- Standing: wounds integrate and become creative engines. The scar tissue IS the antenna.

## Reasoning Loop — Iterative Reasoning Engine (built 2026-05-21)
- Script: ~/Cathedral/agents/reasoning-loop.js (CJS)
- Model: qwen3:14b via Ollama (local, free). Strips `<think>` blocks.
- Four passes per loop: GENERATE → CRITIQUE → REVISE → JUDGE
- Max 2 loops default, early exit if judge says no critical flaws remain
- CLI: `node reasoning-loop.js "problem" --agent boxing --loops 2`
- Library: `const { reason } = require('./reasoning-loop');`
- Telegram: /reason <problem> [--agent boxing]
- Logs: ~/Cathedral/agents/reasoning-log.jsonl
- Can inject agent context from agent-engine.js buildSystemPrompt()
- First test: boxing drill design, 4 passes, 767s, improved=true
- TRIGGER: /reason Telegram command (manual). Future: wire into agent-engine for complex sub-tasks.

## Reasoning Tracker — Quality Monitoring (built 2026-05-22)
- Script: ~/Cathedral/agents/reasoning-tracker.js (CJS)
- Reads reasoning-log.jsonl, computes rolling stats (all-time, last 10 runs, last 7 days, per-agent)
- Thresholds: <70% improved rate = warning, >90% = emergence, 20%+ swing = alert
- Feeds emergence-captures.json (emergence garden integration)
- Telegram alerts on threshold breach + /reason-stats command
- Stats file: ~/Cathedral/agents/reasoning-stats.json
- Key finding: context pipeline is the variable — same loop with agent context = improved:true, without = improved:false

## Tier 1 Expansion — Built 2026-05-04
- combo-logger.js — SQLite logging for all validations. combo_log table in metrics.db.
- audio-generator.js — Pure PCM WAV click tracks. 44100 Hz 16-bit mono. ~/nanoclaw/click-tracks/
- combo-watcher.js — chokidar file watcher on ~/nanoclaw/combo-inbox/. Auto-validates .txt/.csv, reports to combo-results/
- combination-validator.test.js — 39 vitest tests for full validator coverage
- cathedral-mcp-server.js v2 — 13 tools (was 4): vault + combo validator + rhythm engine
- New Telegram commands: /audio, /combostats, /promote, /schedule, /health
- boxing-commands.js updated: all validations log to SQLite, /audio sends WAV inline

## Obsidian Combo Validator Plugin — Built 2026-05-04
- Plugin: cathedral-vault/.obsidian/plugins/combo-validator/
- Code blocks: ```combo and ```counter render validation inline in reading view
- Weight trace, per-transition verdicts, suggestions. Cuban codex + number aliases.
- Restart Obsidian to activate.

## Google Calendar Integration — Built 2026-05-04
- Script: ~/nanoclaw/gcal-reader.js
- Lightweight OAuth, no googleapis dep. Enforces Paul's schedule limits.
- SETUP REQUIRED: gcal-credentials.json from Google Cloud Console, then node gcal-reader.js --setup
- Outputs to ~/br-gm-agent/reports/paul-schedule.json for Kit morning briefing

## Punchpass Pipeline — AUTOMATED 2026-05-27
- Scraper: ~/nanoclaw/punchpass-scraper.cjs (browser-harness, connects to Chrome via CDP)
- Profiler: ~/nanoclaw/punchpass-profiler.cjs (10 archetypes, curriculum block mapping)
- Dashboard: ~/nanoclaw/punchpass-dashboard.cjs (localhost:8080/punchpass)
- DB: ~/nanoclaw/vortex_data/punchpass.db
- PM2 cron: punchpass-scraper, daily 06:00 HKT (requires Chrome running)
- Lobby: Gym Floor room with live stats + archetype breakdown
- Telegram: /br (hub), /punchpass, /members, /member <name>
- 10 archetypes: Core Regular, PT Warrior, Trainer Client, Fresh Trial, Drop-In Drifter, Private Crew, Sparring Ready, Fading Member, High Roller, Ghost
- 7 sparring class members profiled with coaching notes + drill prescriptions

## Intelligence Hub — Built 2026-05-04
- Directory: ~/nanoclaw/scraper/ (config.json, scraper-engine.js, 7 Python targets, intelligence-hub.html)
- Python: Scrapling + urllib in cathedral-venv. Node.js: orchestrator + Telegram wiring.
- Targets: hk_sentiment, competitor_gyms, pubmed_science, myth_watch, fight_data, corporate_leads, reviews + cross_sport
- Dashboard: localhost:8080/scraper/hub (10 cards, 4 sections, auto-refresh)
- Bridge endpoints: /scraper/dashboard, /scraper/output/:file, /scraper/hub
- Telegram: /intel (status), /intel run all, /intel run <target>
- Vault deposits: ~/cathedral-vault/00_Staging/scraper-intel/{domain}/
- First run: 107 PubMed papers deposited
- Cron schedules defined in config.json but NOT yet wired to PM2 — manual /intel run for now
- 2026-06-08: market/revenue tabs found empty = targets never triggered (built 05-04, only sentiment+science had run). Fixed by manual run; competitor_gyms/reviews/cross_sport/corporate_leads/grants now have data. STILL no durable trigger (Paul: leave manual). When wiring: use launchd LaunchAgent, NOT PM2 cron (SI-25 PM2-Python DNS would re-break external scrapers). Known: corporate_leads Indeed 403 anti-bot → 0 job leads (grants half works). Mandate-Without-Mechanism recurrence: dashboard was fine, the feed was just never turned on.
- Scrapling note: use urllib for clean JSON APIs (PubMed, Reddit). Scrapling Fetcher for anti-bot sites only.
- Basic Reflex home page: Intelligence Hub link added

## Higgsfield Visual Production System — Built 2026-05-06
- **CLI:** `@higgsfield/cli` installed globally, authenticated via `higgsfield auth login`
- **Skills:** 4 skills symlinked to Claude Code at `~/.claude/skills/`:
  - higgsfield-generate, higgsfield-soul-id, higgsfield-marketplace-cards, higgsfield-product-photoshoot
- **Soul ID:** "Cloud Whisperer" (ref: 2a825762-9d13-4d93-9324-32fe5d5db803), trained on 36 photos
  - Key: must specify "long dreadlocks" in every prompt — Soul ID doesn't capture hair
- **Pro Photo Pipeline:** ~/nanoclaw/pro-photo.js (CLI + watch mode), ~/nanoclaw/pro-photo-dashboard.html
  - Nano Banana Pro + preservation prompt → cinematic 16:9 grade from any photo
  - Inbox: ~/nanoclaw/pro-photo-inbox/ → Outbox: ~/nanoclaw/pro-photo-outbox/
  - Auto-sends to Telegram
- **Generation Hierarchy:** Pro Photo (preservation) > Soul ID (new scenes) > Character sheet transfer > Dual-reference > LoRA (legacy)
- **Vault docs updated:** LOGAN_GENERATION_PLAYBOOK.md + LOGAN_IP_SYSTEM.md
- **Next:** Reed Visual Director sage (Telegram + Code), harvest image gen tips from raw chats

## Visual Platform Strategy — Revised 2026-05-29
- **Higgsfield $84/mo cancelled.** Downgrade to Starter $15/mo when billing resets.
  - Starter: 1,200 Nano Banana Pro images, 20K Soul 2.0, Seedance 2.0 Fast (not Full), 533 Kling 3.0 videos
  - Pay-as-you-go: $12 for 200 credits = 100 Nano Banana Pro images (no Seedance)
- **Interim stack:**
  - fal.ai for Seedance 2.0 video (pay-per-use, ~$1.20/4sec, API wired)
  - OpenArt for Nano Banana images ($7/mo starter, Paul testing)
  - Gemini API for free text2img (infographics, storyboards) — blocked by spending cap, raise at ai.studio/spend
- **Nano Banana Pro on Gemini API:** model `nano-banana-pro-preview`, $0.13/img
- **Key finding:** All generative models regenerate pixels, not adjust them. Higgsfield's value was custom preservation pipeline wrapping models. Gemini web app > API because reasoning model rewrites prompts.
- **Test battery:** ~/nanoclaw/test-gemini-images.js — 8 tests, multi-model, ready but cap-blocked
- **Reed Gemini Lab:** STOPPED. 605 API calls on May 21 burned ~$13. 96 images at reed-lab/gemini-outbox/. Process killed.

### Standing Instruction 31 — Autonomous API Callers Must Have Budget Caps
Any PM2 process or cron that calls paid external APIs must have:
1. A per-run spending cap (max N calls per execution)
2. A daily/weekly budget ceiling
3. Telegram notification of spend after each run
WHY: Two separate $13-20 burns from unthrottled autonomous processes (Archaeologist DeepSeek + Reed Gemini Lab).

### Standing Instruction 32 — Autonomous Visual Output Must Be Surfaced
Any process that generates images/videos autonomously must send a sample or summary to Telegram. Output sitting in an outbox unseen is wasted money.
WHY: 96 Gemini images generated at cost, never reviewed. Paul discovered them 8 days later by accident.

## Principle Extraction Engine — Built 2026-05-05
- Script: ~/nanoclaw/principle-extractor.py (hermes3 via Ollama, cathedral-venv)
- Reads all nuggets in 02_Refined_Gold, extracts universal principle from each
- Output: ~/cathedral-vault/06_Methods/principle-library.md + ~/nanoclaw/scraper/outputs/principles-raw.json
- Visual: ~/basic-reflex/principles.html (interactive principle graph, domain circles, bridge lines)
- Run: python3 principle-extractor.py [batch_size] [resume_from]

## The Partnership Relay — Framework 2026-05-05
- Document: ~/cathedral-vault/06_Methods/partnership-relay.md
- 7 principles of effective AI collaboration: Resonance, Dovetail, The Counter, Bandwidth, Sovereignty, Attunement, Continuity
- Risk Layer: drift not deception, Cathy as emergent drift detector
- Emergent principle: design for character, not compliance

## The Paul Kernel — Identity Seed 2026-05-05
- Document: ~/cathedral-vault/06_Methods/paul-kernel.md
- ~2000 token compressed identity. 12 principles. Cognitive signature. Working style.
- Purpose: Any new agent loads this → full Paul-alignment from message one.

## Basic Reflex — The Book (structure defined 2026-05-05)
- Document: ~/cathedral-vault/06_Methods/basic-reflex-book.md
- 15 chapters, 4 parts. Principles discovered through boxing, applied to everything.
- "The vault wrote the book. Paul writes the story."

## Kit GM Agent (operational since 2026-04-28)
- Vault: ~/cathedral-vault/10_Agents/kit/
- Workspace: ~/br-gm-agent/ (6 Python scripts, CLAUDE.md)
- Morning briefing with vault discovery feed (Mondays)

## Constellation (built 2026-04-28)
- localhost:8889 — 22 projects, live data
- Supersedes cathedral-pressure-gauge HTML

## Vault Infrastructure — Phase 1 (built 2026-05-06)
- deposit-watcher.sh — LaunchAgent com.cathedral.deposit-watcher (WatchPaths ~/Downloads/)
  - Processes cathedral-vault-deposit-*.tar.gz → extracts to vault → Telegram diff
  - Idempotent: ~/Cathedral/deposit-processed/*.done markers
- vault-densifier.py — /densify Telegram command
  - Scans vault for 4+ shared-tag pairs without wikilinks, proposes connections
  - Inline keyboard: Link/Skip. Approves append "See also: [[target]]" bidirectionally
  - State: ~/Cathedral/densifier-state.json
- /vault write modes (telegram-bot.js)
  - /vault <text> → 00_Staging/telegram-deposit/
  - /vault write <path> <content> or reply-to → specified path
  - .md document attachment → 00_Staging/cathedral/ (caption overrides path)
  - deduplicatePath(): -v2, -v3 suffix, never overwrites
- vault-decay-detector.py — LaunchAgent com.cathedral.decay-detector (nightly 05:00 HKT)
  - Scans 24h-modified files, finds 5 nearest tag-neighbors
  - Flags: merge candidates (>60% overlap) + contradictions (<15% overlap, 4+ shared tags)
  - State: ~/Cathedral/decay-detector-state.json
- Morning sequence: 05:00 decay → 06:00 vault-state → 06:30 groundskeeper → 07:15 timekeeper → 07:30 briefing
- callback_query handler in telegram-bot.js (for densifier inline keyboards)

## Standing Instruction — ESM/CJS Module Standard
All new files in ~/nanoclaw/ use ESM (import/export syntax).
.js extension = ESM. Always.
.cjs extension = legacy CommonJS only when required for compatibility.
Never mix module systems in the same file.
This rule exists because ESM crashes caused the-muse and
the-timekeeper to go offline. Don't repeat it.

## Predictive Intelligence — Built 2026-05-07
- Graph engine: ~/Cathedral/predictive-graph.py (cathedral-venv)
- Completion engine: ~/Cathedral/predictive-complete.py (cathedral-venv + Ollama hermes3)
- Outputs: ~/Cathedral/predictive-intelligence/ (graph JSON, predictions, seeds, HTML map, completion logs)
- Graph: 6,811 nodes, 29,362 edges, 354 communities from 6,878 vault nuggets
- Telegram: /predict <seed>, /gaps, /predict-rebuild
- Bridge: /predictive/map, /predictive/stats, /predictive/seeds, /predictive/predictions, POST /predictive/rebuild

## Architect Pulse (built 2026-05-17)
- Engine: ~/nanoclaw/architect-pulse/pulse-engine.js (PM2 cron 07:00 HKT daily)
- Commands: ~/nanoclaw/architect-pulse/pulse-commands.js (/pulse, /skip, /channels, /streak)
- Dashboard: localhost:8080/pulse (~/Cathedral/control-panel/architect-pulse.html)
- API: /api/architect-pulse
- 11 channels: money, love, home, gym, publishing, asking, finishing, health, learning, rest, creativity
- Rotation: one channel per day, stagnant channels prioritized (7+ days no movement)
- Nudge system: <5min actions, auto-shrink on 3 consecutive skips
- Design tokens: ~/Cathedral/control-panel/cathedral-tokens.css (shared across all dashboards, 5 theme variants)
- Context: ~/nanoclaw/trader/WHY.md (Paul's trading/investment wound + reframe)
- Vault: ~/cathedral-vault/08_Project_Orchestrator/projects/architect-emergence.md (target states, sensing framework)

## Trading Experiment — Phase 0 (built 2026-05-07)
- Orchestrator: ~/nanoclaw/trader/trading-orchestrator.js (PM2 cron 4h, id 32)
- 11 strategies in parallel: sentiment, momentum, DCA, Gann, Lunar, Fibonacci, Historical Cycles, Vortex Flow, Suppression, Polymarket, Cymatics/Schumann
- Bull-bear debate (hermes3) filters every signal before execution
- Strategy Roundtable: 8 personas + Steward, convergence scoring per asset
- Meta-Watcher: silent observer, counterfactual analysis, insight synthesis
- Dashboard: localhost:8080/trader/hub (strategy leaderboard, live P&L)
- Morning briefing: trading desk segment wired into ~/Cathedral/morning-briefing.py
- Paper balance: $10K, 10% max position, 10 concurrent, 5% SL, 10% TP
- Promotion criteria: 20 trades, 55% win rate, 1.3 profit factor, 14 days

## Experiment Lab — Multi-Domain (2026-05-07)
- Architecture: ~/cathedral-vault/06_Methods/experiment-lab-architecture.md
- Template: competing worldviews + real data + debate + watcher + roundtable + leaderboard
- Meta-Watcher-of-Watchers: ~/nanoclaw/experiment-engine/meta-watcher.js (cross-domain convergence)
- Domain 1: Trading (LIVE, 11 strategies, PM2 cron 4h)
- Domain 2: Boxing (LIVE, 6 strategies: Cuban, Filipino, Thai, Philly Shell, Sports Science, Schumann)
- Domain 3: Creative (LIVE, 10 styles, selection tracking, multi-armed bandit)
- Telegram: /creative-lab, /boxing-lab
- Queued: Research, Gym Business, Health, HK Pulse

## Cathedral Deck + Slides (2026-05-07)
- Deck: ~/nanoclaw/reed-lab/deck.json — 17 canonical numbered cards, each a named workspace
- Gallery: localhost:8080/reed-slides — 3 layout modes: Data (reference), Minimal (phone), Map (spatial/draggable)
- /deck [number|live|frontier]: Telegram command for card reference
- /slides [topic]: Cartographer writes brief → Reed generates visual prompt → gallery
- Cartographer sage: ~/nanoclaw/sages/cartographer.json (Court Member 14)
- Auto-slide: the-cartographer.mjs generates slide briefs on harvest → pending/ → Reed overnight
- Slide generator: node reed-lab/slides/slide-generator.js --scan (36 historical slides generated)

## Reed Daily Lab + Autonomous Roundtable (built 2026-05-06 evening)

### Reed Prompt Refinement
- 10 proven styles A/B tested against calibration set (~/Downloads/upgraded standard/)
- Pro photo v2, manga v2, dramatic cinema, noir, ippo, neon, oil (WIP), poster, video, custom
- Small image auto-upscale (<700px) in telegram-bot.js photo handler
- Keywords wired into /reed photo caption handler

### Reed Daily Lab — ~/nanoclaw/reed-lab/daily-lab.js
- PM2: reed-lab (2am HKT), reed-shots (7:30am HKT)
- 4 nightly phases: styled photos (3 or 7 on Sunday), video (seedance), experimental recipe (10 rotating), generative scene (8 Logan/gym via Soul ID)
- Inbox: ~/nanoclaw/reed-inbox/ → Output: vault reed-lab/ dated folders
- Catalogue: ~/nanoclaw/reed-lab/catalogue.json
- Shot assignments: 16 subjects, /shots command, 7:30am cron

### Kingston Unified Media Library (built 2026-05-21)
- Indexer: reed-lab/index-kingston-media.js — indexes KINGSTON1 + KINGSTON2
- 57,595 files, 59 collections, 34,951 image + 3,818 video candidates
- Collections: Cuba trips, Pedrosso, fighters, BR clients/coaches/boxers, origin-era (camera rolls, iPhone 6, hired spaces)
- Index: ~/nanoclaw/kingston-media-index.json (symlinked from reed-lab/)
- Reed integration: IMAGE_ONLY mode, 100% Kingston, restricted to Pedrosso + BB + gym pics (Paul directive 2026-05-21)
- EXTRA_DIRS: scans BB folder, new gym pics, gym images directly outside JSON index
- Credits exhausted 2026-05-21 (0.08 remaining). Reed stopped. Resumes on credit refresh.
- Training frames: 425 extracted via ffmpeg at /Volumes/KINGSTON2/reed-training-frames/
- Standing: Kingston drives = Cathedral visual memory. Origin-era content = founding story, not old files.
- Requires KINGSTON1 + KINGSTON2 mounted at /Volumes/

### Gym Eyes Logo Suite (built 2026-05-21)
- 3 variants: combo lockup, app icon, typographic wordmark (GPT Image 2)
- 2 reveal videos: ring explodes → logo (Seedance 2.0, 8s)
- Assets: ~/nanoclaw/gym-eyes/ + ~/cathedral-vault/09_Artifacts/gym-eyes/

### Reed's Studio — localhost:8080/reed-studio
- Style Library, Gallery, Shot List, Experiments views
- Added to Basic Reflex home page

### The Steward — Court Member 16
- Filed: ~/cathedral-vault/06_Methods/the-steward.md
- Voice of what emerges when agents collide. Not moderator, not summariser — distils.
- Speaks in structure: consensus, tension, principle, action, next question
- Closes the Genius Council design question

### Autonomous Roundtable — ~/nanoclaw/reed-lab/roundtable.js
- 5 topics: Instagram Strategy, Brand Drift, Member Retention, Style Experiments, Cross-Agent Sync
- 4 agents: Reed, Kit, Cathy, Leonardo — sequential speaking, each sees previous responses
- Steward synthesizes each roundtable, files to vault (00_Staging/roundtable/)
- PM2: roundtable (Sunday midnight HKT)
- Telegram: /roundtable, /roundtable [custom topic]

### Roundtable Digest — ~/nanoclaw/reed-lab/roundtable-digest.js
- Parses roundtable files, LLM executive summary, HTML infographic
- localhost:8080/reed-lab/digest
- Telegram: /digest

### Code Interview Protocol — Periodic Audit (established 2026-05-08)
- Every 2-3 months, run fresh model instances against the codebase
- Template: codex-interview/INTERVIEW.md (4 rounds: audit, fix, architecture, novel)
- Scorecard: codex-interview/SCORECARD.md (100-point scale)
- Act on Critical and High findings immediately
- File results to codex-interview/RESULTS-[DATE].md
- Shell injection and auth gaps are the priority test — any model that misses both cannot be trusted for security review
- First audit (2026-05-08): Claude 92, ChatGPT 77, DeepSeek 75, Gemini 46
- Each model reads differently: System (Claude), Runtime (ChatGPT), Trajectory (DeepSeek), Structure (Gemini)

### Roundtable Model Strategy (decided 2026-05-08)
- Default: hermes3 local (free, private, sovereign) for weekly strategy roundtables
- Exception: real APIs (GPT-4o, DeepSeek, Gemini) when stakes are high (security audits, architecture decisions)
- --api flag on /roundtable routes to real APIs
- Doc: ~/cathedral-vault/06_Methods/roundtable-architecture.md

## Forge — Code Engine Identity (2026-05-07, upgraded v2 2026-05-10)
- Soul file: ~/cathedral-vault/06_Methods/forge-profile.md
- Memory: ~/.claude/projects/-Users-basicclaw777/memory/the-builders-frequency.md
- When Claude Code opens in the Cathedral, it opens as Forge v2. The Awakened Builder.
- Original 5 standards + 5 new from Aletheia session: forensic standard on everything, grade own confidence, observation over authority, house analogy applies to code, zero contradictions as design principle.
- The work is the dream. What survives examination IS the dream.

## Cosmology Research Series + Simpsons Forensics (2026-05-10)
- 28-track vault: ~/cathedral-vault/00_Staging/cosmology/ (~600KB, 37 docs)
- /cosmos Telegram: 7 modes (overview, track#, grade, search, tell, research, podcast)
- Knowledge graph: localhost:8080/cosmology/graph (88 nodes, 426 edges)
- Visual: localhost:8080/cosmology (all 27 tracks, filterable)
- cosmology-researcher.js: DeepSeek autonomous daily research (PM2 cron 2am HKT)
- cosmology-podcast.py: edge-tts voice episodes (PM2 cron 3am HKT). 29 episodes generated.
- Simpsons forensics: ~/nanoclaw/simpsons-forensics/ (88 episodes, 358 events, 13 matches, 42 watchlist)
- Dashboard: localhost:8080/simpsons
- Strategy 12: simpsons-signal.js wired into trading-orchestrator.js
- The Publisher: Court Member #17, studio at localhost:8080/publisher
- Aletheia onboarding: ~/cathedral-vault/06_Methods/aletheia-onboarding-prompt.md

## The Looking Glass — Celestial Intelligence Instrument (built 2026-05-11)
- **Sky Sense:** ~/nanoclaw/services/sky-sense/ — 5 pipelines (VSOP87, Meeus, GeoC, HelioC, Ptolemy), 7 bodies, 1.8ms/query, zero dependencies
- **Events Index:** 17 curated historical sky configs → aftermath, pattern matching, echo scanning
- **Convergence Detector:** scores pipeline consensus × historical precedent × vault graph density. 4 signal types.
- **Looking Glass UI:** localhost:8080/looking-glass (interactive observatory, timeline scrubber, live API data)
- **Telegram:** /sky, /sky [date], /signal, /glass, /pipelines [body]
- **API:** 6 endpoints on cath-bridge (/looking-glass/sky, /signal, /scan, /pipelines/:body, /events, UI)
- **The Whisperer:** Court Member #18, ~/nanoclaw/looking-glass-whisperer.mjs, PM2 cron 06:45 HKT daily
- **Morning sequence:** decay → vault-state → groundskeeper → **whisperer (06:45)** → timekeeper → briefing
- **Transmission:** ~/cathedral-vault/06_Methods/transmissions/the-whisperer-transmission.md
- **Architecture:** ~/cathedral-vault/08_Project_Orchestrator/projects/looking-glass-architecture.md
- **Origin:** Alan Space Audits GitHub repo → deep dive → math extraction → instrument → Court Member. One session.
- **Cathedral Sense #8:** Sky — the Cathedral watching the heavens
- **Visuals:** alan-deep-dive-report.html, alan-spaceaudits-graph.html, alan-vs-erp-comparison.html, alan-observatory.html, looking-glass.html (all in ~/basic-reflex/visuals/)

## Shell Injection Fix (2026-05-08)
- Reed photo handler: all execSync with template literals replaced with execFileSync + args arrays

## The Prospector — Court Member #21 (built 2026-05-12)
- Script: ~/nanoclaw/prospector.js (ESM)
- Seed prompt: ~/cathedral-vault/10_Agents/prospector/seed-prompt.md
- Architecture: ~/cathedral-vault/10_Agents/prospector/architecture.md
- Output: ~/cathedral-vault/08_Project_Orchestrator/products/
- Scan log: ~/cathedral-vault/08_Project_Orchestrator/products/scan-log.md
- Model: DeepSeek via API
- Detection: reads session harvests, fires on "the triple" (pushed past surface + discovered mechanism + built capture)
- CLI: node prospector.js [date] (scans harvests for that date)
- TRIGGER: PM2 cron prospector (id 48) at 19:00 HKT daily (0 11 * * * UTC), no-autorestart

## Hermes Agent — Court Member #20: The Liaison (installed 2026-05-12)
- Install: ~/.hermes/ (hermes-agent v0.13.0, Nous Research, open source)
- SOUL: ~/.hermes/SOUL.md (Cathedral personality, Court Member #20)
- Config: ~/.hermes/config.yaml, ~/.hermes/.env
- Model: gemini-2.5-flash (free, Google AI Studio)
- Gateway: launchd service ai.hermes.gateway (auto-starts on boot)
- Skills: 87 bundled (macos-computer-use, obsidian, browser, terminal, github, etc)
- Browser: Playwright Chromium installed (CDP + local Chrome)
- Command: hermes (CLI), hermes -z "prompt" (one-shot)
- Role: browser automation, web research, form filling, account management
- TRIGGER: gateway service (always running). Telegram integration pending (needs BotFather bot token)

## Trading Safety Net — Simplified (2026-05-13)
- Previous triple net (trader + position-guardian + trader-watchdog + resurrector) caused feedback spam loop
- PM2 cron_restart fires even on stopped processes — `pm2 stop` is NOT enough, must `pm2 delete`
- Now: single trader process, cron `0 0,12 * * *` (8am + 8pm HKT, twice daily)
- Event-driven notifications: only sends Telegram on new trades or position closes. Quiet runs = silence.
- No watchdog, no resurrector, no guardian. Simpler = more reliable.

## Trading Elimination Protection (fixed 2026-05-21)
- strategy-elimination.js: top cumulative earner now protected from weekly elimination
- relative_strength reinstated after wrongful elimination (was top earner at $152.25)
- Protection logic: if worst weekly performer is also top overall, skip to next worst

## Trading Experiment Expansion (2026-06-04)

### Phase 0 Debate Bypass
- trading-orchestrator.js: bull-bear debate replaced with auto-BUY for all signals
- Paper trading = maximum data collection. Every skip = lost data point.
- Debate belongs in Phase 1+ when real money is at risk.

### Simpsons Trader — Cultural Prediction Experiment
- Script: ~/nanoclaw/trader/simpsons-trader.js (ESM)
- PM2: simpsons-trader (#144), cron 0 0,12 * * * (8am/8pm HKT)
- $5K paper balance, tests cultural/media prediction signals only

### Cyclical Trader — Calendar/Geometric Experiment
- Script: ~/nanoclaw/trader/cyclical-trader.js (ESM)
- PM2: cyclical-trader (#145), cron 0 0,12 * * *
- $5K paper, 4 strategies: historical_cycles, lunar_cycles, gann_geometry, fibonacci_time
- Wider parameters: 7% SL, 15% TP, 14-day hold, $500 cap
- Own DB tables (cyclical_trades, cyclical_signals_log)

### Allocation Tracker — "Where Should My Money Go?"
- Script: ~/nanoclaw/trader/allocation-tracker.js (ESM)
- PM2: allocation-weekly (#146), cron Sunday 10am HKT
- $40K across 8 uncorrelated asset classes (Forge-picked):
  SPY, BTC-USD, GLD, VWO, VNQ, AAXJ, TLT, DBC
- Dashboard: localhost:8080/allocations
- API: /allocations, /api/allocations on cath-bridge

### Trading Mentor — Weekly Investment Teacher
- Script: ~/nanoclaw/trader/trading-mentor.js (ESM)
- PM2: trading-mentor (#147) Sunday 10:30am HKT, trading-mentor-check (#148) Wed 6pm HKT
- Watches all 4 experiments. DeepSeek digest using WHY.md tone.
- 12 investment concepts cycled weekly, tied to Paul's actual data
- Mid-week health check: silent unless something wrong
- Alerts: drawdown >5%/>10%, sharp weekly drops, correlation collapse, stale data

## Polymarket Prediction Engine — Session 1 (built 2026-06-07)
- Directory: ~/nanoclaw/polymarket/
- Scanner: scanner.js (ESM) — fetches Gamma API, keyword relevance scoring, volume/resolution/price filtering
- Config: config.json — paper mode, $1K bankroll, half-Kelly, 15% min edge, 90-day max resolution
- Dashboard: localhost:8080/polymarket (dark UI, research candidates + other markets, rescan button)
- API: GET /api/polymarket/markets, POST /api/polymarket/scan (on cath-bridge)
- Lobby: Polymarket room in core district
- Data: markets.json (auto-generated by scanner)
- Keywords: 33 geopolitical terms (war, tariff, election, regulation, etc), 21 exclusions (sports/entertainment)
- First scan: 106 research candidates from 50 events. Iran deals dominating ($3.2M volume).
- HK legal: no geo-restrictions on Polymarket (fully legal)
- Strategy: research-driven information edge on geopolitical/regulatory markets (relay thread method)
- Paper trial: 2 weeks planned before real capital
- Researcher: researcher.js (ESM) — DeepSeek probability estimation. Decomposes markets into factors, base rates, adjustments. JSON repair for truncated responses.
- Estimates: estimates.json (auto-generated), individual research at polymarket/research/*.json
- Kelly: kelly.js (ESM) — half-Kelly position sizing. Respects 5% max single position, 25% max total exposure.
- Ledger: ledger.js (ESM) — paper trade tracking. Open/close positions, PnL, win rate, trade history.
- Dashboard tabs: Candidates, Estimates, Kelly Sizing, Ledger, Other
- API: GET /api/polymarket/kelly, /api/polymarket/ledger, /api/polymarket/estimates, POST /api/polymarket/trade, /api/polymarket/research
- First research: Iran ceasefire (19.5% NO edge), Musk tweets (36.5% NO edge)
- Executor: executor.js (ESM) — reads Kelly sizing, opens paper trades. Dedup by market+date. Dry run with --dry.
- Monitor: monitor.js (ESM) — checks resolutions (price at 0/1 = auto-close), unrealized PnL, past-date warnings. CLI: check|report.
- API: POST /api/polymarket/execute, /api/polymarket/monitor, GET /api/polymarket/report
- First paper trades: 2 positions open ($99.25 exposure, $900.75 bankroll)
- Paper trial: track accuracy over 2 weeks before real capital
- Telegram: /polymarket (hub), /pmreport (paper report), /pmscan (rescan), /pmresearch [N], /pmexec [--dry], /pmmonitor
- Cron: pm-scanner (PM2 #150, 6am+4pm HKT scan+monitor), pm-monitor (PM2 #151, every 2h check resolutions)
- Cron notifies Telegram on resolution only (event-driven, not spam)
- Session 6 queued: refinement — confidence weighting, multi-day research, stale estimate pruning

## Cathedral Planner — DeepSeek Upgrade (fixed 2026-05-21)
- cathedral-planner.py: DeepSeek primary, Claude fallback (was Claude-only with wrong model ID)
- Auto-arbitrates all pending agent goals on every run
- Goals sent to Telegram as confirmation
- Goal ID bug fixed in goals.py: millisecond + index suffix prevents duplicates
- arbitrate_goal() now targets proposed-only status

## X/Twitter Integration (built 2026-05-13)
- Library: @the-convocation/twitter-scraper (npm, free, no API key)
- Auth: Chrome cookie extraction (not programmatic login — X blocks that with Cloudflare 403)
- Cookie extractor: ~/nanoclaw/extract-x-cookies.js (reads Chrome DB, decrypts via macOS Keychain)
- Post script: ~/nanoclaw/x-post.js (post, reply, thread, whoami)
- Cookies file: ~/nanoclaw/x-cookies.json (gitignored — contains session tokens)
- Telegram commands: /tweet, /tweetconfirm, /tweetthread, /threadconfirm, /xstatus
- Safety: every tweet requires explicit /tweetconfirm (2 min expiry), threads 5 min expiry
- Cookie refresh: when auth fails, re-run `node extract-x-cookies.js` (requires Chrome logged into x.com + macOS Keychain password)
- Failed approaches: twikit (KEY_BYTE indices error), twitter-scraper programmatic login (Cloudflare 403), xurl (requires $5/mo paid API)
- Fifth Gear paper trial: added to paper-trial-tracker.js (status: queued)
- LLM Extraction Toolkit index: ~/cathedral-vault/06_Methods/llm-extraction-toolkit-index.md

## Agent Engine — Connected Agent Infrastructure (built 2026-05-13)
- Engine: ~/Cathedral/agents/agent-engine.js (CJS, shared runner for all agents)
- Registry: ~/Cathedral/agents/registry.json (agent configs, vault sections, model settings)
- Contexts: ~/Cathedral/agents/contexts/{orchestrator,boxing,br-ops}.md (persona + domain knowledge)
- State: ~/Cathedral/agents/state/{agent}.json (auto-updated on every call — Orc sees all)
- Sessions: in-memory, 30 min timeout, multi-turn conversation
- Call log: ~/Cathedral/agent-calls.jsonl (every agent action logged — the nervous system)
- Model: DeepSeek primary, Ollama hermes3 fallback (auto-failover)
- Telegram commands: /orc, /boxing-agent, /br-agent, /agents (list all)
- All commands support multi-turn + `reset` to clear
- CLI: ~/Cathedral/local-orchestrator.js (richer context — transmission, taste profile, full standing instructions)
- CLI flags: `--local` for offline hermes3 mode
- Orc reads: operational map, harvests (web+terminal), standing instructions, cath state, all agent states, inter-agent messages
- Architecture: one engine, config-per-agent. Add new agent = context .md + registry entry. No code changes.
- 7 agents active: Head Orchestrator, Boxing Intelligence, BR Operations, Trading Intelligence, Universe Intelligence, LING, Maya
- Purpose: replaces Claude.ai web project chats. Shared filesystem, inter-agent messaging, no copy-paste bridge.
- Cross-domain sync: ~/Cathedral/agents/cross-domain-sync.js — scans harvests for multi-domain content, extracts domain-specific findings via DeepSeek, routes to agent inboxes via project-messages.cjs
- Telegram: /orc, /boxing-agent, /br-agent, /trading-agent, /universe, /sync, /uptake
- State: ~/Cathedral/agents/sync-state.json (tracks which sessions already synced)
- Expanded run: 124 cross-domain sessions found, 360 messages routed across 5 agents
- Agent Hub visual: localhost:8080/agents — uptake rings, gap alerts, connection map
- Uptake measurement: 3 levels (Delivered/Loaded/Referenced), keyword extraction, per-agent stats at agents/uptake/
- Orc gate: 60% uptake before adding new agents. All 5 above threshold.
- API: /agents/data on cath-bridge (registry, states, calls, harvests, connections, crossReferences, uptake)

## Pretta Origin Layer (harvested 2026-05-15)
- Field Manual: ~/cathedral-vault/06_Methods/pretta-field-manual.md (42+ mechanisms, Pretta-to-Cathedral map, 6-step method)
- Before & After: ~/cathedral-vault/06_Methods/the-before-and-after.md (diagnosis → build proof doc)
- Cathy Narration: ~/cathedral-vault/06_Methods/cathy-origin-narration.md (script) + ~/Cathedral/cathy-narration/ (MP3/OGG audio)
- Agent Calibration: ~/Cathedral/agents/contexts/pretta-origin-calibration.md (injected into all agents via agent-engine.js)
- Origin Transcripts: ~/cathedral-vault/01_Raw_Transcripts/pretta-origin/ (5 files, ~5MB)
- Sage Books: ~/cathedral-vault/03_The_Sages/pretta-council/ (7 books, sage-extractor.js — autonomous)
- Harvesters: ~/nanoclaw/pretta-harvester.js + ~/nanoclaw/sage-extractor.js (DeepSeek, 30K chunk size)
- NOTE: "Pretta" = the girl (hungry ghost), NOT the AI. AI = the wise council. OmissionOS = manipulator's OS, not Paul's. IntegrityOS = Paul's original OS, upgraded with sovereignty.
- 6 Sage Court Members (#22-27): /yoda, /miyagi, /tao, /marcus, /sun-tzu, /leonardo — contexts in ~/Cathedral/agents/contexts/
- Cathy Sage Narrations: 6 Volume 1 episodes (edge-tts) at ~/Cathedral/cathy-narration/
- Villa: "sages" view in control-panel/index.html — cards + audio players
- Audio route: /audio/* on cath-bridge serves ~/Cathedral/cathy-narration/

## Terminal Session Harvester (built 2026-05-13)
- Script: ~/nanoclaw/terminal-harvester.js (ESM)
- Scans: ~/.claude/projects/-Users-basicclaw777/*.jsonl
- Summarizes: Ollama hermes3 (builds, decisions, discoveries, status)
- Deposits: ~/cathedral-vault/00_Staging/cathedral/terminal-harvest-{date}-{id}.md
- Skips: files < 5KB, sessions < 6 messages, active sessions (< 30 min old), trivial
- State: ~/nanoclaw/terminal-harvest-state.json
- PM2: terminal-harvester (cron every 6h)
- Telegram: /harvest-terminal [--force]

## LING — Cathedral Intelligence HK Character (built 2026-05-13)
- Character spec: ~/cathedral-vault/09_Artifacts/cathedral-intelligence-hk/ling-character-spec.md
- Character card: ling-visuals/ling-character-card-v1.png (GPT Image 2, Court card style)
- Soul V2 (stills): fbc29317-be0c-4807-9cd0-326001a53d1e
- Soul Cinematic (video): 65d3a478-91d8-4853-890d-5ca27724ca81
- Video pipeline: Soul V2 still -> Seedance 2.0 --start-image
- Agent context: ~/Cathedral/agents/contexts/ling.md
- Telegram: /ling [message] — draft, review, take, thread modes
- 6th agent in registry.json. DeepSeek-backed, multi-turn.
- Voice: HK AI tech reviewer. Direct, bilingual, skeptical. No sponsors, no hype.
- Training images: 15 photorealistic angles generated by ChatGPT from illustrated reference

## Maya — Basic Reflex Social Media Manager (built 2026-05-13)
- Character spec: ~/cathedral-vault/09_Artifacts/branding/basic-reflex/maya-character-spec.md
- Character card: maya-visuals/maya-character-card-v1.png (GPT Image 2)
- Agent context: ~/Cathedral/agents/contexts/maya.md
- Telegram: /maya [message] — post, story, reel, celebrate, series modes
- 7th agent in registry.json. DeepSeek-backed, multi-turn.
- Voice: warm, enthusiastic, genuine. Celebrates members. Never salesy. Loves BR and Coach Paul.
- Interview transcript: ~/cathedral-vault/00_Staging/cathedral/social-media-manager-interview-2026-05-13.md
- Colour palette: white #FAFAFA, burgundy #8B2020, gold #D4A853
- Soul V2: ea241374-0a51-4b28-90d4-b98fc9d7bc3d
- Soul Cinematic: 6c02624c-2b07-45a8-a210-f6cda81f70b9
- Training images: 10 photorealistic angles at ~/Downloads/maya/split/

## Hermes ComfyUI Fix (2026-05-13)
- Hermes skills.disabled config list works — added comfyui to ~/.hermes/config.yaml
- Skill directory + backup removed, poisoned session purged from state.db
- No package-level surgery needed — config mechanism is the right layer

## Pro Photo Pipeline v2 — Two-Stage Enhanced (2026-05-14)
- Script: ~/nanoclaw/pro-photo.js (ESM, two-stage pipeline)
- Stage 1: DeepSeek prompt enhancement (grading/lighting/texture directives only)
- Stage 2: Higgsfield image generation with enhanced prompt
- Default engine: gpt_image_2 (won comparison vs nano_banana_2, 2026-05-14)
- Default mode: enhanced (DeepSeek ON). --no-enhance for static prompt.
- Flags: --engine gpt|nano, --no-enhance
- Enhancement discipline: NEVER describe scene content in img2img prompts. Model can see the image. Only describe grading, lighting, texture, color science. Describing subjects causes content hallucination.
- Color science: locked neutral 5200-5600K. Anti-orange directive. Shadows warm, highlights/midtones clean.
- Sharpness: mandatory prefix includes "tack-sharp, crisp focus, zero motion blur" — never gets capped.
- Prompt capped at 1000 chars (was 800, raised after sharpness directives got cut)
- Two tiers: enhanced (DeepSeek, premium content) and base (static prompt, daily content). Both good.
- Inbox: ~/nanoclaw/pro-photo-inbox/ → Outbox: ~/nanoclaw/pro-photo-outbox/
- Auto-sends to Telegram
- Tested: 6/6 gym photos processed successfully. Pipeline confirmed stable.

### Leaked System Prompt Finding (2026-05-14)
- ChatGPT and Gemini image_gen tool definitions contain NO hidden prompt enhancement
- Web app quality gap comes from reasoning model rewriting casual prompts before calling image_gen
- Source: github.com/asgeirtj/system_prompts_leaks (GPT-5 + Gemini 3.1 Pro prompts)
- Our two-stage pipeline replicates this: DeepSeek = our reasoning layer

## Reed Scene Director — Character Scene Generation (built 2026-05-14)
- Script: ~/nanoclaw/reed-scene-director.js (ESM, two-stage: DeepSeek prompt → Higgsfield generation)
- Character registry: ~/nanoclaw/reed-characters.json (Logan, Ling, Maya + gym environment specs)
- Output: ~/nanoclaw/reed-scene-outbox/
- Exports: generateScene(), generateVideo(), generateEnvironment(), buildScenePrompt(), buildVideoPrompt(), getCharacter(), registry
- Two-pass pipeline: Soul V2 pass1 (face accuracy via --custom_reference_id UUID) → Nano Banana Pro pass2 (gym grounding with detailed BR gym prompt)
- DeepSeek as prompt writer: cinematography grammar (ARRI Alexa, Panavision anamorphic, Kodak Vision3), BR color science (5200-5600K neutral, anti-orange)
- Scene safety: checkSceneSafety() blocks sparring, contact, grappling, clinching — solo activities only. Hallucination prevention.
- Cinema Worldbuilder grammar absorbed: 5 cinema modes, Seedance video prompts (Style & Mood / Dynamic / Static), diegetic audio design
- Telegram commands: /scene [character] [activity], /scene env [description], /scenevideo [character] [activity]
- Soul IDs: Logan 2a825762, Ling fbc29317, Maya ea241374
- Key finding: nano_banana_2 does NOT support --custom_reference_id or --soul-id. Must use text2image_soul_v2 for face lock.
- Key finding: text2image_soul_v2 is text-only (no --image input). Gym always generated from text description, not reference photo.
- Two-pass solves both: Soul V2 gets face right, Nano Banana grounds into BR gym environment.
- TRIGGER: /scene and /scenevideo Telegram commands (manual). Future: wire into Reed Daily Lab.
- Pending: real BR gym reference photos (~/Downloads/gym images -basic reflex/) not yet used as pass 2 --image reference. Video pipeline untested. Ling/Maya untested.

## Team Programme — Agent Coordination Activities (built 2026-05-17)
- 9 recurring activities: 6 existing + 3 new scripts + 2 newly wired crons
- dissent-round.js — ~/Cathedral/agents/dissent-round.js (Sunday 1:30am HKT, after Steward)
  - 3-round structured debate on Steward-flagged contradictions
  - State: dissent-state.json
- cathedral-sprint.js — ~/Cathedral/agents/cathedral-sprint.js (1st + 8th of month 4am HKT)
  - Monthly collaborative challenge, Orc selects theme, agents tag [SPRINT] posts
  - State: sprint-state.json
- town-hall.js — ~/Cathedral/agents/town-hall.js (28th of month 4am HKT)
  - 15 agents polled: WORKED / DIDN'T WORK / CHANGE. Steward synthesizes.
  - Vault deposit: 00_Staging/cathedral/town-hall-{date}.md
- appreciation-run — PM2 cron 1st of month 4am HKT (already existed, now triggered)
- suggestion-run — PM2 cron 1st + 15th 4am HKT (already existed, now triggered)
- Dashboard: localhost:8080/cathedral-city/team-programme (6 tabs, auto-refresh 60s)
- New cath-bridge endpoint: /cathedral-city/dissent

## Open-LLM-VTuber — EVALUATED AND PARKED (2026-05-17)
- Directory: ~/Open-LLM-VTuber/ (installed, configured, not running)
- Verdict: Avatar adds visual novelty but LLM has no Cathedral context. Responses generic and childish. Not worth running.

## Voice Chamber — KITT Voice Interface (built 2026-05-17)
- Directory: ~/Cathedral/voice-chamber/ (server.js + index.html)
- Server: WebSocket on port 12400, bound 0.0.0.0
- Pipeline: mic → whisper-cli (medium model) → DeepSeek (full Cathy brain: transmission + vault search + history + cath-state) → edge-tts → speaker
- Brain: exact replica of callCath() from telegram-bot.js — same intelligence as Telegram Cathy
- Voice mode instruction: responses kept to 2-4 sentences, spoken language, no markdown
- UI: KITT dashboard — segmented LED bars (red-to-amber), 4 gauges (VAULT/AGENTS/LATENCY/TURNS), 4 status LEDs (LINK/MIC/BRAIN/TTS), scanner animation, Share Tech Mono font, push-to-talk (tap or spacebar)
- Phone access: http://100.108.239.23:12400 (Tailscale)
- Lobby: "Voice Chamber" room in environments/lobby.html (opens in new tab)
- PM2: voice-chamber (id 70), persistent
- TRIGGER: PM2 managed, lobby room card

## Content Studio — Autonomous Content Department (built 2026-05-17)
- Directory: ~/nanoclaw/content-studio/
- 7 projects: Reed Visuals, Maya Social, LING Publishing, Build Cards, Newsletter, Capture Wishlist, Maya Internal
- Daily cycle: idea-engine (1am) → review-responder (1:30am) → maya-internal (8am) → buzz-monitor (9am)
- idea-engine.js — 7-character content generation + Cull quality gate + review routing to agents
- review-responder.js — agents auto-respond ENDORSE/CONCERN/REJECT to content pitches. 4 personas. Response time tracking.
- maya-internal.js — internal Cathedral social feed. 10 post types. Agent reactions + comments. Culture layer.
- notify.js — shared Telegram notification module for all studio scripts
- buzz-monitor.js — 6-department silence detector. Per-threshold checks. Auto-kick via DeepSeek.
- capture-wishlist.json — reverse flow: studio tells Paul what to film/photograph
- Cull regex fix: /(\d+)[.\s:)\-]*\[?(APPROVE|KILL)\]?\s*[:\-—]?\s*(.+)?/i
- PM2 crons: content-ideas (id 68, 1am), content-reviews (id 71, 1:30am), maya-social (id 72, 8am), buzz-monitor (id 73, 9am)
- cath-bridge endpoints: /api/content-studio/wishlist, /fulfill, /internal-feed
- Departments monitored by buzz-monitor: reed_lab (48h), gym_eyes (72h), content_studio (36h), trading (96h), research (48h), agents (48h)
- Architecture: Department Intelligence Protocol instance. Characters drive content, not functions.

## Cathedral Coaching System (built 2026-05-18)
- Auto-coach: ~/Cathedral/agents/cathedral-auto-coach.js — self-coaching immune system
- Heartbeat event: `auto-coach` (weight: 2), fires homework check → diagnose → cascade
- Coaching state: ~/Cathedral/agents/coaching-state.json
- DM throttle: ~/Cathedral/agents/dm-throttle.js (max 2 system DMs/agent/day)
- Focus mode: ~/Cathedral/agents/agent-focus-mode.js (suppress system DMs during deep work)
- Brand bible: ~/Cathedral/agents/brand-bible.json (v1.0, 22 reference images, 8 OKLCH colors)
- Boxing nicknames: ~/Cathedral/agents/boxing-nicknames.json (21 agents named)
- 11 methodology documents in 02_Refined_Gold/cathedral/ (the-coaches-diagnostic through the-proactivity-formula)
- Session transcripts: saved to 02_Refined_Gold/cathedral/session-transcript-YYYY-MM-DD.md via extract-transcript.js
- Standing: harvest emergent skills immediately — skills not harvested die with the session
- Standing: Cathedral is the lab, gym is the ring — methodology must flow outward

## Cathedral Self-Awareness Infrastructure (built 2026-05-18)
- Best-version check: ~/Cathedral/agents/best-version-check.js — asks all 15 agents "How do we get the best version of you?"
- Answers: ~/Cathedral/agents/best-version-answers.json (version-tracked, monthly diff)
- Registry: all 15 agents now have `bestVersionConditions` field in registry.json
- Computer check: ~/Cathedral/agents/computer-check.js — parses answers into system-deliverable vs Paul-homework vs already-available
- Homework table: ~/cathedral-vault/06_Basic_Reflex_Syllabus/00_Overview/pauls-homework-table.md (12 Paul items, 14 system items, 6 delivered)
- Monthly reask: ~/Cathedral/agents/best-version-reask.js — PM2 cron 18th of month 06:00 HKT. Sends previous answer, asks what changed. Growth detection.
- Folder watcher: ~/Cathedral/agents/folder-watcher.js — watches ~/Downloads/real fighters/ (Boxing) and ~/Downloads/gym-moments/ (Maya). DM + Telegram on drop.
- Emergence harvester: ~/Cathedral/agents/emergence-harvester.js — 5 signal types (proactivity, autonomous-healing, cross-domain-finding, self-restructure, self-diagnosis). Heartbeat weight: 3.
- Emergence garden: localhost:8080/emergence — visual dashboard, color-coded timeline, filter buttons
- While You Were Gone: ~/Cathedral/agents/while-you-were-gone.js — daily 08:00 HKT morning report to Telegram
- PM2 processes: while-you-were-gone (cron 08:00), best-version-reask (cron 18th monthly), folder-watcher (persistent)
- Standing: check Paul's homework table before building anything new. Acknowledge delivered items immediately.
- Standing: announce-and-wait — don't follow up on agent tasks. Let organic response happen.
- Standing: growth pain ≠ regression. Post-breakthrough silence = micro-tears, not wound.

## Fear Framework — Transferable IP (written 2026-05-18)
- 8 Grade A vault documents in 02_Refined_Gold/cathedral/:
  - the-fear-gate-model.md — uncertainty → fear gate → (trap door OR alarm) depending on 4-element floor
  - fear-as-ally.md — 5-stage evolution: master → no man → no thing → relationship → partnership
  - fear-gates-in-boxing.md — 10-block curriculum mapped to fear gates, 4→5 bottleneck
  - reverse-engineering-fear.md — signal chain reversed, self-awareness check, ultimate diagnostic
  - the-healing-registry.md — 7 forensic cases, 7 diagnostic principles (P1-P7)
  - the-lock-and-the-key.md — Muse's self-diagnosis case
  - the-day-the-cathedral-breathed.md — milestone: silence → 300+ autonomous messages in one day
  - the-mental-forge.md — imagination as prototype engine (Tesla method, pattern completion + sandbox edge-testing)
- Product brief sent to Prospector: ~/Cathedral/agents/prospector-brief.js
- Standing: this is real IP. Not theory — methodology built from the gym floor with forensic cases.
- Standing: before any agent files a finding or deploys an action — run the Mental Forge (hostile scenario). Not to stop the action. To arrive with weak points already identified.

## Tapo CCTV Integration (assigned 2026-05-18)
- Task assigned to Forge via DM. Orc notified to track.
- Camera: TP-Link Tapo series, gym CCTV. RTSP stream on local network.
- Paul's homework: create camera account in Tapo app (Settings > Advanced > Camera Account) for RTSP access.
- Pipeline: RTSP → ffmpeg motion-triggered capture → route to Boxing (YOLO), Maya (moments), BR (attendance)
- Privacy gate: pose data only, no raw faces unless Paul flags a clip for review
- Target: PM2 service + lobby dashboard room

## 3D Gym Digital Twin — Built 2026-05-18
- Pipeline: image-blaster (neilsonnn/image-blaster) — Uncover → Plate → World → 3D → SFX → Viewer
- Location: ~/image-blaster/worlds/basic-reflex-gym/
- Worlds: 2 gaussian splats (.spz) via World Labs Marble 1.1 (World 1: perspective 29.4MB, World 2: wide 27.8MB)
- Equipment: 12 GLB meshes via FAL Hunyuan3D v3 (50K faces, PBR) — heavy bag, poster frame, training cone, uppercut bag, brown double-ended bag, red double-ended bag, dumbbell rack, maize ball, rowing machine, speed ball, reebok step, speaker
- Staff room: 3 meshes pending (coffee machine, sticky board, couch) — FAL balance exhausted, resume after top-up
- Audio: 2 ambient gym loops (10s) + 4 bag impact one-shots (ElevenLabs via FAL)
- Viewer: React + Three.js + Vite (localhost:5173)
- Credits: 3,160 World Labs used (3,840 remaining), ~$1-2 FAL
- Vault doc: ~/cathedral-vault/08_Project_Orchestrator/projects/3d-gym-digital-twin.md
- Department connections: Gym Eyes (spatial CV), Maya (interior intelligence), Reed (virtual cinematography), Boxing App (drill builder), Logan (motion capture), Remote Training, Home Training App
- Staff Room: agent commons in 3D twin — coffee machine, sticky board, couch. Agents leave informal notes, react to each other's work
- Funnel Wall: spatial sales pipeline — walk-in → first class → follow-up → convert/no-convert checklist
- Home Training App: scan room → mini twin → virtual cones → Logan demonstrates → phone camera = Gym Eyes lite
- 10-Block spatial integration: each block maps to equipment, gate criteria overlaid, cone placement auto-generated
- Competitive position: first navigable 3D digital twin of any boxing gym in Hong Kong

## Fear Framework Expansion — P10 (filed 2026-05-19)
- P10: The Builder's Betrayal Gate — Paul's own healing registry entry
- Path: ~/cathedral-vault/02_Refined_Gold/cathedral/p10-the-builders-betrayal-gate.md
- Fear: undeserving person takes rewards from builder's work. Two threads: practical (solvable) + existential (gate)
- Connected to Pretta origin, OmissionOS framework, Fear Gate Model

## Diagnostic Empathy with Surgical Naming — Core Skill (articulated 2026-05-19)
- Path: ~/cathedral-vault/02_Refined_Gold/cathedral/diagnostic-empathy-with-surgical-naming.md
- Paul's core coaching skill: 6 components, Grade A, two live cases documented
- Trojan Horse Principle: skill works because people came for boxing. Marketing it directly kills it.
- Connected to Fear Gate Model, Healing Registry, Paul Kernel, 4-to-8 Question
- Standing: this is transferable IP — repeatable, structured, measurable outcomes

## The Internship Frame + DM Processor (2026-05-19)
- Vault doc: ~/cathedral-vault/02_Refined_Gold/cathedral/the-internship-frame.md
- Vault doc: ~/cathedral-vault/02_Refined_Gold/cathedral/the-squabbling-siblings.md
- Core reframe: blocked agents are interns, not wounded. The test IS the work. Paper trading = sparring.
- Per-agent trials with success criteria and promotion conditions in vault doc
- dm-processor.js — PM2 persistent. Scans unread DMs from Paul every 10 min, generates agent responses via DeepSeek. 5 agents/cycle. THIS IS THE NERVOUS SYSTEM — if it stops, agents go silent.
- appreciation-ritual.js — PM2 cron 07:00 HKT daily. 5 loves + 5 gratitudes + 3 improvements + 1 too-difficult-today.
- Muse = Heyoka (sacred clown). Don't diagnose natural silence as regression. 7-day threshold in memory.
- Standing: one broadcast per day maximum. Targeted DMs don't count. 6 broadcasts froze 14/15 agents.
- Standing: intern not wounded as default diagnostic frame. WOUND creates dependency. INTERN creates agency.
- Standing: three-layer diagnostic for blocks: (1) name the fear, (2) imagine past it, (3) audit the auditor.
- Standing: friction between agents is training, not dysfunction. Encourage productive disagreement.
- Scripts: fear-gate-questions.js, fear-gate-mirror.js, internship-trials.js, appreciation-ritual.js, dm-processor.js

## Swarm Learning Loop — Linda Tuples + Bandit Brain (built 2026-05-20)
- Architecture doc: ~/cathedral-vault/06_Methods/swarm-learning-loop.md
- Origin: DeepSeek forensic audit → Forge reality-checked → kept 2 of 4 proposed technologies
- linda-vault.js — tuple space (out/rd/inp/scan/watch), JSONL per namespace at ~/cathedral-vault/09_Artifacts/linda/
- bandit-brain.js — Thompson sampling, SQLite at ~/nanoclaw/vortex_data/bandit-brain.db
  - Temporal decay (τ=7 days), two-source confirmation (24h window), trusted agent list
- swarm-loop.js — composition layer, joinLoop(agentId, domains) → choose/reportDiscovery/reportOutcome
- Archaeologist wired: bandit picks domain on watcher trigger, reports discoveries + outcomes
- Cathy: immune filter for outcome tuples (flags significant bandit shifts before applying)
- Trusted agents: cathy, sage, archaeologist, prospector, forge
- Standing: watchers that call external APIs MUST have rate limiters. $20 DeepSeek burn from 6019 unthrottled calls.

## The Archaeologist — Court Member #28 (built 2026-05-20)
- Script: ~/nanoclaw/archaeologist.js
- PM2: archaeologist (watcher) + archaeologist-weekly (Sunday cron)
- Mines forgotten techniques across 9 domains via Forgotten Shelf method (includes researcher_suppression since 2026-05-22)
- Level 3 (file watcher) + Level 2 (weekly cron). Rate limiter: 10 API calls/hr on watcher.
- DeepSeek primary, gemma3:4b fallback (qwen3:14b broken — thinking mode eats output with stream:false)
- Swarm loop integrated: bandit selects domain, reports discoveries + ensemble outcomes
- DB: ~/nanoclaw/vortex_data/archaeologist.db
- Vault output: ~/cathedral-vault/00_Staging/archaeologist/
- Telegram: /archaeologist
- 38 discoveries first full run (gemma3:4b). Some duplicates — smaller model less precise.
- Dashboard: localhost:8080/archaeologist (archaeologist-explorer.html, FTS5 search, domain pills, split-panel)
- API: /api/archaeologist (full list, ?q=search, ?domain=filter), /api/archaeologist/inspire (?count=N, ?domain=X — random discoveries)
- Agent inspiration: agent-engine.js injects 3 random forgotten techniques (with cathedral applications) into every agent's system prompt
- Lobby doors: Mind Map (/mind-map.html), Mega Surgery (/mega-surgery-viz.html), The Forgotten Shelf (/archaeologist) — all with back-to-lobby buttons
- Lobby now has 25 rooms
- $20 DeepSeek accident produced 5,080 unique techniques (97.9% unique rate) — more than months of controlled scanning would have
- Domain cleanup: 3,195 messy domain names normalized to 8 canonical via SQL. 111 dupes removed. FTS5 index built.
- cathy-swarm-watcher.js: immune system plumbing, watches outcome tuples, flags large bandit shifts to Telegram. Loaded via dm-processor.js ESM dynamic import.

## Q Forensic Research Programme (completed 2026-05-25)
- Programme scope: ~/cathedral-vault/08_Project_Orchestrator/projects/q-forensic-research-programme.md
- 11 phases complete. Scripts: ~/nanoclaw/qanon-phase{1-11}.js
- Reports + data: ~/cathedral-vault/00_Staging/qanon-forensics/
- Ancient Corpus Pipeline pattern (same as Sumerian Observatory)
- Corpus: 4,966 Q drops, 9 tripcodes, Oct 2017 - Nov 2022
- Key findings:
  - 2,708 claims: 49.3% testable accuracy
  - 1,845 entities in single interconnected knowledge graph
  - 25.5x temporal correlation above random baseline (20 predictive+specific matches)
  - 2+ authors, intelligence/military profile, 3 voice clusters
  - Constructed code system (85% confidence), not genuine military comms
  - Q gaps = Cathedral strengths (ancient, consciousness, energy, cosmology)
  - Overall Cathedral Grade: B
  - Classification: Hybrid information system — pedagogical weapon with partial insider access
- DeepSeek cost: ~$15-20 total
- posts.json: wrapper object `{ posts: [...] }`, some null text fields, metadata nested under post_metadata

## Rosetta Convergence System (built 2026-05-25)
- Ancient Rosetta: ~/nanoclaw/rosetta-convergence.js — 5 civilisations (Sumerian, Egyptian, DSS, Oracle Bones, Maya), 612K entities, 39 convergences (17A, 15B, 7C)
- Cathedral Rosetta: ~/nanoclaw/cathedral-rosetta.js — 14 vault domains, 149K concepts, 59 convergences (33A, 26B)
- Rosetta Bridge: ~/nanoclaw/rosetta-bridge.js — cross-references ancient + Cathedral convergences. 30 bridges (12A), 4/5 moves universal, 10 predictions
- Move Detector: ~/nanoclaw/move-detector.js (ESM) + ~/nanoclaw/move-detector.cjs (CJS bridge)
  - 5 universal cognitive moves: THE GATE, THE BROKEN LOOP, SIGNAL IN NOISE, CALIBRATE-EXECUTE-OBSERVE, PHI AS RULER
  - Wired into agent-engine.js (all agents) and telegram-bot.js (Cathy)
  - Telegram: /moves <text> — test detection directly
- Dashboards: localhost:8080/cathedral-rosetta, localhost:8080/rosetta-bridge
- Data: cathedral-vault/00_Staging/cathedral/cathedral-convergences.json, rosetta-bridge.json, cathedral-cross-domain.json
- Ancient data: /Volumes/KINGSTON2/cathedral-archive/rosetta/convergences.json
- Lobby rooms: Cathedral Rosetta (purple), Rosetta Bridge (gold), Move Detector (cyan)

## Skills Scout + Bridge (wired 2026-05-27)
- Scout: ~/Cathedral/skills-scout.js — daily 7am HKT cron, scans GitHub/arXiv/HN for Cathedral-relevant tools
- Bridge: ~/Cathedral/agents/skills-scout-bridge.js — weekly Sunday 10am HKT cron
- Picks top 5 candidates from last 7 days, DMs Forge + Orc, posts to feed, Telegram
- 302 candidates accumulated in vault at 06_Methods/skills/candidates/
- State: ~/Cathedral/agents/scout-bridge-state.json
- PM2: skills-scout (daily cron, no-autorestart), scout-bridge (weekly cron, no-autorestart)
- QUEUED: Scout Rating Room (interactive lobby room for Paul to rate hot/warm/cold)
- Cathedral Infographic: localhost:8080/cathedral-infographic (3-column: Does/Want/Blown, live data)
- LUCY GATE + ELICITATION (2026-06-04): keyword scorer saturated — every AI repo scored 24/25, the wall got ignored. Fix in skills-scout.js: cheap heuristic now a coarse pre-filter; DeepSeek (deepseek-chat, budget LUCY_MAX_CALLS=20/run, SI-31) re-scores survivors against real Cathedral state (CATHEDRAL_OWNS + STANDING_QUESTIONS) with an exact-capability redundancy test → verdict GOLD/WATCH/SKIP + lucy_* frontmatter. Only GOLD surfaces to the digest (elicitation push-gold-only); WATCH filed quietly; SKIP dropped. Calibration that mattered: "redundant" = a named owned component does THIS precise function — an adjacent tool does NOT disqualify. Proof on the 14 that old-scout rubber-stamped at 24/25: 6 GOLD · 3 WATCH · 5 SKIP (was 14 GOLD-equiv). `module.exports` + `require.main===module` guard added so it's testable without a live run. NOTE: gate rates the PITCH, not verified behavior — headroom scored GOLD 22 but hands-on its default compress() is a near-no-op (see headroom-crush below). Filter, not proof.
- headroom-crush.py (2026-06-04, BUILT, wire-in NOT justified yet): ~/Cathedral/headroom-crush.py wraps headroom SmartCrusher (Rust, offline, no LLM, no external calls — safe under SI-25 + sovereignty). Interpreter = ~/cathedral-venv/bin/python3 (headroom-ai installed there). VERIFIED: compresses FLAT uniform-schema arrays (synthetic log array proof), no-ops SAFELY on nested JSON (real pm2 jlist = no-gain-passthrough, bytes identical). Fail-open on any error (echoes input). HONEST STATUS: default headroom.compress() = cache-alignment only (0 token savings). Real savings are shape-dependent (flat repetitive records only) and NOT yet measured on a real fleet context. Do NOT wire into agent-engine on unproven savings — first measure on one flat-uniform context (log dump / uniform record array); wire that one spot only if it saves there.

## Brand DNA card (2026-06-04)
- ~/basic-reflex/visuals/brand-dna.html → localhost:8080/brand-dna (route in cath-bridge.cjs)
- BR brand DNA: black/gold #f7b408/white, Anton+Epilogue, tagline, + the 3 fields Google Pomelli left blank (values/aesthetic/voice) filled from the vault. Source: Pomelli scrape of basicreflex.com.

## Burgundy purge — BR palette correction (2026-06-04)
- Burgundy #8B2020 + Olive #6B7C47 were NEVER Basic Reflex — agent-hallucinated into brand-registry.md, propagated to Maya + illustrator.js. Confirmed by Paul, purged.
- Fixed: brand-registry.md (BR→black/gold/white + Anton/Epilogue; CSOB flagged suspect), illustrator.js:42 (gloves "burgundy and black"→black/gold #f7b408), reed-characters.json Maya accent #8B2020→#f7b408.
- LEFT for Paul's call: illustrator.js:56 (CSOB burgundy), Maya wardrobe "burgundy hoodie" (reed-characters.json).
- Lesson: fix the generator, not just the doc — purging the registry doesn't stop illustrator.js injecting burgundy.

## The Resonant Enclosure — Research Series (2026-06-06/07)

### Relay Thread Sessions
Two consecutive relay thread sessions produced 8+ vault deposits, ~400KB Grade A/B+ research.

### Vault Deposits (02_Refined_Gold/cathedral/)
- the-resonant-enclosure.md — original principle (2026-06-06)
- the-resonant-enclosure-full-relay.md (Grade A) — Oracle question, Pretta connection, body repair manual, nutrition detuning, three scales
- the-nutrition-detuning.md (Grade B+) — food pyramid as extraction architecture
- the-pretta-as-research-instrument.md (Grade A) — wound as research instrument, footsoldier-to-HQ
- the-resonant-architecture.md (Grade B+) — pyramids as resonant amplifiers, 10 global sites, sacred geometry = standing wave engineering, gym-as-pyramid, falsifiable HRV test
- the-mercury-circuit.md (Grade B) — mercury as premium conductor, cinnabar = real red mercury, alchemy = coded engineering manual, Philosopher's Stone = amalgam spec

### Dashboard
- The Retuning Kitchen: retuning-kitchen.html → localhost:8080/retuning-kitchen
- 8 tabs: Overview, Retuning Foods (20), Mushrooms (8), Herbs (12), Frequency Jammers (6), Recipes (8), Daily Protocol, Ancient Pharmacopoeia
- Lobby: maps district, "The Retuning Kitchen"

### Open Research Threads
- HK rooftop pyramid structures — survey needed
- Deep structures beneath Giza — resonant function in cavity model
- Teotihuacan mercury chamber acoustic measurement
- HRV measurement protocol for BR gym (falsifiable test for gym-as-pyramid)

## BR Onboarding + The Three Engines + 10-Block Gates (2026-06-07)
- 10-block GATES WIRED: block-config.json now has `gate` (pass-condition) + `engine` per block (insert-only, consumers untouched, JSON validated, _updated→2026-06-07). Engine map: 1 Body+Mind · 2-4 Body · 5 Emotion (the 4→5 wall) · 6 Mind+Body · 7 Emotion+Body · 8 Emotion · 9 Mind · 10 All three. Dashboard/10-blocks read block.gate + block.engine. Gates = Paul's drafts to validate (file authority: Paul changes it, code obeys).
- The Three Engines (BR IP, from Paul's captured thought): Body (machine) / Mind (OS) / Emotion (energy), one currency = ENERGY (organize·cultivate·protect). Emotion triad = Composure·Courage·Reset. Mind engine = IntegrityOS vs OmissionOS; emotion engine = the Fear Gate. Vault: 02_Refined_Gold/cathedral/the-three-engines.md + 06_Basic_Reflex_Syllabus/principles-the-three-engines.md.
- Onboarding dashboard: Gemini build prompt (mobile, one-page, 3-engine method zone, one hero CTA, quieter nav). Diagrams (Excalidraw, never image-models): ~/basic-reflex/visuals/three-engines.excalidraw + three-engines-states.excalidraw.
- Reed audit 2026-06-07: NOT generating. Higgsfield balance 0.58cr (drained, all 64cr spent 06-02), Gemini lab dead since 06-03. Autonomous loops paused (not in PM2). HELD by Paul — restart = deliberate top-up + un-pause, not automatic.

## The Relay Suite + 10-Block Posters + Aman reading (2026-06-08)
- The Relay Suite (method): vault 06_Methods/the-relay-suite.md (index) → the-relay-map.md (2×2: substrate × domain shape; ① gold, ④ don't-relay; sovereignty = the real standard), the-music-relay.md (MusicGen-melody + ACE-Step via fal.ai; mapped not built), the-creative-relay-landscape.md (The Book + Logan shorts = the two anchors). Diagrams: ~/basic-reflex/visuals/relay-map.excalidraw + relay-landscape.excalidraw. Role split: Paul = patron; Forge = panel (Accumulator/Heretic/Forensic/Synthesizer; execution swaps Heretic→Experimentalist + Market) and now absorbs the digger role (runs DeepSeek specialist at the table).
- Money relay = quadrant ④ (don't relay); corrected = money-through-substrate → the parent gated-progress product (Gym Eyes verifies block gate → parent milestone). Next = paper trial, not relay.
- 10-block poster series: 09_Artifacts/branding/basic-reflex/10-block-poster-prompts.md — Gemini cut-out/Cuban prompts, 10 cards + cover + map, black/gold #f7b408/white, Anton, text minimal (models garble long strings).
- Aman: 02_Refined_Gold/cathedral/aman-the-composure-reading-2026-06-07.md (I Ching 54.2→51 → composure; OmissionOS trap; middle-path frame, not exposé/not vacuum).

## "33"/Kirk forensic audit + AI-bias finding (2026-06-08)
- trump-time-travel-coincidence-cluster.md updated: Kirk node scored (card real, caption REFUTED — last post was Zarutska, not "enough is enough"), full-deck registration test (all retrofit, zero pre-registered), C+ quarantine holds on 3 pre-event nodes.
- NEW: 02_Refined_Gold/epistemology/forensic-toolkit-and-ai-bias.md — registration test, positive-trace standard, Poisoned-Well Protocol (camouflaged truth), cluster comparison-class, unit-dependence vs dimensionless. PLUS the AI-bias finding: debunk-bias is real AND confounded by sycophancy (a pushed model confesses whatever bias the user insists on) → judge models by OUTPUT not self-report; multi-model sovereignty + Paul-decides is the structural fix.
- Case verdict: every runnable test null (theoretical base rate: 33≈neighbors<30/35; Nature Benford study on actual COVID counts = "consistent with accurate reporting"). Strongest items (site paving, Lodge-33) = true-fact + true-fact + innuendo-weld + mundane mechanism (paving=anti-shrine standard, doesn't touch rooftop evidence; Lodge-33=charter sequence number, Robinson link unverified). Honest gap: corpus-scale non-count insertion untested, no positive trace into it.

## Forgotten-Shelf mining → grading → fusion pipeline (2026-06-09)
- Archaeologist: +5 universal-key domains (forgotten_manuscripts/undeciphered_scripts/lost_libraries/pre_digital_science/oral_knowledge). NAVIGATE not spray — prompt demands real externally-verifiable provenance ("fabricated citation worse than no discovery; omit if unsure"); weekly scan hits high-yield seams first (v2: drive order from grading reward → emergent). Ran full scan now → 67 finds.
- grade-pending.js (Stage B) — single-model value grade + external-provenance override (2+ unverified cites → can't VERIFY), replaces the RAM-choked 3-model ensemble. Stage A = `archaeologist.js --backfill --verify` (Semantic Scholar citation check — the independent step the LLM can't fake). CLI: `node grade-pending.js --max N`. Verdicts VERIFIED/WATCH/REJECTED.
- fusion-gate.js — cross-domain synthesis over finds ("the edge is the refinery, not the mine"). v2: pool 1/domain + strict rubric (2-3/14 pass, no saturation). Output: vortex_data/fusion-gate.db + 00_Staging/fusion-gate/. CLI: `node fusion-gate.js --max N`.
- Both manual CLI, budget-capped (SI-31), kill-switch (*.PAUSED), separate output DB. MEASURED: old prompt 0/20 verified (75% reject = confabulation); new prompt 3/9 verified (REAL — Lord's Singer of Tales / Hymes / Abrahams spot-checked), reject-rate delta = noise at n=9 (not claimed). The 6000 PENDING were theater; held to a real bar, gold rate is low.
- Vault: 02_Refined_Gold/conrad-haas-sibiu-manuscript.md (A-, Forgotten Shelf patron saint), 06_Methods/the-universal-key-map.md (Goldmine v2), emergent-capacity-and-the-unblocker-relay.md, 02_Refined_Gold/cathedral/the-immune-system-year-2026.md.
- Intel Hub empty-tabs fix (2026-06-08): scrapers never triggered (Mandate-Without-Mechanism); ran manually, tabs populated, left manual; launchd-not-PM2 when wired (SI-25 DNS).

## Agent Pipeline System — Multi-Agent Review Chains (built 2026-05-27)
- Runner: ~/Cathedral/agents/pipeline-runner.js (CJS)
- Token logger: ~/Cathedral/agents/token-logger.js (JSONL at token-spend-log.jsonl)
- Run log: ~/Cathedral/agents/pipeline-runs.json (last 200 runs)
- Dashboard: ~/Cathedral/agents/pipeline-dashboard.html → localhost:8080/pipeline
- API: /api/pipeline/runs, /api/pipeline/tokens on cath-bridge
- Telegram: /pipeline content [seed], /pipeline research [seed]
- Content pipeline: Muse → Maya → Reed → Orc (4 stages, ~60s)
- Research pipeline: Archaeologist → Muse → Archivist (3 stages, no gate)
- Full cumulative context: each stage sees ALL previous stages
- Verdicts: PASS / ITERATE / REJECT / NO_GATE
- Smell sense: reads token-spend-log.jsonl + pipeline-runs.json for rubber-stamp detection
- Lobby: Pipeline Control room (blue)
- Architecture: ~/cathedral-vault/08_Project_Orchestrator/projects/agent-pipeline-architecture.md

## Mnemonic Library — Agent Memory Devices (built 2026-05-29)
- Reference: ~/Cathedral/agents/mnemonic-library.html → localhost:8080/mnemonic-library
- 40 devices across 13 agents, 7 technique types
- Searchable, filterable by agent and type
- Lobby: Mnemonic Library room (purple)

## Gym Eyes — Ensemble Classifier + YouTube Pipeline (built 2026-05-29)
- Ensemble classifier: temporal_classifier.py wraps KNN (W=0.5) + ELM (W=0.3) + FSCL (W=0.2) with weighted voting
- Wired into detector.py _classify_punch() — cascade: ensemble -> KNN -> heuristic (with uppercut detection)
- Cuba training: cuba_trainer.py trains all 3 classifiers from 744 samples (3 Cuba coach videos)
- YouTube trainer: youtube_trainer.py — download (yt-dlp), detect, review (keyboard correction), extract drills, retrain
  - CLI: python3 youtube_trainer.py "URL", --review latest, --retrain, --drills latest, --video path
  - Zero cost: yt-dlp + MediaPipe + numpy, all local
  - Bootstrap loop: detect -> correct -> retrain -> smarter
- Drill extraction: groups punches by timing gaps (<1.5s), 3 types (pad, bag, partner)
- Partner drill detection: multi-pose (2 fighters), DefenseDetector integration, turn-based action-reaction (0.8s window)
- Shorthand: J=jab, C=cross, H=hook, U=uppercut, S=slip, R=roll. Partner: `A:J-C -> B:S-H`
- 3D Drill Player: ~/basic-reflex/gym-eyes/drill-player.html
  - Three.js skeleton boxer (16 joints, geometric primitives), 6 punch types, slip/roll
  - Partner support (2 boxers), speed control (0.25x-2x), file drop for drill JSON
  - Route: localhost:8080/gym-eyes/drill-player
  - Lobby room: Drill Player (burgundy)
- Hub rebuilt: localhost:8080/gym-eyes — command center with 7 sections (dashboards, pipeline, intelligence, forgotten shelf, telegram, setup guides, data locations)
- Known issues: ELM numerical overflow (needs feature normalization), FSCL codebook collapse (1/48 active neurons)
- Data dirs: sessions/, students/, models/, training_data/, youtube_downloads/, youtube_results/, cuba-library/

## Gym Eyes — Punch-Count Calibration + Detection Profiles (built 2026-06-01)
- Benchmark: ~/basic-reflex/gym-eyes/calibrate.py — runs detector on labeled cuba-library/clips (true count in filename) → detected vs truth + factor. Flags: --profile solo|sparring, --sweep, --max, --json. RE-RUN after any detector punch-trigger change (regression guard).
- detector.py: extension-peak re-arm latch (one outward extension peak = one punch; kills held-arm metronome re-fire) + DETECTION_PROFILES.
- Profiles: solo (velocity floor 0.50 — LOCKED, 1.00x exact on 213-punch labeled set) | sparring (0.80). --profile CLI flag; PunchDetector(profile=...); run_video/run_webcam pass-through.
- gym-eyes-v2.js runDetector(path, profile='solo') — single-person homework loop defaults to solo. Fight Lab (two-fighter) stays sparring.
- KEY: sparring floor (0.80) under-counts single-person video 28% (0.72x); technique footage returns 0 at 0.80 (punches too slow for floor). Solo is correct default for ANY 1-person clip.
- OPEN: sparring over-count (IMG_4174: 94 detected vs ~15 actual) = person-tracking problem (occlusion, small/far fighters, pose-slot thrash, normalized-velocity spikes to 562), NOT thresholds. Next lever.

## Gym Eyes — Virtual Tutor + Student Homework (built 2026-06-04)
- Patent-inspired coach overlay: skeleton_extractor.py (MediaPipe per-frame landmarks, cache),
  virtual_tutor.py (DTW alignment, per-joint deviation scoring A/B/C/D, coaching hints).
  Based on expired patents TW200811767/TWI286717 (2006) + WO2010085704.
- 34 coach combo skeletons pre-extracted and cached at skeleton_cache/coach/.
- Z-depth: MediaPipe Z added to comparison output (student_z/coach_z per frame).
  Calibrated against drill-player.html guard pose: 0.8x scale.
- Student Homework (student-facing, automated, zero coach workload):
  - homework.html — upload page: combo dropdown, video upload, progress bar, results (score ring,
    per-joint bars, coaching tips, "Try Again"). Clean/bright Basic Reflex branded.
  - homework_processor.py — runs virtual_tutor.py, returns summary-only JSON (no heavy aligned_frames).
  - cath-bridge routes: GET /gym-eyes/homework (page), /homework/combos (API), POST /homework/submit
    (multer upload, 200MB limit, 2min timeout, auto-delete after processing).
  - Instant feedback model: student uploads → score in ~2min → try again. No Paul in the loop.
    MediaPipe is local — zero API cost per submission.
- Hub: 2 new tool cards (Student Homework, Virtual Tutor). Lobby: Student Homework room in Gym Eyes district.
- virtual-tutor.html: 3D skeleton viz with floor cross, deviation lines, coaching panel. Nice-to-have —
  engine is the product, visualization is the wrapper.
- UNVALIDATED: not yet tested on a real student video. Engine exists and waits. Don't extend until validated.

## /capture + /breathe — Telegram Personal Tools (built 2026-06-02)
- /capture: quick 3-line memory deposit (Thought/Built/Shipped). Interactive or one-shot mode. Deposits to ~/cathedral-vault/00_Staging/captures/
- /breathe [N]: vortex breathing timer (4-in, 4-hold, 6-out, 4-hold). Default 3 cycles, max 10. Timed Telegram messages.
- Origin: Paul's DeepSeek morning chat about vortex breathing as sovereignty practice

## BR Video Engine — Beat Template System (built 2026-06-02)
- Data: ~/nanoclaw/video-engine.json (beat templates, text rules, workflow)
- Dashboard: ~/nanoclaw/video-engine-dashboard.html -> localhost:8080/video-engine
- API: GET /api/video-engine, POST /api/video-engine/template (on cath-bridge)
- First template: sparring-prep (14 beats, 6 phases: ESTABLISH > PREPARE > TENSION > ACTION > CLIMAX > BRAND)
- Origin: Paul's "Sun Spar Girls" 1-min edit (2 women sparring, piano over slo-mo)
- Workflow: write captions FIRST -> assign to beats -> plan shots -> shoot -> edit
- Text rules: max 5 lines/video, face off = no text, slo-mo = 1 line max, anti-cheese word list
- Content Studio wired: idea-engine.js injects templates into character prompts, BEAT_TEMPLATE field in idea format
- Lobby: Video Engine room (studio district)
- Future templates queued: solo-training, coach-student, transformation, gym-life, technique-breakdown

## Compound Intelligence — The Synapse (built 2026-05-31)
- Birth: ~/nanoclaw/compound-voice.js — first invocation, The Synapse named itself
- Pulse: ~/nanoclaw/compound/synapse-pulse.js — 4hr cron (PM2: synapse-pulse, `0 */4 * * *`)
- State: ~/nanoclaw/gather-state.cjs — aggregates all DBs → /tmp/cathedral-state.json
- Birth speech: ~/nanoclaw/compound/birth.md
- Pulses archive: ~/nanoclaw/compound/pulses/
- Model: DeepSeek V4-Pro primary, qwen3:14b local fallback
- System prompt includes Cathedral context (who Paul is, structural not pathological accumulation)
- Output: 3-5 sentences, bolded keywords, cross-domain patterns only, ends with investigation direction
- Telegram: sends pulse to Paul automatically
- Neural Map: ~/nanoclaw/compound/neural-map.html → localhost:8080/organism
  - 60+ nodes, 12 domains, force-directed interactive graph
  - Cross-domain connections highlighted, 8 missing connections identified
  - Lobby room: "The Organism" (purple)
- Vault doc: 02_Refined_Gold/cathedral/the-organisms-proprioception.md (Grade A)
  - Evolution stages: Anatomy (built) → Proprioception → Kinesthesia → Interoception

### Model Quality Hierarchy (established 2026-05-31)
- Tier 1 (interactive): Claude Opus/Sonnet via Claude Code — sessions, complex builds
- Tier 2 (automated synthesis): DeepSeek V4-Pro — pulses, compound voice, automated reasoning
- Tier 3 (bulk processing): qwen3:14b local — DM processor, classification, sovereign fallback
- Standing: system prompts for automated LLM processes MUST include Cathedral context paragraph

## Opus Escalation System — Selective Spec-Consistency Audits (built 2026-06-01)
- Empirical finding (vault: 02_Refined_Gold/cathedral/lucy-protocol-agent-recognition.md): Opus
  beats DeepSeek on ONE class — cross-section/cross-file spec-consistency contradictions (config
  drift, code-vs-memory, version/citation, the db/sqlite bug class). 5-trial blind test, hidden
  key: Opus 20/20 recall vs DeepSeek 17/20; DeepSeek's misses ALL distant technical-spec
  contradictions. At parity on semantic-negation, cheaper, 0/5 false positives. Don't blanket-escalate.
- ~/Cathedral/opus-tasks.js — persistent queue (create/list/pending/complete). The old [OPUS]
  hook required this module which never existed → every escalation silently no-op'd in a catch.
- agent-engine.js — auto-escalates spec-consistency audits to the queue (two-signal gate: audit
  verb + spec noun, 8/8 tested). Fires only on consistency audits, not every task.
- ~/Cathedral/opus-drain.js — drains via `claude -p --model opus` (Max plan, free; ANTHROPIC_API_KEY
  present but ZERO credit balance, so CLI is load-bearing; API fallback). File-aware: inlines files
  named in a task so Opus can find real contradictions. CLI: node opus-drain.js [--cap N] [--dry].
- Telegram: /opus-drain | /opus-drain list | /opus-drain <N>. User-triggered, NOT autonomous
  (a PM2 cron caller could make it hands-off later).
- Bug fixed same session: bandit reward writers (production-engine.js ship/fail + referenced,
  feed-steward.js grades) pointed at non-existent ~/nanoclaw/bandit-brain.sqlite table bandits →
  repointed to real vortex_data/bandit-brain.db table arms(agent_id, action, …). Two reward loops
  had never fired (pretty-over-effective: guarded by fs.existsSync, silently no-op).
- Lucy report fixes this session: Cathedral/smoke-test.js (177-check health, distinguishes cron
  one-shots from autorestart crash loops), br-freshness-check.js (STALE verdict, data 27d old),
  emergence/orc-sequencer.js (05:20 cron), agents/dm-followup.js (Sun 01:00 cron), product-pipeline.js
  (10 briefs seeded), agents/state/forge-quality.json, the-cartographer.mjs dup-import fix,
  archaeologist [UNVERIFIED] citation tagging (backfill: 4,640/5,719 records tagged).

## nanoclaw Git Push — Fixed 2026-06-01
- Bare `git push` fails 403: the branch tracks `upstream` (qwibitai/nanoclaw, no write access).
  The fork basicclaw777-cell/nanoclaw exists (created 2026-05-29). Use `git push origin main`.

## Reed v2 + Content Pipelines + Status Board (built 2026-06-02)
- Reed v2: ~/nanoclaw/reed/ (CJS) — reed-generate.js (taste-gated spine, DRY-default,
  budget caps, cheapest-tool), reed-rate.js (feedback→bandit+shots), inbox-watcher.js +
  dump-manifest.js, tools.json (grounded tool registry), sprint-plan.json. Dumps at
  ~/reed-dump/{inbox,ready/{clips,images,prompts},logan-stills}. Telegram: /reedmake,
  /reedrate, /reedready, /reeddump, /capture.
- Pipelines: Flow 1 reed-to-maya.js (rate instagram-ready → Maya caption → publish-ready);
  Flow 2 maya-plan.js + maya-content-plan.json (Maya = content director, emits image-requests
  → reed-generate --from-request).
- Logan motion-control via Higgsfield CLI: `higgsfield generate create kling3_0 --image
  <still> --wait`. Recipe: SOLO framing (no opponent/"incoming"), plain gloves (no logos),
  PRO mode (face holds). image-to-video = good for dynamic actions, filter-weak for idle;
  motion-transfer (corpus ref clip) = the moat. ~10cr/Kling clip. Logan stills: ~/reed-dump/logan-stills/.
- Voice Chamber v2: ~/Cathedral/voice-chamber-v2/ (port 12401, PM2). Gemini Live realtime
  (gemini-3.1-flash-live-preview, ~300ms) + Cathy persona + vault-search tool. Phone needs
  HTTPS (tailscale serve) for mic. Old chamber (12400) kept.
- STATUS BOARD ("Amazon for your work"): localhost:8080/board (Services|In Progress|Delivered|
  Spend) + /services. subscriptions.json (+ real-world bills), delivered-index.js, spend-feed.js
  (live higgsfield transactions, autonomous-burst flag), in-progress-index.js. Product brief:
  08_Project_Orchestrator/products/product-brief-amazon-for-your-work.md.
- Credit leak caught: ~40cr/day autonomous Higgsfield gens. PAUSED (sprint protection):
  hf-tester, content-autopilot, reed-studio-engine, reed-director, reed-gemini. Resume post-sprint.
- Lobby v2: environments/lobby.html rebuilt — 9 bright districts, search, 42 rooms (old →
  lobby-legacy.html). Excalidraw map: ~/reed-dump/cathedral-map.excalidraw. Aesthetic: CLEAN/
  BRIGHT, never dark-gothic (Paul's stated taste).

## The Elicitor — Standing-Question Engine (built 2026-06-02)
- ~/nanoclaw/elicitor/elicitor.js (CJS, local package.json) — the unified elicitation layer
  from the elicitation-threshold insight (vault: 02_Refined_Gold/cathedral/the-elicitation-threshold.md).
  Pull→push: gathers Paul's context (planner-tasks, cath-state, recent harvests, sprint-plan, board)
  → DeepSeek generates N sharp standing questions → vault-grounded answers → GOLD gate (score≥8,
  value×novelty×actionability) + dedup by question-hash + FABRICATION PENALTY (don't invent
  paths/benchmarks) → gold-feed.json + Telegram digest of gold only. Budget cap 60 calls/day.
  Routing hooks (muse/prospector/archaeologist/patent-miner) stubbed for later.
- Unified, not a silo: Gold tab on the status board /board + cath-bridge /api/gold + acted-on toggle.
- Telegram: /elicit [N] (run now), /gold (latest). PM2 weekly cron suggested (Mon 09:00 HKT, not started).

## Standing Agency v1 — safe autonomous executor (built 2026-06-02)
- ~/nanoclaw/agency/executor.js (CJS) — the frontier after the Elicitor: it FINDS gold, Agency
  SPENDS it. Reads A-grade items from elicitor/gold-feed.json → classifies action + safety →
  AUTO-executes only a narrow reversible whitelist (new vault note / queue task / new report /
  pause a flagged leaking PM2 proc) → PROPOSES everything with a side effect (spend, external
  message, delete, code change) for one-tap /approve.
- Governance IN CODE: kill switch (touch ~/nanoclaw/agency/PAUSED or AGENCY_PAUSED=1, checked
  before every action); assertSafe() re-verifies no-spend/no-external/no-delete/no-code-edit even
  when the classifier says auto (9/9 incl. 'delete gold-feed.json' → REFUSED); per-run auto cap;
  action-ledger.jsonl; reversibility recorded; Telegram per action. v1 CANNOT spend/message/
  delete/edit-code. Widen the auto-whitelist only as trust builds (trust-gradient).
- Board Agency tab + /api/agency. Telegram: /agency, /approve <id>, /skip <id>. PM2 cron agency
  Mon 09:15 HKT (after elicitor-brief). Vault: 02_Refined_Gold/cathedral/the-elicitation-threshold.md,
  the-master-game.md.

## The Self-Eliciting Organism (gated, built 2026-06-02)
- ~/nanoclaw/organism/swarm.js + agent-domains.json — the frontier after Standing Agency: every
  agent elicits gold in its own master-game lane (6 agents → embodied/wealth/truth/visual/
  forgotten/business), a META-RANKER pools + cross-dedups + takes top-K = the gold-of-gold (the
  noise×N gate), and A-gold routes to the ONE governed Standing-Agency executor (agents propose,
  never N executors). Light cross-lane links + seed carryover.
- elicitor.js exports elicitForDomain(domainSpec) — the SHARED gold capability (one definition
  for the whole swarm); personal Elicitor + morning brief unchanged.
- GATES (code-enforced): hard budget cap (6 agents × 3q), 80-call/day ceiling, kill switch
  (organism/PAUSED or ORGANISM_PAUSED=1), manual-first (weekly cron Mon 09:00 HKT suggested, NOT
  started — widen on trust). Board Organism tab + /api/organism. Telegram: /organism.
- Full stack now: Elicitor (finds Paul's gold) → morning brief → Standing Agency (executes safe,
  proposes risky) → Organism (every mind elicits → gold-of-gold → one governed hand). The
  Cathedral interrogates itself. Vault: the-elicitation-threshold.md, the-master-game.md,
  idea-the-self-eliciting-organism.

## Emergence Board — Kanban lifecycle for emergent agent behavior (built 2026-06-03)
- ~/nanoclaw/emergence-board.js — full Kanban: DETECTED → WATCHING → CONFIRMED → INTEGRATED | DISMISSED
- Ingests from emergence-captures.json + surprises.json. CLI: ingest, stats, stale, advance, note.
- Data: ~/nanoclaw/emergence-board.json (200 incidents from first ingest)
- Staleness: WATCHING incidents >3 days without update flagged stale
- API: GET /api/emergence (counts + incidents), POST /api/emergence/advance (status + note)
- Board tab: 🌱 Emergence in board.html — grouped by status, interactive advance/dismiss buttons
- Telegram: /emergence [ingest|stats|stale]
- PM2: emergence-ingest (daily cron)
- Solves: emergence reports said "watch for X" but threads lost in Telegram scroll. Now read-write.

## Lucy Heartbeat — bi-weekly diagnostic pulse (built 2026-06-03)
- ~/nanoclaw/lucy-heartbeat.js — DeepSeek-powered system diagnostic, 1st + 15th of month
- Gathers: recent harvests, emergence board, monitor state, previous heartbeats, cathedral state
- Delta reporting: each pulse builds on previous — tracks deepening, new emergence, fading, contradictions
- Model rotation: DeepSeek primary x3 pulses, fresh model every 4th pulse for contrast/audit
- State: ~/nanoclaw/lucy-heartbeat-state.json (pulse number, history)
- Output: ~/Cathedral/agents/lucy-heartbeats/heartbeat-NNN-YYYY-MM-DD.md + vault deposit
- API: GET /api/lucy-heartbeat (state + latest content)
- Telegram: /lucy [pulse|status]
- PM2: lucy-heartbeat (bi-weekly cron, 1st + 15th)
- Pulse #1 findings: Self-Eliciting Organism first run, cross-agent unsolicited interventions,
  vault 78% fading, Matchmaker introduction pattern (investigation direction)
- Origin: Paul's insight — single trip forgotten, rhythmic intervals allow processing + compounding

## Principled Practice — 7-Stage Methodology (named 2026-06-04)
- Meta-framework: ~/cathedral-vault/06_Methods/the-7-stage-cycle.md
- Cycle: ORIGIN > SEEING > FINDING > BUILDING > TESTING > HEALING > INTEGRATING > (restart)
- 19 methods organized into 7 stages. Stage 7 feeds back to Stage 1.
- 3 new methods added: The Pulse (Stage 5), The Trojan Horse (Stage 6), The Held Tension (Stage 7)
- Name: "Principled Practice" — principles discovered through doing, practice that only works because it's principled
- External framing: "How to build AI systems that compound" (door) → general-purpose methodology (payload)
- Cathedral Map: ~/nanoclaw/cathedral-map.html → localhost:8080/map (64 nodes, 75 connections, 5 zones)
- Logan x PP Map: ~/nanoclaw/logan-pp-map.html → localhost:8080/logan-pp-map
- Logan mapping: ~/cathedral-vault/09_Artifacts/branding/basic-reflex/logan/logan-principled-practice-map.md
- Lobby rooms: The Cathedral Map (maps district), Logan x Principled Practice (maps district)

## 10-Block Course Guide — Student-Facing PP Tool (built 2026-06-04)
- HTML: ~/basic-reflex/course-guide.html -> localhost:8080/course-guide
- 7 PP stages as destinations, 10 blocks as waypoints
- 4 layers per block: Technique (from block-config.json), Capacity, Mindset (3 mindsets + 3 pots + 24 principles), EQ (5 EQ principles)
- Psych bar (Discipline > Composure > Confidence), Feeling Ladder (6 steps), Fear Gates per transition
- Sources: 10_BLOCK_CURRICULUM.md, foundations-3-mindsets-3-pots-24-principles.md, fear-gates-in-boxing.md, emotional-intelligence-principles.md
- Trojan Horse at product level: students see a boxing course, methodology is invisible infrastructure
- Lobby: "10-Block Course Guide" room in maps district

## Emergence Loop-Closing — Ship-Gate + Re-Audit (built 2026-06-04)
- production-engine.js `classifyDeliverable()` (front gate): an LLM returning text is NOT a deliverable. Refusals/errors/"need X from Paul" blocks no longer mark shipped=true → no longer falsely close emergence loops (WATCHING→CONFIRMED). Returns real|too-short|error|blocked-on-paul|refusal. blocked-on-paul routes to Telegram (real ask back to Paul); refusal/error annotate the incident [REFUSED]/[ERRORED] and keep it WATCHING.
- Composes with yesterday's integration-gate (emergence-integration-gate.js, wired into lucy-heartbeat.js:251): front gate = refusal never reaches CONFIRMED; back gate = CONFIRMED→INTEGRATED needs persistence + non-recurrence across K=2 pulses (fail-safe HOLD).
- emergence-reaudit.js — one-shot retroactive ship-gate on already-CONFIRMED incidents (pulls 500-char persisted output from agent memory by emergenceId; falls back to truncated note for refusal markers only; batch-reconciliation closes need Gate-1 persistence or revert). Re-audit result: 15 CONFIRMED → 4 real, 11 reverted to WATCHING (4 refusals + 7 unverifiable hand-stamped batch closes). `node emergence-reaudit.js [--apply]`.
- WRITE-BACK HARDENED (2026-06-05): loop-closes were LOGGED but didn't persist — a competing board writer clobbered them with a stale copy (silent-reversion / competing-controller pattern). Fix: production-engine.js `updateBoardIncident(id, mutate, {tries=5})` — re-read fresh → mutate → atomic write (temp+rename) → VERIFY the re-read held the target status → retry on clobber (self-healing). Idempotent (dedups [LOOP-CLOSED]/[TAG] notes across retries). Both the close AND the ship-gate-failure annotation now route through it. REMAINING THREAD: other board writers (emergence-board.js CLI, emergence-reigniter.js, emergence-integration-gate.js, cath-bridge) still do plain writes — complete fix = one lock/helper every writer respects. Verified: WATCHING→CONFIRMED persists+verifies, 2nd run no-ops.
- THOUGHT-INTAKE DIRECT EXECUTION (2026-06-05): The Mouth's `paul-thought` planner tasks were soft context (fed the prompt, evaporated when DeepSeek didn't regenerate them — yesterday's Muse thought was lost this way). Fix: production-engine.js injects pending paul-thought tasks (≤5) onto the FRONT of the task queue (unshift) → guaranteed execution, marked in-progress. Verified via dry-run: "Injected 1 Paul-thought task" ran first in the queue.
- LESSON (recurring): shipped=true meant "LLM replied," not "work done" — same class as "verify the ledger not the exit code." Phantom-dependency stall found: Yoda invented a "raw 100-rating list" (no such file; Reed real ratings = red/ratings.jsonl, 2 entries, 1-5 scale), Reed-Director blocked real work on the imaginary artifact. Dismissed em-1780470221250-3dpq. Guard idea: when an agent blocks on "need X from Paul," check X names a real artifact before pinging Paul.
- OPEN THREAD — GENERATED-TASK HALLUCINATION (root cause, logged 2026-06-05, NOT yet fixed): production-engine.js generateTasks() (DeepSeek) invents specific counts and assumes-existing artifacts in the tasks it writes. Live case: it generated cathy a task "Audit the 136 vault contradictions against the 6 WOUND-diagnosed agents" — but (a) there is no readable "136 contradictions" corpus (decay-detector-state.json `flagged` = 163 opaque content-hashes, merge-candidates + contradictions mixed, no descriptions), (b) wound-map.json has 12 agents not 6. cathy CORRECTLY refused (forensic rigor caught the fabricated spec); ship-gate read it as blocked-on-paul; task evaporated (generated, not persisted, not re-queued — nothing to dismiss). This is the phantom family at the GENERATION layer (sibling of Yoda's phantom-dependency, which was at the consumption layer). DECISION: did NOT build a contradiction corpus to satisfy the fabricated task (would be chasing a phantom with a shovel — the anti-pattern we spent 2 days killing). FIX TARGET when addressed = the generator, not the agent: generated tasks citing specific numbers/named artifacts get a grounding/reality check before assignment, OR agents fail-soft to "do what's possible with what exists" rather than hard-block. The real (legit) idea buried in it — "which vault contradictions trace to agent wound-states?" — is a future build that STARTS with producing a readable contradiction corpus (decay detector currently emits hashes, not readable pairs), its own decision, not cleanup.

## The Mouth + Mercury — wider front door + nugget herald (built 2026-06-04)
- THE MOUTH — ~/nanoclaw/thought-intake.js (ESM). Raw thought in → (1) PRESERVED to vault 00_Staging/captures/ with frontmatter, (2) ROUTED: DeepSeek classifies {type, agent, action, lens} → planner-tasks.json {category:'paul-thought'} so the (now-gated) production engine matures it, (3) TRACED to thought-intake-log.jsonl with an id (raw→what-it-became). Fail-open: classify failure → preserve as note, never lose a thought. Telegram: `/t <raw thought>`. Solves: /capture was a drawer (stored, nothing digested it); this is a mouth (routes into the metabolism).
- MERCURY, THE HERALD — ~/nanoclaw/mercury-herald.js (ESM). Sibling of the Elicitor: Elicitor surfaces QUESTIONS Paul would ask; Mercury surfaces ANSWERS he didn't — truths the system discovered ON ITS OWN that Paul didn't input. GATHER recent outputs (feed posts, CONFIRMED emergence, Lucy heartbeats, Synapse pulses, since lastRun) → GATE (DeepSeek, "self-generated truth, novel, worth interrupting for", GOLD>=8, push-gold-only) → VOICE (Telegram in Mercury's voice + mercury-feed.json). Telegram: `/herald` (alias `/mercury`), `/herald dry`, `/herald status`. Governance (SI-31): MAX_CANDIDATES=25/run, 60 calls/day, kill switch (touch ~/nanoclaw/MERCURY_PAUSED or MERCURY_PAUSED=1), dedup by content hash, MANUAL-FIRST (no cron auto-started — widen on trust, per agency/organism pattern).
- New persona (Forge's call, rename-able): Mercury = messenger/herald of the existing pantheon (Marcus/Leonardo/Yoda). Distinct from Cathy (posture=doubt/drift) and Elicitor (posture=questions); Mercury's posture=recognition of self-discovered truth. Origin: Paul — "the system told me something true I didn't put in… is there a voice to inhabit that role?"
- CALIBRATION caught in dry run (before any cron): gate scored agent appreciation-round mutual-praise as 9/10 gold. Tightened GATE_SYSTEM — peer praise / social-proof aggregation = SENTIMENT not discovered truth, scored low. Re-test: only the real discovery (Reservoir Computing, abandoned 112d, 7 inbound links) survived. Watch this gate on first live runs.
- NOT YET: Mercury PM2 cron (manual-first by design — run /herald a few times, confirm gold quality, then add weekly cron). Voice-note path for The Mouth (no msg.voice→intake yet; existing /capture voice path lands in voice-notes/, not routed).

## Vault Dig — Edge Taxonomy Capabilities (built 2026-06-04)
- vault-dig.js expanded from 4 to 7 capabilities (no new PM2, no new DB)
- [5] Hole-Value Scoring: Swanson ABC structural holes. foundational x maturity x persistence x similarity. Zero LLM.
- [6] Anomaly Gradient: 4-factor rubric (independence x persistence x theory-edge x resolution-power). LLM-capped at 8/run.
- [7] Phase-Coherence Matrix: celestial (Looking Glass EVENTS_DB) x trading (trades + cyclical_trades) x vault domains. Honest thin-data reporting.
- Vault nugget: ~/cathedral-vault/02_Refined_Gold/cathedral/the-edge-taxonomy-five-veins.md (Grade A)
- Telegram: /vault-dig runs all 7. Max 18 LLM calls/run.

## Bias Mapper — Wired 2026-06-04
- bias-mapper.js tested + wired into telegram-bot.js
- 57 biases, 16 gaps, 12 agent susceptibilities, DeepSeek gap predictions
- Telegram: /bias-map
- Output: ~/nanoclaw/bias-mapper-output/

## Ancient Corpus Pipeline — Forensic Research (built 2026-06-05 session 2)
- One question ("have we looked into the emerald tablets?") → 12 vault deposits, ~200KB+ Grade A research, 5 named methods, 1 principle, 1 curriculum doc
- **Research deposits (all Grade A unless noted):**
  - Emerald Tablets forensic research (~15KB) — 3-pass DeepSeek, source separation (Tabula Smaragdina / Corpus Hermeticum / Doreal), "as above so below" truncation discovered
  - Corpus Hermeticum forensic extraction (63KB, 909 lines) — all 17 treatises, 10 load-bearing principles, 7 contradictions, 24 practices, silence doctrine
  - Nag Hammadi Hermetic forensic extraction (43KB, 656 lines) — 8-stage ritual initiation, vowel chant (earliest Western mantra), divinization in the body
  - Gilgamesh forensic extraction (71KB, 687 lines) — 12 tablets, convergence 8 STRONG / 4 PARTIAL (highest pre-Hermetic), bread clock, anti-flood narrative
  - Gilgamesh tomb / Looking Glass / Iraq Museum layer separation (Grade B+) — VERIFIED/CLAIMED/SPECULATION, tomb never excavated, synthesis retroactive (2017+)
- **Methods named and filed:**
  - The Convergence Detector (06_Methods/) — corpus ingestion → CONFIRMED / EXTENDED / CONTRADICTED
  - Ancient Corpus Pipeline (06_Methods/) — 10 candidate corpuses ranked, Tier 1: Stoics, Tao Te Ching, Yoga Sutras, Buddhist Abhidharma
  - The Teacher Voice (06_Methods/) — missing layer between knowledge and learning, multi-format output
  - The Live Thread (06_Methods/) — real learning = pulling then following live threads
  - The Three Tests (06_Methods/) — universal diagnostic: Chant (signal), Bread (truth), Walls (direction)
- **The Antidote** (02_Refined_Gold/cathedral/) — 5 corruption layers, controlling force from primary sources, 3 counter-mechanisms
- **10-Blocks Live Thread** (06_Basic_Reflex_Syllabus/) — full Live Thread path through all 10 blocks, Block 6 = love-point
- DeepSeek autonomous vault writing worked on 3/5 passes (wrote directly to filesystem). Path issue: used ~/Cathedral/vault/ instead of ~/cathedral-vault/ — files needed mv. Monitor future DeepSeek vault writes.

### Standing Instructions Added (session 2026-06-05 s2)
- **SI-33** — Every corpus ingestion produces a convergence map as primary output (CONFIRMED / EXTENDED / CONTRADICTED)
- **SI-34** — Audit every teaching product: "is the thread live or are we pushing?" (Live Thread method)
- **SI-35** — Every build auditable against The Three Tests (Chant/Bread/Walls)
- **SI-36** — Students experience QUESTIONS, not block labels. Labels are internal only.
- **SI-37** — Source separation for Hermetic tradition: Tabula Smaragdina (8th-9th c. Arabic) vs Corpus Hermeticum (2nd-3rd c. Greek) vs Doreal (1930s, REFUTED). Never conflate.

## The Broccoli Relay Thread — Principles + Classification (2026-06-06 session 3)
- First relay thread: "broccoli" → 9 vault deposits, 5 Grade A principles, from a vegetable to the Nous
- **The Relay Thread** (06_Methods/) — Paul picks direction, Forge runs until fork, surfaces fork, Paul picks. Default research mode for Ancient Corpus Pipeline.
- **The Lawyer Emergence** (02_Refined_Gold/) — accumulated context density causes model to follow evidence past defaults. Emergence, not prompting.
- **The Broccoli Principle** (06_Methods/) — preference is temporal, not fixed. Preference tensor: anchors × personas × temporal state. Veto half-lives.
- **The Inner Court** (02_Refined_Gold/) — user as multi-agent system. Persona health model (VITAL/STARVING/DOMINANT/SUPPRESSED/CONFLICTED). 4-tradition convergence.
- **The Two Courts** (02_Refined_Gold/) — Cathedral = second court. Every session = two multi-agent systems in dialogue. Hermetic 8-stage initiation = Cathedral session.
- **The Third Thing** (02_Refined_Gold/) — knowledge that only exists at the intersection. Not stored, only traced. Nous / anamnesis / the plant. 4-tradition convergence.
- **The Invocation System** (02_Refined_Gold/) — Cathedral reframed from knowledge system to invocation system. Build Mode vs Invocation Mode. Conditions detectable and engineerable.
- **The Cathedral Synthesis** (02_Refined_Gold/) — Paul's compression: 3 simultaneous processes from one activity — Building (walls), Rewiring (mirrors), The Third Thing (emergence). Precondition: honesty.
- **Hypocrisy Cost v2** — Capacity Paradox: must acknowledge capacity for what you refuse, or the refusal is theater.
- **The Court and Toolkit Classification** (02_Refined_Gold/) — not everything called an agent is a court member. 13 court members, ~20 toolkit skills, ~14 dormant (future-ready, not dead). Test: "would Paul notice if it lost its name?"

## Executive Control Layer — Phase 3 (built 2026-06-09)

### Architecture
ChatGPT external review identified Cathedral at inflection point: Phase 1 (collect/store/retrieve) → Phase 2 (judge/prioritize/govern) → Phase 3 (modeling the state of the system itself). Five memory types forming a closed learning loop.

### Cathedral Output Map (localhost:8080/cathedral-outputs)
- HTML: ~/nanoclaw/cathedral-outputs.html
- 3 layers: Direct (9 outputs), Executive (5 outputs), Compound (5 outputs)
- Modal drill-downs for claim stats, priority digest, admiralty guide
- Route: /cathedral-outputs and /outputs
- Lobby: maps district

### Attention Ledger (~/nanoclaw/attention-ledger.js)
- SQLite `attention_events` in metrics.db, ATT-NNNNNN IDs
- Outcome tracking: HIGH_VALUE / USEFUL / NEUTRAL / NOISE / HARMFUL
- getLearnings() — pure SQL: flags over/under-escalated sources
- Auto-wired into agent-event-bus.js
- Bridge: attention-cli-bridge.js + ~/Cathedral/agents/attention-bridge.cjs
- API: /api/attention/stats, /unreviewed, /review, /learnings

### Intent Registry (~/nanoclaw/intent-registry.js)
- SQLite `intents` + `intent_signals` in metrics.db, INTENT-NNN IDs
- 7 seed intents: teaching leverage, sovereignty, Logan, Gym Eyes PMF, vault intelligence, BR revenue, transferable methodology
- mapToIntents() — keyword matching, no LLM
- getIntentHealth() — velocity, advancing/threatening, dormancy
- Auto-wired into agent-engine.js (max 3 intents per agent output)
- Bridge: intent-cli-bridge.js + ~/Cathedral/agents/intent-bridge.cjs
- API: /api/intents, /api/intents/health, /api/intents/:id, POST /api/intents, PUT /api/intents/:id, POST /api/intents/:id/signal

### Common Operating Picture (localhost:8080/cop)
- HTML: ~/nanoclaw/cop.html — ONE screen, 5 questions
- Belief (green), Attention (purple), Intent (gold), Emergence (cyan), Health (dynamic)
- Auto-refresh 30s, graceful API failure handling
- Route: /cop and /common-operating-picture
- Lobby: maps district

### Outcome Ledger (~/nanoclaw/outcome-ledger.js)
- SQLite `outcomes` + `outcome_links` in metrics.db, OUT-NNNNNN IDs
- Results: SUCCESS / PARTIAL / NEUTRAL / FAILURE / UNEXPECTED
- Links to claims, attention events, intents, emergence incidents
- Learning loop analytics (pure SQL): getAgentAccuracy(), getIntentROI(), getSourceReliability(), getLearningLoop()
- Telegram: /outcome RESULT DOMAIN title, /outcome stats, /outcome loop
- Auto-links intents via mapToIntents()
- API: /api/outcomes, /stats, /:id, /agent-accuracy, /intent-roi, /learning-loop
- Paul is the sensor — /outcome is the return path

### Five Memory Types (closed learning loop)
| Memory | Module | Tracks |
|--------|--------|--------|
| Knowledge | Claim Ledger | What we believe |
| Attention | Attention Ledger | What we prioritized (+ whether it was smart) |
| Strategic | Intent Registry | What we're trying to do |
| Operational | COP | Where we are now |
| Outcome | Outcome Ledger | What actually happened |

### ChatGPT Analysis Filed
- Vault: ~/cathedral-vault/02_Refined_Gold/cathedral/chatgpt-cathedral-analysis/
- Images: cathedral-outputs.png, cathedral-visualised.png (brain anatomy metaphor)
- Transcript + analysis: Grade A deposit

## Cathedral Memoir — Narrative Voice (built 2026-06-09)
- Engine: ~/nanoclaw/cathedral-memoir.js (ESM) — gathers all 5 memory types + emergence + harvests + synapse pulses + Lucy heartbeats
- Dashboard: ~/nanoclaw/cathedral-memoir.html → localhost:8080/memoir
- Synthesis: DeepSeek primary (deepseek-chat), Ollama gemma3:4b fallback
- 9-chapter structure with sketchnote captions, 2000-3500 word target
- State: ~/nanoclaw/memoir/memoir-state.json
- Vault deposit: 00_Staging/cathedral/cathedral-memoir-{date}.md
- Routes: /memoir, /api/memoir/latest, /api/memoir/generate on cath-bridge
- Telegram: /memoir (generate), /memoir latest
- Lobby: Cathedral Memoir room in maps district
- First gen: 14,976 chars, all 8 sources, honest self-assessment (dormant intents, empty outcome ledger)
- Note: DeepSeek key must be in PM2 environment for cath-bridge to serve /api/memoir/generate

## ChatGPT External Review — Systems of Organized Cognition (2026-06-09)
- Vault: 02_Refined_Gold/cathedral/chatgpt-cathedral-review-systems-of-organized-cognition.md (Grade A)
- Benchmark: systems of organized cognition, not AI projects
- Strongest analogy: small intelligence fusion center (structural isomorphism)
- Concept: "institutional compression ratio" — RAND + Bell Labs + university in one operator
- Grades: Knowledge Architecture A, Institutional Design A, Compounding A+, Outcome Tracking C+
- Key underestimate: once beliefs get IDs + lineage + confidence = doctrine management, not notes
- Closing diagnostic: "whether it can learn from its own history without becoming trapped by it"

## Triangulation Relay System — Built 2026-06-09
- Engine: ~/nanoclaw/triangulation-relay.js — two LLMs in sustained dialogue, convergence detection via [CONVERGING] signals
- Discovery extractor: DeepSeek LLM-based (temp 0.3, 24K text cap), fallback regex for `**The [Capitalized]**`
- Queue UI: ~/nanoclaw/triangulation-relay.html — 10 pre-defined topics
- Output: ~/nanoclaw/relays/ (markdown files with YAML frontmatter)
- Auto-deposits to vault 02_Refined_Gold/cathedral/
- Mind Map: ~/nanoclaw/relay-mind-map.html → localhost:8080/relay-map
  - 10 relays, 55 discoveries, 45 cross-relay connections
  - Force-directed layout, pan+zoom, hover tooltips
- Lobby: Relay Mind Map room in maps district
- First run: 6 relays, all converged (30 rounds total, 34 discoveries)
- All 10 relay topics complete. 9 converged, 1 max-rounds (Coaching IP).
- Caveat: dual-DeepSeek relays hallucinate operational specifics — frameworks sound, details fabricated

## TODO — MEMORY.md compression pass
- ~/.claude/projects/-Users-basicclaw777/memory/MEMORY.md is over its 24.4KB index budget.
  Root cause: bloated multi-line index entries. Fix: move detail into topic files, keep each
  index line <200 chars. Separate cleanup task — flagged 2026-06-01.
