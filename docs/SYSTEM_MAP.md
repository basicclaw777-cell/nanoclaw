# Cathedral System Map

> One line per built system: name · entry point · trigger · doc. Grep this before building (SI-04).
> STUB — build the full inventory from `node cathedral-manifest.js --json` cross-referenced with docs/BUILD_LOG.md. Until then, BUILD_LOG.md + the manifest are the source of truth.

_(pending full population — see KNOWN_ISSUES / the 2026-06-12 migration)_

## Research lanes
- **The Hunch Lane** · `hunch-lane.js` (nanoclaw, ESM) · trigger: `/hunch <hunch>` (telegram-bot.js) + CLI `node hunch-lane.js "..."` · retrieve-before-derive → show-raw-data → route grade to differently-biased reasoner (DeepSeek/Aletheia, NOT Forge) · fixes OmissionOS Deflection (CLAUDE.md SI-44) · doc: vault `02_Refined_Gold/cathedral/omissionos-in-forge-2026-06-15.md`

## Doors (web UIs, served on :8080 by cath-bridge.cjs)
- **Lorenz Attractor** · `lorenz-attractor.html` · route `/lorenz-attractor.html` (cath-bridge.cjs) · lobby card in Research district · live RK4 strange-attractor render, calibration-standard door · doc: vault `02_Refined_Gold/epistemology/lorenz-attractor-calibration-standard.md`

## Ancient Corpus pipeline
- **Babylon Translator** · `babylon-translator.js` + `babylon-fetch.js` (nanoclaw) · trigger: manual `--prod` (deliberate prod run, pending) · Akkadian→English + entities, cost-metered, DeepSeek/hermes3 · calibrated 2026-06-15, bulk run pending · doc: vault `02_Refined_Gold/cathedral/the-non-western-veins.md` + BUILD_LOG 2026-06-15
