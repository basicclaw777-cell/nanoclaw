/**
 * organ.js — The AgentOrgan contract.
 *
 * Every organ in the Autonomy Constitution implements this interface.
 * Organs are not layers — they run simultaneously, like biological organs.
 * Each reads shared state, writes observations, emits recommendations.
 *
 * Five methods. Five escalation signals. No direct coupling between organs.
 *
 * ESM.
 */

import { SIGNALS } from './escalation.js';

export class AgentOrgan {

  constructor(name, level, config = {}) {
    this.name = name;
    this.level = level; // PURPOSE | PERCEPTION | GOVERNANCE | EXECUTION | LEARNING
    this.config = config;
    this.lastResult = null;
    this.lastRun = null;
  }

  /**
   * Read shared state. Gather inputs.
   * Returns: raw observations object.
   */
  observe(_sharedState) {
    throw new Error(`${this.name}.observe() not implemented`);
  }

  /**
   * Run checks/analysis on observations.
   * Returns: { signal, findings[], score? }
   *   signal: one of PASS | CONTINUE | PAUSE | ESCALATE | ABORT
   *   findings: array of { key, value, severity? }
   *   score: optional 0-100 health score
   */
  evaluate(_observations) {
    throw new Error(`${this.name}.evaluate() not implemented`);
  }

  /**
   * Emit advisory based on evaluation.
   * Returns: { actions[], multipliers?, direction?, message }
   *   actions: what should change
   *   multipliers: optional weight adjustments (Corner pattern)
   *   direction: optional direction constraint
   *   message: human-readable summary
   */
  recommend(_evaluation) {
    throw new Error(`${this.name}.recommend() not implemented`);
  }

  /**
   * Apply hard blocks/constraints. Called by the orchestrator.
   * Returns: { blocked: bool, reason? }
   *   If blocked=true, the action is stopped. No override except Mission Commander or human.
   */
  enforce(_action, _evaluation) {
    return { blocked: false };
  }

  /**
   * Justify decisions in human-readable form.
   * Returns: { summary, details[], signal, timestamp }
   */
  explain() {
    if (!this.lastResult) return { summary: `${this.name}: no data yet`, details: [], signal: SIGNALS.PASS };
    return {
      summary: this.lastResult.message || `${this.name}: evaluated`,
      details: this.lastResult.findings || [],
      signal: this.lastResult.signal || SIGNALS.PASS,
      timestamp: this.lastRun,
    };
  }

  /**
   * Full organ cycle: observe → evaluate → recommend.
   * Stores result for explain(). Returns the recommendation.
   */
  run(sharedState) {
    const observations = this.observe(sharedState);
    const evaluation = this.evaluate(observations);
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
