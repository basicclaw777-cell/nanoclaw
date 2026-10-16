#!/usr/bin/env node
/**
 * boxing-contact-sheet.js — Gym Eyes: two-pass vision analysis
 *
 * Pass 1 (OBSERVE): DeepSeek vision-exp reads contact sheet → structured JSON
 * Pass 2 (COACH):   LLM interprets observations using Coach Paul's method
 *
 * The vision model is the EYES. The coaching layer is the COACH.
 * DeepSeek never gives boxing advice — it reports what it sees.
 *
 * Usage:
 *   node boxing-contact-sheet.js <video> [--at MM:SS] [--duration 5] [--fps 3] [--dry]
 *
 * Examples:
 *   node boxing-contact-sheet.js ~/boxing-corpus/padwork/noodles1.MOV --at 5:00
 *   node boxing-contact-sheet.js session.mp4 --at 1:30 --duration 8 --fps 4
 *   node boxing-contact-sheet.js clip.mov --dry   # generate sheet only, no API call
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';
import { llmCall } from './llm-fallback.js';

const HOME = process.env.HOME;
const OUTPUT_DIR = join(HOME, 'nanoclaw', 'gym-eyes-sheets');

function loadEnv() {
  try {
    const env = readFileSync(join(HOME, 'nanoclaw', '.env'), 'utf8');
    const key = env.match(/DEEPSEEK_API_KEY=(.+)/)?.[1]?.trim();
    const tgToken = env.match(/TELEGRAM_TOKEN=(.+)/)?.[1]?.trim();
    const tgChat = env.match(/PAUL_CHAT_ID=(.+)/)?.[1]?.trim();
    return { key, tgToken, tgChat };
  } catch { return {}; }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { fps: 3, duration: 5, at: '0:00', dry: false };
  let video = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--at' && args[i + 1]) { opts.at = args[++i]; }
    else if (args[i] === '--duration' && args[i + 1]) { opts.duration = parseFloat(args[++i]); }
    else if (args[i] === '--fps' && args[i + 1]) { opts.fps = parseInt(args[++i]); }
    else if (args[i] === '--dry') { opts.dry = true; }
    else if (!args[i].startsWith('--')) { video = args[i]; }
  }

  if (!video) {
    console.error('Usage: node boxing-contact-sheet.js <video> [--at MM:SS] [--duration 5] [--fps 3] [--dry]');
    process.exit(1);
  }

  const atParts = opts.at.split(':').map(Number);
  opts.atSeconds = atParts.length === 2 ? atParts[0] * 60 + atParts[1] : atParts[0];

  return { video, ...opts };
}

function extractFrames(video, atSeconds, duration, fps, tmpDir) {
  mkdirSync(tmpDir, { recursive: true });

  const existing = readdirSync(tmpDir).filter(f => f.startsWith('cs_frame_'));
  existing.forEach(f => unlinkSync(join(tmpDir, f)));

  const atFormatted = `${Math.floor(atSeconds / 60).toString().padStart(2, '0')}:${(atSeconds % 60).toString().padStart(2, '0')}`;

  execSync(
    `ffmpeg -i "${video}" -ss 00:${atFormatted} -t ${duration} -vf "fps=${fps},scale=640:-1" "${join(tmpDir, 'cs_frame_%03d.jpg')}" -y`,
    { stdio: 'pipe' }
  );

  const frames = readdirSync(tmpDir)
    .filter(f => f.startsWith('cs_frame_') && f.endsWith('.jpg'))
    .sort()
    .map(f => join(tmpDir, f));

  console.log(`Extracted ${frames.length} frames (${fps}fps × ${duration}s from ${atFormatted})`);
  return frames;
}

function buildContactSheet(frames, fps, tmpDir) {
  const scriptDir = fileURLToPath(new URL('.', import.meta.url));
  const outPath = join(tmpDir, 'contact-sheet.jpg');
  const result = execSync(
    `python3 "${join(scriptDir, 'contact-sheet-builder.py')}" '${JSON.stringify(frames)}' ${fps} '${outPath}'`,
    { encoding: 'utf8' }
  ).trim();

  const info = JSON.parse(result);
  console.log(`Contact sheet: ${info.width}×${info.height}, ${info.frames} frames, ${info.size_kb}KB`);
  return outPath;
}

// ── PASS 1: OBSERVE — vision model reports what it sees (structured JSON) ────

const OBSERVER_SYSTEM = `You are a movement observation system analyzing a boxing pad session contact sheet.
The image shows a chronological sequence of frames. Read left-to-right across each row, then continue on the next row. Frame 1 occurs first, the last frame occurs last.

Your ONLY job is to report what you SEE — body positions, movements, changes between frames.
You are NOT a boxing coach. Do NOT give advice, corrections, or opinions.
Report observations as structured JSON.

Analyze movement BETWEEN frames, not just individual frame appearance.

Return ONLY valid JSON (no markdown fences, no commentary):
{
  "people_detected": 2,
  "fighter_stance": "orthodox|southpaw|unclear",
  "segments": [
    {
      "frames": "F1-F5",
      "time": "0.0s-1.3s",
      "observations": {
        "footwork": "description of foot positions and movement",
        "stance_width": "narrow|normal|wide|changing",
        "guard": "description of hand positions",
        "upper_body": "description of torso, shoulders, head",
        "distance": "description of gap between fighter and pad holder",
        "notable": "anything else significant"
      }
    }
  ],
  "transitions": [
    {
      "between": "F5-F6",
      "what_changed": "specific description of what changed"
    }
  ],
  "movement_events": [
    {
      "frames": "F7-F9",
      "type": "punch_preparation|punch_extension|punch_recovery|step|pivot|slip|guard_drop|stance_change|distance_close|distance_open|reset",
      "detail": "specific description"
    }
  ],
  "overall_rhythm": "steady|accelerating|decelerating|burst_then_rest|choppy|fluid"
}`;

async function observeWithVision(sheetPath, apiKey, duration, fps) {
  const b64 = readFileSync(sheetPath).toString('base64');
  const totalFrames = Math.round(duration * fps);

  const payload = {
    model: 'deepseek-v4-flash-vision-exp',
    messages: [
      { role: 'system', content: OBSERVER_SYSTEM },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
          { type: 'text', text: `This contact sheet shows ${totalFrames} frames spanning ${duration} seconds at ${fps}fps. Report what you observe — positions, movements, changes. Structured JSON only.` }
        ]
      }
    ],
    max_tokens: 8000,
    temperature: 0.2
  };

  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const result = await resp.json();
  if (result.error) throw new Error(JSON.stringify(result.error));

  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from vision model');

  const usage = result.usage || {};
  const reasoning = usage.completion_tokens_details?.reasoning_tokens || 0;
  console.log(`[observe] tokens — reasoning: ${reasoning}, total: ${usage.completion_tokens || '?'}`);

  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    console.warn('[observe] response not valid JSON, returning raw text');
    return { raw: content };
  }
}

// ── PASS 2: COACH — interpret observations through Coach Paul's method ───────

const COACH_SYSTEM = `You are interpreting structured movement observations from a boxing pad session.
The observations were generated by a vision system — raw descriptions of what was seen, frame by frame.

Your job: translate these observations into coaching-relevant insights.

For each observation, assess:
1. Is this mechanically significant? (affects power, balance, defence, or efficiency)
2. What is the likely CAUSE? (habit, fatigue, reaction to partner, intentional)
3. What is the CONSEQUENCE if repeated? (power leak, exposure, off-balance, telegraphing)

Output format:
## Sequence Summary
One paragraph: what happened in this window.

## Key Observations
For each significant finding:
- **What:** [the observation]
- **Frames:** [which frames]
- **Significance:** [why it matters mechanically]
- **Pattern or isolated:** [does this look habitual or one-off?]

## Priority
The single most important thing to address from this window, and why.

Be specific. Reference frame numbers. No generic boxing advice — only what the observations support.`;

async function interpretObservations(observations) {
  const prompt = `Here are the structured observations from a pad session contact sheet:\n\n${JSON.stringify(observations, null, 2)}\n\nInterpret these observations. What is coaching-relevant?`;

  const { content, provider } = await llmCall(COACH_SYSTEM, prompt, 1500);
  if (!content) throw new Error('All LLM providers failed for coaching pass');
  if (provider !== 'deepseek') console.log(`[coach] using ${provider} fallback`);
  return content;
}

async function sendTelegram(text, token, chatId) {
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
    });
  } catch {}
}

async function main() {
  const { video, at, atSeconds, duration, fps, dry } = parseArgs();
  const { key, tgToken, tgChat } = loadEnv();

  if (!dry && !key) {
    console.error('DEEPSEEK_API_KEY not found in .env');
    process.exit(1);
  }

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  const tag = basename(video, '.MOV').replace(/\.[^.]+$/, '');
  const timestamp = new Date().toISOString().slice(0, 16).replace(/[:-]/g, '');
  const tmpDir = join(OUTPUT_DIR, `${tag}-${timestamp}`);

  const frames = extractFrames(video, atSeconds, duration, fps, tmpDir);
  if (frames.length === 0) {
    console.error('No frames extracted');
    process.exit(1);
  }

  const sheetPath = buildContactSheet(frames, fps, tmpDir);

  if (dry) {
    console.log(`\nDry run — contact sheet saved to: ${sheetPath}`);
    return;
  }

  // PASS 1: OBSERVE
  console.log('Pass 1: Observing (DeepSeek vision-exp)...');
  const observations = await observeWithVision(sheetPath, key, duration, fps);

  const obsPath = join(tmpDir, 'observations.json');
  writeFileSync(obsPath, JSON.stringify(observations, null, 2));
  console.log(`Observations saved: ${obsPath}`);

  if (observations.raw) {
    console.log('\n=== RAW OBSERVATION (not valid JSON) ===\n');
    console.log(observations.raw);
  } else {
    console.log(`Observed: ${observations.segments?.length || 0} segments, ${observations.movement_events?.length || 0} events, ${observations.transitions?.length || 0} transitions`);
  }

  // PASS 2: COACH
  console.log('\nPass 2: Coaching interpretation...');
  const coaching = await interpretObservations(observations);

  console.log('\n=== COACHING INTERPRETATION ===\n');
  console.log(coaching);

  const reportPath = join(tmpDir, 'analysis.md');
  writeFileSync(reportPath, [
    `# Pad Session Analysis`,
    `- **Video:** ${basename(video)}`,
    `- **Window:** ${at} → +${duration}s`,
    `- **FPS:** ${fps} (${frames.length} frames)`,
    `- **Vision model:** deepseek-v4-flash-vision-exp`,
    `- **Date:** ${new Date().toISOString().slice(0, 10)}`,
    '',
    '## Raw Observations (Pass 1)',
    '',
    '```json',
    JSON.stringify(observations, null, 2),
    '```',
    '',
    '## Coaching Interpretation (Pass 2)',
    '',
    coaching
  ].join('\n'));

  console.log(`\nReport saved: ${reportPath}`);
  console.log(`Contact sheet: ${sheetPath}`);

  const tgText = `👁️ *Gym Eyes — Pad Session*\n\n_${basename(video)} @ ${at} (${duration}s)_\n\n${coaching.slice(0, 3500)}`;
  await sendTelegram(tgText, tgToken, tgChat);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
