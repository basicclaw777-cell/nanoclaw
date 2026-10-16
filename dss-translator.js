// Dead Sea Scrolls Translator — Ancient Corpus Programme #3
// Hebrew/Aramaic → English translation + entity extraction
// DeepSeek API, ~$0.71 for 10K segments

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const KINGSTON = '/Volumes/KINGSTON2/cathedral-archive/dead-sea-scrolls';
const SEGMENTS_FILE = join(KINGSTON, 'extracted/dss_segments.json');
const OUTPUT_DIR = join(KINGSTON, 'translated');
const ENTITY_DIR = join(KINGSTON, 'entities');
const STATE_FILE = join(KINGSTON, 'translator-state.json');
const ROSETTA_STATE = '/Users/basicclaw777/Cathedral/agents/rosetta-state.json';

const BATCH_SIZE = 20;  // segments per API call (Hebrew needs more context per segment)
const MAX_BATCHES_PER_RUN = 600;  // full run

// Load env
const envPath = '/Users/basicclaw777/nanoclaw/.env';
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const DEEPSEEK_KEY = env.DEEPSEEK_API_KEY;
const TELEGRAM_TOKEN = env.TELEGRAM_TOKEN;
const CHAT_ID = env.PAUL_CHAT_ID;

async function sendTelegram(text) {
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'Markdown' })
    });
  } catch (e) { /* silent */ }
}

async function callDeepSeek(messages, jsonMode = false) {
  const body = {
    model: 'deepseek-chat',
    messages,
    temperature: 0.1,
    max_tokens: 4000
  };
  if (jsonMode) body.response_format = { type: 'json_object' };

  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify(body)
  });

  const data = await resp.json();
  if (!data || data.error) throw new Error(data?.error?.message || 'Empty response');
  if (!data.choices || !data.choices[0]) throw new Error('No choices in response');
  return data.choices[0].message.content;
}

async function translateBatch(segments) {
  const numbered = segments.map((s, i) =>
    `${i + 1}. [${s.scroll}] (${s.primary_language}) ${s.full_text}`
  ).join('\n\n');

  const text = await callDeepSeek([
    {
      role: 'system',
      content: `You are an expert translator of Dead Sea Scrolls texts. Translate the following Hebrew and Aramaic text segments into English. These are fragments of ancient Jewish manuscripts from Qumran. Preserve uncertain readings (marked with brackets or dots). Preserve proper nouns and divine names. For each segment, output: "N. [English translation]" where N is the segment number.

Key vocabulary:
- YHWH / יהוה = the LORD (divine name)
- אל = God/El
- Torah terminology: preserve technical ritual/legal terms
- Sectarian terms: Teacher of Righteousness, Sons of Light/Darkness, Community, Covenant
- Enochic: Watchers, Holy Ones, Book of Giants`
    },
    { role: 'user', content: `Translate these Dead Sea Scrolls segments:\n\n${numbered}` }
  ]);

  const lines = text.split('\n').filter(l => /^\d+\./.test(l.trim()));
  return lines.map(l => l.replace(/^\d+\.\s*/, '').trim());
}

async function extractEntities(translations, segments) {
  const batch = translations.map((t, i) => {
    const s = segments[i];
    return `[${s.scroll}] (${s.primary_language}, ${s.books.join('/') || 'non-biblical'}) ${t}`;
  }).join('\n');

  const content = await callDeepSeek([
    {
      role: 'system',
      content: `Extract entities from translated Dead Sea Scrolls texts. Return JSON with "entities" array. Each entity has:
- text: entity as it appears
- type: one of [divine_name, angel, person, place, title, ritual, calendar, military, astronomical, legal, architectural, creature, group]
- context: brief context
- scroll: which scroll
- source_index: line number (0-based)

Focus on: divine names (YHWH, El, El Elyon), angelic names (Michael, Gabriel, Belial, Azazel), Teacher of Righteousness, Wicked Priest, Sons of Light/Darkness, calendar terms (solar/lunar), architectural specs (Temple Scroll), military organization (War Scroll), Enochic entities (Watchers, Nephilim, Giants).`
    },
    { role: 'user', content: batch }
  ], true);

  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : (parsed.entities || []);
  } catch {
    return [];
  }
}

function loadState() {
  if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  return { offset: 0, translated: 0, entities: 0, runs: 0 };
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function updateRosettaState(stats) {
  let rosetta = {};
  if (existsSync(ROSETTA_STATE)) rosetta = JSON.parse(readFileSync(ROSETTA_STATE, 'utf8'));

  if (!rosetta.languages_completed) rosetta.languages_completed = [];
  if (!rosetta.languages_active) rosetta.languages_active = [];
  if (!rosetta.corpus_stats) rosetta.corpus_stats = {};

  if (!rosetta.languages_active.includes('hebrew')) rosetta.languages_active.push('hebrew');
  if (!rosetta.languages_active.includes('aramaic')) rosetta.languages_active.push('aramaic');

  rosetta.corpus_stats.dead_sea_scrolls = {
    totalSegments: stats.totalSegments,
    translated: stats.translated,
    entities: stats.entities,
    lastRun: new Date().toISOString()
  };

  if (stats.translated >= stats.totalSegments * 0.95) {
    rosetta.languages_active = rosetta.languages_active.filter(l => l !== 'hebrew' && l !== 'aramaic');
    if (!rosetta.languages_completed.includes('hebrew')) rosetta.languages_completed.push('hebrew');
    if (!rosetta.languages_completed.includes('aramaic')) rosetta.languages_completed.push('aramaic');
  }

  mkdirSync(join(ROSETTA_STATE, '..'), { recursive: true });
  writeFileSync(ROSETTA_STATE, JSON.stringify(rosetta, null, 2));
}

async function run() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(ENTITY_DIR, { recursive: true });

  if (!existsSync(SEGMENTS_FILE)) {
    console.error('Segments file not found. Run dss-extractor.py first.');
    process.exit(1);
  }

  const segments = JSON.parse(readFileSync(SEGMENTS_FILE, 'utf8'));
  console.log(`Loaded ${segments.length} segments`);

  const state = loadState();
  state.runs++;

  let batchesUsed = 0;

  while (state.offset < segments.length && batchesUsed < MAX_BATCHES_PER_RUN) {
    const batch = segments.slice(state.offset, state.offset + BATCH_SIZE);

    try {
      console.log(`Translating segments ${state.offset}-${state.offset + batch.length} / ${segments.length}...`);
      const translations = await translateBatch(batch);

      // Save translations
      const outFile = join(OUTPUT_DIR, `dss_${state.offset}.json`);
      const translated = batch.map((s, i) => ({ ...s, english: translations[i] || '' }));
      writeFileSync(outFile, JSON.stringify(translated, null, 2));
      state.translated += batch.length;

      // Extract entities
      console.log(`  Extracting entities...`);
      const entities = await extractEntities(translations, batch);
      if (entities.length > 0) {
        const entFile = join(ENTITY_DIR, `dss_entities_${state.offset}.json`);
        writeFileSync(entFile, JSON.stringify(entities, null, 2));
        state.entities += entities.length;
      }

      state.offset += batch.length;
      batchesUsed++;
      saveState(state);

      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error(`Error at offset ${state.offset}: ${err.message}`);
      if (err.message.includes('Insufficient Balance')) {
        console.error('DeepSeek balance exhausted.');
        break;
      }
      state.offset += batch.length;
      saveState(state);
    }
  }

  updateRosettaState({
    totalSegments: segments.length,
    translated: state.translated,
    entities: state.entities
  });

  const summary = `DSS Translator Run #${state.runs}\nBatches: ${batchesUsed}\nTranslated: ${state.translated}/${segments.length} segments\nEntities: ${state.entities}\nScrolls: 997`;
  console.log(`\n${summary}`);

  if (state.translated > 0) {
    await sendTelegram(`*Dead Sea Scrolls Observatory*\n\n${summary}`);
  }
}

run().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
