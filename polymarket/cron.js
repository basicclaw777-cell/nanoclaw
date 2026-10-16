import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scan } from './scanner.js';
import { checkResolutions, generateReport } from './monitor.js';
import { getStatus } from './ledger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Cron entry point — scan + monitor + report to Telegram
function readEnv(key) {
  if (process.env[key]) return process.env[key];
  try {
    const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
    const m = env.match(new RegExp(`${key}=(.+)`));
    return m?.[1]?.trim() || null;
  } catch { return null; }
}

const TELEGRAM_BOT_TOKEN = readEnv('TELEGRAM_BOT_TOKEN');
const PAUL_CHAT_ID = readEnv('TELEGRAM_CHAT_ID');

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !PAUL_CHAT_ID) {
    console.log('[CRON] No Telegram config, skipping notification');
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: PAUL_CHAT_ID, text, parse_mode: 'HTML' })
    });
  } catch (e) {
    console.error('[CRON] Telegram send failed:', e.message);
  }
}

async function run() {
  const mode = process.argv[2] || 'scan';
  console.log(`[PM-CRON] Running mode: ${mode}`);

  if (mode === 'scan') {
    // Scan markets
    const result = await scan();
    console.log(`[PM-CRON] Scan: ${result.candidates} candidates`);

    // Check resolutions
    const monitorResult = await checkResolutions();

    // Only notify if something happened
    if (monitorResult.resolved.length) {
      let txt = '<b>Polymarket Resolution</b>\n\n';
      for (const r of monitorResult.resolved) {
        txt += `${r.outcome === 'win' ? '✅' : '❌'} ${r.side} "${r.question.slice(0, 50)}"\n`;
        txt += `PnL: ${r.pnl >= 0 ? '+' : ''}$${r.pnl}\n\n`;
      }
      const s = getStatus();
      txt += `Bankroll: $${s.bankroll} | PnL: ${s.totalPnl >= 0 ? '+' : ''}$${s.totalPnl}`;
      await sendTelegram(txt);
    }
  } else if (mode === 'monitor') {
    // Just check positions
    const result = await checkResolutions();
    if (result.resolved.length) {
      let txt = '<b>Polymarket Resolution</b>\n\n';
      for (const r of result.resolved) {
        txt += `${r.outcome === 'win' ? '✅' : '❌'} ${r.side} "${r.question.slice(0, 50)}"\n`;
        txt += `PnL: ${r.pnl >= 0 ? '+' : ''}$${r.pnl}\n\n`;
      }
      const s = getStatus();
      txt += `Bankroll: $${s.bankroll} | PnL: ${s.totalPnl >= 0 ? '+' : ''}$${s.totalPnl}`;
      await sendTelegram(txt);
    }
  } else if (mode === 'report') {
    const report = generateReport();
    await sendTelegram(`<pre>${report}</pre>`);
  }
}

run().catch(err => {
  console.error('[PM-CRON] Fatal:', err.message);
  process.exit(1);
});
