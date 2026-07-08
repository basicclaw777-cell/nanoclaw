import torch
import torchaudio

# Patch Perth watermarker — binary not available on ARM Mac
import perth
class _DummyWatermarker:
    def apply(self, wav, sr): return wav
    def apply_watermark(self, wav, sample_rate=None): return wav
    def detect(self, wav, sr): return None
    def detect_watermark(self, wav, sample_rate=None): return None
perth.PerthImplicitWatermarker = _DummyWatermarker

from chatterbox.tts import ChatterboxTTS
import sys
import os

TEXT_FILE = os.path.expanduser("~/nanoclaw/vortex_data/episode-audio/cathedral-story.txt")
OUTPUT_FILE = os.path.expanduser("~/nanoclaw/vortex_data/episode-audio/cathedral-story-chatterbox.wav")

with open(TEXT_FILE) as f:
    text = f.read()

# Strip markdown bold markers for cleaner speech
text = text.replace("**", "")

print(f"Text: {len(text)} chars")
print("Loading Chatterbox model (first run downloads ~1.5GB)...")

device = "mps" if torch.backends.mps.is_available() else "cpu"
model = ChatterboxTTS.from_pretrained(device=device)

print(f"Model loaded on {device}")
print("Generating speech...")

# Split into chunks at paragraph boundaries for better quality
paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
all_wavs = []

for i, para in enumerate(paragraphs):
    if len(para) < 10:
        continue
    print(f"  Paragraph {i+1}/{len(paragraphs)}: {para[:60]}...")
    wav = model.generate(para, exaggeration=0.4, cfg_weight=0.5)
    all_wavs.append(wav)
    # Add a short pause between paragraphs
    pause = torch.zeros(1, int(model.sr * 0.6))
    all_wavs.append(pause)

# Concatenate all chunks
full_wav = torch.cat(all_wavs, dim=1)

torchaudio.save(OUTPUT_FILE, full_wav, model.sr)
print(f"\nSaved: {OUTPUT_FILE}")
print(f"Duration: {full_wav.shape[1] / model.sr:.1f}s")

# Convert to mp3 for Telegram
mp3_path = OUTPUT_FILE.replace(".wav", ".mp3")
os.system(f'ffmpeg -y -i "{OUTPUT_FILE}" -b:a 128k "{mp3_path}" 2>/dev/null')
print(f"MP3: {mp3_path}")
