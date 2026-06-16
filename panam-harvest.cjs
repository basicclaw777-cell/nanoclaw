// panam-harvest.cjs — Phase 1: transcribe the Pandamericano coaching gold.
// Reads KINGSTON2 (PM2 disk context), writes ES→EN transcripts to the vault.
// Filters out tiny ambient demo clips (calibrated 2026-06-15: speech lives in
// the longer session clips; <45s clips are silent drills). Zero cloud cost.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// reusable: node panam-harvest.cjs "<source folder>" <camp-name>  (defaults = pandamericano)
const BASE = process.argv[2] || '/Volumes/KINGSTON2/external drives/dark blue imation/pandamericano training';
const NAME = process.argv[3] || 'panamericano';
const OUT  = path.join(process.env.HOME, 'cathedral-vault', '00_Staging', NAME);
const TMP  = path.join(process.env.HOME, 'nanoclaw', 'panam-tmp');
const WHISPER = '/opt/homebrew/bin/whisper-cli';
const MODEL   = path.join(process.env.HOME, 'Cathedral/models/ggml-medium.bin');
const MIN_DUR = 45; // seconds — below this = silent demo, skip
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

const sh = (cmd, t = 1800000) => execSync(cmd, { encoding: 'utf8', timeout: t });
const log = (m) => console.log(`[${new Date().toISOString().slice(11,19)}] ${m}`);

// enumerate video clips (exclude AppleDouble ._ files)
const list = sh(`find "${BASE}" -type f -iname "*.MOV" ! -name "._*" 2>/dev/null | sort`).trim().split('\n').filter(Boolean);
log(`found ${list.length} clips`);

const manifestPath = path.join(OUT, '_manifest.json');
let manifest = {};
try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch (_) {}

let done = 0, skipped = 0, gold = 0;
for (const src of list) {
  const rel = src.slice(BASE.length + 1);            // e.g. day1/MVI_2230.MOV
  const day = (rel.split('/')[0] || 'root').replace(/[^a-z0-9]+/gi, '_');
  const base = path.basename(rel).replace(/\.MOV$/i, '');
  const dayDir = path.join(OUT, day);
  fs.mkdirSync(dayDir, { recursive: true });
  const of = path.join(dayDir, base);

  if (manifest[rel] === 'done' || fs.existsSync(of + '.es.txt')) { done++; continue; } // resume-safe

  let dur = 0;
  try { dur = parseFloat(sh(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${src}" 2>/dev/null`).trim()) || 0; } catch (_) {}
  if (dur && dur < MIN_DUR) { manifest[rel] = 'skip-short'; skipped++; continue; }

  const wav = path.join(TMP, base + '.wav');
  try {
    sh(`ffmpeg -y -i "${src}" -ar 16000 -ac 1 "${wav}" 2>/dev/null`);
    // transcribe in the ORIGINAL Spanish (no -tr) — faithful Cuban coaching words.
    // English translation + structuring happens in Phase 2 (panam-structure.cjs).
    sh(`"${WHISPER}" -m "${MODEL}" -l es -otxt -of "${of}.es" -f "${wav}" 2>/dev/null`);
    const txt = fs.existsSync(of + '.es.txt') ? fs.readFileSync(of + '.es.txt', 'utf8').trim() : '';
    manifest[rel] = txt.length > 40 ? 'done' : 'done-thin'; // thin = little speech
    if (txt.length > 40) gold++;
    done++;
    log(`✓ ${rel} (${Math.round(dur)}s → ${txt.length} chars)`);
  } catch (e) {
    manifest[rel] = 'err:' + (e.message || '').slice(0, 60);
    log(`✗ ${rel}: ${(e.stderr || e.message || '').slice(0,80)}`);
  } finally {
    try { fs.unlinkSync(wav); } catch (_) {}
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }
}
log(`PHASE 1 COMPLETE — transcribed:${done} gold:${gold} skipped-short:${skipped}`);
