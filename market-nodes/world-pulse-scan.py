#!/usr/bin/env python3
"""World Pulse Scanner — pulls ~40 symbols across all major asset classes via yfinance.
Outputs world-pulse.json with current prices, changes, and narrative signals.
No paid APIs. No AI scoring. Just numbers."""

import json
import os
import sys
from datetime import datetime, timedelta

try:
    import yfinance as yf
except ImportError:
    print("pip3 install yfinance")
    sys.exit(1)

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_FILE = os.path.join(OUT_DIR, "world-pulse.json")
HISTORY_DIR = os.path.join(OUT_DIR, "pulse-history")
os.makedirs(HISTORY_DIR, exist_ok=True)

SYMBOLS = {
    "indices": {
        "S&P 500":    {"symbol": "^GSPC",  "icon": "🇺🇸"},
        "NASDAQ":     {"symbol": "^IXIC",  "icon": "🇺🇸"},
        "Hang Seng":  {"symbol": "^HSI",   "icon": "🇭🇰"},
        "FTSE 100":   {"symbol": "^FTSE",  "icon": "🇬🇧"},
        "Nikkei 225": {"symbol": "^N225",  "icon": "🇯🇵"},
        "DAX":        {"symbol": "^GDAXI", "icon": "🇩🇪"},
        "ASX 200":    {"symbol": "^AXJO",  "icon": "🇦🇺"},
    },
    "precious_metals": {
        "Gold":     {"symbol": "GC=F",  "icon": "🥇", "unit": "$/oz"},
        "Silver":   {"symbol": "SI=F",  "icon": "🥈", "unit": "$/oz"},
        "Platinum": {"symbol": "PL=F",  "icon": "⚪", "unit": "$/oz"},
        "Palladium":{"symbol": "PA=F",  "icon": "⬜", "unit": "$/oz"},
    },
    "energy": {
        "Crude Oil (WTI)": {"symbol": "CL=F",  "icon": "🛢️", "unit": "$/bbl"},
        "Natural Gas":     {"symbol": "NG=F",  "icon": "🔥", "unit": "$/mmBtu"},
        "Uranium (URA ETF)":{"symbol": "URA",  "icon": "☢️", "unit": "$"},
    },
    "industrial_metals": {
        "Copper":  {"symbol": "HG=F",  "icon": "🔧", "unit": "$/lb"},
    },
    "agriculture": {
        "Coffee":  {"symbol": "KC=F",  "icon": "☕", "unit": "c/lb"},
        "Cocoa":   {"symbol": "CC=F",  "icon": "🍫", "unit": "$/ton"},
        "Wheat":   {"symbol": "ZW=F",  "icon": "🌾", "unit": "c/bu"},
        "Corn":    {"symbol": "ZC=F",  "icon": "🌽", "unit": "c/bu"},
        "Sugar":   {"symbol": "SB=F",  "icon": "🍬", "unit": "c/lb"},
        "Cotton":  {"symbol": "CT=F",  "icon": "🧶", "unit": "c/lb"},
    },
    "crypto": {
        "Bitcoin":  {"symbol": "BTC-USD", "icon": "₿"},
        "Ethereum": {"symbol": "ETH-USD", "icon": "Ξ"},
        "Solana":   {"symbol": "SOL-USD", "icon": "◎"},
    },
    "forex": {
        "USD/HKD": {"symbol": "HKD=X", "icon": "🇭🇰"},
        "EUR/USD": {"symbol": "EURUSD=X", "icon": "🇪🇺"},
        "GBP/USD": {"symbol": "GBPUSD=X", "icon": "🇬🇧"},
        "USD/JPY": {"symbol": "JPY=X", "icon": "🇯🇵"},
        "USD/THB": {"symbol": "THB=X", "icon": "🇹🇭"},
    },
    "reits_property": {
        "Link REIT (HK)":    {"symbol": "0823.HK", "icon": "🏢"},
        "VNQ (US REIT ETF)": {"symbol": "VNQ",     "icon": "🏠"},
    },
    "alternatives": {
        "BITW (Crypto Index)": {"symbol": "BITW", "icon": "📊"},
    },
}

def fetch_all():
    all_syms = []
    sym_map = {}
    for cat, items in SYMBOLS.items():
        for name, info in items.items():
            all_syms.append(info["symbol"])
            sym_map[info["symbol"]] = {"name": name, "category": cat, **info}

    tickers = yf.Tickers(" ".join(all_syms))

    results = {"scan_date": datetime.now().strftime("%Y-%m-%d %H:%M"), "categories": {}}
    movers_up = []
    movers_down = []

    for sym, meta in sym_map.items():
        cat = meta["category"]
        if cat not in results["categories"]:
            results["categories"][cat] = []

        try:
            ticker = tickers.tickers.get(sym) or tickers.tickers.get(sym.replace("=", ""))
            if not ticker:
                ticker = yf.Ticker(sym)

            hist_1m = ticker.history(period="1mo")
            hist_3m = ticker.history(period="3mo")

            if hist_1m.empty:
                continue

            price = float(hist_1m["Close"].iloc[-1])
            price_1m_ago = float(hist_1m["Close"].iloc[0]) if len(hist_1m) > 1 else price
            price_3m_ago = float(hist_3m["Close"].iloc[0]) if not hist_3m.empty and len(hist_3m) > 1 else price

            chg_1m = round(((price - price_1m_ago) / price_1m_ago) * 100, 2) if price_1m_ago else 0
            chg_3m = round(((price - price_3m_ago) / price_3m_ago) * 100, 2) if price_3m_ago else 0

            entry = {
                "name": meta["name"],
                "icon": meta["icon"],
                "symbol": sym,
                "price": round(price, 2),
                "unit": meta.get("unit", "$"),
                "change_1m_pct": chg_1m,
                "change_3m_pct": chg_3m,
                "high_1m": round(float(hist_1m["Close"].max()), 2),
                "low_1m": round(float(hist_1m["Close"].min()), 2),
            }
            results["categories"][cat].append(entry)

            if abs(chg_1m) >= 5:
                target = movers_up if chg_1m > 0 else movers_down
                target.append({"name": meta["name"], "icon": meta["icon"], "change": chg_1m, "category": cat})

        except Exception as e:
            print(f"  skip {sym}: {e}", file=sys.stderr)

    movers_up.sort(key=lambda x: x["change"], reverse=True)
    movers_down.sort(key=lambda x: x["change"])
    results["biggest_movers_up"] = movers_up[:5]
    results["biggest_movers_down"] = movers_down[:5]
    results["total_symbols"] = sum(len(v) for v in results["categories"].values())

    return results


if __name__ == "__main__":
    print("World Pulse scanning...")
    data = fetch_all()
    with open(OUT_FILE, "w") as f:
        json.dump(data, f, indent=2)

    today = datetime.now().strftime("%Y-%m-%d")
    hist_file = os.path.join(HISTORY_DIR, f"pulse-{today}.json")
    with open(hist_file, "w") as f:
        json.dump(data, f, indent=2)

    print(f"Done. {data['total_symbols']} symbols. Saved to {OUT_FILE}")
    up = data.get("biggest_movers_up", [])
    down = data.get("biggest_movers_down", [])
    if up:
        print("Biggest movers UP:", ", ".join(f"{m['icon']} {m['name']} +{m['change']}%" for m in up))
    if down:
        print("Biggest movers DOWN:", ", ".join(f"{m['icon']} {m['name']} {m['change']}%" for m in down))
