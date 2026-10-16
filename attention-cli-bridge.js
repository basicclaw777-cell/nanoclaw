// attention-cli-bridge.js — ESM stdin/stdout bridge for attention-ledger.js
// CJS callers pipe JSON to stdin, get JSON from stdout.

import { registerEvent, reviewEvent, getUnreviewed, getStats, getLearnings } from './attention-ledger.js';
import { createInterface } from 'readline';

const rl = createInterface({ input: process.stdin });
let input = '';
rl.on('line', l => input += l);
rl.on('close', () => {
  try {
    const { fn, args } = JSON.parse(input);
    let result;
    if (fn === 'register') {
      const [type, source, tier, content, costJson] = args;
      result = registerEvent(type, source, tier, content, costJson);
    } else if (fn === 'review') {
      const [id, outcome, notes, reviewSource] = args;
      result = reviewEvent(id, outcome, notes, reviewSource);
    } else if (fn === 'unreviewed') {
      result = getUnreviewed(args[0] || 20);
    } else if (fn === 'stats') {
      result = getStats();
    } else if (fn === 'learnings') {
      result = getLearnings();
    } else {
      result = { error: 'unknown function' };
    }
    process.stdout.write(JSON.stringify(result));
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: e.message }));
  }
});
