import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ===== CONFIGURATION =====
const OPENROUTER_KEY = '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';
const CHATS_FOLDER = path.join(process.env.HOME, 'raw-chats');
const VAULT_PATH = path.join(process.env.HOME, 'cathedral-vault');
// =========================

const FOLDERS = [
  '01_Raw_Transcripts',
  '02_Refined_Gold',
  '03_The_Sages',
  '04_Esoteric_Studies'
];

// Create vault structure
console.log('🏛️  Building Cathedral Vault...');
FOLDERS.forEach(folder => {
  const folderPath = path.join(VAULT_PATH, folder);
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
    console.log(`  Created: ${folder}`);
  }
});

// Harvester prompt
const HARVESTER_PROMPT = `You are a Polymath Knowledge Extractor. Analyze the chat transcript and extract wisdom nuggets.

Categories:
- Framework_System: Step-by-step processes, architectures
- Axiom_Principle: Core truths, laws, foundational ideas
- Persona_Mentor: Character voices, wise sayings, archetypes
- Hidden_Knowledge: Esoteric concepts, alternative physics
- Drill_Exercise: Physical training methods
- Business_Idea: Opportunities, strategies

Output ONLY valid JSON with this schema:
{
  "extracted_nuggets": [
    {
      "category": "string",
      "title": "string",
      "core_concept": "string",
      "metaphor_used": "string",
      "application_or_insight": "string",
      "dots_to_connect": ["string"],
      "tags": ["string"]
    }
  ]
}`;

async function extractNuggets(chatText, filename) {
  const data = JSON.stringify({
    model: 'anthropic/claude-3.5-sonnet',
    messages: [
      { role: 'system', content: HARVESTER_PROMPT },
      { role: 'user', content: chatText }
    ]
  });

  const options = {
    hostname: 'openrouter.ai',
    path: '/api/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'Content-Length': data.length
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let response = '';
      res.on('data', chunk => response += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(response);
          const content = parsed.choices[0].message.content;
          // Extract JSON from response (in case it has markdown wrappers)
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            resolve(JSON.parse(jsonMatch[0]));
          } else {
            reject('No JSON found in response');
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Save raw chat
function saveRawChat(filename, content) {
  const safeName = path.basename(filename).replace(/[^a-z0-9]/gi, '_');
  const rawPath = path.join(VAULT_PATH, '01_Raw_Transcripts', `${safeName}.md`);
  fs.writeFileSync(rawPath, `# Raw Chat: ${filename}\n\n${content}`);
  return rawPath;
}

// Save nugget as markdown
function saveNugget(nugget, sourceFile) {
  const safeTitle = nugget.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const nuggetPath = path.join(VAULT_PATH, '02_Refined_Gold', `${safeTitle}.md`);
  
  let markdown = `# ${nugget.title}\n\n`;
  markdown += `**Category:** ${nugget.category}\n\n`;
  markdown += `## Core Concept\n${nugget.core_concept}\n\n`;
  if (nugget.metaphor_used) markdown += `## Metaphor\n${nugget.metaphor_used}\n\n`;
  markdown += `## Application\n${nugget.application_or_insight}\n\n`;
  markdown += `## Dots to Connect\n${nugget.dots_to_connect.map(d => `- ${d}`).join('\n')}\n\n`;
  markdown += `## Tags\n${nugget.tags.map(t => `#${t}`).join(' ')}\n\n`;
  markdown += `---\n*Extracted from: ${sourceFile}*`;
  
  fs.writeFileSync(nuggetPath, markdown);
  return nuggetPath;
}

// Main process
async function main() {
  console.log('\n🔍 Scanning for chats in:', CHATS_FOLDER);
  
  if (!fs.existsSync(CHATS_FOLDER)) {
    console.log('❌ Chats folder not found. Creating:', CHATS_FOLDER);
    fs.mkdirSync(CHATS_FOLDER, { recursive: true });
    console.log('Please add your .txt chat files to:', CHATS_FOLDER);
    return;
  }
  
  const files = fs.readdirSync(CHATS_FOLDER).filter(f => f.endsWith('.txt'));
  console.log(`📄 Found ${files.length} chat files\n`);
  
  for (const file of files) {
    console.log(`Processing: ${file}`);
    const filePath = path.join(CHATS_FOLDER, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Save raw copy
    const rawPath = saveRawChat(file, content);
    console.log(`  ✅ Raw saved: ${rawPath}`);
    
    // Extract nuggets
    try {
      const result = await extractNuggets(content, file);
      if (result.extracted_nuggets && result.extracted_nuggets.length > 0) {
        console.log(`  💰 Found ${result.extracted_nuggets.length} nuggets`);
        
        for (const nugget of result.extracted_nuggets) {
          const nuggetPath = saveNugget(nugget, file);
          console.log(`    ✨ Saved: ${nugget.title}`);
        }
      } else {
        console.log(`  😴 No nuggets found`);
      }
    } catch (error) {
      console.log(`  ❌ Extraction failed:`, error.message);
    }
    
    // Rate limiting
    await new Promise(r => setTimeout(r, 2000));
  }
  
  console.log('\n🎉 Harvest complete! Open Obsidian at:', VAULT_PATH);
}

main().catch(console.error);
