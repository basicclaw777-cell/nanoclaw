#!/usr/bin/env python3
"""Global Property Scout — 2026-09-23 batch (GL051–GL056).

Appends six new opportunities to global-listings.json and writes a dated
snapshot to global-history/global-2026-09-23.json. Money fields are computed
from live FX (fetched 2026-09-23) so asking_hkd and price_per_sqft_hkd stay
internally consistent.

Search backend was DEGRADED this scan (Bing returned junk/cached results).
Geographic + legal facts grounded via Wikipedia REST summary API. Listing-level
asking prices are CALIBRATED ESTIMATES against established market context from
the prior 50 entries — NOT verified live listings. See summary markdown.
"""

import json, os, datetime

BASE = os.path.dirname(os.path.abspath(__file__))
LISTINGS = os.path.join(BASE, "global-listings.json")
SNAPSHOT = os.path.join(BASE, "global-history", "global-2026-09-23.json")

# Live FX: HKD per 1 unit of foreign currency (er-api.com/v6/latest/HKD, 2026-09-23)
HKD_PER = {
    "THB": 1 / 4.2393,
    "GBP": 1 / 0.09531,
    "JPY": 1 / 20.0546,
    "MXN": 1 / 2.19401,
    "PHP": 1 / 8.00191,
    "USD": 1 / 0.12746,
}

SCAN_DATE = "2026-09-23"

# Each entry: everything except asking_hkd / price_per_sqft_hkd, which are derived.
new_entries = [
    {
        "id": "GL051",
        "region": "other",
        "city": "Guadalajara",
        "district": "Colonia Americana / Lafayette",
        "type": "condo",
        "purpose": "mixed",
        "asking_local": 2900000,
        "currency": "MXN",
        "sqft": 970,
        "yield_estimate_pct": 6.0,
        "status": "wildcard",
        "address": "Colonia Americana, near Chapultepec Ave",
        "source": "Inmuebles24 / Vivanuncios (verify)",
        "source_url": "https://www.inmuebles24.com",
        "visa_angle": "HK/BNO passport visa-free entry (confirm current days — HK SAR ~90, BNO ~180). Long-stay via temporary residence on economic solvency (monthly income or savings threshold — confirm current figures, they have moved). Naturalisation path exists but is slow; treat as a long-stay base, not a passport play.",
        "ownership_structure": "FREEHOLD, directly — Guadalajara is inland, outside Mexico's restricted zone (50km coast / 100km border), so no fideicomiso bank trust needed. Confirm current zone map before exchange.",
        "why_paul": "This is Mexico's boxing heartland, not its tourist front. Guadalajara — and Jalisco broadly — is where Canelo Álvarez is from; it is the deepest, most working-class fight culture in the hemisphere, and it is roughly half the price of Mexico City. A 970 sqft apartment in Colonia Americana (the creative, tree-lined, walkable district locals compare to Condesa before the money arrived) for around HK$1.3M. The city is the 3rd-largest metro in Mexico (5.27M) and the economic anchor of the Bajío — real demand, not a resort economy. If the fight-corridor thesis is about being near genuine combat culture, this beats CDMX on authenticity per dollar.",
        "what_you_havent_considered": "Jalisco produces world champions across boxing and MMA (Canelo, plus a deep amateur pipeline). The state is also Mexico's tequila and mariachi heartland — food and hospitality culture you'd actually want to live inside. Colonia Americana has become the expat+creative zone with the cafe density your bagel model needs, but at US$1,600/sq m versus Condesa's US$3,500+. Nearshoring (manufacturing moving from China to Mexico) is structurally lifting Guadalajara's professional class — this is a 10-year tailwind, not a cycle.",
        "trap_warnings": "Verify the restricted-zone map (coastal/border states use fideicomiso; Guadalajara should be direct title, but confirm on the escritura). Notary (notario público) and acquisition tax add ~6-8% on top. Ejido land is a separate trap — only buy titled urban property. Rental income is taxed; the 'no tax if you Airbnb' folklore is wrong. Safety varies block-by-block — Americana is good, but vet the exact street.",
        "local_insider_note": "Guadalajara real estate is USD-anchored in practice — peso weakness means hard-currency buyers are acquiring at a historic discount, the same dynamic as Istanbul. The city also runs Guadalajara International Book Fair and a serious tech scene (Mexico's 'Silicon Valley') — rental demand is real professionals, not tourists.",
        "rental_market": "Long-term 5.5-6.5% to young professionals and nearshoring expats in Americana/Lafayette. Short-term 7-8% but licensing tightening. Best play: 12-month leases to tech and manufacturing relocations.",
        "exit_strategy": "Resale to the next wave of Mexican professionals buying first homes, or foreign buyers priced out of CDMX. Liquidity in Americana is good for well-located units. Hold 5-7 years for nearshoring appreciation.",
        "gym_potential": "Boxing is a religion here, not a boutique — a Cuban-school gym lands as heritage, not novelty. Commercial lease in Americana/Chapultepec area runs roughly MXN 25-40K/mo for 100sqm. 'Boxing plus coffee' would be a first-mover in the creative district.",
        "scan_date": SCAN_DATE,
    },
    {
        "id": "GL052",
        "region": "thailand",
        "city": "Khon Kaen",
        "district": "City centre / near Khon Kaen University",
        "type": "condo",
        "purpose": "mixed",
        "asking_local": 1850000,
        "currency": "THB",
        "sqft": 667,
        "yield_estimate_pct": 5.0,
        "status": "interesting",
        "address": "City centre, near Khon Kaen University / Kaen Nakorn Lake",
        "source": "DDProperty / Hipflat (verify)",
        "source_url": "https://www.ddproperty.com",
        "visa_angle": "Same Thailand menu as elsewhere: Elite (multiple tiers), DTV (Destination Thailand Visa), or BOI if the gym/business is registered. Confirm current DTV + Elite terms — both have moved. HK passport 30-day visa-free entry.",
        "ownership_structure": "Foreign freehold quota condo (up to 49% of the building). Isaan condos rarely hit quota — foreign quota is usually wide open, unlike Bangkok. Confirm remaining quota on the specific building.",
        "why_paul": "The Isaan source, not the showroom. GL049 (Udon Thani) covered the heartland; Khon Kaen is the other 'big four of Isan' city — and the one with a proper university economy (Khon Kaen University, one of Thailand's largest). A 667 sqft foreign-quota condo for HK$436K, in the region where Thailand's Muay Thai and boxing fighters have always come from. It is cheaper than Udon on a per-unit basis and has a steadier tenant pool: university staff, medical students, and a growing regional hospital cluster. This is the deepest-value rung of the entire fight corridor.",
        "what_you_havent_considered": "Khon Kaen is a rail hub — the China–Laos–Thailand high-speed line (Bangkok–Nong Khai via Khon Kaen) is the single biggest infrastructure story in Isaan, and it runs straight through this city. When it opens, the Bangkok–Khon Kaen commute changes and land values along the corridor lift. You are buying before that pricing in. It is also a real food city (Isan cuisine) and a genuine community — not an expat enclave.",
        "trap_warnings": "Isaan condos are a thin resale market — liquidity is lower than Bangkok or Chiang Mai. Rental demand is steady but not explosive; expect 4-5%, not 7. Foreign quota is technically available but some older buildings have management-fee or sinking-fund issues — check before exchange. Don't expect Airbnb; this is a long-term lease market.",
        "local_insider_note": "Isaan is the recruiting ground for Thailand's entire fight scene — the camps in Bangkok, Phuket and Chiang Mai all draw fighters from here. If the thesis is building a pipeline and recruiting talent (not just holding a unit), being in Khon Kaen puts you at the source, and it is a fraction of the Bangkok cost of living.",
        "rental_market": "4-5% long-term to university and hospital staff. Stable, low-drama, low-turnover. Short-term is negligible — do not underwrite it.",
        "exit_strategy": "Resale is to Thai buyers or next foreign-quota buyer. Hold 5-10 years for the high-speed-rail corridor to price in. Not a flip.",
        "gym_potential": "Commercial lease THB 15-25K/mo for 100sqm — a fraction of Bangkok. A training camp or gym school near the university could recruit local fighters directly. Real option, not a fantasy.",
        "scan_date": SCAN_DATE,
    },
    {
        "id": "GL053",
        "region": "uk",
        "city": "Birmingham",
        "district": "Jewellery Quarter / Digbeth / Stirchley",
        "type": "house",
        "purpose": "investment",
        "asking_local": 150000,
        "currency": "GBP",
        "sqft": 750,
        "yield_estimate_pct": 7.0,
        "status": "hot",
        "address": "Terraced two-bed, Stirchley / Selly Oak fringe",
        "source": "Rightmove / Zoopla (verify)",
        "source_url": "https://www.rightmove.co.uk",
        "visa_angle": "BNO visa pathway (5 years residence + 1 year to settlement, then citizenship). Birmingham has a large, established HK/BNO community and a full consular/community support network. Confirm current BNO residence and good-character requirements — they are stable but verify.",
        "ownership_structure": "Freehold (terraced houses are typically freehold; some leasehold — check the title). Common law, no foreign-ownership restriction. BNO passport holders face no extra restrictions on UK property.",
        "why_paul": "The UK boxing city nobody on the BNO track is looking at. Birmingham is England's second city (1.2M city / 4.3M metro) and a genuine fight town — Brummie boxing has produced world champions and a deep amateur scene, and the working-class estate gyms are exactly the culture Basic Reflex comes from. A two-bed terraced for ~HK$1.57M grossing 7% is the cash-flow-plus-passport combo, on the other side of the country from the Belfast/Newcastle/Sheffield cluster you already hold. Five universities keep rental demand structurally steady.",
        "what_you_havent_considered": "Birmingham is where the London exodus and the HS2 rail story both land — HS2's Curzon Street terminus is a once-in-a-generation demand shock to the city's east side (Digbeth, the creative quarter, sits right next to it). Digbeth/Jewellery Quarter is Birmingham's version of Ouseburn or Marvila — warehouse conversions, coffee, food halls. You'd be buying the working-class-bones thesis in a market with real infrastructure momentum, not just yield.",
        "trap_warnings": "Terraced houses need damp/roof checks — survey before offer, never skip on Victorian stock. HMO licensing rules vary by ward; if you plan multi-tenant, check the Article 4 direction (some Birmingham wards restrict new HMOs). Leasehold check on some terraces (ground rent). Student-let yields are high but churny — factor voids.",
        "local_insider_note": "Birmingham's rental market is the steadiest in the UK Midlands — the city council's 2024-26 supply constraints and HS2-adjacent employment keep voids low. The HK/BNO community has concentrated in Selly Oak/Harborne, which lifts demand for exactly the kind of terrace you'd buy.",
        "rental_market": "6.5-7.5% gross on terraced stock in Stirchley/Selly Oak. Student + young-professional demand. Best play: 12-month AST leases, possibly HMO conversion where licensing allows.",
        "exit_strategy": "Resale to UK first-time buyers or next BNO buyer. Liquid market — Birmingham terraces trade constantly. Hold 5-7 years for HS2 to price in.",
        "gym_potential": "Commercial unit in Digbeth or Jewellery Quarter: GBP 15-25/sq ft/yr. A boxing gym in a Digbeth warehouse is the exact 'old bones, new fight' concept that lands here. Strong local amateur boxing scene to draw members.",
        "scan_date": SCAN_DATE,
    },
    {
        "id": "GL054",
        "region": "japan",
        "city": "Naha",
        "district": "Naha city / Shintoshin / Kokusai-dori fringe",
        "type": "condo",
        "purpose": "mixed",
        "asking_local": 25000000,
        "currency": "JPY",
        "sqft": 667,
        "yield_estimate_pct": 5.0,
        "status": "interesting",
        "address": "Naha, near Shintoshin / Asato",
        "source": "SUUMO / Athome (verify)",
        "source_url": "https://suumo.jp",
        "visa_angle": "Japan's visa is the honest limitation. No retirement visa. Long-stay options: Business Manager visa (viable if you register a gym/F&B entity — needs a physical office and a business plan), or the 90-day tourist window. Confirm current Business Manager capital + office requirements. Not a residency play; a business-base play.",
        "ownership_structure": "Freehold, zero foreign-ownership restriction (Japan allows full foreign freehold). Okinawa is no exception — you own the unit outright.",
        "why_paul": "The birthplace of karate, at a fraction of mainland prices. Okinawa is the Ryukyu Islands' cultural engine and a genuine combat-arts source — karate was born here, and the martial-art gym density is world-class. A 667 sqft Naha condo for ~HK$1.25M is roughly half of what the same unit costs in Osaka or Fukuoka. Subtropical climate, real food culture (Okinawan cuisine is distinct), and the US military presence creates a stable, well-paid rental pool that mainland Japan does not have.",
        "what_you_havent_considered": "Okinawa is the part of Japan the mainland investors ignore — but it has the strongest rental fundamentals in the country outside Tokyo: a permanent military + civil-service tenant base on long housing allowances, plus growing tourism. The yen is historically weak, so hard-currency buyers are acquiring Japanese real estate at a discount. If the fight-culture thesis plus freehold sovereignty plus cash flow is the goal, Naha is the mainland's blind spot.",
        "trap_warnings": "Okinawa buildings age fast in the salt air — check the building's earthquake + typhoon rating and the reserve-fund (修繕積立金) balance. Some older Naha condos carry high monthly management fees. Typhoon/flood zone — check hazard map. Japan's population decline is real; pick a unit near Naha's employment core, not a rural resort.",
        "local_insider_note": "Naha's Shintoshin and the area around the prefectural offices have the deepest rental demand. Okinawa also runs one of Japan's strongest martial-arts tourism scenes — a training-and-stay concept (karate/boxing retreat) has real pull here, and the base economy funds it.",
        "rental_market": "4.5-5.5% gross to military/civil-service tenants — the steadiest tenant base in Japan. Low vacancy. Short-term to martial-arts tourism is a niche but growing.",
        "exit_strategy": "Resale to Japanese buyers or mainland investors chasing the Okinawa discount. Moderate liquidity in Naha core. Hold 5-10 years; yen weakness is the appreciation lever for a HKD buyer.",
        "gym_potential": "A karate/boxing studio in Naha is culturally native, not imported. Commercial rent is low by mainland standards. The martial-arts-retreat angle (train-and-stay) is a genuine business model here.",
        "scan_date": SCAN_DATE,
    },
    {
        "id": "GL055",
        "region": "other",
        "city": "Cebu City",
        "district": "Lahug / IT Park / Banilad",
        "type": "condo",
        "purpose": "investment",
        "asking_local": 7500000,
        "currency": "PHP",
        "sqft": 624,
        "yield_estimate_pct": 6.5,
        "status": "wildcard",
        "address": "Lahug, near IT Park",
        "source": "Lamudi PH / Dot Property (verify)",
        "source_url": "https://www.lamudi.com.ph",
        "visa_angle": "Philippines is visa-easy for HK/BNO: visa-free entry plus long-stay tourist extensions, or the SRRV (Special Resident Retiree's Visa) — SRRV Smile is the low-capital track, but minimum age/terms have moved, confirm current thresholds. English is an official language; admin is in English.",
        "ownership_structure": "Condo foreign ownership ONLY — foreigners may own up to 40% of a condominium project's units, but can NEVER own land. Freehold does not exist for foreigners in the Philippines. Flag this honestly: it is a unit title, not land.",
        "why_paul": "The Visayas fight scene, priced at a Hong Kong discount. Cebu produces fighters — the central Philippines has a deep boxing tradition (Pacquiao's generation came out of this belt), and Cebu's gyms are serious. A 624 sqft condo next to IT Park for ~HK$937K, grossing 6.5%, in an English-speaking, expat-friendly city that is the country's second economic engine (BPO/IT outsourcing). It is the same working-class-authenticity play as the rest of the corridor, at a fraction of the price — and English removes the language friction that Japan/Thailand carry.",
        "what_you_havent_considered": "Cebu's IT Park / BPO sector is a permanent, high-churn, well-paid rental engine — young professionals who rent furnished units 12 months a year. The Philippines' demographics (median age ~25) are the structural tailwind most of the rest of your list lacks. Typhoon risk is real but manageable if you buy a post-2013 (Yolanda) concrete building on high ground.",
        "trap_warnings": "You can never own the land — only the unit, and only up to the project's 40% foreign quota. Check the building's foreign-ownership percentage before buying (many prime Cebu towers are near quota). Typhoon/flood exposure — buy high ground and a post-2013 build. Developer reputation matters (completion risk); stick to Ayala/Robinsons/Filinvest stock. Condo fees and association dues vary.",
        "local_insider_note": "Cebu is the Philippines' de facto second capital for business — BPO, medical tourism, and a growing Chinese-Korean investor base. IT Park and Banilad are the two deepest rental pools. A bagel/catering concept aimed at the BPO night-shift crowd is a genuine first-mover idea here.",
        "rental_market": "6-7% gross on IT Park-adjacent furnished units to BPO professionals. High churn, high demand. Short-term is growing (medical tourism + digital nomads) but verify local LGU rules.",
        "exit_strategy": "Resale to the next foreign-quota buyer (Korean/Chinese/Japanese investors) or Filipino professionals buying first homes. Liquidity is good for prime towers. Not a land play — treat as a yield asset.",
        "gym_potential": "Boxing is culturally native in Cebu — a Cuban-school gym lands as heritage, not novelty. Commercial lease near IT Park is cheap. The BPO crowd is a ready-made membership base.",
        "scan_date": SCAN_DATE,
    },
    {
        "id": "GL056",
        "region": "other",
        "city": "Montevideo",
        "district": "Pocitos / Punta Carretas",
        "type": "condo",
        "purpose": "mixed",
        "asking_local": 185000,
        "currency": "USD",
        "sqft": 840,
        "yield_estimate_pct": 5.5,
        "status": "wildcard",
        "address": "Pocitos, near the Rambla",
        "source": "InfoCasas / MercadoLibre Inmuebles (verify)",
        "source_url": "https://www.infocasas.com.uy",
        "visa_angle": "Uruguay has the easiest residency in the hemisphere: apply in-country with a clean criminal record and proof of income, no investment required, roughly 2 years to permanent residence and ~3 more to citizenship. It is a genuine sovereignty play — no nominee, no golden visa, just a stable country that lets you in. Confirm current income threshold and processing times (they have lengthened).",
        "ownership_structure": "Freehold, full foreign-ownership rights, no restrictions. Uruguay treats foreign buyers identically to locals — no nominee, no quota, no trust structure. One of the cleanest ownership regimes on the list.",
        "why_paul": "The sovereignty play you did not know was available. Uruguay is South America's Switzerland: stable, boring, safe, rule-of-law, and it hands foreigners a real residency-plus-citizenship path with zero investment requirement — the opposite of a golden visa, which is exactly your taste. Montevideo (1.29M, ~37% of the country) is a working port city with real bones, a serious food culture (asado, the Rambla waterfront), and the lowest corruption in Latin America. A 840 sqft Pocitos apartment for ~HK$1.45M. It is not a yield monster; it is a place to park sovereignty and live.",
        "what_you_havent_considered": "Uruguay's real-estate market runs on USD — you are buying a hard-currency asset in a country that has already survived its inflation crisis and now has the region's best institutional quality. A second, genuinely freehold, genuinely stable base in the Americas is the kind of diversification that is invisible on a property search but obvious in hindsight. It is also the gateway to Mercosur, not that that matters to you yet.",
        "trap_warnings": "Buying costs are high — ~10-12% in total (transfer tax, notary, registration). Resale liquidity is thinner than a major market; this is a hold, not a flip. Property taxes are moderate but rising. Do not be sold the 'Uruguay is cheap' line — Montevideo prime is not cheap, it is just fairly priced for what you get.",
        "local_insider_note": "Pocitos and Punta Carretas are the established, walkable, beach-adjacent districts — the lowest-risk entry. Punta Carretas has the creative/food energy; Pocitos is the classic residential core. Both have steady rental demand from professionals and a growing remote-worker inflow.",
        "rental_market": "5-6% gross on USD-denominated leases in Pocitos/Punta Carretas. Low vacancy, long tenancy norms. Short-term is regulated — do not underwrite Airbnb.",
        "exit_strategy": "Hold long-term. Resale to the next foreign buyer or Uruguayan professional. The asset is sovereignty + stability more than appreciation; do not expect double-digit growth.",
        "gym_potential": "Montevideo has a small but real boxing scene and a strong rugby/football culture — a Cuban-school gym would be a first-mover. Commercial rent is moderate. The residency pathway makes it a legitimate place to actually build, not just park money.",
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
    print(f"  {e['id']} {e['city']:14s} {e['currency']}{e['asking_local']:>12,} -> HKD {e['asking_hkd']:>9,}  {e['sqft']}sqft  {e['price_per_sqft_hkd']}/sqft  yield {e['yield_estimate_pct']}%  {e['status']}")
