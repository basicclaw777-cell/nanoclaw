// Sky Sense — Ptolemy pipeline (Almagest deferent + epicycle)
// Full historical geocentric model, c. 150 CE.
// Extracted from Alan Space Audits ephemerisPtolemy.js,
// originally ported from R.H. van Gent's Almagest Ephemeris Calculator.

import { DEG } from './time.mjs';

// Ptolemy's epoch: 1 Thoth, Nabonassar year 1 (747 BCE)
const JD_EPOCH = 1448637 + (22 - (17 + 34 / 60) / 60) / 24;

function julianDay(date) { return date.getTime() / 86400000 + 2440587.5; }
function ptolemyDay(date) { return julianDay(date) - JD_EPOCH; }

// Sexagesimal → decimal (preserves Almagest notation)
function sex(...parts) {
  let value = 0, factor = 1;
  for (const p of parts) { value += p * factor; factor /= 60; }
  return value;
}

const sind   = x => Math.sin(x * DEG);
const cosd   = x => Math.cos(x * DEG);
const asind  = x => Math.asin(x) / DEG;
const atand  = x => Math.atan(x) / DEG;
const atand2 = (y, x) => Math.atan2(y, x) / DEG;
const degmod = x => ((x % 360) + 360) % 360;
const sgn    = x => x < 0 ? -1 : x > 0 ? 1 : 0;

// Ptolemaic constants (exact sexagesimal from Almagest tables)
const nsunlong    = sex(0,59,8,17,13,12,31);
const mlongsun0   = sex(330,45,0);
const apogeesun   = sex(65,30,0);
const eccsun      = sex(0,2,30);
const obliquity   = sex(23,51,20);

const nlongmoon   = sex(13,10,34,58,33,30,30);
const nanommoon   = sex(13,3,53,56,17,51,59);
const nlatargmoon = sex(13,13,45,39,48,56,37);
const nelongmoon  = sex(12,11,26,41,20,17,59);
const mlongmoon0  = sex(41,22,0);
const manommoon0  = sex(268,49,0);
const latargmoon0 = sex(354,15,0);
const melongmoon0 = sex(70,37,0);
const epimoon     = sex(0,6,20);
const eccmoon     = sex(0,12,29);
const incmoon     = sex(5,0,0);

// Planet constants
const PLANETS = {
  saturn: {
    nlong: sex(0,2,0,33,31,28,51), nepianom: sex(0,57,7,43,41,43,40),
    apogee0: sex(224,10,0), epi: sex(0,6,30), ecc: sex(0,3,25),
    inc0: sex(2,30,0), inc1: sex(4,30,0), node: sex(50,0,0),
    mepi_epoch: 296+43/60, mepianom_epoch: 34+2/60,
  },
  jupiter: {
    nlong: sex(0,4,59,14,26,46,31), nepianom: sex(0,54,9,2,46,26,0),
    apogee0: sex(152,9,0), epi: sex(0,11,30), ecc: sex(0,2,45),
    inc0: sex(1,30,0), inc1: sex(2,30,0), node: sex(340,0,0),
    mepi_epoch: 184+41/60, mepianom_epoch: 146+4/60,
  },
  mars: {
    nlong: sex(0,31,26,36,53,51,33), nepianom: sex(0,27,41,40,19,20,58),
    apogee0: sex(106,40,0), epi: sex(0,39,30), ecc: sex(0,6,0),
    inc0: sex(1,0,0), inc1: sex(2,15,0), node: 0,
    mepi_epoch: 3+32/60, mepianom_epoch: 327+13/60,
  },
};

const VENUS = {
  nepianom: sex(0,36,59,25,53,11,28), apogee0: sex(46,10,0),
  epi: sex(0,43,10), ecc: sex(0,1,15),
  inc0: sex(0,10,0), inc1_raw: sex(2,30,0), inc2: sex(3,30,0),
  mepianom_epoch: 71+7/60,
};

const MERCURY = {
  nepianom: sex(3,6,24,6,59,35,50), apogee0: sex(181,10,0),
  epi: sex(0,22,30), ecc: sex(0,3,0),
  inc0_raw: sex(0,45,0), inc1: sex(6,15,0), inc2_raw: sex(7,0,0),
  mepianom_epoch: 21+55/60,
};

// Core deferent+epicycle math
function eqplan(n, ecc, epi, meccanom, mepianom) {
  const esin = ecc * sind(meccanom);
  const ecos = ecc * cosd(meccanom);
  const a    = ecos + Math.sqrt(1 - esin * esin);
  const pros = -atand(2 * esin / a);
  const b    = Math.sqrt(a * a + 4 * esin * esin);
  const fsin = epi * sind(mepianom - pros);
  const fcos = epi * cosd(mepianom - pros);
  const eq   = atand(fsin / (b + fcos));
  if (n === 1) return pros;
  if (n === 2) return eq;
  const eps  = asind(esin);
  const px   = epi * cosd(mepianom) + ecc * cosd(meccanom) + cosd(eps);
  const py   = epi * sind(mepianom) - 2 * ecc * sind(meccanom);
  return Math.sqrt(px * px + py * py);
}

// Mercury's special crank mechanism
function eqme(n, ecc, epi, meccanom, mepianom) {
  const ecos    = ecc * cosd(meccanom);
  const esin    = ecc * sind(meccanom);
  const ecoscos = 2 * ecc * cosd(meccanom / 2) * cosd(3 * meccanom / 2);
  const ecossin = 2 * ecc * cosd(meccanom / 2) * sind(3 * meccanom / 2);
  const a       = ecos + ecoscos + Math.sqrt(1 - ecossin * ecossin);
  const pros    = -atand(esin / a);
  const b       = Math.sqrt(a * a + esin * esin);
  const fcos    = epi * cosd(mepianom - pros);
  const fsin    = epi * sind(mepianom - pros);
  const eq      = atand(fsin / (b + fcos));
  if (n === 1) return pros;
  if (n === 2) return eq;
  const gcos = ecc * (cosd(meccanom) + cosd(2 * meccanom));
  const gsin = ecc * (sind(meccanom) + sind(2 * meccanom));
  const pp   = Math.sqrt(1 - gsin * gsin) + gcos;
  const qq   = Math.sqrt(pp * pp + ecc * ecc + 2 * ecc * pp * cosd(meccanom));
  const px   = qq + fcos;
  const py   = fsin;
  return Math.sqrt(px * px + py * py);
}

function latout(epi, ecc, inc0, inc1, node, latarg, tepianom) {
  const rho1      = epi * cosd(tepianom);
  const rho2      = epi * sind(tepianom);
  const rhoLatMax = 1 + ecc * cosd(node);
  const rhoLatMin = 1 - ecc * cosd(node);
  const rho3      = Math.sqrt((rhoLatMax + rho1) ** 2 + rho2 * rho2);
  const rho4      = Math.sqrt((rhoLatMin + rho1) ** 2 + rho2 * rho2);
  const latMax    = (inc0 * (rho1 + rhoLatMax) - inc1 * rho1) / rho3;
  const latMin    = (inc0 * (rho1 + rhoLatMin) - inc1 * rho1) / rho4;
  const carg      = cosd(latarg);
  return carg * ((latMax + latMin) + sgn(carg) * (latMax - latMin)) / 2;
}

function eclipticToEquatorial(tlong, lat) {
  const x = cosd(lat) * cosd(tlong);
  const y = cosd(lat) * sind(tlong) * cosd(obliquity) - sind(lat) * sind(obliquity);
  const z = cosd(lat) * sind(tlong) * sind(obliquity) + sind(lat) * cosd(obliquity);
  const raDeg  = degmod(atand2(y, x));
  const decDeg = atand(z / Math.sqrt(x * x + y * y));
  return { ra: raDeg * DEG, dec: decDeg * DEG };
}

function sunLongitude(ddays) {
  const mlongsu = degmod(mlongsun0 + ddays * nsunlong);
  const manomsu = degmod(mlongsu - apogeesun);
  const eqsu    = atand(eccsun * sind(manomsu) / (1 + eccsun * cosd(manomsu)));
  const tlongsu = degmod(mlongsu - eqsu);
  return { mlongsu, tlongsu };
}

function outerPlanet(ddays, params) {
  const { apogee0, nlong, nepianom, mepi_epoch, mepianom_epoch, ecc, epi, inc0, inc1, node } = params;
  const prectab = ddays / 36525;
  const apogee    = degmod(apogee0 + prectab);
  const mepi      = degmod(mepi_epoch + ddays * nlong);
  const mepianom  = degmod(mepianom_epoch + ddays * nepianom);
  const meccanom  = degmod(mepi - apogee);
  const pros      = eqplan(1, ecc, epi, meccanom, mepianom);
  const teccanom  = degmod(meccanom + pros);
  const tepianom  = degmod(mepianom - pros);
  const eqa       = eqplan(2, ecc, epi, meccanom, mepianom);
  const tlong     = degmod(mepi + pros + eqa);
  const latarg    = degmod(teccanom + node);
  const lat       = latout(epi, ecc, inc0, inc1, node, latarg, tepianom);
  return eclipticToEquatorial(tlong, lat);
}

function venusPosition(ddays) {
  const { mlongsu } = sunLongitude(ddays);
  const prectab = ddays / 36525;
  const apogeeve = degmod(VENUS.apogee0 + prectab);
  const mepive = mlongsu;
  const mepianomve = degmod(VENUS.mepianom_epoch + ddays * VENUS.nepianom);
  const meccanomve = degmod(mepive - apogeeve);
  const prosve = eqplan(1, VENUS.ecc, VENUS.epi, meccanomve, mepianomve);
  const teccanomve = degmod(meccanomve + prosve);
  const tepianomve = degmod(mepianomve - prosve);
  const eqave = eqplan(2, VENUS.ecc, VENUS.epi, meccanomve, mepianomve);
  const tlongve = degmod(mepive + prosve + eqave);
  const incve1 = -VENUS.inc1_raw;
  const etave = Math.abs(tepianomve - 180);
  const pprime = Math.abs(VENUS.epi * cosd(etave) * sind(incve1));
  const xprime = 0.999782 - VENUS.epi * cosd(etave) * cosd(incve1);
  const yprime = VENUS.epi * sind(etave);
  const oprime = Math.sqrt(xprime * xprime + yprime * yprime);
  const c3ve = atand2(pprime, oprime);
  const c6ve = Math.abs(atand2(VENUS.epi * sind(tepianomve), 1 + VENUS.epi * cosd(tepianomve)));
  const c4ve = 3.25 * c6ve / 60;
  const xkappa0p = degmod(teccanomve + 90);
  const latve1 = -sgn(cosd(tepianomve)) * c3ve * cosd(xkappa0p);
  const latve2 = sgn(sind(tepianomve)) * c4ve * cosd(teccanomve);
  const latve3 = VENUS.inc0 * cosd(teccanomve) * cosd(teccanomve);
  return eclipticToEquatorial(tlongve, latve1 + latve2 + latve3);
}

function mercuryPosition(ddays) {
  const { mlongsu } = sunLongitude(ddays);
  const prectab = ddays / 36525;
  const apogeeme = degmod(MERCURY.apogee0 + prectab);
  const mepime = mlongsu;
  const mepianomme = degmod(MERCURY.mepianom_epoch + ddays * MERCURY.nepianom);
  const meccanomme = degmod(mepime - apogeeme);
  const prosme = eqme(1, MERCURY.ecc, MERCURY.epi, meccanomme, mepianomme);
  const teccanomme = degmod(meccanomme + prosme);
  const tepianomme = degmod(mepianomme - prosme);
  const eqame = eqme(2, MERCURY.ecc, MERCURY.epi, meccanomme, mepianomme);
  const tlongme = degmod(mepime + prosme + eqame);
  const incme0 = -MERCURY.inc0_raw;
  const incme1 = MERCURY.inc1;
  const etame = Math.abs(tepianomme - 180);
  const pprime = Math.abs(MERCURY.epi * cosd(etame) * sind(incme1));
  const xprime = 0.94444 - MERCURY.epi * cosd(etame) * cosd(incme1);
  const yprime = MERCURY.epi * sind(etame);
  const oprime = Math.sqrt(xprime * xprime + yprime * yprime);
  const c3me = atand2(pprime, oprime);
  const c6me = Math.abs(atand2(MERCURY.epi * sind(tepianomme), 1 + MERCURY.epi * cosd(tepianomme)));
  const c4me = 6.8 * c6me / 60;
  const xkappa0p = degmod(teccanomme + 270);
  const latme1 = -sgn(cosd(tepianomme)) * c3me * cosd(xkappa0p);
  const xkappa0pp = degmod(teccanomme + 180);
  const latme2 = (cosd(teccanomme) > 0 ? 0.9 : 1.1) * sgn(sind(tepianomme)) * c4me * cosd(xkappa0pp);
  const latme3 = incme0 * cosd(teccanomme) * cosd(teccanomme);
  return eclipticToEquatorial(tlongme, latme1 + latme2 + latme3);
}

// Public API
export function ptolemyPosition(name, date) {
  const ddays = ptolemyDay(date);
  if (name === 'sun') {
    const { tlongsu } = sunLongitude(ddays);
    return eclipticToEquatorial(tlongsu, 0);
  }
  if (name === 'moon') {
    const mlongmo   = degmod(mlongmoon0  + ddays * nlongmoon);
    const anommo    = degmod(manommoon0  + ddays * nanommoon);
    const latargmo0 = degmod(latargmoon0 + ddays * nlatargmoon);
    const melongmo  = degmod(melongmoon0 + ddays * nelongmoon);
    const esin = eccmoon * sind(2 * melongmo);
    const ecos = eccmoon * cosd(2 * melongmo);
    const oc = ecos + Math.sqrt(1 - esin * esin);
    const prosmo = atand(esin / (oc + ecos));
    const tanommo = degmod(anommo + prosmo);
    const fsin = epimoon * sind(tanommo);
    const fcos = epimoon * cosd(tanommo);
    const eqmo = atand(fsin / (oc + fcos));
    const tlongmo = degmod(mlongmo - eqmo);
    const latarg = degmod(latargmo0 - eqmo);
    const latmo = incmoon * cosd(latarg);
    return eclipticToEquatorial(tlongmo, latmo);
  }
  if (PLANETS[name]) return outerPlanet(ddays, PLANETS[name]);
  if (name === 'venus') return venusPosition(ddays);
  if (name === 'mercury') return mercuryPosition(ddays);
  return { ra: NaN, dec: NaN };
}

export const SUPPORTED_BODIES = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'];
