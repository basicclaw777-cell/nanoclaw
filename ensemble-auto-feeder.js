// ── Ensemble Gate Auto-Feeder ────────────────────────────────────────────────
// Scans recent vault entries, extracts testable claims, feeds through Ensemble Gate.
// Autonomous: runs nightly via PM2 cron.
//
// PM2: pm2 start ~/nanoclaw/ensemble-auto-feeder.js --name ensemble-feeder \
//      --cron "0 20 * * *" --no-autorestart
// (4am HKT daily)
// Manual: node ensemble-auto-feeder.js [--force] [--days 3]
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { runEnsemble, formatTelegram, generateDashboard } from './ensemble-gate.js';

const VAULT = path.join(process.env.HOME, 'cathedral-vault');
const STATE_FILE = path.join(process.env.HOME, 'nanoclaw', 'ensemble-feeder-state.json');
const ENV_FILE = path.join(process.env.HOME, 'nanoclaw', '.env');

const MAX_CLAIMS_PER_RUN = 5;
const DEFAULT_LOOKBACK_DAYS = 3;

// ── Env ──────────────────────────────────────────────────────────────────────

function loadEnv() {
  try {
    const env = fs.readFileSync(ENV_FILE, 'utf8');
    return {
      botToken: env.match(/TELEGRAM_BOT_TOKEN=(.+)/)?.[1]?.trim(),
      chatId: env.match(/TELEGRAM_CHAT_ID=(.+)/)?.[1]?.trim(),
      deepseekKey: env.match(/DEEPSEEK_API_KEY=(.+)/)?.[1]?.trim()
    };
  } catch { return {}; }
}

async function notify(text) {
  const { botToken, chatId } = loadEnv();
  if (!botToken || !chatId) return;
  try {
    const msg = text.length > 4096 ? text.slice(0, 4070) + '\n[truncated]' : text;
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: msg })
    });
  } catch {}
}

// ── State ────────────────────────────────────────────────────────────────────

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { processedFiles: [], processedClaims: [], lastRun: null, totalRuns: 0 }; }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ── Vault Scanner ────────────────────────────────────────────────────────────

function scanDir(dir, cutoff, files) {
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { scanDir(full, cutoff, files); }
      else if (entry.name.endsWith('.md')) {
        try {
          const stat = fs.statSync(full);
          if (stat.mtimeMs > cutoff) files.push({ path: full, mtime: stat.mtimeMs });
        } catch {}
      }
    }
  } catch {}
}

// Skip cathedral meta-docs (session harvests, build logs, standing instructions)
// Feed from real research and domain knowledge
const SKIP_PATTERNS = [
  /session-harvest/i, /terminal-harvest/i, /orchestrator-harvest/i,
  /cartographer-log/i, /groundskeeper-note/i, /mandate-without-mechanism/i,
  /operational-map/i, /ensemble-gate/i, /ensemble-feeder/i,
  /00_Staging\/cathedral\//,
  /02_Refined_Gold\/cathedral\//
];

function shouldSkip(filepath) {
  return SKIP_PATTERNS.some(p => p.test(filepath));
}

function getRecentVaultFiles(days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const dirs = [
    path.join(VAULT, '00_Staging'),
    path.join(VAULT, '02_Refined_Gold'),
    path.join(VAULT, '06_Methods')
  ];
  const files = [];
  for (const dir of dirs) if (fs.existsSync(dir)) scanDir(dir, cutoff, files);
  return files.filter(f => !shouldSkip(f.path)).sort((a, b) => b.mtime - a.mtime);
}

// ── Claim Extraction ─────────────────────────────────────────────────────────

async function extractClaims(content, filename) {
  const { deepseekKey } = loadEnv();
  if (!deepseekKey) return extractClaimsRegex(content);

  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${deepseekKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: `Extract 2-5 testable factual claims from this vault document. Each claim should be:
- A specific, verifiable assertion (not opinion or instruction)
- Self-contained (understandable without the document)
- Something 3 different AI models might disagree on

Return ONLY a JSON array of strings. No explanation.
If the document has no testable claims (instructions, code, personal notes), return [].`
          },
          { role: 'user', content: `Document: ${filename}\n\n${content.slice(0, 3000)}` }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    });
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '[]';
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
        .filter(c => typeof c === 'string' && c.length >= 20 && c.length <= 300);
    }
    return [];
  } catch (e) {
    console.error('[ensemble-feeder] DeepSeek error:', e.message);
    return extractClaimsRegex(content);
  }
}

function extractClaimsRegex(content) {
  const body = content.replace(/^---[\s\S]*?---/, '').trim();
  return body.split(/[.!?]\s+/)
    .map(s => s.trim().replace(/^[#*\->\s]+/, ''))
    .filter(s => s.length >= 20 && s.length <= 300)
    .filter(s => !s.startsWith('//') && !s.startsWith('```'))
    .filter(s => /^[A-Z]/.test(s) && /\s(is|are|was|were|has|have|can|does|shows|proves|demonstrates|suggests|indicates|causes|produces)\s/i.test(s))
    .filter(s => !/^(never|always|do not|don't|you must|use|run|build|install|check|read)/i.test(s))
    .slice(0, 3);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const daysIdx = args.indexOf('--days');
  const days = daysIdx >= 0 ? parseInt(args[daysIdx + 1], 10) : DEFAULT_LOOKBACK_DAYS;

  const state = loadState();
  console.log(`[ensemble-feeder] Scanning vault — last ${days} days...`);

  const recentFiles = getRecentVaultFiles(days);
  const newFiles = force ? recentFiles : recentFiles.filter(f => !state.processedFiles.includes(f.path));

  if (newFiles.length === 0) {
    console.log('[ensemble-feeder] No new files');
    return;
  }

  console.log(`[ensemble-feeder] ${newFiles.length} new files`);

  // Extract claims
  const allClaims = [];
  for (const file of newFiles.slice(0, 10)) {
    try {
      const content = fs.readFileSync(file.path, 'utf8');
      if (content.length < 100) continue;
      const claims = await extractClaims(content, path.basename(file.path));
      for (const claim of claims) {
        if (!state.processedClaims.includes(claim) || force) {
          allClaims.push({ claim, source: path.basename(file.path) });
        }
      }
      state.processedFiles.push(file.path);
    } catch {}
  }

  if (allClaims.length === 0) {
    console.log('[ensemble-feeder] No testable claims found');
    saveState(state);
    return;
  }

  const toTest = allClaims.slice(0, MAX_CLAIMS_PER_RUN);
  console.log(`[ensemble-feeder] Testing ${toTest.length} claims`);
  await notify(`Ensemble Auto-Feeder: ${toTest.length} claims from ${newFiles.length} vault files`);

  const results = [];
  for (let i = 0; i < toTest.length; i++) {
    const { claim, source } = toTest[i];
    console.log(`[ensemble-feeder] [${i + 1}/${toTest.length}] "${claim.slice(0, 60)}..."`);

    try {
      const result = await runEnsemble(claim);
      results.push({ ...result, source });
      state.processedClaims.push(claim);
      state.totalRuns++;

      if (result.divergence.overall > 4) {
        await notify(`HIGH DIVERGENCE!\nSource: ${source}\n\n${formatTelegram(result)}`);
      }

      // Breathing room for Ollama on 16GB
      if (i < toTest.length - 1) await new Promise(r => setTimeout(r, 5000));
    } catch (e) {
      console.error(`[ensemble-feeder] Failed: "${claim.slice(0, 60)}"`, e.message);
    }
  }

  // Summary
  const bySignal = s => results.filter(r => r.signal === s).length;
  const summary = [
    `Ensemble Auto-Feeder Complete`,
    `Tested: ${results.length}/${toTest.length}`,
    `Consensus: ${bySignal('CONSENSUS')}  Mild: ${bySignal('MILD_DIVERGENCE')}  Significant: ${bySignal('SIGNIFICANT_DIVERGENCE')}  High: ${bySignal('HIGH_DIVERGENCE')}`,
    `Total DB runs: ${state.totalRuns}`,
    '',
    ...results.map(r => {
      const e = { CONSENSUS: 'G', MILD_DIVERGENCE: 'Y', SIGNIFICANT_DIVERGENCE: 'O', HIGH_DIVERGENCE: 'R' }[r.signal] || '?';
      return `[${e}] ${r.divergence.overall}/10 — "${r.claim.slice(0, 80)}..."`;
    })
  ].join('\n');
  await notify(summary);

  try { generateDashboard(); } catch {}

  state.lastRun = new Date().toISOString();
  if (state.processedClaims.length > 500) state.processedClaims = state.processedClaims.slice(-500);
  if (state.processedFiles.length > 200) state.processedFiles = state.processedFiles.slice(-200);
  saveState(state);

  console.log(`[ensemble-feeder] Done. ${results.length} claims tested.`);
}

run().catch(e => {
  console.error('[ensemble-feeder] Fatal:', e);
  notify(`Ensemble Auto-Feeder error: ${e.message}`).catch(() => {});
});
