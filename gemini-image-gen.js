// Gemini Image Generation — REST API (no SDK needed)
// Models: Nano Banana ($0.039), Nano Banana 2 (4K, 14 refs), Nano Banana Pro (best)
// Usage: import { generateImage, editImage, generateWithReferences } from './gemini-image-gen.js'

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createRequire } from 'module';
const genGuard = createRequire(import.meta.url)('./lib/generation-guard.cjs'); // GLOBAL kill-switch

dotenv.config({ path: path.join(process.env.HOME, 'nanoclaw', '.env') });

const API_KEY = process.env.GEMINI_API_KEY;
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

// Models — exact IDs from Google docs (2026-05)
const MODELS = {
  nano_banana: 'gemini-2.5-flash-image',           // $0.039/img, production-ready, 10 aspect ratios
  nano_banana_2: 'gemini-3.1-flash-image-preview',  // 4K, 14 reference images, text rendering
  nano_banana_pro: 'gemini-3-pro-image-preview',    // $0.134+, best quality, advanced reasoning
};

const DEFAULT_MODEL = 'nano_banana';

// Default outbox
const OUTBOX = path.join(process.env.HOME, 'nanoclaw', 'reed-lab', 'gemini-outbox');
if (!fs.existsSync(OUTBOX)) fs.mkdirSync(OUTBOX, { recursive: true });

// Shared POST helper
async function geminiPost(model, body) {
  const url = `${BASE_URL}/models/${model}:generateContent`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': API_KEY,
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gemini ${resp.status}: ${err.slice(0, 300)}`);
  }

  return resp.json();
}

function imageToBase64(imagePath) {
  const buf = fs.readFileSync(imagePath);
  const ext = path.extname(imagePath).toLowerCase();
  const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
  return { data: buf.toString('base64'), mime_type: mimeMap[ext] || 'image/jpeg' };
}

function parseImageResponse(json, outPath) {
  const result = { text: null, imagePath: null, model: null };

  const parts = json.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.text) result.text = part.text;
    // Response uses inlineData (camelCase)
    const inline = part.inlineData || part.inline_data;
    if (inline?.mimeType?.startsWith('image/') || inline?.mime_type?.startsWith('image/')) {
      const mime = inline.mimeType || inline.mime_type;
      const ext = mime === 'image/png' ? '.png' : '.jpg';
      const filename = outPath || path.join(OUTBOX, `gemini-${Date.now()}${ext}`);
      fs.writeFileSync(filename, Buffer.from(inline.data, 'base64'));
      result.imagePath = filename;
    }
  }

  result.model = json.modelVersion || null;
  return result;
}

// Text-to-image
export async function generateImage(prompt, opts = {}) {
  genGuard.assertGenAllowed({ manual: opts.manual === true }); // GLOBAL kill-switch (autonomous default)
  const model = MODELS[opts.model] || MODELS[DEFAULT_MODEL];
  const json = await geminiPost(model, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
  });
  return parseImageResponse(json, opts.outPath);
}

// Image-to-image editing
export async function editImage(imagePath, prompt, opts = {}) {
  genGuard.assertGenAllowed({ manual: opts.manual === true }); // GLOBAL kill-switch (autonomous default)
  const model = MODELS[opts.model] || MODELS[DEFAULT_MODEL];
  const img = imageToBase64(imagePath);
  const json = await geminiPost(model, {
    contents: [{ parts: [
      { text: prompt },
      { inline_data: img }
    ] }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
  });
  return parseImageResponse(json, opts.outPath);
}

// Multi-reference: up to 14 images + prompt (Nano Banana 2 best for this)
export async function generateWithReferences(referenceImages, prompt, opts = {}) {
  genGuard.assertGenAllowed({ manual: opts.manual === true }); // GLOBAL kill-switch (autonomous default)
  const model = MODELS[opts.model] || MODELS.nano_banana_2;
  const parts = [{ text: prompt }];
  for (const imgPath of referenceImages.slice(0, 14)) {
    if (!fs.existsSync(imgPath)) continue;
    parts.push({ inline_data: imageToBase64(imgPath) });
  }

  const json = await geminiPost(model, {
    contents: [{ parts }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
  });
  return parseImageResponse(json, opts.outPath);
}

// Send result to Telegram
export async function sendToTelegram(imagePath, caption) {
  const token = process.env.TELEGRAM_TOKEN;
  const chatId = process.env.PAUL_CHAT_ID || '1912121485';
  if (!token || !imagePath) return;

  const FormData = (await import('form-data')).default;
  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('photo', fs.createReadStream(imagePath));
  if (caption) form.append('caption', caption.slice(0, 1024));

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });
  } catch (err) {
    console.error(`[gemini] Telegram send failed: ${err.message}`);
  }
}

// CLI test
if (process.argv[1] && process.argv[1].endsWith('gemini-image-gen.js') && process.argv.includes('--test')) {
  console.log('Testing Gemini image generation...');
  generateImage('A professional boxing gym in Hong Kong. Five leather heavy bags hanging from chains. Warm golden light through industrial windows. Concrete walls with colorful posters. Cinematic sports documentary photography, 16:9.', {
    model: 'nano_banana'
  }).then(r => {
    console.log('Text:', r.text);
    console.log('Image:', r.imagePath);
    if (r.imagePath) return sendToTelegram(r.imagePath, 'Gemini test — Nano Banana');
  }).catch(err => console.error('Error:', err.message));
}

export { MODELS, OUTBOX, DEFAULT_MODEL };
