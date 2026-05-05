// seed-generator.js
// Reads Paul's cathedral vault and generates rich context prompts
// for seeding any AI chat (Claude, ChatGPT, DeepSeek, Gemini etc.)

import fs from 'fs';
import path from 'path';
import https from 'https';

const VAULT_PATH = path.join(process.env.HOME, 'cathedral-vault', '02_Refined_Gold');
const SAGES_PATH = path.join(process.env.HOME, 'nanoclaw', 'sages');
const OPENROUTER_KEY = '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';

// Topic keyword maps — which vault tags/concepts relate to each seed topic
const TOPIC_MAPS = {
  philosophy: ['truth', 'wisdom', 'perception', 'consciousness', 'stoic', 'virtue', 'meaning', 'pattern-recognition', 'integrity'],
  boxing: ['boxing', 'training', 'physical', 'drill', 'coaching', 'discipline', 'fighter', 'gym'],
  business: ['business', 'knowledge', 'extraction', 'opportunity', 'strategy', 'value', 'system'],
  leonardo: ['perception', 'wisdom', 'truth-detection', 'pattern-recognition', 'geometry', 'art'],
  marcus: ['stoic', 'virtue', 'rational', 'citadel', 'reason', 'integrity', 'discipline'],
  relationships: ['integrity', 'truth', 'omission', 'exposure', 'presence', 'karmic'],
  identity: ['sovereignty', 'self', 'cathedral', 'dragon', 'iron', 'weaver'],
  technology: ['ai', 'knowledge', 'system', 'extraction', 'cathedral', 'vault'],
  universe: ['sacred', 'geometry', 'natural', 'law', 'pattern', 'universal'],
  wealth: ['value', 'compound', 'knowledge', 'opportunity', 'system', 'leverage'],
  creative: ['metaphor', 'analogy', 'architecture', 'art', 'design', 'proportion'],
  general: [] // Returns everything — full Cathedral context
};

// ============================================
// READ VAULT NUGGETS
// ============================================
function readVaultNuggets(topicKeywords) {
  const nuggets = [];

  try {
    const files = fs.readdirSync(VAULT_PATH).filter(f => f.endsWith('.md') && !f.includes('archive'));

    files.forEach(file => {
      const content = fs.readFileSync(path.join(VAULT_PATH, file), 'utf8');

      // Extract frontmatter tags
      const tagMatch = content.match(/tags:\s*\[([^\]]+)\]/);
      const tags = tagMatch ? tagMatch[1].split(',').map(t => t.trim().replace(/'/g, '')) : [];

      // Extract title
      const titleMatch = content.match(/^#\s+(.+)/m);
      const title = titleMatch ? titleMatch[1].replace(/\[\[|\]\]/g, '').trim() : file;

      // Extract core concept
      const conceptMatch = content.match(/## Core (?:Concept|Insight)\n([\s\S]*?)(?=\n##|---|\*Extracted|$)/);
      const concept = conceptMatch ? conceptMatch[1].trim() : '';

      // Extract connected ideas
      const connectionsMatch = content.match(/connections:\s*(.+)/);
      const connections = connectionsMatch ? connectionsMatch[1].trim() : '';

      // Score relevance to topic
      let relevanceScore = 0;
      if (topicKeywords.length === 0) {
        relevanceScore = 1; // General — include everything
      } else {
        topicKeywords.forEach(keyword => {
          if (tags.some(t => t.toLowerCase().includes(keyword.toLowerCase()))) relevanceScore += 2;
          if (title.toLowerCase().includes(keyword.toLowerCase())) relevanceScore += 3;
          if (concept.toLowerCase().includes(keyword.toLowerCase())) relevanceScore += 1;
          if (content.toLowerCase().includes(keyword.toLowerCase())) relevanceScore += 0.5;
        });
      }

      if (relevanceScore > 0 || topicKeywords.length === 0) {
        nuggets.push({ title, concept, tags, connections, relevanceScore, file });
      }
    });

    // Sort by relevance
    nuggets.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return nuggets;

  } catch (error) {
    console.error('Error reading vault:', error.message);
    return [];
  }
}

// ============================================
// LOAD SAGE CONTEXT
// ============================================
function loadSageContext(sageName) {
  try {
    const sagePath = path.join(SAGES_PATH, `${sageName}.json`);
    if (fs.existsSync(sagePath)) {
      const sage = JSON.parse(fs.readFileSync(sagePath, 'utf8'));
      return {
        name: sage.sage.name,
        voice: sage.sage.voice,
        lens: sage.sage.core_lens,
        lexicon: sage.sovereign_lexicon,
        systemPrompt: sage.system_prompt
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

// ============================================
// GENERATE SEED WITH CLAUDE
// ============================================
async function generateSeedWithClaude(topic, nuggets, sageContext, seedType) {
  const nuggetSummary = nuggets.slice(0, 15).map(n =>
    `• ${n.title}: ${n.concept.substring(0, 150)}`
  ).join('\n');

  const lexiconSummary = sageContext ? Object.entries(sageContext.lexicon || {})
    .slice(0, 20)
    .map(([k, v]) => `• ${k}: ${v.substring(0, 100)}`)
    .join('\n') : '';

  let instructions = '';

  if (seedType === 'sage' && sageContext) {
    instructions = `Generate a context seed that transforms any AI into ${sageContext.name} as Paul knows him — using his specific lexicon, diagnostic frameworks, and voice. The seed should make ANY AI immediately speak as this sage would.`;
  } else if (seedType === 'topic') {
    instructions = `Generate a rich context seed for a deep conversation about "${topic}". The seed should prime any AI with Paul's specific frameworks, lexicon, and insights on this topic so the conversation starts at depth 8, not depth 1.`;
  } else {
    instructions = `Generate a comprehensive Cathedral context seed — a master prompt that introduces Paul's entire personal operating system, lexicon, and philosophy to any AI. This is the "full Cathedral upload."`;
  }

  const systemPrompt = `You are the Cathedral Seed Generator. You create rich, structured context prompts that Paul can paste at the start of any AI conversation to instantly bring that AI into his world.

Paul is: A boxing gym owner and philosopher in Hong Kong. Builder of a personal AI Cathedral. Known as The Weaver of Iron, The Obsidian Dragon, The Architect.

${instructions}

The seed must:
1. Be under 800 words (fits in any AI's context window easily)
2. Start with a clear instruction to the AI ("You are now operating within...")
3. Include the most relevant nuggets and concepts
4. Define key lexicon terms the AI will need
5. End with an invitation to begin ("I am ready. Ask your first question or await mine.")
6. Be immediately copy-pasteable into Claude, ChatGPT, DeepSeek, or Gemini

Format it as clean markdown that looks professional when pasted.`;

  const userMessage = `Topic: ${topic}
Seed type: ${seedType}
${sageContext ? `Sage: ${sageContext.name}\nSage voice: ${sageContext.voice}\nSage lens: ${sageContext.lens}` : ''}

Most relevant vault nuggets:
${nuggetSummary}

${lexiconSummary ? `Key lexicon to include:\n${lexiconSummary}` : ''}

Generate the seed prompt now.`;

  const data = JSON.stringify({
    model: 'anthropic/claude-3.5-sonnet',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ]
  });

  const options = {
    hostname: 'openrouter.ai',
    path: '/api/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'Content-Length': Buffer.byteLength(data)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let response = '';
      res.on('data', chunk => response += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(response).choices[0].message.content);
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

// ============================================
// SAVE SEED TO VAULT
// ============================================
function saveSeedToVault(topic, seed) {
  const seedsPath = path.join(process.env.HOME, 'cathedral-vault', '03_The_Sages');
  const date = new Date().toISOString().split('T')[0];
  const filename = `seed-${topic.toLowerCase().replace(/\s+/g, '-')}-${date}.md`;
  const filepath = path.join(seedsPath, filename);

  const markdown = `---
tags: [seed, context-prompt, ${topic.toLowerCase()}]
date: ${date}
category: Seed_Prompt
vault_section: The_Sages
---

# 🌱 Seed: ${topic} — ${date}

${seed}

---
*Generated by Cathedral Seed Generator*
*Ready to paste into: Claude, ChatGPT, DeepSeek, Gemini*
`;

  fs.writeFileSync(filepath, markdown);
  return filename;
}

// ============================================
// MAIN EXPORT
// ============================================
export async function createSeed(topicInput) {
  const topic = topicInput.toLowerCase().trim();

  console.log(`🌱 Generating seed for: ${topic}`);

  // Determine seed type
  let seedType = 'topic';
  let sageContext = null;
  let topicKeywords = TOPIC_MAPS[topic] || TOPIC_MAPS.general;

  // Check if it's a sage seed
  if (['leonardo', 'marcus', 'yoda', 'suntzu', 'miyagi'].includes(topic)) {
    seedType = 'sage';
    sageContext = loadSageContext(topic);
    topicKeywords = TOPIC_MAPS[topic] || [];
  }

  // Full Cathedral seed
  if (topic === 'cathedral' || topic === 'full' || topic === 'general') {
    seedType = 'full';
    topicKeywords = [];
  }

  // Read relevant nuggets
  const nuggets = readVaultNuggets(topicKeywords);
  console.log(`📚 Found ${nuggets.length} relevant nuggets`);

  if (nuggets.length === 0 && seedType !== 'full') {
    return `⚠️ No nuggets found for "${topic}" in your vault yet.\n\nTry: /seed philosophy, /seed boxing, /seed leonardo, /seed cathedral\n\nOr add more chats to ~/raw-chats/${topic}/ and run the harvester.`;
  }

  // Generate seed
  const seed = await generateSeedWithClaude(topic, nuggets, sageContext, seedType);

  // Save to vault
  const filename = saveSeedToVault(topic, seed);
  console.log(`💾 Saved to vault: ${filename}`);

  return seed;
}

// List available seed topics
export function getSeedTopics() {
  return Object.keys(TOPIC_MAPS);
}
