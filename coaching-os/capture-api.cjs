'use strict';

const { execSync } = require('child_process');
const { readFileSync, existsSync, mkdirSync, unlinkSync } = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'coaching.db');
const CAPTURE_DIR = path.join(__dirname, 'captures');
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

if (!existsSync(CAPTURE_DIR)) mkdirSync(CAPTURE_DIR, { recursive: true });

const ANALYSIS_PROMPT = `You are a boxing coach's assistant analyzing a drill video. Look at these frames and identify:

1. **name** — short descriptive name for the drill
2. **description** — one sentence describing what the drill trains
3. **domain** — exactly one of: combos, defense, footwork, conditioning, warm_up, strategy, mindset, icebreaker
4. **mode** — exactly one of: shadow, partner, pads, bag, solo, group
5. **equipment** — JSON array from: ["heavy_bag", "pads", "double_end_bag", "speed_bag", "cones", "rope", "tennis_ball", "mirror", "ring", "gloves", "wraps", "timer", "none"]
6. **energy_demand** — exactly one of: low, medium, high, max
7. **engines** — JSON array from: ["body", "mind", "eq"]
8. **block_min** — lowest skill block (1-10) this suits
9. **block_max** — highest block this stays relevant for
10. **tags** — 3-5 short tags

Respond ONLY with valid JSON, no markdown fences:
{"name":"...","description":"...","domain":"...","mode":"...","equipment":[...],"energy_demand":"...","engines":[...],"block_min":N,"block_max":N,"tags":[...]}`;

function downloadVideo(url) {
  const id = Date.now().toString(36);
  const outPath = path.join(CAPTURE_DIR, `${id}.mp4`);
  try {
    execSync(`yt-dlp --no-playlist --max-filesize 50M -f "mp4[height<=720]/best[height<=720]" -o "${outPath}" "${url}" 2>&1`, { timeout: 60000 });
  } catch {
    try {
      execSync(`yt-dlp --no-playlist --max-filesize 50M -f "best[height<=720]" -o "${outPath}" "${url}" 2>&1`, { timeout: 60000 });
    } catch (e2) {
      throw new Error(`Download failed: ${e2.message?.slice(0, 200)}`);
    }
  }
  if (!existsSync(outPath)) throw new Error('Download produced no file');
  return { id, videoPath: outPath };
}

function extractFrames(videoPath, id) {
  const frames = [];
  let duration = 10;
  try {
    const probe = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`, { timeout: 10000 }).toString().trim();
    duration = parseFloat(probe) || 10;
  } catch {}

  for (let i = 0; i < 4; i++) {
    const t = Math.min(duration * ((i + 1) / 5), duration - 0.5);
    const fp = path.join(CAPTURE_DIR, `${id}_frame${i}.jpg`);
    try {
      execSync(`ffmpeg -y -ss ${t.toFixed(2)} -i "${videoPath}" -frames:v 1 -q:v 3 -vf "scale=512:-1" "${fp}" 2>/dev/null`, { timeout: 10000 });
      if (existsSync(fp)) frames.push(fp);
    } catch {}
  }
  if (!frames.length) throw new Error('Could not extract frames');
  return frames;
}

async function analyzeFrames(framePaths) {
  if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY not set');

  const imageContent = framePaths.map(fp => ({
    type: 'image',
    source: { type: 'base64', media_type: 'image/jpeg', data: readFileSync(fp).toString('base64') }
  }));

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: [...imageContent, { type: 'text', text: ANALYSIS_PROMPT }] }]
    })
  });

  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  const text = (data.content?.[0]?.text || '').replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(text);

  const validDomains = ['combos', 'defense', 'footwork', 'conditioning', 'warm_up', 'strategy', 'mindset', 'icebreaker'];
  if (!validDomains.includes(parsed.domain)) parsed.domain = 'combos';
  parsed.block_min = Math.max(1, Math.min(10, parsed.block_min || 1));
  parsed.block_max = Math.max(parsed.block_min, Math.min(10, parsed.block_max || 10));
  parsed.equipment = parsed.equipment || ['none'];
  parsed.engines = parsed.engines || ['body'];
  return parsed;
}

function cleanup(id) {
  ['mp4', 'frame0.jpg', 'frame1.jpg', 'frame2.jpg', 'frame3.jpg'].forEach(ext => {
    const fp = path.join(CAPTURE_DIR, `${id}.${ext.includes('frame') ? '' : ''}${ext.includes('frame') ? id + '_' : id + '.'}`.replace(/\.$/, '') );
    // Simpler approach
  });
  const patterns = [`${id}.mp4`, `${id}_frame0.jpg`, `${id}_frame1.jpg`, `${id}_frame2.jpg`, `${id}_frame3.jpg`];
  for (const p of patterns) {
    const fp = path.join(CAPTURE_DIR, p);
    try { if (existsSync(fp)) unlinkSync(fp); } catch {}
  }
}

function insertDrill(meta, sourceUrl) {
  const db = new Database(DB_PATH);
  const id = meta.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const existing = db.prepare('SELECT id FROM drills WHERE id = ?').get(id);
  if (existing) { db.close(); return { id, status: 'exists' }; }

  db.prepare(`INSERT INTO drills (id, name, description, domain, mode, block_min, block_max, equipment, energy_demand, engines, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, meta.name, meta.description || '', meta.domain, meta.mode || 'solo',
    meta.block_min, meta.block_max, JSON.stringify(meta.equipment),
    meta.energy_demand || 'medium', JSON.stringify(meta.engines), sourceUrl
  );
  db.close();
  return { id, status: 'inserted' };
}

module.exports = function(app) {
  const pending = new Map();

  app.post('/coaching/capture', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'url required' });

    try {
      const { id, videoPath } = downloadVideo(url);
      const frames = extractFrames(videoPath, id);
      const meta = await analyzeFrames(frames);
      cleanup(id);
      pending.set(id, { meta, sourceUrl: url });
      // Auto-expire after 30 minutes
      setTimeout(() => pending.delete(id), 30 * 60 * 1000);
      res.json({ id, meta, sourceUrl: url });
    } catch (e) {
      res.status(500).json({ error: e.message?.slice(0, 300) });
    }
  });

  app.post('/coaching/capture/:id/approve', (req, res) => {
    const { id } = req.params;
    const edits = req.body;
    const p = pending.get(id);
    if (!p) return res.status(404).json({ error: 'Not found or expired' });

    const meta = { ...p.meta, ...edits };
    try {
      const result = insertDrill(meta, p.sourceUrl);
      pending.delete(id);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/coaching/capture/:id/discard', (req, res) => {
    pending.delete(req.params.id);
    res.json({ status: 'discarded' });
  });
};
