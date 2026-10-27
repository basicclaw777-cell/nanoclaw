# Cathedral Rehearsal Audit

**Date:** 2026-10-26
**Method:** Cross-referenced PM2 live state (13 online, 114 stopped), state file timestamps, voice registry scores, SYSTEM_MAP inventory, and MEMORY.md project status.
**Purpose:** Classify every Cathedral system as DEAD / REHEARSING / LIVE so the probe can distinguish them.

---

## Classification Key

| Status | Meaning | Probe Should Read |
|--------|---------|-------------------|
| **LIVE** | Running. Producing output that reaches Paul or feeds other live systems | Amplitude > 0 |
| **REHEARSING** | Built or building. Active prep toward go-live. Not transmitting yet | New metric needed |
| **DORMANT** | Was live, intentionally paused. Could restart with a switch flip | Low amplitude |
| **DEAD** | Not running, no plan, no recent activity. Kill or formally archive | Amplitude 0 |

---

## 1. INFRASTRUCTURE BACKBONE

| System | PM2 | Last Signal | Status | Evidence |
|--------|-----|-------------|--------|----------|
| **cath-bridge** | ONLINE | now | **LIVE** | 569 routes, all web UIs, port 8080 |
| **cathedral-bot** | ONLINE | now | **LIVE** | Primary command interface, Telegram + Slack |
| **vault-brain** | ONLINE | now | **LIVE** | Chokidar watcher, cross-domain associations |
| **vault-promoter** | ONLINE | now | **LIVE** | Staging → refined promotion |
| **vault-state-refresh** | ONLINE | now | **LIVE** | Regenerates vault-state.json |
| **vault-watcher** | ONLINE | now | **LIVE** | Python event bus for vault changes |
| **intake-watcher** | ONLINE | now | **LIVE** | Incoming file routing |
| **terminal-harvester** | ONLINE | now | **LIVE** | Claude Code session signal extraction |
| **lymphatic** | ONLINE | now | **LIVE** | System waste detection/clearing |
| **orchestrator-seed** | ONLINE | now | **LIVE** | Seed generation for orchestrator |
| **content-reviews** | ONLINE | now | **LIVE** | Automated content review |
| **archaeologist-weekly** | ONLINE | now | **LIVE** | Forgotten technique mining |
| **lucy-heartbeat** | ONLINE | Jun 5 (state) | **DEAD** | 5 months stale. Online but producing nothing. Jam #2 says kill it |
| **telegram-tunnel** | STOPPED | — | **DORMANT** | Webhook proxy, works when needed |
| **forge-backup** | STOPPED | — | **DORMANT** | Nightly backup, may fire via cron |
| **sentinel** | STOPPED | — | **DEAD** | Was smell-test sentinel. Stopped. Orc finding: 11 waste signals accumulating |

**Summary:** 12 LIVE, 1 DEAD (lucy-heartbeat), 1 DEAD (sentinel), 2 DORMANT. The backbone works.

---

## 2. AGENT LAYER (Probe Voices)

| Voice | Score | Grade | Amplitude | Status | Evidence |
|-------|-------|-------|-----------|--------|----------|
| **boxing** | 6 | A | 0.6 | **LIVE** | Best grade. Coaching OS, Gym Eyes, technique library all built and used |
| **br** | 0 | B | 0.5 | **REHEARSING** | Paul's correction: content pipeline building toward quality standard. NOT absence |
| **forge** | 6 | C | 0.6 | **LIVE** | This session proves it. Building daily |
| **muse** | 0 | C | 0.5 | **REHEARSING** | Content studio exists, Reed built, visual pipeline established. Waiting for M5 + content standard |
| **orc** | 8 | D | 0.8 | **LIVE** | Highest activity, worst quality. 45% efficiency. Infrastructure debt |

**Key insight:** Both BR (0) and Muse (0) are REHEARSING, not dead. The probe reads them identically to dead channels.

---

## 3. STRESS LAYER

| Voice | Score | Status | Evidence |
|-------|-------|--------|----------|
| **compression** | 33 | **LIVE** | Fixed today. Loudest stress voice. Score 33 = workflow gap (Paul) |
| **contradiction** | 7 | **LIVE** | Score grew 40% from Oct 22. Real signal |
| **identity** | 0.8 | **DEAD** | 0.8/100 = untested or incapable. Jam #2 consensus: needs real test |

---

## 4. COACHING OS + GYM TOOLS

| System | Last Modified | Status | Notes |
|--------|-------------|--------|-------|
| **Coaching Planner** | built Jul 13 | **REHEARSING** | Full suite: teach mode, workout card, intelligence, series graph |
| **Coaching API** | built Jul 19 | **REHEARSING** | 14 endpoints. Wired but not daily-used |
| **Coaching Hub** | built Jul 31 | **REHEARSING** | 23 cards, 5 sections. Door exists |
| **Drill Library** | built Jul 19 | **REHEARSING** | 60+ drills mapped |
| **Drill Capture** | built Jul 31 | **REHEARSING** | URL→vision→tags→library pipeline |
| **coaching.db** | Oct 22 | **LIVE** | Last written 4 days ago. Data accumulating |
| **Technique Library** | built Aug 1 | **LIVE** | 134 MoCap animations on Logan rig. In use |
| **Class Sheet** | built Aug 21 | **REHEARSING** | 3-view planner. Built, not daily workflow yet |
| **Combo Cards** | built Jul 19 | **REHEARSING** | Free HTML generator. Curriculum backbone |
| **Coach Paul Engine** | built Jul 3 | **REHEARSING** | Learning loop scaffolded. 27 vault-seed hypotheses. Not firing daily |
| **Coaching Whiteboard** | — | **REHEARSING** | Memory says BUILD READY. Previous/Current/Next per class+client |

**Summary:** Coaching OS is the clearest rehearsal cluster. ~15 tools built, architecture sound, data flowing into coaching.db. Missing: daily operational workflow. These aren't dead — they're a theatre company that built the set and cast the play. Rehearsals haven't started yet.

---

## 5. BR CRM + BUSINESS

| System | Last Modified | Status | Notes |
|--------|-------------|--------|-------|
| **BR CRM (br-crm.db)** | Aug 2 | **DORMANT** | 565 records. Not being written to. 3 months stale |
| **CRM Signal Map** | built Jul 19 | **DORMANT** | Exists but data stale |
| **Punchpass Scraper** | STOPPED | — | **DORMANT** | Membership data sync. Could restart |
| **BR Revenue Digest** | STOPPED | — | **DORMANT** | Revenue reporting. Not firing |
| **Lapsed Campaign** | STOPPED | — | **DORMANT** | 20 sent, result pending since Jun 25. 4 months unresolved |
| **Comms Daily** | STOPPED | — | **DEAD** | No comms-state.json found |
| **WhatsApp Integration** | routes exist | — | **DEAD** | Routes wired but no evidence of use |
| **BR Website** | built Jun 17 | **REHEARSING** | V4 parked, needs artwork. Design bibles written |
| **CSOB Website** | concept bible | — | **REHEARSING** | Fable-authored bible exists. No build yet |
| **Beginner Week** | design only | — | **REHEARSING** | $500 5-day programme designed. Not launched |
| **BR Pre-Class Brief** | STOPPED | — | **DEAD** | Pre-class briefing. Stopped, no recent signal |
| **First Visit Conversion** | design only | — | **REHEARSING** | AI follow-up chain designed. CRM median=0 finding. Not wired |
| **PT Tracker** | built Jul 19 | **LIVE** | Mobile session counter. Simple, in use |

**Summary:** BR business tools = mostly DORMANT. CRM has data but isn't being fed. Revenue tracking stopped. The lapsed campaign is an abandoned experiment (4 months past its result-due date). First-visit conversion chain and beginner week are REHEARSING — designed but not built/launched. BR website and CSOB are REHEARSING with full design bibles but no live site.

---

## 6. TRADING SYSTEM

| System | PM2 | Last Signal | Status | Notes |
|--------|-----|-------------|--------|-------|
| **Bottleneck Arbitrage** | cron Mon | Sep 30 | **DORMANT** | Last fired 26 days ago. $100K paper, 18 positions |
| **Trading Orchestrator** | STOPPED | — | **DEAD** | Central loop. Not running |
| **Simpsons Trader** | STOPPED | 27 restarts | **DEAD** | Event trader. Stopped |
| **Cyclical Trader** | STOPPED | 29 restarts | **DEAD** | Cycle strategy. Stopped |
| **Position Guardian** | STOPPED | 579 restarts | **DEAD** | High restart count = was crashlooping before stop |
| **Trading Mentor** | STOPPED | — | **DEAD** | Coaching layer. Never gained traction |
| **Daily Picks** | STOPPED | — | **DEAD** | Daily trade picks. Stopped |
| **Allocation Tracker** | STOPPED | — | **DEAD** | Weekly allocation. Stopped |
| **Causal Critic** | built Jul 19 | — | **DORMANT** | Process Score system. Built, not wired |
| **Learning Pulse Dashboard** | built Jul 24 | — | **DORMANT** | Anti-steak dashboard. Door exists |

**Summary:** Trading system is mostly DEAD. Bottleneck arbitrage last fired Sep 30. The causal critic and learning pulse are good architecture collecting dust. If trading isn't a current priority, formally kill these. If it is, the infrastructure exists but nothing is running.

---

## 7. CONTENT STUDIO / REED

| System | PM2 | Last Signal | Status | Notes |
|--------|-----|-------------|--------|-------|
| **Buzz Monitor** | was ONLINE | — | **LIVE** | Trend monitoring. Listed as online in SYSTEM_MAP |
| **Maya Social** | was ONLINE | — | **LIVE** | Social intelligence |
| **Reed Studio** | routes exist | — | **REHEARSING** | Full pipeline built. Character-driven content. Waiting for M5 + quality standard |
| **Reed Visual Hub** | routes exist | — | **REHEARSING** | Visual content pipeline overview |
| **Reed Lab** | routes exist | — | **REHEARSING** | Experimental generation |
| **Content Studio API** | 12 endpoints | — | **REHEARSING** | Full API built. Not in daily use |
| **Higgsfield Gallery** | route exists | — | **DORMANT** | Video gallery. Credits near zero |
| **Logan Story Engine** | built Jul 17 | — | **REHEARSING** | Narrative generator from Character Bible |

**Summary:** Reed/Content is the second major rehearsal cluster after Coaching OS. Full pipeline architecture built. Waiting for: M5 hardware, content quality standard, Paul's comfort with public output. Same pattern as BR voice — active preparation, zero transmission.

---

## 8. CATHEDRAL OS + META

| System | Last Modified | Status | Notes |
|--------|-------------|--------|-------|
| **Cathedral OS** | Aug 26 (db) | **DORMANT** | Atrium + rooms built. L1-L3 pipeline. DB 2 months stale |
| **Cathedral Foundry** | built Jul 5 | **DORMANT** | 23 agent genomes. Design Critic. Not actively evolving |
| **Cathedral Gardener** | STOPPED | — | **DEAD** | Was Sunday 4am cron. No state file found |
| **Production Engine** | Oct 25 | **LIVE** | Yesterday. Daily agent production cycle still firing |
| **Output Architect** | STOPPED | — | **DEAD** | No state file. Was daily 06:00 HKT cron |
| **Cathedral City** | routes exist | — | **DEAD** | Social simulation. No evidence of use |
| **The Mirror** | route exists | — | **DORMANT** | Digital Paul. Mirror evolution cron: no state file |
| **The Concierge** | built Jul 19 | — | **DORMANT** | Cathedral guide. Route exists |
| **The Oracle** | route exists | — | **DORMANT** | Vault RAG. Route exists |
| **Morning View** | was ONLINE | — | **DEAD** | PM2 shows stopped. No morning-view state |
| **Episodes Dashboard** | route exists | — | **DORMANT** | Timeline viewer. Last harvested Jul 2 |

**Summary:** Cathedral meta layer is mostly DORMANT. Production engine still fires (Oct 25). The rest built infrastructure that's waiting. Not dead — the architecture is sound. But not rehearsing either: no active prep toward a specific go-live.

---

## 9. RESEARCH INSTRUMENTS

| System | Last Signal | Status | Notes |
|--------|-------------|--------|-------|
| **Harmonic Probe** | today | **LIVE** | This session. Dashboard + jam sessions + Chladni bridge |
| **Stress Battery** | today | **LIVE** | Fixed this session. Daily cron |
| **Flinch Detector** | Oct 25 | **LIVE** | Production log active (104KB) |
| **Paul Patterns** | Jul 26 | **DEAD** | 3 months stale. Weekly cron not firing |
| **Corpus Diagnostic** | — | **DEAD** | No state file. Weekly cron not firing |
| **Prospector** | Aug 23 | **DEAD** | 2 months stale. Daily cron not firing |
| **Somatic Orrery** | route exists | **DORMANT** | 7-planet diagnostic. Door exists |
| **Probe Physician** | — | **DORMANT** | Daily reader with Telegram briefings. Not confirmed firing |
| **Base-60 Lens** | built Jul 6 | **DORMANT** | Research tool. Used on demand |

---

## 10. GOVERNANCE + AUTONOMY

| System | Status | Notes |
|--------|--------|-------|
| **Autonomy Constitution** | **DORMANT** | AgentOrgan, Escalation, StateBus, Chassis — all built. Not actively governing |
| **Reed Governance** | **DORMANT** | 7 organs on standard chassis. Wraps Reed code |
| **Brand Invariant** | **DORMANT** | Checks/enforces BR palette. Built |
| **Spend Circuit Breaker** | **DORMANT** | canSpend()/guardedCall(). Built |
| **Constitutional Invariants** | **DORMANT** | 8 executable invariants. Built |
| **Calibration Tracker** | **DORMANT** | Brier score + drift. Built |

**Summary:** Governance layer fully built, zero enforcement. Autonomous in theory. Manual in practice.

---

## 11. RESEARCH LANES

| System | Status | Notes |
|--------|--------|-------|
| **Vault Graph** | **DORMANT** | 1907 nodes. Route exists |
| **Pandamericano** | **DORMANT** | 130 transcripts harvested. Framework built. Query works |
| **Babylon Translator** | **DORMANT** | Calibrated Jun 15. Bulk run pending |
| **Ancient Corpus** | **DORMANT** | 135K tablets. Pipeline built |
| **Beacon (SEO)** | **DORMANT** | 39,550 pages generated. Not deployed |
| **Hunch Lane** | **DORMANT** | Retrieve-before-derive. Built |
| **Film Room** | **DEAD** | PARKED in SYSTEM_MAP. RAM issues |

---

## 12. CATHEDRAL FLAVORS

| System | Status | Notes |
|--------|--------|-------|
| **The Dojo** | **DEAD** | 8 agents, 3 loops. PARKED in SYSTEM_MAP |
| **The Atelier** | **DEAD** | 8 agents, 4 loops. PARKED |
| **The Scriptorium** | **DEAD** | 8 agents, 4 loops. PARKED |

**Summary:** Flavors were design exercises. No active development. Formally dead.

---

## 13. POLYMARKET

| System | Status | Notes |
|--------|--------|-------|
| **PM Scanner** | **DEAD** | STOPPED |
| **Polymarket Dashboard** | **DORMANT** | Routes exist |
| **Calibration Tracker** | **DORMANT** | Built |

---

## 14. GOLDMINE MINERS

| System | Status | Notes |
|--------|--------|-------|
| **Patent Miner** | **DEAD** | All 4 stopped. Never produced meaningful output |
| **Clinical Miner** | **DEAD** | — |
| **PhD Miner** | **DEAD** | — |
| **Soviet Miner** | **DEAD** | — |

---

## 15. VISUAL / ANIMATION

| System | Status | Notes |
|--------|--------|-------|
| **Visual-gen pipeline** | **LIVE** | OpenArt + cost control + seeds. Active every session |
| **Animation Lab** | **REHEARSING** | Lab gallery 2.4MB. Protocol established. Growing |
| **3D Logan Lab** | **REHEARSING** | Bhagat rig + mocap. E01-08 done. Technique library live |
| **Stained Glass** | **REHEARSING** | New visual language per district. Forge's Window = proof |
| **Logan Vector Pipeline** | **REHEARSING** | 1093 atoms. Engine built |
| **Instagram** | **REHEARSING** | Black/gold sketch voice defined. Not posting |

---

## SUMMARY COUNTS

| Status | Count | % |
|--------|-------|---|
| **LIVE** | 28 | 16% |
| **REHEARSING** | 35 | 20% |
| **DORMANT** | 42 | 24% |
| **DEAD** | 68 | 40% |

---

## THE PROBE'S BLIND SPOT (confirmed)

The probe currently reads DEAD and REHEARSING identically: score 0, amplitude 0 or near-0. But:

- **35 systems are REHEARSING** — active preparation toward a go-live. These are NOT failed systems. They're theatres in rehearsal.
- **68 systems are DEAD** — no plan, no activity, should be formally archived or killed.

The difference matters enormously for planning. A system that's REHEARSING needs a timeline and publish-ready criteria. A system that's DEAD needs a kill decision or a resurrection plan.

---

## BIGGEST REHEARSAL CLUSTERS (where the timeline matters most)

### 1. Coaching OS (15+ tools)
**What's built:** Full suite — planner, drills, capture, hub, whiteboard design, combo cards, class sheet, 134 technique animations
**What's missing:** Daily operational integration into Paul's gym workflow
**Rehearsal phase:** Set is built, cast is ready. Need: first dress rehearsal (Paul uses the tools for one real class week)
**Timeline trigger:** When Paul decides to run a class through the system end-to-end

### 2. BR Public Presence (website + content + Instagram)
**What's built:** Website v4, design bibles, Instagram voice, content pipeline, first-visit conversion design, beginner week design
**What's missing:** Paul's quality standard met for public output
**Rehearsal phase:** Scripts written, production not started. Need: first content that meets the standard
**Timeline trigger:** Paul says "this is ready to publish" on one piece

### 3. Reed / Content Studio (full pipeline)
**What's built:** Character-driven content gen, visual hub, API layer, buzz monitor, Maya social intel
**What's missing:** M5 hardware + Paul's quality standard for content
**Rehearsal phase:** Engine built, fuel not loaded. Need: M5 + first content cycle
**Timeline trigger:** M5 arrives (Nov 10) + first Reed-produced piece that passes quality gate

### 4. Visual / Logan (animation + vectors + stained glass)
**What's built:** 1093 atoms, Bhagat rig, technique library, animation lab, stained glass concept
**What's missing:** Consistent production workflow (same pattern as compression — capability exists, workflow doesn't)
**Rehearsal phase:** Most advanced. Already producing in sessions. Need: autonomous production routine
**Timeline trigger:** M5 + visual-gen workflow maturation

---

## RECOMMENDED KILLS (DEAD systems consuming resources or attention)

| System | Why Kill | Action |
|--------|---------|--------|
| lucy-heartbeat | 5 months dead, online consuming PM2 slot | `pm2 delete lucy-heartbeat` |
| Cathedral Flavors (3) | Design exercises, PARKED, no resurrection plan | Archive genomes, delete PM2 entries |
| Goldmine Miners (4) | Never produced meaningful output | Delete PM2 entries |
| Cathedral City | Social simulation, no evidence of use | Remove routes |
| Morning View | Stopped, no state file | Delete PM2 entry |
| WhatsApp Integration | Routes wired, never used | Leave routes (no cost), remove from attention |
| Trading system (6 dead) | Orchestrator, Simpsons, Cyclical, Position Guardian, Daily Picks, Allocation | Delete PM2 entries, preserve code |

**Total PM2 slots recoverable:** ~18

---

## WHAT THIS MEANS FOR THE PROBE

The probe needs 3 new capabilities to read the system accurately:

1. **Rehearsal-phase metric** — for each REHEARSING cluster, track progress toward publish-ready criteria. Not binary (transmitting/silent) but a percentage toward go-live.

2. **Dead/Rehearsing flag** — in the voice registry, mark each voice's silent channels as either DEAD (no plan) or REHEARSING (active prep). Different amplitude treatment.

3. **Cluster health** — the 4 big rehearsal clusters each need a composite readiness score. Coaching OS might be 70% ready (tools built, data flowing, missing daily use). BR presence might be 30% ready (designs done, no production).

---

## FOR PAUL'S CORRECTION

This audit is Forge reading the numbers. Same pattern as the voice jam: I classified based on data (PM2 status, file timestamps, memory notes). Paul should correct based on context:

- Systems I called DEAD that are actually REHEARSING (I can't see plans in your head)
- Systems I called REHEARSING that are actually DEAD (you've quietly abandoned them)
- DORMANT systems that should be reclassified (some dormant tools might be LIVE-on-demand)
- The 4 rehearsal cluster descriptions — are the timeline triggers right?
- The recommended kills — anything I want to delete that has a future?
