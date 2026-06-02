// content-studio/idea-engine.js — Autonomous idea generation + agent review
// Daily cron: characters pitch → agents review → Cull gates → queue for Paul
// ESM module

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { notify } from './notify.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME || '/Users/basicclaw777';

// Paths
const CHARACTERS_PATH = path.join(__dirname, 'characters.json');
const FEED_PATH = path.join(__dirname, 'studio-feed.json');
const QUEUE_PATH = path.join(__dirname, 'content-queue.json');
const MEMORY_DIR = path.join(__dirname, 'character-memory');
const METRICS_PATH = path.join(__dirname, 'metrics.json');

// Agent routing
const AGENT_REGISTRY = path.join(HOME, 'Cathedral', 'agents', 'registry.json');
const { sendMessage, readMessages } = require(path.join(HOME, 'nanoclaw', 'project-messages.cjs'));

// DeepSeek for idea generation
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || (() => {
  try { const env = fs.readFileSync(path.join(HOME, 'nanoclaw', '.env'), 'utf-8'); const m = env.match(/DEEPSEEK_API_KEY=(.+)/); return m ? m[1].trim() : ''; } catch { return ''; }
})();

function loadJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; } }
function saveJSON(p, data) { fs.writeFileSync(p, JSON.stringify(data, null, 2)); }

// ── Character Memory (individual) ────────────────────────────────────────────

function ensureMemoryDir() {
  if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

function getCharacterMemory(charId) {
  ensureMemoryDir();
  const f = path.join(MEMORY_DIR, `${charId}.json`);
  return loadJSON(f) || {
    pitches: [],
    selected: 0,
    ignored: 0,
    rejected: 0,
    selectionRate: null,
    recentThemes: [],
    agentFeedback: [],
    lastPitch: null
  };
}

function saveCharacterMemory(charId, mem) {
  ensureMemoryDir();
  saveJSON(path.join(MEMORY_DIR, `${charId}.json`), mem);
}

// ── Feed posting ─────────────────────────────────────────────────────────────

function postToFeed(role, content, tags = []) {
  const feed = loadJSON(FEED_PATH) || { posts: [], meta: {} };
  const post = {
    id: `${role}-${Date.now()}`,
    role,
    content,
    timestamp: new Date().toISOString(),
    tags: [role, ...tags]
  };
  feed.posts.unshift(post);
  if (feed.posts.length > 200) feed.posts = feed.posts.slice(0, 200);
  saveJSON(FEED_PATH, feed);
  return post;
}

// ── DeepSeek Call ────────────────────────────────────────────────────────────

async function callDeepSeek(system, prompt, maxTokens = 500) {
  if (!DEEPSEEK_KEY) throw new Error('No DEEPSEEK_API_KEY');
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.8
    })
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── Input Gatherers ──────────────────────────────────────────────────────────

function gatherReedInputs() {
  const inputs = [];
  // Recent gym sessions
  const gymDir = path.join(HOME, 'basic-reflex', 'gym-eyes', 'sessions');
  if (fs.existsSync(gymDir)) {
    const files = fs.readdirSync(gymDir).filter(f => f.endsWith('.json')).slice(-3);
    inputs.push(`Recent gym sessions: ${files.length} in last batch`);
  }
  // Reed lab catalogue
  const cat = loadJSON(path.join(HOME, 'nanoclaw', 'reed-lab', 'catalogue.json'));
  if (cat?.entries) {
    const recent = cat.entries.slice(-5).map(e => e.style || e.type).join(', ');
    inputs.push(`Recent Reed Lab: ${recent}`);
  }
  // Style experiments
  const metrics = loadJSON(METRICS_PATH);
  if (metrics?.projects?.reed_visuals) {
    inputs.push(`Style experiments running: ${metrics.projects.reed_visuals.style_experiments_running}`);
  }
  return inputs;
}

function gatherMayaInputs() {
  const inputs = [];
  // Student profiles
  const profilesDir = path.join(HOME, 'basic-reflex', 'gym-eyes', 'students');
  if (fs.existsSync(profilesDir)) {
    const students = fs.readdirSync(profilesDir).filter(f => f.endsWith('.json'));
    inputs.push(`Students tracked: ${students.length}`);
    // Check for recent milestones
    for (const sf of students.slice(-3)) {
      try {
        const s = JSON.parse(fs.readFileSync(path.join(profilesDir, sf), 'utf-8'));
        if (s.milestones?.length > 0) {
          const latest = s.milestones[s.milestones.length - 1];
          inputs.push(`${s.name} milestone: ${latest.type || latest.description || 'achieved'}`);
        }
      } catch {}
    }
  }
  // Challenge data
  const challenge = loadJSON(path.join(HOME, 'basic-reflex', 'gym-eyes', 'challenge.json'));
  if (challenge?.participants) {
    const active = Object.values(challenge.participants).filter(p => p.streak > 0);
    inputs.push(`100 Punches Challenge: ${active.length} active participants`);
  }
  return inputs;
}

function gatherLingInputs() {
  const inputs = [];
  // Recent Cathedral builds (terminal harvests)
  const harvestDir = path.join(HOME, 'cathedral-vault', '00_Staging', 'cathedral');
  if (fs.existsSync(harvestDir)) {
    const harvests = fs.readdirSync(harvestDir)
      .filter(f => f.startsWith('terminal-harvest') || f.startsWith('session-harvest'))
      .sort().slice(-3);
    for (const h of harvests) {
      try {
        const content = fs.readFileSync(path.join(harvestDir, h), 'utf-8').slice(0, 200);
        inputs.push(`Recent build: ${content.split('\n').find(l => l.includes('title:'))?.replace('title:', '').trim() || h}`);
      } catch {}
    }
  }
  // Agent engine state (what's new in the system)
  const agentState = path.join(HOME, 'Cathedral', 'agents', 'state');
  if (fs.existsSync(agentState)) {
    const states = fs.readdirSync(agentState).filter(f => f.endsWith('.json'));
    inputs.push(`Active agents: ${states.length}`);
  }
  return inputs;
}

function gatherEchoInputs() {
  const inputs = [];
  // Content queue performance
  const queue = loadJSON(QUEUE_PATH);
  if (queue?.items) {
    const selected = queue.items.filter(i => i.status === 'selected').length;
    const total = queue.items.length;
    inputs.push(`Queue: ${total} items, ${selected} selected by Paul`);
  }
  // Character selection rates
  for (const charId of ['reed', 'maya', 'ling']) {
    const mem = getCharacterMemory(charId);
    if (mem.selectionRate !== null) {
      inputs.push(`${charId} selection rate: ${(mem.selectionRate * 100).toFixed(0)}%`);
    }
  }
  return inputs;
}

// ── New Project Input Gatherers ───────────────────────────────────────────────

function gatherBuildCardInputs() {
  const inputs = [];
  // Terminal harvests = build news
  const harvestDir = path.join(HOME, 'cathedral-vault', '00_Staging', 'cathedral');
  if (fs.existsSync(harvestDir)) {
    const harvests = fs.readdirSync(harvestDir)
      .filter(f => f.startsWith('terminal-harvest') || f.startsWith('session-harvest'))
      .sort().slice(-5);
    for (const h of harvests) {
      try {
        const content = fs.readFileSync(path.join(harvestDir, h), 'utf-8');
        const title = content.split('\n').find(l => l.includes('title:'))?.replace('title:', '').trim();
        const builds = content.match(/(?:built|created|wired|deployed|added|fixed)\b.{10,80}/gi)?.slice(0, 3) || [];
        if (title) inputs.push(`Build: ${title}`);
        for (const b of builds) inputs.push(`Detail: ${b.trim()}`);
      } catch {}
    }
  }
  // PM2 new processes
  const scheduleFile = path.join(HOME, 'Cathedral', 'cathedral-schedule.json');
  const schedule = loadJSON(scheduleFile);
  if (schedule?.always_on) {
    inputs.push(`Live services: ${schedule.always_on.length}`);
  }
  return inputs;
}

function gatherNewsletterInputs() {
  const inputs = [];
  // Best performing content from character memories
  for (const charId of ['reed', 'maya', 'ling']) {
    const mem = getCharacterMemory(charId);
    const winners = mem.pitches.filter(p => p.status === 'selected').slice(-3);
    for (const w of winners) {
      inputs.push(`Winner (${charId}): ${w.idea}`);
    }
  }
  // Queue performance
  const queue = loadJSON(QUEUE_PATH);
  if (queue?.items) {
    const selected = queue.items.filter(i => i.status === 'selected').length;
    inputs.push(`Total selected content: ${selected} pieces`);
  }
  return inputs;
}

function gatherCaptureWishlistInputs() {
  const inputs = [];
  // What's missing from recent content attempts
  for (const charId of ['reed', 'maya']) {
    const mem = getCharacterMemory(charId);
    const culled = mem.pitches.filter(p => p.status === 'culled' || p.status === 'rejected').slice(-5);
    for (const c of culled) {
      if (c.reason) inputs.push(`Gap (${charId}): ${c.reason}`);
    }
  }
  // Check gym sessions for what's NOT captured
  const gymDir = path.join(HOME, 'basic-reflex', 'gym-eyes', 'sessions');
  if (fs.existsSync(gymDir)) {
    const files = fs.readdirSync(gymDir).filter(f => f.endsWith('.json'));
    inputs.push(`Gym sessions on file: ${files.length}`);
  }
  // Student profiles without photos/video
  const profilesDir = path.join(HOME, 'basic-reflex', 'gym-eyes', 'students');
  if (fs.existsSync(profilesDir)) {
    const students = fs.readdirSync(profilesDir).filter(f => f.endsWith('.json'));
    inputs.push(`Students tracked: ${students.length} (check who needs fresh footage)`);
  }
  return inputs;
}

const WISHLIST_PATH = path.join(__dirname, 'capture-wishlist.json');

function addCaptureRequest(request) {
  const wishlist = loadJSON(WISHLIST_PATH) || { requests: [], fulfilled: [] };
  wishlist.requests.unshift(request);
  if (wishlist.requests.length > 30) wishlist.requests = wishlist.requests.slice(0, 30);
  wishlist.lastUpdated = new Date().toISOString();
  saveJSON(WISHLIST_PATH, wishlist);
}

export function getCaptureWishlist() {
  return loadJSON(WISHLIST_PATH) || { requests: [], fulfilled: [] };
}

export function fulfillCaptureRequest(requestId) {
  const wishlist = loadJSON(WISHLIST_PATH);
  if (!wishlist) return null;
  const idx = wishlist.requests.findIndex(r => r.id === requestId);
  if (idx === -1) return null;
  const [request] = wishlist.requests.splice(idx, 1);
  request.fulfilledAt = new Date().toISOString();
  wishlist.fulfilled.push(request);
  if (wishlist.fulfilled.length > 50) wishlist.fulfilled = wishlist.fulfilled.slice(-50);
  wishlist.lastUpdated = new Date().toISOString();
  saveJSON(WISHLIST_PATH, wishlist);
  return request;
}

// ── Agent Routing Map ────────────────────────────────────────────────────────

const REVIEW_ROUTES = {
  reed: ['boxing-app', 'br-ops'],      // Boxing validates technique, BR-Ops validates brand
  maya: ['br-ops', 'boxing-app'],       // BR-Ops validates members, Boxing validates context
  ling: ['universe', 'cathedral'],      // Universe adds depth, Cathedral validates build claims
  'build-card': ['cathedral', 'br-ops'],  // Cathedral verifies truth, BR-Ops validates external value
  newsletter: ['br-ops', 'universe'],     // BR-Ops validates audience, Universe validates depth
  'capture-wish': ['boxing-app', 'br-ops'] // Boxing validates gym relevance, BR-Ops validates brand need
};

// ── Idea Generation ──────────────────────────────────────────────────────────

async function generateIdea(charId, character, inputs, memory) {
  const recentPitches = memory.pitches.slice(-5).map(p => p.idea).join('\n- ');
  const rejected = memory.pitches.filter(p => p.status === 'rejected').slice(-3).map(p => `${p.idea} (reason: ${p.reason || 'unknown'})`).join('\n- ');

  const system = `You are ${character.name}, ${character.role} at Basic Reflex boxing gym's Content Studio.
Expertise: ${character.expertise.join(', ')}
Motivated by: ${character.motivatedBy}
Frustrated by: ${character.frustrated_by}
Platforms: ${character.platforms.join(', ')}
${memory.selectionRate !== null ? `Your selection rate: ${(memory.selectionRate * 100).toFixed(0)}% — ${memory.selectionRate < 0.3 ? 'LOW, adjust approach' : memory.selectionRate > 0.6 ? 'HIGH, keep this energy' : 'moderate, keep experimenting'}` : ''}
${recentPitches ? `\nYour recent pitches (avoid repeating):\n- ${recentPitches}` : ''}
${rejected ? `\nRecently rejected (learn from these):\n- ${rejected}` : ''}`;

  // Load video engine templates for video ideas
  let videoEngineContext = '';
  try {
    const ve = JSON.parse(fs.readFileSync(path.join(HOME, 'nanoclaw', 'video-engine.json'), 'utf-8'));
    const templateNames = Object.entries(ve.templates).map(([k, t]) => `${t.name} (${t.beats.length} beats, ${t.duration})`).join(', ');
    videoEngineContext = `\nVIDEO BEAT TEMPLATES AVAILABLE: ${templateNames}
When pitching a video/reel idea, reference which beat template to use (or propose a new one). Templates define the shot sequence — text overlays are written FIRST, then shots planned to match.
Text rules: max ${ve.text_rules.max_lines_per_video} overlay lines per video. Voice: ${ve.text_rules.voice}
NEVER use: ${ve.text_rules.avoid.join(', ')}`;
  } catch {}

  const prompt = `Based on these signals, pitch ONE specific content idea.

CONTEXT: Basic Reflex is a BOXING gym in Hong Kong. Coach Paul teaches boxing — punches, pads, bags, footwork, sparring. NOT weightlifting, NOT CrossFit. All content must be boxing-related.

INPUTS:
${inputs.map(i => `- ${i}`).join('\n')}
${videoEngineContext}

VIRAL VIDEO RULES (apply to all reels/video ideas):
1. STORY — tell WHY, not what. "Why I teach the jab first" > "Jab tutorial"
2. VERBAL HOOK — first 1-3 seconds must stop the scroll (text overlay or spoken)
3. VISUAL HOOK — thumbnail must pop on the grid. Bold contrast, curiosity, mid-action freeze
4. TRIAL REEL — if this is a growth piece (not member celebration), flag as TRIAL_REEL=yes so it reaches non-followers first
5. EDITING — note if CapCut/Reels editor effects would boost it (slow-mo, zoom, text overlays)
6. BEAT TEMPLATE — if pitching a reel/video, specify which Video Engine template to follow (or NEW if proposing a fresh beat structure)

Respond in this exact format:
IDEA: [one-line pitch]
PLATFORM: [which platform]
FORMAT: [post/story/reel/article/thread/visual]
WHY_NOW: [why this moment, not last week]
HOOK: [the verbal hook — first words viewer hears/reads]
VISUAL_HOOK: [what the thumbnail looks like — describe the freeze frame]
STORY_ANGLE: [the "why" behind this content — what lesson or moment drives it]
TRIAL_REEL: [yes/no — yes if growth-focused, no if community/member content]
EDITING_NOTES: [specific editing suggestions: slow-mo, zoom cuts, text overlays, transitions]
BEAT_TEMPLATE: [which Video Engine template to use, or NEW, or N/A if not a video]`;

  const response = await callDeepSeek(system, prompt, 300);
  return parseIdeaResponse(response, charId);
}

function parseIdeaResponse(text, charId) {
  const lines = text.split('\n').filter(l => l.trim());
  const get = (prefix) => lines.find(l => l.startsWith(prefix))?.replace(prefix, '').trim() || '';

  return {
    id: `${charId}-${Date.now()}`,
    character: charId,
    idea: get('IDEA:'),
    platform: get('PLATFORM:'),
    format: get('FORMAT:'),
    whyNow: get('WHY_NOW:'),
    hook: get('HOOK:'),
    visualHook: get('VISUAL_HOOK:'),
    storyAngle: get('STORY_ANGLE:'),
    trialReel: get('TRIAL_REEL:').toLowerCase().startsWith('yes'),
    editingNotes: get('EDITING_NOTES:'),
    beatTemplate: get('BEAT_TEMPLATE:') || null,
    timestamp: new Date().toISOString(),
    status: 'pitched',
    agentReviews: [],
    cullVerdict: null,
    reason: null
  };
}

// ── Cull's Quality Gate ──────────────────────────────────────────────────────

async function cullReview(ideas) {
  if (ideas.length === 0) return [];

  const ideasText = ideas.map((idea, i) =>
    `${i + 1}. [${idea.character}] ${idea.idea} (${idea.platform}/${idea.format}) — Hook: "${idea.hook}"`
  ).join('\n');

  const agentFeedback = ideas.map(idea => {
    if (idea.agentReviews.length === 0) return '';
    return `${idea.character}: ${idea.agentReviews.map(r => `${r.from}: ${r.verdict}`).join('; ')}`;
  }).filter(Boolean).join('\n');

  const system = `You are Cull, Editor and Quality Gate at Basic Reflex Content Studio.
Your job: kill weak ideas, approve strong ones. Selection rate going UP is your win.
Criteria: Does it deserve to exist? Is the hook real? Is timing genuine? Would Paul use it?
Agent feedback (if available): weigh endorsements and concerns.

IMPORTANT: You MUST approve at least 1 idea per cycle. A studio that ships nothing dies. If all ideas are mediocre, pick the strongest and approve it. Kill the rest. Zero approvals is NEVER acceptable.`;

  const prompt = `Review these pitches. For each, respond APPROVE or KILL with one-line reason.
${agentFeedback ? `\nAgent feedback:\n${agentFeedback}\n` : ''}
PITCHES:
${ideasText}

Format each line: [number] [APPROVE/KILL] [reason]`;

  const response = await callDeepSeek(system, prompt, 400);

  // Parse verdicts — flexible matching
  const verdicts = [];
  for (const line of response.split('\n')) {
    const match = line.match(/(\d+)[.\s:)\-]*\[?(APPROVE|KILL)\]?\s*[:\-—]?\s*(.+)?/i);
    if (match) {
      const idx = parseInt(match[1]) - 1;
      if (idx >= 0 && idx < ideas.length) {
        verdicts.push({
          index: idx,
          verdict: match[2].toUpperCase(),
          reason: (match[3] || '').trim()
        });
      }
    }
  }
  return verdicts;
}

// ── Route to Cathedral Agents ────────────────────────────────────────────────

function routeToAgents(idea) {
  const targets = REVIEW_ROUTES[idea.character] || [];
  for (const target of targets) {
    sendMessage(target, `content-studio-${idea.character}`,
      `Content review request: ${idea.idea}`,
      `${idea.character} pitched: "${idea.idea}" for ${idea.platform} (${idea.format}).\nHook: "${idea.hook}"\nWhy now: ${idea.whyNow}\n\nPlease respond with: ENDORSE, CONCERN, or REJECT + one line reason.`,
      { domain: 'content-studio', priority: 'low', type: 'review-request', ideaId: idea.id }
    );
  }
  return targets;
}

function collectAgentReviews(ideaId, charId) {
  // Check inbox for responses to our review requests
  const inbox = `content-studio-${charId}`;
  const messages = readMessages(inbox, { unreadOnly: true, markRead: true });
  const reviews = [];
  for (const msg of messages) {
    if (msg.body?.includes(ideaId) || msg.subject?.includes('review')) {
      const verdict = msg.body?.match(/(ENDORSE|CONCERN|REJECT)/i)?.[1] || 'unknown';
      reviews.push({ from: msg.from, verdict: verdict.toUpperCase(), detail: msg.body?.slice(0, 200) });
    }
  }
  return reviews;
}

// ── Maya's Bridge Test (pre-publish gate for BR content) ─────────────────────

const BR_CHARACTERS = ['maya', 'reed', 'compass', 'flick'];

function bridgeTest(idea) {
  // Only applies to BR-facing content
  if (!BR_CHARACTERS.includes(idea.character?.toLowerCase())) return { pass: true, reason: 'non-BR content' };

  const text = `${idea.idea} ${idea.hook} ${idea.whyNow || ''} ${idea.editingNotes || ''}`.toLowerCase();

  // Q1: Would a member send this to a friend?
  const shareSignals = ['tag a friend', 'share', 'send this to', 'relatable', 'we all know', 'that feeling'];
  const hasSharePull = shareSignals.some(s => text.includes(s)) || text.includes('member') || text.includes('community');

  // Q2: Relationship, not technique?
  const techOnly = ['how to', 'tutorial', 'step by step', 'technique breakdown', 'form guide'];
  const relSignals = ['story', 'journey', 'moment', 'behind the scenes', 'real talk', 'celebrate', 'milestone'];
  const isTechOnly = techOnly.some(s => text.includes(s)) && !relSignals.some(s => text.includes(s));

  // Q3: Could be shot on a phone?
  const overProduced = ['cinematic', 'drone shot', 'studio lighting', 'professional setup'];
  const isOverProduced = overProduced.some(s => text.includes(s));

  // Q4: Moment belongs to member, not camera?
  const memberCentric = ['member', 'student', 'fighter', 'coach paul', 'class', 'session', 'first time', 'personal best'];
  const isMemberCentric = memberCentric.some(s => text.includes(s));

  const score = (hasSharePull ? 1 : 0) + (!isTechOnly ? 1 : 0) + (!isOverProduced ? 1 : 0) + (isMemberCentric ? 1 : 0);
  const pass = score >= 2;

  const reasons = [];
  if (!hasSharePull) reasons.push('no share pull');
  if (isTechOnly) reasons.push('technique without relationship');
  if (isOverProduced) reasons.push('over-produced feel');
  if (!isMemberCentric) reasons.push('not member-centric');

  return {
    pass,
    score,
    reason: pass ? `Bridge Test ${score}/4` : `Bridge Test FAIL ${score}/4: ${reasons.join(', ')}`
  };
}

// ── Content Queue ────────────────────────────────────────────────────────────

function addToQueue(idea) {
  const queue = loadJSON(QUEUE_PATH) || { items: [], lastUpdated: null };
  queue.items.unshift({
    ...idea,
    status: 'queued',
    queuedAt: new Date().toISOString()
  });
  // Keep queue manageable
  if (queue.items.length > 50) queue.items = queue.items.slice(0, 50);
  queue.lastUpdated = new Date().toISOString();
  saveJSON(QUEUE_PATH, queue);
}

// ── Selection Feedback (called when Paul acts on queue) ──────────────────────

export function selectIdea(ideaId) {
  const queue = loadJSON(QUEUE_PATH);
  if (!queue) return null;
  const item = queue.items.find(i => i.id === ideaId);
  if (!item) return null;

  item.status = 'selected';
  item.selectedAt = new Date().toISOString();
  saveJSON(QUEUE_PATH, queue);

  // Update character memory
  const mem = getCharacterMemory(item.character);
  mem.selected++;
  const pitch = mem.pitches.find(p => p.id === ideaId);
  if (pitch) pitch.status = 'selected';
  updateSelectionRate(mem);
  saveCharacterMemory(item.character, mem);

  postToFeed(item.character, `WIN: "${item.idea}" selected by Paul. Selection rate: ${(mem.selectionRate * 100).toFixed(0)}%`, ['selected']);
  return item;
}

export function rejectIdea(ideaId, reason = '') {
  const queue = loadJSON(QUEUE_PATH);
  if (!queue) return null;
  const item = queue.items.find(i => i.id === ideaId);
  if (!item) return null;

  item.status = 'rejected';
  item.rejectedAt = new Date().toISOString();
  item.reason = reason;
  saveJSON(QUEUE_PATH, queue);

  // Update character memory
  const mem = getCharacterMemory(item.character);
  mem.rejected++;
  const pitch = mem.pitches.find(p => p.id === ideaId);
  if (pitch) { pitch.status = 'rejected'; pitch.reason = reason; }
  updateSelectionRate(mem);
  saveCharacterMemory(item.character, mem);

  return item;
}

function updateSelectionRate(mem) {
  const total = mem.selected + mem.ignored + mem.rejected;
  mem.selectionRate = total > 0 ? mem.selected / total : null;
}

// ── Main Engine Run ──────────────────────────────────────────────────────────

export async function runIdeaEngine() {
  const characters = loadJSON(CHARACTERS_PATH)?.characters;
  if (!characters) { console.error('No characters.json'); return; }

  const creators = ['reed', 'maya', 'ling']; // Only creators pitch
  const ideas = [];

  console.log('[idea-engine] Starting daily pitch cycle...');

  // Phase 1: Each creator generates an idea
  for (const charId of creators) {
    const char = characters[charId];
    if (!char) continue;

    const memory = getCharacterMemory(charId);
    let inputs;
    switch (charId) {
      case 'reed': inputs = gatherReedInputs(); break;
      case 'maya': inputs = gatherMayaInputs(); break;
      case 'ling': inputs = gatherLingInputs(); break;
      default: inputs = [];
    }

    if (inputs.length === 0) {
      inputs.push('No fresh signals today. Pitch from evergreen knowledge.');
    }

    try {
      const idea = await generateIdea(charId, char, inputs, memory);
      if (idea.idea) {
        ideas.push(idea);
        memory.pitches.push({ id: idea.id, idea: idea.idea, platform: idea.platform, status: 'pitched', timestamp: idea.timestamp });
        if (memory.pitches.length > 50) memory.pitches = memory.pitches.slice(-50);
        memory.lastPitch = idea.timestamp;
        saveCharacterMemory(charId, memory);
        postToFeed(charId, `PITCH: ${idea.idea} [${idea.platform}/${idea.format}] — Hook: "${idea.hook}"`, ['pitch', idea.platform]);
        console.log(`[idea-engine] ${charId} pitched: ${idea.idea}`);
      }
    } catch (err) {
      console.error(`[idea-engine] ${charId} failed:`, err.message);
    }
  }

  // Phase 2: Echo's meta-pitch (based on what's working)
  try {
    const echoInputs = gatherEchoInputs();
    if (echoInputs.length > 0) {
      const echoChar = characters.echo;
      const echoMem = getCharacterMemory('echo');
      const echoIdea = await generateIdea('echo', echoChar, echoInputs, echoMem);
      if (echoIdea.idea) {
        ideas.push(echoIdea);
        postToFeed('echo', `SIGNAL: ${echoIdea.idea} — based on performance data`, ['signal', 'echo']);
      }
    }
  } catch (err) {
    console.error('[idea-engine] echo failed:', err.message);
  }

  // Phase 2.5: New project pitches (Build Cards, Newsletter, Capture Wishlist)
  // Build Cards — LING pitches how to share a recent build externally
  try {
    const buildInputs = gatherBuildCardInputs();
    if (buildInputs.length > 2) { // Only pitch if there's real build news
      const lingChar = characters.ling;
      const lingMem = getCharacterMemory('ling');
      const buildSystem = `You are LING, publishing director. You're pitching a BUILD CARD — turning internal Cathedral/BR builds into shareable authority content. Show the world what's being built without revealing architecture. Focus on the insight, the result, the principle — not the plumbing.`;
      const buildPrompt = `Based on these recent builds, pitch ONE build card idea.\n\nBUILDS:\n${buildInputs.map(i => `- ${i}`).join('\n')}\n\nRespond in this exact format:\nIDEA: [one-line pitch for the build card]\nPLATFORM: [LinkedIn/Twitter/Instagram]\nFORMAT: [post/thread/carousel]\nWHY_NOW: [why this build is shareable now]\nHOOK: [the opening line]`;
      const response = await callDeepSeek(buildSystem, buildPrompt, 300);
      const buildIdea = parseIdeaResponse(response, 'build-card');
      buildIdea.project = 'build_cards';
      if (buildIdea.idea) {
        ideas.push(buildIdea);
        postToFeed('ling', `BUILD CARD PITCH: ${buildIdea.idea} [${buildIdea.platform}] — Hook: "${buildIdea.hook}"`, ['pitch', 'build-card']);
        console.log(`[idea-engine] build-card pitched: ${buildIdea.idea}`);
      }
    }
  } catch (err) {
    console.error('[idea-engine] build-card failed:', err.message);
  }

  // Newsletter — LING curates what to include in next edition
  try {
    const nlInputs = gatherNewsletterInputs();
    if (nlInputs.length > 0) {
      const nlSystem = `You are LING, publishing director. You're pitching the NEXT NEWSLETTER edition theme. The newsletter curates the best of what the studio produced — winners, insights, behind-the-scenes. It's a digest, not a broadcast.`;
      const nlPrompt = `Based on recent wins and content, suggest ONE newsletter angle.\n\nRECENT WINS:\n${nlInputs.map(i => `- ${i}`).join('\n')}\n\nRespond in this exact format:\nIDEA: [newsletter edition theme/angle]\nPLATFORM: Substack\nFORMAT: newsletter\nWHY_NOW: [why this theme now]\nHOOK: [subject line / opening]`;
      const response = await callDeepSeek(nlSystem, nlPrompt, 300);
      const nlIdea = parseIdeaResponse(response, 'newsletter');
      nlIdea.project = 'newsletter';
      if (nlIdea.idea) {
        ideas.push(nlIdea);
        postToFeed('ling', `NEWSLETTER PITCH: ${nlIdea.idea} — Hook: "${nlIdea.hook}"`, ['pitch', 'newsletter']);
        console.log(`[idea-engine] newsletter pitched: ${nlIdea.idea}`);
      }
    }
  } catch (err) {
    console.error('[idea-engine] newsletter failed:', err.message);
  }

  // Capture Wishlist — Reed/Maya request what Paul should film/photograph
  try {
    const captureInputs = gatherCaptureWishlistInputs();
    if (captureInputs.length > 0) {
      const captureSystem = `You are Maya, Social Director at Basic Reflex — a BOXING gym in Hong Kong. Coach Paul teaches boxing: punches, pads, bags, footwork, sparring. NOT weights, NOT CrossFit, NOT general fitness.

You're sending Paul a FILMING BRIEF — exactly what to capture on his phone today. Be specific, practical, and think viral.

VIRAL VIDEO RULES you must bake into every brief:
1. STORY — every video tells a "why" story, not a "what" tutorial
2. VERBAL HOOK — first 1-3 seconds must stop the scroll
3. VISUAL HOOK — describe the thumbnail freeze frame that pops on the grid
4. TRIAL REEL — growth content goes to non-followers first (flag yes/no)
5. EDITING — tell Paul what effects to add (slow-mo, zoom cuts, text overlays via CapCut/Reels editor)`;

      const capturePrompt = `Based on content gaps, send Paul ONE specific filming brief.

CONTEXT:
${captureInputs.map(i => `- ${i}`).join('\n')}

Respond in this exact format:
BRIEF: [exactly what to film — specific moment, angle, setup. 1-2 sentences max]
STORY_ANGLE: [the "why" behind this video — what lesson or principle drives it]
VERBAL_HOOK: [exact words for first 1-3 seconds — text overlay or spoken]
VISUAL_HOOK: [describe the thumbnail — what freeze frame stops the scroll]
FORMAT: [reel/story/carousel/photo]
DURATION: [how long — e.g. "15-30 seconds"]
TRIAL_REEL: [yes/no]
EDITING_NOTES: [specific CapCut/Reels editor suggestions]
EXAMPLE: [name a similar viral boxing/fitness video for reference if possible]`;

      const response = await callDeepSeek(captureSystem, capturePrompt, 400);
      const lines = response.split('\n').filter(l => l.trim());
      const getField = (prefix) => lines.find(l => l.startsWith(prefix))?.replace(prefix, '').trim() || '';

      const brief = {
        id: `capture-${Date.now()}`,
        request: getField('BRIEF:'),
        storyAngle: getField('STORY_ANGLE:'),
        verbalHook: getField('VERBAL_HOOK:'),
        visualHook: getField('VISUAL_HOOK:'),
        format: getField('FORMAT:'),
        duration: getField('DURATION:'),
        trialReel: getField('TRIAL_REEL:').toLowerCase().startsWith('yes'),
        editingNotes: getField('EDITING_NOTES:'),
        example: getField('EXAMPLE:'),
        usedFor: 'Instagram Reel',
        requestedBy: 'maya',
        timestamp: new Date().toISOString()
      };

      if (brief.request) {
        addCaptureRequest(brief);
        postToFeed('maya', `FILMING BRIEF: "${brief.request}" — Hook: "${brief.verbalHook}"`, ['capture-wish', 'filming-brief']);
        console.log(`[idea-engine] filming brief: ${brief.request}`);
      }
    }
  } catch (err) {
    console.error('[idea-engine] capture-wish failed:', err.message);
  }

  // Phase 3: Route to Cathedral agents for review
  console.log(`[idea-engine] Routing ${ideas.length} ideas to agents...`);
  for (const idea of ideas) {
    const targets = routeToAgents(idea);
    if (targets.length > 0) {
      postToFeed('compass', `ROUTED: ${idea.character}'s pitch → ${targets.join(', ')} for review`, ['routing']);
    }
  }

  // Phase 4: Collect any agent reviews from previous cycle
  for (const idea of ideas) {
    const reviews = collectAgentReviews(idea.id, idea.character);
    if (reviews.length > 0) {
      idea.agentReviews = reviews;
      const mem = getCharacterMemory(idea.character);
      mem.agentFeedback.push(...reviews.map(r => ({ ...r, ideaId: idea.id, date: new Date().toISOString() })));
      if (mem.agentFeedback.length > 30) mem.agentFeedback = mem.agentFeedback.slice(-30);
      saveCharacterMemory(idea.character, mem);
    }
  }

  // Phase 5: Cull reviews all pitches
  console.log('[idea-engine] Cull reviewing...');
  try {
    const verdicts = await cullReview(ideas);
    let approved = 0;
    for (const v of verdicts) {
      const idea = ideas[v.index];
      if (!idea) continue;

      idea.cullVerdict = v.verdict;
      idea.reason = v.reason;

      if (v.verdict === 'APPROVE') {
        const bt = bridgeTest(idea);
        if (bt.pass) {
          addToQueue(idea);
          approved++;
          postToFeed('cull', `APPROVED: ${idea.character}'s "${idea.idea}" — ${v.reason} (${bt.reason})`, ['approved']);
        } else {
          idea.cullVerdict = 'BRIDGE_FAIL';
          idea.reason = bt.reason;
          postToFeed('maya', `BRIDGE TEST blocked: ${idea.character}'s "${idea.idea}" — ${bt.reason}`, ['bridge-test', 'killed']);
        }
      } else {
        postToFeed('cull', `KILLED: ${idea.character}'s "${idea.idea}" — ${v.reason}`, ['killed']);
        // Update character memory with rejection
        const mem = getCharacterMemory(idea.character);
        const pitch = mem.pitches.find(p => p.id === idea.id);
        if (pitch) { pitch.status = 'culled'; pitch.reason = v.reason; }
        saveCharacterMemory(idea.character, mem);
      }
    }
    console.log(`[idea-engine] Cull: ${approved}/${ideas.length} approved`);
    postToFeed('compass', `CYCLE COMPLETE: ${ideas.length} pitched, ${approved} approved, ${ideas.length - approved} killed.`, ['cycle-complete']);
  } catch (err) {
    console.error('[idea-engine] Cull failed:', err.message);
    // If Cull fails, queue all ideas (fail-open)
    for (const idea of ideas) { addToQueue(idea); }
  }

  // Phase 6: Age out ignored queue items (>7 days without selection)
  const queue = loadJSON(QUEUE_PATH);
  if (queue?.items) {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const item of queue.items) {
      if (item.status === 'queued' && new Date(item.queuedAt).getTime() < weekAgo) {
        item.status = 'expired';
        // Count as ignored in character memory
        const mem = getCharacterMemory(item.character);
        mem.ignored++;
        const pitch = mem.pitches.find(p => p.id === item.id);
        if (pitch) pitch.status = 'ignored';
        updateSelectionRate(mem);
        saveCharacterMemory(item.character, mem);
      }
    }
    // Remove expired items older than 14 days
    const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    queue.items = queue.items.filter(i => i.status !== 'expired' || new Date(i.queuedAt).getTime() > twoWeeksAgo);
    saveJSON(QUEUE_PATH, queue);
  }

  // ── Telegram notification ───────────────────────────────────────────────────
  const approved = ideas.filter(i => i.cullVerdict === 'APPROVE');
  const wishlist = loadJSON(WISHLIST_PATH);
  const pendingCaptures = wishlist?.requests?.length || 0;

  let msg = `🎬 *Content Studio — Daily Cycle*\n`;
  msg += `${ideas.length} pitched → ${approved.length} approved → ${ideas.length - approved.length} killed\n\n`;

  if (approved.length > 0) {
    msg += `*Queued for you:*\n`;
    for (const a of approved) {
      msg += `• [${a.character}] ${a.idea.slice(0, 60)}\n`;
    }
    msg += `\n`;
  }

  if (pendingCaptures > 0) {
    const latest = wishlist.requests[0];
    msg += `*Maya's Filming Brief:*\n`;
    msg += `${latest.request}\n`;
    if (latest.verbalHook) msg += `Hook: "${latest.verbalHook}"\n`;
    if (latest.visualHook) msg += `Thumbnail: ${latest.visualHook}\n`;
    if (latest.trialReel) msg += `Trial Reel (non-followers first)\n`;
    if (latest.editingNotes) msg += `Edit: ${latest.editingNotes}\n`;
    if (latest.storyAngle) msg += `Story: ${latest.storyAngle}\n`;
    msg += `\n`;
  }

  await notify(msg, { markdown: true }).catch(() => {});

  return { ideas: ideas.length, queued: approved.length };
}

// ── Get Queue (for Paul / dashboard) ─────────────────────────────────────────

export function getQueue() {
  return loadJSON(QUEUE_PATH) || { items: [] };
}

export function getCharacterStats() {
  const stats = {};
  for (const charId of ['reed', 'maya', 'ling', 'echo']) {
    const mem = getCharacterMemory(charId);
    stats[charId] = {
      totalPitches: mem.pitches.length,
      selected: mem.selected,
      ignored: mem.ignored,
      rejected: mem.rejected,
      selectionRate: mem.selectionRate,
      lastPitch: mem.lastPitch
    };
  }
  return stats;
}

// ── CLI entry ────────────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].includes('idea-engine')) {
  const cmd = process.argv[2];
  if (cmd === 'run') {
    runIdeaEngine().then(r => {
      console.log(`[idea-engine] Done:`, r);
      process.exit(0);
    }).catch(err => {
      console.error('[idea-engine] Fatal:', err);
      process.exit(1);
    });
  } else if (cmd === 'queue') {
    console.log(JSON.stringify(getQueue(), null, 2));
  } else if (cmd === 'stats') {
    console.log(JSON.stringify(getCharacterStats(), null, 2));
  } else if (cmd === 'select') {
    const id = process.argv[3];
    if (!id) { console.error('Usage: idea-engine.js select <ideaId>'); process.exit(1); }
    const result = selectIdea(id);
    console.log(result ? 'Selected.' : 'Not found.');
  } else if (cmd === 'reject') {
    const id = process.argv[3];
    const reason = process.argv.slice(4).join(' ');
    if (!id) { console.error('Usage: idea-engine.js reject <ideaId> [reason]'); process.exit(1); }
    const result = rejectIdea(id, reason);
    console.log(result ? 'Rejected.' : 'Not found.');
  } else if (cmd === 'wishlist') {
    console.log(JSON.stringify(getCaptureWishlist(), null, 2));
  } else if (cmd === 'fulfill') {
    const id = process.argv[3];
    if (!id) { console.error('Usage: idea-engine.js fulfill <requestId>'); process.exit(1); }
    const result = fulfillCaptureRequest(id);
    console.log(result ? `Fulfilled: ${result.request}` : 'Not found.');
  } else {
    console.log('Usage: node idea-engine.js [run|queue|stats|select <id>|reject <id> <reason>|wishlist|fulfill <id>]');
  }
}

export default { runIdeaEngine, getQueue, getCharacterStats, selectIdea, rejectIdea, getCaptureWishlist, fulfillCaptureRequest };
