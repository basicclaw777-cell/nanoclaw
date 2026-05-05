#!/usr/bin/env node
// owui-bridge.cjs
// Polls Open Web UI's SQLite DB (via docker exec) for new conversations
// and feeds them into universal-memory.js (paul-profile.json + raw-chats)
//
// Run: node ~/nanoclaw/owui-bridge.cjs
// Auto-run: launchd plist every 5 minutes

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ─── Config ────────────────────────────────────────────────────────────────

const HOME = process.env.HOME;
const STATE_FILE = path.join(HOME, 'nanoclaw', 'owui-bridge-state.json');
const DOCKER_CONTAINER = 'open-webui';
const DB_PATH = '/app/backend/data/webui.db';
const MIN_MESSAGES = 2; // skip single-message chats

// Sage/skin detection — maps OWU model_id patterns → skin name
// Add more as you create models in Open Web UI
const SAGE_MAP = {
  'leonardo':     'leonardo',
  'da-vinci':     'leonardo',
  'marcus':       'marcus',
  'aurelius':     'marcus',
  'jung':         'jung',
  'cus':          'cus-damato',
  'damato':       'cus-damato',
  'freddie':      'freddie-roach',
  'roach':        'freddie-roach',
  'sagarra':      'sagarra',
  'alcides':      'sagarra',
  'sun-tzu':      'sun-tzu',
  'suntzu':       'sun-tzu',
  'miyagi':       'miyagi',
  'lao':          'lao-tzu',
  'tzu':          'lao-tzu',
  'nietzsche':    'nietzsche',
  'taleb':        'taleb',
  'buffett':      'buffett',
  'thiel':        'thiel',
  'yoda':         'yoda',
};

function detectSage(modelId) {
  if (!modelId) return null;
  const lower = modelId.toLowerCase();
  for (const [pattern, sage] of Object.entries(SAGE_MAP)) {
    if (lower.includes(pattern)) return sage;
  }
  return null;
}

// ─── State management ──────────────────────────────────────────────────────

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (e) {}
  // First run: go back 24 hours to catch recent conversations
  return { last_seen: Math.floor(Date.now() / 1000) - 86400 };
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ─── Docker SQLite query ───────────────────────────────────────────────────

function queryDB(pythonScript) {
  const escaped = pythonScript.replace(/'/g, "'\\''");
  const cmd = `docker exec ${DOCKER_CONTAINER} python3 -c '${escaped}'`;
  try {
    const output = execSync(cmd, { encoding: 'utf8', timeout: 30000 });
    return output.trim();
  } catch (e) {
    throw new Error(`docker exec failed: ${e.message}`);
  }
}

function getNewMessages(since) {
  const script = `
import sqlite3, json

conn = sqlite3.connect('${DB_PATH}')
c = conn.cursor()

# Get all messages newer than last_seen, grouped by chat
c.execute("""
  SELECT
    cm.chat_id,
    cm.role,
    cm.content,
    cm.model_id,
    cm.created_at
  FROM chat_message cm
  WHERE cm.created_at > ${since}
    AND cm.content IS NOT NULL
    AND cm.content != ''
    AND cm.done = 1
  ORDER BY cm.chat_id, cm.created_at ASC
""")
rows = c.fetchall()

# Also fetch chat titles for context
chat_ids = list(set(r[0] for r in rows))
titles = {}
if chat_ids:
  placeholders = ','.join(['?' for _ in chat_ids])
  c.execute(f"SELECT id, title FROM chat WHERE id IN ({placeholders})", chat_ids)
  for cid, title in c.fetchall():
    titles[cid] = title

conn.close()

result = {
  "messages": [
    {"chat_id": r[0], "role": r[1], "content": r[2], "model_id": r[3], "created_at": r[4]}
    for r in rows
  ],
  "titles": titles
}
print(json.dumps(result))
`;

  const raw = queryDB(script);
  return JSON.parse(raw);
}

// ─── Content cleaning ──────────────────────────────────────────────────────

function cleanContent(content) {
  if (!content) return '';
  // Strip <details type="reasoning"> blocks from thinking models
  let cleaned = content.replace(/<details[^>]*type="reasoning"[^>]*>[\s\S]*?<\/details>/gi, '');
  // Strip any remaining HTML/XML tags
  cleaned = cleaned.replace(/<[^>]+>/g, '');
  // Normalise whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
  return cleaned;
}

// ─── Group messages into conversations ────────────────────────────────────

function groupByChat(messages) {
  const chats = {};
  for (const msg of messages) {
    if (!chats[msg.chat_id]) {
      chats[msg.chat_id] = {
        chat_id: msg.chat_id,
        model_id: null,
        messages: [],
      };
    }
    // Use the first non-null model_id seen for this chat
    if (!chats[msg.chat_id].model_id && msg.model_id) {
      chats[msg.chat_id].model_id = msg.model_id;
    }
    const cleaned = cleanContent(msg.content);
    if (cleaned.length > 10) {
      chats[msg.chat_id].messages.push({ role: msg.role, content: cleaned });
    }
  }
  return Object.values(chats);
}

// ─── Direct raw-chats save (no external API dependency) ───────────────────

const RAW_CHATS_PATH = path.join(HOME, 'raw-chats');

// Category map: model type → best raw-chats folder
function inferCategory(modelId, sage) {
  if (sage) {
    const sageCategories = {
      'leonardo': 'philosophy', 'marcus': 'philosophy', 'jung': 'philosophy',
      'nietzsche': 'philosophy', 'taleb': 'philosophy', 'lao-tzu': 'philosophy',
      'yoda': 'universe', 'cus-damato': 'boxing', 'freddie-roach': 'boxing',
      'sagarra': 'boxing', 'buffett': 'finance', 'thiel': 'business',
    };
    return sageCategories[sage] || 'philosophy';
  }
  return 'technology';
}

function saveToRawChats(conv, sage, title) {
  const date = new Date().toISOString().split('T')[0];
  const category = inferCategory(conv.model_id, sage);
  const folderPath = path.join(RAW_CHATS_PATH, category);
  if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

  const filename = `openwebui-${sage || 'general'}-${date}-${Date.now()}.txt`;
  const filepath = path.join(folderPath, filename);

  const header = `# OWU Conversation: ${title}
Date: ${new Date().toLocaleString('en-HK')}
Interface: openwebui
Model: ${conv.model_id || 'unknown'}
Sage: ${sage || 'none'}
---

`;
  const body = conv.messages
    .map(m => `${m.role === 'user' ? 'Paul' : (sage || conv.model_id || 'AI')}: ${m.content}`)
    .join('\n\n');

  fs.writeFileSync(filepath, header + body);
  console.log(`     💾 → raw-chats/${category}/${filename}`);
  return { filepath, category };
}

// ─── Profile update via universal-memory (best-effort) ────────────────────

async function tryProfileUpdate(conv, sage) {
  try {
    const { logConversation } = await import('./universal-memory.js');
    await logConversation({
      conversation: conv.messages,
      source: 'openwebui',
      skin: sage,
      saveToVault: false, // raw-chats already saved above
    });
  } catch (e) {
    console.log(`     ⚠️  Profile update skipped: ${e.message.substring(0, 80)}`);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🌉 OWU Bridge — ${new Date().toLocaleString('en-HK')}`);

  const state = loadState();
  console.log(`📅 Checking since ${new Date(state.last_seen * 1000).toLocaleString('en-HK')}`);

  let data;
  try {
    data = getNewMessages(state.last_seen);
  } catch (e) {
    console.error(`❌ DB query failed: ${e.message}`);
    process.exit(1);
  }

  const { messages, titles } = data;
  console.log(`📨 Found ${messages.length} new messages`);

  if (messages.length === 0) {
    console.log('✅ Nothing new. Done.');
    state.last_seen = Math.floor(Date.now() / 1000);
    saveState(state);
    return;
  }

  const conversations = groupByChat(messages);
  const eligible = conversations.filter(c => c.messages.length >= MIN_MESSAGES);
  console.log(`💬 ${eligible.length} conversation(s) with ≥${MIN_MESSAGES} messages to process`);

  let saved = 0;
  for (const conv of eligible) {
    const title = titles[conv.chat_id] || 'Unknown';
    const sage = detectSage(conv.model_id);
    const modelLabel = conv.model_id || 'unknown';

    console.log(`\n  📖 "${title.substring(0, 60)}"`);
    console.log(`     model: ${modelLabel} → sage: ${sage || 'none'} | ${conv.messages.length} messages`);

    // Step 1: Always save to raw-chats (pure file write, no external deps)
    try {
      saveToRawChats(conv, sage, title);
      saved++;
    } catch (e) {
      console.error(`     ❌ raw-chats save failed: ${e.message}`);
      continue;
    }

    // Step 2: Best-effort profile update via Claude API
    await tryProfileUpdate(conv, sage);
  }

  // Update last_seen to the newest message timestamp
  const maxTimestamp = Math.max(...messages.map(m => m.created_at));
  state.last_seen = maxTimestamp;
  saveState(state);

  console.log(`\n✅ Bridge complete — ${saved}/${eligible.length} conversations saved to raw-chats`);
  console.log(`📍 last_seen → ${new Date(maxTimestamp * 1000).toLocaleString('en-HK')}`);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
