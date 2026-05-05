import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ===== CONFIGURATION =====
const CHATS_FOLDER = path.join(process.env.HOME, 'raw-chats');
const VAULT_PATH = path.join(process.env.HOME, 'cathedral-vault');
const OLLAMA_URL = 'http://localhost:11434/api/generate';
const MODEL_NAME = 'llama3.1';
// =========================

const DEEP_HARVESTER_PROMPT = `You are a meticulous knowledge archaeologist. Extract EVERY possible nugget of wisdom from this conversation.

Extract ANY of these categories:
- Framework_System: Step-by-step processes, architectures
- Axiom_Principle: Core truths, laws, foundational ideas
- Persona_Mentor: Character voices, wise sayings
- Hidden_Knowledge: Esoteric concepts, ancient wisdom
- Drill_Exercise: Physical training methods
- Business_Idea: Opportunities, strategies
- Philosophical_Insight: Deep reflections
- Psychological_Insight: Understanding of mind
- Metaphor_Analogy: Powerful comparisons
- Question_Seed: Profound questions
- Quote: Memorable exact phrases

BE AGGRESSIVE. Extract anything valuable.

Output ONLY valid JSON with this schema:
{
  "extracted_nuggets": [
    {
      "category": "string",
      "title": "string",
      "core_concept": "string",
      "metaphor_used": "string or null",
      "application_or_insight": "string",
      "dots_to_connect": ["string"],
      "tags": ["string"],
      "exact_quote": "string or null"
    }
  ]
}`;

async function localExtract(chatText) {
  try {
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL_NAME,
        prompt: `### System:\n${DEEP_HARVESTER_PROMPT}\n\n### Chat:\n${chatText}\n\n### JSON Output:\n`,
        stream: false,
        temperature: 0.1,
        num_predict: 4000
      })
    });

    const data = await response.json();
    const content = data.response;
    
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('No JSON found in response');
  } catch (error) {
    console.error('Extraction error:', error.message);
    throw error;
  }
}

function saveNugget(nugget, sourceFile) {
  try {
    const safeTitle = nugget.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const nuggetPath = path.join(VAULT_PATH, '02_Refined_Gold', `${safeTitle}.md`);
    
    let markdown = `# ${nugget.title}\n\n`;
    markdown += `**Category:** ${nugget.category}\n\n`;
    markdown += `## Core Concept\n${nugget.core_concept}\n\n`;
    if (nugget.metaphor_used) markdown += `## Metaphor\n${nugget.metaphor_used}\n\n`;
    markdown += `## Application\n${nugget.application_or_insight}\n\n`;
    if (nugget.exact_quote) markdown += `## Exact Quote\n> ${nugget.exact_quote}\n\n`;
    markdown += `## Dots to Connect\n${nugget.dots_to_connect.map(d => `- ${d}`).join('\n')}\n\n`;
    markdown += `## Tags\n${nugget.tags.map(t => `#${t}`).join(' ')}\n\n`;
    markdown += `---\n*Extracted from: ${sourceFile}*`;
    
    fs.writeFileSync(nuggetPath, markdown);
    return nuggetPath;
  } catch (error) {
    console.error('Save error:', error.message);
    throw error;
  }
}

async function main() {
  console.log('🦙 LOCAL LLM HARVESTER (llama3.1)\n');
  
  // Check connection to Ollama
  try {
    const testResponse = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL_NAME,
        prompt: 'Say "connected"',
        stream: false
      })
    });
    const testData = await testResponse.json();
    console.log('✅ Connected to Ollama with model:', MODEL_NAME);
    console.log('   Response:', testData.response.substring(0, 50) + '...\n');
  } catch (error) {
    console.log('❌ Cannot connect to Ollama. Make sure it\'s running:');
    console.log('   Run this in another terminal: ollama serve\n');
    console.log('   Error:', error.message);
    return;
  }
  
  // Check/create chats folder
  if (!fs.existsSync(CHATS_FOLDER)) {
    fs.mkdirSync(CHATS_FOLDER, { recursive: true });
    console.log(`📁 Created chats folder: ${CHATS_FOLDER}`);
    console.log('   Add .txt files there and run again\n');
    return;
  }
  
  const files = fs.readdirSync(CHATS_FOLDER).filter(f => f.endsWith('.txt'));
  console.log(`📄 Found ${files.length} chat files in ${CHATS_FOLDER}\n`);
  
  if (files.length === 0) {
    console.log('   Add some .txt files and run again');
    return;
  }
  
  for (const file of files) {
    console.log(`\n📖 Processing: ${file}`);
    const filePath = path.join(CHATS_FOLDER, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    console.log(`   Length: ${content.length} characters`);
    
    try {
      const result = await localExtract(content);
      if (result.extracted_nuggets && result.extracted_nuggets.length > 0) {
        console.log(`   💰 EXTRACTED ${result.extracted_nuggets.length} NUGGETS`);
        
        for (const nugget of result.extracted_nuggets) {
          try {
            const nuggetPath = saveNugget(nugget, file);
            console.log(`     ✨ ${nugget.title} (${nugget.category})`);
          } catch (saveError) {
            console.log(`     ❌ Failed to save: ${nugget.title}`);
          }
        }
      } else {
        console.log(`   😴 No nuggets found in this chat`);
      }
    } catch (error) {
      console.log(`   ❌ Extraction failed:`, error.message);
    }
    
    // Small delay between files
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n🎉 Local harvest complete!');
  console.log(`📁 Check your vault: ${VAULT_PATH}/02_Refined_Gold/`);
}

main().catch(console.error);
