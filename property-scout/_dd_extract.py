#!/usr/bin/env python3
"""Refined 28Hse extractor — strips HTML tags before regexing."""
import json, re, ssl, time, sys, urllib.request

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'}

UNITS = [
    ("3951070", "油塘工業城", 1268, 2980000), ("4015991", "豐利中心", 1332, 5000000),
    ("4013284", "豐利中心", 1332, 5000000), ("3995647", "冠華鏡廠第六工業大廈", 1250, 1980000),
    ("2936196", "同德工業大廈", 1009, 2000000), ("4015862", "好景工業大廈", 952, 2000000),
    ("4016533", "建榮工業大廈", 1042, 2500000), ("3990120", "鳴發工業中心", 926, 2300000),
    ("4012067", "鳴發工業中心", 926, 2300000), ("3970610", "富德工業大廈", 1530, 5560000),
    ("3941710", "富德工業大廈", 1520, 5800000), ("3835902", "新寶中心", 1267, 5080000),
    ("3933371", "佳力工業大廈", 1128, 4800000), ("3998748", "榮豐工業大廈", 1640, 2950000),
    ("4016049", "匯力工業中心", 1206, 2630000), ("3980951", "匯力工業中心", 1165, 3050000),
    ("3817698", "One Midtown", 851, 2850000), ("3998114", "國際企業中心一期", 1057, 3990000),
    ("3985585", "國際企業中心一期", 848, 3480000), ("3976948", "生利工業中心", 1979, 6000000),
    ("3969127", "油塘工業城", 1405, 5800000), ("3402100", "華成工商中心", 1021, 3680000),
    ("3650723", "建發工業中心", 1949, 3700000), ("3239042", "泰力工業中心", 1606, 6200000),
    ("3820689", "佳力工業大廈", 1103, 4330000), ("945477", "富德工業大廈", 900, 3580000),
    ("3977137", "泰力工業中心", 1606, 6400000), ("3977130", "富德工業大廈", 900, 3738000),
    ("4009114", "UNKNOWN-SPK", 1732, 10280000), ("3920203", "豪力中心", 885, 2320000),
    ("4011397", "國際企業中心一期", 1057, 4220000), ("3969144", "南豐中心", 1957, 13000000),
]

def clean(html):
    t = re.sub(r'<script.*?</script>', ' ', html, flags=re.S)
    t = re.sub(r'<style.*?</style>', ' ', t, flags=re.S)
    t = re.sub(r'<[^>]+>', ' ', t)
    t = t.replace('&nbsp;', ' ').replace('&amp;', '&')
    return re.sub(r'\s+', ' ', t)

def fetch(pid):
    url = f"https://www.28hse.com/buy/office/property-{pid}"
    req = urllib.request.Request(url, headers=UA)
    return urllib.request.urlopen(req, timeout=25, context=ctx).read().decode('utf-8', 'ignore')

def extract(pid):
    html = fetch(pid)
    t = clean(html)
    out = {}
    m = re.search(r'<title>([^<]+)</title>', html)
    out['title'] = re.sub(r'\s+', ' ', m.group(1)).strip() if m else None
    m = re.search(r'樓齡:\s*(\d+)\s*年', t); out['age_years'] = int(m.group(1)) if m else None
    m = re.search(r'入伙日期\s*([\d\-]+)', t); out['completion_date'] = m.group(1) if m else None
    m = re.search(r'物業管理費用\s*@?\s*([\d.]+)', t); out['mgmt_fee_sqft'] = float(m.group(1)) if m else None
    m = re.search(r'物業地址\s+(.*?)\s+交通\s', t); out['address'] = m.group(1).strip() if m else None
    m = re.search(r'建築面積\s*([\d,]+)\s*平方呎', t); out['gfa'] = m.group(1) if m else None
    m = re.search(r'呎價:\s*@?\s*([\d,]+)\s*元', t); out['psf_raw'] = m.group(1) if m else None
    m = re.search(r'售價\s+售\s*\$?\s*([\d,]+)\s*萬', t); out['price_wan'] = m.group(1) if m else None
    # schools
    schools = []
    for m in re.finditer(r'([\u4e00-\u9fff]{2,20}(?:學校|中學|小學|幼稚園|書院|學園))\s*(\d+)\s*分鐘', t):
        nm = m.group(1).strip()
        if nm and not any(s['name'] == nm for s in schools):
            schools.append({'name': nm, 'walk_min': int(m.group(2))})
    out['nearby_schools'] = schools[:10]
    # transactions
    tx = []
    for m in re.finditer(r'([\u4e00-\u9fffA-Za-z0-9 座室樓高中低地下\-\/]{3,60}?)\s+(\d{4}-\d{2}-\d{2})\s+(註冊處成交|市場成交)\s*(建?[\d,\.]+呎)?\s*\$?\s*([\d,\.]+)\s*萬?元?\s*@\s*\$?\s*([\d,]+)?', t):
        tx.append({'unit': m.group(1).strip(), 'date': m.group(2), 'kind': m.group(3),
                   'gfa': m.group(4), 'price_wan': m.group(5), 'psf': m.group(6)})
    out['transactions'] = tx[:12]
    return out

results = {}
for pid, b, sqft, price in UNITS:
    try:
        d = extract(pid)
        d['_pid'] = pid; d['_building'] = b; d['_sqft'] = sqft; d['_ask_price'] = price
        results[pid] = d
        print(f"OK {pid} {b} age={d.get('age_years')} comp={d.get('completion_date')} mgmt={d.get('mgmt_fee_sqft')} addr={d.get('address')} gfa={d.get('gfa')} schools={len(d.get('nearby_schools',[]))} tx={len(d.get('transactions',[]))}", file=sys.stderr)
    except Exception as e:
        results[pid] = {'_pid': pid, '_building': b, '_sqft': sqft, '_ask_price': price, 'error': f'{type(e).__name__}: {e}'}
        print(f"ERR {pid} {b} {type(e).__name__} {e}", file=sys.stderr)
    time.sleep(0.35)

json.dump(results, open('_dd_extract.json', 'w'), ensure_ascii=False, indent=1)
print('WROTE', len(results), 'records')
