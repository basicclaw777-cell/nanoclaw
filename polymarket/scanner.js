import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const GAMMA = CONFIG.gammaApi;
const DB_PATH = path.join(__dirname, 'markets.json');

// Category keywords for filtering (Gamma API uses tags/slugs, not strict categories)
const GEO_KEYWORDS = [
  'war', 'ceasefire', 'peace', 'sanction', 'tariff', 'nato', 'iran', 'china', 'russia',
  'ukraine', 'taiwan', 'israel', 'treaty', 'election', 'regulation', 'fed', 'rate',
  'gdp', 'inflation', 'bitcoin', 'ethereum', 'sec', 'congress', 'bill', 'law',
  'ban', 'approve', 'resign', 'impeach', 'indictment', 'conviction', 'deal',
  'summit', 'agreement', 'default', 'recession', 'shutdown', 'strike'
];

const EXCLUDE_KEYWORDS = [
  'nfl', 'nba', 'mlb', 'nhl', 'premier league', 'la liga', 'serie a',
  'world cup', 'champions league', 'oscar', 'grammy', 'emmy', 'bachelor',
  'love island', 'survivor', 'big brother', 'mma', 'ufc', 'boxing match'
];

async function fetchEvents(limit = 100) {
  const url = `${GAMMA}/events?active=true&closed=false&limit=${limit}&order=volume24hr&ascending=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gamma API ${res.status}: ${res.statusText}`);
  return res.json();
}

function scoreRelevance(event) {
  const text = `${event.title} ${event.description || ''}`.toLowerCase();

  // Hard exclude
  for (const kw of EXCLUDE_KEYWORDS) {
    if (text.includes(kw)) return -1;
  }

  // Score by keyword matches
  let score = 0;
  for (const kw of GEO_KEYWORDS) {
    if (text.includes(kw)) score += 1;
  }

  return score;
}

function extractMarkets(event) {
  if (!event.markets || !event.markets.length) return [];

  return event.markets.map(m => {
    const outcomes = m.outcomes ? JSON.parse(m.outcomes) : ['Yes', 'No'];
    const prices = m.outcomePrices ? JSON.parse(m.outcomePrices) : [null, null];

    return {
      eventId: event.id,
      eventTitle: event.title,
      marketId: m.id,
      question: m.question,
      slug: m.slug,
      conditionId: m.conditionId,
      outcomes,
      prices: prices.map(Number),
      yesPrice: Number(prices[0]) || null,
      noPrice: Number(prices[1]) || null,
      volume24hr: Number(event.volume24hr) || 0,
      liquidity: Number(m.liquidity) || 0,
      endDate: m.endDate,
      daysToResolution: m.endDate ? Math.ceil((new Date(m.endDate) - Date.now()) / 86400000) : null,
      image: event.image,
      description: event.description
    };
  });
}

function filterMarkets(markets) {
  const { minVolume24hr, maxResolutionDays } = CONFIG.scanner;

  return markets.filter(m => {
    if (m.volume24hr < minVolume24hr) return false;
    if (maxResolutionDays && m.daysToResolution && m.daysToResolution > maxResolutionDays) return false;
    if (!m.yesPrice || m.yesPrice <= 0.02 || m.yesPrice >= 0.98) return false; // skip near-resolved
    return true;
  });
}

async function scan() {
  console.log(`[SCANNER] Fetching events from Gamma API...`);

  const events = await fetchEvents(CONFIG.scanner.scanLimit);
  console.log(`[SCANNER] ${events.length} events fetched`);

  // Score and filter
  const scored = events
    .map(e => ({ event: e, relevance: scoreRelevance(e) }))
    .filter(s => s.relevance >= 0) // exclude hard-filtered
    .sort((a, b) => b.relevance - a.relevance);

  // Extract markets
  let allMarkets = [];
  for (const { event, relevance } of scored) {
    const markets = extractMarkets(event);
    for (const m of markets) {
      m.relevanceScore = relevance;
    }
    allMarkets.push(...markets);
  }

  // Filter by config
  const filtered = filterMarkets(allMarkets);

  // Separate into research candidates (relevance > 0) and other
  const candidates = filtered.filter(m => m.relevanceScore > 0);
  const other = filtered.filter(m => m.relevanceScore === 0);

  // Sort candidates by relevance then volume
  candidates.sort((a, b) => b.relevanceScore - a.relevanceScore || b.volume24hr - a.volume24hr);

  const result = {
    scannedAt: new Date().toISOString(),
    totalEvents: events.length,
    totalMarkets: allMarkets.length,
    filteredMarkets: filtered.length,
    candidates: candidates.length,
    markets: {
      candidates: candidates.slice(0, 30),
      other: other.slice(0, 20)
    }
  };

  fs.writeFileSync(DB_PATH, JSON.stringify(result, null, 2));
  console.log(`[SCANNER] ${candidates.length} research candidates, ${other.length} other. Saved to markets.json`);

  return result;
}

// CLI
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  scan().then(r => {
    console.log(`\n=== TOP RESEARCH CANDIDATES ===\n`);
    for (const m of r.markets.candidates.slice(0, 15)) {
      const price = m.yesPrice ? `YES ${(m.yesPrice * 100).toFixed(0)}c` : '?';
      const days = m.daysToResolution ? `${m.daysToResolution}d` : '?';
      const vol = `$${(m.volume24hr / 1000).toFixed(0)}K`;
      console.log(`  [${price}] [${days}] [${vol}] ${m.question}`);
    }
  }).catch(console.error);
}

export { scan, fetchEvents };
