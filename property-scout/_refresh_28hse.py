#!/usr/bin/env python3
"""Refresh 28Hse golden-zone industrial listings (sale + rent). Raw-HTML card parser."""
import json, re, sys, time, urllib.request, html

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

ZONES = [
    ("Yau Tong / Lam Tin", "dg123", "a2"),
    ("Kwun Tong Town Centre", "dg21", "a2"),
    ("Tuen Mun Town Centre", "dg48", "a3"),
    ("San Po Kong / Wong Tai Sin", "dg32", "a2"),
    ("Tsuen Wan", "dg49", "a3"),
]

def fetch(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA,
                "Accept-Language": "zh-HK,zh;q=0.9,en;q=0.8",
            })
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:
            last = e
            time.sleep(2 * (i + 1))
    raise last

def txt(s):
    s = re.sub(r"<[^>]+>", "", s)
    return html.unescape(s).strip()

def parse_card(block, zone, tx_default):
    # property url
    m = re.search(r'href="(https://www\.28hse\.com/[^"]+property-\d+[^"]*)"', block)
    url = m.group(1) if m else None

    # title (header link)
    m = re.search(r'header[^>]*>.*?<a[^>]*href="[^"]*"[^>]*>(.*?)</a>', block, flags=re.S)
    title = txt(m.group(1)) if m else None

    # district + building (district_area anchors)
    m = re.search(r'class="district_area.*?</div>', block, flags=re.S)
    district = building = None
    if m:
        anchors = re.findall(r'<a[^>]*>([^<]+)</a>', m.group(0))
        anchors = [txt(a) for a in anchors if txt(a)]
        if anchors:
            district = anchors[0]
            building = anchors[-1] if len(anchors) > 1 else anchors[0]

    # area + ppsf
    m = re.search(r'(建築面積|實用面積|面積)[:：]?\s*([\d,]+)\s*呎(?:\s*@\s*([\d,]+)\s*元)?', block)
    sqft = ppsf = None
    if m:
        sqft = int(m.group(2).replace(",", ""))
        if m.group(3):
            ppsf = int(m.group(3).replace(",", ""))

    # price / rent — anchored to the colored price label div
    m = re.search(r'(?:red|green) large label[^>]*>\s*(售|租)\s*\$?\s*([\d,]+(?:\.\d+)?)', block)
    price = monthly = None
    if m:
        kind, num = m.group(1), m.group(2)
        if kind == "售":
            tx_default = "sale"
            price = int(float(num.replace(",", "")) * 10000)
        else:
            tx_default = "rent"
            monthly = int(num.replace(",", ""))
    else:
        m = re.search(r'售\s*\$?\s*([\d,]+(?:\.\d+)?)\s*萬', block)
        if m:
            tx_default = "sale"
            price = int(float(m.group(1).replace(",", "")) * 10000)
        else:
            m = re.search(r'租\s*\$?\s*([\d][\d,]*)', block)
            if m:
                tx_default = "rent"
                monthly = int(m.group(1).replace(",", ""))

    # agent
    m = re.search(r'class="companyName"[^>]*>(.*?)</div>', block, flags=re.S)
    agent = txt(m.group(1)) if m else None

    # photo count
    m = re.search(r'myimage_count.*?<span[^>]*>\s*(\d+)', block, flags=re.S)
    photos = int(m.group(1)) if m else 0

    # tags
    tags = [txt(t) for t in re.findall(r'class="ui\s+label">([^<]+)</div>', block)]
    tags = [t for t in tags if t]

    # badge (黃金/置頂/獨家/業主盤) — appears as a ribbon/label near image
    badge = None
    for b in ("黃金", "置頂", "獨家", "業主盤"):
        if b in block[:600]:
            badge = b
            break

    return {
        "golden_zone": zone, "building": building, "district": district,
        "sqft": sqft, "ppsf": ppsf, "price": price, "monthly_rent": monthly,
        "tx_type": tx_default, "agent": agent, "photos": photos,
        "badge": badge, "title": title, "url": url, "tags": tags,
    }

def scrape(url, zone, tx_default):
    raw = fetch(url)
    blocks = re.split(r'class="item property_item', raw)[1:]
    results = []
    for b in blocks:
        u = parse_card(b, zone, tx_default)
        if u["price"] or u["monthly_rent"]:
            results.append(u)
    return results

def main():
    import datetime
    out = {"generated": datetime.date.today().isoformat(),
           "source": "28Hse.com live search (server-rendered)",
           "units": []}
    for zone, dg, area in ZONES:
        for tx, tpath in (("sale", "buy"), ("rent", "rent")):
            url = f"https://www.28hse.com/{tpath}/office/{area}/{dg}/housetype-industrail_building"
            try:
                res = scrape(url, zone, tx)
                print(f"[{zone} {tx}] {len(res)} cards", file=sys.stderr)
                out["units"].extend(res)
            except Exception as e:
                print(f"[{zone} {tx}] ERROR {e}", file=sys.stderr)
            time.sleep(0.8)
    with open("/Users/basicclaw777/nanoclaw/property-scout/_refresh_raw.json", "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"TOTAL {len(out['units'])} units", file=sys.stderr)

if __name__ == "__main__":
    main()
