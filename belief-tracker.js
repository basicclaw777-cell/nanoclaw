// belief-tracker.js
// Tracks Paul's evolving positions, detects Drift (confidence without evidence) and Evolution (genuine learning).
// Spec: docs/addendum.md Section 3

import Database from 'better-sqlite3';
import { join } from 'path';

const HOME    = process.env.HOME;
const DB_PATH = join(HOME, 'nanoclaw', 'vortex_data', 'metrics.db');
const OLLAMA_URL = 'http://localhost:11434';

const db = new Database(DB_PATH);

// ─── Schema ───────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS belief_trajectory (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    topic          TEXT NOT NULL,
    statement      TEXT NOT NULL,
    confidence     REAL DEFAULT 0.5,
    position_hash  TEXT,
    timestamp      INTEGER NOT NULL,
    trigger_type   TEXT DEFAULT 'conversation',
    trigger_detail TEXT
  );

  CREATE TABLE IF NOT EXISTS belief_alerts (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    topic          TEXT NOT NULL,
    alert_type     TEXT NOT NULL,
    description    TEXT NOT NULL,
    created_at     INTEGER NOT NULL,
    acknowledged   INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS belief_evidence_links (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    belief_id     INTEGER NOT NULL,
    evidence_path TEXT NOT NULL,
    evidence_grade TEXT,
    linked_at     INTEGER NOT NULL
  );
`);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function queryOllama(model, system, prompt) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: prompt },
      ],
      stream: false,
    }),
  });
  const data = await res.json();
  return data.message?.content ?? '';
}

function extractConfidence(text) {
  // Map linguistic markers to confidence values
  const markers = [
    { pattern: /\b(i am certain|i know|this is fact|proven|verified)\b/i, value: 0.95 },
    { pattern: /\b(i'm sure|clearly|obviously|no doubt)\b/i,               value: 0.85 },
    { pattern: /\b(i believe|i think|likely|probably)\b/i,                 value: 0.65 },
    { pattern: /\b(i suspect|perhaps|might be|possibly)\b/i,               value: 0.45 },
    { pattern: /\b(i was wrong|not sure|unclear|uncertain)\b/i,            value: 0.30 },
    { pattern: /\b(i don't know|hard to say|can't tell)\b/i,               value: 0.20 },
  ];

  for (const { pattern, value } of markers) {
    if (pattern.test(text)) return value;
  }
  return 0.50; // neutral default
}

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h.toString(16);
}

// ─── Extract Beliefs from Text (NLP) ─────────────────────────────────────────

export async function extractBeliefs(text, triggerType = 'conversation', triggerDetail = '') {
  const systemPrompt = `You are a belief extraction system.
Extract any first-person position statements from the text.
These are statements where the speaker asserts a belief about how something works.
Return JSON only: {"beliefs": [{"topic": "...", "statement": "...", "confidence_signal": "certain|likely|uncertain|unsure"}]}
Return empty beliefs array if no clear position statements found.`;

  const prompt = `Extract position statements from:\n\n${text.slice(0, 2000)}`;

  let beliefs = [];
  try {
    const raw = await queryOllama('qwen3:14b', systemPrompt, prompt);
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    beliefs = json.beliefs ?? [];
  } catch { return []; }

  const now = Date.now();
  const inserted = [];

  for (const b of beliefs) {
    if (!b.topic || !b.statement) continue;

    const confidenceMap = { certain: 0.90, likely: 0.65, uncertain: 0.40, unsure: 0.25 };
    const confidence = confidenceMap[b.confidence_signal] ?? extractConfidence(b.statement);
    const hash = simpleHash(b.topic + b.statement.slice(0, 50));

    const id = db.prepare(`
      INSERT INTO belief_trajectory (topic, statement, confidence, position_hash, timestamp, trigger_type, trigger_detail)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(b.topic, b.statement, confidence, hash, now, triggerType, triggerDetail).lastInsertRowid;

    inserted.push({ id, topic: b.topic, statement: b.statement, confidence });
  }

  return inserted;
}

// ─── Record a Single Statement (manual or from known context) ─────────────────

export function recordStatement(topic, statement, confidence, triggerType = 'manual', triggerDetail = '') {
  const now = Date.now();
  const hash = simpleHash(topic + statement.slice(0, 50));
  const id = db.prepare(`
    INSERT INTO belief_trajectory (topic, statement, confidence, position_hash, timestamp, trigger_type, trigger_detail)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(topic, statement, confidence ?? extractConfidence(statement), hash, now, triggerType, triggerDetail).lastInsertRowid;

  return id;
}

// ─── Link Evidence to a Belief ────────────────────────────────────────────────

export function linkEvidence(beliefId, evidencePath, evidenceGrade) {
  db.prepare(`
    INSERT INTO belief_evidence_links (belief_id, evidence_path, evidence_grade, linked_at)
    VALUES (?, ?, ?, ?)
  `).run(beliefId, evidencePath, evidenceGrade, Date.now());
}

// ─── Drift Detection ──────────────────────────────────────────────────────────
// A topic where Paul's confidence has risen over the last 30 days
// WITHOUT new Grade A/B evidence entering the vault in the same period.

export function detectDrift() {
  const thirtyDaysAgo = Date.now() - 30 * 86400 * 1000;
  const alerts = [];

  // Topics with beliefs in the last 30 days
  const recentTopics = db.prepare(`
    SELECT DISTINCT topic FROM belief_trajectory WHERE timestamp > ?
  `).all(thirtyDaysAgo).map(r => r.topic);

  for (const topic of recentTopics) {
    const beliefs = db.prepare(`
      SELECT confidence, timestamp FROM belief_trajectory
      WHERE topic = ? ORDER BY timestamp ASC
    `).all(topic);

    if (beliefs.length < 2) continue;

    const recent = beliefs.filter(b => b.timestamp > thirtyDaysAgo);
    const older  = beliefs.filter(b => b.timestamp <= thirtyDaysAgo);

    if (recent.length === 0 || older.length === 0) continue;

    const avgOld    = older.reduce((s, b) => s + b.confidence, 0) / older.length;
    const avgRecent = recent.reduce((s, b) => s + b.confidence, 0) / recent.length;

    // Confidence increased significantly
    if (avgRecent - avgOld < 0.15) continue;

    // Check if new Grade A/B evidence entered the vault for this topic in the same period
    const hasNewEvidence = db.prepare(`
      SELECT COUNT(*) as n FROM belief_evidence_links bel
      JOIN belief_trajectory bt ON bel.belief_id = bt.id
      WHERE bt.topic = ? AND bel.linked_at > ?
        AND (bel.evidence_grade = 'A' OR bel.evidence_grade = 'B')
    `).get(topic, thirtyDaysAgo).n;

    if (hasNewEvidence > 0) {
      // This is EVOLUTION, not DRIFT
      const exists = db.prepare(`
        SELECT id FROM belief_alerts WHERE topic = ? AND alert_type = 'EVOLUTION' AND created_at > ?
      `).get(topic, thirtyDaysAgo);

      if (!exists) {
        const id = db.prepare(`
          INSERT INTO belief_alerts (topic, alert_type, description, created_at)
          VALUES (?, 'EVOLUTION', ?, ?)
        `).run(
          topic,
          `Confidence rose from ${(avgOld * 100).toFixed(0)}% → ${(avgRecent * 100).toFixed(0)}% with Grade A/B evidence. Genuine learning.`,
          Date.now()
        ).lastInsertRowid;
        alerts.push({ id, topic, type: 'EVOLUTION', old: avgOld, recent: avgRecent });
      }
    } else {
      // DRIFT ALERT
      const exists = db.prepare(`
        SELECT id FROM belief_alerts WHERE topic = ? AND alert_type = 'DRIFT' AND created_at > ?
      `).get(topic, thirtyDaysAgo);

      if (!exists) {
        const id = db.prepare(`
          INSERT INTO belief_alerts (topic, alert_type, description, created_at)
          VALUES (?, 'DRIFT', ?, ?)
        `).run(
          topic,
          `Confidence rose from ${(avgOld * 100).toFixed(0)}% → ${(avgRecent * 100).toFixed(0)}% WITHOUT new Grade A/B evidence. Certainty is outrunning evidence.`,
          Date.now()
        ).lastInsertRowid;
        alerts.push({ id, topic, type: 'DRIFT', old: avgOld, recent: avgRecent });
      }
    }
  }

  return alerts;
}

// ─── Get Trajectory ───────────────────────────────────────────────────────────

export function getTrajectory(topic) {
  const beliefs = db.prepare(`
    SELECT * FROM belief_trajectory
    WHERE topic LIKE ?
    ORDER BY timestamp ASC
  `).all(`%${topic}%`);

  if (beliefs.length === 0) return null;

  const linked = db.prepare(`
    SELECT bel.*, bt.topic FROM belief_evidence_links bel
    JOIN belief_trajectory bt ON bel.belief_id = bt.id
    WHERE bt.topic LIKE ?
  `).all(`%${topic}%`);

  return { topic, beliefs, evidence: linked };
}

// ─── Get Drift Alerts ─────────────────────────────────────────────────────────

export function getDriftAlerts() {
  return db.prepare(`
    SELECT * FROM belief_alerts
    WHERE alert_type = 'DRIFT' AND acknowledged = 0
    ORDER BY created_at DESC
  `).all();
}

// ─── Format Trajectory Report ─────────────────────────────────────────────────

export function formatTrajectory(data) {
  if (!data) return '📭 No belief records found for that topic.';

  const { topic, beliefs, evidence } = data;

  let out = `📈 *BELIEF TRAJECTORY: ${topic}*\n\n`;

  // Timeline
  out += `*Position History*\n`;
  for (const b of beliefs) {
    const date = new Date(b.timestamp).toLocaleDateString('en-HK');
    const pct = (b.confidence * 100).toFixed(0);
    const trigger = b.trigger_type !== 'conversation' ? ` _(${b.trigger_type})_` : '';
    out += `• ${date} [${pct}% confidence]${trigger}\n  "${b.statement.slice(0, 120)}"\n`;
  }

  // Evidence links
  if (evidence.length > 0) {
    out += `\n*Evidence Linked*\n`;
    for (const e of evidence) {
      const path = e.evidence_path.split('/').pop().replace('.md', '');
      out += `• ${path} [Grade ${e.evidence_grade ?? '?'}]\n`;
    }
  } else {
    out += `\n_No Grade A/B evidence linked to these beliefs._\n`;
  }

  // Alerts
  const alerts = db.prepare(`
    SELECT * FROM belief_alerts WHERE topic LIKE ? ORDER BY created_at DESC LIMIT 3
  `).all(`%${topic}%`);

  if (alerts.length > 0) {
    out += `\n*Alerts*\n`;
    for (const a of alerts) {
      const icon = a.alert_type === 'DRIFT' ? '⚠️' : '✅';
      out += `${icon} *${a.alert_type}* — ${a.description}\n`;
    }
  }

  return out;
}

// ─── Format Drift Report ──────────────────────────────────────────────────────

export function formatDriftAlerts() {
  const alerts = getDriftAlerts();

  if (alerts.length === 0) return '✅ No active Drift Alerts. Confidence is tracking evidence.';

  let out = `⚠️ *DRIFT ALERTS — Confidence Outrunning Evidence*\n\n`;
  out += `_These topics show rising certainty without new Grade A/B vault evidence in the last 30 days._\n\n`;

  for (const a of alerts) {
    out += `*${a.topic}*\n${a.description}\n\n`;
  }

  out += `_Review with /librarian [topic] to check vault coverage._`;
  return out;
}

// ─── Run Full Belief Scan ─────────────────────────────────────────────────────

export function runBeliefScan() {
  const alerts = detectDrift();
  return alerts;
}
