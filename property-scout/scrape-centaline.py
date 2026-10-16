#!/usr/bin/env python3
"""
scrape-centaline.py — Centaline Commercial scraper for property scout.

Scrapes oir.centanet.com for Sheung Wan, Sai Ying Pun, Kennedy Town
commercial properties for sale. Assigns lanes: office/industrial → gym,
shop/retail → coffee.

Output: ~/nanoclaw/property-scout/scrape-centaline-latest.json
"""

import json, re, time, sys
from playwright.sync_api import sync_playwright

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

OUT_PATH = "/Users/basicclaw777/nanoclaw/property-scout/scrape-centaline-latest.json"

SEARCHES = [
    ("Sheung Wan", "https://oir.centanet.com/en/sale/all-usage/hong-kong-sheung-wan/ws003/"),
    ("Sai Ying Pun", "https://oir.centanet.com/en/sale/all-usage/hong-kong-sai-ying-pun/ws004/"),
    ("Kennedy Town", "https://oir.centanet.com/en/sale/all-usage/hong-kong-kennedy-town/ws005/"),
]

MAX_PAGES = 3
PRICE_CAP = 10_000_000


def classify_lane(prop_type):
    t = (prop_type or "").lower()
    if "shop" in t or "retail" in t:
        return "coffee"
    if "industrial" in t or "office" in t or "flatted" in t:
        return "gym"
    return "gym"


def parse_card(text, href, search_label):
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    out = {
        "source_name": "Centaline",
        "lane": "gym",
        "search": search_label,
        "title": None,
        "building": None,
        "address_raw": None,
        "floor_unit": None,
        "sqft": None,
        "ppsf": None,
        "price": None,
        "monthly_rent": None,
        "tx_type": "sale",
        "agent": None,
        "photos": 0,
        "url": href,
        "badge": None,
    }

    # Building name: first line (span.name)
    if lines:
        out["building"] = lines[0]
        out["title"] = lines[0]

    # Floor: second line if it contains "Floor"
    for l in lines:
        if "Floor" in l:
            out["floor_unit"] = l.strip()
            break

    # Address: line with district or road
    for l in lines:
        if any(kw in l for kw in ("Road", "Street", "Sheung Wan", "Sai Ying Pun",
                                   "Kennedy Town", "Central", "Des Voeux",
                                   "Queen", "Connaught")):
            if l != out["building"]:
                out["address_raw"] = l.strip()
                break

    # Property type: line that is exactly Office, Retail, Industrial, Shop, etc.
    prop_type = None
    for l in lines:
        if l in ("Office", "Retail", "Industrial", "Shop", "Flatted Factory"):
            prop_type = l
            break
        if "|" in l:
            parts = l.split("|")
            for part in parts:
                pt = part.strip()
                if pt in ("Office", "Retail", "Industrial", "Shop", "Flatted Factory"):
                    prop_type = pt
                    break

    out["lane"] = classify_lane(prop_type)

    # Area: "X,XXX ft² approx" or in a line with "|"
    m = re.search(r"([\d,]+)\s*ft", text)
    if m:
        out["sqft"] = int(m.group(1).replace(",", ""))

    # Price: "Sale $X.XXM" or "$XX.XXM"
    m = re.search(r"Sale\s*\$\s*([\d,.]+)\s*M", text)
    if m:
        price_m = float(m.group(1).replace(",", ""))
        out["price"] = int(price_m * 1_000_000)

    # Price per sqft: "@X,XXX"
    m = re.search(r"@\s*([\d,]+)", text)
    if m:
        out["ppsf"] = int(m.group(1).replace(",", ""))

    # Agent: line after price that looks like a name (not a number, not a tag)
    found_price = False
    for l in lines:
        if "Sale $" in l:
            found_price = True
            continue
        if found_price and l.startswith("@"):
            continue
        if found_price and "Latest" in l:
            continue
        if found_price and l.startswith("Lease"):
            continue
        if found_price and l and not l.startswith(("E-", "S-")) and not re.fullmatch(r"[\d\s]+", l):
            if not re.match(r"^\$", l) and "Property" not in l and "Adv." not in l:
                out["agent"] = l.strip()
                break

    # Tags: Sole Agent, Hot Listing, etc.
    tags = []
    for l in lines:
        if l in ("Sole Agent", "Hot Listing", "Fitted", "Sea View", "City View",
                 "Mountain View", "Furnished"):
            tags.append(l)
    if "Hot Listing" in tags:
        out["badge"] = "Hot Listing"

    return out


def main():
    all_results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        ctx = browser.new_context(
            user_agent=UA,
            viewport={"width": 1366, "height": 900},
            locale="en-HK",
        )
        page = ctx.new_page()

        try:
            for label, base_url in SEARCHES:
                for pg in range(1, MAX_PAGES + 1):
                    url = base_url if pg == 1 else f"{base_url}?pageindex={pg}"
                    print(f"  [{label} p{pg}] {url}")

                    try:
                        page.goto(url, timeout=40000, wait_until="domcontentloaded")
                        page.wait_for_timeout(4000)
                    except Exception as e:
                        print(f"  [{label} p{pg}] nav error: {e}", file=sys.stderr)
                        continue

                    cards = page.locator(".property-card")
                    n = cards.count()
                    print(f"  [{label} p{pg}] {n} cards")

                    if n == 0:
                        break

                    for i in range(min(n, 40)):
                        c = cards.nth(i)
                        try:
                            txt = c.inner_text()
                            link = c.locator("a.property-results-card").first
                            href = None
                            if link.count() > 0:
                                href = link.get_attribute("href")
                                if href and not href.startswith("http"):
                                    href = "https://oir.centanet.com" + href

                            if not href:
                                continue

                            u = parse_card(txt, href, label)
                            if u["price"] and u["price"] <= PRICE_CAP:
                                all_results.append(u)
                        except Exception:
                            pass

                    time.sleep(2)
        finally:
            browser.close()

    # Dedup by URL
    seen = set()
    deduped = []
    for u in all_results:
        key = u.get("url") or f"{u['building']}_{u['price']}"
        if key not in seen:
            seen.add(key)
            deduped.append(u)

    print(f"\n[centaline] Total raw: {len(all_results)}, deduped: {len(deduped)}")
    by_lane = {}
    for u in deduped:
        by_lane[u["lane"]] = by_lane.get(u["lane"], 0) + 1
    for lane, count in sorted(by_lane.items()):
        print(f"  {lane}: {count}")

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(deduped, f, ensure_ascii=False, indent=2)
    print(f"[centaline] Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
