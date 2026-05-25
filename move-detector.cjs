'use strict';

/**
 * move-detector.cjs — CJS bridge for agent-engine.js consumption.
 * Same logic as move-detector.js (ESM), CJS exports.
 */

const fs = require('fs');

const CATHEDRAL_CONV = process.env.HOME + '/cathedral-vault/00_Staging/cathedral/cathedral-convergences.json';
const BRIDGE_DATA = process.env.HOME + '/cathedral-vault/00_Staging/cathedral/rosetta-bridge.json';

const MOVES = [
  {
    id: 'gate',
    name: 'THE GATE',
    description: 'Threshold filtering — layered checks, signal must pass through coherent barriers',
    keywords: [
      'gate', 'filter', 'threshold', 'barrier', 'guard', 'check', 'validate', 'screen',
      'pass through', 'block', 'allow', 'reject', 'triage', 'ensemble', 'qualify',
      'access', 'boundary', 'permission', 'calibration', 'grading', 'scoring',
      'entry', 'exit', 'promotion', 'criteria', 'standard', 'test', 'audit'
    ],
    patterns: [
      /should (this|we|i) (accept|allow|let|approve|pass)/i,
      /how do (we|i) (filter|screen|check|validate|vet)/i,
      /what('s| is) the (criteria|standard|threshold|bar|gate)/i,
      /(grade|score|rate|rank|evaluate|assess)/i,
      /is (this|it) (good|strong|weak|real|legit|solid) enough/i,
      /(block|reject|kill|cut|remove|eliminate)/i,
      /which (ones?|should) (pass|qualify|survive|make it)/i
    ]
  },
  {
    id: 'broken_loop',
    name: 'THE BROKEN LOOP',
    description: 'Dysfunction diagnosed as severed feedback — repair = restore the loop',
    keywords: [
      'broken', 'stuck', 'stalled', 'plateau', 'blocked', 'silent', 'stopped',
      'not working', 'failing', 'stagnant', 'frozen', 'dead', 'dark', 'gone quiet',
      "why isn't", 'what happened', 'used to work', 'no response', 'no feedback',
      'loop', 'cycle', 'feedback', 'return', 'severed', 'disconnected',
      'resistance', 'fear', 'avoidance', 'procrastination', 'block'
    ],
    patterns: [
      /why (is|has|did) .+ (stopped?|stalled?|broken|silent|quiet|dead|dark)/i,
      /what('s| is) (wrong|broken|blocking|stuck)/i,
      /(not|isn't|hasn't) (responding|working|producing|moving|progressing)/i,
      /used to .+ (but|now)/i,
      /(diagnose|troubleshoot|debug|investigate|figure out)/i,
      /where did .+ (go|break|fail|stop)/i,
      /(plateau|bottleneck|ceiling|wall|barrier|block)/i
    ]
  },
  {
    id: 'signal_noise',
    name: 'SIGNAL IN NOISE',
    description: 'Pattern recognition to extract truth from interference',
    keywords: [
      'signal', 'noise', 'pattern', 'real', 'fake', 'genuine', 'true',
      'distinguish', 'separate', 'extract', 'find', 'detect', 'identify',
      'what matters', "what's real", 'which is', 'sort', 'sift', 'parse',
      'meaningful', 'relevant', 'important', 'actual', 'legitimate',
      'disinfo', 'suppression', 'hidden', 'buried', 'obscured', 'noise'
    ],
    patterns: [
      /what('s| is) (real|genuine|true|actual|legit) (here|in this)/i,
      /how do (we|i) (tell|know|distinguish|separate|find)/i,
      /is (this|it) (real|genuine|signal|noise|legit|bs)/i,
      /(sift|sort|parse|extract|mine|dig) through/i,
      /what (matters|counts|is important|should i focus on)/i,
      /(hidden|buried|obscured|suppressed|overlooked)/i,
      /too much .+ (how|what|which)/i
    ]
  },
  {
    id: 'calibrate_execute_observe',
    name: 'CALIBRATE-EXECUTE-OBSERVE',
    description: 'Closed-loop feedback cycle — set up, act, watch result, adjust',
    keywords: [
      'try', 'test', 'run', 'fire', 'execute', 'launch', 'start', 'deploy',
      'check', 'observe', 'watch', 'monitor', 'measure', 'track', 'see what',
      'adjust', 'tweak', 'calibrate', 'tune', 'refine', 'iterate',
      'experiment', 'trial', 'paper', 'prototype', 'pilot', 'mvp',
      'set up', 'configure', 'prepare', 'ready'
    ],
    patterns: [
      /let('s| us) (try|test|run|fire|see|check)/i,
      /what (happens|happened) (when|if|after)/i,
      /(did|does) (it|that|this) (work|help|change|improve)/i,
      /how (do|did|should) (we|i) (measure|track|know|tell)/i,
      /(adjust|tweak|refine|tune|calibrate|iterate)/i,
      /run (it|this|that) (again|and see|then check)/i,
      /(set up|configure|prepare|ready) .+ (then|and|before)/i
    ]
  },
  {
    id: 'phi_ruler',
    name: 'PHI AS RULER',
    description: 'Golden ratio as coherence test — does this feel proportioned?',
    keywords: [
      'proportion', 'ratio', 'balance', 'harmony', 'golden', 'fibonacci',
      'phi', 'rhythm', 'timing', 'spacing', 'feels right', 'feels off',
      'too much', 'too little', 'not enough', 'just right', 'sweet spot',
      'elegant', 'clean', 'natural', 'organic', 'flow', 'coherent'
    ],
    patterns: [
      /(feels?|seems?|looks?) (right|off|wrong|good|natural|forced|organic)/i,
      /is (this|the) (balance|ratio|proportion|timing|spacing) (right|off|good)/i,
      /(too much|too little|not enough|over|under)(done|built|heavy|light)/i,
      /(elegant|clean|clunky|bloated|lean|tight|sparse)/i,
      /what('s| is) the (right|ideal|optimal|best) (ratio|balance|proportion|split)/i,
      /(sweet spot|goldilocks|just right)/i
    ]
  }
];

// Detection
function detectMoves(message) {
  if (!message || typeof message !== 'string') return [];
  const lower = message.toLowerCase();
  const detected = [];

  for (const move of MOVES) {
    let score = 0;
    const keywordHits = move.keywords.filter(kw => lower.includes(kw.toLowerCase()));
    score += keywordHits.length;
    const patternHits = move.patterns.filter(p => p.test(message));
    score += patternHits.length * 3;

    if (score >= 2) {
      detected.push({
        move: move.id,
        name: move.name,
        description: move.description,
        score,
        confidence: score >= 8 ? 'high' : score >= 4 ? 'medium' : 'low',
        keywords: keywordHits.slice(0, 5),
        patterns: patternHits.length
      });
    }
  }
  return detected.sort((a, b) => b.score - a.score);
}

// Parallel retrieval
let _cathedralCache = null;
let _bridgeCache = null;

function loadConvergences() {
  if (!_cathedralCache && fs.existsSync(CATHEDRAL_CONV)) {
    try { _cathedralCache = JSON.parse(fs.readFileSync(CATHEDRAL_CONV, 'utf8')); } catch {}
  }
  if (!_bridgeCache && fs.existsSync(BRIDGE_DATA)) {
    try { _bridgeCache = JSON.parse(fs.readFileSync(BRIDGE_DATA, 'utf8')); } catch {}
  }
}

function getParallels(moveId, currentDomain, maxResults) {
  maxResults = maxResults || 3;
  loadConvergences();
  const parallels = [];

  const moveMapping = {
    gate: ['gate', 'ensemble gate', 'threshold', 'filter', 'sovereignty boundary'],
    broken_loop: ['broken return loop', 'broken loop', 'fear gate', 'broken', 'loop'],
    signal_noise: ['signal', 'noise', 'extraction', 'calibration', 'diagnostic'],
    calibrate_execute_observe: ['calibrate', 'execute', 'observe', 'feedback', 'loop'],
    phi_ruler: ['phi', 'fibonacci', 'golden', 'harmonic', 'ratio', 'rhythm']
  };

  const searchTerms = moveMapping[moveId] || [];

  if (_cathedralCache && _cathedralCache.convergences) {
    for (const c of _cathedralCache.convergences) {
      const text = (c.pattern + ' ' + (c.insight || '') + ' ' + JSON.stringify(c.evidence || '')).toLowerCase();
      const matches = searchTerms.filter(t => text.includes(t));
      if (matches.length >= 1) {
        const domains = (c.domains || []).map(d => d.toLowerCase());
        if (currentDomain && domains.length === 1 && domains[0] === currentDomain.toLowerCase()) continue;
        parallels.push({
          source: 'cathedral',
          pattern: c.pattern,
          domains: c.domains || [],
          grade: c.grade,
          insight: c.insight || '',
          actionable: c.actionable || '',
          relevance: matches.length
        });
      }
    }
  }

  if (_bridgeCache && _bridgeCache.bridges) {
    for (const b of _bridgeCache.bridges) {
      const text = (b.ancient_pattern + ' ' + b.modern_pattern + ' ' + (b.structural_link || '')).toLowerCase();
      const matches = searchTerms.filter(t => text.includes(t));
      if (matches.length >= 1) {
        parallels.push({
          source: 'bridge',
          ancient: b.ancient_pattern,
          modern: b.modern_pattern,
          grade: b.grade,
          link: b.structural_link || '',
          scale: b.scale_mapping || '',
          relevance: matches.length
        });
      }
    }
  }

  const gradeOrder = { S: 0, A: 1, B: 2, C: 3 };
  parallels.sort((a, b) => b.relevance - a.relevance || (gradeOrder[a.grade] || 4) - (gradeOrder[b.grade] || 4));
  return parallels.slice(0, maxResults);
}

function buildMoveContext(message, currentDomain) {
  const moves = detectMoves(message);
  if (moves.length === 0) return null;

  const primary = moves[0];
  const parallels = getParallels(primary.move, currentDomain, 3);
  if (parallels.length === 0) return null;

  let context = '\n[MOVE DETECTOR: Paul is running "' + primary.name + '" — ' + primary.description + ']\n';
  context += 'Cross-domain parallels:\n';

  for (const p of parallels) {
    if (p.source === 'cathedral') {
      const otherDomains = (p.domains || []).filter(d => d.toLowerCase() !== (currentDomain || '').toLowerCase());
      context += '- ' + p.pattern + ' [' + otherDomains.join(', ') + ']: ' + p.insight.slice(0, 150) + '\n';
    } else if (p.source === 'bridge') {
      context += '- ANCIENT: "' + p.ancient + '" = MODERN: "' + p.modern + '" — ' + p.link.slice(0, 150) + '\n';
    }
  }

  if (moves.length > 1) {
    context += '\nSecondary move: ' + moves[1].name + ' (' + moves[1].confidence + ' confidence)\n';
  }

  return context;
}

module.exports = { MOVES, detectMoves, getParallels, buildMoveContext };
