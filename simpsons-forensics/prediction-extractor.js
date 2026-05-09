import dotenv from 'dotenv';
dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPUS_PATH = join(__dirname, 'corpus.json');
const OUTPUT_PATH = join(__dirname, 'predictions.json');

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
if (!DEEPSEEK_API_KEY) {
  console.error('DEEPSEEK_API_KEY not found in .env');
  process.exit(1);
}

const SYSTEM_PROMPT = `You are a forensic analyst extracting future-referencing claims from Simpsons episodes. For each episode, identify any reference to: future technology, political events, cultural phenomena, scientific discoveries, health crises, disasters, or corporate events that had NOT yet occurred at the time of broadcast. Return ONLY a JSON array. If no predictions found, return an empty array.`;

function buildUserPrompt(episode) {
  const title = episode.title || 'Unknown';
  const season = episode.season || '?';
  const ep = episode.episodeNum || episode.episode || '?';
  const date = episode.airDate || episode.air_date || 'unknown';
  const summary = episode.summary || '';
  const gags = Array.isArray(episode.notableGags)
    ? episode.notableGags.join('; ')
    : (episode.notable_gags || episode.notableGags || '');

  return `Episode: ${title} (Season ${season}, Ep ${ep}, aired ${date})
Summary: ${summary}
Notable gags: ${gags}

Extract predictions as JSON array: [{"claim": "...", "specificity": 1-5, "domain": "political|technology|science|health|cultural|disaster|military", "description": "brief description of what was shown"}]`;
}

async function callDeepSeek(systemPrompt, userPrompt) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 2000
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`DeepSeek API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '[]';

  // Extract JSON array from response (handle markdown code blocks)
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.warn('  Failed to parse predictions JSON, returning empty array');
    return [];
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('=== Simpsons Temporal Forensics — Prediction Extractor ===\n');

  let corpus;
  try {
    corpus = JSON.parse(readFileSync(CORPUS_PATH, 'utf-8'));
  } catch (e) {
    console.error(`Failed to read corpus.json: ${e.message}`);
    process.exit(1);
  }

  console.log(`Loaded ${corpus.length} episodes from corpus.json\n`);

  const results = [];
  const BATCH_SIZE = 5;
  const DELAY_MS = 2000;

  for (let i = 0; i < corpus.length; i++) {
    const episode = corpus[i];
    const title = episode.title || 'Unknown';
    const season = episode.season || '?';
    const epNum = episode.episodeNum || episode.episode || '?';
    const airDate = episode.airDate || episode.air_date || 'unknown';

    console.log(`[${i + 1}/${corpus.length}] S${season}E${epNum} — ${title}`);

    try {
      const userPrompt = buildUserPrompt(episode);
      const predictions = await callDeepSeek(SYSTEM_PROMPT, userPrompt);

      const entry = {
        episode: title,
        season: typeof season === 'number' ? season : parseInt(season) || 0,
        episodeNum: typeof epNum === 'number' ? epNum : parseInt(epNum) || 0,
        airDate: airDate,
        predictions: predictions
      };

      results.push(entry);
      console.log(`  → ${predictions.length} prediction(s) found`);
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
      results.push({
        episode: title,
        season: typeof season === 'number' ? season : parseInt(season) || 0,
        episodeNum: typeof epNum === 'number' ? epNum : parseInt(epNum) || 0,
        airDate: airDate,
        predictions: [],
        error: err.message
      });
    }

    // Rate limiting: pause every BATCH_SIZE episodes
    if ((i + 1) % BATCH_SIZE === 0 && i + 1 < corpus.length) {
      console.log(`  [rate limit] waiting ${DELAY_MS}ms...\n`);
      await sleep(DELAY_MS);
    }
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));

  const totalPredictions = results.reduce((sum, r) => sum + r.predictions.length, 0);
  const episodesWithPredictions = results.filter(r => r.predictions.length > 0).length;

  console.log('\n=== Extraction Complete ===');
  console.log(`Episodes processed: ${results.length}`);
  console.log(`Episodes with predictions: ${episodesWithPredictions}`);
  console.log(`Total predictions extracted: ${totalPredictions}`);
  console.log(`Output: ${OUTPUT_PATH}`);
}

main();
