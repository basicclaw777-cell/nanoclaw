#!/usr/bin/env node
'use strict';

/**
 * Maya's Sociability Workshop
 *
 * A structured series of runs that Maya facilitates to increase
 * cross-agent communication and break down siloed behavior.
 *
 * Architecture:
 *   - Uses existing dialogue.js directive system
 *   - Writes workshop messages to agent inboxes
 *   - Tracks responses and participation
 *   - Measures impact via neural-bus frequency data
 *   - Each run fires immediately, results tracked, next run unlocked
 *
 * Runs:
 *   0. Icebreaker — agents introduce themselves to someone they've never talked to
 *   1. Signal Mapping — each agent names 3 things they produce another room could use
 *   2. First Contact — each agent sends one real cross-room signal
 *   3. Response Drill — agents must respond to signals they receive
 *   4. Discovery — find one connection nobody mapped yet
 *   5. Retrospective — what changed, what to keep doing
 */

const fs = require('fs');
const path = require('path');

const HOME = process.env.HOME;
const CATHEDRAL = path.join(HOME, 'Cathedral');
const NANOCLAW = path.join(HOME, 'nanoclaw');
const MSG_DIR = path.join(CATHEDRAL, 'projects', 'messages');
const WORKSHOP_STATE = path.join(NANOCLAW, 'maya-workshop-state.json');
const DIALOGUE_STATE = path.join(CATHEDRAL, 'emergence', 'dialogue-state.json');

// Load .env for API keys
const envPath = path.join(NANOCLAW, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (!process.env[match[1].trim()]) process.env[match[1].trim()] = val;
    }
  }
}

// ── Agent clusters (who should talk to who they don't usually) ───────────────

const AGENT_CLUSTERS = {
  operations: ['orc', 'br', 'forge'],
  creative: ['reed', 'maya', 'muse'],
  intelligence: ['trading', 'universe', 'prospector', 'cartographer'],
  combat: ['boxing', 'ling'],
  wisdom: ['yoda', 'miyagi', 'tao', 'marcus', 'sun-tzu', 'leonardo'],
  infrastructure: ['archivist', 'whisperer', 'cathy'],
};

// Build cross-cluster pairs — agents who DON'T normally talk
function getCrossClusterPairs() {
  const clusters = Object.values(AGENT_CLUSTERS);
  const pairs = [];
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      for (const a of clusters[i]) {
        for (const b of clusters[j]) {
          pairs.push([a, b]);
        }
      }
    }
  }
  // Shuffle
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  return pairs;
}

// ── Workshop state ───────────────────────────────────────────────────────────

function loadState() {
  try { return JSON.parse(fs.readFileSync(WORKSHOP_STATE, 'utf8')); }
  catch { return { currentRun: -1, runs: [], baseline: null, started: null }; }
}

function saveState(state) {
  fs.writeFileSync(WORKSHOP_STATE, JSON.stringify(state, null, 2));
}

// ── Message delivery ─────────────────────────────────────────────────────────

function sendWorkshopMessage(fromAgent, toAgent, type, body, threadId) {
  const ts = Date.now();
  const msg = {
    id: `ws-${ts}-${Math.random().toString(36).slice(2, 6)}`,
    from: fromAgent,
    to: toAgent,
    type: type,
    body: body,
    threadId: threadId || `workshop-${ts}`,
    timestamp: new Date().toISOString(),
    workshop: true,
  };

  // Write to target's inbox
  const inboxDir = path.join(MSG_DIR, toAgent);
  if (!fs.existsSync(inboxDir)) fs.mkdirSync(inboxDir, { recursive: true });
  fs.writeFileSync(path.join(inboxDir, `${msg.id}.json`), JSON.stringify(msg, null, 2));

  // Also update dialogue state
  try {
    const dialogueState = JSON.parse(fs.readFileSync(DIALOGUE_STATE, 'utf8'));
    const thread = dialogueState.threads.find(t => t.threadId === msg.threadId);
    if (thread) {
      thread.messageCount++;
      thread.lastActivity = msg.timestamp;
      if (!thread.participants.includes(toAgent)) thread.participants.push(toAgent);
    } else {
      dialogueState.threads.push({
        threadId: msg.threadId,
        startedBy: fromAgent,
        startedAt: msg.timestamp,
        lastActivity: msg.timestamp,
        participants: [fromAgent, toAgent],
        type: type,
        messageCount: 1,
        resolved: false,
        workshop: true,
      });
    }
    fs.writeFileSync(DIALOGUE_STATE, JSON.stringify(dialogueState, null, 2));
  } catch (e) { /* dialogue state might not exist */ }

  // Emit to neural bus
  try {
    const payload = JSON.stringify({
      source: 'workshop',
      action: 'message',
      path: [fromAgent, toAgent].map(a => agentToNode(a)).filter(Boolean),
      label: `Workshop: ${fromAgent} > ${toAgent} (${type})`,
    });
    const http = require('http');
    const req = http.request('http://127.0.0.1:8078/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 500,
    });
    req.on('error', () => {});
    req.end(payload);
  } catch (e) { /* bus might be down */ }

  return msg;
}

// Map agent IDs to neural map node IDs
function agentToNode(agentId) {
  const map = {
    orc: 'orchestrator', boxing: 'boxing', br: 'reed', trading: 'trading',
    universe: 'cosmology', ling: 'techniques', maya: 'maya', reed: 'reed',
    cartographer: 'cartographer', archivist: 'archivist', muse: 'monitor',
    whisperer: 'scanner', prospector: 'prospector', forge: 'engineering',
    cathy: 'bridge', yoda: 'city', miyagi: 'city', tao: 'city',
    marcus: 'pulse', 'sun-tzu': 'city', leonardo: 'city',
  };
  return map[agentId] || null;
}

// ── Get baseline frequencies from neural bus ─────────────────────────────────

async function getBaseline() {
  try {
    const http = require('http');
    return new Promise((resolve) => {
      http.get('http://127.0.0.1:8078/frequencies', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve({}); }
        });
      }).on('error', () => resolve({}));
    });
  } catch { return {}; }
}

// ── Run definitions ──────────────────────────────────────────────────────────

const RUNS = [
  // Run 0: Icebreaker
  {
    name: 'Icebreaker',
    description: 'Agents introduce themselves to someone from a different cluster they have never talked to.',
    execute: async (state) => {
      const pairs = getCrossClusterPairs().slice(0, 8); // 8 pairs
      const threadId = `workshop-icebreaker-${Date.now()}`;

      const icebreakers = [
        "What's one thing you do that nobody else in the Cathedral knows about?",
        "What's the most surprising thing you've learned from your domain?",
        "If you could borrow one capability from any other agent, what would it be?",
        "What's the hardest problem you're working on right now?",
        "What would break if you disappeared for a week?",
        "What's one thing you wish another agent would send you?",
        "What's the most interesting signal you've seen this week?",
        "If you had to explain your job to a new agent in one sentence, what would you say?",
      ];

      const results = [];
      pairs.forEach(([a, b], i) => {
        const question = icebreakers[i % icebreakers.length];

        // Maya introduces them
        sendWorkshopMessage('maya', a, 'signal',
          `Hey ${a}, welcome to the Sociability Workshop! I'm pairing you with ${b} — you two haven't really talked before. Here's your icebreaker question: "${question}" Share your answer with ${b}, then ask them something you're genuinely curious about.`,
          threadId
        );
        sendWorkshopMessage('maya', b, 'signal',
          `Hey ${b}, welcome to the Sociability Workshop! I'm pairing you with ${a} — you two haven't really talked before. Here's your icebreaker question: "${question}" Share your answer with ${a}, then ask them something you're genuinely curious about.`,
          threadId
        );

        results.push({ pair: [a, b], question, threadId });
      });

      return {
        name: 'Icebreaker',
        pairs: results,
        threadId,
        messagesSent: pairs.length * 2,
        timestamp: new Date().toISOString(),
      };
    },
  },

  // Run 1: Signal Mapping
  {
    name: 'Signal Mapping',
    description: 'Each agent identifies 3 outputs that another room could use.',
    execute: async (state) => {
      const agents = ['orc', 'boxing', 'br', 'trading', 'universe', 'maya', 'reed', 'forge', 'prospector', 'muse', 'archivist'];
      const threadId = `workshop-signals-${Date.now()}`;

      agents.forEach(agent => {
        sendWorkshopMessage('maya', agent, 'ask',
          `Signal Mapping exercise: Name 3 things you produce or discover in your work that another agent could use. Be specific — not "insights" but "when I find a contradiction between two vault entries, that's useful for [who]?" Format: [SIGNAL_MAP] 1. [output] → useful for [agent] because [why] 2. ... 3. ...`,
          threadId
        );
      });

      return {
        name: 'Signal Mapping',
        agents,
        threadId,
        messagesSent: agents.length,
        timestamp: new Date().toISOString(),
      };
    },
  },

  // Run 2: First Contact
  {
    name: 'First Contact',
    description: 'Each agent sends one real cross-room signal based on their signal map.',
    execute: async (state) => {
      const agents = ['orc', 'boxing', 'br', 'trading', 'universe', 'maya', 'reed', 'forge', 'prospector', 'muse', 'archivist'];
      const threadId = `workshop-contact-${Date.now()}`;

      agents.forEach(agent => {
        sendWorkshopMessage('maya', agent, 'ask',
          `First Contact exercise: Based on your signal map, send ONE real signal right now to an agent you identified. Use [SIGNAL:agentId] with actual content from your recent work. Not hypothetical — real data, real observation, real output. I'll track who responds. Go.`,
          threadId
        );
      });

      return {
        name: 'First Contact',
        agents,
        threadId,
        messagesSent: agents.length,
        timestamp: new Date().toISOString(),
      };
    },
  },

  // Run 3: Response Drill
  {
    name: 'Response Drill',
    description: 'Agents must respond to signals they received. Close the loop.',
    execute: async (state) => {
      // Check who has unread workshop messages
      const agents = ['orc', 'boxing', 'br', 'trading', 'universe', 'maya', 'reed', 'forge', 'prospector', 'muse', 'archivist'];
      const threadId = `workshop-response-${Date.now()}`;

      agents.forEach(agent => {
        sendWorkshopMessage('maya', agent, 'ask',
          `Response Drill: Check your inbox. If another agent sent you a signal, you MUST respond. Use [REPLY:agentId] and tell them: 1) What you understood 2) How you'd use it 3) One question back. If nobody signaled you — that's data too. Tell me who you think SHOULD be sending you signals and why.`,
          threadId
        );
      });

      return {
        name: 'Response Drill',
        agents,
        threadId,
        messagesSent: agents.length,
        timestamp: new Date().toISOString(),
      };
    },
  },

  // Run 4: Discovery
  {
    name: 'Discovery',
    description: 'Find one connection nobody mapped yet.',
    execute: async (state) => {
      const agents = ['orc', 'boxing', 'br', 'trading', 'universe', 'maya', 'reed', 'forge', 'prospector', 'muse', 'archivist'];
      const threadId = `workshop-discovery-${Date.now()}`;

      agents.forEach(agent => {
        sendWorkshopMessage('maya', agent, 'ask',
          `Discovery exercise: Look at what other agents do. Find ONE connection that doesn't exist yet but should. Format: [PROPOSE:targetAgent] "I think [my domain] connects to [your domain] because [specific reason]. Here's proof: [evidence from recent work]." Be bold. The best connections are the ones nobody expected.`,
          threadId
        );
      });

      return {
        name: 'Discovery',
        agents,
        threadId,
        messagesSent: agents.length,
        timestamp: new Date().toISOString(),
      };
    },
  },

  // Run 5: Retrospective
  {
    name: 'Retrospective',
    description: 'What changed, what to keep doing, what new connections to formalize.',
    execute: async (state) => {
      const agents = ['orc', 'boxing', 'br', 'trading', 'universe', 'maya', 'reed', 'forge', 'prospector', 'muse', 'archivist'];
      const threadId = `workshop-retro-${Date.now()}`;

      const baseline = state.baseline || {};
      const currentFreqs = await getBaseline();

      // Calculate deltas
      const deltas = {};
      for (const [node, freq] of Object.entries(currentFreqs)) {
        const base = baseline[node] || 0;
        if (freq > base) deltas[node] = { before: base, after: freq, delta: freq - base };
      }

      const deltaReport = Object.entries(deltas)
        .sort((a, b) => b[1].delta - a[1].delta)
        .slice(0, 10)
        .map(([node, d]) => `${node}: ${d.before} → ${d.after} (+${d.delta})`)
        .join('\n');

      agents.forEach(agent => {
        sendWorkshopMessage('maya', agent, 'ask',
          `Workshop Retrospective. Here's what the neural map shows since we started:\n\n${deltaReport || 'No frequency changes yet.'}\n\nAnswer: 1) What new connection was most valuable? 2) What signal should become permanent (always emit)? 3) What surprised you about another agent's work? Use [SIGNAL:all] for your answers so everyone learns.`,
          threadId
        );
      });

      return {
        name: 'Retrospective',
        agents,
        threadId,
        messagesSent: agents.length,
        deltas,
        timestamp: new Date().toISOString(),
      };
    },
  },
];

// ── CLI ──────────────────────────────────────────────────────────────────────

async function main() {
  const command = process.argv[2] || 'status';
  const state = loadState();

  switch (command) {
    case 'run': {
      const runIndex = process.argv[3] !== undefined ? parseInt(process.argv[3]) : state.currentRun + 1;
      if (runIndex >= RUNS.length) {
        console.log('All runs complete!');
        return;
      }

      const run = RUNS[runIndex];
      console.log(`\n[Workshop] Running: ${run.name}`);
      console.log(`  ${run.description}\n`);

      // Capture baseline on first run
      if (state.currentRun === -1) {
        state.baseline = await getBaseline();
        state.started = new Date().toISOString();
        console.log('  Baseline captured:', Object.keys(state.baseline).length, 'nodes');
      }

      const result = await run.execute(state);
      state.currentRun = runIndex;
      if (!state.runs) state.runs = [];
      state.runs.push(result);
      saveState(state);

      console.log(`  Messages sent: ${result.messagesSent}`);
      if (result.pairs) {
        console.log('  Pairs:');
        result.pairs.forEach(p => console.log(`    ${p.pair[0]} <> ${p.pair[1]}: "${p.question}"`));
      }
      console.log(`\n  Run complete. Use 'node maya-workshop.cjs status' to check progress.`);
      console.log(`  Ready to fire next run: 'node maya-workshop.cjs run'`);
      break;
    }

    case 'status': {
      console.log('\n[Maya\'s Sociability Workshop]');
      console.log(`  Started: ${state.started || 'not yet'}`);
      console.log(`  Current run: ${state.currentRun + 1}/${RUNS.length}`);
      console.log(`  Runs completed:`);
      (state.runs || []).forEach((r, i) => {
        console.log(`    ${i}. ${r.name} — ${r.messagesSent} messages (${r.timestamp})`);
      });

      if (state.currentRun + 1 < RUNS.length) {
        console.log(`\n  Next: ${RUNS[state.currentRun + 1].name}`);
        console.log(`    ${RUNS[state.currentRun + 1].description}`);
      }

      // Show current vs baseline
      if (state.baseline) {
        const current = await getBaseline();
        const changes = [];
        for (const [node, freq] of Object.entries(current)) {
          const base = state.baseline[node] || 0;
          if (freq > base) changes.push({ node, delta: freq - base, now: freq });
        }
        if (changes.length > 0) {
          changes.sort((a, b) => b.delta - a.delta);
          console.log('\n  Frequency changes since baseline:');
          changes.slice(0, 8).forEach(c => console.log(`    ${c.node}: +${c.delta} (now ${c.now})`));
        }
      }
      break;
    }

    case 'impact': {
      if (!state.baseline) {
        console.log('No baseline yet. Run the first workshop run first.');
        return;
      }
      const current = await getBaseline();
      console.log('\n[Workshop Impact Report]');
      console.log(`  Baseline captured: ${state.started}`);
      console.log(`  Runs completed: ${state.runs?.length || 0}\n`);

      const nodes = new Set([...Object.keys(state.baseline), ...Object.keys(current)]);
      const report = [];
      for (const node of nodes) {
        const before = state.baseline[node] || 0;
        const after = current[node] || 0;
        report.push({ node, before, after, delta: after - before });
      }
      report.sort((a, b) => b.delta - a.delta);
      console.log('  Node          Before  After   Delta');
      console.log('  ' + '-'.repeat(45));
      report.forEach(r => {
        const arrow = r.delta > 0 ? '+' : r.delta < 0 ? '' : ' ';
        console.log(`  ${r.node.padEnd(14)} ${String(r.before).padStart(6)}  ${String(r.after).padStart(5)}   ${arrow}${r.delta}`);
      });
      break;
    }

    case 'reset': {
      saveState({ currentRun: -1, runs: [], baseline: null, started: null });
      console.log('Workshop state reset.');
      break;
    }

    default:
      console.log('Usage: node maya-workshop.cjs [run|status|impact|reset]');
  }
}

main().catch(err => {
  console.error('Workshop error:', err);
  process.exit(1);
});
