import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
  } catch { return null; }
}

function fmtPnl(n) {
  const sign = n >= 0 ? '+' : '';
  return `${sign}$${n.toFixed(2)}`;
}

function fmtPct(n) {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

function buildDcaSummary() {
  const p = readJSON('long-term-portfolio.json');
  if (!p) return 'Long-term portfolio not available.';

  const weeks = Math.ceil((Date.now() - new Date(p.started).getTime()) / 604800000);
  const totalPnlPct = ((p.unrealised_pnl / p.total_invested) * 100);

  let msg = `*Long-Term DCA Portfolio*\n`;
  msg += `Week ${weeks} since ${p.started}\n\n`;
  msg += `Invested: $${p.total_invested.toLocaleString()}\n`;
  msg += `Value: $${p.total_value.toLocaleString()}\n`;
  msg += `P&L: ${fmtPnl(p.unrealised_pnl)} (${fmtPct(totalPnlPct)})\n\n`;

  for (const [asset, pos] of Object.entries(p.positions || {})) {
    msg += `*${asset}*: ${pos.qty.toFixed(4)} @ $${pos.avg_price.toFixed(0)}`;
    msg += ` → ${fmtPnl(pos.unrealised_pnl)} (${fmtPct(pos.unrealised_pct)})\n`;
  }

  msg += `\nDCA: $${p.dca_schedule.btc_weekly}/wk BTC + $${p.dca_schedule.eth_weekly}/wk ETH`;
  return msg;
}

function buildStrategySummary() {
  const corner = readJSON('corner-advice.json');
  const portfolio = readJSON('portfolio.json');
  if (!corner || !portfolio) return 'Active trader data not available.';

  let msg = `*Active Trader — Paper Trial ${portfolio.trial || '?'}*\n`;
  msg += `Balance: $${portfolio.balance?.toFixed(2)} (${fmtPnl(portfolio.total_pnl || 0)})\n`;
  msg += `Trades: ${portfolio.total_trades} (${portfolio.wins}W/${portfolio.losses}L)\n`;
  const wr = portfolio.total_trades ? ((portfolio.wins / portfolio.total_trades) * 100).toFixed(1) : '0';
  msg += `Win rate: ${wr}%\n\n`;

  if (corner.strategy_rankings) {
    msg += `*Strategy Scoreboard*\n`;
    const sorted = [...corner.strategy_rankings].sort((a, b) => (b.pnl || 0) - (a.pnl || 0));
    for (const s of sorted) {
      const icon = s.pnl >= 0 ? '🟢' : '🔴';
      const mult = corner.multipliers?.[s.strategy];
      const benched = mult !== undefined && mult < 0.2 ? ' [BENCHED]' : '';
      msg += `${icon} ${s.strategy}: ${s.wins}W/${s.losses}L ${fmtPnl(s.pnl)}${benched}\n`;
    }
  }

  return msg;
}

function buildFullSummary() {
  const dca = buildDcaSummary();
  const strat = buildStrategySummary();

  let msg = `*The Trader — Glance View*\n`;
  msg += `${'─'.repeat(24)}\n\n`;
  msg += dca + '\n\n';
  msg += `${'─'.repeat(24)}\n\n`;
  msg += strat + '\n\n';
  msg += `${'─'.repeat(24)}\n`;
  msg += `_"The boring simple strategy (DCA) beats the complex AI one. That IS the finding."_`;

  return msg;
}

export function registerTraderCommands(bot) {
  bot.onText(/^\/trader(?:@\w+)?\s*$/i, async (msg) => {
    try {
      await bot.sendMessage(msg.chat.id, buildFullSummary(), { parse_mode: 'Markdown' });
    } catch (e) { console.error('[trader]', e.message); }
  });

  bot.onText(/^\/invest(?:@\w+)?\s*$/i, async (msg) => {
    try {
      await bot.sendMessage(msg.chat.id, buildDcaSummary(), { parse_mode: 'Markdown' });
    } catch (e) { console.error('[invest]', e.message); }
  });

  bot.onText(/^\/strategies(?:@\w+)?\s*$/i, async (msg) => {
    try {
      await bot.sendMessage(msg.chat.id, buildStrategySummary(), { parse_mode: 'Markdown' });
    } catch (e) { console.error('[strategies]', e.message); }
  });

  bot.onText(/^\/testidea(?:@\w+)?\s+(.+)$/is, async (msg, match) => {
    try {
      const idea = match[1].trim();
      const entry = {
        timestamp: new Date().toISOString(),
        idea,
        status: 'pending',
        source: 'telegram'
      };

      const ideasPath = path.join(__dirname, 'ideas-inbox.json');
      let ideas = [];
      try { ideas = JSON.parse(fs.readFileSync(ideasPath, 'utf8')); } catch {}
      ideas.push(entry);
      fs.writeFileSync(ideasPath, JSON.stringify(ideas, null, 2));

      await bot.sendMessage(msg.chat.id, `*Idea logged*\n\n"${idea}"\n\nSaved to ideas inbox. Next Forge session will evaluate and paper-test it.`, { parse_mode: 'Markdown' });
    } catch (e) { console.error('[testidea]', e.message); }
  });
}
