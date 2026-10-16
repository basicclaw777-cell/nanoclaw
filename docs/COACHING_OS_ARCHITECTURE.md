# Coach's Operating System — Architecture Document

> Pre-build planning. Synthesized from: Paul's spec, ChatGPT architecture response, Gemini A+B responses, and dialogue refinements (2026-07-12).

---

## The Problem

"What should I teach them today?" — decision fatigue at 4pm when class starts at 6. Knowledge exists (hundreds of drills, years of methodology) but scattered. Need: plan in <5 min, teach from a glance, build on itself over time.

---

## Core Architectural Principle

**Don't build a class planner. Build a coaching operating system.**

A class is one projection. The center is Learning Objectives + Skill States, not lessons.

---

## The 4-Layer Architecture

```
┌─────────────────────────────────────────────────────┐
│  LAYER 4: LEARNING                                  │
│  Observation capture → Skill State updates →        │
│  Pattern detection → Feeds back into Layer 2        │
├─────────────────────────────────────────────────────┤
│  LAYER 3: TEACHING                                  │
│  Live coaching display: cues, watch-fors,           │
│  regression/progression buttons, panic button       │
├─────────────────────────────────────────────────────┤
│  LAYER 2: PLANNING                                  │
│  Recommendation engine, lesson templates,           │
│  slot machine UI, series graph, theme graph         │
├─────────────────────────────────────────────────────┤
│  LAYER 1: KNOWLEDGE                                 │
│  Techniques, Concepts, Physical Attributes,         │
│  Patterns, Drills, Objectives, Coaching Cues        │
└─────────────────────────────────────────────────────┘
```

Each layer feeds the one above it. Layer 4 closes the loop back to Layer 2.

---

## Layer 1: Knowledge

### Core Entities

| Entity | What it is | Example |
|--------|-----------|---------|
| **Technique** | A single move | Lead hook, slip, parry, pivot |
| **Concept** | A principle | Timing, economy of motion, pressure |
| **Physical Attribute** | A body quality | Balance, coordination, rotational power |
| **Pattern** | A combination | 1-2-3, jab-slip-cross, double hook |
| **Drill** | An exercise (atomic unit) | "Lead hook off jab on bag, 3 rounds" |
| **Activity** | Purpose wrapper for drill(s) | "Bag Round 2: rear hook focus" |
| **Learning Objective** | What changes in the student | "Generate power from rotation, not arm" |
| **Coaching Cue** | What to say/watch during execution | "Sit then turn" / watch for: elbow flare |

### Key Distinction: Objectives ≠ Themes

- **Theme** = presentation layer ("tonight is hooks")
- **Objective** = what improves ("rotational power generation")

Same class can serve multiple objectives:
- Physical: "feel rotational power"
- Correction: "stop arm-punching"
- Curriculum: "variety after 3 weeks of straight shots"
- Engagement: "hook is fun, energy was low"

System holds multiple objectives per session, primary + secondary.

### Drill Metadata (the 45-second rule applies)

Essential fields (must be fast to fill):
```
id, name, segment_type, primary_theme, energy_demand, duration_mins
```

Extended fields (AI pre-fills, Paul edits):
```
theme_tags[]           — which themes this serves
block_relevance[]      — which blocks benefit (inform, not restrict)
equipment[]            — what's needed
group_size             — solo / partner / group
kinetic_chain[]        — muscles/joints stressed (drives warm-up matching)
setup_time_mins        — equipment swap cost
variations[]           — linked drill IDs (modifications)
regression             — simpler version (one tap)
progression            — harder version (one tap)
coaching_cues[]        — what to say during
watch_fors[]           — common mistakes to spot
video_ref              — optional demo link
fun_score              — 1-5 (Paul's gut)
teaching_cost          — how long to explain (low/med/high)
```

### Theme Graph (typed relationships)

Themes connect to each other:
```
Hook → supports → Rotation
Hook → requires → Weight Transfer
Hook → combines → Slip
Hook → counters → High Guard
Hook → defended_by → Catch
```

This lets the planner DISCOVER complementary themes, not just match tags.

### Regression/Progression Chains

Every drill links to simpler and harder versions:
```
Static hook (stance fixed)
    ↓ progression
Hook with step-in
    ↓ progression
Hook off pivot
    ↓ progression
Hook in combination (slip-hook-cross)
```

These become one-tap buttons during class. "Too hard" → instant swap.

---

## Layer 2: Planning

### Lesson Templates (skeletons, not blank pages)

Reusable structures — planner fills slots, doesn't face empty page:

**Technical Lesson:**
```
Warm-up → Coordination → Agility → Footwork → Bag x3 → Pads → Partner → Conditioning
```

**Pressure Lesson:**
```
Warm-up → Footwork → Partner pressure → Pads → Pressure rounds → Conditioning
```

**Counter Lesson:**
```
Reaction warm-up → Defense drill → Partner → Bag → Pads → Game
```

**Conditioning Lesson:**
```
Dynamic warm-up → Circuit 1 → Technique under fatigue → Circuit 2 → Partner → Burnout
```

Paul can create new templates. System learns which templates he uses most.

### Theme Taxonomy (5 seed layers)

Any layer can seed a class:

| Layer | Examples | Class character |
|-------|----------|----------------|
| **Technique** | Jab, hook, slip, catch, pivot | Single move, all segments serve it |
| **Concept** | Timing, balance, counter, feints | Principle through various techniques |
| **Combo family** | 1-2 family, 1-2-3 variants | Build complexity across rounds |
| **Style/fighter** | Loma angles, Canelo counter, pressure fighter | Aspirational — principles through a hero |
| **Physical** | Coordination, reflexes, power, speed | Conditioning-weighted, technique serves attribute |

### The Recommendation Engine

When Paul opens planner at 4pm, engine already knows:

**Inputs:**
- Tonight's roster (via Gym Eyes) → block distribution, skill states
- Last 14 days of classes → recency penalty
- Active series → continuity bonus
- Equipment available
- Time of day / energy prediction
- Coach fatigue (optional self-report)

**Scoring algorithm per drill per slot:**
```
Score(drill) = 
    W_theme × ThemeMatch
  + W_obj   × ObjectiveMatch
  + W_block × BlockFit (graceful, not binary)
  + W_chain × KineticChainMatch (warm-up ↔ peak drill muscles)
  + W_energy × EnergyCurveFit
  + W_novel × NoveltyScore
  - W_recent × RecencyPenalty
  + W_series × SeriesContinuity
  + W_fun   × FunScore
  - W_setup × SetupTimeCost (equipment swap friction)
```

Weights configurable. Learn from Paul's swap patterns (what he replaces = what the engine got wrong).

### Energy Curve Enforcement

Every class has a shape — build → peak → sustain → cool:
```
Warm-up:       20%
Coordination:  30%
Agility:       40%
Footwork:      50%
Bagwork:       70-80%
Padwork:       85% (peak)
Partner:       75%
Conditioning:  90-95% (second peak)
```

Engine rejects nonsense curves (95 → 20 → 90 → 15). Smooth flow enforced.

### Series & Curriculum Graph

**Hierarchy:**
```
DRILL         → atomic exercise
CLASS/SESSION → themed collection (one night)
SERIES        → connected sequence (3-8 lessons, narrative arc)
CURRICULUM    → network of series with relationship edges
```

**Series edge types:**
```
FOLLOWS        — natural next step
PREPARES       — soft prerequisite
REINFORCES     — same concept, different angle
CONTRASTS      — opposite approach (inside ↔ outside fighter)
DEFENDS        — mirror (hook series ↔ catching hooks)
COMBINES       — synergy (footwork + hooks)
ADVANCES       — harder version of same series
SIMPLIFIES     — easier version
ALTERNATIVE    — different path to same objective
```

**Not linear.** Netflix model — system recommends next series based on what's completed + skill states, not "Lesson 7."

### The 10-Block System

Compatible metadata layer. NOT gates.
- System knows student blocks
- Factors into recommendations
- Tags drills by relevance
- Tracks progress
- **Never restricts** — Paul decides what's appropriate

### PT vs Group: Same Library, Different Engine

**Group planner optimizes for:**
- Variance, flow, fun, coverage
- Median block level (graceful, not lowest-common-denominator)
- Space + equipment constraints
- Single theme for all, modifications suggested per level

**PT planner optimizes for:**
- Individual weakness targeting
- Learning velocity
- Correction density
- Progression through personal skill gaps
- Anchors to student's Gym Eyes profile

Same drill library. Different objective functions. Different UI modes.

---

## Layer 3: Teaching (the live interface)

### The Glance Card (during class)

NOT just drill names. **Coaching-first display:**

```
┌─ TUESDAY GROUP │ Theme: HOOKS ──────────────┐
│                                              │
│ ▶ BAG ROUND 2: Rear Hook                    │
│                                              │
│ 🎯 Objective: Hip commitment, not arm        │
│                                              │
│ 👁 WATCH FOR:                                │
│   □ Elbow flaring out                        │
│   □ Heel lifting (no sit)                    │
│   □ Chin rising on rotation                  │
│   □ Shoulder disconnecting from hip          │
│                                              │
│ 🗣 CUE: "Sit then turn"                     │
│                                              │
│ [⬇ REGRESSION]  [⬆ PROGRESSION]  [⏭ NEXT]  │
└──────────────────────────────────────────────┘
```

Phone-sized. Current segment highlighted. One-tap regression/progression.

### Panic Button

"Dumb it down" — one tap during class:
- Swaps current segment for simpler, higher-cardio variant
- Respects theme (still hooks, just easier hooks)
- Logs the swap (feeds back — "this drill was too hard for this group")

### Pad Call Sheets

For padwork specifically — the FEEDER SCRIPT:
```
Pads: Hook Focus
─────────────────
Call 1: Jab-Cross → show left → HOOK
Call 2: Double jab → show left → HOOK-CROSS
Call 3: Free → when they drop guard → COUNTER HOOK
Reset: Step back, reset stance
```

This is the drill-within-a-drill that padwork needs.

---

## Layer 4: Learning (the closed loop)

### Post-Class Observations

Minimum viable capture (30 seconds post-class):
```
What worked?     [tag drills that landed]
What struggled?  [tag drills that bombed]
Common fault?    [pick from list: elbow flare / chin up / flat feet / ...]
Energy level?    [low / good / high]
Notes?           [optional free text]
```

Quick taps, not essays. Feeds directly into:

### Skill State Model

Each student accumulates estimated competency:
```
Rotation:            0.72
Balance:             0.54
Distance:            0.81
Hook Mechanics:      0.48
Defensive Awareness: 0.39
```

Updated from: attendance, completed series, observations, recurring corrections.

Aggregated per class group → planner asks: "Which skill state has highest expected improvement if we spend 60 min on it tonight?"

### Pattern Detection

After N classes, system surfaces:
```
"37% of Tuesday group consistently lifting chin during hooks.
 Suggest: dedicated chin-discipline series next week."
```

Observations → patterns → recommendations → planner. The loop.

---

## Cold Start Strategy

### Phase 1: Extract from existing assets
- AI reads Master's Handbook → proposes drill entries (metadata pre-filled)
- Smart Bag 55 combos → Pattern entities
- 33-Card drills → seed library
- Coaching Rules → objective + cue extraction
- Drill Scoring 60 drills → already scored, import directly
- Paul approves/tweaks (45-second rule per drill)

### Phase 2: Grow by using
- Every class planned = drills entered into library
- By class 20, library has 100+ drills with real usage data
- Swap patterns teach the engine what Paul actually prefers
- Library grows FROM coaching, never needs a "data entry day"

### Phase 3: Generate variations
- Base drill + modifier = new variation (not catalogued, generated)
- "Mirror footwork" → "Mirror footwork with level changes"
- One drill becomes 4-5 variants without manual entry
- AI proposes, Paul approves on first use

---

## Data Model (SQLite)

### Core Tables
```sql
drills           — atomic exercises
techniques       — single moves
concepts         — principles
physical_attrs   — body qualities
patterns         — combinations
objectives       — learning outcomes
coaching_cues    — what to say/watch
activities       — purpose wrappers
lessons          — planned sessions
series           — narrative arcs
lesson_templates — reusable skeletons
students         — individual profiles
observations     — post-class capture
```

### Junction Tables
```sql
drill_themes          — drill × theme (many-to-many)
drill_segments        — drill × segment type
drill_objectives      — drill × learning objective
drill_cues            — drill × coaching cue
drill_variations      — drill × drill (regression/progression)
lesson_activities     — lesson × activity (ordered)
activity_drills       — activity × drill
series_lessons        — series × lesson (ordered)
series_edges          — series × series (typed: follows/prepares/etc)
theme_edges           — theme × theme (typed: supports/requires/etc)
student_skill_states  — student × skill × estimated_level
student_observations  — student × observation
student_series_progress — student × series × completion
```

### Key Design Rules
- JSON columns for flexible metadata (tags, equipment lists, cue arrays)
- Relational columns for fast queries (segment_type, energy_demand, duration)
- Recursive CTEs for graph traversal (series paths, theme discovery)
- No hard foreign key constraints on block levels (inform, not restrict)

---

## Where Fable Flexes

Fable 5's strength = visual design, interactive HTML, crafted UX. This system has several surfaces that need to FEEL good, not just function:

### 1. The Planner UI (the slot machine)
- Theme picker with visual cards per seed layer
- 8-segment layout with spin/lock/swap interactions
- Drag-to-reorder, tap-to-swap
- Beautiful energy curve visualization
- Template selector with visual previews
- **Fable builds this as a single-page interactive HTML**

### 2. The Live Coaching Card
- Phone-optimized, high-contrast, glanceable
- Current segment highlighted with coaching cues
- Regression/Progression buttons with satisfying interaction
- Timer integration
- Panic button (prominent, one-tap)
- **Fable designs the card layout + typography + interaction states**

### 3. The Series Graph Visualization
- Interactive node graph showing all series and connections
- Color-coded edge types
- Student progress overlaid (completed = solid, available = glow, locked = dim)
- Zoom in/out, click series for detail
- **Fable builds this as interactive HTML canvas**

### 4. The Curriculum Map
- Bird's-eye view: where every student is, what's available, what's next
- Block-level visualization (not restrictive, informational)
- Gap detection highlighted ("no defense mirror for your hook series")
- **Fable designs the visual dashboard**

### 5. The Drill Library Browser
- Visual grid/list with quick-scan metadata
- Filter by theme, segment, energy, equipment
- Tap for full detail + coaching cues
- Regression/progression chains visible as connected cards
- **Fable makes this browsable and tactile**

### 6. The Observation Dashboard
- Post-class quick-capture UI (big tap targets, minimal friction)
- Skill state visualizations per student (radar charts, progress bars)
- Pattern detection surfaced as insight cards
- Historical view: what you taught, when, how it went
- **Fable makes observation capture feel like 5 taps, not data entry**

---

## Existing Assets → This Architecture

| Existing Asset | Maps to | How |
|---------------|---------|-----|
| 33-Card System (30 cards) | Drills + Techniques + Patterns | Import as seed library entries |
| Drill Scoring (60 drills, 9 criteria) | Drill metadata (pre-scored) | Direct import, criteria map to metadata fields |
| Smart Bag (55 combos, 5 families) | Patterns + Activities | Combo families = natural series seeds |
| Coaching Rules Engine | Objectives + Cues | Extracted rules become coaching cues + watch-fors |
| Master's Handbook (40K words) | Techniques + Concepts + Drills | AI extraction → proposed entries |
| Pandamericano (130 transcripts) | Style/fighter theme layer | Cuban methodology = technique + concept source |
| Gym Eyes Students | Student profiles + Skill States | Block levels + attendance already tracked |
| Taste Map | Drill preference weighting | Could weight Paul's preferences in recommendation engine |
| 10-Block Curriculum | Compatible metadata | Block tagging, not gating |

None of these LIMIT the architecture. All are data sources that accelerate cold start.

---

## Build Phases (proposed)

### Phase 0: Foundation (data model + extraction)
- SQLite schema
- Import existing assets (33-card, drill scoring, smart bag)
- AI extraction from handbook → proposed drill entries
- Paul approval pass (batch, 45-sec rule)

### Phase 1: The Planner MVP
- Lesson templates (3-4 skeleton types)
- Theme picker (5 layers)
- Slot machine: generate → scan → swap → lock
- Glance card output (phone-sized, printable)
- **Fable: Planner UI + Glance Card design**

### Phase 2: The Teaching Layer
- Coaching cues per drill (populated during planning)
- Live card with regression/progression buttons
- Pad call sheet generator
- Panic button
- **Fable: Live coaching card UX**

### Phase 3: The Learning Loop
- Post-class observation capture (5-tap minimum)
- Skill state model (start simple: manual estimates, grow from observations)
- Recency tracking (what was taught when)
- Recommendation engine starts learning from swaps + observations

### Phase 4: The Curriculum Graph
- Series builder (connect classes into narratives)
- Series graph with typed edges
- Netflix-model recommendations
- Gap detection ("you have no defense mirror for hooks")
- Student progress through series
- **Fable: Series graph visualization + curriculum map**

### Phase 5: Intelligence
- Pattern detection from observations
- Adaptive planning (skill state → optimal theme selection)
- Generated variations (base + modifier)
- PT mode with individual progression tracking
- Energy curve optimization

---

## Open Questions (resolve during build)

1. Where does this live? cath-bridge route (/coach)? Standalone HTML? Both?
2. How does it integrate with Gym Eyes attendance? Auto-pull roster or manual select?
3. Series: how granular? Is "The Jab" a 5-lesson series or a 12-lesson one?
4. Observation capture: in-app during class or post-class only?
5. How much AI generation vs library lookup? (Sovereign = prefer library, use LLM for variations only?)
6. Pad call sheets: separate entity or embedded in drill metadata?
7. Timer: built into coaching card or separate gym timer system?

---

## The 4-to-8 (What Makes This Game-Changing)

From the ChatGPT synthesis — the leap from "useful planner" to "changes how I coach":

1. **Objectives, not themes** — planning around what IMPROVES, not what you SHOW
2. **Coaching cues as the live display** — you know the drill, you need the TEACHING
3. **Skill State Model** — adaptive recommendations based on estimated competency
4. **Observation → Pattern → Recommendation** — every class makes the next one better
5. **Regression/Progression one-tap** — instant adaptation without thinking
6. **The system gets smarter** — swap patterns, observation data, and usage history all compound

The planner isn't the product. The closed loop is.

---

## Remote Delivery Surface

### The Concept

Same engine, different rendering. The Coaching OS generates session plans → output format depends on AUDIENCE:

| Audience | Surface | What they see |
|----------|---------|---------------|
| Paul (in class) | Coaching Card | Cues, watch-fors, regression/progression buttons |
| Student (remote) | Workout Card | Instructions, focus points, video links, sets/rounds |
| Parent | Progress Card | What their kid learned, milestones hit |
| Corporate | Session Report | Summary, metrics, next session preview |

### Student Workout Card (remote delivery)

When a client is traveling / on holiday / training solo:

```
┌─ YOUR SESSION │ Day 3 of 5 ──────────────┐
│                                            │
│ 🎯 Focus: Hook mechanics (solo)           │
│                                            │
│ WARM-UP (5 min)                            │
│  • Rotation stretches                      │
│  • Shadow boxing: straight shots only      │
│                                            │
│ ROUNDS (3 min on / 1 min off)             │
│  Rnd 1: Shadow hooks — slow, focus hip     │
│  Rnd 2: Shadow hooks — add footwork        │
│  Rnd 3: 1-2-HOOK combo — build speed       │
│  Rnd 4: Free shadow — hooks from angles    │
│                                            │
│ CONDITIONING                               │
│  • Russian twists: 3 × 20                  │
│  • Plank rotations: 3 × 10 each side      │
│                                            │
│ 💡 Focus: "Sit then turn. Hip before hand" │
│ 🎥 [Video: Hook mechanics demo]            │
│                                            │
│ ← Day 2          [✓ DONE]        Day 4 →  │
└────────────────────────────────────────────┘
```

### Delivery Channels

- **Telegram** — message with formatted card (Paul sends with one tap)
- **Shareable link** — static HTML, phone-optimized, no login required
- **PDF** — printable, for clients who prefer paper
- **Email** — via Cathedral collaboration layer (when wired)

### Generation Logic

Same recommendation engine, different constraints:

```
REMOTE WORKOUT CONSTRAINTS:
- Equipment: what client has access to (none / hotel gym / resistance bands / bag)
- Space: limited (hotel room) vs full (outdoor, gym access)
- Duration: Paul sets (20 min / 30 min / 45 min / 60 min)
- Solo-friendly: no partner drills, no pad calls
- Progressive: Day 1 → Day 2 → Day 3 builds naturally
- Video links: attached where technique is complex
- Simplified cues: student version, not coach shorthand
```

### PT Integration

Student's Gym Eyes profile drives remote workouts:
- Block level → appropriate difficulty
- Recent weaknesses → targeted focus
- Completed series → continuation or reinforcement
- Attendance gaps → maintenance vs progression

One tap: "Send [student] a 5-day holiday plan" → system generates from their profile + constraints → Paul reviews → sends.

---

## Digital Course Lifecycle

### The Pipeline: Teach → Refine → Package → Sell

```
PLACEHOLDER    → Title + objectives exist. No content yet.
        ↓
TAUGHT LIVE    → Series run with real students. Observations captured.
        ↓
REFINED        → 2-3 iterations. Bad drills swapped. Timings adjusted.
        ↓
PACKAGED       → Video demos added. Written guides. Progression tests.
        ↓
PUBLISHED      → Available for purchase / subscription.
        ↓
MAINTAINED     → Updated based on new observations + methodology evolution.
```

### What Makes a Series "Course-Ready"

| Criteria | Threshold |
|----------|-----------|
| Taught live | ≥ 2 full runs with real students |
| Observations | Post-class data for each lesson |
| Completion rate | >70% of students finished the series |
| Drill stability | <20% swap rate on last run (settled) |
| Video coverage | Demo for every technique-heavy drill |
| Written cues | Every drill has student-facing instructions |
| Progression tested | Regression/progression chains verified in practice |

### Course Formats

| Format | Delivery | Price model |
|--------|----------|-------------|
| **Self-paced series** | Static HTML / app / PDF pack | One-time purchase |
| **Guided remote** | Daily workout cards via Telegram/email | Weekly/monthly subscription |
| **Holiday packs** | 5-7 day themed programs, equipment-flexible | One-time purchase |
| **Corporate programs** | Structured multi-week team series | Package price |
| **Youth curriculum** | Parent-visible progress, milestone-gated | Term-based |

### Placeholder Series (predicted — fill by teaching)

| Series | Lessons | Layer | Course potential |
|--------|---------|-------|-----------------|
| Jab Masterclass | 5-6 | Technique | High — universal foundation |
| The Cross Series | 5-6 | Technique | High — pairs with Jab |
| Hook Fundamentals | 5-6 | Technique | High — most requested |
| Uppercut & Inside Game | 4-5 | Technique | Medium — intermediate |
| Footwork 101 | 5-6 | Technique | High — standalone value |
| Defense Foundations | 5-6 | Technique | High — safety-first appeal |
| The 1-2 Family | 4-5 | Combo | High — beginner-friendly |
| Counter Punching | 5-6 | Concept | Medium — requires base |
| Pressure Fighting | 4-5 | Style | Medium — intermediate+ |
| The Mayweather Shell | 3-4 | Style/fighter | High — aspirational draw |
| Loma Angles | 3-4 | Style/fighter | High — aspirational draw |
| Timing & Rhythm | 4-5 | Concept | Medium — abstract |
| Boxing for Fitness | 6-8 | Physical | High — widest audience |
| Sparring Prep | 5-6 | Concept | Medium — niche but valued |
| Holiday Maintenance | 4-6 | Physical/solo | High — remote delivery native |
| Shadow Boxing Mastery | 4-5 | Technique/concept | High — zero equipment |
| Pad Feeding for Coaches | 4-5 | Teaching | Niche — coach education |
| Kids Boxing Foundations | 6-8 | Youth | High — parent-facing value |

### Revenue Integration

The Coaching OS becomes the course creation engine without extra work:
- Plan class → teach it → observations captured → series refined → course emerges
- No separate "course creation" workflow
- The best-taught series graduate naturally
- Quality bar = real student data, not guesswork

### Commercial Surfaces (future)

- **BR website** — course catalog page (ties to website redesign)
- **Telegram bot** — `/courses` command, purchase links
- **Student portal** — progress tracking, next lesson, completion certificates
- **Gumroad / Stripe** — payment processing (sovereign: own the relationship)

---

## Updated Build Phases

### Phase 0: Foundation (data model + extraction)
- SQLite schema
- Import existing assets (33-card, drill scoring, smart bag)
- AI extraction from handbook → proposed drill entries
- Paul approval pass (batch, 45-sec rule)
- **Placeholder series created (titles + objectives + edges)**

### Phase 1: The Planner MVP
- Lesson templates (3-4 skeleton types)
- Theme picker (5 layers)
- Slot machine: generate → scan → swap → lock
- Glance card output (phone-sized, printable)
- **Fable: Planner UI + Glance Card design**

### Phase 2: The Teaching Layer
- Coaching cues per drill (populated during planning)
- Live card with regression/progression buttons
- Pad call sheet generator
- Panic button
- **Fable: Live coaching card UX**

### Phase 3: The Learning Loop
- Post-class observation capture (5-tap minimum)
- Skill state model (start simple: manual estimates, grow from observations)
- Recency tracking (what was taught when)
- Recommendation engine starts learning from swaps + observations

### Phase 4: Remote Delivery
- Student workout card renderer
- Delivery via Telegram (one-tap send)
- Equipment/space constraint system
- Progressive multi-day plans
- PT profile → remote workout generation
- **Fable: Student workout card design**

### Phase 5: The Curriculum Graph
- Series builder (connect classes into narratives)
- Series graph with typed edges
- Netflix-model recommendations
- Gap detection ("you have no defense mirror for hooks")
- Student progress through series
- **Fable: Series graph visualization + curriculum map**

### Phase 6: Intelligence
- Pattern detection from observations
- Adaptive planning (skill state → optimal theme selection)
- Generated variations (base + modifier)
- PT mode with individual progression tracking
- Energy curve optimization

### Phase 7: Digital Courses
- Course-readiness scoring (auto-flags series that meet threshold)
- Student-facing content packaging
- Video integration (link or embed)
- Progress tracking for remote students
- Payment integration (Stripe/Gumroad)
- Public catalog page
- **Fable: Course landing page + student portal design**

---

## Open Questions (resolve during build)

1. Where does this live? cath-bridge route (/coach)? Standalone HTML? Both?
2. How does it integrate with Gym Eyes attendance? Auto-pull roster or manual select?
3. Series: how granular? Is "The Jab" a 5-lesson series or a 12-lesson one?
4. Observation capture: in-app during class or post-class only?
5. How much AI generation vs library lookup? (Sovereign = prefer library, use LLM for variations only?)
6. Pad call sheets: separate entity or embedded in drill metadata?
7. Timer: built into coaching card or separate gym timer system?
8. Remote delivery: Telegram-first or web link-first?
9. Course payments: Stripe direct or marketplace (Gumroad/Teachable)?
10. Video hosting: local (served via cath-bridge) or YouTube unlisted?

---

## The 4-to-8 (What Makes This Game-Changing)

From the ChatGPT synthesis — the leap from "useful planner" to "changes how I coach":

1. **Objectives, not themes** — planning around what IMPROVES, not what you SHOW
2. **Coaching cues as the live display** — you know the drill, you need the TEACHING
3. **Skill State Model** — adaptive recommendations based on estimated competency
4. **Observation → Pattern → Recommendation** — every class makes the next one better
5. **Regression/Progression one-tap** — instant adaptation without thinking
6. **The system gets smarter** — swap patterns, observation data, and usage history all compound
7. **Remote delivery as natural output** — same engine, student-facing surface = revenue channel
8. **Series → Courses without extra work** — teach well, the product emerges from practice

The planner isn't the product. The closed loop is. And the closed loop produces sellable courses as a byproduct.

---

*Document: ~/nanoclaw/docs/COACHING_OS_ARCHITECTURE.md*
*Status: Pre-build planning complete. Ready for Phase 0 when Paul says go.*
