// ~/nanoclaw/session-tracker.js
// BR Session Tracker — Telegram-driven billing capture
//
// Two capture modes:
//   1. PUSH: Post-session inline keyboard prompt (scheduled via PM2 cron)
//   2. PULL: Voice/text command "/session [client] [done|cancel|noshow]"
//
// Ledger: ~/Cathedral/kit/{client}/ledger.json
// Clients config: ~/Cathedral/kit/session-clients.json

import fs from 'fs';
import path from 'path';

const HOME = process.env.HOME;
const KIT_DIR = path.join(HOME, 'Cathedral', 'kit');
const CLIENTS_FILE = path.join(KIT_DIR, 'session-clients.json');

const DEFAULT_CLIENTS = {
  alen:    { name: 'Alen',    rate: 800, type: 'PT',    folder: 'alen-sessions',    days: ['Monday', 'Thursday', 'Saturday'], groupRate: 150 },
  claire:  { name: 'Claire',  rate: 800, type: 'PT',    folder: 'claire-sessions',  days: ['Sunday', 'Saturday'] },
  cubanos: { name: 'Cubanos', rate: 500, type: 'Spar',  folder: 'cubanos-sessions', days: ['Tuesday'] },
  damien:  { name: 'Damien',  rate: 900, type: 'PT',    folder: 'damien-sessions',  days: ['Thursday'], active: false },
  francis: { name: 'Francis', rate: null, type: 'PT',   folder: 'francis-sessions', days: ['Wednesday', 'Friday'] },
  gil:     { name: 'Gil',     rate: 800, type: 'PT',    folder: 'gil-sessions',     days: [] },
  sana:    { name: 'Sana',    rate: 250, type: 'Group', folder: 'sana-sessions',    days: ['Tuesday', 'Thursday'] },
  teens:   { name: 'Teens',   rate: null, type: 'Group', folder: 'teens-sessions',  days: ['Friday'] },
  cindy:   { name: 'Cindy',   rate: 3000, type: 'Event', folder: 'cindy-sessions',  days: [], active: false },
};

function loadClients() {
  try {
    if (fs.existsSync(CLIENTS_FILE)) return JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf8'));
  } catch {}
  fs.writeFileSync(CLIENTS_FILE, JSON.stringify(DEFAULT_CLIENTS, null, 2));
  return DEFAULT_CLIENTS;
}

function saveClients(clients) {
  fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2));
}

function getLedgerPath(folder) {
  return path.join(KIT_DIR, folder, 'ledger.json');
}

function loadLedger(folder) {
  const p = getLedgerPath(folder);
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {}
  return { entries: [], created: new Date().toISOString() };
}

function saveLedger(folder, ledger) {
  const dir = path.join(KIT_DIR, folder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getLedgerPath(folder), JSON.stringify(ledger, null, 2));
}

function todayHK() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Hong_Kong' });
}

function dayNameHK() {
  return new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Hong_Kong', weekday: 'long' });
}

function addEntry(folder, entry) {
  const ledger = loadLedger(folder);
  const existing = ledger.entries.find(e => e.date === entry.date && e.client === entry.client);
  if (existing) return { duplicate: true, entry: existing };
  ledger.entries.push(entry);
  ledger.lastUpdated = new Date().toISOString();
  saveLedger(folder, ledger);
  return { duplicate: false, entry };
}

// ── Telegram integration ───────────────────────────────────────────

export function registerSessionCommands(bot, paulChatId) {
  const clients = loadClients();

  // /session — manual capture
  bot.onText(/^\/session(?:\s+(.+))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    if (paulChatId && chatId !== paulChatId) return;

    const args = (match[1] || '').trim().toLowerCase();

    if (!args) {
      const activeClients = Object.entries(clients)
        .filter(([, c]) => c.active !== false)
        .map(([key, c]) => `• *${c.name}* — $${c.rate || 'TBD'} (${c.type})`);

      await bot.sendMessage(chatId,
        `📋 *Session Tracker*\n\n` +
        `Usage: \`/session [client] [done|cancel|noshow]\`\n` +
        `Example: \`/session alen done\`\n\n` +
        `Active clients:\n${activeClients.join('\n')}\n\n` +
        `Or tap a button when prompted after sessions.`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const parts = args.split(/\s+/);
    const clientKey = parts[0];
    const action = parts[1] || 'done';

    const client = clients[clientKey];
    if (!client) {
      await bot.sendMessage(chatId, `Unknown client "${clientKey}". Try /session to see list.`);
      return;
    }

    if (action === 'done') {
      const entry = {
        date: todayHK(),
        day: dayNameHK(),
        client: client.name,
        type: client.type,
        rate: client.rate,
        status: 'done',
        source: 'manual',
        logged: new Date().toISOString(),
      };
      const result = addEntry(client.folder, entry);
      if (result.duplicate) {
        await bot.sendMessage(chatId, `⚠️ Already logged ${client.name} for today.`);
      } else {
        const amt = client.rate ? `$${client.rate}` : 'rate TBD';
        await bot.sendMessage(chatId, `✅ *${client.name}* session logged — ${amt}\n📅 ${entry.date}`, { parse_mode: 'Markdown' });
      }
    } else if (action === 'cancel' || action === 'noshow') {
      const entry = {
        date: todayHK(),
        day: dayNameHK(),
        client: client.name,
        type: client.type,
        rate: 0,
        status: action,
        source: 'manual',
        logged: new Date().toISOString(),
      };
      addEntry(client.folder, entry);
      await bot.sendMessage(chatId, `📝 ${client.name} — ${action} logged for ${todayHK()}`);
    } else if (action === 'rate') {
      const newRate = parseInt(parts[2]);
      if (!newRate || isNaN(newRate)) {
        await bot.sendMessage(chatId, `Usage: /session ${clientKey} rate 800`);
        return;
      }
      clients[clientKey].rate = newRate;
      saveClients(clients);
      await bot.sendMessage(chatId, `✅ ${client.name} rate set to $${newRate}`);
    }
  });

  // /billing — summary of what's owed
  bot.onText(/^\/billing(?:\s+(.+))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    if (paulChatId && chatId !== paulChatId) return;

    const target = (match[1] || '').trim().toLowerCase();
    const currentClients = loadClients();
    let lines = [];
    let grandTotal = 0;

    const clientList = target
      ? Object.entries(currentClients).filter(([k]) => k === target)
      : Object.entries(currentClients).filter(([, c]) => c.active !== false);

    for (const [key, client] of clientList) {
      const ledger = loadLedger(client.folder);
      const done = ledger.entries.filter(e => e.status === 'done');
      const unpaid = done.filter(e => !e.paid);
      const owed = unpaid.reduce((sum, e) => sum + (e.rate || 0), 0);
      grandTotal += owed;

      if (unpaid.length > 0 || target) {
        lines.push(`*${client.name}*: ${unpaid.length} sessions — $${owed.toLocaleString()}`);
        if (target) {
          const last5 = unpaid.slice(-5).map(e => `  ${e.date} ${e.type} $${e.rate || 'TBD'}`);
          lines.push(...last5);
          if (unpaid.length > 5) lines.push(`  ... and ${unpaid.length - 5} more`);
        }
      }
    }

    if (lines.length === 0) {
      await bot.sendMessage(chatId, 'No unpaid sessions in ledger. Use /session to start logging.');
      return;
    }

    const header = target
      ? `📊 *${currentClients[target]?.name || target} Billing*`
      : `📊 *BR Billing Summary*\nTotal: *$${grandTotal.toLocaleString()}*\n`;

    await bot.sendMessage(chatId, `${header}\n${lines.join('\n')}`, { parse_mode: 'Markdown' });
  });
}

// ── Push prompt: call this from a cron to prompt after sessions ──────

export async function sendSessionPrompt(bot, chatId, clientKey) {
  const clients = loadClients();
  const client = clients[clientKey];
  if (!client || client.active === false) return;

  const rate = client.rate ? `$${client.rate}` : 'rate TBD';

  await bot.sendMessage(chatId,
    `🥊 *${client.name}* session today?\n${client.type} — ${rate}`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: `✅ Done ${rate}`, callback_data: `sess_done:${clientKey}` },
            { text: '❌ No show', callback_data: `sess_noshow:${clientKey}` },
          ],
          [
            { text: '🚫 Cancelled', callback_data: `sess_cancel:${clientKey}` },
            { text: '⏭ Skip', callback_data: `sess_skip:${clientKey}` },
          ],
        ],
      },
    }
  );
}

// ── Callback handler — wire into bot's callback_query ────────────

export function handleSessionCallback(query, bot) {
  const data = query.data;
  if (!data.startsWith('sess_')) return false;

  const [action, clientKey] = data.split(':');
  const clients = loadClients();
  const client = clients[clientKey];
  if (!client) return false;

  const chatId = query.message.chat.id;
  const msgId = query.message.message_id;

  if (action === 'sess_done') {
    const entry = {
      date: todayHK(),
      day: dayNameHK(),
      client: client.name,
      type: client.type,
      rate: client.rate,
      status: 'done',
      source: 'prompt',
      logged: new Date().toISOString(),
    };
    const result = addEntry(client.folder, entry);
    const label = result.duplicate ? '⚠️ Already logged' : `✅ $${client.rate || 'TBD'}`;

    bot.answerCallbackQuery(query.id, { text: label });
    bot.editMessageReplyMarkup(
      { inline_keyboard: [[{ text: label, callback_data: 'noop' }]] },
      { chat_id: chatId, message_id: msgId }
    );
  } else if (action === 'sess_noshow' || action === 'sess_cancel') {
    const status = action === 'sess_noshow' ? 'noshow' : 'cancel';
    addEntry(client.folder, {
      date: todayHK(),
      day: dayNameHK(),
      client: client.name,
      type: client.type,
      rate: 0,
      status,
      source: 'prompt',
      logged: new Date().toISOString(),
    });
    const label = status === 'noshow' ? '❌ No show' : '🚫 Cancelled';
    bot.answerCallbackQuery(query.id, { text: label });
    bot.editMessageReplyMarkup(
      { inline_keyboard: [[{ text: label, callback_data: 'noop' }]] },
      { chat_id: chatId, message_id: msgId }
    );
  } else if (action === 'sess_skip') {
    bot.answerCallbackQuery(query.id, { text: 'Skipped' });
    bot.editMessageReplyMarkup(
      { inline_keyboard: [[{ text: '⏭ Skipped', callback_data: 'noop' }]] },
      { chat_id: chatId, message_id: msgId }
    );
  }

  return true;
}

// ── Daily prompt runner — check which clients have sessions today ────

export async function runDailyPrompts(bot, chatId) {
  const clients = loadClients();
  const today = dayNameHK();
  let prompted = 0;

  for (const [key, client] of Object.entries(clients)) {
    if (client.active === false) continue;
    if (!client.days || !client.days.includes(today)) continue;

    await sendSessionPrompt(bot, chatId, key);
    prompted++;
  }

  return prompted;
}

// ── Monthly summary generator ───────────────────────────────────────

export function generateMonthlySummary(year, month) {
  const clients = loadClients();
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const lines = [];
  let total = 0;

  for (const [, client] of Object.entries(clients)) {
    const ledger = loadLedger(client.folder);
    const monthEntries = ledger.entries.filter(e => e.date.startsWith(prefix) && e.status === 'done');
    if (monthEntries.length === 0) continue;

    const owed = monthEntries.reduce((s, e) => s + (e.rate || 0), 0);
    total += owed;
    lines.push(`*${client.name}*: ${monthEntries.length} sessions — $${owed.toLocaleString()}`);
  }

  return {
    text: `📊 *Monthly Summary — ${prefix}*\nTotal: *$${total.toLocaleString()}*\n\n${lines.join('\n')}`,
    total,
    lines,
  };
}
