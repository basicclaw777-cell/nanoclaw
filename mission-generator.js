// mission-generator.js — Resonance Engine Loop 2: Curriculum → Hexad Mission
// ESM module. Runs the 7-step Transformation Pipeline via hermes3.
//
// Usage:
//   node mission-generator.js "Fractions" --band cadets
//   node mission-generator.js "Photosynthesis" --band cadets --dry-run
//   node mission-generator.js --batch topics.json
//
// Output: mission worksheet saved to ~/basic-reflex/aether-universe/missions/

import fs from 'fs';
import path from 'path';

const HOME = process.env.HOME;
const PROMPT_PATH = path.join(HOME, 'nanoclaw', 'prompts', 'mission-generator.txt');
const OUTPUT_DIR = path.join(HOME, 'basic-reflex', 'aether-universe', 'missions');
const LOG_PATH = path.join(OUTPUT_DIR, 'generation-log.json');
const OLLAMA_URL = 'http://localhost:11434/api/generate';
const MODEL = 'hermes3';

const VALID_BANDS = ['sprouts', 'cadets', 'masters'];

const OPERATIONS = ['ORGANIZE', 'OBSERVE & DETECT', 'OPTIMIZE', 'STRUCTURE', 'SEQUENCE', 'CONNECT'];
const CHARACTERS = ['Vora', 'Hum', 'Sparky', 'Hex', 'Tempo', 'Aria'];

function loadPromptTemplate() {
  return fs.readFileSync(PROMPT_PATH, 'utf8');
}

function buildPrompt(concept, band) {
  let template = loadPromptTemplate();
  template = template.replace('{{CONCEPT}}', concept);
  template = template.replace('{{BAND}}', band.charAt(0).toUpperCase() + band.slice(1));
  return template;
}

async function callHermes(prompt) {
  const body = {
    model: MODEL,
    prompt,
    stream: false,
    options: {
      temperature: 0.7,
      num_predict: 4096,
      top_p: 0.9
    }
  };

  const res = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return data.response;
}

function extractSelfEvaluation(response) {
  const evalMatch = response.match(/SELF-EVALUATION[\s\S]*$/i);
  if (!evalMatch) return { passed: true, raw: 'No self-evaluation found' };

  const evalText = evalMatch[0];
  const failures = [];

  const checks = [
    { label: 'Golden Rule', pattern: /Golden Rule.*?:\s*(no|fail)/i },
    { label: 'Trojan Horse', pattern: /Trojan Horse.*?:\s*(no|fail|leak)/i },
    { label: 'Mechanical Test', pattern: /Mechanical Test.*?:\s*(no|fail)/i },
    { label: 'Observable Layer', pattern: /Observable Layer.*?:\s*(no|fail|dirty)/i }
  ];

  for (const check of checks) {
    if (check.pattern.test(evalText)) {
      failures.push(check.label);
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    raw: evalText
  };
}

function extractMissionId(response, concept, band) {
  const match = response.match(/MISSION WORKSHEET\s*\[id:\s*([^\]]+)\]/i);
  const raw = match ? match[1].trim() : null;
  if (raw && !raw.includes('CHAR-OP-CONCEPT')) return raw;
  return `${slugify(concept)}-${band}-v1`;
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function logGeneration(entry) {
  let log = [];
  try { log = JSON.parse(fs.readFileSync(LOG_PATH, 'utf8')); } catch {}
  log.push(entry);
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
}

async function generateMission(concept, band, dryRun = false) {
  console.log(`\n--- MISSION GENERATOR ---`);
  console.log(`Concept: ${concept}`);
  console.log(`Band: ${band}`);
  console.log(`Model: ${MODEL}`);
  console.log(`---\n`);

  const prompt = buildPrompt(concept, band);

  if (dryRun) {
    console.log('DRY RUN — prompt built, not sending to model.');
    console.log(`Prompt length: ${prompt.length} chars`);
    return null;
  }

  console.log('Sending to hermes3...');
  const startTime = Date.now();
  const response = await callHermes(prompt);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Response received in ${elapsed}s (${response.length} chars)\n`);

  const evaluation = extractSelfEvaluation(response);
  const missionId = extractMissionId(response, concept, band);

  const filename = `${missionId}.md`;
  const outputPath = path.join(OUTPUT_DIR, filename);

  const header = [
    `# Mission: ${concept}`,
    ``,
    `> Generated: ${new Date().toISOString()}`,
    `> Band: ${band}`,
    `> Model: ${MODEL}`,
    `> Self-eval: ${evaluation.passed ? 'PASSED' : 'FAILED — ' + evaluation.failures.join(', ')}`,
    `> Status: [AI]-drafted, awaiting Paul's review`,
    ``,
    `---`,
    ``
  ].join('\n');

  const content = header + response;

  if (!evaluation.passed) {
    console.log(`⚠ SELF-EVALUATION FAILED: ${evaluation.failures.join(', ')}`);
    console.log('Mission saved with failure flag — needs pipeline refinement.\n');
  } else {
    console.log('✓ Self-evaluation passed.\n');
  }

  fs.writeFileSync(outputPath, content);
  console.log(`Saved: ${outputPath}`);

  const logEntry = {
    id: missionId,
    concept,
    band,
    model: MODEL,
    timestamp: new Date().toISOString(),
    elapsed_seconds: parseFloat(elapsed),
    response_chars: response.length,
    self_eval_passed: evaluation.passed,
    self_eval_failures: evaluation.failures,
    file: filename
  };
  logGeneration(logEntry);
  console.log('Logged to generation-log.json\n');

  return { missionId, outputPath, evaluation, response };
}

async function runBatch(batchPath) {
  const topics = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
  console.log(`Batch mode: ${topics.length} topics\n`);

  const results = [];
  for (const topic of topics) {
    const { concept, band = 'cadets' } = topic;
    try {
      const result = await generateMission(concept, band);
      results.push({ concept, band, status: 'ok', id: result?.missionId });
    } catch (err) {
      console.error(`FAILED: ${concept} — ${err.message}`);
      results.push({ concept, band, status: 'error', error: err.message });
    }
  }

  console.log('\n=== BATCH SUMMARY ===');
  for (const r of results) {
    const icon = r.status === 'ok' ? '✓' : '✗';
    console.log(`${icon} ${r.concept} (${r.band}) — ${r.id || r.error}`);
  }
  return results;
}

// --- CLI ---
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Usage:');
  console.log('  node mission-generator.js "Fractions" --band cadets');
  console.log('  node mission-generator.js "Fractions" --band cadets --dry-run');
  console.log('  node mission-generator.js --batch topics.json');
  process.exit(0);
}

if (args.includes('--batch')) {
  const batchIdx = args.indexOf('--batch');
  const batchPath = args[batchIdx + 1];
  if (!batchPath) { console.error('--batch requires a path'); process.exit(1); }
  runBatch(batchPath).catch(err => { console.error(err); process.exit(1); });
} else {
  const concept = args[0];
  const bandIdx = args.indexOf('--band');
  const band = bandIdx !== -1 ? args[bandIdx + 1] : 'cadets';
  const dryRun = args.includes('--dry-run');

  if (!VALID_BANDS.includes(band)) {
    console.error(`Invalid band: ${band}. Valid: ${VALID_BANDS.join(', ')}`);
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  generateMission(concept, band, dryRun).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
