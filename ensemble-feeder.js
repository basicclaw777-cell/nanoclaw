// ── Ensemble Gate Auto-Feeder ─────────────────────────────────────────────────
// Nightly cron: pulls claims from vault nuggets, runs through Ensemble Gate.
// Surfaces only notable divergences to Paul via Telegram.
// This is the "mechanism" that makes the Ensemble Gate breathe.
// ──────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { runEnsemble, formatTelegram, generateDashboard, getHistory } from './ensemble-gate.js';

const VAULT_ROOT = path.join(process.env.HOME, 'cathedral-vault');
const DB_PATH = path.join(process.env.HOME, 'nanoclaw', 'vortex_data', 'ensemble.db');
const OLLAMA_URL = 'http://localhost:11434';

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const PAUL_CHAT_ID = process.env.PAUL_CHAT_ID ? parseInt(process.env.PAUL_CHAT_ID) : null;

// ── Claim extraction prompt ──────────────────────────────────────────────────

const EXTRACT_PROMPT = `You are a claim extractor. Given a vault nugget (text from a knowledge base), extract 1-3 testable factual claims.

Rules:
- Only extract claims that can be evaluated for truth/accuracy
- Skip opinions, instructions, prompts, metadata, and subjective statements
- Each claim should be a single clear sentence
- If no testable claims exist, return NONE

Format: one claim per line, no numbering, no bullets.`;

async function extractClaims(nuggetText) {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma3:4b', // Fast model for extraction
        messages: [
          { role: 'system', content: EXTRACT_PROMPT },
          { role: 'user', content: nuggetText.slice(0, 2000) }
        ],
        stream: false,
        options: { temperature: 0.2, num_predict: 300 }
      })
    });
    const data = await res.json();
    const text = data.message?.content || '';
    if (text.includes('NONE') || text.trim().length < 10) return [];
    return text.split('\n')
      .map(l => l.replace(/^[-•*\d.)\s]+/, '').trim())
      .filter(l => l.length > 20 && l.length < 500);
  } catch (e) {
    console.error('[feeder] Claim extraction error:', e.message);
    return [];
  }
}

// ── Get already-tested claims ────────────────────────────────────────────────

function getTestedClaims() {
  try {
    const db = new Database(DB_PATH);
    const rows = db.prepare('SELECT claim FROM ensemble_runs').all();
    db.close();
    return new Set(rows.map(r => r.claim.toLowerCase().trim()));
  } catch {
    return new Set();
  }
}

// ── Scan vault for nugget files ──────────────────────────────────────────────

function getVaultFiles() {
  const dirs = [
    path.join(VAULT_ROOT, '02_Refined_Gold'),
    path.join(VAULT_ROOT, '04_Esoteric_Studies'),
  ];
  const files = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir, { recursive: true });
    for (const entry of entries) {
      const full = path.join(dir, entry);
      if (full.endsWith('.md') && fs.statSync(full).isFile()) {
        files.push(full);
      }
    }
  }
  return files;
}

// ── Parse nuggets from a file ────────────────────────────────────────────────

function parseNuggets(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  // Split on nugget headers
  const parts = content.split(/## Nugget \d+/);
  return parts
    .slice(1) // skip frontmatter
    .map(p => p.trim())
    .filter(p => p.length > 50 && p.length < 3000); // meaningful length
}

// ── Send to Telegram ─────────────────────────────────────────────────────────

async function sendTelegram(text) {
  if (!TELEGRAM_TOKEN || !PAUL_CHAT_ID) {
    console.log('[feeder] No Telegram config, printing to console');
    console.log(text);
    return;
  }
  const MAX = 4096;
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= MAX) { chunks.push(remaining); break; }
    let cut = remaining.lastIndexOf('\n', MAX);
    if (cut < MAX * 0.3) cut = MAX;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).replace(/^\n+/, '');
  }
  for (const chunk of chunks) {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: PAUL_CHAT_ID, text: chunk })
    });
  }
}

// ── Main feed cycle ──────────────────────────────────────────────────────────

const CLAIMS_PER_RUN = 3; // Process 3 claims per nightly run (each takes ~90s)

export async function runFeedCycle() {
  console.log('[feeder] Starting nightly feed cycle...');
  const tested = getTestedClaims();
  const files = getVaultFiles();

  // Shuffle files for variety
  for (let i = files.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [files[i], files[j]] = [files[j], files[i]];
  }

  const candidateClaims = [];

  for (const file of files) {
    if (candidateClaims.length >= CLAIMS_PER_RUN * 3) break; // Get 3x candidates, pick best
    const nuggets = parseNuggets(file);
    for (const nugget of nuggets) {
      if (candidateClaims.length >= CLAIMS_PER_RUN * 3) break;
      const claims = await extractClaims(nugget);
      for (const claim of claims) {
        if (!tested.has(claim.toLowerCase().trim())) {
          candidateClaims.push({ claim, source: path.basename(file) });
        }
      }
    }
  }

  if (candidateClaims.length === 0) {
    console.log('[feeder] No new testable claims found this cycle.');
    await sendTelegram('Ensemble Feeder: no new testable claims found in vault tonight. Vault may need fresh material.');
    return;
  }

  // Pick top N
  const toTest = candidateClaims.slice(0, CLAIMS_PER_RUN);
  console.log(`[feeder] Testing ${toTest.length} claims...`);

  const results = [];
  for (const { claim, source } of toTest) {
    console.log(`[feeder] Testing: "${claim.slice(0, 80)}..."`);
    try {
      const run = await runEnsemble(claim);
      results.push({ run, source });
    } catch (e) {
      console.error(`[feeder] Ensemble error for claim: ${e.message}`);
    }
  }

  // Generate report
  const notable = results.filter(r => r.run.divergence.overall > 3);
  const consensus = results.filter(r => r.run.divergence.overall <= 2);

  let report = `ENSEMBLE GATE — NIGHTLY FEED\n`;
  report += `${new Date().toLocaleDateString()} | ${results.length} claims tested\n\n`;

  if (notable.length > 0) {
    report += `NOTABLE DIVERGENCES (needs investigation):\n\n`;
    for (const { run, source } of notable) {
      report += formatTelegram(run);
      report += `\nSource: ${source}\n\n${'─'.repeat(40)}\n\n`;
    }
  }

  if (consensus.length > 0) {
    report += `CONSENSUS (models agree):\n`;
    for (const { run } of consensus) {
      report += `🟢 ${run.divergence.overall}/10 — "${run.claim.slice(0, 100)}"\n`;
    }
    report += '\n';
  }

  // Stats
  const history = getHistory(100);
  const avgDiv = history.length > 0 ? (history.reduce((s, r) => s + r.divergence_score, 0) / history.length).toFixed(1) : '?';
  report += `Lifetime: ${history.length} claims tested | Avg divergence: ${avgDiv}/10`;

  await sendTelegram(report);
  generateDashboard();
  console.log('[feeder] Feed cycle complete.');
}

// ── Run directly or as cron ──────────────────────────────────────────────────

// If run directly: execute one cycle
import dotenv from 'dotenv';
dotenv.config({ path: path.join(process.env.HOME, 'nanoclaw', '.env') });

if (process.argv[1] && process.argv[1].includes('ensemble-feeder')) {
  runFeedCycle().then(() => process.exit(0)).catch(e => {
    console.error('[feeder] Fatal:', e);
    process.exit(1);
  });
}
