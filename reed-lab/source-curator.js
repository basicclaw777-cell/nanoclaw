#!/usr/bin/env node
// Reed Source Curator — organized photo selection for generation
// Replaces random selection with curated folders + taste-guided rotation
//
// Structure:
//   reed-sources/
//     hero/          — Paul's best picks. Always prioritized.
//     gym-empty/     — Empty gym atmosphere shots
//     padwork/       — Pad work action
//     bagwork/       — Heavy bag action
//     sparring/      — Sparring moments
//     coaching/      — Paul coaching
//     members/       — Member moments
//     details/       — Close-ups: gloves, bags, floor
//     cuba/          — Cuba boxing footage
//     logan/         — Logan character references
//     experiments/   — Wild cards for experimentation
//
// Each folder can have a taste.json with preferences:
//   { "styles": ["noir", "dramatic"], "avoid": ["neon"], "notes": "golden hour only" }

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCES_DIR = path.join(__dirname, 'reed-sources');
const STATE_FILE = path.join(__dirname, 'source-state.json');

// Categories with priority weights and style affinities
const CATEGORIES = {
  hero:        { weight: 3, styles: ['pro_photo', 'dramatic', 'noir'], description: 'Best picks — always first' },
  'gym-empty': { weight: 2, styles: ['pro_photo', 'dramatic', 'noir', 'neon'], description: 'Empty gym atmosphere' },
  padwork:     { weight: 2, styles: ['pro_photo', 'ippo', 'dramatic'], description: 'Pad work action shots' },
  bagwork:     { weight: 2, styles: ['pro_photo', 'noir', 'dramatic'], description: 'Heavy bag work' },
  sparring:    { weight: 2, styles: ['pro_photo', 'dramatic', 'ippo'], description: 'Sparring moments' },
  coaching:    { weight: 2, styles: ['pro_photo', 'dramatic'], description: 'Paul coaching students' },
  members:     { weight: 1, styles: ['pro_photo', 'dramatic'], description: 'Member moments' },
  details:     { weight: 1, styles: ['pro_photo', 'noir', 'manga'], description: 'Close-ups: gloves, bags, texture' },
  cuba:        { weight: 1, styles: ['pro_photo', 'noir', 'dramatic', 'poster'], description: 'Cuba boxing heritage' },
  logan:       { weight: 1, styles: ['dramatic', 'neon', 'ippo', 'manga'], description: 'Logan character' },
  experiments: { weight: 1, styles: ['*'], description: 'Wild cards — any style' }
};

const IMAGE_EXTS = /\.(jpg|jpeg|png|heic|webp)$/i;

// Ensure all category folders exist
export function initFolders() {
  if (!fs.existsSync(SOURCES_DIR)) fs.mkdirSync(SOURCES_DIR, { recursive: true });
  for (const cat of Object.keys(CATEGORIES)) {
    const catDir = path.join(SOURCES_DIR, cat);
    if (!fs.existsSync(catDir)) fs.mkdirSync(catDir);
  }
  return SOURCES_DIR;
}

// Load state (tracks what's been processed + ratings)
function loadState() {
  if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  return { processed: {}, lastPick: {}, ratings: {} };
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// Get images in a category, sorted by preference
function getCategoryImages(category) {
  const catDir = path.join(SOURCES_DIR, category);
  if (!fs.existsSync(catDir)) return [];
  return fs.readdirSync(catDir)
    .filter(f => IMAGE_EXTS.test(f))
    .map(f => ({
      path: path.join(catDir, f),
      name: f,
      category
    }));
}

// Load per-folder taste overrides
function getCategoryTaste(category) {
  const tastePath = path.join(SOURCES_DIR, category, 'taste.json');
  if (fs.existsSync(tastePath)) {
    try { return JSON.parse(fs.readFileSync(tastePath, 'utf8')); } catch {}
  }
  return null;
}

// Pick tonight's images — weighted by category, avoiding repeats
export function pickNightlySet({ maxPhotos = 3, includeExperiment = true } = {}) {
  const state = loadState();
  const picks = [];
  const today = new Date().toISOString().slice(0, 10);

  // Build weighted pool
  const pool = [];
  for (const [cat, config] of Object.entries(CATEGORIES)) {
    if (cat === 'experiments' && !includeExperiment) continue;
    const images = getCategoryImages(cat);
    if (images.length === 0) continue;

    for (const img of images) {
      const key = `${cat}/${img.name}`;
      const lastUsed = state.processed[key]?.lastUsed;
      const daysSince = lastUsed ? Math.floor((Date.now() - new Date(lastUsed).getTime()) / 86400000) : 999;
      const timesUsed = state.processed[key]?.count || 0;
      const rating = state.ratings[key] || 0;

      // Freshness bonus: unused photos get huge boost
      const freshness = daysSince > 30 ? 3 : daysSince > 7 ? 2 : daysSince > 1 ? 1 : 0;
      // Rating boost: Paul-approved photos get priority
      const ratingBoost = rating >= 4 ? 2 : rating >= 3 ? 1 : 0;
      // Penalty for overuse
      const overusePenalty = timesUsed > 5 ? -2 : timesUsed > 2 ? -1 : 0;

      const score = config.weight + freshness + ratingBoost + overusePenalty;
      if (score > 0) {
        pool.push({ ...img, score, config, taste: getCategoryTaste(cat) });
      }
    }
  }

  // Sort by score (highest first), then pick top N with category diversity
  pool.sort((a, b) => b.score - a.score);

  const usedCategories = new Set();
  for (const candidate of pool) {
    if (picks.length >= maxPhotos) break;
    // Allow max 2 from same category per night
    const catCount = picks.filter(p => p.category === candidate.category).length;
    if (catCount >= 2) continue;
    picks.push(candidate);
    usedCategories.add(candidate.category);
  }

  // Record picks
  for (const pick of picks) {
    const key = `${pick.category}/${pick.name}`;
    if (!state.processed[key]) state.processed[key] = { count: 0 };
    state.processed[key].count++;
    state.processed[key].lastUsed = today;
  }
  state.lastPick[today] = picks.map(p => `${p.category}/${p.name}`);
  saveState(state);

  return picks;
}

// Get recommended styles for a picked image
export function getStylesForPick(pick) {
  const taste = pick.taste;
  const defaultStyles = pick.config?.styles || ['pro_photo'];

  if (taste) {
    let styles = taste.styles || defaultStyles;
    if (taste.avoid) {
      styles = styles.filter(s => !taste.avoid.includes(s));
    }
    return styles;
  }

  return defaultStyles;
}

// Rate an image (called from Telegram)
export function rateSource(category, filename, score) {
  const state = loadState();
  const key = `${category}/${filename}`;
  state.ratings[key] = score;
  saveState(state);
  return { key, score };
}

// Get inventory summary
export function getInventory() {
  const lines = ['REED SOURCE INVENTORY\n'];
  let totalImages = 0;

  for (const [cat, config] of Object.entries(CATEGORIES)) {
    const images = getCategoryImages(cat);
    totalImages += images.length;
    const taste = getCategoryTaste(cat);
    const tasteNote = taste ? ` [${taste.styles?.join(', ')}]` : '';
    lines.push(`${cat}: ${images.length} images (weight ${config.weight})${tasteNote}`);
    lines.push(`  ${config.description}`);
  }

  lines.push(`\nTotal: ${totalImages} curated source images`);
  lines.push(`Folders: ${SOURCES_DIR}`);
  return lines.join('\n');
}

// Seed from existing sources (one-time migration)
export function seedFromExisting() {
  initFolders();
  let seeded = 0;

  // Seed gym-empty from pro-photo inbox
  const inbox = path.join(__dirname, '..', 'pro-photo-inbox');
  if (fs.existsSync(inbox)) {
    for (const f of fs.readdirSync(inbox).filter(f => IMAGE_EXTS.test(f))) {
      const dest = path.join(SOURCES_DIR, 'gym-empty', f);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(path.join(inbox, f), dest);
        seeded++;
      }
    }
  }

  // Seed from Downloads gym images
  const gymDir = path.join(process.env.HOME, 'Downloads', 'gym images -basic reflex');
  if (fs.existsSync(gymDir)) {
    for (const f of fs.readdirSync(gymDir).filter(f => IMAGE_EXTS.test(f))) {
      const dest = path.join(SOURCES_DIR, 'gym-empty', f);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(path.join(gymDir, f), dest);
        seeded++;
      }
    }
  }

  // Seed hero from pro-photo outbox (Higgsfield best outputs)
  const outbox = path.join(__dirname, '..', 'pro-photo-outbox');
  if (fs.existsSync(outbox)) {
    for (const f of fs.readdirSync(outbox).filter(f => IMAGE_EXTS.test(f))) {
      const dest = path.join(SOURCES_DIR, 'hero', f);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(path.join(outbox, f), dest);
        seeded++;
      }
    }
  }

  // Seed from upgraded standard (calibration set)
  const calibDir = path.join(process.env.HOME, 'Downloads', 'upgraded standard');
  if (fs.existsSync(calibDir)) {
    for (const f of fs.readdirSync(calibDir).filter(f => /^origonal/i.test(f) && IMAGE_EXTS.test(f))) {
      // These are originals — categorize by name
      const dest = path.join(SOURCES_DIR, 'hero', f);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(path.join(calibDir, f), dest);
        seeded++;
      }
    }
  }

  return seeded;
}

// CLI
const cmd = process.argv[2];
if (cmd === 'init') {
  initFolders();
  console.log(`Folders created at ${SOURCES_DIR}`);
} else if (cmd === 'seed') {
  const count = seedFromExisting();
  console.log(`Seeded ${count} images from existing sources`);
} else if (cmd === 'inventory' || !cmd) {
  initFolders();
  console.log(getInventory());
} else if (cmd === 'pick') {
  const picks = pickNightlySet();
  for (const p of picks) {
    const styles = getStylesForPick(p);
    console.log(`${p.category}/${p.name} (score ${p.score}) → styles: ${styles.join(', ')}`);
  }
} else if (cmd === 'help') {
  console.log(`Reed Source Curator

Commands:
  node source-curator.js              — show inventory
  node source-curator.js init         — create folder structure
  node source-curator.js seed         — seed from existing photos
  node source-curator.js pick         — test nightly pick logic

Folders: ${SOURCES_DIR}
Drop photos into category folders. Add taste.json per folder for style overrides.`);
}
