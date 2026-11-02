# Cathedral Environment Architecture
> Plan v1.0 — 2026-11-02 | Review before build

## Three-Level Structure

```
LOBBY (master index, 7 doors)
  └── ENVIRONMENT (focused workspace, Option C template)
        └── BRANCH (scoped sub-section within environment)
```

## Template: Option C — Hybrid
- Slim gradient hero + identity
- 4 action buttons (environment-specific)
- Visual card grid (tools, rooms, status)
- Build zone (active work area)
- Activity feed (recent events)
- Dark theme, gold #f7b408, Anton + Epilogue

---

## 1. BASIC REFLEX (BR)

**Purpose:** Boxing business command center. Everything Paul needs to run the gym.

### Branches

| Branch | What | Action Buttons |
|--------|------|----------------|
| **Coaching** | Class prep, whiteboard, drill library, curriculum | "Prep tonight's class", "Open whiteboard", "Drill search", "Session notes" |
| **Clients** | CRM, attendance, archetypes, follow-up | "Who's in tonight?", "Check attendance", "Follow-up queue", "New client" |
| **Products** | BR90, workshops, beginner week, corporate | "BR90 dashboard", "Workshop builder", "Beginner Week", "Corporate class" |
| **Social Media** | Instagram pipeline, content calendar, Reed | "New post", "Content calendar", "Queue review", "Analytics" |
| **Business** | Revenue, billing, cubanos audit, strategy | "Revenue today", "Outstanding invoices", "Monthly report", "Pricing" |

### Room Mapping (41 BR rooms + 23 coaching-os tools)

**Coaching branch:**
- coaching-whiteboard.html → Whiteboard (Previous/Current/Next)
- class-journal.html → Session logging
- drill-library.html → 300+ drill database
- curriculum-map.html → Progression framework
- block-card.html → Block card builder
- combo-card.html → Combo card builder
- series-card.html → Series card builder
- technique-reference.html → Technique lookup
- beginner-week.html → 5-day onboard flow
- teaching-plan.html → Lesson planning
- training-cycle.html → Periodization
- level-map.html → Student progression map
- method-overview.html → BR method summary

**Clients branch:**
- BR CRM rooms (punchpass, collection, signal-map)
- Client cards, attendance tracking
- first-visit-conversion tools
- Archetype assignment (6 archetypes = 6 content lanes)
- Lapsed campaign tools

**Products branch:**
- BR90 dashboard + athlete trajectories
- Workshop-in-a-Box (cuban-workshop/, bundle/)
- Beginner Week programme
- Corporate class brochure/materials
- CSOB website tools

**Social Media branch (GAP — needs build):**
- Instagram voice agent (spec exists: ~/.claude/agents/instagram-voice.md)
- Content calendar (concept only)
- Post generator (archetype → content lane pipeline)
- Reed visual director integration
- Story/clip pipeline from iPhone archive (255 videos, 43 story-ready)
- Dan Roam sheets → explainer video pipeline

**Business branch:**
- Revenue tracking, billing
- Cubanos audit tools ($500/session)
- BR brief (pre-class intelligence)
- Competitor analysis (HK market)
- PostHog analytics

### Existing Tools Already Built
- ~/nanoclaw/coaching-os/ — 23 HTML tools (READY)
- ~/basic-reflex/crm/ — CRM prototype (20 items)
- ~/Cathedral/br-crm/ — CRM data (565 members)
- ~/basic-reflex/website/ — Website v1-v6
- ~/basic-reflex/cuban-workshop/ — Full workshop bundle
- ~/basic-reflex/br-90/ — 59 items

### Gaps
1. **Social Media pipeline** — No system. Instagram voice spec exists but no production workflow
2. **Class-to-content bridge** — No way to go from "tonight's class" → social content
3. **Unified client view** — CRM exists in two places (basic-reflex/crm + Cathedral/br-crm)
4. **iPhone media → gym content** — 30h video sitting in ~/iPhone-Archive/, no processing pipeline

---

## 2. STUDIO

**Purpose:** Creative production. Visual content, video, animation, characters.

### Branches

| Branch | What | Action Buttons |
|--------|------|----------------|
| **Logan** | Stick Logan IP, vectors, animations, comic engine | "Logan editor", "Vector pipeline", "Animation lab", "Cast" |
| **Reed** | Visual director, 10 styles, Instagram overlays | "Generate visual", "Style picker", "Batch frames", "Gallery" |
| **Video** | Film production, Aether, web series, editing | "Aether status", "Shot list", "Render queue", "Style transfer" |
| **Assets** | Sheet maker, visual grammar, explainer compiler | "New sheet", "Visual grammar", "Explainer", "Asset library" |

### Room Mapping (23 studio rooms)

**Logan branch:**
- Stick Logan engine (1093 items)
- Logan cast, layers, icons (40+)
- Logan visual corpus
- Character genome system
- 3D Logan lab (E01-08)
- Logan web series tools

**Reed branch:**
- Reed visual director (10 styles)
- Content calibration engine
- Instagram layout treatments
- Sheet-to-page pipeline

**Video branch:**
- Aether Universe (50 shots, 67 keyframes, 63 videos)
- Style transfer tools
- Higgsfield integration
- Animation lab protocol

**Assets branch:**
- Sheet maker (88 lines spec)
- Visual grammar system
- Explainer compiler
- Batch frame sheets (42cr method)
- Dan Roam template factory

### Existing Tools
- ~/nanoclaw/ — Full Logan engine, Reed configs
- OpenArt studio integration (illustration only)
- mflux-env for free local generation
- Animation lab protocol
- Style transfer spec

### Gaps
1. **No unified production dashboard** — tools scattered across rooms
2. **No render queue** — each tool standalone, no pipeline view
3. **iPhone archive bridge** — 888 files not connected to studio tools

---

## 3. MONEY

**Purpose:** Financial intelligence. Revenue, trading, property, investments.

### Branches

| Branch | What | Action Buttons |
|--------|------|----------------|
| **Revenue** | BR income, session billing, cubanos | "Revenue snapshot", "Outstanding", "Monthly trend", "Forecast" |
| **Trading** | Argon, Polymarket, portfolio | "Market scan", "Positions", "Weekly review", "Signals" |
| **Property** | HK property scout, golden zone | "Property scan", "Golden zone", "Due diligence", "Alerts" |
| **Intelligence** | World pulse, financial research | "Global scan", "Research feed", "Opportunity radar" |

### Room Mapping (Money district rooms + property + trading)

**Revenue branch:**
- BR revenue digest (existing PM2 cron)
- Cubanos audit data ($8K owed)
- Session billing tracker
- Income paradigm shift plan (5 plays)

**Trading branch:**
- Argon trading system
- Polymarket scanner/monitor
- Daily pick, cyclical trader, simpsons trader (PM2)
- Long-term portfolio tools
- Allocation weekly

**Property branch:**
- Property scout (Sun 02:00 cron)
- Golden zone units (Wed 02:00 cron)
- Due diligence (Thu 02:00 cron)

**Intelligence branch:**
- World pulse aggregator
- Global scout (Wed 02:00 cron)
- Scout bridge

### Existing Tools
- 10+ PM2 trading/property crons (currently stopped)
- Revenue digest cron
- PostHog analytics bridge

### Gaps
1. **Revenue room has no narrative** — Paul saw "$10K" with no context in walkthrough
2. **Trading tools disconnected from each other** — 6 separate PM2 processes, no dashboard
3. **No financial calendar view** — when things are due, when reports run

---

## 4. BODY & MIND

**Purpose:** Physical training + cognitive development. Paul's personal growth system.

### Branches

| Branch | What | Action Buttons |
|--------|------|----------------|
| **Body** | Training log, technique photos, health tracking | "Today's training", "Technique library", "Body metrics", "Lymphatic" |
| **Mind** | Research relays, cognition, knowledge | "Active relays", "Reading list", "Cognition map", "I Ching" |
| **Coaching Philosophy** | Teaching method, heyoka, approach | "Method map", "Philosophy notes", "Coaching journal" |

### Room Mapping

**Body branch:**
- Body room (technique photos — already exists)
- Gym metrics/tracking (GAP — missing health tracking)
- Lymphatic protocol (PM2 cron)
- Training cycle tools

**Mind branch:**
- Research relays (cosmology, burger, otherness, poetry, + 4 parked)
- Cosmology researcher + podcast (PM2 crons)
- Looking glass, ancient corpus
- Erickson parables agent
- Cognition map (currently misplaced in Mind room)

**Coaching Philosophy branch:**
- BR method documentation
- Heyoka brand integration
- Coaching philosophy notes
- Teaching methodology

### Existing Tools
- Research relay suite (multiple completed relays)
- Cosmology pipeline (researcher + podcast crons)
- Body room with technique photos
- Ancient corpus (135K items)

### Gaps
1. **No health tracking** — Paul flagged in walkthrough ("phase 0 still")
2. **Mind room = research dump** — needs to be about cognition, not relay storage
3. **No personal training log** — coach has no system for own training

---

## 5. UNIVERSE

**Purpose:** Knowledge exploration. Cosmology, anthropology, research, Cathedral University.

### Branches

| Branch | What | Action Buttons |
|--------|------|----------------|
| **Cosmology** | Base60, NGP, hollow earth, crop circles | "Research feed", "Latest papers", "Cosmology podcast", "Corpus search" |
| **University** | 20 schools, 162 courses, shadow curriculum | "Course catalog", "Active courses", "New degree", "Progress" |
| **Knowledge** | Vault search, ancient corpus, looking glass | "Vault search", "Topic index", "Knowledge graph", "Recent" |

### Room Mapping (11 research rooms + maps)

**Cosmology branch:**
- Cosmology research (27 items)
- Base60 lens
- Neutral Geometry Protocol (A-grade)
- Hollow/indigenous research
- Crop circle decoder (5,913)
- Cosmology researcher + podcast (PM2)

**University branch:**
- Cathedral University (20 schools, 162 courses, ~5MB)
- Shadow curriculum (5/14 built)
- M5 mastery degree (7 courses, ~3000 lines)
- University panel style (one sheet, 42cr)
- University agents concept (waits M5)

**Knowledge branch:**
- Vault search (vault-brain, 225MB online)
- Topic index (reference_vault_topic_index.md)
- Ancient corpus (135K)
- Looking glass

### Existing Tools
- vault-brain (PM2 online, working)
- Cathedral University (massive, built)
- Cosmology pipeline (automated)
- Vault topic index

### Gaps
1. **No unified search UI** — vault-brain runs but no visual interface
2. **University has no environment** — courses exist but no door to them
3. **Knowledge graph not visual** — graphify skill exists but no persistent view

---

## 6. CATHEDRAL

**Purpose:** Platform operations. Agents, infrastructure, system health.

### Branches

| Branch | What | Action Buttons |
|--------|------|----------------|
| **Agents** | Agent roster, emergence, triggers | "Agent status", "Emergence feed", "Trigger map", "Silence check" |
| **Infrastructure** | PM2, cath-bridge, MCP, crons | "PM2 status", "Health check", "Cron schedule", "Logs" |
| **Memory** | Vault, registry, foundry, memory system | "Memory search", "Recent memories", "Registry", "Gap register" |
| **Development** | Forge tools, build queue, experiments | "Build queue", "Active experiments", "Forge status", "Deploy" |

### Room Mapping (15 agent rooms + 8 ops rooms)

**Agents branch:**
- 15 agent rooms from lobby
- Emergence suite (signal-router, harvester, triggers)
- Buzz monitor (6 departments)
- Agent review loop

**Infrastructure branch:**
- PM2 fleet (128 processes)
- cath-bridge server
- MCP knowledge server (7 tools)
- Backup systems (KINGSTON2 + forge-backup)
- LLM router (4 tiers, verified)

**Memory branch:**
- Vault (1600+ .md files)
- Cathedral registry
- Memory consolidator
- Gap register (negative types)
- Harmonic agent state (z=4.72)

**Development branch:**
- Forge room (currently dead — "this site can't be reached")
- Cathedral sprint planning
- Threshold topography (6 basins)
- Predictive intelligence

### Existing Tools
- 9 online PM2 processes
- vault-brain, vault-watcher, vault-state-refresh
- cath-bridge (lobby at :8080)
- MCP server (7 tools)
- LLM router (all 4 tiers working)

### Gaps
1. **Forge room is dead** — 404 in walkthrough
2. **No visual PM2 dashboard** — 128 processes, no overview
3. **No agent health view** — buzz monitor runs but no visual surface
4. **intake-watcher crash-looping** (5,385 restarts)

---

## 7. PERSONAL

**Purpose:** Paul's personal space. Calendar, travel, I Ching, reflection.

### Branches

| Branch | What | Action Buttons |
|--------|------|----------------|
| **Calendar** | Cathedral calendar (primary surface) | "Today", "This week", "Add event", "Seed routine" |
| **Travel** | Travel agent, creative bible, portable kit | "Travel agent", "Packing", "Creative bible", "Local research" |
| **Reflection** | I Ching, poetry, door poem, appreciation | "Draw reading", "Journal", "Poetry", "Mirror" |
| **People** | Contacts, prospects, relationships | "Recent contacts", "Prospects", "Follow-ups" |

### Room Mapping (13 personal rooms)

**Calendar branch:**
- Cathedral calendar (best room per walkthrough — artifact-based)
- Seed routine (daily)
- Session prompt

**Travel branch:**
- Travel agent (Paul said "cool but text-heavy")
- Travel creative bible
- Claude projects travel kit

**Reflection branch:**
- I Ching reading system
- Poetry/cognition tools
- Door poem
- Appreciation ritual (PM2)
- Mirror evolution (PM2)

**People branch:**
- Pretta navigation
- Ryan Chan prospect
- Bay/Logan interview tools
- Raymond Poon prospect

### Existing Tools
- Calendar (artifact-based, working well)
- Travel agent (built, text-heavy)
- I Ching system (with sheet ritual)

### Gaps
1. **Calendar depends on Claude artifact** — risk if Anthropic changes artifact system
2. **Travel agent needs visual redesign** — Paul flagged as text-heavy
3. **No unified people/contacts view**

---

## Cross-Cutting: Local AI Chat

Every environment gets a chat widget powered by LLM router:
- Pre-loaded system prompt scoped to environment domain
- Streaming responses for perceived speed
- Local data access (coaching.db, punchpass, CRM, vault)
- Tier routing: quick questions → LIGHT (gemma3:4b), analysis → HEAVY (qwen3:32b)
- No data leaves the machine (privacy: HK geo + member data)

### Chat Personas per Environment
| Environment | Persona | Default Tier | Data Access |
|-------------|---------|-------------|-------------|
| BR | Boxing coach assistant | MEDIUM | coaching.db, punchpass, CRM |
| Studio | Creative director | MEDIUM | visual-memory, Reed configs |
| Money | Financial analyst | HEAVY | revenue data, trading state |
| Body & Mind | Research companion | MEDIUM | relay corpus, vault |
| Universe | Knowledge explorer | HEAVY | vault (1600+ files), corpus |
| Cathedral | System operator | LIGHT | PM2 state, agent logs |
| Personal | Personal assistant | MEDIUM | calendar, contacts |

---

## Build Sequence

### Phase 0: Template Foundation (1 session)
1. Finalize Option C template as reusable HTML
2. Wire environment routing in cath-bridge.cjs (replace line 5072-5076 catch-all)
3. Build lobby → 7 doors (redesign current lobby to show 7 environment cards)

### Phase 1: Basic Reflex (2-3 sessions)
**Why first:** Most daily use. 23 coaching-os tools already built. Biggest ROI.
1. BR environment with 5 branch tabs
2. Wire existing coaching-os tools into Coaching branch
3. Wire CRM into Clients branch
4. Products branch (link existing BR90, workshop, beginner week)
5. Business branch (revenue, billing tools)
6. Social Media branch (start with Instagram voice pipeline)

### Phase 2: Cathedral (1-2 sessions)
**Why second:** Infrastructure visibility. Paul needs to see system health.
1. PM2 visual dashboard
2. Agent status grid
3. Memory search UI (vault-brain already online)
4. Fix dead Forge room

### Phase 3: Personal (1 session)
**Why third:** Calendar already best room. Quick wins.
1. Calendar integration (keep artifact-based)
2. Travel agent visual refresh
3. I Ching / reflection tools

### Phase 4: Studio (2 sessions)
**Why fourth:** Large surface area but lower daily urgency.
1. Logan branch (wire existing engine)
2. Reed branch (visual director integration)
3. Video branch (Aether status dashboard)
4. Assets branch (sheet maker integration)

### Phase 5: Money (1 session)
**Why fifth:** Trading tools exist but need narrative wrapper.
1. Revenue dashboard with context
2. Trading overview (unify 6 PM2 processes)
3. Property intelligence view

### Phase 6: Body & Mind (1 session)
**Why sixth:** Smallest existing tool base.
1. Body tracking system (new build)
2. Mind/research relay dashboard
3. Coaching philosophy archive

### Phase 7: Universe (1-2 sessions)
**Why last:** Knowledge tools work (vault-brain online). Enhancement, not emergency.
1. University catalog interface
2. Cosmology research dashboard
3. Visual knowledge graph

### Phase 8: Chat Integration (ongoing)
Wire local AI chat into each environment as branches complete.

---

## Room Disposition: All 153 Lobby Rooms

| Current Room | → Environment | → Branch | Action |
|-------------|--------------|----------|--------|
| Money | Money | Revenue | MOVE |
| Search | Cathedral | Memory | MOVE (make global) |
| Body | Body & Mind | Body | MOVE |
| Mind | Body & Mind | Mind | MOVE |
| Create | Studio | Assets | MOVE |
| Work | Cathedral | Development | MOVE (rename) |
| Forge | Cathedral | Development | FIX (dead) |
| Travel Agent | Personal | Travel | MOVE |
| Calendar | Personal | Calendar | MOVE |
| 41 BR rooms | BR | (by function) | DISTRIBUTE |
| 9 Gym Eyes rooms | BR | Coaching | MERGE |
| 23 Studio rooms | Studio | (by function) | DISTRIBUTE |
| 15 Agent rooms | Cathedral | Agents | MOVE |
| 22 Map rooms | Cathedral | Memory | EVALUATE (keep useful) |
| 11 Research rooms | Universe/Body & Mind | (by topic) | SPLIT |
| 2 Property rooms | Money | Property | MOVE |
| 13 Personal rooms | Personal | (by function) | DISTRIBUTE |
| 8 Ops rooms | Cathedral | Infrastructure | MOVE |
| 3 Retired rooms | — | — | DELETE |

---

## Dependencies

- **cath-bridge routing** must change before any environment loads (Phase 0 blocker)
- **LLM router** verified and working — ready for chat integration
- **Option C template** exists at br-environment-c.html — needs parameterization
- **PM2 cleanup** (96 stopped+cron processes) — do before Cathedral environment build
- **iPhone archive** (888 files) — pipeline needed before Social Media branch
- **M5 is live** — all builds happen on M5 Mac Studio

## Principles

1. **No building without approval** — each phase reviewed before execution
2. **Existing tools wire in first** — 23 coaching-os tools, CRM, vault-brain
3. **Gaps flagged, not assumed** — Social Media pipeline is a gap, not a silent omission
4. **Local-first AI** — chat stays on machine, no member data leaves
5. **Template reuse** — Option C for all 7, customized per environment
6. **Doors not walls** — every environment accessible from lobby, branches from environment
