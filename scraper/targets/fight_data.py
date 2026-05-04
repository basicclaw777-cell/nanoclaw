#!/usr/bin/env python3
"""
Fight Database + Content Gap Scrapers
- BoxRec/fight stats → validate against combination validator
- YouTube boxing channels → map against 10-block curriculum → find gaps
"""

import json
import re
from datetime import datetime
from pathlib import Path
from scrapling.fetchers import Fetcher

VAULT_DIR_FIGHT = Path.home() / "cathedral-vault" / "00_Staging" / "scraper-intel" / "fight-data"
VAULT_DIR_GAPS = Path.home() / "cathedral-vault" / "00_Staging" / "scraper-intel" / "content-gaps"
OUTPUT_FILE = Path.home() / "nanoclaw" / "scraper" / "outputs" / "fight-content-latest.json"
CONFIG_PATH = Path.home() / "nanoclaw" / "scraper" / "config.json"

# Paul's 10-block curriculum topics
CURRICULUM_BLOCKS = {
    "block_1": ["stance", "guard", "basic footwork", "jab"],
    "block_2": ["cross", "1-2", "straight punches", "distance"],
    "block_3": ["lead hook", "rear hook", "hooks", "weight transfer"],
    "block_4": ["uppercut", "body shots", "inside fighting"],
    "block_5": ["defensive movement", "slip", "duck", "bob and weave", "pull back"],
    "block_6": ["counter punching", "defense to counter", "timing"],
    "block_7": ["combination work", "3-punch combos", "4-punch combos", "flow"],
    "block_8": ["footwork advanced", "angles", "cutting off ring", "pivots"],
    "block_9": ["sparring", "ring generalship", "fight IQ", "pressure fighting"],
    "block_10": ["conditioning", "periodization", "fight preparation", "peaking"],
}

def scrape_youtube_channels(channels):
    """Scrape YouTube channel video titles to map content coverage."""
    all_videos = []
    for channel in channels:
        try:
            url = f"https://www.youtube.com/@{channel}/videos"
            page = Fetcher.get(url, stealthy_headers=True)
            text = page.text or ""

            titles = re.findall(r'"title":\{"runs":\[\{"text":"([^"]{10,120})"\}', text)
            video_ids = re.findall(r'"videoId":"([a-zA-Z0-9_-]{11})"', text)

            seen = set()
            for i, title in enumerate(titles[:30]):
                vid = video_ids[i] if i < len(video_ids) else ""
                if vid in seen:
                    continue
                seen.add(vid)
                all_videos.append({
                    "channel": channel,
                    "title": title,
                    "url": f"https://youtube.com/watch?v={vid}" if vid else "",
                })

        except Exception as e:
            print(f"  YouTube @{channel} error: {e}")

    return all_videos

def map_to_curriculum(videos):
    """Map video titles to curriculum blocks. Find gaps."""
    coverage = {block: {"videos": [], "count": 0} for block in CURRICULUM_BLOCKS}
    unmapped = []

    for video in videos:
        title_lower = video["title"].lower()
        matched = False

        for block, keywords in CURRICULUM_BLOCKS.items():
            if any(kw in title_lower for kw in keywords):
                coverage[block]["videos"].append(video)
                coverage[block]["count"] += 1
                matched = True
                break

        if not matched:
            unmapped.append(video)

    return coverage, unmapped

def scrape_fight_stats():
    """Scrape recent fight breakdowns from boxing news/stats sites."""
    results = []
    sources = [
        ("https://www.boxingscene.com/results", "boxingscene"),
        ("https://www.ringtv.com/category/news/", "ringtv"),
    ]

    for url, source in sources:
        try:
            page = Fetcher.get(url, stealthy_headers=True, timeout=15)

            for link in page.css("a"):
                href = link.attrib.get("href", "") or ""
                text = link.text or ""
                if len(text) > 20 and any(w in text.lower() for w in ["vs", "fight", "bout", "decision", "ko", "knockout", "result"]):
                    results.append({
                        "source": source,
                        "title": text.strip()[:120],
                        "url": href if href.startswith("http") else url.rstrip("/") + href,
                    })

        except Exception as e:
            print(f"  {source} error: {e}")

    return results[:30]

def deposit_fight_to_vault(fight_results):
    """Write fight data to vault."""
    VAULT_DIR_FIGHT.mkdir(parents=True, exist_ok=True)
    date = datetime.now().strftime("%Y-%m-%d")
    filepath = VAULT_DIR_FIGHT / f"fight-data-{date}.md"

    lines = [
        "---",
        f"title: Fight Data Scan — {date}",
        f"date: {date}",
        "type: scraper-intel",
        "source: boxing news sites",
        f"fights_found: {len(fight_results)}",
        "grade: C",
        "---",
        "",
        f"# Fight Data — {date}",
        "",
    ]

    for r in fight_results:
        lines.append(f"- [{r['title']}]({r['url']}) — {r['source']}")
    lines.append("")
    lines.append("*Run combination analysis on specific fights via /combo command.*")

    filepath.write_text("\n".join(lines))

def deposit_gaps_to_vault(coverage, unmapped, total_videos):
    """Write content gap analysis to vault."""
    VAULT_DIR_GAPS.mkdir(parents=True, exist_ok=True)
    date = datetime.now().strftime("%Y-%m-%d")
    filepath = VAULT_DIR_GAPS / f"content-gaps-{date}.md"

    lines = [
        "---",
        f"title: Boxing Content Gap Analysis — {date}",
        f"date: {date}",
        "type: scraper-intel",
        "source: YouTube boxing channels",
        f"videos_scanned: {total_videos}",
        "grade: A",
        "---",
        "",
        f"# Boxing YouTube Content Gaps — {date}",
        f"**{total_videos} videos scanned across major boxing channels**",
        "",
        "## Coverage by Curriculum Block",
        "",
        "| Block | Topic | Videos Found | Coverage |",
        "|-------|-------|-------------|----------|",
    ]

    for block, data in sorted(coverage.items()):
        keywords = ", ".join(CURRICULUM_BLOCKS[block][:3])
        count = data["count"]
        bar = "█" * min(count, 20)
        level = "SATURATED" if count > 15 else "ADEQUATE" if count > 5 else "THIN" if count > 0 else "GAP"
        lines.append(f"| {block} | {keywords} | {count} | {bar} {level} |")

    lines.append("")

    # Identify gaps
    gaps = [b for b, d in coverage.items() if d["count"] <= 2]
    thin = [b for b, d in coverage.items() if 2 < d["count"] <= 5]
    saturated = [b for b, d in coverage.items() if d["count"] > 15]

    if gaps:
        lines.append(f"## GAPS — Nobody Teaching This ({len(gaps)} blocks)")
        lines.append("")
        for g in gaps:
            lines.append(f"**{g}**: {', '.join(CURRICULUM_BLOCKS[g])}")
            lines.append(f"  → YOUR content opportunity. No competition.")
        lines.append("")

    if thin:
        lines.append(f"## THIN — Underserved ({len(thin)} blocks)")
        lines.append("")
        for t in thin:
            lines.append(f"**{t}**: {', '.join(CURRICULUM_BLOCKS[t])} ({coverage[t]['count']} videos)")
        lines.append("")

    if saturated:
        lines.append(f"## SATURATED — Heavy Competition ({len(saturated)} blocks)")
        lines.append("")
        for s in saturated:
            lines.append(f"**{s}**: {', '.join(CURRICULUM_BLOCKS[s][:2])} ({coverage[s]['count']} videos)")
            lines.append(f"  → Differentiate with Cuban methodology + evidence base, not more of the same.")
        lines.append("")

    filepath.write_text("\n".join(lines))

def run():
    config = json.loads(Path(CONFIG_PATH).read_text())

    print("[fight-data] Scanning fight stats...")
    fight_results = scrape_fight_stats()
    print(f"  {len(fight_results)} fight results")
    deposit_fight_to_vault(fight_results)

    print("[content-gaps] Scanning YouTube channels...")
    channels = config["targets"]["content_gaps"].get("channels", [])
    videos = scrape_youtube_channels(channels)
    print(f"  {len(videos)} videos from {len(channels)} channels")

    coverage, unmapped = map_to_curriculum(videos)
    deposit_gaps_to_vault(coverage, unmapped, len(videos))

    gaps = [b for b, d in coverage.items() if d["count"] <= 2]
    print(f"  Curriculum gaps (≤2 videos): {len(gaps)} blocks")
    for g in gaps:
        print(f"    {g}: {', '.join(CURRICULUM_BLOCKS[g][:3])}")

    # Save raw
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump({
            "date": datetime.now().isoformat(),
            "fights": fight_results,
            "videos": videos,
            "coverage": {k: v["count"] for k, v in coverage.items()},
            "gaps": gaps,
        }, f, indent=2)

    print(f"[fight+content] Done.")
    return {"fights": len(fight_results), "videos": len(videos), "gaps": len(gaps)}

if __name__ == "__main__":
    run()
