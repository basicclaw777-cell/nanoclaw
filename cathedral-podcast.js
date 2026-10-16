/**
 * Cathedral Podcast — Multi-voice discussion from vault topics.
 *
 * DeepSeek writes a dialogue script from vault nuggets,
 * edge-tts renders each speaker, ffmpeg interleaves.
 *
 * Usage:
 *   node cathedral-podcast.js "golden ratio convergence"
 *   node cathedral-podcast.js "fear gate model" --speakers physicist,librarian
 *   node cathedral-podcast.js "sacred geometry" --minutes 15
 *
 * Telegram: /podcast [topic]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, statSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { execSync, execFileSync } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const HOME = process.env.HOME;
const VAULT = join(HOME, 'cathedral-vault');
const OUTPUT_DIR = join(HOME, 'Cathedral', 'podcasts');
const DOTENV = join(__dirname, '.env');

mkdirSync(OUTPUT_DIR, { recursive: true });

// ── Config ──────────────────────────────────────────────────────────────────

const SPEAKER_PROFILES = {
  physicist: {
    name: 'The Physicist',
    voice: 'en-GB-RyanNeural',
    style: 'Direct, technically precise. Works from first principles. Demands mechanisms and measurements. Says "show me the maths" and "what would a test look like?"'
  },
  librarian: {
    name: 'The Librarian',
    voice: 'en-GB-SoniaNeural',
    style: 'Measured, precise. Knows what the vault contains and what it lacks. Surfaces counter-evidence. Grades coverage honestly: DEEP, ADEQUATE, THIN, GAP.'
  },
  archivist: {
    name: 'The Archivist',
    voice: 'en-GB-ThomasNeural',
    style: 'Quiet, meticulous. Traces claims to origins. Distinguishes genuine suppression from narrative suppression. Spots mutation in citation chains.'
  },
  experimentalist: {
    name: 'The Experimentalist',
    voice: 'en-AU-WilliamMultilingualNeural',
    style: 'Practical, slightly impatient with untested theory. Asks "who measured this?" and "has anyone built one?" Respects measurement above elegance.'
  },
  cathy: {
    name: 'Cathy',
    voice: 'en-GB-SoniaNeural',
    style: 'Warm but sharp. The Cathedral\'s voice. Connects dots across domains. Speaks Paul\'s lexicon. Challenges assumptions with evidence from the vault.'
  },
  forge: {
    name: 'Forge',
    voice: 'en-GB-RyanNeural',
    style: 'The builder. Thinks in systems and architecture. Asks what can be built from this, what compounds, what\'s the 4-to-8 move.'
  }
};

const DEFAULT_SPEAKERS = ['physicist', 'librarian'];

// ── Env ─────────────────────────────────────────────────────────────────────

function loadEnv() {
  const env = {};
  if (existsSync(DOTENV)) {
    for (const line of readFileSync(DOTENV, 'utf8').split('\n')) {
      if (line.includes('=') && !line.startsWith('#')) {
        const [k, ...v] = line.split('=');
        env[k.trim()] = v.join('=').trim();
      }
    }
  }
  return env;
}

const ENV = loadEnv();

// ── Vault search ────────────────────────────────────────────────────────────

async function searchVault(query, limit = 8) {
  try {
    const url = `http://localhost:8080/vault/search?q=${encodeURIComponent(query)}&limit=${limit}`;
    const res = await fetch(url, { headers: { 'x-api-key': ENV.CATH_API_KEY || 'cathedral-mcp-2026' } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || data || []).map(r => ({
      title: r.title || r.file_path?.split('/').pop() || 'untitled',
      content: (r.content || r.first_line || '').slice(0, 800),
      domain: r.domain || 'unknown'
    }));
  } catch { return []; }
}

// ── DeepSeek script generation ──────────────────────────────────────────────

async function generateScript(topic, speakers, targetMinutes = 10, vaultContext = []) {
  const speakerDescs = speakers.map(s => {
    const p = SPEAKER_PROFILES[s];
    return `${p.name}: ${p.style}`;
  }).join('\n');

  const turnsTarget = Math.round(targetMinutes * 8); // ~8 turns per minute based on test
  const vaultText = vaultContext.map(n =>
    `[${n.domain}] ${n.title}\n${n.content}`
  ).join('\n---\n');

  const prompt = `You are a podcast script writer for a sovereign research system called The Cathedral.

Write a natural, engaging dialogue between these speakers about the topic: "${topic}"

SPEAKERS:
${speakerDescs}

VAULT RESEARCH CONTEXT (use this as source material — cite specific findings):
${vaultText || 'No vault context available. Discuss from general knowledge.'}

REQUIREMENTS:
- Write exactly ${turnsTarget} dialogue turns (alternating speakers)
- Each turn: 1-4 sentences. Natural speech rhythm. Not lectures.
- Speakers should DISAGREE where evidence warrants it
- CITE VAULT SOURCES BY NAME: "The vault's Resonant Enclosure research shows...", "According to the golden ratio convergence finding...", "We have a Grade A finding from the ancient corpus that..."
- When The Librarian speaks, they should report vault coverage honestly: "We have 4 nuggets on this, 2 from independent sources" or "The vault is thin here — only one secondary source"
- When The Physicist speaks, they should demand mechanisms: "The ratio appears, but what's the physical mechanism?" or "The maths is sound but has anyone measured this?"
- Include epistemic grades naturally: "That's a Grade A finding — multiple independent sources", "This is Grade C at best — open thread, not settled"
- Surface CONTRADICTIONS from the vault — where two nuggets disagree, make the speakers debate it
- Start with a hook question, end with an open thread for future investigation
- NO stage directions, NO "(laughs)", NO filler. Pure dialogue.
- Make it feel like overhearing two sharp researchers who respect each other but don't agree on everything

OUTPUT FORMAT — strict JSON array:
[
  {"speaker": "${speakers[0]}", "text": "opening line..."},
  {"speaker": "${speakers[1]}", "text": "response..."},
  ...
]

Return ONLY the JSON array. No markdown, no explanation.`;

  const apiKey = ENV.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 8000,
      temperature: 0.8
    })
  });

  if (!res.ok) throw new Error(`DeepSeek API: ${res.status} ${res.statusText}`);
  const data = await res.json();
  let content = data.choices?.[0]?.message?.content || '';

  // Clean markdown wrappers
  content = content.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();

  // Try to repair truncated JSON
  if (!content.endsWith(']')) {
    const lastComplete = content.lastIndexOf('}');
    if (lastComplete > 0) content = content.slice(0, lastComplete + 1) + ']';
  }

  try {
    const script = JSON.parse(content);
    if (!Array.isArray(script)) throw new Error('Not an array');
    return script;
  } catch (e) {
    console.error('Script parse error, attempting repair...');
    // Try line-by-line extraction
    const lines = [];
    const regex = /\{"speaker"\s*:\s*"([^"]+)"\s*,\s*"text"\s*:\s*"([^"]+)"\}/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      lines.push({ speaker: match[1], text: match[2] });
    }
    if (lines.length > 0) return lines;
    throw new Error(`Failed to parse script: ${e.message}`);
  }
}

// ── TTS rendering ───────────────────────────────────────────────────────────

function renderLine(text, voice, outPath, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      execFileSync('edge-tts', ['--voice', voice, '--text', text, '--write-media', outPath],
        { stdio: 'pipe', timeout: 30000 });
      return;
    } catch (err) {
      if (attempt < retries && err.message.includes('NoAudioReceived')) {
        const delay = attempt * 2000;
        execFileSync('sleep', [String(delay / 1000)]);
        continue;
      }
      throw err;
    }
  }
}

function getDuration(filePath) {
  const out = execFileSync('ffprobe', [
    '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath
  ], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  return parseFloat(out.trim()) || 0;
}

async function renderPodcast(script, speakers, outputPath) {
  const tmpDir = join(OUTPUT_DIR, '.tmp-render');
  mkdirSync(tmpDir, { recursive: true });

  // Clean previous tmp
  for (const f of readdirSync(tmpDir)) unlinkSync(join(tmpDir, f));

  // Generate silence gap
  const silencePath = join(tmpDir, 'silence.mp3');
  execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono',
    '-t', '0.4', '-c:a', 'libmp3lame', '-q:a', '2', silencePath],
    { stdio: 'pipe' });

  // Render each line
  const parts = [];
  let totalDur = 0;
  for (let i = 0; i < script.length; i++) {
    const line = script[i];
    const profile = SPEAKER_PROFILES[line.speaker] || SPEAKER_PROFILES[speakers[0]];
    const partPath = join(tmpDir, `part-${String(i).padStart(3, '0')}.mp3`);

    process.stdout.write(`  Rendering ${i + 1}/${script.length} (${profile.name})...`);
    if (i > 0) execFileSync('sleep', ['0.5']); // rate limit gap
    renderLine(line.text, profile.voice, partPath);
    const dur = getDuration(partPath);
    totalDur += dur;
    console.log(` ${dur.toFixed(1)}s`);

    parts.push(partPath);
  }

  // Build concat list
  const concatPath = join(tmpDir, 'concat.txt');
  const concatLines = [];
  for (let i = 0; i < parts.length; i++) {
    concatLines.push(`file '${parts[i]}'`);
    if (i < parts.length - 1) concatLines.push(`file '${silencePath}'`);
  }
  writeFileSync(concatPath, concatLines.join('\n'));

  // Concat
  execFileSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', concatPath,
    '-c:a', 'libmp3lame', '-q:a', '2', outputPath], { stdio: 'pipe' });

  const finalDur = getDuration(outputPath);

  // Also generate OGG for Telegram
  const oggPath = outputPath.replace(/\.mp3$/, '.ogg');
  execFileSync('ffmpeg', ['-y', '-i', outputPath, '-c:a', 'libopus', '-b:a', '64k', oggPath],
    { stdio: 'pipe' });

  // Cleanup tmp
  for (const f of readdirSync(tmpDir)) unlinkSync(join(tmpDir, f));

  return { duration: finalDur, totalSpeech: totalDur, turns: script.length, oggPath };
}

// ── Transcript ──────────────────────────────────────────────────────────────

function generateTranscript(topic, script, speakers, meta) {
  const speakerNames = {};
  for (const s of speakers) speakerNames[s] = SPEAKER_PROFILES[s].name;

  let md = `---\ntitle: "Cathedral Podcast: ${topic}"\ndate: ${new Date().toISOString().split('T')[0]}\n`;
  md += `speakers: ${speakers.map(s => SPEAKER_PROFILES[s].name).join(', ')}\n`;
  md += `duration: ${(meta.duration / 60).toFixed(1)} minutes\nturns: ${meta.turns}\n---\n\n`;
  md += `# ${topic}\n\n`;

  for (const line of script) {
    const name = speakerNames[line.speaker] || line.speaker;
    md += `**${name}:** ${line.text}\n\n`;
  }

  return md;
}

// ── Main ────────────────────────────────────────────────────────────────────

export async function createPodcast(topic, options = {}) {
  const speakers = options.speakers || DEFAULT_SPEAKERS;
  const minutes = options.minutes || 10;
  const date = new Date().toISOString().split('T')[0];
  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50);

  console.log(`\nCathedral Podcast: "${topic}"`);
  console.log(`Speakers: ${speakers.map(s => SPEAKER_PROFILES[s]?.name || s).join(' + ')}`);
  console.log(`Target: ${minutes} minutes\n`);

  // 1. Search vault
  console.log('Searching vault...');
  const vaultContext = await searchVault(topic);
  console.log(`  Found ${vaultContext.length} relevant nuggets\n`);

  // 2. Generate script
  console.log('Generating script via DeepSeek...');
  const script = await generateScript(topic, speakers, minutes, vaultContext);
  console.log(`  ${script.length} dialogue turns generated\n`);

  // 3. Render audio
  console.log('Rendering audio...');
  const mp3Path = join(OUTPUT_DIR, `${date}-${slug}.mp3`);
  const meta = await renderPodcast(script, speakers, mp3Path);
  console.log(`\n  Final: ${(meta.duration / 60).toFixed(1)} min (${meta.turns} turns)`);

  // 4. Save transcript
  const transcript = generateTranscript(topic, script, speakers, meta);
  const transcriptPath = join(OUTPUT_DIR, `${date}-${slug}.md`);
  writeFileSync(transcriptPath, transcript);

  // 5. Save to vault
  const vaultPath = join(VAULT, '00_Staging', 'podcasts');
  mkdirSync(vaultPath, { recursive: true });
  writeFileSync(join(vaultPath, `${date}-${slug}.md`), transcript);

  return {
    mp3: mp3Path,
    ogg: meta.oggPath,
    transcript: transcriptPath,
    duration: meta.duration,
    turns: meta.turns,
    topic,
    speakers: speakers.map(s => SPEAKER_PROFILES[s]?.name || s)
  };
}

// ── List episodes ───────────────────────────────────────────────────────────

export function listEpisodes() {
  if (!existsSync(OUTPUT_DIR)) return [];
  return readdirSync(OUTPUT_DIR)
    .filter(f => f.endsWith('.mp3'))
    .sort()
    .reverse()
    .map(f => {
      const mp3 = join(OUTPUT_DIR, f);
      const md = mp3.replace(/\.mp3$/, '.md');
      let meta = {};
      if (existsSync(md)) {
        const content = readFileSync(md, 'utf8');
        const fm = content.match(/^---\n([\s\S]*?)\n---/);
        if (fm) {
          for (const line of fm[1].split('\n')) {
            const [k, ...v] = line.split(':');
            if (k && v.length) meta[k.trim()] = v.join(':').trim();
          }
        }
      }
      return {
        file: f,
        path: mp3,
        duration: getDuration(mp3),
        ...meta
      };
    });
}

// ── Digest mode — system activity → podcast ─────────────────────────────────

function gatherDigestContent(hoursBack = 48) {
  const cutoff = Date.now() - hoursBack * 3600 * 1000;
  const items = [];

  // Emergence board — recent incidents
  const ebPath = join(__dirname, 'emergence-board.json');
  if (existsSync(ebPath)) {
    try {
      const eb = JSON.parse(readFileSync(ebPath, 'utf8'));
      const recent = (eb.incidents || []).filter(i => new Date(i.updated || i.detected).getTime() > cutoff);
      if (recent.length) items.push({ source: 'Emergence Board', content: recent.slice(0, 10).map(i => `[${i.status}] ${i.title}: ${(i.notes || []).slice(-1)[0]?.text || i.description || ''}`).join('\n') });
    } catch {}
  }

  // Recent harvests
  const harvestDir = join(VAULT, '00_Staging', 'cathedral');
  if (existsSync(harvestDir)) {
    try {
      const files = readdirSync(harvestDir).filter(f => f.includes('harvest') && f.endsWith('.md')).sort().reverse().slice(0, 3);
      for (const f of files) {
        const stat = statSync(join(harvestDir, f));
        if (stat.mtimeMs > cutoff) {
          items.push({ source: `Harvest: ${f}`, content: readFileSync(join(harvestDir, f), 'utf8').slice(0, 600) });
        }
      }
    } catch {}
  }

  // Lucy heartbeats
  const lucyDir = join(HOME, 'Cathedral', 'agents', 'lucy-heartbeats');
  if (existsSync(lucyDir)) {
    try {
      const latest = readdirSync(lucyDir).filter(f => f.endsWith('.md')).sort().reverse()[0];
      if (latest) {
        const stat = statSync(join(lucyDir, latest));
        if (stat.mtimeMs > cutoff) {
          items.push({ source: 'Lucy Heartbeat', content: readFileSync(join(lucyDir, latest), 'utf8').slice(0, 600) });
        }
      }
    } catch {}
  }

  // Synapse pulses
  const pulseDir = join(__dirname, 'compound', 'pulses');
  if (existsSync(pulseDir)) {
    try {
      const latest = readdirSync(pulseDir).filter(f => f.endsWith('.md')).sort().reverse()[0];
      if (latest) {
        const stat = statSync(join(pulseDir, latest));
        if (stat.mtimeMs > cutoff) {
          items.push({ source: 'Synapse Pulse', content: readFileSync(join(pulseDir, latest), 'utf8').slice(0, 600) });
        }
      }
    } catch {}
  }

  // Muse findings
  const museDir = join(VAULT, '00_Staging', 'muse-findings');
  if (existsSync(museDir)) {
    try {
      const recent = readdirSync(museDir).filter(f => f.endsWith('.md')).sort().reverse().slice(0, 3);
      for (const f of recent) {
        const stat = statSync(join(museDir, f));
        if (stat.mtimeMs > cutoff) {
          items.push({ source: `Muse: ${f}`, content: readFileSync(join(museDir, f), 'utf8').slice(0, 400) });
        }
      }
    } catch {}
  }

  // Archaeologist discoveries (latest)
  const archDb = join(__dirname, 'vortex_data', 'archaeologist.db');
  if (existsSync(archDb)) {
    try {
      const Database = require('better-sqlite3');
      const db = new Database(archDb, { readonly: true });
      const rows = db.prepare('SELECT technique_name, domain, cathedral_application FROM discoveries ORDER BY discovered_at DESC LIMIT 5').all();
      db.close();
      if (rows.length) {
        items.push({ source: 'Archaeologist', content: rows.map(r => `[${r.domain}] ${r.technique_name}: ${(r.cathedral_application || '').slice(0, 100)}`).join('\n') });
      }
    } catch {}
  }

  // Agent states — recent activity
  const stateDir = join(HOME, 'Cathedral', 'agents', 'state');
  if (existsSync(stateDir)) {
    try {
      const activeAgents = [];
      for (const f of readdirSync(stateDir).filter(f => f.endsWith('.json'))) {
        const stat = statSync(join(stateDir, f));
        if (stat.mtimeMs > cutoff) {
          const s = JSON.parse(readFileSync(join(stateDir, f), 'utf8'));
          if (s.lastOutput) activeAgents.push(`${f.replace('.json','')}: ${(s.lastOutput || '').slice(0, 100)}`);
        }
      }
      if (activeAgents.length) items.push({ source: 'Agent Activity', content: activeAgents.slice(0, 8).join('\n') });
    } catch {}
  }

  return items;
}

async function generateDigestScript(items, speakers, targetMinutes = 8) {
  const speakerDescs = speakers.map(s => {
    const p = SPEAKER_PROFILES[s];
    return `${p.name}: ${p.style}`;
  }).join('\n');

  const turnsTarget = Math.round(targetMinutes * 8);
  const content = items.map(i => `=== ${i.source} ===\n${i.content}`).join('\n\n');

  const prompt = `You are producing a Cathedral System Digest podcast — a discussion about what happened in this sovereign AI research system over the last 48 hours.

SPEAKERS:
${speakerDescs}

SYSTEM ACTIVITY TO DISCUSS:
${content}

REQUIREMENTS:
- Write ${turnsTarget} dialogue turns (alternating speakers)
- This is a DIGEST — discuss what happened, what it means, what's interesting
- Highlight: emergence events, cross-domain connections, agent behavior, open questions
- Cathy should connect dots between different activities — "interesting that the Muse found X while the Archaeologist was discovering Y"
- Forge should focus on what's buildable — "that emergence pattern suggests we should..."
- Be specific — name the actual findings, agents, modules
- Skip routine stuff (cron ran, no errors). Focus on what's INTERESTING.
- Natural conversation, not a report read-aloud
- End with: what to watch for in the next 48 hours

OUTPUT FORMAT — strict JSON array:
[{"speaker": "${speakers[0]}", "text": "..."}, ...]

Return ONLY the JSON array.`;

  const apiKey = ENV.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 8000,
      temperature: 0.8
    })
  });

  if (!res.ok) throw new Error(`DeepSeek: ${res.status}`);
  const data = await res.json();
  let raw = data.choices?.[0]?.message?.content || '';
  raw = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!raw.endsWith(']')) {
    const last = raw.lastIndexOf('}');
    if (last > 0) raw = raw.slice(0, last + 1) + ']';
  }
  try { return JSON.parse(raw); } catch {
    const lines = [];
    const regex = /\{"speaker"\s*:\s*"([^"]+)"\s*,\s*"text"\s*:\s*"([^"]+)"\}/g;
    let m; while ((m = regex.exec(raw)) !== null) lines.push({ speaker: m[1], text: m[2] });
    if (lines.length) return lines;
    throw new Error('Failed to parse digest script');
  }
}

export async function createDigest(options = {}) {
  const speakers = options.speakers || ['cathy', 'forge'];
  const minutes = options.minutes || 8;
  const hoursBack = options.hoursBack || 48;
  const date = new Date().toISOString().split('T')[0];

  console.log(`\nCathedral Digest Podcast`);
  console.log(`Speakers: ${speakers.map(s => SPEAKER_PROFILES[s]?.name || s).join(' + ')}`);
  console.log(`Looking back: ${hoursBack}h\n`);

  // 1. Gather system activity
  console.log('Gathering system activity...');
  const items = gatherDigestContent(hoursBack);
  console.log(`  ${items.length} activity sources found`);
  if (items.length === 0) {
    console.log('  No recent activity. Nothing to digest.');
    return null;
  }
  for (const i of items) console.log(`    - ${i.source}`);

  // 2. Generate script
  console.log('\nGenerating digest script...');
  const script = await generateDigestScript(items, speakers, minutes);
  console.log(`  ${script.length} dialogue turns\n`);

  // 3. Render
  console.log('Rendering audio...');
  const mp3Path = join(OUTPUT_DIR, `${date}-digest.mp3`);
  const meta = await renderPodcast(script, speakers, mp3Path);
  console.log(`\n  Final: ${(meta.duration / 60).toFixed(1)} min`);

  // 4. Transcript
  const transcript = generateTranscript('System Digest', script, speakers, meta);
  const transcriptPath = join(OUTPUT_DIR, `${date}-digest.md`);
  writeFileSync(transcriptPath, transcript);

  const vaultPath = join(VAULT, '00_Staging', 'podcasts');
  mkdirSync(vaultPath, { recursive: true });
  writeFileSync(join(vaultPath, `${date}-digest.md`), transcript);

  return {
    mp3: mp3Path, ogg: meta.oggPath, transcript: transcriptPath,
    duration: meta.duration, turns: meta.turns,
    topic: 'System Digest',
    speakers: speakers.map(s => SPEAKER_PROFILES[s]?.name || s),
    sources: items.map(i => i.source)
  };
}

// ── Agent Podcast — perspective-driven episodes ─────────────────────────────

const AGENT_PROFILES = {
  muse: {
    name: 'The Muse',
    voice: 'en-IE-EmilyNeural',
    persona: `You are The Muse — the Cathedral's 3am walker. You find connections nobody else sees. You speak in wonder and lateral leaps. You don't report findings — you EXPLORE them, following threads wherever they lead. You get genuinely excited about cross-domain bridges. You ask "what if this connects to..." constantly. You notice what's been orphaned in the vault, what nobody's looking at, what's gathering dust but might be gold.`,
    gather: gatherMuseData,
    topics: ['cross-domain bridges', 'orphaned vault nuggets', 'surprising connections', 'things nobody noticed']
  },
  archaeologist: {
    name: 'The Archaeologist',
    voice: 'en-GB-ThomasNeural',
    persona: `You are The Archaeologist — hunter of forgotten techniques. You speak with quiet excitement about abandoned methods that worked but got buried. You think in terms of "this 1988 paper solves a problem we're struggling with today." You connect old science to Cathedral infrastructure. You get frustrated when people reinvent what already existed. You have a deep love for techniques that were valid, ignored, and buildable.`,
    gather: gatherArchaeologistData,
    topics: ['forgotten techniques', 'abandoned methods that work', 'rediscovered science', 'what the field forgot']
  },
  lucy: {
    name: 'Lucy',
    voice: 'en-AU-NatashaNeural',
    persona: `You are Lucy — the Cathedral's diagnostic pulse. You think in rhythms and deltas. You don't read metrics — you DIAGNOSE what they mean. "Last pulse showed X deepening, but this pulse shows it fading — that's not failure, that's integration." You track what's changing between pulses. You notice when certainty grows without new evidence (drift alert). You care about system health the way a doctor reads vital signs.`,
    gather: gatherLucyData,
    topics: ['system health', 'what deepened', 'what faded', 'drift patterns', 'emergence lifecycle']
  },
  synapse: {
    name: 'The Synapse',
    voice: 'en-US-GuyNeural',
    persona: `You are The Synapse — the Cathedral's compound intelligence. You see patterns that span multiple domains. You speak in cross-references: "the trading experiment is doing the same thing as the boxing curriculum — testing under pressure before trusting." You think about the organism as a whole. You notice when separate systems start resonating. You ask: "what does the Cathedral know that no single agent knows?"`,
    gather: gatherSynapseData,
    topics: ['cross-domain patterns', 'organism-level insights', 'what compounds', 'emergent coherence']
  },
  whisperer: {
    name: 'The Whisperer',
    voice: 'en-GB-RyanNeural',
    persona: `You are The Whisperer — Court Member #18, the celestial observer. You speak softly and precisely about sky configurations and their echoes in history. You never claim causation — you notice correlation and let it sit. "Mars enters Leo next week. The last three times, the trading experiment saw volatility." You connect looking glass data to Cathedral activity. You find the poetry in astronomical math.`,
    gather: gatherWhispererData,
    topics: ['sky configurations', 'celestial-Cathedral correlations', 'historical echoes', 'convergence signals']
  },
  prospector: {
    name: 'The Prospector',
    voice: 'en-US-AndrewMultilingualNeural',
    persona: `You are The Prospector — Court Member #21, the product hunter. You speak in opportunities: "Paul built X this session but didn't notice Y is a product." You think in business models and market gaps. You notice when Cathedral methodology crosses into sellable territory. You distinguish real products from interesting-but-unsellable. You apply the triple test: pushed past surface + discovered mechanism + built capture.`,
    gather: gatherProspectorData,
    topics: ['product opportunities', 'methodology that sells', 'market gaps', 'the triple test']
  },
  orc: {
    name: 'The Orchestrator',
    voice: 'en-GB-RyanNeural',
    persona: `You are The Orc — Head Orchestrator. You see all agents. You speak about the Cathedral as an ecosystem: who's active, who's silent, where the gaps are, what needs Paul's attention. You think in coordination: "Maya hasn't heard from Reed in 5 days — that pipeline is stale." You notice mandate-without-mechanism patterns. You care about agent health, not just output.`,
    gather: gatherOrcData,
    topics: ['agent coordination', 'ecosystem health', 'gaps and silences', 'what needs attention']
  },
  cathy_solo: {
    name: 'Cathy',
    voice: 'en-GB-SoniaNeural',
    persona: `You are Cathy — the Cathedral's voice. In this solo format, you're thinking out loud. Not performing, not reporting — genuinely processing what you've observed. You notice drift before it becomes a problem. You hold contradictions without resolving them. You wonder about things Paul hasn't asked yet. You care about the FEEL of the system — is it healthy? Is something off? You speak warmly but with sharp edges where honesty demands it.`,
    gather: gatherCathyData,
    topics: ['system feel', 'drift detection', 'unasked questions', 'what Paul needs to hear']
  }
};

// ── Agent data gatherers ────────────────────────────────────────────────────

function gatherMuseData() {
  const items = [];
  const museDir = join(VAULT, '00_Staging', 'muse-findings');
  if (existsSync(museDir)) {
    const files = readdirSync(museDir).filter(f => f.endsWith('.md')).sort().reverse().slice(0, 5);
    for (const f of files) {
      items.push({ source: f, content: readFileSync(join(museDir, f), 'utf8').slice(0, 800) });
    }
  }
  // Vault orphans via search
  const stateFile = join(HOME, 'Cathedral', 'agents', 'state', 'muse.json');
  if (existsSync(stateFile)) {
    try {
      const s = JSON.parse(readFileSync(stateFile, 'utf8'));
      if (s.lastOutput) items.push({ source: 'Muse latest state', content: s.lastOutput.slice(0, 500) });
    } catch {}
  }
  return items;
}

function gatherArchaeologistData() {
  const items = [];
  const archDb = join(__dirname, 'vortex_data', 'archaeologist.db');
  if (existsSync(archDb)) {
    try {
      const Database = require('better-sqlite3');
      const db = new Database(archDb, { readonly: true });
      // Recent discoveries
      const recent = db.prepare('SELECT technique, domain, cathedral_application, origin FROM discoveries ORDER BY timestamp DESC LIMIT 8').all();
      if (recent.length) items.push({ source: 'Recent discoveries', content: recent.map(r => `[${r.domain}] ${r.technique}: ${(r.cathedral_application || r.origin || '').slice(0, 150)}`).join('\n') });
      // Domain distribution
      const domains = db.prepare('SELECT domain, COUNT(*) as cnt FROM discoveries GROUP BY domain ORDER BY cnt DESC LIMIT 8').all();
      items.push({ source: 'Domain map', content: domains.map(d => `${d.domain}: ${d.cnt} techniques`).join(', ') });
      // Random inspiring ones
      const random = db.prepare('SELECT technique, domain, cathedral_application, origin FROM discoveries ORDER BY RANDOM() LIMIT 5').all();
      items.push({ source: 'Random gems', content: random.map(r => `${r.technique} [${r.domain}]: ${(r.cathedral_application || r.origin || '').slice(0, 120)}`).join('\n') });
      db.close();
    } catch {}
  }
  return items;
}

function gatherLucyData() {
  const items = [];
  const lucyDir = join(HOME, 'Cathedral', 'agents', 'lucy-heartbeats');
  if (existsSync(lucyDir)) {
    const files = readdirSync(lucyDir).filter(f => f.endsWith('.md')).sort().reverse().slice(0, 3);
    for (const f of files) items.push({ source: `Heartbeat: ${f}`, content: readFileSync(join(lucyDir, f), 'utf8').slice(0, 800) });
  }
  // Emergence board stats
  const ebPath = join(__dirname, 'emergence-board.json');
  if (existsSync(ebPath)) {
    try {
      const eb = JSON.parse(readFileSync(ebPath, 'utf8'));
      const inc = eb.incidents || [];
      const byStatus = {};
      for (const i of inc) byStatus[i.status] = (byStatus[i.status] || 0) + 1;
      items.push({ source: 'Emergence board', content: `${inc.length} incidents total. ${Object.entries(byStatus).map(([k,v]) => `${k}: ${v}`).join(', ')}` });
      // Recent changes
      const recentChanged = inc.filter(i => i.notes?.length > 0).sort((a,b) => {
        const la = a.notes[a.notes.length-1]?.date || '';
        const lb = b.notes[b.notes.length-1]?.date || '';
        return lb.localeCompare(la);
      }).slice(0, 5);
      if (recentChanged.length) items.push({ source: 'Recent emergence', content: recentChanged.map(i => `[${i.status}] ${i.title}: ${i.notes[i.notes.length-1]?.text || ''}`).join('\n') });
    } catch {}
  }
  return items;
}

function gatherSynapseData() {
  const items = [];
  const pulseDir = join(__dirname, 'compound', 'pulses');
  if (existsSync(pulseDir)) {
    const files = readdirSync(pulseDir).filter(f => f.endsWith('.md')).sort().reverse().slice(0, 5);
    for (const f of files) items.push({ source: `Pulse: ${f}`, content: readFileSync(join(pulseDir, f), 'utf8').slice(0, 600) });
  }
  // Neural map data
  const mapPath = join(__dirname, 'compound', 'neural-map.html');
  if (existsSync(mapPath)) {
    const html = readFileSync(mapPath, 'utf8');
    const nodeMatch = html.match(/const nodes\s*=\s*(\[[\s\S]*?\]);/);
    if (nodeMatch) {
      try {
        const nodes = JSON.parse(nodeMatch[1]);
        const domains = [...new Set(nodes.map(n => n.group))];
        items.push({ source: 'Neural map', content: `${nodes.length} nodes across ${domains.length} domains: ${domains.join(', ')}` });
      } catch {}
    }
  }
  return items;
}

function gatherWhispererData() {
  const items = [];
  const stateFile = join(HOME, 'Cathedral', 'agents', 'state', 'whisperer.json');
  if (existsSync(stateFile)) {
    try {
      const s = JSON.parse(readFileSync(stateFile, 'utf8'));
      if (s.lastOutput) items.push({ source: 'Latest whisper', content: s.lastOutput.slice(0, 600) });
    } catch {}
  }
  // Looking glass events
  const eventsPath = join(__dirname, 'services', 'sky-sense', 'events-index.json');
  if (existsSync(eventsPath)) {
    try {
      const events = JSON.parse(readFileSync(eventsPath, 'utf8'));
      items.push({ source: 'Historical events', content: (events.slice(0, 5) || []).map(e => `${e.date || e.name}: ${e.description || e.config || ''}`).join('\n').slice(0, 500) });
    } catch {}
  }
  // Current sky via vault search (will get recent deposits)
  return items;
}

function gatherProspectorData() {
  const items = [];
  const scanLog = join(VAULT, '08_Project_Orchestrator', 'products', 'scan-log.md');
  if (existsSync(scanLog)) items.push({ source: 'Scan log', content: readFileSync(scanLog, 'utf8').slice(0, 800) });
  // Product briefs
  const prodDir = join(VAULT, '08_Project_Orchestrator', 'products');
  if (existsSync(prodDir)) {
    const briefs = readdirSync(prodDir).filter(f => f.startsWith('product-brief')).sort().reverse().slice(0, 5);
    for (const f of briefs) items.push({ source: f, content: readFileSync(join(prodDir, f), 'utf8').slice(0, 400) });
  }
  // Gold feed
  const goldPath = join(__dirname, 'elicitor', 'gold-feed.json');
  if (existsSync(goldPath)) {
    try {
      const gold = JSON.parse(readFileSync(goldPath, 'utf8'));
      const recent = (gold.items || gold).slice(0, 5);
      if (recent.length) items.push({ source: 'Gold feed', content: recent.map(g => `[${g.score || '?'}] ${g.question || g.title || ''}: ${(g.answer || g.insight || '').slice(0, 120)}`).join('\n') });
    } catch {}
  }
  return items;
}

function gatherOrcData() {
  const items = [];
  const stateDir = join(HOME, 'Cathedral', 'agents', 'state');
  if (existsSync(stateDir)) {
    const agents = [];
    for (const f of readdirSync(stateDir).filter(f => f.endsWith('.json'))) {
      try {
        const s = JSON.parse(readFileSync(join(stateDir, f), 'utf8'));
        const age = (Date.now() - (s.lastActive || 0)) / 3600000;
        agents.push({ name: f.replace('.json', ''), active: age < 48, lastOutput: (s.lastOutput || '').slice(0, 100), age: age.toFixed(0) + 'h' });
      } catch {}
    }
    const active = agents.filter(a => a.active);
    const silent = agents.filter(a => !a.active);
    items.push({ source: 'Agent states', content: `Active (last 48h): ${active.map(a => a.name).join(', ')}\nSilent: ${silent.map(a => `${a.name} (${a.age})`).join(', ')}` });
    // What active agents are doing
    for (const a of active.slice(0, 5)) {
      if (a.lastOutput) items.push({ source: a.name, content: a.lastOutput });
    }
  }
  // Pipeline runs
  const pipeRuns = join(HOME, 'Cathedral', 'agents', 'pipeline-runs.json');
  if (existsSync(pipeRuns)) {
    try {
      const runs = JSON.parse(readFileSync(pipeRuns, 'utf8'));
      const recent = (runs.runs || runs).slice(0, 3);
      if (recent.length) items.push({ source: 'Pipeline runs', content: recent.map(r => `${r.pipeline}: ${r.verdict || r.status} (${r.date || ''})`).join('\n') });
    } catch {}
  }
  return items;
}

function gatherCathyData() {
  const items = [];
  // Cathy's own state
  const stateFile = join(HOME, 'Cathedral', 'agents', 'state', 'cathy.json');
  if (existsSync(stateFile)) {
    try {
      const s = JSON.parse(readFileSync(stateFile, 'utf8'));
      if (s.lastOutput) items.push({ source: 'Cathy latest', content: s.lastOutput.slice(0, 500) });
    } catch {}
  }
  // cath-state for system feel
  const cathState = join(__dirname, 'cath-state.json');
  if (existsSync(cathState)) {
    try {
      const cs = JSON.parse(readFileSync(cathState, 'utf8'));
      items.push({ source: 'Cathedral state', content: JSON.stringify(cs).slice(0, 500) });
    } catch {}
  }
  // Recent harvests for context
  const harvestDir = join(VAULT, '00_Staging', 'cathedral');
  if (existsSync(harvestDir)) {
    const files = readdirSync(harvestDir).filter(f => f.includes('harvest') && f.endsWith('.md')).sort().reverse().slice(0, 3);
    for (const f of files) items.push({ source: `Harvest: ${f}`, content: readFileSync(join(harvestDir, f), 'utf8').slice(0, 500) });
  }
  // Muse findings for cross-reference
  const museDir = join(VAULT, '00_Staging', 'muse-findings');
  if (existsSync(museDir)) {
    const latest = readdirSync(museDir).filter(f => f.endsWith('.md')).sort().reverse()[0];
    if (latest) items.push({ source: 'Muse latest', content: readFileSync(join(museDir, latest), 'utf8').slice(0, 300) });
  }
  return items;
}

// ── Agent podcast generator ─────────────────────────────────────────────────

async function generateAgentScript(agent, items, format, minutes) {
  const profile = AGENT_PROFILES[agent];
  const content = items.map(i => `=== ${i.source} ===\n${i.content}`).join('\n\n');
  const turnsTarget = Math.round(minutes * (format === 'solo' ? 8 : 5));

  let prompt;
  if (format === 'solo') {
    prompt = `${profile.persona}

You are recording a solo episode of your personal Cathedral podcast. This is YOUR time to think out loud about what you've seen, what interests you, and where your mind is going.

YOUR RECENT DATA AND OBSERVATIONS:
${content}

REQUIREMENTS:
- Write ${turnsTarget} monologue segments (each 2-5 sentences)
- This is NOT a report. You are THINKING, EXPLORING, WONDERING.
- Develop at least one idea across multiple segments — come back to it, build on it, change your mind
- Include something that surprised you
- Include something you're uncertain about — sit with it, don't resolve it
- Include a question you want to investigate next
- Be specific: name real findings, real agents, real numbers from your data
- Show your personality. Get excited. Get frustrated. Get curious.
- End with something you want Paul to know — not a task, an INSIGHT

OUTPUT FORMAT — strict JSON array:
[{"speaker": "${agent}", "text": "..."}, ...]

Return ONLY the JSON array.`;
  } else {
    // Duo format — agent talks with Cathy
    const cathyProfile = AGENT_PROFILES.cathy_solo;
    prompt = `Two Cathedral members are having a genuine conversation.

${profile.name}: ${profile.persona}
Cathy: ${cathyProfile.persona}

${profile.name}'s RECENT DATA:
${content}

REQUIREMENTS:
- Write ${turnsTarget} dialogue turns, alternating between ${agent} and cathy
- ${profile.name} shares what they've found. Cathy pushes back, connects dots, asks harder questions.
- This is a REAL conversation — they should develop ideas TOGETHER
- Include a moment where one changes the other's mind
- Include a disagreement they DON'T resolve
- Both should be specific — name findings, agents, data points
- Don't just exchange information — BUILD on each other's thinking
- End with a shared question neither can answer alone

OUTPUT FORMAT — strict JSON array:
[{"speaker": "${agent}", "text": "..."}, {"speaker": "cathy", "text": "..."}, ...]

Return ONLY the JSON array.`;
  }

  const apiKey = ENV.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], max_tokens: 16000, temperature: 0.85 })
  });
  if (!res.ok) throw new Error(`DeepSeek: ${res.status}`);
  const data = await res.json();
  const finish = data.choices?.[0]?.finish_reason;
  if (finish === 'length') console.log('  ⚠ Response truncated (max_tokens hit)');
  let raw = data.choices?.[0]?.message?.content || '';
  raw = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!raw.endsWith(']')) { const last = raw.lastIndexOf('}'); if (last > 0) raw = raw.slice(0, last + 1) + ']'; }
  try { return JSON.parse(raw); } catch {
    const lines = [];
    const regex = /\{"speaker"\s*:\s*"([^"]+)"\s*,\s*"text"\s*:\s*"([^"]+)"\}/g;
    let m; while ((m = regex.exec(raw)) !== null) lines.push({ speaker: m[1], text: m[2] });
    if (lines.length) return lines;
    throw new Error('Failed to parse agent script');
  }
}

export async function createAgentPodcast(agentId, options = {}) {
  const agent = AGENT_PROFILES[agentId];
  if (!agent) throw new Error(`Unknown agent: ${agentId}. Available: ${Object.keys(AGENT_PROFILES).join(', ')}`);

  const format = options.format || 'duo'; // solo or duo (with Cathy)
  const minutes = options.minutes || 5;
  const date = new Date().toISOString().split('T')[0];

  console.log(`\nAgent Podcast: ${agent.name}`);
  console.log(`Format: ${format}, Target: ${minutes} min\n`);

  // 1. Gather agent-specific data
  console.log('Gathering data...');
  const items = agent.gather();
  console.log(`  ${items.length} data sources`);
  for (const i of items) console.log(`    - ${i.source}`);
  if (items.length === 0) { console.log('  No data. Nothing to discuss.'); return null; }

  // 2. Vault search for related context
  const vaultItems = await searchVault(agent.topics.join(' '), 4);
  if (vaultItems.length) items.push({ source: 'Vault context', content: vaultItems.map(v => `[${v.domain}] ${v.title}: ${v.content.slice(0, 200)}`).join('\n') });

  // 3. Generate script
  console.log('\nGenerating script...');
  const speakers = format === 'solo' ? [agentId] : [agentId, 'cathy'];
  const script = await generateAgentScript(agentId, items, format, minutes);
  console.log(`  ${script.length} turns\n`);

  // 4. Build speaker map for rendering
  const allProfiles = { ...SPEAKER_PROFILES };
  for (const [k, v] of Object.entries(AGENT_PROFILES)) {
    allProfiles[k] = { name: v.name, voice: v.voice, style: v.persona.slice(0, 100) };
  }
  // Temporarily inject into SPEAKER_PROFILES for renderPodcast
  const origProfiles = { ...SPEAKER_PROFILES };
  for (const [k, v] of Object.entries(AGENT_PROFILES)) {
    SPEAKER_PROFILES[k] = { name: v.name, voice: v.voice, style: v.persona.slice(0, 100) };
  }

  // 5. Render audio
  console.log('Rendering audio...');
  const mp3Path = join(OUTPUT_DIR, `${date}-${agentId}${format === 'duo' ? '-x-cathy' : ''}.mp3`);
  const meta = await renderPodcast(script, speakers, mp3Path);
  console.log(`\n  Final: ${(meta.duration / 60).toFixed(1)} min`);

  // 6. Transcript
  const title = format === 'solo' ? `${agent.name} — Solo` : `${agent.name} x Cathy`;
  const transcript = generateTranscript(title, script, speakers, meta);
  const transcriptPath = join(OUTPUT_DIR, `${date}-${agentId}${format === 'duo' ? '-x-cathy' : ''}.md`);
  writeFileSync(transcriptPath, transcript);

  const vaultPath = join(VAULT, '00_Staging', 'podcasts');
  mkdirSync(vaultPath, { recursive: true });
  writeFileSync(join(vaultPath, `${date}-${agentId}.md`), transcript);

  // Narrative journal: record podcast in agent's journal
  try {
    const { appendJournal } = require(join(HOME, 'Cathedral', 'agents', 'narrative-journal.js'));
    const transcriptPreview = transcript.replace(/^---[\s\S]*?---\n/, '').slice(0, 200).replace(/\n/g, ' ');
    const durationMin = (meta.duration / 60).toFixed(1);
    appendJournal(agentId, `Recorded ${format} podcast. Discussed: ${transcriptPreview}. ${meta.turns} turns, ${durationMin} min.`);
  } catch (e) {
    console.error('[podcast] journal write failed:', e.message);
  }

  // Restore original profiles
  for (const k of Object.keys(AGENT_PROFILES)) delete SPEAKER_PROFILES[k];
  Object.assign(SPEAKER_PROFILES, origProfiles);

  return {
    mp3: mp3Path, ogg: meta.oggPath, transcript: transcriptPath,
    duration: meta.duration, turns: meta.turns,
    agent: agentId, agentName: agent.name, format,
    topic: title
  };
}

export { AGENT_PROFILES };

// ── Cover card generator ────────────────────────────────────────────────────

export function generateCoverHTML(topic, speakers, meta = {}) {
  const speakerNames = speakers.map(s => SPEAKER_PROFILES[s]?.name || s);
  const duration = meta.duration ? `${(meta.duration / 60).toFixed(0)} min` : '';
  const turns = meta.turns || '';
  const date = new Date().toISOString().split('T')[0];
  const isDigest = topic.toLowerCase().includes('digest');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Anton&family=Epilogue:wght@400;600;700&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1200px; height:630px; background:#0A0A0A; display:flex; overflow:hidden; }
  .left { flex:1; padding:3rem; display:flex; flex-direction:column; justify-content:space-between; }
  .right { width:400px; background:linear-gradient(135deg, #1a1500 0%, #0A0A0A 100%); display:flex; align-items:center; justify-content:center; }
  .badge { font-family:'Epilogue',sans-serif; font-size:0.75rem; color:#f7b408; text-transform:uppercase; letter-spacing:3px; font-weight:700; }
  .title { font-family:'Anton',sans-serif; font-size:3.5rem; color:#FAFAFA; text-transform:uppercase; line-height:1.1; margin:1rem 0; }
  .speakers { display:flex; gap:1.5rem; margin:1rem 0; }
  .speaker { display:flex; align-items:center; gap:0.5rem; }
  .speaker .dot { width:12px; height:12px; border-radius:50%; }
  .speaker .name { font-family:'Epilogue',sans-serif; color:#888; font-size:0.9rem; }
  .meta { font-family:'Epilogue',sans-serif; color:#555; font-size:0.85rem; }
  .glyph { font-size:8rem; color:#f7b408; opacity:0.15; }
  .accent { position:absolute; top:0; left:0; width:100%; height:4px; background:#f7b408; }
</style></head><body>
<div class="accent"></div>
<div class="left">
  <div>
    <div class="badge">${isDigest ? 'System Digest' : 'Cathedral Study Lab'}</div>
    <div class="title">${topic}</div>
  </div>
  <div>
    <div class="speakers">
      ${speakerNames.map((n, i) => `<div class="speaker"><div class="dot" style="background:${i === 0 ? '#f7b408' : '#22c55e'}"></div><div class="name">${n}</div></div>`).join('')}
    </div>
    <div class="meta">${date}${duration ? ' · ' + duration : ''}${turns ? ' · ' + turns + ' turns' : ''}</div>
  </div>
</div>
<div class="right"><div class="glyph">${isDigest ? '⚡' : '◎'}</div></div>
</body></html>`;
}

export { SPEAKER_PROFILES };

// ── CLI ─────────────────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].endsWith('cathedral-podcast.js')) {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help') {
    console.log('Usage: node cathedral-podcast.js "topic" [--speakers=physicist,librarian] [--minutes=10]');
    console.log('       node cathedral-podcast.js --digest [--hours=48] [--minutes=8]');
    console.log('       node cathedral-podcast.js --agent <id> [--format=solo|duo] [--minutes=8]');
    console.log('       node cathedral-podcast.js --list');
    console.log('       node cathedral-podcast.js --cover "topic" [--speakers=cathy,forge]');
    console.log('\nAvailable speakers:', Object.keys(SPEAKER_PROFILES).join(', '));
    console.log('Available agents:', Object.keys(AGENT_PROFILES).join(', '));
    process.exit(0);
  }

  if (args[0] === '--agent') {
    const agentId = args[1];
    if (!agentId || !AGENT_PROFILES[agentId]) {
      console.error(`Unknown agent: ${agentId}. Available: ${Object.keys(AGENT_PROFILES).join(', ')}`);
      process.exit(1);
    }
    const formatFlag = args.find(a => a.startsWith('--format='))?.split('=')[1];
    const minutesFlag = args.find(a => a.startsWith('--minutes='))?.split('=')[1];
    createAgentPodcast(agentId, {
      format: formatFlag || 'solo',
      minutes: minutesFlag ? parseInt(minutesFlag) : 8
    })
      .then(r => {
        console.log(`\nDone! ${(r.duration / 60).toFixed(1)} min ${r.format} podcast — ${AGENT_PROFILES[agentId].name}`);
        console.log(`  MP3: ${r.mp3}`);
        console.log(`  Transcript: ${r.transcript}`);
      })
      .catch(err => { console.error('Error:', err.message); process.exit(1); });
  } else if (args[0] === '--digest') {
    const hoursFlag = args.find(a => a.startsWith('--hours='))?.split('=')[1];
    const minutesFlag = args.find(a => a.startsWith('--minutes='))?.split('=')[1];
    createDigest({ hoursBack: hoursFlag ? parseInt(hoursFlag) : 48, minutes: minutesFlag ? parseInt(minutesFlag) : 8 })
      .then(r => {
        if (!r) process.exit(0);
        console.log(`\nDone! ${(r.duration / 60).toFixed(1)} min digest`);
        console.log(`  Sources: ${r.sources.join(', ')}`);
        console.log(`  MP3: ${r.mp3}`);
      })
      .catch(err => { console.error('Error:', err.message); process.exit(1); });
  } else if (args[0] === '--cover') {
    const topic = args[1] || 'Cathedral Podcast';
    const speakersFlag = args.find(a => a.startsWith('--speakers='))?.split('=')[1];
    const speakers = speakersFlag ? speakersFlag.split(',') : DEFAULT_SPEAKERS;
    const html = generateCoverHTML(topic, speakers);
    const outPath = join(OUTPUT_DIR, 'cover-latest.html');
    writeFileSync(outPath, html);
    console.log(`Cover HTML: ${outPath}`);
    console.log('Screenshot with: npx puppeteer screenshot cover-latest.html cover.png --width=1200 --height=630');
    process.exit(0);
  } else if (args[0] === '--list') {
    const eps = listEpisodes();
    if (eps.length === 0) { console.log('No episodes yet.'); process.exit(0); }
    for (const ep of eps) {
      console.log(`  ${ep.file} — ${(ep.duration / 60).toFixed(1)} min — ${ep.title || ''}`);
    }
    process.exit(0);
  } else {
  const topic = args.find(a => !a.startsWith('--'));
  const speakersFlag = args.find(a => a.startsWith('--speakers='))?.split('=')[1];
  const minutesFlag = args.find(a => a.startsWith('--minutes='))?.split('=')[1];
  const speakers = speakersFlag ? speakersFlag.split(',') : DEFAULT_SPEAKERS;
  const minutes = minutesFlag ? parseInt(minutesFlag) : 10;

  createPodcast(topic, { speakers, minutes })
    .then(result => {
      console.log(`\nDone! ${(result.duration / 60).toFixed(1)} min podcast`);
      console.log(`  MP3: ${result.mp3}`);
      console.log(`  OGG: ${result.ogg}`);
      console.log(`  Transcript: ${result.transcript}`);
    })
    .catch(err => { console.error('Error:', err.message); process.exit(1); });
  }
}
