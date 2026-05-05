// vectorize-vault.cjs
const fs = require('fs').promises;
const path = require('path');
const lancedb = require('@lancedb/lancedb');

const VAULT_DIR = '/Users/basicclaw777/cathedral-vault/02_Refined_Gold';
const VECTOR_DB_DIR = '/Users/basicclaw777/nanoclaw/cathedral-vectors';

// Recursive function to find all .md files in the vault
async function getMarkdownFiles(dir) {
    let results =[];
    const list = await fs.readdir(dir, { withFileTypes: true });
    for (const file of list) {
        const filePath = path.join(dir, file.name);
        // Skip hidden folders like .obsidian or system files
        if (file.name.startsWith('.')) continue;

        if (file.isDirectory()) {
            results = results.concat(await getMarkdownFiles(filePath));
        } else if (file.name.endsWith('.md')) {
            results.push(filePath);
        }
    }
    return results;
}

// Function to get embeddings from your local Ollama
async function getEmbedding(text) {
    try {
        const response = await fetch('http://localhost:11434/api/embeddings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'nomic-embed-text', prompt: text })
        });
        const data = await response.json();
        return data.embedding;
    } catch (e) {
        console.error("\n❌ Ollama connection error. Is it running?", e.message);
        return null;
    }
}

async function flushBatch(db, records) {
    if ((await db.tableNames()).includes('nuggets')) {
        const table = await db.openTable('nuggets');
        await table.add(records);
    } else {
        await db.createTable('nuggets', records);
    }
}

async function main() {
    console.log('🏛️  INITIALIZING CATHEDRAL VECTOR VAULT...\n');
    console.log(`📁 Source: ${VAULT_DIR}`);
    console.log(`💾 Destination: ${VECTOR_DB_DIR}\n`);

    // Ensure DB directory exists
    await fs.mkdir(VECTOR_DB_DIR, { recursive: true });
    const db = await lancedb.connect(VECTOR_DB_DIR);

    // Drop existing table to rebuild fresh
    const tableNames = await db.tableNames();
    if (tableNames.includes('nuggets')) {
        await db.dropTable('nuggets');
        console.log('🧹 Cleared old vector table. Rebuilding from scratch...\n');
    }

    // Scan the refined gold directory
    const mdFiles = await getMarkdownFiles(VAULT_DIR);
    console.log(`📂 Found ${mdFiles.length} nugget files. Starting embeddings...\n`);

    let records = [];
    let totalNuggetsFound = 0;
    let totalEmbedded = 0;
    let batchCount = 0;
    let failedEmbeddings = 0;

    for (const filePath of mdFiles) {
        const fileName = path.basename(filePath);
        const content = await fs.readFile(filePath, 'utf8');

        // Split by "**" to isolate specific nuggets, or fallback to paragraphs
        let chunks = content.split(/\n\*\*/).filter(c => c.trim().length > 20);
        if (chunks.length <= 1) chunks = content.split('\n\n').filter(c => c.trim().length > 20);

        for (let chunk of chunks) {
            chunk = chunk.replace(/^\*\*/, '').trim();
            if (!chunk) continue;

            totalNuggetsFound++;
            process.stdout.write(`\r🧠 Embedding nugget ${totalNuggetsFound} | Saved: ${totalEmbedded} | Batches flushed: ${batchCount}   `);

            const vector = await getEmbedding(chunk);
            if (vector) {
                records.push({ vector, text: chunk, source_file: fileName, file_path: filePath });
                totalEmbedded++;
            } else {
                failedEmbeddings++;
            }

            // Save in batches of 50
            if (records.length >= 50) {
                await flushBatch(db, records);
                batchCount++;
                records = [];
                process.stdout.write(`\r✅ Batch ${batchCount} saved (${totalEmbedded} total embedded)                   \n`);
            }
        }
    }

    // Flush any remaining records
    if (records.length > 0) {
        await flushBatch(db, records);
        batchCount++;
        console.log(`\n✅ Final batch saved (${records.length} records)`);
    }

    console.log(`\n\n📊 SUMMARY`);
    console.log(`==========`);
    console.log(`📂 Files scanned:       ${mdFiles.length}`);
    console.log(`🧩 Nuggets found:       ${totalNuggetsFound}`);
    console.log(`💾 Embeddings saved:    ${totalEmbedded}`);
    console.log(`❌ Failed embeddings:   ${failedEmbeddings}`);
    console.log(`📦 Batches flushed:     ${batchCount}`);
    console.log(`🗄️  Vector DB:           ${VECTOR_DB_DIR}`);
    console.log('\n🏛️  Cathedral vectors ready.\n');
}

main().catch(console.error);
