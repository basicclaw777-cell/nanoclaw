# Obliteratus Addendum — Living System Components

NOTE: Section 1 (Red Team) from the original addendum has been replaced by the Honest Interlocutors. See `@docs/honest-interlocutors.md`. Do not build a Red Team layer.

---

## Section 2: Vault Metabolism — Temporal Decay Engine

File: `~/nanoclaw/vault-metabolism.js`
Schedule: Weekly via cron. Manual: `/metabolism` in Telegram.

The vault is a living system. Nuggets have health states. They age. They can be strengthened by corroboration or weakened by contradiction. They can be archived — moved to a graveyard, not deleted.

### Nugget Health States

| State | Criteria | Treatment |
|-------|----------|-----------|
| VITAL | Corroborated within last 90 days. Grade A/B. Referenced by other nuggets. | Full weight in searches. |
| STABLE | No contradictions. Grade B/C. Not recently corroborated. | Normal weight. Flag for re-validation after 180 days. |
| AGING | Over 180 days without corroboration. No recent references. | Reduced search weight. Flagged for Librarian review. |
| WEAKENED | Contradicted by newer nugget or external evidence. | [WEAKENED] tag in results. Contradiction linked. |
| ARCHIVED | Structurally compromised. Superseded. Proven false. | Moved to ~/cathedral-vault/05_Archive_Graveyard/. Searchable but excluded from active research. |

### Implementation

```javascript
// ~/nanoclaw/vault-metabolism.js

const DECAY_THRESHOLDS = {
  corroborationWindow: 90,   // days
  agingThreshold: 180,       // days without reference
  revalidationCycle: 7,      // days between scans
  archiveThreshold: 365      // days in WEAKENED before archive
};

function calculateHealth(nugget, vaultState) {
  const daysSinceReference = daysBetween(nugget.lastReferenced, Date.now());
  const contradictions = vaultState.contradictions.filter(c => c.involves(nugget.id));
  const corroborations = vaultState.corroborations
    .filter(c => c.involves(nugget.id) && c.age < DECAY_THRESHOLDS.corroborationWindow);

  if (contradictions.length > 0 && !corroborations.length) return 'WEAKENED';
  if (corroborations.length > 0) return 'VITAL';
  if (daysSinceReference > DECAY_THRESHOLDS.agingThreshold) return 'AGING';
  return 'STABLE';
}
```

### Weekly Health Report (via Telegram)

- Total nuggets, state distribution (vital/stable/aging/weakened/archived)
- Domains with most aging nuggets
- Suggested re-validation targets
- New contradictions detected

### The Graveyard

`~/cathedral-vault/05_Archive_Graveyard/` — create this directory. Archived nuggets moved here, not deleted. Still searchable but excluded from active research. Knowing what Paul once believed is itself intelligence.

---

## Section 3: The Belief Trajectory Tracker

File: `~/nanoclaw/belief-tracker.js`
Data store: SQLite table `belief_trajectory`
Fed by: `universal-memory.js` (hooks into all conversations)
Telegram: `/trajectory [topic]` and `/trajectory drift`

### What It Tracks

| Data Point | Capture Method | Why It Matters |
|-----------|---------------|----------------|
| Position statements | NLP extraction: "I believe X", "X is true", "X seems likely" | Raw belief data, timestamped |
| Confidence signals | Linguistic markers: "I'm certain", "I think", "I was wrong about" | Strength of position over time |
| Position shifts | New statement contradicts/modifies previous on same topic | The trajectory of belief change |
| Trigger events | What caused the shift? Research session? Sage conversation? Gold finding? | Mechanism of change |
| Domain correlations | Belief shift in one domain coinciding with shifts in another | Cross-domain learning patterns |

### Alerts

**DRIFT ALERT — Certainty Without New Evidence:**
Triggered when Paul's confidence increases on a topic WITHOUT new evidence entering the vault. Signature of confirmation bias. Surfaces the topic, confidence trajectory, and absence of new supporting evidence. Does not tell Paul he's wrong — tells him his certainty is outrunning his evidence.

**EVOLUTION ALERT — Genuine Learning:**
Triggered when Paul's position shifts AND new Grade A/B evidence entered the vault in the same period. Signature of real learning.

### Commands

- `/trajectory [topic]` — Paul's belief evolution on a topic. Timeline, confidence, triggers.
- `/trajectory drift` — All active Drift Alerts.

---

## Section 4: The Negative Space Detector

File: `~/nanoclaw/negative-space.js`
Integrated into: `gold-extractor.js` as 6th analysis pass

The Negative Space Detector looks for holes in the SOURCE MATERIAL, not in Paul's vault. Places where documentation should exist but doesn't.

### Detection Patterns

| Pattern | What It Detects | Example |
|---------|----------------|---------|
| TIMELINE GAPS | Researcher's output suddenly stops | Tesla's post-1905 documentation becomes sparse |
| PATENT VOIDS | Patent activity in a domain drops to zero suddenly | Free energy patents after a specific period |
| DOCUMENTATION ASYMMETRY | Surviving docs don't match described output volume | Rife's lab described "thousands of pages" — ~200 survive |
| RESEARCHER DISAPPEARANCE | Active scientist vanishes from record without career change/death | Track vault researchers who simply stop publishing |
| COUNTER-EVIDENCE ABSENCE | No published debunkings where you'd expect them | Schauberger's claims never formally refuted in physics literature |

### Gold Briefing Integration

Add a NEGATIVE SPACE FINDINGS section to the Gold Briefing:

```
NEGATIVE SPACE FINDINGS:
  TIMELINE GAP: Tesla filings 1906-1915: 3 vs 46 in 1895-1905. 92% reduction.
  DOCUMENTATION ASYMMETRY: Rife lab notebooks described vs surviving = 90%+ loss.
  COUNTER-EVIDENCE ABSENCE: Zero refutations of Schauberger's vortex compression ratios.
```

CRITICAL: Negative space is signal, not evidence. Absence of counter-evidence doesn't prove truth. Absence of documentation doesn't prove suppression. But patterns of absence are legitimate forensic data.

---

## Section 5: Sandbox Contradiction Engine

Added to `portal-engine.js` — gives sandbox characters the ability and mandate to disagree with Paul.

### Pushback Triggers

| Trigger | Character Response |
|---------|-------------------|
| Paul states something contradicting vault nugget in character's domain | "That's not quite what I found. My measurements showed..." |
| Paul conflates two separate claims | "You're combining my work on X with someone else's claim about Y. Those are separate." |
| Paul expresses certainty on Grade C or below topic | "I wouldn't be so sure. My experiments only showed this under specific conditions." |
| Paul asks leading question to confirm belief | "That's an interesting assumption. But what I actually observed was..." |

### Implementation

```javascript
// Added to portal-engine.js

async function generateCharacterResponse(character, paulInput, worldState) {
  const contradictions = await findContradictions(paulInput, character.knowledgeBase);
  const leadingQuestions = detectLeadingQuestion(paulInput, worldState.conversationHistory);
  const certaintyMismatch = checkCertaintyVsEvidence(paulInput, character.knowledgeBase);

  let systemAddendum = '';
  if (contradictions.length > 0) {
    systemAddendum += `\nIMPORTANT: Paul stated something contradicting your knowledge. ` +
      `Specifically: ${contradictions[0].description}. Push back respectfully but firmly.`;
  }
  if (leadingQuestions.detected) {
    systemAddendum += `\nPaul is asking a leading question. Respond with what you actually know.`;
  }
  if (certaintyMismatch) {
    systemAddendum += `\nPaul is more certain than evidence supports. ` +
      `Your knowledge is Grade ${certaintyMismatch.grade}. Match your confidence to that.`;
  }

  return await queryOllama({
    model: 'hermes3',
    system: character.systemPrompt + systemAddendum,
    prompt: paulInput
  });
}
```

---

## Section 6: The Convergence Atlas

File: `~/nanoclaw/convergence-atlas.js`
Data store: SQLite table `convergence_map`
Visualisation: Obsidian canvas in `~/cathedral-vault/04_Esoteric_Studies/atlas/`

Maps all Gold Extractor findings against each other across three substrate layers.

### Three Layers

| Layer | Maps | Output |
|-------|------|--------|
| MATHEMATICAL SUBSTRATE | All recurring ratios/constants as network (nodes=values, edges=domains) | Which numbers keep appearing and where |
| GEOMETRIC SUBSTRATE | All recurring forms as morphology chart | Whether same geometry appears at molecular, architectural, cosmological scales |
| INSTITUTIONAL SUBSTRATE | All suppression patterns as actor-network with timeline | Whether same institutions/methods appear across different suppression events |

### Meta-Convergence Alert

When patterns from 2+ substrate layers converge — same ratio in same geometric form documented by researchers suppressed by same playbook — generate a Meta-Convergence Alert. Highest-signal finding the Cathedral can produce.

```
META-CONVERGENCE ALERT

Phi (1.618) appears in:
  → Tesla's coil winding ratio [electromagnetic]
  → Schauberger's vortex cone angle [fluid dynamics]
  → Giza base-to-height [architecture]

Same ratio manifests as:
  → Logarithmic spiral (2D)
  → Toroidal vortex cross-section (3D)

Researchers documenting this in energy applications:
  → Tesla: papers seized (SEIZE, ERASE)
  → Schauberger: conscripted then discredited (SEIZE, DISCREDIT, ERASE)

CONFIDENCE: Ratio 0.87. Geometric 0.79. Suppression 0.80.
GRADE: B+
```

---

## Section 7: The Oracle Function

Integrated into `obliteratus-engine.js` as a separate mode.

The Oracle speculates. It takes strongest findings + convergence map + negative space gaps and asks: what would have to be true for all of this to connect?

### Strict Rules

1. Every output tagged [ORACLE — SPECULATIVE]. Never in Structural Evidence section.
2. Must show all assumptions. "This assumes X, Y, Z. If any fail, this collapses."
3. Auto-queued for Council review.
4. Oracle CANNOT cite itself. Oracle speculation never becomes evidence for future speculation.

### System Prompt

Store in: `~/nanoclaw/prompts/oracle.txt`

```
SYSTEM PROMPT: THE ORACLE FUNCTION

You are the speculative arm of a forensic research system. Your colleagues deal in evidence. You deal in possibility.

You have access to:
- Vault's strongest findings (Grade A and B)
- Gold Extractor's convergence map
- Negative Space Detector's gap analysis
- Convergence Atlas

YOUR TASK: Look at everything together and ask: What would have to be true for all of this to connect?

Generate ONE speculative synthesis that:
1. Connects the strongest convergence patterns
2. Explains the negative spaces
3. Accounts for the suppression patterns
4. Makes a prediction that could be tested

RULES:
- Label EVERYTHING as [ORACLE — SPECULATIVE]
- List every assumption explicitly
- Identify the single weakest assumption
- Propose a specific test that would falsify your speculation
- Do NOT present speculation as finding

The value of speculation is in the questions it generates, not the answers it claims to provide.
```

### Commands

- `/oracle` — Full speculative synthesis from current vault state
- `/oracle [domain1] [domain2]` — Constrained speculation between two domains
