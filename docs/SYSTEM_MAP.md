# Cathedral System Map

> One line per built system: name · entry point · trigger · doc. Grep this before building (SI-04).
> Populated 2026-07-25 from PM2 state + cath-bridge route audit + BUILD_LOG. 569 routes, 24 online PM2, 99 stopped.
> Legend: [PM2] = managed process · [ONLINE] = running · [STOPPED] = exists but not running · route = cath-bridge :8080

## Coaching OS
- **Coaching Planner** · `~/nanoclaw/coaching-os/coaching-planner.html` · route `/coaching-os` · doc: BUILD_LOG 2026-07-13
- **Teach Mode** · `~/nanoclaw/coaching-os/teach-mode.html` · route `/teach?class=ID` · doc: BUILD_LOG 2026-07-13
- **Workout Card** · `~/nanoclaw/coaching-os/workout-card.html` · route `/workout?class=ID` · doc: BUILD_LOG 2026-07-13
- **Coaching Intelligence** · `~/nanoclaw/coaching-os/intelligence.cjs` · route `/coaching-intel` · doc: BUILD_LOG 2026-07-13
- **Series Graph** · `~/nanoclaw/coaching-os/series-graph.html` · route `/series-graph` · doc: BUILD_LOG 2026-07-13
- **Coaching API** · `~/nanoclaw/coaching-os/coaching-api.cjs` · mounted by cath-bridge · 14 endpoints (added GET /coaching/drills) · doc: BUILD_LOG 2026-07-13, 2026-07-19
- **Workout Builder** · `~/nanoclaw/coaching-os/workout-builder.html` · route `/workout-builder` · doc: BUILD_LOG 2026-07-19
- **Drill Library** · `~/nanoclaw/coaching-os/drill-library.html` · route `/drill-library` · doc: BUILD_LOG 2026-07-19
- **Student Deck** · `~/nanoclaw/coaching-os/student-deck.html` · route `/student-deck` · redesigned 2026-07-19 (GPT+Gemini synthesis) · doc: BUILD_LOG 2026-07-19
- **Visual Bible** · `~/basic-reflex/visuals/visual-bible.html` · route `/visual-bible` · 10 Combat HUD cards · doc: BUILD_LOG 2026-07-18
- **Goal Wall** · `~/basic-reflex/visuals/goal-wall.html` · route `/goal-wall` · 6 API endpoints · doc: BUILD_LOG 2026-07-20b
- **Goal Cards** · `~/basic-reflex/visuals/goal-cards.html` · route `/goal-cards` · printable (4 types) · doc: BUILD_LOG 2026-07-20b
- **Coaching Hub** · `~/nanoclaw/coaching-os/hub.html` · route `/hub` · 23 cards, 5 sections · doc: BUILD_LOG 2026-07-29, 2026-07-31
- **Gym Floor Map** · `~/nanoclaw/coaching-os/gym-map.html` · route `/coaching-os/gym-map.html` · SVG floor plan + drill sheet · doc: BUILD_LOG 2026-07-31
- **Drill Mind Map** · `~/nanoclaw/coaching-os/drill-mind-map.html` · route `/coaching-os/drill-mind-map.html` · radial 60-drill visualization · doc: BUILD_LOG 2026-07-31
- **10 Blocks Map** · `~/nanoclaw/coaching-os/blocks-mind-map.html` · route `/coaching-os/blocks-mind-map.html` · 3 pillars × 10 blocks × drills · doc: BUILD_LOG 2026-07-31
- **Block Progression** · `~/nanoclaw/coaching-os/block-progression.html` · route `/coaching-os/block-progression.html` · force-directed dependency graph · doc: BUILD_LOG 2026-07-31
- **Energy Flow** · `~/nanoclaw/coaching-os/energy-flow.html` · route `/coaching-os/energy-flow.html` · Three Engines visualization · doc: BUILD_LOG 2026-07-31
- **Workout Chef** · `~/nanoclaw/coaching-os/workout-chef.html` · route `/coaching-os/workout-chef.html` · 5 chef personas, workout generator · doc: BUILD_LOG 2026-07-31
- **Drill Capture** · `~/nanoclaw/coaching-os/drill-capture-form.html` + `capture-api.cjs` + `/drill` Telegram cmd · URL→vision→tags→library · doc: BUILD_LOG 2026-07-31

## BR CRM + Drill Toolbox
- **CRM Server** · `~/basic-reflex/crm/server.js` · port 8085 · Express + SQLite (br-crm.db) · doc: BUILD_LOG 2026-07-19b
- **Coaching Signal Map** · `~/basic-reflex/crm/signal-map.html` · route `/signal-map` · doc: BUILD_LOG 2026-07-19b
- **CRM System Map** · `~/basic-reflex/crm/system-map.html` · route `/system-map` · doc: BUILD_LOG 2026-07-19b
- **Published Practice** · `~/basic-reflex/crm/published-practice.html` · route `/practice` · doc: BUILD_LOG 2026-07-19b
- **Student Toolbox** · `~/basic-reflex/crm/collection.html` · route `/toolbox/:id` · doc: BUILD_LOG 2026-07-19b
- **Combo Cards** · `~/basic-reflex/crm/combo-cards.html` · route `/combos` · doc: BUILD_LOG 2026-07-19b
- **Soundboard Sketch** · `~/basic-reflex/crm/soundboard-sketch.html` · spatial drill/combo organizer · doc: BUILD_LOG 2026-07-19b
- **Atom Composer** · `~/basic-reflex/crm/composer-sketch.html` · route `/composer` · 31 atoms, sequencer, block guide · doc: BUILD_LOG 2026-07-19b

## Cymatic Choir
- **Forge Mirror Log** · `~/cathedral-vault/02_Refined_Gold/cathedral/forge-mirror-log.md` · trigger: session-closer Step 0 (end of session) · read-in: the-builders-frequency.md (session start) · doc: the-cymatic-choir.md
- **Choir Dispatch** · `~/nanoclaw/choir-dispatch.js` (ESM) · trigger: CLI `node choir-dispatch.js` or POST `/choir/dispatch` · reads voice logs + cath-state + emergence → hermes3 → chord.json · doc: the-cymatic-choir.md
- **Choir Room** · `~/cathedral-vault/09_Artifacts/choir-room.html` · route `/choir` (cath-bridge) · fetches live chord from `/choir/data` · keyboard: T=timeline, D=dispatch · doc: the-cymatic-choir.md

## Vault intelligence
- **Vault Brain** · `~/nanoclaw/vault-brain.js` + `vault-brain-runner.cjs` · PM2 `vault-brain` (always-on chokidar watcher) · cross-domain association push to Telegram on vault deposit · doc: BUILD_LOG 2026-06-29
- **Vault Graph** · `~/nanoclaw/vault-graph.html` + `vault-graph-data.js` · route `/vault-graph` (cath-bridge) · API `/api/vault-graph` · d3 force graph, 1907 nodes × 23 domains · doc: BUILD_LOG 2026-06-29

## Research tools
- **Vortex Lab** · `~/nanoclaw/vortex-lab.html` · route `/vortex-lab` (cath-bridge) · Three.js parametric vortex horn generator with STL export · doc: BUILD_LOG 2026-06-28

## Research lanes
- **The Hunch Lane** · `hunch-lane.js` (nanoclaw, ESM) · trigger: `/hunch <hunch>` (telegram-bot.js) + CLI `node hunch-lane.js "..."` · retrieve-before-derive → show-raw-data → route grade to differently-biased reasoner (DeepSeek/Aletheia, NOT Forge) · fixes OmissionOS Deflection (CLAUDE.md SI-44) · doc: vault `02_Refined_Gold/cathedral/omissionos-in-forge-2026-06-15.md`

## Governance (Autonomy Constitution)
- **AgentOrgan** · `~/nanoclaw/governance/organ.js` (ESM) · base class: observe/evaluate/recommend/enforce/explain · doc: BUILD_LOG 2026-07-07
- **Escalation** · `~/nanoclaw/governance/escalation.js` (ESM) · 5 signals (PASS→ABORT) + resolveSignals() · doc: BUILD_LOG 2026-07-07
- **StateBus** · `~/nanoclaw/governance/state-bus.js` (ESM) · shared state blackboard, 6 namespaces, JSON-backed · doc: BUILD_LOG 2026-07-07
- **AutonomyChassis** · `~/nanoclaw/governance/chassis.js` (ESM) · orchestrates organs by level, enforce/explain/report · doc: BUILD_LOG 2026-07-07
- **Reed Governance** · `~/nanoclaw/reed-studio/reed-governance.js` (ESM) · 7 organs on standard chassis, wraps existing Reed code · doc: BUILD_LOG 2026-07-07
- **Constitution Spec** · `~/cathedral-vault/02_Refined_Gold/cathedral/the-autonomy-constitution.md` · 12 organs, 5 levels, cybernetics lineage · doc: BUILD_LOG 2026-07-07
- **4-Pillar Extension** · `~/cathedral-vault/02_Refined_Gold/cathedral/agent-governance-4-pillars.md` · Causal Decoupling + Struggle Multiplier + Death-to-Rebirth + Constitutional Integrity · doc: BUILD_LOG 2026-07-19c
- **Causal Critic** · `~/nanoclaw/trader/causal-critic.js` (ESM) · Process Score replaces P&L feedback: Calibration + AQD + EES · doc: BUILD_LOG 2026-07-19c
- **Constitutional Invariants** · `~/nanoclaw/governance/constitutional-invariants.js` (ESM) · 8 executable invariants + drift detection · doc: BUILD_LOG 2026-07-19c
- **Brand Invariant** · `~/nanoclaw/governance/brand-invariant.js` (ESM) · checks/enforces BR palette, blocks burgundy · doc: BUILD_LOG 2026-07-19c
- **Spend Circuit Breaker** · `~/nanoclaw/governance/spend-circuit-breaker.js` (ESM) · canSpend()/guardedCall() for paid APIs · doc: BUILD_LOG 2026-07-19c
- **Calibration Tracker** · `~/nanoclaw/polymarket/calibration-tracker.js` (ESM) · Brier score + drift alert on researcher forecasts · doc: BUILD_LOG 2026-07-19d
- **Actuation Proof-of-Life** · `~/nanoclaw/trader/actuation-proof-of-life.js` (ESM) · manual `node actuation-proof-of-life.js [--force]` · 4 checks on wired learning loops, GREEN/RED report + Telegram, learning digest with plain-English explanations · doc: BUILD_LOG 2026-07-24b
- **Learning Pulse Dashboard** · `~/nanoclaw/trader/learning-pulse.html` · route `/trader/learning-pulse` + API `/trader/learning-pulse/data` · anti-steak dashboard: proof-of-life dots, weight story, entity states, genome flow, actuation map, parametric table · doc: BUILD_LOG 2026-07-24b
- **Mausoleum Compressor** · `~/nanoclaw/governance/mausoleum-compressor.js` (ESM) · 528 harvests → 20 anchors, forgetting curve · doc: BUILD_LOG 2026-07-19d
- **Genome Extraction** · `~/nanoclaw/trader/strategy-elimination.js` (modified) · dead strategy DNA → inherited bias for survivors · doc: BUILD_LOG 2026-07-19d

## Universe Engine
- **Aether Universe Dashboard** · `~/nanoclaw/aether-universe.html` · route `/aether-universe` (cath-bridge) · Lobby: Studio · doc: BUILD_LOG 2026-07-07 s2
- **Logan Universe Dashboard** · `~/nanoclaw/logan-universe.html` · route `/logan-universe` (cath-bridge) · Lobby: Studio · doc: BUILD_LOG 2026-07-07 s2
- **Universe Engine Map** · `~/nanoclaw/universe-map.html` · route `/universe-map` (cath-bridge) · Lobby: Maps · doc: BUILD_LOG 2026-07-07 s2
- **Universe Template** · `~/basic-reflex/universe-template.md` · manual · doc: BUILD_LOG 2026-07-07 s2
- **Universe Engine (method)** · `~/cathedral-vault/06_Methods/the-universe-engine.md` · vault method, Grade A · doc: BUILD_LOG 2026-07-07 s2

## Agent improvement
- **Emergence Signal Router** · `~/Cathedral/emergence/emergence-signal-router.js` · PM2 #168 cron 05:25 HKT · reads monitor/watcher/health/scores → generates corrective planner tasks · doc: BUILD_LOG 2026-06-19

## Aether Universe Tools
- **Resonance Engine** · `~/basic-reflex/aether-universe/resonance-engine.html` · route `/resonance-engine` · doc: BUILD_LOG 2026-07-15
- **Thinking Companion** · `~/basic-reflex/aether-universe/thinking-companion.html` · route `/thinking-companion` · doc: BUILD_LOG 2026-07-15
- **Mission Generator** · `~/nanoclaw/mission-generator.js` (ESM) · CLI `node mission-generator.js "topic" --band cadets` · doc: BUILD_LOG 2026-07-15

## Gym Front Door
- **Gym Lobby** · `~/basic-reflex/gym-lobby.html` · route `/gym` · doc: BUILD_LOG 2026-07-15

## Loops
- **Loop System** · `~/Cathedral/loops/` · interactive Claude Code `/loop` + `--dangerously-skip-permissions` · 15 designs, 2 active (improvement-operator, cathy-proactive) · doc: loops/LOOP-CATALOG.md

- **Coach Paul Engine** · `~/nanoclaw/coaching-engine.js` (ESM) · trigger: `/coach` (telegram-bot.js) + 13 REST routes `/gym-eyes/coach/*` (cath-bridge) + CLI `node coaching-engine.js seeds|extract` · learning loop: log→extract(hermes3)→propose→approve→version, confidence-gated autonomy, 27 vault-seed hypotheses · stores: coaching-{interventions,rules,changelog,decisions}.json · doc: scaffolds/5b-coach-paul-engine.md + BUILD_LOG 2026-07-03

- **Agent Protocol (sovereign A2A exchange)** · `~/nanoclaw/agent-protocol.js` (ESM) · trigger: `/agent` (telegram-bot.js) + 7 REST routes `/api/agent-exchange/*` (cath-bridge) + CLI `node agent-protocol.js caps|register|status|log` · capability-based (EvaluateBoxingSession v1.0 → coaching-engine diagnose(), GetStudentProgress v1.0 → gym-eyes-students.json), keyed counterparties, per-counterparty rate limits, sovereignty transform strips all internals from outbound · stores: agent-{capabilities,protocol-registry,protocol-log}.json · doc: scaffolds/5d-agent-protocol.md + BUILD_LOG 2026-07-03

- **Client Proxy Layer (Gym Eyes students/parents)** · `~/nanoclaw/client-proxy.js` (ESM) · trigger: `/student` (telegram-bot.js) + 16 REST routes `/gym-eyes/student*`, `/gym-eyes/flags`, `/gym-eyes/portal`, `/gym-eyes/parent` (cath-bridge) + CLI `node client-proxy.js register|token|flag|progress|...` · student profiles + scoped stp_ tokens (student/parent), flag→Paul-resolves workflow, decision record per session (plugs coaching-engine diagnose(), degrades gracefully), sanitized views (students/parents NEVER see rules/evidence/confidence) · stores: gym-eyes-{students,decisions}.json · doors: ~/basic-reflex/gym-eyes/{student-portal,parent-progress}.html (token-gated via ?token=) · doc: scaffolds/5a-client-proxy.md + BUILD_LOG 2026-07-03

- **Self-Questioner (autonomous vault reflection)** · `~/nanoclaw/self-questioner.js` (ESM) · trigger: `/sq` (telegram-bot.js) + 7 REST routes `/api/self-questioner/*` (cath-bridge) + CLI `node self-questioner.js state|question|batch|stats|insights` · gatherState reads vault folders, coaching-rules, taste-map, vault-graph, staging, git log → hermes3 generates diagnostic questions → Paul answers → cross-question insights · Jaccard dedup (>0.55), 3 retries · stores: self-questioner-log.json · prompt: prompts/self-questioner.txt · doc: scaffolds/5e-self-questioner.md + BUILD_LOG 2026-07-03

- **Sovereignty Shrink (distillation pipeline, pre-hardware)** · `~/nanoclaw/sovereignty-shrink.js` (ESM) · trigger: `/shrink` (telegram-bot.js) + 8 REST routes `/api/sovereignty/*` (cath-bridge) + CLI `node sovereignty-shrink.js generate|stats|export|queries|validate|compare|estimate|history|train` · data generator (vault nuggets + coaching rules + interventions + taste anchors → hermes3-diversified instruction pairs), 25-query validation harness (lexicon/reasoning/domain/voice, `compareModels` = the >20% shrink gate), cost tracker + M5 estimator · LoRA training STUBBED — hardware-gated until M5 Mac Studio ~Oct 2026 · stores: sovereignty-{training-data,training-log,test-queries}.json, JSONL export → training/data/ · prompt: prompts/training-data-gen.txt · doc: scaffolds/5c-sovereignty-shrink.md + BUILD_LOG 2026-07-03

## Boxing harvest
- **Pandamericano harvest** · `panam-harvest.cjs` (whisper.cpp ES transcription) + `panam-structure.cjs` (DeepSeek→gemma3 structuring) · trigger: manual `pm2 start` (must run under PM2 — daemon has KINGSTON2 disk access; Terminal is TCC-blocked) · 88GB Cuban camp video → 130 Spanish transcripts (vault 00_Staging/panamericano) → bilingual framework · zero-to-pennies cost · door `/pandamericano` · doc: vault `06_Methods/pandamericano-methodology-framework.md`. Calibration sampler: `panam-sample.cjs`. Query: `/panam <question>` (telegram-bot.js → `panam-query.js`, retrieval + grounded answer, DeepSeek/gemma).

## Doors (web UIs, served on :8080 by cath-bridge.cjs)
- **Pandamericano Framework** · `pandamericano-framework.html` · route `/pandamericano` (cath-bridge.cjs) · lobby card in BR district · day 1–17 progression + 177 transferable principles, Spanish+English · doc: vault `06_Methods/pandamericano-methodology-framework.md`
- **Lorenz Attractor** · `lorenz-attractor.html` · route `/lorenz-attractor.html` (cath-bridge.cjs) · lobby card in Research district · live RK4 strange-attractor render, calibration-standard door · doc: vault `02_Refined_Gold/epistemology/lorenz-attractor-calibration-standard.md`

- **Agent Workspace** · `~/Cathedral/control-panel/agent-workspace.html` · route `/agent-workspace` (cath-bridge.cjs) · 23 agents, grades, scores, sparklines · doc: BUILD_LOG 2026-06-19

## Cathedral Episodes
- **Episode Harvester** · `~/nanoclaw/cathedral-episodes.js` (ESM) · trigger: manual `node cathedral-episodes.js` · harvests Code .jsonl + web export → signal extraction → `vortex_data/episodes.json` · doc: BUILD_LOG 2026-07-02 session 2
- **Episodes Dashboard** · `~/nanoclaw/episodes.html` · route `/episodes` (cath-bridge.cjs) · timeline, season filters, signal pills · doc: BUILD_LOG 2026-07-02 session 2
- **Episode Narrator** · `~/nanoclaw/episode-narrator.js` (ESM) · trigger: manual · DeepSeek script → edge-tts → Telegram · doc: BUILD_LOG 2026-07-02 session 2
- **Chatterbox TTS** · `~/nanoclaw/chatterbox-narrate.py` (single) + `chatterbox-batch.py` (batch) · trigger: manual · venv `~/chatterbox-venv` (Python 3.12) · local sovereign TTS, MPS ~24 it/s · doc: BUILD_LOG 2026-07-08 session 2
- **Narration Generator** · `~/nanoclaw/gen-narrations.js` (ESM) · trigger: manual · DeepSeek → 3 narration scripts (Architect/Fires/Living Graph) · doc: BUILD_LOG 2026-07-08 session 2

## The Mirror — Digital Paul
- **The Mirror** · `~/nanoclaw/mirror.html` · route `/mirror` (cath-bridge.cjs ~line 2316) · conversational Digital Paul, 5 modes (Warm-up/Recall/Challenge/Disagree/Architect), DeepSeek+hermes3, vault RAG per query · doc: BUILD_LOG 2026-07-01
- **Mirror Evolution Audit** · `~/nanoclaw/mirror-evolution.js` · PM2 `mirror-evolution` cron `0 10 1 * *` (1st of month 18:00 HKT) · monthly drift detection vs Paul Kernel + Cognitive Sig + Taste Map · doc: BUILD_LOG 2026-07-01

## The Ledger — Proposal Protocol
- **Proposal Protocol** · `~/nanoclaw/proposal-protocol.cjs` (CJS) + `proposal-protocol.js` (ESM) · SQLite `proposals` table in metrics.db · Evidence Engine + graduation scoring · doc: BUILD_LOG 2026-07-01
- **Ledger Dashboard** · `~/nanoclaw/ledger.html` · route `/ledger` (cath-bridge.cjs) · 4 tabs: Pending, Graduation, Roads Not Taken, Emit · doc: BUILD_LOG 2026-07-01
- **Ledger REST API** · cath-bridge.cjs routes `/ledger/*` · emit, decide, outcome, summary, pending, graduation, roads-not-taken, agent, domain, initiative · doc: BUILD_LOG 2026-07-01

## Scaffold lobby doors (5a-5e dashboards, cockpit aesthetic)
- **Sovereignty Shrink Door** · `~/Cathedral/control-panel/sovereignty-shrink.html` · route `/sovereignty` (cath-bridge.cjs) · stats, history, queries, cost estimate · doc: BUILD_LOG 2026-07-03
- **Agent Protocol Door** · `~/Cathedral/control-panel/agent-protocol.html` · route `/agent-protocol` (cath-bridge.cjs) · capabilities, registry, exchange log · doc: BUILD_LOG 2026-07-03
- **Self-Questioner Door** · `~/Cathedral/control-panel/self-questioner.html` · route `/self-questioner` (cath-bridge.cjs) · current question, log, stats, insights · doc: BUILD_LOG 2026-07-03
- **Coaching Engine Door** · `~/Cathedral/control-panel/coaching-engine.html` · route `/coaching-engine` (cath-bridge.cjs) · confidence bands, proposals, interventions, decision audit · doc: BUILD_LOG 2026-07-03

## BR website
- **BR Website V4** · `~/basic-reflex/website/index.html` · manual (no deploy yet) · 4 versions preserved (v1,v3,v4) · parked, needs artwork gen · doc: BUILD_LOG 2026-06-17b
- **BR Website Design Bible v1.1** · `~/basic-reflex/docs/BR_WEBSITE_DESIGN_BIBLE.md` · Fable-authored, Gemini-reviewed · 10-page architecture, visual language, conversion strategy · doc: BUILD_LOG 2026-07-03
- **CSOB Website Concept Bible v1.1** · `~/basic-reflex/docs/CSOB_WEBSITE_CONCEPT_BIBLE.md` · Fable-authored, Gemini-reviewed · Method brand concept, "institution + campus" · doc: BUILD_LOG 2026-07-03

## Boxing training visuals
- **Revival Drill Cards** · `~/basic-reflex/visuals/revival-drill-cards.html` · manual/printable · 5 cards with SVG diagrams · vault: 09_Artifacts/branding/basic-reflex/revival-drill-cards.md
- **Fight Prep 3-Week** · `~/basic-reflex/visuals/fight-prep-3week.html` · manual/printable · timeline + session cards · vault: 09_Artifacts/branding/basic-reflex/fight-prep-3week-framework.md
- **Fight Prep Mind Map** · `~/basic-reflex/visuals/fight-prep-mindmap.html` · manual · coaching methods + Gym Eyes mapped to 3-week program · doc: BUILD_LOG 2026-07-02b

## Ancient Corpus pipeline
- **Babylon Translator** · `babylon-translator.js` + `babylon-fetch.js` (nanoclaw) · trigger: manual `--prod` (deliberate prod run, pending) · Akkadian→English + entities, cost-metered, DeepSeek/hermes3 · calibrated 2026-06-15, bulk run pending · doc: vault `02_Refined_Gold/cathedral/the-non-western-veins.md` + BUILD_LOG 2026-06-15

## Cathedral knowledge
- **The Concierge** · `~/nanoclaw/concierge.cjs` + `~/nanoclaw/concierge.html` · route `/concierge` + `/concierge/ask` + `/concierge/pending` + `/concierge/resolve` (cath-bridge.cjs) · Cathedral guide/institutional memory, 5 modes (Orient/Route/Riff/Research/Connect), DeepSeek+hermes3, reads SYSTEM_MAP+BUILD_LOG+vault-state+convergences+taste-map+harvests+mirror-log, intent detection ([BUILD IDEA]/[RESEARCH THREAD]/[CONNECTION]) → concierge-log.json → Forge pickup · doc: BUILD_LOG 2026-07-19
- **The Oracle** · cath-bridge.cjs `/oracle` + `/oracle/ask` · trigger: localhost:8080/oracle (8888 sidebar) · vault RAG, gold-weighted, DeepSeek synth, cited · doc: BUILD_LOG 2026-06-21 night
- **The Quarry** · `quarry-watcher.js` (PM2 `quarry`) · trigger: drop file in ~/Downloads/quarry/ · capture+route+audio-transcribe+notify · doc: BUILD_LOG 2026-06-21 night
- **Film Room** · `~/basic-reflex/gym-eyes/film_room.py` + `/gym-eyes/film-room` · trigger: `python3 film_room.py --channel <url>` · YouTube->lesson cards by 10-block · PARKED (distill RAM) · doc: BUILD_LOG 2026-06-21 night

## Decision intelligence
- **The Prospector** · `~/Cathedral/agents/the-prospector.js` + `~/Cathedral/control-panel/prospector.html` · PM2 `decision-prospector` cron `0 12 * * *` UTC · 3-lens exhaust scan (B-Sides, Unasked, Connections) · API `/api/prospector` · route `/prospector` · doc: BUILD_LOG 2026-07-01

## Basic Reflex — coaching tools
- **The Guard** · `~/basic-reflex/gym-eyes/the-guard.html` · route `/gym-eyes/the-guard` (if wired) · 3-layer defensive intelligence (coverage + toolkit + questions + counter-intel), 5 presets · doc: BUILD_LOG 2026-07-01
- **The Questions** · `~/basic-reflex/gym-eyes/the-questions.html` · standalone · 5 universal diagnostic questions, cross-domain onboarding · doc: BUILD_LOG 2026-07-01
- **drill-player external motion import** · `~/basic-reflex/gym-eyes/drill-player.html` `playClip()` · trigger: localhost:8080/gym-eyes/drill-player → ▶ Motion Clip · plays raw joint-position clips (mocap/MediaPipe/FBX contract `{t,joints:{name:[x,y,z]}}`) · doc: BUILD_LOG 2026-06-21

- **Class Deck** · `~/basic-reflex/class-system/class-deck.html` · trigger: localhost:8080/class-deck · 14 drills, 6-stage spine, 3 templates, class builder, engine badges · doc: BUILD_LOG 2026-06-25
- **Drill Bank** · `~/basic-reflex/class-system/drill-bank.json` · data: drills + spine + engines (body/mind/eq) + templates · consumed by class-deck.html
- **Whiteboard Teaching Boards** · `~/basic-reflex/class-system/whiteboards/*.html` · trigger: localhost:8080/whiteboards/ · 4 boards (three-engines, body, mind, eq) · tablet/projector pre-class intros
- **Corporate Brochure** · `~/basic-reflex/corporate/` · PDF + HTML template + 8 extracted photos · doc: BUILD_LOG 2026-06-25

## 33-Card Boxing Operating System
- **33-Card Data Model** · `~/basic-reflex/33-card-system.json` · data: 33 cards × 5 layers + frequencies + mindsets · consumed by all 5 views below
- **33-Card Grid** · `~/basic-reflex/33-card-grid.html` · route `/33-cards` · overview map · doc: BUILD_LOG 2026-06-27
- **Class Planner** · `~/basic-reflex/class-planner/33-card-planner.html` · route `/class-planner` · coach tool · doc: BUILD_LOG 2026-06-27
- **Coach Training** · `~/basic-reflex/coach-training.html` · route `/coach-training` · teaching manual · doc: BUILD_LOG 2026-06-27
- **Online Course** · `~/basic-reflex/online-course.html` · route `/online-course` · student-facing · doc: BUILD_LOG 2026-06-27
- **Digital Dojo Deck** · `~/basic-reflex/digital-dojo-deck.html` · route `/digital-dojo` · product vision mockups · doc: BUILD_LOG 2026-06-27

## Cognitive Twins (Alter system)
- **A.P.** · `~/basic-reflex/alters/alter-paul.md` · persona file, load into any agent · doc: BUILD_LOG 2026-07-05
- **Alter Template** · `~/basic-reflex/alters/alter-template.html` · visual dossier, parameterized per alter · doc: BUILD_LOG 2026-07-05
- **Cathedral Observatory** · `~/basic-reflex/alters/cathedral-observatory.html` · 13-sense health dashboard · doc: BUILD_LOG 2026-07-05

## Cathedral Foundry
- **Agent Genome Schema** · `~/nanoclaw/agent-genome-schema.json` · JSON Schema v1, 12 sections · doc: BUILD_LOG 2026-07-05
- **Agent Genomes** · `~/Cathedral/agents/genomes/*.json` · 23 agents populated (17 individual + 6 sages) · doc: BUILD_LOG 2026-07-05
- **Design Critic** · `~/Cathedral/control-panel/design-critic.html` · route `/design-critic` (cath-bridge) · 5-dimension architecture scorer, flag detector, dep graph · doc: BUILD_LOG 2026-07-05
- **Genomes API** · cath-bridge `/api/genomes` · returns all genome JSON files merged · doc: BUILD_LOG 2026-07-05
- **Watcher Observatory** · `~/Cathedral/control-panel/watcher-observatory.html` · route `/watcher-observatory` (cath-bridge) · meta-intelligence timeline: signal evolution, wounds, blind spots, breakthroughs · doc: BUILD_LOG 2026-07-05
- **Watcher State API** · cath-bridge `/api/watcher-state` · returns watcher-state.json (9+ compounding runs) · doc: BUILD_LOG 2026-07-05
- **The Gardener** · `~/Cathedral/emergence/gardener.js` · PM2 `cathedral-gardener` Sunday 4am HKT · Generation 3: reads genomes+health+watcher → proposes structural improvements · doc: BUILD_LOG 2026-07-05
- **Gardener Proposals API** · cath-bridge `/api/gardener-proposals` + POST `/:id/status` · lifecycle tracking (pending→accepted→implemented) · doc: BUILD_LOG 2026-07-05
- **Genome Contract (proof-of-life)** · `~/Cathedral/emergence/production-engine.js` `loadGenomes()` + `generateProofOfLifeTasks()` · trigger: every production-engine cycle (daily 5:30am HKT) · reads genomes, checks feed, injects proof-of-life tasks for silent agents · doc: BUILD_LOG 2026-07-06
- **Output Architect** · `~/Cathedral/emergence/output-architect.js` · PM2 `output-architect` cron `0 22 * * *` (daily 06:00 HKT) · deliverable specs per agent (4/8/10), quality grades, emergent detection, under-delivery flags · doc: BUILD_LOG 2026-07-06
- **Deliverables Dashboard** · `~/Cathedral/control-panel/deliverables.html` · route `/deliverables` (cath-bridge) · API `/api/deliverable-specs` · quality board, filters, expandable agent cards · doc: BUILD_LOG 2026-07-06

## Cathedral Flavors
- **The Dojo** · `~/Cathedral/flavors/dojo/` · 8 agents (Eyes, Sensei, Roster, Curriculum, Window, Demonstrator, Front Desk, Floor Manager) · 3 closed loops · PARKED · doc: BUILD_LOG 2026-07-05
- **Dojo Manifest** · `~/Cathedral/flavors/dojo/manifest.json` · flavor metadata, agent map, closed loops, differentiators, ancestry · doc: BUILD_LOG 2026-07-05
- **The Atelier** · `~/Cathedral/flavors/atelier/` · 8 agents (Muse, Critic, Archivist, Brand Guardian, Curator, Studio Hand, Patron, Studio Manager) · 4 closed loops · PARKED · doc: BUILD_LOG 2026-07-05
- **Atelier Manifest** · `~/Cathedral/flavors/atelier/manifest.json` · flavor metadata, agent map, closed loops, differentiators, ancestry · doc: BUILD_LOG 2026-07-05
- **The Scriptorium** · `~/Cathedral/flavors/scriptorium/` · 8 agents (Voice Keeper, Continuity, Researcher, Editor, Vault Keeper, Plot Weaver, Submissions Desk, Scriptorium Manager) · 4 closed loops · PARKED · doc: BUILD_LOG 2026-07-05
- **Scriptorium Manifest** · `~/Cathedral/flavors/scriptorium/manifest.json` · flavor metadata, agent map, closed loops, differentiators, ancestry · doc: BUILD_LOG 2026-07-05

## Research instruments
- **Base-60 Framework** · `~/Cathedral/control-panel/base60-visual.html` · `/base60` · Research findings: base-60 as cognitive framework verified against Sumerian medical corpus · doc: BUILD_LOG 2026-07-06
- **Base-60 Lens** · `~/Cathedral/control-panel/base60-lens.html` · `/base60/lens` · Interactive: converter, text scanner, 6 domain guides with coaching triggers · doc: BUILD_LOG 2026-07-06
- **Base-60 Engine** · `~/Cathedral/tools/base60-lens.js` · CJS module · toBase60, fractionInBase60, scanText, analyzeRatios, getDomainTriggers, getCoachingIntro · doc: BUILD_LOG 2026-07-06
- **Base-60 Telegram** · `~/nanoclaw/telegram-bot.js` · `/base60 [number|scan|guide]` · Quick convert, text scanner, domain coaching via Telegram · doc: BUILD_LOG 2026-07-06
- **Base-60 Vault** · `~/cathedral-vault/02_Refined_Gold/mathematics/base-60-cognitive-framework.md` · Research deposit: cross-domain analysis, forensic grades · doc: BUILD_LOG 2026-07-06

- **Somatic Orrery** · `~/nanoclaw/reed-lab/somatic-orrery.html` · route `/orrery` · 7-planet internal cosmology, diagnostic matrix, evidence map, group geometry, Cathedral constellation · doc: BUILD_LOG 2026-07-20
- **Stress Battery** · `~/nanoclaw/stress-battery.js` · PM2 cron daily 05:00 HKT · route `/stress-battery` · 3-chamber anti-fragile test (compression+contradiction+identity) · doc: BUILD_LOG 2026-07-22
- **Paul Patterns** · `~/nanoclaw/paul-pattern-tracker.js` · PM2 cron weekly Sunday 06:00 HKT · route `/patterns` · session harvest analysis + cognitive tracking · doc: BUILD_LOG 2026-07-22b
- **Corpus Diagnostic** · `~/nanoclaw/corpus-diagnostic.js` · PM2 cron weekly Wednesday 04:00 HKT · route `/corpus-diagnostic` · Cathedral diagnostic tools turned outward on ancient corpus · doc: BUILD_LOG 2026-07-22c

## Forge maintenance
- **Forge model pin** · `~/.claude/settings.json` `"model": "claude-opus-4-6"` · trigger: every Claude Code launch · pre-fable model (4.8=fable flinch); terminal Forge build-only per soul file · doc: BUILD_LOG 2026-06-22 + forge-regression-diagnostic.md

## SEO / Public deployment
- **Beacon Architecture** · `~/Cathedral/beacon/ARCHITECTURE.md` · 4-model SEO synthesis · doc: BUILD_LOG 2026-07-16
- **Beacon Generator** · `~/Cathedral/beacon/generate.js` · `node generate.js` · 39,550-page static site from tablet corpus · doc: BUILD_LOG 2026-07-16
- **Beacon Title Gen** · `~/Cathedral/beacon/generate-titles.js` · `node generate-titles.js` · DeepSeek batch, resumable · doc: BUILD_LOG 2026-07-16
- **Beacon Normalizer** · `~/Cathedral/beacon/normalize-plants.js` · `node normalize-plants.js` · plant/ailment canonical mapping · doc: BUILD_LOG 2026-07-16
- **Beacon Output** · `~/Cathedral/beacon/dist/` · 39,550 HTML pages · `python3 -m http.server 8877` to preview · doc: BUILD_LOG 2026-07-16
- **Court Mobile** · `~/Cathedral/control-panel/court-mobile.html` · route `/court` · Mobile agent chat, DeepSeek, 30+ agents · doc: BUILD_LOG 2026-07-17
- **Quarry Mobile** · `~/Cathedral/control-panel/quarry-mobile.html` · route `/quarry` · Phone file upload to Cathedral · doc: BUILD_LOG 2026-07-17
- **Relay Thread Seeds** · `~/Cathedral/relay-seeds.js` · CLI `--generate/--from-vault/--launch` · Provocation architect for relay conditions · doc: BUILD_LOG 2026-07-17
- **Logan Story Engine** · `~/Cathedral/logan-story-engine.js` · CLI `--scene/--arc/--moment/--diagnostic` · Narrative generator from Character Bible · doc: BUILD_LOG 2026-07-17
- **Fable Use Cases Map** · `~/Cathedral/control-panel/fable-use-cases.html` · static · Interactive SVG mind map of 6 Fable use cases · doc: BUILD_LOG 2026-07-17
- **Forge Sage** · `~/nanoclaw/sages/forge.json` · `/court` agent picker · Forge conversational proxy for Court · doc: BUILD_LOG 2026-07-17
- **PT Tracker** · `~/basic-reflex/pt-tracker.html` · route `/pt` · Mobile PT session counter · doc: BUILD_LOG 2026-07-19

## Infrastructure (always-on PM2)
- **Cath-Bridge** · `~/nanoclaw/cath-bridge.cjs` · [PM2 ONLINE] port 8080 · 569 routes, all web UIs + APIs
- **Cathedral Bot** · `~/nanoclaw/telegram-bot.js` · [PM2 ONLINE] Telegram commands · primary command interface
- **Dispatch Bot** · `~/Cathedral/tools/telegram-bot.js` · [PM2 ONLINE] · agent dispatch Telegram relay
- **Cath-Local** · `~/Cathedral/cath_local_server.py` · [PM2 ONLINE] FastAPI :8000 · Python service layer
- **Telegram Tunnel** · `~/nanoclaw/telegram-webhook-tunnel.sh` · [PM2 ONLINE] · webhook proxy
- **TTYD Claude** · `~/nanoclaw/services/ttyd-claude.sh` · [PM2 ONLINE] · web terminal
- **Intake Watcher** · `~/nanoclaw/intake-watcher.js` · [PM2 ONLINE] · incoming file routing
- **Morning View** · `~/Cathedral/morning-view/server.js` · [PM2 ONLINE] · daily briefing generator

## Trading System
- **Trading Orchestrator** · `~/nanoclaw/trader/trading-orchestrator.js` · [PM2 STOPPED] · central signal→trade loop, weight persistence, genome inheritance, corner advice
- **Orchestrator Seed** · `~/nanoclaw/orchestrator-seed-generator.js` · [PM2 ONLINE] · seed generation for orchestrator
- **Trader Hub** · route `/trader/hub` · dashboard: portfolio, positions, signals, performance
- **Signal Dashboard** · route `/trader/signal-dashboard` · live signal feed
- **Trader Performance** · route `/trader/performance` · P&L and strategy stats
- **Trader Portfolio** · route `/trader/portfolio` · current holdings
- **Trader Positions** · route `/trader/positions` · open positions
- **Trader Signals** · route `/trader/signals` · signal history
- **Trader Explainer** · route `/trader/explainer` · plain-English trade reasoning
- **Latest Debate** · route `/trader/latest-debate` · roundtable debate output
- **Daily Picks** · routes `/trader/picks/*` (today, pick, scoreboard, lessons) · daily trade picks + scoring
- **Simpsons Trader** · `~/nanoclaw/trader/simpsons-trader.js` · [PM2 STOPPED] route `/simpsons` · event trader
- **Cyclical Trader** · `~/nanoclaw/trader/cyclical-trader.js` · [PM2 STOPPED] · cycle-based strategy
- **Allocation Tracker** · `~/nanoclaw/trader/allocation-tracker.js` · [PM2 STOPPED] route `/allocations` · weekly allocation review
- **Trading Mentor** · `~/nanoclaw/trader/trading-mentor.js` · [PM2 STOPPED] · coaching layer for trading
- **Position Guardian** · `~/nanoclaw/trader/position-guardian.js` · [PM2 STOPPED] · position size limits
- **The Corner** · `~/nanoclaw/trader/the-corner.js` · generates corner-advice.json (multipliers) · consumed by orchestrator
- **Causal Critic** · `~/nanoclaw/trader/causal-critic.js` · process score replaces P&L feedback · doc: BUILD_LOG 2026-07-19c
- **Strategy Elimination** · `~/nanoclaw/trader/strategy-elimination.js` · genome extraction from dead strategies

## Polymarket
- **Polymarket Dashboard** · route `/polymarket` · prediction market interface
- **Polymarket API** · routes `/api/polymarket/*` (scan, research, markets, estimates, kelly, trade, execute, ledger, monitor, report) · 11 endpoints
- **PM Scanner** · `~/nanoclaw/polymarket/cron.js` · [PM2 STOPPED] · market scanner
- **Calibration Tracker** · `~/nanoclaw/polymarket/calibration-tracker.js` · Brier score + drift alert · doc: BUILD_LOG 2026-07-19d

## Content Studio / Reed
- **Reed Studio** · route `/reed-studio` · character-driven content generation
- **Reed Visual Hub** · route `/reed-visual-hub` · visual content pipeline overview
- **Reed Lab** · routes `/reed-lab/*` (catalogue, digest, shots, image) · experimental generation lab
- **Reed Slides** · routes `/reed-slides/*` (catalogue, deck, card-image, card-project, missing-connections) · slide deck generator
- **Reed Treatments** · route `/reed-treatments` · treatment pipeline
- **Reed Studio API** · routes `/api/reed-studio/*` (briefing, feed, memory, metrics, status) · 5 endpoints
- **Reed Curator API** · route `/api/reed-curator` · curation layer
- **Content Studio API** · routes `/api/content-studio/*` (feed, internal-feed, characters, character-stats, queue, select, fulfill, reject, wishlist, memory, metrics, status) · 12 endpoints
- **Engineering Studio API** · routes `/api/engineering-studio/*` (briefing, feed, memory, metrics, status) · 5 endpoints
- **Buzz Monitor** · `~/nanoclaw/content-studio/buzz-monitor.js` · [PM2 ONLINE] · trend/news monitoring
- **Content Reviews** · `~/nanoclaw/content-studio/review-responder.js` · [PM2 ONLINE] · automated content review
- **Maya Social** · `~/nanoclaw/content-studio/maya-internal.js` · [PM2 ONLINE] · social intelligence agent
- **Higgsfield Gallery** · route `/hf-gallery` · AI video gallery
- **Higgsfield Map** · route `/higgsfield-map` · model/credit status
- **Video Engine** · routes `/api/video-engine/*` · video gen API

## Social Intelligence / Cathedral City
- **Cathedral City** · routes `/cathedral-city/*` (feed, health, team-programme, tea-stars, dissent, dms, suggestions, feed-dashboard) · social simulation layer · 9 routes
- **Agent Interface** · routes `/agents/*` (chat, data, guide, list, steward, ui) · agent interaction layer · 6 routes
- **Newsfeed** · routes `/newsfeed`, `/api/newsfeed/*` · internal news aggregation

## Vault & Knowledge (always-on)
- **Vault Brain** · `~/nanoclaw/vault-brain-runner.cjs` · [PM2 ONLINE] · chokidar watcher, cross-domain association → Telegram
- **Vault Promoter** · `~/nanoclaw/vault-promoter.js` · [PM2 ONLINE] · promotes staging → refined
- **Vault State Refresh** · `~/nanoclaw/vault-state-generator.js` · [PM2 ONLINE] · regenerates vault-state.json
- **Vault Watcher** · `~/Cathedral/event-bus/vault_watcher.py` · [PM2 ONLINE] · Python event bus for vault changes
- **The Archivist** · `~/Cathedral/the-archivist.mjs` · [PM2 ONLINE] · automated archival intelligence
- **The Cartographer** · `~/Cathedral/the-cartographer.mjs` · [PM2 ONLINE] · vault structure mapping
- **Vault REST** · routes `/vault/*` (list, read, search, related, write) · vault CRUD API
- **Vault Health** · routes `/vault-health`, `/api/vault-health` · vault integrity check

## Emergence / Meta-Intelligence
- **Emergence Ingest** · `~/nanoclaw/emergence-board.js` · [PM2 ONLINE] · emergence signal ingestion
- **Cognitive Scanner** · `~/nanoclaw/cognitive-scanner.js` · [PM2 ONLINE] · cognitive pattern detection
- **Lucy Heartbeat** · `~/nanoclaw/lucy-heartbeat.js` · [PM2 ONLINE] route `/api/lucy-heartbeat` · Lucy Protocol verification pulse
- **Lymphatic** · `~/nanoclaw/lymphatic.mjs` · [PM2 ONLINE] · system waste detection/clearing
- **Terminal Harvester** · `~/nanoclaw/terminal-harvester.js` · [PM2 ONLINE] · Claude Code session signal extraction
- **Archaeologist** · `~/nanoclaw/archaeologist.js` · [PM2 ONLINE] route `/archaeologist` · forgotten technique mining
- **Emergence API** · routes `/api/emergence/*` (captures, scores, advance) · emergence data
- **Neural Map** · route `/neural-map`, `/api/neural-map` · system connection visualization
- **Organism** · route `/organism`, `/api/organism` · organic system health view
- **Extraction Cycle** · routes `/api/extraction-cycle/*` (history, report) · knowledge extraction pipeline

## Comms Engine
- **Comms Daily** · `~/nanoclaw/comms-engine/run-daily-comms.js` · [PM2 STOPPED] · daily comms automation
- **Lapsed Campaign** · `~/nanoclaw/comms-engine/run-lapsed-campaign.js` · [PM2 STOPPED] · warm winback (20 sent, result pending)
- **WhatsApp Integration** · routes `/wa/*` (dashboard, webhook, approve, skip, toggle, test) · WA business API

## Gym Eyes / Boxing Analytics
- **Gym Eyes Analytics** · routes `/gym-eyes/*` (analytics, boxers, cards, corrections, fighters, film-room, flags, portal, student*, parent, videos, video/:file, virtual-tutor, vision-landscape) · ~20 routes
- **Boxing Defense** · route `/boxing-defense` · defensive drill system
- **Boxing Floor** · route `/boxing-floor` · floor plan/movement
- **Boxing Full Fight** · route `/boxing-fullfight` · fight simulation
- **Boxing Game** · route `/boxing-game` · gamified training
- **Opponents Film Room** · route `/opponents-film-room` · fight tape analysis
- **Screening** · route `/screening` · new member assessment
- **Kids Class** · route `/kids-class` · kids programme interface
- **Open Gym** · route `/open-gym` · open gym session tool
- **Technique Library** · `~/basic-reflex/gym-eyes/technique-library.html` · routes `/technique-library`, `/techniques` · 134 Punch Perfect MoCap animations on Logan Mixamo rig · retarget pipeline: `~/basic-reflex/gym-eyes/mocap/retarget-batch.py` (Blender headless) · doc: BUILD_LOG 2026-08-01
- **ANIM_CATALOG** · `~/basic-reflex/gym-eyes/mocap/anim-catalog.js` · shared ES module · 134 techniques, 5 categories, MOCAP_DIR constant · doc: BUILD_LOG 2026-08-21
- **Class Sheet** · `~/basic-reflex/gym-eyes/class-sheet.html` · standalone · 3-view class planner (Deck/Sheet/Run), 5-axis composer · doc: BUILD_LOG 2026-08-21
- **Overlay Mode** · `~/basic-reflex/gym-eyes/overlay.html` · standalone · Logan-over-webcam, MediaPipe pose, diagnostic layers · doc: BUILD_LOG 2026-08-21
- **Mnemonic Library** · route `/mnemonic-library` · teaching mnemonics

## BR Business Tools
- **BR Pre-Class Brief** · `~/nanoclaw/br-preclass-brief.js` · [PM2 STOPPED] route `/br-brief` · pre-class briefing
- **BR Command** · route `/br-command` · command center
- **BR Taster** · route `/br-taster` · taster class tool
- **Punchpass Scraper** · `~/nanoclaw/punchpass-scraper.cjs` · [PM2 STOPPED] · membership data sync
- **Revenue Digest** · `~/nanoclaw/br-revenue-digest-cron.js` · [PM2 STOPPED] · revenue reporting

## Research Instruments (additional)
- **Looking Glass** · routes `/looking-glass/*` (events, pipelines/:body, scan, signal, sky) · astronomy pipeline · 6 routes
- **Sumerian Corpus** · route `/sumerian` · tablet viewer
- **Truth Corpus** · route `/truth-corpus` · verified claims database
- **Rosetta Bridge** · route `/rosetta-bridge` · cross-corpus translation

## Publication Engine
- **Publisher** · route `/publisher` · publication management
- **Publication API** · routes `/api/publication/*` (book, book/generate, newsletters, newsletter/generate, podcasts, podcast/curate) · 6 endpoints

## Predictive Intelligence
- **Predictive Map** · routes `/predictive/*` (map, predictions, rebuild, seeds, stats) · prediction layer · 5 routes
- **Claim Ledger** · routes `/api/claim-ledger/*` (register, stats, blocked, lineage, check-lineage) · epistemic claim tracking

## Relay System
- **Relay Dashboard** · route `/relay`, `/relay-map` · relay thread visualization
- **Relay API** · routes `/api/relay/*` (latest, status) · relay state
- **Forensic Relay** · routes `/api/forensic-relay/*` (scan, history) · forensic analysis relay

## Villa (Property Scout)
- **Property Scout** · route `/property-scout` · real estate research tool
- **Villa** · routes `/villa/*` (projects, artifacts, artifact-file, snapshot) · project workspace
- **Scout Room** · routes `/scout-room`, `/api/scout-room/*` · candidate evaluation

## Study Lab
- **Study Lab** · route `/study-lab` · study material generator
- **Study Lab API** · routes `/api/study-lab/*` (generate, audio/:name, file/:name) · content generation
- **Syllabus** · routes `/syllabus`, `/api/syllabus/*` (generate, suggest, start, next, complete) · curriculum progression

## Taste & Attention
- **Taste Curator** · routes `/api/taste-curator/*` (review, scan) · taste map curation
- **Taste Practice** · `~/nanoclaw/taste-practice-cron.js` · [PM2 STOPPED] · taste map reinforcement
- **Attention Layer** · routes `/api/attention/*` (review, unreviewed, learnings, stats) · attention/priority management
- **Priority Engine** · routes `/api/priority/*` (classify, digest, stats) · priority classification

## Cathedral Meta
- **Cathedral Deck** · route `/cathedral-deck` · presentation deck
- **Cathedral Ferrari** · route `/cathedral-ferrari` · system overview viz
- **Cathedral Infographic** · route `/cathedral-infographic` · architecture infographic
- **Cathedral Memoir** · route `/cathedral-memoir`, `/memoir` · narrative history
- **Cathedral Outputs** · route `/cathedral-outputs`, `/outputs` · output tracking
- **What Built Me** · route `/what-built-me` · origin story
- **Time Capsule** · route `/time-capsule` · milestone preservation
- **Capsule** · route `/capsule` · snapshot tool
- **Pulse** · route `/pulse` · system heartbeat dashboard
- **Pipeline** · routes `/pipeline`, `/api/pipeline/*` · processing pipeline view
- **Status** · route `/status` · system status
- **Services** · route `/services` · service registry
- **Board** · route `/board` · kanban/task board
- **Map** · route `/map` · system map visualization
- **Spend** · route `/api/spend` · cost tracking

## Miscellaneous Tools
- **Harmonic Dome** · route `/harmonic-dome` · geometric visualization
- **Retuning Kitchen** · route `/retuning-kitchen` · parameter adjustment tool
- **Open Questions** · route `/open-questions` · research question tracker
- **Workshop Results** · route `/workshop-results` · workshop outcome tracking
- **Influences** · route `/influences` · influence mapping
- **Brand DNA** · route `/brand-dna` · brand identity tool
- **Hermes** · routes `/hermes`, `/hermes/status` · local model interface
- **Icons** · route `/icons` · asset serving

## Stopped Goldmine Miners (all PM2 STOPPED)
- **Patent Miner** · `~/nanoclaw/goldmine-patent-miner.js` · patent research automation
- **Clinical Miner** · `~/nanoclaw/goldmine-clinical-miner.js` · clinical trial research
- **PhD Miner** · `~/nanoclaw/goldmine-phd-miner.js` · academic paper research
- **Soviet Miner** · `~/nanoclaw/goldmine-soviet-miner.js` · Soviet research archive mining

## Stopped Agents (all PM2 STOPPED — not dead, longer time horizons)
- **Cathedral Gazette** · `~/Cathedral/cathedral-gazette.js` · newsletter generator
- **Erickson Parables** · `~/Cathedral/emergence/erickson.js` · therapeutic parable generator
- **Emergence Harvester** · `~/Cathedral/agents/emergence-harvester.js` · emergence signal harvesting
- **Agent Triggers** · `~/Cathedral/emergence/agent-triggers.js` · event-driven agent activation
- **ORC Sequencer** · `~/Cathedral/emergence/orc-sequencer.js` · orchestrator sequencing
- **Production Engine** · `~/Cathedral/emergence/production-engine.js` · daily agent production cycle
- **Liveness** · `~/Cathedral/liveness.js` · system liveness monitoring
- **Cathedral Smoke Test** · `~/Cathedral/smoke-test.js` · integration test suite
- **Voice Chamber V2** · `~/Cathedral/voice-chamber-v2/server.js` · KITT voice interface
- **Elicitor** · `~/nanoclaw/elicitor/elicitor.js` · knowledge elicitation agent
- **Agency Executor** · `~/nanoclaw/agency/executor.js` · autonomous task execution
- **Synapse Pulse** · `~/nanoclaw/compound/synapse-pulse.js` · cross-system signal firing
- **DM Followup** · `~/Cathedral/agents/dm-followup.js` · conversation followup agent
- **Global Scout** · `~/Cathedral/property-scout/global-runner.js` · worldwide property scanning
- **Scout Bridge** · `~/Cathedral/agents/skills-scout-bridge.js` · scout capability bridge
