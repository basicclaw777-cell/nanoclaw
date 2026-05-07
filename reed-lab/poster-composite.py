#!/usr/bin/env python3
"""
Composite real BR/CSOB logos onto poster artwork.
Two-pass pipeline: AI generates art → this script adds real typography.

Usage:
  python3 poster-composite.py <poster.png> [--logo wordmark|badge|circle] [--position top|bottom|both]
  python3 poster-composite.py <poster.png> --full  (wordmark top + HONG KONG + CSOB badge bottom)

Brand colours: Black, White, Burgundy (#8B2020), Olive (#6B7C47)
"""

import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HOME = Path.home()
BRAND_DIR = HOME / "cathedral-vault" / "09_Artifacts" / "branding"
BR_WORDMARK_WHITE = BRAND_DIR / "basic-reflex" / "br-wordmark-white-on-dark-clean.png"
BR_WORDMARK_BLACK = BRAND_DIR / "basic-reflex" / "br-wordmark-black-on-white-clean.png"
CSOB_CIRCLE = BRAND_DIR / "csob" / "csob-circle-clean.png"
CSOB_DISTRESSED = BRAND_DIR / "csob" / "csob-circle-distressed.png"
CSOB_BADGE = BRAND_DIR / "csob" / "csob-badge-oval.png"


def composite_poster(poster_path, output_path=None, mode="full"):
    """Composite real logos onto poster artwork."""
    poster = Image.open(poster_path).convert("RGBA")
    w, h = poster.size

    if mode == "full":
        # Top: BR wordmark (white on dark)
        if BR_WORDMARK_WHITE.exists():
            logo = Image.open(BR_WORDMARK_WHITE).convert("RGBA")
            # Scale to 60% of poster width
            logo_w = int(w * 0.6)
            logo_h = int(logo.height * (logo_w / logo.width))
            logo = logo.resize((logo_w, logo_h), Image.LANCZOS)

            # Position: centered, 5% from top
            x = (w - logo_w) // 2
            y = int(h * 0.04)

            # Paste with alpha
            poster.paste(logo, (x, y), logo)

        # Bottom: HONG KONG text + CSOB badge
        # Draw HONG KONG text
        draw = ImageDraw.Draw(poster)

        # Try to use a decent font
        hk_text = "HONG KONG"
        font_size = int(h * 0.025)
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
        except:
            try:
                font = ImageFont.truetype("/System/Library/Fonts/SFCompact.ttf", font_size)
            except:
                font = ImageFont.load_default()

        bbox = draw.textbbox((0, 0), hk_text, font=font)
        text_w = bbox[2] - bbox[0]
        text_x = (w - text_w) // 2
        text_y = int(h * 0.90)

        # Draw with slight shadow for readability
        draw.text((text_x + 1, text_y + 1), hk_text, fill=(0, 0, 0, 180), font=font)
        draw.text((text_x, text_y), hk_text, fill=(255, 255, 255, 230), font=font)

        # CSOB badge at bottom center
        if CSOB_DISTRESSED.exists():
            badge = Image.open(CSOB_DISTRESSED).convert("RGBA")
            badge_w = int(w * 0.15)
            badge_h = int(badge.height * (badge_w / badge.width))
            badge = badge.resize((badge_w, badge_h), Image.LANCZOS)

            bx = (w - badge_w) // 2
            by = int(h * 0.93)
            poster.paste(badge, (bx, by), badge)

    elif mode == "wordmark":
        if BR_WORDMARK_WHITE.exists():
            logo = Image.open(BR_WORDMARK_WHITE).convert("RGBA")
            logo_w = int(w * 0.55)
            logo_h = int(logo.height * (logo_w / logo.width))
            logo = logo.resize((logo_w, logo_h), Image.LANCZOS)
            x = (w - logo_w) // 2
            y = int(h * 0.04)
            poster.paste(logo, (x, y), logo)

    elif mode == "badge":
        if CSOB_CIRCLE.exists():
            badge = Image.open(CSOB_CIRCLE).convert("RGBA")
            badge_w = int(w * 0.25)
            badge_h = int(badge.height * (badge_w / badge.width))
            badge = badge.resize((badge_w, badge_h), Image.LANCZOS)
            bx = (w - badge_w) // 2
            by = int(h * 0.85)
            poster.paste(badge, (bx, by), badge)

    # Save as RGB JPEG
    if not output_path:
        stem = Path(poster_path).stem
        output_path = Path(poster_path).parent / f"{stem}-branded.jpg"

    poster_rgb = poster.convert("RGB")
    poster_rgb.save(str(output_path), "JPEG", quality=92)
    print(f"Branded poster: {output_path}")
    return str(output_path)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 poster-composite.py <poster.png> [--full|--wordmark|--badge]")
        sys.exit(1)

    poster_path = sys.argv[1]
    mode = "full"
    for arg in sys.argv[2:]:
        if arg in ("--full", "--wordmark", "--badge"):
            mode = arg.replace("--", "")

    composite_poster(poster_path, mode=mode)
