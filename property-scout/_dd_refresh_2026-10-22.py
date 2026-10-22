#!/usr/bin/env python3
# Refresh due-diligence-report.json with fresh oneday.com.hk building-page data (2026-10-22).
# Appends/updates fields; preserves all existing entries and fields.
import json, os

BASE = os.path.dirname(os.path.abspath(__file__))
REPORT = os.path.join(BASE, "due-diligence-report.json")

FRESH = {
    "京貿中心": {
        "address": "駿業街62號, Kwun Tong",
        "mtr": "~400m from Kwun Tong MTR (oneday-measured 0.4km)",
        "schools": ["聖若翰天主教小學 (440m)", "中華基督教會基法小學 (440m)", "地利亞修女紀念學校 (480m)"],
        "tx": [
            {"unit": "23/B", "date": "2023-03-16", "price": 8100000, "sqft": "984", "psf": 8232},
            {"unit": "8/D", "date": "2023-03-10", "price": 4300000, "sqft": "495", "psf": 8687},
            {"unit": "15/E", "date": "2022-08-19", "price": 7322000, "sqft": "721", "psf": 10155},
            {"unit": "13/E", "date": "2021-03-25", "price": 7080000, "sqft": "723", "psf": 9793},
            {"unit": "2/D", "date": "2020-07-07", "price": 4570000, "sqft": "495", "psf": 9232},
        ],
        "rentals": None,
        "source": "https://www.oneday.com.hk/zh_HK/buildings/capital-trade-centre/",
    },
    "鳴發工業中心": {
        "address": "建發街1號, Tuen Mun",
        "mtr": "~600m from Tuen Mun MTR; LRT 石排/山景 ~100-200m (oneday-measured)",
        "schools": ["道教青松小學 (220m)", "仁愛堂田家炳中學 (370m)", "樂善堂梁黃蕙芳紀念學校 (440m)", "恩平工商會李琳明中學 (480m)", "浸信會永隆中學 (490m)"],
        "tx": [],
        "rentals": None,
        "source": "https://www.oneday.com.hk/zh_HK/buildings/ming-fat-industrial-building/",
    },
    "豪力中心": {
        "address": "沙咀道66A號, Tsuen Wan",
        "mtr": "~500-800m from Tsuen Wan West MTR (oneday-measured 0.5-0.8km)",
        "schools": ["寶安商會王少清中學 (200m)", "荃灣官立中學 (410m)"],
        "tx": [
            {"unit": "21/6", "date": "2024-12-18", "price": 2260000, "sqft": "501", "psf": 4511},
            {"unit": "9/4", "date": "2024-12-12", "price": 2500000, "sqft": "557", "psf": 4488},
            {"unit": "21/3,4", "date": "2024-10-08", "price": 4110000, "sqft": None, "psf": None},
            {"unit": "16/2,3", "date": "2024-07-05", "price": 4550000, "sqft": "1109", "psf": 4103},
            {"unit": "17/2", "date": "2024-05-20", "price": 3000000, "sqft": "642", "psf": 4673},
            {"unit": "9/3", "date": "2023-11-16", "price": 2988000, "sqft": "467", "psf": 6398},
            {"unit": "12/4", "date": "2023-04-06", "price": 3100000, "sqft": "557", "psf": 5566},
            {"unit": "10/4", "date": "2023-03-08", "price": 3500000, "sqft": "557", "psf": 6284},
        ],
        "rentals": None,
        "source": "https://www.oneday.com.hk/zh_HK/buildings/ho-lik-centre/",
    },
    "國際企業中心一期": {
        "address": "柴灣角街11號, Tsuen Wan",
        "mtr": "~800m from Tsuen Wan West MTR (oneday-measured 0.8km)",
        "schools": ["紡織學會美國商會胡漢輝中學 (310m)", "保良局李城璧中學 (400m)", "柴灣角天主教小學 (410m)"],
        "tx": [
            {"unit": "15/4", "date": "2025-04-25", "price": 7443000, "sqft": None, "psf": None},
            {"unit": "10/2", "date": "2025-04-17", "price": 5883000, "sqft": None, "psf": None},
            {"unit": "10/6", "date": "2025-04-17", "price": 5850000, "sqft": None, "psf": None},
            {"unit": "21/2", "date": "2025-04-15", "price": 7196000, "sqft": None, "psf": None},
            {"unit": "7/2", "date": "2025-04-15", "price": 5883000, "sqft": None, "psf": None},
            {"unit": "10/5", "date": "2025-04-14", "price": 9393000, "sqft": None, "psf": None},
            {"unit": "5/4", "date": "2025-04-14", "price": 5512000, "sqft": None, "psf": None},
            {"unit": "3/2", "date": "2025-04-10", "price": 6344000, "sqft": None, "psf": None},
        ],
        "rentals": None,
        "source": "https://www.oneday.com.hk/zh_HK/buildings/international-enterprise-centre-i/",
    },
    "南豐工業城": {
        "address": "天后路18號, Tuen Mun",
        "mtr": "~800m from Tuen Mun MTR; LRT ~700m (oneday-measured)",
        "schools": ["仁濟醫院第二中學 (200m)", "裘錦秋中學 (240m)", "中華基督教會何福堂小學 (340m)", "伊斯蘭學校 (450m)"],
        "tx": [],
        "rentals": "Fresh oneday rent records: 1,252sf $9,000/mo (2023-05), 1,838sf $11,000/mo (2023-03), 1,238sf $8,600/mo (2024-11), 1,069sf $10,000/mo (2023-08), 2,439sf $11,000/mo (2021-04) — i.e. ~$7-8/sf net.",
        "source": "https://www.oneday.com.hk/zh_HK/buildings/nan-fung-industrial-city/",
    },
    "新科技廣場": {
        "address": "大有街34號, San Po Kong",
        "mtr": "~600m from Diamond Hill MTR (oneday-measured 0.6km)",
        "schools": ["保良局陳南昌夫人小學 (170m)", "聖公會基德小學 (280m)", "孔教學院大成小學 (340m)", "嘉諾撒小學 (420m)", "天主教伍華小學 (450m)"],
        "tx": [
            {"unit": "23/3", "date": "2023-06-26", "price": 4280000, "sqft": "542", "psf": 7897},
            {"unit": "29/5-8", "date": "2023-05-22", "price": 18920000, "sqft": "2456", "psf": 7704},
            {"unit": "7/11", "date": "2023-03-10", "price": 4600000, "sqft": "546", "psf": 8425},
            {"unit": "22/13", "date": "2023-01-09", "price": 6236000, "sqft": "709", "psf": 8795},
        ],
        "rentals": None,
        "source": "https://www.oneday.com.hk/zh_HK/buildings/new-tech-plaza/",
    },
    "One Midtown": {
        "address": "海盛路11號, Tsuen Wan",
        "mtr": "~500m from Tsuen Wan West MTR (oneday-measured 0.5km)",
        "schools": ["寶安商會王少清中學 (360m)"],
        "tx": [
            {"unit": "25/6", "date": "2025-04-25", "price": 4000000, "sqft": "779", "psf": 5135},
            {"unit": "18/5,6", "date": "2025-03-05", "price": 10880000, "sqft": "1322", "psf": 8230},
            {"unit": "16/13", "date": "2025-02-26", "price": 3100000, "sqft": "748", "psf": 4144},
            {"unit": "16/11", "date": "2025-02-26", "price": 4270000, "sqft": "817", "psf": 5226},
            {"unit": "16/12", "date": "2025-02-26", "price": 4630000, "sqft": "751", "psf": 6165},
        ],
        "rentals": None,
        "source": "https://www.oneday.com.hk/zh_HK/buildings/one-midtown/",
    },
    "德豐工業中心": {
        "address": "德士古道168號, Tsuen Wan",
        "mtr": "~1.0km from Tai Wo Hau MTR (oneday-measured 1.0km)",
        "schools": ["聖公會主恩小學 (410m)", "柏立基教育學院校友會李一諤紀念學校 (470m)"],
        "tx": [
            {"unit": "4/9", "date": "2025-04-25", "price": 2100000, "sqft": "655", "psf": 3206},
            {"unit": "25/8", "date": "2025-04-09", "price": 3000000, "sqft": "654", "psf": 4587},
            {"unit": "4/2", "date": "2025-03-10", "price": 2500000, "sqft": "401", "psf": 6234},
            {"unit": "20/1", "date": "2025-02-13", "price": 2000000, "sqft": "535", "psf": 3738},
            {"unit": "26/1", "date": "2025-02-04", "price": 2380000, "sqft": "535", "psf": 4449},
            {"unit": "17/13", "date": "2025-01-28", "price": 2000000, "sqft": "693", "psf": 2886},
            {"unit": "23/2", "date": "2025-01-14", "price": 2270000, "sqft": "520", "psf": 4365},
        ],
        "rentals": None,
        "source": "https://www.oneday.com.hk/zh_HK/buildings/tak-fung-industrial-centre/",
    },
    "華成工商中心": {
        "address": "成業街11號, Kwun Tong",
        "mtr": "~100m from Kwun Tong MTR (oneday-measured 0.1km — closest MTR in set)",
        "schools": ["中華基督教會基法小學 (200m)", "地利亞修女紀念學校 (390m)", "官塘雅麗斯英文幼稚園 (390m)", "天主教佑華小學 (470m)"],
        "tx": [
            {"unit": "12/3", "date": "2023-08-14", "price": 8200000, "sqft": "1136", "psf": 7218},
            {"unit": "9/5", "date": "2022-12-01", "price": 7400000, "sqft": "938", "psf": 7889},
            {"unit": "4/6", "date": "2021-12-21", "price": 7300000, "sqft": "849", "psf": 8598},
            {"unit": "6/1", "date": "2021-11-23", "price": 12500000, "sqft": "1631", "psf": 7664},
            {"unit": "10/6", "date": "2021-11-19", "price": 7200000, "sqft": "849", "psf": 8481},
        ],
        "rentals": None,
        "source": "https://www.oneday.com.hk/zh_HK/buildings/wah-shing-centre/",
    },
    "裕豐工業大廈": {
        "address": "沙咀道26-38號, Tsuen Wan",
        "mtr": "~700m from Tsuen Wan West MTR (oneday-measured 0.7km)",
        "schools": ["寶安商會王少清中學 (410m)", "紡織學會美國商會胡漢輝中學 (410m)", "柴灣角天主教小學 (500m)"],
        "tx": [
            {"unit": "3/H", "date": "2016-06-02", "price": 4000000, "sqft": "566", "psf": 7067},
        ],
        "rentals": None,
        "source": "https://www.oneday.com.hk/zh_HK/buildings/yue-fung-industrial-building/",
    },
    "建發工業中心": {
        "address": "建發街13號, Tuen Mun",
        "mtr": "~700m from Tuen Mun MTR; LRT 山景 ~100m, 石排 ~200m (oneday-measured)",
        "schools": ["恩平工商會李琳明中學 (180m)", "道教青松小學 (220m)", "明愛屯門馬登基金中學 (270m)", "仁愛堂陳黃淑芳紀念中學 (330m)", "浸信會永隆中學 (360m)", "崇真書院 (460m)", "佛教沈香林紀念中學 (470m)", "宣道中學 (480m)", "台山商會學校 (490m)"],
        "tx": [
            {"unit": "13/1", "date": "2024-11-08", "price": 1500000, "sqft": None, "psf": None},
            {"unit": "5/1", "date": "2024-02-08", "price": 2900000, "sqft": None, "psf": None},
            {"unit": "12/1", "date": "2023-11-20", "price": 2900000, "sqft": "709", "psf": 4090},
            {"unit": "10/7", "date": "2023-10-10", "price": 3470000, "sqft": "886", "psf": 3916},
            {"unit": "14/9", "date": "2023-07-24", "price": 8800000, "sqft": "1816", "psf": 4846},
        ],
        "rentals": "Current listings (oneday 2026-08): sale 887sf $2.30M (開揚L窗+內厠, 連租約); rent 909sf $11,000/mo (有冷氣, 即租即用); 100sf $2,500/mo.",
        "source": "https://www.oneday.com.hk/zh_HK/buildings/kin-fat-industrial-centre/",
    },
}


def main():
    with open(REPORT, encoding="utf-8") as f:
        rep = json.load(f)

    updated = 0
    for e in rep:
        b = e.get("building")
        if b not in FRESH:
            continue
        d = FRESH[b]
        if d.get("address"):
            e["address"] = d["address"]
        wd = e.setdefault("walking_distances", {})
        if d.get("mtr"):
            wd["mtr_to_building"] = d["mtr"]
        if d.get("schools"):
            wd["building_to_schools"] = d["schools"]
        if d.get("tx"):
            existing = e.get("comparable_sales", [])
            for t in d["tx"]:
                entry = {"unit": t["unit"], "date": t["date"], "price": t["price"], "kind": "oneday成交紀錄"}
                if t.get("sqft"):
                    entry["sqft"] = "建" + t["sqft"] + "呎"
                if t.get("psf"):
                    entry["psf"] = t["psf"]
                existing.insert(0, entry)
            e["comparable_sales"] = existing
        if d.get("rentals"):
            e["current_rentals"] = d["rentals"]
        src = e.setdefault("sources", [])
        if d.get("source") and d["source"] not in src:
            src.append(d["source"])
        # confidence bump (capped)
        old = e.get("confidence", 50)
        e["confidence"] = max(old, min(old + 5, 80))
        e["last_verified"] = "2026-10-22 (oneday.com.hk building-page refresh)"
        updated += 1

    with open(REPORT, "w", encoding="utf-8") as f:
        json.dump(rep, f, ensure_ascii=False, indent=2)

    print(f"Updated {updated} entries in {os.path.basename(REPORT)}")


if __name__ == "__main__":
    main()
