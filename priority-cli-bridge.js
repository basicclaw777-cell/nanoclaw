import { classify, trackEvent, getStats, getDigest } from './priority-engine.js';
import { createInterface } from 'readline';

const rl = createInterface({ input: process.stdin });
let input = '';
rl.on('line', l => input += l);
rl.on('close', () => {
  const { fn, args } = JSON.parse(input);
  let result;
  if (fn === 'classify') {
    const event = args[0];
    const classification = classify(event);
    trackEvent(event, classification);
    result = classification;
  } else if (fn === 'stats') result = getStats();
  else if (fn === 'digest') result = getDigest(args[0] || 24);
  else result = { error: 'unknown function' };
  process.stdout.write(JSON.stringify(result));
});
