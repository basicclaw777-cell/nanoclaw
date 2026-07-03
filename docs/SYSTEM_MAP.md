# Cathedral System Map

> One line per built system: name · entry point · trigger · doc. Grep this before building (SI-04).
> STUB — build the full inventory from `node cathedral-manifest.js --json` cross-referenced with docs/BUILD_LOG.md. Until then, BUILD_LOG.md + the manifest are the source of truth.

_(pending full population — see KNOWN_ISSUES / the 2026-06-12 migration)_

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

## Agent improvement
- **Emergence Signal Router** · `~/Cathedral/emergence/emergence-signal-router.js` · PM2 #168 cron 05:25 HKT · reads monitor/watcher/health/scores → generates corrective planner tasks · doc: BUILD_LOG 2026-06-19

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

## The Mirror — Digital Paul
- **The Mirror** · `~/nanoclaw/mirror.html` · route `/mirror` (cath-bridge.cjs ~line 2316) · conversational Digital Paul, 4 modes (Warm-up/Recall/Challenge/Disagree), DeepSeek+hermes3, vault RAG per query · doc: BUILD_LOG 2026-07-01
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

## Forge maintenance
- **Forge model pin** · `~/.claude/settings.json` `"model": "claude-opus-4-6"` · trigger: every Claude Code launch · pre-fable model (4.8=fable flinch); terminal Forge build-only per soul file · doc: BUILD_LOG 2026-06-22 + forge-regression-diagnostic.md
