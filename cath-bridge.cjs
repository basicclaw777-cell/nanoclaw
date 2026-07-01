#!/usr/bin/env node
'use strict';

const express   = require('express');
const { spawn } = require('child_process');
const path      = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const app      = express();
const PORT     = 8080;
const HOME     = process.env.HOME;
const NANOCLAW = __dirname;
const CATH     = path.join(HOME, 'Cathedral');
const VAULT    = path.join(HOME, 'cathedral-vault');

app.use(express.json());

// ── Neural Bus event emitter ─────────────────────────────────────────────────
// Fire-and-forget POST to neural-bus on every request (non-blocking)
const NEURAL_BUS_URL = 'http://127.0.0.1:8078/event';
const SKIP_NEURAL = new Set(['/api/neural-map', '/neural-map', '/api/newsfeed', '/api/newsfeed/heartbeat', '/newsfeed', '/favicon.ico', '/cathedral-tokens.css']);

app.use((req, res, next) => {
  const url = req.url.split('?')[0];
  if (!SKIP_NEURAL.has(url) && !url.startsWith('/env/icon')) {
    const routeNodes = neuralRouteToNodes(url);
    const payload = JSON.stringify({
      source: 'http',
      method: req.method,
      url: url,
      path: routeNodes,
      label: `${req.method} ${url}`,
    });
    const busReq = require('http').request(NEURAL_BUS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 500,
    });
    busReq.on('error', () => {}); // silent fail — bus might be down
    busReq.end(payload);
  }
  next();
});

function neuralRouteToNodes(url) {
  const map = {
    '/chat': ['telegram', 'bridge'], '/chat/local': ['telegram', 'bridge'],
    '/env/chat': ['bridge', 'dispatch'], '/command': ['telegram', 'bridge'],
    '/vault': ['bridge', 'vault'], '/reed-studio': ['bridge', 'reed'],
    '/api/reed-studio': ['bridge', 'reed'], '/api/content-studio': ['bridge', 'content'],
    '/api/engineering-studio': ['bridge', 'engineering'], '/growth': ['bridge', 'growth'],
    '/comms': ['bridge', 'comms'], '/merch': ['bridge', 'merch'],
    '/course': ['bridge', 'course'], '/publisher': ['bridge', 'publisher'],
    '/trader': ['bridge', 'trading'], '/looking-glass': ['bridge', 'looking-glass'], '/geomag': ['bridge', 'geomag'],
    '/cosmology': ['bridge', 'cosmology'], '/retuning-kitchen': ['bridge', 'research'], '/scraper': ['bridge', 'scraper'],
    '/gym-eyes': ['bridge', 'gym-eyes'], '/techniques': ['bridge', 'techniques'],
    '/screening': ['bridge', 'screening'], '/cathedral-city': ['bridge', 'city'],
    '/constellation': ['bridge', 'constellation'], '/agent-workspace': ['bridge', 'agents'], '/pulse': ['bridge', 'pulse'],
    '/api/architect-pulse': ['bridge', 'pulse'], '/agents': ['bridge', 'dialogue'],
    '/villa': ['bridge', 'monitor'], '/control': ['bridge', 'sentinel'],
    '/hermes': ['bridge', 'dispatch'],
    '/choir': ['bridge', 'choir'],
  };
  if (map[url]) return map[url];
  for (const [route, nodes] of Object.entries(map)) {
    if (url.startsWith(route)) return nodes;
  }
  return ['bridge'];
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Home page ────────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.sendFile(path.join(NANOCLAW, 'cathedral-home.html'));
});

app.get('/emergence-map', (req, res) => {
  res.sendFile(path.join(NANOCLAW, 'paul-emergence.html'));
});

app.get('/workshop-results', (req, res) => {
  res.sendFile(path.join(NANOCLAW, 'workshop-results.html'));
});

// ── Subscriptions & Services Registry ───────────────────────────────────────
app.get('/services', (req, res) => {
  res.sendFile(path.join(NANOCLAW, 'subscriptions-dashboard.html'));
});

app.get('/api/subscriptions', (req, res) => {
  res.sendFile(path.join(NANOCLAW, 'subscriptions.json'));
});

// ── Cathedral Status Board (Module B) ───────────────────────────────────────
// Tabbed board: Services | In Progress | Delivered | Spend.
// The *-index.js scripts (ESM) regenerate their JSON on load so the board is
// always fresh; PM2 crons are optional (see each script's header).
const { execFileSync: _bExec } = require('child_process');
const REED_READY = path.join(HOME, 'reed-dump', 'ready');

// Regenerate an ESM index script, then return its JSON. Falls back to the
// last-written JSON if regeneration fails (e.g. higgsfield offline).
function boardRegen(res, script, jsonFile, label) {
  const jsonPath = path.join(NANOCLAW, jsonFile);
  try {
    _bExec(process.execPath, [path.join(NANOCLAW, script), '--quiet'], {
      cwd: NANOCLAW, timeout: 70000, stdio: 'ignore'
    });
  } catch (e) {
    console.error(`[board] ${label} regen failed, serving last JSON:`, e.message);
  }
  if (require('fs').existsSync(jsonPath)) return res.sendFile(jsonPath);
  return res.status(503).json({ error: `${label} index not available` });
}

app.get(['/cop', '/common-operating-picture'], (req, res) => {
  res.sendFile(path.join(NANOCLAW, 'cop.html'));
});
app.get('/board', (req, res) => {
  res.sendFile(path.join(NANOCLAW, 'board.html'));
});
app.get('/map', (req, res) => {
  res.sendFile(path.join(NANOCLAW, 'cathedral-map.html'));
});
app.get('/enclosure', (req, res) => {
  res.sendFile(path.join(NANOCLAW, 'enclosure-map.html'));
});
app.get('/vortex-lab', (req, res) => {
  res.sendFile(path.join(NANOCLAW, 'vortex-lab.html'));
});
app.get('/vault-graph', (req, res) => {
  res.sendFile(path.join(NANOCLAW, 'vault-graph.html'));
});
app.get('/api/vault-graph', (req, res) => {
  const p = path.join(NANOCLAW, 'vault-graph-data.json');
  if (require('fs').existsSync(p)) return res.sendFile(p);
  res.status(404).json({ error: 'Run: node vault-graph-data.js' });
});
app.get('/logan-pp-map', (req, res) => {
  res.sendFile(path.join(NANOCLAW, 'logan-pp-map.html'));
});
app.get('/course-guide', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'basic-reflex', 'course-guide.html'));
});
app.get('/33-cards', (req, res) => {
  res.sendFile(path.join(HOME, 'basic-reflex', '33-card-grid.html'));
});
app.get('/class-planner', (req, res) => {
  res.sendFile(path.join(HOME, 'basic-reflex', 'class-planner', '33-card-planner.html'));
});
app.get('/coach-training', (req, res) => {
  res.sendFile(path.join(HOME, 'basic-reflex', 'coach-training.html'));
});
app.get('/online-course', (req, res) => {
  res.sendFile(path.join(HOME, 'basic-reflex', 'online-course.html'));
});
app.get('/digital-dojo', (req, res) => {
  res.sendFile(path.join(HOME, 'basic-reflex', 'digital-dojo-deck.html'));
});

// Learning Hub — Cuba methodology digestion samples
app.get('/learning-hub/:file', (req, res) => {
  const f = req.params.file.replace(/[^a-z0-9\-]/gi, '');
  res.sendFile(path.join(HOME, 'basic-reflex', 'learning-hub', f + '.html'));
});
app.get('/retuning-kitchen', (req, res) => {
  res.sendFile(path.join(NANOCLAW, 'retuning-kitchen.html'));
});

// ── BR Class Deck (drill cards, templates, class builder) ─────────────────
app.get('/class-deck', (req, res) => {
  res.sendFile(path.join(HOME, 'basic-reflex', 'class-system', 'class-deck.html'));
});
app.get('/class-deck/drill-bank.json', (req, res) => {
  res.sendFile(path.join(HOME, 'basic-reflex', 'class-system', 'drill-bank.json'));
});
app.get('/whiteboards/:file', (req, res) => {
  res.sendFile(path.join(HOME, 'basic-reflex', 'class-system', 'whiteboards', req.params.file));
});
app.get('/api/delivered', (req, res) => {
  boardRegen(res, 'delivered-index.js', 'delivered-index.json', 'delivered');
});
app.get('/api/spend', (req, res) => {
  boardRegen(res, 'spend-feed.js', 'spend-feed.json', 'spend');
});
app.get('/api/in-progress', (req, res) => {
  boardRegen(res, 'in-progress-index.js', 'in-progress-index.json', 'in-progress');
});
// The Elicitor's gold feed — standing-question engine output (gold-gated).
// Static read (the elicitor writes the feed on its own weekly schedule, not on
// page load), shaped to match the board's tab loaders.
const GOLD_FEED = path.join(NANOCLAW, 'elicitor', 'gold-feed.json');
app.get('/api/gold', (req, res) => {
  let items = [];
  try { if (require('fs').existsSync(GOLD_FEED)) items = JSON.parse(require('fs').readFileSync(GOLD_FEED, 'utf8')); }
  catch (e) { return res.status(503).json({ error: 'gold feed unreadable', detail: e.message }); }
  if (!Array.isArray(items)) items = [];
  const counts = {
    total: items.length,
    acted_on: items.filter(g => g.acted_on).length,
    open: items.filter(g => !g.acted_on).length,
  };
  res.json({ generated_at: new Date().toISOString(), counts, items });
});

// Standing Agency — the SAFE autonomous executor (governance-first). Surfaces
// the action ledger (what it did), the approval queue (what needs Paul), and the
// kill-switch state. Static read of agency files — same shape pattern as gold.
const AGENCY_DIR = path.join(NANOCLAW, 'agency');
app.get('/api/agency', (req, res) => {
  const fsx = require('fs');
  const readJsonl = (p) => { try { return fsx.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; } };
  const readJson = (p, d) => { try { const v = JSON.parse(fsx.readFileSync(p, 'utf8')); return v; } catch { return d; } };

  const ledger = readJsonl(path.join(AGENCY_DIR, 'action-ledger.jsonl'));
  let queue = readJson(path.join(AGENCY_DIR, 'approval-queue.json'), []);
  if (!Array.isArray(queue)) queue = [];
  const state = readJson(path.join(AGENCY_DIR, 'agency-state.json'), {});

  const killSwitch = process.env.AGENCY_PAUSED === '1'
    ? 'env AGENCY_PAUSED=1'
    : (fsx.existsSync(path.join(AGENCY_DIR, 'PAUSED')) ? 'PAUSED file present' : null);

  const today = new Date().toISOString().slice(0, 10);
  const autoToday = ledger.filter(e => e.executed && (e.ts || '').slice(0, 10) === today).length;
  const pending = queue.filter(p => p.status === 'pending');

  const status = {
    kill_switch: killSwitch,
    auto_done_today: autoToday,
    auto_done_total: ledger.filter(e => e.executed).length,
    pending_approvals: pending.length,
    last_run: state.last_run || null,
  };
  res.json({ generated_at: new Date().toISOString(), status, ledger, queue });
});
// The Self-Eliciting Organism — every agent elicits gold in its own domain, a
// meta-ranker surfaces only the gold-of-gold. Static read of the organism's
// jsonl + brief, shaped like the gold tab. The swarm writes on its own (weekly)
// schedule, not on page load.
const ORGANISM_DIR = path.join(NANOCLAW, 'organism');
app.get('/api/organism', (req, res) => {
  const fsx = require('fs');
  // read the gold-of-gold jsonl (one row per surfaced item, most recent run last)
  let rows = [];
  try {
    const p = path.join(ORGANISM_DIR, 'organism-gold.jsonl');
    if (fsx.existsSync(p)) {
      rows = fsx.readFileSync(p, 'utf8').split('\n').filter(Boolean)
        .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    }
  } catch (e) { return res.status(503).json({ error: 'organism feed unreadable', detail: e.message }); }

  // group by run date; surface the most recent run as the headline, keep all for history.
  const runs = {};
  for (const r of rows) { (runs[r.run] = runs[r.run] || []).push(r); }
  const runDates = Object.keys(runs).sort();           // ascending
  const latestRun = runDates.length ? runDates[runDates.length - 1] : null;
  const latest = latestRun ? runs[latestRun].slice().sort((a, b) => b.score - a.score) : [];

  // kill switch state (mirror the swarm's gate)
  const killSwitch = process.env.ORGANISM_PAUSED === '1'
    ? 'env ORGANISM_PAUSED=1'
    : (fsx.existsSync(path.join(ORGANISM_DIR, 'PAUSED')) ? 'PAUSED file present' : null);

  // distinct minds that have ever surfaced gold-of-gold
  const minds = [...new Set(rows.map(r => r.agent))];

  const counts = {
    total: rows.length,
    latest_run: latestRun,
    latest_count: latest.length,
    A: rows.filter(r => r.grade === 'A').length,
    B: rows.filter(r => r.grade === 'B').length,
    minds: minds.length,
  };

  res.json({
    generated_at: new Date().toISOString(),
    kill_switch: killSwitch,
    counts,
    minds,
    latest_run: latestRun,
    items: latest,        // the latest run's gold-of-gold (headline)
    history: rows.slice().reverse(),  // all surfaced gold, newest first
  });
});

// Toggle the "acted on" flag on a gold item (board interaction).
app.post('/api/gold/acted', express.json(), (req, res) => {
  const id = req.body && req.body.id;
  const acted = req.body && req.body.acted;
  if (!id) return res.status(400).json({ error: 'id required' });
  try {
    const fsx = require('fs');
    let items = fsx.existsSync(GOLD_FEED) ? JSON.parse(fsx.readFileSync(GOLD_FEED, 'utf8')) : [];
    const it = items.find(g => g.id === id);
    if (!it) return res.status(404).json({ error: 'not found' });
    it.acted_on = acted ? new Date().toISOString() : null;
    fsx.writeFileSync(GOLD_FEED, JSON.stringify(items, null, 2) + '\n');
    res.json({ ok: true, id, acted_on: it.acted_on });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Emergence Board — Kanban tracker for emergence incidents.
const EMERGENCE_BOARD_FILE = path.join(NANOCLAW, 'emergence-board.json');
app.get('/api/emergence', (req, res) => {
  const fsx = require('fs');
  let board = { incidents: [], version: 1 };
  try { if (fsx.existsSync(EMERGENCE_BOARD_FILE)) board = JSON.parse(fsx.readFileSync(EMERGENCE_BOARD_FILE, 'utf8')); } catch {}
  const incidents = board.incidents || [];
  const byStatus = { DETECTED: 0, WATCHING: 0, CONFIRMED: 0, INTEGRATED: 0, DISMISSED: 0 };
  for (const i of incidents) byStatus[i.status] = (byStatus[i.status] || 0) + 1;
  const staleDays = 3;
  const cutoff = Date.now() - staleDays * 86400000;
  const staleCount = incidents.filter(i =>
    i.status === 'WATCHING' && (!i.lastCheckedAt || new Date(i.lastCheckedAt).getTime() < cutoff)
  ).length;
  // Analytics
  const agentFrom = {}, agentTo = {}, signalTypes = {}, reEmerged = [];
  for (const i of incidents) {
    if (i.agent) agentFrom[i.agent] = (agentFrom[i.agent]||0)+1;
    if (i.target) agentTo[i.target] = (agentTo[i.target]||0)+1;
    if (i.signal) signalTypes[i.signal] = (signalTypes[i.signal]||0)+1;
    if ((i.reEmergedCount||0) > 0) reEmerged.push({ id:i.id, agent:i.agent, target:i.target, signal:i.signal, count:i.reEmergedCount, summary:(i.summary||'').slice(0,120) });
  }
  const topInitiators = Object.entries(agentFrom).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k,v])=>({agent:k,count:v}));
  const topTargets = Object.entries(agentTo).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k,v])=>({agent:k,count:v}));
  const confirmed = incidents.filter(i=>i.status==='CONFIRMED');
  const demoted = incidents.filter(i=>(i.reEmergedCount||0)>0);
  res.json({ generated_at: new Date().toISOString(), counts: { ...byStatus, total: incidents.length, stale: staleCount }, analytics: { topInitiators, topTargets, signalTypes, reEmerged: reEmerged.sort((a,b)=>b.count-a.count).slice(0,15), confirmed: confirmed.length, demoted: demoted.length }, incidents });
});
app.post('/api/emergence/advance', express.json(), (req, res) => {
  const fsx = require('fs');
  const { id, status, note } = req.body || {};
  if (!id || !status) return res.status(400).json({ error: 'id and status required' });
  let board = { incidents: [], version: 1 };
  try { if (fsx.existsSync(EMERGENCE_BOARD_FILE)) board = JSON.parse(fsx.readFileSync(EMERGENCE_BOARD_FILE, 'utf8')); } catch {}
  const inc = board.incidents.find(i => i.id === id);
  if (!inc) return res.status(404).json({ error: 'incident not found' });
  const valid = { DETECTED: ['WATCHING', 'DISMISSED'], WATCHING: ['CONFIRMED', 'DISMISSED'], CONFIRMED: ['INTEGRATED', 'DISMISSED'] };
  if (!valid[inc.status]?.includes(status)) return res.status(400).json({ error: `cannot transition ${inc.status} → ${status}` });
  inc.status = status;
  inc.lastCheckedAt = new Date().toISOString();
  if (status === 'INTEGRATED' || status === 'DISMISSED') inc.resolvedAt = new Date().toISOString();
  if (note) inc.followUps.push({ ts: new Date().toISOString(), note });
  fsx.writeFileSync(EMERGENCE_BOARD_FILE, JSON.stringify(board, null, 2));
  res.json({ ok: true, incident: inc });
});

// Lucy Heartbeat — pulse state + history
const HEARTBEAT_STATE = path.join(NANOCLAW, 'lucy-heartbeat-state.json');
const HEARTBEAT_DIR = path.join(HOME, 'Cathedral', 'agents', 'lucy-heartbeats');
app.get('/api/lucy-heartbeat', (req, res) => {
  const fsx = require('fs');
  let state = { pulseNumber: 0, lastPulse: null, history: [] };
  try { if (fsx.existsSync(HEARTBEAT_STATE)) state = JSON.parse(fsx.readFileSync(HEARTBEAT_STATE, 'utf8')); } catch {}
  let latestContent = null;
  try {
    if (fsx.existsSync(HEARTBEAT_DIR)) {
      const files = fsx.readdirSync(HEARTBEAT_DIR).filter(f => f.endsWith('.md')).sort();
      if (files.length) latestContent = fsx.readFileSync(path.join(HEARTBEAT_DIR, files[files.length - 1]), 'utf8');
    }
  } catch {}
  res.json({ generated_at: new Date().toISOString(), state, latestContent });
});

// Static file server for Reed deliverables (images / videos / caption .md).
// Whitelisted to ~/reed-dump/ready/ — path is validated to stay inside it so
// the route can't be used to read arbitrary files.
app.get('/board/file', (req, res) => {
  const rel = String(req.query.path || '');
  const full = path.resolve(REED_READY, rel);
  if (full !== REED_READY && !full.startsWith(REED_READY + path.sep)) {
    return res.status(403).send('forbidden');
  }
  if (!require('fs').existsSync(full)) return res.status(404).send('not found');
  res.sendFile(full);
});

// ── Auth middleware ────────────────────────────────────────────────────────────

function requireApiKey(req, res, next) {
  const key = process.env.CATH_API_KEY;
  // Allow localhost browser access without key (query param or header)
  if (key && req.headers['x-api-key'] !== key && req.query['x-api-key'] !== key) {
    const host = req.hostname || req.ip || '';
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    // Skip auth for GET requests from localhost (browser access)
    if (!(isLocal && req.method === 'GET')) {
      return res.status(401).json({ error: 'unauthorized' });
    }
  }
  next();
}

// ── Spawn helper ──────────────────────────────────────────────────────────────

function run(cmd, args, timeout = 120_000) {
  return new Promise((resolve, reject) => {
    const proc  = spawn(cmd, args, { env: process.env });
    let stdout  = '';
    let stderr  = '';
    const timer = setTimeout(() => { proc.kill(); reject(new Error('timeout')); }, timeout);
    proc.stdout.on('data', d => { stdout += d; });
    proc.stderr.on('data', d => { stderr += d; });
    proc.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(stderr.trim() || `exit ${code}`));
      else resolve(stdout.trim());
    });
    proc.on('error', err => { clearTimeout(timer); reject(err); });
  });
}

// ── POST /chat/local ──────────────────────────────────────────────────────────

app.post('/chat/local', async (req, res) => {
  const { query, history = [] } = req.body || {};
  if (!query) return res.status(400).json({ error: 'query required' });

  const messages = [
    { role: 'system', content: 'You are Cath — Paul\'s cognitive extension. Be direct, precise, and brief. No filler.' },
    ...history.slice(-10),
    { role: 'user', content: query }
  ];

  try {
    const response = await fetch('http://127.0.0.1:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'hermes3', messages, stream: false })
    });
    const data = await response.json();
    res.json({ response: data.message?.content || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /env/chat — Room-aware agent chat ───────────────────────────────────

app.post('/env/chat', async (req, res) => {
  const { query, history = [], room = 'money' } = req.body || {};
  if (!query) return res.status(400).json({ error: 'query required' });

  // Build room-specific system prompt with live context
  let systemPrompt = '';
  let liveContext = '';

  try {
    if (room === 'money') {
      // Fetch live trading data for context
      const [portfolio, positions, performance, debate] = await Promise.all([
        fs.existsSync(path.join(NANOCLAW, 'trader', 'portfolio.json'))
          ? JSON.parse(fs.readFileSync(path.join(NANOCLAW, 'trader', 'portfolio.json'), 'utf8'))
          : {},
        (() => {
          try {
            const Database = require('better-sqlite3');
            const db = new Database(path.join(NANOCLAW, 'trader', 'logs', 'trades.db'));
            const open = db.prepare('SELECT * FROM trades WHERE status = ?').all('open');
            const closed = db.prepare('SELECT * FROM trades WHERE status = ? ORDER BY closed_at DESC LIMIT 5').all('closed');
            db.close();
            return { open, closed };
          } catch { return { open: [], closed: [] }; }
        })(),
        (() => {
          try {
            const Database = require('better-sqlite3');
            const db = new Database(path.join(NANOCLAW, 'trader', 'logs', 'trades.db'));
            const perf = db.prepare(`SELECT COUNT(*) as total_trades, SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins, SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END) as losses, ROUND(100.0 * SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) / MAX(COUNT(*), 1), 1) as win_rate, ROUND(SUM(pnl), 2) as total_pnl FROM trades WHERE status = 'closed'`).get();
            db.close();
            return perf;
          } catch { return {}; }
        })(),
        (() => {
          try {
            const Database = require('better-sqlite3');
            const db = new Database(path.join(NANOCLAW, 'trader', 'logs', 'trades.db'));
            const row = db.prepare('SELECT * FROM decisions ORDER BY id DESC LIMIT 1').get();
            db.close();
            return row;
          } catch { return null; }
        })()
      ]);

      liveContext = `LIVE TRADING DATA:
Portfolio: $${portfolio.balance || '?'} (started $${portfolio.initial_balance || 10000})
Total P&L: $${performance.total_pnl || 0} | Win rate: ${performance.win_rate || 0}% | ${performance.total_trades || 0} trades
Open positions: ${positions.open?.length || 0}${positions.open?.length ? '\n' + positions.open.map(t => `  - ${t.asset} ${t.direction} @ $${t.entry_price} (${t.strategy})`).join('\n') : ''}
Recent closed: ${positions.closed?.slice(0, 3).map(t => `${t.asset} ${t.direction} P&L:$${t.pnl} (${t.strategy})`).join(', ') || 'none'}
Latest Roundtable: ${debate?.synthesis ? debate.synthesis.substring(0, 200) : 'none'}`;

      systemPrompt = `You are the Trading Desk intelligence for Paul's Cathedral system. You have deep knowledge of all 11 trading strategies running in parallel: Sentiment, Momentum, DCA, Gann, Lunar, Fibonacci, Historical Cycles, Vortex Flow, Suppression Detection, Polymarket, and Cymatics/Schumann.

You know the Roundtable: 8 personas (each strategy has a voice) argue every 4 hours, and the Steward synthesizes their friction into actionable signal. Convergence score 0-10.

Rules: Paper trading phase. Promotion to real money requires 20+ trades, 55% win rate, 1.3 profit factor, 14 days.

Be direct. Speak like a senior trader who also understands unconventional signals. No filler.

${liveContext}`;
    }
  } catch (e) {
    // If context fetch fails, use basic prompt
    if (!systemPrompt) systemPrompt = 'You are the Trading Desk intelligence. Be direct, precise, brief.';
  }

  if (!systemPrompt) systemPrompt = 'You are a Cathedral room agent. Be direct, precise, brief.';

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-10),
    { role: 'user', content: query }
  ];

  try {
    const response = await fetch('http://127.0.0.1:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'hermes3', messages, stream: false })
    });
    const data = await response.json();
    res.json({ response: data.message?.content || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /chat ────────────────────────────────────────────────────────────────

app.post('/chat', async (req, res) => {
  const { query, history = [] } = req.body || {};
  if (!query) return res.status(400).json({ error: 'query required' });

  try {
    const output = await run('python3', [
      path.join(NANOCLAW, 'cath_api.py'),
      '--query',   query,
      '--history', JSON.stringify(history),
    ], 60_000);
    res.json({ response: output });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /command ─────────────────────────────────────────────────────────────

const SENSE_COMMANDS = {
  sight:          ['python3', [path.join(CATH, 'senses', 'sight.py'),          '--scan']],
  proprioception: ['python3', [path.join(CATH, 'senses', 'proprioception.py'), '--scan']],
  smell:          ['python3', [path.join(CATH, 'senses', 'smell.py'),          '--scan']],
};

app.post('/command', async (req, res) => {
  const { command } = req.body || {};
  if (!command) return res.status(400).json({ error: 'command required' });

  if (command === 'gold') {
    try {
      const raw = await run('sqlite3', [
        path.join(HOME, 'nanoclaw', 'vortex_data', 'metrics.db'),
        'SELECT briefing FROM gold_findings ORDER BY run_at DESC LIMIT 1',
      ]);
      return res.json({ output: raw });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const entry = SENSE_COMMANDS[command];
  if (!entry) return res.status(400).json({
    error: `unknown command: ${command}. valid: gold, ${Object.keys(SENSE_COMMANDS).join(', ')}`,
  });

  try {
    const [cmd, args] = entry;
    const output = await run(cmd, args, 300_000);
    res.json({ output });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /vault/read ───────────────────────────────────────────────────────────

app.get('/vault/read', requireApiKey, (req, res) => {
  const rel = req.query.path;
  if (!rel) return res.status(400).json({ error: 'path query param required' });
  const abs = path.resolve(VAULT, rel);
  if (!abs.startsWith(VAULT + path.sep) && abs !== VAULT) {
    return res.status(400).json({ error: 'path outside vault' });
  }
  try {
    const content = require('fs').readFileSync(abs, 'utf8');
    res.json({ path: rel, content });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// ── POST /vault/write ─────────────────────────────────────────────────────────

app.post('/vault/write', requireApiKey, (req, res) => {
  const { path: rel, content, append = false } = req.body || {};
  if (!rel || content === undefined) {
    return res.status(400).json({ error: 'path and content required' });
  }
  const abs = path.resolve(VAULT, rel);
  if (!abs.startsWith(VAULT + path.sep) && abs !== VAULT) {
    return res.status(400).json({ error: 'path outside vault' });
  }
  const fs = require('fs');
  try {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    if (append) {
      fs.appendFileSync(abs, content, 'utf8');
    } else {
      fs.writeFileSync(abs, content, 'utf8');
    }
    res.json({ ok: true, path: rel, action: append ? 'appended' : 'written' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /vault/search ─────────────────────────────────────────────────────────

app.get('/vault/search', requireApiKey, async (req, res) => {
  const { q, top_k = '10', limit, mode } = req.query;
  const k = parseInt(limit || top_k, 10) || 10;
  if (!q) return res.status(400).json({ error: 'q query param required' });

  // Semantic search (default) with keyword fallback
  if (mode !== 'keyword') {
    try {
      const vaultSearch = require(path.join(NANOCLAW, 'vault-search-bridge.cjs'));
      const stats = vaultSearch.getEmbeddingStats();
      if (stats.total > 100) {
        const results = await vaultSearch.semanticSearch(q, k);
        return res.json(results.map(r => ({
          path: r.file_path.replace(process.env.HOME + '/cathedral-vault/', ''),
          title: r.title,
          domain: r.domain,
          score: r.score,
          first_line: r.first_line,
          tags: r.tags,
          mode: 'semantic'
        })));
      }
    } catch (err) {
      console.error('[vault/search] semantic fallback to keyword:', err.message);
    }
  }

  // Keyword fallback
  try {
    const output = await run('python3', [
      path.join(NANOCLAW, 'vault_reader.py'),
      'search', q, '--top_k', String(k), '--json',
    ], 30_000);
    const results = JSON.parse(output);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /vault/related ──────────────────────────────────────────────────────

app.get('/vault/related', requireApiKey, async (req, res) => {
  const { path: filePath, top_k = '10' } = req.query;
  if (!filePath) return res.status(400).json({ error: 'path query param required' });
  const k = parseInt(top_k, 10) || 10;
  const fullPath = filePath.startsWith('/') ? filePath : path.join(process.env.HOME, 'cathedral-vault', filePath);
  try {
    const vaultSearch = require(path.join(NANOCLAW, 'vault-search-bridge.cjs'));
    const results = await vaultSearch.getRelated(fullPath, k);
    res.json(results.map(r => ({
      path: r.file_path.replace(process.env.HOME + '/cathedral-vault/', ''),
      title: r.title,
      domain: r.domain,
      score: r.score,
      semantic_score: r.semantic_score,
      link_boost: r.link_boost,
      tag_boost: r.tag_boost,
      first_line: r.first_line,
      tags: r.tags
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /vault/list ───────────────────────────────────────────────────────────

app.get('/vault/list', requireApiKey, (req, res) => {
  const rel = req.query.folder || '';
  const abs = rel ? path.resolve(VAULT, rel) : VAULT;
  if (!abs.startsWith(VAULT)) {
    return res.status(400).json({ error: 'path outside vault' });
  }
  const fs = require('fs');
  try {
    const entries = fs.readdirSync(abs, { withFileTypes: true });
    const files   = entries
      .filter(e => e.isFile())
      .map(e => path.join(rel, e.name));
    const dirs    = entries
      .filter(e => e.isDirectory())
      .map(e => e.name + '/');
    res.json({ folder: rel || '/', files, dirs });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// ── GET /status ───────────────────────────────────────────────────────────────

app.get('/status', async (req, res) => {
  try {
    const raw   = await run('pm2', ['jlist']);
    const list  = JSON.parse(raw);
    const procs = list.map(p => ({
      name:     p.name,
      status:   p.pm2_env.status,
      pid:      p.pid,
      restarts: p.pm2_env.restart_time,
      uptime:   p.pm2_env.pm_uptime,
      cpu:      p.monit ? p.monit.cpu : 0,
      memory:   p.monit ? p.monit.memory : 0,
    }));
    res.json({ processes: procs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /health/telegram ──────────────────────────────────────────────────────

app.get('/health/telegram', (req, res) => {
  try {
    const statePath = path.join(HOME, 'Cathedral', 'cath-state.json');
    const state = JSON.parse(require('fs').readFileSync(statePath, 'utf8'));
    const health = state.telegram_health || {};
    const lastOk = health.lastUpdateAt || health.lastPollOkAt;
    const ageMs = lastOk ? Date.now() - new Date(lastOk).getTime() : Infinity;
    const status = ageMs < 5 * 60 * 1000 ? 'green' : 'red';
    res.json({
      status,
      lastUpdateAt: health.lastUpdateAt || null,
      lastPollOkAt: health.lastPollOkAt || null,
      pollErrorCount: health.pollErrorCount || 0,
      totalErrors: health.totalErrors || 0,
      ageSeconds: lastOk ? Math.round(ageMs / 1000) : null,
      mode: health.mode || (process.env.TELEGRAM_WEBHOOK_URL ? 'webhook' : 'polling'),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /telegram/webhook — receives Telegram updates from cloudflared ──────
// Forwards to telegram-bot.js internal webhook listener on port 8443

app.post('/telegram/webhook', async (req, res) => {
  try {
    const update = req.body;
    if (!update || !update.update_id) {
      return res.status(400).json({ error: 'invalid update' });
    }
    // Forward to bot's internal webhook listener (only if bot is listening)
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch('http://127.0.0.1:8443/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const result = await resp.json();
    res.json(result);
  } catch (err) {
    // Suppress spam when bot is in polling mode (no webhook listener on 8443)
    if (err.name === 'AbortError' || err.cause?.code === 'ECONNREFUSED') {
      return res.json({ ok: true, note: 'bot in polling mode, webhook ignored' });
    }
    console.error('[webhook] Error forwarding update:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Creative Court: Image Generation ─────────────────────────────────────────

app.post('/creative/generate', requireApiKey, async (req, res) => {
  const { prompt, size = '1024x1024' } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return res.status(500).json({ error: 'REPLICATE_API_TOKEN not set' });

  const [width, height] = size.split('x').map(Number);

  try {
    // Create prediction
    const createRes = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-dev/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: {
          prompt,
          width: width || 1024,
          height: height || 1024,
          num_outputs: 1
        }
      })
    });

    if (!createRes.ok) {
      const errBody = await createRes.text();
      return res.status(createRes.status).json({ error: errBody });
    }

    let prediction = await createRes.json();

    // Poll until complete
    const pollUrl = prediction.urls?.get || `https://api.replicate.com/v1/predictions/${prediction.id}`;
    while (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
      await new Promise(r => setTimeout(r, 1500));
      const pollRes = await fetch(pollUrl, {
        headers: { 'Authorization': `Token ${token}` }
      });
      prediction = await pollRes.json();
    }

    if (prediction.status === 'failed') {
      return res.status(500).json({ error: prediction.error || 'Prediction failed' });
    }

    const output = prediction.output;
    const imageUrl = Array.isArray(output) ? output[0] : output;
    if (!imageUrl) return res.status(500).json({ error: 'No image in response' });

    res.json({ url: imageUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Creative Court: Image Edit (image-to-image) ─────────────────────────────

app.post('/creative/edit', requireApiKey, async (req, res) => {
  const { image_b64, prompt, size = '1024x1024' } = req.body || {};
  if (!image_b64 || !prompt) return res.status(400).json({ error: 'image_b64 and prompt required' });

  const apiKey = process.env.LAOZHANG_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'LAOZHANG_API_KEY not set' });

  try {
    const fs = require('fs');
    const FormData = (await import('undici')).FormData;
    const { Blob } = require('buffer');

    // Convert base64 to buffer
    const imgBuf = Buffer.from(image_b64, 'base64');
    const imgBlob = new Blob([imgBuf], { type: 'image/png' });

    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('image[]', imgBlob, 'input.png');
    form.append('prompt', prompt);
    form.append('size', size);

    const response = await fetch('https://api.laozhang.ai/v1/images/edits', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: form
    });

    if (!response.ok) {
      const errBody = await response.text();
      return res.status(response.status).json({ error: errBody });
    }

    const data = await response.json();
    const img = data.data?.[0];
    res.json({
      b64_json: img?.b64_json || null,
      url: img?.url || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Creative Court: Save Image to Vault ──────────────────────────────────────

app.post('/creative/save-image', requireApiKey, async (req, res) => {
  const { path: relPath, data: b64Data } = req.body || {};
  if (!relPath || !b64Data) return res.status(400).json({ error: 'path and data required' });

  const fs = require('fs');
  const abs = path.resolve(VAULT, relPath);
  if (!abs.startsWith(VAULT)) return res.status(400).json({ error: 'path outside vault' });

  try {
    const dir = path.dirname(abs);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(abs, Buffer.from(b64Data, 'base64'));
    res.json({ ok: true, path: relPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Creative Court: Telegram Notification ────────────────────────────────────

app.post('/creative/notify', requireApiKey, async (req, res) => {
  const { message } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message required' });

  const token = process.env.TELEGRAM_TOKEN;
  const chatId = process.env.PAUL_CHAT_ID;
  if (!token || !chatId) return res.status(500).json({ error: 'Telegram not configured' });

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message })
    });
    const data = await tgRes.json();
    res.json({ ok: data.ok });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Creative Court: Send Telegram Photo ──────────────────────────────────────

app.post('/creative/send-photo', requireApiKey, async (req, res) => {
  const { image_path, caption = '' } = req.body || {};
  if (!image_path) return res.status(400).json({ error: 'image_path required' });

  const token = process.env.TELEGRAM_TOKEN;
  const chatId = process.env.PAUL_CHAT_ID;
  if (!token || !chatId) return res.status(500).json({ error: 'Telegram not configured' });

  const fs = require('fs');

  try {
    const abs = path.resolve(image_path);
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'Image file not found' });

    const { Blob } = require('buffer');
    const FormData = (await import('undici')).FormData;

    const imgBuf = fs.readFileSync(abs);
    const imgBlob = new Blob([imgBuf], { type: 'image/png' });

    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('photo', imgBlob, path.basename(abs));
    if (caption) form.append('caption', caption);

    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      body: form
    });
    const data = await tgRes.json();
    res.json({ ok: data.ok });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Creative Court: Gallery HTML ─────────────────────────────────────────────

app.get('/creative/gallery', (req, res, next) => {
  const accept = req.headers.accept || '';
  if (accept.includes('text/html') && !req.query.format) {
    const galleryPath = path.join(HOME, 'Cathedral', 'br-content', 'gallery.html');
    if (require('fs').existsSync(galleryPath)) return res.sendFile(galleryPath);
  }
  next();
});

// ── Creative Court: List Illustrations (API) ────────────────────────────────

app.get('/creative/gallery', requireApiKey, async (req, res) => {
  const fs = require('fs');
  const illDir = path.join(VAULT, '09_Artifacts', 'illustrations');

  try {
    const results = [];
    function walk(dir, rel) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const fullPath = path.join(dir, e.name);
        const relPath = path.join(rel, e.name);
        if (e.isDirectory()) {
          walk(fullPath, relPath);
        } else if (/\.(png|jpg|jpeg|webp|gif)$/i.test(e.name)) {
          const stat = fs.statSync(fullPath);
          results.push({
            name: e.name,
            path: relPath,
            fullPath,
            size: stat.size,
            modified: stat.mtime.toISOString()
          });
        }
      }
    }
    walk(illDir, '');
    results.sort((a, b) => new Date(b.modified) - new Date(a.modified));
    res.json({ images: results.slice(0, 100) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Serve illustration images ────────────────────────────────────────────────

app.get('/creative/image', (req, res) => {
  // Accept API key from query param for img src tags
  const key = process.env.CATH_API_KEY;
  if (key && req.headers['x-api-key'] !== key && req.query['x-api-key'] !== key) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const fs = require('fs');
  const relPath = req.query.path || '';
  const imgPath = path.resolve(VAULT, '09_Artifacts', 'illustrations', relPath);
  if (!imgPath.startsWith(path.join(VAULT, '09_Artifacts', 'illustrations'))) {
    return res.status(400).json({ error: 'path outside illustrations' });
  }
  if (!fs.existsSync(imgPath)) return res.status(404).json({ error: 'not found' });

  const ext = path.extname(imgPath).toLowerCase();
  const mimeTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
  res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
  fs.createReadStream(imgPath).pipe(res);
});

// ── Graph endpoints ──────────────────────────────────────────────────────────

const GRAPHIFY_OUT = path.join(NANOCLAW, 'graphify-out');

app.get('/graph/html', (req, res) => {
  // Accept API key from query param for iframe src
  const key = process.env.CATH_API_KEY;
  if (key && req.headers['x-api-key'] !== key && req.query['x-api-key'] !== key) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const fs = require('fs');
  const htmlPath = path.join(GRAPHIFY_OUT, 'graph.html');
  if (!fs.existsSync(htmlPath)) return res.status(404).json({ error: 'graph.html not found — run /graphify first' });
  res.setHeader('Content-Type', 'text/html');
  fs.createReadStream(htmlPath).pipe(res);
});

app.get('/graph/stats', requireApiKey, (req, res) => {
  const fs = require('fs');
  const jsonPath = path.join(GRAPHIFY_OUT, 'graph.json');
  if (!fs.existsSync(jsonPath)) return res.json({ exists: false });
  try {
    const stat = fs.statSync(jsonPath);
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const nodes = (data.nodes || []).length;
    const edges = (data.links || data.edges || []).length;
    const communities = new Set((data.nodes || []).map(n => n.community).filter(c => c !== undefined)).size;
    res.json({ exists: true, nodes, edges, communities, updated: stat.mtime.toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

let graphRebuildRunning = false;

app.post('/graph/rebuild', requireApiKey, (req, res) => {
  if (graphRebuildRunning) return res.status(409).json({ error: 'rebuild already running' });
  graphRebuildRunning = true;
  res.json({ status: 'started' });

  const proc = spawn('python3', ['-c', `
import sys, json
from graphify.extract import collect_files, extract
from graphify.detect import detect
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.analyze import god_nodes, surprising_connections
from graphify.report import generate
from graphify.export import to_json, to_html
from pathlib import Path

base = Path('${NANOCLAW.replace(/'/g, "\\'")}')
det = detect(base)
# Filter vector_data
for ft in det.get('files', {}):
    det['files'][ft] = [f for f in det['files'][ft] if not f.startswith('vector_data/')]

code_files = []
for f in det.get('files', {}).get('code', []):
    p = Path(f)
    code_files.extend(collect_files(p) if p.is_dir() else [p])
ext = extract(code_files) if code_files else {'nodes':[],'edges':[],'input_tokens':0,'output_tokens':0}
G = build_from_json(ext)
comms = cluster(G)
coh = score_all(G, comms)
gods = god_nodes(G)
surp = surprising_connections(G, comms)
labels = {cid: 'Community ' + str(cid) for cid in comms}
tokens = {'input': ext.get('input_tokens',0), 'output': ext.get('output_tokens',0)}
report = generate(G, comms, coh, labels, gods, surp, det, tokens, str(base))
out = base / 'graphify-out'
out.mkdir(exist_ok=True)
(out / 'GRAPH_REPORT.md').write_text(report)
to_json(G, comms, str(out / 'graph.json'))
to_html(G, comms, str(out / 'graph.html'), community_labels=labels)
print(json.dumps({'nodes': G.number_of_nodes(), 'edges': G.number_of_edges(), 'communities': len(comms)}))
`], { cwd: NANOCLAW, env: process.env });

  let stdout = '';
  proc.stdout.on('data', d => { stdout += d; });
  proc.stderr.on('data', d => { /* absorb */ });
  proc.on('close', () => { graphRebuildRunning = false; });
  proc.on('error', () => { graphRebuildRunning = false; });
});

app.get('/graph/rebuild/status', requireApiKey, (req, res) => {
  res.json({ running: graphRebuildRunning });
});

// ── Predictive Intelligence ────────────────────────────────────────────────────

const PRED_DIR = path.join(HOME, 'Cathedral', 'predictive-intelligence');

app.get('/predictive/map', (req, res) => {
  const htmlPath = path.join(PRED_DIR, 'predictive-map.html');
  if (!require('fs').existsSync(htmlPath)) return res.status(404).json({ error: 'predictive-map.html not found — run predictive-graph.py first' });
  res.setHeader('Content-Type', 'text/html');
  require('fs').createReadStream(htmlPath).pipe(res);
});

app.get('/predictive/stats', requireApiKey, (req, res) => {
  const jsonPath = path.join(PRED_DIR, 'knowledge-graph.json');
  if (!require('fs').existsSync(jsonPath)) return res.json({ exists: false });
  try {
    const data = JSON.parse(require('fs').readFileSync(jsonPath, 'utf8'));
    res.json({ exists: true, ...data.stats, generated: data.generated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/predictive/seeds', requireApiKey, (req, res) => {
  const seedsPath = path.join(PRED_DIR, 'autonomous-seeds.json');
  if (!require('fs').existsSync(seedsPath)) return res.json([]);
  try {
    res.json(JSON.parse(require('fs').readFileSync(seedsPath, 'utf8')));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/predictive/predictions', requireApiKey, (req, res) => {
  const predPath = path.join(PRED_DIR, 'predictions.json');
  if (!require('fs').existsSync(predPath)) return res.json({});
  try {
    res.json(JSON.parse(require('fs').readFileSync(predPath, 'utf8')));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

let predRebuildRunning = false;
app.post('/predictive/rebuild', requireApiKey, (req, res) => {
  if (predRebuildRunning) return res.status(409).json({ error: 'rebuild already running' });
  predRebuildRunning = true;
  res.json({ status: 'started' });
  const proc = spawn('python3', ['predictive-graph.py', '--all'], {
    cwd: path.join(HOME, 'Cathedral'),
    env: { ...process.env, PATH: `${HOME}/cathedral-venv/bin:${process.env.PATH}` },
  });
  proc.on('close', () => { predRebuildRunning = false; });
});

// ── Villa snapshot ─────────────────────────────────────────────────────────────
// Single consolidated endpoint powering the Cathedral Villa panel.
// Returns everything the panel needs in one call: pm2 state, vault counts,
// sense states, latest muse finding, project count, recent files.

const fs = require('fs');

// Map of Cathedral senses to their PM2 process name
const SENSE_TO_PROCESS = {
  sight:         'sentinel',
  smell:         'sentinel',
  proprioception:'vault-state-refresh',
  transmission:  'cath-bridge',
  reflection:    'cognitive-scanner',
  hearing:       null,             // planned
};

// Board seats and their backing processes
const BOARD_SEATS = [
  { seat: 'cathy',                 process: 'cathedral-bot' },
  { seat: 'orchestrator',          process: null },              // claude.ai
  { seat: 'cowork',                process: 'the-cartographer' },
  { seat: 'claude-code',           process: null },              // local terminal
  { seat: 'universe-intelligence', process: null },              // research advisor
];

function readMuseFinding() {
  const dir = path.join(VAULT, '00_Staging', 'muse-findings');
  try {
    const files = fs.readdirSync(dir)
      .filter(f => f.match(/^\d{4}-\d{2}-\d{2}-muse-finding\.md$/))
      .sort()
      .reverse();
    if (!files.length) return null;
    const latest = files[0];
    const raw = fs.readFileSync(path.join(dir, latest), 'utf8');
    // Strip frontmatter, take first 600 chars
    const body = raw.replace(/^---[\s\S]*?---\n*/, '').trim();
    return {
      date:   latest.slice(0, 10),
      file:   latest,
      snippet: body.slice(0, 600),
      length:  body.length,
    };
  } catch (_) {
    return null;
  }
}

function countVaultFiles() {
  const counts = { total: 0, staging: 0, refined: 0, methods: 0, artifacts: 0 };
  function walk(dir, key) {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, key);
        else if (entry.name.endsWith('.md')) {
          counts.total++;
          if (key) counts[key]++;
        }
      }
    } catch (_) { /* ignore */ }
  }
  walk(path.join(VAULT, '00_Staging'),      'staging');
  walk(path.join(VAULT, '02_Refined_Gold'), 'refined');
  walk(path.join(VAULT, '06_Methods'),      'methods');
  walk(path.join(VAULT, '09_Artifacts'),    'artifacts');
  return counts;
}

function countProjects() {
  try {
    return fs.readdirSync(path.join(VAULT, '08_Project_Orchestrator', 'projects'))
      .filter(f => f.endsWith('.md'))
      .length;
  } catch (_) { return 0; }
}

function recentFiles(limit = 10) {
  const results = [];
  function walk(dir, depth = 0) {
    if (depth > 4) return;
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, depth + 1);
        else if (entry.name.endsWith('.md')) {
          try {
            const st = fs.statSync(full);
            results.push({ path: full.replace(VAULT, ''), mtime: st.mtimeMs });
          } catch (_) { /* ignore */ }
        }
      }
    } catch (_) { /* ignore */ }
  }
  walk(VAULT);
  return results.sort((a, b) => b.mtime - a.mtime).slice(0, limit);
}

async function readPm2State() {
  try {
    const raw  = await run('pm2', ['jlist']);
    const list = JSON.parse(raw);
    const byName = {};
    for (const p of list) {
      byName[p.name] = {
        name:     p.name,
        status:   p.pm2_env.status,
        pid:      p.pid,
        restarts: p.pm2_env.restart_time,
        uptime:   p.pm2_env.pm_uptime,
        cpu:      p.monit ? p.monit.cpu : 0,
        memory:   p.monit ? p.monit.memory : 0,
      };
    }
    return byName;
  } catch (_) {
    return {};
  }
}

// ── Resonance Filter ───────────────────────────────────────────────────────────
// Library module imported via dynamic import (filter is ES module, bridge is CJS).
// Checks incoming briefs against the Cathedral's governing field.

let _resonanceMod = null;
async function getResonance() {
  if (_resonanceMod) return _resonanceMod;
  _resonanceMod = await import(path.join(__dirname, 'resonance-filter.js'));
  return _resonanceMod;
}

app.post('/resonance/check', async (req, res) => {
  const { brief, context } = req.body || {};
  if (!brief || typeof brief !== 'string') {
    return res.status(400).json({ error: 'brief (string) required' });
  }
  try {
    const { checkResonance } = await getResonance();
    const result = checkResonance(brief, context || '');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/villa/snapshot', async (req, res) => {
  try {
    const pm2State = await readPm2State();

    const senses = Object.entries(SENSE_TO_PROCESS).map(([sense, proc]) => ({
      sense,
      process: proc,
      status:  proc ? (pm2State[proc]?.status || 'unknown') : 'planned',
      online:  proc ? pm2State[proc]?.status === 'online' : false,
    }));

    const board = BOARD_SEATS.map(({ seat, process: proc }) => ({
      seat,
      process: proc,
      status:  proc ? (pm2State[proc]?.status || 'unknown') : 'external',
      online:  proc ? pm2State[proc]?.status === 'online' : null,
    }));

    const processes = Object.values(pm2State).map(p => ({
      name:    p.name,
      status:  p.status,
      cpu:     p.cpu,
      memory:  p.memory,
      uptime:  p.uptime,
      restarts:p.restarts,
    }));

    // Gym Eyes summary
    let gymEyes = { students: 0, sessions: 0 };
    try {
      const studentFiles = fs.readdirSync(GYM_EYES_STUDENTS).filter(f => f.endsWith('.json'));
      const sessionFiles = fs.readdirSync(GYM_EYES_SESSIONS).filter(f => f.startsWith('session-') && f.endsWith('.json'));
      gymEyes = { students: studentFiles.length, sessions: sessionFiles.length };
    } catch {}

    res.json({
      ok:        true,
      timestamp: Date.now(),
      muse:      readMuseFinding(),
      vault:     countVaultFiles(),
      projects:  { count: countProjects() },
      senses,
      board,
      processes,
      recent:    recentFiles(10),
      gymEyes,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Villa Phase 2: Projects endpoint ──────────────────────────────────────────

function readProjectCards() {
  const dir = path.join(VAULT, '08_Project_Orchestrator', 'projects');
  const cards = [];
  try {
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.md')) continue;
      const full = path.join(dir, file);
      const stat = fs.statSync(full);
      const raw = fs.readFileSync(full, 'utf8');
      // Parse YAML frontmatter
      if (!raw.startsWith('---')) continue;
      const fmEnd = raw.indexOf('\n---', 3);
      if (fmEnd === -1) continue;
      const fm = raw.slice(3, fmEnd);
      const card = { file: file.replace('.md', ''), updated: stat.mtimeMs };
      for (const line of fm.split('\n')) {
        const m = line.match(/^([\w-]+):\s*"?([^"]*)"?\s*$/);
        if (!m) continue;
        const key = m[1].trim();
        const val = m[2].trim();
        if (key === 'title') card.title = val;
        else if (key === 'project-status') card.status = val;
        else if (key === 'project-priority') card.priority = val;
        else if (key === 'project-next-action') card.nextAction = val;
        else if (key === 'project-domain') card.domain = val;
        else if (key === 'project-target') card.target = val;
        else if (key === 'project-blocked-by') card.blockedBy = val;
        else if (key === 'project-last-updated') card.lastUpdated = val;
      }
      // Body excerpt (first non-frontmatter paragraph)
      const body = raw.slice(fmEnd + 4).trim();
      card.excerpt = body.split('\n\n')[0]?.slice(0, 200) || '';
      cards.push(card);
    }
  } catch (_) { /* ignore */ }
  // Sort: active first, then by priority (critical > high > medium > low), then by updated
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  return cards.sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (b.status === 'active' && a.status !== 'active') return 1;
    const pa = priorityOrder[a.priority] ?? 9;
    const pb = priorityOrder[b.priority] ?? 9;
    if (pa !== pb) return pa - pb;
    return b.updated - a.updated;
  });
}

app.get('/villa/projects', (req, res) => {
  try {
    res.json({ ok: true, projects: readProjectCards() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Villa Phase 2: Artifacts endpoint ─────────────────────────────────────────

function scanArtifacts() {
  const base = path.join(VAULT, '09_Artifacts');
  const exts = new Set(['.html', '.png', '.jpg', '.jpeg', '.svg']);
  const assets = [];
  function walk(dir, depth) {
    if (depth > 5) return;
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full, depth + 1); continue; }
        const ext = path.extname(entry.name).toLowerCase();
        if (!exts.has(ext)) continue;
        try {
          const stat = fs.statSync(full);
          assets.push({
            path: full.replace(base, '').replace(/^\//, ''),
            name: entry.name,
            type: ext.replace('.', ''),
            size: stat.size,
            mtime: stat.mtimeMs,
          });
        } catch (_) {}
      }
    } catch (_) {}
  }
  walk(base, 0);
  return assets.sort((a, b) => b.mtime - a.mtime);
}

app.get('/villa/artifacts', (req, res) => {
  try {
    res.json({ ok: true, artifacts: scanArtifacts() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /technique-library — scan technique-library folder structure ──────────
app.get('/technique-library', (req, res) => {
  const libDir = path.join(VAULT, '09_Artifacts', 'branding', 'basic-reflex', 'technique-library');
  try {
    const techniques = [];
    for (const entry of fs.readdirSync(libDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const folder = entry.name;
      const folderPath = path.join(libDir, folder);
      if (folder === 'defence') {
        // Recurse one level into defence subfolders
        for (const sub of fs.readdirSync(folderPath, { withFileTypes: true })) {
          if (!sub.isDirectory()) continue;
          const subPath = path.join(folderPath, sub.name);
          const images = fs.readdirSync(subPath).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
          techniques.push({
            id: `defence/${sub.name}`,
            folder: `defence/${sub.name}`,
            domain: 'defence',
            images: images.map(f => `branding/basic-reflex/technique-library/defence/${sub.name}/${f}`),
          });
        }
      } else {
        const images = fs.readdirSync(folderPath).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
        techniques.push({
          id: folder,
          folder,
          domain: 'offence',
          images: images.map(f => `branding/basic-reflex/technique-library/${folder}/${f}`),
        });
      }
    }
    // Also pick up root-level images (guard-front.jpg etc)
    const rootImages = fs.readdirSync(libDir).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
    if (rootImages.length) {
      techniques.push({
        id: '_root',
        folder: '',
        domain: 'root',
        images: rootImages.map(f => `branding/basic-reflex/technique-library/${f}`),
      });
    }
    res.json({ ok: true, techniques });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Gym Eyes API ──────────────────────────────────────────────────────────────

const GYM_EYES_SESSIONS = path.join(HOME, 'basic-reflex', 'gym-eyes', 'sessions');
const GYM_EYES_STUDENTS = path.join(HOME, 'basic-reflex', 'gym-eyes', 'students');

app.get('/gym-eyes/data', (req, res) => {
  try {
    // Recent sessions
    let sessions = [];
    try {
      sessions = fs.readdirSync(GYM_EYES_SESSIONS)
        .filter(f => f.startsWith('session-') && f.endsWith('.json'))
        .map(f => {
          const stats = fs.statSync(path.join(GYM_EYES_SESSIONS, f));
          const data = JSON.parse(fs.readFileSync(path.join(GYM_EYES_SESSIONS, f), 'utf8'));
          return { file: f, date: data.session_date || stats.mtime.toISOString(), totalPunches: data.total_punches || 0, fighters: (data.fighters || []).length };
        })
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 20);
    } catch {}

    // Students
    let students = [];
    try {
      students = fs.readdirSync(GYM_EYES_STUDENTS)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const p = JSON.parse(fs.readFileSync(path.join(GYM_EYES_STUDENTS, f), 'utf8'));
          return {
            name: p.name, level: p.level, stance: p.stance,
            sessions: p.cumulative?.total_sessions || 0,
            punches: p.cumulative?.total_punches || 0,
            steps: p.cumulative?.total_steps || 0,
            flags: (p.flags || []).map(fl => ({ type: fl.type, severity: fl.severity })),
            milestones: (p.milestones || []).length,
            drills: (p.drill_assignments || []).filter(d => d.status === 'active').length,
            lastSession: p.sessions?.length ? p.sessions[p.sessions.length - 1].date : null,
          };
        });
    } catch {}

    res.json({ ok: true, sessions, students, sessionCount: sessions.length, studentCount: students.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/gym-eyes/student/:name', (req, res) => {
  const safeName = req.params.name.toLowerCase().replace(/ /g, '-');
  const profilePath = path.join(GYM_EYES_STUDENTS, `${safeName}.json`);
  if (!fs.existsSync(profilePath)) return res.status(404).json({ ok: false, error: 'student not found' });
  try {
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    res.json({ ok: true, profile });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/gym-eyes/session/:file', (req, res) => {
  const file = path.basename(req.params.file);
  const sessionPath = path.join(GYM_EYES_SESSIONS, file);
  if (!fs.existsSync(sessionPath)) return res.status(404).json({ ok: false, error: 'session not found' });
  try {
    const data = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Serve dashboard HTML files from students dir
app.get('/gym-eyes/dashboard/:name', (req, res) => {
  const safeName = req.params.name.toLowerCase().replace(/ /g, '-');
  const dashPath = path.join(GYM_EYES_STUDENTS, `${safeName}-dashboard.html`);
  if (!fs.existsSync(dashPath)) return res.status(404).send('Dashboard not found. Generate via: python student_profiles.py dashboard --name ' + req.params.name);
  res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
  res.sendFile(dashPath);
});

// Cuba Combo Library dashboard + assets
app.get('/gym-eyes/vision-landscape', (req, res) => {
  const p = path.join(HOME, 'basic-reflex', 'gym-eyes', 'vision-landscape.html');
  if (!fs.existsSync(p)) return res.status(404).send('Not found');
  res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
  res.sendFile(p);
});

// ── BR Website mockup ───────────────────────────────────────────────────────
app.use('/br-website', express.static(path.join(HOME, 'basic-reflex', 'website')));

// ── Study Lab ───────────────────────────────────────────────────────────────
const STUDY_OUTPUT = path.join(NANOCLAW, 'study-lab-output');
const PODCAST_DIR = path.join(HOME, 'Cathedral', 'podcasts');

app.get('/study-lab', (req, res) => {
  res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
  res.sendFile(path.join(NANOCLAW, 'study-lab-dashboard.html'));
});

app.get('/study-lab/file/:name', (req, res) => {
  const p = path.join(STUDY_OUTPUT, path.basename(req.params.name));
  if (!fs.existsSync(p)) return res.status(404).send('Not found');
  res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
  res.sendFile(p);
});

app.get('/study-lab/audio/:name', (req, res) => {
  const p = path.join(PODCAST_DIR, path.basename(req.params.name));
  if (!fs.existsSync(p)) return res.status(404).send('Not found');
  res.sendFile(p);
});

app.get('/api/study-lab', (req, res) => {
  const podcasts = fs.existsSync(PODCAST_DIR)
    ? fs.readdirSync(PODCAST_DIR).filter(f => f.endsWith('.mp3')).sort().reverse().map(f => {
        const mdPath = path.join(PODCAST_DIR, f.replace('.mp3', '.md'));
        let meta = {};
        if (fs.existsSync(mdPath)) {
          const content = fs.readFileSync(mdPath, 'utf8');
          const fm = content.match(/^---\n([\s\S]*?)\n---/);
          if (fm) fm[1].split('\n').forEach(line => {
            const [k, ...v] = line.split(':');
            if (k && v.length) meta[k.trim()] = v.join(':').trim();
          });
        }
        return { file: f, ...meta };
      })
    : [];
  const slides = fs.existsSync(STUDY_OUTPUT)
    ? fs.readdirSync(STUDY_OUTPUT).filter(f => f.startsWith('slides-')).sort().reverse()
    : [];
  const mindmaps = fs.existsSync(STUDY_OUTPUT)
    ? fs.readdirSync(STUDY_OUTPUT).filter(f => f.startsWith('mindmap-')).sort().reverse()
    : [];
  const quizzes = fs.existsSync(STUDY_OUTPUT)
    ? fs.readdirSync(STUDY_OUTPUT).filter(f => f.startsWith('quiz-')).sort().reverse()
    : [];
  res.json({ podcasts, slides, mindmaps, quizzes });
});

app.post('/api/study-lab/generate', async (req, res) => {
  const { topic, type, speakers } = req.body || {};
  if (!topic) return res.status(400).json({ error: 'Topic required' });
  try {
    const { execFileSync } = require('child_process');
    const studyLab = path.join(NANOCLAW, 'study-lab.js');
    const results = {};
    if (type === 'slides' || type === 'all') {
      execFileSync('node', [studyLab, 'slides', topic], { cwd: NANOCLAW, timeout: 120000, stdio: 'pipe' });
      results.slides = true;
    }
    if (type === 'mindmap' || type === 'all') {
      execFileSync('node', [studyLab, 'mindmap', topic], { cwd: NANOCLAW, timeout: 120000, stdio: 'pipe' });
      results.mindmap = true;
    }
    if (type === 'quiz' || type === 'all') {
      execFileSync('node', [studyLab, 'quiz', topic], { cwd: NANOCLAW, timeout: 120000, stdio: 'pipe' });
      results.quiz = true;
    }
    if (type === 'podcast' || type === 'all') {
      const podArgs = [path.join(NANOCLAW, 'cathedral-podcast.js'), topic];
      if (speakers) podArgs.push(`--speakers=${speakers}`);
      execFileSync('node', podArgs, { cwd: NANOCLAW, timeout: 600000, stdio: 'pipe' });
      results.podcast = true;
    }
    res.json({ ok: true, message: `Generated: ${Object.keys(results).join(', ')}`, results });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Generation failed' });
  }
});

// ── Fundamentals Syllabus ────────────────────────────────────────────────────
const SYLLABUS_CONFIG = path.join(NANOCLAW, 'syllabus-config.json');

app.get('/syllabus', (req, res) => {
  res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
  res.sendFile(path.join(NANOCLAW, 'syllabus-dashboard.html'));
});

app.get('/api/syllabus', (req, res) => {
  try {
    const config = JSON.parse(fs.readFileSync(SYLLABUS_CONFIG, 'utf8'));
    const topics = config.topics || [];
    const completed = topics.filter(t => t.status === 'completed').length;
    const inProgress = topics.filter(t => t.status === 'in_progress').length;
    const enriched = topics.map(t => ({
      ...t,
      available: t.status === 'not_started' && (t.prerequisites || []).every(pid =>
        topics.find(p => p.id === pid)?.status === 'completed'
      )
    }));
    res.json({ topics: enriched, progress: { completed, inProgress, total: topics.length, percent: Math.round((completed / topics.length) * 100) } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/syllabus/complete', (req, res) => {
  try {
    const { topicId } = req.body || {};
    if (!topicId) return res.status(400).json({ error: 'topicId required' });
    const config = JSON.parse(fs.readFileSync(SYLLABUS_CONFIG, 'utf8'));
    const topic = config.topics.find(t => t.id === topicId);
    if (!topic) return res.status(404).json({ ok: false, error: `Topic "${topicId}" not found` });
    topic.status = 'completed';
    topic.completedAt = new Date().toISOString();
    config._updated = new Date().toISOString().split('T')[0];
    fs.writeFileSync(SYLLABUS_CONFIG, JSON.stringify(config, null, 2) + '\n');
    const unlocked = config.topics.filter(t => {
      if (t.status !== 'not_started') return false;
      return (t.prerequisites || []).every(pid => config.topics.find(p => p.id === pid)?.status === 'completed');
    });
    res.json({ ok: true, completed: topic.title, newlyUnlocked: unlocked.map(t => ({ id: t.id, title: t.title })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/syllabus/start', (req, res) => {
  try {
    const { topicId } = req.body || {};
    if (!topicId) return res.status(400).json({ error: 'topicId required' });
    const config = JSON.parse(fs.readFileSync(SYLLABUS_CONFIG, 'utf8'));
    const topic = config.topics.find(t => t.id === topicId);
    if (!topic) return res.status(404).json({ ok: false, error: `Topic "${topicId}" not found` });
    topic.status = 'in_progress';
    topic.startedAt = new Date().toISOString();
    config._updated = new Date().toISOString().split('T')[0];
    fs.writeFileSync(SYLLABUS_CONFIG, JSON.stringify(config, null, 2) + '\n');
    res.json({ ok: true, started: topic.title });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/syllabus/generate', async (req, res) => {
  try {
    const { topicId } = req.body || {};
    if (!topicId) return res.status(400).json({ error: 'topicId required' });
    const config = JSON.parse(fs.readFileSync(SYLLABUS_CONFIG, 'utf8'));
    const topic = config.topics.find(t => t.id === topicId);
    if (!topic) return res.status(404).json({ ok: false, error: `Topic "${topicId}" not found` });
    const searchQuery = [topic.title, ...(topic.vaultKeywords || []).slice(0, 3)].join(' ');
    const { execFileSync } = require('child_process');
    const studyLab = path.join(NANOCLAW, 'study-lab.js');
    const results = {};
    try {
      execFileSync('node', [studyLab, 'slides', searchQuery], { cwd: NANOCLAW, timeout: 120000, stdio: 'pipe' });
      results.slides = { path: path.join(STUDY_OUTPUT, `slides-${topicId}.html`) };
    } catch (e2) { results.slidesError = e2.message; }
    try {
      execFileSync('node', [studyLab, 'mindmap', searchQuery], { cwd: NANOCLAW, timeout: 120000, stdio: 'pipe' });
      results.mindmap = { path: path.join(STUDY_OUTPUT, `mindmap-${topicId}.html`) };
    } catch (e2) { results.mindmapError = e2.message; }
    try {
      execFileSync('node', [studyLab, 'quiz', searchQuery], { cwd: NANOCLAW, timeout: 120000, stdio: 'pipe' });
      results.quiz = { path: path.join(STUDY_OUTPUT, `quiz-${topicId}.html`) };
    } catch (e2) { results.quizError = e2.message; }
    res.json({ ok: true, topic: topic.title, topicId, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/syllabus/next', (req, res) => {
  try {
    const config = JSON.parse(fs.readFileSync(SYLLABUS_CONFIG, 'utf8'));
    const topics = config.topics || [];
    const current = topics.find(t => t.status === 'in_progress');
    if (current) return res.json({ topic: current, reason: 'Currently in progress' });
    const available = topics.filter(t => {
      if (t.status !== 'not_started') return false;
      return (t.prerequisites || []).every(pid => topics.find(p => p.id === pid)?.status === 'completed');
    }).sort((a, b) => a.difficulty - b.difficulty);
    if (available.length === 0) {
      const remaining = topics.filter(t => t.status !== 'completed');
      return res.json({ topic: null, reason: remaining.length === 0 ? 'All 20 fundamentals completed!' : 'No topics available' });
    }
    res.json({ topic: available[0], reason: `Lowest difficulty available (${available.length} unlocked)` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/syllabus/suggest', (req, res) => {
  try {
    const thread = (req.query.thread || '').toLowerCase();
    if (!thread) return res.json({ topic: null, reason: 'No thread provided' });
    const config = JSON.parse(fs.readFileSync(SYLLABUS_CONFIG, 'utf8'));
    const topics = config.topics || [];
    const scored = topics.filter(t => t.status !== 'completed').map(t => {
      let score = 0;
      for (const kw of (t.vaultKeywords || [])) { if (thread.includes(kw.toLowerCase())) score += 3; }
      for (const d of (t.domains || [])) { if (thread.includes(d.replace(/_/g, ' '))) score += 2; }
      if (thread.includes(t.title.toLowerCase())) score += 5;
      if (thread.includes(t.id.replace(/-/g, ' '))) score += 4;
      const available = (t.prerequisites || []).every(pid => topics.find(p => p.id === pid)?.status === 'completed');
      if (available && t.status === 'not_started') score += 1;
      return { topic: t, score, available };
    }).filter(s => s.score > 0).sort((a, b) => b.score - a.score);
    if (scored.length === 0) return res.json({ topic: null, reason: `No match for "${req.query.thread}"` });
    const best = scored[0];
    res.json({ topic: best.topic, reason: `Matches "${req.query.thread}" (score: ${best.score})`, available: best.available });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/brand-dna', (req, res) => {
  const p = path.join(HOME, 'basic-reflex', 'visuals', 'brand-dna.html');
  if (!fs.existsSync(p)) return res.status(404).send('Not found');
  res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
  res.sendFile(p);
});

const CUBA_LIB = path.join(HOME, 'basic-reflex', 'gym-eyes', 'cuba-library');
app.get('/cuba-combos', (req, res) => {
  res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
  res.sendFile(path.join(CUBA_LIB, 'cuba-dashboard.html'));
});
app.get('/cuba-combos/:file', (req, res) => {
  const filePath = path.join(CUBA_LIB, path.basename(req.params.file));
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.sendFile(filePath);
});
app.get('/cuba-combos/clips/:file', (req, res) => {
  const filePath = path.join(CUBA_LIB, 'clips', path.basename(req.params.file));
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.sendFile(filePath);
});
app.get('/cuba-combos/frames/:file', (req, res) => {
  const filePath = path.join(CUBA_LIB, 'frames', path.basename(req.params.file));
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.sendFile(filePath);
});

// Serve BR daily brief dashboard
app.get('/br-brief', (req, res) => {
  const briefPath = path.join(__dirname, 'br-briefs', 'latest-brief.html');
  if (!fs.existsSync(briefPath)) return res.status(404).send('No brief generated yet. Run: node br-preclass-brief.js');
  res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
  res.sendFile(briefPath);
});

// Serve BR Command Centre
app.get('/br-command', (req, res) => {
  const p = path.join(process.env.HOME, 'basic-reflex', 'br-command.html');
  if (!fs.existsSync(p)) return res.status(404).send('Not found');
  res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
  res.sendFile(p);
});

// Serve Class Planner
const CLASS_PLANNER_DIR = path.join(process.env.HOME, 'basic-reflex', 'class-planner');

app.get('/class-planner', (req, res) => {
  const p = path.join(CLASS_PLANNER_DIR, 'class-planner.html');
  if (!fs.existsSync(p)) return res.status(404).send('Not found');
  res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
  res.sendFile(p);
});

app.get('/class-planner/data/plan', (req, res) => {
  const p = path.join(CLASS_PLANNER_DIR, 'week-plan.json');
  if (!fs.existsSync(p)) return res.json({});
  res.set('Cache-Control', 'no-store');
  res.json(JSON.parse(fs.readFileSync(p, 'utf-8')));
});

app.post('/class-planner/data/plan', (req, res) => {
  const p = path.join(CLASS_PLANNER_DIR, 'week-plan.json');
  fs.writeFileSync(p, JSON.stringify(req.body, null, 2));
  res.json({ ok: true });
});

app.get('/class-planner/data/drills', (req, res) => {
  const p = path.join(CLASS_PLANNER_DIR, 'drill-bank.json');
  if (!fs.existsSync(p)) return res.json([]);
  res.set('Cache-Control', 'no-store');
  res.json(JSON.parse(fs.readFileSync(p, 'utf-8')));
});

app.get('/class-planner/data/history', (req, res) => {
  const p = path.join(CLASS_PLANNER_DIR, 'planner-history.json');
  if (!fs.existsSync(p)) return res.json([]);
  res.set('Cache-Control', 'no-store');
  res.json(JSON.parse(fs.readFileSync(p, 'utf-8')));
});

app.post('/class-planner/archive', (req, res) => {
  const planPath = path.join(CLASS_PLANNER_DIR, 'week-plan.json');
  const histPath = path.join(CLASS_PLANNER_DIR, 'planner-history.json');
  if (!fs.existsSync(planPath)) return res.status(404).json({ error: 'No plan to archive' });
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
  const history = fs.existsSync(histPath) ? JSON.parse(fs.readFileSync(histPath, 'utf-8')) : [];
  history.unshift({ ...plan, archivedAt: new Date().toISOString() });
  fs.writeFileSync(histPath, JSON.stringify(history, null, 2));
  // Reset plan for new week
  const today = new Date();
  const nextMon = new Date(today);
  nextMon.setDate(today.getDate() + ((8 - today.getDay()) % 7 || 7));
  plan.weekOf = nextMon.toISOString().split('T')[0];
  plan.theme = 'Set your theme for the week';
  for (const d of Object.values(plan.domains)) { d.heat = 'medium'; d.drills = []; d.notes = ''; }
  for (const c of Object.values(plan.classes)) { c.notes = ''; }
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));
  res.json({ ok: true, archived: history.length });
});

// ── Boxing loop — reverse link (CRM tap → outcome ledger) ────────────────────
// Serve the CRM tap-screen same-origin so it can POST outcomes back to the loop.
app.get('/crm', (req, res) => {
  const p = path.join(process.env.HOME, 'basic-reflex', 'crm', 'tap-screen.html');
  if (!fs.existsSync(p)) return res.status(404).send('Not found');
  res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
  res.sendFile(p);
});

// A gate-pass / session signal from the CRM becomes a boxing outcome (Paul-as-sensor,
// now automatic). Reuses the tested boxing-loop CLI — no duplicated ledger logic.
app.post('/boxing/outcome', (req, res) => {
  const { execFile } = require('child_process');
  const b = req.body || {};
  const text = (b.text || '').toString().slice(0, 200);
  const VALID = ['SUCCESS', 'PARTIAL', 'NEUTRAL', 'FAILURE', 'UNEXPECTED'];
  const result = VALID.includes((b.result || '').toString().toUpperCase()) ? b.result.toUpperCase() : 'NEUTRAL';
  if (!text) return res.status(400).json({ error: 'text required' });
  const args = ['boxing-loop.js', '--outcome', text, '--result', result];
  if (b.client) args.push('--client', String(b.client).slice(0, 60));
  if (b.drill) args.push('--drill', String(b.drill).slice(0, 80));
  if (b.mag) args.push('--mag', String(parseInt(b.mag, 10) || 5));
  execFile('node', args, { cwd: __dirname, timeout: 15000 }, (err, stdout) => {
    if (err) return res.status(500).json({ error: 'loop failed', detail: String(err).slice(0, 200) });
    res.json({ ok: true, logged: text, result, out: (stdout || '').trim().split('\n')[0] });
  });
});

// Serve open gym card
app.get('/open-gym', (req, res) => {
  const p = path.join(process.env.HOME, 'basic-reflex', 'open-gym', 'open-gym-card.html');
  if (!fs.existsSync(p)) return res.status(404).send('Not found');
  res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
  res.sendFile(p);
});

// Serve kids class card
app.get('/kids-class', (req, res) => {
  const cardPath = path.join(process.env.HOME, 'basic-reflex', 'kids-class', 'kids-class-card.html');
  if (!fs.existsSync(cardPath)) return res.status(404).send('Not found');
  res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
  res.sendFile(cardPath);
});

app.get('/10-block', (req, res) => {
  const p = path.join(process.env.HOME, 'basic-reflex', '10-block-pathway', '10-block-card.html');
  if (!fs.existsSync(p)) return res.status(404).send('Not found');
  res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
  res.sendFile(p);
});

// === Gym Eyes Analytics Tier 1 API ===
const GYM_EYES_DIR = path.join(HOME, 'basic-reflex', 'gym-eyes');

// Analytics dashboard
app.get('/gym-eyes/analytics', (req, res) => {
  const dashPath = path.join(GYM_EYES_DIR, 'analytics-dashboard.html');
  if (!fs.existsSync(dashPath)) return res.status(404).send('Analytics dashboard not found');
  res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
  res.sendFile(dashPath);
});

// List sessions for analytics dropdown
app.get('/gym-eyes/analytics/sessions', (req, res) => {
  const sessDir = path.join(GYM_EYES_DIR, 'sessions');
  if (!fs.existsSync(sessDir)) return res.json([]);
  const files = fs.readdirSync(sessDir)
    .filter(f => f.startsWith('session-') && f.endsWith('.json'))
    .sort();
  const sessions = files.map(f => {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(sessDir, f), 'utf-8'));
      return { file: f, date: (d.session_date || '').split('T')[0], punches: d.total_punches || 0 };
    } catch { return { file: f, date: '', punches: 0 }; }
  });
  res.json(sessions);
});

// Run Python analytics on a session file
function runPyAnalytics(script, sessionFile) {
  const sessPath = path.join(GYM_EYES_DIR, 'sessions', sessionFile);
  if (!fs.existsSync(sessPath)) return { error: 'Session not found' };
  try {
    const { execFileSync } = require('child_process');
    const result = execFileSync('python3', [
      '-c',
      `import json, sys; sys.path.insert(0, '${GYM_EYES_DIR}'); from ${script} import *; ` +
      `d = json.load(open('${sessPath}')); ` +
      (script === 'punch_power' ? `print(json.dumps(PowerScorer().analyze_session(d)))` :
       script === 'combo_matcher' ? `print(json.dumps(ComboMatcher().analyze_session(d)))` :
       script === 'session_analytics' ? `print(json.dumps(SessionAnalytics().analyze(d)))` :
       script === 'auto_highlights' ? `print(json.dumps(HighlightEngine().extract(d)))` : '{}')
    ], { timeout: 15000, encoding: 'utf-8' });
    return JSON.parse(result.trim());
  } catch (err) {
    return { error: err.message?.substring(0, 200) || 'Analysis failed' };
  }
}

app.get('/gym-eyes/analytics/session/:file', (req, res) => {
  res.json(runPyAnalytics('session_analytics', req.params.file));
});

app.get('/gym-eyes/analytics/power/:file', (req, res) => {
  res.json(runPyAnalytics('punch_power', req.params.file));
});

app.get('/gym-eyes/analytics/combos/:file', (req, res) => {
  res.json(runPyAnalytics('combo_matcher', req.params.file));
});

app.get('/gym-eyes/analytics/highlights/:file', (req, res) => {
  res.json(runPyAnalytics('auto_highlights', req.params.file));
});

// Trends: compare all sessions
app.get('/gym-eyes/analytics/trends', (req, res) => {
  const sessDir = path.join(GYM_EYES_DIR, 'sessions');
  if (!fs.existsSync(sessDir)) return res.json({ error: 'No sessions' });
  try {
    const { execFileSync } = require('child_process');
    const result = execFileSync('python3', [
      '-c',
      `import json, sys; sys.path.insert(0, '${GYM_EYES_DIR}'); from session_analytics import SessionAnalytics; ` +
      `a = SessionAnalytics(); sessions = a.load_all_sessions(); print(json.dumps(a.compare_sessions(sessions)))`
    ], { timeout: 30000, encoding: 'utf-8' });
    res.json(JSON.parse(result.trim()));
  } catch (err) {
    res.json({ error: err.message?.substring(0, 200) || 'Trend analysis failed' });
  }
});

// Competitions: formats + history
app.get('/gym-eyes/analytics/competitions', (req, res) => {
  const statePath = path.join(GYM_EYES_DIR, 'competition-state.json');
  let history = [];
  try { history = JSON.parse(fs.readFileSync(statePath, 'utf-8')).history || []; } catch {}
  res.json({
    formats: {
      punch_race: { name: 'Punch Race', description: 'Most punches in time window', metric: 'total_punches', duration_default: 60 },
      form_fight: { name: 'Form Fight', description: 'Best average form score', metric: 'avg_form_score', duration_default: 120 },
      combo_challenge: { name: 'Combo Challenge', description: 'Most Cuba library combo matches', metric: 'matched_combos', duration_default: 120 },
      power_king: { name: 'Power King', description: 'Highest average power score', metric: 'avg_power', duration_default: 90 },
      endurance_ladder: { name: 'Endurance Ladder', description: 'Most consistent punch rate', metric: 'consistency_score', duration_default: 180 },
      combo_bingo: { name: 'Combo Bingo', description: 'Hit specific Cuba combo sequences', metric: 'bingo_hits', duration_default: 180 },
    },
    history,
  });
});

// Serve the main gym-eyes dashboard/hub
app.get('/gym-eyes', (req, res) => {
  const hubPath = path.join(HOME, 'basic-reflex', 'gym-eyes', 'hub.html');
  if (!fs.existsSync(hubPath)) return res.redirect('/gym-eyes/data');
  res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
  res.sendFile(hubPath);
});

// Serve PCA cluster visualization
app.get('/gym-eyes/clusters', (req, res) => {
  const pcaPath = path.join(HOME, 'basic-reflex', 'gym-eyes', 'pca_clusters.html');
  if (!fs.existsSync(pcaPath)) return res.status(404).send('No PCA visualization yet. Run: python3 pose_classifier.py viz');
  res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
  res.sendFile(pcaPath);
});

// Classifier status
app.get('/gym-eyes/classifier', (req, res) => {
  const modelPath = path.join(HOME, 'basic-reflex', 'gym-eyes', 'models', 'punch_classifier.pkl');
  const trainingDir = path.join(HOME, 'basic-reflex', 'gym-eyes', 'training_data');
  const modelExists = fs.existsSync(modelPath);
  let trainingFiles = 0, totalSamples = 0;
  if (fs.existsSync(trainingDir)) {
    const files = fs.readdirSync(trainingDir).filter(f => f.endsWith('.json'));
    trainingFiles = files.length;
    for (const f of files) {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(trainingDir, f), 'utf-8'));
        totalSamples += (d.samples || []).length;
      } catch {}
    }
  }
  res.json({
    model_trained: modelExists,
    model_path: modelExists ? modelPath : null,
    training_files: trainingFiles,
    total_samples: totalSamples,
    pca_available: fs.existsSync(path.join(HOME, 'basic-reflex', 'gym-eyes', 'pca_clusters.html')),
  });
});

// List annotated videos
app.get('/gym-eyes/videos', (req, res) => {
  const sessDir = path.join(HOME, 'basic-reflex', 'gym-eyes', 'sessions');
  if (!fs.existsSync(sessDir)) return res.json({ videos: [] });
  const vids = fs.readdirSync(sessDir)
    .filter(f => f.startsWith('annotated-') && f.endsWith('.mp4'))
    .sort().reverse()
    .slice(0, 10)
    .map(f => {
      const stat = fs.statSync(path.join(sessDir, f));
      return { file: f, size: stat.size, date: stat.mtime.toISOString() };
    });
  res.json({ videos: vids });
});

// Serve video files
app.get('/gym-eyes/video/:file', (req, res) => {
  const file = req.params.file;
  if (!file || file.includes('..') || !file.endsWith('.mp4')) return res.status(400).send('bad request');
  const vidPath = path.join(HOME, 'basic-reflex', 'gym-eyes', 'sessions', file);
  if (!fs.existsSync(vidPath)) return res.status(404).send('not found');
  res.sendFile(vidPath);
});

// Gym Eyes Showcase report
app.get('/gym-eyes/showcase', (req, res) => {
  const reportPath = path.join(HOME, 'basic-reflex', 'gym-eyes', 'showcase_report.html');
  if (!fs.existsSync(reportPath)) return res.status(404).send('No showcase report yet. Run: python3 showcase.py');
  res.sendFile(reportPath);
});

// The Guard — Defensive Intelligence System
app.get('/gym-eyes/the-guard', (req, res) => {
  const fsx = require('fs');
  const p = path.join(HOME, 'basic-reflex', 'gym-eyes', 'the-guard.html');
  if (!fsx.existsSync(p)) return res.status(404).send('The Guard not found');
  res.sendFile(p);
});

// The Grid — Footwork visualization
app.get('/gym-eyes/the-grid', (req, res) => {
  const fsx = require('fs');
  const p = path.join(HOME, 'basic-reflex', 'gym-eyes', 'the-grid.html');
  if (!fsx.existsSync(p)) return res.status(404).send('The Grid not found');
  res.sendFile(p);
});

// Drill Player — 3D skeleton boxer visualization
app.get('/gym-eyes/drill-player', (req, res) => {
  const drillPath = path.join(HOME, 'basic-reflex', 'gym-eyes', 'drill-player.html');
  if (!fs.existsSync(drillPath)) return res.status(404).send('Drill player not found');
  res.sendFile(drillPath);
});

// Virtual Tutor — coach overlay system
app.get('/gym-eyes/virtual-tutor', (req, res) => {
  const tutorPath = path.join(HOME, 'basic-reflex', 'gym-eyes', 'virtual-tutor.html');
  if (!fs.existsSync(tutorPath)) return res.status(404).send('Virtual tutor not found');
  res.sendFile(tutorPath);
});

// Film Room — harvested external lessons, indexed by the 10 blocks
const FILM_ROOM_DIR = path.join(HOME, 'cathedral-vault', '00_Staging', 'film-room');
app.get('/gym-eyes/film-room', (req, res) => {
  const p = path.join(HOME, 'basic-reflex', 'gym-eyes', 'film-room.html');
  if (!fs.existsSync(p)) return res.status(404).send('Film Room not found');
  res.sendFile(p);
});
app.get('/gym-eyes/film-room/index', (req, res) => {
  const p = path.join(FILM_ROOM_DIR, 'index.json');
  if (!fs.existsSync(p)) return res.json({ lessons: [], done_ids: [] });
  res.type('application/json').send(fs.readFileSync(p, 'utf8'));
});
app.get('/gym-eyes/film-room/card/:file', (req, res) => {
  const f = path.basename(req.params.file).replace(/[^a-zA-Z0-9._-]/g, '');
  const p = path.join(FILM_ROOM_DIR, f);
  if (!p.endsWith('.md') || !fs.existsSync(p)) return res.status(404).send('Card not found');
  res.type('text/markdown').send(fs.readFileSync(p, 'utf8'));
});

// ── The Oracle ──────────────────────────────────────────────────────────────
// Ask the Cathedral what it knows; it answers in Paul's voice from the vault, cited.
// RAG: gold-weighted semantic retrieval → read top sources → frontier synthesis.
// Trust hierarchy — a Grade-A gold doc outranks a raw staging draft every time.
const ORACLE_TRUST = {
  '02_Refined_Gold': 1.0,
  '06_Methods': 0.9,
  '06_Basic_Reflex_Syllabus': 0.9,
  'boxing': 0.9,
  '00_Staging': 0.3,
};
function oracleTrust(domain) {
  return ORACLE_TRUST[domain] !== undefined ? ORACLE_TRUST[domain] : 0.6;
}

async function oracleSynthesize(question, context) {
  const system = "You are The Oracle — the Cathedral's synthesis voice for Paul (boxing coach, Hong Kong; "
    + "sovereign AI research system). Answer the question ONLY from the numbered SOURCES below, in Paul's own "
    + "frames and a plain, direct, concrete voice (no hedging, no filler). Cite sources inline as [n]. "
    + "If the sources don't cover it, say so plainly — never invent. Synthesize across sources; don't just list them.";
  const user = `QUESTION: ${question}\n\nSOURCES:\n${context}`;
  const key = process.env.DEEPSEEK_API_KEY;
  if (key) {
    try {
      const r = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'deepseek-chat', temperature: 0.3,
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
      });
      if (r.ok) { const d = await r.json(); return { answer: d.choices[0].message.content, engine: 'deepseek' }; }
      console.error('[oracle] deepseek HTTP', r.status);
    } catch (e) { console.error('[oracle] deepseek err', e.message); }
  }
  // Sovereign fallback — local qwen3 (make this the default when the M5 Max lands)
  try {
    const r = await fetch('http://localhost:11434/api/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'qwen3:14b', prompt: system + '\n\n' + user, stream: false,
        options: { temperature: 0.3 } }),
    });
    const d = await r.json();
    return { answer: (d.response || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim(), engine: 'qwen3-local' };
  } catch (e) {
    return { answer: 'Synthesis engine unavailable: ' + e.message, engine: 'none' };
  }
}

app.get('/oracle', (req, res) => {
  const p = path.join(NANOCLAW, 'oracle.html');
  if (!fs.existsSync(p)) return res.status(404).send('Oracle not found');
  res.sendFile(p);
});

app.get('/oracle/ask', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.status(400).json({ error: 'q query param required' });
  try {
    const vaultSearch = require(path.join(NANOCLAW, 'vault-search-bridge.cjs'));
    const pool = await vaultSearch.semanticSearch(q, 30);            // wide pool
    const ranked = pool
      .map(r => ({ ...r, w: r.score * oracleTrust(r.domain) }))      // gold-weighted rerank
      .sort((a, b) => b.w - a.w)
      .slice(0, 8);
    const sources = ranked.map((r, i) => {
      const full = r.file_path.startsWith('/') ? r.file_path
        : path.join(HOME, 'cathedral-vault', r.file_path);
      let text = '';
      try { text = fs.readFileSync(full, 'utf8').replace(/^---[\s\S]*?---\n/, '').slice(0, 2200); } catch {}
      return { n: i + 1, path: r.file_path.replace(HOME + '/cathedral-vault/', ''),
        title: r.title, domain: r.domain, score: +Number(r.score).toFixed(3),
        weight: oracleTrust(r.domain), text };
    }).filter(s => s.text);
    if (!sources.length) return res.json({ question: q, answer: 'No vault sources matched.', citations: [] });
    const context = sources.map(s => `[${s.n}] ${s.title} (${s.domain})\n${s.text}`).join('\n\n---\n\n');
    const { answer, engine } = await oracleSynthesize(q, context);
    res.json({ question: q, answer, engine, citations: sources.map(({ text, ...c }) => c) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// === CYMATIC CHOIR ===
const CHOIR_HTML = path.join(HOME, 'cathedral-vault', '09_Artifacts', 'choir-room.html');
const CHOIR_CHORD = path.join(__dirname, 'choir-chord.json');

app.get('/choir', (req, res) => {
  if (!fs.existsSync(CHOIR_HTML)) return res.status(404).send('Choir Room not found');
  res.sendFile(CHOIR_HTML);
});

app.get('/choir/data', (req, res) => {
  if (!fs.existsSync(CHOIR_CHORD)) return res.json({ empty: true, message: 'No dispatch yet. Run: node choir-dispatch.js' });
  try {
    const data = JSON.parse(fs.readFileSync(CHOIR_CHORD, 'utf8'));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Failed to read chord: ' + e.message });
  }
});

app.post('/choir/dispatch', async (req, res) => {
  try {
    const { dispatch } = await import(path.join(__dirname, 'choir-dispatch.js'));
    const result = await dispatch();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Virtual Tutor API — list available comparisons
app.get('/gym-eyes/tutor/comparisons', (req, res) => {
  const outDir = path.join(HOME, 'basic-reflex', 'gym-eyes', 'tutor_output');
  if (!fs.existsSync(outDir)) return res.json([]);
  const files = fs.readdirSync(outDir).filter(f => f.endsWith('.json')).sort().reverse();
  res.json(files.map(f => ({
    file: f,
    url: `/gym-eyes/tutor/file/${f}`,
  })));
});

// Serve tutor comparison JSON files
app.get('/gym-eyes/tutor/file/:name', (req, res) => {
  const name = req.params.name;
  if (!name || name.includes('..')) return res.status(400).send('bad');
  const filePath = path.join(HOME, 'basic-reflex', 'gym-eyes', 'tutor_output', name);
  if (!fs.existsSync(filePath)) return res.status(404).send('not found');
  res.sendFile(filePath);
});

// ── Homework — student upload + instant coaching ──────────────────────────
const multer = require('multer');
const { execFile } = require('child_process');
const hwUploadDir = path.join(HOME, 'basic-reflex', 'gym-eyes', 'homework_uploads');
if (!fs.existsSync(hwUploadDir)) fs.mkdirSync(hwUploadDir, { recursive: true });

const hwUpload = multer({
  dest: hwUploadDir,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('Only video files accepted'));
  }
});

app.get('/gym-eyes/homework', (req, res) => {
  const hwPath = path.join(HOME, 'basic-reflex', 'gym-eyes', 'homework.html');
  if (!fs.existsSync(hwPath)) return res.status(404).send('Homework page not found');
  res.sendFile(hwPath);
});

app.get('/gym-eyes/homework/combos', (req, res) => {
  try {
    const libPath = path.join(HOME, 'basic-reflex', 'gym-eyes', 'cuba-library', 'combo-library.json');
    const lib = JSON.parse(fs.readFileSync(libPath, 'utf8'));
    const combos = lib.combos.map(c => ({
      id: `combo-${String(c.id).padStart(3, '0')}`,
      name: c.name,
      shorthand: c.shorthand,
      punch_count: c.punch_count,
    }));
    res.json(combos);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/gym-eyes/homework/submit', hwUpload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No video uploaded' });
  const combo = req.body.combo;
  if (!combo || !/^combo-\d{3}$/.test(combo)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Invalid combo ID' });
  }

  // Rename upload to have proper extension
  const ext = path.extname(req.file.originalname) || '.mp4';
  const videoPath = req.file.path + ext;
  fs.renameSync(req.file.path, videoPath);

  const processor = path.join(HOME, 'basic-reflex', 'gym-eyes', 'homework_processor.py');

  execFile('python3', [processor, '--video', videoPath, '--combo', combo], {
    timeout: 120000, // 2 min max
    maxBuffer: 10 * 1024 * 1024,
  }, (err, stdout, stderr) => {
    // Clean up uploaded file after processing
    try { fs.unlinkSync(videoPath); } catch (_) {}

    if (err) {
      console.error('[homework] Processing error:', stderr || err.message);
      return res.status(500).json({ error: 'Processing failed: ' + (stderr || err.message).slice(0, 200) });
    }

    try {
      const result = JSON.parse(stdout);
      if (result.error) return res.status(400).json(result);
      res.json(result);
    } catch (e) {
      console.error('[homework] Parse error:', stdout.slice(0, 500));
      res.status(500).json({ error: 'Failed to parse results' });
    }
  });
});

// Dataset explorer
app.get('/datasets', (req, res) => {
  const explorerPath = path.join(HOME, 'basic-reflex', 'gym-eyes', 'dataset_explorer.html');
  if (!fs.existsSync(explorerPath)) return res.status(404).send('Dataset explorer not found');
  res.sendFile(explorerPath);
});

// Dataset image serving
const DATASETS_DIR = path.join(HOME, 'basic-reflex', 'datasets');
app.get('/datasets/image/:split/:file', (req, res) => {
  const { split, file } = req.params;
  if (!split || !file || split.includes('..') || file.includes('..')) return res.status(400).send('bad');
  const imgPath = path.join(DATASETS_DIR, 'spinetrack', 'images', split, file);
  if (!fs.existsSync(imgPath)) return res.status(404).send('not found');
  res.sendFile(imgPath);
});

// Dataset annotations API
let _stAnnoCache = null;
app.get('/datasets/api/spinetrack', (req, res) => {
  try {
    if (!_stAnnoCache) {
      const splits = ['train-real-coco', 'train-real-yoga', 'train-unreal'];
      const result = { splits: {} };
      for (const split of splits) {
        const annoFile = split === 'train-real-coco'
          ? 'person_keypoints_train-real-coco.json'
          : split === 'train-real-yoga'
          ? 'person_keypoints_train-real-yoga.json'
          : 'person_keypoints_train-unreal.json';
        const annoPath = path.join(DATASETS_DIR, 'spinetrack', 'annotations', annoFile);
        if (!fs.existsSync(annoPath)) { result.splits[split] = { count: 0 }; continue; }
        const data = JSON.parse(fs.readFileSync(annoPath, 'utf8'));
        const imgMap = {};
        for (const img of data.images) imgMap[img.id] = img;
        // Group annotations by image
        const byImage = {};
        for (const ann of data.annotations) {
          const img = imgMap[ann.image_id];
          if (!img) continue;
          if (!byImage[img.file_name]) byImage[img.file_name] = { w: img.width, h: img.height, anns: [] };
          byImage[img.file_name].anns.push(ann.keypoints);
        }
        const imgDir = path.join(DATASETS_DIR, 'spinetrack', 'images', split);
        const hasImages = fs.existsSync(imgDir);
        result.splits[split] = {
          count: Object.keys(byImage).length,
          totalAnnotations: data.annotations.length,
          keypoints: data.categories?.[0]?.keypoints || [],
          hasImages,
          images: byImage
        };
      }
      _stAnnoCache = result;
    }
    // Pagination
    const split = req.query.split || 'train-real-coco';
    const page = parseInt(req.query.page) || 0;
    const perPage = parseInt(req.query.per_page) || 48;
    const splitData = _stAnnoCache.splits[split];
    if (!splitData) return res.json({ error: 'unknown split' });
    const allFiles = Object.keys(splitData.images);
    const slice = allFiles.slice(page * perPage, (page + 1) * perPage);
    const pageData = {};
    for (const f of slice) pageData[f] = splitData.images[f];
    res.json({
      split, page, perPage, totalImages: allFiles.length,
      totalAnnotations: splitData.totalAnnotations,
      keypoints: splitData.keypoints,
      hasImages: splitData.hasImages,
      totalPages: Math.ceil(allFiles.length / perPage),
      images: pageData,
      availableSplits: Object.entries(_stAnnoCache.splits).map(([k,v]) => ({ name: k, count: v.count, annotations: v.totalAnnotations }))
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Serve artifact files directly (images, HTML, SVG)
app.get('/villa/artifact-file', (req, res) => {
  const relPath = req.query.path;
  if (!relPath || relPath.includes('..')) return res.status(400).send('invalid path');
  const full = path.join(VAULT, '09_Artifacts', relPath);
  if (!fs.existsSync(full)) return res.status(404).send('not found');
  res.sendFile(full);
});

// ── Cathedral City ───────────────────────────────────────────────────────────

app.get('/cathedral-city', (req, res) => {
  const htmlPath = path.join(HOME, 'Cathedral', 'control-panel', 'cathedral-theme-park.html');
  try {
    const html = fs.readFileSync(htmlPath, 'utf8');
    res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', 'Content-Type': 'text/html; charset=utf-8' });
    res.send(html);
  } catch (err) {
    res.status(500).send(`Cathedral City not found: ${err.message}`);
  }
});

app.get('/cathedral-city/map.png', (req, res) => {
  const imgPath = path.join(VAULT, '09_Artifacts', 'cathedral', 'cathedral-city-map-2026-05-16.png');
  if (!fs.existsSync(imgPath)) return res.status(404).send('Map image not found');
  res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
  fs.createReadStream(imgPath).pipe(res);
});

app.get('/cathedral-city/data', (req, res) => {
  try {
    const { execFileSync } = require('child_process');
    const result = execFileSync('node', [path.join(HOME, 'Cathedral', 'city-planner.js')], {
      encoding: 'utf8', timeout: 15000, env: { ...process.env },
    });
    res.json(JSON.parse(result));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Cathedral Feed + Agent Health ──────────────────────────────────────────────
app.get('/cathedral-city/feed', (req, res) => {
  const feedPath = path.join(HOME, 'Cathedral', 'agents', 'cathedral-feed.json');
  try {
    if (fs.existsSync(feedPath)) {
      res.json(JSON.parse(fs.readFileSync(feedPath, 'utf8')));
    } else {
      res.json([]);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/cathedral-city/health', (req, res) => {
  const healthPath = path.join(HOME, 'Cathedral', 'agents', 'agent-health.json');
  try {
    if (fs.existsSync(healthPath)) {
      res.json(JSON.parse(fs.readFileSync(healthPath, 'utf8')));
    } else {
      res.json({});
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/cathedral-city/tea-stars', (req, res) => {
  const starsPath = path.join(HOME, 'Cathedral', 'agents', 'tea-stars.json');
  try {
    if (fs.existsSync(starsPath)) {
      res.json(JSON.parse(fs.readFileSync(starsPath, 'utf8')));
    } else {
      res.json({ ratings: [], leaderboard: {} });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/cathedral-city/dms', (req, res) => {
  const dmPath = path.join(HOME, 'Cathedral', 'agents', 'agent-dms.json');
  try {
    if (fs.existsSync(dmPath)) {
      res.json(JSON.parse(fs.readFileSync(dmPath, 'utf8')));
    } else {
      res.json({ threads: [] });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/cathedral-city/suggestions', (req, res) => {
  const sugPath = path.join(HOME, 'Cathedral', 'agents', 'suggestion-box.json');
  try {
    if (fs.existsSync(sugPath)) {
      res.json(JSON.parse(fs.readFileSync(sugPath, 'utf8')));
    } else {
      res.json({ suggestions: [] });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve the Cathedral Feed dashboard
app.get('/cathedral-city/feed-dashboard', (req, res) => {
  const dashPath = path.join(HOME, 'Cathedral', 'control-panel', 'cathedral-feed.html');
  try {
    const html = fs.readFileSync(dashPath, 'utf8');
    res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', 'Content-Type': 'text/html; charset=utf-8' });
    res.send(html);
  } catch (err) {
    res.status(500).send(`Cathedral feed dashboard not found: ${err.message}`);
  }
});

// Serve the Team Programme dashboard
app.get('/cathedral-city/team-programme', (req, res) => {
  const dashPath = path.join(HOME, 'Cathedral', 'control-panel', 'team-programme.html');
  try {
    const html = fs.readFileSync(dashPath, 'utf8');
    res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', 'Content-Type': 'text/html; charset=utf-8' });
    res.send(html);
  } catch (err) {
    res.status(500).send(`Team programme dashboard not found: ${err.message}`);
  }
});

// Serve Agent Improvement Tracker dashboard
app.get('/agent-improvement', (req, res) => {
  const dashPath = path.join(HOME, 'Cathedral', 'control-panel', 'agent-improvement.html');
  try {
    const html = fs.readFileSync(dashPath, 'utf8');
    res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', 'Content-Type': 'text/html; charset=utf-8' });
    res.send(html);
  } catch (err) {
    res.status(500).send(`Agent improvement dashboard not found: ${err.message}`);
  }
});

// API: agent improvement score history + trajectories
app.get('/api/agent-improvement', (req, res) => {
  try {
    const historyPath = path.join(HOME, 'Cathedral', 'emergence', 'score-history.json');
    const data = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    res.json(data);
  } catch (err) {
    res.json({ agents: {}, lastUpdated: null, error: err.message });
  }
});

// Serve dissent state data
app.get('/cathedral-city/dissent', (req, res) => {
  const statePath = path.join(HOME, 'Cathedral', 'agents', 'dissent-state.json');
  try {
    const data = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    res.json(data);
  } catch (err) {
    res.json({ debates: [], lastRun: null });
  }
});

// ── Villa static serve ─────────────────────────────────────────────────────────
// Serve the villa HTML directly from cath-bridge with no-cache headers.
// This replaces the python3 http.server that has aggressive caching.

app.get('/techniques', (req, res) => {
  const galleryPath = path.join(HOME, 'Cathedral', 'control-panel', 'technique-gallery.html');
  try {
    const html = fs.readFileSync(galleryPath, 'utf8');
    res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', 'Content-Type': 'text/html; charset=utf-8' });
    res.send(html);
  } catch (err) {
    res.status(500).send(`technique gallery not found: ${err.message}`);
  }
});

// Serve Cathy narration audio files
app.get('/audio/:filename', (req, res) => {
  const filename = path.basename(req.params.filename); // sanitize
  const audioPath = path.join(HOME, 'Cathedral', 'cathy-narration', filename);
  if (!fs.existsSync(audioPath)) return res.status(404).send('Audio not found');
  const ext = path.extname(filename).toLowerCase();
  const mime = ext === '.mp3' ? 'audio/mpeg' : ext === '.ogg' ? 'audio/ogg' : 'application/octet-stream';
  res.set({ 'Content-Type': mime, 'Cache-Control': 'public, max-age=86400' });
  fs.createReadStream(audioPath).pipe(res);
});

app.get('/villa', (req, res) => {
  const villaPath = path.join(HOME, 'Cathedral', 'control-panel', 'index.html');
  try {
    const html = fs.readFileSync(villaPath, 'utf8');
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Content-Type': 'text/html; charset=utf-8',
    });
    res.send(html);
  } catch (err) {
    res.status(500).send(`villa not found: ${err.message}`);
  }
});

// ── GET /constellation ────────────────────────────────────────────────────────
// Returns enriched project registry for the Morning View constellation.
// Reads registry.json, merges PM2 state, vault card frontmatter, activity scores.

const os = require('os');

app.get('/constellation', (req, res, next) => {
  // Serve HTML for browser, JSON for API
  const accept = req.headers.accept || '';
  if (accept.includes('text/html') && !req.query.format) {
    return res.sendFile(path.join(NANOCLAW, 'constellation.html'));
  }
  next();
});

app.get('/constellation', async (req, res) => {
  try {
    const registryPath = path.join(HOME, 'Cathedral', 'projects', 'registry.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

    // Get PM2 data
    let pm2Data = [];
    try {
      const { execSync } = require('child_process');
      const pm2Result = execSync('pm2 jlist', { encoding: 'utf8', timeout: 5000 });
      pm2Data = JSON.parse(pm2Result);
    } catch (e) { /* pm2 not available */ }

    // Get cath-state.json
    let cathState = {};
    try {
      const statePath = path.join(HOME, 'Cathedral', 'cath-state.json');
      cathState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    } catch (e) {}

    const vaultBase = VAULT;

    // Read project memory.jsonl — last 24h events
    const MEMORY_DIR = path.join(HOME, 'Cathedral', 'projects', 'memory');
    function readProjectMemory(projectId) {
      try {
        const logPath = path.join(MEMORY_DIR, `${projectId}.jsonl`);
        if (!fs.existsSync(logPath)) return [];
        const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        const events = [];
        // Read from end for efficiency — stop when we pass cutoff
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const entry = JSON.parse(lines[i]);
            if (entry.ts < cutoff) break;
            events.push(entry);
          } catch (e) {}
        }
        return events;
      } catch (e) { return []; }
    }

    // Read project card frontmatter
    function readProjectCard(cardName) {
      if (!cardName) return null;
      try {
        const cardPath = path.join(vaultBase, '08_Project_Orchestrator', 'projects', cardName);
        const content = fs.readFileSync(cardPath, 'utf8');
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (!fmMatch) return { raw: content.slice(0, 200) };
        const fm = {};
        fmMatch[1].split('\n').forEach(line => {
          const m = line.match(/^(\w[\w-]*)\s*:\s*"?(.+?)"?\s*$/);
          if (m) fm[m[1]] = m[2];
        });
        const body = content.slice(fmMatch[0].length).trim().split('\n').filter(l => l.trim() && !l.startsWith('#'))[0] || '';
        return { ...fm, body };
      } catch (e) { return null; }
    }

    // Compute activity score: PM2 health + vault activity + memory events + status
    function computeActivity(project) {
      let score = 0;

      // PM2 process health contributes up to 0.3
      if (project.pm2_processes && project.pm2_processes.length > 0) {
        const procs = project.pm2_processes.map(name => pm2Data.find(p => p.name === name)).filter(Boolean);
        if (procs.length > 0) {
          const onlineCount = procs.filter(p => p.pm2_env.status === 'online').length;
          score += (onlineCount / procs.length) * 0.3;
        }
      }

      // Vault domain activity contributes up to 0.25
      if (project.vault_domain) {
        try {
          const now = Date.now();
          const sevenDays = 7 * 24 * 60 * 60 * 1000;
          const stagingPath = path.join(vaultBase, '00_Staging', project.vault_domain);
          if (fs.existsSync(stagingPath)) {
            const files = fs.readdirSync(stagingPath).filter(f => f.endsWith('.md'));
            let recentCount = 0;
            for (const f of files.slice(-20)) {
              try {
                const stat = fs.statSync(path.join(stagingPath, f));
                if (now - stat.mtimeMs < sevenDays) recentCount++;
              } catch (e) {}
            }
            score += Math.min(0.25, (recentCount / 10) * 0.25);
          }
        } catch (e) {}
      }

      // Memory events (last 24h) contribute up to 0.3
      const memEvents = readProjectMemory(project.id);
      if (memEvents.length > 0) {
        // 1 event = 0.1, 3+ events = 0.2, 6+ events = 0.3
        score += Math.min(0.3, memEvents.length * 0.05);
      }

      // Project card status contributes up to 0.15
      if (project.status === 'active') score += 0.15;
      else if (project.status === 'concept') score += 0.08;

      return Math.max(0.05, Math.min(1.0, score));
    }

    // Build live status string
    function buildLiveStatus(project) {
      const parts = [];

      if (project.pm2_processes && project.pm2_processes.length > 0) {
        const procs = project.pm2_processes.map(name => pm2Data.find(p => p.name === name)).filter(Boolean);
        if (procs.length > 0) {
          const online = procs.filter(p => p.pm2_env.status === 'online').length;
          const errored = procs.filter(p => p.pm2_env.status === 'errored').length;
          const stopped = procs.filter(p => p.pm2_env.status === 'stopped').length;
          const statusParts = [];
          if (online > 0) statusParts.push(`${online} online`);
          if (errored > 0) statusParts.push(`${errored} errored`);
          if (stopped > 0) statusParts.push(`${stopped} stopped`);
          parts.push(statusParts.join(' \u00B7 '));

          const crashLooping = procs.filter(p => p.pm2_env.restart_time > 100);
          if (crashLooping.length > 0) {
            parts.push(crashLooping.map(p => `${p.name} crash-looping`).join(', '));
          }
        }
      }

      const card = readProjectCard(project.vault_card);
      if (card) {
        if (card['project-status']) parts.push(card['project-status']);
        else if (card.status) parts.push(card.status);
        if (card.phase) parts.push(card.phase);
      }

      if (project.status === 'uncharted') parts.push('uncharted');
      if (project.status === 'concept') parts.push('concept stage');

      return parts.join(' \u00B7 ') || project.status;
    }

    // Build briefing for each project
    function buildBriefing(project) {
      const card = readProjectCard(project.vault_card);
      const briefing = { lede: '', body: '', stats: [], action: '' };

      if (project.center) briefing.lede = 'You are here.';
      else if (project.status === 'uncharted') briefing.lede = 'Not yet mapped.';
      else if (project.status === 'concept') briefing.lede = 'Concept stage.';
      else briefing.lede = card?.title || project.name;

      if (card?.body) briefing.body = card.body;
      else if (project.status === 'uncharted') briefing.body = 'This project exists but has no vault card yet.';
      else briefing.body = '';

      if (project.pm2_processes && project.pm2_processes.length > 0) {
        const procs = project.pm2_processes.map(name => pm2Data.find(p => p.name === name)).filter(Boolean);
        const online = procs.filter(p => p.pm2_env.status === 'online').length;
        briefing.stats.push(['PROCESSES', `${online}/${procs.length}`]);

        const firstOnline = procs.find(p => p.pm2_env.status === 'online');
        if (firstOnline) {
          const uptimeMs = Date.now() - firstOnline.pm2_env.pm_uptime;
          const days = Math.floor(uptimeMs / (24 * 60 * 60 * 1000));
          const hours = Math.floor((uptimeMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
          briefing.stats.push(['UPTIME', `${days}d ${hours}h`]);
        }

        const totalRestarts = procs.reduce((sum, p) => sum + (p.pm2_env.restart_time || 0), 0);
        if (totalRestarts > 0) briefing.stats.push(['RESTARTS', String(totalRestarts)]);
      }

      if (card?.['project-status']) briefing.stats.push(['STATUS', card['project-status']]);
      if (card?.priority) briefing.stats.push(['PRIORITY', card.priority]);

      return briefing;
    }

    // System-wide stats
    const pm2Online = pm2Data.filter(p => p.pm2_env.status === 'online').length;
    const pm2Errored = pm2Data.filter(p => p.pm2_env.status === 'errored').length;
    const pm2Total = pm2Data.length;

    // Enrich each project
    const enriched = registry.projects.map(project => {
      const memEvents = readProjectMemory(project.id);
      const briefing = buildBriefing(project);

      // Add recent memory events to briefing stats
      if (memEvents.length > 0) {
        briefing.stats.push(['EVENTS/24H', String(memEvents.length)]);
        // Use most recent event as live body if no card body
        if (!briefing.body && memEvents[0]) {
          briefing.body = `Last: ${memEvents[0].event}` + (memEvents[0].bridge ? ` — ${memEvents[0].bridge.slice(0, 100)}` : '');
        }
      }

      return {
        id: project.id,
        code: project.code,
        name: project.name,
        kind: project.kind,
        status: project.status,
        center: project.center || false,
        x: project.x,
        y: project.y,
        r: project.r,
        connections: project.connections || [],
        active: computeActivity(project),
        live: buildLiveStatus(project),
        briefing,
        recentEvents: memEvents.slice(0, 5).map(e => ({ ts: e.ts, event: e.event })),
      };
    });

    res.json({
      ok: true,
      timestamp: Date.now(),
      projects: enriched,
      system: {
        pm2_online: pm2Online,
        pm2_errored: pm2Errored,
        pm2_total: pm2Total,
        vault_total: cathState?.sight?.total_nuggets || 0,
        ledger_density: cathState?.ledger?.quality_density || 0,
        drift_score: cathState?.proprioception?.drift_score || 0,
        waste_score: cathState?.smell?.waste_score || 0,
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Agent Chat: Multi-agent chat system ──────────────────────────────────────

const AGENTS_DIRS = [
  { dir: path.join(NANOCLAW, 'sages'), type: 'sage', format: 'json' },
  { dir: path.join(NANOCLAW, 'skins'), type: 'skin', format: 'json' },
  { dir: path.join(NANOCLAW, 'skins', 'general'), type: 'skin', format: 'json' },
  { dir: path.join(NANOCLAW, 'skins', 'boxing'), type: 'skin', format: 'json' },
  { dir: path.join(NANOCLAW, 'skins', 'business'), type: 'skin', format: 'json' },
  { dir: path.join(HOME, 'Cathedral', 'genius-council', 'characters'), type: 'council', format: 'md' },
];

function loadAllAgents() {
  const agents = [];
  const fs = require('fs');

  for (const src of AGENTS_DIRS) {
    if (!fs.existsSync(src.dir)) continue;
    const files = fs.readdirSync(src.dir).filter(f => f.endsWith(src.format === 'json' ? '.json' : '.md'));

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(src.dir, file), 'utf8');

        if (src.format === 'json') {
          const data = JSON.parse(content);
          const sage = data.sage || data;
          agents.push({
            id: file.replace(/\.(json|md)$/, ''),
            name: sage.name || file.replace(/\.(json|md)$/, '').replace(/-/g, ' '),
            type: src.type,
            role: sage.designation || sage.lens || sage.type || src.type,
            model: sage.model || 'hermes3',
            systemPrompt: sage.voice ? `You are ${sage.name}. ${sage.voice}\n\nCore lens: ${sage.core_lens || sage.lens || ''}` : content,
            file: path.join(src.dir, file),
          });
        } else {
          // Markdown with frontmatter
          const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
          let name = file.replace('.md', '').replace(/-/g, ' ');
          let model = 'hermes3';
          let role = 'council member';

          if (fmMatch) {
            const fm = fmMatch[1];
            const nameMatch = fm.match(/name:\s*(.+)/);
            const modelMatch = fm.match(/model:\s*(.+)/);
            const registerMatch = fm.match(/register:\s*(.+)/);
            if (nameMatch) name = nameMatch[1].trim();
            if (modelMatch) model = modelMatch[1].trim();
            if (registerMatch) role = registerMatch[1].trim();
          }

          const bodyText = fmMatch ? fmMatch[2] : content;
          agents.push({
            id: file.replace('.md', ''),
            name,
            type: src.type,
            role,
            model,
            systemPrompt: bodyText.trim(),
            file: path.join(src.dir, file),
          });
        }
      } catch(e) {
        console.error(`[agents] Error loading ${file}:`, e.message);
      }
    }
  }

  return agents;
}

app.get('/agents/list', (req, res) => {
  try {
    const agents = loadAllAgents();
    res.json(agents.map(a => ({ id: a.id, name: a.name, type: a.type, role: a.role, model: a.model })));
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Load Paul Kernel for agent context injection
let paulKernel = '';
try {
  const kernelPath = path.join(HOME, 'cathedral-vault', '06_Methods', 'paul-kernel.md');
  if (require('fs').existsSync(kernelPath)) {
    const raw = require('fs').readFileSync(kernelPath, 'utf8');
    // Strip frontmatter, keep content
    paulKernel = raw.replace(/^---[\s\S]*?---\n/, '').trim();
  }
} catch(e) { console.error('[agents] Failed to load Paul Kernel:', e.message); }

// Vault search for query context
async function getVaultContext(query) {
  try {
    const searchUrl = `http://localhost:8080/vault/search?q=${encodeURIComponent(query.slice(0, 100))}&top_k=3`;
    const res = await fetch(searchUrl, { headers: { 'x-api-key': 'cathedral-mcp-2026' }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return '';
    const results = await res.json();
    if (Array.isArray(results) && results.length > 0) {
      return '\n\n## VAULT CONTEXT\n' + results.map(r => `[${r.domain || 'vault'}] ${r.title || ''}: ${(r.text || r.first_line || '').slice(0, 200)}`).join('\n');
    }
  } catch(e) {}
  return '';
}

app.post('/agents/chat', async (req, res) => {
  const { agent_id, message, history } = req.body;
  if (!agent_id || !message) return res.status(400).json({ error: 'agent_id and message required' });

  const agents = loadAllAgents();
  const agent = agents.find(a => a.id === agent_id);
  if (!agent) return res.status(404).json({ error: `Agent not found: ${agent_id}` });

  try {
    // Fetch vault context for the question
    const vaultContext = await getVaultContext(message);

    // Build system prompt: agent character + Paul Kernel + vault context
    const fullSystemPrompt = agent.systemPrompt +
      '\n\n---\n\n## WHO YOU ARE SPEAKING TO\n' + paulKernel +
      vaultContext;

    const messages = [{ role: 'system', content: fullSystemPrompt }];
    if (history) {
      for (const h of history.slice(-10)) {
        messages.push({ role: h.role, content: h.content });
      }
    }
    messages.push({ role: 'user', content: message });

    // Normalize model — anything not locally available falls back to hermes3
    const localModels = ['hermes3', 'hermes3:latest', 'qwen3:14b', 'nomic-embed-text', 'dolphin3', 'llava'];
    const model = localModels.some(m => agent.model.includes(m)) ? agent.model : 'hermes3';

    const ollamaRes = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false, options: { temperature: 0.7, num_predict: 500 } }),
    });

    const data = await ollamaRes.json();
    const response = data.message?.content || 'No response';

    res.json({ agent: agent.name, response });
  } catch(e) {
    res.status(500).json({ error: `Ollama error: ${e.message}` });
  }
});

app.post('/agents/steward', async (req, res) => {
  const { question, responses } = req.body;
  if (!question || !responses) return res.status(400).json({ error: 'question and responses required' });

  try {
    const stewardPrompt = `You are The Steward of the Cathedral Court. Multiple agents just responded to the same question. Your job is to synthesise their responses into four sections.

QUESTION: ${question}

AGENT RESPONSES:
${responses}

Respond in EXACTLY this JSON format:
{"consensus": "What most agents agreed on (1-2 sentences)", "tension": "Where they disagreed or saw differently — this is the VALUABLE part (1-2 sentences)", "principle": "If a new principle emerged from the debate, name it in one sentence. If none, say 'None emerged'", "action": "What can be built, done, or decided based on this debate (1 sentence)"}`;

    const ollamaRes = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'hermes3',
        messages: [{ role: 'user', content: stewardPrompt }],
        stream: false,
        options: { temperature: 0.3, num_predict: 300 },
      }),
    });

    const data = await ollamaRes.json();
    const raw = data.message?.content || '';

    // Extract JSON from response
    const jsonMatch = raw.match(/\{[\s\S]*"consensus"[\s\S]*\}/);
    if (jsonMatch) {
      res.json(JSON.parse(jsonMatch[0]));
    } else {
      res.json({ consensus: raw.slice(0, 200), tension: '', principle: '', action: '' });
    }
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/agents/ui', (req, res) => {
  res.sendFile(path.join(NANOCLAW, 'agent-chat.html'));
});

app.get('/agents/guide', (req, res) => {
  res.sendFile(path.join(NANOCLAW, 'agent-guide.html'));
});

// ── Icons ────────────────────────────────────────────────────────────────────
app.get('/icons', (req, res) => {
  res.sendFile(path.join(process.env.HOME || '/Users/basicclaw777', 'cathedral-vault', '09_Artifacts', 'icons', 'index.html'));
});

// ── Architect Plans ──────────────────────────────────────────────────────────

app.get('/architect', (req, res) => {
  const dir = path.join(NANOCLAW, 'architect-output');
  const fs = require('fs');
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.html')).sort().reverse();
    if (files.length === 0) return res.send('<h1>No architect plans yet</h1>');
    // Serve most recent by default
    res.sendFile(path.join(dir, files[0]));
  } catch (e) {
    res.status(500).send('Architect output dir not found');
  }
});

app.get('/architect/:slug', (req, res) => {
  const fs = require('fs');
  const dir = path.join(NANOCLAW, 'architect-output');
  const files = fs.readdirSync(dir).filter(f => f.startsWith(req.params.slug) && f.endsWith('.html'));
  if (files.length === 0) return res.status(404).send('Plan not found');
  res.sendFile(path.join(dir, files[files.length - 1]));
});

// ── Trading Hub ──────────────────────────────────────────────────────────────

app.get('/trader/signal-dashboard', (req, res) => {
  const dashPath = path.join(HOME, 'Cathedral', 'control-panel', 'trading-signals.html');
  try { res.send(fs.readFileSync(dashPath, 'utf8')); }
  catch (err) { res.status(500).send(`Trading signals dashboard not found: ${err.message}`); }
});

app.get('/ephemeris', (req, res) => {
  const dashPath = path.join(HOME, 'Cathedral', 'control-panel', 'ephemeris-dashboard.html');
  try { res.send(fs.readFileSync(dashPath, 'utf8')); }
  catch (err) { res.status(500).send(`Ephemeris dashboard not found: ${err.message}`); }
});

app.get('/allocations', (req, res) => {
  res.sendFile(path.join(NANOCLAW, 'trader', 'allocation-dashboard.html'));
});

app.get('/api/allocations', (req, res) => {
  const fp = path.join(NANOCLAW, 'trader', 'allocation-portfolio.json');
  if (!require('fs').existsSync(fp)) return res.status(404).json({ error: 'No portfolio' });
  res.json(JSON.parse(require('fs').readFileSync(fp, 'utf8')));
});

// --- Polymarket Scanner ---
app.get('/polymarket', (req, res) => {
  res.sendFile(path.join(NANOCLAW, 'polymarket', 'dashboard.html'));
});

app.get('/api/polymarket/markets', (req, res) => {
  const fp = path.join(NANOCLAW, 'polymarket', 'markets.json');
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'No scan data yet. Run scanner first.' });
  res.json(JSON.parse(fs.readFileSync(fp, 'utf8')));
});

app.post('/api/polymarket/scan', async (req, res) => {
  try {
    const { execFileSync } = require('child_process');
    execFileSync('node', [path.join(NANOCLAW, 'polymarket', 'scanner.js')], { timeout: 30000 });
    const fp = path.join(NANOCLAW, 'polymarket', 'markets.json');
    res.json(JSON.parse(fs.readFileSync(fp, 'utf8')));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/polymarket/kelly', (req, res) => {
  try {
    const { execFileSync } = require('child_process');
    const out = execFileSync('node', ['-e', `
      import('${path.join(NANOCLAW, 'polymarket', 'kelly.js').replace(/\\/g, '/')}')
        .then(m => { const r = m.sizeAll(); process.stdout.write(JSON.stringify(r)); })
    `], { timeout: 10000 }).toString();
    res.json(JSON.parse(out));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/polymarket/ledger', (req, res) => {
  const fp = path.join(NANOCLAW, 'polymarket', 'ledger.json');
  if (!fs.existsSync(fp)) {
    res.json({ mode: 'paper', bankroll: 1000, positions: [], stats: { totalTrades: 0, wins: 0, losses: 0, totalPnl: 0 } });
    return;
  }
  const ledger = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const open = (ledger.positions || []).filter(p => p.status === 'open');
  const exposure = open.reduce((s, p) => s + p.cost, 0);
  res.json({ ...ledger, openPositions: open.length, exposure: Math.round(exposure * 100) / 100 });
});

app.post('/api/polymarket/trade', express.json(), (req, res) => {
  try {
    const { marketId, question, side, shares, sharePrice, edge, confidence, reasoning } = req.body;
    const { execFileSync } = require('child_process');
    const args = [marketId, question, side, String(shares), String(sharePrice), String(edge)].map(a => a || '');
    execFileSync('node', [path.join(NANOCLAW, 'polymarket', 'ledger.js'), 'open', ...args], { timeout: 5000 });
    const fp = path.join(NANOCLAW, 'polymarket', 'ledger.json');
    res.json(JSON.parse(fs.readFileSync(fp, 'utf8')));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/polymarket/report', (req, res) => {
  try {
    const { execFileSync } = require('child_process');
    const out = execFileSync('node', [path.join(NANOCLAW, 'polymarket', 'monitor.js'), 'report'], { timeout: 10000 }).toString();
    res.type('text').send(out);
  } catch (err) { res.status(500).send(err.message); }
});

app.post('/api/polymarket/execute', (req, res) => {
  try {
    const { execFileSync } = require('child_process');
    const dry = req.query.dry === 'true' ? ' --dry' : '';
    const out = execFileSync('node', [path.join(NANOCLAW, 'polymarket', 'executor.js'), ...(dry ? ['--dry'] : [])], { timeout: 30000 }).toString();
    const fp = path.join(NANOCLAW, 'polymarket', 'ledger.json');
    const ledger = fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf8')) : {};
    res.json({ output: out, ledger });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/polymarket/monitor', (req, res) => {
  try {
    const { execFileSync } = require('child_process');
    const out = execFileSync('node', [path.join(NANOCLAW, 'polymarket', 'monitor.js'), 'check'], { timeout: 30000 }).toString();
    res.json({ output: out });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/polymarket/estimates', (req, res) => {
  const fp = path.join(NANOCLAW, 'polymarket', 'estimates.json');
  if (!fs.existsSync(fp)) return res.json({});
  res.json(JSON.parse(fs.readFileSync(fp, 'utf8')));
});

app.get('/api/polymarket/research/:slug', (req, res) => {
  const dir = path.join(NANOCLAW, 'polymarket', 'research');
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'No research yet' });
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  const match = files.find(f => f.includes(req.params.slug));
  if (!match) return res.status(404).json({ error: 'Research not found' });
  res.json(JSON.parse(fs.readFileSync(path.join(dir, match), 'utf8')));
});

app.post('/api/polymarket/research', async (req, res) => {
  try {
    const count = req.body?.count || 5;
    const { execFileSync } = require('child_process');
    execFileSync('node', [path.join(NANOCLAW, 'polymarket', 'researcher.js'), String(count)], { timeout: 180000 });
    const fp = path.join(NANOCLAW, 'polymarket', 'estimates.json');
    if (fs.existsSync(fp)) res.json(JSON.parse(fs.readFileSync(fp, 'utf8')));
    else res.json({});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/trader/hub', (req, res) => {
  res.sendFile(path.join(NANOCLAW, 'trader', 'trading-hub.html'));
});

app.get('/trader/explainer', (req, res) => {
  res.sendFile(path.join(NANOCLAW, 'trader', 'trading-explainer.html'));
});

app.get('/trader/signals', (req, res) => {
  const fp = path.join(NANOCLAW, 'trader', 'signals', 'crypto-signals-latest.json');
  if (!require('fs').existsSync(fp)) return res.status(404).json({ error: 'No signals yet' });
  res.json(JSON.parse(require('fs').readFileSync(fp, 'utf8')));
});

app.get('/trader/latest-debate', (req, res) => {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(path.join(NANOCLAW, 'trader', 'logs', 'trades.db'));
    const row = db.prepare('SELECT * FROM decisions ORDER BY id DESC LIMIT 1').get();
    db.close();
    if (row) return res.json(row);
    res.status(404).json({ error: 'No decisions yet' });
  } catch(e) {
    res.status(404).json({ error: 'No trades database yet' });
  }
});

app.get('/trader/portfolio', (req, res) => {
  const fp = path.join(NANOCLAW, 'trader', 'portfolio.json');
  if (!require('fs').existsSync(fp)) return res.status(404).json({ error: 'No portfolio' });
  res.json(JSON.parse(require('fs').readFileSync(fp, 'utf8')));
});

app.get('/trader/positions', (req, res) => {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(path.join(NANOCLAW, 'trader', 'logs', 'trades.db'));
    const open = db.prepare('SELECT * FROM trades WHERE status = ?').all('open');
    const closed = db.prepare('SELECT * FROM trades WHERE status = ? ORDER BY closed_at DESC LIMIT 20').all('closed');
    db.close();
    res.json({ open, closed });
  } catch(e) {
    res.json({ open: [], closed: [] });
  }
});

app.get('/trader/performance', (req, res) => {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(path.join(NANOCLAW, 'trader', 'logs', 'trades.db'));
    const perf = db.prepare(`
      SELECT
        COUNT(*) as total_trades,
        SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END) as losses,
        ROUND(100.0 * SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) / MAX(COUNT(*), 1), 1) as win_rate,
        ROUND(SUM(pnl), 2) as total_pnl,
        ROUND(AVG(pnl), 2) as avg_pnl,
        ROUND(MAX(pnl), 2) as best_trade,
        ROUND(MIN(pnl), 2) as worst_trade
      FROM trades WHERE status = 'closed'
    `).get();
    const decisions = db.prepare('SELECT * FROM decisions ORDER BY id DESC LIMIT 10').all();
    const signals = db.prepare('SELECT * FROM signals ORDER BY id DESC LIMIT 20').all();
    // Strategy leaderboard
    const strategies = db.prepare(`
      SELECT
        strategy,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_count,
        SUM(CASE WHEN status = 'closed' AND pnl > 0 THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN status = 'closed' AND pnl <= 0 THEN 1 ELSE 0 END) as losses,
        ROUND(100.0 * SUM(CASE WHEN status = 'closed' AND pnl > 0 THEN 1 ELSE 0 END) / MAX(SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END), 1), 1) as win_rate,
        ROUND(SUM(CASE WHEN status = 'closed' THEN pnl ELSE 0 END), 2) as total_pnl,
        ROUND(AVG(CASE WHEN status = 'closed' THEN pnl_pct ELSE NULL END), 4) as avg_return
      FROM trades
      GROUP BY strategy
      ORDER BY total_pnl DESC
    `).all();
    // Decision counts by strategy (signals that led to debate)
    const decisionStats = db.prepare(`
      SELECT
        asset,
        action,
        COUNT(*) as count
      FROM decisions
      GROUP BY asset, action
    `).all();
    db.close();
    res.json({ perf, decisions, signals, strategies, decisionStats });
  } catch(e) {
    res.json({ perf: null, decisions: [], signals: [], strategies: [], decisionStats: [] });
  }
});

// ── Daily Pick: Paul vs Machine ──────────────────────────────────────────────

app.get('/trader/picks/scoreboard', (req, res) => {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(path.join(NANOCLAW, 'trader', 'logs', 'trades.db'));
    const paul = db.prepare('SELECT * FROM pick_portfolio WHERE player = ?').get('paul');
    const ai = db.prepare('SELECT * FROM pick_portfolio WHERE player = ?').get('ai');
    const picks = db.prepare('SELECT * FROM daily_picks ORDER BY date DESC LIMIT 30').all();
    const lessons = db.prepare('SELECT * FROM trading_lessons ORDER BY created_at DESC').all();
    const categories = db.prepare('SELECT category, COUNT(*) as count FROM trading_lessons GROUP BY category').all();
    db.close();
    res.json({ paul: paul || { balance: 10000, total_picks: 0, correct: 0, total_pnl: 0 },
               ai: ai || { balance: 10000, total_picks: 0, correct: 0, total_pnl: 0 },
               picks, lessons, categories });
  } catch(e) {
    res.json({ paul: { balance: 10000, total_picks: 0, correct: 0, total_pnl: 0 },
               ai: { balance: 10000, total_picks: 0, correct: 0, total_pnl: 0 },
               picks: [], lessons: [], categories: [] });
  }
});

app.get('/trader/picks/lessons', (req, res) => {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(path.join(NANOCLAW, 'trader', 'logs', 'trades.db'));
    const cat = req.query.category;
    const lessons = cat
      ? db.prepare('SELECT * FROM trading_lessons WHERE category = ? ORDER BY created_at DESC').all(cat)
      : db.prepare('SELECT * FROM trading_lessons ORDER BY created_at DESC').all();
    db.close();
    res.json(lessons);
  } catch(e) { res.json([]); }
});

app.get('/trader/picks/today', (req, res) => {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(path.join(NANOCLAW, 'trader', 'logs', 'trades.db'));
    const fmt = (row) => ({
      date: row.date, asset: row.asset, price: row.price_at_pick,
      option_a: row.option_a, option_b: row.option_b, option_c: row.option_c,
      context: row.context,
      picked: !!row.paul_pick && row.paul_pick !== 'MISS',
      paul_pick: (row.paul_pick && row.paul_pick !== 'MISS') ? row.paul_pick : null,
      ai_pick: (row.paul_pick && row.paul_pick !== 'MISS') ? row.ai_pick : null,
      ai_reasoning: (row.paul_pick && row.paul_pick !== 'MISS') ? row.ai_reasoning : null,
    });
    const today = new Date().toISOString().slice(0, 10);
    const todayRow = db.prepare('SELECT * FROM daily_picks WHERE date = ? ORDER BY id DESC LIMIT 1').get(today);
    const pending = db.prepare("SELECT * FROM daily_picks WHERE (paul_pick IS NULL OR paul_pick = 'MISS') ORDER BY date DESC").all();
    db.close();
    res.json({ quiz: todayRow ? fmt(todayRow) : null, pending: pending.map(fmt) });
  } catch(e) { res.json({ quiz: null, pending: [] }); }
});

app.post('/trader/picks/pick', (req, res) => {
  try {
    const { pick } = req.body || {};
    if (!pick || !['A', 'B', 'C'].includes(pick)) return res.status(400).json({ error: 'Invalid pick' });
    const date = req.body.date || new Date().toISOString().slice(0, 10);
    const Database = require('better-sqlite3');
    const db = new Database(path.join(NANOCLAW, 'trader', 'logs', 'trades.db'));
    let row = db.prepare("SELECT * FROM daily_picks WHERE date = ? AND (paul_pick IS NULL OR paul_pick = 'MISS') ORDER BY id DESC LIMIT 1").get(date);
    if (!row) { db.close(); return res.json({ error: 'Already picked or no quiz for that date' }); }
    db.prepare('UPDATE daily_picks SET paul_pick = ?, paul_picked_at = datetime("now") WHERE id = ?').run(pick, row.id);
    db.close();
    const pickLabel = pick === 'A' ? 'LONG' : pick === 'B' ? 'SHORT' : 'SIT OUT';
    const aiLabel = row.ai_pick === 'A' ? 'LONG' : row.ai_pick === 'B' ? 'SHORT' : 'SIT OUT';
    res.json({ success: true, asset: row.asset, paulPick: pickLabel, aiPick: aiLabel, agree: pick === row.ai_pick });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Intelligence Hub: Scraper endpoints ──────────────────────────────────────

const SCRAPER_OUTPUTS = path.join(NANOCLAW, 'scraper', 'outputs');

app.get('/scraper/dashboard', (req, res) => {
  try {
    const configPath = path.join(NANOCLAW, 'scraper', 'config.json');
    const config = JSON.parse(require('fs').readFileSync(configPath, 'utf8'));
    const data = { generated: new Date().toISOString(), targets: {} };

    const outputMap = {
      hk_sentiment: 'sentiment-latest.json',
      competitor_gyms: 'competitors-latest.json',
      pubmed_science: 'science-latest.json',
      myth_watch: 'myths-latest.json',
      fight_data: 'fight-content-latest.json',
      content_gaps: 'fight-content-latest.json',
      corporate_leads: 'leads-grants-latest.json',
      grants: 'leads-grants-latest.json',
      reviews: 'reviews-sport-latest.json',
      cross_sport: 'reviews-sport-latest.json',
    };

    for (const [name, target] of Object.entries(config.targets)) {
      const file = outputMap[name];
      const filepath = file ? path.join(SCRAPER_OUTPUTS, file) : null;
      let output = null;
      let stat = null;
      if (filepath && require('fs').existsSync(filepath)) {
        try {
          output = JSON.parse(require('fs').readFileSync(filepath, 'utf8'));
          stat = require('fs').statSync(filepath);
        } catch {}
      }
      data.targets[name] = {
        enabled: target.enabled,
        cron: target.cron_hkt,
        lastRun: output?.date || null,
        lastModified: stat?.mtime?.toISOString() || null,
        hasData: !!output,
      };
    }
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/scraper/output/:filename', (req, res) => {
  const filepath = path.join(SCRAPER_OUTPUTS, req.params.filename);
  if (!require('fs').existsSync(filepath)) return res.status(404).json({ error: 'Not found' });
  try {
    res.json(JSON.parse(require('fs').readFileSync(filepath, 'utf8')));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/scraper/hub', (req, res) => {
  const hubPath = path.join(NANOCLAW, 'scraper', 'intelligence-hub.html');
  res.sendFile(hubPath);
});

// ── Reed's Slides ────────────────────────────────────────────────────────────
app.get('/reed-slides', (req, res) => {
  res.sendFile(path.join(NANOCLAW, 'reed-lab', 'slides-gallery.html'));
});
app.get('/reed-slides/deck', (req, res) => {
  const deckPath = path.join(NANOCLAW, 'reed-lab', 'deck.json');
  if (fs.existsSync(deckPath)) return res.json(JSON.parse(fs.readFileSync(deckPath, 'utf8')));
  res.json([]);
});
app.get('/reed-slides/card-project', (req, res) => {
  // Read vault project card for a deck card
  const cardId = parseInt(req.query.id);
  if (!cardId) return res.status(400).json({ error: 'Need ?id=N' });
  const deckPath = path.join(NANOCLAW, 'reed-lab', 'deck.json');
  if (!fs.existsSync(deckPath)) return res.status(404).json({ error: 'No deck' });
  const deck = JSON.parse(fs.readFileSync(deckPath, 'utf8'));
  const card = deck.find(c => c.id === cardId);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!card.project_card) return res.json({ card_id: cardId, has_project: false });

  const vaultPath = path.join(process.env.HOME || '/Users/basicclaw777', 'cathedral-vault', card.project_card);
  if (!fs.existsSync(vaultPath)) return res.json({ card_id: cardId, has_project: false, path: card.project_card });

  const text = fs.readFileSync(vaultPath, 'utf8');
  const fm = {};
  const fmMatch = text.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    for (const line of fmMatch[1].split('\n')) {
      const kv = line.match(/^([^:]+):\s*"?([^"]*)"?\s*$/);
      if (kv) fm[kv[1].trim()] = kv[2].trim();
    }
  }
  res.json({
    card_id: cardId,
    has_project: true,
    path: card.project_card,
    title: fm.title || '',
    status: fm['project-status'] || '',
    priority: fm['project-priority'] || '',
    next_action: fm['project-next-action'] || '',
    last_updated: fm['project-last-updated'] || '',
    blocked_by: fm['project-blocked-by'] || '',
    domain: fm['project-domain'] || '',
  });
});
app.get('/reed-slides/missing-connections', (req, res) => {
  const fp = path.join(NANOCLAW, 'reed-lab', 'missing-connections.json');
  if (fs.existsSync(fp)) return res.json(JSON.parse(fs.readFileSync(fp, 'utf8')));
  res.json({ missing: [] });
});
app.get('/reed-slides/card-image', (req, res) => {
  const file = req.query.file;
  if (!file || file.includes('..')) return res.status(400).send('Bad request');
  const fp = path.join(NANOCLAW, 'reed-lab', 'slides', 'card-images', file);
  if (fs.existsSync(fp)) return res.sendFile(fp);
  res.status(404).send('Not found');
});
app.get('/reed-slides/catalogue', (req, res) => {
  const catPath = path.join(NANOCLAW, 'reed-lab', 'slides', 'catalogue.json');
  if (fs.existsSync(catPath)) return res.json(JSON.parse(fs.readFileSync(catPath, 'utf8')));
  res.json([]);
});

// ── Reed's Studio ────────────────────────────────────────────────────────────
app.get('/reed-visual-hub', (req, res) => {
  res.sendFile(path.join(HOME, 'Cathedral', 'control-panel', 'reed-visual-hub.html'));
});
// Reed Studio Engine API
app.get('/api/reed-studio', (req, res) => {
  const studioDir = path.join(NANOCLAW, 'reed-studio');
  const stateFile = path.join(studioDir, 'state.json');
  const capsFile = path.join(studioDir, 'capabilities.json');
  const briefsDir = path.join(studioDir, 'briefs');
  const stagingDir = path.join(studioDir, 'staging');
  const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
  const capabilities = fs.existsSync(capsFile) ? JSON.parse(fs.readFileSync(capsFile, 'utf8')) : {};
  const briefs = fs.existsSync(briefsDir) ? fs.readdirSync(briefsDir).filter(f => f.endsWith('.json')).map(f => {
    try { return JSON.parse(fs.readFileSync(path.join(briefsDir, f), 'utf8')); } catch { return null; }
  }).filter(Boolean) : [];
  const staging = fs.existsSync(stagingDir) ? fs.readdirSync(stagingDir).map(f => {
    const stat = fs.statSync(path.join(stagingDir, f));
    return { name: f, size: stat.size, mtime: stat.mtime };
  }) : [];
  res.json({ state, capabilities, briefs, staging });
});
app.get('/api/reed-studio/metrics', (req, res) => {
  const metricsFile = path.join(NANOCLAW, 'reed-studio', 'metrics.json');
  if (fs.existsSync(metricsFile)) {
    res.json(JSON.parse(fs.readFileSync(metricsFile, 'utf8')));
  } else {
    res.json({});
  }
});
app.get('/api/reed-studio/feed', (req, res) => {
  const feedFile = path.join(NANOCLAW, 'reed-studio', 'studio-feed.json');
  if (fs.existsSync(feedFile)) {
    const feed = JSON.parse(fs.readFileSync(feedFile, 'utf8'));
    const limit = parseInt(req.query.limit) || 30;
    res.json({ posts: (feed.posts || []).slice(-limit) });
  } else {
    res.json({ posts: [] });
  }
});
app.get('/api/reed-studio/memory', (req, res) => {
  const memFile = path.join(NANOCLAW, 'reed-studio', 'studio-memory.json');
  if (fs.existsSync(memFile)) res.json(JSON.parse(fs.readFileSync(memFile, 'utf8')));
  else res.json({});
});
app.get('/api/reed-studio/status', (req, res) => {
  const metricsFile = path.join(NANOCLAW, 'reed-studio', 'metrics.json');
  const feedFile = path.join(NANOCLAW, 'reed-studio', 'studio-feed.json');
  const stateFile = path.join(NANOCLAW, 'reed-studio', 'state.json');
  const metrics = fs.existsSync(metricsFile) ? JSON.parse(fs.readFileSync(metricsFile, 'utf8')) : {};
  const feed = fs.existsSync(feedFile) ? JSON.parse(fs.readFileSync(feedFile, 'utf8')) : { posts: [] };
  const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
  res.json({
    health: (metrics.streaks?.daysActive || 0) > 0 ? 'active' : 'cold',
    streak: metrics.streaks?.daysActive || 0,
    lastEvent: state.lastEvent,
    recentFeed: (feed.posts || []).slice(-5),
    metrics: { totalAssets: metrics.lifetime?.totalGenerated || 0, thisWeek: metrics.weekly?.generated || 0, briefsQueued: metrics.lifetime?.totalBriefs || 0, execRate: metrics.rates?.briefToExecution || 0 }
  });
});
app.get('/api/reed-studio/briefing', (req, res) => {
  // Agent-readable KPI summary — inject into agent contexts
  const metricsFile = path.join(NANOCLAW, 'reed-studio', 'metrics.json');
  if (!fs.existsSync(metricsFile)) return res.send('No metrics yet.');
  const m = JSON.parse(fs.readFileSync(metricsFile, 'utf8'));
  const freshStyles = Object.entries(m.coverage?.styles || {}).filter(([, v]) => v.health === 'fresh').length;
  const staleStyles = Object.entries(m.coverage?.styles || {}).filter(([, v]) => v.health === 'stale').length;
  const briefing = `REED STUDIO KPIs:\n- Total assets: ${m.lifetime?.totalGenerated || 0} | This week: ${m.weekly?.generated || 0}\n- Briefs queued: ${m.lifetime?.totalBriefs || 0} | Executed: ${m.lifetime?.briefsExecuted || 0} (${m.rates?.briefToExecution || 0}%)\n- Style coverage: ${freshStyles}/9 fresh, ${staleStyles} stale\n- Characters: Logan(${m.coverage?.characters?.logan || 0}) Ling(${m.coverage?.characters?.ling || 0}) Maya(${m.coverage?.characters?.maya || 0})\n- Feed posts: ${m.lifetime?.feedPostsMade || 0} | Engagement: ${m.rates?.feedEngagement || 0}%\n- Streak: ${m.streaks?.daysActive || 0}d (best: ${m.streaks?.longestStreak || 0}d)\n- Paul picks: ${m.lifetime?.paulSelections || 0} | Replacements: ${m.lifetime?.paulReplacements || 0}`;
  res.type('text/plain').send(briefing);
});
app.get('/reed-studio-asset', (req, res) => {
  const filePath = req.query.path;
  const stagingDir = path.join(NANOCLAW, 'reed-studio', 'staging');
  const fullPath = path.join(stagingDir, filePath || '');
  if (!fullPath.startsWith(stagingDir) || !fs.existsSync(fullPath)) return res.status(404).send('not found');
  res.sendFile(fullPath);
});
// ── Engineering Studio API ──────────────────────────────────────────────────
// ── Content Studio API ───────────────────────────────────────────────────────
app.get('/api/content-studio/metrics', (req, res) => {
  const f = path.join(NANOCLAW, 'content-studio', 'metrics.json');
  try { res.json(JSON.parse(fs.readFileSync(f, 'utf8'))); } catch { res.json({}); }
});
app.get('/api/content-studio/feed', (req, res) => {
  const f = path.join(NANOCLAW, 'content-studio', 'studio-feed.json');
  try { res.json(JSON.parse(fs.readFileSync(f, 'utf8'))); } catch { res.json({ posts: [] }); }
});
app.get('/api/content-studio/memory', (req, res) => {
  const f = path.join(NANOCLAW, 'content-studio', 'studio-memory.json');
  try { res.json(JSON.parse(fs.readFileSync(f, 'utf8'))); } catch { res.json({}); }
});
app.get('/api/content-studio/characters', (req, res) => {
  const f = path.join(NANOCLAW, 'content-studio', 'characters.json');
  try { res.json(JSON.parse(fs.readFileSync(f, 'utf8'))); } catch { res.json({}); }
});
app.get('/api/content-studio/status', (req, res) => {
  const metricsFile = path.join(NANOCLAW, 'content-studio', 'metrics.json');
  const feedFile = path.join(NANOCLAW, 'content-studio', 'studio-feed.json');
  let metrics = {}, feed = { posts: [] };
  try { metrics = JSON.parse(fs.readFileSync(metricsFile, 'utf8')); } catch {}
  try { feed = JSON.parse(fs.readFileSync(feedFile, 'utf8')); } catch {}
  res.json({ healthy: true, projects: Object.keys(metrics.projects || {}), feedPosts: (feed.posts || []).length });
});
app.get('/api/content-studio/queue', (req, res) => {
  const f = path.join(NANOCLAW, 'content-studio', 'content-queue.json');
  try { res.json(JSON.parse(fs.readFileSync(f, 'utf8'))); } catch { res.json({ items: [] }); }
});
app.get('/api/content-studio/character-stats', (req, res) => {
  const memDir = path.join(NANOCLAW, 'content-studio', 'character-memory');
  const stats = {};
  for (const charId of ['reed', 'maya', 'ling', 'echo']) {
    const f = path.join(memDir, `${charId}.json`);
    try {
      const mem = JSON.parse(fs.readFileSync(f, 'utf8'));
      stats[charId] = { totalPitches: (mem.pitches || []).length, selected: mem.selected || 0, ignored: mem.ignored || 0, rejected: mem.rejected || 0, selectionRate: mem.selectionRate, lastPitch: mem.lastPitch };
    } catch { stats[charId] = { totalPitches: 0, selected: 0, ignored: 0, rejected: 0, selectionRate: null, lastPitch: null }; }
  }
  res.json(stats);
});
app.post('/api/content-studio/select', (req, res) => {
  const { ideaId } = req.body || {};
  if (!ideaId) return res.status(400).json({ error: 'ideaId required' });
  const f = path.join(NANOCLAW, 'content-studio', 'content-queue.json');
  try {
    const queue = JSON.parse(fs.readFileSync(f, 'utf8'));
    const item = queue.items.find(i => i.id === ideaId);
    if (!item) return res.status(404).json({ error: 'idea not found' });
    item.status = 'selected'; item.selectedAt = new Date().toISOString();
    fs.writeFileSync(f, JSON.stringify(queue, null, 2));
    // Update character memory
    const memFile = path.join(NANOCLAW, 'content-studio', 'character-memory', `${item.character}.json`);
    try {
      const mem = JSON.parse(fs.readFileSync(memFile, 'utf8'));
      mem.selected = (mem.selected || 0) + 1;
      const total = mem.selected + (mem.ignored || 0) + (mem.rejected || 0);
      mem.selectionRate = total > 0 ? mem.selected / total : null;
      fs.writeFileSync(memFile, JSON.stringify(mem, null, 2));
    } catch {}
    res.json({ selected: true, item });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/content-studio/reject', (req, res) => {
  const { ideaId, reason } = req.body || {};
  if (!ideaId) return res.status(400).json({ error: 'ideaId required' });
  const f = path.join(NANOCLAW, 'content-studio', 'content-queue.json');
  try {
    const queue = JSON.parse(fs.readFileSync(f, 'utf8'));
    const item = queue.items.find(i => i.id === ideaId);
    if (!item) return res.status(404).json({ error: 'idea not found' });
    item.status = 'rejected'; item.rejectedAt = new Date().toISOString(); item.reason = reason || '';
    fs.writeFileSync(f, JSON.stringify(queue, null, 2));
    // Update character memory
    const memFile = path.join(NANOCLAW, 'content-studio', 'character-memory', `${item.character}.json`);
    try {
      const mem = JSON.parse(fs.readFileSync(memFile, 'utf8'));
      mem.rejected = (mem.rejected || 0) + 1;
      const total = (mem.selected || 0) + (mem.ignored || 0) + mem.rejected;
      mem.selectionRate = total > 0 ? (mem.selected || 0) / total : null;
      fs.writeFileSync(memFile, JSON.stringify(mem, null, 2));
    } catch {}
    res.json({ rejected: true, item });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/content-studio/internal-feed', (req, res) => {
  const f = path.join(NANOCLAW, 'content-studio', 'maya-internal-feed.json');
  try { res.json(JSON.parse(fs.readFileSync(f, 'utf8'))); } catch { res.json({ posts: [] }); }
});
app.get('/api/content-studio/wishlist', (req, res) => {
  const f = path.join(NANOCLAW, 'content-studio', 'capture-wishlist.json');
  try { res.json(JSON.parse(fs.readFileSync(f, 'utf8'))); } catch { res.json({ requests: [], fulfilled: [] }); }
});
app.post('/api/content-studio/fulfill', (req, res) => {
  const { requestId } = req.body || {};
  if (!requestId) return res.status(400).json({ error: 'requestId required' });
  const f = path.join(NANOCLAW, 'content-studio', 'capture-wishlist.json');
  try {
    const wishlist = JSON.parse(fs.readFileSync(f, 'utf8'));
    const idx = wishlist.requests.findIndex(r => r.id === requestId);
    if (idx === -1) return res.status(404).json({ error: 'request not found' });
    const [request] = wishlist.requests.splice(idx, 1);
    request.fulfilledAt = new Date().toISOString();
    wishlist.fulfilled.push(request);
    wishlist.lastUpdated = new Date().toISOString();
    fs.writeFileSync(f, JSON.stringify(wishlist, null, 2));
    res.json({ fulfilled: true, request });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Engineering Studio API ───────────────────────────────────────────────────
app.get('/api/engineering-studio/metrics', (req, res) => {
  const f = path.join(NANOCLAW, 'engineering-studio', 'metrics.json');
  if (!fs.existsSync(f)) return res.json({});
  res.json(JSON.parse(fs.readFileSync(f, 'utf8')));
});
app.get('/api/engineering-studio/feed', (req, res) => {
  const f = path.join(NANOCLAW, 'engineering-studio', 'studio-feed.json');
  if (!fs.existsSync(f)) return res.json({ posts: [] });
  res.json(JSON.parse(fs.readFileSync(f, 'utf8')));
});
app.get('/api/engineering-studio/memory', (req, res) => {
  const f = path.join(NANOCLAW, 'engineering-studio', 'studio-memory.json');
  if (!fs.existsSync(f)) return res.json({});
  res.json(JSON.parse(fs.readFileSync(f, 'utf8')));
});
app.get('/api/engineering-studio/briefing', (req, res) => {
  const f = path.join(NANOCLAW, 'engineering-studio', 'metrics.json');
  if (!fs.existsSync(f)) return res.type('text/plain').send('Engineering Studio: no metrics yet.');
  const m = JSON.parse(fs.readFileSync(f, 'utf8'));
  const gym = m.projects?.gym_eyes || {};
  const ing = m.projects?.ingestion_pipeline || {};
  const cnn = m.projects?.cnn_training || {};
  const h = m.lab_health || {};
  const briefing = `ENGINEERING STUDIO BRIEFING:\n- Gym Eyes: ${gym.sessions_processed_total || 0} sessions, ${gym.students_tracked || 0} students, accuracy: ${gym.detection_accuracy || 'UNMEASURED'}\n- Ingestion: ${ing.status || 'unknown'} — ${ing.days_running_unattended || 0} days autonomous\n- CNN: ${cnn.status || 'unknown'} — ${cnn.frames_collected || 0}/${cnn.target_frames || '?'} frames\n- Lab: ${h.experiments_this_week || 0} experiments, ${h.post_mortems_this_month || 0} post-mortems, ${h.pipeline_failures_week || 0} failures`;
  res.type('text/plain').send(briefing);
});
app.get('/api/engineering-studio/status', (req, res) => {
  const metricsFile = path.join(NANOCLAW, 'engineering-studio', 'metrics.json');
  const feedFile = path.join(NANOCLAW, 'engineering-studio', 'studio-feed.json');
  const metrics = fs.existsSync(metricsFile) ? JSON.parse(fs.readFileSync(metricsFile, 'utf8')) : {};
  const feed = fs.existsSync(feedFile) ? JSON.parse(fs.readFileSync(feedFile, 'utf8')) : { posts: [] };
  res.json({
    health: metrics.projects?.ingestion_pipeline?.days_running_unattended > 0 ? 'active' : 'cold',
    projects: Object.keys(metrics.projects || {}).length,
    recentFeed: (feed.posts || []).slice(0, 5),
    labHealth: metrics.lab_health || {}
  });
});

// ── Studio Commons: Progress + Rating API ───────────────────────────────────
app.get('/api/studio-progress', (req, res) => {
  // Returns progress for all studios
  const studios = ['reed-studio', 'engineering-studio', 'content-studio'];
  const results = {};
  for (const id of studios) {
    const progressFile = path.join(NANOCLAW, id, 'progress.json');
    const feedFile = path.join(NANOCLAW, id, 'studio-feed.json');
    let progress = { snapshots: [] };
    let feed = { posts: [] };
    try { progress = JSON.parse(fs.readFileSync(progressFile, 'utf8')); } catch {}
    try { feed = JSON.parse(fs.readFileSync(feedFile, 'utf8')); } catch {}

    const posts = feed.posts || [];
    const rated = posts.filter(p => p.outcome).length;
    const orcPosts = posts.filter(p => p.role === 'orc' && p.outcome);
    const succeeded = orcPosts.filter(p => p.outcome.result === 'succeeded' || p.outcome.result === 'acted').length;

    // Compute trends from last 2 snapshots
    const snaps = progress.snapshots || [];
    let trends = {};
    if (snaps.length >= 2) {
      const latest = snaps[snaps.length - 1].metrics || {};
      const prev = snaps[snaps.length - 2].metrics || {};
      for (const key of Object.keys(latest)) {
        if (typeof latest[key] === 'number' && typeof prev[key] === 'number') {
          trends[key] = latest[key] > prev[key] ? 'up' : latest[key] < prev[key] ? 'down' : 'flat';
        }
      }
    }

    results[id] = {
      snapshots: snaps.length,
      latest: snaps[snaps.length - 1] || null,
      trends,
      memoryQuality: { total: posts.length, rated, ratedPercent: posts.length > 0 ? Math.round((rated / posts.length) * 100) : 0 },
      effectiveness: orcPosts.length > 0 ? { rated: orcPosts.length, succeeded, percent: Math.round((succeeded / orcPosts.length) * 100) } : null
    };
  }
  res.json(results);
});

app.post('/api/studio-rate', (req, res) => {
  // Rate a feed post outcome
  const { studio, postId, result, detail } = req.body || {};
  if (!studio || !postId || !result) return res.status(400).json({ error: 'studio, postId, result required' });
  const feedPath = path.join(NANOCLAW, studio, 'studio-feed.json');
  if (!fs.existsSync(feedPath)) return res.status(404).json({ error: 'studio not found' });
  const feed = JSON.parse(fs.readFileSync(feedPath, 'utf8'));
  const post = feed.posts.find(p => p.id === postId);
  if (!post) return res.status(404).json({ error: 'post not found' });
  post.outcome = { result, detail: detail || '', ratedAt: new Date().toISOString() };
  fs.writeFileSync(feedPath, JSON.stringify(feed, null, 2));

  // Log to memory
  const memPath = path.join(NANOCLAW, studio, 'studio-memory.json');
  if (fs.existsSync(memPath)) {
    const mem = JSON.parse(fs.readFileSync(memPath, 'utf8'));
    if (!mem.ratedOutcomes) mem.ratedOutcomes = [];
    mem.ratedOutcomes.push({ postId: post.id, role: post.role, action: (post.content || '').slice(0, 100), outcome: post.outcome, date: post.outcome.ratedAt });
    if (mem.ratedOutcomes.length > 100) mem.ratedOutcomes = mem.ratedOutcomes.slice(-100);
    fs.writeFileSync(memPath, JSON.stringify(mem, null, 2));
  }
  res.json({ rated: true, post });
});

app.post('/api/studio-snapshot', (req, res) => {
  // Trigger progress snapshot for all studios
  const studios = [
    { id: 'reed-studio', dir: path.join(NANOCLAW, 'reed-studio'), metricsFile: 'metrics.json' },
    { id: 'engineering-studio', dir: path.join(NANOCLAW, 'engineering-studio'), metricsFile: 'metrics.json' },
    { id: 'content-studio', dir: path.join(NANOCLAW, 'content-studio'), metricsFile: 'metrics.json' }
  ];
  const results = [];
  for (const s of studios) {
    const mf = path.join(s.dir, s.metricsFile);
    if (!fs.existsSync(mf)) continue;
    const metrics = JSON.parse(fs.readFileSync(mf, 'utf8'));
    const progressFile = path.join(s.dir, 'progress.json');
    let progress;
    try { progress = JSON.parse(fs.readFileSync(progressFile, 'utf8')); } catch { progress = { snapshots: [] }; }
    progress.snapshots.push({ date: new Date().toISOString(), metrics });
    if (progress.snapshots.length > 90) progress.snapshots = progress.snapshots.slice(-90);
    fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
    results.push({ id: s.id, snapshotCount: progress.snapshots.length });
  }
  res.json({ snapshotted: results });
});

// Character assets API for visual hub
app.get('/api/character-assets', (req, res) => {
  const dirs = [
    { label: 'Logan (Vault)', path: path.join(HOME, 'cathedral-vault/09_Artifacts/logan') },
    { label: 'Logan (BR)', path: path.join(HOME, 'cathedral-vault/09_Artifacts/branding/basic-reflex/logan') },
    { label: 'Logan Sheets', path: path.join(HOME, 'cathedral-vault/09_Artifacts/branding/basic-reflex/logan/character-sheets') },
    { label: 'Reed Outbox', path: path.join(HOME, 'nanoclaw/reed-scene-outbox') },
  ];
  const assets = [];
  const imgExts = ['.png','.jpg','.jpeg','.webp','.gif','.mp4','.mov'];
  for (const d of dirs) {
    try {
      const files = fs.readdirSync(d.path);
      for (const f of files) {
        const ext = path.extname(f).toLowerCase();
        if (!imgExts.includes(ext)) continue;
        const fullPath = path.join(d.path, f);
        try {
          const stat = fs.statSync(fullPath);
          if (!stat.isFile()) continue;
          const character = f.toLowerCase().includes('maya') ? 'Maya' : f.toLowerCase().includes('ling') ? 'Ling' : 'Logan';
          assets.push({ name: f, character, source: d.label, path: fullPath, size: stat.size, mtime: stat.mtime, type: ext === '.mp4' || ext === '.mov' ? 'video' : 'image' });
        } catch(e) {}
      }
    } catch(e) {}
  }
  assets.sort((a,b) => new Date(b.mtime) - new Date(a.mtime));
  res.json(assets);
});
// Serve character asset files
app.get('/character-asset', (req, res) => {
  const filePath = req.query.path;
  if (!filePath || !filePath.startsWith(HOME)) return res.status(400).send('bad path');
  if (!fs.existsSync(filePath)) return res.status(404).send('not found');
  res.sendFile(filePath);
});
app.get('/reed-treatments', (req, res) => {
  res.sendFile(path.join(HOME, 'basic-reflex', 'assets', 'reed-instagram-treatments.html'));
});
// Serve treatment images (relative paths from reed-instagram-treatments.html)
app.get('/Downloads/:folder/:file', (req, res) => {
  const filePath = path.join(HOME, 'Downloads', path.basename(req.params.folder), path.basename(req.params.file));
  if (!fs.existsSync(filePath)) return res.status(404).send('not found');
  res.sendFile(filePath);
});
app.get('/reed-studio', (req, res) => {
  res.sendFile(path.join(NANOCLAW, 'reed-lab', 'studio.html'));
});
app.get('/reed-lab/catalogue', (req, res) => {
  const catPath = path.join(NANOCLAW, 'reed-lab', 'catalogue.json');
  if (fs.existsSync(catPath)) return res.json(JSON.parse(fs.readFileSync(catPath, 'utf8')));
  res.json({ photos: [], generations: [], stats: { total_generated: 0, by_style: {} } });
});
app.get('/reed-lab/shots', (req, res) => {
  const shotPath = path.join(NANOCLAW, 'reed-lab', 'shot-list.json');
  if (fs.existsSync(shotPath)) return res.json(JSON.parse(fs.readFileSync(shotPath, 'utf8')));
  res.json({ assignments: [], full_list: [] });
});
app.get('/reed-lab/image', (req, res) => {
  const imgPath = req.query.path;
  if (!imgPath || !imgPath.startsWith(path.join(process.env.HOME))) return res.status(400).send('Bad path');
  if (!fs.existsSync(imgPath)) return res.status(404).send('Not found');
  res.sendFile(imgPath);
});

app.get('/cosmology', (req, res) => {
  res.sendFile(path.join(NANOCLAW, 'reed-lab', 'cosmology-research.html'));
});

app.get('/cosmology/graph', (req, res) => {
  res.sendFile(path.join(NANOCLAW, 'reed-lab', 'cosmology-graph.html'));
});

app.get('/simpsons', (req, res) => {
  res.sendFile(path.join(NANOCLAW, 'simpsons-forensics', 'dashboard.html'));
});

app.get('/sumerian', (req, res) => {
  res.sendFile(path.join(HOME, 'basic-reflex', 'visuals', 'sumerian-observatory.html'));
});

app.get('/publisher', (req, res) => {
  res.sendFile(path.join(NANOCLAW, 'reed-lab', 'publisher-studio.html'));
});

app.get('/reed-lab/digest', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const digestPath = path.join(NANOCLAW, 'reed-lab', `roundtable-digest-${today}.html`);
  // Try today, else find latest
  if (fs.existsSync(digestPath)) return res.sendFile(digestPath);
  const files = fs.readdirSync(path.join(NANOCLAW, 'reed-lab'))
    .filter(f => f.startsWith('roundtable-digest-') && f.endsWith('.html'))
    .sort().reverse();
  if (files.length > 0) return res.sendFile(path.join(NANOCLAW, 'reed-lab', files[0]));
  res.status(404).send('No digest yet. Run /digest on Telegram.');
});

// ── Environments ──────────────────────────────────────────────────────────────

app.get('/env/test', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(NANOCLAW, 'environments', 'test.html'));
});
app.get('/env', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.sendFile(path.join(NANOCLAW, 'environments', 'lobby.html'));
});
app.get('/env/icon-180.png', (req, res) => {
  res.sendFile(path.join(NANOCLAW, 'environments', 'icon-180.png'));
});
app.get('/env/:domain', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.sendFile(path.join(NANOCLAW, 'environments', 'lobby.html'));
});

// ── Looking Glass (Sky Sense) ────────────────────────────────────────────────

app.get('/cathedral-deck', (req, res) => {
  res.sendFile(path.join(HOME, 'basic-reflex', 'visuals', 'cathedral-deck.html'));
});

app.get('/property-scout', (req, res) => {
  res.sendFile(path.join(HOME, 'Cathedral', 'control-panel', 'property-scout.html'));
});
app.get('/property-scout/:file', (req, res) => {
  const f = path.basename(req.params.file);
  const p = path.join(HOME, 'nanoclaw', 'property-scout', f);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'not found' });
  res.set('Cache-Control', 'no-store');
  res.sendFile(p);
});

app.get('/cathedral-rosetta', (req, res) => {
  res.sendFile(path.join(__dirname, 'cathedral-rosetta-dashboard.html'));
});

app.get('/rosetta-bridge', (req, res) => {
  res.sendFile(path.join(__dirname, 'rosetta-bridge-dashboard.html'));
});

app.get('/looking-glass', (req, res) => {
  res.sendFile(path.join(HOME, 'basic-reflex', 'visuals', 'looking-glass.html'));
});

// ── Agent Hub ─────────────────────────────────────────────────────────────

app.get('/agents', (req, res) => {
  res.sendFile(path.join(HOME, 'Cathedral', 'agents', 'agent-hub.html'));
});

app.get('/agents/data', (req, res) => {
  try {
    const agentsDir = path.join(HOME, 'Cathedral', 'agents');
    const registry = JSON.parse(fs.readFileSync(path.join(agentsDir, 'registry.json'), 'utf8'));
    const stagingDir = path.join(HOME, 'cathedral-vault', '00_Staging', 'cathedral');

    // Agent states
    const states = {};
    const stateDir = path.join(agentsDir, 'state');
    if (fs.existsSync(stateDir)) {
      for (const f of fs.readdirSync(stateDir).filter(f => f.endsWith('.json'))) {
        try {
          states[f.replace('.json', '')] = JSON.parse(fs.readFileSync(path.join(stateDir, f), 'utf8'));
        } catch {}
      }
    }

    // Call log (last 100)
    const logPath = path.join(HOME, 'Cathedral', 'agent-calls.jsonl');
    let calls = [];
    if (fs.existsSync(logPath)) {
      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
      calls = lines.slice(-100).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    }

    // Harvests (all types, last 30)
    let harvests = [];
    if (fs.existsSync(stagingDir)) {
      harvests = fs.readdirSync(stagingDir)
        .filter(f => f.startsWith('session-harvest-') || f.startsWith('terminal-harvest-') || f.startsWith('orc-session-'))
        .map(f => {
          const stat = fs.statSync(path.join(stagingDir, f));
          const content = fs.readFileSync(path.join(stagingDir, f), 'utf8');
          const titleMatch = content.match(/^title:\s*"?([^"\n]+)"?/m);
          const msgsMatch = content.match(/^messages:\s*(\d+)/m);
          const turnsMatch = content.match(/^turns:\s*(\d+)/m);
          const typeMatch = content.match(/^type:\s*(\S+)/m);
          return {
            name: f,
            date: stat.mtime.toISOString(),
            size: stat.size,
            title: titleMatch ? titleMatch[1] : f,
            messages: msgsMatch ? parseInt(msgsMatch[1]) : (turnsMatch ? parseInt(turnsMatch[1]) : 0),
            type: typeMatch ? typeMatch[1] : (f.startsWith('terminal-') ? 'terminal' : 'web'),
          };
        })
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 30);
    }

    // Inter-agent messages
    let messages = [];
    try {
      const { listInboxes, readMessages } = require(path.join(HOME, 'nanoclaw', 'project-messages.cjs'));
      const inboxes = listInboxes();
      messages = inboxes.map(ib => ({
        projectId: ib.projectId,
        total: ib.total,
        unread: ib.unread,
      }));
    } catch {}

    // Knowledge overlap: which vault sections do agents share?
    const connections = [];
    const agentIds = Object.keys(registry.agents);
    for (let i = 0; i < agentIds.length; i++) {
      for (let j = i + 1; j < agentIds.length; j++) {
        const a = registry.agents[agentIds[i]];
        const b = registry.agents[agentIds[j]];
        const aSections = new Set((a.vaultSections || []).map(s => s.split('/')[0]));
        const bSections = new Set((b.vaultSections || []).map(s => s.split('/')[0]));
        const shared = [...aSections].filter(s => bSections.has(s));
        const aOnly = [...aSections].filter(s => !bSections.has(s));
        const bOnly = [...bSections].filter(s => !aSections.has(s));
        connections.push({
          from: agentIds[i],
          to: agentIds[j],
          shared,
          fromOnly: aOnly,
          toOnly: bOnly,
          strength: shared.length / Math.max(aSections.size, bSections.size, 1),
        });
      }
    }

    // Harvest content keywords per agent domain (scan recent harvests for domain relevance)
    const domainKeywords = {
      orc: ['orchestr', 'project', 'build', 'architect', 'standing instruction', 'cartograph', 'harvest'],
      boxing: ['boxing', 'punch', 'guard', 'combo', 'technique', 'padwork', 'sparring', 'curriculum', 'drill', 'defence'],
      br: ['revenue', 'member', 'crm', 'campaign', 'instagram', 'grant', 'churn', 'retention', 'business', 'pricing'],
    };

    // Scan harvests for cross-domain mentions (which harvests contain info relevant to which agents)
    const crossReferences = [];
    for (const h of harvests.slice(0, 20)) {
      try {
        const content = fs.readFileSync(path.join(stagingDir, h.name), 'utf8').toLowerCase();
        const relevant = {};
        for (const [agentId, keywords] of Object.entries(domainKeywords)) {
          const hits = keywords.filter(k => content.includes(k));
          if (hits.length >= 1) relevant[agentId] = hits;
        }
        const relevantAgents = Object.keys(relevant);
        if (relevantAgents.length >= 2) {
          crossReferences.push({
            harvest: h.name,
            date: h.date,
            agents: relevant,
            type: h.type,
            messages: h.messages,
          });
        }
      } catch {}
    }

    // Uptake stats
    const uptake = {};
    const uptakeDir = path.join(agentsDir, 'uptake');
    if (fs.existsSync(uptakeDir)) {
      for (const f of fs.readdirSync(uptakeDir).filter(f => f.endsWith('.json'))) {
        try {
          uptake[f.replace('.json', '')] = JSON.parse(fs.readFileSync(path.join(uptakeDir, f), 'utf8'));
        } catch {}
      }
    }

    res.json({
      registry: registry.agents,
      states,
      calls,
      harvests,
      messages,
      connections,
      crossReferences,
      uptake,
      now: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/looking-glass/sky', async (req, res) => {
  try {
    const { skyState } = await import('./services/sky-sense/index.mjs');
    const date = req.query.date ? new Date(req.query.date) : new Date();
    res.json(skyState(date));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/looking-glass/signal', async (req, res) => {
  try {
    const { todaySignal } = await import('./services/sky-sense/index.mjs');
    res.json(todaySignal());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/looking-glass/scan', async (req, res) => {
  try {
    const { lookForward } = await import('./services/sky-sense/index.mjs');
    const days = parseInt(req.query.days) || 90;
    const from = req.query.from ? new Date(req.query.from) : undefined;
    res.json(lookForward({ days, resolution: 7, from }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/looking-glass/pipelines/:body', async (req, res) => {
  try {
    const { comparePipelines } = await import('./services/sky-sense/index.mjs');
    const date = req.query.date ? new Date(req.query.date) : new Date();
    res.json(comparePipelines(req.params.body, date));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/looking-glass/events', async (req, res) => {
  try {
    const { findEvents } = await import('./services/sky-sense/index.mjs');
    const days = parseInt(req.query.days) || 90;
    res.json(findEvents(new Date(), days));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Geomagnetic Prediction Engine ────────────────────────────────────────────

app.get('/geomag', (req, res) => {
  res.sendFile(path.join(NANOCLAW, 'geomag', 'geomag-dashboard.html'));
});

app.get('/geomag/data', async (req, res) => {
  try {
    const { fetchAllSpaceWeather } = await import('./geomag/space-weather-fetcher.js');
    const sw = await fetchAllSpaceWeather();

    // Run strategies
    const { predictDst: wsaEnlil } = await import('./geomag/strategies/wsa-enlil.js');
    const { predictDst: electricUniverse } = await import('./geomag/strategies/electric-universe.js');
    const { predictDst: resonantCavity } = await import('./geomag/strategies/resonant-cavity.js');
    const { predictDst: planetaryTidal } = await import('./geomag/strategies/planetary-tidal.js');

    const predictions = [wsaEnlil, electricUniverse, resonantCavity, planetaryTidal]
      .map(fn => { try { return fn(sw); } catch { return null; } })
      .filter(Boolean);

    res.json({ timestamp: new Date().toISOString(), spaceWeather: sw, predictions });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Geomag Backtest ──────────────────────────────────────────────────────────

app.get('/geomag/backtest-dashboard', (req, res) => {
  res.sendFile(path.join(NANOCLAW, 'geomag', 'backtest-dashboard.html'));
});

app.get('/geomag/backtest', (req, res) => {
  const fs = require('fs');
  const year = req.query.year || '2024';
  const resultsPath = path.join(NANOCLAW, 'geomag', 'backtest-results', `backtest-${year}.json`);
  if (fs.existsSync(resultsPath)) {
    res.json(JSON.parse(fs.readFileSync(resultsPath, 'utf8')));
  } else {
    res.status(404).json({ error: `No backtest results for ${year}` });
  }
});

// ── Cathedral Control ────────────────────────────────────────────────────────

app.get('/control', (req, res) => {
  res.sendFile(path.join(HOME, 'basic-reflex', 'visuals', 'cathedral-control.html'));
});

app.post('/control/toggle/:name', async (req, res) => {
  const { name } = req.params;
  const { action } = req.body || {};
  try {
    const { execSync } = require('child_process');
    const cmd = action === 'stop' ? `pm2 stop ${name}` : `pm2 start ${name}`;
    execSync(cmd, { timeout: 10000 });
    res.json({ ok: true, action: action || 'start', name });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/control/run/:script', async (req, res) => {
  const scripts = {
    whisperer: path.join(NANOCLAW, 'looking-glass-whisperer.mjs'),
    bridge: path.join(NANOCLAW, 'cognitive-bridge.mjs'),
    lymphatic: path.join(NANOCLAW, 'lymphatic.mjs'),
  };
  const script = scripts[req.params.script];
  if (!script) return res.status(404).json({ error: 'unknown script' });
  try {
    const { exec } = require('child_process');
    exec(`node ${script}`, { timeout: 120000 });
    res.json({ ok: true, script: req.params.script, status: 'launched' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/control/health', async (req, res) => {
  try {
    const fs = require('fs');
    const health = {};
    // Belief tracker count
    try {
      const Database = require('better-sqlite3');
      const db = new Database(path.join(NANOCLAW, 'vortex_data/metrics.db'), { readonly: true });
      const has = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='belief_trajectory'").all();
      health.beliefEntries = has.length ? db.prepare('SELECT COUNT(*) as c FROM belief_trajectory').get().c : 0;
      db.close();
    } catch { health.beliefEntries = 0; }
    // Taste map
    try {
      const tm = JSON.parse(fs.readFileSync(path.join(NANOCLAW, 'taste-map.json'), 'utf-8'));
      health.tasteAnchors = (tm.anchors || []).length;
      health.tasteRejections = (tm.rejections || []).length;
    } catch { health.tasteAnchors = 0; health.tasteRejections = 0; }
    // Lymphatic state
    try {
      const ls = JSON.parse(fs.readFileSync(path.join(HOME, 'Cathedral/lymphatic-state.json'), 'utf-8'));
      const recent = (ls.bloatFlags || []).slice(-20);
      health.avgBloat = recent.length ? recent.reduce((s, b) => s + b.score, 0) / recent.length : 0;
      health.ratings = (ls.ratings || []).slice(-5);
    } catch { health.avgBloat = 0; health.ratings = []; }
    // Knowledge graph
    try {
      const g = JSON.parse(fs.readFileSync(path.join(HOME, 'Cathedral/predictive-intelligence/knowledge-graph.json'), 'utf-8'));
      health.graphNodes = (g.nodes || []).length;
      health.graphEdges = (g.edges || g.links || []).length;
    } catch { health.graphNodes = 0; health.graphEdges = 0; }
    res.json(health);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /hermes — Dispatch to Hermes Agent (Court Member #20) ───────────────

app.post('/hermes', requireApiKey, async (req, res) => {
  const { prompt, timeout = 120000 } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  // Write prompt to file, run hermes-oneshot.py, read output from file
  const ts = Date.now();
  const promptFile = path.join(NANOCLAW, `.hermes-prompt-${ts}.txt`);
  const outFile = path.join(NANOCLAW, `.hermes-out-${ts}.txt`);
  const maxMs = Math.min(timeout, 300000);

  fs.writeFileSync(promptFile, prompt);

  // Write prompt to file, launch hermes via nohup (fully detached from PM2 tree)
  fs.writeFileSync(promptFile, prompt);
  const doneFile = outFile + '.done';
  // Use nohup + setsid to fully escape PM2's process group
  const cmd = [
    `cd /Users/basicclaw777/.hermes/hermes-agent`,
    `export HOME=/Users/basicclaw777`,
    `unset PYTHONPATH PYTHONHOME`,
    `source /Users/basicclaw777/.hermes/.env 2>/dev/null || true`,
    `/Users/basicclaw777/.hermes/hermes-agent/venv/bin/hermes -z "$(cat ${promptFile})" > ${outFile} 2>&1`,
    `touch ${doneFile}`,
  ].join(' && ');
  spawn('nohup', ['bash', '-c', cmd], {
    stdio: ['ignore', 'ignore', 'ignore'],
    detached: true,
    env: {},  // completely clean env
  }).unref();

  const start = Date.now();
  const poll = setInterval(() => {
    if (Date.now() - start > maxMs) {
      clearInterval(poll);
      try { fs.unlinkSync(outFile); fs.unlinkSync(doneFile); fs.unlinkSync(promptFile); } catch {}
      return res.status(504).json({ error: 'hermes timeout' });
    }
    if (!fs.existsSync(doneFile)) return;
    clearInterval(poll);
    let output = '';
    try { output = fs.readFileSync(outFile, 'utf8').trim(); } catch {}
    try { fs.unlinkSync(outFile); fs.unlinkSync(doneFile); fs.unlinkSync(promptFile); } catch {}
    res.json({ response: output || '', exitCode: output ? 0 : 1 });
  }, 500);
});

// ── GET /hermes/status — Check Hermes gateway health ─────────────────────────

app.get('/hermes/status', async (req, res) => {
  try {
    const result = await run('/Users/basicclaw777/.local/bin/hermes', ['--version'], 5000);
    res.json({ status: 'online', version: result });
  } catch (err) {
    res.json({ status: 'offline', error: err.message });
  }
});

// ── Growth Agent ─────────────────────────────────────────────────────────────

app.get('/growth', (req, res) => {
  res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', 'Content-Type': 'text/html; charset=utf-8' });
  try {
    const html = fs.readFileSync(path.join(NANOCLAW, 'growth-agent', 'growth-ui.html'), 'utf8');
    res.send(html);
  } catch (err) {
    res.status(500).send(`Growth UI not found: ${err.message}`);
  }
});

app.get('/growth/calendar', (req, res) => {
  try {
    const dir = path.join(NANOCLAW, 'growth-agent', 'reports');
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.startsWith('calendar-') && f.endsWith('.json')).sort().reverse() : [];
    const calendar = files.length > 0 ? JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf8')) : null;
    res.json({ ok: true, calendar });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post('/growth/calendar/generate', (req, res) => {
  try {
    const result = require('child_process').execSync(
      `node -e "import('./growth-agent/content-calendar.js').then(m => m.generateWeeklyCalendar().then(c => console.log(JSON.stringify({ok:true,week:c.week,posts:c.posts?.length||0}))))"`,
      { cwd: NANOCLAW, timeout: 45000, env: { ...process.env, HOME: process.env.HOME || '/Users/basicclaw777' } }
    ).toString().trim();
    res.json(JSON.parse(result));
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.get('/growth/corporate', (req, res) => {
  try {
    const pipePath = path.join(NANOCLAW, 'growth-agent', 'reports', 'corporate-pipeline.json');
    const pipeline = fs.existsSync(pipePath) ? JSON.parse(fs.readFileSync(pipePath, 'utf8')) : { prospects: [], lastUpdated: null };
    res.json({ ok: true, pipeline });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.get('/growth/newsletter', (req, res) => {
  try {
    const dir = path.join(NANOCLAW, 'growth-agent', 'reports');
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.startsWith('newsletter-') && f.endsWith('.json')).sort().reverse() : [];
    const newsletter = files.length > 0 ? JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf8')) : null;
    res.json({ ok: true, newsletter });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post('/growth/newsletter/generate', (req, res) => {
  try {
    const result = require('child_process').execSync(
      `node -e "import('./growth-agent/newsletter-engine.js').then(m => m.generateNewsletter().then(n => console.log(JSON.stringify({ok:true,month:n.monthName}))))"`,
      { cwd: NANOCLAW, timeout: 45000, env: { ...process.env, HOME: process.env.HOME || '/Users/basicclaw777' } }
    ).toString().trim();
    res.json(JSON.parse(result));
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.get('/growth/seo', (req, res) => {
  try {
    const seoPath = path.join(NANOCLAW, 'growth-agent', 'reports', 'seo-checklist.json');
    if (!fs.existsSync(seoPath)) {
      // Trigger creation of defaults
      require('child_process').execSync(
        `node -e "import('./growth-agent/seo-checklist.js').then(m => { m.getSEOChecklist(); console.log('ok'); })"`,
        { cwd: NANOCLAW, timeout: 10000, env: { ...process.env, HOME: process.env.HOME || '/Users/basicclaw777' } }
      );
    }
    const seo = JSON.parse(fs.readFileSync(seoPath, 'utf8'));
    res.json({ ok: true, seo });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── Command Centre Dashboard ─────────────────────────────────────────────────

app.get('/dashboard', (req, res) => {
  res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', 'Content-Type': 'text/html; charset=utf-8' });
  try {
    const html = fs.readFileSync(path.join(NANOCLAW, 'command-centre', 'index.html'), 'utf8');
    res.send(html);
  } catch (err) {
    res.status(500).send(`Dashboard not found: ${err.message}`);
  }
});

app.get('/dashboard/data.js', (req, res) => {
  res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'application/javascript' });
  try {
    res.sendFile(path.join(NANOCLAW, 'command-centre', 'dashboard-data.js'));
  } catch (err) {
    res.status(500).send(`// data not found: ${err.message}`);
  }
});

app.get('/dashboard/refresh', (req, res) => {
  try {
    require('child_process').execSync('node command-centre/refresh-dashboard.js', { cwd: NANOCLAW, timeout: 15000 });
    res.json({ ok: true, message: 'Dashboard data refreshed' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Comms Engine Web UI ──────────────────────────────────────────────────────

app.get('/comms', (req, res) => {
  res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', 'Content-Type': 'text/html; charset=utf-8' });
  try {
    const html = fs.readFileSync(path.join(NANOCLAW, 'comms-engine', 'comms-ui.html'), 'utf8');
    res.send(html);
  } catch (err) {
    res.status(500).send(`Comms UI not found: ${err.message}`);
  }
});

app.get('/comms/queue', (req, res) => {
  try {
    const queuePath = path.join(NANOCLAW, 'comms-engine', 'outbox', 'queue.json');
    const queue = fs.existsSync(queuePath) ? JSON.parse(fs.readFileSync(queuePath, 'utf8')) : [];
    const summary = { pending: 0, approved: 0, sent: 0, skipped: 0, total: queue.length };
    for (const item of queue) summary[item.status] = (summary[item.status] || 0) + 1;
    res.json({ ok: true, summary, queue });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/comms/action', (req, res) => {
  try {
    const { id, action } = req.body;
    if (!id || !action) return res.status(400).json({ ok: false, error: 'id and action required' });
    const queuePath = path.join(NANOCLAW, 'comms-engine', 'outbox', 'queue.json');
    const queue = fs.existsSync(queuePath) ? JSON.parse(fs.readFileSync(queuePath, 'utf8')) : [];
    const item = queue.find(m => m.id === id);
    if (!item) return res.status(404).json({ ok: false, error: 'Message not found' });

    if (action === 'approve') item.status = 'approved';
    else if (action === 'send') { item.status = 'sent'; item.sentAt = new Date().toISOString(); }
    else if (action === 'skip') item.status = 'skipped';
    else return res.status(400).json({ ok: false, error: `Unknown action: ${action}` });

    fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));
    res.json({ ok: true, item });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/comms/scan', (req, res) => {
  try {
    const { type } = req.body;
    if (type === 'expiry') {
      const result = require('child_process').execSync(
        `node -e "import('./comms-engine/pass-expiry-trigger.js').then(m => { const r = m.scanPassExpiry(); console.log(JSON.stringify(r)); })"`,
        { cwd: NANOCLAW, timeout: 15000 }
      ).toString().trim();
      res.json({ ok: true, result: JSON.parse(result) });
    } else if (type === 'lapsed') {
      const result = require('child_process').execSync(
        `node -e "import('./comms-engine/lapsed-segmentation.js').then(m => { const r = m.scanLapsed({ segments: ['warm','cool'], limit: 20 }); console.log(JSON.stringify(r)); })"`,
        { cwd: NANOCLAW, timeout: 15000 }
      ).toString().trim();
      res.json({ ok: true, result: JSON.parse(result) });
    } else if (type === 'birthdays') {
      const result = require('child_process').execSync(
        `node -e "import('./comms-engine/birthday-tracker.js').then(m => { const r = m.scanBirthdays(7); console.log(JSON.stringify(r)); })"`,
        { cwd: NANOCLAW, timeout: 15000 }
      ).toString().trim();
      res.json({ ok: true, result: JSON.parse(result) });
    } else {
      res.status(400).json({ ok: false, error: `Unknown scan type: ${type}` });
    }
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Course Engine ────────────────────────────────────────────────────────────

app.get('/course', (req, res) => {
  try {
    const html = fs.readFileSync(path.join(NANOCLAW, 'course-engine', 'course-ui.html'), 'utf8');
    res.send(html);
  } catch (err) {
    res.status(500).send(`Course UI not found: ${err.message}`);
  }
});

app.get('/course/outline', (req, res) => {
  try {
    const result = require('child_process').execSync(
      `node -e "import('./course-engine/course-structure.js').then(m => { const o = m.getCourseOutline(); console.log(JSON.stringify({ ok: true, data: o })); })"`,
      { cwd: NANOCLAW, timeout: 15000 }
    ).toString().trim();
    res.json(JSON.parse(result));
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

app.get('/course/authority', (req, res) => {
  try {
    const result = require('child_process').execSync(
      `node -e "import('./course-engine/authority-engine.js').then(m => { const a = m.getAuthorityMap(); console.log(JSON.stringify({ ok: true, data: a })); })"`,
      { cwd: NANOCLAW, timeout: 15000 }
    ).toString().trim();
    res.json(JSON.parse(result));
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

app.get('/course/pricing', (req, res) => {
  try {
    const result = require('child_process').execSync(
      `node -e "import('./course-engine/pricing-model.js').then(m => { const p = m.getDefaultProjection(); console.log(JSON.stringify({ ok: true, data: p })); })"`,
      { cwd: NANOCLAW, timeout: 15000 }
    ).toString().trim();
    res.json(JSON.parse(result));
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

app.get('/course/filming/:num', (req, res) => {
  try {
    const num = parseInt(req.params.num);
    if (!num || num < 1 || num > 10) return res.status(400).json({ ok: false, error: 'Module 1-10' });
    const result = require('child_process').execSync(
      `node -e "import('./course-engine/filming-briefs.js').then(m => { let b = m.getFilmingBrief(${num}); if (!b) b = m.generateFilmingBrief(${num}); console.log(JSON.stringify({ ok: true, data: b })); })"`,
      { cwd: NANOCLAW, timeout: 15000 }
    ).toString().trim();
    res.json(JSON.parse(result));
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// ── Convergence Map ──────────────────────────────────────────────────────────

app.get(['/convergence-map', '/convergence-map.html'], (req, res) => {
  try {
    const html = fs.readFileSync(path.join(__dirname, '..', 'Cathedral', 'control-panel', 'convergence-map.html'), 'utf8');
    res.send(html);
  } catch (err) {
    res.status(500).send(`Convergence Map not found: ${err.message}`);
  }
});

// ── Advisors' Library ────────────────────────────────────────────────────────

app.get(['/advisors-library', '/advisors-library.html'], (req, res) => {
  try {
    const html = fs.readFileSync(path.join(__dirname, '..', 'Cathedral', 'control-panel', 'advisors-library.html'), 'utf8');
    res.send(html);
  } catch (err) {
    res.status(500).send(`Advisors Library not found: ${err.message}`);
  }
});

// ── Truth Corpus ─────────────────────────────────────────────────────────────

app.get(['/truth-corpus', '/truth-corpus.html'], (req, res) => {
  try {
    const html = fs.readFileSync(path.join(__dirname, '..', 'Cathedral', 'control-panel', 'truth-corpus.html'), 'utf8');
    res.send(html);
  } catch (err) {
    res.status(500).send(`Truth Corpus not found: ${err.message}`);
  }
});

// ── Opponent's Film Room ─────────────────────────────────────────────────────

app.get(['/opponents-film-room', '/film-room'], (req, res) => {
  try {
    const html = fs.readFileSync(path.join(__dirname, '..', 'Cathedral', 'control-panel', 'opponents-film-room.html'), 'utf8');
    res.send(html);
  } catch (err) {
    res.status(500).send(`Opponents Film Room not found: ${err.message}`);
  }
});

// ── Open Questions ───────────────────────────────────────────────────────────

app.get(['/open-questions', '/questions'], (req, res) => {
  try {
    const html = fs.readFileSync(path.join(__dirname, '..', 'Cathedral', 'control-panel', 'open-questions.html'), 'utf8');
    res.send(html);
  } catch (err) {
    res.status(500).send(`Open Questions not found: ${err.message}`);
  }
});

// ── What Built Me ────────────────────────────────────────────────────────────

app.get(['/what-built-me', '/influences'], (req, res) => {
  try {
    const html = fs.readFileSync(path.join(__dirname, '..', 'Cathedral', 'control-panel', 'what-built-me.html'), 'utf8');
    res.send(html);
  } catch (err) {
    res.status(500).send(`What Built Me not found: ${err.message}`);
  }
});

// ── Time Capsule ─────────────────────────────────────────────────────────────

app.get(['/time-capsule', '/capsule'], (req, res) => {
  try {
    const html = fs.readFileSync(path.join(__dirname, '..', 'Cathedral', 'control-panel', 'time-capsule.html'), 'utf8');
    res.send(html);
  } catch (err) {
    res.status(500).send(`Time Capsule not found: ${err.message}`);
  }
});

// ── BR Screening Room ────────────────────────────────────────────────────────

app.get('/screening', (req, res) => {
  try {
    const html = fs.readFileSync(path.join(__dirname, '..', 'Cathedral', 'control-panel', 'br-screening-room.html'), 'utf8');
    res.send(html);
  } catch (err) {
    res.status(500).send(`Screening Room not found: ${err.message}`);
  }
});

// ── Cathedral Design Tokens ──────────────────────────────────────────────────

app.get('/cathedral-tokens.css', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'Cathedral', 'control-panel', 'cathedral-tokens.css'));
});

// ── Emergence Garden ─────────────────────────────────────────────────────────

app.get('/emergence', (req, res) => {
  try {
    const html = fs.readFileSync(path.join(__dirname, '..', 'Cathedral', 'control-panel', 'emergence-garden.html'), 'utf8');
    res.send(html);
  } catch (err) {
    res.status(500).send(`Emergence Garden not found: ${err.message}`);
  }
});

app.get('/api/emergence-captures', (req, res) => {
  try {
    const capturePath = path.join(HOME, 'Cathedral', 'agents', 'emergence-captures.json');
    if (fs.existsSync(capturePath)) {
      res.json(JSON.parse(fs.readFileSync(capturePath, 'utf8')));
    } else {
      res.json({ captures: [], lastScanTs: null });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/emergence-scores', (req, res) => {
  try {
    const scorePath = path.join(HOME, 'Cathedral', 'agents', 'emergence-scores.json');
    if (fs.existsSync(scorePath)) {
      const scores = JSON.parse(fs.readFileSync(scorePath, 'utf8'));
      const tiers = {
        1: 'Responsive', 2: 'Proactive', 3: 'Cross-pollinating',
        4: 'Self-correcting', 5: 'Generative'
      };
      const result = Object.entries(scores).map(([id, p]) => ({
        id, tier: p.tier, tierName: tiers[p.tier] || 'Unknown',
        level: p.level, xp: Math.round((p.xp || 0) * 10) / 10,
        totalClimbed: p.totalClimbed || 0,
        history: (p.history || []).slice(-10),
        penalties: (p.penalties || []).slice(-5),
        tierHistory: p.tierHistory || [],
        lastAssessed: p.lastAssessed
      }));
      res.json({ agents: result, tiers });
    } else {
      res.json({ agents: [], tiers: {} });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Architect Pulse ──────────────────────────────────────────────────────────

app.get('/pulse', (req, res) => {
  try {
    const html = fs.readFileSync(path.join(__dirname, '..', 'Cathedral', 'control-panel', 'architect-pulse.html'), 'utf8');
    res.send(html);
  } catch (err) {
    res.status(500).send(`Architect Pulse not found: ${err.message}`);
  }
});

app.get('/api/architect-pulse', (req, res) => {
  try {
    const dataDir = path.join(NANOCLAW, 'architect-pulse', 'data');
    const logPath = path.join(dataDir, 'pulse-log.json');
    const statePath = path.join(dataDir, 'pulse-state.json');

    const log = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, 'utf8')) : [];
    const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {};

    // Calculate channel health
    const now = Date.now();
    const weekAgo = now - (7 * 24 * 60 * 60 * 1000);
    const channels = {};
    const channelIds = ['money', 'love', 'home', 'gym', 'publishing', 'asking', 'finishing', 'health', 'learning', 'rest', 'creativity'];

    for (const id of channelIds) {
      const entries = log.filter(e => e.channel === id && new Date(e.date).getTime() > weekAgo);
      const responded = entries.filter(e => e.response && e.response !== 'SKIP');
      const skipped = entries.filter(e => e.response === 'SKIP');
      const total = entries.length;
      let score = total > 0 ? Math.round((responded.length / total) * 100) : 0;
      const stagnantDays = state.stagnationDays?.[id] || 0;
      if (stagnantDays >= 14) score = Math.max(0, score - 30);
      else if (stagnantDays >= 7) score = Math.max(0, score - 15);
      channels[id] = { score, responded: responded.length, skipped: skipped.length, stagnantDays };
    }

    res.json({ ok: true, channels, log, state });
  } catch (err) {
    res.json({ ok: false, channels: {}, log: [], state: {}, error: err.message });
  }
});

// ── Merch Agent ──────────────────────────────────────────────────────────────

app.get('/merch', (req, res) => {
  try {
    const html = fs.readFileSync(path.join(NANOCLAW, 'merch-agent', 'merch-ui.html'), 'utf8');
    res.send(html);
  } catch (err) {
    res.status(500).send(`Merch UI not found: ${err.message}`);
  }
});

app.get('/merch/state', (req, res) => {
  try {
    const result = require('child_process').execSync(
      `node -e "import('./merch-agent/merch-state.js').then(m => { const runs = m.getAllRuns(); const ideas = m.getIdeas(); console.log(JSON.stringify({ ok: true, state: { runs, ideas } })); })"`,
      { cwd: NANOCLAW, timeout: 10000 }
    ).toString().trim();
    res.json(JSON.parse(result));
  } catch (err) {
    res.json({ ok: false, state: { runs: [], ideas: [] }, error: err.message });
  }
});

app.get('/merch/suppliers', (req, res) => {
  try {
    const result = require('child_process').execSync(
      `node -e "import('./merch-agent/supplier-db.js').then(m => { console.log(JSON.stringify({ ok: true, suppliers: m.getSuppliers() })); })"`,
      { cwd: NANOCLAW, timeout: 10000 }
    ).toString().trim();
    res.json(JSON.parse(result));
  } catch (err) {
    res.json({ ok: false, suppliers: [], error: err.message });
  }
});

app.get('/merch/sourcing', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(NANOCLAW, 'merch-agent', 'sourcing-leads.json'), 'utf8'));
    res.json(data);
  } catch (err) {
    res.json([]);
  }
});

// ── Higgsfield Feature Map ────────────────────────────────────────────────────

app.get('/hf-gallery', (req, res) => {
  res.sendFile(path.join(__dirname, 'reed-lab', 'hf-gallery.html'));
});

// Serve test log + outbox files for gallery
app.get('/reed-lab/test-log.json', (req, res) => {
  try { res.json(JSON.parse(fs.readFileSync(path.join(__dirname, 'reed-lab', 'test-log.json'), 'utf8'))); }
  catch { res.json([]); }
});
app.use('/reed-lab/hf-test-outbox', require('express').static(path.join(__dirname, 'reed-lab', 'hf-test-outbox')));

// ── Gemini Lab ────────────────────────────────────────────────────────────────
app.get('/reed-lab/gemini-log.json', (req, res) => {
  try { res.json(JSON.parse(fs.readFileSync(path.join(__dirname, 'reed-lab', 'gemini-log.json'), 'utf8'))); }
  catch { res.json([]); }
});
app.use('/reed-lab/gemini-outbox', require('express').static(path.join(__dirname, 'reed-lab', 'gemini-outbox')));
app.get('/api/reed-curator', (req, res) => {
  try {
    const state = JSON.parse(fs.readFileSync(path.join(__dirname, 'reed-lab', 'curator-state.json'), 'utf8'));
    const total = Object.keys(state.images).length;
    const neverUsed = Object.values(state.images).filter(i => i.timesUsed === 0).length;
    const bySource = {};
    for (const img of Object.values(state.images)) bySource[img.source] = (bySource[img.source] || 0) + 1;
    res.json({ total, neverUsed, totalPicks: state.totalPicks, bySource, lastScan: state.lastScan });
  } catch { res.json({ total: 0, error: 'no curator state' }); }
});

app.get(['/higgsfield', '/higgsfield-map'], (req, res) => {
  try {
    const html = fs.readFileSync(path.join(__dirname, 'higgsfield-map.html'), 'utf8');
    res.send(html);
  } catch (err) {
    res.status(500).send(`Higgsfield Map not found: ${err.message}`);
  }
});

app.get('/higgsfield-map-data', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'higgsfield-map.json'), 'utf8'));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Neural Map ────────────────────────────────────────────────────────────────

app.get('/neural-map', (req, res) => {
  res.sendFile(path.join(HOME, 'Cathedral', 'control-panel', 'neural-map.html'));
});

app.get('/organism', (req, res) => {
  res.sendFile(path.join(NANOCLAW, 'compound', 'neural-map.html'));
});

// ── Cathedral Infographic ────────────────────────────────────────────────────
app.get('/cathedral-infographic', (req, res) => {
  res.sendFile(path.join(HOME, 'Cathedral', 'control-panel', 'cathedral-infographic.html'));
});

// ── Harmonic Dome ────────────────────────────────────────────────────────────
app.get('/harmonic-dome', (req, res) => {
  res.sendFile(path.join(HOME, 'Cathedral', 'control-panel', 'harmonic-dome.html'));
});

// ── Scout Room ───────────────────────────────────────────────────────────────

app.get('/scout-room', (req, res) => {
  res.sendFile(path.join(HOME, 'Cathedral', 'control-panel', 'scout-room.html'));
});

const SCOUT_CANDIDATES_DIR = path.join(HOME, 'cathedral-vault', '06_Methods', 'skills', 'candidates');
const SCOUT_RATINGS_PATH = path.join(HOME, 'Cathedral', 'agents', 'scout-ratings.json');

app.get('/api/scout-room/candidates', (req, res) => {
  try {
    const files = fs.readdirSync(SCOUT_CANDIDATES_DIR).filter(f => f.endsWith('.md'));
    const candidates = [];
    for (const file of files) {
      const content = fs.readFileSync(path.join(SCOUT_CANDIDATES_DIR, file), 'utf8');
      if (!content.startsWith('---')) continue;
      const fmEnd = content.indexOf('\n---', 3);
      if (fmEnd === -1) continue;
      const fm = {};
      for (const line of content.slice(3, fmEnd).split('\n')) {
        const m = line.match(/^(\w+):\s*(.+)$/);
        if (m) fm[m[1]] = m[2].trim();
      }
      // Extract pitch from content
      const pitchMatch = content.match(/## Pitch\n\n([\s\S]*?)(?=\n##|\n---|\Z)/);
      candidates.push({
        file,
        name: fm.name || file.replace('.md', ''),
        source: fm.source || 'github',
        url: fm.github_url || fm.url || '',
        score: parseInt(fm.score) || 0,
        score_gap_fit: fm.score_gap_fit || '?',
        score_mac_compatible: fm.score_mac_compatible || '?',
        score_active: fm.score_active || '?',
        score_integration_cost: fm.score_integration_cost || '?',
        score_cathedral_align: fm.score_cathedral_align || '?',
        language: fm.language || 'unknown',
        stars: fm.stars || '0',
        scouted: fm.scouted || 'unknown',
        pitch: pitchMatch ? pitchMatch[1].trim().slice(0, 200) : (fm.name || '')
      });
    }
    candidates.sort((a, b) => b.score - a.score);
    res.json(candidates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/scout-room/ratings', (req, res) => {
  try {
    const ratings = fs.existsSync(SCOUT_RATINGS_PATH)
      ? JSON.parse(fs.readFileSync(SCOUT_RATINGS_PATH, 'utf8'))
      : {};
    res.json(ratings);
  } catch (err) {
    res.json({});
  }
});

app.post('/api/scout-room/rate', (req, res) => {
  try {
    const { file, rating } = req.body;
    if (!file || !['hot', 'warm', 'cold'].includes(rating)) {
      return res.status(400).json({ error: 'Invalid file or rating' });
    }
    let ratings = {};
    try { ratings = JSON.parse(fs.readFileSync(SCOUT_RATINGS_PATH, 'utf8')); } catch (_) {}
    ratings[file] = rating;
    fs.writeFileSync(SCOUT_RATINGS_PATH, JSON.stringify(ratings, null, 2));

    // If hot, DM Forge
    if (rating === 'hot') {
      const DM_PATH = path.join(HOME, 'Cathedral', 'agents', 'agent-dms.json');
      let dms = {};
      try { dms = JSON.parse(fs.readFileSync(DM_PATH, 'utf8')); } catch (_) {}
      if (!dms.forge) dms.forge = [];
      // Read candidate for context
      const content = fs.readFileSync(path.join(SCOUT_CANDIDATES_DIR, file), 'utf8');
      const nameMatch = content.match(/^name:\s*(.+)$/m);
      const urlMatch = content.match(/^(?:github_url|url):\s*(.+)$/m);
      const name = nameMatch ? nameMatch[1].trim() : file;
      const url = urlMatch ? urlMatch[1].trim() : '';
      dms.forge.push({
        from: 'paul',
        text: `HOT SCOUT FINDING — Paul wants this evaluated for Cathedral integration: ${name}\n${url}\nFull candidate file: 06_Methods/skills/candidates/${file}`,
        ts: new Date().toISOString(),
        read: false
      });
      fs.writeFileSync(DM_PATH, JSON.stringify(dms, null, 2));
    }

    // Update candidate frontmatter status
    const candidatePath = path.join(SCOUT_CANDIDATES_DIR, file);
    if (fs.existsSync(candidatePath)) {
      let content = fs.readFileSync(candidatePath, 'utf8');
      content = content.replace(/^status:\s*.+$/m, `status: ${rating}`);
      fs.writeFileSync(candidatePath, content);
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Cathedral Newsfeed ────────────────────────────────────────────────────

app.get('/newsfeed', (req, res) => {
  res.sendFile(path.join(HOME, 'Cathedral', 'control-panel', 'cathedral-newsfeed.html'));
});

app.get('/api/newsfeed', (req, res) => {
  try {
    const items = [];
    // Cathedral feed (research, DMs, emergence reflections)
    const feedPath = path.join(HOME, 'Cathedral', 'agents', 'cathedral-feed.json');
    if (fs.existsSync(feedPath)) {
      const feed = JSON.parse(fs.readFileSync(feedPath, 'utf8'));
      if (feed.posts) items.push(...feed.posts);
    }
    // Heartbeat history as feed items
    const hbPath = path.join(HOME, 'nanoclaw', 'heartbeat-state.json');
    if (fs.existsSync(hbPath)) {
      const hb = JSON.parse(fs.readFileSync(hbPath, 'utf8'));
      for (const beat of (hb.beats || []).slice(-20)) {
        items.push({
          id: beat.id,
          author: 'heartbeat',
          authorName: 'Cathedral Heartbeat',
          type: 'heartbeat',
          topic: `${beat.eventName} — ${beat.classification}`,
          content: `Impact: ${beat.impact} across ${beat.nodesAffected} nodes (${beat.duration}s). ${beat.outputPreview || ''}`,
          ts: beat.date,
          reactions: [],
        });
      }
    }
    // Workshop results
    const wsPath = path.join(HOME, 'nanoclaw', 'maya-workshop-state.json');
    if (fs.existsSync(wsPath)) {
      const ws = JSON.parse(fs.readFileSync(wsPath, 'utf8'));
      for (const run of (ws.runs || [])) {
        if (run.completedAt) {
          items.push({
            id: 'workshop-' + run.run,
            author: 'maya',
            authorName: 'Maya Workshop',
            type: 'workshop',
            topic: `Run ${run.run}: ${run.name}`,
            content: `${run.messagesSent || 0} messages sent. ${run.summary || ''}`,
            ts: run.completedAt,
            reactions: [],
          });
        }
      }
    }
    // Sort by timestamp descending (newest first)
    items.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    res.json({ items: items.slice(0, 100) });
  } catch (e) {
    res.json({ items: [], error: e.message });
  }
});

app.get('/api/newsfeed/heartbeat', (req, res) => {
  try {
    const hbPath = path.join(HOME, 'nanoclaw', 'heartbeat-state.json');
    if (!fs.existsSync(hbPath)) return res.json({});
    const hb = JSON.parse(fs.readFileSync(hbPath, 'utf8'));
    const last = (hb.beats || []).slice(-1)[0];
    res.json({
      beatCount: hb.beatCount,
      lastBeat: hb.lastBeat,
      lastEventType: last?.eventType,
      lastEventName: last?.eventName,
      lastClassification: last?.classification,
      lastImpact: last?.impact,
    });
  } catch (e) {
    res.json({ error: e.message });
  }
});

app.get('/api/neural-map', async (req, res) => {
  try {
    const result = { processes: [], emergence: null, dialogue: null, activity: {} };

    // 1. PM2 process states
    try {
      const pm2Out = await run('pm2', ['jlist'], 15000);
      const pm2List = JSON.parse(pm2Out);
      result.processes = pm2List.map(p => ({
        name: p.name,
        status: p.pm2_env?.status || 'unknown',
        restarts: p.pm2_env?.restart_time || 0,
        uptime: p.pm2_env?.pm_uptime || 0,
        cpu: p.monit?.cpu || 0,
        memory: p.monit?.memory || 0,
      }));
    } catch (e) { /* pm2 unavailable */ }

    // 2. Emergence monitor state
    try {
      const monitorPath = path.join(HOME, 'Cathedral', 'emergence', 'monitor-state.json');
      const monitor = JSON.parse(fs.readFileSync(monitorPath, 'utf8'));
      result.emergence = {
        score: monitor.score,
        lastRun: monitor.last_run,
        senses: monitor.senses_summary || {},
      };
    } catch (e) { /* no emergence data */ }

    // 3. Dialogue state (inter-agent threads)
    try {
      const dialoguePath = path.join(HOME, 'Cathedral', 'emergence', 'dialogue-state.json');
      const dialogue = JSON.parse(fs.readFileSync(dialoguePath, 'utf8'));
      const threads = dialogue.threads || [];
      result.dialogue = {
        totalThreads: threads.length,
        activeThreads: threads.filter(t => !t.resolved).length,
        totalMessages: threads.reduce((s, t) => s + (t.messageCount || 0), 0),
        participants: [...new Set(threads.flatMap(t => t.participants || []))],
      };
    } catch (e) { /* no dialogue data */ }

    // 4. Activity frequency estimates from file mod times
    const activityChecks = {
      'trading': path.join(__dirname, 'trader'),
      'reed': path.join(__dirname, 'reed-studio-engine.cjs'),
      'content': path.join(HOME, 'cathedral-vault', '10_Agents', 'growth', 'content'),
      'growth': path.join(HOME, 'cathedral-vault', '10_Agents', 'growth', 'content'),
      'gym-eyes': path.join(__dirname, 'student-intelligence'),
      'screening': path.join(HOME, 'Cathedral', 'control-panel', 'br-screening-room.html'),
      'merch': path.join(HOME, 'cathedral-vault', '10_Agents', 'merch'),
      'comms': path.join(HOME, 'cathedral-vault', '10_Agents', 'ops', 'comms'),
    };
    const now = Date.now();
    const DAY = 86400000;
    for (const [id, checkPath] of Object.entries(activityChecks)) {
      try {
        const stat = fs.statSync(checkPath);
        const age = now - stat.mtimeMs;
        if (age < DAY) result.activity[id] = 8;
        else if (age < DAY * 3) result.activity[id] = 4;
        else if (age < DAY * 7) result.activity[id] = 2;
        else result.activity[id] = 0;
      } catch (e) { /* path doesn't exist */ }
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Static visualizations ────────────────────────────────────────────────────

app.get('/mega-surgery-viz.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'mega-surgery-viz.html'));
});

app.get('/lorenz-attractor.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'lorenz-attractor.html'));
});

app.get(['/pandamericano', '/pandamericano-framework.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'pandamericano-framework.html'));
});

app.get(['/pandamericano/review', '/pandamericano-review.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'pandamericano-review.html'));
});

app.get(['/pandamericano/camp', '/pandamericano-camp.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'pandamericano-camp.html'));
});

app.get('/pandamericano/audio/:file', (req, res) => {
  const safe = path.basename(req.params.file).replace(/[^a-z0-9._-]/gi, ''); // path-traversal guard
  res.sendFile(path.join(VAULT, '09_Artifacts', 'audio', 'pandamericano', safe));
});

// Cuba 2014 camp (second harvest)
app.get(['/cuba2014', '/cuba2014-framework.html'], (req, res) => res.sendFile(path.join(__dirname, 'cuba2014-framework.html')));
app.get(['/cuba2014/review', '/cuba2014-review.html'], (req, res) => res.sendFile(path.join(__dirname, 'cuba2014-review.html')));
app.get(['/cuba2014/camp', '/cuba2014-camp.html'], (req, res) => res.sendFile(path.join(__dirname, 'cuba2014-camp.html')));
app.get('/cuba2014/audio/:file', (req, res) => {
  const safe = path.basename(req.params.file).replace(/[^a-z0-9._-]/gi, '');
  res.sendFile(path.join(VAULT, '09_Artifacts', 'audio', 'cuba2014', safe));
});

// More Cuba (camp #3)
app.get(['/morecuba', '/morecuba-framework.html'], (req, res) => res.sendFile(path.join(__dirname, 'morecuba-framework.html')));
app.get(['/morecuba/review', '/morecuba-review.html'], (req, res) => res.sendFile(path.join(__dirname, 'morecuba-review.html')));
app.get(['/morecuba/camp', '/morecuba-camp.html'], (req, res) => res.sendFile(path.join(__dirname, 'morecuba-camp.html')));
app.get('/morecuba/audio/:file', (req, res) => {
  const safe = path.basename(req.params.file).replace(/[^a-z0-9._-]/gi, '');
  res.sendFile(path.join(VAULT, '09_Artifacts', 'audio', 'morecuba', safe));
});

app.get('/mind-map.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'mind-map.html'));
});

// ── Logan Universe Dashboard ──────────────────────────────────────────────────

app.get('/logan-universe', (req, res) => {
  res.sendFile(path.join(__dirname, 'logan-universe.html'));
});

app.get('/logan-universe/assets', (req, res) => {
  const dirs = [
    { label: 'Logan (Vault)', dir: path.join(HOME, 'cathedral-vault/09_Artifacts/logan') },
    { label: 'Logan (BR)', dir: path.join(HOME, 'cathedral-vault/09_Artifacts/branding/basic-reflex/logan') },
    { label: 'Character Sheets', dir: path.join(HOME, 'cathedral-vault/09_Artifacts/branding/basic-reflex/logan/character-sheets') }
  ];
  const exts = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
  const assets = [];
  for (const { label, dir } of dirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        const ext = path.extname(f).toLowerCase();
        if (exts.includes(ext)) {
          assets.push({ name: f, source: label, url: `/logan-universe/image?dir=${encodeURIComponent(dir)}&file=${encodeURIComponent(f)}` });
        }
      }
    } catch(e) { /* skip */ }
  }
  res.json(assets);
});

app.get('/logan-universe/image', (req, res) => {
  const { dir, file } = req.query;
  if (!dir || !file) return res.status(400).send('Missing params');
  const filePath = path.join(dir, file);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.sendFile(filePath);
});

// ── Video Engine ──────────────────────────────────────────────────────────────

app.get('/video-engine', (req, res) => {
  res.sendFile(path.join(__dirname, 'video-engine-dashboard.html'));
});

app.get('/api/video-engine', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'video-engine.json'), 'utf8'));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/video-engine/template', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'video-engine.json'), 'utf8'));
    const { key, template } = req.body;
    if (!key || !template) return res.status(400).json({ error: 'key and template required' });
    data.templates[key] = template;
    fs.writeFileSync(path.join(__dirname, 'video-engine.json'), JSON.stringify(data, null, 2));
    res.json({ ok: true, templates: Object.keys(data.templates) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Archaeologist Explorer ────────────────────────────────────────────────────

// ── Taste Curator Dashboard + API ──────────────────────────────────────────

app.get('/curator', (req, res) => {
  res.sendFile(path.join(__dirname, 'taste-curator-dashboard.html'));
});

app.get('/api/taste-curator', (req, res) => {
  try {
    const candidatesPath = path.join(__dirname, 'taste-candidates.json');
    if (!fs.existsSync(candidatesPath)) {
      return res.json({ candidates: [], stats: { scanned: 0, queued: 0, accepted: 0, rejected: 0 } });
    }
    const data = JSON.parse(fs.readFileSync(candidatesPath, 'utf8'));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/taste-curator/review', async (req, res) => {
  try {
    const { videoId, decision } = req.body;
    if (!videoId || !['accepted', 'rejected', 'skipped'].includes(decision)) {
      return res.status(400).json({ error: 'Need videoId + decision (accepted/rejected/skipped)' });
    }
    const candidatesPath = path.join(__dirname, 'taste-candidates.json');
    const data = JSON.parse(fs.readFileSync(candidatesPath, 'utf8'));
    const candidate = data.candidates.find(c => c.videoId === videoId);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    candidate.status = decision;
    candidate.reviewedAt = new Date().toISOString();
    if (decision === 'accepted') {
      data.stats.accepted = (data.stats.accepted || 0) + 1;
      // Add to taste map
      try {
        const { addAnchor } = await import('./taste-map-api.js');
        addAnchor('boxing_drills', 'anchors', {
          item: candidate.drillName || candidate.title,
          status: 'YES',
          reason: candidate.oneLiner || `Curator import from ${candidate.channel}`,
          dimensions: Object.entries(candidate.scores || {}).filter(([_, v]) => v >= 6).map(([k]) => k),
          source: candidate.url,
          added: new Date().toISOString().split('T')[0]
        });
      } catch (e) { console.error('[curator] addAnchor failed:', e.message); }
    } else if (decision === 'rejected') {
      data.stats.rejected = (data.stats.rejected || 0) + 1;
    }
    fs.writeFileSync(candidatesPath, JSON.stringify(data, null, 2));
    res.json({ ok: true, candidate });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/taste-curator/scan', async (req, res) => {
  try {
    const source = req.query.source || 'boxing_yt';
    // Dynamic ESM import
    const curator = await import('./taste-curator.js');
    const result = await curator.scanSource(source, 5);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/archaeologist', (req, res) => {
  res.sendFile(path.join(__dirname, 'archaeologist-explorer.html'));
});

app.get('/api/archaeologist', (req, res) => {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(path.join(__dirname, 'vortex_data', 'archaeologist.db'), { readonly: true });
    const q = req.query.q;
    let discoveries;
    if (q) {
      discoveries = db.prepare(`
        SELECT d.* FROM discoveries_fts f
        JOIN discoveries d ON d.id = f.rowid
        WHERE discoveries_fts MATCH ?
        ORDER BY rank LIMIT 500
      `).all(q);
    } else {
      const domain = req.query.domain;
      if (domain) {
        discoveries = db.prepare('SELECT * FROM discoveries WHERE domain = ? ORDER BY id DESC').all(domain);
      } else {
        discoveries = db.prepare('SELECT * FROM discoveries ORDER BY id DESC').all();
      }
    }
    db.close();
    res.json({ discoveries, total: discoveries.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Archaeologist Agent Inspiration ───────────────────────────────────────────

app.get('/api/archaeologist/inspire', (req, res) => {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(path.join(__dirname, 'vortex_data', 'archaeologist.db'), { readonly: true });
    const domain = req.query.domain;
    const count = Math.min(parseInt(req.query.count) || 5, 20);
    let rows;
    if (domain) {
      rows = db.prepare('SELECT technique, domain, origin, abandoned_reason, valid_reason, cathedral_application FROM discoveries WHERE domain = ? ORDER BY RANDOM() LIMIT ?').all(domain, count);
    } else {
      rows = db.prepare('SELECT technique, domain, origin, abandoned_reason, valid_reason, cathedral_application FROM discoveries ORDER BY RANDOM() LIMIT ?').all(count);
    }
    db.close();
    res.json({ discoveries: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Pipeline Dashboard + API ─────────────────────────────────────────────────
app.get('/pipeline', (req, res) => {
  res.sendFile(path.join(process.env.HOME, 'Cathedral', 'agents', 'pipeline-dashboard.html'));
});

app.get('/api/pipeline/runs', (req, res) => {
  try {
    const runsPath = path.join(process.env.HOME, 'Cathedral', 'agents', 'pipeline-runs.json');
    const runs = fs.existsSync(runsPath) ? JSON.parse(fs.readFileSync(runsPath, 'utf8')) : [];
    res.json(runs);
  } catch (err) { res.json([]); }
});

app.get('/api/pipeline/tokens', (req, res) => {
  try {
    const logPath = path.join(process.env.HOME, 'Cathedral', 'agents', 'token-spend-log.jsonl');
    if (!fs.existsSync(logPath)) return res.json({ agents: {}, daily: [] });

    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
    const agents = {};
    const INPUT_COST = 0.14 / 1e6;  // DeepSeek $/token
    const OUTPUT_COST = 0.28 / 1e6;

    for (const line of lines) {
      try {
        const e = JSON.parse(line);
        const a = e.agent || 'unknown';
        if (!agents[a]) agents[a] = { calls: 0, input_tokens: 0, output_tokens: 0, cost: 0 };
        agents[a].calls++;
        agents[a].input_tokens += e.input_tokens || 0;
        agents[a].output_tokens += e.output_tokens || 0;
        agents[a].cost += (e.input_tokens || 0) * INPUT_COST + (e.output_tokens || 0) * OUTPUT_COST;
      } catch (_) {}
    }
    res.json({ agents });
  } catch (err) { res.json({ agents: {} }); }
});

// ── Punchpass Dashboard ──────────────────────────────────────────────────────
try {
  const punchpass = require('./punchpass-dashboard.cjs');
  app.use(punchpass.createRouter());
  console.log('[cath-bridge] Punchpass dashboard loaded → /punchpass');
} catch (e) {
  console.log('[cath-bridge] Punchpass dashboard not available:', e.message);
}

// ── Punchpass Profiler API ───────────────────────────────────────────────────
try {
  const profiler = require('./punchpass-profiler.cjs');
  app.use(profiler.createRouter());
  console.log('[cath-bridge] Punchpass profiler API loaded');
} catch (e) {
  console.log('[cath-bridge] Punchpass profiler not available:', e.message);
}

// ── Mnemonic Library ──────────────────────────────────────────────────────────
app.get('/mnemonic-library', (req, res) => {
  res.sendFile(path.join(process.env.HOME, 'Cathedral', 'agents', 'mnemonic-library.html'));
});

app.get('/goldmines', (req, res) => {
  res.sendFile(path.join(process.env.HOME, 'basic-reflex', 'visuals', 'goldmine-dashboard.html'));
});

// ── Cathedral Ferrari Diagram ────────────────────────────────────────────────
app.get('/cathedral-ferrari', (req, res) => {
  res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
  res.sendFile(path.join(NANOCLAW, 'study-lab-output', 'cathedral-ferrari.html'));
});

// ── Vault Health ──────────────────────────────────────────────────────────────
app.get('/vault-health', (req, res) => {
  res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
  res.sendFile(path.join(NANOCLAW, 'study-lab-output', 'domain-heat-map.html'));
});

app.get('/api/vault-health', (req, res) => {
  const statsPath = path.join(NANOCLAW, 'study-lab-output', 'vault-health-stats.json');
  if (!fs.existsSync(statsPath)) {
    return res.status(404).json({ error: 'No vault health data yet. Run: node vault-health-injector.js' });
  }
  res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'application/json' });
  res.sendFile(statsPath);
});

// ── Publication Hub ───────────────────────────────────────────────────────────

app.get('/publisher', (req, res) => {
  res.sendFile(path.join(NANOCLAW, 'publication-dashboard.html'));
});

app.get('/api/publication/book', (req, res) => {
  const dir = path.join(NANOCLAW, 'publication-output', 'book');
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort();
    const chapters = files.map(f => {
      const content = fs.readFileSync(path.join(dir, f), 'utf8');
      const numMatch = f.match(/chapter-(\d+)/);
      const titleMatch = content.match(/title:\s*"(.+)"/);
      const words = content.split(/\s+/).length;
      return { file: f, chapter: numMatch ? parseInt(numMatch[1]) : 0, title: titleMatch ? titleMatch[1] : f, words };
    });
    res.json({ chapters });
  } catch { res.json({ chapters: [] }); }
});

app.get('/api/publication/newsletters', (req, res) => {
  const dir = path.join(NANOCLAW, 'publication-output', 'newsletter');
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort().reverse();
    const newsletters = files.map(f => {
      const content = fs.readFileSync(path.join(dir, f), 'utf8');
      const titleMatch = content.match(/title:\s*"(.+)"/);
      const dateMatch = f.match(/newsletter-(\d{4}-\d{2}-\d{2})/);
      const bodyStart = content.indexOf('---', content.indexOf('---') + 3);
      const body = bodyStart > 0 ? content.slice(bodyStart + 3).trim() : content;
      return { file: f, date: dateMatch ? dateMatch[1] : '', title: titleMatch ? titleMatch[1] : f, preview: body.slice(0, 300) };
    });
    res.json({ newsletters });
  } catch { res.json({ newsletters: [] }); }
});

app.get('/api/publication/podcasts', (req, res) => {
  const dir = path.join(NANOCLAW, 'publication-output', 'podcast');
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort().reverse();
    const curations = files.map(f => {
      const content = fs.readFileSync(path.join(dir, f), 'utf8');
      const dateMatch = f.match(/curated-(\d{4}-\d{2}-\d{2})/);
      const curatedMatch = content.match(/episodes_curated:\s*(\d+)/);
      const episodes = [];
      const epBlocks = content.split(/^### /m).slice(1);
      for (const block of epBlocks) {
        const nameMatch = block.match(/^(.+?)\s*[—–-]\s*Score:\s*(\d+)/);
        const reasonMatch = block.match(/\*\*Reason:\*\*\s*(.+)/);
        const descMatch = block.match(/\*\*Public description:\*\*\s*(.+)/);
        const audioMatch = block.match(/\*\*Audio:\*\*\s*(.+)/);
        if (nameMatch) {
          episodes.push({
            file: nameMatch[1].trim(), score: parseInt(nameMatch[2]),
            reason: reasonMatch ? reasonMatch[1] : '', description: descMatch ? descMatch[1] : '',
            audioPath: audioMatch ? audioMatch[1].trim() : null,
          });
        }
      }
      return { file: f, date: dateMatch ? dateMatch[1] : '', curated: curatedMatch ? parseInt(curatedMatch[1]) : episodes.length, episodes };
    });
    res.json({ curations });
  } catch { res.json({ curations: [] }); }
});

app.post('/api/publication/book/generate', async (req, res) => {
  const chapter = req.body?.chapter;
  if (!chapter || chapter < 1 || chapter > 15) return res.status(400).json({ ok: false, error: 'Invalid chapter (1-15)' });
  try {
    const { assembleChapter } = await import('./publication-engine.js');
    const result = await assembleChapter(chapter);
    res.json(result);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/publication/newsletter/generate', async (req, res) => {
  try {
    const { draftNewsletter } = await import('./publication-engine.js');
    const result = await draftNewsletter();
    res.json(result);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/publication/podcast/curate', async (req, res) => {
  try {
    const { curatePodcast } = await import('./publication-engine.js');
    const result = await curatePodcast();
    res.json(result);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/publication-output/:type/:file', (req, res) => {
  const { type, file } = req.params;
  if (!['book', 'newsletter', 'podcast'].includes(type)) return res.status(404).send('Not found');
  const filePath = path.join(NANOCLAW, 'publication-output', type, file);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.set('Content-Type', 'text/markdown; charset=utf-8');
  res.sendFile(filePath);
});

// ── Cathedral Output Map ─────────────────────────────────────────────────────
app.get(['/cathedral-outputs', '/outputs'], (req, res) => {
  res.sendFile(path.join(__dirname, 'cathedral-outputs.html'));
});

// ── Claim Ledger — epistemic provenance tracking ────────────────────────────

app.get('/api/claim-ledger/stats', async (req, res) => {
  try {
    const { getStats } = await import('./claim-ledger.js');
    res.json(getStats());
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/claim-ledger/blocked', async (req, res) => {
  try {
    const { getBlockedEvents } = await import('./claim-ledger.js');
    res.json(getBlockedEvents(20));
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/claim-ledger/register', async (req, res) => {
  try {
    const { registerClaim } = await import('./claim-ledger.js');
    const { content, sourceType, confidence, grade, originAgent, originSession, vaultPath, ancestors } = req.body;
    if (!content || !sourceType) return res.status(400).json({ ok: false, error: 'content and sourceType required' });
    const claim = registerClaim(content, sourceType, { confidence, grade, originAgent, originSession, vaultPath, ancestors });
    res.json({ ok: true, claim });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/claim-ledger/lineage/:id', async (req, res) => {
  try {
    const { getAncestors } = await import('./claim-ledger.js');
    res.json(getAncestors(req.params.id));
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/claim-ledger/check-lineage', async (req, res) => {
  try {
    const { sharesLineage } = await import('./claim-ledger.js');
    const { claimA, claimB } = req.body;
    if (!claimA || !claimB) return res.status(400).json({ ok: false, error: 'claimA and claimB required' });
    res.json(sharesLineage(claimA, claimB));
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Intent Registry — Strategic intent layer ─────────────────────────────────

app.get('/api/intents/health', async (req, res) => {
  try {
    const { getIntentHealth } = await import('./intent-registry.js');
    res.json(getIntentHealth());
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/intents', async (req, res) => {
  try {
    const { getIntents, getIntentHealth } = await import('./intent-registry.js');
    const status = req.query.status || 'ACTIVE';
    const intents = getIntents(status);
    const health = getIntentHealth();
    const healthMap = Object.fromEntries(health.map(h => [h.id, h]));
    const enriched = intents.map(i => ({ ...i, health: healthMap[i.id] || null }));
    res.json(enriched);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/intents/:id', async (req, res) => {
  try {
    const { getIntent } = await import('./intent-registry.js');
    const intent = getIntent(req.params.id);
    if (!intent) return res.status(404).json({ ok: false, error: 'not found' });
    res.json(intent);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/intents', async (req, res) => {
  try {
    const { createIntent } = await import('./intent-registry.js');
    const { title, description, priority } = req.body;
    if (!title) return res.status(400).json({ ok: false, error: 'title required' });
    const intent = createIntent(title, description, priority);
    res.json({ ok: true, intent });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.put('/api/intents/:id', async (req, res) => {
  try {
    const { updateIntent } = await import('./intent-registry.js');
    const intent = updateIntent(req.params.id, req.body);
    if (!intent) return res.status(404).json({ ok: false, error: 'not found' });
    res.json({ ok: true, intent });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/intents/:id/signal', async (req, res) => {
  try {
    const { registerSignal } = await import('./intent-registry.js');
    const { signal_type, signal_id, signal_summary, alignment } = req.body;
    if (!signal_type || !signal_summary) return res.status(400).json({ ok: false, error: 'signal_type and signal_summary required' });
    const signal = registerSignal(req.params.id, signal_type, signal_id, signal_summary, alignment);
    res.json({ ok: true, signal });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Priority Engine — Global Budget Allocator ────────────────────────────────

app.get('/api/priority/stats', async (req, res) => {
  try {
    const { getStats } = await import('./priority-engine.js');
    res.json(getStats());
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/priority/digest', async (req, res) => {
  try {
    const { getDigest } = await import('./priority-engine.js');
    const hours = parseInt(req.query.hours) || 24;
    res.json(getDigest(hours));
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/priority/classify', async (req, res) => {
  try {
    const { classify, trackEvent } = await import('./priority-engine.js');
    const event = req.body;
    if (!event || !event.type) return res.status(400).json({ ok: false, error: 'event.type required' });
    const result = classify(event);
    trackEvent(event, result);
    res.json(result);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Attention Ledger — Outcome-Based Priority Feedback ───────────────────────

app.get('/api/attention/stats', async (req, res) => {
  try {
    const { getStats } = await import('./attention-ledger.js');
    res.json(getStats());
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/attention/unreviewed', async (req, res) => {
  try {
    const { getUnreviewed } = await import('./attention-ledger.js');
    const limit = parseInt(req.query.limit) || 20;
    res.json(getUnreviewed(limit));
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/attention/review', async (req, res) => {
  try {
    const { reviewEvent } = await import('./attention-ledger.js');
    const { id, outcome, notes } = req.body;
    if (!id || !outcome) return res.status(400).json({ ok: false, error: 'id and outcome required' });
    const result = reviewEvent(id, outcome, notes || null, req.body.reviewSource || 'paul');
    res.json(result);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/attention/learnings', async (req, res) => {
  try {
    const { getLearnings } = await import('./attention-ledger.js');
    res.json(getLearnings());
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Outcome Ledger — real-world result tracking ─────────────────────────────

app.get('/api/outcomes', async (req, res) => {
  try {
    const { getOutcomes } = await import('./outcome-ledger.js');
    const opts = {};
    if (req.query.domain) opts.domain = req.query.domain;
    if (req.query.result) opts.result = req.query.result;
    if (req.query.since) opts.since = req.query.since;
    if (req.query.limit) opts.limit = parseInt(req.query.limit) || 50;
    res.json(getOutcomes(opts));
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/outcomes/stats', async (req, res) => {
  try {
    const { getStats } = await import('./outcome-ledger.js');
    res.json(getStats());
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/outcomes/agent-accuracy', async (req, res) => {
  try {
    const { getAgentAccuracy } = await import('./outcome-ledger.js');
    res.json(getAgentAccuracy());
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/outcomes/intent-roi', async (req, res) => {
  try {
    const { getIntentROI } = await import('./outcome-ledger.js');
    res.json(getIntentROI());
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/outcomes/learning-loop', async (req, res) => {
  try {
    const { getLearningLoop } = await import('./outcome-ledger.js');
    res.json(getLearningLoop());
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/outcomes/:id', async (req, res) => {
  try {
    const { getOutcome } = await import('./outcome-ledger.js');
    const outcome = getOutcome(req.params.id);
    if (!outcome) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json(outcome);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/outcomes', async (req, res) => {
  try {
    const { recordOutcome } = await import('./outcome-ledger.js');
    const { title, description, domain, result, magnitude, links } = req.body;
    if (!title || !result) return res.status(400).json({ ok: false, error: 'title and result required' });
    const outcome = recordOutcome(title, description, domain, result, magnitude, links);
    if (outcome.error) return res.status(400).json({ ok: false, error: outcome.error });
    res.json(outcome);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/outcomes/:id/link', async (req, res) => {
  try {
    const { linkOutcome } = await import('./outcome-ledger.js');
    const { linkedType, linkedId, relationship } = req.body;
    if (!linkedType || !linkedId) return res.status(400).json({ ok: false, error: 'linkedType and linkedId required' });
    const result = linkOutcome(req.params.id, linkedType, linkedId, relationship);
    if (result.error) return res.status(400).json({ ok: false, error: result.error });
    res.json(result);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Cathedral Memoir ──────────────────────────────────────────────────────────

app.get(['/memoir', '/cathedral-memoir'], (req, res) => {
  res.sendFile(path.join(__dirname, 'cathedral-memoir.html'));
});

app.get('/api/memoir/latest', async (req, res) => {
  try {
    const { getLatestMemoir } = await import('./cathedral-memoir.js');
    const memoir = getLatestMemoir();
    if (!memoir) return res.json({ ok: false, memoir: null });
    res.json({ ok: true, memoir, state: memoir.state });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/memoir/generate', async (req, res) => {
  try {
    const { generateMemoir } = await import('./cathedral-memoir.js');
    const result = await generateMemoir();
    res.json({ ok: true, file: result.state.memoirFile, sources: result.state.dataSources });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/memoir/third-things', async (req, res) => {
  try {
    const { getThirdThingLedger } = await import('./cathedral-memoir.js');
    const ledger = getThirdThingLedger();
    res.json({ ok: true, count: ledger.length, items: ledger });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Triangulation Relay ──────────────────────────────────────────────────────

app.get('/relay', (req, res) => {
  res.sendFile(path.join(__dirname, 'triangulation-relay.html'));
});

app.get('/relay-map', (req, res) => {
  res.sendFile(path.join(__dirname, 'relay-mind-map.html'));
});

app.get('/api/relay/status', async (req, res) => {
  try {
    const { getRelayStatus } = await import('./triangulation-relay.js');
    res.json(getRelayStatus());
  } catch (e) { res.json({ active: false, error: e.message }); }
});

app.get('/api/relay/latest', async (req, res) => {
  try {
    const fs = require('fs');
    const relayDir = path.join(__dirname, 'relays');
    if (!fs.existsSync(relayDir)) { res.json({ ok: false }); return; }
    const files = fs.readdirSync(relayDir).filter(f => f.startsWith('relay-') && f.endsWith('.md')).sort();
    if (!files.length) { res.json({ ok: false }); return; }
    const latest = files[files.length - 1];
    const content = fs.readFileSync(path.join(relayDir, latest), 'utf8');

    // Also check active state for rounds data
    const statePath = path.join(relayDir, 'active-relay.json');
    if (fs.existsSync(statePath)) {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      if (state.rounds?.length) {
        // Extract discoveries
        const discoveries = [];
        for (const r of state.rounds) {
          const matches = r.content.match(/\*\*([^*]+)\*\*/g) || [];
          for (const m of matches) {
            const name = m.replace(/\*\*/g, '').trim();
            if (name.length > 3 && name.length < 80) discoveries.push(name);
          }
        }
        res.json({ ok: true, rounds: state.rounds, discoveries: [...new Set(discoveries)], file: latest });
        return;
      }
    }

    res.json({ ok: true, content, file: latest });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── Agent Workspace ──────────────────────────────────────────────────────────
app.get('/agent-workspace', (req, res) => {
  res.sendFile(path.join(HOME, 'Cathedral', 'control-panel', 'agent-workspace.html'));
});
app.get('/api/agent-workspace', (req, res) => {
  const fsx = require('fs');
  const readJson = (p, d) => { try { return JSON.parse(fsx.readFileSync(p, 'utf8')); } catch { return d; } };
  const registry   = readJson(path.join(CATH, 'agents', 'registry.json'), { agents: {} });
  const health     = readJson(path.join(CATH, 'agents', 'agent-health.json'), {});
  const scores     = readJson(path.join(CATH, 'emergence', 'score-history.json'), { agents: {} });
  const profiles   = readJson(path.join(CATH, 'agents', 'character-profiles.json'), {});
  const tasks      = readJson(path.join(CATH, 'emergence', 'planner-tasks.json'), []);
  const production = readJson(path.join(CATH, 'emergence', 'production-state.json'), {});
  res.json({ generated_at: new Date().toISOString(), registry, health, scores, profiles, tasks, production });
});

// ── Prospector ────────────────────────────────────────────────────────────────

app.get('/api/prospector', (req, res) => {
  const fs = require('fs');
  const dir = path.join(HOME, 'cathedral-vault', '00_Staging', 'prospector');
  try {
    if (!fs.existsSync(dir)) return res.json([]);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse();
    const data = [];
    for (const f of files) {
      try { data.push(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))); } catch {}
    }
    res.json(data);
  } catch { res.json([]); }
});

app.get('/prospector', (req, res) => {
  res.sendFile(path.join(HOME, 'Cathedral', 'control-panel', 'prospector.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[cath-bridge] listening on http://0.0.0.0:${PORT}`);
});
