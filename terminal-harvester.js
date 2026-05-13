/**
 * terminal-harvester.js — Auto-harvest Claude Code terminal sessions to vault
 *
 * Scans ~/.claude/projects/-Users-basicclaw777/*.jsonl for sessions
 * that haven't been harvested yet. Extracts conversation, sends to
 * Ollama for summary, deposits to vault.
 *
 * PM2 cron: runs every 6 hours
 * Telegram: /harvest-terminal
 * Manual: node terminal-harvester.js [--force]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSIONS_DIR = path.join(process.env.HOME, '.claude/projects/-Users-basicclaw777');
const STATE_PATH = path.join(__dirname, 'terminal-harvest-state.json');
const VAULT_DEST = path.join(process.env.HOME, 'cathedral-vault/00_Staging/cathedral');
const OLLAMA_URL = 'http://localhost:11434/api/generate';

function loadState() {
  if (!fs.existsSync(STATE_PATH)) return { harvested: {} };
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function parseSession(filepath) {
  const lines = fs.readFileSync(filepath, 'utf8').split('\n').filter(Boolean);
  const messages = [];
  let sessionId = null;

  for (const line of lines) {
    try {
      const d = JSON.parse(line);
      if (!sessionId && d.sessionId) sessionId = d.sessionId;

      if (d.type === 'user' && d.message?.content) {
        const content = typeof d.message.content === 'string'
          ? d.message.content
          : Array.isArray(d.message.content)
            ? d.message.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
            : '';
        // Skip system reminders
        if (content && !content.startsWith('<system')) {
          messages.push({ role: 'user', text: content.slice(0, 500), ts: d.timestamp });
        }
      } else if (d.type === 'assistant' && d.message?.content) {
        const content = typeof d.message.content === 'string'
          ? d.message.content
          : Array.isArray(d.message.content)
            ? d.message.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
            : '';
        if (content && content.length > 20) {
          messages.push({ role: 'assistant', text: content.slice(0, 500), ts: d.timestamp });
        }
      }
    } catch (e) { /* skip malformed lines */ }
  }

  return { sessionId, messages };
}

async function summarizeSession(messages) {
  // Build condensed transcript
  const transcript = messages
    .slice(0, 80) // cap at 80 messages for context
    .map(m => `[${m.role}]: ${m.text}`)
    .join('\n\n');

  const prompt = `You are a session harvester for a software project called The Cathedral.

Analyze this Claude Code terminal session transcript and extract:

1. BUILDS: What was built/created/installed? (scripts, commands, integrations, files)
2. DECISIONS: What architectural or design decisions were made?
3. DISCOVERIES: What was learned or figured out? (debugging insights, failed approaches, working solutions)
4. CONVERSATIONS: Any valuable ideas, methods, or philosophical insights discussed?
5. STATUS: What's the current state at end of session?

Be specific — include file paths, command names, what worked and what didn't.
Skip routine file reads and searches — focus on outcomes.
If the session was trivial (just a few messages, no real work), respond with "TRIVIAL" only.

TRANSCRIPT:
${transcript}`;

  const resp = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'hermes3',
      prompt,
      stream: false,
      options: { temperature: 0.3, num_predict: 1000 }
    })
  });

  const data = await resp.json();
  return data.response?.trim() || '';
}

function depositToVault(sessionId, summary, messageCount, firstTs) {
  const date = firstTs ? firstTs.split('T')[0] : new Date().toISOString().split('T')[0];
  const filename = `terminal-harvest-${date}-${sessionId.slice(0, 8)}.md`;
  const filepath = path.join(VAULT_DEST, filename);

  const content = `---
title: "Terminal Session Harvest — ${date}"
source: claude-code-terminal
session_id: ${sessionId}
messages: ${messageCount}
date: ${date}
type: auto-harvest
---

# Terminal Session Harvest — ${date}

${summary}
`;

  fs.writeFileSync(filepath, content);
  return { filename, filepath };
}

export async function harvestTerminalSessions(options = {}) {
  const state = loadState();
  const force = options.force || false;
  const results = [];

  // Find all session JSONL files
  const files = fs.readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({
      name: f,
      path: path.join(SESSIONS_DIR, f),
      sessionId: f.replace('.jsonl', ''),
      mtime: fs.statSync(path.join(SESSIONS_DIR, f)).mtime
    }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const file of files) {
    // Skip already harvested (unless force)
    if (!force && state.harvested[file.sessionId]) continue;

    // Skip tiny files (< 5KB = probably trivial)
    const stats = fs.statSync(file.path);
    if (stats.size < 5000) {
      state.harvested[file.sessionId] = { skipped: true, reason: 'too_small', date: new Date().toISOString() };
      continue;
    }

    // Skip files modified in last 30 min (session might be active)
    const age = Date.now() - file.mtime.getTime();
    if (age < 30 * 60 * 1000) continue;

    try {
      const { sessionId, messages } = parseSession(file.path);
      if (messages.length < 6) {
        state.harvested[file.sessionId] = { skipped: true, reason: 'few_messages', date: new Date().toISOString() };
        continue;
      }

      const summary = await summarizeSession(messages);

      if (summary === 'TRIVIAL' || summary.length < 50) {
        state.harvested[file.sessionId] = { skipped: true, reason: 'trivial', date: new Date().toISOString() };
        continue;
      }

      const firstTs = messages[0]?.ts || '';
      const { filename } = depositToVault(file.sessionId, summary, messages.length, firstTs);

      state.harvested[file.sessionId] = {
        harvested: true,
        filename,
        messages: messages.length,
        date: new Date().toISOString()
      };

      results.push({ sessionId: file.sessionId.slice(0, 8), filename, messages: messages.length });
    } catch (err) {
      state.harvested[file.sessionId] = { skipped: true, reason: `error: ${err.message}`, date: new Date().toISOString() };
    }
  }

  saveState(state);
  return results;
}

export function formatHarvestReport(results) {
  if (results.length === 0) return '📋 No new terminal sessions to harvest.';
  let msg = `📋 *Terminal Harvest*\n\n`;
  for (const r of results) {
    msg += `✅ Session ${r.sessionId}… → ${r.filename} (${r.messages} msgs)\n`;
  }
  return msg;
}

// CLI mode
if (process.argv[1] && process.argv[1].endsWith('terminal-harvester.js')) {
  const force = process.argv.includes('--force');
  harvestTerminalSessions({ force }).then(results => {
    console.log(formatHarvestReport(results));
  }).catch(err => {
    console.error('Harvest error:', err.message);
    process.exit(1);
  });
}
