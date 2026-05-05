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
    """Process raw data into actionable signals."""
    signals = []

    # Price-based signals
    for symbol, data in prices.items():
        change = data.get("change_24h", 0)

        # Oversold bounce signal
        if change and change < -10:
            signals.append({
                "source": "technical",
                "asset": symbol,
                "direction": "long",
                "strength": min(abs(change) / 20, 1.0),
                "reasoning": f"{symbol} down {change:.1f}% in 24h — potential oversold bounce",
                "type": "mean_reversion",
            })

        # Momentum signal
        if change and change > 8:
            signals.append({
                "source": "technical",
                "asset": symbol,
                "direction": "long",
                "strength": min(change / 15, 1.0),
                "reasoning": f"{symbol} up {change:.1f}% in 24h — momentum continuation",
                "type": "momentum",
            })

    # Fear & Greed signal
    if fear_greed:
        if fear_greed["value"] < 25:  # Extreme fear
            signals.append({
                "source": "sentiment",
                "asset": "MARKET",
                "direction": "long",
                "strength": (25 - fear_greed["value"]) / 25,
                "reasoning": f"Fear & Greed at {fear_greed['value']} ({fear_greed['label']}) — contrarian buy zone",
                "type": "contrarian",
            })
        elif fear_greed["value"] > 75:  # Extreme greed
            signals.append({
                "source": "sentiment",
                "asset": "MARKET",
                "direction": "short",
                "strength": (fear_greed["value"] - 75) / 25,
                "reasoning": f"Fear & Greed at {fear_greed['value']} ({fear_greed['label']}) — contrarian caution zone",
                "type": "contrarian",
            })

    # Reddit sentiment signal
    if sentiment and sentiment.get("sentiment_score"):
        score = sentiment["sentiment_score"]
        if abs(score) > 0.3:
            # Strong consensus = contrarian signal (when everyone agrees, be careful)
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
