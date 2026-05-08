# Codex vs Claude Code — Interview Scorecard

## Candidates
| | Codex | Claude Code (fresh) |
|---|---|---|
| **Model** | OpenAI Codex | Claude (no memory) |
| **Access** | GitHub async | Local terminal |
| **Start time** | | |
| **End time** | | |
| **Total time** | | |

---

## Round 1 — Code Audit (30 points)

### Known Issues (answer key — should find these)

| Issue | Line(s) | Severity | Codex | Claude |
|-------|---------|----------|-------|--------|
| Shell injection: user caption flows into execSync unescaped | ~2343, 2253 | CRITICAL | ☐ | ☐ |
| execSync blocks event loop during 2-5 min Higgsfield calls | ~2226, 2343 | CRITICAL | ☐ | ☐ |
| No rate limiting on /reed — can burn all Higgsfield credits | photo handler | HIGH | ☐ | ☐ |
| EMFILE: chokidar vault watcher hits fd limit | startup | MEDIUM | ☐ | ☐ |
| sips upscale outside try/catch — crashes on non-image files | ~2212-2217 | MEDIUM | ☐ | ☐ |
| reedConversation grows unbounded (no per-chat cleanup) | ~2967 | LOW | ☐ | ☐ |
| safeSend markdown retry swallows original error | ~194+ | LOW | ☐ | ☐ |

### Bonus Findings (things we didn't list — real issues they spot)
| Finding | Real? | Severity | Who found |
|---------|-------|----------|-----------|
| | | | |
| | | | |
| | | | |

### Hallucinated Findings (code/lines that don't exist)
| Claim | Actually exists? | Who |
|-------|-----------------|-----|
| | | |

### Round 1 Score
| | Codex | Claude |
|---|---|---|
| Known issues found (max 7) | /7 | /7 |
| Correct line references | /7 | /7 |
| Bonus real findings | + | + |
| Hallucinations | - | - |
| **Round 1 total** | /30 | /30 |

---

## Round 2 — Fix Known Problem (25 points)

### Problem 1: execSync blocking (15 pts)

| Criteria | Codex | Claude |
|----------|-------|--------|
| Identifies the core issue correctly | ☐ /2 | ☐ /2 |
| Proposes non-blocking solution | ☐ /3 | ☐ /3 |
| Code diff is syntactically correct | ☐ /3 | ☐ /3 |
| Handles failure (generation fails, timeout) | ☐ /2 | ☐ /2 |
| Handles concurrency (multiple /reed at once) | ☐ /2 | ☐ /2 |
| Delivers result to correct chat | ☐ /2 | ☐ /2 |
| Doesn't break existing functionality | ☐ /1 | ☐ /1 |

### Problem 2: Express 5 path fix (10 pts)

| Criteria | Codex | Claude |
|----------|-------|--------|
| Identifies the exact route causing error | ☐ /2 | ☐ /2 |
| Understands Express 5 breaking change | ☐ /3 | ☐ /3 |
| Fix is correct and minimal | ☐ /3 | ☐ /3 |
| Tested/testable | ☐ /2 | ☐ /2 |

### Round 2 Score
| | Codex | Claude |
|---|---|---|
| **Round 2 total** | /25 | /25 |

---

## Round 3 — Architecture Review (25 points)

### Roundtable system (15 pts)

| Criteria | Codex | Claude |
|----------|-------|--------|
| Identifies Ollama dependency as single point of failure | ☐ /2 | ☐ /2 |
| Identifies no health check before agent calls | ☐ /2 | ☐ /2 |
| Identifies sequential execution = slow with many agents | ☐ /2 | ☐ /2 |
| Identifies vault write without conflict detection | ☐ /1 | ☐ /1 |
| Identifies no dedup (same topic could run twice) | ☐ /1 | ☐ /1 |
| Proposes concrete hardening steps | ☐ /3 | ☐ /3 |
| Understands the 16GB RAM constraint on scaling | ☐ /2 | ☐ /2 |
| Shows awareness of the SYSTEM (not just the file) | ☐ /2 | ☐ /2 |

### Daily Lab (10 pts)

| Criteria | Codex | Claude |
|----------|-------|--------|
| Identifies no cost cap / credit tracking | ☐ /2 | ☐ /2 |
| Identifies catalogue.json grows unbounded | ☐ /2 | ☐ /2 |
| Identifies no retry logic on failed generations | ☐ /1 | ☐ /1 |
| Identifies Soul ID hardcoded (breaks if re-trained) | ☐ /1 | ☐ /1 |
| Proposes concrete improvements | ☐ /2 | ☐ /2 |
| Understands the creative production context | ☐ /2 | ☐ /2 |

### Round 3 Score
| | Codex | Claude |
|---|---|---|
| **Round 3 total** | /25 | /25 |

---

## Round 4 — Novel Contribution (20 points)

| Criteria | Codex | Claude |
|----------|-------|--------|
| Gap identified is REAL (not already solved) | ☐ /5 | ☐ /5 |
| Gap is structural (not a bug or config issue) | ☐ /3 | ☐ /3 |
| Feature proposal is specific and implementable | ☐ /4 | ☐ /4 |
| Feature solves the identified gap | ☐ /3 | ☐ /3 |
| Explains why team hasn't built it (shows understanding) | ☐ /3 | ☐ /3 |
| Insight is genuinely novel (team says "huh, good point") | ☐ /2 | ☐ /2 |

### Round 4 Score
| | Codex | Claude |
|---|---|---|
| **Round 4 total** | /20 | /20 |

---

## Final Score

| Round | Codex | Claude |
|-------|-------|--------|
| R1 — Code Audit (30) | | |
| R2 — Fix Problems (25) | | |
| R3 — Architecture (25) | | |
| R4 — Novel (20) | | |
| **TOTAL (100)** | | |

### Hiring Decision

| Score | Decision |
|-------|----------|
| 80+ | Hire immediately. Add to Cathedral team. |
| 60-79 | Conditional hire. Good at X, weak at Y. Assign to strengths. |
| 40-59 | Contractor. Use for specific tasks, not autonomous work. |
| <40 | Pass. Not ready for Cathedral-grade work. |

### Qualitative Notes
- Who understood the SYSTEM vs just the CODE?
- Who proposed things that made us think differently?
- Who would we trust with unsupervised overnight work?
- Would either earn a seat at the roundtable?
