import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';

// ── Constants ────────────────────────────────────────────────────────────────

const COSMOS_DIR = path.join(process.env.HOME, 'cathedral-vault', '00_Staging', 'cosmology');
const UPDATES_DIR = path.join(COSMOS_DIR, 'research-updates');
const STATE_FILE = path.join(process.env.HOME, 'nanoclaw', 'cosmology-researcher-state.json');
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

const GRADE_ORDER = ['D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+'];

// ── State management ─────────────────────────────────────────────────────────

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { lastTrackSlug: null, history: [] };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ── Track reading ────────────────────────────────────────────────────────────

function readAllTracks() {
  const files = fs.readdirSync(COSMOS_DIR).filter(f =>
    f.endsWith('.md') && f.includes('_track')
  );

  const tracks = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(COSMOS_DIR, file), 'utf8');

    // Extract frontmatter fields
    const titleMatch = content.match(/^title:\s*"?(.+?)"?\s*$/m);
    const gradeMatch = content.match(/^grade:\s*(.+)$/m);

    if (!titleMatch || !gradeMatch) continue;

    const title = titleMatch[1].trim();
    const grade = gradeMatch[1].trim();

    // Extract track number from filename
    const trackNumMatch = file.match(/track(\d+[a-z]?)/);
    const trackNum = trackNumMatch ? trackNumMatch[1] : 'unknown';

    // Strip frontmatter, take first ~1500 chars for claim extraction
    const body = content.replace(/^---[\s\S]*?---\s*/, '');
    const claimText = body.slice(0, 1500);

    tracks.push({ file, title, grade, trackNum, claimText, slug: file.replace(/\.md$/, '') });
  }

  return tracks;
}

function gradeRank(grade) {
  const idx = GRADE_ORDER.indexOf(grade);
  return idx === -1 ? 5 : idx; // unknown grades treated as mid-range
}

function findWeakestTrack(tracks, state) {
  // Sort by grade (weakest first)
  const sorted = [...tracks].sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade));

  // Filter out the last researched track to avoid repetition
  const candidates = sorted.filter(t => t.slug !== state.lastTrackSlug);

  // Also deprioritize recently researched tracks (last 5)
  const recentSlugs = new Set((state.history || []).slice(-5));
  const fresh = candidates.filter(t => !recentSlugs.has(t.slug));

  // Prefer fresh weak tracks; fall back to any weak track if all have been researched
  return fresh.length > 0 ? fresh[0] : candidates[0] || sorted[0];
}

// ── Prompt construction ──────────────────────────────────────────────────────

function buildResearchPrompt(track) {
  return `You are Aletheia, a forensic research engine for the Cathedral vault.

The Cosmology Research Series has 27 tracks. The following track has the weakest evidence grade and needs strengthening:

Track ${track.trackNum}: ${track.title} — Current Grade: ${track.grade}

Key claims from this track:
${track.claimText}

Your task: Find NEW evidence that could upgrade this track's grade.
Search for:
- Peer-reviewed papers or published research
- Declassified documents
- Named researchers with credentials
- Specific dates, measurements, or experimental results
- Counter-evidence that should be acknowledged

Format your findings as a vault document with:
- Title, date, source, grade for each finding
- How it connects to the existing track
- Whether it upgrades, downgrades, or adds nuance

Be forensically honest. If you find evidence AGAINST the track's claims, include it. The vault values honesty over confirmation.

Output the findings in clean markdown with YAML frontmatter:
---
title: "Track ${track.trackNum} Research Update — [date]"
date: [today's date]
domain: cosmology
type: research-update
parent_track: ${track.trackNum}
parent_grade: ${track.grade}
programme: cosmology-research-programme
---`;
}

// ── DeepSeek API call ────────────────────────────────────────────────────────

async function callDeepSeek(prompt) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');

  const resp = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      max_tokens: 4000,
      messages: [
        { role: 'system', content: 'You are Aletheia, a forensic research engine. You produce rigorous, sourced research findings. No hedging, no filler — evidence and analysis only.' },
        { role: 'user', content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`DeepSeek ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── Telegram notification ────────────────────────────────────────────────────

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_TOKEN;
  const chatId = process.env.PAUL_CHAT_ID;
  if (!token || !chatId) {
    console.log('[cosmology-researcher] Telegram credentials missing, skipping notification');
    return;
  }

  // Cap at 4000 chars for Telegram
  const capped = text.length > 4000 ? text.slice(0, 3950) + '\n\n[...truncated]' : text;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: capped,
      parse_mode: 'Markdown',
    }),
  });

  if (!resp.ok) {
    // Retry without markdown on parse failure
    const errText = await resp.text().catch(() => '');
    if (/can't parse|Bad Request/i.test(errText)) {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: capped }),
      });
    } else {
      console.error(`[cosmology-researcher] Telegram error: ${errText.slice(0, 200)}`);
    }
  }
}

// ── Save to vault ────────────────────────────────────────────────────────────

function saveUpdate(trackNum, content) {
  // Ensure directory exists
  if (!fs.existsSync(UPDATES_DIR)) {
    fs.mkdirSync(UPDATES_DIR, { recursive: true });
  }

  const date = new Date().toISOString().slice(0, 10);
  const filename = `${date}-track${trackNum}-update.md`;
  const filePath = path.join(UPDATES_DIR, filename);

  // Handle duplicates (same track same day)
  let finalPath = filePath;
  let suffix = 2;
  while (fs.existsSync(finalPath)) {
    finalPath = path.join(UPDATES_DIR, `${date}-track${trackNum}-update-v${suffix}.md`);
    suffix++;
  }

  fs.writeFileSync(finalPath, content);
  return finalPath;
}

// ── Main research function (exported for Telegram command) ───────────────────

export async function runCosmologyResearch() {
  console.log('[cosmology-researcher] Starting research cycle...');

  const tracks = readAllTracks();
  if (tracks.length === 0) throw new Error('No cosmology tracks found');

  const state = loadState();
  const target = findWeakestTrack(tracks, state);

  console.log(`[cosmology-researcher] Target: Track ${target.trackNum} "${target.title}" (Grade: ${target.grade})`);

  const prompt = buildResearchPrompt(target);
  const research = await callDeepSeek(prompt);

  if (!research || research.length < 100) {
    throw new Error('DeepSeek returned insufficient content');
  }

  // Save to vault
  const savedPath = saveUpdate(target.trackNum, research);
  console.log(`[cosmology-researcher] Saved: ${savedPath}`);

  // Update state
  state.lastTrackSlug = target.slug;
  if (!state.history) state.history = [];
  state.history.push(target.slug);
  if (state.history.length > 27) state.history = state.history.slice(-27);
  state.lastRun = new Date().toISOString();
  saveState(state);

  // Build summary for Telegram
  const summary = `*Cosmology Research Update*

Track ${target.trackNum}: ${target.title}
Current Grade: ${target.grade}

Aletheia found new evidence. Saved to:
\`research-updates/${path.basename(savedPath)}\`

${research.slice(0, 2000)}${research.length > 2000 ? '\n\n[...full report in vault]' : ''}`;

  await sendTelegram(summary);

  return { track: target, savedPath, researchLength: research.length };
}

// ── CLI execution ────────────────────────────────────────────────────────────

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isDirectRun) {
  runCosmologyResearch()
    .then(result => {
      console.log(`[cosmology-researcher] Complete. Track ${result.track.trackNum}, ${result.researchLength} chars saved.`);
      process.exit(0);
    })
    .catch(err => {
      console.error(`[cosmology-researcher] FAILED: ${err.message}`);
      process.exit(1);
    });
}
