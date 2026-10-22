import json, io, os

PATH = "global-listings.json"
ARCHIVE = "global-history/global-2026-10-21.json"

FX_THB = 4.277893   # 1 HKD
FX_VND = 3294.865486

def new_entries():
    return [
        {
            "id": "GL066",
            "region": "thailand",
            "city": "Koh Samui",
            "district": "Maret (south coast)",
            "type": "house",
            "purpose": "investment",
            "asking_local": 2677500,
            "currency": "THB",
            "asking_hkd": 625900,
            "sqft": 700,
            "price_per_sqft_hkd": 894,
            "yield_estimate_pct": 5.0,
            "status": "watch",
            "address": "Maret, Koh Samui (2-bedroom house, 2026 build)",
            "source": "FazWaz (live scrape, 2026-10-18)",
            "source_url": "https://www.fazwaz.com/property-sales/2-bedroom-house-for-sale-in-maret-surat-thani-u6262727",
            "visa_angle": "N/A — this is a trap flag, not a buy. (Clean paths remain DTV or Thailand Elite.)",
            "ownership_structure": "Tagged 'Freehold' on the portal — a legal impossibility for a foreigner in Thailand. Foreigners cannot own land. A 'freehold house' listing is either leasehold mislabelled, or a nominee/company-holding structure. Both are exactly what the current crackdown is prosecuting.",
            "why_paul": "I'm showing you this NOT to buy it, but because it's the trap now sitting in plain sight. HK$626K for a 2-bed house on Samui, tagged 'Freehold' — on paper the cheapest house in the whole set. It isn't. You cannot own a house freehold in Thailand, period. Any agent who says otherwise is selling you a nominee structure or a mislabelled lease. The Israeli nominee network on Samui just got hit with 20 arrest warrants (October 2026). Don't be the next buyer.",
            "what_you_havent_considered": "The crackdown is now surfacing exactly the inventory you were warned about, at fire-sale prices, with the word 'Freehold' attached. A motivated seller + a 'Freehold' tag + a distressed island market = the classic trap formation. The bargain IS the warning sign.",
            "trap_warnings": "Foreigners cannot own land in Thailand. 'Freehold' on a house/villa = false. A second unit in the same scrape (Na Mueang) is tagged 'Leasehold,Freehold' simultaneously — the portal itself doesn't know what it's selling. Run from any house/villa marketed as foreign-freehold. Verify title at the Land Office before anything.",
            "local_insider_note": "Samui is ground zero for the current phase — 20 Israeli-nominee warrants issued this month. The legal lane is foreign-quota CONDO only (see GL061, GL065). Anything with a garden and a land title is not yours to own.",
            "rental_market": "Moot — you can't legally own it. Short-term villa rental yields are attractive (6-8%), which is exactly why the nominee structures exist. The yield is a lure, not a reason.",
            "exit_strategy": "None. Do not enter.",
            "gym_potential": "None. A gym business on Samui would mean leasehold commercial + a nominee company structure — the two highest-risk structures in Thailand right now.",
            "scan_date": "2026-10-21",
        },
        {
            "id": "GL067",
            "region": "thailand",
            "city": "Chiang Mai",
            "district": "Pa Daet / Mueang Chiang Mai",
            "type": "condo",
            "purpose": "investment",
            "asking_local": 652800,
            "currency": "THB",
            "asking_hkd": 152600,
            "sqft": 344,
            "price_per_sqft_hkd": 444,
            "yield_estimate_pct": 5.0,
            "status": "watch",
            "address": "Baan Ua-Athorn Chao Mae Kuan-Im, Pa Daet, Chiang Mai",
            "source": "FazWaz (live scrape, 2026-10-18)",
            "source_url": "https://www.fazwaz.com/property-sales/2-bedroom-apartment-for-sale-at-baan-ua-athorn-chao-mae-kuan-im-in-pa-daet-chiang-mai-u6075559",
            "visa_angle": "N/A — not buyable by a foreigner.",
            "ownership_structure": "Baan Ua-Athorn is Thailand's government affordable-housing scheme (National Housing Authority). Units are restricted to Thai nationals — foreigners cannot legally purchase. The 'cheapest condo on the portal' is not for sale to you.",
            "why_paul": "The cheapest condos in Chiang Mai this week — HK$153K for a 2-bed — are government low-income housing. They are NOT buyable by a foreigner. I'm flagging it because 'cheapest' is the first filter anyone uses, and these will catch your eye and waste your time. The real foreign-quota floor in Chiang Mai is GL062 (Angket Pavillian, HK$163K) — only 6% more, and actually yours to own.",
            "what_you_havent_considered": "The portal doesn't filter out Thai-citizen-only housing. The 'value' end of any Thai search is polluted with Baan Ua-Athorn and similar NHA blocks. The useful signal: the true foreign-quota floor sits only slightly above them, meaning the clean lane is barely more expensive than the restricted lane.",
            "trap_warnings": "Government/NHA affordable housing = Thai-nationals-only. Don't let a 2-bed at HK$153K become the reason you look past a legal studio at HK$163K. Verify foreign-quota eligibility on every unit, not just the price.",
            "local_insider_note": "Chiang Mai's real foreign-quota stock (Angket, D Condo, etc.) sits at THB 700K-1.5M. Baan Ua-Athorn at THB 650K is the ceiling of what you CAN'T buy, sitting just below what you CAN. That gap — 6% — is the smallest it's been, which means the clean lane is the best relative value in the market.",
            "rental_market": "Moot — not buyable.",
            "exit_strategy": "None. Do not enter.",
            "gym_potential": "None.",
            "scan_date": "2026-10-21",
        },
        {
            "id": "GL068",
            "region": "thailand",
            "city": "Phuket",
            "district": "Patong / Kathu",
            "type": "condo",
            "purpose": "investment",
            "asking_local": 2932500,
            "currency": "THB",
            "asking_hkd": 685500,
            "sqft": 305,
            "price_per_sqft_hkd": 2248,
            "yield_estimate_pct": 5.5,
            "status": "watch",
            "address": "The Art At Patong, Patong, Kathu, Phuket",
            "source": "FazWaz (live scrape, 2026-10-18)",
            "source_url": "https://www.fazwaz.com/property-sales/studio-condo-for-sale-at-the-art-at-patong-in-patong-phuket-u6863465",
            "visa_angle": "Same clean lanes (DTV / Thailand Elite). Ownership doesn't change the neighborhood problem.",
            "ownership_structure": "Foreign freehold quota condo (legal, 49% cap). 2011 build, 28.31 sqm studio. Ownership is clean — this is a genuine foreign-quota title.",
            "why_paul": "The only reason this is here: it's a clean foreign-quota title in the exact place you told me NOT to look. Patong. HK$686K for a 28sqm studio, 2km from the beach, foreign-quota verified. Compare it to GL063 — the same quota dollar buys Rawai/Soi Ta-iad (HK$792K) with a real Muay Thai community. The point is the QUOTA, not the neighborhood: clean titles are priced the same whether you're on a fight-camp street or a tourist strip. Pay for the community, not the title.",
            "what_you_havent_considered": "The foreign-quota premium is uniform across Phuket — Patong and Rawai trade at nearly the same price per quota-sqm. So there's no 'discount' for the tourist trap; you'd pay full price for a neighborhood you rejected on principle. The arbitrage is to buy the same title where the demand is real (fighters, long-stay expats), not seasonal tourists.",
            "trap_warnings": "Patong = the tourist-trap demand side you reject. Short-term Airbnb yield here is high but legally grey, and enforcement is rising (same crackdown wave). If you ever buy a Patong studio, you're buying a seasonal hotel room, not a community.",
            "local_insider_note": "Patong's short-term rental market is saturated and the clean-lane buyers are fleeing to Rawai/Chalong/Bang Tao. This unit is a marker: it tells you the quota is priced in, and the neighborhood is where your edge lives.",
            "rental_market": "Short-term 6-8% (grey), long-term 3-4% to seasonal hospitality workers. Volatile.",
            "exit_strategy": "Thin. Resale to next foreign-quota buyer, but Patong has the weakest long-term demand profile on the island.",
            "gym_potential": "Wrong side of the island for your gym. Soi Ta-iad (GL063) is where the fight economy lives. Patong gyms are fitness-tourist filler.",
            "scan_date": "2026-10-21",
        },
        {
            "id": "GL069",
            "region": "other",
            "city": "Ho Chi Minh City (Saigon)",
            "district": "Bình Thạnh / District 3 fringe",
            "type": "condo",
            "purpose": "mixed",
            "asking_local": 3200000000,
            "currency": "VND",
            "asking_hkd": 971000,
            "sqft": 538,
            "price_per_sqft_hkd": 1804,
            "yield_estimate_pct": 4.5,
            "status": "interesting",
            "address": "Bình Thạnh, HCMC (Saigon River side, District 1 fringe)",
            "source": "Calibrated estimate (web_search degraded — no live portal verified). Market context: HCMC apartment prices 2025-2026.",
            "source_url": "",
            "visa_angle": "Vietnam offers a 90-day e-visa for HK/BNO passports; long-stay needs a work permit, business visa, or a long-stay visa class. No property-linked residency — buying here does not buy you a visa.",
            "ownership_structure": "Foreigners CAN buy apartments (up to 30% of a building) but only on 50-year leasehold (renewable), not freehold. Houses/land are off-limits. Cleaner than a Thai nominee, but it's leasehold, not freehold — this fails your 'freehold or equivalent' test, flagged honestly.",
            "why_paul": "The one big market you haven't seen, and the closest thing to Hong Kong energy in Southeast Asia. HCMC (Saigon) is 14 million people, a real and fast-growing fight scene (MMA and boxing gyms in District 1/3), and coffee is Vietnam's national religion — your bagel/catering model would land harder here than almost anywhere in the region. Bình Thạnh is the working-class river district gentrifying exactly the way Kennedy Town did. The honest catch: leasehold-only for foreigners, so this is a lifestyle/business play, not a sovereignty play.",
            "what_you_havent_considered": "Vietnam's coffee culture is deeper than Bangkok's — it's the world's #2 coffee exporter and Saigon drinks it at every street corner, all day. A 'boxing + coffee' concept fits here in a way it doesn't even in Thailand. And the combat-sports economy (One Championship, MMA gyms, Muay Thai-influenced kickboxing) is expanding faster in Vietnam than anywhere in the region right now.",
            "trap_warnings": "Leasehold (50-year, renewable) is not freehold — you're buying a long lease, not the title. The 30% foreign cap per building can fill. Vietnam's property market is boom-bust (2022-2023 saw a correction and developer distress). Verify developer and pink book (ownership certificate) status. Do not treat this as a sovereignty asset.",
            "local_insider_note": "Vietnam's mid-market has corrected since the 2022 peak; developer discounts for cash buyers are real. But the foreign-leasehold premium means you pay close to freehold prices for a lease — the value here is the business/community play, not the asset appreciation.",
            "rental_market": "Long-term 4-5% to young professionals and expat/remote workers. Short-term regulated. Stable but capped.",
            "exit_strategy": "Leasehold resale to the next foreign buyer (30% quota pool) — moderate liquidity in popular buildings, thin elsewhere. The remaining lease term is a permanent discount at resale.",
            "gym_potential": "Strong — District 1/Bình Thạnh commercial lease is cheap by HK standards, and a coach-led Cuban-school gym in a city with Vietnam's martial-arts heritage would be a genuine first-mover.",
            "scan_date": "2026-10-21",
        },
    ]


def main():
    with open(PATH, encoding="utf-8") as f:
        data = json.load(f)
    existing_ids = {x["id"] for x in data}
    adds = [e for e in new_entries() if e["id"] not in existing_ids]
    data.extend(adds)
    with open(PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    with open(ARCHIVE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("added:", [e["id"] for e in adds])
    print("total now:", len(data))


if __name__ == "__main__":
    main()
