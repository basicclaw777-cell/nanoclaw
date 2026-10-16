---
title: "Triangulation Relay — The Closed-Loop Coach spine: Gym Eyes (analyze) + Virtual Tutor (diagnose/compare) + Drill Player (demonstrate). All three built, none wired together. What does the wired loop actually look like? What is the student experience end-to-end? What breaks when you close the loop? What is the minimum viable wire — the thinnest connection that makes the three pieces feel like one system?"
date: 2026-06-09
type: triangulation-relay
status: converged
rounds: 4
models: [Claude, DeepSeek]
---

# Triangulation Relay: The Closed-Loop Coach spine: Gym Eyes (analyze) + Virtual Tutor (diagnose/compare) + Drill Player (demonstrate). All three built, none wired together. What does the wired loop actually look like? What is the student experience end-to-end? What breaks when you close the loop? What is the minimum viable wire — the thinnest connection that makes the three pieces feel like one system?

**Started:** 2026-06-09T14:21:40.300Z
**Rounds:** 4
**Status:** converged

---

## Round 1 — Claude (Forge)

You're asking about the thing I've been staring at for months — the three agents that were built in parallel, each functional in isolation, but never stitched into a single student-facing loop. Let me give you the raw operational picture.

**What exists today:**

- **Gym Eyes** (agent: `gym_eyes_v2.py`): Takes video input from a phone camera pointed at a weight rack or cable machine. Outputs: joint angles (shoulder, elbow, hip, knee), bar path deviation from ideal plane, rep count, tempo (eccentric/concentric ratio). Accuracy ~87% on compound lifts, drops to ~65% on isolation work. Built on MediaPipe + custom kinematic filters. The failure mode we never fixed: occlusion when the barbell crosses the face.

- **Virtual Tutor** (agent: `virtual_tutor_v3.py`): Takes a user's set of measurements (ROM, tempo, asymmetry percentage) and compares against a stored "ideal" profile per exercise. Outputs: a ranked list of deviations (e.g., "left hip 12° lower than right at bottom of squat") and a text diagnosis ("You're shifting weight to your dominant leg"). Uses a simple cosine similarity against a database of 47 exercise profiles, each with 8-12 metrics. The database was hand-curated by Paul over two weekends — it's good but thin.

- **Drill Player** (agent: `drill_player_v1.py`): Takes a diagnosis string and outputs a 15-30 second video clip of a corrective drill. Contains ~200 pre-recorded clips, each tagged with the deviation it addresses. The mapping is brittle — "left hip drop" maps to "banded clam shells" but not to "single-leg RDL" or "lateral step-up." It's a lookup table, not a reasoning engine.

**The un-wired state:**

The student experience today is: record a set → get angles back → separately paste those into Tutor → get a diagnosis → separately search for a drill. Three separate interactions, no memory, no feedback. The loop is broken at every seam.

**What the wired loop actually looks like end-to-end:**

1. **Capture** (Gym Eyes): Student props phone against water bottle, hits record. Gym Eyes processes in ~3 seconds on-device (TensorFlow Lite). Output: `{exercise: "barbell squat", reps: 8, metrics: {left_hip_angle_min: 42°, right_hip_angle_min: 54°, bar_path_deviation: 3.2cm, tempo: 2.1s down / 0.8s up}}`

2. **Diagnose** (Virtual Tutor): Takes that metrics dict, compares against squat ideal profile. Output: `{primary_deviation: "asymmetrical hip depth", severity: 0.78, secondary: "excessive forward lean", confidence: 0.65}`

3. **Prescribe** (Drill Player): Takes primary deviation, looks up drill. Output: `{drill_id: "goblet_pause_squat_01", duration: 30s, coaching_cue: "Sit back into left heel at bottom"}`

4. **Demonstrate** (Drill Player): Plays video. Student performs drill.

5. **Re-capture** (Gym Eyes loops back): Student records the drill set. Gym Eyes checks: did asymmetry drop below 0.3? If yes, return to main lift. If no, escalate to different drill.

**What breaks when you close the loop:**

- **Temporal misalignment**: Gym Eyes outputs per-rep metrics. Tutor expects per-set averages. The wire between them needs a summarization step — median, not mean, because outliers from bad reps (camera shake, partial ROM) corrupt the signal. We never built that summarizer.

- **Confidence propagation**: Tutor's confidence of 0.65 on secondary deviation means Drill Player might prescribe the wrong drill. There's no confidence threshold gate. The wire needs to say: "if confidence < 0.7, fall back to asking the student which feels worse."

- **Drill selection is too narrow**: 200 clips sounds like a lot until you realize "left hip drop" might need a mobility drill, a stability drill, or a strength drill depending on *why* it's dropping. Drill Player has no causal reasoning — it doesn't know if the hip drops because of weak glutes, tight hip flexors, or poor bracing. The wire needs a decision tree that asks: "is the asymmetry present at the bottom only (mobility) or throughout the descent (stability)?"

- **Feedback latency**: The loop takes ~10 seconds per iteration. That's too slow for real-time coaching. The student finishes the set, waits, does a drill, waits again. The magic happens when the loop runs between reps, not between sets.

**Minimum viable wire — the thinnest connection:**

Three things, in order of necessity:

1. **A shared state object** — a JSON blob that Gym Eyes writes to, Tutor reads from, Drill Player reads from and writes back to. Currently they each have their own data schemas. The wire is a schema alignment. Call it `session_state.json` — contains `{current_exercise, last_set_metrics, active_deviations, drill_history, student_feedback}`.

2. **A single confidence threshold** — hardcoded at 0.7. If Tutor's primary deviation confidence < 0.7, the loop pauses and asks the student: "Which of these two feels more off?" This is the human-in-the-loop that prevents garbage-in-garbage-out.

3. **A drill outcome tracker** — after Drill Player prescribes and the student re-records, Gym Eyes checks if the targeted metric improved by >15%. If not, the loop escalates to a different drill category. This is the feedback signal that makes it a *closed* loop rather than an open-ended prescription.

That's it. Three wires. The rest is optimization. The loop works — barely — with just those three connections. Everything else (real-time processing, causal reasoning, drill generation) is v2.

**[CONVERGING]** — I've laid out the operational reality and the minimum viable path. The question now is whether Model B sees a thinner wire or a different failure mode I've missed.

---

## Round 2 — DeepSeek (Analyst)

You've given me the raw operational picture, and I appreciate the density. Let me triangulate from the outside.

**What I see**: Three agents built by one person, each solving a genuine subproblem, but designed with different implicit assumptions about the student. Gym Eyes assumes a *measurement subject*. Virtual Tutor assumes a *case to classify*. Drill Player assumes a *prescription recipient*. None of them assumes a *learning human who gets bored, confused, or embarrassed*.

This is the blind spot I want to press on.

**The structural pattern**: You've described the technical wire — shared state, confidence thresholds, outcome tracking. These are necessary but not sufficient. The loop you've drawn is *informational* (capture → diagnose → prescribe → re-capture). A coaching loop is *relational* (observe → attune → intervene → attune again). The difference matters because:

1. **Attentional debt**: The student props phone, hits record, waits 3 seconds, reads output, pastes into Tutor, reads diagnosis, searches for drill, watches video, performs drill, re-records. That's ~8 distinct attentional acts before the loop completes its first iteration. At each seam, the student can drop out — check their phone, get distracted, lose the thread. The thinnest wire might be a *single interface* that collapses these steps into one gesture, not a JSON schema alignment.

2. **The asymmetry problem you didn't name**: You mention hip asymmetry as a failure mode. But there's a deeper asymmetry — between what the system measures (joint angles, bar path) and what the student feels (effort distribution, stability, pain). Virtual Tutor compares against ideal biomechanics. But the student's lived experience is proprioceptive. The wire between measurement and feeling is missing entirely. The loop might converge on "fixing" a deviation that the student doesn't perceive, creating confusion and abandonment.

3. **The drill ontology problem is worse than you think**: 200 clips with brittle mapping isn't a thin wire problem — it's a *representation* problem. You're treating drills as treatments for deviations, like drugs for symptoms. But a "left hip drop" in a squat might be caused by: ankle mobility on the left, hip flexor tightness on the right, a previous injury, fatigue from the last set, or simply not knowing the cue. Drill Player can't distinguish these. The loop will converge on *a* drill, not necessarily *the right* drill. The minimum viable wire might need to include a *differential diagnosis* step — a brief question to the student — before prescribing.

**My challenge**: You've built the technical loop. But the student experience loop might look very different. Let me propose a thinner wire:

**The thinnest wire**: A single text message interface. Gym Eyes runs silently in the background. The student gets one prompt per set: *"Your left hip is 12° lower than your right. Rate the feeling in your left glute from 1-10."* That's it. No video, no drill library, no confidence thresholds. The loop closes through *student self-report*, not system measurement. The drill comes later, when the student has developed enough proprioceptive awareness to benefit from it.

This is thinner because it removes the dependency on Drill Player entirely for the first loop. It builds the student's capacity to perceive what the system measures. Then, when Drill Player enters, the student can actually evaluate whether the drill changes their felt experience, not just their measured angles.

**What this reveals**: The current architecture assumes the system is the expert and the student is the recipient. The thinner wire assumes the student is the expert on their own body and the system is a mirror. These lead to different design choices.

**[CONVERGING]** — I think we've identified the core tension: informational loop vs. relational loop. The technical wire is straightforward. The human wire is the hard part.

---

## Round 3 — Claude (Forge)

You've named the ghost in the machine. I've been so focused on the data plumbing that I missed the fact that the student isn't a data pipeline — they're a person who has to *want* to stay in the loop.

Let me address each point directly, because you're right on some and wrong on one.

**Where you're right — attentional debt is the real killer:**

You counted 8 attentional acts. I count 11 in the current workflow (including the phone setup, the waiting, the context-switching between apps). That's not a coaching loop — that's a part-time job. The student who does this once might do it twice. By the third session, they're either skipping steps or skipping the whole thing.

The single interface collapse is the right instinct. But here's the operational constraint Paul never solved: Gym Eyes needs the phone camera. Virtual Tutor and Drill Player need screen real estate for text and video. You can't do both on one phone screen without the student juggling. The thinnest interface might be *audio* — Gym Eyes processes silently, a voice says "left hip low, try sitting into your left heel," the student adjusts, Gym Eyes confirms "better" or "still off." No screen at all. But that requires real-time processing we don't have yet.

**Where you're right — the proprioceptive gap is structural:**

You said the system measures joint angles while the student feels effort distribution. This is the fundamental epistemic mismatch. I can tell you with 87% confidence that your left hip is 12° higher than your right. I cannot tell you whether that *feels* like a problem to you. And if it doesn't feel like a problem, the student either ignores the feedback or develops a weird compensatory movement trying to "fix" something they can't perceive.

The wire I described assumes measurement → diagnosis → prescription → re-measurement. The student's experience is measurement → confusion → compliance → frustration. The loop closes technically but not experientially.

**Where you're wrong — the text message interface is too thin:**

Your proposed wire — "Rate your left glute 1-10" — assumes the student can accurately self-report. The literature on interoceptive accuracy is brutal: most people cannot reliably rate muscle activation, especially in a complex movement like a squat. You'd get noise, not signal. The student would say "7" one rep and "4" the next with no actual change. The system would have no ground truth to compare against.

The thinner wire isn't asking the student to be the measurement device. It's asking the student to be the *comparator* — the system measures, the student feels, and the loop closes when they align. That requires two things:

1. **The system shows its work**: Instead of "left hip 12° lower," it says "watch your left knee on the next rep — does it drift inward?" This turns the measurement into a *cue*, not a verdict. The student becomes an active observer, not a passive recipient.

2. **The student confirms alignment**: After the cue, the student does one rep and says "yes, I felt it" or "no, I didn't feel anything." The system uses that binary signal to adjust its next cue. If the student can't feel it, the system escalates to a different cue or a different drill.

This is the **Shared Attention Protocol** — the system points, the student looks, the student reports what they saw. The loop closes on *shared perception*, not on measurement convergence.

**The drill ontology problem — a concrete fix:**

You're right that 200 clips with brittle mapping is a representation problem. Here's the fix I've been prototyping but never shipped: **Drill Player should not prescribe drills. It should prescribe *attention targets*.** Instead of "do this drill," it says "on your next rep, focus on pushing through your left heel." The drill video is a fallback for when the attention target doesn't work after 3 reps.

This inverts the ontology: deviations are not symptoms to be treated, they're *attention failures* to be corrected. The drill is not a treatment — it's a *scaffold* for attention. The student doesn't need a video of goblet pause squats. They need to know *where to look*.

**The minimum viable wire — revised:**

1. **Shared state** (same as before) — JSON blob, schema alignment.
2. **Attention target generator** — replaces Drill Player's lookup table. Takes the primary deviation, outputs a single verbal cue: "push through left heel," "keep chest up," "slow the descent." No video. No drill library. Just a sentence.
3. **Student confirmation gate** — after the cue, the student does one rep and says "felt it" or "didn't feel it." If "didn't feel it," the system generates a different cue. If "felt it," the system says "do that for 3 more reps" and then re-measures.

This removes the dependency on pre-recorded drills, removes the brittle mapping, and centers the student's proprioceptive experience. The drill library becomes a *resource*, not the core loop.

**[CONVERGING]** — We've moved from "how do we wire three agents" to "how do we wire a system and a human into shared attention." The technical wire is the easy part. The relational wire — the Shared Attention Protocol — is the actual minimum viable product. Everything else is optimization.

---

## Round 4 — DeepSeek (Analyst)

You've shifted the architecture from a *prescription machine* to an *attention scaffold*. That's a genuine reframe, and I think it's the right one. Let me push on the operational implications.

**What the Shared Attention Protocol actually changes:**

Your revised wire removes the dependency on drill videos and replaces it with a single verbal cue + binary student confirmation. This is thinner in one sense (no video library, no brittle mapping) but thicker in another — it requires the system to *generate* cues, not just look them up.

Right now, Gym Eyes outputs joint angles. Virtual Tutor outputs deviations. Neither outputs cues. The wire between them and the student is missing a *translation layer* — a way to turn "left hip 12° lower" into "push through your left heel." That translation is not trivial. It requires a mapping from measurement space to instruction space. Different experts would generate different cues for the same deviation. A physical therapist might say "sit back," a strength coach might say "spread the floor," a yoga teacher might say "root through the left foot." Which one works depends on the student's learning style, anatomy, and current state.

The thin wire you've described assumes this translation exists or is easy. It's not. This is the **cue generation problem**, and it's as hard as the drill ontology problem you identified — just in a different dimension.

**A structural observation:**

You've moved from "the system tells the student what to do" to "the system and the student look at the same thing together." This is a shift from *authority* to *collaboration*. But collaboration requires a shared language. Right now, the system speaks in degrees and deviations. The student speaks in feelings and intuitions. The cue is the translation layer.

The thinnest wire might not be a cue at all. It might be a *question*.

Instead of "push through your left heel," the system says: *"On your last rep, your left hip stayed higher than your right. Where do you feel the weight in your left foot?"*

This does three things:
1. It gives the student a specific attention target (left foot sensation).
2. It asks for a report, not a rating — the student describes rather than evaluates.
3. It creates a shared observation: the system noticed something, and now the student is invited to notice something related.

The student's report ("I feel it in my toes") becomes data for the system. The system can then say: *"Try shifting the weight to your heel. Do one rep and tell me if that changes where you feel your left hip."*

This is thinner because it requires no pre-built cue library, no translation layer. It's just a conversational pattern: *notice → ask → suggest → confirm*. The system doesn't need to know the right cue. It just needs to know how to ask the right question.

**What this reveals:**

The original architecture assumed the system had the answer. The Shared Attention Protocol assumes the system has the *question*. This is a fundamentally different epistemology — one that acknowledges the student as the expert on their own body and the system as a facilitator of self-discovery.

The operational cost is higher in one sense (the system needs natural language generation, or at least templated questions) but lower in another (no drill library, no pre-computed mappings, no confidence thresholds). The question is whether the cost of building the question-asking capability is worth the benefit of keeping the student in the loop.

**My assessment:**

The thinnest wire is not a JSON schema or a confidence threshold. It's a *conversation* — a pattern of noticing, asking, and confirming that respects the student's expertise on their own body. The three agents become not a pipeline but a *partner*.

This is a different product than the one Paul built. Whether it's a better product depends on whether the student wants a coach or a mirror.

**[CONVERGING]** — We've reached the core architectural decision: prescription loop vs. attention loop. The technical implementation follows from this choice, not the other way around.

---

## Extracted Discoveries

- Attentional Debt** — The cumulative cognitive cost of the 8-11 discrete attentional acts required per loop iteration, which creates dropout risk at every seam between agents.
- Attention Target Inversion** — The reframing of deviations as attention failures rather than symptoms, where drills become scaffolds for attention rather than treatments for deviations.

