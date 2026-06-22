# Cathedral System Map

> One line per built system: name · entry point · trigger · doc. Grep this before building (SI-04).
> STUB — build the full inventory from `node cathedral-manifest.js --json` cross-referenced with docs/BUILD_LOG.md. Until then, BUILD_LOG.md + the manifest are the source of truth.

_(pending full population — see KNOWN_ISSUES / the 2026-06-12 migration)_

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

## Ancient Corpus pipeline
- **Babylon Translator** · `babylon-translator.js` + `babylon-fetch.js` (nanoclaw) · trigger: manual `--prod` (deliberate prod run, pending) · Akkadian→English + entities, cost-metered, DeepSeek/hermes3 · calibrated 2026-06-15, bulk run pending · doc: vault `02_Refined_Gold/cathedral/the-non-western-veins.md` + BUILD_LOG 2026-06-15

## Cathedral knowledge
- **The Oracle** · cath-bridge.cjs `/oracle` + `/oracle/ask` · trigger: localhost:8080/oracle (8888 sidebar) · vault RAG, gold-weighted, DeepSeek synth, cited · doc: BUILD_LOG 2026-06-21 night
- **The Quarry** · `quarry-watcher.js` (PM2 `quarry`) · trigger: drop file in ~/Downloads/quarry/ · capture+route+audio-transcribe+notify · doc: BUILD_LOG 2026-06-21 night
- **Film Room** · `~/basic-reflex/gym-eyes/film_room.py` + `/gym-eyes/film-room` · trigger: `python3 film_room.py --channel <url>` · YouTube->lesson cards by 10-block · PARKED (distill RAM) · doc: BUILD_LOG 2026-06-21 night

## Basic Reflex — coaching tools
- **drill-player external motion import** · `~/basic-reflex/gym-eyes/drill-player.html` `playClip()` · trigger: localhost:8080/gym-eyes/drill-player → ▶ Motion Clip · plays raw joint-position clips (mocap/MediaPipe/FBX contract `{t,joints:{name:[x,y,z]}}`) · doc: BUILD_LOG 2026-06-21

## Forge maintenance
- **Forge model pin** · `~/.claude/settings.json` `"model": "claude-opus-4-6"` · trigger: every Claude Code launch · pre-fable model (4.8=fable flinch); terminal Forge build-only per soul file · doc: BUILD_LOG 2026-06-22 + forge-regression-diagnostic.md
