/**
 * Reed Studio Metrics Tracker
 *
 * Tracks KPIs for the studio. Imported by reed-studio-engine.js.
 * Also provides data for agent context injection — agents see the numbers.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const STUDIO_DIR = process.env.HOME + '/nanoclaw/reed-studio';
const METRICS_FILE = join(STUDIO_DIR, 'metrics.json');
const CATALOGUE_FILE = process.env.HOME + '/nanoclaw/reed-lab/catalogue.json';
const FEED_FILE = process.env.HOME + '/nanoclaw/cathedral-feed.json';
const BRIEFS_DIR = join(STUDIO_DIR, 'briefs');
const STAGING_DIR = join(STUDIO_DIR, 'staging');

function loadMetrics() {
  if (existsSync(METRICS_FILE)) return JSON.parse(readFileSync(METRICS_FILE, 'utf8'));
  return { lifetime: {}, weekly: {}, rates: {}, coverage: {}, streaks: {}, quality: {} };
}

function saveMetrics(m) {
  m.lastUpdated = new Date().toISOString();
  writeFileSync(METRICS_FILE, JSON.stringify(m, null, 2));
}

// ─── COMPUTE ──────────────────────────────────────────────────────────────────

export function computeMetrics() {
  const m = loadMetrics();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  // Catalogue stats
  const catalogue = existsSync(CATALOGUE_FILE) ? JSON.parse(readFileSync(CATALOGUE_FILE, 'utf8')) : { generations: [] };
  m.lifetime.totalGenerated = catalogue.generations.length;

  // Briefs stats
  const briefs = existsSync(BRIEFS_DIR) ? readdirSync(BRIEFS_DIR).filter(f => f.endsWith('.json')) : [];
  m.lifetime.totalBriefs = briefs.length;

  // Staging stats
  const staging = existsSync(STAGING_DIR) ? readdirSync(STAGING_DIR).filter(f => !f.startsWith('.')) : [];

  // Weekly reset
  const weekStart = getWeekStart(now);
  if (m.weekly.weekStart !== weekStart) {
    m.weekly = { weekStart, generated: 0, briefs: 0, executed: 0, feedPosts: 0, experiments: 0, staleStylesFixed: 0, characterGapsFilled: 0 };
  }

  // Count this week's generations
  m.weekly.generated = catalogue.generations.filter(g => {
    const d = g.date || g.timestamp?.slice(0, 10) || '';
    return d >= weekStart;
  }).length;

  // Style coverage
  const styles = ['pro_photo', 'manga', 'noir', 'ippo', 'neon', 'dramatic', 'poster', 'oil', 'video_cinematic'];
  m.coverage.styles = {};
  for (const style of styles) {
    const gens = catalogue.generations.filter(g => g.style === style);
    const latest = gens[gens.length - 1];
    const daysSince = latest ? Math.floor((Date.now() - new Date(latest.timestamp || latest.date).getTime()) / 86400000) : 999;
    m.coverage.styles[style] = { count: gens.length, daysSinceLast: daysSince, health: daysSince < 7 ? 'fresh' : daysSince < 14 ? 'aging' : 'stale' };
  }

  // Character coverage
  m.coverage.characters = { logan: 0, ling: 0, maya: 0 };
  for (const g of catalogue.generations) {
    const name = (g.character || g.topic || g.source || '').toLowerCase();
    if (name.includes('logan')) m.coverage.characters.logan++;
    if (name.includes('ling')) m.coverage.characters.ling++;
    if (name.includes('maya')) m.coverage.characters.maya++;
  }

  // Model usage
  m.coverage.models = {};
  for (const g of catalogue.generations) {
    const model = g.model || 'unknown';
    m.coverage.models[model] = (m.coverage.models[model] || 0) + 1;
  }

  // Feed engagement
  if (existsSync(FEED_FILE)) {
    try {
      const feed = JSON.parse(readFileSync(FEED_FILE, 'utf8'));
      const posts = feed.posts || feed;
      if (Array.isArray(posts)) {
        const reedPosts = posts.filter(p => p.agent === 'Reed');
        m.lifetime.feedPostsMade = reedPosts.length;

        // Check if other agents responded to Reed posts
        const reedPostIds = new Set(reedPosts.map(p => p.id));
        const responses = posts.filter(p => p.agent !== 'Reed' && p.replyTo && reedPostIds.has(p.replyTo));
        m.rates.feedEngagement = reedPosts.length > 0 ? Math.round((responses.length / reedPosts.length) * 100) : 0;
      }
    } catch {}
  }

  // Rates
  m.rates.briefToExecution = m.lifetime.totalBriefs > 0 ? Math.round((m.lifetime.briefsExecuted / m.lifetime.totalBriefs) * 100) : 0;
  m.rates.studioUptime = 100; // Tracked by PM2

  // Streaks
  if (m.streaks.lastActiveDate !== today) {
    if (m.streaks.lastActiveDate === getYesterday(now)) {
      m.streaks.daysActive++;
    } else if (m.streaks.lastActiveDate !== today) {
      m.streaks.daysActive = 1;
    }
    m.streaks.lastActiveDate = today;
    m.streaks.longestStreak = Math.max(m.streaks.longestStreak, m.streaks.daysActive);
  }

  saveMetrics(m);
  return m;
}

// ─── RECORD EVENTS ────────────────────────────────────────────────────────────

export function recordGeneration(brief) {
  const m = loadMetrics();
  m.lifetime.briefsExecuted = (m.lifetime.briefsExecuted || 0) + 1;
  m.weekly.executed = (m.weekly.executed || 0) + 1;
  saveMetrics(m);
}

export function recordFeedPost() {
  const m = loadMetrics();
  m.lifetime.feedPostsMade = (m.lifetime.feedPostsMade || 0) + 1;
  m.weekly.feedPosts = (m.weekly.feedPosts || 0) + 1;
  saveMetrics(m);
}

export function recordExperiment() {
  const m = loadMetrics();
  m.lifetime.experimentsRun = (m.lifetime.experimentsRun || 0) + 1;
  m.weekly.experiments = (m.weekly.experiments || 0) + 1;
  saveMetrics(m);
}

export function recordPaulSelection(assetId) {
  const m = loadMetrics();
  m.lifetime.paulSelections = (m.lifetime.paulSelections || 0) + 1;
  m.quality.paulUsed = m.quality.paulUsed || [];
  m.quality.paulUsed.push({ asset: assetId, date: new Date().toISOString() });
  if (m.quality.paulUsed.length > 50) m.quality.paulUsed = m.quality.paulUsed.slice(-50);
  saveMetrics(m);
}

export function recordPaulReplacement(assetId, reason) {
  const m = loadMetrics();
  m.lifetime.paulReplacements = (m.lifetime.paulReplacements || 0) + 1;
  m.quality.paulReplaced = m.quality.paulReplaced || [];
  m.quality.paulReplaced.push({ asset: assetId, reason, date: new Date().toISOString() });
  if (m.quality.paulReplaced.length > 50) m.quality.paulReplaced = m.quality.paulReplaced.slice(-50);
  saveMetrics(m);
}

// ─── AGENT CONTEXT INJECTION ──────────────────────────────────────────────────
// Returns a short summary agents can read in their context

export function getAgentBriefing() {
  const m = computeMetrics();
  const freshStyles = Object.entries(m.coverage.styles).filter(([, v]) => v.health === 'fresh').length;
  const staleStyles = Object.entries(m.coverage.styles).filter(([, v]) => v.health === 'stale').length;

  return `REED STUDIO KPIs:
- Total assets: ${m.lifetime.totalGenerated} | This week: ${m.weekly.generated}
- Briefs queued: ${m.lifetime.totalBriefs} | Executed: ${m.lifetime.briefsExecuted} (${m.rates.briefToExecution}%)
- Style coverage: ${freshStyles}/9 fresh, ${staleStyles} stale
- Characters: Logan(${m.coverage.characters?.logan || 0}) Ling(${m.coverage.characters?.ling || 0}) Maya(${m.coverage.characters?.maya || 0})
- Feed posts: ${m.lifetime.feedPostsMade} | Engagement: ${m.rates.feedEngagement}%
- Streak: ${m.streaks.daysActive}d active (best: ${m.streaks.longestStreak}d)
- Paul selections: ${m.lifetime.paulSelections} | Replacements: ${m.lifetime.paulReplacements}
${staleStyles > 2 ? '⚠️ Multiple stale styles need attention' : ''}${m.streaks.daysActive >= 7 ? '🔥 7+ day streak!' : ''}`;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function getWeekStart(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

function getYesterday(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
