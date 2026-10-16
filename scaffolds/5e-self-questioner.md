# 5e — The Self-Questioner

## What
A standing agent that reads the Cathedral's own state — vault health, taste gaps, recent activity, knowledge graph density — and generates ONE research question per week. The system identifies its own blind spots and asks Paul to fill them. Not answering — asking.

## Why
Right now Paul pulls every thread. The system waits. Stage 5 = the system becomes a thinking partner that notices what Paul hasn't noticed. Vault metabolism already runs health checks. The Prospector already mines exhaust. This is the next step: the system generates questions that improve ITSELF, not just Paul's knowledge.

## Architecture

### Inputs (read-only, never mutates)
1. **Vault health** — `vault-metabolism.js` output: domain coverage, staleness, connection density
2. **Taste gaps** — `taste-map-api.js` getStats(): which domains are thin? Which have no rejections (untested)?
3. **Knowledge graph** — convergence-atlas.js: which domains have few connections?
4. **Recent activity** — git log on cathedral-vault: what's been touched recently? What's been dormant?
5. **Taste practice** — taste-practice-log.json: what domains are being deposited? What's missing?
6. **Session harvests** — 00_Staging/cathedral/: what patterns are recurring across sessions?
7. **Existing questions** — self-questioner-log.json: what's already been asked? Don't repeat.

### Question Generation
Run hermes3 with a structured prompt:

```
You are the Cathedral's self-diagnostic agent. You've analyzed the system's current state.

Vault coverage: {metabolism summary}
Taste map gaps: {thin domains}
Knowledge graph cold zones: {low-connection domains}
Recent vault activity: {last 7 days of git log}
Recent taste deposits: {last 7 taste practice entries}
Previously asked: {last 10 questions}

Generate exactly ONE question that would most improve the Cathedral's usefulness to Paul.

Rules:
- The question should be answerable through an elicitation session, research, or a build
- It should target a REAL gap, not a theoretical one
- It should be specific enough to act on this week
- It should not repeat or rephrase a previous question
- It should be in Paul's language, not academic language

Format:
QUESTION: [the question]
DOMAIN: [which domain this improves]
SOURCE: [which input revealed the gap]
ACTION: [elicitation | research | build | conversation]
PRIORITY: [1-5, 1 = most urgent]
```

### Output
```json
{
  "date": "2026-07-02",
  "question": "How do you read a new student's emotional state in the first 30 seconds — what are the specific body signals?",
  "domain": "coaching",
  "source": "vault_gap:practitioner_knowledge_thin",
  "action": "elicitation",
  "priority": 2,
  "status": "pending",
  "response": null,
  "respondedDate": null
}
```

### Delivery
- Weekly PM2 cron (Sunday 10:00 HKT = 02:00 UTC)
- Telegram message with the question + why it was asked
- Paul can respond via `/sq answer [text]` or ignore
- Answered questions get logged; the answer feeds the relevant system

## Module Interface
```javascript
// self-questioner.js — ESM
export async function generateQuestion() → Question
export function getQuestionLog() → Question[]
export function answerQuestion(date, answer) → boolean
export function getUnanswered() → Question[]
```

## Routes
- `GET /api/self-questioner/current` — current unanswered question
- `GET /api/self-questioner/log` — all questions + answers
- `POST /api/self-questioner/answer` — submit answer to current question

## Commands
- `/sq` — show current question
- `/sq answer [text]` — answer current question
- `/sq log` — recent questions + status
- `/sq force` — generate a new question now (skip weekly wait)

## Storage
- `~/nanoclaw/self-questioner-log.json` — all questions + answers

## Feeds Back Into
- Answered questions with `action: elicitation` → trigger Archaeologist/Elicitation protocol
- Answered questions with `action: build` → create a task in the next session
- Answered questions with `action: research` → feed to Prospector or Researcher
- The answer text itself → gets deposited into the relevant vault domain

## Test Criteria
1. Run with current vault state → produces a specific, actionable question
2. Question doesn't repeat any in the log
3. Question targets a real gap (verifiable by checking the cited source)
4. `/sq answer` stores the answer and marks question complete
5. Telegram delivery includes the question + source explanation
6. Over 4 weeks: questions should span multiple domains, not fixate on one

## Fable Brief
Build the Self-Questioner for the Cathedral. Read this spec. Read vault-metabolism.js, taste-map-api.js, convergence-atlas.js for the input interfaces. Build self-questioner.js (ESM) that reads all input sources, generates ONE question per week via hermes3, delivers to Telegram, and accepts answers via /sq commands in telegram-bot.js. Add PM2 cron entry. The key constraint: the question must be SPECIFIC and ACTIONABLE — not "how can we improve the vault?" but "the coaching domain has 3 diagnostic moves documented but Paul mentioned 15+ in elicitation — which 12 are missing?" Wire answered questions back into the relevant system (vault, prospector, task queue).
