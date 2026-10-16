#!/usr/bin/env node
// Grok Paper Trial — tracks quality, cost, and reliability vs existing providers
// Like trading paper trial: must prove itself before permanent placement
// Usage: node grok-trial.js [status|log|compare|reset]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const TRIAL_DB = path.join(__dirname, 'vortex_data', 'grok-trial.json');
const XAI_KEY = process.env.XAI_API_KEY;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.PAUL_CHAT_ID || '1912121485';

// Promotion criteria (like trading: prove before permanent)
const CRITERIA = {
  image: {
    minSamples: 20,
    minSuccessRate: 0.90,    // 90% must complete without error
    maxAvgCostUsd: 0.03,     // under 3 cents average
    minQualityScore: 3.0,    // Paul rates 1-5, need 3+ average
    description: 'Grok Imagine for image generation'
  },
  video: {
    minSamples: 10,
    minSuccessRate: 0.80,
    maxAvgCostUsd: 0.50,
    minQualityScore: 3.0,
    description: 'Grok Imagine Video for video generation'
  },
  llm: {
    minSamples: 30,
    minSuccessRate: 0.95,
    maxAvgCostUsd: 0.01,     // per call
    minQualityScore: 3.5,    // higher bar — replacing DeepSeek
    description: 'Grok 4.3 for agent LLM calls'
  }
};

function loadTrial() {
  if (fs.existsSync(TRIAL_DB)) return JSON.parse(fs.readFileSync(TRIAL_DB, 'utf8'));
  return {
    started: new Date().toISOString(),
    image: { calls: [], ratings: [], errors: 0, totalCostUsd: 0 },
    video: { calls: [], ratings: [], errors: 0, totalCostUsd: 0 },
    llm: { calls: [], ratings: [], errors: 0, totalCostUsd: 0 },
    promoted: { image: false, video: false, llm: false }
  };
}

function saveTrial(trial) {
  fs.writeFileSync(TRIAL_DB, JSON.stringify(trial, null, 2));
}

// Log a generation call
export function logCall(type, { success, costUsd, prompt, model, duration, metadata }) {
  const trial = loadTrial();
  const bucket = trial[type];
  if (!bucket) return;

  bucket.calls.push({
    ts: new Date().toISOString(),
    success,
    costUsd: costUsd || 0,
    prompt: (prompt || '').slice(0, 100),
    model,
    duration,
    ...metadata
  });

  if (!success) bucket.errors++;
  bucket.totalCostUsd += (costUsd || 0);

  // Keep last 100 calls
  if (bucket.calls.length > 100) bucket.calls = bucket.calls.slice(-100);

  saveTrial(trial);
  checkPromotion(trial, type);
}

// Log Paul's quality rating
export function logRating(type, score, notes) {
  const trial = loadTrial();
  const bucket = trial[type];
  if (!bucket) return;

  bucket.ratings.push({
    ts: new Date().toISOString(),
    score,
    notes
  });

  saveTrial(trial);
  checkPromotion(trial, type);
}

function checkPromotion(trial, type) {
  const bucket = trial[type];
  const criteria = CRITERIA[type];
  if (!criteria || trial.promoted[type]) return;

  const totalCalls = bucket.calls.length;
  if (totalCalls < criteria.minSamples) return;

  const successRate = (totalCalls - bucket.errors) / totalCalls;
  const avgCost = bucket.totalCostUsd / totalCalls;
  const avgQuality = bucket.ratings.length > 0
    ? bucket.ratings.reduce((s, r) => s + r.score, 0) / bucket.ratings.length
    : 0;

  const passed = {
    samples: totalCalls >= criteria.minSamples,
    success: successRate >= criteria.minSuccessRate,
    cost: avgCost <= criteria.maxAvgCostUsd,
    quality: bucket.ratings.length >= 5 && avgQuality >= criteria.minQualityScore
  };

  if (Object.values(passed).every(Boolean)) {
    trial.promoted[type] = new Date().toISOString();
    saveTrial(trial);
    sendTelegram(`GROK PROMOTED: ${type}\n${criteria.description}\n\n${totalCalls} samples, ${(successRate * 100).toFixed(0)}% success, $${avgCost.toFixed(4)} avg cost, ${avgQuality.toFixed(1)}/5 quality\n\nNow permanent. Old provider can be retired.`);
  }
}

// Grok API wrappers with trial logging
export async function grokImage(prompt, { quality = false } = {}) {
  const model = quality ? 'grok-imagine-image-quality' : 'grok-imagine-image';
  const start = Date.now();

  try {
    const resp = await fetch('https://api.x.ai/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${XAI_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model, prompt, n: 1, response_format: 'url' })
    });

    const data = await resp.json();
    if (data.error) throw new Error(data.error);

    const url = data.data?.[0]?.url;
    const costUsd = quality ? 0.07 : 0.02;
    const duration = Date.now() - start;

    logCall('image', { success: true, costUsd, prompt, model, duration });
    return { url, costUsd, model, duration };
  } catch (e) {
    logCall('image', { success: false, costUsd: 0, prompt, model, duration: Date.now() - start, metadata: { error: e.message } });
    throw e;
  }
}

export async function grokVideo(prompt) {
  const model = 'grok-imagine-video';
  const start = Date.now();

  try {
    // Submit
    const resp = await fetch('https://api.x.ai/v1/videos/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${XAI_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model, prompt })
    });

    const submitData = await resp.json();
    if (submitData.error) throw new Error(submitData.error);
    const requestId = submitData.request_id;

    // Poll
    let result;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const poll = await fetch(`https://api.x.ai/v1/videos/${requestId}`, {
        headers: { 'Authorization': `Bearer ${XAI_KEY}` }
      });
      result = await poll.json();
      if (result.status === 'done') break;
      if (result.status === 'failed') throw new Error('Video generation failed');
    }

    if (result?.status !== 'done') throw new Error('Video generation timed out');

    const url = result.video?.url;
    const costUsd = 0.40; // estimated from tick value
    const duration = Date.now() - start;

    logCall('video', { success: true, costUsd, prompt, model, duration });
    return { url, costUsd, model, duration, videoDuration: result.video?.duration };
  } catch (e) {
    logCall('video', { success: false, costUsd: 0, prompt, model, duration: Date.now() - start, metadata: { error: e.message } });
    throw e;
  }
}

export async function grokChat(messages, { model = 'grok-4.20-0309-non-reasoning', maxTokens = 500 } = {}) {
  const start = Date.now();

  try {
    const resp = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${XAI_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens })
    });

    const data = await resp.json();
    if (data.error) throw new Error(data.error?.message || data.error);

    const content = data.choices?.[0]?.message?.content;
    const tokens = data.usage?.total_tokens || 0;
    // Rough cost estimate: ~$3/M input, $15/M output for grok-4.3
    const costUsd = tokens * 0.000005;
    const duration = Date.now() - start;

    logCall('llm', { success: true, costUsd, prompt: messages[messages.length - 1]?.content, model, duration, metadata: { tokens } });
    return { content, tokens, costUsd, model, duration };
  } catch (e) {
    logCall('llm', { success: false, costUsd: 0, prompt: messages[messages.length - 1]?.content, model, duration: Date.now() - start, metadata: { error: e.message } });
    throw e;
  }
}

function sendTelegram(text) {
  try {
    execSync(`curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage" -d chat_id=${CHAT_ID} --data-urlencode "text=${text}"`, { stdio: 'pipe' });
  } catch {}
}

function getStatus() {
  const trial = loadTrial();
  const lines = [`GROK PAPER TRIAL — started ${trial.started.slice(0, 10)}\n`];

  for (const [type, criteria] of Object.entries(CRITERIA)) {
    const b = trial[type];
    const total = b.calls.length;
    const successRate = total > 0 ? ((total - b.errors) / total * 100).toFixed(0) : '0';
    const avgCost = total > 0 ? (b.totalCostUsd / total).toFixed(4) : '0';
    const avgQuality = b.ratings.length > 0
      ? (b.ratings.reduce((s, r) => s + r.score, 0) / b.ratings.length).toFixed(1)
      : 'no ratings';
    const promoted = trial.promoted[type];

    lines.push(`${type.toUpperCase()} ${promoted ? 'PROMOTED ' + promoted.slice(0, 10) : 'ON TRIAL'}`);
    lines.push(`  Calls: ${total}/${criteria.minSamples} needed`);
    lines.push(`  Success: ${successRate}% (need ${criteria.minSuccessRate * 100}%)`);
    lines.push(`  Avg cost: $${avgCost} (max $${criteria.maxAvgCostUsd})`);
    lines.push(`  Quality: ${avgQuality} (need ${criteria.minQualityScore}/5, ${b.ratings.length} ratings)`);
    lines.push(`  Total spend: $${b.totalCostUsd.toFixed(2)}`);
    lines.push('');
  }

  return lines.join('\n');
}

// CLI
const cmd = process.argv[2];
if (cmd === 'status' || !cmd) {
  console.log(getStatus());
} else if (cmd === 'reset') {
  if (fs.existsSync(TRIAL_DB)) fs.unlinkSync(TRIAL_DB);
  console.log('Trial reset.');
} else if (cmd === 'compare') {
  const trial = loadTrial();
  console.log('COST COMPARISON:');
  console.log(`  Higgsfield Ultra: $84/mo flat (was burning credits)` );
  console.log(`  Grok images: $${trial.image.totalCostUsd.toFixed(2)} for ${trial.image.calls.length} images`);
  console.log(`  Grok videos: $${trial.video.totalCostUsd.toFixed(2)} for ${trial.video.calls.length} videos`);
  console.log(`  Grok LLM: $${trial.llm.totalCostUsd.toFixed(2)} for ${trial.llm.calls.length} calls`);
  console.log(`  TOTAL: $${(trial.image.totalCostUsd + trial.video.totalCostUsd + trial.llm.totalCostUsd).toFixed(2)}`);
}
