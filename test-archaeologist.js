import { researchDomain } from './archaeologist.js';

console.log('Testing Archaeologist on sports_science...');
const results = await researchDomain('sports_science', 'Manual test run');
console.log(`\nResults: ${results.length} discoveries`);
for (const r of results) {
  console.log(`\n--- ${r.technique} ---`);
  console.log(`Origin: ${r.origin}`);
  console.log(`Abandoned: ${r.abandoned_reason}`);
  console.log(`Valid: ${r.valid_reason}`);
  console.log(`Cathedral: ${r.cathedral_application}`);
  console.log(`Ensemble: ${r.ensemble_verdict}`);
}
