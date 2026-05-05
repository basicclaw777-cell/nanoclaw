// ~/nanoclaw/council-engine.js
// Session 2: Council Engine
// Runs all four Honest Interlocutors on a claim, surfaces disagreements and consensus.

import { readFileSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { semanticSearch } from './vault-embedder.js';

const HOME = process.env.HOME;
const OLLAMA_URL = 'http://localhost:11434';
const LEDGER_PATH = join(HOME, 'Cathedral', 'ledger.py');

function spawnLedgerLog(claim, source = 'council', days = 90) {
  return new Promise((resolve) => {
    const proc = spawn('python3', [
      LEDGER_PATH, 'log', claim, '--source', source, '--days', String(days),
    ], { env: process.env });
    proc.on('close', code => {
      if (code === 0) console.log(`[council→ledger] Logged disagreement (${days}d)`);
      else console.warn(`[council→ledger] Failed to log (exit ${code})`);
      resolve(code === 0);
    });
    proc.on('error', () => resolve(false));
  });
}
const SAGES_DIR  = join(HOME, 'nanoclaw', 'sages');
const SKINS_DIR  = join(HOME, 'nanoclaw', 'skins');

// ── Load interlocutor definitions ─────────────────────────────────────────────

function loadInterlocutor(name) {
  const paths = [
    join(SAGES_DIR, `${name}.json`),
    join(SKINS_DIR, 'general', `${name}.json`),
  ];

  for (const p of paths) {
    try {
      return JSON.parse(readFileSync(p, 'utf8'));
    } catch { /* try next */ }
  }

  throw new Error(`Interlocutor definition not found: ${name}`);
}

// ── Ollama call ───────────────────────────────────────────────────────────────

async function queryInterlocutor(name, topic, vaultContext) {
  const def = loadInterlocutor(name);
  const systemPrompt = def.system_prompt;
  const model = def.interlocutor?.model || 'hermes3';

  const contextBlock = vaultContext && vaultContext.length > 0
    ? `\n\nVault context (relevant nuggets):\n${vaultContext}`
    : '';

  const userPrompt = `Assess this claim or topic from your expert perspective:\n\n${topic}${contextBlock}`;

  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      stream: false,
    }),
  });

  if (!res.ok) throw new Error(`Ollama ${res.status} for ${name}`);
  const data = await res.json();
  const content = data.message?.content || '[No response]';

  return {
    name:    def.interlocutor?.name        || name,
    role:    def.interlocutor?.designation || name,
    model,
    content,
    error:   null,
  };
}

// ── Disagreement detection ────────────────────────────────────────────────────
// Simple heuristic: look for explicit contradiction markers and confidence divergence.

const AGREEMENT_PHRASES = [
  'evidence supports', 'this holds', 'verified', 'demonstrated', 'confirmed',
  'the claim is sound', 'supported by', 'corroborated',
];

const SKEPTICISM_PHRASES = [
  'no evidence', 'unsupported', 'untested', 'fabrication', 'narrative suppression',
  'disproven', 'contamination', 'disinfo', 'cannot trace', 'the claim is weak',
  'unfalsifiable', 'no experiment', 'no replication',
];

function classifyStance(text) {
  const lower = text.toLowerCase();
  const agrees  = AGREEMENT_PHRASES.filter(p => lower.includes(p)).length;
  const doubts  = SKEPTICISM_PHRASES.filter(p => lower.includes(p)).length;
  if (agrees > doubts + 1) return 'SUPPORTIVE';
  if (doubts > agrees + 1) return 'SKEPTICAL';
  return 'INCONCLUSIVE';
}

function detectDisagreements(views) {
  const stances = views.map(v => ({
    name:   v.name,
    stance: classifyStance(v.content),
  }));

  const supportive   = stances.filter(s => s.stance === 'SUPPORTIVE').map(s => s.name);
  const skeptical    = stances.filter(s => s.stance === 'SKEPTICAL').map(s => s.name);
  const inconclusive = stances.filter(s => s.stance === 'INCONCLUSIVE').map(s => s.name);

  const disagreements = [];

  if (supportive.length > 0 && skeptical.length > 0) {
    disagreements.push(
      `${supportive.join(', ')} lean SUPPORTIVE — ${skeptical.join(', ')} lean SKEPTICAL`
    );
  }

  return {
    stances,
    disagreements,
    consensus: disagreements.length === 0
      ? `All interlocutors lean ${stances[0]?.stance || 'INCONCLUSIVE'}`
      : null,
  };
}

// ── Public: run full council ──────────────────────────────────────────────────

/**
 * runCouncil(topic)
 * @param {string} topic — Claim or question to assess
 * @returns {Promise<object>} — All four views + disagreement analysis
 */
export async function runCouncil(topic) {
  // Pull vault context once, share across all four
  let vaultNuggets = [];
  try {
    const results = await semanticSearch(topic, 5);
    vaultNuggets = results.map(r => {
      const title = r.title ? `## ${r.title}` : '';
      const body  = r.first_line || '';
      return [title, body].filter(Boolean).join('\n');
    });
  } catch (err) {
    console.warn('Vault search failed for council:', err.message);
  }

  const vaultContext = vaultNuggets.join('\n---\n');

  // Run all four interlocutors — sequentially to avoid hammering Ollama
  const INTERLOCUTORS = ['librarian', 'physicist', 'archivist', 'experimentalist'];
  const views = [];

  for (const name of INTERLOCUTORS) {
    try {
      const view = await queryInterlocutor(name, topic, vaultContext);
      views.push(view);
    } catch (err) {
      views.push({
        name,
        role: name,
        model: 'hermes3',
        content: `[Error: ${err.message}]`,
        error: err.message,
      });
    }
  }

  const { stances, disagreements, consensus } = detectDisagreements(
    views.filter(v => !v.error)
  );

  // Auto-log disagreements to Ledger (90-day window)
  if (disagreements.length > 0) {
    for (const d of disagreements) {
      spawnLedgerLog(
        `[COUNCIL DISAGREEMENT] ${topic.slice(0, 80)}: ${d}`,
        'council',
        90
      ).catch(() => {});
    }
    console.log(`[council→ledger] ${disagreements.length} disagreement(s) logged`);
  }

  return {
    topic,
    vault_nuggets_used: vaultNuggets.length,
    views,
    stances,
    disagreements,
    consensus,
    timestamp: new Date().toISOString(),
  };
}

// ── Format for Telegram ───────────────────────────────────────────────────────

const INTERLOCUTOR_EMOJI = {
  'The Librarian':       '📚',
  'The Physicist':       '⚛️',
  'The Archivist':       '🗂️',
  'The Experimentalist': '🔬',
};

export function formatCouncilResult(result) {
  const sections = [];

  sections.push(`*COUNCIL SESSION*\n_Topic: ${result.topic}_\n_Vault nuggets consulted: ${result.vault_nuggets_used}_`);

  for (const view of result.views) {
    const emoji = INTERLOCUTOR_EMOJI[view.name] || '•';
    const truncated = view.content.length > 800
      ? view.content.slice(0, 797) + '...'
      : view.content;
    sections.push(`${emoji} *${view.name}*\n${truncated}`);
  }

  if (result.disagreements.length > 0) {
    sections.push(`⚡ *DISAGREEMENTS DETECTED*\n${result.disagreements.map(d => `• ${d}`).join('\n')}`);
  } else if (result.consensus) {
    sections.push(`✅ *COUNCIL CONSENSUS*\n${result.consensus}`);
  }

  return sections.join('\n\n─────────────────────\n\n');
}

// ── CLI entrypoint ────────────────────────────────────────────────────────────

import { fileURLToPath } from 'url';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const topic = process.argv.slice(2).join(' ');
  if (!topic) {
    console.error('Usage: node council-engine.js <claim or topic>');
    process.exit(1);
  }

  console.log(`\nConvening Council on: "${topic}"\n`);

  runCouncil(topic).then(result => {
    console.log('='.repeat(60));
    for (const view of result.views) {
      const emoji = INTERLOCUTOR_EMOJI[view.name] || '•';
      console.log(`\n${emoji} ${view.name} (${view.role})`);
      console.log('-'.repeat(40));
      console.log(view.content);
    }

    console.log('\n' + '='.repeat(60));
    if (result.disagreements.length > 0) {
      console.log('⚡ DISAGREEMENTS:');
      result.disagreements.forEach(d => console.log(`  • ${d}`));
    } else {
      console.log(`✅ CONSENSUS: ${result.consensus}`);
    }

    console.log('\nStances:');
    result.stances.forEach(s => console.log(`  ${s.name}: ${s.stance}`));
  }).catch(err => {
    console.error('Council failed:', err.message);
    process.exit(1);
  });
}
