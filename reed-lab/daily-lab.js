import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import 'dotenv/config';

const INBOX = path.join(process.env.HOME, 'nanoclaw', 'reed-inbox');
const CALIBRATION = path.join(process.env.HOME, 'Downloads', 'upgraded standard');
const OUTPUT_DIR = path.join(process.env.HOME, 'cathedral-vault', '09_Artifacts', 'branding', 'basic-reflex', 'reed-lab');
const CATALOGUE = path.join(process.env.HOME, 'nanoclaw', 'reed-lab', 'catalogue.json');
const SHOT_LIST = path.join(process.env.HOME, 'nanoclaw', 'reed-lab', 'shot-list.json');
const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.PAUL_CHAT_ID;

const SOUL_ID = '2a825762-9d13-4d93-9324-32fe5d5db803'; // Cloud Whisperer (Paul/Logan)

// ── PROVEN RECIPES (image-to-image, need source photo) ──────────────────────
const RECIPES = {
  pro_photo: {
    name: 'Pro Photo', model: 'nano_banana_2', aspect: '16:9',
    prompt: 'Apply a high-end commercial retouch. Maintain 100% preservation of subject identity, poses, clothing, and all background elements. 16:9 cinematic. Sony A7R V, 70mm lens, deep crisp focus throughout. Soft directional key light from camera-left, diminish harsh overhead fluorescents. Warm golden sports documentary color grade. Saturate wall posters and artwork. Enhance wood floor grain and leather bag textures with age patina. Subtle vignette. Natural skin tones. No hallucinations, do not add or remove objects or people. Professional Lightroom grade of original raw file.'
  },
  manga: {
    name: 'Manga', model: 'nano_banana_2', aspect: '3:4',
    prompt: 'Convert this photograph into a detailed manga illustration. Warm sepia and earth tones with golden light rays through windows. Ink-style cross-hatching and clean linework. Preserve all architectural details, equipment placement, brand text (Lonsdale, Basic Reflex), and wall posters exactly. Enhance foreground detail: gym bags, gloves, rope, floor texture. Professional manga environment art quality. Do not add or remove any people. Convert only what exists in the photo.'
  },
  noir: {
    name: 'Film Noir', model: 'nano_banana_2', aspect: '16:9',
    prompt: 'Film noir boxing photograph. Pure black and white with deep inky shadows. 1940s fight night atmosphere. Single harsh overhead light creating dramatic pools of light and shadow. Film grain, slight motion blur on the punch. Smoky atmosphere. Preserve subject identity and pose exactly. Classic noir cinematography, high contrast, no midtones.'
  },
  ippo: {
    name: 'Ippo Shonen', model: 'nano_banana_2', aspect: '3:4',
    prompt: 'Japanese boxing manga panel in the style of Hajime no Ippo. Dynamic action lines radiating from the punch impact. Speed lines, motion blur on fists. Bold ink outlines, screentone shading. Dramatic low angle. Sweat droplets frozen mid-air. Japanese sound effect text near impact. Professional weekly shonen manga quality. Preserve exact poses and gym environment.'
  },
  neon: {
    name: 'HK Neon', model: 'nano_banana_2', aspect: '16:9',
    prompt: 'Hong Kong cyberpunk boxing gym. Neon signs reflecting off rain-slicked floors in pink, blue, and amber. Chinese characters glowing on walls. Atmospheric fog catching neon light. Dark moody shadows with electric color pops. Blade Runner meets boxing gym. Preserve subject identity and pose. Cinematic 2.39:1 anamorphic feel.'
  },
  dramatic: {
    name: 'Dramatic Cinema', model: 'nano_banana_2', aspect: '16:9',
    prompt: 'Dramatic cinematic reimagining. Volumetric haze and atmospheric fog filling the gym. Golden god rays streaming through windows. Heavy chiaroscuro lighting with deep shadows. Film grain texture. Preserve subject identity and pose but add dramatic atmosphere: backlit silhouette depth, warm amber tones, dust particles in light beams. Boxing gym atmosphere. Sports documentary cinematography at golden hour.'
  },
  poster: {
    name: '70s Fight Poster', model: 'nano_banana_2', aspect: '3:4',
    prompt: 'Vintage 1970s boxing fight poster. Aged yellowed paper texture with fold creases. Bold sans-serif typography at top: BASIC REFLEX. Halftone dot printing effect. Red, black, and cream color palette. Retro sports illustration style inspired by Muhammad Ali era fight posters. Border frame with decorative corners. Preserve subject identity and action pose.'
  },
  // Video from photo
  video_cinematic: {
    name: 'Cinematic Video', model: 'seedance_2_0', aspect: '16:9', type: 'video',
    prompt: 'Subtle cinematic motion. Camera slowly pushes in. Atmospheric lighting shifts — dust particles drift through warm light beams. Leather bag sways gently. Documentary feel, film grain.'
  },
  video_dramatic: {
    name: 'Dramatic Video', model: 'seedance_2_0', aspect: '16:9', type: 'video',
    prompt: 'Dramatic slow-motion boxing movement. Volumetric haze drifts across gym. Light rays shift through windows. Sweat droplets catch the light. Epic sports documentary cinematography.'
  },
  // Instagram stories/reels (9:16)
  reel_noir: {
    name: 'Noir Reel', model: 'nano_banana_2', aspect: '9:16',
    prompt: 'Film noir boxing photograph. Pure black and white with deep inky shadows. 1940s fight night atmosphere. Single harsh overhead light. Film grain, smoky atmosphere. Preserve subject identity and pose exactly. Vertical composition for mobile viewing. High contrast, no midtones.'
  },
  reel_neon: {
    name: 'Neon Reel', model: 'nano_banana_2', aspect: '9:16',
    prompt: 'Hong Kong cyberpunk boxing gym. Neon signs reflecting in pink, blue, and amber. Chinese characters glowing. Atmospheric fog catching neon light. Dark moody shadows with electric color pops. Vertical mobile composition. Cinematic depth.'
  }
};

// ── GENERATIVE RECIPES (no source photo needed — creates from prompt) ────────
const GENERATIVE_SCENES = [
  {
    name: 'Logan — Victoria Peak sunrise',
    model: 'text2image_soul_v2', useSoul: true,
    prompt: 'Athletic man with long dreadlocks standing on Victoria Peak at sunrise, Hong Kong skyline behind, morning golden light, wearing deep maroon athletic shirt with BR logo on left chest, black boxing shorts with white trim, contemplative pose looking over the city. Cinematic 16:9, sports documentary feel.',
    aspect: '16:9'
  },
  {
    name: 'Logan — Heavy bag work',
    model: 'text2image_soul_v2', useSoul: true,
    prompt: 'Athletic man with long dreadlocks and full beard throwing a powerful cross at a heavy Lonsdale leather bag in a Hong Kong boxing gym. Wearing deep maroon athletic shirt, black shorts. Sweat, focus, mid-impact. Warm directional lighting. Sports documentary cinematography.',
    aspect: '16:9'
  },
  {
    name: 'Logan — Shadow boxing at dawn',
    model: 'text2image_soul_v2', useSoul: true,
    prompt: 'Athletic man with long dreadlocks shadow boxing alone in an empty boxing gym at dawn. Golden morning light streaming through industrial windows. Wearing deep maroon shirt, black shorts. Meditative focus. Dust particles in light beams. Cinematic.',
    aspect: '16:9'
  },
  {
    name: 'Logan — Coaching moment',
    model: 'text2image_soul_v2', useSoul: true,
    prompt: 'Athletic man with long dreadlocks and beard coaching a student on boxing technique in a Hong Kong gym. Adjusting their stance with one hand, explaining with the other. BASIC posters on concrete walls behind. Warm golden light. Sports documentary feel.',
    aspect: '16:9'
  },
  {
    name: 'Logan — Neon Hong Kong streets',
    model: 'text2image_soul_v2', useSoul: true,
    prompt: 'Athletic man with long dreadlocks walking through neon-lit Hong Kong streets at night. Wearing maroon athletic shirt. Chinese neon signs reflected in wet pavement. Pink, blue, amber glow. Cinematic cyberpunk atmosphere. Blade Runner meets boxing.',
    aspect: '16:9'
  },
  {
    name: 'Gym — Empty golden hour',
    model: 'nano_banana_2', useSoul: false,
    prompt: 'Empty Hong Kong boxing gym at golden hour. Five Lonsdale leather heavy bags hanging from chains. Concrete walls with colorful BASIC REFLEX posters. Golden light streaming through industrial windows casting long shadows on wood floor. Atmospheric, warm, inviting. Sports documentary photography.',
    aspect: '16:9'
  },
  {
    name: 'Gym — Noir atmosphere',
    model: 'nano_banana_2', useSoul: false,
    prompt: 'Empty boxing gym in pure black and white. Single overhead light. Heavy bags as dark silhouettes. Film grain. Smoky atmosphere. Noir cinematography. The space between rounds.',
    aspect: '16:9'
  },
  {
    name: 'Logan — Manga cover',
    model: 'text2image_soul_v2', useSoul: true,
    prompt: 'Manga cover art. Athletic man with long dreadlocks in fighting stance, fists wrapped, wearing maroon shirt with BR logo. Dynamic action pose with speed lines and Japanese text effects. Bold ink outlines, screentone shading. Title space at top. Professional weekly shonen manga quality.',
    aspect: '3:4'
  }
];

// ── EXPERIMENTAL RECIPES (rotate one new idea per night) ─────────────────────
const EXPERIMENTAL = [
  { name: 'Watercolor', aspect: '16:9', prompt: 'Watercolor painting of a boxing scene. Wet-on-wet technique, paint bleeding at edges, visible paper texture. Loose brushwork with areas of rich pigment and areas of bare paper. Soft edges on movement, sharp edges on faces. Cool blues and warm ambers. Gallery quality watercolor.' },
  { name: 'Ukiyo-e Woodblock', aspect: '3:4', prompt: 'Japanese ukiyo-e woodblock print of a boxing scene. Flat color areas with bold black outlines. Traditional Japanese composition with diagonal energy. Waves and cloud patterns in background. Limited color palette: indigo, vermillion, ochre, black. Visible wood grain texture in print.' },
  { name: 'Street Art Mural', aspect: '16:9', prompt: 'Street art mural on a concrete wall. Spray paint texture, drips, stencil layers. Bold colors — red, black, gold. Mixed media: wheat-paste elements, tags, throw-ups. Urban grit meets boxing power. Hong Kong back alley wall.' },
  { name: 'Sports Illustrated Cover', aspect: '3:4', prompt: 'Sports Illustrated magazine cover. Clean white border. Bold red SI logo space at top. Dramatic sports photography — frozen action, sharp focus on subject, slightly blurred background. Professional editorial lighting. Cover line text space at bottom. Glossy magazine quality.' },
  { name: 'Double Exposure', aspect: '16:9', prompt: 'Double exposure photograph. Boxer silhouette filled with Hong Kong cityscape — neon signs, harbor, skyscrapers. Second exposure bleeds at edges. Moody blue and amber tones. Film photography aesthetic. Conceptual art meets sports.' },
  { name: 'Risograph Print', aspect: '3:4', prompt: 'Risograph print of boxing scene. Limited 3-color separation: fluorescent pink, deep blue, bright yellow. Visible halftone dots, slight misregistration between layers. Textured paper stock. Indie zine aesthetic. Bold graphic design.' },
  { name: 'Renaissance Fresco', aspect: '16:9', prompt: 'Renaissance fresco painting of a boxing scene. Cracked plaster texture. Michelangelo-style muscular anatomy. Dramatic foreshortening. Classical composition with golden ratio. Earthy pigments: terre verte, burnt sienna, ultramarine. Cathedral ceiling perspective.' },
  { name: 'Synthwave', aspect: '16:9', prompt: 'Synthwave retrowave boxing scene. Neon grid floor, purple and pink sunset gradient sky behind gym. Chrome reflections, VHS scanlines, lens flare. 1980s aesthetic. Glowing outlines on figures. Retrofuturistic Hong Kong.' },
  { name: 'Ink Wash', aspect: '16:9', prompt: 'Chinese ink wash painting (sumi-e) of boxing. Minimalist brushstrokes — black ink on rice paper. Negative space as compositional element. Few precise strokes capture the essence of the punch. Red seal stamp in corner. Zen calligraphy aesthetic.' },
  { name: 'Polaroid Memory', aspect: '1:1', prompt: 'Vintage Polaroid photograph. White border frame. Slightly overexposed, warm color shift, soft focus at edges. Nostalgic faded colors. Natural candid moment in the gym. The feel of a photo found in a shoebox. Square format.' },
];

// Nightly: proven styles + 1 experimental + 1 video + 1 generative scene
const NIGHTLY_STYLES = ['pro_photo', 'noir', 'dramatic'];
const WEEKLY_BONUS = ['ippo', 'neon', 'manga', 'poster']; // Sunday gets all

function loadCatalogue() {
  if (fs.existsSync(CATALOGUE)) return JSON.parse(fs.readFileSync(CATALOGUE, 'utf8'));
  return { photos: [], generations: [], stats: { total_generated: 0, by_style: {} } };
}

function saveCatalogue(cat) {
  fs.writeFileSync(CATALOGUE, JSON.stringify(cat, null, 2));
}

function getNewPhotos() {
  const photos = [];
  if (fs.existsSync(INBOX)) {
    const files = fs.readdirSync(INBOX).filter(f => /\.(jpg|jpeg|png|heic)$/i.test(f));
    photos.push(...files.map(f => path.join(INBOX, f)));
  }
  return photos;
}

function getRandomCalibration(catalogue) {
  if (!fs.existsSync(CALIBRATION)) return null;
  const originals = fs.readdirSync(CALIBRATION).filter(f => f.startsWith('origonal'));
  const unused = originals.filter(f => {
    const full = path.join(CALIBRATION, f);
    return !catalogue.photos.some(p => p.source === full && p.fully_processed);
  });
  if (unused.length === 0) return null;
  return path.join(CALIBRATION, unused[Math.floor(Math.random() * unused.length)]);
}

function upscaleIfNeeded(imgPath) {
  const dimInfo = execSync(`sips -g pixelWidth -g pixelHeight "${imgPath}"`, { encoding: 'utf-8' });
  const pw = parseInt(dimInfo.match(/pixelWidth:\s*(\d+)/)?.[1] || '0');
  const ph = parseInt(dimInfo.match(/pixelHeight:\s*(\d+)/)?.[1] || '0');
  if (Math.max(pw, ph) < 700) {
    const scale = Math.ceil(1400 / Math.max(pw, ph));
    const upscaled = imgPath.replace(/(\.\w+)$/, `-upscaled$1`);
    execSync(`sips --resampleWidth ${pw * scale} "${imgPath}" --out "${upscaled}"`, { timeout: 10000 });
    console.log(`[reed-lab] Upscaled ${pw}x${ph} -> ${pw * scale}px`);
    return upscaled;
  }
  return imgPath;
}

function generate(imgPath, recipe) {
  const model = recipe.model || 'nano_banana_2';
  const isVideo = recipe.type === 'video';
  let cmd;

  if (isVideo) {
    cmd = `higgsfield generate create ${model} --prompt "${recipe.prompt}" --start-image "${imgPath}" --duration 5 --aspect_ratio ${recipe.aspect} --wait`;
  } else {
    cmd = `higgsfield generate create ${model} --prompt "${recipe.prompt}" --image "${imgPath}" --aspect_ratio ${recipe.aspect} --resolution 2k --wait`;
  }

  try {
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 600000 }).trim();
    if (result.startsWith('http')) return result;
    // Check for job ID (failed status)
    if (result.includes('failed')) { console.error(`[reed-lab] Generation failed: ${result}`); return null; }
    console.error(`[reed-lab] Unexpected result: ${result.slice(0, 100)}`);
    return null;
  } catch (err) {
    console.error(`[reed-lab] Generation failed: ${err.message.slice(0, 100)}`);
    return null;
  }
}

function generateFromPrompt(scene) {
  const model = scene.model || 'nano_banana_2';
  let cmd;

  if (scene.useSoul) {
    cmd = `higgsfield generate create ${model} --prompt "${scene.prompt}" --soul-id ${SOUL_ID} --aspect_ratio ${scene.aspect} --wait`;
  } else {
    cmd = `higgsfield generate create ${model} --prompt "${scene.prompt}" --aspect_ratio ${scene.aspect} --resolution 2k --wait`;
  }

  try {
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 600000 }).trim();
    if (result.startsWith('http')) return result;
    if (result.includes('failed')) { console.error(`[reed-lab] Scene failed: ${result}`); return null; }
    return null;
  } catch (err) {
    console.error(`[reed-lab] Scene failed: ${err.message.slice(0, 100)}`);
    return null;
  }
}

function downloadAndSave(url, sourceName, styleName) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const safeName = sourceName.replace(/[^a-zA-Z0-9-]/g, '_');
  const filename = `${dateStr}_${safeName}_${styleName}.jpg`;
  const outDir = path.join(OUTPUT_DIR, dateStr);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, filename);
  const tmpPng = `/tmp/reed-lab-${Date.now()}.png`;
  execSync(`curl -sL "${url}" -o "${tmpPng}"`, { timeout: 60000 });
  execSync(`sips -s format jpeg -s formatOptions 90 "${tmpPng}" --out "${outPath}"`, { timeout: 30000 });
  try { fs.unlinkSync(tmpPng); } catch {}
  return outPath;
}

async function sendToTelegram(photoPath, caption) {
  const FormData = (await import('form-data')).default;
  const form = new FormData();
  form.append('chat_id', CHAT_ID);
  form.append('photo', fs.createReadStream(photoPath));
  form.append('caption', caption);
  const resp = await fetch(`https://api.telegram.org/bot${TOKEN}/sendPhoto`, {
    method: 'POST',
    body: form
  });
  const data = await resp.json();
  if (!data.ok) console.error(`[reed-lab] Telegram send failed: ${JSON.stringify(data)}`);
  return data.ok;
}

async function sendText(text) {
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text })
  });
}

async function run() {
  console.log('[reed-lab] Daily Lab starting...');
  const catalogue = loadCatalogue();
  const isSunday = new Date().getDay() === 0;
  const styles = isSunday ? [...NIGHTLY_STYLES, ...WEEKLY_BONUS] : NIGHTLY_STYLES;

  // Get photos to process
  let photos = getNewPhotos();
  if (photos.length === 0) {
    const calibration = getRandomCalibration(catalogue);
    if (calibration) {
      photos = [calibration];
      console.log(`[reed-lab] No inbox photos. Using calibration: ${path.basename(calibration)}`);
    } else {
      console.log('[reed-lab] No photos to process. Skipping.');
      await sendText('🎬 Reed Lab: No new photos in inbox. Drop photos in ~/nanoclaw/reed-inbox/');
      return;
    }
  }

  // Limit to 2 photos per night (cost control)
  photos = photos.slice(0, 2);

  await sendText(`🎬 Reed Daily Lab\n${photos.length} photo(s) × ${styles.length} styles = ${photos.length * styles.length} generations\n${isSunday ? '🌟 Sunday bonus: all styles!' : 'Nightly set: pro, noir, dramatic'}`);

  const results = [];

  for (const photo of photos) {
    const sourceName = path.basename(photo, path.extname(photo));
    const processedPath = upscaleIfNeeded(photo);
    console.log(`[reed-lab] Processing: ${sourceName}`);

    for (const styleKey of styles) {
      const recipe = RECIPES[styleKey];
      console.log(`[reed-lab]   Style: ${recipe.name}`);
      const url = generate(processedPath, recipe);
      if (!url) continue;

      const savedPath = downloadAndSave(url, sourceName, styleKey);
      await sendToTelegram(savedPath, `🎬 Reed Lab: ${sourceName} — ${recipe.name}`);

      results.push({
        source: photo,
        style: styleKey,
        output: savedPath,
        url,
        date: new Date().toISOString()
      });

      catalogue.stats.total_generated++;
      catalogue.stats.by_style[styleKey] = (catalogue.stats.by_style[styleKey] || 0) + 1;

      // 2s pause between generations
      await new Promise(r => setTimeout(r, 2000));
    }

    // Track source photo
    const existing = catalogue.photos.find(p => p.source === photo);
    if (existing) {
      existing.last_processed = new Date().toISOString();
      existing.styles_done = [...new Set([...(existing.styles_done || []), ...styles])];
      existing.fully_processed = existing.styles_done.length >= Object.keys(RECIPES).length;
    } else {
      catalogue.photos.push({
        source: photo,
        added: new Date().toISOString(),
        last_processed: new Date().toISOString(),
        styles_done: [...styles],
        fully_processed: styles.length >= Object.keys(RECIPES).length
      });
    }

    // Move inbox photos to processed
    if (photo.startsWith(INBOX)) {
      const processedDir = path.join(INBOX, 'processed');
      if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir);
      fs.renameSync(photo, path.join(processedDir, path.basename(photo)));
    }
  }

  // ── PHASE 2: One video from best photo ──────────────────────────────────
  if (photos.length > 0) {
    const bestPhoto = upscaleIfNeeded(photos[0]);
    const videoRecipe = RECIPES.video_cinematic;
    console.log(`[reed-lab] Generating video from: ${path.basename(bestPhoto)}`);
    const videoUrl = generate(bestPhoto, videoRecipe);
    if (videoUrl) {
      const dateStr = new Date().toISOString().slice(0, 10);
      const outDir = path.join(OUTPUT_DIR, dateStr);
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      const videoPath = path.join(outDir, `${dateStr}_video_cinematic.mp4`);
      execSync(`curl -sL "${videoUrl}" -o "${videoPath}"`, { timeout: 120000 });
      // Send video to Telegram
      const FormData = (await import('form-data')).default;
      const form = new FormData();
      form.append('chat_id', CHAT_ID);
      form.append('document', fs.createReadStream(videoPath));
      form.append('caption', `🎬 Reed Lab: Cinematic video — ${path.basename(photos[0])}`);
      await fetch(`https://api.telegram.org/bot${TOKEN}/sendDocument`, { method: 'POST', body: form });
      results.push({ source: photos[0], style: 'video_cinematic', output: videoPath, url: videoUrl, date: new Date().toISOString() });
      catalogue.stats.total_generated++;
      catalogue.stats.by_style.video_cinematic = (catalogue.stats.by_style.video_cinematic || 0) + 1;
    }
  }

  // ── PHASE 3: One experimental recipe (rotates daily) ───────────────────
  if (photos.length > 0) {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    const expIdx = dayOfYear % EXPERIMENTAL.length;
    const experiment = EXPERIMENTAL[expIdx];
    const expRecipe = { name: experiment.name, model: 'nano_banana_2', aspect: experiment.aspect, prompt: experiment.prompt };
    console.log(`[reed-lab] Experiment #${expIdx}: ${experiment.name}`);
    const expUrl = generate(upscaleIfNeeded(photos[0]), expRecipe);
    if (expUrl) {
      const savedPath = downloadAndSave(expUrl, path.basename(photos[0], path.extname(photos[0])), `exp_${experiment.name.toLowerCase().replace(/\W/g, '_')}`);
      await sendToTelegram(savedPath, `🧪 Reed Experiment: ${experiment.name}`);
      results.push({ source: photos[0], style: `experiment_${experiment.name}`, output: savedPath, url: expUrl, date: new Date().toISOString() });
      catalogue.stats.total_generated++;
    }
  }

  // ── PHASE 4: One generative scene (rotates daily) ──────────────────────
  {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    const sceneIdx = dayOfYear % GENERATIVE_SCENES.length;
    const scene = GENERATIVE_SCENES[sceneIdx];
    console.log(`[reed-lab] Generative scene: ${scene.name}`);
    const sceneUrl = generateFromPrompt(scene);
    if (sceneUrl) {
      const savedPath = downloadAndSave(sceneUrl, scene.name.toLowerCase().replace(/\W/g, '_'), 'generated');
      await sendToTelegram(savedPath, `🎬 Reed Lab: ${scene.name} (generated)`);
      results.push({ source: 'generative', style: scene.name, output: savedPath, url: sceneUrl, date: new Date().toISOString() });
      catalogue.stats.total_generated++;
      catalogue.stats.by_style[`gen_${scene.name}`] = (catalogue.stats.by_style[`gen_${scene.name}`] || 0) + 1;
    }
  }

  catalogue.generations.push(...results);
  saveCatalogue(catalogue);

  const summary = `🎬 Reed Lab complete
${results.length} total outputs:
• ${results.filter(r => !r.style.startsWith('experiment') && r.source !== 'generative' && !r.style.includes('video')).length} styled photos
• ${results.filter(r => r.style.includes('video')).length} videos
• ${results.filter(r => r.style.startsWith('experiment')).length} experiments
• ${results.filter(r => r.source === 'generative').length} generated scenes
Catalogue total: ${catalogue.stats.total_generated}
Saved to: reed-lab/${new Date().toISOString().slice(0, 10)}/`;

  await sendText(summary);
  console.log(`[reed-lab] Done. ${results.length} generated.`);
}

// Shot list system — Reed assigns photo tasks
async function sendShotList() {
  const catalogue = loadCatalogue();

  // Define what a complete gym visual story needs
  const SUBJECTS = [
    { tag: 'sparring', desc: 'Two people sparring — mid-exchange, caught in action', have: 0, need: 3 },
    { tag: 'padwork', desc: 'Pad work — coach feeding, student throwing', have: 0, need: 3 },
    { tag: 'bagwork', desc: 'Heavy bag — single person, full power shot', have: 0, need: 2 },
    { tag: 'bodyshot', desc: 'Body shots — close-up of body punch landing on pads/bag', have: 0, need: 2 },
    { tag: 'defense', desc: 'Defense — slip, roll, or parry caught mid-move', have: 0, need: 2 },
    { tag: 'footwork', desc: 'Footwork — lateral movement, pivot, stance transitions', have: 0, need: 2 },
    { tag: 'gym_empty', desc: 'Empty gym — golden hour, atmosphere, the space itself', have: 0, need: 2 },
    { tag: 'gym_class', desc: 'Full class in session — wide shot, energy, group', have: 0, need: 2 },
    { tag: 'details_gloves', desc: 'Close-up: gloves, wraps, lacing up', have: 0, need: 2 },
    { tag: 'details_bags', desc: 'Close-up: bag leather, chains, Lonsdale branding', have: 0, need: 1 },
    { tag: 'details_floor', desc: 'Close-up: floor, feet positioning, stance', have: 0, need: 1 },
    { tag: 'warmup', desc: 'Warm-up — stretching, skipping, shadow boxing', have: 0, need: 2 },
    { tag: 'student_moment', desc: 'Student moments — tying laces, water break, toweling off, focus face', have: 0, need: 3 },
    { tag: 'coaching', desc: 'Coaching — Paul explaining technique, adjusting stance, demo', have: 0, need: 2 },
    { tag: 'posters', desc: 'The BASIC posters on the wall — straight on, good light', have: 0, need: 1 },
    { tag: 'entrance', desc: 'Gym entrance/door — the arrival moment', have: 0, need: 1 },
  ];

  // Count what we have from catalogue filenames
  for (const subject of SUBJECTS) {
    subject.have = catalogue.photos.filter(p => {
      const name = path.basename(p.source).toLowerCase();
      return name.includes(subject.tag) ||
        (subject.tag === 'sparring' && name.includes('spar')) ||
        (subject.tag === 'gym_empty' && name.includes('bags') && !name.includes('class')) ||
        (subject.tag === 'gym_class' && name.includes('class'));
    }).length;
  }

  // Find gaps — subjects with have < need
  const gaps = SUBJECTS.filter(s => s.have < s.need)
    .sort((a, b) => (a.have / a.need) - (b.have / b.need));

  // Pick top 3 assignments for today
  const assignments = gaps.slice(0, 3);

  if (assignments.length === 0) {
    await sendText('🎬 Reed: Shot list complete. Full coverage. Time for new subjects.');
    return;
  }

  let msg = '🎬 Reed — Today\'s Shot List\n\n';
  assignments.forEach((a, i) => {
    const status = a.have > 0 ? `(have ${a.have}/${a.need})` : '(MISSING)';
    msg += `${i + 1}. ${a.desc} ${status}\n`;
  });
  msg += '\nDrop photos in ~/nanoclaw/reed-inbox/ or send with /reed on Telegram.';
  msg += '\nTag with subject name in caption for tracking.';

  await sendText(msg);

  // Save shot list state
  fs.writeFileSync(SHOT_LIST, JSON.stringify({
    date: new Date().toISOString(),
    assignments,
    full_list: SUBJECTS
  }, null, 2));
}

// CLI modes
const mode = process.argv[2];
if (mode === '--shots') {
  sendShotList().catch(console.error);
} else {
  run().catch(console.error);
}
