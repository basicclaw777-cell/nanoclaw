// content-conductor.js — Unified Content Orchestration
// ESM module
// Coordinates Reed + Sound Studio + DJ Curator + Kit GM into content pipelines
// Approval gate: nothing posts without Paul's explicit OK

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { getTasteProfile, getVoicePattern } from './taste-map-api.js';

const HOME = process.env.HOME;
const CONDUCTOR_DIR = path.join(HOME, 'nanoclaw', 'content-conductor');
const TEMPLATES_PATH = path.join(CONDUCTOR_DIR, 'templates.json');
const QUEUE_DIR = path.join(CONDUCTOR_DIR, 'queue');
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

// ── Module Registry ─────────────────────────────────────────────────────────

const MODULES = {
  reed: {
    name: 'Reed Visual Director',
    capabilities: ['style_photo', 'select_best', 'generate_poster'],
    status: 'live',
    telegram_cmd: '/reed'
  },
  sound_studio: {
    name: 'Sound Studio',
    capabilities: ['voice', 'instrumental', 'transcribe', 'podcast'],
    status: 'live',
    telegram_cmd: '/sound'
  },
  dj_curator: {
    name: 'DJ Curator',
    capabilities: ['playlist', 'get_playlist_link', 'suggest_track'],
    status: 'live',
    telegram_cmd: '/playlist'
  },
  kit_gm: {
    name: 'Kit GM',
    capabilities: ['caption', 'plan_series', 'member_data'],
    status: 'live',
    telegram_cmd: '/kit'
  },
  gym_eyes: {
    name: 'Gym Eyes',
    capabilities: ['analyze_video', 'highlight_clips'],
    status: 'live',
    telegram_cmd: '/eyes'
  },
  conductor: {
    name: 'Content Conductor',
    capabilities: ['assemble', 'queue', 'suggest'],
    status: 'live'
  }
};

// ── Templates ───────────────────────────────────────────────────────────────

function loadTemplates() {
  return JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf8')).templates;
}

// ── Queue Management ────────────────────────────────────────────────────────

/**
 * Add content piece to approval queue
 */
export function queueContent(piece) {
  const id = `cc-${Date.now()}`;
  const item = {
    id,
    ...piece,
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  const filePath = path.join(QUEUE_DIR, `${id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(item, null, 2));
  return item;
}

/**
 * Get all pending items in queue
 */
export function getQueue() {
  try {
    return fs.readdirSync(QUEUE_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          return JSON.parse(fs.readFileSync(path.join(QUEUE_DIR, f), 'utf8'));
        } catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch { return []; }
}

/**
 * Get pending items only
 */
export function getPendingQueue() {
  return getQueue().filter(item => item.status === 'pending');
}

/**
 * Update queue item status
 */
export function updateQueueItem(id, status, notes = '') {
  const filePath = path.join(QUEUE_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) return null;

  const item = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  item.status = status;
  item.updatedAt = new Date().toISOString();
  if (notes) item.notes = notes;

  fs.writeFileSync(filePath, JSON.stringify(item, null, 2));
  return item;
}

// ── Caption Generation ──────────────────────────────────────────────────────

/**
 * Generate caption via DeepSeek using taste map voice profile
 */
export async function generateCaption(intent, style = 'casual') {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');

  const voicePattern = getVoicePattern();
  const writingProfile = getTasteProfile('writing_voice');
  const teachingProfile = getTasteProfile('teaching_tone');

  const qualities = [
    ...(writingProfile?.confirmed_qualities || []),
    ...(teachingProfile?.confirmed_qualities || [])
  ].join('\n- ');

  const rejections = [
    ...(writingProfile?.rejections || []),
    ...(teachingProfile?.rejections || [])
  ].join('\n- ');

  const styleGuide = {
    technique: 'Focus on the principle behind the technique, not just the drill. Teach the WHY.',
    recap: 'Celebrate the energy. Mention specific moments if possible. Community feel.',
    celebration: 'Genuine pride without being over-the-top. Let the achievement speak.',
    casual: 'Quick, authentic, gym-culture energy.',
    weekly_recap: 'Reflect on the week. What was built. What improved. Forward-looking.',
    student_feature: 'Celebrate their journey. Specific detail > generic praise.'
  };

  const prompt = `Write an Instagram caption for a boxing gym (Basic Reflex, Hong Kong).

VOICE: ${voicePattern}

QUALITIES:
- ${qualities}

NEVER:
- ${rejections}

STYLE: ${styleGuide[style] || styleGuide.casual}

INTENT: ${intent}

Write 2-3 sentences. Include 3-5 relevant hashtags at the end. No emojis unless they add something specific. Keep it real — if it sounds like AI wrote it, it fails.`;

  const resp = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      max_tokens: 300,
      temperature: 0.8,
      messages: [
        { role: 'system', content: 'You write Instagram captions for a Hong Kong boxing gym. Voice: authentic, concise, principle-based. Never sound like AI.' },
        { role: 'user', content: prompt }
      ]
    }),
    signal: AbortSignal.timeout(30000)
  });

  if (!resp.ok) throw new Error(`DeepSeek ${resp.status}`);
  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

// ── Idea Generation ─────────────────────────────────────────────────────────

/**
 * Generate content ideas based on recent activity
 */
export async function generateIdeas() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');

  // Gather context
  let context = 'Recent gym activity:\n';

  // Check reed-lab catalogue for recent photos
  try {
    const catPath = path.join(HOME, 'nanoclaw', 'reed-lab', 'catalogue.json');
    if (fs.existsSync(catPath)) {
      const cat = JSON.parse(fs.readFileSync(catPath, 'utf8'));
      const recent = (cat.entries || []).slice(-10);
      if (recent.length > 0) {
        context += `- ${recent.length} recent Reed images processed\n`;
        const styles = [...new Set(recent.map(e => e.style).filter(Boolean))];
        if (styles.length) context += `- Styles used: ${styles.join(', ')}\n`;
      }
    }
  } catch {}

  // Check gym-eyes analyses
  try {
    const eyesDir = path.join(HOME, 'nanoclaw', 'gym-eyes', 'output');
    const analyses = fs.readdirSync(eyesDir).filter(f => f.endsWith('.json'));
    if (analyses.length > 0) context += `- ${analyses.length} Gym Eyes analyses available\n`;
  } catch {}

  // Check playlist history
  try {
    const histPath = path.join(HOME, 'nanoclaw', 'dj-curator', 'playlist-history.json');
    if (fs.existsSync(histPath)) {
      const hist = JSON.parse(fs.readFileSync(histPath, 'utf8'));
      if (hist.playlists?.length > 0) context += `- ${hist.playlists.length} playlists generated\n`;
    }
  } catch {}

  const day = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  context += `- Today is ${day}\n`;
  context += `- Gym: Basic Reflex, Hong Kong boxing gym\n`;
  context += `- Style: combination content performs best (technique + personality + gym culture)\n`;

  const prompt = `Based on this context, suggest 5-7 content ideas for this boxing gym's Instagram.

${context}

For each idea, provide:
1. Content type: post / reel / carousel / story
2. One-line description
3. Template to use: technique_reel / class_recap / weekly_highlight / student_spotlight / quick_post
4. Timeliness: why now?

Format as numbered list. Be specific, not generic. "Post about boxing" is bad. "Before/after of last night's padwork drill — show the hip rotation improvement" is good.`;

  const resp = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      max_tokens: 800,
      temperature: 0.8,
      messages: [
        { role: 'system', content: 'You suggest specific, timely content ideas for a boxing gym Instagram. Be concrete, not generic.' },
        { role: 'user', content: prompt }
      ]
    }),
    signal: AbortSignal.timeout(30000)
  });

  if (!resp.ok) throw new Error(`DeepSeek ${resp.status}`);
  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

// ── Pipeline Execution ──────────────────────────────────────────────────────

/**
 * Execute a content pipeline from intent
 * Returns a queued content piece ready for approval
 */
export async function executePipeline(intent, templateName = null) {
  console.log(`[conductor] Pipeline: "${intent.slice(0, 60)}" template=${templateName || 'auto'}`);

  const templates = loadTemplates();

  // Auto-detect template if not specified
  if (!templateName) {
    const lower = intent.toLowerCase();
    if (lower.includes('reel') || lower.includes('technique') || lower.includes('drill')) {
      templateName = 'technique_reel';
    } else if (lower.includes('recap') || lower.includes('class') || lower.includes('tonight')) {
      templateName = 'class_recap';
    } else if (lower.includes('week') || lower.includes('highlight')) {
      templateName = 'weekly_highlight';
    } else if (lower.includes('student') || lower.includes('spotlight') || lower.includes('milestone')) {
      templateName = 'student_spotlight';
    } else {
      templateName = 'quick_post';
    }
  }

  const template = templates[templateName];
  if (!template) throw new Error(`Unknown template: ${templateName}`);

  // Generate caption
  const captionStyle = template.steps.find(s => s.module === 'kit_gm')?.config?.style || 'casual';
  const caption = await generateCaption(intent, captionStyle);

  // Build content piece
  const piece = {
    intent,
    template: templateName,
    templateName: template.name,
    contentType: template.content_type,
    caption,
    steps_completed: ['caption'],
    steps_pending: template.steps
      .filter(s => s.module !== 'kit_gm' && s.module !== 'conductor')
      .map(s => `${s.module}:${s.action}`),
    instructions: []
  };

  // Add module-specific instructions
  for (const step of template.steps) {
    if (step.module === 'reed') {
      piece.instructions.push(`📸 Reed: Send photo(s) with /reed ${step.config?.styles?.[0] || 'pro_photo'}`);
    }
    if (step.module === 'sound_studio' && !step.optional) {
      piece.instructions.push(`🎙 Sound: /sound voice "${caption.split('.')[0]}"`);
    }
    if (step.module === 'dj_curator') {
      piece.instructions.push(`🎵 DJ: /playlist standard (link the class playlist)`);
    }
  }

  // Queue for approval
  const queued = queueContent(piece);

  console.log(`[conductor] Queued: ${queued.id} (${templateName})`);
  return queued;
}

// ── Format for Telegram ─────────────────────────────────────────────────────

export function formatQueueTelegram() {
  const pending = getPendingQueue();
  const all = getQueue();

  let msg = '📋 *Content Conductor Queue*\n\n';

  if (pending.length === 0) {
    msg += '_No pending content._\n\n';
  } else {
    msg += `*Pending (${pending.length}):*\n`;
    for (const item of pending) {
      const date = item.createdAt.split('T')[0];
      msg += `\n• \`${item.id}\` — *${item.templateName || item.template}*\n`;
      msg += `  _${(item.intent || '').slice(0, 80)}_\n`;
      msg += `  Type: ${item.contentType} · ${date}\n`;
    }
  }

  const approved = all.filter(i => i.status === 'approved').length;
  const rejected = all.filter(i => i.status === 'rejected').length;
  msg += `\n📊 Total: ${all.length} | Approved: ${approved} | Rejected: ${rejected}`;

  return msg;
}

export function formatContentPieceTelegram(piece) {
  let msg = `📋 *Content Piece: ${piece.templateName || piece.template}*\n`;
  msg += `ID: \`${piece.id}\`\n`;
  msg += `Type: ${piece.contentType}\n\n`;

  msg += `*Intent:* _${piece.intent}_\n\n`;

  if (piece.caption) {
    msg += `*Caption:*\n${piece.caption}\n\n`;
  }

  if (piece.instructions?.length > 0) {
    msg += `*Next steps:*\n`;
    piece.instructions.forEach(i => msg += `${i}\n`);
    msg += '\n';
  }

  msg += `_Approve: /content approve ${piece.id}_\n`;
  msg += `_Reject: /content reject ${piece.id}_`;

  return msg;
}

export function formatTemplatesTelegram() {
  const templates = loadTemplates();
  let msg = '📋 *Content Templates*\n\n';
  for (const [key, t] of Object.entries(templates)) {
    const steps = t.steps.map(s => s.module).filter((v, i, a) => a.indexOf(v) === i);
    msg += `• \`${key}\` — *${t.name}*\n`;
    msg += `  _${t.description}_\n`;
    msg += `  Modules: ${steps.join(' → ')}\n`;
    msg += `  Type: ${t.content_type}\n\n`;
  }
  return msg;
}

export function formatStatusTelegram() {
  const pending = getPendingQueue();
  const modules = Object.entries(MODULES);

  let msg = '📋 *Content Conductor*\n\n';

  msg += `*Modules (${modules.length}):*\n`;
  modules.forEach(([key, m]) => {
    const icon = m.status === 'live' ? '✅' : '⏳';
    msg += `${icon} ${m.name}`;
    if (m.telegram_cmd) msg += ` (\`${m.telegram_cmd}\`)`;
    msg += '\n';
  });

  msg += `\n*Queue:* ${pending.length} pending\n`;
  msg += `*Target:* 2-3 posts/week\n\n`;

  msg += `*Commands:*
\`/content <intent>\` — create content piece
\`/content ideas\` — suggest content ideas
\`/content queue\` — show pending queue
\`/content templates\` — available templates
\`/content approve <id>\` — approve piece
\`/content reject <id>\` — reject piece
\`/content caption <text>\` — generate caption only`;

  return msg;
}

export default {
  executePipeline,
  generateCaption,
  generateIdeas,
  queueContent,
  getQueue,
  getPendingQueue,
  updateQueueItem,
  formatQueueTelegram,
  formatContentPieceTelegram,
  formatTemplatesTelegram,
  formatStatusTelegram,
  MODULES
};
