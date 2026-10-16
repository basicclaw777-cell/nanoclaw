// Reed Image Curator — Smart source image selection
// Categorizes photos, tracks usage, ensures variety, prevents repetition
// Replaces random Kingston selection with intelligent curation

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const HOME = process.env.HOME || '/Users/basicclaw777';
const STATE_PATH = path.join(HOME, 'nanoclaw', 'reed-lab', 'curator-state.json');
const KINGSTON_INDEX = path.join(HOME, 'nanoclaw', 'reed-lab', 'kingston-media-index.json');

// Source directories — priority ordered
const SOURCES = [
  { id: 'gym-pics', path: path.join(HOME, 'Downloads/gym images -basic reflex/'), category: 'gym', priority: 1 },
  { id: 'new-gym', path: path.join(HOME, 'Downloads/new gym pics/'), category: 'gym', priority: 1 },
  { id: 'bb-folder', path: '/Volumes/KINGSTON2/external drives/black basic reflex/', category: 'gym', priority: 2 },
  { id: 'reed-inbox', path: path.join(HOME, 'nanoclaw/reed-inbox/'), category: 'inbox', priority: 0 },
];

// Content categories — what Reed looks for in images
const CATEGORIES = {
  padwork: { keywords: ['pad', 'mitt', 'focus'], weight: 1.5 },
  bagwork: { keywords: ['bag', 'heavy'], weight: 1.3 },
  coaching: { keywords: ['coach', 'teaching', 'student'], weight: 1.4 },
  gym_interior: { keywords: ['gym', 'interior', 'empty', 'equipment'], weight: 1.0 },
  portrait: { keywords: ['portrait', 'face', 'headshot'], weight: 1.2 },
  group: { keywords: ['class', 'group', 'team'], weight: 0.8 },
  action: { keywords: ['punch', 'hit', 'strike', 'spar'], weight: 1.5 },
  atmosphere: { keywords: ['light', 'shadow', 'mood', 'golden'], weight: 1.1 },
};

function loadState() {
  if (fs.existsSync(STATE_PATH)) return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
  return { images: {}, lastScan: null, totalPicks: 0 };
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// Scan all source directories, build/update image registry
export function scanSources() {
  const state = loadState();
  let newCount = 0;
  const IMAGE_RE = /\.(jpg|jpeg|png|webp|heic)$/i;

  for (const source of SOURCES) {
    if (!fs.existsSync(source.path)) continue;

    const files = fs.readdirSync(source.path).filter(f => IMAGE_RE.test(f));
    for (const file of files) {
      const fullPath = path.join(source.path, file);
      if (state.images[fullPath]) continue; // Already indexed

      // Get image dimensions for quality filtering
      let width = 0, height = 0;
      try {
        const info = execSync(`sips -g pixelWidth -g pixelHeight "${fullPath}"`, { encoding: 'utf-8', timeout: 5000 });
        width = parseInt(info.match(/pixelWidth:\s*(\d+)/)?.[1] || '0');
        height = parseInt(info.match(/pixelHeight:\s*(\d+)/)?.[1] || '0');
      } catch {}

      state.images[fullPath] = {
        source: source.id,
        category: source.category,
        filename: file,
        width, height,
        megapixels: (width * height) / 1e6,
        timesUsed: 0,
        lastUsed: null,
        grades: [],        // A/B/C/D from generation results
        avgGrade: null,
        tags: [],           // Auto-detected or manual
        priority: source.priority,
        added: new Date().toISOString()
      };
      newCount++;
    }
  }

  // Also scan Kingston index for Pedrosso collection
  try {
    if (fs.existsSync(KINGSTON_INDEX)) {
      const idx = JSON.parse(fs.readFileSync(KINGSTON_INDEX, 'utf-8'));
      const pedrosso = (idx.reedCandidates?.images || []).filter(f => f.collection === 'pedrosso');
      for (const entry of pedrosso) {
        if (state.images[entry.path]) continue;
        if (!fs.existsSync(entry.path)) continue;
        state.images[entry.path] = {
          source: 'kingston-pedrosso',
          category: 'cuba',
          filename: path.basename(entry.path),
          width: 0, height: 0, megapixels: 0,
          timesUsed: 0, lastUsed: null,
          grades: [], avgGrade: null, tags: ['pedrosso', 'cuba'],
          priority: 3,
          added: new Date().toISOString()
        };
        newCount++;
      }
    }
  } catch {}

  state.lastScan = new Date().toISOString();
  saveState(state);
  return { total: Object.keys(state.images).length, new: newCount };
}

// Pick best image for Reed — balances variety, quality, freshness
export function pickImage(opts = {}) {
  const state = loadState();
  const images = Object.entries(state.images);

  if (!images.length) {
    scanSources();
    return pickImage(opts); // Retry after scan
  }

  // Filter to existing files only
  const available = images.filter(([p]) => fs.existsSync(p));
  if (!available.length) return null;

  // Filter by category if requested
  let candidates = opts.category
    ? available.filter(([, info]) => info.category === opts.category || info.tags.includes(opts.category))
    : available;

  if (!candidates.length) candidates = available;

  // Filter out tiny images (< 0.3 megapixels)
  const quality = candidates.filter(([, info]) => info.megapixels === 0 || info.megapixels >= 0.3);
  if (quality.length > 0) candidates = quality;

  // Score each candidate
  const scored = candidates.map(([p, info]) => {
    let score = 100;

    // Penalize overuse (0-50 penalty based on times used)
    score -= Math.min(50, info.timesUsed * 10);

    // Penalize recently used (0-30 penalty, decays over 7 days)
    if (info.lastUsed) {
      const daysSince = (Date.now() - new Date(info.lastUsed).getTime()) / 86400000;
      score -= Math.max(0, 30 - daysSince * 4);
    }

    // Bonus for high-grade producers
    if (info.avgGrade !== null) {
      const gradeBonus = { A: 20, B: 10, C: 0, D: -15 };
      score += gradeBonus[info.avgGrade] || 0;
    }

    // Bonus for priority sources
    score += (3 - info.priority) * 5; // priority 0 = +15, priority 3 = 0

    // Bonus for never-used images
    if (info.timesUsed === 0) score += 25;

    // Small random factor (0-15) for variety
    score += Math.random() * 15;

    return { path: p, info, score };
  });

  // Sort by score descending, pick top
  scored.sort((a, b) => b.score - a.score);
  const pick = scored[0];

  // Record usage
  state.images[pick.path].timesUsed++;
  state.images[pick.path].lastUsed = new Date().toISOString();
  state.totalPicks++;
  saveState(state);

  return pick.path;
}

// Pick N diverse images (for multi-reference Gemini calls)
export function pickDiverseSet(count = 3, opts = {}) {
  const picks = [];
  const usedSources = new Set();

  for (let i = 0; i < count; i++) {
    const img = pickImage({ ...opts, _exclude: picks });
    if (!img) break;
    picks.push(img);

    // Try to spread across sources
    const state = loadState();
    const info = state.images[img];
    if (info) usedSources.add(info.source);
  }

  return picks;
}

// Record generation result — feeds back quality signal
export function recordResult(imagePath, grade) {
  const state = loadState();
  const entry = state.images[imagePath];
  if (!entry) return;

  entry.grades.push(grade);
  // Running average: A=4, B=3, C=2, D=1
  const gradeMap = { A: 4, B: 3, C: 2, D: 1 };
  const avg = entry.grades.reduce((s, g) => s + (gradeMap[g] || 2), 0) / entry.grades.length;
  entry.avgGrade = avg >= 3.5 ? 'A' : avg >= 2.5 ? 'B' : avg >= 1.5 ? 'C' : 'D';

  saveState(state);
}

// Stats for reporting
export function getStats() {
  const state = loadState();
  const images = Object.values(state.images);
  const bySource = {};
  const byCategory = {};
  let neverUsed = 0;

  for (const img of images) {
    bySource[img.source] = (bySource[img.source] || 0) + 1;
    byCategory[img.category] = (byCategory[img.category] || 0) + 1;
    if (img.timesUsed === 0) neverUsed++;
  }

  return {
    total: images.length,
    neverUsed,
    totalPicks: state.totalPicks,
    bySource,
    byCategory,
    lastScan: state.lastScan,
    topProducers: images
      .filter(i => i.avgGrade === 'A')
      .map(i => i.filename)
      .slice(0, 10)
  };
}

export { SOURCES, CATEGORIES, loadState };
