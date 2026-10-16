// admiralty-rating.js — Two-axis intelligence grading (NATO Admiralty Code)
// Source reliability (A-F) x Information credibility (1-6)
// These are INDEPENDENT. A reliable source can relay false info.
// An unreliable source can stumble onto truth.

// Source reliability ratings based on agent/source track record
const SOURCE_RELIABILITY = {
  // Cathedral agents — graded by verified output history
  timekeeper:    'A',  // pure measurement, no interpretation
  sentinel:      'A',  // filesystem watchdog, factual
  pm2:           'A',  // process state, measured
  smoke_test:    'A',  // health checks, factual
  spend_feed:    'B',  // transaction log, occasionally delayed
  archaeologist: 'C',  // LLM-mediated discovery, variable
  muse:          'C',  // creative connections, variable accuracy
  prospector:    'C',  // product detection, LLM-mediated
  lucy:          'B',  // diagnostic, structured methodology
  cathy:         'C',  // synthesis, sometimes drifts
  orc:           'B',  // coordination, sometimes over-aggregates
  forge:         'B',  // builds, occasionally misses edge cases
  boxing:        'C',  // domain specialist, LLM-mediated
  trading:       'D',  // paper trading, unproven predictions
  universe:      'D',  // speculative research domain
  reed:          'C',  // visual selection, taste-variable
  maya:          'C',  // social content, brand-aligned
  ling:          'C',  // tech review, LLM-mediated
  // External sources
  deepseek:      'C',  // capable but hallucinates on specifics
  chatgpt:       'C',  // same class as deepseek
  gemini:        'C',  // same class
  claude:        'B',  // generally more careful, still hallucinates
  paul:          'B',  // human, subject to bias, but primary source for domain knowledge
  vault:         'B',  // curated but may contain stale/contradicted info
  web:           'D',  // uncurated, variable
  unknown:       'F',  // cannot be judged
};

// Default info credibility by claim source_type
const DEFAULT_CREDIBILITY = {
  PRIMARY:  2,   // probably true (direct observation/measurement)
  DERIVED:  3,   // possibly true (needs confirmation)
  HYBRID:   3,   // possibly true
};

/**
 * Rate a source's reliability (A-F) based on its track record.
 * @param {string} sourceId — agent or source name
 * @returns {string} A-F rating
 */
export function rateSource(sourceId) {
  const id = (sourceId || 'unknown').toLowerCase();
  return SOURCE_RELIABILITY[id] || 'F';
}

/**
 * Rate a claim's information credibility (1-6).
 * Starts from default based on source_type, upgrades with corroborations.
 * @param {object} claim — must have source_type field
 * @param {number} corroborations — number of independent corroborations
 * @returns {number} 1-6 credibility rating
 */
export function rateCredibility(claim, corroborations = 0) {
  let rating = DEFAULT_CREDIBILITY[claim.source_type] || 3;

  // Confirmed by other sources -> upgrade to 1
  if (corroborations >= 2) rating = 1;
  else if (corroborations === 1) rating = Math.min(rating, 2);

  return rating;
}

/**
 * Format admiralty code as compact string (e.g. "B2", "C3", "A1").
 */
export function formatAdmiralty(sourceRating, credibilityRating) {
  return `${sourceRating}${credibilityRating}`;
}

/**
 * Describe an admiralty code in plain English.
 * @param {string} admiraltyCode — e.g. "B2"
 * @returns {string} human-readable description
 */
export function describeRating(admiraltyCode) {
  const source = admiraltyCode[0];
  const cred = parseInt(admiraltyCode[1]);

  const sourceDesc = {
    A: 'Completely reliable', B: 'Usually reliable', C: 'Fairly reliable',
    D: 'Not usually reliable', E: 'Unreliable', F: 'Cannot judge source'
  };
  const credDesc = {
    1: 'Confirmed', 2: 'Probably true', 3: 'Possibly true',
    4: 'Doubtful', 5: 'Improbable', 6: 'Cannot judge info'
  };

  return `${sourceDesc[source] || '?'} / ${credDesc[cred] || '?'}`;
}

/**
 * Rate a claim with full context — the primary API.
 * @param {object} claim — must have source_type field
 * @param {string} sourceId — agent or source name
 * @param {number} corroborations — number of independent corroborations
 * @returns {object} { source, credibility, admiralty, description }
 */
export function rateClaim(claim, sourceId, corroborations = 0) {
  const sourceRating = rateSource(sourceId);
  const credRating = rateCredibility(claim, corroborations);
  return {
    source: sourceRating,
    credibility: credRating,
    admiralty: formatAdmiralty(sourceRating, credRating),
    description: describeRating(formatAdmiralty(sourceRating, credRating)),
  };
}

// Exported for external consumers that want to read or override defaults
export { SOURCE_RELIABILITY, DEFAULT_CREDIBILITY };
