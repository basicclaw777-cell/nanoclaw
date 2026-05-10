// Sky Sense — Convergence Detector (Looking Glass Layer 3)
// Fuses sky state + events index + vault pattern memory into scored signals.
// Scans forward N days. Scores: pipeline consensus × historical precedent × pattern match.
//
// Signal types:
//   CONVERGENCE PEAK — all pipelines agree + historical precedent + pattern match
//   DIVERGENCE FRONTIER — pipelines disagree maximally — unknown territory
//   PATTERN ECHO — current sky matches past config that preceded known event
//   SILENT ZONE — no signals, stable unremarkable sky

import { skyState, findEvents, comparePipelines } from './index.mjs';
import { EVENTS_DB, skyFingerprint, findSimilarConfigs, scanForPatternEchoes } from './events-index.mjs';
import { DEG } from './time.mjs';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const HOME = process.env.HOME || '/Users/basicclaw777';
const GRAPH_PATH = join(HOME, 'Cathedral/predictive-intelligence/knowledge-graph.json');
const PREDICTIONS_PATH = join(HOME, 'Cathedral/predictive-intelligence/predictions.json');
const SEEDS_PATH = join(HOME, 'Cathedral/predictive-intelligence/autonomous-seeds.json');

// ── Vault Pattern Memory Query ──────────────────────────────────────────────
// Search the predictive intelligence graph for nodes related to sky/celestial themes.

function queryPatternMemory(skyStateObj) {
  if (!existsSync(GRAPH_PATH)) return { found: false, reason: 'no graph' };

  try {
    const graph = JSON.parse(readFileSync(GRAPH_PATH, 'utf-8'));
    const nodes = graph.nodes || [];
    const edges = graph.edges || graph.links || [];

    // Find celestial/astronomical nodes by tags and title keywords
    const skyKeywords = [
      'eclipse', 'moon', 'lunar', 'solar', 'planet', 'conjunction',
      'retrograde', 'equinox', 'solstice', 'celestial', 'astronomical',
      'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'zodiac',
      'cosmology', 'sky', 'comet', 'orbit', 'frequency', 'cycle',
      'schumann', 'resonance', 'tidal', 'magnetic',
    ];

    const matchedNodes = nodes.filter(n => {
      const title = (n.title || '').toLowerCase();
      const tags = (n.tags || []).map(t => t.toLowerCase());
      return skyKeywords.some(k => title.includes(k) || tags.some(t => t.includes(k)));
    });

    // Find edges connecting celestial nodes to other domains
    const celestialIds = new Set(matchedNodes.map(n => n.id));
    const crossDomainEdges = edges.filter(e =>
      (celestialIds.has(e.source) && !celestialIds.has(e.target)) ||
      (celestialIds.has(e.target) && !celestialIds.has(e.source))
    );

    // Find which domains are connected to celestial nodes
    const connectedDomains = new Map();
    for (const edge of crossDomainEdges) {
      const otherId = celestialIds.has(edge.source) ? edge.target : edge.source;
      const otherNode = nodes.find(n => n.id === otherId);
      if (otherNode) {
        const domain = otherNode.domain || 'unknown';
        connectedDomains.set(domain, (connectedDomains.get(domain) || 0) + 1);
      }
    }

    return {
      found: true,
      celestialNodes: matchedNodes.length,
      crossDomainEdges: crossDomainEdges.length,
      connectedDomains: Object.fromEntries(connectedDomains),
      totalGraphNodes: nodes.length,
      totalGraphEdges: edges.length,
    };
  } catch (e) {
    return { found: false, reason: e.message };
  }
}

// ── Autonomous Seeds Query ──────────────────────────────────────────────────
// Check if any autonomous seed questions relate to current sky state.

function checkAutonomousSeeds() {
  if (!existsSync(SEEDS_PATH)) return [];

  try {
    const seeds = JSON.parse(readFileSync(SEEDS_PATH, 'utf-8'));
    const skyKeywords = ['eclipse', 'moon', 'planet', 'celestial', 'cycle', 'frequency', 'resonance', 'cosmology'];
    return (seeds.seeds || seeds || []).filter(s => {
      const text = (s.question || s.seed || s || '').toLowerCase();
      return skyKeywords.some(k => text.includes(k));
    }).slice(0, 5);
  } catch {
    return [];
  }
}

// ── Convergence Scoring ─────────────────────────────────────────────────────

function scoreConvergence(skyObj, historicalMatches, patternMemory) {
  let score = 0;

  // Pipeline consensus (0-0.3): how much do the 5 models agree?
  const consensusRatio = skyObj.pipelines.consensus.confidence;
  score += consensusRatio * 0.3;

  // Historical precedent (0-0.3): how strongly does this match a known event?
  if (historicalMatches.length > 0) {
    score += Math.min(historicalMatches[0].score, 1) * 0.3;
  }

  // Pattern memory connection (0-0.2): does the vault graph link celestial to other domains?
  if (patternMemory.found && patternMemory.crossDomainEdges > 0) {
    const density = Math.min(patternMemory.crossDomainEdges / 50, 1);
    score += density * 0.2;
  }

  // Divergence penalty/bonus (0-0.2):
  // High divergence = research frontier (interesting, but different signal)
  const maxDiv = skyObj.pipelines.contested.maxDivergenceDeg || 0;
  if (maxDiv > 5) {
    // High divergence = frontier signal, not convergence
    score -= 0.1;
  } else if (maxDiv < 1) {
    // All agree = strong convergence bonus
    score += 0.2;
  }

  return Math.max(0, Math.min(1, score));
}

// ── Signal Classification ───────────────────────────────────────────────────

function classifySignal(convergenceScore, skyObj, historicalMatches) {
  const maxDiv = skyObj.pipelines.contested.maxDivergenceDeg || 0;

  if (maxDiv > 10) {
    return {
      type: 'DIVERGENCE_FRONTIER',
      label: `${skyObj.pipelines.contested.maxDivergenceBody} at ${maxDiv.toFixed(1)}° spread — uncharted territory`,
      urgency: 'high',
    };
  }

  if (convergenceScore > 0.6 && historicalMatches.length > 0) {
    return {
      type: 'CONVERGENCE_PEAK',
      label: `Strong signal — ${historicalMatches[0].event.label} pattern echo + pipeline consensus`,
      urgency: 'high',
    };
  }

  if (historicalMatches.length > 0 && historicalMatches[0].score > 0.4) {
    return {
      type: 'PATTERN_ECHO',
      label: `Sky resembles ${historicalMatches[0].event.label} (${(historicalMatches[0].score * 100).toFixed(0)}% match)`,
      urgency: 'medium',
    };
  }

  if (convergenceScore < 0.2) {
    return {
      type: 'SILENT_ZONE',
      label: 'No significant signals — stable, unremarkable sky',
      urgency: 'low',
    };
  }

  return {
    type: 'AMBIENT',
    label: 'Low-level activity — monitoring',
    urgency: 'low',
  };
}

// ── Main API ────────────────────────────────────────────────────────────────

/**
 * lookForward(options) — scan forward N days for convergence signals.
 * This is the Looking Glass Layer 3 entry point.
 */
export function lookForward(options = {}) {
  const { days = 90, resolution = 7, threshold = 0.15 } = options;
  const now = options.from ? new Date(options.from) : new Date();
  const signals = [];

  const patternMemory = queryPatternMemory();
  const seeds = checkAutonomousSeeds();

  for (let d = 0; d <= days; d += resolution) {
    const timestamp = new Date(now.getTime() + d * 86400000);
    const sky = skyState(timestamp);
    const historicalMatches = findSimilarConfigs(timestamp, { maxResults: 3, minScore: 0.3 });
    const convergenceScore = scoreConvergence(sky, historicalMatches, patternMemory);

    if (convergenceScore >= threshold) {
      const signal = classifySignal(convergenceScore, sky, historicalMatches);
      signals.push({
        date: timestamp.toISOString().split('T')[0],
        daysFromNow: d,
        convergenceScore: Math.round(convergenceScore * 100),
        signal,
        sky: {
          moonPhase: sky.events.moonPhase.name,
          retrogrades: sky.events.currentRetrogrades,
          frontier: sky.pipelines.frontier,
          consensusPercent: Math.round(sky.pipelines.consensus.confidence * 100),
        },
        historicalMatches: historicalMatches.slice(0, 2).map(m => ({
          label: m.event.label,
          score: Math.round(m.score * 100),
          topAftermath: m.event.aftermath[0],
          grade: m.event.grade,
        })),
      });
    }
  }

  // Sort by convergence score
  signals.sort((a, b) => b.convergenceScore - a.convergenceScore);

  // Generate narrative
  const narrative = generateNarrative(signals, patternMemory, seeds);

  return {
    scanDate: now.toISOString().split('T')[0],
    scanDays: days,
    resolution,
    totalSignals: signals.length,
    peaks: signals.filter(s => s.signal.type === 'CONVERGENCE_PEAK').length,
    frontiers: signals.filter(s => s.signal.type === 'DIVERGENCE_FRONTIER').length,
    echoes: signals.filter(s => s.signal.type === 'PATTERN_ECHO').length,
    silentZones: signals.filter(s => s.signal.type === 'SILENT_ZONE').length,
    signals,
    patternMemory,
    relatedSeeds: seeds,
    narrative,
  };
}

/**
 * todaySignal() — quick check: what does today's sky say?
 */
export function todaySignal() {
  const now = new Date();
  const sky = skyState(now);
  const historicalMatches = findSimilarConfigs(now, { maxResults: 3, minScore: 0.3 });
  const patternMemory = queryPatternMemory();
  const convergenceScore = scoreConvergence(sky, historicalMatches, patternMemory);
  const signal = classifySignal(convergenceScore, sky, historicalMatches);

  return {
    date: now.toISOString().split('T')[0],
    convergenceScore: Math.round(convergenceScore * 100),
    signal,
    moonPhase: sky.events.moonPhase.name,
    retrogrades: sky.events.currentRetrogrades,
    frontier: sky.pipelines.frontier,
    historicalMatches: historicalMatches.map(m => ({
      label: m.event.label,
      score: Math.round(m.score * 100),
      pattern: m.event.pattern.slice(0, 150),
    })),
  };
}

// ── Narrative Generator ─────────────────────────────────────────────────────

function generateNarrative(signals, patternMemory, seeds) {
  if (signals.length === 0) return 'Silent sky. No significant signals in scan window.';

  const peaks = signals.filter(s => s.signal.type === 'CONVERGENCE_PEAK');
  const frontiers = signals.filter(s => s.signal.type === 'DIVERGENCE_FRONTIER');
  const echoes = signals.filter(s => s.signal.type === 'PATTERN_ECHO');

  const parts = [];

  if (peaks.length) {
    const p = peaks[0];
    parts.push(`Convergence peak on ${p.date} (${p.convergenceScore}% score). ${p.signal.label}.`);
    if (p.historicalMatches.length && p.historicalMatches[0].topAftermath) {
      const a = p.historicalMatches[0].topAftermath;
      parts.push(`Last time this pattern appeared: ${a.domain} — ${a.event}.`);
    }
  }

  if (frontiers.length) {
    parts.push(`${frontiers.length} divergence frontier${frontiers.length > 1 ? 's' : ''} detected — models disagree, research territory.`);
  }

  if (echoes.length) {
    parts.push(`${echoes.length} pattern echo${echoes.length > 1 ? 's' : ''}: sky configs matching historical events.`);
  }

  if (patternMemory.found && patternMemory.celestialNodes > 0) {
    const domains = Object.keys(patternMemory.connectedDomains).slice(0, 3).join(', ');
    parts.push(`Vault graph has ${patternMemory.celestialNodes} celestial nodes bridging to: ${domains}.`);
  }

  if (seeds.length) {
    parts.push(`${seeds.length} autonomous seed question${seeds.length > 1 ? 's' : ''} related to celestial patterns.`);
  }

  return parts.join(' ');
}

// ── Format for Telegram ─────────────────────────────────────────────────────

export function formatForTelegram(result) {
  let text = `◎ LOOKING GLASS — ${result.scanDays}-day scan from ${result.scanDate}\n\n`;

  // Summary
  text += `Signals: ${result.totalSignals}`;
  if (result.peaks) text += ` · ${result.peaks} peaks`;
  if (result.frontiers) text += ` · ${result.frontiers} frontiers`;
  if (result.echoes) text += ` · ${result.echoes} echoes`;
  text += '\n\n';

  // Top signals
  const top = result.signals.slice(0, 5);
  for (const s of top) {
    const icon = {
      CONVERGENCE_PEAK: '▲',
      DIVERGENCE_FRONTIER: '◇',
      PATTERN_ECHO: '○',
      SILENT_ZONE: '·',
      AMBIENT: '·',
    }[s.signal.type] || '·';

    text += `${icon} ${s.date} (day +${s.daysFromNow}) — ${s.convergenceScore}%\n`;
    text += `  ${s.signal.label}\n`;
    if (s.historicalMatches.length) {
      const m = s.historicalMatches[0];
      text += `  echo: ${m.label} (${m.score}%)\n`;
    }
    text += '\n';
  }

  // Narrative
  text += `Narrative: ${result.narrative}`;

  return text;
}
