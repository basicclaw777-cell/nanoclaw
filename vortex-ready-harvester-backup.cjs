// vortex-ready-harvester.cjs
const fs = require('fs').promises;
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');

// Configuration
const CONFIG = {
    chatsDir: '/Users/basicclaw777/raw-chats',
    vaultDir: '/Users/basicclaw777/cathedral-vault/02_Refined_Gold',
    dbPath: '/Users/basicclaw777/nanoclaw/vortex_data/metrics.db',
    keywordsPath: '/Users/basicclaw777/nanoclaw/vortex_data/philosophical_keywords.json'
  manifestPath: path.join(HOME, 'nanoclaw', 'vortex_data', 'processed-files.json'),
};

// Load philosophical keywords
let PHILOSOPHICAL_KEYWORDS = [];
async function loadKeywords() {
    try {
        const data = await fs.readFile(CONFIG.keywordsPath, 'utf8');
        const keywordObj = JSON.parse(data);
        PHILOSOPHICAL_KEYWORDS = [
            ...( keywordObj.keywords || []),
            
            
            ...(keywordObj.nuggetTriggers || [])
        ];
    } catch (err) {
        console.error('Error loading keywords:', err);
        PHILOSOPHICAL_KEYWORDS = ['truth', 'fear', 'wisdom']; // Fallback
    }
}

// Calculate hash for deduplication - FIXED: substr -> substring
function calculateHash(text) {
    return crypto.createHash('sha256').update(text).digest('hex').substring(0, 16);
}


// Load manifest of already-processed files
function loadManifest() {
  try {
    if (fs.existsSync(CONFIG.manifestPath)) {
      return JSON.parse(fs.readFileSync(CONFIG.manifestPath, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading manifest:', err.message);
  }
  return {};
}

// Save manifest after processing
function saveManifest(manifest) {
  try {
    fs.writeFileSync(CONFIG.manifestPath, JSON.stringify(manifest, null, 2));
  } catch (err) {
    console.error('Error saving manifest:', err.message);
  }
}

// Check if file needs processing (new or modified)
function needsProcessing(filePath, manifest, forceReprocess) {
  if (forceReprocess) return true;
  const key = path.relative(path.join(HOME, 'raw-chats'), filePath);
  const entry = manifest[key];
  if (!entry) return true; // Never processed
  try {
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const fileMtime = stat.mtimeMs;
    // Reprocess if file size or modification time changed
    if (entry.fileSize !== fileSize || entry.fileMtime !== fileMtime) return true;
    return false; // Already processed, unchanged
  } catch {
    return true;
  }
}

// Update manifest entry after processing
function updateManifest(manifest, filePath, nuggetCount, depthScore) {
  const key = path.relative(path.join(HOME, 'raw-chats'), filePath);
  try {
    const stat = fs.statSync(filePath);
    manifest[key] = {
      processedAt: new Date().toISOString(),
      nuggetCount,
      depthScore,
      fileSize: stat.size,
      fileMtime: stat.mtimeMs
    };
  } catch (err) {
    console.error('Error updating manifest for', key, err.message);
  }
}

// Calculate philosophical depth score (0-100)
function calculateDepthScore(text, keywords) {
    if (!text) return 0;
    const lowerText = text.toLowerCase();
    const matches = keywords.filter(k => lowerText.includes(k.toLowerCase()));
    // Normalize: more than 5 keywords = 100%, scale accordingly
    return Math.min(100, Math.round((matches.length / 5) * 100));
}

// Extract nuggets - IMPROVED version that actually extracts something
async function extractNuggets(chatText) {
    const nuggets = [];
    const lines = chatText.split('\n').filter(l => l.trim());
    
    // Look for meaningful content
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Skip empty lines and timestamps
        if (!line || line.match(/^\d{2}:\d{2}/)) continue;
        
        // Look for potential nuggets (sentences with substance)
        if (line.length > 40 && 
            (line.includes('?') || line.includes('!') || 
             line.match(/truth|fear|wisdom|meaning|purpose|reality/i))) {
            
            nuggets.push({
                category: line.match(/truth|fear|wisdom/i) ? 'Philosophical Insight' : 'Discussion Point',
                title: line.substring(0, 40) + '...',
                content: line,
                tags: []
            });
        }
    }
    
    return nuggets;
}

// Log attempt to database
async function logAttempt(db, data) {
    return new Promise((resolve, reject) => {
        db.run(`
            INSERT INTO extraction_attempts (
                chat_file, input_hash, output_hash, prompt_version,
                model_used, tokens_used, cost_usd, nugget_count,
                philosophical_depth_score, error_flag, error_message,
                latency_ms, source_text_sample
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            data.chat_file,
            data.input_hash,
            data.output_hash,
            data.prompt_version || 'v1.2',
            data.model_used || 'llama3.1',
            data.tokens_used || 0,
            data.cost_usd || 0,
            data.nugget_count || 0,
            data.philosophical_depth_score || 0,
            data.error_flag ? 1 : 0,
            data.error_message || null,
            data.latency_ms || 0,
            data.source_sample || ''
        ], function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
        });
    });
}

// Log failure sample
async function logFailure(db, attemptId, failure) {
    return new Promise((resolve, reject) => {
        db.run(`
            INSERT INTO failure_samples (
                attempt_id, chat_snippet, expected_pattern,
                actual_output, failure_type
            ) VALUES (?, ?, ?, ?, ?)
        `, [
            attemptId,
            failure.snippet,
            failure.expected,
            failure.actual,
            failure.type
        ], function(err) {
            if (err) reject(err);
            else resolve();
        });
    });
}

// Main processing function
async function processChatFile(filePath, db) {
    const startTime = Date.now();
    const fileName = path.basename(filePath);
    
    try {
        // Read chat file
        const chatText = await fs.readFile(filePath, 'utf8');
        const inputHash = calculateHash(chatText);
        
        // Extract nuggets
        const nuggets = await extractNuggets(chatText);
        const outputText = JSON.stringify(nuggets, null, 2);
        const outputHash = calculateHash(outputText);
        
        // Calculate philosophical depth
        const depthScore = calculateDepthScore(outputText, PHILOSOPHICAL_KEYWORDS);
        
        // Log the attempt
        const attemptId = await logAttempt(db, {
            chat_file: fileName,
            input_hash: inputHash,
            output_hash: outputHash,
            prompt_version: 'v1.2',
            model_used: 'llama3.1',
            nugget_count: nuggets.length,
            philosophical_depth_score: depthScore,
            latency_ms: Date.now() - startTime,
            source_sample: chatText.substring(0, 200)
        });
        
        // Check if this was a philosophical miss (depth < 50 AND nuggets exist)
        if (depthScore < 50 && nuggets.length > 0) {
            await logFailure(db, attemptId, {
                snippet: chatText.substring(0, 300),
                expected: 'Philosophical insight expected',
                actual: outputText,
                type: 'philosophical_miss'
            });
            console.log(`⚠️  Philosophical miss detected in ${fileName} (depth: ${depthScore}%)`);
        }
        
        // Save to vault if nuggets found
        if (nuggets.length > 0) {
            const outputFile = path.join(CONFIG.vaultDir, `${path.basename(fileName, '.txt')}_gold.md`);
            await fs.writeFile(outputFile, outputText);
            console.log(`✅ Saved ${nuggets.length} nuggets from ${fileName} (depth: ${depthScore}%)`);
        } else {
            console.log(`📝 No nuggets found in ${fileName}`);
        }
        
        return { success: true, nuggets: nuggets.length, depthScore };
        
    } catch (err) {
        console.error(`❌ Error processing ${fileName}:`, err.message);
        
        // Log the error
        await logAttempt(db, {
            chat_file: fileName,
            input_hash: '',
            output_hash: '',
            error_flag: true,
            error_message: err.message,
            latency_ms: Date.now() - startTime
        });
        
        return { success: false, error: err.message };
    }
}

// Main function
async function main() {
    console.log('🏛️  VORTEX-READY HARVESTER');
    console.log('========================\n');
    
    // Load keywords
    await loadKeywords();
    console.log(`📚 Loaded ${PHILOSOPHICAL_KEYWORDS.length} philosophical keywords\n`);
    
    // Open database
    const db = new sqlite3.Database(CONFIG.dbPath);
    
    try {
        // Get all chat files
const getAllFiles = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await getAllFiles(full);
      files.push(...sub);
    } else if (entry.name.endsWith('.txt') || entry.name.endsWith('.md')) {
      files.push(full);
    }
  }
  return files;
};
const txtFiles = await getAllFiles(CONFIG.chatsDir);        
        console.log(`📁 Found ${txtFiles.length} chat files to process\n`);
        
        // Process each file
        const results = [];
        for (const file of txtFiles) {
            console.log(`Processing ${file}...`);
const result = await processChatFile(file, db);            results.push(result);
        }
        
        // Summary
        console.log('\n📊 SUMMARY');
        console.log('==========');
        const successful = results.filter(r => r.success).length;
        const totalNuggets = results.reduce((sum, r) => sum + (r.nuggets || 0), 0);
        const validDepthScores = results.filter(r => r.depthScore !== undefined && r.success);
        const avgDepth = validDepthScores.length > 0 
            ? validDepthScores.reduce((sum, r) => sum + r.depthScore, 0) / validDepthScores.length 
            : 0;
        
        console.log(`✅ Processed: ${successful}/${txtFiles.length} files`);
        console.log(`💎 Nuggets extracted: ${totalNuggets}`);
        console.log(`📈 Avg philosophical depth: ${Math.round(avgDepth)}%`);
        
        // Check if we have enough failures for refinement
        db.get(`SELECT COUNT(*) as count FROM failure_samples`, (err, row) => {
            if (err) {
                console.error('Error checking failures:', err);
            } else {
                const failures = row ? row.count : 0;
                console.log(`🔍 Failure samples collected: ${failures}`);
                if (failures >= 3) {
                    console.log('\n🎯 READY FOR PHASE 2: You have enough failure samples for the Analyst!');
                }
            }
        });
        
    } finally {
        // Give time for the final query to complete
        setTimeout(() => db.close(), 100);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}
