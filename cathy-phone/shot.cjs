#!/usr/bin/env node
// "Show me what Forge built": screenshots of a finished build, at phone and desktop size, saved where Cathy can see them.
//   node ~/nanoclaw/cathy-phone/shot.cjs <url-or-route> "label" [trayId]
//   e.g. node ~/nanoclaw/cathy-phone/shot.cjs /easel "Filofax, black Moleskine"
// Files: ~/Cathedral/cathy/shots/<id>-phone.png and <id>-desktop.png. Index: ~/Cathedral/cathy/shots/shots.json (newest first).
// Cathy can open the PNGs with Read (she sees images), pin them to the Filofax, and use them when checking a build.
// Only local pages: cath-bridge routes, localhost, or an .html file in the home folder.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const puppeteer = require('puppeteer-core');

const HOME = process.env.HOME;
const DIR = path.join(HOME, 'Cathedral', 'cathy', 'shots');
const INDEX = path.join(DIR, 'shots.json');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const KEEP = 200;

function resolveUrl(where) {
  const w = String(where || '').trim().replace(/^~(?=\/)/, HOME);
  if (w.startsWith('/') && !w.startsWith(HOME + '/')) return 'http://localhost:8080' + w; // a cath-bridge route like /easel
  if (/^https?:\/\/(localhost|127\.0\.0\.1|mac-studio\.tail0a3b2b\.ts\.net)(:\d+)?(\/|$)/.test(w)) return w;
  if (w.startsWith(HOME + '/') && /\.html?$/.test(w) && fs.existsSync(w)) return 'file://' + w;
  return null;
}

async function shoot(where, label = '', trayId = '') {
  const url = resolveUrl(where);
  if (!url) throw new Error(`Not a local page I can screenshot: ${where}`);
  fs.mkdirSync(DIR, { recursive: true });
  const id = new Date().toISOString().slice(0, 10) + '-' + crypto.randomBytes(3).toString('hex');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });
  const files = [];
  try {
    for (const [kind, vp] of [['phone', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ['desktop', { width: 1280, height: 860, deviceScaleFactor: 1 }]]) {
      const page = await browser.newPage();
      await page.setViewport(vp);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise((r) => setTimeout(r, 1200)); // fonts, diagrams, first data load
      const file = `${id}-${kind}.png`;
      // Chrome tiles/repeats captures taller than ~16k device pixels, so very long phone pages are cut at 6000 CSS px.
      const h = kind === 'phone' ? await page.evaluate(() => document.documentElement.scrollHeight) : 0;
      if (kind === 'phone' && h > 6000) await page.screenshot({ path: path.join(DIR, file), clip: { x: 0, y: 0, width: vp.width, height: 6000 }, captureBeyondViewport: true });
      else await page.screenshot({ path: path.join(DIR, file), fullPage: kind === 'phone', captureBeyondViewport: false });
      files.push(file);
      await page.close();
    }
  } finally { await browser.close(); }

  let index = []; try { index = JSON.parse(fs.readFileSync(INDEX, 'utf8')); } catch {}
  index.unshift({ id, at: new Date().toISOString(), url: where, label: String(label).slice(0, 160), trayId: trayId || undefined, files });
  for (const old of index.slice(KEEP)) for (const f of old.files || []) fs.rmSync(path.join(DIR, f), { force: true });
  fs.writeFileSync(INDEX, JSON.stringify(index.slice(0, KEEP), null, 2));
  return { id, files: files.map((f) => path.join(DIR, f)), names: files };
}

module.exports = { shoot, resolveUrl, DIR };

if (require.main === module) {
  const [where, label, trayId] = process.argv.slice(2);
  if (!where) { console.error('Usage: shot.cjs <url-or-route> "label" [trayId]'); process.exit(1); }
  shoot(where, label, trayId).then((r) => { console.log('Saved:\n' + r.files.join('\n')); }).catch((e) => { console.error(e.message); process.exit(1); });
}
