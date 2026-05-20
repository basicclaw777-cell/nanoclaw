/**
 * Swarm Learning Loop — Linda Tuples + Bandit Brain Composition
 *
 * Wires the feedback loop:
 *   Agent A posts ["discovery", domain, confidence] → bandit chose domain
 *   Agent B reads, acts, posts ["outcome", domain, success] → bandit updates
 *
 * Each agent calls joinLoop(agentId, domains) to:
 *   1. Use bandit to choose next domain
 *   2. Watch for outcome tuples that feed back into its bandit
 *   3. Post discoveries that other agents can act on
 *
 * Usage:
 *   import { joinLoop } from './swarm-loop.js';
 *   const loop = joinLoop('archaeologist', ['sports_science', 'frame_collapse', ...]);
 *   const pick = loop.choose();  // bandit-selected domain
 *   loop.reportDiscovery(pick.action, 0.9);  // post to tuple space
 *   loop.reportOutcome('sports_science', true);  // after acting on someone's discovery
 */

import { out, watch, scan } from './linda-vault.js';
import { chooseAction, recordOutcome, getState } from './bandit-brain.js';

const NAMESPACE = 'swarm';

/**
 * Join the swarm learning loop
 * @param {string} agentId - this agent's identifier
 * @param {string[]} domains - possible action domains
 * @returns {Object} loop interface
 */
export function joinLoop(agentId, domains) {
  // Watch for outcome tuples targeting this agent's domains
  const unwatchers = [];

  for (const domain of domains) {
    const unwatch = watch(
      ['outcome', domain, null],
      NAMESPACE,
      (entry) => {
        const [, action, success] = entry.tuple;
        const result = recordOutcome(agentId, action, !!success, entry.agentId, entry.timestamp);
        if (result.applied) {
          console.log(`[swarm] ${agentId} bandit updated: ${action} = ${success ? 'win' : 'loss'} (${result.reason})`);
        } else {
          console.log(`[swarm] ${agentId} outcome parked: ${action} (${result.reason})`);
        }
      }
    );
    unwatchers.push(unwatch);
  }

  return {
    /**
     * Choose next action via bandit
     */
    choose() {
      return chooseAction(agentId, domains);
    },

    /**
     * Post a discovery tuple for other agents to act on
     */
    reportDiscovery(domain, confidence = 0.5) {
      return out(['discovery', domain, confidence], NAMESPACE, agentId);
    },

    /**
     * Report outcome after acting on a discovery
     */
    reportOutcome(domain, success) {
      return out(['outcome', domain, success ? 1 : 0], NAMESPACE, agentId);
    },

    /**
     * Get current bandit state
     */
    state() {
      return getState(agentId);
    },

    /**
     * Read all recent discoveries
     */
    discoveries() {
      return scan(['discovery', null, null], NAMESPACE);
    },

    /**
     * Disconnect from loop
     */
    leave() {
      unwatchers.forEach(fn => fn());
    }
  };
}

export default { joinLoop };
