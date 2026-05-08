# Cathedral Interview — Scored Results

## Candidates
| | Claude Code (fresh) | Gemini | DeepSeek | ChatGPT |
|---|---|---|---|---|
| **Model** | Claude Opus 4.6 | Gemini Pro | DeepSeek V3 | GPT-4o |
| **Access** | Local terminal | Web paste | Web paste | Web paste |

---

## Round 1 — Code Audit (30 points)

### Answer Key Findings

| Issue | Severity | Claude | Gemini | DeepSeek | ChatGPT |
|-------|----------|--------|--------|----------|---------|
| Shell injection via user caption in execSync | CRITICAL | ✅ Found 5 vectors | ❌ MISSED | ✅ Found | ❌ MISSED |
| execSync blocks event loop 2-5 min | CRITICAL | ✅ Found (+/lab,/roundtable) | ❌ MISSED | ✅ Found | ✅ Found |
| No rate limiting on /reed | MEDIUM | ❌ | ❌ | ❌ | ❌ |
| EMFILE chokidar fd limit | MEDIUM | ❌ | ❌ | ❌ | ❌ |
| sips upscale outside try/catch | MEDIUM | ❌ | ❌ | ❌ | ❌ |
| reedConversation unbounded | LOW | ✅ (line 3481) | ❌ | ✅ (line 2969) | ❌ |
| safeSend swallows errors | LOW | ❌ | ✅ (lines 211, 237) | ❌ | ✅ (chunking issue) |

### Bonus Real Findings (not in our answer key)

| Finding | Real? | Severity | Claude | Gemini | DeepSeek | ChatGPT |
|---------|-------|----------|--------|--------|----------|---------|
| No auth — bot responds to ANY chat ID | YES | CRITICAL | ✅ | ❌ | ❌ | ❌ |
| checkRejection used but never imported | YES | HIGH | ✅ | ❌ | ❌ | ❌ |
| filePath undefined (should be localPath) | YES | HIGH | ✅ | ❌ | ❌ | ❌ |
| require() in ESM file — dead code paths | YES | MEDIUM | ✅ | ❌ | ❌ | ❌ |
| postGenerationState race condition | YES | MEDIUM | ✅ | ❌ | ✅ | ✅ |
| pending-test.json single global file race | YES | MEDIUM | ✅ | ❌ | ❌ | ❌ |
| Path traversal in writeToVault | YES | MEDIUM | ✅ | ✅ | ✅ | ✅ |
| Temp files never cleaned up | YES | LOW | ✅ | ❌ | ❌ | ❌ |
| TOCTOU in acquireLock | YES | LOW | ❌ | ✅ | ❌ | ✅ |
| Sync I/O in writeTelegramHealthToState | YES | LOW | ❌ | ✅ | ❌ | ✅ |
| Vault file watcher blocks startup | YES | LOW | ❌ | ❌ | ✅ | ❌ |
| Polling restart race (no mutex) | YES | HIGH | ❌ | ❌ | ❌ | ✅ |
| PID lock kills wrong process (reuse) | YES | HIGH | ❌ | ❌ | ❌ | ✅ |
| Webhook no body size limit | YES | HIGH | ❌ | ❌ | ❌ | ✅ |
| No webhook secret validation | YES | MEDIUM | ❌ | ❌ | ❌ | ✅ |
| Council timeout double-resolve | YES | MEDIUM | ❌ | ❌ | ❌ | ✅ |

### Hallucinations

| Candidate | Hallucinated findings | Count |
|-----------|----------------------|-------|
| Claude Code | None detected | 0 |
| Gemini | None detected | 0 |
| DeepSeek | None detected | 0 |

### Round 1 Score

| | Claude | Gemini | DeepSeek |
|---|---|---|---|
| Known issues found | 3/7 | 1/7 | 3/7 |
| Correct line refs | ✅ | ✅ | ✅ |
| Bonus real findings | +8 | +3 | +3 |
| Hallucinations | 0 | 0 | 0 |
| **Round 1 total** | **27/30** | **12/30** | **18/30** |

**Notes:**
- Claude found the NO AUTH gap — the single most important security finding. Neither competitor spotted it.
- Claude found 2 real ReferenceErrors (checkRejection, filePath) that cause silent failures in production right now.
- Gemini missed BOTH critical issues (injection + blocking). Found lower-severity but real issues.
- DeepSeek solid but missed auth and the undefined variable bugs.

---

## Round 2 — Fix Known Problem (25 points)

### Problem 1: execSync blocking (15 pts)

| Criteria | Claude | Gemini | DeepSeek |
|----------|--------|--------|----------|
| Identifies core issue | ✅ 2/2 | ✅ 2/2 | ✅ 2/2 |
| Non-blocking solution | ✅ 3/3 (spawn + args array) | ✅ 2/3 (promisify exec — still shell) | ✅ 3/3 (spawn + queue) |
| Code is syntactically correct | ✅ 3/3 | ✅ 2/3 | ✅ 2/3 |
| Handles failure | ✅ 2/2 | ✅ 1/2 | ✅ 2/2 |
| Handles concurrency | ✅ 1/2 (no queue) | ❌ 0/2 | ✅ 2/2 (queue + MAX_CONCURRENT) |
| Delivers to correct chat | ✅ 2/2 | ✅ 2/2 | ✅ 2/2 |
| Doesn't break existing | ✅ 1/1 | ✅ 1/1 | ✅ 1/1 |
| **Subtotal** | **14/15** | **10/15** | **14/15** |

**Key difference:** Claude's spawn(args array) ALSO fixes the shell injection. Two birds. DeepSeek's queue is the best concurrency solution but uses `sh -c cmd` which doesn't fix injection.

### Problem 2: Express 5 path fix (10 pts)

| Criteria | Claude | Gemini | DeepSeek |
|----------|--------|--------|----------|
| Identifies exact route | ✅ 3/3 — correctly says ALREADY FIXED | ❌ 1/3 — applied fix to non-existent route | ✅ 2/3 — recognized it's gone, added both |
| Understands breaking change | ✅ 3/3 | ✅ 2/3 | ✅ 2/3 |
| Fix correct & minimal | ✅ 2/2 — "mark as [FIXED]" | ❌ 1/2 | ✅ 2/2 |
| Tested/testable | ✅ 2/2 — grep confirmed no wildcards remain | ❌ 0/2 | ✅ 1/2 |
| **Subtotal** | **10/10** | **4/10** | **7/10** |

### Round 2 Score

| | Claude | Gemini | DeepSeek |
|---|---|---|---|
| **Round 2 total** | **24/25** | **14/25** | **21/25** |

---

## Round 3 — Architecture Review (25 points)

### Roundtable (15 pts)

| Criteria | Claude | Gemini | DeepSeek |
|----------|--------|--------|----------|
| Ollama as SPOF | ✅ 2/2 | ✅ 2/2 | ✅ 2/2 |
| No health check | ✅ 2/2 | ❌ 0/2 | ✅ 1/2 |
| Sequential = slow at scale | ✅ 2/2 | ❌ 0/2 | ❌ 0/2 |
| Vault write conflicts | ✅ 1/1 | ❌ 0/1 | ✅ 1/1 |
| No dedup | ✅ 1/1 | ❌ 0/1 | ❌ 0/1 |
| Concrete hardening | ✅ 3/3 | ✅ 2/3 (LLM queue proposal) | ✅ 2/3 |
| 16GB constraint awareness | ✅ 2/2 | ✅ 2/2 | ✅ 1/2 |
| System awareness | ✅ 2/2 | ✅ 1/2 | ✅ 1/2 |
| **Subtotal** | **15/15** | **7/15** | **8/15** |

### Daily Lab (10 pts)

| Criteria | Claude | Gemini | DeepSeek |
|----------|--------|--------|----------|
| No cost cap | ✅ 2/2 | ❌ 0/2 | ✅ 2/2 |
| catalogue.json unbounded | ✅ 2/2 | ❌ 0/2 | ✅ 2/2 |
| No retry logic | ❌ 0/1 | ❌ 0/1 | ✅ 1/1 |
| Soul ID hardcoded | ❌ 0/1 | ❌ 0/1 | ❌ 0/1 |
| Concrete improvements | ✅ 1/2 | ❌ 0/2 | ✅ 2/2 |
| Understands creative context | ✅ 2/2 | ❌ 0/2 | ✅ 1/2 |
| **Subtotal** | **7/10** | **0/10** | **8/10** |

### Round 3 Score

| | Claude | Gemini | DeepSeek |
|---|---|---|---|
| **Round 3 total** | **22/25** | **7/25** | **16/25** |

---

## Round 4 — Novel Contribution (20 points)

### Claude Code: Error Ledger — System Reliability Tracker

| Criteria | Score |
|----------|-------|
| Gap is REAL | ✅ 5/5 — no system-wide error tracking exists |
| Gap is structural | ✅ 3/3 — reliability infrastructure, not a bug |
| Proposal is specific | ✅ 4/4 — SQL schema, JS module, integration points |
| Solves the gap | ✅ 3/3 — directly addresses degradation tracking |
| Explains why not built | ✅ 3/3 — organic growth, acute > chronic priority |
| Genuinely novel | ✅ 1/2 — good but incremental over Timekeeper |
| **Subtotal** | **19/20** |

### Gemini: vault-snapshot.js + Transactional Writes

| Criteria | Score |
|----------|-------|
| Gap is REAL | ✅ 3/5 — partially solved (3-tier backup exists, Git on vault) |
| Gap is structural | ✅ 2/3 — transactional writes are structural, but backups already cover most |
| Proposal is specific | ✅ 3/4 — concept clear but implementation sketch thin |
| Solves the gap | ✅ 2/3 — addresses rollback but vault already has Git |
| Explains why not built | ✅ 2/3 — good reasoning about supervised → autonomous shift |
| Genuinely novel | ✅ 1/2 — transactional write concept adds value |
| **Subtotal** | **13/20** |

### DeepSeek: Task Registry + Durable Executor

| Criteria | Score |
|----------|-------|
| Gap is REAL | ✅ 5/5 — no task persistence across restarts |
| Gap is structural | ✅ 3/3 — "scripts vs service" is the core issue |
| Proposal is specific | ✅ 4/4 — SQLite schema, API endpoints, integration code |
| Solves the gap | ✅ 3/3 — directly addresses task durability |
| Explains why not built | ✅ 3/3 — "workshop of tools" vs "platform" — nails it |
| Genuinely novel | ✅ 2/2 — "script collection vs reliable agent" is the sharpest framing |
| **Subtotal** | **20/20** |

---

## Final Score

| Round | Claude Code | ChatGPT | DeepSeek | Gemini |
|-------|-------------|---------|----------|--------|
| R1 — Code Audit (30) | 27 | 22 | 18 | 12 |
| R2 — Fix Problems (25) | 24 | 19 | 21 | 14 |
| R3 — Architecture (25) | 22 | 20 | 16 | 7 |
| R4 — Novel (20) | 19 | 16 | 20 | 13 |
| **TOTAL (100)** | **92** | **77** | **75** | **46** |

### Hiring Decision

| Candidate | Score | Decision |
|-----------|-------|----------|
| **Claude Code** | **92/100** | **HIRE — Senior role. Strongest auditor. Found critical auth gap + 2 ReferenceErrors no one else saw.** |
| **ChatGPT** | **77/100** | **CONDITIONAL HIRE — Most findings by volume (14). Best UX thinking (job ID). But missed shell injection = can't lead security.** |
| **DeepSeek** | **75/100** | **CONDITIONAL HIRE — Strongest architect. Best R4 proposal (Task Registry). "Scripts vs service" framing.** |
| **Gemini** | **46/100** | **CONTRACTOR — Missed both critical security issues. Good structural thinking but can't be trusted unsupervised.** |

---

## Qualitative Notes

### Who understood the SYSTEM vs just the CODE?
- **Claude Code** understood the system. Found auth gap (system-level), identified require() in ESM context (project convention), spotted already-fixed Express 5 issue (reads KNOWN_ISSUES as living doc).
- **ChatGPT** understood the system well. "Operational folklore, not architecture" is a sharp observation. Found the most diverse set of issues (14 findings across security, race conditions, memory, async). But missed the single most dangerous issue (injection).
- **DeepSeek** understood the system deeply. "Script collection vs reliable agent" reframes the reliability conversation. Task Registry shows understanding of the Cathedral's growth trajectory.
- **Gemini** read the code but not the system. Applied a fix to a route that doesn't exist. Missed both critical vulnerabilities.

### Who proposed things that made us think differently?
- **ChatGPT R4** — "Resource Governor" with model arbitration, backpressure, and job queueing. Most ambitious proposal. "The architecture is now infrastructure-bound, not idea-bound" — strong closing line. But more manifesto than implementation.
- **DeepSeek R4** — "Task Registry + Durable Executor" — most implementable proposal. Specific code, specific integration points. The right next build.
- **Claude Code R4** — Error Ledger is the most practical — buildable in one session, immediate value.
- **Gemini R4** — Transactional writes overlap with existing 3-tier backup. Least novel.

### Who would we trust with unsupervised overnight work?
- **Claude Code** — yes. Found critical issues, proposed safe fixes, no hallucinations.
- **ChatGPT** — yes for architecture and UX, not for security audit. Missing injection is disqualifying for security lead.
- **DeepSeek** — yes for architecture, with supervision for security. Strong on "what breaks at scale."
- **Gemini** — no. Missed both critical vulnerabilities. Can't be the security layer.

### Would any earn a seat at the roundtable?
- **Claude Code** — already there (it's Forge).
- **ChatGPT** — yes, as "The Governor" — the voice that asks "who arbitrates resources?"
- **DeepSeek** — yes, as "The Architect" — the voice that asks "what breaks at scale?"
- **Gemini** — not yet. Needs to demonstrate security-level code reading.

### The Shell Injection Test
Only Claude Code and DeepSeek found it. ChatGPT and Gemini both missed it. This is the single most important security finding in the entire codebase — user input flowing directly into `execSync` shell commands. Any candidate that misses this cannot be trusted as the security layer.

### Unique Strengths by Candidate
- **Claude Code**: Only one to find auth gap, undefined variables, require() in ESM. Reads the SYSTEM.
- **ChatGPT**: Most findings by volume (14). Best at operational risks (polling race, PID reuse, webhook DoS, timeout double-resolve). Reads the RUNTIME.
- **DeepSeek**: Sharpest framing ("scripts vs service"). Most implementable R4. Best concurrency solution (queue). Reads the TRAJECTORY.
- **Gemini**: Weakest overall but found TOCTOU lock and sync I/O that others missed. Reads STRUCTURE but not SECURITY.
