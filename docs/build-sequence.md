# Obliteratus Build Sequence

Build in this order. Each session = one component. Test before moving on.

## Session 0: Prerequisites
- Run Phase 2 Vortex Analyst (`node ~/nanoclaw/vortex-analyst.js`)
- Wire Open Web UI conversations into universal memory (auto-save to ~/raw-chats/)
- Fix bot auto-start on login

## Session 1: Embedding Layer
Build `~/nanoclaw/vault-embedder.js`
- Install nomic-embed-text via Ollama
- Scan ~/cathedral-vault/ recursively, embed all .md nuggets
- Store in SQLite table `vault_embeddings` (id, file_path, domain, tags, title, first_line, wikilinks, content_hash, embedding BLOB, created_at)
- File watcher for auto-re-embedding on vault changes
- Semantic search function (cosine similarity, top-k, optional domain filter)
- Wire `/search [query]` into Telegram bot
- **Spec:** @docs/master-architecture.md Section 6, Phase 1

## Session 2: Epistemic Triage
Build `~/nanoclaw/epistemic-triage.js`
- 5-dimension scoring: Structural (0.30), Corroboration (0.25), Experimental (0.25), Provenance (0.15), Suppression (0.05)
- Grades A/B/C/D/F by composite score
- Disinfo detection layer
- Store system prompts in ~/nanoclaw/prompts/
- Test with sample claim + vault nuggets
- **Spec:** @docs/master-architecture.md Section 2

## Session 3: The Librarian
Build `~/nanoclaw/sages/librarian.json` + `~/nanoclaw/librarian-engine.js`
- Compressed vault index in system prompt
- Source diversity analysis, echo chamber detection
- Coverage grading (DEEP/ADEQUATE/THIN/GAP)
- Counter-evidence surfacing
- Wire `/librarian` into Telegram
- **Spec:** @docs/honest-interlocutors.md Section 1

## Session 4: The Translator
Build `~/nanoclaw/skins/general/translator.json`
- Reads paul-profile.json lexicon on each invocation
- Converts external text to Paul's sovereign language
- Wire `/translate [text]` into Telegram
- **Spec:** @docs/master-architecture.md Section 3 (Translator subsection)

## Session 5: The Physicist
Build `~/nanoclaw/sages/physicist.json`
- First-principles physics analysis
- Discloses when defaulting to training data
- Distinguishes DISPROVEN/UNSUPPORTED/UNTESTED/INCONCLUSIVE/SUPPORTED/VERIFIED
- Wire `/physicist` into Telegram
- **Spec:** @docs/honest-interlocutors.md Section 2

## Session 6: Archivist + Experimentalist + Council
Build `~/nanoclaw/sages/archivist.json` (provenance specialist, sage)
Build `~/nanoclaw/skins/general/experimentalist.json` (show-me voice, skin)
Build `~/nanoclaw/council-engine.js` (runs all 4 interlocutors, surfaces disagreements)
- Wire `/archivist`, `/experimentalist`, `/council [topic]` into Telegram
- **Spec:** @docs/honest-interlocutors.md Sections 3, 4, 5

## Session 7: Obliteratus Engine
Build `~/nanoclaw/obliteratus-engine.js` (6-stage pipeline)
1. DECOMPOSE (qwen3:14b) → sub-queries
2. RETRIEVE (vault-embedder.js) → nugget clusters
3. REASON (hermes3/dolphin3) → raw claims
4. TRIAGE (epistemic-triage.js) → graded claims
5. SYNTHESIZE (hermes3 or Claude Sonnet) → forensic report
6. ARCHIVE (file write) → new vault nuggets

Build `~/nanoclaw/report-template.js` (standard report format)
- Wire `/obliteratus [question]` into Telegram
- **Spec:** @docs/master-architecture.md Sections 5, 6

## Session 8: Gold Extraction
Build `~/nanoclaw/gold-extractor.js`
- Ratio convergence detection (same values across 3+ domains)
- Geometric recurrence detection (same forms across independent researchers)
- Suppression pattern matching (5-stage playbook across decades)
- Bridge detection, open thread detection
- Cron every 6 hours + `/gold` Telegram command
- **Spec:** @docs/master-architecture.md Section 4

## Session 9: Vault Metabolism + Belief Tracker + Negative Space
Build `~/nanoclaw/vault-metabolism.js` (nugget health states, weekly scan, /metabolism)
Build `~/nanoclaw/belief-tracker.js` (position tracking, drift alerts, /trajectory)
Build `~/nanoclaw/negative-space.js` (6th Gold Extractor pass, absence detection)
- **Spec:** @docs/addendum.md Sections 2, 3, 4

## Session 10: Sandboxes
Build `~/nanoclaw/sandboxes/portal-engine.js`
- Tesla Intelligence Room (1943), Schauberger's Forestry Station (1944), Rife's Laboratory (1934)
- Contradiction engine: characters push back based on vault evidence
- Document generation: `/sandbox [name] document [title]`, claims tagged [VAULT]/[EXTRAPOLATED]
- Wire `/sandbox [name]` into Telegram
- **Spec:** @docs/master-architecture.md Section 3, @docs/addendum.md Section 5

## Session 11: Convergence Atlas + Oracle
Build `~/nanoclaw/convergence-atlas.js` (3 substrate layers, meta-convergence alerts, Obsidian canvas output)
Build Oracle mode in obliteratus-engine.js (speculative synthesis, assumption disclosure, auto-queued for Council)
- Wire `/atlas` and `/oracle` into Telegram
- **Spec:** @docs/addendum.md Sections 6, 7

## Session 12: LoRA Training
Build `~/nanoclaw/training/prepare-training-data.js` (vault → JSONL instruction-response pairs)
Document MLX training process for M-series Mac
Build `~/nanoclaw/training/validate-model.js` (Vortex scoring comparison)
Create Modelfile template for hermes3-cathedral
- **Spec:** @docs/master-architecture.md Section 4 (Training Pipeline)
