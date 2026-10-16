#!/usr/bin/env python3
"""Extract Dead Sea Scrolls from Text-Fabric into JSON segments for translation.

Uses text-fabric API for proper node containment. 1,001 scrolls, ~500K words.
Output: /Volumes/KINGSTON2/cathedral-archive/dead-sea-scrolls/extracted/
"""

import json
import os
from collections import defaultdict

TF_DIR = '/Volumes/KINGSTON2/cathedral-archive/dead-sea-scrolls/etcbc-dss/tf/2.0'
OUT_DIR = '/Volumes/KINGSTON2/cathedral-archive/dead-sea-scrolls/extracted'
os.makedirs(OUT_DIR, exist_ok=True)

SEGMENT_SIZE = 50  # words per segment


def main():
    from tf.fabric import Fabric

    print("Loading Text-Fabric...")
    TF = Fabric(locations=TF_DIR, silent='deep')
    api = TF.load('glyph full scroll book chapter fragment lang sp lex after', silent='deep')
    F = api.F
    L = api.L

    scrolls = F.otype.s('scroll')
    print(f"Scrolls: {len(scrolls)}")
    print(f"Total words: {len(F.otype.s('word'))}")

    all_segments = []
    scroll_stats = {}

    for s_node in scrolls:
        scroll_name = F.scroll.v(s_node) or f'scroll_{s_node}'
        words = L.d(s_node, otype='word')

        if not words:
            continue

        # Stats
        lang_counts = defaultdict(int)
        books_seen = set()
        for w in words:
            lg = F.lang.v(w) or 'h'
            lang_name = 'hebrew' if lg == 'h' else 'aramaic' if lg == 'a' else 'greek' if lg == 'g' else lg
            lang_counts[lang_name] += 1
            b = F.book.v(w)
            if b:
                books_seen.add(b)

        scroll_stats[scroll_name] = {
            'word_count': len(words),
            'books': sorted(books_seen),
            'languages': dict(lang_counts)
        }

        # Build segments
        for i in range(0, len(words), SEGMENT_SIZE):
            chunk = words[i:i + SEGMENT_SIZE]

            # Reconstruct text
            text_parts = []
            for w in chunk:
                g = F.glyph.v(w)
                if g:
                    text_parts.append(g)
                a = F.after.v(w) or ' '
                text_parts.append(a)
            text = ''.join(text_parts).strip()

            # Full text with brackets
            full_parts = []
            for w in chunk:
                fl = F.full.v(w) or F.glyph.v(w) or ''
                full_parts.append(fl)
                a = F.after.v(w) or ' '
                full_parts.append(a)
            full_text = ''.join(full_parts).strip()

            # Primary language
            langs = [F.lang.v(w) or 'h' for w in chunk]
            primary = max(set(langs), key=langs.count)
            primary_lang = 'hebrew' if primary == 'h' else 'aramaic' if primary == 'a' else 'greek'

            segment = {
                'scroll': scroll_name,
                'segment_index': i // SEGMENT_SIZE,
                'word_offset': i,
                'word_count': len(chunk),
                'text': text,
                'full_text': full_text,
                'primary_language': primary_lang,
                'books': sorted(set(F.book.v(w) for w in chunk if F.book.v(w))),
            }
            all_segments.append(segment)

    # Save
    segments_file = os.path.join(OUT_DIR, 'dss_segments.json')
    with open(segments_file, 'w', encoding='utf-8') as f:
        json.dump(all_segments, f, ensure_ascii=False, indent=2)

    stats_file = os.path.join(OUT_DIR, 'dss_stats.json')
    stats = {
        'total_scrolls': len(scroll_stats),
        'total_words': sum(s['word_count'] for s in scroll_stats.values()),
        'total_segments': len(all_segments),
        'scrolls': scroll_stats
    }
    with open(stats_file, 'w', encoding='utf-8') as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)

    total_words = stats['total_words']
    hebrew = sum(s['languages'].get('hebrew', 0) for s in scroll_stats.values())
    aramaic = sum(s['languages'].get('aramaic', 0) for s in scroll_stats.values())

    print(f"\nExtraction complete:")
    print(f"  Total words: {total_words:,}")
    print(f"  Hebrew: {hebrew:,}")
    print(f"  Aramaic: {aramaic:,}")
    print(f"  Scrolls: {len(scroll_stats)}")
    print(f"  Segments: {len(all_segments):,}")

    cost = len(all_segments) * 80 * (0.14 + 0.28) / 1_000_000 * 2
    print(f"  Est. DeepSeek cost: ${cost:.2f}")

    print(f"\nTop 15 scrolls by word count:")
    for name, st in sorted(scroll_stats.items(), key=lambda x: -x[1]['word_count'])[:15]:
        print(f"  {name:30s} {st['word_count']:>8,} words  [{', '.join(st['books'][:3]) or 'non-biblical'}]")

    print(f"\nSaved to: {OUT_DIR}")


if __name__ == '__main__':
    main()
