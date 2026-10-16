import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STAGING = path.join(process.env.HOME, 'cathedral-vault/00_Staging/qanon-forensics');
const POSTS_FILE = path.join(STAGING, 'posts.json');

// ── Load corpus ──────────────────────────────────────────────────────────────

function loadPosts() {
  const data = JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8'));
  return data.posts.map(p => ({
    id: p.post_metadata.id,
    time: new Date(p.post_metadata.time * 1000),
    text: p.text || '',
    tripcode: p.post_metadata.tripcode || 'none',
    board: p.post_metadata.source?.board || '',
    site: p.post_metadata.source?.site || '',
    author_id: p.post_metadata.author_id || '',
    post_id: p.post_metadata.post_id || '',
    link: p.post_metadata.source?.link || '',
    images: p.images || [],
    refs: p.referenced_posts || [],
    wordCount: (p.text || '').split(/\s+/).filter(Boolean).length
  }));
}

// ── Analysis 1: Linguistic Fingerprinting ────────────────────────────────────

function linguisticAnalysis(posts) {
  const byTripcode = {};
  for (const p of posts) {
    if (!byTripcode[p.tripcode]) byTripcode[p.tripcode] = [];
    byTripcode[p.tripcode].push(p);
  }

  const profiles = {};
  for (const [trip, tripPosts] of Object.entries(byTripcode)) {
    const allText = tripPosts.map(p => p.text).join(' ');
    const words = allText.toLowerCase().split(/\s+/).filter(Boolean);
    const totalWords = words.length;

    // Vocabulary richness (type-token ratio on first 1000 words)
    const sample = words.slice(0, 1000);
    const uniqueInSample = new Set(sample).size;
    const ttr = sample.length > 0 ? uniqueInSample / sample.length : 0;

    // Average sentence length (split on . ! ? \n)
    const sentences = allText.split(/[.!?\n]+/).filter(s => s.trim().length > 3);
    const avgSentLen = sentences.length > 0 ? totalWords / sentences.length : 0;

    // Question frequency
    const questionMarks = (allText.match(/\?/g) || []).length;
    const questionRate = questionMarks / tripPosts.length;

    // ALL CAPS usage
    const capsWords = words.filter(w => w.length > 2 && w === w.toUpperCase() && /[A-Z]/.test(w));
    const capsRate = capsWords.length / Math.max(totalWords, 1);

    // Signature phrases
    const phrases = {};
    const phrasePatterns = [
      'nothing is random', 'future proves past', 'think mirror', 'trust the plan',
      'these people are sick', 'where we go one', 'dark to light', 'the great awakening',
      'patriots in control', 'enjoy the show', 'game over', 'boom', 'panic in dc',
      'follow the money', 'think logically', 'do you believe in coincidences',
      'what makes a good movie', 'hunters become the hunted', 'pain coming',
      'god wins', 'you are watching a movie', 'together we are strong'
    ];
    for (const phrase of phrasePatterns) {
      const count = (allText.toLowerCase().match(new RegExp(phrase, 'gi')) || []).length;
      if (count > 0) phrases[phrase] = count;
    }

    // Date range
    const times = tripPosts.map(p => p.time);
    const firstDate = new Date(Math.min(...times));
    const lastDate = new Date(Math.max(...times));

    profiles[trip] = {
      count: tripPosts.length,
      totalWords,
      avgPostLength: totalWords / tripPosts.length,
      vocabularyRichness: ttr,
      avgSentenceLength: avgSentLen,
      questionRate,
      capsRate,
      signaturePhrases: phrases,
      dateRange: `${firstDate.toISOString().slice(0,10)} to ${lastDate.toISOString().slice(0,10)}`,
      boards: [...new Set(tripPosts.map(p => p.board))],
      sites: [...new Set(tripPosts.map(p => p.site))]
    };
  }

  // Transition analysis
  const transitions = [];
  const sortedTrips = Object.entries(profiles)
    .filter(([k]) => k !== 'none')
    .sort((a, b) => {
      const aStart = byTripcode[a[0]][0].time;
      const bStart = byTripcode[b[0]][0].time;
      return aStart - bStart;
    });

  for (let i = 1; i < sortedTrips.length; i++) {
    const prev = sortedTrips[i-1];
    const curr = sortedTrips[i];
    transitions.push({
      from: prev[0],
      to: curr[0],
      styleDrift: {
        avgPostLengthDelta: curr[1].avgPostLength - prev[1].avgPostLength,
        vocabRichnessDelta: curr[1].vocabularyRichness - prev[1].vocabularyRichness,
        questionRateDelta: curr[1].questionRate - prev[1].questionRate,
        capsRateDelta: curr[1].capsRate - prev[1].capsRate
      }
    });
  }

  return { profiles, transitions, tripcodeTimeline: sortedTrips.map(([k, v]) => ({ tripcode: k, ...v })) };
}

// ── Analysis 2: Content Classification ───────────────────────────────────────

function contentClassification(posts) {
  const categories = {
    questions: [],         // Socratic method posts (mostly questions)
    directives: [],        // Commands/instructions
    predictions: [],       // Future-tense claims
    references: [],        // Links to external sources
    cryptic: [],           // Very short, coded language
    narrativeBuilding: [], // Long explanatory posts
  };

  for (const p of posts) {
    const text = p.text;
    const questions = (text.match(/\?/g) || []).length;
    const words = p.wordCount;

    if (questions >= 3 && questions > words / 10) {
      categories.questions.push(p.id);
    }
    if (words < 20 && /[A-Z]{3,}/.test(text)) {
      categories.cryptic.push(p.id);
    }
    if (words > 100) {
      categories.narrativeBuilding.push(p.id);
    }
    if (/will |shall |going to |upcoming |soon |imminent|prepare/i.test(text)) {
      categories.predictions.push(p.id);
    }
    if (/https?:\/\//.test(text)) {
      categories.references.push(p.id);
    }
  }

  return {
    questions: categories.questions.length,
    cryptic: categories.cryptic.length,
    narrativeBuilding: categories.narrativeBuilding.length,
    predictions: categories.predictions.length,
    references: categories.references.length,
    totalPosts: posts.length
  };
}

// ── Analysis 3: Temporal Patterns ────────────────────────────────────────────

function temporalAnalysis(posts) {
  // Posts per hour of day (UTC)
  const hourDist = new Array(24).fill(0);
  for (const p of posts) {
    hourDist[p.time.getUTCHours()]++;
  }

  // Posts per day of week
  const dayDist = new Array(7).fill(0);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (const p of posts) {
    dayDist[p.time.getUTCDay()]++;
  }

  // Gap analysis — longest silences
  const sorted = [...posts].sort((a, b) => a.time - b.time);
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    const gapHours = (sorted[i].time - sorted[i-1].time) / (1000 * 60 * 60);
    if (gapHours > 48) { // Only gaps > 2 days
      gaps.push({
        afterPost: sorted[i-1].id,
        beforePost: sorted[i].id,
        gapHours: Math.round(gapHours),
        gapDays: Math.round(gapHours / 24),
        from: sorted[i-1].time.toISOString().slice(0,10),
        to: sorted[i].time.toISOString().slice(0,10)
      });
    }
  }
  gaps.sort((a, b) => b.gapHours - a.gapHours);

  // Posting velocity (posts per week, rolling)
  const weeklyVelocity = [];
  let weekStart = new Date(sorted[0].time);
  let weekCount = 0;
  for (const p of sorted) {
    if (p.time - weekStart > 7 * 24 * 60 * 60 * 1000) {
      weeklyVelocity.push({ week: weekStart.toISOString().slice(0,10), posts: weekCount });
      weekStart = new Date(p.time);
      weekCount = 0;
    }
    weekCount++;
  }

  return {
    hourDistribution: hourDist.map((count, hour) => ({ hour, count })),
    dayDistribution: dayDist.map((count, i) => ({ day: dayNames[i], count })),
    topGaps: gaps.slice(0, 15),
    peakHour: hourDist.indexOf(Math.max(...hourDist)),
    peakDay: dayNames[dayDist.indexOf(Math.max(...dayDist))],
    avgPostsPerDay: (posts.length / ((sorted[sorted.length-1].time - sorted[0].time) / (1000*60*60*24))).toFixed(2)
  };
}

// ── Analysis 4: Named Entity & Topic Extraction ──────────────────────────────

function entityExtraction(posts) {
  const allText = posts.map(p => p.text).join('\n');

  // People mentioned (crude but fast — uppercase word pairs)
  const namePattern = /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)\b/g;
  const names = {};
  let match;
  while ((match = namePattern.exec(allText)) !== null) {
    const name = match[1];
    if (name.length > 4) { // Skip short fragments
      names[name] = (names[name] || 0) + 1;
    }
  }

  // Acronyms and codes
  const acronyms = {};
  const acroPattern = /\b([A-Z]{2,6})\b/g;
  while ((match = acroPattern.exec(allText)) !== null) {
    const acro = match[1];
    if (!['THE', 'AND', 'FOR', 'NOT', 'ARE', 'BUT', 'WAS', 'HAS', 'HAD', 'HIS', 'HER', 'HIM', 'WHO', 'HOW', 'WHY', 'ALL', 'CAN', 'DID', 'GET', 'GOT', 'HIT', 'LET', 'MAY', 'NEW', 'NOW', 'OLD', 'OUR', 'OUT', 'OWN', 'SAY', 'SHE', 'TOO', 'USE', 'WAY', 'YOU'].includes(acro)) {
      acronyms[acro] = (acronyms[acro] || 0) + 1;
    }
  }

  // Top names
  const topNames = Object.entries(names)
    .filter(([, count]) => count >= 5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50);

  // Top acronyms
  const topAcronyms = Object.entries(acronyms)
    .filter(([, count]) => count >= 10)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50);

  return { topNames, topAcronyms };
}

// ── Analysis 5: Self-Reference Network ───────────────────────────────────────

function selfReferenceAnalysis(posts) {
  let totalRefs = 0;
  let postsWithRefs = 0;
  const refCounts = {};

  for (const p of posts) {
    if (p.refs && p.refs.length > 0) {
      postsWithRefs++;
      totalRefs += p.refs.length;
      for (const ref of p.refs) {
        const refId = ref.post_metadata?.id || ref.post_id || 'unknown';
        refCounts[refId] = (refCounts[refId] || 0) + 1;
      }
    }
  }

  return {
    totalReferences: totalRefs,
    postsWithReferences: postsWithRefs,
    avgRefsPerPost: (totalRefs / posts.length).toFixed(2),
    selfReferenceRate: (postsWithRefs / posts.length * 100).toFixed(1) + '%'
  };
}

// ── Run All Analyses ─────────────────────────────────────────────────────────

async function runForensics() {
  console.log('Loading Q drops corpus...');
  const posts = loadPosts();
  console.log(`Loaded ${posts.length} posts\n`);

  console.log('Running linguistic fingerprinting...');
  const linguistic = linguisticAnalysis(posts);

  console.log('Running content classification...');
  const content = contentClassification(posts);

  console.log('Running temporal analysis...');
  const temporal = temporalAnalysis(posts);

  console.log('Running entity extraction...');
  const entities = entityExtraction(posts);

  console.log('Running self-reference analysis...');
  const selfRef = selfReferenceAnalysis(posts);

  // Compile report
  const report = {
    meta: {
      corpus: 'QAnon Drops',
      totalPosts: posts.length,
      dateRange: `${posts[0].time.toISOString().slice(0,10)} to ${posts[posts.length-1].time.toISOString().slice(0,10)}`,
      analysisDate: new Date().toISOString().slice(0,10),
      tripcodes: Object.keys(linguistic.profiles).length,
      boards: [...new Set(posts.map(p => p.board))],
      sites: [...new Set(posts.map(p => p.site))]
    },
    linguistic,
    content,
    temporal,
    entities,
    selfReference: selfRef
  };

  // Save raw analysis
  const outPath = path.join(STAGING, 'forensic-analysis.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nRaw analysis saved to ${outPath}`);

  // Generate markdown report
  generateReport(report);
}

function generateReport(r) {
  const lines = [];
  const ln = (s='') => lines.push(s);

  ln('---');
  ln('title: "Q Drops Forensic Analysis — Phase 1 (Structural)"');
  ln(`date: ${r.meta.analysisDate}`);
  ln('type: forensic-analysis');
  ln('status: draft');
  ln('grade: pending');
  ln('tags: [qanon, forensics, linguistic-analysis, temporal-analysis]');
  ln('---');
  ln();
  ln('# Q Drops — Forensic Structural Analysis');
  ln();
  ln('Phase 1: structural analysis only. No claims evaluated yet.');
  ln('Strip the narrative. Examine the structure.');
  ln();
  ln('## Corpus Stats');
  ln();
  ln(`- **Total posts:** ${r.meta.totalPosts}`);
  ln(`- **Date range:** ${r.meta.dateRange}`);
  ln(`- **Tripcodes:** ${r.meta.tripcodes}`);
  ln(`- **Boards:** ${r.meta.boards.join(', ')}`);
  ln(`- **Sites:** ${r.meta.sites.join(', ')}`);
  ln(`- **Avg posts/day:** ${r.temporal.avgPostsPerDay}`);
  ln();

  ln('## Linguistic Fingerprinting');
  ln();
  ln('### Tripcode Profiles');
  ln();
  ln('| Tripcode | Posts | Avg Words | Vocab Richness | Question Rate | CAPS Rate | Date Range |');
  ln('|---|---|---|---|---|---|---|');
  for (const t of r.linguistic.tripcodeTimeline) {
    ln(`| \`${t.tripcode}\` | ${t.count} | ${t.avgPostLength.toFixed(0)} | ${t.vocabularyRichness.toFixed(3)} | ${t.questionRate.toFixed(2)} | ${(t.capsRate*100).toFixed(1)}% | ${t.dateRange} |`);
  }
  const noTrip = r.linguistic.profiles['none'];
  if (noTrip) {
    ln(`| (no trip) | ${noTrip.count} | ${noTrip.avgPostLength.toFixed(0)} | ${noTrip.vocabularyRichness.toFixed(3)} | ${noTrip.questionRate.toFixed(2)} | ${(noTrip.capsRate*100).toFixed(1)}% | ${noTrip.dateRange} |`);
  }
  ln();

  ln('### Style Transitions');
  ln();
  ln('| From | To | Post Length Delta | Vocab Delta | Question Delta | CAPS Delta |');
  ln('|---|---|---|---|---|---|');
  for (const t of r.linguistic.transitions) {
    ln(`| \`${t.from}\` | \`${t.to}\` | ${t.styleDrift.avgPostLengthDelta > 0 ? '+' : ''}${t.styleDrift.avgPostLengthDelta.toFixed(1)} | ${t.styleDrift.vocabRichnessDelta > 0 ? '+' : ''}${t.styleDrift.vocabRichnessDelta.toFixed(3)} | ${t.styleDrift.questionRateDelta > 0 ? '+' : ''}${t.styleDrift.questionRateDelta.toFixed(2)} | ${t.styleDrift.capsRateDelta > 0 ? '+' : ''}${(t.styleDrift.capsRateDelta*100).toFixed(1)}% |`);
  }
  ln();

  ln('### Signature Phrases');
  ln();
  for (const t of r.linguistic.tripcodeTimeline) {
    if (Object.keys(t.signaturePhrases).length > 0) {
      ln(`**\`${t.tripcode}\`:**`);
      const sorted = Object.entries(t.signaturePhrases).sort((a,b) => b[1]-a[1]);
      for (const [phrase, count] of sorted) {
        ln(`- "${phrase}" (${count}x)`);
      }
      ln();
    }
  }

  ln('## Content Classification');
  ln();
  ln(`| Type | Count | % of Total |`);
  ln('|---|---|---|');
  for (const [type, count] of Object.entries(r.content)) {
    if (type === 'totalPosts') continue;
    ln(`| ${type} | ${count} | ${(count/r.content.totalPosts*100).toFixed(1)}% |`);
  }
  ln();

  ln('## Temporal Patterns');
  ln();
  ln(`**Peak posting hour (UTC):** ${r.temporal.peakHour}:00`);
  ln(`**Peak posting day:** ${r.temporal.peakDay}`);
  ln();

  ln('### Hour Distribution (UTC)');
  ln();
  ln('| Hour | Posts | Bar |');
  ln('|---|---|---|');
  const maxHour = Math.max(...r.temporal.hourDistribution.map(h => h.count));
  for (const h of r.temporal.hourDistribution) {
    const bar = '█'.repeat(Math.round(h.count / maxHour * 20));
    ln(`| ${String(h.hour).padStart(2,'0')}:00 | ${h.count} | ${bar} |`);
  }
  ln();

  ln('### Significant Gaps (>2 days)');
  ln();
  ln('| From | To | Gap (days) | After Post | Before Post |');
  ln('|---|---|---|---|---|');
  for (const g of r.temporal.topGaps.slice(0, 10)) {
    ln(`| ${g.from} | ${g.to} | ${g.gapDays} | #${g.afterPost} | #${g.beforePost} |`);
  }
  ln();

  ln('## Named Entities (Top 30)');
  ln();
  ln('| Name | Mentions |');
  ln('|---|---|');
  for (const [name, count] of r.entities.topNames.slice(0, 30)) {
    ln(`| ${name} | ${count} |`);
  }
  ln();

  ln('### Top Acronyms/Codes');
  ln();
  ln('| Code | Count |');
  ln('|---|---|');
  for (const [acro, count] of r.entities.topAcronyms.slice(0, 30)) {
    ln(`| ${acro} | ${count} |`);
  }
  ln();

  ln('## Self-Reference Network');
  ln();
  ln(`- Total references: ${r.selfReference.totalReferences}`);
  ln(`- Posts with references: ${r.selfReference.postsWithReferences}`);
  ln(`- Avg refs/post: ${r.selfReference.avgRefsPerPost}`);
  ln(`- Self-reference rate: ${r.selfReference.selfReferenceRate}`);
  ln();

  ln('---');
  ln();
  ln('## Phase 2 (Queued): DeepSeek Claim Extraction');
  ln();
  ln('Extract every testable claim. Grade each: CONFIRMED / PARTIAL / WRONG / UNFALSIFIABLE.');
  ln('Cross-reference timestamps against public event timelines.');
  ln('Source classification: INSIDER / OPEN-SOURCE / FABRICATED / AMBIGUOUS.');
  ln();
  ln('## Phase 3 (Queued): Epistemic Triage + Auditor Res');
  ln();
  ln('5-dimension scoring on extracted claims.');
  ln('Cross-domain convergence with existing Cathedral vault material.');

  const reportPath = path.join(STAGING, 'q-drops-forensic-report.md');
  fs.writeFileSync(reportPath, lines.join('\n'));
  console.log(`Report saved to ${reportPath}`);
}

runForensics().catch(console.error);
