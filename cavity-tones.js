#!/usr/bin/env node
/**
 * cavity-tones.js — Generate audio from the resonant enclosure's frequency stack
 *
 * Produces WAV files of the cavity's known frequencies:
 *   1. Schumann harmonics (7.83, 14.3, 20.8, 27.3, 33.8 Hz)
 *   2. Operating band (60-120 Hz — target band from Builder's Manual)
 *   3. 432 Hz concert pitch (pre-1939, cavity's native A)
 *   4. Solfeggio frequencies (396, 417, 528, 639, 741, 852 Hz)
 *   5. Full stack — all layers blended
 *   6. Binaural beats at Schumann (requires stereo headphones)
 *
 * Pure PCM generation. No dependencies. No API cost.
 *
 * Usage:
 *   node cavity-tones.js                  # generate all tones
 *   node cavity-tones.js schumann         # just Schumann harmonics
 *   node cavity-tones.js operating        # 60-120 Hz band
 *   node cavity-tones.js concert          # 432 Hz tone
 *   node cavity-tones.js solfeggio        # solfeggio series
 *   node cavity-tones.js binaural         # binaural beats
 *   node cavity-tones.js stack            # full layered stack
 *   node cavity-tones.js --duration 120   # 2 minutes (default 60s)
 *
 * ESM.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'cavity-tones');

const SAMPLE_RATE = 44100;
const MAX_AMP = 32767;

// ── Frequency Definitions ───────────────────────────────────────────────────

const SCHUMANN = {
  name: 'Schumann Harmonics',
  desc: "Cavity's electromagnetic voice",
  frequencies: [
    { hz: 7.83,  amp: 0.8,  label: 'Fundamental' },
    { hz: 14.3,  amp: 0.5,  label: '2nd harmonic' },
    { hz: 20.8,  amp: 0.35, label: '3rd harmonic' },
    { hz: 27.3,  amp: 0.25, label: '4th harmonic' },
    { hz: 33.8,  amp: 0.18, label: '5th harmonic' },
  ],
};

const OPERATING = {
  name: 'Operating Band (60-120 Hz)',
  desc: 'Target frequency from Builder\'s Manual — 4 civilizations independently',
  frequencies: [
    { hz: 60,   amp: 0.6,  label: '60 Hz floor' },
    { hz: 72,   amp: 0.5,  label: '72 Hz (base-60 x 1.2)' },
    { hz: 90,   amp: 0.55, label: '90 Hz mid-band' },
    { hz: 108,  amp: 0.45, label: '108 Hz (sacred number)' },
    { hz: 120,  amp: 0.4,  label: '120 Hz ceiling' },
  ],
};

const CONCERT = {
  name: '432 Hz Concert Pitch',
  desc: "Cavity's native A — before 1939 Rockefeller standardization to 440",
  frequencies: [
    { hz: 432,   amp: 0.7,  label: 'A = 432 Hz' },
    { hz: 216,   amp: 0.4,  label: 'Octave below (216)' },
    { hz: 108,   amp: 0.25, label: '2 octaves below (108)' },
    { hz: 324,   amp: 0.3,  label: 'Perfect 5th below (E3)' },
    { hz: 288,   amp: 0.25, label: 'Perfect 4th below (D4)' },
  ],
};

const SOLFEGGIO = {
  name: 'Solfeggio Frequencies',
  desc: 'Medieval recovery of older tuning system',
  frequencies: [
    { hz: 396,  amp: 0.5, label: 'UT — Liberation' },
    { hz: 417,  amp: 0.5, label: 'RE — Resonance' },
    { hz: 528,  amp: 0.6, label: 'MI — Transformation' },
    { hz: 639,  amp: 0.5, label: 'FA — Connection' },
    { hz: 741,  amp: 0.45, label: 'SOL — Expression' },
    { hz: 852,  amp: 0.4, label: 'LA — Intuition' },
  ],
};

// ── WAV Generation ──────────────────────────────────────────────────────────

function generateMonoWav(frequencies, durationSec) {
  const numSamples = SAMPLE_RATE * durationSec;
  const samples = new Int16Array(numSamples);

  // Normalize amplitudes
  const totalAmp = frequencies.reduce((s, f) => s + f.amp, 0);
  const normFactor = totalAmp > 1.0 ? 1.0 / totalAmp : 1.0;

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    let value = 0;

    for (const f of frequencies) {
      value += Math.sin(2 * Math.PI * f.hz * t) * f.amp * normFactor;
    }

    // Gentle fade in/out (1 second each)
    const fadeIn = Math.min(1, t);
    const fadeOut = Math.min(1, durationSec - t);
    value *= fadeIn * fadeOut;

    samples[i] = Math.round(Math.max(-1, Math.min(1, value)) * MAX_AMP);
  }

  return writeWavBuffer(samples, 1);
}

function generateStereoWav(leftFreqs, rightFreqs, durationSec) {
  const numSamples = SAMPLE_RATE * durationSec;
  // Interleaved stereo: L R L R
  const samples = new Int16Array(numSamples * 2);

  const totalAmpL = leftFreqs.reduce((s, f) => s + f.amp, 0);
  const normL = totalAmpL > 1.0 ? 1.0 / totalAmpL : 1.0;
  const totalAmpR = rightFreqs.reduce((s, f) => s + f.amp, 0);
  const normR = totalAmpR > 1.0 ? 1.0 / totalAmpR : 1.0;

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    let left = 0, right = 0;

    for (const f of leftFreqs) {
      left += Math.sin(2 * Math.PI * f.hz * t) * f.amp * normL;
    }
    for (const f of rightFreqs) {
      right += Math.sin(2 * Math.PI * f.hz * t) * f.amp * normR;
    }

    const fadeIn = Math.min(1, t);
    const fadeOut = Math.min(1, durationSec - t);
    left *= fadeIn * fadeOut;
    right *= fadeIn * fadeOut;

    samples[i * 2] = Math.round(Math.max(-1, Math.min(1, left)) * MAX_AMP);
    samples[i * 2 + 1] = Math.round(Math.max(-1, Math.min(1, right)) * MAX_AMP);
  }

  return writeWavBuffer(samples, 2);
}

function writeWavBuffer(samples, channels) {
  const bytesPerSample = 2; // 16-bit
  const dataSize = samples.length * bytesPerSample;
  const headerSize = 44;
  const buffer = Buffer.alloc(headerSize + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);           // chunk size
  buffer.writeUInt16LE(1, 20);            // PCM
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * channels * bytesPerSample, 28); // byte rate
  buffer.writeUInt16LE(channels * bytesPerSample, 32);  // block align
  buffer.writeUInt16LE(16, 34);           // bits per sample

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Write sample data
  const sampleBuf = Buffer.from(samples.buffer);
  sampleBuf.copy(buffer, 44);

  return buffer;
}

// ── Tone Generators ─────────────────────────────────────────────────────────

function genSchumann(duration) {
  return { buffer: generateMonoWav(SCHUMANN.frequencies, duration), file: 'schumann-harmonics.wav', ...SCHUMANN };
}

function genOperating(duration) {
  return { buffer: generateMonoWav(OPERATING.frequencies, duration), file: 'operating-band-60-120hz.wav', ...OPERATING };
}

function genConcert(duration) {
  return { buffer: generateMonoWav(CONCERT.frequencies, duration), file: '432hz-concert-pitch.wav', ...CONCERT };
}

function genSolfeggio(duration) {
  // Each solfeggio frequency gets 10 seconds, crossfaded
  const seqDuration = Math.max(duration, SOLFEGGIO.frequencies.length * 10);
  const numSamples = SAMPLE_RATE * seqDuration;
  const samples = new Int16Array(numSamples);
  const segmentSamples = Math.floor(numSamples / SOLFEGGIO.frequencies.length);

  for (let fIdx = 0; fIdx < SOLFEGGIO.frequencies.length; fIdx++) {
    const f = SOLFEGGIO.frequencies[fIdx];
    const startSample = fIdx * segmentSamples;

    for (let i = 0; i < segmentSamples; i++) {
      const globalIdx = startSample + i;
      if (globalIdx >= numSamples) break;

      const t = globalIdx / SAMPLE_RATE;
      const localT = i / segmentSamples;

      // Smooth fade in/out per frequency
      const env = Math.sin(localT * Math.PI);
      const value = Math.sin(2 * Math.PI * f.hz * t) * f.amp * env;

      samples[globalIdx] += Math.round(Math.max(-1, Math.min(1, value)) * MAX_AMP);
    }
  }

  return { buffer: writeWavBuffer(samples, 1), file: 'solfeggio-sequence.wav', ...SOLFEGGIO };
}

function genBinaural(duration) {
  // Binaural beats: slightly different frequency in each ear
  // Brain perceives the difference frequency (= Schumann harmonics)
  // Carrier: 200 Hz (comfortable). Beat: Schumann fundamental 7.83 Hz
  const carrier = 200;

  const leftFreqs = [
    { hz: carrier, amp: 0.7, label: `Left ear: ${carrier} Hz` },
  ];
  const rightFreqs = [
    { hz: carrier + 7.83, amp: 0.7, label: `Right ear: ${carrier + 7.83} Hz` },
  ];

  return {
    buffer: generateStereoWav(leftFreqs, rightFreqs, duration),
    file: 'binaural-schumann-783hz.wav',
    name: 'Binaural Beat — Schumann 7.83 Hz',
    desc: 'Carrier 200 Hz, beat frequency 7.83 Hz. Use stereo headphones. Brain entrains to cavity fundamental.',
    frequencies: [...leftFreqs, ...rightFreqs],
  };
}

function genStack(duration) {
  // All layers blended — the full cavity frequency stack
  const allFreqs = [
    // Schumann (quieter — foundation)
    ...SCHUMANN.frequencies.map(f => ({ ...f, amp: f.amp * 0.3 })),
    // Operating band (mid presence)
    ...OPERATING.frequencies.map(f => ({ ...f, amp: f.amp * 0.25 })),
    // 432 Hz (melodic center)
    ...CONCERT.frequencies.map(f => ({ ...f, amp: f.amp * 0.35 })),
  ];

  return {
    buffer: generateMonoWav(allFreqs, duration),
    file: 'full-cavity-stack.wav',
    name: 'Full Cavity Stack',
    desc: 'All frequency layers blended: Schumann + Operating Band + 432 Hz. The complete resonant enclosure in sound.',
    frequencies: allFreqs,
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

const GENERATORS = {
  schumann: genSchumann,
  operating: genOperating,
  concert: genConcert,
  solfeggio: genSolfeggio,
  binaural: genBinaural,
  stack: genStack,
};

async function main() {
  const args = process.argv.slice(2);
  let duration = 60;
  let targets = Object.keys(GENERATORS);

  // Parse args
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--duration' && args[i + 1]) {
      duration = parseInt(args[i + 1]);
      i++;
    } else if (GENERATORS[args[i]]) {
      targets = [args[i]];
    }
  }

  // Ensure output dir
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`\n=== CAVITY TONES — ${duration}s duration ===\n`);

  for (const target of targets) {
    const gen = GENERATORS[target];
    console.log(`Generating: ${target}...`);

    const result = gen(duration);
    const outPath = path.join(OUTPUT_DIR, result.file);
    fs.writeFileSync(outPath, result.buffer);

    const sizeMB = (result.buffer.length / 1024 / 1024).toFixed(1);
    console.log(`  ${result.name}`);
    console.log(`  ${result.desc}`);
    console.log(`  Frequencies: ${result.frequencies.map(f => f.hz + ' Hz').join(', ')}`);
    console.log(`  File: ${outPath} (${sizeMB} MB)`);
    console.log();
  }

  console.log(`Done. Files at ${OUTPUT_DIR}/`);
  console.log('Play: afplay cavity-tones/schumann-harmonics.wav');
  console.log('Or open in any audio player.\n');
}

// Exports for other modules
export { GENERATORS, SCHUMANN, OPERATING, CONCERT, SOLFEGGIO };

main().catch(e => console.error('Error:', e));
