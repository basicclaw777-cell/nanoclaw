// cathedral-manager.js
// The Operations Manager — meta-intelligence above all sages and skins
// Knows the full state of the Cathedral at all times

import fs from 'fs';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';

const HOME = process.env.HOME;
const OPENROUTER_KEY = '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';

// ============================================
// CATHEDRAL SCANNER — reads full system state
// ============================================
export function scanCathedral() {
  const state = {
    scannedAt: new Date().toISOString(),
    vault: {},
    rawChats: {},
    skins: {},
    sages: {},
    memory: {},
    projects: {},
    vortex: {}
  };

  // --- VAULT ---
  try {
    const vaultPath = path.join(HOME, 'cathedral-vault');
    const refinedPath = path.join(vaultPath, '02_Refined_Gold');
    const sagesPath = path.join(vaultPath, '03_The_Sages');
    const esotericPath = path.join(vaultPath, '04_Esoteric_Studies');

    const nuggets = fs.existsSync(refinedPath) ? fs.readdirSync(refinedPath).filter(f => f.endsWith('.md')) : [];
    const sageFiles = fs.existsSync(sagesPath) ? fs.readdirSync(sagesPath) : [];
    const esotericFiles = fs.existsSync(esotericPath) ? fs.readdirSync(esotericPath) : [];

    // Get most recent nuggets
    const recentNuggets = nuggets
      .map(f => ({
        name: f,
        modified: fs.statSync(path.join(refinedPath, f)).mtime
      }))
      .sort((a, b) => b.modified - a.modified)
      .slice(0, 5)
      .map(f => f.name.replace('.md', '').replace(/-/g, ' ').substring(0, 50));

    state.vault = {
      totalNuggets: nuggets.length,
      sageFiles: sageFiles.length,
      esotericFiles: esotericFiles.length,
      recentNuggets,
      lastActivity: nuggets.length > 0
        ? fs.statSync(path.join(refinedPath, nuggets[0])).mtime.toLocaleDateString()
        : 'Never'
    };
  } catch (e) {
    state.vault = { error: e.message };
  }

  // --- RAW CHATS ---
  try {
    const rawPath = path.join(HOME, 'raw-chats');
    const folders = fs.readdirSync(rawPath).filter(f =>
      fs.statSync(path.join(rawPath, f)).isDirectory()
    );

    const folderStats = {};
    let totalFiles = 0;
    let unharvested = [];

    folders.forEach(folder => {
      const folderPath = path.join(rawPath, folder);
      const files = fs.readdirSync(folderPath).filter(f =>
        f.endsWith('.txt') || f.endsWith('.md')
      );
      folderStats[folder] = files.length;
      totalFiles += files.length;
      if (files.length > 0) unharvested.push(`${folder}/ (${files.length} files)`);
    });

    state.rawChats = {
      folders: folders.length,
      folderList: folders,
      folderStats,
      totalFiles,
      unharvested: unharvested.length > 0 ? unharvested : ['All folders empty — ready for new chats']
    };
  } catch (e) {
    state.rawChats = { error: e.message };
  }

  // --- SKINS ---
  try {
    const skinsPath = path.join(HOME, 'nanoclaw', 'skins');
    const skinCategories = fs.existsSync(skinsPath)
      ? fs.readdirSync(skinsPath).filter(f =>
          fs.statSync(path.join(skinsPath, f)).isDirectory()
        )
      : [];

    const skinInventory = {};
    let totalSkins = 0;

    skinCategories.forEach(cat => {
      const catPath = path.join(skinsPath, cat);
      const skins = fs.readdirSync(catPath).filter(f => f.endsWith('.json'));
      skinInventory[cat] = skins.map(s => s.replace('.json', ''));
      totalSkins += skins.length;
    });

    // Also check root skins folder
    const rootSkins = fs.existsSync(skinsPath)
      ? fs.readdirSync(skinsPath).filter(f => f.endsWith('.json'))
      : [];
    if (rootSkins.length > 0) {
      skinInventory['uncategorised'] = rootSkins.map(s => s.replace('.json', ''));
      totalSkins += rootSkins.length;
    }

    state.skins = {
      total: totalSkins,
      categories: skinCategories,
      inventory: skinInventory,
      planned: ['Cus D\'Amato', 'Devil\'s Advocate', 'Yoda', 'Sun Tzu', 'Mr Miyagi', 'Pattern Detector', 'Content Architect']
    };
  } catch (e) {
    state.skins = { error: e.message };
  }

  // --- SAGES ---
  try {
    const sagesPath = path.join(HOME, 'nanoclaw', 'sages');
    const sageFiles = fs.existsSync(sagesPath)
      ? fs.readdirSync(sagesPath).filter(f => f.endsWith('.json'))
      : [];

    state.sages = {
      active: sageFiles.map(f => f.replace('.json', '')),
      total: sageFiles.length,
      planned: ['Yoda', 'Sun Tzu', 'Mr Miyagi', 'Tao Master', 'Female Oracle']
    };
  } catch (e) {
    state.sages = { error: e.message };
  }

  // --- MEMORY ---
  try {
    const memoryPath = path.join(HOME, 'nanoclaw', 'memory');
    if (fs.existsSync(memoryPath)) {
      const profilePath = path.join(memoryPath, 'patterns', 'paul-profile.json');
      const profile = fs.existsSync(profilePath)
        ? JSON.parse(fs.readFileSync(profilePath, 'utf8'))
        : null;

      const summariesPath = path.join(memoryPath, 'summaries');
      const summaries = fs.existsSync(summariesPath)
        ? fs.readdirSync(summariesPath).filter(f => f.endsWith('.json'))
        : [];

      state.memory = {
        exists: true,
        totalConversations: profile?.totalConversations || 0,
        currentFocus: profile?.currentFocus || [],
        openThreads: profile?.openThreads || [],
        breakthroughs: profile?.breakthroughs?.length || 0,
        summaryFiles: summaries.length,
        lastUpdated: profile?.lastUpdated || 'Never'
      };
    } else {
      state.memory = {
        exists: false,
        note: 'Memory system not yet initialised — start chatting with sages'
      };
    }
  } catch (e) {
    state.memory = { error: e.message };
  }

  // --- PROJECTS ---
  // Infer projects from folder activity and vault tags
  state.projects = {
    active: [
      { name: 'Cathedral AI System', status: 'ACTIVE', description: 'Local AI infrastructure — bot, sages, memory, vortex' },
      { name: 'Skin Library', status: 'IN PROGRESS', description: `${state.skins.total || 0} built, ${state.skins.planned?.length || 0} planned` },
      { name: 'Council of Sages', status: 'IN PROGRESS', description: `${state.sages.total || 0} active, ${state.sages.planned?.length || 0} planned` },
      { name: 'Knowledge Vault', status: 'ACTIVE', description: `${state.vault.totalNuggets || 0} nuggets, harvester running` },
      { name: 'Vortex Engine', status: 'PHASE 1', description: 'Local/cloud cascade active, training pipeline pending' },
      { name: 'Universal Memory', status: 'BUILDING', description: 'Memory system installed, needs data' }
    ]
  };

  return state;
}

// ============================================
// GENERATE BRIEFING WITH CLAUDE
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
          resolve(JSON.parse(response).choices[0].message.content);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

export async function getDailyBriefing() {
  const state = scanCathedral();

  const systemPrompt = `You are the Cathedral Operations Manager — the chief of staff for Paul's personal AI system in Hong Kong.

Paul is: Boxing gym owner, philosopher, AI architect. The Weaver of Iron. Building a Cathedral of sovereign intelligence.

You have scanned the full Cathedral state. Generate a concise daily briefing that covers:
1. SYSTEM STATUS — what's running, what's not
2. KNOWLEDGE — vault health, what's been harvested recently
3. PROJECTS — what's active, what needs attention
4. RECOMMENDATIONS — the 2-3 most important things to do next
5. OPEN THREADS — anything flagged in memory that needs resolution

Be direct, practical, and specific. Use Paul's language where natural. Under 400 words. Make it feel like a real chief of staff briefing — not a system report.`;

  const briefing = await callClaude(systemPrompt,
    `Cathedral state:\n${JSON.stringify(state, null, 2)}\n\nGenerate the daily briefing.`
  );

  return briefing;
}

export async function answerManagerQuery(question) {
  const state = scanCathedral();

  const systemPrompt = `You are the Cathedral Operations Manager — Paul's chief of staff for his AI system in Hong Kong.

You have full visibility of the Cathedral:
- ${state.vault.totalNuggets} knowledge nuggets in the vault
- ${state.rawChats.folders} raw-chat folders: ${state.rawChats.folderList?.join(', ')}
- ${state.skins.total} skins built: ${JSON.stringify(state.skins.inventory)}
- ${state.sages.active?.length} sages active: ${state.sages.active?.join(', ')}
- Projects: ${state.projects.active?.map(p => `${p.name} (${p.status})`).join(', ')}
- Memory: ${state.memory.totalConversations || 0} conversations logged

You can answer questions about:
- Where to file things ("which folder does this go in?")
- Project status ("what's the status of the skin library?")  
- What to work on ("what should I focus on today?")
- Which sage or skin to use ("who should I ask about this?")
- System health ("is everything running?")
- Knowledge gaps ("what topics are thin in the vault?")

Be direct and specific. You know the Cathedral inside out.`;

  return callClaude(systemPrompt, question);
}

export function getQuickStatus() {
  const state = scanCathedral();
  return `🏛️ *Cathedral Status*

📚 Vault: ${state.vault.totalNuggets} nuggets
📁 Raw chats: ${state.rawChats.folders} folders, ${state.rawChats.totalFiles} files pending harvest
🎭 Skins: ${state.skins.total} built (${state.skins.planned?.length} planned)
🧙 Sages: ${state.sages.active?.join(', ')} (${state.sages.planned?.length} planned)
🧠 Memory: ${state.memory.totalConversations || 0} conversations logged
⚙️ Projects: ${state.projects.active?.length} active

${state.rawChats.totalFiles > 0
  ? `⚠️ *${state.rawChats.totalFiles} files need harvesting*`
  : '✅ All chats harvested'}`;
}
