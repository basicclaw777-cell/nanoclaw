/**
 * authority-engine.js — Primary Source Citation Manager
 *
 * Maps every curriculum claim to its source citation.
 * Reads from vault Balmaseda + Sagarra extractions.
 * The backbone of "only course built on verified primary sources."
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME || '/Users/basicclaw777';
const VAULT = path.join(HOME, 'cathedral-vault');
const REPORTS_DIR = path.join(__dirname, 'reports');

// ── Primary Sources ──────────────────────────────────────────────────────────

const PRIMARY_SOURCES = {
  balmaseda: {
    id: 'balmaseda-2009',
    author: 'Maykel Balmaseda Alburquerque',
    title: 'Escuela Cubana de Boxeo — Enseñanza y Preparación Técnica',
    year: 2009,
    publisher: 'Wanceulen Editorial',
    pages: 182,
    vaultFile: '02_Refined_Gold/boxing/2026-05-02_boxing_balmaseda-complete-extraction-cuban-methodology.md',
    grade: 'A',
  },
  sagarra: {
    id: 'sagarra-2007',
    author: 'Dr.C. Alcides Sagarra Carón & Ms.C. Jesús Domínguez García',
    title: 'Official Cuban Boxing Development Program',
    year: 2007,
    publisher: 'Comisión Nacional de Boxeo',
    pages: 42,
    vaultFile: '02_Refined_Gold/boxing/2026-05-03_boxing_sagarra-official-program-2007-complete-extraction.md',
    grade: 'A',
  },
  filimonov: {
    id: 'filimonov-1985',
    author: 'V.I. Filimonov et al.',
    title: 'Boxing: Means of Physical Development',
    year: 1985,
    publisher: 'Soviet Sports Science',
    vaultFile: null,
    grade: 'B',
  },
  crossDomain: {
    id: 'cross-domain-2026',
    author: 'Paul Logan / Claude analysis',
    title: 'Cross-Domain Synthesis — Three Sessions Converge',
    year: 2026,
    vaultFile: '06_Basic_Reflex_Syllabus/00_Overview/cross-domain-synthesis-2026-04-10.md',
    grade: 'A',
  },
  paulLogan: {
    id: 'paul-logan-2024-2026',
    author: 'Paul Logan',
    title: 'Basic Reflex Original Methodology',
    year: '2024-2026',
    publisher: 'Basic Reflex Limited',
    vaultFile: null,
    grade: 'A',
  },
};

// ── Complete Citation Database ────────────────────────────────────────────────
// Every claim in the curriculum mapped to its source

const CITATION_DATABASE = [
  // Block 1 — Foundation
  { block: 1, claim: 'Guard position is a position, not a posture or halt', source: 'balmaseda', ref: 'Ch.II — guard position terminology', page: null },
  { block: 1, claim: 'Gaze always above knuckles of lead hand', source: 'balmaseda', ref: 'Ch.II — guard specifications', page: null },
  { block: 1, claim: 'Rear foot metatarsus only, heel 3-5cm off ground', source: 'balmaseda', ref: 'Ch.II — guard position', page: null },
  { block: 1, claim: 'Guard is resting AND returning state', source: 'sagarra', ref: '2007 general principles; also Balmaseda Ch.II', page: null },
  { block: 1, claim: 'Four phases of technical assimilation', source: 'balmaseda', ref: 'Ch.II — Cuban teaching methodology', page: null },

  // Block 2 — Level
  { block: 2, claim: 'Flat step is foundation of all movement', source: 'balmaseda', ref: 'Ch.II', page: 34 },
  { block: 2, claim: 'Double flat steps explicitly rejected', source: 'balmaseda', ref: 'Ch.II', page: 34 },
  { block: 2, claim: 'Flat step footwork in all 4 directions at 11-12 category', source: 'sagarra', ref: '11-12 age category technical content', page: null },
  { block: 2, claim: 'No diagonal steps in early training', source: 'balmaseda', ref: 'Ch.II', page: 37 },

  // Block 3 — Angle
  { block: 3, claim: 'ONLY straight punches before hooks/crosses', source: 'sagarra', ref: '11-12 category; also Balmaseda Ch.II', page: null },
  { block: 3, claim: 'Max 2-punch combinations at beginner level', source: 'sagarra', ref: '11-12 category', page: null },
  { block: 3, claim: 'Jab has no hip rotation, no weight commitment', source: 'balmaseda', ref: 'Ch.II — straight punches', page: null },
  { block: 3, claim: 'Feints with arm and lead leg only at 11-12', source: 'sagarra', ref: '11-12 category', page: null },
  { block: 3, claim: 'Simple and complex defense at 11-12', source: 'sagarra', ref: '11-12 category', page: null },
  { block: 3, claim: 'Kinetic chain: 38% legs, 37% trunk, 24% arm', source: 'filimonov', ref: '1985 study', page: null },
  { block: 3, claim: 'Jab is only universal setup action — zero weight commitment', source: 'balmaseda', ref: 'Ch.II', page: null },
  { block: 3, claim: '12 observable behaviours for Block 3 gate', source: 'paulLogan', ref: 'Original gate criteria — 2026-05-03', page: null },
  { block: 3, claim: 'Three functions: offensive, defensive, counter-attack', source: 'balmaseda', ref: 'Ch.II — three functions requirement', page: null },

  // Block 4 — Inside
  { block: 4, claim: 'Hooks and crosses introduced together at 13-14', source: 'sagarra', ref: '13-14 category', page: null },
  { block: 4, claim: 'Max 3-punch combinations after hooks introduced', source: 'sagarra', ref: '13-14 category', page: null },
  { block: 4, claim: 'GAA (lead body hook) is hardest, taught last', source: 'balmaseda', ref: 'Ch.II', page: 52 },
  { block: 4, claim: 'Short distance and body-to-body added at 13-14', source: 'sagarra', ref: '13-14 category', page: null },
  { block: 4, claim: 'Counterattacks using trunk rotation introduced', source: 'sagarra', ref: '13-14 category', page: null },
  { block: 4, claim: 'No diagonal steps in competition', source: 'balmaseda', ref: 'Ch.II', page: 37 },

  // Block 5 — Rhythm
  { block: 5, claim: 'Trunk defenses after upper limb mastered', source: 'balmaseda', ref: 'Ch.II defense taxonomy', page: null },
  { block: 5, claim: 'Rhythm is defining characteristic of Cuban boxing', source: 'crossDomain', ref: 'Cuban boxing tradition + Paul Logan original', page: null },
  { block: 5, claim: '4-5 punch combinations with defense integration', source: 'sagarra', ref: '15-16 category', page: null },
  { block: 5, claim: 'Forward torsion dodge at 45 degrees (DETT)', source: 'balmaseda', ref: 'Ch.II defense taxonomy — DEFT specification', page: null },
  { block: 5, claim: 'Drumming-brain rudiment-to-combination mappings', source: 'paulLogan', ref: 'Original IP dated 2026-04-28', page: null },
  { block: 5, claim: 'Paradiddle = jab-cross-jab-jab', source: 'paulLogan', ref: 'Rhythm engine original mappings', page: null },

  // Block 6 — Counter
  { block: 6, claim: 'Defense and counter are one merged action', source: 'balmaseda', ref: 'Ch.II; also Sagarra 2007', page: null },
  { block: 6, claim: 'Step-based evasion after trunk mastered', source: 'balmaseda', ref: 'Ch.II defense order', page: null },
  { block: 6, claim: 'Shoulder roll NOT Cuban doctrine', source: 'balmaseda', ref: 'Ch.II', page: 67 },
  { block: 6, claim: 'Four outputs of correct defense', source: 'paulLogan', ref: 'Defense session 2026-04-10; cross-domain synthesis', page: null },

  // Block 7 — Pressure
  { block: 7, claim: 'Maneuvering for offensive preparation at 15-16', source: 'sagarra', ref: '15-16 category', page: null },
  { block: 7, claim: 'Complete level with 30-60 official fights', source: 'sagarra', ref: '15-16 category', page: null },
  { block: 7, claim: 'Fatigue degradation: pivots drop first', source: 'paulLogan', ref: 'Coaching observation', page: null },
  { block: 7, claim: 'Discipline-composure-confidence strict order', source: 'sagarra', ref: '4-stage psychological development arc', page: null },

  // Block 8 — Escape
  { block: 8, claim: 'Rope/corner escape with lateral movement', source: 'sagarra', ref: '15-16 category', page: null },
  { block: 8, claim: 'All movements must follow circular path', source: 'balmaseda', ref: 'Ch.II', page: null },
  { block: 8, claim: 'Defense with backward jump', source: 'sagarra', ref: '15-16 category', page: null },
  { block: 8, claim: 'Circular esquiva for cruzado defense', source: 'sagarra', ref: '15-16 category', page: null },

  // Block 9 — Control
  { block: 9, claim: 'Emphasis from repertoire to tactical application', source: 'sagarra', ref: '17-18 category', page: null },
  { block: 9, claim: 'Combat against different styles catalogued', source: 'sagarra', ref: '17-18 category', page: null },
  { block: 9, claim: 'Disguised guard (guardia camuflada)', source: 'sagarra', ref: '17-18 category', page: null },
  { block: 9, claim: '~100% coach independence at mastery', source: 'sagarra', ref: 'Psychological development scale', page: null },

  // Block 10 — Arena
  { block: 10, claim: 'Full integration at 17-18 year 2', source: 'sagarra', ref: '17-18 category', page: null },
  { block: 10, claim: 'Three domains run as continuous algorithm', source: 'crossDomain', ref: '2026-04-10 synthesis', page: null },
  { block: 10, claim: 'Obstacle-removal pedagogy — predator frame was always there', source: 'paulLogan', ref: 'Punches session 2026; coaching philosophy', page: null },
  { block: 10, claim: 'Creation phase: invents solutions not previously learned', source: 'balmaseda', ref: 'Ch.II — four phases of assimilation', page: null },
  { block: 10, claim: 'Mastery: playful with beginners and killers', source: 'paulLogan', ref: 'Coaching observation', page: null },
];

// ── Build authority map ──────────────────────────────────────────────────────

export function buildAuthorityMap() {
  const citations = CITATION_DATABASE.map(c => ({
    block: c.block,
    claim: c.claim,
    source: PRIMARY_SOURCES[c.source]?.title || c.source,
    sourceId: PRIMARY_SOURCES[c.source]?.id || c.source,
    reference: c.ref,
    page: c.page,
    vaultFile: PRIMARY_SOURCES[c.source]?.vaultFile || null,
  }));

  // Count by source
  const bySource = {};
  for (const c of citations) {
    bySource[c.sourceId] = (bySource[c.sourceId] || 0) + 1;
  }

  // Count by block
  const byBlock = {};
  for (const c of citations) {
    byBlock[c.block] = (byBlock[c.block] || 0) + 1;
  }

  // Find gaps (blocks with fewer than 3 citations)
  const gaps = [];
  for (let b = 1; b <= 10; b++) {
    if ((byBlock[b] || 0) < 3) {
      gaps.push({ block: b, citationCount: byBlock[b] || 0, note: 'Fewer than 3 citations — needs more source backing' });
    }
  }

  const authorityMap = {
    title: 'Authority Map — Basic Reflex Cuban Boxing Course',
    totalCitations: citations.length,
    primarySources: Object.values(PRIMARY_SOURCES),
    citationsBySource: bySource,
    citationsByBlock: byBlock,
    citations,
    gaps,
    generated: new Date().toISOString(),
  };

  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORTS_DIR, 'authority-map.json'), JSON.stringify(authorityMap, null, 2));

  // Vault sync
  try {
    const vaultAuth = path.join(VAULT, '10_Agents', 'course', 'authority');
    fs.writeFileSync(path.join(vaultAuth, 'authority-map.json'), JSON.stringify(authorityMap, null, 2));
  } catch {}

  return authorityMap;
}

export function getAuthorityMap() {
  const mapPath = path.join(REPORTS_DIR, 'authority-map.json');
  try {
    return JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
  } catch {
    return buildAuthorityMap();
  }
}

export function getSourceSummary() {
  const map = getAuthorityMap();
  return {
    totalCitations: map.totalCitations,
    bySource: map.citationsBySource,
    byBlock: map.citationsByBlock,
    gaps: map.gaps,
    sourceCount: map.primarySources.length,
  };
}
