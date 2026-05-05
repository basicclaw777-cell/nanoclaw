// ~/nanoclaw/deepseek-harvester.js
// DeepSeek Session Harvester — transcript to vault nuggets
// Reads .md/.txt files from ~/raw-chats/deepseek/
// Uses Ollama qwen3:14b for claim extraction + domain classification
// Uses vault-embedder semantic search for wikilink suggestions
// Deposits nuggets to ~/cathedral-vault/00_Staging/{domain}/
//
// Triggers:
//   - File watcher on ~/raw-chats/deepseek/
//   - /harvest-deepseek Telegram command (via telegram-bot.js)
//   - CLI: node deepseek-harvester.js [file.md]

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, basename, extname } from 'path';
import chokidar from 'chokidar';
import { semanticSearch } from './vault-embedder.js';

const HOME = process.env.HOME;
const INTAKE_DIR = join(HOME, 'raw-chats', 'deepseek');
const VAULT_STAGING = join(HOME, 'cathedral-vault', '00_Staging');
const OLLAMA_URL = 'http://localhost:11434';
const EXTRACT_MODEL = 'qwen3:14b';
const MANIFEST_PATH = join(HOME, 'nanoclaw', 'vortex_data', 'deepseek-harvested.json');

// ── Manifest (track processed files) ────────────────────────────────────────

function loadManifest() {
  try { return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')); }
  catch { return {}; }
}

function saveManifest(m) {
  writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2));
}

// ── Ollama query ─────────────────────────────────────────────────────────────

async function queryOllama(model, system, prompt) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt }
      ],
      stream: false,
      options: { temperature: 0.3 }
    })
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${res.statusText}`);
  const data = await res.json();
  return data.message?.content || '';
}

// ── Extraction prompt ────────────────────────────────────────────────────────

const EXTRACT_PROMPT = `You are a research harvester. Extract discrete claims, findings, and insights from this DeepSeek research transcript.

For each finding, output a JSON array. Each element:
{
  "title": "Short descriptive title",
  "domain": "one of: aether-medium, frequency-resonance, sacred-geometry, wave-cosmology, vortex-dynamics, water-science, model-building, consciousness-observer, suppression-history, thinkers, cosmological-models, epistemology, toroidal-geometry, thermodynamics-entropy, zero-point-energy, energetic-economics, methodology",
  "type": "claim|connection|source|position|open-question|lexicon",
  "confidence": "proven|demonstrated|asserted|speculative",
  "body": "2-5 sentence description of the finding",
  "researchers": ["Name1", "Name2"],
  "tags": ["tag1", "tag2"],
  "open_threads": ["Any unresolved question this raises"]
}

Rules:
- Extract FINDINGS, not conversation. Skip greetings, meta-discussion, and restatements.
- Tag confidence honestly using the four-level taxonomy.
- If a claim has a DOI or paper citation, include it in the body.
- Separate distinct claims into separate entries — don't merge.
- Output ONLY the JSON array. No preamble, no explanation.`;

// ── Parse Ollama JSON response ───────────────────────────────────────────────

function parseExtraction(raw) {
  // Strip markdown fences and thinking tags if present
  let cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '');
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/g, '');
  cleaned = cleaned.trim();

  // Find the JSON array
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1) return [];

  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch (e) {
    console.error('JSON parse failed:', e.message);
    return [];
  }
}

// ── Wikilink suggestions via semantic search ─────────────────────────────────

async function suggestWikilinks(title, body) {
  try {
    const query = `${title} ${body}`;
    const results = await semanticSearch(query, 3);
    const seen = new Set();
    return results
      .filter(r => r.score > 0.5)
      .filter(r => {
        const name = basename(r.file_path, '.md');
        if (seen.has(name)) return false;
        seen.add(name);
        return true;
      })
      .map(r => {
        const name = basename(r.file_path, '.md');
        const display = r.title || name;
        return `[[${name}|${display}]]`;
      });
  } catch {
    return [];
  }
}

// ── Write nugget to vault ────────────────────────────────────────────────────

function writeNugget(nugget, sourceFile, wikilinks) {
  const date = new Date().toISOString().slice(0, 10);
  const slug = nugget.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

  const domain = nugget.domain || 'universe';
  const domainDir = join(VAULT_STAGING, domain);
  if (!existsSync(domainDir)) mkdirSync(domainDir, { recursive: true });

  const filename = `${date}_${domain}_${slug}.md`;
  const filepath = join(domainDir, filename);

  // Don't overwrite existing files
  if (existsSync(filepath)) return null;

  const researchers = (nugget.researchers || []).map(r => `${r}`).join(', ');
  const tags = (nugget.tags || []).map(t => t.toLowerCase()).join(', ');

  let content = '---\n';
  content += `title: "${nugget.title}"\n`;
  content += `domain: ${domain}\n`;
  content += `type: ${nugget.type || 'claim'}\n`;
  content += `confidence: ${nugget.confidence || 'asserted'}\n`;
  if (researchers) content += `researchers: [${researchers}]\n`;
  content += `tags: [${tags}]\n`;
  content += `source: DeepSeek research session — ${basename(sourceFile)}\n`;
  content += `created: ${date}\n`;
  content += `harvested-by: deepseek-harvester\n`;
  content += '---\n\n';
  content += `# ${nugget.title}\n\n`;
  content += `${nugget.body}\n`;

  if (wikilinks.length > 0) {
    content += '\n## Connections\n';
    wikilinks.forEach(wl => { content += `- ${wl}\n`; });
  }

  writeFileSync(filepath, content);
  return filename;
}

// ── Harvest a single transcript ──────────────────────────────────────────────

export async function harvestTranscript(filePath) {
  const content = readFileSync(filePath, 'utf8');
  if (content.length < 200) return { nuggets: 0, openThreads: 0, files: [] };

  console.log(`[harvester] Extracting from ${basename(filePath)} (${content.length} chars)...`);

  // Chunk if transcript is very long (qwen3:14b context ~32k tokens)
  const MAX_CHARS = 24000;
  const chunks = [];
  for (let i = 0; i < content.length; i += MAX_CHARS) {
    chunks.push(content.slice(i, i + MAX_CHARS));
  }

  let allNuggets = [];
  let allOpenThreads = [];

  for (let i = 0; i < chunks.length; i++) {
    console.log(`[harvester] Processing chunk ${i + 1}/${chunks.length}...`);
    const raw = await queryOllama(EXTRACT_MODEL, EXTRACT_PROMPT, chunks[i]);
    const extracted = parseExtraction(raw);
    console.log(`[harvester] Chunk ${i + 1}: ${extracted.length} findings`);

    for (const nugget of extracted) {
      allNuggets.push(nugget);
      if (nugget.open_threads) {
        allOpenThreads.push(...nugget.open_threads);
      }
    }
  }

  // Deduplicate by title similarity
  const seen = new Set();
  const unique = allNuggets.filter(n => {
    const key = n.title?.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Write each nugget with wikilink suggestions
  const written = [];
  for (const nugget of unique) {
    const wikilinks = await suggestWikilinks(nugget.title, nugget.body || '');
    const filename = writeNugget(nugget, filePath, wikilinks);
    if (filename) {
      written.push({ title: nugget.title, domain: nugget.domain, file: filename });
      console.log(`[harvester] Filed: ${filename}`);
    }
  }

  // Update manifest
  const manifest = loadManifest();
  manifest[basename(filePath)] = {
    harvestedAt: new Date().toISOString(),
    nuggetsExtracted: unique.length,
    nuggetsWritten: written.length,
    openThreads: allOpenThreads.length
  };
  saveManifest(manifest);

  return {
    nuggets: written.length,
    openThreads: [...new Set(allOpenThreads)],
    files: written
  };
}

// ── File watcher ─────────────────────────────────────────────────────────────

export function startDeepSeekWatcher() {
  const watcher = chokidar.watch(`${INTAKE_DIR}/*.{md,txt}`, {
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 3000, pollInterval: 1000 }
  });

  watcher.on('add', async (fp) => {
    console.log(`[harvester] New transcript detected: ${basename(fp)}`);
    try {
      const result = await harvestTranscript(fp);
      console.log(`[harvester] Done: ${result.nuggets} nuggets, ${result.openThreads.length} open threads`);
    } catch (err) {
      console.error(`[harvester] Error processing ${basename(fp)}:`, err.message);
    }
  });

  console.log(`[harvester] Watching ${INTAKE_DIR}`);
  return watcher;
}

// ── Format result for Telegram ───────────────────────────────────────────────

export function formatHarvestResult(result) {
  if (result.nuggets === 0) return 'No nuggets extracted from transcript.';

  let msg = `HARVESTER — ${result.nuggets} nuggets filed\n\n`;
  result.files.forEach((f, i) => {
    msg += `${i + 1}. ${f.title} [${f.domain}]\n`;
  });

  if (result.openThreads.length > 0) {
    msg += `\n${result.openThreads.length} open threads:\n`;
    result.openThreads.slice(0, 5).forEach(t => {
      msg += `- ${t}\n`;
    });
  }

  return msg;
}

// ── CLI entrypoint ───────────────────────────────────────────────────────────

import { fileURLToPath } from 'url';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = process.argv[2];

  if (target && existsSync(target)) {
    // Harvest specific file
    harvestTranscript(target).then(result => {
      console.log('\n' + formatHarvestResult(result));
    }).catch(e => { console.error('Fatal:', e.message); process.exit(1); });

  } else if (target === '--watch') {
    startDeepSeekWatcher();

  } else {
    // Harvest all unprocessed files in intake dir
    const manifest = loadManifest();
    const files = readdirSync(INTAKE_DIR)
      .filter(f => f.endsWith('.md') || f.endsWith('.txt'))
      .filter(f => !manifest[f]);

    if (files.length === 0) {
      console.log('No new transcripts in ~/raw-chats/deepseek/');
      process.exit(0);
    }

    (async () => {
      for (const f of files) {
        const result = await harvestTranscript(join(INTAKE_DIR, f));
        console.log(formatHarvestResult(result));
      }
    })().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
  }
}
