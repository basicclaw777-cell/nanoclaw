import json, re, os

base = os.path.dirname(os.path.abspath(__file__))

with open(os.path.join(base, "golden-zone-units.json")) as f:
    units = json.load(f)

# _dd_extract is keyed by pid; _dd_base is a list with pid field
with open(os.path.join(base, "_dd_extract.json")) as f:
    extract = json.load(f)

with open(os.path.join(base, "_dd_base.json")) as f:
    dbase = json.load(f)

dbase_by_pid = {d.get("pid"): d for d in dbase if isinstance(d, dict)}

def pid_from_url(url):
    if not url:
        return None
    m = re.search(r"property-(\d+)", url)
    return m.group(1) if m else None

sale = [u for u in units if u.get("type") == "sale"]

rows = []
for u in sale:
    pid = pid_from_url(u.get("source_url"))
    ex = extract.get(pid) if pid else None
    db = dbase_by_pid.get(pid) if pid else None
    row = {
        "zone": u.get("golden_zone"),
        "zone_rank": u.get("zone_rank"),
        "building": u.get("building"),
        "address": u.get("address"),
        "sqft": u.get("sqft"),
        "price": u.get("price"),
        "psf": u.get("price_per_sqft"),
        "pid": pid,
        "source_url": u.get("source_url"),
        "agent": u.get("agent"),
        "notes": u.get("notes"),
        "street": (ex or {}).get("address") or (db or {}).get("address_street"),
        "mgmt_fee_sqft": (ex or {}).get("mgmt_fee_sqft") or (db or {}).get("mgmt_fee_sqft"),
        "completion_date": (ex or {}).get("completion_date") or (db or {}).get("completion_date"),
        "age_years": (ex or {}).get("age_years") or (db or {}).get("age_years"),
        "nearby_schools": (ex or {}).get("nearby_schools") or (db or {}).get("nearby_schools"),
        "transactions": (ex or {}).get("transactions") or (db or {}).get("comparable_sales"),
        "price_trend": (db or {}).get("price_trend"),
    }
    rows.append(row)

print("TOTAL SALE UNITS:", len(rows))
buildings = {}
for r in rows:
    buildings.setdefault(r["building"], []).append(r)
print("DISTINCT BUILDINGS:", len(buildings))
for b, rs in sorted(buildings.items(), key=lambda x: -len(x[1])):
    print(f"  {b}: {len(rs)} unit(s)")

with open(os.path.join(base, "_dd_units_merged.json"), "w") as f:
    json.dump(rows, f, ensure_ascii=False, indent=1)
print("WROTE _dd_units_merged.json")
