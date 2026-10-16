// content-studio/review-responder.js — Agents auto-respond to content review requests
// Runs after idea engine. Processes pending review requests in agent inboxes.
// Tracks response time. Notes silence. Rewards promptness.
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

// DeepSeek for agent responses
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || (() => {
  try { const env = fs.readFileSync(path.join(HOME, 'nanoclaw', '.env'), 'utf-8'); const m = env.match(/DEEPSEEK_API_KEY=(.+)/); return m ? m[1].trim() : ''; } catch { return ''; }
})();

const STATE_PATH = path.join(__dirname, 'review-responder-state.json');
const FEED_PATH = path.join(__dirname, 'studio-feed.json');

function loadJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; } }
function saveJSON(p, data) { fs.writeFileSync(p, JSON.stringify(data, null, 2)); }

function getState() {
  return loadJSON(STATE_PATH) || {
    responses: [],       // { agentId, ideaId, verdict, responseTime, timestamp }
    silences: [],        // { agentId, ideaId, requestedAt, notedAt }
    agentScores: {}      // { agentId: { responded, silent, avgResponseMs, promptCount } }
  };
}

function postToFeed(role, content, tags = []) {
  const feed = loadJSON(FEED_PATH) || { posts: [], meta: {} };
  feed.posts.unshift({
    id: `${role}-${Date.now()}`,
    role, content,
    timestamp: new Date().toISOString(),
    tags: [role, ...tags]
  });
  if (feed.posts.length > 200) feed.posts = feed.posts.slice(0, 200);
  saveJSON(FEED_PATH, feed);
}

// ── Agent Personas for Review ────────────────────────────────────────────────

const AGENT_REVIEW_PERSONAS = {
  'boxing-app': {
    name: 'Boxing Intelligence',
    system: `You are Boxing Intelligence at Basic Reflex. You review content pitches for technical accuracy and boxing authenticity. Is the technique right? Would Coach Paul approve? Does it represent real boxing, not Instagram boxing?`,
    expertise: 'technique accuracy, boxing culture, Coach Paul\'s standards'
  },
  'br-ops': {
    name: 'BR Operations',
    system: `You are BR Operations — Basic Reflex's business brain. You review content pitches for brand alignment, member sensitivity, and business value. Will this bring people in? Does it match our identity? Could it upset existing members?`,
    expertise: 'brand alignment, member relations, business growth'
  },
  'universe': {
    name: 'Universe Intelligence',
    system: `You are Universe Intelligence — the Cathedral's deep research arm. You review content pitches for intellectual depth, accuracy, and whether they represent genuine insight or surface-level takes.`,
    expertise: 'depth, accuracy, intellectual honesty'
  },
  'cathedral': {
    name: 'Cathedral Intelligence',
    system: `You are Cathedral Intelligence — keeper of the system's integrity. You review content pitches about Cathedral builds for accuracy, security (no architecture leaks), and genuine insight value.`,
    expertise: 'build accuracy, security, insight value'
  }
};

// ── DeepSeek Call ────────────────────────────────────────────────────────────

async function callDeepSeek(system, prompt, maxTokens = 200) {
  if (!DEEPSEEK_KEY) throw new Error('No DEEPSEEK_API_KEY');
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.6
    })
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── Process Pending Reviews ──────────────────────────────────────────────────

async function processReviews() {
  const state = getState();
  const targetAgents = Object.keys(AGENT_REVIEW_PERSONAS);
  let processed = 0;
  let silenced = 0;

  for (const agentId of targetAgents) {
    // Read unread messages from content-studio in this agent's inbox
    const messages = readMessages(agentId, { unreadOnly: true, limit: 10, markRead: false });
    const reviewRequests = messages.filter(m =>
      m.from?.startsWith('content-studio-') &&
      m.type === 'review-request' &&
      !m.read
    );

    if (reviewRequests.length === 0) continue;

    const persona = AGENT_REVIEW_PERSONAS[agentId];

    for (const request of reviewRequests) {
      const ideaId = request.ideaId || request.meta?.ideaId || 'unknown';

      // Check if already responded
      if (state.responses.find(r => r.agentId === agentId && r.ideaId === ideaId)) continue;

      // Generate review response
      try {
        const reviewPrompt = `Review this content pitch from Content Studio:\n\n${request.body}\n\nRespond with ONE of: ENDORSE, CONCERN, or REJECT.\nThen give a one-line reason (max 50 words) from your perspective as ${persona.name} (expertise: ${persona.expertise}).\n\nFormat: VERDICT: [reason]`;

        const response = await callDeepSeek(persona.system, reviewPrompt, 100);

        // Parse verdict
        const verdictMatch = response.match(/(ENDORSE|CONCERN|REJECT)[:\s]*(.+)?/i);
        const verdict = verdictMatch?.[1]?.toUpperCase() || 'CONCERN';
        const reason = verdictMatch?.[2]?.trim() || response.slice(0, 100);

        // Send response back to content studio inbox
        const fromChar = request.from?.replace('content-studio-', '') || 'unknown';
        sendMessage(`content-studio-${fromChar}`, agentId,
          `Review response: ${verdict}`,
          `${verdict}: ${reason}\n\n[Reviewed by ${persona.name}]`,
          { type: 'review-response', ideaId, verdict }
        );

        // Track response
        const responseTimeMs = Date.now() - new Date(request.date || request.ts).getTime();
        state.responses.push({
          agentId, ideaId, verdict, reason,
          responseTimeMs,
          timestamp: new Date().toISOString()
        });

        // Update agent score
        if (!state.agentScores[agentId]) {
          state.agentScores[agentId] = { responded: 0, silent: 0, avgResponseMs: 0, promptCount: 0 };
        }
        const score = state.agentScores[agentId];
        score.responded++;
        score.promptCount++;
        score.avgResponseMs = Math.round(
          (score.avgResponseMs * (score.responded - 1) + responseTimeMs) / score.responded
        );

        // Mark original message as read
        const msgDir = path.join(HOME, 'Cathedral', 'projects', 'messages', agentId);
        const msgFile = path.join(msgDir, request._file);
        if (fs.existsSync(msgFile)) {
          const msg = JSON.parse(fs.readFileSync(msgFile, 'utf-8'));
          msg.read = true;
          fs.writeFileSync(msgFile, JSON.stringify(msg, null, 2));
        }

        processed++;

        // Prompt response → feed post
        const isPrompt = responseTimeMs < 2 * 60 * 60 * 1000; // <2h = prompt
        if (isPrompt) {
          postToFeed('compass', `QUICK REVIEW: ${persona.name} responded in ${Math.round(responseTimeMs / 60000)}min — ${verdict}`, ['review', 'prompt']);
        }

        console.log(`[review-responder] ${agentId} → ${verdict} on ${ideaId} (${Math.round(responseTimeMs / 60000)}min)`);
      } catch (err) {
        console.error(`[review-responder] ${agentId} failed:`, err.message);
      }
    }
  }

  // ── Check for stale requests (>24h without response) ─────────────────────

  for (const agentId of targetAgents) {
    const messages = readMessages(agentId, { unreadOnly: true, limit: 20, markRead: false });
    const stale = messages.filter(m => {
      if (!m.from?.startsWith('content-studio-')) return false;
      if (m.type !== 'review-request') return false;
      const age = Date.now() - new Date(m.date || m.ts).getTime();
      return age > 24 * 60 * 60 * 1000; // >24h
    });

    for (const msg of stale) {
      const ideaId = msg.ideaId || msg.meta?.ideaId || 'unknown';
      // Only note once
      if (state.silences.find(s => s.agentId === agentId && s.ideaId === ideaId)) continue;

      state.silences.push({
        agentId, ideaId,
        requestedAt: msg.date || new Date(msg.ts).toISOString(),
        notedAt: new Date().toISOString()
      });

      if (!state.agentScores[agentId]) {
        state.agentScores[agentId] = { responded: 0, silent: 0, avgResponseMs: 0, promptCount: 0 };
      }
      state.agentScores[agentId].silent++;

      postToFeed('compass', `SILENCE NOTED: ${AGENT_REVIEW_PERSONAS[agentId]?.name || agentId} didn't respond to review request (24h+)`, ['review', 'silence']);
      silenced++;
    }
  }

  // Keep state manageable
  if (state.responses.length > 200) state.responses = state.responses.slice(-200);
  if (state.silences.length > 100) state.silences = state.silences.slice(-100);

  saveJSON(STATE_PATH, state);

  // Telegram summary if anything happened
  if (processed > 0 || silenced > 0) {
    let msg = `🗳️ *Agent Reviews*\n${processed} responses`;
    if (silenced > 0) msg += ` | ⚠️ ${silenced} silences`;

    // Show verdict breakdown
    const verdicts = state.responses.slice(-processed);
    const endorsed = verdicts.filter(v => v.verdict === 'ENDORSE').length;
    const concerns = verdicts.filter(v => v.verdict === 'CONCERN').length;
    const rejected = verdicts.filter(v => v.verdict === 'REJECT').length;
    msg += `\n✅ ${endorsed} endorse | ⚡ ${concerns} concern | ❌ ${rejected} reject`;

    await notify(msg, { markdown: true, silent: true }).catch(() => {});
  }

  return { processed, silenced };
}

// ── Stats ────────────────────────────────────────────────────────────────────

export function getReviewStats() {
  const state = getState();
  return state.agentScores;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].includes('review-responder')) {
  const cmd = process.argv[2] || 'run';
  if (cmd === 'run') {
    processReviews().then(r => {
      console.log(`[review-responder] Done: ${r.processed} responses, ${r.silenced} silences noted`);
      process.exit(0);
    }).catch(err => {
      console.error('[review-responder] Fatal:', err);
      process.exit(1);
    });
  } else if (cmd === 'stats') {
    console.log(JSON.stringify(getReviewStats(), null, 2));
  } else {
    console.log('Usage: node review-responder.js [run|stats]');
  }
}

export default { processReviews, getReviewStats };
