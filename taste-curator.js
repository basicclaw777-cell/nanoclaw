// taste-curator.js — Curator Engine for Taste Map
// ESM module
//
// Scrapes curated sources (YouTube boxing channels, etc), scores candidates
// against taste dimensions via DeepSeek, queues for Paul's yes/no review.
//
// Usage: node taste-curator.js [--source boxing-yt] [--max 20]
// Telegram: /curator, /curator scan, /curator review, /curator sources

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { scoreDrill, getDrillDimensions } from './taste-dimensions.js';
import { addAnchor, addRejection } from './taste-map-api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CANDIDATES_PATH = path.join(__dirname, 'taste-candidates.json');
const SOURCES_PATH = path.join(__dirname, 'taste-sources.json');

// Load .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
        val = val.slice(1, -1);
      if (!process.env[match[1].trim()]) process.env[match[1].trim()] = val;
    }
  }
}

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const PAUL_CHAT_ID = process.env.PAUL_CHAT_ID ? parseInt(process.env.PAUL_CHAT_ID) : null;

// ── Sources Registry ────────────────────────────────────────────────────────

const DEFAULT_SOURCES = {
  boxing_yt: {
    type: 'youtube_channel',
    domain: 'boxing_drills',
    channels: [
      { name: 'Lee Wylie', id: 'UCFkXqJnpJh8_9qMMA2XZGOQ', style: 'Fight film analysis, tactical breakdowns, pattern recognition' },
      { name: 'Jack Slack', id: 'UC4PoJVYnGkGRVJkB33jjVOA', style: 'Strategic fight analysis, coaching methodology, technique principles' },
      { name: 'The Modern Martial Artist', id: 'UC4tz9HfJzoTzr2NksBKOG2Q', style: 'Biomechanics, technique analysis, science-based training' },
      { name: 'Liam Harrison', id: 'UCjS6e6SkNvJdR_eFfQDcjCw', style: 'Elite Muay Thai, principle-heavy, real training methodology' },
      { name: 'Sylvie von Duuglas-Ittu', id: 'UC3GBitlSGRyHrNJ0BLPq3Jg', style: 'Deep Thai boxing methodology, 400+ fights, training culture' },
      { name: 'Lawrence Kenshin', id: 'UCN1gFmI0JO_cstmgKPF84Wg', style: 'Striking breakdowns, fight film forensics, tactical patterns' }
    ],
    keywords: ['drill', 'training', 'technique', 'breakdown', 'analysis', 'footwork', 'defense', 'counter', 'combination', 'pad work', 'methodology', 'principle', 'movement', 'sparring', 'strategy'],
    maxPerChannel: 30
  },
  boxing_methodology: {
    type: 'youtube_channel',
    domain: 'boxing_drills',
    channels: [
      { name: 'Cus D Amato', id: null, style: 'Philosophy, peekaboo, fear management, coaching methodology' },
      { name: 'Cuban Boxing', id: null, style: 'Cuban school methodology, amateur system, combinaciones' }
    ],
    keywords: ['Cus D Amato', 'Cuban boxing training', 'peekaboo style', 'boxing philosophy', 'boxing methodology', 'amateur boxing system', 'Cuban boxing drill', 'boxing coaching method'],
    searchMode: 'global',
    maxPerChannel: 20
  }
};

function getSources() {
  if (fs.existsSync(SOURCES_PATH)) {
    return JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf8'));
  }
  return DEFAULT_SOURCES;
}

function saveSources(sources) {
  fs.writeFileSync(SOURCES_PATH, JSON.stringify(sources, null, 2));
}

// ── Candidates Store ──────────────────────────────────────────────────────

function getCandidates() {
  if (fs.existsSync(CANDIDATES_PATH)) {
    return JSON.parse(fs.readFileSync(CANDIDATES_PATH, 'utf8'));
  }
  return { candidates: [], lastScan: null, stats: { scanned: 0, queued: 0, accepted: 0, rejected: 0 } };
}

function saveCandidates(data) {
  fs.writeFileSync(CANDIDATES_PATH, JSON.stringify(data, null, 2));
}

// ── YouTube Scraper ───────────────────────────────────────────────────────

async function scrapeYouTubeChannel(channelId, channelName, keywords, maxResults = 30) {
  const results = [];

  // Use yt-dlp to get video metadata from channel
  // Search channel for drill-related content
  for (const keyword of keywords.slice(0, 5)) {
    try {
      const searchQuery = `ytsearch${Math.min(maxResults, 10)}:${channelName} boxing ${keyword}`;
      const raw = execFileSync('yt-dlp', [
        '--flat-playlist',
        '--dump-json',
        '--no-download',
        '--no-warnings',
        searchQuery
      ], { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }).toString();

      for (const line of raw.split('\n').filter(l => l.trim())) {
        try {
          const data = JSON.parse(line);
          if (!data.title) continue;

          // No title filter — let DeepSeek decide relevance
          // Search query already targets boxing/drill content
          results.push({
            id: data.id || data.url,
            title: data.title,
            description: data.description || '',
            channel: channelName,
            channelId,
            url: data.url || `https://youtube.com/watch?v=${data.id}`,
            duration: data.duration,
            viewCount: data.view_count,
            source: 'youtube'
          });
        } catch { /* skip malformed JSON lines */ }
      }
    } catch (err) {
      console.error(`[curator] yt-dlp search failed for "${keyword}": ${err.message}`);
    }

    // Rate limit between searches
    await new Promise(r => setTimeout(r, 2000));
  }

  // Deduplicate by video ID
  const seen = new Set();
  return results.filter(r => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

// ── YouTube Global Search ─────────────────────────────────────────────────

async function scrapeYouTubeGlobal(keywords, label, maxResults = 20) {
  const results = [];

  for (const keyword of keywords.slice(0, 4)) {
    try {
      const searchQuery = `ytsearch${Math.min(maxResults, 8)}:${keyword}`;
      const raw = execFileSync('yt-dlp', [
        '--flat-playlist',
        '--dump-json',
        '--no-download',
        '--no-warnings',
        searchQuery
      ], { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }).toString();

      for (const line of raw.split('\n').filter(l => l.trim())) {
        try {
          const data = JSON.parse(line);
          if (!data.title) continue;
          results.push({
            id: data.id || data.url,
            title: data.title,
            description: data.description || '',
            channel: data.channel || data.uploader || label,
            channelId: data.channel_id || '',
            url: data.url || `https://youtube.com/watch?v=${data.id}`,
            duration: data.duration,
            viewCount: data.view_count,
            source: 'youtube'
          });
        } catch { /* skip */ }
      }
    } catch (err) {
      console.error(`[curator] yt-dlp global search failed for "${keyword}": ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  const seen = new Set();
  return results.filter(r => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

// ── DeepSeek Drill Scorer ─────────────────────────────────────────────────

const DRILL_SCORE_SYSTEM = `You are scoring boxing drill videos for alignment with a specific coaching taste profile.

The coach values these dimensions in drills:
${Object.entries(getDrillDimensions()).map(([k, v]) => `- ${k}: ${v.description}`).join('\n')}

The coach REJECTS:
- Mindless repetition without awareness
- Drills that only reward speed or power
- One-directional drills (coach does, student copies)
- No breakdown/progression possible
- No underlying principle — just exercise
- Pure conditioning with no skill transfer
- Coach-dependent drills (stop working without coach)

From the video title and description, score each dimension 0-10.
Also extract: what principle the drill teaches, whether it's partner/solo, and how many segments it could chunk into.

Respond in this exact JSON format:
{
  "drillName": "short descriptive name",
  "principle": "the underlying principle this teaches (or null)",
  "isPartner": true/false,
  "segments": number (1-6, how many chunks),
  "scores": {
    "principle_teaching": 0-10,
    "loopability": 0-10,
    "consciousness_forcing": 0-10,
    "chunkability": 0-10,
    "partner_flow": 0-10,
    "patience_reward": 0-10,
    "principle_embodiment": 0-10,
    "self_regulating": 0-10,
    "rhythm_agility": 0-10
  },
  "totalScore": 0-10,
  "verdict": "STRONG_MATCH" or "PARTIAL_MATCH" or "WEAK_MATCH",
  "oneLiner": "one sentence on why this does or doesnt match"
}`;

async function scoreDrillWithLLM(video) {
  if (!DEEPSEEK_KEY) {
    // Fallback to heuristic scorer
    const result = scoreDrill({
      name: video.title,
      description: video.description || '',
      principle: null
    });
    return {
      drillName: video.title,
      principle: null,
      isPartner: video.title.toLowerCase().includes('partner'),
      segments: 1,
      scores: result.scores,
      totalScore: result.total,
      verdict: result.verdict,
      oneLiner: `Heuristic score: ${result.total}`,
      method: 'heuristic'
    };
  }

  const prompt = `Video title: ${video.title}
Channel: ${video.channel}
Description: ${(video.description || '').slice(0, 500)}
Duration: ${video.duration ? Math.round(video.duration / 60) + ' min' : 'unknown'}

Score this drill video.`;

  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: DRILL_SCORE_SYSTEM },
          { role: 'user', content: prompt }
        ],
        max_tokens: 600,
        temperature: 0.2
      })
    });

    const data = await res.json();
    if (data.error) {
      console.error(`[curator] DeepSeek error: ${data.error.message}`);
      return null;
    }

    const text = data.choices?.[0]?.message?.content || '';

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    parsed.method = 'deepseek';
    return parsed;
  } catch (err) {
    console.error(`[curator] DeepSeek scoring failed: ${err.message}`);
    return null;
  }
}

// ── Main Scan ─────────────────────────────────────────────────────────────

export async function scanSource(sourceKey, maxPerChannel) {
  const sources = getSources();
  const source = sources[sourceKey];
  if (!source) return { error: `Unknown source: ${sourceKey}. Available: ${Object.keys(sources).join(', ')}` };

  const store = getCandidates();
  const existingIds = new Set(store.candidates.map(c => c.videoId));
  let newCandidates = 0;
  let apiCalls = 0;
  const MAX_API_CALLS = 25; // Budget cap per scan

  if (source.type === 'youtube_channel') {
    for (const channel of source.channels) {
      console.log(`[curator] Scanning: ${channel.name}`);
      let videos;
      if (source.searchMode === 'global' || !channel.id) {
        // Global YouTube search for methodology/archive channels without channel ID
        videos = await scrapeYouTubeGlobal(source.keywords, channel.name, maxPerChannel || source.maxPerChannel || 20);
      } else {
        videos = await scrapeYouTubeChannel(
          channel.id,
          channel.name,
          source.keywords,
          maxPerChannel || source.maxPerChannel || 30
        );
      }

      console.log(`[curator] Found ${videos.length} drill videos from ${channel.name}`);

      for (const video of videos) {
        if (existingIds.has(video.id)) continue;
        if (apiCalls >= MAX_API_CALLS) {
          console.log(`[curator] API budget exhausted (${MAX_API_CALLS} calls)`);
          break;
        }

        // Score with DeepSeek
        const score = await scoreDrillWithLLM(video);
        apiCalls++;

        if (!score) continue;

        // Only queue STRONG or PARTIAL matches
        if (score.verdict === 'WEAK_MATCH') continue;

        store.candidates.push({
          videoId: video.id,
          title: video.title,
          url: video.url,
          channel: video.channel,
          duration: video.duration,
          viewCount: video.viewCount,
          domain: source.domain,
          drillName: score.drillName,
          principle: score.principle,
          isPartner: score.isPartner,
          segments: score.segments,
          scores: score.scores,
          totalScore: score.totalScore,
          verdict: score.verdict,
          oneLiner: score.oneLiner,
          method: score.method,
          status: 'pending', // pending | accepted | rejected | skipped
          scannedAt: new Date().toISOString()
        });

        existingIds.add(video.id);
        newCandidates++;
        store.stats.queued++;

        // Rate limit
        await new Promise(r => setTimeout(r, 1500));
      }

      if (apiCalls >= MAX_API_CALLS) break;
    }
  }

  store.lastScan = new Date().toISOString();
  store.stats.scanned += apiCalls;
  saveCandidates(store);

  return {
    source: sourceKey,
    apiCalls,
    newCandidates,
    totalPending: store.candidates.filter(c => c.status === 'pending').length
  };
}

// ── Review Interface ──────────────────────────────────────────────────────

export function getNextCandidate() {
  const store = getCandidates();
  // Sort by score descending, return first pending
  const pending = store.candidates
    .filter(c => c.status === 'pending')
    .sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
  return pending[0] || null;
}

export function getPendingCount() {
  const store = getCandidates();
  return store.candidates.filter(c => c.status === 'pending').length;
}

export function reviewCandidate(videoId, decision) {
  const store = getCandidates();
  const candidate = store.candidates.find(c => c.videoId === videoId);
  if (!candidate) return null;

  candidate.status = decision; // 'accepted' | 'rejected' | 'skipped'
  candidate.reviewedAt = new Date().toISOString();

  if (decision === 'accepted') {
    store.stats.accepted++;
    // Add to taste map as anchor
    addAnchor('boxing_drills', 'anchors', {
      item: candidate.drillName || candidate.title,
      status: 'YES',
      reason: candidate.oneLiner || `Curator import from ${candidate.channel}`,
      dimensions: Object.entries(candidate.scores || {})
        .filter(([_, v]) => v >= 6)
        .map(([k]) => k),
      source: candidate.url,
      added: new Date().toISOString().split('T')[0]
    });
  } else if (decision === 'rejected') {
    store.stats.rejected++;
  }

  saveCandidates(store);
  return candidate;
}

export function getCuratorStats() {
  const store = getCandidates();
  const sources = getSources();

  const byVerdict = { STRONG_MATCH: 0, PARTIAL_MATCH: 0 };
  const byChannel = {};
  const byStatus = { pending: 0, accepted: 0, rejected: 0, skipped: 0 };

  for (const c of store.candidates) {
    byVerdict[c.verdict] = (byVerdict[c.verdict] || 0) + 1;
    byChannel[c.channel] = (byChannel[c.channel] || 0) + 1;
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
  }

  return {
    totalCandidates: store.candidates.length,
    lastScan: store.lastScan,
    byVerdict,
    byChannel,
    byStatus,
    sources: Object.keys(sources),
    stats: store.stats
  };
}

// ── Format for Telegram ──────────────────────────────────────────────────

export function formatCandidate(candidate) {
  if (!candidate) return 'No pending candidates. Run /curator scan first.';

  const dimBars = Object.entries(candidate.scores || {})
    .sort((a, b) => b[1] - a[1])
    .map(([dim, score]) => {
      const bar = score >= 7 ? '|||' : score >= 4 ? '||' : '|';
      return `  ${dim.replace(/_/g, ' ')}: ${bar} ${score}/10`;
    })
    .join('\n');

  let msg = `*Curator Candidate*\n\n`;
  msg += `*${candidate.drillName || candidate.title}*\n`;
  msg += `Channel: ${candidate.channel}\n`;
  if (candidate.principle) msg += `Principle: ${candidate.principle}\n`;
  msg += `Partner: ${candidate.isPartner ? 'Yes' : 'Solo'} | Segments: ${candidate.segments}\n`;
  msg += `Score: ${candidate.totalScore}/10 (${candidate.verdict})\n\n`;
  msg += `*Dimensions:*\n${dimBars}\n\n`;
  msg += `${candidate.oneLiner}\n\n`;
  msg += `${candidate.url}`;

  return msg;
}

export function formatStats() {
  const stats = getCuratorStats();
  let msg = `*Taste Curator*\n\n`;
  msg += `Total candidates: ${stats.totalCandidates}\n`;
  msg += `Pending: ${stats.byStatus.pending}\n`;
  msg += `Accepted: ${stats.byStatus.accepted}\n`;
  msg += `Rejected: ${stats.byStatus.rejected}\n`;
  msg += `Skipped: ${stats.byStatus.skipped}\n\n`;

  if (Object.keys(stats.byChannel).length > 0) {
    msg += `*By Channel:*\n`;
    for (const [ch, count] of Object.entries(stats.byChannel)) {
      msg += `  ${ch}: ${count}\n`;
    }
  }

  msg += `\nSources: ${stats.sources.join(', ')}`;
  msg += `\nLast scan: ${stats.lastScan || 'never'}`;
  return msg;
}

// ── Telegram Sending ─────────────────────────────────────────────────────

async function sendTelegram(text, replyMarkup) {
  if (!TELEGRAM_TOKEN || !PAUL_CHAT_ID) return;
  try {
    const body = {
      chat_id: PAUL_CHAT_ID,
      text: text.slice(0, 4000),
      parse_mode: 'Markdown'
    };
    if (replyMarkup) body.reply_markup = JSON.stringify(replyMarkup);

    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch { /* silent */ }
}

// ── CLI Entry Point ──────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].endsWith('taste-curator.js')) {
  const sourceArg = process.argv.find(a => a.startsWith('--source='))?.split('=')[1] || 'boxing_yt';
  const maxArg = parseInt(process.argv.find(a => a.startsWith('--max='))?.split('=')[1] || '20');

  console.log(`[curator] Scanning source: ${sourceArg}, max per channel: ${maxArg}`);
  scanSource(sourceArg, maxArg).then(result => {
    console.log(`[curator] Done:`, result);
    const msg = `[Taste Curator]\nSource: ${result.source}\nAPI calls: ${result.apiCalls}\nNew candidates: ${result.newCandidates}\nTotal pending: ${result.totalPending}`;
    sendTelegram(msg);
  }).catch(err => {
    console.error(`[curator] Fatal:`, err);
  });
}

export default {
  scanSource,
  getNextCandidate,
  getPendingCount,
  reviewCandidate,
  getCuratorStats,
  formatCandidate,
  formatStats,
  getSources,
  saveSources
};
