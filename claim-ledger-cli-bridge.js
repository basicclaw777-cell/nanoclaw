// claim-ledger-cli-bridge.js — ESM stdin bridge for CJS callers
// Accepts JSON on stdin: { fn: "register"|"get"|"stats", args: [...] }
// Writes JSON result to stdout.
import { registerClaim, getClaim, getStats, updateAdmiraltyRating } from './claim-ledger.js';
import { rateClaim } from './admiralty-rating.js';
import { createInterface } from 'readline';

const rl = createInterface({ input: process.stdin });
let input = '';
rl.on('line', l => input += l);
rl.on('close', () => {
  try {
    const { fn, args } = JSON.parse(input);
    let result;
    if (fn === 'register') result = registerClaim(...(args || []));
    else if (fn === 'get') result = getClaim(...(args || []));
    else if (fn === 'stats') result = getStats();
    else if (fn === 'rate') result = rateClaim(...(args || []));
    else if (fn === 'updateAdmiralty') result = updateAdmiraltyRating(...(args || []));
    else result = { error: 'unknown function' };
    process.stdout.write(JSON.stringify(result));
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: e.message }));
  }
});
