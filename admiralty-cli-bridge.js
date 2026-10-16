// admiralty-cli-bridge.js — ESM stdin bridge for CJS callers
// Accepts JSON on stdin: { fn: "rateSource"|"rateClaim"|"describe", args: [...] }
// Writes JSON result to stdout.
import { rateSource, rateCredibility, rateClaim, formatAdmiralty, describeRating } from './admiralty-rating.js';
import { createInterface } from 'readline';

const rl = createInterface({ input: process.stdin });
let input = '';
rl.on('line', l => input += l);
rl.on('close', () => {
  try {
    const { fn, args } = JSON.parse(input);
    let result;
    if (fn === 'rateSource') result = rateSource(...(args || []));
    else if (fn === 'rateCredibility') result = rateCredibility(...(args || []));
    else if (fn === 'rateClaim') result = rateClaim(...(args || []));
    else if (fn === 'formatAdmiralty') result = formatAdmiralty(...(args || []));
    else if (fn === 'describe') result = describeRating(...(args || []));
    else result = { error: 'unknown function' };
    process.stdout.write(JSON.stringify(result));
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: e.message }));
  }
});
