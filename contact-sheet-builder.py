#!/usr/bin/env python3
"""Build a labeled contact sheet from frame images. Called by boxing-contact-sheet.js."""
import sys, json, os
from PIL import Image, ImageDraw, ImageFont

frames = json.loads(sys.argv[1])
fps = int(sys.argv[2])
out_path = sys.argv[3]

n = len(frames)
COLS = min(5, n)
ROWS = (n + COLS - 1) // COLS
THUMB_W, THUMB_H = 320, 240
MARGIN = 4
LABEL_H = 24
BG = (30, 30, 30)

total_w = COLS * THUMB_W + (COLS + 1) * MARGIN
total_h = ROWS * (THUMB_H + LABEL_H) + (ROWS + 1) * MARGIN

canvas = Image.new("RGB", (total_w, total_h), BG)
draw = ImageDraw.Draw(canvas)

try:
    font = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 16)
except Exception:
    font = ImageFont.load_default()

for idx, fpath in enumerate(frames):
    col = idx % COLS
    row = idx // COLS
    x = MARGIN + col * (THUMB_W + MARGIN)
    y = MARGIN + row * (THUMB_H + LABEL_H + MARGIN)
    t = idx / fps

    img = Image.open(fpath).resize((THUMB_W, THUMB_H), Image.LANCZOS)
    canvas.paste(img, (x, y))

    draw.rectangle([x, y + THUMB_H, x + THUMB_W, y + THUMB_H + LABEL_H], fill=(50, 50, 50))
    draw.text((x + 6, y + THUMB_H + 3), f"F{idx+1}  {t:.1f}s", fill=(255, 220, 50), font=font)

canvas.save(out_path, quality=75)
print(json.dumps({"width": total_w, "height": total_h, "frames": n, "path": out_path, "size_kb": os.path.getsize(out_path) // 1024}))
