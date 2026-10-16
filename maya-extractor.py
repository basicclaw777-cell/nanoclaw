#!/usr/bin/env python3
"""Extract Maya texts into JSON segments for entity extraction and cross-corpus analysis.

Sources: Popol Vuh, Maya Chronicles, Ritual of the Bacabs, Day Symbols, plus Popol Vuh (Gutenberg).
All English translations in public domain.
Output: /Volumes/KINGSTON2/cathedral-archive/maya/extracted/
"""

import json
import os
import re

SOURCE_DIR = '/Volumes/KINGSTON2/cathedral-archive/maya/sources'
OUT_DIR = '/Volumes/KINGSTON2/cathedral-archive/maya/extracted'
os.makedirs(OUT_DIR, exist_ok=True)

SEGMENT_SIZE = 200  # words per segment (English text, needs less granularity)


def clean_gutenberg(text):
    """Strip Project Gutenberg header/footer."""
    start = re.search(r'\*\*\* START OF .+? \*\*\*', text)
    end = re.search(r'\*\*\* END OF .+? \*\*\*', text)
    if start:
        text = text[start.end():]
    if end:
        text = text[:end.start()]
    return text.strip()


def segment_text(text, source_name, segment_size=SEGMENT_SIZE):
    """Split text into word-count segments."""
    # Clean up
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r'[ \t]+', ' ', text)

    words = text.split()
    segments = []

    for i in range(0, len(words), segment_size):
        chunk = words[i:i + segment_size]
        segment_text = ' '.join(chunk)

        # Try to detect section/chapter context
        # Look backwards for chapter markers
        preceding = ' '.join(words[max(0, i-50):i])
        chapter = ''
        ch_match = re.search(r'(?:CHAPTER|BOOK|PART|SECTION|CHANT)\s+[IVXLCDM\d]+', preceding, re.I)
        if ch_match:
            chapter = ch_match.group(0)

        segments.append({
            'source': source_name,
            'segment_index': i // segment_size,
            'word_offset': i,
            'word_count': len(chunk),
            'text': segment_text,
            'chapter': chapter,
        })

    return segments


def main():
    sources = [
        ('popol_vuh', 'popol-vuh.txt', 'Popol Vuh (Goetz/Morley 1954)', True),
        ('popol_vuh_spence', 'popol-vuh-gutenberg.txt', 'Popol Vuh (Lewis Spence, Gutenberg)', True),
        ('maya_chronicles', 'maya-chronicles-brinton.txt', 'Maya Chronicles (Brinton)', True),
        ('ritual_bacabs', 'ritual-of-bacabs.txt', 'Ritual of the Bacabs (Bolles/Roys)', False),
        ('day_symbols', 'day-symbols-maya.txt', 'Day Symbols of the Maya Year (Thomas)', True),
    ]

    all_segments = []
    source_stats = {}

    for key, filename, description, is_gutenberg in sources:
        filepath = os.path.join(SOURCE_DIR, filename)
        if not os.path.exists(filepath):
            print(f"Skipping {key} — file not found: {filepath}")
            continue

        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            text = f.read()

        if is_gutenberg:
            text = clean_gutenberg(text)

        word_count = len(text.split())
        segments = segment_text(text, key)

        source_stats[key] = {
            'description': description,
            'word_count': word_count,
            'segments': len(segments),
            'chars': len(text)
        }

        all_segments.extend(segments)
        print(f"  {key}: {word_count:,} words → {len(segments)} segments")

    # Save segments
    segments_file = os.path.join(OUT_DIR, 'maya_segments.json')
    with open(segments_file, 'w', encoding='utf-8') as f:
        json.dump(all_segments, f, ensure_ascii=False, indent=2)

    # Save stats
    total_words = sum(s['word_count'] for s in source_stats.values())
    stats = {
        'total_sources': len(source_stats),
        'total_words': total_words,
        'total_segments': len(all_segments),
        'sources': source_stats
    }
    stats_file = os.path.join(OUT_DIR, 'maya_stats.json')
    with open(stats_file, 'w', encoding='utf-8') as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)

    # Cost estimate (entity extraction only — already in English)
    cost = len(all_segments) * 200 * (0.14 + 0.28) / 1_000_000 * 2
    print(f"\nTotal words: {total_words:,}")
    print(f"Total segments: {len(all_segments)}")
    print(f"Est. DeepSeek cost (entity extraction): ${cost:.2f}")
    print(f"\nSaved to: {OUT_DIR}")


if __name__ == '__main__':
    main()
