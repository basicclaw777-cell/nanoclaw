#!/usr/bin/env python3
"""
Competitor Gym Scraper — HK boxing/martial arts landscape
Scrapes gym websites for class schedules, pricing, positioning.
Google Maps for reviews and ratings.
"""

import json
import os
import re
from datetime import datetime
from pathlib import Path
from scrapling.fetchers import Fetcher

VAULT_DIR = Path.home() / "cathedral-vault" / "00_Staging" / "scraper-intel" / "competitors"
OUTPUT_FILE = Path.home() / "nanoclaw" / "scraper" / "outputs" / "competitors-latest.json"
CONFIG_PATH = Path.home() / "nanoclaw" / "scraper" / "config.json"

def load_config():
    with open(CONFIG_PATH) as f:
        return json.load(f)["targets"]["competitor_gyms"]

def scrape_gym_website(name, url):
    """Scrape a gym website for key info."""
    result = {
        "name": name,
        "url": url,
        "scraped_date": datetime.now().isoformat()[:10],
        "classes": [],
        "pricing_mentions": [],
        "positioning": [],
        "error": None,
    }

    try:
        page = Fetcher.get(url, stealthy_headers=True, timeout=15)

        # Extract all text
        text = page.get_all_text() if hasattr(page, 'get_all_text') else ""
        if not text:
            text = " ".join([el.text for el in page.css("p, h1, h2, h3, li, span, div") if el.text])

        text_lower = text.lower()

        # Find class types
        class_keywords = ["boxing", "muay thai", "kickboxing", "mma", "bjj", "jiu jitsu",
                         "fitness", "conditioning", "sparring", "pad work", "bag work",
                         "kids", "women", "beginner", "advanced", "morning", "evening",
                         "bootcamp", "hiit", "circuit", "personal training", "private"]
        for kw in class_keywords:
            if kw in text_lower:
                result["classes"].append(kw)

        # Find pricing mentions
        price_patterns = [
            r'HK\$[\d,]+', r'\$[\d,]+', r'[\d,]+\s*(?:per|/)\s*(?:month|session|class)',
            r'(?:unlimited|monthly|drop.?in|trial|pack)\s*(?:[:—-])?\s*(?:HK)?\$?[\d,]+'
        ]
        for pattern in price_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            result["pricing_mentions"].extend(matches[:5])

        # Positioning keywords
        positioning_keywords = ["cuban", "traditional", "fitness boxing", "competitive",
                               "amateur", "professional", "self defence", "weight loss",
                               "fun", "no experience", "all levels", "champion", "olympic"]
        for kw in positioning_keywords:
            if kw in text_lower:
                result["positioning"].append(kw)

        # Schedule page
        for link in page.css("a"):
            href = (link.attrib.get("href", "") or "").lower()
            link_text = (link.text or "").lower()
            if any(w in href + link_text for w in ["schedule", "timetable", "class"]):
                schedule_url = href if href.startswith("http") else url.rstrip("/") + "/" + href.lstrip("/")
                try:
                    sched_page = Fetcher.get(schedule_url, stealthy_headers=True, timeout=10)
                    sched_text = " ".join([el.text for el in sched_page.css("td, th, p, li, span") if el.text])
                    # Extract time patterns
                    times = re.findall(r'\d{1,2}[:.]\d{2}\s*(?:am|pm|AM|PM)?', sched_text)
                    if times:
                        result["schedule_times"] = list(set(times))[:20]
                except:
                    pass
                break

    except Exception as e:
        result["error"] = str(e)

    return result

def scrape_google_reviews(gym_name):
    """Scrape Google search for gym reviews summary."""
    try:
        query = f"{gym_name} Hong Kong reviews"
        url = f"https://www.google.com/search?q={query.replace(' ', '+')}"
        page = Fetcher.get(url, stealthy_headers=True)

        text = " ".join([el.text for el in page.css("span, div") if el.text])

        # Extract rating
        rating_match = re.search(r'(\d\.\d)\s*(?:out of 5|stars?|rating)', text, re.IGNORECASE)
        review_count = re.search(r'(\d+)\s*(?:reviews?|google reviews?)', text, re.IGNORECASE)

        return {
            "rating": float(rating_match.group(1)) if rating_match else None,
            "review_count": int(review_count.group(1)) if review_count else None,
        }
    except:
        return {"rating": None, "review_count": None}

def deposit_to_vault(results):
    """Write competitor analysis to vault."""
    VAULT_DIR.mkdir(parents=True, exist_ok=True)
    date = datetime.now().strftime("%Y-%m-%d")
    filepath = VAULT_DIR / f"competitor-landscape-{date}.md"

    lines = [
        "---",
        f"title: HK Boxing Gym Landscape — {date}",
        f"date: {date}",
        "type: scraper-intel",
        "source: gym websites + google",
        f"gyms_scanned: {len(results)}",
        "grade: B",
        "---",
        "",
        f"# HK Boxing Gym Landscape — {date}",
        "",
    ]

    # Comparison table
    lines.append("| Gym | Classes | Pricing | Rating | Positioning |")
    lines.append("|-----|---------|---------|--------|-------------|")
    for r in results:
        classes = ", ".join(r.get("classes", [])[:5]) or "—"
        pricing = "; ".join(r.get("pricing_mentions", [])[:3]) or "—"
        rating = str(r.get("google_rating", "—"))
        positioning = ", ".join(r.get("positioning", [])[:3]) or "—"
        lines.append(f"| {r['name']} | {classes} | {pricing} | {rating} | {positioning} |")
    lines.append("")

    # Gaps analysis
    all_classes = set()
    for r in results:
        all_classes.update(r.get("classes", []))

    lines.append("## MARKET GAPS")
    lines.append("")
    lines.append("Classes offered across landscape:")
    for cls in sorted(all_classes):
        count = sum(1 for r in results if cls in r.get("classes", []))
        bar = "█" * count
        lines.append(f"  {cls:20s} {bar} ({count}/{len(results)})")
    lines.append("")

    # What nobody offers
    rare = [cls for cls in all_classes if sum(1 for r in results if cls in r.get("classes", [])) <= 1]
    if rare:
        lines.append(f"**Rare offerings (≤1 gym):** {', '.join(rare)}")
        lines.append("")

    # Detail per gym
    for r in results:
        lines.append(f"## {r['name']}")
        lines.append(f"URL: {r['url']}")
        if r.get("error"):
            lines.append(f"**Error:** {r['error']}")
        if r.get("classes"):
            lines.append(f"Classes: {', '.join(r['classes'])}")
        if r.get("pricing_mentions"):
            lines.append(f"Pricing: {'; '.join(r['pricing_mentions'])}")
        if r.get("positioning"):
            lines.append(f"Positioning: {', '.join(r['positioning'])}")
        if r.get("schedule_times"):
            lines.append(f"Schedule times: {', '.join(r['schedule_times'][:10])}")
        if r.get("google_rating"):
            lines.append(f"Google: {r['google_rating']} ({r.get('google_reviews', '?')} reviews)")
        lines.append("")

    filepath.write_text("\n".join(lines))

def run():
    config = load_config()
    gyms = config["gyms"]

    print(f"[competitor-gyms] Scanning {len(gyms)} gyms...")
    results = []

    for gym in gyms:
        print(f"  {gym['name']}...")
        result = scrape_gym_website(gym["name"], gym["url"])

        # Google reviews
        reviews = scrape_google_reviews(gym["name"])
        result["google_rating"] = reviews["rating"]
        result["google_reviews"] = reviews["review_count"]

        results.append(result)

    # Save raw
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump({"date": datetime.now().isoformat(), "results": results}, f, indent=2)

    deposit_to_vault(results)
    print(f"[competitor-gyms] Done. {len(results)} gyms analysed.")
    return {"count": len(results), "results": results}

if __name__ == "__main__":
    run()
