// Sky Sense — Celestial Events Index (Looking Glass Layer 1b)
// Historical catalog: sky configuration → what followed.
// Each entry: date, sky fingerprint, label, aftermath, frequency, pattern notes.

import { skyState } from './index.mjs';
import { norm360, DEG } from './time.mjs';

// ── Historical Events Database ──────────────────────────────────────────────
// Curated catalog of significant celestial configurations and documented aftermath.
// Sources: astronomical almanacs, historical records, vault corpus.
// Grade: A = well-documented correlation, B = notable pattern, C = single occurrence.

export const EVENTS_DB = [

  // ── Great Conjunctions (Jupiter-Saturn, ~20yr cycle) ───────────────────
  {
    date: '2020-12-21',
    label: 'Great Conjunction 2020',
    skyConfig: 'jupiter-saturn-conjunction-0.1deg',
    category: 'conjunction',
    frequency: 'every ~20 years',
    aftermath: [
      { domain: 'finance', event: 'BTC broke $20k → $64k in 4 months', lag: '0-4 months' },
      { domain: 'governance', event: 'US administration transition', lag: '0 months' },
      { domain: 'technology', event: 'mRNA deployment at global scale', lag: '0-3 months' },
      { domain: 'social', event: 'Great Resignation wave began', lag: '3-6 months' },
    ],
    pattern: 'Great Conjunctions historically correlate with regime shifts and new economic paradigms. Kepler documented this pattern. Last comparable: 2000 (dot-com peak), 1980 (Reagan/Thatcher), 1961 (JFK/space race).',
    grade: 'B',
  },
  {
    date: '2000-05-28',
    label: 'Great Conjunction 2000',
    skyConfig: 'jupiter-saturn-conjunction-1.2deg',
    category: 'conjunction',
    frequency: 'every ~20 years',
    aftermath: [
      { domain: 'finance', event: 'Dot-com crash began (NASDAQ -78%)', lag: '0-18 months' },
      { domain: 'governance', event: 'Contested US election (Bush v Gore)', lag: '6 months' },
      { domain: 'technology', event: 'Broadband internet adoption inflection', lag: '0-12 months' },
    ],
    pattern: 'Conjunction in Taurus. Financial excess correction followed.',
    grade: 'B',
  },
  {
    date: '1980-12-31',
    label: 'Great Conjunction 1980-81',
    skyConfig: 'jupiter-saturn-conjunction-triple',
    category: 'conjunction',
    frequency: 'triple conjunction rare (~60yr)',
    aftermath: [
      { domain: 'governance', event: 'Reagan inaugurated, Thatcher consolidating, Cold War escalation', lag: '0-1 months' },
      { domain: 'finance', event: 'Volcker rate shock, gold peaked $850', lag: '0-6 months' },
      { domain: 'technology', event: 'IBM PC launched, personal computing era', lag: '8 months' },
    ],
    pattern: 'Triple conjunction — Jupiter-Saturn met 3x in Libra. Regime change across multiple domains simultaneously.',
    grade: 'B',
  },

  // ── Solar Eclipses ────────────────────────────────────────────────────
  {
    date: '2024-04-08',
    label: 'Total Solar Eclipse 2024 (Americas)',
    skyConfig: 'total-solar-eclipse-aries',
    category: 'eclipse',
    frequency: 'total at same location ~375 years',
    aftermath: [
      { domain: 'finance', event: 'BTC halving 12 days later, began run to $100k+', lag: '12 days' },
      { domain: 'geopolitics', event: 'Iran-Israel direct exchange escalation', lag: '5 days' },
    ],
    pattern: 'Eclipse in Aries near BTC halving. Financial inflection point.',
    grade: 'C',
  },
  {
    date: '2017-08-21',
    label: 'Great American Eclipse 2017',
    skyConfig: 'total-solar-eclipse-leo',
    category: 'eclipse',
    frequency: 'coast-to-coast US eclipse ~99 years',
    aftermath: [
      { domain: 'finance', event: 'BTC $4k → $20k in 4 months (5x)', lag: '0-4 months' },
      { domain: 'governance', event: 'Hurricane Harvey (costliest at the time)', lag: '4 days' },
      { domain: 'social', event: '#MeToo movement went viral', lag: '2 months' },
    ],
    pattern: 'Eclipse in Leo. Preceded explosive crypto bull run and major social movement.',
    grade: 'C',
  },
  {
    date: '1999-08-11',
    label: 'Total Solar Eclipse 1999 (Europe)',
    skyConfig: 'total-solar-eclipse-leo-grand-cross',
    category: 'eclipse',
    frequency: 'with grand cross — centuries',
    aftermath: [
      { domain: 'finance', event: 'NASDAQ final blow-off top (+85% in 7 months)', lag: '0-7 months' },
      { domain: 'governance', event: 'Putin rose to power in Russia', lag: '0-4 months' },
      { domain: 'technology', event: 'Y2K preparation peak, internet IPO mania', lag: '0-5 months' },
    ],
    pattern: 'Nostradamus quatrain referenced this eclipse. Grand Fixed Cross alignment. Preceded major power transitions.',
    grade: 'C',
  },

  // ── Mercury Retrogrades ───────────────────────────────────────────────
  {
    date: '2020-02-17',
    label: 'Mercury Retrograde Feb-Mar 2020',
    skyConfig: 'mercury-retrograde-pisces-aquarius',
    category: 'retrograde',
    frequency: '3x per year',
    aftermath: [
      { domain: 'finance', event: 'S&P 500 peaked Feb 19, crashed 34% in 23 days', lag: '2 days' },
      { domain: 'health', event: 'COVID-19 declared pandemic March 11', lag: '23 days' },
      { domain: 'governance', event: 'Global lockdowns began', lag: '30 days' },
    ],
    pattern: 'Mercury retro in Pisces → Aquarius. Communication disruption. Markets topped within 48 hours of station.',
    grade: 'C',
  },

  // ── Full Moons ────────────────────────────────────────────────────────
  {
    date: '2022-11-08',
    label: 'Blood Moon Lunar Eclipse + Uranus conjunction',
    skyConfig: 'total-lunar-eclipse-taurus-uranus',
    category: 'eclipse',
    frequency: 'lunar eclipse + Uranus: very rare',
    aftermath: [
      { domain: 'finance', event: 'FTX collapsed within 48 hours', lag: '1-2 days' },
      { domain: 'governance', event: 'US midterm elections same day', lag: '0 days' },
    ],
    pattern: 'Blood Moon + Uranus (disruption planet) in Taurus (finance sign). FTX was the largest crypto fraud collapse.',
    grade: 'C',
  },

  // ── Planetary Oppositions ─────────────────────────────────────────────
  {
    date: '2003-08-27',
    label: 'Mars closest approach in 60,000 years',
    skyConfig: 'mars-opposition-record-close',
    category: 'opposition',
    frequency: '~60,000 years for this close',
    aftermath: [
      { domain: 'geopolitics', event: 'Iraq War ongoing, resistance intensifying', lag: 'concurrent' },
      { domain: 'environment', event: 'European heat wave killed 70,000+', lag: 'concurrent' },
      { domain: 'finance', event: 'Housing bubble beginning (Fed rate 1%)', lag: 'concurrent' },
    ],
    pattern: 'Mars at closest = maximum energy in Martian themes (conflict, heat, aggression). Three simultaneous expressions.',
    grade: 'C',
  },

  // ── Equinoxes and Solstices with notable conjunctions ─────────────────
  {
    date: '2012-12-21',
    label: 'Winter Solstice 2012 — Mayan Long Count End',
    skyConfig: 'solstice-galactic-alignment',
    category: 'solstice',
    frequency: '~26,000 year precessional cycle',
    aftermath: [
      { domain: 'social', event: 'Social media inflection (Instagram acquisition, Snapchat launch)', lag: '0-6 months' },
      { domain: 'technology', event: 'Deep learning breakthrough (AlexNet, Nov 2012)', lag: '-1 month' },
      { domain: 'finance', event: 'BTC discovered by mainstream ($13 → $1000 in 12 months)', lag: '0-12 months' },
    ],
    pattern: 'Precessional alignment. Whether astronomical or cultural trigger, multiple paradigm shifts clustered here.',
    grade: 'C',
  },

  // ── Venus Transits ────────────────────────────────────────────────────
  {
    date: '2012-06-05',
    label: 'Venus Transit 2012 (last until 2117)',
    skyConfig: 'venus-transit-sun',
    category: 'transit',
    frequency: 'pairs ~120 years apart',
    aftermath: [
      { domain: 'technology', event: 'Facebook IPO (May 2012), mobile internet inflection', lag: '-1 month' },
      { domain: 'finance', event: 'European debt crisis peaked, Draghi "whatever it takes"', lag: '2 months' },
    ],
    pattern: 'Venus transits historically correlate with communication/connection paradigm shifts. 1631: scientific revolution. 1769: Cook expeditions. 1874: telephone era. 2004: social media birth. 2012: mobile-first.',
    grade: 'B',
  },
  {
    date: '2004-06-08',
    label: 'Venus Transit 2004',
    skyConfig: 'venus-transit-sun',
    category: 'transit',
    frequency: 'pairs ~120 years apart',
    aftermath: [
      { domain: 'technology', event: 'Facebook launched (Feb), Gmail launched (Apr), Flickr launched', lag: '-4 to 0 months' },
      { domain: 'social', event: 'Social media era began — connection paradigm shift', lag: '0-6 months' },
    ],
    pattern: 'Venus (connection/beauty) crossing Sun (visibility). Social platforms launched within months.',
    grade: 'B',
  },

  // ── Saturn Returns (macro cycles) ────────────────────────────────────
  {
    date: '2020-03-21',
    label: 'Saturn enters Aquarius (2020)',
    skyConfig: 'saturn-ingress-aquarius',
    category: 'ingress',
    frequency: '~29.5 year cycle',
    aftermath: [
      { domain: 'governance', event: 'Global lockdowns, state authority expansion', lag: '0 days' },
      { domain: 'technology', event: 'Remote work revolution, Zoom from 10M to 300M daily users', lag: '0-3 months' },
      { domain: 'social', event: 'Social distancing normalized, community structures tested', lag: '0-6 months' },
    ],
    pattern: 'Saturn (structure/restriction) in Aquarius (society/technology). Last time: 1991 (USSR dissolved, WWW born). Before: 1962 (Cuban Missile Crisis, Vatican II).',
    grade: 'B',
  },

  // ── Pluto transitions (generational) ──────────────────────────────────
  {
    date: '2024-01-20',
    label: 'Pluto enters Aquarius (2024)',
    skyConfig: 'pluto-ingress-aquarius',
    category: 'ingress',
    frequency: '~248 year cycle',
    aftermath: [
      { domain: 'technology', event: 'AI explosion (GPT-4, Claude, Gemini — all within months)', lag: '-12 to +6 months' },
      { domain: 'governance', event: 'Power structure disruptions globally', lag: 'ongoing' },
    ],
    pattern: 'Last Pluto in Aquarius: 1778-1798 (American + French Revolution, Industrial Revolution). Power structures transformed by technology. AI is this era\'s printing press.',
    grade: 'B',
  },

  // ── Supermoons ────────────────────────────────────────────────────────
  {
    date: '2011-03-19',
    label: 'Supermoon 2011 (closest since 1993)',
    skyConfig: 'supermoon-perigee-record',
    category: 'lunation',
    frequency: '~18 year extreme perigee cycle',
    aftermath: [
      { domain: 'environment', event: 'Tōhoku earthquake + tsunami (M9.1) — 8 days prior', lag: '-8 days' },
      { domain: 'governance', event: 'Arab Spring accelerating (Libya intervention March 19)', lag: '0 days' },
    ],
    pattern: 'Extreme perigee full moons correlate with increased seismic activity (tidal stress). Debated in mainstream, but M9.1 within 8 days is notable.',
    grade: 'C',
  },

  // ── Comet appearances ────────────────────────────────────────────────
  {
    date: '1997-03-22',
    label: 'Comet Hale-Bopp perihelion',
    skyConfig: 'comet-hale-bopp-perihelion',
    category: 'comet',
    frequency: '~2,500 year orbit',
    aftermath: [
      { domain: 'finance', event: 'Asian Financial Crisis began July 1997', lag: '4 months' },
      { domain: 'technology', event: 'Amazon IPO (May 1997), dot-com era launch', lag: '2 months' },
      { domain: 'governance', event: 'Hong Kong handover July 1 1997', lag: '3 months' },
    ],
    pattern: 'Great comets historically seen as harbingers. Hale-Bopp visible for 18 months — longest naked-eye comet in recorded history.',
    grade: 'C',
  },

  // ── Node crossings ───────────────────────────────────────────────────
  {
    date: '2022-01-18',
    label: 'North Node enters Taurus (2022)',
    skyConfig: 'north-node-ingress-taurus',
    category: 'node',
    frequency: '~18.6 year cycle',
    aftermath: [
      { domain: 'finance', event: 'Crypto winter (BTC $47k → $16k), Terra/Luna collapse', lag: '0-5 months' },
      { domain: 'finance', event: 'Global inflation peaked, rate hike cycle began', lag: '0-3 months' },
      { domain: 'geopolitics', event: 'Russia-Ukraine war began Feb 24', lag: '37 days' },
    ],
    pattern: 'North Node in Taurus = values/resources reckoned with. South Node in Scorpio = hidden debts exposed. Financial reckoning + resource conflict.',
    grade: 'C',
  },
];

// ── Sky Fingerprinting ──────────────────────────────────────────────────────
// Generate a compact fingerprint of sky state for pattern matching.

export function skyFingerprint(date) {
  const state = skyState(date instanceof Date ? date : new Date(date));
  const DEG_R = 180 / Math.PI;

  // Sun ecliptic longitude (zodiac sign)
  const sunLon = state.bodies.sun.eclipticLon || 0;
  const sunSign = Math.floor(((sunLon % 360 + 360) % 360) / 30);

  // Moon phase bucket (0-7: new, wax-cres, 1Q, wax-gib, full, wan-gib, 3Q, wan-cres)
  const moonBucket = Math.floor(state.events.moonPhase.phase * 8) % 8;

  // Retrogrades
  const retro = state.events.currentRetrogrades;

  // Planet positions (zodiac signs)
  const signs = {};
  for (const [name, body] of Object.entries(state.bodies)) {
    if (name === 'sun' || name === 'moon') continue;
    const ra = body.ra * DEG_R;
    signs[name] = Math.floor(((ra % 360 + 360) % 360) / 30);
  }

  return {
    sunSign,
    moonBucket,
    retrogrades: retro,
    planetSigns: signs,
    // Compact string for fast comparison
    key: `S${sunSign}M${moonBucket}R${retro.join('')}` +
         Object.entries(signs).map(([n, s]) => n[0].toUpperCase() + s).join(''),
  };
}

// ── Pattern Matching ────────────────────────────────────────────────────────
// Given a sky state, find historical events with similar configurations.

export function findSimilarConfigs(date, options = {}) {
  const { maxResults = 5, minScore = 0.3 } = options;
  const current = skyFingerprint(date);
  const results = [];

  for (const event of EVENTS_DB) {
    const eventFP = skyFingerprint(event.date);
    let score = 0;
    let matches = [];

    // Sun sign match (same zodiac sign = +0.3)
    if (current.sunSign === eventFP.sunSign) {
      score += 0.3;
      matches.push('same sun sign');
    }

    // Moon phase match (same bucket = +0.2)
    if (current.moonBucket === eventFP.moonBucket) {
      score += 0.2;
      matches.push('same moon phase');
    }

    // Retrograde overlap (+0.1 per matching retrograde)
    const retroOverlap = current.retrogrades.filter(r => eventFP.retrogrades.includes(r));
    if (retroOverlap.length) {
      score += retroOverlap.length * 0.1;
      matches.push(`shared retrogrades: ${retroOverlap.join(', ')}`);
    }

    // Planet sign matches (+0.05 per planet in same sign)
    let planetMatches = 0;
    for (const [name, sign] of Object.entries(current.planetSigns)) {
      if (eventFP.planetSigns[name] === sign) {
        planetMatches++;
      }
    }
    if (planetMatches) {
      score += planetMatches * 0.05;
      matches.push(`${planetMatches} planets in same signs`);
    }

    // Category bonus: conjunctions and eclipses more significant
    if (event.category === 'conjunction' || event.category === 'eclipse') {
      score *= 1.1;
    }

    if (score >= minScore) {
      results.push({ event, score, matches, currentFP: current, eventFP });
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

// ── Upcoming Event Scan ─────────────────────────────────────────────────────
// Check which historical patterns are approaching in the next N days.

export function scanForPatternEchoes(date, windowDays = 90) {
  const echoes = [];
  const step = 7 * 86400000; // weekly scan

  for (let d = 0; d < windowDays; d += 7) {
    const scanDate = new Date(date.getTime() + d * 86400000);
    const similar = findSimilarConfigs(scanDate, { minScore: 0.4, maxResults: 2 });

    for (const match of similar) {
      echoes.push({
        date: scanDate,
        daysFromNow: d,
        ...match,
      });
    }
  }

  // Deduplicate by event (keep highest score)
  const seen = new Map();
  for (const echo of echoes) {
    const key = echo.event.date;
    if (!seen.has(key) || seen.get(key).score < echo.score) {
      seen.set(key, echo);
    }
  }

  return Array.from(seen.values()).sort((a, b) => b.score - a.score);
}

// ── Category Summary ────────────────────────────────────────────────────────

export function getEventsByCategory(category) {
  return EVENTS_DB.filter(e => e.category === category);
}

export function getAllCategories() {
  return [...new Set(EVENTS_DB.map(e => e.category))];
}

export function getEventByDate(dateStr) {
  return EVENTS_DB.find(e => e.date === dateStr);
}

// ── Stats ───────────────────────────────────────────────────────────────────

export function indexStats() {
  const categories = {};
  const grades = {};
  const domains = new Set();

  for (const event of EVENTS_DB) {
    categories[event.category] = (categories[event.category] || 0) + 1;
    grades[event.grade] = (grades[event.grade] || 0) + 1;
    for (const a of event.aftermath) domains.add(a.domain);
  }

  return {
    totalEvents: EVENTS_DB.length,
    categories,
    grades,
    domains: [...domains],
    dateRange: {
      earliest: EVENTS_DB.map(e => e.date).sort()[0],
      latest: EVENTS_DB.map(e => e.date).sort().reverse()[0],
    },
  };
}
