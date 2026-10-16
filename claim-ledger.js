// claim-ledger.js — The Cathedral's epistemic seam fix.
// ESM module. SQLite via better-sqlite3.
//
// DESIGN PRINCIPLE: This ledger is the source of BELIEF STATE, not the source of TRUTH.
// Truth exists outside the Cathedral. The ledger records what the Cathedral currently
// believes and why. A claim at confidence 0.92 can still be wrong. The system must
// remain comfortable with that possibility.
//
// FOUR INVARIANTS:
// #1 No claim may increase confidence using evidence descended from itself.
// #2 Evidence from a common ancestor counts as one corroboration family.
// #3 Derived evidence cannot elevate a claim above the confidence ceiling
//    of its strongest primary source family.
// #4 Confidence may increase without promotion. Promotion may occur without
//    confidence increase. (Certainty and significance are orthogonal.)

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'vortex_data', 'claim-ledger.db');

// ── Database init ────────────────────────────────────────────────────────────

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('PRIMARY','DERIVED','HYBRID')),
  confidence REAL DEFAULT 0.5,
  grade TEXT,
  origin_agent TEXT,
  origin_session TEXT,
  vault_path TEXT,
  promoted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lineage (
  claim_id TEXT NOT NULL,
  ancestor_id TEXT NOT NULL,
  relationship TEXT NOT NULL CHECK(relationship IN ('SUPPORTS','CONTRADICTS','EXTENDS','CITES')),
  PRIMARY KEY (claim_id, ancestor_id),
  FOREIGN KEY (claim_id) REFERENCES claims(id),
  FOREIGN KEY (ancestor_id) REFERENCES claims(id)
);

-- Add admiralty rating column if it doesn't exist (two-axis NATO Admiralty Code)
-- Source reliability (A-F) x Information credibility (1-6), e.g. "B2", "C3"
`);

try { db.exec(`ALTER TABLE claims ADD COLUMN admiralty_rating TEXT`); } catch (_) { /* column already exists */ }

db.exec(`
CREATE TABLE IF NOT EXISTS confidence_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_id TEXT NOT NULL,
  old_confidence REAL,
  new_confidence REAL,
  reason TEXT,
  evidence_id TEXT,
  blocked INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (claim_id) REFERENCES claims(id)
);
`);

// ── Prepared statements ──────────────────────────────────────────────────────

const stmtInsertClaim = db.prepare(`
  INSERT INTO claims (id, content, source_type, confidence, grade, origin_agent, origin_session, vault_path, admiralty_rating)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const stmtInsertLineage = db.prepare(`
  INSERT OR IGNORE INTO lineage (claim_id, ancestor_id, relationship) VALUES (?, ?, ?)
`);

const stmtGetClaim = db.prepare(`SELECT * FROM claims WHERE id = ?`);

const stmtGetDirectAncestors = db.prepare(`
  SELECT l.ancestor_id, l.relationship, c.* FROM lineage l
  JOIN claims c ON c.id = l.ancestor_id
  WHERE l.claim_id = ?
`);

const stmtGetDirectDescendants = db.prepare(`
  SELECT l.claim_id, l.relationship, c.* FROM lineage l
  JOIN claims c ON c.id = l.claim_id
  WHERE l.ancestor_id = ?
`);

const stmtInsertEvent = db.prepare(`
  INSERT INTO confidence_events (claim_id, old_confidence, new_confidence, reason, evidence_id, blocked)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const stmtUpdateConfidence = db.prepare(`
  UPDATE claims SET confidence = ?, updated_at = datetime('now') WHERE id = ?
`);

const stmtPromote = db.prepare(`
  UPDATE claims SET promoted = 1, vault_path = ?, updated_at = datetime('now') WHERE id = ?
`);

// ── Core functions ───────────────────────────────────────────────────────────

export function registerClaim(content, sourceType, opts = {}) {
  const id = crypto.randomUUID();
  const confidence = opts.confidence ?? 0.5;
  const grade = opts.grade ?? null;
  const originAgent = opts.originAgent ?? null;
  const originSession = opts.originSession ?? null;
  const vaultPath = opts.vaultPath ?? null;
  const admiraltyRating = opts.admiraltyRating ?? null;

  stmtInsertClaim.run(id, content, sourceType, confidence, grade, originAgent, originSession, vaultPath, admiraltyRating);

  if (opts.ancestors && Array.isArray(opts.ancestors)) {
    for (const anc of opts.ancestors) {
      stmtInsertLineage.run(id, anc.id, anc.relationship || 'SUPPORTS');
    }
  }

  return stmtGetClaim.get(id);
}

export function getAncestors(claimId) {
  const visited = new Set();
  const dag = [];

  function walk(id, depth) {
    if (visited.has(id)) return;
    visited.add(id);
    const rows = stmtGetDirectAncestors.all(id);
    for (const row of rows) {
      dag.push({ claimId: id, ancestorId: row.ancestor_id, relationship: row.relationship, depth });
      walk(row.ancestor_id, depth + 1);
    }
  }

  walk(claimId, 0);
  return dag;
}

export function getDescendants(claimId) {
  const visited = new Set();
  const dag = [];

  function walk(id, depth) {
    if (visited.has(id)) return;
    visited.add(id);
    const rows = stmtGetDirectDescendants.all(id);
    for (const row of rows) {
      dag.push({ claimId: row.claim_id, ancestorId: id, relationship: row.relationship, depth });
      walk(row.claim_id, depth + 1);
    }
  }

  walk(claimId, 0);
  return dag;
}

/**
 * Returns true if claimA and claimB share any common ancestor (excluding PRIMARY roots).
 * This is the core invariant check for self-corroboration detection.
 */
export function sharesLineage(claimA, claimB) {
  // Collect all ancestors of A (including A itself)
  const ancestorsA = new Set();
  ancestorsA.add(claimA);
  const dagA = getAncestors(claimA);
  for (const entry of dagA) {
    ancestorsA.add(entry.ancestorId);
  }

  // Collect all ancestors of B (including B itself)
  const ancestorsB = new Set();
  ancestorsB.add(claimB);
  const dagB = getAncestors(claimB);
  for (const entry of dagB) {
    ancestorsB.add(entry.ancestorId);
  }

  // Find shared ancestors, excluding PRIMARY roots
  const shared = [];
  for (const id of ancestorsA) {
    if (ancestorsB.has(id)) {
      const claim = stmtGetClaim.get(id);
      if (claim && claim.source_type !== 'PRIMARY') {
        shared.push(id);
      }
    }
  }

  return shared.length > 0 ? { shared: true, commonAncestors: shared } : { shared: false, commonAncestors: [] };
}

/**
 * INVARIANT #2: Evidence from a common ancestor counts as one corroboration family.
 * Returns independent evidence families for a claim. Claims sharing a non-PRIMARY
 * ancestor belong to the same family. N families = N independent corroborations.
 */
export function countCorroborationFamilies(claimId) {
  const directAncestors = stmtGetDirectAncestors.all(claimId)
    .filter(a => a.relationship === 'SUPPORTS' || a.relationship === 'EXTENDS');

  if (directAncestors.length === 0) return { families: 0, detail: [] };

  // Group ancestors into families by shared lineage
  const families = [];
  const assigned = new Set();

  for (const anc of directAncestors) {
    if (assigned.has(anc.ancestor_id)) continue;

    const family = [anc.ancestor_id];
    assigned.add(anc.ancestor_id);

    // Check remaining unassigned ancestors for shared lineage with this one
    for (const other of directAncestors) {
      if (assigned.has(other.ancestor_id)) continue;
      const check = sharesLineage(anc.ancestor_id, other.ancestor_id);
      if (check.shared) {
        family.push(other.ancestor_id);
        assigned.add(other.ancestor_id);
      }
    }

    families.push(family);
  }

  return { families: families.length, detail: families };
}

/**
 * INVARIANT #3: Derived evidence cannot elevate a claim above the confidence ceiling
 * of its strongest primary source family. Walks ancestry to find PRIMARY roots,
 * returns the max confidence among them as the ceiling.
 */
export function getConfidenceCeiling(claimId) {
  const ancestors = getAncestors(claimId);
  const allAncestorIds = new Set(ancestors.map(a => a.ancestorId));

  // Find PRIMARY roots in the ancestry
  const primaryRoots = [];
  for (const id of allAncestorIds) {
    const claim = stmtGetClaim.get(id);
    if (claim && claim.source_type === 'PRIMARY') {
      primaryRoots.push(claim);
    }
  }

  if (primaryRoots.length === 0) {
    // No primary sources — ceiling is 0.5 (default uncertainty)
    return { ceiling: 0.5, reason: 'no PRIMARY sources in lineage', primaryRoots: [] };
  }

  const maxConfidence = Math.max(...primaryRoots.map(r => r.confidence));
  return {
    ceiling: maxConfidence,
    reason: `strongest PRIMARY source at ${maxConfidence}`,
    primaryRoots: primaryRoots.map(r => ({ id: r.id, content: r.content.slice(0, 80), confidence: r.confidence }))
  };
}

/**
 * THE FOUR INVARIANTS enforced on every confidence update:
 * #1 No self-corroboration (evidence descended from claim, or vice versa, or shared ancestor)
 * #2 Common-ancestor evidence = one family (logged but not blocked — informational)
 * #3 Derived claims cannot exceed confidence ceiling of strongest PRIMARY source
 * #4 Confidence and promotion are orthogonal (enforced by API design — no coupling)
 */
export function updateConfidence(claimId, newConfidence, reason, evidenceId) {
  const claim = stmtGetClaim.get(claimId);
  if (!claim) return { error: 'claim not found' };

  const oldConfidence = claim.confidence;

  // Check lineage if evidence is provided
  if (evidenceId) {
    // Check 1: does evidence descend from claim? (claim spawned evidence — circular boost)
    const descendants = getDescendants(claimId);
    const evidenceDescendsFromClaim = descendants.some(d => d.claimId === evidenceId);

    // Check 2: does claim descend from evidence? (evidence spawned claim — also circular)
    const claimAncestors = getAncestors(claimId);
    const claimDescendsFromEvidence = claimAncestors.some(a => a.ancestorId === evidenceId);

    // Check 3: shared non-PRIMARY ancestor (sibling corroboration)
    const lineageCheck = sharesLineage(claimId, evidenceId);

    if (evidenceDescendsFromClaim || claimDescendsFromEvidence || lineageCheck.shared) {
      const reason_detail = evidenceDescendsFromClaim ? 'evidence descends from claim'
        : claimDescendsFromEvidence ? 'claim descends from evidence'
        : 'shared non-PRIMARY ancestor';
      // BLOCK: self-corroboration detected
      stmtInsertEvent.run(claimId, oldConfidence, newConfidence, reason, evidenceId, 1);
      return {
        blocked: true,
        reason: `self-corroboration detected: ${reason_detail}`,
        lineage: evidenceDescendsFromClaim ? [evidenceId] : claimDescendsFromEvidence ? [evidenceId] : lineageCheck.commonAncestors,
        oldConfidence,
        attemptedConfidence: newConfidence
      };
    }
  }

  // INVARIANT #3: confidence ceiling from PRIMARY sources
  const claim_record = stmtGetClaim.get(claimId);
  if (claim_record && claim_record.source_type !== 'PRIMARY') {
    const ceiling = getConfidenceCeiling(claimId);
    if (newConfidence > ceiling.ceiling) {
      const capped = ceiling.ceiling;
      stmtInsertEvent.run(claimId, oldConfidence, capped,
        `${reason} [CAPPED from ${newConfidence} to ${capped}: ${ceiling.reason}]`, evidenceId, 0);
      stmtUpdateConfidence.run(capped, claimId);
      return {
        blocked: false,
        capped: true,
        oldConfidence,
        requestedConfidence: newConfidence,
        newConfidence: capped,
        ceiling: ceiling.ceiling,
        ceilingReason: ceiling.reason
      };
    }
  }

  // All invariants passed — apply update
  stmtUpdateConfidence.run(newConfidence, claimId);
  stmtInsertEvent.run(claimId, oldConfidence, newConfidence, reason, evidenceId, 0);

  return {
    blocked: false,
    capped: false,
    oldConfidence,
    newConfidence
  };
}

export function promoteToClaim(vaultPath, sourceType = 'PRIMARY') {
  const id = crypto.randomUUID();
  stmtInsertClaim.run(id, `Vault import: ${vaultPath}`, sourceType, 0.5, null, 'vault-import', null, vaultPath);
  return stmtGetClaim.get(id);
}

export function promoteToVault(claimId, vaultPath) {
  stmtPromote.run(vaultPath, claimId);
  return stmtGetClaim.get(claimId);
}

export function getStats() {
  const byType = db.prepare(`SELECT source_type, COUNT(*) as count FROM claims GROUP BY source_type`).all();
  const byGrade = db.prepare(`SELECT grade, COUNT(*) as count FROM claims WHERE grade IS NOT NULL GROUP BY grade`).all();
  const promoted = db.prepare(`SELECT promoted, COUNT(*) as count FROM claims GROUP BY promoted`).all();
  const blocked = db.prepare(`SELECT COUNT(*) as count FROM confidence_events WHERE blocked = 1`).get();
  const total = db.prepare(`SELECT COUNT(*) as count FROM claims`).get();

  return {
    total: total.count,
    byType: Object.fromEntries(byType.map(r => [r.source_type, r.count])),
    byGrade: Object.fromEntries(byGrade.map(r => [r.grade || 'ungraded', r.count])),
    promoted: Object.fromEntries(promoted.map(r => [r.promoted ? 'vault' : 'ledger', r.count])),
    blockedEvents: blocked.count
  };
}

export function getBlockedEvents(limit = 20) {
  return db.prepare(`
    SELECT ce.*, c.content as claim_content
    FROM confidence_events ce
    JOIN claims c ON c.id = ce.claim_id
    WHERE ce.blocked = 1
    ORDER BY ce.created_at DESC
    LIMIT ?
  `).all(limit);
}

export function getClaim(id) {
  return stmtGetClaim.get(id);
}

export function updateAdmiraltyRating(claimId, rating) {
  const stmt = db.prepare('UPDATE claims SET admiralty_rating = ?, updated_at = datetime(\'now\') WHERE id = ?');
  stmt.run(rating, claimId);
  return getClaim(claimId);
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args[0] === 'stats') {
  console.log(JSON.stringify(getStats(), null, 2));
} else if (args[0] === 'blocked') {
  console.log(JSON.stringify(getBlockedEvents(), null, 2));
} else if (args[0] === 'register') {
  const text = args[1];
  const sourceIdx = args.indexOf('--source');
  const agentIdx = args.indexOf('--agent');
  const source = sourceIdx >= 0 ? args[sourceIdx + 1] : 'PRIMARY';
  const agent = agentIdx >= 0 ? args[agentIdx + 1] : null;
  if (!text) {
    console.error('Usage: node claim-ledger.js register "claim text" --source PRIMARY --agent name');
    process.exit(1);
  }
  const claim = registerClaim(text, source, { originAgent: agent });
  console.log(JSON.stringify(claim, null, 2));
} else if (args[0] === 'lineage') {
  const id = args[1];
  if (!id) { console.error('Usage: node claim-ledger.js lineage <claimId>'); process.exit(1); }
  console.log(JSON.stringify(getAncestors(id), null, 2));
} else if (args[0] === 'check') {
  const [, a, b] = args;
  if (!a || !b) { console.error('Usage: node claim-ledger.js check <claimA> <claimB>'); process.exit(1); }
  console.log(JSON.stringify(sharesLineage(a, b), null, 2));
}
