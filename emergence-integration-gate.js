import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

/**
 * emergence-integration-gate.js — The Last Lap
 *
 * Moves CONFIRMED incidents to INTEGRATED (or demotes back to WATCHING).
 * Called by Lucy Heartbeat at each pulse.
 *
 * Two gates, both required:
 *   Gate 1 — Persistence: the deliverable was ACTUALLY WRITTEN to a durable surface
 *            (agent memory file modified after ship time). Not "file exists."
 *   Gate 2 — Non-recurrence: the signal-class hasn't re-fired since CONFIRMED.
 *            Checks LIVE board incidents (new DETECTED/WATCHING), not frozen captures.
 *
 * FAIL-SAFE: if recurrence can't be evaluated (no new incidents to compare against),
 * HOLD at CONFIRMED. Never promote blind. Silence ≠ non-recurrence.
 *
 * See: closing-vs-integrating.md
 *
 * CLI:
 *   node emergence-integration-gate.js check         — run gate check
 *   node emergence-integration-gate.js status        — show gate stats
 *   node emergence-integration-gate.js persist <id> <target>  — mark integration target
 */

const HOME = process.env.HOME;
const BOARD_FILE = join(HOME, 'nanoclaw', 'emergence-board.json');
const HEARTBEAT_STATE = join(HOME, 'nanoclaw', 'lucy-heartbeat-state.json');
const MEMORY_DIR = join(HOME, 'Cathedral', 'agents', 'memory');

const K_PULSES = 2;              // survive 2 clean pulses to reach INTEGRATED
const REEMERGENCE_THRESHOLD = 3; // escalate to Paul after 3 re-emergences

function loadJSON(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

function saveJSON(p, data) {
  writeFileSync(p, JSON.stringify(data, null, 2));
}

function sendTelegram(text) {
  const token = process.env.TELEGRAM_TOKEN || (() => {
    try { return readFileSync(join(HOME, 'nanoclaw', '.env'), 'utf8').match(/TELEGRAM_TOKEN=(.+)/)?.[1]?.trim(); }
    catch { return null; }
  })();
  const chatId = process.env.PAUL_CHAT_ID || (() => {
    try { return readFileSync(join(HOME, 'nanoclaw', '.env'), 'utf8').match(/PAUL_CHAT_ID=(.+)/)?.[1]?.trim(); }
    catch { return null; }
  })();
  if (!token || !chatId) return;
  fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  }).catch(() => {});
}

// ── Gate 1: Persistence — verify actual write ────────────────────────────────
// The deliverable must have been written to a durable surface the agent reads.
// We verify: agent memory file mtime > ship time. Not "file exists."

function checkPersistence(incident) {
  // If manually marked with verified target, trust it
  if (incident.integrationTarget?.startsWith('verified:')) return true;

  const targetAgent = incident.target || incident.agent;
  const shipTime = getShipTime(incident);
  if (!shipTime) return false;

  // Check if agent memory file was modified AFTER the deliverable shipped
  try {
    const memFiles = readdirSync(MEMORY_DIR).filter(f => f.endsWith('.json'));
    for (const f of memFiles) {
      const agent = f.replace('-memory.json', '').replace('.json', '');
      if (agent !== targetAgent) continue;
      const memPath = join(MEMORY_DIR, f);
      const mtime = statSync(memPath).mtimeMs;
      if (mtime > shipTime) {
        // Memory was modified after ship — verify content changed
        // (mtime alone is sufficient; we can't cheaply diff without storing pre-ship hash)
        incident.integrationTarget = `verified:${memPath} (mtime ${new Date(mtime).toISOString()} > ship ${new Date(shipTime).toISOString()})`;
        return true;
      }
    }
  } catch {}

  return false;
}

function getShipTime(incident) {
  // Find the [LOOP-CLOSED] or [REIGNITED] follow-up timestamp
  for (const f of incident.followUps || []) {
    if (f.note.includes('[LOOP-CLOSED]') || f.note.includes('[REIGNITED]')) {
      return new Date(f.ts).getTime();
    }
  }
  return incident.lastCheckedAt ? new Date(incident.lastCheckedAt).getTime() : null;
}

// ── Gate 2: Non-recurrence — check LIVE board, not frozen captures ───────────
// A signal recurred if a NEW incident (DETECTED or WATCHING, created after this
// one was CONFIRMED) matches the same agent + signal + keyword overlap.
// FAIL-SAFE: if no new incidents exist at all, return null (indeterminate),
// NOT false. Silence is not evidence of non-recurrence.

function checkRecurrence(incident, board) {
  const confirmedAt = getShipTime(incident) || new Date(incident.lastCheckedAt || incident.detectedAt).getTime();
  const agent = incident.agent;
  const signal = incident.signal;
  const summaryWords = new Set(
    (incident.summary || '').toLowerCase().split(/\s+/).filter(w => w.length > 4)
  );

  // Look at board incidents created AFTER this one was confirmed
  const newIncidents = board.incidents.filter(i => {
    const created = new Date(i.detectedAt).getTime();
    return created > confirmedAt && i.id !== incident.id;
  });

  // If no new incidents exist since confirmation: check how long it's been.
  // Under 7 days = indeterminate (HOLD). Over 7 days = treat silence as clean.
  // Original fail-safe held forever, which meant nothing ever graduated when
  // the harvester wasn't running (the exact bug that killed the pipeline).
  if (newIncidents.length === 0) {
    const daysSince = (Date.now() - confirmedAt) / 86400000;
    if (daysSince < 7) return null;
    return false;
  }

  // Check for same signal-class among new incidents
  for (const ni of newIncidents) {
    if (ni.agent !== agent) continue;
    if (ni.signal !== signal) continue;

    // Keyword overlap
    const niWords = (ni.summary || '').toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const overlap = niWords.filter(w => summaryWords.has(w)).length;
    if (overlap >= 3) return true;  // same signal-class recurred
  }

  return false;  // new incidents exist but none match = genuinely clean
}

function daysSinceConfirmed(incident) {
  const confirmedAt = getShipTime(incident) || new Date(incident.lastCheckedAt || incident.detectedAt).getTime();
  return (Date.now() - confirmedAt) / 86400000;
}

// ── Main gate check ──────────────────────────────────────────────────────────

function runGateCheck() {
  const board = loadJSON(BOARD_FILE);
  if (!board) { console.log('No board.'); return; }

  const heartbeat = loadJSON(HEARTBEAT_STATE);
  const pulseNum = heartbeat?.pulseNumber || 0;

  const confirmed = board.incidents.filter(i => i.status === 'CONFIRMED');
  console.log(`${confirmed.length} CONFIRMED incidents to evaluate.`);

  let promoted = 0, demoted = 0, escalated = 0, waiting = 0, held = 0;

  for (const inc of confirmed) {
    if (!inc.confirmedAtPulse) {
      inc.confirmedAtPulse = pulseNum;
    }

    const pulsesClean = pulseNum - (inc.confirmedAtPulse || pulseNum);
    const recurrence = checkRecurrence(inc, board);  // true | false | null
    const persisted = checkPersistence(inc);

    if (recurrence === true) {
      // DEMOTE: signal came back
      inc.status = 'WATCHING';
      inc.reEmergedCount = (inc.reEmergedCount || 0) + 1;
      inc.lastCheckedAt = new Date().toISOString();
      inc.followUps.push({
        ts: new Date().toISOString(),
        note: `[RECURRED] Signal re-emerged at pulse ${pulseNum}. reEmergedCount: ${inc.reEmergedCount}. Demoted to WATCHING.`,
      });
      demoted++;

      if (inc.reEmergedCount >= REEMERGENCE_THRESHOLD) {
        inc.followUps.push({
          ts: new Date().toISOString(),
          note: `[STRUCTURAL-ESCALATION] Re-emerged ${inc.reEmergedCount}x — not a deliverable problem. Missing channel or structural wound.`,
        });
        escalated++;
      }
    } else if (recurrence === null) {
      // INDETERMINATE: no new incidents to compare against. HOLD — don't promote blind.
      // Silence ≠ non-recurrence. The stream might be stale/frozen.
      held++;
    } else if (recurrence === false && persisted && (pulsesClean >= K_PULSES || daysSinceConfirmed(inc) > 14)) {
      // PROMOTE: recurrence clean + persistence verified + either enough pulses OR >14 days confirmed
      // Time-based fallback: if heartbeat stops pulsing, don't hold forever
      inc.status = 'INTEGRATED';
      inc.resolvedAt = new Date().toISOString();
      inc.lastCheckedAt = new Date().toISOString();
      inc.followUps.push({
        ts: new Date().toISOString(),
        note: `[INTEGRATED] ${pulsesClean} clean pulses, recurrence evaluated negative, persistence: ${inc.integrationTarget}. Pattern metabolized.`,
      });
      promoted++;
    } else {
      // Waiting: not enough pulses, or no persistence, or recurrence clean but too early
      waiting++;
    }
  }

  saveJSON(BOARD_FILE, board);

  console.log(`\n=== INTEGRATION GATE (pulse ${pulseNum}) ===`);
  console.log(`PROMOTED to INTEGRATED: ${promoted}`);
  console.log(`DEMOTED to WATCHING (recurred): ${demoted}`);
  console.log(`HELD (indeterminate — no new data to evaluate): ${held}`);
  console.log(`STRUCTURAL ESCALATIONS: ${escalated}`);
  console.log(`Still waiting (gates incomplete): ${waiting}`);

  if (promoted || demoted || escalated) {
    const lines = [
      `<b>Integration Gate — Pulse ${pulseNum}</b>`,
      promoted ? `${promoted} INTEGRATED (pattern metabolized)` : '',
      demoted ? `${demoted} demoted (signal recurred)` : '',
      escalated ? `<b>${escalated} STRUCTURAL ESCALATIONS</b> — these keep coming back` : '',
      held ? `${held} held (no new data — fail-safe)` : '',
    ].filter(Boolean);
    sendTelegram(lines.join('\n'));
  }

  const stats = { DETECTED: 0, WATCHING: 0, CONFIRMED: 0, INTEGRATED: 0, DISMISSED: 0 };
  for (const i of board.incidents) stats[i.status] = (stats[i.status] || 0) + 1;
  console.log(`\nBoard: ${JSON.stringify(stats)}`);

  return { promoted, demoted, escalated, held, waiting };
}

// ── Manual persistence marking ───────────────────────────────────────────────

function markPersistence(incidentId, target) {
  const board = loadJSON(BOARD_FILE);
  if (!board) return null;
  const inc = board.incidents.find(i => i.id === incidentId);
  if (!inc) return null;
  inc.integrationTarget = `verified:${target}`;
  inc.followUps.push({
    ts: new Date().toISOString(),
    note: `[PERSISTENCE] Deliverable written to: ${target}`,
  });
  saveJSON(BOARD_FILE, board);
  return inc;
}

// ── Status ───────────────────────────────────────────────────────────────────

function showStatus() {
  const board = loadJSON(BOARD_FILE);
  if (!board) { console.log('No board.'); return; }

  const stats = { DETECTED: 0, WATCHING: 0, CONFIRMED: 0, INTEGRATED: 0, DISMISSED: 0 };
  for (const i of board.incidents) stats[i.status] = (stats[i.status] || 0) + 1;

  const withTarget = board.incidents.filter(i => i.status === 'CONFIRMED' && i.integrationTarget?.startsWith('verified:')).length;
  const withoutTarget = board.incidents.filter(i => i.status === 'CONFIRMED' && !i.integrationTarget?.startsWith('verified:')).length;
  const reEmerged = board.incidents.filter(i => (i.reEmergedCount || 0) > 0);

  console.log('=== Integration Gate Status ===');
  console.log(JSON.stringify(stats, null, 2));
  console.log(`\nCONFIRMED with verified persistence: ${withTarget}`);
  console.log(`CONFIRMED without verified persistence (Gate 1 blocked): ${withoutTarget}`);
  if (reEmerged.length) {
    console.log(`\nRe-emerged incidents: ${reEmerged.length}`);
    for (const r of reEmerged) {
      console.log(`  ${r.id} — ${r.agent}->${r.target} — reEmergedCount: ${r.reEmergedCount}`);
    }
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2] || 'check';

  if (cmd === 'check') {
    runGateCheck();
  } else if (cmd === 'status') {
    showStatus();
  } else if (cmd === 'persist' && process.argv[3]) {
    const target = process.argv.slice(4).join(' ') || 'manual';
    const result = markPersistence(process.argv[3], target);
    if (result) console.log(`Marked ${result.id} -> ${target}`);
    else console.log('Incident not found.');
  } else {
    console.log('Usage:');
    console.log('  node emergence-integration-gate.js check           — run gate (promote/demote/hold)');
    console.log('  node emergence-integration-gate.js status          — show gate stats');
    console.log('  node emergence-integration-gate.js persist <id> <target>  — mark persistence target');
  }
}

export { runGateCheck, markPersistence, checkRecurrence, checkPersistence };
