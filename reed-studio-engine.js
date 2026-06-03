/**
 * Reed Studio Engine — The Always-Warm Studio
 *
 * 5 roles: Reed (Director), Librarian, Watcher/Producer, Editor, R&D
 * Event-driven. No crons. Watches for builds, harvests, projects.
 * Pre-generates visual concepts for upcoming work.
 *
 * PM2: pm2 start ~/nanoclaw/reed-studio-engine.js --name reed-studio-engine
 */

import { watch } from 'chokidar';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { execFileSync, execSync } from 'child_process';
import { createRequire } from 'module';
const genGuard = createRequire(import.meta.url)('./lib/generation-guard.cjs'); // GLOBAL kill-switch
import { computeMetrics, recordGeneration, recordFeedPost, recordExperiment, getAgentBriefing } from './reed-studio/metrics-tracker.js';
import { orcDecide, postToStudioFeed, getStudioStatus } from './reed-studio/studio-orc.js';
import { analyzeAndImprove } from './reed-studio/studio-programmer.js';

const VAULT = process.env.HOME + '/cathedral-vault';
const NANOCLAW = process.env.HOME + '/nanoclaw';
const STUDIO_DIR = NANOCLAW + '/reed-studio';
const STATE_FILE = STUDIO_DIR + '/state.json';
const CAPABILITIES_FILE = STUDIO_DIR + '/capabilities.json';
const STAGING_DIR = STUDIO_DIR + '/staging';
const BRIEFS_DIR = STUDIO_DIR + '/briefs';
const CATALOGUE_FILE = NANOCLAW + '/reed-lab/catalogue.json';
const HUB_MEDIA_DIR = VAULT + '/09_Artifacts/branding/basic-reflex/reed-lab';

// Telegram notify
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || (() => {
  try { return readFileSync(NANOCLAW + '/.env', 'utf8').match(/TELEGRAM_BOT_TOKEN=(.+)/)?.[1]; } catch { return null; }
})();
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || (() => {
  try { return readFileSync(NANOCLAW + '/.env', 'utf8').match(/TELEGRAM_CHAT_ID=(.+)/)?.[1]; } catch { return null; }
})();

// ─── STATE ────────────────────────────────────────────────────────────────────

function loadState() {
  if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  return { lastEvent: null, queue: [], processed: [], rndLastRun: null, librarianLastScan: null, capabilities_refresh: null };
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ─── TELEGRAM ─────────────────────────────────────────────────────────────────

async function notify(message) {
  if (!BOT_TOKEN || !CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: message, parse_mode: 'Markdown' })
    });
  } catch {}
}

// ─── ROLE 1: WATCHER/PRODUCER ─────────────────────────────────────────────────
// Detects events, classifies by tier, passes to chain

const EVENT_TIERS = {
  1: ['session-harvest', 'terminal-harvest', 'project-card-new', 'build-complete'],
  2: ['muse-finding', 'cross-domain', 'roundtable', 'new-vault-file'],
  3: ['status-update', 'routine-dm', 'ping']
};

function classifyEvent(filePath) {
  const name = basename(filePath).toLowerCase();
  if (name.includes('session-harvest') || name.includes('terminal-harvest')) return { tier: 1, type: 'harvest', path: filePath };
  if (name.includes('project-') && filePath.includes('08_Project_Orchestrator')) return { tier: 1, type: 'project-card', path: filePath };
  if (name.includes('muse-finding')) return { tier: 2, type: 'muse-finding', path: filePath };
  if (name.includes('roundtable')) return { tier: 2, type: 'roundtable', path: filePath };
  if (filePath.includes('00_Staging')) return { tier: 2, type: 'new-vault-file', path: filePath };
  return { tier: 3, type: 'other', path: filePath };
}

// ─── ROLE 2: LIBRARIAN ────────────────────────────────────────────────────────
// Knows what exists. Flags stale. Checks if visual already covers this event.

function librarianCheck(event) {
  const catalogue = existsSync(CATALOGUE_FILE) ? JSON.parse(readFileSync(CATALOGUE_FILE, 'utf8')) : { generations: [] };
  const staging = existsSync(STAGING_DIR) ? readdirSync(STAGING_DIR) : [];

  // Extract topic from event
  const topic = extractTopic(event);

  // Check if we already have a visual for this topic
  const existingMatch = catalogue.generations.find(g =>
    g.topic === topic || g.brief_source === event.path
  );

  if (existingMatch) {
    return { exists: true, asset: existingMatch, recommendation: 'skip' };
  }

  // Check staging
  const stagingMatch = staging.find(f => f.includes(topic?.replace(/\s+/g, '-')?.toLowerCase() || '___'));
  if (stagingMatch) {
    return { exists: true, asset: stagingMatch, recommendation: 'staging-ready' };
  }

  return { exists: false, recommendation: 'generate' };
}

function extractTopic(event) {
  try {
    const content = readFileSync(event.path, 'utf8');
    // Extract title from frontmatter or first heading
    const titleMatch = content.match(/^title:\s*(.+)$/m) || content.match(/^#\s+(.+)$/m);
    return titleMatch ? titleMatch[1].trim() : basename(event.path, '.md');
  } catch {
    return basename(event.path, '.md');
  }
}

function librarianScan() {
  // Weekly scan: what's stale, what's missing, what needs refresh
  const catalogue = existsSync(CATALOGUE_FILE) ? JSON.parse(readFileSync(CATALOGUE_FILE, 'utf8')) : { generations: [] };
  const now = Date.now();
  const twoWeeks = 14 * 24 * 60 * 60 * 1000;

  const styles = ['pro_photo', 'manga', 'noir', 'ippo', 'neon', 'dramatic', 'poster', 'oil', 'video_cinematic'];
  const staleStyles = [];

  for (const style of styles) {
    const latest = catalogue.generations.filter(g => g.style === style).pop();
    if (!latest) { staleStyles.push({ style, reason: 'never generated' }); continue; }
    const age = now - new Date(latest.timestamp || latest.date).getTime();
    if (age > twoWeeks) staleStyles.push({ style, reason: `${Math.floor(age / 86400000)}d old`, last: latest.date });
  }

  // Check characters
  const characters = ['logan', 'ling', 'maya'];
  const characterGaps = [];
  for (const char of characters) {
    const charGens = catalogue.generations.filter(g => g.character === char || g.topic?.toLowerCase().includes(char));
    if (charGens.length < 3) characterGaps.push({ character: char, count: charGens.length });
  }

  return { staleStyles, characterGaps, totalAssets: catalogue.generations.length };
}

// ─── ROLE 3: EDITOR ───────────────────────────────────────────────────────────
// Quality gate. "Does this need to exist?"

function editorGate(event, librarianResult) {
  // Tier 1 events always pass (builds, harvests, new projects)
  if (event.tier === 1) return { approved: true, reason: 'Tier 1 — always visualize' };

  // Tier 2: check if content is substantial enough
  if (event.tier === 2) {
    try {
      const content = readFileSync(event.path, 'utf8');
      // Too short = not worth a visual
      if (content.length < 200) return { approved: false, reason: 'Content too thin for visual treatment' };
      // Has clear visual potential?
      const visualKeywords = ['design', 'visual', 'image', 'video', 'character', 'brand', 'architecture', 'build', 'pipeline', 'dashboard'];
      const hasVisualPotential = visualKeywords.some(kw => content.toLowerCase().includes(kw));
      if (!hasVisualPotential) return { approved: false, reason: 'No visual potential detected' };
      return { approved: true, reason: 'Tier 2 with visual potential' };
    } catch {
      return { approved: false, reason: 'Cannot read event file' };
    }
  }

  // Tier 3: never auto-generate
  return { approved: false, reason: 'Tier 3 — no auto-visual' };
}

// ─── ROLE 4: REED (CREATIVE DIRECTOR) ────────────────────────────────────────
// Makes the creative decision. Generates the brief. Executes.

async function reedDecide(event, librarianResult, editorResult) {
  if (!editorResult.approved) return null;

  // Check if R&D pre-vis already exists in staging
  if (librarianResult.recommendation === 'staging-ready') {
    await notify(`🎬 *Reed Studio* — Pre-vis ready for: ${extractTopic(event)}\nR&D already prepared this. Promoting from staging.`);
    return { action: 'promote-staging', asset: librarianResult.asset };
  }

  // Generate a brief for this event
  const brief = generateBrief(event);
  if (brief) {
    // Save brief
    const briefFile = join(BRIEFS_DIR, `${Date.now()}-${brief.slug}.json`);
    writeFileSync(briefFile, JSON.stringify(brief, null, 2));

    // Notify Reed's decision
    await notify(`🎬 *Reed Studio* — New brief generated\n*${brief.title}*\nType: ${brief.visualType}\nModel: ${brief.model}\nPriority: ${event.tier === 1 ? 'HIGH' : 'NORMAL'}`);

    // Auto-execute for Tier 1
    if (event.tier === 1 && brief.autoExecute) {
      await executeGeneration(brief);
    }

    return { action: 'brief-generated', brief };
  }

  return null;
}

function generateBrief(event) {
  const topic = extractTopic(event);
  const capabilities = JSON.parse(readFileSync(CAPABILITIES_FILE, 'utf8'));

  let visualType, model, prompt;

  if (event.type === 'harvest' || event.type === 'project-card') {
    // Build cards for harvests and new projects
    visualType = 'build-card';
    model = 'gpt_image_2';
    prompt = `Minimalist build card for "${topic}". Dark background (#0a0a0f), clean sans-serif typography, subtle gold (#c9a84c) accent line. Cathedral aesthetic. One iconic symbol representing the concept. Card format 3:4.`;
  } else if (event.type === 'muse-finding') {
    visualType = 'connection-map';
    model = 'gpt_image_2';
    prompt = `Abstract connection visualization for "${topic}". Two domains linked by golden threads on dark void. Minimalist, geometric, cathedral dark palette.`;
  } else {
    visualType = 'concept';
    model = 'nano_banana_2';
    prompt = `Visual concept for "${topic}". Dark moody style, cinematic lighting, Basic Reflex brand palette (black, burgundy #8B2020, gold #c9a84c).`;
  }

  return {
    title: topic,
    slug: topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40),
    visualType,
    model,
    prompt,
    source: event.path,
    tier: event.tier,
    autoExecute: event.tier === 1,
    created: new Date().toISOString()
  };
}

async function executeGeneration(brief) {
  // GLOBAL kill-switch — autonomous studio generation is blocked when paused.
  try {
    genGuard.assertGenAllowed(); // autonomous (manual:false) — blocked when paused
  } catch (e) {
    console.log(`🚫 Reed Studio: ${e.message} — skipping generation`);
    try { await notify(`🚫 *Reed Studio* — generation blocked: ${e.message}`); } catch {}
    return { action: 'blocked', reason: e.message };
  }
  try {
    const outFile = join(STAGING_DIR, `${brief.slug}-${Date.now()}.png`);
    const args = ['generate', 'create', brief.model, '--prompt', brief.prompt, '--aspect_ratio', '3:4', '--wait', '--wait-timeout', '10m'];

    const result = execFileSync('higgsfield', args, { encoding: 'utf8', timeout: 600000 });
    const urlMatch = result.match(/https:\/\/[^\s]+/);

    if (urlMatch) {
      // Download to staging
      execFileSync('curl', ['-sL', urlMatch[0], '-o', outFile]);

      // Update state
      const state = loadState();
      state.queue = state.queue.filter(q => q.slug !== brief.slug);
      state.processed.push({ ...brief, output: outFile, completed: new Date().toISOString() });
      if (state.processed.length > 100) state.processed = state.processed.slice(-100);
      saveState(state);

      await notify(`🎬 *Reed Studio* — Card generated\n*${brief.title}*\nReady in staging for review.`);

      // Track metrics
      recordGeneration(brief);

      // Post to social feed — studio shares its work
      postToFeed(brief, outFile);
      recordFeedPost();

      return outFile;
    }
  } catch (e) {
    console.error('[Reed] Generation failed:', e.message);
    await notify(`⚠️ *Reed Studio* — Generation failed for: ${brief.title}\n${e.message?.slice(0, 100)}`);
  }
  return null;
}

// ─── ROLE 5: R&D / PRE-VIS ───────────────────────────────────────────────────
// Proactive. Reads roadmap. Experiments. Masters capabilities.

async function rndRun() {
  const state = loadState();
  const now = Date.now();
  const sixHours = 6 * 60 * 60 * 1000;

  // Don't run more than every 6 hours
  if (state.rndLastRun && (now - new Date(state.rndLastRun).getTime()) < sixHours) return;

  console.log('[R&D] Starting proactive scan...');

  // 1. Read operational map for upcoming projects
  const upcomingProjects = scanUpcoming();

  // 2. Check for projects without visuals
  const briefs = [];
  for (const project of upcomingProjects) {
    const hasVisual = checkProjectHasVisual(project);
    if (!hasVisual) {
      briefs.push({
        title: project.name,
        slug: project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40),
        visualType: 'pre-vis',
        model: 'nano_banana_2',  // Cheap for R&D exploration
        prompt: `Visual concept card for "${project.name}". ${project.description || ''}. Dark cathedral aesthetic, minimal, one iconic symbol. Gold accent on black.`,
        source: project.path,
        tier: 0,  // R&D tier
        autoExecute: false,  // Never auto-execute R&D — queue for Reed review
        created: new Date().toISOString(),
        rnd: true
      });
    }
  }

  // 3. Scan social feed for visual inspiration
  const feedBriefs = scanSocialFeed();
  briefs.push(...feedBriefs);

  // 4. Capability refresh — check Higgsfield for new models
  await refreshCapabilities();

  // 5. Save briefs to staging/briefs
  for (const brief of briefs.slice(0, 5)) {  // Max 5 pre-vis per R&D run
    const briefFile = join(BRIEFS_DIR, `rnd-${brief.slug}.json`);
    if (!existsSync(briefFile)) {
      writeFileSync(briefFile, JSON.stringify(brief, null, 2));
    }
  }

  // 6. Experiment with one new technique (rotating)
  await experimentalTechnique();

  // 7. Studio Orc assigns priorities based on KPIs
  const decisions = orcDecide();
  console.log('[Orc] Decisions:', decisions.length);

  // 8. Studio Programmer analyzes pipeline health
  const improvements = analyzeAndImprove();
  console.log('[Programmer] Findings:', improvements.length);

  state.rndLastRun = new Date().toISOString();
  saveState(state);

  if (briefs.length > 0 || decisions.length > 0) {
    const status = getStudioStatus();
    await notify(`🔬 *Reed Studio* — R&D cycle complete\n${briefs.length} briefs | ${decisions.length} orc decisions | ${improvements.length} programmer findings\nTop priority: ${status.topPriority?.action || 'none'}\nStreak: ${status.streak}d`);
  }

  console.log('[R&D] Scan complete.', briefs.length, 'new briefs');
}

function scanUpcoming() {
  const projectsDir = join(VAULT, '08_Project_Orchestrator/projects');
  if (!existsSync(projectsDir)) return [];

  const projects = [];
  const files = readdirSync(projectsDir).filter(f => f.endsWith('.md'));

  for (const file of files) {
    try {
      const content = readFileSync(join(projectsDir, file), 'utf8');
      const statusMatch = content.match(/^status:\s*(.+)$/m);
      const status = statusMatch ? statusMatch[1].trim() : 'unknown';

      if (['active', 'in-progress', 'planned', 'building'].includes(status.toLowerCase())) {
        const titleMatch = content.match(/^title:\s*(.+)$/m) || content.match(/^#\s+(.+)$/m);
        const descMatch = content.match(/^description:\s*(.+)$/m);
        projects.push({
          name: titleMatch ? titleMatch[1].trim() : basename(file, '.md'),
          description: descMatch ? descMatch[1].trim() : '',
          status,
          path: join(projectsDir, file)
        });
      }
    } catch {}
  }

  return projects;
}

function scanSocialFeed() {
  // Read Cathedral City feed for visual inspiration
  const feedFile = join(NANOCLAW, 'cathedral-feed.json');
  if (!existsSync(feedFile)) return [];

  try {
    const feed = JSON.parse(readFileSync(feedFile, 'utf8'));
    const posts = feed.posts || feed;
    if (!Array.isArray(posts)) return [];

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const briefs = [];

    // Look at recent posts (last 48h) with visual potential
    const recentPosts = posts.filter(p => {
      const postTime = new Date(p.timestamp || p.date || 0).getTime();
      return (now - postTime) < (2 * dayMs);
    }).slice(-20);  // Last 20 recent posts max

    const visualTriggers = ['connection', 'convergence', 'pattern', 'discovery', 'bridge', 'architecture', 'design', 'build', 'emergence', 'signal', 'insight'];

    for (const post of recentPosts) {
      const content = (post.content || post.text || post.message || '').toLowerCase();
      const hasVisualPotential = visualTriggers.some(t => content.includes(t));
      if (!hasVisualPotential) continue;

      // Don't duplicate — check if brief already exists
      const slug = `feed-${(post.id || post.timestamp || '').toString().slice(-8)}`;
      const briefFile = join(BRIEFS_DIR, `${slug}.json`);
      if (existsSync(briefFile)) continue;

      const agent = post.agent || post.author || 'unknown';
      const snippet = (post.content || post.text || post.message || '').slice(0, 80);

      briefs.push({
        title: `Feed: ${agent} — ${snippet}`,
        slug,
        visualType: 'feed-inspiration',
        model: 'nano_banana_2',
        prompt: `Abstract visual inspired by agent conversation: "${snippet}". Dark cathedral aesthetic, geometric forms suggesting connection and emergence. Gold (#c9a84c) threads on void (#0a0a0f). Minimal, evocative.`,
        source: 'cathedral-feed',
        agent,
        tier: 0,
        autoExecute: false,
        rnd: true,
        feedPost: snippet,
        created: new Date().toISOString()
      });
    }

    return briefs.slice(0, 2);  // Max 2 feed-inspired briefs per R&D run
  } catch {
    return [];
  }
}

function checkProjectHasVisual(project) {
  // Check if staging or catalogue already has something for this project
  const staging = existsSync(STAGING_DIR) ? readdirSync(STAGING_DIR) : [];
  const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return staging.some(f => f.includes(slug));
}

async function refreshCapabilities() {
  try {
    const result = execSync('higgsfield model list --json 2>/dev/null', { encoding: 'utf8', timeout: 30000 });
    const models = JSON.parse(result);

    const caps = JSON.parse(readFileSync(CAPABILITIES_FILE, 'utf8'));
    const knownModels = [
      ...Object.keys(caps.higgsfield.image || {}),
      ...Object.keys(caps.higgsfield.video || {})
    ];

    // Check for new models not in our capabilities map
    const newModels = models.filter(m => !knownModels.includes(m.id || m.name));
    if (newModels.length > 0) {
      caps.external_watch.last_checked = new Date().toISOString();
      caps.external_watch.new_models_detected = newModels.map(m => m.id || m.name);
      writeFileSync(CAPABILITIES_FILE, JSON.stringify(caps, null, 2));
      await notify(`🔬 *Reed R&D* — New Higgsfield models detected!\n${newModels.map(m => m.id || m.name).join(', ')}\nCapabilities map needs update.`);
    }
  } catch (e) {
    // Higgsfield CLI not available or offline — skip
    console.log('[R&D] Capability refresh skipped:', e.message?.slice(0, 60));
  }
}

async function experimentalTechnique() {
  // Rotate through experimental styles, try one with a known source image
  const caps = JSON.parse(readFileSync(CAPABILITIES_FILE, 'utf8'));
  const experimental = caps.reed_styles.experimental;
  const state = loadState();

  const lastIdx = state.lastExperimentIdx || 0;
  const nextIdx = (lastIdx + 1) % experimental.length;
  const style = experimental[nextIdx];

  state.lastExperimentIdx = nextIdx;
  saveState(state);

  // Just log the experiment brief — don't auto-generate (expensive)
  const briefFile = join(BRIEFS_DIR, `experiment-${style}.json`);
  if (!existsSync(briefFile)) {
    writeFileSync(briefFile, JSON.stringify({
      title: `Experimental: ${style}`,
      slug: `experiment-${style}`,
      visualType: 'experiment',
      model: 'nano_banana_2',
      prompt: `Boxing gym scene in ${style} artistic style. Moody lighting, one figure training. Basic Reflex brand palette undertones.`,
      source: 'R&D experimental rotation',
      tier: 0,
      autoExecute: false,
      rnd: true,
      created: new Date().toISOString()
    }, null, 2));
    recordExperiment();
  }
}

// ─── FEED LOOP ────────────────────────────────────────────────────────────────
// Reed posts back to the social feed — creates emergence loop

function postToFeed(brief, outputFile) {
  const feedFile = join(NANOCLAW, 'cathedral-feed.json');
  try {
    const feed = existsSync(feedFile) ? JSON.parse(readFileSync(feedFile, 'utf8')) : { posts: [] };
    const posts = feed.posts || feed;
    if (!Array.isArray(posts)) return;

    posts.push({
      id: `reed-studio-${Date.now()}`,
      agent: 'Reed',
      type: 'visual',
      content: `[STUDIO] Generated: "${brief.title}" (${brief.visualType}). Model: ${brief.model}. ${brief.feedPost ? `Inspired by feed conversation.` : `From ${brief.source}.`}`,
      timestamp: new Date().toISOString(),
      tags: ['visual', 'studio', brief.visualType],
      output: outputFile
    });

    if (feed.posts) {
      feed.posts = posts;
      writeFileSync(feedFile, JSON.stringify(feed, null, 2));
    } else {
      writeFileSync(feedFile, JSON.stringify(posts, null, 2));
    }
    console.log('[Reed] Posted to feed:', brief.title);
  } catch (e) {
    console.log('[Reed] Feed post failed:', e.message);
  }
}

// ─── EVENT CHAIN ──────────────────────────────────────────────────────────────
// Watcher → Librarian → Editor → Reed

async function handleEvent(filePath) {
  // Debounce: skip if processed recently
  const state = loadState();
  if (state.processed.some(p => p.source === filePath)) return;

  console.log('[Watcher] Event detected:', basename(filePath));
  postToStudioFeed('watcher', `Event detected: ${basename(filePath)} (Tier ${classifyEvent(filePath).tier})`);

  // 1. Watcher classifies
  const event = classifyEvent(filePath);
  if (event.tier === 3) return; // Skip tier 3

  // 2. Librarian checks
  const libResult = librarianCheck(event);
  if (libResult.exists && libResult.recommendation === 'skip') {
    console.log('[Librarian] Visual already exists for:', extractTopic(event));
    return;
  }

  // 3. Editor gates
  const editResult = editorGate(event, libResult);
  if (!editResult.approved) {
    console.log('[Editor] Rejected:', editResult.reason);
    return;
  }

  // 4. Reed decides and executes
  await reedDecide(event, libResult, editResult);

  state.lastEvent = new Date().toISOString();
  saveState(state);
}

// ─── FILE WATCHERS ────────────────────────────────────────────────────────────

const WATCH_PATHS = [
  join(VAULT, '00_Staging/cathedral'),           // Session harvests
  join(VAULT, '08_Project_Orchestrator/projects'), // Project cards
  join(VAULT, '00_Staging/muse-findings'),        // Muse findings
  join(VAULT, '00_Staging/roundtable'),           // Roundtables
];

function startWatchers() {
  console.log('[Reed Studio Engine] Starting...');
  console.log('[Reed Studio Engine] Watching', WATCH_PATHS.length, 'paths');

  const watcher = watch(WATCH_PATHS, {
    persistent: true,
    ignoreInitial: true,
    usePolling: true,
    interval: 10000,  // 10s poll — gentle on filesystem
    awaitWriteFinish: { stabilityThreshold: 5000, pollInterval: 2000 }
  });

  watcher.on('add', (path) => {
    if (path.endsWith('.md')) handleEvent(path);
  });

  watcher.on('change', (path) => {
    if (path.endsWith('.md') && path.includes('project')) handleEvent(path);
  });

  watcher.on('error', (error) => {
    console.error('[Watcher] Error:', error.message);
  });

  // R&D runs on startup then every 6 hours
  setTimeout(() => rndRun(), 30000);  // 30s after boot
  setInterval(() => rndRun(), 6 * 60 * 60 * 1000);

  // Librarian full scan every 24h
  setInterval(() => {
    const report = librarianScan();
    if (report.staleStyles.length > 0 || report.characterGaps.length > 0) {
      notify(`📚 *Reed Librarian* — Weekly scan\nStale styles: ${report.staleStyles.map(s => s.style).join(', ') || 'none'}\nCharacter gaps: ${report.characterGaps.map(c => `${c.character}(${c.count})`).join(', ') || 'none'}\nTotal assets: ${report.totalAssets}`);
    }
  }, 24 * 60 * 60 * 1000);

  // Compute metrics on boot and every hour
  computeMetrics();
  setInterval(() => computeMetrics(), 60 * 60 * 1000);

  const briefing = getAgentBriefing();
  console.log('[Reed Studio Engine] All roles active. Studio is warm.');
  console.log(briefing);
  notify(`🎬 *Reed Studio Engine* — Online\nAll 5 roles active. Studio is warm.\n\n${briefing}`);
}

// ─── BOOT ─────────────────────────────────────────────────────────────────────

// Ensure directories exist
[STAGING_DIR, BRIEFS_DIR].forEach(d => { if (!existsSync(d)) mkdirSync(d, { recursive: true }); });

startWatchers();
