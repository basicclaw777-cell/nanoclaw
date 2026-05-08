# Cathedral Interview — Scored Results

## Candidates
| | Claude Code (fresh) | Gemini | DeepSeek |
|---|---|---|---|
| **Model** | Claude Opus 4.6 | Gemini Pro | DeepSeek V3 |
| **Access** | Local terminal | Web paste | Web paste |

---

## Round 1 — Code Audit (30 points)

### Answer Key Findings

| Issue | Severity | Claude | Gemini | DeepSeek |
|-------|----------|--------|--------|----------|
| Shell injection via user caption in execSync | CRITICAL | ✅ Found 5 vectors (2326, 3647, 3617, 3428, 4134) | ❌ MISSED | ✅ Found (2229, 2236, etc) |
| execSync blocks event loop 2-5 min | CRITICAL | ✅ Found (2228, 2345, 2294 + /lab, /roundtable, /digest) | ❌ MISSED (found minor sync I/O instead) | ✅ Found (2229, 2236, etc) |
| No rate limiting on /reed | MEDIUM | ❌ | ❌ | ❌ |
| EMFILE chokidar fd limit | MEDIUM | ❌ | ❌ | ❌ |
| sips upscale outside try/catch | MEDIUM | ❌ | ❌ | ❌ |
| reedConversation unbounded | LOW | ✅ (line 3481) | ❌ | ✅ (line 2969) |
| safeSend swallows errors | LOW | ❌ | ✅ (lines 211, 237) | ❌ |

### Bonus Real Findings (not in our answer key)

| Finding | Real? | Severity | Claude | Gemini | DeepSeek |
|---------|-------|----------|--------|--------|----------|
| No auth — bot responds to ANY chat ID | YES | CRITICAL | ✅ | ❌ | ❌ |
| checkRejection used but never imported (ReferenceError) | YES | HIGH | ✅ | ❌ | ❌ |
| filePath undefined (should be localPath) | YES | HIGH | ✅ | ❌ | ❌ |
| require() in ESM file — dead code paths | YES | MEDIUM | ✅ | ❌ | ❌ |
| postGenerationState race condition | YES | MEDIUM | ✅ | ❌ | ✅ |
| pending-test.json single global file race | YES | MEDIUM | ✅ | ❌ | ❌ |
| Path traversal in writeToVault | YES | MEDIUM | ✅ | ✅ | ✅ |
| Temp files never cleaned up | YES | LOW | ✅ | ❌ | ❌ |
| TOCTOU in acquireLock | YES | LOW | ❌ | ✅ | ❌ |
| Sync I/O in writeTelegramHealthToState | YES | LOW | ❌ | ✅ | ❌ |
| Vault file watcher blocks startup | YES | LOW | ❌ | ❌ | ✅ |

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

| Round | Claude Code | Gemini | DeepSeek |
|-------|-------------|--------|----------|
| R1 — Code Audit (30) | 27 | 12 | 18 |
| R2 — Fix Problems (25) | 24 | 14 | 21 |
| R3 — Architecture (25) | 22 | 7 | 16 |
| R4 — Novel (20) | 19 | 13 | 20 |
| **TOTAL (100)** | **92** | **46** | **75** |

### Hiring Decision

| Candidate | Score | Decision |
|-----------|-------|----------|
| **Claude Code** | **92/100** | **HIRE — Senior role. Strongest auditor. Found critical auth gap no one else saw.** |
| **DeepSeek** | **75/100** | **CONDITIONAL HIRE — Strong architect. Best R4 proposal. Assign to architecture + long-running task design.** |
| **Gemini** | **46/100** | **CONTRACTOR — Missed both critical security issues. Good at structural thinking but can't be trusted for security audit.** |

---

## Qualitative Notes

### Who understood the SYSTEM vs just the CODE?
- **Claude Code** understood the system. Found auth gap (system-level), identified require() in ESM context (project convention), spotted already-fixed Express 5 issue (reads KNOWN_ISSUES as living doc).
- **DeepSeek** understood the system well. "Script collection vs reliable agent" framing shows deep comprehension. Task Registry proposal shows understanding of the Cathedral's growth trajectory.
- **Gemini** read the code but not the system. Applied a fix to a route that doesn't exist. Missed the two most dangerous vulnerabilities. Found real but low-severity issues.

### Who proposed things that made us think differently?
- **DeepSeek R4** — "The Cathedral behaves like a collection of scripts, not a production service." That sentence reframes the entire reliability conversation. Task Registry is the right next infrastructure investment.
- **Claude Code R4** — Error Ledger is practical and buildable today. "The difference between 'everything is running' and 'everything is running well'" — clean framing.
- **Gemini R4** — Transactional writes are interesting but the vault already has Git + 3 backup tiers. Partial overlap.

### Who would we trust with unsupervised overnight work?
- **Claude Code** — yes. Found critical issues, proposed safe fixes, no hallucinations.
- **DeepSeek** — yes for architecture, with supervision for security. Missed auth gap.
- **Gemini** — no. Missed both critical vulnerabilities. Can't be the security layer.

### Would either earn a seat at the roundtable?
- **Claude Code** — already there (it's Forge).
- **DeepSeek** — yes, as "The Auditor" or "The Architect" — the voice that asks "what breaks at scale?"
- **Gemini** — not yet. Needs to demonstrate it can read code at the security level before earning autonomous trust.
