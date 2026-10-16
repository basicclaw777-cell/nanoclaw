// ~/nanoclaw/vault-brain.js — The Associative Push
// Brain function #1: when a vault file is created or changed,
// find cross-domain connections and push to Telegram.
// Requires: vault-embedder (PM2 vault-watcher) to be running.
// ESM module (SI-13).

import Database from 'better-sqlite3';
import chokidar from 'chokidar';
import { readFileSync } from 'fs';
import { join, relative, extname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config({ path: join(process.env.HOME, 'nanoclaw', '.env') });

const HOME = process.env.HOME;
const VAULT_DIR = join(HOME, 'cathedral-vault');
const METRICS_DB = join(HOME, 'nanoclaw', 'vortex_data', 'metrics.db');
const OLLAMA_URL = 'http://localhost:11434';
const EMBED_MODEL = 'nomic-embed-text';

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const PAUL_CHAT_ID = process.env.PAUL_CHAT_ID ? parseInt(process.env.PAUL_CHAT_ID) : null;

const EXCLUDED_DIRS = ['05_Archive_Graveyard', '.obsidian', '.trash'];
const isExcluded = (fp) => EXCLUDED_DIRS.some(d => fp.includes(`/${d}/`));

// Max 1 push per 5 minutes — don't spam
let lastPush = 0;
const PUSH_COOLDOWN = 5 * 60 * 1000;

// Batch rapid changes (e.g. session-closer writing 4 files)
const pendingFiles = new Set();
let processTimer = null;
const PROCESS_DELAY = 15000; // 15s — gives vault-embedder time to embed first

// ── Telegram ────────────────────────────────────────────────────────────────

async function sendTelegram(text) {
  if (!TELEGRAM_TOKEN || !PAUL_CHAT_ID) {
    console.log('[vault-brain] No Telegram config:\n', text);
    return;
  }

  const now = Date.now();
  if (now - lastPush < PUSH_COOLDOWN) {
    console.log('[vault-brain] Cooldown active, skipping push');
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: PAUL_CHAT_ID,
        text: text.slice(0, 4096),
        parse_mode: 'HTML'
      })
    });
    if (res.ok) lastPush = now;
    else console.error('[vault-brain] Telegram error:', res.status);
  } catch (e) {
    console.error('[vault-brain] Telegram send failed:', e.message);
  }
}

// ── Cosine similarity ───────────────────────────────────────────────────────

function cosineSim(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Find cross-domain associations for a file ───────────────────────────────

function findAssociations(filePath, topK = 5) {
  const db = new Database(METRICS_DB, { readonly: true });

  const target = db.prepare(
    'SELECT * FROM vault_embeddings WHERE file_path = ?'
  ).get(filePath);

  if (!target || !target.embedding) {
    db.close();
    return null;
  }

  const targetVec = new Float32Array(
    target.embedding.buffer,
    target.embedding.byteOffset,
    target.embedding.byteLength / 4
  );
  const targetDomain = target.domain;
  const targetTitle = target.title;
  const targetWikilinks = JSON.parse(target.wikilinks || '[]');
  const targetTags = JSON.parse(target.tags || '[]');

  const rows = db.prepare(`
    SELECT file_path, domain, title, tags, wikilinks, embedding
    FROM vault_embeddings
    WHERE file_path != ?
      AND domain NOT IN ('00_Staging', '05_Archive_Graveyard')
  `).all(filePath);
  db.close();

  const scored = rows.map(row => {
    const vec = new Float32Array(
      row.embedding.buffer,
      row.embedding.byteOffset,
      row.embedding.byteLength / 4
    );
    const similarity = cosineSim(targetVec, vec);
    const isCrossDomain = row.domain !== targetDomain;
    const tags = JSON.parse(row.tags || '[]');
    const sharedTags = tags.filter(t => targetTags.includes(t)).length;

    // Already linked via [[wikilinks]]? Less novel
    const alreadyLinked = targetWikilinks.some(wl =>
      row.file_path.toLowerCase().includes(wl.toLowerCase()) ||
      (row.title && row.title.toLowerCase().includes(wl.toLowerCase()))
    );

    // Score: high similarity + cross domain bonus - tag overlap - already linked
    const crossBonus = isCrossDomain ? 0.3 : 0;
    const tagPenalty = Math.min(sharedTags * 0.15, 0.3);
    const linkPenalty = alreadyLinked ? 0.4 : 0;
    const score = similarity + crossBonus - tagPenalty - linkPenalty;

    return {
      filePath: row.file_path,
      domain: row.domain,
      title: row.title,
      similarity,
      isCrossDomain,
      alreadyLinked,
      sharedTags,
      score
    };
  });

  scored.sort((a, b) => b.score - a.score);

  // Only cross-domain, decent similarity, not already linked
  const interesting = scored.filter(s =>
    s.isCrossDomain &&
    s.similarity > 0.60 &&
    !s.alreadyLinked
  ).slice(0, topK);

  return {
    file: filePath,
    title: targetTitle,
    domain: targetDomain,
    associations: interesting
  };
}

// ── Format Telegram message ─────────────────────────────────────────────────

function formatPush(results) {
  if (results.length === 0) return null;

  let text = `<b>VAULT BRAIN</b>\n\n`;

  for (const result of results) {
    const relPath = relative(VAULT_DIR, result.file);
    text += `<b>${result.title}</b>\n`;
    text += `<code>${relPath}</code>\n\n`;

    if (result.associations.length === 0) continue;

    text += `Cross-domain connections:\n`;
    for (const a of result.associations.slice(0, 3)) {
      const sim = (a.similarity * 100).toFixed(0);
      text += `  ${sim}% [${a.domain}] ${a.title}\n`;
    }
    text += '\n';
  }

  return text;
}

// ── Process queued files ────────────────────────────────────────────────────

async function processPending() {
  const files = [...pendingFiles];
  pendingFiles.clear();
  if (files.length === 0) return;

  console.log(`[vault-brain] Processing ${files.length} file(s)...`);

  const results = [];
  for (const fp of files) {
    try {
      const result = findAssociations(fp);
      if (result && result.associations.length > 0) {
        results.push(result);
        console.log(`[vault-brain] "${result.title}" → ${result.associations.length} connections`);
        for (const a of result.associations.slice(0, 3)) {
          console.log(`  ${(a.similarity * 100).toFixed(0)}% [${a.domain}] ${a.title}`);
        }
      } else {
        console.log(`[vault-brain] "${fp}" → no cross-domain connections`);
      }
    } catch (e) {
      console.error(`[vault-brain] Error: ${fp}: ${e.message}`);
    }
  }

  if (results.length > 0) {
    const text = formatPush(results);
    if (text) await sendTelegram(text);
  }
}

// ── Watcher ─────────────────────────────────────────────────────────────────

function startBrainWatcher() {
  const watcher = chokidar.watch(VAULT_DIR, {
    ignoreInitial: true,
    persistent: true,
    depth: 3,
    ignored: /(^|[\/\\])(\.|05_Archive_Graveyard|\.obsidian|\.trash)/,
    awaitWriteFinish: { stabilityThreshold: 5000, pollInterval: 1000 },
    usePolling: false
  });

  async function handleFile(fp) {
    if (isExcluded(fp)) return;
    if (extname(fp) !== '.md') return;

    const rel = relative(VAULT_DIR, fp);
    console.log(`[vault-brain] Detected: ${rel}`);

    try {
      const result = findAssociations(fp);
      if (result && result.associations.length > 0) {
        console.log(`[vault-brain] "${result.title}" → ${result.associations.length} connections`);
        for (const a of result.associations.slice(0, 3)) {
          console.log(`  ${(a.similarity * 100).toFixed(0)}% [${a.domain}] ${a.title}`);
        }
        const text = formatPush([result]);
        if (text) await sendTelegram(text);
      } else {
        console.log(`[vault-brain] "${rel}" → no cross-domain connections`);
      }
    } catch (e) {
      console.error(`[vault-brain] Error: ${rel}: ${e.message}`);
    }
  }

  watcher.on('add', handleFile);
  watcher.on('change', handleFile);

  console.log(`[vault-brain] Watching: ${VAULT_DIR}`);
  console.log(`[vault-brain] Delay: ${PROCESS_DELAY / 1000}s | Cooldown: ${PUSH_COOLDOWN / 60000}min`);
  return watcher;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url)
  || process.argv[1]?.includes('vault-brain');

if (isDirectRun) {
  const args = process.argv.slice(2);

  if (args[0] === 'test' && args[1]) {
    // Test: check associations for a specific file
    const fp = args[1].startsWith('/') ? args[1] : join(VAULT_DIR, args[1]);
    console.log(`[vault-brain] Testing: ${fp}\n`);
    const result = findAssociations(fp);
    if (!result) {
      console.log('No embedding found. Is vault-embedder running?');
    } else if (result.associations.length === 0) {
      console.log(`"${result.title}" [${result.domain}] — no cross-domain connections`);
    } else {
      console.log(`"${result.title}" [${result.domain}]\n`);
      for (const a of result.associations) {
        console.log(`  ${(a.similarity * 100).toFixed(1)}% [${a.domain}] ${a.title}`);
        console.log(`    cross: ${a.isCrossDomain} | linked: ${a.alreadyLinked} | tags: ${a.sharedTags} | score: ${a.score.toFixed(3)}`);
      }
    }
    process.exit(0);
  }

  // Default: run watcher
  console.log('[vault-brain] Starting...');
  startBrainWatcher();
}

export { findAssociations, formatPush, startBrainWatcher };
