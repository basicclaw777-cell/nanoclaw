// panam-audio.cjs — Spanish audio of the camp, per day, in a Cuban voice.
// edge-tts (free, neural). Run from a networked shell (NOT PM2 — SI-25 DNS).
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SLUG = process.argv[2] || 'pandamericano';
const STAGE_NAME = SLUG === 'pandamericano' ? 'panamericano' : SLUG;
const STAGE = path.join(process.env.HOME, 'cathedral-vault', '00_Staging', STAGE_NAME);
const OUT = path.join(process.env.HOME, 'cathedral-vault', '09_Artifacts', 'audio', SLUG);
const EDGE = path.join(process.env.HOME, 'Library', 'Python', '3.9', 'bin', 'edge-tts');
// node panam-audio.cjs <slug> <lang>   lang = es (Cuban Spanish) | en (English)
const LANG = (process.argv[3] || 'es').toLowerCase();
const VOICE = LANG === 'en' ? 'en-US-GuyNeural' : 'es-CU-ManuelNeural';
const SUFFIX = LANG === 'en' ? '.en' : ''; // english → <day>.en.mp3 ; spanish keeps <day>.mp3
const TMP = path.join(process.env.HOME, 'nanoclaw', 'panam-audio-tmp.txt');
fs.mkdirSync(OUT, { recursive: true });

function load() {
  const out = [];
  for (const day of fs.readdirSync(STAGE)) {
    const dir = path.join(STAGE, day);
    let st; try { st = fs.statSync(dir); } catch { continue; }
    if (!st.isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.struct.json')) continue;
      try {
        const s = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        const sp = (s._spanish || '').replace(/\n+/g, ' ').trim();
        const en = (s.english || '').replace(/\n+/g, ' ').trim();
        const text = LANG === 'en' ? en : sp;
        if (s.thin || text.length < 80) continue;
        const rawDay = /^MVI_\d+/.test(day) ? 'main-sessions' : day;
        out.push({ day: rawDay, clip: f.replace('.struct.json', ''), text });
      } catch (_) {}
    }
  }
  return out;
}

const items = load();
const dayNum = (d) => parseInt((d.match(/\d+/) || [999])[0]);
const days = [...new Set(items.map(i => i.day))].sort((a, b) => dayNum(a) - dayNum(b));

for (const day of days) {
  const text = items.filter(i => i.day === day).sort((a, b) => a.clip.localeCompare(b.clip))
    .map(i => i.text).join('\n\n');
  if (!text.trim()) continue;
  fs.writeFileSync(TMP, text);
  const mp3 = path.join(OUT, `${day.replace(/[^a-z0-9]+/gi, '_')}${SUFFIX}.mp3`);
  try {
    execSync(`"${EDGE}" --voice ${VOICE} --file "${TMP}" --write-media "${mp3}"`, { timeout: 300000, stdio: 'pipe' });
    const kb = Math.round(fs.statSync(mp3).size / 1024);
    console.log(`✓ ${day} → ${path.basename(mp3)} (${kb} KB, ${text.length} chars)`);
  } catch (e) { console.log(`✗ ${day}: ${(e.stderr || e.message || '').toString().slice(0, 120)}`); }
}
try { fs.unlinkSync(TMP); } catch (_) {}
console.log('AUDIO DONE → ' + OUT);
