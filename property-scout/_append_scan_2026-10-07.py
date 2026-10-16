#!/usr/bin/env python3
"""Global Property Scout — 2026-10-07 batch (GL057–GL061).

Appends five new opportunities to global-listings.json and writes a dated
snapshot to global-history/global-2026-10-07.json. Money fields are computed
from live FX (er-api.com, base HKD, fetched 2026-10-06) so asking_hkd and
price_per_sqft_hkd stay internally consistent.

Headline of this scan is a RISK signal, not a new deal: the Thailand nominee
crackdown (forum-signals-latest.json, scraped 2026-10-04) — raids across
Bangkok, Phuket, Pattaya, Samui and Koh Tao dismantling Chinese/Russian nominee
villa-and-land structures. This validates the 'condo foreign-quota only, never
nominee' stance and redirects the Thailand thesis. This batch closes out the
remaining request-file wildcards (Colombia, Dubai, Albania, Bali) and shows the
fresh FazWaz scrape (tourist-island heavy) honestly rather than recommending it.

Search backend DEGRADED again this scan (web_search returned zero results).
Geographic facts verified via Wikipedia REST summary API (Medellín = 2nd city
of Colombia / Antioquia capital, 2.43M; Tirana = Albania capital; Dubai = most
populous UAE city, 4M, 92% expat). Listing-level asking prices are CALIBRATED
ESTIMATES against established market context — NOT verified live listings —
except GL061, which is a real FazWaz listing from this week's scrape.
"""

import json, os

BASE = os.path.dirname(os.path.abspath(__file__))
LISTINGS = os.path.join(BASE, "global-listings.json")
SNAPSHOT = os.path.join(BASE, "global-history", "global-2026-10-07.json")

# Live FX: HKD per 1 unit of foreign currency (er-api.com/v6/latest/HKD, 2026-10-06)
HKD_PER = {
    "COP": 1 / 418.589439,   # Colombian peso
    "AED": 1 / 0.468014,     # UAE dirham
    "ALL": 1 / 10.461419,    # Albanian lek
    "IDR": 1 / 2278.197569,  # Indonesian rupiah
    "THB": 1 / 4.293834,     # Thai baht
}

SCAN_DATE = "2026-10-07"

new_entries = [
    {
        "id": "GL057",
        "region": "other",
        "city": "Medellín",
        "district": "Laureles / Estadio",
        "type": "condo",
        "purpose": "mixed",
        "asking_local": 300000000,
        "currency": "COP",
        "sqft": 700,
        "yield_estimate_pct": 7.5,
        "status": "wildcard",
        "address": "Laureles, near Segundo Parque de Laureles",
        "source": "Fincaraiz / Properati (verify)",
        "source_url": "https://www.fincaraiz.com.co",
        "visa_angle": "HK/BNO passport visa-free entry (90 days, extendable to 180/yr — confirm current terms). Long-stay via the Digital Nomad visa (Visa V Nómadas Digitales — confirm current income floor) or a rentista/investment residence. Not a citizenship play; a long-stay base.",
        "ownership_structure": "Freehold, direct — Colombia allows full foreign ownership with no nominee and no trust. Clean title (certificado de tradición y libertad) is the one due-diligence item to do properly.",
        "why_paul": "Colombia is the hemisphere's other great boxing nation, and you haven't looked at it. Antioquia — the state Medellín anchors — produces world champions and a deep amateur pipeline; the city has real fight gyms, not fitness-brand boxing. Laureles is the barrio that fits your taste exactly: flat, walkable, tree-lined, a genuine food culture (bandeja paisa, arepas on every corner), working-class roots gentrifying on their own terms — not a tourist zone, not an expat compound. A 700 sqft apartment for ~HK$717K, roughly a third of the equivalent CDMX price and a tenth of HK. It is the authenticity-per-dollar play that Guadalajara was last scan, one country south.",
        "what_you_havent_considered": "Colombia has the strongest professional boxing + MMA culture in South America and one of the best in the world per capita, with Medellín and Antioquia as its heart. The peso has been weak, so hard-currency buyers acquire at a structural discount. Laureles' cafe and restaurant density is exactly what your bagel/coffee model needs, and the city has cultivated a decade of remote-worker inflow — but in Laureles it is still local-first, not a gringo ghetto.",
        "trap_warnings": "Safety is the honest one: Medellín is dramatically safer than 20 years ago, but it is barrio-by-barrio — pick Laureles/Estadio/Belén, never chase the cheapest price into an unknown street. The peso is volatile; underwrite in USD. Transfer costs + notary fees run ~3-5%. Yields are high but tenant protection is strong — eviction is slow. Verify the long-stay visa income threshold before committing.",
        "local_insider_note": "Laureles and Estadio are the flat, walkable, food-first districts locals actually live in — the creative middle class, not the Poblado expat premium. The Universidad Pontificia Bolivariana and Atanasio Girardot stadium anchor a steady student + professional rental pool.",
        "rental_market": "7-8% gross in Laureles/Estadio to local professionals and remote workers. Airbnb is strong but Medellín has been tightening short-term rules — underwrite long-term.",
        "exit_strategy": "Resale to Colombian professionals or the next foreign buyer. Peso recovery is the appreciation lever; this is a hold, not a flip.",
        "gym_potential": "Colombia is a boxing nation — a Cuban-school gym in Medellín is on-brand and welcomed. Commercial rent in Laureles is low, and the local combat-sports scene gives a built-in member base and sparring culture.",
        "scan_date": SCAN_DATE,
    },
    {
        "id": "GL058",
        "region": "other",
        "city": "Dubai",
        "district": "Jumeirah Village Circle (JVC) / Al Quoz",
        "type": "condo",
        "purpose": "investment",
        "asking_local": 850000,
        "currency": "AED",
        "sqft": 700,
        "yield_estimate_pct": 7.0,
        "status": "interesting",
        "address": "JVC, near Circle Mall",
        "source": "Property Finder / Bayut (verify)",
        "source_url": "https://www.propertyfinder.ae",
        "visa_angle": "Golden visa at AED 2M property (≈HK$4.3M, at your ceiling). Below that: freelance/self-sponsored or a business (gym) license visa. No personal income tax is the real draw, not the visa class.",
        "ownership_structure": "Freehold in designated zones (JVC, Marina, Downtown, etc.) — foreigners own outright. Elsewhere is 99-year leasehold. Check the zone map before anything.",
        "why_paul": "The zero-tax case is real, and so is the fitness culture — Dubai is a genuine combat-sports hub (UFC/MMA events, world-class boxing gyms) with real money in fitness/F&B. But it is the opposite of your 'authenticity over polish' taste: 92% expat, developer-driven, built on air conditioning and highways, not old bones. Flagging it as worth tracking, not a buy — the yield is high (7%+ gross) and foreign freehold is clean, but the community is not yours.",
        "what_you_havent_considered": "The golden-visa property route starts at AED 2M (≈HK$4.3M), at/above your ceiling — so the real path is a self-sponsored/freelance or gym-business visa, not property. The fitness/boxing market is booming and under-supplied for an authentic, coach-led Cuban-school gym — a gap in a city full of slick franchise gyms.",
        "trap_warnings": "Service charges are high and rising (AED 12-20/sqft/yr) and eat the headline yield — net is closer to 5-6%. Mid-market freehold zones (JVC/Arjan) have an oversupply problem; resale is competitive. The market is developer-driven and cyclical (it fell ~25% in 2014-16 and again in 2020). Never buy off-plan from renderings. Confirm freehold vs leasehold on the specific unit.",
        "local_insider_note": "JVC is the value end-user play (young professionals priced out of Marina/Downtown). Al Quoz is the warehouse/arts district — the closest thing Dubai has to 'old bones' — and where an industrial-boxing-gym concept would actually land with character.",
        "rental_market": "6-8% gross headline in JVC/Arjan; 5-6% net of service charges. Strong demand from a constant 92%-expat churn.",
        "exit_strategy": "Resale to the next expat buyer or investor. Liquid but competitive; new developer supply is the structural headwind.",
        "gym_potential": "A boxing/F&B concept in a freehold-adjacent commercial space is viable — the market pays for premium fitness. First-mover gap for an authentic coach-led gym in a market of franchises.",
        "scan_date": SCAN_DATE,
    },
    {
        "id": "GL059",
        "region": "other",
        "city": "Tirana",
        "district": "Blloku / Komuna e Parisit",
        "type": "condo",
        "purpose": "investment",
        "asking_local": 12500000,
        "currency": "ALL",
        "sqft": 970,
        "yield_estimate_pct": 4.5,
        "status": "wildcard",
        "address": "Blloku, near the former Enver Hoxha villa block",
        "source": "Alaproperty / Century 21 Albania (verify)",
        "source_url": "https://www.alaproperty.com",
        "visa_angle": "HK/BNO visa-free 90 days. Residency via property purchase or self-employment is straightforward (confirm current terms). EU accession would eventually bring movement rights — that is the long play.",
        "ownership_structure": "Freehold for foreigners — Albania opened up to foreign ownership, but do full title due diligence; a unit's legalization history (informal construction) matters.",
        "why_paul": "The pre-EU-accession wildcard. Albania is an EU candidate with accession talks in motion, and it is the cheapest capital city in Europe — Tirana runs ~€1,300-1,700/sqm where Lisbon runs €4,000+. It has the working-class energy and food culture you like (byrek, tavë kosi, a real street-food scene) and is genuinely undiscovered by the property crowd. But it is a 5-10 year accession thesis, not a cash-flow play, and the market is thin.",
        "what_you_havent_considered": "Albania has a large, loyal diaspora that sends money home and buys apartments — that is the structural demand floor. The Albanian Riviera is Europe's fastest-growing tourism market and pulls secondary demand into Tirana. HK/BNO get visa-free entry and residency for foreigners is straightforward.",
        "trap_warnings": "The most 'watch, don't rush' entry on this list. Title/legalization diligence is essential — some older buildings have informal construction status. Liquidity is thin; do not assume a quick resale. Rental demand is shallow outside Tirana's core and the tourist season. Verify the specific unit's title and any legalization certificate before any exchange.",
        "local_insider_note": "Blloku is the former restricted party quarter turned cafe/bar district — the walkable, food-first heart. Komuna e Parisit is the quieter adjacent residential pocket. Universities anchor a young professional rental pool.",
        "rental_market": "4-5% gross in Blloku to young professionals and diaspora-linked tenants; stronger near universities. Seasonal tourist rental is a separate, growing lane.",
        "exit_strategy": "Long hold (5-10yr) for EU accession + tourism to price in. Resale to the diaspora or the next foreign buyer as the market deepens.",
        "gym_potential": "A boxing/F&B concept is a genuine first-mover in Tirana — the fitness scene is young and growing fast, and commercial rent is low.",
        "scan_date": SCAN_DATE,
    },
    {
        "id": "GL060",
        "region": "other",
        "city": "Canggu",
        "district": "Pererenan / Canggu",
        "type": "house",
        "purpose": "lifestyle",
        "asking_local": 3500000000,
        "currency": "IDR",
        "sqft": 1076,
        "yield_estimate_pct": 6.0,
        "status": "watch",
        "address": "Canggu, near Batu Bolong",
        "source": "Lamudi / Rumah123 (verify)",
        "source_url": "https://www.lamudi.co.id",
        "visa_angle": "Visa-on-arrival / tourist for HK, plus a remote-worker / second-home visa (confirm current terms). Not a path to ownership.",
        "ownership_structure": "Leasehold (hak sewa) or use-right (hak pakai) only for foreigners — no freehold, ever, without a (prosecutable) nominee. This fails your sovereignty test, and that is the point of flagging it.",
        "why_paul": "You asked me to flag Bali honestly, so: the lifestyle is real, the surf/fight/fitness culture is real, and the yield numbers agents quote are real on paper — but you cannot own freehold in Indonesia, full stop. Foreigners buy leasehold (25-30yr) or use-right via a structure that is the exact nominee risk Thailand is now prosecuting. That is a hard no for your sovereignty rule, whatever the gross yield says.",
        "what_you_havent_considered": "Indonesia has run its own nominee crackdowns on Bali land — the same pattern as Thailand, same legal exposure. The '6-8% tourist-villa yield' agents quote is seasonal, staffed and legally grey; your real long-term yield is lower and the capital risk is the lease burning down toward zero.",
        "trap_warnings": "The leasehold term is the asset — a 25-year lease is a wasting asset, not ownership. Foreigners cannot own freehold land. Nominee structures are being prosecuted. Canggu is the definition of a 'digital nomad premium' market — exactly what you reject. Underwrite this as 'do not buy', or at most a short, cheap lease for lifestyle, never as an investment.",
        "local_insider_note": "Canggu/Pererenan is a surf-and-remote-work enclave that has already repriced well above its fundamentals. The 'quiet village' it was five years ago is gone; it is now a premium-priced transient market.",
        "rental_market": "Gross tourist-villa yields 6-8% headline, but net of staffing/seasonality/management it is 3-4% and the lease is depleting. Not an investment for you.",
        "exit_strategy": "Resale of the remaining lease term to the next foreign buyer. Thin and structurally depreciating.",
        "gym_potential": "Fight/fitness tourism is genuine (Canggu has a real Muay Thai/BJJ scene), so a gym could work as an operating business on a short lease — but that is a business lease, not a property buy.",
        "scan_date": SCAN_DATE,
    },
    {
        "id": "GL061",
        "region": "thailand",
        "city": "Koh Samui",
        "district": "Bo Phut (north coast)",
        "type": "condo",
        "purpose": "investment",
        "asking_local": 2233800,
        "currency": "THB",
        "sqft": 347,
        "yield_estimate_pct": 5.5,
        "status": "watch",
        "address": "The Saint Condo, Bo Phut, Surat Thani",
        "source": "FazWaz (live scrape, 2026-10-04)",
        "source_url": "https://www.fazwaz.com/property-sales/studio-condo-for-sale-at-the-saint-condo-in-bo-phut-surat-thani-u1018438",
        "visa_angle": "Same Thailand routes as GL001/GL002 — DTV (Destination Thailand Visa) or Elite for long stay, BOI if you register the gym. HK gets 30-60 day visa-free (confirm).",
        "ownership_structure": "Foreign freehold quota condo (legal, up to 49% of building). Verify quota remaining — the only clean Thai route, and now more valuable because of the crackdown.",
        "why_paul": "This is the actual fresh data from this week's Thailand scrape, and I'm showing it to you to make a point, not to recommend it. The Saint is a legal foreign-quota freehold studio in Bo Phut (Samui's quieter north side) for ~HK$520K. It is legally clean — but it is on a tourist island, in the exact geography where this week's nominee crackdown is concentrated. It passes your ownership test and fails your 'no tourist trap' test on the demand side. That tension is the whole Thailand story right now.",
        "what_you_havent_considered": "The nominee crackdown (raids across Bangkok, Phuket, Pattaya, Samui and Koh Tao this month) is a tailwind for exactly this asset class — legal foreign-quota condos — because buyers are fleeing nominee villas into clean condos. But that tailwind is strongest in Bangkok/Chiang Mai where demand is local and structural, not in Samui where it is seasonal tourism. So the insight is the direction, not this specific unit.",
        "trap_warnings": "Tourist economy — seasonal occupancy, management-fee drag, and the Samui villa/land sector is being actively dismantled by the nominee crackdown (do not touch land/villa there). A 347 sqft studio is small; confirm the building's foreign quota is genuinely available and not already 49% full. Samui is not your Rawai/Chalong fight-corridor play — that is Phuket, and only via foreign-quota condo.",
        "local_insider_note": "Bo Phut is the quieter, family/remote-worker end of Samui — steadier than Chaweng but still tourist. The island's villa/land market is the epicentre of the nominee crackdown, so stick strictly to foreign-quota condos if you look here at all.",
        "rental_market": "5-6% gross, seasonal and tourism-dependent. Bo Phut holds occupancy better than Chaweng but it is still a tourist market, not a local-tenant market.",
        "exit_strategy": "Resale to the next foreign-quota buyer. Moderate liquidity on Samui; do not expect Bangkok-level turnover.",
        "gym_potential": "Samui has a small Muay Thai/fitness scene, but it is tourism, not community — the fight-corridor build belongs in Bangkok/Chiang Mai/Phuket, not here.",
        "scan_date": SCAN_DATE,
    },
]

with open(LISTINGS, "r", encoding="utf-8") as f:
    data = json.load(f)

existing_ids = {e["id"] for e in data}
for e in new_entries:
    if e["id"] in existing_ids:
        raise SystemExit(f"duplicate id {e['id']}")
    rate = HKD_PER[e["currency"]]
    e["asking_hkd"] = round(e["asking_local"] * rate)
    e["price_per_sqft_hkd"] = round(e["asking_local"] * rate / e["sqft"])

data.extend(new_entries)

with open(LISTINGS, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write("\n")

os.makedirs(os.path.dirname(SNAPSHOT), exist_ok=True)
with open(SNAPSHOT, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write("\n")

print(f"wrote {len(new_entries)} new entries -> total {len(data)}")
for e in new_entries:
    print(f"  {e['id']} {e['city']:14s} {e['currency']}{e['asking_local']:>14,} -> HKD {e['asking_hkd']:>9,}  {e['sqft']}sqft  {e['price_per_sqft_hkd']}/sqft  yield {e['yield_estimate_pct']}%  {e['status']}")
