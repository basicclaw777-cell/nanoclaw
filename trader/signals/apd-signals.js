#!/usr/bin/env node
/**
 * apd-signals.js — Attention-Positioning Divergence signal generator
 *
 * Measures divergence between narrative propagation (attention/volume)
 * and positioning (funding rates, open interest) to detect:
 *   - Attention rising + positioning not yet crowded → long entry
 *   - Attention falling + positioning still crowded → short entry
 *
 * Data sources (all free, no auth):
 *   - Binance Futures: funding rates, open interest
 *   - Binance Futures: 4h klines for volume/price history
 *
 * Output: JSON array of signals matching crypto-signals format
 * Run: node trader/signals/apd-signals.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, 'apd-signals-latest.json');

// ── Asset mapping ──

const WATCHLIST = {
  BTC: { binance: 'BTCUSDT', coingecko: 'bitcoin' },
  ETH: { binance: 'ETHUSDT', coingecko: 'ethereum' },
  SOL: { binance: 'SOLUSDT', coingecko: 'solana' },
  AVAX: { binance: 'AVAXUSDT', coingecko: 'avalanche-2' },
  LINK: { binance: 'LINKUSDT', coingecko: 'chainlink' },
  DOT: { binance: 'DOTUSDT', coingecko: 'polkadot' },
  ARB: { binance: 'ARBUSDT', coingecko: 'arbitrum' },
  DOGE: { binance: 'DOGEUSDT', coingecko: 'dogecoin' },
  ADA: { binance: 'ADAUSDT', coingecko: 'cardano' },
  ATOM: { binance: 'ATOMUSDT', coingecko: 'cosmos' },
  UNI: { binance: 'UNIUSDT', coingecko: 'uniswap' },
};

// ── Thresholds ──

const FUNDING_LOOKBACK = 90;       // ~30 days of 8h funding periods
const VOLUME_LOOKBACK_DAYS = 14;
const ATTENTION_Z_ENTRY = 1.0;     // volume z-score threshold for entry
const FUNDING_CROWDED_PCT = 80;    // percentile — above this = crowded long
const FUNDING_EXTREME_PCT = 95;    // exit threshold
const OI_SPIKE_PCT = 0.20;         // 20% OI change in 24h = crowded
const MIN_SIGNAL_STRENGTH = 0.5;

// ── Fetch helpers ──

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

async function getFundingHistory(symbol, limit = FUNDING_LOOKBACK) {
  const data = await fetchJSON(
    `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=${limit}`
  );
  return data.map(d => ({
    time: d.fundingTime,
    rate: parseFloat(d.fundingRate),
  }));
}

async function getOpenInterest(symbol) {
  const data = await fetchJSON(
    `https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`
  );
  return { oi: parseFloat(data.openInterest), time: data.time };
}

async function getOIHistory(symbol) {
  // Binance kline OI via futures endpoint — use 1d klines for OI trend
  const data = await fetchJSON(
    `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1d&limit=7`
  );
  // Kline format: [openTime, o, h, l, c, volume, closeTime, quoteVol, trades, ...]
  return data.map(k => ({
    time: k[0],
    volume: parseFloat(k[5]),
    quoteVolume: parseFloat(k[7]),
    trades: parseInt(k[8]),
  }));
}

async function getBinanceVolumeAndPrice(symbol) {
  // 4h klines for volume history — 84 candles = 14 days
  const data = await fetchJSON(
    `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=4h&limit=84`
  );
  return {
    volumes: data.map(k => ({ time: k[0], volume: parseFloat(k[7]) })), // quoteAssetVolume in USD
    prices: data.map(k => ({ time: k[0], price: parseFloat(k[4]) })),   // close price
  };
}

// ── Statistics ──

function mean(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }
function std(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}
function zScore(value, arr) {
  const s = std(arr);
  return s === 0 ? 0 : (value - mean(arr)) / s;
}
function percentile(value, arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const below = sorted.filter(v => v < value).length;
  return (below / sorted.length) * 100;
}

// ── Signal generation per asset ──

async function analyzeAsset(ticker, config) {
  const { binance, coingecko } = config;

  // Fetch all data in parallel — Binance only, no CoinGecko rate limits
  const [fundingHistory, currentOI, klineHistory, volData] = await Promise.all([
    getFundingHistory(binance),
    getOpenInterest(binance),
    getOIHistory(binance),
    getBinanceVolumeAndPrice(binance),
  ]);

  if (!fundingHistory.length || !volData.volumes.length) return null;

  // ── Funding rate analysis ──
  const rates = fundingHistory.map(f => f.rate);
  const currentRate = rates[rates.length - 1];
  const fundingZScore = zScore(currentRate, rates);
  const fundingPercentile = percentile(currentRate, rates);

  // ── Volume/attention analysis (4h candles from Binance) ──
  const vols = volData.volumes.map(v => v.volume);
  // Recent 24h (6 candles) vs 14d history
  const recentVols = vols.slice(-6);
  const recentAvgVol = mean(recentVols);
  const historicalVols = vols.slice(0, -6);
  const volumeZScore = historicalVols.length > 2 ? zScore(recentAvgVol, historicalVols) : 0;

  // Volume trend: compare last 48h (12 candles) vs prior 48h
  const last48 = vols.slice(-12);
  const prior48 = vols.slice(-24, -12);
  const volumeAcceleration = prior48.length ? (mean(last48) - mean(prior48)) / (mean(prior48) || 1) : 0;

  // ── Open Interest analysis ──
  const klineVols = klineHistory.map(k => k.quoteVolume);
  const oiTrend = klineVols.length >= 2
    ? (klineVols[klineVols.length - 1] - klineVols[0]) / (klineVols[0] || 1)
    : 0;

  // ── Generate signal ──
  let direction = null;
  let strength = 0;
  const reasoning = [];

  // LONG: attention rising + positioning not crowded
  if (volumeZScore > ATTENTION_Z_ENTRY && volumeAcceleration > 0) {
    if (fundingPercentile < FUNDING_CROWDED_PCT) {
      direction = 'long';
      // Strength: volume z-score × (1 - funding crowdedness)
      strength = Math.min(1, (volumeZScore / 3) * (1 - fundingPercentile / 100));
      reasoning.push(`Volume z=${volumeZScore.toFixed(2)} (accelerating ${(volumeAcceleration * 100).toFixed(1)}%)`);
      reasoning.push(`Funding rate at ${fundingPercentile.toFixed(0)}th percentile — not crowded`);
      reasoning.push('Narrative propagating, crowd not yet all-in');
    }
  }

  // SHORT: attention falling + positioning still crowded
  if (!direction && volumeZScore < -ATTENTION_Z_ENTRY && volumeAcceleration < 0) {
    if (fundingPercentile > FUNDING_CROWDED_PCT) {
      direction = 'short';
      strength = Math.min(1, (Math.abs(volumeZScore) / 3) * (fundingPercentile / 100));
      reasoning.push(`Volume z=${volumeZScore.toFixed(2)} (decelerating ${(volumeAcceleration * 100).toFixed(1)}%)`);
      reasoning.push(`Funding rate at ${fundingPercentile.toFixed(0)}th percentile — crowd still long`);
      reasoning.push('Narrative exhausting, crowd exposed');
    }
  }

  // LONG: extreme negative funding (crowd short, contrarian)
  if (!direction && fundingPercentile < 5 && volumeAcceleration > 0) {
    direction = 'long';
    strength = 0.6;
    reasoning.push(`Extreme negative funding (${fundingPercentile.toFixed(0)}th pct) — crowd short`);
    reasoning.push(`Volume accelerating — contrarian long`);
  }

  if (!direction || strength < MIN_SIGNAL_STRENGTH) return null;

  const currentPrice = volData.prices.length
    ? volData.prices[volData.prices.length - 1].price
    : null;

  return {
    asset: ticker,
    direction,
    strategy: 'apd',
    strength: Math.round(strength * 100) / 100,
    price: currentPrice,
    reasoning: reasoning.join('. '),
    metrics: {
      volume_z_score: Math.round(volumeZScore * 1000) / 1000,
      volume_acceleration_pct: Math.round(volumeAcceleration * 1000) / 10,
      funding_rate: currentRate,
      funding_z_score: Math.round(fundingZScore * 1000) / 1000,
      funding_percentile: Math.round(fundingPercentile * 10) / 10,
      oi_trend_pct: Math.round(oiTrend * 1000) / 10,
    },
  };
}

// ── Main ──

async function run() {
  console.log('[APD] Scanning watchlist for attention-positioning divergence...');
  const signals = [];
  const errors = [];

  // Process assets with small delays to avoid rate limits
  const tickers = Object.entries(WATCHLIST);
  for (const [ticker, config] of tickers) {
    try {
      const signal = await analyzeAsset(ticker, config);
      if (signal) {
        signals.push(signal);
        console.log(`  ${signal.direction.toUpperCase()} ${ticker} | str=${signal.strength} | vol_z=${signal.metrics.volume_z_score} | fr_pct=${signal.metrics.funding_percentile}`);
      } else {
        console.log(`  ${ticker}: no signal`);
      }
    } catch (e) {
      errors.push({ asset: ticker, error: e.message });
      console.error(`  ${ticker}: ERROR — ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 200));
  }

  const output = {
    generated_at: new Date().toISOString(),
    strategy: 'apd',
    signal_count: signals.length,
    signals,
    errors,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n[APD] ${signals.length} signals generated, ${errors.length} errors`);
  console.log(`[APD] Written to ${OUT_PATH}`);

  return output;
}

// Export for orchestrator consumption
export { run as generateAPDSignals };

// CLI execution
if (process.argv[1] && process.argv[1].endsWith('apd-signals.js')) {
  run().catch(e => { console.error('[APD] Fatal:', e.message); process.exit(1); });
}
