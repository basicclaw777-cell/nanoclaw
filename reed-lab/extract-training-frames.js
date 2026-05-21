// Extract key frames from Cuba/boxing training videos → screenshots for all agents
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, basename } from 'path';

const INDEX_PATH = '/Users/basicclaw777/nanoclaw/reed-lab/kingston-media-index.json';
const FRAMES_DIR = '/Volumes/KINGSTON2/reed-training-frames';
const PRIORITY_COLLECTIONS = ['cuba_2014', 'cuba_2015', 'boxer_portraits', 'pedrosso', 'yoandris', 'crimildo', 'mozambique', 'big_cam_movies'];

if (!existsSync(FRAMES_DIR)) mkdirSync(FRAMES_DIR, { recursive: true });

const idx = JSON.parse(readFileSync(INDEX_PATH, 'utf-8'));
const videos = idx.reedCandidates.videos.filter(v => PRIORITY_COLLECTIONS.includes(v.collection));
console.log(`Extracting frames from ${videos.length} training videos...`);

let extracted = 0;
let errors = 0;
const frameIndex = [];

for (const vid of videos) {
  try {
    const name = basename(vid.path, '.MOV').replace(/[^a-zA-Z0-9_-]/g, '_');
    const outName = `${vid.collection}__${name}.jpg`;
    const outPath = join(FRAMES_DIR, outName);
    
    if (existsSync(outPath)) { extracted++; continue; } // skip existing
    
    // Extract frame at 2 seconds (past any black intro)
    execFileSync('ffmpeg', [
      '-ss', '2', '-i', vid.path,
      '-vframes', '1', '-q:v', '2',
      '-vf', 'scale=1920:-1',
      outPath
    ], { timeout: 15000, stdio: 'pipe' });
    
    frameIndex.push({ path: outPath, collection: vid.collection, source: vid.path });
    extracted++;
    
    if (extracted % 50 === 0) console.log(`  ${extracted}/${videos.length} done...`);
  } catch (e) {
    errors++;
  }
}

// Update the main index with frame paths
const allFrames = frameIndex.map(f => f.path);
idx.reedCandidates.trainingFrames = frameIndex;
writeFileSync(INDEX_PATH, JSON.stringify(idx, null, 2));

console.log(`Done. ${extracted} frames extracted, ${errors} errors. Saved to ${FRAMES_DIR}`);
