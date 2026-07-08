import torch
import torchaudio
import os
import sys

# Patch Perth watermarker — binary not available on ARM Mac
import perth
class _DummyWatermarker:
    def apply(self, wav, sr): return wav
    def apply_watermark(self, wav, sample_rate=None): return wav
    def detect(self, wav, sr): return None
    def detect_watermark(self, wav, sample_rate=None): return None
perth.PerthImplicitWatermarker = _DummyWatermarker

from chatterbox.tts import ChatterboxTTS

AUDIO_DIR = os.path.expanduser("~/nanoclaw/vortex_data/episode-audio")
SCRIPTS = ["the-architect", "the-crises", "the-principles"]

device = "mps" if torch.backends.mps.is_available() else "cpu"
print(f"Loading Chatterbox on {device}...")
model = ChatterboxTTS.from_pretrained(device=device)
print("Model loaded.\n")

for name in SCRIPTS:
    txt_path = os.path.join(AUDIO_DIR, f"{name}.txt")
    wav_path = os.path.join(AUDIO_DIR, f"{name}.wav")
    mp3_path = os.path.join(AUDIO_DIR, f"{name}.mp3")

    with open(txt_path) as f:
        text = f.read().replace("**", "").replace("*", "")

    print(f"=== {name} ({len(text)} chars) ===")

    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip() and len(p.strip()) > 10]
    all_wavs = []

    for i, para in enumerate(paragraphs):
        print(f"  Para {i+1}/{len(paragraphs)}: {para[:50]}...")
        wav = model.generate(para, exaggeration=0.4, cfg_weight=0.5)
        all_wavs.append(wav)
        pause = torch.zeros(1, int(model.sr * 0.6))
        all_wavs.append(pause)

    full_wav = torch.cat(all_wavs, dim=1)
    torchaudio.save(wav_path, full_wav, model.sr)
    duration = full_wav.shape[1] / model.sr
    print(f"  WAV: {wav_path} ({duration:.1f}s)")

    os.system(f'ffmpeg -y -i "{wav_path}" -b:a 128k "{mp3_path}" 2>/dev/null')
    print(f"  MP3: {mp3_path}\n")

print("All 3 done.")
