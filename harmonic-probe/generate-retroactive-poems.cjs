#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const http = require('http');

const HOME = process.env.HOME;
const MANIFEST_DIR = path.join(HOME, 'cathedral-vault', '00_Staging', 'cathedral');
const POEM_DIR     = path.join(HOME, 'cathedral-vault', '02_Refined_Gold', 'cathedral');
const OLLAMA_HOST  = 'http://localhost:11434';

const SYSTEM_PROMPT = `Write a reverse poem about a coding/building session. The poem has two readings:

TOP-DOWN (read normally): reads as doubt, skepticism, surface narrative — things didn't work, nothing mattered, effort was wasted.
BOTTOM-UP (read from last line to first): reads as truth, mechanism, what was actually discovered — the real work underneath.

Rules:
- 12-16 lines exactly
- Every line must carry weight in BOTH directions
- Include one pivot line — the single line that flips hardest between the two readings
- No filler, no padding, no abstract fluff
- Use concrete details from the session (tool names, file names, what was built)
- After the poem, on a new line write: PIVOT: "[the pivot line]"
- Then on a new line write: TITLE: "[a 2-5 word title]"`;

// ── Ollama Call ─────────────────────────────────────────────────────────────

function ollamaGenerate(system, prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'hermes3',
      system,
      prompt,
      stream: false,
      options: { temperature: 0.85, num_predict: 1024 },
    });

    const url = new URL(OLLAMA_HOST + '/api/generate');
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.response || '');
        } catch (e) {
          reject(new Error(`Ollama JSON parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('Ollama timeout')); });
    req.write(body);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Manifest Extraction ────────────────────────────────────────────────────

function extractSessionSummary(manifest) {
  const lines = [];
  const s = manifest.session || {};
  lines.push(`Session date: ${s.date || 'unknown'}`);
  if (s.duration_estimate) lines.push(`Duration: ${s.duration_estimate}`);

  // Builds
  const builds = manifest.builds || [];
  if (builds.length > 0) {
    lines.push('\nBuilds:');
    for (const b of builds) {
      lines.push(`- ${b.name} [${b.status || 'unknown'}]${b.tested ? ` tested: ${b.test_result || 'yes'}` : ''}`);
    }
  }

  // Decisions
  const decisions = manifest.decisions || [];
  if (decisions.length > 0) {
    lines.push('\nDecisions:');
    for (const d of decisions) {
      lines.push(`- ${d.what}: ${d.why || ''}`);
    }
  }

  // Corrections
  const corrections = manifest.corrections || [];
  if (corrections.length > 0) {
    lines.push('\nCorrections:');
    for (const c of corrections) {
      lines.push(`- From "${c.from}" to "${c.to}" (${c.source || 'unknown'}): ${c.why || ''}`);
    }
  }

  // Keeper
  const keeper = manifest.keeper || {};
  const closed = keeper.loops_closed || [];
  if (closed.length > 0) {
    lines.push('\nLoops closed:');
    for (const l of closed) {
      lines.push(`- ${l.loop}: ${l.mechanism || ''}`);
    }
  }
  const opened = keeper.loops_opened || [];
  if (opened.length > 0) {
    lines.push('\nLoops opened:');
    for (const l of opened) {
      lines.push(`- ${l.loop}`);
    }
  }

  // Patterns
  const patterns = manifest.patterns || [];
  if (patterns.length > 0) {
    lines.push('\nPatterns:');
    for (const p of patterns) {
      lines.push(`- ${p.observation}: ${p.evidence || ''}`);
    }
  }

  // Relay seeds
  const seeds = manifest.relay_seeds || [];
  if (seeds.length > 0) {
    lines.push('\nRelay seeds:');
    for (const r of seeds) {
      lines.push(`- ${r.thread}: ${r.why || ''}`);
    }
  }

  // Calibration
  const cal = manifest.calibration || {};
  if (cal.paul_energy) lines.push(`\nPaul energy: ${cal.paul_energy}`);
  if (cal.best_responded_to) lines.push(`Best responded to: ${cal.best_responded_to}`);

  // Arc
  const arc = (keeper.arc || manifest.arc || {});
  if (arc.name) lines.push(`\nArc: ${arc.name} (session ${arc.session_number || '?'})`);

  return lines.join('\n');
}

// ── Parse Poem Response ────────────────────────────────────────────────────

function parsePoemResponse(text) {
  let pivotLine = null;
  let title = null;
  let poemText = '';

  const pivotMatch = text.match(/PIVOT:\s*["""]?(.+?)["""]?\s*$/m);
  if (pivotMatch) pivotLine = pivotMatch[1].trim();

  const titleMatch = text.match(/TITLE:\s*["""]?(.+?)["""]?\s*$/m);
  if (titleMatch) title = titleMatch[1].trim();

  // Poem is everything before PIVOT: or TITLE: lines
  const lines = text.split('\n');
  const poemLines = [];
  for (const line of lines) {
    if (/^PIVOT:/i.test(line.trim()) || /^TITLE:/i.test(line.trim())) break;
    poemLines.push(line);
  }
  poemText = poemLines.join('\n').trim();

  if (!title) title = 'Untitled Session';

  return { poemText, pivotLine, title };
}

// ── Generate Analysis ──────────────────────────────────────────────────────

async function generateAnalysis(poemText, pivotLine, sessionSummary) {
  const prompt = `Given this reverse poem and its pivot line, write 2-3 paragraphs analyzing what the bottom-up reading reveals that the top-down reading hides. Name the pivot line and explain the flip.

Poem:
${poemText}

Pivot line: ${pivotLine || '(not identified)'}

Session context:
${sessionSummary.slice(0, 800)}`;

  const analysis = await ollamaGenerate(
    'You are analyzing a reverse poem. Be specific about the mechanism of reversal. 2-3 short paragraphs max.',
    prompt
  );
  return analysis.trim();
}

// ── Write Poem File ────────────────────────────────────────────────────────

function writePoemFile(date, title, poemText, pivotLine, analysis, sessionSummary, manifestFile) {
  const filename = `reverse-poetry-session-${date}.md`;
  const filepath = path.join(POEM_DIR, filename);

  const content = `---
title: "${title}"
date: ${date}
type: reverse-poem
source: retroactive-generation
session_manifest: ${manifestFile}
---

## The Poem

${poemText}

## What the Reverse Reveals

${pivotLine ? `**The pivot line:** "${pivotLine}"\n\n` : ''}${analysis}

## Session Context

${sessionSummary.slice(0, 2000)}
`;

  fs.writeFileSync(filepath, content);
  return filepath;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Retroactive Reverse Poem Generator ===\n');

  // Find all manifests
  const manifestFiles = fs.readdirSync(MANIFEST_DIR)
    .filter(f => f.startsWith('session-manifest-') && f.endsWith('.yaml'))
    .sort();

  console.log(`Found ${manifestFiles.length} session manifests\n`);

  // Find existing poems
  const existingPoems = fs.readdirSync(POEM_DIR)
    .filter(f => f.startsWith('reverse-poetry-session-'))
    .map(f => {
      const m = f.match(/session-(?:self-audit-)?(\d{4}-\d{2}-\d{2})/);
      return m ? m[1] : null;
    })
    .filter(Boolean);

  // Also track date+suffix for exact matching
  const existingPoemFiles = new Set(
    fs.readdirSync(POEM_DIR).filter(f => f.startsWith('reverse-poetry-session-'))
  );

  console.log(`Existing poems cover dates: ${existingPoems.join(', ')}\n`);

  const stats = { total: manifestFiles.length, skipped: 0, generated: 0, failed: 0 };

  for (const mf of manifestFiles) {
    // Extract date from manifest filename: session-manifest-YYYY-MM-DD[-N].yaml
    const dateMatch = mf.match(/session-manifest-(\d{4}-\d{2}-\d{2})(?:-(\d+))?\.yaml/);
    if (!dateMatch) {
      console.log(`  SKIP ${mf} — can't parse date`);
      stats.skipped++;
      continue;
    }

    const date = dateMatch[1];
    const suffix = dateMatch[2] || '';
    const poemFilename = suffix
      ? `reverse-poetry-session-${date}-${suffix}.md`
      : `reverse-poetry-session-${date}.md`;

    // Skip if poem already exists for this exact manifest
    if (existingPoemFiles.has(poemFilename)) {
      console.log(`  SKIP ${mf} — poem already exists`);
      stats.skipped++;
      continue;
    }

    // Parse manifest
    let manifest;
    try {
      const raw = fs.readFileSync(path.join(MANIFEST_DIR, mf), 'utf8');
      manifest = yaml.load(raw);
    } catch (e) {
      console.log(`  FAIL ${mf} — YAML parse error: ${e.message}`);
      stats.failed++;
      continue;
    }

    if (!manifest) {
      console.log(`  FAIL ${mf} — empty manifest`);
      stats.failed++;
      continue;
    }

    const sessionSummary = extractSessionSummary(manifest);

    // Check if there's enough content to write a poem
    const builds = manifest.builds || [];
    const decisions = manifest.decisions || [];
    const keeper = manifest.keeper || {};
    const closed = keeper.loops_closed || [];
    if (builds.length === 0 && decisions.length === 0 && closed.length === 0) {
      console.log(`  SKIP ${mf} — too sparse (no builds, decisions, or loops)`);
      stats.skipped++;
      continue;
    }

    console.log(`  GEN  ${mf} ...`);

    try {
      // Generate poem
      const rawPoem = await ollamaGenerate(SYSTEM_PROMPT, sessionSummary);
      const { poemText, pivotLine, title } = parsePoemResponse(rawPoem);

      if (!poemText || poemText.length < 50) {
        console.log(`    FAIL — poem too short or empty`);
        stats.failed++;
        await sleep(2000);
        continue;
      }

      // Generate analysis
      await sleep(1000);
      const analysis = await generateAnalysis(poemText, pivotLine, sessionSummary);

      // Write file
      const outPath = writePoemFile(
        suffix ? `${date}-${suffix}` : date,
        title, poemText, pivotLine, analysis, sessionSummary, mf
      );

      console.log(`    OK  → ${path.basename(outPath)} ("${title}")`);
      stats.generated++;

      // Rate limit
      await sleep(2000);
    } catch (e) {
      console.log(`    FAIL — ${e.message}`);
      stats.failed++;
      await sleep(2000);
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Total manifests:  ${stats.total}`);
  console.log(`Skipped (exists): ${stats.skipped}`);
  console.log(`Generated:        ${stats.generated}`);
  console.log(`Failed:           ${stats.failed}`);
  console.log(`\nPoems now in: ${POEM_DIR}`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
