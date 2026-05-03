/**
 * Basic Reflex — Boxing Commands for Telegram Bot
 * ESM wrapper for the CJS combination validator and rhythm engine.
 */

import {
  validatePunchCombo,
  validateDefenseChain,
  validateFootworkChain,
  validateIntegratedSequence,
  validateDefenseToCounter,
  PUNCHES,
  DEFENSES,
  FOOTWORK,
} from './combination-validator.js';

import {
  generateFromRudiment,
  generateClickTrack,
  listRudiments,
  RUDIMENTS,
  SUBDIVISIONS,
} from './rhythm-engine.js';

// Cuban codex aliases
const CUBAN_CODEX = {
  rac: 'jab', raa: 'jab_body',
  rpc: 'cross', rpa: 'rear_body',
  gac: 'lead_hook', gaa: 'lead_body',
  gpc: 'rear_hook', gpa: 'rear_body',
  cac: 'lead_hook', caa: 'lead_body',   // crosses map to hooks in Paul's system
  cpc: 'rear_hook', cpa: 'rear_body',
};

function resolveAlias(name) {
  const lower = name.toLowerCase().trim();
  return CUBAN_CODEX[lower] || lower;
}

/**
 * Register boxing commands on a Telegram bot instance.
 * @param {TelegramBot} bot
 */
export function registerBoxingCommands(bot) {

  // ── /combo — Validate a punch combination ─────────────────────────────────
  bot.onText(/^\/combo(?:@\w+)?\s+(.+)$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const input = match[1].trim();
    const punches = input.split(/[\s,→\-]+/).map(resolveAlias);

    const result = validatePunchCombo(punches);

    let response = `🥊 *Combo Validator*\n`;
    response += `Sequence: ${punches.join(' → ')}\n`;
    response += `Result: ${result.valid ? '✅ VALID' : '❌ INVALID'}\n`;
    response += `Type: ${result.comboType}\n`;
    response += `Weight: ${result.weightTrace.join(' → ')}\n\n`;

    for (const t of result.transitions) {
      const icon = t.verdict === 'VALID' ? '✓' : '✗';
      response += `${icon} [${t.position}] ${t.action}`;
      if (t.reason) response += ` — ${t.reason}`;
      response += '\n';
    }

    if (result.commitmentGaps.length > 0) {
      response += `\n⚠️ Commitment gaps at: ${result.commitmentGaps.map(g => `${g.punch} (#${g.position})`).join(', ')}`;
    }

    if (result.suggestions.length > 0) {
      for (const s of result.suggestions) {
        response += `\n💡 ${s.warning}`;
      }
    }

    bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
  });

  // ── /defense — Validate a defense chain ───────────────────────────────────
  bot.onText(/^\/defense(?:@\w+)?\s+(.+)$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const defenses = match[1].trim().split(/[\s,→\-]+/);

    const result = validateDefenseChain(defenses);

    let response = `🛡 *Defense Chain Validator*\n`;
    response += `Sequence: ${defenses.join(' → ')}\n\n`;

    for (const t of result.transitions) {
      const icon = t.verdict === 'VALID' ? '✓' : t.verdict === 'WEAK' ? '⚠' : '✗';
      response += `${icon} [${t.position}] ${t.action} (${t.axis})`;
      if (t.compatibility) response += ` [${t.compatibility}]`;
      if (t.reason) response += `\n  → ${t.reason}`;
      response += '\n';
    }

    if (result.countersLoaded.length > 0) {
      response += `\nCounters loaded:\n`;
      for (const c of result.countersLoaded) {
        response += `  ${c.defense} → ${c.counters.join(', ')}\n`;
      }
    }

    bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
  });

  // ── /counter — Validate defense-to-counter ────────────────────────────────
  bot.onText(/^\/counter(?:@\w+)?\s+(\S+)\s+(.+)$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const defense = match[1].trim();
    const counterCombo = match[2].trim().split(/[\s,→\-]+/).map(resolveAlias);

    const result = validateIntegratedSequence(defense, counterCombo);

    let response = `🥊🛡 *Integrated Sequence*\n`;
    response += `Defense: ${defense}\n`;
    response += `Counter: ${counterCombo.join(' → ')}\n\n`;
    response += `Defense→Counter: ${result.defense.valid ? '✅' : '❌'} ${result.defense.reason}\n`;
    response += `Combination: ${result.combination.valid ? '✅' : '❌'}\n`;
    response += `Integrated: ${result.integrated ? '✅ FULL CHAIN VALID' : '❌ CHAIN BROKEN'}\n`;

    if (result.fourOutputs) {
      response += `\nFour Outputs:\n`;
      response += `  1. Counter loaded ✓\n`;
      response += `  2. Frame disrupted (live context)\n`;
      response += `  3. Opponent exposed (live context)\n`;
      response += `  4. ${result.fourOutputs.positionalIntelligence}\n`;
    }

    bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
  });

  // ── /rudiment — Generate a rhythm combination ─────────────────────────────
  bot.onText(/^\/rudiment(?:@\w+)?(?:\s+(\S+))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const name = match?.[1]?.toLowerCase();

    if (!name) {
      // List all rudiments
      const all = listRudiments();
      let response = `🥁 *Drumming-Brain Rhythm Engine*\n\nAvailable rudiments:\n\n`;
      for (const r of all) {
        const icon = r.valid ? '✓' : '⚠';
        response += `${icon} \`/rudiment ${r.key}\`\n  ${r.name} — ${r.combination}\n\n`;
      }
      response += `Use \`/rudiment <name>\` for details + click track.`;
      bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
      return;
    }

    const result = generateFromRudiment(name);
    if (result.error) {
      bot.sendMessage(chatId, `❌ ${result.error}`);
      return;
    }

    let response = `🥁 *${result.rudiment}*\n`;
    response += `${result.description}\n\n`;
    response += `Sticking: \`${result.sticking}\`\n`;
    response += `Subdivision: ${result.subdivision.name} (${result.subdivision.description})\n`;
    response += `Combo: ${result.combinationDisplay.join(' → ')}\n`;
    response += `Valid: ${result.validation.valid ? '✅' : '⚠️ Needs reset between reps'}\n`;
    response += `Suggested BPM: ${result.bpmSuggestion}\n`;

    if (result.validation.weightTrace) {
      response += `Weight: ${result.validation.weightTrace.join(' → ')}\n`;
    }

    // Click track preview
    const track = generateClickTrack(name, result.bpmSuggestion, 2);
    response += `\nClick track (${result.bpmSuggestion} BPM × 2 reps, ${(track.totalDurationMs / 1000).toFixed(1)}s):\n`;
    for (const t of track.track.slice(0, 8)) {
      const marker = t.accent ? '>' : t.isGhost ? '·' : '-';
      const label = t.punch === 'FEINT' ? 'feint' : t.punch;
      response += `  ${String(t.timeMs).padStart(5)}ms ${marker} ${label}\n`;
    }
    if (track.track.length > 8) response += `  ... (${track.track.length - 8} more events)\n`;

    bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
  });

  // ── /punches — List valid punches ─────────────────────────────────────────
  bot.onText(/^\/punches(?:@\w+)?$/i, async (msg) => {
    let response = `🥊 *Valid Punches*\n\nEnglish → Cuban Code:\n\n`;
    const entries = [
      ['jab', 'RAC'], ['jab_body', 'RAA'], ['cross', 'RPC'], ['rear_body', 'RPA'],
      ['lead_hook', 'GAC'], ['lead_body', 'GAA'], ['rear_hook', 'GPC'],
      ['lead_uppercut', '—'], ['rear_uppercut', '—'], ['overhand', '—'],
    ];
    for (const [eng, cuban] of entries) {
      response += `  \`${eng}\` (${cuban})\n`;
    }
    response += `\nUse either name in /combo, /counter commands.`;
    bot.sendMessage(msg.chat.id, response, { parse_mode: 'Markdown' });
  });
}
