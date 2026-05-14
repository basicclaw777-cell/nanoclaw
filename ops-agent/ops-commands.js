/**
 * ops-commands.js — /ops Telegram command handler
 *
 * Subcommands:
 *   /ops finance  — P&L summary, commission, revenue
 *   /ops hr       — compliance calendar, leave balances, deadlines
 *   /ops schedule — class overview, member status
 *   /ops mpf      — MPF compliance check
 *   /ops          — summary of all
 *
 * Pattern: same as registerBoxingCommands — exports a function that
 * takes the bot instance and wires commands.
 * ESM module.
 */

import { formatCommissionTelegram } from './commission-calc.js';
import { formatPnLTelegram } from './monthly-pnl.js';
import { formatMPFTelegram } from './mpf-compliance.js';
import { formatHRCalendarTelegram } from './hr-calendar.js';
import { formatLeaveTelegram } from './leave-tracker.js';
import { formatScheduleTelegram } from './schedule-view.js';

export function registerOpsCommands(bot) {
  // /ops finance
  bot.onText(/^\/ops\s+finance$/i, async (msg) => {
    const chatId = msg.chat.id;
    try {
      const pnl = formatPnLTelegram();
      await bot.sendMessage(chatId, pnl, { parse_mode: 'Markdown' });
      const commission = formatCommissionTelegram();
      await bot.sendMessage(chatId, commission, { parse_mode: 'Markdown' });
    } catch (err) {
      await bot.sendMessage(chatId, `Ops finance error: ${err.message}`);
    }
  });

  // /ops hr
  bot.onText(/^\/ops\s+hr$/i, async (msg) => {
    const chatId = msg.chat.id;
    try {
      const calendar = formatHRCalendarTelegram();
      await bot.sendMessage(chatId, calendar, { parse_mode: 'Markdown' });
      const leave = formatLeaveTelegram();
      await bot.sendMessage(chatId, leave, { parse_mode: 'Markdown' });
    } catch (err) {
      await bot.sendMessage(chatId, `Ops HR error: ${err.message}`);
    }
  });

  // /ops schedule
  bot.onText(/^\/ops\s+schedule$/i, async (msg) => {
    const chatId = msg.chat.id;
    try {
      const sched = formatScheduleTelegram();
      await bot.sendMessage(chatId, sched, { parse_mode: 'Markdown' });
    } catch (err) {
      await bot.sendMessage(chatId, `Ops schedule error: ${err.message}`);
    }
  });

  // /ops mpf
  bot.onText(/^\/ops\s+mpf$/i, async (msg) => {
    const chatId = msg.chat.id;
    try {
      const mpf = formatMPFTelegram();
      await bot.sendMessage(chatId, mpf, { parse_mode: 'Markdown' });
    } catch (err) {
      await bot.sendMessage(chatId, `Ops MPF error: ${err.message}`);
    }
  });

  // /ops (no subcommand) — summary dashboard
  bot.onText(/^\/ops(?:@\w+)?$/i, async (msg) => {
    const chatId = msg.chat.id;
    try {
      let summary = `*Operations Dashboard*\n\n`;
      summary += `Use:\n`;
      summary += `  /ops finance — P&L + commission\n`;
      summary += `  /ops hr — compliance calendar + leave\n`;
      summary += `  /ops schedule — class overview\n`;
      summary += `  /ops mpf — MPF compliance\n\n`;

      // Quick status from each module
      const { checkMPFCompliance } = await import('./mpf-compliance.js');
      const { scanHRCalendar } = await import('./hr-calendar.js');

      const mpf = checkMPFCompliance();
      const hr = scanHRCalendar();
      const totalAlerts = mpf.alerts.length + hr.alerts.length;

      if (totalAlerts > 0) {
        summary += `*⚠️ ${totalAlerts} alert(s):*\n`;
        for (const a of [...mpf.alerts, ...hr.alerts]) {
          const icon = a.severity === 'critical' ? '🔴' : a.severity === 'warning' ? '🟡' : 'ℹ️';
          summary += `${icon} ${a.message}\n`;
        }
      } else {
        summary += `✅ No compliance alerts.\n`;
      }

      summary += `\nMPF deadline: ${mpf.nextDeadline} (${mpf.daysUntilDeadline}d)`;

      await bot.sendMessage(chatId, summary, { parse_mode: 'Markdown' });
    } catch (err) {
      await bot.sendMessage(chatId, `Ops error: ${err.message}`);
    }
  });
}

export default { registerOpsCommands };
