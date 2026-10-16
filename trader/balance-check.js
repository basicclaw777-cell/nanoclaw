#!/usr/bin/env node
/**
 * balance-check.js — "Am I falling over after throwing one punch?"
 *
 * Every punch sacrifices balance. Good coaches constantly watch it.
 * 8 correlated shorts = one punch knocking us over.
 *
 * Checks:
 *   1. Direction balance — what % of book is long vs short?
 *   2. Asset concentration — too much exposure to one coin?
 *   3. Correlation risk — are all positions moving together?
 *   4. Strategy concentration — all eggs in one strategy basket?
 *
 * Output: { balanced, score, blocks[], adjustments }
 * Blocks prevent specific new entries that would worsen imbalance.
 *
 * ESM.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'logs', 'trades.db');
const BALANCE_PATH = path.join(__dirname, 'balance-state.json');

// Correlation groups — assets that move together
const CORRELATION_GROUPS = {
  major: ['BTC', 'ETH'],
  alt_l1: ['SOL', 'AVAX', 'ADA', 'ATOM', 'DOT'],
  defi: ['LINK', 'UNI', 'ARB'],
  meme: ['DOGE'],
};

function getAssetGroup(asset) {
  for (const [group, assets] of Object.entries(CORRELATION_GROUPS)) {
    if (assets.includes(asset)) return group;
  }
  return 'other';
}

function getDb() {
  return new Database(DB_PATH, { readonly: true });
}

/**
 * Analyze current portfolio balance.
 */
export function checkBalance() {
  const db = getDb();
  const open = db.prepare(`SELECT * FROM cyclical_trades WHERE status = 'open'`).all();
  db.close();

  if (open.length === 0) {
    return {
      balanced: true,
      score: 100,
      positions: 0,
      blocks: [],
      analysis: { direction: 'empty', asset: 'empty', correlation: 'empty', strategy: 'empty' },
    };
  }

  const blocks = [];
  let score = 100; // start perfect, deduct for imbalances

  // ── 1. Direction balance ──
  const longs = open.filter(p => p.direction === 'long');
  const shorts = open.filter(p => p.direction === 'short');
  const totalSize = open.reduce((s, p) => s + p.position_size, 0);
  const longSize = longs.reduce((s, p) => s + p.position_size, 0);
  const shortSize = shorts.reduce((s, p) => s + p.position_size, 0);

  const longPct = totalSize > 0 ? longSize / totalSize : 0;
  const shortPct = totalSize > 0 ? shortSize / totalSize : 0;
  const directionImbalance = Math.abs(longPct - shortPct);

  let directionStatus;
  if (directionImbalance > 0.8) {
    // >90% one direction
    score -= 30;
    const dominant = longPct > shortPct ? 'long' : 'short';
    blocks.push({
      type: 'direction',
      block: dominant,
      reason: `${(Math.max(longPct, shortPct) * 100).toFixed(0)}% of book is ${dominant} — block new ${dominant}s`,
    });
    directionStatus = `CRITICAL: ${(Math.max(longPct, shortPct) * 100).toFixed(0)}% ${dominant}`;
  } else if (directionImbalance > 0.5) {
    score -= 15;
    const dominant = longPct > shortPct ? 'long' : 'short';
    directionStatus = `TILTED: ${(Math.max(longPct, shortPct) * 100).toFixed(0)}% ${dominant}`;
  } else {
    directionStatus = `OK: ${(longPct * 100).toFixed(0)}%L / ${(shortPct * 100).toFixed(0)}%S`;
  }

  // ── 2. Asset concentration ──
  const assetExposure = {};
  for (const p of open) {
    assetExposure[p.asset] = (assetExposure[p.asset] || 0) + p.position_size;
  }

  let assetStatus = 'OK';
  for (const [asset, exposure] of Object.entries(assetExposure)) {
    const pct = exposure / totalSize;
    if (pct > 0.5) {
      score -= 20;
      blocks.push({
        type: 'asset',
        block: asset,
        reason: `${asset} is ${(pct * 100).toFixed(0)}% of book — block new ${asset} entries`,
      });
      assetStatus = `CONCENTRATED: ${asset} at ${(pct * 100).toFixed(0)}%`;
    } else if (pct > 0.35) {
      score -= 10;
      assetStatus = `HEAVY: ${asset} at ${(pct * 100).toFixed(0)}%`;
    }
  }

  // ── 3. Correlation risk ──
  const groupExposure = {};
  for (const p of open) {
    const group = getAssetGroup(p.asset);
    if (!groupExposure[group]) groupExposure[group] = { long: 0, short: 0, total: 0 };
    groupExposure[group][p.direction] += p.position_size;
    groupExposure[group].total += p.position_size;
  }

  let correlationStatus = 'OK';
  for (const [group, exp] of Object.entries(groupExposure)) {
    const pct = exp.total / totalSize;
    if (pct > 0.6 && Object.keys(groupExposure).length > 1) {
      score -= 15;
      const assets = CORRELATION_GROUPS[group] || [group];
      correlationStatus = `CORRELATED: ${group} group (${assets.join('/')}) is ${(pct * 100).toFixed(0)}% of book`;

      // Block new entries in same group + same direction
      const dominantDir = exp.long > exp.short ? 'long' : 'short';
      blocks.push({
        type: 'correlation',
        block_group: group,
        block_direction: dominantDir,
        reason: `${group} group ${(pct * 100).toFixed(0)}% of book, all ${dominantDir} — block more ${dominantDir} in ${assets.join('/')}`,
      });
    }
  }

  // ── 4. Strategy concentration ──
  const stratExposure = {};
  for (const p of open) {
    stratExposure[p.strategy] = (stratExposure[p.strategy] || 0) + 1;
  }

  let stratStatus = 'OK';
  const maxStratCount = Math.max(...Object.values(stratExposure));
  if (maxStratCount > open.length * 0.5 && open.length >= 4) {
    const dominantStrat = Object.entries(stratExposure).find(([, v]) => v === maxStratCount)[0];
    score -= 10;
    stratStatus = `CONCENTRATED: ${dominantStrat} has ${maxStratCount}/${open.length} positions`;
  }

  // Overall
  const balanced = score >= 60;

  const result = {
    balanced,
    score: Math.max(0, score),
    positions: open.length,
    long_count: longs.length,
    short_count: shorts.length,
    long_pct: +(longPct * 100).toFixed(1),
    short_pct: +(shortPct * 100).toFixed(1),
    blocks,
    analysis: {
      direction: directionStatus,
      asset: assetStatus,
      correlation: correlationStatus,
      strategy: stratStatus,
    },
    asset_exposure: Object.fromEntries(
      Object.entries(assetExposure).map(([k, v]) => [k, +((v / totalSize) * 100).toFixed(1)])
    ),
    group_exposure: Object.fromEntries(
      Object.entries(groupExposure).map(([k, v]) => [k, +((v.total / totalSize) * 100).toFixed(1)])
    ),
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(BALANCE_PATH, JSON.stringify(result, null, 2));
  return result;
}

/**
 * Check if a specific signal is blocked by balance constraints.
 */
export function isBlocked(signal, balanceState) {
  if (!balanceState || !balanceState.blocks || balanceState.blocks.length === 0) return false;

  for (const block of balanceState.blocks) {
    // Direction block
    if (block.type === 'direction' && signal.direction === block.block) {
      return block.reason;
    }

    // Asset block
    if (block.type === 'asset' && signal.asset === block.block) {
      return block.reason;
    }

    // Correlation group block
    if (block.type === 'correlation') {
      const signalGroup = getAssetGroup(signal.asset);
      if (signalGroup === block.block_group && signal.direction === block.block_direction) {
        return block.reason;
      }
    }
  }

  return false;
}

// ── Standalone run ──
if (process.argv[1] && process.argv[1].includes('balance-check')) {
  console.log('\n============================================================');
  console.log(`[BALANCE CHECK] Portfolio balance — ${new Date().toISOString()}`);
  console.log('============================================================\n');

  const result = checkBalance();

  console.log(`Score: ${result.score}/100 ${result.balanced ? '' : '— UNBALANCED'}`);
  console.log(`Positions: ${result.positions} (${result.long_count}L / ${result.short_count}S)`);
  console.log(`Direction: ${result.long_pct}% long / ${result.short_pct}% short`);
  console.log('');

  console.log('Analysis:');
  for (const [check, status] of Object.entries(result.analysis)) {
    console.log(`  ${check.padEnd(14)} ${status}`);
  }

  if (result.blocks.length > 0) {
    console.log('\nBlocks:');
    for (const b of result.blocks) {
      console.log(`  BLOCKED: ${b.reason}`);
    }
  }

  if (Object.keys(result.asset_exposure).length > 0) {
    console.log('\nAsset exposure:');
    for (const [asset, pct] of Object.entries(result.asset_exposure)) {
      const bar = '█'.repeat(Math.round(pct / 5));
      console.log(`  ${asset.padEnd(5)} ${bar} ${pct}%`);
    }
  }
}
