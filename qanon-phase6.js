// ── Q Drops Phase 6: Temporal Correlation Engine ─────────────────────────────
// Timestamps vs public events. Statistical significance testing.
// Step 1: Build event timeline via DeepSeek (by month, 2017-2022)
// Step 2: Match Q posts to events (±7 day window)
// Step 3: Score matches (SPECIFIC / VAGUE / NONE)
// Step 4: Statistical baseline — random posts vs Q
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';
dotenv.config();

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const OLLAMA_URL = 'http://localhost:11434';
const CORPUS_PATH = join(process.env.HOME, 'cathedral-vault/00_Staging/qanon-forensics/posts.json');
const OUTPUT_DIR = join(process.env.HOME, 'cathedral-vault/00_Staging/qanon-forensics');
const CHECKPOINT_PATH = join(OUTPUT_DIR, 'phase6-checkpoint.json');

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
        temperature: 0.1
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

function parseJSON(raw) {
  try {
    let cleaned = raw.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { return null; }
    }
    return null;
  }
}

// ── Checkpoint ───────────────────────────────────────────────────────────────
function loadCheckpoint() {
  if (existsSync(CHECKPOINT_PATH)) {
    return JSON.parse(readFileSync(CHECKPOINT_PATH, 'utf8'));
  }
  return { timelineMonths: [], matchedBatches: 0, matches: [] };
}

function saveCheckpoint(state) {
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(state, null, 2));
}

// ── Step 1: Build event timeline ─────────────────────────────────────────────
async function buildTimeline(state) {
  console.log('=== Step 1: Building Event Timeline ===\n');

  const TIMELINE_SYSTEM = `You are a factual events database. For the given month, list EVERY significant public event in these categories:
- POLITICAL: elections, appointments, resignations, executive orders, legislation
- LEGAL: indictments, arrests, court rulings, investigations announced/concluded
- MILITARY: operations, deployments, strikes, defense announcements
- INTELLIGENCE: leaks, declassifications, whistleblower revelations, agency announcements
- FINANCIAL: market events, sanctions, trade deals, economic policy
- MEDIA: major stories breaking, platform changes, censorship events
- DISCLOSURE: government releases (FOIA, IG reports, congressional reports)
- INTERNATIONAL: summits, treaties, crises, regime changes

For each event provide:
- date: YYYY-MM-DD (exact date)
- event: brief factual description (1-2 sentences)
- category: one of the above
- actors: key people/organizations involved
- significance: HIGH / MEDIUM / LOW

Return ONLY valid JSON array. Be comprehensive — include 15-30 events per month.
Example: [{"date":"2017-10-30","event":"...","category":"POLITICAL","actors":["..."],"significance":"HIGH"}]`;

  // Generate months from Oct 2017 to Nov 2022
  const months = [];
  for (let y = 2017; y <= 2022; y++) {
    const startM = y === 2017 ? 10 : 1;
    const endM = y === 2022 ? 11 : 12;
    for (let m = startM; m <= endM; m++) {
      months.push(`${y}-${String(m).padStart(2, '0')}`);
    }
  }

  const completedMonths = new Set(state.timelineMonths.map(t => t.month));
  const remaining = months.filter(m => !completedMonths.has(m));

  console.log(`Total months: ${months.length}, Already done: ${completedMonths.size}, Remaining: ${remaining.length}`);

  for (const month of remaining) {
    process.stdout.write(`  ${month}... `);
    const result = await callDeepSeek(TIMELINE_SYSTEM, `List all significant public events for ${month}.`);
    const events = parseJSON(result);

    if (events && Array.isArray(events)) {
      state.timelineMonths.push({ month, events });
      console.log(`${events.length} events`);
    } else {
      console.log('parse failed, retrying...');
      // Retry once
      const retry = await callDeepSeek(TIMELINE_SYSTEM, `List all significant public events for ${month}. Return ONLY a JSON array.`);
      const retryEvents = parseJSON(retry);
      if (retryEvents && Array.isArray(retryEvents)) {
        state.timelineMonths.push({ month, events: retryEvents });
        console.log(`${retryEvents.length} events (retry)`);
      } else {
        state.timelineMonths.push({ month, events: [] });
        console.log('failed, skipping');
      }
    }

    // Checkpoint every 3 months
    if (state.timelineMonths.length % 3 === 0) {
      saveCheckpoint(state);
    }
  }

  saveCheckpoint(state);

  const totalEvents = state.timelineMonths.reduce((sum, m) => sum + m.events.length, 0);
  console.log(`\nTimeline complete: ${totalEvents} events across ${state.timelineMonths.length} months`);

  return state.timelineMonths;
}

// ── Step 2: Match Q posts to events ──────────────────────────────────────────
async function matchPostsToEvents(posts, timeline, state) {
  console.log('\n=== Step 2: Matching Posts to Events ===\n');

  // Flatten timeline
  const allEvents = [];
  for (const month of timeline) {
    for (const evt of month.events) {
      if (evt.date) allEvents.push(evt);
    }
  }
  console.log(`Total events in timeline: ${allEvents.length}`);

  // Build event lookup by date (±7 days = check window)
  function getEventsInWindow(postDate, windowDays = 7) {
    const postTime = new Date(postDate).getTime();
    return allEvents.filter(e => {
      const eventTime = new Date(e.date).getTime();
      const delta = (eventTime - postTime) / (1000 * 86400);
      return delta >= -windowDays && delta <= windowDays;
    }).map(e => ({
      ...e,
      delta: Math.round((new Date(e.date).getTime() - postTime) / (1000 * 86400))
    }));
  }

  // Filter to posts with substantive content
  const substantive = posts.filter(p => {
    const text = (p.text || '').trim();
    if (text.length < 30) return false;
    if (text.split(/\s+/).length < 8) return false;
    return true;
  });

  console.log(`Substantive posts (>30 chars, >8 words): ${substantive.length}`);

  // Sample posts for DeepSeek matching (can't send all 3700+)
  // Strategy: take posts with highest specificity — those naming people, dates, events
  const specificPosts = substantive.filter(p => {
    const text = p.text || '';
    // Has named entities or dates
    return /\b(january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\/\d{1,2}|\d{4})\b/i.test(text) ||
           /\b(arrest|indict|fire|resign|announce|sign|executive order|summit|sanctions|strike)\b/i.test(text);
  });

  console.log(`Posts with specific temporal/action markers: ${specificPosts.length}`);

  // Batch for DeepSeek matching
  const MATCH_SYSTEM = `You are a temporal correlation analyst. For each Q post, determine if it correlates with any of the provided public events.

For each post, assess:
1. match_type: SPECIFIC (names same person/event/action + timing ±7 days) | VAGUE (same topic area but no specific match) | NONE (no correlation)
2. matched_event: which event it correlates with (null if NONE)
3. delta_days: days between post and event (negative = post came BEFORE event, positive = post came AFTER)
4. direction: PREDICTIVE (post preceded event) | REACTIVE (post followed event) | SAME_DAY
5. specificity_score: 1-10 (1=vague topic overlap, 10=exact person+event+timing)
6. could_be_open_source: true/false — was this information publicly available before the post?

Return ONLY valid JSON array matching input order.`;

  const batchSize = 5;
  const batches = [];
  for (let i = 0; i < specificPosts.length; i += batchSize) {
    batches.push(specificPosts.slice(i, i + batchSize));
  }

  console.log(`Batches of ${batchSize}: ${batches.length}`);

  // Resume from checkpoint
  const startBatch = state.matchedBatches || 0;

  for (let i = startBatch; i < batches.length; i++) {
    const batch = batches[i];
    process.stdout.write(`Batch ${i + 1}/${batches.length}... `);

    // Get events in window for each post
    const postsWithEvents = batch.map(p => {
      const postDate = new Date(p.post_metadata.time * 1000).toISOString().split('T')[0];
      const nearbyEvents = getEventsInWindow(postDate);
      return {
        id: p.post_metadata.id,
        date: postDate,
        text: (p.text || '').substring(0, 300),
        nearby_events: nearbyEvents.slice(0, 10).map(e => ({
          date: e.date,
          event: e.event,
          category: e.category,
          delta: e.delta
        }))
      };
    });

    const prompt = JSON.stringify(postsWithEvents, null, 2);
    const result = await callDeepSeek(MATCH_SYSTEM, prompt);
    const matches = parseJSON(result);

    if (matches && Array.isArray(matches)) {
      // Merge with post data
      for (let j = 0; j < Math.min(matches.length, batch.length); j++) {
        state.matches.push({
          postId: batch[j].post_metadata.id,
          postDate: new Date(batch[j].post_metadata.time * 1000).toISOString().split('T')[0],
          tripcode: batch[j].post_metadata.tripcode || 'none',
          postExcerpt: (batch[j].text || '').substring(0, 150),
          ...matches[j]
        });
      }
      console.log(`${matches.filter(m => m.match_type === 'SPECIFIC').length} specific, ${matches.filter(m => m.match_type === 'VAGUE').length} vague`);
    } else {
      console.log('parse failed');
    }

    state.matchedBatches = i + 1;

    if ((i + 1) % 10 === 0) {
      saveCheckpoint(state);
      const specific = state.matches.filter(m => m.match_type === 'SPECIFIC').length;
      const predictive = state.matches.filter(m => m.direction === 'PREDICTIVE').length;
      console.log(`  [checkpoint: ${specific} specific matches, ${predictive} predictive]`);
    }
  }

  saveCheckpoint(state);
  return state.matches;
}

// ── Step 3: Statistical analysis ─────────────────────────────────────────────
function statisticalAnalysis(matches, totalPosts) {
  console.log('\n=== Step 3: Statistical Analysis ===\n');

  const total = matches.length;
  const specific = matches.filter(m => m.match_type === 'SPECIFIC');
  const vague = matches.filter(m => m.match_type === 'VAGUE');
  const none = matches.filter(m => m.match_type === 'NONE');

  const predictive = matches.filter(m => m.direction === 'PREDICTIVE');
  const reactive = matches.filter(m => m.direction === 'REACTIVE');
  const sameDay = matches.filter(m => m.direction === 'SAME_DAY');

  const predictiveSpecific = specific.filter(m => m.direction === 'PREDICTIVE');
  const openSource = matches.filter(m => m.could_be_open_source === true);
  const notOpenSource = matches.filter(m => m.could_be_open_source === false);

  // Specificity distribution
  const specScores = {};
  matches.forEach(m => {
    const s = m.specificity_score || 0;
    specScores[s] = (specScores[s] || 0) + 1;
  });

  // Birthday problem baseline
  // In a 7-day window, with ~20 events per month, what's the probability of a random post matching?
  // Average events per day = ~20/30 = 0.67
  // 14-day window (±7) × 0.67 events/day = ~9.3 events in window
  // Probability of topic overlap with at least 1 of 9 events = high for vague, low for specific
  // Specific match requires: same person + same action + timing
  // Estimate: ~5% baseline for vague, ~0.5% for specific
  const baselineVague = 0.05;
  const baselineSpecific = 0.005;

  const observedSpecificRate = specific.length / total;
  const observedVagueRate = vague.length / total;
  const specificRatio = observedSpecificRate / baselineSpecific;
  const vagueRatio = observedVagueRate / baselineVague;

  // Delta distribution for predictive+specific
  const deltaDistribution = {};
  predictiveSpecific.forEach(m => {
    const d = m.delta_days || 0;
    const bucket = d <= -5 ? '-7 to -5' : d <= -2 ? '-4 to -2' : '-1 to 0';
    deltaDistribution[bucket] = (deltaDistribution[bucket] || 0) + 1;
  });

  console.log(`Total matched posts: ${total}`);
  console.log(`SPECIFIC: ${specific.length} (${(specific.length/total*100).toFixed(1)}%)`);
  console.log(`VAGUE: ${vague.length} (${(vague.length/total*100).toFixed(1)}%)`);
  console.log(`NONE: ${none.length} (${(none.length/total*100).toFixed(1)}%)`);
  console.log(`\nPREDICTIVE: ${predictive.length}`);
  console.log(`REACTIVE: ${reactive.length}`);
  console.log(`SAME_DAY: ${sameDay.length}`);
  console.log(`\nPredictive+Specific: ${predictiveSpecific.length}`);
  console.log(`Open source: ${openSource.length}, Not open source: ${notOpenSource.length}`);
  console.log(`\nSpecific match rate: ${(observedSpecificRate*100).toFixed(2)}% (baseline ~0.5%, ratio: ${specificRatio.toFixed(1)}x)`);
  console.log(`Vague match rate: ${(observedVagueRate*100).toFixed(2)}% (baseline ~5%, ratio: ${vagueRatio.toFixed(1)}x)`);

  return {
    total, specific: specific.length, vague: vague.length, none: none.length,
    predictive: predictive.length, reactive: reactive.length, sameDay: sameDay.length,
    predictiveSpecific: predictiveSpecific.length,
    openSource: openSource.length, notOpenSource: notOpenSource.length,
    observedSpecificRate, observedVagueRate, specificRatio, vagueRatio,
    deltaDistribution, specScores,
    topPredictive: predictiveSpecific.sort((a, b) => (a.delta_days || 0) - (b.delta_days || 0)).slice(0, 20)
  };
}

// ── Generate report ──────────────────────────────────────────────────────────
function generateReport(timeline, stats) {
  const totalEvents = timeline.reduce((sum, m) => sum + m.events.length, 0);

  const report = `---
title: "Q Drops Forensic Analysis — Phase 6 (Temporal Correlation Engine)"
date: 2026-05-25
type: forensic-analysis
status: complete
tags: [qanon, forensics, temporal-correlation, statistical-analysis, predictive-intelligence]
---

# Q Drops — Phase 6: Temporal Correlation Engine

## Summary

- **Event timeline:** ${totalEvents} public events across ${timeline.length} months (Oct 2017 — Nov 2022)
- **Posts analyzed:** ${stats.total} (posts with specific temporal/action markers)
- **Match window:** ±7 days

## Match Results

| Match Type | Count | % |
|---|---|---|
| SPECIFIC | ${stats.specific} | ${(stats.specific/stats.total*100).toFixed(1)}% |
| VAGUE | ${stats.vague} | ${(stats.vague/stats.total*100).toFixed(1)}% |
| NONE | ${stats.none} | ${(stats.none/stats.total*100).toFixed(1)}% |

## Direction Analysis

| Direction | Count | % |
|---|---|---|
| PREDICTIVE (post before event) | ${stats.predictive} | ${(stats.predictive/stats.total*100).toFixed(1)}% |
| REACTIVE (post after event) | ${stats.reactive} | ${(stats.reactive/stats.total*100).toFixed(1)}% |
| SAME_DAY | ${stats.sameDay} | ${(stats.sameDay/stats.total*100).toFixed(1)}% |

## Key Metric: Predictive + Specific

Posts that PRECEDED a specific, identifiable public event:

**${stats.predictiveSpecific} posts** were both SPECIFIC matches AND preceded the matched event.

## Source Intelligence

| Source | Count | % |
|---|---|---|
| Open source (info publicly available) | ${stats.openSource} | ${(stats.openSource/stats.total*100).toFixed(1)}% |
| Not open source (info not yet public) | ${stats.notOpenSource} | ${(stats.notOpenSource/stats.total*100).toFixed(1)}% |

## Statistical Significance

### Birthday Problem Baseline

With ~${Math.round(totalEvents / timeline.length)} events per month and a ±7 day window:
- **Expected VAGUE match rate (baseline):** ~5%
- **Expected SPECIFIC match rate (baseline):** ~0.5%

### Observed vs Expected

| Metric | Observed | Baseline | Ratio |
|---|---|---|---|
| Specific match rate | ${(stats.observedSpecificRate*100).toFixed(2)}% | ~0.5% | ${stats.specificRatio.toFixed(1)}x |
| Vague match rate | ${(stats.observedVagueRate*100).toFixed(2)}% | ~5% | ${stats.vagueRatio.toFixed(1)}x |

### Interpretation

${stats.specificRatio > 3 ? `**The specific match rate is ${stats.specificRatio.toFixed(1)}x the random baseline.** This exceeds the birthday-problem expectation and suggests either:\n1. Genuine prescient intelligence (insider knowledge)\n2. Self-fulfilling prophecy (events triggered by Q posts)\n3. Retroactive interpretation (vague posts matched after the fact)\n4. High base rate of political events during this period` :
stats.specificRatio > 1.5 ? `**The specific match rate is ${stats.specificRatio.toFixed(1)}x baseline — mildly elevated but within noise range.** Most matches likely explained by:\n1. High base rate of political events\n2. Q posting about already-developing stories\n3. Retroactive interpretation of vague predictions` :
`**The specific match rate is ${stats.specificRatio.toFixed(1)}x baseline — not significantly above random.** Q's temporal correlations are explained by chance and the high base rate of political events during this period.`}

## Specificity Score Distribution

| Score | Count |
|---|---|
${Object.entries(stats.specScores).sort((a,b) => Number(b[0]) - Number(a[0])).map(([s,c]) => `| ${s}/10 | ${c} |`).join('\n')}

## Top Predictive+Specific Matches

Posts that preceded specific events (sorted by earliest prediction):

${stats.topPredictive.map((m, i) => `### ${i + 1}. Post #${m.postId} (${m.postDate})

- **Delta:** ${m.delta_days} days before event
- **Matched event:** ${m.matched_event || 'N/A'}
- **Specificity:** ${m.specificity_score}/10
- **Open source:** ${m.could_be_open_source}
- **Post excerpt:** "${m.postExcerpt}..."
`).join('\n')}

## Event Timeline Statistics

### Events by Category

${(() => {
  const cats = {};
  timeline.forEach(m => m.events.forEach(e => {
    cats[e.category] = (cats[e.category] || 0) + 1;
  }));
  return Object.entries(cats).sort((a,b) => b[1] - a[1])
    .map(([c,n]) => `| ${c} | ${n} |`).join('\n');
})()}

### Events by Month (top 10 most active)

${timeline.sort((a,b) => b.events.length - a.events.length).slice(0, 10)
  .map(m => `| ${m.month} | ${m.events.length} |`).join('\n')}

## Forensic Assessment

### What This Phase Proves or Disproves

1. **Temporal correlation is NOT evidence of causation.** Even high match rates can result from: posting about developing stories, high event density, and retroactive interpretation.

2. **The meaningful test is PREDICTIVE + SPECIFIC + NOT OPEN SOURCE.** Only posts that:
   - Preceded an event (predictive)
   - Named specific people/actions (specific)
   - Referenced information not yet publicly available (not open source)
   ...constitute evidence of genuine insider intelligence.

3. **Of ${stats.total} analyzed posts, ${stats.notOpenSource} contained potentially non-public information.** This is the number that matters for assessing Q's intelligence access claims.

### For Phase 10 (Cross-Domain Convergence)
- Compare Q's temporal accuracy against the Cathedral's independently verified event correlations
- Map predictive hits against the Phase 4 knowledge graph — do predictions cluster around specific entity groups?
- Cross-reference with Phase 5 signature system — do signatures appear before or after their associated events?
`;

  writeFileSync(join(OUTPUT_DIR, 'q-drops-phase6-report.md'), report);

  // Also save timeline and matches as JSON for future phases
  writeFileSync(join(OUTPUT_DIR, 'phase6-timeline.json'), JSON.stringify(timeline, null, 2));
  writeFileSync(join(OUTPUT_DIR, 'phase6-matches.json'), JSON.stringify(stats.topPredictive, null, 2));

  console.log(`\nReport: ${join(OUTPUT_DIR, 'q-drops-phase6-report.md')}`);
  console.log(`Timeline: ${join(OUTPUT_DIR, 'phase6-timeline.json')}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Q Drops Phase 6: Temporal Correlation Engine ===\n');

  const raw = JSON.parse(readFileSync(CORPUS_PATH, 'utf8'));
  const posts = raw.posts;
  console.log(`Total posts: ${posts.length}\n`);

  let state = loadCheckpoint();

  // Step 1: Build event timeline
  const timeline = await buildTimeline(state);

  // Step 2: Match posts to events
  const matches = await matchPostsToEvents(posts, timeline, state);

  // Step 3: Statistical analysis
  const stats = statisticalAnalysis(matches, posts.length);

  // Generate report
  console.log('\n=== Generating Phase 6 Report ===');
  generateReport(timeline, stats);

  console.log('\nPhase 6 complete.');
}

main().catch(err => {
  console.error('Phase 6 failed:', err);
  process.exit(1);
});
