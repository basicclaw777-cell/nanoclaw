// panam-camp.cjs — "The Camp, Translated": every translated coaching passage,
// ordered day 1 → 17, bilingual (English to read + Spanish original to hear again).
// Builds a vault doc + a web door page. These are the REAL translated words
// (whisper + DeepSeek on the actual audio), not the review's distillations.
const fs = require('fs');
const path = require('path');

const STAGE = path.join(process.env.HOME, 'cathedral-vault', '00_Staging', 'panamericano');
const MD = path.join(process.env.HOME, 'cathedral-vault', '06_Methods', 'pandamericano-the-camp-translated.md');
const HTML = path.join(process.env.HOME, 'nanoclaw', 'pandamericano-camp.html');
const TXT = path.join(process.env.HOME, 'nanoclaw', 'pandamericano-camp-narration.txt'); // for TTS

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
        const eng = (s.english || '').trim();
        if (s.thin || eng.length < 120) continue; // skip thin/ambient
        const rawDay = /^MVI_\d+/.test(day) ? 'main-sessions' : day;
        out.push({ day: rawDay, clip: f.replace('.struct.json', ''), english: eng, spanish: (s._spanish || '').trim() });
      } catch (_) {}
    }
  }
  return out;
}

const items = load();
const dayNum = (d) => parseInt((d.match(/\d+/) || [999])[0]);
const days = [...new Set(items.map(i => i.day))].sort((a, b) => dayNum(a) - dayNum(b));

// ── vault markdown (bilingual) + plain narration text (English, for TTS) ──
let md = `---\ntitle: "Pandamericano — The Camp, Translated"\ndomain: boxing\ntype: source-narrative\nsource: "All translated coaching passages from the 88GB Cuban camp, day-ordered. Real whisper+DeepSeek translations of the audio."\ndate: 2026-06-15\ntags: [boxing, cuban, pandamericano, camp, translation, narrative, logan]\n---\n\n> The camp you stood inside, now readable end to end. Every substantial coaching passage, ordered day 1 → 17 — English to read, the Spanish original beneath each to hear it again. These are the actual translated words from the audio (faithful, auto-translated), not polished summaries. Companion: [[pandamericano-methodology-framework]] · [[pandamericano-review-and-development]].\n\n`;
let narration = `The Pandamericano Camp, Translated.\n\n`;
let count = 0;
for (const day of days) {
  const clips = items.filter(i => i.day === day).sort((a, b) => a.clip.localeCompare(b.clip));
  md += `## ${day.replace(/_/g, ' ')}\n\n`;
  narration += `\n\n${day.replace(/_/g, ' ')}.\n\n`;
  for (const c of clips) {
    count++;
    md += `${c.english}\n\n`;
    if (c.spanish) md += `> 🇨🇺 *${c.spanish.replace(/\n+/g, ' ').trim()}*\n\n`;
    md += `<small>— ${c.clip}</small>\n\n`;
    narration += c.english + '\n\n';
  }
}
fs.mkdirSync(path.dirname(MD), { recursive: true });
fs.writeFileSync(MD, md);
fs.writeFileSync(TXT, narration);

// ── web door page ──
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pandamericano — The Camp, Translated</title>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<style>
*{box-sizing:border-box}body{font-family:'Inter',-apple-system,system-ui,sans-serif;background:#f6f7fa;color:#1a1d24;margin:0;padding:32px;line-height:1.7}
.wrap{max-width:780px;margin:0 auto;background:#fff;border:1px solid #e4e7ec;border-radius:14px;padding:40px 46px}
.back{display:inline-block;margin-bottom:18px;color:#0e9f6e;text-decoration:none;font-size:13px;font-weight:600}.back:hover{text-decoration:underline}
h1{font-size:25px;font-weight:800;letter-spacing:-.5px}
h2{font-size:18px;font-weight:700;margin:1.8em 0 .5em;color:#0b6e4a;border-top:1px solid #eef0f4;padding-top:.8em;text-transform:capitalize}
p{font-size:15.5px}small{color:#aeb4c2;font-size:11px;font-family:monospace}
blockquote{border-left:3px solid #d9d6f3;margin:6px 0 16px;padding:6px 16px;color:#5b5187;background:#f7f6fc;border-radius:0 8px 8px 0;font-size:14px}
.foot{color:#8a93a6;font-size:11px;font-family:monospace;margin-top:30px;border-top:1px solid #eef0f4;padding-top:12px}
</style></head><body><div class="wrap">
<a class="back" href="/pandamericano">← back to the framework</a>
<h1>🇨🇺 The Camp, Translated</h1>
<div id="content"></div>
<div class="foot">${count} passages · day 1 → 17 · whisper + DeepSeek translation of the original audio · vault: 06_Methods/pandamericano-the-camp-translated.md</div>
</div>
<script>document.getElementById('content').innerHTML = marked.parse(${JSON.stringify(md.replace(/^---[\s\S]*?---\n/, ''))});</script>
</body></html>`;
fs.writeFileSync(HTML, html);
console.log(`WROTE ${MD}`);
console.log(`WROTE ${HTML} (${count} passages, ${days.length} days)`);
console.log(`WROTE ${TXT} (narration text for TTS)`);
