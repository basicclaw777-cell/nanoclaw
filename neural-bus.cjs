#!/usr/bin/env node
'use strict';

/**
 * Cathedral Neural Bus
 *
 * Central event stream for all Cathedral system activity.
 * Collects events from: cath-bridge HTTP, PM2, file watchers, Telegram.
 * Pushes to neural-map via WebSocket.
 * Stores rolling 1-hour history for replay.
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 8079;
const HOME = process.env.HOME;
const HISTORY_MAX = 3600; // 1 hour of events at ~1/sec
const FREQUENCY_WINDOW = 86400000; // 24h for frequency calc
const STATE_FILE = path.join(__dirname, 'neural-bus-state.json');

// ── Event history ────────────────────────────────────────────────────────────

let eventHistory = [];
let frequencyMap = {}; // nodeId -> [timestamps]
let nudgeState = {};   // nodeId -> { nudged: bool, reason: string }

function loadState() {
  try {
    const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    frequencyMap = data.frequencyMap || {};
    nudgeState = data.nudgeState || {};
    // Prune old frequency entries
    const cutoff = Date.now() - FREQUENCY_WINDOW;
    for (const [id, times] of Object.entries(frequencyMap)) {
      frequencyMap[id] = times.filter(t => t > cutoff);
    }
  } catch (e) { /* fresh start */ }
}

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ frequencyMap, nudgeState }, null, 2));
  } catch (e) { /* non-critical */ }
}

loadState();
setInterval(saveState, 30000); // Save every 30s

// ── Route → Node mapping ────────────────────────────────────────────────────

const ROUTE_MAP = {
  // Core
  '/chat': ['telegram', 'bridge'],
  '/chat/local': ['telegram', 'bridge'],
  '/env/chat': ['bridge', 'dispatch'],
  '/command': ['telegram', 'bridge'],

  // Vault
  '/vault/read': ['bridge', 'vault'],
  '/vault/write': ['bridge', 'vault'],
  '/vault/search': ['bridge', 'vault'],
  '/vault/list': ['bridge', 'vault'],

  // Production
  '/reed-studio': ['bridge', 'reed'],
  '/api/reed-studio': ['bridge', 'reed'],
  '/api/content-studio': ['bridge', 'content'],
  '/api/engineering-studio': ['bridge', 'engineering'],
  '/reed-slides': ['bridge', 'reed'],
  '/reed-lab': ['bridge', 'reed'],

  // Business
  '/growth': ['bridge', 'growth'],
  '/comms': ['bridge', 'comms'],
  '/merch': ['bridge', 'merch'],
  '/course': ['bridge', 'course'],
  '/publisher': ['bridge', 'publisher'],

  // Intelligence
  '/trader': ['bridge', 'trading'],
  '/looking-glass': ['bridge', 'looking-glass'],
  '/cosmology': ['bridge', 'cosmology'],
  '/scraper': ['bridge', 'scraper'],

  // Gym
  '/gym-eyes': ['bridge', 'gym-eyes'],
  '/techniques': ['bridge', 'techniques'],

  // Culture
  '/screening': ['bridge', 'screening'],
  '/cathedral-city': ['bridge', 'city'],
  '/constellation': ['bridge', 'constellation'],

  // Architect
  '/pulse': ['bridge', 'pulse'],
  '/api/architect-pulse': ['bridge', 'pulse'],
  '/neural-map': ['bridge', 'monitor'],
  '/api/neural-map': ['bridge', 'monitor'],

  // Infrastructure
  '/status': ['bridge'],
  '/health': ['bridge'],
  '/control': ['bridge', 'sentinel'],
  '/hermes': ['bridge', 'dispatch'],

  // Agents
  '/agents': ['bridge', 'dialogue'],
  '/agents/chat': ['bridge', 'dialogue', 'dispatch'],
  '/agents/steward': ['bridge', 'orchestrator'],

  // Emergence
  '/villa': ['bridge', 'monitor'],
};

function routeToNodes(url) {
  // Strip query params
  const path = url.split('?')[0];

  // Exact match
  if (ROUTE_MAP[path]) return ROUTE_MAP[path];

  // Prefix match
  for (const [route, nodes] of Object.entries(ROUTE_MAP)) {
    if (path.startsWith(route)) return nodes;
  }

  // Default — at minimum it hit the bridge
  return ['bridge'];
}

// ── PM2 → Node mapping ──────────────────────────────────────────────────────

const PM2_MAP = {
  'cathedral-bot': 'telegram',
  'cath-bridge': 'bridge',
  'dispatch-bot': 'dispatch',
  'vault-watcher': 'vault',
  'vault-state-refresh': 'vault-state',
  'vault-github-sync': 'vault-sync',
  'sentinel': 'sentinel',
  'cognitive-scanner': 'scanner',
  'orchestrator-seed': 'orchestrator',
  'architect-pulse': 'pulse',
  'lymphatic': 'lymphatic',
  'the-archivist': 'archivist',
  'the-cartographer': 'cartographer',
  'terminal-harvester': 'harvester',
  'vault-promoter': 'promoter',
  'reed-studio-engine': 'reed',
  'reed-shots': 'reed-shots',
  'eng-studio': 'engineering',
  'content-ideas': 'content',
  'voice-chamber': 'voice',
  'maya-social': 'maya',
  'buzz-monitor': 'buzz',
  'trader': 'trading',
  'prospector': 'prospector',
};

// ── File watch paths → Node mapping ──────────────────────────────────────────

const WATCH_PATHS = [
  { path: path.join(HOME, 'Cathedral', 'emergence'), node: 'monitor', label: 'emergence' },
  { path: path.join(HOME, 'cathedral-vault', '00_Staging'), node: 'vault', label: 'vault-staging' },
  { path: path.join(HOME, 'cathedral-vault', '02_Refined_Gold'), node: 'vault', label: 'vault-gold' },
  { path: path.join(HOME, 'nanoclaw', 'architect-pulse'), node: 'pulse', label: 'pulse' },
  { path: path.join(HOME, 'nanoclaw', 'trader'), node: 'trading', label: 'trader' },
  { path: path.join(HOME, 'cathedral-vault', '10_Agents'), node: 'dialogue', label: 'agents' },
];

// ── WebSocket Server ─────────────────────────────────────────────────────────

const wss = new WebSocket.Server({ port: PORT });
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);

  // Send recent history on connect (last 100 events)
  const recent = eventHistory.slice(-100);
  ws.send(JSON.stringify({ type: 'history', events: recent }));

  // Send current frequency snapshot
  ws.send(JSON.stringify({ type: 'frequencies', data: getFrequencies() }));

  // Send nudge state
  ws.send(JSON.stringify({ type: 'nudge-state', data: nudgeState }));

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'nudge') {
        handleNudge(data.nodeId, data.action);
      }
    } catch (e) { /* ignore bad messages */ }
  });

  ws.on('close', () => clients.delete(ws));
});

function broadcast(event) {
  const msg = JSON.stringify(event);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

// ── Event emission ───────────────────────────────────────────────────────────

function emit(event) {
  const enriched = {
    ...event,
    ts: Date.now(),
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  };

  // Store in history
  eventHistory.push(enriched);
  if (eventHistory.length > HISTORY_MAX) {
    eventHistory = eventHistory.slice(-HISTORY_MAX);
  }

  // Update frequency map
  const nodes = enriched.path || [];
  const now = Date.now();
  nodes.forEach(nodeId => {
    if (!frequencyMap[nodeId]) frequencyMap[nodeId] = [];
    frequencyMap[nodeId].push(now);
  });

  // Broadcast to all connected clients
  broadcast({ type: 'event', event: enriched });
}

function getFrequencies() {
  const cutoff = Date.now() - FREQUENCY_WINDOW;
  const result = {};
  for (const [id, times] of Object.entries(frequencyMap)) {
    const recent = times.filter(t => t > cutoff);
    frequencyMap[id] = recent; // prune while we're at it
    result[id] = recent.length;
  }
  return result;
}

// ── Nudge system ─────────────────────────────────────────────────────────────

function handleNudge(nodeId, action) {
  if (action === 'activate') {
    nudgeState[nodeId] = { nudged: true, at: Date.now(), reason: 'manual' };
    emit({
      source: 'nudge',
      action: 'activate',
      path: [nodeId],
      label: `Nudge sent to ${nodeId}`,
    });
  } else if (action === 'quiet') {
    nudgeState[nodeId] = { deliberateQuiet: true, at: Date.now() };
    broadcast({ type: 'nudge-state', data: nudgeState });
  } else if (action === 'clear') {
    delete nudgeState[nodeId];
    broadcast({ type: 'nudge-state', data: nudgeState });
  }
  saveState();
}

// ── HTTP event receiver (called from cath-bridge middleware) ──────────────────

const http = require('http');

const receiver = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/event') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const event = JSON.parse(body);
        emit(event);
        res.writeHead(200);
        res.end('ok');
      } catch (e) {
        res.writeHead(400);
        res.end('bad json');
      }
    });
  } else if (req.method === 'GET' && req.url === '/frequencies') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getFrequencies()));
  } else if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      clients: clients.size,
      historySize: eventHistory.length,
      nodes: Object.keys(frequencyMap).length,
    }));
  } else {
    res.writeHead(404);
    res.end('not found');
  }
});

receiver.listen(8078, '127.0.0.1', () => {
  console.log('[neural-bus] HTTP receiver on http://127.0.0.1:8078');
});

// ── PM2 log stream ───────────────────────────────────────────────────────────

function startPM2Stream() {
  try {
    const pm2Log = spawn('pm2', ['logs', '--raw', '--lines', '0'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let buffer = '';
    const processLine = (line) => {
      // PM2 raw log format: "processName | message"
      const match = line.match(/^(\S+)\s*\|\s*(.+)/);
      if (!match) return;

      const [, procName, message] = match;
      const nodeId = PM2_MAP[procName];
      if (!nodeId) return;

      // Emit as event
      emit({
        source: 'pm2',
        process: procName,
        path: [nodeId],
        label: message.substring(0, 80),
      });
    };

    pm2Log.stdout.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line
      lines.forEach(processLine);
    });

    pm2Log.on('close', () => {
      console.log('[neural-bus] PM2 log stream closed, restarting in 5s...');
      setTimeout(startPM2Stream, 5000);
    });

    pm2Log.on('error', (err) => {
      console.error('[neural-bus] PM2 stream error:', err.message);
    });
  } catch (e) {
    console.error('[neural-bus] Failed to start PM2 stream:', e.message);
  }
}

// ── File watchers ────────────────────────────────────────────────────────────

function startFileWatchers() {
  const debounce = {};

  WATCH_PATHS.forEach(({ path: watchPath, node, label }) => {
    try {
      if (!fs.existsSync(watchPath)) return;

      fs.watch(watchPath, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        // Skip .DS_Store and temp files
        if (filename.startsWith('.') || filename.endsWith('.tmp')) return;

        // Debounce — same file within 2s
        const key = `${node}:${filename}`;
        if (debounce[key] && Date.now() - debounce[key] < 2000) return;
        debounce[key] = Date.now();

        // Determine additional nodes based on file type
        const path_nodes = [node];
        if (filename.endsWith('.json') && filename.includes('state')) {
          path_nodes.push('monitor');
        }
        if (node === 'vault' && filename.includes('Refined_Gold')) {
          path_nodes.push('archivist');
        }

        emit({
          source: 'file',
          action: eventType,
          file: filename,
          path: path_nodes,
          label: `${label}: ${filename}`,
        });
      });

      console.log(`[neural-bus] Watching: ${watchPath}`);
    } catch (e) {
      console.error(`[neural-bus] Watch failed for ${watchPath}:`, e.message);
    }
  });
}

// ── Broadcast frequencies every 30s ──────────────────────────────────────────

setInterval(() => {
  broadcast({ type: 'frequencies', data: getFrequencies() });
}, 30000);

// ── Start ────────────────────────────────────────────────────────────────────

console.log(`[neural-bus] WebSocket server on ws://localhost:${PORT}`);
startPM2Stream();
startFileWatchers();

// Emit boot event
emit({
  source: 'system',
  action: 'boot',
  path: ['bridge', 'monitor'],
  label: 'Neural Bus started',
});
