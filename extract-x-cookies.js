/**
 * Extract X/Twitter cookies from Chrome's cookie database.
 * Uses macOS Keychain to decrypt Chrome's encrypted cookies.
 */

import { execSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIES_PATH = path.join(__dirname, 'x-cookies.json');
const CHROME_COOKIES = path.join(
  process.env.HOME,
  'Library/Application Support/Google/Chrome/Default/Cookies'
);
const TMP_COOKIES = '/tmp/chrome-cookies-copy.db';

function getChromeKey() {
  const raw = execSync(
    'security find-generic-password -s "Chrome Safe Storage" -w',
    { encoding: 'utf8' }
  ).trim();
  return crypto.pbkdf2Sync(raw, 'saltysalt', 1003, 16, 'sha1');
}

function decryptValue(encryptedValue, key) {
  if (!encryptedValue || encryptedValue.length === 0) return '';

  const buf = Buffer.from(encryptedValue);
  const prefix = buf.slice(0, 3).toString('ascii');
  if (prefix !== 'v10' && prefix !== 'v11') {
    return buf.toString('utf8');
  }

  const iv = Buffer.alloc(16, 0x20);
  const encrypted = buf.slice(3);

  try {
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    const raw = decrypted.toString('utf8');
    // Chrome may have extra bytes at start from block alignment
    // Extract the clean ASCII portion (cookie values are always printable ASCII)
    const match = raw.match(/[\x20-\x7e]+$/);
    return match ? match[0] : raw;
  } catch (e) {
    return '';
  }
}

try {
  fs.copyFileSync(CHROME_COOKIES, TMP_COOKIES);

  const key = getChromeKey();
  const db = new Database(TMP_COOKIES, { readonly: true });

  const rows = db.prepare(
    "SELECT name, encrypted_value, host_key, path, is_secure, is_httponly FROM cookies WHERE host_key LIKE '%.x.com' OR host_key LIKE '%.twitter.com'"
  ).all();

  const cookies = [];

  for (const row of rows) {
    const value = decryptValue(row.encrypted_value, key);
    if (value && value.length > 0) {
      cookies.push({
        name: row.name,
        value: value,
        domain: row.host_key,
        path: row.path,
        secure: !!row.is_secure,
        httpOnly: !!row.is_httponly
      });
    }
  }

  db.close();
  fs.unlinkSync(TMP_COOKIES);

  const authToken = cookies.find(c => c.name === 'auth_token' && c.domain.includes('x.com'));
  const ct0 = cookies.find(c => c.name === 'ct0' && c.domain.includes('x.com'));

  if (!authToken || !ct0) {
    console.error('Missing critical cookies.');
    process.exit(1);
  }

  // Format for twitter-scraper
  const scraperCookies = cookies.map(c => {
    let str = `${c.name}=${c.value}; Domain=${c.domain}; Path=${c.path}`;
    if (c.secure) str += '; Secure';
    if (c.httpOnly) str += '; HttpOnly';
    return str;
  });

  fs.writeFileSync(COOKIES_PATH, JSON.stringify(scraperCookies, null, 2));

  console.log(`✅ Extracted ${cookies.length} X cookies`);
  console.log(`   auth_token: ${authToken.value.slice(0, 12)}...`);
  console.log(`   ct0: ${ct0.value.slice(0, 12)}...`);
  console.log(`   Saved to: ${COOKIES_PATH}`);
  console.log('\nTest with: node x-post.js whoami');

} catch (err) {
  console.error(`❌ Error: ${err.message}`);
  process.exit(1);
}
