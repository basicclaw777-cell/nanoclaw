import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CALIBRATION_PATH = path.join(__dirname, 'calibration.json');
const ESTIMATES_PATH = path.join(__dirname, 'estimates.json');

function loadCalibration() {
  if (!fs.existsSync(CALIBRATION_PATH)) return { records: [], summary: {} };
  return JSON.parse(fs.readFileSync(CALIBRATION_PATH, 'utf8'));
}

function saveCalibration(data) {
  fs.writeFileSync(CALIBRATION_PATH, JSON.stringify(data, null, 2));
}

function loadEstimates() {
  if (!fs.existsSync(ESTIMATES_PATH)) return {};
  return JSON.parse(fs.readFileSync(ESTIMATES_PATH, 'utf8'));
}

function reconstructEstimate(position) {
  const estimates = loadEstimates();
  const stored = estimates[position.marketId];
  if (stored?.ourEstimate != null) return stored.ourEstimate;

  if (position.side === 'YES') {
    return position.sharePrice + position.edge;
  } else {
    return (1 - position.sharePrice) - position.edge;
  }
}

export function recordCalibration(position) {
  const data = loadCalibration();

  const pYes = reconstructEstimate(position);
  const actualYes = (position.side === 'YES' && position.status === 'won') ||
                    (position.side === 'NO' && position.status === 'lost')
                    ? 1.0 : 0.0;

  const brierContrib = Math.pow(pYes - actualYes, 2);

  const record = {
    positionId: position.id,
    marketId: position.marketId,
    question: position.question,
    side: position.side,
    forecast: Math.round(pYes * 1000) / 1000,
    actual: actualYes,
    brier: Math.round(brierContrib * 1000) / 1000,
    confidence: position.confidence,
    edge: position.edge,
    closedAt: position.closedAt,
  };

  data.records.push(record);
  data.summary = computeSummary(data.records);
  saveCalibration(data);

  console.log(`[CALIBRATION] Recorded: forecast=${record.forecast} actual=${record.actual} brier=${record.brier} | ${position.question.slice(0, 50)}`);
  return record;
}

function computeSummary(records) {
  if (!records.length) return { count: 0, brierScore: null };

  const totalBrier = records.reduce((s, r) => s + r.brier, 0);
  const brierScore = Math.round((totalBrier / records.length) * 1000) / 1000;

  const bins = calibrationBins(records);

  const recent10 = records.slice(-10);
  const recentBrier = recent10.length >= 3
    ? Math.round((recent10.reduce((s, r) => s + r.brier, 0) / recent10.length) * 1000) / 1000
    : null;

  let driftAlert = null;
  if (recentBrier !== null && records.length >= 10) {
    const older = records.slice(0, -10);
    const olderBrier = older.reduce((s, r) => s + r.brier, 0) / older.length;
    const delta = recentBrier - olderBrier;
    if (delta > 0.1) {
      driftAlert = `DEGRADING: recent Brier ${recentBrier} vs historical ${Math.round(olderBrier * 1000) / 1000} (+${Math.round(delta * 1000) / 1000})`;
    }
  }

  return {
    count: records.length,
    brierScore,
    recentBrier,
    driftAlert,
    bins,
    lastUpdated: new Date().toISOString(),
  };
}

function calibrationBins(records) {
  const bins = {};
  for (let lo = 0; lo < 100; lo += 10) {
    const hi = lo + 10;
    const label = `${lo}-${hi}%`;
    const inBin = records.filter(r => {
      const pct = r.forecast * 100;
      return pct >= lo && pct < hi;
    });
    if (inBin.length === 0) continue;
    const actualRate = inBin.reduce((s, r) => s + r.actual, 0) / inBin.length;
    bins[label] = {
      count: inBin.length,
      expectedMid: (lo + hi) / 2 / 100,
      actualRate: Math.round(actualRate * 1000) / 1000,
      gap: Math.round(Math.abs(actualRate - (lo + hi) / 2 / 100) * 1000) / 1000,
    };
  }
  return bins;
}

export function getCalibrationReport() {
  const data = loadCalibration();
  if (!data.records.length) return { message: 'No resolved positions yet.' };

  const summary = computeSummary(data.records);
  return {
    ...summary,
    records: data.records,
    interpretation: interpretBrier(summary.brierScore),
  };
}

function interpretBrier(score) {
  if (score === null) return 'insufficient data';
  if (score < 0.1) return 'excellent — well-calibrated';
  if (score < 0.2) return 'good — minor calibration issues';
  if (score < 0.3) return 'fair — systematic bias likely';
  return 'poor — researcher needs recalibration';
}

export function checkCalibrationHealth() {
  const data = loadCalibration();
  const summary = computeSummary(data.records);
  return {
    healthy: !summary.driftAlert,
    brierScore: summary.brierScore,
    count: summary.count,
    alert: summary.driftAlert,
  };
}

// CLI
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const report = getCalibrationReport();
  if (report.message) {
    console.log(report.message);
  } else {
    console.log(`\n=== POLYMARKET CALIBRATION ===`);
    console.log(`Resolved: ${report.count} | Brier Score: ${report.brierScore} (${report.interpretation})`);
    if (report.recentBrier !== null) console.log(`Recent (last 10): ${report.recentBrier}`);
    if (report.driftAlert) console.log(`⚠ ${report.driftAlert}`);
    if (Object.keys(report.bins).length) {
      console.log(`\nCalibration Bins:`);
      for (const [label, bin] of Object.entries(report.bins)) {
        const gap = bin.gap > 0.15 ? ' ← MISCALIBRATED' : '';
        console.log(`  ${label.padEnd(8)} n=${bin.count} expected=${(bin.expectedMid * 100).toFixed(0)}% actual=${(bin.actualRate * 100).toFixed(0)}%${gap}`);
      }
    }
    console.log(`\nRecent Records:`);
    for (const r of report.records.slice(-10)) {
      const icon = r.brier < 0.1 ? '✓' : r.brier > 0.5 ? '✗' : '~';
      console.log(`  ${icon} forecast=${(r.forecast * 100).toFixed(0)}% actual=${r.actual === 1 ? 'YES' : 'NO'} brier=${r.brier} | ${r.question.slice(0, 50)}`);
    }
  }
}
