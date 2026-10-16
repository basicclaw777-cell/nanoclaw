import json, os
base = os.path.dirname(os.path.abspath(__file__))

units = json.load(open(os.path.join(base, "golden-zone-units.json")))
db = json.load(open(os.path.join(base, "_dd_base.json")))
ex = json.load(open(os.path.join(base, "_dd_extract.json")))

db = [d for d in db if isinstance(d, dict)]
ex_by_pid = {k: v for k, v in ex.items()}

# building-level fallback: prefer richest record per building
def richer(a, b):
    def score(r):
        s = 0
        for k in ("mgmt_fee_sqft","completion_date","address_street","nearby_schools","comparable_sales","transactions"):
            v = r.get(k)
            if v not in (None, "", [], {}):
                s += 1
        return s
    return a if score(a) >= score(b) else b

building_map = {}
for d in db:
    b = d.get("building")
    if not b or b in ("UNKNOWN-SPK",):
        continue
    building_map[b] = richer(building_map.get(b, {}), d)
for pid, d in ex_by_pid.items():
    b = d.get("_building")
    if not b or b in ("UNKNOWN-SPK",):
        continue
    norm = {k: d.get(k) for k in ("mgmt_fee_sqft","completion_date","age_years","address")}
    norm["address_street"] = d.get("address")
    norm["nearby_schools"] = d.get("nearby_schools")
    norm["comparable_sales"] = d.get("transactions")
    norm["building"] = b
    building_map[b] = richer(building_map.get(b, {}), norm)

def resolve_building(u):
    b = u.get("building")
    if b:
        return b
    if u.get("golden_zone") == "Kwun Tong Town Centre" and u.get("sqft") == 1021:
        return "華成工商中心"
    if u.get("golden_zone") == "San Po Kong / Wong Tai Sin":
        if u.get("sqft") == 1732:
            return "新蒲崗未識別寫字樓 (1732呎盤)"
        if u.get("sqft") == 1722:
            return "新蒲崗未識別寫字樓 (1722呎盤)"
    return "未識別"

sale = [u for u in units if u.get("type") == "sale"]
rows = []
for u in sale:
    pid = None
    if u.get("source_url"):
        import re
        m = re.search(r"property-(\d+)", u["source_url"])
        pid = m.group(1) if m else None
    exd = ex_by_pid.get(pid) if pid else None
    bm = building_map.get(resolve_building(u), {})
    def pick(a, b, c):
        for v in (a, b, c):
            if v not in (None, "", [], {}):
                return v
        return None
    row = {
        "zone": u.get("golden_zone"),
        "zone_rank": u.get("zone_rank"),
        "building": resolve_building(u),
        "building_orig": u.get("building"),
        "address": u.get("address"),
        "street": pick((exd or {}).get("address"), bm.get("address_street"), u.get("address")),
        "sqft": u.get("sqft"),
        "price": u.get("price"),
        "psf": u.get("price_per_sqft"),
        "pid": pid,
        "source_url": u.get("source_url"),
        "agent": u.get("agent"),
        "notes": u.get("notes"),
        "mgmt_fee_sqft": pick((exd or {}).get("mgmt_fee_sqft"), bm.get("mgmt_fee_sqft"), None),
        "completion_date": pick((exd or {}).get("completion_date"), bm.get("completion_date"), None),
        "age_years": pick((exd or {}).get("age_years"), bm.get("age_years"), None),
        "nearby_schools": pick((exd or {}).get("nearby_schools"), bm.get("nearby_schools"), []),
        "transactions": pick((exd or {}).get("transactions"), bm.get("comparable_sales"), []),
        "price_trend": bm.get("price_trend"),
    }
    rows.append(row)

json.dump(rows, open(os.path.join(base, "_dd_units_final.json"), "w"), ensure_ascii=False, indent=1)

print(f"{len(rows)} units")
# compact summary with fill status
for i, r in enumerate(rows, 1):
    fill = []
    if r["mgmt_fee_sqft"]: fill.append("mgmt")
    if r["completion_date"]: fill.append("completion")
    if r["nearby_schools"]: fill.append("schools")
    if r["transactions"]: fill.append("tx")
    f = "+".join(fill) if fill else "MISSING"
    print(f"{i:2d}. [{r['zone_rank']}] {r['building']} {r['sqft']}sf ${r['price']/1e4:.0f}萬  [{f}]")
