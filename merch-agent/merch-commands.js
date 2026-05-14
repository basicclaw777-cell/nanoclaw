/**
 * merch-commands.js — /merch Telegram command
 *
 * Subcommands:
 *   /merch                    — active run status
 *   /merch new [idea]         — start new merch run
 *   /merch suppliers          — show supplier list
 *   /merch status             — current run status
 *   /merch sample [notes]     — log sample received
 *   /merch approve            — mark sample approved
 *   /merch order [qty]        — log order placed
 *   /merch delivered          — mark order received
 *   /merch history            — past runs
 *   /merch idea [idea]        — add to backlog (not a run)
 *   /merch ideas              — show backlog
 */

import {
  createRun, getActiveRuns, logSample, approveRun, logOrder,
  markDelivered, formatStatusTelegram, formatHistoryTelegram,
  addIdea, getIdeas, PAULS_RULES
} from './merch-state.js';
import { formatSuppliersTelegram } from './supplier-db.js';

export function registerMerchCommands(bot) {
  bot.onText(/\/merch(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const raw = (match[1] || '').trim();
    const args = raw.split(/\s+/);
    const sub = args[0]?.toLowerCase() || '';

    try {
      switch (sub) {
        case '':
        case 'status': {
          const text = formatStatusTelegram();
          await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
          break;
        }

        case 'new': {
          const idea = args.slice(1).join(' ');
          if (!idea) {
            await bot.sendMessage(chatId, 'Usage: /merch new <idea description>');
            break;
          }
          const run = createRun(idea);
          let text = `👕 *New Merch Run*\n\n`;
          text += `ID: \`${run.id}\`\n`;
          text += `Idea: ${run.idea}\n`;
          text += `Material: ${run.material}\n\n`;
          text += `*Paul's Rules:*\n`;
          for (const rule of PAULS_RULES) text += `• ${rule}\n`;
          text += `\n_Next: find supplier, request sample._`;
          await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
          break;
        }

        case 'suppliers': {
          const text = formatSuppliersTelegram();
          await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
          break;
        }

        case 'sample': {
          const notes = args.slice(1).join(' ') || 'Sample received';
          const active = getActiveRuns();
          if (active.length === 0) {
            await bot.sendMessage(chatId, 'No active runs. Start with /merch new [idea]');
            break;
          }
          const latest = active[active.length - 1];
          const run = logSample(latest.id, notes);
          await bot.sendMessage(chatId, `🔍 Sample logged for \`${run.id}\`\n\n_${notes}_\n\nApprove: /merch approve\nReject: add notes and try another supplier.`, { parse_mode: 'Markdown' });
          break;
        }

        case 'approve': {
          const active = getActiveRuns();
          const toApprove = active.find(r => r.status === 'sample_received');
          if (!toApprove) {
            await bot.sendMessage(chatId, 'No runs with samples to approve.');
            break;
          }
          const run = approveRun(toApprove.id);
          await bot.sendMessage(chatId, `✅ *Approved:* ${run.idea}\n\nNext: /merch order [qty]`, { parse_mode: 'Markdown' });
          break;
        }

        case 'order': {
          const qty = parseInt(args[1]);
          if (!qty || qty < 1) {
            await bot.sendMessage(chatId, 'Usage: /merch order <quantity>');
            break;
          }
          const active = getActiveRuns();
          const toOrder = active.find(r => r.status === 'approved');
          if (!toOrder) {
            await bot.sendMessage(chatId, 'No approved runs to order. Approve a sample first.');
            break;
          }
          const run = logOrder(toOrder.id, qty);
          let text = `📦 *Order Placed:* ${run.idea}\n`;
          text += `Qty: ${qty}\n`;
          if (run.total_cost) text += `Total: HK$${run.total_cost}\n`;
          text += `\n_Next: /merch delivered when stock arrives._`;
          await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
          break;
        }

        case 'delivered': {
          const active = getActiveRuns();
          const toDeliver = active.find(r => r.status === 'ordered');
          if (!toDeliver) {
            await bot.sendMessage(chatId, 'No ordered runs pending delivery.');
            break;
          }
          const run = markDelivered(toDeliver.id);
          await bot.sendMessage(chatId, `✅ *Delivered:* ${run.idea}\n\nStock received ${run.delivery_date.split('T')[0]}.`, { parse_mode: 'Markdown' });
          break;
        }

        case 'history': {
          const text = formatHistoryTelegram();
          await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
          break;
        }

        case 'idea': {
          const idea = args.slice(1).join(' ');
          if (!idea) {
            await bot.sendMessage(chatId, 'Usage: /merch idea <description>');
            break;
          }
          const entry = addIdea(idea);
          await bot.sendMessage(chatId, `💡 Idea logged: _${idea}_\n\nView all: /merch ideas`, { parse_mode: 'Markdown' });
          break;
        }

        case 'ideas': {
          const ideas = getIdeas();
          if (ideas.length === 0) {
            await bot.sendMessage(chatId, '_No ideas in backlog. Add with /merch idea [description]_', { parse_mode: 'Markdown' });
            break;
          }
          let text = '💡 *Merch Ideas Backlog*\n\n';
          for (const i of ideas) {
            text += `• ${i.idea} _(${i.createdAt.split('T')[0]})_\n`;
          }
          text += `\nPromote to run: /merch new [idea]`;
          await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
          break;
        }

        default:
          await bot.sendMessage(chatId, `Unknown: ${sub}\nTry /merch for status, /merch new, /merch suppliers, /merch history`);
      }
    } catch (err) {
      console.error('[merch]', err);
      await bot.sendMessage(chatId, `Merch error: ${err.message}`);
    }
  });
}
