#!/usr/bin/env python3
"""
kimi-observer-compare.py — A/B the observer.
Re-runs existing contact sheets through Kimi's vision (Anthropic endpoint) with the
SAME observer prompt gym-eyes-harvest.js uses for DeepSeek, and saves the result as
observations-kimi.json next to the existing observations.json (DeepSeek's).

Usage: python3 kimi-observer-compare.py [--limit N] [--offset M]
"""
import argparse
import base64
import json
import os
import subprocess
import sys
import urllib.request

HOME = os.path.expanduser("~")
API = "https://api.moonshot.ai/anthropic/v1/messages"
MODEL = "kimi-k3.1-pro"
CLASSES = os.path.join(HOME, "nanoclaw", "gym-eyes-classes")

OBSERVER_SYSTEM = """You are a movement observation system analyzing a boxing session contact sheet.
The image shows a chronological sequence of frames. Read left-to-right across each row, then continue on the next row.

Your ONLY job is to report what you SEE. You are NOT a coach. Do NOT give advice.
Report observations as structured JSON.

Return ONLY valid JSON (no markdown fences):
{
  "people_detected": number,
  "activity_type": "padwork|drilling|sparring|movement|rest|instruction|unclear",
  "intensity": "low|medium|high",
  "fighter_stance": "orthodox|southpaw|unclear|multiple",
  "segments": [
    {"frames": "F1-F5", "time": "0.0s-1.3s", "observations": {"footwork": "...", "stance_width": "...", "guard": "...", "upper_body": "...", "distance": "...", "notable": "..."}}
  ],
  "movement_events": [
    {"frames": "F7-F9", "type": "punch_preparation|punch_extension|punch_recovery|step|pivot|slip|guard_drop|stance_change|distance_close|distance_open|reset|instruction_pause", "detail": "..."}
  ],
  "overall_rhythm": "steady|accelerating|decelerating|burst_then_rest|choppy|fluid|inactive"
}"""


def get_key():
    return subprocess.check_output(
        ["security", "find-generic-password", "-a", "basicclaw777", "-s", "kimi-api-key", "-w"]
    ).decode().strip()


def observe(sheet_path):
    with open(sheet_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    content = [
        {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b64}},
        {"type": "text", "text": "Contact sheet. Report what you observe as structured JSON."}
    ]
    payload = json.dumps({"model": MODEL, "max_tokens": 8000, "stream": True, "system": OBSERVER_SYSTEM,
                          "messages": [{"role": "user", "content": content}]}).encode()
    req = urllib.request.Request(API, data=payload, headers={
        "Authorization": "Bearer " + get_key(), "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r:
        buf = r.read().decode()
    text = []
    for line in buf.splitlines():
        line = line.strip()
        if not line.startswith("data:"):
            continue
        d = line[5:].strip()
        if d == "[DONE]":
            break
        try:
            obj = json.loads(d)
        except Exception:
            continue
        if obj.get("type") == "content_block_delta":
            dd = obj.get("delta", {})
            if dd.get("type") == "text_delta":
                text.append(dd.get("text", ""))
    raw = "".join(text).strip()
    cleaned = raw.replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(cleaned)
    except Exception:
        return {"raw": raw}


def find_sheets():
    out = []
    for root, dirs, files in os.walk(CLASSES):
        if "contact-sheet.jpg" in files:
            out.append(os.path.join(root, "contact-sheet.jpg"))
    return sorted(out)


def brief(obs):
    if not isinstance(obs, dict):
        return "raw"
    parts = []
    for k in ("activity_type", "people_detected", "intensity", "overall_rhythm"):
        if obs.get(k) is not None:
            parts.append(f"{k}={obs[k]}")
    segs = obs.get("segments") or []
    guard = ""
    if segs and isinstance(segs[0], dict):
        g = (segs[0].get("observations") or {}).get("guard", "")
        guard = g[:60]
    return "; ".join(parts) + (f" | guard: {guard}" if guard else "")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--offset", type=int, default=0)
    args = ap.parse_args()

    sheets = find_sheets()
    if args.limit:
        sheets = sheets[args.offset:args.offset + args.limit]
    print(f"{len(sheets)} sheets to observe (of {len(find_sheets())} total)\n")

    for i, sheet in enumerate(sheets):
        wdir = os.path.dirname(sheet)
        deepseek_path = os.path.join(wdir, "observations.json")
        kimi_path = os.path.join(wdir, "observations-kimi.json")
        if os.path.exists(kimi_path):
            print(f"[{i+1}/{len(sheets)}] SKIP (already done): {os.path.basename(wdir)}")
            continue
        deepseek = {}
        if os.path.exists(deepseek_path):
            try:
                deepseek = json.load(open(deepseek_path))
            except Exception:
                pass
        print(f"[{i+1}/{len(sheets)}] observing {os.path.basename(wdir)} …", file=sys.stderr)
        kimi = observe(sheet)
        with open(kimi_path, "w") as f:
            json.dump(kimi, f, indent=2)
        print(f"[{i+1}/{len(sheets)}] {os.path.basename(wdir)}")
        print(f"   DeepSeek: {brief(deepseek)}")
        print(f"   Kimi:     {brief(kimi)}")


if __name__ == "__main__":
    main()
