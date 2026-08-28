import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'cathedral-os.db');

let _db;
function db() {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    migrate(_db);
  }
  return _db;
}

function migrate(d) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      source TEXT NOT NULL,
      room TEXT NOT NULL,
      type TEXT NOT NULL,
      subject TEXT NOT NULL,
      payload TEXT DEFAULT '{}',
      processed INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS room_state (
      room TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      snapshot TEXT NOT NULL,
      delta TEXT,
      PRIMARY KEY (room, timestamp)
    );

    CREATE TABLE IF NOT EXISTS signals (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      room TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'signal',
      title TEXT NOT NULL,
      description TEXT,
      change_score REAL DEFAULT 0,
      surprise_score REAL DEFAULT 0,
      consequence_score REAL DEFAULT 0,
      novelty_score REAL DEFAULT 0,
      recurrence_score REAL DEFAULT 0,
      cross_room_score REAL DEFAULT 0,
      confidence REAL DEFAULT 0.5,
      significance REAL DEFAULT 0.5,
      urgency REAL DEFAULT 0.5,
      lifecycle TEXT DEFAULT 'born',
      provenance TEXT DEFAULT '{}',
      source_events TEXT DEFAULT '[]',
      related_rooms TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS attention_items (
      id TEXT PRIMARY KEY,
      signal_id TEXT REFERENCES signals(id),
      timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      bucket TEXT NOT NULL,
      rank INTEGER DEFAULT 0,
      presented INTEGER DEFAULT 0,
      response TEXT,
      response_timestamp TEXT
    );

    CREATE TABLE IF NOT EXISTS attention_responses (
      id TEXT PRIMARY KEY,
      attention_id TEXT REFERENCES attention_items(id),
      timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      response TEXT NOT NULL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS suppressed (
      signal_type TEXT NOT NULL,
      room TEXT NOT NULL,
      count INTEGER DEFAULT 1,
      last_dismissed TEXT,
      auto_suppressed INTEGER DEFAULT 0,
      PRIMARY KEY (signal_type, room)
    );

    CREATE TABLE IF NOT EXISTS breakthroughs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      room TEXT NOT NULL,
      title TEXT NOT NULL,
      before_state TEXT,
      moment TEXT,
      after_state TEXT,
      evidence TEXT DEFAULT '[]',
      consequences TEXT DEFAULT '[]',
      icon TEXT DEFAULT 'breakthrough',
      related TEXT DEFAULT '[]',
      provenance TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS guide_ledger (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      room TEXT NOT NULL,
      capability TEXT NOT NULL,
      claim TEXT NOT NULL,
      confidence REAL DEFAULT 0.5,
      evidence TEXT DEFAULT '[]',
      alternatives TEXT DEFAULT '[]',
      outcome TEXT,
      user_response TEXT,
      utility REAL
    );

    CREATE TABLE IF NOT EXISTS opinion_levels (
      room TEXT NOT NULL,
      capability TEXT NOT NULL,
      level INTEGER DEFAULT 0,
      last_updated TEXT,
      PRIMARY KEY (room, capability)
    );

    CREATE TABLE IF NOT EXISTS expectation_rules (
      id TEXT PRIMARY KEY,
      room TEXT NOT NULL,
      rule_name TEXT NOT NULL,
      description TEXT,
      condition TEXT NOT NULL,
      threshold TEXT NOT NULL,
      active INTEGER DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_events_room ON events(room);
    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_events_processed ON events(processed);
    CREATE INDEX IF NOT EXISTS idx_signals_room ON signals(room);
    CREATE INDEX IF NOT EXISTS idx_signals_lifecycle ON signals(lifecycle);
    CREATE INDEX IF NOT EXISTS idx_attention_bucket ON attention_items(bucket);
  `);
}

const ROOMS = ['MAKE', 'THINK', 'COACH', 'RUN', 'TRADE', 'REFLECT', 'BUILD'];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function emitEvent({ source, room, type, subject, payload = {} }) {
  if (!ROOMS.includes(room)) throw new Error(`Invalid room: ${room}`);
  const id = uid();
  db().prepare(`
    INSERT INTO events (id, source, room, type, subject, payload)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, source, room, type, subject, JSON.stringify(payload));
  return id;
}

export function getRecentEvents({ room, limit = 50, since } = {}) {
  let sql = 'SELECT * FROM events';
  const params = [];
  const clauses = [];
  if (room) { clauses.push('room = ?'); params.push(room); }
  if (since) { clauses.push('timestamp > ?'); params.push(since); }
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(limit);
  return db().prepare(sql).all(params).map(r => ({
    ...r,
    payload: JSON.parse(r.payload || '{}')
  }));
}

export function getRoomState(room) {
  const row = db().prepare(
    'SELECT * FROM room_state WHERE room = ? ORDER BY timestamp DESC LIMIT 1'
  ).get(room);
  if (!row) return null;
  return { ...row, snapshot: JSON.parse(row.snapshot), delta: JSON.parse(row.delta || '{}') };
}

export function setRoomState(room, snapshot, delta = null) {
  db().prepare(`
    INSERT INTO room_state (room, snapshot, delta)
    VALUES (?, ?, ?)
  `).run(room, JSON.stringify(snapshot), delta ? JSON.stringify(delta) : null);
}

export function createSignal({ room, type = 'signal', title, description, scores = {}, confidence = 0.5, significance = 0.5, urgency = 0.5, provenance = {}, sourceEvents = [], relatedRooms = [] }) {
  const id = uid();
  db().prepare(`
    INSERT INTO signals (id, room, type, title, description,
      change_score, surprise_score, consequence_score, novelty_score,
      recurrence_score, cross_room_score, confidence, significance, urgency,
      provenance, source_events, related_rooms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, room, type, title, description || '',
    scores.change || 0, scores.surprise || 0, scores.consequence || 0,
    scores.novelty || 0, scores.recurrence || 0, scores.crossRoom || 0,
    confidence, significance, urgency,
    JSON.stringify(provenance), JSON.stringify(sourceEvents), JSON.stringify(relatedRooms));
  return id;
}

export function getSignals({ room, lifecycle, limit = 50 } = {}) {
  let sql = 'SELECT * FROM signals';
  const params = [];
  const clauses = [];
  if (room) { clauses.push('room = ?'); params.push(room); }
  if (lifecycle) { clauses.push('lifecycle = ?'); params.push(lifecycle); }
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(limit);
  return db().prepare(sql).all(params).map(r => ({
    ...r,
    provenance: JSON.parse(r.provenance || '{}'),
    source_events: JSON.parse(r.source_events || '[]'),
    related_rooms: JSON.parse(r.related_rooms || '[]')
  }));
}

export function getAttentionItems({ bucket, limit = 10 } = {}) {
  let sql = `
    SELECT a.*, s.room, s.type as signal_type, s.title, s.description,
      s.confidence, s.significance, s.urgency, s.provenance,
      s.change_score, s.surprise_score, s.consequence_score,
      s.novelty_score, s.recurrence_score, s.cross_room_score,
      s.related_rooms, s.lifecycle
    FROM attention_items a
    JOIN signals s ON a.signal_id = s.id
  `;
  const params = [];
  if (bucket) { sql += ' WHERE a.bucket = ?'; params.push(bucket); }
  sql += ' ORDER BY a.rank DESC LIMIT ?';
  params.push(limit);
  return db().prepare(sql).all(params).map(r => ({
    ...r,
    provenance: JSON.parse(r.provenance || '{}'),
    related_rooms: JSON.parse(r.related_rooms || '[]')
  }));
}

export function createAttentionItem({ signalId, bucket, rank = 0 }) {
  const id = uid();
  db().prepare(`
    INSERT INTO attention_items (id, signal_id, bucket, rank)
    VALUES (?, ?, ?, ?)
  `).run(id, signalId, bucket, rank);
  return id;
}

export function recordResponse({ attentionId, response, notes = '' }) {
  const id = uid();
  db().prepare(`
    INSERT INTO attention_responses (id, attention_id, response, notes)
    VALUES (?, ?, ?, ?)
  `).run(id, attentionId, response, notes);
  db().prepare(`
    UPDATE attention_items SET response = ?, response_timestamp = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `).run(response, attentionId);

  if (response === 'dismissed') {
    const item = db().prepare(
      'SELECT s.type, s.room FROM attention_items a JOIN signals s ON a.signal_id = s.id WHERE a.id = ?'
    ).get(attentionId);
    if (item) {
      db().prepare(`
        INSERT INTO suppressed (signal_type, room, count, last_dismissed)
        VALUES (?, ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        ON CONFLICT(signal_type, room) DO UPDATE SET
          count = count + 1,
          last_dismissed = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
          auto_suppressed = CASE WHEN count + 1 >= 5 THEN 1 ELSE 0 END
      `).run(item.type, item.room);
    }
  }
  return id;
}

export function isSuppressed(signalType, room) {
  const row = db().prepare(
    'SELECT auto_suppressed FROM suppressed WHERE signal_type = ? AND room = ?'
  ).get(signalType, room);
  return row?.auto_suppressed === 1;
}

export function createBreakthrough({ room, title, before, moment, after, evidence = [], consequences = [], provenance = {} }) {
  const id = uid();
  db().prepare(`
    INSERT INTO breakthroughs (id, room, title, before_state, moment, after_state,
      evidence, consequences, provenance)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, room, title, before || '', moment || '', after || '',
    JSON.stringify(evidence), JSON.stringify(consequences), JSON.stringify(provenance));
  return id;
}

export function getBreakthroughs({ room, limit = 20 } = {}) {
  let sql = 'SELECT * FROM breakthroughs';
  const params = [];
  if (room) { sql += ' WHERE room = ?'; params.push(room); }
  sql += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(limit);
  return db().prepare(sql).all(params).map(r => ({
    ...r,
    evidence: JSON.parse(r.evidence || '[]'),
    consequences: JSON.parse(r.consequences || '[]'),
    provenance: JSON.parse(r.provenance || '{}')
  }));
}

export function getAllRoomStates() {
  const states = {};
  for (const room of ROOMS) {
    states[room] = getRoomState(room);
  }
  return states;
}

export function getStats() {
  const eventCount = db().prepare('SELECT COUNT(*) as c FROM events').get().c;
  const signalCount = db().prepare('SELECT COUNT(*) as c FROM signals').get().c;
  const activeSignals = db().prepare("SELECT COUNT(*) as c FROM signals WHERE lifecycle IN ('born','rising','peak')").get().c;
  const breakthroughCount = db().prepare('SELECT COUNT(*) as c FROM breakthroughs').get().c;
  const attentionCount = db().prepare('SELECT COUNT(*) as c FROM attention_items WHERE response IS NULL').get().c;
  return { eventCount, signalCount, activeSignals, breakthroughCount, attentionCount };
}

export function cleanup() {
  db().prepare("DELETE FROM events WHERE timestamp < datetime('now', '-30 days')").run();
}

export { ROOMS, db };
