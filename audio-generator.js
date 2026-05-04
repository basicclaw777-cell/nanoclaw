/**
 * audio-generator.js — WAV click track generator for rhythm engine
 *
 * Converts generateClickTrack() timing data into actual WAV audio files.
 * Pure PCM generation — no external audio dependencies.
 *
 * Tone types:
 *   - Accent: high woodblock (880 Hz, loud)
 *   - Tap: mid click (440 Hz, medium)
 *   - Ghost: soft tick (220 Hz, quiet)
 *   - Feint: silence marker (placeholder in track)
 */

import fs from 'fs';
import path from 'path';
import { generateClickTrack } from './rhythm-engine.js';

const SAMPLE_RATE = 44100;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const MAX_AMP = 32767;

// Tone definitions
const TONES = {
  accent: { freq: 880, amp: 0.9,  durationMs: 30, decay: 0.95 },
  tap:    { freq: 440, amp: 0.6,  durationMs: 25, decay: 0.93 },
  ghost:  { freq: 220, amp: 0.25, durationMs: 15, decay: 0.90 },
};

/**
 * Generate a single tone as Int16 samples.
 */
function generateTone(type) {
  const tone = TONES[type] || TONES.tap;
  const numSamples = Math.round(SAMPLE_RATE * tone.durationMs / 1000);
  const samples = new Int16Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const envelope = Math.pow(tone.decay, i);
    const value = Math.sin(2 * Math.PI * tone.freq * t) * tone.amp * envelope;
    samples[i] = Math.round(value * MAX_AMP);
  }
  return samples;
}

/**
 * Build a WAV file buffer from a click track.
 * @param {object} trackData — output from generateClickTrack()
 * @returns {Buffer} Complete WAV file
 */
function buildWav(trackData) {
  const totalSamples = Math.round(SAMPLE_RATE * (trackData.totalDurationMs + 500) / 1000);
  const audioData = new Int16Array(totalSamples);

  // Pre-generate tones
  const toneCache = {
    accent: generateTone('accent'),
    tap:    generateTone('tap'),
    ghost:  generateTone('ghost'),
  };

  for (const event of trackData.track) {
    if (event.punch === 'FEINT') continue;

    const type = event.accent ? 'accent' : event.isGhost ? 'ghost' : 'tap';
    const tone = toneCache[type];
    const startSample = Math.round(SAMPLE_RATE * event.timeMs / 1000);

    for (let i = 0; i < tone.length && (startSample + i) < totalSamples; i++) {
      const idx = startSample + i;
      // Mix (clamp to avoid clipping)
      const mixed = audioData[idx] + tone[i];
      audioData[idx] = Math.max(-MAX_AMP, Math.min(MAX_AMP, mixed));
    }
  }

  // Build WAV header
  const dataSize = totalSamples * CHANNELS * (BITS_PER_SAMPLE / 8);
  const headerSize = 44;
  const buffer = Buffer.alloc(headerSize + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(headerSize + dataSize - 8, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);                                 // chunk size
  buffer.writeUInt16LE(1, 20);                                  // PCM format
  buffer.writeUInt16LE(CHANNELS, 22);                           // channels
  buffer.writeUInt32LE(SAMPLE_RATE, 24);                        // sample rate
  buffer.writeUInt32LE(SAMPLE_RATE * CHANNELS * BITS_PER_SAMPLE / 8, 28); // byte rate
  buffer.writeUInt16LE(CHANNELS * BITS_PER_SAMPLE / 8, 32);    // block align
  buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);                    // bits per sample

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Write PCM data
  for (let i = 0; i < totalSamples; i++) {
    buffer.writeInt16LE(audioData[i], headerSize + i * 2);
  }

  return buffer;
}

/**
 * Generate a WAV file for a rudiment click track.
 * @param {string} rudimentName
 * @param {object} options — { bpm, repeats, outputDir }
 * @returns {object} { filePath, durationMs, events }
 */
export function generateWav(rudimentName, options = {}) {
  const bpm = options.bpm || 80;
  const repeats = options.repeats || 4;
  const outputDir = options.outputDir || path.join(process.env.HOME, 'nanoclaw', 'click-tracks');

  const trackData = generateClickTrack(rudimentName, bpm, repeats);
  if (trackData.error) return { error: trackData.error };

  const wavBuffer = buildWav(trackData);

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const fileName = `${rudimentName}_${bpm}bpm_x${repeats}.wav`;
  const filePath = path.join(outputDir, fileName);
  fs.writeFileSync(filePath, wavBuffer);

  return {
    filePath,
    fileName,
    durationMs: trackData.totalDurationMs,
    durationSec: (trackData.totalDurationMs / 1000).toFixed(1),
    events: trackData.track.length,
    rudiment: trackData.rudiment,
    bpm,
    repeats,
    fileSizeKb: Math.round(wavBuffer.length / 1024),
  };
}

/**
 * Generate WAV and return buffer (for Telegram bot inline sending).
 */
export function generateWavBuffer(rudimentName, options = {}) {
  const bpm = options.bpm || 80;
  const repeats = options.repeats || 4;

  const trackData = generateClickTrack(rudimentName, bpm, repeats);
  if (trackData.error) return { error: trackData.error };

  return {
    buffer: buildWav(trackData),
    durationMs: trackData.totalDurationMs,
    events: trackData.track.length,
    rudiment: trackData.rudiment,
    bpm,
    repeats,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('audio-generator.js')) {
  const rudiment = process.argv[2] || 'paradiddle';
  const bpm = parseInt(process.argv[3]) || 80;
  const repeats = parseInt(process.argv[4]) || 4;

  console.log(`Generating WAV: ${rudiment} @ ${bpm} BPM x ${repeats} repeats...`);
  const result = generateWav(rudiment, { bpm, repeats });

  if (result.error) {
    console.error(`Error: ${result.error}`);
    process.exit(1);
  }

  console.log(`  File:     ${result.filePath}`);
  console.log(`  Size:     ${result.fileSizeKb} KB`);
  console.log(`  Duration: ${result.durationSec}s`);
  console.log(`  Events:   ${result.events}`);
}
