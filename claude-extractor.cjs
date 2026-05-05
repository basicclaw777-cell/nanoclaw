#!/usr/bin/env node

// ============================================================
// CATHEDRAL CLAUDE EXTRACTOR
// Reads raw chat files → Claude extracts nuggets → Obsidian
// ============================================================

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const OPENROUTER_KEY = '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';
const VAULT_OUTPUT = path.join(process.env.HOME, 'cathedral-vault/02_Refined_Gold');
const RAW_CHATS_DIR = path.join(process.env.HOME, 'raw-chats');
const MANIFEST_FILE = path.join(process.env.HOME, 'nanoclaw/claude-extractor-manifest.json');
const MIN_FILE_SIZE = 200; // bytes — skip tiny/empty files

// ============================================================
// EXTRACTION PROMPT
// ============================================================

const EXTRACTION_PROMPT = `You are a knowledge extraction engine for The Cathedral — Paul's sovereign intelligence architecture. Paul is a boxing gym owner and philosopher in Hong Kong building a private local AI system.

PAUL'S LEXICON (recognise these terms as high-value signals):
IntegrityOS, OmissionOS, Saper Vedere, The Cathedral, The Weaver of Iron, The Dragon, The Well, 30/30 Grid, Sfumato, The Equal, Forensic Audit, Sacred Preparation, The Hungry Ghost, Agent Lambda, The Rescuer Shadow, Wu Wang, Information Dominance, BasicClaw, vortex harmony, knowledge well, sovereignty stack, biomimicry, vortex flow, divine proportion, Forensic Non-Sequitur, Terminative Grace, Sovereign Witness, The Marked Gun, 1234 Staircase, 121212 Loop, The Healer Trap, Structural Audit, Crystalline Lesson, My Architect, Inner Citadel

EXTRACT:
1. NUGGETS — standalone insights that hold weight outside this conversation. Frameworks, mental models, breakthroughs, principles. Paul's own thinking especially.
2. KEYWORDS — domain-specific terms, Paul's invented phrases, recurring concepts
3. PATTERNS — how Paul thinks, frames problems, what energises him
4. OPEN THREADS — ideas mentioned but not developed

SCORING (weight 1-10):
1-3 = General knowledge
4-6 = Useful, Paul-adjacent  
7-8 = Distinctly Paul's worldview or lexicon
9-10 = Cathedral-core, loadbearing insight

OUTPUT: Return ONLY valid JSON, no preamble, no markdown fences, exactly this structure:
{
  "nuggets": [
    {
      "title": "Short memorable title",
      "content": "The insight as one clean sentence",
      "domain": "philosophy|boxing|business|relationships|identity|universe|technology|wealth|creative",
      "weight": 8,
      "source": "Paul said|Leonardo said|Marcus said|co-created",
      "tags": ["tag1", "tag2"]
    }
  ],
  "keywords": ["term1", "term2"],
  "patterns": ["pattern description"],
  "open_threads": ["unresolved idea"],
  "domain_tags": ["philosophy", "identity"],
  "session_summary": "2-3 sentence overview"
}

If the conversation has no extractable insights (small talk, technical setup, error messages), return:
{"nuggets": [], "keywords": [], "patterns": [], "open_threads": [], "domain_tags": [], "session_summary": "No insights found"}

Now extract from this conversation:`;

// ============================================================
// HELPERS
// ============================================================

function loadManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
  } catch {
    return { processed: {} };
  }
}

function saveManifest(manifest) {
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
}

function getFileHash(content) {
  return crypto.createHash('md5').update(content).digest('hex').substring(0, 12);
}

function getAllChatFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  
  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.txt') || entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }
  walk(dir);
  return files;
}

function callClaude(content) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'anthropic/claude-sonnet-4',
      max_tokens: 2000,
      messages: [{ role: 'user', content: `${EXTRACTION_PROMPT}\n\n${content}` }]
    });

    const options = {
      hostname: 'openrouter.ai',
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'HTTP-Referer': 'https://cathedral.basicclaw',
        'X-Title': 'Cathedral Extractor'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const text = parsed.choices?.[0]?.message?.content || '';
          resolve(text);
        } catch (e) {
          reject(new Error(`API parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function parseExtraction(text) {
  try {
    // Strip any accidental markdown fences
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

function writeToVault(fileName, extraction) {
  if (!fs.existsSync(VAULT_OUTPUT)) {
    fs.mkdirSync(VAULT_OUTPUT, { recursive: true });
  }

  const date = new Date().toISOString().split('T')[0];
  const baseName = path.basename(fileName, path.extname(fileName));
  const outFile = path.join(VAULT_OUTPUT, `${baseName}-extracted.md`);

  const domainTags = (extraction.domain_tags || []).map(t => `#${t.toLowerCase()}`).join(' ');
  
  let md = `# ${baseName}\n`;
  md += `${domainTags}\n`;
  md += `*Extracted: ${date}*\n\n`;
  md += `## Summary\n${extraction.session_summary}\n\n`;

  if (extraction.nuggets && extraction.nuggets.length > 0) {
    md += `## Nuggets\n\n`;
    for (const n of extraction.nuggets) {
      md += `### ${n.title} *(weight: ${n.weight})*\n`;
      md += `${n.content}\n`;
      md += `*Domain: ${n.domain} | Source: ${n.source}*\n`;
      if (n.tags && n.tags.length > 0) {
        md += `Tags: ${n.tags.map(t => `[[${t}]]`).join(', ')}\n`;
      }
      md += '\n';
    }
  }

  if (extraction.keywords && extraction.keywords.length > 0) {
    md += `## Keywords\n${extraction.keywords.join(', ')}\n\n`;
  }

  if (extraction.patterns && extraction.patterns.length > 0) {
    md += `## Patterns\n`;
    for (const p of extraction.patterns) {
      md += `- ${p}\n`;
    }
    md += '\n';
  }

  if (extraction.open_threads && extraction.open_threads.length > 0) {
    md += `## Open Threads\n`;
    for (const t of extraction.open_threads) {
      md += `- ${t}\n`;
    }
    md += '\n';
  }

  fs.writeFileSync(outFile, md);
  return outFile;
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('\n🏛️  CATHEDRAL CLAUDE EXTRACTOR');
  console.log('================================\n');

  const manifest = loadManifest();
  const allFiles = getAllChatFiles(RAW_CHATS_DIR);
  
  console.log(`📁 Found ${allFiles.length} chat files total\n`);

  const toProcess = allFiles.filter(f => {
    const content = fs.readFileSync(f, 'utf8');
    if (content.length < MIN_FILE_SIZE) return false;
    const hash = getFileHash(content);
    return manifest.processed[f] !== hash;
  });

  console.log(`🔍 ${toProcess.length} new or changed files to process`);
  console.log(`⏭️  ${allFiles.length - toProcess.length} already processed\n`);

  if (toProcess.length === 0) {
    console.log('✅ All files already processed. Add new chats to ~/raw-chats/ and run again.\n');
    return;
  }

  let saved = 0;
  let skipped = 0;
  let totalNuggets = 0;

  for (const filePath of toProcess) {
    const fileName = path.basename(filePath);
    process.stdout.write(`Processing ${fileName}... `);

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const hash = getFileHash(content);

      // Truncate very long files to fit context window
      const truncated = content.length > 12000 ? content.substring(0, 12000) + '\n[truncated]' : content;

      const rawResponse = await callClaude(truncated);
      const extraction = parseExtraction(rawResponse);

      if (!extraction) {
        console.log('⚠️  Could not parse response, skipping');
        skipped++;
        continue;
      }

      if (!extraction.nuggets || extraction.nuggets.length === 0) {
        console.log('📝 No nuggets found');
        // Still mark as processed so we don't retry empty files
        manifest.processed[filePath] = hash;
        skipped++;
        continue;
      }

      const outFile = writeToVault(fileName, extraction);
      totalNuggets += extraction.nuggets.length;
      manifest.processed[filePath] = hash;
      saved++;

      console.log(`✅ ${extraction.nuggets.length} nuggets → ${path.basename(outFile)}`);

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));

    } catch (err) {
      console.log(`❌ Error: ${err.message}`);
      skipped++;
    }
  }

  saveManifest(manifest);

  console.log('\n📊 SUMMARY');
  console.log('==========');
  console.log(`✅ Files processed: ${saved}`);
  console.log(`📝 No nuggets found: ${skipped}`);
  console.log(`💎 New nuggets extracted: ${totalNuggets}`);
  console.log(`📁 Vault: ${VAULT_OUTPUT}\n`);
}

main().catch(console.error);
