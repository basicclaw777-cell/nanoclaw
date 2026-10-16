#!/usr/bin/env python3
"""Extract Oracle Bone Inscriptions from OBIMD dataset into JSON segments for translation.

Reconstructs Chinese text from character annotations using main-character mapping.
Output: /Volumes/KINGSTON2/cathedral-archive/oracle-bones/extracted/
"""

import json
import os
from collections import defaultdict

OBIMD_DIR = '/Volumes/KINGSTON2/cathedral-archive/oracle-bones/OBIMD'
OUT_DIR = '/Volumes/KINGSTON2/cathedral-archive/oracle-bones/extracted'
os.makedirs(OUT_DIR, exist_ok=True)

SEGMENT_SIZE = 10  # sentences per segment (oracle bones are short)


def main():
    # Load character mapping
    with open(os.path.join(OBIMD_DIR, 'Hierarchical Character Metadata Supplement/Main-character.json')) as f:
        main_chars = json.load(f)
    print(f"Character mapping: {len(main_chars)} characters")

    # Load inscription data
    with open(os.path.join(OBIMD_DIR, 'data.json')) as f:
        data = json.load(f)
    print(f"Inscriptions: {len(data)}")

    # Reconstruct all sentences with metadata
    all_sentences = []
    inscription_stats = {}
    deciphered_count = 0
    undeciphered_count = 0

    for rec in data:
        name = rec['RubbingName']
        for gi, group in enumerate(rec['RecordUtilSentenceGroupVoList']):
            chars_raw = group['RecordUtilOracleCharVoList']
            chars_sorted = sorted(chars_raw, key=lambda c: c['OrderNumber'])

            # Reconstruct text
            text = ''
            char_details = []
            sentence_deciphered = 0
            sentence_undeciphered = 0

            for c in chars_sorted:
                label = c['Label']
                if label in main_chars:
                    char_info = main_chars[label]
                    text += char_info['codepoint']
                    char_details.append({
                        'char': char_info['codepoint'],
                        'transcriptions': char_info.get('transcription', []),
                        'deciphered': True
                    })
                    sentence_deciphered += 1
                else:
                    text += '\u25a1'  # □ placeholder
                    char_details.append({
                        'char': '\u25a1',
                        'label': label,
                        'deciphered': False
                    })
                    sentence_undeciphered += 1

            deciphered_count += sentence_deciphered
            undeciphered_count += sentence_undeciphered

            if not text.strip():
                continue

            sentence = {
                'inscription': name,
                'group': group['GroupCategory'],
                'group_index': gi,
                'text': text,
                'char_count': len(chars_sorted),
                'deciphered_ratio': sentence_deciphered / max(len(chars_sorted), 1),
                'has_undeciphered': sentence_undeciphered > 0,
            }
            all_sentences.append(sentence)

        # Stats per inscription
        total_chars = sum(
            len(g['RecordUtilOracleCharVoList'])
            for g in rec['RecordUtilSentenceGroupVoList']
        )
        inscription_stats[name] = {
            'sentences': len(rec['RecordUtilSentenceGroupVoList']),
            'characters': total_chars
        }

    print(f"\nTotal sentences: {len(all_sentences)}")
    print(f"Deciphered characters: {deciphered_count:,}")
    print(f"Undeciphered characters: {undeciphered_count:,}")
    print(f"Decipherment rate: {deciphered_count / (deciphered_count + undeciphered_count) * 100:.1f}%")

    # Build segments (groups of sentences for batch translation)
    segments = []
    for i in range(0, len(all_sentences), SEGMENT_SIZE):
        batch = all_sentences[i:i + SEGMENT_SIZE]
        segment = {
            'segment_index': i // SEGMENT_SIZE,
            'sentence_offset': i,
            'sentence_count': len(batch),
            'sentences': batch,
            'inscriptions': list(set(s['inscription'] for s in batch)),
            'avg_deciphered_ratio': sum(s['deciphered_ratio'] for s in batch) / len(batch),
        }
        segments.append(segment)

    # Save segments
    segments_file = os.path.join(OUT_DIR, 'obi_segments.json')
    with open(segments_file, 'w', encoding='utf-8') as f:
        json.dump(segments, f, ensure_ascii=False, indent=2)

    # Save stats
    stats = {
        'total_inscriptions': len(data),
        'total_sentences': len(all_sentences),
        'total_segments': len(segments),
        'total_characters': deciphered_count + undeciphered_count,
        'deciphered_characters': deciphered_count,
        'undeciphered_characters': undeciphered_count,
        'decipherment_rate': deciphered_count / (deciphered_count + undeciphered_count),
        'character_mapping_size': len(main_chars),
        'inscriptions': inscription_stats
    }
    stats_file = os.path.join(OUT_DIR, 'obi_stats.json')
    with open(stats_file, 'w', encoding='utf-8') as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)

    # Cost estimate (Chinese → English via DeepSeek)
    avg_chars = sum(len(s['text']) for s in all_sentences) / len(all_sentences)
    cost = len(segments) * avg_chars * SEGMENT_SIZE * (0.14 + 0.28) / 1_000_000 * 2
    print(f"\nSegments: {len(segments)}")
    print(f"Avg chars/sentence: {avg_chars:.1f}")
    print(f"Est. DeepSeek cost: ${cost:.2f}")

    # Top inscriptions by character count
    print(f"\nTop 15 inscriptions by character count:")
    for name, st in sorted(inscription_stats.items(), key=lambda x: -x[1]['characters'])[:15]:
        print(f"  {name:20s} {st['characters']:>6} chars  {st['sentences']:>4} sentences")

    # Sample reconstructed sentences
    print(f"\nSample sentences:")
    for s in all_sentences[:10]:
        d = f"{'*' if s['has_undeciphered'] else ' '}"
        print(f"  {d} [{s['inscription']}] {s['text']}")

    print(f"\nSaved to: {OUT_DIR}")


if __name__ == '__main__':
    main()
