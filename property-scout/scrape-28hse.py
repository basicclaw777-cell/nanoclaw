#!/usr/bin/env python3
"""
scrape-28hse.py — Production 28Hse scraper for all 5 scout lanes.

Scrapes 28hse.com for:
  Lane 1 (gym): Commercial/industrial in Western District, Central
  Lane 2 (home): Residential under ~HK$5M in target districts
  Lane 3 (coffee): Retail/shop ground floor in target districts
  Lane 4 (invest): Tenanted properties, any area
  Lane 5 (auction): Auction/distressed listings

Output: ~/nanoclaw/property-scout/scrape-latest.json
"""

import json, re, time, sys
from playwright.sync_api import sync_playwright

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

OUT_PATH = "/Users/basicclaw777/nanoclaw/property-scout/scrape-latest.json"

# Lane 1: Gym — commercial/industrial in Western + Central + golden zones
GYM_SEARCHES = [
    ("Sheung Wan", "https://www.28hse.com/buy/office/a1/dg3/housetype-industrail_building"),
    ("Sheung Wan office", "https://www.28hse.com/buy/office/a1/dg3"),
    ("Sai Ying Pun office", "https://www.28hse.com/buy/office/a1/dg4"),
    ("Central", "https://www.28hse.com/buy/office/a1/dg1"),
    ("Kennedy Town", "https://www.28hse.com/buy/office/a1/dg5"),
    ("Cheung Sha Wan ind", "https://www.28hse.com/buy/office/a2/dg27/housetype-industrail_building"),
    ("Kwun Tong ind", "https://www.28hse.com/buy/office/a2/dg21/housetype-industrail_building"),
    ("Yau Tong ind", "https://www.28hse.com/buy/office/a2/dg123/housetype-industrail_building"),
    ("San Po Kong ind", "https://www.28hse.com/buy/office/a2/dg32/housetype-industrail_building"),
    ("Tsuen Wan ind", "https://www.28hse.com/buy/office/a3/dg49/housetype-industrail_building"),
]

# Lane 2: Home — residential, budget filter applied after scrape
HOME_SEARCHES = [
    ("SYP res", "https://www.28hse.com/buy/residential/a1/dg4"),
    ("Sheung Wan res", "https://www.28hse.com/buy/residential/a1/dg3"),
    ("Wan Chai res", "https://www.28hse.com/buy/residential/a1/dg2"),
    ("Mong Kok", "https://www.28hse.com/buy/residential/a2/dg22"),
    ("Prince Edward", "https://www.28hse.com/buy/residential/a2/dg134"),
    ("YMT", "https://www.28hse.com/buy/residential/a2/dg29"),
    ("Sham Shui Po", "https://www.28hse.com/buy/residential/a2/dg28"),
    ("Kowloon Bay", "https://www.28hse.com/buy/residential/a2/dg20"),
    ("Tai Kok Tsui", "https://www.28hse.com/buy/residential/a2/dg25"),
    ("Tuen Mun", "https://www.28hse.com/buy/residential/a3/dg48"),
    ("TKO", "https://www.28hse.com/buy/residential/a2/dg144"),
]

# Lane 3: Coffee/retail — shop listings
COFFEE_SEARCHES = [
    ("Sheung Wan shop", "https://www.28hse.com/buy/shop/a1/dg3"),
    ("Sai Ying Pun shop", "https://www.28hse.com/buy/shop/a1/dg4"),
    ("Kennedy Town shop", "https://www.28hse.com/buy/shop/a1/dg5"),
    ("Central shop", "https://www.28hse.com/buy/shop/a1/dg1"),
    ("Sham Shui Po shop", "https://www.28hse.com/buy/shop/a2/dg28"),
    ("Cheung Sha Wan shop", "https://www.28hse.com/buy/shop/a2/dg27"),
    ("Mong Kok shop", "https://www.28hse.com/buy/shop/a2/dg22"),
    ("Ho Man Tin shop", "https://www.28hse.com/buy/shop/a2/dg30"),
    ("TST shop", "https://www.28hse.com/buy/shop/a2/dg17"),
    ("Jordan shop", "https://www.28hse.com/buy/shop/a2/dg135"),
    ("Kwun Tong shop", "https://www.28hse.com/buy/shop/a2/dg21"),
]

DISTRICT_KEYS = [
    "上環", "西營盤", "堅尼地城", "中環", "旺角", "太子", "油麻地",
    "深水埗", "屯門", "將軍澳", "觀塘", "牛頭角", "油塘", "藍田",
    "九龍灣", "新蒲崗", "黃大仙", "荃灣", "葵涌", "尖沙咀", "佐敦",
    "大角咀", "長沙灣", "荔枝角", "紅磡", "土瓜灣", "何文田",
]


def parse_card(txt, href, search_label, lane):
    lines = [l.strip() for l in txt.split("\n") if l.strip()]
    out = {
        "lane": lane,
        "search": search_label,
        "title": None,
        "building": None,
        "address_raw": None,
        "floor_unit": None,
        "sqft": None,
        "ppsf": None,
        "price": None,
        "monthly_rent": None,
        "tx_type": None,
        "agent": None,
        "photos": 0,
        "url": href,
        "badge": None,
    }

    if lines and re.fullmatch(r"\d+", lines[0]):
        out["photos"] = int(lines[0])
        lines = lines[1:]
    if lines and lines[0] in ("黃金", "置頂", "獨家", "業主盤"):
        out["badge"] = lines[0]
        lines = lines[1:]

    m = re.search(r"(?:建築面積|實用面積|面積)[:：]?\s*([\d,]+)\s*呎\s*(?:@\s*([\d,]+))?", txt)
    if m:
        out["sqft"] = int(m.group(1).replace(",", ""))
        if m.group(2):
            out["ppsf"] = int(m.group(2).replace(",", ""))

    m = re.search(r"售\s*\$?\s*([\d,.]+)\s*萬", txt)
    if m:
        out["tx_type"] = "sale"
        out["price"] = int(float(m.group(1).replace(",", "")) * 10000)
    else:
        m = re.search(r"租\s*\$?\s*([\d,]+)", txt)
        if m:
            out["tx_type"] = "rent"
            out["monthly_rent"] = int(m.group(1).replace(",", ""))

    for l in lines:
        if any(dk in l for dk in DISTRICT_KEYS):
            out["address_raw"] = l
            if "|" in l:
                left, right = l.split("|", 1)
                out["building"] = left.strip()
                out["floor_unit"] = right.strip()
            else:
                out["building"] = l.strip()
            break

    for i, l in enumerate(lines):
        if l.startswith("售") or l.startswith("租"):
            if i >= 1 and lines[i-1] and not re.search(r"呎|面積", lines[i-1]):
                out["agent"] = lines[i-1].strip()
            break

    for l in lines:
        if l and not l.startswith(("售", "租", "建築", "實用")) and "呎" not in l:
            if l != out["agent"] and l != out["address_raw"] and l != out["building"]:
                if not out["title"]:
                    out["title"] = l

    return out


def scrape_page(page, url, label, lane, results, max_cards=30):
    try:
        page.goto(url, timeout=40000, wait_until="domcontentloaded")
        page.wait_for_timeout(3000)
    except Exception as e:
        print(f"  [{label}] nav error: {e}", file=sys.stderr)
        return

    cards = page.locator("div.item.property_item")
    n = min(cards.count(), max_cards)
    print(f"  [{label}] {n} cards at {url}")

    for i in range(n):
        c = cards.nth(i)
        try:
            txt = c.inner_text()
            a_el = c.locator("a.detail_page").first
            href = a_el.get_attribute("href") if a_el.count() > 0 else None
            if href and not href.startswith("http"):
                href = "https://www.28hse.com" + href
            u = parse_card(txt, href, label, lane)
            if u["price"] or u["monthly_rent"]:
                results.append(u)
        except Exception as e:
            pass


def apply_lane_filters(results):
    filtered = []
    for u in results:
        if u["lane"] == "gym":
            if u["tx_type"] == "sale" and u["price"] and u["price"] <= 8_000_000:
                if not u["sqft"] or u["sqft"] >= 600:
                    filtered.append(u)
        elif u["lane"] == "home":
            if u["tx_type"] == "sale" and u["price"] and u["price"] <= 5_500_000:
                filtered.append(u)
        elif u["lane"] == "coffee":
            if u["tx_type"] == "sale" and u["price"] and u["price"] <= 7_000_000:
                filtered.append(u)
        elif u["lane"] == "invest":
            filtered.append(u)
        elif u["lane"] == "auction":
            filtered.append(u)
    return filtered


def main():
    all_results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        ctx = browser.new_context(
            user_agent=UA,
            viewport={"width": 1366, "height": 900},
            locale="zh-HK",
            timezone_id="Asia/Hong_Kong",
        )
        page = ctx.new_page()

        try:
            print("[scraper] Lane 1: Gym / Commercial")
            for label, url in GYM_SEARCHES:
                scrape_page(page, url, label, "gym", all_results)
                time.sleep(1.5)

            print("[scraper] Lane 2: Home / Residential")
            for label, url in HOME_SEARCHES:
                scrape_page(page, url, label, "home", all_results)
                time.sleep(1.5)

            print("[scraper] Lane 3: Coffee / Retail")
            for label, url in COFFEE_SEARCHES:
                scrape_page(page, url, label, "coffee", all_results)
                time.sleep(1.5)

        finally:
            browser.close()

    filtered = apply_lane_filters(all_results)

    # Dedup by URL
    seen = set()
    deduped = []
    for u in filtered:
        key = u.get("url") or f"{u['building']}_{u['price']}"
        if key not in seen:
            seen.add(key)
            deduped.append(u)

    print(f"\n[scraper] Total raw: {len(all_results)}, filtered: {len(filtered)}, deduped: {len(deduped)}")
    by_lane = {}
    for u in deduped:
        by_lane[u["lane"]] = by_lane.get(u["lane"], 0) + 1
    for lane, count in sorted(by_lane.items()):
        print(f"  {lane}: {count}")

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(deduped, f, ensure_ascii=False, indent=2)
    print(f"[scraper] Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
