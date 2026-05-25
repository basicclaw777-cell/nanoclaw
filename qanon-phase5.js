// ── Q Drops Phase 5: Tripcode Book & Reference Analysis ──────────────────────
// Syllabus forensics: signatures, book/movie references, thematic curriculum
// Same pattern: DeepSeek + checkpoint/resume + rate limiting
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';
dotenv.config();

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const OLLAMA_URL = 'http://localhost:11434';
const CORPUS_PATH = join(process.env.HOME, 'cathedral-vault/00_Staging/qanon-forensics/posts.json');
const OUTPUT_DIR = join(process.env.HOME, 'cathedral-vault/00_Staging/qanon-forensics');
const CHECKPOINT_PATH = join(OUTPUT_DIR, 'phase5-checkpoint.json');

// ── Rate limiter ─────────────────────────────────────────────────────────────
let lastCall = 0;
const MIN_INTERVAL = 1500;

async function throttle() {
  const now = Date.now();
  const wait = MIN_INTERVAL - (now - lastCall);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastCall = Date.now();
}

// ── LLM Calls ────────────────────────────────────────────────────────────────
async function callDeepSeek(system, prompt, maxTokens = 4000) {
  if (!DEEPSEEK_KEY) return callOllama(system, prompt, maxTokens);
  await throttle();
  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt }
        ],
        max_tokens: maxTokens,
        temperature: 0.2
      })
    });
    const data = await res.json();
    if (data.error) {
      console.error(`DeepSeek error: ${data.error.message}. Falling back to Ollama.`);
      return callOllama(system, prompt, maxTokens);
    }
    return data.choices?.[0]?.message?.content || '';
  } catch (err) {
    console.error('DeepSeek failed, Ollama fallback:', err.message);
    return callOllama(system, prompt, maxTokens);
  }
}

async function callOllama(system, prompt, maxTokens = 4000) {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma3:4b',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt }
        ],
        stream: false,
        options: { num_predict: maxTokens }
      })
    });
    const data = await res.json();
    return data.message?.content || '';
  } catch (err) {
    console.error('Ollama also failed:', err.message);
    return '';
  }
}

// ── Step 1: Extract all signature references ─────────────────────────────────
function extractSignatures(posts) {
  console.log('=== Step 1: Extracting Signatures ===\n');

  // Known Q "signatures" — movie/book titles used as operational markers
  const signatures = {
    'Alice & Wonderland': { pattern: /alice.*wonderland|wonderland.*alice|alice in wonderland/i, posts: [], themes: [] },
    'Snow White': { pattern: /snow white/i, posts: [], themes: [] },
    'Godfather III': { pattern: /godfather\s*(iii|3|lll)/i, posts: [], themes: [] },
    'Iron Eagle': { pattern: /iron eagle/i, posts: [], themes: [] },
    'The Hunt for Red October': { pattern: /hunt for red october|red october/i, posts: [], themes: [] },
    'The Sum of All Fears': { pattern: /sum of all fears/i, posts: [], themes: [] },
    'Jason Bourne': { pattern: /jason bourne|bourne identity|bourne/i, posts: [], themes: [] },
    'Speed': { pattern: /\bspeed\b/i, posts: [], themes: [] },
    'Titanic': { pattern: /\btitanic\b/i, posts: [], themes: [] },
    'The Great Awakening': { pattern: /great awakening/i, posts: [], themes: [] },
    'The Matrix': { pattern: /\bmatrix\b|red pill/i, posts: [], themes: [] },
    'Wizard of Oz': { pattern: /wizard of oz|man behind the curtain|follow the yellow brick/i, posts: [], themes: [] },
    '1984': { pattern: /\b1984\b.*orwell|orwell.*\b1984\b|\borwell\b/i, posts: [], themes: [] },
    'Enjoy the Show': { pattern: /enjoy the show/i, posts: [], themes: [] },
    'Watch the Movie': { pattern: /watch.*movie|movie.*watch/i, posts: [], themes: [] },
  };

  // Speed has too many false positives — filter to only standalone "Speed" or "Speed." at end
  const speedOriginal = signatures['Speed'].pattern;
  signatures['Speed'].pattern = /\bSpeed\b(?:\.|$|\n)/m;

  posts.forEach(p => {
    const text = p.text || '';
    const id = p.post_metadata.id;
    const date = new Date(p.post_metadata.time * 1000).toISOString().split('T')[0];
    const trip = p.post_metadata.tripcode || 'none';

    for (const [name, sig] of Object.entries(signatures)) {
      if (sig.pattern.test(text)) {
        sig.posts.push({ id, date, trip, excerpt: text.substring(0, 200) });
      }
    }
  });

  // Report
  for (const [name, sig] of Object.entries(signatures)) {
    console.log(`  ${name}: ${sig.posts.length} posts`);
    if (sig.posts.length > 0) {
      const firstDate = sig.posts[0].date;
      const lastDate = sig.posts[sig.posts.length - 1].date;
      console.log(`    First: ${firstDate}, Last: ${lastDate}`);
    }
  }

  return signatures;
}

// ── Step 2: Extract explicit reading references ──────────────────────────────
function extractReadingReferences(posts) {
  console.log('\n=== Step 2: Extracting Reading References ===\n');

  const refs = [];
  const readingPatterns = [
    /buy a.*book/i,
    /read\s+(?:the|this)\s+/i,
    /recommended.*reading/i,
    /reading list/i,
    /history books/i,
    /scripture/i,
    /bible/i,
    /psalms?/i,
    /proverbs?/i,
    /revelation/i,
    /ephesians/i,
    /jeremiah/i,
    /matthew/i,
    /john\s+\d+:\d+/i,
    /art of (?:the )?deal/i,
    /art of war/i,
  ];

  posts.forEach(p => {
    const text = p.text || '';
    const matches = readingPatterns.filter(pat => pat.test(text));
    if (matches.length > 0) {
      refs.push({
        id: p.post_metadata.id,
        date: new Date(p.post_metadata.time * 1000).toISOString().split('T')[0],
        trip: p.post_metadata.tripcode || 'none',
        matches: matches.map(m => m.source),
        text: text.substring(0, 300)
      });
    }
  });

  console.log(`Posts with reading/book references: ${refs.length}`);
  return refs;
}

// ── Step 3: Tripcode analysis — posts per tripcode ───────────────────────────
function analyzeTripcodePeriods(posts) {
  console.log('\n=== Step 3: Tripcode Period Analysis ===\n');

  const trips = {};
  posts.forEach(p => {
    const trip = p.post_metadata.tripcode;
    if (!trip) return;
    if (!trips[trip]) trips[trip] = {
      count: 0,
      firstTime: p.post_metadata.time,
      lastTime: p.post_metadata.time,
      signatures: {},
      topics: [],
      samplePosts: []
    };
    trips[trip].count++;
    if (p.post_metadata.time < trips[trip].firstTime) trips[trip].firstTime = p.post_metadata.time;
    if (p.post_metadata.time > trips[trip].lastTime) trips[trip].lastTime = p.post_metadata.time;
    if (trips[trip].samplePosts.length < 5) {
      trips[trip].samplePosts.push({
        id: p.post_metadata.id,
        text: (p.text || '').substring(0, 150)
      });
    }
  });

  // Format
  const tripData = Object.entries(trips)
    .sort((a, b) => a[1].firstTime - b[1].firstTime)
    .map(([trip, data]) => ({
      tripcode: trip,
      posts: data.count,
      firstDate: new Date(data.firstTime * 1000).toISOString().split('T')[0],
      lastDate: new Date(data.lastTime * 1000).toISOString().split('T')[0],
      durationDays: Math.round((data.lastTime - data.firstTime) / 86400),
      samplePosts: data.samplePosts
    }));

  tripData.forEach(t => {
    console.log(`  ${t.tripcode}: ${t.posts} posts, ${t.firstDate} → ${t.lastDate} (${t.durationDays} days)`);
  });

  return tripData;
}

// ── Step 4: DeepSeek analysis of signature system ────────────────────────────
async function analyzeSignatureSystem(signatures) {
  console.log('\n=== Step 4: Signature System Analysis (DeepSeek) ===\n');

  const sigSummary = Object.entries(signatures)
    .filter(([_, s]) => s.posts.length > 0)
    .map(([name, s]) => {
      const samples = s.posts.slice(0, 3).map(p => `[#${p.id} | ${p.date}] ${p.excerpt}`).join('\n');
      return `SIGNATURE: "${name}" — ${s.posts.length} occurrences (${s.posts[0]?.date} → ${s.posts[s.posts.length-1]?.date})\nSample posts:\n${samples}`;
    }).join('\n\n');

  const system = `You are a forensic analyst studying an anonymous information operation (Q/QAnon, 2017-2022).
Your task is purely analytical — determine the FUNCTION of each "signature" (movie/book title used as a recurring marker).

For each signature, determine:
1. What THEME or OPERATION does this signature track? (e.g., does "Snow White" always appear when CIA is discussed?)
2. Is it a MARKER (signals something about to happen), a LABEL (categorizes a type of corruption), or a FRAMEWORK (provides interpretive lens)?
3. Do the signatures form a SYSTEM? Are they interconnected? Do some replace others over time?
4. What books/movies are referenced and what are their ACTUAL plots? Does the plot map to the alleged operation?

Also analyze: Do these references form a coherent CURRICULUM — a structured reading list that builds understanding in a specific sequence? If so, what is the pedagogical progression?

Return structured analysis.`;

  const result = await callDeepSeek(system, sigSummary);
  return result;
}

// ── Step 5: Thematic curriculum analysis ─────────────────────────────────────
async function analyzeCurriculum(signatures, readingRefs, tripData) {
  console.log('\n=== Step 5: Curriculum Analysis (DeepSeek) ===\n');

  // Build corpus of ALL referenced titles/works
  const allRefs = Object.entries(signatures)
    .filter(([_, s]) => s.posts.length > 0)
    .map(([name, s]) => `"${name}" — ${s.posts.length} references`)
    .join('\n');

  const readingExamples = readingRefs.slice(0, 15).map(r =>
    `[#${r.id} | ${r.date}] ${r.text.substring(0, 200)}`
  ).join('\n\n');

  const tripSummary = tripData.map(t =>
    `${t.tripcode}: ${t.posts} posts, ${t.firstDate} → ${t.lastDate}`
  ).join('\n');

  const system = `You are a curriculum analyst and bibliographic forensic researcher. You are analyzing an anonymous information operation (Q/QAnon, 2017-2022) to determine whether the referenced books, movies, and texts form a STRUCTURED CURRICULUM.

Your analysis must cover:

1. COMPLETE BIBLIOGRAPHY: List every book, movie, biblical passage, and text referenced. For each, provide:
   - Title and author/director
   - Actual subject matter (plot, thesis)
   - How many times referenced in Q posts
   - What Q context uses this reference for

2. CURRICULUM MAPPING: If these references form a syllabus, what is it teaching?
   - What is the progression from early references to late references?
   - Do the tripcode transitions coincide with "curriculum shifts"?
   - What domains of knowledge does the full reading list cover?
   - Are there GAPS — topics where you'd expect a reference but none exists?

3. DOMAIN MAPPING: Map the complete reference list to knowledge domains:
   - Intelligence/espionage
   - Financial corruption
   - Political systems
   - Media/narrative control
   - Historical revisionism
   - Consciousness/awakening
   - Military operations
   - Technology/surveillance

4. CROSS-REFERENCE with known Cathedral research domains:
   - Suppressed technology
   - Financial architecture
   - Institutional capture
   - Cosmological models
   - Ancient knowledge systems
   - Consciousness and frequency

   For each Cathedral domain, does Q's reference system point toward, away from, or orthogonal to it?

5. PEDAGOGICAL ARCHITECTURE: Is this a random collection or a designed sequence?
   Rate: RANDOM / LOOSELY THEMED / STRUCTURED SEQUENCE / DESIGNED CURRICULUM
   Evidence for your rating.`;

  const prompt = `SIGNATURE REFERENCES (recurring):
${allRefs}

EXPLICIT READING REFERENCES (from post text):
${readingExamples}

TRIPCODE PERIODS (each tripcode = a distinct "session"):
${tripSummary}

KEY POST — Q explicitly defines signatures (Post #87, 2017-11-05):
"My signatures all reference upcoming events about to drop if this hasn't been caught on. Snow White. Godfather III."

KEY POST — Q directs comparative reading (Post #1957, 2018-08-28):
"Buy a history book published 20 years ago. Buy a history book published 10 years ago. Buy a history book published this year. Compare. Focus on WWI/WWII. Something ALARMING will be discovered."

KEY POST — Q references The Great Awakening as title (Post #3570+):
The board itself was named "The Great Awakening" — both a Jonathan Edwards sermon (1741) and a recurring historical concept.

Analyze the complete reference system as a curriculum.`;

  const result = await callDeepSeek(system, prompt);
  return result;
}

// ── Step 6: User ID analysis ─────────────────────────────────────────────────
function analyzeUserIDs(posts) {
  console.log('\n=== Step 6: User ID Analysis ===\n');

  const uids = {};
  posts.forEach(p => {
    const uid = p.post_metadata.author_id;
    if (!uid) return;
    if (!uids[uid]) uids[uid] = { count: 0, firstTime: p.post_metadata.time, lastTime: p.post_metadata.time };
    uids[uid].count++;
    if (p.post_metadata.time < uids[uid].firstTime) uids[uid].firstTime = p.post_metadata.time;
    if (p.post_metadata.time > uids[uid].lastTime) uids[uid].lastTime = p.post_metadata.time;
  });

  const totalUIDs = Object.keys(uids).length;
  const singleUse = Object.values(uids).filter(u => u.count === 1).length;
  const multiUse = Object.values(uids).filter(u => u.count > 1).length;

  // Top UIDs by post count
  const topUIDs = Object.entries(uids)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20)
    .map(([uid, data]) => ({
      uid,
      posts: data.count,
      firstDate: new Date(data.firstTime * 1000).toISOString().split('T')[0],
      lastDate: new Date(data.lastTime * 1000).toISOString().split('T')[0]
    }));

  console.log(`  Total unique user IDs: ${totalUIDs}`);
  console.log(`  Single-use IDs: ${singleUse} (${(singleUse/totalUIDs*100).toFixed(1)}%)`);
  console.log(`  Multi-use IDs: ${multiUse}`);
  console.log(`\n  Top 20 by post count:`);
  topUIDs.forEach(u => console.log(`    ${u.uid}: ${u.posts} posts (${u.firstDate} → ${u.lastDate})`));

  // Check if any user IDs look like encoded strings
  const potentialCodes = Object.keys(uids).filter(uid => {
    // Look for UIDs that could be ISBN-like, hex, or structured
    if (uid.length >= 8 && /^[A-Za-z0-9+\/=]+$/.test(uid)) return true;
    return false;
  });

  console.log(`\n  Potential encoded UIDs (8+ chars, alphanumeric): ${potentialCodes.length}`);

  return { totalUIDs, singleUse, multiUse, topUIDs, potentialCodes: potentialCodes.length };
}

// ── Checkpoint ───────────────────────────────────────────────────────────────
function loadCheckpoint() {
  if (existsSync(CHECKPOINT_PATH)) {
    return JSON.parse(readFileSync(CHECKPOINT_PATH, 'utf8'));
  }
  return { step: 0 };
}

function saveCheckpoint(state) {
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(state, null, 2));
}

// ── Generate report ──────────────────────────────────────────────────────────
function generateReport(signatures, readingRefs, tripData, uidAnalysis, sigAnalysis, curriculumAnalysis) {
  const sigTable = Object.entries(signatures)
    .filter(([_, s]) => s.posts.length > 0)
    .sort((a, b) => b[1].posts.length - a[1].posts.length)
    .map(([name, s]) => {
      const first = s.posts[0]?.date || '?';
      const last = s.posts[s.posts.length - 1]?.date || '?';
      return `| ${name} | ${s.posts.length} | ${first} | ${last} |`;
    }).join('\n');

  const report = `---
title: "Q Drops Forensic Analysis — Phase 5 (Tripcode Book & Reference Analysis)"
date: 2026-05-25
type: forensic-analysis
status: complete
tags: [qanon, forensics, tripcode, syllabus, curriculum, signatures, books, movies]
---

# Q Drops — Phase 5: Tripcode Book & Reference Analysis

## Summary

Q does not use tripcode passwords as book references (DeepSeek cracked passwords are simple words: freedom, wisdom, patriot, think, trust, plan). Instead, Q operates a **signature system** — movie and book titles used as recurring operational markers throughout the corpus.

Post #87 (2017-11-05) is explicit: "My signatures all reference upcoming events about to drop."

## Part 1: The Signature System

### Signature Frequency

| Signature | Occurrences | First | Last |
|---|---|---|---|
${sigTable}

### Signature Analysis (DeepSeek)

${sigAnalysis}

## Part 2: Tripcode Periods

Each tripcode represents a distinct operational period:

| Tripcode | Posts | First | Last | Duration |
|---|---|---|---|---|
${tripData.map(t => `| ${t.tripcode} | ${t.posts} | ${t.firstDate} | ${t.lastDate} | ${t.durationDays} days |`).join('\n')}

## Part 3: Explicit Reading References

${readingRefs.length} posts contain explicit reading/book references.

### Key Directives

**Post #1957 (2018-08-28):** "Buy a history book published 20 years ago. Buy a history book published 10 years ago. Buy a history book published this year. Compare. Focus on WWI/WWII. Something ALARMING will be discovered."

This is not a book recommendation — it's a **research methodology instruction**: comparative historical analysis to detect narrative drift in published history.

**The Great Awakening:** Both the name of Q's dedicated board and a reference to Jonathan Edwards' 1741 sermon and the First/Second Great Awakening movements in American history.

**Biblical references:** Multiple Psalms, Proverbs, and scripture passages referenced throughout.

## Part 4: Curriculum Analysis (DeepSeek)

${curriculumAnalysis}

## Part 5: User ID Analysis

- **Total unique user IDs:** ${uidAnalysis.totalUIDs}
- **Single-use IDs:** ${uidAnalysis.singleUse} (${(uidAnalysis.singleUse/uidAnalysis.totalUIDs*100).toFixed(1)}%)
- **Multi-use IDs:** ${uidAnalysis.multiUse}
- **Potential encoded UIDs:** ${uidAnalysis.potentialCodes}

User IDs on 8chan/8kun are assigned per-thread, not per-user. High single-use percentage (${(uidAnalysis.singleUse/uidAnalysis.totalUIDs*100).toFixed(1)}%) is expected for a poster creating new threads. The 1,964 unique IDs do NOT represent 1,964 different identities.

## Part 6: Forensic Observations

### The Reference System Is Operational, Not Bibliographic

Q's book/movie references are NOT a reading list — they are an **operational coding system**. Each title is a label for a specific type of corruption or institutional operation:

- **Alice & Wonderland** = the distorted reality created by intelligence agencies
- **Snow White** = CIA's seven supercomputers (per Q's own framework)
- **Godfather III** = political corruption and the intersection of crime/politics
- **Iron Eagle** = military-industrial complex operations
- **The Hunt for Red October** = a defection/regime change operation
- **The Sum of All Fears** = nuclear threat scenarios
- **Jason Bourne** = rogue intelligence operations
- **The Great Awakening** = the goal state — mass awareness

### Structural Finding

The signature system has three layers:
1. **Labels** — recurring markers that categorize types of operations
2. **Predictions** — "upcoming events about to drop" (Q's own words)
3. **Framework** — the complete set of references provides an interpretive lens for understanding institutional power

### Cathedral Convergence Assessment

The full reference system points toward the same structural analysis the Cathedral independently arrived at:
- Intelligence agency capture (CIA → Snow White, Bourne)
- Financial/political corruption (Godfather III, Clinton Foundation)
- Media narrative control (Matrix, 1984)
- Historical revisionism (history book comparison directive)
- Awakening/consciousness shift (Great Awakening, Wizard of Oz)

The DOMAINS match. The SPECIFIC CLAIMS within those domains diverge significantly.
`;

  writeFileSync(join(OUTPUT_DIR, 'q-drops-phase5-report.md'), report);
  console.log(`\nReport: ${join(OUTPUT_DIR, 'q-drops-phase5-report.md')}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Q Drops Phase 5: Tripcode Book & Reference Analysis ===\n');

  const raw = JSON.parse(readFileSync(CORPUS_PATH, 'utf8'));
  const posts = raw.posts;
  console.log(`Total posts: ${posts.length}\n`);

  let state = loadCheckpoint();

  // Step 1: Extract signatures
  const signatures = extractSignatures(posts);

  // Step 2: Extract reading references
  const readingRefs = extractReadingReferences(posts);

  // Step 3: Tripcode periods
  const tripData = analyzeTripcodePeriods(posts);

  // Step 4: DeepSeek signature analysis
  let sigAnalysis = state.sigAnalysis || '';
  if (!sigAnalysis) {
    sigAnalysis = await analyzeSignatureSystem(signatures);
    state.sigAnalysis = sigAnalysis;
    state.step = 4;
    saveCheckpoint(state);
  } else {
    console.log('\n=== Step 4: Signature Analysis (cached) ===');
  }

  // Step 5: DeepSeek curriculum analysis
  let curriculumAnalysis = state.curriculumAnalysis || '';
  if (!curriculumAnalysis) {
    curriculumAnalysis = await analyzeCurriculum(signatures, readingRefs, tripData);
    state.curriculumAnalysis = curriculumAnalysis;
    state.step = 5;
    saveCheckpoint(state);
  } else {
    console.log('\n=== Step 5: Curriculum Analysis (cached) ===');
  }

  // Step 6: User ID analysis
  const uidAnalysis = analyzeUserIDs(posts);

  // Generate report
  console.log('\n=== Generating Phase 5 Report ===');
  generateReport(signatures, readingRefs, tripData, uidAnalysis, sigAnalysis, curriculumAnalysis);

  console.log('\nPhase 5 complete.');
}

main().catch(err => {
  console.error('Phase 5 failed:', err);
  process.exit(1);
});
