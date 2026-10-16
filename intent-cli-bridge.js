// intent-cli-bridge.js — ESM stdin bridge for CJS callers
// Accepts JSON on stdin: { fn: "...", args: [...] }
// Writes JSON result to stdout.
import {
  createIntent, getIntents, getIntent, updateIntent,
  registerSignal, getIntentHealth, mapToIntents
} from './intent-registry.js';
import { createInterface } from 'readline';

const rl = createInterface({ input: process.stdin });
let input = '';
rl.on('line', l => input += l);
rl.on('close', () => {
  try {
    const { fn, args } = JSON.parse(input);
    let result;
    if (fn === 'createIntent') result = createIntent(...(args || []));
    else if (fn === 'getIntents') result = getIntents(...(args || []));
    else if (fn === 'getIntent') result = getIntent(...(args || []));
    else if (fn === 'updateIntent') result = updateIntent(...(args || []));
    else if (fn === 'registerSignal') result = registerSignal(...(args || []));
    else if (fn === 'getIntentHealth') result = getIntentHealth();
    else if (fn === 'mapToIntents') result = mapToIntents(...(args || []));
    else result = { error: 'unknown function: ' + fn };
    process.stdout.write(JSON.stringify(result));
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: e.message }));
  }
});
