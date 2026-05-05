// memory-system.js
// 3-Level Memory System for Cathedral Sages
// Level 1: Conversation memory (within session)
// Level 2: Session memory (across conversations)
// Level 3: Learning memory (builds Paul's profile over time)

import fs from 'fs';
import path from 'path';
import https from 'https';

const MEMORY_PATH = path.join(process.env.HOME, 'nanoclaw', 'memory');
const OPENROUTER_KEY = process.env.OPENROUTER_KEY;

// Ensure memory directories exist
function initMemory() {
  const dirs = [
    MEMORY_PATH,
    path.join(MEMORY_PATH, 'conversations', 'leonardo'),
    path.join(MEMORY_PATH, 'conversations', 'marcus'),
    path.join(MEMORY_PATH, 'summaries'),
    path.join(MEMORY_PATH, 'patterns'),
  ];
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
  console.log('🧠 Memory system initialised');
}

// ============================================
// LEVEL 1 — CONVERSATION MEMORY
// In-memory store, lives for the session only
// ============================================
const conversationMemory = {};

export function addToConversation(sageName, chatId, role, content) {
  const key = `${sageName}_${chatId}`;
  if (!conversationMemory[key]) conversationMemory[key] = [];
  conversationMemory[key].push({
    role,
    content: content.substring(0, 500), // cap size
    timestamp: new Date().toISOString()
  });
  // Keep last 20 exchanges max
  if (conversationMemory[key].length > 40) {
    conversationMemory[key] = conversationMemory[key].slice(-40);
  }
}

export function getConversationHistory(sageName, chatId) {
  const key = `${sageName}_${chatId}`;
  return conversationMemory[key] || [];
}

export function clearConversation(sageName, chatId) {
  const key = `${sageName}_${chatId}`;
  conversationMemory[key] = [];
}

// Format conversation history for injection into system prompt
export function formatHistoryForPrompt(sageName, chatId) {
  const history = getConversationHistory(sageName, chatId);
  if (history.length === 0) return '';

  const formatted = history
    .slice(-10) // last 10 exchanges
    .map(h => `${h.role === 'user' ? 'Paul' : 'You'}: ${h.content}`)
    .join('\n');

  return `\n\nRECENT CONVERSATION HISTORY (remember this):\n${formatted}\n`;
}

// ============================================
// LEVEL 2 — SESSION MEMORY
// Persisted to disk, survives restarts
// ============================================

function getSessionFile(sageName) {
  return path.join(MEMORY_PATH, 'summaries', `${sageName}-memory.json`);
}

export function loadSessionMemory(sageName) {
  try {
    const file = getSessionFile(sageName);
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading session memory:', e.message);
  }
  return {
    sageName,
    totalConversations: 0,
    lastSeen: null,
    keyTopics: [],
    paulMentioned: [],
    openThreads: [],
    recentSummary: ''
  };
}

export function saveSessionMemory(sageName, memory) {
  try {
    const file = getSessionFile(sageName);
    fs.writeFileSync(file, JSON.stringify(memory, null, 2));
  } catch (e) {
    console.error('Error saving session memory:', e.message);
  }
}

// Format session memory for injection into system prompt
export function formatSessionMemoryForPrompt(sageName) {
  const memory = loadSessionMemory(sageName);
  if (!memory.recentSummary && memory.totalConversations === 0) return '';

  let prompt = `\n\nWHAT YOU REMEMBER ABOUT PAUL FROM PREVIOUS CONVERSATIONS:\n`;

  if (memory.recentSummary) {
    prompt += `${memory.recentSummary}\n`;
  }

  if (memory.openThreads && memory.openThreads.length > 0) {
    prompt += `\nOpen threads — things Paul mentioned but hasn't resolved:\n`;
    memory.openThreads.forEach(t => prompt += `• ${t}\n`);
  }

  if (memory.lastSeen) {
    prompt += `\nLast conversation: ${memory.lastSeen}\n`;
  }

  prompt += `Total conversations: ${memory.totalConversations}\n`;

  return prompt;
}

// ============================================
// LEVEL 3 — LEARNING MEMORY
// Paul's evolving profile — patterns, preferences, growth
// ============================================

function getPaulProfileFile() {
  return path.join(MEMORY_PATH, 'patterns', 'paul-profile.json');
}

export function loadPaulProfile() {
  try {
    const file = getPaulProfileFile();
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading Paul profile:', e.message);
  }
  return {
    name: 'Paul',
    location: 'Hong Kong',
    totalConversations: 0,
    firstSeen: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    corePatterns: [],
    recurringThemes: [],
    communicationStyle: '',
    currentFocus: [],
    breakthroughs: [],
    blindspots: [],
    whatHelpsHim: [],
    whatDoesntHelp: [],
    evolutionNotes: []
  };
}

export function savePaulProfile(profile) {
  try {
    profile.lastUpdated = new Date().toISOString();
    fs.writeFileSync(getPaulProfileFile(), JSON.stringify(profile, null, 2));
  } catch (e) {
    console.error('Error saving Paul profile:', e.message);
  }
}

export function formatPaulProfileForPrompt() {
  const profile = loadPaulProfile();
  if (profile.totalConversations === 0) return '';

  let prompt = `\n\nDEEP PATTERN KNOWLEDGE ABOUT PAUL (learned over ${profile.totalConversations} conversations):\n`;

  if (profile.corePatterns.length > 0) {
    prompt += `Core patterns:\n`;
    profile.corePatterns.slice(0, 5).forEach(p => prompt += `• ${p}\n`);
  }

  if (profile.currentFocus.length > 0) {
    prompt += `Currently focused on: ${profile.currentFocus.join(', ')}\n`;
  }

  if (profile.whatHelpsHim.length > 0) {
    prompt += `What helps Paul most: ${profile.whatHelpsHim.slice(0, 3).join(', ')}\n`;
  }

  if (profile.communicationStyle) {
    prompt += `Communication note: ${profile.communicationStyle}\n`;
  }

  return prompt;
}

// ============================================
// MEMORY UPDATER — runs after each conversation
// Uses Claude to extract insights and update memory
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
        try {
          const parsed = JSON.parse(response);
          if (parsed.error) {
            reject(new Error(`OpenRouter error: ${parsed.error.message}`));
            return;
          }
          if (!parsed.choices || !parsed.choices[0]) {
            reject(new Error(`Unexpected response format: ${response.slice(0, 200)}`));
            return;
          }
          resolve(parsed.choices[0].message.content);
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

export async function updateMemoryAfterConversation(sageName, chatId) {
  const history = getConversationHistory(sageName, chatId);
  if (history.length < 4) return; // Not enough to summarise

  const conversationText = history
    .map(h => `${h.role === 'user' ? 'Paul' : sageName}: ${h.content}`)
    .join('\n');

  try {
    // Generate conversation summary and extract insights
    const systemPrompt = `You are a memory extraction system for an AI sage called ${sageName}.
    
Extract insights from this conversation between Paul and ${sageName}.
Paul is: Boxing gym owner, philosopher, AI architect in Hong Kong. The Weaver of Iron.

Respond ONLY with valid JSON in this exact format:
{
  "summary": "2-3 sentence summary of what was discussed",
  "keyTopics": ["topic1", "topic2"],
  "openThreads": ["unresolved thing 1", "unresolved thing 2"],
  "paulPatterns": ["pattern observed about Paul"],
  "currentFocus": ["what Paul seems focused on"],
  "whatHelped": "what approach helped Paul in this conversation",
  "breakthrough": "any significant insight or moment (or empty string)"
}`;

    const result = await callClaude(systemPrompt, `Conversation to analyse:\n${conversationText}`);

    // Parse JSON response
    const clean = result.replace(/```json|```/g, '').trim();
    const insights = JSON.parse(clean);

    // Update Level 2 — Session Memory
    const sessionMemory = loadSessionMemory(sageName);
    sessionMemory.totalConversations += 1;
    sessionMemory.lastSeen = new Date().toLocaleDateString('en-HK', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    sessionMemory.recentSummary = insights.summary;
    sessionMemory.keyTopics = [
      ...new Set([...(sessionMemory.keyTopics || []), ...(insights.keyTopics || [])])
    ].slice(-20);
    sessionMemory.openThreads = insights.openThreads || [];
    saveSessionMemory(sageName, sessionMemory);

    // Update Level 3 — Paul's Profile
    const profile = loadPaulProfile();
    profile.totalConversations += 1;

    if (insights.paulPatterns) {
      profile.corePatterns = [
        ...new Set([...profile.corePatterns, ...insights.paulPatterns])
      ].slice(-15);
    }

    if (insights.currentFocus) {
      profile.currentFocus = insights.currentFocus.slice(-5);
    }

    if (insights.whatHelped) {
      profile.whatHelpsHim = [
        ...new Set([...profile.whatHelpsHim, insights.whatHelped])
      ].slice(-10);
    }

    if (insights.breakthrough) {
      profile.breakthroughs.push({
        date: new Date().toISOString(),
        sage: sageName,
        insight: insights.breakthrough
      });
      profile.breakthroughs = profile.breakthroughs.slice(-20);
    }

    savePaulProfile(profile);

    // Save full conversation log
    const date = new Date().toISOString().split('T')[0];
    const logFile = path.join(MEMORY_PATH, 'conversations', sageName, `${date}-${Date.now()}.json`);
    fs.writeFileSync(logFile, JSON.stringify({
      date: new Date().toISOString(),
      sageName,
      chatId,
      conversation: history,
      insights
    }, null, 2));

    console.log(`🧠 Memory updated for ${sageName} — ${insights.summary?.substring(0, 60)}...`);

  } catch (error) {
    console.error('Memory update error:', error.message);
  }
}

// ============================================
// MEMORY STATUS REPORT
// ============================================
export function getMemoryStatus(sageName) {
  const session = loadSessionMemory(sageName);
  const profile = loadPaulProfile();

  return {
    conversationsWithSage: session.totalConversations,
    lastSeen: session.lastSeen || 'Never',
    openThreads: session.openThreads || [],
    totalConversationsAllSages: profile.totalConversations,
    currentFocus: profile.currentFocus || [],
    breakthroughs: profile.breakthroughs?.length || 0
  };
}

initMemory();
