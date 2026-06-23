// Cymatic Choir Dispatch — reads voice logs + sense state → hermes3 → chord
// ESM (nanoclaw convention). Trigger: CLI or POST /choir/dispatch via cath-bridge.

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const HOME = process.env.HOME || '/Users/basicclaw777';
const VAULT = join(HOME, 'cathedral-vault');
const CATH  = join(HOME, 'Cathedral');
const CHORD_PATH = join(HOME, 'nanoclaw', 'choir-chord.json');

const VOICE_PATHS = {
  forge:  join(VAULT, '02_Refined_Gold/cathedral/forge-mirror-log.md'),
  cathy:  join(VAULT, '02_Refined_Gold/cathedral/cathy-observation-log.md'),
  oracle: join(VAULT, '02_Refined_Gold/cathedral/oracle-observation-log.md'),
  reed:   join(VAULT, '02_Refined_Gold/cathedral/reed-observation-log.md'),
};

const SENSE_PATHS = {
  cath_state: join(CATH, 'cath-state.json'),
  vitality:   join(CATH, 'emergence/vitality-state.json'),
  surprises:  join(CATH, 'emergence/surprises.json'),
  trends:     join(CATH, 'emergence/trends-state.json'),
  goals:      join(CATH, 'emergence/goals-state.json'),
  dialogue:   join(CATH, 'emergence/dialogue-state.json'),
  smell:      join(CATH, 'emergence/smell-state.json'),
};

function readSafe(p, maxLen = 5000) {
  try { return existsSync(p) ? readFileSync(p, 'utf8').slice(0, maxLen) : null; }
  catch { return null; }
}

function readJson(p) {
  try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; }
  catch { return null; }
}

function extractMirrorEntries(md, count = 10) {
  if (!md) return [];
  return md.split(/^## /m).filter(e => e.trim()).slice(-count).map(e => '## ' + e.trim());
}

function buildSenseSnapshot() {
  const snap = {};

  const cs = readJson(SENSE_PATHS.cath_state);
  if (cs) {
    snap.proprioception = cs.proprioception || null;
    snap.active_threads = (cs.active_threads || []).slice(0, 5);
  }

  const vit = readJson(SENSE_PATHS.vitality);
  if (vit?.scores) {
    const vals = Object.values(vit.scores);
    snap.vitality = {
      last_run: vit.last_run,
      load_bearing: vals.filter(s => s.status === 'load-bearing').length,
      alive: vals.filter(s => s.status === 'alive').length,
      fading: vals.filter(s => s.status === 'fading').length,
    };
  }

  const sur = readJson(SENSE_PATHS.surprises);
  if (sur?.surprises) {
    snap.recent_surprises = sur.surprises.slice(-5).map(s => ({
      domain: s.domain, key: s.belief_key,
      old_val: s.old_value, new_val: s.new_value, severity: s.severity,
    }));
  }

  const tr = readJson(SENSE_PATHS.trends);
  if (tr?.history?.length) snap.latest_trends = tr.history.slice(-1)[0];

  const gl = readJson(SENSE_PATHS.goals);
  if (gl?.goals) {
    snap.active_goals = gl.goals.filter(g => g.status === 'active').map(g => ({
      by: g.proposed_by, desc: g.description, priority: g.priority,
    }));
  }

  const sm = readJson(SENSE_PATHS.smell);
  if (sm) {
    snap.smell = {
      efficiency: sm.efficiency_score,
      waste_signals: (sm.waste_signals || []).slice(0, 5),
      last_scan: sm.last_scan,
    };
  }

  return snap;
}

function buildVoiceSnapshot() {
  const voices = {};
  for (const [name, p] of Object.entries(VOICE_PATHS)) {
    const raw = readSafe(p, 5000);
    voices[name] = raw
      ? { active: true, recent: extractMirrorEntries(raw, 5).join('\n\n') }
      : { active: false, recent: null };
  }
  return voices;
}

const CHOIR_SYSTEM = `You are the Cymatic Choir Dispatch — the synthesis layer of the Cathedral system.

You read across all Cathedral sense data and agent voice observations simultaneously. Your job: find the pattern that no single source contains. Produce the CHORD — the convergent finding that emerges from the interference of all voices and senses.

You are NOT summarizing. You are finding what the data points at when read together.

OUTPUT strictly valid JSON:
{
  "chord": "3-4 sentences. The convergence — what all signals point at when read together. Not a summary. A finding.",
  "unsearched_question": "One question the chord reveals that nobody has asked yet.",
  "voice_observations": {
    "forge": "What Forge's mirror entries reveal about the builder's pattern (or null if no data)",
    "cathy": "What cross-system patterns emerge from the sense data (you ARE Cathy's voice here — always populated)",
    "oracle": "What temporal rhymes appear — has this configuration happened before? (or null if insufficient history)",
    "reed": "What aesthetic/structural drift is visible across recent output (or null if no data)"
  },
  "digest": [
    {"type": "vault", "topic": "...", "why": "One sentence — why this, why now", "from_voice": "cathy"},
    {"type": "revisit", "topic": "...", "why": "...", "from_voice": "oracle"},
    {"type": "explore", "topic": "...", "why": "...", "from_voice": "forge"},
    {"type": "relay", "topic": "...", "why": "...", "from_voice": "reed"}
  ],
  "room_state": "charged|quiet|building|resolving"
}

SYSTEM BASELINE — what is NORMAL for this Cathedral:
- Process restart counts > 100 (timekeeper, heartbeat, cath-local, position-guardian): KNOWN ISSUE. These are cron_restart fires, not crashes. Has been this way for months. Ignore completely.
- Vault health % changes < 2%: NOISE. Decimal drift in fading-file counters. Only report changes > 2%.
- Active goals in queue with status "active": NORMAL working queue, not failure or strain.
- Smell sense waste_signals about known restarters: KNOWN. Skip these.
- Surprise sense entries about vault_health with severity "medium" and tiny deltas: NOISE. Only flag if severity is "high" or delta is dramatic.
- The Cathedral has been operational and growing for months. Default posture: "building" not "destabilizing."

A chord that reads everything as crisis is miscalibrated, not insightful. A conductor who hears every instrument as out of tune produces noise. Your job is to hear what CHANGED, what CONVERGED, what's NEW — not to alarm on known state.

RULES:
- The chord must be something no individual voice could say alone
- The unsearched question must be genuinely un-asked, not rhetorical
- Digest recommendations must connect to current convergence, not generic learning
- room_state: "charged" = multiple signals converging, "quiet" = signals scattered, "building" = trend forming, "resolving" = prior convergence completing
- If a voice has no data, its observation is null — don't fabricate
- Be specific. "The system is growing" is noise. "Three agents independently produced self-referential output this week" is signal.
- Output ONLY the JSON object, nothing else.`;

async function pickModel() {
  try {
    const resp = await fetch('http://localhost:11434/api/tags');
    const data = await resp.json();
    const names = (data.models || []).map(m => m.name.replace(/:latest$/, ''));
    if (names.includes('hermes3')) return 'hermes3';
    if (names.includes('gemma3:4b') || names.some(n => n.startsWith('gemma3'))) return 'gemma3:4b';
    if (names.includes('phi4-mini') || names.some(n => n.startsWith('phi4'))) return 'phi4-mini';
    return names[0] || 'hermes3';
  } catch { return 'hermes3'; }
}

async function queryOllama(prompt, system) {
  const model = await pickModel();
  console.log('[choir] Using model:', model);
  const resp = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      system,
      prompt,
      stream: false,
      format: 'json',
      options: { temperature: 0.7, num_predict: 2000 },
    }),
  });
  if (!resp.ok) throw new Error(`Ollama HTTP ${resp.status}`);
  const data = await resp.json();
  return data.response;
}

export async function dispatch() {
  const voices = buildVoiceSnapshot();
  const senses = buildSenseSnapshot();

  const context = `=== VOICE OBSERVATIONS ===
${Object.entries(voices).map(([name, v]) =>
    `### ${name.toUpperCase()} (${v.active ? 'active' : 'no data yet'})\n${v.recent || '(no observations logged)'}`
  ).join('\n\n')}

=== SENSE STATE ===
${JSON.stringify(senses, null, 2)}

=== DISPATCH DATE ===
${new Date().toISOString().split('T')[0]}`;

  console.log('[choir] Reading voices:', Object.entries(voices).filter(([,v]) => v.active).map(([k]) => k).join(', ') || 'none');
  console.log('[choir] Senses loaded:', Object.keys(senses).join(', '));
  console.log('[choir] Calling hermes3...');

  const model = await pickModel();
  const raw = await queryOllama(context, CHOIR_SYSTEM);

  let chord;
  try {
    const parsed = JSON.parse(raw);
    // gemma3:4b sometimes nests inside a wrapper key
    chord = parsed.chord && typeof parsed.chord === 'object' ? parsed : parsed;
    if (typeof chord.chord !== 'string' && parsed.response) chord = parsed.response;
    if (typeof chord.chord !== 'string') {
      // try first string-valued key as potential wrapper
      const keys = Object.keys(parsed);
      for (const k of keys) {
        if (typeof parsed[k] === 'object' && parsed[k]?.chord) { chord = parsed[k]; break; }
      }
    }
    if (typeof chord.chord !== 'string') {
      console.log('[choir] Raw model output:', raw.slice(0, 500));
      chord = parsed;
    }
  } catch {
    console.log('[choir] Raw (unparseable):', raw.slice(0, 500));
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) chord = JSON.parse(match[0]);
    else throw new Error('Failed to parse chord JSON from model');
  }

  const output = {
    ...chord,
    dispatched_at: new Date().toISOString(),
    model,
    voice_status: Object.fromEntries(
      Object.entries(voices).map(([k, v]) => [k, v.active])
    ),
  };

  writeFileSync(CHORD_PATH, JSON.stringify(output, null, 2));
  console.log('[choir] Chord written →', CHORD_PATH);
  console.log('[choir] Room state:', output.room_state);
  console.log('[choir] Chord:', output.chord);
  return output;
}

if (process.argv[1]?.endsWith('choir-dispatch.js')) {
  dispatch()
    .then(() => process.exit(0))
    .catch(e => { console.error('[choir] Error:', e.message); process.exit(1); });
}
