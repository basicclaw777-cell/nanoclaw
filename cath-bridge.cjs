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

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── Auth middleware ────────────────────────────────────────────────────────────

function requireApiKey(req, res, next) {
  const key = process.env.CATH_API_KEY;
  if (key && req.headers['x-api-key'] !== key) {
    return res.status(401).json({ error: 'unauthorized' });
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
  const { q, top_k = '10' } = req.query;
  if (!q) return res.status(400).json({ error: 'q query param required' });
  try {
    const output = await run('python3', [
      path.join(NANOCLAW, 'vault_reader.py'),
      '--search', q,
      '--top_k',  top_k,
    ], 30_000);
    res.json({ query: q, results: output });
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

// ── Creative Court: List Illustrations ───────────────────────────────────────

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

// Serve artifact files directly (images, HTML, SVG)
app.get('/villa/artifact-file', (req, res) => {
  const relPath = req.query.path;
  if (!relPath || relPath.includes('..')) return res.status(400).send('invalid path');
  const full = path.join(VAULT, '09_Artifacts', relPath);
  if (!fs.existsSync(full)) return res.status(404).send('not found');
  res.sendFile(full);
});

// ── Villa static serve ─────────────────────────────────────────────────────────
// Serve the villa HTML directly from cath-bridge with no-cache headers.
// This replaces the python3 http.server that has aggressive caching.

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

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[cath-bridge] listening on http://127.0.0.1:${PORT}`);
});
