# REVIEW PROMPT: Design Bible Stress Test

You helped design the prompt that generated this document. Now review the OUTPUT.

Assume this document will never be seen by the original author again. A frontend team, an AI coding agent, and a future AI model must implement the system using only this document. Judge it as executable specification, not inspirational writing.

This is the Gym Eyes Visual Standard — a design bible for a boxing coaching AI system's visual interface. You pushed for: understand-before-designing, brand tensions, five senses, camera language, three horizons, ten commandments, material bible, personality, anti-patterns.

Grade each section (A/B/C/D) on:
1. SPECIFICITY — can a developer implement from this alone, no guessing?
2. INTERNAL CONSISTENCY — do sections contradict each other?
3. COVERAGE — what's missing that a real build would need?
4. VOICE — does it read as a constitution or just a style guide?

Then answer:
- Which section is thinnest? What's missing?
- Which section is strongest? What makes it work?
- Does the material bible actually function as characters, or is it just a list of textures with personality labels?
- Are the Ten Commandments actually commandments (falsifiable rules) or aspirational statements?
- If you handed this to a frontend developer with no other context, what would they get wrong?
- What would you add in v2?

## 11. Translation Loss Audit
For every section answer:
- Which sentences are objectively implementable?
- Which require human taste?
- Which require knowledge that exists only in the author's head?
Highlight every place where a coding agent would have to guess.

## 12. Machine Interpretability
Assume Claude Code receives only this document. Which concepts become: deterministic / probabilistic / impossible
For every impossible concept explain exactly why.

## 13. Drift Resistance
Imagine three developers implement this independently. How similar would the results be? Identify every place where interpretation would diverge. Estimate divergence as: Low / Medium / High

## 14. Testability
For every major rule, answer: is it testable?
- Bad: "Feels premium." (impossible to verify)
- Good: "Never use more than three simultaneous accent colors." (falsifiable)
A constitution needs laws, not poetry.

## 15. Semantic Density Map
Highlight the 20% of the document that carries 80% of the design intent. Those become the immutable core. Everything else becomes commentary.

## 16. Compression Test
If this document disappeared tomorrow, which five pages would you reconstruct first? That forces prioritization — the answer reveals the actual foundation.

CONSTRAINT: Do not suggest more content unless you first identify which existing section should shrink. Design bibles become encyclopedias. The better question is: what deserves constitutional status?

Be surgical. You designed the brief — hold the output to the standard you set.

---

# SOURCE DOCUMENT: GYM EYES VISUAL STANDARD

# GYM EYES — DESIGN MANIFESTO & VISUAL STANDARD

**Version 1.0 — 2026-07-03**
**Basic Reflex · Hong Kong · Est. 2012**
**Status: CANONICAL. Read before building any Gym Eyes interface. This document outranks trends, frameworks, component libraries, and your own taste.**

---

## HOW TO USE THIS DOCUMENT

- **Part I — The Manifesto** is for humans and for AI agents deciding *what* something should feel like. It is the constitution.
- **Part II — The Visual Standard** is for AI coding agents and engineers deciding *exactly what values to type*. It is the law's implementation. Two agents reading Part II independently must produce screens that look like siblings.
- **Appendix — The Drift Ledger** lists existing files that violate this standard, so they get corrected, never copied.

If Part I and Part II ever appear to conflict, Part I wins, and Part II has a bug — file it.

---

## THE UNDERSTANDING (read first — why the product looks like this)

Before the rules, the answers to the questions every designer must be able to answer from memory:

**What is this product really trying to teach?**
Not boxing moves. *Seeing.* Gym Eyes teaches the five diagnostic questions a coach asks of any position: Can I be hit? Where am I open? What can I do from here? What am I giving up? Can I get back? The software's real product is transferring Coach Paul's eyes to the student. Every screen is an act of revelation — making visible what the coach already sees.

**Why does it exist?**
Because coaching knowledge dies in the coach's head. Gym Eyes is the externalized nervous system of one gym — Basic Reflex, Hong Kong — built on the Cuban school: discipline, geometry, rhythm, economy. It exists so that the analysis a master gives one student at a time can stand in the room permanently, glowing quietly on the wall.

**What emotions should users feel in each room?**
Entering the Hub: *arrival* — lights coming up in a gym after hours, you were expected. The Guard: *sober attention* — an anatomy lesson about your own vulnerability. The Grid: *clarity* — a chessboard where the fog lifts. Drill Player: *aspiration* — watching the ideal athlete demonstrate under warm lights. Virtual Tutor: *honest measurement* — a mirror that doesn't flatter. Analytics: *earned pride* — the ledger of work done. The Questions: *initiation* — being let in on how the master thinks. Everywhere: *respect*. Never: hype, gamified dopamine, alarm-panic.

**What makes it different from every sports analytics dashboard?**
Dashboards display data *about* an activity. Gym Eyes is a *place where the activity lives*. It has a floor, a light source, dust in the air, ropes at the edge of vision, mottos painted on the walls at 3% opacity. Data appears as physical things — footprints on timber, a breathing shield of gold light, brass joints, target zones on a body. A dashboard tells you your numbers. Gym Eyes shows you your position.

**What should a first-time user immediately understand?**
That this was *built by a fighter's gym, not a software company*. That gold means "alive / pay attention here," dimness means "resolved / at rest," and red means "you can be hurt." That each room teaches one idea. And that they are the figure in the middle of the light.

**If Gym Eyes were a physical place, what would it feel like?**
A converted industrial unit in Hong Kong at 10pm. One bank of warm tungsten tubes still on over the ring. Timber floor worn smooth in the center. Heavy bags hanging in the dark periphery. A brass-fitted instrument console — built by hand, bolted to the wall — glowing amber. The Cuban academy's discipline in a Kowloon shell: nothing decorative, everything earned, everything maintained.

**What is already RIGHT in the existing product (preserve at all costs):**
1. Warm brown-black backgrounds — dark but never dead (`#0d0b08`, not `#000` or blue-black).
2. Gold `#f7b408` used with extreme restraint — mostly at 2–15% opacity as atmosphere, saved at full strength for the one thing that matters now.
3. The environmental canvas layer: grain, drifting dust, spotlight cone, ring ropes, wall mottos, vignette (hub.html is the reference implementation).
4. Brass-gradient joints and machined-dial controls — data rendered as metal, not pixels.
5. The inverted alert hierarchy in The Guard: *safe is dim, danger glows*. Protected zones recede into graphite; exposed zones burn. This is the product's soul in one decision.
6. Bebas Neue doing the room signage and numbers; Anton doing the sacred identity marks.
7. The bottom gym-nav — one hallway shared by every room, active room marked by a gold top border.
8. Loading screens as ritual entrances (Drill Player's manifesto loader with the block numbers lighting up).
9. The mottos as architecture: "DISCIPLINE BUILDS FREEDOM", "RESPECT THE PROCESS", "Built on Respect. United by Boxing."
10. The single sanctioned cool color: the opponent's cyan rings in The Grid. Everything warm is *you*; the one cold color is *them*.

---
---

# PART I — THE GYM EYES DESIGN MANIFESTO

---

## 1. BRAND PHILOSOPHY

Gym Eyes is not software about boxing. It is **a piece of boxing equipment that happens to run on screens.**

Every object in a boxing gym earns its place: the bag by absorbing punishment, the timber floor by carrying footwork for a decade, the coach's voice by being right. Gym Eyes must earn its place the same way. Its interfaces are instruments — like a machined timing clock or a brass fight bell — not pages. They are built once, built heavy, and expected to still feel correct in ten years.

**The emotional contract with the user:**

- *We will never waste your attention.* If something glows, it matters. If it's dim, it's handled.
- *We will tell you the truth warmly.* The room stays warm even when the news is bad. A red zone on your guard is a coach's hand on your shoulder, not a fire alarm.
- *You are the hero; we are the corner.* The boxer's figure stands in the light at the center of every room. The interface stands in the shadows at the edges, like a good cornerman.
- *Nothing here is a trend.* No glassmorphism, no neon, no confetti. When you return in five years, the room will look the same, the way a good gym does.
- *Every room teaches one idea.* You leave each screen able to say the lesson in one sentence.

The aesthetic sources — Destiny 2's material weight, Gran Turismo 7's museum calm, Death Stranding's quiet HUD restraint, a Cuban academy's poverty-forged discipline — all point to the same law: **premium is what remains after everything unearned is removed.**

---

## 2. THE TEN COMMANDMENTS OF GYM EYES DESIGN

Check every future decision against these. If a design violates one, the design is wrong — not the commandment.

**I. Reveal what the coach sees.**
Every visualization must answer: *what would Coach Paul point at?* If a feature doesn't externalize a coach's perception, it is decoration and must be cut.

**II. Safe is dim; danger glows.**
Attention is the scarcest resource in the room. Resolved things recede into graphite. Only threats, live actions, and the current lesson may hold light. Never light up good news just to celebrate it.

**III. Data must be somewhere, not just something.**
Numbers live on bodies, floors, and zones — a percentage sits inside the target it measures, a footprint lands where the foot goes. A metric with no location has not been designed yet.

**IV. The gym is part of the interface.**
Every room keeps its atmosphere: grain, dust, tungsten light, vignette, the ropes and bags in the periphery. Strip the environment and you have a dashboard; Gym Eyes is never a dashboard.

**V. Motion must explain, never entertain.**
Every animation exists to show weight shifting, time passing, coverage changing, or a room being entered. If pausing an animation loses no meaning, delete it.

**VI. Materials are earned, not painted.**
Brass, leather, timber, and graphite appear because they exist in the gym. No material may appear that couldn't physically be bolted into Basic Reflex. (This is why there is no glass, no chrome, no plastic gradients.)

**VII. Gold is the coach's voice — spend it like money.**
`#f7b408` at full strength marks *the one thing to attend to now*. Background gold stays under 15% opacity. A screen shouting gold everywhere is a coach who never stops yelling; nobody learns from that coach.

**VIII. Every screen teaches one idea.**
One room, one lesson, one hero element. Secondary information supports from the sidebars at whisper volume. If a screen teaches two ideas, it is two rooms.

**IX. Quiet confidence — never gamer, never SaaS.**
No neon, no cyber-grids, no achievement confetti, no rounded friendly cards, no emoji in chrome. The register is a master coach at ringside: few words, low voice, absolute authority.

**X. Coach before you score.**
Every number appears with its correction. A grade without a "here's what to fix" is judgment without coaching, and Gym Eyes never judges without coaching. Error and failure states speak in the coach's voice ("Reset. Walk it back to guard.") — the system pausing, never the system crashing.

---

## 3. VISUAL PRINCIPLES

Beyond the commandments — the working rules of every composition:

1. **One light source per room.** Tungsten, overhead or high-side, warm (`#ffeedd`). Everything bright must be explainable by that light or by gold emission. Two competing light moods = broken room.
2. **The center belongs to the boxer.** Compositions radiate from a centered or near-centered figure/arena. Chrome (panels, nav, controls) clamps to the edges and fades toward the middle via gradient scrims — never boxes floating over the action.
3. **Hierarchy by luminance, not by size wars.** The eye path is: glowing gold → warm white → mid gray → ember → invisible. Type sizes stay disciplined; brightness does the ranking.
4. **Hairlines, not walls.** Panels separate with 1px warm-dark borders (`#1a1810`) and inset shadows, not gaps of dead space or thick strokes.
5. **Uppercase is signage; sentence case is speech.** Bebas/Anton labels are painted on the wall (uppercase, letterspaced). Explanations and coaching lines are a person talking (DM Sans, sentence case, muted).
6. **Numbers are physical objects.** Big values render in Bebas Neue like painted stencils; they change with transitions (count-ups, bar fills) because physical gauges never teleport.
7. **The periphery whispers history.** Wall mottos at 2–4% opacity, est. lines, block numbers, badge marks — visible only when looked for, like decade-old paint.
8. **Warm alerts.** The alert ramp runs *dim graphite → gold → warm white → blood red*. Never traffic-light green/yellow/red. Green does not mean safe here; **dim means safe.**
9. **The opponent is the only cold thing.** Reserved cyan (`#00c8dc` family) marks the adversary — their rings, their range, their data. All warmth is ours; all cold is theirs.
10. **Nothing appears instantly.** Everything enters with weight — a fade-up, a rise of 8–20px, a stagger. The screen assembles like lights coming on section by section, 60–150ms apart.
11. **Symmetry as discipline, asymmetry as event.** Base layouts are stable and near-symmetric (stance). Asymmetry appears only to mark something happening (a step, a gap, an alert) — like a boxer leaving guard to punch.
12. **Density with air.** Sidebars may be information-dense (a coach's clipboard is dense) but the main arena keeps sacred emptiness around the hero. Cramped arena = failed screen.

---

## 4. ANTI-PATTERNS — WHAT GYM EYES MUST NEVER LOOK LIKE

Purge on sight:

- **Generic SaaS dashboards** — white/gray cards, 12-16px rounded corners, drop shadows on everything, KPI tiles in a grid, blue primary buttons. (The current `homework.html` is this. It is the ledger's worst offender.)
- **Neon cyberpunk / esports** — cyan-magenta glows, scanlines-as-style, glitch effects, hexagon-mania, aggressive angular clip-paths.
- **Overcrowded metrics walls** — twelve charts fighting; a Bloomberg terminal for punches. One hero, whispering support.
- **Floating glass everywhere** — glassmorphism, frosted translucent cards drifting over blurred backdrops. Panels here are bolted to the frame.
- **Sci-fi for its own sake** — orbiting rings, radar sweeps, and HUD brackets with no data meaning. Every tactical element must measure something real.
- **Cartoon sports graphics** — bouncy easing, mascot energy, comic italic type, flame emojis, "🔥 STREAK!"
- **Apple Health / wellness pastel** — soft mint/lavender rings, rounded friendliness, celebratory bursts. Gym Eyes respects you too much to pat your head.
- **Bootstrap-anything** — default component shapes, pill badges, alert boxes in pastel tints. (Current `film-room.html` chips drift here.)
- **Cold-tech dark mode** — pure `#000` or blue-blacks (`#0a0a0f`, `#111827`), gray-on-gray, dead air. Dark here is *warm* — embers, not space.
- **Emoji as iconography in chrome.** Icons are drawn line-work or geometric glyphs. (One 🥊 in a header cheapens the whole academy.)
- **Trend-of-the-year effects** — whatever is currently fashionable (bento grids, aurora gradients, oversized serif italics). If it dates, it's banned.
- **Hallucinated brand colors** — burgundy `#8B2020`, maroon `#8b1a1a`/`#7B3040`, olive `#6B7C47`, copper-as-identity `#B87333`/`#c8814b`. These were never Basic Reflex. They keep re-appearing through agent drift. **Purge on sight, every time, no exceptions.**

---

## 5. BRAND TENSION

Iconic products are stretched between opposing forces and refuse to resolve the tension. Gym Eyes holds seven. When a decision is hard, find which tension it sits on and hold *both* ends:

| Force A | Force B | How Gym Eyes holds both |
|---|---|---|
| **Cuban tradition** | **AI intelligence** | The knowledge is centuries-old craft (guards, footwork, rhythm); the delivery is machine vision and DTW scoring. Render ancient content with modern precision — never make the AI look old-timey, never make the craft look digital. |
| **Craft** | **Technology** | Surfaces feel hand-built (brass dials, timber, stencils) while the behavior is computational (live coverage math, pose tracking). The machine wears a workshop's body. |
| **Coach intuition** | **Measured analytics** | Every number is framed by judgment: grades come with strategy text, coverage comes with "The Questions." The metric is the evidence; the coach's sentence is the verdict. Never ship the metric alone. |
| **Industrial materials** | **Elegant software** | Heavy visual materials, feather-light interactions. Panels look like steel; they respond in 150ms. Weight in the look, grace in the behavior. |
| **Quiet confidence** | **Athletic intensity** | The room is calm — until something fires. Punches land as sharp 100–200ms events inside slow, breathing ambience. Intensity is an *event*, calm is the *state*. |
| **Human warmth** | **Machine precision** | Tungsten warmth, coaching voice, worn textures — carrying pixel-exact geometry, monospaced-discipline numbers, honest measurement. Warm container, precise contents. |
| **Darkness** | **Life** | Backgrounds are nearly black but never dead: grain moves, dust drifts, gold breathes at ±1.5%. Dark = focus. Dead = failure. |

---

## 6. THE MATERIAL BIBLE

Materials are characters in the academy. Know them as personalities before you know them as hex values (implementation specs in Part II §4).

**BRASS** — *the veteran.* Not yellow: warm metal that has been gripped for years. It carries the light in the room — every joint, dial, and fitting. Brass never appears flat; it always has a highlight facing the tungsten and an oxidized shadow. It is the body of value: skeleton joints, dial knobs, bell fittings. When brass glows, it's because the light found it, not because it's a neon.

**GRAPHITE** — *the quiet professional.* Not black: matte, machined, slightly warm dark metal. Limbs of the skeleton, resolved states, panel hardware, inactive controls. Graphite is what things look like when they are handled and require no attention. It absorbs light without dying. Most of any screen is graphite by area.

**LEATHER** — *the soul.* The bags, the gloves, the worn brown of equipment that has absorbed ten thousand punches. Deep oxblood-browns, matte, with a faint sheen only at the highlight. Leather appears in the periphery (bags in the dark) and at the point of contact (gloves). It carries the gym's history in its color.

**TIMBER** — *the ground truth.* The floor. Warm, worn, grain running one direction, polished in the center by footwork. Everything stands on timber; The Grid *is* timber. It grounds the palette — without it the dark becomes space; with it, the dark becomes a room.

**CONCRETE** — *the honest structure.* Walls and outer frame. Rough, undecorated, load-bearing. Concrete appears as the barely-lit periphery texture and the heavy outer borders of loading frames. It never apologizes for being plain.

**TUNGSTEN** — *the living light.* The only light source: warm-white with an amber heart (`#ffeedd` core, `#ddaa55` spill). Directional, overhead, alive — it makes cones, pools, and long shadows. Every glow in the interface is either tungsten reflection or gold emission. Cold light (pure white, blue) does not exist inside the academy.

**DUST** — *presence.* Floating motes drifting slowly upward through the light cone, plus fine film grain over everything. Dust is why the air feels real and the room feels inhabited. Not dirt — atmosphere. A Gym Eyes screen with no particulate is a render; with it, a place.

**PATINA** — *earned wear.* Wall mottos faded to 3%, borders that darken toward corners, badges at half opacity, "EST. 2012" in near-invisible ember. Patina is history rendered as opacity. It is never damage, never grunge-texture-pack — it is the specific fading of things that have hung in one place for years.

---

## 7. CAMERA LANGUAGE

Each room has a fixed cinematography. A user must know which room they're in with the titles stripped:

- **The Hub — wide establishing shot.** Locked wide angle, eye level, full figure centered under the overhead light, ropes and bags in frame, callouts orbiting at the edges. The camera of a documentary's opening frame. Nothing moves fast here; the room presents itself.
- **The Guard — frontal anatomy lecture.** Dead-on, chest-height, tight enough that the figure fills the vertical. Zero perspective drama — this is clinical frontality, the boxer as diagram. The camera never moves; the guard moves.
- **The Grid — the ceiling god-view.** Top-down orthographic onto timber. The chessboard shot. Footprints, rings, and vectors read like notation on a score. Clean, flat, tactical — the only room with no horizon.
- **Drill Player — the three-quarter hero.** Perspective camera, slightly low, orbiting permitted. BR-05 demonstrated under the spotlight in a full 3D gym — the Gran Turismo showroom shot applied to an athlete. This is the only cinematic-orbit room; motion of the camera is earned by the 3D content.
- **Virtual Tutor — the clinical side-by-side.** Comparison framing: student and coach ghost in the same space, mid-shot, neutral angle. The camera of a film-study session — steady, symmetric, judging by superposition.
- **Analytics (Coach Vision) — the architect's elevation.** No camera at all: calm flat information architecture, generous margins, columnar. The one room that reads like a printed report pinned to the office wall — but on academy materials, not SaaS cards.
- **Film Room — the theater.** Dark surround, bright screen center, controls on the armrest. Lights down: chrome dims to near-invisible while footage plays, rises when paused.
- **The Questions / Homework — the notice board.** Vertical scroll, centered column, large numerals in the margin. Reading posture, not operating posture — these are the rooms where the student reads the wall.

---

## 8. THE FIVE SENSES

**SIGHT.** One warm light, deep shadow, gold as attention. Contrast is high between lit and unlit, low within each. Depth from: vignette (edges fall off 30–60%), fog on 3D distance, three planes (environment whisper → arena → chrome).

**MOTION.** Everything has mass. Panels are heavy steel: they slide short distances with decisive ease-out. Data is liquid metal: bars pour, numbers count. Live elements breathe at resting-heart-rate (~8–12 cycles/min, ±1–2% scale). Strikes/events are the only fast things: 100–200ms, sharp in, soft out — a punch: instant extension, controlled retraction.

**SOUND** (for when rooms gain audio — design to this even in silence):
- *Success:* a single low bell strike — the ring bell at half volume, dry, no shimmer.
- *Danger/exposure:* no siren; a low tom hit or the dull thud of a bag — felt more than heard.
- *Loading/entering:* room tone rising — distant skipping rope, a chain creak, HVAC hum fading up with the lights.
- *Selection/click:* mechanical — a dial detent, a switch throw. Never a "pop" or digital blip.
- *Ambient:* the after-hours gym: low hum, occasional chain settle, faint traffic beyond the wall. Silence between sounds is part of the sound.

**TOUCH.** If this were hardware: machined aluminum dials with knurled edges and firm detents; heavy toggle switches that throw with a clack; leather-wrapped grab handles; buttons like brass bell-pushes — deep travel, definite bottom. Nothing membrane, nothing mushy, nothing capacitive-glass-slippery. Every visual control must *look like it would feel this way* — dials render with knurls and highlights, toggles with visible travel, buttons with press-depth.

**ATMOSPHERE.** Dust in the light cone. Grain on everything (opacity ~3–5%). The vignette holding the edges. Warm silence. The feeling of being the only one in the gym at night with the coach — privacy, focus, slight ceremony.

---

## 9. ENVIRONMENTAL STORYTELLING

Rooms communicate purpose through ambience before a single label is read:

- **The Hub** says "command center" with: the full gym environment (ropes, bags, speed bag silhouettes), the radar rings under the figure, four callouts wired to the center by dashed hairlines, and the wall mottos. It is the only room showing the *whole* gym — establishing that the other rooms are inside it.
- **The Guard** says "vulnerability lab" with: target zones painted on the body like a medical chart, the breathing gold shield polygon between the gloves, and red only where flesh is reachable. The dragging gloves say "this is *your* guard to reshape."
- **The Grid** says "tactics" with: timber grain, concentric range rings, the quadrant cross, and boot prints with actual tread. The floor itself is the interface — no figure, just feet, because footwork is the lesson.
- **Drill Player** says "demonstration hall" with: a physical 3D gym (windows leaking amber light, tube lights, hanging bags, framed photos), fog in the far corners, and the skinnable demonstrator BR-05 under the spot. Watching, not operating.
- **Virtual Tutor** says "the honest mirror" with: two skeletons in one space, deviation lines between them, and a scoreboard that speaks in letter grades — the room where you and the ideal occupy the same square meter.
- **Analytics** says "the coach's office" with: calm columns, session ledgers, grades — the one carpeted room in the building.
- **The Questions** says "initiation wall" with: giant numerals in the margin like painted signage, questions in stencil type, hover bringing each to gold life — reading the creed painted by the door.

The rule: **each room owns one signature ambient element** (Hub: the whole gym / Guard: body zones + shield / Grid: timber + rings / Drill Player: the 3D hall / Tutor: the twin figures) — and no room borrows another's signature.

---

## 10. THE GYM EYES UNIVERSE

These are not modules. They are roles inside one academy, and each interface is that role's workplace:

- **Logan coaches.** The character/voice layer — when coaching is spoken or personified, it is Logan (public-facing: always "Coach Paul").
- **BR-05 demonstrates.** The gold-and-brass mannequin athlete in Drill Player. It never fails, never gets graded — it is the platonic rep. Its brass body is the reference use of the material bible.
- **Gym Eyes observes.** The vision system itself — cameras, pose tracking, the radar motif. Wherever tracking is represented, it is Gym Eyes watching: patient, precise, unblinking.
- **The Guard reveals.** Shows the truth about a position — coverage, gaps, trade-offs.
- **The Grid structures.** Turns space and rhythm into notation — blocks, beats, footprints.
- **Virtual Tutor compares.** Holds you against the ideal and names the difference.
- **Coach Vision (Analytics) remembers.** The academy's ledger — sessions, trends, grades.
- **The Questions initiates.** Teaches the diagnostic eye itself.
- **Homework extends the academy home.** The student's satchel — the one room a student carries out the door (it must still feel like the academy, merely portable — see Drift Ledger).

New modules must be introduced the same way: *a role in the academy with a room of its own*, given a name with "The" weight (The Guard, The Grid…), one lesson, one signature ambient element, and one camera.

---

## 11. THE GYM EYES PERSONALITY

If Gym Eyes stood in the gym as a human coach:

- **How they speak:** Few words, low volume, concrete. "Elbow's drifting. Bring it home." Never exclamation points, never jargon-flexing, never baby talk. Second person, present tense, imperative when correcting.
- **How they move:** Economically. They walk over when needed, stand still otherwise. They demonstrate once, slowly, then again at speed.
- **How they correct mistakes:** By naming the exact thing and the exact fix, immediately, without shame. The correction is a gift, delivered flat: "You're open under the lead arm. That's where the hook comes."
- **How they praise:** Rarely, briefly, and therefore meaningfully. A nod. "Better." Praise inflation is forbidden — no screen celebrates routine competence.
- **How they enter a room:** Lights on section by section; presence before speech. (This is why entrances stagger and nothing pops in.)
- **What they never say:** "Awesome!!" "You crushed it! 🎉" "Oops, something went wrong 😅." They never apologize theatrically, never hype, never fill silence.
- **Values they embody:** Discipline builds freedom. Respect the process. Truth over comfort. The work is the reward. Everyone starts at Block 1.

Every animation curve, color choice, and line of UI copy should pass the test: *would this coach do it?* A bouncing badge would not. A slow nod of gold light would.

---

## 12. THE THREE HORIZONS

Design decisions must survive three stages. What survives all three is the identity; everything else is implementation.

**Horizon 1 — Today: desktop browser, mouse, Canvas/Three.js.**
Full spec as written in Part II. Hover states exist; density tuned to a coach at a desk or laptop at ringside.

**Horizon 2 — Tomorrow: 55" touchscreen beside the ring. Coach and boxer standing together.**
- Touch targets grow (≥56px), hover states get press equivalents, dials become genuinely draggable.
- Viewing distance doubles → type scale up ~1.5×, whisper-layer opacities up slightly (3% → 5%).
- Sweat and wraps on hands: primary interactions must work with a knuckle. Precision drags (Guard gloves) get large grab halos.
- The room ambience matters *more*: at that size the environment layer is life-size scenery.

**Horizon 3 — Five years: spatial computing, AR glass, projection.**
- Materials and light ARE the interface: brass, tungsten cones, and dust translate directly to volumetric rendering; flat cards would not have. This is why the material bible, not the panel spec, is the deep identity.
- The Grid projects onto a real floor; The Guard overlays a real body; BR-05 stands in the actual ring.
- Chrome dissolves; the commandments remain: safe is dim, danger glows, gold is the coach's voice, one lesson per space.

**What survives every platform (the invariant core):** the palette (black/gold/white + warm materials), Anton/Bebas signage, the tungsten-lit warm dark, the inverted alert hierarchy, dust/grain presence, the coach personality, the room metaphor, the mottos. **What may change per platform:** panel geometry, navigation mechanics, type sizes, input affordances.

---

## 13. IF THE WORLD'S BEST INDUSTRIAL DESIGN TEAM ACQUIRED GYM EYES TOMORROW

**They would preserve** (the essence — untouchable):
- The warm-black + gold single-accent system and the inverted alert hierarchy.
- The material bible and single tungsten light.
- Rooms-not-pages, one lesson per room, the boxer centered.
- Bebas/Anton signage voice; the mottos; the coach personality of all copy.
- The environmental layer (they would call it the product's "acoustic" and defend it fiercely).

**They would refine** (the craft debt):
- Unify the drifted rooms (Tutor, Analytics, Film Room, Homework) onto the standard — one palette, one body font, one panel system.
- Systematize spacing and type to exact scales (done in Part II).
- Replace remaining emoji/unicode glyph icons with a drawn icon set at consistent stroke weight.
- Tune performance so grain/dust/glow run at 60fps on modest hardware — atmosphere must never cost responsiveness.
- Add sound design (per §8) and haptic-grade motion timing.

**They would absolutely refuse to change:**
- Gold `#f7b408`. Exactly. Not "modernized," not gradient-mapped, not A/B tested.
- The darkness being warm. The first consultant who suggests "cleaner neutral grays" is escorted out.
- The restraint. No feature may add its own color, its own celebration, or its own font. Growth happens by adding *rooms*, never by adding *noise*.
- The Cuban-academy humility: the product must keep feeling built by hand for one gym, even at scale. The moment it feels like a platform, it has died.

---
---

# PART II — THE GYM EYES VISUAL STANDARD

*Implementation law for AI coding agents and engineers. Values are exact. Where a range is given, both ends are legal; anything outside is not. All examples are CSS unless noted. Three.js values are given where rooms are 3D.*

---

## II.1 COLOR SYSTEM

### 1.1 The canonical tokens

Declare these on `:root` in every Gym Eyes page. **No other named colors may be introduced.** One-off hex values are permitted only as alpha/gradient stops derived from these tokens.

```css
:root {
  /* ── IDENTITY (non-negotiable) ── */
  --gold:        #f7b408;  /* THE accent. The coach's voice. */
  --black:       #000000;  /* identity black — print/logo contexts */
  --white:       #ffffff;  /* identity white — print/logo contexts */

  /* ── GOLD RAMP (light states of the same metal) ── */
  --gold-hot:    #ffd040;  /* hover/peak highlight of gold elements */
  --gold-high:   #ffc832;  /* gradient top of gold fills */
  --gold-deep:   #c8a020;  /* gradient bottom of gold fills */
  --brass:       #c8a830;  /* lit brass surface */
  --brass-mid:   #8a7a30;  /* brass body */
  --brass-dark:  #5a4a20;  /* brass in shadow */
  --ember:       #5a5040;  /* near-dead warm glow — patina text */

  /* ── SURFACES (warm blacks; NEVER blue-blacks) ── */
  --void:        #080806;  /* nav bar, deepest chrome, footer */
  --arena:       #0d0b08;  /* main stage/canvas background */
  --room:        #0c0b08;  /* sidebar/panel base (use at .97 alpha over arena) */
  --surface:     #12100c;  /* raised panel fill */
  --surface-2:   #1a1712;  /* second-level raise: inputs, wells, tracks */
  --line:        #1a1810;  /* the universal hairline border */
  --line-strong: #2a2418;  /* emphasized border / raised edge */
  --line-active: #3a3020;  /* border under hover */

  /* ── TEXT (warm whites and grays) ── */
  --text:        #e8e4de;  /* primary — warm bone white */
  --text-muted:  #888888;  /* secondary / explanations */
  --text-dim:    #555555;  /* labels at rest, tertiary */
  --text-faint:  #3a3a3a;  /* de-emphasized, disabled-adjacent */
  --text-ghost:  #333333;  /* minimum legible */
  --text-patina: #2a2010;  /* wall-paint text: barely there, warm */

  /* ── STATES (the inverted alert ramp) ── */
  --state-safe:    #3a3a3a;             /* SAFE IS DIM. Never green. */
  --state-watch:   #f7b408;             /* attention — gold */
  --state-danger:  #fff8e0;             /* serious — hot warm white */
  --state-critical:#dc2828;             /* blood red — can be hurt NOW */

  /* ── THE OPPONENT (only sanctioned cool color) ── */
  --opponent:      #00c8dc;  /* adversary data ONLY: their rings, range, ghosts */

  /* ── DATA VISUALIZATION (charts on dark; in priority order) ── */
  --viz-1: #f7b408;  /* gold — the primary series, the student, "us" */
  --viz-2: #e8e4de;  /* bone — comparison/secondary series */
  --viz-3: #c8a020;  /* deep gold — tertiary warm series */
  --viz-4: #d97a1e;  /* burnt amber — quaternary warm series */
  --viz-5: #dc2828;  /* blood red — negative/danger series */
  --viz-6: #00c8dc;  /* opponent cyan — adversary series ONLY */
  --viz-7: #6b6358;  /* smoke — baselines, grid means, past ghosts */
}
```

### 1.2 Rules of use

- **Gold budget:** at any moment, at most ONE element per screen renders gold at ≥80% opacity (the active item / live beat / current threat). Structural gold (headers of sidebar sections, active borders) stays at 100% hue but small area. Ambient gold (fills, glows, rings) lives at 2–15% alpha: `rgba(247,180,8,.02)` to `rgba(247,180,8,.15)`.
- **Active-state formula** (lists, tabs, nav): text `var(--gold)` + 2px gold edge (left border for lists, top border for nav) + wash `rgba(247,180,8,.04)`. This exact trio, everywhere.
- **Backgrounds are never pure black and never cool.** Test: raise any surface color's RGB — R ≥ G ≥ B must hold. `#0a0a0f` (B > R) is illegal.
- **Success is gold, not green.** A completed drill, a passed check: gold tick, gold text, one low pulse. Green is not in the palette; `--viz-6` cyan is never a "success/info" color.
- **Grades** (S/A/B/C/D) map to warmth, not rainbow: S = `--gold-hot`, A = `--gold`, B = `--text` (bone), C = `--viz-4` (burnt amber), D = `--state-critical`. Rendered as Bebas numerals/letters with a faint matching glow, never pastel pill badges.
- **Red discipline:** `--state-critical` appears only where harm is possible or a destructive action is offered. Never for mere emphasis.
- **Opponent cyan discipline:** anything cyan belongs to the adversary. If there is no adversary on screen, there is no cyan on screen.

### 1.3 Forbidden colors (purge on sight)

`#8B2020` (burgundy), `#8b1a1a` / `#7B3040` (maroons), `#6B7C47` (olive), `#B87333` / `#c8814b` (copper-as-brand), `#C4943A` (fake gold), cool ambient light values (`0x404060`, `0x8888cc`), SaaS blues/purples/greens as chrome (`#2f6fed`, `#a855f7`, `#4ade80`, `#0e9f6e`), and any light theme. These have all appeared through drift and are all wrong. See the Drift Ledger.

---

## II.2 TYPOGRAPHY SCALE

### 2.1 The three voices

```css
/* Load exactly this in <head>: */
@import url('https://fonts.googleapis.com/css2?family=Anton&family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');
```

| Face | Role | Where |
|---|---|---|
| **Anton** | *The identity voice.* Sacred marks only: the GYM EYES wordmark, BASIC REFLEX, wall mottos, the BR monogram. If it's painted on the gym wall, it's Anton. | Hub title, taglines, watermark text, brand blocks. Rare — a screen may have zero Anton and be correct. |
| **Bebas Neue** | *The signage voice.* All operational display: room titles, section headers, big numerals, stat values, beat numbers, grades, buttons, nav labels. The stencil on the equipment. | Everywhere uppercase + tracked. Bebas is the workhorse display face. |
| **DM Sans** | *The speaking voice.* Sentences: descriptions, coaching lines, explanations, form text, tooltips. The coach talking, not the wall shouting. | All body copy. Weights 400/500/600/700 only. |

Anton = permanent identity; Bebas = room operations; **never swap their jobs** (don't set a room title in Anton, don't set the brand tagline in Bebas when Anton is available). Sanctioned exception: a single handwritten accent (`Dancing Script` 500) may appear ONLY as a coach's signature on loading/completion screens — one instance max, never for information.

### 2.2 The scale

All display sizes in Bebas Neue unless marked. Letter-spacing is load-bearing — do not omit.

| Token | Size / line-height | Tracking | Face & case | Use |
|---|---|---|---|---|
| `type-hero` | clamp(48px, 6vw, 72px) / 0.95 | 2–6px | Anton or Bebas, UPPER | Room hero (“THE QUESTIONS”), Hub wordmark (Anton) |
| `type-room` | 36–44px / 1.0 | 3px | Bebas, UPPER | In-room current-subject title (“LONG GUARD”) |
| `type-panel` | 22px / 1.0 | 3px | Bebas, UPPER | Sidebar brand header, modal titles |
| `type-stat` | 36–48px / 1.0 | 2px | Bebas | Big numbers, grades, overall scores |
| `type-subtat` | 18–24px / 1.0 | 1px | Bebas | Rank numerals, beat numbers, secondary stats |
| `type-body` | 13px / 1.5 | 0.2–0.3px | DM Sans 400 | Descriptions, coaching text |
| `type-body-s` | 11px / 1.4 | 0.2px | DM Sans 400–600 | List entries, dense sidebar rows |
| `type-label` | 9px / 1.2 | **1.5px, UPPER** | DM Sans 600 or Bebas | Section headers (“ZONE COVERAGE”) — always with a role color (`--gold` for section heads, `--text-dim` for neutral) |
| `type-micro` | 7–8px / 1.2 | **1–2.5px, UPPER** | DM Sans | Patina lines, footer mottos, nav sublabels |

**Laws:**
- Uppercase display text ALWAYS carries tracking ≥1px; the bigger the type, the wider the absolute tracking (hero up to 6px).
- Bebas/Anton never render below 10px; below that, use DM Sans uppercase.
- Numbers that change live get `font-variant-numeric: tabular-nums` (DM Sans) or Bebas (naturally stable).
- No italics except the coach's parenthetical asides (`.strategy` style notes) and the signature accent.
- No font weights synthesize: Anton/Bebas ship one weight; never `font-weight: bold` them.

### 2.3 Text glow

Display gold text may carry one soft glow: `text-shadow: 0 0 40px rgba(247,180,8,.15)` (hero) or `0 0 20px rgba(247,180,8,.5)` (small active elements like the live beat in a combo string). Never stack glows; never glow non-gold text except `--state-critical` red (`0 0 10px rgba(220,40,40,.4)`).

---

## II.3 SPACING & LAYOUT

### 3.1 Grid

- **Base unit: 4px.** All spacing is a multiple: 4, 8, 12, 16, 24, 32, 40, 48, 60.
- **The room template** (operational rooms — Guard, Grid, and future instruments):

```
┌────────┬──────────────────────────┬─────────┐
│ LEFT   │        ARENA             │ RIGHT   │
│ 180px  │        1fr               │ 240–250px│
├────────┴──────────────────────────┴─────────┤
│ transport strip (optional, 64px)             │
├──────────────────────────────────────────────┤
│ gym-nav (≈48px)                              │
└──────────────────────────────────────────────┘
body: height 100vh, overflow hidden, flex column
#app: display grid; grid-template-columns: 180px 1fr 240px
```

- Left sidebar = *selection* (what to study). Right sidebar = *judgment* (what it means). Arena = the thing itself. Do not inverse.
- **Reading rooms** (Questions, Homework, Analytics): single centered column, `max-width: 640px` (forms) / `900px` (reading) / `1200px` (analytics), vertical scroll allowed there only.
- Sidebar internals: section padding `10px 14px`, row padding `4–8px 14px`, section separation by `border-top: 1px solid var(--line)` — never by margin gaps.
- Panel/HUD padding: `16px 24px`. Card padding: `12–16px`.

### 3.2 Sacred whitespace (never crowded)

1. **The arena core:** a centered zone ≥50% of arena width/height contains ONLY the hero visualization. No panels, no legends, no buttons inside it. Overlays that must exist over the arena (headers) use gradient scrims that reach ≤20% down and are `pointer-events: none`.
2. **Around the hero title:** minimum 24px clearance on all sides.
3. **Around big stats:** a stat numeral owns padding ≥12px; two big numerals never sit closer than 24px.
4. **The nav:** always full-width, always alone in its row, nothing else in the bottom 48px.

### 3.3 Breakpoints

- `≥1280px` — full three-column room.
- `768–1279px` — sidebars compress (left 160px, right 220px); type unchanged.
- `<768px` — rooms stack: arena first (60vh min), sidebars become sequential sections below; reading rooms already fluid; hero type steps down one token (e.g. 72 → 48px, per the-questions.html mobile block).
- Horizon-2 (55" touch): multiply type scale ×1.5, touch targets ≥56px, keep proportions.

---

## II.4 MATERIALS — IMPLEMENTATION

Exact renders for each Material Bible character. Copy these verbatim.

### BRASS (joints, dials, fittings)
```css
/* 2D dial / knob */
background: radial-gradient(circle at 38% 32%, #d4a80e 0%, #7a5a00 55%, #3a2a00 100%);
border: 1.5px solid rgba(247,180,8,.5);
box-shadow: 0 2px 8px rgba(0,0,0,.5), inset 0 1px 2px rgba(255,220,80,.15);
```
```js
// Canvas 2D joint: radial gradient offset to the light (upper-left)
grad = ctx.createRadialGradient(x - r*0.3, y - r*0.3, 0, x, y, r);
grad.addColorStop(0, '#c8a830');   // lit crown
grad.addColorStop(0.6, '#6a5a10'); // body (vary #5a4a18–#8a7a30 by importance)
grad.addColorStop(1, '#2a1a08');   // oxidized under-shadow
// + hairline ring: stroke rgba(200,180,100,.3), lineWidth 0.5–1
```
```js
// Three.js (BR-05 canon): MeshStandardMaterial
{ color: 0xc8960a, emissive: 0x8a6a00, emissiveIntensity: 0.2, roughness: 0.2, metalness: 0.85 }  // joints
{ color: 0xb0880a, emissive: 0x6a5000, emissiveIntensity: 0.1, roughness: 0.25, metalness: 0.8 }  // limbs
```
Brass always: highlight offset toward the tungsten (upper-left in 2D), roughness 0.2–0.3, metalness ≥0.7.

### GRAPHITE (limbs, resolved states, hardware)
```js
// 2D strokes: #3a3020 (arms/major), #2a2418 (torso/minor); round caps.
// Every graphite limb carries ONE parallel edge-highlight line:
//   offset perpendicular ~25–35% of width, stroke rgba(140,120,60,.12), width 1px
```
```js
// Three.js: { color: 0x2a2a28..0x333333, roughness: 0.8, metalness: 0.1–0.2 }
```
Graphite never glows, never saturates. It reads by silhouette + the single warm edge-light.

### LEATHER (gloves, bags)
```js
// Three.js bags: { color: 0x8B5E3C or 0x7A5232, roughness: 0.75, metalness: 0.05 }
// 2D gloves: radial gradient #2a1a08 → #141008 → #0a0804 (near-black oxblood)
//   + brass rim: linear gradient stroke #8a7a30 → #5a4a20 → #8a7a30, width 2–2.5px
//   + one specular dot: circle at (-0.2r, -0.25r), fill rgba(255,240,200,.05–.15)
```
Leather = darkest warm brown with a *single* small highlight. More than one highlight = plastic.

### TIMBER (floors)
```js
// 3D: wood texture, MeshStandardMaterial { roughness: 0.75, metalness: 0.05, color: 0xccbbaa tint }
// 2D (The Grid): base #0d0b08 + vertical grain lines:
//   stroke rgba(255,255,255,.012), 1px, spacing ≈ 6% of arena unit
```
Timber grain runs ONE direction per room. The floor lightens toward the light pool (radial `rgba(247,180,8,.012)` wash) — worn where the work happens.

### CONCRETE (walls, heavy frames)
```js
// 3D walls: { color: 0x5a5550, roughness: 0.95, metalness: 0.02 }
// 2D frame (loading screens): 12px border, border-image
//   linear-gradient(135deg, #1a1510 0%, #2a2218 25%, #1a1510 50%, #2a2218 75%, #1a1510 100%)
```

### TUNGSTEN (the light — see §II.5)
Core `#ffeedd`, spill `#ddaa55`, fixture glow `#f7c83c`. In 3D: key `DirectionalLight(0xffeedd, 1.2)` high-side; practicals `PointLight(0xffeedd, 0.35, 6)`; window spill `PointLight(0xddaa55, 0.4–0.8, 8–10)`; ONE gold rim `PointLight(0xf7b408, 0.5, 10)` behind subject. Ambient must be WARM and low: `AmbientLight(0x403830, 0.5)` — never `0x404060`.

### DUST (particles + grain)
```js
// Particles: 30–50 motes on the arena canvas.
//   size 0.5–2px; drift vx ±0.0003, vy -0.0002 (slow rise); wrap at bounds.
//   color rgba(220,200,140, a) where a = baseAlpha(0.02–0.12) + inLightBoost(≤0.08)
//   — motes brighten inside the light cone, per hub.html drawDust().
// Grain: 128×128 offscreen noise tile (values 0–25, alpha 10), pattern-fill
//   over the full arena at globalAlpha 0.35. CSS fallback: SVG feTurbulence at 3–5% opacity.
```
Dust/grain belong on every arena. Reading rooms may drop particles but keep grain.

### PATINA (earned wear)
```js
// Wall mottos: Anton, rotated ±90° at arena edges, fill #f7b408, globalAlpha 0.025–0.03
// Footer/est. lines: type-micro, color #1a1810–#2a2010 (patina text tokens)
// Badges/photos: opacity .3–.5, warming to .8 on hover only
```
Patina opacity ceiling is 5%. If a whisper element is noticeable at a glance, it's too loud.

---

## II.5 LIGHTING & ATMOSPHERE

The difference between *dark* and *dead*: a dead screen is uniform; a warm one has a light source, falloff, and things faintly moving. Every arena implements this stack, bottom to top:

1. **Base fill:** `#0d0b08`.
2. **Grain** (per §II.4 Dust).
3. **Environment whispers:** ring ropes `rgba(100,80,35,.05–.09)`, equipment silhouettes at `globalAlpha 0.04`, wall mottos at 0.025–0.03.
4. **Spotlight pool:** radial gradient centered on the hero: `rgba(247,180,8,.04) → rgba(247,180,8,.015) → transparent` over ~70% of the arena min-dimension. Alternative warm heart: `rgba(35,28,12,.1) → transparent → rgba(0,0,0,.3)`.
5. **Overhead cone (optional, hub-style):** trapezoid from a small fixture, linear gradient `rgba(247,180,8,.02) → .006 → 0`, plus fixture hotspot `rgba(247,200,60,.15)` with `shadowBlur 10`.
6. **Tactical layer:** radar rings / range circles at `rgba(247,180,8,.02–.12)`, hairline 0.5–1px, dashes `4 3` for connective lines.
7. **The subject** (skeleton, feet, chart — full material treatment).
8. **Dust motes** (in front of subject, they catch the light).
9. **Vignette:** radial, transparent to 60% radius → `rgba(0,0,0,.3)` at 82% → `rgba(0,0,0,.6)` at edge. EVERY arena has this.

**Bloom/glow specs for gold:**
- Ambient breathing glow (shields, live zones): `shadowColor #f7b408, shadowBlur 15`, drawn at `globalAlpha 0.1` on a 3px stroke pass *behind* the crisp 1.5px stroke.
- Active small elements (beat nodes): `box-shadow: 0 0 14px rgba(247,180,8,.25)`.
- Pulsing threat: blur `8 + pulse*6` where `pulse = sin(frame*0.04)*0.5+0.5`.
- Never bloom text and container simultaneously; one glow per element.

**3D (Three.js) canon:** `ACESFilmicToneMapping`, exposure 1.0–1.2; `scene.background` warm `0x0d0b08`; `scene.fog = new THREE.Fog(0x0d0b08, 7, 16)` (fog color = background color, ALWAYS); shadows on; light rig per §II.4 Tungsten. Forbidden: background `0x0a0a0f`/`0x0c0c0e` (cold — extant drift), any blue fill light.

---

## II.6 PANEL DESIGN

The fundamental container. Panels are bolted to the frame — they do not float, they do not round generously, they do not cast outward drop shadows.

**Shared DNA (all variants):** corner radius **0–3px** (0 for structural sidebars, 2–3px max for inset cards/buttons; never more except the sanctioned 8px on floating overlays); border `1px solid var(--line)`; background from the surface ramp; separation *inside* a panel via `border-top: 1px solid var(--line)` between sections.

**Variant A — Structural (sidebars, transport strips):**
```css
background: rgba(12,11,8,.97);
border-right: 1px solid var(--line);            /* or -left/-top per edge */
box-shadow: inset -1px 0 8px rgba(0,0,0,.3);    /* inset toward arena */
border-radius: 0;
```

**Variant B — Standard card (list containers, kp-cards, stat groups):**
```css
background: var(--surface);
border: 1px solid var(--line);
border-radius: 2px;
padding: 12px 14px;
/* hover (if interactive): border-color: var(--line-active); */
```

**Variant C — Featured (the one card that matters: overall score, verdict):**
```css
background: linear-gradient(180deg, rgba(247,180,8,.05), rgba(247,180,8,.015));
border: 1px solid rgba(247,180,8,.35);
border-radius: 2px;
box-shadow: 0 0 18px rgba(247,180,8,.06);       /* faint outer aura — featured only */
```
Max ONE featured panel per screen.

**Variant D — Alert (counter-intel, threats):**
```css
background: var(--surface);
border: 1px solid var(--line);
border-left: 3px solid var(--state-critical);   /* the red spine */
/* header text color: var(--state-critical); body stays --text/--text-muted */
```

**Variant E — Floating overlay (modals, pickers — the only floaters):**
```css
background: rgba(10,10,8,.95);
border: 1px solid var(--line-strong);           /* gold border if summoned by a gold action */
border-radius: 8px;                              /* max radius in the system */
backdrop-filter: blur(4px);                      /* the ONLY sanctioned blur use */
box-shadow: 0 12px 40px rgba(0,0,0,.6);
```

**States:** hover → border to `--line-active`, text one step brighter; active/selected → the gold trio (§II.1.2); disabled → `opacity: .3`, borders to `#333`, cursor default. Panels never scale on hover.

---

## II.7 MOTION LANGUAGE

**The law: nothing appears instantly; everything has inertia and weight. Fast things are events; slow things are states.**

### Easing tokens
```css
--ease-set:   cubic-bezier(0.2, 0.8, 0.3, 1);    /* heavy object set down — entrances, slides */
--ease-work:  ease;                                /* default utility */
--ease-snap:  cubic-bezier(0.4, 0, 0.2, 1);       /* controls, toggles */
--ease-strike: cubic-bezier(0.1, 0.9, 0.2, 1);    /* impact events: fast in, damped out */
```
FORBIDDEN: bounce/elastic/overshoot easings, `ease-in` endings (nothing accelerates INTO its rest position).

### Duration bands
| Band | Duration | Use |
|---|---|---|
| Reflex | 100–150ms | hover color/border, press feedback |
| Action | 200–300ms | selection changes, toggle throws, bar updates, pose transitions (Guard preset morph: 280ms) |
| Event | 100–200ms in, 300–500ms out | strikes, impacts, alerts landing |
| Entrance | 600–1000ms | elements arriving (fadeUp), scrims lifting |
| Ceremony | 800ms fade + staged sequence | room entry/exit, loading rituals |

### Canon patterns
```css
/* The universal entrance — everything arrives with this */
@keyframes fadeUp { from { opacity: 0; transform: translateY(12px); }
                    to   { opacity: 1; transform: translateY(0); } }
/* usage: animation: fadeUp 1s var(--ease-set) forwards; stagger siblings 100–150ms */
```
- **Stagger:** sibling elements enter 100–150ms apart, in reading/importance order (hub: shield .3s → title .6s → subtitle .9s; questions cards: .1/.25/.4/.55/.7s).
- **Breathing (live data only):** scale oscillation ±1.5%, `sin(frame * 0.018)` (~5.5s period) for large elements (the shield); glow pulse `sin(frame * 0.04)` (~2.6s) for threat markers. Breathing marks "this is live" — static data never breathes.
- **Count-ups:** stat numerals count from 0 (or previous value) over 400–800ms; bars fill with `transition: width .3s`.
- **Impacts:** ring expands from the point (r: 0.8→2.5% of arena) while alpha fades `(1-t)*0.7`, 300–500ms; landed hits red + `shadowBlur 10`, absorbed hits gold.
- **Page/room transitions:** exit = 300ms fade to arena black; enter = ceremony (see §II.11).
- Respect `prefers-reduced-motion`: kill particles, breathing, and staggers; keep instant-state changes and opacity fades ≤200ms.

---

## II.8 INTERACTION PHILOSOPHY

**Every hover responds; every click confirms; weight is communicated by travel and firmness, not by bounce.**

### Buttons
```css
/* PRIMARY — the brass bell-push. ONE per view maximum. */
.btn-primary { background: var(--gold); color: #000; border: 1px solid var(--gold);
  font-family: 'Bebas Neue'; letter-spacing: 2px; padding: 8px 20px; border-radius: 3px;
  transition: all .15s var(--ease-snap); }
.btn-primary:hover  { background: var(--gold-high); box-shadow: 0 2px 12px rgba(247,180,8,.3); }
.btn-primary:active { transform: scale(.96); box-shadow: none; }   /* press-depth = confirmation */

/* SECONDARY — outlined gold: important but not the main action */
.btn-secondary { background: rgba(247,180,8,.08); border: 1px solid var(--gold);
  color: var(--gold); /* same type treatment */ }
.btn-secondary:hover { background: rgba(247,180,8,.15); }

/* GHOST — graphite utility */
.btn-ghost { background: transparent; border: 1px solid var(--line); color: var(--text-dim); }
.btn-ghost:hover { border-color: var(--line-active); color: var(--text-muted); }

/* DANGER — destructive: dark until armed */
.btn-danger { background: transparent; border: 1px solid rgba(220,40,40,.4); color: var(--state-critical); }
.btn-danger:hover { background: rgba(220,40,40,.08); border-color: var(--state-critical); }

/* DISABLED (all) */
button:disabled { opacity: .3; border-color: #333; color: #333; cursor: default; transform: none; }
```

- **Selection mechanics:** lists/presets select via the gold trio + left-edge 2px bar (the bar is the physical "switch thrown"). Only one selection glows per list.
- **Draggables** (Guard gloves/elbows): hover = `shadowColor #f7b408, shadowBlur 20` + rim brightens to full gold; grab halo ≥ 2.5× visual radius; while dragging, dependent data (coverage bars, toolkit) updates live — the drag must feel like moving a real limb with consequences.
- **Dials:** render per Brass spec; value changes rotate the indicator dot with `--ease-snap` 150ms; each detent may tick the value display.
- **Destructive actions:** two-step, in place — first press arms the button (label changes to "CONFIRM —", border solidifies red, 3s timeout), second press executes. No browser confirm() dialogs, no modal guilt-trips.
- **Weight cues:** heavier consequences = longer press feedback and deeper active-scale (primary: .96; nav links: .98 barely). Nothing moves on hover except color/glow/border — position changes are reserved for press.

---

## II.9 NAVIGATION — THE ACADEMY HALLWAY

One nav, every room, always at the bottom. It is the hallway of the academy; the rooms hang off it.

```css
#gym-nav { display: flex; background: rgba(8,8,6,.98);
  border-top: 1px solid var(--line); flex-shrink: 0; }
.nav-item { flex: 1; text-align: center; padding: 8px 4px 6px;
  color: #333; border-top: 2px solid transparent; transition: all .2s; }
.nav-item:hover  { color: #666; background: rgba(255,255,255,.01); }
.nav-item.active { color: var(--gold); border-top-color: var(--gold);
  background: rgba(247,180,8,.03); }
/* structure: .nav-icon (glyph, 14px) / .nav-label (Bebas 10px, tracking 1.5px)
   / .nav-sub (7px uppercase, tracking 1px; active color #5a4a20) */
```

Canonical order (append new rooms; do not reorder): THE GRID · DRILL PLAYER · THE GUARD · VIRTUAL TUTOR · COACH VISION · HOMEWORK.

- **Current location** is stated twice: the gold top-border in the nav AND the room's own header block (sidebar brand or HUD title). Both, always.
- **Breadcrumbs** live inside the room header as the `crumb` line: `type-label`, `--ember` color, format `BLOCK 1 • FOUNDATION` — context above the title, never a separate bar.
- **Room transitions:** leaving = 300ms fade of the arena (nav persists, unfading — the hallway doesn't move); entering = the new room's entrance ceremony (§II.11). The nav's gold border slides to the new item over 200ms if animated SPA-style; hard navigation is also acceptable (rooms are self-contained HTML by architecture).
- Every room links back to the Hub via its brand block (top-left) — the door is always where you entered.

---

## II.10 DATA VISUALIZATION

Data feels physical: poured, painted, and lit — never clip-art charts.

- **Bars:** track `var(--surface-2)` (or `#1a1810`), radius 2–4px (≤ half height), fill `--viz` series color, `transition: width .3s`. Value label sits at the row end in DM Sans 600 tabular. Semantic fills use the state ramp (coverage: safe dim → critical red).
- **Big gauges/scores:** Bebas numeral (`type-stat`) + thin bar beneath; the numeral counts up; color = state ramp. No donut charts — the academy reads dials and stencils, not pastry.
- **Column charts:** flex-end bars, gap 4px, fill `--viz-3` at rest → `--gold` on hover, tooltip per §II.12. Bars grow from the floor on load (300ms, stagger 30ms).
- **Zone/spatial data:** ALWAYS on the body/floor where it lives (targets on the figure, prints on timber). The number renders *inside* its zone (Bebas, centered), label *below* in `type-label`.
- **Progress rings** (rare): 1.5px stroke circle, gold arc, dim `--line` remainder; center numeral Bebas.
- **Live vs. dead:** live-updating data breathes/pulses (§II.7); historical data holds still. This distinction is mandatory — it's how the user knows the eyes are open.
- **Series priority:** first series gold, comparison bone, adversary cyan, baseline smoke (see `--viz-*`). Never more than 4 series on one chart; the coach would never show you six lines.
- **Glow:** only the active/hovered datum glows (`shadowBlur 8–14`, its own color). A chart that all glows, all lies.
- **Loading data:** skeleton state = the chart's axes/tracks at rest with a slow gold shimmer sweep (1.6s linear, `rgba(247,180,8,.05)` band); bars then pour in.

---

## II.11 LOADING & TRANSITIONS — ENTERING A SPACE

Loading is arrival, not waiting. The reference is drill-player.html's loading screen; distill it to this sequence:

**Room entrance ceremony (full, for heavy rooms):**
1. Concrete frame + warm black (`--arena`) with vignette, instantly.
2. Brand block fades up (Anton/Bebas identity, est. line, badge) — 0–400ms.
3. Statement headline (“DISCIPLINE **BUILDS FREEDOM**” — gold on the key phrase) — 400ms.
4. Progress: `type-label` caption ("LOADING GYM EYES") + 3px track, gold gradient fill (`#f7b408 → #ffc832`), Bebas percentage. Progress ticks organically (increments 0.8–2.8, intervals 40–100ms randomized) — machines load in pulses, not ramps.
5. Checklist of real work items lighting up: dim (op .3) → active (1) → done (.7, icon fills gold). Copy in coach voice: "PREPARING COACH MODEL", "CALIBRATING VISION".
6. Footer: the 10 block numbers lighting in sequence; motto line; optional signature (the one Dancing Script instance).
7. Complete: loader fades 500ms after 100%, room contents run their stagger entrance.

**Light entrance (in-room content changes):** scrim to 60% arena black 150ms → new content fadeUp stagger → done. Total under 700ms.

**Progress indicators anywhere:** always the 3px track + gold fill + Bebas % — never spinners. If duration is unknowable, use the shimmer sweep on the track (indeterminate), plus a coach-voice caption of what's happening.

**Skeletons:** panel shells at final geometry, `--surface` fill, shimmer sweep; text placeholders are 8px bars at `--surface-2`. Skeletons never pulse opacity globally (no heartbeat-the-whole-page).

---

## II.12 COMPONENT LIBRARY

All components inherit: warm surfaces, hairline borders, radius ≤3px (8px floaters only), gold trio for active, 150ms hover/300ms state transitions, DM Sans body / Bebas display.

**Inputs (text/search):**
```css
background: var(--surface-2); border: 1px solid var(--line); border-radius: 3px;
color: var(--text); padding: 8px 12px; font: 13px 'DM Sans';
::placeholder { color: var(--text-faint); }
:focus { outline: none; border-color: rgba(247,180,8,.5);
         box-shadow: 0 0 0 1px rgba(247,180,8,.15); }
```

**Select/dropdown:** same field skin; custom chevron (SVG, `--text-dim`); menu = Variant E overlay, radius 3px here, options with the gold-trio active treatment; no native OS menus in arena rooms.

**Toggle switch:** track 32×16px, `--surface-2`, border `--line`, radius 8px (it's a machined slot); thumb 12px brass circle (Brass 2D gradient); ON: track wash `rgba(247,180,8,.15)`, border gold at 50%, thumb slides 16px with `--ease-snap` 150ms. A toggle is a breaker switch: it clacks (visually) — no soft crossfade of the thumb.

**Slider:** 3px track `--surface-2`; filled portion gold gradient; thumb = 14px brass dial-dot with `box-shadow 0 1px 4px rgba(0,0,0,.5)`; value readout (Bebas or DM 600) floats above thumb on drag.

**Badges/tags:** rectangular, radius 2px, `type-micro`/`type-label` uppercase; skins: neutral `background rgba(255,255,255,.02); color var(--text-dim)`, gold-context `background rgba(247,180,8,.06); color #5a4a20` (brightening on parent hover), alert `border 1px solid rgba(220,40,40,.4); color var(--state-critical)`. NEVER pill-radius, never pastel-filled.

**Tooltips:** Variant E mini (radius 3px, padding 4–8px, `--surface-2`, border `--line`), `type-body-s`; appear 150ms fade, 4px rise; positioned above by default. Data tooltips show value (Bebas) + label (micro).

**Toasts:** bottom-right, Variant B skin with a 3px left spine (gold = info/success, red = danger); enter fadeUp, hold 4s, exit fade; max 2 stacked; coach-voice copy ("Session saved." / "Camera lost. Check the mount.").

**Tables:** no vertical rules; rows separated `border-bottom 1px solid rgba(255,255,255,.03)`; header row `type-label` `--text-dim` uppercase; numeric columns right-aligned tabular; rank column Bebas 18px gold; row hover `background rgba(255,255,255,.01)`.

**Tabs:** text `--text-dim`, active = gold trio with a 2px bottom border variant; container has a single `--line` bottom rule. Never boxed/pill tabs.

**Progress bars:** per §II.11 (3px, gold gradient).

**Stat cards:** structure = label (`type-label`, `--text-dim`, uppercase) above value (`type-stat`, Bebas, state/gold color) above trend line (`type-micro`: `▲ 12% vs last session`, gold when improving, `--text-dim` when flat, red only when the decline is a threat). Panel Variant B; the ONE headline stat may use Variant C.

**Timeline entries:** left column = Bebas time/beat numeral (`--ember`, active gold); 1px vertical rule `--line` with 6px brass node dots (active node glows); right column = `type-body-s` event text. Events, not memos.

**Beat scrubbers (transport):** circular beat nodes 32px, Bebas numeral, hairline connectors; active node = gold border + wash + `box-shadow 0 0 14px rgba(247,180,8,.25)`; play button = 38px brass dial with dark glyph.

---

## II.13 ICONOGRAPHY

- **Style:** geometric line-work, consistent with the tactical layer — icons look drawn with the same pen as the radar rings.
- **Stroke:** 1.5px at 16px grid (scale proportionally); round caps/joins; corner radius ≤1px (sharp, machined).
- **Grid sizes:** 12 / 16 / 24 / 32px. Nav glyphs currently use the geometric unicode set (◎ ▶ ◆ ◇ ▣ ◈) — acceptable as v1 stencils; replacements must be custom SVGs of equal geometry (filled/outlined simple solids), migrated as a complete set, never mixed.
- **Color:** inherit text color of context; icons never hold their own color except state icons (red alert glyph).
- **Animation on interaction:** state-change icons transition 150ms (play→pause crossfade 100ms); icons never spin (loading is the bar, not a spinner); an alert icon may pulse with the standard threat pulse.
- **FORBIDDEN:** emoji anywhere in chrome, duotone/gradient icon packs, rounded-friendly icon sets (Feather is too soft; think engraved instrument markings).

---

## II.14 ERROR & EMPTY STATES

The coach pausing — never the system crashing.

**Errors:**
- Skin: Variant D panel (red spine) inside the flow where the failure happened — no full-screen takeovers unless the room truly cannot render.
- Copy pattern: *what happened* (plain) → *what to do* (imperative), in coach voice, ≤2 sentences: "Camera feed dropped. Check the mount and hit RECONNECT." Title in Bebas (“LOST THE FEED”), body DM Sans.
- Never: stack traces to users, "Oops!", apology theater, emoji, blame ("You entered an invalid…" → "That date doesn't parse. Try YYYY-MM-DD.").
- The room's ambience persists behind the error — grain, vignette, and nav all stay warm and alive. Red is on the spine and title only.
- Recoverable errors auto-retry silently ×1 before speaking.

**Empty states:**
- An empty room is a gym before training — inviting, not broken. Keep the full atmosphere; center a `type-label`/`type-body` invitation + ONE primary action: "No sessions yet. Record your first and Coach Vision starts building your ledger." + [RECORD SESSION].
- If content arrives via background work: state that with quiet confidence — "Harvest is running. Lessons appear here as they land."
- Optional whisper: the room's signature ambient element renders at rest (empty Grid still shows timber + rings). Never a cartoon illustration, never a giant sad-state graphic.

**Degraded states** (partial data, stale feeds): mark with an `--ember` badge ("LAST SYNC 3D AGO") — informational patina, not alarm, unless staleness is itself a threat (then the standard alert ramp applies).

---

## II.15 THE FIVE HERO ROOMS — COMPOSITION SPECIFICATIONS

### THE HUB — the establishing shot
- **Layout:** full-bleed arena + bottom nav only. No sidebars — the one room with nothing to operate.
- **Hierarchy:** (1) centered brass figure under light → (2) GYM EYES wordmark stack (shield SVG 56×68 → Anton title, gold, tracking 6px → subtitle at 45% gold) entering top-center → (3) four capability callouts at the corners, wired to center by dashed gold hairlines (`stroke rgba(247,180,8,.1), dasharray 4 3`) → (4) motto + loader at bottom.
- **Hero element:** the brass skeleton in guard, radar rings beneath, full environment stack (ropes, bags, speed-bag, wall mottos, cone, dust, vignette).
- **Ambient:** the complete §II.5 stack at reference intensity — the Hub is the atmosphere benchmark; all rooms are subsets of it.
- **Personality:** the academy presenting itself — slow, ceremonial, zero interactivity pressure. Loader runs the arrival ritual; callouts light in sequence with the progress.

### THE GUARD — the anatomy lab
- **Layout:** room template 180 / 1fr / 240. Left = presets + defensive toolkit (capability list with state dots). Right = zone coverage bars → featured Overall card → The Questions (numbered diagnostics) → red-spined counter-intel → stress test bench.
- **Hierarchy:** (1) the breathing gold shield polygon between the gloves → (2) target zones lighting by exposure (inverted ramp: covered zones nearly invisible; critical zones pulse red) → (3) the frontal brass/graphite figure → (4) right-rail verdicts.
- **Hero element:** the shield — `rgba(247,180,8,.10)` radial fill, 1.5px gold edge at 25–35% alpha, 15px outer glow at 10%, breathing ±1.5% at ~5.5s.
- **Ambient:** spotlight + vignette + grain; no floor apparatus (frontal room — the body IS the environment). Header scrim carries layer label (gold micro) → guard title (Bebas 36) → description (DM 11px).
- **Personality:** clinical, sober, second-person. Interaction = dragging gloves/elbows with live consequence. The scariest room in the academy — and the calmest.

### THE GRID — the chessboard
- **Layout:** room template + 64px beat scrubber strip above the nav. Left = the 10 Blocks index + brass speed dial + view-mode buttons. Right = pattern library (grouped, direction sub-tabs) + key-points card.
- **Hierarchy:** (1) active boot prints, gold with tread detail and glow → (2) beat markers + motion ribbons (gold gradient arcs showing travel) → (3) concentric floor rings + quadrant cross (2–5% gold) → (4) HUD title stack top-left.
- **Hero element:** the footprints on timber — everything else is notation around them.
- **Ambient:** timber grain (1px verticals at 1.2% white), spotlight pool, vignette; opponent (VS mode) enters as cyan rings + dim prints at top — the only cold object in the academy.
- **Personality:** rhythmic and precise — the metronome room. Beats advance with mechanical regularity; phase labels (“STEP OUT”, “CLOSE”) in stencil.

### DRILL PLAYER — the demonstration hall
- **Layout:** full-bleed 3D arena; top HUD scrim (title, drill info, live shorthand string — past beats dim `#555`, active gold + text-glow, upcoming `#888`); bottom transport scrim (play primary, utility ghosts, timeline, speed); collapsible drill library panel right (Variant E).
- **Hierarchy:** (1) BR-05 under the spot, brass materials per §II.4 → (2) the active combo shorthand in the HUD → (3) the 3D gym: timber floor, warm windows leaking `0xddaa55`, tube practicals, hanging leather bags, fog at 7–16 units → (4) transport.
- **Hero element:** BR-05 itself — the platonic athlete; skins may restyle it (canon/glow/minimal) but default is the brass canon.
- **Ambient:** the full physical gym; entrance = the complete loading ceremony (§II.11) — this room owns the reference implementation.
- **Personality:** aspirational, theatrical-but-disciplined. Camera orbit allowed; demonstration loops patiently; heroic three-quarter default angle, slightly low.

### VIRTUAL TUTOR — the honest mirror
- **Layout:** full-bleed 3D comparison arena; top HUD (title, overall score counting up, letter grade); left legend chip (student/ghost/deviation ramp); right deviation panel (per-joint bars, worst first); bottom transport; coaching box lower-left (appears only when there's something to say).
- **Hierarchy:** (1) student skeleton, bone-white/graphite → (2) coach ghost, gold at 40% opacity occupying the same space → (3) deviation lines between corresponding joints, colored by the warmth ramp (aligned = invisible → off = gold → way off = red) → (4) score + grade.
- **Hero element:** the superposition — two figures in one body, the difference made visible.
- **Ambient:** neutral dark floor, warm key + gold rim light (NO red rim, NO blue fill — see Drift Ledger), fog, grain. The most restrained room: judgment demands quiet.
- **Personality:** precise, fair, encouraging by exactness. Deviations always paired with coaching lines ("Right elbow flares on the cross — pin it to the rib."). Grades render in the warmth ramp, never rainbow.

---
---

# APPENDIX — THE DRIFT LEDGER (current violations; fix, never copy)

Filesystem audit, 2026-07-03. These files predate this standard. When touching them, correct them to spec. **Never use them as style references for new rooms** — reference implementations are `hub.html`, `the-guard.html`, `the-grid.html`, `the-questions.html`, and the drill-player *loading screen*.

| File | Violations |
|---|---|
| `virtual-tutor.html` | Maroon `#8b1a1a` as primary accent (hallucinated-burgundy family — purge); green button `#2a6b2a`; cold bg `#0a0a0f`; cold ambient/fill lights `0x404060`/`0x8888cc`; red rim light `0x8b1a1a`; `Share Tech Mono`; rainbow grade legend. Rebuild chrome per §II.15 Virtual Tutor. |
| `analytics-dashboard.html` | `--maroon #7B3040`, `--copper #B87333`, fake gold `#C4943A`; SaaS blue/purple/green grade pills; 10px-radius cards. Re-token to §II.1; grades to warmth ramp; panels to §II.6. |
| `film-room.html` | Copper identity `#c8814b`; cold obsidian `#0c0d10`; `#d63a3a`; emoji 🥊 in header; pill chips; system font only; generic card grid. Re-skin as the theater (§7 camera language). |
| `homework.html` | **Full light theme** — Inter, white cards, 16px radii, maroon `#8b1a1a`, wellness-app look. Total rebuild: the student's satchel must still be the academy (warm dark, Bebas signage, gold actions). Mobile-first is right; the skin is wrong. |
| `drill-player.html` | Body/scene bg cold (`#0a0a0f`/`0x0c0c0e` → `#0d0b08`/`0x0d0b08`); cold ambient `0x404060` and blue fill `0x8888cc` (→ warm per §II.4 Tungsten); green/indigo type-tags in drill list (→ badge spec §II.12); grays `#222/#333` chrome (→ warm ramp). Loading screen is canon — keep. |
| `hub.html` | Closest to canon. Minor: body font stack lacks DM Sans; nav hover uses gold (fine — it's the Hub). |
| `the-guard.html`, `the-grid.html`, `the-questions.html` | Canon. Note: they *declare* `'DM Sans'` without loading it — add the font link per §II.2. |

**Standing purge list (from brand registry + audit):** burgundy `#8B2020`, maroon `#8b1a1a`/`#7B3040`, olive `#6B7C47`, copper-as-identity `#B87333`/`#c8814b`, fake gold `#C4943A`, cool light rigs, light themes. These re-enter through AI generation drift. Every build session: grep for them, delete them.

---

*The fiftieth room, built five years from now, should feel like it was always here: warm dark, one tungsten light, brass under the fingers, gold only where the coach is pointing, dust in the air, and one lesson on the wall.*

**DISCIPLINE BUILDS FREEDOM · RESPECT THE PROCESS · EST. 2012 HONG KONG**
