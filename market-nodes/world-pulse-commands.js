import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readPulse() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'world-pulse.json'), 'utf8'));
  } catch { return null; }
}

function buildWorldPulse() {
  const data = readPulse();
  if (!data) return 'World Pulse data not available. Run scan first.';

  let msg = `*World Pulse — ${data.scan_date}*\n`;
  msg += `${data.total_symbols} markets tracked\n`;
  msg += `${'─'.repeat(28)}\n\n`;

  if (data.biggest_movers_up?.length) {
    msg += `*Biggest Movers UP*\n`;
    for (const m of data.biggest_movers_up) {
      msg += `${m.icon} ${m.name}: +${m.change}%\n`;
    }
    msg += '\n';
  }

  if (data.biggest_movers_down?.length) {
    msg += `*Biggest Movers DOWN*\n`;
    for (const m of data.biggest_movers_down) {
      msg += `${m.icon} ${m.name}: ${m.change}%\n`;
    }
    msg += '\n';
  }

  const catLabels = {
    indices: 'Stock Indices',
    precious_metals: 'Precious Metals',
    energy: 'Energy',
    industrial_metals: 'Industrial Metals',
    agriculture: 'Agriculture',
    crypto: 'Crypto',
    forex: 'Forex',
    reits_property: 'REITs / Property',
    alternatives: 'Alternatives',
  };

  for (const [cat, items] of Object.entries(data.categories)) {
    const label = catLabels[cat] || cat;
    msg += `*${label}*\n`;
    for (const item of items) {
      const dir = item.change_1m_pct >= 0 ? '▲' : '▼';
      const sign = item.change_1m_pct >= 0 ? '+' : '';
      msg += `${item.icon} ${item.name}: ${item.price} ${sign}${item.change_1m_pct}% (1m) ${sign.replace('+', item.change_3m_pct >= 0 ? '+' : '')}${item.change_3m_pct}% (3m)\n`;
    }
    msg += '\n';
  }

  msg += `_/worldpulse for this · Dashboard: localhost:8080/world-pulse_`;
  return msg;
}

function buildMoversOnly() {
  const data = readPulse();
  if (!data) return 'No data.';

  let msg = `*World Pulse Movers — ${data.scan_date}*\n`;
  msg += `${'─'.repeat(28)}\n\n`;

  if (data.biggest_movers_up?.length) {
    msg += `*UP (>5% this month)*\n`;
    for (const m of data.biggest_movers_up) {
      msg += `${m.icon} ${m.name}: +${m.change}% _(${m.category.replace(/_/g, ' ')})_\n`;
    }
    msg += '\n';
  }

  if (data.biggest_movers_down?.length) {
    msg += `*DOWN (>5% this month)*\n`;
    for (const m of data.biggest_movers_down) {
      msg += `${m.icon} ${m.name}: ${m.change}% _(${m.category.replace(/_/g, ' ')})_\n`;
    }
  }

  return msg;
}

export function registerWorldPulseCommands(bot) {
  bot.onText(/^\/worldpulse(?:@\w+)?\s*$/i, async (msg) => {
    try {
      const report = buildWorldPulse();
      const chunks = [];
      let current = '';
      for (const line of report.split('\n')) {
        if ((current + '\n' + line).length > 4000) {
          chunks.push(current);
          current = line;
        } else {
          current += (current ? '\n' : '') + line;
        }
      }
      if (current) chunks.push(current);
      for (const chunk of chunks) {
        await bot.sendMessage(msg.chat.id, chunk, { parse_mode: 'Markdown' });
      }
    } catch (e) { console.error('[worldpulse]', e.message); }
  });

  bot.onText(/^\/movers(?:@\w+)?\s*$/i, async (msg) => {
    try {
      await bot.sendMessage(msg.chat.id, buildMoversOnly(), { parse_mode: 'Markdown' });
    } catch (e) { console.error('[movers]', e.message); }
  });
}
