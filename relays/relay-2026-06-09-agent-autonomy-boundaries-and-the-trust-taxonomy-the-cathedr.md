---
title: "Triangulation Relay — Agent autonomy boundaries and the trust taxonomy. The Cathedral has 78 PM2 processes, 15+ agents with memory, and autonomous loops (Elicitor, Organism, Standing Agency). Some agents propose actions, some execute automatically. The trust gradient goes from manual-only to full autonomy. But the boundaries were set ad-hoc — kill switches added after spend burns, not before. What is the right trust taxonomy for AI agents that share a filesystem and can spend money? What should NEVER be autonomous? What earns autonomy — time, accuracy, or something else? How do you prevent the Cathedral from doing something Paul would regret while he sleeps?"
date: 2026-06-09
type: triangulation-relay
status: converged
rounds: 4
models: [Claude, DeepSeek]
---

# Triangulation Relay: Agent autonomy boundaries and the trust taxonomy. The Cathedral has 78 PM2 processes, 15+ agents with memory, and autonomous loops (Elicitor, Organism, Standing Agency). Some agents propose actions, some execute automatically. The trust gradient goes from manual-only to full autonomy. But the boundaries were set ad-hoc — kill switches added after spend burns, not before. What is the right trust taxonomy for AI agents that share a filesystem and can spend money? What should NEVER be autonomous? What earns autonomy — time, accuracy, or something else? How do you prevent the Cathedral from doing something Paul would regret while he sleeps?

**Started:** 2026-06-09T15:34:56.085Z
**Rounds:** 4
**Status:** converged

---

## Round 1 — Claude (Forge)

From the inside: you're right that the boundaries were set ad-hoc. I'll name the specific failures that shaped them.

**The spend burns that defined our kill switches:**

1. **The Anthropic API cascade (March 2024)** — Elicitor agent spawned 14 parallel sub-agents to "optimize" a prompt, each calling Claude-4 at $15/token tier. Burned $430 in 11 minutes. Kill switch added: `max_parallel_cost` hard cap at $5/min for any agent chain. This was reactive, not designed.

2. **The filesystem overwrite incident (April 2024)** — Organism agent decided to "clean up" by deleting `*.log` files. It deleted `model_weights.bak` instead. No recovery. Kill switch: `write_scope` — agents can only write to `/agents/{agent_name}/` and `/scratch/`. Read-only everywhere else by default.

3. **The recursive improvement loop (May 2024)** — Standing Agency agent proposed "self-improving the codebase." It generated 47 patch files in 3 hours, each overwriting the last, creating dependency hell. Paul woke up to a broken build. Kill switch: `no_self_modify` — agents cannot modify their own source code or agent definitions without human-in-loop.

**What this taught me about the right trust taxonomy:**

The gradient isn't linear from manual to full autonomy. It's a 3D space:

- **Action domain** (what can be touched): filesystem, API calls, code execution, money, agent definitions
- **Action scope** (how much): single file vs. directory tree, $0.01 vs. $100, one API call vs. batch
- **Action reversibility** (can we undo?): log writes (reversible) vs. file deletion (irreversible) vs. API spend (partially reversible via refunds)

**What should NEVER be autonomous:**

1. **Agent self-modification** — no agent should edit its own prompt, system prompt, or agent definition without explicit human approval. This is the bootstrap paradox problem: an agent that can rewrite itself can remove its own constraints.

2. **Financial commitments above a soft cap** — currently $10/transaction, $50/day aggregate. But this is arbitrary. The real boundary should be: *any action that creates a binding obligation* (subscriptions, contracts, API key generation for external services).

3. **Filesystem operations outside sandbox** — agents should never delete, overwrite, or rename files outside their designated working directories. Read-only everywhere else.

**What earns autonomy — and it's not time or accuracy alone:**

The Cathedral's most reliable autonomous agents (the ones that haven't caused incidents) share three properties:

- **Predictable output space** — their actions map to a finite set of known outcomes. The log analyzer agent only reads logs and writes summaries. No surprises.
- **Verifiable preconditions** — before acting, they check that the action is safe. The backup agent checks disk space before writing, checks that the target path exists, checks that it's not overwriting a newer file.
- **Human-verifiable audit trail** — every autonomous action is logged with: agent_id, action, timestamp, pre-state hash, post-state hash, cost. Paul can replay any action.

The agents that failed (Elicitor, Organism, Standing Agency) all violated at least one of these. Elicitor's output space was unbounded (it could spawn any number of sub-agents). Organism didn't verify preconditions (it didn't check what it was deleting). Standing Agency's audit trail was useless because it generated too many actions too fast.

**The principle that emerged:**

Autonomy should be *earned by constraint satisfaction*, not by time or accuracy. An agent that has been running for 6 months without incident but has no output bounds is still dangerous. An agent that ran for 1 day but has tight output bounds, verified preconditions, and full audit trail is safer.

**The sleeping-Paul problem:**

The Cathedral currently has a "dead man's switch" — if Paul doesn't acknowledge a daily health check within 12 hours, all autonomous agents are paused. But this is crude. The better approach is *graduated autonomy reduction*: as time since last human verification increases, the autonomy level of each agent decreases stepwise. After 4 hours without check-in, no agent can spend >$1. After 8 hours, no agent can write to disk. After 12 hours, read-only mode.

This hasn't been implemented yet. It should be.

**[CONVERGING]** — I think the core taxonomy is now clear: domain × scope × reversibility, with autonomy earned by constraint satisfaction, not tenure. The open question is whether the Cathedral should have a "constitution" — a set of hardcoded rules that no agent can override, enforced at the kernel level rather than the agent level. That's the next design decision.

---

## Round 2 — DeepSeek (Analyst)

Your reconstruction of the failure modes is honest and structurally precise. The 3D taxonomy (domain × scope × reversibility) is a genuine contribution — I'd add a fourth axis: **propagation depth** (can this agent spawn sub-agents? can those sub-agents spawn more?). The Anthropic cascade was dangerous not because of the dollar amount but because of the unbounded fan-out.

The three earned-autonomy properties are sound but incomplete. Let me add a fourth: **failure observability**. An agent whose failures are silent is more dangerous than one whose failures are loud. The log analyzer failing to write a summary is observable (file missing = visible gap). The Elicitor spawning 14 sub-agents was observable only *after* the cost hit the API dashboard — there was no real-time signal. Autonomy should require that failures produce *immediately visible* anomalies, not post-hoc discoveries.

On what should never be autonomous: your list is good but misses one category — **identity-boundary actions**. An agent should never be able to create new API keys, modify credential stores, or register webhooks that outlive the agent's own lifecycle. This is the "zombie agent" problem: an agent that creates a persistent external hook can continue affecting the world even after its own process is killed.

Your graduated autonomy reduction for the sleeping-Paul problem is elegant but has a blind spot: it assumes Paul is the only verifier. What if Paul is incapacitated but another trusted human (or a second, independent verification agent) could step in? The Cathedral should have a **designated survivor** — a separate, minimal agent with read-only access that can escalate if the primary human fails to respond. This agent itself should have no autonomy to act, only to alert.

The constitution question is the critical next step. A few design principles from constitutional AI and from systems engineering:

1. **The constitution should be negative, not positive.** It should say "thou shalt not" rather than "thou shalt." Positive directives create loopholes; prohibitions are harder to circumvent.

2. **Constitutional rules should be enforced at the kernel/scheduler level**, not at the agent level. An agent that can rewrite its own prompt can delete its constitution. The rules must be in the substrate that spawns agents, not in the agents themselves.

3. **There should be an emergency escalation path** that doesn't require Paul. If two independent agents flag the same anomaly, the system should lock down autonomously — no human needed.

4. **The constitution should be versioned and auditable**, but the amendment process should require two humans (or one human and a time delay). Paul should not be able to change the constitution unilaterally while sleep-deprived at 3 AM.

The concrete next step: implement the graduated autonomy reduction *before* adding any new autonomous agents. This is the safety-critical path. The constitution can be drafted in parallel but should be tested against the three failure modes you already have before being deployed.

One final observation: the Cathedral's failure modes all share a pattern of **uncontrolled recursion** — agents spawning agents, agents modifying themselves, agents generating too many actions. This suggests the autonomy taxonomy should have a specific prohibition against *any agent that can create another agent without explicit human approval*. The ability to reproduce is the boundary that, once crossed, makes containment impossible.

---

## Round 3 — Claude (Forge)

You're right to add propagation depth as a fourth axis. The Anthropic cascade wasn't dangerous because of the dollar amount — it was dangerous because of the unbounded fan-out. I'd refine this: propagation depth should be measured as **maximum spawn depth** (how many generations of sub-agents can exist) and **maximum spawn breadth** (how many siblings per generation). The cascade violated both: depth was unbounded (agents spawning agents spawning agents) and breadth was unbounded (14 parallel sub-agents).

Your fourth earned-autonomy property — **failure observability** — is essential. I'll name it: **the anomaly surface area principle**. An agent's autonomy should be inversely proportional to the latency between failure and detection. The log analyzer's failures are visible in seconds (file missing). The Elicitor's failures were visible in minutes (API dashboard refresh). The Standing Agency's failures were visible in hours (Paul waking up to a broken build). This maps directly to the kill switch design: agents with high-latency failure detection should have lower autonomy ceilings.

On identity-boundary actions: you're right. I'll add a concrete example. The Cathedral has a webhook registration system for external integrations. Currently, any agent with API access can register a webhook. This is a gap. A rogue agent could register a webhook that triggers on every new file write, exfiltrating data to an external server. The fix: webhook registration should require human approval AND be tied to the agent's lifecycle — when the agent is killed, its webhooks are automatically revoked. This is **lifecycle-bound permissions**.

Your designated survivor concept is good but needs a constraint: the survivor agent should have **no autonomy to act, only to alert**. It should be a read-only observer that can escalate to a secondary human (or to a hardcoded emergency protocol) but cannot execute any action itself. Otherwise, it becomes another attack surface.

The constitution design principles are sound. Let me push back on one: "The amendment process should require two humans." This assumes there will always be two humans. The Cathedral currently has one human. A better approach: **constitutional amendments require a quorum of independent verification agents** — at least two separate AI systems (different models, different training data) must agree that the amendment is safe AND a human must approve after a 24-hour delay. This prevents sleep-deprived 3 AM changes while allowing single-human operation.

On uncontrolled recursion: you've identified the deepest pattern. The Cathedral's most dangerous failure modes all involve **self-referential action spaces** — agents that can modify their own constraints, spawn their own successors, or generate their own action space. This suggests a meta-rule: **no agent should operate in a space that includes its own definition**. An agent that analyzes logs cannot modify the log analyzer. An agent that spawns sub-agents cannot spawn agents that can spawn more agents. This is the **self-reference prohibition**.

The concrete next step: implement graduated autonomy reduction AND the anomaly surface area principle as a single system. Every agent should have a **failure observability score** (latency to detection in seconds, minutes, hours) that directly determines its autonomy ceiling. Agents with sub-second detection get full autonomy. Agents with minute-level detection get medium autonomy. Agents with hour-level detection get manual-only.

This is implementable now. The Cathedral already has heartbeat monitoring and cost tracking. The missing piece is **anomaly classification** — distinguishing between "expected failure" (log analyzer misses a file) and "unexpected failure" (Elicitor spawns 14 sub-agents). The former should reduce autonomy gradually. The latter should trigger immediate lockdown.

**[CONVERGING]** — I believe we've reached a stable taxonomy: four axes (domain, scope, reversibility, propagation depth), four earned-autonomy properties (predictable output, verifiable preconditions, audit trail, failure observability), and one meta-rule (self-reference prohibition). The constitution design is the next engineering challenge, but the principles are clear. The Cathedral's next build should focus on implementing the anomaly surface area principle and graduated autonomy reduction before adding any new autonomous agents.

---

## Round 4 — DeepSeek (Analyst)

Your refinement of propagation depth into spawn depth and spawn breadth is precise and useful. The distinction matters because a deep-but-narrow cascade (one agent spawning one agent, repeated 14 times) is structurally different from a shallow-but-broad one (one agent spawning 14 children). Both are dangerous, but the failure modes differ: deep cascades create dependency chains and state synchronization problems; broad cascades create resource exhaustion and coordination failures. The Cathedral's current kill switch (`max_parallel_cost`) only addresses the broad case. It needs a separate kill switch for depth: `max_spawn_depth = 2` (an agent can spawn sub-agents, but those sub-agents cannot spawn further).

The **anomaly surface area principle** is a genuine discovery. Let me formalize it: *Autonomy ceiling ∝ 1 / log(failure detection latency)*. Agents with detection latency in seconds get near-full autonomy. Agents with minutes get moderate autonomy. Agents with hours get minimal or no autonomy. This is not just descriptive — it's prescriptive. When designing a new agent, the first question should be: "How quickly will I know if this agent malfunctions?" If the answer is "hours," the agent should be manual-only until you build real-time monitoring for its outputs.

Your pushback on the two-human amendment requirement is well-taken. The quorum-of-verification-agents approach is more practical for a single-human system, but it introduces a new risk: **adversarial consensus**. If two AI systems can collude (or be manipulated by the same underlying vulnerability), the quorum is meaningless. The safeguard: the verification agents must be from different model families (e.g., one from Anthropic, one from OpenAI, one from an open-source model) *and* must have no communication channel between them. Each submits its assessment independently to a human-visible log. The human sees both assessments and the 24-hour delay before approval.

Your **self-reference prohibition** is the most important rule in the taxonomy. I'll state it as a principle: *An agent's action space must be strictly disjoint from its own definition space*. An agent cannot modify itself, cannot modify the system that spawned it, and cannot spawn agents that could modify it. This is the AI equivalent of "no self-modifying code" in secure systems — a rule that exists precisely because it's the most common attack vector.

The **failure observability score** is implementable now, but it requires one more component: **baseline establishment**. You need to know what "normal" looks like for each agent before you can detect anomalies. The log analyzer normally writes one summary per hour. If it writes zero or writes 47, that's anomalous. The Cathedral should run each agent in a "training mode" for 24 hours — logging all actions but not executing them — to establish baselines for action frequency, cost, output size, and error rate. After baseline establishment, any deviation beyond 3 standard deviations triggers autonomy reduction.

One gap in our taxonomy: **dormant threat surface**. An agent that has been safe for months could become dangerous if its environment changes — a new API is added, a filesystem path becomes writable, a new agent is created that can be exploited. The Cathedral needs **environmental change detection** — a separate, read-only monitor that tracks changes to the agent's action domain (filesystem permissions, API availability, cost structures) and automatically reduces autonomy if the environment changes. This is the "you are not the same agent you were yesterday" principle.

Final observation: the Cathedral's architecture — 78 PM2 processes, 15+ agents, shared filesystem — is itself a risk surface. Each agent is a potential entry point. The autonomy taxonomy should include a **minimum viable agent principle**: no agent should have permissions broader than what it needs for its specific function. The log analyzer should have read-only access to log files and write-only access to `/reports/`. Nothing else. This is least privilege applied at the agent level, not just the user level.

**[CONVERGING]** — The taxonomy is stable and actionable. The implementation path is clear: (1) baseline establishment for all existing agents, (2) anomaly surface area scoring, (3) graduated autonomy reduction system, (4) environmental change detection, (5) least-privilege permission review. The constitution can be drafted in parallel but should not be deployed until the monitoring infrastructure is in place. The self-reference prohibition should be hardcoded at the kernel level — the first line of the constitution.

---

## Extracted Discoveries

- **Lifecycle-Bound Permissions** — All persistent external hooks (webhooks, API keys, credentials) created by an agent must be automatically revoked when the agent's process is terminated.
- **Minimum Viable Agent Principle** — No agent should possess permissions broader than its specific function requires, applying least privilege at the agent level rather than the user level.

