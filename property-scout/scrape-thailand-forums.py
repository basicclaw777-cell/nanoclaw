#!/usr/bin/env python3
"""
scrape-thailand-forums.py — Forum signal scraper for Property Scout.

Searches expat/property forums for distressed sale signals related to
the Thailand nominee company crackdown (DBD orders Jan+Apr 2026).

Working boards (tested 2026-08-24):
  1. Reddit r/Thailand + r/thailandproperty (www.reddit.com — no login needed)
  2. Thaiger (thethaiger.com — open, good coverage of DBD enforcement)

Blocked boards (documented for future retry):
  - Aseannow: Cloudflare bot protection
  - Google site-search: CAPTCHA on VPN IP

Output: ~/nanoclaw/property-scout/forum-signals-latest.json
"""

import json, re, time, sys, random
from datetime import date
from playwright.sync_api import sync_playwright
from urllib.parse import quote_plus

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

OUT_PATH = "/Users/basicclaw777/nanoclaw/property-scout/forum-signals-latest.json"
TODAY = date.today().isoformat()

DISTRESS_KEYWORDS = [
    "must sell", "urgent", "below market", "leaving thailand",
    "forced", "dbd", "nominee", "disposal", "desperate",
    "fire sale", "quick sale", "reduced", "price drop",
    "crackdown", "confiscate", "liquidat", "unwinding",
    "comply", "compliance", "180 days", "365 days",
    "foreign quota", "seized", "penalty", "fine",
    "arrest", "warrant", "illegal", "raid", "bust",
    "investigation", "suspect", "charge",
]

REDDIT_SEARCHES = {
    "reddit_thailand": {
        "subreddit": "Thailand",
        "queries": [
            "nominee crackdown property",
            "nominee company sell",
            "foreign property sell villa",
            "DBD nominee company",
            "property law foreign 2026",
        ],
    },
    "reddit_thaiproperty": {
        "subreddit": "thailandproperty",
        "queries": [
            "nominee crackdown",
            "must sell property",
            "foreign ownership law",
            "leasehold freehold",
        ],
    },
}

THAIGER_QUERIES = [
    "nominee company property",
    "foreign owner sell property",
    "DBD nominee crackdown",
    "property law foreign ownership",
    "nominee arrest warrant",
]


def score_distress(title, snippet):
    """Score 1-5 based on distress keyword density."""
    text = f"{title} {snippet}".lower()
    matched = [kw for kw in DISTRESS_KEYWORDS if kw in text]
    n = len(matched)
    if n >= 5:
        score = 5
    elif n >= 3:
        score = 4
    elif n >= 2:
        score = 3
    elif n >= 1:
        score = 2
    else:
        score = 1
    return score, matched


def random_delay():
    time.sleep(random.uniform(2.0, 5.0))


def scrape_reddit(page, board_key, subreddit, query, results):
    """Scrape www.reddit.com search results (no login needed)."""
    url = (f"https://www.reddit.com/r/{subreddit}/search/"
           f"?q={quote_plus(query)}&restrict_sr=1&sort=new&t=year")
    try:
        page.goto(url, timeout=30000, wait_until="domcontentloaded")
        page.wait_for_timeout(5000)
    except Exception as e:
        print(f"  [{board_key}] nav error for '{query}': {e}", file=sys.stderr)
        return

    try:
        body_text = page.inner_text("body")
        if "Log In" in body_text and len(body_text) < 500:
            print(f"  [{board_key}] login wall hit, skipping", file=sys.stderr)
            return

        # New reddit renders search results as post links
        # Each result has title text, vote count, comment count, age
        # Parse from body text since DOM is heavily JS-rendered
        lines = [l.strip() for l in body_text.split("\n") if l.strip()]

        i = 0
        found = 0
        while i < len(lines) and found < 20:
            line = lines[i]
            # Skip navigation/header lines
            if any(skip in line for skip in [
                "Skip to", "Sign Up", "Log In", "Expand", "Show results",
                "all of Reddit", "back", "forward", "New", "Posts",
                "Comments", "Media", "Search!", "People", "Communities",
            ]):
                i += 1
                continue

            # A result title is typically a longer line (>20 chars) that isn't a vote/comment count
            if len(line) > 20 and not line.endswith("comments") and "votes" not in line:
                title = line
                # Look for metadata in surrounding lines
                post_date = None
                votes = None
                comments = None
                snippet = ""

                # Check next few lines for date/votes/comments
                for j in range(i + 1, min(i + 5, len(lines))):
                    nxt = lines[j]
                    if "ago" in nxt and len(nxt) < 20:
                        post_date = nxt
                    if "votes" in nxt or "vote" in nxt:
                        votes = nxt
                    if "comments" in nxt or "comment" in nxt:
                        comments = nxt

                # Check for subreddit prefix
                if line.startswith("r/"):
                    i += 1
                    continue

                # Build URL from title (reddit URLs use title slug)
                # We can't reliably get URLs from text, so use search page URL as reference
                post_url = f"https://www.reddit.com/r/{subreddit}/search/?q={quote_plus(query)}&restrict_sr=1&sort=new&t=year"

                score, matched = score_distress(title, snippet)
                if score >= 2:  # Only keep results with at least one keyword match
                    results.append({
                        "board": board_key,
                        "title": title[:200],
                        "url": post_url,
                        "date": post_date,
                        "snippet": f"Votes: {votes}, Comments: {comments}" if votes else "",
                        "distress_score": score,
                        "keywords_matched": matched,
                        "scraped_at": TODAY,
                    })
                    found += 1

            i += 1

    except Exception as e:
        print(f"  [{board_key}] parse error for '{query}': {e}", file=sys.stderr)


def scrape_reddit_with_links(page, board_key, subreddit, query, results):
    """Scrape reddit search, extracting actual post links via accessibility tree."""
    url = (f"https://www.reddit.com/r/{subreddit}/search/"
           f"?q={quote_plus(query)}&restrict_sr=1&sort=new&t=year")
    try:
        page.goto(url, timeout=30000, wait_until="domcontentloaded")
        page.wait_for_timeout(5000)
    except Exception as e:
        print(f"  [{board_key}] nav error for '{query}': {e}", file=sys.stderr)
        return

    try:
        # Find all links that look like reddit post URLs
        links = page.locator("a[href*='/comments/'], a[href*='/r/" + subreddit + "/comments/']")
        count = links.count()

        if count == 0:
            # Fallback to text parsing
            scrape_reddit(page, board_key, subreddit, query, results)
            return

        seen_this_query = set()
        for i in range(min(count, 30)):
            try:
                link = links.nth(i)
                href = link.get_attribute("href")
                if not href:
                    continue
                if not href.startswith("http"):
                    href = "https://www.reddit.com" + href
                if href in seen_this_query:
                    continue
                seen_this_query.add(href)

                title = link.inner_text().strip()
                if not title or len(title) < 15:
                    continue
                # Skip "more comments" type links
                if title.lower() in ["comments", "share", "save", "hide", "report"]:
                    continue

                score, matched = score_distress(title, "")
                results.append({
                    "board": board_key,
                    "title": title[:200],
                    "url": href,
                    "date": None,
                    "snippet": "",
                    "distress_score": score,
                    "keywords_matched": matched,
                    "scraped_at": TODAY,
                })
            except Exception:
                pass

    except Exception as e:
        print(f"  [{board_key}] parse error for '{query}': {e}", file=sys.stderr)


def scrape_thaiger(page, query, results):
    """Scrape Thaiger search results. DOM has no <article> tags —
    extract from links + body text."""
    url = f"https://thethaiger.com/?s={quote_plus(query)}"
    try:
        page.goto(url, timeout=30000, wait_until="domcontentloaded")
        page.wait_for_timeout(4000)
    except Exception as e:
        print(f"  [thaiger] nav error for '{query}': {e}", file=sys.stderr)
        return

    try:
        body_text = page.inner_text("body")
        body_lines = [l.strip() for l in body_text.split("\n") if l.strip()]

        # Build snippet map: title line → next paragraph line
        snippet_map = {}
        for i, line in enumerate(body_lines):
            if len(line) > 25 and i + 1 < len(body_lines):
                next_line = body_lines[i + 1]
                if len(next_line) > 40:
                    snippet_map[line.lower().strip()] = next_line[:300]

        # Article URLs have 5+ slashes (deep paths), nav links have fewer
        all_links = page.locator("a")
        link_count = all_links.count()
        property_kws = [
            "property", "nominee", "villa", "condo", "foreign",
            "dbd", "land", "crackdown", "arrest", "ownership",
            "raid", "bust", "illegal", "seized", "freehold", "leasehold",
        ]

        for i in range(min(link_count, 200)):
            try:
                link = all_links.nth(i)
                href = link.get_attribute("href") or ""
                if "thethaiger.com/" not in href or href.count("/") < 5:
                    continue
                title = link.inner_text().strip()
                if not title or len(title) < 20:
                    continue
                title_lower = title.lower()
                if not any(kw in title_lower for kw in property_kws):
                    if not any(kw in href.lower() for kw in ["nominee", "property", "foreign", "crackdown"]):
                        continue

                # Find snippet from body text
                snippet = snippet_map.get(title_lower, "")

                # Extract date from nearby text if present
                post_date = None
                for bl in body_lines:
                    if "ago" in bl and len(bl) < 30:
                        idx_title = next((j for j, l in enumerate(body_lines) if title_lower in l.lower()), -1)
                        idx_date = next((j for j, l in enumerate(body_lines) if bl == l), -1)
                        if idx_title >= 0 and idx_date >= 0 and abs(idx_title - idx_date) <= 3:
                            post_date = bl
                            break

                score, matched = score_distress(title, snippet)
                results.append({
                    "board": "thaiger",
                    "title": title[:200],
                    "url": href,
                    "date": post_date,
                    "snippet": snippet,
                    "distress_score": score,
                    "keywords_matched": matched,
                    "scraped_at": TODAY,
                })
            except Exception:
                pass

    except Exception as e:
        print(f"  [thaiger] parse error for '{query}': {e}", file=sys.stderr)


def main():
    all_results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        ctx = browser.new_context(
            user_agent=UA,
            viewport={"width": 1366, "height": 900},
            locale="en-US",
        )
        page = ctx.new_page()

        # 1. Reddit r/Thailand
        print("[forums] Reddit r/Thailand")
        for q in REDDIT_SEARCHES["reddit_thailand"]["queries"]:
            print(f"  searching: {q}")
            scrape_reddit_with_links(page, "reddit_thailand",
                                     REDDIT_SEARCHES["reddit_thailand"]["subreddit"], q, all_results)
            random_delay()

        # 2. Reddit r/thailandproperty
        print("[forums] Reddit r/thailandproperty")
        for q in REDDIT_SEARCHES["reddit_thaiproperty"]["queries"]:
            print(f"  searching: {q}")
            scrape_reddit_with_links(page, "reddit_thaiproperty",
                                     REDDIT_SEARCHES["reddit_thaiproperty"]["subreddit"], q, all_results)
            random_delay()

        # 3. Thaiger
        print("[forums] Thaiger")
        for q in THAIGER_QUERIES:
            print(f"  searching: {q}")
            scrape_thaiger(page, q, all_results)
            random_delay()

        browser.close()

    # Dedup by URL
    seen = set()
    deduped = []
    for r in all_results:
        key = r["url"]
        if key not in seen:
            seen.add(key)
            deduped.append(r)

    # Sort by distress score descending, then by date
    deduped.sort(key=lambda x: x["distress_score"], reverse=True)

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(deduped, f, ensure_ascii=False, indent=2)

    # Summary
    print(f"\n[forums] Total raw: {len(all_results)}, deduped: {len(deduped)}")
    by_board = {}
    for r in deduped:
        by_board[r["board"]] = by_board.get(r["board"], 0) + 1
    for board, count in sorted(by_board.items()):
        print(f"  {board}: {count}")

    score_dist = {}
    for r in deduped:
        s = r["distress_score"]
        score_dist[s] = score_dist.get(s, 0) + 1
    print("\n[forums] Distress score distribution:")
    for s in sorted(score_dist.keys(), reverse=True):
        print(f"  score {s}: {score_dist[s]}")

    top = [r for r in deduped if r["distress_score"] >= 3]
    if top:
        print(f"\n[forums] Top distress signals ({len(top)}):")
        for r in top[:15]:
            print(f"  [{r['distress_score']}] {r['board']}: {r['title'][:80]}")
            if r["keywords_matched"]:
                print(f"       keywords: {', '.join(r['keywords_matched'][:5])}")

    print(f"\n[forums] Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
