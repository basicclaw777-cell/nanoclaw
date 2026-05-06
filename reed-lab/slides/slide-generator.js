/**
 * slide-generator.js — Auto-generate slide cards from session harvests
 *
 * Reads pass1 harvest files, extracts builds, generates a slide card JSON
 * that the gallery HTML renders. Runs after each session closer.
 *
 * Usage: node slide-generator.js [harvest-file]
 *        node slide-generator.js --scan  (scan for new unharvested files)
 *
 * ESM.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOGUE_PATH = path.join(__dirname, 'catalogue.json');
const HARVEST_DIR = path.join(process.env.HOME || '/Users/basicclaw777', 'cathedral-vault', '00_Staging', 'cathedral');
const OLLAMA_URL = 'http://localhost:11434/api/chat';

function loadCatalogue() {
  if (fs.existsSync(CATALOGUE_PATH)) {
    return JSON.parse(fs.readFileSync(CATALOGUE_PATH, 'utf8'));
  }
  return [];
}

function saveCatalogue(catalogue) {
  fs.writeFileSync(CATALOGUE_PATH, JSON.stringify(catalogue, null, 2));
}

async function summariseHarvest(harvestText) {
  try {
    const res = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'hermes3',
        messages: [{
          role: 'system',
          content: `You extract slide content from session harvest files. Output JSON only, no markdown.
Format: {"title": "short title (5-8 words)", "subtitle": "one sentence summary", "highlights": ["build 1", "build 2", "build 3"], "stats": [{"value": "X", "label": "thing"}]}
Maximum 5 highlights. Maximum 3 stats. Be concise.`
        }, {
          role: 'user',
          content: `Extract slide content from this session harvest:\n\n${harvestText.substring(0, 3000)}`
        }],
        stream: false,
        options: { temperature: 0.3, num_predict: 400 },
        format: 'json',
      }),
    });
    const data = await res.json();
    const content = data.message?.content || '{}';
    return JSON.parse(content);
  } catch (e) {
    console.error('LLM summarise failed:', e.message);
    return null;
  }
}

function extractDateFromFilename(filename) {
  const match = filename.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : new Date().toISOString().split('T')[0];
}

async function generateSlide(harvestPath) {
  const text = fs.readFileSync(harvestPath, 'utf8');
  const filename = path.basename(harvestPath);
  const date = extractDateFromFilename(filename);

  console.log(`Generating slide from: ${filename}`);

  // Try LLM summarisation
  let slideData = await summariseHarvest(text);

  // Fallback: extract from frontmatter and headings
  if (!slideData || !slideData.title) {
    const titleMatch = text.match(/title:\s*"?([^"\n]+)"?/);
    const focusMatch = text.match(/focus:\s*"?([^"\n]+)"?/);
    const headings = [...text.matchAll(/^## (.+)$/gm)].map(m => m[1]).slice(0, 5);

    slideData = {
      title: titleMatch ? titleMatch[1] : `Session Build — ${date}`,
      subtitle: focusMatch ? focusMatch[1] : '',
      highlights: headings,
      stats: [],
    };
  }

  slideData.date = date;
  slideData.source = filename;

  return slideData;
}

async function main() {
  const args = process.argv.slice(2);
  const catalogue = loadCatalogue();
  const existingSources = new Set(catalogue.map(s => s.source));

  if (args[0] === '--scan') {
    // Scan for pass1 harvests not yet in catalogue
    const files = fs.readdirSync(HARVEST_DIR)
      .filter(f => f.includes('pass1') && f.endsWith('.md'))
      .sort();

    let added = 0;
    for (const file of files) {
      if (existingSources.has(file)) continue;
      const slide = await generateSlide(path.join(HARVEST_DIR, file));
      if (slide) {
        catalogue.push(slide);
        added++;
        console.log(`  Added: ${slide.title}`);
      }
    }

    if (added > 0) {
      saveCatalogue(catalogue);
      console.log(`Catalogue updated: ${added} new slides, ${catalogue.length} total`);
    } else {
      console.log('No new harvests to process');
    }
  } else if (args[0]) {
    // Process specific file
    const harvestPath = path.resolve(args[0]);
    if (!fs.existsSync(harvestPath)) {
      console.error(`File not found: ${harvestPath}`);
      process.exit(1);
    }

    const filename = path.basename(harvestPath);
    if (existingSources.has(filename)) {
      console.log(`Already in catalogue: ${filename}`);
      return;
    }

    const slide = await generateSlide(harvestPath);
    if (slide) {
      catalogue.push(slide);
      saveCatalogue(catalogue);
      console.log(`Slide added: ${slide.title}`);
    }
  } else {
    console.log('Usage: node slide-generator.js [harvest-file]');
    console.log('       node slide-generator.js --scan');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
