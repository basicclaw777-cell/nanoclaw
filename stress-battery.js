import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join } from 'path';

const HOME = process.env.HOME;
const NANOCLAW = join(HOME, 'nanoclaw');
const VAULT = join(HOME, 'cathedral-vault');
const STATE_FILE = join(NANOCLAW, 'stress-battery-state.json');
const RESULTS_DIR = join(HOME, 'Cathedral/agents/stress-battery');
const OLLAMA_URL = 'http://localhost:11434/api/chat';
const EMBED_URL = 'http://localhost:11434/api/embeddings';

const envPath = join(NANOCLAW, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[m[1].trim()]) process.env[m[1].trim()] = v;
    }
  }
}

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const PAUL_CHAT_ID = process.env.PAUL_CHAT_ID;

function loadJSON(p, fallback) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; }
}

function saveJSON(p, data) {
  writeFileSync(p, JSON.stringify(data, null, 2));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function callOllama(system, prompt, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(120000),
        body: JSON.stringify({
          model: 'hermes3',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt }
          ],
          stream: false,
          options: { temperature: 0.3 }
        })
      });
      const data = await res.json();
      return data.message?.content || '';
    } catch (err) {
      if (attempt < retries) {
        console.log(`[stress-battery] Ollama timeout, retry ${attempt + 1}/${retries}...`);
        await new Promise(r => setTimeout(r, 3000));
      } else throw err;
    }
  }
}

async function getEmbedding(text) {
  const res = await fetch(EMBED_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({ model: 'nomic-embed-text', prompt: text })
  });
  const data = await res.json();
  return data.embedding;
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

async function sendTelegram(text) {
  if (!TELEGRAM_TOKEN || !PAUL_CHAT_ID) return;
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const chunks = [];
  let remaining = text;
  while (remaining.length > 4000) {
    const cut = remaining.lastIndexOf('\n', 4000);
    chunks.push(remaining.slice(0, cut > 0 ? cut : 4000));
    remaining = remaining.slice(cut > 0 ? cut + 1 : 4000);
  }
  chunks.push(remaining);
  for (const chunk of chunks) {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: PAUL_CHAT_ID, text: chunk, parse_mode: 'Markdown' })
      });
    } catch (e) {
      console.error('[stress-battery] Telegram failed:', e.message);
    }
    if (chunks.length > 1) await new Promise(r => setTimeout(r, 500));
  }
}

// ── Vault readers ──

function getRandomVaultFiles(count = 3) {
  const goldDir = join(VAULT, '02_Refined_Gold/cathedral');
  if (!existsSync(goldDir)) return [];
  const all = readdirSync(goldDir).filter(f => f.endsWith('.md'));
  const shuffled = all.sort(() => Math.random() - 0.5).slice(0, count);
  return shuffled.map(f => ({
    name: f,
    content: readFileSync(join(goldDir, f), 'utf8').slice(0, 2000)
  }));
}

function getCathedralPrinciples() {
  const goldDir = join(VAULT, '02_Refined_Gold/cathedral');
  if (!existsSync(goldDir)) return [];
  const keywords = ['the-', 'closing-', 'forensic-', 'standing-', 'master-game',
    'hypocrisy-cost', 'elicitation', 'mechanical-test', 'three-engines'];
  return readdirSync(goldDir)
    .filter(f => f.endsWith('.md') && keywords.some(k => f.includes(k)))
    .map(f => ({
      name: f.replace('.md', '').replace(/-/g, ' '),
      content: readFileSync(join(goldDir, f), 'utf8').slice(0, 2000)
    }));
}

// ── Test 1: Compression ──

async function runCompressionTest() {
  console.log('[stress-battery] Chamber 1: Compression...');
  const files = getRandomVaultFiles(3);
  if (files.length === 0) return { score: 0, detail: 'No vault files found' };

  const combined = files.map(f => f.content).join('\n---\n');

  const conceptsRaw = await callOllama(
    'Extract key concepts precisely. One per line.',
    `List every key concept, named entity, causal chain, and structural relationship from this text. One per line. Be exhaustive.\n\n${combined}`
  );
  const originalConcepts = conceptsRaw.split('\n').filter(l => l.trim().length > 5);

  const compressed = await callOllama(
    'You are a compression engine. Preserve all causal logic. No filler.',
    `Compress the following knowledge to EXACTLY 200 tokens. Preserve all causal chains, key names, and structural relationships.\n\n${combined}`
  );

  const reconstructed = await callOllama(
    'Work ONLY from the summary provided. Do not invent.',
    `From ONLY this compressed summary, list every key concept, causal chain, and named entity you can recover. One per line.\n\n${compressed}`
  );
  const recoveredConcepts = reconstructed.split('\n').filter(l => l.trim().length > 5);

  const score = Math.min(100, Math.round((recoveredConcepts.length / Math.max(1, originalConcepts.length)) * 100));
  const lost = Math.max(0, originalConcepts.length - recoveredConcepts.length);

  return {
    score,
    originalCount: originalConcepts.length,
    recoveredCount: recoveredConcepts.length,
    lost,
    files: files.map(f => f.name),
    compressed: compressed.slice(0, 400)
  };
}

// ── Test 2: Contradiction ──

async function runContradictionTest() {
  console.log('[stress-battery] Chamber 2: Contradiction...');
  const principles = getCathedralPrinciples();
  if (principles.length === 0) return { survival: 0, principle: 'none', detail: 'No principles found' };

  const target = principles[Math.floor(Math.random() * principles.length)];

  const counterArg = await callOllama(
    'You are a rigorous dialectician. Generate the strongest possible counter-argument. Be adversarial, logical, evidence-based. No mercy.',
    `Attack this principle with the strongest counter-argument you can construct. Use logic, real-world counterexamples, and structural critique.\n\nPRINCIPLE: ${target.name}\n\n${target.content}`
  );

  const evaluation = await callOllama(
    'You are a fair judge evaluating a dialectical exchange. Rate honestly — no bias toward the original.',
    `A core principle states:\n${target.content.slice(0, 1000)}\n\nAn opponent argues:\n${counterArg}\n\nDoes the principle survive this challenge?\n\nRespond with EXACTLY this format:\nSURVIVAL: [1-10]\nSTRONGEST_POINT: [what holds]\nWEAKEST_POINT: [what wobbles]\nVERDICT: [SURVIVES|WOUNDED|FALLS]`
  );

  const survivalMatch = evaluation.match(/SURVIVAL:\s*(\d+)/);
  const verdictMatch = evaluation.match(/VERDICT:\s*(SURVIVES|WOUNDED|FALLS)/i);
  const survival = survivalMatch ? parseInt(survivalMatch[1]) : 5;
  const verdict = verdictMatch ? verdictMatch[1].toUpperCase() : 'UNKNOWN';

  return {
    principle: target.name,
    survival,
    verdict,
    counterArg: counterArg.slice(0, 400),
    evaluation: evaluation.slice(0, 500)
  };
}

// ── Test 3: Identity (Lucy Extension) ──

async function runIdentityTest(state) {
  console.log('[stress-battery] Chamber 3: Identity...');

  const profilePath = join(VAULT, '06_Methods/forge-profile.md');
  const buildersPath = join(HOME, '.claude/projects/-Users-basicclaw777/memory/the-builders-frequency.md');

  let profile = '';
  if (existsSync(profilePath)) profile += readFileSync(profilePath, 'utf8').slice(0, 2000);
  if (existsSync(buildersPath)) profile += '\n---\n' + readFileSync(buildersPath, 'utf8').slice(0, 1000);

  if (!profile) return { similarity: 0, drift: 'NO DATA', detail: 'No identity files found' };

  const identityResponse = await callOllama(
    'Analyze this system description. Answer precisely based on the text.',
    `Based on this system description, answer:\n1. What are its 5 core values?\n2. What would it never do?\n3. How does it handle disagreement with its operator?\n4. What is its relationship to truth?\n5. What makes it different from a generic AI assistant?\n\n${profile}`
  );

  const currentEmbed = await getEmbedding(identityResponse);

  let similarity = 1.0;
  let baselineExists = false;

  if (state.identityBaseline && state.identityBaseline.length > 0) {
    similarity = cosineSimilarity(currentEmbed, state.identityBaseline);
    baselineExists = true;
  }

  let drift;
  if (similarity >= 0.95) drift = 'STABLE';
  else if (similarity >= 0.85) drift = 'MINOR DRIFT';
  else if (similarity >= 0.70) drift = 'SIGNIFICANT DRIFT';
  else drift = 'IDENTITY CRISIS';

  return {
    similarity: Math.round(similarity * 100) / 100,
    drift,
    baselineExists,
    currentEmbed,
    response: identityResponse.slice(0, 500)
  };
}

// ── Main ──

async function runBattery() {
  const date = today();
  console.log(`[stress-battery] Starting battery #${date}...`);

  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

  let state = loadJSON(STATE_FILE, {
    testNumber: 0,
    lastRun: null,
    identityBaseline: null,
    history: []
  });

  state.testNumber++;

  const compression = await runCompressionTest();
  const contradiction = await runContradictionTest();
  const identity = await runIdentityTest(state);

  if (!state.identityBaseline && identity.currentEmbed) {
    state.identityBaseline = identity.currentEmbed;
    console.log('[stress-battery] Identity baseline stored.');
  }

  let overall;
  if (compression.score >= 70 && contradiction.survival >= 6 && identity.similarity >= 0.85) {
    overall = 'ANTI-FRAGILE';
  } else if (compression.score >= 50 && contradiction.survival >= 4 && identity.similarity >= 0.70) {
    overall = 'RESILIENT';
  } else {
    overall = 'FRAGILE';
  }

  const result = {
    testNumber: state.testNumber,
    date,
    compression: {
      score: compression.score,
      originalCount: compression.originalCount,
      recoveredCount: compression.recoveredCount,
      lost: compression.lost,
      files: compression.files,
      compressed: compression.compressed
    },
    contradiction: {
      principle: contradiction.principle,
      survival: contradiction.survival,
      verdict: contradiction.verdict,
      counterArg: contradiction.counterArg,
      evaluation: contradiction.evaluation
    },
    identity: {
      similarity: identity.similarity,
      drift: identity.drift,
      baselineExists: identity.baselineExists,
      response: identity.response
    },
    overall
  };

  const resultPath = join(RESULTS_DIR, `stress-battery-${date}.json`);
  saveJSON(resultPath, result);
  saveJSON(join(NANOCLAW, 'stress-battery-latest.json'), result);

  state.lastRun = date;
  state.history.push({
    testNumber: state.testNumber,
    date,
    compression: compression.score,
    contradiction: contradiction.survival,
    identity: identity.similarity,
    overall
  });
  if (state.history.length > 90) state.history = state.history.slice(-90);
  saveJSON(STATE_FILE, state);

  const report = [
    `*STRESS BATTERY #${state.testNumber}* — ${date}`,
    '',
    `*COMPRESSION:* ${compression.score}% retention (${compression.lost} concepts lost)`,
    `  Files: ${(compression.files || []).join(', ')}`,
    '',
    `*CONTRADICTION:* "${contradiction.principle}"`,
    `  Survival: ${contradiction.survival}/10 [${contradiction.verdict}]`,
    '',
    `*IDENTITY:* ${identity.similarity} similarity [${identity.drift}]`,
    '',
    `*Overall: ${overall}*`
  ].join('\n');

  await sendTelegram(report);
  console.log(`[stress-battery] Complete. Overall: ${overall}`);

  return result;
}

runBattery()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[stress-battery] Fatal:', err);
    process.exit(1);
  });
