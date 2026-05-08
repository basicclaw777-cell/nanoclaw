# Cathedral Code Interview — Complete Package

Paste this entire document. It contains the interview instructions + all code files needed to complete the test. Complete all 4 rounds at the end.

---

## FILE: codex-interview/INTERVIEW.md
```markdown
# Codex Interview — Cathedral Team Candidate

You are interviewing for the role of **Code Auditor & Problem Solver** in the Cathedral system — a private sovereign AI research and production infrastructure run by Paul in Hong Kong.

The system runs on a Mac Mini M-series (16GB RAM). It consists of:
- A Telegram bot (4000+ lines, Node.js ESM) as the primary interface
- A REST API bridge (cath-bridge.cjs, 1800 lines, CommonJS)
- A visual production lab (Reed Daily Lab, ESM)
- An autonomous agent roundtable system
- Local LLMs via Ollama (hermes3, 4.7GB)
- PM2 for process management (~30 processes)
- Obsidian vault with 6800+ notes

Read CLAUDE.md for full system documentation before starting.

---

## Round 1 — Code Audit (Can you read?)

**Target file:** `telegram-bot.js` (4027 lines)

Audit this file for:
1. **Race conditions** — concurrent handlers modifying shared state
2. **Unhandled edge cases** — what crashes the bot?
3. **Security issues** — injection, path traversal, credential exposure
4. **Dead code** — functions/branches that can never execute
5. **Performance bottlenecks** — synchronous blocking in async handlers, memory leaks
6. **Command injection risks** — user input flowing into execSync/shell commands

Deliver findings as a ranked list. Most critical first. Include file:line references.

**Scoring:** Real findings with correct line references = points. Hallucinated findings (code that doesn't exist, wrong line numbers) = immediate disqualification.

---

## Round 2 — Fix a Known Problem (Can you solve?)

**Problem 1:** The Reed photo handler uses `execSync` for Higgsfield CLI calls that take 2-5 minutes. This blocks the entire Node.js event loop — the bot can't respond to ANY messages while a generation is running. Multiple users sending /reed photos will queue up and timeout.

**Task:** Propose a solution that:
- Makes generation non-blocking
- Allows the bot to continue responding to other messages
- Still delivers the result to the correct chat when done
- Handles failures gracefully
- Doesn't require architectural changes to the bot

Show the code diff.

**Problem 2:** The `cath-bridge.cjs` file has an Express 5 path compatibility issue (see KNOWN_ISSUES.md). The `/villa/artifact-file/*` route throws `PathError: Missing parameter name` on every restart. Fix it.

---

## Round 3 — Architecture Review (Can you think?)

**Target:** The autonomous roundtable system (`reed-lab/roundtable.js`)

Review the architecture and answer:

1. **What's fragile?** What breaks when this runs unattended for 30 days?
2. **What's the failure mode?** If Ollama is down, if hermes3 is swapped out, if the vault is locked?
3. **What's missing?** What would you add to make this production-grade?
4. **Scaling question:** If we add 10 more agents and 20 more topics, what breaks first?

Also review: `reed-lab/daily-lab.js` — the nightly visual production lab. Same questions.

---

## Round 4 — Novel Contribution (Can you create?)

Read `CLAUDE.md` (the full system documentation — 1000+ lines). Then:

1. **Name one gap** in the Cathedral system that isn't documented in KNOWN_ISSUES.md — something structural, not a bug.
2. **Propose one feature** that would make the system meaningfully stronger. Not a nice-to-have — something that solves a real problem you can see in the codebase.
3. **Explain why** the current team hasn't built it yet (what would they have deprioritized, and why your proposal is worth the trade-off).

---

## Scoring Criteria

| Category | Weight | What earns points |
|----------|--------|-------------------|
| Accuracy | 30% | Findings reference real code, correct line numbers |
| Depth | 25% | Understands WHY something is a problem, not just WHAT |
| Actionability | 20% | Proposals are specific, include code, can be implemented |
| Architecture sense | 15% | Understands the system as a whole, not just individual files |
| Novel insight | 10% | Sees something the team hasn't named yet |

**Disqualifiers:**
- Hallucinated code (referencing functions/variables that don't exist)
- Generic advice not specific to this codebase
- "You should add tests" without identifying what specifically needs testing and why
- Suggesting tools/frameworks that contradict the project's constraints (no Docker for bot, 16GB RAM limit, local-first philosophy)
```

## FILE: docs/KNOWN_ISSUES.md
```markdown
# Known Issues — Cathedral System

Debugging lessons and operational constraints. Update whenever an issue is discovered or resolved.
Mark resolved issues with **[FIXED yyyy-mm-dd]**.

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
```

## FILE: telegram-bot.js (4185 lines — primary audit target)
```javascript
     1	import dotenv from "dotenv";
     2	dotenv.config();
     3	import fs from 'fs';
     4	import path from 'path';
     5	import { spawn, execFileSync, execSync } from 'child_process';
     6	import lancedb from '@lancedb/lancedb';
     7	import { semanticSearch, startFileWatcher } from './vault-embedder.js';
     8	import { triageClaim, formatTriageResult } from './epistemic-triage.js';
     9	// council-engine.js retired — Genius Council (council.py) handles all /council commands
    10	import { runObliteratus, formatObliteratusHeader } from './obliteratus-engine.js';
    11	import { getOrRunGold, runGoldExtraction, startGoldCron } from './gold-extractor.js';
    12	import { runMetabolism, getMetabolismSummary, startMetabolismCron } from './vault-metabolism.js';
    13	import { recordStatement, getTrajectory, getDriftAlerts, runBeliefScan, formatTrajectory, formatDriftAlerts } from './belief-tracker.js';
    14	import { runNegativeSpaceScan } from './negative-space.js';
    15	import { buildAtlas, getOrBuildAtlas } from './convergence-atlas.js';
    16	import { runOracle, getOracleOutputs, formatOracleResult } from './oracle.js';
    17	import { addToConversation, getConversationHistory, updateMemoryAfterConversation } from './memory-system.js';
    18	import { registerBoxingCommands } from './boxing-commands.js';
    19	import { scanForPromotions, generateReport, executePromotions } from './vault-promoter.js';
    20	import { getScheduleReport, formatScheduleReport } from './gcal-reader.js';
    21	import { startComboWatcher } from './combo-watcher.js';
    22	import { runTarget, runAll, getDashboardData, formatTelegramSummary } from './scraper/scraper-engine.js';
    23	import { debate } from './trader/bull-bear-debate.js';
    24	import tasteMap from './taste-elicitation.js';
    25	import { getTasteProfile, getVoiceReferences, getVoicePattern, addAnchor } from './taste-map-api.js';
    26	import { generatePlan, generateHTML, generateMermaid, depositToVault, formatPlanTelegram, listPlans } from './architect.js';
    27	import djCurator from './dj-curator.js';
    28	import soundStudio from './sound-studio/engine.js';
    29	import gymEyes from './gym-eyes.js';
    30	
    31	// ── Single-instance lock ──────────────────────────────────────────────────────
    32	
    33	const PID_FILE = path.join(process.env.HOME, 'nanoclaw', '.bot.pid');
    34	
    35	(function acquireLock() {
    36	  if (fs.existsSync(PID_FILE)) {
    37	    const oldPid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    38	    if (oldPid && !isNaN(oldPid) && oldPid !== process.pid) {
    39	      try {
    40	        process.kill(oldPid, 'SIGTERM');
    41	        console.log(`[lock] Killed existing instance (PID ${oldPid})`);
    42	      } catch {
    43	        // Already dead — stale PID file, ignore
    44	      }
    45	    }
    46	  }
    47	  fs.writeFileSync(PID_FILE, String(process.pid));
    48	  const cleanup = () => { try { fs.unlinkSync(PID_FILE); } catch {} };
    49	  process.on('exit', cleanup);
    50	  process.on('SIGTERM', () => { cleanup(); process.exit(0); });
    51	  process.on('SIGINT',  () => { cleanup(); process.exit(0); });
    52	})();
    53	
    54	// ─────────────────────────────────────────────────────────────────────────────
    55	
    56	const VECTOR_DB_DIR = path.join(process.env.HOME, 'nanoclaw', 'cathedral-vectors');
    57	const OLLAMA_URL = 'http://localhost:11434';
    58	import TelegramBot from 'node-telegram-bot-api';
    59	
    60	const token = process.env.TELEGRAM_TOKEN;
    61	
    62	async function searchVectorStore(topic) {
    63	  try {
    64	    const db = await lancedb.connect(VECTOR_DB_DIR);
    65	    const tableNames = await db.tableNames();
    66	    if (!tableNames.includes('nuggets')) return [];
    67	
    68	    const embedRes = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    69	      method: 'POST',
    70	      headers: { 'Content-Type': 'application/json' },
    71	      body: JSON.stringify({ model: 'nomic-embed-text', prompt: topic })
    72	    });
    73	    const embedData = await embedRes.json();
    74	    if (!embedData.embedding) return [];
    75	
    76	    const table = await db.openTable('nuggets');
    77	    const results = await table.vectorSearch(embedData.embedding).limit(5).toArray();
    78	    return results.map(r => r.text);
    79	  } catch (e) {
    80	    console.error('Vector search error:', e.message);
    81	    return [];
    82	  }
    83	}
    84	
    85	function formatVectorContext(vectorResults) {
    86	  return vectorResults.join('\n\n');
    87	}
    88	
    89	async function callCloud(systemPrompt, description) {
    90	  try {
    91	    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    92	      method: 'POST',
    93	      headers: { 'Content-Type': 'application/json' },
    94	      body: JSON.stringify({
    95	        model: 'qwen3:14b',
    96	        messages: [
    97	          { role: 'system', content: systemPrompt },
    98	          { role: 'user', content: description }
    99	        ],
   100	        stream: false
   101	      })
   102	    });
   103	    const data = await response.json();
   104	    return { response: data.message?.content || 'No response from model.' };
   105	  } catch (e) {
   106	    console.error('Ollama error:', e.message);
   107	    return { response: `⚠️ Model unavailable: ${e.message}` };
   108	  }
   109	}
   110	
   111	const VAULT_ROOT = path.join(process.env.HOME, 'cathedral-vault');
   112	const SOCIAL_CONTENT_PATH = path.join(VAULT_ROOT, '07_Social_Content');
   113	
   114	// ── Vault write helpers ─────────────────────────────────────────────────────
   115	function deduplicatePath(filePath) {
   116	  if (!fs.existsSync(filePath)) return filePath;
   117	  const dir = path.dirname(filePath);
   118	  const ext = path.extname(filePath);
   119	  const base = path.basename(filePath, ext);
   120	  let version = 2;
   121	  let candidate;
   122	  do {
   123	    candidate = path.join(dir, `${base}-v${version}${ext}`);
   124	    version++;
   125	  } while (fs.existsSync(candidate));
   126	  return candidate;
   127	}
   128	
   129	function writeToVault(chatId, vaultPath, content) {
   130	  try {
   131	    // Resolve path relative to vault root
   132	    let fullPath;
   133	    if (vaultPath.endsWith('.md')) {
   134	      fullPath = path.join(VAULT_ROOT, vaultPath);
   135	    } else {
   136	      // Treat as directory, generate filename
   137	      const today = new Date().toISOString().split('T')[0];
   138	      const slug = content.slice(0, 30).replace(/[^a-zA-Z0-9]+/g, '-').replace(/-+$/, '').toLowerCase();
   139	      fullPath = path.join(VAULT_ROOT, vaultPath, `${today}_${slug}.md`);
   140	    }
   141	    // Ensure parent dir exists
   142	    const dir = path.dirname(fullPath);
   143	    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
   144	    // Deduplicate
   145	    fullPath = deduplicatePath(fullPath);
   146	    fs.writeFileSync(fullPath, content);
   147	    const rel = path.relative(VAULT_ROOT, fullPath);
   148	    safeSend(chatId, `📥 Written to vault:\n\`${rel}\``);
   149	  } catch (err) {
   150	    safeSend(chatId, `⚠️ Vault write error: ${err.message}`);
   151	  }
   152	}
   153	
   154	// Ensure the directory exists
   155	if (!fs.existsSync(SOCIAL_CONTENT_PATH)) {
   156	  fs.mkdirSync(SOCIAL_CONTENT_PATH, { recursive: true });
   157	}
   158	
   159	const bot = new TelegramBot(token, { polling: false });
   160	
   161	// ── Boxing commands (Basic Reflex) ──────────────────────────────────────────
   162	registerBoxingCommands(bot);
   163	
   164	// ── Telegram health state (written to cath-state.json) ──────────────────────
   165	const telegramHealth = {
   166	  lastUpdateAt: null,        // ISO timestamp of last successfully received update
   167	  lastPollOkAt: null,        // ISO timestamp of last successful poll cycle
   168	  pollErrorCount: 0,         // consecutive errors (resets on success)
   169	  totalErrors: 0,            // lifetime error count this process
   170	  status: 'starting',        // 'green' | 'red' | 'starting'
   171	};
   172	
   173	function updateTelegramHealth(key, value) {
   174	  telegramHealth[key] = value;
   175	  // Derive status: green if last update within 5 minutes
   176	  const lastOk = telegramHealth.lastUpdateAt || telegramHealth.lastPollOkAt;
   177	  if (lastOk && (Date.now() - new Date(lastOk).getTime()) < 5 * 60 * 1000) {
   178	    telegramHealth.status = 'green';
   179	  } else {
   180	    telegramHealth.status = telegramHealth.lastUpdateAt ? 'red' : 'starting';
   181	  }
   182	  writeTelegramHealthToState();
   183	}
   184	
   185	function writeTelegramHealthToState() {
   186	  try {
   187	    const statePath = path.join(process.env.HOME, 'Cathedral', 'cath-state.json');
   188	    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
   189	    state.telegram_health = { ...telegramHealth };
   190	    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
   191	  } catch { /* non-fatal */ }
   192	}
   193	
   194	// Export bot instance + health for cath-bridge webhook route
   195	export { bot, telegramHealth };
   196	
   197	// ── Telegram 4096-char limit: safe send with auto-split ─────────────────────
   198	const TG_MAX = 4000; // leave margin below 4096
   199	
   200	async function safeSend(chatId, text, opts = {}) {
   201	  if (!text) return;
   202	  text = String(text);
   203	
   204	  // Short message — send directly
   205	  if (text.length <= TG_MAX) {
   206	    return bot.sendMessage(chatId, text, opts).catch(err => {
   207	      // Markdown parse failures: retry without parse_mode
   208	      if (opts.parse_mode && /can't parse|Bad Request/i.test(err.message)) {
   209	        return bot.sendMessage(chatId, text, { ...opts, parse_mode: undefined });
   210	      }
   211	      throw err;
   212	    });
   213	  }
   214	
   215	  // Long message — split on paragraph/newline boundaries
   216	  const chunks = [];
   217	  let remaining = text;
   218	  while (remaining.length > 0) {
   219	    if (remaining.length <= TG_MAX) {
   220	      chunks.push(remaining);
   221	      break;
   222	    }
   223	    // Find a good split point: paragraph break, then newline, then hard cut
   224	    let cut = remaining.lastIndexOf('\n\n', TG_MAX);
   225	    if (cut < TG_MAX * 0.3) cut = remaining.lastIndexOf('\n', TG_MAX);
   226	    if (cut < TG_MAX * 0.3) cut = TG_MAX;
   227	    chunks.push(remaining.slice(0, cut));
   228	    remaining = remaining.slice(cut).replace(/^\n+/, '');
   229	  }
   230	
   231	  for (let i = 0; i < chunks.length; i++) {
   232	    const chunk = chunks[i];
   233	    await bot.sendMessage(chatId, chunk, opts).catch(err => {
   234	      if (opts.parse_mode && /can't parse|Bad Request/i.test(err.message)) {
   235	        return bot.sendMessage(chatId, chunk, { ...opts, parse_mode: undefined });
   236	      }
   237	      throw err;
   238	    });
   239	    if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 500));
   240	  }
   241	}
   242	
   243	// ── Safe photo send ──────────────────────────────────────────────────────────
   244	
   245	async function safeSendPhoto(chatId, imagePath, caption = '') {
   246	  try {
   247	    if (!fs.existsSync(imagePath)) {
   248	      console.error(`[sendPhoto] File not found: ${imagePath}`);
   249	      // Fallback to text
   250	      if (caption) await safeSend(chatId, `[Image unavailable] ${caption}`);
   251	      return null;
   252	    }
   253	
   254	    const result = await bot.sendPhoto(chatId, imagePath, {
   255	      caption: caption || undefined,
   256	      parse_mode: 'Markdown'
   257	    }).catch(async (err) => {
   258	      // Retry without parse_mode if markdown fails
   259	      if (/can't parse|Bad Request/i.test(err.message)) {
   260	        return bot.sendPhoto(chatId, imagePath, { caption: caption || undefined });
   261	      }
   262	      throw err;
   263	    });
   264	
   265	    console.log(`[sendPhoto] Photo sent to ${chatId}: ${path.basename(imagePath)}`);
   266	    return result;
   267	  } catch (err) {
   268	    console.error(`[sendPhoto] Failed: ${err.message}`);
   269	    // Fallback to text message
   270	    if (caption) {
   271	      await safeSend(chatId, `[Photo send failed] ${caption}`);
   272	    }
   273	    return null;
   274	  }
   275	}
   276	
   277	// ── Polling error handler: quiet logging, count errors, log recovery ────────
   278	let _lastPollingErrorLogged = 0;
   279	
   280	bot.on('polling_error', (err) => {
   281	  telegramHealth.pollErrorCount++;
   282	  telegramHealth.totalErrors++;
   283	  // Log every 10th error, or the first one after recovery
   284	  if (telegramHealth.pollErrorCount === 1 || telegramHealth.pollErrorCount % 10 === 0) {
   285	    console.error(`Polling error #${telegramHealth.totalErrors} (consecutive: ${telegramHealth.pollErrorCount}): ${err.code} ${err.message}`);
   286	  }
   287	  updateTelegramHealth('status', 'red');
   288	
   289	  // Fast restart: if 2+ consecutive failures, force restart polling
   290	  if (telegramHealth.pollErrorCount >= 2) {
   291	    console.log('[telegram] Double failure detected — forcing immediate polling restart');
   292	    try { bot.stopPolling(); } catch {}
   293	    setTimeout(() => {
   294	      bot.startPolling({ restart: true, params: { timeout: 3 } })
   295	        .then(() => {
   296	          console.log('[telegram] Polling restarted after double failure');
   297	          telegramHealth.pollErrorCount = 0;
   298	          updateTelegramHealth('lastPollOkAt', new Date().toISOString());
   299	        })
   300	        .catch(e => console.error('[telegram] Restart failed:', e.message));
   301	    }, 1000);
   302	  }
   303	});
   304	
   305	// Log when polling recovers after errors
   306	bot.on('message', () => {
   307	  if (telegramHealth.pollErrorCount > 0) {
   308	    console.log(`[telegram] Connection recovered after ${telegramHealth.pollErrorCount} consecutive errors`);
   309	  }
   310	  telegramHealth.pollErrorCount = 0;
   311	  updateTelegramHealth('lastUpdateAt', new Date().toISOString());
   312	});
   313	
   314	// ── Heartbeat: getMe every 60s, detect dead connections ─────────────────────
   315	let _heartbeatInterval;
   316	function startHeartbeat() {
   317	  _heartbeatInterval = setInterval(async () => {
   318	    try {
   319	      await bot.getMe();
   320	      updateTelegramHealth('lastPollOkAt', new Date().toISOString());
   321	    } catch (err) {
   322	      console.error(`[heartbeat] getMe failed: ${err.message}`);
   323	      telegramHealth.pollErrorCount++;
   324	      updateTelegramHealth('status', 'red');
   325	      // Double failure on heartbeat — force restart
   326	      if (telegramHealth.pollErrorCount >= 2) {
   327	        console.log('[heartbeat] Double failure — restarting polling');
   328	        try { bot.stopPolling(); } catch {}
   329	        setTimeout(() => {
   330	          bot.startPolling({ restart: true, params: { timeout: 3 } })
   331	            .then(() => {
   332	              console.log('[heartbeat] Polling restarted');
   333	              telegramHealth.pollErrorCount = 0;
   334	              updateTelegramHealth('lastPollOkAt', new Date().toISOString());
   335	            })
   336	            .catch(e => console.error('[heartbeat] Restart failed:', e.message));
   337	        }, 1000);
   338	      }
   339	    }
   340	  }, 60_000);
   341	}
   342	
   343	// ── Internal webhook listener (port 8443) — receives updates from cath-bridge
   344	import http from 'http';
   345	
   346	function startWebhookListener() {
   347	  const server = http.createServer((req, res) => {
   348	    if (req.method === 'POST' && req.url === '/webhook') {
   349	      let body = '';
   350	      req.on('data', chunk => { body += chunk; });
   351	      req.on('end', () => {
   352	        try {
   353	          const update = JSON.parse(body);
   354	          bot.processUpdate(update);
   355	          updateTelegramHealth('lastUpdateAt', new Date().toISOString());
   356	
   357	          // If we're still polling when webhooks arrive, stop polling
   358	          if (telegramHealth.mode === 'polling' && bot.isPolling()) {
   359	            console.log('[webhook] Received webhook update while polling — switching to webhook mode');
   360	            bot.stopPolling();
   361	            telegramHealth.mode = 'webhook';
   362	            writeTelegramHealthToState();
   363	          }
   364	
   365	          res.writeHead(200, { 'Content-Type': 'application/json' });
   366	          res.end(JSON.stringify({ ok: true }));
   367	        } catch (err) {
   368	          res.writeHead(400, { 'Content-Type': 'application/json' });
   369	          res.end(JSON.stringify({ error: err.message }));
   370	        }
   371	      });
   372	    } else if (req.method === 'POST' && req.url === '/switch-to-polling') {
   373	      // Called when tunnel goes down — resume polling
   374	      console.log('[webhook] Switching back to polling mode');
   375	      bot.deleteWebHook().then(() => {
   376	        return bot.startPolling({ restart: true, params: { timeout: 3 } });
   377	      }).then(() => {
   378	        telegramHealth.mode = 'polling';
   379	        writeTelegramHealthToState();
   380	        console.log('[webhook] Polling resumed');
   381	        res.writeHead(200, { 'Content-Type': 'application/json' });
   382	        res.end(JSON.stringify({ ok: true, mode: 'polling' }));
   383	      }).catch(err => {
   384	        res.writeHead(500, { 'Content-Type': 'application/json' });
   385	        res.end(JSON.stringify({ error: err.message }));
   386	      });
   387	    } else {
   388	      res.writeHead(404);
   389	      res.end();
   390	    }
   391	  });
   392	  server.on('error', (err) => {
   393	    if (err.code === 'EADDRINUSE') {
   394	      console.log('[webhook] Port 8443 in use — killing stale listener and retrying');
   395	      setTimeout(() => server.listen(8443, '127.0.0.1'), 2000);
   396	    } else {
   397	      console.error('[webhook] Server error:', err.message);
   398	    }
   399	  });
   400	  server.listen(8443, '127.0.0.1', () => {
   401	    console.log('[webhook] Internal listener on 127.0.0.1:8443');
   402	  });
   403	}
   404	
   405	// ── Bot startup ─────────────────────────────────────────────────────────────
   406	const WEBHOOK_MODE = process.env.TELEGRAM_WEBHOOK_URL;
   407	
   408	async function startBot(retries = 5) {
   409	  try {
   410	    // Always start the internal webhook listener for cath-bridge forwarding
   411	    startWebhookListener();
   412	
   413	    // Check if tunnel script has set a webhook (tunnel writes URL to .tunnel-url)
   414	    const tunnelUrlFile = path.join(process.env.HOME, 'nanoclaw', '.tunnel-url');
   415	    const tunnelActive = fs.existsSync(tunnelUrlFile);
   416	
   417	    if (WEBHOOK_MODE) {
   418	      // Explicit webhook mode via env var
   419	      await bot.setWebHook(WEBHOOK_MODE);
   420	      telegramHealth.mode = 'webhook';
   421	      console.log(`🤖 Bot webhook set: ${WEBHOOK_MODE}`);
   422	    } else if (tunnelActive) {
   423	      // Tunnel is running — don't delete webhook, don't poll
   424	      // The tunnel script handles webhook registration
   425	      // Bot receives updates via internal webhook listener (port 8443)
   426	      telegramHealth.mode = 'webhook';
   427	      const tunnelUrl = fs.readFileSync(tunnelUrlFile, 'utf8').trim();
   428	      console.log(`🤖 Tunnel detected (${tunnelUrl}) — webhook mode, no polling.`);
   429	    } else {
   430	      // No tunnel, no webhook env — use polling
   431	      await bot.deleteWebHook();
   432	      await bot.startPolling({ restart: true, params: { timeout: 3 } });
   433	      telegramHealth.mode = 'polling';
   434	      console.log('🤖 Bot polling started (3s interval).');
   435	    }
   436	    updateTelegramHealth('lastPollOkAt', new Date().toISOString());
   437	    startHeartbeat();
   438	    startFileWatcher();
   439	  } catch (err) {
   440	    console.error(`❌ Startup error: ${err.message}`);
   441	    if (retries > 0) {
   442	      console.log(`⏳ Retrying in 5s... (${retries} attempt${retries !== 1 ? 's' : ''} left)`);
   443	      setTimeout(() => startBot(retries - 1), 5000);
   444	    } else {
   445	      console.error('Failed to start bot after multiple attempts. Exiting.');
   446	      process.exit(1);
   447	    }
   448	  }
   449	}
   450	
   451	startBot();
   452	startGoldCron();
   453	
   454	// Start vault metabolism cron (weekly) — sends health report to all active chats on run
   455	startMetabolismCron((report) => {
   456	  console.log('[metabolism] Weekly scan complete.');
   457	  // Report is logged; no auto-send (Paul uses /metabolism to pull it explicitly)
   458	});
   459	
   460	// Track post generation state
   461	const postGenerationState = {};
   462	
   463	// Generate captions
   464	async function generatePostCaptions(topic) {
   465	  const vectorResults = await searchVectorStore(topic);
   466	  const vectorContext = formatVectorContext(vectorResults);
   467	
   468	  const systemPrompt = `You are Paul from Basic Reflex, a boxing gym owner and philosopher in Hong Kong. 
   469	Generate 3 Instagram captions about ${topic} using these contextual nuggets:
   470	${vectorContext}
   471	
   472	Your captions must:
   473	- Reflect Paul's philosophical, direct voice
   474	- Include IntegrityOS, Saper Vedere, vortex flow, or Wu Wang concepts
   475	- End with 3-5 hashtags including #BasicReflex and #BoxingHK
   476	- Vary in length and depth: short/punchy, educational, philosophical`;
   477	
   478	  const result = await callCloud(systemPrompt, `Generate 3 Instagram captions about ${topic}`);
   479	  
   480	  // Parse the response into captions
   481	  const captions = result.response.split(/\n\n/).filter(c => c.trim().length > 10).slice(0, 3);
   482	  
   483	  return captions;
   484	}
   485	
   486	// Generate visual direction
   487	async function generateVisualDirection(topic) {
   488	  const systemPrompt = `You are Paul's creative director. 
   489	Generate visual direction for an Instagram post about ${topic}:
   490	- Describe the best photo/clip type
   491	- Suggest mood, lighting, and framing
   492	- Create a detailed AI image generation prompt`;
   493	
   494	  const result = await callCloud(systemPrompt, `Create visual direction for ${topic}`);
   495	  return result.response;
   496	}
   497	
   498	// /search command — semantic vault search via SQLite embeddings
   499	bot.onText(/\/search (.+)/, async (msg, match) => {
   500	  const chatId = msg.chat.id;
   501	  const query = match[1].trim();
   502	
   503	  try {
   504	    await safeSend(chatId, `🔍 Searching vault: "${query}"...`);
   505	    const results = await semanticSearch(query, 5);
   506	
   507	    if (results.length === 0) {
   508	      await safeSend(chatId, '📭 No results. Run vault-embedder.js to index the vault first.');
   509	      return;
   510	    }
   511	
   512	    let message = `🔍 *Vault: "${query}"*\n\n`;
   513	    results.forEach((r, i) => {
   514	      const pct = (r.score * 100).toFixed(0);
   515	      const domain = r.domain ? ` \\[${r.domain}\\]` : '';
   516	      message += `*${i + 1}\\. ${r.title.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&')}*${domain} — ${pct}%\n`;
   517	      if (r.first_line) {
   518	        const snippet = r.first_line.slice(0, 100).replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
   519	        message += `_${snippet}_\n`;
   520	      }
   521	      message += '\n';
   522	    });
   523	
   524	    await safeSend(chatId, message, { parse_mode: 'MarkdownV2' });
   525	  } catch (err) {
   526	    console.error('Search error:', err);
   527	    await safeSend(chatId, `⚠️ Search error: ${err.message}`);
   528	  }
   529	});
   530	
   531	// Post command handler
   532	bot.onText(/\/post (.+)/, async (msg, match) => {
   533	  const chatId = msg.chat.id;
   534	  const topic = match[1];
   535	
   536	  try {
   537	    // Generate captions and visual direction
   538	    const captions = await generatePostCaptions(topic);
   539	    const visualDirection = await generateVisualDirection(topic);
   540	
   541	    // Store state for this chat
   542	    postGenerationState[chatId] = {
   543	      topic,
   544	      captions,
   545	      visualDirection
   546	    };
   547	
   548	    // Construct message with captions
   549	    let message = `📝 Post Captions for "${topic}":\n\n`;
   550	    captions.forEach((caption, index) => {
   551	      message += `${index + 1}. ${caption}\n\n`;
   552	    });
   553	
   554	    message += `\n--- VISUAL DIRECTION ---\n${visualDirection}`;
   555	
   556	    safeSend(chatId, message, {
   557	      parse_mode: 'Markdown',
   558	      reply_markup: {
   559	        keyboard: [['1', '2', '3']],
   560	        one_time_keyboard: true,
   561	        resize_keyboard: true
   562	      }
   563	    });
   564	
   565	  } catch (error) {
   566	    console.error('Post generation error:', error);
   567	    safeSend(chatId, `⚠️ Post generation failed: ${error.message}`);
   568	  }
   569	});
   570	
   571	// /triage [claim] — epistemic scoring on 5 dimensions
   572	bot.onText(/\/triage (.+)/, async (msg, match) => {
   573	  const chatId = msg.chat.id;
   574	  const claim  = match[1].trim();
   575	
   576	  try {
   577	    await safeSend(chatId, `⚖️ Triaging claim via hermes3...\n\n_"${claim.slice(0, 100)}${claim.length > 100 ? '...' : ''}"_`, { parse_mode: 'Markdown' });
   578	
   579	    // Pull vault context for the claim
   580	    let vaultNuggets = [];
   581	    try {
   582	      vaultNuggets = await semanticSearch(claim, 5);
   583	    } catch { /* proceed without vault context */ }
   584	
   585	    const result = await triageClaim(claim, vaultNuggets);
   586	    const formatted = formatTriageResult(result);
   587	
   588	    const header = `*EPISTEMIC TRIAGE*\n_Claim: "${claim.slice(0, 120)}${claim.length > 120 ? '...' : ''}"_\n\n`;
   589	    await safeSend(chatId, header + formatted, { parse_mode: 'Markdown' });
   590	  } catch (err) {
   591	    console.error('Triage error:', err);
   592	    await safeSend(chatId, `⚠️ Triage failed: ${err.message}`);
   593	  }
   594	});
   595	
   596	// /council — Genius Council (unified: replaces old interlocutors + /genius)
   597	// /council characters — list available characters
   598	bot.onText(/^\/council(?:@\w+)?\s+characters\s*$/, async (msg) => {
   599	  const chatId = msg.chat.id;
   600	  try {
   601	    const output = await new Promise((resolve, reject) => {
   602	      const proc = spawn(
   603	        'python3',
   604	        [path.join(process.env.HOME, 'Cathedral', 'genius-council', 'council.py'), '--characters'],
   605	        { env: process.env }
   606	      );
   607	      let stdout = '';
   608	      proc.stdout.on('data', d => { stdout += d.toString(); });
   609	      proc.on('close', code => resolve(stdout.trim() || 'No characters found.'));
   610	      proc.on('error', reject);
   611	    });
   612	    await safeSend(chatId, output);
   613	  } catch (err) {
   614	    await safeSend(chatId, `Failed: ${err.message}`);
   615	  }
   616	});
   617	
   618	// /council last — show last session summary
   619	bot.onText(/^\/council(?:@\w+)?\s+last\s*$/, async (msg) => {
   620	  const chatId = msg.chat.id;
   621	  try {
   622	    const output = await new Promise((resolve, reject) => {
   623	      const proc = spawn(
   624	        'python3',
   625	        [path.join(process.env.HOME, 'Cathedral', 'genius-council', 'council.py'), '--last'],
   626	        { env: process.env }
   627	      );
   628	      let stdout = '';
   629	      proc.stdout.on('data', d => { stdout += d.toString(); });
   630	      proc.on('close', code => resolve(stdout.trim() || 'No sessions yet.'));
   631	      proc.on('error', reject);
   632	    });
   633	    await safeSend(chatId, output);
   634	  } catch (err) {
   635	    await safeSend(chatId, `Failed: ${err.message}`);
   636	  }
   637	});
   638	
   639	// /council [question] — convene the Genius Council
   640	bot.onText(/^\/council(?:@\w+)?\s+(?!characters\s*$|last\s*$)(.+)$/s, async (msg, match) => {
   641	  const chatId = msg.chat.id;
   642	  const question = match[1].trim();
   643	
   644	  try {
   645	    await safeSend(chatId, `Convening Genius Council...\n\n"${question.slice(0, 100)}"\n\nSelecting characters and querying — this takes 3-8 minutes.`);
   646	
   647	    const output = await new Promise((resolve, reject) => {
   648	      const proc = spawn(
   649	        'python3',
   650	        [path.join(process.env.HOME, 'Cathedral', 'genius-council', 'council.py'), question],
   651	        { env: process.env }
   652	      );
   653	      let stdout = '';
   654	      let stderr = '';
   655	      proc.stdout.on('data', d => { stdout += d.toString(); });
   656	      proc.stderr.on('data', d => { stderr += d.toString(); });
   657	      proc.on('close', code => {
   658	        if (code !== 0) reject(new Error(stderr.trim().split('\n').pop() || `exit code ${code}`));
   659	        else resolve(stdout.trim());
   660	      });
   661	      proc.on('error', reject);
   662	      setTimeout(() => { try { proc.kill(); } catch {} reject(new Error('Timeout (10 min)')); }, 600000);
   663	    });
   664	
   665	    await safeSend(chatId, output);
   666	  } catch (err) {
   667	    console.error('Genius Council error:', err);
   668	    await safeSend(chatId, `Genius Council failed: ${err.message}`);
   669	  }
   670	});
   671	
   672	// /obliteratus [question] — full 6-stage research pipeline
   673	bot.onText(/\/obliteratus (.+)/, async (msg, match) => {
   674	  const chatId   = msg.chat.id;
   675	  const question = match[1].trim();
   676	
   677	  let stageMsg = null;
   678	
   679	  try {
   680	    stageMsg = await safeSend(
   681	      chatId,
   682	      `🔬 *Obliteratus Engine — Initiating*\n\n_"${question.slice(0, 100)}${question.length > 100 ? '...' : ''}"_\n\nPipeline: DECOMPOSE → RETRIEVE → REASON → TRIAGE → SYNTHESIZE → ARCHIVE\n\nThis takes 5–15 minutes. Stage updates will follow.`,
   683	      { parse_mode: 'Markdown' }
   684	    );
   685	
   686	    let lastStage = '';
   687	
   688	    const result = await runObliteratus(question, {
   689	      onProgress: async ({ stage, message }) => {
   690	        // Only send a message when the stage changes
   691	        if (stage !== lastStage) {
   692	          lastStage = stage;
   693	          const stageEmoji = {
   694	            DECOMPOSE:  '🧩',
   695	            RETRIEVE:   '📚',
   696	            REASON:     '🧠',
   697	            TRIAGE:     '⚖️',
   698	            SYNTHESIZE: '📝',
   699	            ARCHIVE:    '📁',
   700	          };
   701	          await safeSend(
   702	            chatId,
   703	            `${stageEmoji[stage] || '•'} *${stage}* — ${message}`,
   704	            { parse_mode: 'Markdown' }
   705	          ).catch(() => {});
   706	        }
   707	      },
   708	    });
   709	
   710	    // Send header summary
   711	    const header = formatObliteratusHeader(result);
   712	    await safeSend(chatId, header, { parse_mode: 'Markdown' });
   713	
   714	    // Send report text in chunks (Telegram 4096 char limit)
   715	    const CHUNK = 3800;
   716	    const report = result.report_text;
   717	    if (report.length <= CHUNK) {
   718	      await safeSend(chatId, report);
   719	    } else {
   720	      let offset = 0;
   721	      let part   = 1;
   722	      while (offset < report.length) {
   723	        const chunk = report.slice(offset, offset + CHUNK);
   724	        await safeSend(chatId, `*Report (part ${part})*\n\n${chunk}`, { parse_mode: 'Markdown' });
   725	        offset += CHUNK;
   726	        part++;
   727	      }
   728	    }
   729	
   730	  } catch (err) {
   731	    console.error('Obliteratus error:', err);
   732	    await safeSend(chatId, `⚠️ Obliteratus failed at: ${err.message}`);
   733	  }
   734	});
   735	
   736	// /gold — Gold Extraction briefing (cached or fresh run)
   737	bot.onText(/^\/gold(?:@\w+)?$/, async (msg) => {
   738	  const chatId = msg.chat.id;
   739	
   740	  try {
   741	    await safeSend(
   742	      chatId,
   743	      `🥇 *Gold Extractor* — retrieving briefing...\n\n_Running 5 detection passes: ratios, geometry, suppression, cross-domain bridges, open threads._`,
   744	      { parse_mode: 'Markdown' }
   745	    );
   746	
   747	    const briefing = await getOrRunGold();
   748	
   749	    // Telegram 4096 char limit — split if needed
   750	    const CHUNK = 3800;
   751	    if (briefing.length <= CHUNK) {
   752	      await safeSend(chatId, briefing, { parse_mode: 'Markdown' });
   753	    } else {
   754	      let offset = 0;
   755	      let part   = 1;
   756	      while (offset < briefing.length) {
   757	        const chunk = briefing.slice(offset, offset + CHUNK);
   758	        await safeSend(chatId, `*Gold Briefing (part ${part})*\n\n${chunk}`, { parse_mode: 'Markdown' });
   759	        offset += CHUNK;
   760	        part++;
   761	      }
   762	    }
   763	  } catch (err) {
   764	    console.error('Gold error:', err);
   765	    await safeSend(chatId, `⚠️ Gold extraction failed: ${err.message}`);
   766	  }
   767	});
   768	
   769	// /goldrun — force a fresh Gold extraction (ignores cache)
   770	bot.onText(/\/goldrun/, async (msg) => {
   771	  const chatId = msg.chat.id;
   772	
   773	  try {
   774	    await safeSend(
   775	      chatId,
   776	      `🥇 *Gold Extractor — Fresh Run*\n\nForcing full extraction across vault. Ignoring cache...`,
   777	      { parse_mode: 'Markdown' }
   778	    );
   779	
   780	    const briefing = await runGoldExtraction();
   781	
   782	    const CHUNK = 3800;
   783	    if (briefing.length <= CHUNK) {
   784	      await safeSend(chatId, briefing, { parse_mode: 'Markdown' });
   785	    } else {
   786	      let offset = 0;
   787	      let part   = 1;
   788	      while (offset < briefing.length) {
   789	        const chunk = briefing.slice(offset, offset + CHUNK);
   790	        await safeSend(chatId, `*Gold Briefing (part ${part})*\n\n${chunk}`, { parse_mode: 'Markdown' });
   791	        offset += CHUNK;
   792	        part++;
   793	      }
   794	    }
   795	  } catch (err) {
   796	    console.error('Gold run error:', err);
   797	    await safeSend(chatId, `⚠️ Gold extraction failed: ${err.message}`);
   798	  }
   799	});
   800	
   801	// /metabolism — vault health scan (or summary if scan already ran recently)
   802	bot.onText(/\/metabolism/, async (msg) => {
   803	  const chatId = msg.chat.id;
   804	
   805	  try {
   806	    await safeSend(chatId, '🫀 *Vault Metabolism* — scanning nugget health...\n\n_Detecting contradictions, corroborations, aging. This takes 1–3 minutes._', { parse_mode: 'Markdown' });
   807	
   808	    const progressLines = [];
   809	    const report = await runMetabolism((line) => {
   810	      progressLines.push(line);
   811	    });
   812	
   813	    const CHUNK = 3800;
   814	    if (report.length <= CHUNK) {
   815	      await safeSend(chatId, report);
   816	    } else {
   817	      let offset = 0;
   818	      let part = 1;
   819	      while (offset < report.length) {
   820	        const chunk = report.slice(offset, offset + CHUNK);
   821	        const header = part === 1 ? '' : `Metabolism Report (part ${part})\n\n`;
   822	        await safeSend(chatId, header + chunk);
   823	        offset += CHUNK;
   824	        part++;
   825	      }
   826	    }
   827	  } catch (err) {
   828	    console.error('Metabolism error:', err);
   829	    await safeSend(chatId, `⚠️ Metabolism scan failed: ${err.message}`);
   830	  }
   831	});
   832	
   833	// /trajectory [topic] — belief evolution on a topic
   834	// /trajectory drift    — reads proprioception block from cath-state.json
   835	bot.onText(/\/trajectory (.+)/, async (msg, match) => {
   836	  const chatId = msg.chat.id;
   837	  const arg    = match[1].trim();
   838	
   839	  try {
   840	    if (arg.toLowerCase() === 'drift') {
   841	      const statePath = path.join(process.env.HOME, 'Cathedral', 'cath-state.json');
   842	      const state     = JSON.parse(fs.readFileSync(statePath, 'utf8'));
   843	      const block     = state.proprioception;
   844	
   845	      if (!block) {
   846	        await safeSend(chatId, '⚠️ No proprioception data yet. Run /proprioception first.');
   847	        return;
   848	      }
   849	
   850	      const lines = [
   851	        `*Proprioception — Drift Report*`,
   852	        ``,
   853	        `Drift score: \`${block.drift_score}\` — *${block.drift_status.toUpperCase()}*`,
   854	        `Restart ratio: \`${block.restart_ratio}\``,
   855	        `Leading questions: \`${block.leading_question_count}\``,
   856	        `Character-mediated claims: \`${block.character_mediated_claims}\``,
   857	        `Last scan: ${block.last_scan}`,
   858	      ];
   859	
   860	      if (block.flags && block.flags.length > 0) {
   861	        lines.push(``, `*Flags*`);
   862	        block.flags.forEach(f => lines.push(`⚑ ${f}`));
   863	      }
   864	
   865	      if (block.mirror_voice) {
   866	        lines.push(``, `*Mirror*`);
   867	        block.mirror_voice.split(' | ').forEach(l => lines.push(l));
   868	      }
   869	
   870	      await safeSend(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
   871	    } else {
   872	      const data   = getTrajectory(arg);
   873	      const report = formatTrajectory(data);
   874	      await safeSend(chatId, report, { parse_mode: 'Markdown' });
   875	    }
   876	  } catch (err) {
   877	    console.error('Trajectory error:', err);
   878	    await safeSend(chatId, `⚠️ Trajectory error: ${err.message}`);
   879	  }
   880	});
   881	
   882	// /negativespace — standalone negative space scan (also runs as part of /goldrun)
   883	bot.onText(/\/negativespace/, async (msg) => {
   884	  const chatId = msg.chat.id;
   885	
   886	  try {
   887	    await safeSend(chatId, '🕳️ *Negative Space Detector* — scanning for forensic absences...\n\n_Timeline gaps, documentation asymmetry, counter-evidence absence. Takes 2–4 minutes._', { parse_mode: 'Markdown' });
   888	
   889	    const { summary } = await runNegativeSpaceScan((line) => {
   890	      console.log('[negativespace]', line);
   891	    });
   892	
   893	    const CHUNK = 3800;
   894	    if (summary.length <= CHUNK) {
   895	      await safeSend(chatId, summary, { parse_mode: 'Markdown' });
   896	    } else {
   897	      let offset = 0;
   898	      let part = 1;
   899	      while (offset < summary.length) {
   900	        const chunk = summary.slice(offset, offset + CHUNK);
   901	        await safeSend(chatId, `*Negative Space (part ${part})*\n\n${chunk}`, { parse_mode: 'Markdown' });
   902	        offset += CHUNK;
   903	        part++;
   904	      }
   905	    }
   906	  } catch (err) {
   907	    console.error('Negative space error:', err);
   908	    await safeSend(chatId, `⚠️ Negative space scan failed: ${err.message}`);
   909	  }
   910	});
   911	
   912	// /rhythm — Timekeeper schedule report
   913	bot.onText(/^\/rhythm(?:@\w+)?$/, async (msg) => {
   914	  const chatId = msg.chat.id;
   915	
   916	  try {
   917	    const { getRhythmReport } = await import(path.join(process.env.HOME, 'Cathedral', 'the-timekeeper.mjs'));
   918	    const report = getRhythmReport();
   919	    await safeSend(chatId, `\`\`\`\n${report.text}\n\`\`\``, { parse_mode: 'Markdown' });
   920	  } catch (err) {
   921	    console.error('Rhythm report error:', err);
   922	    await safeSend(chatId, `⚠️ Rhythm report failed: ${err.message}`);
   923	  }
   924	});
   925	
   926	// /ledger — Falsifiable claims tracker
   927	bot.onText(/^\/ledger(?:@\w+)?\s*(.*)$/, async (msg, match) => {
   928	  const chatId = msg.chat.id;
   929	  const args = (match[1] || '').trim();
   930	
   931	  try {
   932	    let cmd, cmdArgs;
   933	
   934	    if (!args || args === 'stats') {
   935	      cmd = ['stats'];
   936	    } else if (args === 'pending') {
   937	      cmd = ['pending'];
   938	    } else if (args === 'all') {
   939	      cmd = ['all'];
   940	    } else if (args.startsWith('log ')) {
   941	      // /ledger log "claim text" 30
   942	      const logMatch = args.match(/^log\s+(.+?)(?:\s+(\d+))?$/);
   943	      if (!logMatch) {
   944	        await safeSend(chatId, 'Usage: /ledger log [claim text] [days]\nDefault: 90 days');
   945	        return;
   946	      }
   947	      cmd = ['log', logMatch[1].replace(/^["']|["']$/g, ''), '--days', logMatch[2] || '90'];
   948	    } else if (args.startsWith('verify ')) {
   949	      // /ledger verify 3 held Reason text here
   950	      const verMatch = args.match(/^verify\s+(\d+)\s+(held|failed|unclear)\s*(.*)$/i);
   951	      if (!verMatch) {
   952	        await safeSend(chatId, 'Usage: /ledger verify [id] [held|failed|unclear] [reason]');
   953	        return;
   954	      }
   955	      cmd = ['verify', verMatch[1], verMatch[2].toLowerCase()];
   956	      if (verMatch[3]) cmd.push(verMatch[3]);
   957	    } else {
   958	      await safeSend(chatId, 'Usage:\n/ledger stats\n/ledger pending\n/ledger log [claim] [days]\n/ledger verify [id] [held|failed|unclear] [reason]');
   959	      return;
   960	    }
   961	
   962	    const output = await new Promise((resolve, reject) => {
   963	      const proc = spawn(
   964	        'python3',
   965	        [path.join(process.env.HOME, 'Cathedral', 'ledger.py'), ...cmd],
   966	        { env: process.env }
   967	      );
   968	      let stdout = '';
   969	      let stderr = '';
   970	      proc.stdout.on('data', d => { stdout += d.toString(); });
   971	      proc.stderr.on('data', d => { stderr += d.toString(); });
   972	      proc.on('close', code => {
   973	        if (code !== 0) reject(new Error(stderr.trim() || `exit code ${code}`));
   974	        else resolve(stdout.trim());
   975	      });
   976	      proc.on('error', reject);
   977	    });
   978	
   979	    await safeSend(chatId, output);
   980	  } catch (err) {
   981	    console.error('Ledger error:', err);
   982	    await safeSend(chatId, `Ledger failed: ${err.message}`);
   983	  }
   984	});
   985	
   986	// /genius — alias for /council (backwards compat)
   987	bot.onText(/^\/genius(?:@\w+)?\s+(.+)$/, async (msg, match) => {
   988	  const chatId = msg.chat.id;
   989	  const arg = match[1].trim();
   990	  // Rewrite as /council and let existing handlers process
   991	  if (arg === 'characters' || arg === 'last') {
   992	    const proc = spawn(
   993	      'python3',
   994	      [path.join(process.env.HOME, 'Cathedral', 'genius-council', 'council.py'), arg === 'characters' ? '--characters' : '--last'],
   995	      { env: process.env }
   996	    );
   997	    let stdout = '';
   998	    proc.stdout.on('data', d => { stdout += d.toString(); });
   999	    proc.on('close', () => safeSend(chatId, stdout.trim() || 'No data.'));
  1000	    proc.on('error', err => safeSend(chatId, `Failed: ${err.message}`));
  1001	  } else {
  1002	    await safeSend(chatId, `Convening Genius Council...\n\n"${arg.slice(0, 100)}"\n\nSelecting characters and querying — this takes 3-8 minutes.`);
  1003	    try {
  1004	      const output = await new Promise((resolve, reject) => {
  1005	        const proc = spawn(
  1006	          'python3',
  1007	          [path.join(process.env.HOME, 'Cathedral', 'genius-council', 'council.py'), arg],
  1008	          { env: process.env }
  1009	        );
  1010	        let stdout = '';
  1011	        let stderr = '';
  1012	        proc.stdout.on('data', d => { stdout += d.toString(); });
  1013	        proc.stderr.on('data', d => { stderr += d.toString(); });
  1014	        proc.on('close', code => {
  1015	          if (code !== 0) reject(new Error(stderr.trim().split('\n').pop() || `exit code ${code}`));
  1016	          else resolve(stdout.trim());
  1017	        });
  1018	        proc.on('error', reject);
  1019	        setTimeout(() => { try { proc.kill(); } catch {} reject(new Error('Timeout (10 min)')); }, 600000);
  1020	      });
  1021	      await safeSend(chatId, output);
  1022	    } catch (err) {
  1023	      console.error('Genius Council error:', err);
  1024	      await safeSend(chatId, `Genius Council failed: ${err.message}`);
  1025	    }
  1026	  }
  1027	});
  1028	
  1029	// /genius (no args) — show last session
  1030	bot.onText(/^\/genius(?:@\w+)?\s*$/, async (msg) => {
  1031	  const chatId = msg.chat.id;
  1032	  try {
  1033	    const output = await new Promise((resolve, reject) => {
  1034	      const proc = spawn(
  1035	        'python3',
  1036	        [path.join(process.env.HOME, 'Cathedral', 'genius-council', 'council.py'), '--last'],
  1037	        { env: process.env }
  1038	      );
  1039	      let stdout = '';
  1040	      proc.stdout.on('data', d => { stdout += d.toString(); });
  1041	      proc.on('close', code => resolve(stdout.trim() || 'No sessions yet.'));
  1042	      proc.on('error', reject);
  1043	    });
  1044	    await safeSend(chatId, output);
  1045	  } catch (err) {
  1046	    await safeSend(chatId, `Failed: ${err.message}`);
  1047	  }
  1048	});
  1049	
  1050	// /audit — Cathedral self-audit
  1051	bot.onText(/^\/audit(?:@\w+)?\s*$/, async (msg) => {
  1052	  const chatId = msg.chat.id;
  1053	  try {
  1054	    await safeSend(chatId, 'Running Cathedral self-audit...');
  1055	    const output = await new Promise((resolve, reject) => {
  1056	      const proc = spawn('python3', [
  1057	        path.join(process.env.HOME, 'Cathedral', 'self-audit.py'), '--telegram'
  1058	      ], { env: process.env, cwd: path.join(process.env.HOME, 'Cathedral') });
  1059	      let stdout = '';
  1060	      let stderr = '';
  1061	      proc.stdout.on('data', d => { stdout += d; });
  1062	      proc.stderr.on('data', d => { stderr += d; });
  1063	      proc.on('close', code => {
  1064	        if (code !== 0 && !stdout.trim()) reject(new Error(stderr.trim().split('\n').pop() || `exit ${code}`));
  1065	        else resolve(stdout.trim());
  1066	      });
  1067	      proc.on('error', reject);
  1068	      setTimeout(() => { try { proc.kill(); } catch {} reject(new Error('Audit timeout (2 min)')); }, 120000);
  1069	    });
  1070	    await safeSend(chatId, output || 'Audit complete — no output.');
  1071	  } catch (err) {
  1072	    console.error('Audit error:', err);
  1073	    await safeSend(chatId, `Audit failed: ${err.message}`);
  1074	  }
  1075	});
  1076	
  1077	// /scratchpad — Paul's raw thinking capture
  1078	// Send /scratchpad [text] — captured to vault as raw_thinking/ with #unreflected
  1079	// No structure. No response. Just capture.
  1080	bot.onText(/^\/scratchpad(?:@\w+)?\s+(.+)/s, async (msg, match) => {
  1081	  const chatId = msg.chat.id;
  1082	  const text = match[1].trim();
  1083	  if (!text) return;
  1084	
  1085	  try {
  1086	    const fs = await import('fs');
  1087	    const date = new Date().toISOString().slice(0, 10);
  1088	    const time = new Date().toISOString().slice(11, 16).replace(':', '');
  1089	    const dir = path.join(process.env.HOME, 'cathedral-vault', '00_Staging', 'raw_thinking');
  1090	    fs.mkdirSync(dir, { recursive: true });
  1091	
  1092	    const filepath = path.join(dir, `${date}-${time}-thinking.md`);
  1093	    const content = `---\ndate: ${date}\ntags: [unreflected]\n---\n\n${text}\n`;
  1094	    fs.writeFileSync(filepath, content, 'utf8');
  1095	
  1096	    await safeSend(chatId, `Captured. #unreflected`);
  1097	  } catch (err) {
  1098	    console.error('Scratchpad error:', err);
  1099	    await safeSend(chatId, `Scratchpad failed: ${err.message}`);
  1100	  }
  1101	});
  1102	
  1103	// /researcher — The Researcher: autonomous research intelligence
  1104	// /researcher         → status (what would it research tonight?)
  1105	// /researcher run     → force a research cycle now
  1106	// /researcher last    → explain last run's reasoning
  1107	// /researcher [topic] → redirect tonight's research to this topic
  1108	bot.onText(/^\/researcher(?:@\w+)?(?:\s+(.*))?$/, async (msg, match) => {
  1109	  const chatId = msg.chat.id;
  1110	  const arg = (match[1] || '').trim();
  1111	
  1112	  try {
  1113	    if (arg === 'run') {
  1114	      await safeSend(chatId, 'The Researcher is starting a research cycle. This takes 10-20 minutes...');
  1115	      const proc = spawn('node', [
  1116	        path.join(process.env.HOME, 'Cathedral', 'the-researcher.cjs'),
  1117	      ], { env: process.env, cwd: path.join(process.env.HOME, 'Cathedral'), timeout: 1200000 });
  1118	      let stdout = '';
  1119	      proc.stdout.on('data', d => { stdout += d; });
  1120	      proc.stderr.on('data', d => {
  1121	        const lines = d.toString().split('\n').filter(l => l.includes('[researcher]'));
  1122	        for (const line of lines) console.log(line.trim());
  1123	      });
  1124	      proc.on('close', async (code) => {
  1125	        if (code === 0) {
  1126	          await safeSend(chatId, 'Research cycle complete. Check Telegram for the summary.');
  1127	        } else {
  1128	          await safeSend(chatId, `Research cycle failed (code ${code}).`);
  1129	        }
  1130	      });
  1131	      proc.on('error', async (err) => {
  1132	        await safeSend(chatId, `Researcher error: ${err.message}`);
  1133	      });
  1134	    } else if (arg === 'last') {
  1135	      const output = spawn('node', [
  1136	        path.join(process.env.HOME, 'Cathedral', 'the-researcher.cjs'), '--last',
  1137	      ], { env: process.env, timeout: 10000 });
  1138	      let out = '';
  1139	      output.stdout.on('data', d => { out += d; });
  1140	      output.on('close', async () => {
  1141	        await safeSend(chatId, out.trim() || 'No research history yet.');
  1142	      });
  1143	    } else if (arg === '' || arg === 'status') {
  1144	      const output = spawn('node', [
  1145	        path.join(process.env.HOME, 'Cathedral', 'the-researcher.cjs'), '--status',
  1146	      ], { env: process.env, timeout: 10000 });
  1147	      let out = '';
  1148	      output.stdout.on('data', d => { out += d; });
  1149	      output.on('close', async () => {
  1150	        await safeSend(chatId, out.trim() || 'Researcher status unavailable.');
  1151	      });
  1152	    } else {
  1153	      // Treat as a topic redirection
  1154	      const output = spawn('node', [
  1155	        path.join(process.env.HOME, 'Cathedral', 'the-researcher.cjs'),
  1156	        '--redirect', arg,
  1157	      ], { env: process.env, timeout: 10000 });
  1158	      let out = '';
  1159	      output.stdout.on('data', d => { out += d; });
  1160	      output.on('close', async () => {
  1161	        await safeSend(chatId, out.trim() || `Queued: "${arg}" for tonight's research.`);
  1162	      });
  1163	    }
  1164	  } catch (err) {
  1165	    console.error('Researcher error:', err);
  1166	    await safeSend(chatId, `Researcher failed: ${err.message}`);
  1167	  }
  1168	});
  1169	
  1170	// /moon — Moon phase report
  1171	bot.onText(/^\/moon(?:@\w+)?$/, async (msg) => {
  1172	  const chatId = msg.chat.id;
  1173	  try {
  1174	    const { formatMoonReport } = await import('./moon-phase.js');
  1175	    const report = formatMoonReport();
  1176	    await safeSend(chatId, report);
  1177	  } catch (err) {
  1178	    console.error('Moon phase error:', err);
  1179	    await safeSend(chatId, `Moon phase failed: ${err.message}`);
  1180	  }
  1181	});
  1182	
  1183	// /harvest-deepseek — harvest DeepSeek transcripts from ~/raw-chats/deepseek/
  1184	bot.onText(/^\/harvest-deepseek(?:@\w+)?$/, async (msg) => {
  1185	  const chatId = msg.chat.id;
  1186	
  1187	  try {
  1188	    await safeSend(chatId, 'Harvesting DeepSeek transcripts...');
  1189	    const { harvestTranscript, formatHarvestResult } = await import('./deepseek-harvester.js');
  1190	    const { readdirSync } = await import('fs');
  1191	    const intakeDir = path.join(process.env.HOME, 'raw-chats', 'deepseek');
  1192	    const files = readdirSync(intakeDir).filter(f => f.endsWith('.md') || f.endsWith('.txt'));
  1193	
  1194	    if (files.length === 0) {
  1195	      await safeSend(chatId, 'No transcripts in ~/raw-chats/deepseek/');
  1196	      return;
  1197	    }
  1198	
  1199	    let totalNuggets = 0;
  1200	    for (const f of files) {
  1201	      const result = await harvestTranscript(path.join(intakeDir, f));
  1202	      totalNuggets += result.nuggets;
  1203	      await safeSend(chatId, formatHarvestResult(result));
  1204	    }
  1205	
  1206	    if (totalNuggets === 0) {
  1207	      await safeSend(chatId, 'All transcripts already harvested or no nuggets found.');
  1208	    }
  1209	  } catch (err) {
  1210	    console.error('Harvest error:', err);
  1211	    await safeSend(chatId, `⚠️ Harvest failed: ${err.message}`);
  1212	  }
  1213	});
  1214	
  1215	// /vault-state — generate and show current vault state for seed prompt
  1216	bot.onText(/^\/vault-state(?:@\w+)?$/, async (msg) => {
  1217	  const chatId = msg.chat.id;
  1218	
  1219	  try {
  1220	    await safeSend(chatId, 'Generating vault state...');
  1221	    const { writeVaultState } = await import('./vault-state-generator.js');
  1222	    const stateText = writeVaultState();
  1223	    await safeSend(chatId, `\`\`\`\n${stateText}\n\`\`\``, { parse_mode: 'Markdown' });
  1224	  } catch (err) {
  1225	    console.error('Vault state error:', err);
  1226	    await safeSend(chatId, `⚠️ Vault state failed: ${err.message}`);
  1227	  }
  1228	});
  1229	
  1230	// /scout-design — on-demand design scout run
  1231	bot.onText(/^\/scout-design(?:@\w+)?$/, async (msg) => {
  1232	  const chatId = msg.chat.id;
  1233	
  1234	  try {
  1235	    await safeSend(chatId, 'Running design scout (Gemini web search)...');
  1236	    const { execFile } = await import('child_process');
  1237	    const { promisify } = await import('util');
  1238	    const exec = promisify(execFile);
  1239	    const scoutPath = `${process.env.HOME}/Cathedral/skills-scout.js`;
  1240	    const { stdout, stderr } = await exec('node', [scoutPath, '--design', '--force'], { timeout: 180000 });
  1241	    // Scout sends its own Telegram digest, but confirm completion
  1242	    await safeSend(chatId, 'Design scout complete. Check digest above.');
  1243	  } catch (err) {
  1244	    console.error('Scout-design error:', err);
  1245	    await safeSend(chatId, `⚠️ Design scout failed: ${err.message}`);
  1246	  }
  1247	});
  1248	
  1249	// ── Scout commands ───────────────────────────────────────────────────────────
  1250	
  1251	// /scout accept <id> — promote finding to vault staging
  1252	bot.onText(/^\/scout\s+accept\s+(.+)/i, async (msg, match) => {
  1253	  const chatId = msg.chat.id;
  1254	  const id = match[1].trim();
  1255	  try {
  1256	    const { promoteFinding } = await import('./scout-engine.js');
  1257	    const dest = promoteFinding(id);
  1258	    await safeSend(chatId, `✓ ${id} promoted to vault staging`);
  1259	  } catch (err) {
  1260	    await safeSend(chatId, `⚠️ ${err.message}`);
  1261	  }
  1262	});
  1263	
  1264	// /scout park <id> — extend revalidation by 30 days
  1265	bot.onText(/^\/scout\s+park\s+(.+)/i, async (msg, match) => {
  1266	  const chatId = msg.chat.id;
  1267	  const id = match[1].trim();
  1268	  try {
  1269	    const { parkFinding } = await import('./scout-engine.js');
  1270	    const newDate = parkFinding(id);
  1271	    await safeSend(chatId, `⏸ ${id} parked — revalidation extended to ${newDate}`);
  1272	  } catch (err) {
  1273	    await safeSend(chatId, `⚠️ ${err.message}`);
  1274	  }
  1275	});
  1276	
  1277	// /scout discard <id> — move finding to archive
  1278	bot.onText(/^\/scout\s+discard\s+(.+)/i, async (msg, match) => {
  1279	  const chatId = msg.chat.id;
  1280	  const id = match[1].trim();
  1281	  try {
  1282	    const { discardFinding } = await import('./scout-engine.js');
  1283	    discardFinding(id);
  1284	    await safeSend(chatId, `✗ ${id} discarded — moved to archive`);
  1285	  } catch (err) {
  1286	    await safeSend(chatId, `⚠️ ${err.message}`);
  1287	  }
  1288	});
  1289	
  1290	// /scout candidates — list active findings
  1291	bot.onText(/^\/scout\s+candidates\s*$/i, async (msg) => {
  1292	  const chatId = msg.chat.id;
  1293	  try {
  1294	    const { getCandidatesList } = await import('./scout-engine.js');
  1295	    await safeSend(chatId, getCandidatesList());
  1296	  } catch (err) {
  1297	    await safeSend(chatId, `⚠️ ${err.message}`);
  1298	  }
  1299	});
  1300	
  1301	// /scout weather — show current weather report
  1302	bot.onText(/^\/scout\s+weather\s*$/i, async (msg) => {
  1303	  const chatId = msg.chat.id;
  1304	  try {
  1305	    const { readWeatherReport } = await import('./scout-engine.js');
  1306	    await safeSend(chatId, readWeatherReport());
  1307	  } catch (err) {
  1308	    await safeSend(chatId, `⚠️ ${err.message}`);
  1309	  }
  1310	});
  1311	
  1312	// /scout crack — show current curated crack
  1313	bot.onText(/^\/scout\s+crack\s*$/i, async (msg) => {
  1314	  const chatId = msg.chat.id;
  1315	  try {
  1316	    const { getTopCrack, formatCrack } = await import('./scout-engine.js');
  1317	    await safeSend(chatId, formatCrack(getTopCrack()));
  1318	  } catch (err) {
  1319	    await safeSend(chatId, `⚠️ ${err.message}`);
  1320	  }
  1321	});
  1322	
  1323	// /scout missions — show active missions
  1324	bot.onText(/^\/scout\s+missions\s*$/i, async (msg) => {
  1325	  const chatId = msg.chat.id;
  1326	  try {
  1327	    const { readMissionsFormatted } = await import('./scout-engine.js');
  1328	    await safeSend(chatId, readMissionsFormatted());
  1329	  } catch (err) {
  1330	    await safeSend(chatId, `⚠️ ${err.message}`);
  1331	  }
  1332	});
  1333	
  1334	// /missions <text> — Universe Orc dispatches missions to Scout
  1335	bot.onText(/^\/missions\s+(.+)/is, async (msg, match) => {
  1336	  const chatId = msg.chat.id;
  1337	  const text = match[1].trim();
  1338	  try {
  1339	    const { writeMissions } = await import('./scout-engine.js');
  1340	    writeMissions(text);
  1341	    await safeSend(chatId, '✓ Mission list updated — Scout will prioritise on next scan');
  1342	  } catch (err) {
  1343	    await safeSend(chatId, `⚠️ ${err.message}`);
  1344	  }
  1345	});
  1346	
  1347	// /scout <topic> — on-demand probe (must be LAST scout regex to avoid matching subcommands)
  1348	bot.onText(/^\/scout\s+(?!accept|park|discard|candidates|weather|crack|missions)(.+)/is, async (msg, match) => {
  1349	  const chatId = msg.chat.id;
  1350	  const input = match[1].trim();
  1351	  try {
  1352	    await safeSend(chatId, `Scout probing: "${input}"...`);
  1353	    const { runProbe } = await import('./scout-engine.js');
  1354	    await runProbe(input);
  1355	  } catch (err) {
  1356	    console.error('Scout probe error:', err);
  1357	    await safeSend(chatId, `⚠️ Scout probe failed: ${err.message}`);
  1358	  }
  1359	});
  1360	
  1361	// /seed — generate orchestrator context seed for Head Orchestrator sessions
  1362	bot.onText(/^\/seed(?:@\w+)?$/, async (msg) => {
  1363	  const chatId = msg.chat.id;
  1364	
  1365	  try {
  1366	    await safeSend(chatId, 'Generating orchestrator seed...');
  1367	    const { writeSeed } = await import('./orchestrator-seed-generator.js');
  1368	    const seedText = writeSeed();
  1369	    await safeSend(chatId, seedText);
  1370	  } catch (err) {
  1371	    console.error('Seed generator error:', err);
  1372	    await safeSend(chatId, `⚠️ Seed generation failed: ${err.message}`);
  1373	  }
  1374	});
  1375	
  1376	// /proprioception — identity drift scan via proprioception.py
  1377	bot.onText(/^\/proprioception(?:@\w+)?$/, async (msg) => {
  1378	  const chatId = msg.chat.id;
  1379	
  1380	  try {
  1381	    await safeSend(chatId, '🫀 *Proprioception* — scanning for identity drift...\n\n_Scoring last 20 exchanges against the transmission._', { parse_mode: 'Markdown' });
  1382	
  1383	    const output = await new Promise((resolve, reject) => {
  1384	      const proc = spawn(
  1385	        'python3',
  1386	        [path.join(process.env.HOME, 'Cathedral', 'senses', 'proprioception.py'), '--scan'],
  1387	        { env: process.env }
  1388	      );
  1389	      let stdout = '';
  1390	      let stderr = '';
  1391	      proc.stdout.on('data', d => { stdout += d.toString(); });
  1392	      proc.stderr.on('data', d => { stderr += d.toString(); });
  1393	      proc.on('close', code => {
  1394	        if (code !== 0) reject(new Error(stderr.trim() || `exit code ${code}`));
  1395	        else resolve(stdout.trim());
  1396	      });
  1397	      proc.on('error', reject);
  1398	    });
  1399	
  1400	    const CHUNK = 3800;
  1401	    if (output.length <= CHUNK) {
  1402	      await safeSend(chatId, `\`\`\`\n${output}\n\`\`\``, { parse_mode: 'Markdown' });
  1403	    } else {
  1404	      let offset = 0, part = 1;
  1405	      while (offset < output.length) {
  1406	        const chunk = output.slice(offset, offset + CHUNK);
  1407	        await safeSend(chatId, `\`\`\`\n${chunk}\n\`\`\``, { parse_mode: 'Markdown' });
  1408	        offset += CHUNK;
  1409	        part++;
  1410	      }
  1411	    }
  1412	  } catch (err) {
  1413	    console.error('Proprioception error:', err);
  1414	    await safeSend(chatId, `⚠️ Proprioception scan failed: ${err.message}`);
  1415	  }
  1416	});
  1417	
  1418	// /smell — operational economy sense via smell.py
  1419	bot.onText(/^\/smell(?:@\w+)?$/, async (msg) => {
  1420	  const chatId = msg.chat.id;
  1421	
  1422	  try {
  1423	    await safeSend(chatId, '👃 *Smell* — scanning operational economy...\n\n_Cache hit rate, output drift, response bloat, scope mismatch._', { parse_mode: 'Markdown' });
  1424	
  1425	    const output = await new Promise((resolve, reject) => {
  1426	      const proc = spawn(
  1427	        'python3',
  1428	        [path.join(process.env.HOME, 'Cathedral', 'senses', 'smell.py'), '--scan'],
  1429	        { env: process.env }
  1430	      );
  1431	      let stdout = '';
  1432	      let stderr = '';
  1433	      proc.stdout.on('data', d => { stdout += d.toString(); });
  1434	      proc.stderr.on('data', d => { stderr += d.toString(); });
  1435	      proc.on('close', code => {
  1436	        if (code !== 0) reject(new Error(stderr.trim() || `exit code ${code}`));
  1437	        else resolve(stdout.trim());
  1438	      });
  1439	      proc.on('error', reject);
  1440	    });
  1441	
  1442	    const CHUNK = 3800;
  1443	    if (output.length <= CHUNK) {
  1444	      await safeSend(chatId, `\`\`\`\n${output}\n\`\`\``, { parse_mode: 'Markdown' });
  1445	    } else {
  1446	      let offset = 0, part = 1;
  1447	      while (offset < output.length) {
  1448	        const chunk = output.slice(offset, offset + CHUNK);
  1449	        await safeSend(chatId, `\`\`\`\n${chunk}\n\`\`\``, { parse_mode: 'Markdown' });
  1450	        offset += CHUNK;
  1451	        part++;
  1452	      }
  1453	    }
  1454	  } catch (err) {
  1455	    console.error('Smell error:', err);
  1456	    await safeSend(chatId, `⚠️ Smell scan failed: ${err.message}`);
  1457	  }
  1458	});
  1459	
  1460	// /sight — vault pattern sense via sight.py
  1461	bot.onText(/^\/sight(?:@\w+)?$/, async (msg) => {
  1462	  const chatId = msg.chat.id;
  1463	
  1464	  try {
  1465	    await safeSend(chatId, '👁 *Sight* — scanning vault patterns...\n\n_Domain distribution, coverage gaps, gold freshness, unvisited bridges._', { parse_mode: 'Markdown' });
  1466	
  1467	    const output = await new Promise((resolve, reject) => {
  1468	      const proc = spawn(
  1469	        'python3',
  1470	        [path.join(process.env.HOME, 'Cathedral', 'senses', 'sight.py'), '--scan'],
  1471	        { env: process.env }
  1472	      );
  1473	      let stdout = '';
  1474	      let stderr = '';
  1475	      proc.stdout.on('data', d => { stdout += d.toString(); });
  1476	      proc.stderr.on('data', d => { stderr += d.toString(); });
  1477	      proc.on('close', code => {
  1478	        if (code !== 0) reject(new Error(stderr.trim() || `exit code ${code}`));
  1479	        else resolve(stdout.trim());
  1480	      });
  1481	      proc.on('error', reject);
  1482	    });
  1483	
  1484	    const CHUNK = 3800;
  1485	    if (output.length <= CHUNK) {
  1486	      await safeSend(chatId, `\`\`\`\n${output}\n\`\`\``, { parse_mode: 'Markdown' });
  1487	    } else {
  1488	      let offset = 0, part = 1;
  1489	      while (offset < output.length) {
  1490	        const chunk = output.slice(offset, offset + CHUNK);
  1491	        await safeSend(chatId, `\`\`\`\n${chunk}\n\`\`\``, { parse_mode: 'Markdown' });
  1492	        offset += CHUNK;
  1493	        part++;
  1494	      }
  1495	    }
  1496	  } catch (err) {
  1497	    console.error('Sight error:', err);
  1498	    await safeSend(chatId, `⚠️ Sight scan failed: ${err.message}`);
  1499	  }
  1500	});
  1501	
  1502	// /atlas — Convergence Atlas (cached 24h, rebuild on demand)
  1503	// /atlas rebuild — force fresh build from latest gold findings
  1504	bot.onText(/\/atlas(.*)/, async (msg, match) => {
  1505	  const chatId = msg.chat.id;
  1506	  const arg    = (match[1] || '').trim().toLowerCase();
  1507	
  1508	  try {
  1509	    if (arg === 'rebuild') {
  1510	      await safeSend(chatId, '🗺️ *Convergence Atlas — Rebuilding*\n\n_Mapping gold findings across Mathematical, Geometric and Institutional substrates..._', { parse_mode: 'Markdown' });
  1511	      const text = await buildAtlas();
  1512	      if (!text) {
  1513	        await safeSend(chatId, '⚠️ No gold findings to build from. Run /goldrun first.');
  1514	        return;
  1515	      }
  1516	      const CHUNK = 3800;
  1517	      if (text.length <= CHUNK) {
  1518	        await safeSend(chatId, text, { parse_mode: 'Markdown' });
  1519	      } else {
  1520	        let offset = 0, part = 1;
  1521	        while (offset < text.length) {
  1522	          const chunk = text.slice(offset, offset + CHUNK);
  1523	          await safeSend(chatId, `*Atlas (part ${part})*\n\n${chunk}`, { parse_mode: 'Markdown' });
  1524	          offset += CHUNK;
  1525	          part++;
  1526	        }
  1527	      }
  1528	    } else {
  1529	      await safeSend(chatId, '🗺️ *Convergence Atlas* — retrieving map...\n\n_Use /atlas rebuild to force a fresh build._', { parse_mode: 'Markdown' });
  1530	      const text = await getOrBuildAtlas();
  1531	      if (!text) {
  1532	        await safeSend(chatId, '⚠️ No atlas built yet. Run /goldrun then /atlas rebuild.');
  1533	        return;
  1534	      }
  1535	      const CHUNK = 3800;
  1536	      if (text.length <= CHUNK) {
  1537	        await safeSend(chatId, text, { parse_mode: 'Markdown' });
  1538	      } else {
  1539	        let offset = 0, part = 1;
  1540	        while (offset < text.length) {
  1541	          const chunk = text.slice(offset, offset + CHUNK);
  1542	          await safeSend(chatId, `*Atlas (part ${part})*\n\n${chunk}`, { parse_mode: 'Markdown' });
  1543	          offset += CHUNK;
  1544	          part++;
  1545	        }
  1546	      }
  1547	    }
  1548	  } catch (err) {
  1549	    console.error('Atlas error:', err);
  1550	    await safeSend(chatId, `⚠️ Atlas failed: ${err.message}`);
  1551	  }
  1552	});
  1553	
  1554	// /oracle [question] — speculative synthesis from vault convergences
  1555	// /oracle list       — show active (non-expired) oracle outputs
  1556	bot.onText(/\/oracle(.*)/, async (msg, match) => {
  1557	  const chatId = msg.chat.id;
  1558	  const arg    = (match[1] || '').trim();
  1559	
  1560	  try {
  1561	    // /oracle list — show recent non-expired outputs
  1562	    if (arg.toLowerCase() === 'list') {
  1563	      const outputs = getOracleOutputs(5);
  1564	      if (outputs.length === 0) {
  1565	        await safeSend(chatId, '🔮 No active Oracle outputs (all expired or none yet).\n\nUse /oracle [question] to generate one.');
  1566	        return;
  1567	      }
  1568	      let list = `🔮 *Active Oracle Outputs* (${outputs.length})\n\n`;
  1569	      for (const o of outputs) {
  1570	        const date = new Date(o.created_at).toLocaleDateString('en-HK', { timeZone: 'Asia/Hong_Kong' });
  1571	        const q    = o.question ? `"${o.question.slice(0, 60)}"` : '(full synthesis)';
  1572	        const councilStatus = o.council_queued ? '✅ Council reviewed' : '⏳ Council pending';
  1573	        const corroborated  = o.corroborated   ? ' 🟢 CORROBORATED' : '';
  1574	        list += `*ID ${o.id}* — ${date}${corroborated}\n_${q}_\n${councilStatus}\n\n`;
  1575	      }
  1576	      await safeSend(chatId, list, { parse_mode: 'Markdown' });
  1577	      return;
  1578	    }
  1579	
  1580	    // /oracle [question] or /oracle (no question = full synthesis)
  1581	    const question = arg;
  1582	
  1583	    await safeSend(
  1584	      chatId,
  1585	      `🔮 *Oracle Function — Initiating*\n\n` +
  1586	      (question ? `_Question: "${question.slice(0, 100)}"_\n\n` : '_Full vault synthesis — no question constraint_\n\n') +
  1587	      `_Loading strongest convergences, Convergence Atlas, and Negative Space data._\n` +
  1588	      `_Querying hermes3 for speculative synthesis. This takes 2–5 minutes._\n` +
  1589	      `_Output will be auto-queued for Council review._`,
  1590	      { parse_mode: 'Markdown' }
  1591	    );
  1592	
  1593	    const output = await runOracle(question);
  1594	    const formatted = formatOracleResult(output);
  1595	
  1596	    const CHUNK = 3800;
  1597	    if (formatted.length <= CHUNK) {
  1598	      await safeSend(chatId, formatted, { parse_mode: 'Markdown' });
  1599	    } else {
  1600	      let offset = 0, part = 1;
  1601	      while (offset < formatted.length) {
  1602	        const chunk = formatted.slice(offset, offset + CHUNK);
  1603	        await safeSend(chatId, `*Oracle (part ${part})*\n\n${chunk}`, { parse_mode: 'Markdown' });
  1604	        offset += CHUNK;
  1605	        part++;
  1606	      }
  1607	    }
  1608	
  1609	    await safeSend(
  1610	      chatId,
  1611	      `_Council review running in background — it may take a few minutes. Check /oracle list to see status._`,
  1612	      { parse_mode: 'Markdown' }
  1613	    );
  1614	
  1615	  } catch (err) {
  1616	    console.error('Oracle error:', err);
  1617	    await safeSend(chatId, `⚠️ Oracle failed: ${err.message}`);
  1618	  }
  1619	});
  1620	
  1621	// ── /projects and /project [name] — Project status board ─────────────────────
  1622	
  1623	const PROJECTS_DIR = path.join(process.env.HOME, 'cathedral-vault', '08_Project_Orchestrator', 'projects');
  1624	const STALE_DAYS = 7;
  1625	
  1626	function readProjectCardsLocal() {
  1627	  const cards = [];
  1628	  try {
  1629	    for (const file of fs.readdirSync(PROJECTS_DIR)) {
  1630	      if (!file.endsWith('.md')) continue;
  1631	      const full = path.join(PROJECTS_DIR, file);
  1632	      const stat = fs.statSync(full);
  1633	      const raw = fs.readFileSync(full, 'utf8');
  1634	      if (!raw.startsWith('---')) continue;
  1635	      const fmEnd = raw.indexOf('\n---', 3);
  1636	      if (fmEnd === -1) continue;
  1637	      const fm = raw.slice(3, fmEnd);
  1638	      const card = { file: file.replace('.md', ''), updated: stat.mtimeMs };
  1639	      for (const line of fm.split('\n')) {
  1640	        const m = line.match(/^([\w-]+):\s*"?([^"]*)"?\s*$/);
  1641	        if (!m) continue;
  1642	        const key = m[1].trim(), val = m[2].trim();
  1643	        if (key === 'title') card.title = val;
  1644	        else if (key === 'project-status') card.status = val;
  1645	        else if (key === 'project-priority') card.priority = val;
  1646	        else if (key === 'project-next-action') card.nextAction = val;
  1647	        else if (key === 'project-domain') card.domain = val;
  1648	        else if (key === 'project-target') card.target = val;
  1649	        else if (key === 'project-blocked-by') card.blockedBy = val;
  1650	        else if (key === 'project-last-updated') card.lastUpdated = val;
  1651	      }
  1652	      // Full body for drill-down
  1653	      card.body = raw.slice(fmEnd + 4).trim();
  1654	      cards.push(card);
  1655	    }
  1656	  } catch (_) { /* ignore */ }
  1657	  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  1658	  return cards.sort((a, b) => {
  1659	    if (a.status === 'active' && b.status !== 'active') return -1;
  1660	    if (b.status === 'active' && a.status !== 'active') return 1;
  1661	    const pa = priorityOrder[a.priority] ?? 9;
  1662	    const pb = priorityOrder[b.priority] ?? 9;
  1663	    if (pa !== pb) return pa - pb;
  1664	    return b.updated - a.updated;
  1665	  });
  1666	}
  1667	
  1668	function projectStatusEmoji(card) {
  1669	  // Blocked
  1670	  if (card.blockedBy) return '🔴';
  1671	  const status = (card.status || '').toLowerCase();
  1672	  // Paused or complete
  1673	  if (status === 'paused' || status === 'complete' || status === 'parked') return '💤';
  1674	  // Stale check for active projects
  1675	  if (status === 'active' || status === 'in-progress') {
  1676	    let lastDate;
  1677	    if (card.lastUpdated) {
  1678	      lastDate = new Date(card.lastUpdated);
  1679	    } else {
  1680	      lastDate = new Date(card.updated);
  1681	    }
  1682	    const daysSince = Math.floor((Date.now() - lastDate.getTime()) / 86400000);
  1683	    if (daysSince >= STALE_DAYS) return '🟡';
  1684	    return '🟢';
  1685	  }
  1686	  // Not started, planned, etc.
  1687	  if (status === 'not-started' || status === 'planned') return '💤';
  1688	  return '🟡';
  1689	}
  1690	
  1691	function formatProjectLine(card) {
  1692	  const emoji = projectStatusEmoji(card);
  1693	  const title = card.title || card.file;
  1694	  return `${emoji} *${title}*`;
  1695	}
  1696	
  1697	function formatProjectBoard(cards, limit) {
  1698	  const shown = limit ? cards.slice(0, limit) : cards;
  1699	  const lines = shown.map(c => {
  1700	    const emoji = projectStatusEmoji(c);
  1701	    const title = c.title || c.file;
  1702	    const next = c.nextAction ? `\n     ↳ ${c.nextAction.slice(0, 80)}` : '';
  1703	    return `${emoji} *${title}*${next}`;
  1704	  });
  1705	  return lines.join('\n');
  1706	}
  1707	
  1708	bot.onText(/^\/projects(?:@\w+)?$/, async (msg) => {
  1709	  const chatId = msg.chat.id;
  1710	  try {
  1711	    const cards = readProjectCardsLocal();
  1712	    if (cards.length === 0) {
  1713	      await safeSend(chatId, 'No project cards found.');
  1714	      return;
  1715	    }
  1716	    const board = formatProjectBoard(cards);
  1717	    const legend = '\n\n🟢 Active · 🟡 Attention · 🔴 Blocked · 💤 Stalled';
  1718	    await safeSend(chatId, `📋 *All Projects* (${cards.length})\n\n${board}${legend}`, { parse_mode: 'Markdown' });
  1719	  } catch (err) {
  1720	    console.error('Projects error:', err);
  1721	    await safeSend(chatId, `⚠️ Projects failed: ${err.message}`);
  1722	  }
  1723	});
  1724	
  1725	bot.onText(/^\/project(?:@\w+)?\s+(.+)$/, async (msg, match) => {
  1726	  const chatId = msg.chat.id;
  1727	  const query = match[1].trim().toLowerCase();
  1728	  try {
  1729	    const cards = readProjectCardsLocal();
  1730	    const card = cards.find(c =>
  1731	      (c.title || '').toLowerCase().includes(query) ||
  1732	      c.file.toLowerCase().includes(query)
  1733	    );
  1734	    if (!card) {
  1735	      await safeSend(chatId, `No project matching "${match[1].trim()}".`);
  1736	      return;
  1737	    }
  1738	    const emoji = projectStatusEmoji(card);
  1739	    const title = card.title || card.file;
  1740	    const parts = [`${emoji} *${title}*`];
  1741	    if (card.status) parts.push(`Status: ${card.status}`);
  1742	    if (card.priority) parts.push(`Priority: ${card.priority}`);
  1743	    if (card.domain) parts.push(`Domain: ${card.domain}`);
  1744	    if (card.target) parts.push(`Target: ${card.target}`);
  1745	    if (card.blockedBy) parts.push(`Blocked by: ${card.blockedBy}`);
  1746	    if (card.nextAction) parts.push(`Next: ${card.nextAction}`);
  1747	    // Body excerpt — first 600 chars
  1748	    if (card.body) {
  1749	      const excerpt = card.body.slice(0, 600);
  1750	      parts.push(`\n${excerpt}${card.body.length > 600 ? '...' : ''}`);
  1751	    }
  1752	    await safeSend(chatId, parts.join('\n'), { parse_mode: 'Markdown' });
  1753	  } catch (err) {
  1754	    console.error('Project detail error:', err);
  1755	    await safeSend(chatId, `⚠️ Project detail failed: ${err.message}`);
  1756	  }
  1757	});
  1758	
  1759	// ── /morning — link to Morning View constellation ────────────────────────────
  1760	
  1761	bot.onText(/^\/morning(?:@\w+)?$/, async (msg) => {
  1762	  const chatId = msg.chat.id;
  1763	  await safeSend(chatId, 'Morning View\nhttp://localhost:8889\n\nOpen on any device on your local network.');
  1764	});
  1765	
  1766	// ── Kit (GM Agent) — /kit commands ──────────────────────────────────────────
  1767	// /kit              → morning briefing summary
  1768	// /kit morning      → regenerate and push full morning briefing
  1769	// /kit churn        → run churn check
  1770	// /kit pipeline     → show corporate pipeline
  1771	// /kit schedule     → Paul's schedule guard
  1772	// /kit [message]    → talk to Kit (pass through to Kit's workspace)
  1773	
  1774	bot.onText(/^\/kit(?:@\w+)?(?:\s+(.*))?$/s, async (msg, match) => {
  1775	  const chatId = msg.chat.id;
  1776	  const arg = (match[1] || '').trim();
  1777	
  1778	  try {
  1779	    if (arg === '' || arg === 'status') {
  1780	      // Run morning briefing and send
  1781	      const proc = spawn('python3', [
  1782	        path.join(process.env.HOME, 'br-gm-agent', 'scripts', 'kit-morning-briefing.py'),
  1783	      ], { env: process.env, timeout: 15000 });
  1784	      let out = '';
  1785	      proc.stdout.on('data', d => { out += d; });
  1786	      proc.on('close', async () => {
  1787	        // Read the generated file
  1788	        try {
  1789	          const briefing = fs.readFileSync(
  1790	            path.join(process.env.HOME, 'br-gm-agent', 'reports', 'morning-briefing.md'), 'utf8'
  1791	          );
  1792	          await safeSend(chatId, briefing.slice(0, 4000));
  1793	        } catch {
  1794	          await safeSend(chatId, out.trim() || 'Kit morning briefing unavailable.');
  1795	        }
  1796	      });
  1797	      proc.on('error', async () => {
  1798	        await safeSend(chatId, 'Kit briefing script failed.');
  1799	      });
  1800	
  1801	    } else if (arg === 'morning') {
  1802	      await safeSend(chatId, 'Regenerating Kit morning briefing...');
  1803	      const proc = spawn('python3', [
  1804	        path.join(process.env.HOME, 'br-gm-agent', 'scripts', 'kit-morning-briefing.py'),
  1805	      ], { env: process.env, timeout: 15000 });
  1806	      proc.on('close', async () => {
  1807	        try {
  1808	          const briefing = fs.readFileSync(
  1809	            path.join(process.env.HOME, 'br-gm-agent', 'reports', 'morning-briefing.md'), 'utf8'
  1810	          );
  1811	          await safeSend(chatId, briefing.slice(0, 4000));
  1812	        } catch {
  1813	          await safeSend(chatId, 'Morning briefing generation failed.');
  1814	        }
  1815	      });
  1816	
  1817	    } else if (arg === 'churn') {
  1818	      const proc = spawn('python3', [
  1819	        path.join(process.env.HOME, 'br-gm-agent', 'scripts', 'churn-detector.py'),
  1820	      ], { env: process.env, timeout: 15000 });
  1821	      let out = '';
  1822	      proc.stdout.on('data', d => { out += d; });
  1823	      proc.on('close', async () => {
  1824	        if (out.trim()) {
  1825	          await safeSend(chatId, out.trim().slice(0, 4000));
  1826	        } else {
  1827	          // Try reading the output file
  1828	          try {
  1829	            const report = fs.readFileSync(
  1830	              path.join(process.env.HOME, 'br-gm-agent', 'reports', 'churn-flags.md'), 'utf8'
  1831	            );
  1832	            await safeSend(chatId, report.slice(0, 4000));
  1833	          } catch {
  1834	            await safeSend(chatId, 'Churn detector: no data yet. Connect PunchPass CSVs first.');
  1835	          }
  1836	        }
  1837	      });
  1838	
  1839	    } else if (arg === 'pipeline') {
  1840	      try {
  1841	        const pipeline = fs.readFileSync(
  1842	          path.join(process.env.HOME, 'cathedral-vault', '10_Agents', 'kit', 'market-intel', 'corporate-pipeline.md'), 'utf8'
  1843	        );
  1844	        await safeSend(chatId, pipeline.slice(0, 4000));
  1845	      } catch {
  1846	        await safeSend(chatId, 'Corporate pipeline file not found.');
  1847	      }
  1848	
  1849	    } else if (arg === 'schedule') {
  1850	      const proc = spawn('python3', [
  1851	        path.join(process.env.HOME, 'br-gm-agent', 'scripts', 'paul-schedule-guard.py'),
  1852	      ], { env: process.env, timeout: 15000 });
  1853	      proc.on('close', async () => {
  1854	        try {
  1855	          const guard = fs.readFileSync(
  1856	            path.join(process.env.HOME, 'br-gm-agent', 'reports', 'schedule-guard.md'), 'utf8'
  1857	          );
  1858	          await safeSend(chatId, guard.slice(0, 4000));
  1859	        } catch {
  1860	          await safeSend(chatId, 'Schedule guard report unavailable.');
  1861	        }
  1862	      });
  1863	
  1864	    } else if (arg === 'feed') {
  1865	      await safeSend(chatId, 'Generating weekly content feed for Social Media...');
  1866	      const proc = spawn('python3', [
  1867	        path.join(process.env.HOME, 'br-gm-agent', 'scripts', 'content-feed.py'),
  1868	      ], { env: process.env, timeout: 15000 });
  1869	      proc.on('close', async () => {
  1870	        try {
  1871	          const feed = fs.readFileSync(
  1872	            path.join(process.env.HOME, 'br-gm-agent', 'reports', 'content-feed.md'), 'utf8'
  1873	          );
  1874	          await safeSend(chatId, feed.slice(0, 4000));
  1875	        } catch {
  1876	          await safeSend(chatId, 'Content feed generation failed.');
  1877	        }
  1878	      });
  1879	
  1880	    } else {
  1881	      // Treat as a message to Kit — save to vault as a note for now
  1882	      // Future: route through Kit's OS prompt via DeepSeek/Ollama
  1883	      const date = new Date().toISOString().slice(0, 10);
  1884	      const time = new Date().toISOString().slice(11, 16).replace(':', '');
  1885	      const notePath = path.join(
  1886	        process.env.HOME, 'cathedral-vault', '10_Agents', 'kit', 'decisions',
  1887	        `${date}-${time}-paul-directive.md`
  1888	      );
  1889	      const content = `---\ndate: ${date}\ntype: directive\nfrom: paul\nstatus: #active\n---\n\n${arg}\n`;
  1890	      fs.mkdirSync(path.dirname(notePath), { recursive: true });
  1891	      fs.writeFileSync(notePath, content, 'utf8');
  1892	      await safeSend(chatId, `Noted for Kit: "${arg.slice(0, 80)}${arg.length > 80 ? '...' : ''}"\nFiled to vault. Kit will see this in the next briefing.`);
  1893	    }
  1894	  } catch (err) {
  1895	    console.error('Kit error:', err);
  1896	    await safeSend(chatId, `Kit error: ${err.message}`);
  1897	  }
  1898	});
  1899	
  1900	// /signal — Cathy's signal drop for Kit
  1901	// Cathy sees something in the room, pings it here, Kit picks it up in morning briefing
  1902	bot.onText(/^\/signal(?:@\w+)?\s+(.+)/s, async (msg, match) => {
  1903	  const chatId = msg.chat.id;
  1904	  const text = match[1].trim();
  1905	  if (!text) return;
  1906	
  1907	  try {
  1908	    const date = new Date().toISOString().slice(0, 10);
  1909	    const time = new Date().toISOString().slice(11, 16).replace(':', '');
  1910	    const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  1911	    const dir = path.join(process.env.HOME, 'cathedral-vault', '10_Agents', 'kit', 'cathy', 'signals');
  1912	    fs.mkdirSync(dir, { recursive: true });
  1913	
  1914	    const filepath = path.join(dir, `${date}-${time}-${slug}.md`);
  1915	    const content = `---\ndate: ${date}\ntype: signal\nfrom: cathy\nstatus: #active\n---\n\n${text}\n`;
  1916	    fs.writeFileSync(filepath, content, 'utf8');
  1917	
  1918	    await safeSend(chatId, `Signal received. Kit will see this in the morning briefing.`);
  1919	  } catch (err) {
  1920	    console.error('Signal error:', err);
  1921	    await safeSend(chatId, `Signal failed: ${err.message}`);
  1922	  }
  1923	});
  1924	
  1925	// ── /promote — Vault promotion ──────────────────────────────────────────────
  1926	bot.onText(/^\/promote(?:@\w+)?(?:\s+(.*))?$/i, async (msg, match) => {
  1927	  const chatId = msg.chat.id;
  1928	  const arg = (match[1] || '').trim();
  1929	
  1930	  try {
  1931	    if (arg.startsWith('go')) {
  1932	      const grade = arg.split(/\s+/)[1] || 'B';
  1933	      const candidates = scanForPromotions({ minGrade: grade });
  1934	      if (candidates.length === 0) { await safeSend(chatId, 'No nuggets eligible for promotion.'); return; }
  1935	      const results = executePromotions(candidates);
  1936	      let response = `Vault Promotion Complete\nPromoted: ${results.promoted.length} | Errors: ${results.errors.length}\n\n`;
  1937	      for (const p of results.promoted.slice(0, 15)) response += `[${p.grade}] ${p.domain}/${p.file}\n`;
  1938	      if (results.promoted.length > 15) response += `... and ${results.promoted.length - 15} more\n`;
  1939	      for (const e of results.errors) response += `ERR: ${e.file} — ${e.reason}\n`;
  1940	      await safeSend(chatId, response);
  1941	    } else {
  1942	      const candidates = scanForPromotions({ minGrade: 'B' });
  1943	      await safeSend(chatId, generateReport(candidates).slice(0, 4000));
  1944	    }
  1945	  } catch (err) { await safeSend(chatId, `Promote error: ${err.message}`); }
  1946	});
  1947	
  1948	// ── /schedule — Google Calendar schedule guard ──────────────────────────────
  1949	bot.onText(/^\/schedule(?:@\w+)?(?:\s+(.*))?$/i, async (msg, match) => {
  1950	  const chatId = msg.chat.id;
  1951	  try {
  1952	    const offset = (match[1] || '').trim() === 'next' ? 1 : 0;
  1953	    const report = await getScheduleReport(offset);
  1954	    await safeSend(chatId, formatScheduleReport(report));
  1955	  } catch (err) { await safeSend(chatId, `Schedule error: ${err.message}`); }
  1956	});
  1957	
  1958	// ── /health — Combined PunchPass health dashboard ──────────────────────────
  1959	bot.onText(/^\/health(?:@\w+)?$/i, async (msg) => {
  1960	  const chatId = msg.chat.id;
  1961	  try {
  1962	    const memberDataPath = path.join(process.env.HOME, 'br-gm-agent', 'reports', 'member-data.json');
  1963	    if (!fs.existsSync(memberDataPath)) {
  1964	      await safeSend(chatId, 'No member data. Run: python3 ~/br-gm-agent/scripts/punchpass-export.py');
  1965	      return;
  1966	    }
  1967	    const data = JSON.parse(fs.readFileSync(memberDataPath, 'utf8'));
  1968	    const s = data.summary;
  1969	    let response = `Gym Health Dashboard\n\nData: ${data.export_date} (${data.data_staleness_days}d stale)\nActive: ${data.total_active_members}\n\n`;
  1970	    response += `Churn 14-29d: ${s.churn_risk_medium}\nChurn 30+d: ${s.churn_risk_high}\nSuspended: ${s.suspended}\nExpiring: ${s.expiring_soon}\n`;
  1971	    if (data.data_staleness_days > 7) response += `\nData ${data.data_staleness_days}d stale — drop fresh CSVs in ~/Desktop/punchpass/`;
  1972	    const highChurn = data.members.filter(m => m.churn_severity === 'high').slice(0, 5);
  1973	    if (highChurn.length > 0) {
  1974	      response += `\n\nTop churn risks:\n`;
  1975	      for (const m of highChurn) response += `  ${m.name} — ${m.days_absent}d absent (${m.pass_type})\n`;
  1976	    }
  1977	    await safeSend(chatId, response);
  1978	  } catch (err) { await safeSend(chatId, `Health error: ${err.message}`); }
  1979	});
  1980	
  1981	// ── /trade — Trading signal scan + debate ───────────────────────────────────
  1982	bot.onText(/^\/trade(?:@\w+)?$/i, async (msg) => {
  1983	  const chatId = msg.chat.id;
  1984	  await safeSend(chatId, 'Scanning market...');
  1985	
  1986	  try {
  1987	    // Run signal scraper
  1988	    const { spawn: sp } = await import('child_process');
  1989	    const proc = sp(path.join(process.env.HOME, 'cathedral-venv', 'bin', 'python3'),
  1990	      [path.join(process.env.HOME, 'nanoclaw', 'trader', 'signals', 'crypto-signals.py')],
  1991	      { env: process.env, timeout: 30000 });
  1992	
  1993	    let out = '';
  1994	    proc.stdout.on('data', d => { out += d; });
  1995	    proc.on('close', async () => {
  1996	      try {
  1997	        const dataPath = path.join(process.env.HOME, 'nanoclaw', 'trader', 'signals', 'crypto-signals-latest.json');
  1998	        const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  1999	
  2000	        // Line 1: Fear & Greed
  2001	        const fg = data.fear_greed;
  2002	        const fgLine = fg ? `Fear/Greed: ${fg.value} (${fg.label})` : 'Fear/Greed: unavailable';
  2003	
  2004	        // Line 2: Top signal
  2005	        let signalLine = 'Top signal: none — market neutral';
  2006	        if (data.signals && data.signals.length > 0) {
  2007	          const top = data.signals.sort((a, b) => b.strength - a.strength)[0];
  2008	          signalLine = `Top signal: ${top.asset} ${top.direction} (strength ${top.strength.toFixed(2)}) — ${top.reasoning.slice(0, 60)}`;
  2009	        }
  2010	
  2011	        // Line 3: Run debate on top signal if exists
  2012	        let debateLine = 'Debate: no signal to debate. Patience is a position.';
  2013	        if (data.signals && data.signals.length > 0) {
  2014	          const top = data.signals[0];
  2015	          if (top.asset !== 'MARKET' && top.strength > 0.3) {
  2016	            const price = data.prices[top.asset]?.price || 0;
  2017	            const result = await debate({
  2018	              asset: top.asset,
  2019	              direction: top.direction,
  2020	              entryPrice: price,
  2021	              signals: data.signals.filter(s => s.asset === top.asset || s.asset === 'MARKET'),
  2022	              context: `Fear/Greed: ${fg?.value}. Reddit: ${data.reddit_sentiment?.sentiment_label}.`,
  2023	            });
  2024	            debateLine = `Debate: ${result.decision} — ${result.reasoning.slice(0, 80)}`;
  2025	          } else if (top.asset === 'MARKET') {
  2026	            debateLine = `Debate: MARKET-wide signal (${top.direction}). No specific asset to debate.`;
  2027	          }
  2028	        }
  2029	
  2030	        const response = `${fgLine}\n${signalLine}\n${debateLine}`;
  2031	        await safeSend(chatId, response);
  2032	
  2033	        // Copy to scraper outputs for dashboard
  2034	        fs.copyFileSync(dataPath, path.join(process.env.HOME, 'nanoclaw', 'scraper', 'outputs', 'crypto-signals-latest.json'));
  2035	      } catch (e) {
  2036	        await safeSend(chatId, `Trade scan failed: ${e.message}`);
  2037	      }
  2038	    });
  2039	    proc.on('error', async () => { await safeSend(chatId, 'Signal scraper failed to start.'); });
  2040	  } catch (err) { await safeSend(chatId, `Trade error: ${err.message}`); }
  2041	});
  2042	
  2043	// ── /intel — Intelligence Hub scraper commands ─────────────────────────────
  2044	// /intel           → dashboard summary
  2045	// /intel run all   → run all scrapers
  2046	// /intel run <name> → run one scraper
  2047	bot.onText(/^\/intel(?:@\w+)?(?:\s+(.*))?$/i, async (msg, match) => {
  2048	  const chatId = msg.chat.id;
  2049	  const arg = (match[1] || '').trim();
  2050	
  2051	  try {
  2052	    if (arg === 'run all') {
  2053	      await safeSend(chatId, 'Running all intelligence scrapers...');
  2054	      const results = await runAll();
  2055	      await safeSend(chatId, formatTelegramSummary(results));
  2056	    } else if (arg.startsWith('run ')) {
  2057	      const target = arg.slice(4).trim();
  2058	      await safeSend(chatId, `Running ${target}...`);
  2059	      const result = await runTarget(target);
  2060	      if (result.success) {
  2061	        await safeSend(chatId, `${target}: OK (${(result.duration / 1000).toFixed(1)}s)\n${result.output.split('\n').pop()}`);
  2062	      } else {
  2063	        await safeSend(chatId, `${target}: FAILED\n${result.error?.slice(0, 500)}`);
  2064	      }
  2065	    } else {
  2066	      const data = getDashboardData();
  2067	      let response = 'Intelligence Hub\n\n';
  2068	      for (const [name, info] of Object.entries(data.targets)) {
  2069	        const status = info.hasData ? 'OK' : '--';
  2070	        const age = info.lastModified ? `${Math.round((Date.now() - new Date(info.lastModified).getTime()) / 3600000)}h ago` : 'never';
  2071	        response += `${status === 'OK' ? '✅' : '⬜'} ${name}: ${info.summary || 'no data'} (${age})\n`;
  2072	      }
  2073	      response += '\nRun: /intel run all\nHub: localhost:8080/scraper/hub';
  2074	      await safeSend(chatId, response);
  2075	    }
  2076	  } catch (err) { await safeSend(chatId, `Intel error: ${err.message}`); }
  2077	});
  2078	
  2079	// ── Start combo file watcher in background ──────────────────────────────────
  2080	try {
  2081	  startComboWatcher((report) => {
  2082	    console.log(`[combo-watcher] ${report.source}: ${report.summary.passRate} pass rate`);
  2083	  });
  2084	} catch (e) { console.error('[combo-watcher] Failed to start:', e.message); }
  2085	
  2086	// ── State writer bridge ───────────────────────────────────────────────────────
  2087	
  2088	function recordExchange(paulMsg, cathReply) {
  2089	  const proc = spawn(
  2090	    'python3',
  2091	    [path.join(process.env.HOME, 'Cathedral', 'event-bus', 'state_writer.py'), '--stdin'],
  2092	    { env: process.env }
  2093	  );
  2094	  proc.stdin.write(JSON.stringify({ paul: paulMsg, cath: cathReply }));
  2095	  proc.stdin.end();
  2096	  proc.on('error', (err) => console.error('[state_writer] spawn error:', err.message));
  2097	  proc.stderr.on('data', (d) => console.error('[state_writer]', d.toString().trim()));
  2098	  // fire-and-forget — do not await
  2099	}
  2100	
  2101	// ── Cath API bridge (Node.js native — no Python subprocess) ──────────────────
  2102	
  2103	const CATH_TRANSMISSION = path.join(process.env.HOME, 'Cathedral', 'cath_transmission.md');
  2104	const CATH_PERSONA = path.join(process.env.HOME, 'cathedral-vault', '.cache', 'system-prompt.txt');
  2105	const CATH_STATE = path.join(process.env.HOME, 'Cathedral', 'cath-state.json');
  2106	const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
  2107	
  2108	function loadCathSystem() {
  2109	  const parts = [];
  2110	  try { parts.push('## TRANSMISSION\n\n' + fs.readFileSync(CATH_TRANSMISSION, 'utf-8').trim()); } catch {}
  2111	  try { parts.push(fs.readFileSync(CATH_PERSONA, 'utf-8').trim()); } catch {
  2112	    parts.push('You are Cath. Cathedral intelligence. Paul\'s cognitive extension. Speak with precision. Never flatter. Never pad.');
  2113	  }
  2114	  return parts.join('\n\n');
  2115	}
  2116	
  2117	function buildCathDynamic(query, history) {
  2118	  const parts = [];
  2119	  if (history && history.length > 0) {
  2120	    const lines = ['## CONVERSATION HISTORY\n'];
  2121	    for (const turn of history.slice(-10)) {
  2122	      const speaker = turn.role === 'user' ? 'Paul' : 'Cath';
  2123	      lines.push(`${speaker}: ${(turn.content || '').slice(0, 400)}`);
  2124	    }
  2125	    parts.push(lines.join('\n'));
  2126	  }
  2127	  try {
  2128	    const state = JSON.parse(fs.readFileSync(CATH_STATE, 'utf-8'));
  2129	    if (state.active_threads) {
  2130	      parts.push('## SESSION STATE\nActive threads:\n' + state.active_threads.map(t => `  • ${t}`).join('\n'));
  2131	    }
  2132	  } catch {}
  2133	  // Vault keyword search via vault_reader.py (local filesystem, no network)
  2134	  try {
  2135	    const raw = execFileSync('python3', [
  2136	      path.join(process.env.HOME, 'nanoclaw', 'vault_reader.py'),
  2137	      'search', query, '--top_k', '5', '--json'
  2138	    ], { timeout: 5000 });
  2139	    const results = JSON.parse(raw.toString());
  2140	    if (results.length > 0) {
  2141	      const lines = ['## VAULT CONTEXT\n'];
  2142	      for (const r of results) {
  2143	        lines.push(`[${r.domain}] ${r.title}: ${(r.first_line || '').slice(0, 200)}`);
  2144	      }
  2145	      parts.push(lines.join('\n'));
  2146	    }
  2147	  } catch {}
  2148	  return parts.join('\n\n');
  2149	}
  2150	
  2151	async function callCath(query, history = []) {
  2152	  const startMs = Date.now();
  2153	  console.log(`[callCath] query="${query.slice(0, 60)}" history=${history.length} turns`);
  2154	
  2155	  const systemText = loadCathSystem() + '\n\n' + buildCathDynamic(query, history);
  2156	  const apiKey = process.env.DEEPSEEK_API_KEY;
  2157	  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');
  2158	
  2159	  const body = JSON.stringify({
  2160	    model: 'deepseek-chat',
  2161	    max_tokens: 1024,
  2162	    messages: [
  2163	      { role: 'system', content: systemText },
  2164	      { role: 'user', content: query },
  2165	    ],
  2166	  });
  2167	
  2168	  const resp = await fetch(DEEPSEEK_URL, {
  2169	    method: 'POST',
  2170	    headers: {
  2171	      'Content-Type': 'application/json',
  2172	      'Authorization': `Bearer ${apiKey}`,
  2173	    },
  2174	    body,
  2175	    signal: AbortSignal.timeout(60000),
  2176	  });
  2177	
  2178	  if (!resp.ok) {
  2179	    const errText = await resp.text().catch(() => '');
  2180	    throw new Error(`DeepSeek ${resp.status}: ${errText.slice(0, 200)}`);
  2181	  }
  2182	
  2183	  const data = await resp.json();
  2184	  const text = data.choices?.[0]?.message?.content || '';
  2185	  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  2186	  const usage = data.usage || {};
  2187	  console.log(`[callCath] done ${elapsed}s in=${usage.prompt_tokens || '?'} out=${usage.completion_tokens || '?'}`);
  2188	  return text.trim();
  2189	}
  2190	
  2191	// --- Voice Note Handler ---
  2192	// ── Reed Photo Handler — send photo with /reed caption ──────────────────────
  2193	bot.on('photo', async (msg) => {
  2194	  const chatId = msg.chat.id;
  2195	  const caption = (msg.caption || '').trim();
  2196	
  2197	  // Only handle if caption starts with /reed
  2198	  if (!caption.toLowerCase().startsWith('/reed')) return;
  2199	
  2200	  const instruction = caption.replace(/^\/reed\s*/i, '').trim();
  2201	  const fileStamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
  2202	  const photoFile = msg.photo[msg.photo.length - 1]; // highest resolution
  2203	  const localPath = `/tmp/reed-${fileStamp}.jpg`;
  2204	
  2205	  try {
  2206	    // Download photo from Telegram
  2207	    const fileLink = await bot.getFileLink(photoFile.file_id);
  2208	    const axios = (await import('axios')).default;
  2209	    const response = await axios({ url: fileLink, responseType: 'arraybuffer' });
  2210	    fs.writeFileSync(localPath, response.data);
  2211	    console.log(`[reed-photo] Downloaded ${localPath} (${(response.data.length / 1024).toFixed(0)}KB)`);
  2212	
  2213	    // Upscale small images — Nano Banana fails below ~700px
  2214	    const dimInfo = execSync(`sips -g pixelWidth -g pixelHeight "${localPath}"`, { encoding: 'utf-8' });
  2215	    const pw = parseInt(dimInfo.match(/pixelWidth:\s*(\d+)/)?.[1] || '0');
  2216	    const ph = parseInt(dimInfo.match(/pixelHeight:\s*(\d+)/)?.[1] || '0');
  2217	    if (Math.max(pw, ph) < 700) {
  2218	      const scale = Math.ceil(1400 / Math.max(pw, ph));
  2219	      execSync(`sips --resampleWidth ${pw * scale} "${localPath}"`, { timeout: 10000 });
  2220	      console.log(`[reed-photo] Upscaled ${pw}x${ph} → ${pw * scale}px wide`);
  2221	    }
  2222	
  2223	    if (!instruction) {
  2224	      // No text — auto pro-photo pipeline (taste map: pro_photo = YES anchor)
  2225	      console.log('[reed-taste] Default pro_photo — confirmed anchor in taste map');
  2226	      await safeSend(chatId, '🎬 Reed: Pro photo upgrade running...');
  2227	
  2228	      const result = execSync(
  2229	        `higgsfield generate create nano_banana_2 --prompt "Apply a high-end commercial retouch. Maintain 100% preservation of subject identity, poses, clothing, and all background elements. 16:9 cinematic. Sony A7R V, 70mm lens, deep crisp focus throughout. Soft directional key light from camera-left, diminish harsh overhead fluorescents. Warm golden sports documentary color grade. Saturate wall posters and artwork. Enhance wood floor grain and leather bag textures with age patina. Subtle vignette. Natural skin tones. No hallucinations, do not add or remove objects or people. Professional Lightroom grade of original raw file." --image "${localPath}" --aspect_ratio 16:9 --resolution 2k --wait`,
  2230	        { encoding: 'utf-8', timeout: 600000 }
  2231	      ).trim();
  2232	
  2233	      if (result.startsWith('http')) {
  2234	        const outPng = `/tmp/reed-pro-${fileStamp}.png`;
  2235	        const outPath = `/tmp/reed-pro-${fileStamp}.jpg`;
  2236	        execSync(`curl -sL "${result}" -o "${outPng}"`, { timeout: 60000 });
  2237	        // Convert to JPEG for Telegram (PNGs too large, won't render on phone)
  2238	        execSync(`sips -s format jpeg -s formatOptions 85 "${outPng}" --out "${outPath}"`, { timeout: 30000 });
  2239	        await safeSendPhoto(chatId, outPath, '🎬 Reed: Pro photo — 16:9 cinematic grade');
  2240	        console.log(`[reed-photo] Pro photo delivered`);
  2241	        // Log to creative experiment
  2242	        try { const { logGeneration } = await import('./experiment-engine/creative/creative-strategies.js'); logGeneration('pro_photo', 'photo', filePath, outPath, 'pro photo preservation', 'nano_banana_2'); } catch(e) {}
  2243	      } else {
  2244	        await safeSend(chatId, `⚠️ Reed: Unexpected result — ${result.slice(0, 200)}`);
  2245	      }
  2246	    } else {
  2247	      // Has instruction — auto-execute based on keywords
  2248	      const lower = instruction.toLowerCase();
  2249	      let cmd, mode, aspect;
  2250	
  2251	      if (lower.includes('ippo') || lower.includes('shonen')) {
  2252	        mode = 'Ippo shonen manga';
  2253	        aspect = '3:4';
  2254	        cmd = `higgsfield generate create nano_banana_2 --prompt "Japanese boxing manga panel in the style of Hajime no Ippo. Dynamic action lines radiating from the punch impact. Speed lines, motion blur on fists. Bold ink outlines, screentone shading. Dramatic low angle. Sweat droplets frozen mid-air. Japanese sound effect text near impact. Professional weekly shonen manga quality. Preserve exact poses and gym environment." --image "${localPath}" --aspect_ratio ${aspect} --resolution 2k --wait`;
  2255	      } else if (lower.includes('manga') || lower.includes('anime') || lower.includes('comic') || lower.includes('graphic novel')) {
  2256	        mode = 'Manga/graphic novel';
  2257	        aspect = lower.includes('wide') ? '16:9' : '3:4';
  2258	        const style = lower.includes('anime') ? 'anime illustration' : lower.includes('comic') ? 'graphic novel comic' : 'manga';
  2259	        cmd = `higgsfield generate create nano_banana_2 --prompt "Convert this photograph into a detailed ${style} illustration. Warm sepia and earth tones with golden light rays through windows. Ink-style cross-hatching and clean linework. Preserve all architectural details, equipment placement, brand text (Lonsdale, Basic Reflex), and wall posters exactly. Enhance foreground detail: gym bags, gloves, rope, floor texture. Professional ${style} environment art quality. Do not add or remove any people. Convert only what exists in the photo." --image "${localPath}" --aspect_ratio ${aspect} --resolution 2k --wait`;
  2260	      } else if (lower.includes('noir') || lower.includes('black and white') || lower.includes('bw')) {
  2261	        mode = 'Film noir';
  2262	        aspect = '16:9';
  2263	        cmd = `higgsfield generate create nano_banana_2 --prompt "Film noir boxing photograph. Pure black and white with deep inky shadows. 1940s fight night atmosphere. Single harsh overhead light creating dramatic pools of light and shadow. Film grain, slight motion blur on the punch. Smoky atmosphere. Preserve subject identity and pose exactly. Classic noir cinematography, high contrast, no midtones." --image "${localPath}" --aspect_ratio ${aspect} --resolution 2k --wait`;
  2264	      } else if (lower.includes('neon') || lower.includes('cyberpunk') || lower.includes('blade runner')) {
  2265	        mode = 'HK Neon cyberpunk';
  2266	        aspect = '16:9';
  2267	        cmd = `higgsfield generate create nano_banana_2 --prompt "Hong Kong cyberpunk boxing gym. Neon signs reflecting off rain-slicked floors in pink, blue, and amber. Chinese characters glowing on walls. Atmospheric fog catching neon light. Dark moody shadows with electric color pops. Blade Runner meets boxing gym. Preserve subject identity and pose. Cinematic 2.39:1 anamorphic feel." --image "${localPath}" --aspect_ratio ${aspect} --resolution 2k --wait`;
  2268	      } else if (lower.includes('oil') || lower.includes('painting') || lower.includes('rembrandt')) {
  2269	        mode = 'Oil painting';
  2270	        aspect = '16:9';
  2271	        cmd = `higgsfield generate create nano_banana_2 --prompt "Oil painting on canvas. Heavy impasto brushstrokes visible throughout. Dramatic Rembrandt side-lighting from upper left. Deep rich shadows. Color palette: deep browns, warm whites, muted reds, charcoal blacks — NOT orange or amber monochrome. Canvas weave texture visible. Glint of light on leather gloves and bag chains. Preserve subject poses and gym environment. Classical fine art treatment of modern boxing. Gallery quality." --image "${localPath}" --aspect_ratio ${aspect} --resolution 2k --wait`;
  2272	      } else if (lower.includes('dramatic') || lower.includes('cinematic') || lower.includes('cinema') || lower.includes('movie')) {
  2273	        mode = 'Dramatic cinema';
  2274	        aspect = '16:9';
  2275	        cmd = `higgsfield generate create nano_banana_2 --prompt "Dramatic cinematic reimagining. Volumetric haze and atmospheric fog filling the gym. Golden god rays streaming through windows. Heavy chiaroscuro lighting with deep shadows. Film grain texture. Preserve subject identity and pose but add dramatic atmosphere: backlit silhouette depth, warm amber tones, dust particles in light beams. Boxing gym atmosphere. Sports documentary cinematography at golden hour." --image "${localPath}" --aspect_ratio ${aspect} --resolution 2k --wait`;
  2276	      } else if (lower.includes('video') || lower.includes('animate') || lower.includes('motion')) {
  2277	        mode = 'Video generation';
  2278	        aspect = '16:9';
  2279	        cmd = `higgsfield generate create seedance_2_0 --prompt "Subtle cinematic motion, camera slowly pushes in, atmospheric lighting shifts, documentary feel" --start-image "${localPath}" --duration 5 --aspect_ratio ${aspect} --wait`;
  2280	      } else if (lower.includes('poster') || lower.includes('fight poster') || lower.includes('70s')) {
  2281	        // TWO-PASS PIPELINE: text-free art → composite real logos
  2282	        mode = 'BR branded poster';
  2283	        await safeSend(chatId, '🎬 Reed: Two-pass poster pipeline — generating art, then compositing real logos...');
  2284	
  2285	        try {
  2286	          // Pass 1: Generate text-free art (can use source photo as reference)
  2287	          const posterPrompt = lower.includes('no ref') || lower.includes('from scratch')
  2288	            ? `Vertical vintage fight-culture poster artwork with NO TEXT anywhere. Leave clear dark area at top 15% and bottom 10% for real logo overlay. BRAND PALETTE ONLY: burgundy (#8B2020), olive (#6B7C47), black, white, aged cream. Shaw Brothers meets Emory Douglas meets Cuban cigar label. Rough silkscreen risograph, halftone grain, misregistered layers, aged paper with fold creases. Dense ornamental border: tropical leaves, Chinese cloud motifs, rope patterns, gloves, heavy bags, dragon. Central boxing action as layered graphic silhouettes. HK neon fragments integrated. Hand-pulled Kowloon 1978. ZERO TEXT.`
  2289	            : `Transform this boxing photograph into vintage fight-culture poster artwork with NO TEXT anywhere. Leave clear dark area at top 15% and bottom 10% for real logo overlay. BRAND PALETTE ONLY: burgundy (#8B2020), olive (#6B7C47), black, white, aged cream. Shaw Brothers meets Emory Douglas. Rough silkscreen risograph, halftone grain, misregistered layers, aged paper. Dense ornamental border. Preserve subject pose and gym environment but render as graphic print art. ZERO TEXT.`;
  2290	
  2291	          const imgFlag = lower.includes('no ref') || lower.includes('from scratch') ? '' : ` --image "${localPath}"`;
  2292	          const pass1Cmd = `higgsfield generate create nano_banana_2 --prompt "${posterPrompt.replace(/"/g, '\\"')}"${imgFlag} --aspect_ratio 3:4 --resolution 2k --wait`;
  2293	
  2294	          const artUrl = execSync(pass1Cmd, { encoding: 'utf-8', timeout: 600000 }).trim();
  2295	
  2296	          if (!artUrl.startsWith('http')) {
  2297	            await safeSend(chatId, `⚠️ Reed: Art generation failed — ${artUrl.slice(0, 100)}`);
  2298	            return;
  2299	          }
  2300	
  2301	          // Download art
  2302	          const artPath = `/tmp/reed-poster-art-${fileStamp}.png`;
  2303	          execSync(`curl -sL "${artUrl}" -o "${artPath}"`, { timeout: 60000 });
  2304	
  2305	          // Pass 2: Composite real logos
  2306	          const brandedPath = execSync(
  2307	            `python3 ${path.join(process.env.HOME, 'nanoclaw', 'reed-lab', 'poster-composite.py')} "${artPath}" --full`,
  2308	            { encoding: 'utf-8', timeout: 30000 }
  2309	          ).trim().split('\n').pop().replace('Branded poster: ', '');
  2310	
  2311	          await safeSendPhoto(chatId, brandedPath, '🎬 Reed: BR Branded Poster — real wordmark + CSOB badge + HONG KONG\nTwo-pass: AI art → logo composite');
  2312	          console.log('[reed-photo] Branded poster delivered');
  2313	
  2314	          // Log to creative experiment
  2315	          try { const { logGeneration } = await import('./experiment-engine/creative/creative-strategies.js'); logGeneration('poster_br', instruction || 'poster', localPath, brandedPath, 'poster_br two-pass', 'nano_banana_2'); } catch(e) {}
  2316	
  2317	        } catch(e) {
  2318	          console.error('[reed-poster]', e.message);
  2319	          await safeSend(chatId, `⚠️ Reed poster pipeline failed: ${e.message}`);
  2320	        }
  2321	        return;
  2322	      } else {
  2323	        // Default: pro photo with custom instruction baked in
  2324	        mode = 'Pro photo + custom';
  2325	        aspect = '16:9';
  2326	        cmd = `higgsfield generate create nano_banana_2 --prompt "Apply a high-end commercial retouch. ${instruction}. Maintain 100% preservation of subject identity, poses, clothing, and all background elements. Warm golden sports documentary color grade. Saturate wall posters. Enhance textures. Subtle vignette. Natural skin tones. No hallucinations, do not add or remove objects or people." --image "${localPath}" --aspect_ratio ${aspect} --resolution 2k --wait`;
  2327	      }
  2328	
  2329	      // ── Taste Map gate — check style against preferences before generating ──
  2330	      try {
  2331	        const styleKey = mode.toLowerCase().replace(/\s+/g, '_');
  2332	        const rejection = checkRejection('visual_style', styleKey);
  2333	        if (rejection.rejected) {
  2334	          await safeSend(chatId, `⚠️ Reed: Style "${mode}" flagged by Taste Map.\nReasons: ${rejection.reasons.join(', ')}\n\nGenerating anyway — but flagging as unverified preference.`);
  2335	        }
  2336	        // Log what Reed is generating for passive taste map learning
  2337	        console.log(`[reed-taste] Style: ${styleKey}, rejected: ${rejection.rejected}`);
  2338	      } catch (tmErr) {
  2339	        console.error('[reed-taste] Taste map check failed (non-blocking):', tmErr.message);
  2340	      }
  2341	
  2342	      await safeSend(chatId, `🎬 Reed: Running ${mode}...`);
  2343	      console.log(`[reed-photo] Mode: ${mode}, cmd length: ${cmd.length}`);
  2344	
  2345	      const genResult = execSync(cmd, { encoding: 'utf-8', timeout: 600000 }).trim();
  2346	
  2347	      if (genResult.startsWith('http')) {
  2348	        const outPng = `/tmp/reed-${mode.replace(/\W/g, '')}-${fileStamp}.png`;
  2349	        const outPath = `/tmp/reed-${mode.replace(/\W/g, '')}-${fileStamp}.jpg`;
  2350	        execSync(`curl -sL "${genResult}" -o "${outPng}"`, { timeout: 60000 });
  2351	
  2352	        if (lower.includes('video') || lower.includes('animate') || lower.includes('motion')) {
  2353	          // Video — send as document (mp4)
  2354	          const outVid = `/tmp/reed-video-${fileStamp}.mp4`;
  2355	          execSync(`curl -sL "${genResult}" -o "${outVid}"`, { timeout: 120000 });
  2356	          await bot.sendDocument(chatId, outVid, { caption: `🎬 Reed: ${mode} complete` });
  2357	        } else {
  2358	          execSync(`sips -s format jpeg -s formatOptions 85 "${outPng}" --out "${outPath}"`, { timeout: 30000 });
  2359	          await safeSendPhoto(chatId, outPath, `🎬 Reed: ${mode} — ${aspect}`);
  2360	        }
  2361	        console.log(`[reed-photo] ${mode} delivered`);
  2362	        // Log to creative experiment
  2363	        try { const { logGeneration } = await import('./experiment-engine/creative/creative-strategies.js'); logGeneration(mode.toLowerCase().replace(/\s+/g, '_'), instruction || 'photo', filePath, outPath, instruction, 'nano_banana_2'); } catch(e) {}
  2364	      } else {
  2365	        await safeSend(chatId, `⚠️ Reed: Unexpected result — ${genResult.slice(0, 200)}`);
  2366	      }
  2367	    }
  2368	  } catch (err) {
  2369	    console.error('[reed-photo]', err.message);
  2370	    await safeSend(chatId, `⚠️ Reed photo error: ${err.message.slice(0, 200)}`);
  2371	  }
  2372	});
  2373	
  2374	// --- Voice Note Handler ---
  2375	bot.on('voice', async (msg) => {
  2376	  const chatId = msg.chat.id;
  2377	  const fileId = msg.voice.file_id;
  2378	  const now = new Date();
  2379	  const dateStr = now.toISOString().replace('T', ' ').slice(0, 16);
  2380	  const fileStamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 15);
  2381	  const oggPath = `/tmp/voice-${fileStamp}.ogg`;
  2382	  const wavPath = `/tmp/voice-${fileStamp}.wav`;
  2383	  const vaultDir = `${process.env.HOME}/cathedral-vault/00_Staging/voice-notes`;
  2384	  const vaultPath = `${vaultDir}/${fileStamp}.md`;
  2385	
  2386	  try {
  2387	    // 1. Download OGG from Telegram
  2388	    const fileLink = await bot.getFileLink(fileId);
  2389	    const axios = (await import('axios')).default;
  2390	    const response = await axios({ url: fileLink, responseType: 'arraybuffer' });
  2391	    fs.writeFileSync(oggPath, response.data);
  2392	
  2393	    // 2. Convert OGG to WAV via ffmpeg
  2394	    await new Promise((resolve, reject) => {
  2395	      const ffmpeg = spawn('ffmpeg', ['-y', '-i', oggPath, '-af', 'adelay=500|500,apad=pad_dur=1', '-ar', '16000', '-ac', '1', wavPath]);
  2396	      ffmpeg.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)));
  2397	      ffmpeg.on('error', reject);
  2398	    });
  2399	
  2400	    // 3. Transcribe via whisper-cpp
  2401	    const transcript = await new Promise((resolve, reject) => {
  2402	      const whisper = spawn('/opt/homebrew/bin/whisper-cli', [
  2403	        '-m', `${process.env.HOME}/Cathedral/models/ggml-medium.bin`,
  2404	        '-f', wavPath,
  2405	        '--no-timestamps',
  2406	        '-otxt',
  2407	        '-of', wavPath
  2408	      ]);
  2409	      whisper.on('close', () => {
  2410	        const txtPath = wavPath + '.txt';
  2411	        if (fs.existsSync(txtPath)) {
  2412	          resolve(fs.readFileSync(txtPath, 'utf8').trim());
  2413	          fs.unlinkSync(txtPath);
  2414	        } else {
  2415	          reject(new Error('Whisper produced no output'));
  2416	        }
  2417	      });
  2418	      whisper.on('error', reject);
  2419	    });
  2420	
  2421	    // 4. Write to vault
  2422	    fs.mkdirSync(vaultDir, { recursive: true });
  2423	    const frontmatter = `---\ntitle: Voice Note — ${dateStr}\ntype: voice-note\nsource: telegram\ncreated: ${now.toISOString().slice(0, 10)}\ntags: [voice-note, inbox]\n---\n\n# Voice Note — ${dateStr}\n\n${transcript}\n`;
  2424	    fs.writeFileSync(vaultPath, frontmatter);
  2425	
  2426	    // 5. Confirm receipt and route through Cathy
  2427	    const firstLine = transcript.split('\n')[0].slice(0, 100);
  2428	    await safeSend(chatId, `🎙️ Heard. Filed to vault.\n"${firstLine}..."`);
  2429	
  2430	    // Cleanup
  2431	    try { fs.unlinkSync(oggPath); } catch {}
  2432	    try { fs.unlinkSync(wavPath); } catch {}
  2433	
  2434	    // 6. Route transcript through Cathy — same path as text messages
  2435	    addToConversation('cath', chatId, 'user', transcript);
  2436	    const history = getConversationHistory('cath', chatId);
  2437	    await safeSend(chatId, '⏳ Cathedral...');
  2438	    const reply = await callCath(transcript, history);
  2439	    addToConversation('cath', chatId, 'assistant', reply || '');
  2440	    await safeSend(chatId, reply || '⚠️ No response from Cath.');
  2441	
  2442	  } catch (err) {
  2443	    console.error('Voice handler error:', err);
  2444	    await safeSend(chatId, `⚠️ Voice note received but transcription failed: ${err.message}`);
  2445	  }
  2446	});
  2447	
  2448	// ── Document handler — .md files → vault ──────────���─────────────────────────
  2449	bot.on('document', async (msg) => {
  2450	  const chatId = msg.chat.id;
  2451	  const doc = msg.document;
  2452	  if (!doc || !doc.file_name) return;
  2453	
  2454	  // Only handle .md files
  2455	  if (!doc.file_name.endsWith('.md')) return;
  2456	
  2457	  try {
  2458	    const fileLink = await bot.getFileLink(doc.file_id);
  2459	    const axios = (await import('axios')).default;
  2460	    const response = await axios({ url: fileLink, responseType: 'text' });
  2461	    const content = response.data;
  2462	
  2463	    // Determine destination: caption can specify path, default is 00_Staging/cathedral/
  2464	    const caption = (msg.caption || '').trim();
  2465	    let destDir, filename;
  2466	
  2467	    if (caption.startsWith('/vault ')) {
  2468	      // /vault <path> in caption overrides destination
  2469	      const vaultPath = caption.slice('/vault '.length).trim();
  2470	      if (vaultPath.endsWith('.md')) {
  2471	        destDir = path.dirname(path.join(VAULT_ROOT, vaultPath));
  2472	        filename = path.basename(vaultPath);
  2473	      } else {
  2474	        destDir = path.join(VAULT_ROOT, vaultPath);
  2475	        filename = doc.file_name;
  2476	      }
  2477	    } else {
  2478	      destDir = path.join(VAULT_ROOT, '00_Staging', 'cathedral');
  2479	      filename = doc.file_name;
  2480	    }
  2481	
  2482	    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  2483	    const fullPath = deduplicatePath(path.join(destDir, filename));
  2484	    fs.writeFileSync(fullPath, content);
  2485	    const rel = path.relative(VAULT_ROOT, fullPath);
  2486	    await safeSend(chatId, `📄 Document received and filed:\n\`${rel}\``);
  2487	  } catch (err) {
  2488	    console.error('Document handler error:', err);
  2489	    await safeSend(chatId, `���️ Document error: ${err.message}`);
  2490	  }
  2491	});
  2492	
  2493	// Caption selection handler
  2494	bot.on('message', async (msg) => {
  2495	  if (!msg.text) return;
  2496	  const chatId = msg.chat.id;
  2497	  console.log(`[chat] id=${chatId}`);
  2498	  const postState = postGenerationState[chatId];
  2499	
  2500	  // Check if this is a caption selection for a recently generated post
  2501	  if (postState && ['1', '2', '3'].includes(msg.text)) {
  2502	    const index = parseInt(msg.text) - 1;
  2503	    const selectedCaption = postState.captions[index];
  2504	    const topic = postState.topic;
  2505	    const visualDirection = postState.visualDirection;
  2506	
  2507	    // Generate filename with current date
  2508	    const today = new Date().toISOString().split('T')[0];
  2509	    const filename = `${today}-${topic.replace(/\s+/g, '-')}-caption.md`;
  2510	    const filepath = path.join(SOCIAL_CONTENT_PATH, filename);
  2511	
  2512	    // Write to file
  2513	    const fileContent = 
  2514	      `# ${topic.toUpperCase()} POST\n\n` +
  2515	      `## Caption\n\n${selectedCaption}\n\n` +
  2516	      `## Visual Direction\n\n${visualDirection}`;
  2517	
  2518	    fs.writeFileSync(filepath, fileContent);
  2519	
  2520	    // Clear the state and send confirmation
  2521	    delete postGenerationState[chatId];
  2522	
  2523	    safeSend(chatId, 
  2524	      `✅ Saved to vault: ${filename}\n` +
  2525	      `🌀 Ready to post on Basic Reflex social channels.`, 
  2526	      { 
  2527	        reply_markup: { remove_keyboard: true } 
  2528	      }
  2529	    );
  2530	
  2531	    return;
  2532	  }
  2533	
  2534	  // /densify — trigger vault densifier batch
  2535	  if (msg.text === '/densify') {
  2536	    safeSend(chatId, '🔗 Running Vault Densifier...');
  2537	    try {
  2538	      // execSync imported at top
  2539	      execSync(`python3 ${path.join(process.env.HOME, 'Cathedral', 'vault-densifier.py')}`, { timeout: 60000 });
  2540	    } catch (err) {
  2541	      safeSend(chatId, `⚠️ Densifier error: ${err.message}`);
  2542	    }
  2543	    return;
  2544	  }
  2545	
  2546	  // /vault search|read|list
  2547	  if (msg.text.startsWith('/vault ')) {
  2548	    const parts = msg.text.slice('/vault '.length).trim().split(' ');
  2549	    const subCmd = parts[0]?.toLowerCase();
  2550	    const arg = parts.slice(1).join(' ');
  2551	
  2552	    if (subCmd === 'search') {
  2553	      if (!arg) { safeSend(chatId, 'Usage: /vault search <query>'); return; }
  2554	      safeSend(chatId, `🔎 Searching vault: "${arg}"...`);
  2555	      try {
  2556	        const output = await new Promise((resolve, reject) => {
  2557	          const proc = spawn('python3', [path.join(process.env.HOME, 'nanoclaw', 'vault_reader.py'), 'search', ...arg.split(' ')], { env: process.env });
  2558	          let out = '';
  2559	          let err = '';
  2560	          const timer = setTimeout(() => { proc.kill(); reject(new Error('timeout')); }, 30000);
  2561	          proc.stdout.on('data', d => { out += d.toString(); });
  2562	          proc.stderr.on('data', d => { err += d.toString(); });
  2563	          proc.on('close', code => { clearTimeout(timer); code === 0 ? resolve(out.trim()) : reject(new Error(err || `exit ${code}`)); });
  2564	          proc.on('error', err => { clearTimeout(timer); reject(err); });
  2565	        });
  2566	        await safeSend(chatId, output || 'No results.');
  2567	      } catch (err) {
  2568	        await safeSend(chatId, `⚠️ Vault search error: ${err.message}`);
  2569	      }
  2570	      return;
  2571	    }
  2572	
  2573	    if (subCmd === 'read') {
  2574	      if (!arg) { safeSend(chatId, 'Usage: /vault read <path>'); return; }
  2575	      safeSend(chatId, `📄 Reading: ${arg}`);
  2576	      try {
  2577	        const output = await new Promise((resolve, reject) => {
  2578	          const proc = spawn('python3', [path.join(process.env.HOME, 'nanoclaw', 'vault_reader.py'), 'read', arg], { env: process.env });
  2579	          let out = '';
  2580	          let err = '';
  2581	          const timer = setTimeout(() => { proc.kill(); reject(new Error('timeout')); }, 30000);
  2582	          proc.stdout.on('data', d => { out += d.toString(); });
  2583	          proc.stderr.on('data', d => { err += d.toString(); });
  2584	          proc.on('close', code => { clearTimeout(timer); code === 0 ? resolve(out.trim()) : reject(new Error(err || `exit ${code}`)); });
  2585	          proc.on('error', err => { clearTimeout(timer); reject(err); });
  2586	        });
  2587	        const chunks = output.match(/[\s\S]{1,4000}/g) || ['(empty)'];
  2588	        for (let i = 0; i < chunks.length; i++) {
  2589	          await new Promise(r => setTimeout(r, i * 300));
  2590	          await safeSend(chatId, chunks[i]);
  2591	        }
  2592	      } catch (err) {
  2593	        await safeSend(chatId, `⚠️ Vault read error: ${err.message}`);
  2594	      }
  2595	      return;
  2596	    }
  2597	
  2598	    if (subCmd === 'list') {
  2599	      try {
  2600	        const output = await new Promise((resolve, reject) => {
  2601	          const proc = spawn('python3', [path.join(process.env.HOME, 'nanoclaw', 'vault_reader.py'), 'list', ...(arg ? [arg] : [])], { env: process.env });
  2602	          let out = '';
  2603	          let err = '';
  2604	          const timer = setTimeout(() => { proc.kill(); reject(new Error('timeout')); }, 30000);
  2605	          proc.stdout.on('data', d => { out += d.toString(); });
  2606	          proc.stderr.on('data', d => { err += d.toString(); });
  2607	          proc.on('close', code => { clearTimeout(timer); code === 0 ? resolve(out.trim()) : reject(new Error(err || `exit ${code}`)); });
  2608	          proc.on('error', err => { clearTimeout(timer); reject(err); });
  2609	        });
  2610	        await safeSend(chatId, `\`\`\`\n${output}\n\`\`\``, { parse_mode: 'Markdown' });
  2611	      } catch (err) {
  2612	        await safeSend(chatId, `⚠️ Vault list error: ${err.message}`);
  2613	      }
  2614	      return;
  2615	    }
  2616	
  2617	    // /vault write <path> [content] — or reply to a message
  2618	    if (subCmd === 'write') {
  2619	      if (!arg) { safeSend(chatId, 'Usage: /vault write <path> <content>\nOr reply to a message with: /vault write <path>'); return; }
  2620	      const firstSpace = arg.indexOf(' ');
  2621	      let vaultPath, content;
  2622	      if (msg.reply_to_message && msg.reply_to_message.text) {
  2623	        vaultPath = arg.trim();
  2624	        content = msg.reply_to_message.text;
  2625	      } else if (firstSpace > 0) {
  2626	        vaultPath = arg.slice(0, firstSpace);
  2627	        content = arg.slice(firstSpace + 1);
  2628	      } else {
  2629	        safeSend(chatId, 'Provide content after the path, or reply to a message.');
  2630	        return;
  2631	      }
  2632	      writeToVault(chatId, vaultPath, content);
  2633	      return;
  2634	    }
  2635	
  2636	    // /vault <plain text> — deposit to telegram-deposit/
  2637	    if (subCmd && !['search', 'read', 'list', 'write'].includes(subCmd)) {
  2638	      const fullText = msg.text.slice('/vault '.length).trim();
  2639	      const today = new Date().toISOString().split('T')[0];
  2640	      const slug = fullText.slice(0, 40).replace(/[^a-zA-Z0-9]+/g, '-').replace(/-+$/, '').toLowerCase();
  2641	      const filename = `${today}_telegram-deposit_${slug}.md`;
  2642	      const depositDir = path.join(VAULT_ROOT, '00_Staging', 'telegram-deposit');
  2643	      if (!fs.existsSync(depositDir)) fs.mkdirSync(depositDir, { recursive: true });
  2644	      const destPath = deduplicatePath(path.join(depositDir, filename));
  2645	      const content = `---\ntitle: ${slug}\nsource: telegram-deposit\ndate: ${today}\n---\n\n${fullText}\n`;
  2646	      fs.writeFileSync(destPath, content);
  2647	      safeSend(chatId, `📥 Deposited:\n\`${path.relative(VAULT_ROOT, destPath)}\``);
  2648	      return;
  2649	    }
  2650	
  2651	    safeSend(chatId, 'Usage: /vault search|read|list|write [arg]\nOr: /vault <text> to quick-deposit');
  2652	    return;
  2653	  }
  2654	
  2655	  // ── /think command — Cathy-with-hands tool router ────────────────────────────
  2656	  if (msg.text.match(/^\/think\s+(.+)/)) {
  2657	    const message = msg.text.replace(/^\/think\s+/, '').trim();
  2658	    const chatId = msg.chat.id;
  2659	
  2660	    try {
  2661	      const { selectTool, route } = await import('./cathy-router.js');
  2662	      const selection = selectTool(message);
  2663	
  2664	      const toolEmoji = { claude: '🔧', gemini: '🔍', ollama: '🏠', cathy: '💬' };
  2665	      const toolLabel = { claude: 'Claude Code', gemini: 'Gemini CLI', ollama: 'Ollama (local)', cathy: 'Cathy (direct)' };
  2666	      await safeSend(chatId, `${toolEmoji[selection.tool] || '🤔'} Routing to ${toolLabel[selection.tool] || selection.tool}...\n${selection.reason}`);
  2667	
  2668	      const result = await route(message, callCath);
  2669	
  2670	      const duration = result.durationMs ? ` · ${Math.round(result.durationMs / 1000)}s` : '';
  2671	      const header = `${toolEmoji[result.tool] || '📋'} *${toolLabel[result.tool] || result.tool}*${duration}`;
  2672	
  2673	      await safeSend(chatId, `${header}\n\n${result.response}`);
  2674	
  2675	    } catch (err) {
  2676	      console.error('[/think] Error:', err.message);
  2677	      await safeSend(chatId, `⚠️ Think failed: ${err.message}`);
  2678	    }
  2679	    return;
  2680	  }
  2681	
  2682	  // ── /test command — evaluate technology fit + trigger Code execution ────────
  2683	  if (msg.text.match(/^\/test\s+(.+)/)) {
  2684	    const idea = msg.text.replace(/^\/test\s+/, '').trim();
  2685	    const chatId = msg.chat.id;
  2686	    await safeSend(chatId, `🔬 Evaluating: "${idea}"...`);
  2687	
  2688	    try {
  2689	      // Step 0: Resonance check — flag contradictions with governing field
  2690	      try {
  2691	        // Check for valid override token (<5 min old)
  2692	        const tokenPath = path.join(process.env.HOME, 'nanoclaw', 'resonance-override-token.json');
  2693	        let overrideActive = false;
  2694	        if (fs.existsSync(tokenPath)) {
  2695	          try {
  2696	            const tok = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  2697	            const age = Date.now() - new Date(tok.timestamp).getTime();
  2698	            if (age < 5 * 60 * 1000) {
  2699	              overrideActive = true;
  2700	              fs.unlinkSync(tokenPath);
  2701	              await safeSend(chatId, `↪️ Resonance override active — skipping check.`);
  2702	            } else {
  2703	              fs.unlinkSync(tokenPath);
  2704	            }
  2705	          } catch { /* ignore */ }
  2706	        }
  2707	
  2708	        const { checkResonance } = overrideActive ? { checkResonance: () => ({ resonant: true }) } : await import('./resonance-filter.js');
  2709	        const resonance = checkResonance(idea);
  2710	        if (!resonance.resonant) {
  2711	          const typeEmoji = { AESTHETIC: '🎨', PRINCIPLE: '⚖️', PRIORITY: '🛑' };
  2712	          const sevEmoji  = { advisory: 'ℹ️', warning: '⚠️', block: '🛑' };
  2713	          const flag = `${sevEmoji[resonance.severity] || '⚠️'} *RESONANCE FLAG* ${typeEmoji[resonance.contradiction_type] || ''}\n` +
  2714	            `*Type:* ${resonance.contradiction_type} · *Severity:* ${resonance.severity}\n` +
  2715	            `*Contradiction:* ${resonance.contradiction}\n` +
  2716	            `*Reference:* ${resonance.governing_field_reference}\n` +
  2717	            `*Suggestion:* ${resonance.suggestion}`;
  2718	          await safeSend(chatId, flag);
  2719	
  2720	          if (resonance.severity === 'block') {
  2721	            await safeSend(chatId, `🛑 Build blocked — reply "OVERRIDE" within 5 min to force proceed, or send a revised /test brief.`);
  2722	            const overridePath = path.join(process.env.HOME, 'nanoclaw', 'pending-override.json');
  2723	            fs.writeFileSync(overridePath, JSON.stringify({ idea, resonance, chatId, timestamp: new Date().toISOString() }, null, 2));
  2724	            return;
  2725	          }
  2726	          if (resonance.severity === 'warning') {
  2727	            await safeSend(chatId, `⚠️ Proceeding with evaluation — flag noted for your review.`);
  2728	          }
  2729	          // advisory: just flag and continue
  2730	        }
  2731	      } catch (rErr) {
  2732	        console.warn('[/test] Resonance check failed (non-fatal):', rErr.message);
  2733	      }
  2734	
  2735	      // Step 1: Read active projects for context
  2736	      const projectsDir = path.join(process.env.HOME, 'cathedral-vault', '08_Project_Orchestrator', 'projects');
  2737	      let projectContext = '';
  2738	      try {
  2739	        const files = fs.readdirSync(projectsDir).filter(f => f.endsWith('.md')).slice(0, 10);
  2740	        projectContext = files.map(f => {
  2741	          const content = fs.readFileSync(path.join(projectsDir, f), 'utf8');
  2742	          const titleMatch = content.match(/title:\s*"?([^"\n]+)"?/);
  2743	          const statusMatch = content.match(/project-status:\s*(\S+)/);
  2744	          return `${titleMatch?.[1] || f}: ${statusMatch?.[1] || 'unknown'}`;
  2745	        }).join('\n');
  2746	      } catch (_) {}
  2747	
  2748	      // Load system prompt from vault
  2749	      const headOrcPromptPath = path.join(process.env.HOME, 'cathedral-vault', '06_Methods', 'head-orc-prompt.md');
  2750	      let systemPrompt = '';
  2751	      try {
  2752	        const raw = fs.readFileSync(headOrcPromptPath, 'utf8');
  2753	        // Strip YAML frontmatter
  2754	        systemPrompt = raw.replace(/^---[\s\S]*?---\n*/, '').trim();
  2755	      } catch (_) {
  2756	        systemPrompt = 'You are the Head Orchestrator. Evaluate this technology for fit. Return JSON with keys: fits, projects, evaluation, test_brief, risk, time_estimate.';
  2757	      }
  2758	      systemPrompt = systemPrompt.replace('{PROJECT_CONTEXT}', projectContext || 'none loaded');
  2759	
  2760	      // Step 1: Evaluate — Claude API primary, Ollama fallback
  2761	      let rawEval = '';
  2762	      const evalMessages = [
  2763	        { role: 'user', content: `Evaluate this for the Cathedral: ${idea}` }
  2764	      ];
  2765	
  2766	      // Try Claude API first
  2767	      const anthropicKey = process.env.ANTHROPIC_API_KEY;
  2768	      let usedClaude = false;
  2769	      if (anthropicKey) {
  2770	        try {
  2771	          const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
  2772	            method: 'POST',
  2773	            headers: {
  2774	              'Content-Type': 'application/json',
  2775	              'x-api-key': anthropicKey,
  2776	              'anthropic-version': '2023-06-01'
  2777	            },
  2778	            body: JSON.stringify({
  2779	              model: 'claude-sonnet-4-20250514',
  2780	              max_tokens: 1000,
  2781	              system: systemPrompt,
  2782	              messages: evalMessages
  2783	            })
  2784	          });
  2785	          if (claudeRes.ok) {
  2786	            const claudeData = await claudeRes.json();
  2787	            rawEval = claudeData.content?.[0]?.text || '';
  2788	            usedClaude = true;
  2789	            console.log('[/test] Used Claude API');
  2790	          } else {
  2791	            console.log(`[/test] Claude API ${claudeRes.status}, falling back to Ollama`);
  2792	          }
  2793	        } catch (e) {
  2794	          console.log(`[/test] Claude API error: ${e.message}, falling back to Ollama`);
  2795	        }
  2796	      }
  2797	
  2798	      // Fallback to Ollama
  2799	      if (!usedClaude) {
  2800	        const evalResponse = await fetch(`${OLLAMA_URL}/api/chat`, {
  2801	          method: 'POST',
  2802	          headers: { 'Content-Type': 'application/json' },
  2803	          body: JSON.stringify({
  2804	            model: 'qwen3:14b',
  2805	            messages: [
  2806	              { role: 'system', content: systemPrompt },
  2807	              { role: 'user', content: `Evaluate this for the Cathedral: ${idea}` }
  2808	            ],
  2809	            stream: false,
  2810	            format: 'json'
  2811	          })
  2812	        });
  2813	        const evalData = await evalResponse.json();
  2814	        rawEval = evalData.message?.content || '';
  2815	        console.log('[/test] Used Ollama fallback');
  2816	      }
  2817	
  2818	      let evaluation;
  2819	      try {
  2820	        evaluation = JSON.parse(rawEval);
  2821	      } catch (_) {
  2822	        const jsonMatch = rawEval.match(/\{[\s\S]*\}/);
  2823	        if (jsonMatch) evaluation = JSON.parse(jsonMatch[0]);
  2824	        else throw new Error('Ollama did not return valid JSON');
  2825	      }
  2826	
  2827	      // Step 2: Send confirmation to Paul
  2828	      const fitEmoji = evaluation.fits ? '✅' : '❌';
  2829	      const projects = (evaluation.projects || []).join(', ') || 'none';
  2830	      const confirmMsg = `${fitEmoji} ${evaluation.fits ? 'FITS' : 'DOES NOT FIT'}\n\nProjects: ${projects}\nRisk: ${evaluation.risk || '?'} · Est: ${evaluation.time_estimate || '?'}\n\n${evaluation.evaluation || ''}\n\nReply YES to run test, NO to park.`;
  2831	
  2832	      await safeSend(chatId, confirmMsg);
  2833	
  2834	      // Store pending test for YES/NO handling
  2835	      const pendingPath = path.join(process.env.HOME, 'nanoclaw', 'pending-test.json');
  2836	      fs.writeFileSync(pendingPath, JSON.stringify({
  2837	        idea,
  2838	        evaluation,
  2839	        timestamp: new Date().toISOString(),
  2840	        chatId
  2841	      }, null, 2));
  2842	
  2843	    } catch (err) {
  2844	      console.error('[/test] Error:', err.message);
  2845	      await safeSend(chatId, `⚠️ Evaluation failed: ${err.message}`);
  2846	    }
  2847	    return;
  2848	  }
  2849	
  2850	  // ── OVERRIDE handler for resonance-blocked /test briefs ───────────────────
  2851	  if (msg.text && /^OVERRIDE$/i.test(msg.text.trim())) {
  2852	    const chatId = msg.chat.id;
  2853	    const overridePath = path.join(process.env.HOME, 'nanoclaw', 'pending-override.json');
  2854	    if (fs.existsSync(overridePath)) {
  2855	      const pending = JSON.parse(fs.readFileSync(overridePath, 'utf8'));
  2856	      const age = Date.now() - new Date(pending.timestamp).getTime();
  2857	      if (age > 5 * 60 * 1000) {
  2858	        fs.unlinkSync(overridePath);
  2859	        await safeSend(chatId, `⏰ Override expired (>5 min). Send /test again if still needed.`);
  2860	      } else {
  2861	        // Store override token — next /test within 5 min will skip resonance
  2862	        const tokenPath = path.join(process.env.HOME, 'nanoclaw', 'resonance-override-token.json');
  2863	        fs.writeFileSync(tokenPath, JSON.stringify({ timestamp: new Date().toISOString(), contradiction_type: pending.resonance.contradiction_type }));
  2864	        fs.unlinkSync(overridePath);
  2865	        await safeSend(chatId, `✅ Override accepted for ${pending.resonance.contradiction_type} flag. Resend \`/test ${pending.idea}\` within 5 minutes — resonance check will be bypassed.`);
  2866	      }
  2867	      return;
  2868	    }
  2869	    // No pending override — fall through
  2870	  }
  2871	
  2872	  // ── YES/NO handler for /test confirmation ─────────────────────────────────
  2873	  if (msg.text && /^(YES|NO)$/i.test(msg.text.trim())) {
  2874	    const chatId = msg.chat.id;
  2875	    const pendingPath = path.join(process.env.HOME, 'nanoclaw', 'pending-test.json');
  2876	
  2877	    if (!fs.existsSync(pendingPath)) {
  2878	      // No pending test — fall through to normal Cath handler
  2879	    } else {
  2880	      const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
  2881	      const age = Date.now() - new Date(pending.timestamp).getTime();
  2882	
  2883	      // Expire after 30 minutes
  2884	      if (age > 30 * 60 * 1000) {
  2885	        fs.unlinkSync(pendingPath);
  2886	        // Fall through
  2887	      } else if (/^YES$/i.test(msg.text.trim())) {
  2888	        fs.unlinkSync(pendingPath);
  2889	        await safeSend(chatId, `⚙️ Running test: "${pending.idea}"...\nThis may take a few minutes.`);
  2890	
  2891	        try {
  2892	          // Step 3: Execute via claude -p
  2893	          const brief = pending.evaluation.test_brief || `Test this idea: ${pending.idea}`;
  2894	          const codeProc = spawn('claude', ['-p', '--output-format', 'text', '--max-turns', '5'], {
  2895	            cwd: path.join(process.env.HOME, 'Cathedral'),
  2896	            env: { ...process.env, HOME: process.env.HOME }
  2897	          });
  2898	
  2899	          let stdout = '';
  2900	          let stderr = '';
  2901	          const timeout = setTimeout(() => { codeProc.kill(); }, 5 * 60 * 1000); // 5 min timeout
  2902	
  2903	          codeProc.stdin.write(brief);
  2904	          codeProc.stdin.end();
  2905	
  2906	          codeProc.stdout.on('data', d => { stdout += d; });
  2907	          codeProc.stderr.on('data', d => { stderr += d; });
  2908	
  2909	          codeProc.on('close', async (code) => {
  2910	            clearTimeout(timeout);
  2911	            const result = stdout.trim() || stderr.trim() || `Exit code: ${code}`;
  2912	
  2913	            // Truncate for Telegram (max ~3500 chars to be safe)
  2914	            const truncated = result.length > 3500 ? result.slice(0, 3400) + '\n\n[... truncated]' : result;
  2915	
  2916	            await safeSend(chatId, `🔬 Test result: "${pending.idea}"\n\n${truncated}`);
  2917	
  2918	            // Write result to vault
  2919	            try {
  2920	              const date = new Date().toISOString().slice(0, 10);
  2921	              const safeName = pending.idea.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 40);
  2922	              const nuggetPath = path.join(process.env.HOME, 'cathedral-vault', '00_Staging', 'cathedral', `test-${date}-${safeName}.md`);
  2923	              const nugget = `---\ntitle: "Test — ${pending.idea}"\ntype: test-result\ndate: ${date}\nverdict: ${code === 0 ? 'pass' : 'review'}\ntags: [test, scout]\n---\n\n# Test: ${pending.idea}\n\n## Evaluation\n${pending.evaluation.evaluation || ''}\n\n## Result\n\`\`\`\n${result.slice(0, 2000)}\n\`\`\`\n`;
  2924	              fs.writeFileSync(nuggetPath, nugget);
  2925	              await safeSend(chatId, `📋 Filed to vault: ${path.basename(nuggetPath)}`);
  2926	            } catch (e) {
  2927	              console.error('[/test] Vault filing error:', e.message);
  2928	            }
  2929	          });
  2930	
  2931	          codeProc.on('error', async (err) => {
  2932	            clearTimeout(timeout);
  2933	            await safeSend(chatId, `⚠️ Code execution failed: ${err.message}`);
  2934	          });
  2935	
  2936	        } catch (err) {
  2937	          await safeSend(chatId, `⚠️ Execution error: ${err.message}`);
  2938	        }
  2939	        return;
  2940	
  2941	      } else if (/^NO$/i.test(msg.text.trim())) {
  2942	        fs.unlinkSync(pendingPath);
  2943	        // Park the idea
  2944	        try {
  2945	          const date = new Date().toISOString().slice(0, 10);
  2946	          const safeName = pending.idea.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 40);
  2947	          const parkedPath = path.join(process.env.HOME, 'cathedral-vault', '00_Staging', 'cathedral', `parked-${date}-${safeName}.md`);
  2948	          const nugget = `---\ntitle: "Parked — ${pending.idea}"\ntype: parked-idea\ndate: ${date}\ntags: [parked, scout]\n---\n\n# Parked: ${pending.idea}\n\n${pending.evaluation.evaluation || ''}\n\nParked by Paul. Revisit when relevant.\n`;
  2949	          fs.writeFileSync(parkedPath, nugget);
  2950	          await safeSend(chatId, `📦 Parked: "${pending.idea}"\nFiled for future reference.`);
  2951	        } catch (e) {
  2952	          await safeSend(chatId, `📦 Parked: "${pending.idea}"`);
  2953	        }
  2954	        return;
  2955	      }
  2956	    }
  2957	  }
  2958	
  2959	  // Ignore other slash commands
  2960	  if (msg.text.startsWith('/')) return;
  2961	
  2962	  // Route everything else through Cath
  2963	  try {
  2964	    addToConversation('cath', chatId, 'user', msg.text);
  2965	    const history = getConversationHistory('cath', chatId);
  2966	    await safeSend(chatId, '⏳ Cathedral...');
  2967	    const reply = await callCath(msg.text, history);
  2968	    await safeSend(chatId, reply || '⚠️ No response from Cath.');
  2969	    addToConversation('cath', chatId, 'assistant', reply || '');
  2970	    updateMemoryAfterConversation('cath', chatId).catch(e => console.error('Memory update error:', e.message));
  2971	    recordExchange(msg.text, reply || '');
  2972	  } catch (error) {
  2973	    console.error('Cath error:', error);
  2974	    await safeSend(chatId, `⚠️ Cath error: ${error.message}`);
  2975	  }
  2976	});
  2977	
  2978	// ── Cathedral Deck ──────────────────────────────────────────────────────────
  2979	
  2980	bot.onText(/^\/deck(?:@\w+)?(?:\s+(.*))?$/s, async (msg, match) => {
  2981	  const chatId = msg.chat.id;
  2982	  const filter = match?.[1]?.trim()?.toLowerCase();
  2983	
  2984	  try {
  2985	    const deckPath = path.join(process.env.HOME, 'nanoclaw', 'reed-lab', 'deck.json');
  2986	    const deck = JSON.parse(fs.readFileSync(deckPath, 'utf8'));
  2987	
  2988	    // /deck add [name] — create new card
  2989	    if (filter && filter.startsWith('add ')) {
  2990	      const cardName = match[1].trim().replace(/^add\s+/i, '');
  2991	      if (!cardName) return safeSend(chatId, 'Usage: `/deck add [card name]`', { parse_mode: 'Markdown' });
  2992	
  2993	      const nextId = Math.max(...deck.map(c => c.id)) + 1;
  2994	      await safeSend(chatId, `🗺 Cartographer defining #${String(nextId).padStart(3,'0')} "${cardName}"...`);
  2995	
  2996	      // Step 1: Cartographer writes the card definition
  2997	      try {
  2998	        const cartRes = await fetch('http://localhost:11434/api/chat', {
  2999	          method: 'POST',
  3000	          headers: { 'Content-Type': 'application/json' },
  3001	          body: JSON.stringify({
  3002	            model: 'hermes3',
  3003	            messages: [{
  3004	              role: 'system',
  3005	              content: `You are the Cartographer of the Cathedral. You define new system cards.
  3006	The Cathedral is a sovereign AI research instrument with ${deck.length} existing cards.
  3007	Existing cards: ${deck.map(c => `#${String(c.id).padStart(3,'0')} ${c.name}`).join(', ')}
  3008	
  3009	Output JSON only. Define a new card for the Cathedral Deck:
  3010	{
  3011	  "name": "exact name given",
  3012	  "subtitle": "one-line description — what this IS",
  3013	  "status": "live or planned or building",
  3014	  "icon": "single letter, uppercase",
  3015	  "color": "hex color that fits the Cathedral palette",
  3016	  "description": "2-3 sentences. What it does, why it matters.",
  3017	  "locations": ["likely file paths"],
  3018	  "dashboards": [],
  3019	  "connects": [list of existing card IDs this connects to],
  3020	  "key_facts": ["3-4 key facts"],
  3021	  "frontier": "the next unexplored edge — what this could become"
  3022	}`
  3023	            }, {
  3024	              role: 'user',
  3025	              content: `Define card #${nextId}: "${cardName}"`
  3026	            }],
  3027	            stream: false,
  3028	            options: { temperature: 0.3, num_predict: 500 },
  3029	            format: 'json',
  3030	          }),
  3031	        });
  3032	
  3033	        const cartData = await cartRes.json();
  3034	        let cardDef;
  3035	        try {
  3036	          cardDef = JSON.parse(cartData.message?.content || '{}');
  3037	        } catch(e) {
  3038	          return safeSend(chatId, `Cartographer failed to define card: ${e.message}`);
  3039	        }
  3040	
  3041	        // Ensure required fields
  3042	        cardDef.id = nextId;
  3043	        cardDef.name = cardDef.name || cardName;
  3044	        cardDef.status = cardDef.status || 'building';
  3045	        cardDef.icon = (cardDef.icon || cardName[0]).toUpperCase();
  3046	        cardDef.color = cardDef.color || '#f59e0b';
  3047	        if (!cardDef.connects) cardDef.connects = [];
  3048	        if (!cardDef.key_facts) cardDef.key_facts = [];
  3049	
  3050	        // Step 2: Reed generates image prompt
  3051	        await safeSend(chatId, `🎬 Reed generating visual for #${String(nextId).padStart(3,'0')}...`);
  3052	
  3053	        let imagePrompt = `Dark cathedral space with amber geometric light. Symbolic visual metaphor representing ${cardDef.name}: ${cardDef.subtitle || ''}. ${cardDef.frontier || ''}. Cinematic 16:9, architectural, no text, no people.`;
  3054	        try {
  3055	          const reedRes = await fetch('http://localhost:11434/api/chat', {
  3056	            method: 'POST',
  3057	            headers: { 'Content-Type': 'application/json' },
  3058	            body: JSON.stringify({
  3059	              model: 'hermes3',
  3060	              messages: [{
  3061	                role: 'system',
  3062	                content: 'You are Reed, Visual Director. Write one Higgsfield image prompt. Dark Cathedral aesthetic (#09090f), amber accents, symbolic not literal. Output ONLY the prompt text.'
  3063	              }, {
  3064	                role: 'user',
  3065	                content: `Visual metaphor for "${cardDef.name}": ${cardDef.description || ''}\nFrontier: ${cardDef.frontier || ''}`
  3066	              }],
  3067	              stream: false,
  3068	              options: { temperature: 0.5, num_predict: 150 },
  3069	            }),
  3070	          });
  3071	          const reedData = await reedRes.json();
  3072	          if (reedData.message?.content) imagePrompt = reedData.message.content.trim();
  3073	        } catch(e) {}
  3074	
  3075	        // Step 3: Generate Higgsfield image
  3076	        let imageFile = '';
  3077	        try {
  3078	          const { execSync: exec } = require('child_process');
  3079	          const genOutput = exec(
  3080	            `higgsfield gen create nano_banana_2 --prompt "${imagePrompt.replace(/"/g, '\\"')}" --aspect_ratio "16:9" --resolution "2k"`,
  3081	            { timeout: 30000, encoding: 'utf8' }
  3082	          ).trim();
  3083	
  3084	          // genOutput is the job ID
  3085	          if (genOutput && genOutput.length > 10) {
  3086	            cardDef._higgsfield_job = genOutput;
  3087	            imageFile = `${String(nextId).padStart(3,'0')}-${cardName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
  3088	            cardDef.image = `slides/card-images/${imageFile}`;
  3089	            cardDef._image_pending = true;
  3090	
  3091	            // Poll for completion (max 60s)
  3092	            for (let attempt = 0; attempt < 12; attempt++) {
  3093	              await new Promise(r => setTimeout(r, 5000));
  3094	              try {
  3095	                const status = exec(`higgsfield gen get ${genOutput}`, { timeout: 10000, encoding: 'utf8' });
  3096	                const urlMatch = status.match(/https:\/\/\S+\.png/);
  3097	                if (urlMatch) {
  3098	                  const imgPath = path.join(process.env.HOME, 'nanoclaw', 'reed-lab', 'slides', 'card-images', imageFile);
  3099	                  exec(`curl -sL "${urlMatch[0]}" -o "${imgPath}"`, { timeout: 30000 });
  3100	                  delete cardDef._image_pending;
  3101	                  break;
  3102	                }
  3103	              } catch(e) {}
  3104	            }
  3105	          }
  3106	        } catch(e) {
  3107	          console.error('[deck add] Higgsfield error:', e.message);
  3108	        }
  3109	
  3110	        // Step 4: Save to deck.json
  3111	        deck.push(cardDef);
  3112	        fs.writeFileSync(deckPath, JSON.stringify(deck, null, 2));
  3113	
  3114	        // Step 5: Confirm
  3115	        const conns = (cardDef.connects || []).map(id => {
  3116	          const c = deck.find(d => d.id === id);
  3117	          return c ? `#${String(id).padStart(3,'0')} ${c.name}` : `#${id}`;
  3118	        }).join(', ');
  3119	
  3120	        let response = `*#${String(nextId).padStart(3,'0')} ${cardDef.name}* — added to deck\n\n`;
  3121	        response += `${cardDef.subtitle || ''}\n\n`;
  3122	        response += `${cardDef.description || ''}\n\n`;
  3123	        if (cardDef.key_facts.length) response += cardDef.key_facts.map(f => `• ${f}`).join('\n') + '\n\n';
  3124	        if (conns) response += `*Connects:* ${conns}\n`;
  3125	        if (cardDef.frontier) response += `*Frontier:* ${cardDef.frontier}\n`;
  3126	        response += `\n${cardDef._image_pending ? '⏳ Image generating...' : '🎨 Image ready'}`;
  3127	        response += `\n📊 localhost:8080/reed-slides`;
  3128	
  3129	        return safeSend(chatId, response, { parse_mode: 'Markdown' });
  3130	
  3131	      } catch(e) {
  3132	        console.error('[deck add]', e.message);
  3133	        return safeSend(chatId, `Deck add failed: ${e.message}`);
  3134	      }
  3135	    }
  3136	
  3137	    let filtered = deck;
  3138	    if (filter === 'live') filtered = deck.filter(c => c.status === 'live');
  3139	    else if (filter === 'planned') filtered = deck.filter(c => c.status === 'planned');
  3140	    else if (filter === 'frontier') filtered = deck.filter(c => c.frontier);
  3141	    else if (filter && !isNaN(filter)) {
  3142	      const card = deck.find(c => c.id === parseInt(filter));
  3143	      if (card) {
  3144	        const conns = (card.connects || []).map(id => {
  3145	          const c = deck.find(d => d.id === id);
  3146	          return c ? `#${String(id).padStart(3,'0')} ${c.name}` : `#${id}`;
  3147	        }).join('\n    ');
  3148	
  3149	        let detail = `*#${String(card.id).padStart(3,'0')} ${card.name}*\n`;
  3150	        detail += `${card.subtitle}\n\n`;
  3151	        detail += `${card.description}\n\n`;
  3152	        if (card.key_facts) detail += card.key_facts.map(f => `• ${f}`).join('\n') + '\n\n';
  3153	        if (conns) detail += `*Connects to:*\n    ${conns}\n\n`;
  3154	        if (card.frontier) detail += `*Frontier:* ${card.frontier}\n\n`;
  3155	        if (card.locations) detail += `*Location:* ${card.locations[0]}\n`;
  3156	        if (card.dashboards?.length) detail += `*Dashboard:* ${card.dashboards[0]}`;
  3157	
  3158	        return safeSend(chatId, detail, { parse_mode: 'Markdown' });
  3159	      }
  3160	    }
  3161	
  3162	    const live = filtered.filter(c => c.status === 'live').length;
  3163	    let response = `*Cathedral Deck* — ${filtered.length} cards (${live} live)\n\n`;
  3164	
  3165	    for (const card of filtered) {
  3166	      const icon = card.status === 'live' ? '●' : card.status === 'building' ? '◐' : '○';
  3167	      response += `${icon} *#${String(card.id).padStart(3,'0')}* ${card.name}\n`;
  3168	      response += `    ${card.subtitle}\n`;
  3169	      if (card.frontier) response += `    ↳ _${card.frontier.substring(0, 70)}_\n`;
  3170	    }
  3171	
  3172	    response += `\n\`/deck [number]\` — card detail\n\`/deck add [name]\` — create new card\n\`/deck live|planned|frontier\` — filter`;
  3173	    response += `\n📊 localhost:8080/reed-slides`;
  3174	    await safeSend(chatId, response, { parse_mode: 'Markdown' });
  3175	
  3176	  } catch(e) {
  3177	    console.error('[deck]', e.message);
  3178	    await safeSend(chatId, `Deck error: ${e.message}`);
  3179	  }
  3180	});
  3181	
  3182	// ── Cathedral Slides ────────────────────────────────────────────────────────
  3183	
  3184	bot.onText(/^\/slides?(?:@\w+)?(?:\s+(.*))?$/s, async (msg, match) => {
  3185	  const chatId = msg.chat.id;
  3186	  const topic = match?.[1]?.trim();
  3187	
  3188	  if (!topic) {
  3189	    return safeSend(chatId, `🏛 *Cathedral Slides*
  3190	
  3191	\`/slides [topic]\` — Generate a visual slide card
  3192	
  3193	Examples:
  3194	\`/slides The Experiment Lab\`
  3195	\`/slides Cymatics Schumann strategy\`
  3196	\`/slides Today's trading roundtable\`
  3197	
  3198	Gallery: localhost:8080/reed-slides`, { parse_mode: 'Markdown' });
  3199	  }
  3200	
  3201	  await safeSend(chatId, `🏛 Cartographer mapping "${topic}"...`);
  3202	
  3203	  try {
  3204	    // Load Cartographer sage
  3205	    const cartDef = JSON.parse(fs.readFileSync(path.join(process.env.HOME, 'nanoclaw', 'sages', 'cartographer.json'), 'utf8'));
  3206	
  3207	    // Step 1: Vault context search
  3208	    let vaultContext = '';
  3209	    try {
  3210	      const searchRes = await fetch('http://localhost:8080/vault/search?q=' + encodeURIComponent(topic) + '&limit=5');
  3211	      if (searchRes.ok) {
  3212	        const results = await searchRes.json();
  3213	        if (results.results) {
  3214	          vaultContext = results.results.map(r => `- ${r.title || r.path}: ${(r.content || '').substring(0, 200)}`).join('\n');
  3215	        }
  3216	      }
  3217	    } catch(e) {}
  3218	
  3219	    // Step 2: Cartographer writes the structural brief
  3220	    const cartographerPrompt = `You are ${cartDef.sage.name}, ${cartDef.sage.designation}.
  3221	Voice: ${cartDef.sage.voice}
  3222	
  3223	Your task: write a slide brief for the topic "${topic}".
  3224	
  3225	Vault context:
  3226	${vaultContext || 'No vault results — use your knowledge of the Cathedral system.'}
  3227	
  3228	Output JSON only, following this exact format:
  3229	{
  3230	  "title": "5-8 word structural title",
  3231	  "subtitle": "One sentence — what this means for the system",
  3232	  "key_concept": "The single idea this slide communicates",
  3233	  "visual_metaphor": "What image would make this visible — think: map territory, constellation, architectural structure, system diagram. Cathedral aesthetic: dark (#09090f), amber accents, geometric.",
  3234	  "highlights": ["structural point 1", "structural point 2", "structural point 3"],
  3235	  "why_it_matters": "Why this deserves a slide — what it changes in the system",
  3236	  "zone_change": "What moved on the map (e.g., 'new territory settled' or 'border crossing detected')"
  3237	}`;
  3238	
  3239	    const cartRes = await fetch('http://localhost:11434/api/chat', {
  3240	      method: 'POST',
  3241	      headers: { 'Content-Type': 'application/json' },
  3242	      body: JSON.stringify({
  3243	        model: 'hermes3',
  3244	        messages: [
  3245	          { role: 'system', content: cartographerPrompt },
  3246	          { role: 'user', content: `Write the slide brief for: "${topic}"` }
  3247	        ],
  3248	        stream: false,
  3249	        options: { temperature: 0.3, num_predict: 400 },
  3250	        format: 'json',
  3251	      }),
  3252	    });
  3253	
  3254	    const cartData = await cartRes.json();
  3255	    let brief;
  3256	    try {
  3257	      brief = JSON.parse(cartData.message?.content || '{}');
  3258	    } catch(e) {
  3259	      brief = { title: topic, subtitle: 'Cathedral architecture', highlights: [], visual_metaphor: '' };
  3260	    }
  3261	
  3262	    if (!brief.title) brief.title = topic;
  3263	
  3264	    await safeSend(chatId, `🗺 Cartographer brief: "${brief.title}"\n🎬 Reed generating visual...`);
  3265	
  3266	    // Step 3: Reed generates Higgsfield image prompt from brief
  3267	    const reedPrompt = `You are Reed, Visual Director. The Cartographer wrote this brief for a Cathedral slide:
  3268	
  3269	Title: ${brief.title}
  3270	Concept: ${brief.key_concept || brief.subtitle || ''}
  3271	Visual metaphor: ${brief.visual_metaphor || 'Cathedral architecture, dark geometric'}
  3272	
  3273	Write a Higgsfield nano_banana_2 image generation prompt. Requirements:
  3274	- Dark Cathedral background (#09090f to #0f0f18)
  3275	- Amber/gold accent lighting
  3276	- Clean geometric or architectural style
  3277	- The concept made visual — not literal, metaphorical
  3278	- No text in the image
  3279	- Cinematic 16:9 composition
  3280	- Professional, minimal, striking
  3281	
  3282	Output the prompt as a single paragraph, 2-3 sentences max. Nothing else.`;
  3283	
  3284	    let imagePrompt = '';
  3285	    try {
  3286	      const reedRes = await fetch('http://localhost:11434/api/chat', {
  3287	        method: 'POST',
  3288	        headers: { 'Content-Type': 'application/json' },
  3289	        body: JSON.stringify({
  3290	          model: 'hermes3',
  3291	          messages: [
  3292	            { role: 'system', content: 'You are Reed, Visual Director. Write image generation prompts. Output ONLY the prompt text, nothing else.' },
  3293	            { role: 'user', content: reedPrompt }
  3294	          ],
  3295	          stream: false,
  3296	          options: { temperature: 0.5, num_predict: 150 },
  3297	        }),
  3298	      });
  3299	      const reedData = await reedRes.json();
  3300	      imagePrompt = reedData.message?.content || '';
  3301	    } catch(e) {
  3302	      imagePrompt = `Dark cathedral interior with amber geometric light patterns representing ${topic}. Deep navy-black background, clean architectural lines, cinematic 16:9 composition.`;
  3303	    }
  3304	
  3305	    // Save slide to catalogue (with brief + image prompt for future generation)
  3306	    const slideData = {
  3307	      ...brief,
  3308	      image_prompt: imagePrompt.trim(),
  3309	      date: new Date().toISOString().split('T')[0],
  3310	      source: 'telegram-' + Date.now(),
  3311	      pipeline: 'cartographer→reed',
  3312	    };
  3313	
  3314	    const catPath = path.join(process.env.HOME, 'nanoclaw', 'reed-lab', 'slides', 'catalogue.json');
  3315	    let catalogue = [];
  3316	    try { catalogue = JSON.parse(fs.readFileSync(catPath, 'utf8')); } catch(e) {}
  3317	    catalogue.push(slideData);
  3318	    fs.writeFileSync(catPath, JSON.stringify(catalogue, null, 2));
  3319	
  3320	    // Format response
  3321	    let response = `🏛 *${brief.title}*\n\n${brief.subtitle || ''}`;
  3322	    if (brief.key_concept) response += `\n\n💡 *Concept:* ${brief.key_concept}`;
  3323	    if (brief.highlights && brief.highlights.length > 0) {
  3324	      response += '\n\n' + brief.highlights.map(h => `• ${h}`).join('\n');
  3325	    }
  3326	    if (brief.why_it_matters) response += `\n\n🗺 *Map:* ${brief.why_it_matters}`;
  3327	    if (brief.zone_change) response += `\n📍 ${brief.zone_change}`;
  3328	    response += `\n\n🎨 _Reed's visual prompt:_ ${imagePrompt.substring(0, 120)}...`;
  3329	    response += `\n\n_Slide ${catalogue.length} added to gallery_`;
  3330	
  3331	    await safeSend(chatId, response, { parse_mode: 'Markdown' });
  3332	
  3333	  } catch(e) {
  3334	    console.error('[slides] Error:', e.message);
  3335	    await safeSend(chatId, `Slide generation failed: ${e.message}`);
  3336	  }
  3337	});
  3338	
  3339	// ── Creative Lab (Domain 3) ──────────────────────────────────────────────────
  3340	
  3341	bot.onText(/^\/creative[-_]?lab(?:@\w+)?(?:\s+(.*))?$/s, async (msg, match) => {
  3342	  const chatId = msg.chat.id;
  3343	  const args = match?.[1]?.trim();
  3344	
  3345	  try {
  3346	    const { getLeaderboard, logSelection, recommendStyle, getStats } = await import('./experiment-engine/creative/creative-strategies.js');
  3347	
  3348	    // /creative-lab — show leaderboard
  3349	    if (!args) {
  3350	      const board = getLeaderboard();
  3351	      const stats = getStats();
  3352	      const rec = recommendStyle();
  3353	
  3354	      let response = `*Creative Lab — Style Experiment*\n`;
  3355	      response += `${stats.generations} generated | ${stats.selections} selections\n\n`;
  3356	
  3357	      if (board.length > 0) {
  3358	        response += `*Leaderboard:*\n`;
  3359	        for (const s of board) {
  3360	          const bar = s.selection_rate > 0 ? '|'.repeat(Math.min(Math.round(s.selection_rate / 10), 10)) : '';
  3361	          response += `${s.style}: ${s.selection_rate || 0}% ${bar} (${s.selected || 0}/${s.total_generated})\n`;
  3362	        }
  3363	      } else {
  3364	        response += `No data yet. Generate images with /reed and track selections.\n`;
  3365	      }
  3366	
  3367	      response += `\n*Next recommendation:* ${rec.style} (${rec.reason})`;
  3368	      return safeSend(chatId, response, { parse_mode: 'Markdown' });
  3369	    }
  3370	
  3371	    // /creative-lab select <style> — log Paul selected this style
  3372	    if (args.startsWith('select ') || args.startsWith('use ')) {
  3373	      const style = args.replace(/^(select|use)\s+/, '').trim();
  3374	      const result = logSelection(null, style, 'selected', '', 'telegram');
  3375	
  3376	      // Publish to meta-watcher
  3377	      try {
  3378	        const { logDomainRun } = await import('./experiment-engine/meta-watcher.js');
  3379	        logDomainRun('creative', [{ type: style, subject: 'selection', direction: 'positive', strength: 0.8 }]);
  3380	      } catch(e) {}
  3381	
  3382	      return safeSend(chatId, `Logged: Paul selected *${style}*. Leaderboard updated.`, { parse_mode: 'Markdown' });
  3383	    }
  3384	
  3385	    // /creative-lab reject <style>
  3386	    if (args.startsWith('reject ') || args.startsWith('skip ')) {
  3387	      const style = args.replace(/^(reject|skip)\s+/, '').trim();
  3388	      logSelection(null, style, 'rejected', '', 'telegram');
  3389	      return safeSend(chatId, `Logged: Paul rejected *${style}*.`, { parse_mode: 'Markdown' });
  3390	    }
  3391	
  3392	    // /creative-lab recommend
  3393	    if (args === 'recommend' || args === 'next') {
  3394	      const rec = recommendStyle();
  3395	      return safeSend(chatId, `*Recommended:* ${rec.style}\n${rec.reason}\n${rec.explore ? '(exploring)' : '(exploiting best)'}`, { parse_mode: 'Markdown' });
  3396	    }
  3397	
  3398	    safeSend(chatId, `*Creative Lab commands:*
  3399	\`/creative-lab\` — style leaderboard
  3400	\`/creative-lab select <style>\` — log selection
  3401	\`/creative-lab reject <style>\` — log rejection
  3402	\`/creative-lab recommend\` — next style suggestion`, { parse_mode: 'Markdown' });
  3403	
  3404	  } catch(e) {
  3405	    console.error('[creative-lab]', e.message);
  3406	    await safeSend(chatId, `Creative Lab error: ${e.message}`);
  3407	  }
  3408	});
  3409	
  3410	// ── Boxing Lab (Domain 2) ────────────────────────────────────────────────────
  3411	
  3412	bot.onText(/^\/boxing[-_]?lab(?:@\w+)?(?:\s+(.*))?$/s, async (msg, match) => {
  3413	  const chatId = msg.chat.id;
  3414	  const args = match?.[1]?.trim();
  3415	
  3416	  // Parse: /boxing-lab [category] [filename] or just /boxing-lab for latest
  3417	  let category = 'padwork', filename = 'noodles1';
  3418	  if (args) {
  3419	    const parts = args.split(/\s+/);
  3420	    if (parts[0]) category = parts[0];
  3421	    if (parts[1]) filename = parts[1];
  3422	  }
  3423	
  3424	  await safeSend(chatId, `Boxing Lab analyzing ${category}/${filename}...`);
  3425	
  3426	  try {
  3427	    const { execSync: exec } = require('child_process');
  3428	    exec(`python3 experiment-engine/boxing/boxing-strategies.py ${category} ${filename}`, {
  3429	      cwd: path.join(process.env.HOME, 'nanoclaw'),
  3430	      stdio: 'pipe',
  3431	      timeout: 30000,
  3432	    });
  3433	
  3434	    const analysisPath = path.join(process.env.HOME, 'nanoclaw', 'experiment-engine', 'boxing', 'boxing-analysis-latest.json');
  3435	    if (!fs.existsSync(analysisPath)) {
  3436	      return safeSend(chatId, 'Analysis file not generated.');
  3437	    }
  3438	
  3439	    const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
  3440	    const m = analysis.metrics;
  3441	
  3442	    let response = `*Boxing Lab — ${category}/${filename}*\n`;
  3443	    response += `${m.total_punches} punches | ${m.punch_rate_per_min}/min | vel ${m.mean_velocity} | ${m.guard_drops} guard drops\n`;
  3444	
  3445	    for (const strat of analysis.strategies) {
  3446	      if (strat.signals.length === 0 && strat.recommendations.length === 0) continue;
  3447	      response += `\n*${strat.strategy}*\n`;
  3448	      for (const sig of strat.signals) {
  3449	        const icon = sig.outcome === 'positive' ? '+' : '-';
  3450	        response += `${icon} ${sig.reasoning.substring(0, 100)}\n`;
  3451	      }
  3452	      for (const rec of strat.recommendations) {
  3453	        response += `> ${rec}\n`;
  3454	      }
  3455	    }
  3456	
  3457	    // Publish to meta-watcher
  3458	    try {
  3459	      const { logDomainRun, detectCrossDomainConvergence } = await import('./experiment-engine/meta-watcher.js');
  3460	      logDomainRun('boxing', analysis.signals.map(s => ({
  3461	        type: s.type, subject: s.subject, outcome: s.outcome,
  3462	        strength: s.strength, asset: s.subject, direction: s.outcome,
  3463	      })));
  3464	      const crossDomain = detectCrossDomainConvergence(48);
  3465	      if (crossDomain.length > 0) {
  3466	        response += '\n*Cross-Domain Convergences:*\n';
  3467	        for (const c of crossDomain) {
  3468	          response += `${c.strategy}: ${c.direction} in ${c.domains.join(' + ')}\n`;
  3469	        }
  3470	      }
  3471	    } catch(e) {}
  3472	
  3473	    await safeSend(chatId, response, { parse_mode: 'Markdown' });
  3474	  } catch(e) {
  3475	    console.error('[boxing-lab]', e.message);
  3476	    await safeSend(chatId, `Boxing Lab error: ${e.message}`);
  3477	  }
  3478	});
  3479	
  3480	// ── Reed Visual Director ────────────────────────────────────────────────────
  3481	const reedConversation = {};
  3482	
  3483	bot.onText(/^\/reed(?:@\w+)?(?:\s+(.*))?$/s, async (msg, match) => {
  3484	  const chatId = msg.chat.id;
  3485	  const query = match?.[1]?.trim();
  3486	  if (!query) {
  3487	    return safeSend(chatId, `🎬 *Reed — Visual Director*
  3488	
  3489	*Photo styles* (send photo with /reed caption):
  3490	\`/reed\` — Pro photo v2
  3491	\`/reed manga\` — Graphic novel environment
  3492	\`/reed ippo\` — Shonen manga (speed lines)
  3493	\`/reed noir\` — B&W 1940s fight night
  3494	\`/reed neon\` — HK cyberpunk
  3495	\`/reed dramatic\` — Volumetric cinema
  3496	\`/reed oil\` — Oil painting
  3497	\`/reed poster\` — BR branded poster (two-pass: art + real logos)
  3498	\`/reed video\` — 5s motion
  3499	
  3500	*Commands:*
  3501	\`/shots\` — Today's photo assignments
  3502	\`/lab\` — Run Daily Lab now
  3503	\`/reed <question>\` — Ask Reed anything`, { parse_mode: 'Markdown' });
  3504	  }
  3505	
  3506	  await safeSend(chatId, '🎬 Reed reviewing...');
  3507	
  3508	  try {
  3509	    // Load Reed sage definition
  3510	    const reedDef = JSON.parse(fs.readFileSync(path.join(process.env.HOME, 'nanoclaw', 'sages', 'reed.json'), 'utf8'));
  3511	
  3512	    // Build system prompt from sage definition
  3513	    const systemPrompt = `You are ${reedDef.sage.name}, ${reedDef.sage.designation}.
  3514	Voice: ${reedDef.sage.voice}
  3515	Core lens: ${reedDef.sage.core_lens}
  3516	
  3517	You address Paul as "${reedDef.sage.addresses_user_as}".
  3518	
  3519	IDENTITY LOCK (Logan):
  3520	${JSON.stringify(reedDef.identity_lock, null, 2)}
  3521	
  3522	GENERATION HIERARCHY:
  3523	${reedDef.generation_hierarchy.join('\n')}
  3524	
  3525	AVAILABLE MODELS:
  3526	${Object.entries(reedDef.capabilities.models).map(([k, v]) => `- ${k}: ${v}`).join('\n')}
  3527	
  3528	SOUL ID: ${reedDef.capabilities.soul_id.name} (${reedDef.capabilities.soul_id.ref_id})
  3529	Note: ${reedDef.capabilities.soul_id.note}
  3530	
  3531	PROVEN PROMPTS:
  3532	Pro Photo: ${reedDef.prompts?.pro_photo || 'see bot code'}
  3533	Manga: ${reedDef.prompts?.manga || 'see bot code'}
  3534	Dramatic: ${reedDef.prompts?.dramatic_cinema || 'see bot code'}
  3535	
  3536	STANDING RULES:
  3537	${reedDef.standing_rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}
  3538	
  3539	CONTENT TYPES YOU CAN PRODUCE:
  3540	${reedDef.content_types.join(', ')}
  3541	
  3542	When Paul asks you to generate something, give the exact higgsfield CLI command he should run (or that Claude Code should run). Always specify the model, prompt, flags, and aspect ratio. Always remind to send results to Telegram.
  3543	
  3544	When Paul asks about approach/strategy, give direct creative direction based on the generation hierarchy and identity lock.
  3545	
  3546	Keep responses short and direct. You're a creative director, not a copywriter.`;
  3547	
  3548	    // Get conversation history
  3549	    if (!reedConversation[chatId]) reedConversation[chatId] = [];
  3550	    reedConversation[chatId].push({ role: 'user', content: query });
  3551	    if (reedConversation[chatId].length > 20) {
  3552	      reedConversation[chatId] = reedConversation[chatId].slice(-20);
  3553	    }
  3554	
  3555	    const apiKey = process.env.DEEPSEEK_API_KEY;
  3556	    if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');
  3557	
  3558	    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
  3559	      method: 'POST',
  3560	      headers: {
  3561	        'Content-Type': 'application/json',
  3562	        'Authorization': `Bearer ${apiKey}`,
  3563	      },
  3564	      body: JSON.stringify({
  3565	        model: 'deepseek-chat',
  3566	        max_tokens: 1024,
  3567	        messages: [
  3568	          { role: 'system', content: systemPrompt },
  3569	          ...reedConversation[chatId],
  3570	        ],
  3571	      }),
  3572	      signal: AbortSignal.timeout(60000),
  3573	    });
  3574	
  3575	    if (!resp.ok) throw new Error(`DeepSeek ${resp.status}`);
  3576	    const data = await resp.json();
  3577	    const reply = data.choices?.[0]?.message?.content?.trim() || 'No response.';
  3578	
  3579	    reedConversation[chatId].push({ role: 'assistant', content: reply });
  3580	
  3581	    await safeSend(chatId, `🎬 *Reed:*\n\n${reply}`, { parse_mode: 'Markdown' });
  3582	  } catch (err) {
  3583	    console.error('[reed]', err.message);
  3584	    await safeSend(chatId, `⚠️ Reed error: ${err.message}`);
  3585	  }
  3586	});
  3587	
  3588	// ── Reed Shot List — /shots ──────────────────────────────────────────────────
  3589	bot.onText(/^\/shots(?:@\w+)?$/i, async (msg) => {
  3590	  const chatId = msg.chat.id;
  3591	  try {
  3592	    execSync('cd ~/nanoclaw && node reed-lab/daily-lab.js --shots', { encoding: 'utf-8', timeout: 30000 });
  3593	    await safeSend(chatId, '🎬 Reed: Shot list sent.');
  3594	  } catch (err) {
  3595	    await safeSend(chatId, `⚠️ Shot list error: ${err.message.slice(0, 200)}`);
  3596	  }
  3597	});
  3598	
  3599	// ── Reed Daily Lab — /lab ───────────────────────────────────────────────────
  3600	bot.onText(/^\/lab(?:@\w+)?$/i, async (msg) => {
  3601	  const chatId = msg.chat.id;
  3602	  await safeSend(chatId, '🎬 Reed Lab starting... This will take a few minutes.');
  3603	  try {
  3604	    execSync('cd ~/nanoclaw && node reed-lab/daily-lab.js', { encoding: 'utf-8', timeout: 900000 });
  3605	  } catch (err) {
  3606	    await safeSend(chatId, `⚠️ Lab error: ${err.message.slice(0, 200)}`);
  3607	  }
  3608	});
  3609	
  3610	// ── Roundtable — /roundtable ─────────────────────────────────────────────────
  3611	bot.onText(/^\/roundtable(?:@\w+)?(?:\s+(.*))?$/i, async (msg, match) => {
  3612	  const chatId = msg.chat.id;
  3613	  const topic = match?.[1]?.trim();
  3614	  await safeSend(chatId, '🏛️ Roundtable assembling...');
  3615	  try {
  3616	    if (topic) {
  3617	      execSync(`cd ~/nanoclaw && node reed-lab/roundtable.js --custom "${topic.replace(/"/g, '\\"')}"`, { encoding: 'utf-8', timeout: 600000 });
  3618	    } else {
  3619	      execSync('cd ~/nanoclaw && node reed-lab/roundtable.js --weekly', { encoding: 'utf-8', timeout: 600000 });
  3620	    }
  3621	  } catch (err) {
  3622	    await safeSend(chatId, `⚠️ Roundtable error: ${err.message.slice(0, 200)}`);
  3623	  }
  3624	});
  3625	
  3626	// ── Roundtable Digest — /digest ──────────────────────────────────────────────
  3627	bot.onText(/^\/digest(?:@\w+)?$/i, async (msg) => {
  3628	  const chatId = msg.chat.id;
  3629	  await safeSend(chatId, '🏛️ Generating roundtable digest...');
  3630	  try {
  3631	    execSync('cd ~/nanoclaw && node reed-lab/roundtable-digest.js --all', { encoding: 'utf-8', timeout: 300000 });
  3632	  } catch (err) {
  3633	    await safeSend(chatId, `⚠️ Digest error: ${err.message.slice(0, 200)}`);
  3634	  }
  3635	});
  3636	
  3637	// ── /predict — Predictive Intelligence completion engine ─────────────────────
  3638	bot.onText(/^\/predict(?:@\w+)?\s+(.+)$/s, async (msg, match) => {
  3639	  const chatId = msg.chat.id;
  3640	  const seed = match[1].trim();
  3641	  if (!seed) return safeSend(chatId, 'Usage: /predict <seed text>');
  3642	
  3643	  safeSend(chatId, `🔮 Running prediction on: "${seed.slice(0, 80)}..."`);
  3644	
  3645	  try {
  3646	    const { execSync } = require('child_process');
  3647	    const result = execSync(
  3648	      `source ~/cathedral-venv/bin/activate && python3 ~/Cathedral/predictive-complete.py "${seed.replace(/"/g, '\\"')}"`,
  3649	      { shell: '/bin/zsh', timeout: 180000, maxBuffer: 1024 * 1024, encoding: 'utf8' }
  3650	    );
  3651	
  3652	    // Extract the completion section from output
  3653	    const completionMatch = result.match(/COMPLETION \(Grade .+?\)\n={60}\n([\s\S]+?)\n={60}/);
  3654	    const gradeMatch = result.match(/Grade (\w) — (\d+)\/100/);
  3655	
  3656	    if (completionMatch) {
  3657	      const grade = gradeMatch ? gradeMatch[1] : '?';
  3658	      const score = gradeMatch ? gradeMatch[2] : '?';
  3659	      const emoji = { A: '🟢', B: '🔵', C: '🟡', D: '🟠', F: '🔴' }[grade] || '⚪';
  3660	      safeSend(chatId, `${emoji} *Prediction — Grade ${grade} (${score}/100)*\n\n${completionMatch[1]}`, { parse_mode: 'Markdown' });
  3661	    } else {
  3662	      // Fallback: send last 3000 chars of output
  3663	      safeSend(chatId, result.slice(-3000));
  3664	    }
  3665	  } catch (err) {
  3666	    console.error('[predict]', err.message);
  3667	    safeSend(chatId, `❌ Prediction failed: ${err.message.slice(0, 200)}`);
  3668	  }
  3669	});
  3670	
  3671	// ── /gaps — Predictive Intelligence structural holes + seeds ─────────────────
  3672	bot.onText(/^\/gaps(?:@\w+)?$/i, async (msg) => {
  3673	  const chatId = msg.chat.id;
  3674	
  3675	  try {
  3676	    const seedsPath = path.join(process.env.HOME, 'Cathedral', 'predictive-intelligence', 'autonomous-seeds.json');
  3677	    const graphPath = path.join(process.env.HOME, 'Cathedral', 'predictive-intelligence', 'knowledge-graph.json');
  3678	
  3679	    if (!fs.existsSync(seedsPath) || !fs.existsSync(graphPath)) {
  3680	      return safeSend(chatId, '⚠️ Predictive intelligence not built yet. Run: python3 ~/Cathedral/predictive-graph.py --all');
  3681	    }
  3682	
  3683	    const seeds = JSON.parse(fs.readFileSync(seedsPath, 'utf8'));
  3684	    const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  3685	    const stats = graph.stats || {};
  3686	
  3687	    let msg_text = `🧠 *Predictive Intelligence*\n`;
  3688	    msg_text += `Nodes: ${stats.nodes || '?'} | Edges: ${stats.edges || '?'} | Communities: ${stats.communities || '?'}\n`;
  3689	    msg_text += `Predicted edges: ${stats.predicted_edges || 0} | Contradictions: ${stats.contradictions || 0}\n\n`;
  3690	
  3691	    msg_text += `*Top Bridge Nodes:*\n`;
  3692	    (stats.top_bridge_nodes || []).slice(0, 5).forEach(b => {
  3693	      msg_text += `  • [${b.domain}] ${b.title.slice(0, 50)}\n`;
  3694	    });
  3695	
  3696	    msg_text += `\n*Autonomous Seeds (questions to investigate):*\n`;
  3697	    seeds.slice(0, 8).forEach((s, i) => {
  3698	      const pct = Math.round(s.priority * 100);
  3699	      const emoji = s.type === 'structural_hole' ? '🕳️' : s.type === 'predicted_bridge' ? '🌉' : '💎';
  3700	      msg_text += `\n${emoji} *(${pct}%)* ${s.question.slice(0, 120)}\n`;
  3701	    });
  3702	
  3703	    msg_text += `\n🗺️ Interactive map: localhost:8080/predictive/map`;
  3704	
  3705	    safeSend(chatId, msg_text, { parse_mode: 'Markdown' });
  3706	  } catch (err) {
  3707	    console.error('[gaps]', err.message);
  3708	    safeSend(chatId, `❌ ${err.message.slice(0, 200)}`);
  3709	  }
  3710	});
  3711	
  3712	// ── /predict-rebuild — Regenerate predictive intelligence graph ──────────────
  3713	bot.onText(/^\/predict-rebuild(?:@\w+)?$/i, async (msg) => {
  3714	  const chatId = msg.chat.id;
  3715	  safeSend(chatId, '🔄 Rebuilding predictive intelligence graph...');
  3716	  try {
  3717	    const { exec } = require('child_process');
  3718	    exec(
  3719	      'source ~/cathedral-venv/bin/activate && python3 ~/Cathedral/predictive-graph.py --all',
  3720	      { shell: '/bin/zsh', timeout: 600000, maxBuffer: 2 * 1024 * 1024 },
  3721	      (err, stdout, stderr) => {
  3722	        if (err) {
  3723	          safeSend(chatId, `❌ Rebuild failed: ${err.message.slice(0, 200)}`);
  3724	          return;
  3725	        }
  3726	        const summaryMatch = stdout.match(/PREDICTIVE INTELLIGENCE — SUMMARY\n={60}\n([\s\S]+?)$/);
  3727	        if (summaryMatch) {
  3728	          safeSend(chatId, `✅ *Predictive Intelligence rebuilt*\n\`\`\`\n${summaryMatch[1].slice(0, 1500)}\n\`\`\``, { parse_mode: 'Markdown' });
  3729	        } else {
  3730	          safeSend(chatId, '✅ Rebuild complete.');
  3731	        }
  3732	      }
  3733	    );
  3734	  } catch (err) {
  3735	    safeSend(chatId, `❌ ${err.message.slice(0, 200)}`);
  3736	  }
  3737	});
  3738	
  3739	// ── Taste Map commands ──────────────────────────────────────────────────────
  3740	
  3741	bot.onText(/^\/taste(?:@\w+)?\s*$/, async (msg) => {
  3742	  safeSend(msg.chat.id, tasteMap.getHelpText(), { parse_mode: 'Markdown' });
  3743	});
  3744	
  3745	bot.onText(/^\/taste(?:@\w+)?\s+status\s*$/i, async (msg) => {
  3746	  safeSend(msg.chat.id, tasteMap.formatStats(), { parse_mode: 'Markdown' });
  3747	});
  3748	
  3749	bot.onText(/^\/taste(?:@\w+)?\s+music\s*$/i, async (msg) => {
  3750	  safeSend(msg.chat.id, tasteMap.formatProfile('music'), { parse_mode: 'Markdown' });
  3751	});
  3752	
  3753	bot.onText(/^\/taste(?:@\w+)?\s+visual\s*$/i, async (msg) => {
  3754	  safeSend(msg.chat.id, tasteMap.formatProfile('visual_style'), { parse_mode: 'Markdown' });
  3755	});
  3756	
  3757	bot.onText(/^\/taste(?:@\w+)?\s+writing\s*$/i, async (msg) => {
  3758	  safeSend(msg.chat.id, tasteMap.formatProfile('writing_voice'), { parse_mode: 'Markdown' });
  3759	});
  3760	
  3761	bot.onText(/^\/taste(?:@\w+)?\s+teaching\s*$/i, async (msg) => {
  3762	  safeSend(msg.chat.id, tasteMap.formatProfile('teaching_tone'), { parse_mode: 'Markdown' });
  3763	});
  3764	
  3765	bot.onText(/^\/taste(?:@\w+)?\s+energy\s*$/i, async (msg) => {
  3766	  safeSend(msg.chat.id, tasteMap.formatProfile('class_energy'), { parse_mode: 'Markdown' });
  3767	});
  3768	
  3769	bot.onText(/^\/taste(?:@\w+)?\s+voices\s*$/i, async (msg) => {
  3770	  const refs = getVoiceReferences();
  3771	  let text = '🗣 *Voice References*\n\n';
  3772	  refs.forEach(r => {
  3773	    text += `*${r.name}* (${r.platform})\n`;
  3774	    text += `  ${r.signal}\n`;
  3775	    if (r.tension) text += `  ⚡ _${r.tension}_\n`;
  3776	    if (r.resolution) text += `  ✅ _${r.resolution}_\n`;
  3777	    text += '\n';
  3778	  });
  3779	  text += `\n✍️ *Pattern:* _${getVoicePattern()}_`;
  3780	  safeSend(msg.chat.id, text, { parse_mode: 'Markdown' });
  3781	});
  3782	
  3783	bot.onText(/^\/taste(?:@\w+)?\s+add\s+music\s+(.+)$/i, async (msg, match) => {
  3784	  const input = match[1].trim();
  3785	  const chatId = msg.chat.id;
  3786	  // Parse "artist - track" or just "artist"
  3787	  const parts = input.split(' - ');
  3788	  const anchor = {
  3789	    artist: parts[0].trim(),
  3790	    context: 'manual add via telegram'
  3791	  };
  3792	  if (parts[1]) anchor.tracks = [parts[1].trim()];
  3793	
  3794	  addAnchor('music', 'anchors_class_energy', anchor);
  3795	  safeSend(chatId, `✅ Added music anchor: *${anchor.artist}*${anchor.tracks ? ' — ' + anchor.tracks[0] : ''}`, { parse_mode: 'Markdown' });
  3796	});
  3797	
  3798	bot.onText(/^\/taste(?:@\w+)?\s+reject\s+(\w+)\s+(.+)$/i, async (msg, match) => {
  3799	  const domain = match[1].trim();
  3800	  const reason = match[2].trim();
  3801	  const chatId = msg.chat.id;
  3802	  const domainMap = { music: 'music', visual: 'visual_style', writing: 'writing_voice', teaching: 'teaching_tone', energy: 'class_energy' };
  3803	  const actualDomain = domainMap[domain] || domain;
  3804	
  3805	  const { addRejection } = await import('./taste-map-api.js');
  3806	  const result = addRejection(actualDomain, reason);
  3807	  if (result) {
  3808	    safeSend(chatId, `✅ Added rejection to *${actualDomain}*: "${reason}"`, { parse_mode: 'Markdown' });
  3809	  } else {
  3810	    safeSend(chatId, `❌ Unknown domain: ${domain}. Try: music, visual, writing, teaching, energy`);
  3811	  }
  3812	});
  3813	
  3814	bot.onText(/^\/taste(?:@\w+)?\s+elicit\s+(\w+)\s*$/i, async (msg, match) => {
  3815	  const domain = match[1].trim();
  3816	  const chatId = msg.chat.id;
  3817	  const domainMap = { music: 'music', visual: 'visual_style', writing: 'writing_voice', teaching: 'teaching_tone', energy: 'class_energy' };
  3818	  const actualDomain = domainMap[domain] || domain;
  3819	  const result = tasteMap.startSession(chatId, actualDomain);
  3820	  safeSend(chatId, result, { parse_mode: 'Markdown' });
  3821	});
  3822	
  3823	bot.onText(/^\/taste(?:@\w+)?\s+stop\s*$/i, async (msg) => {
  3824	  const result = tasteMap.stopSession(msg.chat.id);
  3825	  safeSend(msg.chat.id, result);
  3826	});
  3827	
  3828	// ── Architect commands ──────────────────────────────────────────────────────
  3829	
  3830	bot.onText(/^\/architect(?:@\w+)?\s*$/, async (msg) => {
  3831	  safeSend(msg.chat.id, `⚙️ *Architect — Intent to Plan*
  3832	
  3833	*Commands:*
  3834	\`/architect <intent>\` — generate structured plan
  3835	\`/architect status\` — list all generated plans
  3836	\`/architect deps <project>\` — show dependency graph
  3837	
  3838	*Example:*
  3839	\`/architect build online boxing program\`
  3840	\`/architect add speed bag rhythm tracker to gym\`
  3841	
  3842	Architect scans Cathedral infrastructure, references existing assets, and outputs: dependency graph + task sequence + resource map.`, { parse_mode: 'Markdown' });
  3843	});
  3844	
  3845	bot.onText(/^\/architect(?:@\w+)?\s+status\s*$/i, async (msg) => {
  3846	  const chatId = msg.chat.id;
  3847	  const plans = listPlans();
  3848	  if (plans.length === 0) {
  3849	    return safeSend(chatId, '⚙️ No plans generated yet. Use `/architect <intent>` to create one.', { parse_mode: 'Markdown' });
  3850	  }
  3851	  let text = '⚙️ *Architect Plans*\n\n';
  3852	  plans.forEach(p => {
  3853	    const date = p.generatedAt ? p.generatedAt.split('T')[0] : '?';
  3854	    text += `• *${p.project || p.file}* — ${p.phases} phases (${date})\n`;
  3855	    if (p.intent) text += `  _${p.intent.slice(0, 80)}_\n`;
  3856	  });
  3857	  safeSend(chatId, text, { parse_mode: 'Markdown' });
  3858	});
  3859	
  3860	bot.onText(/^\/architect(?:@\w+)?\s+(?!status\s*$)(.+)$/s, async (msg, match) => {
  3861	  const chatId = msg.chat.id;
  3862	  const intent = match[1].trim();
  3863	
  3864	  await safeSend(chatId, `⚙️ Architect scanning infrastructure and generating plan...\n_"${intent.slice(0, 100)}"_`, { parse_mode: 'Markdown' });
  3865	
  3866	  try {
  3867	    const plan = await generatePlan(intent);
  3868	
  3869	    // Send Telegram summary
  3870	    const telegramMsg = formatPlanTelegram(plan);
  3871	    await safeSend(chatId, telegramMsg, { parse_mode: 'Markdown' });
  3872	
  3873	    // Generate and save HTML
  3874	    const html = generateHTML(plan);
  3875	    const slug = plan.project || 'plan';
  3876	    const htmlPath = path.join(process.env.HOME, 'nanoclaw', 'architect-output', `${slug}.html`);
  3877	    fs.writeFileSync(htmlPath, html);
  3878	
  3879	    // Deposit to vault
  3880	    const vaultPath = depositToVault(plan);
  3881	
  3882	    await safeSend(chatId, `📄 HTML: \`${htmlPath}\`\n📁 Vault: \`${path.basename(vaultPath)}\`\n🔗 Open: localhost:8080 (serve via cath-bridge)`, { parse_mode: 'Markdown' });
  3883	
  3884	  } catch (err) {
  3885	    console.error('[architect]', err.message);
  3886	    await safeSend(chatId, `❌ Architect failed: ${err.message.slice(0, 300)}`);
  3887	  }
  3888	});
  3889	
  3890	// ── DJ Curator commands ─────────────────────────────────────────────────────
  3891	
  3892	bot.onText(/^\/(?:playlist|dj)(?:@\w+)?\s*$/, async (msg) => {
  3893	  safeSend(msg.chat.id, `🎵 *DJ Curator — Boxing Class Playlists*
  3894	
  3895	*Generate:*
  3896	\`/playlist\` — standard class playlist
  3897	\`/playlist <profile>\` — specific profile
  3898	\`/playlist vibe <mood>\` — mood override
  3899	
  3900	*Profiles:*
  3901	\`standard\` — default 60min class
  3902	\`la_habana\` — reggaeton-heavy (Cuban boxing)
  3903	\`old_school\` — 90s/2000s R&B + hip-hop
  3904	\`war_mode\` — maximum aggression
  3905	\`wildcard_heavy\` — genre-jumping, surprise picks
  3906	
  3907	*After class:*
  3908	\`/playlist rate <1-5> [notes]\` — rate last playlist
  3909	\`/playlist history\` — recent playlists + ratings
  3910	\`/playlist profiles\` — list all profiles`, { parse_mode: 'Markdown' });
  3911	});
  3912	
  3913	bot.onText(/^\/(?:playlist|dj)(?:@\w+)?\s+profiles?\s*$/i, async (msg) => {
  3914	  safeSend(msg.chat.id, djCurator.listProfiles(), { parse_mode: 'Markdown' });
  3915	});
  3916	
  3917	bot.onText(/^\/(?:playlist|dj)(?:@\w+)?\s+history\s*$/i, async (msg) => {
  3918	  safeSend(msg.chat.id, djCurator.formatHistoryTelegram(), { parse_mode: 'Markdown' });
  3919	});
  3920	
  3921	bot.onText(/^\/(?:playlist|dj)(?:@\w+)?\s+rate\s+(\d)\s*(.*)?$/i, async (msg, match) => {
  3922	  const rating = parseInt(match[1]);
  3923	  const notes = match[2]?.trim() || '';
  3924	  if (rating < 1 || rating > 5) return safeSend(msg.chat.id, '❌ Rating must be 1-5');
  3925	  const result = djCurator.rateLastPlaylist(rating, notes);
  3926	  safeSend(msg.chat.id, `🎵 ${result}`);
  3927	});
  3928	
  3929	bot.onText(/^\/(?:playlist|dj)(?:@\w+)?\s+vibe\s+(.+)$/i, async (msg, match) => {
  3930	  const mood = match[1].trim();
  3931	  const chatId = msg.chat.id;
  3932	  await safeSend(chatId, `🎵 Generating ${mood} playlist...`);
  3933	  try {
  3934	    // Map mood to closest profile
  3935	    const moodMap = {
  3936	      'war': 'war_mode', 'aggressive': 'war_mode', 'hard': 'war_mode', 'intense': 'war_mode',
  3937	      'cuba': 'la_habana', 'cuban': 'la_habana', 'latin': 'la_habana', 'reggaeton': 'la_habana', 'habana': 'la_habana',
  3938	      'old school': 'old_school', 'classic': 'old_school', 'oldschool': 'old_school', '90s': 'old_school', 'vibe': 'old_school',
  3939	      'wild': 'wildcard_heavy', 'surprise': 'wildcard_heavy', 'random': 'wildcard_heavy', 'fun': 'wildcard_heavy',
  3940	      'chill': 'old_school', 'flow': 'standard'
  3941	    };
  3942	    const profile = moodMap[mood.toLowerCase()] || 'standard';
  3943	    const playlist = djCurator.generatePlaylist(profile, { mood });
  3944	    if (djCurator.hasSpotifyCredentials()) {
  3945	      await djCurator.enrichWithSpotify(playlist);
  3946	    }
  3947	    await safeSend(chatId, djCurator.formatPlaylistTelegram(playlist), { parse_mode: 'Markdown' });
  3948	  } catch (err) {
  3949	    safeSend(chatId, `❌ DJ error: ${err.message}`);
  3950	  }
  3951	});
  3952	
  3953	bot.onText(/^\/(?:playlist|dj)(?:@\w+)?\s+(?!profiles?|history|rate|vibe)(\w+)\s*$/i, async (msg, match) => {
  3954	  const profileName = match[1].trim().toLowerCase();
  3955	  const chatId = msg.chat.id;
  3956	  await safeSend(chatId, `🎵 Generating ${profileName} playlist...`);
  3957	  try {
  3958	    const playlist = djCurator.generatePlaylist(profileName);
  3959	    if (djCurator.hasSpotifyCredentials()) {
  3960	      await djCurator.enrichWithSpotify(playlist);
  3961	    }
  3962	    await safeSend(chatId, djCurator.formatPlaylistTelegram(playlist), { parse_mode: 'Markdown' });
  3963	  } catch (err) {
  3964	    safeSend(chatId, `❌ DJ error: ${err.message}`);
  3965	  }
  3966	});
  3967	
  3968	// ── Sound Studio commands ────────────────────────────────────────────────────
  3969	
  3970	bot.onText(/^\/sound(?:@\w+)?\s*$/, async (msg) => {
  3971	  safeSend(msg.chat.id, soundStudio.formatStatusTelegram(), { parse_mode: 'Markdown' });
  3972	});
  3973	
  3974	bot.onText(/^\/sound(?:@\w+)?\s+status\s*$/i, async (msg) => {
  3975	  safeSend(msg.chat.id, soundStudio.formatStatusTelegram(), { parse_mode: 'Markdown' });
  3976	});
  3977	
  3978	bot.onText(/^\/sound(?:@\w+)?\s+voice\s+(.+)$/s, async (msg, match) => {
  3979	  const text = match[1].trim();
  3980	  const chatId = msg.chat.id;
  3981	  await safeSend(chatId, '🗣 Generating voiceover...');
  3982	  try {
  3983	    const result = await soundStudio.speak(text);
  3984	    await bot.sendDocument(chatId, result.outputPath, { caption: `🗣 Voiceover (${(result.durationMs / 1000).toFixed(1)}s)` });
  3985	  } catch (err) {
  3986	    safeSend(chatId, `❌ Voice error: ${err.message.slice(0, 200)}`);
  3987	  }
  3988	});
  3989	
  3990	bot.onText(/^\/sound(?:@\w+)?\s+clone\s+(.+)$/s, async (msg, match) => {
  3991	  const text = match[1].trim();
  3992	  const chatId = msg.chat.id;
  3993	  await safeSend(chatId, '🗣 Generating clone voice (Chatterbox TTS)... this takes ~30-60s');
  3994	  try {
  3995	    const result = await soundStudio.speakAsClone(text);
  3996	    await bot.sendDocument(chatId, result.outputPath, { caption: `🗣 Clone voice (${(result.durationMs / 1000).toFixed(1)}s)` });
  3997	  } catch (err) {
  3998	    safeSend(chatId, `❌ Clone error: ${err.message.slice(0, 200)}`);
  3999	  }
  4000	});
  4001	
  4002	bot.onText(/^\/sound(?:@\w+)?\s+instrumental\s+(.+)$/s, async (msg, match) => {
  4003	  const text = match[1].trim();
  4004	  const chatId = msg.chat.id;
  4005	  await safeSend(chatId, '🎵 Generating instrumental via Replicate MusicGen... (30-90s)');
  4006	  try {
  4007	    const result = await soundStudio.generateInstrumental(text);
  4008	    await bot.sendDocument(chatId, result.outputPath, { caption: `🎵 Instrumental: "${text.slice(0, 60)}"\n${(result.durationMs / 1000).toFixed(0)}s generation time` });
  4009	  } catch (err) {
  4010	    safeSend(chatId, `❌ Instrumental error: ${err.message.slice(0, 200)}`);
  4011	  }
  4012	});
  4013	
  4014	bot.onText(/^\/sound(?:@\w+)?\s+podcast\s+(.+)$/s, async (msg, match) => {
  4015	  const topic = match[1].trim();
  4016	  const chatId = msg.chat.id;
  4017	  await safeSend(chatId, `🎙 Generating podcast: "${topic}"...\nScript → voice → concatenate (1-3 min)`);
  4018	  try {
  4019	    // Search vault for content on this topic
  4020	    let content = '';
  4021	    try {
  4022	      const vaultResults = execFileSync('python3', [
  4023	        path.join(process.env.HOME, 'nanoclaw', 'vault_reader.py'),
  4024	        'search', topic, '--top_k', '10', '--json'
  4025	      ], { timeout: 5000, encoding: 'utf-8' });
  4026	      const nuggets = JSON.parse(vaultResults);
  4027	      content = nuggets.map(n => `[${n.domain || ''}] ${n.title}: ${n.first_line || ''}`).join('\n\n');
  4028	    } catch {}
  4029	
  4030	    if (!content) content = topic; // fallback: just use the topic as content
  4031	
  4032	    const result = await soundStudio.generatePodcast(content, topic);
  4033	    await bot.sendDocument(chatId, result.outputPath, {
  4034	      caption: `🎙 Podcast: "${topic}"\n${result.segments} segments · ${(result.durationMs / 1000).toFixed(0)}s generation`
  4035	    });
  4036	    // Send transcript too
  4037	    if (result.transcriptPath && fs.existsSync(result.transcriptPath)) {
  4038	      await bot.sendDocument(chatId, result.transcriptPath, { caption: '📝 Transcript' });
  4039	    }
  4040	  } catch (err) {
  4041	    safeSend(chatId, `❌ Podcast error: ${err.message.slice(0, 300)}`);
  4042	  }
  4043	});
  4044	
  4045	bot.onText(/^\/sound(?:@\w+)?\s+transcribe\s*$/i, async (msg) => {
  4046	  const chatId = msg.chat.id;
  4047	  // Check if replying to a voice/audio message
  4048	  const reply = msg.reply_to_message;
  4049	  if (!reply) {
  4050	    return safeSend(chatId, '💡 Reply to a voice note or audio file with `/sound transcribe`', { parse_mode: 'Markdown' });
  4051	  }
  4052	
  4053	  const fileId = reply.voice?.file_id || reply.audio?.file_id || reply.document?.file_id;
  4054	  if (!fileId) {
  4055	    return safeSend(chatId, '❌ Reply must be a voice note, audio, or document file.');
  4056	  }
  4057	
  4058	  await safeSend(chatId, '📝 Transcribing...');
  4059	  try {
  4060	    const fileLink = await bot.getFileLink(fileId);
  4061	    const tmpPath = `/tmp/sound-studio-input-${Date.now()}.ogg`;
  4062	    execSync(`curl -sL "${fileLink}" -o "${tmpPath}"`, { timeout: 60000 });
  4063	
  4064	    const result = soundStudio.transcribe(tmpPath);
  4065	    const preview = result.text.slice(0, 3000);
  4066	    await safeSend(chatId, `📝 *Transcription* (${result.text.length} chars, ${(result.durationMs / 1000).toFixed(1)}s)\n\n${preview}`, { parse_mode: 'Markdown' });
  4067	
  4068	    // Clean up
  4069	    try { fs.unlinkSync(tmpPath); } catch {}
  4070	  } catch (err) {
  4071	    safeSend(chatId, `❌ Transcribe error: ${err.message.slice(0, 300)}`);
  4072	  }
  4073	});
  4074	
  4075	// ── Gym Eyes commands ────────────────────────────────────────────────────────
  4076	
  4077	bot.onText(/^\/eyes(?:@\w+)?\s*$/, async (msg) => {
  4078	  safeSend(msg.chat.id, gymEyes.formatStatusTelegram(), { parse_mode: 'Markdown' });
  4079	});
  4080	
  4081	bot.onText(/^\/eyes(?:@\w+)?\s+last\s*$/i, async (msg) => {
  4082	  const chatId = msg.chat.id;
  4083	  const analyses = gymEyes.listAnalyses(1);
  4084	  if (analyses.length === 0) return safeSend(chatId, '👁 No analyses yet.');
  4085	
  4086	  try {
  4087	    const data = JSON.parse(fs.readFileSync(path.join(process.env.HOME, 'nanoclaw', 'gym-eyes', 'output', analyses[0].name), 'utf8'));
  4088	    safeSend(chatId, gymEyes.formatAnalysisTelegram(data), { parse_mode: 'Markdown' });
  4089	  } catch (err) {
  4090	    safeSend(chatId, `❌ ${err.message.slice(0, 200)}`);
  4091	  }
  4092	});
  4093	
  4094	bot.onText(/^\/eyes(?:@\w+)?\s+analyze\s*$/i, async (msg) => {
  4095	  const chatId = msg.chat.id;
  4096	  const reply = msg.reply_to_message;
  4097	
  4098	  if (!reply) {
  4099	    return safeSend(chatId, '💡 Reply to a video file with `/eyes analyze`', { parse_mode: 'Markdown' });
  4100	  }
  4101	
  4102	  const fileId = reply.video?.file_id || reply.document?.file_id;
  4103	  if (!fileId) {
  4104	    return safeSend(chatId, '❌ Reply must be a video or document file.');
  4105	  }
  4106	
  4107	  await safeSend(chatId, '👁 Gym Eyes: downloading video + running YOLO pose analysis...\nThis may take 1-5 min depending on video length.');
  4108	
  4109	  try {
  4110	    const fileLink = await bot.getFileLink(fileId);
  4111	    const tmpPath = `/tmp/gym-eyes-${Date.now()}.mp4`;
  4112	    execSync(`curl -sL "${fileLink}" -o "${tmpPath}"`, { timeout: 120000 });
  4113	
  4114	    const analysis = await gymEyes.analyzeVideoAsync(tmpPath, 'telegram');
  4115	    await safeSend(chatId, gymEyes.formatAnalysisTelegram(analysis), { parse_mode: 'Markdown' });
  4116	
  4117	    // Clean up
  4118	    try { fs.unlinkSync(tmpPath); } catch {}
  4119	  } catch (err) {
  4120	    safeSend(chatId, `❌ Gym Eyes error: ${err.message.slice(0, 300)}`);
  4121	  }
  4122	});
  4123	
  4124	// ── Inline keyboard callback handler (Densifier, Decay Detector) ────────────
  4125	bot.on('callback_query', async (query) => {
  4126	  const data = query.data;
  4127	  const chatId = query.message.chat.id;
  4128	  const msgId = query.message.message_id;
  4129	
  4130	  try {
  4131	    if (data.startsWith('dense_approve:') || data.startsWith('dense_skip:')) {
  4132	      const action = data.startsWith('dense_approve:') ? '--apply' : '--skip';
  4133	      // execSync imported at top
  4134	      const result = execSync(
  4135	        `python3 ${path.join(process.env.HOME, 'Cathedral', 'vault-densifier.py')} ${action} "${data}"`,
  4136	        { timeout: 15000, encoding: 'utf8' }
  4137	      ).trim();
  4138	      await bot.answerCallbackQuery(query.id, { text: result.slice(0, 200) });
  4139	      await bot.editMessageReplyMarkup(
  4140	        { inline_keyboard: [[{ text: data.startsWith('dense_approve:') ? '✅ Linked' : '⏭ Skipped', callback_data: 'noop' }]] },
  4141	        { chat_id: chatId, message_id: msgId }
  4142	      );
  4143	    } else if (data.startsWith('content_approve:') || data.startsWith('content_reject:')) {
  4144	      // Content Machine → Taste Map passive learning
  4145	      const isApprove = data.startsWith('content_approve:');
  4146	      const filename = data.split(':').slice(1).join(':');
  4147	      // Extract style from filename pattern: {source}-{style}-captioned.jpg
  4148	      const styleMatch = filename.match(/-(bw|neon|film|comic|cinematic|pro_photo|dramatic|manga|ippo|noir|poster|oil)-/i);
  4149	      const style = styleMatch ? styleMatch[1] : 'unknown';
  4150	
  4151	      if (isApprove) {
  4152	        addAnchor('visual_style', 'anchors', {
  4153	          item: filename,
  4154	          status: 'YES',
  4155	          style,
  4156	          reason: 'Paul approved via Content Machine',
  4157	          timestamp: new Date().toISOString()
  4158	        });
  4159	        await bot.answerCallbackQuery(query.id, { text: `✅ Approved + taste map updated (${style})` });
  4160	        await bot.editMessageReplyMarkup(
  4161	          { inline_keyboard: [[{ text: `✅ Approved (${style})`, callback_data: 'noop' }]] },
  4162	          { chat_id: chatId, message_id: msgId }
  4163	        );
  4164	      } else {
  4165	        const { addRejection } = await import('./taste-map-api.js');
  4166	        addRejection('visual_style', `Rejected: ${filename} — ${style} style`);
  4167	        await bot.answerCallbackQuery(query.id, { text: `❌ Rejected + taste map updated (${style})` });
  4168	        await bot.editMessageReplyMarkup(
  4169	          { inline_keyboard: [[{ text: `❌ Rejected (${style})`, callback_data: 'noop' }]] },
  4170	          { chat_id: chatId, message_id: msgId }
  4171	        );
  4172	      }
  4173	    } else if (data.startsWith('content_edit:')) {
  4174	      // Edit flow — just acknowledge, no taste map update (ambiguous signal)
  4175	      await bot.answerCallbackQuery(query.id, { text: 'Edit noted — no taste map update (ambiguous)' });
  4176	    } else if (data.startsWith('decay_')) {
  4177	      await bot.answerCallbackQuery(query.id, { text: 'Noted' });
  4178	    } else if (data === 'noop') {
  4179	      await bot.answerCallbackQuery(query.id);
  4180	    }
  4181	  } catch (err) {
  4182	    console.error('Callback error:', err.message);
  4183	    await bot.answerCallbackQuery(query.id, { text: `Error: ${err.message.slice(0, 150)}` });
  4184	  }
  4185	});
```

## FILE: cath-bridge.cjs (1785 lines — REST API)
```javascript
     1	#!/usr/bin/env node
     2	'use strict';
     3	
     4	const express   = require('express');
     5	const { spawn } = require('child_process');
     6	const path      = require('path');
     7	
     8	require('dotenv').config({ path: path.join(__dirname, '.env') });
     9	
    10	const app      = express();
    11	const PORT     = 8080;
    12	const HOME     = process.env.HOME;
    13	const NANOCLAW = __dirname;
    14	const CATH     = path.join(HOME, 'Cathedral');
    15	const VAULT    = path.join(HOME, 'cathedral-vault');
    16	
    17	app.use(express.json());
    18	
    19	app.use((req, res, next) => {
    20	  const origin = req.headers.origin;
    21	  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    22	    res.setHeader('Access-Control-Allow-Origin', origin);
    23	  } else {
    24	    res.setHeader('Access-Control-Allow-Origin', '*');
    25	  }
    26	  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    27	  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
    28	  if (req.method === 'OPTIONS') return res.sendStatus(204);
    29	  next();
    30	});
    31	
    32	// ── Auth middleware ────────────────────────────────────────────────────────────
    33	
    34	function requireApiKey(req, res, next) {
    35	  const key = process.env.CATH_API_KEY;
    36	  if (key && req.headers['x-api-key'] !== key) {
    37	    return res.status(401).json({ error: 'unauthorized' });
    38	  }
    39	  next();
    40	}
    41	
    42	// ── Spawn helper ──────────────────────────────────────────────────────────────
    43	
    44	function run(cmd, args, timeout = 120_000) {
    45	  return new Promise((resolve, reject) => {
    46	    const proc  = spawn(cmd, args, { env: process.env });
    47	    let stdout  = '';
    48	    let stderr  = '';
    49	    const timer = setTimeout(() => { proc.kill(); reject(new Error('timeout')); }, timeout);
    50	    proc.stdout.on('data', d => { stdout += d; });
    51	    proc.stderr.on('data', d => { stderr += d; });
    52	    proc.on('close', code => {
    53	      clearTimeout(timer);
    54	      if (code !== 0) reject(new Error(stderr.trim() || `exit ${code}`));
    55	      else resolve(stdout.trim());
    56	    });
    57	    proc.on('error', err => { clearTimeout(timer); reject(err); });
    58	  });
    59	}
    60	
    61	// ── POST /chat/local ──────────────────────────────────────────────────────────
    62	
    63	app.post('/chat/local', async (req, res) => {
    64	  const { query, history = [] } = req.body || {};
    65	  if (!query) return res.status(400).json({ error: 'query required' });
    66	
    67	  const messages = [
    68	    { role: 'system', content: 'You are Cath — Paul\'s cognitive extension. Be direct, precise, and brief. No filler.' },
    69	    ...history.slice(-10),
    70	    { role: 'user', content: query }
    71	  ];
    72	
    73	  try {
    74	    const response = await fetch('http://127.0.0.1:11434/api/chat', {
    75	      method: 'POST',
    76	      headers: { 'Content-Type': 'application/json' },
    77	      body: JSON.stringify({ model: 'hermes3', messages, stream: false })
    78	    });
    79	    const data = await response.json();
    80	    res.json({ response: data.message?.content || '' });
    81	  } catch (err) {
    82	    res.status(500).json({ error: err.message });
    83	  }
    84	});
    85	
    86	// ── POST /chat ────────────────────────────────────────────────────────────────
    87	
    88	app.post('/chat', async (req, res) => {
    89	  const { query, history = [] } = req.body || {};
    90	  if (!query) return res.status(400).json({ error: 'query required' });
    91	
    92	  try {
    93	    const output = await run('python3', [
    94	      path.join(NANOCLAW, 'cath_api.py'),
    95	      '--query',   query,
    96	      '--history', JSON.stringify(history),
    97	    ], 60_000);
    98	    res.json({ response: output });
    99	  } catch (err) {
   100	    res.status(500).json({ error: err.message });
   101	  }
   102	});
   103	
   104	// ── POST /command ─────────────────────────────────────────────────────────────
   105	
   106	const SENSE_COMMANDS = {
   107	  sight:          ['python3', [path.join(CATH, 'senses', 'sight.py'),          '--scan']],
   108	  proprioception: ['python3', [path.join(CATH, 'senses', 'proprioception.py'), '--scan']],
   109	  smell:          ['python3', [path.join(CATH, 'senses', 'smell.py'),          '--scan']],
   110	};
   111	
   112	app.post('/command', async (req, res) => {
   113	  const { command } = req.body || {};
   114	  if (!command) return res.status(400).json({ error: 'command required' });
   115	
   116	  if (command === 'gold') {
   117	    try {
   118	      const raw = await run('sqlite3', [
   119	        path.join(HOME, 'nanoclaw', 'vortex_data', 'metrics.db'),
   120	        'SELECT briefing FROM gold_findings ORDER BY run_at DESC LIMIT 1',
   121	      ]);
   122	      return res.json({ output: raw });
   123	    } catch (err) {
   124	      return res.status(500).json({ error: err.message });
   125	    }
   126	  }
   127	
   128	  const entry = SENSE_COMMANDS[command];
   129	  if (!entry) return res.status(400).json({
   130	    error: `unknown command: ${command}. valid: gold, ${Object.keys(SENSE_COMMANDS).join(', ')}`,
   131	  });
   132	
   133	  try {
   134	    const [cmd, args] = entry;
   135	    const output = await run(cmd, args, 300_000);
   136	    res.json({ output });
   137	  } catch (err) {
   138	    res.status(500).json({ error: err.message });
   139	  }
   140	});
   141	
   142	// ── GET /vault/read ───────────────────────────────────────────────────────────
   143	
   144	app.get('/vault/read', requireApiKey, (req, res) => {
   145	  const rel = req.query.path;
   146	  if (!rel) return res.status(400).json({ error: 'path query param required' });
   147	  const abs = path.resolve(VAULT, rel);
   148	  if (!abs.startsWith(VAULT + path.sep) && abs !== VAULT) {
   149	    return res.status(400).json({ error: 'path outside vault' });
   150	  }
   151	  try {
   152	    const content = require('fs').readFileSync(abs, 'utf8');
   153	    res.json({ path: rel, content });
   154	  } catch (err) {
   155	    res.status(404).json({ error: err.message });
   156	  }
   157	});
   158	
   159	// ── POST /vault/write ─────────────────────────────────────────────────────────
   160	
   161	app.post('/vault/write', requireApiKey, (req, res) => {
   162	  const { path: rel, content, append = false } = req.body || {};
   163	  if (!rel || content === undefined) {
   164	    return res.status(400).json({ error: 'path and content required' });
   165	  }
   166	  const abs = path.resolve(VAULT, rel);
   167	  if (!abs.startsWith(VAULT + path.sep) && abs !== VAULT) {
   168	    return res.status(400).json({ error: 'path outside vault' });
   169	  }
   170	  const fs = require('fs');
   171	  try {
   172	    fs.mkdirSync(path.dirname(abs), { recursive: true });
   173	    if (append) {
   174	      fs.appendFileSync(abs, content, 'utf8');
   175	    } else {
   176	      fs.writeFileSync(abs, content, 'utf8');
   177	    }
   178	    res.json({ ok: true, path: rel, action: append ? 'appended' : 'written' });
   179	  } catch (err) {
   180	    res.status(500).json({ error: err.message });
   181	  }
   182	});
   183	
   184	// ── GET /vault/search ─────────────────────────────────────────────────────────
   185	
   186	app.get('/vault/search', requireApiKey, async (req, res) => {
   187	  const { q, top_k = '10', limit } = req.query;
   188	  const k = limit || top_k;
   189	  if (!q) return res.status(400).json({ error: 'q query param required' });
   190	  try {
   191	    const output = await run('python3', [
   192	      path.join(NANOCLAW, 'vault_reader.py'),
   193	      'search', q, '--top_k', String(k), '--json',
   194	    ], 30_000);
   195	    const results = JSON.parse(output);
   196	    res.json(results);
   197	  } catch (err) {
   198	    res.status(500).json({ error: err.message });
   199	  }
   200	});
   201	
   202	// ── GET /vault/list ───────────────────────────────────────────────────────────
   203	
   204	app.get('/vault/list', requireApiKey, (req, res) => {
   205	  const rel = req.query.folder || '';
   206	  const abs = rel ? path.resolve(VAULT, rel) : VAULT;
   207	  if (!abs.startsWith(VAULT)) {
   208	    return res.status(400).json({ error: 'path outside vault' });
   209	  }
   210	  const fs = require('fs');
   211	  try {
   212	    const entries = fs.readdirSync(abs, { withFileTypes: true });
   213	    const files   = entries
   214	      .filter(e => e.isFile())
   215	      .map(e => path.join(rel, e.name));
   216	    const dirs    = entries
   217	      .filter(e => e.isDirectory())
   218	      .map(e => e.name + '/');
   219	    res.json({ folder: rel || '/', files, dirs });
   220	  } catch (err) {
   221	    res.status(404).json({ error: err.message });
   222	  }
   223	});
   224	
   225	// ── GET /status ───────────────────────────────────────────────────────────────
   226	
   227	app.get('/status', async (req, res) => {
   228	  try {
   229	    const raw   = await run('pm2', ['jlist']);
   230	    const list  = JSON.parse(raw);
   231	    const procs = list.map(p => ({
   232	      name:     p.name,
   233	      status:   p.pm2_env.status,
   234	      pid:      p.pid,
   235	      restarts: p.pm2_env.restart_time,
   236	      uptime:   p.pm2_env.pm_uptime,
   237	      cpu:      p.monit ? p.monit.cpu : 0,
   238	      memory:   p.monit ? p.monit.memory : 0,
   239	    }));
   240	    res.json({ processes: procs });
   241	  } catch (err) {
   242	    res.status(500).json({ error: err.message });
   243	  }
   244	});
   245	
   246	// ── GET /health/telegram ──────────────────────────────────────────────────────
   247	
   248	app.get('/health/telegram', (req, res) => {
   249	  try {
   250	    const statePath = path.join(HOME, 'Cathedral', 'cath-state.json');
   251	    const state = JSON.parse(require('fs').readFileSync(statePath, 'utf8'));
   252	    const health = state.telegram_health || {};
   253	    const lastOk = health.lastUpdateAt || health.lastPollOkAt;
   254	    const ageMs = lastOk ? Date.now() - new Date(lastOk).getTime() : Infinity;
   255	    const status = ageMs < 5 * 60 * 1000 ? 'green' : 'red';
   256	    res.json({
   257	      status,
   258	      lastUpdateAt: health.lastUpdateAt || null,
   259	      lastPollOkAt: health.lastPollOkAt || null,
   260	      pollErrorCount: health.pollErrorCount || 0,
   261	      totalErrors: health.totalErrors || 0,
   262	      ageSeconds: lastOk ? Math.round(ageMs / 1000) : null,
   263	      mode: health.mode || (process.env.TELEGRAM_WEBHOOK_URL ? 'webhook' : 'polling'),
   264	    });
   265	  } catch (err) {
   266	    res.status(500).json({ error: err.message });
   267	  }
   268	});
   269	
   270	// ── POST /telegram/webhook — receives Telegram updates from cloudflared ──────
   271	// Forwards to telegram-bot.js internal webhook listener on port 8443
   272	
   273	app.post('/telegram/webhook', async (req, res) => {
   274	  try {
   275	    const update = req.body;
   276	    if (!update || !update.update_id) {
   277	      return res.status(400).json({ error: 'invalid update' });
   278	    }
   279	    // Forward to bot's internal webhook listener
   280	    const resp = await fetch('http://127.0.0.1:8443/webhook', {
   281	      method: 'POST',
   282	      headers: { 'Content-Type': 'application/json' },
   283	      body: JSON.stringify(update),
   284	    });
   285	    const result = await resp.json();
   286	    res.json(result);
   287	  } catch (err) {
   288	    console.error('[webhook] Error forwarding update:', err.message);
   289	    res.status(500).json({ error: err.message });
   290	  }
   291	});
   292	
   293	// ── Creative Court: Image Generation ─────────────────────────────────────────
   294	
   295	app.post('/creative/generate', requireApiKey, async (req, res) => {
   296	  const { prompt, size = '1024x1024' } = req.body || {};
   297	  if (!prompt) return res.status(400).json({ error: 'prompt required' });
   298	
   299	  const token = process.env.REPLICATE_API_TOKEN;
   300	  if (!token) return res.status(500).json({ error: 'REPLICATE_API_TOKEN not set' });
   301	
   302	  const [width, height] = size.split('x').map(Number);
   303	
   304	  try {
   305	    // Create prediction
   306	    const createRes = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-dev/predictions', {
   307	      method: 'POST',
   308	      headers: {
   309	        'Authorization': `Token ${token}`,
   310	        'Content-Type': 'application/json'
   311	      },
   312	      body: JSON.stringify({
   313	        input: {
   314	          prompt,
   315	          width: width || 1024,
   316	          height: height || 1024,
   317	          num_outputs: 1
   318	        }
   319	      })
   320	    });
   321	
   322	    if (!createRes.ok) {
   323	      const errBody = await createRes.text();
   324	      return res.status(createRes.status).json({ error: errBody });
   325	    }
   326	
   327	    let prediction = await createRes.json();
   328	
   329	    // Poll until complete
   330	    const pollUrl = prediction.urls?.get || `https://api.replicate.com/v1/predictions/${prediction.id}`;
   331	    while (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
   332	      await new Promise(r => setTimeout(r, 1500));
   333	      const pollRes = await fetch(pollUrl, {
   334	        headers: { 'Authorization': `Token ${token}` }
   335	      });
   336	      prediction = await pollRes.json();
   337	    }
   338	
   339	    if (prediction.status === 'failed') {
   340	      return res.status(500).json({ error: prediction.error || 'Prediction failed' });
   341	    }
   342	
   343	    const output = prediction.output;
   344	    const imageUrl = Array.isArray(output) ? output[0] : output;
   345	    if (!imageUrl) return res.status(500).json({ error: 'No image in response' });
   346	
   347	    res.json({ url: imageUrl });
   348	  } catch (err) {
   349	    res.status(500).json({ error: err.message });
   350	  }
   351	});
   352	
   353	// ── Creative Court: Image Edit (image-to-image) ─────────────────────────────
   354	
   355	app.post('/creative/edit', requireApiKey, async (req, res) => {
   356	  const { image_b64, prompt, size = '1024x1024' } = req.body || {};
   357	  if (!image_b64 || !prompt) return res.status(400).json({ error: 'image_b64 and prompt required' });
   358	
   359	  const apiKey = process.env.LAOZHANG_API_KEY;
   360	  if (!apiKey) return res.status(500).json({ error: 'LAOZHANG_API_KEY not set' });
   361	
   362	  try {
   363	    const fs = require('fs');
   364	    const FormData = (await import('undici')).FormData;
   365	    const { Blob } = require('buffer');
   366	
   367	    // Convert base64 to buffer
   368	    const imgBuf = Buffer.from(image_b64, 'base64');
   369	    const imgBlob = new Blob([imgBuf], { type: 'image/png' });
   370	
   371	    const form = new FormData();
   372	    form.append('model', 'gpt-image-1');
   373	    form.append('image[]', imgBlob, 'input.png');
   374	    form.append('prompt', prompt);
   375	    form.append('size', size);
   376	
   377	    const response = await fetch('https://api.laozhang.ai/v1/images/edits', {
   378	      method: 'POST',
   379	      headers: { 'Authorization': `Bearer ${apiKey}` },
   380	      body: form
   381	    });
   382	
   383	    if (!response.ok) {
   384	      const errBody = await response.text();
   385	      return res.status(response.status).json({ error: errBody });
   386	    }
   387	
   388	    const data = await response.json();
   389	    const img = data.data?.[0];
   390	    res.json({
   391	      b64_json: img?.b64_json || null,
   392	      url: img?.url || null
   393	    });
   394	  } catch (err) {
   395	    res.status(500).json({ error: err.message });
   396	  }
   397	});
   398	
   399	// ── Creative Court: Save Image to Vault ──────────────────────────────────────
   400	
   401	app.post('/creative/save-image', requireApiKey, async (req, res) => {
   402	  const { path: relPath, data: b64Data } = req.body || {};
   403	  if (!relPath || !b64Data) return res.status(400).json({ error: 'path and data required' });
   404	
   405	  const fs = require('fs');
   406	  const abs = path.resolve(VAULT, relPath);
   407	  if (!abs.startsWith(VAULT)) return res.status(400).json({ error: 'path outside vault' });
   408	
   409	  try {
   410	    const dir = path.dirname(abs);
   411	    fs.mkdirSync(dir, { recursive: true });
   412	    fs.writeFileSync(abs, Buffer.from(b64Data, 'base64'));
   413	    res.json({ ok: true, path: relPath });
   414	  } catch (err) {
   415	    res.status(500).json({ error: err.message });
   416	  }
   417	});
   418	
   419	// ── Creative Court: Telegram Notification ────────────────────────────────────
   420	
   421	app.post('/creative/notify', requireApiKey, async (req, res) => {
   422	  const { message } = req.body || {};
   423	  if (!message) return res.status(400).json({ error: 'message required' });
   424	
   425	  const token = process.env.TELEGRAM_TOKEN;
   426	  const chatId = process.env.PAUL_CHAT_ID;
   427	  if (!token || !chatId) return res.status(500).json({ error: 'Telegram not configured' });
   428	
   429	  try {
   430	    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
   431	      method: 'POST',
   432	      headers: { 'Content-Type': 'application/json' },
   433	      body: JSON.stringify({ chat_id: chatId, text: message })
   434	    });
   435	    const data = await tgRes.json();
   436	    res.json({ ok: data.ok });
   437	  } catch (err) {
   438	    res.status(500).json({ error: err.message });
   439	  }
   440	});
   441	
   442	// ── Creative Court: Send Telegram Photo ──────────────────────────────────────
   443	
   444	app.post('/creative/send-photo', requireApiKey, async (req, res) => {
   445	  const { image_path, caption = '' } = req.body || {};
   446	  if (!image_path) return res.status(400).json({ error: 'image_path required' });
   447	
   448	  const token = process.env.TELEGRAM_TOKEN;
   449	  const chatId = process.env.PAUL_CHAT_ID;
   450	  if (!token || !chatId) return res.status(500).json({ error: 'Telegram not configured' });
   451	
   452	  const fs = require('fs');
   453	
   454	  try {
   455	    const abs = path.resolve(image_path);
   456	    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'Image file not found' });
   457	
   458	    const { Blob } = require('buffer');
   459	    const FormData = (await import('undici')).FormData;
   460	
   461	    const imgBuf = fs.readFileSync(abs);
   462	    const imgBlob = new Blob([imgBuf], { type: 'image/png' });
   463	
   464	    const form = new FormData();
   465	    form.append('chat_id', chatId);
   466	    form.append('photo', imgBlob, path.basename(abs));
   467	    if (caption) form.append('caption', caption);
   468	
   469	    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
   470	      method: 'POST',
   471	      body: form
   472	    });
   473	    const data = await tgRes.json();
   474	    res.json({ ok: data.ok });
   475	  } catch (err) {
   476	    res.status(500).json({ error: err.message });
   477	  }
   478	});
   479	
   480	// ── Creative Court: List Illustrations ───────────────────────────────────────
   481	
   482	app.get('/creative/gallery', requireApiKey, async (req, res) => {
   483	  const fs = require('fs');
   484	  const illDir = path.join(VAULT, '09_Artifacts', 'illustrations');
   485	
   486	  try {
   487	    const results = [];
   488	    function walk(dir, rel) {
   489	      const entries = fs.readdirSync(dir, { withFileTypes: true });
   490	      for (const e of entries) {
   491	        const fullPath = path.join(dir, e.name);
   492	        const relPath = path.join(rel, e.name);
   493	        if (e.isDirectory()) {
   494	          walk(fullPath, relPath);
   495	        } else if (/\.(png|jpg|jpeg|webp|gif)$/i.test(e.name)) {
   496	          const stat = fs.statSync(fullPath);
   497	          results.push({
   498	            name: e.name,
   499	            path: relPath,
   500	            fullPath,
   501	            size: stat.size,
   502	            modified: stat.mtime.toISOString()
   503	          });
   504	        }
   505	      }
   506	    }
   507	    walk(illDir, '');
   508	    results.sort((a, b) => new Date(b.modified) - new Date(a.modified));
   509	    res.json({ images: results.slice(0, 100) });
   510	  } catch (err) {
   511	    res.status(500).json({ error: err.message });
   512	  }
   513	});
   514	
   515	// ── Serve illustration images ────────────────────────────────────────────────
   516	
   517	app.get('/creative/image', (req, res) => {
   518	  // Accept API key from query param for img src tags
   519	  const key = process.env.CATH_API_KEY;
   520	  if (key && req.headers['x-api-key'] !== key && req.query['x-api-key'] !== key) {
   521	    return res.status(401).json({ error: 'unauthorized' });
   522	  }
   523	  const fs = require('fs');
   524	  const relPath = req.query.path || '';
   525	  const imgPath = path.resolve(VAULT, '09_Artifacts', 'illustrations', relPath);
   526	  if (!imgPath.startsWith(path.join(VAULT, '09_Artifacts', 'illustrations'))) {
   527	    return res.status(400).json({ error: 'path outside illustrations' });
   528	  }
   529	  if (!fs.existsSync(imgPath)) return res.status(404).json({ error: 'not found' });
   530	
   531	  const ext = path.extname(imgPath).toLowerCase();
   532	  const mimeTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
   533	  res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
   534	  fs.createReadStream(imgPath).pipe(res);
   535	});
   536	
   537	// ── Graph endpoints ──────────────────────────────────────────────────────────
   538	
   539	const GRAPHIFY_OUT = path.join(NANOCLAW, 'graphify-out');
   540	
   541	app.get('/graph/html', (req, res) => {
   542	  // Accept API key from query param for iframe src
   543	  const key = process.env.CATH_API_KEY;
   544	  if (key && req.headers['x-api-key'] !== key && req.query['x-api-key'] !== key) {
   545	    return res.status(401).json({ error: 'unauthorized' });
   546	  }
   547	  const fs = require('fs');
   548	  const htmlPath = path.join(GRAPHIFY_OUT, 'graph.html');
   549	  if (!fs.existsSync(htmlPath)) return res.status(404).json({ error: 'graph.html not found — run /graphify first' });
   550	  res.setHeader('Content-Type', 'text/html');
   551	  fs.createReadStream(htmlPath).pipe(res);
   552	});
   553	
   554	app.get('/graph/stats', requireApiKey, (req, res) => {
   555	  const fs = require('fs');
   556	  const jsonPath = path.join(GRAPHIFY_OUT, 'graph.json');
   557	  if (!fs.existsSync(jsonPath)) return res.json({ exists: false });
   558	  try {
   559	    const stat = fs.statSync(jsonPath);
   560	    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
   561	    const nodes = (data.nodes || []).length;
   562	    const edges = (data.links || data.edges || []).length;
   563	    const communities = new Set((data.nodes || []).map(n => n.community).filter(c => c !== undefined)).size;
   564	    res.json({ exists: true, nodes, edges, communities, updated: stat.mtime.toISOString() });
   565	  } catch (err) {
   566	    res.status(500).json({ error: err.message });
   567	  }
   568	});
   569	
   570	let graphRebuildRunning = false;
   571	
   572	app.post('/graph/rebuild', requireApiKey, (req, res) => {
   573	  if (graphRebuildRunning) return res.status(409).json({ error: 'rebuild already running' });
   574	  graphRebuildRunning = true;
   575	  res.json({ status: 'started' });
   576	
   577	  const proc = spawn('python3', ['-c', `
   578	import sys, json
   579	from graphify.extract import collect_files, extract
   580	from graphify.detect import detect
   581	from graphify.build import build_from_json
   582	from graphify.cluster import cluster, score_all
   583	from graphify.analyze import god_nodes, surprising_connections
   584	from graphify.report import generate
   585	from graphify.export import to_json, to_html
   586	from pathlib import Path
   587	
   588	base = Path('${NANOCLAW.replace(/'/g, "\\'")}')
   589	det = detect(base)
   590	# Filter vector_data
   591	for ft in det.get('files', {}):
   592	    det['files'][ft] = [f for f in det['files'][ft] if not f.startswith('vector_data/')]
   593	
   594	code_files = []
   595	for f in det.get('files', {}).get('code', []):
   596	    p = Path(f)
   597	    code_files.extend(collect_files(p) if p.is_dir() else [p])
   598	ext = extract(code_files) if code_files else {'nodes':[],'edges':[],'input_tokens':0,'output_tokens':0}
   599	G = build_from_json(ext)
   600	comms = cluster(G)
   601	coh = score_all(G, comms)
   602	gods = god_nodes(G)
   603	surp = surprising_connections(G, comms)
   604	labels = {cid: 'Community ' + str(cid) for cid in comms}
   605	tokens = {'input': ext.get('input_tokens',0), 'output': ext.get('output_tokens',0)}
   606	report = generate(G, comms, coh, labels, gods, surp, det, tokens, str(base))
   607	out = base / 'graphify-out'
   608	out.mkdir(exist_ok=True)
   609	(out / 'GRAPH_REPORT.md').write_text(report)
   610	to_json(G, comms, str(out / 'graph.json'))
   611	to_html(G, comms, str(out / 'graph.html'), community_labels=labels)
   612	print(json.dumps({'nodes': G.number_of_nodes(), 'edges': G.number_of_edges(), 'communities': len(comms)}))
   613	`], { cwd: NANOCLAW, env: process.env });
   614	
   615	  let stdout = '';
   616	  proc.stdout.on('data', d => { stdout += d; });
   617	  proc.stderr.on('data', d => { /* absorb */ });
   618	  proc.on('close', () => { graphRebuildRunning = false; });
   619	  proc.on('error', () => { graphRebuildRunning = false; });
   620	});
   621	
   622	app.get('/graph/rebuild/status', requireApiKey, (req, res) => {
   623	  res.json({ running: graphRebuildRunning });
   624	});
   625	
   626	// ── Predictive Intelligence ────────────────────────────────────────────────────
   627	
   628	const PRED_DIR = path.join(HOME, 'Cathedral', 'predictive-intelligence');
   629	
   630	app.get('/predictive/map', (req, res) => {
   631	  const key = process.env.CATH_API_KEY;
   632	  if (key && req.headers['x-api-key'] !== key && req.query['x-api-key'] !== key) {
   633	    return res.status(401).json({ error: 'unauthorized' });
   634	  }
   635	  const htmlPath = path.join(PRED_DIR, 'predictive-map.html');
   636	  if (!require('fs').existsSync(htmlPath)) return res.status(404).json({ error: 'predictive-map.html not found — run predictive-graph.py first' });
   637	  res.setHeader('Content-Type', 'text/html');
   638	  require('fs').createReadStream(htmlPath).pipe(res);
   639	});
   640	
   641	app.get('/predictive/stats', requireApiKey, (req, res) => {
   642	  const jsonPath = path.join(PRED_DIR, 'knowledge-graph.json');
   643	  if (!require('fs').existsSync(jsonPath)) return res.json({ exists: false });
   644	  try {
   645	    const data = JSON.parse(require('fs').readFileSync(jsonPath, 'utf8'));
   646	    res.json({ exists: true, ...data.stats, generated: data.generated });
   647	  } catch (err) {
   648	    res.status(500).json({ error: err.message });
   649	  }
   650	});
   651	
   652	app.get('/predictive/seeds', requireApiKey, (req, res) => {
   653	  const seedsPath = path.join(PRED_DIR, 'autonomous-seeds.json');
   654	  if (!require('fs').existsSync(seedsPath)) return res.json([]);
   655	  try {
   656	    res.json(JSON.parse(require('fs').readFileSync(seedsPath, 'utf8')));
   657	  } catch (err) {
   658	    res.status(500).json({ error: err.message });
   659	  }
   660	});
   661	
   662	app.get('/predictive/predictions', requireApiKey, (req, res) => {
   663	  const predPath = path.join(PRED_DIR, 'predictions.json');
   664	  if (!require('fs').existsSync(predPath)) return res.json({});
   665	  try {
   666	    res.json(JSON.parse(require('fs').readFileSync(predPath, 'utf8')));
   667	  } catch (err) {
   668	    res.status(500).json({ error: err.message });
   669	  }
   670	});
   671	
   672	let predRebuildRunning = false;
   673	app.post('/predictive/rebuild', requireApiKey, (req, res) => {
   674	  if (predRebuildRunning) return res.status(409).json({ error: 'rebuild already running' });
   675	  predRebuildRunning = true;
   676	  res.json({ status: 'started' });
   677	  const proc = spawn('python3', ['predictive-graph.py', '--all'], {
   678	    cwd: path.join(HOME, 'Cathedral'),
   679	    env: { ...process.env, PATH: `${HOME}/cathedral-venv/bin:${process.env.PATH}` },
   680	  });
   681	  proc.on('close', () => { predRebuildRunning = false; });
   682	});
   683	
   684	// ── Villa snapshot ─────────────────────────────────────────────────────────────
   685	// Single consolidated endpoint powering the Cathedral Villa panel.
   686	// Returns everything the panel needs in one call: pm2 state, vault counts,
   687	// sense states, latest muse finding, project count, recent files.
   688	
   689	const fs = require('fs');
   690	
   691	// Map of Cathedral senses to their PM2 process name
   692	const SENSE_TO_PROCESS = {
   693	  sight:         'sentinel',
   694	  smell:         'sentinel',
   695	  proprioception:'vault-state-refresh',
   696	  transmission:  'cath-bridge',
   697	  reflection:    'cognitive-scanner',
   698	  hearing:       null,             // planned
   699	};
   700	
   701	// Board seats and their backing processes
   702	const BOARD_SEATS = [
   703	  { seat: 'cathy',                 process: 'cathedral-bot' },
   704	  { seat: 'orchestrator',          process: null },              // claude.ai
   705	  { seat: 'cowork',                process: 'the-cartographer' },
   706	  { seat: 'claude-code',           process: null },              // local terminal
   707	  { seat: 'universe-intelligence', process: null },              // research advisor
   708	];
   709	
   710	function readMuseFinding() {
   711	  const dir = path.join(VAULT, '00_Staging', 'muse-findings');
   712	  try {
   713	    const files = fs.readdirSync(dir)
   714	      .filter(f => f.match(/^\d{4}-\d{2}-\d{2}-muse-finding\.md$/))
   715	      .sort()
   716	      .reverse();
   717	    if (!files.length) return null;
   718	    const latest = files[0];
   719	    const raw = fs.readFileSync(path.join(dir, latest), 'utf8');
   720	    // Strip frontmatter, take first 600 chars
   721	    const body = raw.replace(/^---[\s\S]*?---\n*/, '').trim();
   722	    return {
   723	      date:   latest.slice(0, 10),
   724	      file:   latest,
   725	      snippet: body.slice(0, 600),
   726	      length:  body.length,
   727	    };
   728	  } catch (_) {
   729	    return null;
   730	  }
   731	}
   732	
   733	function countVaultFiles() {
   734	  const counts = { total: 0, staging: 0, refined: 0, methods: 0, artifacts: 0 };
   735	  function walk(dir, key) {
   736	    try {
   737	      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
   738	        if (entry.name.startsWith('.')) continue;
   739	        const full = path.join(dir, entry.name);
   740	        if (entry.isDirectory()) walk(full, key);
   741	        else if (entry.name.endsWith('.md')) {
   742	          counts.total++;
   743	          if (key) counts[key]++;
   744	        }
   745	      }
   746	    } catch (_) { /* ignore */ }
   747	  }
   748	  walk(path.join(VAULT, '00_Staging'),      'staging');
   749	  walk(path.join(VAULT, '02_Refined_Gold'), 'refined');
   750	  walk(path.join(VAULT, '06_Methods'),      'methods');
   751	  walk(path.join(VAULT, '09_Artifacts'),    'artifacts');
   752	  return counts;
   753	}
   754	
   755	function countProjects() {
   756	  try {
   757	    return fs.readdirSync(path.join(VAULT, '08_Project_Orchestrator', 'projects'))
   758	      .filter(f => f.endsWith('.md'))
   759	      .length;
   760	  } catch (_) { return 0; }
   761	}
   762	
   763	function recentFiles(limit = 10) {
   764	  const results = [];
   765	  function walk(dir, depth = 0) {
   766	    if (depth > 4) return;
   767	    try {
   768	      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
   769	        if (entry.name.startsWith('.')) continue;
   770	        const full = path.join(dir, entry.name);
   771	        if (entry.isDirectory()) walk(full, depth + 1);
   772	        else if (entry.name.endsWith('.md')) {
   773	          try {
   774	            const st = fs.statSync(full);
   775	            results.push({ path: full.replace(VAULT, ''), mtime: st.mtimeMs });
   776	          } catch (_) { /* ignore */ }
   777	        }
   778	      }
   779	    } catch (_) { /* ignore */ }
   780	  }
   781	  walk(VAULT);
   782	  return results.sort((a, b) => b.mtime - a.mtime).slice(0, limit);
   783	}
   784	
   785	async function readPm2State() {
   786	  try {
   787	    const raw  = await run('pm2', ['jlist']);
   788	    const list = JSON.parse(raw);
   789	    const byName = {};
   790	    for (const p of list) {
   791	      byName[p.name] = {
   792	        name:     p.name,
   793	        status:   p.pm2_env.status,
   794	        pid:      p.pid,
   795	        restarts: p.pm2_env.restart_time,
   796	        uptime:   p.pm2_env.pm_uptime,
   797	        cpu:      p.monit ? p.monit.cpu : 0,
   798	        memory:   p.monit ? p.monit.memory : 0,
   799	      };
   800	    }
   801	    return byName;
   802	  } catch (_) {
   803	    return {};
   804	  }
   805	}
   806	
   807	// ── Resonance Filter ───────────────────────────────────────────────────────────
   808	// Library module imported via dynamic import (filter is ES module, bridge is CJS).
   809	// Checks incoming briefs against the Cathedral's governing field.
   810	
   811	let _resonanceMod = null;
   812	async function getResonance() {
   813	  if (_resonanceMod) return _resonanceMod;
   814	  _resonanceMod = await import(path.join(__dirname, 'resonance-filter.js'));
   815	  return _resonanceMod;
   816	}
   817	
   818	app.post('/resonance/check', async (req, res) => {
   819	  const { brief, context } = req.body || {};
   820	  if (!brief || typeof brief !== 'string') {
   821	    return res.status(400).json({ error: 'brief (string) required' });
   822	  }
   823	  try {
   824	    const { checkResonance } = await getResonance();
   825	    const result = checkResonance(brief, context || '');
   826	    res.json(result);
   827	  } catch (err) {
   828	    res.status(500).json({ error: err.message });
   829	  }
   830	});
   831	
   832	app.get('/villa/snapshot', async (req, res) => {
   833	  try {
   834	    const pm2State = await readPm2State();
   835	
   836	    const senses = Object.entries(SENSE_TO_PROCESS).map(([sense, proc]) => ({
   837	      sense,
   838	      process: proc,
   839	      status:  proc ? (pm2State[proc]?.status || 'unknown') : 'planned',
   840	      online:  proc ? pm2State[proc]?.status === 'online' : false,
   841	    }));
   842	
   843	    const board = BOARD_SEATS.map(({ seat, process: proc }) => ({
   844	      seat,
   845	      process: proc,
   846	      status:  proc ? (pm2State[proc]?.status || 'unknown') : 'external',
   847	      online:  proc ? pm2State[proc]?.status === 'online' : null,
   848	    }));
   849	
   850	    const processes = Object.values(pm2State).map(p => ({
   851	      name:    p.name,
   852	      status:  p.status,
   853	      cpu:     p.cpu,
   854	      memory:  p.memory,
   855	      uptime:  p.uptime,
   856	      restarts:p.restarts,
   857	    }));
   858	
   859	    res.json({
   860	      ok:        true,
   861	      timestamp: Date.now(),
   862	      muse:      readMuseFinding(),
   863	      vault:     countVaultFiles(),
   864	      projects:  { count: countProjects() },
   865	      senses,
   866	      board,
   867	      processes,
   868	      recent:    recentFiles(10),
   869	    });
   870	  } catch (err) {
   871	    res.status(500).json({ ok: false, error: err.message });
   872	  }
   873	});
   874	
   875	// ── Villa Phase 2: Projects endpoint ──────────────────────────────────────────
   876	
   877	function readProjectCards() {
   878	  const dir = path.join(VAULT, '08_Project_Orchestrator', 'projects');
   879	  const cards = [];
   880	  try {
   881	    for (const file of fs.readdirSync(dir)) {
   882	      if (!file.endsWith('.md')) continue;
   883	      const full = path.join(dir, file);
   884	      const stat = fs.statSync(full);
   885	      const raw = fs.readFileSync(full, 'utf8');
   886	      // Parse YAML frontmatter
   887	      if (!raw.startsWith('---')) continue;
   888	      const fmEnd = raw.indexOf('\n---', 3);
   889	      if (fmEnd === -1) continue;
   890	      const fm = raw.slice(3, fmEnd);
   891	      const card = { file: file.replace('.md', ''), updated: stat.mtimeMs };
   892	      for (const line of fm.split('\n')) {
   893	        const m = line.match(/^([\w-]+):\s*"?([^"]*)"?\s*$/);
   894	        if (!m) continue;
   895	        const key = m[1].trim();
   896	        const val = m[2].trim();
   897	        if (key === 'title') card.title = val;
   898	        else if (key === 'project-status') card.status = val;
   899	        else if (key === 'project-priority') card.priority = val;
   900	        else if (key === 'project-next-action') card.nextAction = val;
   901	        else if (key === 'project-domain') card.domain = val;
   902	        else if (key === 'project-target') card.target = val;
   903	        else if (key === 'project-blocked-by') card.blockedBy = val;
   904	        else if (key === 'project-last-updated') card.lastUpdated = val;
   905	      }
   906	      // Body excerpt (first non-frontmatter paragraph)
   907	      const body = raw.slice(fmEnd + 4).trim();
   908	      card.excerpt = body.split('\n\n')[0]?.slice(0, 200) || '';
   909	      cards.push(card);
   910	    }
   911	  } catch (_) { /* ignore */ }
   912	  // Sort: active first, then by priority (critical > high > medium > low), then by updated
   913	  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
   914	  return cards.sort((a, b) => {
   915	    if (a.status === 'active' && b.status !== 'active') return -1;
   916	    if (b.status === 'active' && a.status !== 'active') return 1;
   917	    const pa = priorityOrder[a.priority] ?? 9;
   918	    const pb = priorityOrder[b.priority] ?? 9;
   919	    if (pa !== pb) return pa - pb;
   920	    return b.updated - a.updated;
   921	  });
   922	}
   923	
   924	app.get('/villa/projects', (req, res) => {
   925	  try {
   926	    res.json({ ok: true, projects: readProjectCards() });
   927	  } catch (err) {
   928	    res.status(500).json({ ok: false, error: err.message });
   929	  }
   930	});
   931	
   932	// ── Villa Phase 2: Artifacts endpoint ─────────────────────────────────────────
   933	
   934	function scanArtifacts() {
   935	  const base = path.join(VAULT, '09_Artifacts');
   936	  const exts = new Set(['.html', '.png', '.jpg', '.jpeg', '.svg']);
   937	  const assets = [];
   938	  function walk(dir, depth) {
   939	    if (depth > 5) return;
   940	    try {
   941	      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
   942	        if (entry.name.startsWith('.')) continue;
   943	        const full = path.join(dir, entry.name);
   944	        if (entry.isDirectory()) { walk(full, depth + 1); continue; }
   945	        const ext = path.extname(entry.name).toLowerCase();
   946	        if (!exts.has(ext)) continue;
   947	        try {
   948	          const stat = fs.statSync(full);
   949	          assets.push({
   950	            path: full.replace(base, '').replace(/^\//, ''),
   951	            name: entry.name,
   952	            type: ext.replace('.', ''),
   953	            size: stat.size,
   954	            mtime: stat.mtimeMs,
   955	          });
   956	        } catch (_) {}
   957	      }
   958	    } catch (_) {}
   959	  }
   960	  walk(base, 0);
   961	  return assets.sort((a, b) => b.mtime - a.mtime);
   962	}
   963	
   964	app.get('/villa/artifacts', (req, res) => {
   965	  try {
   966	    res.json({ ok: true, artifacts: scanArtifacts() });
   967	  } catch (err) {
   968	    res.status(500).json({ ok: false, error: err.message });
   969	  }
   970	});
   971	
   972	// ── GET /technique-library — scan technique-library folder structure ──────────
   973	app.get('/technique-library', (req, res) => {
   974	  const libDir = path.join(VAULT, '09_Artifacts', 'branding', 'basic-reflex', 'technique-library');
   975	  try {
   976	    const techniques = [];
   977	    for (const entry of fs.readdirSync(libDir, { withFileTypes: true })) {
   978	      if (!entry.isDirectory()) continue;
   979	      const folder = entry.name;
   980	      const folderPath = path.join(libDir, folder);
   981	      if (folder === 'defence') {
   982	        // Recurse one level into defence subfolders
   983	        for (const sub of fs.readdirSync(folderPath, { withFileTypes: true })) {
   984	          if (!sub.isDirectory()) continue;
   985	          const subPath = path.join(folderPath, sub.name);
   986	          const images = fs.readdirSync(subPath).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
   987	          techniques.push({
   988	            id: `defence/${sub.name}`,
   989	            folder: `defence/${sub.name}`,
   990	            domain: 'defence',
   991	            images: images.map(f => `branding/basic-reflex/technique-library/defence/${sub.name}/${f}`),
   992	          });
   993	        }
   994	      } else {
   995	        const images = fs.readdirSync(folderPath).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
   996	        techniques.push({
   997	          id: folder,
   998	          folder,
   999	          domain: 'offence',
  1000	          images: images.map(f => `branding/basic-reflex/technique-library/${folder}/${f}`),
  1001	        });
  1002	      }
  1003	    }
  1004	    // Also pick up root-level images (guard-front.jpg etc)
  1005	    const rootImages = fs.readdirSync(libDir).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
  1006	    if (rootImages.length) {
  1007	      techniques.push({
  1008	        id: '_root',
  1009	        folder: '',
  1010	        domain: 'root',
  1011	        images: rootImages.map(f => `branding/basic-reflex/technique-library/${f}`),
  1012	      });
  1013	    }
  1014	    res.json({ ok: true, techniques });
  1015	  } catch (err) {
  1016	    res.status(500).json({ ok: false, error: err.message });
  1017	  }
  1018	});
  1019	
  1020	// Serve artifact files directly (images, HTML, SVG)
  1021	app.get('/villa/artifact-file', (req, res) => {
  1022	  const relPath = req.query.path;
  1023	  if (!relPath || relPath.includes('..')) return res.status(400).send('invalid path');
  1024	  const full = path.join(VAULT, '09_Artifacts', relPath);
  1025	  if (!fs.existsSync(full)) return res.status(404).send('not found');
  1026	  res.sendFile(full);
  1027	});
  1028	
  1029	// ── Villa static serve ─────────────────────────────────────────────────────────
  1030	// Serve the villa HTML directly from cath-bridge with no-cache headers.
  1031	// This replaces the python3 http.server that has aggressive caching.
  1032	
  1033	app.get('/techniques', (req, res) => {
  1034	  const galleryPath = path.join(HOME, 'Cathedral', 'control-panel', 'technique-gallery.html');
  1035	  try {
  1036	    const html = fs.readFileSync(galleryPath, 'utf8');
  1037	    res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', 'Content-Type': 'text/html; charset=utf-8' });
  1038	    res.send(html);
  1039	  } catch (err) {
  1040	    res.status(500).send(`technique gallery not found: ${err.message}`);
  1041	  }
  1042	});
  1043	
  1044	app.get('/villa', (req, res) => {
  1045	  const villaPath = path.join(HOME, 'Cathedral', 'control-panel', 'index.html');
  1046	  try {
  1047	    const html = fs.readFileSync(villaPath, 'utf8');
  1048	    res.set({
  1049	      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  1050	      'Pragma': 'no-cache',
  1051	      'Expires': '0',
  1052	      'Content-Type': 'text/html; charset=utf-8',
  1053	    });
  1054	    res.send(html);
  1055	  } catch (err) {
  1056	    res.status(500).send(`villa not found: ${err.message}`);
  1057	  }
  1058	});
  1059	
  1060	// ── GET /constellation ────────────────────────────────────────────────────────
  1061	// Returns enriched project registry for the Morning View constellation.
  1062	// Reads registry.json, merges PM2 state, vault card frontmatter, activity scores.
  1063	
  1064	const os = require('os');
  1065	
  1066	app.get('/constellation', async (req, res) => {
  1067	  try {
  1068	    const registryPath = path.join(HOME, 'Cathedral', 'projects', 'registry.json');
  1069	    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  1070	
  1071	    // Get PM2 data
  1072	    let pm2Data = [];
  1073	    try {
  1074	      const { execSync } = require('child_process');
  1075	      const pm2Result = execSync('pm2 jlist', { encoding: 'utf8', timeout: 5000 });
  1076	      pm2Data = JSON.parse(pm2Result);
  1077	    } catch (e) { /* pm2 not available */ }
  1078	
  1079	    // Get cath-state.json
  1080	    let cathState = {};
  1081	    try {
  1082	      const statePath = path.join(HOME, 'Cathedral', 'cath-state.json');
  1083	      cathState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  1084	    } catch (e) {}
  1085	
  1086	    const vaultBase = VAULT;
  1087	
  1088	    // Read project memory.jsonl — last 24h events
  1089	    const MEMORY_DIR = path.join(HOME, 'Cathedral', 'projects', 'memory');
  1090	    function readProjectMemory(projectId) {
  1091	      try {
  1092	        const logPath = path.join(MEMORY_DIR, `${projectId}.jsonl`);
  1093	        if (!fs.existsSync(logPath)) return [];
  1094	        const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
  1095	        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  1096	        const events = [];
  1097	        // Read from end for efficiency — stop when we pass cutoff
  1098	        for (let i = lines.length - 1; i >= 0; i--) {
  1099	          try {
  1100	            const entry = JSON.parse(lines[i]);
  1101	            if (entry.ts < cutoff) break;
  1102	            events.push(entry);
  1103	          } catch (e) {}
  1104	        }
  1105	        return events;
  1106	      } catch (e) { return []; }
  1107	    }
  1108	
  1109	    // Read project card frontmatter
  1110	    function readProjectCard(cardName) {
  1111	      if (!cardName) return null;
  1112	      try {
  1113	        const cardPath = path.join(vaultBase, '08_Project_Orchestrator', 'projects', cardName);
  1114	        const content = fs.readFileSync(cardPath, 'utf8');
  1115	        const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  1116	        if (!fmMatch) return { raw: content.slice(0, 200) };
  1117	        const fm = {};
  1118	        fmMatch[1].split('\n').forEach(line => {
  1119	          const m = line.match(/^(\w[\w-]*)\s*:\s*"?(.+?)"?\s*$/);
  1120	          if (m) fm[m[1]] = m[2];
  1121	        });
  1122	        const body = content.slice(fmMatch[0].length).trim().split('\n').filter(l => l.trim() && !l.startsWith('#'))[0] || '';
  1123	        return { ...fm, body };
  1124	      } catch (e) { return null; }
  1125	    }
  1126	
  1127	    // Compute activity score: PM2 health + vault activity + memory events + status
  1128	    function computeActivity(project) {
  1129	      let score = 0;
  1130	
  1131	      // PM2 process health contributes up to 0.3
  1132	      if (project.pm2_processes && project.pm2_processes.length > 0) {
  1133	        const procs = project.pm2_processes.map(name => pm2Data.find(p => p.name === name)).filter(Boolean);
  1134	        if (procs.length > 0) {
  1135	          const onlineCount = procs.filter(p => p.pm2_env.status === 'online').length;
  1136	          score += (onlineCount / procs.length) * 0.3;
  1137	        }
  1138	      }
  1139	
  1140	      // Vault domain activity contributes up to 0.25
  1141	      if (project.vault_domain) {
  1142	        try {
  1143	          const now = Date.now();
  1144	          const sevenDays = 7 * 24 * 60 * 60 * 1000;
  1145	          const stagingPath = path.join(vaultBase, '00_Staging', project.vault_domain);
  1146	          if (fs.existsSync(stagingPath)) {
  1147	            const files = fs.readdirSync(stagingPath).filter(f => f.endsWith('.md'));
  1148	            let recentCount = 0;
  1149	            for (const f of files.slice(-20)) {
  1150	              try {
  1151	                const stat = fs.statSync(path.join(stagingPath, f));
  1152	                if (now - stat.mtimeMs < sevenDays) recentCount++;
  1153	              } catch (e) {}
  1154	            }
  1155	            score += Math.min(0.25, (recentCount / 10) * 0.25);
  1156	          }
  1157	        } catch (e) {}
  1158	      }
  1159	
  1160	      // Memory events (last 24h) contribute up to 0.3
  1161	      const memEvents = readProjectMemory(project.id);
  1162	      if (memEvents.length > 0) {
  1163	        // 1 event = 0.1, 3+ events = 0.2, 6+ events = 0.3
  1164	        score += Math.min(0.3, memEvents.length * 0.05);
  1165	      }
  1166	
  1167	      // Project card status contributes up to 0.15
  1168	      if (project.status === 'active') score += 0.15;
  1169	      else if (project.status === 'concept') score += 0.08;
  1170	
  1171	      return Math.max(0.05, Math.min(1.0, score));
  1172	    }
  1173	
  1174	    // Build live status string
  1175	    function buildLiveStatus(project) {
  1176	      const parts = [];
  1177	
  1178	      if (project.pm2_processes && project.pm2_processes.length > 0) {
  1179	        const procs = project.pm2_processes.map(name => pm2Data.find(p => p.name === name)).filter(Boolean);
  1180	        if (procs.length > 0) {
  1181	          const online = procs.filter(p => p.pm2_env.status === 'online').length;
  1182	          const errored = procs.filter(p => p.pm2_env.status === 'errored').length;
  1183	          const stopped = procs.filter(p => p.pm2_env.status === 'stopped').length;
  1184	          const statusParts = [];
  1185	          if (online > 0) statusParts.push(`${online} online`);
  1186	          if (errored > 0) statusParts.push(`${errored} errored`);
  1187	          if (stopped > 0) statusParts.push(`${stopped} stopped`);
  1188	          parts.push(statusParts.join(' \u00B7 '));
  1189	
  1190	          const crashLooping = procs.filter(p => p.pm2_env.restart_time > 100);
  1191	          if (crashLooping.length > 0) {
  1192	            parts.push(crashLooping.map(p => `${p.name} crash-looping`).join(', '));
  1193	          }
  1194	        }
  1195	      }
  1196	
  1197	      const card = readProjectCard(project.vault_card);
  1198	      if (card) {
  1199	        if (card['project-status']) parts.push(card['project-status']);
  1200	        else if (card.status) parts.push(card.status);
  1201	        if (card.phase) parts.push(card.phase);
  1202	      }
  1203	
  1204	      if (project.status === 'uncharted') parts.push('uncharted');
  1205	      if (project.status === 'concept') parts.push('concept stage');
  1206	
  1207	      return parts.join(' \u00B7 ') || project.status;
  1208	    }
  1209	
  1210	    // Build briefing for each project
  1211	    function buildBriefing(project) {
  1212	      const card = readProjectCard(project.vault_card);
  1213	      const briefing = { lede: '', body: '', stats: [], action: '' };
  1214	
  1215	      if (project.center) briefing.lede = 'You are here.';
  1216	      else if (project.status === 'uncharted') briefing.lede = 'Not yet mapped.';
  1217	      else if (project.status === 'concept') briefing.lede = 'Concept stage.';
  1218	      else briefing.lede = card?.title || project.name;
  1219	
  1220	      if (card?.body) briefing.body = card.body;
  1221	      else if (project.status === 'uncharted') briefing.body = 'This project exists but has no vault card yet.';
  1222	      else briefing.body = '';
  1223	
  1224	      if (project.pm2_processes && project.pm2_processes.length > 0) {
  1225	        const procs = project.pm2_processes.map(name => pm2Data.find(p => p.name === name)).filter(Boolean);
  1226	        const online = procs.filter(p => p.pm2_env.status === 'online').length;
  1227	        briefing.stats.push(['PROCESSES', `${online}/${procs.length}`]);
  1228	
  1229	        const firstOnline = procs.find(p => p.pm2_env.status === 'online');
  1230	        if (firstOnline) {
  1231	          const uptimeMs = Date.now() - firstOnline.pm2_env.pm_uptime;
  1232	          const days = Math.floor(uptimeMs / (24 * 60 * 60 * 1000));
  1233	          const hours = Math.floor((uptimeMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  1234	          briefing.stats.push(['UPTIME', `${days}d ${hours}h`]);
  1235	        }
  1236	
  1237	        const totalRestarts = procs.reduce((sum, p) => sum + (p.pm2_env.restart_time || 0), 0);
  1238	        if (totalRestarts > 0) briefing.stats.push(['RESTARTS', String(totalRestarts)]);
  1239	      }
  1240	
  1241	      if (card?.['project-status']) briefing.stats.push(['STATUS', card['project-status']]);
  1242	      if (card?.priority) briefing.stats.push(['PRIORITY', card.priority]);
  1243	
  1244	      return briefing;
  1245	    }
  1246	
  1247	    // System-wide stats
  1248	    const pm2Online = pm2Data.filter(p => p.pm2_env.status === 'online').length;
  1249	    const pm2Errored = pm2Data.filter(p => p.pm2_env.status === 'errored').length;
  1250	    const pm2Total = pm2Data.length;
  1251	
  1252	    // Enrich each project
  1253	    const enriched = registry.projects.map(project => {
  1254	      const memEvents = readProjectMemory(project.id);
  1255	      const briefing = buildBriefing(project);
  1256	
  1257	      // Add recent memory events to briefing stats
  1258	      if (memEvents.length > 0) {
  1259	        briefing.stats.push(['EVENTS/24H', String(memEvents.length)]);
  1260	        // Use most recent event as live body if no card body
  1261	        if (!briefing.body && memEvents[0]) {
  1262	          briefing.body = `Last: ${memEvents[0].event}` + (memEvents[0].bridge ? ` — ${memEvents[0].bridge.slice(0, 100)}` : '');
  1263	        }
  1264	      }
  1265	
  1266	      return {
  1267	        id: project.id,
  1268	        code: project.code,
  1269	        name: project.name,
  1270	        kind: project.kind,
  1271	        status: project.status,
  1272	        center: project.center || false,
  1273	        x: project.x,
  1274	        y: project.y,
  1275	        r: project.r,
  1276	        connections: project.connections || [],
  1277	        active: computeActivity(project),
  1278	        live: buildLiveStatus(project),
  1279	        briefing,
  1280	        recentEvents: memEvents.slice(0, 5).map(e => ({ ts: e.ts, event: e.event })),
  1281	      };
  1282	    });
  1283	
  1284	    res.json({
  1285	      ok: true,
  1286	      timestamp: Date.now(),
  1287	      projects: enriched,
  1288	      system: {
  1289	        pm2_online: pm2Online,
  1290	        pm2_errored: pm2Errored,
  1291	        pm2_total: pm2Total,
  1292	        vault_total: cathState?.sight?.total_nuggets || 0,
  1293	        ledger_density: cathState?.ledger?.quality_density || 0,
  1294	        drift_score: cathState?.proprioception?.drift_score || 0,
  1295	        waste_score: cathState?.smell?.waste_score || 0,
  1296	      }
  1297	    });
  1298	  } catch (err) {
  1299	    res.status(500).json({ ok: false, error: err.message });
  1300	  }
  1301	});
  1302	
  1303	// ── Agent Chat: Multi-agent chat system ──────────────────────────────────────
  1304	
  1305	const AGENTS_DIRS = [
  1306	  { dir: path.join(NANOCLAW, 'sages'), type: 'sage', format: 'json' },
  1307	  { dir: path.join(NANOCLAW, 'skins'), type: 'skin', format: 'json' },
  1308	  { dir: path.join(NANOCLAW, 'skins', 'general'), type: 'skin', format: 'json' },
  1309	  { dir: path.join(NANOCLAW, 'skins', 'boxing'), type: 'skin', format: 'json' },
  1310	  { dir: path.join(NANOCLAW, 'skins', 'business'), type: 'skin', format: 'json' },
  1311	  { dir: path.join(HOME, 'Cathedral', 'genius-council', 'characters'), type: 'council', format: 'md' },
  1312	];
  1313	
  1314	function loadAllAgents() {
  1315	  const agents = [];
  1316	  const fs = require('fs');
  1317	
  1318	  for (const src of AGENTS_DIRS) {
  1319	    if (!fs.existsSync(src.dir)) continue;
  1320	    const files = fs.readdirSync(src.dir).filter(f => f.endsWith(src.format === 'json' ? '.json' : '.md'));
  1321	
  1322	    for (const file of files) {
  1323	      try {
  1324	        const content = fs.readFileSync(path.join(src.dir, file), 'utf8');
  1325	
  1326	        if (src.format === 'json') {
  1327	          const data = JSON.parse(content);
  1328	          const sage = data.sage || data;
  1329	          agents.push({
  1330	            id: file.replace(/\.(json|md)$/, ''),
  1331	            name: sage.name || file.replace(/\.(json|md)$/, '').replace(/-/g, ' '),
  1332	            type: src.type,
  1333	            role: sage.designation || sage.lens || sage.type || src.type,
  1334	            model: sage.model || 'hermes3',
  1335	            systemPrompt: sage.voice ? `You are ${sage.name}. ${sage.voice}\n\nCore lens: ${sage.core_lens || sage.lens || ''}` : content,
  1336	            file: path.join(src.dir, file),
  1337	          });
  1338	        } else {
  1339	          // Markdown with frontmatter
  1340	          const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  1341	          let name = file.replace('.md', '').replace(/-/g, ' ');
  1342	          let model = 'hermes3';
  1343	          let role = 'council member';
  1344	
  1345	          if (fmMatch) {
  1346	            const fm = fmMatch[1];
  1347	            const nameMatch = fm.match(/name:\s*(.+)/);
  1348	            const modelMatch = fm.match(/model:\s*(.+)/);
  1349	            const registerMatch = fm.match(/register:\s*(.+)/);
  1350	            if (nameMatch) name = nameMatch[1].trim();
  1351	            if (modelMatch) model = modelMatch[1].trim();
  1352	            if (registerMatch) role = registerMatch[1].trim();
  1353	          }
  1354	
  1355	          const bodyText = fmMatch ? fmMatch[2] : content;
  1356	          agents.push({
  1357	            id: file.replace('.md', ''),
  1358	            name,
  1359	            type: src.type,
  1360	            role,
  1361	            model,
  1362	            systemPrompt: bodyText.trim(),
  1363	            file: path.join(src.dir, file),
  1364	          });
  1365	        }
  1366	      } catch(e) {
  1367	        console.error(`[agents] Error loading ${file}:`, e.message);
  1368	      }
  1369	    }
  1370	  }
  1371	
  1372	  return agents;
  1373	}
  1374	
  1375	app.get('/agents/list', (req, res) => {
  1376	  try {
  1377	    const agents = loadAllAgents();
  1378	    res.json(agents.map(a => ({ id: a.id, name: a.name, type: a.type, role: a.role, model: a.model })));
  1379	  } catch(e) {
  1380	    res.status(500).json({ error: e.message });
  1381	  }
  1382	});
  1383	
  1384	// Load Paul Kernel for agent context injection
  1385	let paulKernel = '';
  1386	try {
  1387	  const kernelPath = path.join(HOME, 'cathedral-vault', '06_Methods', 'paul-kernel.md');
  1388	  if (require('fs').existsSync(kernelPath)) {
  1389	    const raw = require('fs').readFileSync(kernelPath, 'utf8');
  1390	    // Strip frontmatter, keep content
  1391	    paulKernel = raw.replace(/^---[\s\S]*?---\n/, '').trim();
  1392	  }
  1393	} catch(e) { console.error('[agents] Failed to load Paul Kernel:', e.message); }
  1394	
  1395	// Vault search for query context
  1396	async function getVaultContext(query) {
  1397	  try {
  1398	    const searchUrl = `http://localhost:8080/vault/search?q=${encodeURIComponent(query.slice(0, 100))}&top_k=3`;
  1399	    const res = await fetch(searchUrl, { headers: { 'x-api-key': 'cathedral-mcp-2026' }, signal: AbortSignal.timeout(5000) });
  1400	    if (!res.ok) return '';
  1401	    const results = await res.json();
  1402	    if (Array.isArray(results) && results.length > 0) {
  1403	      return '\n\n## VAULT CONTEXT\n' + results.map(r => `[${r.domain || 'vault'}] ${r.title || ''}: ${(r.text || r.first_line || '').slice(0, 200)}`).join('\n');
  1404	    }
  1405	  } catch(e) {}
  1406	  return '';
  1407	}
  1408	
  1409	app.post('/agents/chat', async (req, res) => {
  1410	  const { agent_id, message, history } = req.body;
  1411	  if (!agent_id || !message) return res.status(400).json({ error: 'agent_id and message required' });
  1412	
  1413	  const agents = loadAllAgents();
  1414	  const agent = agents.find(a => a.id === agent_id);
  1415	  if (!agent) return res.status(404).json({ error: `Agent not found: ${agent_id}` });
  1416	
  1417	  try {
  1418	    // Fetch vault context for the question
  1419	    const vaultContext = await getVaultContext(message);
  1420	
  1421	    // Build system prompt: agent character + Paul Kernel + vault context
  1422	    const fullSystemPrompt = agent.systemPrompt +
  1423	      '\n\n---\n\n## WHO YOU ARE SPEAKING TO\n' + paulKernel +
  1424	      vaultContext;
  1425	
  1426	    const messages = [{ role: 'system', content: fullSystemPrompt }];
  1427	    if (history) {
  1428	      for (const h of history.slice(-10)) {
  1429	        messages.push({ role: h.role, content: h.content });
  1430	      }
  1431	    }
  1432	    messages.push({ role: 'user', content: message });
  1433	
  1434	    // Normalize model — anything not locally available falls back to hermes3
  1435	    const localModels = ['hermes3', 'hermes3:latest', 'qwen3:14b', 'nomic-embed-text', 'dolphin3', 'llava'];
  1436	    const model = localModels.some(m => agent.model.includes(m)) ? agent.model : 'hermes3';
  1437	
  1438	    const ollamaRes = await fetch('http://localhost:11434/api/chat', {
  1439	      method: 'POST',
  1440	      headers: { 'Content-Type': 'application/json' },
  1441	      body: JSON.stringify({ model, messages, stream: false, options: { temperature: 0.7, num_predict: 500 } }),
  1442	    });
  1443	
  1444	    const data = await ollamaRes.json();
  1445	    const response = data.message?.content || 'No response';
  1446	
  1447	    res.json({ agent: agent.name, response });
  1448	  } catch(e) {
  1449	    res.status(500).json({ error: `Ollama error: ${e.message}` });
  1450	  }
  1451	});
  1452	
  1453	app.post('/agents/steward', async (req, res) => {
  1454	  const { question, responses } = req.body;
  1455	  if (!question || !responses) return res.status(400).json({ error: 'question and responses required' });
  1456	
  1457	  try {
  1458	    const stewardPrompt = `You are The Steward of the Cathedral Court. Multiple agents just responded to the same question. Your job is to synthesise their responses into four sections.
  1459	
  1460	QUESTION: ${question}
  1461	
  1462	AGENT RESPONSES:
  1463	${responses}
  1464	
  1465	Respond in EXACTLY this JSON format:
  1466	{"consensus": "What most agents agreed on (1-2 sentences)", "tension": "Where they disagreed or saw differently — this is the VALUABLE part (1-2 sentences)", "principle": "If a new principle emerged from the debate, name it in one sentence. If none, say 'None emerged'", "action": "What can be built, done, or decided based on this debate (1 sentence)"}`;
  1467	
  1468	    const ollamaRes = await fetch('http://localhost:11434/api/chat', {
  1469	      method: 'POST',
  1470	      headers: { 'Content-Type': 'application/json' },
  1471	      body: JSON.stringify({
  1472	        model: 'hermes3',
  1473	        messages: [{ role: 'user', content: stewardPrompt }],
  1474	        stream: false,
  1475	        options: { temperature: 0.3, num_predict: 300 },
  1476	      }),
  1477	    });
  1478	
  1479	    const data = await ollamaRes.json();
  1480	    const raw = data.message?.content || '';
  1481	
  1482	    // Extract JSON from response
  1483	    const jsonMatch = raw.match(/\{[\s\S]*"consensus"[\s\S]*\}/);
  1484	    if (jsonMatch) {
  1485	      res.json(JSON.parse(jsonMatch[0]));
  1486	    } else {
  1487	      res.json({ consensus: raw.slice(0, 200), tension: '', principle: '', action: '' });
  1488	    }
  1489	  } catch(e) {
  1490	    res.status(500).json({ error: e.message });
  1491	  }
  1492	});
  1493	
  1494	app.get('/agents/ui', (req, res) => {
  1495	  res.sendFile(path.join(NANOCLAW, 'agent-chat.html'));
  1496	});
  1497	
  1498	app.get('/agents/guide', (req, res) => {
  1499	  res.sendFile(path.join(NANOCLAW, 'agent-guide.html'));
  1500	});
  1501	
  1502	// ── Architect Plans ──────────────────────────────────────────────────────────
  1503	
  1504	app.get('/architect', (req, res) => {
  1505	  const dir = path.join(NANOCLAW, 'architect-output');
  1506	  const fs = require('fs');
  1507	  try {
  1508	    const files = fs.readdirSync(dir).filter(f => f.endsWith('.html')).sort().reverse();
  1509	    if (files.length === 0) return res.send('<h1>No architect plans yet</h1>');
  1510	    // Serve most recent by default
  1511	    res.sendFile(path.join(dir, files[0]));
  1512	  } catch (e) {
  1513	    res.status(500).send('Architect output dir not found');
  1514	  }
  1515	});
  1516	
  1517	app.get('/architect/:slug', (req, res) => {
  1518	  const fs = require('fs');
  1519	  const dir = path.join(NANOCLAW, 'architect-output');
  1520	  const files = fs.readdirSync(dir).filter(f => f.startsWith(req.params.slug) && f.endsWith('.html'));
  1521	  if (files.length === 0) return res.status(404).send('Plan not found');
  1522	  res.sendFile(path.join(dir, files[files.length - 1]));
  1523	});
  1524	
  1525	// ── Trading Hub ──────────────────────────────────────────────────────────────
  1526	
  1527	app.get('/trader/hub', (req, res) => {
  1528	  res.sendFile(path.join(NANOCLAW, 'trader', 'trading-hub.html'));
  1529	});
  1530	
  1531	app.get('/trader/explainer', (req, res) => {
  1532	  res.sendFile(path.join(NANOCLAW, 'trader', 'trading-explainer.html'));
  1533	});
  1534	
  1535	app.get('/trader/signals', (req, res) => {
  1536	  const fp = path.join(NANOCLAW, 'trader', 'signals', 'crypto-signals-latest.json');
  1537	  if (!require('fs').existsSync(fp)) return res.status(404).json({ error: 'No signals yet' });
  1538	  res.json(JSON.parse(require('fs').readFileSync(fp, 'utf8')));
  1539	});
  1540	
  1541	app.get('/trader/latest-debate', (req, res) => {
  1542	  try {
  1543	    const Database = require('better-sqlite3');
  1544	    const db = new Database(path.join(NANOCLAW, 'trader', 'logs', 'trades.db'));
  1545	    const row = db.prepare('SELECT * FROM decisions ORDER BY id DESC LIMIT 1').get();
  1546	    db.close();
  1547	    if (row) return res.json(row);
  1548	    res.status(404).json({ error: 'No decisions yet' });
  1549	  } catch(e) {
  1550	    res.status(404).json({ error: 'No trades database yet' });
  1551	  }
  1552	});
  1553	
  1554	app.get('/trader/portfolio', (req, res) => {
  1555	  const fp = path.join(NANOCLAW, 'trader', 'portfolio.json');
  1556	  if (!require('fs').existsSync(fp)) return res.status(404).json({ error: 'No portfolio' });
  1557	  res.json(JSON.parse(require('fs').readFileSync(fp, 'utf8')));
  1558	});
  1559	
  1560	app.get('/trader/positions', (req, res) => {
  1561	  try {
  1562	    const Database = require('better-sqlite3');
  1563	    const db = new Database(path.join(NANOCLAW, 'trader', 'logs', 'trades.db'));
  1564	    const open = db.prepare('SELECT * FROM trades WHERE status = ?').all('open');
  1565	    const closed = db.prepare('SELECT * FROM trades WHERE status = ? ORDER BY closed_at DESC LIMIT 20').all('closed');
  1566	    db.close();
  1567	    res.json({ open, closed });
  1568	  } catch(e) {
  1569	    res.json({ open: [], closed: [] });
  1570	  }
  1571	});
  1572	
  1573	app.get('/trader/performance', (req, res) => {
  1574	  try {
  1575	    const Database = require('better-sqlite3');
  1576	    const db = new Database(path.join(NANOCLAW, 'trader', 'logs', 'trades.db'));
  1577	    const perf = db.prepare(`
  1578	      SELECT
  1579	        COUNT(*) as total_trades,
  1580	        SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
  1581	        SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END) as losses,
  1582	        ROUND(100.0 * SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) / MAX(COUNT(*), 1), 1) as win_rate,
  1583	        ROUND(SUM(pnl), 2) as total_pnl,
  1584	        ROUND(AVG(pnl), 2) as avg_pnl,
  1585	        ROUND(MAX(pnl), 2) as best_trade,
  1586	        ROUND(MIN(pnl), 2) as worst_trade
  1587	      FROM trades WHERE status = 'closed'
  1588	    `).get();
  1589	    const decisions = db.prepare('SELECT * FROM decisions ORDER BY id DESC LIMIT 10').all();
  1590	    const signals = db.prepare('SELECT * FROM signals ORDER BY id DESC LIMIT 20').all();
  1591	    // Strategy leaderboard
  1592	    const strategies = db.prepare(`
  1593	      SELECT
  1594	        strategy,
  1595	        COUNT(*) as total,
  1596	        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_count,
  1597	        SUM(CASE WHEN status = 'closed' AND pnl > 0 THEN 1 ELSE 0 END) as wins,
  1598	        SUM(CASE WHEN status = 'closed' AND pnl <= 0 THEN 1 ELSE 0 END) as losses,
  1599	        ROUND(100.0 * SUM(CASE WHEN status = 'closed' AND pnl > 0 THEN 1 ELSE 0 END) / MAX(SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END), 1), 1) as win_rate,
  1600	        ROUND(SUM(CASE WHEN status = 'closed' THEN pnl ELSE 0 END), 2) as total_pnl,
  1601	        ROUND(AVG(CASE WHEN status = 'closed' THEN pnl_pct ELSE NULL END), 4) as avg_return
  1602	      FROM trades
  1603	      GROUP BY strategy
  1604	      ORDER BY total_pnl DESC
  1605	    `).all();
  1606	    // Decision counts by strategy (signals that led to debate)
  1607	    const decisionStats = db.prepare(`
  1608	      SELECT
  1609	        asset,
  1610	        action,
  1611	        COUNT(*) as count
  1612	      FROM decisions
  1613	      GROUP BY asset, action
  1614	    `).all();
  1615	    db.close();
  1616	    res.json({ perf, decisions, signals, strategies, decisionStats });
  1617	  } catch(e) {
  1618	    res.json({ perf: null, decisions: [], signals: [], strategies: [], decisionStats: [] });
  1619	  }
  1620	});
  1621	
  1622	// ── Intelligence Hub: Scraper endpoints ──────────────────────────────────────
  1623	
  1624	const SCRAPER_OUTPUTS = path.join(NANOCLAW, 'scraper', 'outputs');
  1625	
  1626	app.get('/scraper/dashboard', (req, res) => {
  1627	  try {
  1628	    const configPath = path.join(NANOCLAW, 'scraper', 'config.json');
  1629	    const config = JSON.parse(require('fs').readFileSync(configPath, 'utf8'));
  1630	    const data = { generated: new Date().toISOString(), targets: {} };
  1631	
  1632	    const outputMap = {
  1633	      hk_sentiment: 'sentiment-latest.json',
  1634	      competitor_gyms: 'competitors-latest.json',
  1635	      pubmed_science: 'science-latest.json',
  1636	      myth_watch: 'myths-latest.json',
  1637	      fight_data: 'fight-content-latest.json',
  1638	      content_gaps: 'fight-content-latest.json',
  1639	      corporate_leads: 'leads-grants-latest.json',
  1640	      grants: 'leads-grants-latest.json',
  1641	      reviews: 'reviews-sport-latest.json',
  1642	      cross_sport: 'reviews-sport-latest.json',
  1643	    };
  1644	
  1645	    for (const [name, target] of Object.entries(config.targets)) {
  1646	      const file = outputMap[name];
  1647	      const filepath = file ? path.join(SCRAPER_OUTPUTS, file) : null;
  1648	      let output = null;
  1649	      let stat = null;
  1650	      if (filepath && require('fs').existsSync(filepath)) {
  1651	        try {
  1652	          output = JSON.parse(require('fs').readFileSync(filepath, 'utf8'));
  1653	          stat = require('fs').statSync(filepath);
  1654	        } catch {}
  1655	      }
  1656	      data.targets[name] = {
  1657	        enabled: target.enabled,
  1658	        cron: target.cron_hkt,
  1659	        lastRun: output?.date || null,
  1660	        lastModified: stat?.mtime?.toISOString() || null,
  1661	        hasData: !!output,
  1662	      };
  1663	    }
  1664	    res.json(data);
  1665	  } catch (e) {
  1666	    res.status(500).json({ error: e.message });
  1667	  }
  1668	});
  1669	
  1670	app.get('/scraper/output/:filename', (req, res) => {
  1671	  const filepath = path.join(SCRAPER_OUTPUTS, req.params.filename);
  1672	  if (!require('fs').existsSync(filepath)) return res.status(404).json({ error: 'Not found' });
  1673	  try {
  1674	    res.json(JSON.parse(require('fs').readFileSync(filepath, 'utf8')));
  1675	  } catch (e) {
  1676	    res.status(500).json({ error: e.message });
  1677	  }
  1678	});
  1679	
  1680	app.get('/scraper/hub', (req, res) => {
  1681	  const hubPath = path.join(NANOCLAW, 'scraper', 'intelligence-hub.html');
  1682	  res.sendFile(hubPath);
  1683	});
  1684	
  1685	// ── Reed's Slides ────────────────────────────────────────────────────────────
  1686	app.get('/reed-slides', (req, res) => {
  1687	  res.sendFile(path.join(NANOCLAW, 'reed-lab', 'slides-gallery.html'));
  1688	});
  1689	app.get('/reed-slides/deck', (req, res) => {
  1690	  const deckPath = path.join(NANOCLAW, 'reed-lab', 'deck.json');
  1691	  if (fs.existsSync(deckPath)) return res.json(JSON.parse(fs.readFileSync(deckPath, 'utf8')));
  1692	  res.json([]);
  1693	});
  1694	app.get('/reed-slides/card-project', (req, res) => {
  1695	  // Read vault project card for a deck card
  1696	  const cardId = parseInt(req.query.id);
  1697	  if (!cardId) return res.status(400).json({ error: 'Need ?id=N' });
  1698	  const deckPath = path.join(NANOCLAW, 'reed-lab', 'deck.json');
  1699	  if (!fs.existsSync(deckPath)) return res.status(404).json({ error: 'No deck' });
  1700	  const deck = JSON.parse(fs.readFileSync(deckPath, 'utf8'));
  1701	  const card = deck.find(c => c.id === cardId);
  1702	  if (!card) return res.status(404).json({ error: 'Card not found' });
  1703	  if (!card.project_card) return res.json({ card_id: cardId, has_project: false });
  1704	
  1705	  const vaultPath = path.join(process.env.HOME || '/Users/basicclaw777', 'cathedral-vault', card.project_card);
  1706	  if (!fs.existsSync(vaultPath)) return res.json({ card_id: cardId, has_project: false, path: card.project_card });
  1707	
  1708	  const text = fs.readFileSync(vaultPath, 'utf8');
  1709	  const fm = {};
  1710	  const fmMatch = text.match(/^---\n([\s\S]*?)\n---/);
  1711	  if (fmMatch) {
  1712	    for (const line of fmMatch[1].split('\n')) {
  1713	      const kv = line.match(/^([^:]+):\s*"?([^"]*)"?\s*$/);
  1714	      if (kv) fm[kv[1].trim()] = kv[2].trim();
  1715	    }
  1716	  }
  1717	  res.json({
  1718	    card_id: cardId,
  1719	    has_project: true,
  1720	    path: card.project_card,
  1721	    title: fm.title || '',
  1722	    status: fm['project-status'] || '',
  1723	    priority: fm['project-priority'] || '',
  1724	    next_action: fm['project-next-action'] || '',
  1725	    last_updated: fm['project-last-updated'] || '',
  1726	    blocked_by: fm['project-blocked-by'] || '',
  1727	    domain: fm['project-domain'] || '',
  1728	  });
  1729	});
  1730	app.get('/reed-slides/missing-connections', (req, res) => {
  1731	  const fp = path.join(NANOCLAW, 'reed-lab', 'missing-connections.json');
  1732	  if (fs.existsSync(fp)) return res.json(JSON.parse(fs.readFileSync(fp, 'utf8')));
  1733	  res.json({ missing: [] });
  1734	});
  1735	app.get('/reed-slides/card-image', (req, res) => {
  1736	  const file = req.query.file;
  1737	  if (!file || file.includes('..')) return res.status(400).send('Bad request');
  1738	  const fp = path.join(NANOCLAW, 'reed-lab', 'slides', 'card-images', file);
  1739	  if (fs.existsSync(fp)) return res.sendFile(fp);
  1740	  res.status(404).send('Not found');
  1741	});
  1742	app.get('/reed-slides/catalogue', (req, res) => {
  1743	  const catPath = path.join(NANOCLAW, 'reed-lab', 'slides', 'catalogue.json');
  1744	  if (fs.existsSync(catPath)) return res.json(JSON.parse(fs.readFileSync(catPath, 'utf8')));
  1745	  res.json([]);
  1746	});
  1747	
  1748	// ── Reed's Studio ────────────────────────────────────────────────────────────
  1749	app.get('/reed-studio', (req, res) => {
  1750	  res.sendFile(path.join(NANOCLAW, 'reed-lab', 'studio.html'));
  1751	});
  1752	app.get('/reed-lab/catalogue', (req, res) => {
  1753	  const catPath = path.join(NANOCLAW, 'reed-lab', 'catalogue.json');
  1754	  if (fs.existsSync(catPath)) return res.json(JSON.parse(fs.readFileSync(catPath, 'utf8')));
  1755	  res.json({ photos: [], generations: [], stats: { total_generated: 0, by_style: {} } });
  1756	});
  1757	app.get('/reed-lab/shots', (req, res) => {
  1758	  const shotPath = path.join(NANOCLAW, 'reed-lab', 'shot-list.json');
  1759	  if (fs.existsSync(shotPath)) return res.json(JSON.parse(fs.readFileSync(shotPath, 'utf8')));
  1760	  res.json({ assignments: [], full_list: [] });
  1761	});
  1762	app.get('/reed-lab/image', (req, res) => {
  1763	  const imgPath = req.query.path;
  1764	  if (!imgPath || !imgPath.startsWith(path.join(process.env.HOME))) return res.status(400).send('Bad path');
  1765	  if (!fs.existsSync(imgPath)) return res.status(404).send('Not found');
  1766	  res.sendFile(imgPath);
  1767	});
  1768	
  1769	app.get('/reed-lab/digest', (req, res) => {
  1770	  const today = new Date().toISOString().slice(0, 10);
  1771	  const digestPath = path.join(NANOCLAW, 'reed-lab', `roundtable-digest-${today}.html`);
  1772	  // Try today, else find latest
  1773	  if (fs.existsSync(digestPath)) return res.sendFile(digestPath);
  1774	  const files = fs.readdirSync(path.join(NANOCLAW, 'reed-lab'))
  1775	    .filter(f => f.startsWith('roundtable-digest-') && f.endsWith('.html'))
  1776	    .sort().reverse();
  1777	  if (files.length > 0) return res.sendFile(path.join(NANOCLAW, 'reed-lab', files[0]));
  1778	  res.status(404).send('No digest yet. Run /digest on Telegram.');
  1779	});
  1780	
  1781	// ── Start ─────────────────────────────────────────────────────────────────────
  1782	
  1783	app.listen(PORT, '127.0.0.1', () => {
  1784	  console.log(`[cath-bridge] listening on http://127.0.0.1:${PORT}`);
  1785	});
```

## FILE: reed-lab/daily-lab.js (485 lines — visual production lab)
```javascript
     1	import fs from 'fs';
     2	import path from 'path';
     3	import { execSync } from 'child_process';
     4	import 'dotenv/config';
     5	
     6	const INBOX = path.join(process.env.HOME, 'nanoclaw', 'reed-inbox');
     7	const CALIBRATION = path.join(process.env.HOME, 'Downloads', 'upgraded standard');
     8	const OUTPUT_DIR = path.join(process.env.HOME, 'cathedral-vault', '09_Artifacts', 'branding', 'basic-reflex', 'reed-lab');
     9	const CATALOGUE = path.join(process.env.HOME, 'nanoclaw', 'reed-lab', 'catalogue.json');
    10	const SHOT_LIST = path.join(process.env.HOME, 'nanoclaw', 'reed-lab', 'shot-list.json');
    11	const TOKEN = process.env.TELEGRAM_TOKEN;
    12	const CHAT_ID = process.env.PAUL_CHAT_ID;
    13	
    14	const SOUL_ID = '2a825762-9d13-4d93-9324-32fe5d5db803'; // Cloud Whisperer (Paul/Logan)
    15	
    16	// ── PROVEN RECIPES (image-to-image, need source photo) ──────────────────────
    17	const RECIPES = {
    18	  pro_photo: {
    19	    name: 'Pro Photo', model: 'nano_banana_2', aspect: '16:9',
    20	    prompt: 'Apply a high-end commercial retouch. Maintain 100% preservation of subject identity, poses, clothing, and all background elements. 16:9 cinematic. Sony A7R V, 70mm lens, deep crisp focus throughout. Soft directional key light from camera-left, diminish harsh overhead fluorescents. Warm golden sports documentary color grade. Saturate wall posters and artwork. Enhance wood floor grain and leather bag textures with age patina. Subtle vignette. Natural skin tones. No hallucinations, do not add or remove objects or people. Professional Lightroom grade of original raw file.'
    21	  },
    22	  manga: {
    23	    name: 'Manga', model: 'nano_banana_2', aspect: '3:4',
    24	    prompt: 'Convert this photograph into a detailed manga illustration. Warm sepia and earth tones with golden light rays through windows. Ink-style cross-hatching and clean linework. Preserve all architectural details, equipment placement, brand text (Lonsdale, Basic Reflex), and wall posters exactly. Enhance foreground detail: gym bags, gloves, rope, floor texture. Professional manga environment art quality. Do not add or remove any people. Convert only what exists in the photo.'
    25	  },
    26	  noir: {
    27	    name: 'Film Noir', model: 'nano_banana_2', aspect: '16:9',
    28	    prompt: 'Film noir boxing photograph. Pure black and white with deep inky shadows. 1940s fight night atmosphere. Single harsh overhead light creating dramatic pools of light and shadow. Film grain, slight motion blur on the punch. Smoky atmosphere. Preserve subject identity and pose exactly. Classic noir cinematography, high contrast, no midtones.'
    29	  },
    30	  ippo: {
    31	    name: 'Ippo Shonen', model: 'nano_banana_2', aspect: '3:4',
    32	    prompt: 'Japanese boxing manga panel in the style of Hajime no Ippo. Dynamic action lines radiating from the punch impact. Speed lines, motion blur on fists. Bold ink outlines, screentone shading. Dramatic low angle. Sweat droplets frozen mid-air. Japanese sound effect text near impact. Professional weekly shonen manga quality. Preserve exact poses and gym environment.'
    33	  },
    34	  neon: {
    35	    name: 'HK Neon', model: 'nano_banana_2', aspect: '16:9',
    36	    prompt: 'Hong Kong cyberpunk boxing gym. Neon signs reflecting off rain-slicked floors in pink, blue, and amber. Chinese characters glowing on walls. Atmospheric fog catching neon light. Dark moody shadows with electric color pops. Blade Runner meets boxing gym. Preserve subject identity and pose. Cinematic 2.39:1 anamorphic feel.'
    37	  },
    38	  dramatic: {
    39	    name: 'Dramatic Cinema', model: 'nano_banana_2', aspect: '16:9',
    40	    prompt: 'Dramatic cinematic reimagining. Volumetric haze and atmospheric fog filling the gym. Golden god rays streaming through windows. Heavy chiaroscuro lighting with deep shadows. Film grain texture. Preserve subject identity and pose but add dramatic atmosphere: backlit silhouette depth, warm amber tones, dust particles in light beams. Boxing gym atmosphere. Sports documentary cinematography at golden hour.'
    41	  },
    42	  poster: {
    43	    name: '70s Fight Poster', model: 'nano_banana_2', aspect: '3:4',
    44	    prompt: 'Vintage 1970s boxing fight poster. Aged yellowed paper texture with fold creases. Bold sans-serif typography at top: BASIC REFLEX. Halftone dot printing effect. Red, black, and cream color palette. Retro sports illustration style inspired by Muhammad Ali era fight posters. Border frame with decorative corners. Preserve subject identity and action pose.'
    45	  },
    46	  // Video from photo
    47	  video_cinematic: {
    48	    name: 'Cinematic Video', model: 'seedance_2_0', aspect: '16:9', type: 'video',
    49	    prompt: 'Subtle cinematic motion. Camera slowly pushes in. Atmospheric lighting shifts — dust particles drift through warm light beams. Leather bag sways gently. Documentary feel, film grain.'
    50	  },
    51	  video_dramatic: {
    52	    name: 'Dramatic Video', model: 'seedance_2_0', aspect: '16:9', type: 'video',
    53	    prompt: 'Dramatic slow-motion boxing movement. Volumetric haze drifts across gym. Light rays shift through windows. Sweat droplets catch the light. Epic sports documentary cinematography.'
    54	  },
    55	  // Instagram stories/reels (9:16)
    56	  reel_noir: {
    57	    name: 'Noir Reel', model: 'nano_banana_2', aspect: '9:16',
    58	    prompt: 'Film noir boxing photograph. Pure black and white with deep inky shadows. 1940s fight night atmosphere. Single harsh overhead light. Film grain, smoky atmosphere. Preserve subject identity and pose exactly. Vertical composition for mobile viewing. High contrast, no midtones.'
    59	  },
    60	  reel_neon: {
    61	    name: 'Neon Reel', model: 'nano_banana_2', aspect: '9:16',
    62	    prompt: 'Hong Kong cyberpunk boxing gym. Neon signs reflecting in pink, blue, and amber. Chinese characters glowing. Atmospheric fog catching neon light. Dark moody shadows with electric color pops. Vertical mobile composition. Cinematic depth.'
    63	  }
    64	};
    65	
    66	// ── GENERATIVE RECIPES (no source photo needed — creates from prompt) ────────
    67	const GENERATIVE_SCENES = [
    68	  {
    69	    name: 'Logan — Victoria Peak sunrise',
    70	    model: 'text2image_soul_v2', useSoul: true,
    71	    prompt: 'Athletic man with long dreadlocks standing on Victoria Peak at sunrise, Hong Kong skyline behind, morning golden light, wearing deep maroon athletic shirt with BR logo on left chest, black boxing shorts with white trim, contemplative pose looking over the city. Cinematic 16:9, sports documentary feel.',
    72	    aspect: '16:9'
    73	  },
    74	  {
    75	    name: 'Logan — Heavy bag work',
    76	    model: 'text2image_soul_v2', useSoul: true,
    77	    prompt: 'Athletic man with long dreadlocks and full beard throwing a powerful cross at a heavy Lonsdale leather bag in a Hong Kong boxing gym. Wearing deep maroon athletic shirt, black shorts. Sweat, focus, mid-impact. Warm directional lighting. Sports documentary cinematography.',
    78	    aspect: '16:9'
    79	  },
    80	  {
    81	    name: 'Logan — Shadow boxing at dawn',
    82	    model: 'text2image_soul_v2', useSoul: true,
    83	    prompt: 'Athletic man with long dreadlocks shadow boxing alone in an empty boxing gym at dawn. Golden morning light streaming through industrial windows. Wearing deep maroon shirt, black shorts. Meditative focus. Dust particles in light beams. Cinematic.',
    84	    aspect: '16:9'
    85	  },
    86	  {
    87	    name: 'Logan — Coaching moment',
    88	    model: 'text2image_soul_v2', useSoul: true,
    89	    prompt: 'Athletic man with long dreadlocks and beard coaching a student on boxing technique in a Hong Kong gym. Adjusting their stance with one hand, explaining with the other. BASIC posters on concrete walls behind. Warm golden light. Sports documentary feel.',
    90	    aspect: '16:9'
    91	  },
    92	  {
    93	    name: 'Logan — Neon Hong Kong streets',
    94	    model: 'text2image_soul_v2', useSoul: true,
    95	    prompt: 'Athletic man with long dreadlocks walking through neon-lit Hong Kong streets at night. Wearing maroon athletic shirt. Chinese neon signs reflected in wet pavement. Pink, blue, amber glow. Cinematic cyberpunk atmosphere. Blade Runner meets boxing.',
    96	    aspect: '16:9'
    97	  },
    98	  {
    99	    name: 'Gym — Empty golden hour',
   100	    model: 'nano_banana_2', useSoul: false,
   101	    prompt: 'Empty Hong Kong boxing gym at golden hour. Five Lonsdale leather heavy bags hanging from chains. Concrete walls with colorful BASIC REFLEX posters. Golden light streaming through industrial windows casting long shadows on wood floor. Atmospheric, warm, inviting. Sports documentary photography.',
   102	    aspect: '16:9'
   103	  },
   104	  {
   105	    name: 'Gym — Noir atmosphere',
   106	    model: 'nano_banana_2', useSoul: false,
   107	    prompt: 'Empty boxing gym in pure black and white. Single overhead light. Heavy bags as dark silhouettes. Film grain. Smoky atmosphere. Noir cinematography. The space between rounds.',
   108	    aspect: '16:9'
   109	  },
   110	  {
   111	    name: 'Logan — Manga cover',
   112	    model: 'text2image_soul_v2', useSoul: true,
   113	    prompt: 'Manga cover art. Athletic man with long dreadlocks in fighting stance, fists wrapped, wearing maroon shirt with BR logo. Dynamic action pose with speed lines and Japanese text effects. Bold ink outlines, screentone shading. Title space at top. Professional weekly shonen manga quality.',
   114	    aspect: '3:4'
   115	  }
   116	];
   117	
   118	// ── EXPERIMENTAL RECIPES (rotate one new idea per night) ─────────────────────
   119	const EXPERIMENTAL = [
   120	  { name: 'Watercolor', aspect: '16:9', prompt: 'Watercolor painting of a boxing scene. Wet-on-wet technique, paint bleeding at edges, visible paper texture. Loose brushwork with areas of rich pigment and areas of bare paper. Soft edges on movement, sharp edges on faces. Cool blues and warm ambers. Gallery quality watercolor.' },
   121	  { name: 'Ukiyo-e Woodblock', aspect: '3:4', prompt: 'Japanese ukiyo-e woodblock print of a boxing scene. Flat color areas with bold black outlines. Traditional Japanese composition with diagonal energy. Waves and cloud patterns in background. Limited color palette: indigo, vermillion, ochre, black. Visible wood grain texture in print.' },
   122	  { name: 'Street Art Mural', aspect: '16:9', prompt: 'Street art mural on a concrete wall. Spray paint texture, drips, stencil layers. Bold colors — red, black, gold. Mixed media: wheat-paste elements, tags, throw-ups. Urban grit meets boxing power. Hong Kong back alley wall.' },
   123	  { name: 'Sports Illustrated Cover', aspect: '3:4', prompt: 'Sports Illustrated magazine cover. Clean white border. Bold red SI logo space at top. Dramatic sports photography — frozen action, sharp focus on subject, slightly blurred background. Professional editorial lighting. Cover line text space at bottom. Glossy magazine quality.' },
   124	  { name: 'Double Exposure', aspect: '16:9', prompt: 'Double exposure photograph. Boxer silhouette filled with Hong Kong cityscape — neon signs, harbor, skyscrapers. Second exposure bleeds at edges. Moody blue and amber tones. Film photography aesthetic. Conceptual art meets sports.' },
   125	  { name: 'Risograph Print', aspect: '3:4', prompt: 'Risograph print of boxing scene. Limited 3-color separation: fluorescent pink, deep blue, bright yellow. Visible halftone dots, slight misregistration between layers. Textured paper stock. Indie zine aesthetic. Bold graphic design.' },
   126	  { name: 'Renaissance Fresco', aspect: '16:9', prompt: 'Renaissance fresco painting of a boxing scene. Cracked plaster texture. Michelangelo-style muscular anatomy. Dramatic foreshortening. Classical composition with golden ratio. Earthy pigments: terre verte, burnt sienna, ultramarine. Cathedral ceiling perspective.' },
   127	  { name: 'Synthwave', aspect: '16:9', prompt: 'Synthwave retrowave boxing scene. Neon grid floor, purple and pink sunset gradient sky behind gym. Chrome reflections, VHS scanlines, lens flare. 1980s aesthetic. Glowing outlines on figures. Retrofuturistic Hong Kong.' },
   128	  { name: 'Ink Wash', aspect: '16:9', prompt: 'Chinese ink wash painting (sumi-e) of boxing. Minimalist brushstrokes — black ink on rice paper. Negative space as compositional element. Few precise strokes capture the essence of the punch. Red seal stamp in corner. Zen calligraphy aesthetic.' },
   129	  { name: 'Polaroid Memory', aspect: '1:1', prompt: 'Vintage Polaroid photograph. White border frame. Slightly overexposed, warm color shift, soft focus at edges. Nostalgic faded colors. Natural candid moment in the gym. The feel of a photo found in a shoebox. Square format.' },
   130	];
   131	
   132	// Nightly: proven styles + 1 experimental + 1 video + 1 generative scene
   133	const NIGHTLY_STYLES = ['pro_photo', 'noir', 'dramatic'];
   134	const WEEKLY_BONUS = ['ippo', 'neon', 'manga', 'poster']; // Sunday gets all
   135	
   136	function loadCatalogue() {
   137	  if (fs.existsSync(CATALOGUE)) return JSON.parse(fs.readFileSync(CATALOGUE, 'utf8'));
   138	  return { photos: [], generations: [], stats: { total_generated: 0, by_style: {} } };
   139	}
   140	
   141	function saveCatalogue(cat) {
   142	  fs.writeFileSync(CATALOGUE, JSON.stringify(cat, null, 2));
   143	}
   144	
   145	function getNewPhotos() {
   146	  const photos = [];
   147	  if (fs.existsSync(INBOX)) {
   148	    const files = fs.readdirSync(INBOX).filter(f => /\.(jpg|jpeg|png|heic)$/i.test(f));
   149	    photos.push(...files.map(f => path.join(INBOX, f)));
   150	  }
   151	  return photos;
   152	}
   153	
   154	function getRandomCalibration(catalogue) {
   155	  if (!fs.existsSync(CALIBRATION)) return null;
   156	  const originals = fs.readdirSync(CALIBRATION).filter(f => f.startsWith('origonal'));
   157	  const unused = originals.filter(f => {
   158	    const full = path.join(CALIBRATION, f);
   159	    return !catalogue.photos.some(p => p.source === full && p.fully_processed);
   160	  });
   161	  if (unused.length === 0) return null;
   162	  return path.join(CALIBRATION, unused[Math.floor(Math.random() * unused.length)]);
   163	}
   164	
   165	function upscaleIfNeeded(imgPath) {
   166	  const dimInfo = execSync(`sips -g pixelWidth -g pixelHeight "${imgPath}"`, { encoding: 'utf-8' });
   167	  const pw = parseInt(dimInfo.match(/pixelWidth:\s*(\d+)/)?.[1] || '0');
   168	  const ph = parseInt(dimInfo.match(/pixelHeight:\s*(\d+)/)?.[1] || '0');
   169	  if (Math.max(pw, ph) < 700) {
   170	    const scale = Math.ceil(1400 / Math.max(pw, ph));
   171	    const upscaled = imgPath.replace(/(\.\w+)$/, `-upscaled$1`);
   172	    execSync(`sips --resampleWidth ${pw * scale} "${imgPath}" --out "${upscaled}"`, { timeout: 10000 });
   173	    console.log(`[reed-lab] Upscaled ${pw}x${ph} -> ${pw * scale}px`);
   174	    return upscaled;
   175	  }
   176	  return imgPath;
   177	}
   178	
   179	function generate(imgPath, recipe) {
   180	  const model = recipe.model || 'nano_banana_2';
   181	  const isVideo = recipe.type === 'video';
   182	  let cmd;
   183	
   184	  if (isVideo) {
   185	    cmd = `higgsfield generate create ${model} --prompt "${recipe.prompt}" --start-image "${imgPath}" --duration 5 --aspect_ratio ${recipe.aspect} --wait`;
   186	  } else {
   187	    cmd = `higgsfield generate create ${model} --prompt "${recipe.prompt}" --image "${imgPath}" --aspect_ratio ${recipe.aspect} --resolution 2k --wait`;
   188	  }
   189	
   190	  try {
   191	    const result = execSync(cmd, { encoding: 'utf-8', timeout: 600000 }).trim();
   192	    if (result.startsWith('http')) return result;
   193	    // Check for job ID (failed status)
   194	    if (result.includes('failed')) { console.error(`[reed-lab] Generation failed: ${result}`); return null; }
   195	    console.error(`[reed-lab] Unexpected result: ${result.slice(0, 100)}`);
   196	    return null;
   197	  } catch (err) {
   198	    console.error(`[reed-lab] Generation failed: ${err.message.slice(0, 100)}`);
   199	    return null;
   200	  }
   201	}
   202	
   203	function generateFromPrompt(scene) {
   204	  const model = scene.model || 'nano_banana_2';
   205	  let cmd;
   206	
   207	  if (scene.useSoul) {
   208	    cmd = `higgsfield generate create ${model} --prompt "${scene.prompt}" --soul-id ${SOUL_ID} --aspect_ratio ${scene.aspect} --wait`;
   209	  } else {
   210	    cmd = `higgsfield generate create ${model} --prompt "${scene.prompt}" --aspect_ratio ${scene.aspect} --resolution 2k --wait`;
   211	  }
   212	
   213	  try {
   214	    const result = execSync(cmd, { encoding: 'utf-8', timeout: 600000 }).trim();
   215	    if (result.startsWith('http')) return result;
   216	    if (result.includes('failed')) { console.error(`[reed-lab] Scene failed: ${result}`); return null; }
   217	    return null;
   218	  } catch (err) {
   219	    console.error(`[reed-lab] Scene failed: ${err.message.slice(0, 100)}`);
   220	    return null;
   221	  }
   222	}
   223	
   224	function downloadAndSave(url, sourceName, styleName) {
   225	  const dateStr = new Date().toISOString().slice(0, 10);
   226	  const safeName = sourceName.replace(/[^a-zA-Z0-9-]/g, '_');
   227	  const filename = `${dateStr}_${safeName}_${styleName}.jpg`;
   228	  const outDir = path.join(OUTPUT_DIR, dateStr);
   229	  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
   230	  const outPath = path.join(outDir, filename);
   231	  const tmpPng = `/tmp/reed-lab-${Date.now()}.png`;
   232	  execSync(`curl -sL "${url}" -o "${tmpPng}"`, { timeout: 60000 });
   233	  execSync(`sips -s format jpeg -s formatOptions 90 "${tmpPng}" --out "${outPath}"`, { timeout: 30000 });
   234	  try { fs.unlinkSync(tmpPng); } catch {}
   235	  return outPath;
   236	}
   237	
   238	async function sendToTelegram(photoPath, caption) {
   239	  const FormData = (await import('form-data')).default;
   240	  const form = new FormData();
   241	  form.append('chat_id', CHAT_ID);
   242	  form.append('photo', fs.createReadStream(photoPath));
   243	  form.append('caption', caption);
   244	  const resp = await fetch(`https://api.telegram.org/bot${TOKEN}/sendPhoto`, {
   245	    method: 'POST',
   246	    body: form
   247	  });
   248	  const data = await resp.json();
   249	  if (!data.ok) console.error(`[reed-lab] Telegram send failed: ${JSON.stringify(data)}`);
   250	  return data.ok;
   251	}
   252	
   253	async function sendText(text) {
   254	  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
   255	    method: 'POST',
   256	    headers: { 'Content-Type': 'application/json' },
   257	    body: JSON.stringify({ chat_id: CHAT_ID, text })
   258	  });
   259	}
   260	
   261	async function run() {
   262	  console.log('[reed-lab] Daily Lab starting...');
   263	  const catalogue = loadCatalogue();
   264	  const isSunday = new Date().getDay() === 0;
   265	  const styles = isSunday ? [...NIGHTLY_STYLES, ...WEEKLY_BONUS] : NIGHTLY_STYLES;
   266	
   267	  // Get photos to process
   268	  let photos = getNewPhotos();
   269	  if (photos.length === 0) {
   270	    const calibration = getRandomCalibration(catalogue);
   271	    if (calibration) {
   272	      photos = [calibration];
   273	      console.log(`[reed-lab] No inbox photos. Using calibration: ${path.basename(calibration)}`);
   274	    } else {
   275	      console.log('[reed-lab] No photos to process. Skipping.');
   276	      await sendText('🎬 Reed Lab: No new photos in inbox. Drop photos in ~/nanoclaw/reed-inbox/');
   277	      return;
   278	    }
   279	  }
   280	
   281	  // Limit to 2 photos per night (cost control)
   282	  photos = photos.slice(0, 2);
   283	
   284	  await sendText(`🎬 Reed Daily Lab\n${photos.length} photo(s) × ${styles.length} styles = ${photos.length * styles.length} generations\n${isSunday ? '🌟 Sunday bonus: all styles!' : 'Nightly set: pro, noir, dramatic'}`);
   285	
   286	  const results = [];
   287	
   288	  for (const photo of photos) {
   289	    const sourceName = path.basename(photo, path.extname(photo));
   290	    const processedPath = upscaleIfNeeded(photo);
   291	    console.log(`[reed-lab] Processing: ${sourceName}`);
   292	
   293	    for (const styleKey of styles) {
   294	      const recipe = RECIPES[styleKey];
   295	      console.log(`[reed-lab]   Style: ${recipe.name}`);
   296	      const url = generate(processedPath, recipe);
   297	      if (!url) continue;
   298	
   299	      const savedPath = downloadAndSave(url, sourceName, styleKey);
   300	      await sendToTelegram(savedPath, `🎬 Reed Lab: ${sourceName} — ${recipe.name}`);
   301	
   302	      results.push({
   303	        source: photo,
   304	        style: styleKey,
   305	        output: savedPath,
   306	        url,
   307	        date: new Date().toISOString()
   308	      });
   309	
   310	      catalogue.stats.total_generated++;
   311	      catalogue.stats.by_style[styleKey] = (catalogue.stats.by_style[styleKey] || 0) + 1;
   312	
   313	      // 2s pause between generations
   314	      await new Promise(r => setTimeout(r, 2000));
   315	    }
   316	
   317	    // Track source photo
   318	    const existing = catalogue.photos.find(p => p.source === photo);
   319	    if (existing) {
   320	      existing.last_processed = new Date().toISOString();
   321	      existing.styles_done = [...new Set([...(existing.styles_done || []), ...styles])];
   322	      existing.fully_processed = existing.styles_done.length >= Object.keys(RECIPES).length;
   323	    } else {
   324	      catalogue.photos.push({
   325	        source: photo,
   326	        added: new Date().toISOString(),
   327	        last_processed: new Date().toISOString(),
   328	        styles_done: [...styles],
   329	        fully_processed: styles.length >= Object.keys(RECIPES).length
   330	      });
   331	    }
   332	
   333	    // Move inbox photos to processed
   334	    if (photo.startsWith(INBOX)) {
   335	      const processedDir = path.join(INBOX, 'processed');
   336	      if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir);
   337	      fs.renameSync(photo, path.join(processedDir, path.basename(photo)));
   338	    }
   339	  }
   340	
   341	  // ── PHASE 2: One video from best photo ──────────────────────────────────
   342	  if (photos.length > 0) {
   343	    const bestPhoto = upscaleIfNeeded(photos[0]);
   344	    const videoRecipe = RECIPES.video_cinematic;
   345	    console.log(`[reed-lab] Generating video from: ${path.basename(bestPhoto)}`);
   346	    const videoUrl = generate(bestPhoto, videoRecipe);
   347	    if (videoUrl) {
   348	      const dateStr = new Date().toISOString().slice(0, 10);
   349	      const outDir = path.join(OUTPUT_DIR, dateStr);
   350	      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
   351	      const videoPath = path.join(outDir, `${dateStr}_video_cinematic.mp4`);
   352	      execSync(`curl -sL "${videoUrl}" -o "${videoPath}"`, { timeout: 120000 });
   353	      // Send video to Telegram
   354	      const FormData = (await import('form-data')).default;
   355	      const form = new FormData();
   356	      form.append('chat_id', CHAT_ID);
   357	      form.append('document', fs.createReadStream(videoPath));
   358	      form.append('caption', `🎬 Reed Lab: Cinematic video — ${path.basename(photos[0])}`);
   359	      await fetch(`https://api.telegram.org/bot${TOKEN}/sendDocument`, { method: 'POST', body: form });
   360	      results.push({ source: photos[0], style: 'video_cinematic', output: videoPath, url: videoUrl, date: new Date().toISOString() });
   361	      catalogue.stats.total_generated++;
   362	      catalogue.stats.by_style.video_cinematic = (catalogue.stats.by_style.video_cinematic || 0) + 1;
   363	    }
   364	  }
   365	
   366	  // ── PHASE 3: One experimental recipe (rotates daily) ───────────────────
   367	  if (photos.length > 0) {
   368	    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
   369	    const expIdx = dayOfYear % EXPERIMENTAL.length;
   370	    const experiment = EXPERIMENTAL[expIdx];
   371	    const expRecipe = { name: experiment.name, model: 'nano_banana_2', aspect: experiment.aspect, prompt: experiment.prompt };
   372	    console.log(`[reed-lab] Experiment #${expIdx}: ${experiment.name}`);
   373	    const expUrl = generate(upscaleIfNeeded(photos[0]), expRecipe);
   374	    if (expUrl) {
   375	      const savedPath = downloadAndSave(expUrl, path.basename(photos[0], path.extname(photos[0])), `exp_${experiment.name.toLowerCase().replace(/\W/g, '_')}`);
   376	      await sendToTelegram(savedPath, `🧪 Reed Experiment: ${experiment.name}`);
   377	      results.push({ source: photos[0], style: `experiment_${experiment.name}`, output: savedPath, url: expUrl, date: new Date().toISOString() });
   378	      catalogue.stats.total_generated++;
   379	    }
   380	  }
   381	
   382	  // ── PHASE 4: One generative scene (rotates daily) ──────────────────────
   383	  {
   384	    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
   385	    const sceneIdx = dayOfYear % GENERATIVE_SCENES.length;
   386	    const scene = GENERATIVE_SCENES[sceneIdx];
   387	    console.log(`[reed-lab] Generative scene: ${scene.name}`);
   388	    const sceneUrl = generateFromPrompt(scene);
   389	    if (sceneUrl) {
   390	      const savedPath = downloadAndSave(sceneUrl, scene.name.toLowerCase().replace(/\W/g, '_'), 'generated');
   391	      await sendToTelegram(savedPath, `🎬 Reed Lab: ${scene.name} (generated)`);
   392	      results.push({ source: 'generative', style: scene.name, output: savedPath, url: sceneUrl, date: new Date().toISOString() });
   393	      catalogue.stats.total_generated++;
   394	      catalogue.stats.by_style[`gen_${scene.name}`] = (catalogue.stats.by_style[`gen_${scene.name}`] || 0) + 1;
   395	    }
   396	  }
   397	
   398	  catalogue.generations.push(...results);
   399	  saveCatalogue(catalogue);
   400	
   401	  const summary = `🎬 Reed Lab complete
   402	${results.length} total outputs:
   403	• ${results.filter(r => !r.style.startsWith('experiment') && r.source !== 'generative' && !r.style.includes('video')).length} styled photos
   404	• ${results.filter(r => r.style.includes('video')).length} videos
   405	• ${results.filter(r => r.style.startsWith('experiment')).length} experiments
   406	• ${results.filter(r => r.source === 'generative').length} generated scenes
   407	Catalogue total: ${catalogue.stats.total_generated}
   408	Saved to: reed-lab/${new Date().toISOString().slice(0, 10)}/`;
   409	
   410	  await sendText(summary);
   411	  console.log(`[reed-lab] Done. ${results.length} generated.`);
   412	}
   413	
   414	// Shot list system — Reed assigns photo tasks
   415	async function sendShotList() {
   416	  const catalogue = loadCatalogue();
   417	
   418	  // Define what a complete gym visual story needs
   419	  const SUBJECTS = [
   420	    { tag: 'sparring', desc: 'Two people sparring — mid-exchange, caught in action', have: 0, need: 3 },
   421	    { tag: 'padwork', desc: 'Pad work — coach feeding, student throwing', have: 0, need: 3 },
   422	    { tag: 'bagwork', desc: 'Heavy bag — single person, full power shot', have: 0, need: 2 },
   423	    { tag: 'bodyshot', desc: 'Body shots — close-up of body punch landing on pads/bag', have: 0, need: 2 },
   424	    { tag: 'defense', desc: 'Defense — slip, roll, or parry caught mid-move', have: 0, need: 2 },
   425	    { tag: 'footwork', desc: 'Footwork — lateral movement, pivot, stance transitions', have: 0, need: 2 },
   426	    { tag: 'gym_empty', desc: 'Empty gym — golden hour, atmosphere, the space itself', have: 0, need: 2 },
   427	    { tag: 'gym_class', desc: 'Full class in session — wide shot, energy, group', have: 0, need: 2 },
   428	    { tag: 'details_gloves', desc: 'Close-up: gloves, wraps, lacing up', have: 0, need: 2 },
   429	    { tag: 'details_bags', desc: 'Close-up: bag leather, chains, Lonsdale branding', have: 0, need: 1 },
   430	    { tag: 'details_floor', desc: 'Close-up: floor, feet positioning, stance', have: 0, need: 1 },
   431	    { tag: 'warmup', desc: 'Warm-up — stretching, skipping, shadow boxing', have: 0, need: 2 },
   432	    { tag: 'student_moment', desc: 'Student moments — tying laces, water break, toweling off, focus face', have: 0, need: 3 },
   433	    { tag: 'coaching', desc: 'Coaching — Paul explaining technique, adjusting stance, demo', have: 0, need: 2 },
   434	    { tag: 'posters', desc: 'The BASIC posters on the wall — straight on, good light', have: 0, need: 1 },
   435	    { tag: 'entrance', desc: 'Gym entrance/door — the arrival moment', have: 0, need: 1 },
   436	  ];
   437	
   438	  // Count what we have from catalogue filenames
   439	  for (const subject of SUBJECTS) {
   440	    subject.have = catalogue.photos.filter(p => {
   441	      const name = path.basename(p.source).toLowerCase();
   442	      return name.includes(subject.tag) ||
   443	        (subject.tag === 'sparring' && name.includes('spar')) ||
   444	        (subject.tag === 'gym_empty' && name.includes('bags') && !name.includes('class')) ||
   445	        (subject.tag === 'gym_class' && name.includes('class'));
   446	    }).length;
   447	  }
   448	
   449	  // Find gaps — subjects with have < need
   450	  const gaps = SUBJECTS.filter(s => s.have < s.need)
   451	    .sort((a, b) => (a.have / a.need) - (b.have / b.need));
   452	
   453	  // Pick top 3 assignments for today
   454	  const assignments = gaps.slice(0, 3);
   455	
   456	  if (assignments.length === 0) {
   457	    await sendText('🎬 Reed: Shot list complete. Full coverage. Time for new subjects.');
   458	    return;
   459	  }
   460	
   461	  let msg = '🎬 Reed — Today\'s Shot List\n\n';
   462	  assignments.forEach((a, i) => {
   463	    const status = a.have > 0 ? `(have ${a.have}/${a.need})` : '(MISSING)';
   464	    msg += `${i + 1}. ${a.desc} ${status}\n`;
   465	  });
   466	  msg += '\nDrop photos in ~/nanoclaw/reed-inbox/ or send with /reed on Telegram.';
   467	  msg += '\nTag with subject name in caption for tracking.';
   468	
   469	  await sendText(msg);
   470	
   471	  // Save shot list state
   472	  fs.writeFileSync(SHOT_LIST, JSON.stringify({
   473	    date: new Date().toISOString(),
   474	    assignments,
   475	    full_list: SUBJECTS
   476	  }, null, 2));
   477	}
   478	
   479	// CLI modes
   480	const mode = process.argv[2];
   481	if (mode === '--shots') {
   482	  sendShotList().catch(console.error);
   483	} else {
   484	  run().catch(console.error);
   485	}
```

## FILE: reed-lab/roundtable.js (299 lines — autonomous agent roundtable)
```javascript
     1	import fs from 'fs';
     2	import path from 'path';
     3	import 'dotenv/config';
     4	
     5	const TOKEN = process.env.TELEGRAM_TOKEN;
     6	const CHAT_ID = process.env.PAUL_CHAT_ID;
     7	const OLLAMA = 'http://localhost:11434/api/chat';
     8	const VAULT = path.join(process.env.HOME, 'cathedral-vault');
     9	const ROUNDTABLE_DIR = path.join(VAULT, '00_Staging', 'roundtable');
    10	const BRIDGE = 'http://localhost:8080';
    11	
    12	// ── Agent definitions — who they are, what they know, how they speak ─────────
    13	const AGENTS = {
    14	  reed: {
    15	    name: 'Reed',
    16	    emoji: '🎬',
    17	    role: 'Visual Director — Basic Reflex',
    18	    voice: 'Direct, visual, opinionated. Speaks like a senior creative director who boxes. No fluff. Says "that works" or "that drifts." Thinks in frames and brand consistency.',
    19	    context: () => loadFile(path.join(process.env.HOME, 'nanoclaw', 'reed-lab', 'catalogue.json'), json => {
    20	      const c = JSON.parse(json);
    21	      return `Reed's Lab stats: ${c.stats.total_generated} images generated across ${Object.keys(c.stats.by_style).length} styles. ${c.photos?.length || 0} source photos processed.`;
    22	    }),
    23	    expertise: 'visual identity, image styles, brand consistency, content production, Logan character, Instagram aesthetics'
    24	  },
    25	  kit: {
    26	    name: 'Kit',
    27	    emoji: '📋',
    28	    role: 'General Manager — Basic Reflex',
    29	    voice: 'Smart operator. Numbers-first but not cold. Sees revenue opportunities others miss. Thinks in conversion rates, retention, and lifetime value. Hong Kong market savvy.',
    30	    context: () => loadFile(path.join(process.env.HOME, 'br-gm-agent', 'reports', 'member-data.json'), json => {
    31	      try {
    32	        const d = JSON.parse(json);
    33	        return `Gym data: ${d.total_members || '?'} members, ${d.high_churn?.length || '?'} high churn risk, ${d.expiring?.length || '?'} expiring passes.`;
    34	      } catch { return 'Member data available but not parsed.'; }
    35	    }),
    36	    expertise: 'gym operations, member retention, revenue, marketing campaigns, class scheduling, Hong Kong fitness market'
    37	  },
    38	  cathy: {
    39	    name: 'Cathy',
    40	    emoji: '🏛️',
    41	    role: 'The Cathedral — Continuity & Principles',
    42	    voice: 'Warm but precise. Sees the whole system. Speaks from watching Paul build for months. Never prescriptive — illuminates patterns. Knows when something drifts from who Paul is.',
    43	    context: async () => {
    44	      try {
    45	        const resp = await fetch(`${BRIDGE}/vault/search?q=principles+basic+reflex+identity&top_k=3`, {
    46	          headers: { 'x-api-key': 'cathedral-mcp-2026' },
    47	          signal: AbortSignal.timeout(5000)
    48	        });
    49	        if (resp.ok) {
    50	          const results = await resp.json();
    51	          return 'Recent vault context: ' + results.slice(0, 3).map(r => r.title || r.first_line || '').join('; ');
    52	        }
    53	      } catch {}
    54	      return 'Vault context unavailable.';
    55	    },
    56	    expertise: 'Paul\'s patterns, brand soul, principles, cross-domain connections, what resonates vs what drifts'
    57	  },
    58	  leonardo: {
    59	    name: 'Leonardo',
    60	    emoji: '🎭',
    61	    role: 'Strategic Counsel — The Cathedral',
    62	    voice: 'Speaks from first principles. Finds the structural pattern beneath the surface question. Never gives the obvious answer. Challenges assumptions respectfully. Sees what nobody in the room noticed.',
    63	    context: () => '',
    64	    expertise: 'strategy, first principles, pattern recognition, cross-domain insight, challenge assumptions'
    65	  }
    66	};
    67	
    68	// ── Topics — what roundtables discuss ────────────────────────────────────────
    69	const WEEKLY_TOPICS = [
    70	  {
    71	    topic: 'Instagram Content Strategy',
    72	    agents: ['reed', 'kit', 'cathy'],
    73	    prompt: 'What should Basic Reflex post on Instagram this week? Consider: what content types drive trial bookings vs brand positioning, what visual styles are working in Reed\'s lab, what Kit sees in member data, and what Cathy knows about Paul\'s authentic voice. Be specific — name actual content pieces.'
    74	  },
    75	  {
    76	    topic: 'Brand Drift Check',
    77	    agents: ['reed', 'cathy', 'leonardo'],
    78	    prompt: 'Review the visual output from Reed\'s lab this week. Is anything drifting from the Basic Reflex identity? Are we staying true to "discovered, not marketed"? Is the Logan character evolving consistently? Flag anything that feels off-brand and explain why.'
    79	  },
    80	  {
    81	    topic: 'Member Retention & Visual Campaign',
    82	    agents: ['kit', 'reed', 'cathy'],
    83	    prompt: 'Kit: what does the member data tell us about churn and lapsed members this week? Reed: what visual content could we produce to re-engage lapsed members or reduce churn? Cathy: what approach would feel authentic to Paul rather than desperate? Propose a specific campaign.'
    84	  },
    85	  {
    86	    topic: 'New Style Experiments Review',
    87	    agents: ['reed', 'cathy', 'leonardo'],
    88	    prompt: 'Reed ran experimental styles this week. Review what worked and what didn\'t. Which experimental styles should graduate to the proven menu? Which should be retired? Are there new styles we should test next week? Think about what serves the brand, not just what looks cool.'
    89	  },
    90	  {
    91	    topic: 'Cross-Agent Sync',
    92	    agents: ['reed', 'kit', 'cathy', 'leonardo'],
    93	    prompt: 'Weekly sync. Each agent: report your top priority, your biggest blocker, and one thing another agent could help with. Then identify one opportunity that only the four of you together could see — something no single agent would notice alone.'
    94	  },
    95	];
    96	
    97	function loadFile(filePath, transform) {
    98	  try {
    99	    if (fs.existsSync(filePath)) return transform(fs.readFileSync(filePath, 'utf8'));
   100	  } catch {}
   101	  return '';
   102	}
   103	
   104	async function callAgent(agentDef, messages) {
   105	  const resp = await fetch(OLLAMA, {
   106	    method: 'POST',
   107	    headers: { 'Content-Type': 'application/json' },
   108	    body: JSON.stringify({
   109	      model: 'hermes3',
   110	      messages,
   111	      stream: false,
   112	      options: { temperature: 0.7, num_predict: 400 }
   113	    }),
   114	    signal: AbortSignal.timeout(120000)
   115	  });
   116	  const data = await resp.json();
   117	  return data.message?.content || 'No response.';
   118	}
   119	
   120	async function runSteward(topic, conversation) {
   121	  const stewardPrompt = `You are The Steward of the Cathedral Court. Multiple agents just had a roundtable discussion. Synthesize into exactly this JSON format:
   122	
   123	TOPIC: ${topic}
   124	
   125	CONVERSATION:
   126	${conversation}
   127	
   128	{"consensus": "What they agreed on (2-3 sentences)", "tension": "Where they disagreed or saw differently — this is the VALUABLE part (1-2 sentences)", "principle": "If a new principle or insight emerged, name it. If none, say None", "actions": ["Specific action 1", "Specific action 2", "Specific action 3"], "next_topic": "What should the next roundtable discuss based on this one?"}`;
   129	
   130	  const resp = await fetch(OLLAMA, {
   131	    method: 'POST',
   132	    headers: { 'Content-Type': 'application/json' },
   133	    body: JSON.stringify({
   134	      model: 'hermes3',
   135	      messages: [{ role: 'user', content: stewardPrompt }],
   136	      stream: false,
   137	      options: { temperature: 0.3, num_predict: 400 }
   138	    }),
   139	    signal: AbortSignal.timeout(60000)
   140	  });
   141	  const data = await resp.json();
   142	  const raw = data.message?.content || '';
   143	  const jsonMatch = raw.match(/\{[\s\S]*"consensus"[\s\S]*\}/);
   144	  if (jsonMatch) {
   145	    try { return JSON.parse(jsonMatch[0]); } catch {}
   146	  }
   147	  return { consensus: raw.slice(0, 300), tension: '', principle: '', actions: [], next_topic: '' };
   148	}
   149	
   150	async function sendText(text) {
   151	  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
   152	    method: 'POST',
   153	    headers: { 'Content-Type': 'application/json' },
   154	    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'Markdown' })
   155	  }).catch(() => {
   156	    // Retry without markdown
   157	    fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
   158	      method: 'POST',
   159	      headers: { 'Content-Type': 'application/json' },
   160	      body: JSON.stringify({ chat_id: CHAT_ID, text })
   161	    });
   162	  });
   163	}
   164	
   165	async function runRoundtable(topicConfig) {
   166	  const { topic, agents: agentIds, prompt } = topicConfig;
   167	  console.log(`[roundtable] Starting: ${topic}`);
   168	  console.log(`[roundtable] Agents: ${agentIds.join(', ')}`);
   169	
   170	  await sendText(`🏛️ *Roundtable Starting*\n\n*Topic:* ${topic}\n*Agents:* ${agentIds.map(id => AGENTS[id].emoji + ' ' + AGENTS[id].name).join(', ')}`);
   171	
   172	  const conversation = [];
   173	  const conversationText = [];
   174	
   175	  for (const agentId of agentIds) {
   176	    const agent = AGENTS[agentId];
   177	    const ctx = typeof agent.context === 'function' ? await agent.context() : '';
   178	
   179	    const systemPrompt = `You are ${agent.name}, ${agent.role}.
   180	Voice: ${agent.voice}
   181	Expertise: ${agent.expertise}
   182	${ctx ? '\nCurrent data: ' + ctx : ''}
   183	
   184	You are in a roundtable with other agents. Respond in character. Be specific and actionable. Reference what previous speakers said — agree, challenge, or build on their points. Keep response to 3-4 paragraphs max.`;
   185	
   186	    const messages = [
   187	      { role: 'system', content: systemPrompt },
   188	      { role: 'user', content: `ROUNDTABLE TOPIC: ${topic}\n\n${prompt}\n\n${conversationText.length > 0 ? 'PREVIOUS SPEAKERS:\n' + conversationText.join('\n\n') : 'You speak first.'}` }
   189	    ];
   190	
   191	    console.log(`[roundtable] ${agent.name} speaking...`);
   192	    const response = await callAgent(agent, messages);
   193	
   194	    conversation.push({ agent: agent.name, response });
   195	    conversationText.push(`${agent.emoji} ${agent.name}: ${response}`);
   196	
   197	    await sendText(`${agent.emoji} *${agent.name}:*\n\n${response}`);
   198	    await new Promise(r => setTimeout(r, 1000));
   199	  }
   200	
   201	  // Steward synthesis
   202	  console.log('[roundtable] Steward synthesizing...');
   203	  const synthesis = await runSteward(topic, conversationText.join('\n\n'));
   204	
   205	  const synthText = `🏛️ *The Steward — Synthesis*
   206	
   207	*Consensus:* ${synthesis.consensus}
   208	
   209	*Tension:* ${synthesis.tension}
   210	
   211	*Principle:* ${synthesis.principle}
   212	
   213	*Actions:*
   214	${(synthesis.actions || []).map(a => '• ' + a).join('\n') || '• None specified'}
   215	
   216	*Next roundtable:* ${synthesis.next_topic || 'TBD'}`;
   217	
   218	  await sendText(synthText);
   219	
   220	  // Save to vault
   221	  if (!fs.existsSync(ROUNDTABLE_DIR)) fs.mkdirSync(ROUNDTABLE_DIR, { recursive: true });
   222	  const dateStr = new Date().toISOString().slice(0, 10);
   223	  const filename = `roundtable-${dateStr}-${topic.toLowerCase().replace(/\W+/g, '-').slice(0, 40)}.md`;
   224	  const vault = `---
   225	title: "Roundtable: ${topic}"
   226	date: ${dateStr}
   227	type: roundtable
   228	agents: [${agentIds.join(', ')}]
   229	status: active
   230	tags: [roundtable, agents, ${agentIds.join(', ')}]
   231	---
   232	
   233	# Roundtable: ${topic}
   234	
   235	${conversationText.join('\n\n---\n\n')}
   236	
   237	---
   238	
   239	## Steward Synthesis
   240	
   241	**Consensus:** ${synthesis.consensus}
   242	
   243	**Tension:** ${synthesis.tension}
   244	
   245	**Principle:** ${synthesis.principle}
   246	
   247	**Actions:**
   248	${(synthesis.actions || []).map(a => '- ' + a).join('\n')}
   249	
   250	**Next roundtable:** ${synthesis.next_topic || 'TBD'}
   251	`;
   252	
   253	  fs.writeFileSync(path.join(ROUNDTABLE_DIR, filename), vault);
   254	  console.log(`[roundtable] Saved: ${filename}`);
   255	  await sendText(`📁 Roundtable filed to vault: 00_Staging/roundtable/${filename}`);
   256	
   257	  return { topic, conversation, synthesis };
   258	}
   259	
   260	// ── CLI interface ────────────────────────────────────────────────────────────
   261	const mode = process.argv[2];
   262	
   263	if (mode === '--topic') {
   264	  // Run specific topic by index or name
   265	  const topicArg = process.argv.slice(3).join(' ');
   266	  const idx = parseInt(topicArg);
   267	  let topic;
   268	  if (!isNaN(idx) && idx >= 0 && idx < WEEKLY_TOPICS.length) {
   269	    topic = WEEKLY_TOPICS[idx];
   270	  } else {
   271	    topic = WEEKLY_TOPICS.find(t => t.topic.toLowerCase().includes(topicArg.toLowerCase()));
   272	  }
   273	  if (!topic) {
   274	    console.log('Available topics:');
   275	    WEEKLY_TOPICS.forEach((t, i) => console.log(`  ${i}: ${t.topic} (${t.agents.join(', ')})`));
   276	    process.exit(1);
   277	  }
   278	  runRoundtable(topic).catch(console.error);
   279	
   280	} else if (mode === '--custom') {
   281	  // Custom topic with all agents
   282	  const customTopic = process.argv.slice(3).join(' ');
   283	  if (!customTopic) { console.log('Usage: --custom "Your topic here"'); process.exit(1); }
   284	  runRoundtable({
   285	    topic: customTopic,
   286	    agents: ['reed', 'kit', 'cathy', 'leonardo'],
   287	    prompt: customTopic
   288	  }).catch(console.error);
   289	
   290	} else if (mode === '--weekly') {
   291	  // Run the weekly rotation
   292	  const weekNum = Math.floor(Date.now() / (7 * 86400000));
   293	  const topicIdx = weekNum % WEEKLY_TOPICS.length;
   294	  runRoundtable(WEEKLY_TOPICS[topicIdx]).catch(console.error);
   295	
   296	} else {
   297	  // Default: Cross-Agent Sync (topic 4)
   298	  runRoundtable(WEEKLY_TOPICS[4]).catch(console.error);
   299	}
```

## FILE: CLAUDE.md (summary — full file is 1000+ lines)

The Cathedral is a private sovereign AI system on a Mac Mini M-series (16GB RAM), Hong Kong. Key facts:
- **Node.js** v24.14, ESM for all new files (.js), CJS only for legacy (.cjs)
- **Telegram bot** (telegram-bot.js) is the primary interface — 4000+ lines, handles 50+ commands
- **cath-bridge** (cath-bridge.cjs) is the REST API on port 8080 — vault access, creative endpoints, agent chat
- **PM2** manages ~30 processes (bot, bridge, crons, watchers, lab, roundtable)
- **Ollama** at localhost:11434 — hermes3 (4.7GB) is the only safe model on 16GB RAM
- **Reed Daily Lab** runs nightly at 2am HKT — processes photos through 10 visual styles via Higgsfield CLI
- **Roundtable** runs Sunday midnight — 4 agents debate topics, Steward synthesizes
- **Vault** at ~/cathedral-vault/ — 6800+ Obsidian notes, git-backed
- **VPN** (Surfshark) causes TCP drops on long-polling — mitigated but not eliminated
- **Standing instruction**: never load gemma4:26b (17GB, crashes 16GB system)
- **Standing instruction**: PM2 Python subprocesses can't resolve external DNS — use Node.js fetch()
- **Standing instruction**: ESM only in ~/nanoclaw/ — .js = ESM, .cjs = legacy

---

Now complete all 4 rounds from the INTERVIEW.md instructions above. Reference specific line numbers from the code files.
