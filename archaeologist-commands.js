// ── Archaeologist Telegram Commands ──────────────────────────────────────────
// /archaeologist — show stats and recent discoveries
// /archaeologist scan — trigger full domain scan
// /archaeologist [domain] — scan specific domain
// ─────────────────────────────────────────────────────────────────────────────

import { researchDomain, weeklyFullScan, getStats } from './archaeologist.js';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DOMAIN_KEYS = [
  'ai_ml', 'computer_vision', 'signal_processing', 'sports_science',
  'knowledge_management', 'audio_acoustics', 'finance_trading', 'coaching_psychology'
];

export function registerArchaeologistCommands(bot) {
  const PAUL_CHAT_ID = process.env.PAUL_CHAT_ID ? parseInt(process.env.PAUL_CHAT_ID) : null;

  async function safeSend(chatId, text) {
    if (!text) return;
    text = String(text);
    const MAX = 4096;
    if (text.length <= MAX) return bot.sendMessage(chatId, text);
    const chunks = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= MAX) { chunks.push(remaining); break; }
      let cut = remaining.lastIndexOf('\n', MAX);
      if (cut < MAX * 0.3) cut = MAX;
      chunks.push(remaining.slice(0, cut));
      remaining = remaining.slice(cut).replace(/^\n+/, '');
    }
    for (const chunk of chunks) {
      await bot.sendMessage(chatId, chunk);
      if (chunks.length > 1) await new Promise(r => setTimeout(r, 500));
    }
  }

  // /archaeologist — stats
  bot.onText(/^\/archaeologist(?:@\w+)?$/, async (msg) => {
    const chatId = msg.chat.id;
    if (PAUL_CHAT_ID && chatId !== PAUL_CHAT_ID) return;

    try {
      const stats = getStats();
      let text = `The Archaeologist — Court Member #28\n`;
      text += `Total discoveries: ${stats.total}\n`;
      text += `Total scans: ${stats.scans}\n\n`;

      if (stats.byDomain.length > 0) {
        text += `By domain:\n`;
        for (const d of stats.byDomain) text += `  ${d.domain}: ${d.count}\n`;
        text += `\n`;
      }

      if (stats.byStatus.length > 0) {
        text += `By status:\n`;
        for (const s of stats.byStatus) text += `  ${s.status}: ${s.count}\n`;
        text += `\n`;
      }

      if (stats.recent.length > 0) {
        text += `Recent discoveries:\n`;
        for (const r of stats.recent) {
          text += `  ${r.technique} (${r.domain}) — ${r.ensemble_verdict}\n`;
        }
      }

      text += `\nCommands:\n`;
      text += `/archaeologist scan — full scan all domains\n`;
      text += `/archaeologist [domain] — scan specific domain\n`;
      text += `/goldmine — goldmine miners status\n`;
      text += `Domains: ${DOMAIN_KEYS.join(', ')}`;

      await safeSend(chatId, text);
    } catch (err) {
      await safeSend(chatId, `Archaeologist error: ${err.message}`);
    }
  });

  // /archaeologist scan — full scan
  bot.onText(/^\/archaeologist(?:@\w+)?\s+scan$/i, async (msg) => {
    const chatId = msg.chat.id;
    if (PAUL_CHAT_ID && chatId !== PAUL_CHAT_ID) return;

    await safeSend(chatId, `The Archaeologist starting full domain scan... This takes a few minutes.`);
    try {
      const count = await weeklyFullScan();
      await safeSend(chatId, `Scan complete. ${count} new discoveries.`);
    } catch (err) {
      await safeSend(chatId, `Scan failed: ${err.message}`);
    }
  });

  // /goldmine — goldmine miners status
  bot.onText(/^\/goldmine(?:@\w+)?$/i, async (msg) => {
    const chatId = msg.chat.id;
    if (PAUL_CHAT_ID && chatId !== PAUL_CHAT_ID) return;

    try {
      const dbPath = path.join(__dirname, 'vortex_data', 'archaeologist.db');
      const db = new Database(dbPath);

      const patents = db.prepare('SELECT COUNT(*) as c FROM patent_results').get();
      const trials = db.prepare('SELECT COUNT(*) as c FROM clinical_trials').get();
      const disses = db.prepare('SELECT COUNT(*) as c FROM dissertations').get();
      const soviet = db.prepare('SELECT COUNT(*) as c FROM soviet_papers').get();
      const highTrials = db.prepare('SELECT COUNT(*) as c FROM clinical_trials WHERE relevance_score >= 6').get();
      const highDisses = db.prepare('SELECT COUNT(*) as c FROM dissertations WHERE relevance_score >= 6').get();
      const highSoviet = db.prepare('SELECT COUNT(*) as c FROM soviet_papers WHERE relevance_score >= 6').get();

      // Recent high-value finds
      const recentTrials = db.prepare('SELECT nct_id, title, relevance_score FROM clinical_trials WHERE relevance_score >= 6 ORDER BY timestamp DESC LIMIT 3').all();
      const recentDisses = db.prepare('SELECT title, relevance_score FROM dissertations WHERE relevance_score >= 6 ORDER BY timestamp DESC LIMIT 3').all();

      let text = `Goldmine Programme Status\n\n`;
      text += `Patents/Tech Papers: ${patents.c}\n`;
      text += `Clinical Trials: ${trials.c} (${highTrials.c} high-value)\n`;
      text += `PhD Dissertations: ${disses.c} (${highDisses.c} high-value)\n`;
      text += `Soviet Papers: ${soviet.c} (${highSoviet.c} high-value)\n`;
      text += `Total: ${patents.c + trials.c + disses.c + soviet.c}\n\n`;

      if (recentTrials.length > 0) {
        text += `Recent trial finds:\n`;
        for (const t of recentTrials) text += `  ${t.relevance_score}/10: ${t.title}\n`;
        text += `\n`;
      }
      if (recentDisses.length > 0) {
        text += `Recent paper finds:\n`;
        for (const d of recentDisses) text += `  ${d.relevance_score}/10: ${d.title}\n`;
      }

      text += `\nSchedule: Patents Tue, Trials Wed, PhDs Thu, Soviet Fri (3am HKT)`;
      text += `\nManual: /goldmine run patents|trials|phds|soviet`;

      db.close();
      await safeSend(chatId, text);
    } catch (err) {
      await safeSend(chatId, `Goldmine error: ${err.message}`);
    }
  });

  // /goldmine run [miner] — manual run
  bot.onText(/^\/goldmine(?:@\w+)?\s+run\s+(\w+)$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    if (PAUL_CHAT_ID && chatId !== PAUL_CHAT_ID) return;

    const miners = {
      patents: 'goldmine-patent-miner.js',
      trials: 'goldmine-clinical-miner.js',
      phds: 'goldmine-phd-miner.js',
      soviet: 'goldmine-soviet-miner.js'
    };

    const miner = match[1].toLowerCase();
    if (!miners[miner]) {
      await safeSend(chatId, `Unknown miner: ${miner}\nAvailable: ${Object.keys(miners).join(', ')}`);
      return;
    }

    await safeSend(chatId, `Running ${miner} miner...`);
    const script = path.join(__dirname, miners[miner]);
    execFile('node', [script, '--max=10'], { timeout: 600000 }, async (err, stdout, stderr) => {
      if (err) {
        await safeSend(chatId, `${miner} miner failed: ${err.message}`);
      } else {
        // Extract summary from stdout
        const lines = stdout.split('\n');
        const summary = lines.filter(l => l.includes('Complete') || l.includes('HIGH') || l.includes('API calls')).join('\n');
        await safeSend(chatId, summary || `${miner} miner finished. Check /goldmine for stats.`);
      }
    });
  });

  // /archaeologist [domain] — specific domain
  bot.onText(/^\/archaeologist(?:@\w+)?\s+(\w+)$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    if (PAUL_CHAT_ID && chatId !== PAUL_CHAT_ID) return;
    const domain = match[1].toLowerCase();

    if (domain === 'scan') return; // Handled above
    if (!DOMAIN_KEYS.includes(domain)) {
      await safeSend(chatId, `Unknown domain: ${domain}\nAvailable: ${DOMAIN_KEYS.join(', ')}`);
      return;
    }

    await safeSend(chatId, `The Archaeologist researching ${domain}...`);
    try {
      const discoveries = await researchDomain(domain, 'Manual Telegram scan');
      if (discoveries.length > 0) {
        let text = `Found ${discoveries.length} techniques in ${domain}:\n\n`;
        for (const d of discoveries) {
          text += `${d.technique}\n`;
          text += `  Origin: ${d.origin}\n`;
          text += `  Ensemble: ${d.ensemble_verdict}\n`;
          text += `  Application: ${d.cathedral_application?.slice(0, 100)}...\n\n`;
        }
        await safeSend(chatId, text);
      } else {
        await safeSend(chatId, `No new discoveries in ${domain}. May already be catalogued.`);
      }
    } catch (err) {
      await safeSend(chatId, `Research failed: ${err.message}`);
    }
  });
}
