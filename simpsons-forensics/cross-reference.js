import dotenv from 'dotenv';
dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PREDICTIONS_PATH = join(__dirname, 'predictions.json');
const EVENTS_PATH = join(__dirname, 'events.json');
const MATCHES_PATH = join(__dirname, 'matches.json');
const WATCHLIST_PATH = join(__dirname, 'watchlist.json');

// Stop words excluded from keyword matching
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
  'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
  'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'just', 'because', 'but', 'and',
  'or', 'if', 'while', 'about', 'up', 'down', 'that', 'this', 'these',
  'those', 'it', 'its', 'he', 'she', 'they', 'them', 'his', 'her',
  'their', 'what', 'which', 'who', 'whom', 'any', 'also', 'become',
  'becomes', 'became', 'get', 'gets', 'got', 'make', 'makes', 'made',
  'take', 'takes', 'took', 'like', 'new', 'one', 'two', 'first',
  'after', 'show', 'shown', 'shows', 'episode', 'lisa', 'bart',
  'homer', 'marge', 'springfield', 'simpsons'
]);

// Base probability estimates by domain (lower = rarer = higher anomaly)
const DOMAIN_BASE_PROBABILITY = {
  political: 0.15,
  technology: 0.20,
  science: 0.10,
  health: 0.15,
  cultural: 0.25,
  disaster: 0.08,
  military: 0.12
};

const MATCH_THRESHOLD = 0.3;

function extractWords(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function yearsBetween(dateA, dateB) {
  const a = new Date(dateA);
  const b = new Date(dateB);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
  return Math.abs((b - a) / (365.25 * 24 * 60 * 60 * 1000));
}

function computeMatchScore(predictionWords, eventWords, specificity, deltaT) {
  const predSet = new Set(predictionWords);
  const eventSet = new Set(eventWords);
  const shared = [...predSet].filter(w => eventSet.has(w));

  if (predSet.size === 0) return { score: 0, sharedWords: [] };

  const overlap = shared.length / predSet.size;
  const score = overlap * specificity * (1 + deltaT / 10);

  return { score, sharedWords: shared };
}

function computeAnomalyScore(specificity, deltaT, domain) {
  const baseProbability = DOMAIN_BASE_PROBABILITY[domain] || 0.20;
  return specificity * deltaT * (1 / baseProbability);
}

function main() {
  console.log('=== Simpsons Temporal Forensics — Cross-Reference Engine ===\n');

  let predictions, events;

  try {
    predictions = JSON.parse(readFileSync(PREDICTIONS_PATH, 'utf-8'));
  } catch (e) {
    console.error(`Failed to read predictions.json: ${e.message}`);
    process.exit(1);
  }

  try {
    events = JSON.parse(readFileSync(EVENTS_PATH, 'utf-8'));
  } catch (e) {
    console.error(`Failed to read events.json: ${e.message}`);
    process.exit(1);
  }

  console.log(`Loaded ${predictions.length} episodes with predictions`);
  console.log(`Loaded ${events.length} real-world events\n`);

  // Pre-process event words
  const eventCache = events.map(event => {
    const textFields = [
      event.title || event.name || '',
      event.description || event.summary || '',
      event.category || event.domain || '',
      ...(event.keywords || [])
    ].join(' ');
    return {
      event,
      words: extractWords(textFields),
      date: event.date || event.eventDate || event.event_date || null
    };
  });

  const matches = [];
  const unmatched = [];
  let totalPredictions = 0;

  for (const episode of predictions) {
    if (!episode.predictions || episode.predictions.length === 0) continue;

    for (const prediction of episode.predictions) {
      totalPredictions++;

      const predText = [
        prediction.claim || '',
        prediction.description || ''
      ].join(' ');
      const predWords = extractWords(predText);
      const specificity = prediction.specificity || 1;
      const domain = prediction.domain || 'cultural';

      let bestMatch = null;
      let bestScore = 0;

      for (const { event, words: eventWords, date: eventDate } of eventCache) {
        // Prediction must precede event
        if (!eventDate || !episode.airDate) continue;
        const airDate = new Date(episode.airDate);
        const evDate = new Date(eventDate);
        if (isNaN(airDate.getTime()) || isNaN(evDate.getTime())) continue;
        if (evDate <= airDate) continue;

        const deltaT = yearsBetween(episode.airDate, eventDate);
        const { score, sharedWords } = computeMatchScore(predWords, eventWords, specificity, deltaT);

        if (score > MATCH_THRESHOLD && score > bestScore) {
          bestScore = score;
          bestMatch = {
            prediction: {
              claim: prediction.claim,
              specificity: specificity,
              domain: domain,
              description: prediction.description || '',
              episode: episode.episode,
              season: episode.season,
              episodeNum: episode.episodeNum,
              airDate: episode.airDate
            },
            event: event,
            deltaT_years: Math.round(deltaT * 10) / 10,
            matchScore: Math.round(score * 100) / 100,
            anomalyScore: Math.round(computeAnomalyScore(specificity, deltaT, domain) * 10) / 10,
            sharedWords: sharedWords,
            status: 'VERIFIED'
          };
        }
      }

      if (bestMatch) {
        matches.push(bestMatch);
      } else {
        unmatched.push({
          claim: prediction.claim,
          specificity: specificity,
          domain: domain,
          description: prediction.description || '',
          episode: episode.episode,
          season: episode.season,
          episodeNum: episode.episodeNum,
          airDate: episode.airDate
        });
      }
    }
  }

  // Sort matches by anomaly score descending
  matches.sort((a, b) => b.anomalyScore - a.anomalyScore);

  // Sort watchlist by specificity descending
  unmatched.sort((a, b) => b.specificity - a.specificity);

  // Write outputs
  writeFileSync(MATCHES_PATH, JSON.stringify(matches, null, 2));
  writeFileSync(WATCHLIST_PATH, JSON.stringify(unmatched, null, 2));

  // Summary
  console.log('=== Cross-Reference Complete ===');
  console.log(`Total predictions analyzed: ${totalPredictions}`);
  console.log(`Verified matches: ${matches.length}`);
  console.log(`Unfulfilled (watchlist): ${unmatched.length}`);
  console.log(`Match rate: ${totalPredictions > 0 ? Math.round((matches.length / totalPredictions) * 100) : 0}%`);

  if (matches.length > 0) {
    console.log('\n--- Top 5 Matches by Anomaly Score ---');
    for (const m of matches.slice(0, 5)) {
      console.log(`  [${m.anomalyScore}] "${m.prediction.claim}"`);
      console.log(`    Episode: S${m.prediction.season}E${m.prediction.episodeNum} (${m.prediction.airDate})`);
      console.log(`    Delta: ${m.deltaT_years} years | Match: ${m.matchScore} | Domain: ${m.prediction.domain}`);
    }
  }

  if (unmatched.length > 0) {
    console.log('\n--- Top 5 Watchlist by Specificity ---');
    for (const u of unmatched.slice(0, 5)) {
      console.log(`  [spec ${u.specificity}] "${u.claim}"`);
      console.log(`    Episode: S${u.season}E${u.episodeNum} (${u.airDate}) | Domain: ${u.domain}`);
    }
  }

  console.log(`\nOutput: ${MATCHES_PATH}`);
  console.log(`Watchlist: ${WATCHLIST_PATH}`);
}

main();
