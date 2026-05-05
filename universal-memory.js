// universal-memory.js
// Captures insights from ANY conversation regardless of interface or skin
// Call logConversation() from anywhere — Telegram, Open Web UI, scripts

import fs from 'fs';
import path from 'path';
import https from 'https';

const HOME = process.env.HOME;
const MEMORY_PATH = path.join(HOME, 'nanoclaw', 'memory');
const RAW_CHATS_PATH = path.join(HOME, 'raw-chats');
const OPENROUTER_KEY = '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';

// Ensure dirs exist
function initDirs() {
  const dirs = [
    MEMORY_PATH,
    path.join(MEMORY_PATH, 'conversations', 'universal'),
    path.join(MEMORY_PATH, 'summaries'),
    path.join(MEMORY_PATH, 'patterns'),
  ];
  dirs.forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
}

// ============================================
// PAUL'S PROFILE — universal store
// ============================================
function loadProfile() {
  const defaults = {
    totalConversations: 0,
    firstSeen: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    interfaces: {},
    corePatterns: [],
    recurringThemes: [],
    currentFocus: [],
    openThreads: [],
    breakthroughs: [],
    whatHelpsHim: [],
    topicDepth: {}
  };
  try {
    const file = path.join(MEMORY_PATH, 'patterns', 'paul-profile.json');
    if (fs.existsSync(file)) {
      const profile = JSON.parse(fs.readFileSync(file, 'utf8'));
      // Ensure flat fields exist regardless of schema version
      for (const [k, v] of Object.entries(defaults)) {
        if (profile[k] === undefined) profile[k] = v;
      }
      return profile;
    }
  } catch (e) {}
  return { name: 'Paul', location: 'Hong Kong', ...defaults };
}

function saveProfile(profile) {
  try {
    profile.lastUpdated = new Date().toISOString();
    const file = path.join(MEMORY_PATH, 'patterns', 'paul-profile.json');
    fs.writeFileSync(file, JSON.stringify(profile, null, 2));
  } catch (e) {
    console.error('Error saving profile:', e.message);
  }
}

// ============================================
// CLAUDE API CALL
// ============================================
async function callClaude(systemPrompt, userMessage) {
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
        try { resolve(JSON.parse(response).choices[0].message.content); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ============================================
// EXTRACT INSIGHTS FROM ANY CONVERSATION
// ============================================
async function extractInsights(conversation, source, skin) {
  const conversationText = conversation
    .map(m => `${m.role === 'user' ? 'Paul' : (skin || 'AI')}: ${m.content}`)
    .join('\n');

  const systemPrompt = `You are a memory extraction system for Paul's Cathedral AI.

Paul is: Boxing gym owner, philosopher, AI architect in Hong Kong. The Weaver of Iron.
This conversation came from: ${source} (skin/mode: ${skin || 'none'})

Extract insights from this conversation. Respond ONLY with valid JSON:
{
  "summary": "2-3 sentence summary of what was discussed",
  "topics": ["topic1", "topic2"],
  "openThreads": ["unresolved thing Paul mentioned"],
  "patterns": ["observable pattern about how Paul thinks or communicates"],
  "currentFocus": ["what Paul seems focused on right now"],
  "whatHelped": "what approach or response style helped Paul most",
  "breakthrough": "any significant insight or realisation Paul had (empty string if none)",
  "topicCategory": "boxing|philosophy|business|technology|personal|universe|creative|finance|wealth|relationships",
  "depthScore": 0-100
}`;

  try {
    const result = await callClaude(systemPrompt, `Conversation:\n${conversationText}`);
    const clean = result.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error('Insight extraction error:', e.message);
    return null;
  }
}

// ============================================
// SAVE CONVERSATION TO RAW-CHATS
// (so harvester can also process it)
// ============================================
function saveToRawChats(conversation, source, skin, category) {
  try {
    const date = new Date().toISOString().split('T')[0];
    const time = Date.now();
    const folder = category || 'technology';
    const folderPath = path.join(RAW_CHATS_PATH, folder);

    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

    const filename = `${source}-${skin || 'general'}-${date}-${time}.txt`;
    const filepath = path.join(folderPath, filename);

    const content = conversation
      .map(m => `${m.role === 'user' ? 'Paul' : (skin || 'AI')}: ${m.content}`)
      .join('\n\n');

    const header = `# Conversation: ${source} — ${skin || 'General'}
Date: ${new Date().toLocaleString('en-HK')}
Interface: ${source}
Skin/Mode: ${skin || 'none'}
---

`;
    fs.writeFileSync(filepath, header + content);
    console.log(`💾 Saved to raw-chats/${folder}/${filename}`);
    return filepath;
  } catch (e) {
    console.error('Error saving to raw-chats:', e.message);
    return null;
  }
}

// ============================================
// MAIN EXPORT — call this from anywhere
// ============================================
export async function logConversation({
  conversation,    // array of {role, content} messages
  source,          // 'telegram' | 'openwebui' | 'terminal' | 'claude-ai'
  skin = null,     // 'leonardo' | 'marcus' | 'freddie-roach' | null
  saveToVault = true  // also save to raw-chats for harvesting
}) {
  if (!conversation || conversation.length < 2) return;

  initDirs();

  console.log(`🧠 Processing memory: ${source} / ${skin || 'skinless'} (${conversation.length} messages)`);

  // Extract insights
  const insights = await extractInsights(conversation, source, skin);
  if (!insights) return;

  // Save to raw-chats for vault harvesting
  if (saveToVault) {
    saveToRawChats(conversation, source, skin, insights.topicCategory);
  }

  // Update Paul's profile
  const profile = loadProfile();
  profile.totalConversations += 1;

  // Track which interfaces Paul uses
  profile.interfaces[source] = (profile.interfaces[source] || 0) + 1;

  // Merge topics
  if (insights.topics?.length > 0) {
    profile.recurringThemes = [
      ...new Set([...profile.recurringThemes, ...insights.topics])
    ].slice(-30);
  }

  // Update current focus
  if (insights.currentFocus?.length > 0) {
    profile.currentFocus = insights.currentFocus.slice(-5);
  }

  // Merge open threads
  if (insights.openThreads?.length > 0) {
    profile.openThreads = [
      ...new Set([...profile.openThreads, ...insights.openThreads])
    ].slice(-10);
  }

  // Add patterns
  if (insights.patterns?.length > 0) {
    profile.corePatterns = [
      ...new Set([...profile.corePatterns, ...insights.patterns])
    ].slice(-20);
  }

  // Track topic depth
  if (insights.topicCategory) {
    profile.topicDepth[insights.topicCategory] =
      (profile.topicDepth[insights.topicCategory] || 0) + 1;
  }

  // Log what helped
  if (insights.whatHelped) {
    profile.whatHelpsHim = [
      ...new Set([...profile.whatHelpsHim, insights.whatHelped])
    ].slice(-10);
  }

  // Log breakthroughs
  if (insights.breakthrough) {
    profile.breakthroughs.push({
      date: new Date().toISOString(),
      source,
      skin: skin || 'none',
      insight: insights.breakthrough
    });
    profile.breakthroughs = profile.breakthroughs.slice(-30);
  }

  saveProfile(profile);

  // Save full conversation log
  const logFile = path.join(
    MEMORY_PATH, 'conversations', 'universal',
    `${source}-${skin || 'general'}-${Date.now()}.json`
  );
  fs.writeFileSync(logFile, JSON.stringify({
    date: new Date().toISOString(),
    source, skin, conversation, insights
  }, null, 2));

  console.log(`✅ Memory updated — ${insights.summary?.substring(0, 80)}`);
  return insights;
}

// ============================================
// READ PROFILE — for injecting into any prompt
// ============================================
export function getProfileContext() {
  const profile = loadProfile();
  if (profile.totalConversations === 0) return '';

  let context = `\nPAUL'S PROFILE (${profile.totalConversations} conversations across ${Object.keys(profile.interfaces).join(', ')}):\n`;

  if (profile.currentFocus?.length > 0)
    context += `Currently focused on: ${profile.currentFocus.join(', ')}\n`;

  if (profile.corePatterns?.length > 0) {
    context += `Key patterns:\n`;
    profile.corePatterns.slice(0, 5).forEach(p => context += `• ${p}\n`);
  }

  if (profile.openThreads?.length > 0) {
    context += `Open threads:\n`;
    profile.openThreads.slice(0, 3).forEach(t => context += `• ${t}\n`);
  }

  if (profile.whatHelpsHim?.length > 0)
    context += `What helps Paul: ${profile.whatHelpsHim.slice(0, 2).join(', ')}\n`;

  return context;
}

export function getFullProfile() {
  return loadProfile();
}

initDirs();
