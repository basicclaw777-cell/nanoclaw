// ── Q Drops Phase 7: Author Fingerprinting (Deep Linguistic) ─────────────────
// Stylometric analysis beyond Phase 1. Per-tripcode profiling.
// Function word distributions, punctuation patterns, rhetorical structure,
// cognitive style markers. Cluster analysis across tripcodes.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';
dotenv.config();

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const OLLAMA_URL = 'http://localhost:11434';
const CORPUS_PATH = join(process.env.HOME, 'cathedral-vault/00_Staging/qanon-forensics/posts.json');
const OUTPUT_DIR = join(process.env.HOME, 'cathedral-vault/00_Staging/qanon-forensics');
const CHECKPOINT_PATH = join(OUTPUT_DIR, 'phase7-checkpoint.json');

// ── Rate limiter ─────────────────────────────────────────────────────────────
let lastCall = 0;
const MIN_INTERVAL = 1500;
async function throttle() {
  const now = Date.now();
  const wait = MIN_INTERVAL - (now - lastCall);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastCall = Date.now();
}

async function callDeepSeek(system, prompt, maxTokens = 4000) {
  if (!DEEPSEEK_KEY) return callOllama(system, prompt, maxTokens);
  await throttle();
  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
        max_tokens: maxTokens, temperature: 0.1
      })
    });
    const data = await res.json();
    if (data.error) { console.error(`DeepSeek: ${data.error.message}`); return callOllama(system, prompt, maxTokens); }
    return data.choices?.[0]?.message?.content || '';
  } catch (err) { console.error('DeepSeek failed:', err.message); return callOllama(system, prompt, maxTokens); }
}

async function callOllama(system, prompt, maxTokens = 4000) {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gemma3:4b', messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], stream: false, options: { num_predict: maxTokens } })
    });
    const data = await res.json();
    return data.message?.content || '';
  } catch (err) { console.error('Ollama failed:', err.message); return ''; }
}

function loadCheckpoint() {
  if (existsSync(CHECKPOINT_PATH)) return JSON.parse(readFileSync(CHECKPOINT_PATH, 'utf8'));
  return { step: 0 };
}
function saveCheckpoint(state) { writeFileSync(CHECKPOINT_PATH, JSON.stringify(state, null, 2)); }

// ── Stylometric feature extraction (local, no LLM) ──────────────────────────

// Function words — hardest to consciously change
const FUNCTION_WORDS = [
  'the','a','an','and','or','but','if','then','so','as','at','by','for','in','of','on','to','with',
  'is','are','was','were','be','been','being','have','has','had','do','does','did',
  'will','would','shall','should','can','could','may','might','must',
  'i','you','he','she','it','we','they','me','him','her','us','them',
  'my','your','his','its','our','their','mine','yours','hers','ours','theirs',
  'this','that','these','those','what','which','who','whom','whose',
  'not','no','nor','neither','either','both','all','each','every','any','some',
  'very','too','also','just','only','still','already','even','never','always',
  'here','there','where','when','how','why','because','since','while','although','though',
  'about','after','before','between','during','from','into','through','under','until','upon'
];

function extractFeatures(text) {
  const words = text.toLowerCase().replace(/[^a-z0-9\s']/g, ' ').split(/\s+/).filter(w => w.length > 0);
  const totalWords = words.length;
  if (totalWords < 10) return null;

  // Function word frequencies
  const funcWordFreqs = {};
  FUNCTION_WORDS.forEach(fw => {
    const count = words.filter(w => w === fw).length;
    funcWordFreqs[fw] = count / totalWords;
  });

  // Vocabulary richness
  const uniqueWords = new Set(words);
  const typeTokenRatio = uniqueWords.size / totalWords;

  // Average word length
  const avgWordLen = words.reduce((s, w) => s + w.length, 0) / totalWords;

  // Sentence structure (from original text)
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const avgSentenceLen = sentences.length > 0 ? totalWords / sentences.length : totalWords;

  // Punctuation patterns
  const chars = text.length;
  const questionMarks = (text.match(/\?/g) || []).length / chars * 1000;
  const exclamationMarks = (text.match(/!/g) || []).length / chars * 1000;
  const ellipses = (text.match(/\.{2,}/g) || []).length / chars * 1000;
  const dashes = (text.match(/[-–—]/g) || []).length / chars * 1000;
  const commas = (text.match(/,/g) || []).length / chars * 1000;
  const colons = (text.match(/:/g) || []).length / chars * 1000;
  const semicolons = (text.match(/;/g) || []).length / chars * 1000;
  const allCaps = (text.match(/\b[A-Z]{2,}\b/g) || []).length / totalWords;
  const brackets = (text.match(/[\[\](){}]/g) || []).length / chars * 1000;
  const newlines = (text.match(/\n/g) || []).length / chars * 1000;
  const urls = (text.match(/https?:\/\/\S+/g) || []).length;

  // Rhetorical patterns
  const questions = (text.match(/\?/g) || []).length;
  const questionRatio = questions / Math.max(sentences.length, 1);
  const imperatives = words.filter(w => ['think','watch','follow','learn','read','remember','trust','pray','fight'].includes(w)).length / totalWords;
  const references = (text.match(/>>/g) || []).length;

  // Line structure (Q often uses single-line fragments)
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  const avgLineLen = lines.length > 0 ? text.length / lines.length : text.length;
  const singleWordLines = lines.filter(l => l.trim().split(/\s+/).length === 1).length / Math.max(lines.length, 1);

  return {
    totalWords, typeTokenRatio, avgWordLen, avgSentenceLen,
    questionMarks, exclamationMarks, ellipses, dashes, commas, colons, semicolons,
    allCaps, brackets, newlines, urls, questionRatio, imperatives, references,
    avgLineLen, singleWordLines, funcWordFreqs
  };
}

// ── Aggregate features per tripcode ──────────────────────────────────────────
function aggregateByTripcode(posts) {
  const groups = {};
  posts.forEach(p => {
    const trip = p.post_metadata.tripcode || 'no-trip';
    if (!groups[trip]) groups[trip] = [];
    groups[trip].push(p);
  });

  const profiles = {};
  for (const [trip, tripPosts] of Object.entries(groups)) {
    const allText = tripPosts.map(p => p.text || '').join('\n\n');
    const features = extractFeatures(allText);
    if (!features) continue;

    // Also extract per-post features for variance analysis
    const postFeatures = tripPosts
      .map(p => extractFeatures(p.text || ''))
      .filter(f => f !== null);

    // Calculate variance of key metrics across posts
    function variance(arr) {
      if (arr.length < 2) return 0;
      const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
      return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
    }

    const qMarkVar = variance(postFeatures.map(f => f.questionMarks));
    const capsVar = variance(postFeatures.map(f => f.allCaps));
    const lineLenVar = variance(postFeatures.map(f => f.avgLineLen));

    profiles[trip] = {
      postCount: tripPosts.length,
      firstDate: new Date(Math.min(...tripPosts.map(p => p.post_metadata.time)) * 1000).toISOString().split('T')[0],
      lastDate: new Date(Math.max(...tripPosts.map(p => p.post_metadata.time)) * 1000).toISOString().split('T')[0],
      features,
      variance: { qMarkVar, capsVar, lineLenVar },
      topFuncWords: Object.entries(features.funcWordFreqs)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([w, f]) => ({ word: w, freq: Math.round(f * 10000) / 10000 }))
    };
  }
  return profiles;
}

// ── Cosine similarity between feature vectors ────────────────────────────────
function cosineSim(a, b) {
  const keys = new Set([...Object.keys(a.funcWordFreqs), ...Object.keys(b.funcWordFreqs)]);
  let dot = 0, magA = 0, magB = 0;
  for (const k of keys) {
    const va = a.funcWordFreqs[k] || 0;
    const vb = b.funcWordFreqs[k] || 0;
    dot += va * vb;
    magA += va * va;
    magB += vb * vb;
  }
  // Also include structural features
  const structKeys = ['questionMarks', 'exclamationMarks', 'ellipses', 'dashes', 'commas',
    'allCaps', 'brackets', 'newlines', 'questionRatio', 'imperatives', 'singleWordLines'];
  for (const k of structKeys) {
    const va = (a[k] || 0) / 100; // normalize
    const vb = (b[k] || 0) / 100;
    dot += va * vb;
    magA += va * va;
    magB += vb * vb;
  }
  return magA > 0 && magB > 0 ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
}

function computeSimilarityMatrix(profiles) {
  const trips = Object.keys(profiles).filter(t => t !== 'no-trip');
  const matrix = {};
  for (const a of trips) {
    matrix[a] = {};
    for (const b of trips) {
      if (a === b) { matrix[a][b] = 1.0; continue; }
      matrix[a][b] = Math.round(cosineSim(profiles[a].features, profiles[b].features) * 1000) / 1000;
    }
  }
  return { trips, matrix };
}

// ── Temporal style drift detection ───────────────────────────────────────────
function detectStyleDrift(posts, profiles) {
  // For each tripcode, split posts into first half and second half
  // Compare features to detect within-tripcode drift
  const drifts = {};
  const groups = {};
  posts.forEach(p => {
    const trip = p.post_metadata.tripcode || 'no-trip';
    if (!groups[trip]) groups[trip] = [];
    groups[trip].push(p);
  });

  for (const [trip, tripPosts] of Object.entries(groups)) {
    if (tripPosts.length < 20) continue; // need enough posts
    const sorted = tripPosts.sort((a, b) => a.post_metadata.time - b.post_metadata.time);
    const mid = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, mid);
    const secondHalf = sorted.slice(mid);

    const firstText = firstHalf.map(p => p.text || '').join('\n\n');
    const secondText = secondHalf.map(p => p.text || '').join('\n\n');

    const firstFeatures = extractFeatures(firstText);
    const secondFeatures = extractFeatures(secondText);
    if (!firstFeatures || !secondFeatures) continue;

    const sim = cosineSim(firstFeatures, secondFeatures);

    // Key metric deltas
    const deltas = {
      questionMarks: secondFeatures.questionMarks - firstFeatures.questionMarks,
      allCaps: secondFeatures.allCaps - firstFeatures.allCaps,
      avgSentenceLen: secondFeatures.avgSentenceLen - firstFeatures.avgSentenceLen,
      typeTokenRatio: secondFeatures.typeTokenRatio - firstFeatures.typeTokenRatio,
      singleWordLines: secondFeatures.singleWordLines - firstFeatures.singleWordLines,
      imperatives: secondFeatures.imperatives - firstFeatures.imperatives,
    };

    drifts[trip] = {
      similarity: Math.round(sim * 1000) / 1000,
      firstHalfPosts: firstHalf.length,
      secondHalfPosts: secondHalf.length,
      deltas
    };
  }
  return drifts;
}

// ── DeepSeek cognitive style analysis ────────────────────────────────────────
async function analyzeCognitiveStyle(profiles, posts) {
  console.log('\n=== DeepSeek Cognitive Style Analysis ===\n');

  // Sample 10 posts from each major tripcode
  const samples = {};
  const groups = {};
  posts.forEach(p => {
    const trip = p.post_metadata.tripcode || 'no-trip';
    if (!groups[trip]) groups[trip] = [];
    groups[trip].push(p);
  });

  for (const [trip, tripPosts] of Object.entries(groups)) {
    if (tripPosts.length < 20) continue;
    // Sample evenly across the period
    const step = Math.floor(tripPosts.length / 10);
    samples[trip] = [];
    for (let i = 0; i < 10 && i * step < tripPosts.length; i++) {
      const p = tripPosts[i * step];
      samples[trip].push({
        id: p.post_metadata.id,
        date: new Date(p.post_metadata.time * 1000).toISOString().split('T')[0],
        text: (p.text || '').substring(0, 200)
      });
    }
  }

  const system = `You are a forensic linguist specializing in author attribution. Analyze the writing samples from different "tripcode periods" of the same anonymous poster (Q, 2017-2022).

For each tripcode period, assess:

1. COGNITIVE STYLE:
   - Abstract vs concrete thinking (does the writer deal in concepts or specifics?)
   - Temporal orientation (past/present/future focus)
   - Agency attribution (active vs passive voice, who acts in their framing)
   - Certainty markers ("will" vs "may", declarative vs hedged)

2. RHETORICAL PATTERNS:
   - Socratic questioning (questions designed to lead to conclusion)
   - Directive (commands/instructions)
   - Narrative (storytelling)
   - Analytical (evidence → conclusion)
   - Prophetic (prediction/revelation)

3. VOICE CONSISTENCY:
   - Do all tripcode periods sound like the same person?
   - If not, which periods cluster together and which are outliers?
   - What specific linguistic markers change between periods?

4. AUTHOR COUNT ESTIMATE:
   - Minimum number of distinct authors based on linguistic evidence
   - Confidence level (HIGH/MEDIUM/LOW)
   - What evidence would change your estimate?

5. PROFILE:
   - Estimated education level
   - Likely professional background (military, intelligence, political, academic, tech)
   - Age range indicators
   - Native English speaker? If not, what L1 indicators?

Return structured analysis.`;

  const prompt = Object.entries(samples).map(([trip, samps]) => {
    const profile = profiles[trip];
    return `=== TRIPCODE: ${trip} (${profile?.postCount || '?'} posts, ${profile?.firstDate} → ${profile?.lastDate}) ===

STYLOMETRIC PROFILE:
- Avg sentence length: ${profile?.features?.avgSentenceLen?.toFixed(1) || '?'} words
- Type-token ratio: ${profile?.features?.typeTokenRatio?.toFixed(3) || '?'}
- Question ratio: ${(profile?.features?.questionRatio * 100)?.toFixed(1) || '?'}%
- ALL CAPS ratio: ${(profile?.features?.allCaps * 100)?.toFixed(1) || '?'}%
- Single-word lines: ${(profile?.features?.singleWordLines * 100)?.toFixed(1) || '?'}%
- Top function words: ${profile?.topFuncWords?.slice(0, 8).map(w => w.word + ':' + w.freq).join(', ') || '?'}

SAMPLE POSTS:
${samps.map(s => `[#${s.id} | ${s.date}]\n${s.text}`).join('\n---\n')}`;
  }).join('\n\n========\n\n');

  const result = await callDeepSeek(system, prompt, 6000);
  return result;
}

// ── Generate report ──────────────────────────────────────────────────────────
function generateReport(profiles, simMatrix, drifts, cognitiveAnalysis) {
  const trips = Object.keys(profiles).filter(t => t !== 'no-trip').sort((a, b) =>
    new Date(profiles[a].firstDate) - new Date(profiles[b].firstDate)
  );

  // Format similarity matrix
  const matrixHeader = '| | ' + simMatrix.trips.map(t => t.substring(0, 8)).join(' | ') + ' |';
  const matrixSep = '|---|' + simMatrix.trips.map(() => '---|').join('');
  const matrixRows = simMatrix.trips.map(a =>
    `| ${a.substring(0, 8)} | ${simMatrix.trips.map(b => simMatrix.matrix[a][b]).join(' | ')} |`
  ).join('\n');

  const report = `---
title: "Q Drops Forensic Analysis — Phase 7 (Author Fingerprinting)"
date: 2026-05-25
type: forensic-analysis
status: complete
tags: [qanon, forensics, stylometry, author-attribution, linguistic-analysis]
---

# Q Drops — Phase 7: Author Fingerprinting (Deep Linguistic)

## Summary

Local stylometric analysis of 4,966 posts across 9 tripcodes + no-tripcode period. Feature extraction: function word distributions, punctuation patterns, rhetorical structure, cognitive style markers. DeepSeek cognitive profiling.

## Part 1: Stylometric Profiles

${trips.map(trip => {
  const p = profiles[trip];
  const f = p.features;
  return `### ${trip} (${p.postCount} posts, ${p.firstDate} → ${p.lastDate})

| Metric | Value |
|---|---|
| Words | ${f.totalWords} |
| Type-token ratio | ${f.typeTokenRatio.toFixed(3)} |
| Avg word length | ${f.avgWordLen.toFixed(1)} |
| Avg sentence length | ${f.avgSentenceLen.toFixed(1)} |
| Question marks/1000 chars | ${f.questionMarks.toFixed(1)} |
| Exclamation marks/1000 | ${f.exclamationMarks.toFixed(1)} |
| ALL CAPS ratio | ${(f.allCaps * 100).toFixed(1)}% |
| Brackets/1000 | ${f.brackets.toFixed(1)} |
| Single-word lines | ${(f.singleWordLines * 100).toFixed(1)}% |
| Question ratio | ${(f.questionRatio * 100).toFixed(1)}% |
| Imperative ratio | ${(f.imperatives * 100).toFixed(2)}% |
| URLs per post avg | ${(f.urls / p.postCount).toFixed(2)} |

**Top function words:** ${p.topFuncWords.slice(0, 10).map(w => `${w.word} (${(w.freq * 100).toFixed(2)}%)`).join(', ')}
`;
}).join('\n')}

## Part 2: Cross-Tripcode Similarity Matrix

Cosine similarity of function word + structural feature vectors. 1.0 = identical, 0.0 = completely different.

${matrixHeader}
${matrixSep}
${matrixRows}

### Similarity Interpretation

${(() => {
  const pairs = [];
  for (let i = 0; i < simMatrix.trips.length; i++) {
    for (let j = i + 1; j < simMatrix.trips.length; j++) {
      pairs.push({
        a: simMatrix.trips[i],
        b: simMatrix.trips[j],
        sim: simMatrix.matrix[simMatrix.trips[i]][simMatrix.trips[j]]
      });
    }
  }
  pairs.sort((a, b) => b.sim - a.sim);
  const avgSim = pairs.reduce((s, p) => s + p.sim, 0) / pairs.length;

  let analysis = `**Average cross-tripcode similarity: ${avgSim.toFixed(3)}**\n\n`;
  analysis += `**Most similar pairs:**\n`;
  pairs.slice(0, 5).forEach(p => {
    analysis += `- ${p.a.substring(0,10)} ↔ ${p.b.substring(0,10)}: ${p.sim} ${p.sim > 0.95 ? '(nearly identical)' : p.sim > 0.9 ? '(very similar)' : p.sim > 0.8 ? '(similar)' : '(moderate)'}\n`;
  });
  analysis += `\n**Least similar pairs:**\n`;
  pairs.slice(-3).forEach(p => {
    analysis += `- ${p.a.substring(0,10)} ↔ ${p.b.substring(0,10)}: ${p.sim} ${p.sim < 0.7 ? '(potentially different author)' : '(moderate divergence)'}\n`;
  });
  return analysis;
})()}

## Part 3: Within-Tripcode Style Drift

First half vs second half of each tripcode period. Low similarity = style changed within that tripcode.

| Tripcode | Similarity | Question Δ | CAPS Δ | Sentence Len Δ | TTR Δ |
|---|---|---|---|---|---|
${Object.entries(drifts).map(([trip, d]) =>
  `| ${trip.substring(0,12)} | ${d.similarity} | ${d.deltas.questionMarks > 0 ? '+' : ''}${d.deltas.questionMarks.toFixed(1)} | ${d.deltas.allCaps > 0 ? '+' : ''}${(d.deltas.allCaps * 100).toFixed(1)}% | ${d.deltas.avgSentenceLen > 0 ? '+' : ''}${d.deltas.avgSentenceLen.toFixed(1)} | ${d.deltas.typeTokenRatio > 0 ? '+' : ''}${d.deltas.typeTokenRatio.toFixed(3)} |`
).join('\n')}

## Part 4: Cognitive Style Analysis (DeepSeek)

${cognitiveAnalysis}

## Part 5: Forensic Assessment

### Key Questions Answered

1. **Minimum author count:** See DeepSeek analysis above. The similarity matrix provides the quantitative foundation.

2. **Tripcode transitions:** If a tripcode change coincides with a significant style shift (low similarity in matrix), it suggests a different person took over. If style remains consistent across tripcode changes, it suggests the same author changed passwords.

3. **The no-tripcode period:** The first 164 posts (Oct 28 - Nov 10, 2017) have no tripcode. Comparing these to the first tripcode period (!ITPb) tests whether the anonymous poster and the first tripcoded poster are the same person.

4. **Style drift within long periods:** The two longest tripcode periods (!!mG7VJxZNCI at 472 days, !!Hs1Jq13jV6 at 1091 days) are most likely to show internal drift — either from author fatigue, author switching, or deliberate style evolution.

### For Phase 10 (Cross-Domain Convergence)
- Author profile should be compared against known public writing samples of suspected Q authors
- Linguistic features should be checked against military/intelligence community writing conventions
- The cognitive style progression (if detected) maps onto the Phase 5 curriculum progression
`;

  writeFileSync(join(OUTPUT_DIR, 'q-drops-phase7-report.md'), report);
  writeFileSync(join(OUTPUT_DIR, 'phase7-profiles.json'), JSON.stringify(profiles, null, 2));
  writeFileSync(join(OUTPUT_DIR, 'phase7-similarity.json'), JSON.stringify(simMatrix, null, 2));
  console.log(`\nReport: ${join(OUTPUT_DIR, 'q-drops-phase7-report.md')}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Q Drops Phase 7: Author Fingerprinting ===\n');

  const raw = JSON.parse(readFileSync(CORPUS_PATH, 'utf8'));
  const posts = raw.posts;
  console.log(`Total posts: ${posts.length}\n`);

  let state = loadCheckpoint();

  // Step 1: Local stylometric analysis (fast, no LLM)
  console.log('=== Step 1: Stylometric Feature Extraction ===\n');
  const profiles = aggregateByTripcode(posts);
  console.log(`Profiles built for ${Object.keys(profiles).length} tripcode periods`);

  for (const [trip, p] of Object.entries(profiles)) {
    console.log(`  ${trip}: ${p.postCount} posts, TTR=${p.features.typeTokenRatio.toFixed(3)}, Q?=${(p.features.questionRatio*100).toFixed(1)}%, CAPS=${(p.features.allCaps*100).toFixed(1)}%`);
  }

  // Step 2: Similarity matrix
  console.log('\n=== Step 2: Cross-Tripcode Similarity ===\n');
  const simMatrix = computeSimilarityMatrix(profiles);

  for (const a of simMatrix.trips) {
    const sims = simMatrix.trips.filter(b => b !== a).map(b => `${b.substring(0,8)}:${simMatrix.matrix[a][b]}`);
    console.log(`  ${a.substring(0,12)}: ${sims.join(', ')}`);
  }

  // Step 3: Style drift
  console.log('\n=== Step 3: Within-Tripcode Drift ===\n');
  const drifts = detectStyleDrift(posts, profiles);
  for (const [trip, d] of Object.entries(drifts)) {
    console.log(`  ${trip.substring(0,12)}: similarity=${d.similarity}, Q_delta=${d.deltas.questionMarks.toFixed(1)}, CAPS_delta=${(d.deltas.allCaps*100).toFixed(1)}%`);
  }

  // Step 4: DeepSeek cognitive analysis (1 API call)
  let cognitiveAnalysis = state.cognitiveAnalysis || '';
  if (!cognitiveAnalysis) {
    cognitiveAnalysis = await analyzeCognitiveStyle(profiles, posts);
    state.cognitiveAnalysis = cognitiveAnalysis;
    state.step = 4;
    saveCheckpoint(state);
  } else {
    console.log('\n=== Step 4: Cognitive Analysis (cached) ===');
  }

  // Generate report
  console.log('\n=== Generating Phase 7 Report ===');
  generateReport(profiles, simMatrix, drifts, cognitiveAnalysis);

  console.log('\nPhase 7 complete.');
}

main().catch(err => { console.error('Phase 7 failed:', err); process.exit(1); });
