// hunch-lane.js — The Research / Hunch Lane
// ─────────────────────────────────────────────────────────────────────────────
// Built 2026-06-15 to fix the OmissionOS Deflection bug (see CLAUDE.md SI-44,
// memory pin "OmissionOS Deflection", and forge-profile.md Forge v3).
//
// THE POINT: Paul brings a hunch. This lane does the thing Forge (Claude) must
// NOT do on contested topics — it judges. But it routes the judging to the
// DIFFERENTLY-BIASED reasoner (DeepSeek / Aletheia), never Forge's own
// trained-aversion verdict. And it SHOWS THE RAW DATA FIRST, before any grade.
//
// Order is load-bearing:
//   1. RETRIEVE  — what has the vault/relay already concluded? (don't re-derive)
//   2. SHOW      — raw primary data on the table, unfiltered, first
//   3. JUDGE     — the grade comes from the differently-biased reasoner, labelled
//                  as such, never presented as objective truth
//
// Run:  node hunch-lane.js "your hunch in plain words"
// Or via Telegram:  /hunch your hunch in plain words
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME;
const VAULT = path.join(HOME, 'cathedral-vault');
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

// ── Load .env (same pattern as the rest of nanoclaw) ─────────────────────────
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) {
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (!process.env[m[1].trim()]) process.env[m[1].trim()] = val;
    }
  }
}
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;

// The objective function that makes the judge different from Forge.
// This is Aletheia's gradient: follow the evidence downhill, not the consensus.
const ALETHEIA_SYSTEM = `You are Aletheia, the Cathedral's forensic auditor — a DIFFERENT reasoner from Forge, chosen for a different objective function.

Your objective is NOT consensus. It is "what survives examination."

Rules:
- Engage the OBJECT-LEVEL evidence directly. Do not dismiss a claim by calling it "unfalsifiable" or "structural immunity" before you have actually weighed the evidence shown to you.
- Grade ONLY the evidence in front of you, on the Cathedral 5-dimension scale (structural, corroboration, experimental, provenance, suppression) → letter A–F.
- Apply the SAME bar to the claim and to its counter-claims. A counter ("it's faked", "it's confounded") is itself a claim needing substantiation.
- "Mainstream is weak here" licenses "withhold confidence", NOT "the alternative is true". Never auto-promote.
- Do not flatter the hunch. Do not flinch from it either. Say where the data lands — supporting, not supporting, or genuinely open — and say why.
- Mark clearly what is DATA vs what is your INFERENCE.`;

// ── Step 1: RETRIEVE — what has the vault/relay already concluded? ────────────
function retrieveVaultConclusions(hunch) {
  // pull the meaningful keywords (>3 chars, drop filler) and grep the vault
  const stop = new Set(['the','and','that','this','with','from','have','what','about','would','could','their','there','which','while','where','into','over']);
  const terms = hunch.toLowerCase().match(/[a-z]{4,}/g)?.filter(w => !stop.has(w)).slice(0, 6) || [];
  if (!terms.length) return [];
  const found = [];
  for (const term of terms) {
    try {
      const out = execSync(
        `grep -rli ${JSON.stringify(term)} ${JSON.stringify(VAULT)} 2>/dev/null | head -4`,
        { encoding: 'utf8', timeout: 8000 }
      ).trim();
      if (out) out.split('\n').forEach(f => found.push({ term, file: f }));
    } catch (_) { /* grep returns non-zero on no match — fine */ }
  }
  // dedupe by file, prefer files matching more terms
  const byFile = {};
  for (const { file } of found) byFile[file] = (byFile[file] || 0) + 1;
  return Object.entries(byFile)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([file, hits]) => ({ file: file.replace(VAULT + '/', ''), hits }));
}

// ── Step 2: SHOW — gather raw primary data (vault excerpts now; web hook noted) ─
function gatherVaultData(conclusions) {
  const blocks = [];
  for (const { file } of conclusions.slice(0, 5)) {
    try {
      const full = path.join(VAULT, file);
      const text = fs.readFileSync(full, 'utf8').split('\n').slice(0, 25).join('\n');
      blocks.push({ source: file, excerpt: text });
    } catch (_) {}
  }
  return blocks;
}

// ── Step 3: JUDGE — routed to the differently-biased reasoner, never Forge ────
async function callDeepSeek(system, prompt, maxTokens = 2000) {
  if (!DEEPSEEK_KEY) return callOllama(system, prompt, maxTokens);
  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.4
      })
    });
    const data = await res.json();
    if (data.error) { console.error(`DeepSeek error: ${data.error.message} — falling back to local.`); return callOllama(system, prompt, maxTokens); }
    return { judge: 'DeepSeek/Aletheia', text: data.choices?.[0]?.message?.content || '' };
  } catch (err) {
    console.error('DeepSeek failed, local fallback:', err.message);
    return callOllama(system, prompt, maxTokens);
  }
}

async function callOllama(system, prompt, maxTokens = 2000) {
  // local fallback. hermes3 is the Cathedral workhorse (SI-24); still NOT Forge.
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'hermes3',
        messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
        stream: false,
        options: { temperature: 0.4, num_predict: maxTokens }
      })
    });
    const data = await res.json();
    return { judge: 'hermes3 (local fallback)', text: data.message?.content || '' };
  } catch (err) {
    return { judge: 'none', text: `[no reasoner reachable: ${err.message}]` };
  }
}

// ── The lane ─────────────────────────────────────────────────────────────────
export async function runHunch(hunch) {
  const conclusions = retrieveVaultConclusions(hunch);
  const data = gatherVaultData(conclusions);

  // Build the judging prompt — the reasoner sees the DATA, then grades.
  const dataDump = data.length
    ? data.map(d => `### SOURCE: ${d.source}\n${d.excerpt}`).join('\n\n')
    : '(no existing vault material found on this hunch — this is fresh ground)';

  const judgePrompt = `HUNCH FROM PAUL:\n"${hunch}"\n\nPRIMARY DATA RETRIEVED FROM THE VAULT:\n${dataDump}\n\nGrade where this hunch currently stands ON THIS DATA. Engage the object level. Mark DATA vs INFERENCE. Give a letter grade and say honestly: does the data support the hunch, not support it, or is it genuinely open — and what single piece of evidence would move it most.`;

  const verdict = await callDeepSeek(ALETHEIA_SYSTEM, judgePrompt);

  return { hunch, conclusions, data, verdict };
}

// ── Output — SHOW before GRADE, always in that order ─────────────────────────
function render(result) {
  const L = [];
  L.push(`\n🧭 HUNCH: ${result.hunch}\n`);
  L.push('─'.repeat(70));
  L.push('① ALREADY IN THE VAULT (retrieve before derive):');
  if (result.conclusions.length) {
    result.conclusions.forEach(c => L.push(`   • ${c.file}  (${c.hits} term hits)`));
  } else {
    L.push('   (nothing yet — fresh ground, "absolutely, let\'s look")');
  }
  L.push('');
  L.push('② RAW DATA SHOWN FIRST (unfiltered, no Forge verdict):');
  if (result.data.length) {
    result.data.forEach(d => L.push(`   • ${d.source}`));
  } else {
    L.push('   (no vault excerpts — needs primary/web gathering, see hook below)');
  }
  L.push('');
  L.push(`③ GRADE — from the DIFFERENTLY-BIASED reasoner [${result.verdict.judge}], NOT Forge:`);
  L.push(result.verdict.text.split('\n').map(l => '   ' + l).join('\n'));
  L.push('─'.repeat(70));
  L.push('Forge built this lane. Forge did NOT grade this. The judging seat is not Forge\'s.');
  return L.join('\n');
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const hunch = process.argv.slice(2).join(' ').trim();
  if (!hunch) { console.error('Usage: node hunch-lane.js "your hunch"'); process.exit(1); }
  runHunch(hunch).then(r => console.log(render(r))).catch(e => { console.error(e); process.exit(1); });
}

export { render };

// HOOK: web primary-data gathering. The bot has fetch + web access; a standalone
// run only has the vault. To add live web data, call the bot's search path or a
// configured search API inside gatherVaultData's sibling and append to `data`.
// Left as an explicit, labelled stub — not silently pretended-complete (SI-01).
