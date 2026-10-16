/**
 * publication-engine.js — External Publication Infrastructure
 *
 * Three pipelines for Cathedral ideas reaching the outside world:
 *   1. Book Assembly — chapter drafts from vault evidence
 *   2. Newsletter Draft — weekly public-facing digest
 *   3. Public Podcast Curator — rates agent podcasts for external interest
 *
 * ESM. Budget-capped: max 5 DeepSeek calls per generate action.
 *
 * Usage:
 *   import { assembleChapter, draftNewsletter, curatePodcast } from './publication-engine.js';
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';
import { smartQuery } from './deepseek-query.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const HOME = process.env.HOME;
const VAULT = join(HOME, 'cathedral-vault');
const BOOK_SPEC = join(VAULT, '06_Methods', 'basic-reflex-book.md');
const MERCURY_FEED = join(__dirname, 'mercury-feed.json');
const PODCAST_DIR = join(HOME, 'Cathedral', 'podcasts');
const OUTPUT_BASE = join(__dirname, 'publication-output');
const BOOK_OUT = join(OUTPUT_BASE, 'book');
const NEWS_OUT = join(OUTPUT_BASE, 'newsletter');
const POD_OUT = join(OUTPUT_BASE, 'podcast');

// Ensure dirs exist
[BOOK_OUT, NEWS_OUT, POD_OUT].forEach(d => mkdirSync(d, { recursive: true }));

// ── Helpers ─────────────────────────────────────────────────────────────────

function safeRead(p) {
  try { return readFileSync(p, 'utf8'); } catch { return ''; }
}

function scanVaultDir(dir, ext = '.md', depth = 0) {
  const results = [];
  if (!existsSync(dir) || depth > 3) return results;
  try {
    for (const f of readdirSync(dir)) {
      const full = join(dir, f);
      try {
        const st = statSync(full);
        if (st.isDirectory() && !f.startsWith('.')) {
          results.push(...scanVaultDir(full, ext, depth + 1));
        } else if (f.endsWith(ext)) {
          results.push(full);
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return results;
}

function searchVaultForKeywords(keywords, maxResults = 15) {
  const dirs = [
    join(VAULT, '02_Refined_Gold'),
    join(VAULT, '06_Methods'),
    join(VAULT, '00_Staging'),
    join(VAULT, '06_Basic_Reflex_Syllabus'),
  ];
  const scored = [];
  const kw = keywords.map(k => k.toLowerCase());

  for (const dir of dirs) {
    for (const file of scanVaultDir(dir)) {
      try {
        const content = readFileSync(file, 'utf8');
        const lower = content.toLowerCase();
        let score = 0;
        for (const k of kw) {
          const idx = lower.indexOf(k);
          if (idx !== -1) score += 1;
          // Title match bonus
          const firstLine = lower.split('\n')[0];
          if (firstLine.includes(k)) score += 2;
        }
        if (score > 0) {
          scored.push({ file, score, snippet: content.slice(0, 600) });
        }
      } catch { /* skip */ }
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults);
}

function recentVaultDeposits(days = 7, maxResults = 10) {
  const cutoff = Date.now() - days * 86400000;
  const dirs = [
    join(VAULT, '02_Refined_Gold'),
    join(VAULT, '00_Staging'),
    join(VAULT, '06_Methods'),
  ];
  const recent = [];
  for (const dir of dirs) {
    for (const file of scanVaultDir(dir)) {
      try {
        const st = statSync(file);
        if (st.mtimeMs > cutoff) {
          const content = readFileSync(file, 'utf8');
          recent.push({
            file: file.replace(VAULT + '/', ''),
            date: new Date(st.mtimeMs).toISOString().slice(0, 10),
            snippet: content.slice(0, 400),
          });
        }
      } catch { /* skip */ }
    }
  }
  recent.sort((a, b) => b.date.localeCompare(a.date));
  return recent.slice(0, maxResults);
}

// ── Chapter structure parser ────────────────────────────────────────────────

function parseBookStructure() {
  const raw = safeRead(BOOK_SPEC);
  if (!raw) return [];

  const chapters = [];
  const lines = raw.split('\n');
  let current = null;

  for (const line of lines) {
    const chMatch = line.match(/^###\s+Chapter\s+(\d+)\s*[—–-]\s*(.+)/);
    if (chMatch) {
      if (current) chapters.push(current);
      current = {
        num: parseInt(chMatch[1]),
        title: chMatch[2].trim(),
        lines: [],
        part: chapters.length < 4 ? 'Part 1: The Ring' :
              chapters.length < 8 ? 'Part 2: The Architecture' :
              chapters.length < 11 ? 'Part 3: The Partnership' :
              'Part 4: The Master Game',
      };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) chapters.push(current);
  return chapters;
}

function extractKeywords(chapter) {
  const text = [chapter.title, ...chapter.lines].join(' ').toLowerCase();
  const words = text
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 4);
  // Frequency map, skip common words
  const stop = new Set(['about', 'every', 'their', 'which', 'where', 'would', 'could', 'should',
    'those', 'these', 'there', 'being', 'other', 'after', 'before', 'under', 'above',
    'between', 'through', 'during', 'against', 'without', 'within', 'because',
    'doesn', 'application', 'universal', 'boxing', 'origin', 'evidence', 'lesson']);
  const freq = {};
  for (const w of words) {
    if (!stop.has(w)) freq[w] = (freq[w] || 0) + 1;
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => w);
}

// ── Pipeline 1: Book Assembly ───────────────────────────────────────────────

export async function assembleChapter(chapterNum) {
  const chapters = parseBookStructure();
  const chapter = chapters.find(c => c.num === chapterNum);
  if (!chapter) {
    return { ok: false, error: `Chapter ${chapterNum} not found. Available: ${chapters.map(c => c.num).join(', ')}` };
  }

  const keywords = extractKeywords(chapter);
  const nuggets = searchVaultForKeywords(keywords, 12);
  const chapterSpec = chapter.lines.join('\n');

  // Assemble vault evidence (trim to fit context)
  const evidence = nuggets.map((n, i) =>
    `[Nugget ${i + 1}] ${n.file}\n${n.snippet}`
  ).join('\n---\n');

  const nextChapter = chapters.find(c => c.num === chapterNum + 1);
  const nextRef = nextChapter ? `The next chapter is "${nextChapter.title}"` : 'This is the final chapter.';

  // DeepSeek call 1: Generate chapter prose (budget: 1 of 5)
  const prose = await smartQuery(
    `You are a ghostwriter assembling a book chapter for "Basic Reflex" by Coach Paul.
The book extracts principles from boxing and applies them to everything — business, AI, life.
Voice: direct, personal, earned through experience. Not academic, not self-help. Real.
Paul is a boxing coach in Hong Kong who built a sovereign AI research system (the Cathedral).

Structure each chapter as:
1. Opening hook — a boxing moment that reveals the principle
2. The principle stated clearly
3. Where else it's true (2-3 domains beyond boxing)
4. Evidence from the vault (reference specific findings)
5. The reflex — what the reader carries out

Write 2000-3000 words. Paul's voice: clear, confident, no filler.`,
    `CHAPTER ${chapterNum}: ${chapter.title}
PART: ${chapter.part}

CHAPTER SPEC:
${chapterSpec}

VAULT EVIDENCE:
${evidence.slice(0, 3000)}

${nextRef}

Write the full chapter draft.`,
    4000
  );

  // DeepSeek call 2: Generate chapter summary for dashboard (budget: 2 of 5)
  const summary = await smartQuery(
    'Summarize this chapter draft in 2-3 sentences for a dashboard preview.',
    prose.slice(0, 2000),
    200
  );

  const outPath = join(BOOK_OUT, `chapter-${String(chapterNum).padStart(2, '0')}.md`);
  const header = `---
title: "Chapter ${chapterNum} — ${chapter.title}"
part: "${chapter.part}"
status: drafted
date: ${new Date().toISOString().slice(0, 10)}
vault_nuggets: ${nuggets.length}
keywords: ${JSON.stringify(keywords)}
---

`;
  writeFileSync(outPath, header + prose);

  return {
    ok: true,
    chapter: chapterNum,
    title: chapter.title,
    part: chapter.part,
    words: prose.split(/\s+/).length,
    nuggets: nuggets.length,
    summary: summary.trim(),
    path: outPath,
  };
}

// ── Pipeline 2: Newsletter Draft ────────────────────────────────────────────

export async function draftNewsletter() {
  // Gather sources
  const mercuryFeed = safeRead(MERCURY_FEED);
  let mercuryItems = [];
  if (mercuryFeed) {
    try {
      const parsed = JSON.parse(mercuryFeed);
      mercuryItems = (Array.isArray(parsed) ? parsed : parsed.items || []).slice(0, 5);
    } catch { /* skip */ }
  }

  const recentDeposits = recentVaultDeposits(7, 8);

  // Build source material
  const sources = [];
  if (mercuryItems.length > 0) {
    sources.push('MERCURY GOLD FEED (self-discovered truths):');
    for (const item of mercuryItems) {
      sources.push(`- ${item.title || item.content || JSON.stringify(item).slice(0, 200)}`);
    }
  }
  if (recentDeposits.length > 0) {
    sources.push('\nRECENT VAULT DEPOSITS:');
    for (const d of recentDeposits) {
      sources.push(`- [${d.date}] ${d.file}\n  ${d.snippet.slice(0, 150)}`);
    }
  }

  if (sources.length === 0) {
    sources.push('No Mercury feed or recent deposits found. Write about the general Cathedral methodology.');
  }

  // DeepSeek call 1: Write newsletter (budget: 1 of 5)
  const newsletter = await smartQuery(
    `You are writing a public-facing weekly newsletter called "Basic Reflex Weekly."
Author: Coach Paul, boxing coach in Hong Kong, builder of sovereign AI systems.

Tone: insights from someone who builds things. Practical, specific, not hype.
The Trojan Horse: stories about boxing/AI/building → real methodology underneath.
Readers think they're getting boxing/tech stories. They're actually getting a framework for mastery.

Format:
- Title (catchy, not clickbait)
- Opening hook (a real moment from the week)
- 2-3 insights (each grounded in something that actually happened)
- One principle extracted (the reflex)
- Closing thought

500-800 words. Direct voice. No corporate platitudes.`,
    `SOURCE MATERIAL FROM THIS WEEK:\n\n${sources.join('\n').slice(0, 3000)}

Write the newsletter draft.`,
    2000
  );

  // DeepSeek call 2: Extract title (budget: 2 of 5)
  const titleExtract = await smartQuery(
    'Extract just the title from this newsletter. Return ONLY the title text, nothing else.',
    newsletter.slice(0, 500),
    100
  );

  const dateStr = new Date().toISOString().slice(0, 10);
  const title = titleExtract.trim().replace(/['"]/g, '');
  const outPath = join(NEWS_OUT, `newsletter-${dateStr}.md`);

  const header = `---
title: "${title}"
date: ${dateStr}
status: drafted
mercury_items: ${mercuryItems.length}
vault_deposits: ${recentDeposits.length}
---

`;
  writeFileSync(outPath, header + newsletter);

  return {
    ok: true,
    title,
    date: dateStr,
    words: newsletter.split(/\s+/).length,
    sources: { mercury: mercuryItems.length, vault: recentDeposits.length },
    preview: newsletter.slice(0, 300),
    path: outPath,
  };
}

// ── Pipeline 3: Public Podcast Curator ──────────────────────────────────────

export async function curatePodcast() {
  if (!existsSync(PODCAST_DIR)) {
    return { ok: false, error: `Podcast directory not found: ${PODCAST_DIR}` };
  }

  // Scan for recent .md podcast scripts (last 14 days)
  const cutoff = Date.now() - 14 * 86400000;
  const episodes = [];
  for (const f of readdirSync(PODCAST_DIR)) {
    if (!f.endsWith('.md')) continue;
    const full = join(PODCAST_DIR, f);
    try {
      const st = statSync(full);
      if (st.mtimeMs > cutoff) {
        const content = readFileSync(full, 'utf8');
        const hasAudio = existsSync(full.replace('.md', '.mp3')) || existsSync(full.replace('.md', '.ogg'));
        episodes.push({
          file: f,
          path: full,
          date: new Date(st.mtimeMs).toISOString().slice(0, 10),
          content: content.slice(0, 1500),
          hasAudio,
          audioPath: hasAudio ? (existsSync(full.replace('.md', '.mp3')) ? full.replace('.md', '.mp3') : full.replace('.md', '.ogg')) : null,
        });
      }
    } catch { /* skip */ }
  }

  if (episodes.length === 0) {
    return { ok: false, error: 'No recent podcast episodes found (last 14 days).' };
  }

  // DeepSeek call 1: Rate all episodes (budget: 1 of 5)
  const episodeList = episodes.map((e, i) =>
    `[Episode ${i + 1}] ${e.file} (${e.date})\n${e.content.slice(0, 400)}`
  ).join('\n\n---\n\n');

  const ratingsRaw = await smartQuery(
    `You are curating internal AI agent podcast discussions for a public audience.
Rate each episode 1-10 on "would an outsider who knows nothing about the Cathedral find this interesting?"

Criteria:
- Universal insight (not just internal system chatter)
- Clear narrative or discovery
- Something surprising or counter-intuitive
- Accessible without Cathedral context

Return a JSON array: [{"episode": 1, "score": N, "reason": "brief reason"}, ...]
Return ONLY valid JSON, no markdown fences.`,
    episodeList.slice(0, 3500),
    800
  );

  let ratings = [];
  try {
    const cleaned = ratingsRaw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    ratings = JSON.parse(cleaned);
  } catch {
    // Try line-by-line parse
    try {
      const match = ratingsRaw.match(/\[[\s\S]*\]/);
      if (match) ratings = JSON.parse(match[0]);
    } catch {
      return { ok: false, error: 'Failed to parse ratings from DeepSeek.', raw: ratingsRaw.slice(0, 500) };
    }
  }

  // Filter 7+ episodes
  const curated = ratings
    .filter(r => r.score >= 7)
    .sort((a, b) => b.score - a.score);

  // DeepSeek call 2: Write public descriptions for top episodes (budget: 2 of 5)
  let descriptions = [];
  if (curated.length > 0) {
    const topEps = curated.slice(0, 3).map(r => {
      const ep = episodes[r.episode - 1];
      return ep ? `[${r.score}/10] ${ep.file}\n${ep.content.slice(0, 400)}` : '';
    }).filter(Boolean).join('\n---\n');

    const descRaw = await smartQuery(
      `Write short public-facing descriptions (2-3 sentences each) for these podcast episodes.
Make them sound intriguing to someone outside the system. No jargon.
Return as JSON array: [{"episode": "filename", "description": "text", "hook": "one-line teaser"}]`,
      topEps,
      600
    );

    try {
      const cleaned = descRaw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const match = cleaned.match(/\[[\s\S]*\]/);
      descriptions = JSON.parse(match ? match[0] : cleaned);
    } catch { /* use ratings reasons as fallback */ }
  }

  // Build output
  const dateStr = new Date().toISOString().slice(0, 10);
  const outPath = join(POD_OUT, `curated-${dateStr}.md`);

  let md = `---
date: ${dateStr}
episodes_scanned: ${episodes.length}
episodes_curated: ${curated.length}
---

# Podcast Curation — ${dateStr}

## Curated Episodes (Score 7+)

`;

  for (const r of curated) {
    const ep = episodes[r.episode - 1];
    if (!ep) continue;
    const desc = descriptions.find(d => d.episode === ep.file);
    md += `### ${ep.file} — Score: ${r.score}/10\n`;
    md += `**Reason:** ${r.reason}\n`;
    if (desc) {
      md += `**Public description:** ${desc.description}\n`;
      md += `**Hook:** ${desc.hook}\n`;
    }
    if (ep.hasAudio) md += `**Audio:** ${ep.audioPath}\n`;
    md += `\n`;
  }

  if (curated.length === 0) {
    md += '*No episodes scored 7+ this cycle.*\n';
  }

  md += `\n## All Ratings\n\n`;
  for (const r of ratings) {
    const ep = episodes[r.episode - 1];
    md += `- ${ep ? ep.file : `Episode ${r.episode}`}: ${r.score}/10 — ${r.reason}\n`;
  }

  writeFileSync(outPath, md);

  return {
    ok: true,
    date: dateStr,
    scanned: episodes.length,
    curated: curated.length,
    top: curated[0] ? {
      file: episodes[curated[0].episode - 1]?.file,
      score: curated[0].score,
      reason: curated[0].reason,
    } : null,
    path: outPath,
  };
}
