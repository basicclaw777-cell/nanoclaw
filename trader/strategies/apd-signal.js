/**
 * apd-signal.js — Strategy: Attention-Positioning Divergence (APD)
 *
 * Measures divergence between market attention (volume acceleration, price momentum)
 * and derivatives positioning (funding rates, open interest).
 *
 * Core thesis (DeepSeek relay 2026-10-03):
 * "Attention is the leading indicator. Positioning is the lagging one.
 *  When they diverge, the gap closes via price."
 *
 * LONG: attention accelerating + positioning not extreme → crowd hasn't caught up
 * SHORT: attention fading + positioning still extreme long → crowd trapped
 *
 * Data sources:
 * - Binance Futures API (free, public): funding rates + open interest
 * - CoinGecko (already in stack): volume + price data
 *
 * ESM. Called by trading-orchestrator.js.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SIGNALS_PATH = path.join(__dirname, '..', 'signals', 'crypto-signals-latest.json');
const HISTORY_PATH = path.join(__dirname, '..', 'signals', 'apd-history.json');

const BINANCE_FAPI = 'https://fapi.binance.com';

const BINANCE_SYMBOLS = {
  BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT',
  AVAX: 'AVAXUSDT', LINK: 'LINKUSDT', DOT: 'DOTUSDT',
  ARB: 'ARBUSDT', DOGE: 'DOGEUSDT', ADA: 'ADAUSDT',
  ATOM: 'ATOMUSDT', UNI: 'UNIUSDT',
};

const MIN_HISTORY = 4;
const MAX_HISTORY = 30;
const MIN_STRENGTH = 0.45;
const APD_THRESHOLD = 0.3;

async function fetchJSON(url) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'CathedralTrader/1.0' },
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
  return resp.json();
}

async function getFundingRates(symbol) {
  try {
    const data = await fetchJSON(
      `${BINANCE_FAPI}/fapi/v1/fundingRate?symbol=${symbol}&limit=3`
    );
    return data.map(d => ({
      rate: parseFloat(d.fundingRate),
      time: d.fundingTime,
    }));
  } catch {
    return null;
  }
}

async function getOpenInterest(symbol) {
  try {
    const data = await fetchJSON(
      `${BINANCE_FAPI}/fapi/v1/openInterest?symbol=${symbol}`
    );
    return {
      oi: parseFloat(data.openInterest),
      time: data.time,
    };
  } catch {
    return null;
  }
}

function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_PATH)) {
      return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
    }
  } catch {}
  return { readings: {}, updated_at: null };
}

function saveHistory(history) {
  history.updated_at = new Date().toISOString();
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
}

function addReading(history, asset, reading) {
  if (!history.readings[asset]) history.readings[asset] = [];
  history.readings[asset].push({ ...reading, timestamp: new Date().toISOString() });
  if (history.readings[asset].length > MAX_HISTORY) {
    history.readings[asset] = history.readings[asset].slice(-MAX_HISTORY);
  }
}

function computeAPD(asset, funding, oi, volume, price24hChange, history) {
  const readings = history.readings[asset] || [];

  let attentionScore = 0;

  if (readings.length >= MIN_HISTORY) {
    const recentVolumes = readings.slice(-8).map(r => r.volume).filter(v => v > 0);
    if (recentVolumes.length >= 2 && volume > 0) {
      const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
      const volumeRatio = volume / avgVolume;
      attentionScore = clamp((volumeRatio - 1) * 2, -1, 1);
    }
  }

  if (price24hChange != null) {
    const momentumComponent = clamp(price24hChange / 10, -0.5, 0.5);
    attentionScore = clamp(attentionScore + momentumComponent, -1, 1);
  }

  let positioningScore = 0;

  if (funding && funding.length > 0) {
    const avgFunding = funding.reduce((a, f) => a + f.rate, 0) / funding.length;
    positioningScore = clamp(avgFunding * 2000, -1, 1);
  }

  if (oi && readings.length >= 2) {
    const recentOI = readings.slice(-3).map(r => r.oi).filter(v => v > 0);
    if (recentOI.length > 0) {
      const prevOI = recentOI[recentOI.length - 1];
      if (prevOI > 0) {
        const oiChange = (oi.oi - prevOI) / prevOI;
        const oiComponent = oiChange > 0 ? 0.3 : -0.2;
        positioningScore = clamp(positioningScore + oiComponent, -1, 1);
      }
    }
  }

  return {
    attentionScore: +attentionScore.toFixed(3),
    positioningScore: +positioningScore.toFixed(3),
    apd: +(attentionScore - positioningScore).toFixed(3),
    fundingRate: funding?.[0]?.rate ?? null,
    oiValue: oi?.oi ?? null,
  };
}

function apdToSignal(asset, apd) {
  const absAPD = Math.abs(apd.apd);
  if (absAPD < APD_THRESHOLD) return null;

  const direction = apd.apd > 0 ? 'long' : 'short';
  const strength = Math.min(absAPD / 1.5, 1.0);
  if (strength < MIN_STRENGTH) return null;

  const fundingStr = apd.fundingRate != null
    ? `Funding: ${(apd.fundingRate * 100).toFixed(4)}%. `
    : '';

  const reasoning = direction === 'long'
    ? `${asset} APD +${apd.apd.toFixed(2)}: attention ${apd.attentionScore.toFixed(2)} vs positioning ${apd.positioningScore.toFixed(2)}. ${fundingStr}Volume/momentum accelerating, derivatives not extreme — entry window`
    : `${asset} APD ${apd.apd.toFixed(2)}: attention ${apd.attentionScore.toFixed(2)} vs positioning ${apd.positioningScore.toFixed(2)}. ${fundingStr}Attention fading while crowd still positioned — mean reversion`;

  return {
    source: 'derivatives',
    asset,
    direction,
    strength: +strength.toFixed(3),
    reasoning,
    type: 'apd_divergence',
  };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export async function generateAPDSignals() {
  const signals = [];
  let assetsScanned = 0;
  let binanceHits = 0;

  let marketData = null;
  try {
    if (fs.existsSync(SIGNALS_PATH)) {
      marketData = JSON.parse(fs.readFileSync(SIGNALS_PATH, 'utf8'));
    }
  } catch {}

  const history = loadHistory();

  for (const [asset, binanceSymbol] of Object.entries(BINANCE_SYMBOLS)) {
    assetsScanned++;

    const priceData = marketData?.prices?.[asset];
    const volume = priceData?.volume_24h || 0;
    const price24hChange = priceData?.change_24h ?? null;

    const [funding, oi] = await Promise.all([
      getFundingRates(binanceSymbol),
      getOpenInterest(binanceSymbol),
    ]);

    if (funding) binanceHits++;

    addReading(history, asset, {
      volume,
      price: priceData?.price || 0,
      fundingRate: funding?.[0]?.rate ?? null,
      oi: oi?.oi ?? null,
    });

    if (!priceData && !funding) continue;

    const readings = history.readings[asset] || [];
    if (readings.length < MIN_HISTORY) continue;

    const apd = computeAPD(asset, funding, oi, volume, price24hChange, history);
    const signal = apdToSignal(asset, apd);
    if (signal) signals.push(signal);

    await new Promise(r => setTimeout(r, 100));
  }

  saveHistory(history);

  const maxDepth = Object.values(history.readings).reduce(
    (max, r) => Math.max(max, r.length), 0
  );

  return {
    signals,
    assets_scanned: assetsScanned,
    binance_hits: binanceHits,
    history_depth: maxDepth,
    warming_up: maxDepth < MIN_HISTORY,
  };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('apd-signal.js')) {
  console.log('[APD] Running standalone...');
  generateAPDSignals().then(result => {
    console.log(`[APD] Scanned ${result.assets_scanned} assets, ${result.binance_hits} Binance responses`);
    console.log(`[APD] History depth: ${result.history_depth} readings`);
    if (result.warming_up) {
      console.log(`[APD] WARMING UP — need ${MIN_HISTORY} readings before signals fire (run ${MIN_HISTORY - result.history_depth} more times)`);
    }
    console.log(`[APD] Generated ${result.signals.length} signals:`);
    for (const s of result.signals) {
      console.log(`  ${s.asset} ${s.direction} (${s.strength}) — ${s.reasoning}`);
    }
  }).catch(e => console.error('[APD] Error:', e));
}
