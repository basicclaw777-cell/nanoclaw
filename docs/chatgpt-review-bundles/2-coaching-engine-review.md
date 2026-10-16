# REVIEW PROMPT: Coaching Engine Architecture Review

Review this coaching engine's architecture. It's an INVERTED learning system:
Paul coaches -> interventions logged -> patterns extracted -> rules proposed with evidence + confidence -> Paul approves -> rules version-controlled -> confidence determines autonomy (90%+ auto, 70-89% recommend, 50-69% ask, <50% silent).

This is NOT a decision tree. It's "Git for coaching philosophy."

Ignore code style, syntax, naming, formatting, performance micro-optimizations and JavaScript idioms unless they reveal an architectural flaw. Treat this as a system review, not a code review.

Stress test these specific areas:

1. CONFIDENCE MODEL
   - Under what assumptions is +0.03 / -0.05 mathematically valid, and under what conditions does it become unstable?
   - How many successes to climb from 0.60 (hypothesis) to 0.90 (auto)?
   - What happens with 500+ rules? Does matching degrade?
   - Can a rule oscillate between bands forever?

2. PATTERN EXTRACTION
   - The clustering is tag-based. Is that sufficient or does it miss cross-tag patterns?
   - What happens when two tags overlap heavily but produce different rules?
   - At what scale does the hermes3 synthesis prompt break down?

3. GAMING VECTORS
   - How could a bad actor (or a well-meaning but wrong system) game the confidence scores?
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
   - A beginner and an elite competitor — same intervention — should they carry equal weight?
   - How should evidence quality be weighted? Consider: student level, coach certainty, repeatability, novelty, context similarity.
   - Otherwise confidence becomes quantity rather than evidence.

8. PHILOSOPHY DRIFT
   - Assume the engine runs for three years. How could Paul's philosophy unintentionally drift because of: survivorship bias, confirmation bias, student population changes, changing demographics, local maxima, feedback loops?
   - Can the engine slowly optimize away principles Paul never intended to lose?
   - How would you detect philosophical drift separately from coaching improvement?

9. RULE ECOLOGY
   - Assume 500 active rules. How do rules compete? Reinforce? Suppress?
   - Can two individually good rules create bad behaviour when both fire?
   - Should the engine detect: redundant rules, contradictory rules, shadowed rules, dead rules, dominant rules?

10. PROPOSAL LIFECYCLE
    - Treat every proposed coaching rule as a Proposal. Does it preserve: provenance, supporting evidence, confidence history, approvals, overrides, retirement?
    - Can every rule be reconstructed from its proposal history alone?
    - If not, what is missing?

11. UNKNOWN UNKNOWNS
    - Assume this system has been running successfully for five years.
    - What is the most likely architectural assumption that turns out to be false?
    - Not implementation bugs. Foundational assumptions.

12. COACH TRANSFER TEST
    - Assume Paul retires. Coach Sarah takes over.
    - She inherits every rule, every confidence score, every intervention, every audit trail.
    - Can she determine: why each rule exists? Whether she still agrees? Which rules are culturally specific? Which are universally valid? Which should continue learning? Which should be frozen?
    - If not, what information is missing?

13. THE MISSING PIECE
    - What's the single biggest architectural flaw you see?
    - What breaks first at scale (50 students, 500 rules, 2 years of data)?

Give me a structural assessment, not praise. This engine will run a real boxing gym's coaching intelligence.

---

# SOURCE CODE: coaching-engine.js

// coaching-engine.js — Learning Coaching Engine (Coach Paul Engine)
// ESM module
//
// INVERTED ARCHITECTURE: Paul coaches → interventions logged → patterns extracted →
// rules proposed with evidence + confidence → Paul approves → rules version-controlled.
// NOT a decision tree. A learning engine. "Git for coaching philosophy."
//
// THE CONSTRAINT: no rule exists without evidence. Every rule traces to logged
// interventions, carries a confidence score, and every change writes a changelog entry.
// Every coaching output writes a decision record.
//
// Vault seeds (hypotheses, NOT hardcoded rules):
//   diagnostic-empathy-with-surgical-naming.md, pauls-cognitive-signature.md,
//   the-three-engines.md, the-fear-gate-model.md
//
// Spec: ~/nanoclaw/scaffolds/5b-coach-paul-engine.md

import fs from 'fs';
import path from 'path';

const HOME = process.env.HOME;
const INTERVENTIONS_PATH = path.join(HOME, 'nanoclaw', 'coaching-interventions.json');
const RULES_PATH = path.join(HOME, 'nanoclaw', 'coaching-rules.json');
const CHANGELOG_PATH = path.join(HOME, 'nanoclaw', 'coaching-changelog.json');
const DECISIONS_PATH = path.join(HOME, 'nanoclaw', 'coaching-decisions.json');
const VAULT = path.join(HOME, 'cathedral-vault');
const SYNTH_PROMPT_PATH = path.join(HOME, 'nanoclaw', 'prompts', 'coach-pattern-synthesis.txt');

function loadJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return []; } }
function saveJSON(p, d) { fs.writeFileSync(p, JSON.stringify(d, null, 2)); }
function today() { return new Date().toISOString().split('T')[0]; }

// Confidence thresholds — confidence determines autonomy
const CONFIDENCE = {
  AUTO: 0.90,      // auto-execute, notify Paul after
  RECOMMEND: 0.70, // propose, Paul confirms before delivery
  ASK: 0.50,       // flag the situation, Paul decides
  COLLECT: 0.0     // insufficient evidence, log silently
};
const BASE_CONFIDENCE = 0.60; // where a modified rule resets to — earn it back with outcomes

// Block progression (10 blocks, fear gate at 4→5 — the emotion-engine wall)
const BLOCKS = [
  { id: 1, name: 'Stance & Guard', engine: 'body', gate: null },
  { id: 2, name: 'Basic Punches', engine: 'body', gate: null },
  { id: 3, name: 'Combinations', engine: 'body', gate: null },
  { id: 4, name: 'Defense Basics', engine: 'body', gate: null },
  { id: 5, name: 'Sparring Entry', engine: 'emotion', gate: 'fear_gate' },
  { id: 6, name: 'Ring Craft', engine: 'mind', gate: null },
  { id: 7, name: 'Counter Fighting', engine: 'mind', gate: null },
  { id: 8, name: 'Style Development', engine: 'mind', gate: null },
  { id: 9, name: 'Competition Prep', engine: 'emotion', gate: null },
  { id: 10, name: 'Teaching', engine: 'mind', gate: null }
];

// Keyword maps used to read which engine a signal belongs to.
// (Heuristic layer only — the real intelligence is the logged evidence.)
const ENGINE_KEYWORDS = {
  body: ['guard', 'punch', 'jab', 'cross', 'hook', 'footwork', 'stance', 'balance', 'power', 'speed', 'combo', 'combination', 'slip', 'step', 'pivot', 'fatigue', 'conditioning', 'technique', 'form', 'hips', 'shoulder', 'chin'],
  mind: ['decision', 'thinking', 'confused', 'overthink', 'distracted', 'focus', 'pattern', 'timing', 'read', 'counter', 'ring', 'strategy', 'setup', 'plan', 'remember', 'forgets', 'processing'],
  emotion: ['fear', 'scared', 'nervous', 'anxious', 'tense', 'panic', 'froze', 'freeze', 'composure', 'pressure', 'confidence', 'hesitant', 'hesitation', 'flinch', 'reactive', 'overwhelmed', 'sparring anxiety', 'leaking']
};

// ── Ollama (hermes3) ─────────────────────────────────────────────────────

async function askHermes(prompt, timeoutMs = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'hermes3', prompt, stream: false }),
      signal: controller.signal
    });
    if (!resp.ok) throw new Error(`ollama http ${resp.status}`);
    const data = await resp.json();
    return data.response || '';
  } finally {
    clearTimeout(timer);
  }
}

// Pull a JSON object out of a model reply (models love wrapping JSON in prose/fences)
function extractJSON(text) {
  if (!text) return null;
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
}

// ── Layer 1: Intervention Logging ────────────────────────────────────────

/**
 * Log a coaching intervention — zero interpretation at this layer.
 * @param {object} intervention — { student, context, observation, intervention, reasoning, outcome, tags }
 * @returns {object} InterventionRecord with generated id + date
 */
export function logIntervention(intervention) {
  const log = loadJSON(INTERVENTIONS_PATH);
  const record = {
    id: `int_${Date.now()}`,
    date: today(),
    time: new Date().toISOString().split('T')[1].slice(0, 5),
    source: 'paul_live',
    ...intervention
  };
  log.push(record);
  saveJSON(INTERVENTIONS_PATH, log);
  return record;
}

/**
 * Get intervention log with optional filters
 * @param {object} filters — { student, tags, since, block }
 */
export function getInterventionLog(filters = {}) {
  let log = loadJSON(INTERVENTIONS_PATH);
  if (filters.student) log = log.filter(i => (i.student || '').toLowerCase() === filters.student.toLowerCase());
  if (filters.tags) log = log.filter(i => filters.tags.some(t => (i.tags || []).includes(t)));
  if (filters.since) log = log.filter(i => i.date >= filters.since);
  if (filters.block) log = log.filter(i => i.context?.block === filters.block);
  return log;
}

// ── Layer 2: Pattern Extraction ──────────────────────────────────────────

// Judge a logged outcome as success / failure / unknown from Paul's own words.
// Returns true / false / null (no outcome data).
function judgeOutcome(outcome) {
  if (!outcome || typeof outcome !== 'string') return null;
  const t = outcome.toLowerCase();
  const positive = ['improved', 'improvement', 'stayed up', 'stayed', 'fixed', 'better', 'worked', 'held', 'landed', 'corrected', 'unblocked', 'breakthrough', 'clicked', 'got it', 'success', 'relaxed', 'calmer', 'composed'];
  const negative = ['didn\'t work', 'did not work', 'no change', 'worse', 'still dropping', 'still ', 'failed', 'reverted', 'dropped again', 'froze again', 'no effect', 'ignored'];
  let score = 0;
  for (const w of positive) if (t.includes(w)) score++;
  for (const w of negative) if (t.includes(w)) score--;
  if (score === 0) return null;
  return score > 0;
}

// Confidence from evidence: more observations + higher success rate = more confidence.
// A freshly proposed rule can never start above ~0.87 — the AUTO band (0.90+) must be earned
// through outcomes after approval.
function computeProposalConfidence(observationCount, successRate) {
  const obsPart = 0.25 * Math.min(observationCount / 6, 1);           // 0 → 0.25
  const ratePart = 0.30 * (successRate === null ? 0.5 : successRate); // unknown outcomes = neutral
  return Math.round((0.35 + obsPart + ratePart) * 100) / 100;         // 0.35 → 0.90 theoretical
}

// Which engine does a cluster of interventions live in?
function inferEngine(group, tag) {
  const text = group.map(i => [i.observation, i.intervention, (i.tags || []).join(' ')].join(' ')).join(' ').toLowerCase();
  if ((group.some(i => (i.tags || []).includes('body'))) || tag === 'body') return 'body';
  if ((group.some(i => (i.tags || []).includes('mind'))) || tag === 'mind') return 'mind';
  if ((group.some(i => (i.tags || []).includes('emotion'))) || tag === 'emotion') return 'emotion';
  let best = 'body', bestScore = -1;
  for (const [engine, words] of Object.entries(ENGINE_KEYWORDS)) {
    const score = words.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = engine; }
  }
  return best;
}

// Ask hermes3 to synthesize a rule from the cluster. Falls back to a purely
// evidence-quoting rule if Ollama is down or returns garbage — the fallback
// still keeps Paul's language because it quotes the interventions verbatim.
async function synthesizeRule(tag, group) {
  const evidence = group.map(i =>
    `[${i.id}] student=${i.student || '?'} block=${i.context?.block ?? '?'}\n` +
    `  OBSERVED: ${i.observation || ''}\n` +
    `  PAUL DID: ${i.intervention || ''}\n` +
    `  PAUL'S REASONING: ${i.reasoning || ''}\n` +
    `  OUTCOME: ${i.outcome || '(not logged yet)'}`
  ).join('\n\n');

  let template;
  try { template = fs.readFileSync(SYNTH_PROMPT_PATH, 'utf8'); }
  catch {
    template = 'Synthesize ONE coaching rule from these logged interventions (shared tag: {TAG}). ' +
      'Use ONLY the evidence attached. Keep the coach\'s exact words in "instruction". ' +
      'Reply with ONLY JSON: {"rule","trigger","student_level","engine","block_range","prescription_type","instruction","duration","escalation","insufficient_evidence"}\n\nEVIDENCE:\n{EVIDENCE}';
  }
  const prompt = template.replace('{TAG}', tag).replace('{EVIDENCE}', evidence);

  const latest = group[group.length - 1];
  const fallback = {
    rule: `When "${tag}" pattern appears, apply Paul's logged intervention: "${latest.intervention || latest.observation}"`,
    trigger: tag,
    student_level: 'any',
    engine: inferEngine(group, tag),
    block_range: [1, 10],
    prescription_type: 'other',
    instruction: latest.intervention || latest.observation || '',
    duration: null,
    escalation: null,
    synthesizedBy: 'fallback_verbatim' // hermes3 unavailable — rule is a direct quote of the evidence
  };

  try {
    const reply = await askHermes(prompt);
    const parsed = extractJSON(reply);
    if (!parsed || parsed.insufficient_evidence === true || !parsed.rule) return fallback;
    parsed.engine = ['body', 'mind', 'emotion'].includes(parsed.engine) ? parsed.engine : fallback.engine;
    if (!Array.isArray(parsed.block_range) || parsed.block_range.length !== 2) parsed.block_range = [1, 10];
    if (!parsed.instruction) parsed.instruction = fallback.instruction;
    parsed.synthesizedBy = 'hermes3';
    return parsed;
  } catch {
    return fallback;
  }
}

/**
 * Extract patterns from intervention log, propose rules.
 * Clusters interventions by tag, synthesizes with hermes3, attaches evidence chains.
 * Skips clusters already covered by a live (proposed/approved/hypothesis) rule.
 * @param {number} minObservations — minimum similar interventions before proposing (default 3)
 * @returns {Array} newly created RuleProposal[]
 */
export async function extractPatterns(minObservations = 3) {
  const interventions = loadJSON(INTERVENTIONS_PATH);
  const rules = loadJSON(RULES_PATH);
  const proposals = [];
  const seenEvidenceSets = new Map(); // dedupe: two tags covering the SAME interventions = one rule

  // 1. Cluster by tag
  const clusters = {};
  for (const i of interventions) {
    for (const t of (i.tags || [])) (clusters[t] = clusters[t] || []).push(i);
  }

  for (const [tag, group] of Object.entries(clusters)) {
    // 2. Enough observations?
    if (group.length < minObservations) continue;

    // 6. Skip clusters that already have a live rule for this tag
    const covered = rules.some(r => r.status !== 'rejected' && (r.sourceTags || []).includes(tag));
    if (covered) continue;

    // Same evidence set already proposed this run? Merge the tag instead of duplicating the rule.
    const signature = group.map(g => g.id).sort().join('|');
    const existing = seenEvidenceSets.get(signature);
    if (existing) {
      existing.sourceTags.push(tag);
      existing.conditions.tags.push(tag);
      continue;
    }

    // 4. Confidence from success_rate + observation_count (from Paul's logged outcomes)
    const judged = group.map(i => ({ i, success: judgeOutcome(i.outcome) }));
    const withOutcome = judged.filter(j => j.success !== null);
    const successes = withOutcome.filter(j => j.success).length;
    const successRate = withOutcome.length ? successes / withOutcome.length : null;
    const confidence = computeProposalConfidence(group.length, successRate);

    // 3. hermes3 synthesizes the rule text (fallback quotes evidence verbatim)
    const synth = await synthesizeRule(tag, group);

    const dates = group.map(g => g.date).sort();
    const timeSpanDays = Math.round((new Date(dates[dates.length - 1]) - new Date(dates[0])) / 86400000);

    // 5. Proposal with full evidence chain
    const proposal = {
      id: `rule_${tag.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}`,
      version: '1.0',
      status: 'proposed',
      rule: synth.rule,
      confidence,
      sourceTags: [tag],
      evidence: {
        supporting_interventions: group.map(g => g.id),
        success_rate: withOutcome.length ? `${successes}/${withOutcome.length} logged outcomes positive` : 'no outcomes logged yet',
        failure_cases: judged.filter(j => j.success === false).map(j => `${j.i.id} — ${(j.i.outcome || '').slice(0, 120)}`),
        observation_count: group.length,
        time_span_days: timeSpanDays,
        outcomes: []
      },
      conditions: {
        trigger: synth.trigger || tag,
        student_level: synth.student_level || 'any',
        engine: synth.engine,
        block_range: synth.block_range || [1, 10],
        tags: [tag]
      },
      prescription: {
        type: synth.prescription_type || 'other',
        instruction: synth.instruction,
        duration: synth.duration || null,
        escalation: synth.escalation || null
      },
      synthesizedBy: synth.synthesizedBy,
      created: today(),
      approved: null,
      approvedBy: null,
      changelog: []
    };

    rules.push(proposal);
    proposals.push(proposal);
    seenEvidenceSets.set(signature, proposal);
  }

  if (proposals.length) saveJSON(RULES_PATH, rules);
  return proposals;
}

/**
 * Get pending rule proposals (not yet approved/rejected)
 */
export function getPendingProposals() {
  return loadJSON(RULES_PATH).filter(r => r.status === 'proposed');
}

// ── Layer 3: Rule Management ─────────────────────────────────────────────

// Write a changelog entry; snapshot = the rule state BEFORE this change,
// so old versions are always reconstructable (this is the version control).
function writeChangelog(rule, change, reason, snapshotBefore) {
  const changelog = loadJSON(CHANGELOG_PATH);
  changelog.push({
    ruleId: rule.id,
    version: snapshotBefore && snapshotBefore.version !== rule.version
      ? `${snapshotBefore.version} → ${rule.version}` : rule.version,
    date: today(),
    change,
    reason,
    evidence: rule.evidence?.supporting_interventions || [],
    approvedBy: 'paul',
    snapshot: snapshotBefore || null
  });
  saveJSON(CHANGELOG_PATH, changelog);
}

/**
 * Approve a proposed rule, optionally with modifications
 */
export function approveRule(ruleId, modifications = {}) {
  const rules = loadJSON(RULES_PATH);
  const rule = rules.find(r => r.id === ruleId);
  if (!rule) return null;

  const before = JSON.parse(JSON.stringify(rule));

  rule.status = 'approved';
  rule.approved = today();
  rule.approvedBy = 'paul';

  if (modifications.rule) rule.rule = modifications.rule;
  if (modifications.conditions) Object.assign(rule.conditions = rule.conditions || {}, modifications.conditions);
  if (modifications.prescription) Object.assign(rule.prescription = rule.prescription || {}, modifications.prescription);

  saveJSON(RULES_PATH, rules);
  writeChangelog(rule,
    modifications.rule ? `Approved with modification: ${modifications.rule}` : 'Approved as proposed',
    modifications.reason || 'Paul approved', before);
  return rule;
}

/**
 * Modify an approved rule — creates a NEW VERSION, preserves the old one in the
 * changelog snapshot, resets confidence to base (a changed rule re-earns trust).
 * @param {object} modifications — { rule, conditions, prescription }
 */
export function modifyRule(ruleId, modifications = {}, reason = 'Paul modified') {
  const rules = loadJSON(RULES_PATH);
  const rule = rules.find(r => r.id === ruleId);
  if (!rule) return null;

  const before = JSON.parse(JSON.stringify(rule));

  // bump version: 1.0 → 1.1 → 1.2 ...
  const [major, minor] = String(rule.version || '1.0').split('.').map(n => parseInt(n, 10) || 0);
  rule.version = `${major}.${minor + 1}`;
  rule.confidence = BASE_CONFIDENCE; // spec: Paul modifies rule → confidence resets to base

  if (modifications.rule) rule.rule = modifications.rule;
  if (modifications.conditions) Object.assign(rule.conditions = rule.conditions || {}, modifications.conditions);
  if (modifications.prescription) Object.assign(rule.prescription = rule.prescription || {}, modifications.prescription);
  rule.modified = today();

  saveJSON(RULES_PATH, rules);
  writeChangelog(rule, modifications.rule ? `Modified: ${modifications.rule}` : 'Modified conditions/prescription', reason, before);
  return rule;
}

/**
 * Reject a proposed rule (reason required — rejections are evidence too)
 */
export function rejectRule(ruleId, reason) {
  const rules = loadJSON(RULES_PATH);
  const rule = rules.find(r => r.id === ruleId);
  if (!rule) return null;
  const before = JSON.parse(JSON.stringify(rule));
  rule.status = 'rejected';
  rule.rejectedReason = reason;
  rule.rejectedDate = today();
  saveJSON(RULES_PATH, rules);
  writeChangelog(rule, 'Rejected', reason || 'no reason given', before);
  return rule;
}

/**
 * Get rules with optional filters.
 * Default: approved rules only. Pass { status: 'hypothesis' | 'proposed' | 'all' } to widen.
 */
export function getRules(filters = {}) {
  let rules = loadJSON(RULES_PATH);
  const status = filters.status || 'approved';
  if (status !== 'all') rules = rules.filter(r => r.status === status);
  if (filters.engine) rules = rules.filter(r => r.conditions?.engine === filters.engine);
  if (filters.minConfidence) rules = rules.filter(r => r.confidence >= filters.minConfidence);
  if (filters.tag) rules = rules.filter(r => (r.conditions?.tags || r.sourceTags || []).includes(filters.tag));
  return rules;
}

/**
 * Get full changelog for a rule
 */
export function getRuleChangelog(ruleId) {
  return loadJSON(CHANGELOG_PATH).filter(c => c.ruleId === ruleId);
}

// ── Vault Seeds — Paul's methodology loaded as HYPOTHESES, not rules ─────
// These need outcome validation before becoming confirmed rules. Confidence 0.60
// (ASK band) — they inform, they never auto-fire.

const SEED_CONFIDENCE = 0.60;

// The 13 cognitive skills (pauls-cognitive-signature.md) — meta-skills that shape
// HOW the engine reasons, loaded as hypotheses so their coaching value gets tested.
const COGNITIVE_SKILLS = [
  ['compression_concrete_image', 'Compression through concrete image', 'Give the student one concrete image that holds the whole correction — the image does the work, not a list of pointers.'],
  ['cross_domain_bridge', 'Cross-domain bridge-building', 'Bridge the correction to something the student already does well in another domain — structural identity, not analogy.'],
  ['reflexive_rigour', 'Reflexive rigour', 'Apply the same standard to your own coaching that you apply to the student — if a cue keeps failing, the cue is wrong, not the student.'],
  ['lens_on_instrument', 'Turning the lens on the instrument', 'Treat the coaching itself as data — when a session goes flat, diagnose the coaching, not just the student.'],
  ['hold_until_pattern', 'Hold-until-pattern', 'Wait for three data points before naming a pattern — hold the first observation, note the second, name at the third.'],
  ['live_forensic', 'Forensic diagnosis in real time', 'Name the mechanism while still inside the round — live diagnosis, not retrospective analysis.'],
  ['governance_instinct', 'The governance instinct', 'After prescribing, ask who/what watches the prescription — a drill without a check is incomplete.'],
  ['four_to_eight', 'The 4-to-8 Question', 'When a student is stuck at a 4, ask what takes them to an 8 — force the new idea, not the refinement.'],
  ['trojan_horse', 'Trojan Horse Principle', 'The skill is never the offer — they came for boxing; deliver the deeper work through the boxing, never announce it.'],
  ['audit_before_build', 'Audit Before Build + Speak Freely', 'Diagnose fully before changing anything, and remove the pressure for a positive assessment before asking what is wrong.'],
  ['accumulation_vessel', 'Identity as accumulation vessel', 'The student\'s logged history IS their identity as a fighter — read the accumulation before coaching the day.'],
  ['diagnostic_inversion', 'Diagnostic Inversion', 'Never fix the reported symptom — test the actual mechanism underneath the complaint.'],
  ['four_step_interrogation', 'The Four-Step Interrogation', 'When a student\'s story about their block doesn\'t hold, strip it with simple concrete questions until the real block is visible.']
];

/**
 * Load vault seed files as hypothesis rules (status 'hypothesis', confidence 0.60).
 * Idempotent — already-loaded seeds are skipped. Missing vault files are reported, not faked.
 * @returns {object} { loaded, skipped, missingFiles }
 */
export function loadVaultSeeds() {
  const files = {
    de: path.join(VAULT, '02_Refined_Gold', 'cathedral', 'diagnostic-empathy-with-surgical-naming.md'),
    cs: path.join(VAULT, '06_Methods', 'pauls-cognitive-signature.md'),
    te: path.join(VAULT, '02_Refined_Gold', 'cathedral', 'the-three-engines.md'),
    fg: path.join(VAULT, '02_Refined_Gold', 'cathedral', 'the-fear-gate-model.md')
  };
  const missingFiles = Object.entries(files).filter(([, p]) => !fs.existsSync(p)).map(([, p]) => p);
  const have = k => !missingFiles.includes(files[k]);
  const rel = p => p.replace(VAULT + '/', '');

  const seeds = [];
  const seed = (id, ruleText, engine, trigger, instruction, file, extras = {}) => seeds.push({
    id, version: '1.0', status: 'hypothesis',
    rule: ruleText,
    confidence: SEED_CONFIDENCE,
    sourceTags: extras.tags || [],
    evidence: { source: 'vault_seed', file: rel(file), observation_count: 0, supporting_interventions: [], outcomes: [] },
    conditions: { trigger, student_level: 'any', engine, block_range: extras.block_range || [1, 10], tags: extras.tags || [] },
    prescription: { type: extras.type || 'diagnostic_method', instruction, duration: null, escalation: null },
    created: today(), approved: null, approvedBy: null, changelog: [],
    note: 'Vault seed — hypothesis. Needs outcome validation before becoming a confirmed rule.'
  });

  // ── The 6 diagnostic coaching components (diagnostic-empathy-with-surgical-naming.md)
  if (have('de')) {
    const f = files.de;
    seed('seed_de_1_safety_without_announcing',
      'Create safety without announcing it — through tempo, humour and genuine curiosity, never by saying "this is a safe space".',
      'emotion', 'student_guarded',
      'Match their energy, keep it light, stay genuinely curious — the student relaxes because nothing feels clinical.', f, { tags: ['diagnostic', 'safety'] });
    seed('seed_de_2_wound_under_words',
      'Hear the wound underneath the words — the surface complaint is never the real signal; listen for the flinch: energy shift, speed change, misplaced laugh.',
      'emotion', 'surface_complaint',
      'Listen for the sentence beneath the sentence — the moment their energy shifts, where they speed up or slow down, where they laugh at something that isn\'t funny.', f, { tags: ['diagnostic', 'listening'] });
    seed('seed_de_3_collapsing_question',
      'Ask the collapsing question — one simple, almost casual question that makes the whole defence structure fold before the guard can intervene.',
      'mind', 'defence_structure_detected',
      'Skip the surface, find the load-bearing assumption, and ask about it directly — simple, casual, no therapeutic jargon.', f, { tags: ['diagnostic', 'questioning'] });
    seed('seed_de_4_naming_precisely',
      'Name precisely — the wound gets a specific concrete name drawn from THEIR own language, not a category, not a diagnosis.',
      'mind', 'wound_identified',
      'Name the exact thing, in the exact words the person would use themselves, at the exact moment they\'re ready to hear it.', f, { tags: ['diagnostic', 'naming'] });
    seed('seed_de_5_match_intervention_to_wound',
      'Match intervention to wound type — same diagnostic path can require completely different repair architectures (external-authority wound vs self-abandonment wound).',
      'emotion', 'wound_named',
      'Different wounds, different interventions: reconnect them to who they were before the wound, or build the bridge between adult self and the part that gave up.', f, { tags: ['diagnostic', 'intervention_matching'] });
    seed('seed_de_6_know_when_to_stop',
      'Know when to stop — let the conversation end naturally; no homework, no follow-up framework, no referral speech.',
      'emotion', 'breakthrough_reached',
      'Stop when it lands. No homework. No framework. The person should feel genuinely changed, not managed.', f, { tags: ['diagnostic', 'stopping'] });
  }

  // ── The Three Engines model (the-three-engines.md)
  if (have('te')) {
    const f = files.te;
    seed('seed_te_energy_currency',
      'Diagnose which engine is leaking before prescribing — mind, emotion, body share one currency: how well you organize, cultivate, and protect ENERGY.',
      'mind', 'plateau_or_underperformance',
      'Before any drill change, read which engine is leaking: the body-only fighter is running one engine and leaking from the other two.', f, { tags: ['three_engines', 'energy'] });
    seed('seed_te_mind_engine',
      'The mind engine is the installed OS — peaceful, clear, able to make good decisions quickly vs tricked, distracted, gaslit.',
      'mind', 'mental_leak',
      'Check the install: is the inner environment peaceful, clear, decisive — or easily tricked, distracted, gaslit? Coach the OS, not just the technique.', f, { tags: ['three_engines', 'mind'] });
    seed('seed_te_emotion_engine',
      'The emotion engine is composure — either composed and in control of emotional energy, or fearful, tense, panicked, reactive and therefore leaking energy.',
      'emotion', 'emotional_leak',
      'Don\'t suppress the emotion engine — organize it. Composed and in control of emotional energy is the gate passed.', f, { tags: ['three_engines', 'emotion'] });
    seed('seed_te_body_engine',
      'The body is the machine — the one everyone trains. Train it, but never let it hide the two neglected engines.',
      'body', 'physical_focus_only',
      'Everyone trains the body. The edge is the two engines everyone forgets — if body metrics are fine but performance stalls, the leak is elsewhere.', f, { tags: ['three_engines', 'body'] });
  }

  // ── The Fear Gate (the-fear-gate-model.md + three-engines 4→5 wall)
  if (have('fg')) {
    const f = files.fg;
    seed('seed_fg_4to5_wall',
      'The 4→5 wall (Defense Basics → Sparring Entry) is an EMOTION-engine event, not a physical one — it\'s where pressure and fear start leaking energy and composure has to be installed.',
      'emotion', 'block_4_to_5_transition',
      'The student "knows the punches" but can\'t flow. Don\'t prescribe more technique — this is the fear gate. Which floor element is missing?', f, { tags: ['fear_gate', 'block_progression'], block_range: [4, 5] });
    seed('seed_fg_floor_elements',
      'At a fear gate, check the four floor elements: healthy routine (the floor beneath the trap door), journal/evidence of problems overcome, supportive community, and accumulated evidence of character at previous gates.',
      'emotion', 'fear_gate_stall',
      'Which floor element is missing? Routine holds you while the fear passes. The journal says "you\'ve handled worse." Peers pull toward the positive outcome. Data overwhelms the fear.', f, { tags: ['fear_gate', 'floor_elements'] });
    seed('seed_fg_alarm_not_trapdoor',
      'Reframe the gate: alarm, not trap door — the fear gate never disappears, it becomes useful; an alarm tells you something important is happening.',
      'emotion', 'fear_response',
      'Each gate survived is a data point. "I\'ve been here 7 times and survived all 7." The spiral goes up.', f, { tags: ['fear_gate', 'reframe'] });
  }

  // ── The 13 cognitive skills (pauls-cognitive-signature.md) — meta-skills
  if (have('cs')) {
    for (const [key, name, instruction] of COGNITIVE_SKILLS) {
      seed(`seed_cs_${key}`,
        `Meta-skill — ${name}: informs HOW the engine reasons, not WHAT it prescribes.`,
        'mind', `meta_${key}`, instruction, files.cs, { tags: ['cognitive_signature', 'meta_skill'], type: 'meta_skill' });
    }
  }

  // ── Block progression (spec: 10 blocks, gate at 4→5)
  seed('seed_blocks_progression',
    'Progression runs through 10 gated blocks: Stance & Guard → Basic Punches → Combinations → Defense Basics → FEAR GATE → Sparring Entry → Ring Craft → Counter Fighting → Style Development → Competition Prep → Teaching. Each gate asks "which engine is still leaking", not just "can you do the technique".',
    'mind', 'block_transition',
    'Blocks 1-4 train the body, block 5 is the emotion gate, 6-8 train the mind, 9 tests emotion under stakes, 10 is mind (teaching). Read the gate, not just the technique.',
    path.join(HOME, 'nanoclaw', 'scaffolds', '5b-coach-paul-engine.md'), { tags: ['block_progression'] });

  // Idempotent write
  const rules = loadJSON(RULES_PATH);
  const existing = new Set(rules.map(r => r.id));
  let loaded = 0, skipped = 0;
  for (const s of seeds) {
    if (existing.has(s.id)) { skipped++; continue; }
    rules.push(s); loaded++;
  }
  if (loaded) saveJSON(RULES_PATH, rules);
  return { loaded, skipped, missingFiles };
}

// ── Active Coaching (uses approved rules only) ──────────────────────────

// Does an approved rule match this session + student?
function ruleMatches(rule, sessionText, sessionTags, studentProfile) {
  const cond = rule.conditions || {};
  // tag/trigger match — any source tag in session tags, or trigger/tag words in the session text
  const tagHit = (rule.sourceTags || []).some(t => sessionTags.includes(t)) ||
    (cond.tags || []).some(t => sessionTags.includes(t)) ||
    (cond.trigger && sessionText.includes(String(cond.trigger).replace(/_/g, ' '))) ||
    (rule.sourceTags || []).some(t => sessionText.includes(String(t).replace(/_/g, ' ')));
  if (!tagHit) return false;
  // block range
  const block = studentProfile?.currentBlock || studentProfile?.block;
  if (block && Array.isArray(cond.block_range)) {
    if (block < cond.block_range[0] || block > cond.block_range[1]) return false;
  }
  // student level (tolerant — 'any' or missing passes)
  const level = (studentProfile?.level || '').toLowerCase();
  const wanted = (cond.student_level || 'any').toLowerCase();
  if (level && wanted !== 'any' && !wanted.split('|').includes(level)) return false;
  return true;
}

// Pull Paul's actual words for a rule — verbatim intervention text from the evidence chain
function paulsWordsFor(rule, allInterventions) {
  const ids = rule.evidence?.supporting_interventions || [];
  return allInterventions.filter(i => ids.includes(i.id)).map(i => i.intervention).filter(Boolean).slice(0, 3);
}

/**
 * Run diagnosis on session data against approved rules.
 * Confidence gates: AUTO 90%+ / RECOMMEND 70-89% / ASK 50-69% / COLLECT <50% (silent log).
 * Uses Paul's language from original interventions. Writes a decision record.
 * @param {object} sessionData — { tags, observations, metrics, notes ... }
 * @param {object} studentProfile — { id, name, level, currentBlock ... }
 */
export function diagnose(sessionData = {}, studentProfile = {}) {
  const rules = getRules(); // approved only
  const allInterventions = loadJSON(INTERVENTIONS_PATH);
  const date = today();

  const sessionTags = (sessionData.tags || []).map(t => String(t).toLowerCase());
  const sessionText = JSON.stringify(sessionData).toLowerCase().replace(/[_"]/g, ' ');

  const output = {
    studentId: studentProfile?.id || studentProfile?.name || null,
    date,
    sessionData,
    diagnoses: [],
    overallAssessment: { dominantGap: null, trend: sessionData.trend || 'insufficient_data', nextFocus: null },
    confidenceBreakdown: { auto_executed: 0, recommended: 0, needs_paul: 0, collecting: 0 }
  };

  const rulesApplied = [];
  const collecting = [];
  const engineHits = { body: 0, mind: 0, emotion: 0 };

  for (const rule of rules) {
    if (!ruleMatches(rule, sessionText, sessionTags, studentProfile)) continue;

    const c = rule.confidence;
    let level;
    if (c >= CONFIDENCE.AUTO) level = 'auto_executed';
    else if (c >= CONFIDENCE.RECOMMEND) level = 'recommended';
    else if (c >= CONFIDENCE.ASK) level = 'needs_paul';
    else level = 'collecting';

    if (level === 'collecting') {
      // <50%: no recommendation — just log the observation for future pattern matching
      output.confidenceBreakdown.collecting++;
      collecting.push({ ruleId: rule.id, confidence: c });
      continue;
    }

    output.confidenceBreakdown[level]++;
    if (rule.conditions?.engine) engineHits[rule.conditions.engine] = (engineHits[rule.conditions.engine] || 0) + 1;
    rulesApplied.push({ ruleId: rule.id, version: rule.version, confidence: c });

    output.diagnoses.push({
      ruleId: rule.id,
      version: rule.version,
      confidence: c,
      level,
      engine: rule.conditions?.engine || null,
      diagnosis: rule.rule,
      prescription: rule.prescription?.instruction || null,
      escalation: rule.prescription?.escalation || null,
      paulsWords: paulsWordsFor(rule, allInterventions), // verbatim — Paul's language, not generic rephrasing
      evidence: rule.evidence?.supporting_interventions || []
    });
  }

  // Highest-confidence diagnosis first
  output.diagnoses.sort((a, b) => b.confidence - a.confidence);

  // Overall assessment — which engine is leaking most, what to focus on next
  const topEngine = Object.entries(engineHits).sort((a, b) => b[1] - a[1])[0];
  if (topEngine && topEngine[1] > 0) output.overallAssessment.dominantGap = `${topEngine[0]} engine`;
  if (output.diagnoses[0]) output.overallAssessment.nextFocus = output.diagnoses[0].prescription || output.diagnoses[0].diagnosis;

  // Autonomy level = the strongest band that fired
  const autonomyLevel =
    output.confidenceBreakdown.auto_executed > 0 ? 'auto' :
    output.confidenceBreakdown.recommended > 0 ? 'recommended' :
    output.confidenceBreakdown.needs_paul > 0 ? 'ask' : 'collect';

  // Decision record — the audit trail is more valuable than the decision
  const decision = {
    decisionId: `dec_${Date.now()}`,
    studentId: output.studentId,
    date,
    type: 'coaching_recommendation',
    input: {
      sessionData,
      studentProfile: { id: studentProfile?.id, name: studentProfile?.name, level: studentProfile?.level, currentBlock: studentProfile?.currentBlock }
    },
    rulesApplied,
    collectingSilently: collecting,
    autonomyLevel,
    model: 'hermes3',
    output: {
      diagnoses: output.diagnoses.map(d => `${d.diagnosis}${d.level === 'auto_executed' ? ' [AUTO]' : ''}`),
      prescriptions: output.diagnoses.map(d => d.prescription).filter(Boolean)
    },
    humanOverride: null,
    overrideReason: null,
    overrideDate: null
  };
  const decisions = loadJSON(DECISIONS_PATH);
  decisions.push(decision);
  saveJSON(DECISIONS_PATH, decisions);

  output.decisionRecord = decision;
  return output;
}

/**
 * Assess a new student from first session — dominant engine, starting block, priorities.
 * Heuristic reading of the three engines; writes a decision record for the audit trail.
 * @param {object} firstSessionData — { student/name, notes, observations, experience, metrics, tags }
 */
export function assessNewStudent(firstSessionData = {}) {
  const text = [
    firstSessionData.notes, firstSessionData.observations,
    Array.isArray(firstSessionData.observations) ? firstSessionData.observations.join(' ') : '',
    (firstSessionData.tags || []).join(' '), firstSessionData.experience
  ].filter(Boolean).join(' ').toLowerCase();

  // Score each engine by how many of its leak-signals appear in the first session
  const scores = { body: 0, mind: 0, emotion: 0 };
  for (const [engine, words] of Object.entries(ENGINE_KEYWORDS)) {
    for (const w of words) if (text.includes(w)) scores[engine]++;
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const anySignal = ranked[0][1] > 0;
  // "Dominant engine" = where the strongest signal (usually the leak) shows in session one.
  const dominantEngine = anySignal ? ranked[0][0] : 'body'; // no signal → default: everyone arrives training the body

  // Starting block from stated experience — capped at 4: the fear gate (5) is never assumed passed
  const exp = String(firstSessionData.experience || '').toLowerCase();
  let startingBlock = 1;
  if (/(competi|amateur|fights|fought|years)/.test(exp)) startingBlock = 4;
  else if (/(trained|boxed before|some boxing|muay thai|kickbox|martial)/.test(exp)) startingBlock = 3;
  else if (/(fitness|athletic|other sport|active)/.test(exp)) startingBlock = 2;

  // Priorities: the block's engine first, then the two neglected engines (three-engines seed)
  const block = BLOCKS.find(b => b.id === startingBlock);
  const initialPriorities = [];
  initialPriorities.push(`Block ${block.id} — ${block.name} (${block.engine} engine)`);
  if (anySignal && dominantEngine !== block.engine) {
    initialPriorities.push(`Watch the ${dominantEngine} engine — strongest first-session signal (${ranked[0][1]} markers)`);
  }
  const weakest = ranked[2][0];
  initialPriorities.push(`Baseline the ${weakest} engine early — least data from session one`);

  const assessment = {
    student: firstSessionData.student || firstSessionData.name || null,
    date: today(),
    dominantEngine,
    engineSignals: scores,
    startingBlock,
    startingBlockName: block.name,
    initialPriorities,
    fearGateStatus: 'not_reached',
    notes: anySignal
      ? `Engine signals read from first session (${ranked.map(([e, s]) => `${e}:${s}`).join(', ')}). Hypothesis only — needs sessions to confirm.`
      : 'No engine signals detected in first session data — defaulting to body engine, block 1. Log observations to sharpen.'
  };

  // Decision record — assessments are auditable outputs too
  const decisions = loadJSON(DECISIONS_PATH);
  decisions.push({
    decisionId: `dec_${Date.now()}`,
    studentId: assessment.student,
    date: assessment.date,
    type: 'initial_assessment',
    input: { firstSessionData },
    rulesApplied: [],
    autonomyLevel: 'recommended',
    model: 'heuristic',
    output: { assessment },
    humanOverride: null, overrideReason: null, overrideDate: null
  });
  saveJSON(DECISIONS_PATH, decisions);

  return assessment;
}

// Metric name → engine (for plateau attribution)
function metricEngine(name) {
  const n = name.toLowerCase();
  if (/(compos|pressure|spar|fear|confid|calm|heart)/.test(n)) return 'emotion';
  if (/(accura|decision|counter|timing|read|ring|combo_variety|variety)/.test(n)) return 'mind';
  return 'body'; // punches, power, speed, steps, output — the machine
}

/**
 * Detect plateau across session history — flatlined metrics across 3+ sessions,
 * and which engine is stalled. Fear-gate aware (4→5 wall = emotion event).
 * @param {Array} sessionHistory — [{ date, block?, metrics: { name: number } }, ...] oldest→newest or any order
 * @returns {object|null} PlateauReport or null
 */
export function detectPlateau(sessionHistory = []) {
  if (!Array.isArray(sessionHistory) || sessionHistory.length < 3) return null;

  const sessions = [...sessionHistory].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  const window = sessions.slice(-Math.max(3, Math.min(sessions.length, 5))); // last 3-5 sessions

  // Gather numeric metrics per session (metrics object, or numeric top-level fields)
  const series = {};
  for (const s of window) {
    const metrics = s.metrics && typeof s.metrics === 'object' ? s.metrics : s;
    for (const [k, v] of Object.entries(metrics)) {
      if (typeof v !== 'number' || !isFinite(v)) continue;
      if (['block', 'round', 'rounds', 'id'].includes(k)) continue;
      (series[k] = series[k] || []).push(v);
    }
  }

  const flatlined = [];
  const declining = [];
  for (const [metric, values] of Object.entries(series)) {
    if (values.length < 3) continue; // need the metric in 3+ sessions
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (mean === 0) continue;
    const spread = (Math.max(...values) - Math.min(...values)) / Math.abs(mean);
    const drift = (values[values.length - 1] - values[0]) / Math.abs(mean);
    if (spread < 0.05) flatlined.push({ metric, engine: metricEngine(metric), values, spread: Math.round(spread * 1000) / 1000 });
    else if (drift < -0.10) declining.push({ metric, engine: metricEngine(metric), values, drift: Math.round(drift * 1000) / 1000 });
  }

  if (flatlined.length === 0 && declining.length === 0) return null;

  // Which engine is stalled? Most flatlined/declining metrics wins.
  const engineCount = {};
  for (const m of [...flatlined, ...declining]) engineCount[m.engine] = (engineCount[m.engine] || 0) + 1;
  const stalledEngine = Object.entries(engineCount).sort((a, b) => b[1] - a[1])[0][0];

  // Fear gate check — the known 4→5 wall is an emotion-engine event
  const lastBlock = [...window].reverse().map(s => s.block || s.currentBlock).find(b => b);
  const atFearGate = lastBlock === 4 || lastBlock === 5;

  return {
    plateaued: true,
    sessionsAnalyzed: window.length,
    from: window[0].date || null,
    to: window[window.length - 1].date || null,
    flatlinedMetrics: flatlined,
    decliningMetrics: declining,
    stalledEngine,
    atFearGate,
    reading: atFearGate && (stalledEngine === 'emotion' || flatlined.length > 0)
      ? 'Student is at the 4→5 wall — likely an emotion-engine event, not a physical one. Which floor element is missing: routine, journal, community, or evidence of gates survived?'
      : `${stalledEngine} engine appears stalled across ${window.length} sessions. Diagnose which engine is leaking before changing drills.`,
    suggestedQuestion: 'Which gate, which floor element is missing, what intervention matches?'
  };
}

// ── Confidence + Evidence ────────────────────────────────────────────────

/**
 * Update confidence after an outcome. Success +0.03, failure -0.05
 * (failures cost more than successes earn — trust is slow up, fast down).
 */
export function updateConfidence(ruleId, outcome) {
  const rules = loadJSON(RULES_PATH);
  const rule = rules.find(r => r.id === ruleId);
  if (!rule) return -1;

  const delta = outcome.success ? 0.03 : -0.05;
  rule.confidence = Math.max(0, Math.min(1, Math.round((rule.confidence + delta) * 100) / 100));

  if (!rule.evidence) rule.evidence = {};
  if (!rule.evidence.outcomes) rule.evidence.outcomes = [];
  rule.evidence.outcomes.push({
    date: today(),
    success: outcome.success,
    context: outcome.context,
    interventionId: outcome.interventionId
  });

  saveJSON(RULES_PATH, rules);
  return rule.confidence;
}

/**
 * Get full evidence chain for a rule — interventions, outcomes, changelog
 */
export function getEvidenceChain(ruleId) {
  const rules = loadJSON(RULES_PATH);
  const rule = rules.find(r => r.id === ruleId);
  if (!rule) return null;

  const interventions = loadJSON(INTERVENTIONS_PATH)
    .filter(i => (rule.evidence?.supporting_interventions || []).includes(i.id));

  return {
    rule: rule.rule,
    confidence: rule.confidence,
    source: rule.evidence?.source || 'logged_interventions',
    interventions,
    outcomes: rule.evidence?.outcomes || [],
    changelog: getRuleChangelog(ruleId)
  };
}

// ── Decision Records ────────────────────────────────────────────────────

/**
 * Get decision log with optional filters — { studentId, since, autonomyLevel, type }
 */
export function getDecisionLog(filters = {}) {
  let log = loadJSON(DECISIONS_PATH);
  if (filters.studentId) log = log.filter(d => String(d.studentId || '').toLowerCase() === String(filters.studentId).toLowerCase());
  if (filters.since) log = log.filter(d => d.date >= filters.since);
  if (filters.autonomyLevel) log = log.filter(d => d.autonomyLevel === filters.autonomyLevel);
  if (filters.type) log = log.filter(d => d.type === filters.type);
  return log;
}

/**
 * Override a decision — Paul disagrees. Feeds back into rule confidence.
 */
export function overrideDecision(decisionId, override, reason) {
  const decisions = loadJSON(DECISIONS_PATH);
  const dec = decisions.find(d => d.decisionId === decisionId);
  if (!dec) return null;

  dec.humanOverride = override;
  dec.overrideReason = reason;
  dec.overrideDate = today();
  saveJSON(DECISIONS_PATH, decisions);

  for (const r of (dec.rulesApplied || [])) {
    updateConfidence(r.ruleId, { success: false, context: `Paul override: ${reason}`, interventionId: decisionId });
  }

  return dec;
}

// ── Version Control ──────────────────────────────────────────────────────

/**
 * Get a specific version of a rule.
 * Current version comes from the live store; older versions are reconstructed
 * from changelog snapshots (each entry preserves the rule state BEFORE the change).
 */
export function getRuleVersion(ruleId, version) {
  const rules = loadJSON(RULES_PATH);
  const rule = rules.find(r => r.id === ruleId);
  if (rule && String(rule.version) === String(version)) return rule;

  // walk the changelog newest→oldest; the first snapshot AT that version is the state to return
  const entries = getRuleChangelog(ruleId).slice().reverse();
  for (const e of entries) {
    if (e.snapshot && String(e.snapshot.version) === String(version)) return { ...e.snapshot, reconstructedFromChangelog: true };
  }
  return null;
}

/**
 * Get full version history of a rule — every change with provenance
 */
export function getRuleHistory(ruleId) {
  return getRuleChangelog(ruleId);
}

// ── Block Progression ────────────────────────────────────────────────────

/**
 * Get block progression map for a student — position + fear gate status
 */
export function getBlockProgression(studentProfile) {
  const current = studentProfile?.currentBlock || 1;
  return {
    blocks: BLOCKS,
    currentBlock: current,
    currentBlockName: (BLOCKS.find(b => b.id === current) || BLOCKS[0]).name,
    gateStatus: {
      fear_gate: current >= 5 ? 'passed' : current === 4 ? 'approaching' : 'not_reached'
    }
  };
}

// ── CLI (node coaching-engine.js seeds|extract|proposals|rules) ──────────

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(path.join(HOME, 'nanoclaw', 'coaching-engine.js'));
if (isDirectRun) {
  const cmd = process.argv[2];
  if (cmd === 'seeds') console.log(JSON.stringify(loadVaultSeeds(), null, 2));
  else if (cmd === 'extract') console.log(JSON.stringify(await extractPatterns(parseInt(process.argv[3], 10) || 3), null, 2));
  else if (cmd === 'proposals') console.log(JSON.stringify(getPendingProposals(), null, 2));
  else if (cmd === 'rules') console.log(JSON.stringify(getRules({ status: process.argv[3] || 'approved' }), null, 2));
  else if (cmd) console.log('Unknown command. Use: seeds | extract [minObs] | proposals | rules [status]');
}
