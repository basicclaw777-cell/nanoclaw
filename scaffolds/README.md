# Stage 5 Scaffolds — Cathedral Next Phase

> Built 2026-07-02, updated 2026-07-03. These are Fable-ready build briefs. Each scaffold is a self-contained spec with data shapes, routes, stub code, and test criteria. Read the brief → read the existing codebase → one-shot build.
> 
> v2 UPDATES (relay-driven):
> - **5b** rewritten from static decision trees to LEARNING architecture + decision records on every coaching output (full audit trail: rules applied, confidence, model, override)
> - **5a** added authorization/delegation layer: scoped access tokens (student/parent), override & appeal workflow, parent question mechanism
> - **5d** aligned with A2A protocol: capability-based (not agent-based), versioned capability schemas, Agent Card pattern, async-ready

## Execution Order

Build in this order — each feeds the next:

1. **5b Coach Paul Engine** → the diagnostic brain everything else depends on
2. **5a Client Proxy** → student layer that USES the coaching engine
3. **5e Self-Questioner** → system starts asking its own questions
4. **5d Agent Protocol** → external agents can send data to the coaching engine
5. **5c Sovereignty Shrink** → pre-hardware data pipeline (LoRA training later)

## Files

### Specs
| File | Scaffold | Status |
|------|----------|--------|
| `5a-client-proxy.md` | Student tracking, parent progress, Paul dashboard + authorization layer (v2) | Spec ready |
| `5b-coach-paul-engine.md` | Learning coaching engine — logs → patterns → rules → confidence-gated execution (v2) | Spec ready |
| `5c-sovereignty-shrink.md` | Local model distillation pipeline | Spec ready (hardware-gated) |
| `5d-agent-protocol.md` | Sovereign agent-to-agent exchange — capability-based, A2A-aligned (v2) | Spec ready |
| `5e-self-questioner.md` | System generates its own research questions | Spec ready |

### Stub Code
| File | Module | Exports |
|------|--------|---------|
| `coaching-engine-stub.js` | coaching-engine.js | logIntervention, extractPatterns, approveRule, rejectRule, diagnose, assessNewStudent, detectPlateau, updateConfidence, getEvidenceChain, getRuleHistory, getDecisionLog, overrideDecision (v2) |
| `self-questioner-stub.js` | self-questioner.js | generateQuestion, getQuestionLog, answerQuestion, getUnanswered |
| `agent-protocol-stub.js` | agent-protocol.js | getCapabilities, validateInbound, processExchange, registerCounterparty, revokeCounterparty, getExchangeLog (v2 — capability-based) |

## Key Dependencies
- All modules are ESM (.js)
- All routes go through cath-bridge.cjs (port 8080)
- All Telegram commands wired into telegram-bot.js
- Brand: black / gold #f7b408 / white, Anton + Epilogue
- Storage: JSON files in ~/nanoclaw/ (not database)
- Local model: hermes3 via Ollama (localhost:11434)
- Vault: ~/cathedral-vault/ (read-only for all scaffolds except 5c training data gen)

## Vault Source Files (Fable should read these)
- `06_Methods/archaeologist-and-elicitation.md`
- `02_Refined_Gold/cathedral/diagnostic-empathy-with-surgical-naming.md`
- `06_Methods/pauls-cognitive-signature.md`
- `02_Refined_Gold/cathedral/the-three-engines.md`
- `02_Refined_Gold/cathedral/the-fear-gate-model.md`
- `02_Refined_Gold/cathedral/the-healing-registry.md`
