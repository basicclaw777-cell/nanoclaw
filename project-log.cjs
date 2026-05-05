// ~/nanoclaw/project-log.js
// Append-only per-project event log for the Constellation nervous system.
// Every agent calls this after completing its work.
// Logs live at ~/Cathedral/projects/memory/{projectId}.jsonl

const fs = require('fs');
const path = require('path');
const os = require('os');

const MEMORY_DIR = path.join(os.homedir(), 'Cathedral', 'projects', 'memory');

function appendProjectLog(projectId, event, data = {}) {
  try {
    if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
    const logPath = path.join(MEMORY_DIR, `${projectId}.jsonl`);
    const entry = JSON.stringify({ ts: Date.now(), event, ...data }) + '\n';
    fs.appendFileSync(logPath, entry);
  } catch (err) {
    console.error(`[project-log] Failed to log ${event} for ${projectId}:`, err.message);
  }
}

function readProjectLog(projectId, maxLines = 50) {
  const logPath = path.join(MEMORY_DIR, `${projectId}.jsonl`);
  if (!fs.existsSync(logPath)) return [];
  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
  return lines.slice(-maxLines).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

function readAllProjectLogs(maxLinesEach = 20) {
  if (!fs.existsSync(MEMORY_DIR)) return {};
  const files = fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.jsonl'));
  const logs = {};
  for (const f of files) {
    const id = f.replace('.jsonl', '');
    logs[id] = readProjectLog(id, maxLinesEach);
  }
  return logs;
}

function listProjectIds() {
  if (!fs.existsSync(MEMORY_DIR)) return [];
  return fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.jsonl')).map(f => f.replace('.jsonl', ''));
}

module.exports = { appendProjectLog, readProjectLog, readAllProjectLogs, listProjectIds };
