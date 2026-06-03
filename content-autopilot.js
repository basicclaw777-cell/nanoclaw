// content-autopilot.js — Bridge: idea queue → visual + caption → Telegram ready-to-post
// ESM module
// Runs after idea-engine (2:30am HKT cron)
// Picks queued Instagram ideas, generates visual via Reed, writes caption via Maya voice
// Delivers complete ready-to-post package to Telegram

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const genGuard = createRequire(import.meta.url)('./lib/generation-guard.cjs'); // GLOBAL kill-switch

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME;

// Load env
const envFile = fs.readFileSync(path.join(HOME, 'nanoclaw', '.env'), 'utf-8');
const TOKEN = envFile.match(/TELEGRAM_TOKEN=(.+)/)?.[1]?.trim();
const CHAT_ID = envFile.match(/PAUL_CHAT_ID=(.+)/)?.[1]?.trim();
const DEEPSEEK_KEY = envFile.match(/DEEPSEEK_API_KEY=(.+)/)?.[1]?.trim();
const API = `https://api.telegram.org/bot${TOKEN}`;

const QUEUE_PATH = path.join(__dirname, 'content-studio', 'content-queue.json');
const READY_DIR = path.join(__dirname, 'content-autopilot', 'ready');
const STATE_PATH = path.join(__dirname, 'content-autopilot', 'state.json');
const LOG_PATH = path.join(__dirname, 'content-autopilot', 'log.jsonl');

const GYM_PHOTOS = path.join(HOME, 'Downloads', 'gym images -basic reflex');
const CALIBRATION = path.join(HOME, 'Downloads', 'upgraded standard');

const MAX_PER_RUN = 2;

// Ensure dirs
for (const d of [READY_DIR, path.dirname(STATE_PATH)]) {
  fs.mkdirSync(d, { recursive: true });
}

function loadJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

function saveJSON(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function appendLog(entry) {
  fs.appendFileSync(LOG_PATH, JSON.stringify({ ...entry, timestamp: new Date().toISOString() }) + '\n');
}

// ── Source Photo Selection ──────────────────────────────────────────────────

function pickSourcePhoto(idea) {
  const text = `${idea.idea} ${idea.hook || ''} ${idea.format || ''}`.toLowerCase();
  const isGenerative = text.includes('logan') || text.includes('soul') || text.includes('silhouette');

  if (isGenerative) return null; // Will use generative pipeline

  // Prefer gym photos for atmosphere/training content
  const gymFiles = safeReadDir(GYM_PHOTOS).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
  const calFiles = safeReadDir(CALIBRATION).filter(f => f.startsWith('origonal') || f.startsWith('origional'));

  const pool = [...gymFiles.map(f => path.join(GYM_PHOTOS, f)), ...calFiles.map(f => path.join(CALIBRATION, f))];
  if (pool.length === 0) return null;

  // Track used photos to avoid repeats
  const state = loadJSON(STATE_PATH) || { usedPhotos: [], processedIds: [] };
  const unused = pool.filter(p => !state.usedPhotos.includes(path.basename(p)));
  const pick = unused.length > 0 ? unused[Math.floor(Math.random() * unused.length)] : pool[Math.floor(Math.random() * pool.length)];

  state.usedPhotos.push(path.basename(pick));
  if (state.usedPhotos.length > 40) state.usedPhotos = state.usedPhotos.slice(-20);
  saveJSON(STATE_PATH, state);

  return pick;
}

function safeReadDir(dir) {
  try { return fs.readdirSync(dir); } catch { return []; }
}

// ── Visual Generation ───────────────────────────────────────────────────────

function pickRecipe(idea) {
  const format = (idea.format || '').toLowerCase();
  const isReel = format.includes('reel') || format.includes('story') || format.includes('9:16');
  const isSquare = format.includes('square') || format.includes('carousel');

  if (isReel) {
    return {
      model: 'nano_banana_2', aspect: '9:16',
      prompt: 'Film noir boxing photograph. Pure black and white with deep inky shadows. 1940s fight night atmosphere. Single harsh overhead light. Film grain, smoky atmosphere. Preserve subject identity and pose exactly. Vertical composition for mobile viewing. High contrast.'
    };
  }

  // Rotate between proven styles
  const styles = [
    {
      model: 'nano_banana_2', aspect: '16:9',
      prompt: 'Apply a high-end commercial retouch. Maintain 100% preservation of subject identity, poses, clothing, and all background elements. 16:9 cinematic. Sony A7R V, 70mm lens, deep crisp focus. Soft directional key light. Warm golden sports documentary color grade. Natural skin tones. Professional Lightroom grade.'
    },
    {
      model: 'nano_banana_2', aspect: '16:9',
      prompt: 'Dramatic cinematic reimagining. Volumetric haze and atmospheric fog. Golden god rays streaming through windows. Heavy chiaroscuro lighting with deep shadows. Film grain texture. Preserve subject identity and pose. Boxing gym atmosphere. Sports documentary cinematography.'
    },
    {
      model: 'nano_banana_2', aspect: '16:9',
      prompt: 'Hong Kong cyberpunk boxing gym. Neon signs reflecting off rain-slicked floors in pink, blue, and amber. Chinese characters glowing on walls. Atmospheric fog catching neon light. Dark moody shadows. Preserve subject identity and pose. Cinematic anamorphic feel.'
    }
  ];

  return styles[Math.floor(Math.random() * styles.length)];
}

function generateVisual(sourcePhoto, recipe) {
  // GLOBAL kill-switch — autonomous autopilot; block and skip cleanly when paused.
  try {
    genGuard.assertGenAllowed(); // autonomous (manual:false)
  } catch (e) {
    console.error(`[autopilot] 🚫 ${e.message} — skipping visual`);
    return null;
  }
  if (!sourcePhoto) {
    // Generative — gym atmosphere
    const cmd = `higgsfield generate create nano_banana_2 --prompt "${recipe.prompt}" --aspect_ratio ${recipe.aspect} --resolution 2k --wait`;
    try {
      const result = execSync(cmd, { encoding: 'utf-8', timeout: 600000 }).trim();
      if (result.startsWith('http')) return result;
      return null;
    } catch (err) {
      console.error('[autopilot] Generative failed:', err.message.slice(0, 100));
      return null;
    }
  }

  // Image-to-image
  const cmd = `higgsfield generate create ${recipe.model} --prompt "${recipe.prompt}" --image "${sourcePhoto}" --aspect_ratio ${recipe.aspect} --resolution 2k --wait`;
  try {
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 600000 }).trim();
    if (result.startsWith('http')) return result;
    return null;
  } catch (err) {
    console.error('[autopilot] Generation failed:', err.message.slice(0, 100));
    return null;
  }
}

// ── Caption Generation (Maya voice) ─────────────────────────────────────────

async function generateCaption(idea) {
  if (!DEEPSEEK_KEY) {
    return { caption: idea.hook || idea.idea, hashtags: '#basicreflex #boxing #hongkong' };
  }

  const prompt = `You are Maya, social media manager for Basic Reflex boxing gym in Hong Kong. Coach Paul is the owner — authentic, principle-based, never salesy.

Write an Instagram caption for this content idea:
IDEA: ${idea.idea}
HOOK: ${idea.hook || 'none'}
FORMAT: ${idea.format || 'post'}
PLATFORM: Instagram

Rules:
- Voice: warm, genuine, celebrates the boxing journey
- Never sound like AI or corporate
- Keep it punchy — 2-4 short paragraphs max
- End with a call to action (try a class, DM us, tag a friend)
- Include 8-12 relevant hashtags on a separate line

Output format:
CAPTION:
[your caption here]

HASHTAGS:
[hashtags on one line]`;

  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'You write Instagram captions for a Hong Kong boxing gym. Voice: authentic, warm, concise. Never sound like AI.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 500,
        temperature: 0.8
      })
    });
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';

    const captionMatch = text.match(/CAPTION:\s*([\s\S]*?)(?=HASHTAGS:|$)/i);
    const hashtagMatch = text.match(/HASHTAGS:\s*([\s\S]*?)$/i);

    return {
      caption: (captionMatch?.[1] || idea.hook || idea.idea).trim(),
      hashtags: (hashtagMatch?.[1] || '#basicreflex #boxing #hongkong').trim()
    };
  } catch (err) {
    console.error('[autopilot] Caption generation failed:', err.message);
    return { caption: idea.hook || idea.idea, hashtags: '#basicreflex #boxing #hongkong' };
  }
}

// ── Download Image ──────────────────────────────────────────────────────────

async function downloadImage(url, id) {
  const ext = url.includes('.mp4') ? '.mp4' : '.jpg';
  const filename = `autopilot-${id}${ext}`;
  const filepath = path.join(READY_DIR, filename);

  try {
    const res = await fetch(url);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(filepath, buffer);
    return filepath;
  } catch (err) {
    console.error('[autopilot] Download failed:', err.message);
    return null;
  }
}

// ── Telegram Delivery ───────────────────────────────────────────────────────

async function sendReadyPost(imageUrl, localPath, idea, caption, hashtags) {
  const fullCaption = `${caption}\n\n${hashtags}`;
  const ideaLine = idea.idea.length > 80 ? idea.idea.slice(0, 80) + '...' : idea.idea;

  // Send the visual
  try {
    if (imageUrl.includes('.mp4')) {
      await fetch(`${API}/sendVideo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CHAT_ID, video: imageUrl, caption: `Content Autopilot | ${ideaLine}` })
      });
    } else {
      await fetch(`${API}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CHAT_ID, photo: imageUrl, caption: `Content Autopilot | ${ideaLine}` })
      });
    }
  } catch {}

  // Send caption as copyable text
  const trialFlag = idea.trialReel ? '\nTRIAL REEL — post as Trial (non-followers first)' : '';
  const editNotes = idea.editingNotes ? `\nEditing: ${idea.editingNotes}` : '';
  const storyNote = idea.storyAngle ? `\nStory: ${idea.storyAngle}` : '';
  const msg = `*Ready to Post*\n\n${fullCaption}\n${trialFlag}${editNotes}${storyNote}\n---\nSaved: \`${path.basename(localPath)}\`\nIdea: ${idea.character} | ${idea.format}`;
  try {
    await fetch(`${API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: msg, parse_mode: 'Markdown' })
    });
  } catch (err) {
    // Fallback without markdown
    await fetch(`${API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: msg.replace(/[*`]/g, '') })
    }).catch(() => {});
  }

  // Save caption alongside image
  const captionFile = localPath.replace(/\.\w+$/, '.txt');
  fs.writeFileSync(captionFile, fullCaption);
}

// ── Main Run ────────────────────────────────────────────────────────────────

async function run() {
  console.log('[autopilot] Starting content autopilot...');

  const queue = loadJSON(QUEUE_PATH);
  if (!queue?.items?.length) {
    console.log('[autopilot] Queue empty. Nothing to process.');
    return { processed: 0 };
  }

  // Find Instagram-targeted queued ideas (not yet processed)
  const state = loadJSON(STATE_PATH) || { usedPhotos: [], processedIds: [] };
  const candidates = queue.items.filter(item =>
    item.status === 'queued' &&
    item.cullVerdict === 'APPROVE' &&
    !state.processedIds.includes(item.id) &&
    isInstagramContent(item)
  );

  if (candidates.length === 0) {
    console.log('[autopilot] No Instagram-ready items in queue.');

    // Fallback: generate a generic gym post if no ideas queued
    if (process.argv.includes('--force')) {
      console.log('[autopilot] --force: generating generic gym post...');
      await generateGenericPost();
    }
    return { processed: 0 };
  }

  let processed = 0;
  for (const idea of candidates.slice(0, MAX_PER_RUN)) {
    console.log(`[autopilot] Processing: ${idea.idea.slice(0, 60)}...`);

    try {
      // Step 1: Pick source photo
      const sourcePhoto = pickSourcePhoto(idea);
      console.log(`[autopilot] Source: ${sourcePhoto ? path.basename(sourcePhoto) : 'generative'}`);

      // Step 2: Pick recipe and generate visual
      const recipe = pickRecipe(idea);
      const imageUrl = generateVisual(sourcePhoto, recipe);
      if (!imageUrl) {
        console.error(`[autopilot] Visual generation failed for ${idea.id}`);
        appendLog({ event: 'generation_failed', ideaId: idea.id });
        continue;
      }

      // Step 3: Generate caption
      const { caption, hashtags } = await generateCaption(idea);

      // Step 4: Download image
      const localPath = await downloadImage(imageUrl, idea.id);
      if (!localPath) continue;

      // Step 5: Send to Telegram
      await sendReadyPost(imageUrl, localPath, idea, caption, hashtags);

      // Step 6: Mark processed
      state.processedIds.push(idea.id);
      if (state.processedIds.length > 100) state.processedIds = state.processedIds.slice(-50);
      saveJSON(STATE_PATH, state);

      // Update queue item status
      idea.status = 'visual-ready';
      idea.visualUrl = imageUrl;
      idea.localPath = localPath;
      idea.captionGenerated = caption;
      idea.hashtagsGenerated = hashtags;
      idea.autopilotAt = new Date().toISOString();
      saveJSON(QUEUE_PATH, queue);

      appendLog({ event: 'delivered', ideaId: idea.id, character: idea.character, style: recipe.prompt.slice(0, 40) });
      processed++;
      console.log(`[autopilot] Delivered: ${idea.id}`);

    } catch (err) {
      console.error(`[autopilot] Error processing ${idea.id}:`, err.message);
      appendLog({ event: 'error', ideaId: idea.id, error: err.message });
    }
  }

  console.log(`[autopilot] Done. ${processed}/${candidates.length} processed.`);
  return { processed, total: candidates.length };
}

function isInstagramContent(item) {
  const platform = (item.platform || '').toLowerCase();
  const format = (item.format || '').toLowerCase();
  return platform.includes('instagram') ||
    format.includes('reel') ||
    format.includes('story') ||
    format.includes('carousel') ||
    (item.character === 'reed' && platform !== 'linkedin' && platform !== 'substack') ||
    (item.character === 'maya' && platform !== 'linkedin');
}

async function generateGenericPost() {
  // Pick random gym photo + pro photo style → generic post
  const gymFiles = safeReadDir(GYM_PHOTOS).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
  if (gymFiles.length === 0) return;

  const photo = path.join(GYM_PHOTOS, gymFiles[Math.floor(Math.random() * gymFiles.length)]);
  const recipe = {
    model: 'nano_banana_2', aspect: '16:9',
    prompt: 'Apply a high-end commercial retouch. Maintain 100% preservation of subject identity, poses, clothing, and all background elements. Cinematic. Sony A7R V, deep crisp focus. Warm golden sports documentary color grade. Professional Lightroom grade.'
  };

  const imageUrl = generateVisual(photo, recipe);
  if (!imageUrl) return;

  const genericIdea = {
    id: `generic-${Date.now()}`,
    idea: 'Daily gym atmosphere',
    hook: 'The work speaks for itself.',
    character: 'reed',
    format: 'Post',
    platform: 'Instagram'
  };

  const { caption, hashtags } = await generateCaption(genericIdea);
  const localPath = await downloadImage(imageUrl, genericIdea.id);
  if (localPath) {
    await sendReadyPost(imageUrl, localPath, genericIdea, caption, hashtags);
    appendLog({ event: 'generic_delivered' });
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────

if (process.argv[1]?.includes('content-autopilot')) {
  run().then(r => {
    console.log('[autopilot] Result:', r);
    process.exit(0);
  }).catch(err => {
    console.error('[autopilot] Fatal:', err);
    process.exit(1);
  });
}

export { run };
