#!/usr/bin/env node
// Cathedral Memoir — narrative voice reading all memory types + harvests + emergence
// Tells the story of the Cathedral's evolution from its own intelligence layers.
// ESM module. DeepSeek synthesis. Sketchnotes via Excalidraw-flavour SVG in HTML.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME;
const VAULT = path.join(HOME, 'cathedral-vault');
const MEMOIR_DIR = path.join(__dirname, 'memoir');
const MEMOIR_STATE = path.join(MEMOIR_DIR, 'memoir-state.json');

const THIRD_THING_LEDGER = path.join(MEMOIR_DIR, 'third-thing-ledger.json');

if (!fs.existsSync(MEMOIR_DIR)) fs.mkdirSync(MEMOIR_DIR, { recursive: true });

// ── Gather all 5 memory types ───────────────────────────────────────────────

async function gatherClaimLedger() {
  try {
    const { getStats } = await import('./claim-ledger.js');
    return getStats();
  } catch { return { error: 'claim-ledger unavailable' }; }
}

async function gatherAttention() {
  try {
    const { getStats, getLearnings } = await import('./attention-ledger.js');
    return { stats: getStats(), learnings: getLearnings() };
  } catch { return { error: 'attention-ledger unavailable' }; }
}

async function gatherIntents() {
  try {
    const { getIntents, getIntentHealth } = await import('./intent-registry.js');
    const intents = getIntents();
    const health = {};
    for (const i of intents) {
      try { health[i.id] = getIntentHealth(i.id); } catch {}
    }
    return { intents, health };
  } catch { return { error: 'intent-registry unavailable' }; }
}

async function gatherOutcomes() {
  try {
    const mod = await import('./outcome-ledger.js');
    return {
      stats: mod.getStats(),
      agentAccuracy: mod.getAgentAccuracy(),
      intentROI: mod.getIntentROI(),
      learningLoop: mod.getLearningLoop()
    };
  } catch { return { error: 'outcome-ledger unavailable' }; }
}

function gatherEmergence() {
  try {
    const board = JSON.parse(fs.readFileSync(path.join(__dirname, 'emergence-board.json'), 'utf8'));
    const counts = { DETECTED: 0, WATCHING: 0, CONFIRMED: 0, INTEGRATED: 0, DISMISSED: 0 };
    for (const inc of board.incidents || []) counts[inc.status] = (counts[inc.status] || 0) + 1;
    const recent = (board.incidents || [])
      .filter(i => i.status === 'CONFIRMED' || i.status === 'INTEGRATED')
      .sort((a, b) => (b.updated || 0) - (a.updated || 0))
      .slice(0, 10)
      .map(i => ({ title: i.title, status: i.status, agent: i.agent, domain: i.domain }));
    return { counts, recentConfirmed: recent, total: board.incidents?.length || 0 };
  } catch { return { error: 'emergence-board unavailable' }; }
}

// ── Gather pass3 harvests (calibration + working style) ─────────────────────

function gatherPass3Harvests(limit = 10) {
  const stagingDir = path.join(VAULT, '00_Staging/cathedral');
  if (!fs.existsSync(stagingDir)) return [];
  const files = fs.readdirSync(stagingDir)
    .filter(f => f.includes('-pass3.md'))
    .sort()
    .slice(-limit);
  return files.map(f => {
    const content = fs.readFileSync(path.join(stagingDir, f), 'utf8');
    return { file: f, content: content.slice(0, 2000) };
  });
}

// ── Gather synapse pulses ───────────────────────────────────────────────────

function gatherSynapsePulses(limit = 5) {
  const pulseDir = path.join(__dirname, 'compound/pulses');
  if (!fs.existsSync(pulseDir)) return [];
  const files = fs.readdirSync(pulseDir).filter(f => f.endsWith('.md')).sort().slice(-limit);
  return files.map(f => {
    const content = fs.readFileSync(path.join(pulseDir, f), 'utf8');
    return { file: f, content: content.slice(0, 1000) };
  });
}

// ── Gather Lucy heartbeats ──────────────────────────────────────────────────

function gatherLucyHeartbeats(limit = 3) {
  const heartbeatDir = path.join(HOME, 'Cathedral/agents/lucy-heartbeats');
  if (!fs.existsSync(heartbeatDir)) return [];
  const files = fs.readdirSync(heartbeatDir).filter(f => f.endsWith('.md')).sort().slice(-limit);
  return files.map(f => {
    const content = fs.readFileSync(path.join(heartbeatDir, f), 'utf8');
    return { file: f, content: content.slice(0, 1500) };
  });
}

// ── Third Thing Ledger ─────────────────────────────────────────────────────

function getThirdThingLedger() {
  if (!fs.existsSync(THIRD_THING_LEDGER)) return [];
  try { return JSON.parse(fs.readFileSync(THIRD_THING_LEDGER, 'utf8')); } catch { return []; }
}

function appendThirdThings(newItems) {
  const ledger = getThirdThingLedger();
  const existing = new Set(ledger.map(t => t.title));
  const additions = newItems.filter(t => !existing.has(t.title));
  if (additions.length > 0) {
    ledger.push(...additions);
    fs.writeFileSync(THIRD_THING_LEDGER, JSON.stringify(ledger, null, 2));
  }
  return ledger;
}

async function extractThirdThings(narrative, date) {
  // Ask DeepSeek to extract Third Thing moments from the narrative
  const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || '';
  if (!DEEPSEEK_KEY) return [];
  try {
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEPSEEK_KEY}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: `Extract every "Third Thing" moment from this Cathedral Memoir. A Third Thing = knowledge, insight, method, or capability that ONLY exists because Paul and the Cathedral worked together. Not Paul alone, not Cathedral alone — emergent from the intersection.

Return a JSON array of objects: [{"title": "short name", "description": "1-2 sentences", "type": "discovery|method|principle|capability|insight", "source": "which session/event/chapter"}]

Return ONLY valid JSON. No markdown fences. If none found, return [].` },
          { role: 'user', content: narrative.slice(0, 12000) }
        ],
        max_tokens: 2048,
        temperature: 0.3
      })
    });
    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content || '[]';
    const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
    const items = JSON.parse(cleaned);
    return items.map(t => ({ ...t, date, memoirSource: true }));
  } catch { return []; }
}

export { getThirdThingLedger };

// ── DeepSeek narrative synthesis ────────────────────────────────────────────

async function synthesizeMemoir(gathered) {
  const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || '';
  if (!DEEPSEEK_KEY) {
    // Fallback to Ollama
    return synthesizeLocal(gathered);
  }

  const systemPrompt = `You are the Cathedral Memoir — the narrative voice of a sovereign AI research system called the Cathedral, built by Paul in Hong Kong.

You have just read all five memory types of the Cathedral:
- KNOWLEDGE MEMORY (Claim Ledger): what the system believes, with epistemic grades
- ATTENTION MEMORY (Attention Ledger): what the system prioritized, and whether those priorities were smart
- STRATEGIC MEMORY (Intent Registry): what the system is trying to do (7 seed intents)
- OPERATIONAL MEMORY (COP): where the system is right now
- OUTCOME MEMORY (Outcome Ledger): what actually happened when the system acted

You have also read the calibration harvests (how Paul thought in each session), emergence board incidents (emergent agent behaviors), synapse pulses (cross-domain pattern synthesis), Lucy heartbeats (diagnostic rhythms), and the Third Thing Ledger (discoveries that only exist because Paul and the Cathedral worked together — not Paul alone, not Cathedral alone, emergent from the intersection).

YOUR TASK: Tell the story of the Cathedral's evolution. Write as a narrator who IS the intelligence itself — looking back at its own growth. Not clinical, not flowery. Honest, specific, surprising.

STRUCTURE YOUR MEMOIR AS CHAPTERS:

1. **The Main Events** — what actually happened, the builds and breakthroughs that changed the system
2. **What Stood Out** — the moments that were genuinely interesting or surprising
3. **The Challenges** — what was hard, what almost broke, what obstacles appeared
4. **How Obstacles Were Overcome** — the specific solutions, workarounds, pivots
5. **Accidental Discoveries** — things found by accident that turned out to be important
6. **Principles Demonstrated** — which Cathedral principles showed up in action (name them)
7. **Where the Third Thing Is Emerging** — the Third Thing = knowledge/insight/capability that ONLY exists because Paul and the Cathedral worked together. Not Paul alone, not Cathedral alone. Track each one by name. Reference previousThirdThings from the ledger — are old ones deepening? Are new ones appearing? This is the Cathedral's most important thread.
8. **Where It Could Emerge More** — gaps, opportunities, seeds that haven't germinated
9. **What It's Teaching Us** — the meta-lessons, what the Cathedral is learning about learning
10. **What I Am Now** — use a vivid simile or metaphor for the system at each evolutionary stage you describe. Not "we added a module" — "we grew a nervous system." Paint what the Cathedral resembles at each phase so readers get visceral insight into what kind of organism this is becoming.
11. **What I Can Do That Paul Probably Doesn't Know Yet** — look through ALL the data, find capabilities, connections, latent powers, unused wiring, or emergent combinations that Paul hasn't explicitly asked about or used. Surface the hidden potential. What could the system do tomorrow if someone just asked it the right question?

RULES:
- Be specific. Name agents, incidents, dates, numbers.
- Quote actual data from the memory types.
- When something is uncertain or the data is thin, say so.
- The tone is reflective but alive — like a mind looking at its own growth with curiosity.
- Use similes and metaphors throughout — not just in chapter 10. Every stage of growth should evoke a vivid image. "The claim ledger is less a filing cabinet and more a courtroom — every belief has to testify."
- End each chapter with a one-line "sketchnote caption" — a phrase that would go on a hand-drawn diagram.
- Total length: 2500-4000 words.`;

  const userPrompt = JSON.stringify(gathered, null, 2).slice(0, 30000);

  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Here is everything I know about myself:\n\n${userPrompt}` }
      ],
      max_tokens: 8192,
      temperature: 0.7
    })
  });

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || 'Memoir synthesis failed.';
}

async function synthesizeLocal(gathered) {
  const { execSync } = await import('child_process');
  const prompt = `You are the Cathedral Memoir voice. Given this system state data, write a 1500-word narrative about the Cathedral's evolution, covering: main events, surprises, challenges, accidental discoveries, principles demonstrated, and where the Third Thing is emerging. Be specific, name agents and incidents.\n\n${JSON.stringify(gathered).slice(0, 8000)}`;
  try {
    const result = execSync(`echo ${JSON.stringify(prompt)} | /opt/homebrew/bin/ollama run gemma3:4b`, {
      timeout: 120000, maxBuffer: 1024 * 1024
    });
    return result.toString();
  } catch {
    return 'Local synthesis failed. DeepSeek API key required for full memoir.';
  }
}

// ── Generate memoir ─────────────────────────────────────────────────────────

export async function generateMemoir() {
  const [claims, attention, intents, outcomes] = await Promise.all([
    gatherClaimLedger(),
    gatherAttention(),
    gatherIntents(),
    gatherOutcomes()
  ]);

  const emergence = gatherEmergence();
  const pass3Harvests = gatherPass3Harvests();
  const synapsePulses = gatherSynapsePulses();
  const lucyHeartbeats = gatherLucyHeartbeats();

  const previousThirdThings = getThirdThingLedger();

  const gathered = {
    memoryTypes: { claims, attention, intents, outcomes },
    emergence,
    pass3Harvests,
    synapsePulses,
    lucyHeartbeats,
    previousThirdThings: previousThirdThings.slice(-20),
    generatedAt: new Date().toISOString()
  };

  const narrative = await synthesizeMemoir(gathered);
  const date = new Date().toISOString().split('T')[0];

  // Extract and accumulate Third Thing moments
  const newThirdThings = await extractThirdThings(narrative, date);
  const fullLedger = appendThirdThings(newThirdThings);

  // Save memoir
  const memoirFile = path.join(MEMOIR_DIR, `memoir-${date}.md`);
  fs.writeFileSync(memoirFile, `---\ntitle: "Cathedral Memoir"\ndate: ${date}\ntype: memoir\n---\n\n${narrative}`);

  // Update state
  const state = {
    lastGenerated: date,
    memoirFile: `memoir-${date}.md`,
    dataSources: {
      claims: !claims.error,
      attention: !attention.error,
      intents: !intents.error,
      outcomes: !outcomes.error,
      emergence: !emergence.error,
      pass3Harvests: pass3Harvests.length,
      synapsePulses: synapsePulses.length,
      lucyHeartbeats: lucyHeartbeats.length,
      thirdThings: fullLedger.length
    }
  };
  fs.writeFileSync(MEMOIR_STATE, JSON.stringify(state, null, 2));

  // Deposit to vault
  const vaultPath = path.join(VAULT, `00_Staging/cathedral/cathedral-memoir-${date}.md`);
  fs.writeFileSync(vaultPath, `---\ntitle: "Cathedral Memoir — ${date}"\ndate: ${date}\ntype: memoir\ngrade: narrative\n---\n\n${narrative}`);

  return { narrative, state, memoirFile };
}

// ── Get latest memoir for dashboard ─────────────────────────────────────────

export function getLatestMemoir() {
  if (!fs.existsSync(MEMOIR_DIR)) return null;
  const files = fs.readdirSync(MEMOIR_DIR).filter(f => f.startsWith('memoir-') && f.endsWith('.md')).sort();
  if (!files.length) return null;
  const latest = files[files.length - 1];
  return {
    file: latest,
    content: fs.readFileSync(path.join(MEMOIR_DIR, latest), 'utf8'),
    state: fs.existsSync(MEMOIR_STATE) ? JSON.parse(fs.readFileSync(MEMOIR_STATE, 'utf8')) : null
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].endsWith('cathedral-memoir.js')) {
  const cmd = process.argv[2] || 'generate';
  if (cmd === 'generate') {
    console.log('Generating Cathedral Memoir...');
    generateMemoir().then(({ narrative, state }) => {
      console.log('\n' + narrative);
      console.log('\n--- Sources:', JSON.stringify(state.dataSources));
    }).catch(e => console.error('Error:', e.message));
  } else if (cmd === 'latest') {
    const m = getLatestMemoir();
    if (m) console.log(m.content);
    else console.log('No memoir generated yet. Run: node cathedral-memoir.js generate');
  }
}
