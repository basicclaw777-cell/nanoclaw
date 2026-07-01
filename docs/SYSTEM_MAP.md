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

## Boxing harvest
- **Pandamericano harvest** · `panam-harvest.cjs` (whisper.cpp ES transcription) + `panam-structure.cjs` (DeepSeek→gemma3 structuring) · trigger: manual `pm2 start` (must run under PM2 — daemon has KINGSTON2 disk access; Terminal is TCC-blocked) · 88GB Cuban camp video → 130 Spanish transcripts (vault 00_Staging/panamericano) → bilingual framework · zero-to-pennies cost · door `/pandamericano` · doc: vault `06_Methods/pandamericano-methodology-framework.md`. Calibration sampler: `panam-sample.cjs`. Query: `/panam <question>` (telegram-bot.js → `panam-query.js`, retrieval + grounded answer, DeepSeek/gemma).

## Doors (web UIs, served on :8080 by cath-bridge.cjs)
- **Pandamericano Framework** · `pandamericano-framework.html` · route `/pandamericano` (cath-bridge.cjs) · lobby card in BR district · day 1–17 progression + 177 transferable principles, Spanish+English · doc: vault `06_Methods/pandamericano-methodology-framework.md`
- **Lorenz Attractor** · `lorenz-attractor.html` · route `/lorenz-attractor.html` (cath-bridge.cjs) · lobby card in Research district · live RK4 strange-attractor render, calibration-standard door · doc: vault `02_Refined_Gold/epistemology/lorenz-attractor-calibration-standard.md`

- **Agent Workspace** · `~/Cathedral/control-panel/agent-workspace.html` · route `/agent-workspace` (cath-bridge.cjs) · 23 agents, grades, scores, sparklines · doc: BUILD_LOG 2026-06-19

## BR website
- **BR Website V4** · `~/basic-reflex/website/index.html` · manual (no deploy yet) · 4 versions preserved (v1,v3,v4) · parked, needs artwork gen · doc: BUILD_LOG 2026-06-17b

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
