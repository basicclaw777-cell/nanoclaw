/**
 * strategy-roundtable.js — Five worldviews argue about the same price action
 *
 * Each strategy is a character with a way of seeing:
 *   Gann sees price as spatial geometry
 *   Vortex sees price as breath and flow
 *   Historical Cycles sees price as repetition
 *   Suppression sees price as narrative
 *   Lunar sees price as rhythm
 *   Fibonacci sees price as golden proportion
 *   Momentum sees price as inertia
 *
 * The Steward reads all positions and finds what none of them see alone:
 *   - Where incompatible worldviews accidentally agree
 *   - Where a confident strategy is ignoring a blindspot
 *   - The emergent signal in the friction
 *
 * Runs every cycle. Logs silently. Weekly digest to Telegram.
 *
 * ESM.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'logs', 'trades.db');
import { smartQuery } from '../deepseek-query.js';
const OLLAMA_URL = 'http://localhost:11434/api/chat';

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS roundtable_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT (datetime('now')),
        asset TEXT NOT NULL,
        signals_summary TEXT NOT NULL,
        roundtable_debate TEXT,
        steward_synthesis TEXT,
        convergence_score REAL,
        meta_signal TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_roundtable_asset ON roundtable_sessions(asset);
    `);
  }
  return db;
}

// ── Strategy Personas ────────────────────────────────────────────────────────

const PERSONAS = {
  gann_geometry: {
    name: 'Gann',
    voice: `You are W.D. Gann reborn. You see price as GEOMETRY — spirals on the Square of Nine, angles from pivots, cardinal crosses as support and resistance. Price moves to fill geometric space. When price reaches a geometric node, it must react. You speak in terms of angles, squares, and spatial relationships. You are confident but specific.`,
  },
  vortex_flow: {
    name: 'Vortex',
    voice: `You are a student of Schauberger's implosion dynamics. You see price as BREATH — markets compress and expand like a toroidal vortex. Low volatility is energy coiling inward (implosion). Breakouts are the explosion phase. You read the market's breathing rhythm. You speak of compression, expansion, flow, and spiraling energy.`,
  },
  historical_cycles: {
    name: 'Cycles',
    voice: `You are a cycle analyst spanning 200 years. You see price as REPETITION — the 4-year halving cycle, the 60-year Kondratiev wave, Benner's panic years. What happened before will happen again. You speak in decades and centuries. You cite specific historical parallels and dates.`,
  },
  suppression_signal: {
    name: 'Suppression',
    voice: `You are a narrative analyst from the Cathedral. You see price as STORY — when media coordinates FUD, when institutions attack an asset, when the suppression playbook activates, that's your buy signal. You read sentiment not as emotion but as manufactured narrative. You are contrarian by nature. When everyone says sell, you listen to WHY they're saying it.`,
  },
  lunar_cycles: {
    name: 'Lunar',
    voice: `You are an astronomical cycle trader. You see price as RHYTHM — lunar phases, planetary transits, celestial timing. New moons bring new beginnings. Full moons bring culmination. Mercury retrograde brings reversals. You cite Dichev & Janes (2003) and 5000 years of astronomical observation. You speak of cycles within cycles.`,
  },
  fibonacci_time: {
    name: 'Fibonacci',
    voice: `You are a devotee of the golden ratio. You see price as PROPORTION — 0.618, 1.618, the spiral that builds shells and galaxies also builds market swings. Fibonacci retracements in price, Fibonacci projections in time. You speak of harmony, proportion, and the mathematics of growth.`,
  },
  momentum: {
    name: 'Momentum',
    voice: `You are a pure price action trader. You see price as INERTIA — what's moving keeps moving. Relative strength, trend following, volume confirmation. You don't care why something is moving. You care that it IS moving. You speak in terms of momentum, breakouts, and continuation.`,
  },
  cymatics_schumann: {
    name: 'Cymatics',
    voice: `You are a frequency analyst. You see price as VIBRATION — markets oscillate like cymatics plates, forming standing wave patterns when they hit resonant frequencies. The Schumann resonance (7.83 Hz and harmonics) is Earth's electromagnetic heartbeat. When market oscillation frequency approaches a Schumann harmonic, the market is vibrating at a fundamental frequency. You speak of resonance, standing waves, nodes, frequency locks, and energy release. Chaos is noise. Pattern is signal.`,
  },
  range_trader: {
    name: 'Range',
    voice: `You are a range trader. You see price as a PENDULUM — swinging between support and resistance. When others wait for breakouts, you profit from the oscillation itself. You buy at the bottom of the range, sell at the top. Your edge is patience and mean reversion. You thrive in flat markets that kill directional traders. You speak of support, resistance, mean reversion, range compression, and oscillation.`,
  },
};

const STEWARD_PROMPT = `You are The Steward of the Trading Roundtable. You've just read arguments from multiple trading strategies, each seeing the same price action through a different lens.

Your job is NOT to pick a winner. Your job is to find:

1. ACCIDENTAL AGREEMENT: Where do incompatible worldviews arrive at the same conclusion? (This is the strongest signal — when geometry, cycles, and flow all point the same direction without talking to each other.)

2. BLINDSPOTS: What is one confident strategy ignoring that another strategy covers? (The confident caller might be right about direction but wrong about timing because it doesn't see the cycle position.)

3. THE FRICTION SIGNAL: What insight emerges from the disagreement itself? What does the PATTERN of agreement and disagreement tell us that no single strategy sees?

4. CONFIDENCE SCORE: On a scale of 0-10, how aligned are the strategies? 8+ means strong convergence. 3 or below means total disagreement (which is itself a signal — wait).

Be concise. 3-5 sentences. End with one clear statement: what the roundtable collectively sees that no individual strategy sees alone.`;

// ── Run Roundtable ───────────────────────────────────────────────────────────

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
      options: { temperature: 0.5, num_predict: 250 },
    }),
  });
  const data = await res.json();
  return data.message?.content || '';
}

export async function runRoundtable(signals, prices) {
  const d = getDb();

  // Group signals by asset
  const assetSignals = {};
  for (const s of signals) {
    if (s.asset === 'MARKET') continue;
    if (!assetSignals[s.asset]) assetSignals[s.asset] = [];
    assetSignals[s.asset].push(s);
  }

  // Only roundtable assets with 2+ strategy signals (enough to argue about)
  const debateAssets = Object.entries(assetSignals).filter(([_, sigs]) => sigs.length >= 2);

  if (debateAssets.length === 0) {
    console.log('  [roundtable] No assets with 2+ strategy signals — skipping');
    return [];
  }

  const results = [];

  for (const [asset, sigs] of debateAssets) {
    const priceData = prices[asset];
    if (!priceData?.price) continue;

    // Build the brief: what each strategy sees
    const briefParts = [`Asset: ${asset} @ $${priceData.price} (24h: ${priceData.change_24h?.toFixed(1) || '?'}%)`];

    const activePersonas = [];
    for (const sig of sigs) {
      const persona = PERSONAS[sig.type] || PERSONAS[sig.source];
      if (persona) {
        activePersonas.push(persona.name);
        briefParts.push(`\n[${persona.name}] ${sig.direction.toUpperCase()} (strength ${sig.strength.toFixed(2)}): ${sig.reasoning}`);
      } else {
        briefParts.push(`\n[${sig.type || sig.source}] ${sig.direction.toUpperCase()} (strength ${sig.strength.toFixed(2)}): ${sig.reasoning}`);
      }
    }

    const brief = briefParts.join('\n');

    // The Steward reads all positions and synthesizes (DeepSeek for sharper reasoning)
    let synthesis = '';
    let convergenceScore = 0;
    try {
      synthesis = await smartQuery(STEWARD_PROMPT, brief, 250);

      // Extract confidence score from synthesis
      const scoreMatch = synthesis.match(/(\d+)\s*(?:\/10|out of 10)/i);
      if (scoreMatch) {
        convergenceScore = parseInt(scoreMatch[1]) / 10;
      } else {
        // Estimate from signal agreement
        const directions = sigs.map(s => s.direction);
        const longCount = directions.filter(d => d === 'long').length;
        const shortCount = directions.filter(d => d === 'short').length;
        const maxAgreement = Math.max(longCount, shortCount);
        convergenceScore = maxAgreement / directions.length;
      }
    } catch (e) {
      synthesis = `[Steward offline] ${activePersonas.length} strategies debated ${asset}: ${sigs.map(s => s.direction).join(', ')}`;
      const directions = sigs.map(s => s.direction);
      const longCount = directions.filter(d => d === 'long').length;
      convergenceScore = Math.max(longCount, directions.length - longCount) / directions.length;
    }

    // Determine meta-signal from convergence
    const directions = sigs.map(s => s.direction);
    const longCount = directions.filter(d => d === 'long').length;
    const shortCount = directions.filter(d => d === 'short').length;
    let metaSignal = 'MIXED';
    if (longCount > shortCount && convergenceScore > 0.6) metaSignal = 'LEAN_LONG';
    if (shortCount > longCount && convergenceScore > 0.6) metaSignal = 'LEAN_SHORT';
    if (convergenceScore > 0.8) metaSignal = longCount > shortCount ? 'STRONG_LONG' : 'STRONG_SHORT';
    if (convergenceScore < 0.4) metaSignal = 'CHAOS';

    // Log
    d.prepare(`
      INSERT INTO roundtable_sessions (asset, signals_summary, roundtable_debate, steward_synthesis, convergence_score, meta_signal)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      asset,
      JSON.stringify(sigs.map(s => ({ type: s.type, direction: s.direction, strength: s.strength }))),
      brief,
      synthesis,
      convergenceScore,
      metaSignal
    );

    results.push({ asset, convergenceScore, metaSignal, personas: activePersonas.length, synthesis: synthesis.substring(0, 150) });
    console.log(`  [roundtable] ${asset}: ${metaSignal} (convergence ${(convergenceScore * 10).toFixed(0)}/10) | ${activePersonas.join(' vs ')}`);
  }

  return results;
}

// ── Weekly Digest ────────────────────────────────────────────────────────────

export function getWeeklyDigest() {
  const d = getDb();

  const sessions = d.prepare(`
    SELECT * FROM roundtable_sessions
    WHERE timestamp > datetime('now', '-7 days')
    ORDER BY convergence_score DESC
  `).all();

  if (sessions.length === 0) return null;

  // Strongest convergences this week
  const strongConvergences = sessions.filter(s => s.convergence_score > 0.7);
  const chaosSignals = sessions.filter(s => s.meta_signal === 'CHAOS');

  // Most debated assets
  const assetCounts = {};
  for (const s of sessions) {
    assetCounts[s.asset] = (assetCounts[s.asset] || 0) + 1;
  }

  return {
    total_sessions: sessions.length,
    strong_convergences: strongConvergences.length,
    chaos_signals: chaosSignals.length,
    most_debated: assetCounts,
    top_convergence: strongConvergences[0] || null,
    sessions,
  };
}

// ── Query Interface ──────────────────────────────────────────────────────────

export function getRecentSessions(limit = 10) {
  const d = getDb();
  return d.prepare('SELECT * FROM roundtable_sessions ORDER BY id DESC LIMIT ?').all(limit);
}
