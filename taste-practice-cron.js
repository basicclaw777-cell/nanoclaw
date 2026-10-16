// taste-practice-cron.js — Daily taste practice prompt via Telegram
// PM2 cron: fires once daily at 21:00 HKT (13:00 UTC)
// ESM module

import fs from 'fs';
import path from 'path';

const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.PAUL_CHAT_ID;
const LOG_PATH = path.join(process.env.HOME, 'nanoclaw', 'taste-practice-log.json');

function loadLog() {
  try { return JSON.parse(fs.readFileSync(LOG_PATH, 'utf8')); }
  catch { return []; }
}

function getStreak(log) {
  if (!log.length) return 0;
  let streak = 0;
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const yesterday = new Date(now - 86400000).toISOString().split('T')[0];

  const dates = [...new Set(log.map(d => d.date))].sort().reverse();
  for (const d of dates) {
    const expected = new Date(now - streak * 86400000).toISOString().split('T')[0];
    const expectedPrev = new Date(now - (streak + 1) * 86400000).toISOString().split('T')[0];
    if (d === expected || d === expectedPrev || d === today || d === yesterday) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

async function sendPrompt() {
  const log = loadLog();
  const streak = getStreak(log);
  const total = log.length;

  let streakLine = '';
  if (streak > 0) streakLine = `\n🔥 Streak: ${streak} day${streak > 1 ? 's' : ''} · ${total} total deposits`;

  const msg = `☕ TASTE PRACTICE${streakLine}

What pulled you today?

/tp [what] — [why] — [connects to]

Example: /tp Collateral — Mann uses LA night as character — visual_style, film`;

  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: msg
    })
  });

  const data = await res.json();
  if (data.ok) {
    console.log(`[taste-practice] Daily prompt sent. Streak: ${streak}, Total: ${total}`);
  } else {
    console.error('[taste-practice] Send failed:', data.description);
  }
}

sendPrompt().then(() => process.exit(0)).catch(err => {
  console.error('[taste-practice] Error:', err.message);
  process.exit(1);
});
