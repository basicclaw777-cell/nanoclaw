// reed-higgsfield-tester.js — Reed Mastery Loop with Hierarchical Bandits
// ESM module. Three independent bandits: model, style, taste.
// When untested backlog = 0, switches to creative probe mode.
// PM2 cron: Mon/Wed/Fri 3am HKT (0 19 * * 0,2,4 UTC)
// Manual: /hftest on Telegram, or: node reed-higgsfield-tester.js

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { chooseAction, recordOutcome, getState } from './bandit-brain.js';
import { out, rd, scan } from './linda-vault.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Config ──
const MAP_PATH = join(__dirname, 'higgsfield-map.json');
const LOG_PATH = join(__dirname, 'reed-lab', 'test-log.json');
const OUTBOX = join(__dirname, 'reed-lab', 'hf-test-outbox');
const COOKBOOK_PATH = join(process.env.HOME, 'cathedral-vault', '09_Artifacts', 'higgsfield-style-cookbook.md');
const TASTE_PATH = join(__dirname, 'taste-map.json');
const CALIBRATION_DIR = '/Users/basicclaw777/Downloads/upgraded standard';
const MAX_TESTS_PER_RUN = 10;
const DELAY_BETWEEN_TESTS_MS = 10000;
const HF_TIMEOUT = 600000;
const WAIT_TIMEOUT = '15m';

// Models that accept --resolution param (checked via `higgsfield model get`)
const RESOLUTION_MODELS = new Set([
  'gpt_image_2', 'nano_banana_flash', 'nano_banana_2',
  'marketing_studio_image', 'flux_2'
]);

// Models with restricted aspect ratios (default to their allowed values)
const ASPECT_OVERRIDES = {
  openai_hazel: '3:2'  // only supports 1:1, 3:2, 2:3, auto
};

// Grade mapping: A=1.0, B=0.7, C=0.3, D=0.0
const GRADE_REWARD = { A: 1.0, B: 0.7, C: 0.3, D: 0.0, untested: 0.0 };

// ── Bandit agent IDs ──
const BANDIT_MODEL = 'reed-model';
const BANDIT_STYLE = 'reed-style';
const BANDIT_TASTE = 'reed-taste';

// ── Load env ──
function loadEnv() {
  const envPath = join(__dirname, '.env');
  if (!existsSync(envPath)) return {};
  const env = {};
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

const env = loadEnv();
const BOT_TOKEN = env.TELEGRAM_TOKEN || env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = env.PAUL_CHAT_ID || env.TELEGRAM_CHAT_ID || '';

// ── Ensure directories ──
if (!existsSync(OUTBOX)) mkdirSync(OUTBOX, { recursive: true });

// ══════════════════════════════════════════════════════════════════════
// STYLE TEMPLATES — extracted from Prompting Bible
// ══════════════════════════════════════════════════════════════════════

const STYLE_TEMPLATES = {
  transformation: {
    name: 'Transformation',
    type: 'video',
    template: (subject) => `Montage, multi-shot action Hollywood movie, don't use one camera angle or single cut, cinematic lighting, photorealistic, 35mm film quality, professional color grading, sharp focus, high detail texture, film grain, depth of field mastery, ARRI ALEXA aesthetic\n\nShot 1: Medium shot — ${subject}, warm golden gym light. Camera sways gently.\nShot 2: Wide shot — energy builds, movement intensifies. Camera shakes tracking action.\nShot 3: Close-up — focus, determination, sweat catching light.\nShot 4: Medium shot — peak intensity, full power. Camera jolts with impact.\nTotal: 10s / 4 shots / 16:9`
  },
  pov_locked: {
    name: 'POV Locked',
    type: 'video',
    template: (subject) => `One continuous shot, first-person POV perspective in Hong Kong boxing gym, no cuts, no zoom, natural head movement, ${subject}, cinematic, photorealistic, ultra detailed, motion blur on hits, warm golden light through industrial windows, film grain\nTotal: 10s / 1 shot / 16:9`
  },
  cinematic_orbit: {
    name: 'Cinematic Orbit',
    type: 'video',
    template: (subject) => `Camera slowly orbits ${subject}, golden light shifts across textures, gym atmosphere, shallow depth of field, anamorphic 35mm, warm amber tone on surfaces with cool steel-blue shadows, ARRI ALEXA aesthetic, film grain, dust particles in light beams\nTotal: 5s / 1 shot / 16:9`
  },
  hyper_motion: {
    name: 'Hyper Motion CGI',
    type: 'video',
    template: (subject) => `Vertical 9:16 cinematic shot. ${subject} floating in dark void with soft amber underglow. Sudden hyper-speed shatter: elements explode outward in extreme slow motion, fragments flying past camera with golden light streaks. Camera orbits as elements converge. Cinematic premium aesthetic, deep blacks, hyperrealistic detail, 9:16 vertical.`
  },
  sports_documentary: {
    name: 'Sports Documentary',
    type: 'image',
    template: (subject) => `${subject}, Hong Kong boxing gym, warm golden light streaming through industrial windows, ARRI Alexa quality, 35mm film look, shallow depth of field, professional sports documentary photography, heavy film grain, dust particles in light beams, cinematic 5200K`
  },
  dramatic_cinema: {
    name: 'Dramatic Cinema',
    type: 'image',
    template: (subject) => `${subject}, dramatic volumetric haze, chiaroscuro lighting, deep shadows with golden god rays, film grain texture, sports documentary at golden hour, backlit silhouette depth, warm amber tones, dust particles catching light, 85mm lens feel`
  },
  fight_poster: {
    name: 'Fight Poster',
    type: 'image',
    template: (subject) => `Vintage 1970s boxing fight poster featuring ${subject}. Aged yellowed paper with fold creases. Bold sans-serif: BASIC REFLEX. Halftone dot printing, red/black/cream palette. Retro sports illustration, Muhammad Ali era aesthetic. Decorative border frame.`
  }
};

const STYLE_KEYS = Object.keys(STYLE_TEMPLATES);

// ══════════════════════════════════════════════════════════════════════
// TASTE ANCHORS — loaded from taste-map.json
// ══════════════════════════════════════════════════════════════════════

function loadTasteAnchors() {
  try {
    const tm = JSON.parse(readFileSync(TASTE_PATH, 'utf-8'));
    const anchors = [];
    // Visual style anchors
    const vs = tm.domains?.visual_style;
    if (vs?.anchors) {
      for (const a of vs.anchors) {
        if (a.status === 'YES' || a.status === 'CONDITIONAL') {
          anchors.push({ key: `vs_${a.item.replace(/\W/g, '_')}`, label: a.item, modifier: a.reason, source: 'visual_style' });
        }
      }
    }
    if (vs?.confirmed_qualities) {
      for (const q of vs.confirmed_qualities) {
        const key = `qual_${q.slice(0, 30).replace(/\W/g, '_')}`;
        anchors.push({ key, label: q.slice(0, 50), modifier: q, source: 'visual_quality' });
      }
    }
    // Aesthetic anchors
    const ae = tm.domains?.aesthetic;
    if (ae?.anchors) {
      for (const a of ae.anchors) {
        if (a.status === 'YES') {
          anchors.push({ key: `ae_${(a.item || a.key || '').replace(/\W/g, '_')}`, label: a.item || a.key, modifier: a.reason || a.value || a.item, source: 'aesthetic' });
        }
      }
    }
    // Rejection constraints (negative modifiers)
    if (vs?.rejections) {
      for (const r of vs.rejections) {
        anchors.push({ key: `rej_${r.slice(0, 25).replace(/\W/g, '_')}`, label: `avoid: ${r.slice(0, 40)}`, modifier: `Avoid: ${r}`, source: 'rejection', negative: true });
      }
    }
    return anchors;
  } catch (e) {
    console.error('[hftest] Failed to load taste anchors:', e.message);
    return [
      { key: 'default_cinematic', label: 'cinematic warmth', modifier: 'warm golden light, film grain, cinematic feel', source: 'fallback' },
      { key: 'default_documentary', label: 'sports documentary', modifier: 'sports documentary photography, authentic', source: 'fallback' },
      { key: 'default_gritty', label: 'gritty realism', modifier: 'real gym atmosphere, no AI slop, authentic', source: 'fallback' }
    ];
  }
}

// ══════════════════════════════════════════════════════════════════════
// ARCHAEOLOGIST VISUAL FEED — check Linda for visual techniques
// ══════════════════════════════════════════════════════════════════════

function checkArchaeologistFeed() {
  const techniques = [];
  try {
    // Check for visual discoveries
    const visual = rd(['discovery', 'visual', null], 'swarm');
    if (visual) techniques.push({ source: 'visual', data: visual.tuple, agent: visual.agentId });

    // Check for audio/acoustics discoveries (might have visual component)
    const audio = rd(['discovery', 'audio_acoustics', null], 'swarm');
    if (audio) techniques.push({ source: 'audio_acoustics', data: audio.tuple, agent: audio.agentId });

    // Check for style victories from previous runs
    const victories = scan(['style_victory', null, null, null], 'visual');
    if (victories.length) {
      const latest = victories[victories.length - 1];
      techniques.push({ source: 'style_victory', data: latest.tuple, agent: latest.agentId });
    }

    // Check for any creative technique discoveries
    const creative = rd(['discovery', 'creative_technique', null], 'swarm');
    if (creative) techniques.push({ source: 'creative_technique', data: creative.tuple, agent: creative.agentId });
  } catch (e) {
    console.log('[hftest] Linda read failed (non-fatal):', e.message);
  }
  return techniques;
}

function buildArchaeologistModifier(techniques) {
  if (!techniques.length) return '';
  const parts = [];
  for (const t of techniques) {
    if (t.source === 'style_victory') {
      const [, model, technique] = t.data;
      parts.push(`(winning technique from ${model}: ${technique})`);
    } else if (t.source === 'visual' || t.source === 'creative_technique') {
      const [, , confidence] = t.data;
      if (confidence > 0.5) parts.push(`(Archaeologist visual technique — confidence ${confidence})`);
    }
  }
  return parts.length ? `\n[Archaeologist: ${parts.join(', ')}]` : '';
}

// ══════════════════════════════════════════════════════════════════════
// STYLE COOKBOOK — read/write winning recipes
// ══════════════════════════════════════════════════════════════════════

function loadCookbook() {
  if (!existsSync(COOKBOOK_PATH)) return [];
  const content = readFileSync(COOKBOOK_PATH, 'utf-8');
  const recipes = [];
  const blocks = content.split('\n## ').slice(1);
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    const gradeMatch = lines.find(l => /Grade:/.test(l))?.match(/Grade:\s*([A-D])/);
    if (gradeMatch) recipes.push({ header: lines[0], grade: gradeMatch[1], raw: block });
  }
  return recipes;
}

function saveToCookbook(result) {
  if (!result.grade || !['A', 'B'].includes(result.grade)) return;
  const entry = [
    `\n## ${result.name} — ${result.styleName || 'unknown'} — ${result.tasteName || 'unknown'}`,
    `- **Model:** ${result.model} (${result.name})`,
    `- **Style:** ${result.styleName || 'n/a'}`,
    `- **Taste Anchor:** ${result.tasteName || 'n/a'}`,
    `- **Aspect:** ${result.aspect || '16:9'}`,
    `- **Grade:** ${result.grade}`,
    `- **Output:** ${result.output || 'n/a'}`,
    `- **Date:** ${result.timestamp?.slice(0, 10) || new Date().toISOString().slice(0, 10)}`,
    '- **Prompt:**',
    '```',
    result.prompt?.slice(0, 500) || '',
    '```',
    ''
  ].join('\n');

  if (!existsSync(COOKBOOK_PATH)) {
    writeFileSync(COOKBOOK_PATH, `# Higgsfield Style Cookbook\n\nAuto-generated winning recipes. Reed reads before generating to reuse patterns.\n\n---\n${entry}`);
  } else {
    appendFileSync(COOKBOOK_PATH, entry);
  }
  console.log(`[hftest] Cookbook: saved ${result.grade} recipe — ${result.model}/${result.styleName}`);
}

// ══════════════════════════════════════════════════════════════════════
// TELEGRAM HELPERS
// ══════════════════════════════════════════════════════════════════════

async function sendTelegram(text) {
  if (!BOT_TOKEN || !CHAT_ID) { console.log('[hftest] No Telegram creds'); return; }
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'Markdown' })
    });
  } catch (e) { console.error('[hftest] Telegram text error:', e.message); }
}

async function sendTelegramPhoto(filePath, caption) {
  if (!BOT_TOKEN || !CHAT_ID) return;
  try {
    execFileSync('curl', [
      '-sS', `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`,
      '-F', `chat_id=${CHAT_ID}`,
      '-F', `photo=@${filePath}`,
      '-F', `caption=${caption.slice(0, 1024)}`
    ], { timeout: 60000 });
  } catch (e) { console.error('[hftest] Telegram photo error:', e.message); }
}

async function sendTelegramVideo(filePath, caption) {
  if (!BOT_TOKEN || !CHAT_ID) return;
  try {
    execFileSync('curl', [
      '-sS', `https://api.telegram.org/bot${BOT_TOKEN}/sendVideo`,
      '-F', `chat_id=${CHAT_ID}`,
      '-F', `video=@${filePath}`,
      '-F', `caption=${caption.slice(0, 1024)}`
    ], { timeout: 120000 });
  } catch (e) { console.error('[hftest] Telegram video error:', e.message); }
}

// ══════════════════════════════════════════════════════════════════════
// MAP AND LOG I/O
// ══════════════════════════════════════════════════════════════════════

function loadMap() { return JSON.parse(readFileSync(MAP_PATH, 'utf-8')); }
function saveMap(map) {
  map.meta.updated = new Date().toISOString().slice(0, 10);
  writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));
}
function loadLog() {
  if (!existsSync(LOG_PATH)) return [];
  try { return JSON.parse(readFileSync(LOG_PATH, 'utf-8')); } catch { return []; }
}
function saveLog(log) { writeFileSync(LOG_PATH, JSON.stringify(log, null, 2)); }

function getCalibrationImage() {
  if (!existsSync(CALIBRATION_DIR)) return null;
  const files = execFileSync('ls', [CALIBRATION_DIR], { encoding: 'utf-8' })
    .split('\n').filter(f => /\.(jpg|jpeg|png)$/i.test(f));
  if (!files.length) return null;
  return join(CALIBRATION_DIR, files.find(f => /\.jpg$/i.test(f)) || files[0]);
}

function findModelEntry(jst, map) {
  for (const [key, model] of Object.entries(map.image_models || {}))
    if (model.jst === jst) return { section: 'image_models', key, model };
  for (const [key, model] of Object.entries(map.video_models || {}))
    if (model.jst === jst) return { section: 'video_models', key, model };
  return null;
}

// ══════════════════════════════════════════════════════════════════════
// HIERARCHICAL BANDIT SELECTION
// ══════════════════════════════════════════════════════════════════════

function getAvailableModels(map) {
  const models = [];
  const webOnly = new Set(['canvas', 'product_photoshoot']);
  for (const [, model] of Object.entries(map.image_models || {})) {
    if (model.grade !== 'D' && model.jst && !webOnly.has(model.jst))
      models.push(model.jst);
  }
  for (const [, model] of Object.entries(map.video_models || {})) {
    if (model.grade !== 'D' && model.jst && !webOnly.has(model.jst))
      models.push(model.jst);
  }
  return models;
}

function getUntestedCandidates(map) {
  const candidates = [];
  const webOnly = new Set(['canvas', 'product_photoshoot']);
  for (const [key, model] of Object.entries(map.image_models || {})) {
    if (model.grade === 'untested' && model.jst && !webOnly.has(model.jst))
      candidates.push({ jst: model.jst, name: model.name, type: 'image', section: 'image_models', key });
  }
  for (const [key, model] of Object.entries(map.video_models || {})) {
    if (model.grade === 'untested' && model.jst && !webOnly.has(model.jst))
      candidates.push({ jst: model.jst, name: model.name, type: 'video', section: 'video_models', key });
  }
  return candidates;
}

function banditSelect(map, tasteAnchors) {
  const models = getAvailableModels(map);
  const tasteKeys = tasteAnchors.map(a => a.key);

  // Three independent Thompson samples
  const modelPick = chooseAction(BANDIT_MODEL, models);
  const stylePick = chooseAction(BANDIT_STYLE, STYLE_KEYS);
  const tastePick = tasteKeys.length > 0
    ? chooseAction(BANDIT_TASTE, tasteKeys)
    : { action: null, sample: 0, arms: [] };

  // Resolve picks
  const modelEntry = findModelEntry(modelPick.action, map);
  const style = STYLE_TEMPLATES[stylePick.action];
  const taste = tasteAnchors.find(a => a.key === tastePick.action) || null;

  // Type compatibility check — if style is video but model is image-only, swap
  const modelType = modelEntry?.section === 'video_models' ? 'video' : 'image';
  const styleType = style?.type || 'image';

  return {
    model: modelPick,
    style: stylePick,
    taste: tastePick,
    resolved: {
      modelJst: modelPick.action,
      modelName: modelEntry?.model?.name || modelPick.action,
      modelType,
      styleKey: stylePick.action,
      styleName: style?.name || stylePick.action,
      styleType,
      tasteKey: tastePick.action,
      tasteName: taste?.label || 'none',
      tasteModifier: taste?.modifier || '',
      tasteNegative: taste?.negative || false
    }
  };
}

// ══════════════════════════════════════════════════════════════════════
// PROMPT ASSEMBLY
// ══════════════════════════════════════════════════════════════════════

// BR-themed subjects for template injection
const SUBJECTS = [
  'worn leather heavy bag hanging from chains, patina showing years of use',
  'empty boxing ring corner, red ropes, canvas floor worn from footwork',
  'row of speed bags, dramatic side lighting',
  'boxing gloves and hand wraps on wooden bench',
  'heavy bag mid-swing, chain tension visible',
  'gym entrance, morning light flooding through door',
  'concrete wall with colorful BASIC REFLEX posters'
];

function buildPrompt(selection, archaeologistMod) {
  const { resolved } = selection;
  const style = STYLE_TEMPLATES[resolved.styleKey];
  const subject = SUBJECTS[Math.floor(Math.random() * SUBJECTS.length)];

  // Start with style template
  let prompt = style.template(subject);

  // Inject taste modifier (positive = append, negative = add avoidance)
  if (resolved.tasteModifier && !resolved.tasteNegative) {
    prompt += `\nStyle emphasis: ${resolved.tasteModifier}`;
  } else if (resolved.tasteModifier && resolved.tasteNegative) {
    prompt += `\n${resolved.tasteModifier}`;
  }

  // Inject Archaeologist visual technique
  if (archaeologistMod) {
    prompt += archaeologistMod;
  }

  // Read cookbook for winning patterns with this model
  try {
    const cookbook = loadCookbook();
    const relevant = cookbook.filter(r => r.grade === 'A' && r.raw.includes(resolved.modelJst));
    if (relevant.length) {
      const tip = relevant[relevant.length - 1];
      const promptMatch = tip.raw.match(/```\n([\s\S]*?)```/);
      if (promptMatch) {
        console.log(`[hftest] Cookbook hint applied from ${tip.header.slice(0, 40)}`);
        // Don't replace prompt, just log it for reference
      }
    }
  } catch {}

  return prompt;
}

// ══════════════════════════════════════════════════════════════════════
// RUN A SINGLE TEST
// ══════════════════════════════════════════════════════════════════════

async function runTest(modelJst, modelName, type, prompt, extraMeta = {}) {
  const timestamp = new Date().toISOString();
  const fileStamp = Date.now();
  console.log(`\n[hftest] Testing: ${modelName} (${modelJst}) -- ${type}`);

  const result = {
    model: modelJst, name: modelName, type, prompt, timestamp,
    grade: 'untested', output: null, error: null, file: null, duration_ms: 0,
    ...extraMeta
  };
  const startTime = Date.now();

  try {
    const args = ['generate', 'create', modelJst, '--prompt', prompt];
    if (type === 'video') {
      const calImg = getCalibrationImage();
      if (calImg) { args.push('--start-image', calImg); result.startImage = basename(calImg); }
      args.push('--duration', '5');
    }
    const aspect = ASPECT_OVERRIDES[modelJst] || extraMeta.aspect || '16:9';
    args.push('--aspect_ratio', aspect);
    if (type === 'image' && RESOLUTION_MODELS.has(modelJst)) args.push('--resolution', '2k');
    args.push('--wait', '--wait-timeout', WAIT_TIMEOUT);

    console.log(`[hftest] CLI: higgsfield ${args.slice(0, 6).join(' ')}...`);
    const output = execFileSync('higgsfield', args, { encoding: 'utf-8', timeout: HF_TIMEOUT }).trim();
    result.duration_ms = Date.now() - startTime;
    result.rawOutput = output.slice(0, 500);

    const urlMatch = output.match(/(https?:\/\/\S+)/);
    if (urlMatch) {
      result.output = urlMatch[1];
      const ext = type === 'video' ? 'mp4' : 'png';
      const outFile = join(OUTBOX, `${modelJst}-${fileStamp}.${ext}`);
      execFileSync('curl', ['-sL', urlMatch[1], '-o', outFile], { timeout: 120000 });
      result.file = outFile;

      if (type === 'image') {
        const jpgFile = join(OUTBOX, `${modelJst}-${fileStamp}.jpg`);
        try { execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '85', outFile, '--out', jpgFile], { timeout: 30000 }); result.telegramFile = jpgFile; }
        catch { result.telegramFile = outFile; }
      } else { result.telegramFile = outFile; }

      result.grade = 'B';
      result.notes = 'Generated successfully. Awaiting Paul review for final grade.';
      console.log(`[hftest] SUCCESS: ${modelName} -- saved to ${outFile}`);
    } else if (/error|fail/i.test(output)) {
      result.grade = 'D'; result.error = output.slice(0, 300);
      result.notes = `Generation failed: ${output.slice(0, 200)}`;
    } else {
      result.grade = 'C'; result.notes = `Unexpected output: ${output.slice(0, 200)}`;
    }
  } catch (err) {
    result.duration_ms = Date.now() - startTime;
    const errMsg = err.stderr ? err.stderr.toString().slice(0, 500) : (err.message || 'Unknown').slice(0, 500);
    result.error = errMsg;

    if (/timeout/i.test(errMsg)) { result.grade = 'C'; result.notes = 'Timed out. Retry later.'; }
    else if (/not found|invalid|unknown/i.test(errMsg)) { result.grade = 'D'; result.notes = 'Model not available via CLI.'; }
    else if (/nsfw|safety|content.policy/i.test(errMsg)) { result.grade = 'C'; result.notes = 'Safety filter. Try different prompt.'; }
    else if (/credit|quota|limit/i.test(errMsg)) { result.grade = 'untested'; result.notes = 'Credits exhausted.'; }
    else { result.grade = 'D'; result.notes = `Error: ${errMsg.slice(0, 200)}`; }
    console.log(`[hftest] ERROR: ${modelName} -- ${result.notes}`);
  }
  return result;
}

// ══════════════════════════════════════════════════════════════════════
// BANDIT FEEDBACK
// ══════════════════════════════════════════════════════════════════════

function feedBandits(selection, grade) {
  const reward = GRADE_REWARD[grade] ?? 0;
  const success = reward >= 0.5;
  const { resolved } = selection;

  // Each bandit learns independently — use own agentId as source (self = trusted)
  recordOutcome(BANDIT_MODEL, resolved.modelJst, success, BANDIT_MODEL);
  recordOutcome(BANDIT_STYLE, resolved.styleKey, success, BANDIT_STYLE);
  if (resolved.tasteKey) {
    recordOutcome(BANDIT_TASTE, resolved.tasteKey, success, BANDIT_TASTE);
  }

  console.log(`[hftest] Bandits fed: model=${resolved.modelJst} style=${resolved.styleKey} taste=${resolved.tasteName} reward=${reward} (${grade})`);
}

// ══════════════════════════════════════════════════════════════════════
// LINDA TUPLE POST
// ══════════════════════════════════════════════════════════════════════

function postToLinda(result, selection) {
  try {
    const grade = result.grade;
    if (['A', 'B'].includes(grade)) {
      out(
        ['style_victory', result.model, selection?.resolved?.styleName || 'unknown', grade],
        'visual',
        'reed'
      );
      console.log(`[hftest] Linda: posted style_victory for ${result.model}`);
    }
    // Always post outcome for swarm learning
    out(
      ['outcome', 'visual_generation', grade === 'A' || grade === 'B' ? 1 : 0],
      'swarm',
      'reed'
    );
  } catch (e) {
    console.log('[hftest] Linda post failed (non-fatal):', e.message);
  }
}

// ══════════════════════════════════════════════════════════════════════
// UPDATE MAP WITH RESULT
// ══════════════════════════════════════════════════════════════════════

function updateMap(map, result) {
  const entry = findModelEntry(result.model, map);
  if (!entry) return;
  const model = map[entry.section][entry.key];
  if (model.grade === 'untested') model.grade = result.grade;
  if (!model.tests) model.tests = [];
  model.tests.push({
    date: result.timestamp.slice(0, 10),
    test: `Bandit: ${result.styleName || 'auto'} / ${result.tasteName || 'auto'}`,
    result: result.notes || result.error || 'completed',
    grade: result.grade,
    prompt: result.prompt.slice(0, 100),
    duration_ms: result.duration_ms,
    automated: true,
    bandit: true
  });
  if (result.grade === 'D' && result.error) {
    if (!model.weaknesses) model.weaknesses = [];
    if (!model.weaknesses.some(w => w.includes('auto-test')))
      model.weaknesses.push(`auto-test failed: ${(result.error || result.notes).slice(0, 80)}`);
  }
}

// ══════════════════════════════════════════════════════════════════════
// TELEGRAM REPORTS
// ══════════════════════════════════════════════════════════════════════

async function sendReport(result) {
  const emoji = { A: '\u2705', B: '\u{1F7E1}', C: '\u{1F7E0}', D: '\u274C', untested: '\u26AA' }[result.grade] || '\u26AA';
  const dur = result.duration_ms ? `${(result.duration_ms / 1000).toFixed(1)}s` : 'n/a';
  const lines = [
    `${emoji} *Reed Mastery Loop*`,
    `Model: \`${result.name}\` (${result.model})`,
    `Style: ${result.styleName || 'auto'} | Taste: ${result.tasteName || 'auto'}`,
    `Type: ${result.type} | Grade: ${result.grade} | ${dur}`,
  ];
  if (result.probeMode) lines.push(`\u{1F9EA} Creative probe: ${result.probeMode}`);
  if (result.notes) lines.push(result.notes);
  if (result.error && result.grade === 'D') lines.push(`Error: ${result.error.slice(0, 150)}`);
  lines.push(`\n_${result.prompt.slice(0, 100)}_`);
  await sendTelegram(lines.join('\n'));

  if (result.telegramFile && existsSync(result.telegramFile)) {
    const cap = `Reed: ${result.name} / ${result.styleName || 'auto'} — Grade ${result.grade}`;
    if (result.type === 'video') await sendTelegramVideo(result.telegramFile, cap);
    else await sendTelegramPhoto(result.telegramFile, cap);
  }
}

// ══════════════════════════════════════════════════════════════════════
// CREATIVE PROBE MODE — when untested backlog = 0
// ══════════════════════════════════════════════════════════════════════

function buildProbeTests(map, tasteAnchors) {
  const probes = [];

  // Probe 1: Same prompt, top 3 models (comparison)
  const modelState = getState(BANDIT_MODEL);
  const topModels = modelState
    .filter(a => a.total_updates > 0)
    .sort((a, b) => (b.alpha / (b.alpha + b.beta)) - (a.alpha / (a.alpha + a.beta)))
    .slice(0, 3);

  if (topModels.length >= 2) {
    const subject = SUBJECTS[Math.floor(Math.random() * SUBJECTS.length)];
    const prompt = STYLE_TEMPLATES.sports_documentary.template(subject);
    for (const arm of topModels) {
      const entry = findModelEntry(arm.action, map);
      if (entry) {
        probes.push({
          modelJst: arm.action,
          modelName: entry.model.name,
          type: entry.section === 'video_models' ? 'video' : 'image',
          prompt,
          probeMode: `model_compare (${topModels.map(m => m.action).join(' vs ')})`,
          styleName: 'sports_documentary',
          tasteName: 'none'
        });
      }
    }
  }

  // Probe 2: Same model (best), 5 taste anchors (comparison)
  if (topModels.length > 0) {
    const bestModel = topModels[0].action;
    const entry = findModelEntry(bestModel, map);
    if (entry) {
      const type = entry.section === 'video_models' ? 'video' : 'image';
      const tasteSubset = tasteAnchors.filter(a => !a.negative).slice(0, 5);
      for (const taste of tasteSubset) {
        const subject = SUBJECTS[Math.floor(Math.random() * SUBJECTS.length)];
        let prompt = STYLE_TEMPLATES.dramatic_cinema.template(subject);
        prompt += `\nStyle emphasis: ${taste.modifier}`;
        probes.push({
          modelJst: bestModel,
          modelName: entry.model.name,
          type,
          prompt,
          probeMode: `taste_compare (${taste.label})`,
          styleName: 'dramatic_cinema',
          tasteName: taste.label
        });
      }
    }
  }

  // Probe 3: Weekly — highest-weight combo + Archaeologist latest
  const archTech = checkArchaeologistFeed();
  if (archTech.length > 0 && topModels.length > 0) {
    const bestModel = topModels[0].action;
    const entry = findModelEntry(bestModel, map);
    if (entry) {
      const type = entry.section === 'video_models' ? 'video' : 'image';
      const styleState = getState(BANDIT_STYLE);
      const bestStyle = styleState
        .sort((a, b) => (b.alpha / (b.alpha + b.beta)) - (a.alpha / (a.alpha + a.beta)))[0];
      const styleKey = bestStyle?.action || 'sports_documentary';
      const style = STYLE_TEMPLATES[styleKey];
      const subject = SUBJECTS[Math.floor(Math.random() * SUBJECTS.length)];
      let prompt = style.template(subject);
      prompt += buildArchaeologistModifier(archTech);
      probes.push({
        modelJst: bestModel,
        modelName: entry.model.name,
        type,
        prompt,
        probeMode: `archaeologist_combo (${styleKey} + arch_technique)`,
        styleName: styleKey,
        tasteName: 'archaeologist'
      });
    }
  }

  return probes;
}

// ══════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════

async function main() {
  console.log('[hftest] Reed Mastery Loop starting...');
  const map = loadMap();
  const log = loadLog();
  const tasteAnchors = loadTasteAnchors();
  const untested = getUntestedCandidates(map);
  const archTechniques = checkArchaeologistFeed();
  const archaeologistMod = buildArchaeologistModifier(archTechniques);

  console.log(`[hftest] ${untested.length} untested models | ${tasteAnchors.length} taste anchors | ${archTechniques.length} arch techniques`);

  // ── MODE: Untested backlog exists → bandit-guided testing ──
  if (untested.length > 0) {
    const batch = untested.slice(0, MAX_TESTS_PER_RUN);
    await sendTelegram(
      `*Reed Mastery Loop Starting*\nMode: Bandit-guided testing\n${batch.length} of ${untested.length} untested:\n` +
      batch.map((c, i) => `${i + 1}. ${c.name} (${c.type})`).join('\n') +
      `\nTaste anchors: ${tasteAnchors.length} | Arch: ${archTechniques.length}`
    );

    let ran = 0;
    for (const candidate of batch) {
      if (ran > 0) await new Promise(r => setTimeout(r, DELAY_BETWEEN_TESTS_MS));

      // Bandit selects style + taste for this untested model
      const selection = banditSelect(map, tasteAnchors);
      // Override model with the untested candidate
      selection.resolved.modelJst = candidate.jst;
      selection.resolved.modelName = candidate.name;
      selection.resolved.modelType = candidate.type;

      // Ensure style type compatibility
      let styleKey = selection.resolved.styleKey;
      const style = STYLE_TEMPLATES[styleKey];
      if (candidate.type === 'image' && style.type === 'video') {
        // Pick an image-compatible style
        const imageStyles = STYLE_KEYS.filter(k => STYLE_TEMPLATES[k].type === 'image');
        styleKey = imageStyles[Math.floor(Math.random() * imageStyles.length)];
        selection.resolved.styleKey = styleKey;
        selection.resolved.styleName = STYLE_TEMPLATES[styleKey].name;
      } else if (candidate.type === 'video' && style.type === 'image') {
        const videoStyles = STYLE_KEYS.filter(k => STYLE_TEMPLATES[k].type === 'video');
        styleKey = videoStyles[Math.floor(Math.random() * videoStyles.length)];
        selection.resolved.styleKey = styleKey;
        selection.resolved.styleName = STYLE_TEMPLATES[styleKey].name;
      }

      const prompt = buildPrompt(selection, archaeologistMod);
      const result = await runTest(
        candidate.jst, candidate.name, candidate.type, prompt,
        { styleName: selection.resolved.styleName, tasteName: selection.resolved.tasteName }
      );

      // Feed bandits with result
      feedBandits(selection, result.grade);
      updateMap(map, result); saveMap(map);
      log.push(result); saveLog(log);
      saveToCookbook(result);
      postToLinda(result, selection);
      await sendReport(result);
      ran++;

      if (result.notes?.includes('Credits exhausted')) {
        await sendTelegram('*Reed Mastery Loop -- Credits Exhausted*');
        break;
      }
    }

    const remaining = getUntestedCandidates(loadMap()).length;
    await sendTelegram(`*Reed Mastery Loop Complete*\nTested: ${ran} | Remaining: ${remaining}`);
    console.log(`[hftest] Done. ${ran} tested, ${remaining} remaining`);
    return;
  }

  // ── MODE: Creative Probe — all models tested, explore combinations ──
  console.log('[hftest] All models tested. Entering Creative Probe mode.');
  const probes = buildProbeTests(map, tasteAnchors);

  if (!probes.length) {
    // Pure bandit exploration
    const selection = banditSelect(map, tasteAnchors);
    const prompt = buildPrompt(selection, archaeologistMod);
    const r = selection.resolved;
    probes.push({
      modelJst: r.modelJst,
      modelName: r.modelName,
      type: r.modelType,
      prompt,
      probeMode: 'bandit_explore',
      styleName: r.styleName,
      tasteName: r.tasteName
    });
  }

  const probeBatch = probes.slice(0, MAX_TESTS_PER_RUN);
  await sendTelegram(
    `*Reed Mastery Loop — Creative Probe*\n${probeBatch.length} experiments:\n` +
    probeBatch.map((p, i) => `${i + 1}. ${p.modelName} / ${p.styleName} — ${p.probeMode}`).join('\n')
  );

  let ran = 0;
  for (const probe of probeBatch) {
    if (ran > 0) await new Promise(r => setTimeout(r, DELAY_BETWEEN_TESTS_MS));

    const result = await runTest(probe.modelJst, probe.modelName, probe.type, probe.prompt, {
      styleName: probe.styleName,
      tasteName: probe.tasteName,
      probeMode: probe.probeMode
    });

    // Build a selection object for bandit feedback
    const fakeSelection = {
      resolved: {
        modelJst: probe.modelJst,
        styleKey: STYLE_KEYS.find(k => STYLE_TEMPLATES[k].name === probe.styleName) || STYLE_KEYS[0],
        tasteKey: null,
        tasteName: probe.tasteName
      }
    };
    feedBandits(fakeSelection, result.grade);
    updateMap(map, result); saveMap(map);
    log.push(result); saveLog(log);
    saveToCookbook(result);
    postToLinda(result, fakeSelection);
    await sendReport(result);
    ran++;

    if (result.notes?.includes('Credits exhausted')) {
      await sendTelegram('*Reed Mastery Loop -- Credits Exhausted*');
      break;
    }
  }

  await sendTelegram(`*Reed Mastery Loop — Probe Complete*\n${ran} experiments run.`);
  console.log(`[hftest] Probe done. ${ran} experiments.`);
}

// ══════════════════════════════════════════════════════════════════════
// STATUS EXPORTS
// ══════════════════════════════════════════════════════════════════════

export function getStatus() {
  const map = loadMap(); const untested = getUntestedCandidates(map); const log = loadLog();
  const iu = Object.values(map.image_models || {}).filter(m => m.grade === 'untested').length;
  const vu = Object.values(map.video_models || {}).filter(m => m.grade === 'untested').length;
  const ti = Object.keys(map.image_models || {}).length;
  const tv = Object.keys(map.video_models || {}).length;
  const gc = {};
  for (const s of ['image_models', 'video_models'])
    for (const m of Object.values(map[s] || {})) gc[m.grade] = (gc[m.grade] || 0) + 1;
  const last = log.length ? log[log.length - 1] : null;

  // Bandit weights
  const modelWeights = getState(BANDIT_MODEL).map(a => ({
    action: a.action, weight: (a.alpha / (a.alpha + a.beta)).toFixed(3), updates: a.total_updates
  })).sort((a, b) => b.weight - a.weight);
  const styleWeights = getState(BANDIT_STYLE).map(a => ({
    action: a.action, weight: (a.alpha / (a.alpha + a.beta)).toFixed(3), updates: a.total_updates
  })).sort((a, b) => b.weight - a.weight);
  const tasteWeights = getState(BANDIT_TASTE).map(a => ({
    action: a.action, weight: (a.alpha / (a.alpha + a.beta)).toFixed(3), updates: a.total_updates
  })).sort((a, b) => b.weight - a.weight);

  return {
    untested: untested.length, imageUntested: iu, videoUntested: vu,
    totalImage: ti, totalVideo: tv, gradeCount: gc, totalTests: log.length,
    mode: untested.length > 0 ? 'testing' : 'creative_probe',
    lastTest: last ? { model: last.name, grade: last.grade, date: last.timestamp?.slice(0, 10) } : null,
    nextUp: untested.slice(0, 3).map(c => `${c.name} (${c.type})`),
    bandits: { model: modelWeights.slice(0, 5), style: styleWeights, taste: tasteWeights.slice(0, 5) }
  };
}

export function formatStatus() {
  const s = getStatus();
  const grades = Object.entries(s.gradeCount).map(([g, c]) => `${g}: ${c}`).join(' | ');
  const lines = [
    `*Reed Mastery Loop — Status*`, ``,
    `Mode: ${s.mode === 'creative_probe' ? 'Creative Probe' : 'Bandit-Guided Testing'}`,
    `Untested: ${s.untested} (${s.imageUntested} img, ${s.videoUntested} vid)`,
    `Total: ${s.totalImage} image + ${s.totalVideo} video`,
    `Grades: ${grades}`,
    `Tests run: ${s.totalTests}`,
    s.lastTest ? `Last: ${s.lastTest.model} -- ${s.lastTest.grade} (${s.lastTest.date})` : '',
  ];

  if (s.bandits.model.length) {
    lines.push(``, `*Model Bandit (top 5):*`);
    for (const m of s.bandits.model) lines.push(`  ${m.action}: ${m.weight} (${m.updates} tests)`);
  }
  if (s.bandits.style.length) {
    lines.push(`*Style Bandit:*`);
    for (const m of s.bandits.style) lines.push(`  ${m.action}: ${m.weight} (${m.updates} tests)`);
  }
  if (s.bandits.taste.length) {
    lines.push(`*Taste Bandit (top 5):*`);
    for (const m of s.bandits.taste) lines.push(`  ${m.action}: ${m.weight} (${m.updates} tests)`);
  }

  if (s.nextUp.length) {
    lines.push(``, `Next:\n${s.nextUp.map((n, i) => `  ${i + 1}. ${n}`).join('\n')}`);
  } else {
    lines.push(``, `All models tested. Creative Probe mode active.`);
  }

  return lines.filter(Boolean).join('\n');
}

// ── CLI ──
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--status') console.log(formatStatus());
  else if (process.argv[2] === '--weights') {
    const s = getStatus();
    console.log(JSON.stringify(s.bandits, null, 2));
  }
  else main().catch(err => {
    console.error('[hftest] Fatal:', err);
    sendTelegram(`*Reed Mastery Loop -- CRASHED*\n${err.message?.slice(0, 300)}`);
    process.exit(1);
  });
}

export { main as runTests, getUntestedCandidates as getTestCandidates, loadMap };
