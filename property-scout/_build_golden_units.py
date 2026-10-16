#!/usr/bin/env python3
"""Build golden-zone-units.json from fresh 28Hse scrape + golden-zones.json metadata."""
import json, re

RAW = "/Users/basicclaw777/nanoclaw/property-scout/_refresh_raw.json"
ZONES = "/Users/basicclaw777/nanoclaw/property-scout/golden-zones.json"
OUT = "/Users/basicclaw777/nanoclaw/property-scout/golden-zone-units.json"

METADATA = {
    "Yau Tong / Lam Tin": {
        "zone_rank": 1, "district_en": "Yau Tong, Kwun Tong",
        "mtr": "Yau Tong MTR (dual-line interchange) ~300-400m",
        "schools": "7 schools within 500m (St. Paul's Lam Tin, Nord Anglia, SKH schools)",
        "buy_range": (2_500_000, 5_000_000), "rent_range": (9_800, 19_000),
    },
    "Kwun Tong Town Centre": {
        "zone_rank": 2, "district_en": "Kwun Tong",
        "mtr": "Kwun Tong MTR ~300-500m",
        "schools": "6 schools within 1km",
        "buy_range": (4_000_000, 6_000_000), "rent_range": (12_000, 25_000),
    },
    "Tuen Mun Town Centre": {
        "zone_rank": 3, "district_en": "Tuen Mun",
        "mtr": "Tuen Mun MTR + Light Rail ~500m",
        "schools": "5 schools within 500m",
        "buy_range": (1_800_000, 3_000_000), "rent_range": (9_000, 15_000),
    },
    "San Po Kong / Wong Tai Sin": {
        "zone_rank": 4, "district_en": "San Po Kong, Wong Tai Sin",
        "mtr": "Diamond Hill MTR ~600m / Wong Tai Sin MTR ~800m",
        "schools": "6 schools within 1km",
        "buy_range": (4_500_000, 6_000_000), "rent_range": (14_000, 22_000),
    },
    "Tsuen Wan": {
        "zone_rank": 5, "district_en": "Tsuen Wan",
        "mtr": "Tsuen Wan West MTR ~400m / Tsuen Wan MTR ~600m",
        "schools": "5 schools within 1km",
        "buy_range": (2_500_000, 4_000_000), "rent_range": (10_000, 16_000),
    },
}

FITNESS_OK = ["運動", "體育", "健身", "教班", "教育", "教室", "興趣班", "興趣課程",
              "補習", "瑜伽", "舞蹈", "會所", "教會"]
FITNESS_NEUTRAL = ["工貿", "各行業", "寫字樓", "商舖", "美容", "網購"]
WATER = ["內廁", "洗手間", "廁所", "水"]
CEILING = ["高樓底", "特高樓底", "14呎", "樓底"]
HIGH_FLOOR = ["高層", "高樓"]
LOW_FLOOR = ["地下", "低層", "地面"]

def classify_fitness(title, tags):
    t = (title or "") + " ".join(tags or [])
    if any(k in t for k in FITNESS_OK):
        return "Listing explicitly permits education/sports use"
    if any(k in t for k in FITNESS_NEUTRAL):
        return "Commercial/工貿 use stated — fitness/education DMC check required"
    return "Check DMC — standard industrial, verify fitness/education use"

def ceiling(title):
    t = title or ""
    if "特高樓底" in t or "14呎" in t:
        return "Extra-high ceiling (listed)"
    if "高樓底" in t or "樓底" in t:
        return "High ceiling (listed)"
    return "TBC — verify on viewing"

def pros_cons(u, tx, title, tags, meta):
    t = (title or "") + " " + " ".join(tags or [])
    pros, cons = [], []
    if tx == "sale":
        pp = round(u["price"] / u["sqft"]) if u["price"] else None
        if pp and pp <= 2600:
            pros.append(f"Value at ${pp:,}/sf")
        if pp and pp >= 5000:
            cons.append(f"Premium at ${pp:,}/sf")
    else:
        psf = round(u["monthly_rent"] / u["sqft"], 1)
        if psf <= 12:
            pros.append(f"Cheap at ${psf}/sf rent")
        if psf >= 22:
            cons.append(f"High at ${psf}/sf rent")
    if any(k in t for k in WATER):
        pros.append("Internal toilet/water supply (showers possible)")
    if any(k in t for k in CEILING):
        pros.append("High ceiling noted")
    if any(k in t for k in ["交吉", "即買即用", "即用", "新裝修", "雅緻", "豪華", "靚裝"]):
        pros.append("Vacant and fitted — buy/rent and use")
    if any(k in t for k in HIGH_FLOOR):
        cons.append("High floor — kids accessibility / heavy-bag ceiling check")
    if any(k in t for k in ["業主盤"]):
        pros.append("Direct owner — no agency fee")
    if u["badge"] in ("獨家", "獨家盤"):
        pros.append("Exclusive listing")
    if any(k in t for k in ["免佣", "免佣"]) :
        pros.append("Agent-fee waived (免佣)")
    if any(k in t for k in ["劈價", "蝕讓", "急售", "一減再減", "平", "筍", "筍盤"]):
        pros.append("Distressed/negotiable pricing signal")
    if any(k in t for k in ["車到", "貨櫃", "貨車", "車場", "車埸", "貨梯", "貨𨋢"]):
        pros.append("Goods/vehicle access")
    if not u["photos"]:
        cons.append("No photos in listing")
    return pros, cons

def main():
    raw = json.load(open(RAW))
    zones = json.load(open(ZONES))
    units = [u for u in raw["units"] if u["sqft"] and 800 <= u["sqft"] <= 2000]
    out = []
    for u in units:
        meta = METADATA[u["golden_zone"]]
        tx = u["tx_type"]
        price = u["price"] if tx == "sale" else None
        monthly = u["monthly_rent"] if tx == "rent" else None
        ppsf = round(price / u["sqft"]) if price else (round(monthly / u["sqft"], 1) if monthly else None)
        in_budget = False
        if tx == "sale" and price:
            in_budget = meta["buy_range"][0] <= price <= meta["buy_range"][1]
        elif tx == "rent" and monthly:
            in_budget = meta["rent_range"][0] <= monthly <= meta["rent_range"][1]

        title = u["title"] or ""
        tags = u["tags"] or []
        pros, cons = pros_cons(u, tx, title, tags, meta)

        bldg = u["building"]
        if bldg in ("觀塘", "油塘", "屯門", "荃灣", "新蒲崗", "黃大仙", "牛頭角", "藍田"):
            bldg = None  # only district anchor captured — building name missing from card
        address = f"{bldg}, {meta['district_en']}" if bldg else meta["district_en"]

        out.append({
            "golden_zone": u["golden_zone"],
            "zone_rank": meta["zone_rank"],
            "address": address,
            "building": bldg,
            "floor_unit": None,
            "sqft": u["sqft"],
            "type": tx,
            "price": price,
            "price_per_sqft": ppsf,
            "monthly_cost": monthly,
            "ceiling_height": ceiling(title),
            "source": "28Hse",
            "source_url": u["url"],
            "days_on_market": None,
            "agent": u["agent"],
            "agent_phone": None,
            "photos": bool(u["photos"]),
            "nearest_school_cluster": meta["schools"],
            "nearest_mtr": meta["mtr"],
            "fitness_use_allowed": classify_fitness(title, tags),
            "in_budget": in_budget,
            "pros": pros,
            "cons": cons,
            "notes": (title + (" | tags: " + ", ".join(tags) if tags else "")).strip(),
        })

    # sort: in_budget first, then zone_rank, then sale before rent, then cheaper per-sf first
    out.sort(key=lambda x: (
        0 if x["in_budget"] else 1,
        x["zone_rank"],
        0 if x["type"] == "sale" else 1,
        x["price_per_sqft"] if x["price_per_sqft"] is not None else 10**9,
    ))

    json.dump(out, open(OUT, "w"), ensure_ascii=False, indent=2)
    nb = sum(1 for x in out if x["in_budget"])
    print(f"WROTE {len(out)} units -> {OUT}")
    print(f"  in_budget: {nb}")
    for x in out:
        flag = "OK " if x["in_budget"] else "   "
        amt = f"${x['price']/1e6:.2f}M" if x["type"]=="sale" else f"${x['monthly_cost']}/mo"
        print(f"  {flag} R{x['zone_rank']} {x['golden_zone'][:14]:14} {(x['building'] or '(bldg tbc)'):16} {x['sqft']:>4}sf {amt:>11} {x['fitness_use_allowed'][:38]}")

if __name__ == "__main__":
    main()
