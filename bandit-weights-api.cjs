// bandit-weights-api.js — dump all bandit state as JSON (called by villa server)
const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.env.HOME, 'nanoclaw', 'vortex_data', 'bandit-brain.db');
const db = new Database(dbPath, { readonly: true });
const rows = db.prepare('SELECT agent_id, action, alpha, beta, total_updates, last_updated FROM arms ORDER BY agent_id, action').all();
db.close();
const agents = {};
for (const r of rows) {
  if (!agents[r.agent_id]) agents[r.agent_id] = [];
  agents[r.agent_id].push({
    action: r.action,
    alpha: r.alpha,
    beta: r.beta,
    weight: r.alpha / (r.alpha + r.beta),
    updates: r.total_updates,
    lastUpdated: r.last_updated
  });
}
for (const id of Object.keys(agents)) agents[id].sort((a, b) => b.weight - a.weight);
console.log(JSON.stringify(agents));
