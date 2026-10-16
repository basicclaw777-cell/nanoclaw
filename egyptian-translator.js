// Egyptian Corpus Translator — Ancient Corpus Programme #2
// Translates German→English, extracts entities, feeds Rosetta accumulation
// DeepSeek API, ~$3 for 130K records

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const KINGSTON = '/Volumes/KINGSTON2/cathedral-archive/egyptian';
const OUTPUT_DIR = join(KINGSTON, 'translated');
const ENTITY_DIR = join(KINGSTON, 'entities');
const STATE_FILE = join(KINGSTON, 'translator-state.json');
const ROSETTA_STATE = '/Users/basicclaw777/Cathedral/agents/rosetta-state.json';

const BATCH_SIZE = 50;  // sentences per API call
const MAX_BATCHES_PER_RUN = 3000;  // full run, ~130K sentences, ~$3

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

async function translateBatch(sentences) {
  const numbered = sentences.map((s, i) => `${i + 1}. ${s}`).join('\n');
  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `You are an expert translator of Egyptological German texts into English. These are academic translations of Ancient Egyptian hieroglyphic, hieratic, and Demotic texts. Preserve all technical terms, proper nouns, and uncertain readings (marked with ? or ...). Output ONLY the numbered English translations, one per line. Format: "1. [English translation]"`
        },
        { role: 'user', content: `Translate these German Egyptological texts to English:\n\n${numbered}` }
      ],
      temperature: 0.1,
      max_tokens: 4000
    })
  });

  const data = await resp.json();
  if (!data || data.error) throw new Error(data?.error?.message || 'Empty response from API');
  if (!data.choices || !data.choices[0]) throw new Error('No choices in response');

  const text = data.choices[0].message.content;
  const lines = text.split('\n').filter(l => /^\d+\./.test(l.trim()));
  return lines.map(l => l.replace(/^\d+\.\s*/, '').trim());
}

async function extractEntities(translations, metadata) {
  const batch = translations.map((t, i) => {
    const m = metadata[i] || {};
    return `[${m.source || 'unknown'}] (${m.dateRange || 'undated'}) ${t}`;
  }).join('\n');

  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `Extract entities from these translated Ancient Egyptian texts. Return JSON array of objects with fields:
- text: the entity as it appears
- type: one of [god, pharaoh, person, place, title, commodity, astronomical, medical, architectural, date, quantity, ritual, animal, plant]
- context: brief context of how it appears
- source_index: which line number (0-based)

Focus on: divine names, royal names, place names, titles/offices, trade goods, astronomical references, medical terms, architectural specifications, ritual objects. Include variant spellings.`
        },
        { role: 'user', content: batch }
      ],
      temperature: 0.1,
      max_tokens: 4000,
      response_format: { type: 'json_object' }
    })
  });

  const data = await resp.json();
  if (!data || data.error) throw new Error(data?.error?.message || 'Empty response');
  if (!data.choices || !data.choices[0]) return [];
  try {
    const parsed = JSON.parse(data.choices[0].message.content);
    return Array.isArray(parsed) ? parsed : (parsed.entities || []);
  } catch {
    return [];
  }
}

function loadState() {
  if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  return { datasets: {}, totalTranslated: 0, totalEntities: 0, runs: 0 };
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function updateRosettaState(stats) {
  let rosetta = {};
  if (existsSync(ROSETTA_STATE)) rosetta = JSON.parse(readFileSync(ROSETTA_STATE, 'utf8'));

  if (!rosetta.languages_completed) rosetta.languages_completed = [];
  if (!rosetta.languages_active) rosetta.languages_active = [];
  if (!rosetta.cross_linguistic_patterns) rosetta.cross_linguistic_patterns = [];
  if (!rosetta.corpus_stats) rosetta.corpus_stats = {};

  if (!rosetta.languages_active.includes('egyptian')) {
    rosetta.languages_active.push('egyptian');
  }

  rosetta.corpus_stats.egyptian = {
    totalRecords: stats.totalRecords,
    translated: stats.totalTranslated,
    entities: stats.totalEntities,
    lastRun: new Date().toISOString()
  };

  // Check completion
  if (stats.totalTranslated >= stats.totalRecords * 0.95) {
    rosetta.languages_active = rosetta.languages_active.filter(l => l !== 'egyptian');
    if (!rosetta.languages_completed.includes('egyptian')) {
      rosetta.languages_completed.push('egyptian');
    }
  }

  mkdirSync(join(ROSETTA_STATE, '..'), { recursive: true });
  writeFileSync(ROSETTA_STATE, JSON.stringify(rosetta, null, 2));
}

async function loadParquet(filePath) {
  // Use python to convert parquet → JSON (pyarrow installed)
  const { execSync } = await import('child_process');
  const tmpJson = filePath.replace('.parquet', '.json');

  if (!existsSync(tmpJson)) {
    execSync(`python3 -c "
import pyarrow.parquet as pq
import json
t = pq.read_table('${filePath}')
rows = t.to_pylist()
with open('${tmpJson}', 'w') as f:
    json.dump(rows, f)
print(f'Converted {len(rows)} rows')
"`, { stdio: 'pipe' });
  }

  return JSON.parse(readFileSync(tmpJson, 'utf8'));
}

async function run() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const entitiesOnly = args.includes('--entities-only');

  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(ENTITY_DIR, { recursive: true });

  const state = loadState();
  state.runs++;

  // Dataset configs
  const datasets = [
    { name: 'bbaw', file: join(KINGSTON, 'bbaw_egyptian.parquet'), translationField: 'translation', hasHiero: true },
    { name: 'tla_earlier', file: join(KINGSTON, 'tla/earlier_egyptian.parquet'), translationField: 'translation', hasHiero: true },
    { name: 'tla_late', file: join(KINGSTON, 'tla/late_egyptian.parquet'), translationField: 'translation', hasHiero: true },
    { name: 'tla_demotic', file: join(KINGSTON, 'tla/demotic.parquet'), translationField: 'translation', hasHiero: false }
  ];

  let totalProcessed = 0;
  let totalEntities = 0;
  let batchesUsed = 0;

  for (const ds of datasets) {
    if (batchesUsed >= MAX_BATCHES_PER_RUN) break;

    if (!existsSync(ds.file)) {
      console.log(`Skipping ${ds.name} — file not found`);
      continue;
    }

    console.log(`\nLoading ${ds.name}...`);
    const rows = await loadParquet(ds.file);

    if (!state.datasets[ds.name]) {
      state.datasets[ds.name] = { offset: 0, translated: 0, entities: 0 };
    }

    const dsState = state.datasets[ds.name];
    const remaining = rows.length - dsState.offset;
    if (remaining <= 0) {
      console.log(`${ds.name}: complete (${rows.length} rows)`);
      continue;
    }

    console.log(`${ds.name}: ${dsState.offset}/${rows.length} done, ${remaining} remaining`);

    while (dsState.offset < rows.length && batchesUsed < MAX_BATCHES_PER_RUN) {
      const batch = rows.slice(dsState.offset, dsState.offset + BATCH_SIZE);
      const germanTexts = batch.map(r => r[ds.translationField] || '');

      // Skip empty batches
      if (germanTexts.every(t => !t.trim())) {
        dsState.offset += batch.length;
        continue;
      }

      try {
        // Translate German → English
        let englishTexts;
        if (!entitiesOnly) {
          console.log(`  Translating batch ${dsState.offset}-${dsState.offset + batch.length}...`);
          englishTexts = await translateBatch(germanTexts);

          // Save translations
          const translatedBatch = batch.map((r, i) => ({
            ...r,
            english: englishTexts[i] || germanTexts[i],
            source_dataset: ds.name
          }));

          const outFile = join(OUTPUT_DIR, `${ds.name}_${dsState.offset}.json`);
          writeFileSync(outFile, JSON.stringify(translatedBatch, null, 2));
          dsState.translated += batch.length;
          totalProcessed += batch.length;
        } else {
          englishTexts = germanTexts;
        }

        // Extract entities
        const metadata = batch.map(r => ({
          source: ds.name,
          dateRange: r.dateNotBefore && r.dateNotAfter
            ? `${r.dateNotBefore} to ${r.dateNotAfter}`
            : 'undated'
        }));

        console.log(`  Extracting entities...`);
        const entities = await extractEntities(englishTexts, metadata);

        if (entities.length > 0) {
          const entFile = join(ENTITY_DIR, `${ds.name}_entities_${dsState.offset}.json`);
          writeFileSync(entFile, JSON.stringify(entities, null, 2));
          dsState.entities += entities.length;
          totalEntities += entities.length;
        }

        dsState.offset += batch.length;
        batchesUsed++;

        // Rate limit: 500ms between batches
        await new Promise(r => setTimeout(r, 500));

      } catch (err) {
        console.error(`  Error at offset ${dsState.offset}: ${err.message}`);
        if (err.message.includes('Insufficient Balance')) {
          console.error('DeepSeek balance exhausted. Stopping.');
          break;
        }
        // Skip failed batch
        dsState.offset += batch.length;
      }
    }

    saveState(state);
  }

  state.totalTranslated = Object.values(state.datasets).reduce((s, d) => s + d.translated, 0);
  state.totalEntities = Object.values(state.datasets).reduce((s, d) => s + d.entities, 0);
  saveState(state);

  // Update Rosetta accumulation state
  updateRosettaState({
    totalRecords: 130498,
    totalTranslated: state.totalTranslated,
    totalEntities: state.totalEntities
  });

  const summary = `Egyptian Translator Run #${state.runs}\nBatches: ${batchesUsed}\nTranslated this run: ${totalProcessed}\nEntities this run: ${totalEntities}\nTotal translated: ${state.totalTranslated}/130,498\nTotal entities: ${state.totalEntities}`;
  console.log(`\n${summary}`);

  if (totalProcessed > 0 || totalEntities > 0) {
    await sendTelegram(`*Egyptian Observatory*\n\n${summary}`);
  }

  if (dryRun) console.log('\n(dry run — no API calls made)');
}

run().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
