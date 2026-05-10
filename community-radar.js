// community-radar.js — External Voice Discovery Engine
// ESM module
// Monitors Reddit, HackerNews, GitHub for high-signal voices and content
// Scores with signal filters, tracks voices, deposits to vault

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const HOME = process.env.HOME;
const RADAR_DIR = path.join(HOME, 'nanoclaw', 'community-radar');
const SOURCES_PATH = path.join(RADAR_DIR, 'sources.json');
const REGISTRY_PATH = path.join(RADAR_DIR, 'voice-registry.json');
const SCAN_LOG_PATH = path.join(RADAR_DIR, 'scan-log.json');
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const VAULT_STAGING = path.join(HOME, 'cathedral-vault', '00_Staging', 'radar');

// Ensure dirs
[RADAR_DIR, VAULT_STAGING].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ── Voice Registry ──────────────────────────────────────────────────────────

function loadRegistry() {
  try { return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8')); }
  catch { return { voices: [], lastUpdated: null }; }
}

function saveRegistry(reg) {
  reg.lastUpdated = new Date().toISOString();
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2));
}

function loadScanLog() {
  try { return JSON.parse(fs.readFileSync(SCAN_LOG_PATH, 'utf8')); }
  catch { return { scans: [] }; }
}

function saveScanLog(log) {
  fs.writeFileSync(SCAN_LOG_PATH, JSON.stringify(log, null, 2));
}

// ── Source Fetchers ─────────────────────────────────────────────────────────

/**
 * Fetch Reddit posts from subreddit (no auth needed — public JSON API)
 */
async function fetchReddit(subreddit, limit = 15) {
  try {
    const url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=${limit}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'CathedralRadar/1.0' },
      signal: AbortSignal.timeout(15000)
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.data?.children || []).map(c => ({
      platform: 'reddit',
      subreddit,
      title: c.data.title,
      author: c.data.author,
      score: c.data.score,
      comments: c.data.num_comments,
      url: `https://reddit.com${c.data.permalink}`,
      selftext: (c.data.selftext || '').slice(0, 500),
      created: new Date(c.data.created_utc * 1000).toISOString(),
      flair: c.data.link_flair_text
    }));
  } catch (e) {
    console.error(`[radar] Reddit fetch failed (r/${subreddit}):`, e.message);
    return [];
  }
}

/**
 * Fetch HackerNews top stories filtered by keywords
 */
async function fetchHackerNews(keywords, limit = 10, minScore = 50) {
  try {
    const topResp = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', { signal: AbortSignal.timeout(10000) });
    const topIds = await topResp.json();
    const results = [];

    for (const id of topIds.slice(0, 60)) {
      if (results.length >= limit) break;
      try {
        const itemResp = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { signal: AbortSignal.timeout(5000) });
        const item = await itemResp.json();
        if (!item || item.score < minScore) continue;
        const titleLower = (item.title || '').toLowerCase();
        const matches = keywords.some(k => titleLower.includes(k.toLowerCase()));
        if (matches) {
          results.push({
            platform: 'hackernews',
            title: item.title,
            author: item.by,
            score: item.score,
            comments: item.descendants || 0,
            url: item.url || `https://news.ycombinator.com/item?id=${id}`,
            hnUrl: `https://news.ycombinator.com/item?id=${id}`,
            created: new Date(item.time * 1000).toISOString()
          });
        }
      } catch { continue; }
    }
    return results;
  } catch (e) {
    console.error('[radar] HN fetch failed:', e.message);
    return [];
  }
}

/**
 * Fetch GitHub trending repos
 */
async function fetchGitHubTrending(topics, language = '') {
  try {
    const token = process.env.GITHUB_TOKEN;
    const headers = { 'Accept': 'application/vnd.github.v3+json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const topicQuery = topics.map(t => `topic:${t}`).join('+');
    const langQuery = language ? `+language:${language}` : '';
    const url = `https://api.github.com/search/repositories?q=${topicQuery}${langQuery}+created:>${since}&sort=stars&order=desc&per_page=10`;

    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return [];
    const data = await resp.json();

    return (data.items || []).map(repo => ({
      platform: 'github',
      name: repo.full_name,
      description: repo.description,
      stars: repo.stargazers_count,
      language: repo.language,
      url: repo.html_url,
      topics: repo.topics,
      created: repo.created_at,
      author: repo.owner?.login
    }));
  } catch (e) {
    console.error('[radar] GitHub fetch failed:', e.message);
    return [];
  }
}

// ── Signal Scoring ──────────────────────────────────────────────────────────

/**
 * Score a batch of posts using DeepSeek for signal quality
 */
async function scoreSignals(posts) {
  if (posts.length === 0) return [];

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.error('[radar] No DEEPSEEK_API_KEY — scoring with heuristics only');
    return posts.map(p => ({ ...p, signal_score: heuristicScore(p), scoring: 'heuristic' }));
  }

  const postSummaries = posts.slice(0, 20).map((p, i) =>
    `[${i}] ${p.platform} | "${p.title}" by ${p.author} | score:${p.score || p.stars || 0} | ${p.url}`
  ).join('\n');

  const prompt = `Score these posts for a boxing gym owner who builds AI systems. He values:
1. PEER VALIDATION — do knowledgeable people engage?
2. EXPLANATORY DEPTH — does it explain WHY, not just WHAT?
3. NOVELTY — new insight vs rehash?
4. CROSS-DOMAIN BRIDGING — connects boxing+tech, philosophy+engineering, teaching+AI? (highest bonus)
5. ACTIONABILITY — can this be applied to a boxing gym or AI system?

Posts:
${postSummaries}

For each post [index], return JSON array:
[{"index": 0, "score": 75, "reason": "one sentence why"}, ...]
Only include posts scoring 50+. Return ONLY valid JSON array, no markdown.`;

  try {
    const resp = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-chat', max_tokens: 1500, temperature: 0.3,
        messages: [
          { role: 'system', content: 'You score content for signal quality. Output only valid JSON.' },
          { role: 'user', content: prompt }
        ]
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!resp.ok) throw new Error(`DeepSeek ${resp.status}`);
    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || '[]';
    const cleaned = raw.replace(/^```json?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
    const scores = JSON.parse(cleaned);

    return scores.map(s => ({
      ...posts[s.index],
      signal_score: s.score,
      signal_reason: s.reason,
      scoring: 'deepseek'
    })).filter(p => p.signal_score >= 50);
  } catch (e) {
    console.error('[radar] DeepSeek scoring failed:', e.message);
    return posts.map(p => ({ ...p, signal_score: heuristicScore(p), scoring: 'heuristic' }));
  }
}

function heuristicScore(post) {
  let score = 30;
  if (post.score > 100 || post.stars > 50) score += 15;
  if (post.comments > 20) score += 10;
  const titleLower = (post.title || '').toLowerCase();
  if (titleLower.includes('boxing') && (titleLower.includes('ai') || titleLower.includes('tech'))) score += 25; // cross-domain
  if (titleLower.includes('pose') || titleLower.includes('vision')) score += 10;
  if (titleLower.includes('local') || titleLower.includes('self-host')) score += 5;
  return Math.min(score, 95);
}

// ── Voice Tracking ──────────────────────────────────────────────────────────

function updateVoiceRegistry(scoredPosts) {
  const registry = loadRegistry();

  for (const post of scoredPosts) {
    if (!post.author || post.signal_score < 60) continue;

    const existing = registry.voices.find(v => v.handle === post.author && v.platform === post.platform);
    if (existing) {
      existing.posts_analysed = (existing.posts_analysed || 0) + 1;
      existing.signal_score = Math.round((existing.signal_score + post.signal_score) / 2);
      existing.last_seen = new Date().toISOString();
      if (post.signal_reason) existing.key_insight = post.signal_reason;
    } else {
      registry.voices.push({
        handle: post.author,
        platform: post.platform,
        domains: guessDomains(post),
        signal_score: post.signal_score,
        posts_analysed: 1,
        key_insight: post.signal_reason || post.title,
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        status: 'discovered'
      });
    }
  }

  // Promote consistent voices
  registry.voices.forEach(v => {
    if (v.posts_analysed >= 3 && v.signal_score >= 70) v.status = 'tracking';
    if (v.posts_analysed >= 5 && v.signal_score >= 80) v.status = 'high_signal';
  });

  saveRegistry(registry);
  return registry;
}

function guessDomains(post) {
  const text = ((post.title || '') + ' ' + (post.description || '') + ' ' + (post.selftext || '')).toLowerCase();
  const domains = [];
  if (text.includes('boxing') || text.includes('fight') || text.includes('martial')) domains.push('boxing');
  if (text.includes('ai') || text.includes('llm') || text.includes('machine learning')) domains.push('ai');
  if (text.includes('pose') || text.includes('vision') || text.includes('camera')) domains.push('computer_vision');
  if (text.includes('self-host') || text.includes('local')) domains.push('self_hosted');
  if (text.includes('gym') || text.includes('fitness')) domains.push('fitness_tech');
  if (domains.length === 0) domains.push('general');
  return domains;
}

// ── Full Scan ───────────────────────────────────────────────────────────────

/**
 * Run a full radar scan across all enabled sources
 */
export async function runScan() {
  const startMs = Date.now();
  console.log('[radar] Starting full scan...');

  const sources = JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf8')).sources;
  const allPosts = [];

  // Reddit
  for (const [key, source] of Object.entries(sources)) {
    if (!source.enabled) continue;
    if (source.platform === 'reddit') {
      for (const sub of source.targets) {
        const posts = await fetchReddit(sub, 15);
        const filtered = posts.filter(p => p.score >= (source.min_upvotes || 5));
        allPosts.push(...filtered);
        console.log(`[radar] r/${sub}: ${filtered.length}/${posts.length} posts above threshold`);
      }
    }
  }

  // HackerNews
  const hnSource = sources.hackernews;
  if (hnSource?.enabled) {
    const hnPosts = await fetchHackerNews(hnSource.keyword_filter, 10, hnSource.min_score);
    allPosts.push(...hnPosts);
    console.log(`[radar] HN: ${hnPosts.length} posts matched keywords`);
  }

  // GitHub
  const ghSource = sources.github_trending;
  if (ghSource?.enabled) {
    const repos = await fetchGitHubTrending(ghSource.topic_filter);
    allPosts.push(...repos);
    console.log(`[radar] GitHub: ${repos.length} trending repos`);
  }

  console.log(`[radar] Total fetched: ${allPosts.length} items. Scoring...`);

  // Score
  const scored = await scoreSignals(allPosts);
  console.log(`[radar] High-signal items: ${scored.length}`);

  // Update voice registry
  const registry = updateVoiceRegistry(scored);

  // Deposit high-signal to vault
  if (scored.length > 0) {
    const depositPath = path.join(VAULT_STAGING, `radar-${new Date().toISOString().split('T')[0]}.md`);
    let md = `# Community Radar — ${new Date().toISOString().split('T')[0]}\n\n`;
    md += `Scan: ${allPosts.length} fetched, ${scored.length} high-signal\n\n`;
    for (const post of scored.sort((a, b) => b.signal_score - a.signal_score)) {
      md += `## [${post.signal_score}] ${post.title}\n`;
      md += `- Platform: ${post.platform} | Author: ${post.author}\n`;
      md += `- URL: ${post.url}\n`;
      if (post.signal_reason) md += `- Signal: ${post.signal_reason}\n`;
      md += '\n';
    }
    fs.writeFileSync(depositPath, md);
  }

  // Log scan
  const scanLog = loadScanLog();
  scanLog.scans.push({
    timestamp: new Date().toISOString(),
    fetched: allPosts.length,
    highSignal: scored.length,
    newVoices: registry.voices.filter(v => v.posts_analysed === 1).length,
    durationMs: Date.now() - startMs
  });
  if (scanLog.scans.length > 100) scanLog.scans = scanLog.scans.slice(-50);
  saveScanLog(scanLog);

  console.log(`[radar] Scan complete: ${scored.length} high-signal, ${Date.now() - startMs}ms`);

  return { fetched: allPosts.length, highSignal: scored, registry };
}

/**
 * Run a focused scan on a specific topic
 */
export async function focusScan(topic) {
  console.log(`[radar] Focus scan: "${topic}"`);
  const posts = [];

  // Reddit search
  try {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(topic)}&sort=relevance&t=week&limit=15`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'CathedralRadar/1.0' },
      signal: AbortSignal.timeout(15000)
    });
    if (resp.ok) {
      const data = await resp.json();
      const items = (data.data?.children || []).map(c => ({
        platform: 'reddit',
        subreddit: c.data.subreddit,
        title: c.data.title,
        author: c.data.author,
        score: c.data.score,
        comments: c.data.num_comments,
        url: `https://reddit.com${c.data.permalink}`,
        selftext: (c.data.selftext || '').slice(0, 500),
        created: new Date(c.data.created_utc * 1000).toISOString()
      }));
      posts.push(...items);
    }
  } catch {}

  // GitHub search
  try {
    const ghResp = await fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(topic)}&sort=stars&order=desc&per_page=5`,
      { headers: { 'Accept': 'application/vnd.github.v3+json' }, signal: AbortSignal.timeout(10000) }
    );
    if (ghResp.ok) {
      const data = await ghResp.json();
      posts.push(...(data.items || []).map(r => ({
        platform: 'github', name: r.full_name, title: r.full_name + ': ' + (r.description || ''),
        description: r.description, stars: r.stargazers_count, url: r.html_url, author: r.owner?.login
      })));
    }
  } catch {}

  const scored = await scoreSignals(posts);
  updateVoiceRegistry(scored);
  return { topic, fetched: posts.length, highSignal: scored };
}

// ── Format for Telegram ─────────────────────────────────────────────────────

export function formatScanResultTelegram(result) {
  let msg = `📡 *Community Radar Scan*\n\n`;
  msg += `Fetched: ${result.fetched} | High-signal: ${result.highSignal.length}\n\n`;

  if (result.highSignal.length === 0) {
    msg += '_No high-signal content found this scan._';
    return msg;
  }

  for (const post of result.highSignal.slice(0, 10)) {
    const icon = post.platform === 'reddit' ? '🔴' : post.platform === 'github' ? '⚫' : '🟠';
    msg += `${icon} *[${post.signal_score}]* ${post.title?.slice(0, 80)}\n`;
    msg += `  by ${post.author} | ${post.platform}`;
    if (post.score) msg += ` | ⬆️${post.score}`;
    if (post.stars) msg += ` | ⭐${post.stars}`;
    msg += '\n';
    if (post.signal_reason) msg += `  _${post.signal_reason}_\n`;
    msg += '\n';
  }

  return msg;
}

export function formatVoicesTelegram() {
  const registry = loadRegistry();
  if (registry.voices.length === 0) return '📡 No voices tracked yet. Run `/radar run` first.';

  const sorted = registry.voices.sort((a, b) => b.signal_score - a.signal_score);
  let msg = `📡 *Voice Registry (${sorted.length} tracked)*\n\n`;

  for (const v of sorted.slice(0, 15)) {
    const statusIcon = v.status === 'high_signal' ? '🌟' : v.status === 'tracking' ? '👁' : '🆕';
    msg += `${statusIcon} *${v.handle}* (${v.platform})\n`;
    msg += `  Score: ${v.signal_score} | Posts: ${v.posts_analysed} | ${v.domains.join(', ')}\n`;
    if (v.key_insight) msg += `  _${v.key_insight.slice(0, 100)}_\n`;
    msg += '\n';
  }

  return msg;
}

export function formatStatusTelegram() {
  const registry = loadRegistry();
  const scanLog = loadScanLog();
  const lastScan = scanLog.scans[scanLog.scans.length - 1];

  let msg = '📡 *Community Radar*\n\n';
  msg += `Voices tracked: ${registry.voices.length}\n`;
  msg += `High-signal: ${registry.voices.filter(v => v.status === 'high_signal').length}\n`;
  msg += `Tracking: ${registry.voices.filter(v => v.status === 'tracking').length}\n`;

  if (lastScan) {
    msg += `\nLast scan: ${lastScan.timestamp.split('T')[0]} — ${lastScan.highSignal} finds from ${lastScan.fetched} fetched\n`;
  }

  msg += `\n*Commands:*
\`/radar\` — this status
\`/radar run\` — full scan now
\`/radar voices\` — tracked voice registry
\`/radar <topic>\` — focused scan on topic

*Sources:* Reddit (r/boxing, r/amateur_boxing, r/LocalLLaMA, r/selfhosted), HackerNews, GitHub trending`;

  return msg;
}

export default {
  runScan,
  focusScan,
  formatScanResultTelegram,
  formatVoicesTelegram,
  formatStatusTelegram
};
