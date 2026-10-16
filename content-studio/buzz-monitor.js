// content-studio/buzz-monitor.js — Silence = death. Detect quiet departments. Kick them.
// Runs daily. Checks each department's last output. If silent > threshold: generate activity.
// ESM module

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { notify } from './notify.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME || '/Users/basicclaw777';

function loadJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; } }
function saveJSON(p, data) { fs.writeFileSync(p, JSON.stringify(data, null, 2)); }

const STATE_PATH = path.join(__dirname, 'buzz-state.json');

// DeepSeek
const DEEPSEEK_KEY = (() => {
  try { const env = fs.readFileSync(path.join(HOME, 'nanoclaw', '.env'), 'utf-8'); const m = env.match(/DEEPSEEK_API_KEY=(.+)/); return m ? m[1].trim() : ''; } catch { return ''; }
})();

async function callDeepSeek(system, prompt, maxTokens = 200) {
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

// ── Department Pulse Checks ──────────────────────────────────────────────────

const DEPARTMENTS = {
  reed_lab: {
    name: 'Reed Visual Lab',
    silenceThreshold: 48, // hours
    check() {
      const catalogue = loadJSON(path.join(HOME, 'nanoclaw', 'reed-lab', 'catalogue.json'));
      if (!catalogue?.entries?.length) return { lastActivity: null, detail: 'no catalogue' };
      const last = catalogue.entries[catalogue.entries.length - 1];
      return { lastActivity: last.date || last.timestamp, detail: `last: ${last.style || last.type}` };
    },
    async kick() {
      // Generate a new experiment idea for Reed
      const response = await callDeepSeek(
        `You are Reed, Visual Director. You experiment with AI image generation daily. You have: Higgsfield (Soul V2, Nano Banana, GPT Image 2, Seedance video), pro-photo pipeline, scene director. You serve a boxing gym.`,
        `You've been quiet. Generate ONE new visual experiment to try TODAY. Something you haven't done before. Be specific — model, technique, subject. One line.`,
        100
      );
      return `🎨 Reed Lab quiet ${this.silenceThreshold}h+\nExperiment idea: ${response.trim().split('\n')[0]}`;
    }
  },

  gym_eyes: {
    name: 'Gym Eyes',
    silenceThreshold: 72,
    check() {
      const sessionsDir = path.join(HOME, 'basic-reflex', 'gym-eyes', 'sessions');
      if (!fs.existsSync(sessionsDir)) return { lastActivity: null, detail: 'no sessions dir' };
      const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json')).sort();
      if (files.length === 0) return { lastActivity: null, detail: 'no sessions' };
      const last = files[files.length - 1];
      const stat = fs.statSync(path.join(sessionsDir, last));
      return { lastActivity: stat.mtime.toISOString(), detail: `last session: ${last}` };
    },
    async kick() {
      const response = await callDeepSeek(
        `You are Gym Eyes — AI punch & footwork tracking for Basic Reflex boxing gym. You use MediaPipe PoseLandmarker. You track students, assign drills, run challenges. You're always improving detection accuracy and adding features.`,
        `You've been quiet. What's ONE improvement or new capability you should research or prototype TODAY? Be specific — detection method, UI feature, student experience. One line.`,
        100
      );
      return `👁️ Gym Eyes quiet ${this.silenceThreshold}h+\nImprovement idea: ${response.trim().split('\n')[0]}`;
    }
  },

  content_studio: {
    name: 'Content Studio',
    silenceThreshold: 36,
    check() {
      const feed = loadJSON(path.join(__dirname, 'studio-feed.json'));
      if (!feed?.posts?.length) return { lastActivity: null, detail: 'no posts' };
      return { lastActivity: feed.posts[0].timestamp, detail: `last: ${feed.posts[0].content.slice(0, 40)}` };
    },
    async kick() {
      return `📝 Content Studio quiet ${this.silenceThreshold}h+ — idea engine may have failed. Check PM2.`;
    }
  },

  trading: {
    name: 'Trading Desk',
    silenceThreshold: 96, // 4 days (runs every 12h but only notifies on events)
    check() {
      const logFile = path.join(HOME, 'nanoclaw', 'trader', 'trading-log.json');
      const log = loadJSON(logFile);
      if (!log?.entries?.length) return { lastActivity: null, detail: 'no log' };
      const last = log.entries[log.entries.length - 1];
      return { lastActivity: last.timestamp || last.date, detail: `last: ${last.type || 'trade'}` };
    },
    async kick() {
      return `📊 Trading quiet ${this.silenceThreshold}h+ — check if cron is running.`;
    }
  },

  research: {
    name: 'Research (Muse + Cosmos)',
    silenceThreshold: 48,
    check() {
      const museDir = path.join(HOME, 'cathedral-vault', '00_Staging', 'muse-findings');
      if (!fs.existsSync(museDir)) return { lastActivity: null, detail: 'no muse dir' };
      const files = fs.readdirSync(museDir).sort();
      if (files.length === 0) return { lastActivity: null, detail: 'no findings' };
      const last = files[files.length - 1];
      const stat = fs.statSync(path.join(museDir, last));
      return { lastActivity: stat.mtime.toISOString(), detail: `last muse: ${last}` };
    },
    async kick() {
      const response = await callDeepSeek(
        `You are the Muse — you walk the vault at 3am finding cross-domain bridges and surprising connections between nuggets that nobody else noticed.`,
        `You've been quiet. What domain intersection in the vault should you explore next? Name TWO vault domains that might have an unnoticed connection. One line.`,
        80
      );
      return `🔮 Research quiet ${this.silenceThreshold}h+\nMuse suggestion: ${response.trim().split('\n')[0]}`;
    }
  },

  agents: {
    name: 'Agent Network',
    silenceThreshold: 48,
    check() {
      const callLog = path.join(HOME, 'Cathedral', 'agent-calls.jsonl');
      if (!fs.existsSync(callLog)) return { lastActivity: null, detail: 'no call log' };
      const stat = fs.statSync(callLog);
      return { lastActivity: stat.mtime.toISOString(), detail: 'last agent call' };
    },
    async kick() {
      return `🤖 Agent network quiet ${this.silenceThreshold}h+ — no calls logged. Are agents being used?`;
    }
  }
};

// ── Main Pulse Check ─────────────────────────────────────────────────────────

async function runBuzzMonitor() {
  const state = loadJSON(STATE_PATH) || { lastRun: null, kicks: [] };
  const now = Date.now();
  const results = [];
  const kicks = [];

  console.log('[buzz-monitor] Checking department pulses...');

  for (const [id, dept] of Object.entries(DEPARTMENTS)) {
    const { lastActivity, detail } = dept.check();

    let hoursAgo = null;
    if (lastActivity) {
      hoursAgo = Math.round((now - new Date(lastActivity).getTime()) / 3600000);
    }

    const silent = hoursAgo === null || hoursAgo > dept.silenceThreshold;
    const status = silent ? '🔴' : hoursAgo < dept.silenceThreshold / 2 ? '🟢' : '🟡';

    results.push({
      id, name: dept.name, status,
      hoursAgo: hoursAgo ?? '∞',
      threshold: dept.silenceThreshold,
      detail, silent
    });

    if (silent) {
      try {
        const kickMsg = await dept.kick();
        kicks.push(kickMsg);
        console.log(`[buzz-monitor] KICK: ${dept.name}`);
      } catch (err) {
        console.error(`[buzz-monitor] kick failed for ${id}:`, err.message);
      }
    } else {
      console.log(`[buzz-monitor] ${status} ${dept.name}: ${hoursAgo}h ago (threshold: ${dept.silenceThreshold}h)`);
    }
  }

  // ── Telegram Report ──────────────────────────────────────────────────────

  let msg = `⚡ *Cathedral Pulse Check*\n\n`;

  for (const r of results) {
    msg += `${r.status} *${r.name}* — ${r.hoursAgo}h ago\n`;
  }

  if (kicks.length > 0) {
    msg += `\n─── *SILENCE DETECTED* ───\n\n`;
    msg += kicks.join('\n\n');
  } else {
    msg += `\n✅ All departments active. System alive.`;
  }

  await notify(msg, { markdown: true });

  // Save state
  state.lastRun = new Date().toISOString();
  state.kicks.push(...kicks.map(k => ({ msg: k, date: new Date().toISOString() })));
  if (state.kicks.length > 50) state.kicks = state.kicks.slice(-50);
  saveJSON(STATE_PATH, state);

  return { departments: results.length, silent: kicks.length, alive: results.length - kicks.length };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].includes('buzz-monitor')) {
  runBuzzMonitor().then(r => {
    console.log(`[buzz-monitor] Done: ${r.alive}/${r.departments} alive, ${r.silent} silent`);
    process.exit(0);
  }).catch(err => {
    console.error('[buzz-monitor] Fatal:', err);
    process.exit(1);
  });
}

export default { runBuzzMonitor };
