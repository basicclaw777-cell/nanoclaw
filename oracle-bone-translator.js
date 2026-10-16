// Oracle Bone Inscriptions Translator — Ancient Corpus Programme #4
// Chinese (Shang Dynasty oracle bones) → English translation + entity extraction
// DeepSeek API, ~$0.10 for 2,195 segments

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const KINGSTON = '/Volumes/KINGSTON2/cathedral-archive/oracle-bones';
const SEGMENTS_FILE = join(KINGSTON, 'extracted/obi_segments.json');
const OUTPUT_DIR = join(KINGSTON, 'translated');
const ENTITY_DIR = join(KINGSTON, 'entities');
const STATE_FILE = join(KINGSTON, 'translator-state.json');
const ROSETTA_STATE = '/Users/basicclaw777/Cathedral/agents/rosetta-state.json';

const BATCH_SIZE = 10;  // segments per API call (each segment = 10 sentences)
const MAX_BATCHES_PER_RUN = 300;  // full run

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
  // Flatten sentences from segments
  const sentences = [];
  for (const seg of segments) {
    for (const s of seg.sentences) {
      sentences.push({
        inscription: s.inscription,
        text: s.text,
        group: s.group,
        has_undeciphered: s.has_undeciphered
      });
    }
  }

  const numbered = sentences.map((s, i) =>
    `${i + 1}. [${s.inscription}] ${s.text}${s.has_undeciphered ? ' (contains undeciphered characters marked □)' : ''}`
  ).join('\n');

  const text = await callDeepSeek([
    {
      role: 'system',
      content: `You are an expert translator of Shang Dynasty oracle bone inscriptions (jiaguwen/甲骨文). These are divination records from ~1200 BCE China, inscribed on turtle shells and animal bones.

Translate the following Chinese oracle bone texts into English. These are typically short divination queries following the pattern: [date] + [diviner name] + 貞 (divined) + [question/statement].

Key conventions:
- Heavenly Stems: 甲乙丙丁戊己庚辛壬癸 (Jia, Yi, Bing, Ding, Wu, Ji, Geng, Xin, Ren, Gui)
- Earthly Branches: 子丑寅卯辰巳午未申酉戌亥 (Zi, Chou, Yin, Mao, Chen, Si, Wu, Wei, Shen, You, Xu, Hai)
- 卜 = divination crack / to divine
- 貞 = to divine / divination query
- 王 = the King (Shang ruler)
- □ = undeciphered character (preserve as [?])
- 帝 = Di / the High God / Shangdi
- 受年 = receive harvest / good harvest year
- 其 = shall / will (modal)
- Numbers: 一二三四五六七八九十 (yi, er, san, si, wu, liu, qi, ba, jiu, shi)
- 牢 = sacrificial animal (penned animal)
- 羌 = Qiang people (often sacrificial victims)
- 眾 = the multitude / commoners

For each line, output: "N. [English translation]" where N is the line number.`
    },
    { role: 'user', content: `Translate these Shang Dynasty oracle bone inscriptions:\n\n${numbered}` }
  ]);

  const lines = text.split('\n').filter(l => /^\d+\./.test(l.trim()));
  return { translations: lines.map(l => l.replace(/^\d+\.\s*/, '').trim()), sentences };
}

async function extractEntities(translations, sentences) {
  const batch = translations.map((t, i) => {
    const s = sentences[i];
    return `[${s.inscription}] ${t}`;
  }).join('\n');

  const content = await callDeepSeek([
    {
      role: 'system',
      content: `Extract entities from translated Shang Dynasty oracle bone inscriptions. Return JSON with "entities" array. Each entity has:
- text: entity as it appears
- type: one of [deity, ruler, diviner, person, place, sacrifice, animal, date, military, weather, harvest, ritual, astronomical, number, group]
- context: brief context
- inscription: which inscription
- source_index: line number (0-based)

Focus on:
- Deities: Di/Shangdi (High God), River God, Mountain God, ancestors by name
- Rulers: Shang kings by name or title
- Diviners: named diviners (貞人) — Zheng, Gu, Bin, etc.
- Dates: Heavenly Stem + Earthly Branch combinations (sexagenary cycle)
- Sacrifices: types (牢/penned animals, 羌/Qiang captives, jade, grain)
- Weather: rain, wind, thunder, drought — these were the main divination topics
- Astronomical: eclipses, stars, unusual celestial events
- Places: cities, rivers, regions
- Military: campaigns, enemies, border threats
- Harvest: crop predictions, agricultural queries`
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

  if (!rosetta.languages_active.includes('chinese_oracle_bone')) rosetta.languages_active.push('chinese_oracle_bone');

  rosetta.corpus_stats.oracle_bones = {
    totalSegments: stats.totalSegments,
    translated: stats.translated,
    entities: stats.entities,
    lastRun: new Date().toISOString()
  };

  if (stats.translated >= stats.totalSegments * 0.95) {
    rosetta.languages_active = rosetta.languages_active.filter(l => l !== 'chinese_oracle_bone');
    if (!rosetta.languages_completed.includes('chinese_oracle_bone')) rosetta.languages_completed.push('chinese_oracle_bone');
  }

  mkdirSync(join(ROSETTA_STATE, '..'), { recursive: true });
  writeFileSync(ROSETTA_STATE, JSON.stringify(rosetta, null, 2));
}

async function run() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(ENTITY_DIR, { recursive: true });

  if (!existsSync(SEGMENTS_FILE)) {
    console.error('Segments file not found. Run oracle-bone-extractor.py first.');
    process.exit(1);
  }

  const segments = JSON.parse(readFileSync(SEGMENTS_FILE, 'utf8'));
  console.log(`Loaded ${segments.length} segments (${segments.reduce((s, seg) => s + seg.sentence_count, 0)} sentences)`);

  const state = loadState();
  state.runs++;

  let batchesUsed = 0;

  while (state.offset < segments.length && batchesUsed < MAX_BATCHES_PER_RUN) {
    const batch = segments.slice(state.offset, state.offset + BATCH_SIZE);

    try {
      const totalSentences = batch.reduce((s, seg) => s + seg.sentence_count, 0);
      console.log(`Translating segments ${state.offset}-${state.offset + batch.length} (${totalSentences} sentences) / ${segments.length}...`);
      const { translations, sentences } = await translateBatch(batch);

      // Save translations
      const outFile = join(OUTPUT_DIR, `obi_${state.offset}.json`);
      const translated = sentences.map((s, i) => ({ ...s, english: translations[i] || '' }));
      writeFileSync(outFile, JSON.stringify(translated, null, 2));
      state.translated += batch.length;

      // Extract entities
      console.log(`  Extracting entities...`);
      const entities = await extractEntities(translations, sentences);
      if (entities.length > 0) {
        const entFile = join(ENTITY_DIR, `obi_entities_${state.offset}.json`);
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

  const summary = `Oracle Bone Translator Run #${state.runs}\nBatches: ${batchesUsed}\nTranslated: ${state.translated}/${segments.length} segments\nEntities: ${state.entities}\nInscriptions: 10,077`;
  console.log(`\n${summary}`);

  if (state.translated > 0) {
    await sendTelegram(`*Oracle Bone Observatory*\n\n${summary}`);
  }
}

run().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
