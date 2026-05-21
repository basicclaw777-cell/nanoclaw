// Index all media on KINGSTON1 + KINGSTON2 — unified Cathedral media library
import { readdirSync, statSync, writeFileSync } from 'fs';
import { join, extname, basename, relative } from 'path';

const ROOTS = [
  { path: '/Volumes/KINGSTON2/external drives', drive: 'KINGSTON2' },
  { path: '/Volumes/KINGSTON/minimac desktop files', drive: 'KINGSTON1' },
  { path: '/Volumes/KINGSTON/external drives', drive: 'KINGSTON1' },
];
const OUT = '/Users/basicclaw777/nanoclaw/reed-lab/kingston-media-index.json';

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.heic']);
const VIDEO_EXTS = new Set(['.mov', '.mp4', '.mts', '.avi', '.m4v']);

function classifyCollection(relPath, drive) {
  const p = relPath.toLowerCase();
  // KINGSTON2 collections
  if (p.includes('cuba 2014')) return 'cuba_2014';
  if (p.includes('cuba2015') || p.includes('cuba 2015')) return 'cuba_2015';
  if (p.includes('pedrosso')) return 'pedrosso';
  if (p.includes('yoandris') || p.includes('yoandre')) return 'yoandris';
  if (p.includes('crimildo')) return 'crimildo';
  if (p.includes('mosambique') || p.includes('mozambique')) return 'mozambique';
  if (p.includes('boxer pics')) return 'boxer_portraits';
  if (p.includes('big cam')) return 'big_cam_movies';
  if (p.includes('macbkpro')) return 'macbook_archive';
  if (p.includes('imac')) return 'imac_archive';
  // KINGSTON1 BR history collections
  if (p.includes('cuban boxers')) return 'cuban_boxers';
  if (p.includes('clients')) return 'br_clients';
  if (p.includes('coaches')) return 'br_coaches';
  if (/(?:^|\/)boxers\//.test(p)) return 'br_boxers';
  if (p.includes('coach icons')) return 'coach_icons';
  if (p.includes('instagram')) return 'br_instagram';
  if (p.includes('social reflex')) return 'br_social';
  if (p.includes('flyers')) return 'br_flyers';
  if (p.includes('tshirts') || p.includes('merch')) return 'br_merch';
  if (p.includes('training visual')) return 'training_visuals';
  if (p.includes('sparring')) return 'br_sparring';
  if (p.includes('principles')) return 'boxing_principles';
  if (p.includes('fundamentals')) return 'fundamentals';
  if (p.includes('book illustration')) return 'book_illustrations';
  if (p.includes('blog cover')) return 'blog_covers';
  if (p.includes('neon beats')) return 'neon_beats';
  if (p.includes('vortex')) return 'vortex_boxing';
  if (p.includes('gloves')) return 'gloves';
  if (p.includes('onboarding')) return 'br_onboarding';
  if (p.includes('my story')) return 'pauls_story';
  if (p.includes('milestone')) return 'milestones';
  if (p.includes('memberships')) return 'br_memberships';
  if (p.includes('xmas')) return 'br_xmas';
  if (p.includes('marketing')) return 'br_marketing';
  if (p.includes('icon art') || p.includes('icons')) return 'icons';
  if (p.includes('fibinacci') || p.includes('fibonacci')) return 'fibonacci_boxer';
  if (p.includes('eq') || p.includes('eckman')) return 'eq_emotional';
  if (p.includes('cognitive function')) return 'cognitive_boxing';
  if (p.includes('stable diffusion')) return 'ai_generated_legacy';
  if (p.includes('trading')) return 'trading';
  if (p.includes('vr')) return 'vr_gym';
  if (p.includes('imojis') || p.includes('emojis')) return 'br_emojis';
  if (p.includes('gpt')) return 'gpt_assets';
  if (p.includes('roger')) return 'roger';
  if (p.includes('sean parker')) return 'sean_parker';
  if (p.includes('nexus')) return 'nexus';
  if (p.includes('tao')) return 'tao';
  if (p.includes('online course')) return 'online_course';
  if (p.includes('transcription')) return 'transcription_project';
  // KINGSTON1 origin-era: old USB drive backups (orange, white sticker)
  if (p.includes('photos for basic/cuba')) return 'origin_cuba';
  if (p.includes('photos for basic/fights')) return 'origin_fights';
  if (p.includes('photos for basic/training')) return 'origin_training';
  if (p.includes('iphone6') || p.includes("paul's iphone")) return 'origin_iphone6';
  if (p.includes('final cut')) return 'origin_final_cut';
  if (p.includes('daikichi')) return 'origin_daikichi';
  if (p.includes('dcim') || p.includes('canonmsc') || p.includes('sanyo')) return 'origin_camera_rolls';
  if (p.includes('diego')) return 'origin_diego';
  if (p.includes('daniell')) return 'origin_daniell';
  if (p.includes('book illustration') || (p.includes('book') && drive === 'KINGSTON1')) return 'book_illustrations';
  if (p.includes('super empath')) return 'super_empath';
  if (p.includes('saj')) return 'saj';
  if (p.includes('faqs')) return 'br_faqs';
  if (p.includes('wise men')) return 'wise_men_principles';
  return drive === 'KINGSTON1' ? 'k1_other' : 'k2_other';
}

function walkDir(dir, drive, results = [], baseRoot = null) {
  const root = baseRoot || dir;
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      const full = join(dir, entry);
      try {
        const st = statSync(full);
        if (st.isDirectory()) {
          walkDir(full, drive, results, root);
        } else {
          const ext = extname(entry).toLowerCase();
          if (IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext)) {
            const relPath = relative(root, full);
            const parts = relPath.split('/');
            const collection = classifyCollection(relPath, drive);

            results.push({
              path: full,
              name: entry,
              type: IMAGE_EXTS.has(ext) ? 'image' : 'video',
              ext,
              size: st.size,
              collection,
              subcollection: parts.length > 1 ? parts[parts.length - 2] : '',
              drive,
              modified: st.mtime.toISOString().slice(0, 10)
            });
          }
        }
      } catch {}
    }
  } catch {}
  return results;
}

const all = [];
for (const root of ROOTS) {
  console.log(`Indexing ${root.drive}: ${root.path}...`);
  try { statSync(root.path); } catch { console.log(`  Skipped (not mounted)`); continue; }
  walkDir(root.path, root.drive, all);
}
const images = all.filter(f => f.type === 'image');
const videos = all.filter(f => f.type === 'video');

// Collection summary
const collections = {};
for (const f of all) {
  if (!collections[f.collection]) collections[f.collection] = { images: 0, videos: 0, totalSize: 0 };
  collections[f.collection][f.type === 'image' ? 'images' : 'videos']++;
  collections[f.collection].totalSize += f.size;
}

// Drive summary
const drives = {};
for (const f of all) {
  if (!drives[f.drive]) drives[f.drive] = { images: 0, videos: 0 };
  drives[f.drive][f.type === 'image' ? 'images' : 'videos']++;
}

const index = {
  indexed: new Date().toISOString(),
  roots: ROOTS.map(r => r.path),
  totals: { images: images.length, videos: videos.length, total: all.length },
  drives,
  collections,
  trainingFrames: '/Volumes/KINGSTON2/reed-training-frames/',
  // Only store images >50KB (skip thumbnails) and videos >1MB (skip clips)
  reedCandidates: {
    images: images.filter(f => f.size > 50000).map(f => ({ path: f.path, collection: f.collection, sub: f.subcollection, drive: f.drive, size: f.size })),
    videos: videos.filter(f => f.size > 1000000).map(f => ({ path: f.path, collection: f.collection, sub: f.subcollection, drive: f.drive, size: f.size }))
  }
};

writeFileSync(OUT, JSON.stringify(index, null, 2));
console.log(`\nIndexed: ${all.length} files (${images.length} images, ${videos.length} videos)`);
for (const [d, c] of Object.entries(drives)) console.log(`  ${d}: ${c.images} images, ${c.videos} videos`);
console.log(`\nCollections (${Object.keys(collections).length}):`);
for (const [name, c] of Object.entries(collections).sort((a,b) => (b[1].images+b[1].videos) - (a[1].images+a[1].videos))) {
  console.log(`  ${name}: ${c.images} img, ${c.videos} vid`);
}
console.log(`\nReed candidates: ${index.reedCandidates.images.length} images, ${index.reedCandidates.videos.length} videos`);
console.log(`Written to: ${OUT}`);
