# 5d — Agent Protocol (Sovereign Agent-to-Agent Exchange) — v2

## What
Structured protocol for Paul's agents to exchange data with external agents — specifically a student's training log agent or a partner coach's system. Not an open marketplace. Closed, permissioned, sovereign. The Cathedral talks to other systems on Paul's terms.

## Why
As AI agent systems proliferate (OpenBrain, custom builds, Claude projects), people will have their own agent ecosystems. The first coach whose system can intake a student's training data from THEIR agent and return coaching intelligence has a structural advantage. This is agent diplomacy — controlled data exchange, not integration.

## A2A Alignment (v2 addition)

Google's Agent-to-Agent (A2A) protocol (Linux Foundation, 50+ partners) solves the same problem: letting independent AI agents discover capabilities, negotiate tasks, and exchange structured messages across organizational boundaries. Key A2A principle that aligns perfectly: **agents never expose internal state, memory, or context.**

### What to borrow from A2A
- **Agent Cards** — capability discovery. Instead of exposing "CoachAgent," expose capabilities: `EvaluateBoxingSession v1.0`, `GenerateDrillPrescription v1.0`. Capabilities are replaceable. Protocols survive agent refactors.
- **Schema-first messaging** — A2A uses JSON-LD. We use plain JSON but the principle is the same: both sides agree on input/output schemas before any exchange.
- **Async-first** — A2A supports long-running tasks with status polling. Our coaching analysis might take seconds; building this async from day one avoids blocking the caller.

### What NOT to adopt
- Don't adopt A2A wholesale — it's designed for open discovery across organizations. We're closed and permissioned.
- Don't use their SDK — it's heavier than we need. Our sovereignty wrapper is simpler and we control it.
- Don't join their ecosystem — we're not trying to be discoverable. We're a castle with a drawbridge, not a marketplace stall.

### The right abstraction: Capabilities, not Agents
Instead of:
```
Talk to CoachAgent
```
Use:
```
Capability: EvaluateBoxingSession
Version: 1.0
Input schema: { sessions, goals, constraints }
Output schema: { diagnoses, prescriptions, constraints_acknowledged }
Permissions: [send_training_log, receive_coaching]
```
Now agents are replaceable. The coaching engine can be rewritten, models can change, but the capability contract stays stable. External counterparties never know or care what's behind the capability.

## Design Principles
- **Sovereignty first.** Never expose internal state, vault, taste map, or rule engine internals. Input → process → output only.
- **Capability-based.** Expose capabilities, not agents. Capabilities have versioned schemas.
- **Permissioned.** Every exchange requires a registered counterparty + API key.
- **Auditable.** Every exchange logged with timestamp, counterparty, capability invoked, data shape, result.
- **Async-ready.** Long-running analyses return a task ID + polling endpoint.
- **One-way intelligence flow.** Student sends data IN. Coaching intelligence comes OUT. Student never sees rules, evidence chains, or confidence scores — only the recommendation.

## Capability Registry
```json
{
  "capabilities": [
    {
      "name": "EvaluateBoxingSession",
      "version": "1.0",
      "description": "Analyze boxing training session data and return coaching diagnoses + drill prescriptions",
      "inputSchema": {
        "sessions": "array of { date, type, duration_min, drills, self_rating, notes }",
        "goals": "array of strings",
        "constraints": "array of strings (injuries, limitations)"
      },
      "outputSchema": {
        "diagnoses": "array of { area, finding, priority }",
        "prescriptions": "array of { drill, description, frequency, duration }",
        "constraints_acknowledged": "array of strings",
        "next_check": "ISO date"
      },
      "requiredPermission": "send_training_log"
    },
    {
      "name": "GetStudentProgress",
      "version": "1.0",
      "description": "Return progress summary for a registered student",
      "inputSchema": { "studentId": "string" },
      "outputSchema": {
        "totalSessions": "number",
        "currentLevel": "string",
        "recentMilestones": "array of strings",
        "trend": "string"
      },
      "requiredPermission": "view_progress"
    }
  ]
}
```

## Message Format

### Inbound (counterparty → Cathedral)
```json
{
  "protocol": "cathedral-agent-v1",
  "capability": "EvaluateBoxingSession",
  "version": "1.0",
  "counterparty": {
    "id": "student_agent_001",
    "name": "Alex's Training Agent",
    "key": "cap_xxxxxxxx"
  },
  "payload": {
    "sessions": [
      {
        "date": "2026-07-02",
        "type": "solo_practice",
        "duration_min": 30,
        "drills": ["1-2", "1-2-3", "jab-slip-cross"],
        "self_rating": 6,
        "notes": "Guard kept dropping after round 3"
      }
    ],
    "goals": ["improve guard maintenance", "learn body shots"],
    "constraints": ["left shoulder injury — no overhead"]
  },
  "timestamp": "2026-07-02T14:30:00Z"
}
```

### Outbound (Cathedral → counterparty)
```json
{
  "protocol": "cathedral-agent-v1",
  "capability": "EvaluateBoxingSession",
  "version": "1.0",
  "counterparty": "student_agent_001",
  "payload": {
    "diagnoses": [
      {
        "area": "guard_maintenance",
        "finding": "Guard drops correlate with fatigue onset — not technique, it's conditioning",
        "priority": 1
      }
    ],
    "prescriptions": [
      {
        "drill": "guard_hold_intervals",
        "description": "30s guard hold between every round — builds the default position",
        "frequency": "every_session",
        "duration": "2_weeks"
      }
    ],
    "constraints_acknowledged": ["left_shoulder — overhead removed from all prescriptions"],
    "next_check": "2026-07-16"
  },
  "timestamp": "2026-07-02T14:30:05Z"
}
```

## Permission Schema
```json
{
  "counterparties": [
    {
      "id": "student_agent_001",
      "name": "Alex's Training Agent",
      "key": "cap_xxxxxxxx",
      "permissions": ["send_training_log", "receive_coaching", "view_progress"],
      "registered": "2026-07-02",
      "active": true,
      "rateLimit": "10/day",
      "registeredBy": "paul"
    }
  ]
}
```

## Module Interface
```javascript
// agent-protocol.js — ESM
export function getCapabilities() → CapabilityRegistry
export function validateInbound(message) → { valid: boolean, errors: string[] }
export function processExchange(inbound) → OutboundMessage | { taskId, pollUrl }
export function registerCounterparty(name, permissions) → { id, key }
export function revokeCounterparty(id) → boolean
export function getExchangeLog(filters) → ExchangeRecord[]
```

## Routes
- `GET /api/agent-exchange/capabilities` — public capability registry (schemas only, no internals)
- `POST /api/agent-exchange` — receive inbound message (key-authenticated)
- `GET /api/agent-exchange/task/:taskId` — poll async task status
- `GET /api/agent-exchange/log` — exchange audit log (Paul only)
- `POST /api/agent-exchange/register` — register counterparty (Paul only)
- `DELETE /api/agent-exchange/counterparty/:id` — revoke counterparty (Paul only)

## Commands
- `/agent register [name]` — register new counterparty, get key
- `/agent revoke [id]` — revoke access
- `/agent log` — recent exchanges
- `/agent status` — active counterparties + capabilities
- `/agent caps` — list published capabilities

## Storage
- `~/nanoclaw/agent-protocol-registry.json` — counterparties + keys
- `~/nanoclaw/agent-protocol-log.json` — exchange audit trail
- `~/nanoclaw/agent-capabilities.json` — capability registry

## Test Criteria
1. Register a test counterparty → gets ID + key
2. `GET /capabilities` returns capability list with schemas (no internal details)
3. Send valid inbound with correct capability + key → receives coaching response
4. Send with wrong capability version → rejected with schema mismatch error
5. Send without key → rejected with 401
6. Send malformed payload → rejected with validation errors listing which fields are wrong
7. Exchange appears in audit log with capability invoked, payload size, response time
8. Revoke counterparty → subsequent messages rejected
9. Rate limit exceeded → 429 with retry-after

## Fable Brief
Build the agent-to-agent exchange protocol for the Cathedral. Read this spec. Key v2 change: CAPABILITY-BASED, not agent-based. Expose capabilities (EvaluateBoxingSession, GetStudentProgress) with versioned schemas. Counterparties invoke capabilities, never agents. Borrow the Agent Card pattern from Google's A2A protocol but keep our sovereignty wrapper — closed, permissioned, not discoverable. Build agent-protocol.js (ESM) with capability registry, inbound validation against capability schemas, exchange processing (pipes through coaching-engine from scaffold 5b when available, otherwise returns stub coaching response), counterparty registration with API keys, rate limiting, async task support for long-running analyses, and full audit logging. Wire into cath-bridge.cjs routes. Add Telegram commands. Sovereignty is non-negotiable: never expose rules, evidence chains, confidence scores, vault content, or internal state. Input→process→output only.
