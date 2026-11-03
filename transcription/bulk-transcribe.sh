#!/bin/bash
# Bulk transcriber — processes all iPhone Archive videos with whisper large-v3-turbo
# Single-pass: outputs JSON, derives plain text from JSON.
# Skips already-transcribed files. Resumable.

set -euo pipefail

MODEL="$HOME/models/whisper/ggml-large-v3-turbo.bin"
SOURCE_DIR="$HOME/iPhone-Archive"
OUTPUT_DIR="$HOME/nanoclaw/transcription/transcripts"
INDEX="$HOME/iPhone-Archive/media-index.json"
LOG="$HOME/nanoclaw/transcription/transcribe.log"

mkdir -p "$OUTPUT_DIR"

# Get video list from media-index.json, sorted by duration (shortest first for fast progress)
VIDEOS=$(python3 -c "
import json
d = json.load(open('$INDEX'))
vids = [(x['filename'], x.get('duration_sec') or 0) for x in d if x.get('category') == 'video']
vids.sort(key=lambda x: x[1])
for v, dur in vids:
    print(v)
")

TOTAL=$(echo "$VIDEOS" | wc -l | tr -d ' ')
DONE=0
SKIPPED=0
FAILED=0
START_TIME=$(date +%s)

echo "[bulk-transcribe] Starting: $TOTAL videos, model: large-v3-turbo" | tee -a "$LOG"
echo "[bulk-transcribe] $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$LOG"

while IFS= read -r VIDEO; do
    BASENAME="${VIDEO%.*}"
    JSON_OUT="$OUTPUT_DIR/${BASENAME}.json"
    TXT_OUT="$OUTPUT_DIR/${BASENAME}.txt"

    # Skip if already transcribed
    if [ -f "$JSON_OUT" ] && [ -s "$JSON_OUT" ]; then
        SKIPPED=$((SKIPPED + 1))
        continue
    fi

    DONE=$((DONE + 1))
    REMAINING=$((TOTAL - DONE - SKIPPED))
    echo "[bulk-transcribe] ($DONE/$TOTAL, $REMAINING left) $VIDEO" | tee -a "$LOG"

    # Convert to 16kHz mono WAV
    TMP_WAV="/tmp/whisper-bulk-$$.wav"
    if ! ffmpeg -i "$SOURCE_DIR/$VIDEO" -ar 16000 -ac 1 -c:a pcm_s16le "$TMP_WAV" -y 2>/dev/null; then
        echo "[bulk-transcribe] FAILED (ffmpeg): $VIDEO" | tee -a "$LOG"
        FAILED=$((FAILED + 1))
        rm -f "$TMP_WAV"
        continue
    fi

    # Single whisper pass — JSON with full timestamps
    RAW_OUT="/tmp/whisper-out-$$"
    if ! whisper-cli -m "$MODEL" -f "$TMP_WAV" -l auto --output-json-full -of "$RAW_OUT" 2>/dev/null; then
        echo "[bulk-transcribe] FAILED (whisper): $VIDEO" | tee -a "$LOG"
        FAILED=$((FAILED + 1))
        rm -f "$TMP_WAV" "${RAW_OUT}"* 2>/dev/null
        continue
    fi

    # Move JSON
    if [ -f "${RAW_OUT}.json" ]; then
        mv "${RAW_OUT}.json" "$JSON_OUT"
    fi

    # Derive plain text from JSON (no second whisper pass)
    python3 -c "
import json, sys
try:
    d = json.load(open('$JSON_OUT'))
    segs = d.get('transcription', d.get('segments', []))
    lines = []
    for s in segs:
        ts = s.get('timestamps', {})
        t = s.get('text', '').strip()
        if not t: continue
        start = ts.get('from', '')
        lines.append(f'[{start}] {t}')
    with open('$TXT_OUT', 'w') as f:
        f.write('\n'.join(lines) + '\n')
except Exception as e:
    print(f'[txt-derive] Warning: {e}', file=sys.stderr)
" 2>/dev/null

    rm -f "$TMP_WAV" "${RAW_OUT}"* 2>/dev/null

    NOW=$(date +%s)
    ELAPSED=$((NOW - START_TIME))
    RATE=$(echo "scale=1; $ELAPSED / $DONE" | bc 2>/dev/null || echo "?")
    echo "[bulk-transcribe] OK: $BASENAME (${RATE}s/video avg)" | tee -a "$LOG"

done <<< "$VIDEOS"

rm -f "/tmp/whisper-bulk-$$"* "/tmp/whisper-out-$$"* 2>/dev/null

echo "" | tee -a "$LOG"
echo "[bulk-transcribe] Complete: $DONE transcribed, $SKIPPED skipped, $FAILED failed" | tee -a "$LOG"
echo "[bulk-transcribe] $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$LOG"
