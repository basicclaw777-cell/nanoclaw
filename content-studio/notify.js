// content-studio/notify.js — Telegram notifications for Content Studio
// Shared module. Import and call notify() from any studio script.
// ESM module

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME || '/Users/basicclaw777';

// Load env
const envFile = fs.readFileSync(path.join(HOME, 'nanoclaw', '.env'), 'utf-8');
const TOKEN = envFile.match(/TELEGRAM_TOKEN=(.+)/)?.[1]?.trim();
const CHAT_ID = envFile.match(/PAUL_CHAT_ID=(.+)/)?.[1]?.trim();

const API = `https://api.telegram.org/bot${TOKEN}`;

export async function notify(text, opts = {}) {
  if (!TOKEN || !CHAT_ID) return;
  try {
    await fetch(`${API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: opts.markdown ? 'Markdown' : undefined,
        disable_notification: opts.silent || false
      })
    });
  } catch (err) {
    console.error('[notify] Failed:', err.message);
  }
}

export async function notifyPhoto(photoUrl, caption = '') {
  if (!TOKEN || !CHAT_ID) return;
  try {
    await fetch(`${API}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        photo: photoUrl,
        caption: caption.slice(0, 1024)
      })
    });
  } catch (err) {
    console.error('[notify] Photo failed:', err.message);
  }
}

export default { notify, notifyPhoto };
