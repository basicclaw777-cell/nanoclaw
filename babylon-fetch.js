// Babylon corpus fetcher — acquires Akkadian/Babylonian transliterations → segments.json
// Source: CDLI ATF (the documented standard format). Parser is the reusable asset and is
// self-tested inline. The network bulk-pull must have its FIRST real run validated in prod
// (size + the TCC-permitted env for KINGSTON2) before the full translate run — see --selftest.
//
//   node babylon-fetch.js --selftest         validate the ATF parser on an embedded real sample
//   node babylon-fetch.js --cdli --limit 50  pull from CDLI ATF (prod; validate first run)

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const PROD = process.argv.includes('--prod');
const BASE = PROD ? '/Volumes/KINGSTON2/cathedral-archive/babylon' : '/Users/basicclaw777/nanoclaw/babylon';
const OUT = join(BASE, 'extracted/segments.json');
const LIMIT = (() => { const i = process.argv.indexOf('--limit'); return i > -1 ? parseInt(process.argv[i + 1]) : Infinity; })();

// CDLI publishes its corpus as ATF. Bulk source (large, single concatenated file):
const CDLI_ATF_URL = 'https://raw.githubusercontent.com/cdli-gh/data/master/cdliatf_unblocked.atf';

// Parse ATF → [{tablet_id, designation, lines:[transliteration strings]}]
// ATF: "&P###### = designation" starts a text; "@/#/$/ " lines are metadata; "<n>. <text>" are transliteration.
export function parseATF(atf, { keep } = {}) {
  const tablets = [];
  let cur = null;
  for (const raw of atf.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.startsWith('&P') || line.startsWith('&Q') || line.startsWith('&X')) {
      if (cur && cur.lines.length) tablets.push(cur);
      const m = line.match(/^&(\S+)\s*=?\s*(.*)$/);
      cur = { tablet_id: m ? m[1] : line.slice(1).trim(), designation: m ? m[2].trim() : '', lines: [] };
      continue;
    }
    if (!cur) continue;
    if (/^[@#$]/.test(line) || line.trim() === '') continue;        // metadata / structure / lemmatization
    const t = line.match(/^\d+['"]?\.\s+(.*)$/);                      // "1. transliteration"
    if (t && t[1].trim()) cur.lines.push(t[1].trim());
  }
  if (cur && cur.lines.length) tablets.push(cur);
  return keep ? tablets.filter(keep) : tablets;
}

// Genre filter for the target gold (astronomy + math); designation/keywords heuristic.
const GOLD = /astron|mul\.?apin|eclipse|planet|diary|mathemat|metrolog|sexagesim|plimpton|tablet of/i;

async function fetchCDLI() {
  console.log(`Fetching CDLI ATF dump (large)…`);
  const resp = await fetch(CDLI_ATF_URL);
  if (!resp.ok) throw new Error(`CDLI fetch ${resp.status} — verify URL/source in prod`);
  const atf = await resp.text();
  let tablets = parseATF(atf);
  console.log(`Parsed ${tablets.length} tablets from CDLI.`);
  const gold = tablets.filter(t => GOLD.test(t.designation));
  const chosen = (gold.length ? gold : tablets).slice(0, LIMIT);
  mkdirSync(join(BASE, 'extracted'), { recursive: true });
  writeFileSync(OUT, JSON.stringify(chosen, null, 2));
  console.log(`Wrote ${chosen.length} tablets → ${OUT} (gold-genre matches: ${gold.length})`);
}

// Inline self-test: a genuine ATF-format sample (Hammurabi §1, real transliteration).
function selftest() {
  const sample = `&P000001 = Code of Hammurabi (excerpt)
#atf: lang akk
@tablet
@obverse
1. szum-ma a-wi-lum a-wi-lam u2-ub-bi-ir-ma
2. ne-er-tam e-li-szu id-di-ma la uk-ti-in-szu
$ single ruling
#lem: this line should be ignored
&P000002 = Astronomical omen (excerpt)
@tablet
1. szum-ma {d}30 ina IGI.LA2-szu
2. MUL.MUL i-na ZAG-szu GUB-iz`;
  const out = parseATF(sample);
  const ok = out.length === 2 && out[0].lines.length === 2 && out[1].lines.length === 2
    && out[0].tablet_id === 'P000001' && out[1].lines[1].includes('MUL.MUL')
    && !JSON.stringify(out).includes('should be ignored');
  console.log(JSON.stringify(out, null, 2));
  console.log(ok ? '\n✅ ATF parser self-test PASSED' : '\n❌ self-test FAILED');
  if (!ok) process.exit(1);
}

if (process.argv.includes('--selftest')) selftest();
else if (process.argv.includes('--cdli')) fetchCDLI().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
else console.log('Usage: --selftest | --cdli [--limit N] [--prod]');
