/**
 * growth-commands.js — /growth Telegram command
 *
 * Subcommands:
 *   /growth              — this week's content calendar
 *   /growth generate     — generate new weekly calendar
 *   /growth corporate    — corporate outreach pipeline
 *   /growth corporate add <company> <contact> <email> <industry> — add prospect
 *   /growth newsletter   — current newsletter draft status
 *   /growth newsletter generate — generate new newsletter draft
 *   /growth seo          — SEO checklist and keyword status
 *   /growth seo audit    — run SEO audit
 */

import { getCurrentCalendar, generateWeeklyCalendar, formatCalendarTelegram } from './content-calendar.js';
import { formatPipelineTelegram, addProspect, getPipelineSummary } from './corporate-outreach.js';
import { getCurrentNewsletter, generateNewsletter, formatNewsletterTelegram } from './newsletter-engine.js';
import { formatSEOTelegram, runAudit } from './seo-checklist.js';

export function registerGrowthCommands(bot) {
  bot.onText(/\/growth(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const args = (match[1] || '').trim().split(/\s+/);
    const sub = args[0]?.toLowerCase() || '';

    try {
      switch (sub) {
        case '': {
          // Show current calendar
          const cal = getCurrentCalendar();
          const text = formatCalendarTelegram(cal);
          await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
          break;
        }

        case 'generate': {
          await bot.sendMessage(chatId, '📅 Generating content calendar...');
          const cal = await generateWeeklyCalendar();
          const text = formatCalendarTelegram(cal);
          await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
          break;
        }

        case 'corporate': {
          const action = args[1]?.toLowerCase();
          if (action === 'add') {
            // /growth corporate add <company> <contact> <email> <industry>
            const company = args[2];
            const contact = args[3];
            const email = args[4];
            const industry = args[5] || 'general';
            if (!company || !contact || !email) {
              await bot.sendMessage(chatId, 'Usage: /growth corporate add <company> <contact_name> <email> <industry>');
              break;
            }
            const prospect = addProspect(company, contact, email, industry);
            await bot.sendMessage(chatId, `✅ Added: ${prospect.company} — ${prospect.contact_name}`);
          } else {
            const text = formatPipelineTelegram();
            await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
          }
          break;
        }

        case 'newsletter': {
          const action = args[1]?.toLowerCase();
          if (action === 'generate') {
            await bot.sendMessage(chatId, '📰 Generating newsletter draft...');
            const nl = await generateNewsletter();
            const text = formatNewsletterTelegram(nl);
            await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
          } else {
            const nl = getCurrentNewsletter();
            const text = formatNewsletterTelegram(nl);
            await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
          }
          break;
        }

        case 'seo': {
          const action = args[1]?.toLowerCase();
          if (action === 'audit') {
            const audit = runAudit();
            let text = `🔍 *SEO Audit Complete*\n`;
            text += `Pages with meta: ${audit.pagesWithMeta}/${audit.totalPages}\n`;
            text += `Blog: ${audit.blogPublished} published, ${audit.blogPlanned} planned\n`;
            text += `Keywords: ${audit.keywordsRanked}/${audit.keywordsTracked} ranked\n`;
            await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
          } else {
            const text = formatSEOTelegram();
            await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
          }
          break;
        }

        default:
          await bot.sendMessage(chatId, `Unknown: ${sub}\nTry /growth for calendar, /growth corporate, /growth newsletter, /growth seo`);
      }
    } catch (err) {
      console.error('[growth]', err);
      await bot.sendMessage(chatId, `Growth error: ${err.message}`);
    }
  });
}
