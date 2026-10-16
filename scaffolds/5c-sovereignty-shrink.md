# 5c — Sovereignty Shrink (Local Model Distillation)

## What
Pipeline that distills frontier model intelligence into local models. Frontier grades + generates training data → local model absorbs → validation confirms → deploy sovereign model. The "rent the frontier, own the accumulation" loop made literal.

## Why
Every rented API call is a dependency. The local model doesn't need to match frontier quality — it needs to handle the 80% of tasks that are routine (coaching diagnostics, taste gate checks, vault queries, basic analysis). Frontier handles the 20% that requires reasoning depth. Over time, the local layer grows and the rented share shrinks.

## Hardware Gate
- BLOCKED until M5 Mac Studio M5 Max 128GB (~Oct 2026)
- Current: M4 16GB — can run hermes3 (8B) but nothing larger
- Target: run 14B+ models with room for training + inference simultaneously
- Edge node (Pi5 + Hailo) is a SEPARATE future step — gym deployment, not this

## Pipeline Design

### Stage 1: Training Data Generation
```
Vault content (Refined Gold, Methods, Staging)
  → Frontier model (Claude/DeepSeek) generates instruction-response pairs
  → Quality filter (epistemic-triage scores, domain tags)
  → JSONL output: ~/nanoclaw/training/data/
```

### Stage 2: LoRA Training
```
Base model: hermes3 (or successor)
  → MLX LoRA fine-tune
  → Adapters: ~/nanoclaw/training/adapters/
  → Fused model: hermes3-cathedral
  → Modelfile → Ollama
```

### Stage 3: Validation
```
Hermes3-cathedral vs hermes3-base vs frontier
  → Same 50 Paul-specific queries
  → Scored on: lexicon usage, reasoning depth, domain accuracy
  → Vortex scoring (existing)
  → Must beat base on Paul-specific tasks by >20%
```

### Stage 4: Deployment
```
Ollama serve hermes3-cathedral
  → taste-gate.mjs switches local queries to distilled model
  → Frontier reserved for: reasoning, synthesis, novel research
  → Cost tracking: local vs rented split ratio
```

## Data Shapes

### Training Pair
```json
{
  "instruction": "Diagnose this student's boxing technique from their session data",
  "input": "{session metrics JSON}",
  "output": "{coaching output in Paul's voice}",
  "source": "vault:diagnostic-empathy",
  "quality_score": 0.85,
  "domain": "coaching"
}
```

### Validation Result
```json
{
  "query": "What does the Fear Gate model say about a student stuck at block 4?",
  "base_response": "...",
  "distilled_response": "...",
  "frontier_response": "...",
  "scores": {
    "lexicon_match": 0.8,
    "reasoning_depth": 0.6,
    "domain_accuracy": 0.9,
    "pauls_voice": 0.7
  },
  "winner": "distilled"
}
```

## Module Interface
```javascript
// training-pipeline.js — ESM
export async function generateTrainingData(vaultPath, options) → { pairs: number, outputPath: string }
export async function validateModel(modelName, testQueries) → ValidationReport
export async function compareModels(models, testQueries) → ComparisonTable
```

## What to Build NOW (pre-hardware)
1. Training data generation script (runs against vault NOW, stores pairs for later)
2. Test query set (50 Paul-specific questions across all domains)
3. Validation harness (runs against any Ollama model)
4. Cost tracking module (log local vs rented API calls)

## Existing Code
- `~/nanoclaw/training/prepare-training-data.js` — may already exist (from master-architecture.md spec)
- `~/nanoclaw/epistemic-triage.js` — quality scoring
- Ollama at localhost:11434

## Test Criteria
1. Training data generator produces 500+ valid JSONL pairs from vault
2. Validation harness runs against hermes3 and produces scored comparison
3. Cost tracker logs which queries went local vs frontier over a week
4. Post M5: distilled model beats base on Paul-specific queries by >20%

## Fable Brief
Build the pre-hardware components of the sovereignty shrink pipeline. Training data generator (reads vault, uses frontier to generate instruction-response pairs, filters by quality). Test query set (50 Paul-specific questions). Validation harness (runs any Ollama model against test queries, scores on lexicon/reasoning/domain/voice). Cost tracker (logs local vs rented API calls). The actual LoRA training step is hardware-gated — don't build that yet. Focus on the data pipeline that FEEDS the training when hardware arrives.
