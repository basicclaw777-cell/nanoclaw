#!/usr/bin/env python3
"""
Cathedral Trading Strategies — 9 unconventional signal generators
Phase 0: paper trading. All run in parallel. Data decides which survive.

Strategies 1-2 (sentiment_contrarian, momentum) live in crypto-signals.py.
This file adds strategies 3-11:

3. dca_baseline        — Weekly BTC buy. The boring benchmark everything must beat.
4. gann_geometry       — W.D. Gann's Square of Nine, geometric price levels
5. lunar_cycles        — Moon phases, Mercury retrograde, astronomical timing
6. fibonacci_time      — Phi ratios in both price AND time
7. historical_cycles   — BTC halving cycle, Kondratiev wave, Benner's Cycle
8. vortex_flow         — Toroidal compression/expansion phase detection
9. suppression_signal  — Coordinated FUD detection as contrarian buy
10. polymarket_delta   — Prediction market divergence from crypto prices
11. cymatics_schumann  — Schumann resonance harmonics + cymatic standing wave detection

Each function returns a list of signal dicts:
  { source, asset, direction, strength, reasoning, type }
"""

import json
import math
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

OUTPUT_DIR = Path.home() / "nanoclaw" / "trader" / "signals"

COIN_IDS = {
    "BTC": "bitcoin", "ETH": "ethereum", "SOL": "solana",
    "AVAX": "avalanche-2", "LINK": "chainlink", "DOT": "polkadot",
    "ARB": "arbitrum", "DOGE": "dogecoin", "ADA": "cardano",
    "ATOM": "cosmos", "UNI": "uniswap",
}

COINGECKO_BASE = "https://api.coingecko.com/api/v3"


# ── Shared Data Fetching ─────────────────────────────────────────────────────

def fetch_price_history(coin_id, days=30):
    """Fetch daily OHLC from CoinGecko (free, no key)."""
    url = f"{COINGECKO_BASE}/coins/{coin_id}/market_chart?vs_currency=usd&days={days}&interval=daily"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "CathedralTrader/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
        prices = [p[1] for p in data.get("prices", [])]
        return prices
    except Exception as e:
        print(f"  History fetch failed for {coin_id}: {e}")
        return []


def fetch_all_history(symbols=None, days=30):
    """Fetch price history for watchlist. Returns {symbol: [prices]}."""
    symbols = symbols or ["BTC", "ETH", "SOL"]
    history = {}
    for sym in symbols:
        if sym in COIN_IDS:
            h = fetch_price_history(COIN_IDS[sym], days)
            if h:
                history[sym] = h
    return history


# ── Strategy 3: DCA Baseline ─────────────────────────────────────────────────

def dca_baseline(prices, now=None):
    """Weekly BTC buy. The benchmark. If your fancy strategy can't beat this, it's noise."""
    now = now or datetime.utcnow()
    signals = []

    # Buy every Monday (weekday 0)
    if now.weekday() == 0:
        signals.append({
            "source": "dca_baseline",
            "asset": "BTC",
            "direction": "long",
            "strength": 0.6,
            "reasoning": f"DCA Baseline: Weekly BTC buy (Monday). No timing, no emotion, just accumulation.",
            "type": "dca_baseline",
        })

    return signals


# ── Strategy 4: Gann Geometry ─────────────────────────────────────────────────

def gann_square_of_nine(price):
    """Calculate Gann Square of Nine levels around a price.

    The Square of Nine spirals outward from 1. Cardinal cross points
    (N/S/E/W at 90-degree intervals) are major support/resistance.
    """
    root = math.sqrt(price)
    levels = []

    for offset in [-1.0, -0.75, -0.5, -0.25, 0.25, 0.5, 0.75, 1.0]:
        level = (root + offset) ** 2
        if level > 0:
            distance_pct = (level - price) / price
            levels.append({
                "level": round(level, 2),
                "distance_pct": round(distance_pct * 100, 2),
                "cardinal": offset in [-1.0, -0.5, 0.5, 1.0],  # Cardinal cross
            })

    return levels


def gann_geometry(prices, history):
    """W.D. Gann — geometric price levels from the Square of Nine."""
    signals = []

    for sym, price_data in prices.items():
        price = price_data.get("price")
        if not price:
            continue

        levels = gann_square_of_nine(price)

        # Find nearest Gann level
        nearest = min(levels, key=lambda l: abs(l["distance_pct"]))

        # Signal when price is within 1.5% of a Gann level
        if abs(nearest["distance_pct"]) < 1.5:
            is_cardinal = nearest["cardinal"]
            level_type = "cardinal cross" if is_cardinal else "ordinal"
            direction = "long" if nearest["distance_pct"] > 0 else "short"
            strength = 0.7 if is_cardinal else 0.55

            # If approaching from below (price < level), expect bounce up
            if price < nearest["level"]:
                direction = "long"
                reasoning = f"{sym} approaching Gann {level_type} level ${nearest['level']:.0f} from below ({nearest['distance_pct']:.1f}% away) — geometric support"
            else:
                direction = "short"
                reasoning = f"{sym} approaching Gann {level_type} level ${nearest['level']:.0f} from above ({nearest['distance_pct']:.1f}% away) — geometric resistance"

            signals.append({
                "source": "gann_geometry",
                "asset": sym,
                "direction": direction,
                "strength": strength,
                "reasoning": reasoning,
                "type": "gann_geometry",
            })

    return signals


# ── Strategy 5: Lunar & Planetary Cycles ──────────────────────────────────────

def moon_phase(dt=None):
    """Calculate moon phase (0-29.53 days). 0/29.53 = new moon, ~14.76 = full moon.

    Algorithm: compute days since a known new moon and mod by synodic period.
    Known new moon: 2024-01-11 11:57 UTC
    """
    dt = dt or datetime.utcnow()
    known_new_moon = datetime(2024, 1, 11, 11, 57)
    synodic_period = 29.53059
    days_since = (dt - known_new_moon).total_seconds() / 86400
    phase_day = days_since % synodic_period
    return phase_day


# Mercury retrograde periods 2026 (approximate)
MERCURY_RETROGRADES_2026 = [
    (datetime(2026, 1, 26), datetime(2026, 2, 16)),
    (datetime(2026, 5, 20), datetime(2026, 6, 12)),
    (datetime(2026, 9, 13), datetime(2026, 10, 5)),
]


def lunar_cycles(prices, now=None):
    """Moon phases and Mercury retrograde as market timing signals."""
    now = now or datetime.utcnow()
    signals = []
    phase = moon_phase(now)

    # New moon zone (day 0-3 or 27-29.53): historically bullish
    # Dichev & Janes (2003, Journal of Finance): 15 days around new moon outperform
    if phase < 3 or phase > 26.5:
        days_from_new = min(phase, 29.53 - phase)
        strength = max(0.5, 0.8 - days_from_new * 0.1)
        for sym in ["BTC", "ETH", "SOL"]:
            if sym in prices and prices[sym].get("price"):
                signals.append({
                    "source": "lunar_cycles",
                    "asset": sym,
                    "direction": "long",
                    "strength": round(strength, 2),
                    "reasoning": f"New moon zone (phase day {phase:.1f}/29.5) — historically bullish window. Dichev & Janes (2003).",
                    "type": "lunar_cycles",
                })

    # Full moon zone (day 13-17): historically weaker returns
    elif 13 < phase < 17:
        days_from_full = abs(phase - 14.76)
        strength = max(0.5, 0.75 - days_from_full * 0.1)
        for sym in ["BTC", "ETH", "SOL"]:
            if sym in prices and prices[sym].get("price"):
                signals.append({
                    "source": "lunar_cycles",
                    "asset": sym,
                    "direction": "short",
                    "strength": round(strength, 2),
                    "reasoning": f"Full moon zone (phase day {phase:.1f}/29.5) — historically weaker returns. Caution.",
                    "type": "lunar_cycles",
                })

    # Mercury retrograde: volatility increases, trend reversals more likely
    in_retrograde = any(start <= now <= end for start, end in MERCURY_RETROGRADES_2026)
    if in_retrograde:
        # Don't directionally trade — signal is about reversal probability
        # If market has been trending up, lean short. If down, lean long.
        for sym in ["BTC", "ETH"]:
            pd = prices.get(sym, {})
            change = pd.get("change_24h", 0)
            if change and abs(change) > 1:
                direction = "short" if change > 0 else "long"
                signals.append({
                    "source": "lunar_cycles",
                    "asset": sym,
                    "direction": direction,
                    "strength": 0.55,
                    "reasoning": f"Mercury retrograde active — trend reversals more likely. {sym} was {'up' if change > 0 else 'down'} {abs(change):.1f}%, fading.",
                    "type": "lunar_cycles",
                })

    return signals


# ── Strategy 6: Fibonacci Time + Price ────────────────────────────────────────

FIB_LEVELS = [0.236, 0.382, 0.5, 0.618, 0.786]
PHI = 1.618033988749


def fibonacci_time_price(prices, history):
    """Fibonacci retracements in price AND time. Does phi appear in markets like it does in nature?"""
    signals = []

    for sym, price_list in history.items():
        if len(price_list) < 10:
            continue

        current_price = prices.get(sym, {}).get("price")
        if not current_price:
            continue

        # Find 30-day high and low
        high = max(price_list)
        low = min(price_list)
        high_idx = price_list.index(high)
        low_idx = price_list.index(low)
        rng = high - low

        if rng < high * 0.02:  # Less than 2% range — no meaningful levels
            continue

        # Determine trend: if low came before high, uptrend (look for retracement buys)
        uptrend = low_idx < high_idx

        # Calculate Fib levels
        for fib in FIB_LEVELS:
            if uptrend:
                level = high - rng * fib
            else:
                level = low + rng * fib

            distance_pct = (current_price - level) / level * 100

            # Signal when price is within 1.5% of a Fib level
            if abs(distance_pct) < 1.5:
                if uptrend:
                    direction = "long"
                    reasoning = f"{sym} at {fib:.3f} Fib retracement (${level:.0f}) in uptrend — golden ratio bounce zone"
                else:
                    direction = "short"
                    reasoning = f"{sym} at {fib:.3f} Fib retracement (${level:.0f}) in downtrend — golden ratio resistance"

                strength = 0.75 if fib == 0.618 else 0.65 if fib == 0.382 else 0.55
                signals.append({
                    "source": "fibonacci_time",
                    "asset": sym,
                    "direction": direction,
                    "strength": strength,
                    "reasoning": reasoning,
                    "type": "fibonacci_time",
                })
                break  # One Fib signal per asset

        # Fibonacci TIME zones: days since swing * phi ratios
        swing_days = abs(high_idx - low_idx)
        if swing_days > 3:
            current_day = len(price_list) - 1
            days_since_swing = current_day - max(high_idx, low_idx)

            for mult in [1.0, PHI, PHI * PHI]:
                target_day = round(swing_days * mult)
                if abs(days_since_swing - target_day) <= 1:
                    signals.append({
                        "source": "fibonacci_time",
                        "asset": sym,
                        "direction": "long" if uptrend else "short",
                        "strength": 0.6,
                        "reasoning": f"{sym} at Fibonacci time zone ({swing_days} * {mult:.3f} = day {target_day}) — phi timing suggests turning point",
                        "type": "fibonacci_time",
                    })
                    break

    return signals


# ── Strategy 7: Historical Cycle Replay ───────────────────────────────────────

# BTC halving dates
BTC_HALVINGS = [
    datetime(2012, 11, 28),
    datetime(2016, 7, 9),
    datetime(2020, 5, 11),
    datetime(2024, 4, 20),
]

# Historical pattern: peak typically 12-18 months after halving
# 2012 halving → peak Nov 2013 (12 months)
# 2016 halving → peak Dec 2017 (17 months)
# 2020 halving → peak Nov 2021 (18 months)

# Kondratiev Wave (60-year supercycle): we're in the "winter-to-spring" transition
# Digital age transition, debt restructuring phase

# Benner's Cycle: panic years repeat on 16-18-20 year cycle
# Recent panics: 2008 (+18=2026, +20=2028)
BENNER_PANIC_YEARS = [1819, 1837, 1857, 1873, 1891, 1907, 1929, 1949, 1969, 1987, 2007, 2026]


def historical_cycles(prices, now=None):
    """Where are we in the great cycles? BTC halving, Kondratiev, Benner."""
    now = now or datetime.utcnow()
    signals = []

    # BTC Halving Cycle
    last_halving = BTC_HALVINGS[-1]
    months_since = (now - last_halving).days / 30.44

    btc_price = prices.get("BTC", {}).get("price")
    if btc_price:
        if 6 < months_since < 12:
            # Early bull phase: historically strong accumulation zone
            signals.append({
                "source": "historical_cycles",
                "asset": "BTC",
                "direction": "long",
                "strength": 0.7,
                "reasoning": f"BTC halving cycle: {months_since:.0f} months post-halving (April 2024). Historical pattern: early bull phase. Previous cycles peaked at 12-18 months.",
                "type": "historical_cycles",
            })
        elif 12 < months_since < 18:
            # Peak zone: still bullish but with caution
            signals.append({
                "source": "historical_cycles",
                "asset": "BTC",
                "direction": "long",
                "strength": 0.55,
                "reasoning": f"BTC halving cycle: {months_since:.0f} months post-halving. Peak zone (12-18mo). Previous cycles topped in this window. Ride but watch for reversal.",
                "type": "historical_cycles",
            })
        elif 18 < months_since < 30:
            # Post-peak: historically bearish
            signals.append({
                "source": "historical_cycles",
                "asset": "BTC",
                "direction": "short",
                "strength": 0.6,
                "reasoning": f"BTC halving cycle: {months_since:.0f} months post-halving. Post-peak zone. Previous cycles entered bear market by now.",
                "type": "historical_cycles",
            })

    # Benner's Cycle: 2026 is a predicted panic year
    if now.year in BENNER_PANIC_YEARS:
        signals.append({
            "source": "historical_cycles",
            "asset": "BTC",
            "direction": "short",
            "strength": 0.5,
            "reasoning": f"Benner's Cycle: {now.year} is a predicted panic year (16-18-20yr cycle from 2007). Benner predicted panics in 1819-2026 — 200+ year pattern.",
            "type": "historical_cycles",
        })
        # But Benner panics = buy opportunity
        signals.append({
            "source": "historical_cycles",
            "asset": "ETH",
            "direction": "long",
            "strength": 0.5,
            "reasoning": f"Benner's Cycle: {now.year} panic year = buying opportunity for those who survive. Alts recover harder than BTC post-panic.",
            "type": "historical_cycles",
        })

    return signals


# ── Strategy 8: Vortex / Toroidal Flow ───────────────────────────────────────

def detect_vortex_phase(price_list):
    """Detect market phase using toroidal flow model.

    Markets breathe: compress (low volatility) → expand (breakout) → compress.
    This is Schauberger's implosion/explosion cycle applied to price.

    Phases:
    - COMPRESSION: volatility contracting, price coiling (accumulation/distribution)
    - EXPANSION_UP: breakout upward (implosion → creation)
    - EXPANSION_DOWN: breakout downward (explosion → dissipation)
    - TRANSITION: between phases
    """
    if len(price_list) < 10:
        return "UNKNOWN", 0, 0

    # Calculate rolling volatility (std dev of daily returns)
    returns = [(price_list[i] - price_list[i-1]) / price_list[i-1]
               for i in range(1, len(price_list)) if price_list[i-1] > 0]

    if len(returns) < 7:
        return "UNKNOWN", 0, 0

    # Recent volatility (last 7 days) vs full period
    recent_vol = (sum(r**2 for r in returns[-7:]) / 7) ** 0.5
    full_vol = (sum(r**2 for r in returns) / len(returns)) ** 0.5

    vol_ratio = recent_vol / full_vol if full_vol > 0 else 1.0

    # Recent trend direction
    recent_return = (price_list[-1] - price_list[-7]) / price_list[-7] if price_list[-7] > 0 else 0

    if vol_ratio < 0.6:
        return "COMPRESSION", vol_ratio, recent_return
    elif vol_ratio > 1.3 and recent_return > 0.02:
        return "EXPANSION_UP", vol_ratio, recent_return
    elif vol_ratio > 1.3 and recent_return < -0.02:
        return "EXPANSION_DOWN", vol_ratio, recent_return
    else:
        return "TRANSITION", vol_ratio, recent_return


def vortex_flow(prices, history):
    """Toroidal flow detection — Schauberger's implosion dynamics applied to markets."""
    signals = []

    for sym, price_list in history.items():
        if len(price_list) < 14:
            continue

        current_price = prices.get(sym, {}).get("price")
        if not current_price:
            continue

        phase, vol_ratio, trend = detect_vortex_phase(price_list)

        if phase == "COMPRESSION":
            # Coiling spring — breakout imminent, direction TBD
            # Lean with the longer-term trend
            long_trend = (price_list[-1] - price_list[0]) / price_list[0] if price_list[0] > 0 else 0
            direction = "long" if long_trend > 0 else "short"
            signals.append({
                "source": "vortex_flow",
                "asset": sym,
                "direction": direction,
                "strength": 0.65,
                "reasoning": f"{sym} in COMPRESSION phase (vol ratio {vol_ratio:.2f}). Toroidal coil — energy accumulating. Breakout {'up' if direction == 'long' else 'down'} expected. Schauberger: implosion precedes creation.",
                "type": "vortex_flow",
            })

        elif phase == "EXPANSION_UP":
            signals.append({
                "source": "vortex_flow",
                "asset": sym,
                "direction": "long",
                "strength": 0.7,
                "reasoning": f"{sym} in EXPANSION UP phase (vol ratio {vol_ratio:.2f}, trend +{trend*100:.1f}%). Vortex unwinding upward. Ride the implosion spiral.",
                "type": "vortex_flow",
            })

        elif phase == "EXPANSION_DOWN":
            signals.append({
                "source": "vortex_flow",
                "asset": sym,
                "direction": "short",
                "strength": 0.7,
                "reasoning": f"{sym} in EXPANSION DOWN phase (vol ratio {vol_ratio:.2f}, trend {trend*100:.1f}%). Explosion phase — energy dissipating. Stand aside or short.",
                "type": "vortex_flow",
            })

    return signals


# ── Strategy 9: Suppression Signal ───────────────────────────────────────────

SUPPRESSION_KEYWORDS = [
    "crash", "collapse", "bubble", "warning", "ban", "scam", "dead",
    "worthless", "ponzi", "fraud", "crackdown", "risk", "dump", "plunge",
    "nightmare", "disaster", "panic"
]

POSITIVE_KEYWORDS = [
    "surge", "rally", "breakout", "adoption", "approval", "bullish",
    "soar", "milestone", "record", "breakthrough"
]


def suppression_signal(prices, news):
    """Detect coordinated FUD patterns — the Cathedral's suppression playbook applied to markets.

    When mainstream media suddenly coordinates negative coverage of a specific asset,
    it often precedes the biggest moves UP. The pattern: marginalise → discredit → ...buy.
    """
    signals = []
    if not news:
        return signals

    # Count negative vs positive mentions per asset
    asset_mentions = {}
    for headline_obj in news:
        title = headline_obj.get("title", "").lower() if isinstance(headline_obj, dict) else str(headline_obj).lower()

        for sym in COIN_IDS:
            sym_lower = sym.lower()
            coin_name = COIN_IDS[sym].replace("-2", "").replace("-network", "")
            if sym_lower in title or coin_name in title:
                if sym not in asset_mentions:
                    asset_mentions[sym] = {"negative": 0, "positive": 0, "total": 0}
                asset_mentions[sym]["total"] += 1

                if any(kw in title for kw in SUPPRESSION_KEYWORDS):
                    asset_mentions[sym]["negative"] += 1
                if any(kw in title for kw in POSITIVE_KEYWORDS):
                    asset_mentions[sym]["positive"] += 1

    # General market FUD detection (not asset-specific)
    total_negative = sum(1 for h in news
                        if any(kw in (h.get("title", "") if isinstance(h, dict) else str(h)).lower()
                               for kw in SUPPRESSION_KEYWORDS))
    total_positive = sum(1 for h in news
                        if any(kw in (h.get("title", "") if isinstance(h, dict) else str(h)).lower()
                               for kw in POSITIVE_KEYWORDS))

    # If >60% of headlines are negative — coordinated FUD, contrarian buy
    if len(news) > 3 and total_negative / len(news) > 0.5:
        for sym in ["BTC", "ETH"]:
            if sym in prices and prices[sym].get("price"):
                signals.append({
                    "source": "suppression_signal",
                    "asset": sym,
                    "direction": "long",
                    "strength": min(total_negative / len(news), 0.85),
                    "reasoning": f"Suppression pattern detected: {total_negative}/{len(news)} headlines negative. Coordinated FUD = contrarian buy. The Cathedral playbook: when they all say sell, buy.",
                    "type": "suppression_signal",
                })

    # Per-asset: if one coin gets disproportionate FUD
    for sym, counts in asset_mentions.items():
        if counts["negative"] >= 3 and counts["negative"] > counts["positive"] * 2:
            if sym in prices and prices[sym].get("price"):
                signals.append({
                    "source": "suppression_signal",
                    "asset": sym,
                    "direction": "long",
                    "strength": min(counts["negative"] / 5, 0.8),
                    "reasoning": f"{sym} targeted: {counts['negative']} negative headlines vs {counts['positive']} positive. Concentrated FUD on single asset = suppression signature. Contrarian buy.",
                    "type": "suppression_signal",
                })

    return signals


# ── Strategy 10: Prediction Market Delta ──────────────────────────────────────

def polymarket_delta(prices):
    """Prediction market sentiment vs crypto prices.

    Polymarket aggregates information faster than traditional markets.
    When prediction markets price crypto events differently than spot prices imply,
    that gap is signal.
    """
    signals = []

    # Fetch crypto-related prediction markets
    try:
        url = "https://gamma-api.polymarket.com/events?tag=crypto&closed=false&limit=20"
        req = urllib.request.Request(url, headers={
            "User-Agent": "CathedralTrader/1.0",
            "Accept": "application/json"
        })
        with urllib.request.urlopen(req, timeout=10) as resp:
            events = json.loads(resp.read())

        if not events:
            return signals

        # Aggregate sentiment from active crypto prediction markets
        bullish_markets = 0
        bearish_markets = 0
        total_volume = 0

        for event in events:
            title = event.get("title", "").lower()
            markets = event.get("markets", [])

            for market in markets:
                # Look for price prediction markets
                question = market.get("question", "").lower()
                outcome_prices = market.get("outcomePrices", [])
                volume = float(market.get("volume", 0) or 0)

                if not outcome_prices:
                    continue

                # Parse yes/no probability
                try:
                    yes_prob = float(outcome_prices[0]) if outcome_prices else 0.5
                except (ValueError, IndexError):
                    yes_prob = 0.5

                total_volume += volume

                # Classify: does this market predict bullish or bearish outcome?
                bullish_keywords = ["above", "reach", "exceed", "break", "ath", "100k", "200k"]
                bearish_keywords = ["below", "crash", "drop", "fall", "under"]

                is_bullish_q = any(kw in question for kw in bullish_keywords)
                is_bearish_q = any(kw in question for kw in bearish_keywords)

                if is_bullish_q and yes_prob > 0.5:
                    bullish_markets += 1
                elif is_bullish_q and yes_prob < 0.4:
                    bearish_markets += 1
                elif is_bearish_q and yes_prob > 0.5:
                    bearish_markets += 1
                elif is_bearish_q and yes_prob < 0.4:
                    bullish_markets += 1

        if bullish_markets + bearish_markets > 0:
            ratio = bullish_markets / (bullish_markets + bearish_markets)

            if ratio > 0.65:
                for sym in ["BTC", "ETH"]:
                    if sym in prices and prices[sym].get("price"):
                        signals.append({
                            "source": "polymarket_delta",
                            "asset": sym,
                            "direction": "long",
                            "strength": min(ratio, 0.8),
                            "reasoning": f"Polymarket bullish: {bullish_markets} bullish vs {bearish_markets} bearish markets. Prediction markets see upside. Total volume: ${total_volume:,.0f}.",
                            "type": "polymarket_delta",
                        })
            elif ratio < 0.35:
                for sym in ["BTC", "ETH"]:
                    if sym in prices and prices[sym].get("price"):
                        signals.append({
                            "source": "polymarket_delta",
                            "asset": sym,
                            "direction": "short",
                            "strength": min(1 - ratio, 0.8),
                            "reasoning": f"Polymarket bearish: {bearish_markets} bearish vs {bullish_markets} bullish markets. Prediction markets see downside. Total volume: ${total_volume:,.0f}.",
                            "type": "polymarket_delta",
                        })

    except Exception as e:
        print(f"  Polymarket error: {e}")

    return signals


# ── Strategy 11: Cymatics / Schumann Resonance ───────────────────────────────

# Schumann resonance harmonics (Hz) — Earth's electromagnetic heartbeat
SCHUMANN_HARMONICS = [7.83, 14.3, 20.8, 27.3, 33.8]

# Converted to market cycles: if we treat each harmonic as a cycle period in days
# 7.83 Hz → 7.83 day cycle, 14.3 → 14.3 day cycle, etc.
# The idea: markets oscillate, and when their oscillation period resonates
# with a Schumann harmonic, there's a structural alignment.


def compute_dominant_frequency(price_list):
    """Compute dominant oscillation frequency from price series using zero-crossing method.

    Instead of FFT (which needs scipy), count zero-crossings of detrended price.
    Each pair of zero-crossings = half a cycle. Simple, robust, no dependencies.
    """
    if len(price_list) < 10:
        return None, None

    # Detrend: subtract linear regression
    n = len(price_list)
    x_mean = (n - 1) / 2
    y_mean = sum(price_list) / n
    slope_num = sum((i - x_mean) * (price_list[i] - y_mean) for i in range(n))
    slope_den = sum((i - x_mean) ** 2 for i in range(n))
    slope = slope_num / slope_den if slope_den != 0 else 0
    intercept = y_mean - slope * x_mean

    detrended = [price_list[i] - (slope * i + intercept) for i in range(n)]

    # Count zero crossings
    crossings = 0
    for i in range(1, len(detrended)):
        if detrended[i-1] * detrended[i] < 0:
            crossings += 1

    if crossings < 2:
        return None, None

    # Dominant period = 2 * (days / crossings) — each crossing is half a cycle
    period_days = 2 * n / crossings
    frequency = 1 / period_days if period_days > 0 else None

    return period_days, frequency


def detect_standing_wave(price_list):
    """Detect if price is forming a standing wave (cymatic node) or chaos.

    Standing wave: symmetrical compression — highs getting lower, lows getting higher.
    This is a cymatic pattern: matter self-organizing at a resonant frequency.
    Chaos: no pattern — noise, wait.

    Returns: (is_standing_wave, symmetry_score)
    """
    if len(price_list) < 14:
        return False, 0

    # Split into two halves
    mid = len(price_list) // 2
    first_half = price_list[:mid]
    second_half = price_list[mid:]

    # Standing wave detection: range compression
    range_first = max(first_half) - min(first_half)
    range_second = max(second_half) - min(second_half)

    if range_first == 0:
        return False, 0

    compression_ratio = range_second / range_first

    # Symmetry: how centered is the current price between recent high and low?
    recent = price_list[-7:]
    high = max(recent)
    low = min(recent)
    mid_price = (high + low) / 2
    current = price_list[-1]

    if high == low:
        symmetry = 1.0
    else:
        symmetry = 1 - abs(current - mid_price) / ((high - low) / 2)
        symmetry = max(0, min(1, symmetry))

    # Standing wave: range compressing AND price near center
    is_standing = compression_ratio < 0.7 and symmetry > 0.6

    return is_standing, round(symmetry, 3)


def cymatics_schumann(prices, history):
    """Cymatics + Schumann Resonance — frequency is structure, structure is signal.

    When market oscillation frequency resonates with Schumann harmonics,
    the market is vibrating at Earth's natural frequency. Signal.

    When price forms a standing wave (cymatic node), matter is self-organizing.
    Breakout from a standing wave = energy release. Direction from trend.
    """
    signals = []

    for sym, price_list in history.items():
        if len(price_list) < 14:
            continue

        current_price = prices.get(sym, {}).get("price")
        if not current_price:
            continue

        # 1. Dominant frequency analysis
        period, freq = compute_dominant_frequency(price_list)

        if period:
            # Check resonance with Schumann harmonics
            # We map: market oscillation period (days) close to a Schumann harmonic value
            for harmonic in SCHUMANN_HARMONICS:
                # Resonance if period is within 15% of harmonic value
                if abs(period - harmonic) / harmonic < 0.15:
                    # At resonance — market and Earth vibrating together
                    # Direction: with the trend at resonance
                    recent_trend = (price_list[-1] - price_list[-7]) / price_list[-7] if price_list[-7] > 0 else 0
                    direction = "long" if recent_trend > 0 else "short" if recent_trend < -0.01 else "long"

                    signals.append({
                        "source": "cymatics_schumann",
                        "asset": sym,
                        "direction": direction,
                        "strength": 0.7,
                        "reasoning": f"{sym} oscillation period {period:.1f} days resonates with Schumann harmonic {harmonic} Hz (within 15%). Market vibrating at Earth's frequency. Trend: {'up' if recent_trend > 0 else 'down'} {abs(recent_trend)*100:.1f}%.",
                        "type": "cymatics_schumann",
                    })
                    break  # One Schumann signal per asset

        # 2. Standing wave / cymatic node detection
        is_standing, symmetry = detect_standing_wave(price_list)

        if is_standing:
            # Price forming a cymatic pattern — self-organizing, breakout imminent
            # Direction: lean with longer-term trend
            long_trend = (price_list[-1] - price_list[0]) / price_list[0] if price_list[0] > 0 else 0
            direction = "long" if long_trend > 0 else "short"

            signals.append({
                "source": "cymatics_schumann",
                "asset": sym,
                "direction": direction,
                "strength": 0.6 + symmetry * 0.2,
                "reasoning": f"{sym} forming STANDING WAVE pattern (symmetry {symmetry:.2f}, range compressing). Cymatic node — matter self-organizing at resonant frequency. Breakout {'up' if direction == 'long' else 'down'} expected when node releases energy.",
                "type": "cymatics_schumann",
            })

    return signals


# ── Strategy 13: Harmonic Year (360-day Division) ─────────────────────────────

def harmonic_year_gann(price):
    """Gann Square of Nine using 360-degree division instead of calendar days.

    The resonant enclosure model: every ancient civilization used 360-day year first,
    then corrected to 365.25. If Gann's geometry was built on the original tuning,
    360-degree division may produce cleaner price levels.

    Same algorithm as gann_square_of_nine but offsets are in 360ths, not arbitrary.
    Cardinal cross at 90/180/270/360 degrees = exact quarter turns.
    """
    root = math.sqrt(price)
    levels = []

    # 360-degree offsets: each unit = 1 degree of the square
    # Cardinal: 90 (0.25 turn), 180 (0.5), 270 (0.75), 360 (1.0)
    # Ordinal: 45 (0.125), 135 (0.375), 225 (0.625), 315 (0.875)
    for degrees in [45, 90, 135, 180, 225, 270, 315, 360]:
        offset = degrees / 360.0  # Normalize to fraction of full turn
        for sign in [-1, 1]:
            level = (root + sign * offset) ** 2
            if level > 0:
                distance_pct = (level - price) / price
                levels.append({
                    "level": round(level, 2),
                    "distance_pct": round(distance_pct * 100, 2),
                    "cardinal": degrees % 90 == 0,
                    "degrees": degrees,
                })

    return levels


def harmonic_year(prices, history, now=None):
    """360-day year division applied to market timing and Gann geometry.

    Two tests running simultaneously:
    1. Gann levels computed with 360-degree offsets (vs arbitrary sqrt offsets)
    2. Cycle timing using 360-day year (30-day months, 12 exact months)

    The detuning finding: sun's circuit changed from 360 to 365.25 days.
    If markets respond to the cavity's native math, 360-based signals > 365-based.
    """
    now = now or datetime.utcnow()
    signals = []

    # Part 1: 360-degree Gann levels
    for sym, price_data in prices.items():
        price = price_data.get("price")
        if not price:
            continue

        levels = harmonic_year_gann(price)

        # Find nearest level
        nearest = min(levels, key=lambda l: abs(l["distance_pct"]))

        # Signal when price within 1.5% of a 360-degree Gann level
        if abs(nearest["distance_pct"]) < 1.5:
            is_cardinal = nearest["cardinal"]
            direction = "long" if nearest["distance_pct"] > 0 else "short"
            strength = 0.7 if is_cardinal else 0.55

            if price < nearest["level"]:
                direction = "long"
                reasoning = (f"{sym} at 360-degree Gann level ${nearest['level']:.0f} "
                           f"({nearest['degrees']}deg, {nearest['distance_pct']:.1f}% away) "
                           f"— cavity's native geometry support")
            else:
                direction = "short"
                reasoning = (f"{sym} at 360-degree Gann level ${nearest['level']:.0f} "
                           f"({nearest['degrees']}deg, {nearest['distance_pct']:.1f}% away) "
                           f"— cavity's native geometry resistance")

            signals.append({
                "source": "harmonic_year",
                "asset": sym,
                "direction": direction,
                "strength": strength,
                "reasoning": reasoning,
                "type": "harmonic_year",
            })

    # Part 2: 30-day month cycle timing (360/12 = 30 exact)
    # Check if we're at a harmonic month boundary
    day_of_year = now.timetuple().tm_yday
    # Map 365-day calendar to 360-degree position
    degree_position = (day_of_year / 365.25) * 360

    # Cardinal month boundaries: 30, 60, 90, 120... (every 30 degrees)
    nearest_boundary = round(degree_position / 30) * 30
    distance_from_boundary = abs(degree_position - nearest_boundary)

    # Signal at month boundaries (within 2 degrees = ~2 calendar days)
    if distance_from_boundary < 2:
        # At a harmonic month boundary — potential turning point
        for sym in ["BTC", "ETH", "SOL"]:
            if sym in prices and prices[sym].get("price"):
                hist = history.get(sym, [])
                if len(hist) >= 7:
                    recent_trend = (hist[-1] - hist[-3]) / hist[-3] if hist[-3] > 0 else 0
                    # Fade the trend at boundaries (turning point hypothesis)
                    direction = "short" if recent_trend > 0.01 else "long" if recent_trend < -0.01 else "long"
                    signals.append({
                        "source": "harmonic_year",
                        "asset": sym,
                        "direction": direction,
                        "strength": 0.55,
                        "reasoning": (f"360-degree calendar: day {day_of_year} = {degree_position:.0f}deg, "
                                    f"near {nearest_boundary}deg month boundary. "
                                    f"Harmonic turning point — fading recent {'up' if recent_trend > 0 else 'down'}trend."),
                        "type": "harmonic_year",
                    })

    return signals


# ── Strategy 14: Harmonic 432 ────────────────────────────────────────────────

# 432 Hz harmonic series — pre-1939 concert pitch, connected to Schumann
# Schumann (7.83 Hz) x 55 = 430.65 ≈ 432
# 432 / 2^n gives octave divisions; mapped to market cycle periods in days
HARMONIC_432_SERIES = [
    432,     # Root
    216,     # Octave below
    108,     # 2 octaves below
    54,      # 3 octaves below
    27,      # 4 octaves below — close to Schumann 4th harmonic (27.3)
    13.5,    # 5 octaves below — close to Schumann 2nd harmonic (14.3)
    6.75,    # 6 octaves below — close to Schumann fundamental (7.83)
]

# Cross-reference: 432 / 55 = 7.854... ≈ 7.83 Hz (Schumann fundamental)
# The 432 web connects Schumann to Fibonacci:
# 7.83 x 55 (Fibonacci number) = 430.65
# Tolerance for resonance matching
HARMONIC_432_TOLERANCE = 0.12  # 12% — wider than Schumann (15%) because octave divisions


def harmonic_432(prices, history):
    """432 Hz harmonic series mapped to market oscillation periods.

    The resonant enclosure finding: 432 was the cavity's concert pitch before
    1939 (Rockefeller Foundation standardized 440 Hz same year Rife's frequency
    healing was destroyed). If the cavity has a native pitch, markets operating
    inside it may oscillate at octave divisions of that pitch.

    Test: do market oscillation periods cluster around 432/2^n day cycles
    more than random? Compare with Schumann harmonics (Strategy 11).
    """
    signals = []

    for sym, price_list in history.items():
        if len(price_list) < 14:
            continue

        current_price = prices.get(sym, {}).get("price")
        if not current_price:
            continue

        # Compute dominant oscillation period (reuse cymatics method)
        period, freq = compute_dominant_frequency(price_list)

        if not period:
            continue

        # Check resonance with 432 harmonic series
        for harmonic in HARMONIC_432_SERIES:
            if harmonic > 60:  # Skip harmonics longer than our data window
                continue

            if abs(period - harmonic) / harmonic < HARMONIC_432_TOLERANCE:
                # Resonance with 432 Hz octave division
                recent_trend = (price_list[-1] - price_list[-7]) / price_list[-7] if price_list[-7] > 0 else 0
                direction = "long" if recent_trend > 0 else "short" if recent_trend < -0.01 else "long"

                # Higher strength for harmonics that also align with Schumann
                schumann_overlap = any(
                    abs(harmonic - sh) / sh < 0.15
                    for sh in [7.83, 14.3, 20.8, 27.3, 33.8]
                )
                strength = 0.75 if schumann_overlap else 0.65

                signals.append({
                    "source": "harmonic_432",
                    "asset": sym,
                    "direction": direction,
                    "strength": strength,
                    "reasoning": (f"{sym} oscillation period {period:.1f} days resonates with "
                                f"432 Hz octave division ({harmonic} days). "
                                f"{'ALSO aligns with Schumann harmonic — dual resonance. ' if schumann_overlap else ''}"
                                f"Cavity's native pitch × market oscillation. "
                                f"Trend: {'up' if recent_trend > 0 else 'down'} {abs(recent_trend)*100:.1f}%."),
                    "type": "harmonic_432",
                })
                break  # One 432 signal per asset

    return signals


# ── Strategy 15: Sexagesimal Cycles ──────────────────────────────────────────

# Base-60 time windows in days — every factor of 60
# Sumerian insight: base-60 = dividing system, optimized for proportions
# 71% of medical corpus fractions use 1/3 or 2/3 — exact in base-60 (20/60, 40/60)
SEXAGESIMAL_WINDOWS = [3, 5, 6, 10, 12, 15, 20, 30]

# Sexagesimal retracement levels — exact fractions in base-60
SEXAGESIMAL_RETRACEMENTS = {
    '1/6': 1/6,    # 10/60
    '1/5': 1/5,    # 12/60
    '1/4': 1/4,    # 15/60
    '1/3': 1/3,    # 20/60 — dominant in Sumerian corpus
    '2/5': 2/5,    # 24/60
    '1/2': 1/2,    # 30/60
    '3/5': 3/5,    # 36/60
    '2/3': 2/3,    # 40/60 — second most common
    '3/4': 3/4,    # 45/60
    '5/6': 5/6,    # 50/60
}


def sexagesimal_cycles(prices, history):
    """Base-60 aligned time windows applied to market cycle detection.

    Three tests:
    1. Proportional convergence — do sexagesimal time windows agree on direction?
       Uses the 1/3 rule: bottom third of range = long, top third = short.
    2. Sexagesimal retracement — are 1/3 and 2/3 levels acting as support/resistance?
    3. Cycle resonance — does the dominant oscillation align with a base-60 period?
    """
    signals = []

    for sym, price_list in history.items():
        if len(price_list) < 15:
            continue

        current_price = prices.get(sym, {}).get("price")
        if not current_price:
            continue

        # ── Test 1: Proportional convergence ──
        votes = {'long': 0, 'short': 0, 'neutral': 0}
        details = []

        for window in SEXAGESIMAL_WINDOWS:
            if window >= len(price_list):
                continue

            window_slice = price_list[-window:]
            w_high = max(window_slice)
            w_low = min(window_slice)
            w_range = w_high - w_low

            if w_range > 0:
                position = (current_price - w_low) / w_range
                if position < 1/3:
                    votes['long'] += 1
                    details.append(f"{window}d:{position:.0%}")
                elif position > 2/3:
                    votes['short'] += 1
                    details.append(f"{window}d:{position:.0%}")
                else:
                    votes['neutral'] += 1

        total = votes['long'] + votes['short'] + votes['neutral']
        if total >= 3:
            long_pct = votes['long'] / total
            short_pct = votes['short'] / total

            if long_pct >= 0.6 or short_pct >= 0.6:
                direction = 'long' if long_pct > short_pct else 'short'
                convergence = max(long_pct, short_pct)
                strength = round(0.5 + (convergence - 0.6) * 1.25, 2)
                strength = min(max(strength, 0.5), 0.85)

                signals.append({
                    "source": "sexagesimal_cycles",
                    "asset": sym,
                    "direction": direction,
                    "strength": strength,
                    "reasoning": (f"{sym} sexagesimal convergence: "
                                f"{votes['long']}L/{votes['short']}S/{votes['neutral']}N "
                                f"across {total} base-60 windows ({convergence:.0%} agree). "
                                f"{'; '.join(details[:4])}."),
                    "type": "sexagesimal_cycles",
                })

        # ── Test 2: Sexagesimal retracement ──
        if len(price_list) >= 30:
            r_high = max(price_list[-30:])
            r_low = min(price_list[-30:])
            r_range = r_high - r_low

            if r_range > 0:
                for label, fraction in SEXAGESIMAL_RETRACEMENTS.items():
                    level = r_low + r_range * fraction
                    dist_pct = abs(current_price - level) / current_price * 100

                    if dist_pct < 1.5:
                        is_corpus = label in ('1/3', '2/3')
                        lev_str = 0.7 if is_corpus else 0.55

                        if current_price < level:
                            ret_dir = "long"
                            note = f"support — exact in base-60"
                        else:
                            ret_dir = "short"
                            note = f"resistance — exact in base-60"

                        corpus_tag = "Corpus-dominant fraction. " if is_corpus else ""

                        signals.append({
                            "source": "sexagesimal_cycles",
                            "asset": sym,
                            "direction": ret_dir,
                            "strength": lev_str,
                            "reasoning": (f"{sym} at sexagesimal {label} retracement "
                                        f"${level:.0f} ({dist_pct:.1f}% away). "
                                        f"{corpus_tag}{note}."),
                            "type": "sexagesimal_cycles",
                        })
                        break

        # ── Test 3: Cycle resonance at base-60 periods ──
        period, freq = compute_dominant_frequency(price_list)
        if period:
            for window in SEXAGESIMAL_WINDOWS:
                if abs(period - window) / window < 0.15:
                    trend = (price_list[-1] - price_list[-3]) / price_list[-3] if price_list[-3] > 0 else 0
                    c_dir = "long" if trend > 0 else "short" if trend < -0.01 else "long"

                    signals.append({
                        "source": "sexagesimal_cycles",
                        "asset": sym,
                        "direction": c_dir,
                        "strength": 0.65,
                        "reasoning": (f"{sym} dominant period {period:.1f}d resonates with "
                                    f"sexagesimal {window}d window (factor of 60). "
                                    f"Base-60 cycle alignment."),
                        "type": "sexagesimal_cycles",
                    })
                    break

    return signals


# ── Strategy 12: Range Trader ─────────────────────────────────────────────────

def range_trader(prices, history):
    """Profits from flat/sideways markets. When everyone else is waiting, this acts.

    Detects range-bound conditions, buys near support, sells near resistance.
    Tighter SL/TP than directional strategies — small bites in a flat market.
    """
    signals = []

    for sym, price_list in history.items():
        if len(price_list) < 14:
            continue

        current_price = prices.get(sym, {}).get("price")
        if not current_price:
            continue

        # Detect range-bound: low volatility over recent period
        recent = price_list[-14:]
        high = max(recent)
        low = min(recent)
        rng = high - low

        if high == 0:
            continue

        range_pct = rng / ((high + low) / 2) * 100

        # Range-bound = less than 10% range over 14 days
        if range_pct > 10:
            continue  # Too volatile — not range-bound

        # Where is price within the range? (0 = bottom, 1 = top)
        if rng == 0:
            continue
        position_in_range = (current_price - low) / rng

        # Mean reversion signals
        if position_in_range < 0.3:
            # Near bottom of range — buy (expect reversion to mean)
            strength = 0.5 + (0.3 - position_in_range)  # Stronger at extremes
            signals.append({
                "source": "range_trader",
                "asset": sym,
                "direction": "long",
                "strength": min(strength, 0.85),
                "reasoning": f"{sym} at {position_in_range*100:.0f}% of 14-day range (${low:.2f}-${high:.2f}). Near support in range-bound market ({range_pct:.1f}% range). Mean reversion buy.",
                "type": "range_trader",
            })
        elif position_in_range > 0.7:
            # Near top of range — sell/short (expect reversion)
            strength = 0.5 + (position_in_range - 0.7)
            signals.append({
                "source": "range_trader",
                "asset": sym,
                "direction": "short",
                "strength": min(strength, 0.85),
                "reasoning": f"{sym} at {position_in_range*100:.0f}% of 14-day range (${low:.2f}-${high:.2f}). Near resistance in range-bound market ({range_pct:.1f}% range). Mean reversion sell.",
                "type": "range_trader",
            })

        # Tight oscillation signal — if range is very narrow (<5%), any position is a trade
        if range_pct < 5 and 0.35 < position_in_range < 0.65:
            # Dead center of a very tight range — breakout imminent, lean with recent direction
            recent_trend = (price_list[-1] - price_list[-3]) / price_list[-3] if price_list[-3] > 0 else 0
            direction = "long" if recent_trend > 0 else "short"
            signals.append({
                "source": "range_trader",
                "asset": sym,
                "direction": direction,
                "strength": 0.6,
                "reasoning": f"{sym} in ultra-tight {range_pct:.1f}% range. Coiled spring — breakout direction: {'up' if direction == 'long' else 'down'} based on micro-trend ({recent_trend*100:.2f}%).",
                "type": "range_trader",
            })

    return signals


# ── Master Runner ─────────────────────────────────────────────────────────────

def run(prices=None, news=None):
    """Run all 10 cathedral strategies. Returns combined signal list."""
    print("[cathedral-strategies] Running 12 strategies...")

    # Load current prices from existing signals file if not provided
    if not prices:
        signals_path = OUTPUT_DIR / "crypto-signals-latest.json"
        if signals_path.exists():
            data = json.loads(signals_path.read_text())
            prices = data.get("prices", {})
            news = data.get("news", [])

    if not prices:
        print("  No price data available")
        return []

    # Fetch price history for strategies that need it
    print("  Fetching price history...")
    history = fetch_all_history(["BTC", "ETH", "SOL", "AVAX", "LINK"], days=30)
    print(f"  History: {len(history)} coins, {sum(len(v) for v in history.values())} data points")

    all_signals = []

    # Strategy 3: DCA Baseline
    sigs = dca_baseline(prices)
    print(f"  DCA Baseline: {len(sigs)} signals")
    all_signals.extend(sigs)

    # Strategy 4: Gann Geometry
    sigs = gann_geometry(prices, history)
    print(f"  Gann Geometry: {len(sigs)} signals")
    all_signals.extend(sigs)

    # Strategy 5: Lunar Cycles
    sigs = lunar_cycles(prices)
    print(f"  Lunar Cycles: {len(sigs)} signals")
    all_signals.extend(sigs)

    # Strategy 6: Fibonacci Time + Price
    sigs = fibonacci_time_price(prices, history)
    print(f"  Fibonacci Time: {len(sigs)} signals")
    all_signals.extend(sigs)

    # Strategy 7: Historical Cycles
    sigs = historical_cycles(prices)
    print(f"  Historical Cycles: {len(sigs)} signals")
    all_signals.extend(sigs)

    # Strategy 8: Vortex Flow
    sigs = vortex_flow(prices, history)
    print(f"  Vortex Flow: {len(sigs)} signals")
    all_signals.extend(sigs)

    # Strategy 9: Suppression Signal
    sigs = suppression_signal(prices, news)
    print(f"  Suppression Signal: {len(sigs)} signals")
    all_signals.extend(sigs)

    # Strategy 10: Polymarket Delta
    sigs = polymarket_delta(prices)
    print(f"  Polymarket Delta: {len(sigs)} signals")
    all_signals.extend(sigs)

    # Strategy 11: Cymatics / Schumann Resonance
    sigs = cymatics_schumann(prices, history)
    print(f"  Cymatics Schumann: {len(sigs)} signals")
    all_signals.extend(sigs)

    # Strategy 12: Range Trader (flat market specialist)
    sigs = range_trader(prices, history)
    print(f"  Range Trader: {len(sigs)} signals")
    all_signals.extend(sigs)

    # Strategy 13: Harmonic Year (360-day division — resonant enclosure)
    sigs = harmonic_year(prices, history)
    print(f"  Harmonic Year: {len(sigs)} signals")
    all_signals.extend(sigs)

    # Strategy 14: Harmonic 432 (432 Hz octave series — cavity pitch)
    sigs = harmonic_432(prices, history)
    print(f"  Harmonic 432: {len(sigs)} signals")
    all_signals.extend(sigs)

    # Strategy 15: Sexagesimal Cycles (base-60 time windows — corpus-backed)
    sigs = sexagesimal_cycles(prices, history)
    print(f"  Sexagesimal Cycles: {len(sigs)} signals")
    all_signals.extend(sigs)

    # Save output
    output = {
        "timestamp": datetime.now().isoformat(),
        "strategy_count": 13,
        "total_signals": len(all_signals),
        "signals": all_signals,
    }

    output_path = OUTPUT_DIR / "cathedral-signals-latest.json"
    output_path.write_text(json.dumps(output, indent=2))
    print(f"  Total: {len(all_signals)} signals from 8 strategies → {output_path}")

    return all_signals


if __name__ == "__main__":
    run()
