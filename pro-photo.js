#!/usr/bin/env node
// Pro Photo Pipeline — Drop photos, get cinematic pro versions back via Telegram
// Usage: node pro-photo.js <image-path> [image-path2] ...
// Or:   Drop images into ~/nanoclaw/pro-photo-inbox/ and they auto-process

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Config
const INBOX = path.join(__dirname, 'pro-photo-inbox');
const OUTBOX = path.join(__dirname, 'pro-photo-outbox');
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || require('dotenv').config({ path: path.join(__dirname, '.env') }) && process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.PAUL_CHAT_ID || '1912121485';
const POLL_INTERVAL = 5000; // 5 seconds

const PROMPT = `Apply a high-end commercial retouch to the attached image. Maintain 100% exact preservation of subject identity, poses, clothing, and all background elements. Strictly 16:9 cinematic aspect ratio. Camera Profile: Sony A7R V with 70mm lens; zero background blur; deep, crisp focus throughout. Lighting: Add a soft, directional key light from camera-left; diminish harsh overhead ceiling lights. Aesthetic: Premium sports documentary color grade with neutral-to-warm tones and natural skin tones. Enhance micro-contrast on leather textures and skin without smoothing. No hallucinations; do not add or remove objects. Final output must look like a professional Lightroom/Capture One grade of the original raw file.`;

// Ensure directories exist
if (!fs.existsSync(INBOX)) fs.mkdirSync(INBOX, { recursive: true });
if (!fs.existsSync(OUTBOX)) fs.mkdirSync(OUTBOX, { recursive: true });

function sendTelegramPhoto(filePath, caption) {
  try {
    execSync(`curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto" -F chat_id=${CHAT_ID} -F photo=@"${filePath}" -F caption="${caption.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
    console.log(`  📤 Sent to Telegram: ${caption}`);
  } catch (e) {
    // If too large for photo, send as document
    execSync(`curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendDocument" -F chat_id=${CHAT_ID} -F document=@"${filePath}" -F caption="${caption.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
    console.log(`  📤 Sent as document (large file): ${caption}`);
  }
}

function processImage(imagePath) {
  const basename = path.basename(imagePath, path.extname(imagePath));
  const outFile = path.join(OUTBOX, `${basename}-pro.png`);

  console.log(`\n🎬 Processing: ${path.basename(imagePath)}`);
  console.log(`  ⏳ Generating via Nano Banana Pro...`);

  try {
    const result = execSync(
      `higgsfield generate create nano_banana_2 --prompt "${PROMPT}" --image "${imagePath}" --aspect_ratio 16:9 --resolution 2k --wait`,
      { encoding: 'utf-8', timeout: 600000 }
    ).trim();

    if (!result.startsWith('http')) {
      console.log(`  ❌ Unexpected result: ${result}`);
      return null;
    }

    console.log(`  ⬇️  Downloading result...`);
    execSync(`curl -sL "${result}" -o "${outFile}"`, { timeout: 60000 });

    const stats = fs.statSync(outFile);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
    console.log(`  ✅ Saved: ${outFile} (${sizeMB}MB)`);

    sendTelegramPhoto(outFile, `Pro Photo: ${basename} — 16:9 cinematic grade`);

    return outFile;
  } catch (e) {
    console.log(`  ❌ Failed: ${e.message}`);
    return null;
  }
}

// CLI mode — process files passed as arguments
const args = process.argv.slice(2);

if (args.length > 0 && args[0] !== '--watch') {
  console.log(`🎬 Pro Photo Pipeline — Processing ${args.length} image(s)\n`);
  const results = [];
  for (const arg of args) {
    if (fs.existsSync(arg)) {
      const result = processImage(arg);
      if (result) results.push(result);
    } else {
      console.log(`⚠️  File not found: ${arg}`);
    }
  }
  console.log(`\n✅ Done. ${results.length}/${args.length} processed.`);
  console.log(`📁 Output: ${OUTBOX}`);
  process.exit(0);
}

// Watch mode — monitor inbox folder
console.log(`\n🎬 Pro Photo Pipeline — Watch Mode`);
console.log(`📥 Inbox:  ${INBOX}`);
console.log(`📤 Outbox: ${OUTBOX}`);
console.log(`\nDrop images into the inbox folder. They'll be processed and sent to Telegram.\n`);

const processed = new Set();

// Check for existing files on startup
for (const f of fs.readdirSync(INBOX)) {
  if (/\.(jpg|jpeg|png|webp)$/i.test(f)) {
    processed.add(f); // Don't reprocess existing files on startup
  }
}

setInterval(() => {
  try {
    const files = fs.readdirSync(INBOX).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
    for (const f of files) {
      if (!processed.has(f)) {
        processed.add(f);
        processImage(path.join(INBOX, f));
      }
    }
  } catch (e) {
    // ignore transient read errors
  }
}, POLL_INTERVAL);
