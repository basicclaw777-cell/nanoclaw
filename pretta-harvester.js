#!/usr/bin/env node
// Pretta Origin Harvester — targeted extraction for Cathedral founding transcripts
// Usage: node pretta-harvester.js <file.txt> [--deepseek]

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = import.meta.dirname || '.';
dotenv.config({ path: join(__dirname, '.env') });

const HOME = process.env.HOME;
const VAULT_STAGING = join(HOME, 'cathedral-vault', '00_Staging');
const OLLAMA_URL = 'http://localhost:11434';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// ── Model query ──────────────────────────────────────────────────────────────

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
      options: { temperature: 0.3, num_ctx: 32768 }
    })
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${res.statusText}`);
  const data = await res.json();
  return data.message?.content || '';
}

async function queryDeepSeek(system, prompt) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 8000
    })
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── Pretta-specific extraction prompt ────────────────────────────────────────

const EXTRACT_PROMPT = `You are harvesting wisdom from a foundational AI conversation that birthed a sovereignty framework called "The Cathedral." This conversation took place between Paul (a boxing gym owner in Hong Kong) and an AI called Pretta on Google AI Studio in early 2026.

Extract discrete principles, frameworks, lexicon definitions, and sage wisdom. Each finding is a nugget that stands alone.

For each finding, output a JSON array. Each element:
{
  "title": "Short descriptive title",
  "domain": "one of: sovereignty, discernment, psychology, lexicon, i-ching, sage-wisdom, cathedral-architecture, relationship-forensics, pattern-detection, personal-growth",
  "type": "one of: principle, framework, lexicon-definition, sage-quote, hexagram-teaching, pattern, metaphor, standing-instruction",
  "sage": "if a specific sage spoke this: yoda|miyagi|tao-master|aurelius|sun-tzu|leonardo|null",
  "body": "2-5 sentence description. Include the full quote if it's sage wisdom.",
  "tags": ["tag1", "tag2"],
  "cathedral_relevance": "How this concept lives in the Cathedral system Paul later built"
}

CRITICAL RULES:
- Extract WISDOM and FRAMEWORKS, not narrative events or emotional processing
- Sage quotes must include the actual quote text — these are canonical
- Lexicon terms (OmissionOS, IntegrityOS, Terminative Grace, etc.) each get their own entry with definition
- I Ching hexagram teachings get their own entries
- The Cathedral metaphor itself and its components (Shed vs Cathedral, Obsidian Foundation, 10:10 Gate) each get entries
- Skip: repetition of the same lesson, meta-commentary about the conversation, emotional validation
- Deduplicate: if the same concept appears multiple times, extract the BEST version only
- Output ONLY the JSON array. No preamble, no explanation.`;

// ── Parse response ───────────────────────────────────────────────────────────

function parseExtraction(raw) {
  let cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '');
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/g, '');
  cleaned = cleaned.trim();

  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1) return [];

  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch (e) {
    console.error('JSON parse failed:', e.message);
    // Try to salvage partial JSON
    try {
      const partial = cleaned.slice(start, end + 1).replace(/,\s*\]/, ']');
      return JSON.parse(partial);
    } catch { return []; }
  }
}

// ── Write nugget ─────────────────────────────────────────────────────────────

function writeNugget(nugget, sourceFile) {
  const date = new Date().toISOString().slice(0, 10);
  const slug = (nugget.title || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

  const domain = nugget.domain || 'sovereignty';
  const domainDir = join(VAULT_STAGING, 'pretta-origin');
  if (!existsSync(domainDir)) mkdirSync(domainDir, { recursive: true });

  const filename = `${date}_pretta_${slug}.md`;
  const filepath = join(domainDir, filename);
  if (existsSync(filepath)) return null;

  const tags = (nugget.tags || []).map(t => t.toLowerCase()).join(', ');

  let content = '---\n';
  content += `title: "${(nugget.title || '').replace(/"/g, '\\"')}"\n`;
  content += `domain: ${domain}\n`;
  content += `type: ${nugget.type || 'principle'}\n`;
  if (nugget.sage) content += `sage: ${nugget.sage}\n`;
  content += `tags: [${tags}]\n`;
  content += `source: "Pretta Origin Transcript — ${basename(sourceFile)}"\n`;
  content += `provenance: "Google AI Studio conversation, early 2026 — Cathedral founding material"\n`;
  content += `created: ${date}\n`;
  content += `harvested-by: pretta-harvester\n`;
  content += '---\n\n';
  content += `# ${nugget.title}\n\n`;
  content += `${nugget.body}\n`;

  if (nugget.cathedral_relevance) {
    content += `\n## Cathedral Relevance\n${nugget.cathedral_relevance}\n`;
  }

  writeFileSync(filepath, content);
  return filename;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const useDeepSeek = args.includes('--deepseek');
const filePath = args.find(a => !a.startsWith('--'));

if (!filePath || !existsSync(filePath)) {
  console.error('Usage: node pretta-harvester.js <file.txt> [--deepseek]');
  process.exit(1);
}

const content = readFileSync(filePath, 'utf8');
console.log(`[pretta-harvester] Processing ${basename(filePath)} (${content.length} chars, ${useDeepSeek ? 'DeepSeek' : 'qwen3:14b'})...`);

// Chunk — 24K chars for Ollama, 60K for DeepSeek
const MAX_CHARS = useDeepSeek ? 30000 : 24000;
const chunks = [];
for (let i = 0; i < content.length; i += MAX_CHARS) {
  chunks.push(content.slice(i, i + MAX_CHARS));
}

let allNuggets = [];

for (let i = 0; i < chunks.length; i++) {
  console.log(`[pretta-harvester] Chunk ${i + 1}/${chunks.length}...`);
  try {
    const raw = useDeepSeek
      ? await queryDeepSeek(EXTRACT_PROMPT, chunks[i])
      : await queryOllama('qwen3:14b', EXTRACT_PROMPT, chunks[i]);
    const extracted = parseExtraction(raw);
    console.log(`[pretta-harvester] Chunk ${i + 1}: ${extracted.length} findings`);
    allNuggets.push(...extracted);
  } catch (e) {
    console.error(`[pretta-harvester] Chunk ${i + 1} failed: ${e.message}`);
  }
}

// Deduplicate by title
const seen = new Set();
const unique = allNuggets.filter(n => {
  const key = n.title?.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!key || seen.has(key)) return false;
  seen.add(key);
  return true;
});

// Write nuggets
let written = 0;
for (const nugget of unique) {
  const filename = writeNugget(nugget, filePath);
  if (filename) {
    written++;
    console.log(`[pretta-harvester] Filed: ${filename}`);
  }
}

console.log(`\n[pretta-harvester] DONE: ${written} nuggets from ${basename(filePath)} (${unique.length} unique, ${allNuggets.length} total extracted)`);
