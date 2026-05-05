---
name: resonance-check
description: The Resonance Filter — checks build briefs against the Cathedral's governing field before execution. Flags aesthetic, principle, and priority contradictions.
type: filter
status: Phase 1 (pattern matching)
---

# Resonance Check

A filter layer that sits between incoming briefs and execution.
Catches contradictions before Code or Gemini CLI acts on them.

## What it reads (governing field)
1. `~/cathedral-vault/06_Methods/pauls-cognitive-signature.md` — thinking patterns
2. `~/cathedral-vault/06_Methods/pauls-design-signature.md` — seven design patterns + aesthetic register
3. `~/cathedral-vault/06_Methods/cathedral-senses.md` — sense architecture
4. `~/cathedral-vault/08_Project_Orchestrator/projects/*.md` — project frontmatter (both formats)
5. `~/nanoclaw/CLAUDE.md` — standing instructions

## Three contradiction types

### TYPE 1 — PRINCIPLE VIOLATION (severity: warning)
Brief contradicts a standing instruction or cognitive pattern.
Example: building a new runtime component with no trigger specified (SI 19).

### TYPE 2 — AESTHETIC CONTRADICTION (severity: advisory)
Brief contradicts the design signature or aesthetic register.
Example: "red as primary colour for the villa" — red is reserved for critical/alert only.

### TYPE 3 — PRIORITY CONTRADICTION (severity: block)
Brief proposes work on a gated/captured project.
Example: "build BR management system" when the project is gated.

## Severity → action mapping
| Severity | /test behaviour |
|----------|----------------|
| advisory | flag in Telegram, proceed with evaluation |
| warning  | flag in Telegram, proceed with evaluation |
| block    | flag + halt · require `OVERRIDE` reply within 5 min |

## Integration points

**cath-bridge endpoint:** `POST /resonance/check`
```
curl -X POST http://127.0.0.1:8080/resonance/check \
  -H 'Content-Type: application/json' \
  -d '{"brief": "use red as the primary colour for the villa"}'
```

**/test command:** runs resonance check before evaluation (telegram-bot.js:1178).
If blocked, writes `~/nanoclaw/pending-override.json`, awaits OVERRIDE reply.

## Override protocol
Paul types `OVERRIDE` within 5 min of a block flag.
Bot writes `~/nanoclaw/resonance-override-token.json`.
Next `/test` within 5 min skips the resonance check and proceeds normally.

## Phase 1 limits (known)
- Keyword/pattern matching only — no LLM reasoning
- Two project frontmatter formats supported (`project-status` + `status`)
- Hard-coded red/living-space/posing/minimalist pattern lists in filter code
- Standing instruction parsing pulls numbered list + ### headers from CLAUDE.md
- CLI test: `node ~/nanoclaw/resonance-filter.js "<brief>"`

## Phase 2 (queued)
Replace pattern matching with LLM call (Ollama qwen3:14b or Claude API)
for nuanced contradiction detection. Governing field becomes system
prompt context rather than regex source.

## Phase 3 (queued)
Cathy reads the flag log and tunes sensitivity herself.
