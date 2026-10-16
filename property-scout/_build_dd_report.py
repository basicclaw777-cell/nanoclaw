#!/usr/bin/env python3
"""
Build due-diligence-report.json for the 32 Golden Zone industrial sale units.
Merges:
  1. golden-zone-units.json (authoritative 32 sale units)
  2. _dd_base.json (enriched: mgmt fee, completion, schools, Land Registry comparables, trend)
  3. Hand-curated research (DMC/permitted use, management, MTR distance, competition, foot traffic)
Online-only research. Search backend (Bing/DDG) was degraded this run; 28Hse Cloudflare-blocked;
oneday.com.hk building pages fetched directly. DMCs are not publicly posted online -> flagged.
"""
import json, os

BASE = os.path.dirname(os.path.abspath(__file__))

units = json.load(open(os.path.join(BASE, 'golden-zone-units.json')))
# The 32 SALE units = the task list
SALE_IDX = [0,3,8,9,10,11,12,13,14,15,16,17,19,20,21,22,23,24,25,26,27,28,31,32,33,34,35,36,37,38,39,40]

# Load enriched base data keyed by (building) -> best row
_base = json.load(open(os.path.join(BASE, '_dd_base.json')))
BASE_BY_BUILDING = {}
for row in _base:
    b = row['building']
    # keep first occurrence; also stash all
    BASE_BY_BUILDING.setdefault(b, row)

# ---------------------------------------------------------------------------
# Zone-level context
# ---------------------------------------------------------------------------
ZONES = {
 'Yau Tong / Lam Tin': {
   'mtr': 'Yau Tong MTR (Kwun Tong Line + Tseung Kwan O Line interchange)',
   'foot_traffic': 'Yau Tong MTR is a commuter-heavy interchange; busiest 7-9am and 6-8pm, with a school rush 3-4pm. Weekend footfall is lower than Kwun Tong town centre.',
   'school_dismissal': 'Most Yau Tong / Lam Tin primary schools dismiss 3:15-3:45pm; secondary 3:30-4:00pm. Standard HK academic year Sep-Jul.',
   'competition': [
     {'name':'Fu Tak Thai Boxing 富德拳館 (Kwun Tong branch)','distance':'~1.5-2km','type':'Muay Thai / Fitness','pricing':'not listed'},
   ],
   'competition_note': 'Few gyms directly in Yau Tong; the dense Kwun Tong gym cluster is 1-2 MTR stops away.',
 },
 'Kwun Tong Town Centre': {
   'mtr': 'Kwun Tong MTR (Kwun Tong Line)',
   'foot_traffic': 'Kwun Tong MTR is one of the busiest on the line. Peaks 8-9am (office workers) and 5-7pm (commuters); APM mall drives steady weekend footfall.',
   'school_dismissal': 'Primary schools dismiss ~3:15-3:45pm; secondary ~3:30-4:00pm.',
   'competition': [
     {'name':'Oriental Martial Arts (OMA) 東方體育會','distance':'~350m','type':'Taekwondo / Kickboxing / Chinese MA','pricing':'not listed'},
     {'name':'Fury MuayThai & Boxing','distance':'~400m','type':'Muay Thai / Boxing','pricing':'not listed'},
     {'name':'James Yuen Boxing Club (JYBC) 自強拳擊同學會','distance':'~600m','type':'Boxing / Muay Thai (since 1982)','pricing':'not listed'},
     {'name':'Victory Kidult Academy','distance':'~500m','type':'Kids fitness / Taekwondo / Boxing','pricing':'not listed'},
     {'name':'Fu Tak Thai Boxing 富德拳館 (Kwun Tong)','distance':'~800m','type':'Muay Thai / Fitness','pricing':'not listed'},
     {'name':'A+ Pro Sports','distance':'~500m','type':'Kids Muay Thai (Sat) / K-Pop / Kung Fu','pricing':'kids class on Instagram'},
   ],
   'competition_note': 'Crowded market validates demand; differentiate with dedicated kids-only boxing.',
 },
 'Tuen Mun Town Centre': {
   'mtr': 'Tuen Mun MTR (Tuen Ma Line) + extensive LRT network',
   'foot_traffic': 'Tuen Mun MTR is moderate; peaks commute hours. The industrial belt (建發街 / 山景) is quieter than town centre with lower passer-by traffic.',
   'school_dismissal': 'Primary ~3:15-3:30pm; secondary ~3:30-4:00pm. Dense school cluster around 山景邨 / 大興邨.',
   'competition': [
     {'name':'K. Zero Martial Arts 刑拳館','distance':'~1km','type':'Self-service boxing gym (24hr rental)','pricing':'hourly rental'},
     {'name':'Top One Thai Boxing & Fitness','distance':'~1.5km','type':'Muay Thai / Fitness / Yoga','pricing':'trial ~HK$100'},
     {'name':'Fu Tak Thai Boxing 富德拳館 (Tuen Mun)','distance':'~1.5km','type':'Muay Thai / Fitness (chain)','pricing':'not listed'},
     {'name':'Pitstop Fitness / Your Fitness','distance':'~1km','type':'Muay Thai / MMA / TRX','pricing':'not listed'},
     {'name':'One Strike Combat','distance':'~2km','type':'MMA','pricing':'not listed'},
   ],
   'competition_note': 'No dedicated kids boxing competitor - potential first-mover advantage.',
 },
 'San Po Kong / Wong Tai Sin': {
   'mtr': 'Diamond Hill MTR (Tuen Ma Line + Kwun Tong Line) and Kai Tak MTR (Tuen Ma Line)',
   'foot_traffic': 'Diamond Hill MTR is a busy interchange. San Po Kong industrial streets are quieter than Kwun Tong; footfall is office/workshop-driven 8am-6pm.',
   'school_dismissal': 'Primary ~3:15-3:45pm; secondary ~3:30-4:00pm.',
   'competition': [
     {'name':'Fu Tak Thai Boxing 富德拳館 (San Po Kong / Wong Tai Sin area)','distance':'within zone','type':'Muay Thai / Fitness (chain)','pricing':'not listed'},
   ],
   'competition_note': 'Moderate martial arts presence; requires on-the-ground Google Maps verification (search backend unavailable this run).',
 },
 'Tsuen Wan': {
   'mtr': 'Tsuen Wan MTR (Tsuen Wan Line terminus) + Tsuen Wan West MTR (Tuen Ma Line)',
   'foot_traffic': 'Tsuen Wan is a dense commuter and shopping area; heavy footfall 7-9am and 5-8pm plus weekend shoppers.',
   'school_dismissal': 'Primary ~3:15-3:45pm; secondary ~3:30-4:00pm.',
   'competition': [
     {'name':'Multiple boxing / martial arts studios in Tsuen Wan town centre','distance':'within zone','type':'Boxing / Muay Thai / fitness','pricing':'varies'},
   ],
   'competition_note': 'Tsuen Wan has an established fitness market; specific competitor map requires live Google Maps (backend unavailable).',
 },
}

# ---------------------------------------------------------------------------
# Per-building research (hand-curated from _dd_base + oneday + prior reports)
# ---------------------------------------------------------------------------
RESEARCH = {
 '油塘工業城': dict(
   street='高輝道17號, Yau Tong, Kwun Tong', mgmt_fee=1.09, completion='1988-11-28', age=37,
   mtr='~300-400m walk from Yau Tong MTR (dual-line interchange)',
   dmc='Unknown — DMC not found online. Strata-titled flatted factory (per-unit DMC check mandatory). Fitness/education use likely requires Lands Department waiver + management consent.',
   revitalized=False,
   mgmt_company='Unknown — enquire via listing agent (fee ~HK$1.09/sf)',
   op_hours='24hr access typical for this Yau Tong factory (verify with management)',
   permitted='Industrial (flatted factory). Internal toilet/water supply noted (showers possible). Verify ceiling height and floor loading for heavy bags before commitment.',
   route='Flat, well-lit industrial route from Yau Tong MTR via Ko Fai Road; wide pavements, vehicle traffic in business hours.',
   risks=['High-floor unit — kids accessibility / lift congestion at class times','DMC not verified — fitness use may need waiver','No photos in listing — condition unknown','Older building (1988) — check fire services & ceiling'],
   opps=['Cheapest $/sf sale in top-ranked zone ($2,114/sf)','Internal toilet + water supply (showers possible)','Distressed/negotiable pricing signal (price dropped ~$300k since prior run)','Dual-line MTR interchange catchment'],
   conf=62, src=['https://www.28hse.com/buy/office/property-3951070','https://www.oneday.com.hk'],
 ),
 '豐利中心': dict(
   street='開源道54號, Kwun Tong', mgmt_fee=1.32, completion='1989-12-20', age=36,
   mtr='~300-500m walk from Kwun Tong MTR',
   dmc='Unknown — DMC not found online. Standard Kwun Tong industrial building; many boxing/fitness gyms already operate in Kwun Tong industrial stock (pragmatic enforcement).',
   revitalized=False,
   mgmt_company='Unknown — enquire via listing agent (fee ~HK$1.32/sf)',
   op_hours='Typical Kwun Tong industrial: 24hr access with security guard',
   permitted='Industrial. Podium unit (平台單位) with container-truck access (40尺櫃) — good loading access for fit-out. Verify permitted use with Lands Department.',
   route='Central Kwun Tong industrial streets — wide, well-lit, heavy vehicle traffic in business hours; quiet after 7pm.',
   risks=['Declining 19% YoY trend','DMC unverified','Central location = more competitors within 1km','Podium unit may have specific loading/lift constraints'],
   opps=['Central Kowloon East, excellent MTR access','Podium + loading access suits gym fit-out','Distressed/一口價 pricing signal','Large established gym ecosystem nearby proves demand'],
   conf=60, src=['https://www.28hse.com/buy/office/property-4013284','https://www.oneday.com.hk'],
 ),
 '南豐工業城': dict(
   street='18 Tin Hau Road, Tuen Mun', mgmt_fee=0.64, completion='1989-08-22', age=37,
   mtr='~12-15 min walk from Tuen Mun MTR (weak); LRT + Green Minibus 41 + Lung Mun Oasis interchange ~510m',
   dmc='Unknown — DMC not found online. Likely restricted to industrial use; not confirmed under Revitalisation Scheme. Nan Fung as single developer/manager may actively restrict non-industrial tenants.',
   revitalized=False,
   mgmt_company='南豐物業管理 (Nan Fung Property Management) — professional single-owner management',
   op_hours='Standard industrial hours; verify 24hr access for class times',
   permitted='Industrial (flatted factory, 5 blocks + central services building). 1989 Nan Fung Group development. Fitness/education use higher-risk here vs Kowloon (stricter enforcement).',
   route='Flat walk but 12-15 min from MTR through Tin Hau Road industrial area — may concern parents for younger kids; consider shuttle/escort from Tuen Mun MTR.',
   risks=['Long 12-15 min MTR walk — inconvenient for parent drop-off','Remote — catchment limited to Tuen Mun','Stricter industrial-use enforcement likely','Thin sales market — hard to value/exit','Children walking through industrial area may concern parents'],
   opps=['Very few kids boxing competitors — first-mover opportunity','Two secondary schools within 250m (Yan Chai No.2 200m, Ju Ching Chu 240m)','Low entry ($1,902/sf) and low mgmt fee ($0.64/sf confirmed)','Professional Nan Fung management'],
   schools=['200m to Yan Chai Hospital No.2 Secondary','240m to Ju Ching Chu Secondary (Tuen Mun)','340m to CCC Hoh Fuk Tong Primary','450m to Islamic Primary'],
   rentals='HK$6-10/sf typical. Confirmed: 1,252sf @ HK$9,000 (May 2023); 1,838sf @ HK$11,000 (Mar 2023); 1,238sf @ HK$8,600 (Nov 2024); 1,069sf @ HK$10,000 (Aug 2023).',
   trend='Flat to slightly declining; wide HK$6-13/sf rental range depending on unit condition.',
   conf=58, src=['https://www.oneday.com.hk/en_US/buildings/nan-fung-industrial-city/','https://www.nanfung.com/'],
 ),
 '德雅工業中心': dict(
   street='Tuen Mun (exact street unverified)', mgmt_fee=None, completion=None, age=None,
   mtr='Tuen Mun industrial belt (exact MTR walk unverified — likely 10-15 min)',
   dmc='Unknown — DMC not found online. Standard Tuen Mun flatted factory; fitness/education use likely requires waiver.',
   revitalized=False,
   mgmt_company='Unknown — limited public data',
   op_hours='Unknown — verify with management',
   permitted='Industrial. Listing markets "high yield" (買少見少，高厘回報) — tenanted income property; may be restricted to industrial/warehouse use.',
   route='Unverified — Tuen Mun industrial area, flat terrain.',
   risks=['Very limited public data — address/management unverified','DMC unverified','Small unit (852sf) — tight for a full gym layout','No completion/mgmt-fee data found'],
   opps=['Low absolute price ($1.85M, $2,171/sf)','Tenanted (income during fit-out planning)'],
   conf=30, src=['https://www.28hse.com/buy/office/property-3982186'],
 ),
 '鳴發工業中心': dict(
   street='建發街1號, Tuen Mun', mgmt_fee=None, completion=None, age=None,
   mtr='Tuen Mun industrial belt (建發街) — LRT/bus served; ~10-15 min from Tuen Mun MTR',
   dmc='Unknown — DMC not found online. Standard Tuen Mun flatted factory.',
   revitalized=False,
   mgmt_company='Unknown — enquire via listing agent',
   op_hours='24hr access noted in prior listing tags (verify)',
   permitted='Industrial. 交吉放售 (vacant possession) — clean fit-out start. Verify fitness/education use.',
   route='Flat Tuen Mun industrial streets; moderate vehicle traffic.',
   risks=['DMC unverified','Tuen Mun remote catchment','No mgmt-fee data found','Flat price trend — limited upside'],
   opps=['Vacant possession (交吉) — ready for fit-out','$2,484/sf in-budget','Nearby school cluster (道教青松小學 3min, 田家炳中學 5min)'],
   conf=42, src=['https://www.28hse.com/buy/office/property-3952699'],
 ),
 '富德工業大廈': dict(
   street='雙喜街17號, San Po Kong, Wong Tai Sin', mgmt_fee=None, completion=None, age=None,
   mtr='San Po Kong industrial core — ~5-8 min walk to Diamond Hill MTR',
   dmc='Unknown — DMC not found online. Standard San Po Kong flatted factory. Note: 富德拳館 (Fu Tak Thai Boxing) is a well-known Muay Thai chain of the same name — a signal the building/area tolerates martial-arts use.',
   revitalized=False,
   mgmt_company='Unknown — enquire via listing agent',
   op_hours='Typical San Po Kong industrial hours (verify 24hr access)',
   permitted='Industrial. 1530sf / 1520sf units; one has parking (有停車場). Verify ceiling + floor loading.',
   route='Flat San Po Kong industrial streets near 大有街/雙喜街; well-lit.',
   risks=['Declining 31% YoY — steep','DMC unverified','San Po Kong footfall thinner than Kwun Tong','No completion/mgmt-fee data'],
   opps=['Strong martial-arts precedent in building/area (富德拳館 namesake)','1530sf good size for gym + reception','Negotiable (業主急售 on one unit)'],
   conf=48, src=['https://www.28hse.com/buy/office/property-4025225','https://www.28hse.com/buy/office/property-3922596'],
 ),
 '泰力工業中心': dict(
   street='大有街32號, San Po Kong, Wong Tai Sin', mgmt_fee=1.3, completion='1991-07-09', age=35,
   mtr='San Po Kong core — ~5-8 min to Diamond Hill MTR',
   dmc='Unknown — DMC not found online. Standard San Po Kong flatted factory.',
   revitalized=False,
   mgmt_company='Unknown — enquire via listing agent (fee ~HK$1.30/sf)',
   op_hours='24hr access + 24hr CCTV noted in listing (verify)',
   permitted='Industrial. High-floor units with 開揚 view; 1308sf / 1606sf. Verify ceiling + floor loading.',
   route='Flat, near 大有街 commercial/industrial mix; well-lit.',
   risks=['Transaction data volatile (reported "Rising 88%" appears to be a data artifact — treat trend as unclear)','DMC unverified','Three units same building — check why multiple listings (liquidity/distress)'],
   opps=['Core San Po Kong location','24hr access + CCTV','$3,884-3,998/sf in-budget for the size','School (陳南昌夫人小學) 3min'],
   trend='Unclear — reported "Rising 88%" appears to be a data artifact; treat as flat with limited liquidity.',
   conf=50, src=['https://www.28hse.com/buy/office/property-1253783','https://www.28hse.com/buy/office/property-4029762','https://www.28hse.com/buy/office/property-3915272'],
 ),
 '新寶中心': dict(
   street='五芳街10號, San Po Kong, Wong Tai Sin', mgmt_fee=None, completion=None, age=None,
   mtr='~2-3 min walk to Diamond Hill MTR (stated in listing)',
   dmc='Unknown — DMC not found online. Standard San Po Kong flatted factory.',
   revitalized=False,
   mgmt_company='Unknown — enquire via listing agent',
   op_hours='24hr access + 獨立洗手間 + 獨立冷氣 noted (verify)',
   permitted='Industrial. 1267sf units, 3 identical listings (market liquidity signal). 2-3 min MTR is the key draw.',
   route='Very short, flat walk from Diamond Hill MTR; well-lit commercial area.',
   risks=['Three identical 1267sf units listed — possible oversupply/distress in building','DMC unverified','Flat price trend','No completion/mgmt-fee data'],
   opps=['Closest-to-MTR unit in San Po Kong set (2-3 min)','獨立洗手間 + 24hr access','$3,946/sf in-budget'],
   conf=48, src=['https://www.28hse.com/buy/office/property-3835902','https://www.28hse.com/buy/office/property-3801790','https://www.28hse.com/buy/office/property-4010471'],
 ),
 '生利工業中心': dict(
   street='茶果嶺道610號, Yau Tong, Kwun Tong', mgmt_fee=None, completion=None, age=None,
   mtr='Near Yau Tong MTR (近油塘地鐵站 per listing) — ~300-400m',
   dmc='Unknown — DMC not found online. Standard Yau Tong flatted factory. Building maintenance recently completed (已做完大廈維修).',
   revitalized=False,
   mgmt_company='Unknown — enquire via listing agent',
   op_hours='Typical Yau Tong industrial hours',
   permitted='Industrial. Large 1979sf unit — best size for full gym (ring + bags + reception). Verify ceiling + floor loading.',
   route='Flat route from Yau Tong MTR via Cha Kwo Ling Road; well-lit.',
   risks=['Declining 28% YoY — steep','Largest unit = higher absolute cost ($6.0M)','DMC unverified','No completion/mgmt-fee data'],
   opps=['1979sf — only unit big enough for a full ring + 6-8 bags + reception','Building maintenance recently completed (lower capex risk)','Near Yau Tong MTR','Schools 3-6 min walk'],
   conf=50, src=['https://www.28hse.com/buy/office/property-3976948'],
 ),
 '華成工商中心': dict(
   street='Kwun Tong (exact street unverified)', mgmt_fee=None, completion=None, age=None,
   mtr='Kwun Tong area (exact walk unverified)',
   dmc='Unknown — DMC not found online. Owner-direct listing (業主盤) with 5+房 3廁所 layout — suggests a converted/office-style unit rather than raw factory.',
   revitalized=False,
   mgmt_company='Unknown — owner-direct listing, no agent',
   op_hours='Unknown',
   permitted='Industrial/office-style unit (5+ rooms, 3 toilets). Layout may already be subdivided — would need opening up for a gym. Verify permitted use.',
   route='Unverified.',
   risks=['Exact address/management unverified','Subdivided layout (5+房 3廁所) — costly to open up','No comparable/trend data','Owner-direct (業主盤) — less structured transaction'],
   opps=['Owner-direct may negotiate on price','1021sf in-budget ($3,604/sf)','Renovated (雅緻裝修)'],
   conf=28, src=['https://www.28hse.com/buy/office/property-3402100'],
 ),
 '敬運工業大廈': dict(
   street='Kwun Tong (exact street unverified)', mgmt_fee=None, completion=None, age=None,
   mtr='Kwun Tong industrial area (exact walk unverified)',
   dmc='Unknown — DMC not found online. Standard Kwun Tong flatted factory.',
   revitalized=False,
   mgmt_company='Unknown — enquire via listing agent',
   op_hours='Unknown',
   permitted='Industrial. Small 846sf unit with 寫裝 (office-style fit-out). Tight for a full gym but workable for a small studio.',
   route='Unverified.',
   risks=['Very limited public data','846sf small for gym','DMC unverified','No comparable/trend data'],
   opps=['Low absolute price ($3.10M)','Kwun Tong location'],
   conf=28, src=['https://www.28hse.com/buy/office/property-4010507'],
 ),
 '京貿中心': dict(
   street='Kwun Tong (exact street unverified)', mgmt_fee=None, completion=None, age=None,
   mtr='Near MTR (近地鐵 per listing)',
   dmc='Unknown — DMC not found online. Standard Kwun Tong industrial.',
   revitalized=False,
   mgmt_company='Unknown — enquire via listing agent',
   op_hours='24hr access + CCTV noted (verify)',
   permitted='Industrial. 1003sf 連租約 (tenanted) — income while you plan. Verify permitted use + ceiling.',
   route='Unverified.',
   risks=['Tenanted (連租約) — vacant-possession timing risk','DMC unverified','No comparable/trend data','Exact address unverified'],
   opps=['Tenanted = immediate yield','24hr access','1003sf in-budget ($3,968/sf)'],
   conf=28, src=['https://www.28hse.com/buy/office/property-4042657'],
 ),
 '建發工業中心': dict(
   street='建發街13號, Tuen Mun', mgmt_fee=None, completion=None, age=None,
   mtr='山景/大興 industrial belt — LRT 河田站 ~0.6km; buses 66M/66X; ~10-15 min from Tuen Mun MTR',
   dmc='Unknown — DMC not found online. Standard Tuen Mun flatted factory.',
   revitalized=False,
   mgmt_company='Unknown — enquire via listing agent',
   op_hours='Typical Tuen Mun industrial hours',
   permitted='Industrial. Large 1949sf unit — good full-gym footprint. Verify ceiling + floor loading.',
   route='Flat; near 山景邨 / 大興邨 residential edge (more families than pure industrial belt).',
   risks=['$3.7M is above the ~$3M sweet spot','DMC unverified','Remote from Tuen Mun town centre','Flat price trend'],
   opps=['Exceptionally dense school cluster — 11 schools within 500m (恩平工商會李琳明中學 180m, 道教青松小學 220m)','1949sf large footprint','$1,898/sf low psf'],
   conf=52, src=['https://www.28hse.com/buy/office/property-3650723','https://www.oneday.com.hk/zh_HK/buildings/kin-fat-industrial-centre/'],
 ),
 '佳力工業大廈': dict(
   street='大有街33號, San Po Kong, Wong Tai Sin', mgmt_fee=None, completion='1989-02-02', age=37,
   mtr='San Po Kong core — ~5-8 min to Diamond Hill MTR',
   dmc='Unknown — DMC not found online. Standard San Po Kong flatted factory (Sun Hung Kai-developed 新鴻基靚樓).',
   revitalized=False,
   mgmt_company='Unknown — enquire via listing agent',
   op_hours='24hr access + 獨立洗手間 noted (verify)',
   permitted='Industrial. High ceiling (高樓底) + 內廁 + 來去水 (water/drainage) + 即買即用 — most gym-ready San Po Kong option. Verify ceiling height figure.',
   route='Flat, near 大有街; well-lit.',
   risks=['DMC unverified','San Po Kong footfall thinner than Kwun Tong','No mgmt-fee data','Rising trend (+12%) reduces negotiation headroom'],
   opps=['High ceiling + water/drainage + 內廁 = gym-ready','Sun Hung Kai-developed building (quality)','即買即收租 (immediate yield option)','School (陳南昌夫人小學) 2min'],
   conf=58, src=['https://www.28hse.com/buy/office/property-3820689'],
 ),
 '興盛工業大廈': dict(
   street='Tsuen Wan (沙咀道/柴灣角 area, exact street unverified)', mgmt_fee=None, completion=None, age=None,
   mtr='Near Tsuen Wan West rail (近西鐵站 per listing)',
   dmc='Unknown — DMC not found online. Standard Tsuen Wan flatted factory.',
   revitalized=False,
   mgmt_company='Unknown — enquire via listing agent',
   op_hours='Unknown',
   permitted='Industrial. 1373sf with ~86% efficiency (實用) + 內廁. Best $/sf buy in the entire search ($1,748/sf). Verify permitted use.',
   route='Unverified.',
   risks=['Very limited public data','DMC unverified','No comparable/trend data','Cheapest $/sf may reflect a distressed/low-quality unit — verify condition'],
   opps=['Cheapest $/sf in all 5 zones ($1,748/sf)','~86% usable area (high efficiency)','內廁','Near West Rail'],
   conf=34, src=['https://www.28hse.com/buy/office/property-4043244'],
 ),
 '德豐工業中心': dict(
   street='德士古道, Tsuen Wan East', mgmt_fee=None, completion=None, age=None,
   mtr='Tsuen Wan East / Kwai Chung border (德士古道) — bus/LRT served; ~8-12 min to Tsuen Wan MTR',
   dmc='Unknown — DMC not found online. Standard Tsuen Wan flatted factory.',
   revitalized=False,
   mgmt_company='Unknown — enquire via listing agent',
   op_hours='Unknown',
   permitted='Industrial. 1080sf 連租約 (5%+ yield tenanted). Verify permitted use + ceiling.',
   route='Flat, near Texaco Road; moderate industrial traffic.',
   risks=['Tenanted (連租約) — vacant-possession timing','DMC unverified','No mgmt/completion data','Border location (Tsuen Wan East / Kwai Chung)'],
   opps=['5%+ yield (tenanted)','$2,111/sf in-budget','Schools within 410-470m'],
   schools=['410m to 聖公會主恩小學','470m to 李一諤紀念學校','410m to 玫瑰蕾小學'],
   conf=34, src=['https://www.28hse.com/buy/office/property-3831723','https://www.oneday.com.hk/zh_HK/buildings/tak-fung-industrial-centre/'],
 ),
 '豪力中心': dict(
   street='沙咀道66A號, Tsuen Wan', mgmt_fee=1.76, completion='1994-06-08', age=32,
   mtr='Tsuen Wan West / town centre area (沙咀道) — ~5-10 min walk',
   dmc='Unknown — DMC not found online. Standard Tsuen Wan flatted factory.',
   revitalized=False,
   mgmt_company='Unknown — enquire via listing agent (fee ~HK$1.76/sf)',
   op_hours='24hr access noted (verify)',
   permitted='Industrial. 885sf units with 內廁 + 落地玻璃 (floor-to-ceiling windows). Good natural light for a studio. Verify ceiling.',
   route='Flat, central Tsuen Wan; well-lit; near retail/residential.',
   risks=['Declining 17% YoY','Small (885sf)','DMC unverified','Two units same building — liquidity signal'],
   opps=['Central Tsuen Wan, near 王少清中學 (3min)','內廁 + floor-to-ceiling windows','$2,621-2,689/sf in-budget'],
   conf=44, src=['https://www.28hse.com/buy/office/property-3920203','https://www.28hse.com/buy/office/property-3803622'],
 ),
 '裕豐工業大廈': dict(
   street='柴灣角街35-45號, Tsuen Wan West', mgmt_fee=None, completion=None, age=None,
   mtr='Tsuen Wan West (柴灣角街) — ~5-10 min walk',
   dmc='Unknown — DMC not found online. Standard Tsuen Wan flatted factory.',
   revitalized=False,
   mgmt_company='Unknown — enquire via listing agent',
   op_hours='24hr access noted (verify)',
   permitted='Industrial. 1464sf with 1500呎大平台 + 自建閣樓 (double usable area via podium + mezzanine) — good for split kids/adult zones. Verify mezzanine is DMC/building-compliant.',
   route='Flat, near Chai Wan Kok Street industrial cluster; well-lit.',
   risks=['$4.3M above sweet spot','Mezzanine/podium may have compliance issues — verify','DMC unverified','No mgmt/completion data'],
   opps=['Double usable area (podium + mezzanine)','Schools within 410-500m','$2,937/sf reasonable'],
   schools=['410m to 寶安商會王少清中學','410m to 紡織學會美國商會胡漢輝中學','500m to 柴灣角天主教小學'],
   conf=40, src=['https://www.28hse.com/buy/office/property-4041662','https://www.oneday.com.hk/zh_HK/buildings/yue-fung-industrial-building/'],
 ),
 'One Midtown': dict(
   street='海盛路11號, Tsuen Wan West', mgmt_fee=3.0, completion='2012-06-22', age=14,
   mtr='Tsuen Wan West MTR ~5-8 min walk',
   dmc='Unknown — DMC not found online. Newer (2012) industrial-office building — higher build quality; still verify fitness/education use with management.',
   revitalized=False,
   mgmt_company='Unknown — premium building (fee ~HK$3.00/sf reflects this)',
   op_hours='Typical modern industrial-office hours (verify 24hr)',
   permitted='Industrial-office. 1962sf high-floor harbour-view unit. High mgmt fee but modern lifts/common areas. Verify ceiling.',
   route='Flat, modern riverside industrial-office cluster (海盛路); well-lit.',
   risks=['$7.82M — well above the $3-5M budget','High mgmt fee ($3.0/sf)','DMC unverified','Thin transaction history'],
   opps=['Newer (2012) building — better fire/structural compliance for a gym','Harbour view / premium address','Near 王少清中學 (360m)'],
   conf=46, src=['https://www.28hse.com/buy/office/property-4026728','https://www.oneday.com.hk/zh_HK/buildings/one-midtown/'],
 ),
 '國際企業中心一期': dict(
   street='柴灣角街11-15號, Tsuen Wan West', mgmt_fee=None, completion='2022-01-01', age=4,
   mtr='Tsuen Wan West MTR ~5-8 min walk',
   dmc='Best permitted-use profile in the set. New (2022) Grade-A office building; listings explicitly market 美容/補習/工作室/半零售/公司 use (beauty / tutoring / studio / semi-retail / office). Education/training-studio use is a marketed use — far lower use-restriction risk than flatted factories.',
   revitalized=False,  # not "revitalized" — it is a purpose-built 2022 office
   mgmt_company='Unknown — new Grade-A office; enquire via listing agent (利嘉閣). Fee likely ~HK$3-4/sf.',
   op_hours='24hr access + CCTV noted (verify)',
   permitted='Office/retail-grade (not flatted factory). 送廁所 (toilet included), 鋪契用途廣泛 (wide-use shop deed). Best ceiling/floor-loading/compliance profile; four 1057sf units listed ($3,992-4,257/sf).',
   route='Flat, modern riverside office cluster; well-lit; closest thing to a turnkey commercial gym space in the set.',
   risks=['Higher $/sf ($3,992-4,257)','Higher mgmt fee expected (Grade-A office)','New building — limited transaction comparables','Office deed may restrict heavy-bag impact/noise — confirm with management'],
   opps=['Explicitly marketed for education/tutoring/studio/semi-retail use','2022 building — modern fire/lift/flooring compliance','Four units = flexibility to pick layout/floor','Schools 310-410m (胡漢輝中學 310m, 李城璧中學 400m)'],
   conf=68, src=['https://www.28hse.com/buy/office/property-4030378','https://www.oneday.com.hk/zh_HK/buildings/international-enterprise-centre-i/'],
 ),
 '新科技廣場': dict(  # also used as fallback label for unidentified SPK office units
   street='San Po Kong / Wong Tai Sin (office; exact street unverified — likely 新科技廣場 New Tech Plaza)',
   mgmt_fee=None, completion=None, age=None,
   mtr='Near Diamond Hill / Kai Tak MTR (listing says 半分鐘地鐵站 = 30 sec)',
   dmc='Unknown — DMC not found online. Office-grade (寫字樓) unit, not flatted factory.',
   revitalized=False,
   mgmt_company='Unknown — enquire via listing agent (中原工商舖 / 世紀21)',
   op_hours='24hr access noted (verify)',
   permitted='Office (寫字樓) with 特高樓底 (high ceiling). Office use is generally more flexible for a training studio than industrial. BUT both units are 3-5x over budget.',
   route='Flat, near MTR; well-lit commercial area.',
   risks=['$9.99M / $10.68M — 3-5x over budget','Office deed noise/impact restrictions possible','Exact building unidentified from listing','Premium $/sf ($5,768-6,202)'],
   opps=['Office-grade use flexibility','High ceiling','30 sec from MTR'],
   conf=30, src=['https://www.28hse.com/buy/office/property-4009114','https://www.28hse.com/buy/office/property-4035513'],
 ),
}

# Map building -> zone (from golden-zone-units)
# Units whose listing had no building name (identified via _dd_base / cross-ref)
BUILDING_LABEL = {
    21: '華成工商中心',   # Kwun Tong owner-direct 1021sf
    27: '新科技廣場',     # San Po Kong office 1732sf (unconfirmed)
    28: '新科技廣場',     # San Po Kong office 1722sf (unconfirmed)
}

def build_report():
    out = []
    for i in SALE_IDX:
        u = units[i]
        bname = u.get('building') or BUILDING_LABEL.get(i) or 'Unidentified'
        zone = u.get('golden_zone') or u.get('address', '')
        z = ZONES.get(zone, {})
        r = RESEARCH.get(bname)

        # Enriched base row (building-level)
        base = BASE_BY_BUILDING.get(bname)

        sqft = u.get('sqft')
        price = u.get('price')
        psf = u.get('price_per_sqft')

        # management fee
        mgmt_fee = None
        if r and r.get('mgmt_fee') is not None:
            mgmt_fee = r['mgmt_fee']
        elif base and base.get('mgmt_fee_sqft') is not None:
            mgmt_fee = base['mgmt_fee_sqft']

        # completion
        completion = (r or {}).get('completion')
        if not completion and base:
            completion = base.get('completion_date')

        # schools
        schools = []
        if base and base.get('nearby_schools'):
            for s in base['nearby_schools']:
                schools.append(f"{s.get('walk_min','?')} min to {s.get('name','school')}")
        if not schools and r:
            schools = r.get('schools', [])

        # comparable sales from Land Registry data in _dd_base
        comps = []
        if base and base.get('comparable_sales'):
            for c in base['comparable_sales'][:4]:
                sq = c.get('sqft','')
                comps.append({
                    'unit': c.get('unit',''),
                    'date': c.get('date',''),
                    'price': c.get('price'),
                    'sqft': sq,
                    'psf': c.get('psf'),
                    'kind': c.get('kind',''),
                })

        trend = (r or {}).get('trend')
        if not trend and base:
            trend = base.get('price_trend')

        # build entry
        entry = {
            'building': bname,
            'address': r.get('street') if r else u.get('address'),
            'unit_size_sqft': sqft,
            'asking_price_hkd': price,
            'price_per_sqft': psf,
            'zone': zone,
            'listing_url': u.get('source_url'),
            'agent': u.get('agent'),
            'listing_notes': u.get('notes'),
            'completion_date': completion,
            'dmc_status': (r or {}).get('dmc', 'Unknown — DMC not found online'),
            'revitalized': (r or {}).get('revitalized', False),
            'building_management': (r or {}).get('mgmt_company', 'Unknown — enquire via listing agent'),
            'management_fee_sqft': mgmt_fee,
            'operating_hours': (r or {}).get('op_hours', 'Unknown — verify with management'),
            'permitted_use': (r or {}).get('permitted', 'Industrial — verify fitness/education use with Lands Department'),
            'walking_distances': {
                'mtr_to_building': (r or {}).get('mtr', 'Unverified'),
                'building_to_schools': schools,
            },
            'route_safety': (r or {}).get('route', 'Unverified — walk the route before signing'),
            'foot_traffic': z.get('foot_traffic', 'Unverified'),
            'competitors': z.get('competition', []),
            'competition_note': z.get('competition_note', ''),
            'school_dismissal_times': z.get('school_dismissal', 'Most schools dismiss 3:15-3:45pm'),
            'comparable_sales': comps,
            'current_rentals': (r or {}).get('rentals', 'Not available — check Centaline/Midland for live rental comparables'),
            'price_trend': trend or 'Insufficient data',
            'government_records': 'No outstanding Buildings Department orders identified in public-domain search (search backend limited this run). Rateable value not publicly posted. Land Registry comparables shown under comparable_sales.',
            'risk_flags': (r or {}).get('risks', []),
            'opportunity_flags': (r or {}).get('opps', []),
            'confidence': (r or {}).get('conf', 30),
            'sources': (r or {}).get('src', [u.get('source_url')]),
        }
        out.append(entry)
    return out

report = build_report()
outpath = os.path.join(BASE, 'due-diligence-report.json')
json.dump(report, open(outpath, 'w'), ensure_ascii=False, indent=2)
print('Wrote', outpath, 'with', len(report), 'entries')
# quick sanity
from collections import Counter
print('Buildings:', dict(Counter(e['building'] for e in report)))
