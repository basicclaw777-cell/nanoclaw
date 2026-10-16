import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const HOME = process.env.HOME;
const VAULT = path.join(HOME, 'cathedral-vault');
const KERNEL_PATH = path.join(VAULT, '06_Methods/paul-kernel.md');
const COG_SIG_PATH = path.join(VAULT, '06_Methods/pauls-cognitive-signature.md');
const TASTE_MAP_PATH = path.join(__dirname, 'taste-map.json');
const EVOLUTION_LOG = path.join(VAULT, '06_Methods/mirror-evolution-log.md');

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || process.env.PAUL_CHAT_ID;

function today() { return new Date().toISOString().slice(0, 10); }

async function sendTelegram(text) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('[mirror-evolution] No Telegram config — printing instead:\n', text);
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown' }),
    });
  } catch (e) { console.error('[mirror-evolution] Telegram error:', e.message); }
}

function getRecentVaultFiles(daysBack = 30) {
  const cutoff = Date.now() - daysBack * 86400000;
  const results = [];
  const dirs = ['00_Staging', '02_Refined_Gold', '06_Methods', '08_Project_Orchestrator'];

  for (const dir of dirs) {
    const full = path.join(VAULT, dir);
    if (!fs.existsSync(full)) continue;
    walkDir(full, cutoff, results);
  }
  return results.sort((a, b) => b.mtime - a.mtime).slice(0, 30);
}

function walkDir(dir, cutoff, results) {
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        walkDir(p, cutoff, results);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const stat = fs.statSync(p);
        if (stat.mtimeMs > cutoff) {
          results.push({
            path: p.replace(VAULT + '/', ''),
            mtime: stat.mtimeMs,
            title: entry.name.replace('.md', ''),
          });
        }
      }
    }
  } catch (e) {}
}

function loadFile(p) {
  try {
    return fs.readFileSync(p, 'utf8').replace(/^---[\s\S]*?---\n/, '').trim();
  } catch { return ''; }
}

function extractTasteMapSummary() {
  try {
    const tm = JSON.parse(fs.readFileSync(TASTE_MAP_PATH, 'utf8'));
    const summary = [];
    for (const [domain, data] of Object.entries(tm.domains)) {
      const cq = (data.confirmed_qualities || [])
        .map(q => typeof q === 'string' ? q : q.quality || q.description || '')
        .filter(Boolean).slice(0, 3);
      if (cq.length) summary.push(`${domain}: ${cq.join('; ')}`);
    }
    return summary.join('\n');
  } catch { return ''; }
}

async function runEvolutionAudit() {
  console.log(`[mirror-evolution] Starting evolution audit — ${today()}`);

  const kernel = loadFile(KERNEL_PATH);
  const cogSig = loadFile(COG_SIG_PATH);
  const tasteSummary = extractTasteMapSummary();
  const recentFiles = getRecentVaultFiles(30);

  if (!recentFiles.length) {
    console.log('[mirror-evolution] No recent vault activity — skipping');
    return;
  }

  const recentContent = recentFiles.slice(0, 15).map(f => {
    const text = loadFile(path.join(VAULT, f.path));
    return `[${f.path}]\n${text.slice(0, 600)}`;
  }).join('\n\n---\n\n');

  const prompt = `You are the Mirror Evolution Auditor for Paul Logan's Cathedral system.

You have three reference documents that define Paul's current cognitive identity:

PAUL KERNEL (core principles + decision patterns):
${kernel.slice(0, 2500)}

COGNITIVE SIGNATURE (13 thinking moves):
${cogSig.slice(0, 2000)}

TASTE MAP (preferences):
${tasteSummary}

RECENT VAULT ACTIVITY (last 30 days — ${recentFiles.length} files modified):
${recentContent}

YOUR JOB: Compare recent vault activity against the Kernel, Cognitive Signature, and Taste Map. Look for:

1. PRINCIPLES SHOWING STRAIN — where recent work contradicts or stretches a stated principle. Not violations — evolution signals. Something Paul is doing differently than what the Kernel says.

2. NEW PATTERNS UNNAMED — cognitive moves appearing in recent work that aren't in the 13-skill Cognitive Signature yet. Things Paul is doing consistently but hasn't named.

3. TASTE DRIFT — preferences shifting based on recent output. New likes or dislikes emerging that the Taste Map doesn't capture.

4. OBSOLETE ENTRIES — anything in the Kernel or Cognitive Signature that recent work suggests Paul has moved past.

5. EMERGING PRINCIPLES — new rules or heuristics crystallizing from recent activity.

Respond in this EXACT format (use only what you actually find — empty sections get "None detected"):

PRINCIPLES SHOWING STRAIN:
- [principle]: [evidence from recent work]. Suggested update: [what the Kernel should say instead]

NEW PATTERNS UNNAMED:
- [description of the pattern]: [evidence]. Suggested name: [name]

TASTE DRIFT:
- [domain]: [what changed]. Evidence: [recent file]

OBSOLETE ENTRIES:
- [entry]: [why it's obsolete]

EMERGING PRINCIPLES:
- [principle]: [evidence from recent work]

CONFIDENCE: [how much data you had to work with — THIN/ADEQUATE/STRONG]

Be forensic. Don't fabricate drift where none exists. Paul would rather hear "nothing changed" than fake evolution signals.`;

  const key = process.env.DEEPSEEK_API_KEY;
  let answer = '', engine = 'none';

  if (key) {
    try {
      const r = await fetch(DEEPSEEK_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'deepseek-chat', temperature: 0.3, max_tokens: 1200,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (r.ok) {
        const d = await r.json();
        answer = d.choices[0].message.content;
        engine = 'deepseek';
      }
    } catch (e) { console.error('[mirror-evolution] DeepSeek error:', e.message); }
  }

  if (!answer) {
    try {
      const r = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'hermes3', prompt, stream: false,
          options: { temperature: 0.3, num_predict: 1200 },
        }),
      });
      const d = await r.json();
      answer = (d.response || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      engine = 'hermes3-local';
    } catch (e) { console.error('[mirror-evolution] Ollama error:', e.message); }
  }

  if (!answer) {
    console.error('[mirror-evolution] No synthesis engine available');
    return;
  }

  // Log to vault
  const logEntry = `\n\n---\n\n## Evolution Audit — ${today()}\n\nEngine: ${engine} | Files scanned: ${recentFiles.length}\n\n${answer}\n`;
  try {
    if (!fs.existsSync(EVOLUTION_LOG)) {
      fs.writeFileSync(EVOLUTION_LOG, `---\ntitle: Mirror Evolution Log\ntype: system\n---\n\n# Mirror Evolution Audit Log\n\nMonthly self-audit: do Paul's documented principles match his actual practice?\n`);
    }
    fs.appendFileSync(EVOLUTION_LOG, logEntry);
    console.log(`[mirror-evolution] Logged to ${EVOLUTION_LOG}`);
  } catch (e) { console.error('[mirror-evolution] Log write error:', e.message); }

  // Send to Telegram
  const tgMsg = `🪞 *Mirror Evolution Audit — ${today()}*\n\n${answer.slice(0, 3800)}`;
  await sendTelegram(tgMsg);

  console.log(`[mirror-evolution] Audit complete — ${engine}`);
}

runEvolutionAudit().catch(e => console.error('[mirror-evolution] Fatal:', e.message));
