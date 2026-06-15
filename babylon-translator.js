// Babylonian / Akkadian Cuneiform Translator — Ancient Corpus Programme #5
// Akkadian transliteration → English (literal vs [inferred] separated) + entities + classification.
// Clone of oracle-bone-translator.js, hardened. Target gold: astronomy + mathematics.
// DeepSeek primary, local Ollama (hermes3) fallback. Cost-metered + budget-capped (SI-21/22).
//   node babylon-translator.js --calibrate   2 tablets, console, no Telegram, no spend cap
//   node babylon-translator.js               full run, LOCAL data
//   node babylon-translator.js --prod        full run, KINGSTON2 data (run in TCC-permitted env)

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';

const CALIBRATE = process.argv.includes('--calibrate');
const PROD = process.argv.includes('--prod');

const BASE = PROD ? '/Volumes/KINGSTON2/cathedral-archive/babylon'
                  : '/Users/basicclaw777/nanoclaw/babylon';
const SEGMENTS_FILE = join(BASE, 'extracted/segments.json');
const OUTPUT_DIR = join(BASE, 'translated');
const ENTITY_DIR = join(BASE, 'entities');
const STATE_FILE = join(BASE, 'translator-state.json');
const SPEND_LOG = join(BASE, 'spend.log');
const ROSETTA_STATE = '/Users/basicclaw777/Cathedral/agents/rosetta-state.json';

const BATCH_SIZE = CALIBRATE ? 2 : 8;
const MAX_BATCHES_PER_RUN = CALIBRATE ? 1 : 200;
const MAX_SPEND_USD = CALIBRATE ? Infinity : 5.0;     // SI-21 budget cap per run
// deepseek-chat approx pricing (USD per 1M tokens) — update if rates change
const PRICE_IN = 0.27 / 1e6, PRICE_OUT = 1.10 / 1e6;

const env = Object.fromEntries(
  readFileSync('/Users/basicclaw777/nanoclaw/.env', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const DEEPSEEK_KEY = env.DEEPSEEK_API_KEY, TELEGRAM_TOKEN = env.TELEGRAM_TOKEN, CHAT_ID = env.PAUL_CHAT_ID;

let spend = 0, tokIn = 0, tokOut = 0;   // running spend meter

async function sendTelegram(text) {
  if (CALIBRATE) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'Markdown' })
    });
  } catch (e) { /* silent */ }
}

let usingFallback = false;
async function callLLM(messages, jsonMode = false) {
  if (!usingFallback) {
    try {
      const body = { model: 'deepseek-chat', messages, temperature: 0.1, max_tokens: 4000 };
      if (jsonMode) body.response_format = { type: 'json_object' };
      const resp = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
        body: JSON.stringify(body)
      });
      const data = await resp.json();
      if (data?.error) {
        if (/balance|insufficient/i.test(data.error.message || '')) { console.error('  DeepSeek balance dead → local hermes3'); usingFallback = true; }
        else throw new Error(data.error.message);
      } else {
        const u = data.usage || {};
        tokIn += u.prompt_tokens || 0; tokOut += u.completion_tokens || 0;
        spend += (u.prompt_tokens || 0) * PRICE_IN + (u.completion_tokens || 0) * PRICE_OUT;
        return { text: data.choices[0].message.content, engine: 'deepseek' };
      }
    } catch (e) { console.error(`  DeepSeek error (${e.message}) → local hermes3`); usingFallback = true; }
  }
  const resp = await fetch('http://localhost:11434/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'hermes3', messages, stream: false, options: { temperature: 0.1 }, format: jsonMode ? 'json' : undefined })
  });
  const data = await resp.json();
  return { text: data.message.content, engine: 'hermes3-local' };   // $0
}

const SYSTEM_TRANSLATE = `You are an expert Assyriologist translating Akkadian/Babylonian cuneiform transliterations into English. Texts span c. 1800 BCE – 75 CE, base-60 (sexagesimal) culture.

Conventions:
- lowercase = Akkadian phonetic; CAPITALS = Sumerograms (logograms); {d}=deity, {m}=male name, {ki}/KI=place, {mul}/MUL=star/constellation determinatives. Hyphens separate signs (a-wi-lum = awīlum).
- MUL=star/constellation; {d}30/Sin=Moon-god/Moon; {d}UTU/Šamaš=Sun; {d}Dilbat=Venus; AN=sky/Anu.
- Numbers are base-60; preserve values, note if sexagesimal.
- x or [...] = broken; preserve as [...]. šumma = "if" (law/omen conditional).

YOUR JOB: translate each line into ENGLISH. Output the English MEANING — never echo the transliteration back.

Separate fact from inference (output is forensically verified):
- Give the LITERAL English meaning of what the signs say.
- Put any identification, modern equivalent, date conversion, or interpretive guess in [inferred: ...] — keep it OUT of the literal English.
- Uncertain sign/value → [uncertain]. Never smooth over a gap.

Example —
Input:  1. [x] šumma awīlum īn mār awīlim uḫtappid, īššu uḫappadū.
Output: 1. If a man destroys the eye of a member of the awīlum-class, his eye shall be destroyed. [inferred: Code of Hammurabi §196, lex talionis]

For each numbered line output: "N. <English translation> [inferred: <identifications/equivalents>]". Keep proper names; flag text-type if obvious.`;

async function translateBatch(tablets) {
  const lines = [];
  for (const t of tablets) for (const ln of t.lines) lines.push({ tablet: t.tablet_id, text: ln });
  const numbered = lines.map((l, i) => `${i + 1}. [${l.tablet}] ${l.text}`).join('\n');
  const { text, engine } = await callLLM([
    { role: 'system', content: SYSTEM_TRANSLATE },
    { role: 'user', content: `Translate these Akkadian/Babylonian transliterated lines:\n\n${numbered}` }
  ]);
  const out = text.split('\n').filter(l => /^\d+\./.test(l.trim())).map(l => l.replace(/^\d+\.\s*/, '').trim());
  return { translations: out, lines, engine };
}

// Entity extraction tuned for ALL text-types (was astronomical-skewed; now covers law/omen/econ too).
async function extractEntities(translations, lines) {
  const batch = translations.map((t, i) => `${i}. [${lines[i]?.tablet}] ${t}`).join('\n');
  const { text } = await callLLM([
    { role: 'system', content: `Extract entities from translated Babylonian texts. Return JSON {"entities":[...]}.
Each entity: text, type, context (SHORT — a few words, not the whole line), tablet, source_index (the leading number).
type ∈ [astronomical, mathematical, omen, legal, economic, medical, deity, ruler, diviner, person, place, measurement, date, ritual, concept, social_class].
Extract generously across ALL categories — not only names. Capture: celestial bodies/constellations; numbers/measures/calculations; legal & omen STRUCTURES (e.g. "lex talionis", "false-accusation penalty", "if X then Y"); social classes (awīlum, muškēnum, wardum); deities, kings, diviners, cities; crimes, punishments, body parts in legal context. Aim for several entities per line where present.` },
    { role: 'user', content: batch }
  ], true);
  try { const p = JSON.parse(text); return Array.isArray(p) ? p : (p.entities || []); } catch { return []; }
}

function loadState() {
  if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  return { offset: 0, translated: 0, entities: 0, runs: 0, totalSpend: 0 };
}
const saveState = s => writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));

async function run() {
  mkdirSync(OUTPUT_DIR, { recursive: true }); mkdirSync(ENTITY_DIR, { recursive: true });
  if (!existsSync(SEGMENTS_FILE)) { console.error(`No segments file: ${SEGMENTS_FILE}  (run babylon-fetch.js first)`); process.exit(1); }

  const tablets = JSON.parse(readFileSync(SEGMENTS_FILE, 'utf8'));
  console.log(`Loaded ${tablets.length} tablets${CALIBRATE ? ' [CALIBRATION]' : PROD ? ' [PROD/KINGSTON2]' : ' [LOCAL]'}`);
  const state = loadState(); state.runs++;
  let batches = 0;

  while (state.offset < tablets.length && batches < MAX_BATCHES_PER_RUN) {
    if (spend >= MAX_SPEND_USD) { console.error(`Budget cap $${MAX_SPEND_USD} reached — stopping (SI-21).`); break; }
    const batch = tablets.slice(state.offset, state.offset + BATCH_SIZE);
    try {
      console.log(`Translating tablets ${state.offset}-${state.offset + batch.length}/${tablets.length}  ($${spend.toFixed(4)} spent)...`);
      const { translations, lines, engine } = await translateBatch(batch);
      console.log(`  engine: ${engine}`);
      const translated = lines.map((l, i) => ({ ...l, english: translations[i] || '' }));
      writeFileSync(join(OUTPUT_DIR, `bab_${state.offset}.json`), JSON.stringify(translated, null, 2));
      state.translated += batch.length;

      console.log('  extracting entities...');
      const entities = await extractEntities(translations, lines);
      if (entities.length) { writeFileSync(join(ENTITY_DIR, `bab_entities_${state.offset}.json`), JSON.stringify(entities, null, 2)); state.entities += entities.length; }

      state.offset += batch.length; batches++; state.totalSpend = (state.totalSpend || 0) + spend; saveState(state);

      if (CALIBRATE) {
        console.log('\n--- CALIBRATION OUTPUT ---');
        translated.forEach(t => console.log(`[${t.tablet}] ${t.text}\n   → ${t.english}`));
        console.log(`\nEntities (${entities.length}):`);
        entities.slice(0, 25).forEach(e => console.log(`   ${e.type}: ${e.text} — ${e.context || ''}`));
      }
      await new Promise(r => setTimeout(r, 400));
    } catch (err) { console.error(`Error at ${state.offset}: ${err.message}`); state.offset += batch.length; saveState(state); }
  }

  const cost = `$${spend.toFixed(4)} this run (${tokIn} in / ${tokOut} out tok)`;
  try { appendFileSync(SPEND_LOG, `${new Date().toISOString()} run#${state.runs} ${cost} engine=${usingFallback ? 'hermes3' : 'deepseek'}\n`); } catch {}
  const summary = `Babylon Translator Run #${state.runs}\nBatches: ${batches}\nTranslated: ${state.translated}/${tablets.length} tablets\nEntities: ${state.entities}\nSpend: ${cost}`;
  console.log(`\n${summary}`);
  if (!CALIBRATE && state.translated > 0) await sendTelegram(`*Babylon Observatory*\n\n${summary}`);
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
