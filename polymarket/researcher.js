import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const DB_PATH = path.join(__dirname, 'markets.json');
const RESEARCH_DIR = path.join(__dirname, 'research');
const ESTIMATES_PATH = path.join(__dirname, 'estimates.json');

// DeepSeek API
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY ||
  (() => { try { const e = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8'); const m = e.match(/DEEPSEEK_API_KEY=(.+)/); return m?.[1]?.trim(); } catch { return null; } })();

if (!fs.existsSync(RESEARCH_DIR)) fs.mkdirSync(RESEARCH_DIR, { recursive: true });

async function callDeepSeek(system, prompt, maxTokens = 4000) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt }
      ],
      max_tokens: maxTokens,
      temperature: 0.3
    })
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

const RESEARCH_SYSTEM = `You are a geopolitical analyst and prediction market researcher. Your job is to estimate the TRUE probability of an event occurring, independent of what the market currently prices it at.

METHODOLOGY:
1. DECOMPOSE the question into key factors that determine the outcome
2. ASSESS each factor with available evidence (news, historical precedent, structural analysis)
3. IDENTIFY the base rate — how often do events like this resolve YES historically?
4. ADJUST from base rate using current-situation specifics
5. CONSIDER timing — how much time remains and what must happen in that window?
6. PRODUCE a final probability estimate with confidence interval

OUTPUT FORMAT (strict JSON):
{
  "question": "the market question",
  "factors": [
    { "factor": "description", "direction": "supports_yes|supports_no|neutral", "weight": "high|medium|low", "evidence": "brief evidence" }
  ],
  "baseRate": { "value": 0.0-1.0, "reasoning": "why this base rate" },
  "adjustments": [
    { "reason": "what adjusts from base", "delta": -0.3 to +0.3 }
  ],
  "finalEstimate": 0.0-1.0,
  "confidence": "high|medium|low",
  "confidenceInterval": [0.0, 1.0],
  "keyUncertainties": ["what could change this estimate"],
  "researchNeeded": ["what additional info would sharpen the estimate"],
  "reasoning": "2-3 paragraph synthesis"
}

RULES:
- Be calibrated. 50% means you genuinely don't know. 90% means you'd bet your reputation.
- Don't anchor to the market price. Form your OWN view first.
- Historical base rates matter enormously. Most things people think will happen don't.
- Time pressure: shorter deadlines = lower probability for events requiring multiple steps.
- Political events have fat tails — low probability doesn't mean zero.
- Be honest about uncertainty. A wide confidence interval is better than false precision.`;

async function researchMarket(market) {
  const daysLeft = market.daysToResolution;
  const timeContext = daysLeft !== null
    ? `${daysLeft} days remain until resolution (${market.endDate}).`
    : 'No fixed end date.';

  const prompt = `MARKET QUESTION: ${market.question}

EVENT CONTEXT: ${market.eventTitle}
${market.description ? `DESCRIPTION: ${market.description.slice(0, 1500)}` : ''}

CURRENT MARKET PRICE: YES = ${(market.yesPrice * 100).toFixed(1)}% | NO = ${(market.noPrice * 100).toFixed(1)}%
24HR VOLUME: $${market.volume24hr.toLocaleString()}
LIQUIDITY: $${market.liquidity.toLocaleString()}
TIMING: ${timeContext}

Today's date: ${new Date().toISOString().split('T')[0]}

Analyze this market and produce your independent probability estimate. Do NOT let the current market price anchor your thinking. What does the EVIDENCE say?`;

  console.log(`[RESEARCHER] Analyzing: ${market.question}`);
  const raw = await callDeepSeek(RESEARCH_SYSTEM, prompt, 6000);

  // Extract JSON from response — handle markdown code blocks and nested braces
  let analysis;
  try {
    // Try direct parse first
    analysis = JSON.parse(raw);
  } catch {
    try {
      // Strip markdown code fences
      let cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      // Find outermost JSON object by brace counting
      const start = cleaned.indexOf('{');
      if (start === -1) throw new Error('No JSON object found');
      let depth = 0;
      let end = -1;
      for (let i = start; i < cleaned.length; i++) {
        if (cleaned[i] === '{') depth++;
        else if (cleaned[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end === -1) {
        // DeepSeek truncated — auto-close missing braces
        let fragment = cleaned.slice(start);
        // Truncate at last complete key-value (last comma or closing bracket before EOF)
        const lastGoodIdx = Math.max(fragment.lastIndexOf(','), fragment.lastIndexOf(']'), fragment.lastIndexOf('}'));
        if (lastGoodIdx > 0) fragment = fragment.slice(0, lastGoodIdx + 1);
        // Close any open arrays and objects
        let d = 0, inStr = false;
        for (const ch of fragment) {
          if (ch === '"' && !inStr) inStr = true;
          else if (ch === '"' && inStr) inStr = false;
          if (!inStr) { if (ch === '{' || ch === '[') d++; if (ch === '}' || ch === ']') d--; }
        }
        while (d > 0) { fragment += '}'; d--; }
        try { analysis = JSON.parse(fragment); } catch { throw new Error('Unbalanced braces even after repair'); }
      } else {
        analysis = JSON.parse(cleaned.slice(start, end + 1));
      }
    } catch (e) {
      console.error(`[RESEARCHER] JSON parse failed: ${e.message}`);
      analysis = { raw, parseError: e.message, finalEstimate: null };
    }
  }

  return analysis;
}

function calculateEdge(ourEstimate, marketPrice) {
  // Edge = our probability - market probability (for YES side)
  // Positive edge = market underprices YES
  // Negative edge = market overprices YES (edge on NO side)
  const yesEdge = ourEstimate - marketPrice;
  const noEdge = (1 - ourEstimate) - (1 - marketPrice); // same magnitude, opposite sign

  const side = yesEdge > 0 ? 'YES' : 'NO';
  const edge = Math.abs(yesEdge);

  return {
    side,
    edge,
    edgePct: (edge * 100).toFixed(1) + '%',
    ourEstimate: (ourEstimate * 100).toFixed(1) + '%',
    marketPrice: (marketPrice * 100).toFixed(1) + '%',
    tradeable: edge >= CONFIG.scanner.minEdgeThreshold
  };
}

async function researchTop(count = 5) {
  if (!DEEPSEEK_KEY) throw new Error('DEEPSEEK_API_KEY not found in .env');

  // Load scan data
  if (!fs.existsSync(DB_PATH)) throw new Error('No markets.json — run scanner first');
  const scan = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  const candidates = scan.markets.candidates;

  if (!candidates.length) {
    console.log('[RESEARCHER] No candidates to research');
    return [];
  }

  // Deduplicate by event — pick highest-volume market per event
  const byEvent = new Map();
  for (const m of candidates) {
    const existing = byEvent.get(m.eventId);
    if (!existing || m.volume24hr > existing.volume24hr) {
      byEvent.set(m.eventId, m);
    }
  }
  const unique = [...byEvent.values()]
    .filter(m => m.daysToResolution === null || m.daysToResolution > 0) // skip expired
    .slice(0, count);

  console.log(`[RESEARCHER] Researching ${unique.length} markets (${candidates.length} candidates, ${byEvent.size} unique events)`);

  const results = [];
  for (const market of unique) {
    try {
      const analysis = await researchMarket(market);
      const estimate = analysis.finalEstimate;

      let edgeCalc = null;
      if (estimate !== null && estimate !== undefined) {
        edgeCalc = calculateEdge(estimate, market.yesPrice);
      }

      const result = {
        marketId: market.marketId,
        question: market.question,
        eventTitle: market.eventTitle,
        marketYes: market.yesPrice,
        marketNo: market.noPrice,
        volume24hr: market.volume24hr,
        daysToResolution: market.daysToResolution,
        analysis,
        edge: edgeCalc,
        researchedAt: new Date().toISOString()
      };

      results.push(result);

      // Save individual research file
      const slug = market.question.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').slice(0, 60).toLowerCase();
      const researchFile = path.join(RESEARCH_DIR, `${slug}.json`);
      fs.writeFileSync(researchFile, JSON.stringify(result, null, 2));

      // Log result
      if (edgeCalc) {
        const icon = edgeCalc.tradeable ? '🎯' : '  ';
        console.log(`${icon} [${edgeCalc.side} ${edgeCalc.edgePct} edge] Our: ${edgeCalc.ourEstimate} vs Market: ${edgeCalc.marketPrice} | ${market.question.slice(0, 60)}`);
      } else {
        console.log(`  [FAILED] ${market.question.slice(0, 60)}`);
      }

      // Rate limit — 1 request per 2 seconds
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.error(`[RESEARCHER] Error on "${market.question}": ${err.message}`);
    }
  }

  // Save all estimates
  const estimates = loadEstimates();
  for (const r of results) {
    if (r.edge) {
      estimates[r.marketId] = {
        question: r.question,
        ourEstimate: r.analysis.finalEstimate,
        marketPrice: r.marketYes,
        edge: r.edge,
        confidence: r.analysis.confidence,
        researchedAt: r.researchedAt
      };
    }
  }
  fs.writeFileSync(ESTIMATES_PATH, JSON.stringify(estimates, null, 2));

  // Summary
  const tradeable = results.filter(r => r.edge?.tradeable);
  console.log(`\n[RESEARCHER] Done. ${results.length} analyzed, ${tradeable.length} tradeable (>= ${CONFIG.scanner.minEdgeThreshold * 100}% edge)`);

  return results;
}

function loadEstimates() {
  if (!fs.existsSync(ESTIMATES_PATH)) return {};
  return JSON.parse(fs.readFileSync(ESTIMATES_PATH, 'utf8'));
}

// CLI
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const count = parseInt(process.argv[2]) || 5;
  researchTop(count).then(results => {
    const tradeable = results.filter(r => r.edge?.tradeable);
    if (tradeable.length) {
      console.log(`\n=== TRADEABLE OPPORTUNITIES ===\n`);
      for (const r of tradeable) {
        console.log(`  ${r.edge.side} ${r.question}`);
        console.log(`    Edge: ${r.edge.edgePct} | Our: ${r.edge.ourEstimate} | Market: ${r.edge.marketPrice} | Confidence: ${r.analysis.confidence}`);
        console.log(`    Reasoning: ${r.analysis.reasoning?.slice(0, 200)}...`);
        console.log('');
      }
    } else {
      console.log('\nNo tradeable opportunities found this scan.');
    }
  }).catch(console.error);
}

export { researchMarket, researchTop, calculateEdge, loadEstimates };
