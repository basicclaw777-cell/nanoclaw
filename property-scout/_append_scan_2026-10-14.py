#!/usr/bin/env python3
"""Global Property Scout — 2026-10-14 batch (GL062–GL065).

Appends four new opportunities to global-listings.json and writes a dated
snapshot to global-history/global-2026-10-14.json. Money fields are computed
from live FX (er-api.com/v6/latest/HKD, fetched 2026-10-13) so asking_hkd and
price_per_sqft_hkd stay internally consistent: 1 HKD = 4.28409 THB.

Headline of this scan is a CONFIRMATION AND EXTENSION, not a brand-new market:
the Thailand nominee crackdown BROADENED in the last week. The fresh forum
scrape (forum-signals-latest.json, scraped 2026-10-11) shows the enforcement
moving out of Phuket/Krabi and into Pattaya, Chon Buri (a Chinese nominee metal
company raided 8 Oct), Bangkok (DSI raid on a Chabad House over a suspected
nominee scheme), and Koh Tao. Last week's read — "buyers flee nominee villas
into legal foreign-quota condos" — just got sharper: the clean-quota lane is now
the only lane with enforcement tailwind, and this batch surfaces the four REAL
foreign-quota condos sitting in this week's FazWaz scrape (scrape-thailand-latest.json).

Unlike the prior two scans (which used calibrated estimates for non-Thailand
entries because web_search was degraded), EVERY entry in this batch is a real
FazWaz listing with a live URL, price in THB, sqm and a 'Foreign Quota' tag.
Search backend is STILL degraded this scan (web_search returned zero results),
so this is a Thailand-only batch — the honest move given the priority region is
Thailand and the only fresh, verifiable listing data is Thai.

The two hot picks:
  - GL062 Angket Pavillian (Chiang Mai): the cheapest clean foreign-quota condo
    in the entire 65-property set — THB 698,700 ≈ HK$163K for 38 sqm. Fight-scene
    city, food culture, the legal entry point.
  - GL063 The Title Rawai (Phuket): the request-file's explicit "fight gym
    corridor" ask, now a real foreign-quota listing 160m from the beach in the
    densest Muay Thai camp street in Asia.

The two watches (flagged honestly):
  - GL064 Escent Phuket: foreign-quota but OFF-PLAN — fails the "old bones" test.
  - GL065 The Terraza Samui: clean foreign-quota but on a tourist island in the
    crackdown's demand-side geography — same tension as GL061.
"""

import json, os

BASE = os.path.dirname(os.path.abspath(__file__))
LISTINGS = os.path.join(BASE, "global-listings.json")
SNAPSHOT = os.path.join(BASE, "global-history", "global-2026-10-14.json")

# Live FX: HKD per 1 unit of foreign currency (er-api.com/v6/latest/HKD, 2026-10-13)
HKD_PER = {
    "THB": 1 / 4.28409,   # Thai baht
}

SCAN_DATE = "2026-10-14"

new_entries = [
    {
        "id": "GL062",
        "region": "thailand",
        "city": "Chiang Mai",
        "district": "Nong Pa Khrang / Mueang Chiang Mai",
        "type": "condo",
        "purpose": "mixed",
        "asking_local": 698700,
        "currency": "THB",
        "sqft": 409,
        "yield_estimate_pct": 5.5,
        "status": "hot",
        "address": "Angket Pavillian Condo, Nong Pa Khrang, Mueang Chiang Mai",
        "source": "FazWaz (live scrape, 2026-10-11)",
        "source_url": "https://www.fazwaz.com/property-sales/studio-condo-for-sale-at-angket-pavillian-condo-in-nong-pa-khrang-chiang-mai-u6566626",
        "visa_angle": "DTV (Destination Thailand Visa) or Elite for long stay; BOI if you register the gym. Chiang Mai has its own immigration office. HK passport gets visa-free entry (confirm current days).",
        "ownership_structure": "Foreign freehold quota condo (legal, up to 49% of building). 2014 build. Verify quota remaining — the 'Foreign Quota' tag is present on this listing, but confirm the specific unit's quota registration before offer.",
        "why_paul": "This is the cheapest clean foreign-quota property in the entire set — ~HK$163K for 38 sqm (409 sqft) is a tenth of GL001 and still under the Khon Kaen entry (GL052, ~HK$436K). Chiang Mai is a Muay Thai city, not a fitness-brand boxing city: Santai, Lanna, HongThong, Team Quest and a dozen camps ring the city, plus a serious food culture and a low cost of living. With the nominee crackdown pushing buyers into legal condos, a sub-HK$200K clean deed in a fight city is the sharpest sovereignty-per-dollar play Thailand offers you right now.",
        "what_you_havent_considered": "The crackdown is no longer just Phuket/Samui — this week's scrape shows it in Bangkok, Pattaya, Chon Buri and Koh Tao too. The buyers being shaken out of nominee villas want LEGAL condos, and Chiang Mai is where a legal condo still costs HK$163K, not HK$1M. Also: Nong Pa Khrang is the working-class southern fringe — near the airport and Robinson, not the tourist Nimman strip. That is exactly the 'working-class neighborhood with upward trajectory' you asked for.",
        "trap_warnings": "Do not confuse this with the Baan Ua-Athorn / NHA listings in the same scrape (THB 650–688K) — those are Thai government affordable-housing units, NOT foreign-eligible, whatever the price looks like. Only the Angket Pavillian carries the explicit 'Foreign Quota' tag. Still verify: quota remaining, monthly management fee, and whether the 2014 building has maintenance arrears or a thin sinking fund.",
        "local_insider_note": "Three separate Angket Pavillian units at the identical THB 698,700 (three distinct FazWaz URLs) suggest an investor or the developer offloading multiple foreign-quota studios at once — a motivated seller, so negotiate. Chiang Mai rental demand is seasonal (Nov–Feb high season, Mar–Oct slow) plus a growing DTV/digital-nomad base that books months at a time.",
        "rental_market": "Long-term 5–6% to locals and nomads; the Muay Thai training-camp crowd books 1–3 month stays and is the reliable tenant here. No reliable short-term data on this unit — underwrite long-term, not Airbnb.",
        "exit_strategy": "Chiang Mai is hold-for-lifestyle-plus-yield, not a flip. Foreign-quota studios resell to the next training-camp or nomad buyer. Liquidity is thinner than Bangkok — this is a patient asset, and the price reflects that.",
        "gym_potential": "Chiang Mai's Muay Thai training economy is the hook: your HK gym could run a seasonal 'train in Chiang Mai' block feeding HK students into the camps, with the condo as the coach's base. Commercial rent on the superhighway/Nimman fringe is THB 20–35K/mo for 100 sqm.",
        "scan_date": SCAN_DATE,
    },
    {
        "id": "GL063",
        "region": "thailand",
        "city": "Phuket",
        "district": "Rawai / Soi Ta-iad fight corridor",
        "type": "condo",
        "purpose": "mixed",
        "asking_local": 3391500,
        "currency": "THB",
        "sqft": 431,
        "yield_estimate_pct": 6.5,
        "status": "hot",
        "address": "The Title Rawai Phase 1-2, Rawai, Phuket Town",
        "source": "FazWaz (live scrape, 2026-10-11)",
        "source_url": "https://www.fazwaz.com/property-sales/1-bedroom-condo-for-sale-at-the-title-rawai-phase-1-2-in-rawai-phuket-u6580733",
        "visa_angle": "DTV or Elite for long stay; BOI for the gym. Phuket has an immigration office. HK passport visa-free entry (confirm current days).",
        "ownership_structure": "Foreign freehold quota condo (legal, up to 49% of building). 2018 build, 40 sqm (431 sqft), 160m from the beach. Verify quota remaining — fight-corridor buildings fill their quota fast.",
        "why_paul": "This is the request-file's explicit 'fight gym corridor' ask, now a real foreign-quota listing. Soi Ta-iad — 2–3km from Rawai — is the densest Muay Thai camp street in Asia: Tiger Muay Thai, Dragon, AKA Thailand, Phuket Top Team all sit on that one road. You could own this condo AND partner your gym with the camps: train, recover, coach. Clean foreign-quota means no nominee exposure, which matters precisely because Phuket is crackdown ground zero.",
        "what_you_havent_considered": "The Phuket nominee crackdown is a tailwind for legal quota condos, not a threat to them — it is dismantling the illegal villa/hotel lane and pushing both buyers and renters into clean condos. Rawai also has the expat long-stay fitness community (CrossFit, BJJ, triathlon, Muay Thai) that a boxing gym slots into directly. This is the 'boxing + coaching retreat' model, not a tourist-trap buy.",
        "trap_warnings": "Phuket short-term rental is legally grey and under active enforcement — check the building's rental-license situation before assuming the portal's 8%+ yield. Some Rawai buildings carry high CAM fees. And confirm quota is genuinely available: popular fight-corridor buildings hit the 49% ceiling quickly.",
        "local_insider_note": "The Title Rawai is a known fight-scene building — trainers and fighters rent here for the camp season. FazWaz's est rent (SGD 953/mo ≈ HK$5.5K) is short-term-optimistic; underwrite long-term 6–7%. The 160m-to-beach number is the point: walkable to Rawai beach, not on the tourist strip.",
        "rental_market": "Two tiers: long-term 6–7% to trainers/nomads/retirees (the reliable play), and short-term 8–10% but grey and enforcement-exposed. Best play: 6–12 month leases to fight-camp staff and students.",
        "exit_strategy": "Fight-corridor condos hold resale value because the demand is structural — the camps are not moving. Sell to the next training-tourist or a camp partner. Medium liquidity.",
        "gym_potential": "The flagship. Lease a small gymfront on Soi Ta-iad and run a 'HK discipline + Muay Thai conditioning' crossover. The corridor already has the traffic; you'd bring the Cuban-school technique and the HK brand. This is the single strongest gym expansion angle in the whole set.",
        "scan_date": SCAN_DATE,
    },
    {
        "id": "GL064",
        "region": "thailand",
        "city": "Phuket",
        "district": "Wichit / Phuket Town fringe",
        "type": "condo",
        "purpose": "investment",
        "asking_local": 2958000,
        "currency": "THB",
        "sqft": 315,
        "yield_estimate_pct": 6.0,
        "status": "watch",
        "address": "Escent Phuket, Wichit, Phuket",
        "source": "FazWaz (live scrape, 2026-10-11)",
        "source_url": "https://www.fazwaz.com/property-sales/1-bedroom-condo-for-sale-at-escent-phuket-in-wichit-phuket-u6829098",
        "visa_angle": "Same DTV / Elite / BOI routes as GL063.",
        "ownership_structure": "Foreign freehold quota condo — but OFF-PLAN (not yet completed). The 'Foreign Quota' tag here is a presale allocation, not an existing unit.",
        "why_paul": "Foreign-quota at ~HK$690K in Wichit (Phuket Town's working-class fringe, not Patong) shows the clean lane's price, and that's the only reason to note it. But it is off-plan — no bones, no character, no track record. It fails your 'old buildings with bones' test outright.",
        "what_you_havent_considered": "Developers presell foreign quota exactly because it is the scarce, regulated slice — if you want quota in a specific new building, presale is when it is actually available. That tells you the reverse is the better trade: quota in COMPLETED fight-corridor buildings (like The Title Rawai, GL063) is the scarcer, safer asset, and this off-plan listing is the proof by contrast.",
        "trap_warnings": "OFF-PLAN: completion risk, handover delays, developer solvency. No rental history. Phuket off-plan has a real record of late delivery. This is 'watch, don't rush' precisely because it is the developer's game, not yours.",
        "local_insider_note": "Wichit is residential Phuket Town, not the fight corridor and not the beach. The listing is here to mark the off-plan foreign-quota price signal, not as a recommendation.",
        "rental_market": "Unproven — no completed building yet. Underwrite 5–6% long-term once delivered, and discount for construction risk.",
        "exit_strategy": "Resale after completion to the next foreign-quota buyer, but only if you are comfortable holding through construction.",
        "gym_potential": "Weak — Wichit is residential, with none of the fight-corridor traffic of Rawai/Chalong.",
        "scan_date": SCAN_DATE,
    },
    {
        "id": "GL065",
        "region": "thailand",
        "city": "Koh Samui",
        "district": "Maret / Lamai (south coast)",
        "type": "condo",
        "purpose": "investment",
        "asking_local": 4845000,
        "currency": "THB",
        "sqft": 409,
        "yield_estimate_pct": 6.0,
        "status": "watch",
        "address": "The Terraza Samui, Maret, Koh Samui",
        "source": "FazWaz (live scrape, 2026-10-11)",
        "source_url": "https://www.fazwaz.com/property-sales/1-bedroom-condo-for-sale-at-the-terraza-samui-in-maret-surat-thani-u6811908",
        "visa_angle": "Same DTV / Elite / BOI routes. Samui is in Surat Thani province, same crackdown geography as GL061.",
        "ownership_structure": "Foreign freehold quota condo (legal), 2024 build, 38 sqm (409 sqft). Two units in the scrape. Ownership side is clean — same as GL061, it passes the sovereignty test.",
        "why_paul": "A clean, modern (2024) foreign-quota condo with real portal rental data — but on Samui, in the exact geography of the crackdown, with a tourist demand side. Same tension as GL061: it passes your ownership test and fails your 'no tourist trap' test on the demand side. Noted to mark the price, not to recommend.",
        "what_you_havent_considered": "The ~9.9% gross yield FazWaz shows (est rent SGD 1,610/mo) is short-term/Airbnb math — and Samui short-term rental is precisely what the authorities are enforcing right now. The honest long-term Samui yield is 5–7% and seasonal. You are paying ~HK$2,765/sqft here versus HK$399/sqft for Chiang Mai (GL062) — the premium is for the island, not the bones.",
        "trap_warnings": "Tourist-island demand is seasonal and crackdown-exposed; short-term rental enforcement on Samui is tightening. Maret/Lamai is the quieter south side (less Chaweng), but it is still a holiday-rental market, not a community. At HK$1.13M for 409 sqft it is a premium price for a transient market.",
        "local_insider_note": "Lamai/Maret is the calmer end of Samui — steadier occupancy than Chaweng but still tourist. The island's villa/land sector remains the crackdown epicentre; stick strictly to foreign-quota condos if you look here at all, and treat any headline yield as a short-term number.",
        "rental_market": "5–7% long-term, seasonal; 8–10% short-term headline but enforcement risk. Underwrite the long-term number and the tourism cycle.",
        "exit_strategy": "Resale to the next foreign-quota buyer. Island liquidity is moderate and correlated to the tourism cycle — not a market to exit in a hurry.",
        "gym_potential": "Weak — Samui has a small fitness/nomad scene but no fight corridor. The gym build belongs in Chiang Mai or Rawai, not here.",
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
