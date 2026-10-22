'use strict';

// Listener Agent — FFT, 6-Feature Extraction, Anomaly Detection

function fft(re, im) {
  const n = re.length;
  if (n <= 1) return;

  const halfN = n / 2;
  const evenRe = new Float64Array(halfN);
  const evenIm = new Float64Array(halfN);
  const oddRe  = new Float64Array(halfN);
  const oddIm  = new Float64Array(halfN);

  for (let i = 0; i < halfN; i++) {
    evenRe[i] = re[i * 2];     evenIm[i] = im[i * 2];
    oddRe[i]  = re[i * 2 + 1]; oddIm[i]  = im[i * 2 + 1];
  }

  fft(evenRe, evenIm);
  fft(oddRe, oddIm);

  for (let k = 0; k < halfN; k++) {
    const angle = -2 * Math.PI * k / n;
    const twRe = Math.cos(angle);
    const twIm = Math.sin(angle);

    const tRe = twRe * oddRe[k] - twIm * oddIm[k];
    const tIm = twRe * oddIm[k] + twIm * oddRe[k];

    re[k]          = evenRe[k] + tRe;
    im[k]          = evenIm[k] + tIm;
    re[k + halfN]  = evenRe[k] - tRe;
    im[k + halfN]  = evenIm[k] - tIm;
  }
}

function powerSpectrum(signal, fftSize) {
  const n = fftSize || nextPow2(signal.length);
  const re = new Float64Array(n);
  const im = new Float64Array(n);

  for (let i = 0; i < Math.min(signal.length, n); i++) {
    const window = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
    re[i] = signal[i] * window;
  }

  fft(re, im);

  const power = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    power[i] = re[i] * re[i] + im[i] * im[i];
  }
  return power;
}

function nextPow2(v) {
  let p = 1;
  while (p < v) p <<= 1;
  return p;
}

function findPeak(power, expectedBin, searchWidth) {
  const lo = Math.max(0, expectedBin - searchWidth);
  const hi = Math.min(power.length - 1, expectedBin + searchWidth);
  let maxVal = -1, maxBin = expectedBin;
  for (let i = lo; i <= hi; i++) {
    if (power[i] > maxVal) { maxVal = power[i]; maxBin = i; }
  }
  return { bin: maxBin, power: maxVal };
}

function extractFeatures(combined, voiceParams, sampleRate, fftSize) {
  fftSize = fftSize || 4096;
  const power = powerSpectrum(combined, fftSize);
  const binHz = sampleRate / fftSize;
  const totalEnergy = power.reduce((a, b) => a + b, 0);
  if (totalEnergy === 0) return { detuning: 0, harmonicity: 0, phaseVar: 0, coherence: 0, beatEnergy: 0, entropy: 0 };

  let detuningSum = 0;
  let harmonicEnergy = 0;
  const searchWidth = Math.ceil(20 / binHz);

  for (const p of voiceParams) {
    const expectedBin = Math.round(p.frequency / binHz);
    const peak = findPeak(power, expectedBin, searchWidth);
    const measuredFreq = peak.bin * binHz;
    detuningSum += Math.abs(measuredFreq - p.frequency);
    harmonicEnergy += peak.power;

    for (let h = 2; h <= Math.min(p.harmonicCount, 6); h++) {
      const hBin = Math.round(p.frequency * h / binHz);
      if (hBin < power.length) {
        const hPeak = findPeak(power, hBin, searchWidth);
        harmonicEnergy += hPeak.power;
      }
    }
  }

  const detuning = detuningSum / voiceParams.length;
  const harmonicity = harmonicEnergy / totalEnergy;

  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  for (let i = 0; i < Math.min(combined.length, fftSize); i++) {
    const w = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));
    re[i] = combined[i] * w;
  }
  fft(re, im);

  let phaseSum = 0, phaseCount = 0;
  const phases = [];
  for (const p of voiceParams) {
    const bin = Math.round(p.frequency / binHz);
    if (bin < fftSize / 2) {
      const phase = Math.atan2(im[bin], re[bin]);
      phases.push(phase);
      phaseCount++;
    }
  }
  let phaseVar = 0;
  if (phases.length > 1) {
    const mean = phases.reduce((a, b) => a + b, 0) / phases.length;
    phaseVar = phases.reduce((a, p) => a + (p - mean) * (p - mean), 0) / phases.length;
  }

  let coherence = 0;
  if (voiceParams.length >= 2) {
    let pairCount = 0;
    for (let i = 0; i < voiceParams.length - 1; i++) {
      const bin1 = Math.round(voiceParams[i].frequency / binHz);
      const bin2 = Math.round(voiceParams[i + 1].frequency / binHz);
      if (bin1 < fftSize / 2 && bin2 < fftSize / 2) {
        const p1 = power[bin1], p2 = power[bin2];
        if (p1 > 0 && p2 > 0) {
          coherence += Math.min(p1, p2) / Math.max(p1, p2);
          pairCount++;
        }
      }
    }
    if (pairCount > 0) coherence /= pairCount;
  }

  let beatEnergy = 0;
  for (let i = 0; i < voiceParams.length - 1; i++) {
    for (let j = i + 1; j < voiceParams.length; j++) {
      const beatFreq = Math.abs(voiceParams[i].frequency - voiceParams[j].frequency);
      const beatBin = Math.round(beatFreq / binHz);
      if (beatBin > 0 && beatBin < power.length) {
        beatEnergy += power[beatBin];
      }
    }
  }
  beatEnergy /= totalEnergy;

  let entropy = 0;
  for (let i = 0; i < power.length; i++) {
    const p = power[i] / totalEnergy;
    if (p > 1e-10) entropy -= p * Math.log2(p);
  }
  const maxEntropy = Math.log2(power.length);
  entropy /= maxEntropy;

  return { detuning, harmonicity, phaseVar, coherence, beatEnergy, entropy };
}

class AnomalyDetector {
  constructor(featureNames, alpha = 0.1) {
    this.alpha = alpha;
    this.stats = {};
    for (const f of featureNames) {
      this.stats[f] = { mean: null, variance: null, count: 0 };
    }
    this.streaks = {};
    for (const f of featureNames) this.streaks[f] = 0;
  }

  update(features) {
    const zScores = {};
    const anomalies = {};

    for (const [f, val] of Object.entries(features)) {
      const s = this.stats[f];
      if (!s) continue;

      if (s.count === 0) {
        s.mean = val;
        s.variance = 0;
        s.count = 1;
        zScores[f] = 0;
        anomalies[f] = false;
        continue;
      }

      const diff = val - s.mean;
      s.mean += this.alpha * diff;
      s.variance = (1 - this.alpha) * (s.variance + this.alpha * diff * diff);
      s.count++;

      const std = Math.sqrt(s.variance);
      const z = std > 1e-10 ? Math.abs(diff) / std : 0;
      zScores[f] = z;

      if (z > 3) {
        this.streaks[f]++;
      } else {
        this.streaks[f] = 0;
      }
      anomalies[f] = this.streaks[f] >= 2;
    }

    return { zScores, anomalies };
  }
}

module.exports = { powerSpectrum, extractFeatures, AnomalyDetector, fft, nextPow2 };
