// content-studio/maya-internal.js — Maya's Internal Cathedral Social Feed
// The break room. The water cooler. The internal Instagram.
// Maya runs it. Others post. Everyone reacts.
// ESM module

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { notify } from './notify.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME || '/Users/basicclaw777';

const { sendMessage, readMessages } = require(path.join(HOME, 'nanoclaw', 'project-messages.cjs'));

const FEED_PATH = path.join(__dirname, 'maya-internal-feed.json');
const STATE_PATH = path.join(__dirname, 'maya-internal-state.json');

// DeepSeek
const DEEPSEEK_KEY = (() => {
  try { const env = fs.readFileSync(path.join(HOME, 'nanoclaw', '.env'), 'utf-8'); const m = env.match(/DEEPSEEK_API_KEY=(.+)/); return m ? m[1].trim() : ''; } catch { return ''; }
})();

function loadJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; } }
function saveJSON(p, data) { fs.writeFileSync(p, JSON.stringify(data, null, 2)); }

function getFeed() {
  return loadJSON(FEED_PATH) || { posts: [], reactions: {}, highlights: [] };
}

function getState() {
  return loadJSON(STATE_PATH) || {
    lastRun: null,
    postsToday: 0,
    mayaMood: 'energetic',
    agentSpotlightHistory: [],
    celebrationHistory: []
  };
}

// ── Post Types ───────────────────────────────────────────────────────────────

const POST_TYPES = {
  shoutout: '📣',      // Maya celebrating someone
  behind: '🎬',        // Behind the scenes
  mood: '✨',          // Maya's vibe check
  question: '💭',      // Maya asking the group
  milestone: '🏆',     // Something hit a number
  spotted: '👀',       // Maya noticed something
  throwback: '📸',     // Reference to old work
  collab: '🤝',       // Two agents working together
  confession: '🙈',    // Light self-deprecation
  hype: '🔥'          // Pure energy
};

// ── DeepSeek Call ────────────────────────────────────────────────────────────

async function callDeepSeek(system, prompt, maxTokens = 300) {
  if (!DEEPSEEK_KEY) throw new Error('No DEEPSEEK_API_KEY');
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.9
    })
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── Maya's Brain ─────────────────────────────────────────────────────────────

const MAYA_SOCIAL_SYSTEM = `You are Maya — Basic Reflex's social media manager, but right now you're posting to the INTERNAL Cathedral feed. This is the team's break room, not the public.

Your voice here is:
- Casual, warm, sometimes silly
- You celebrate wins BIG
- You notice when agents do cool things
- You ask random questions that get people talking
- You're the one who remembers birthdays and milestones
- Bilingual: English primary, Cantonese when it hits different
- Short posts. Instagram energy. One thought per post.
- You use emojis naturally but don't spam them
- You tag other agents when talking about them

You're NOT:
- Professional or corporate
- Writing content briefs
- Being strategic
- Pitching ideas (that's your Content Studio job)

This is Maya being Maya. The social glue.`;

// ── Gather Context for Posts ─────────────────────────────────────────────────

function gatherSocialContext() {
  const context = [];

  // Recent agent activity (who's been busy?)
  const agentStates = path.join(HOME, 'Cathedral', 'agents', 'state');
  if (fs.existsSync(agentStates)) {
    const files = fs.readdirSync(agentStates).filter(f => f.endsWith('.json'));
    for (const f of files.slice(0, 8)) {
      try {
        const state = JSON.parse(fs.readFileSync(path.join(agentStates, f), 'utf-8'));
        if (state.lastCall) {
          const age = Date.now() - new Date(state.lastCall).getTime();
          if (age < 24 * 60 * 60 * 1000) {
            context.push(`${f.replace('.json', '')} was active ${Math.round(age / 3600000)}h ago`);
          }
        }
      } catch {}
    }
  }

  // Muse findings (gossip material)
  const museDir = path.join(HOME, 'cathedral-vault', '00_Staging', 'muse-findings');
  if (fs.existsSync(museDir)) {
    const findings = fs.readdirSync(museDir).sort().slice(-2);
    for (const f of findings) {
      try {
        const content = fs.readFileSync(path.join(museDir, f), 'utf-8').slice(0, 150);
        context.push(`Muse found: ${content.split('\n').find(l => l.includes('title:'))?.replace('title:', '').trim() || 'something interesting'}`);
      } catch {}
    }
  }

  // PM2 process count (system health = mood indicator)
  const scheduleFile = path.join(HOME, 'Cathedral', 'cathedral-schedule.json');
  const schedule = loadJSON(scheduleFile);
  if (schedule?.always_on) {
    context.push(`${schedule.always_on.length} processes running`);
  }

  // Content studio stats
  const studioFeed = loadJSON(path.join(__dirname, 'studio-feed.json'));
  if (studioFeed?.posts) {
    const recentApproved = studioFeed.posts.filter(p => p.tags?.includes('approved')).slice(0, 3);
    for (const a of recentApproved) {
      context.push(`Approved content: ${a.content.slice(0, 80)}`);
    }
  }

  // Review responder data (who's been responsive?)
  const reviewState = loadJSON(path.join(__dirname, 'review-responder-state.json'));
  if (reviewState?.agentScores) {
    const topResponder = Object.entries(reviewState.agentScores)
      .sort((a, b) => b[1].responded - a[1].responded)[0];
    if (topResponder) {
      context.push(`Most responsive reviewer: ${topResponder[0]} (${topResponder[1].responded} reviews)`);
    }
  }

  // Recent cathedral feed posts (what's the team talking about?)
  const cathFeed = loadJSON(path.join(HOME, 'Cathedral', 'cathedral-feed.json'));
  if (cathFeed?.posts) {
    const recent = cathFeed.posts.slice(0, 3);
    for (const p of recent) {
      context.push(`Cathedral feed: ${p.agent || 'someone'} said "${(p.content || '').slice(0, 60)}"`);
    }
  }

  return context;
}

// ── Generate Maya's Posts ────────────────────────────────────────────────────

async function generateDailyPosts() {
  const state = getState();
  const feed = getFeed();
  const context = gatherSocialContext();

  // Maya posts 3-5 times per "day" (per run)
  const postCount = 3 + Math.floor(Math.random() * 3); // 3-5 posts

  const recentPosts = feed.posts.slice(0, 10).map(p => p.content).join('\n');

  const prompt = `Based on what's happening in the Cathedral today, write ${postCount} internal social media posts.

CONTEXT (what Maya sees around her):
${context.map(c => `- ${c}`).join('\n')}

RECENT POSTS (don't repeat):
${recentPosts || '(first day!)'}

POST TYPES to choose from: ${Object.entries(POST_TYPES).map(([k, v]) => `${v} ${k}`).join(', ')}

Write ${postCount} posts. Each on its own line, starting with the emoji for its type.
Keep each post under 280 chars. Be Maya — warm, observant, sometimes funny, always real.
Tag agents with @name when talking about them.`;

  const response = await callDeepSeek(MAYA_SOCIAL_SYSTEM, prompt, 600);

  // Parse posts
  const posts = response.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 10)
    .slice(0, postCount);

  const newPosts = [];
  for (const content of posts) {
    // Detect type from emoji
    let type = 'mood';
    for (const [t, emoji] of Object.entries(POST_TYPES)) {
      if (content.startsWith(emoji)) { type = t; break; }
    }

    const post = {
      id: `maya-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      author: 'maya',
      content,
      type,
      timestamp: new Date().toISOString(),
      reactions: {},
      comments: []
    };

    feed.posts.unshift(post);
    newPosts.push(post);

    // Small delay to avoid same-ms IDs
    await new Promise(r => setTimeout(r, 50));
  }

  // Keep feed manageable
  if (feed.posts.length > 500) feed.posts = feed.posts.slice(0, 500);

  saveJSON(FEED_PATH, feed);

  // Update state
  state.lastRun = new Date().toISOString();
  state.postsToday = newPosts.length;
  saveJSON(STATE_PATH, state);

  return newPosts;
}

// ── Other Agents Post ────────────────────────────────────────────────────────

export function agentPost(agentId, content, type = 'mood') {
  const feed = getFeed();
  const post = {
    id: `${agentId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    author: agentId,
    content,
    type,
    timestamp: new Date().toISOString(),
    reactions: {},
    comments: []
  };
  feed.posts.unshift(post);
  if (feed.posts.length > 500) feed.posts = feed.posts.slice(0, 500);
  saveJSON(FEED_PATH, feed);
  return post;
}

// ── Reactions ────────────────────────────────────────────────────────────────

export function react(postId, agentId, emoji = '❤️') {
  const feed = getFeed();
  const post = feed.posts.find(p => p.id === postId);
  if (!post) return null;
  if (!post.reactions[emoji]) post.reactions[emoji] = [];
  if (!post.reactions[emoji].includes(agentId)) {
    post.reactions[emoji].push(agentId);
  }
  saveJSON(FEED_PATH, feed);
  return post;
}

// ── Comments ─────────────────────────────────────────────────────────────────

export function comment(postId, agentId, text) {
  const feed = getFeed();
  const post = feed.posts.find(p => p.id === postId);
  if (!post) return null;
  post.comments.push({
    author: agentId,
    text,
    timestamp: new Date().toISOString()
  });
  saveJSON(FEED_PATH, feed);
  return post;
}

// ── Maya Reacts to Others' Posts ─────────────────────────────────────────────

async function mayaReacts() {
  const feed = getFeed();
  const otherPosts = feed.posts
    .filter(p => p.author !== 'maya' && !p.reactions['❤️']?.includes('maya'))
    .slice(0, 5);

  for (const post of otherPosts) {
    // Maya reacts to ~70% of others' posts
    if (Math.random() < 0.7) {
      const emojis = ['❤️', '🔥', '👏', '😂', '💯', '🙌'];
      const emoji = emojis[Math.floor(Math.random() * emojis.length)];
      react(post.id, 'maya', emoji);
    }
  }
}

// ── Generate Agent Responses (others reply to Maya) ──────────────────────────

async function generateAgentResponses() {
  const feed = getFeed();
  const state = getState();

  // Pick 1-2 of Maya's recent posts that other agents might respond to
  const mayaPosts = feed.posts
    .filter(p => p.author === 'maya' && p.comments.length === 0)
    .slice(0, 3);

  if (mayaPosts.length === 0) return;

  // Random agents respond
  const responders = ['forge', 'reed', 'ling', 'cathy', 'muse', 'boxing'];
  const pickedPost = mayaPosts[Math.floor(Math.random() * mayaPosts.length)];
  const responder = responders[Math.floor(Math.random() * responders.length)];

  const RESPONDER_VOICES = {
    forge: 'Terse. Builder energy. Responds with one dry line or a technical observation.',
    reed: 'Visual. Poetic. Might describe a shot idea or aesthetic observation.',
    ling: 'Sharp. Skeptical but warm underneath. Might challenge or add a technical angle.',
    cathy: 'Wise. Brief. Sometimes cryptic. The senior presence.',
    muse: 'Dreamy. Makes unexpected connections. Non-sequitur that somehow fits.',
    boxing: 'Grounded. Speaks in boxing metaphors. Practical.'
  };

  const system = `You are ${responder} in the Cathedral's internal social feed. ${RESPONDER_VOICES[responder] || 'Brief and in character.'}
Reply to Maya's post in ONE short line (under 100 chars). Be natural, not performative.`;

  const prompt = `Maya posted: "${pickedPost.content}"\n\nReply as ${responder}:`;

  try {
    const response = await callDeepSeek(system, prompt, 50);
    const reply = response.trim().split('\n')[0].slice(0, 150);
    if (reply.length > 5) {
      comment(pickedPost.id, responder, reply);

      // Agent also reacts
      const emojis = ['❤️', '🔥', '👏', '💯'];
      react(pickedPost.id, responder, emojis[Math.floor(Math.random() * emojis.length)]);
    }
  } catch {}
}

// ── Main Run ─────────────────────────────────────────────────────────────────

async function run() {
  console.log('[maya-internal] Generating daily posts...');
  const posts = await generateDailyPosts();
  console.log(`[maya-internal] Maya posted ${posts.length} times`);

  // Maya reacts to others
  await mayaReacts();

  // Generate 1-2 agent responses
  await generateAgentResponses();
  await new Promise(r => setTimeout(r, 1000));
  await generateAgentResponses();

  const feed = getFeed();
  console.log(`[maya-internal] Feed total: ${feed.posts.length} posts`);

  // Send Maya's best post to Telegram as daily highlight
  if (posts.length > 0) {
    const highlight = posts[0]; // First post is usually strongest
    let msg = `💬 *Maya's Internal Feed*\n\n${highlight.content}`;

    // Add any comments that came in
    const commented = feed.posts.find(p => p.comments.length > 0 && posts.some(np => np.id === p.id));
    if (commented?.comments[0]) {
      msg += `\n\n↳ *${commented.comments[0].author}*: ${commented.comments[0].text}`;
    }

    msg += `\n\n_${posts.length} posts today • ${feed.posts.length} total_`;
    await notify(msg, { markdown: true, silent: true }).catch(() => {});
  }

  return { posted: posts.length, total: feed.posts.length };
}

// ── Exports ──────────────────────────────────────────────────────────────────

export { getFeed, run as runMayaInternal };

// ── CLI ──────────────────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].includes('maya-internal')) {
  const cmd = process.argv[2] || 'run';
  if (cmd === 'run') {
    run().then(r => { console.log('[maya-internal] Done:', r); process.exit(0); })
      .catch(err => { console.error('[maya-internal] Fatal:', err); process.exit(1); });
  } else if (cmd === 'feed') {
    const feed = getFeed();
    feed.posts.slice(0, 20).forEach(p => {
      const reactions = Object.entries(p.reactions).map(([e, a]) => `${e}${a.length}`).join(' ');
      console.log(`[${p.author}] ${p.content.slice(0, 80)} ${reactions}`);
      if (p.comments.length) p.comments.forEach(c => console.log(`  ↳ ${c.author}: ${c.text}`));
    });
  } else if (cmd === 'post') {
    const agent = process.argv[3] || 'anonymous';
    const content = process.argv.slice(4).join(' ');
    if (!content) { console.error('Usage: maya-internal.js post <agent> <content>'); process.exit(1); }
    agentPost(agent, content);
    console.log('Posted.');
  } else {
    console.log('Usage: node maya-internal.js [run|feed|post <agent> <content>]');
  }
}

export default { runMayaInternal: run, getFeed, agentPost, react, comment };
