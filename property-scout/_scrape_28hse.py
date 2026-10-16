import json, re, time, sys
from playwright.sync_api import sync_playwright

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

# zone -> (area_prefix, district_code, district_name, display)
ZONES = {
    "Yau Tong / Lam Tin": ("a2", "dg123", "油塘", "Yau Tong / Lam Tin"),
    "Kwun Tong Town Centre": ("a2", "dg21", "觀塘", "Kwun Tong Town Centre"),
    "Tuen Mun Town Centre": ("a3", "dg48", "屯門", "Tuen Mun Town Centre"),
    "San Po Kong / Wong Tai Sin": ("a2", "dg32", "新蒲崗", "San Po Kong / Wong Tai Sin"),
    "Tsuen Wan": ("a3", "dg49", "荃灣", "Tsuen Wan"),
}

DISTRICT_KEYS = ["油塘", "觀塘", "牛頭角", "屯門", "新蒲崗", "黃大仙", "慈雲山", "荃灣", "大窩口", "葵涌", "葵芳", "藍田", "九龍灣"]

def parse_card(txt, href, zone):
    lines = [l.strip() for l in txt.split("\n") if l.strip()]
    out = {
        "zone": zone, "type": None, "title": None, "building": None,
        "address_raw": None, "floor_unit": None, "sqft": None, "ppsf": None,
        "price": None, "monthly": None, "agent": None, "photos": 0,
        "features": None, "url": href, "badge": None,
    }
    # photo count / badge
    if lines and re.fullmatch(r"\d+", lines[0]):
        out["photos"] = int(lines[0])
        lines = lines[1:]
    if lines and lines[0] in ("黃金", "置頂", "獨家", "業主盤"):
        out["badge"] = lines[0]
        lines = lines[1:]
    # area + ppsf
    m = re.search(r"(?:建築面積|實用面積|面積)[:：]?\s*([\d,]+)\s*呎\s*(?:@\s*([\d,]+))?", txt)
    if m:
        out["sqft"] = int(m.group(1).replace(",", ""))
        if m.group(2):
            out["ppsf"] = int(m.group(2).replace(",", ""))
    # price
    m = re.search(r"售\s*\$?\s*([\d,]+)\s*萬", txt)
    if m:
        out["type"] = "sale"
        out["price"] = int(m.group(1).replace(",", "")) * 10000
    else:
        m = re.search(r"租\s*\$?\s*([\d,]+)", txt)
        if m:
            out["type"] = "rent"
            out["monthly"] = int(m.group(1).replace(",", ""))
    # building / address line: contains a district key
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
    # agent: line immediately before price line OR contains 物業/代理/行/置業/地產
    for i, l in enumerate(lines):
        if l.startswith("售") or l.startswith("租"):
            if i >= 1 and lines[i-1] and not re.search(r"呎|面積", lines[i-1]):
                out["agent"] = lines[i-1].strip()
            break
    # title: first substantive line (after badge) that isn't building/price/area/agent
    for l in lines:
        if l and not l.startswith(("售", "租", "建築", "實用")) and "呎" not in l:
            if l != out["agent"] and l != out["address_raw"] and l != out["building"]:
                if not out["title"]:
                    out["title"] = l
    # features: line with 工商大廈 / 寫字樓 etc.
    for l in lines:
        if "工商" in l or "寫字樓" in l or "業主盤" in l:
            out["features"] = l
            break
    return out

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    ctx = browser.new_context(user_agent=UA, viewport={"width": 1366, "height": 900},
                              locale="zh-HK", timezone_id="Asia/Hong_Kong")
    page = ctx.new_page()
    all_units = []
    try:
        for zone, (area, dg, dname, disp) in ZONES.items():
            for typ, seg in (("sale", "buy"), ("rent", "rent")):
                url = f"https://www.28hse.com/{seg}/office/{area}/{dg}/housetype-industrail_building"
                try:
                    page.goto(url, timeout=40000, wait_until="domcontentloaded")
                    page.wait_for_timeout(3500)
                except Exception as e:
                    print(f"[{zone}/{typ}] nav error: {e}", file=sys.stderr)
                    continue
                cards = page.locator("div.item.property_item")
                n = cards.count()
                print(f"[{zone}/{typ}] {url} -> {n} cards")
                for i in range(n):
                    c = cards.nth(i)
                    try:
                        txt = c.inner_text()
                        href = c.locator("a.detail_page").first.get_attribute("href")
                        u = parse_card(txt, href, disp)
                        # filter to gym target range (allow 600-2500 sqft)
                        if u["sqft"] and 600 <= u["sqft"] <= 2500:
                            all_units.append(u)
                    except Exception as e:
                        print(f"  card {i} err: {e}", file=sys.stderr)
                time.sleep(1.5)
    finally:
        browser.close()

    print(f"\nTOTAL in-range units: {len(all_units)}")
    out_path = "/Users/basicclaw777/nanoclaw/property-scout/_scrape_raw.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(all_units, f, ensure_ascii=False, indent=2)
    print("WROTE", out_path)
