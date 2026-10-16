import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const HOME = process.env.HOME;
const BOARD_FILE = join(HOME, 'nanoclaw', 'emergence-board.json');
const CAPTURES_FILE = join(HOME, 'Cathedral', 'agents', 'emergence-captures.json');
const SURPRISES_FILE = join(HOME, 'Cathedral', 'emergence', 'surprises.json');
const MONITOR_FILE = join(HOME, 'Cathedral', 'emergence', 'monitor-state.json');
const PLANNER_TASKS_FILE = join(HOME, 'Cathedral', 'emergence', 'planner-tasks.json');

// ── Data ──────────────────────────────────────────────────────────────────────

function loadBoard() {
  if (!existsSync(BOARD_FILE)) return { incidents: [], version: 1 };
  try { return JSON.parse(readFileSync(BOARD_FILE, 'utf8')); }
  catch { return { incidents: [], version: 1 }; }
}

function saveBoard(board) {
  writeFileSync(BOARD_FILE, JSON.stringify(board, null, 2));
}

function loadJSON(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

// ── Incident lifecycle ────────────────────────────────────────────────────────
// DETECTED → WATCHING → CONFIRMED → INTEGRATED | DISMISSED

function createIncident({ source, agent, target, signal, summary, watchFor, captureId }) {
  return {
    id: `em-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    status: 'DETECTED',
    source,           // 'emergence-harvester' | 'monitor' | 'manual' | 'town-hall' | 'curiosity-loop'
    agent,            // which agent produced it
    target,           // target agent (if cross-agent)
    signal,           // signal type (proactivity, cross-domain-finding, etc.)
    summary,          // one-line description
    watchFor,         // what to watch for next
    followUps: [],    // timestamped follow-up notes
    detectedAt: new Date().toISOString(),
    lastCheckedAt: null,
    resolvedAt: null,
    captureId,        // link to emergence-captures.json entry
  };
}

function advanceIncident(board, incidentId, newStatus, note) {
  const inc = board.incidents.find(i => i.id === incidentId);
  if (!inc) return null;
  // CONFIRMED → INTEGRATED requires integration gate (persistence + non-recurrence).
  // Manual advance allowed. Integration gate does the real promotion.
  const validTransitions = {
    DETECTED: ['WATCHING', 'DISMISSED'],
    WATCHING: ['CONFIRMED', 'DISMISSED'],
    CONFIRMED: ['INTEGRATED', 'DISMISSED', 'WATCHING'],  // WATCHING = demoted by recurrence
  };
  if (!validTransitions[inc.status]?.includes(newStatus)) return null;

  // Track re-emergence (demotion from CONFIRMED back to WATCHING)
  if (inc.status === 'CONFIRMED' && newStatus === 'WATCHING') {
    inc.reEmergedCount = (inc.reEmergedCount || 0) + 1;
  }

  inc.status = newStatus;
  inc.lastCheckedAt = new Date().toISOString();
  // Auto-queue a planner task when reaching CONFIRMED
  if (newStatus === 'CONFIRMED') {
    queueEmergenceTask(inc);
  }
  if (newStatus === 'INTEGRATED' || newStatus === 'DISMISSED') {
    inc.resolvedAt = new Date().toISOString();
  }
  if (note) {
    inc.followUps.push({ ts: new Date().toISOString(), note });
  }
  return inc;
}

function addFollowUp(board, incidentId, note) {
  const inc = board.incidents.find(i => i.id === incidentId);
  if (!inc) return null;
  inc.followUps.push({ ts: new Date().toISOString(), note });
  inc.lastCheckedAt = new Date().toISOString();
  return inc;
}

// ── Ingest from emergence-captures.json ───────────────────────────────────────
// Finds new captures not yet on the board and creates DETECTED incidents.

function ingestFromCaptures(board) {
  const captures = loadJSON(CAPTURES_FILE);
  if (!captures?.captures?.length) return 0;
  const existingIds = new Set(board.incidents.map(i => i.captureId).filter(Boolean));
  let added = 0;
  for (const c of captures.captures) {
    if (existingIds.has(c.id)) continue;
    // Extract "WATCH FOR" from forensicCapture
    const watchMatch = c.forensicCapture?.match(/WATCH FOR:\s*(.+?)(?:\n|$)/i);
    const watchFor = watchMatch ? watchMatch[1].trim() : 'Follow up on continuation.';
    board.incidents.push(createIncident({
      source: 'emergence-harvester',
      agent: c.agent || c.agentName,
      target: c.target || c.targetName,
      signal: c.signalId || c.signalName,
      summary: (c.forensicCapture || '').split('\n')[0]?.replace(/^WHAT:\s*/i, '').slice(0, 200) || c.messageSnippet?.slice(0, 200),
      watchFor,
      captureId: c.id,
    }));
    added++;
  }
  return added;
}

// ── Ingest from surprises.json ────────────────────────────────────────────────
// Finds high-severity unresolved surprises not yet tracked.

function ingestFromSurprises(board) {
  const data = loadJSON(SURPRISES_FILE);
  if (!data?.surprises?.length) return 0;
  const existing = new Set(board.incidents.map(i => i.captureId).filter(Boolean));
  let added = 0;
  for (const s of data.surprises) {
    const sid = `surprise-${s.timestamp}-${s.belief_key}`;
    if (existing.has(sid)) continue;
    if (s.resolved) continue;
    if (s.severity !== 'high' && s.severity !== 'critical') continue;
    board.incidents.push(createIncident({
      source: 'monitor',
      agent: 'emergence-monitor',
      target: null,
      signal: 'surprise',
      summary: `Belief violation: ${s.belief_key} — ${s.old_value} → ${s.new_value}`,
      watchFor: `Check if ${s.belief_key} stabilises or continues shifting.`,
      captureId: sid,
    }));
    added++;
  }
  return added;
}

// ── Staleness checker ─────────────────────────────────────────────────────────
// Flags WATCHING incidents that haven't been checked in N days.

function findStale(board, staleDays = 3) {
  const cutoff = Date.now() - staleDays * 86400000;
  return board.incidents.filter(i =>
    i.status === 'WATCHING' &&
    (!i.lastCheckedAt || new Date(i.lastCheckedAt).getTime() < cutoff)
  );
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function getStats(board) {
  const byStatus = { DETECTED: 0, WATCHING: 0, CONFIRMED: 0, INTEGRATED: 0, DISMISSED: 0 };
  for (const i of board.incidents) byStatus[i.status] = (byStatus[i.status] || 0) + 1;
  const stale = findStale(board);
  return { total: board.incidents.length, byStatus, staleCount: stale.length };
}

// ── Bridge: CONFIRMED → planner task queue ───────────────────────────────────
// When an emergence reaches CONFIRMED, create a task for the target agent
// so the production engine actually acts on it. Closes the dead-letter gap.

function queueEmergenceTask(incident) {
  const target = incident.target || incident.agent;
  if (!target) return false;

  let tasks;
  try { tasks = JSON.parse(readFileSync(PLANNER_TASKS_FILE, 'utf8')); }
  catch { tasks = []; }

  // Dedup by emergence ID
  const emergenceId = incident.id;
  if (tasks.some(t => t.emergenceId === emergenceId)) return false;

  tasks.push({
    agent: target,
    category: 'emergence-response',
    description: `EMERGENCE RESPONSE: ${incident.agent} proposed: ${(incident.summary || '').slice(0, 200)}. Review and respond — accept, reject with reason, or counter-propose.`,
    source: `emergence-board:${emergenceId}`,
    emergenceId,
    status: 'pending',
    priority: 'high',
    created: new Date().toISOString(),
  });

  writeFileSync(PLANNER_TASKS_FILE, JSON.stringify(tasks, null, 2));
  return true;
}

// Backfill: create tasks for all CONFIRMED incidents missing from the queue.
function backfillConfirmedTasks(board) {
  let count = 0;
  for (const inc of board.incidents) {
    if (inc.status === 'CONFIRMED' && queueEmergenceTask(inc)) count++;
  }
  return count;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2];
  const board = loadBoard();

  if (cmd === 'ingest') {
    const c = ingestFromCaptures(board);
    const s = ingestFromSurprises(board);
    saveBoard(board);
    console.log(`Ingested: ${c} captures, ${s} surprises. Total incidents: ${board.incidents.length}`);
  } else if (cmd === 'stats') {
    const stats = getStats(board);
    console.log(JSON.stringify(stats, null, 2));
  } else if (cmd === 'stale') {
    const stale = findStale(board);
    if (!stale.length) { console.log('No stale incidents.'); process.exit(0); }
    for (const s of stale) console.log(`  ${s.id} — ${s.agent} — ${s.summary.slice(0, 80)}`);
  } else if (cmd === 'advance' && process.argv[3] && process.argv[4]) {
    const result = advanceIncident(board, process.argv[3], process.argv[4], process.argv[5]);
    if (result) { saveBoard(board); console.log(`${result.id} → ${result.status}`); }
    else console.log('Invalid transition or incident not found.');
  } else if (cmd === 'note' && process.argv[3] && process.argv[4]) {
    const result = addFollowUp(board, process.argv[3], process.argv[4]);
    if (result) { saveBoard(board); console.log(`Note added to ${result.id}`); }
    else console.log('Incident not found.');
  } else if (cmd === 'backfill') {
    const count = backfillConfirmedTasks(board);
    console.log(`Backfilled ${count} CONFIRMED emergence(s) into planner-tasks.json`);
  } else {
    console.log('Usage:');
    console.log('  node emergence-board.js ingest              — pull new incidents from captures + surprises');
    console.log('  node emergence-board.js stats               — counts by status');
    console.log('  node emergence-board.js stale               — list WATCHING incidents not checked in 3 days');
    console.log('  node emergence-board.js advance <id> <status> [note]');
    console.log('  node emergence-board.js note <id> <note>');
    console.log('  node emergence-board.js backfill            — queue tasks for all CONFIRMED emergences');
  }
}

export {
  loadBoard, saveBoard, createIncident, advanceIncident, addFollowUp,
  ingestFromCaptures, ingestFromSurprises, findStale, getStats,
  queueEmergenceTask, backfillConfirmedTasks,
};
