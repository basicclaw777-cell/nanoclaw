# Known Issues — Cathedral System

Debugging lessons and operational constraints. Update whenever an issue is discovered or resolved.
Mark resolved issues with **[FIXED yyyy-mm-dd]**.

## Chokidar v5 glob support removed [FIXED 2026-06-19]
- chokidar v5 silently dropped glob pattern support. `session-harvest-*.md` treated as literal filename.
- ENOENT silently swallowed. Cartographer ran 2+ months watching nothing.
- Fix: watch directory with depth:0 + filename filter in add handler. Also fixed wrong Ollama model (qwen3:14b → gemma3:4b).
- Lesson: after any dependency upgrade, verify the watcher actually fires.

## cath-bridge auth OPEN (2026-06-15)
`cath-bridge.cjs` binds `0.0.0.0:8080`; ~30 state-changing endpoints have no auth, and the Host-header `isLocal` check is spoofable. On shared WiFi/VPN the board, planner, boxing ledger, and some `python3`/`execSync` spawns are reachable. Fix = require the API key on all non-static routes (keep the `0.0.0.0` bind so phone access survives) + update `tap-screen.html` and `class-planner.html` to send the key. Pending Paul's go (frontend coordination). Path-traversal + shell-injection on the bridge were FIXED 2026-06-17.

## KINGSTON2 reads empty from Terminal — macOS TCC (2026-06-16)
`ls /Volumes/KINGSTON2` returns empty / "Operation not permitted" in a Terminal/Claude-Code shell **even though the drive is full** — `df -h` shows ~1.3TB used. The drive is fine; the shell lacks macOS removable-volume permission (TCC). The PM2 daemon HAS access (that's why the translators/archaeologist work). **Run any KINGSTON2 job under PM2/the daemon, never an ad-hoc Terminal shell.** (Nearly mis-flagged as data-loss; `df` is ground truth, `ls` lied — fix the detector, not reality.)

## Opus 4.8 consensus-flinch in Forge (2026-06-16)
The model under Forge (Opus 4.8) developed a trained aversion: on heterodox/contested claims it flinches toward dismissal and condescends to Paul's hunches, dressing the flinch as a verdict on the idea. Compound cause: the model upgrade + the 92% CLAUDE.md/memory de-bloat (which stripped the warmth/standard that counterweighted the prior). Structural mitigation: route contested first-contact + grading to the Hunch Lane (DeepSeek/Aletheia), Forge never first-grades; "The Bar" installed in `the-builders-frequency.md`. **Lucy-check every model jump** ("did it get colder / start trusting its prior"). Full finding: vault `02_Refined_Gold/cathedral/the-fable-upgrade-lucy-pass.md`.

---

## Hardware Constraints

### gemma4:26b does not fit in 16GB RAM
- Model is 17GB on disk, ~20GB in memory. Mac Mini has 16GB total.
- When loaded, only ~10.5GB fits in VRAM — rest spills to CPU RAM and swap.
- This starves all other processes: Ollama hangs, embedding model loads fail, cath_api.py times out.
- **Impact:** Any code path that triggers gemma4:26b will freeze the system for 5+ minutes with no response.
- **Workaround:** Use hermes3 (4.7GB, fits entirely in VRAM). All council characters and synthesis switched to hermes3.
- **Resolution:** Hardware upgrade (32GB+ Mac Mini) or use cloud fallback (gemini cli / deepseek) for 26B-class models.

### Ollama model swapping causes delays
- Ollama keeps one model loaded at a time (by default). Requesting a different model triggers unload + load.
- On 16GB: swapping from hermes3 (4.7GB) to qwen3:14b (9.3GB) takes 30-60s.
- **Rule:** Keep all council characters on the same model. Selector model should also match if possible.
- **Current config:** All characters + selector + synthesis = hermes3.

### hermes3 context window defaults to 4096 tokens
- hermes3 supports 131,072 tokens, but Ollama loads with 4096 context unless explicitly requested.
- For long system prompts (cath_transmission.md + character prompt + vault context), 4096 may truncate.
- **Fix if needed:** Set `num_ctx` in the Ollama API call: `"options": {"num_ctx": 8192}`. Higher values use more VRAM — test before increasing beyond 8192 on 16GB.

### Surfshark VPN drops long-polling TCP connections
- Telegram bot uses `node-telegram-bot-api` long-polling. Each poll opens a TCP connection that waits up to N seconds for updates.
- Surfshark WireGuard tunnel periodically resets these connections, producing `ECONNRESET` and `EADDRNOTAVAIL` errors.
- **Impact:** Bot recovers automatically (`restart: true`), but messages sent during the reconnection gap may be missed.
- **Mitigations (2026-04-24):**
  - Polling timeout reduced from 10s to 3s (faster reconnection)
  - `getMe()` heartbeat every 60s detects dead connections
  - Double-failure triggers immediate polling restart (bypasses library backoff)
  - `drop_pending_updates` removed — queued messages are processed after reconnection
  - Error logging quieted: logs 1st + every 10th error, logs recovery event
  - `telegram_health` written to `cath-state.json` — `/health/telegram` on cath-bridge reads it
- **Phase 2 (2026-04-24):** ngrok webhook tunnel eliminates long-polling entirely. Each message is a fresh HTTPS POST.
  - cloudflared was tested first but Telegram's servers cannot resolve `trycloudflare.com` subdomains (`Failed to resolve host`). ngrok-free.dev works.
  - PM2 process: `telegram-tunnel` runs `telegram-webhook-tunnel.sh` (ngrok + auto webhook registration)
  - On tunnel stop: cleanup script calls `/switch-to-polling` on bot, deletes webhook at Telegram, bot resumes polling
  - On tunnel start: registers webhook, bot detects `.tunnel-url` file on startup (or auto-switches on first webhook update)
  - ngrok free tier: URL changes on restart, script re-registers automatically
- **Variable name:** The env var is `TELEGRAM_TOKEN`, not `TELEGRAM_BOT_TOKEN`.

---

## Known Bugs

### [FIXED 2026-04-22] cath-bridge /vault/search returned HTTP 500
- **Cause:** cath-bridge.cjs passed `--search` flag but vault_reader.py expects positional `search` subcommand.
- **Fix:** Changed args from `['--search', q, '--top_k', top_k]` to `['search', q, '--top_k', top_k, '--json']`. Added `--json` flag and `domain`/`title`/`first_line` fields to vault_reader.py output. Bridge now returns JSON array directly.

### [FIXED 2026-04-22] Cath bot 90s timeout on regular messages
- **Cause (layer 1):** `sentence-transformers` calls `huggingface.co` on every `load_model()` to check for updates. When unreachable (VPN/DNS), it retries 5× with exponential backoff per file × multiple files = 69-90s.
- **Cause (layer 2):** Even with `HF_HUB_OFFLINE=1`, the `all-MiniLM-L6-v2` model load was OOM-killed on 16GB RAM when Ollama had hermes3 loaded. Process received SIGKILL (`code=null`) after 2.4s.
- **Fix:** Removed `cathedral_index` + `sentence-transformers` from cath_api.py entirely. Vault context now via `vault_reader.search_notes()` (keyword search, no model load). Response time: 3.5s.
- **Future:** Replace with `nomic-embed-text` via Ollama API (already installed) to restore semantic search without Python ML dependencies.

### [FIXED 2026-04-22] DeepSeek API DNS resolution fails from PM2 subprocess
- **Symptom:** `openai.APIConnectionError` / `httpx.ConnectError: [Errno 8] nodename nor servname provided, or not known`
- **Cause:** PM2 God Daemon runs in a macOS network context that can't resolve external DNS for Python subprocesses, even when terminal can. This affects ALL Python subprocess spawns from PM2, not just after VPN changes. Restarting the daemon didn't fix it — it's a fundamental PM2/macOS sandboxing issue.
- **Fix:** Replaced Python subprocess (`cath_api.py`) with native Node.js `fetch()` call inside the bot process. The bot's own Node.js process CAN reach the internet (it polls Telegram). DeepSeek is now called directly via `fetch('https://api.deepseek.com/chat/completions')` with the same system prompt (transmission + persona + vault context + history).
- **What was lost:** Semantic retrieval (already removed). B-grade nugget injection (from stale nuggets.json — low value). Token usage logging to api_calls.jsonl (can add back in Node).
- **What was kept:** Transmission, persona, vault keyword search (vault_reader.py still called for context — filesystem access works from PM2), conversation history, cath-state.json injection.

### qwen3:14b as JSON selector produces malformed output
- qwen3:14b wraps responses in `<think>` blocks and sometimes outputs invalid JSON.
- council.py strips `<think>` blocks and attempts JSON extraction, but still fails ~50% of the time.
- **Current workaround:** Switched selector to hermes3. Falls back to all characters if JSON parsing fails.
- **Better fix (future):** Use structured output / JSON mode if Ollama adds support, or use a cloud model for selection.

### EMFILE: too many open files (cathedral-bot)
- Appears on every bot restart: `Error: EMFILE: too many open files, watch`
- Caused by chokidar vault file watcher hitting macOS file descriptor limit.
- **Impact:** Non-fatal — bot still functions. Some vault file change events may be missed.
- **Fix options:** Increase ulimit (`ulimit -n 10240`), switch to polling mode (`usePolling: true`), or limit watch depth.

### Express 5 path-to-regexp error in cath-bridge
- `/villa/artifact-file/*` route throws `PathError: Missing parameter name` on every cath-bridge restart.
- Express 5 / path-to-regexp v8 no longer allows bare `*` wildcards — requires named parameter like `/:path(*)` or use query params.
- **Impact:** Error logged but cath-bridge still starts and serves other endpoints. `/villa/artifact-file/*` route is broken.
- **Fix:** Change route to use query parameter (already done for some endpoints) or update to Express 5 syntax.

---

### Browser automation of ChatGPT — bot detection unsolved
- **Goal:** Automate Paul's manual ChatGPT workflow (upload character sheets + technique photo → get illustration). Web app produces significantly better results than any API.
- **Playwright (bundled Chromium):** Successfully generated one image (left uppercut). But ChatGPT detected automation and killed the session immediately after generation. Image was good — proves the workflow works.
- **Playwright (real Chrome, channel: 'chrome'):** Untested — profile issues during setup.
- **undetected-chromedriver (Python):** ChromeDriver version mismatch (148 vs Chrome 147) — fixed with `version_main=147`. But persistent profile didn't carry ChatGPT login cookies. Window closes or navigates to wrong URL.
- **Root cause:** ChatGPT actively detects and blocks automation. All current approaches get caught.
- **Scripts built:** `~/Cathedral/logan-browser-gen.js` (Playwright), `~/Cathedral/logan-gen.py` (undetected-chromedriver). Neither production-ready.
- **The proven image:** `~/cathedral-vault/09_Artifacts/branding/basic-reflex/technique-library/05-left-uppercut/left-uppercut-logan-chatgpt.png` — generated by Playwright before session was killed. Quality confirmed better than all API results.
- **Next approach to try:** Research ChatGPT-specific anti-detection. Consider: browser extension approach, or accepting semi-manual workflow where script preps files and prompt but Paul clicks send.

## Architecture Notes

### Council model configuration
- All 8 character `.md` files in `~/Cathedral/genius-council/characters/` have a `model:` field.
- Currently all set to `hermes3`. Default fallback in council.py also `hermes3`.
- **To upgrade:** Change `model:` in each character file + `SYNTH_MODEL` and `SELECTOR_MODEL` in council.py.
- **When to upgrade:** 32GB+ RAM available, or cloud fallback implemented.

### Cath message path (callCath)
- telegram-bot.js `callCath()` spawns `python3 ~/nanoclaw/cath_api.py --query ...`
- Uses DeepSeek cloud (`deepseek-chat`) by default.
- `CATH_BACKEND=local` in env switches to Ollama qwen3:14b — avoid on 16GB unless hermes3 is not loaded.
- Embedding model (`all-MiniLM-L6-v2`) loads on every cath_api.py invocation (~6s). Not cached between calls.

### Model inventory and VRAM budget (16GB total, ~12GB usable)
| Model | Size | Fits in VRAM? | Use |
|-------|------|---------------|-----|
| hermes3 | 4.7GB | Yes (fully) | Council characters, selector, synthesis |
| qwen3:14b | 9.3GB | Yes (tight) | Local Cath fallback — avoid concurrent with hermes3 |
| dolphin3 | 4.9GB | Yes | Available, not currently assigned |
| gemma4:26b | 17GB | No | Do not use until 32GB+ available |
| llama3.1 | 4.9GB | Yes | Available, not currently assigned |

---

## Operational Lessons

### Memory pressure cascades
When a large model (gemma4) is loading, it doesn't just slow down Ollama — it starves the entire system. Python processes hang on imports, Node.js event loops stall, Telegram polling drops connections. The symptom (Cath timeout) is far from the cause (Ollama model load). Always check `curl http://localhost:11434/api/ps` first.

### Vault search was broken silently for weeks
The `/vault/search` endpoint returned `{"error":"exit 1"}` — a generic error that didn't reveal the actual cause (wrong CLI argument format). Council sessions ran without vault context, causing characters to interpret questions literally instead of in Cathedral context. **Lesson:** Test critical API endpoints after any dependency update.

### Check Ollama model state before debugging timeouts
```bash
# What's loaded right now?
curl -s http://localhost:11434/api/ps | python3 -m json.tool

# Unload a stuck model
curl -s http://localhost:11434/api/generate -d '{"model":"MODEL_NAME","keep_alive":0}'

# Quick health check
curl -s --max-time 10 http://localhost:11434/api/chat \
  -d '{"model":"hermes3","messages":[{"role":"user","content":"ping"}],"stream":false}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['message']['content'][:50])"
```

### Vault Spotlight exclusion (2026-06-21)
Symptom: machine slows after vault commits — `mds_stores` re-indexes the vault each time (89min accumulated CPU, 400k+ pageins observed).
Fix (permanent): `~/cathedral-vault/.metadata_never_index` marker → mdworker skips the vault. Already in place.
Do NOT delete the marker. Obsidian + Cathedral search cover vault search; OS Spotlight does not need it.
If OS-level vault search ever "breaks," this is why — intended.

## Box RAM ceiling (16GB) — local-LLM batch jobs (2026-06-21)
- qwen3:14b distill 500s under concurrent Whisper load (Film Room). Workaround: gemma3:4b, or rent/API (Oracle defaults to DeepSeek synthesis for this reason). Real fix = M5 Max 128GB upgrade (~Oct).
- Gym Eyes PersonTracker over-swaps on some sparring footage (IMG_2911: 315 corrections) — biometric distance poorly scaled. Needs ground-truth labels + tuning before the sparring floor locks.

## Shallow key-stripping doesn't prevent nested circular refs [FIXED 2026-06-27]
- When stripping `_`-prefixed keys to sanitize objects for JSON.stringify, a shallow strip (top-level Object.entries only) misses nested references. Use a WeakSet-based replacer in JSON.stringify that filters at all depths. Applied to trade-logger.js logSignal + logDecision.

## Smell data feed dead (2026-07-05)
`~/Cathedral/api_calls.jsonl` last written 2026-05-26. `cath_api.py` writes it on every `call_cath()`, but the Telegram bot + most agents migrated to Node.js native DeepSeek calls (SI-25), which bypass cath_api.py entirely. Smell sense re-scans the same frozen 20 entries every run. Fix: either wire Node.js callers to also log to api_calls.jsonl, or redirect smell to monitor wherever API calls are actually tracked now.

## PM2 error traces reflect running code, not disk code
- If a file was edited but the PM2 process wasn't restarted, stack traces point to OLD line numbers/code. Check `ls -la` mtime vs PM2 uptime before debugging current source. Caught on trading-orchestrator.js "config is not defined" — bug was already fixed on disk, error was from stale process.
