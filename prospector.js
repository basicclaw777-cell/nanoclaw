import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const HARVEST_DIR = path.join(process.env.HOME, 'cathedral-vault/00_Staging/cathedral');
const PRODUCTS_DIR = path.join(process.env.HOME, 'cathedral-vault/08_Project_Orchestrator/products');
const SCAN_LOG = path.join(PRODUCTS_DIR, 'scan-log.md');
const SEED_PROMPT = fs.readFileSync(
  path.join(process.env.HOME, 'cathedral-vault/10_Agents/prospector/seed-prompt.md'), 'utf-8'
);

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ── Helpers ──

function today() {
  return new Date().toISOString().slice(0, 10);
}

function getHarvestsForDate(date) {
  if (!fs.existsSync(HARVEST_DIR)) return [];
  const files = fs.readdirSync(HARVEST_DIR)
    .filter(f => f.startsWith(`session-harvest-${date}`) && f.endsWith('.md'))
    .sort();
  return files.map(f => ({
    name: f,
    content: fs.readFileSync(path.join(HARVEST_DIR, f), 'utf-8')
  }));
}

async function callDeepSeek(systemPrompt, userMessage) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');

  const resp = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      max_tokens: 6000,
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ]
    })
  });

  const data = await resp.json();
  if (!data.choices?.[0]?.message?.content) {
    throw new Error(`DeepSeek error: ${JSON.stringify(data)}`);
  }
  return data.choices[0].message.content;
}

async function sendTelegram(message) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
      })
    });
  } catch (e) {
    console.error('[prospector] Telegram send failed:', e.message);
  }
}

function appendLog(line) {
  const entry = `- ${today()} — ${line}\n`;
  fs.appendFileSync(SCAN_LOG, entry);
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// ── Main ──

async function prospect(targetDate) {
  const date = targetDate || today();
  console.log(`[prospector] Scanning harvests for ${date}...`);

  const harvests = getHarvestsForDate(date);
  if (harvests.length === 0) {
    console.log('[prospector] No harvests found. Exiting.');
    appendLog(`No harvests found for ${date}`);
    return;
  }

  console.log(`[prospector] Found ${harvests.length} harvest files.`);

  // Combine all harvests for the date
  const combined = harvests.map(h => `--- ${h.name} ---\n${h.content}`).join('\n\n');

  const systemPrompt = `You are The Prospector — a product extraction agent for the Cathedral system.

${SEED_PROMPT}

IMPORTANT RULES:
- If the session has product potential, respond with a complete product brief using the format in your seed prompt.
- Start your response with either "PRODUCT DETECTED" or "NO PRODUCT" on the first line.
- If PRODUCT DETECTED, the second line must be "NAME: [product name]"
- Then the full brief follows.
- If NO PRODUCT, give a one-line reason why.
- Be ruthless. Most sessions don't produce products. That's fine.`;

  const userMessage = `Scan these session harvests for product potential:\n\n${combined}`;

  console.log('[prospector] Sending to DeepSeek...');
  const result = await callDeepSeek(systemPrompt, userMessage);

  if (result.startsWith('PRODUCT DETECTED')) {
    // Extract product name from second line
    const lines = result.split('\n');
    const nameLine = lines.find(l => l.startsWith('NAME:'));
    const productName = nameLine ? nameLine.replace('NAME:', '').trim() : 'unnamed';
    const slug = slugify(productName);
    const briefPath = path.join(PRODUCTS_DIR, `product-brief-${slug}-${date}.md`);

    // Write brief
    fs.writeFileSync(briefPath, result);
    console.log(`[prospector] Product brief filed: ${briefPath}`);
    appendLog(`PRODUCT DETECTED: ${productName} → ${path.basename(briefPath)}`);

    // Notify Telegram
    await sendTelegram(`🔍 *Prospector*: Found product potential in ${date} session.\n\n*${productName}*\n\nBrief filed: \`${path.basename(briefPath)}\``);

  } else {
    const reason = result.replace('NO PRODUCT', '').trim().split('\n')[0] || 'No product signal detected';
    console.log(`[prospector] No product: ${reason}`);
    appendLog(`No product (${date}): ${reason}`);
  }
}

// ── CLI ──

const targetDate = process.argv[2] || today();
prospect(targetDate).catch(err => {
  console.error('[prospector] Error:', err.message);
  process.exit(1);
});
