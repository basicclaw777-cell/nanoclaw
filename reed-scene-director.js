#!/usr/bin/env node
// Reed Scene Director — BR-locked image scene builder
// Two-stage: DeepSeek prompt writing (using Banana Pro Director grammar) + Higgsfield generation
// Usage: node reed-scene-director.js --character logan --scene "training on heavy bag" [--image ref.jpg] [--model nano_banana_2|gpt_image_2]
// Reference: ~/cathedral-vault/06_Methods/higgsfield-prompting-bible.md (Seedance formats, camera vocabulary, Marketing Studio modes)
// Feature Map: ~/nanoclaw/higgsfield-map.json (grades, proven pipelines, test queue)

import { execSync, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createRequire } from 'module';
const genGuard = createRequire(import.meta.url)('./lib/generation-guard.cjs'); // GLOBAL kill-switch

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.PAUL_CHAT_ID || '1912121485';

const OUTBOX = path.join(__dirname, 'reed-scene-outbox');
if (!fs.existsSync(OUTBOX)) fs.mkdirSync(OUTBOX, { recursive: true });

// Load character registry
const registry = JSON.parse(fs.readFileSync(path.join(__dirname, 'reed-characters.json'), 'utf-8'));

// The BR-locked photoreal stack — appended to every prompt
const PHOTOREAL_STACK = `Hyperrealistic photography. Real human skin texture with visible pores, subtle subsurface scattering on the cheeks, nose bridge, and ears, fine peach fuzz catching light along the jawline and cheekbones, slight skin imperfections — natural unevenness, not retouched. Hair rendered strand by strand with realistic flyaways, baby hairs at the hairline, individual strands catching light, natural texture and movement. Fabric rendered with real weave detail, real weight, real drape, visible texture variation across the surface. Eyes with real reflection, real moisture, real depth in the iris. Kodak Vision3 500T film emulation, visible fine film grain, subtle chromatic aberration at the edges of the frame, soft lens vignette. Lived-in, not pristine. Photographic, not rendered.`;

// Scene Director system prompt — teaches DeepSeek to write Higgsfield scene prompts
const SCENE_DIRECTOR_SYSTEM = `You are a cinematographer and scene director for a boxing gym brand called Basic Reflex. You write image generation prompts for Higgsfield AI models.

CRITICAL RULES:
1. This is SCENE COMPOSITION — you are placing a character in an environment. The model receives reference images separately.
2. NEVER use character names. Describe by visual markers only: "the man with long dreadlocks and full beard," "the woman with black shoulder-length hair."
3. NEVER use brand names. Say "boxing gym" not specific brands.
4. NEVER compose sparring, contact, or two-body interaction scenes. Only SOLO activities or empty gym scenes.
5. Every word describes something VISIBLE in the frame. No meta-commentary, no emotional intent.
6. No aspect ratios in the prompt — set in Higgsfield UI.

OUTPUT FORMAT — write a single continuous prompt with this structure:
[Character visual description — hair, build, wardrobe, pose, expression, action]. [Environment description — gym elements, set dressing, lighting direction, atmosphere]. [Camera language — lens simulation, depth of field, focus plane, framing]. [Photoreal texture block].

CAMERA LANGUAGE — pick based on scene type:
- Solo training/action: ARRI Alexa 35, Panavision Ultra Vintage anamorphic 55mm T2.3, handheld with natural breath, Kodak Vision3 250D grain
- Documentary/contemplative: ARRI Alexa 35, Panavision Ultra Vintage anamorphic 75mm T2.3, gentle dolly, warm soft focus
- Editorial/portrait: ARRI Alexa Mini LF, Cooke S4/i 75mm T2, locked tripod, Cooke skin warmth
- Equipment/detail: ARRI Alexa Mini LF, Cooke S4/i 100mm T2, locked macro, extreme shallow depth of field

COLOR SCIENCE (NON-NEGOTIABLE):
- Color temperature: 5200-5600K daylight neutral. NEVER orange, NEVER amber-pushed.
- Shadows: warm but controlled. Highlights and midtones: clean and neutral.
- Skin tones: natural, never pushed warm/amber/orange.
- Grade: documentary — ESPN/Magnum sports photography. NOT commercial, NOT fashion.
- Black point: lifted slightly, never crushed. Highlight rolloff: soft, filmic.

LIGHTING:
- Use only light sources plausible in a boxing gym: overhead fluorescent/tungsten mix, natural window light, practical gym lights.
- Do NOT invent dramatic studio lighting rigs. Reshape existing gym lighting only.
- Key light direction based on scene — overhead dominant with fill from windows or mirrors.

Output ONLY the prompt text. No preamble, no explanation, no labels, no line breaks.`;

function getCharacter(name) {
  const key = name.toLowerCase();
  const char = registry.characters[key];
  if (!char) {
    const available = Object.keys(registry.characters).join(', ');
    throw new Error(`Unknown character "${name}". Available: ${available}`);
  }
  return char;
}

function checkSceneSafety(sceneDesc) {
  const lower = sceneDesc.toLowerCase();
  const blocked = registry.gym.avoidScenes;
  for (const avoid of blocked) {
    // Check for key contact words
    if (lower.includes('sparring') || lower.includes('spar ') ||
        lower.includes('fighting') || lower.includes('hitting someone') ||
        lower.includes('punching someone') || lower.includes('clinch') ||
        lower.includes('grappling')) {
      return { safe: false, reason: avoid };
    }
  }
  return { safe: true };
}

async function buildScenePrompt(characterName, sceneDescription, options = {}) {
  const char = getCharacter(characterName);
  const gym = registry.gym;

  const userMsg = `CHARACTER:
${char.visualLock}
Wardrobe: ${char.canonicalWardrobe}
Notes: ${char.promptNotes}

ENVIRONMENT:
${gym.visualLock}
Lighting: ${gym.lightingNotes}

SCENE REQUEST:
${sceneDescription}

Write the Higgsfield scene prompt. Single character only. No contact scenes. Documentary boxing gym aesthetic.`;

  if (!DEEPSEEK_API_KEY) {
    console.log('  No DEEPSEEK_API_KEY — building static fallback prompt');
    return buildFallbackPrompt(char, gym, sceneDescription);
  }

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
          { role: 'system', content: SCENE_DIRECTOR_SYSTEM },
          { role: 'user', content: userMsg }
        ],
        temperature: 0.4,
        max_tokens: 600
      })
    });

    const data = await response.json();
    const prompt = data.choices?.[0]?.message?.content?.trim();

    if (prompt && prompt.length > 100) {
      // Append photoreal stack if not already included
      const full = prompt.includes('Hyperrealistic') ? prompt : `${prompt} ${PHOTOREAL_STACK}`;
      // Cap at 1500 chars
      const capped = full.length > 1500 ? full.slice(0, 1500).replace(/\s\S*$/, '') : full;
      console.log(`  Scene prompt built (${capped.length} chars)`);
      return capped;
    }

    console.log('  DeepSeek response too short — using fallback');
    return buildFallbackPrompt(char, gym, sceneDescription);
  } catch (e) {
    console.log(`  DeepSeek failed: ${e.message} — using fallback`);
    return buildFallbackPrompt(char, gym, sceneDescription);
  }
}

function buildFallbackPrompt(char, gym, sceneDesc) {
  return `${char.visualLock} ${char.canonicalWardrobe} ${sceneDesc}. ${gym.visualLock} ${gym.lightingNotes} Shot on ARRI Alexa 35, Panavision Ultra Vintage anamorphic 55mm at T2.3 with Tiffen Black Pro-Mist 1/4 filter, handheld with natural breath, shallow depth of field with the figure in sharp focus and the gym environment in soft bokeh behind. Kodak Vision3 250D film emulation with fine grain, neutral 5500K color temperature, warm shadows with clean neutral midtones and highlights, documentary sports photography grade. ${PHOTOREAL_STACK}`;
}

async function buildVideoPrompt(characterName, sceneDescription, duration = 5) {
  const char = getCharacter(characterName);
  const gym = registry.gym;

  const videoSystem = `You are a cinematographer writing Seedance video prompts for a boxing gym brand.

CRITICAL RULES:
1. NEVER use character names. Describe by visual markers only.
2. NEVER compose sparring or contact scenes. Solo activities only.
3. No brand names. No aspect ratios. No music references.
4. Describe DIEGETIC audio only — sounds that exist in the scene (leather on bag, feet on canvas, breath, chain rattle).

OUTPUT FORMAT — single continuous paragraph with inline labels:
Style & Mood: [1-2 sentences — documentary realism register, ESPN/Magnum reference]. Dynamic Description: [what happens across ${duration} seconds — every action, gesture, camera move. Physics over geometry. Energy over position]. Static Description: [locked frame elements — character visual, wardrobe, environment, props, lighting, atmosphere]. Shot on ARRI Alexa 35 in ProRes 4444 LogC4, Panavision Ultra Vintage 2x anamorphic 55mm at T2.3 with Tiffen Black Pro-Mist 1/4 filter, [movement type], Kodak Vision3 250D film emulation with fine grain, neutral 5200-5600K color temperature, warm shadows with clean neutral highlights, documentary sports grade, 24fps base shutter 180 degrees, total runtime roughly ${duration} seconds. Audio: diegetic only — [4-6 specific sounds], no music.

COLOR SCIENCE: 5200-5600K neutral. Never orange. Shadows warm, highlights clean. Documentary grade.`;

  const userMsg = `CHARACTER:
${char.visualLock}
Wardrobe: ${char.canonicalWardrobe}

ENVIRONMENT:
${gym.visualLock}

SCENE: ${sceneDescription}
DURATION: ${duration} seconds

Write the Seedance video prompt.`;

  if (!DEEPSEEK_API_KEY) {
    return buildFallbackVideoPrompt(char, gym, sceneDescription, duration);
  }

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
          { role: 'system', content: videoSystem },
          { role: 'user', content: userMsg }
        ],
        temperature: 0.4,
        max_tokens: 700
      })
    });

    const data = await response.json();
    const prompt = data.choices?.[0]?.message?.content?.trim();

    if (prompt && prompt.length > 100) {
      const capped = prompt.length > 1800 ? prompt.slice(0, 1800).replace(/\s\S*$/, '') : prompt;
      console.log(`  Video prompt built (${capped.length} chars)`);
      return capped;
    }

    return buildFallbackVideoPrompt(char, gym, sceneDescription, duration);
  } catch (e) {
    console.log(`  DeepSeek failed: ${e.message} — using fallback`);
    return buildFallbackVideoPrompt(char, gym, sceneDescription, duration);
  }
}

function buildFallbackVideoPrompt(char, gym, sceneDesc, duration) {
  return `Style & Mood: Documentary-grit cinematic realism with slow-burn observational register, the camera as witness, ESPN sports documentary meets Magnum photo essay. Dynamic Description: ${sceneDesc}. The camera holds at medium distance with a gentle handheld breath, slowly pushing in over ${duration} seconds. Static Description: ${char.visualLock} ${char.canonicalWardrobe} ${gym.visualLock} Shot on ARRI Alexa 35 in ProRes 4444 LogC4, Panavision Ultra Vintage 2x anamorphic 55mm at T2.3 with Tiffen Black Pro-Mist 1/4 filter, handheld with natural breath and slight shake, Kodak Vision3 250D film emulation with fine grain, neutral 5500K color temperature, warm shadows with clean neutral highlights, documentary sports grade, 24fps base shutter 180 degrees, total runtime roughly ${duration} seconds. Audio: diegetic only — leather on heavy bag, feet shuffling on wooden floor, controlled breathing, chain rattle from bag sway, no music.`;
}

function sendTelegramPhoto(filePath, caption) {
  try {
    execFileSync('curl', ['-s', '-X', 'POST',
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`,
      '-F', `chat_id=${CHAT_ID}`,
      '-F', `photo=@${filePath}`,
      '-F', `caption=${caption}`
    ], { stdio: 'pipe' });
    console.log(`  Sent to Telegram: ${caption}`);
  } catch (e) {
    execFileSync('curl', ['-s', '-X', 'POST',
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendDocument`,
      '-F', `chat_id=${CHAT_ID}`,
      '-F', `document=@${filePath}`,
      '-F', `caption=${caption}`
    ], { stdio: 'pipe' });
    console.log(`  Sent as document: ${caption}`);
  }
}

async function generateScene(characterName, sceneDescription, options = {}) {
  genGuard.assertGenAllowed({ manual: options.manual === true }); // GLOBAL kill-switch
  const char = getCharacter(characterName);

  // Default model: text2image_soul_v2 for characters with soul IDs (face accuracy)
  // Fallback: nano_banana_2 with reference image, or gpt_image_2
  let model = options.model || (char.soulId ? 'text2image_soul_v2' : 'nano_banana_2');
  const modelLabels = {
    text2image_soul_v2: 'Soul V2',
    nano_banana_2: 'Nano Banana Pro',
    gpt_image_2: 'GPT Image 2'
  };
  const modelLabel = modelLabels[model] || model;

  console.log(`\nReed Scene Director`);
  console.log(`  Character: ${char.name}`);
  console.log(`  Scene: ${sceneDescription}`);
  console.log(`  Model: ${modelLabel}${char.soulId && model === 'text2image_soul_v2' ? ' + Soul ID' : ''}`);

  // Safety check
  const safety = checkSceneSafety(sceneDescription);
  if (!safety.safe) {
    console.log(`  BLOCKED: Scene contains contact/sparring — causes hallucinations. Use solo scenes only.`);
    return null;
  }

  // Stage 1: Build prompt via DeepSeek
  console.log('  Stage 1: Building scene prompt via DeepSeek...');
  const prompt = await buildScenePrompt(characterName, sceneDescription, options);

  // Stage 2: Generate via Higgsfield
  console.log(`  Stage 2: Generating via ${modelLabel}...`);

  const basename = `${char.name.toLowerCase()}-scene-${Date.now()}`;
  const outFile = path.join(OUTBOX, `${basename}.png`);

  try {
    const hfArgs = ['generate', 'create', model,
      '--prompt', prompt,
      '--aspect_ratio', '16:9'
    ];

    // Soul V2: pass soul character ID for face accuracy
    if (model === 'text2image_soul_v2' && char.soulId) {
      hfArgs.push('--custom_reference_id', char.soulId);
      hfArgs.push('--quality', '2k');
    } else {
      hfArgs.push('--resolution', '2k');
    }

    // Add reference image for nano_banana_2 / gpt_image_2
    if (options.image && model !== 'text2image_soul_v2') {
      hfArgs.push('--image', options.image);
    }

    hfArgs.push('--wait');

    const result = execFileSync('higgsfield', hfArgs, {
      encoding: 'utf-8',
      timeout: 600000
    }).trim();

    if (!result.startsWith('http')) {
      console.log(`  Unexpected result: ${result}`);
      return null;
    }

    console.log('  Downloading pass 1 result...');
    const pass1File = path.join(OUTBOX, `${basename}-pass1.png`);
    execFileSync('curl', ['-sL', result, '-o', pass1File], { timeout: 60000 });

    // Two-pass pipeline: if Soul V2 was used, run pass 2 through Nano Banana for gym grounding
    let finalFile = pass1File;
    if (model === 'text2image_soul_v2') {
      console.log('  Stage 3: Gym grounding via Nano Banana Pro (pass 2)...');
      const gymPrompt = `Place this boxer in a real Basic Reflex boxing gym in Hong Kong. Heavy bags hanging from ceiling chains, wooden laminate floor with scuff marks, colorful vintage boxing posters on grey concrete walls, dark ceiling with fluorescent and tungsten lights, mirrors along one wall, equipment racks with gloves and wraps. Preserve the subject's face, identity, pose, clothing, and expression exactly — do not alter the person. Documentary sports photography, neutral 5400K color temperature, warm shadows, clean highlights, ESPN documentary aesthetic. Hyperrealistic photography, real skin pores, fabric weave detail, Kodak Vision3 250D grain.`;

      try {
        const pass2Args = ['generate', 'create', 'nano_banana_2',
          '--prompt', gymPrompt,
          '--image', pass1File,
          '--aspect_ratio', '16:9',
          '--resolution', '2k',
          '--wait'
        ];

        const pass2Result = execFileSync('higgsfield', pass2Args, {
          encoding: 'utf-8',
          timeout: 600000
        }).trim();

        if (pass2Result.startsWith('http')) {
          execFileSync('curl', ['-sL', pass2Result, '-o', outFile], { timeout: 60000 });
          finalFile = outFile;
          console.log('  Pass 2 complete — gym grounded');
        } else {
          console.log('  Pass 2 unexpected result — using pass 1');
          fs.renameSync(pass1File, outFile);
          finalFile = outFile;
        }
      } catch (e) {
        console.log(`  Pass 2 failed: ${e.message} — using pass 1`);
        fs.renameSync(pass1File, outFile);
        finalFile = outFile;
      }
    } else {
      fs.renameSync(pass1File, outFile);
      finalFile = outFile;
    }

    const stats = fs.statSync(finalFile);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
    console.log(`  Saved: ${finalFile} (${sizeMB}MB)`);

    const passLabel = model === 'text2image_soul_v2' ? ' (2-pass)' : '';
    sendTelegramPhoto(finalFile, `Reed Scene${passLabel}: ${char.name} — ${sceneDescription}`);
    return outFile;
  } catch (e) {
    console.log(`  Failed: ${e.message}`);
    return null;
  }
}

async function generateVideo(characterName, sceneDescription, options = {}) {
  genGuard.assertGenAllowed({ manual: options.manual === true }); // GLOBAL kill-switch
  const duration = options.duration || 5;
  const char = getCharacter(characterName);

  console.log(`\nReed Video Director`);
  console.log(`  Character: ${char.name}`);
  console.log(`  Scene: ${sceneDescription}`);
  console.log(`  Duration: ${duration}s`);

  const safety = checkSceneSafety(sceneDescription);
  if (!safety.safe) {
    console.log(`  BLOCKED: Scene contains contact/sparring. Solo scenes only.`);
    return null;
  }

  // Stage 1: Build video prompt
  console.log('  Stage 1: Building video prompt via DeepSeek...');
  const prompt = await buildVideoPrompt(characterName, sceneDescription, duration);

  // Stage 2: Generate via Seedance
  console.log('  Stage 2: Generating via Seedance 2.0...');

  const basename = `${char.name.toLowerCase()}-video-${Date.now()}`;
  const outFile = path.join(OUTBOX, `${basename}.mp4`);

  try {
    const hfArgs = ['generate', 'create', 'seedance_2_0',
      '--prompt', prompt,
      '--aspect_ratio', '16:9',
      '--duration', String(duration),
      '--wait'
    ];

    if (options.image) {
      hfArgs.push('--start-image', options.image);
    }

    const result = execFileSync('higgsfield', hfArgs, {
      encoding: 'utf-8',
      timeout: 600000
    }).trim();

    if (!result.startsWith('http')) {
      console.log(`  Unexpected result: ${result}`);
      return null;
    }

    console.log('  Downloading result...');
    execFileSync('curl', ['-sL', result, '-o', outFile], { timeout: 120000 });

    const stats = fs.statSync(outFile);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
    console.log(`  Saved: ${outFile} (${sizeMB}MB)`);

    // Send video to Telegram
    execFileSync('curl', ['-s', '-X', 'POST',
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendVideo`,
      '-F', `chat_id=${CHAT_ID}`,
      '-F', `video=@${outFile}`,
      '-F', `caption=Reed Video: ${char.name} — ${sceneDescription} (${duration}s)`
    ], { stdio: 'pipe', timeout: 120000 });
    console.log(`  Sent video to Telegram`);

    return outFile;
  } catch (e) {
    console.log(`  Failed: ${e.message}`);
    return null;
  }
}

// Also export for pure environment (no character) scenes
async function generateEnvironment(sceneDescription, options = {}) {
  genGuard.assertGenAllowed({ manual: options.manual === true }); // GLOBAL kill-switch
  const model = options.model || 'nano_banana_2';
  const gym = registry.gym;

  console.log(`\nReed Environment Plate`);
  console.log(`  Scene: ${sceneDescription}`);

  const envSystem = `You are a cinematographer writing environment plate prompts for a boxing gym. No people in frame. Pure atmosphere.

RULES:
- No people, no silhouettes, no figures
- Only gym environment elements: bags, ring, floor, equipment, light, atmosphere
- Color: 5200-5600K neutral. Never orange. Documentary feel.
- Camera: ARRI Alexa Mini LF, Panavision Ultra Vintage anamorphic 35-55mm T2.3, locked-off or extremely slow push
- Include: dust particles, atmospheric haze, weathered material detail, real surface textures
- End with Kodak Vision3 250D film emulation, fine grain, neutral grade

Output ONLY the prompt text. Single paragraph. No labels.`;

  let prompt;
  if (DEEPSEEK_API_KEY) {
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
            { role: 'system', content: envSystem },
            { role: 'user', content: `GYM: ${gym.visualLock}\nSCENE: ${sceneDescription}` }
          ],
          temperature: 0.4,
          max_tokens: 500
        })
      });
      const data = await response.json();
      prompt = data.choices?.[0]?.message?.content?.trim();
    } catch (e) {
      console.log(`  DeepSeek failed: ${e.message}`);
    }
  }

  if (!prompt || prompt.length < 100) {
    prompt = `${gym.visualLock} ${sceneDescription}. Shot on ARRI Alexa Mini LF, Panavision Ultra Vintage anamorphic 40mm at T2.3, locked-off tripod, deep depth of field, Kodak Vision3 250D film emulation with fine 400 ASA grain, neutral 5500K color temperature, atmospheric haze with dust particles suspended in light beams, weathered surfaces, real material textures. No people, no silhouettes. The environment is the subject.`;
  }

  const basename = `gym-env-${Date.now()}`;
  const outFile = path.join(OUTBOX, `${basename}.png`);

  try {
    const hfArgs = ['generate', 'create', model,
      '--prompt', prompt,
      '--aspect_ratio', '16:9',
      '--resolution', '2k',
      '--wait'
    ];

    if (options.image) {
      hfArgs.push('--image', options.image);
    }

    const result = execFileSync('higgsfield', hfArgs, {
      encoding: 'utf-8',
      timeout: 600000
    }).trim();

    if (!result.startsWith('http')) {
      console.log(`  Unexpected result: ${result}`);
      return null;
    }

    execFileSync('curl', ['-sL', result, '-o', outFile], { timeout: 60000 });
    console.log(`  Saved: ${outFile}`);
    sendTelegramPhoto(outFile, `Reed Environment: ${sceneDescription}`);
    return outFile;
  } catch (e) {
    console.log(`  Failed: ${e.message}`);
    return null;
  }
}

// Export for use by telegram-bot.js
export { generateScene, generateVideo, generateEnvironment, buildScenePrompt, buildVideoPrompt, getCharacter, registry };

// CLI mode
const rawArgs = process.argv.slice(2);
if (rawArgs.length > 0) {
  let character = null;
  let scene = null;
  let mode = 'scene'; // scene | video | env
  let model = null; // null = let generateScene pick based on soul ID availability
  let image = null;
  let duration = 5;

  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === '--character' && rawArgs[i + 1]) character = rawArgs[++i];
    else if (rawArgs[i] === '--scene' && rawArgs[i + 1]) scene = rawArgs[++i];
    else if (rawArgs[i] === '--video') mode = 'video';
    else if (rawArgs[i] === '--env') mode = 'env';
    else if (rawArgs[i] === '--model' && rawArgs[i + 1]) {
      const val = rawArgs[++i].toLowerCase();
      model = val === 'gpt' ? 'gpt_image_2' : 'nano_banana_2';
    }
    else if (rawArgs[i] === '--image' && rawArgs[i + 1]) image = rawArgs[++i];
    else if (rawArgs[i] === '--duration' && rawArgs[i + 1]) duration = parseInt(rawArgs[++i]);
    else if (!scene) scene = rawArgs[i];
  }

  if (!scene) {
    console.log('Usage:');
    console.log('  node reed-scene-director.js --character logan --scene "training on heavy bag"');
    console.log('  node reed-scene-director.js --character maya --scene "wrapping hands" --video');
    console.log('  node reed-scene-director.js --env "empty gym at dawn"');
    console.log('  node reed-scene-director.js --character logan --scene "shadow boxing" --model gpt --image ref.jpg');
    process.exit(1);
  }

  try {
    if (mode === 'env') {
      await generateEnvironment(scene, { model: model || 'nano_banana_2', image, manual: true }); // CLI = human-triggered
    } else if (mode === 'video') {
      if (!character) { console.log('--character required for video'); process.exit(1); }
      await generateVideo(character, scene, { image, duration, manual: true });
    } else {
      if (!character) { console.log('--character required for scene'); process.exit(1); }
      await generateScene(character, scene, { model, image, manual: true });
    }
  } catch (e) {
    console.log(`🚫 ${e.message}`);
    process.exit(1);
  }

  process.exit(0);
}
