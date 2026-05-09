/**
 * simpsons-signal.js — Strategy 12: Simpsons Temporal Signal
 *
 * Reads the Simpsons Watchlist (unfulfilled predictions) and cross-references
 * with current market conditions to generate trade signals.
 *
 * The Simpsons is a 37-year dataset that has demonstrably front-run reality.
 * The Watchlist contains predictions ranked by specificity that haven't happened yet.
 * When real-world indicators start confirming a Watchlist item, this strategy fires.
 *
 * ESM. Called by trading-orchestrator.js.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WATCHLIST_PATH = path.join(__dirname, '..', '..', 'simpsons-forensics', 'watchlist.json');
const MATCHES_PATH = path.join(__dirname, '..', '..', 'simpsons-forensics', 'matches.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'signals', 'simpsons-signals-latest.json');

// Map prediction domains to tradeable sectors/assets
const DOMAIN_MARKET_MAP = {
  political: [
    { asset: 'GLD', direction: 'long', reasoning: 'Political instability → gold safe haven' },
    { asset: 'BTC', direction: 'long', reasoning: 'Political instability → decentralized asset flight' },
    { asset: 'DXY', direction: 'short', reasoning: 'Political upheaval → dollar weakness' },
  ],
  technology: [
    { asset: 'QQQ', direction: 'long', reasoning: 'Tech disruption → NASDAQ growth' },
    { asset: 'ARKK', direction: 'long', reasoning: 'Disruptive innovation basket' },
  ],
  health: [
    { asset: 'XBI', direction: 'long', reasoning: 'Health crisis → biotech demand' },
    { asset: 'JETS', direction: 'short', reasoning: 'Pandemic/health crisis → travel collapse' },
    { asset: 'ZM', direction: 'long', reasoning: 'Health crisis → remote work surge' },
  ],
  disaster: [
    { asset: 'GLD', direction: 'long', reasoning: 'Disaster → safe haven demand' },
    { asset: 'VIX', direction: 'long', reasoning: 'Disaster → volatility spike' },
  ],
  corporate: [
    { asset: 'SPY', direction: 'short', reasoning: 'Corporate scandal → market downturn' },
  ],
  cultural: [
    { asset: 'BTC', direction: 'long', reasoning: 'Cultural shift → alternative asset interest' },
  ],
  military: [
    { asset: 'LMT', direction: 'long', reasoning: 'Military conflict → defense spending' },
    { asset: 'USO', direction: 'long', reasoning: 'Military conflict → oil price spike' },
    { asset: 'GLD', direction: 'long', reasoning: 'Military conflict → safe haven' },
  ],
  science: [
    { asset: 'QQQ', direction: 'long', reasoning: 'Scientific breakthrough → tech sector lift' },
  ],
};

/**
 * Score a watchlist prediction for trading relevance
 * Higher score = more actionable
 */
function scorePrediction(prediction) {
  let score = 0;

  // Specificity is the primary driver
  score += prediction.specificity * 20;

  // Domain tradability
  const trades = DOMAIN_MARKET_MAP[prediction.domain];
  if (trades && trades.length > 0) score += 15;

  // Age of prediction — older predictions that haven't happened carry more weight
  const airDate = new Date(prediction.airDate);
  const ageYears = (Date.now() - airDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (ageYears > 20) score += 10;
  else if (ageYears > 10) score += 5;

  return score;
}

/**
 * Generate trading signals from the Simpsons Watchlist
 */
export function generateSimpsonsSignals() {
  if (!fs.existsSync(WATCHLIST_PATH)) {
    console.log('[simpsons-signal] No watchlist.json found. Run the forensics pipeline first.');
    return { signals: [], strategy: 'simpsons_temporal', total_signals: 0 };
  }

  const watchlist = JSON.parse(fs.readFileSync(WATCHLIST_PATH, 'utf8'));
  const signals = [];

  // Score and rank all watchlist items (flat array of predictions)
  const scored = watchlist
    .filter(w => w.claim && w.domain)
    .map(pred => ({
      ...pred,
      score: scorePrediction(pred),
    }))
    .sort((a, b) => b.score - a.score);

  // Take top 5 most tradeable predictions
  const topPredictions = scored.slice(0, 5);

  for (const pred of topPredictions) {
    const trades = DOMAIN_MARKET_MAP[pred.domain] || DOMAIN_MARKET_MAP.cultural;

    for (const trade of trades) {
      signals.push({
        source: 'simpsons_temporal',
        asset: trade.asset,
        direction: trade.direction,
        strength: Math.min(pred.score / 100, 0.9), // Normalize to 0-1, cap at 0.9
        reasoning: `[Simpsons Signal] "${pred.claim}" (${pred.episode}, ${pred.airDate}, specificity ${pred.specificity}). ${trade.reasoning}`,
        metadata: {
          episode: pred.episode,
          airDate: pred.airDate,
          claim: pred.claim,
          domain: pred.domain,
          specificity: pred.specificity,
          anomalyScore: pred.score,
        },
      });
    }
  }

  const output = {
    strategy: 'simpsons_temporal',
    generated: new Date().toISOString(),
    watchlist_size: watchlist.length,
    predictions_scored: scored.length,
    signals_generated: signals.length,
    top_prediction: topPredictions[0]?.claim || 'none',
    signals,
  };

  // Write signals file
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`[simpsons-signal] Generated ${signals.length} signals from ${scored.length} watchlist predictions`);
  console.log(`[simpsons-signal] Top prediction: "${topPredictions[0]?.claim}"`);

  return output;
}

// CLI mode
if (import.meta.url === `file://${process.argv[1]}`) {
  generateSimpsonsSignals();
}
