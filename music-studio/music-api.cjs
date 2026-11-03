const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const router = express.Router();
const MUSIC_DIR = path.join(__dirname, 'tracks');

if (!fs.existsSync(MUSIC_DIR)) fs.mkdirSync(MUSIC_DIR, { recursive: true });

router.get('/health', async (req, res) => {
  try {
    const resp = await fetch('http://localhost:7865/info');
    res.json({ online: resp.ok, engine: 'ace-step-1.5' });
  } catch {
    res.json({ online: false, engine: 'ace-step-1.5' });
  }
});

router.post('/generate', async (req, res) => {
  const { prompt, lyrics, duration, steps, guidance, seed } = req.body;
  if (!prompt) return res.json({ success: false, error: 'No prompt provided' });

  const actualSeed = seed === -1 ? Math.floor(Math.random() * 2147483647) : seed;
  const trackId = crypto.randomBytes(4).toString('hex');
  const outputFile = path.join(MUSIC_DIR, `track-${trackId}.wav`);
  const startTime = Date.now();

  try {
    const result = await callGradio({
      prompt,
      lyrics: lyrics || '',
      duration: duration || 60,
      steps: steps || 100,
      guidance: guidance || 15,
      seed: actualSeed,
      outputFile
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    res.json({
      success: true,
      url: `/api/music-studio/tracks/${path.basename(outputFile)}`,
      title: prompt.slice(0, 60),
      duration: duration || 60,
      steps: steps || 100,
      seed: actualSeed,
      elapsed,
      trackId
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.get('/tracks/:filename', (req, res) => {
  const file = path.join(MUSIC_DIR, path.basename(req.params.filename));
  if (fs.existsSync(file)) {
    res.sendFile(file);
  } else {
    res.status(404).json({ error: 'Track not found' });
  }
});

router.get('/library', (req, res) => {
  try {
    const files = fs.readdirSync(MUSIC_DIR)
      .filter(f => f.endsWith('.wav'))
      .map(f => {
        const stat = fs.statSync(path.join(MUSIC_DIR, f));
        return { filename: f, url: `/api/music-studio/tracks/${f}`, size: stat.size, created: stat.birthtime };
      })
      .sort((a, b) => b.created - a.created);
    res.json({ tracks: files });
  } catch {
    res.json({ tracks: [] });
  }
});

async function callGradio({ prompt, lyrics, duration, steps, guidance, seed, outputFile }) {
  const pyScript = `
import sys, json, os
os.environ["CUDA_VISIBLE_DEVICES"] = "0"

from acestep.pipeline_ace_step import ACEStepPipeline

pipe = ACEStepPipeline(dtype="float32")

result = pipe(
    ${duration},                    # audio_duration
    "${prompt.replace(/"/g, '\\"')}",  # prompt
    """${lyrics.replace(/"""/g, "\\\"\\\"\\\"").replace(/\\/g, "\\\\")}""",  # lyrics
    ${steps},                       # infer_step
    ${guidance},                    # guidance_scale
    "euler",                        # scheduler_type
    "apg",                          # cfg_type
    10.0,                           # omega_scale
    "${seed}",                      # manual_seeds
    0.5,                            # guidance_interval
    0.0,                            # guidance_interval_decay
    2.0,                            # min_guidance_scale
    True,                           # use_erg_tag
    True,                           # use_erg_lyric
    True,                           # use_erg_diffusion
    "",                             # oss_steps
    0.0,                            # guidance_scale_text
    0.0,                            # guidance_scale_lyric
    save_path="${outputFile}"
)
print(json.dumps({"success": True}))
`;

  return new Promise((resolve, reject) => {
    const py = spawn(
      path.join(process.env.HOME, 'acestep-venv', 'bin', 'python3'),
      ['-c', pyScript],
      { timeout: 600000, env: { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: '1' } }
    );

    let stdout = '', stderr = '';
    py.stdout.on('data', d => stdout += d);
    py.stderr.on('data', d => stderr += d);
    py.on('close', code => {
      if (code === 0 && fs.existsSync(outputFile)) {
        resolve({ success: true });
      } else {
        reject(new Error(stderr.slice(-500) || `Process exited with code ${code}`));
      }
    });
    py.on('error', err => reject(err));
  });
}

module.exports = router;
