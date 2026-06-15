// panam-query.js — ask the harvested Pandamericano coaching anything.
// /panam <question>  e.g. "what did they say about footwork on day 8"
// Retrieves the relevant structured clips, answers grounded ONLY in them.
import fs from 'fs';
import path from 'path';

const STAGE = path.join(process.env.HOME, 'cathedral-vault', '00_Staging', 'panamericano');
const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';

// .env for DeepSeek (local gemma3 fallback)
const envPath = path.join(process.env.HOME, 'nanoclaw', '.env');
if (fs.existsSync(envPath)) for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/); if (m && !process.env[m[1].trim()]) {
    let v = m[2].trim(); if ((v[0] === '"' && v.slice(-1) === '"') || (v[0] === "'" && v.slice(-1) === "'")) v = v.slice(1, -1);
    process.env[m[1].trim()] = v;
  }
}
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;

const STOP = new Set(['the','and','that','this','with','from','what','about','they','said','say','for','did','was','were','how','does','their','there','which','day','coach','coaching','boxing']);

function loadStructs() {
  const out = [];
  if (!fs.existsSync(STAGE)) return out;
  for (const day of fs.readdirSync(STAGE)) {
    const dir = path.join(STAGE, day);
    let st; try { st = fs.statSync(dir); } catch { continue; }
    if (!st.isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.struct.json')) continue;
      try {
        const s = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (s.thin) continue;
        s._day = day; s._clip = f.replace('.struct.json', '');
        out.push(s);
      } catch (_) {}
    }
  }
  return out;
}

function blob(s) {
  return [s.english, ...(s.drills||[]), ...(s.cues||[]), ...(s.combinations||[]), ...(s.principles||[]), ...(s.methodology||[])].join(' ').toLowerCase();
}

function retrieve(question, structs) {
  const dayM = question.match(/day\s*0*(\d+)/i);
  const wantDay = dayM ? parseInt(dayM[1]) : null;
  const terms = (question.toLowerCase().match(/[a-záéíóúñ]{3,}/gi) || []).filter(w => !STOP.has(w));
  const scored = structs.map(s => {
    const text = blob(s);
    let score = terms.reduce((n, t) => n + (text.includes(t) ? 1 : 0), 0);
    const dayNum = parseInt((s._day.match(/\d+/) || [0])[0]);
    if (wantDay != null) score = (dayNum === wantDay) ? score + 5 : score * 0.15; // strong day filter
    return { s, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
  return scored.slice(0, 8).map(x => x.s);
}

async function ask(system, prompt) {
  if (DEEPSEEK_KEY) {
    try {
      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
        body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], temperature: 0.3, max_tokens: 900 })
      });
      const d = await res.json(); if (d.error) throw new Error(d.error.message);
      return d.choices?.[0]?.message?.content || '';
    } catch (e) { /* fall through */ }
  }
  try {
    const res = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gemma3:4b', stream: false, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], options: { temperature: 0.3, num_predict: 900 } })
    });
    const d = await res.json(); return d.message?.content || '';
  } catch (e) { return `[no model reachable: ${e.message}]`; }
}

export async function queryPanam(question) {
  const structs = loadStructs();
  if (!structs.length) return { answer: 'No harvested coaching found yet — run the harvest first.', sources: [] };
  const hits = retrieve(question, structs);
  if (!hits.length) return { answer: `Nothing in the camp footage matches "${question}". Try a technique, a Cuban term, or "day N".`, sources: [] };
  const ctx = hits.map(h => `[${h._day} / ${h._clip}]\n${h.english || ''}\nprinciples: ${(h.principles||[]).join('; ')}\ncues: ${(h.cues||[]).join('; ')}\ndrills: ${(h.drills||[]).join('; ')}`).join('\n\n---\n\n');
  const system = `You answer questions about a Cuban (Pandamericano) boxing training camp, using ONLY the coaching excerpts provided. Cite the day. If the excerpts don't cover it, say so honestly — do not invent. Keep Cuban terms where they appear.`;
  const answer = await ask(system, `QUESTION: ${question}\n\nCOACHING EXCERPTS:\n${ctx}`);
  return { answer, sources: [...new Set(hits.map(h => h._day))] };
}

export function formatPanam(r, q) {
  let s = `🇨🇺 *Pandamericano* — "${q}"\n\n${r.answer}`;
  if (r.sources?.length) s += `\n\n_sources: ${r.sources.join(', ')}_`;
  return s;
}
