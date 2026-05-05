// vortex-ready-harvester.cjs - CLEAN WORKING VERSION
const fs = require('fs').promises;
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');

// Configuration
const CONFIG = {
    chatsDir: '/Users/basicclaw777/raw-chats',
    vaultDir: '/Users/basicclaw777/cathedral-vault/02_Refined_Gold',
    dbPath: '/Users/basicclaw777/nanoclaw/vortex_data/metrics.db',
    keywordsPath: '/Users/basicclaw777/nanoclaw/vortex_data/philosophical_keywords.json',
    manifestPath: '/Users/basicclaw777/nanoclaw/vortex_data/processed-files.json',
    failureDir: '/Users/basicclaw777/nanoclaw/vortex_data/failure_samples'
};

// Depth threshold (15% as recommended by Analyst)
const MIN_DEPTH_THRESHOLD = 0.05;

// Load keywords
let PHILOSOPHICAL_KEYWORDS = [];

async function loadKeywords() {
    try {
        const data = await fs.readFile(CONFIG.keywordsPath, 'utf8');
        const keywordObj = JSON.parse(data);
        PHILOSOPHICAL_KEYWORDS = [
            ...(keywordObj.keywords || []),
            ...(keywordObj.nuggetTriggers || [])
        ];
        console.log(`📚 Loaded ${PHILOSOPHICAL_KEYWORDS.length} philosophical keywords`);
    } catch (err) {
        console.error('Error loading keywords:', err);
        PHILOSOPHICAL_KEYWORDS = ['truth', 'fear', 'wisdom'];
    }
}

function calculateHash(text) {
    return crypto.createHash('sha256').update(text).digest('hex').substring(0, 16);
}

async function loadManifest() {
    try {
        const data = await fs.readFile(CONFIG.manifestPath, 'utf8');
        return JSON.parse(data);
    } catch {
        return { files: {} };
    }
}

async function saveManifest(manifest) {
    await fs.writeFile(CONFIG.manifestPath, JSON.stringify(manifest, null, 2));
}

function fileNeedsProcessing(filePath, manifest, force = false) {
    if (force) return true;
    if (!manifest || !manifest.files) return true;
    const fileName = path.basename(filePath);
    const fileData = manifest.files[fileName];
    if (!fileData) return true;
    try {
        const stats = fs.statSync(filePath);
        return stats.mtimeMs > fileData.mtime;
    } catch {
        return true;
    }
}

async function getAllFiles(dir) {
    let files = [];
    const items = await fs.readdir(dir, { withFileTypes: true });
    for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
            const subFiles = await getAllFiles(fullPath);
            files = files.concat(subFiles);
        } else if (item.name.endsWith('.txt') || item.name.endsWith('.md')) {
            files.push(fullPath);
        }
    }
    return files;
}

function calculateDepth(text, keywords) {
    if (!text || text.length === 0) return 0;
    const lowerText = text.toLowerCase();

    let matches = 0;
    for (const term of keywords) {
        if (lowerText.includes(term.toLowerCase())) matches++;
    }

    // Score: 5% per match, max 100%
    return Math.min(100, matches * 5);
}

async function processChatFile(filePath, db) {
    const fileName = path.basename(filePath);
    const folderName = path.basename(path.dirname(filePath));
    
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim().length > 0);
        
        const nuggets = [];
        for (const line of lines) {
            const depth = calculateDepth(line, PHILOSOPHICAL_KEYWORDS);
            if (depth > 0) {
                nuggets.push({
                    text: line,
                    depth,
                    hash: calculateHash(line)
                });
            }
        }
        
        const depthScore = nuggets.length > 0 
            ? Math.round(nuggets.reduce((sum, n) => sum + n.depth, 0) / nuggets.length)
            : 0;
        
        if (depthScore < 50 && nuggets.length > 0) {
            const failureSample = {
                file: fileName,
                folder: folderName,
                timestamp: new Date().toISOString(),
                snippet: content.substring(0, 300),
                depthScore,
                nuggetCount: nuggets.length
            };
            const failurePath = path.join(CONFIG.failureDir, `${fileName.replace(/[^a-z0-9]/gi, '_').substring(0, 100)}_${Date.now()}.json`);
            await fs.writeFile(failurePath, JSON.stringify(failureSample, null, 2));
        }
        
        let saved = false;
        if (nuggets.length > 0) {
            if (depthScore >= MIN_DEPTH_THRESHOLD * 100) {
                const outputFile = path.join(CONFIG.vaultDir, `${path.basename(fileName, path.extname(fileName))}_gold.md`);
                let outputText = `---\n`;
                outputText += `source: ${fileName}\n`;
                outputText += `folder: ${folderName}\n`;
                outputText += `depth: ${depthScore}%\n`;
                outputText += `nuggets: ${nuggets.length}\n`;
                outputText += `tags: [${folderName}]\n`;
                outputText += `---\n\n`;
                
                nuggets.forEach((nugget, i) => {
                    outputText += `## Nugget ${i+1} (depth: ${nugget.depth}%)\n`;
                    outputText += `${nugget.text}\n\n`;
                });
                
                await fs.writeFile(outputFile, outputText);
                saved = true;
                console.log(`✅ Saved ${nuggets.length} nuggets from ${fileName} (depth: ${depthScore}%)`);
            } else {
                console.log(`⏭️  Skipping ${fileName} (depth: ${depthScore}% < ${MIN_DEPTH_THRESHOLD*100}% threshold)`);
            }
        } else {
            console.log(`📝 No nuggets found in ${fileName}`);
        }
        
        return { 
            success: saved, 
            skipped: !saved && nuggets.length > 0, 
            nuggets: nuggets.length, 
            depthScore,
            fileName,
            folder: folderName
        };
        
    } catch (err) {
        console.error(`❌ Error processing ${fileName}:`, err.message);
        return { success: false, skipped: false, nuggets: 0, depthScore: 0, fileName, folder: folderName };
    }
}

async function main() {
    console.log('\n🏛️  VORTEX-READY HARVESTER');
    console.log('========================\n');
    
    await loadKeywords();
    const forceReprocess = process.argv.includes('--force');
    const manifest = await loadManifest();
    console.log(`📋 Manifest: ${Object.keys(manifest.files || {}).length} files previously processed\n`);
    
    await fs.mkdir(CONFIG.vaultDir, { recursive: true });
    await fs.mkdir(CONFIG.failureDir, { recursive: true });
    
    const db = new sqlite3.Database(CONFIG.dbPath);
    
    db.exec(`
        CREATE TABLE IF NOT EXISTS extractions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_name TEXT,
            folder TEXT,
            nugget_count INTEGER,
            depth_score INTEGER,
            saved INTEGER,
            timestamp INTEGER
        )
    `);
    
    try {
        const txtFiles = await getAllFiles(CONFIG.chatsDir);
        console.log(`📁 Found ${txtFiles.length} chat files to process\n`);
        
        const results = [];
        let skippedUnchanged = 0;
        
        for (const file of txtFiles) {
            const fileName = path.basename(file);
            
            if (!fileNeedsProcessing(file, manifest, forceReprocess)) {
                console.log(`⏭️  Skipping (unchanged): ${fileName}`);
                skippedUnchanged++;
                continue;
            }
            
            console.log(`Processing ${fileName}...`);
            const result = await processChatFile(file, db);
            results.push(result);
            
            if (!manifest.files) manifest.files = {};
            const stats = await fs.stat(file);
            manifest.files[fileName] = {
                processedAt: new Date().toISOString(),
                nuggetCount: result.nuggets || 0,
                depthScore: result.depthScore || 0,
                mtime: stats.mtimeMs,
                size: stats.size
            };
            
            const stmt = db.prepare(`
                INSERT INTO extractions (file_name, folder, nugget_count, depth_score, saved, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            stmt.run(result.fileName, result.folder, result.nuggets, result.depthScore, result.success ? 1 : 0, Date.now());
        }
        
        await saveManifest(manifest);
        
        const totalNuggets = results.reduce((sum, r) => sum + (r.nuggets || 0), 0);
        const savedNuggets = results.filter(r => r && r.success === true).reduce((sum, r) => sum + (r.nuggets || 0), 0);
        const successCount = results.filter(r => r && r.success === true).length;
        const skippedDueToThreshold = results.filter(r => r && r.skipped === true).length;

        console.log(`\n📊 SUMMARY`);
        console.log(`==========`);
        console.log(`✅ Successfully saved: ${successCount} files`);
        console.log(`⏭️  Skipped (unchanged): ${skippedUnchanged} files`);
        console.log(`⏭️  Skipped (below threshold): ${skippedDueToThreshold} files`);
        console.log(`💎 New nuggets saved this run: ${savedNuggets}`);
        console.log(`📦 Total nuggets detected this run: ${totalNuggets}`);
        
    } catch (err) {
        console.error('Error in main:', err);
    } finally {
        db.serialize(() => {
            db.close((err) => {
                if (err) console.error('DB close error:', err.message);
            });
        });
    }
}

if (require.main === module) {
    main().catch(console.error);
}
