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
