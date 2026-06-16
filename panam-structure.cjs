// panam-structure.cjs — Phase 2: turn Spanish transcripts into the framework.
// Reads .es.txt → hermes3 (local, free) → English translation + extracted gold
// (drills / cues / combinations / principles / methodology) → builds a PRINTABLE
// bilingual markdown doc + a VISUAL HTML/Mermaid framework map (SI-38).
// Re-runnable + incremental: structures only new transcripts, rebuilds aggregates.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// multi-camp: node panam-structure.cjs <camp-name>   (default = panamericano)
const NAME = process.argv[2] || 'panamericano';
const CAMPS = {
  panamericano: { stage: 'panamericano', slug: 'pandamericano', title: 'Pandamericano Methodology Framework', route: '/pandamericano' },
  cuba2014:     { stage: 'cuba2014',     slug: 'cuba2014',     title: 'Cuba 2014 Methodology Framework',     route: '/cuba2014' },
};
const C = CAMPS[NAME] || { stage: NAME, slug: NAME, title: NAME + ' Framework', route: '/' + NAME };
const STAGE = path.join(process.env.HOME, 'cathedral-vault', '00_Staging', C.stage);
const DOC   = path.join(process.env.HOME, 'cathedral-vault', '06_Methods', `${C.slug}-methodology-framework.md`);
const HTML  = path.join(process.env.HOME, 'nanoclaw', `${C.slug}-framework.html`);
const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';
const log = (m) => console.log(`[${new Date().toISOString().slice(11,19)}] ${m}`);

// load .env for DEEPSEEK_API_KEY (higher-quality translation; local fallback)
const envPath = path.join(process.env.HOME, 'nanoclaw', '.env');
if (fs.existsSync(envPath)) for (const line of fs.readFileSync(envPath,'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/); if (m && !process.env[m[1].trim()]) {
    let v = m[2].trim(); if ((v[0]==='"'&&v.slice(-1)==='"')||(v[0]==="'"&&v.slice(-1)==="'")) v=v.slice(1,-1);
    process.env[m[1].trim()] = v;
  }
}
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;

// ── local LLM (hermes3, SI-24), forced JSON ──────────────────────────────────
async function structureOne(spanish) {
  const system = `You extract boxing coaching gold from a Cuban (Pandamericano) training transcript. The text is Spanish, auto-transcribed — expect errors and fragments. Cathedral context: this feeds Coach Paul's transferable training framework (boxing-as-portal). Use ONLY the transcript; invent nothing.`;
  const prompt = `Transcript (Spanish):\n"""${spanish.slice(0, 6000)}"""\n\nReturn JSON ONLY:
{
 "english": "clean English translation of the coaching",
 "drills": ["named or described drills"],
 "cues": ["short live coaching cues, e.g. 'let it go', 'put yourself to the side'"],
 "combinations": ["punch/movement combinations described"],
 "principles": ["technique or methodology principles stated or implied"],
 "methodology": ["structural/teaching notes — how the session is organised"]
}
Empty array where nothing applies. Preserve Cuban boxing terms untranslated where no clean English exists, with a short gloss.`;
  // DeepSeek first (quality), gemma3:4b local fallback (free, sovereign)
  if (DEEPSEEK_KEY) {
    try {
      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
        body: JSON.stringify({ model: 'deepseek-chat', response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
          temperature: 0.2, max_tokens: 1500 })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      const o = JSON.parse(data.choices?.[0]?.message?.content || '{}'); o._engine = 'deepseek'; return o;
    } catch (e) { log('deepseek fail → local: ' + e.message); }
  }
  try {
    const res = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gemma3:4b', format: 'json', stream: false,
        messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
        options: { temperature: 0.2, num_predict: 1500 } })
    });
    const data = await res.json();
    const o = JSON.parse(data.message?.content || '{}'); o._engine = 'gemma3'; return o;
  } catch (e) { return { error: e.message, english: '', drills: [], cues: [], combinations: [], principles: [], methodology: [] }; }
}

function listTranscripts() {
  const out = [];
  if (!fs.existsSync(STAGE)) return out;
  for (const day of fs.readdirSync(STAGE)) {
    const dir = path.join(STAGE, day);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.es.txt')) out.push({ day, clip: f.replace('.es.txt',''), file: path.join(dir, f) });
    }
  }
  return out.sort((a,b) => (a.day+a.clip).localeCompare(b.day+b.clip));
}

// ── Phase 2a: structure each new transcript ──────────────────────────────────
async function structureAll() {
  const items = listTranscripts();
  log(`${items.length} transcripts present`);
  for (const it of items) {
    const structPath = it.file.replace('.es.txt', '.struct.json');
    if (fs.existsSync(structPath)) continue;
    const spanish = fs.readFileSync(it.file, 'utf8').trim();
    if (spanish.length < 40) { fs.writeFileSync(structPath, JSON.stringify({ thin: true })); continue; }
    const s = await structureOne(spanish);
    s._day = it.day; s._clip = it.clip; s._spanish = spanish;
    fs.writeFileSync(structPath, JSON.stringify(s, null, 2));
    log(`structured ${it.day}/${it.clip}`);
  }
}

// ── Phase 2b: aggregate → printable doc + visual ─────────────────────────────
function aggregate() {
  const byDay = {};
  for (const it of listTranscripts()) {
    const sp = it.file.replace('.es.txt', '.struct.json');
    if (!fs.existsSync(sp)) continue;
    let s; try { s = JSON.parse(fs.readFileSync(sp, 'utf8')); } catch { continue; }
    if (s.thin) continue;
    // root-level session clips (MVI_####) aren't in a day folder — bucket them
    const day = /^MVI_\d+/.test(it.day) ? 'main-sessions' : it.day;
    (byDay[day] ||= []).push(s);
  }
  const days = Object.keys(byDay).sort((a,b) => {
    const na = parseInt((a.match(/\d+/)||[999])[0]), nb = parseInt((b.match(/\d+/)||[999])[0]);
    return na - nb;
  });
  const uniq = (arr) => [...new Set(arr.filter(Boolean).map(x => x.trim()))];

  // ── printable markdown ──
  let md = `---\ntitle: "Pandamericano Methodology Framework"\ndomain: boxing\ntype: methodology-framework\nsource: "Cuban Pandamericano training camp video (88GB, days 1-17) — harvested from Spanish coaching audio, ${new Date().toISOString().slice(0,10)}"\ntags: [boxing, cuban, pandamericano, methodology, framework, coaching, logan]\n---\n\n`;
  md += `# Pandamericano Methodology Framework\n\n> Harvested from 88GB of Cuban training-camp video Paul attended — the Spanish coaching he could not follow at the time, now transcribed (original) and translated. Days 1–17.\n\n`;
  const allPrinciples = [], allDrills = [], allCues = [];
  for (const day of days) {
    const clips = byDay[day];
    const drills = uniq(clips.flatMap(c => c.drills || []));
    const cues = uniq(clips.flatMap(c => c.cues || []));
    const combos = uniq(clips.flatMap(c => c.combinations || []));
    const principles = uniq(clips.flatMap(c => c.principles || []));
    const method = uniq(clips.flatMap(c => c.methodology || []));
    allPrinciples.push(...principles); allDrills.push(...drills); allCues.push(...cues);
    md += `## ${day.replace(/_/g,' ')}  (${clips.length} clips)\n\n`;
    if (principles.length) md += `**Principles:**\n${principles.map(p=>`- ${p}`).join('\n')}\n\n`;
    if (drills.length) md += `**Drills:**\n${drills.map(d=>`- ${d}`).join('\n')}\n\n`;
    if (combos.length) md += `**Combinations:**\n${combos.map(c=>`- ${c}`).join('\n')}\n\n`;
    if (cues.length) md += `**Live cues:** ${cues.slice(0,20).map(c=>`*"${c}"*`).join(' · ')}\n\n`;
    if (method.length) md += `**Methodology:**\n${method.map(m=>`- ${m}`).join('\n')}\n\n`;
  }
  md += `\n---\n\n## Synthesis — The Transferable Framework\n\n`;
  md += `**Principles across the camp (${uniq(allPrinciples).length}):**\n${uniq(allPrinciples).slice(0,40).map(p=>`- ${p}`).join('\n')}\n\n`;
  md += `**Drill library (${uniq(allDrills).length}):**\n${uniq(allDrills).slice(0,50).map(d=>`- ${d}`).join('\n')}\n\n`;
  fs.mkdirSync(path.dirname(DOC), { recursive: true });
  fs.writeFileSync(DOC, md);

  // ── visual HTML (Mermaid, bright/clean per SI-38) ──
  const dayNodes = days.map((d,i) => {
    const c = byDay[d];
    const np = uniq(c.flatMap(x=>x.principles||[])).length;
    const nd = uniq(c.flatMap(x=>x.drills||[])).length;
    return `  D${i}["${d.replace(/_/g,' ')}<br/><small>${nd} drills · ${np} principles</small>"]`;
  }).join('\n');
  const dayEdges = days.slice(1).map((_,i)=>`  D${i} --> D${i+1}`).join('\n');
  const topPrinc = uniq(allPrinciples).slice(0,8);
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pandamericano Methodology Framework</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',-apple-system,system-ui,sans-serif;background:#f6f7fa;color:#1a1d24;padding:28px;line-height:1.5}
.wrap{max-width:1100px;margin:0 auto}
h1{font-size:24px;font-weight:800;letter-spacing:-.5px}.sub{color:#8a93a6;font-size:13px;margin:4px 0 22px}
.card{background:#fff;border:1px solid #e4e7ec;border-radius:12px;padding:20px;margin-bottom:18px}
h2{font-size:13px;text-transform:uppercase;letter-spacing:.5px;color:#475067;margin-bottom:12px}
.princ{display:flex;flex-wrap:wrap;gap:8px}.princ span{background:#eef0fb;color:#3a2f86;border:1px solid #d9d6f3;border-radius:7px;padding:6px 11px;font-size:13px}
.mermaid{background:#fff;text-align:center}
.foot{color:#8a93a6;font-size:11px;font-family:monospace;margin-top:8px}
</style></head><body><div class="wrap">
<h1>🥊 ${C.title}</h1>
<div class="sub">Cuban training camp · harvested from coaching audio Paul attended · ${days.length} days · Spanish original + English · ${new Date().toISOString().slice(0,10)}</div>
<div style="margin:14px 0 4px;display:flex;gap:10px;flex-wrap:wrap"><a href="${C.route}/review" style="display:inline-block;background:#0e9f6e;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px">📋 Summary · Review · Development →</a><a href="${C.route}/camp" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px">🇨🇺 The Camp, Translated (read it all) →</a></div>
<div class="card"><h2>The Progression (day 1 → 17)</h2>
<div class="mermaid">graph LR\n${dayNodes}\n${dayEdges}</div></div>
<div class="card"><h2>Core Principles (transferable)</h2><div class="princ">${topPrinc.map(p=>`<span>${p.replace(/</g,'&lt;').slice(0,80)}</span>`).join('')||'<span>pending transcription</span>'}</div></div>
<div class="foot">Full bilingual detail: vault 06_Methods/pandamericano-methodology-framework.md · live build — rebuilds as transcription completes</div>
</div>
<script>mermaid.initialize({startOnLoad:true,theme:'neutral',flowchart:{curve:'basis'}});</script>
</body></html>`;
  fs.writeFileSync(HTML, html);
  log(`built: ${DOC}`);
  log(`built: ${HTML} (${days.length} days)`);
}

(async () => {
  await structureAll();
  aggregate();
  log('PHASE 2 PASS COMPLETE');
})();
