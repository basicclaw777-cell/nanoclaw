#!/usr/bin/env node
// Pro Photo Pipeline — Two-stage: DeepSeek prompt enhancement + Higgsfield generation
// Usage: node pro-photo.js [--engine gpt|nano] [--no-enhance] <image-path> ...
// Or:   Drop images into ~/nanoclaw/pro-photo-inbox/ and they auto-process

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

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
const DEFAULT_ENGINE = 'gpt_image_2';

// Base prompt — used as fallback when enhancement fails
const BASE_PROMPT = `Apply a high-end commercial retouch to the attached image. Maintain 100% exact preservation of subject identity, poses, clothing, and all background elements. Strictly 16:9 cinematic aspect ratio. Camera Profile: Sony A7R V with 70mm lens; zero background blur; deep, crisp focus throughout. Lighting: Add a soft, directional key light from camera-left; diminish harsh overhead ceiling lights. Aesthetic: Premium sports documentary color grade with neutral-to-warm tones and natural skin tones. Enhance micro-contrast on leather textures and skin without smoothing. No hallucinations; do not add or remove objects. Final output must look like a professional Lightroom/Capture One grade of the original raw file.`;

// Enhancement system prompt — turns DeepSeek into a photography director
const ENHANCE_SYSTEM = `You are a professional colorist and lighting director. You create image GRADING prompts for an AI image-to-image model.

CRITICAL: This is a RETOUCH, not a recreation. The model receives the original photo. Your prompt must ONLY describe how to grade, light, and texture the existing image. Do NOT describe what is in the photo. Do NOT describe subjects, poses, actions, or scene content. The model can already see the image.

Output ONLY the prompt text. No explanation, no preamble.

YOUR PROMPT MUST START WITH:
"Apply a high-end commercial retouch to the attached image. Maintain 100% exact preservation of all subjects, poses, clothing, objects, text, and background elements. Do not add, remove, or alter any content. Do not hallucinate new elements. Strictly 16:9 cinematic aspect ratio."

THEN ADD (100-150 words):
1. Camera simulation: specific lens (50-85mm), f-stop, sensor, depth of field behaviour
2. Lighting adjustment: how to reshape existing light — key direction, fill reduction, rim light enhancement, practical light treatment. Do NOT invent new light sources that aren't plausible in a gym.
3. Color science: specific grade direction — lift/gamma/gain, color temperature shift, skin tone treatment, shadow hue
4. Texture: micro-contrast on leather/metal/skin without smoothing, grain structure
5. Tonal range: black point, highlight rolloff, midtone density

CONTEXT: Boxing gym photos. Warm, gritty, documentary. ESPN/Magnum feel, not Instagram.`;

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
      // Cap at 800 chars — Higgsfield can choke on very long prompts
      const capped = enhanced.length > 800 ? enhanced.slice(0, 800).replace(/\s\S*$/, '') : enhanced;
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

async function processImage(imagePath, engine, enhance) {
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
    cliEngine = val === 'gpt' ? 'gpt_image_2' : 'nano_banana_2';
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
      const result = await processImage(arg, cliEngine, enhance);
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
