#!/usr/bin/env python3
"""
Boxing Misinformation Auto-Debunk Engine
Scrapes viral boxing claims from YouTube + Reddit.
Cross-references against vault evidence via semantic search.
Generates debunk briefs with grade and source.
"""

import json
import re
from datetime import datetime, timedelta
from pathlib import Path
from scrapling.fetchers import Fetcher

VAULT_DIR = Path.home() / "cathedral-vault" / "00_Staging" / "scraper-intel" / "myth-watch"
OUTPUT_FILE = Path.home() / "nanoclaw" / "scraper" / "outputs" / "myths-latest.json"
CONFIG_PATH = Path.home() / "nanoclaw" / "scraper" / "config.json"
VAULT_SEARCH_URL = "http://localhost:8080/vault/search"

def load_config():
    with open(CONFIG_PATH) as f:
        return json.load(f)["targets"]["myth_watch"]

def scrape_youtube_boxing(hashtags, max_per_tag=10):
    """Scrape YouTube search for boxing technique claims."""
    results = []
    for tag in hashtags:
        try:
            url = f"https://www.youtube.com/results?search_query={tag}&sp=CAI%253D"  # Sort by date
            page = Fetcher.get(url, stealthy_headers=True)
            text = page.text or ""

            # Extract video titles from JSON data in page
            titles = re.findall(r'"title":\{"runs":\[\{"text":"([^"]{10,100})"\}', text)
            view_counts = re.findall(r'"viewCountText":\{"simpleText":"([\d,]+\s*views?)"\}', text)
            video_ids = re.findall(r'"videoId":"([a-zA-Z0-9_-]{11})"', text)

            seen_ids = set()
            for i, title in enumerate(titles[:max_per_tag]):
                vid = video_ids[i] if i < len(video_ids) else ""
                if vid in seen_ids:
                    continue
                seen_ids.add(vid)

                views_str = view_counts[i] if i < len(view_counts) else "0 views"
                views = int(re.sub(r'[^\d]', '', views_str.split()[0])) if views_str else 0

                results.append({
                    "source": "youtube",
                    "title": title,
                    "url": f"https://youtube.com/watch?v={vid}" if vid else "",
                    "views": views,
                    "hashtag": tag,
                    "claim_text": title,
                })

        except Exception as e:
            print(f"  YouTube #{tag} error: {e}")

    return results

def scrape_reddit_boxing_claims():
    """Scrape boxing subreddits for technique claims/advice."""
    results = []
    subs = ["amateur_boxing", "Boxing", "MuayThai"]

    for sub in subs:
        try:
            url = f"https://old.reddit.com/r/{sub}/new/.json?limit=30"
            page = Fetcher.get(url, stealthy_headers=True)
            data = json.loads(page.text)

            for post in data.get("data", {}).get("children", []):
                d = post["data"]
                title = d.get("title", "")
                selftext = d.get("selftext", "")[:500]
                score = d.get("score", 0)

                # Only posts with technique claims (heuristic)
                claim_words = ["always", "never", "should", "must", "best way", "correct",
                              "wrong", "mistake", "tip", "trick", "secret", "myth",
                              "keep your", "don't", "you need to"]
                combined = (title + " " + selftext).lower()
                if any(w in combined for w in claim_words) and score > 3:
                    results.append({
                        "source": f"reddit/r/{sub}",
                        "title": title,
                        "text": selftext,
                        "url": f"https://reddit.com{d.get('permalink', '')}",
                        "score": score,
                        "claim_text": title + ". " + selftext[:200],
                    })

        except Exception as e:
            print(f"  Reddit r/{sub} error: {e}")

    return results

def check_against_vault(claim_text):
    """Search vault for evidence related to a claim."""
    try:
        import urllib.request
        import urllib.parse
        params = urllib.parse.urlencode({"q": claim_text[:100], "top_k": "3"})
        req = urllib.request.Request(
            f"{VAULT_SEARCH_URL}?{params}",
            headers={"x-api-key": "cathedral-mcp-2026"}
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
            if isinstance(data, list) and data:
                return [{"title": r.get("title", ""), "text": r.get("text", "")[:200], "path": r.get("path", "")} for r in data[:3]]
    except:
        pass
    return []

def extract_claims(results):
    """Extract specific technique claims from scraped content."""
    claims = []
    # Common myth patterns
    myth_patterns = [
        r'(?:always|never|must|should)\s+(?:keep|drop|tuck|raise|lower)\s+(?:your|the)\s+\w+',
        r'(?:the best|only way|correct way|wrong way)\s+to\s+\w+',
        r'(?:don\'t|never|stop)\s+\w+\s+(?:when|while|during)\s+\w+',
    ]

    for r in results:
        text = r.get("claim_text", "")
        for pattern in myth_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            for m in matches:
                claims.append({
                    **r,
                    "extracted_claim": m,
                })

        # Also include high-engagement content as potential myths
        if r.get("views", 0) > 50000 or r.get("score", 0) > 50:
            claims.append({**r, "extracted_claim": r.get("title", ""), "high_engagement": True})

    return claims

def deposit_to_vault(claims, vault_checks):
    """Write myth watch to vault."""
    VAULT_DIR.mkdir(parents=True, exist_ok=True)
    date = datetime.now().strftime("%Y-%m-%d")
    filepath = VAULT_DIR / f"myth-watch-{date}.md"

    lines = [
        "---",
        f"title: Boxing Myth Watch — {date}",
        f"date: {date}",
        "type: scraper-intel",
        "source: YouTube + Reddit",
        f"claims_found: {len(claims)}",
        f"vault_matches: {sum(1 for c in vault_checks if c)}",
        "grade: B",
        "---",
        "",
        f"# Boxing Myth Watch — {date}",
        f"**{len(claims)} technique claims scraped, {sum(1 for c in vault_checks if c)} have vault evidence**",
        "",
    ]

    # Claims WITH vault evidence (debunkable)
    debunkable = [(c, v) for c, v in zip(claims, vault_checks) if v]
    if debunkable:
        lines.append(f"## DEBUNKABLE — Vault Evidence Available ({len(debunkable)})")
        lines.append("")
        for claim, vault_hits in debunkable:
            lines.append(f"### Claim: {claim.get('extracted_claim', claim.get('title', ''))}")
            lines.append(f"*Source: {claim['source']}* | {'Views: ' + str(claim['views']) if claim.get('views') else 'Score: ' + str(claim.get('score', 0))}")
            if claim.get("url"):
                lines.append(f"[Link]({claim['url']})")
            lines.append("")
            lines.append("**Vault says:**")
            for hit in vault_hits:
                lines.append(f"- {hit['title']}: {hit['text'][:150]}")
            lines.append("")
            lines.append("**Content opportunity:** Carousel/video debunking this claim with vault evidence.")
            lines.append("")

    # Claims without vault evidence (research needed)
    unmatched = [(c, v) for c, v in zip(claims, vault_checks) if not v]
    if unmatched:
        lines.append(f"## NO VAULT MATCH — Research Needed ({len(unmatched)})")
        lines.append("")
        for claim, _ in unmatched[:10]:
            lines.append(f"- **{claim.get('extracted_claim', claim.get('title', ''))}** ({claim['source']})")
        lines.append("")

    # High engagement content
    viral = [c for c in claims if c.get("high_engagement")]
    if viral:
        lines.append(f"## HIGH ENGAGEMENT — Viral Boxing Content ({len(viral)})")
        lines.append("")
        for v in sorted(viral, key=lambda x: x.get("views", 0), reverse=True)[:10]:
            views = f"{v['views']:,} views" if v.get("views") else f"score {v.get('score', 0)}"
            lines.append(f"- [{v['title']}]({v.get('url', '')}) — {views}")
        lines.append("")

    filepath.write_text("\n".join(lines))

def run():
    config = load_config()

    print("[myth-watch] Scanning for boxing claims...")
    yt_results = scrape_youtube_boxing(config["hashtags"])
    print(f"  YouTube: {len(yt_results)} videos")

    reddit_results = scrape_reddit_boxing_claims()
    print(f"  Reddit: {len(reddit_results)} posts")

    all_results = yt_results + reddit_results
    claims = extract_claims(all_results)
    print(f"  Extracted claims: {len(claims)}")

    # Check each claim against vault
    print("  Checking against vault...")
    vault_checks = []
    for claim in claims:
        vault_hits = check_against_vault(claim.get("extracted_claim", ""))
        vault_checks.append(vault_hits)

    matched = sum(1 for v in vault_checks if v)
    print(f"  Vault matches: {matched}/{len(claims)}")

    # Save raw
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump({"date": datetime.now().isoformat(), "claims": claims}, f, indent=2)

    deposit_to_vault(claims, vault_checks)
    print(f"[myth-watch] Done. {len(claims)} claims, {matched} debunkable.")
    return {"claims": len(claims), "debunkable": matched}

if __name__ == "__main__":
    run()
