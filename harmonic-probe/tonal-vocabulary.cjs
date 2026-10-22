#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const HOME = process.env.HOME;
const VAULT = path.join(HOME, 'cathedral-vault', '02_Refined_Gold', 'cathedral');
const TELEMETRY = path.join(__dirname, 'telemetry.json');
const OUT = path.join(__dirname, 'tonal-vocabulary.json');

// ── Poem Harvester ──────────────────────────────────────────────────────────

function harvestPoems() {
  const files = fs.readdirSync(VAULT).filter(f => f.startsWith('reverse-poetry-session-'));
  const poems = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(VAULT, file), 'utf8');

    // Extract date from filename: reverse-poetry-session-YYYY-MM-DD[-N].md
    const dateMatch = file.match(/session-(?:self-audit-)?(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) continue;
    const date = dateMatch[1];

    // Extract title
    const titleMatch = content.match(/^#\s+(.+?)(?:\s*—.*)?$/m);
    const title = titleMatch ? titleMatch[1].trim() : file;

    // Extract poem text (between --- markers or in code block or after ## The Poem / ## poem heading)
    let poemText = '';
    const poemSectionMatch = content.match(/##\s+(?:The\s+)?Poem\s*\n([\s\S]*?)(?=\n##|\n---|\n\*\*)/i);
    if (poemSectionMatch) {
      poemText = poemSectionMatch[1].trim();
    } else {
      // Try code block
      const codeMatch = content.match(/```\n([\s\S]*?)```/);
      if (codeMatch) poemText = codeMatch[1].trim();
    }

    // If still empty, try indented block after first heading
    if (!poemText) {
      const lines = content.split('\n');
      let inPoem = false;
      const poemLines = [];
      for (const line of lines) {
        if (line.match(/^(It's|Nobody|We all|This is|The )/)) inPoem = true;
        if (inPoem) {
          if (line.startsWith('##') || line.startsWith('**')) break;
          poemLines.push(line);
        }
      }
      if (poemLines.length > 3) poemText = poemLines.join('\n').trim();
    }

    // Extract pivot line
    const pivotMatch = content.match(/\*\*(?:The\s+)?pivot(?:\s+line)?\*\*[:\s]+["""]?(.+?)["""]?(?:\s*[—–-]|\.|\n)/i);
    const pivotLine = pivotMatch ? pivotMatch[1].trim().replace(/^[""]|[""]$/g, '') : null;

    // Extract analysis text
    const analysisMatch = content.match(/##\s+(?:What the Reverse Reveals|Analysis)\s*\n([\s\S]*?)(?=\n##|\n---|\Z)/i);
    const analysis = analysisMatch ? analysisMatch[1].trim() : '';

    // Extract tonal qualities from content
    const tones = extractTones(content, poemText, analysis);

    poems.push({
      file,
      date,
      title,
      poemText: poemText.slice(0, 500),
      pivotLine,
      analysis: analysis.slice(0, 800),
      tones,
    });
  }

  return poems.sort((a, b) => a.date.localeCompare(b.date));
}

// ── Tone Extraction ─────────────────────────────────────────────────────────

function extractTones(fullText, poemText, analysis) {
  const text = (fullText + ' ' + poemText + ' ' + analysis).toLowerCase();

  // Tonal dimensions — detected by keyword presence and density
  const dimensions = {
    doubt:       ['skeptic', 'dismiss', 'naive', 'foolish', 'never', 'nobody', 'nothing', "doesn't", "don't", "won't", 'refuse'],
    conviction:  ['always', 'proof', 'truth', 'discovers', 'reveals', 'confirms', 'emerges', 'builds', 'completes', 'resolves'],
    tension:     ['but', 'however', 'despite', 'yet', 'contradiction', 'conflict', 'struggle', 'cost', 'burn', 'break'],
    release:     ['becomes', 'transforms', 'opens', 'aligns', 'resolves', 'connects', 'arrives', 'settles', 'heals'],
    mechanical:  ['wired', 'fired', 'chain', 'loop', 'pipeline', 'build', 'tool', 'engine', 'system', 'process', 'code'],
    organic:     ['grow', 'breathe', 'sweat', 'fight', 'punch', 'ring', 'body', 'feel', 'heart', 'child', 'walk'],
    meta:        ['session', 'forge', 'cathedral', 'probe', 'itself', 'own', 'self-', 'audit', 'mirror', 'reverse'],
    shipping:    ['ship', 'deliver', 'client', 'hand', 'email', 'receive', 'door', 'open', 'post', 'share', 'public'],
    architecture:['architecture', 'infrastructure', 'blueprint', 'design', 'plan', 'system', 'structure', 'map', 'vision'],
    honesty:     ['honest', 'true', 'lie', 'false', 'record', 'transcript', 'confession', 'trust', 'integrity'],
  };

  const scores = {};
  for (const [dim, keywords] of Object.entries(dimensions)) {
    let count = 0;
    for (const kw of keywords) {
      const regex = new RegExp(`\\b${kw}`, 'gi');
      const matches = text.match(regex);
      if (matches) count += matches.length;
    }
    // Normalize by text length (per 1000 chars)
    scores[dim] = Math.round((count / (text.length / 1000)) * 100) / 100;
  }

  // Classify dominant tone
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const dominant = sorted[0][0];
  const secondary = sorted[1][0];

  // Top-down vs bottom-up tone classification
  const topDown = scores.doubt > scores.conviction ? 'skeptical' :
    scores.mechanical > scores.organic ? 'mechanical' :
    scores.architecture > scores.shipping ? 'visionary' : 'neutral';

  const bottomUp = scores.conviction > scores.doubt ? 'affirmative' :
    scores.release > scores.tension ? 'resolved' :
    scores.shipping > scores.architecture ? 'actualized' : 'emergent';

  return {
    scores,
    dominant,
    secondary,
    topDown,
    bottomUp,
    flipMagnitude: Math.round(Math.abs(scores.doubt - scores.conviction) * 100) / 100,
  };
}

// ── Telemetry Correlation ───────────────────────────────────────────────────

function correlateWithTelemetry(poems, telemetry) {
  const slots = telemetry.telemetry;
  const vocabulary = [];

  for (const poem of poems) {
    // Find telemetry slots matching poem date
    const matchingSlots = slots.filter(s => s.timestamp.startsWith(poem.date));

    if (matchingSlots.length === 0) {
      poem.harmonicMatch = null;
      vocabulary.push({
        ...poem,
        harmonicSignature: null,
        correlation: 'no_telemetry_overlap',
      });
      continue;
    }

    // Average features across matching slots
    const avgFeatures = {};
    const featureKeys = Object.keys(matchingSlots[0].features);
    for (const f of featureKeys) {
      avgFeatures[f] = Math.round(
        (matchingSlots.reduce((s, sl) => s + sl.features[f], 0) / matchingSlots.length) * 1000
      ) / 1000;
    }

    // Anomaly count on that date
    const anomalyCount = matchingSlots.reduce((s, sl) => s + (sl.anomalies?.length || 0), 0);

    // Peak z-score
    const allZ = matchingSlots.flatMap(sl =>
      Object.values(sl.zScores || {}).map(z => Math.abs(z))
    );
    const peakZ = allZ.length > 0 ? Math.round(Math.max(...allZ) * 100) / 100 : 0;

    // Ground truth events on date
    const gtEvents = matchingSlots.flatMap(sl => sl.groundTruth || []);

    vocabulary.push({
      ...poem,
      harmonicSignature: {
        features: avgFeatures,
        anomalyCount,
        peakZ,
        slotsMatched: matchingSlots.length,
        groundTruth: gtEvents.map(g => g.event),
      },
      correlation: anomalyCount > 0 ? 'anomaly_day' : 'normal_day',
    });
  }

  return vocabulary;
}

// ── Pattern Synthesis ───────────────────────────────────────────────────────

function synthesizePatterns(vocabulary) {
  const withHarmonics = vocabulary.filter(v => v.harmonicSignature);
  if (withHarmonics.length < 2) return { patterns: [], tooFewData: true };

  const patterns = [];

  // Pattern 1: high-doubt poems vs high-conviction poems — different beat energy?
  const highDoubt = withHarmonics.filter(v => v.tones.scores.doubt > v.tones.scores.conviction);
  const highConviction = withHarmonics.filter(v => v.tones.scores.conviction > v.tones.scores.doubt);

  if (highDoubt.length > 0 && highConviction.length > 0) {
    const avgBeatDoubt = highDoubt.reduce((s, v) => s + v.harmonicSignature.features.beatEnergy, 0) / highDoubt.length;
    const avgBeatConviction = highConviction.reduce((s, v) => s + v.harmonicSignature.features.beatEnergy, 0) / highConviction.length;

    patterns.push({
      name: 'doubt-beat-correlation',
      finding: `Doubt-dominant poems: avg beatEnergy=${avgBeatDoubt.toFixed(3)}. Conviction-dominant: avg beatEnergy=${avgBeatConviction.toFixed(3)}`,
      delta: Math.round((avgBeatDoubt - avgBeatConviction) * 1000) / 1000,
      interpretation: avgBeatDoubt > avgBeatConviction
        ? 'Skeptical sessions correlate with higher agent dissonance'
        : 'Skeptical sessions correlate with lower agent dissonance (surprising)',
    });
  }

  // Pattern 2: anomaly days vs non-anomaly days — tonal shift?
  const anomalyDays = withHarmonics.filter(v => v.correlation === 'anomaly_day');
  const normalDays = withHarmonics.filter(v => v.correlation === 'normal_day');

  if (anomalyDays.length > 0 && normalDays.length > 0) {
    const avgFlipAnomaly = anomalyDays.reduce((s, v) => s + v.tones.flipMagnitude, 0) / anomalyDays.length;
    const avgFlipNormal = normalDays.reduce((s, v) => s + v.tones.flipMagnitude, 0) / normalDays.length;

    patterns.push({
      name: 'anomaly-flip-correlation',
      finding: `Anomaly-day poems: avg flip magnitude=${avgFlipAnomaly.toFixed(2)}. Normal-day: avg flip=${avgFlipNormal.toFixed(2)}`,
      delta: Math.round((avgFlipAnomaly - avgFlipNormal) * 100) / 100,
      interpretation: avgFlipAnomaly > avgFlipNormal
        ? 'Anomaly days produce poems with stronger doubt↔conviction reversals'
        : 'Normal days have stronger reversals (poems are more interesting when system is calm)',
    });
  }

  // Pattern 3: dominant tone → harmonic coherence
  const toneCoherenceMap = {};
  for (const v of withHarmonics) {
    const tone = v.tones.dominant;
    if (!toneCoherenceMap[tone]) toneCoherenceMap[tone] = [];
    toneCoherenceMap[tone].push(v.harmonicSignature.features.harmonicity);
  }

  for (const [tone, values] of Object.entries(toneCoherenceMap)) {
    if (values.length < 1) continue;
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    patterns.push({
      name: `tone-coherence-${tone}`,
      finding: `"${tone}" dominant tone → avg harmonicity=${avg.toFixed(3)} (n=${values.length})`,
      interpretation: avg > 0.8 ? 'High coherence — system aligned when this tone dominates'
        : avg < 0.6 ? 'Low coherence — system strained when this tone dominates'
        : 'Moderate coherence',
    });
  }

  return { patterns };
}

// ── Compose Intent ──────────────────────────────────────────────────────────
// Given a desired tonal intent, find the closest historical match and output
// the required harmonic signature

function composeFromIntent(vocabulary, intent) {
  const withHarmonics = vocabulary.filter(v => v.harmonicSignature);

  // Score each entry by tonal proximity to intent
  const scored = withHarmonics.map(v => {
    let score = 0;
    if (intent.dominant && v.tones.dominant === intent.dominant) score += 3;
    if (intent.dominant && v.tones.secondary === intent.dominant) score += 1;
    if (intent.topDown && v.tones.topDown === intent.topDown) score += 2;
    if (intent.bottomUp && v.tones.bottomUp === intent.bottomUp) score += 2;
    if (intent.minFlip && v.tones.flipMagnitude >= intent.minFlip) score += 1;
    return { entry: v, score };
  }).sort((a, b) => b.score - a.score);

  if (scored.length === 0 || scored[0].score === 0) return null;

  const best = scored[0].entry;
  return {
    intent,
    matchedPoem: best.title,
    matchedDate: best.date,
    matchScore: scored[0].score,
    targetSignature: best.harmonicSignature.features,
    tonalProfile: best.tones,
    poemExcerpt: best.poemText.slice(0, 200),
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log('Harvesting reverse poems from vault...');
  const poems = harvestPoems();
  console.log(`  Found ${poems.length} poems`);

  for (const p of poems) {
    console.log(`  ${p.date} — "${p.title}" [${p.tones.dominant}/${p.tones.secondary}] flip=${p.tones.flipMagnitude}`);
  }

  console.log('\nLoading telemetry...');
  const telemetry = JSON.parse(fs.readFileSync(TELEMETRY, 'utf8'));

  console.log('Correlating poems with harmonic data...');
  const vocabulary = correlateWithTelemetry(poems, telemetry);

  const withMatch = vocabulary.filter(v => v.harmonicSignature);
  console.log(`  ${withMatch.length}/${vocabulary.length} poems have telemetry overlap`);

  console.log('\nSynthesizing patterns...');
  const { patterns } = synthesizePatterns(vocabulary);
  for (const p of patterns) {
    console.log(`  ${p.name}: ${p.finding}`);
    console.log(`    → ${p.interpretation}`);
  }

  // Demo: compose from intent
  console.log('\n── Compose Demo: "conviction + actualized" intent ──');
  const composition = composeFromIntent(vocabulary, {
    dominant: 'conviction',
    bottomUp: 'actualized',
    minFlip: 1.0,
  });
  if (composition) {
    console.log(`  Matched: "${composition.matchedPoem}" (${composition.matchedDate})`);
    console.log(`  Target beatEnergy: ${composition.targetSignature.beatEnergy}`);
    console.log(`  Target harmonicity: ${composition.targetSignature.harmonicity}`);
  } else {
    console.log('  No match found for this intent');
  }

  // Demo: compose for "skeptical → resolved" (the classic reverse poem arc)
  console.log('\n── Compose Demo: "skeptical → resolved" arc ──');
  const composition2 = composeFromIntent(vocabulary, {
    topDown: 'skeptical',
    bottomUp: 'resolved',
  });
  if (composition2) {
    console.log(`  Matched: "${composition2.matchedPoem}" (${composition2.matchedDate})`);
    console.log(`  Target beatEnergy: ${composition2.targetSignature.beatEnergy}`);
    console.log(`  Target harmonicity: ${composition2.targetSignature.harmonicity}`);
  } else {
    console.log('  No match found for this intent');
  }

  // Write output
  const output = {
    version: 'v1',
    generated: new Date().toISOString(),
    description: 'Tonal Vocabulary: reverse poems correlated with harmonic agent state data',
    vocabulary,
    patterns,
    composeDemos: [composition, composition2].filter(Boolean),
    stats: {
      totalPoems: poems.length,
      withTelemetry: withMatch.length,
      patternsFound: patterns.length,
      dateRange: {
        earliest: poems[0]?.date,
        latest: poems[poems.length - 1]?.date,
      },
    },
  };

  fs.writeFileSync(OUT, JSON.stringify(output, null, 2));
  console.log(`\nTonal vocabulary written to ${OUT}`);
}

main();
