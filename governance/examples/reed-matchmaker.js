/**
 * reed-matchmaker.js — Reed Visual Director Matchmaker.
 *
 * "Should Reed generate today, or sit out?"
 *
 * Same interface as Trading Matchmaker, different domain logic.
 * Proves the Autonomy Constitution is domain-agnostic.
 *
 * Checks:
 *   1. Output saturation — have we generated too much recently?
 *   2. Quality trend — are recent generations landing or being ignored?
 *   3. Resource availability — do we have API credits?
 *   4. Timing — is this a good time for visual content?
 *
 * ESM.
 */

import { AgentOrgan } from '../organ.js';
import { SIGNALS } from '../escalation.js';
import fs from 'fs';
import path from 'path';

export class ReedMatchmaker extends AgentOrgan {

  constructor(config = {}) {
    super('matchmaker', 'PERCEPTION', {
      maxDailyGenerations: 12,
      minQualityRate: 0.3,
      ...config,
    });
  }

  observe(sharedState) {
    const perf = sharedState.performance || {};
    const resource = sharedState.resource || {};

    return {
      generationsToday: perf.generationsToday || 0,
      generationsThisWeek: perf.generationsThisWeek || 0,
      recentQualityRate: perf.recentQualityRate ?? 1.0, // % approved/sent vs generated
      approvedCount: perf.approvedCount || 0,
      rejectedCount: perf.rejectedCount || 0,
      apiCreditsRemaining: resource.apiCredits ?? Infinity,
      lastGenerationAge: perf.lastGenerationTime
        ? (Date.now() - new Date(perf.lastGenerationTime).getTime()) / 3600000
        : 24,
    };
  }

  evaluate(obs) {
    const findings = [];
    let signal = SIGNALS.CONTINUE;

    // Check 1: Output saturation
    if (obs.generationsToday >= this.config.maxDailyGenerations) {
      findings.push({ key: 'saturation', value: `${obs.generationsToday} generations today — at daily cap`, severity: 'high' });
      signal = SIGNALS.PAUSE;
    } else if (obs.generationsToday >= this.config.maxDailyGenerations * 0.8) {
      findings.push({ key: 'saturation', value: `${obs.generationsToday} generations today — approaching cap`, severity: 'medium' });
    }

    // Check 2: Quality trend
    const totalRecent = obs.approvedCount + obs.rejectedCount;
    if (totalRecent >= 5 && obs.recentQualityRate < this.config.minQualityRate) {
      findings.push({ key: 'quality', value: `Quality rate ${(obs.recentQualityRate * 100).toFixed(0)}% — generating waste`, severity: 'high' });
      signal = signal === SIGNALS.PAUSE ? SIGNALS.ABORT : SIGNALS.PAUSE;
    }

    // Check 3: Resources
    if (obs.apiCreditsRemaining < 5) {
      findings.push({ key: 'resources', value: `Only ${obs.apiCreditsRemaining} API credits remaining`, severity: 'critical' });
      signal = SIGNALS.ABORT;
    } else if (obs.apiCreditsRemaining < 20) {
      findings.push({ key: 'resources', value: `${obs.apiCreditsRemaining} credits — conserve`, severity: 'medium' });
    }

    // Check 4: Cooldown
    if (obs.lastGenerationAge < 0.5) {
      findings.push({ key: 'cooldown', value: `Last generation ${(obs.lastGenerationAge * 60).toFixed(0)}min ago — too frequent`, severity: 'low' });
    }

    if (findings.length === 0) {
      findings.push({ key: 'clear', value: 'All checks passed', severity: 'none' });
    }

    const score = Math.max(0, 100
      - (obs.generationsToday / this.config.maxDailyGenerations * 30)
      - (obs.recentQualityRate < 0.5 ? 30 : 0)
      - (obs.apiCreditsRemaining < 20 ? 20 : 0)
    );

    return { signal, findings, score: Math.round(score) };
  }

  recommend(evaluation) {
    const generate = evaluation.signal === SIGNALS.CONTINUE;
    return {
      actions: generate ? ['generate'] : ['wait'],
      message: evaluation.findings.map(f => f.value).join('; '),
    };
  }

  enforce(action, evaluation) {
    if (!evaluation || evaluation.signal === SIGNALS.ABORT) {
      return { blocked: true, reason: 'Reed Matchmaker: sitting out — quality or resources depleted' };
    }
    if (evaluation.signal === SIGNALS.PAUSE) {
      return { blocked: true, reason: 'Reed Matchmaker: paused — output saturated or quality dropping' };
    }
    return { blocked: false };
  }
}
