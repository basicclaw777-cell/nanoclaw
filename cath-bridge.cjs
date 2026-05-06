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
  const { q, top_k = '10', limit } = req.query;
  const k = limit || top_k;
  if (!q) return res.status(400).json({ error: 'q query param required' });
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
    // Forward to bot's internal webhook listener
    const resp = await fetch('http://127.0.0.1:8443/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
    const result = await resp.json();
    res.json(result);
  } catch (err) {
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

// ── Predictive Intelligence ────────────────────────────────────────────────────

const PRED_DIR = path.join(HOME, 'Cathedral', 'predictive-intelligence');

app.get('/predictive/map', (req, res) => {
  const key = process.env.CATH_API_KEY;
  if (key && req.headers['x-api-key'] !== key && req.query['x-api-key'] !== key) {
    return res.status(401).json({ error: 'unauthorized' });
  }
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

// ── Trading Hub ──────────────────────────────────────────────────────────────

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

// ── Reed's Studio ────────────────────────────────────────────────────────────
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

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[cath-bridge] listening on http://127.0.0.1:${PORT}`);
});
