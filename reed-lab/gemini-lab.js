// Reed Gemini Lab — Autonomous image generation via Gemini API
// Runs while Higgsfield credits are exhausted (or alongside)
// Uses image curator for smart source selection
// Free tier: 500 images/day on Nano Banana

import fs from 'fs';
import path from 'path';
import { generateImage, editImage, generateWithReferences, sendToTelegram, MODELS, OUTBOX } from '../gemini-image-gen.js';
import { pickImage, pickDiverseSet, recordResult, scanSources, getStats } from './image-curator.js';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.env.HOME, 'nanoclaw', '.env') });

const LOG_PATH = path.join(process.env.HOME, 'nanoclaw', 'reed-lab', 'gemini-log.json');
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.PAUL_CHAT_ID || '1912121485';

// Reed's proven style recipes — adapted for Gemini
const STYLES = {
  pro_photo: {
    name: 'Pro Photo',
    prompt: 'Apply a high-end commercial retouch to this boxing gym photograph. Maintain 100% preservation of subject identity, poses, clothing, and all background elements. Sony A7R V, 70mm lens, deep crisp focus throughout. Soft directional key light from camera-left. Warm golden sports documentary color grade, neutral 5200-5600K. Enhance leather and wood textures. Natural skin tones. No hallucinations.',
    mode: 'img2img'
  },
  dramatic_cinema: {
    name: 'Dramatic Cinema',
    prompt: 'Dramatic cinematic reimagining of this boxing gym scene. Volumetric haze and atmospheric fog. Golden god rays streaming through windows. Heavy chiaroscuro lighting. Film grain texture. Backlit silhouette depth. Sports documentary cinematography at golden hour. Preserve all subjects exactly.',
    mode: 'img2img'
  },
  noir: {
    name: 'Film Noir',
    prompt: 'Convert to pure black and white film noir. Deep inky shadows, single harsh overhead light creating dramatic pools. 1940s fight night atmosphere. High contrast, minimal midtones. Film grain. Smoky atmosphere. Preserve subject identity and pose exactly.',
    mode: 'img2img'
  },
  manga: {
    name: 'Manga',
    prompt: 'Convert this photograph into detailed manga illustration. Warm sepia and earth tones with golden light rays. Ink-style cross-hatching and clean linework. Preserve all architectural details and equipment. Professional manga environment art quality.',
    mode: 'img2img'
  },
  hk_neon: {
    name: 'HK Neon',
    prompt: 'Transform into Hong Kong cyberpunk atmosphere. Neon signs reflecting off surfaces in pink, blue, and amber. Chinese characters glowing on walls. Atmospheric fog catching neon light. Dark moody shadows with electric color pops. Blade Runner meets boxing gym.',
    mode: 'img2img'
  },
  generative_gym: {
    name: 'Generative Gym',
    prompt: 'Professional boxing gym in Hong Kong. Five Lonsdale leather heavy bags hanging from chains. Concrete walls with colorful BASIC REFLEX posters and murals. Golden light streaming through industrial windows onto wood floor. Warm, inviting, authentic. Sports documentary photography. 16:9 cinematic.',
    mode: 'text2img'
  },
  generative_atmosphere: {
    name: 'Gym Atmosphere',
    prompt: 'Empty boxing gym at golden hour. Dust particles floating through warm light beams. Heavy bags as dark silhouettes against bright windows. Wood floor reflecting amber light. The quiet between rounds. Cinematic sports photography.',
    mode: 'text2img'
  },
  multi_ref_style: {
    name: 'Multi-Ref Style Transfer',
    prompt: 'Create a new high-quality boxing gym photograph that captures the visual style, lighting, and atmosphere shown in these reference images. Cinematic sports documentary feel. Warm golden tones. Professional editorial quality. 16:9.',
    mode: 'multi_ref'
  }
};

const STYLE_KEYS = Object.keys(STYLES);

function loadLog() {
  if (fs.existsSync(LOG_PATH)) return JSON.parse(fs.readFileSync(LOG_PATH, 'utf-8'));
  return [];
}

function saveLog(log) {
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
}

async function sendTg(text) {
  if (!TELEGRAM_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'Markdown' })
    });
  } catch {}
}

// Grade based on file existence + size (basic quality proxy)
function autoGrade(result) {
  if (!result.imagePath || !fs.existsSync(result.imagePath)) return 'D';
  const size = fs.statSync(result.imagePath).size;
  if (size > 1500000) return 'A';  // > 1.5MB = high detail
  if (size > 500000) return 'B';   // > 500KB = decent
  if (size > 100000) return 'C';   // > 100KB = low quality
  return 'D';
}

async function runGeneration(styleKey, sourceImage) {
  const style = STYLES[styleKey];
  const startMs = Date.now();
  let result;

  try {
    if (style.mode === 'img2img' && sourceImage) {
      result = await editImage(sourceImage, style.prompt, { model: 'nano_banana' });
    } else if (style.mode === 'multi_ref') {
      const refs = pickDiverseSet(3);
      if (refs.length < 2) {
        result = await generateImage(style.prompt, { model: 'nano_banana' });
      } else {
        result = await generateWithReferences(refs, style.prompt, { model: 'nano_banana_2' });
      }
    } else {
      result = await generateImage(style.prompt, { model: 'nano_banana' });
    }
  } catch (err) {
    console.error(`[gemini-lab] ${style.name} failed: ${err.message}`);
    return { success: false, error: err.message, styleKey, duration_ms: Date.now() - startMs };
  }

  const grade = autoGrade(result);
  const duration_ms = Date.now() - startMs;

  // Record quality feedback to curator
  if (sourceImage) recordResult(sourceImage, grade);

  // Send to Telegram
  if (result.imagePath) {
    await sendToTelegram(result.imagePath, `Reed Gemini Lab: ${style.name} [${grade}]${sourceImage ? '\nSource: ' + path.basename(sourceImage) : ''}`);
  }

  return {
    success: true,
    styleKey,
    styleName: style.name,
    mode: style.mode,
    model: 'nano_banana',
    sourceImage: sourceImage ? path.basename(sourceImage) : null,
    output: result.imagePath,
    grade,
    duration_ms,
    timestamp: new Date().toISOString()
  };
}

// Main batch run
async function main() {
  console.log('[gemini-lab] Reed Gemini Lab starting...');

  // Scan sources first
  const scanResult = scanSources();
  console.log(`[gemini-lab] Image sources: ${scanResult.total} total (${scanResult.new} new)`);

  const log = loadLog();
  const results = [];

  // Decide batch: 3 img2img + 1 generative + 1 multi-ref = 5 per run
  const imgStyles = STYLE_KEYS.filter(k => STYLES[k].mode === 'img2img');
  const genStyles = STYLE_KEYS.filter(k => STYLES[k].mode === 'text2img');
  const multiStyles = STYLE_KEYS.filter(k => STYLES[k].mode === 'multi_ref');

  // Pick styles — rotate to avoid repetition
  const recentStyles = log.slice(-10).map(e => e.styleKey);
  const freshImg = imgStyles.filter(s => !recentStyles.includes(s));
  const imgBatch = (freshImg.length >= 3 ? freshImg : imgStyles).slice(0, 3);
  const genPick = genStyles[Math.floor(Math.random() * genStyles.length)];
  const multiPick = multiStyles[0];

  console.log(`[gemini-lab] Starting: ${imgBatch.length} img2img + 1 generative + 1 multi-ref. Source pool: ${scanResult.total}`);

  // img2img batch — each with different source
  for (const styleKey of imgBatch) {
    const source = pickImage();
    if (!source) {
      console.log('[gemini-lab] No source images available for img2img');
      break;
    }
    console.log(`[gemini-lab] ${STYLES[styleKey].name} <- ${path.basename(source)}`);
    const r = await runGeneration(styleKey, source);
    results.push(r);
    log.push(r);
    await new Promise(r => setTimeout(r, 2000)); // Rate limit
  }

  // Generative
  console.log(`[gemini-lab] ${STYLES[genPick].name} (text2img)`);
  const genR = await runGeneration(genPick, null);
  results.push(genR);
  log.push(genR);

  await new Promise(r => setTimeout(r, 2000));

  // Multi-reference
  console.log(`[gemini-lab] ${STYLES[multiPick].name} (multi-ref)`);
  const multiR = await runGeneration(multiPick, null);
  results.push(multiR);
  log.push(multiR);

  saveLog(log);

  const successes = results.filter(r => r.success).length;
  const grades = results.filter(r => r.grade).map(r => r.grade).join('');
  console.log(`[gemini-lab] Done. ${successes}/${results.length} successful. Grades: ${grades}`);
  // Only notify Telegram when at least one image succeeded — no spam on full failures
  if (successes > 0) {
    await sendTg(`*Reed Gemini Lab Done*\n${successes}/${results.length} successful\nGrades: ${grades}`);
  }
}

// Continuous mode — run batches with cooldown
async function continuousLoop() {
  const BATCH_INTERVAL = 5 * 60 * 1000; // 5 min between batches
  const MAX_DAILY = 100; // Stay well under 500 free limit
  const BACKOFF_SLEEP = 2 * 60 * 60 * 1000; // 2 hours on repeated failures
  const FAILURE_THRESHOLD = 3; // consecutive failures before long backoff
  let todayCount = 0;
  let lastDate = new Date().toDateString();
  let consecutiveFailures = 0;

  await sendTg('*Reed Gemini Lab — Continuous Mode*');

  while (true) {
    // Reset daily counter at midnight
    const today = new Date().toDateString();
    if (today !== lastDate) { todayCount = 0; lastDate = today; consecutiveFailures = 0; }

    if (todayCount >= MAX_DAILY) {
      console.log(`[gemini-lab] Daily limit reached (${todayCount}). Sleeping until midnight.`);
      const msToMidnight = new Date(new Date().toDateString()).getTime() + 86400000 - Date.now();
      await new Promise(r => setTimeout(r, msToMidnight));
      continue;
    }

    try {
      await main();
      todayCount += 5; // approximate per batch
      consecutiveFailures = 0; // reset on success
    } catch (err) {
      consecutiveFailures++;
      console.error(`[gemini-lab] Batch error (${consecutiveFailures}/${FAILURE_THRESHOLD}): ${err.message}`);

      if (consecutiveFailures >= FAILURE_THRESHOLD) {
        console.log(`[gemini-lab] ${FAILURE_THRESHOLD} consecutive failures. Backing off 2 hours.`);
        await sendTg(`Reed Gemini Lab: ${FAILURE_THRESHOLD} consecutive failures. Sleeping 2 hours.`);
        await new Promise(r => setTimeout(r, BACKOFF_SLEEP));
        consecutiveFailures = 0;
        continue;
      }
    }

    await new Promise(r => setTimeout(r, BATCH_INTERVAL));
  }
}

// Status export
export function getGeminiLabStatus() {
  const log = loadLog();
  const stats = getStats();
  const today = log.filter(e => e.timestamp?.startsWith(new Date().toISOString().slice(0, 10)));
  return {
    totalGenerations: log.length,
    todayGenerations: today.length,
    curatorStats: stats,
    recentGrades: log.slice(-10).map(e => e.grade || '?').join(''),
    outbox: OUTBOX
  };
}

// Entry point
const args = process.argv.slice(2);
if (args.includes('--continuous')) {
  continuousLoop();
} else if (args.includes('--status')) {
  console.log(JSON.stringify(getGeminiLabStatus(), null, 2));
} else {
  main().catch(err => console.error(err));
}

export { main, continuousLoop };
