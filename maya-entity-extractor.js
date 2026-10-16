// Maya Corpus Entity Extractor — Ancient Corpus Programme #5
// Already in English — entity extraction only (no translation needed)
// DeepSeek API, ~$0.26 for 1,554 segments

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const KINGSTON = '/Volumes/KINGSTON2/cathedral-archive/maya';
const SEGMENTS_FILE = join(KINGSTON, 'extracted/maya_segments.json');
const ENTITY_DIR = join(KINGSTON, 'entities');
const STATE_FILE = join(KINGSTON, 'extractor-state.json');
const ROSETTA_STATE = '/Users/basicclaw777/Cathedral/agents/rosetta-state.json';

const BATCH_SIZE = 10;  // segments per API call
const MAX_BATCHES_PER_RUN = 200;  // full run

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

async function extractEntities(segments) {
  const batch = segments.map((s, i) =>
    `${i + 1}. [${s.source}] ${s.text.slice(0, 500)}`
  ).join('\n\n');

  const content = await callDeepSeek([
    {
      role: 'system',
      content: `Extract entities from Maya civilisation texts (Popol Vuh, Chilam Balam, Maya Chronicles, Ritual of the Bacabs, day symbols). Return JSON with "entities" array. Each entity has:
- text: entity as it appears
- type: one of [deity, hero, person, place, calendar, astronomical, ritual, animal, plant, number, direction, underworld, creation, sacrifice, prophecy, architectural, military]
- context: brief context
- source: which source text
- source_index: line number (0-based)

Focus on:
- Deities: Itzamna, Kukulkan/Quetzalcoatl, Chaac, Ixchel, Ah Puch, Hunab Ku, Bacabs (4 world-bearers)
- Hero Twins: Hunahpu, Xbalanque, and their Xibalba journey
- Creation cycles: previous worlds/suns, creation of humans from maize
- Calendar: Tzolkin (260-day), Haab (365-day), Long Count, Calendar Round, day names (Imix, Ik, Akbal...)
- Astronomical: Venus cycles, eclipse tables, solstice/equinox markers, Pleiades
- Places: Xibalba (underworld), Tulan Zuiva, Paxil, Cayala
- Directions: 4 cardinal directions + colours (red/east, white/north, black/west, yellow/south)
- Numbers: Maya vigesimal (base-20) system references, sacred numbers (13, 20, 52, 260, 365)
- Prophecy: katun prophecies, cyclical time predictions
- Plants: maize/corn (central), cacao, ceiba tree (world tree)
- Animals: jaguar, quetzal, serpent, macaw, bat, owl (Xibalba messengers)`
    },
    { role: 'user', content: `Extract entities from these Maya texts:\n\n${batch}` }
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
  return { offset: 0, processed: 0, entities: 0, runs: 0 };
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

  if (!rosetta.languages_active.includes('maya')) rosetta.languages_active.push('maya');

  rosetta.corpus_stats.maya = {
    totalSegments: stats.totalSegments,
    processed: stats.processed,
    entities: stats.entities,
    lastRun: new Date().toISOString()
  };

  if (stats.processed >= stats.totalSegments * 0.95) {
    rosetta.languages_active = rosetta.languages_active.filter(l => l !== 'maya');
    if (!rosetta.languages_completed.includes('maya')) rosetta.languages_completed.push('maya');
  }

  mkdirSync(join(ROSETTA_STATE, '..'), { recursive: true });
  writeFileSync(ROSETTA_STATE, JSON.stringify(rosetta, null, 2));
}

async function run() {
  mkdirSync(ENTITY_DIR, { recursive: true });

  if (!existsSync(SEGMENTS_FILE)) {
    console.error('Segments file not found. Run maya-extractor.py first.');
    process.exit(1);
  }

  const segments = JSON.parse(readFileSync(SEGMENTS_FILE, 'utf8'));
  console.log(`Loaded ${segments.length} segments (310K words across 5 sources)`);

  const state = loadState();
  state.runs++;

  let batchesUsed = 0;

  while (state.offset < segments.length && batchesUsed < MAX_BATCHES_PER_RUN) {
    const batch = segments.slice(state.offset, state.offset + BATCH_SIZE);

    try {
      console.log(`Extracting entities from segments ${state.offset}-${state.offset + batch.length} / ${segments.length}...`);
      const entities = await extractEntities(batch);

      if (entities.length > 0) {
        const entFile = join(ENTITY_DIR, `maya_entities_${state.offset}.json`);
        writeFileSync(entFile, JSON.stringify(entities, null, 2));
        state.entities += entities.length;
      }

      state.offset += batch.length;
      state.processed += batch.length;
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
    processed: state.processed,
    entities: state.entities
  });

  const summary = `Maya Entity Extractor Run #${state.runs}\nBatches: ${batchesUsed}\nProcessed: ${state.processed}/${segments.length} segments\nEntities: ${state.entities}\nSources: 5 (Popol Vuh, Chronicles, Bacabs, Day Symbols)`;
  console.log(`\n${summary}`);

  if (state.processed > 0) {
    await sendTelegram(`*Maya Observatory*\n\n${summary}`);
  }
}

run().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
