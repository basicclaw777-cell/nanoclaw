/**
 * Corpus → Validator Bridge
 *
 * Reads YOLO movement analysis JSONs from ~/boxing-corpus/movement/
 * Extracts punch sequences (combinations detected in real footage)
 * Validates each sequence against the combination validator
 * Outputs: what combos Paul actually threw vs what the engine says
 *
 * This is the wire between real coaching data and the rule engine.
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { validatePunchCombo } from './combination-validator.js';

const CORPUS_DIR = join(process.env.HOME, 'boxing-corpus', 'movement');
const OUTPUT_DIR = join(process.env.HOME, 'br-gm-agent', 'reports');

// Map YOLO punch types to validator punch names
const PUNCH_MAP = {
  'jab': 'jab',
  'cross': 'cross',
  'hook': null,       // Need side to disambiguate
  'uppercut': null,   // Need side to disambiguate
  'overhand': 'overhand',
};

function mapPunch(detection) {
  const { type, side } = detection;

  if (type === 'jab') return 'jab';
  if (type === 'cross') return 'cross';
  if (type === 'overhand') return 'overhand';

  // Hook: left = lead_hook, right = rear_hook (orthodox stance)
  if (type === 'hook') {
    return side === 'left' ? 'lead_hook' : 'rear_hook';
  }

  // Uppercut: left = lead_uppercut, right = rear_uppercut
  if (type === 'uppercut') {
    return side === 'left' ? 'lead_uppercut' : 'rear_uppercut';
  }

  return null; // Unknown punch type
}

/**
 * Extract combinations from a sequence of timestamped punches.
 * A "combination" = punches within 2 seconds of each other.
 * Gap > 2s = new combination starts.
 */
function extractCombinations(punches, gapThreshold = 2.0, minConfidence = 0.5) {
  // Filter by confidence and sort by timestamp
  const filtered = punches
    .filter(p => p.confidence >= minConfidence)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (filtered.length === 0) return [];

  const combos = [];
  let current = [filtered[0]];

  for (let i = 1; i < filtered.length; i++) {
    const gap = filtered[i].timestamp - filtered[i - 1].timestamp;
    if (gap <= gapThreshold) {
      current.push(filtered[i]);
    } else {
      if (current.length >= 2) {
        combos.push(current);
      }
      current = [filtered[i]];
    }
  }
  if (current.length >= 2) {
    combos.push(current);
  }

  return combos;
}

// ─── MAIN ───────────────────────────────────────────────────────────────────

function processFile(filepath) {
  const data = JSON.parse(readFileSync(filepath, 'utf8'));
  const filename = basename(filepath);
  const punches = data.punches_detected || [];

  const combos = extractCombinations(punches);

  const results = [];
  for (const combo of combos) {
    const mapped = combo.map(mapPunch).filter(Boolean);
    if (mapped.length < 2) continue;

    const validation = validatePunchCombo(mapped);
    const startTime = combo[0].timestamp;
    const endTime = combo[combo.length - 1].timestamp;

    results.push({
      timestamp: `${startTime.toFixed(1)}s - ${endTime.toFixed(1)}s`,
      raw: combo.map(p => `${p.side} ${p.type}`),
      mapped,
      notation: mapped.map(p => {
        const NOTATION = {
          jab: '1', cross: '2', lead_hook: '3', rear_hook: '4',
          lead_uppercut: '5', rear_uppercut: '6', lead_body: '3b',
          rear_body: '2b', jab_body: '1b', overhand: '2o',
        };
        return NOTATION[p] || p;
      }).join('-'),
      valid: validation.valid,
      transitions: validation.transitions,
      avgConfidence: (combo.reduce((s, p) => s + p.confidence, 0) / combo.length).toFixed(2),
      avgVelocity: (combo.reduce((s, p) => s + (p.velocity || 0), 0) / combo.length).toFixed(0),
    });
  }

  return { filename, source: data.source, category: data.category, duration: data.duration_seconds, totalPunches: punches.length, combos: results };
}

// Process all movement JSONs
const categories = readdirSync(CORPUS_DIR).filter(d => {
  try { return readdirSync(join(CORPUS_DIR, d)).length > 0; } catch { return false; }
});

const allResults = [];
for (const cat of categories) {
  const catDir = join(CORPUS_DIR, cat);
  const files = readdirSync(catDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    allResults.push(processFile(join(catDir, file)));
  }
}

// ─── OUTPUT: Markdown Report ────────────────────────────────────────────────

const lines = [
  '# Boxing Corpus → Validator Analysis',
  '',
  `**Generated:** ${new Date().toISOString().split('T')[0]}`,
  `**Movement files analyzed:** ${allResults.length}`,
  `**Total punches detected:** ${allResults.reduce((s, r) => s + r.totalPunches, 0)}`,
  `**Combinations extracted:** ${allResults.reduce((s, r) => s + r.combos.length, 0)}`,
  '',
  '---',
  '',
];

let totalCombos = 0;
let validCombos = 0;
let invalidCombos = 0;

for (const session of allResults) {
  lines.push(`## ${session.source} (${session.category})`);
  lines.push(`Duration: ${(session.duration / 60).toFixed(0)} min | Punches detected: ${session.totalPunches} | Combinations: ${session.combos.length}`);
  lines.push('');

  if (session.combos.length === 0) {
    lines.push('No combinations extracted (punches too spread out or below confidence threshold).');
    lines.push('');
    continue;
  }

  lines.push('| # | Time | Notation | Confidence | Velocity | Validator | Issue |');
  lines.push('|---|------|----------|------------|----------|-----------|-------|');

  for (let i = 0; i < session.combos.length; i++) {
    const c = session.combos[i];
    totalCombos++;
    if (c.valid) validCombos++;
    else invalidCombos++;

    const icon = c.valid ? '✓' : '✗';
    const issue = c.valid ? '' : c.transitions.find(t => t.verdict === 'INVALID')?.reason || '';
    lines.push(`| ${i + 1} | ${c.timestamp} | ${c.notation} | ${c.avgConfidence} | ${c.avgVelocity} | ${icon} | ${issue} |`);
  }
  lines.push('');
}

lines.push('---');
lines.push('');
lines.push('## Summary');
lines.push('');
lines.push(`| Metric | Value |`);
lines.push(`|--------|-------|`);
lines.push(`| Total combinations | ${totalCombos} |`);
lines.push(`| Validator: valid | ${validCombos} (${totalCombos ? ((validCombos / totalCombos) * 100).toFixed(0) : 0}%) |`);
lines.push(`| Validator: invalid | ${invalidCombos} (${totalCombos ? ((invalidCombos / totalCombos) * 100).toFixed(0) : 0}%) |`);
lines.push('');
lines.push('**Interpretation:**');
lines.push('- Valid combos = Paul threw biomechanically sound sequences (validator agrees with coach)');
lines.push('- Invalid combos = either YOLO misdetected punch types, or Paul threw something the validator rules don\'t cover yet');
lines.push('- Low confidence detections (<0.5) are already filtered out');
lines.push('- Each invalid combo is a candidate for rule engine improvement');
lines.push('');

const report = lines.join('\n');
console.log(report);

const outPath = join(OUTPUT_DIR, `corpus-validator-analysis-${new Date().toISOString().split('T')[0]}.md`);
writeFileSync(outPath, report);
console.error(`\nWritten to: ${outPath}`);
