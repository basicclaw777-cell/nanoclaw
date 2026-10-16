#!/usr/bin/env python3
"""Global Property Scout — append GL026–GL032 (scan 2026-08-26).
Reads global-listings.json, appends 7 new entries, rewrites with 2-space indent.
FX rates: live from open.er-api.com, fetched 2026-08-26 (USD base 1 USD = 7.837386 HKD).
"""
import json

# 1 HKD = X local currency (computed from live USD-base rates)
HKD_PER_LOCAL = {
    "THB": 32.696136 / 7.837386,   # 4.1718
    "MYR": 4.042291 / 7.837386,    # 0.5158
    "JPY": 159.125396 / 7.837386,  # 20.3034
    "GBP": 0.733476 / 7.837386,    # 0.09359
    "EUR": 0.857211 / 7.837386,    # 0.10938
    "VND": 26075.198215 / 7.837386,# 3327.03
}

def build(region, city, district, typ, purpose, asking_local, currency, sqft,
          yield_pct, status, address, source, source_url, visa_angle,
          ownership, why, unconsidered, traps, insider, rental, exit_s, gym,
          scan_date="2026-08-26"):
    rate = HKD_PER_LOCAL[currency]
    asking_hkd = int(round(asking_local / rate))          # local -> HKD
    psf = int(round(asking_hkd / sqft))
    return {
        "id": None,  # filled after insertion
        "region": region,
        "city": city,
        "district": district,
        "type": typ,
        "purpose": purpose,
        "asking_local": asking_local,
        "currency": currency,
        "asking_hkd": asking_hkd,
        "sqft": sqft,
        "price_per_sqft_hkd": psf,
        "yield_estimate_pct": yield_pct,
        "status": status,
        "address": address,
        "source": source,
        "source_url": source_url,
        "visa_angle": visa_angle,
        "ownership_structure": ownership,
        "why_paul": why,
        "what_you_havent_considered": unconsidered,
        "trap_warnings": traps,
        "local_insider_note": insider,
        "rental_market": rental,
        "exit_strategy": exit_s,
        "gym_potential": gym,
        "scan_date": scan_date,
    }

NEW = []

NEW.append(build(
    "malaysia", "Johor Bahru", "Iskandar Puteri / Medini", "condo", "investment",
    560000, "MYR", 900, 6.0, "hot",
    "Medini / Iskandar Puteri, Johor Bahru (RTS Link corridor)",
    "PropertyGuru Malaysia", "https://www.propertyguru.com.my/",
    "MM2H (Malaysia My Second Home) — tiers were revised in 2024 (Silver/Gold/Platinum with fixed-deposit + income thresholds); confirm the current figures before relying on them, they have shifted historically. HK passport: 90-day visa-free. A gym/F&B operation can run under a locally registered SDN BHD entity.",
    "Freehold or 99-year leasehold condo. Johor has a state minimum for foreigner purchase (RM 1M for landed; condo minimum varies by zone). Medini Iskandar is a special economic zone with NO minimum purchase and no Bumiputera quota for qualifying projects — verify the specific development.",
    "This is the single biggest gap in the prior 25. Johor Bahru is the Hong Kong–Shenzhen play of Southeast Asia: a ~5-minute train ride from Singapore (one of the world's most expensive markets, ~HK$1,600+/sqft) into a market trading around HK$1,200/sqft for a modern condo — and the new RTS Link is what makes the commute real. You already understand this exact arbitrage from living in HK. Medini/Iskandar Puteri is the foreigner-friendly zone (no minimum, no quota).",
    "The RTS Link (opening ~end 2026) doesn't just lift prices — it changes the RENTAL pool. Singaporean professionals priced out of SG rent will start living in JB and commuting daily, which is a brand-new long-term tenant demographic that didn't exist before. Also: JB already has a strong Muay Thai/boxing scene and a huge Singaporean weekend gym-goer and food crowd crossing over every weekend.",
    "The Johor condo supply overhang is real — Iskandar overbuilt in the 2010s and prices stagnated for years. Buy only near the RTS/CIQ corridor (Medini, Puteri Harbour, Danga Bay), never the distant Iskandar sprawl. Confirm the specific project's foreigner minimum and Bumiputera release mechanics. Do NOT anchor a decision on the old RM 300K fixed-deposit MM2H figure — the tiers moved. MYR has been weak (good for entry, cuts your exit in HKD terms).",
    "The RTS corridor is where the smart money is now. Medini has no minimum and no quota but is still building out — rental demand is thinner there than in the established CIQ/KSL area. The best risk-adjusted play is a completed condo within ~15 min of the RTS station, not the speculative off-plan towers. Agents quote 6-8% yields; net 5-6% is realistic after management fees and vacancy between tenants.",
    "Long-term to Singapore commuters (post-RTS) and local professionals: 5-6% net. Short-term/serviced: 6-8% gross but management-heavy. The RTS commute demographic is new — treat it as upside, not base case.",
    "Resale to Singaporean investors and Malaysian upgrade buyers once the RTS commute proves out (2027-2028). Liquidity is decent near the CIQ, thin in outer Iskandar. Hold 5-7 years for the infrastructure catalyst.",
    "JB has a real combat-sports scene plus Singapore cross-border demand. Commercial space near the CIQ is cheap; a boxing/conditioning gym serving JB locals and Singapore weekenders is a viable second site. The café + training model maps well to the Singaporean weekend crowd.",
))

NEW.append(build(
    "thailand", "Chiang Mai", "Old City fringe (Wualai / Santitham)", "condo", "mixed",
    3400000, "THB", 620, 5.8, "interesting",
    "Wualai / Santitham, Old City fringe, Chiang Mai",
    "DDProperty / FazWaz", "https://www.ddproperty.com/",
    "Thailand Elite (5yr+, ~THB 650K+ depending on tier) or the LTR visa if income qualifies. HK passport: 30-day visa-free. For a gym business, a Thai company (51% Thai-owned) or the BOI route.",
    "Foreign freehold condo quota (49% of the building). Houses/land are leasehold for foreigners (30+30). Verify quota remaining in the specific building.",
    "The brief named 'old city fringe' and the prior scan only covered Nimman. Wualai (the old silver-making street, now the Saturday walking market) and Santitham (the local-food-and-cheap-gym neighbourhood) are the actual old bones of Chiang Mai — moat-adjacent, temple-dense, still lived in by locals. Nimman is where the tourists go; Wualai is where the town still is. Prices run 20-30% cheaper than Nimman for the same 15-minute walk to the action.",
    "Chiang Mai is the OTHER Muay Thai capital — the fight-camp ecosystem around Hang Dong / San Kamphaeng is huge, but most camps sit 15-30 min out of town. A boutique boxing/conditioning gym inside the old city fringe would catch fighters AND nomads AND locals who don't want to drive out to the camps. Also: Chiang Mai's 'burning season' (Feb-Apr) crashes tourist rental — which is exactly why long-term local rental is more stable than the Airbnb crowd assumes.",
    "Burning season (Feb-Apr) is the #1 risk — air quality drops hard and short-term demand collapses; don't underwrite a 12-month Airbnb assumption. Old city fringe condos are older — check for water damage, and the foreign quota is often already full in popular buildings. Management fees and common-area condition vary 3x between buildings.",
    "Wualai and Santitham are where 30-something nomads and remote workers actually settle — cheaper and more local than Nimman. The Saturday Wualai walking street is a weekly food/festival anchor. Buy a completed older building with quota remaining, not the off-plan 'luxury' towers (oversupplied). Chiang Mai has corrected since 2024 — this is a patient lifestyle buy, not a flip.",
    "Long-term to nomads/remote workers and locals: 5-6% net. Short-term: 6-8% gross but burning-season vacancy is real. Best play: 6-12 month leases to the remote-worker crowd.",
    "Resale to the next foreign quota buyer or a Thai owner-occupier. Moderate liquidity; hold 5-8 years. Lifestyle value is the real return — treat appreciation as bonus.",
    "Santitham is nicknamed 'the gym district' (cheap Muay Thai and fitness gyms cluster there). A differentiated boutique boxing/conditioning studio near the old city would be a first-mover in the town-centre segment. The café + training model fits Chiang Mai's café culture perfectly.",
))

NEW.append(build(
    "thailand", "Hua Hin", "Hua Hin town / Khao Takiab", "condo", "mixed",
    3200000, "THB", 640, 5.5, "interesting",
    "Hua Hin town / Khao Takiab, Prachuap Khiri Khan",
    "FazWaz / DDProperty", "https://www.fazwaz.com/",
    "Same Thailand routes: Elite, LTR, or 30-day visa-free. Hua Hin is a retirement/lifestyle destination, so long-stay visas are common. BOI route for a gym/business.",
    "Foreign freehold condo quota (49%). Houses are leasehold. Hua Hin has a large foreign buyer base, so quota mechanics are well understood locally.",
    "The surprise Thailand entry. Hua Hin is the royal family's beach town — clean, safe, family-oriented, and not a Patong-style tourist trap. It's where Bangkok's upper-middle class and a big Scandinavian/expat retirement community go to decompress, and it's a genuine fight destination (several respected Muay Thai camps and training retreats). At ~HK$767K for 640sqft near the beach, it beats Phuket's tourist churn on the authenticity + community dimensions you weight.",
    "Hua Hin is the quiet-beach version of your profile: working-class Thai roots, a real seafood/food market scene, and a railway to Bangkok (being upgraded). The expat retirement community gives a stable, low-drama long-term rental pool. And the fight-tourism niche (training camps + retreats) is underserved on the hospitality side — a boxing gym with short-stay fighter accommodation is a real gap.",
    "Hua Hin prices run a wide band — beachfront vs 2-3 blocks back is a 2x difference; the value is inland. It's a slower market than Bangkok: resale liquidity is lower, so this is a hold, not a flip. The Scandinavian/expat pool is aging; the new growth is Bangkok weekenders and remote workers. Check whether the building allows short-term lets (many Hua Hin condos restrict Airbnb).",
    "Khao Takiab (the south end, near the monkey mountain) is the value pocket — cheaper than central Hua Hin, still on the beach, quiet. The railway upgrade and the 30-min Bangkok flight keep improving access. Buy a completed mid-rise with a good management committee, not the off-plan beachfront launches advertising 8% 'guaranteed' returns (those underdeliver).",
    "Long-term to expats/retirees: 5% net, very stable. Short-term: 6-7% gross but often building-restricted and seasonal. Best play: 6-12 month leases to remote workers and long-stay expats.",
    "Resale to a Bangkok buyer, a Scandinavian/European retiree, or the next foreign quota buyer. Moderate-to-thin liquidity; hold 7-10 years. The lifestyle value (a real home base near the beach) is the primary return.",
    "Hua Hin's Muay Thai camps bring a steady flow of serious fighters on training holidays; a boutique boxing/conditioning gym plus short-stay fighter accommodation is an open niche. The café + training model fits the expat and weekend-visitor crowd.",
))

NEW.append(build(
    "japan", "Sapporo", "Odori / Susukino fringe", "condo", "investment",
    25000000, "JPY", 650, 6.0, "interesting",
    "Odori / Susukino fringe, Chuo-ku, Sapporo, Hokkaido",
    "SUUMO / AtHome", "https://suumo.jp/",
    "Japan has no property-for-residency visa — the angle is asset sovereignty + cash flow, not a visa. Long-stay is possible via the Business Manager visa if you actually operate a company (¥5M capital + a physical office). HK passport: 90-day visa-free. Flagging honestly: the visa pathway here is genuinely thin.",
    "Freehold land + building, zero restrictions for foreigners — the cleanest ownership structure in the entire scan (Japan is the gold standard). No quota, no nominee, no leasehold.",
    "The most underrated big city in Japan. Sapporo is young, still growing (one of the few Japanese cities gaining population), 30-40% cheaper per sqm than Osaka, and the winter-tourism boom (Niseko/Hokkaido) is spilling over. At ~HK$1,231K for 650sqft freehold near Odori Park, you get Japan's build quality and freehold structure at a mainland-Japan discount. For the sovereignty-first profile, this is Japan's best value entry.",
    "Sapporo isn't just winter — it has a year-round food culture (ramen, seafood, curry soup) and a strong amateur boxing/combat-sport scene. The akiya door is here too: Hokkaido has Japan's cheapest akiya (from ¥1M / HK$49K), so you could pair a cheap restoration with a cash-flow condo. The Niseko second-home spillover is pushing Sapporo as the 'affordable base' for the ski set.",
    "Population is still net-positive but aging, and Japan has an oversupply of older condos — buy near transit (Odori/Susukino subway) or expect long resale times. Earthquake/snow engineering matters: get a building inspection and check the reserve fund. Agent-quoted yields (6-7%) are often gross before management fee (kyoeki-hi) + repair fund (shuzen-hi) — budget ~1% off the top. No visa pathway: don't buy this for residency.",
    "The value is a 10-15 year-old mid-rise near the Tozai or Namboku subway line, not the new towers at Sapporo Station. Japanese owners prize low management fees and a healthy reserve fund. Rental to young professionals and students is stable but low-growth; the upside is Niseko/Hokkaido tourism spilling into central districts. Sapporo rents don't spike — this is a steady 5-6% net freehold, not a growth bet.",
    "Long-term to professionals/students: 5-6% net (after management + reserve fund). Short-term: restricted in many buildings. The most stable, lowest-drama rental in the scan — but also the lowest growth.",
    "Resale to Japanese buyers or inbound buyers chasing the Hokkaido story. Japan resale liquidity is thin outside central Tokyo/Osaka — treat as a long hold. The freehold structure and weak JPY make it a currency/value play for HKD.",
    "Sapporo has an established amateur boxing and combat-sport culture. A boutique boxing/conditioning gym in Chuo-ku would find a local audience, but Japan's gym licensing and lease market are formal — the Business Manager visa route is the way to actually operate here.",
))

NEW.append(build(
    "uk", "Sheffield", "Crookes / Broomhall / Kelham Island", "house", "investment",
    120000, "GBP", 750, 7.5, "hot",
    "Crookes / Broomhall / Kelham Island, Sheffield, South Yorkshire",
    "Rightmove / Zoopla", "https://www.rightmove.co.uk/",
    "BNO visa (Paul is HK, eligible): 5 years residency + 1 year ILR = British citizenship — the 6-year path. No minimum investment; you must show you can support yourself. This is the cleanest passport pathway in the scan for a HK passport holder.",
    "Freehold (most terraces) or leasehold. No foreign restrictions. Stamp duty plus a 2% non-resident surcharge applies — factor ~3-5% in transaction costs.",
    "The deeper-value BNO play the brief's regional-cities list implies. Leeds was the hot pick last scan; Sheffield is the same story one notch cheaper and less discovered: two universities (~60,000 students), a real working-class boxing identity (Naseem Hamed's city, deep amateur scene), and terraces still trading at £110-150K with 7-8% gross yields. For a HK buyer who wants a passport AND cash flow, this is the highest-yield BNO-eligible entry in the set.",
    "Kelham Island is Sheffield's Kennedy Town — a former steel-industrial quarter turned craft-beer-and-food neighbourhood, exactly the old-bones regeneration you like. A boxing gym there is a genuine cultural fit (steel city, working-class, Hamed's home city). And the BNO community across Sheffield/Manchester/Leeds is growing — a built-in customer base of HK expats who already know the Basic Reflex brand.",
    "Gross yields are high but net is lower: HMO (house-in-multiple-occupation) licensing, student-let management, and council rules all cost time and money. Stamp duty + the 2% non-resident surcharge is a real upfront cost. Sheffield's student market is shifting (purpose-built student accommodation is overbuilt) — target young-professional terraces, not student HMOs. The BNO path is a genuine commitment: you must actually reside in the UK to convert it to citizenship.",
    "Crookes and Broomhall are the classic student/young-professional rental zones; Kelham Island is the appreciation play. Avoid the overbuilt city-centre PBSA towers. Agents quote 8-9% gross on HMOs; realistic net on a well-managed terrace is 6-7%. Cheaper entry than Manchester/Leeds with rental demand just as deep.",
    "Long-term to young professionals and postgrads: 7-8% gross, 6-7% net on a well-managed terrace. HMO conversion lifts gross but adds licensing and management. Stable, deep demand from two universities plus the post-industrial tech/creative economy.",
    "Resale to UK landlords or first-time buyers; solid liquidity for terraces. Hold 5+ years to also clock the BNO residency. The real asset is the passport optionality — the yield is the carry.",
    "Sheffield is a boxing city (Naseem Hamed, a strong amateur scene). A boutique boxing/conditioning gym in Kelham Island or the city fringe would land in a market that already respects the sport, with the HK-expat community as a ready audience. This is a gym play as much as a property play.",
))

NEW.append(build(
    "portugal", "Coimbra", "Baixa / Alta (university quarter)", "condo", "mixed",
    135000, "EUR", 700, 5.5, "interesting",
    "Baixa / Alta (university quarter), Coimbra",
    "Idealista", "https://www.idealista.pt/",
    "D7 passive-income visa (~€820-1,200/mo provable passive income). Golden Visa is fund-only (€500K), not property. EU citizenship after 5 years of residence. HK passport: 90-day visa-free in Schengen.",
    "Freehold, no foreign restrictions. IMT transfer tax (~6-7%) + annual IMI (~0.3-0.5%). Rental license (AL) required for short-term lets.",
    "The Portugal value play beyond Lisbon/Porto. Coimbra is one of Europe's oldest university cities (800 years), a 1-hour train from Porto and 2 from Lisbon, and 40-50% cheaper per sqm than either. It has the bones you like — stone facades, narrow lanes, a river, real tascas and student cafés — without the Lisbon price. At €135K for 700sqft, this is the cheapest EU-residency-anchored entry in the scan.",
    "Coimbra's rental market is structurally supported by ~25,000 students who need housing every single year — demand that doesn't vanish in a downturn. The D7 visa doesn't require you to buy (it's income-based), so the property and the visa are two separate bets you can stack. And the F&B angle: Coimbra's student café culture is real, and a bagel/coffee concept near the university would be a genuine novelty, not another Lisbon clone.",
    "IMT (~6-7%) is a real upfront cost — factor it into your HKD math. Old-town buildings in the Alta are often unreinforced masonry needing structural work — get a surveyor. Student rental is seasonal (vacant in summer) unless you target postgrads/young professionals. Coimbra is a smaller market — resale liquidity is thinner than Lisbon/Porto. The D7 route requires actually residing in Portugal to convert to citizenship.",
    "The Baixa (lower town) is the practical play — near the station and the student/commercial centre; the Alta (upper town, by the old university) is prettier but older and harder to maintain. Prices have corrected since the 2024 peak. Buy a renovated 2-bed near the Baixa for postgrad and remote-worker rental — avoid the unrenovated 'character' flats that hide six figures of work.",
    "Long-term to students/postgrads/young professionals: 5-6% net. Short-term: limited by AL licensing. Stable demand from the university; summer vacancy is the main drag. Target 12-month academic-year leases.",
    "Resale to Portuguese first-time buyers or investors. Thin-but-real liquidity. Hold 5-8 years, or longer if you pursue EU residency/citizenship. The EU passport optionality is the hidden asset.",
    "Coimbra's student population (~25,000) supports a growing fitness scene. A boutique boxing/conditioning gym near the university would find an audience of students and young professionals, and the café + training model fits the student culture. Strong first-mover potential — boxing is underserved in Coimbra.",
))

NEW.append(build(
    "other", "Da Nang", "An Thuong / My An (beach expat zone)", "condo", "mixed",
    2900000000, "VND", 700, 6.5, "wildcard",
    "An Thuong / My An, Son Tra, Da Nang, Vietnam",
    "Batdongsan.com.vn", "https://batdongsan.com.vn/",
    "Vietnam has no property-for-residency visa. HK passport: 15-45 day visa-free entry, easy 90-day e-visa. Long-stay via a business/investor visa (DN or DT class) or repeated e-visas. Residency is the weak point — flagged honestly.",
    "LEASEHOLD ONLY — foreigners can hold a 50-year leasehold on condo units (renewable), NOT freehold land. This is the same structural limit the brief flagged for Bali. Buy only a completed unit with a pink book (sổ hồng) already issued.",
    "The wildcard that earns its place. Da Nang is Southeast Asia's most liveable beach city right now: clean, safe, cheap, a huge and growing digital-nomad/expat scene, a genuinely good coffee culture (Vietnam is coffee country), and a rising Muay Thai/boxing scene near My Khe beach. At ~HK$872K for 700sqft two blocks from the beach, the lifestyle-per-dollar is the best in the scan. It is not a sovereignty play — it's a lifestyle + business play you should only take if the leasehold structure is acceptable.",
    "Da Nang is becoming the 'Bangkok of 10 years ago' for nomads — but the gym gap is real: the fight-camp tourism booming in Thailand/Phuket hasn't been exported here yet, even though the beach, food, and cost base are all present. A boxing/conditioning gym with short-stay fighter/nomad accommodation near My Khe would be a genuine first-mover. The F&B angle (coffee + bagels in the expat zone) is obvious.",
    "LEASEHOLD ONLY is the big one — 50-year tenure, renewable but not guaranteed, no freehold land. The Vietnamese condo market has had developer-solvency issues and oversupply in some districts — buy only completed units with a pink book (sổ hồng), never off-plan from a new developer. Short-term rental legality is grey and enforcement varies. No visa/residency pathway — this is a lifestyle buy, not a passport play.",
    "An Thuong / My An (the 'expat village' near My Khe beach) is the rental sweet spot — walkable beach, cafés, and the nomad/remote-worker crowd. Buy a completed mid-rise with the pink book issued and a healthy rental history. Agents quote 7-8% gross; net 6% is realistic. The market has corrected since the 2024 developer credit crunch, creating some motivated completed-stock deals.",
    "Long-term to nomads/remote workers and expats: 6-7% gross, ~6% net. Short-term: strong but legally grey. The nomad rental pool is growing fast and is less seasonal than pure tourism.",
    "Resale to the next foreign leasehold buyer (the foreign quota is a fixed % of a building, so foreign-to-foreign resale is the normal path) or a Vietnamese buyer. Liquidity is moderate and improving as the expat base grows. Hold 5-10 years; treat as a lifestyle asset with a rental carry, not a core investment.",
    "Strong and underserved. Da Nang's expat/nomad + local young-professional crowd wants a proper boxing/conditioning gym; the fight-tourism model (camps + short-stay accommodation) hasn't arrived yet. The café + training model maps perfectly to An Thuong. The best gym-potential entry in this batch — but gated on you accepting the leasehold structure.",
))

def main():
    path = "global-listings.json"
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    start = len(data)
    for i, entry in enumerate(NEW, start=start + 1):
        entry["id"] = f"GL{i:03d}"
        data.append(entry)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"Appended {len(NEW)} entries ({NEW[0]['id']}–{NEW[-1]['id']}). Total now {len(data)}.")
    for e in NEW:
        print(f"  {e['id']}  {e['city']:>12}  {e['asking_local']:>12,} {e['currency']:>3}  → HK${e['asking_hkd']:,}  {e['sqft']}sqft  HK${e['price_per_sqft_hkd']}/sqft  {e['yield_estimate_pct']}%  {e['status']}")

if __name__ == "__main__":
    main()
