#!/usr/bin/env node
// regtest-cache-policy.js — REGISTRATION TEST for the engine loop.
//
// Opening (map #4, strategy): "memory page replacement under mixed workloads."
// Chosen because its verifier has ZERO fidelity gap — cache hit-rate on a trace IS the
// real metric, not a sim that approximates reality. The map says fidelity gates leverage,
// so we prove the loop where the verifier can't lie.
//
// The loop, end-to-end, on this laptop, in seconds:
//   1. VERIFIER  — exact cache simulator → hit-rate for any eviction policy
//   2. BASELINES — LRU / LFU / FIFO / Random (the human defaults)
//   3. SEARCH    — a parameterised policy family, tuned on a TRAIN trace
//   4. HELD-OUT  — report the winner on a fresh TEST trace (honest: no verifier overfit)
//
// Passes if: the verifier runs cheap+faithful AND search beats the best baseline on held-out.

// ── workload: a MIXED trace (the neglected case) — hot Zipf set + recency bursts + scans ──
function makeRNG(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
function genTrace(n, seed) {
  const rng = makeRNG(seed);
  const HOT = 40, COLD = 4000, out = [];
  let i = 0;
  while (out.length < n) {
    const r = rng();
    if (r < 0.55) {                          // hot Zipf-ish working set (favours LFU)
      out.push('h' + Math.floor(Math.pow(rng(), 2.2) * HOT));
    } else if (r < 0.80) {                   // recency burst — repeat a few keys (favours LRU)
      const b = 'b' + Math.floor(rng() * 200);
      for (let k = 0; k < 3 && out.length < n; k++) out.push(b);
    } else if (r < 0.92) {                    // scan — long unique sequence (pollutes cache)
      for (let k = 0; k < 12 && out.length < n; k++) out.push('s' + (i++));
    } else {                                  // cold one-offs
      out.push('c' + Math.floor(rng() * COLD));
    }
  }
  return out.slice(0, n);
}

// ── VERIFIER: exact cache sim → hit rate. scoreFn returns eviction priority (evict MIN). ──
function hitRate(trace, cap, scoreFn) {
  const cache = new Map(); // key -> {last, freq, ins}
  let hits = 0;
  for (let t = 0; t < trace.length; t++) {
    const k = trace[t];
    const e = cache.get(k);
    if (e) { hits++; e.last = t; e.freq++; continue; }
    if (cache.size >= cap) {
      let evK = null, evS = Infinity;
      for (const [ck, ce] of cache) { const s = scoreFn(ce, t); if (s < evS) { evS = s; evK = ck; } }
      cache.delete(evK);
    }
    cache.set(k, { last: t, freq: 1, ins: t });
  }
  return hits / trace.length;
}

// ── policies ──
const GAP = 30; // rough avg recency gap, puts freq on the time axis
const LRU = (e) => e.last;
const LFU = (e) => e.freq;
const FIFO = (e) => e.ins;
const RAND = () => Math.random();
// parameterised family (2D): score = wr·last + wf·freq·GAP. Now reaches the baselines AND blends:
//   (wr=1,wf=0)=LRU · (wr=0,wf=1)=LFU · in-between = recency-protected frequency.
const family = (wr, wf) => (e) => wr * e.last + wf * e.freq * GAP;

const CAP = 200;
const train = genTrace(60000, 1);
const test = genTrace(60000, 999); // held-out: different seed

// baselines on held-out
const base = {
  LRU: hitRate(test, CAP, LRU), LFU: hitRate(test, CAP, LFU),
  FIFO: hitRate(test, CAP, FIFO), Random: hitRate(test, CAP, RAND),
};
const bestBaseName = Object.entries(base).sort((a, b) => b[1] - a[1])[0][0];
const bestBase = base[bestBaseName];

// SEARCH the family (2D) on TRAIN, then evaluate the winner on TEST (held-out)
let bestW = [1, 0], bestTrain = -1;
for (let wr = 0; wr <= 1.0001; wr += 0.1) {
  for (let wf = 0; wf <= 4.0001; wf += 0.25) {
    const hr = hitRate(train, CAP, family(wr, wf));
    if (hr > bestTrain) { bestTrain = hr; bestW = [+wr.toFixed(2), +wf.toFixed(2)]; }
  }
}
const foundTest = hitRate(test, CAP, family(bestW[0], bestW[1]));

const pct = (x) => (x * 100).toFixed(2) + '%';
console.log('REGISTRATION TEST — cache page-replacement (verifier: exact hit-rate)\n');
console.log(`trace: 60k accesses, mixed (hot Zipf + recency bursts + scans), cache=${CAP}\n`);
console.log('baselines (held-out test trace):');
for (const [k, v] of Object.entries(base)) console.log(`  ${k.padEnd(7)} ${pct(v)}`);
console.log(`\nsearch over family score = wr·last + wf·freq·${GAP}  (1,0=LRU · 0,1=LFU):`);
console.log(`  best weights on TRAIN: wr=${bestW[0]} wf=${bestW[1]}  (train hit ${pct(bestTrain)})`);
console.log(`  → evaluated on HELD-OUT TEST: ${pct(foundTest)}`);
const lift = foundTest - bestBase;
console.log(`\nbest baseline: ${bestBaseName} ${pct(bestBase)}`);
console.log(`found policy:  ${pct(foundTest)}   (${lift >= 0 ? '+' : ''}${(lift * 100).toFixed(2)} pts vs best baseline)`);
console.log(`\nVERDICT: ${lift > 0.001 ? '✅ LOOP REAL — cheap faithful verifier + search beat the human default on held-out data.'
  : '⚠️ verifier works, but search did NOT beat the baseline here — the loop runs, the win is unproven on this workload.'}`);
