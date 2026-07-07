/**
 * escalation.js — The five signals every organ can return.
 *
 * Not yes/no. Five levels of response that keep humans in the loop
 * without making humans the bottleneck.
 *
 * ESM.
 */

export const SIGNALS = Object.freeze({
  PASS:     'PASS',      // No opinion — organ abstains
  CONTINUE: 'CONTINUE',  // Action acceptable — green light
  PAUSE:    'PAUSE',      // Wait — temporary hold, auto-resumes when condition clears
  ESCALATE: 'ESCALATE',  // Agent cannot decide — human needed
  ABORT:    'ABORT',      // Hard stop — requires Mission Commander or human override
});

export const SIGNAL_PRIORITY = Object.freeze({
  PASS:     0,
  CONTINUE: 1,
  PAUSE:    2,
  ESCALATE: 3,
  ABORT:    4,
});

/**
 * Resolve multiple organ signals into one decision.
 * Highest severity wins. One ABORT overrides everything.
 */
export function resolveSignals(signals) {
  let highest = SIGNALS.PASS;
  let highestPriority = 0;
  const reasons = [];

  for (const { organ, signal, reason } of signals) {
    const priority = SIGNAL_PRIORITY[signal] || 0;
    if (priority > highestPriority) {
      highest = signal;
      highestPriority = priority;
    }
    if (signal !== SIGNALS.PASS && signal !== SIGNALS.CONTINUE) {
      reasons.push({ organ, signal, reason });
    }
  }

  return {
    signal: highest,
    unanimous: signals.every(s => s.signal === highest),
    reasons,
    organCount: signals.length,
    blockingCount: reasons.length,
  };
}
