// Cathy on the phone: /cathy page. Text or voice in, Cathy's reply streamed back sentence by sentence in her cloned voice.
// Brain: `claude --agent cathy` (read-only, constitution-loaded). Ears + voice: ~/Cathedral/cathy-voice/voice_server.py on :8767.
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const express = require('express');
const gcal = require('./gcal.cjs'); // Paul's Google Calendar, read-only copy for Cathy (~/Cathedral/cathy/calendar.md)

const HOME = process.env.HOME;
const VOICE = { host: '127.0.0.1', port: 8767 };
const LOG_DIR = path.join(HOME, 'cathedral-vault', '00_Staging', 'cathy-voice');
const CATHY_DIR = path.join(HOME, 'Cathedral', 'cathy');
const MCP = path.join(CATHY_DIR, 'mcp.json');           // her notebook + easel tool server (writes only its own fixed files)
const LAST = path.join(CATHY_DIR, 'last-session.json'); // so any address (http, https, Home Screen) continues the same talk
const TRAY = path.join(HOME, 'Cathedral', 'agent-board', 'tray.json');
const TRAY_MD = path.join(HOME, 'Cathedral', 'agent-board', 'forge-tray.md');
const IMG_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;
// Tools she may use without a prompt. Read-only ones + her own notebook/easel + web eyes. Nothing else exists for her.
const ALLOWED = ['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch', 'mcp__cathy__front_page_set', 'mcp__cathy__record_add', 'mcp__cathy__easel_pin', 'mcp__cathy__easel_unpin', 'mcp__cathy__build_card', 'mcp__cathy__builds_to_review', 'mcp__cathy__build_review', 'mcp__cathy__card_send', 'mcp__cathy__draw'].join(',');
const CARDS = path.join(CATHY_DIR, 'cards.json');
const SHOTS = path.join(CATHY_DIR, 'shots');
const SHOT_NAME = /^[\w-]+\.png$/;
const REVIEWS = path.join(CATHY_DIR, 'reviews.json');
// What Paul actually said (his own words, as they reached /api/cathy/ask). The only proof a voice send is his yes.
const PAUL_SAID = path.join(CATHY_DIR, 'paul-said.json');
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
const SEND_INTENT = /\b(send|forge|tray|yes|yeah|yep|go ahead|do it|ship it|approved?)\b/;
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(v, null, 2)); fs.renameSync(f + '.tmp', f); };

// The tray: Paul's words on their way to Forge. Mirrored as markdown so Forge can read it at session start.
function saveTray(items) {
  writeJson(TRAY, items);
  const waiting = items.filter((t) => t.status !== 'done');
  const md = ['# Forge tray: sent by Paul from the Cathy phone page', '',
    'Paul tapped "→ Forge" on these. Read them at session start, raise them with Paul, and build only what he and you agree.',
    'When a build is finished, file a receipt so Cathy can check it against the ask:',
    '`node ~/Cathedral/cathy/receipt.js <id> --built "..." --differs "..." --where "..."`', ''];
  for (const t of waiting) md.push(`## ${new Date(t.at).toLocaleString('sv-SE', { timeZone: 'Asia/Hong_Kong' }).slice(0, 16)} HKT · ${t.status} · id ${t.id}`, '',
    t.cardId ? `Build card (drafted by Cathy, sent by Paul):\n\n${t.text}` : `${t.speaker === 'cathy' ? 'Cathy said (Paul sent it):' : 'Paul:'} ${t.text}`, '');
  if (!waiting.length) md.push('(empty)');
  fs.writeFileSync(TRAY_MD, md.join('\n'));
}
const SID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VOICE_MODE = [
  'Voice mode: Paul is talking to you from his phone, probably by voice, so expect transcription slips. Read for meaning.',
  'Every word you write is spoken aloud in your voice. Plain spoken sentences only. No markdown, no bullets, no tables, no code.',
  'Never read out file paths or line numbers; name things the way a person would. Keep each turn short enough to listen to, then stop.',
].join(' ');

const audio = new Map(); // id -> { wav, at }
setInterval(() => { const cut = Date.now() - 15 * 6e4; for (const [k, v] of audio) if (v.at < cut) audio.delete(k); }, 6e4).unref();

function trusted(req) {
  const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  if (ip === '127.0.0.1' || ip === '::1') return true;
  const m = ip.match(/^100\.(\d+)\./);
  return !!m && +m[1] >= 64 && +m[1] <= 127;
}

function voiceCall(route, body, type) {
  return new Promise((resolve, reject) => {
    const req = http.request({ ...VOICE, path: route, method: 'POST', headers: { 'Content-Type': type, 'Content-Length': body.length } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => (res.statusCode === 200 ? resolve(Buffer.concat(chunks)) : reject(new Error(Buffer.concat(chunks).toString() || 'voice server error'))));
    });
    req.on('error', () => reject(new Error("Cathy's voice server isn't running.")));
    req.end(body);
  });
}

function speechText(s) {
  return s.replace(/```[\s\S]*?```/g, ' ').replace(/`([^`]*)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/(~|\/Users\/\w+)?\/[\w./-]+/g, '').replace(/[*_#>|]/g, '').replace(/\s+/g, ' ').trim();
}

function logTurn(said, reply) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const file = path.join(LOG_DIR, `cathy-phone-${new Date().toISOString().slice(0, 10)}.md`);
    if (!fs.existsSync(file)) fs.writeFileSync(file, `# Cathy on the phone — ${new Date().toISOString().slice(0, 10)}\n\n`);
    fs.appendFileSync(file, `**Paul:** ${said}\n\n**Cathy:** ${reply}\n\n`);
  } catch {}
}

module.exports = function mount(app) {
  gcal.start(); // sync now, then every 15 minutes
  app.get('/cathy', (req, res) => { res.set('Cache-Control', 'no-store'); res.sendFile(path.join(__dirname, 'cathy.html')); });
  app.get('/round-room', (req, res) => { res.set('Cache-Control', 'no-store'); res.sendFile(path.join(HOME, 'Cathedral', 'cathy', 'round-room.html')); });
  app.get('/shelf', (req, res) => { res.set('Cache-Control', 'no-store'); res.sendFile(path.join(HOME, 'Cathedral', 'cathy', 'living-shelf.html')); });
  app.get('/library', (req, res) => { res.set('Cache-Control', 'no-store'); res.sendFile(path.join(HOME, 'Cathedral', 'cathy', 'display-room.html')); });

  app.post('/api/cathy/transcribe', express.raw({ type: '*/*', limit: '25mb' }), async (req, res) => {
    if (!trusted(req)) return res.status(403).json({ error: 'Only from the M5 or a Tailscale device.' });
    if (!req.body || !req.body.length) return res.status(400).json({ error: 'No audio received.' });
    try { res.json(JSON.parse((await voiceCall('/transcribe', req.body, 'application/octet-stream')).toString())); }
    catch (e) { res.status(502).json({ error: e.message }); }
  });

  app.get('/api/cathy/health', (req, res) => {
    http.get({ ...VOICE, path: '/health', timeout: 3000 }, (r) => { r.resume(); res.status(r.statusCode === 200 ? 200 : 502).json({ ok: r.statusCode === 200 }); })
      .on('error', () => res.status(502).json({ ok: false, error: "Cathy's voice server isn't running." }));
  });

  // Last conversation, so a page with no saved ticket (new address, Home Screen app) carries on the same talk.
  app.get('/api/cathy/last', (req, res) => {
    if (!trusted(req)) return res.status(403).json({ error: 'Only from the M5 or a Tailscale device.' });
    res.json(readJson(LAST, {}));
  });

  // ── Tray: Paul → Forge ──
  app.get('/api/tray', (req, res) => {
    if (!trusted(req)) return res.status(403).json({ error: 'Only from the M5 or a Tailscale device.' });
    res.json({ items: readJson(TRAY, []) });
  });
  app.post('/api/tray', express.json(), (req, res) => {
    if (!trusted(req)) return res.status(403).json({ error: 'Only from the M5 or a Tailscale device.' });
    const text = String((req.body || {}).text || '').trim().slice(0, 6000);
    if (!text) return res.status(400).json({ error: 'Nothing to send.' });
    const items = readJson(TRAY, []);
    if (items.some((t) => t.text === text && t.status !== 'done')) return res.json({ ok: true, duplicate: true, waiting: items.filter((t) => t.status !== 'done').length });
    items.unshift({ id: crypto.randomBytes(5).toString('hex'), at: new Date().toISOString(), speaker: req.body.speaker === 'cathy' ? 'cathy' : 'paul', text, status: 'waiting' });
    saveTray(items);
    res.json({ ok: true, waiting: items.filter((t) => t.status !== 'done').length });
  });
  app.post('/api/tray/status', express.json(), (req, res) => {
    if (!trusted(req)) return res.status(403).json({ error: 'Only from the M5 or a Tailscale device.' });
    const { id, status } = req.body || {};
    if (!['waiting', 'picked up', 'done'].includes(status)) return res.status(400).json({ error: 'bad status' });
    const items = readJson(TRAY, []); const t = items.find((x) => x.id === id);
    if (!t) return res.status(404).json({ error: 'not found' });
    t.status = status; t.updatedAt = new Date().toISOString(); saveTray(items);
    res.json({ ok: true });
  });

  // Forge's receipt: what was built, how it differs from the ask, where to see it. Closes the tray item; Cathy reviews it.
  app.post('/api/tray/receipt', express.json(), (req, res) => {
    if (!trusted(req)) return res.status(403).json({ error: 'Only from the M5 or a Tailscale device.' });
    const { id, built, differs, where } = req.body || {};
    if (!String(built || '').trim()) return res.status(400).json({ error: 'Say what was built.' });
    const items = readJson(TRAY, []); const t = items.find((x) => x.id === id);
    if (!t) return res.status(404).json({ error: 'No tray item with that id.' });
    const shots = (Array.isArray(req.body.shots) ? req.body.shots : []).filter((f) => SHOT_NAME.test(f)).slice(0, 4);
    t.receipt = { built: String(built).slice(0, 3000), differs: String(differs || '').slice(0, 2000), where: String(where || '').slice(0, 1000), shots, at: new Date().toISOString() };
    t.status = 'done'; t.updatedAt = t.receipt.at; saveTray(items);
    res.json({ ok: true });
  });

  // Screenshots of finished builds (made by shot.cjs / receipt.js).
  app.get('/api/cathy/shots/:file', (req, res) => {
    if (!trusted(req)) return res.status(403).end();
    if (!SHOT_NAME.test(req.params.file)) return res.status(400).end();
    const f = path.join(SHOTS, req.params.file);
    if (!fs.existsSync(f)) return res.status(404).end();
    res.set('Cache-Control', 'max-age=86400').sendFile(f);
  });

  // Paul's tap on a build card: it goes to Forge's tray, card text verbatim.
  app.post('/api/cathy/cards/send', express.json(), (req, res) => {
    if (!trusted(req)) return res.status(403).json({ error: 'Only from the M5 or a Tailscale device.' });
    const cards = readJson(CARDS, []); const c = cards.find((x) => x.id === (req.body || {}).id);
    if (!c) return res.status(404).json({ error: 'No such card.' });
    if (c.sentAt) return res.json({ ok: true, already: true });
    // A send from Cathy's voice tool needs Paul's own words: said in the last hour, and saying yes / send.
    let yes = '';
    if ((req.body || {}).via === 'voice') {
      const quote = norm(req.body.pauls_words);
      if (quote.split(' ').length < 1 || quote.length < 3) return res.status(400).json({ error: "Quote Paul's exact words." });
      if (!SEND_INTENT.test(quote)) return res.status(400).json({ error: "Those words don't say send. Ask Paul if he wants it sent." });
      // The yes must be fresh: in one of Paul's last two things said, within 15 minutes. An old or unrelated "yes"
      // can't unlock a card. Which card he meant still rests on Cathy asking when it's unclear.
      const recent = readJson(PAUL_SAID, []).slice(0, 2).filter((u) => Date.now() - Date.parse(u.at) < 15 * 60e3);
      if (!recent.some((u) => norm(u.text).includes(quote))) return res.status(400).json({ error: "That yes isn't in what Paul just said. Ask him now: shall I send the [card title] card to Forge?" });
      yes = String(req.body.pauls_words).slice(0, 400);
    }
    const text = [`# ${c.title}`, '', `What: ${c.what}`, '', `Why: ${c.why}`, '', `Done looks like: ${c.done_looks_like}`,
      ...(c.open_questions && c.open_questions.length ? ['', 'Open questions:', ...c.open_questions.map((q) => `- ${q}`)] : []),
      ...(c.pauls_words ? ['', `Paul's words: "${c.pauls_words}"`] : []),
      ...(yes ? ['', `Sent by Paul's voice: "${yes}"`] : [])].join('\n');
    const items = readJson(TRAY, []);
    const t = { id: crypto.randomBytes(5).toString('hex'), at: new Date().toISOString(), speaker: 'cathy', cardId: c.id, text, status: 'waiting', ...(yes ? { via: 'voice', paulsYes: yes } : { via: 'tap' }) };
    items.unshift(t); saveTray(items);
    c.sentAt = t.at; c.trayId = t.id; writeJson(CARDS, cards);
    res.json({ ok: true, trayId: t.id });
  });

  // ── Easel: what Cathy pinned for Paul + her front page ──
  app.get('/easel/sketches', (req, res) => { res.set('Cache-Control', 'no-store'); res.sendFile(path.join(__dirname, 'filofax-sketches.html')); });
  app.get('/easel', (req, res) => { res.set('Cache-Control', 'no-store'); res.sendFile(path.join(__dirname, 'easel.html')); });
  // Tray builds: what Forge made from Cathy's build cards. ~/Cathedral/tray-builds/<slug>/index.html (+ files). M5 + Tailscale only.
  const BUILDS = path.join(HOME, 'Cathedral', 'tray-builds');
  app.use('/builds', (req, res, next) => { if (!trusted(req)) return res.status(403).send('Only from the M5 or a Tailscale device.'); res.set('Cache-Control', 'no-store'); next(); }, express.static(BUILDS, { dotfiles: 'deny', index: 'index.html' }));
  app.get('/api/cathy/easel', (req, res) => {
    if (!trusted(req)) return res.status(403).json({ error: 'Only from the M5 or a Tailscale device.' });
    const easel = readJson(path.join(CATHY_DIR, 'easel.json'), { pins: [] });
    const pins = easel.pins.map(({ path: p, ...rest }) => (p ? { ...rest, image: `/api/cathy/easel/image/${rest.id}` } : rest));
    // Build cards with their whole life joined in: drafted → with Forge → built (receipt) → reviewed by Cathy.
    const tray = readJson(TRAY, []), reviews = readJson(REVIEWS, {});
    const cards = readJson(CARDS, []).map((c) => {
      const t = c.trayId && tray.find((x) => x.id === c.trayId);
      const review = t && reviews[t.id];
      const stage = review ? 'reviewed' : t && t.receipt ? 'built' : t ? (t.status === 'picked up' ? 'with forge' : 'in tray') : 'draft';
      return { ...c, stage, trayStatus: t && t.status, receipt: t && t.receipt, review };
    });
    // Plain "→ Forge" messages that came back with a receipt show too, so every build gets checked.
    const loose = tray.filter((t) => !t.cardId && t.receipt).map((t) => ({ id: 't' + t.id, title: t.text.slice(0, 80), what: t.text, loose: true, at: t.at,
      stage: reviews[t.id] ? 'reviewed' : 'built', receipt: t.receipt, review: reviews[t.id] }));
    const shots = readJson(path.join(SHOTS, 'shots.json'), []).slice(0, 8);
    res.set('Cache-Control', 'no-store').json({ pins, shots, cards: [...cards, ...loose], front: readJson(path.join(CATHY_DIR, 'front-page.json'), { sections: {} }) });
  });
  // Her record (the add-only observation log), newest first, for the Filofax back pages.
  app.get('/api/cathy/record', (req, res) => {
    if (!trusted(req)) return res.status(403).json({ error: 'Only from the M5 or a Tailscale device.' });
    let md = ''; try { md = fs.readFileSync(path.join(HOME, 'cathedral-vault', '02_Refined_Gold', 'cathedral', 'cathy-observation-log.md'), 'utf8'); } catch {}
    const entries = md.split(/^## /m).slice(1).map((chunk) => { const nl = chunk.indexOf('\n'); return { at: chunk.slice(0, nl).trim(), text: chunk.slice(nl + 1).trim() }; });
    res.set('Cache-Control', 'no-store').json({ entries: entries.reverse().slice(0, 40) });
  });
  app.get('/api/cathy/easel/image/:id', (req, res) => {
    if (!trusted(req)) return res.status(403).end();
    const pin = readJson(path.join(CATHY_DIR, 'easel.json'), { pins: [] }).pins.find((p) => p.id === req.params.id);
    if (!pin || !pin.path) return res.status(404).end();
    let real; try { real = fs.realpathSync(pin.path); } catch { return res.status(404).end(); }
    if (!real.startsWith(HOME + '/') || !IMG_EXT.test(real)) return res.status(403).end();
    res.sendFile(real);
  });

  app.get('/api/cathy/audio/:id', (req, res) => {
    const a = audio.get(req.params.id);
    if (!a) return res.status(404).end();
    res.set('Content-Type', 'audio/wav').set('Cache-Control', 'no-store').send(a.wav);
  });

  app.post('/api/cathy/ask', express.json(), (req, res) => {
    if (!trusted(req)) return res.status(403).json({ error: 'Only from the M5 or a Tailscale device.' });
    const text = String((req.body || {}).text || '').trim();
    const sessionId = (req.body || {}).sessionId;
    if (!text) return res.status(400).json({ error: 'Say something first.' });
    gcal.fresh(); // refresh her calendar copy if it's >10 min old (doesn't hold up the reply)
    const said = readJson(PAUL_SAID, []); said.unshift({ at: new Date().toISOString(), text: text.slice(0, 4000) }); writeJson(PAUL_SAID, said.slice(0, 40));

    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    let open = true;
    res.on('close', () => { open = false; });
    const send = (obj) => { if (open) res.write(`data: ${JSON.stringify(obj)}\n\n`); };

    // cath-bridge's .env carries an API key for other services; without it the CLI uses Paul's Claude subscription.
    const env = { ...process.env }; delete env.ANTHROPIC_API_KEY;

    // Sentences are voiced one at a time, in order, while Cathy keeps writing.
    let chain = Promise.resolve();
    const voice = (sentence) => {
      const clean = speechText(sentence);
      if (!/\w/.test(clean)) return;
      chain = chain.then(async () => {
        try {
          const wav = await voiceCall('/speak', Buffer.from(JSON.stringify({ text: clean })), 'application/json');
          const id = crypto.randomBytes(9).toString('hex');
          audio.set(id, { wav, at: Date.now() });
          send({ type: 'audio', url: `/api/cathy/audio/${id}` });
        } catch (e) { send({ type: 'warn', message: e.message }); }
      });
    };

    // Spawn one Cathy turn. resumeId may be null (fresh) or a session id to continue.
    const runOnce = (resumeId) => new Promise((resolve) => {
      const args = ['--agent', 'cathy', '-p', text, '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--append-system-prompt', VOICE_MODE,
        '--mcp-config', MCP, '--strict-mcp-config'];
      if (resumeId) args.push('--resume', resumeId);
      args.push('--allowedTools', ALLOWED);
      const child = spawn('claude', args, { cwd: HOME, env, stdio: ['ignore', 'pipe', 'pipe'] });

      let buf = '', full = '', lineBuf = '', newSession = resumeId || null;
      let errText = '', resultError = '';
      child.stdout.on('data', (chunk) => {
        lineBuf += chunk;
        const lines = lineBuf.split('\n');
        lineBuf = lines.pop();
        for (const line of lines) {
          let msg; try { msg = JSON.parse(line); } catch { continue; }
          if (msg.type === 'stream_event') {
            const ev = msg.event || {};
            if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') {
              full += ev.delta.text; buf += ev.delta.text;
              send({ type: 'text', text: ev.delta.text });
              let m;
              while ((m = buf.match(/^([\s\S]+?[.!?])(\s+)/))) { voice(m[1]); buf = buf.slice(m[0].length); }
            } else if (ev.type === 'content_block_stop' && buf.trim()) { voice(buf); buf = ''; }
            else if (ev.type === 'content_block_start' && ev.content_block && ev.content_block.type === 'tool_use') send({ type: 'looking' });
          } else if (msg.type === 'result') {
            newSession = msg.session_id || newSession;
            if (msg.is_error) resultError = String(msg.result || msg.subtype || 'error');
          }
        }
      });
      child.stderr.on('data', (d) => { errText = (errText + d).slice(-2000); });
      child.on('close', (code) => resolve({ full: full.trim(), buf, newSession, resultError, errText, code }));
    });

    send({ type: 'thinking' });

    (async () => {
      const resumeId = SID.test(sessionId || '') ? sessionId : null;
      let r = await runOnce(resumeId);
      // Resume of a pre-migration session can 422 (incompatible history). Retry fresh once so the turn still answers.
      if (resumeId && !r.full) { send({ type: 'thinking' }); r = await runOnce(null); }
      if (r.buf.trim()) voice(r.buf);
      if (!r.full) send({ type: 'warn', message: (r.resultError || r.errText || `Cathy stopped (exit ${r.code}).`).trim().slice(-300) });
      await chain;
      if (r.full) logTurn(text, r.full);
      if (r.newSession && r.full) try { writeJson(LAST, { sessionId: r.newSession, at: new Date().toISOString() }); } catch {}
      send({ type: 'done', sessionId: r.newSession });
      if (open) res.end();
    })();
  });
};
