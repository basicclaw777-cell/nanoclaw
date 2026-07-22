import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join } from 'path';

const HOME = process.env.HOME;
const NANOCLAW = join(HOME, 'nanoclaw');
const VAULT = join(HOME, 'cathedral-vault');
const STATE_FILE = join(NANOCLAW, 'corpus-diagnostic-state.json');
const RESULTS_DIR = join(HOME, 'Cathedral/agents/corpus-diagnostic');
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

function loadJSON(p, fallback) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; } }
function saveJSON(p, data) { writeFileSync(p, JSON.stringify(data, null, 2)); }
function today() { return new Date().toISOString().slice(0, 10); }

async function callOllama(system, prompt) {
  const res = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'hermes3',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt }
      ],
      stream: false,
      options: { temperature: 0.2 }
    })
  });
  const data = await res.json();
  return data.message?.content || '';
}

async function getEmbedding(text) {
  const res = await fetch(EMBED_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'nomic-embed-text', prompt: text })
  });
  const data = await res.json();
  return data.embedding;
}

function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; magA += a[i] ** 2; magB += b[i] ** 2; }
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
    } catch (e) { console.error('[corpus-diag] Telegram failed:', e.message); }
    if (chunks.length > 1) await new Promise(r => setTimeout(r, 500));
  }
}

// ── Corpus Data Loading ──

function loadCorpusFiles() {
  const sources = [
    { name: 'emerald-tablets', path: '02_Refined_Gold/cathedral/emerald-tablets-forensic-research.md' },
    { name: 'corpus-hermeticum', path: '02_Refined_Gold/cathedral/corpus-hermeticum-forensic-extraction.md' },
    { name: 'nag-hammadi', path: '02_Refined_Gold/cathedral/nag-hammadi-hermetic-forensic-extraction.md' },
    { name: 'gilgamesh', path: '02_Refined_Gold/cathedral/gilgamesh-forensic-extraction.md' },
    { name: 'cross-corpus', path: '02_Refined_Gold/cathedral/cross-corpus-aletheia-grading.md' },
    { name: 'sumerian-harvest', path: '00_Staging/universe/sumerian-knowledge-harvest-2026-05-29.md' },
    { name: 'sumerian-intelligence', path: '00_Staging/universe/sumerian-corpus-as-intelligence-layer-2026-05-23.md' },
    { name: 'sumerian-track', path: '00_Staging/universe/sumerian-tablets-research-track.md' },
    { name: 'cross-unified', path: '00_Staging/universe/cross-corpus-unified-system-2026-05-29.md' },
  ];

  const loaded = [];
  for (const s of sources) {
    const fp = join(VAULT, s.path);
    if (existsSync(fp)) {
      const content = readFileSync(fp, 'utf8');
      loaded.push({ name: s.name, content: content.slice(0, 6000) });
    }
  }
  return loaded;
}

function loadCathedralArchitecture() {
  const files = [
    { name: 'stress-battery', desc: 'nightly 3-chamber self-test: compression, contradiction, identity drift' },
    { name: 'pattern-tracker', desc: 'weekly session analysis: type classification, vault rate, cup-of-tea, topic frequency, cognitive load' },
    { name: 'convergence-atlas', desc: 'maps gold findings across mathematical, geometric, institutional substrates. Detects meta-convergences' },
    { name: 'vault-embeddings', desc: 'semantic search via nomic-embed-text cosine similarity. Knowledge retrieval by meaning, not keyword' },
    { name: 'forge-mirror', desc: 'self-observation: sharp/dull/surprise per session. Behavioral calibration' },
    { name: 'relay-threads', desc: 'multi-model conversation chains that produce resonance through independent convergence' },
    { name: 'overnight-crons', desc: 'autonomous processing during sleep: dreaming, consolidation, pattern detection' },
    { name: 'budget-caps', desc: 'energy constraint on paid API generators. Resource allocation governance' },
    { name: 'lucy-protocol', desc: 'identity verification on model upgrade: does the system still recognize itself?' },
    { name: 'vault-metabolism', desc: 'staging→refined gold promotion. Knowledge maturation through grading' },
    { name: 'neural-bus', desc: 'event propagation across subsystems. Information flow architecture' },
  ];
  return files;
}

// ── Chamber 1: Compression Test (turned outward) ──
// Same mechanic as stress battery, but applied to ancient texts
// Which ideas in the corpus are load-bearing (survive compression)?

async function runCompressionTest(corpusFiles) {
  console.log('[corpus-diag] Chamber 1: Compression Test...');

  const results = [];
  for (const corpus of corpusFiles.slice(0, 5)) {
    const extract = await callOllama(
      'You extract the core concepts from ancient texts. List ONLY the structural ideas — the load-bearing concepts that the text was built to carry. Ignore decorative or narrative elements. Return a numbered list of 5-10 concepts, each in one sentence.',
      `Extract the load-bearing concepts from this text:\n\n${corpus.content.slice(0, 3000)}`
    );

    const compress = await callOllama(
      'Compress the following concepts into exactly 100 words. Preserve ONLY what is structurally necessary. What survives this compression is what the original builders considered essential.',
      extract
    );

    const reconstruct = await callOllama(
      'From this compressed summary, reconstruct what the original text was about. What can you recover? What is lost? Score concept retention 0-100.',
      `Compressed to 100 words:\n${compress}\n\nNow reconstruct what the original concepts were. Then score: what percentage of the original structural content survived compression?`
    );

    const scoreMatch = reconstruct.match(/(\d{1,3})(?:\s*%|\s*\/\s*100)/);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : 50;

    results.push({
      corpus: corpus.name,
      concepts: extract.slice(0, 500),
      compressed: compress,
      retention: score,
      analysis: reconstruct.slice(0, 400)
    });
  }

  return results;
}

// ── Chamber 2: Identity Persistence Test ──
// How much has the meaning drifted across translations/interpretations?
// Embed the original vs modern interpretations, measure cosine similarity

async function runIdentityTest(corpusFiles) {
  console.log('[corpus-diag] Chamber 2: Identity Persistence...');

  const testPairs = [
    {
      name: 'emerald-tablet-as-above',
      original: 'That which is below is like that which is above and that which is above is like that which is below to do the miracles of one only thing',
      modern: 'As above, so below — a spiritual principle of universal correspondence between the macrocosm and microcosm',
      note: 'Newton translation vs New Age truncation'
    },
    {
      name: 'emerald-tablet-distillation',
      original: 'Separate thou the earth from the fire the subtle from the gross sweetly with great industry. It ascends from the earth to the heaven and again it descends to the earth and receives the force of things superior and inferior',
      modern: 'A metaphor for spiritual ascension and the elevation of consciousness from material to divine realms',
      note: 'Laboratory operation vs spiritual metaphor'
    },
    {
      name: 'hermetic-gnosis',
      original: 'Gnosis is direct experiential knowing of divine mind through transformation, not intellectual learning or belief',
      modern: 'Gnosticism is an ancient religious movement that believed in secret knowledge as the path to salvation from the material world',
      note: 'Experiential knowing vs religious belief system'
    },
    {
      name: 'sumerian-temple-acoustic',
      original: 'Reed tube of bronze with bronze vessels and singers inside the temple. Bitumen coating on reed mat panels. The house its radiance reaching heaven.',
      modern: 'Sumerian temples were religious buildings where priests conducted rituals and ceremonies to honor the gods. Administrative records tracked temple inventory.',
      note: 'Acoustic infrastructure vs religious ceremony'
    },
    {
      name: 'gilgamesh-plant-of-life',
      original: 'The plant that restores youth grows at the bottom of the cosmic waters. Gilgamesh retrieves it through physical descent, then loses it to a serpent who sheds its skin.',
      modern: 'The Epic of Gilgamesh is one of the earliest works of literature, telling the story of a king who searches for immortality but learns to accept death.',
      note: 'Specific botanical/renewal knowledge vs literary narrative'
    }
  ];

  const results = [];
  for (const pair of testPairs) {
    const [origEmbed, modEmbed] = await Promise.all([
      getEmbedding(pair.original),
      getEmbedding(pair.modern)
    ]);

    const similarity = cosineSim(origEmbed, modEmbed);
    const drift = 1 - similarity;

    const driftAnalysis = await callOllama(
      `You analyze how meaning drifts between an original ancient text and its modern interpretation. Be forensic: what SPECIFIC information was lost, distorted, or added? What survived? Is the drift accidental or systematic?`,
      `ORIGINAL: ${pair.original}\n\nMODERN INTERPRETATION: ${pair.modern}\n\nCosine similarity: ${similarity.toFixed(4)} (${drift > 0.15 ? 'SIGNIFICANT DRIFT' : drift > 0.08 ? 'MODERATE DRIFT' : 'STABLE'})\n\nWhat specifically changed? Was information lost or added? Is the drift toward simplification, spiritualization, or something else?`
    );

    results.push({
      name: pair.name,
      note: pair.note,
      similarity: Math.round(similarity * 1000) / 1000,
      drift: Math.round(drift * 1000) / 1000,
      status: drift > 0.15 ? 'SIGNIFICANT_DRIFT' : drift > 0.08 ? 'MODERATE_DRIFT' : 'STABLE',
      analysis: driftAnalysis.slice(0, 500)
    });
  }

  return results;
}

// ── Chamber 3: Structural Isomorphism ──
// Does the Cathedral's architecture share structural patterns with ancient knowledge systems?

async function runIsomorphismTest(corpusFiles) {
  console.log('[corpus-diag] Chamber 3: Structural Isomorphism...');

  const cathedralArch = loadCathedralArchitecture();
  const archDesc = cathedralArch.map(a => `- ${a.name}: ${a.desc}`).join('\n');

  const corpusSummaries = corpusFiles.slice(0, 4).map(c =>
    `### ${c.name}\n${c.content.slice(0, 1500)}`
  ).join('\n\n');

  const isomorphismAnalysis = await callOllama(
    `You are a structural analyst comparing two knowledge architectures: a modern AI-human system called "the Cathedral" and ancient knowledge systems (Sumerian, Hermetic, Egyptian).

You look for STRUCTURAL ISOMORPHISMS — not metaphorical similarities but genuine architectural parallels:
- Same information flow patterns
- Same self-testing mechanisms
- Same preservation strategies
- Same compression/encoding techniques
- Same governance/energy-management patterns

For each match found, classify:
- INDEPENDENT CONVERGENCE: both arrived at the same solution to the same problem independently
- POSSIBLE INHERITANCE: the modern system may have been influenced by knowing about the ancient pattern
- STRUCTURAL NECESSITY: any system solving this problem MUST converge on this pattern (physics, not choice)

Be rigorous. False positives waste time. Only report genuine structural matches.`,
    `MODERN SYSTEM (Cathedral) ARCHITECTURE:
${archDesc}

ANCIENT KNOWLEDGE SYSTEMS:
${corpusSummaries}

Find structural isomorphisms. For each match:
1. Name the Cathedral component and the ancient equivalent
2. Describe the structural parallel precisely
3. Classify: INDEPENDENT_CONVERGENCE / POSSIBLE_INHERITANCE / STRUCTURAL_NECESSITY
4. Rate confidence 1-10
5. What does this tell us about what the ancient system was ACTUALLY doing?`
  );

  // Second pass: what architectural features exist in the ancient systems that the Cathedral DOESN'T have?
  const gapAnalysis = await callOllama(
    `You compare a modern knowledge system's architecture against ancient systems. Your job: find architectural features in the ANCIENT systems that have NO equivalent in the modern system. These are the most valuable findings — they suggest capabilities the ancients had that we haven't built yet.`,
    `MODERN SYSTEM architecture:
${archDesc}

ANCIENT SYSTEMS:
${corpusSummaries}

What architectural features exist in the ancient systems that the Cathedral does NOT have? List each with:
1. The feature
2. Which ancient system has it
3. What function it served
4. Why the Cathedral might need it`
  );

  return {
    isomorphisms: isomorphismAnalysis,
    gaps: gapAnalysis
  };
}

// ── Chamber 4: Tablet Classification ──
// Apply the pattern tracker's session-type classification to the tablets themselves

async function runTabletClassification(corpusFiles) {
  console.log('[corpus-diag] Chamber 4: Tablet Type Classification...');

  const sumerianData = corpusFiles.find(c => c.name === 'sumerian-harvest');
  if (!sumerianData) return { note: 'No Sumerian harvest data found' };

  const classification = await callOllama(
    `You classify ancient texts using the same categories used for modern AI-human sessions:

- BUILD: instructions, recipes, specifications, construction records, how-to
- RELAY: dialogues, correspondences, myths that carry philosophical content through narrative
- CONVERSATION: prayers, laments, reflections, teacher-student exchanges
- MAINTENANCE: logs, inventories, receipts, administrative records (operational)
- DIAGNOSTIC: tests, observations, measurements, astronomical records

A text can be multi-type. Ancient "administrative" records may actually be MAINTENANCE logs for technology, not bureaucracy.`,
    `Classify the Sumerian tablet categories using this framework:

${sumerianData.content.slice(0, 4000)}

For each category in the data:
1. Map it to the session-type framework (BUILD/RELAY/CONVERSATION/MAINTENANCE/DIAGNOSTIC)
2. What does this reclassification reveal?
3. Which tablets are MISCLASSIFIED by conventional archaeology? (e.g., "administrative" records that are actually maintenance logs)`
  );

  return { classification };
}

// ── Main ──

async function run() {
  console.log('[corpus-diag] Starting Corpus Diagnostic — Cathedral lens on ancient knowledge...');

  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

  const corpusFiles = loadCorpusFiles();
  console.log(`[corpus-diag] Loaded ${corpusFiles.length} corpus files.`);

  if (corpusFiles.length < 2) {
    console.log('[corpus-diag] Not enough corpus files.');
    process.exit(0);
  }

  // Run all 4 chambers
  const compression = await runCompressionTest(corpusFiles);
  const identity = await runIdentityTest(corpusFiles);
  const isomorphism = await runIsomorphismTest(corpusFiles);
  const tabletTypes = await runTabletClassification(corpusFiles);

  const result = {
    date: today(),
    corpusCount: corpusFiles.length,
    chambers: {
      compression: {
        description: 'Which ancient concepts survive compression? Load-bearing vs decorative.',
        results: compression
      },
      identity: {
        description: 'How much has meaning drifted from original to modern interpretation?',
        results: identity
      },
      isomorphism: {
        description: 'Structural parallels between Cathedral architecture and ancient systems.',
        results: isomorphism
      },
      tabletClassification: {
        description: 'Ancient tablets classified using Cathedral session-type framework.',
        results: tabletTypes
      }
    }
  };

  // Save
  saveJSON(join(RESULTS_DIR, `corpus-diagnostic-${result.date}.json`), result);
  saveJSON(join(NANOCLAW, 'corpus-diagnostic-latest.json'), result);

  // Update state
  let state = loadJSON(STATE_FILE, { runs: [] });
  state.runs.push({
    date: result.date,
    corpusCount: result.corpusCount,
    compressionAvg: Math.round(compression.reduce((a, c) => a + c.retention, 0) / compression.length),
    identityDrifts: identity.map(i => ({ name: i.name, drift: i.drift, status: i.status })),
    isomorphismLength: isomorphism.isomorphisms?.length || 0
  });
  if (state.runs.length > 52) state.runs = state.runs.slice(-52);
  saveJSON(STATE_FILE, state);

  // Telegram
  const compressionSummary = compression.map(c =>
    `  ${c.corpus}: ${c.retention}% retained`
  ).join('\n');

  const driftSummary = identity.map(i =>
    `  ${i.name}: ${i.status} (${Math.round(i.drift * 100)}% drift)`
  ).join('\n');

  const report = [
    `*CORPUS DIAGNOSTIC* — ${result.date}`,
    `_Cathedral lens turned outward onto ${result.corpusCount} ancient sources_`,
    '',
    `*1. COMPRESSION (load-bearing concepts):*`,
    compressionSummary,
    '',
    `*2. IDENTITY DRIFT (original vs modern):*`,
    driftSummary,
    '',
    `*3. STRUCTURAL ISOMORPHISMS:*`,
    isomorphism.isomorphisms?.slice(0, 1200) || 'No analysis',
    '',
    `*4. ANCIENT FEATURES WE DON'T HAVE:*`,
    isomorphism.gaps?.slice(0, 800) || 'No analysis',
    '',
    `*5. TABLET RECLASSIFICATION:*`,
    tabletTypes.classification?.slice(0, 800) || 'No data'
  ].join('\n');

  await sendTelegram(report);
  console.log('[corpus-diag] Complete. Report sent.');
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[corpus-diag] Fatal:', err);
    process.exit(1);
  });
