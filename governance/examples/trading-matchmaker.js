/**
 * trading-matchmaker.js — Trading Matchmaker as a constitutional organ.
 *
 * Wraps the existing the-matchmaker.js to implement the AgentOrgan interface.
 * Proof that existing organs map cleanly onto the contract.
 *
 * ESM.
 */

import { AgentOrgan } from '../organ.js';
import { SIGNALS } from '../escalation.js';
import { shouldFight } from '../../trader/the-matchmaker.js';

export class TradingMatchmaker extends AgentOrgan {

  constructor(config = {}) {
    super('matchmaker', 'PERCEPTION', config);
  }

  observe(_sharedState) {
    // The existing matchmaker reads its own state (regime, trades, benchmark)
    // We just call it and capture its full analysis
    const decision = shouldFight();
    return {
      fight: decision.fight,
      allowedDirection: decision.allowed_direction,
      warnings: decision.warnings,
      checks: decision.checks,
      reasons: decision.reasons,
    };
  }

  evaluate(observations) {
    let signal;
    if (!observations.fight) {
      signal = SIGNALS.ABORT;
    } else if (observations.warnings.length > 0) {
      signal = SIGNALS.CONTINUE; // fight but with caution
    } else {
      signal = SIGNALS.CONTINUE;
    }

    return {
      signal,
      findings: observations.reasons.map(r => ({ key: 'check', value: r })),
      score: observations.fight ? 80 : 20,
    };
  }

  recommend(evaluation) {
    return {
      actions: evaluation.signal === SIGNALS.ABORT ? ['sit_out'] : ['fight'],
      direction: this._observations?.allowedDirection || null,
      message: evaluation.findings.map(f => f.value).join('; '),
    };
  }

  enforce(action, evaluation) {
    if (!evaluation || evaluation.signal === SIGNALS.ABORT) {
      return { blocked: true, reason: 'Matchmaker says sit out — no new entries' };
    }

    // Direction restriction
    if (this._observations?.allowedDirection === 'long_only' && action.direction === 'short') {
      return { blocked: true, reason: 'Matchmaker: long_only restriction — short blocked' };
    }
    if (this._observations?.allowedDirection === 'short_only' && action.direction === 'long') {
      return { blocked: true, reason: 'Matchmaker: short_only restriction — long blocked' };
    }

    return { blocked: false };
  }

  // Override run to cache observations for enforce()
  run(sharedState) {
    this._observations = this.observe(sharedState);
    const evaluation = this.evaluate(this._observations);
    const recommendation = this.recommend(evaluation);

    this.lastResult = { ...evaluation, ...recommendation };
    this.lastRun = new Date().toISOString();

    return {
      organ: this.name,
      level: this.level,
      signal: evaluation.signal,
      recommendation,
      evaluation,
      timestamp: this.lastRun,
    };
  }
}
