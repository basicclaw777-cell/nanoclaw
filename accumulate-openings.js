#!/usr/bin/env node
// accumulate-openings.js — grind map-ready points across all 4 engine families.
// Rotates a seed per round so each pass explores a NEW region (the tool dedups by domain,
// so unseeded repeats just collide; varied seeds = real coverage). Hand to a background
// terminal: `node accumulate-openings.js [rounds]` (default 6 → up to 4×8×6 candidates,
// deduped into generative-openings.json). Budget: ~4 DeepSeek calls/round (SI-31 — pace it).

import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROUNDS = parseInt(process.argv[2], 10) || 6;

// seed pools — push each family into fresh territory each round
const SEEDS = {
  design:   ['acoustics', 'electromagnetics / antennas', 'structural lattices / metamaterials', 'thermal / heat transfer', 'microfluidics', 'optics / freeform lenses', 'soft & compliant mechanisms', 'photonic / phononic crystals'],
  sensing:  ['vibration / structural health', 'RF / WiFi (non-people)', 'acoustic / leaks & faults', 'optical / light flicker', 'power-line signatures', 'thermal / IR', 'magnetic / induction', 'strain & material fatigue'],
  strategy: ['traffic & signal control', 'network congestion / routing', 'markets & auctions', 'robotics control (sim)', 'resource & energy policies', 'evolutionary operators', 'caching / eviction policies', 'supply-chain heuristics'],
  optimize: ['PCB / chip layout', '3D packing', 'scheduling', 'vehicle / drone routing', 'assignment & rostering', 'warehouse / fulfilment', 'antenna-array / sensor placement', 'cutting-stock / nesting'],
};
const FAMILIES = ['design', 'sensing', 'strategy', 'optimize'];

const before = (() => { try { return JSON.parse(fs.readFileSync(path.join(DIR, 'generative-openings.json'), 'utf8')).openings.length; } catch { return 0; } })();
console.log(`[accumulate] starting at ${before} openings · ${ROUNDS} rounds × ${FAMILIES.length} families\n`);

for (let r = 0; r < ROUNDS; r++) {
  for (const mode of FAMILIES) {
    const pool = SEEDS[mode];
    const seed = pool[r % pool.length];
    console.log(`\n#### round ${r + 1}/${ROUNDS} · ${mode} · seed="${seed}"`);
    try {
      execFileSync('node', ['generative-openings.js', '--mode', mode, '--n', '8', '--seed', seed],
        { stdio: 'inherit', cwd: DIR, timeout: 120000 });
    } catch (e) { console.log(`  (round failed, continuing: ${String(e).slice(0, 80)})`); }
    try { execFileSync('sleep', ['2']); } catch {}
  }
}

const after = (() => { try { return JSON.parse(fs.readFileSync(path.join(DIR, 'generative-openings.json'), 'utf8')).openings.length; } catch { return before; } })();
console.log(`\n[accumulate] done. ${before} → ${after} openings (+${after - before} new, after dedup).`);
