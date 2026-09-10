#!/usr/bin/env node
/**
 * gym-eyes-harvest.js — Class Harvester
 *
 * Processes a full class video by sampling multiple 5-second windows,
 * aggregates observations, and produces a structured class record.
 *
 * Two intelligence loops:
 *   Loop 1 (Athlete): What movement patterns appeared?
 *   Loop 2 (Coach):   What was taught, what problems persisted, what's unresolved?
 *
 * Usage:
 *   node gym-eyes-harvest.js <video> [options]
 *
 * Options:
 *   --samples N        Number of 5-second windows to sample (default: 8)
 *   --theme "text"     Class theme (optional, system will infer if missing)
 *   --students N       Number of students (helps interpretation)
 *   --type padwork|group|1on1|drills  (default: group)
 *   --dry              Generate contact sheets only, no API calls
 *   --start MM:SS      Skip to this point (e.g., skip warm-up)
 *   --end MM:SS        Stop at this point
 *
 * Examples:
 *   node gym-eyes-harvest.js ~/boxing-corpus/padwork/noodles1.MOV --samples 6 --type padwork
 *   node gym-eyes-harvest.js class-tuesday.MOV --theme "distance before speed" --students 8
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';
import { llmCall } from './llm-fallback.js';

const HOME = process.env.HOME;
const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url));
const OUTPUT_DIR = join(HOME, 'nanoclaw', 'gym-eyes-classes');
const LEDGER_PATH = join(HOME, 'nanoclaw', 'gym-eyes-ledger.json');

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
  const opts = { samples: 8, theme: null, students: null, type: 'group', dry: false, start: null, end: null };
  let video = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--samples' && args[i + 1]) opts.samples = parseInt(args[++i]);
    else if (args[i] === '--theme' && args[i + 1]) opts.theme = args[++i];
    else if (args[i] === '--students' && args[i + 1]) opts.students = parseInt(args[++i]);
    else if (args[i] === '--type' && args[i + 1]) opts.type = args[++i];
    else if (args[i] === '--start' && args[i + 1]) opts.start = args[++i];
    else if (args[i] === '--end' && args[i + 1]) opts.end = args[++i];
    else if (args[i] === '--dry') opts.dry = true;
    else if (!args[i].startsWith('--')) video = args[i];
  }

  if (!video) {
    console.error('Usage: node gym-eyes-harvest.js <video> [--samples N] [--theme "text"] [--type group|padwork]');
    process.exit(1);
  }
  return { video, ...opts };
}

function getVideoDuration(video) {
  try {
    const out = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${video}"`,
      { encoding: 'utf8' }
    ).trim();
    return parseFloat(out);
  } catch { return 0; }
}

function parseTime(str) {
  if (!str) return null;
  const parts = str.split(':').map(Number);
  return parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0];
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function extractFrames(video, atSeconds, duration, fps, outDir) {
  const atStr = `${Math.floor(atSeconds / 3600).toString().padStart(2, '0')}:${Math.floor((atSeconds % 3600) / 60).toString().padStart(2, '0')}:${Math.floor(atSeconds % 60).toString().padStart(2, '0')}`;

  try {
    execSync(
      `ffmpeg -ss ${atStr} -i "${video}" -t ${duration} -vf "fps=${fps},scale=640:-1" "${join(outDir, 'cs_frame_%03d.jpg')}" -y`,
      { stdio: 'pipe', timeout: 60000 }
    );
  } catch (err) {
    console.log(`  [ffmpeg] frame extraction issue at ${atStr}: ${err.message?.slice(0, 80)}`);
  }

  return readdirSync(outDir)
    .filter(f => f.startsWith('cs_frame_') && f.endsWith('.jpg'))
    .sort()
    .map(f => join(outDir, f));
}

function buildContactSheet(frames, fps, outPath) {
  const result = execSync(
    `python3 "${join(SCRIPT_DIR, 'contact-sheet-builder.py')}" '${JSON.stringify(frames)}' ${fps} '${outPath}'`,
    { encoding: 'utf8' }
  ).trim();
  return JSON.parse(result);
}

const OBSERVER_SYSTEM = `You are a movement observation system analyzing a boxing session contact sheet.
The image shows a chronological sequence of frames. Read left-to-right across each row, then continue on the next row.

Your ONLY job is to report what you SEE. You are NOT a coach. Do NOT give advice.
Report observations as structured JSON.

Return ONLY valid JSON (no markdown fences):
{
  "people_detected": number,
  "activity_type": "padwork|drilling|sparring|movement|rest|instruction|unclear",
  "intensity": "low|medium|high",
  "fighter_stance": "orthodox|southpaw|unclear|multiple",
  "segments": [
    {
      "frames": "F1-F5",
      "time": "0.0s-1.3s",
      "observations": {
        "footwork": "description",
        "stance_width": "narrow|normal|wide|changing",
        "guard": "description",
        "upper_body": "description",
        "distance": "description",
        "notable": "anything significant"
      }
    }
  ],
  "movement_events": [
    {
      "frames": "F7-F9",
      "type": "punch_preparation|punch_extension|punch_recovery|step|pivot|slip|guard_drop|stance_change|distance_close|distance_open|reset|instruction_pause",
      "detail": "description"
    }
  ],
  "overall_rhythm": "steady|accelerating|decelerating|burst_then_rest|choppy|fluid|inactive"
}`;

async function observeWindow(sheetPath, apiKey, windowStart, duration, fps, retries = 2) {
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
          { type: 'text', text: `Contact sheet: ${totalFrames} frames, ${duration}s at ${fps}fps. Window starts at ${formatTime(windowStart)} in the class. Report what you observe.` }
        ]
      }
    ],
    max_tokens: 8000,
    temperature: 0.2
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);

      const resp = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeout);

      const result = await resp.json();
      if (result.error) throw new Error(JSON.stringify(result.error));

      const content = result.choices?.[0]?.message?.content;
      if (!content) throw new Error('Empty vision response');

      const usage = result.usage || {};
      const reasoning = usage.completion_tokens_details?.reasoning_tokens || 0;
      console.log(`  [observe] tokens — reasoning: ${reasoning}, total: ${usage.completion_tokens || '?'}`);

      const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      try { return JSON.parse(cleaned); }
      catch { return { raw: content }; }
    } catch (err) {
      if (attempt < retries) {
        console.log(`  [observe] attempt ${attempt + 1} failed (${err.message}), retrying in 3s...`);
        await new Promise(r => setTimeout(r, 3000));
      } else {
        console.error(`  [observe] all attempts failed: ${err.message}`);
        return { error: err.message, activity_type: 'unclear' };
      }
    }
  }
}

// ── SYNTHESIS: aggregate observations → class record ─────────────────────────

const SYNTHESIZE_SYSTEM = `You are producing a structured class record from multiple observation windows of a boxing session.

You receive observation data from sampled 5-second windows across the class. Each window has a timestamp and structured movement observations.

Produce a class record in this EXACT format:

## Class Summary
One paragraph: what kind of session was this, what was the overall focus.

## Session Timeline
For each distinct phase you can identify from the observations:
- **[START-END]** — **[Phase type]**: [What was happening]
  - Recurring pattern: [if any]
  - Notable: [anything significant]

## Recurring Movement Patterns
List patterns that appeared in MULTIPLE windows (not one-offs):
- **[Pattern]** — seen in windows [list]. [Brief description]

## Unresolved Issues
Patterns that persisted throughout without clear improvement:
- [Pattern]: [evidence from which windows]

## Class Metrics
- Active windows: [N of total]
- Dominant activity: [padwork/drilling/etc]
- Overall intensity: [assessment]
- Rhythm: [assessment]

## Coaching Notes
What a coach should know reviewing this session. What to watch for next time.
Be specific — reference the observation data, not generic boxing advice.`;

async function synthesizeClassRecord(windows, opts, apiKey, retries = 2) {
  const windowSummaries = windows.map(w => ({
    time: formatTime(w.startTime),
    duration: `${w.duration}s`,
    observations: w.observations
  }));

  const context = [
    opts.theme ? `Class theme: ${opts.theme}` : '',
    opts.students ? `Students: ${opts.students}` : '',
    opts.type ? `Session type: ${opts.type}` : '',
    '',
    'Observation data from sampled windows:',
    JSON.stringify(windowSummaries, null, 2)
  ].filter(Boolean).join('\n');

  const payload = {
    model: 'deepseek-v4-flash',
    messages: [
      { role: 'system', content: SYNTHESIZE_SYSTEM },
      { role: 'user', content: context }
    ],
    max_tokens: 8000,
    temperature: 0.3
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);

      const resp = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeout);

      const result = await resp.json();
      if (result.error) throw new Error(JSON.stringify(result.error));

      const content = result.choices?.[0]?.message?.content;
      if (!content) {
        const usage = result.usage || {};
        const reasoning = usage.completion_tokens_details?.reasoning_tokens || 0;
        console.log(`[synthesize] empty output — reasoning used ${reasoning}/${usage.completion_tokens || '?'} tokens, retrying with more headroom`);
        throw new Error('Empty synthesis — all tokens consumed by reasoning');
      }

      const usage = result.usage || {};
      console.log(`[synthesize] tokens — reasoning: ${usage.completion_tokens_details?.reasoning_tokens || 0}, output: ${usage.completion_tokens || '?'}`);
      return content;
    } catch (err) {
      if (attempt < retries) {
        console.log(`[synthesize] attempt ${attempt + 1} failed (${err.message}), retrying in 3s...`);
        await new Promise(r => setTimeout(r, 3000));
      } else {
        console.log('[synthesize] DeepSeek failed, falling back to Ollama...');
        const { content, provider } = await llmCall(SYNTHESIZE_SYSTEM, context, 2000);
        if (!content) throw new Error('All LLM providers failed for synthesis');
        console.log(`[synthesize] using ${provider} fallback`);
        return content;
      }
    }
  }
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

// ── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();
  const { key, tgToken, tgChat } = loadEnv();

  if (!opts.dry && !key) {
    console.error('DEEPSEEK_API_KEY not found in .env');
    process.exit(1);
  }

  const totalDuration = getVideoDuration(opts.video);
  if (!totalDuration) {
    console.error('Could not determine video duration');
    process.exit(1);
  }

  const startSec = parseTime(opts.start) || 0;
  const endSec = parseTime(opts.end) || totalDuration;
  const usableDuration = endSec - startSec;

  console.log(`Video: ${basename(opts.video)} (${formatTime(totalDuration)})`);
  console.log(`Analyzing: ${formatTime(startSec)} → ${formatTime(endSec)} (${formatTime(usableDuration)})`);
  console.log(`Sampling ${opts.samples} windows of 5 seconds each\n`);

  const tag = basename(opts.video).replace(/\.[^.]+$/, '');
  const timestamp = new Date().toISOString().slice(0, 16).replace(/[:-]/g, '');
  const classDir = join(OUTPUT_DIR, `${tag}-${timestamp}`);
  mkdirSync(classDir, { recursive: true });

  // Calculate evenly-spaced sample points
  const windowDuration = 5;
  const fps = 3;
  const spacing = usableDuration / opts.samples;
  const samplePoints = [];
  for (let i = 0; i < opts.samples; i++) {
    const point = startSec + (spacing * i) + (spacing / 2) - (windowDuration / 2);
    samplePoints.push(Math.max(startSec, Math.min(point, endSec - windowDuration)));
  }

  // Process each window
  const windows = [];
  for (let i = 0; i < samplePoints.length; i++) {
    const startTime = samplePoints[i];
    console.log(`Window ${i + 1}/${opts.samples} @ ${formatTime(startTime)}...`);

    const windowDir = join(classDir, `window_${i + 1}`);
    mkdirSync(windowDir, { recursive: true });

    // Clean any existing frames
    try {
      readdirSync(windowDir).filter(f => f.startsWith('cs_frame_')).forEach(f => unlinkSync(join(windowDir, f)));
    } catch {}

    const frames = extractFrames(opts.video, startTime, windowDuration, fps, windowDir);
    if (frames.length === 0) {
      console.log(`  No frames extracted, skipping`);
      continue;
    }

    const sheetPath = join(windowDir, 'contact-sheet.jpg');
    buildContactSheet(frames, fps, sheetPath);

    if (opts.dry) {
      windows.push({ startTime, duration: windowDuration, sheetPath, observations: null });
      continue;
    }

    const observations = await observeWindow(sheetPath, key, startTime, windowDuration, fps);
    writeFileSync(join(windowDir, 'observations.json'), JSON.stringify(observations, null, 2));

    windows.push({ startTime, duration: windowDuration, sheetPath, observations });

    // Rate limit
    await new Promise(r => setTimeout(r, 1000));
  }

  if (opts.dry) {
    console.log(`\nDry run — ${windows.length} contact sheets saved to: ${classDir}`);
    return;
  }

  // Synthesize class record
  console.log('\nSynthesizing class record...');
  const classRecord = await synthesizeClassRecord(windows, opts, key);

  console.log('\n=== CLASS RECORD ===\n');
  console.log(classRecord);

  // Save class record
  const recordPath = join(classDir, 'class-record.md');
  writeFileSync(recordPath, [
    `# Class Record: ${tag}`,
    `- **Date:** ${new Date().toISOString().slice(0, 10)}`,
    `- **Video:** ${basename(opts.video)}`,
    `- **Duration:** ${formatTime(totalDuration)}`,
    `- **Analyzed:** ${formatTime(startSec)} → ${formatTime(endSec)}`,
    `- **Windows sampled:** ${windows.length}`,
    opts.theme ? `- **Theme:** ${opts.theme}` : '',
    opts.students ? `- **Students:** ${opts.students}` : '',
    opts.type ? `- **Type:** ${opts.type}` : '',
    '',
    classRecord
  ].filter(Boolean).join('\n'));

  // Save structured data for the ledger
  const classData = {
    id: `class-${timestamp}`,
    date: new Date().toISOString().slice(0, 10),
    video: basename(opts.video),
    duration: totalDuration,
    theme: opts.theme,
    students: opts.students,
    type: opts.type,
    windowCount: windows.length,
    windows: windows.map(w => ({
      time: formatTime(w.startTime),
      observations: w.observations
    })),
    recordPath
  };

  writeFileSync(join(classDir, 'class-data.json'), JSON.stringify(classData, null, 2));

  // Append to ledger
  const ledger = existsSync(LEDGER_PATH) ? JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) : [];
  ledger.push({
    id: classData.id,
    date: classData.date,
    video: classData.video,
    theme: classData.theme,
    type: classData.type,
    windows: classData.windowCount,
    path: classDir
  });
  writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2));

  console.log(`\nClass record: ${recordPath}`);
  console.log(`Class data: ${join(classDir, 'class-data.json')}`);
  console.log(`Ledger updated: ${LEDGER_PATH}`);

  // Telegram summary
  const tgText = `📋 *Gym Eyes — Class Record*\n\n_${basename(opts.video)} (${formatTime(totalDuration)})_\n${opts.theme ? `Theme: ${opts.theme}\n` : ''}\n${classRecord.slice(0, 3500)}`;
  await sendTelegram(tgText, tgToken, tgChat);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
