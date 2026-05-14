/**
 * comms-commands.js — /comms Telegram command
 *
 * Subcommands:
 *   /comms           — outbox summary
 *   /comms queue     — show pending messages
 *   /comms expiry    — scan pass expiry, generate messages
 *   /comms lapsed    — scan lapsed members, generate messages
 *   /comms birthdays — scan upcoming birthdays
 *   /comms send <id> — mark message as sent
 *   /comms skip <id> — skip a message
 */

import { formatQueueTelegram, getQueueSummary, markSent, skip, getPending } from './comms-queue.js';
import { scanPassExpiry, formatExpiryTelegram } from './pass-expiry-trigger.js';
import { formatLapsedTelegram } from './lapsed-segmentation.js';
import { formatBirthdaysTelegram } from './birthday-tracker.js';

export function registerCommsCommands(bot) {
  bot.onText(/\/comms(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const args = (match[1] || '').trim().split(/\s+/);
    const sub = args[0]?.toLowerCase() || '';

    try {
      switch (sub) {
        case '': {
          // Summary dashboard
          const summary = getQueueSummary();
          let text = `📬 *Comms Engine*\n\n`;
          text += `Outbox: ${summary.pending} pending | ${summary.sent} sent | ${summary.skipped} skipped\n`;
          text += `Total: ${summary.total}\n\n`;
          text += `Commands:\n`;
          text += `/comms queue — view pending messages\n`;
          text += `/comms expiry — scan pass expiry\n`;
          text += `/comms lapsed — scan lapsed members\n`;
          text += `/comms birthdays — check upcoming birthdays\n`;
          text += `/comms send <id> — mark as sent\n`;
          text += `/comms skip <id> — skip a message\n`;
          await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
          break;
        }

        case 'queue': {
          const text = formatQueueTelegram();
          await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
          break;
        }

        case 'expiry': {
          const text = formatExpiryTelegram();
          await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
          break;
        }

        case 'lapsed': {
          // Optional: /comms lapsed warm 10
          const segment = args[1];
          const limit = parseInt(args[2]) || 20;
          const opts = {};
          if (segment && ['warm', 'cool', 'cold'].includes(segment)) {
            opts.segments = [segment];
          }
          opts.limit = limit;
          const text = formatLapsedTelegram(opts);
          await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
          break;
        }

        case 'birthdays': {
          const days = parseInt(args[1]) || 7;
          const text = formatBirthdaysTelegram(days);
          await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
          break;
        }

        case 'send': {
          const msgId = args[1];
          if (!msgId) {
            await bot.sendMessage(chatId, 'Usage: /comms send <message-id>');
            break;
          }
          const item = markSent(msgId);
          if (item) {
            await bot.sendMessage(chatId, `✅ Marked as sent: ${item.memberName}`);
          } else {
            await bot.sendMessage(chatId, `Message not found: ${msgId}`);
          }
          break;
        }

        case 'skip': {
          const msgId = args[1];
          if (!msgId) {
            await bot.sendMessage(chatId, 'Usage: /comms skip <message-id>');
            break;
          }
          const item = skip(msgId);
          if (item) {
            await bot.sendMessage(chatId, `⏭ Skipped: ${item.memberName}`);
          } else {
            await bot.sendMessage(chatId, `Message not found: ${msgId}`);
          }
          break;
        }

        default:
          await bot.sendMessage(chatId, `Unknown subcommand: ${sub}\nTry /comms for help.`);
      }
    } catch (err) {
      console.error('[comms]', err);
      await bot.sendMessage(chatId, `Comms error: ${err.message}`);
    }
  });
}
