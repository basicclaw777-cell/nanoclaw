/**
 * merch-state.js — Tracks active and archived merch runs
 *
 * Each run: id, idea, reference_images, supplier, samples[],
 * approval_status, order_qty, order_date, delivery_date,
 * colours, sizes, printing_method, cost_per_unit, total_cost
 *
 * Paul's preferences baked in:
 *   - 100% cotton always
 *   - Colour variation plan required
 *   - Premium/limited edition angle considered
 *   - Sample budget $285-350 per sample
 *   - "Get 2-3 supplier quotes before committing"
 *   - Box packaging for limited editions
 *   - Poster tees are the premium anchor line
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME || '/Users/basicclaw777';
const STATE_PATH = path.join(__dirname, 'merch-state.json');
const VAULT_RUNS = path.join(HOME, 'cathedral-vault', '10_Agents', 'merch', 'runs');
const VAULT_IDEAS = path.join(HOME, 'cathedral-vault', '10_Agents', 'merch', 'ideas');

const PAULS_RULES = [
  '100% cotton always',
  'Colour variation plan required before ordering',
  'Premium/limited edition angle — consider box packaging',
  'Sample budget: HK$285-350 per sample',
  'Get 2-3 supplier quotes before committing',
  'Poster tees are the premium anchor line',
];

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8')); }
  catch { return { runs: [], ideas: [] }; }
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function syncToVault(run) {
  try {
    fs.writeFileSync(path.join(VAULT_RUNS, `${run.id}.json`), JSON.stringify(run, null, 2));
  } catch {}
}

// ── Run Management ──────────────────────────────────────────────────────────

export function createRun(idea) {
  const state = loadState();
  const run = {
    id: `merch-${Date.now()}`,
    idea,
    status: 'idea', // idea → sampling → sample_received → approved → ordered → delivered → archived
    reference_images: [],
    supplier: null,
    samples: [],
    approval_status: 'pending',
    order_qty: null,
    order_date: null,
    delivery_date: null,
    colours: [],
    sizes: [],
    printing_method: null,
    cost_per_unit: null,
    total_cost: null,
    material: '100% cotton',
    notes: '',
    reminders: [...PAULS_RULES],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state.runs.push(run);
  saveState(state);
  syncToVault(run);
  return run;
}

export function getRun(runId) {
  return loadState().runs.find(r => r.id === runId) || null;
}

export function getActiveRuns() {
  return loadState().runs.filter(r => !['delivered', 'archived'].includes(r.status));
}

export function getAllRuns() {
  return loadState().runs;
}

export function updateRun(runId, updates) {
  const state = loadState();
  const run = state.runs.find(r => r.id === runId);
  if (!run) return null;
  Object.assign(run, updates, { updatedAt: new Date().toISOString() });
  saveState(state);
  syncToVault(run);
  return run;
}

export function logSample(runId, notes) {
  const state = loadState();
  const run = state.runs.find(r => r.id === runId);
  if (!run) return null;
  run.samples.push({ date: new Date().toISOString(), notes });
  run.status = 'sample_received';
  run.updatedAt = new Date().toISOString();
  saveState(state);
  syncToVault(run);
  return run;
}

export function approveRun(runId) {
  return updateRun(runId, { approval_status: 'approved', status: 'approved' });
}

export function logOrder(runId, qty) {
  return updateRun(runId, {
    order_qty: qty,
    order_date: new Date().toISOString(),
    status: 'ordered',
    total_cost: qty && getRun(runId)?.cost_per_unit ? qty * getRun(runId).cost_per_unit : null,
  });
}

export function markDelivered(runId) {
  return updateRun(runId, { delivery_date: new Date().toISOString(), status: 'delivered' });
}

// ── Ideas Backlog ───────────────────────────────────────────────────────────

export function addIdea(idea) {
  const state = loadState();
  const entry = { id: `idea-${Date.now()}`, idea, createdAt: new Date().toISOString(), status: 'backlog' };
  state.ideas.push(entry);
  saveState(state);
  try { fs.writeFileSync(path.join(VAULT_IDEAS, `${entry.id}.json`), JSON.stringify(entry, null, 2)); } catch {}
  return entry;
}

export function getIdeas() {
  return loadState().ideas;
}

// ── Stale Run Detection (for Physician) ─────────────────────────────────────

export function getStaleRuns(daysSince = 14) {
  const cutoff = Date.now() - daysSince * 86400000;
  return getActiveRuns().filter(r => {
    if (r.status === 'sampling') {
      return new Date(r.updatedAt).getTime() < cutoff;
    }
    return false;
  });
}

// ── Format for Telegram ─────────────────────────────────────────────────────

export function formatStatusTelegram() {
  const active = getActiveRuns();
  if (active.length === 0) return '👕 *Merch Agent*\n\n_No active runs. Start with /merch new [idea]_';

  let text = '👕 *Merch Runs*\n\n';
  for (const r of active) {
    const icon = r.status === 'approved' ? '✅' : r.status === 'ordered' ? '📦' : r.status === 'sample_received' ? '🔍' : '💡';
    text += `${icon} \`${r.id}\`\n`;
    text += `  *${r.idea}*\n`;
    text += `  Status: ${r.status} | Supplier: ${r.supplier || 'none'}\n`;
    if (r.samples.length > 0) text += `  Samples: ${r.samples.length} received\n`;
    if (r.order_qty) text += `  Order: ${r.order_qty} units\n`;
    text += '\n';
  }
  return text;
}

export function formatHistoryTelegram() {
  const runs = getAllRuns();
  if (runs.length === 0) return '_No merch history._';

  let text = '👕 *Merch History*\n\n';
  for (const r of runs.slice(-10).reverse()) {
    text += `• \`${r.id}\` — ${r.idea} [${r.status}]\n`;
    if (r.total_cost) text += `  Cost: HK$${r.total_cost} (${r.order_qty} × $${r.cost_per_unit})\n`;
  }
  return text;
}

export { PAULS_RULES };
