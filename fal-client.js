#!/usr/bin/env node
// fal.ai client with spend tracking and daily cap
// Wraps fal API calls with cost awareness
// Usage: import { falImg2Img, falGenerate, getSpend } from './fal-client.js'

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const FAL_KEY = process.env.FAL_KEY;
const SPEND_FILE = path.join(__dirname, 'vortex_data', 'fal-spend.json');

// Daily spend cap — prevents accidental burns
const DAILY_CAP_USD = 2.00;

// Model costs (approximate, from fal pricing)
const COSTS = {
  'fal-ai/flux/dev/image-to-image': 0.025,
  'fal-ai/flux/schnell/image-to-image': 0.003,
  'fal-ai/flux/dev': 0.025,
  'fal-ai/flux/schnell': 0.003,
  'fal-ai/nano-banana-2/edit': 0.08,
  'fal-ai/kling-video/v2.1/standard/image-to-video': 0.50,
};

function loadSpend() {
  try {
    if (fs.existsSync(SPEND_FILE)) return JSON.parse(fs.readFileSync(SPEND_FILE, 'utf8'));
  } catch {}
  return { daily: {}, total: 0, calls: [] };
}

function saveSpend(spend) {
  fs.writeFileSync(SPEND_FILE, JSON.stringify(spend, null, 2));
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function checkBudget(estimatedCost) {
  const spend = loadSpend();
  const today = todayKey();
  const todaySpend = spend.daily[today] || 0;

  if (todaySpend + estimatedCost > DAILY_CAP_USD) {
    throw new Error(`Daily fal.ai cap reached: $${todaySpend.toFixed(2)}/$${DAILY_CAP_USD} spent today. Reset tomorrow.`);
  }
  return true;
}

function logSpend(model, cost) {
  const spend = loadSpend();
  const today = todayKey();
  spend.daily[today] = (spend.daily[today] || 0) + cost;
  spend.total += cost;
  spend.calls.push({ ts: new Date().toISOString(), model, cost });
  // Keep last 200 calls
  if (spend.calls.length > 200) spend.calls = spend.calls.slice(-200);
  saveSpend(spend);
}

async function falCall(endpoint, body) {
  const cost = COSTS[endpoint] || 0.05; // default estimate if unknown
  checkBudget(cost);

  const resp = await fetch(`https://fal.run/${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${FAL_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000)
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => '');
    throw new Error(`fal.ai ${resp.status}: ${err.slice(0, 300)}`);
  }

  const data = await resp.json();
  logSpend(endpoint, cost);
  return data;
}

// img2img retouch — the main use case replacing Higgsfield
export async function falImg2Img(imageUrl, prompt, { model = 'dev', strength = 0.45 } = {}) {
  const endpoint = model === 'schnell'
    ? 'fal-ai/flux/schnell/image-to-image'
    : 'fal-ai/flux/dev/image-to-image';

  const result = await falCall(endpoint, {
    image_url: imageUrl,
    prompt,
    strength,
    num_inference_steps: 28,
    guidance_scale: 3.5,
    num_images: 1,
    image_size: 'landscape_16_9',
    enable_safety_checker: false
  });

  const url = result.images?.[0]?.url;
  if (!url) throw new Error('No image URL in fal response');

  return {
    url,
    model: endpoint,
    cost: COSTS[endpoint] || 0.025
  };
}

// Text-to-image generation
export async function falGenerate(prompt, { model = 'dev', size = 'landscape_16_9' } = {}) {
  const endpoint = model === 'schnell' ? 'fal-ai/flux/schnell' : 'fal-ai/flux/dev';

  const result = await falCall(endpoint, {
    prompt,
    num_images: 1,
    image_size: size,
    enable_safety_checker: false
  });

  const url = result.images?.[0]?.url;
  if (!url) throw new Error('No image URL in fal response');

  return {
    url,
    model: endpoint,
    cost: COSTS[endpoint] || 0.025
  };
}

// Get spending summary
export function getSpend() {
  const spend = loadSpend();
  const today = todayKey();
  const todaySpend = spend.daily[today] || 0;
  const remaining = DAILY_CAP_USD - todaySpend;

  // Last 7 days
  const weekTotal = Object.entries(spend.daily)
    .filter(([d]) => {
      const diff = (Date.now() - new Date(d).getTime()) / 86400000;
      return diff <= 7;
    })
    .reduce((s, [, v]) => s + v, 0);

  return {
    today: todaySpend,
    remaining,
    cap: DAILY_CAP_USD,
    week: weekTotal,
    allTime: spend.total,
    callCount: spend.calls.length
  };
}

// Convert local file to base64 data URL (fal.ai accepts these directly — no upload needed)
export async function falUpload(filePath) {
  const fileData = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
  const contentType = mimeTypes[ext] || 'image/jpeg';
  return `data:${contentType};base64,${fileData.toString('base64')}`;
}

// CLI
if (process.argv[1] && process.argv[1].includes('fal-client')) {
  const cmd = process.argv[2];
  if (cmd === 'spend' || !cmd) {
    const s = getSpend();
    console.log(`fal.ai SPEND TRACKER`);
    console.log(`  Today: $${s.today.toFixed(3)} / $${s.cap} cap ($${s.remaining.toFixed(3)} remaining)`);
    console.log(`  This week: $${s.week.toFixed(3)}`);
    console.log(`  All time: $${s.allTime.toFixed(3)} (${s.callCount} calls)`);
  } else if (cmd === 'cap') {
    console.log(`Daily cap: $${DAILY_CAP_USD}. Edit DAILY_CAP_USD in fal-client.js to change.`);
  }
}
