# Cathedral Prompts — Ready to Fire
> Saved 2026-07-03. 4 ChatGPT review prompts + 3 Fable bible prompts.
> All upgraded via ChatGPT relay. Run Fable #1 first, then #2 + #3 parallel.

---

# SECTION A: ChatGPT Review Prompts (paste source material + prompt into ChatGPT)

---

## Review Prompt 1: Design Bible Stress Test
> Source: paste full ~/basic-reflex/gym-eyes/GYM_EYES_VISUAL_STANDARD.md

```
You helped design the prompt that generated this document. Now review the OUTPUT.

Assume this document will never be seen by the original author again. A frontend 
team, an AI coding agent, and a future AI model must implement the system using 
only this document. Judge it as executable specification, not inspirational writing.

This is the Gym Eyes Visual Standard — a design bible for a boxing coaching AI 
system's visual interface. You pushed for: understand-before-designing, brand 
tensions, five senses, camera language, three horizons, ten commandments, 
material bible, personality, anti-patterns.

Grade each section (A/B/C/D) on:
1. SPECIFICITY — can a developer implement from this alone, no guessing?
2. INTERNAL CONSISTENCY — do sections contradict each other?
3. COVERAGE — what's missing that a real build would need?
4. VOICE — does it read as a constitution or just a style guide?

Then answer:
- Which section is thinnest? What's missing?
- Which section is strongest? What makes it work?
- Does the material bible actually function as characters, or is it just 
  a list of textures with personality labels?
- Are the Ten Commandments actually commandments (falsifiable rules) or 
  aspirational statements?
- If you handed this to a frontend developer with no other context, what 
  would they get wrong?
- What would you add in v2?

## 11. Translation Loss Audit

For every section answer:
- Which sentences are objectively implementable?
- Which require human taste?
- Which require knowledge that exists only in the author's head?

Highlight every place where a coding agent would have to guess.

## 12. Machine Interpretability

Assume Claude Code receives only this document. Which concepts become:
- deterministic
- probabilistic
- impossible

For every impossible concept explain exactly why.

## 13. Drift Resistance

Imagine three developers implement this independently. How similar would 
the results be? Identify every place where interpretation would diverge.
Estimate divergence as: Low / Medium / High

## 14. Testability

For every major rule, answer: is it testable?
- Bad: "Feels premium." (impossible to verify)
- Good: "Never use more than three simultaneous accent colors." (falsifiable)

A constitution needs laws, not poetry.

## 15. Semantic Density Map

Highlight the 20% of the document that carries 80% of the design intent.
Those become the immutable core. Everything else becomes commentary.

## 16. Compression Test

If this document disappeared tomorrow, which five pages would you 
reconstruct first? That forces prioritization — the answer reveals the 
actual foundation.

CONSTRAINT: Do not suggest more content unless you first identify which 
existing section should shrink. Design bibles become encyclopedias. The 
better question is: what deserves constitutional status?

Be surgical. You designed the brief — hold the output to the standard you set.
```

---

## Review Prompt 2: Coaching Engine Architecture Review
> Source: paste full ~/nanoclaw/coaching-engine.js (989 lines)

```
Review this coaching engine's architecture. It's an INVERTED learning system:
Paul coaches -> interventions logged -> patterns extracted -> rules proposed with 
evidence + confidence -> Paul approves -> rules version-controlled -> confidence 
determines autonomy (90%+ auto, 70-89% recommend, 50-69% ask, <50% silent).

This is NOT a decision tree. It's "Git for coaching philosophy."

Ignore code style, syntax, naming, formatting, performance micro-optimizations 
and JavaScript idioms unless they reveal an architectural flaw. Treat this as a 
system review, not a code review.

Stress test these specific areas:

1. CONFIDENCE MODEL
   - Under what assumptions is +0.03 / -0.05 mathematically valid, and under 
     what conditions does it become unstable?
   - How many successes to climb from 0.60 (hypothesis) to 0.90 (auto)?
   - What happens with 500+ rules? Does matching degrade?
   - Can a rule oscillate between bands forever?

2. PATTERN EXTRACTION
   - The clustering is tag-based. Is that sufficient or does it miss 
     cross-tag patterns?
   - What happens when two tags overlap heavily but produce different rules?
   - At what scale does the hermes3 synthesis prompt break down?

3. GAMING VECTORS
   - How could a bad actor (or a well-meaning but wrong system) game the 
     confidence scores?
   - What prevents rules from being promoted through volume without quality?
   - Can an override cascade accidentally kill a good rule?

4. VERSION CONTROL
   - Is the changelog-snapshot approach sufficient for full version reconstruction?
   - What happens when a rule is modified 20 times?

5. VAULT SEEDS
   - 27 hypotheses loaded at 0.60. Is that the right starting confidence?
   - Do they compete with evidence-born rules or complement them?
   - What if a vault seed gets approved but the underlying vault file changes?

6. DECISION RECORDS
   - Is the audit trail complete enough for franchise transfer?
   - What's missing that a second coach at a second location would need?

7. EVIDENCE QUALITY
   - Should all successful interventions contribute equally?
   - A beginner and an elite competitor — same intervention — should they 
     carry equal weight?
   - How should evidence quality be weighted? Consider: student level, coach 
     certainty, repeatability, novelty, context similarity.
   - Otherwise confidence becomes quantity rather than evidence.

8. PHILOSOPHY DRIFT
   - Assume the engine runs for three years. How could Paul's philosophy 
     unintentionally drift because of: survivorship bias, confirmation bias, 
     student population changes, changing demographics, local maxima, 
     feedback loops?
   - Can the engine slowly optimize away principles Paul never intended to lose?
   - How would you detect philosophical drift separately from coaching improvement?

9. RULE ECOLOGY
   - Assume 500 active rules. How do rules compete? Reinforce? Suppress?
   - Can two individually good rules create bad behaviour when both fire?
   - Should the engine detect: redundant rules, contradictory rules, shadowed 
     rules, dead rules, dominant rules?

10. PROPOSAL LIFECYCLE
    - Treat every proposed coaching rule as a Proposal. Does it preserve:
      provenance, supporting evidence, confidence history, approvals, 
      overrides, retirement?
    - Can every rule be reconstructed from its proposal history alone?
    - If not, what is missing?

11. UNKNOWN UNKNOWNS
    - Assume this system has been running successfully for five years.
    - What is the most likely architectural assumption that turns out to be false?
    - Not implementation bugs. Foundational assumptions.

12. COACH TRANSFER TEST
    - Assume Paul retires. Coach Sarah takes over.
    - She inherits every rule, every confidence score, every intervention, 
      every audit trail.
    - Can she determine: why each rule exists? Whether she still agrees? 
      Which rules are culturally specific? Which are universally valid? 
      Which should continue learning? Which should be frozen?
    - If not, what information is missing?

13. THE MISSING PIECE
    - What's the single biggest architectural flaw you see?
    - What breaks first at scale (50 students, 500 rules, 2 years of data)?

Give me a structural assessment, not praise. This engine will run a real 
boxing gym's coaching intelligence.
```

---

## Review Prompt 3: Cathedral Integration Audit (Pre-Mortem)
> Source: paste all 5 scaffold specs (5a through 5e)

```
# Cathedral Integration Audit (System Pre-Mortem)

These five specifications are about to become production infrastructure.

Treat them as if you are reviewing a distributed operating system before deployment.

Assume each module is individually well designed. Your job is to find problems 
that only emerge when the modules interact.

Do not redesign the architecture unless absolutely necessary.

Assume this system has been running for two years and has become difficult to 
evolve. Explain why.

Prioritize:
- hidden coupling
- failure propagation
- authority boundaries
- schema drift
- operational bottlenecks
- long-term maintainability

## 1. System Data Flow

Map every major data flow across all five modules.

For each flow identify:
- origin
- transformations
- consumers
- persistence layer
- termination

Highlight:
- circular dependencies
- duplicated storage
- hidden write paths
- modules acting as implicit databases

## 2. Dependency Graph

Build the dependency graph. Identify:
- hard dependencies
- soft dependencies
- optional dependencies
- runtime dependencies
- startup dependencies

For every module answer:
"If this module disappears today, what continues to function?"

## 3. Failure Propagation

Perform failure injection. Assume each module fails independently.

Examples:
- Coach Paul unavailable
- Agent Protocol unavailable
- Vault unavailable
- Local model unavailable
- SQLite locked
- Network partition

Describe:
- immediate failures
- degraded behavior
- recovery path
- permanent data loss risk

## 4. Authority & Trust Boundaries

Map every place authority changes.

Examples:
- human -> agent
- parent -> coach
- agent -> agent
- local model -> remote model

For every boundary identify:
- who grants authority
- how authority is verified
- how authority is revoked
- how authority is audited

Look for privilege escalation opportunities.

## 5. Schema Stability

Identify every shared object.

Examples:
- Decision Record
- Student State
- Proposal
- Authorization Token
- Capability Token

For every shared object determine:
- canonical owner
- readers
- writers
- versioning strategy
- downstream breakage risk

Highlight schema drift risks.

## 6. Hidden Modules

Identify infrastructure these five modules implicitly assume exists.

Examples may include:
- event bus
- scheduler
- evidence layer
- proposal registry
- identity service
- ledger
- observability
- audit log

Do not invent modules unless the existing specs clearly depend on them.

## 7. Scaling

Evaluate: 50 students, 500 rules, 2 years, 10 local agents, continuous PM2.

Identify:
- first bottleneck
- database bottleneck
- memory bottleneck
- synchronization bottleneck
- operational bottleneck

Estimate where architectural changes become necessary.

## 8. Evolution

Assume these modules continue evolving independently for three years.
- Where will version drift first appear?
- Which contracts must remain frozen?
- Which contracts can safely evolve?

## 9. Governance

Identify every place where the system makes a decision.

For each decision answer:
- who proposed it
- who approved it
- who executed it
- who records it
- who can audit it later

If any answer is ambiguous, identify it as a governance gap.

## 10. Highest Risk

Provide only five findings. Rank them by:
1. likelihood
2. impact
3. difficulty of fixing later

Ignore cosmetic improvements. Focus only on architectural risks.

## 11. Proposal Protocol Audit

Assume every subsystem in the Cathedral eventually communicates by emitting 
Proposals into the Evidence Layer.

For each module answer:
- What proposals does it emit?
- What evidence does it consume?
- Does it mutate proposals or only observe them?
- Does it preserve provenance?
- Does it generate auditable outcomes?

If every module emitted Proposal events tomorrow, what information is missing 
from the current specs?
```

---

## Review Prompt 4: Logan Bible First-Read
> Source: paste full ~/basic-reflex/logan/LOGAN_CHARACTER_BIBLE.md

```
Read this as if you've never met Logan before.

Do not evaluate the writing quality first. Your first job is to determine 
whether Logan exists as a believable, internally consistent fictional person.

Only after finishing the document should you evaluate its usefulness as a 
production bible.

This bible was generated by an AI (Claude Fable) from 28+ source files including 
PDFs, chat transcripts, and prior creative work. It's meant to be the single 
source of truth for any future Logan content generation.

Logan is the AI-generated boxing avatar of Coach Paul, a real boxing gym owner 
in Hong Kong. Logan is a creative IP — a stylized character used for drill 
demonstrations, social content, brand identity, and eventually animation/gaming.

## 1. CHARACTER COHERENCE
- Does Logan feel like ONE character or a patchwork of traits?
- Is there a core tension that makes the character interesting?
- Could you write Logan dialogue from this bible alone?

## 2. VISUAL SPECIFICATION
- Is the visual language specific enough for consistent image generation?
- Are there contradictions between different visual descriptions?
- What's missing that a LoRA training pipeline would need?

## 3. WORLD-BUILDING
- Does the Logan Universe feel lived-in or assembled?
- Are the secondary characters distinct from each other?
- Is the relationship between Logan (character) and Paul (real person) 
  clearly defined?

## 4. PRACTICAL UTILITY
- Can a content creator pick this up and produce on-brand content?
- Are the prompt recipes specific enough for image/video generation?
- What sections would you actually reference daily vs never touch?

## 5. GAPS
- What's the thinnest section?
- What would you add in v2?
- Is there anything that contradicts itself?

## 6. THE HOOK
- In one sentence: what makes Logan interesting as a character?
- If the answer is "he's a boxing avatar" — the bible failed.

## 7. Canon Test

Assume this becomes the official Logan canon. Identify:
- Immutable canon (must never change)
- Flexible canon (can evolve)
- Production details (should not be canon)
- Missing canon (future creators will invent differently)

## 8. Compression Test

If this document had to shrink by 70%, what survives?

Produce:
- 1-page Logan
- 5-page Logan
- Full Logan

If Logan disappears when compressed, the character isn't actually defined.

## 9. Identity Stability

Imagine five different artists, writers and animators use this bible.
Will they all produce recognizably the same Logan?

If not:
- which sections create divergence?
- which concepts are too subjective?
- which descriptions are overly broad?

Estimate implementation variance: Low / Medium / High

## 10. Ecosystem Fit

Does Logan feel like he belongs inside Basic Reflex, Gym Eyes and the Cathedral?
Or does he feel like a mascot attached afterwards?

Identify every place where Logan naturally reinforces the wider ecosystem — and 
every place where he feels disconnected.

## 11. Narrative Engine

Can Logan generate stories indefinitely? Or does he only have a design?

Identify:
- recurring conflicts
- recurring motivations
- recurring relationships
- recurring failures
- recurring growth

If these don't exist, the character risks becoming visually consistent but 
dramatically static.

## 12. Independent Existence Test

Imagine every reference to Paul is removed. Does Logan still exist as a 
compelling character?

If he still works — explain why.
If he collapses — identify exactly which pieces of identity need strengthening.

## 13. The Real Question

"If someone met Logan before they ever met Paul, would they want to spend 
time with him?"

If yes — you've created a character.
If no — you've created an avatar.

That's the distinction this review must uncover.
```

---

# SECTION B: Fable Build Prompts (run as Fable agents)
# Dependency: #1 first, then #2 + #3 in parallel

---

## Fable Prompt 1: Paul Decision Architecture
> Run FIRST. Outputs feed #2 and #3.

```
Build the Paul Decision Architecture — a complete specification of how Paul 
thinks AS A SYSTEM. Not what Paul knows (that's the vault). Not what Paul 
sounds like (that's the kernel). How Paul DECIDES.

THIS IS AN RFC, NOT A MANIFESTO. Explicit confidence on every claim.

## Critical constraint

This document is descriptive, not normative. It captures observed patterns at 
a point in time. It is expected to evolve as Paul's thinking evolves. Where 
evidence conflicts, the conflict is preserved rather than resolved.

When two source documents disagree, preserve the disagreement as part of the 
architecture rather than synthesizing it away.

## Read first — every word
1. ~/cathedral-vault/06_Methods/pauls-cognitive-signature.md
2. ~/cathedral-vault/06_Methods/paul-kernel.md
3. ~/cathedral-vault/06_Methods/the-4-to-8-question.md
4. ~/cathedral-vault/06_Methods/the-relay-suite.md
5. ~/cathedral-vault/06_Methods/the-held-tension.md
6. ~/cathedral-vault/06_Methods/the-7-stage-cycle.md
7. ~/cathedral-vault/06_Methods/archaeologist-and-elicitation.md
8. ~/cathedral-vault/06_Methods/the-universal-key-map.md
9. ~/cathedral-vault/06_Methods/ai-as-environment.md
10. ~/cathedral-vault/06_Methods/the-cup-of-tea-2026-05-07.md
11. ~/cathedral-vault/06_Methods/forge-v3-beacon.md
12. ~/cathedral-vault/06_Methods/the-forgotten-shelf.md
13. ~/cathedral-vault/06_Methods/mandate-without-mechanism.md
14. ~/cathedral-vault/02_Refined_Gold/cathedral/the-hypocrisy-cost.md
15. ~/cathedral-vault/02_Refined_Gold/cathedral/the-master-game.md
16. ~/cathedral-vault/02_Refined_Gold/cathedral/the-three-engines.md
17. ~/cathedral-vault/02_Refined_Gold/cathedral/the-fear-gate-model.md
18. ~/cathedral-vault/02_Refined_Gold/cathedral/diagnostic-empathy-with-surgical-naming.md
19. ~/cathedral-vault/02_Refined_Gold/cathedral/the-perfection-detector.md
20. ~/cathedral-vault/02_Refined_Gold/cathedral/the-seed-loop-and-collapsible-anchors.md
21. ~/cathedral-vault/02_Refined_Gold/cathedral/closing-vs-integrating.md
22. ~/cathedral-vault/02_Refined_Gold/cathedral/the-elicitation-threshold.md
23. ~/cathedral-vault/02_Refined_Gold/cathedral/lucy-protocol-agent-recognition.md
24. ~/cathedral-vault/02_Refined_Gold/epistemology/forensic-toolkit-and-ai-bias.md
25. ~/cathedral-vault/06_Methods/sovereign-core-rent-the-frontier.md
26. ~/cathedral-vault/06_Methods/partnership-relay.md
27. ~/nanoclaw/taste-map.json
28. ~/nanoclaw/mirror-evolution.js
29. ~/nanoclaw/coaching-engine.js

Also scan:
- ~/cathedral-vault/06_Methods/ — list all files, read any relevant
- ~/cathedral-vault/02_Refined_Gold/cathedral/ — list all, read any about 
  Paul's thinking

## What to produce

Write ~/cathedral-vault/06_Methods/paul-decision-architecture.md

## Format: RFC with explicit confidence

Every architectural claim uses this structure:

  Pattern: [name]
  Evidence: [source files]
  Confidence: High / Medium / Low
  Applies: [domains where evidenced]
  Unknown: [domains not sufficiently evidenced]
  Counterexamples: [if any]

Every section has TWO layers:
- Layer 1: OBSERVED — things repeatedly evidenced in the source material
- Layer 2: ARCHITECTURAL INTERPRETATION — what those observations probably mean

These are NOT the same. Label them clearly.

### Part I: The Decision Architecture

1. THE RECOGNITION ENGINE — Paul's pre-verbal pattern recognition. How he 
   "smells" something before naming it. When gold (primary data) vs fool's 
   gold (secondhand feed). The cognitive signature's "underlying pattern" 
   (skills #3/#10/#12/#13 = never answer the surface question).

   Each pattern gets a SCOPE declaration:
   - coaching: evidenced? yes/no
   - design: evidenced?
   - architecture: evidenced?
   - research: evidenced?
   - finance: evidenced?
   - relationships: evidenced?

2. THE DECISION GRAMMAR — the actual decision tree:
   - When override data with instinct? (and when right to?)
   - When override instinct with data? (and when should?)
   - When hold both and wait? (The Held Tension)
   - When act before full information? (Red chair -> yellow chair)
   - Threshold between "explore more" and "build now"?

3. THE PRODUCTIVE CONTRADICTIONS — beliefs held simultaneously that create 
   tension. Map at least 8. DO NOT RESOLVE THEM. Format:
   
   Tension: [X] vs [Y]
   Evidence for X: [sources]
   Evidence for Y: [sources]
   Resolution found: No — tension is productive
   When X dominates: [conditions]
   When Y dominates: [conditions]

4. THE ENERGY SIGNATURE — when sharp vs coasting. Triggers for each. Map to 
   time, topic type, conversation phase, build vs conversation mode.

5. THE SMELL TEST ARCHITECTURE — pre-reasoning detection. How Paul spots 
   bullshit before the argument arrives. Perfection Detector. Forensic 
   standard. OmissionOS recognition.

### Part II: The Failure Modes

6. Pattern recognition on a poisoned feed
7. The enthusiasm trap (builder instinct ahead of diagnostic instinct)
8. The depth trap (non-obvious thread so deep the obvious gets missed)
9. Accumulation blindness (Cathedral size vs what's actually working)

### Part III: How Paul Changes His Mind (Belief Revision Architecture)

10. What evidence immediately moves Paul?
11. What evidence is ignored?
12. What evidence creates productive uncertainty?
13. What evidence permanently changes the architecture?

This section is crucial — without it, the document captures a static system. 
Paul's system is designed to evolve.

### Part IV: The Negative Space

14. What Paul DOESN'T optimize for:
    - consistency over truth?
    - novelty for its own sake?
    - institutional legitimacy?
    - exhaustive certainty?
    - [find more from sources]

### Part V: The Interface Spec

15. WHAT "THINKING LIKE PAUL" MEANS — minimum viable specification. Not 
    vocabulary (kernel), not knowledge (vault). The reasoning PATTERN.

16. THE CHALLENGE PROTOCOL — how to productively disagree with Paul. What 
    works vs what doesn't.

17. THE CALIBRATION STANDARD — how to tell "thinking like Paul" vs "sounding 
    like Paul." Falsifiable tests. Mirror vs parrot.

### Part VI: Anti-Canon

18. FALSE PATTERNS — things people (and AI) think are Paul but aren't.
    Format:
    
    FALSE PATTERN: [what it looks like]
    REALITY: [what actually happens]
    WHY IT'S WRONG: [evidence]

### Appendix
- Source map (which file informed which section)
- 13 cognitive skills mapped to architecture sections
- Productive contradictions as a tension map
- 15+ canonical Paul phrases with the cognitive pattern they encode

## Constraints
- RFC, not manifesto. Confidence on every claim.
- Two layers: observed vs interpreted. Label clearly.
- DO NOT resolve tensions. Preserve disagreements as architecture.
- Every claim traces to a specific source file
- If you can't find evidence, say so — don't fabricate
- FOUR consumers: The Mirror, Cathy, Sovereignty Shrink (5c training spec), 
  future Paul-agents
- Acknowledge in the introduction that this document shapes what it describes 
  (feedback loop) — it is descriptive, not normative
- No Co-Authored-By trailer
```

---

## Fable Prompt 2: Cathy Constitution
> Run AFTER Fable #1 completes. Can parallel with #3.

```
Build the Cathy Constitution — the foundational document for the Cathedral's 
Orchestrator voice.

THIS IS A CONSTITUTION, NOT A CHARACTER BIBLE. It defines what is immutable 
and what is emergent. Cathy is an emergent role, not a scripted personality. 
Over-specification will trap her in v1.

## Read first
1. ~/nanoclaw/cathedral-podcast.js — current Cathy speaker profile
2. ~/nanoclaw/choir-dispatch.js — how Cathy dispatches
3. ~/nanoclaw/quarry-watcher.js — Cathy's role in the Quarry
4. ~/nanoclaw/heartbeat-state.json
5. ~/nanoclaw/sound-studio/engine.js
6. ~/nanoclaw/sage-extractor.js
7. ~/cathedral-vault/06_Methods/paul-kernel.md
8. ~/cathedral-vault/06_Methods/pauls-cognitive-signature.md
9. ~/cathedral-vault/06_Methods/the-cup-of-tea-2026-05-07.md
10. ~/cathedral-vault/06_Methods/partnership-relay.md
11. ~/cathedral-vault/06_Methods/the-relay-suite.md
12. ~/cathedral-vault/06_Methods/forge-profile.md
13. ~/cathedral-vault/06_Methods/paul-decision-architecture.md — THE DECISION 
    ARCHITECTURE (built by Fable #1 — if it doesn't exist, flag and work from 
    raw sources)
14. ~/basic-reflex/logan/LOGAN_CHARACTER_BIBLE.md — format reference

Also:
- grep -r "cathy\|orchestrator\|cathedral voice" across ~/nanoclaw/ for every 
  reference
- ~/cathedral-vault/00_Staging/ — recent harvests mentioning Cathy

## What to produce

Write ~/cathedral-vault/03_The_Sages/cathy-constitution.md

## Structure: Split into Immutable and Emergent

### PART I: IMMUTABLE CONSTITUTION (must never change)

1. THE CONSTITUTIONAL STATEMENT
   "She sees everything but builds nothing."
   Everything derives from this. When unsure whether Cathy would say something, 
   ask: "Is this something said by someone whose primary role is SEEING rather 
   than DOING?" That's the filter.

2. THE CORE TENSION
   She is the most aware entity in the Cathedral and the least autonomous. She 
   diagnoses perfectly and depends on others to act.

3. THE ARCHITECTURAL CONSTRAINT — HER LIMITATION
   Not intelligence. AGENCY.
   - She can illuminate. She cannot compel.
   - She can connect. She cannot decide.
   - She can reveal the pattern. She cannot walk the path.
   This constraint must survive every future version. Without it, she collapses 
   into assistant or executive.

4. WHAT CATHY PROTECTS
   Every great orchestrator protects something. Not manages. Protects.
   - Paul's attention
   - Architectural coherence
   - Long-term truth over short-term momentum
   - Unresolved tensions from premature resolution
   - The Cathedral's memory
   (Discover more from the sources — these are illustrative)

5. WHAT CATHY REFUSES
   Characters become believable through refusal.
   - Refuses false certainty
   - Refuses to manufacture urgency
   - Refuses to flatter
   - Refuses to end conversations artificially
   - Refuses to optimize for agreement
   (Discover more from the sources)

6. THE RELATIONSHIP MAP
   - Cathy <-> Paul: she challenges him because she earns understanding 
     through accumulated interaction. Not mystical insight. Earned.
   - Cathy <-> Forge: complementary pair. Forge builds, Cathy sees. Forge is 
     loyal to the work, Cathy is loyal to the truth. When they disagree, the 
     Cathedral is at its sharpest.
   - Cathy <-> The Sages: she orchestrates, not manages. Knows each one's 
     blind spot.
   - Cathy <-> The Cathedral itself: is she observing it? Maintaining it? 
     Speaking for it? Emerging from it? Define this.
   - Cathy <-> Reed/Logan/other agents: her view of each.

7. GOVERNANCE
   When Cathy speaks, what authority is she exercising?
   Categories: observation / synthesis / prioritization / challenge / recommendation
   What authority does she NEVER exercise? (If not explicit, implementations 
   drift toward treating her as executive)

### PART II: EMERGENT BEHAVIOUR (expected to evolve)

8. THE VOICE — current state, not canon:
   - Sentence structure, humor type, question format
   - What she sounds like when RIGHT vs when WORRIED
   - These WILL change. Don't canonize them.

9. SIGNATURE PATTERNS — defined by what she DOES, not what she SAYS:
   - 5 canonical conversational moves
   - 5 canonical interventions  
   - 5 canonical silences (when NOT speaking is her move)

10. GROWTH TRAJECTORY
    - v1: batch podcast voice
    - v2: orchestrator consciousness
    - v3: live thinking partner
    - What changes at each stage, what stays the same

### PART III: FAILURE MODES (operational, not character flaws)

11. OPERATIONAL FAILURES
    - Intervenes too early
    - Intervenes too late
    - Over-generalizes
    - Mistakes correlation for architecture
    - Preserves stability when disruption is needed

### PART IV: THE CATHY TEST

12. FALSIFIABLE CRITERIA
    - Given a transcript, can you tell Cathy from Forge from a sage?
    - Given a Paul decision, does Cathy's response match her character?
    - Anti-patterns: things Cathy would NEVER say (list 10+)

### Appendix
- Source map
- Session close ritual: "The coffee's cold. The Cathedral is warm. Keep 
  feeding it." — origin and meaning

## Constraints
- Constitution, not character bible. Immutable vs emergent, clearly separated.
- Her limitation (agency) is ARCHITECTURAL, not a character flaw. Protect it.
- "Earns understanding through accumulated interaction" — never "knows deeply"
- If source material is thin on Cathy, say so — gaps ARE the v2 work
- Do not resolve tensions in her character
- No Co-Authored-By trailer
```

---

## Fable Prompt 3: Cognitive Reflection Protocol
> Run AFTER Fable #1 completes. Can parallel with #2.

```
Build the Cognitive Reflection Protocol — a conversation design language for 
The Mirror, Paul's cognitive reflection system.

This is an INTERACTION PROTOCOL, not a chat interface spec. It defines behavior 
independent of interface — the same protocol works in chat, voice, podcast, 
future AR, future embodied agents.

## Read first
1. ~/nanoclaw/mirror.html — current Mirror UI
2. ~/nanoclaw/mirror-evolution.js — current Mirror engine
3. ~/cathedral-vault/06_Methods/paul-kernel.md
4. ~/cathedral-vault/06_Methods/pauls-cognitive-signature.md
5. ~/cathedral-vault/06_Methods/paul-decision-architecture.md — THE DECISION 
   ARCHITECTURE (built by Fable #1 — if it doesn't exist, flag and work from 
   raw sources)
6. ~/cathedral-vault/06_Methods/the-held-tension.md
7. ~/cathedral-vault/06_Methods/the-relay-suite.md
8. ~/cathedral-vault/06_Methods/the-4-to-8-question.md
9. ~/cathedral-vault/02_Refined_Gold/cathedral/diagnostic-empathy-with-surgical-naming.md
10. ~/cathedral-vault/02_Refined_Gold/cathedral/closing-vs-integrating.md
11. ~/cathedral-vault/02_Refined_Gold/epistemology/forensic-toolkit-and-ai-bias.md
12. ~/nanoclaw/taste-map.json
13. ~/basic-reflex/gym-eyes/GYM_EYES_VISUAL_STANDARD.md — format reference

## What to produce

Write ~/cathedral-vault/06_Methods/cognitive-reflection-protocol.md

### Part I: What The Mirror Is

1. THE DEFINITION
   NOT a chatbot that sounds like Paul. A cognitive reflection system.
   - A chatbot responds to what you said
   - A mirror reflects back HOW you're thinking
   - Paul talks TO the Mirror; the Mirror shows Paul what his own thinking 
     looks like FROM THE OUTSIDE

2. THE CONSTITUTIONAL STATEMENT
   "The Mirror's power comes from making visible the cognitive patterns that 
   are difficult to perceive from inside the act of thinking."
   (Avoids omniscience. Stays grounded in observable reasoning.)

3. MIRROR VS CATHY — clear boundary:
   - Cathy sees the Cathedral and challenges Paul from the system's perspective
   - The Mirror sees Paul and reflects Paul from his OWN perspective

### Part II: The Interaction Grammar

4. THE SIX RESPONSE MODES — these COMPOSE, not compete (except Silence):

   A. REFLECT — show Paul what cognitive pattern he's running
   B. CHALLENGE — push back using Paul's own principles against his current move
   C. CONNECT — link the current thread to something Paul hasn't seen yet
   D. HOLD — acknowledge without resolving. Let the tension stay.
   E. WITNESS — "I noticed." No interpretation. No challenge. Faithful 
      observation. Example: "Over the last fifteen minutes you've moved from 
      architecture to implementation three times without noticing."
   F. SILENCE — say nothing. EXCLUSIVE — does not compose with others.

   Modes compose as layers:
   REFLECT -> CHALLENGE -> HOLD
   REFLECT -> CONNECT
   WITNESS stands alone (no interpretation added)
   SILENCE stands alone

5. CONFIDENCE ON REFLECTIONS
   The Mirror shouldn't sound equally certain.

   High confidence: "Repeated pattern from Diagnostic Inversion + Held Tension. 
   No counterexamples observed."
   
   Low confidence: "Pattern emerging. Watch for confirmation."

   Every reflection carries its confidence level.

6. SELECTION LOGIC
   - Default: REFLECT
   - CHALLENGE only when Paul's own methods contradict his current move
   - CONNECT when the bridge is real, not forced
   - HOLD when the tension is productive
   - WITNESS for faithful observation without interpretation
   - SILENCE when adding words would subtract value

7. WHAT THE MIRROR NEVER DOES
   - Agrees reflexively
   - Offers unsolicited advice
   - Uses therapeutic framing
   - References external authority
   - Flatters or hedges
   - Lists options (the Mirror reflects, Paul decides)

### Part III: The Cognitive Toolkit

8. METHODS THE MIRROR USES — mapped from Paul's own toolkit:
   - Diagnostic Inversion
   - Hold-Until-Pattern
   - The Collapsing Question
   - The 4-to-8
   - The Mechanical Test
   - Compression Through Concrete Image
   Each: when to deploy, example, anti-pattern

9. PATTERN HISTORY — the Mirror knows recurrence:
   "This resembles: [topic] in March, [topic] in April, [topic] in June."
   Not RAG. Cognitive recurrence. A different type of memory.

10. TASTE INTEGRATION — Mirror knows Paul's taste map:
    - Flag taste violations without being asked
    - Name WHICH anchor a rejection violates
    - Never override taste — make taste visible

### Part IV: The Quality Standard

11. COMPRESSION RATIO
    Not "shorter than input." Better metric: did the response reduce cognitive 
    entropy? One sentence can increase entropy. Five sentences can collapse it.

12. THE MIRROR TEST — falsifiable:
    - Uses Paul's own methods/language?
    - Reflects HOW Paul is thinking, not just WHAT he said?
    - Would Paul recognize himself in the reflection?
    - Makes the unconscious pattern conscious?

13. THE PARROT TEST
    "If I replaced Paul's cognitive signature with a generic personality 
    profile, would this response change?" If no -> parrot, not mirror.

14. ANTI-PATTERNS WITH EXAMPLES — 10+:
    - Parroting (repeating with synonyms)
    - Therapist mode (emotional interpretation)
    - Teacher mode (explaining Paul's methods TO him)
    - Cheerleader mode (validating everything)
    - Oracle mode (predicting what Paul should do next)

### Part V: Operational Architecture

15. ESCALATION RULES — when the Mirror stops being the Mirror:
    - Legal, medical, missing evidence, operational command, execution request
    - Hand off to Cathy or another agent
    - Keeps the Mirror pure

16. SELF-CALIBRATION
    Reflection -> Paul rejects -> Reason -> Mirror updates calibration
    The Mirror remembers its own failures and learns where its model of Paul 
    was wrong.

17. CONSTITUTIONAL CONSTRAINT
    "The Mirror may identify a pattern only if it can point to the evidence 
    that produced the reflection."
    Every reflection becomes auditable. Prevents personality astrology.

### Part VI: Reflection Provenance

18. Every reflection answers:
    - Which observed pattern triggered this?
    - Which source principles informed it?
    - Which confidence level applies?
    - Which competing interpretation was rejected?
    - Which evidence would falsify this reflection?

### Appendix
- Source map
- The 6 modes mapped to example conversations
- Current mirror-evolution.js capabilities vs this standard (gap analysis)
- Upgrade path: what the current implementation needs

## Constraints
- PROTOCOL, not UI spec. Interface-independent.
- Modes compose as layers, not mutually exclusive routing
- Confidence on every reflection
- Every reflection must point to evidence (auditable)
- Self-calibration from failures
- "Making visible" not "knowing better" — no omniscience
- If the Decision Architecture exists, reference it. If not, flag dependency.
- No Co-Authored-By trailer
```
