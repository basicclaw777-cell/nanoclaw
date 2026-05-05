import fs from 'fs';
import path from 'path';
import https from 'https';

const OPENROUTER_KEY = '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';
const CHATS_FOLDER = path.join(process.env.HOME, 'raw-chats');
const VAULT_PATH = path.join(process.env.HOME, 'cathedral-vault');

// Aggressive extraction prompt
const DEEP_HARVESTER_PROMPT = `You are a meticulous knowledge archaeologist. Your task is to extract EVERY possible nugget of wisdom from this conversation.

Extract ANY of these categories when they appear:
- Framework_System: Step-by-step processes, architectures, systems
- Axiom_Principle: Core truths, laws, foundational ideas  
- Persona_Mentor: Character voices, wise sayings, archetypes
- Hidden_Knowledge: Esoteric concepts, alternative physics, ancient wisdom
- Drill_Exercise: Physical training methods, techniques
- Business_Idea: Opportunities, strategies, models
- Philosophical_Insight: Deep reflections on life, meaning, human nature
- Psychological_Insight: Understanding of mind, behavior, patterns
- Metaphor_Analogy: Powerful comparisons that explain concepts
- Question_Seed: Profound questions worth revisiting
- Quote: Memorable exact phrases

BE AGGRESSIVE. If something seems even slightly valuable, extract it. Better to have too many nuggets than to miss gold.

Output JSON with this schema:
{
  "extracted_nuggets": [
    {
      "category": "string",
      "title": "string (punchy, memorable)",
      "core_concept": "string (2-3 sentences)",
      "metaphor_used": "string or null",
      "application_or_insight": "string",
      "dots_to_connect": ["string"],
      "tags": ["string"],
      "exact_quote": "string or null (the exact words if quotable)"
    }
  ]
}`;

async function deepExtract(chatText, filename) {
  const data = JSON.stringify({
    model: 'anthropic/claude-3.5-sonnet',
    messages: [
      { role: 'system', content: DEEP_HARVESTER_PROMPT },
      { role: 'user', content: chatText }
    ],
    max_tokens: 4000
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
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            resolve(JSON.parse(jsonMatch[0]));
          } else {
            console.log('Raw response:', content.substring(0, 200));
            reject('No JSON found');
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

// Save nugget with quote if present
function saveNugget(nugget, sourceFile) {
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
}

async function main() {
  console.log('🔍 DEEP HARVESTER MODE ACTIVATED\n');
  
  const files = fs.readdirSync(CHATS_FOLDER).filter(f => f.endsWith('.txt'));
  console.log(`📄 Found ${files.length} chat files\n`);
  
  for (const file of files) {
    console.log(`\n📖 Processing: ${file}`);
    const filePath = path.join(CHATS_FOLDER, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    console.log(`   Chat length: ${content.length} characters`);
    
    try {
      const result = await deepExtract(content, file);
      if (result.extracted_nuggets && result.extracted_nuggets.length > 0) {
        console.log(`   💰 EXTRACTED ${result.extracted_nuggets.length} NUGGETS`);
        
        for (const nugget of result.extracted_nuggets) {
          const nuggetPath = saveNugget(nugget, file);
          console.log(`     ✨ ${nugget.title} (${nugget.category})`);
        }
      } else {
        console.log(`   😴 No nuggets found`);
      }
    } catch (error) {
      console.log(`   ❌ Extraction failed:`, error.message);
    }
    
    // Rate limiting
    await new Promise(r => setTimeout(r, 3000));
  }
  
  console.log('\n🎉 Deep harvest complete!');
}

main().catch(console.error);

