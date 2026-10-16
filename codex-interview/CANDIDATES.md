# Codex Interview — Candidate Queue

Models flagged for a future Code Interview round (the every-2-3-month bake-off).
Run via INTERVIEW.md + PASTE-PACKAGE.md; score in SCORECARD.md / RESULTS-SCORED.md.

---

## Kimi K2.7-Code — Moonshot AI (China)
- **Queued:** 2026-06-18 (Paul's call, after hearing it "coming on strong")
- **Released:** 2026-06-12. 1T-param MoE, coding-focused, open weights (Modified MIT). Via Kimi API + Kimi Code CLI.
- **Why queued:** coding/agentic specialist — candidate for the *automated* tier, head-to-head vs the incumbent DeepSeek V4. Open license = possible future *sovereign* model post-hardware-upgrade.
- **Role to interview for:** Code Auditor & Problem Solver (same INTERVIEW.md rounds as the others).

### What to actually test (Cathedral-specific, not vendor benchmarks)
- **Bake-off vs DeepSeek V4** on real agentic-build tasks from the repo — the non-blocking/execSync problem (Round 2), a cross-file refactor, a cath-bridge route add. DeepSeek is the incumbent to beat.
- **ESM/CJS discipline** — does it respect `.js=ESM / .cjs=legacy` without being told? (past models crashed agents here.)
- **Token efficiency claim** — Moonshot claims ~30% fewer reasoning tokens than K2.6. Verify on a real long-horizon task, not their bench.

### Flags before adopting
- ⚠️ **Self-reported benchmarks only** — launch numbers are all Moonshot's own suites (Kimi Code Bench v2, Program Bench, MLS Bench Lite), NOT SWE-bench Verified / Terminal-Bench / any independent leaderboard. Carlton-filter: don't adopt on vendor numbers.
- ⚠️ **1T params — NOT local.** Box (M4/16GB) can't run it; qwen3:14b already OOMs. So: API-only for now, OR self-host only after the Mac Studio upgrade (see SAM-3 hold decision). It is **not** a fix for any current RAM-bound pain (e.g. Film Room distill — that needs a *small* local model like gemma3:4b).

### Verdict on entry
Interesting, not urgent. Interview it as a cloud automated/coding-tier candidate; decide on real bake-off results vs DeepSeek V4, not the launch hype.
