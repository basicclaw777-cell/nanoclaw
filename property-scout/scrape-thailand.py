#!/usr/bin/env python3
"""
scrape-thailand.py — FazWaz Thailand property scraper for Property Scout.

Scrapes fazwaz.com for:
  Lane: thai_condo  — Freehold condos in Samui + Phuket (legal foreign ownership)
  Lane: thai_villa  — Villas with biggest price drops (distressed/nominee unwinding)

Output: ~/nanoclaw/property-scout/scrape-thailand-latest.json
"""

import json, re, time, sys
from playwright.sync_api import sync_playwright

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

OUT_PATH = "/Users/basicclaw777/nanoclaw/property-scout/scrape-thailand-latest.json"

# 1 SGD ≈ 25.5 THB ≈ 5.8 HKD (approximate, updated periodically)
SGD_TO_THB = 25.5
SGD_TO_HKD = 5.8

# Search configurations: (label, url, lane, sub_lane)
SEARCHES = [
    # Condos — legal freehold for foreigners
    ("Samui condo cheap", "https://www.fazwaz.com/condo-for-sale/thailand/surat-thani/koh-samui?order_by=price|asc", "thai_condo", "samui"),
    ("Samui condo new", "https://www.fazwaz.com/condo-for-sale/thailand/surat-thani/koh-samui?order_by=verification_at|desc", "thai_condo", "samui"),
    ("Phuket condo cheap", "https://www.fazwaz.com/condo-for-sale/thailand/phuket?order_by=price|asc", "thai_condo", "phuket"),
    ("Phuket condo new", "https://www.fazwaz.com/condo-for-sale/thailand/phuket?order_by=verification_at|desc", "thai_condo", "phuket"),
    ("Chiang Mai condo", "https://www.fazwaz.com/condo-for-sale/thailand/chiang-mai?order_by=price|asc", "thai_condo", "chiang_mai"),
    # Villas — price drops = distressed / nominee unwinding
    ("Samui villa drops", "https://www.fazwaz.com/villa-for-sale/thailand/surat-thani/koh-samui?order_by=price_reduction|desc", "thai_villa", "samui"),
    ("Phuket villa drops", "https://www.fazwaz.com/villa-for-sale/thailand/phuket?order_by=price_reduction|desc", "thai_villa", "phuket"),
    ("Samui villa cheap", "https://www.fazwaz.com/villa-for-sale/thailand/surat-thani/koh-samui?order_by=price|asc", "thai_villa", "samui"),
    ("Phuket villa value", "https://www.fazwaz.com/villa-for-sale/thailand/phuket?order_by=rate_sqm|asc", "thai_villa", "phuket"),
]


def parse_price_sgd(text):
    """Extract SGD price from text like '$499,000 SGD' or '$82,900 SGD'."""
    m = re.search(r'\$([\d,]+(?:\.\d+)?)\s*SGD', text)
    if m:
        return int(float(m.group(1).replace(",", "")))
    return None


def parse_price_per_sqm(text):
    """Extract per-sqm price from '($6,170 SGD/SqM)'."""
    m = re.search(r'\$([\d,]+(?:\.\d+)?)\s*SGD/SqM', text)
    if m:
        return int(float(m.group(1).replace(",", "")))
    return None


def parse_original_price(text):
    """Extract crossed-out original price (indicates price drop)."""
    prices = re.findall(r'\$([\d,]+(?:\.\d+)?)\s*SGD', text)
    if len(prices) >= 2:
        vals = [int(float(p.replace(",", ""))) for p in prices]
        return max(vals)
    return None


def parse_sqm(text):
    """Extract living area in SqM."""
    m = re.search(r'([\d,.]+)\s*SqM', text)
    if m:
        return float(m.group(1).replace(",", ""))
    return None


def parse_beds_baths(text):
    """Extract bedroom and bathroom counts."""
    beds = None
    baths = None
    if "Studio" in text:
        beds = 0
    else:
        m = re.search(r'(\d+)\s*Bedroom', text)
        if m:
            beds = int(m.group(1))
    m = re.search(r'(\d+(?:\.\d+)?)\s*Bathroom', text)
    if m:
        baths = float(m.group(1))
    return beds, baths


def parse_card(card_el, search_label, lane, sub_lane):
    """Parse a FazWaz listing card element into structured data."""
    try:
        txt = card_el.inner_text()
    except:
        return None

    if not txt or len(txt) < 50:
        return None

    # Get detail URL
    detail_link = card_el.locator('a[href*="/property-sales/"]').first
    href = None
    try:
        if detail_link.count() > 0:
            href = detail_link.get_attribute("href")
            if href and not href.startswith("http"):
                href = "https://www.fazwaz.com" + href
    except:
        pass

    if not href:
        return None

    # Get project/building name
    project_name = None
    try:
        proj_link = card_el.locator('a[href*="/projects/"]').first
        if proj_link.count() > 0:
            project_name = proj_link.inner_text().strip()
    except:
        pass

    # Parse prices
    price_sgd = parse_price_sgd(txt)
    if not price_sgd:
        return None

    original_price_sgd = parse_original_price(txt)
    ppsm = parse_price_per_sqm(txt)
    sqm = parse_sqm(txt)
    beds, baths = parse_beds_baths(txt)

    # Extract location
    location = None
    lines = [l.strip() for l in txt.split("\n") if l.strip()]
    for l in lines:
        if "Koh Samui" in l or "Phuket" in l or "Chiang Mai" in l:
            if len(l) < 60 and not "$" in l:
                location = l
                break

    # Property type
    prop_type = "unknown"
    if "Condo" in txt:
        prop_type = "condo"
    elif "Villa" in txt:
        prop_type = "villa"
    elif "House" in txt:
        prop_type = "house"
    elif "Apartment" in txt:
        prop_type = "apartment"
    elif "Townhouse" in txt:
        prop_type = "townhouse"

    # Extract tags
    tag_keywords = [
        "Leasehold", "Foreign Quota", "Freehold", "Off Plan",
        "Year Built", "Beachfront", "Sea View", "Ocean View",
        "Pool View", "Mountain View", "Garden View", "City View",
        "Private Pool", "Beach Access", "Pool Access",
        "Great Price", "Investment Opportunity", "Exclusive",
        "Oceanfront", "Ocean Access", "Verified Listing",
    ]
    tags = [t for t in tag_keywords if t in txt]

    # Extract beach distance
    beach_dist = None
    m = re.search(r'Beach\s+([\d.]+)\s*km', txt)
    if m:
        beach_dist = float(m.group(1))

    # ROI
    roi = None
    m = re.search(r'ROI:\s*([\d.]+)%', txt)
    if m:
        roi = float(m.group(1))

    # Est rent
    est_rent_sgd = None
    m = re.search(r'Est\.\s*Rent:\s*\$([\d,]+)\s*SGD/mo', txt)
    if m:
        est_rent_sgd = int(m.group(1).replace(",", ""))

    # CAM fee
    cam_fee_sgd = None
    m = re.search(r'CAM Fee:\s*\$([\d,]+)\s*SGD/mo', txt)
    if m:
        cam_fee_sgd = int(m.group(1).replace(",", ""))

    # Year built
    year_built = None
    m = re.search(r'Year Built (\d{4})', txt)
    if m:
        year_built = int(m.group(1))
    m2 = re.search(r'Off Plan (\d{4})', txt)

    # Price drop percentage
    price_drop_pct = None
    if original_price_sgd and original_price_sgd > price_sgd:
        price_drop_pct = round((1 - price_sgd / original_price_sgd) * 100, 1)

    return {
        "lane": lane,
        "sub_lane": sub_lane,
        "search": search_label,
        "project": project_name,
        "location": location,
        "price_sgd": price_sgd,
        "price_thb": round(price_sgd * SGD_TO_THB),
        "price_hkd": round(price_sgd * SGD_TO_HKD),
        "original_price_sgd": original_price_sgd,
        "price_drop_pct": price_drop_pct,
        "price_per_sqm_sgd": ppsm,
        "sqm": sqm,
        "bedrooms": beds,
        "bathrooms": baths,
        "property_type": prop_type,
        "tags": tags,
        "beach_km": beach_dist,
        "roi_pct": roi,
        "est_rent_sgd": est_rent_sgd,
        "cam_fee_sgd": cam_fee_sgd,
        "year_built": year_built,
        "url": href,
    }


def scrape_page(page, url, label, lane, sub_lane, results, max_cards=20):
    """Scrape one FazWaz search page."""
    try:
        page.goto(url, timeout=45000, wait_until="domcontentloaded")
        page.wait_for_timeout(4000)
    except Exception as e:
        print(f"  [{label}] nav error: {e}", file=sys.stderr)
        return

    # Dismiss cookie banner if present
    try:
        accept = page.locator("button:has-text('Accept')")
        if accept.count() > 0 and accept.first.is_visible():
            accept.first.click()
            page.wait_for_timeout(500)
    except:
        pass

    # Find listing cards — each card has a link to /property-sales/
    # Cards are siblings in the main content area
    detail_links = page.locator('a[href*="/property-sales/"]')
    n_links = detail_links.count()

    # Get unique card containers by going up to parent
    seen_hrefs = set()
    count = 0

    for i in range(min(n_links, max_cards * 3)):
        if count >= max_cards:
            break
        try:
            link = detail_links.nth(i)
            href = link.get_attribute("href")
            if not href or href in seen_hrefs:
                continue
            seen_hrefs.add(href)

            # Navigate up to find card container
            # The card container is typically 4-5 levels up from the detail link
            card = link
            for _ in range(6):
                parent = card.locator("..")
                if parent.count() > 0:
                    parent_text = ""
                    try:
                        parent_text = parent.first.inner_text()
                    except:
                        pass
                    if "SGD" in parent_text and "SqM" in parent_text:
                        card = parent.first
                        break
                    card = parent.first

            parsed = parse_card(card, label, lane, sub_lane)
            if parsed:
                results.append(parsed)
                count += 1
        except Exception:
            pass

    print(f"  [{label}] {count} listings scraped")


def apply_filters(results):
    """Apply budget and quality filters per lane."""
    filtered = []
    for r in results:
        if r["lane"] == "thai_condo":
            # Condos under $200K SGD (~฿5.1M)
            if r["price_sgd"] and r["price_sgd"] <= 200000:
                filtered.append(r)
        elif r["lane"] == "thai_villa":
            # Villas under $800K SGD (~฿20M) — wider net for distressed
            if r["price_sgd"] and r["price_sgd"] <= 800000:
                filtered.append(r)
        else:
            filtered.append(r)
    return filtered


def main():
    all_results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        ctx = browser.new_context(
            user_agent=UA,
            viewport={"width": 1366, "height": 900},
            locale="en-US",
            timezone_id="Asia/Bangkok",
        )
        page = ctx.new_page()

        try:
            for label, url, lane, sub_lane in SEARCHES:
                print(f"[thailand] {label}")
                scrape_page(page, url, label, lane, sub_lane, all_results)
                time.sleep(2)
        finally:
            browser.close()

    filtered = apply_filters(all_results)

    # Dedup by URL
    seen = set()
    deduped = []
    for r in filtered:
        key = r.get("url") or f"{r['project']}_{r['price_sgd']}"
        if key not in seen:
            seen.add(key)
            deduped.append(r)

    print(f"\n[thailand] Total raw: {len(all_results)}, filtered: {len(filtered)}, deduped: {len(deduped)}")
    by_lane = {}
    for r in deduped:
        k = f"{r['lane']}_{r['sub_lane']}"
        by_lane[k] = by_lane.get(k, 0) + 1
    for lane, count in sorted(by_lane.items()):
        print(f"  {lane}: {count}")

    # Flag notable listings
    notable = [r for r in deduped if r.get("price_drop_pct") and r["price_drop_pct"] > 10]
    if notable:
        print(f"\n[thailand] Notable price drops: {len(notable)}")
        for r in notable[:5]:
            print(f"  -{r['price_drop_pct']}% {r['project'] or 'Unknown'} — ${r['price_sgd']:,} SGD ({r['location']})")

    foreign_quota = [r for r in deduped if "Foreign Quota" in r.get("tags", [])]
    if foreign_quota:
        print(f"[thailand] Foreign quota available: {len(foreign_quota)}")

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(deduped, f, ensure_ascii=False, indent=2)
    print(f"[thailand] Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
