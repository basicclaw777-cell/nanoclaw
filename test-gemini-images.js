import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.PAUL_CHAT_ID || '1912121485';
const OUTDIR = '/Users/basicclaw777/nanoclaw/pro-photo-outbox';

// Models to test — cycle through if one is blocked
const IMAGE_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview',
  'nano-banana-pro-preview'
];

// Test battery — one per image type relevant to Cathedral
const tests = [
  {
    name: '1-photo-retouch',
    type: 'img2img',
    imagePath: '/Users/basicclaw777/nanoclaw/reed-lab/reed-sources/gym-empty/4 bags and window wall.jpg',
    prompt: 'Apply a high-end commercial retouch to this photo. Maintain 100% preservation of all subjects, objects, and background. Warm golden sports documentary color grade. Enhanced textures. Subtle vignette. Crisp focus. Natural skin tones. Professional Lightroom grade. Do not add or remove anything.'
  },
  {
    name: '1b-nano-banana-retouch',
    type: 'img2img',
    model: 'nano-banana-pro-preview',
    imagePath: '/Users/basicclaw777/nanoclaw/reed-lab/reed-sources/gym-empty/4 bags and window wall.jpg',
    prompt: 'Apply a high-end commercial retouch to this photo. Maintain 100% preservation of all subjects, objects, and background. Warm golden sports documentary color grade. Enhanced textures. Subtle vignette. Crisp focus. Natural skin tones. Professional Lightroom grade. Do not add or remove anything.'
  },
  {
    name: '2-infographic',
    type: 'text2img',
    prompt: 'Create a clean modern infographic showing "10-Block Boxing Curriculum" with 10 numbered blocks in a vertical flow. Each block has a short label: 1-Stance & Guard, 2-Jab & Cross, 3-Hooks, 4-Uppercuts, 5-Combinations, 6-Defense, 7-Footwork, 8-Counters, 9-Sparring Prep, 10-Fight Ready. Dark background, burgundy (#8B2020) accent color, white text, minimal clean design. Professional quality.'
  },
  {
    name: '3-storyboard',
    type: 'text2img',
    prompt: 'Create a 6-panel storyboard sketch for a boxing gym promotional video. Panels: 1) Wide shot empty gym at dawn, bags hanging still. 2) Close-up hands wrapping. 3) Coach holding pads, boxer throwing jab. 4) Group class in action. 5) Two fighters touching gloves. 6) Gym logo on wall at sunset. Black and white pencil sketch style, cinematic framing, professional storyboard layout.'
  },
  {
    name: '4-character-design',
    type: 'text2img',
    prompt: 'Character design sheet for "Logan" — athletic male, mid-30s, long dreadlocks, wearing black boxing shorts and red hand wraps. Three views: front, side, back. Clean line art with flat color fills. Dark skin, confident stance. Style: graphic novel character sheet. White background. Professional character design for animation.'
  },
  {
    name: '5-logo-design',
    type: 'text2img',
    prompt: 'Design a minimalist logo for "Basic Reflex Boxing" gym. Clean geometric design combining boxing gloves or fist motif with clean typography. Colors: black, white, burgundy (#8B2020). Modern, bold, would work on a t-shirt and a sign. Vector style, flat design, professional logo quality. Show 3 variations.'
  },
  {
    name: '6-illustration',
    type: 'text2img',
    prompt: 'Editorial illustration of a boxer training alone in a small Hong Kong gym at night. Warm overhead lights, heavy bags casting shadows. Ink and watercolor style, loose brushwork, atmospheric. Muted colors with pops of burgundy red. Moody, contemplative, documentary feel. Magazine quality editorial illustration.'
  },
  {
    name: '7-sketch-mockup',
    type: 'text2img',
    prompt: 'Quick concept sketch mockup of a mobile app screen for "Gym Eyes" — an AI boxing coach app. Show: top bar with student name, center shows stick figure pose overlay on camera feed, bottom has punch counter (JAB: 12, CROSS: 8, HOOK: 5) and a big red RECORD button. Pencil sketch on white paper, UI/UX wireframe style, hand-drawn feel.'
  }
];

async function generateGemini(prompt, imagePath = null, model = 'gemini-2.5-flash-image') {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;

  const parts = [];

  if (imagePath) {
    const imgData = fs.readFileSync(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
    parts.push({
      inlineData: {
        mimeType: mimeMap[ext] || 'image/jpeg',
        data: imgData.toString('base64')
      }
    });
  }

  parts.push({ text: prompt });

  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      temperature: 0.8
    }
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000)
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gemini ${resp.status}: ${err.slice(0, 300)}`);
  }

  const data = await resp.json();
  const candidates = data.candidates || [];
  const allParts = candidates[0]?.content?.parts || [];

  // Extract image parts
  const images = allParts.filter(p => p.inlineData?.mimeType?.startsWith('image/'));
  const textParts = allParts.filter(p => p.text).map(p => p.text).join('\n');

  return { images, text: textParts };
}

function sendTelegram(filePath, caption) {
  try {
    execSync(`curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto" -F chat_id=${CHAT_ID} -F photo=@"${filePath}" -F caption="${caption.replace(/"/g, '\\"').slice(0, 200)}"`, { stdio: 'pipe', timeout: 30000 });
  } catch {
    // Try as document if too large
    execSync(`curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendDocument" -F chat_id=${CHAT_ID} -F document=@"${filePath}" -F caption="${caption.replace(/"/g, '\\"').slice(0, 200)}"`, { stdio: 'pipe', timeout: 30000 });
  }
}

// Run all tests
console.log(`Gemini Image Test Battery — ${tests.length} tests\n`);

for (const test of tests) {
  console.log(`\n--- ${test.name} ---`);
  try {
    const model = test.model || 'gemini-2.5-flash-image';
    console.log(`  Model: ${model}`);
    const result = await generateGemini(test.prompt, test.type === 'img2img' ? test.imagePath : null, model);

    if (result.images.length === 0) {
      console.log(`  No image returned. Text: ${result.text.slice(0, 200)}`);
      // Send text response to Telegram
      execSync(`curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage" -F chat_id=${CHAT_ID} -F text="Gemini ${test.name}: No image. Response: ${result.text.slice(0, 300).replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
      continue;
    }

    for (let i = 0; i < result.images.length; i++) {
      const img = result.images[i];
      const ext = img.inlineData.mimeType === 'image/png' ? '.png' : '.jpg';
      const outPath = path.join(OUTDIR, `gemini-${test.name}${i > 0 ? `-${i+1}` : ''}${ext}`);
      fs.writeFileSync(outPath, Buffer.from(img.inlineData.data, 'base64'));
      const sizeMB = (fs.statSync(outPath).size / 1024 / 1024).toFixed(1);
      console.log(`  Saved: ${outPath} (${sizeMB}MB)`);
      sendTelegram(outPath, `Gemini FREE: ${test.name}`);
      console.log(`  Sent to Telegram`);
    }

    if (result.text) console.log(`  Text: ${result.text.slice(0, 100)}`);
  } catch (e) {
    console.log(`  ERROR: ${e.message.slice(0, 200)}`);
  }

  // Small delay between calls
  await new Promise(r => setTimeout(r, 2000));
}

console.log('\n\nDone! Check Telegram for all results.');
