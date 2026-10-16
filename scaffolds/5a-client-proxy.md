# 5a — Client Proxy Layer — v2

## What
The Cathedral serves Paul's boxing students directly. Student uploads video → system analyzes with Paul's encoded judgment → returns coaching feedback. Parent sees progress. Paul sees all students. Zero extra work for Paul per student interaction.

## Why
The system crosses from serving Paul to operating on Paul's behalf. First step toward the sovereign estate producing value when Paul isn't in the room.

## Authorization & Delegation Layer (v2 addition)

DeepSeek relay identified the gap: sovereignty (who owns the data) was designed, but authority (who gets to do what, when, under what conditions, with what recourse) was missing. When a parent sees a dashboard and disagrees with a progression decision, that's a human relations problem. The system needs:

### Who Authorizes What
| Action | Who Decides | Override |
|--------|------------|----------|
| Register a student | Paul only | — |
| Deactivate a student | Paul only | — |
| View student progress | Student + parent (if granted by Paul) | Paul can revoke |
| Submit homework video | Student (self-serve) | Paul can disable |
| View coaching diagnoses | Student sees recommendations only | Never sees rules/evidence/confidence |
| Dispute a progression decision | Student/parent raises, Paul resolves | Paul always has final say |
| Share progress externally | Paul approves per-student | Default: off |

### Access Tokens
Students and parents don't get full system access. They get a scoped access token:
```json
{
  "token": "stp_xxxxxxxx",
  "type": "student|parent",
  "studentId": "student_001",
  "permissions": ["submit_homework", "view_own_progress"],
  "created": "2026-07-03",
  "createdBy": "paul",
  "active": true
}
```

Parents get a read-only token:
```json
{
  "token": "stp_yyyyyyyy",
  "type": "parent",
  "studentId": "student_001",
  "permissions": ["view_progress"],
  "created": "2026-07-03",
  "createdBy": "paul",
  "active": true
}
```

### Override & Appeal
When a parent disagrees with a coaching recommendation or progression decision:
1. Parent can flag via the progress page (button: "Question this")
2. Flag creates a notification to Paul via Telegram: "Alex's parent questioned: 'Not ready for sparring' decision"
3. Paul reviews and responds (confirm, modify, or override the system's recommendation)
4. Response visible to parent on the progress page
5. Override logged in coaching changelog (5b) with reason

The system NEVER auto-resolves a dispute. Paul always decides. The system informs, Paul governs.

### What Students/Parents NEVER See
- Coaching rules, evidence chains, or confidence scores
- Other students' data
- Paul's internal notes
- The coaching engine's reasoning (only the recommendation)
- Taste map, vault, or any Cathedral internal state

## Existing Code to Build On
- `homework.html` + `homework_processor.py` — student upload → instant combo comparison feedback (ENGINE UNVALIDATED)
- `virtual_tutor.py` — DTW alignment, per-joint scoring, coaching hints
- `the-guard.html` — defensive posture analysis (interactive, not automated yet)
- `analytics-dashboard.html` — session analytics (punches, power, combos, fatigue)
- `drill-player.html` — 3D drill visualization
- `detector.py` — punch detection + ensemble classifier
- `calibrate.py` — ground-truth benchmark pipeline
- All served via cath-bridge.cjs at localhost:8080/gym-eyes/*

## Data Shapes

### Student Profile
```json
{
  "id": "student_001",
  "name": "Alex",
  "startDate": "2026-07-02",
  "level": "beginner",
  "sessions": [],
  "strengths": [],
  "gaps": [],
  "currentBlock": 1,
  "notes": "",
  "accessTokens": [
    { "token": "stp_xxx", "type": "student", "permissions": ["submit_homework", "view_own_progress"], "active": true },
    { "token": "stp_yyy", "type": "parent", "permissions": ["view_progress", "question_decision"], "active": true }
  ],
  "flags": []
}
```

### Session Record
```json
{
  "studentId": "student_001",
  "date": "2026-07-02",
  "type": "class|homework|assessment",
  "metrics": {
    "punchCount": 0,
    "comboAccuracy": 0.0,
    "powerGrade": "C",
    "fatigueOnset": null,
    "guardCoverage": null
  },
  "coachingNotes": [],
  "videoPath": null,
  "block": 1
}
```

### Parent View (read-only subset)
```json
{
  "studentName": "Alex",
  "totalSessions": 12,
  "currentLevel": "intermediate",
  "recentMilestones": ["First clean 1-2-3 combo", "Guard coverage A-"],
  "nextGoal": "Slip + counter timing",
  "trend": "improving",
  "flags": [
    {
      "date": "2026-07-10",
      "question": "Why isn't Alex moving to sparring?",
      "status": "resolved",
      "response": "Guard coverage needs to be consistent under fatigue first — usually 2 more weeks at this rate",
      "respondedBy": "paul",
      "respondedDate": "2026-07-10"
    }
  ]
}
```

### Decision Record (every coaching output carries its trace)
```json
{
  "decisionId": "dec_20260703_001",
  "studentId": "student_001",
  "date": "2026-07-03",
  "type": "coaching_recommendation",
  "input": {
    "sessionData": "{ ... session metrics ... }",
    "studentProfile": "{ ... current profile ... }"
  },
  "rulesApplied": ["rule_guard_physical_reset v1.1", "rule_fatigue_drill_switch v1.0"],
  "confidenceScores": { "rule_guard_physical_reset": 0.87, "rule_fatigue_drill_switch": 0.92 },
  "autonomyLevel": "recommended",
  "output": {
    "diagnoses": ["..."],
    "prescriptions": ["..."]
  },
  "humanOverride": null,
  "overrideReason": null
}
```

## Routes

### Paul-only (authenticated via session/cookie)
- `GET /gym-eyes/students` — student list with trend indicators
- `GET /gym-eyes/student/:id` — student detail + session history + decision records
- `POST /gym-eyes/student/:id/session` — log a session
- `GET /gym-eyes/student/:id/decisions` — full decision audit trail
- `POST /gym-eyes/student/:id/token` — generate access token (student or parent)
- `DELETE /gym-eyes/student/:id/token/:token` — revoke access token
- `POST /gym-eyes/student/:id/flag/:flagId/respond` — respond to parent question

### Student-facing (token-authenticated)
- `GET /gym-eyes/my/progress?token=stp_xxx` — own progress view
- `POST /gym-eyes/my/homework?token=stp_xxx` — submit homework video
- `GET /gym-eyes/my/drills?token=stp_xxx` — assigned drills

### Parent-facing (token-authenticated)
- `GET /gym-eyes/progress/:studentId?token=stp_yyy` — read-only progress view
- `POST /gym-eyes/progress/:studentId/flag?token=stp_yyy` — raise a question about a decision

## Commands
- `/student add [name]` — register new student
- `/student [name] status` — quick view
- `/student [name] token student` — generate student access token
- `/student [name] token parent` — generate parent access token
- `/student [name] revoke [token]` — revoke a token
- `/students` — all active students summary
- `/student flags` — pending parent questions

## Storage
- `~/nanoclaw/gym-eyes-students.json` — student profiles + session records + access tokens
- `~/nanoclaw/gym-eyes-decisions.json` — decision records (full audit trail)

## Test Criteria
1. Register a student via Telegram → appears in student list
2. Generate student token → student can access own progress but not other students
3. Generate parent token → parent sees progress + can flag questions
4. Log a homework submission → metrics stored, decision record created with rules applied + confidence
5. Parent flags a decision → Paul gets Telegram notification → responds → parent sees response
6. Student token cannot access decision records, rules, or evidence chains
7. Revoked token returns 401 on all endpoints
8. Paul's dashboard shows all students with trend indicators + pending flags
9. Decision record shows full trace: input, rules applied, confidence scores, output, any override
10. Cross-session: student's gaps narrow over 3+ sessions (improvement velocity from analytics)

## Fable Brief
Build the student tracking layer for Gym Eyes. Read this spec — v2 adds an authorization layer. Key changes: student/parent access tokens (scoped permissions), parent question/flag mechanism with Paul-resolves workflow, and decision records on every coaching output (full audit trail: which rules, which confidence, which output, any human override).

Build: student profiles JSON store with access tokens, cath-bridge API routes (Paul-only + student-facing + parent-facing, all token-gated), Telegram commands, a student-portal.html page (BR brand: black/gold #f7b408/white, Anton+Epilogue fonts, same nav bar as other Gym Eyes pages) for students, and a parent-progress.html read-only view with flag/question capability. Wire homework submissions to auto-log sessions with decision records. The coaching-engine (scaffold 5b) will plug in later — for now, coaching notes come from the existing virtual_tutor.py scoring, but still write a decision record for every output.

Critical constraint: students and parents NEVER see coaching rules, evidence chains, confidence scores, or internal state. They see recommendations and progress only. Paul sees everything. The system informs, Paul governs.
