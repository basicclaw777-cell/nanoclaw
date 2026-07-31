import { execSync, exec } from 'child_process';
import { readFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import Database from 'better-sqlite3';

const DB_PATH = join(import.meta.dirname, 'coaching.db');
const CAPTURE_DIR = join(import.meta.dirname, 'captures');
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

if (!existsSync(CAPTURE_DIR)) mkdirSync(CAPTURE_DIR, { recursive: true });

const ANALYSIS_PROMPT = `You are a boxing coach's assistant analyzing a drill video. Look at these frames and identify:

1. **name** — short descriptive name for the drill (e.g., "Jab-Cross on Pads", "Slip-Counter Drill")
2. **description** — one sentence describing what the drill trains
3. **domain** — exactly one of: combos, defense, footwork, conditioning, warm_up, strategy, mindset, icebreaker
4. **mode** — exactly one of: shadow, partner, pads, bag, solo, group
5. **equipment** — JSON array from: ["heavy_bag", "pads", "double_end_bag", "speed_bag", "cones", "rope", "tennis_ball", "mirror", "ring", "gloves", "wraps", "timer", "none"]
6. **energy_demand** — exactly one of: low, medium, high, max
7. **engines** — JSON array from: ["body", "mind", "eq"] (eq = emotional intelligence)
8. **block_min** — lowest skill block (1-10) this drill suits. 1=Foundation, 2=Footwork, 3=Jab/Cross, 4=Hooks/Body, 5=Rhythm, 6=Counter, 7=Pressure, 8=Escape, 9=Control, 10=Arena
9. **block_max** — highest block this drill stays relevant for
10. **tags** — 3-5 short tags for searchability

Respond ONLY with valid JSON, no markdown fences:
{"name":"...","description":"...","domain":"...","mode":"...","equipment":[...],"energy_demand":"...","engines":[...],"block_min":N,"block_max":N,"tags":[...]}`;

export async function downloadVideo(url) {
  const id = Date.now().toString(36);
  const outPath = join(CAPTURE_DIR, `${id}.mp4`);

  try {
    execSync(
      `yt-dlp --no-playlist --max-filesize 50M -f "mp4[height<=720]/best[height<=720]" -o "${outPath}" "${url}" 2>&1`,
      { timeout: 60000 }
    );
  } catch (e) {
    // yt-dlp on some reels needs cookies or different format
    try {
      execSync(
        `yt-dlp --no-playlist --max-filesize 50M -f "best[height<=720]" -o "${outPath}" "${url}" 2>&1`,
        { timeout: 60000 }
      );
    } catch (e2) {
      throw new Error(`Download failed: ${e2.message?.slice(0, 200)}`);
    }
  }

  if (!existsSync(outPath)) throw new Error('Download produced no file');
  return { id, videoPath: outPath };
}

export function extractFrames(videoPath, id, count = 4) {
  const frames = [];
  // Get duration
  let duration;
  try {
    const probe = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`,
      { timeout: 10000 }
    ).toString().trim();
    duration = parseFloat(probe);
  } catch {
    duration = 10;
  }

  for (let i = 0; i < count; i++) {
    const t = Math.min(duration * ((i + 1) / (count + 1)), duration - 0.5);
    const framePath = join(CAPTURE_DIR, `${id}_frame${i}.jpg`);
    try {
      execSync(
        `ffmpeg -y -ss ${t.toFixed(2)} -i "${videoPath}" -frames:v 1 -q:v 3 -vf "scale=512:-1" "${framePath}" 2>/dev/null`,
        { timeout: 10000 }
      );
      if (existsSync(framePath)) frames.push(framePath);
    } catch { /* skip frame */ }
  }

  if (frames.length === 0) throw new Error('Could not extract any frames');
  return frames;
}

export async function analyzeFrames(framePaths) {
  if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY not set');

  const imageContent = framePaths.map(fp => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: 'image/jpeg',
      data: readFileSync(fp).toString('base64')
    }
  }));

  const body = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: [
        ...imageContent,
        { type: 'text', text: ANALYSIS_PROMPT }
      ]
    }]
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text || '';

  // Parse JSON from response (strip markdown fences if present)
  const cleaned = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(cleaned);

  // Validate required fields
  const required = ['name', 'domain', 'mode'];
  for (const f of required) {
    if (!parsed[f]) throw new Error(`Missing required field: ${f}`);
  }

  // Normalize
  const validDomains = ['combos', 'defense', 'footwork', 'conditioning', 'warm_up', 'strategy', 'mindset', 'icebreaker'];
  if (!validDomains.includes(parsed.domain)) parsed.domain = 'combos';

  const validModes = ['shadow', 'partner', 'pads', 'bag', 'solo', 'group'];
  if (!validModes.includes(parsed.mode)) parsed.mode = 'solo';

  const validEnergy = ['low', 'medium', 'high', 'max'];
  if (!validEnergy.includes(parsed.energy_demand)) parsed.energy_demand = 'medium';

  parsed.block_min = Math.max(1, Math.min(10, parsed.block_min || 1));
  parsed.block_max = Math.max(parsed.block_min, Math.min(10, parsed.block_max || 10));
  parsed.equipment = parsed.equipment || ['none'];
  parsed.engines = parsed.engines || ['body'];

  return parsed;
}

export function insertDrill(meta, sourceUrl) {
  const db = new Database(DB_PATH);
  const id = meta.name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

  // Check for duplicates
  const existing = db.prepare('SELECT id FROM drills WHERE id = ?').get(id);
  if (existing) {
    db.close();
    return { id, status: 'exists' };
  }

  db.prepare(`
    INSERT INTO drills (id, name, description, domain, mode, block_min, block_max,
      equipment, energy_demand, engines, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    meta.name,
    meta.description || '',
    meta.domain,
    meta.mode,
    meta.block_min,
    meta.block_max,
    JSON.stringify(meta.equipment),
    meta.energy_demand,
    JSON.stringify(meta.engines),
    sourceUrl
  );

  db.close();
  return { id, status: 'inserted' };
}

export function cleanup(id) {
  const patterns = [`${id}.mp4`, `${id}_frame0.jpg`, `${id}_frame1.jpg`, `${id}_frame2.jpg`, `${id}_frame3.jpg`];
  for (const p of patterns) {
    const fp = join(CAPTURE_DIR, p);
    try { if (existsSync(fp)) unlinkSync(fp); } catch { /* ignore */ }
  }
}

export async function captureDrill(url) {
  const { id, videoPath } = await downloadVideo(url);

  try {
    const frames = extractFrames(videoPath, id);
    const meta = await analyzeFrames(frames);
    cleanup(id);
    return { id, meta, sourceUrl: url };
  } catch (e) {
    cleanup(id);
    throw e;
  }
}
