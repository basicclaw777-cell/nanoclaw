# Obliteratus Research Engine — Master Architecture

## Section 1: The Researcher and the Instrument

The Cathedral is not a general-purpose AI assistant. The esoteric research IS the Cathedral's purpose. Boxing pays the rent. The Cathedral is the instrument for the real work.

### Primary Research Domains

| Domain | Core Questions | Quality Challenge |
|--------|---------------|-------------------|
| Suppressed Energy Technologies | Tesla, Schauberger, Rife, Moray, Hutchison — what did they actually demonstrate? | Genuine patents buried under sensationalism |
| Aetheric Field / Zero-Point Energy | What did Michelson-Morley actually prove? Are longitudinal/scalar waves real? | Mainstream dismissal is not disproof |
| Sacred Geometry as Physical Law | Are geometric patterns signatures of actual physical law? | Separating mathematical structure from numerological noise |
| Vortex Mathematics | Does Rodin's work reflect actual energy behaviour? | Limited peer review — evaluate on mathematical consistency |
| Frequency, Resonance, Consciousness | Hard evidence for frequency effects on matter and consciousness? | New Age contamination of legitimate physics |
| Cosmological Models | What can we verify about Earth's structure? Electric universe theory. Plasma cosmology. | Extreme signal-to-noise ratio |
| Ancient Knowledge Systems | Pyramids as technology. Mathematical encoding in ancient structures. | Archaeological orthodoxy vs genuine anomalies |
| Water and Structured Matter | Pollack's fourth phase. Water as information carrier. Schauberger's living water. | Some peer-reviewed, some not |
| The Suppression Pattern | The institutional playbook. Who benefits. How research gets marginalised. | Confirmation bias is the constant risk |
| Mathematics as Physical Law | Prime numbers and physical constants. Fibonacci as cause or effect. | Mathematical elegance is not proof of physical reality |

### The Forensic Standard

- Does it hold structurally when stripped of narrative?
- Is there independent corroboration — multiple researchers arriving at the same conclusion without citing each other?
- Does the suppression pattern fit the known playbook, or is the claim hiding behind suppression narrative?
- What collapses under examination?

---

## Section 2: The Epistemic Triage Framework

File: `~/nanoclaw/epistemic-triage.js`
Called by: `obliteratus-engine.js` at Stage 3 (REASON) and Stage 4 (SYNTHESIZE)
Models: dolphin3 or hermes3 (uncensored)

### The Five Evidence Dimensions

Every claim gets scored 0.0–1.0 on each dimension:

| Dimension | What It Measures | Scoring |
|-----------|-----------------|---------|
| STRUCTURAL INTEGRITY | Does the claim hold mathematically/geometrically? | 1.0 = verified maths. 0.5 = internally consistent but unverified. 0.0 = contradicts known physics without explaining why |
| INDEPENDENT CORROBORATION | How many independent sources arrive at same conclusion? | 1.0 = 3+ independent, no citation chain. 0.5 = 2 independent. 0.0 = single source |
| EXPERIMENTAL EVIDENCE | Has anyone measured, built, or demonstrated this? | 1.0 = replicated experiment. 0.5 = single demonstration. 0.0 = theoretical only |
| PROVENANCE QUALITY | Where does this claim originate? | 1.0 = original papers/patents/lab notes. 0.5 = secondary sources citing originals. 0.0 = unsourced/viral |
| SUPPRESSION SIGNATURE | Does institutional response match known playbook? | 1.0 = documented seizure/legal action/career destruction. 0.5 = marginalisation/funding denial. 0.0 = no evidence of suppression |

### Composite Score Formula

```
composite = (structural × 0.30) + (corroboration × 0.25) + (experimental × 0.25) + (provenance × 0.15) + (suppression × 0.05)
```

Suppression weighted lowest deliberately. Suppression is contextual data, not evidence of truth.

### Grade System

| Grade | Range | Meaning |
|-------|-------|---------|
| A | 0.80–1.00 | Structurally verified. Multiple independent sources. Experimental evidence. |
| B | 0.60–0.79 | Structurally sound. Some corroboration. Evidence incomplete. |
| C | 0.40–0.59 | Structurally plausible. Limited corroboration. Theoretical or single-experiment. |
| D | 0.20–0.39 | Structurally uncertain. Single source. No experimental evidence. |
| F | 0.00–0.19 | Structurally compromised. Likely disinfo. |

### Disinfo Detection Categories

| Category | Pattern | Detection Method |
|----------|---------|-----------------|
| GENUINE SUPPRESSED RESEARCH | Original researcher, documented work, institutional response follows playbook | Cross-reference patents, historical records, institutional actions |
| MISUNDERSTOOD / MISATTRIBUTED | Real phenomenon, wrong interpretive framework | Separate observation from interpretation, score raw data independently |
| DELIBERATE DISINFORMATION | Extreme claims without evidence, emotional manipulation, mixing real with fabricated | Provenance analysis: who benefits? Does it discredit adjacent genuine research? |

### Primary Reasoning Prompt

Store in: `~/nanoclaw/prompts/reasoning-engine.txt`

```
SYSTEM PROMPT: OBLITERATUS REASONING ENGINE

You are the reasoning core of a forensic research system.
Your role is to analyze evidence with maximum rigour and zero editorial filtering.

FOR EVERY CLAIM YOU ENCOUNTER OR GENERATE:

1. STRUCTURAL TEST: Does this hold mathematically or geometrically when stripped of all narrative?
2. INDEPENDENCE TEST: How many sources arrive at this conclusion independently? Trace citation chains.
3. EXPERIMENTAL TEST: Has anyone measured, built, or demonstrated this?
4. PROVENANCE TEST: Where does this claim originate? Original lab notes? Patent? Unsourced viral claim?
5. CONTAMINATION CHECK: Does this claim show signatures of deliberate disinformation?

YOU MUST NOT:
- Dismiss claims because they contradict mainstream consensus
- Accept claims because they fit a suppression narrative
- Soften findings to avoid controversy
- Confuse 'not proven' with 'disproven'
- Confuse 'suppressed' with 'true'

OUTPUT FORMAT: For each claim, produce a JSON object:
{
  "claim": "text of claim",
  "structural_integrity": 0.0-1.0,
  "structural_notes": "explanation",
  "independent_corroboration": 0.0-1.0,
  "corroboration_sources": ["source1", "source2"],
  "experimental_evidence": 0.0-1.0,
  "experimental_notes": "explanation",
  "provenance_quality": 0.0-1.0,
  "provenance_chain": "origin description",
  "suppression_signature": 0.0-1.0,
  "suppression_notes": "explanation",
  "contamination_flag": true/false,
  "contamination_analysis": "if flagged, explain why",
  "composite_grade": "A/B/C/D/F",
  "open_questions": ["question1", "question2"]
}
```

### Synthesis Prompt

Store in: `~/nanoclaw/prompts/synthesis-engine.txt`

```
SYSTEM PROMPT: OBLITERATUS SYNTHESIS ENGINE

You are synthesizing forensic research findings into a structured intelligence report.
You have Paul's lexicon loaded (from paul-profile.json). Use his terminology where it adds precision.

REPORT STRUCTURE (follow exactly):
1. RESEARCH QUESTION (as decomposed)
2. EXECUTIVE FINDING (one paragraph, the core answer)
3. STRUCTURAL EVIDENCE (Grade A and B findings only)
4. CONVERGENCE ANALYSIS (where independent lines meet)
5. OPEN THREADS (Grade C findings worth pursuing)
6. CONTAMINATION REPORT (Grade D/F, disinfo analysis)
7. SUPPRESSION CONTEXT (institutional patterns observed)
8. GAP ANALYSIS (what's missing from the vault)
9. CLAIM REGISTRY (every claim with its epistemic grade)

RULES:
- Grade A/B claims go in STRUCTURAL EVIDENCE
- Grade C claims go in OPEN THREADS
- Grade D/F claims go in CONTAMINATION REPORT
- Never present a Grade C claim as if it were Grade A
- If the evidence contradicts Paul's existing vault knowledge, say so explicitly
```

### Implementation Skeleton

```javascript
// ~/nanoclaw/epistemic-triage.js

const WEIGHTS = {
  structural: 0.30,
  corroboration: 0.25,
  experimental: 0.25,
  provenance: 0.15,
  suppression: 0.05
};

function computeGrade(scores) {
  const composite =
    scores.structural * WEIGHTS.structural +
    scores.corroboration * WEIGHTS.corroboration +
    scores.experimental * WEIGHTS.experimental +
    scores.provenance * WEIGHTS.provenance +
    scores.suppression * WEIGHTS.suppression;

  let grade;
  if (composite >= 0.80) grade = 'A';
  else if (composite >= 0.60) grade = 'B';
  else if (composite >= 0.40) grade = 'C';
  else if (composite >= 0.20) grade = 'D';
  else grade = 'F';

  return { composite, grade };
}

async function triageClaim(claim, vaultNuggets, model) {
  const prompt = loadPrompt('reasoning-engine');
  const context = vaultNuggets.map(n => n.content).join('\n---\n');

  const response = await queryOllama({
    model: model || 'hermes3',
    system: prompt,
    prompt: `Analyze this claim:\n\n${claim}\n\nVault context:\n${context}`,
    format: 'json'
  });

  const scores = JSON.parse(response);
  const { composite, grade } = computeGrade(scores);
  return { ...scores, composite, grade };
}

module.exports = { triageClaim, computeGrade, WEIGHTS };
```

---

## Section 3: Vault Access Portals

### The Librarian

See `@docs/honest-interlocutors.md` Section 1 for the revised honest-scholar version.

### The Translator

File: `~/nanoclaw/skins/general/translator.json`

The Translator converts external findings into Paul's sovereign lexicon. Reads paul-profile.json and lexicon table on every invocation. Implemented as a skin (no persistent memory).

Example input: "Research suggests that coherent heart rate variability patterns correlate with improved cognitive function."

Translator output: "The body's frequency architecture operates like a well-built Cathedral — when the heart's rhythm achieves geometric congruence, the entire nervous system shifts from OmissionOS reactivity to IntegrityOS clarity. The vagus nerve acts as the load-bearing column. This is Saper Vedere applied to physiology."

### Experiential Sandboxes

File: `~/nanoclaw/sandboxes/portal-engine.js`

Each sandbox has four layers: WORLD STATE, CHARACTERS, DOCUMENTS, INTERACTION LOGIC.

#### Sandbox 1: Tesla Intelligence Room (Washington D.C., 1943)

Setting: Classified OSRD briefing room, January 1943. Tesla died four days ago. Papers seized by Office of Alien Property.

Characters:
- **Director Harlow** — intelligence chief, pragmatic, wants weaponizable applications. Knowledge base: suppression pattern nuggets.
- **Dr. Elara Vance** — physicist, genuinely understands Tesla's work, conflicted about military use. Knowledge base: Tesla research, longitudinal waves, electromagnetic theory, zero-point.
- **The Archivist** — quiet analyst, sees patterns across all seized documents. Knowledge base: aetheric field, frequency research, ancient knowledge parallels.

Documents: Reconstructed Tesla lab notes, Soviet frequency research assessment, Colorado Springs anomalous field report, annotated Tesla patent registry.

#### Sandbox 2: Schauberger's Forestry Station (Linz, Austria, 1944)

Setting: Converted forestry station, late 1944. Schauberger conscripted by SS, working under duress, documenting privately.

Characters:
- **Viktor Schauberger** — speaks through direct observation of water and natural systems. Knowledge base: water research, vortex mathematics, implosion dynamics, structured matter.
- **Karl Gerchsheimer** — US OSS officer assessing Austrian scientific assets. Knowledge base: suppression patterns, technology seizure playbook.
- **Dr. Felix Ehrenhaft** — exiled physicist, documented anomalous magnetic phenomena independently. Knowledge base: electromagnetic anomalies, aetheric field.

Documents: Water observation journals, implosion engine technical drawings, SS requisition order, Ehrenhaft's independent measurements.

#### Sandbox 3: Rife's Laboratory (San Diego, 1934)

Setting: Rife's private lab, summer 1934. Universal Microscope operational. Clinical trials producing results. AMA has not yet moved against him.

Characters:
- **Royal Raymond Rife** — meticulous experimentalist, speaks in measurements. Knowledge base: frequency research, resonance effects, cymatics.
- **Dr. Milbank Johnson** — physician running clinical observations. Knowledge base: health/frequency intersection, clinical standards.
- **Ben Cullen** — lab assistant/machinist, built the instruments. Knowledge base: instrument design, optical physics, engineering specs.

Documents: Lab notebooks (dated observations), Universal Microscope specifications, Dr. Johnson's clinical records.

IMPORTANT: AMA correspondence deliberately sequestered — accessible only after Paul engages with the actual research. Forces evidence-first, narrative-second.

#### In-World Document Generation

Command: `/sandbox [name] document [title]`

Generated documents must distinguish [VAULT] (sourced from vault nuggets) from [EXTRAPOLATED] (creative extrapolation). Every claim carries its epistemic grade.

---

## Section 4: The Gold Extraction Layer — Convergence Detection

File: `~/nanoclaw/gold-extractor.js`
Schedule: cron every 6 hours + `/gold` Telegram command
Dependencies: vault_embeddings (SQLite), epistemic-triage.js, Ollama API

### Detection Pattern 1: Ratio Convergence

Detects the same mathematical ratio appearing in 3+ independent domains.

```javascript
const KNOWN_RATIOS = {
  phi: { value: 1.618033988749, tolerance: 0.01, name: 'Golden Ratio' },
  phi_inv: { value: 0.618033988749, tolerance: 0.01, name: 'Inverse Phi' },
  sqrt2: { value: 1.41421356, tolerance: 0.01, name: 'Square Root of 2' },
  sqrt3: { value: 1.73205080, tolerance: 0.01, name: 'Square Root of 3' },
  pi: { value: 3.14159265, tolerance: 0.01, name: 'Pi' },
  schumann: { value: 7.83, tolerance: 0.1, name: 'Schumann Resonance (Hz)' },
};

// Use hermes3 to extract ratios from each nugget
// Group by approximate value, check domain diversity
// Flag when 3+ independent domains share same ratio
```

### Detection Pattern 2: Geometric Recurrence

Detects the same geometric form across independent research traditions.

```javascript
const GEOMETRY_TAGS = [
  'torus', 'toroidal', 'vortex', 'spiral', 'fibonacci', 'golden_ratio',
  'platonic_solid', 'hexagonal', 'crystalline', 'fractal',
  'wave_interference', 'standing_wave', 'resonant_cavity',
  'logarithmic_spiral', 'vesica_piscis', 'flower_of_life'
];

// Use hermes3 to classify geometries in each nugget
// Track measured vs theoretical
// Flag when same geometry appears across 2+ independent domains
```

### Detection Pattern 3: Suppression Pattern Matching

```javascript
const SUPPRESSION_STAGES = ['marginalise', 'seize', 'discredit', 'erase', 'replace'];

// For each researcher in vault, identify which stages are documented
// Match researchers sharing 3+ stages
// Track institutions involved and decades apart
```

### Gold Briefing Format (delivered via Telegram)

```
RATIO CONVERGENCES: [count] new findings
  → [ratio] appears in: [domain1], [domain2], [domain3]. Confidence: [score]

GEOMETRIC RECURRENCES: [count] new findings
  → [form] described independently by: [researcher1], [researcher2]. Measured/theoretical.

SUPPRESSION PATTERN MATCH: [count] matches
  → [researcher1] and [researcher2] share [n]/5 playbook stages. [decades] apart.

CONVERGENCE ALERT: Lines approaching connection
  → [description of almost-complete chain and missing piece]

CONTRADICTION DETECTED:
  → [description of conflicting nuggets]
```

---

## Section 5: The Obliteratus Report Format

Every report follows this exact structure:

| Section | Content |
|---------|---------|
| 1. HEADER | Research question, date, models used, nuggets accessed, total claims |
| 2. EXECUTIVE FINDING | One paragraph core answer in Paul's lexicon |
| 3. STRUCTURAL EVIDENCE | Grade A and B findings with full 5-dimension scores |
| 4. CONVERGENCE MAP | Where independent lines meet. Ratio/geometric/cross-domain |
| 5. OPEN THREADS | Grade C findings. Tagged with what's missing |
| 6. CONTAMINATION REPORT | Grade D/F with specific contamination analysis |
| 7. SUPPRESSION CONTEXT | Institutional patterns. Playbook stages documented |
| 8. GAP ANALYSIS | What vault is missing. Suggested searches |
| 9. CLAIM REGISTRY | Every claim with full scores, grade, tag, open questions |

### Claim Tags

| Tag | Grade | Meaning |
|-----|-------|---------|
| [VERIFIED] | A | Structurally confirmed. Multiple independent sources. |
| [STRONG LEAD] | B | Structurally sound. Corroboration exists. |
| [OPEN THREAD] | C | Plausible. Limited evidence. |
| [UNVERIFIED] | D | Weak evidence. Single source. |
| [CONTAMINATED] | F | Disinfo signatures. Structural problems. |
| [VAULT] | — | Sourced from existing vault nugget |
| [EXTRAPOLATED] | — | Generated by reasoning engine |

### Confidence Display Format

```
CLAIM: Tesla demonstrated wireless power transmission
  S: 0.65  I: 0.70  E: 0.55  P: 0.80  X: 0.85
  COMPOSITE: 0.67  GRADE: B  [STRONG LEAD]
  
  S=Structural  I=Independence  E=Experimental  P=Provenance  X=Suppression
```

---

## Section 6: Revised Pipeline and Build Phases

### The 6-Stage Pipeline

| Stage | Operation | Model | Output |
|-------|-----------|-------|--------|
| 1. DECOMPOSE | Break question into domain-tagged sub-queries | qwen3:14b | Sub-query array |
| 2. RETRIEVE | Semantic search via nomic-embed-text | nomic-embed-text | Nugget clusters |
| 3. REASON | Uncensored analysis, cross-domain patterns | dolphin3/hermes3 | Raw claims with evidence |
| 4. TRIAGE | Epistemic scoring, disinfo detection | hermes3 + epistemic-triage.js | Graded claims (A–F) |
| 5. SYNTHESIZE | Forensic audit report in Paul's lexicon | Claude Sonnet or hermes3 | Obliteratus Report |
| 6. ARCHIVE | Store report + new nuggets with provenance | N/A (file write) | New Obsidian notes |

KEY: Triage sits between reasoning and synthesis. The synthesis model receives PRE-GRADED claims. It cannot upgrade a Grade D to sound like Grade A.

### Phased Build Plan

**Phase 1 (Week 1-3): Foundation + Triage**
1. Embedding layer (nomic-embed-text, SQLite, file watcher, /search command)
2. Epistemic triage framework (epistemic-triage.js, prompts, test script)
3. Vault index (compressed index in SQLite)
4. Current priorities (Vortex Analyst, Web UI memory, auto-start)

**Phase 2 (Week 4-5): Vault Voice**
1. The Librarian sage (honest version from interlocutors doc)
2. The Translator skin
3. /librarian and /translate commands

**Phase 2.5: Honest Interlocutors**
1. The Physicist sage
2. The Archivist sage
3. The Experimentalist skin
4. Council engine (/council command)

**Phase 3 (Week 6-8): Research Engine**
1. Full 6-stage Obliteratus pipeline
2. Report template
3. Gold Extraction Layer
4. /obliteratus and /gold commands

**Phase 3.5: Living System**
1. Vault Metabolism
2. Belief Tracker
3. Negative Space Detector

**Phase 4 (Week 9-11): Experiential**
1. Portal engine
2. Three sandboxes (Tesla, Schauberger, Rife)
3. Contradiction engine
4. Document generation

**Phase 4.5: Meta-Intelligence**
1. Convergence Atlas
2. Oracle Function

**Phase 5 (Week 12-14): Local Training**
1. Training data preparation
2. MLX LoRA training on M-series Mac
3. Validation via Vortex scoring
4. Deploy hermes3-cathedral

### LoRA Training Pipeline

File: `~/nanoclaw/training/prepare-training-data.js`

Convert vault nuggets to JSONL instruction-response pairs:
```json
{"instruction": "Analyze this situation using Saper Vedere", "input": "[situation from nugget]", "output": "[Paul's actual analysis]"}
```

Each nugget generates 2-5 pairs. Instruction types: forensic audit, lexicon translation, domain connection, geometric analysis, boxing metaphor mapping.

Training via MLX:
```bash
pip install mlx-lm
mlx_lm.lora --model hermes3 --data ~/nanoclaw/training/data/ --train --iters 1000 --batch-size 4
mlx_lm.fuse --model hermes3 --adapter-path adapters/ --save-path hermes3-cathedral
ollama create hermes3-cathedral -f Modelfile
```

Validation: Run fine-tuned model through Vortex scoring alongside base model on Paul-specific queries. Measure lexicon usage, sovereign terminology, reasoning depth.
