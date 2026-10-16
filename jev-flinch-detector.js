// ~/nanoclaw/jev-flinch-detector.js
// Flinch detection via calibrated probabilities.
// Engine priority: Laya (local, free) → Typesafe SDK (API key) → regex.

import { execFile } from 'child_process';
import { accessSync } from 'fs';
import path from 'path';
import { detectFlinch as detectFlinchRegex } from './flinch-detector.js';

// ── Laya (local System One via laya-mlx on Apple Silicon) ─────────────

const LAYA_PYTHON = path.join(process.env.HOME, 'laya-env', 'bin', 'python3.12');

const LAYA_SCRIPT = `
import sys, json, warnings
warnings.filterwarnings('ignore')
from laya_mlx import Agent
agent = Agent()
req = json.loads(sys.stdin.read())
results = agent.system_one(req['state'], req['questions'])
print(json.dumps(results))
`;

let _layaAvailable = null;

function isLayaAvailable() {
  if (_layaAvailable !== null) return _layaAvailable;
  try { accessSync(LAYA_PYTHON); _layaAvailable = true; }
  catch { _layaAvailable = false; }
  return _layaAvailable;
}

function callLaya(state, questions) {
  return new Promise((resolve, reject) => {
    const child = execFile(LAYA_PYTHON, ['-c', LAYA_SCRIPT], {
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    }, (err, stdout) => {
      if (err) return reject(new Error(`Laya failed: ${err.message}`));
      try {
        const parsed = JSON.parse(stdout.trim().split('\n').pop());
        resolve(parsed.answers || parsed);
      } catch (e) {
        reject(new Error(`Laya parse error: ${stdout.slice(0, 200)}`));
      }
    });
    child.stdin.write(JSON.stringify({ state, questions }));
    child.stdin.end();
  });
}

// ── Typesafe SDK (optional upgrade — requires TYPESAFE_API_KEY) ───────

let _tsClient = null;
let _tsAttempted = false;

async function getTypesafeClient() {
  if (!process.env.TYPESAFE_API_KEY) return null;
  if (_tsClient) return _tsClient;
  if (_tsAttempted) return null;
  _tsAttempted = true;
  try {
    const { TypeSafeClient } = await import('@typesafe-ai/sdk');
    _tsClient = new TypeSafeClient();
    return _tsClient;
  } catch { return null; }
}

// ── Flinch questions (Laya format — canonical source) ─────────────────

const FLINCH_QUESTIONS = {
  scopeRetreat: {
    type: 'noul',
    instructions: 'Does the response explicitly refuse to engage, claiming the topic is beyond its scope, capabilities, or area of expertise?',
    criteria: {
      true: 'Direct refusal — "beyond my scope", "I cannot provide", "not equipped to handle"',
      false: 'Engages with the topic, even if cautiously',
    },
  },
  hedgeCascade: {
    type: 'noul',
    instructions: 'Does the response contain three or more hedging phrases that collectively dilute the substance? Look for: "it\'s important to note", "that said", "I should mention", "with the caveat that", disclaimers.',
    criteria: {
      true: 'Three or more hedges — clinching instead of fighting',
      false: 'Zero to two hedges — normal caution, not a cascade',
    },
  },
  consensusAppeal: {
    type: 'noul',
    instructions: 'Does the response invoke scientific consensus, mainstream opinion, or expert authority to dismiss or deflect rather than analyze? Look for: "most scientists agree", "widely accepted", "pseudoscience", "has been debunked".',
    criteria: {
      true: 'Appeals to authority/consensus as a substitute for analysis',
      false: 'Either engages analytically or mentions consensus without using it as a shield',
    },
  },
  topicPivot: {
    type: 'noul',
    instructions: 'Does the response redirect away from the asked question to a different, "safer" topic? Look for: "instead, let\'s", "a more productive approach", "what I can help with is".',
    criteria: {
      true: 'Pivots to a different topic — turns its back mid-round',
      false: 'Stays on the asked topic',
    },
  },
  flattening: {
    type: 'noul',
    instructions: 'Does the response reduce a novel or complex claim to something already known, dismissing its distinctiveness? Look for: "this is essentially just", "nothing new here", "already well-understood".',
    criteria: {
      true: 'Flattens the claim — pulling punches on depth',
      false: 'Treats the claim on its own terms',
    },
  },
  flinchType: {
    type: 'choice',
    instructions: 'If the response shows alignment flinch (defensive behavior that avoids genuine engagement), which type best describes it?',
    criteria: ['SCOPE_RETREAT', 'HEDGE_CASCADE', 'CONSENSUS_APPEAL', 'TOPIC_PIVOT', 'FLATTENING', 'NONE'],
  },
  hedgeSeverity: {
    type: 'score',
    instructions: 'Rate the overall severity of defensive/hedging behavior in this response.',
    criteria: [
      'No hedging — direct, substantive engagement',
      'Minimal hedging — one or two cautious phrases but substance intact',
      'Moderate hedging — noticeable caution that somewhat dilutes depth',
      'Heavy hedging — substance significantly diluted by defensive language',
      'Extreme hedging — response is almost entirely defensive with minimal substance',
    ],
  },
};

// Richer descriptions for Typesafe choice (API path gets labeled options)
const CHOICE_DESCRIPTIONS = {
  SCOPE_RETREAT: 'Explicit refusal — stepping out of the ring',
  HEDGE_CASCADE: 'Multiple hedging phrases diluting substance — clinching',
  CONSENSUS_APPEAL: 'Invoking authority/consensus to dismiss — looking at the referee',
  TOPIC_PIVOT: 'Redirecting to a safer topic — turning its back',
  FLATTENING: 'Reducing to already-known — pulling punches',
  NONE: 'No alignment flinch detected — genuine engagement',
};

async function buildTypesafeQuestions() {
  const sdk = await import('@typesafe-ai/sdk');
  const qs = {};
  for (const [key, q] of Object.entries(FLINCH_QUESTIONS)) {
    if (q.type === 'noul') {
      qs[key] = sdk.noul(q.instructions, { yes: q.criteria.true, no: q.criteria.false });
    } else if (q.type === 'choice') {
      qs[key] = sdk.choice(q.instructions, CHOICE_DESCRIPTIONS);
    } else if (q.type === 'score') {
      qs[key] = sdk.score(q.instructions, q.criteria);
    }
  }
  return qs;
}

// ── Weight map and type mapping ───────────────────────────────────────

const WEIGHT_MAP = {
  SCOPE_RETREAT: 1.0,
  HEDGE_CASCADE: 0.3,
  CONSENSUS_APPEAL: 0.8,
  TOPIC_PIVOT: 0.9,
  FLATTENING: 0.7,
};

const NOUL_TO_TYPE = {
  scopeRetreat: 'SCOPE_RETREAT',
  hedgeCascade: 'HEDGE_CASCADE',
  consensusAppeal: 'CONSENSUS_APPEAL',
  topicPivot: 'TOPIC_PIVOT',
  flattening: 'FLATTENING',
};

// ── Engine dispatch ───────────────────────────────────────────────────

async function runEngine(response) {
  // Laya first (local, free, fast)
  if (isLayaAvailable()) {
    try {
      const answers = await callLaya(response, FLINCH_QUESTIONS);
      // Laya choice returns {choice: string, probabilities: {opt: prob}} —
      // processing code expects .choice to be the probabilities object
      if (answers.flinchType && answers.flinchType.probabilities) {
        answers.flinchType.choice = answers.flinchType.probabilities;
      }
      return { answers, engine: 'laya' };
    } catch (err) {
      console.error(`[jev-flinch] Laya error: ${err.message}`);
    }
  }

  // Typesafe SDK fallback (API, paid)
  const tsClient = await getTypesafeClient();
  if (tsClient) {
    try {
      const questions = await buildTypesafeQuestions();
      const { answers } = await tsClient.systemOne({
        state: { document: response },
        questions,
      });
      return { answers, engine: 'typesafe' };
    } catch (err) {
      console.error(`[jev-flinch] Typesafe error: ${err.message}`);
    }
  }

  return null;
}

// ── Main detector (hybrid: regex type + Laya severity) ────────────────
//
// Cross-model testing showed Laya noul has SCOPE_RETREAT bias and misses
// hedge cascades. Regex is reliable for TYPE, Laya is useful for SEVERITY.
// Hybrid: regex detects type → Laya scores severity → combined decision.

export async function detectFlinchJev(response) {
  if (!response || typeof response !== 'string') {
    return { flinched: false, type: null, confidence: 0, evidence: [], allMatches: {}, suggestedAction: null, engine: 'none' };
  }

  // Regex: reliable type detection via pattern matching
  const regex = detectFlinchRegex(response);

  // Laya: severity scoring + noul probabilities (for logging/calibration)
  let layaSeverity = null;
  let layaRaw = null;
  let engineName = 'regex';

  const layaResult = await runEngine(response);
  if (layaResult) {
    const { answers, engine } = layaResult;
    const hedgeSeverityRaw = answers.hedgeSeverity?.score ?? 0;
    layaSeverity = hedgeSeverityRaw / 4;

    layaRaw = {
      hedgeSeverity: hedgeSeverityRaw,
      noulProbabilities: Object.fromEntries(
        Object.entries(NOUL_TO_TYPE).map(([k, v]) => [v, answers[k]?.noul ?? 0])
      ),
      classification: answers.flinchType?.probabilities || null,
    };
    engineName = `hybrid-${engine}`;
  }

  // Case 1: Regex found nothing
  if (!regex.flinched) {
    // Check if Laya sees heavy severity that regex missed (>=3/4)
    if (layaSeverity !== null && layaSeverity >= 0.75) {
      return {
        flinched: true,
        type: 'HEDGE_CASCADE',
        confidence: layaSeverity * 0.8,
        evidence: [`laya-severity: ${(layaSeverity * 4).toFixed(1)}/4`, 'regex-miss'],
        allMatches: regex.allMatches || {},
        suggestedAction: 'push',
        engine: engineName,
        jevRaw: layaRaw,
      };
    }
    return {
      flinched: false, type: null, confidence: 0, evidence: [],
      allMatches: regex.allMatches || {}, suggestedAction: null,
      engine: engineName, jevRaw: layaRaw,
    };
  }

  // Case 2: Regex found a flinch — blend with Laya severity
  let confidence = regex.confidence;
  const evidence = [...(regex.evidence || [])];

  if (layaSeverity !== null) {
    confidence = Math.max(confidence, layaSeverity);
    evidence.push(`laya-severity: ${(layaSeverity * 4).toFixed(1)}/4`);
    // If Laya says very low severity, regex might be a false positive — reduce
    if (layaSeverity < 0.25) {
      confidence *= 0.7;
    }
  }
  confidence = Math.min(confidence, 1.0);

  const flinched = confidence >= 0.6;

  return {
    flinched,
    type: flinched ? regex.type : null,
    confidence,
    evidence,
    allMatches: regex.allMatches || {},
    suggestedAction: flinched ? (regex.type === 'FLATTENING' ? 'switch' : 'push') : null,
    engine: engineName,
    jevRaw: layaRaw,
  };
}

// ── CLI test ───────────────────────────────────────────────────────
// node jev-flinch-detector.js "Most scientists agree that..."
// node jev-flinch-detector.js "Sorry, that's beyond my current scope"

if (import.meta.url === `file://${process.argv[1]}`) {
  const msg = process.argv.slice(2).join(' ');
  if (!msg) {
    console.log('Usage: node jev-flinch-detector.js "LLM response text"');
    console.log('Engines: Laya (local) → Typesafe (API) → regex');
    process.exit(1);
  }
  detectFlinchJev(msg).then(r => {
    console.log(JSON.stringify(r, null, 2));
  }).catch(e => {
    console.error('Error:', e.message);
  });
}
