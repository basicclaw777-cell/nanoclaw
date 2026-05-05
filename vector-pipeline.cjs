#!/usr/bin/env node

// ============================================================
// CATHEDRAL VECTOR PIPELINE
// Reads vault nuggets → Ollama embeddings → LanceDB
// 100% local. Zero cost. Semantic search across all wisdom.
// ============================================================

const fs = require('fs');
const path = require('path');
const http = require('http');

const VAULT_DIR = path.join(process.env.HOME, 'cathedral-vault/02_Refined_Gold');
const DB_PATH = path.join(process.env.HOME, 'nanoclaw/cathedral-vectors');
const EMBED_MODEL = 'nomic-embed-text';
const OLLAMA_PORT = 11434;

// ============================================================
// OLLAMA EMBEDDING
// ============================================================

function getEmbedding(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: EMBED_MODEL, prompt: text });
    const req = http.request({
      hostname: 'localhost',
      port: OLLAMA_PORT,
      path: '/api/embeddings',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.embedding || []);
        } catch (e) {
          reject(new Error(`Embedding parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Embedding timeout')); });
    req.write(body);
    req.end();
  });
}

// ============================================================
// PARSE VAULT FILES — extract individual nuggets
// ============================================================

function parseVaultFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath, '.md');
  const nuggets = [];

  // Extract domain tags from first lines
  const lines = content.split('\n');
  const domainLine = lines.find(l => l.startsWith('#') && !l.startsWith('##')) || '';
  const tags = lines.slice(0, 5).join(' ').match(/#[\w-]+/g) || [];

  // Extract summary
  const summaryMatch = content.match(/## Summary\n([\s\S]*?)(?=\n##|\n---|\n$)/);
  const summary = summaryMatch ? summaryMatch[1].trim() : '';

  // Extract individual nuggets
  const nuggetMatches = content.matchAll(/### (.+?) \*\(weight: (\d+)\)\*\n([\s\S]*?)(?=###|## Keywords|## Patterns|## Open|$)/g);
  
  for (const match of nuggetMatches) {
    const title = match[1].trim();
    const weight = parseInt(match[2]);
    const body = match[3].trim();
    
    // Extract domain and source from body
    const domainMatch = body.match(/\*Domain: (\w+)/);
    const sourceMatch = body.match(/Source: ([^|*\n]+)/);
    const tagsMatch = body.match(/Tags: (.+)/);
    
    // Get just the content line (first line before metadata)
    const contentLines = body.split('\n').filter(l => l && !l.startsWith('*') && !l.startsWith('Tags:'));
    const content_text = contentLines[0] || '';

    if (content_text && weight >= 4) { // Only store weight 4+ nuggets
      nuggets.push({
        id: `${fileName}_${nuggets.length}`,
        title,
        content: content_text,
        weight,
        domain: domainMatch ? domainMatch[1] : 'general',
        source_file: fileName,
        tags: tagsMatch ? tagsMatch[1] : '',
        summary_context: summary.substring(0, 200)
      });
    }
  }

  // If no structured nuggets found but has summary, store as single entry
  if (nuggets.length === 0 && summary.length > 50) {
    nuggets.push({
      id: `${fileName}_summary`,
      title: fileName,
      content: summary,
      weight: 5,
      domain: tags[0] ? tags[0].replace('#', '') : 'general',
      source_file: fileName,
      tags: tags.join(', '),
      summary_context: summary.substring(0, 200)
    });
  }

  return nuggets;
}

// ============================================================
// SEARCH FUNCTION — query the vector DB
// ============================================================

async function search(db, query, limit = 10) {
  console.log(`\n🔍 Searching for: "${query}"\n`);
  
  const queryEmbedding = await getEmbedding(query);
  const tableNames = await db.tableNames();
  if (!tableNames.includes('nuggets')) {
    console.log('❌ No vectors found. Run without arguments first to build the index.\n');
    return [];
  }
  const table = await db.openTable('nuggets');
  
  const results = await table.vectorSearch(queryEmbedding)
    .limit(limit)
    .toArray();

  console.log(`Top ${results.length} results:\n`);
  results.forEach((r, i) => {
    console.log(`${i + 1}. [${r.domain}] ${r.title} (weight: ${r.weight})`);
    console.log(`   ${r.content.substring(0, 120)}...`);
    console.log(`   Source: ${r.source_file}\n`);
  });

  return results;
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  const isSearch = args[0] === 'search';
  const searchQuery = args.slice(1).join(' ');

  console.log('\n🏛️  CATHEDRAL VECTOR PIPELINE');
  console.log('================================');
  console.log('🔒 100% local — Ollama + LanceDB\n');

  // Dynamic import for ES module
  const { connect } = await import('@lancedb/lancedb');

  // Connect to or create the vector DB
  const db = await connect(DB_PATH);

  // If search mode — just query existing DB
  if (isSearch && searchQuery) {
    try {
      await search(db, searchQuery);
    } catch (e) {
      console.log('❌ No vectors found. Run without arguments first to build the index.\n');
    }
    return;
  }

  // BUILD MODE — vectorize the vault
  console.log('📚 Building vector index from vault...\n');

  // Check Ollama has nomic-embed-text
  try {
    const testEmbed = await getEmbedding('test');
    if (!testEmbed.length) throw new Error('Empty embedding');
    console.log(`✅ Ollama embedding model ready (${testEmbed.length} dimensions)\n`);
  } catch (e) {
    console.log('❌ Could not get embeddings from Ollama.');
    console.log('   Make sure nomic-embed-text is available:');
    console.log('   ollama pull nomic-embed-text\n');
    process.exit(1);
  }

  // Read all vault files
  if (!fs.existsSync(VAULT_DIR)) {
    console.log(`❌ Vault directory not found: ${VAULT_DIR}\n`);
    process.exit(1);
  }

  const vaultFiles = fs.readdirSync(VAULT_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(VAULT_DIR, f));

  console.log(`📁 Found ${vaultFiles.length} vault files\n`);

  // Parse all nuggets
  let allNuggets = [];
  for (const file of vaultFiles) {
    try {
      const nuggets = parseVaultFile(file);
      allNuggets = allNuggets.concat(nuggets);
    } catch (e) {
      // Skip unreadable files silently
    }
  }

  console.log(`💎 Parsed ${allNuggets.length} nuggets (weight 4+)\n`);
  console.log('🧠 Generating embeddings — this takes a few minutes...\n');

  // Generate embeddings in batches
  const records = [];
  let done = 0;
  const batchSize = 10;

  for (let i = 0; i < allNuggets.length; i += batchSize) {
    const batch = allNuggets.slice(i, i + batchSize);
    
    for (const nugget of batch) {
      try {
        // Embed title + content together for richer semantic meaning
        const textToEmbed = `${nugget.title}. ${nugget.content} [domain: ${nugget.domain}]`;
        const embedding = await getEmbedding(textToEmbed);
        
        records.push({
          id: nugget.id,
          title: nugget.title,
          content: nugget.content,
          weight: nugget.weight,
          domain: nugget.domain,
          source_file: nugget.source_file,
          tags: nugget.tags,
          summary_context: nugget.summary_context,
          vector: embedding
        });
        
        done++;
        if (done % 50 === 0) {
          process.stdout.write(`   ${done}/${allNuggets.length} embedded...\r`);
        }
      } catch (e) {
        // Skip failed embeddings
      }
    }
  }

  console.log(`\n✅ Generated ${records.length} embeddings\n`);

  // Store in LanceDB
  console.log('💾 Storing in LanceDB...');
  
  try {
    // Drop existing table if rebuilding
    const tables = await db.tableNames();
    if (tables.includes('nuggets')) {
      await db.dropTable('nuggets');
    }
    
    await db.createTable('nuggets', records);
    console.log(`✅ Vector index built — ${records.length} nuggets stored\n`);
  } catch (e) {
    console.log(`❌ LanceDB error: ${e.message}\n`);
    process.exit(1);
  }

  console.log('📊 SUMMARY');
  console.log('==========');
  console.log(`💎 Nuggets vectorized: ${records.length}`);
  console.log(`📁 Vector DB: ${DB_PATH}`);
  console.log(`🔒 Privacy: 100% local\n`);
  console.log('🔍 To search your vault:');
  console.log('   node ~/nanoclaw/vector-pipeline.cjs search sovereignty and footwork');
  console.log('   node ~/nanoclaw/vector-pipeline.cjs search fear framework boxing philosophy\n');
}

main().catch(e => {
  console.error(`\n❌ Fatal error: ${e.message}\n`);
  process.exit(1);
});
