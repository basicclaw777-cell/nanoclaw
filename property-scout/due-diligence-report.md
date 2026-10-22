# Due Diligence Report — Golden Zone Industrial Units (Kids Boxing Gym)

**Date:** 22 October 2026 (refreshed — prior run 15 Oct 2026)
**Scope:** 32 for-sale industrial/office units across 21 buildings, 5 golden zones
**Method:** Online sources only — no physical site visits

---

## ⚠️ Research Method & Limitations (read first)

This run hit degraded tooling, so treat confidence scores accordingly:

| Source | Status | What it provided |
|--------|--------|------------------|
| `golden-zone-units.json` (prior 28Hse scrape) | ✅ authoritative | 32 units: price, sqft, $/sf, agent, notes |
| `_dd_base.json` (prior enrichment) | ✅ | Management fees, completion dates, nearby schools + walk times, Land Registry comparables (註冊處成交), price trends |
| `oneday.com.hk` building pages | ✅ fetched directly | 11 building pages refreshed 22 Oct: exact addresses, MTR/LRT distances, school lists, 成交紀錄, rentals |
| 28Hse live pages | ❌ Cloudflare 403 | — |
| Web search (Bing / DuckDuckGo) | ❌ degraded — 0 / junk results | Could NOT retrieve: Google Maps "Popular Times", live competitor maps, government order lists |

**What this means:**
- **DMCs are not publicly posted online.** "Unknown — DMC not found online" is a genuine finding, not a gap. Every industrial building here requires a Lands Department waiver / management consent check before signing. Budget for a solicitor's Land Registry + DMC search (~HK$2–4k per shortlisted unit).
- **Google Maps "Popular Times" and per-zone competitor maps could not be pulled live.** Foot-traffic and competition notes are qualitative estimates from prior research + known MTR station character. Verify on the ground / in Google Maps before committing.
- "Government records" reflect what is in the public domain + Land Registry comparables; a formal title search (encumbrance/caveat) is a solicitor task, not an online-search task.

---

## Refresh — 22 October 2026

Second due-diligence pass. Outcome:

- **Web search backend is still down** — Bing returns 0 results for both English and Chinese queries. Google Maps "Popular Times", live competitor maps, and government order lists remain unpullable (unchanged from the 15 Oct run).
- **oneday.com.hk building pages freshly pulled for 11 of 21 buildings** (previously only ~6 had specific pages). Added verified exact addresses, MTR/LRT distances, richer school lists with distances, and fresh 成交紀錄 (transaction) + rental records. 16 report entries updated (11 unique buildings × duplicate units); `confidence` raised +5 where data was added; `last_verified` stamped.
- **10 buildings still have no oneday page** — 油塘工業城, 豐利中心, 德雅工業中心, 泰力工業中心, 富德工業大廈, 興盛工業大廈, 生利工業中心, 新寶中心, 敬運工業大廈, 佳力工業大廈. DMC/permitted-use remains unverifiable online for these; flagged in JSON `risk_flags`.

Key fresh data points:

- **華成工商中心** (resolved the "null" unit) is the closest to MTR in the whole set — ~100m from Kwun Tong MTR (成業街11號).
- **建發工業中心** densest school catchment confirmed — 9 schools listed within 500m (恩平工商會李琳明中學 180m, 道教青松小學 220m, 明愛屯門馬登基金中學 270m…).
- **南豐工業城** rental records: ~$7–8/sf net (1,238–2,439sf units at $8,600–$11,000/mo).
- **國際企業中心一期** sale records cluster April 2025 ($5.5–9.4M) — consistent with its $4,000+/sf office pricing.
- **德豐工業中心** recent 2025 sales at $2,900–6,200/sf for 401–693sf units — supports the "5%+ tenanted yield, low psf" thesis.

---

## Executive Summary

**The single biggest finding:** only **國際企業中心一期 (International Enterprise Centre 1, Tsuen Wan)** has an explicitly permitted-use profile compatible with a kids boxing gym — it is a **2022 Grade-A office building** whose listings openly market 美容 / 補習 / 工作室 / 半零售 (beauty / tutoring / studio / semi-retail) use. Every other unit is a 1980s–90s flatted factory where fitness/education use is **unverified** and likely needs a waiver.

### Top 3 shortlist

| Rank | Building | Why | Price / Size | Confidence |
|------|----------|-----|--------------|------------|
| 1 | **國際企業中心一期** (Tsuen Wan) | New 2022 office, education/studio use explicitly marketed — lowest use-restriction risk, modern fire/lift compliance | $4.22–4.50M / 1,057sf ($3,992–4,257/sf) | 68 |
| 2 | **佳力工業大廈** (San Po Kong) | Gym-ready industrial: high ceiling + 內廁 + water/drainage + Sun Hung Kai-developed + school 2 min | $4.33M / 1,103sf ($3,926/sf) | 58 |
| 3 | **建發工業中心** (Tuen Mun) | Densest school catchment (11 schools within 500m) + low psf + large footprint | $3.70M / 1,949sf ($1,898/sf) | 52 |

### By buying strategy

- **Lowest $/sf to buy:** 興盛工業大廈 (Tsuen Wan) at **$1,748/sf** — but thinnest public data (confidence 34); verify condition hard.
- **Best full-gym footprint:** 生利工業中心 (Yau Tong) 1,979sf — only unit big enough for a ring + 6–8 bags + reception; building maintenance recently completed.
- **Best value + yield:** 德豐工業中心 (Tsuen Wan) 5%+ tenanted yield at $2,111/sf; 南豐工業城 (Tuen Mun) low $0.64/sf mgmt fee + first-mover kids-boxing gap.
- **Over budget (skip):** 新科技廣場 office units ($9.99M / $10.68M, 3–5× budget), One Midtown ($7.82M), 生利 ($6.0M), 富德 1,530sf ($5.68M).

---

## Zone summary

**1. Yau Tong / Lam Tin (rank #1)** — 油塘工業城 (2 units), 生利工業中心. Dual-line MTR interchange, strong school proximity, distressed pricing (油塘工業城 price dropped ~$300k). Competition thin locally; Kwun Tong gym cluster is 1–2 stops away.

**2. Kwun Tong Town Centre (rank #2)** — 豐利中心, 敬運工業大廈, 京貿中心, 華成工商中心. Busiest MTR + established gym ecosystem (6+ gyms within 1km) — validates demand but means competition. Most units here have weak public data.

**3. Tuen Mun Town Centre (rank #3)** — 南豐工業城, 德雅工業中心, 鳴發工業中心, 建發工業中心. Best value + densest school clusters, but remote (12–15 min MTR walk for 南豐) and likely stricter industrial-use enforcement. First-mover kids-boxing opportunity.

**4. San Po Kong / Wong Tai Sin (rank #4)** — 富德工業大廈 (2), 泰力工業中心 (3), 新寶中心 (3), 佳力工業大廈, 新科技廣場 (2). Densest supply (11 sale units), Diamond Hill MTR. 佳力工業大廈 is the standout (gym-ready). 富德工業大廈 namesake is a Muay Thai chain — a martial-arts-tolerance signal.

**5. Tsuen Wan (rank #5)** — 興盛工業大廈, 德豐工業中心, 豪力中心 (2), 裕豐工業大廈, One Midtown, 國際企業中心一期 (4). Cheapest $/sf buys AND the only compliant-use option (國際企業中心一期). Strong commuter footfall.

---

## DMC / Permitted-Use — the decisive risk

| Building | DMC / Use position | Verdict |
|----------|-------------------|---------|
| 國際企業中心一期 | 2022 office; 美容/補習/工作室/半零售 explicitly marketed | ✅ Best compliance profile |
| One Midtown | 2012 industrial-office, premium | ⚠️ Verify; higher quality but use still unconfirmed |
| 佳力工業大廈 | SHK flatted factory; 高樓底 + 來去水 | ⚠️ Gym-ready physically; use needs waiver |
| 富德工業大廈 | Flatted factory; 富德拳館 namesake | ⚠️ Martial-arts precedent signal |
| All other 1980s–90s factories | Flatted factory, DMC not online | ⚠️ Lands Dept waiver + management consent required |

**No building in the set is confirmed under the government's Industrial Building Revitalisation Scheme (活化).** The 活化 buildings that appeared in prior Kwun Tong rental scans (威登中心, 德華中心, 利登中心) are **rental-only units and are not in this 32-unit sale list.**

---

## Universal risk flags (apply to every unit)

1. **DMC unverified** — fitness/education use may need Lands Department waiver; never assume industrial = permitted for a gym with minors.
2. **Ceiling height & floor loading** — only 佳力工業大廈 (高樓底) and the SPK office units (特高樓底) note high ceiling; every other viewing must confirm ≥3.0m for heavy bags / ring.
3. **Fire services + minors** — an older factory used for kids' classes raises fire-exit, ventilation, and noise-isolation requirements beyond a warehouse tenant.
4. **Lift congestion at class times** — most units are mid/high floor in single-lift buildings; 3:30–6pm drop-off is exactly when the lift is busiest.
5. **Three-phase power** — no listing mentioned 三相電; confirm amperage for ring + bags + A/C.

---

## Critical pre-purchase actions (all shortlisted units)

1. **Land Registry title search** — encumbrances, caveats, charges on the specific unit.
2. **Obtain & read the DMC** — permitted uses, management consent rules.
3. **Lands Department enquiry** — whether a waiver is needed for fitness/education use (and the fee).
4. **Buildings Department** — outstanding orders / fire safety notices.
5. **Management office interview** — operating hours, kids entry policy, renovation/floor-loading rules, 24hr access.
6. **Physical viewing** — ceiling height, floor loading, ventilation, natural light, noise isolation, lift capacity.
7. **Fire Services compliance** — fire exit + occupancy for a gym with minors.

---

## Data files

- Machine-readable: `due-diligence-report.json` (32 entries, full schema)
- This summary: `due-diligence-report.md`
- Source listings: `golden-zone-units.json`
- Enrichment (mgmt fees / comparables / schools): `_dd_base.json`
- Refresh script (22 Oct): `_dd_refresh_2026-10-22.py`

**Confidence note:** scores are 30 (limited public data — 德雅工業中心, 敬運工業大廈, 京貿中心, 興盛工業大廈, 華成工商中心, 新科技廣場) to 68 (國際企業中心一期). Any unit under 40 should be treated as "needs a call to the agent + a physical viewing before it is a real option."
