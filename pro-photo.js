#!/usr/bin/env node
// Pro Photo Pipeline — Two-stage: DeepSeek prompt enhancement + Higgsfield generation
// Usage: node pro-photo.js [--engine gpt|nano] [--no-enhance] <image-path> ...
// Or:   Drop images into ~/nanoclaw/pro-photo-inbox/ and they auto-process

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { grokImage, logCall } from './grok-trial.js';
import { falImg2Img, falUpload } from './fal-client.js';
import { createRequire } from 'module';
const genGuard = createRequire(import.meta.url)('./lib/generation-guard.cjs'); // GLOBAL kill-switch

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Config
const INBOX = path.join(__dirname, 'pro-photo-inbox');
const OUTBOX = path.join(__dirname, 'pro-photo-outbox');
dotenv.config({ path: path.join(__dirname, '.env') });
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const CHAT_ID = process.env.PAUL_CHAT_ID || '1912121485';
const POLL_INTERVAL = 5000;

// Default engine: GPT Image 2 (won comparison test 2026-05-14)
// grok = Grok Imagine ($0.02/image) — on paper trial
const DEFAULT_ENGINE = 'gpt_image_2';
const XAI_KEY = process.env.XAI_API_KEY;

// Base prompt — used as fallback when enhancement fails
const BASE_PROMPT = `Color grade only. Contrast +10. Shadows +10. Temperature 5400K. Saturation +5. Vignette -10. Sharpening +60. Clarity +30. Do not change any content in the image.`;

// Enhancement system prompt — turns DeepSeek into a photography director
const ENHANCE_SYSTEM = `You write SHORT color grading instructions for an AI image editor. The AI receives the original photo — it can see everything. Your job is ONLY to describe color/light adjustments using numeric values.

Output ONLY the grading instructions. No explanation.

RULES:
- NEVER describe what is in the image
- NEVER mention subjects, objects, logos, posters, or scene content
- ONLY use Lightroom-style adjustments: exposure, contrast, highlights, shadows, whites, blacks, temperature, tint, vibrance, saturation, clarity, sharpening, vignette, grain
- Keep it under 60 words
- Always include: Sharpening +60, Clarity +30 (minimum)
- Always end with: "Do not change any content in the image."

CONTEXT: Boxing gym photos. Neutral-warm (5200-5600K). Documentary feel. Natural skin tones — never orange.

EXAMPLE OUTPUT:
"Exposure +0.3. Contrast +15. Highlights -20. Shadows +25. Temperature 5400K. Vibrance +10. Clarity +20. Sharpen +40. Subtle vignette -15. Fine grain amount 10. Do not change any content in the image."`;


// Ensure directories exist
if (!fs.existsSync(INBOX)) fs.mkdirSync(INBOX, { recursive: true });
if (!fs.existsSync(OUTBOX)) fs.mkdirSync(OUTBOX, { recursive: true });

async function enhancePrompt(imagePath) {
  if (!DEEPSEEK_API_KEY) {
    console.log('  ⚠️  No DEEPSEEK_API_KEY — using base prompt');
    return BASE_PROMPT;
  }

  const basename = path.basename(imagePath);
  const userMsg = `Filename: ${basename}\nContext: Boxing gym photo from Basic Reflex, Hong Kong. Generate the image enhancement prompt.`;

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: ENHANCE_SYSTEM },
          { role: 'user', content: userMsg }
        ],
        temperature: 0.3,
        max_tokens: 250
      })
    });

    const data = await response.json();
    const enhanced = data.choices?.[0]?.message?.content?.trim();

    if (enhanced && enhanced.length > 50) {
      // Cap at 1000 chars — Higgsfield can choke on very long prompts
      const capped = enhanced.length > 1000 ? enhanced.slice(0, 1000).replace(/\s\S*$/, '') : enhanced;
      console.log(`  🧠 Enhanced prompt (${capped.length} chars${enhanced.length > 800 ? ', capped from ' + enhanced.length : ''})`);
      return capped;
    }

    console.log('  ⚠️  Enhancement too short — using base prompt');
    return BASE_PROMPT;
  } catch (e) {
    console.log(`  ⚠️  Enhancement failed: ${e.message} — using base prompt`);
    return BASE_PROMPT;
  }
}

function sendTelegramPhoto(filePath, caption) {
  try {
    execSync(`curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto" -F chat_id=${CHAT_ID} -F photo=@"${filePath}" -F caption="${caption.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
    console.log(`  📤 Sent to Telegram: ${caption}`);
  } catch (e) {
    // If too large for photo, send as document
    execSync(`curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendDocument" -F chat_id=${CHAT_ID} -F document=@"${filePath}" -F caption="${caption.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
    console.log(`  📤 Sent as document (large file): ${caption}`);
  }
}

async function processImageGrok(imagePath, enhance) {
  const basename = path.basename(imagePath, path.extname(imagePath));
  const outFile = path.join(OUTBOX, `${basename}-grok-pro.png`);

  console.log(`\n🎬 Processing (Grok Imagine): ${path.basename(imagePath)}`);

  // Stage 1: Prompt enhancement
  let prompt;
  if (enhance) {
    console.log('  🧠 Stage 1: DeepSeek prompt enhancement...');
    prompt = await enhancePrompt(imagePath);
  } else {
    prompt = BASE_PROMPT;
  }

  // Stage 2: Grok image generation (text-to-image — no img2img support)
  // Grok Imagine is text-only, so we describe the desired output
  console.log('  ⏳ Stage 2: Generating via Grok Imagine...');

  try {
    const result = await grokImage(prompt);
    if (!result.url) throw new Error('No URL in response');

    console.log(`  ⬇️  Downloading result ($${result.costUsd})...`);
    execSync(`curl -sL "${result.url}" -o "${outFile}"`, { timeout: 60000 });

    const stats = fs.statSync(outFile);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
    console.log(`  ✅ Saved: ${outFile} (${sizeMB}MB) in ${(result.duration / 1000).toFixed(1)}s`);

    const tag = enhance ? 'Enhanced' : 'Standard';
    sendTelegramPhoto(outFile, `Pro Photo (Grok ${tag}): ${basename} — $${result.costUsd}`);

    return outFile;
  } catch (e) {
    console.log(`  ❌ Grok failed: ${e.message}`);
    return null;
  }
}

async function processImageFal(imagePath, enhance, model = 'dev', _manual = false) {
  const basename = path.basename(imagePath, path.extname(imagePath));
  const outFile = path.join(OUTBOX, `${basename}-fal-${model}.png`);

  console.log(`\n🎬 Processing (fal.ai FLUX ${model}): ${path.basename(imagePath)}`);

  // Stage 1: Prompt enhancement
  let prompt;
  if (enhance) {
    console.log('  🧠 Stage 1: DeepSeek prompt enhancement...');
    prompt = await enhancePrompt(imagePath);
  } else {
    prompt = BASE_PROMPT;
  }

  // Stage 2: Upload image + fal img2img
  console.log(`  ⏳ Stage 2: Uploading to fal.ai...`);

  try {
    const imageUrl = await falUpload(imagePath);
    console.log(`  📤 Uploaded. Running FLUX ${model} img2img...`);

    const result = await falImg2Img(imageUrl, prompt, { model, strength: 0.10 });
    if (!result.url) throw new Error('No URL in response');

    console.log(`  ⬇️  Downloading result ($${result.cost})...`);
    execSync(`curl -sL "${result.url}" -o "${outFile}"`, { timeout: 60000 });

    const stats = fs.statSync(outFile);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
    console.log(`  ✅ Saved: ${outFile} (${sizeMB}MB)`);

    const tag = enhance ? 'Enhanced' : 'Standard';
    sendTelegramPhoto(outFile, `Pro Photo (FLUX ${model} ${tag}): ${basename} — $${result.cost}`);

    return outFile;
  } catch (e) {
    console.log(`  ❌ fal.ai failed: ${e.message}`);
    return null;
  }
}

async function processImage(imagePath, engine, enhance, manual = false) {
  // GLOBAL kill-switch — covers ALL engines (grok/fal/higgsfield). Autonomous
  // (watch-mode) calls blocked when paused; CLI passes manual:true.
  try {
    genGuard.assertGenAllowed({ manual });
  } catch (e) {
    console.log(`  🚫 ${e.message} — skipping ${path.basename(imagePath)}`);
    return null;
  }
  // Route to Grok if selected (text-to-image only)
  if (engine === 'grok') {
    return processImageGrok(imagePath, enhance);
  }
  // Route to fal.ai FLUX (img2img retouch — the good stuff)
  if (engine === 'fal' || engine === 'fal-dev') {
    return processImageFal(imagePath, enhance, 'dev', manual);
  }
  if (engine === 'fal-schnell') {
    return processImageFal(imagePath, enhance, 'schnell', manual);
  }

  engine = engine || DEFAULT_ENGINE;
  const engineLabel = engine === 'gpt_image_2' ? 'GPT Image 2' : 'Nano Banana 2';
  const suffix = engine === 'gpt_image_2' ? '-gpt-pro' : '-pro';
  const basename = path.basename(imagePath, path.extname(imagePath));
  const outFile = path.join(OUTBOX, `${basename}${suffix}.png`);

  console.log(`\n🎬 Processing: ${path.basename(imagePath)}`);

  // Stage 1: Prompt enhancement
  let prompt;
  if (enhance) {
    console.log('  🧠 Stage 1: DeepSeek prompt enhancement...');
    prompt = await enhancePrompt(imagePath);
  } else {
    prompt = BASE_PROMPT;
  }

  // Stage 2: Image generation
  console.log(`  ⏳ Stage 2: Generating via ${engineLabel}...`);

  try {
    // Escape prompt for shell
    const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, ' ');

    const result = execSync(
      `higgsfield generate create ${engine} --prompt "${escapedPrompt}" --image "${imagePath}" --aspect_ratio 16:9 --resolution 2k --wait`,
      { encoding: 'utf-8', timeout: 600000 }
    ).trim();

    if (!result.startsWith('http')) {
      console.log(`  ❌ Unexpected result: ${result}`);
      return null;
    }

    console.log('  ⬇️  Downloading result...');
    execSync(`curl -sL "${result}" -o "${outFile}"`, { timeout: 60000 });

    const stats = fs.statSync(outFile);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
    console.log(`  ✅ Saved: ${outFile} (${sizeMB}MB)`);

    const tag = enhance ? 'Enhanced' : 'Standard';
    sendTelegramPhoto(outFile, `Pro Photo (${engineLabel} ${tag}): ${basename} — 16:9 cinematic grade`);

    return outFile;
  } catch (e) {
    console.log(`  ❌ Failed: ${e.message}`);
    return null;
  }
}

// CLI mode — process files passed as arguments
const rawArgs = process.argv.slice(2);
let cliEngine = DEFAULT_ENGINE;
let enhance = true; // Default: ON
const args = [];
for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i] === '--engine' && rawArgs[i + 1]) {
    const val = rawArgs[++i].toLowerCase();
    const engineMap = { gpt: 'gpt_image_2', grok: 'grok', fal: 'fal', 'fal-dev': 'fal-dev', 'fal-schnell': 'fal-schnell', nano: 'nano_banana_2' };
    cliEngine = engineMap[val] || 'fal';
  } else if (rawArgs[i] === '--no-enhance') {
    enhance = false;
  } else {
    args.push(rawArgs[i]);
  }
}

if (args.length > 0 && args[0] !== '--watch') {
  const engineLabel = cliEngine === 'gpt_image_2' ? 'GPT Image 2' : 'Nano Banana 2';
  const enhanceLabel = enhance ? ' + DeepSeek Enhanced' : '';
  console.log(`🎬 Pro Photo Pipeline (${engineLabel}${enhanceLabel}) — Processing ${args.length} image(s)\n`);

  const results = [];
  for (const arg of args) {
    if (fs.existsSync(arg)) {
      const result = await processImage(arg, cliEngine, enhance, true); // CLI = human-triggered
      if (result) results.push(result);
    } else {
      console.log(`⚠️  File not found: ${arg}`);
    }
  }
  console.log(`\n✅ Done. ${results.length}/${args.length} processed.`);
  console.log(`📁 Output: ${OUTBOX}`);
  process.exit(0);
}

// Watch mode — monitor inbox folder
console.log(`\n🎬 Pro Photo Pipeline — Watch Mode (Enhanced + ${DEFAULT_ENGINE === 'gpt_image_2' ? 'GPT Image 2' : 'Nano Banana 2'})`);
console.log(`📥 Inbox:  ${INBOX}`);
console.log(`📤 Outbox: ${OUTBOX}`);
console.log(`\nDrop images into the inbox folder. They'll be processed and sent to Telegram.\n`);

const processed = new Set();

// Check for existing files on startup
for (const f of fs.readdirSync(INBOX)) {
  if (/\.(jpg|jpeg|png|webp)$/i.test(f)) {
    processed.add(f);
  }
}

setInterval(async () => {
  try {
    const files = fs.readdirSync(INBOX).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
    for (const f of files) {
      if (!processed.has(f)) {
        processed.add(f);
        await processImage(path.join(INBOX, f), DEFAULT_ENGINE, true);
      }
    }
  } catch (e) {
    // ignore transient read errors
  }
}, POLL_INTERVAL);
