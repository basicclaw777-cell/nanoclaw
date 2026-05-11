// Reed v2 — Active Creative Director
// Not a printing press. A creative director who generates, evaluates,
// tracks response, researches when output misses, and iterates.
//
// Crons:
//   Daily 2am: generate + self-evaluate + send (PM2 reed-lab, existing)
//   Daily 10am: engagement check (PM2 reed-engagement)
//   Weekly Sunday: research + report (PM2 reed-research)
//
// This file is the engagement tracker + research loop + weekly report.
// The daily generation still lives in daily-lab.js (upgraded with taste gate).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const HOME = process.env.HOME || '/Users/basicclaw777';
const NANOCLAW = join(HOME, 'nanoclaw');
const REED_DIR = join(NANOCLAW, 'reed-lab');
const ENGAGEMENT_PATH = join(REED_DIR, 'engagement-tracker.json');
const TECHNIQUES_PATH = join(REED_DIR, 'techniques-learned.json');
const CATALOGUE_PATH = join(REED_DIR, 'catalogue.json');
const REFERENCE_DIR = join(HOME, 'Downloads', 'upgraded standard');

// ── State ───────────────────────────────────────────────────────────────────

function loadEngagement() {
  try { return JSON.parse(readFileSync(ENGAGEMENT_PATH, 'utf-8')); }
  catch { return { images: [], weeklyStats: [], lastCheck: null }; }
}

function saveEngagement(data) {
  writeFileSync(ENGAGEMENT_PATH, JSON.stringify(data, null, 2));
}

function loadTechniques() {
  try { return JSON.parse(readFileSync(TECHNIQUES_PATH, 'utf-8')); }
  catch { return { learned: [], researchQueue: [], lastResearch: null }; }
}

function saveTechniques(data) {
  writeFileSync(TECHNIQUES_PATH, JSON.stringify(data, null, 2));
}

// ── TRACK: Check engagement with recent images ──────────────────────────────

async function checkEngagement() {
  console.log('[reed-director] Checking engagement...');

  const engagement = loadEngagement();

  // Read lymphatic ratings for Reed
  let reedRating = null;
  try {
    const ls = JSON.parse(readFileSync(join(HOME, 'Cathedral', 'lymphatic-state.json'), 'utf-8'));
    const ratings = (ls.ratings || []).filter(r =>
      r.questionId === 'reed' || r.questionId === 'reed-lab' || r.questionId === 'reed_lab'
    );
    if (ratings.length) reedRating = ratings[ratings.length - 1];
  } catch {}

  // Read catalogue for recent generations
  let recentGens = [];
  try {
    const cat = JSON.parse(readFileSync(CATALOGUE_PATH, 'utf-8'));
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    recentGens = (cat.photos || []).filter(p =>
      p.last_processed && p.last_processed.slice(0, 10) >= yesterday
    );
  } catch {}

  // Determine engagement level
  let engagementLevel = 'silence'; // default: Paul didn't respond
  let notes = '';

  if (reedRating) {
    const rating = reedRating.rating;
    if (rating >= 4) { engagementLevel = 'hit'; notes = reedRating.notes || ''; }
    else if (rating >= 3) { engagementLevel = 'neutral'; notes = reedRating.notes || ''; }
    else { engagementLevel = 'miss'; notes = reedRating.notes || ''; }
  }

  engagement.images.push({
    date: new Date().toISOString().slice(0, 10),
    generationsCount: recentGens.length,
    engagement: engagementLevel,
    rating: reedRating?.rating || null,
    notes,
  });

  // Keep last 60 entries
  if (engagement.images.length > 60) engagement.images = engagement.images.slice(-60);
  engagement.lastCheck = new Date().toISOString();
  saveEngagement(engagement);

  console.log(`[reed-director] Engagement: ${engagementLevel}${reedRating ? ' (' + reedRating.rating + '/5)' : ''}`);

  // If miss or silence — research NOW, not Sunday
  if (engagementLevel === 'miss' || engagementLevel === 'silence') {
    const techniques = loadTechniques();
    const gap = notes || 'Output missed. No specific feedback. Research general improvement.';
    if (!techniques.researchQueue.some(q => q.gap === gap)) {
      techniques.researchQueue.push({
        date: new Date().toISOString().slice(0, 10),
        gap,
        status: 'queued',
      });
      saveTechniques(techniques);
      console.log(`[reed-director] Miss detected. Researching NOW.`);
    }
    // Research immediately — don't wait for Sunday
    await runResearch();
  }

  return { engagementLevel, notes };
}

// ── RESEARCH: Study reference material + web for technique improvement ──────

async function runResearch() {
  console.log('[reed-director] Research phase...');

  const techniques = loadTechniques();
  const queue = techniques.researchQueue.filter(q => q.status === 'queued');

  if (queue.length === 0) {
    console.log('[reed-director] No research gaps queued.');
    return;
  }

  // Study Paul's approved reference photos
  let referenceInsights = [];
  try {
    const { readdirSync } = await import('fs');
    if (existsSync(REFERENCE_DIR)) {
      const refs = readdirSync(REFERENCE_DIR).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
      referenceInsights.push(`${refs.length} reference photos in Paul's approved set.`);
      // The upgraded standard photos are Paul's gold standard — what does Reed notice?
      referenceInsights.push('Reference set is Paul\'s approved "upgraded standard" — real grain, real light, natural warmth.');
    }
  } catch {}

  // Study engagement patterns
  const engagement = loadEngagement();
  const recent = engagement.images.slice(-14);
  const hits = recent.filter(i => i.engagement === 'hit').length;
  const misses = recent.filter(i => i.engagement === 'miss').length;
  const silence = recent.filter(i => i.engagement === 'silence').length;

  // Generate research findings (template-based, no LLM needed)
  const findings = [];

  for (const item of queue.slice(0, 3)) {
    const finding = {
      date: new Date().toISOString().slice(0, 10),
      gap: item.gap,
      research: [],
      technique: null,
    };

    // Pattern: if Paul said something specific, derive technique from it
    if (item.gap.includes('know me') || item.gap.includes('doesn\'t know')) {
      finding.research.push('Gap is personalization. Reed needs to reference Paul\'s specific projects and aesthetic.');
      finding.technique = 'Before generating, inject Paul Kernel context. Reference: dark, clean, observatory aesthetic. Boxing gym in Hong Kong. Real grain over digital polish.';
    }
    if (item.gap.includes('slop') || item.gap.includes('AI') || item.gap.includes('generic')) {
      finding.research.push('Gap is AI slop. Images look generated, not crafted.');
      finding.technique = 'Run Impeccable anti-slop check on prompts before generation. Avoid: gradient text, glassmorphism, identical grids, hero metrics. Add: film grain, lens imperfections, asymmetric composition.';
    }
    if (item.gap.includes('repetit') || item.gap.includes('same')) {
      finding.research.push('Gap is repetition. Same styles, same compositions.');
      finding.technique = 'Rotate styles more aggressively. Never send the same style two nights in a row. Weight toward styles Paul hasn\'t seen recently.';
    }
    if (!finding.technique) {
      finding.research.push('General improvement needed. Study reference photos for common qualities.');
      finding.technique = 'Reference set quality: warm natural light, real textures, depth of field, candid feel. Apply to all recipes.';
    }

    findings.push(finding);
    item.status = 'researched';
  }

  // Save findings
  techniques.learned.push(...findings);
  if (techniques.learned.length > 50) techniques.learned = techniques.learned.slice(-50);
  techniques.lastResearch = new Date().toISOString();
  saveTechniques(techniques);

  console.log(`[reed-director] Researched ${findings.length} gaps. ${queue.length - findings.length} remaining.`);
  return findings;
}

// ── REPORT: Weekly creative director brief ──────────────────────────────────

async function weeklyReport() {
  console.log('[reed-director] Generating weekly report...');

  const engagement = loadEngagement();
  const techniques = loadTechniques();
  const recent = engagement.images.slice(-7);

  const hits = recent.filter(i => i.engagement === 'hit').length;
  const misses = recent.filter(i => i.engagement === 'miss').length;
  const silence = recent.filter(i => i.engagement === 'silence').length;
  const totalGens = recent.reduce((s, i) => s + (i.generationsCount || 0), 0);

  const recentTechniques = (techniques.learned || []).slice(-3);

  let report = '◎ REED — Weekly Creative Director Brief\n\n';

  // Engagement summary
  report += `This week: ${totalGens} images generated\n`;
  report += `Response: ${hits} hits, ${misses} misses, ${silence} silence\n`;

  if (hits === 0 && recent.length > 3) {
    report += '\nNo hits this week. That\'s not a style problem — it\'s a relevance problem. I\'m not making things Paul wants to see.\n';
  } else if (hits > misses) {
    report += '\nMore hits than misses. The direction is working.\n';
  }

  // What I learned
  if (recentTechniques.length) {
    report += '\nWhat I researched:\n';
    for (const t of recentTechniques) {
      report += `• ${t.gap.slice(0, 50)} → ${(t.technique || 'no technique yet').slice(0, 80)}\n`;
    }
  }

  // Research queue
  const queued = (techniques.researchQueue || []).filter(q => q.status === 'queued').length;
  if (queued) report += `\n${queued} gaps still in research queue.\n`;

  // What I'm trying next
  report += '\nNext week: ';
  if (recentTechniques.length) {
    report += recentTechniques[0].technique?.slice(0, 100) || 'applying latest research';
  } else {
    report += 'maintaining current approach';
  }
  report += '\n';

  // Paul's rating if available
  try {
    const ls = JSON.parse(readFileSync(join(HOME, 'Cathedral', 'lymphatic-state.json'), 'utf-8'));
    const reedRatings = (ls.ratings || []).filter(r => r.questionId?.includes('reed'));
    if (reedRatings.length) {
      const latest = reedRatings[reedRatings.length - 1];
      report += `\nPaul's latest rating: ${latest.rating}/5`;
      if (latest.notes) report += ` — "${latest.notes}"`;
      report += '\n';
    }
  } catch {}

  // Send to Telegram
  try {
    const { config } = await import('dotenv');
    config();
    const token = process.env.TELEGRAM_TOKEN;
    const chatId = process.env.PAUL_CHAT_ID;
    if (token && chatId) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: report }),
      });
      console.log('[reed-director] Report sent.');
    }
  } catch (e) { console.log(`[reed-director] Telegram: ${e.message}`); }

  return report;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function run() {
  const mode = process.argv[2] || 'engagement';

  if (mode === 'engagement') {
    await checkEngagement();
  } else if (mode === 'research') {
    await checkEngagement();
    await runResearch();
    await weeklyReport();
  } else if (mode === 'report') {
    await weeklyReport();
  }
}

run().catch(console.error);
