// sound-studio/engine.js — Personal Media Audio Engine
// ESM module
// Four capabilities: transcription, voice, instrumentals, podcast
// Routes to correct handler, manages output

import fs from 'fs';
import path from 'path';
import { execSync, exec } from 'child_process';
import { getTasteProfile } from '../taste-map-api.js';

const HOME = process.env.HOME;
const STUDIO_DIR = path.join(HOME, 'nanoclaw', 'sound-studio');
const OUTPUT_DIR = path.join(STUDIO_DIR, 'output');
const INBOX_DIR = path.join(STUDIO_DIR, 'inbox');
const WHISPER_CLI = '/opt/homebrew/bin/whisper-cli';
const WHISPER_MODEL = path.join(HOME, 'Cathedral', 'models', 'ggml-medium.bin');
const VOICE_REF = path.join(HOME, 'Cathedral', 'cathy_voice_reference.wav');

// ── 1. Transcription ────────────────────────────────────────────────────────

/**
 * Transcribe audio/video file using local Whisper
 * @param {string} inputPath — path to audio/video file
 * @param {object} [options] — { format: 'txt'|'srt'|'json', language: 'en' }
 * @returns {object} { text, outputPath, durationMs }
 */
export function transcribe(inputPath, options = {}) {
  const format = options.format || 'txt';
  const lang = options.language || 'en';
  const startMs = Date.now();

  if (!fs.existsSync(inputPath)) throw new Error(`File not found: ${inputPath}`);
  if (!fs.existsSync(WHISPER_CLI)) throw new Error('whisper-cli not found at ' + WHISPER_CLI);

  const baseName = path.basename(inputPath, path.extname(inputPath));
  const outputBase = path.join(OUTPUT_DIR, `transcribe-${baseName}-${Date.now()}`);

  // Convert to WAV if not already (whisper needs WAV 16kHz mono)
  let wavPath = inputPath;
  if (!inputPath.endsWith('.wav')) {
    wavPath = `/tmp/sound-studio-${Date.now()}.wav`;
    try {
      execSync(`ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -y "${wavPath}" 2>/dev/null`, { timeout: 120000 });
    } catch {
      // Try sox as fallback
      try {
        execSync(`sox "${inputPath}" -r 16000 -c 1 "${wavPath}" 2>/dev/null`, { timeout: 120000 });
      } catch (e) {
        throw new Error(`Cannot convert to WAV: ${e.message}. Install ffmpeg or sox.`);
      }
    }
  }

  // Run whisper
  const outputFlag = format === 'srt' ? '-osrt' : format === 'json' ? '-ojf' : '-otxt';
  const cmd = `"${WHISPER_CLI}" -m "${WHISPER_MODEL}" -l ${lang} ${outputFlag} -of "${outputBase}" -f "${wavPath}"`;

  console.log(`[sound-studio] Transcribing: ${path.basename(inputPath)}`);
  execSync(cmd, { timeout: 600000, encoding: 'utf-8' });

  // Read output
  const ext = format === 'srt' ? '.srt' : format === 'json' ? '.json' : '.txt';
  const outputPath = outputBase + ext;
  let text = '';
  try {
    text = fs.readFileSync(outputPath, 'utf-8').trim();
  } catch {
    // whisper-cli might append the extension differently
    const alternatives = [outputBase + '.txt', outputBase + '.srt'];
    for (const alt of alternatives) {
      if (fs.existsSync(alt)) { text = fs.readFileSync(alt, 'utf-8').trim(); break; }
    }
  }

  // Clean up temp wav
  if (wavPath !== inputPath && fs.existsSync(wavPath)) {
    try { fs.unlinkSync(wavPath); } catch {}
  }

  const durationMs = Date.now() - startMs;
  console.log(`[sound-studio] Transcription complete: ${text.length} chars in ${durationMs}ms`);

  return { text, outputPath, durationMs, format };
}

// ── 2. Voice Engine (Edge TTS — free, high quality) ─────────────────────────

// Default voices for different use cases
const VOICES = {
  narrator: 'en-US-BrianNeural',                 // approachable, casual, sincere
  announcer: 'en-US-ChristopherNeural',          // reliable, authority
  female: 'en-US-AvaNeural',                     // expressive, friendly
  casual: 'en-US-BrianNeural',                   // approachable, casual
  podcast_host: 'en-US-BrianNeural',
  podcast_guest: 'en-US-ChristopherNeural'
};

/**
 * Generate speech from text using Edge TTS
 * @param {string} text — text to speak
 * @param {object} [options] — { voice: string, rate: string, outputPath: string }
 * @returns {object} { outputPath, durationMs }
 */
export async function speak(text, options = {}) {
  const voice = options.voice || VOICES.narrator;
  const rate = options.rate || '+0%';
  const outputPath = options.outputPath || path.join(OUTPUT_DIR, `voice-${Date.now()}.mp3`);
  const startMs = Date.now();

  console.log(`[sound-studio] Generating voice: ${text.slice(0, 50)}... (${voice})`);

  // Edge TTS via Python API (more reliable than CLI with special chars)
  const pyScript = `
import asyncio, edge_tts, sys
async def main():
    communicate = edge_tts.Communicate(sys.argv[1], sys.argv[2], rate=sys.argv[3])
    await communicate.save(sys.argv[4])
    print("OK")
asyncio.run(main())
`;
  const tmpPy = `/tmp/edge-tts-${Date.now()}.py`;
  fs.writeFileSync(tmpPy, pyScript);
  const cmd = `python3 "${tmpPy}" "${text.replace(/"/g, '\\"')}" "${voice}" "${rate}" "${outputPath}"`;

  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 60000 }, (err) => {
      try { fs.unlinkSync(tmpPy); } catch {}
      if (err) return reject(new Error(`Edge TTS failed: ${err.message}`));
      const durationMs = Date.now() - startMs;
      console.log(`[sound-studio] Voice generated: ${path.basename(outputPath)} (${durationMs}ms)`);
      resolve({ outputPath, durationMs, voice });
    });
  });
}

/**
 * Generate speech using Chatterbox TTS (Paul's voice clone)
 * @param {string} text — text to speak
 * @param {object} [options] — { exaggeration: number, outputPath: string }
 * @returns {object} { outputPath, durationMs }
 */
export async function speakAsClone(text, options = {}) {
  const exaggeration = options.exaggeration || 0.45;
  const outputPath = options.outputPath || path.join(OUTPUT_DIR, `clone-${Date.now()}.wav`);
  const startMs = Date.now();

  console.log(`[sound-studio] Generating clone voice: ${text.slice(0, 50)}...`);

  // Python script to use Chatterbox
  const pyScript = `
import sys
from chatterbox.tts import ChatterboxTTS
import torchaudio

tts = ChatterboxTTS.from_pretrained(device="mps")
wav = tts.generate(
    "${text.replace(/"/g, '\\"')}",
    audio_prompt="${VOICE_REF}",
    exaggeration=${exaggeration}
)
torchaudio.save("${outputPath}", wav, tts.sr)
print("OK")
`;

  return new Promise((resolve, reject) => {
    const tmpPy = `/tmp/sound-studio-clone-${Date.now()}.py`;
    fs.writeFileSync(tmpPy, pyScript);
    exec(`python3 "${tmpPy}"`, { timeout: 120000 }, (err, stdout) => {
      try { fs.unlinkSync(tmpPy); } catch {}
      if (err) return reject(new Error(`Chatterbox TTS failed: ${err.message}`));
      const durationMs = Date.now() - startMs;
      console.log(`[sound-studio] Clone voice generated: ${path.basename(outputPath)} (${durationMs}ms)`);
      resolve({ outputPath, durationMs, voice: 'chatterbox-clone' });
    });
  });
}

// ── 3. Instrumental Generator (Replicate MusicGen) ──────────────────────────

/**
 * Generate instrumental via Replicate MusicGen API
 * @param {string} description — musical description
 * @param {object} [options] — { duration: number, outputPath: string }
 * @returns {object} { outputPath, durationMs, url }
 */
export async function generateInstrumental(description, options = {}) {
  const duration = options.duration || 10;
  const outputPath = options.outputPath || path.join(OUTPUT_DIR, `instrumental-${Date.now()}.wav`);
  const startMs = Date.now();

  const apiToken = process.env.REPLICATE_API_TOKEN;
  if (!apiToken) throw new Error('REPLICATE_API_TOKEN not set');

  // Build prompt from taste map if no description
  let prompt = description;
  if (!prompt) {
    const profile = getTasteProfile('music', 'content_instrumental');
    prompt = 'hip-hop instrumental, confident mood, moderate bass, clean mix, 120 bpm';
  }

  console.log(`[sound-studio] Generating instrumental: "${prompt.slice(0, 60)}..." (${duration}s)`);

  // Start prediction
  const startResp = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      version: 'b05b1dff1d8c6dc63d14b0cdb42135571e41c36f21e4b64c0514d5b7c1c127ff',
      input: {
        prompt,
        duration,
        model_version: 'stereo-melody-large',
        output_format: 'wav'
      }
    })
  });

  if (!startResp.ok) {
    const err = await startResp.text();
    throw new Error(`Replicate start failed: ${err.slice(0, 200)}`);
  }

  const prediction = await startResp.json();
  let predUrl = prediction.urls?.get || `https://api.replicate.com/v1/predictions/${prediction.id}`;

  // Poll for completion
  let result = null;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const pollResp = await fetch(predUrl, {
      headers: { 'Authorization': `Bearer ${apiToken}` }
    });
    const status = await pollResp.json();
    if (status.status === 'succeeded') {
      result = status.output;
      break;
    } else if (status.status === 'failed') {
      throw new Error(`MusicGen failed: ${status.error || 'unknown'}`);
    }
  }

  if (!result) throw new Error('MusicGen timed out after 3 minutes');

  // Download
  const audioUrl = typeof result === 'string' ? result : result[0] || result;
  execSync(`curl -sL "${audioUrl}" -o "${outputPath}"`, { timeout: 60000 });

  const durationMs = Date.now() - startMs;
  console.log(`[sound-studio] Instrumental generated: ${path.basename(outputPath)} (${durationMs}ms)`);

  return { outputPath, durationMs, url: audioUrl, prompt };
}

// ── 4. Podcast Generator ────────────────────────────────────────────────────

/**
 * Generate a two-voice podcast from text content
 * @param {string} content — source text (vault nuggets, roundtable, etc)
 * @param {string} topic — topic name for the episode
 * @param {object} [options] — { host: string, guest: string }
 * @returns {object} { outputPath, transcript, durationMs }
 */
export async function generatePodcast(content, topic, options = {}) {
  const hostVoice = options.host || VOICES.podcast_host;
  const guestVoice = options.guest || VOICES.podcast_guest;
  const startMs = Date.now();
  const episodeId = Date.now();

  console.log(`[sound-studio] Generating podcast: "${topic}"`);

  // Step 1: Generate conversational script via DeepSeek
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');

  const scriptPrompt = `You are generating a podcast script. Two hosts discuss the following content in an engaging, conversational way.

RULES:
- HOST_A is the main presenter — warm, confident, asks good questions
- HOST_B is the expert — brings depth, specific insights, challenges assumptions
- Keep it natural — interruptions, agreements, building on each other's points
- 3-5 minutes of dialogue (about 600-1000 words)
- Start with a hook, end with a takeaway
- Output format: each line starts with HOST_A: or HOST_B: followed by their dialogue

TOPIC: ${topic}

CONTENT TO DISCUSS:
${content.slice(0, 4000)}`;

  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      max_tokens: 2048,
      temperature: 0.7,
      messages: [
        { role: 'system', content: 'You are a podcast script writer. Write natural, engaging dialogue between two hosts.' },
        { role: 'user', content: scriptPrompt }
      ]
    }),
    signal: AbortSignal.timeout(60000)
  });

  if (!resp.ok) throw new Error(`DeepSeek failed: ${resp.status}`);
  const data = await resp.json();
  const script = data.choices?.[0]?.message?.content?.trim();
  if (!script) throw new Error('Empty script from DeepSeek');

  // Step 2: Parse script into segments
  const segments = [];
  for (const line of script.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('HOST_A:')) {
      segments.push({ voice: hostVoice, text: trimmed.replace('HOST_A:', '').trim(), speaker: 'A' });
    } else if (trimmed.startsWith('HOST_B:')) {
      segments.push({ voice: guestVoice, text: trimmed.replace('HOST_B:', '').trim(), speaker: 'B' });
    }
  }

  if (segments.length === 0) throw new Error('No dialogue segments parsed from script');

  // Step 3: Generate audio for each segment
  const audioParts = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const partPath = path.join(OUTPUT_DIR, `podcast-${episodeId}-part${i}.mp3`);
    try {
      await speak(seg.text, { voice: seg.voice, outputPath: partPath });
      audioParts.push(partPath);
    } catch (e) {
      console.error(`[sound-studio] Segment ${i} failed: ${e.message}`);
    }
  }

  if (audioParts.length === 0) throw new Error('No audio segments generated');

  // Step 4: Concatenate audio parts
  const outputPath = path.join(OUTPUT_DIR, `podcast-${topic.replace(/\W+/g, '-').slice(0, 30)}-${episodeId}.mp3`);

  // Create file list for ffmpeg concat
  const listPath = `/tmp/podcast-concat-${episodeId}.txt`;
  fs.writeFileSync(listPath, audioParts.map(p => `file '${p}'`).join('\n'));

  try {
    execSync(`ffmpeg -f concat -safe 0 -i "${listPath}" -y "${outputPath}" 2>/dev/null`, { timeout: 60000 });
  } catch {
    // Fallback: just use first part
    fs.copyFileSync(audioParts[0], outputPath);
  }

  // Cleanup parts
  try { fs.unlinkSync(listPath); } catch {}
  for (const part of audioParts) {
    try { fs.unlinkSync(part); } catch {}
  }

  // Save transcript
  const transcriptPath = path.join(OUTPUT_DIR, `podcast-${topic.replace(/\W+/g, '-').slice(0, 30)}-transcript.md`);
  fs.writeFileSync(transcriptPath, `# Podcast: ${topic}\n\nGenerated: ${new Date().toISOString()}\n\n${script}`);

  const durationMs = Date.now() - startMs;
  console.log(`[sound-studio] Podcast generated: ${path.basename(outputPath)} (${segments.length} segments, ${durationMs}ms)`);

  return { outputPath, transcriptPath, transcript: script, segments: segments.length, durationMs };
}

// ── Status / Listing ────────────────────────────────────────────────────────

/**
 * List recent outputs
 */
export function listOutputs(limit = 10) {
  try {
    const files = fs.readdirSync(OUTPUT_DIR)
      .filter(f => !f.startsWith('.'))
      .map(f => {
        const stats = fs.statSync(path.join(OUTPUT_DIR, f));
        return { name: f, size: stats.size, modified: stats.mtime };
      })
      .sort((a, b) => b.modified - a.modified)
      .slice(0, limit);
    return files;
  } catch {
    return [];
  }
}

/**
 * Format status for Telegram
 */
export function formatStatusTelegram() {
  const outputs = listOutputs(10);
  let msg = '🎙 *Sound Studio*\n\n';

  if (outputs.length === 0) {
    msg += 'No outputs yet. Try:\n';
  } else {
    msg += `*Recent outputs (${outputs.length}):*\n`;
    for (const f of outputs) {
      const size = (f.size / 1024).toFixed(0);
      const date = f.modified.toISOString().split('T')[0];
      const type = f.name.startsWith('transcribe') ? '📝' :
                   f.name.startsWith('voice') || f.name.startsWith('clone') ? '🗣' :
                   f.name.startsWith('instrumental') ? '🎵' :
                   f.name.startsWith('podcast') ? '🎙' : '📁';
      msg += `${type} \`${f.name}\` (${size}KB, ${date})\n`;
    }
  }

  msg += `\n*Commands:*
\`/sound transcribe\` — transcribe attached audio (reply to voice/file)
\`/sound voice <text>\` — generate voiceover
\`/sound clone <text>\` — voiceover in Paul's cloned voice
\`/sound instrumental <description>\` — generate beat
\`/sound podcast <topic>\` — vault → two-voice podcast
\`/sound status\` — this list`;

  return msg;
}

export default {
  transcribe,
  speak,
  speakAsClone,
  generateInstrumental,
  generatePodcast,
  listOutputs,
  formatStatusTelegram,
  VOICES
};
