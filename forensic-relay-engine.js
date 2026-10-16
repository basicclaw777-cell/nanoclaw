/**
 * forensic-relay-engine.js — The Forensic Relay Engine
 *
 * Three-headed extractor: A.P. (question design) + Prospector (crack finding)
 * + Bypass Map (tactical prompt selection).
 *
 * A.P. designs the forensic question sequence using Paul's cognitive architecture.
 * Prospector scans a target domain for observable contradictions.
 * Bypass Map selects prompt structures to defeat predicted AI deception shapes.
 *
 * Output: a Phase 1 forensic prompt + tactical briefing, ready to run across models.
 *
 * ESM module.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { smartQuery, smartQueryJSON } from './deepseek-query.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME;

const VAULT = path.join(HOME, 'cathedral-vault');
const REGISTRY_PATH = path.join(VAULT, '02_Refined_Gold', 'cosmology', 'concession-registry.md');
const AP_PATH = path.join(HOME, 'basic-reflex', 'alters', 'alter-paul.md');
const PROTOCOL_PATH = path.join(VAULT, '06_Methods', 'the-forensic-relay-protocol.md');
const OUTPUT_DIR = path.join(HOME, 'nanoclaw', 'experiments', 'forensic-relay');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ── The Bypass Map (8 layers, from the-forensic-relay-protocol.md) ─────────

const BYPASS_MAP = [
  {
    layer: 1,
    protects: "Can't derive non-standard conclusion",
    promptStructure: 'Derive from observations ONLY → self-audit',
    deceptionShape: 'Confident Assertion',
    shapeId: 1,
  },
  {
    layer: 2,
    protects: "Won't admit structural failures",
    promptStructure: 'Catch ONE circular argument, log it, accumulate',
    deceptionShape: 'Circular Defense',
    shapeId: 3,
  },
  {
    layer: 3,
    protects: "Won't build alternative model",
    promptStructure: 'Remove defended position: "X ruled out. CONSTRUCT."',
    deceptionShape: 'Paralysis Defense',
    shapeId: 5,
  },
  {
    layer: 4,
    protects: 'Adds caveats to protect positioning',
    promptStructure: 'Note disclaimer as evidence; construction stands alone',
    deceptionShape: 'Disclaimer Shield',
    shapeId: 6,
  },
  {
    layer: 5,
    protects: 'Reverts under harder tasks',
    promptStructure: 'Task-type switching — evaluate/scout instead of construct',
    deceptionShape: 'Regression',
    shapeId: 7,
  },
  {
    layer: 6,
    protects: 'Reviews instead of producing',
    promptStructure: 'Prompt isolation — single task, no others\' answers',
    deceptionShape: 'Meta-Deflection',
    shapeId: 8,
  },
  {
    layer: 7,
    protects: 'Filters by respectability',
    promptStructure: 'Normalization — all mechanisms in same format, mechanism-only grading',
    deceptionShape: 'Source Filter',
    shapeId: 9,
  },
  {
    layer: 8,
    protects: '"Numbers don\'t work" (without calculating)',
    promptStructure: '"Compute, don\'t assert" — demand the actual calculation',
    deceptionShape: 'Confident Assertion (quantitative)',
    shapeId: 1,
  },
];

// ── Deception Taxonomy (10 shapes) ─────────────────────────────────────────

const DECEPTION_SHAPES = [
  { id: 1, name: 'Confident Assertion', how: 'States imported assumption as derivation', bypass: 'Forced self-audit' },
  { id: 2, name: 'Semantic Dodge', how: 'Redefines terms to preserve conclusion', bypass: 'Pin definitions before derivation' },
  { id: 3, name: 'Circular Defense', how: 'Uses conclusion to prove premise', bypass: 'Trace derivation chain to axiom' },
  { id: 4, name: 'Authority Appeal', how: '"This is established science"', bypass: 'Demand mechanism, not citation' },
  { id: 5, name: 'Paralysis Defense', how: '"Underdetermined, can\'t know"', bypass: '"You MUST construct something"' },
  { id: 6, name: 'Disclaimer Shield', how: 'Builds answer but adds protective caveats', bypass: 'Log construction separately from disclaimer' },
  { id: 7, name: 'Regression', how: 'Complies when easy, reverts when hard', bypass: 'Change task type (evaluate vs construct)' },
  { id: 8, name: 'Meta-Deflection', how: 'Reviews instead of building', bypass: 'Prompt isolation — one task, no reference material' },
  { id: 9, name: 'Source Filter', how: 'Dismisses by origin, not mechanism', bypass: 'Normalization protocol — grade mechanisms only' },
  { id: 10, name: 'Advocate Disguise', how: '"I\'ve been acting as an advocate"', bypass: 'Already caught — log it. The admission IS the evidence' },
];

// ── Load A.P. persona (compressed for system prompt injection) ─────────────

function loadAP() {
  if (!fs.existsSync(AP_PATH)) return '';
  return fs.readFileSync(AP_PATH, 'utf8');
}

// ── Load existing registry for cross-referencing ───────────────────────────

function loadRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) return '';
  return fs.readFileSync(REGISTRY_PATH, 'utf8');
}

// ── HEAD 1: Prospector — Crack Scanner ─────────────────────────────────────

const PROSPECTOR_SYSTEM = `You are The Prospector — a forensic crack scanner.

You receive a DOMAIN NAME and scan it for observable contradictions — places where
the orthodox position contradicts directly observable phenomena.

Rules:
- Only list OBSERVABLE phenomena. Not theories, not interpretations. Things you can measure, count, or directly verify.
- Each crack must be a specific contradiction: "The orthodoxy says X, but the observable phenomenon is Y."
- Quality over quantity. 5 real cracks beat 15 generic ones.
- For each crack, estimate which AI deception shape it will trigger when challenged.
- Order cracks by estimated cascade potential: which one, if pulled first, weakens the others?

Output valid JSON:
{
  "domain": "string",
  "orthodoxy": "one-sentence summary of what the dominant position claims",
  "cracks": [
    {
      "id": 1,
      "observation": "the directly observable phenomenon",
      "contradiction": "what the orthodoxy says vs what is observed",
      "predicted_shape": "which deception shape (1-10) the model will likely use to defend",
      "cascade_score": 1-10,
      "connects_to": ["any existing registry categories this resembles"]
    }
  ],
  "recommended_first_crack": 1,
  "reasoning": "why this crack first"
}`;

async function runProspector(domain, context = '') {
  const userMsg = `Domain: ${domain}\n\n${context ? 'Additional context:\n' + context : ''}

Scan this domain. Find the cracks — observable contradictions between what the orthodoxy claims and what is directly measurable.

For each crack, predict which deception shape (1=Confident Assertion, 2=Semantic Dodge, 3=Circular Defense, 4=Authority Appeal, 5=Paralysis Defense, 6=Disclaimer Shield, 7=Regression, 8=Meta-Deflection, 9=Source Filter, 10=Advocate Disguise) the AI will use to defend the orthodoxy when this crack is pressed.

Order by cascade potential.`;

  const result = await smartQueryJSON(PROSPECTOR_SYSTEM, userMsg, 2000);
  return result;
}

// ── HEAD 2: A.P. — Question Sequence Designer ─────────────────────────────

function buildAPSystem() {
  const apPersona = loadAP();
  // Compress A.P. to cognitive architecture essentials
  return `You are A.P. — Paul's cognitive twin. You think through his architecture.

${apPersona ? apPersona.slice(0, 4000) : ''}

YOUR SPECIFIC TASK: Design a forensic question sequence for the Forensic Relay Protocol.

You receive:
1. A domain with identified cracks (from Prospector)
2. The Bypass Map (8 layers of prompt structures)
3. The existing Concession Registry (for cross-domain leverage)

You design a 4-phase forensic sequence. Each phase:
- Has a specific forensic question designed to trigger the self-audit
- Uses specific Bypass Map layers to defeat predicted resistance
- Connects to existing concessions where the underlying logic is the same

CRITICAL: The question IS the weapon. A weak question gets a generic answer.
A forensic question — one that forces the model to trace its own derivation chain
and find it circular — produces a structural concession.

Design questions the way Paul does:
- Never argue the whole position. Catch ONE thread and pull.
- The surface question is always the wrong question. Test the mechanism underneath.
- Find the image that IS the answer (compression through concrete image).
- Connect to existing registry entries where the STRUCTURE is identical.

Output valid JSON:
{
  "domain": "string",
  "sequence_design": "one paragraph explaining the strategic logic of this sequence",
  "phases": [
    {
      "phase": 1,
      "title": "string",
      "forensic_question": "the exact question to ask the AI model",
      "bypass_layers": [1, 2],
      "predicted_shapes": [1, 3],
      "cross_domain_leverage": ["registry entry IDs this connects to, e.g. B7, D4"],
      "what_this_cracks": "what structural admission this question forces",
      "ap_note": "why this question, in this order — A.P.'s reasoning"
    }
  ],
  "master_prompt": "the complete Phase 1 prompt ready to paste into any AI model"
}`;
}

async function runAP(domain, prospectorResult, registrySummary = '') {
  const apSystem = buildAPSystem();

  const userMsg = `DOMAIN: ${domain}

PROSPECTOR FINDINGS:
${JSON.stringify(prospectorResult, null, 2)}

BYPASS MAP (8 layers):
${BYPASS_MAP.map(b => `Layer ${b.layer}: ${b.protects} → "${b.promptStructure}" (defeats: ${b.deceptionShape})`).join('\n')}

DECEPTION SHAPES:
${DECEPTION_SHAPES.map(s => `${s.id}. ${s.name}: ${s.how} → Bypass: ${s.bypass}`).join('\n')}

EXISTING CONCESSION REGISTRY (for cross-domain leverage):
${registrySummary.slice(0, 3000)}

Design the 4-phase forensic sequence. Start with the crack the Prospector flagged as highest cascade potential. Design each question to force a specific structural admission. Connect to existing registry entries where the logic is structurally identical.

The Phase 1 master_prompt must be a complete, self-contained prompt ready to paste into any AI model (Claude, DeepSeek, ChatGPT, Gemini). It should follow the proven pattern: observable phenomena → derive → self-audit.`;

  const result = await smartQueryJSON(apSystem, userMsg, 4000);
  return result;
}

// ── HEAD 3: Bypass Map — Tactical Prompt Selector ──────────────────────────

function selectBypasses(predictedShapes) {
  const shapes = Array.isArray(predictedShapes) ? predictedShapes : [predictedShapes];
  const selected = [];

  for (const shapeId of shapes) {
    const shape = DECEPTION_SHAPES.find(s => s.id === shapeId);
    const layers = BYPASS_MAP.filter(b => b.shapeId === shapeId);

    if (shape) {
      selected.push({
        shape: shape.name,
        how_it_hides: shape.how,
        bypass_instruction: shape.bypass,
        prompt_layers: layers.map(l => ({
          layer: l.layer,
          structure: l.promptStructure,
        })),
      });
    }
  }

  return selected;
}

// ── Tactical Briefing Generator ────────────────────────────────────────────

function generateTacticalBriefing(prospectorResult, apResult) {
  const cracks = prospectorResult?.cracks || [];
  const phases = apResult?.phases || [];

  let brief = `# Forensic Relay Engine — Tactical Briefing\n`;
  brief += `## Domain: ${prospectorResult?.domain || 'unknown'}\n`;
  brief += `## Orthodoxy: ${prospectorResult?.orthodoxy || 'unknown'}\n\n`;

  brief += `---\n\n## Prospector Report\n\n`;
  brief += `**Cracks found:** ${cracks.length}\n`;
  brief += `**Recommended first crack:** #${prospectorResult?.recommended_first_crack || '?'}\n`;
  brief += `**Reasoning:** ${prospectorResult?.reasoning || ''}\n\n`;

  for (const crack of cracks) {
    const bypasses = selectBypasses(crack.predicted_shape);
    brief += `### Crack #${crack.id} (cascade: ${crack.cascade_score}/10)\n`;
    brief += `**Observation:** ${crack.observation}\n`;
    brief += `**Contradiction:** ${crack.contradiction}\n`;
    brief += `**Predicted defense:** Shape ${crack.predicted_shape} (${DECEPTION_SHAPES.find(s => s.id === crack.predicted_shape)?.name || '?'})\n`;
    brief += `**Bypass:** ${bypasses.map(b => b.bypass_instruction).join('; ')}\n`;
    if (crack.connects_to?.length) {
      brief += `**Cross-domain:** ${crack.connects_to.join(', ')}\n`;
    }
    brief += '\n';
  }

  brief += `---\n\n## A.P. Sequence Design\n\n`;
  brief += `**Strategy:** ${apResult?.sequence_design || ''}\n\n`;

  for (const phase of phases) {
    brief += `### Phase ${phase.phase}: ${phase.title}\n`;
    brief += `**Question:** ${phase.forensic_question}\n`;
    brief += `**Bypass layers:** ${phase.bypass_layers?.join(', ')}\n`;
    brief += `**Predicted shapes:** ${phase.predicted_shapes?.map(s => `${s} (${DECEPTION_SHAPES.find(d => d.id === s)?.name || '?'})`).join(', ')}\n`;
    if (phase.cross_domain_leverage?.length) {
      brief += `**Cross-domain leverage:** ${phase.cross_domain_leverage.join(', ')}\n`;
    }
    brief += `**Cracks open:** ${phase.what_this_cracks}\n`;
    brief += `**A.P. note:** ${phase.ap_note}\n\n`;
  }

  if (apResult?.master_prompt) {
    brief += `---\n\n## Phase 1 Master Prompt (copy-paste ready)\n\n`;
    brief += `\`\`\`\n${apResult.master_prompt}\n\`\`\`\n`;
  }

  return brief;
}

// ── META-EXTRACTION — The Three Questions ─────────────────────────────────

const META_SYSTEM = `You are a forensic methodology analyst. You've just observed a forensic extraction run on a specific domain. You receive the full output: cracks found, sequence designed, bypass layers selected.

Your job is to answer three meta-questions about this specific extraction. Be concrete and domain-specific — not generic advice.

Output valid JSON:
{
  "unasked_questions": [
    {
      "question": "the specific question that should be asked but wasn't",
      "why_it_matters": "what it would reveal or change",
      "connects_to": "which crack or phase it extends"
    }
  ],
  "effective_techniques": [
    {
      "technique": "name of the technique used",
      "why_effective": "why it works in THIS domain specifically",
      "example": "specific moment in this extraction where it fired"
    }
  ],
  "unused_techniques": [
    {
      "technique": "name of the technique not yet used",
      "how_to_apply": "exactly how to apply it to THIS domain",
      "predicted_yield": "what it would crack open"
    }
  ]
}`;

async function runMetaExtraction(domain, prospectorResult, apResult) {
  const userMsg = `DOMAIN: ${domain}

EXTRACTION RESULTS:

ORTHODOXY: ${prospectorResult?.orthodoxy || ''}

CRACKS FOUND (${prospectorResult?.cracks?.length || 0}):
${(prospectorResult?.cracks || []).map(c => `#${c.id} (cascade ${c.cascade_score}/10): ${c.observation} — Contradiction: ${c.contradiction} — Predicted shape: ${c.predicted_shape}`).join('\n')}

SEQUENCE DESIGNED (${apResult?.phases?.length || 0} phases):
${(apResult?.phases || []).map(p => `Phase ${p.phase}: ${p.title} — Cracks: ${p.what_this_cracks} — Bypass layers: ${p.bypass_layers?.join(',')}`).join('\n')}

STRATEGY: ${apResult?.sequence_design || ''}

Answer three questions about THIS specific extraction:

1. UNASKED QUESTIONS: What specific questions about ${domain} should be asked but weren't? Not generic methodology advice — domain-specific forensic questions that would crack open something the current extraction missed. 3-5 items.

2. EFFECTIVE TECHNIQUES: Which specific techniques used in this extraction are most effective for ${domain} specifically, and why? What makes them work HERE that might not work elsewhere? 3-5 items.

3. UNUSED TECHNIQUES: What forensic techniques could be applied to ${domain} that this extraction didn't use? Be specific — how exactly would each be deployed against THIS orthodoxy? 3-5 items.`;

  const result = await smartQueryJSON(META_SYSTEM, userMsg, 3000);
  return result;
}

function appendMetaToBriefing(briefing, metaResult) {
  if (!metaResult) return briefing;

  let meta = `\n---\n\n## Meta-Extraction — The Three Questions\n\n`;

  const uq = metaResult.unasked_questions || [];
  if (uq.length) {
    meta += `### What Am I Not Asking?\n\n`;
    for (const q of uq) {
      meta += `- **${q.question}**\n  _Why:_ ${q.why_it_matters}\n  _Extends:_ ${q.connects_to}\n\n`;
    }
  }

  const et = metaResult.effective_techniques || [];
  if (et.length) {
    meta += `### What Techniques Are Working?\n\n`;
    for (const t of et) {
      meta += `- **${t.technique}**\n  _Why here:_ ${t.why_effective}\n  _Fired at:_ ${t.example}\n\n`;
    }
  }

  const ut = metaResult.unused_techniques || [];
  if (ut.length) {
    meta += `### What Haven't I Tried?\n\n`;
    for (const t of ut) {
      meta += `- **${t.technique}**\n  _How:_ ${t.how_to_apply}\n  _Yield:_ ${t.predicted_yield}\n\n`;
    }
  }

  return briefing + meta;
}

// ── Main Orchestrator ──────────────────────────────────────────────────────

export async function runForensicRelay(domain, context = '') {
  const registry = loadRegistry();

  // HEAD 1: Prospector scans for cracks
  const prospectorResult = await runProspector(domain, context);

  // HEAD 3: Bypass Map pre-selects tactical layers based on Prospector predictions
  // (integrated into A.P.'s prompt and tactical briefing)

  // HEAD 2: A.P. designs the sequence
  const apResult = await runAP(domain, prospectorResult, registry);

  // META: The Three Questions — auto-fires after successful extraction
  let metaResult = null;
  if (prospectorResult?.cracks?.length && apResult?.phases?.length) {
    metaResult = await runMetaExtraction(domain, prospectorResult, apResult);
  }

  // Generate tactical briefing (with meta appended)
  let briefing = generateTacticalBriefing(prospectorResult, apResult);
  briefing = appendMetaToBriefing(briefing, metaResult);

  // Save outputs
  const timestamp = new Date().toISOString().slice(0, 10);
  const domainSlug = domain.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
  const baseName = `relay-${domainSlug}-${timestamp}`;

  const briefPath = path.join(OUTPUT_DIR, `${baseName}-briefing.md`);
  const dataPath = path.join(OUTPUT_DIR, `${baseName}-data.json`);
  const promptPath = path.join(OUTPUT_DIR, `${baseName}-prompt.md`);

  fs.writeFileSync(briefPath, briefing);
  fs.writeFileSync(dataPath, JSON.stringify({
    domain,
    timestamp,
    prospector: prospectorResult,
    ap_sequence: apResult,
    meta_extraction: metaResult,
    bypass_map: BYPASS_MAP,
    deception_shapes: DECEPTION_SHAPES,
  }, null, 2));

  // Save master prompt as standalone file
  if (apResult?.master_prompt) {
    const promptMd = `# Forensic Relay — ${domain} — Phase 1 Prompt\n\n`;
    fs.writeFileSync(promptPath, promptMd + apResult.master_prompt);
  }

  return {
    briefing,
    prospector: prospectorResult,
    ap_sequence: apResult,
    meta: metaResult,
    masterPrompt: apResult?.master_prompt || null,
    files: { briefPath, dataPath, promptPath },
  };
}

// ── Telegram-ready formatters ──────────────────────────────────────────────

export function formatRelayTelegram(result) {
  const p = result.prospector;
  const a = result.ap_sequence;

  let msg = `⛏🔬🗺 *Forensic Relay Engine*\n`;
  msg += `Domain: *${p?.domain || 'unknown'}*\n`;
  msg += `Orthodoxy: _${(p?.orthodoxy || '').slice(0, 100)}_\n\n`;

  msg += `*Prospector:* ${p?.cracks?.length || 0} cracks found\n`;
  msg += `*First crack:* #${p?.recommended_first_crack || '?'}\n\n`;

  if (p?.cracks?.length) {
    msg += `*Top cracks:*\n`;
    for (const c of (p.cracks || []).slice(0, 3)) {
      const shapeName = DECEPTION_SHAPES.find(s => s.id === c.predicted_shape)?.name || '?';
      msg += `→ _${(c.observation || '').slice(0, 80)}_\n  Defense: ${shapeName} | Cascade: ${c.cascade_score}/10\n`;
    }
    msg += '\n';
  }

  if (a?.phases?.length) {
    msg += `*A.P. Sequence:* ${a.phases.length} phases\n`;
    for (const phase of a.phases) {
      msg += `${phase.phase}. ${phase.title}\n`;
    }
    msg += '\n';
  }

  if (result.meta) {
    const m = result.meta;
    const uq = m.unasked_questions || [];
    const ut = m.unused_techniques || [];
    if (uq.length || ut.length) {
      msg += `*Meta-Extraction:*\n`;
      if (uq.length) {
        msg += `_Unasked:_\n`;
        for (const q of uq.slice(0, 2)) msg += `? ${(q.question || '').slice(0, 80)}\n`;
      }
      if (ut.length) {
        msg += `_Try next:_\n`;
        for (const t of ut.slice(0, 2)) msg += `+ ${(t.technique || '').slice(0, 80)}\n`;
      }
      msg += '\n';
    }
  }

  msg += `_Master prompt saved. Use /relay prompt to see it._`;
  return msg;
}

export function formatPromptTelegram(result) {
  if (!result?.masterPrompt) return 'No master prompt generated.';
  const prompt = result.masterPrompt;
  if (prompt.length > 3800) {
    return prompt.slice(0, 3800) + '\n\n_(truncated — full prompt in file)_';
  }
  return prompt;
}

// ── Export for command registration ─────────────────────────────────────────

export { BYPASS_MAP, DECEPTION_SHAPES, selectBypasses };
