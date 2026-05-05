#!/usr/bin/env node
'use strict';

const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const RAW_CHATS = path.join(os.homedir(), 'raw-chats');
const HARVESTER = path.join(os.homedir(), 'nanoclaw', 'vortex-ready-harvester.cjs');

const CATEGORIES = {
  boxing:      ['box', 'fight', 'punch', 'ring', 'jab', 'knockout', 'sparring', 'trainer', 'round', 'bout', 'glove', 'footwork', 'combination', 'defense'],
  universe:    ['cosmos', 'universe', 'galaxy', 'star', 'space', 'quantum', 'black hole', 'relativity', 'physics', 'dimension', 'multiverse', 'consciousness', 'simulation'],
  philosophy:  ['philosophy', 'meaning', 'truth', 'stoic', 'virtue', 'existence', 'wisdom', 'nietzsche', 'plato', 'aristotle', 'ethics', 'metaphysics', 'free will', 'purpose'],
  business:    ['business', 'startup', 'entrepreneur', 'market', 'revenue', 'product', 'customer', 'strategy', 'growth', 'founder', 'investor', 'pitch', 'b2b', 'saas'],
  technology:  ['technology', 'software', 'code', 'ai', 'machine learning', 'algorithm', 'programming', 'data', 'system', 'api', 'model', 'neural', 'gpt', 'llm', 'computer'],
  personal:    ['journal', 'personal', 'family', 'relationship', 'health', 'sleep', 'emotion', 'anxiety', 'habit', 'routine', 'therapy', 'friend', 'feeling', 'day', 'morning'],
  wealth:      ['wealth', 'money', 'rich', 'asset', 'investment', 'compound', 'passive income', 'net worth', 'financial freedom', 'portfolio', 'stock', 'crypto', 'real estate'],
  creative:    ['creative', 'story', 'writing', 'art', 'music', 'design', 'poem', 'character', 'narrative', 'vision', 'imagination', 'screenplay', 'fiction', 'paint'],
  finance:     ['finance', 'budget', 'debt', 'tax', 'expense', 'savings', 'cash flow', 'balance sheet', 'income', 'dividend', 'fund', 'bond', 'equity', 'trade'],
  conspiracy:  ['conspiracy', 'government', 'deep state', 'secret', 'surveillance', 'control', 'elite', 'propaganda', 'shadow', 'hidden', 'agenda', 'psyop', 'censorship'],
  sandboxes:   ['test', 'sandbox', 'experiment', 'draft', 'scratch', 'random', 'misc', 'temp', 'idea', 'brainstorm', 'untitled', 'notes'],
};

function classify(filePath) {
  const filename = path.basename(filePath).toLowerCase();
  let content = '';
  try {
    const buf = Buffer.alloc(500);
    const fd = fs.openSync(filePath, 'r');
    const bytesRead = fs.readSync(fd, buf, 0, 500, 0);
    fs.closeSync(fd);
    content = buf.slice(0, bytesRead).toString('utf8').toLowerCase();
  } catch (_) {}

  const haystack = filename + ' ' + content;
  const scores = {};
  let best = 'sandboxes';
  let bestScore = 0;

  for (const [cat, keywords] of Object.entries(CATEGORIES)) {
    let score = 0;
    for (const kw of keywords) {
      let idx = 0;
      while ((idx = haystack.indexOf(kw, idx)) !== -1) {
        score++;
        idx += kw.length;
      }
    }
    scores[cat] = score;
    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  }

  return best;
}

function runHarvester() {
  const proc = spawn('node', [HARVESTER], { stdio: 'inherit' });
  proc.on('close', (code) => {
    console.log(`[auto-sort] harvester exited with code ${code}`);
  });
}

function onNewFile(filePath) {
  if (path.extname(filePath) !== '.txt') return;

  const filename = path.basename(filePath);
  const category = classify(filePath);
  const destDir = path.join(RAW_CHATS, category);

  try {
    fs.mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, filename);
    fs.renameSync(filePath, dest);
    console.log(`[auto-sort] ${filename} → ${category}`);
    runHarvester();
  } catch (err) {
    console.error(`[auto-sort] error processing ${filename}:`, err.message);
  }
}

const watcher = chokidar.watch(path.join(RAW_CHATS, '*.txt'), {
  depth: 0,
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
});

watcher.on('add', onNewFile);

watcher.on('ready', () => {
  console.log(`[auto-sort] watching ${RAW_CHATS} for new .txt files`);
});

watcher.on('error', (err) => {
  console.error('[auto-sort] watcher error:', err);
});
