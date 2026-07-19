import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HARVEST_DIR = path.join(process.env.HOME, 'cathedral-vault/00_Staging/cathedral');
const OUTPUT_PATH = path.join(process.env.HOME, 'cathedral-vault/02_Refined_Gold/cathedral/mausoleum-index.md');
const MAX_ANCHORS = 20;
const DECAY_RATE = 0.015;

function parseDate(filename) {
  const m = filename.match(/harvest-(\d{4}-\d{2}-\d{2})/);
  return m ? new Date(m[1]) : null;
}

function passType(filename) {
  if (filename.includes('pass1')) return 'builds';
  if (filename.includes('pass2')) return 'corrections';
  if (filename.includes('pass3')) return 'calibration';
  return 'unknown';
}

const TYPE_WEIGHT = {
  corrections: 1.0,
  calibration: 0.8,
  builds: 0.5,
  unknown: 0.3,
};

function extractAnchors(content, filename) {
  const anchors = [];
  const pass = passType(filename);
  const date = parseDate(filename);

  const lines = content.split('\n');
  let currentSection = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('## ')) {
      currentSection = line.replace(/^##\s+/, '').trim();
      continue;
    }

    if (line.startsWith('### ')) {
      const title = line.replace(/^###\s+/, '').replace(/\*\*/g, '').trim();
      let body = '';
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        if (lines[j].startsWith('#')) break;
        if (lines[j].trim()) {
          body = lines[j].replace(/^\*\*[^*]+\*\*:?\s*/, '').trim();
          break;
        }
      }

      const isCorrection = pass === 'corrections' ||
        currentSection.toLowerCase().includes('correction') ||
        currentSection.toLowerCase().includes('standing instruction');
      const isMethod = currentSection.toLowerCase().includes('pattern') ||
        currentSection.toLowerCase().includes('method') ||
        currentSection.toLowerCase().includes('principle');
      const isDecision = currentSection.toLowerCase().includes('decision');

      let typeScore = TYPE_WEIGHT[pass];
      if (isCorrection) typeScore = 1.0;
      if (isMethod) typeScore = 0.9;
      if (isDecision) typeScore = 0.7;

      anchors.push({
        title,
        body: body.slice(0, 200),
        section: currentSection,
        pass,
        date,
        filename,
        typeScore,
      });
    }
  }

  return anchors;
}

function forgettingCurve(daysAgo) {
  return Math.exp(-DECAY_RATE * daysAgo);
}

export function compressMausoleum() {
  const files = fs.readdirSync(HARVEST_DIR)
    .filter(f => f.startsWith('session-harvest-') && f.endsWith('.md'))
    .sort();

  const now = new Date();
  const allAnchors = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(HARVEST_DIR, file), 'utf8');
    const anchors = extractAnchors(content, file);
    allAnchors.push(...anchors);
  }

  for (const anchor of allAnchors) {
    const daysAgo = anchor.date
      ? (now - anchor.date) / 86400000
      : 90;
    anchor.recencyScore = forgettingCurve(daysAgo);
    anchor.compositeScore = anchor.typeScore * 0.6 + anchor.recencyScore * 0.4;
  }

  const deduped = deduplicateAnchors(allAnchors);
  deduped.sort((a, b) => b.compositeScore - a.compositeScore);
  const top = deduped.slice(0, MAX_ANCHORS);

  const md = renderMausoleum(top, allAnchors.length, files.length);
  fs.writeFileSync(OUTPUT_PATH, md);
  console.log(`[MAUSOLEUM] Compressed ${allAnchors.length} anchors from ${files.length} harvests → ${top.length} survivors`);
  return { total: allAnchors.length, files: files.length, survivors: top.length, anchors: top };
}

function deduplicateAnchors(anchors) {
  const seen = new Map();
  for (const a of anchors) {
    const key = a.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
    const existing = seen.get(key);
    if (!existing || a.compositeScore > existing.compositeScore) {
      seen.set(key, a);
    }
  }
  return [...seen.values()];
}

function renderMausoleum(anchors, totalAnchors, totalFiles) {
  const lines = [
    '---',
    'title: Mausoleum Index',
    `generated: ${new Date().toISOString().split('T')[0]}`,
    `source: ${totalFiles} harvest files, ${totalAnchors} raw anchors`,
    `survivors: ${anchors.length}`,
    '---',
    '',
    '# Mausoleum Index',
    '',
    '> 20 highest-impact anchors from session harvests, scored by type × recency.',
    '> Corrections and standing instructions survive longest. Routine builds decay.',
    '> Regenerate: `node governance/mausoleum-compressor.js`',
    '',
  ];

  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const dateStr = a.date ? a.date.toISOString().split('T')[0] : '?';
    lines.push(`### ${i + 1}. ${a.title}`);
    lines.push(`- **Type:** ${a.pass} / ${a.section} | **Date:** ${dateStr} | **Score:** ${a.compositeScore.toFixed(3)}`);
    if (a.body) lines.push(`- ${a.body}`);
    lines.push('');
  }

  return lines.join('\n');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  compressMausoleum();
}
