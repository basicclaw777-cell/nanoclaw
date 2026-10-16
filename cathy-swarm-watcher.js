/**
 * Cathy Swarm Watcher — immune system plumbing
 * Watches outcome tuples, flags large bandit shifts to Telegram before applying.
 * Import from dm-processor or run standalone via PM2.
 */

import { watch } from './linda-vault.js';
import { getState } from './bandit-brain.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const HOME = process.env.HOME;
const envPath = join(HOME, 'nanoclaw', '.env');
try {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) { let v = m[2].trim().replace(/^["']|["']$/g, ''); if (!process.env[m[1].trim()]) process.env[m[1].trim()] = v; }
  }
} catch {}

const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT = process.env.PAUL_CHAT_ID;

async function alert(text) {
  if (!TOKEN || !CHAT) return;
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT, text })
  }).catch(() => {});
}

// Watch all outcome tuples across swarm namespace
watch(['outcome', null, null], 'swarm', (entry) => {
  const [, domain, success] = entry.tuple;
  const agent = entry.agentId;

  // Check if this would cause a large bandit shift for any agent watching this domain
  const arms = getState(agent);
  const arm = arms.find(a => a.action === domain);
  if (!arm) return;

  // Estimate selection weight: α/(α+β) is the mean of the Beta distribution
  const currentWeight = arm.alpha / (arm.alpha + arm.beta);
  const newAlpha = arm.alpha + (success ? 1 : 0);
  const newBeta = arm.beta + (success ? 0 : 1);
  const newWeight = newAlpha / (newAlpha + newBeta);

  // Flag if crossing from <20% to >30% (large shift)
  if (currentWeight < 0.2 && newWeight > 0.3) {
    alert(`[Cathy immune] Large bandit shift detected:\n${agent}/${domain}: ${(currentWeight*100).toFixed(0)}% -> ${(newWeight*100).toFixed(0)}%\nSource: ${entry.agentId}, success=${success}`);
    console.log(`[cathy-swarm] FLAGGED: ${agent}/${domain} ${(currentWeight*100).toFixed(0)}% -> ${(newWeight*100).toFixed(0)}%`);
  }

  console.log(`[cathy-swarm] ${agent}/${domain} outcome=${success} weight=${(currentWeight*100).toFixed(0)}%->${(newWeight*100).toFixed(0)}%`);
});

console.log('[cathy-swarm] Watching outcome tuples on swarm namespace');
