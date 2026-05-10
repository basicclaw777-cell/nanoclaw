/**
 * bull-bear-debate.js — Two agents argue before a trade decision
 *
 * Bull makes the case FOR. Bear makes the case AGAINST.
 * Trader reads both, then decides. All logged.
 *
 * Uses DeepSeek API for debates (sharper reasoning, ~$0.001/debate).
 * Falls back to Ollama hermes3 if DeepSeek unavailable.
 *
 * ESM.
 */

import { logDecision } from './trade-logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const OLLAMA_URL = 'http://localhost:11434/api/chat';

const BULL_PROMPT = `You are the BULL analyst in a trading firm. Your job is to make the strongest possible case FOR this trade.

Be specific. Cite the signals. Quantify the opportunity. Address risks but argue why they're acceptable.

Respond in 3-5 sentences. Be concise and conviction-driven.`;

const BEAR_PROMPT = `You are the BEAR analyst in a trading firm. Your job is to make the strongest possible case AGAINST this trade.

Be specific. Cite the risks. Quantify what could go wrong. Address the bull case but argue why it's insufficient.

Respond in 3-5 sentences. Be concise and conviction-driven.`;

const TRADER_PROMPT = `You are the TRADER. You've read the bull case and the bear case. Now decide:

- BUY: if the bull case is significantly stronger
- SKIP: if the bear case is convincing or the edge is too thin
- WAIT: if timing is wrong but the thesis is valid

Respond with one word (BUY/SKIP/WAIT) then one sentence of reasoning.`;

// ── DeepSeek API ─────────────────────────────────────────────────────────────

async function queryDeepSeek(systemPrompt, userMessage) {
  const res = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 250,
      temperature: 0.4,
    }),
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── Ollama fallback ──────────────────────────────────────────────────────────

async function queryOllama(systemPrompt, userMessage) {
  const res = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'hermes3',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      stream: false,
      options: { temperature: 0.4, num_predict: 200 },
    }),
  });

  const data = await res.json();
  return data.message?.content || '';
}

// ── Smart query: DeepSeek first, Ollama fallback ─────────────────────────────

async function query(systemPrompt, userMessage) {
  if (DEEPSEEK_API_KEY) {
    try {
      const result = await queryDeepSeek(systemPrompt, userMessage);
      if (result) return result;
    } catch (e) {
      console.error('[debate] DeepSeek failed, falling back to Ollama:', e.message);
    }
  }
  return queryOllama(systemPrompt, userMessage);
}

/**
 * Run the bull-bear debate for a proposed trade.
 */
export async function debate(setup) {
  const briefing = `
Asset: ${setup.asset}
Proposed: ${setup.direction} @ ${setup.entryPrice}
Signals: ${JSON.stringify(setup.signals)}
Context: ${setup.context || 'No additional context'}
`;

  // Bull argues FOR
  const bullCase = await query(BULL_PROMPT, briefing);

  // Bear argues AGAINST
  const bearCase = await query(BEAR_PROMPT, briefing);

  // Trader decides
  const traderBrief = `
${briefing}

BULL CASE:
${bullCase}

BEAR CASE:
${bearCase}

Your decision:`;

  const traderResponse = await query(TRADER_PROMPT, traderBrief);

  // Parse decision
  const firstWord = traderResponse.trim().split(/[\s.,:]/)[0].toUpperCase();
  const decision = ['BUY', 'SKIP', 'WAIT'].includes(firstWord) ? firstWord : 'SKIP';
  const reasoning = traderResponse.replace(/^(BUY|SKIP|WAIT)[.:\s]*/i, '').trim();

  // Log the decision
  logDecision(
    setup.asset,
    decision,
    reasoning,
    setup.signals,
    bullCase,
    bearCase,
    'pre-validation',
    decision === 'BUY' ? 'pending_validation' : 'rejected'
  );

  return {
    asset: setup.asset,
    direction: setup.direction,
    bullCase,
    bearCase,
    decision,
    reasoning,
    timestamp: new Date().toISOString(),
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('bull-bear-debate.js')) {
  const setup = {
    asset: 'ETH',
    direction: 'long',
    entryPrice: 3200,
    signals: [
      { source: 'sentiment', direction: 'bullish', strength: 0.7, note: 'Reddit sentiment flipped positive after 2-week fear' },
      { source: 'technical', direction: 'bullish', strength: 0.6, note: 'Price bounced off 200-day MA, RSI oversold' },
      { source: 'news', direction: 'neutral', strength: 0.5, note: 'No major news catalyst' },
    ],
    context: 'ETH down 15% in 2 weeks. Overall market neutral. BTC holding support.',
  };

  console.log('Running bull-bear debate for:', setup.asset, setup.direction, '@', setup.entryPrice);
  console.log(`Using: ${DEEPSEEK_API_KEY ? 'DeepSeek API' : 'Ollama hermes3 (no DeepSeek key)'}`);
  console.log('');

  const result = await debate(setup);

  console.log('=== BULL CASE ===');
  console.log(result.bullCase);
  console.log('\n=== BEAR CASE ===');
  console.log(result.bearCase);
  console.log('\n=== DECISION ===');
  console.log(`${result.decision}: ${result.reasoning}`);
}
