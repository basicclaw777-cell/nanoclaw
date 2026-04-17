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
└── vortex_data/
    └── metrics.db             # SQLite — all system metrics + embeddings

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

If any process is down: `pm2 start [name]`. After changes: `pm2 save`.

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
