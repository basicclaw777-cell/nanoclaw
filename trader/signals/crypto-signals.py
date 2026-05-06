#!/usr/bin/env python3
"""
Crypto Signal Scraper — Price, sentiment, and news signals for trading

Sources:
- CoinGecko API (free, no key): price, volume, market cap
- Reddit: crypto sentiment from r/cryptocurrency, r/bitcoin, r/ethereum
- Fear & Greed Index: market-wide sentiment
- Breaking news: CoinDesk, CoinTelegraph headlines

All free. All local processing. Sovereign.
"""

import json
import re
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

OUTPUT_DIR = Path.home() / "nanoclaw" / "trader" / "signals"
OLLAMA_URL = "http://localhost:11434/api/chat"

# ── CoinGecko (free API, no key needed) ──────────────────────────────────────

COINGECKO_BASE = "https://api.coingecko.com/api/v3"

COIN_IDS = {
    "BTC": "bitcoin", "ETH": "ethereum", "SOL": "solana",
    "AVAX": "avalanche-2", "LINK": "chainlink", "DOT": "polkadot",
    "MATIC": "matic-network", "ARB": "arbitrum",
}

def get_prices():
    """Get current prices and 24h change for watchlist."""
    ids = ",".join(COIN_IDS.values())
    url = f"{COINGECKO_BASE}/simple/price?ids={ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true"

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "CathedralTrader/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())

        prices = {}
        for symbol, coin_id in COIN_IDS.items():
            if coin_id in data:
                d = data[coin_id]
                prices[symbol] = {
                    "price": d.get("usd"),
                    "change_24h": d.get("usd_24h_change"),
                    "volume_24h": d.get("usd_24h_vol"),
                    "market_cap": d.get("usd_market_cap"),
                }
        return prices
    except Exception as e:
        print(f"  CoinGecko error: {e}")
        return {}


def get_fear_greed():
    """Get crypto Fear & Greed Index."""
    try:
        url = "https://api.alternative.me/fng/?limit=7"
        req = urllib.request.Request(url, headers={"User-Agent": "CathedralTrader/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())

        entries = data.get("data", [])
        if entries:
            current = entries[0]
            week_avg = sum(int(e["value"]) for e in entries) / len(entries)
            return {
                "value": int(current["value"]),
                "label": current["value_classification"],
                "week_avg": round(week_avg, 1),
                "trend": "rising" if int(entries[0]["value"]) > int(entries[-1]["value"]) else "falling",
            }
    except Exception as e:
        print(f"  Fear/Greed error: {e}")
    return None


def get_reddit_sentiment(subreddit="cryptocurrency", keywords=None):
    """Scrape Reddit for crypto sentiment."""
    keywords = keywords or ["bullish", "bearish", "moon", "dump", "crash", "buy", "sell", "dip"]
    url = f"https://www.reddit.com/r/{subreddit}/hot/.json?limit=30"

    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "CathedralTrader/1.0 (research; contact: paul@basicreflex.com)"
        })
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())

        posts = data.get("data", {}).get("children", [])
        bullish_count = 0
        bearish_count = 0
        total_score = 0
        mentions = {}

        bull_words = ["bullish", "moon", "buy", "dip", "accumulate", "breakout", "pump", "long"]
        bear_words = ["bearish", "dump", "crash", "sell", "short", "overvalued", "bubble", "exit"]

        for post in posts:
            d = post.get("data", {})
            text = (d.get("title", "") + " " + d.get("selftext", "")[:200]).lower()
            score = d.get("score", 0)
            total_score += score

            if any(w in text for w in bull_words):
                bullish_count += 1
            if any(w in text for w in bear_words):
                bearish_count += 1

            # Track coin mentions
            for symbol in COIN_IDS:
                if symbol.lower() in text or COIN_IDS[symbol] in text:
                    mentions[symbol] = mentions.get(symbol, 0) + 1

        total = bullish_count + bearish_count
        sentiment_score = (bullish_count - bearish_count) / max(total, 1)

        return {
            "subreddit": subreddit,
            "posts_analysed": len(posts),
            "bullish": bullish_count,
            "bearish": bearish_count,
            "sentiment_score": round(sentiment_score, 2),  # -1 to 1
            "sentiment_label": "bullish" if sentiment_score > 0.2 else "bearish" if sentiment_score < -0.2 else "neutral",
            "total_engagement": total_score,
            "coin_mentions": mentions,
        }
    except Exception as e:
        print(f"  Reddit r/{subreddit} error: {e}")
        return None


def get_crypto_news():
    """Scrape crypto news headlines for breaking catalysts."""
    results = []
    sources = [
        ("https://www.coindesk.com/", "coindesk"),
        ("https://cointelegraph.com/", "cointelegraph"),
    ]

    for url, source in sources:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "CathedralTrader/1.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                html = resp.read().decode('utf-8', errors='replace')

            # Extract headlines from title tags and h-tags
            titles = re.findall(r'<h[1-4][^>]*>([^<]{20,150})</h[1-4]>', html)
            titles += re.findall(r'"headline":\s*"([^"]{20,150})"', html)

            for title in titles[:10]:
                title = title.strip()
                if title and not title.startswith('{'):
                    results.append({"source": source, "title": title, "url": url})

        except Exception as e:
            print(f"  {source} error: {e}")

    return results


def generate_signals(prices, fear_greed, sentiment, news):
    """Process raw data into actionable signals.

    Phase 0 thresholds — lower than production to generate paper trade data.
    Will tighten as we learn which strategies actually work.
    """
    signals = []

    # Price-based signals (per-asset)
    for symbol, data in prices.items():
        change = data.get("change_24h", 0)
        if not change:
            continue

        # Oversold bounce — lowered to -3% for paper trading data
        if change < -3:
            signals.append({
                "source": "technical",
                "asset": symbol,
                "direction": "long",
                "strength": min(abs(change) / 10, 1.0),
                "reasoning": f"{symbol} down {change:.1f}% in 24h — potential oversold bounce",
                "type": "mean_reversion",
            })

        # Momentum — lowered to +3% for paper trading data
        if change > 3:
            signals.append({
                "source": "technical",
                "asset": symbol,
                "direction": "long",
                "strength": min(change / 8, 1.0),
                "reasoning": f"{symbol} up {change:.1f}% in 24h — momentum continuation",
                "type": "momentum",
            })

        # Relative strength — top mover in watchlist gets a signal
        # (handled below after all prices processed)

    # Top mover signal: best performer gets momentum signal if >1.5%
    if prices:
        sorted_coins = sorted(
            [(s, d) for s, d in prices.items() if d.get("change_24h")],
            key=lambda x: x[1]["change_24h"],
            reverse=True
        )
        if sorted_coins and sorted_coins[0][1]["change_24h"] > 1.5:
            top = sorted_coins[0]
            signals.append({
                "source": "technical",
                "asset": top[0],
                "direction": "long",
                "strength": min(top[1]["change_24h"] / 5, 0.9),
                "reasoning": f"{top[0]} is top performer (+{top[1]['change_24h']:.1f}%) — relative strength leader",
                "type": "relative_strength",
            })

    # Fear & Greed — widened bands for paper trading
    if fear_greed:
        fng = fear_greed["value"]
        if fng < 35:
            signals.append({
                "source": "sentiment",
                "asset": "MARKET",
                "direction": "long",
                "strength": (35 - fng) / 35,
                "reasoning": f"Fear & Greed at {fng} ({fear_greed['label']}) — fear zone, contrarian buy",
                "type": "contrarian",
            })
        elif fng > 65:
            signals.append({
                "source": "sentiment",
                "asset": "MARKET",
                "direction": "short",
                "strength": (fng - 65) / 35,
                "reasoning": f"Fear & Greed at {fng} ({fear_greed['label']}) — greed zone, contrarian caution",
                "type": "contrarian",
            })

    # Reddit sentiment — per-asset signals from coin mentions
    if sentiment:
        mentions = sentiment.get("coin_mentions", {})
        score = sentiment.get("sentiment_score", 0)
        for symbol, count in mentions.items():
            if count >= 3 and symbol in COIN_IDS:
                direction = "long" if score > 0.2 else "short" if score < -0.2 else "neutral"
                if direction != "neutral":
                    signals.append({
                        "source": "sentiment",
                        "asset": symbol,
                        "direction": direction,
                        "strength": min(count / 8, 0.8),
                        "reasoning": f"{symbol} mentioned {count}x on Reddit, sentiment {sentiment['sentiment_label']} ({score:.2f})",
                        "type": "social_momentum",
                    })

        # Market-wide sentiment signal (kept)
        if abs(score) > 0.3:
            signals.append({
                "source": "sentiment",
                "asset": "MARKET",
                "direction": "short" if score > 0.5 else "long" if score < -0.5 else "neutral",
                "strength": abs(score),
                "reasoning": f"Reddit consensus {sentiment['sentiment_label']} ({score:.2f}) — strong consensus often precedes reversal",
                "type": "contrarian",
            })

    return signals


def run():
    """Run all signal collection and output combined signal file."""
    print("[crypto-signals] Gathering market data...")

    prices = get_prices()
    print(f"  Prices: {len(prices)} coins")

    fear_greed = get_fear_greed()
    if fear_greed:
        print(f"  Fear/Greed: {fear_greed['value']} ({fear_greed['label']})")

    sentiment = get_reddit_sentiment()
    if sentiment:
        print(f"  Reddit sentiment: {sentiment['sentiment_label']} ({sentiment['sentiment_score']})")

    news = get_crypto_news()
    print(f"  News headlines: {len(news)}")

    signals = generate_signals(prices, fear_greed, sentiment, news)
    print(f"  Signals generated: {len(signals)}")

    # Save output
    output = {
        "timestamp": datetime.now().isoformat(),
        "prices": prices,
        "fear_greed": fear_greed,
        "reddit_sentiment": sentiment,
        "news": news[:10],
        "signals": signals,
    }

    output_path = OUTPUT_DIR / "crypto-signals-latest.json"
    output_path.write_text(json.dumps(output, indent=2))
    print(f"  Output: {output_path}")

    return output


if __name__ == "__main__":
    run()
