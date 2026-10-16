# Graph Report - /private/tmp/claude-501/-Users-basicclaw777/5412566c-ff07-4198-929c-bb7e2ebf83ca/scratchpad/graphify-input  (2026-07-24)

## Corpus Check
- Corpus is ~17,751 words - fits in a single context window. You may not need a graph.

## Summary
- 56 nodes · 67 edges · 8 communities detected
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.8)
- Token cost: 15,000 input · 6,500 output

## God Nodes (most connected - your core abstractions)
1. `The Actuation Flinch` - 12 edges
2. `The Mechanical Test` - 9 edges
3. `Parametric Architecture` - 7 edges
4. `Silent Reversion by a Competing Controller` - 7 edges
5. `4th Law — DAG with Freshness Contract` - 6 edges
6. `Generalized Veto Pattern` - 6 edges
7. `The Pretty-Over-Effective Audit (Product)` - 6 edges
8. `Mandate Without Mechanism` - 5 edges
9. `Codebase Audit — 20 Systems` - 4 edges
10. `Forge Mirror Log` - 4 edges

## Surprising Connections (you probably didn't know these)
- `OmissionOS (Building Department Application)` --semantically_similar_to--> `OmissionOS Coach Archetype`  [INFERRED] [semantically similar]
  the-actuation-flinch.md → forge-mirror-log.md
- `Sensor Without Actuator` --semantically_similar_to--> `The 11 Watchers`  [INFERRED] [semantically similar]
  the-mechanical-test.md → the-actuation-flinch.md
- `Mirror Log: Decision-Menu Violation Entry` --conceptually_related_to--> `Harvest Pass3: Paul's Broadening Instinct`  [INFERRED]
  forge-mirror-log.md → session-harvest-2026-07-24-pass3.md
- `The Actuation Flinch` --conceptually_related_to--> `The Mechanical Test`  [EXTRACTED]
  the-actuation-flinch.md → the-mechanical-test.md
- `The Actuation Flinch` --conceptually_related_to--> `The Pretty-Over-Effective Audit (Product)`  [EXTRACTED]
  the-actuation-flinch.md → product-brief-the-pretty-over-effective-audit-2026-05-30.md

## Hyperedges (group relationships)
- **Cathedral Named Anti-Pattern Family (looks-done-but-isn't)** — mechanicaltest_themechanicaltest, silentreversion_silentreversion, mandate_mandatewithoutmechanism, prettyoverfx_prettyovereffectiveaudit, actuationflinch_theactuationflinch [EXTRACTED 0.95]
- **Parametric Architecture Entity DAG** — parametric_paulstate, parametric_agentstate, parametric_projectstate, parametric_vaultstate, parametric_querystate, parametric_studentstate [EXTRACTED 0.90]
- **2026-07-24 Parametric Architecture Session Narrative** — harvest1_parametricbroadenedspec, harvest3_relayseedpattern, harvest3_broadeninginstinct, parametric_parametricarchitecture [INFERRED 0.80]

## Communities

### Community 0 - "Parametric Architecture"
Cohesion: 0.18
Nodes (11): Harvest Pass1: Parametric Architecture Broadened Spec Build, Harvest Pass1: Weave-In Decision, Harvest Pass3: Paul's Broadening Instinct, Harvest Pass3: Explain-to-a-16-Year-Old Test, Harvest Pass3: External AI Chat as Relay Seed, Paper Trial (First Real Test), Parametric Architecture, 16-Year-Old Plain-Language Summary (+3 more)

### Community 1 - "Silent Failure Patterns"
Cohesion: 0.25
Nodes (8): Origin Session (2026-05-30), The Pretty-Over-Effective Audit (Product), The 3-Question Audit Framework, Tiered Product Structure, Competing Controllers (Root Cause), Higgsfield Credit-Leak Case (2026-06-03), Silent Reversion by a Competing Controller, The Three Defenses

### Community 2 - "Forge Self-Observation"
Cohesion: 0.25
Nodes (8): Harvest Pass1: MEMORY.md Compression Build, Harvest Pass2: Decision-Menu Self-Correction, Harvest Pass2: MEMORY.md Silent Failure Pattern, Mirror Log: Decision-Menu Violation Entry, Forge Mirror Log, Mirror Log: MEMORY.md Compression Entry, OmissionOS Coach Archetype, Self-Detection Test (Work vs Positioning)

### Community 3 - "OmissionOS & Actuation Flinch"
Cohesion: 0.29
Nodes (7): Additive-Transformative Gap, Reading the Negative Space, OmissionOS (Building Department Application), Restriction of Known Capability, The Actuation Flinch, Trading Experiment Case Study, The Triple Gate

### Community 4 - "Entity State DAG"
Cohesion: 0.48
Nodes (7): AgentState Entity, 4th Law — DAG with Freshness Contract, Generalized Veto Pattern, PaulState Entity, ProjectState Entity, QueryState Entity, VaultState Entity

### Community 5 - "Mechanical Test Family"
Cohesion: 0.33
Nodes (6): The Actuation Gate, Cathedral Agent Improvement Origin Story, Layer 7 Feedback Injection Fix, Sensor Without Actuator, The Stacking Trap, The Mechanical Test

### Community 6 - "Mandate Without Mechanism"
Cohesion: 0.4
Nodes (5): Active Learning (#5 Epistemic Engine), Agent Placement Diagnostic (2026-05-20), The Auto-Feeder Pattern, Event-Driven Over Scheduled Design Principle, Mandate Without Mechanism

### Community 7 - "Watchers vs Learners Audit"
Cohesion: 0.5
Nodes (4): The 11 Watchers, The 5 Genuine Learners, Codebase Audit — 20 Systems, Fable Wiring Plan

## Knowledge Gaps
- **26 isolated node(s):** `The Actuation Gate`, `Trading Experiment Case Study`, `The 5 Genuine Learners`, `The Triple Gate`, `Fable Wiring Plan` (+21 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `The Actuation Flinch` connect `OmissionOS & Actuation Flinch` to `Parametric Architecture`, `Silent Failure Patterns`, `Mechanical Test Family`, `Mandate Without Mechanism`, `Watchers vs Learners Audit`?**
  _High betweenness centrality (0.662) - this node is a cross-community bridge._
- **Why does `Parametric Architecture` connect `Parametric Architecture` to `OmissionOS & Actuation Flinch`, `Entity State DAG`?**
  _High betweenness centrality (0.531) - this node is a cross-community bridge._
- **Why does `4th Law — DAG with Freshness Contract` connect `Entity State DAG` to `Parametric Architecture`?**
  _High betweenness centrality (0.186) - this node is a cross-community bridge._
- **What connects `The Actuation Gate`, `Trading Experiment Case Study`, `The 5 Genuine Learners` to the rest of the system?**
  _26 weakly-connected nodes found - possible documentation gaps or missing edges._