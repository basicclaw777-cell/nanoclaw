#!/usr/bin/env python3
"""
HK Sentiment Scraper — Reddit + expat forums
Finds what HK residents say about boxing, fitness, gyms.
Deposits markdown nuggets to vault staging.
"""

import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Scrapling for adaptive parsing
from scrapling.fetchers import Fetcher

VAULT_DIR = Path.home() / "cathedral-vault" / "00_Staging" / "scraper-intel" / "sentiment"
OUTPUT_FILE = Path.home() / "nanoclaw" / "scraper" / "outputs" / "sentiment-latest.json"
CONFIG_PATH = Path.home() / "nanoclaw" / "scraper" / "config.json"

REDDIT_BASE = "https://old.reddit.com"

def load_config():
    with open(CONFIG_PATH) as f:
        return json.load(f)["targets"]["hk_sentiment"]

def scrape_reddit_sub(subreddit, keywords, limit=50):
    """Scrape a subreddit for keyword-matching posts."""
    results = []
    url = f"https://www.reddit.com/r/{subreddit}/new/.json?limit={limit}"

    try:
        import urllib.request
        req = urllib.request.Request(url, headers={
            'User-Agent': 'CathedralIntel/1.0 (research bot; contact: paul@basicreflex.com)'
        })
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())

        for post in data.get("data", {}).get("children", []):
            d = post.get("data", {})
            title = d.get("title", "").lower()
            selftext = d.get("selftext", "").lower()
            combined = title + " " + selftext

            if any(kw in combined for kw in keywords):
                created = datetime.fromtimestamp(d.get("created_utc", 0))
                # Only last 30 days
                if created > datetime.now() - timedelta(days=30):
                    results.append({
                        "source": f"reddit/r/{subreddit}",
                        "title": d.get("title", ""),
                        "text": d.get("selftext", "")[:500],
                        "url": f"https://reddit.com{d.get('permalink', '')}",
                        "score": d.get("score", 0),
                        "comments": d.get("num_comments", 0),
                        "date": created.isoformat()[:10],
                        "author": d.get("author", ""),
                    })
    except Exception as e:
        print(f"  Reddit r/{subreddit} error: {e}")

    return results

def scrape_forum_search(base_url, keywords):
    """Scrape forum search results for keywords."""
    results = []
    for kw in keywords[:3]:  # Top 3 keywords to avoid rate limiting
        try:
            search_url = f"https://www.google.com/search?q=site:{base_url}+{kw.replace(' ', '+')}&tbs=qdr:m"
            page = Fetcher.get(search_url, stealthy_headers=True)

            for link in page.css("a"):
                href = link.attrib.get("href", "")
                text = link.text or ""
                if base_url in href and len(text) > 20:
                    results.append({
                        "source": base_url,
                        "title": text[:200],
                        "url": href,
                        "keyword": kw,
                        "date": datetime.now().isoformat()[:10],
                    })
        except Exception as e:
            print(f"  Forum {base_url} error: {e}")

    return results

def categorize_sentiment(text):
    """Simple keyword-based sentiment categorization."""
    text_lower = text.lower()
    fears = ["afraid", "scared", "intimidat", "too unfit", "too old", "embarrass", "injury", "hurt", "punch in the face"]
    complaints = ["expensive", "overcrowded", "dirty", "rude", "cancel", "waste", "bad", "terrible", "worst"]
    desires = ["recommend", "best", "looking for", "want to try", "beginner friendly", "women", "female", "morning class", "evening class"]

    categories = []
    if any(f in text_lower for f in fears): categories.append("fear")
    if any(c in text_lower for c in complaints): categories.append("complaint")
    if any(d in text_lower for d in desires): categories.append("desire")
    if not categories: categories.append("general")
    return categories

def deposit_to_vault(results):
    """Write results as vault markdown."""
    if not results:
        return 0

    VAULT_DIR.mkdir(parents=True, exist_ok=True)
    date = datetime.now().strftime("%Y-%m-%d")
    filepath = VAULT_DIR / f"hk-sentiment-{date}.md"

    lines = [
        "---",
        f"title: HK Fitness Sentiment — {date}",
        f"date: {date}",
        "type: scraper-intel",
        "source: reddit + forums",
        f"total_hits: {len(results)}",
        "grade: B",
        "---",
        "",
        f"# HK Fitness Sentiment — {date}",
        f"**{len(results)} relevant posts found**",
        "",
    ]

    # Group by category
    by_cat = {}
    for r in results:
        text = r.get("title", "") + " " + r.get("text", "")
        cats = categorize_sentiment(text)
        for cat in cats:
            if cat not in by_cat: by_cat[cat] = []
            by_cat[cat].append(r)

    for cat, items in sorted(by_cat.items()):
        lines.append(f"## {cat.upper()} ({len(items)})")
        lines.append("")
        for item in items[:10]:
            lines.append(f"### [{item['title'][:80]}]({item.get('url', '')})")
            lines.append(f"*{item['source']} — {item.get('date', '')}*")
            if item.get("score"):
                lines.append(f"Score: {item['score']} | Comments: {item.get('comments', 0)}")
            if item.get("text"):
                lines.append(f"> {item['text'][:300]}")
            lines.append("")

    # Content opportunities
    lines.append("## CONTENT OPPORTUNITIES")
    lines.append("")
    if "fear" in by_cat:
        lines.append(f"**{len(by_cat['fear'])} fear-based posts** — introductory video topics, trial class positioning")
    if "complaint" in by_cat:
        lines.append(f"**{len(by_cat['complaint'])} complaints** — differentiation opportunities, address in marketing")
    if "desire" in by_cat:
        lines.append(f"**{len(by_cat['desire'])} desire posts** — direct lead opportunities, these people are looking NOW")

    filepath.write_text("\n".join(lines))
    return len(results)

def run():
    config = load_config()
    keywords = [k.lower() for k in config["keywords"]]
    subreddits = config["sources"]["reddit"]
    forums = config["sources"]["forums"]

    print(f"[hk-sentiment] Scanning {len(subreddits)} subreddits + {len(forums)} forums...")
    all_results = []

    for sub in subreddits:
        print(f"  Reddit r/{sub}...")
        results = scrape_reddit_sub(sub, keywords)
        print(f"    Found {len(results)} relevant posts")
        all_results.extend(results)

    for forum in forums:
        print(f"  Forum {forum}...")
        results = scrape_forum_search(forum, keywords[:3])
        print(f"    Found {len(results)} results")
        all_results.extend(results)

    # Dedup by URL
    seen = set()
    deduped = []
    for r in all_results:
        url = r.get("url", "")
        if url and url not in seen:
            seen.add(url)
            deduped.append(r)

    # Save raw output
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump({"date": datetime.now().isoformat(), "results": deduped}, f, indent=2)

    # Deposit to vault
    count = deposit_to_vault(deduped)
    print(f"[hk-sentiment] Done. {count} results deposited to vault.")
    return {"count": count, "results": deduped}

if __name__ == "__main__":
    run()
