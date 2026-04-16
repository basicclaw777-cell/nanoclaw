#!/usr/bin/env node
// ~/nanoclaw/cognitive-scanner.js
// Watches session harvests, scans for cognitive patterns, updates profile + graph.
// PM2: pm2 start ~/nanoclaw/cognitive-scanner.js --name cognitive-scanner

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { createRequire } from 'module';
const _require = createRequire(join(process.env.HOME, 'nanoclaw', 'package.json'));
const chokidar = _require('chokidar');
import dotenv from 'dotenv';
dotenv.config({ path: join(process.env.HOME, 'nanoclaw', '.env') });

const HOME = process.env.HOME;
const HARVEST_DIR = join(HOME, 'cathedral-vault', '00_Staging', 'cathedral');
const PROFILE_PATH = join(HOME, 'cathedral-vault', '06_Methods', 'pauls-investigator-profile.md');
const GRAPH_PATH = join(HOME, 'cathedral-vault', '09_Artifacts', 'paul-cognitive-graph.html');
const OLLAMA_URL = 'http://localhost:11434';
const MODEL = 'qwen3:14b';

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const PAUL_CHAT_ID = process.env.PAUL_CHAT_ID;

// ── Known patterns ──────────────────────────────────────────────────────────

const PATTERNS = [
  'Replace not patch',
  'Governing field first',
  'The Third Frame',
  'Recursive Turn',
  'Parallelisation Instinct',
  'Trade-off check at gate',
  'Compression through concrete image',
  'Cross-domain bridge-building',
  'Reflexive rigour',
  'Instrument-Turner',
  'Naming at crystallisation',
  'Container Creation',
];

const SCAN_PROMPT = `You are observing Paul's cognitive patterns.
Read this session summary. Did it contain any observable instance of these patterns?

${PATTERNS.map((p, i) => `${i + 1}. ${p}`).join('\n')}

Pattern definitions:
- Replace not patch: discards and rebuilds rather than incrementally fixing
- Governing field first: sets up system/framework before producing content
- The Third Frame: finds option C when offered binary A/B choice
- Recursive Turn: turns tools/systems on themselves for meta-insight
- Parallelisation Instinct: identifies independent tracks and runs them simultaneously
- Trade-off check at gate: asks "what do we lose?" before committing
- Compression through concrete image: compresses complex ideas into vivid metaphors
- Cross-domain bridge-building: connects insights across unrelated fields
- Reflexive rigour: applies critical standards to own thinking, not just external claims
- Instrument-Turner: turns the lens on the instrument itself
- Naming at crystallisation: names things at exact moment they become load-bearing
- Container Creation: creates epistemic containers that set quality floors

If yes, return JSON:
{
  "pattern_found": true,
  "pattern_name": "exact name from list",
  "layer": "Navigation/Decision/Creation/Bottleneck",
  "observation": "what happened, 2-3 sentences max",
  "pattern_match": "which existing profile entry this connects to",
  "confidence": "one-instance/recurring/confirmed",
  "project": "which project this came from"
}

If multiple patterns found, return an array of such objects.
If no clear pattern observed, return: {"pattern_found": false}
Only flag genuine observations. No speculation. Return ONLY JSON.`;

// ── Ollama ──────────────────────────────────────────────────────────────────

async function queryOllama(system, prompt) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt }
      ],
      stream: false,
      format: 'json'
    })
  });
  const data = await res.json();
  return data.message?.content || '';
}

// ── Telegram ────────────────────────────────────────────────────────────────

async function sendTelegram(text) {
  if (!TELEGRAM_TOKEN || !PAUL_CHAT_ID) {
    console.log('[cognitive-scanner] No Telegram credentials, skipping notification');
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: PAUL_CHAT_ID,
        text,
        parse_mode: 'Markdown'
      })
    });
  } catch (e) {
    console.error('[cognitive-scanner] Telegram error:', e.message);
  }
}

// ── Append to profile ───────────────────────────────────────────────────────

function appendToProfile(finding, date, harvestFile) {
  if (!existsSync(PROFILE_PATH)) {
    console.error('[cognitive-scanner] Profile not found:', PROFILE_PATH);
    return;
  }

  let content = readFileSync(PROFILE_PATH, 'utf8');

  const entry = `
## ${date} — ${finding.project} — ${finding.pattern_name}
Layer: ${finding.layer}
Observation: ${finding.observation}
Pattern match: ${finding.pattern_match || 'new observation'}
Confidence: ${finding.confidence}
Source: ${basename(harvestFile)} (auto-scanned)
`;

  // Insert before "# Cross-Project Pattern Summary" if it exists,
  // otherwise append at end
  const summaryMarker = '# Cross-Project Pattern Summary';
  const summaryIdx = content.indexOf(summaryMarker);
  if (summaryIdx > 0) {
    content = content.slice(0, summaryIdx) + entry + '\n---\n\n' + content.slice(summaryIdx);
  } else {
    content += '\n' + entry;
  }

  // Update "Last updated" line
  content = content.replace(/Last updated: .+/, `Last updated: ${date}`);

  writeFileSync(PROFILE_PATH, content);
  console.log(`[cognitive-scanner] Appended to profile: ${finding.pattern_name}`);
}

// ── Update graph HTML ───────────────────────────────────────────────────────

function updateGraph(finding, date) {
  if (!existsSync(GRAPH_PATH)) {
    console.log('[cognitive-scanner] Graph not found, skipping');
    return;
  }

  let html = readFileSync(GRAPH_PATH, 'utf8');

  // Map pattern names to IDs
  const patternIdMap = {
    'Replace not patch': 'p1',
    'Governing field first': 'p2',
    'The Third Frame': 'p3',
    'Recursive Turn': 'p4',
    'Parallelisation Instinct': 'p5',
    'Trade-off check at gate': 'p6',
    'Container Creation': 's1',
    'Naming at crystallisation': 's2',
    'The Sequence Check': 's3',
    'Straw and Pattern': 's4',
    'Compression through concrete image': 'sk1',
    'Cross-domain bridge-building': 'sk2',
    'Reflexive rigour': 'sk3',
    'Instrument-Turner': 'sk4',
  };

  const projectIdMap = {
    'Universe': 'pr1',
    'Cathedral': 'pr2',
    'BR Ops': 'pr3', 'BR Operations': 'pr3',
    'Map Room': 'pr4',
    'Head Orc': 'pr5', 'Head Orchestrator': 'pr5',
  };

  const patternId = patternIdMap[finding.pattern_name];
  const projectId = projectIdMap[finding.project];
  if (!patternId || !projectId) {
    console.log(`[cognitive-scanner] Unknown pattern/project mapping: ${finding.pattern_name} / ${finding.project}`);
    return;
  }

  // Determine if this is a pattern or skill
  const isSkill = patternId.startsWith('sk');
  const patterns = isSkill ? [] : [patternId];
  const skills = isSkill ? [patternId] : [];

  // Count existing observations to generate unique ID
  const obsCount = (html.match(/{ id: 'o/g) || []).length;
  const newId = `o${obsCount + 1}`;

  // Escape observation text for JS string
  const escapedTitle = finding.pattern_name.replace(/'/g, "\\'");
  const escapedText = finding.observation.replace(/'/g, "\\'").replace(/\n/g, ' ');

  const newObs = `  { id: '${newId}', date: '${date}', project: '${projectId}', patterns: [${patterns.map(p => `'${p}'`).join(', ')}], skills: [${skills.map(s => `'${s}'`).join(', ')}],
    title: '${escapedTitle}',
    text: '${escapedText}',
    confidence: '${finding.confidence}', layer: '${finding.layer}' },`;

  // Insert before the closing bracket of OBSERVATIONS array
  const marker = '];\n\n// ── COLORS';
  const insertIdx = html.indexOf(marker);
  if (insertIdx > 0) {
    html = html.slice(0, insertIdx) + newObs + '\n' + html.slice(insertIdx);
    console.log(`[cognitive-scanner] Added observation ${newId} to graph`);
  } else {
    console.log('[cognitive-scanner] Could not find OBSERVATIONS insertion point');
    return;
  }

  // Update footer stats
  const footerMatch = html.match(/Last updated: [\d-]+ · (\d+) observations · (\d+) projects · (\d+) confirmed/);
  if (footerMatch) {
    const newCount = parseInt(footerMatch[1]) + 1;
    html = html.replace(
      /Last updated: [\d-]+ · \d+ observations/,
      `Last updated: ${date} · ${newCount} observations`
    );
  }

  writeFileSync(GRAPH_PATH, html);
}

// ── Process a harvest ───────────────────────────────────────────────────────

async function processHarvest(filepath) {
  const filename = basename(filepath);
  console.log(`[cognitive-scanner] Scanning: ${filename}`);

  const content = readFileSync(filepath, 'utf8');

  // Skip very short files
  if (content.length < 200) {
    console.log(`[cognitive-scanner] Too short, skipping: ${filename}`);
    return;
  }

  let rawResult;
  try {
    rawResult = await queryOllama(SCAN_PROMPT, `Session harvest to scan:\n\n${content.slice(0, 4000)}`);
  } catch (e) {
    console.error(`[cognitive-scanner] Ollama error: ${e.message}`);
    return;
  }

  let findings;
  try {
    const parsed = JSON.parse(rawResult);
    // Normalize to array
    if (Array.isArray(parsed)) {
      findings = parsed.filter(f => f.pattern_found);
    } else if (parsed.pattern_found) {
      findings = [parsed];
    } else {
      console.log(`[cognitive-scanner] No patterns found in ${filename}`);
      return;
    }
  } catch (_) {
    // Try to extract JSON from response
    const jsonMatch = rawResult.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.pattern_found) {
          findings = [parsed];
        } else {
          console.log(`[cognitive-scanner] No patterns found in ${filename}`);
          return;
        }
      } catch (_2) {
        console.error(`[cognitive-scanner] Could not parse response for ${filename}`);
        return;
      }
    } else {
      console.error(`[cognitive-scanner] No JSON in response for ${filename}`);
      return;
    }
  }

  // Validate each finding
  const validFindings = findings.filter(f => {
    if (!f.pattern_name || !f.observation || !f.layer || !f.confidence) return false;
    // Must be a known pattern
    const known = PATTERNS.some(p => p.toLowerCase() === f.pattern_name.toLowerCase());
    if (!known) {
      console.log(`[cognitive-scanner] Unknown pattern "${f.pattern_name}", skipping`);
      return false;
    }
    return true;
  });

  if (validFindings.length === 0) {
    console.log(`[cognitive-scanner] No valid findings in ${filename}`);
    return;
  }

  const date = new Date().toISOString().slice(0, 10);

  for (const finding of validFindings) {
    // Normalize pattern name to exact match from our list
    finding.pattern_name = PATTERNS.find(p =>
      p.toLowerCase() === finding.pattern_name.toLowerCase()
    ) || finding.pattern_name;

    console.log(`[cognitive-scanner] Found: ${finding.pattern_name} (${finding.confidence})`);

    // Append to profile
    try {
      appendToProfile(finding, date, filepath);
    } catch (e) {
      console.error(`[cognitive-scanner] Profile append error: ${e.message}`);
    }

    // Update graph
    try {
      updateGraph(finding, date);
    } catch (e) {
      console.error(`[cognitive-scanner] Graph update error: ${e.message}`);
    }

    // Telegram notification
    const firstSentence = finding.observation.split('.')[0] + '.';
    await sendTelegram(
      `🧠 *PATTERN LOGGED*\n${finding.pattern_name} · ${finding.project || 'unknown'} · ${finding.confidence}\n${firstSentence}\nProfile: \`06_Methods/pauls-investigator-profile.md\``
    );
  }

  console.log(`[cognitive-scanner] Processed ${validFindings.length} pattern(s) from ${filename}`);
}

// ── File watcher ────────────────────────────────────────────────────────────

function startWatcher() {
  console.log(`[cognitive-scanner] Watching ${HARVEST_DIR}`);

  const watcher = chokidar.watch(`${HARVEST_DIR}/session-harvest-*.md`, {
    ignoreInitial: true,
    persistent: true,
    usePolling: true,
    interval: 3000,
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 500 }
  });

  watcher.on('error', (err) => {
    console.error('[cognitive-scanner] Watcher error (non-fatal):', err.message);
  });

  const processing = new Set();

  watcher.on('add', async (filepath) => {
    if (processing.has(filepath)) return;
    processing.add(filepath);
    try {
      // Small delay to let file settle
      await new Promise(r => setTimeout(r, 3000));
      await processHarvest(filepath);
    } catch (e) {
      console.error(`[cognitive-scanner] Error: ${e.message}`);
    } finally {
      processing.delete(filepath);
    }
  });

  console.log('[cognitive-scanner] The pattern accumulates.');
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[cognitive-scanner] Starting at ${new Date().toISOString()}`);
  startWatcher();
}

main().catch(e => {
  console.error('[cognitive-scanner] Fatal:', e.message);
  process.exit(1);
});
