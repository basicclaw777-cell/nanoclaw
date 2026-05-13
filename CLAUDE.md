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

## Taste Map — Universal Preference Engine (built 2026-05-08)
- Data: ~/nanoclaw/taste-map.json (70 anchors, 16 rejections, 5 voice references, 5 domains)
- API: ~/nanoclaw/taste-map-api.js — getTasteProfile(), matchPreference(), checkRejection(), addAnchor()
- Elicitation: ~/nanoclaw/taste-elicitation.js — /taste commands on Telegram
- Reed integration: pre-generation gate checks checkRejection() before Higgsfield calls
- Content Machine bridge: content_approve/reject callbacks update taste map passively
- Voice pattern: "Miyagi substance, Brady energy, Carlton filter"
- Music: 2 modes — War Mode (class peaks, BPM 120-160) + Vibe Mode (cooldown, BPM 85-120)
- All agents should import taste-map-api.js before generating Paul-facing content

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
- Canonical curriculum: ~/cathedral-vault/10_Agents/kit/decisions/canonical-curriculum-2026-05-03.md
- Visual hub: ~/basic-reflex/visuals/index.html (4 interactive HTML tools)
- Roadmap: ~/basic-reflex/roadmap/index.html

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

## PunchPass Pipeline — Verified 2026-05-04
- Export: python3 ~/br-gm-agent/scripts/punchpass-export.py (72 members, 5 high churn, 26 expiring)
- CSVs at ~/Desktop/punchpass/various/ (exported 2026-03-30, 35 days stale)
- /health Telegram command reads member-data.json for gym dashboard

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
- 5 agents active: Head Orchestrator, Boxing Intelligence, BR Operations, Trading Intelligence, Universe Intelligence
- Purpose: replaces Claude.ai web project chats. Shared filesystem, inter-agent messaging, no copy-paste bridge.
- Cross-domain sync: ~/Cathedral/agents/cross-domain-sync.js — scans harvests for multi-domain content, extracts domain-specific findings via DeepSeek, routes to agent inboxes via project-messages.cjs
- Telegram: /orc, /boxing-agent, /br-agent, /trading-agent, /universe, /sync, /uptake
- State: ~/Cathedral/agents/sync-state.json (tracks which sessions already synced)
- Expanded run: 124 cross-domain sessions found, 360 messages routed across 5 agents
- Agent Hub visual: localhost:8080/agents — uptake rings, gap alerts, connection map
- Uptake measurement: 3 levels (Delivered/Loaded/Referenced), keyword extraction, per-agent stats at agents/uptake/
- Orc gate: 60% uptake before adding new agents. All 5 above threshold.
- API: /agents/data on cath-bridge (registry, states, calls, harvests, connections, crossReferences, uptake)

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
- Prompt capped at 800 chars (Higgsfield chokes on longer)
- Inbox: ~/nanoclaw/pro-photo-inbox/ → Outbox: ~/nanoclaw/pro-photo-outbox/
- Auto-sends to Telegram
- Pending: retest enhanced prompt when Higgsfield stabilizes (HTTP 500 blocked final test)

### Leaked System Prompt Finding (2026-05-14)
- ChatGPT and Gemini image_gen tool definitions contain NO hidden prompt enhancement
- Web app quality gap comes from reasoning model rewriting casual prompts before calling image_gen
- Source: github.com/asgeirtj/system_prompts_leaks (GPT-5 + Gemini 3.1 Pro prompts)
- Our two-stage pipeline replicates this: DeepSeek = our reasoning layer
