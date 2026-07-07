/**
 * reed-corner.js — Reed Corner: "Which visual styles are landing?"
 *
 * Same pattern as Trading Corner, different domain.
 * Analyzes which styles/formats get approved, adjusts weights.
 *
 * ESM.
 */

import { AgentOrgan } from '../organ.js';
import { SIGNALS } from '../escalation.js';

export class ReedCorner extends AgentOrgan {

  constructor(config = {}) {
    super('corner', 'EXECUTION', {
      minSamples: 3,
      boostThreshold: 0.7,
      benchThreshold: 0.2,
      ...config,
    });
  }

  observe(sharedState) {
    const perf = sharedState.performance || {};
    const history = perf.styleHistory || {};
    // styleHistory: { "cinematic": { total: 10, approved: 7, sent: 5 }, ... }
    return { styles: history };
  }

  evaluate(observations) {
    const findings = [];
    const multipliers = {};

    for (const [style, stats] of Object.entries(observations.styles)) {
      if (stats.total < this.config.minSamples) {
        multipliers[style] = 1.0;
        findings.push({ key: style, value: `${stats.total} samples — too early`, severity: 'low' });
        continue;
      }

      const approvalRate = stats.approved / stats.total;
      const sendRate = stats.sent / stats.total;

      if (approvalRate >= this.config.boostThreshold) {
        multipliers[style] = 1.3;
        findings.push({ key: style, value: `BOOST — ${(approvalRate * 100).toFixed(0)}% approval (${stats.approved}/${stats.total})`, severity: 'positive' });
      } else if (approvalRate <= this.config.benchThreshold) {
        multipliers[style] = 0.1;
        findings.push({ key: style, value: `BENCH — ${(approvalRate * 100).toFixed(0)}% approval (${stats.approved}/${stats.total})`, severity: 'high' });
      } else {
        multipliers[style] = 0.5 + approvalRate;
        findings.push({ key: style, value: `${(approvalRate * 100).toFixed(0)}% approval — ×${multipliers[style].toFixed(2)}`, severity: 'medium' });
      }
    }

    return {
      signal: SIGNALS.CONTINUE,
      findings,
      score: Object.keys(multipliers).length > 0 ? 70 : 50,
      multipliers,
    };
  }

  recommend(evaluation) {
    const boosted = Object.entries(evaluation.multipliers || {}).filter(([, v]) => v > 1.1).map(([k]) => k);
    const benched = Object.entries(evaluation.multipliers || {}).filter(([, v]) => v < 0.5).map(([k]) => k);

    return {
      actions: [
        ...(boosted.length ? [`boost: ${boosted.join(', ')}`] : []),
        ...(benched.length ? [`bench: ${benched.join(', ')}`] : []),
      ],
      multipliers: evaluation.multipliers,
      message: `${boosted.length} styles boosted, ${benched.length} benched`,
    };
  }
}
