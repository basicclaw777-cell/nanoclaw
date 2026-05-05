// moon-phase.js — Pure math moon phase calculator
// No external APIs. Synodic period from known new moon epoch.

const SYNODIC_PERIOD = 29.53058770576;  // days
const KNOWN_NEW_MOON = new Date('2024-01-11T11:57:00Z');  // verified reference epoch

const PHASE_NAMES = [
  'New Moon',
  'Waxing Crescent',
  'First Quarter',
  'Waxing Gibbous',
  'Full Moon',
  'Waning Gibbous',
  'Last Quarter',
  'Waning Crescent'
];

const PHASE_SYMBOLS = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];

function getMoonPhase(date = new Date()) {
  const diffMs = date.getTime() - KNOWN_NEW_MOON.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  const cyclePosition = ((diffDays % SYNODIC_PERIOD) + SYNODIC_PERIOD) % SYNODIC_PERIOD;
  const illumination = (1 - Math.cos(2 * Math.PI * cyclePosition / SYNODIC_PERIOD)) / 2;
  // Offset by half a phase width so names center on the actual moment
  const phaseIndex = Math.floor((cyclePosition + SYNODIC_PERIOD / 16) / (SYNODIC_PERIOD / 8)) % 8;

  // Days until next new moon and full moon
  const daysInCycle = cyclePosition;
  const daysToNew = SYNODIC_PERIOD - daysInCycle;
  const daysToFull = ((SYNODIC_PERIOD / 2) - daysInCycle + SYNODIC_PERIOD) % SYNODIC_PERIOD;

  // Next new moon and full moon dates
  const nextNew = new Date(date.getTime() + daysToNew * 24 * 60 * 60 * 1000);
  const nextFull = new Date(date.getTime() + daysToFull * 24 * 60 * 60 * 1000);

  return {
    name: PHASE_NAMES[phaseIndex],
    symbol: PHASE_SYMBOLS[phaseIndex],
    illumination: Math.round(illumination * 1000) / 10,  // percentage, 1 decimal
    cycleDay: Math.round(cyclePosition * 10) / 10,
    daysToNew: Math.round(daysToNew * 10) / 10,
    daysToFull: Math.round(daysToFull * 10) / 10,
    nextNew,
    nextFull,
    waxing: cyclePosition < SYNODIC_PERIOD / 2
  };
}

function formatMoonReport(date = new Date()) {
  const m = getMoonPhase(date);

  const dateStr = date.toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Hong_Kong'
  });

  const newStr = m.nextNew.toLocaleDateString('en-GB', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Hong_Kong'
  });
  const fullStr = m.nextFull.toLocaleDateString('en-GB', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Hong_Kong'
  });

  const bar = buildIlluminationBar(m.illumination);
  const direction = m.waxing ? 'waxing' : 'waning';

  return [
    `${m.symbol}  ${m.name}`,
    `${dateStr}`,
    ``,
    `${bar}  ${m.illumination}% illuminated (${direction})`,
    `Cycle day ${m.cycleDay} of ${SYNODIC_PERIOD.toFixed(1)}`,
    ``,
    `Next full:  ${fullStr} (${m.daysToFull}d)`,
    `Next new:   ${newStr} (${m.daysToNew}d)`,
  ].join('\n');
}

function buildIlluminationBar(pct) {
  const filled = Math.round(pct / 5);  // 20 slots
  const empty = 20 - filled;
  return '▓'.repeat(filled) + '░'.repeat(empty);
}

export { getMoonPhase, formatMoonReport };
