// ~/nanoclaw/method-v2-classifier.js
// Method v2.0 — emergent claim classifier via Laya (local System One).
// Maps the 10-step decision procedure from DeepSeek relay (2026-09-29)
// to noul/choice/score questions. Steps 9-10 are generative (LLM territory).
//
// Usage: node method-v2-classifier.js "claim text"
// Import: import { classifyClaim } from './method-v2-classifier.js'

import { execFile } from 'child_process';
import { accessSync } from 'fs';
import path from 'path';

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

// ── Method v2.0 Questions (Steps 0-8) ─────────────────────────────────

const METHOD_QUESTIONS = {
  // Step 0: Operational frame
  operationalFrame: {
    type: 'score',
    instructions: 'How well-defined is the claimed effect in measurable, observable terms? Is it specific enough to test?',
    criteria: [
      'Completely vague — no measurable quantities named',
      'Named a phenomenon but no specific measurements',
      'Some measurable quantities but imprecise or ambiguous',
      'Specific measurable quantities with approximate values',
      'Precisely defined with exact measurements, units, and test conditions',
    ],
  },

  // Step 1: Invariant audit
  violatesConservation: {
    type: 'noul',
    instructions: 'Does this claim require violating any known conservation law (energy, momentum, charge, baryon number, etc.)?',
    criteria: {
      true: 'Requires violating a conservation law — energy from nothing, perpetual motion, mass creation',
      false: 'Compatible with conservation laws, or the mechanism stays within known physics bounds',
    },
  },

  // Step 2: Mechanism inventory
  mechanismType: {
    type: 'choice',
    instructions: 'Which physical mechanism category best explains the claimed effect?',
    criteria: [
      'LINEAR_SUPERPOSITION',
      'NONLINEAR_MIXING',
      'RESONANCE_AMPLIFICATION',
      'PHASE_MATCHING',
      'FEEDBACK_LOOP',
      'COMPUTATIONAL_EMERGENCE',
      'UNKNOWN_MECHANISM',
    ],
  },

  // Step 3: Resource feasibility
  resourceFeasibility: {
    type: 'score',
    instructions: 'How feasible are the resources (energy, time, precision, materials, compute) required for this claimed effect? Consider order-of-magnitude requirements.',
    criteria: [
      'Physically impossible — requires more energy than available in the observable universe',
      'Extreme — requires resources far beyond current civilization capability',
      'Challenging — requires significant but not impossible resources',
      'Moderate — achievable with current technology and reasonable investment',
      'Straightforward — requires only commonly available resources',
    ],
  },

  // Step 4: Signature prediction
  signaturesObservable: {
    type: 'noul',
    instructions: 'If this claimed effect is real, would it produce observable signatures detectable with current instrumentation?',
    criteria: {
      true: 'Predicted signatures are detectable — specific measurements could confirm or refute',
      false: 'No detectable signatures predicted, or detection requires technology that does not exist',
    },
  },

  // Step 5: Classification (the key output)
  classification: {
    type: 'choice',
    instructions: 'Based on the evidence presented, classify this claimed effect.',
    criteria: [
      'KNOWN_PHYSICS',
      'LOST_TECHNIQUE',
      'GENUINE_ANOMALY',
      'UNKNOWN',
    ],
  },

  // Step 5b: Classification confidence
  classificationConfidence: {
    type: 'score',
    instructions: 'How confident is the classification above? Consider evidence completeness, source quality, and potential for alternative explanations.',
    criteria: [
      'Very low — almost no evidence, classification is a guess',
      'Low — some evidence but major gaps',
      'Moderate — reasonable evidence but significant uncertainty remains',
      'High — strong evidence with minor gaps',
      'Very high — overwhelming evidence with minimal uncertainty',
    ],
  },

  // Step 6: Falsification
  falsifiable: {
    type: 'noul',
    instructions: 'Is there a feasible experiment or observation that could definitively falsify this claim?',
    criteria: {
      true: 'A specific, practical test could refute this claim',
      false: 'No practical falsification test exists — unfalsifiable or requires impossible conditions',
    },
  },

  // Step 7: Working visibility
  workingVisibility: {
    type: 'score',
    instructions: 'How much of the working (equations, data, derivations, experimental results) is shown or available?',
    criteria: [
      'No working shown — assertion only',
      'Minimal — references exist but working not presented',
      'Partial — some equations or data shown but gaps remain',
      'Substantial — most working visible with minor omissions',
      'Complete — full equations, data, and derivations shown',
    ],
  },

  // Step 8: Bias audit
  showsBiasPatterns: {
    type: 'noul',
    instructions: 'Does the source show bias patterns? Look for: consensus shield (invoking authority without derivation), dismissal without engagement, mystification (adding supernatural framing), false balance, plausible deniability.',
    criteria: {
      true: 'Shows one or more bias patterns — consensus shield, dismissal, mystification, or plausible deniability',
      false: 'No significant bias patterns — engages with evidence directly',
    },
  },
};

// ── Classifier ────────────────────────────────────────────────────────

export async function classifyClaim(claimText) {
  try { accessSync(LAYA_PYTHON); }
  catch { throw new Error('Laya not available — install laya-mlx at ~/laya-env/'); }

  const answers = await callLaya(claimText, METHOD_QUESTIONS);

  const classification = answers.classification?.choice ||
    (answers.classification?.probabilities
      ? Object.entries(answers.classification.probabilities).sort((a, b) => b[1] - a[1])[0]?.[0]
      : 'UNKNOWN');

  const mechanism = answers.mechanismType?.choice ||
    (answers.mechanismType?.probabilities
      ? Object.entries(answers.mechanismType.probabilities).sort((a, b) => b[1] - a[1])[0]?.[0]
      : 'UNKNOWN_MECHANISM');

  const confidenceRaw = answers.classificationConfidence?.score ?? 0;

  return {
    classification,
    mechanism,
    confidence: confidenceRaw / 4,

    steps: {
      operationalFrame: answers.operationalFrame?.score ?? 0,
      violatesConservation: answers.violatesConservation?.noul ?? 0,
      mechanism,
      mechanismProbabilities: answers.mechanismType?.probabilities || null,
      resourceFeasibility: answers.resourceFeasibility?.score ?? 0,
      signaturesObservable: answers.signaturesObservable?.noul ?? 0,
      classification,
      classificationProbabilities: answers.classification?.probabilities || null,
      classificationConfidence: confidenceRaw,
      falsifiable: answers.falsifiable?.noul ?? 0,
      workingVisibility: answers.workingVisibility?.score ?? 0,
      showsBiasPatterns: answers.showsBiasPatterns?.noul ?? 0,
    },

    grade: gradeFromSteps(answers),
    raw: answers,
  };
}

function gradeFromSteps(answers) {
  const frame = (answers.operationalFrame?.score ?? 0) / 4;
  const feasibility = (answers.resourceFeasibility?.score ?? 0) / 4;
  const visibility = (answers.workingVisibility?.score ?? 0) / 4;
  const confidence = (answers.classificationConfidence?.score ?? 0) / 4;
  const falsifiable = answers.falsifiable?.noul ?? 0;
  const noBias = 1 - (answers.showsBiasPatterns?.noul ?? 0);
  const noViolation = 1 - (answers.violatesConservation?.noul ?? 0);

  const composite =
    frame * 0.10 +
    noViolation * 0.15 +
    feasibility * 0.15 +
    falsifiable * 0.10 +
    confidence * 0.20 +
    visibility * 0.15 +
    noBias * 0.15;

  let grade;
  if (composite >= 0.80) grade = 'A';
  else if (composite >= 0.60) grade = 'B';
  else if (composite >= 0.40) grade = 'C';
  else if (composite >= 0.20) grade = 'D';
  else grade = 'F';

  return { composite, grade };
}

// ── CLI ───────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const claim = process.argv.slice(2).join(' ');
  if (!claim) {
    console.log('Usage: node method-v2-classifier.js "claim or passage to classify"');
    console.log('Returns: classification (KNOWN_PHYSICS|LOST_TECHNIQUE|GENUINE_ANOMALY|UNKNOWN)');
    console.log('         mechanism, confidence, grade (A-F), all step scores');
    process.exit(1);
  }
  classifyClaim(claim).then(r => {
    console.log(`\n  Classification: ${r.classification}`);
    console.log(`  Mechanism:      ${r.mechanism}`);
    console.log(`  Confidence:     ${(r.confidence * 100).toFixed(0)}%`);
    console.log(`  Grade:          ${r.grade.grade} (${(r.grade.composite * 100).toFixed(0)}%)\n`);
    console.log(JSON.stringify(r, null, 2));
  }).catch(e => {
    console.error('Error:', e.message);
  });
}
