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
    '/cosmology': ['bridge', 'cosmology'], '/scraper': ['bridge', 'scraper'],
    '/gym-eyes': ['bridge', 'gym-eyes'], '/techniques': ['bridge', 'techniques'],
    '/screening': ['bridge', 'screening'], '/cathedral-city': ['bridge', 'city'],
    '/constellation': ['bridge', 'constellation'], '/pulse': ['bridge', 'pulse'],
    '/api/architect-pulse': ['bridge', 'pulse'], '/agents': ['bridge', 'dialogue'],
    '/villa': ['bridge', 'monitor'], '/control': ['bridge', 'sentinel'],
    '/hermes': ['bridge', 'dispatch'],
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
const CUBA_LIB = path.join(HOME, 'basic-reflex', 'gym-eyes', 'cuba-library');
app.get('/cuba-combos', (req, res) => {
  res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
  res.sendFile(path.join(CUBA_LIB, 'cuba-dashboard.html'));
});
app.get('/cuba-combos/:file', (req, res) => {
  const filePath = path.join(CUBA_LIB, req.params.file);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.sendFile(filePath);
});
app.get('/cuba-combos/clips/:file', (req, res) => {
  const filePath = path.join(CUBA_LIB, 'clips', req.params.file);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.sendFile(filePath);
});
app.get('/cuba-combos/frames/:file', (req, res) => {
  const filePath = path.join(CUBA_LIB, 'frames', req.params.file);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.sendFile(filePath);
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
  const filePath = path.join(HOME, 'Downloads', req.params.folder, req.params.file);
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

// ── Archaeologist Explorer ────────────────────────────────────────────────────

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

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[cath-bridge] listening on http://0.0.0.0:${PORT}`);
});
