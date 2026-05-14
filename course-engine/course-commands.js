/**
 * course-commands.js — /course Telegram command
 *
 * Subcommands:
 *   /course                — overview status
 *   /course outline        — 10-module structure
 *   /course module [1-10]  — specific module detail
 *   /course filming [1-10] — filming brief for module
 *   /course authority      — source citation count and gaps
 *   /course status         — overall course build progress
 *   /course pricing        — revenue projections
 */

import { getCourseOutline, generateCourseOutline, getCourseStatus, getModule } from './course-structure.js';
import { getAuthorityMap, buildAuthorityMap, getSourceSummary } from './authority-engine.js';
import { generateFilmingBrief, getFilmingBrief } from './filming-briefs.js';
import { getDefaultProjection, getMarketData } from './pricing-model.js';

export function registerCourseCommands(bot) {
  bot.onText(/\/course(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const raw = (match[1] || '').trim();
    const args = raw.split(/\s+/);
    const sub = args[0]?.toLowerCase() || '';

    try {
      switch (sub) {
        case '':
        case 'status': {
          const status = getCourseStatus();
          let text = `*Cuban Boxing Course — Status*\n\n`;
          text += `Modules: ${status.modulesWithContent}/${status.totalModules} with content\n`;
          text += `Filming briefs: ${status.filmingBriefsGenerated}\n`;
          text += `Source citations: ${status.totalCitations}\n`;
          if (status.uncitedClaims > 0) text += `Gaps: ${status.uncitedClaims} claims need more backing\n`;
          text += `\n_${status.positioning}_`;
          await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
          break;
        }

        case 'outline': {
          const outline = getCourseOutline();
          let text = `*10-Block Cuban Boxing Course*\n`;
          text += `_${outline.positioning}_\n\n`;
          for (const mod of outline.modules) {
            const emoji = mod.techniques.punches.length > 0 ? '🥊' : mod.techniques.footwork.length > 0 ? '🦶' : '🛡';
            text += `${emoji} *Module ${mod.module}: ${mod.name}* — ${mod.subtitle}\n`;
            text += `   Stage ${mod.capabilityStage} | ${mod.techniques.punches.length} punches | ${mod.citations.length} citations\n\n`;
          }
          text += `Sources: ${outline.primarySources.length} | Total citations: ${outline.totalCitations}`;
          await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
          break;
        }

        case 'module': {
          const num = parseInt(args[1]);
          if (!num || num < 1 || num > 10) {
            await bot.sendMessage(chatId, 'Usage: /course module [1-10]');
            break;
          }
          const mod = getModule(num);
          if (!mod) {
            await bot.sendMessage(chatId, `Module ${num} not found.`);
            break;
          }
          let text = `*Module ${mod.module}: ${mod.name}*\n`;
          text += `_${mod.subtitle}_\n\n`;
          text += `*Cuban equivalent:* ${mod.cubanEquivalent}\n`;
          text += `*Capability stage:* ${mod.capabilityStage}\n`;
          text += `*Sessions to advance:* ${mod.sessionsToAdvance || 'Unlimited'}\n\n`;

          text += `*Learning Objectives:*\n`;
          for (const obj of mod.learningObjectives) text += `• ${obj}\n`;

          text += `\n*Techniques:*\n`;
          if (mod.techniques.punches.length) text += `  Punches: ${mod.techniques.punches.join(', ')}\n`;
          if (mod.techniques.defenses.length) text += `  Defenses: ${mod.techniques.defenses.join(', ')}\n`;
          if (mod.techniques.footwork.length) text += `  Footwork: ${mod.techniques.footwork.join(', ')}\n`;
          text += `  Max combo: ${mod.techniques.maxComboLength}\n`;
          if (mod.techniques.rhythmUnlocked) text += `  Rhythm engine: UNLOCKED\n`;

          text += `\n*Gate:* ${mod.gate}\n`;

          text += `\n*Key Principles:*\n`;
          for (const p of mod.keyPrinciples) text += `• ${p}\n`;

          text += `\n*Citations:* ${mod.citations.length}`;
          for (const c of mod.citations.slice(0, 3)) {
            text += `\n  → "${c.claim}" — _${c.source}_`;
          }
          if (mod.citations.length > 3) text += `\n  ... and ${mod.citations.length - 3} more`;

          await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
          break;
        }

        case 'filming': {
          const num = parseInt(args[1]);
          if (!num || num < 1 || num > 10) {
            await bot.sendMessage(chatId, 'Usage: /course filming [1-10]');
            break;
          }
          let brief = getFilmingBrief(num);
          if (!brief) {
            brief = generateFilmingBrief(num);
          }
          if (!brief) {
            await bot.sendMessage(chatId, `Could not generate filming brief for module ${num}.`);
            break;
          }

          let text = `*Filming Brief — Module ${brief.module}: ${brief.name}*\n`;
          text += `_${brief.subtitle}_\n\n`;
          text += `*Duration:* ${brief.durationEstimate}\n`;
          text += `*Status:* ${brief.status}\n\n`;

          text += `*Shots (${brief.shots.length}):*\n`;
          for (const shot of brief.shots) {
            text += `  📸 [${shot.type}] ${shot.desc}\n`;
          }

          text += `\n*Talking Points:*\n`;
          for (const tp of brief.talkingPoints) {
            text += `  💬 ${tp.point}\n     _Source: ${tp.citation}_\n`;
          }

          text += `\n*Equipment:* ${brief.equipment.join(', ')}`;
          text += `\n\n_${brief.loganNote}_`;

          await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
          break;
        }

        case 'authority': {
          const summary = getSourceSummary();
          let text = `*Authority Map — Source Citations*\n\n`;
          text += `Total citations: *${summary.totalCitations}*\n`;
          text += `Primary sources: ${summary.sourceCount}\n\n`;

          text += `*By Source:*\n`;
          for (const [src, count] of Object.entries(summary.bySource)) {
            text += `  ${src}: ${count}\n`;
          }

          text += `\n*By Block:*\n`;
          for (let b = 1; b <= 10; b++) {
            const count = summary.byBlock[b] || 0;
            const bar = '█'.repeat(Math.min(count, 10));
            text += `  B${b}: ${bar} (${count})\n`;
          }

          if (summary.gaps.length > 0) {
            text += `\n*Gaps:*\n`;
            for (const g of summary.gaps) {
              text += `  ⚠️ Block ${g.block}: only ${g.citationCount} citations\n`;
            }
          } else {
            text += `\n✅ All blocks have 3+ citations.`;
          }

          await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
          break;
        }

        case 'pricing': {
          const proj = getDefaultProjection();
          const market = getMarketData();
          let text = `*Course Revenue Projector*\n\n`;
          text += `*Market:* ${market.competitorNote}\n`;
          text += `Closest comparable: $${market.closestComparable.price} (${market.closestComparable.type})\n\n`;

          text += `*Pricing:*\n`;
          text += `  Annual: $${proj.inputs.annualPrice}/year\n`;
          text += `  Monthly: $${proj.inputs.monthlyPrice}/month\n\n`;

          text += `*12-Month Projection:*\n`;
          text += `  Month 12 MRR: $${proj.summary.month12MRR.toLocaleString()}\n`;
          text += `  Month 12 ARR: $${proj.summary.month12ARR.toLocaleString()}\n`;
          text += `  Subscribers: ${proj.summary.month12Subscribers}\n`;
          text += `  Year 1 total: $${proj.summary.year1TotalRevenue.toLocaleString()}\n`;
          text += `  Break-even: Month ${proj.summary.breakEvenMonth}\n\n`;

          text += `*Differentiators:*\n`;
          for (const d of market.positioning.differentiators.slice(0, 4)) {
            text += `  • ${d}\n`;
          }

          await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
          break;
        }

        case 'generate': {
          const outline = generateCourseOutline();
          buildAuthorityMap();
          generateFilmingBrief(1);
          await bot.sendMessage(chatId, `Generated: ${outline.totalModules} modules, ${outline.totalCitations} citations, Module 1 filming brief. Check /course status.`);
          break;
        }

        default:
          await bot.sendMessage(chatId, `Unknown: ${sub}\nTry /course, /course outline, /course module [1-10], /course filming [1-10], /course authority, /course pricing`);
      }
    } catch (err) {
      console.error('[course]', err);
      await bot.sendMessage(chatId, `Course error: ${err.message}`);
    }
  });
}
