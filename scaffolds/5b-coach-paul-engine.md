# 5b — Coach Paul Engine (v2 — Learning Architecture)

## What
A coaching intelligence that LEARNS Paul's methodology from logged interventions — not a frozen decision tree. The system observes Paul coaching, extracts patterns, proposes rules with evidence and confidence scores, and Paul approves. Approved rules are version-controlled. Confidence determines autonomy: high-confidence rules fire automatically, low-confidence rules ask Paul.

The engine is liquid, not frozen. Paul drifts, the engine drifts with him.

## Why
The v1 design (encode methodology → decision trees → scores → recommendations) would diverge from Real Paul within months. Coaching heuristics drift constantly — tiny adjustments, new priorities, different sequencing, new edge cases. A static engine becomes "Encoded Paul" vs "Real Paul" and the gap is invisible until it causes harm.

The inverted architecture (log → extract → propose → approve → version) means the engine always reflects Paul's CURRENT methodology, not a snapshot from July 2026.

## Architecture: The Learning Loop

```
Paul coaches a student (real session)
        ↓
Every intervention logged (what Paul said/did, context, student reaction)
        ↓
Pattern extraction (after N observations, system proposes a rule)
        ↓
Rule proposal with evidence + confidence score
        ↓
Paul approves / rejects / modifies
        ↓
Approved rule enters the engine with version + changelog + evidence chain
        ↓
Confidence threshold determines autonomy level
        ↓
System acts (or asks Paul) based on confidence
        ↓
Outcome tracked → evidence feeds back into confidence
```

## Three Layers

### Layer 1: Intervention Log
Raw coaching moments. Paul logs what he did and why — via Telegram, voice note (Whisper transcribe), or session tag. Zero interpretation at this layer.

```json
{
  "id": "int_20260703_001",
  "date": "2026-07-03",
  "student": "Alex",
  "context": {
    "block": 3,
    "drill": "1-2-3-slip",
    "round": 4,
    "fatigue": "moderate"
  },
  "observation": "Guard hand dropping after the 3, leaving right side open",
  "intervention": "Told him to touch his chin after every combo — physical reset cue",
  "reasoning": "Verbal cue wasn't sticking. Needed a physical anchor — the touch creates a checkpoint",
  "outcome": "Guard stayed up for rest of round. Dropped again in round 6 under fatigue",
  "tags": ["guard", "body", "physical_cue", "fatigue_related"],
  "source": "paul_live"
}
```

### Layer 2: Pattern Engine
After N observations with similar tags/context, the system proposes a rule. Uses hermes3 to cluster and synthesize — but the proposal is always traceable to specific interventions.

```json
{
  "id": "rule_guard_physical_reset",
  "version": "1.0",
  "status": "proposed",
  "rule": "When guard drops habitually after combos, prescribe physical reset cue (chin touch) rather than verbal reminder",
  "confidence": 0.72,
  "evidence": {
    "supporting_interventions": ["int_20260703_001", "int_20260710_004", "int_20260715_002"],
    "success_rate": "3/4 students showed improvement within session",
    "failure_cases": ["int_20260712_003 — didn't work for advanced student, already had the habit"],
    "observation_count": 4,
    "time_span_days": 12
  },
  "conditions": {
    "trigger": "guard_drop_after_combo",
    "student_level": "beginner|intermediate",
    "engine": "body",
    "block_range": [2, 4]
  },
  "prescription": {
    "type": "physical_cue",
    "instruction": "Touch your chin after every combo — make it a checkpoint",
    "duration": "until habitual (usually 2-3 sessions)",
    "escalation": "If still dropping after 3 sessions, switch to guard hold intervals"
  },
  "created": "2026-07-15",
  "approved": null,
  "approvedBy": null,
  "changelog": []
}
```

### Layer 3: Confidence-Gated Execution
Approved rules fire based on confidence threshold:

| Confidence | Action | Example |
|-----------|--------|---------|
| 90%+ | Auto-execute — system acts, notifies Paul after | "Prescribed chin-touch reset for Alex's guard drops" |
| 70-89% | Recommend — system proposes, Paul confirms before delivery | "Alex's guard is dropping — suggest physical reset cue?" |
| 50-69% | Ask — system flags the situation, Paul decides | "Alex showing guard drops but pattern doesn't match cleanly — your call" |
| <50% | Collect — insufficient evidence, log and wait | (silent — just logs the observation for future pattern matching) |

Confidence updates over time:
- Successful outcome → confidence +Δ
- Failed outcome → confidence -Δ
- Paul overrides recommendation → confidence reset, log the override reason
- Paul modifies rule → new version, confidence resets to base

## Judgment Version Control

Every rule change produces a changelog entry:

```json
{
  "ruleId": "rule_guard_physical_reset",
  "version": "1.0 → 1.1",
  "date": "2026-08-01",
  "change": "Added condition: not for advanced students who already have guard habit",
  "reason": "Failed on 2 advanced students — the cue was patronizing at their level",
  "evidence": ["int_20260712_003", "int_20260728_009"],
  "approvedBy": "paul"
}
```

This IS the franchise layer. A new coach at a second location doesn't get "Paul's rules from July 2026" — they get the CURRENT rule set with full provenance. They can see WHY each rule exists, what evidence supports it, and when it was last validated.

## Evidence Layer

Every rule traces back to observations. No rule exists without evidence.

| Distinction | What It Means |
|-------------|---------------|
| "Paul prefers this" | Preference — in taste map, not coaching engine |
| "This produced better student outcomes" | Evidence — belongs here |
| "Paul always does this" | Pattern — needs outcome data before it becomes a rule |

A rule without evidence is a hypothesis. The engine distinguishes:
- **Confirmed rules** — evidence supports, outcomes measured (confidence 70%+)
- **Hypotheses** — observed pattern, outcomes not yet measured (confidence 40-69%)
- **Intuitions** — Paul says it works but no logged evidence yet (confidence 30%, flagged for logging)

## Existing Knowledge (Seeds, Not Rules)

These vault files contain Paul's methodology in prose. They are SEEDS for the pattern engine — not rules to hardcode. The engine should treat them as high-confidence hypotheses that still need outcome validation.

### The 6 Diagnostic Coaching Components (diagnostic-empathy-with-surgical-naming.md)
1. Creating safety without announcing it
2. Hearing the wound underneath the words
3. The flinch — energy shift, speed change, misplaced laugh
4. Asking the collapsing question
5. Naming precisely (their language, not categories)
6. Matching intervention to wound type
7. Knowing when to stop

### The Three Engines Model (the-three-engines.md)
- Body (the machine) + Mind (the OS) + Emotion (the energy)
- One currency = ENERGY (organize/cultivate/protect)
- The Fear Gate at block 4→5

### The 13 Cognitive Skills (pauls-cognitive-signature.md)
These are Paul's THINKING patterns, not coaching rules. They inform HOW the engine reasons, not WHAT it prescribes. The engine should exhibit these patterns in its analysis — compression through concrete image, diagnostic inversion, hold-until-pattern — but they're meta-skills, not decision trees.

### Block Progression (10 blocks)
1. Stance & Guard (body)
2. Basic Punches (body)
3. Combinations (body)
4. Defense Basics (body)
5. **Sparring Entry (emotion — FEAR GATE)**
6. Ring Craft (mind)
7. Counter Fighting (mind)
8. Style Development (mind)
9. Competition Prep (emotion)
10. Teaching (mind)

## Decision Records

Every coaching output carries a full decision record. "The audit trail becomes more valuable than the decision."

```json
{
  "decisionId": "dec_20260703_001",
  "studentId": "student_001",
  "date": "2026-07-03",
  "type": "coaching_recommendation",
  "input": {
    "sessionData": "{ metrics snapshot }",
    "studentProfile": "{ profile snapshot }"
  },
  "rulesApplied": [
    { "ruleId": "rule_guard_physical_reset", "version": "1.1", "confidence": 0.87 },
    { "ruleId": "rule_fatigue_drill_switch", "version": "1.0", "confidence": 0.92 }
  ],
  "autonomyLevel": "recommended",
  "model": "hermes3",
  "output": {
    "diagnoses": ["Guard drops correlate with fatigue — prescribe physical reset cue"],
    "prescriptions": ["Chin-touch checkpoint after every combo"]
  },
  "humanOverride": null,
  "overrideReason": null,
  "overrideDate": null
}
```

Every `diagnose()` call writes a decision record to `~/nanoclaw/coaching-decisions.json`. The record captures:
- Which rules fired and at what confidence
- Which model ran the analysis
- What autonomy level was applied (auto/recommended/ask/collect)
- The full output
- Whether Paul overrode it (populated later via `/coach override`)

Decision records are what make the coaching engine auditable, transferable, and franchise-ready. A second coach at a second location can see not just WHAT was recommended, but WHY — which rules, which evidence, which confidence threshold. And when Paul overrides, that override feeds back into confidence calibration.

## Module Interface
```javascript
// coaching-engine.js — ESM

// Intervention logging
export function logIntervention(intervention) → InterventionRecord
export function getInterventionLog(filters) → InterventionRecord[]

// Pattern extraction (run periodically or on-demand)
export function extractPatterns(minObservations) → RuleProposal[]
export function getPendingProposals() → RuleProposal[]

// Rule management
export function approveRule(ruleId, modifications) → Rule
export function rejectRule(ruleId, reason) → void
export function getRules(filters) → Rule[]
export function getRuleChangelog(ruleId) → ChangelogEntry[]

// Active coaching (uses approved rules only)
export function diagnose(sessionData, studentProfile) → CoachingOutput (includes DecisionRecord)
export function assessNewStudent(firstSessionData) → InitialAssessment
export function detectPlateau(sessionHistory) → PlateauReport | null

// Decision records
export function getDecisionLog(filters) → DecisionRecord[]
export function overrideDecision(decisionId, override, reason) → DecisionRecord

// Confidence + evidence
export function updateConfidence(ruleId, outcome) → number
export function getEvidenceChain(ruleId) → Evidence[]

// Version control
export function getRuleVersion(ruleId, version) → Rule
export function getRuleHistory(ruleId) → Rule[]
```

## Routes
- `POST /gym-eyes/coach/log` — log an intervention
- `GET /gym-eyes/coach/log` — view intervention log
- `POST /gym-eyes/coach/extract` — run pattern extraction
- `GET /gym-eyes/coach/proposals` — pending rule proposals
- `POST /gym-eyes/coach/approve/:ruleId` — approve a rule
- `POST /gym-eyes/coach/reject/:ruleId` — reject a rule
- `GET /gym-eyes/coach/rules` — active rules with confidence + evidence
- `GET /gym-eyes/coach/rules/:ruleId/history` — rule version history
- `POST /gym-eyes/coach/diagnose` — run diagnosis on session data (returns CoachingOutput + DecisionRecord)
- `POST /gym-eyes/coach/assess` — new student assessment
- `GET /gym-eyes/coach/progression/:studentId` — block progression map
- `GET /gym-eyes/coach/decisions` — decision audit log (filterable by student, date, autonomy level)
- `POST /gym-eyes/coach/decisions/:decisionId/override` — Paul overrides a decision (reason required)

## Commands
- `/coach log [observation]` — quick-log an intervention from Telegram
- `/coach proposals` — view pending rule proposals
- `/coach approve [id]` — approve a proposed rule
- `/coach reject [id] [reason]` — reject with reason
- `/coach rules` — active rules summary
- `/coach diagnose [student]` — run latest session through engine
- `/coach confidence` — rules sorted by confidence (lowest first = needs more evidence)
- `/coach changelog` — recent rule changes
- `/coach decisions [student]` — decision audit trail
- `/coach override [decisionId] [reason]` — override a recommendation (feeds back into confidence)

## Storage
- `~/nanoclaw/coaching-interventions.json` — raw intervention log
- `~/nanoclaw/coaching-rules.json` — versioned rules with evidence chains
- `~/nanoclaw/coaching-changelog.json` — all rule changes with provenance
- `~/nanoclaw/coaching-decisions.json` — decision records (full audit trail per coaching output)

## Test Criteria
1. Log 5 interventions with similar tags → system proposes a rule with evidence chain
2. Approve a rule → appears in active rules with version 1.0
3. Rule fires on matching session data → output uses Paul's language from the original interventions
4. Override a recommendation → confidence drops, override reason logged
5. Modify a rule → new version created, old version preserved, changelog entry written
6. High-confidence rule (90%+) auto-executes → Paul gets notification AFTER, not before
7. Low-confidence situation (<50%) → system logs silently, no recommendation
8. Rule version history shows full provenance: when created, what evidence, every modification, every outcome
9. Vault seeds loaded as hypotheses (confidence ~60%), not confirmed rules — they need outcome data

## Fable Brief
Build the learning coaching engine for Gym Eyes. THIS IS NOT A DECISION TREE. Read this spec carefully — the architecture is inverted: Paul coaches → system logs interventions → extracts patterns → proposes rules with evidence → Paul approves → rules version-controlled with changelog → confidence determines autonomy. 

Read the vault files (diagnostic-empathy-with-surgical-naming.md, pauls-cognitive-signature.md, the-three-engines.md, the-fear-gate-model.md) as SEEDS — load them as hypotheses (confidence ~60%) that need outcome validation, not as confirmed rules.

Build coaching-engine.js (ESM) with all exports listed above. Wire into cath-bridge.cjs routes. Add Telegram commands to telegram-bot.js. Create the three JSON stores.

The key architectural constraint: NO RULE EXISTS WITHOUT EVIDENCE. Every rule traces back to logged interventions. Every rule has a confidence score. Every rule change has a changelog entry. This is Git for coaching philosophy — the franchise layer that makes Paul's methodology transferable, auditable, and alive.
