// ~/nanoclaw/oracle.js
// Session 6: Oracle Function
//
// Speculative synthesis engine. Takes the strongest vault findings and asks:
// "What would have to be true for all of this to connect?"
//
// Rules (from spec):
//   - Every output tagged [ORACLE — SPECULATIVE]
//   - All assumptions listed explicitly, weakest identified
//   - Auto-queued for Council review (async, non-blocking)
//   - Cannot cite itself as evidence
//   - Outputs expire after 30 days unless corroborated
//
// Exports: runOracle(), getOracleOutputs(), formatOracleResult()
// Commands: /oracle [question]

import Database    from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join }    from 'path';
import { fileURLToPath } from 'url';
import { spawn }   from 'child_process';
import { semanticSearch }   from './vault-embedder.js';
import { getLatestAtlas }   from './convergence-atlas.js';
import { runCouncil }       from './council-engine.js';

const HOME         = process.env.HOME;
const DB_PATH      = join(HOME, 'nanoclaw', 'vortex_data', 'metrics.db');
const PROMPTS_DIR  = join(HOME, 'nanoclaw', 'prompts');
const OLLAMA_URL   = 'http://localhost:11434';
const ORACLE_MODEL = 'hermes3';
const EXPIRY_MS    = 30 * 24 * 60 * 60 * 1000; // 30 days

const db = new Database(DB_PATH);

const LEDGER_PATH = join(HOME, 'Cathedral', 'ledger.py');

function spawnLedgerLog(claim, source = 'oracle', days = 180) {
  return new Promise((resolve) => {
    const proc = spawn('python3', [
      LEDGER_PATH, 'log', claim, '--source', source, '--days', String(days),
    ], { env: process.env });
    proc.on('close', code => {
      if (code === 0) console.log(`[oracle→ledger] Logged falsification test (${days}d)`);
      else console.warn(`[oracle→ledger] Failed to log (exit ${code})`);
      resolve(code === 0);
    });
    proc.on('error', () => resolve(false));
  });
}

// ── Schema ────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS oracle_outputs (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at         INTEGER NOT NULL,
    expires_at         INTEGER NOT NULL,
    question           TEXT,
    context_summary    TEXT,
    speculation_text   TEXT NOT NULL,
    assumptions_json   TEXT,
    weakest_assumption TEXT,
    falsification_test TEXT,
    council_queued     INTEGER DEFAULT 0,
    council_result     TEXT,
    corroborated       INTEGER DEFAULT 0
  )
`);

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadPrompt(name) {
  return readFileSync(join(PROMPTS_DIR, `${name}.txt`), 'utf8');
}

async function queryOllama({ model, system, prompt }) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: prompt },
      ],
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${res.statusText}`);
  const data = await res.json();
  return data.message?.content || '';
}

// ── Context loaders ───────────────────────────────────────────────────────────

function loadGoldContext() {
  const row = db
    .prepare('SELECT findings_json FROM gold_findings ORDER BY run_at DESC LIMIT 1')
    .get();
  if (!row) return { findings: [], summary: 'No gold findings available.' };

  let findings = [];
  try { findings = JSON.parse(row.findings_json); } catch { /* pass */ }

  // Only the strongest findings go into Oracle context
  const strong = findings.filter(f =>
    (f.type === 'RATIO'       && (f.confidence    || 0) >= 0.60) ||
    (f.type === 'GEOMETRY'    && (f.total_nuggets  || 0) >= 5)   ||
    (f.type === 'SUPPRESSION' && (f.shared_stages?.length || 0) >= 3) ||
    (f.type === 'BRIDGE'      && (f.similarity     || 0) >= 0.75)
  );

  const lines = strong.map(f => {
    if (f.type === 'RATIO')       return `  RATIO: ${f.name} across ${f.domains.join(', ')} [conf: ${f.confidence}]`;
    if (f.type === 'GEOMETRY')    return `  GEOMETRY: ${f.form} across ${f.domains.join(', ')} (${f.total_nuggets} nuggets)`;
    if (f.type === 'SUPPRESSION') return `  SUPPRESSION: ${f.researcher_a} + ${f.researcher_b} share stages [${f.shared_stages.join(', ')}]`;
    if (f.type === 'BRIDGE')      return `  BRIDGE: ${f.domain_a} ↔ ${f.domain_b} [sim: ${f.similarity}]`;
    return '';
  }).filter(Boolean);

  const summary = lines.length > 0
    ? `STRONGEST CONVERGENCES (${strong.length} findings):\n${lines.join('\n')}`
    : 'No high-confidence convergences found yet.';

  return { findings: strong, summary };
}

function loadNegativeSpaceContext() {
  const row = db
    .prepare('SELECT findings_json FROM gold_findings ORDER BY run_at DESC LIMIT 1')
    .get();
  if (!row) return '';

  try {
    const findings = JSON.parse(row.findings_json);
    const ns = findings.filter(f => f.type === 'NEGATIVE_SPACE');
    if (ns.length === 0) return '';
    return 'NEGATIVE SPACE FINDINGS:\n' +
      ns.map(f => `  ${f.pattern || 'GAP'}: ${f.description || JSON.stringify(f)}`).join('\n');
  } catch {
    return '';
  }
}

function loadAtlasContext() {
  const atlas = getLatestAtlas();
  if (!atlas) return '';

  try {
    const meta = JSON.parse(atlas.meta_convergences_json || '[]');
    if (meta.length === 0) return '';
    return 'CONVERGENCE ATLAS — META-CONVERGENCES:\n' +
      meta.map(m => `  [${m.confidence}] ${m.description}`).join('\n');
  } catch {
    return '';
  }
}

// ── Parse Oracle response ─────────────────────────────────────────────────────
// Oracle output is freeform text — we extract structured elements heuristically.

function parseOracleResponse(raw) {
  const lines = raw.split('\n');

  // Collect numbered assumptions from any assumption block
  const assumptions = [];
  let inAssumptionBlock = false;

  for (const line of lines) {
    if (/assumption/i.test(line) && line.trim().length < 80) {
      inAssumptionBlock = true;
      continue;
    }
    if (inAssumptionBlock) {
      const m = line.match(/^\s*(?:\d+[.):]|[-•*])\s+(.+)/);
      if (m) {
        assumptions.push(m[1].trim());
      } else if (line.trim() === '' && assumptions.length > 0) {
        inAssumptionBlock = false;
      }
    }
  }

  // Weakest assumption — look for explicit callout
  const weakestMatch = raw.match(
    /(?:weakest assumption|most vulnerable|if.{0,30}collapses?|falls apart)[^\n]*/i
  );
  const weakestAssumption = weakestMatch
    ? weakestMatch[0].trim()
    : (assumptions[assumptions.length - 1] || '');

  // Falsification test
  const falsificationMatch = raw.match(
    /(?:falsif\w+|test that would|to disprove|specific test|prediction that)[^\n]*/i
  );
  const falsificationTest = falsificationMatch ? falsificationMatch[0].trim() : '';

  return { assumptions, weakest_assumption: weakestAssumption, falsification_test: falsificationTest };
}

// ── Main ──────────────────────────────────────────────────────────────────────

/**
 * runOracle(question, opts)
 *
 * @param {string}  [question]          — Optional question / domain constraint
 * @param {object}  [opts]
 * @param {boolean} [opts.skipCouncil]  — Skip auto-Council (default false)
 * @returns {Promise<object>}           — Stored oracle output record
 */
export async function runOracle(question = '', opts = {}) {
  console.log(`[oracle] Running${question ? ` on: "${question}"` : ' (full vault synthesis)'}...`);

  const systemPrompt = loadPrompt('oracle');

  // Gather context
  const { findings: strongFindings, summary: goldSummary } = loadGoldContext();
  const negativeSpaceCtx = loadNegativeSpaceContext();
  const atlasCtx         = loadAtlasContext();

  // Semantic vault pull if question given
  let vaultCtx = '';
  if (question) {
    try {
      const nuggets = await semanticSearch(question, 8);
      if (nuggets.length > 0) {
        vaultCtx = 'VAULT NUGGETS (relevant to question):\n' +
          nuggets.map(n => `  [${n.domain || 'unknown'}] ${n.title}: ${(n.first_line || '').slice(0, 120)}`).join('\n');
      }
    } catch (err) {
      console.warn('[oracle] Vault search failed:', err.message);
    }
  }

  const contextBlock = [goldSummary, atlasCtx, negativeSpaceCtx, vaultCtx]
    .filter(Boolean)
    .join('\n\n');

  const contextSummary = [
    `${strongFindings.length} strong convergences`,
    atlasCtx         ? 'atlas loaded'    : 'no atlas',
    negativeSpaceCtx ? 'neg.space loaded' : 'no neg.space',
  ].join(' · ');

  const userPrompt = question
    ? `Question / constraint: ${question}\n\nContext:\n${contextBlock}\n\nGenerate your speculative synthesis. Tag everything [ORACLE — SPECULATIVE].`
    : `Context:\n${contextBlock}\n\nGenerate your speculative synthesis of what would have to be true for all of this to connect. Tag everything [ORACLE — SPECULATIVE].`;

  const raw = await queryOllama({ model: ORACLE_MODEL, system: systemPrompt, prompt: userPrompt });

  const { assumptions, weakest_assumption, falsification_test } = parseOracleResponse(raw);

  const createdAt = Date.now();
  const expiresAt = createdAt + EXPIRY_MS;

  const inserted = db.prepare(`
    INSERT INTO oracle_outputs
      (created_at, expires_at, question, context_summary, speculation_text,
       assumptions_json, weakest_assumption, falsification_test, council_queued)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    createdAt,
    expiresAt,
    question || null,
    contextSummary,
    raw,
    JSON.stringify(assumptions),
    weakest_assumption,
    falsification_test,
  );

  const outputId = inserted.lastInsertRowid;
  console.log(`[oracle] Output stored (id: ${outputId}). Queuing for Council review...`);

  // Auto-log falsification test to Ledger (180-day window)
  if (falsification_test && falsification_test.length > 10) {
    spawnLedgerLog(
      `[ORACLE #${outputId}] ${falsification_test}`,
      'oracle',
      180
    ).catch(() => {});
  }

  // Auto-Council — async, non-blocking. Council cannot upgrade Oracle to evidence.
  if (!opts.skipCouncil) {
    const forCouncil = `[ORACLE — SPECULATIVE] (id: ${outputId}):\n\n${raw.slice(0, 1200)}`;

    runCouncil(forCouncil)
      .then(councilResult => {
        const councilText = councilResult.views
          .map(v => `${v.name}:\n${v.content.slice(0, 400)}`)
          .join('\n---\n');
        db.prepare('UPDATE oracle_outputs SET council_queued = 1, council_result = ? WHERE id = ?')
          .run(councilText, outputId);
        console.log(`[oracle] Council review stored for output ${outputId}.`);
      })
      .catch(err => {
        db.prepare('UPDATE oracle_outputs SET council_queued = 1, council_result = ? WHERE id = ?')
          .run(`[Council error: ${err.message}]`, outputId);
        console.error(`[oracle] Council failed for ${outputId}:`, err.message);
      });
  }

  return {
    id:                outputId,
    created_at:        createdAt,
    expires_at:        expiresAt,
    question:          question || null,
    context_summary:   contextSummary,
    speculation_text:  raw,
    assumptions,
    weakest_assumption,
    falsification_test,
  };
}

// ── Accessors ─────────────────────────────────────────────────────────────────

export function getOracleOutputs(limit = 5) {
  return db.prepare(`
    SELECT * FROM oracle_outputs
    WHERE expires_at > ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(Date.now(), limit);
}

export function getOracleById(id) {
  return db.prepare('SELECT * FROM oracle_outputs WHERE id = ?').get(id) || null;
}

export function markCorroborated(id) {
  db.prepare('UPDATE oracle_outputs SET corroborated = 1 WHERE id = ?').run(id);
}

// ── Format for Telegram ───────────────────────────────────────────────────────

export function formatOracleResult(output) {
  const date       = new Date(output.created_at).toLocaleString('en-HK', { timeZone: 'Asia/Hong_Kong' });
  const expiryDate = new Date(output.expires_at).toLocaleString('en-HK', {
    timeZone: 'Asia/Hong_Kong', year: 'numeric', month: 'short', day: 'numeric',
  });

  let out = `🔮 *ORACLE FUNCTION*\n`;
  out += `_[ORACLE — SPECULATIVE] — everything below is speculation, not finding_\n`;
  out += `_Generated: ${date} HKT_\n`;
  out += `_Expires: ${expiryDate} unless corroborated · ID: ${output.id}_\n`;

  if (output.question) {
    out += `_Question: "${output.question}"_\n`;
  }

  out += `\n${output.speculation_text}\n`;

  const assumptions = Array.isArray(output.assumptions)
    ? output.assumptions
    : (() => { try { return JSON.parse(output.assumptions_json || '[]'); } catch { return []; } })();

  if (assumptions.length > 0) {
    out += `\n*ASSUMPTIONS:*\n`;
    assumptions.slice(0, 6).forEach((a, i) => { out += `${i + 1}. ${a}\n`; });
  }

  if (output.weakest_assumption) {
    out += `\n*WEAKEST ASSUMPTION:*\n${output.weakest_assumption}\n`;
  }

  if (output.falsification_test) {
    out += `\n*FALSIFICATION TEST:*\n${output.falsification_test}\n`;
  }

  out += `\n_Queued for Council review. Council cannot upgrade [ORACLE] to structural evidence._`;

  return out.trim();
}

// ── CLI entrypoint ────────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const question = process.argv.slice(2).join(' ');

  console.log('\n🔮 Oracle Function\n');
  if (question) console.log(`Question: "${question}"\n`);

  runOracle(question, { skipCouncil: true })
    .then(output => {
      console.log('='.repeat(60));
      console.log(output.speculation_text);
      console.log('\n' + '='.repeat(60));
      if (output.assumptions.length > 0) {
        console.log('\nAssumptions:');
        output.assumptions.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));
      }
      if (output.weakest_assumption) console.log('\nWeakest:', output.weakest_assumption);
      if (output.falsification_test) console.log('\nFalsification:', output.falsification_test);
      console.log(`\nOutput ID: ${output.id} — expires 30 days from now unless corroborated.`);
    })
    .catch(err => {
      console.error('Oracle failed:', err.message);
      process.exit(1);
    });
}
