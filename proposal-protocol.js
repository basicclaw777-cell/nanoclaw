import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'vortex_data', 'metrics.db');

let _db;
function db() {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    ensureSchema(_db);
  }
  return _db;
}

function ensureSchema(d) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS proposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent TEXT NOT NULL,
      domain TEXT NOT NULL,
      initiative_id TEXT,
      proposal TEXT NOT NULL,
      evidence TEXT,
      confidence REAL,
      expected_value TEXT,
      expected_value_num REAL,
      cost TEXT,
      expiry TEXT,

      status TEXT DEFAULT 'proposed',
      proposed_at TEXT NOT NULL,
      seen_at TEXT,
      decided_at TEXT,
      executed_at TEXT,
      measured_at TEXT,

      decision TEXT,
      decline_bucket TEXT,
      decline_reason TEXT,
      intervention_count INTEGER DEFAULT 0,

      outcome TEXT,
      outcome_value_num REAL,
      calibration_error REAL,
      value_realized TEXT,

      graduation_contribution REAL
    );

    CREATE INDEX IF NOT EXISTS idx_proposals_agent ON proposals(agent);
    CREATE INDEX IF NOT EXISTS idx_proposals_domain ON proposals(domain);
    CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
    CREATE INDEX IF NOT EXISTS idx_proposals_initiative ON proposals(initiative_id);
  `);

  // Safe migration — add commitment columns if they don't exist
  const cols = d.prepare("PRAGMA table_info(proposals)").all().map(c => c.name);
  const migrations = [
    ['committed_at', 'TEXT'],
    ['scheduled_at', 'TEXT'],
    ['scheduled_end', 'TEXT'],
    ['estimated_minutes', 'INTEGER'],
    ['surface', 'TEXT'],
    ['surface_ref', 'TEXT'],
  ];
  for (const [col, type] of migrations) {
    if (!cols.includes(col)) {
      d.exec(`ALTER TABLE proposals ADD COLUMN ${col} ${type}`);
    }
  }
}

function now() { return new Date().toISOString(); }

// ── The Universal Contract ──

export function emit({ agent, domain, proposal, evidence, confidence, expected_value, expected_value_num, cost, expiry, initiative_id }) {
  const stmt = db().prepare(`
    INSERT INTO proposals (agent, domain, initiative_id, proposal, evidence, confidence, expected_value, expected_value_num, cost, expiry, status, proposed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?)
  `);
  const result = stmt.run(agent, domain, initiative_id || null, proposal, evidence || null, confidence || null, expected_value || null, expected_value_num || null, cost || null, expiry || null, now());
  return result.lastInsertRowid;
}

export function markSeen(id) {
  db().prepare('UPDATE proposals SET seen_at = ? WHERE id = ? AND seen_at IS NULL').run(now(), id);
}

export function decide(id, { decision, decline_bucket, decline_reason, intervention_count }) {
  const updates = { decided_at: now(), status: decision === 'accepted' ? 'accepted' : 'declined' };
  db().prepare(`
    UPDATE proposals SET decision = ?, decline_bucket = ?, decline_reason = ?, intervention_count = ?, decided_at = ?, status = ?
    WHERE id = ?
  `).run(decision, decline_bucket || null, decline_reason || null, intervention_count || 0, updates.decided_at, updates.status, id);
}

export function recordOutcome(id, { outcome, outcome_value_num, value_realized }) {
  const row = db().prepare('SELECT confidence, expected_value_num FROM proposals WHERE id = ?').get(id);
  let calibration_error = null;
  if (row && row.confidence != null && outcome_value_num != null && row.expected_value_num != null) {
    const predicted_correct = row.expected_value_num;
    calibration_error = Math.abs(outcome_value_num - predicted_correct) / Math.max(Math.abs(predicted_correct), 1);
  }

  db().prepare(`
    UPDATE proposals SET outcome = ?, outcome_value_num = ?, calibration_error = ?, value_realized = ?, measured_at = ?, status = 'measured'
    WHERE id = ?
  `).run(outcome, outcome_value_num || null, calibration_error, value_realized || null, now(), id);
}

export function expire() {
  const today = now().slice(0, 10);
  const result = db().prepare(`
    UPDATE proposals SET status = 'expired', decision = 'expired'
    WHERE status = 'proposed' AND expiry IS NOT NULL AND expiry < ?
  `).run(today);
  return result.changes;
}

// ── Evidence Engine ──

export function agentStats(agent) {
  const d = db();
  const total = d.prepare('SELECT count(*) as c FROM proposals WHERE agent = ?').get(agent).c;
  const measured = d.prepare(`SELECT count(*) as c FROM proposals WHERE agent = ? AND status = 'measured'`).get(agent).c;
  const accepted = d.prepare(`SELECT count(*) as c FROM proposals WHERE agent = ? AND decision = 'accepted'`).get(agent).c;
  const declined = d.prepare(`SELECT count(*) as c FROM proposals WHERE agent = ? AND decision = 'declined'`).get(agent).c;

  // Calibration: average confidence vs actual hit rate on measured proposals
  const measuredRows = d.prepare(`SELECT confidence, calibration_error FROM proposals WHERE agent = ? AND status = 'measured' AND confidence IS NOT NULL`).all(agent);
  const avgConfidence = measuredRows.length ? measuredRows.reduce((s, r) => s + r.confidence, 0) / measuredRows.length : null;
  const avgCalibrationError = measuredRows.length ? measuredRows.reduce((s, r) => s + (r.calibration_error || 0), 0) / measuredRows.length : null;

  // Intervention rate: avg interventions on accepted proposals
  const acceptedRows = d.prepare(`SELECT intervention_count FROM proposals WHERE agent = ? AND decision = 'accepted'`).all(agent);
  const avgIntervention = acceptedRows.length ? acceptedRows.reduce((s, r) => s + r.intervention_count, 0) / acceptedRows.length : null;

  // Decision latency: avg time from proposed to decided (hours)
  const latencyRows = d.prepare('SELECT proposed_at, decided_at FROM proposals WHERE agent = ? AND decided_at IS NOT NULL').all(agent);
  let avgLatencyHours = null;
  if (latencyRows.length) {
    const totalMs = latencyRows.reduce((s, r) => s + (new Date(r.decided_at) - new Date(r.proposed_at)), 0);
    avgLatencyHours = +(totalMs / latencyRows.length / 3600000).toFixed(1);
  }

  // Acceptance rate (distinct from intervention)
  const acceptanceRate = total > 0 ? +(accepted / total).toFixed(3) : null;

  // Decline buckets
  const declineBuckets = d.prepare(`SELECT decline_bucket, count(*) as c FROM proposals WHERE agent = ? AND decision = 'declined' AND decline_bucket IS NOT NULL GROUP BY decline_bucket`).all(agent);

  // Opportunity cost: declined proposals where we later learned the agent was right
  const missedOpportunities = d.prepare(`SELECT count(*) as c FROM proposals WHERE agent = ? AND decision = 'declined' AND decline_bucket = 'agent_wrong' AND calibration_error IS NOT NULL AND calibration_error < 0.2`).get(agent).c;

  return {
    agent,
    total,
    measured,
    accepted,
    declined,
    acceptanceRate,
    avgConfidence,
    avgCalibrationError,
    avgIntervention,
    avgLatencyHours,
    declineBuckets,
    missedOpportunities,
  };
}

export function graduationScore(agent) {
  const stats = agentStats(agent);
  if (stats.total < 5) return { agent, score: null, level: 'insufficient_data', stats };

  // Gate 1: Reliability — does it consistently produce?
  const reliability = Math.min(stats.total / 30, 1.0);

  // Gate 2: Calibration — does confidence match reality?
  const calibration = stats.avgCalibrationError != null ? Math.max(0, 1 - stats.avgCalibrationError) : 0.5;

  // Gate 3: Value — acceptance rate + low intervention
  const acceptValue = stats.acceptanceRate || 0;
  const interventionPenalty = stats.avgIntervention != null ? Math.max(0, 1 - stats.avgIntervention / 5) : 0.5;
  const value = (acceptValue + interventionPenalty) / 2;

  // Gate 4: Containment — domain-specific risk ceiling
  const CONTAINMENT = { finance: 0.6, coaching: 0.9, gym: 0.8, research: 1.0, builder: 0.85, entrepreneur: 0.7 };
  const containment = CONTAINMENT[stats.agent] || CONTAINMENT[getDomain(agent)] || 0.7;

  const raw = 0.30 * reliability + 0.30 * calibration + 0.25 * value + 0.15 * containment;

  // Trust decay: 0.995^days since last measured proposal
  const lastMeasured = db().prepare('SELECT measured_at FROM proposals WHERE agent = ? AND measured_at IS NOT NULL ORDER BY measured_at DESC LIMIT 1').get(agent);
  let decay = 1.0;
  if (lastMeasured) {
    const daysSince = (Date.now() - new Date(lastMeasured.measured_at).getTime()) / 86400000;
    decay = Math.pow(0.995, daysSince);
  }

  const score = +(raw * decay).toFixed(3);

  let level = 'simulation';
  if (score >= 0.8) level = 'autonomous';
  else if (score >= 0.65) level = 'trusted';
  else if (score >= 0.5) level = 'limited';
  else if (score >= 0.35) level = 'shadow';

  return { agent, score, level, decay: +decay.toFixed(3), gates: { reliability: +reliability.toFixed(3), calibration: +calibration.toFixed(3), value: +value.toFixed(3), containment }, stats };
}

function getDomain(agent) {
  const DOMAIN_MAP = {
    trader: 'finance', 'simpsons-trader': 'finance', 'cyclical-trader': 'finance',
    'gym-eyes': 'gym', 'punchpass-scraper': 'gym', 'lapsed-campaign': 'gym', 'buzz-monitor': 'gym',
    archaeologist: 'research', 'the-muse': 'research', prospector: 'research', 'curiosity-loop': 'research',
    'content-reviews': 'builder', 'production-engine': 'builder',
  };
  return DOMAIN_MAP[agent] || 'general';
}

// ── Commitment Layer ──

export function commit(id, { scheduled_at, scheduled_end, estimated_minutes, surface, surface_ref } = {}) {
  const row = db().prepare('SELECT status FROM proposals WHERE id = ?').get(id);
  if (!row) throw new Error(`Proposal ${id} not found`);
  if (row.status !== 'accepted') throw new Error(`Proposal ${id} is "${row.status}", not accepted — cannot commit`);
  db().prepare(`
    UPDATE proposals SET status = 'committed', committed_at = ?,
      scheduled_at = ?, scheduled_end = ?, estimated_minutes = ?,
      surface = ?, surface_ref = ?
    WHERE id = ?
  `).run(now(), scheduled_at || null, scheduled_end || null, estimated_minutes || null, surface || null, surface_ref || null, id);
}

export function committed(limit = 50) {
  return db().prepare(`SELECT * FROM proposals WHERE status = 'committed' ORDER BY scheduled_at ASC LIMIT ?`).all(limit);
}

export function needsCommitment() {
  return db().prepare(`SELECT * FROM proposals WHERE status = 'accepted' AND committed_at IS NULL ORDER BY decided_at ASC`).all();
}

export function markExecuted(id) {
  const row = db().prepare('SELECT status FROM proposals WHERE id = ?').get(id);
  if (!row) throw new Error(`Proposal ${id} not found`);
  if (row.status !== 'committed') throw new Error(`Proposal ${id} is "${row.status}", not committed — cannot mark executed`);
  db().prepare(`UPDATE proposals SET status = 'executed', executed_at = ? WHERE id = ?`).run(now(), id);
}

export function overdue() {
  const right_now = now();
  return db().prepare(`
    SELECT * FROM proposals
    WHERE status = 'committed'
      AND scheduled_end IS NOT NULL
      AND scheduled_end < ?
    ORDER BY scheduled_end ASC
  `).all(right_now);
}

// ── Query helpers ──

export function pending() {
  return db().prepare(`SELECT * FROM proposals WHERE status = 'proposed' ORDER BY proposed_at DESC`).all();
}

export function byAgent(agent, limit = 50) {
  return db().prepare('SELECT * FROM proposals WHERE agent = ? ORDER BY proposed_at DESC LIMIT ?').all(agent, limit);
}

export function byInitiative(initiative_id) {
  return db().prepare('SELECT * FROM proposals WHERE initiative_id = ? ORDER BY proposed_at ASC').all(initiative_id);
}

export function byDomain(domain, limit = 50) {
  return db().prepare('SELECT * FROM proposals WHERE domain = ? ORDER BY proposed_at DESC LIMIT ?').all(domain, limit);
}

export function roadsNotTaken(limit = 50) {
  return db().prepare(`SELECT * FROM proposals WHERE decision = 'declined' ORDER BY decided_at DESC LIMIT ?`).all(limit);
}

export function allAgents() {
  return db().prepare('SELECT DISTINCT agent FROM proposals ORDER BY agent').all().map(r => r.agent);
}

export function summary() {
  const d = db();
  return {
    total: d.prepare('SELECT count(*) as c FROM proposals').get().c,
    proposed: d.prepare(`SELECT count(*) as c FROM proposals WHERE status = 'proposed'`).get().c,
    accepted: d.prepare(`SELECT count(*) as c FROM proposals WHERE decision = 'accepted'`).get().c,
    committed: d.prepare(`SELECT count(*) as c FROM proposals WHERE status = 'committed'`).get().c,
    executed: d.prepare(`SELECT count(*) as c FROM proposals WHERE status = 'executed'`).get().c,
    declined: d.prepare(`SELECT count(*) as c FROM proposals WHERE decision = 'declined'`).get().c,
    expired: d.prepare(`SELECT count(*) as c FROM proposals WHERE status = 'expired'`).get().c,
    measured: d.prepare(`SELECT count(*) as c FROM proposals WHERE status = 'measured'`).get().c,
    overdue: d.prepare(`SELECT count(*) as c FROM proposals WHERE status = 'committed' AND scheduled_end IS NOT NULL AND scheduled_end < ?`).get(new Date().toISOString()).c,
    needs_commitment: d.prepare(`SELECT count(*) as c FROM proposals WHERE status = 'accepted' AND committed_at IS NULL`).get().c,
    agents: allAgents(),
  };
}
