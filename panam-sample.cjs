// Calibration sampler (SI-12) — confirm there's coaching speech + the language,
// BEFORE building the full 193-clip harvest. Runs under PM2 (disk access).
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASE = '/Volumes/KINGSTON2/external drives/dark blue imation/pandamericano training';
const OUT = path.join(process.env.HOME, 'nanoclaw', 'panam-sample');
const WHISPER = '/opt/homebrew/bin/whisper-cli';
const MODEL = path.join(process.env.HOME, 'Cathedral/models/ggml-medium.bin');
fs.mkdirSync(OUT, { recursive: true });

const run = (cmd) => execSync(cmd, { encoding: 'utf8', timeout: 900000 });

const samples = [
  'day1/MVI_2230.MOV',   // 725M — likely a full coaching session
  'day7/MVI_2422.MOV',   // 50M  — likely a short drill demo
];

for (const rel of samples) {
  const src = path.join(BASE, rel);
  const tag = rel.replace(/[\/ ]/g, '_').replace(/\.MOV$/i, '');
  const wav = path.join(OUT, tag + '.wav');
  const of = path.join(OUT, tag);
  console.log('\n=== ' + rel + ' ===');
  try {
    // duration of the source
    const dur = run(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${src}" 2>/dev/null`).trim();
    console.log('clip duration (s): ' + dur);
    // first 5 min of audio → 16k mono wav
    run(`ffmpeg -y -ss 0 -t 300 -i "${src}" -ar 16000 -ac 1 "${wav}" 2>/dev/null`);
    // transcribe Spanish, translate to English
    run(`"${WHISPER}" -m "${MODEL}" -l es -tr -otxt -of "${of}" -f "${wav}" 2>/dev/null`);
    const txt = fs.readFileSync(of + '.txt', 'utf8').trim();
    console.log('--- TRANSCRIPT (first 5 min, ES→EN) ---');
    console.log(txt.slice(0, 3000) || '[empty — no speech detected]');
    try { fs.unlinkSync(wav); } catch (_) {}
  } catch (e) { console.log('[err] ' + (e.stderr || e.message)); }
}
console.log('\n=== SAMPLE DONE ===');
