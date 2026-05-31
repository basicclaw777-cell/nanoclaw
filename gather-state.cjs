const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const NANOCLAW = __dirname;
const VORTEX = path.join(NANOCLAW, 'vortex_data');

function safeDb(dbPath, fn) {
  try {
    const db = new Database(dbPath);
    const result = fn(db);
    db.close();
    return result;
  } catch(e) { return { error: e.message }; }
}

// Knowledge Graph
const kgData = safeDb(path.join(VORTEX, 'knowledge-graph.db'), db => {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t=>t.name);
  const result = { tables };
  for (const t of tables) {
    try {
      result[t + '_count'] = db.prepare(`SELECT COUNT(*) as c FROM "${t}"`).get().c;
      result[t + '_sample'] = db.prepare(`SELECT * FROM "${t}" LIMIT 10`).all();
    } catch(e) {}
  }
  return result;
});

// Causal Net
const cnData = safeDb(path.join(VORTEX, 'causal-net.db'), db => {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t=>t.name);
  const result = { tables };
  if (tables.includes('edges')) {
    result.edges = db.prepare('SELECT COUNT(*) as c FROM edges').get().c;
    result.topEdges = db.prepare('SELECT * FROM edges ORDER BY weight DESC LIMIT 15').all();
  }
  if (tables.includes('claim_nodes')) {
    result.claims = db.prepare('SELECT COUNT(*) as c FROM claim_nodes').get().c;
    result.topClaims = db.prepare('SELECT * FROM claim_nodes LIMIT 10').all();
  }
  if (tables.includes('blast_reports')) {
    result.blasts = db.prepare('SELECT COUNT(*) as c FROM blast_reports').get().c;
    result.recentBlasts = db.prepare('SELECT * FROM blast_reports ORDER BY rowid DESC LIMIT 5').all();
  }
  return result;
});

// Ensemble Gate
const enData = safeDb(path.join(VORTEX, 'ensemble.db'), db => {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t=>t.name);
  const result = { tables };
  if (tables.includes('ensemble_runs')) {
    result.runs = db.prepare('SELECT COUNT(*) as c FROM ensemble_runs').get().c;
    result.recent = db.prepare('SELECT * FROM ensemble_runs ORDER BY rowid DESC LIMIT 10').all();
  }
  return result;
});

// Active Learning
const alData = safeDb(path.join(VORTEX, 'active-learning.db'), db => {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t=>t.name);
  const result = { tables };
  if (tables.includes('question_queue')) {
    result.questions = db.prepare('SELECT COUNT(*) as c FROM question_queue').get().c;
    result.top = db.prepare('SELECT * FROM question_queue ORDER BY priority DESC LIMIT 15').all();
  }
  if (tables.includes('domain_health')) {
    result.domains = db.prepare('SELECT * FROM domain_health').all();
  }
  return result;
});

// Trading
const trData = safeDb(path.join(NANOCLAW, 'trader', 'logs', 'trades.db'), db => {
  const open = db.prepare("SELECT asset, direction, strategy, entry_price FROM trades WHERE closed_at IS NULL").all();
  const strats = db.prepare("SELECT strategy, COUNT(*) as trades, SUM(CASE WHEN pnl>0 THEN 1 ELSE 0 END) as wins, ROUND(SUM(pnl),2) as pnl FROM trades WHERE pnl IS NOT NULL GROUP BY strategy ORDER BY pnl DESC").all();
  const decisions = db.prepare("SELECT asset, action, reasoning FROM decisions ORDER BY rowid DESC LIMIT 10").all();
  return { open, strats, recentDecisions: decisions };
});

// Deep signals
let deepSignals = {};
try {
  const raw = JSON.parse(fs.readFileSync(path.join(NANOCLAW, 'trader', 'signals', 'crypto-signals-latest.json'), 'utf8'));
  deepSignals = {
    signalCount: (raw.signals || []).length,
    signals: (raw.signals || []).map(s => ({ type: s.type, asset: s.asset, direction: s.direction, strength: s.strength, reasoning: s.reasoning })),
    fearGreed: raw.fear_greed,
    options: raw.deep_data?.options_flow || {},
    github: raw.deep_data?.github_activity || {},
    stablecoins: Object.keys(raw.deep_data?.stablecoin_flows || {}),
    liquidation: raw.deep_data?.liquidation_levels || {},
    exchangeReserves: raw.deep_data?.exchange_reserves || {},
  };
} catch(e) { deepSignals = { error: e.message }; }

// Vault count
let vaultCount = 0;
function countMd(dir) {
  let c = 0;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (f.isDirectory() && !f.name.startsWith('.')) c += countMd(path.join(dir, f.name));
    else if (f.name.endsWith('.md')) c++;
  }
  return c;
}
try { vaultCount = countMd(path.join(process.env.HOME, 'cathedral-vault')); } catch(e) {}

const state = {
  timestamp: new Date().toISOString(),
  vault_nuggets: vaultCount,
  knowledge_graph: kgData,
  causal_net: cnData,
  ensemble_gate: enData,
  active_learning: alData,
  trading: trData,
  deep_signals: deepSignals,
};

fs.writeFileSync('/tmp/cathedral-state.json', JSON.stringify(state, null, 2));

console.log('=== Cathedral Intelligence State ===');
console.log(`Vault: ${vaultCount} nuggets`);
console.log(`Knowledge Graph: ${JSON.stringify(kgData.tables || [])}`);
console.log(`Causal Net: ${cnData.edges || '?'} edges, ${cnData.claims || '?'} claims`);
console.log(`Ensemble Gate: ${enData.runs || '?'} evaluations`);
console.log(`Active Learning: ${alData.questions || '?'} questions`);
console.log(`Trading: ${trData.open?.length || 0} open positions, ${deepSignals.signalCount || 0} signals`);
console.log(`Deep: ${deepSignals.stablecoins?.length || 0} stablecoins, options on ${Object.keys(deepSignals.options||{}).join(',')||'none'}`);
console.log(`State: /tmp/cathedral-state.json (${(fs.statSync('/tmp/cathedral-state.json').size/1024).toFixed(1)}KB)`);
