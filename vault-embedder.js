// ~/nanoclaw/vault-embedder.js
// Session 1: Embedding Layer
// Scans cathedral-vault/, embeds all .md nuggets via nomic-embed-text,
// stores in SQLite vault_embeddings table, watches for changes.

import Database from 'better-sqlite3';
import chokidar from 'chokidar';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, basename, extname } from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const HOME = process.env.HOME;
const VAULT_DIR = join(HOME, 'cathedral-vault');
const DB_PATH = join(HOME, 'nanoclaw', 'vortex_data', 'metrics.db');
const OLLAMA_URL = 'http://localhost:11434';
const EMBED_MODEL = 'nomic-embed-text';
const EMBED_CHUNK = 4000; // chars sent to model

// Directories excluded from embedding (contamination quarantine, etc.)
const EXCLUDED_DIRS = ['05_Archive_Graveyard'];
const isExcluded = (fp) => EXCLUDED_DIRS.some(d => fp.includes(`/${d}/`));

// ── Database ──────────────────────────────────────────────────────────────────

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS vault_embeddings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path    TEXT UNIQUE,
    domain       TEXT,
    tags         TEXT,
    title        TEXT,
    first_line   TEXT,
    wikilinks    TEXT,
    content_hash TEXT,
    embedding    BLOB,
    created_at   INTEGER
  )
`);

// ── Nugget parser ─────────────────────────────────────────────────────────────

function parseNugget(filePath, content) {
  const relPath = relative(VAULT_DIR, filePath);
  const dirPart = relPath.split('/')[0] || '';

  let title = basename(filePath, '.md');
  let domain = dirPart;
  let tags = [];
  let firstLine = '';
  let wikilinks = [];

  // Extract [[wikilinks]]
  for (const m of content.matchAll(/\[\[([^\]]+)\]\]/g)) {
    wikilinks.push(m[1].split('|')[0].trim());
  }

  // Parse YAML frontmatter
  let bodyStart = 0;
  if (content.startsWith('---')) {
    const end = content.indexOf('\n---', 3);
    if (end !== -1) {
      const fm = content.slice(3, end);
      bodyStart = end + 4;

      const folderMatch = fm.match(/^folder:\s*(.+)$/m);
      if (folderMatch) domain = folderMatch[1].trim();

      // tags: [a, b] or tags:\n  - a\n  - b
      const inlineTags = fm.match(/^tags:\s*\[(.+)\]/m);
      if (inlineTags) {
        tags = inlineTags[1].split(',').map(t => t.trim().replace(/['"]/g, ''));
      } else {
        for (const m of fm.matchAll(/^  - (.+)$/mg)) {
          tags.push(m[1].trim());
        }
      }
    }
  }

  const body = content.slice(bodyStart);
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);

  // Title from first # heading
  const heading = lines.find(l => l.startsWith('# '));
  if (heading) title = heading.slice(2).trim();

  // Inline #tags from early lines
  for (const line of lines.slice(0, 8)) {
    for (const m of line.matchAll(/#([a-zA-Z][\w-]*)/g)) {
      tags.push(m[1]);
    }
  }

  // First meaningful content line
  firstLine = lines.find(l =>
    !l.startsWith('#') &&
    !l.match(/^#[a-zA-Z]/) &&
    !l.startsWith('*Extracted') &&
    l.length > 10
  ) || '';
  if (firstLine.length > 200) firstLine = firstLine.slice(0, 200);

  tags = [...new Set(tags)];
  wikilinks = [...new Set(wikilinks)];

  return { title, domain, tags, firstLine, wikilinks };
}

// ── Ollama embedding ──────────────────────────────────────────────────────────

async function getEmbedding(text) {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text })
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${res.statusText}`);
  const data = await res.json();
  if (!data.embedding) throw new Error('No embedding in response');
  return data.embedding; // number[]
}

function embeddingToBlob(embedding) {
  return Buffer.from(new Float32Array(embedding).buffer);
}

function blobToEmbedding(blob) {
  // blob is a Buffer from better-sqlite3; may be a pooled slice
  return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
}

// ── Single-file embedder ──────────────────────────────────────────────────────

const stmtGet = db.prepare('SELECT content_hash FROM vault_embeddings WHERE file_path = ?');
const stmtUpsert = db.prepare(`
  INSERT INTO vault_embeddings
    (file_path, domain, tags, title, first_line, wikilinks, content_hash, embedding, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(file_path) DO UPDATE SET
    domain=excluded.domain, tags=excluded.tags, title=excluded.title,
    first_line=excluded.first_line, wikilinks=excluded.wikilinks,
    content_hash=excluded.content_hash, embedding=excluded.embedding,
    created_at=excluded.created_at
`);

async function embedFile(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const hash = createHash('sha256').update(content).digest('hex');

  const existing = stmtGet.get(filePath);
  if (existing && existing.content_hash === hash) return { skipped: true };

  const { title, domain, tags, firstLine, wikilinks } = parseNugget(filePath, content);

  const embedText = `${title}\n${content.slice(0, EMBED_CHUNK)}`;
  const embedding = await getEmbedding(embedText);

  stmtUpsert.run(
    filePath,
    domain,
    JSON.stringify(tags),
    title,
    firstLine,
    JSON.stringify(wikilinks),
    hash,
    embeddingToBlob(embedding),
    Date.now()
  );

  return { skipped: false, title };
}

// ── Walk vault ────────────────────────────────────────────────────────────────

function findMdFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    if (EXCLUDED_DIRS.includes(entry)) continue;
    const full = join(dir, entry);
    try {
      if (statSync(full).isDirectory()) {
        files.push(...findMdFiles(full));
      } else if (extname(full) === '.md') {
        files.push(full);
      }
    } catch { /* skip unreadable */ }
  }
  return files;
}

// ── Public: embed all nuggets ─────────────────────────────────────────────────

export async function embedAllNuggets(onProgress) {
  const files = findMdFiles(VAULT_DIR);
  let embedded = 0, skipped = 0, errors = 0;

  for (const file of files) {
    try {
      const result = await embedFile(file);
      if (result.skipped) {
        skipped++;
      } else {
        embedded++;
      }
      if (onProgress) onProgress({ embedded, skipped, errors, total: files.length, title: result.title });
    } catch (err) {
      errors++;
      console.error(`Embed error [${file}]: ${err.message}`);
    }
  }

  return { embedded, skipped, errors, total: files.length };
}

// ── Public: semantic search ───────────────────────────────────────────────────

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export async function semanticSearch(query, topK = 5, domainFilter = null) {
  const queryVec = await getEmbedding(query);

  const rows = domainFilter
    ? db.prepare('SELECT * FROM vault_embeddings WHERE domain = ?').all(domainFilter)
    : db.prepare('SELECT * FROM vault_embeddings').all();

  if (rows.length === 0) return [];

  const scored = rows.map(row => {
    const rowVec = blobToEmbedding(row.embedding);
    const score = cosineSimilarity(queryVec, rowVec);
    return {
      ...row,
      score,
      tags: JSON.parse(row.tags || '[]'),
      wikilinks: JSON.parse(row.wikilinks || '[]')
    };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}

// ── Public: file watcher ──────────────────────────────────────────────────────

const stmtDelete = db.prepare('DELETE FROM vault_embeddings WHERE file_path = ?');

export function startFileWatcher() {
  const watcher = chokidar.watch(`${VAULT_DIR}/**/*.md`, {
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 500 }
  });

  watcher.on('add', async (fp) => {
    if (isExcluded(fp)) { console.log(`Vault skip (excluded): ${fp}`); return; }
    console.log(`Vault +add: ${fp}`);
    await embedFile(fp).catch(e => console.error('Embed error:', e.message));
  });

  watcher.on('change', async (fp) => {
    if (isExcluded(fp)) return;
    console.log(`Vault ~change: ${fp}`);
    await embedFile(fp).catch(e => console.error('Embed error:', e.message));
  });

  watcher.on('unlink', (fp) => {
    stmtDelete.run(fp);
    console.log(`Vault -remove: ${fp}`);
  });

  console.log(`Vault watcher active: ${VAULT_DIR}`);
  return watcher;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export function getEmbeddingStats() {
  const total = db.prepare('SELECT COUNT(*) as n FROM vault_embeddings').get().n;
  const domains = db.prepare(
    'SELECT domain, COUNT(*) as n FROM vault_embeddings GROUP BY domain ORDER BY n DESC'
  ).all();
  return { total, domains };
}

// ── CLI entrypoint ────────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);

  if (args[0] === 'search') {
    const query = args.slice(1).join(' ');
    if (!query) { console.error('Usage: vault-embedder.js search <query>'); process.exit(1); }
    console.log(`Searching: "${query}"\n`);
    semanticSearch(query, 5).then(results => {
      if (results.length === 0) { console.log('No results.'); return; }
      results.forEach((r, i) => {
        console.log(`${i + 1}. [${(r.score * 100).toFixed(1)}%] ${r.title} (${r.domain})`);
        if (r.first_line) console.log(`   ${r.first_line.slice(0, 120)}`);
      });
    }).catch(e => { console.error(e.message); process.exit(1); });

  } else {
    // Default: embed all
    console.log(`Embedding vault: ${VAULT_DIR}`);
    console.log(`Database: ${DB_PATH}\n`);

    embedAllNuggets(({ embedded, skipped, errors, total, title }) => {
      process.stdout.write(
        `\r[${embedded + skipped + errors}/${total}] ` +
        `embedded:${embedded} skipped:${skipped} errors:${errors}` +
        (title ? `  — ${title.slice(0, 40)}` : '')
      );
    }).then(r => {
      console.log(`\n\nComplete. Embedded: ${r.embedded} | Skipped: ${r.skipped} | Errors: ${r.errors}`);
      const stats = getEmbeddingStats();
      console.log(`\nVault index: ${stats.total} nuggets`);
      stats.domains.forEach(d => console.log(`  ${d.domain || '(root)'}: ${d.n}`));
      process.exit(0);
    }).catch(e => { console.error('\nFatal:', e.message); process.exit(1); });
  }
}
