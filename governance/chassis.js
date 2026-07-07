/**
 * chassis.js — The Autonomy Chassis.
 *
 * Orchestrates all organs for an agent. Runs the full constitutional cycle:
 *   PURPOSE → PERCEPTION → GOVERNANCE → EXECUTION → LEARNING
 *
 * Organs run by level. Within each level, organs run in parallel (conceptually).
 * The chassis resolves signals across organs and makes the final call.
 *
 * Usage:
 *   const chassis = new AutonomyChassis('cyclical-trader', __dirname, identity);
 *   chassis.register(new TradingMatchmaker());
 *   chassis.register(new TradingBalanceCheck());
 *   const result = chassis.run();
 *   if (result.signal === 'ABORT') { ... }
 *
 * ESM.
 */

import { StateBus } from './state-bus.js';
import { resolveSignals, SIGNALS } from './escalation.js';

const LEVEL_ORDER = ['PURPOSE', 'PERCEPTION', 'GOVERNANCE', 'EXECUTION', 'LEARNING'];

export class AutonomyChassis {

  constructor(agentId, agentDir, identity = {}) {
    this.agentId = agentId;
    this.identity = identity;
    this.state = new StateBus(agentDir, agentId);
    this.organs = new Map();
    this.lastRun = null;

    // Write identity to mission state
    if (Object.keys(identity).length > 0) {
      this.state.write('mission', { identity }, 'chassis');
    }
  }

  /**
   * Register an organ. Organs are grouped by level.
   */
  register(organ) {
    if (!this.organs.has(organ.level)) {
      this.organs.set(organ.level, []);
    }
    this.organs.get(organ.level).push(organ);
    return this;
  }

  /**
   * Run all organs in level order. Collect signals, resolve.
   * Returns: { signal, results[], blocked, reasons[] }
   */
  run() {
    const sharedState = this.state.snapshot();
    const allResults = [];
    const allSignals = [];
    let earlyExit = false;

    for (const level of LEVEL_ORDER) {
      const organs = this.organs.get(level) || [];
      if (organs.length === 0) continue;

      const levelResults = [];

      for (const organ of organs) {
        try {
          const result = organ.run(sharedState);
          levelResults.push(result);
          allResults.push(result);
          allSignals.push({
            organ: result.organ,
            signal: result.signal,
            reason: result.recommendation?.message || '',
          });

          // ABORT at any level stops everything
          if (result.signal === SIGNALS.ABORT) {
            earlyExit = true;
            break;
          }
        } catch (err) {
          allResults.push({
            organ: organ.name,
            level: organ.level,
            signal: SIGNALS.PASS,
            error: err.message,
          });
        }
      }

      if (earlyExit) break;

      // PAUSE at PURPOSE or PERCEPTION stops downstream
      const levelResolution = resolveSignals(allSignals.filter(s =>
        organs.some(o => o.name === s.organ)
      ));

      if (levelResolution.signal === SIGNALS.PAUSE && (level === 'PURPOSE' || level === 'PERCEPTION')) {
        earlyExit = true;
        break;
      }
    }

    const resolution = resolveSignals(allSignals);

    this.lastRun = {
      agentId: this.agentId,
      signal: resolution.signal,
      unanimous: resolution.unanimous,
      results: allResults,
      reasons: resolution.reasons,
      organCount: allResults.length,
      blockingCount: resolution.blockingCount,
      timestamp: new Date().toISOString(),
    };

    // Write agent health to state
    this.state.write('agent', {
      lastSignal: resolution.signal,
      organCount: allResults.length,
      blockingCount: resolution.blockingCount,
      healthy: resolution.signal === SIGNALS.CONTINUE || resolution.signal === SIGNALS.PASS,
    }, 'chassis');

    return this.lastRun;
  }

  /**
   * Check if a specific action is blocked by any organ's enforce().
   */
  enforce(action) {
    for (const [, organs] of this.organs) {
      for (const organ of organs) {
        if (typeof organ.enforce === 'function') {
          const result = organ.enforce(action, organ.lastResult);
          if (result.blocked) {
            return { blocked: true, organ: organ.name, reason: result.reason };
          }
        }
      }
    }
    return { blocked: false };
  }

  /**
   * Get explanations from all organs.
   */
  explain() {
    const explanations = {};
    for (const [level, organs] of this.organs) {
      explanations[level] = organs.map(o => o.explain());
    }
    return {
      agentId: this.agentId,
      identity: this.identity,
      levels: explanations,
      lastRun: this.lastRun?.timestamp,
      lastSignal: this.lastRun?.signal,
    };
  }

  /**
   * Get a flat summary for fleet reporting.
   */
  report() {
    if (!this.lastRun) return { agentId: this.agentId, status: 'never_run' };

    return {
      agentId: this.agentId,
      signal: this.lastRun.signal,
      healthy: this.lastRun.signal === SIGNALS.CONTINUE || this.lastRun.signal === SIGNALS.PASS,
      organCount: this.lastRun.organCount,
      blockingCount: this.lastRun.blockingCount,
      reasons: this.lastRun.reasons.map(r => `[${r.organ}] ${r.reason}`),
      timestamp: this.lastRun.timestamp,
    };
  }
}
