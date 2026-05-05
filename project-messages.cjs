// ~/nanoclaw/project-messages.cjs
// Inter-agent message directory for the Cathedral.
// Agents drop messages for projects. Agents read their project's inbox.
// Messages live at ~/Cathedral/projects/messages/{projectId}/
// Each message is a single JSON file: {timestamp}-{from}.json

const fs = require('fs');
const path = require('path');
const os = require('os');

const MESSAGES_DIR = path.join(os.homedir(), 'Cathedral', 'projects', 'messages');

function ensureInbox(projectId) {
  const dir = path.join(MESSAGES_DIR, projectId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Send a message to a project's inbox.
 * @param {string} to - Target project ID (e.g. 'boxing-app', 'universe', 'cathedral')
 * @param {string} from - Sender agent name (e.g. 'the-muse', 'cross-pulse')
 * @param {string} subject - One-line subject
 * @param {string} body - The message content
 * @param {object} meta - Optional metadata (domain, priority, etc.)
 */
function sendMessage(to, from, subject, body, meta = {}) {
  try {
    const dir = ensureInbox(to);
    const ts = Date.now();
    const filename = `${ts}-${from.replace(/[^a-z0-9-]/gi, '_')}.json`;
    const message = {
      ts,
      date: new Date(ts).toISOString(),
      from,
      to,
      subject,
      body,
      read: false,
      ...meta,
    };
    fs.writeFileSync(path.join(dir, filename), JSON.stringify(message, null, 2));
    return { ok: true, file: filename };
  } catch (err) {
    console.error(`[project-messages] Failed to send to ${to}:`, err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Read messages from a project's inbox.
 * @param {string} projectId - The project to read messages for
 * @param {object} opts - { unreadOnly: bool, limit: number, markRead: bool }
 */
function readMessages(projectId, opts = {}) {
  const { unreadOnly = false, limit = 20, markRead = false } = opts;
  const dir = path.join(MESSAGES_DIR, projectId);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse();

  const messages = [];
  for (const f of files) {
    if (messages.length >= limit) break;
    try {
      const msg = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (unreadOnly && msg.read) continue;
      msg._file = f;
      messages.push(msg);

      if (markRead && !msg.read) {
        msg.read = true;
        fs.writeFileSync(path.join(dir, f), JSON.stringify(msg, null, 2));
      }
    } catch {}
  }
  return messages;
}

/**
 * List all project inboxes that have messages.
 */
function listInboxes() {
  if (!fs.existsSync(MESSAGES_DIR)) return [];
  return fs.readdirSync(MESSAGES_DIR)
    .filter(d => {
      const full = path.join(MESSAGES_DIR, d);
      return fs.statSync(full).isDirectory() && fs.readdirSync(full).some(f => f.endsWith('.json'));
    })
    .map(d => {
      const files = fs.readdirSync(path.join(MESSAGES_DIR, d)).filter(f => f.endsWith('.json'));
      let unread = 0;
      for (const f of files) {
        try {
          const msg = JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, d, f), 'utf8'));
          if (!msg.read) unread++;
        } catch {}
      }
      return { projectId: d, total: files.length, unread };
    });
}

/**
 * Count unread messages for a project.
 */
function unreadCount(projectId) {
  const dir = path.join(MESSAGES_DIR, projectId);
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
    try {
      const msg = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (!msg.read) count++;
    } catch {}
  }
  return count;
}

module.exports = { sendMessage, readMessages, listInboxes, unreadCount, MESSAGES_DIR };
