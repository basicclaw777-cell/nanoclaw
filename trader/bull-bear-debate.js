/**
 * bull-bear-debate.js — Two agents argue before a trade decision
 *
 * Inspired by TradingAgents but built Cathedral-native.
 * Bull makes the case FOR. Bear makes the case AGAINST.
 * Trader reads both, then decides. All logged.
 *
 * Uses Ollama hermes3 locally. Free. Sovereign.
 */

import { logDecision } from './trade-logger.js';

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

async function queryOllama(systemPrompt, userMessage) {
  const payload = JSON.stringify({
    model: 'hermes3',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    stream: false,
    options: { temperature: 0.4, num_predict: 200 },
  });

  const res = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  });

  const data = await res.json();
  return data.message?.content || '';
}

/**
 * Run the bull-bear debate for a proposed trade.
 *
 * @param {object} setup — { asset, direction, entryPrice, signals[], context }
 * @returns {object} — { bullCase, bearCase, decision, reasoning }
 */
export async function debate(setup) {
  const briefing = `
Asset: ${setup.asset}
Proposed: ${setup.direction} @ ${setup.entryPrice}
Signals: ${JSON.stringify(setup.signals)}
Context: ${setup.context || 'No additional context'}
`;

  // Bull argues FOR
  const bullCase = await queryOllama(BULL_PROMPT, briefing);

  // Bear argues AGAINST
  const bearCase = await queryOllama(BEAR_PROMPT, briefing);

  // Trader decides
  const traderBrief = `
${briefing}

BULL CASE:
${bullCase}

BEAR CASE:
${bearCase}

Your decision:`;

  const traderResponse = await queryOllama(TRADER_PROMPT, traderBrief);

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
  console.log('');

  const result = await debate(setup);

  console.log('=== BULL CASE ===');
  console.log(result.bullCase);
  console.log('\n=== BEAR CASE ===');
  console.log(result.bearCase);
  console.log('\n=== DECISION ===');
  console.log(`${result.decision}: ${result.reasoning}`);
}
