/**
 * historical-loader.js — Download and parse Kyoto WDC Dst historical data
 *
 * Source: WDC for Geomagnetism, Kyoto University
 * Format: Fixed-width, one row per day, 24 hourly values + daily mean
 * Available: provisional data from 1957, final through ~2020
 *
 * Also fetches NOAA SWPC historical solar wind for backtesting.
 *
 * ESM.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'historical');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

/**
 * Download Dst data for a specific year+month from Kyoto WDC.
 * Returns array of { time: ISO string, dst: number }
 */
async function fetchDstMonth(year, month) {
  const yy = String(year).slice(2);
  const mm = String(month).padStart(2, '0');

  // Try provisional first (more recent), then final
  const urls = [
    `https://wdc.kugi.kyoto-u.ac.jp/dst_provisional/${year}${mm}/dst${yy}${mm}.for.request`,
    `https://wdc.kugi.kyoto-u.ac.jp/dst_final/${year}${mm}/dst${yy}${mm}.for.request`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      const text = await res.text();
      if (text.includes('<!DOCTYPE') || text.length < 100) continue;
      return parseDstFile(text, year, month);
    } catch { continue; }
  }

  console.error(`[historical] No Dst data for ${year}-${mm}`);
  return [];
}

/**
 * Parse Kyoto WDC fixed-width Dst format.
 * Format: DST{YYMM}*{DD}{TYPE}{BASE}{SCALE} {24 hourly values} {daily mean}
 * Each value is 4 chars wide, hourly Dst in nT.
 */
function parseDstFile(text, year, month) {
  const records = [];
  const lines = text.split('\n').filter(l => l.startsWith('DST'));

  for (const line of lines) {
    // Day is chars 8-9 (0-indexed: positions 8-9 after DST prefix)
    const dayStr = line.slice(8, 10).trim();
    const day = parseInt(dayStr);
    if (isNaN(day) || day < 1 || day > 31) continue;

    // 24 hourly values start at position 20, each 4 chars wide
    // But actual position depends on format. Let me parse more carefully.
    // Format: DST2405*10PPX120   0  12  10  12 ...
    // Positions: 0-2=DST, 3-6=YYMM, 7=*, 8-9=DD, 10-12=type, 13=scale indicator
    // Values start after the header portion

    // Find the first number region — skip header
    const valuesStr = line.slice(20); // skip header (20 chars)
    const values = [];

    for (let i = 0; i < 24; i++) {
      const chunk = valuesStr.slice(i * 4, (i + 1) * 4);
      const val = parseInt(chunk);
      if (!isNaN(val)) {
        values.push(val);
      }
    }

    for (let hour = 0; hour < values.length; hour++) {
      const date = new Date(year, month - 1, day, hour);
      records.push({
        time: date.toISOString(),
        dst: values[hour],
      });
    }
  }

  return records.sort((a, b) => new Date(a.time) - new Date(b.time));
}

/**
 * Download a full year of Dst data.
 */
async function fetchDstYear(year) {
  console.log(`[historical] Downloading Dst for ${year}...`);
  let allRecords = [];

  for (let month = 1; month <= 12; month++) {
    const records = await fetchDstMonth(year, month);
    allRecords = allRecords.concat(records);
    if (records.length > 0) {
      process.stdout.write(`  ${year}-${String(month).padStart(2, '0')}: ${records.length} hours\n`);
    }
    // Rate limit
    await new Promise(r => setTimeout(r, 500));
  }

  // Cache to disk
  const outPath = path.join(DATA_DIR, `dst-${year}.json`);
  fs.writeFileSync(outPath, JSON.stringify(allRecords));
  console.log(`  Total: ${allRecords.length} hourly readings → ${outPath}`);

  return allRecords;
}

/**
 * Load cached Dst year (or download if missing).
 */
async function loadDstYear(year) {
  const cachePath = path.join(DATA_DIR, `dst-${year}.json`);
  if (fs.existsSync(cachePath)) {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  }
  return fetchDstYear(year);
}

/**
 * Find all storms in a dataset (Dst below threshold).
 */
function findStorms(records, threshold = -50) {
  const storms = [];
  let inStorm = false;
  let currentStorm = null;

  for (const r of records) {
    if (r.dst <= threshold) {
      if (!inStorm) {
        currentStorm = {
          start: r.time,
          minDst: r.dst,
          minTime: r.time,
          records: [r],
        };
        inStorm = true;
      } else {
        currentStorm.records.push(r);
        if (r.dst < currentStorm.minDst) {
          currentStorm.minDst = r.dst;
          currentStorm.minTime = r.time;
        }
      }
    } else if (inStorm) {
      currentStorm.end = r.time;
      currentStorm.duration = currentStorm.records.length;
      storms.push(currentStorm);
      inStorm = false;
      currentStorm = null;
    }
  }

  if (currentStorm) {
    currentStorm.end = currentStorm.records[currentStorm.records.length - 1].time;
    currentStorm.duration = currentStorm.records.length;
    storms.push(currentStorm);
  }

  return storms.sort((a, b) => a.minDst - b.minDst);
}

// CLI
if (process.argv[1]?.endsWith('historical-loader.js')) {
  const year = parseInt(process.argv[2]) || 2024;
  (async () => {
    const data = await fetchDstYear(year);

    const storms = findStorms(data, -50);
    console.log(`\n--- ${year} Storm Analysis ---`);
    console.log(`Total hours: ${data.length}`);
    console.log(`Storms (Dst < -50nT): ${storms.length}`);
    console.log();

    for (const s of storms.slice(0, 10)) {
      const start = new Date(s.start).toISOString().slice(0, 13);
      const minTime = new Date(s.minTime).toISOString().slice(0, 13);
      console.log(`  ${start} → min ${s.minDst}nT at ${minTime} (${s.duration}h)`);
    }
  })();
}

export { fetchDstMonth, fetchDstYear, loadDstYear, findStorms, parseDstFile };
