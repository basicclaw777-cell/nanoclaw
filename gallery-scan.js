import { readdir, stat, writeFile } from 'fs/promises';
import { join, basename, extname, relative } from 'path';
import { homedir } from 'os';

const HOME = homedir();
const SCAN_ROOTS = [
  { dir: join(HOME, 'basic-reflex'), servePrefix: '/basic-reflex' },
  { dir: join(HOME, 'Cathedral/visual-studio'), servePrefix: '/visual-studio' },
  { dir: join(HOME, 'Cathedral/artifacts'), servePrefix: '/cathedral-artifacts' },
];

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);
const IGNORE = new Set(['node_modules', '.git', '__pycache__', '.DS_Store']);

function categorize(relPath) {
  const parts = relPath.split('/');
  if (parts[0] === 'logan') {
    if (parts[1] === 'stick-logan') return 'stick-logan';
    if (parts[1] === 'universe') return 'logan-universe';
    if (parts[1] === 'character-sheets') return 'character-sheets';
    if (parts[1] === 'illustrations') return 'logan-illustrations';
    return 'logan-other';
  }
  if (parts[0] === 'aether-universe') return 'hexad';
  if (parts[0] === 'gym-eyes') return 'gym-eyes';
  if (parts[0] === '3d-character') return '3d-character';
  if (parts[0] === 'bundle') return 'workshop-bundle';
  if (parts[0] === 'br90' || parts[0] === 'br-90') return 'br90';
  if (parts[0] === 'website') return 'br-website';
  if (parts[0] === 'corporate') return 'corporate';
  if (parts[0] === 'merch') return 'merch';
  if (parts[0] === '10-blocks-designs') return '10-blocks';
  if (relPath.includes('seeds')) return 'seeds';
  return 'other';
}

async function scanDir(dir, rootDir) {
  const results = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch { return results; }

  for (const entry of entries) {
    if (IGNORE.has(entry.name)) continue;
    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...await scanDir(full, rootDir));
    } else if (IMAGE_EXTS.has(extname(entry.name).toLowerCase())) {
      const relPath = relative(rootDir, full);
      let fileSize = 0;
      try { fileSize = (await stat(full)).size; } catch {}
      results.push({
        name: basename(entry.name, extname(entry.name)),
        ext: extname(entry.name),
        path: relPath,
        fullPath: full,
        category: categorize(relPath),
        size: fileSize,
      });
    }
  }
  return results;
}

async function main() {
  console.log('Scanning image directories...');
  const allImages = [];

  for (const root of SCAN_ROOTS) {
    console.log(`  ${root.dir}`);
    const images = await scanDir(root.dir, root.dir);
    for (const img of images) {
      img.url = `${root.servePrefix}/${img.path}`;
      img.shortPath = `${basename(root.dir)}/${img.path}`;
    }
    allImages.push(...images);
  }

  allImages.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  const outPath = join(HOME, 'nanoclaw/illustration-gallery-manifest.json');
  await writeFile(outPath, JSON.stringify(allImages, null, 0));

  const cats = {};
  allImages.forEach(img => { cats[img.category] = (cats[img.category] || 0) + 1; });

  console.log(`\nManifest: ${outPath}`);
  console.log(`Total: ${allImages.length} images across ${Object.keys(cats).length} categories`);
  console.log('Categories:');
  Object.entries(cats).sort((a, b) => b[1] - a[1]).forEach(([cat, n]) => {
    console.log(`  ${cat}: ${n}`);
  });
}

main().catch(console.error);
