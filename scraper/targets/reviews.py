#!/usr/bin/env python3
"""
Own Review Tracker + Cross-Sport Scraper
- Google/FB reviews for Basic Reflex → Kit morning briefing
- Cross-sport conditioning research → Muse cross-domain bridges
"""

import json
import re
from datetime import datetime
from pathlib import Path
from scrapling.fetchers import Fetcher

VAULT_DIR_REVIEWS = Path.home() / "cathedral-vault" / "00_Staging" / "scraper-intel" / "reviews"
VAULT_DIR_SPORT = Path.home() / "cathedral-vault" / "00_Staging" / "scraper-intel" / "cross-sport"
OUTPUT_FILE = Path.home() / "nanoclaw" / "scraper" / "outputs" / "reviews-sport-latest.json"
CONFIG_PATH = Path.home() / "nanoclaw" / "scraper" / "config.json"

def scrape_google_reviews(gym_name="Basic Reflex Hong Kong"):
    """Scrape Google for gym reviews."""
    results = {"rating": None, "review_count": None, "recent_reviews": [], "keywords": []}

    try:
        url = f"https://www.google.com/search?q={gym_name.replace(' ', '+')}+reviews"
        page = Fetcher.get(url, stealthy_headers=True)
        text = " ".join([el.text for el in page.css("span, div") if el.text])

        # Rating
        rating_match = re.search(r'(\d\.\d)\s*(?:out of|/)\s*5', text)
        if rating_match:
            results["rating"] = float(rating_match.group(1))

        # Review count
        count_match = re.search(r'(\d+)\s*(?:Google\s*)?reviews?', text, re.IGNORECASE)
        if count_match:
            results["review_count"] = int(count_match.group(1))

        # Extract review snippets
        review_patterns = page.css("[data-review-id], .review-text, .wiI7pd")
        for rev in review_patterns[:10]:
            text = rev.text or ""
            if len(text) > 20:
                results["recent_reviews"].append(text[:300])

        # Keyword extraction from reviews
        all_review_text = " ".join(results["recent_reviews"]).lower()
        keyword_candidates = ["friendly", "technical", "professional", "clean", "fun",
                            "footwork", "sparring", "beginner", "advanced", "expensive",
                            "schedule", "location", "coach", "trainer", "atmosphere",
                            "parking", "shower", "equipment", "music", "crowded"]
        for kw in keyword_candidates:
            count = all_review_text.count(kw)
            if count > 0:
                results["keywords"].append({"word": kw, "count": count})

        results["keywords"].sort(key=lambda x: x["count"], reverse=True)

    except Exception as e:
        results["error"] = str(e)

    return results

def scrape_cross_sport_research(sports, search_terms):
    """Scrape for cross-sport conditioning and technique research."""
    results = []

    for term in search_terms + sports:
        try:
            url = f"https://scholar.google.com/scholar?q={term.replace(' ', '+')}&as_ylo={datetime.now().year - 1}"
            page = Fetcher.get(url, stealthy_headers=True)

            for item in page.css(".gs_ri"):
                title_el = item.css("h3 a")
                if not title_el:
                    continue

                snippet_el = item.css(".gs_rs")
                info_el = item.css(".gs_a")

                results.append({
                    "title": title_el[0].text or "",
                    "url": title_el[0].attrib.get("href", ""),
                    "authors": info_el[0].text if info_el else "",
                    "snippet": snippet_el[0].text[:300] if snippet_el else "",
                    "search_term": term,
                    "source": "google_scholar",
                })

        except Exception as e:
            print(f"  Scholar '{term}' error: {e}")

    return results

def deposit_reviews_to_vault(reviews):
    """Write review tracking to vault."""
    VAULT_DIR_REVIEWS.mkdir(parents=True, exist_ok=True)
    date = datetime.now().strftime("%Y-%m-%d")
    filepath = VAULT_DIR_REVIEWS / f"br-reviews-{date}.md"

    lines = [
        "---",
        f"title: Basic Reflex Review Tracker — {date}",
        f"date: {date}",
        "type: scraper-intel",
        "source: Google reviews",
        f"rating: {reviews.get('rating', 'unknown')}",
        f"review_count: {reviews.get('review_count', 'unknown')}",
        "grade: B",
        "---",
        "",
        f"# Basic Reflex Reviews — {date}",
        "",
    ]

    if reviews.get("rating"):
        lines.append(f"**Google Rating: {reviews['rating']}/5** ({reviews.get('review_count', '?')} reviews)")
    lines.append("")

    if reviews.get("keywords"):
        lines.append("## Member Keywords")
        for kw in reviews["keywords"][:10]:
            bar = "█" * kw["count"]
            lines.append(f"  {kw['word']:15s} {bar} ({kw['count']})")
        lines.append("")

    if reviews.get("recent_reviews"):
        lines.append(f"## Recent Reviews ({len(reviews['recent_reviews'])})")
        for rev in reviews["recent_reviews"][:5]:
            lines.append(f"> {rev[:200]}")
            lines.append("")

    filepath.write_text("\n".join(lines))

def deposit_cross_sport_to_vault(results):
    """Write cross-sport research to vault."""
    VAULT_DIR_SPORT.mkdir(parents=True, exist_ok=True)
    date = datetime.now().strftime("%Y-%m-%d")
    filepath = VAULT_DIR_SPORT / f"cross-sport-{date}.md"

    lines = [
        "---",
        f"title: Cross-Sport Research — {date}",
        f"date: {date}",
        "type: scraper-intel",
        "source: Google Scholar",
        f"papers_found: {len(results)}",
        "grade: B",
        "---",
        "",
        f"# Cross-Sport Research — {date}",
        f"**{len(results)} papers found across combat/movement sports**",
        "",
        "The Muse should walk these for cross-domain bridges to boxing methodology.",
        "",
    ]

    # Group by search term
    by_term = {}
    for r in results:
        term = r["search_term"]
        if term not in by_term:
            by_term[term] = []
        by_term[term].append(r)

    for term, papers in by_term.items():
        lines.append(f"## {term} ({len(papers)})")
        lines.append("")
        for p in papers[:5]:
            lines.append(f"### {p['title']}")
            lines.append(f"*{p['authors']}*")
            if p.get("snippet"):
                lines.append(f"> {p['snippet'][:200]}")
            lines.append(f"[Link]({p['url']})")
            lines.append("")

    filepath.write_text("\n".join(lines))

def run():
    config = json.loads(Path(CONFIG_PATH).read_text())

    print("[reviews] Tracking Basic Reflex reviews...")
    reviews = scrape_google_reviews()
    if reviews.get("rating"):
        print(f"  Rating: {reviews['rating']}/5 ({reviews.get('review_count', '?')} reviews)")
    deposit_reviews_to_vault(reviews)

    sport_config = config["targets"]["cross_sport"]
    print(f"[cross-sport] Scanning {len(sport_config['sports'])} sports...")
    sport_results = scrape_cross_sport_research(
        sport_config["sports"],
        sport_config["search_terms"]
    )
    print(f"  {len(sport_results)} papers found")
    deposit_cross_sport_to_vault(sport_results)

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump({
            "date": datetime.now().isoformat(),
            "reviews": reviews,
            "cross_sport": sport_results,
        }, f, indent=2, default=str)

    print("[reviews+sport] Done.")
    return {"reviews": reviews.get("review_count"), "papers": len(sport_results)}

if __name__ == "__main__":
    run()
