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
    "ARB": "arbitrum", "DOGE": "dogecoin", "ADA": "cardano",
    "ATOM": "cosmos", "UNI": "uniswap",
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


def get_funding_rates():
    """Get perpetual futures funding rates from CoinGecko derivatives."""
    try:
        url = f"{COINGECKO_BASE}/derivatives?order=open_interest_btc_desc"
        req = urllib.request.Request(url, headers={"User-Agent": "CathedralTrader/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())

        rates = {}
        for d in data[:20]:
            symbol = d.get("symbol", "").upper()
            for coin in COIN_IDS:
                if coin in symbol and "PERPETUAL" in symbol.upper():
                    rate = d.get("funding_rate")
                    if rate is not None:
                        rates[coin] = float(rate)
                    break
        return rates
    except Exception as e:
        print(f"  Funding rates error: {e}")
        return {}


def get_whale_alerts():
    """Check for large BTC/ETH transactions via blockchain.info mempool."""
    alerts = []
    try:
        # BTC mempool - check for large unconfirmed txs
        url = "https://blockchain.info/unconfirmed-transactions?format=json"
        req = urllib.request.Request(url, headers={"User-Agent": "CathedralTrader/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())

        large_txs = []
        for tx in data.get("txs", [])[:50]:
            total_out = sum(o.get("value", 0) for o in tx.get("out", [])) / 1e8  # satoshi to BTC
            if total_out > 50:  # >50 BTC = whale
                large_txs.append(total_out)

        if large_txs:
            alerts.append({
                "asset": "BTC",
                "large_tx_count": len(large_txs),
                "total_btc": sum(large_txs),
                "avg_size": sum(large_txs) / len(large_txs),
            })
    except Exception as e:
        print(f"  Whale alerts error: {e}")

    return alerts


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


def get_liquidation_levels():
    """Get liquidation heatmap data from CoinGlass public API.
    Shows where leveraged positions will cascade-liquidate."""
    levels = {}
    try:
        url = "https://open-api.coinglass.com/public/v2/liquidation/info?symbol=BTC&timeType=1"
        req = urllib.request.Request(url, headers={
            "User-Agent": "CathedralTrader/1.0",
            "Accept": "application/json",
        })
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())

        if data.get("data"):
            d = data["data"]
            levels["BTC"] = {
                "long_liq_usd": d.get("longLiqUsd", 0),
                "short_liq_usd": d.get("shortLiqUsd", 0),
                "long_ratio": d.get("longRate", 50),
                "short_ratio": d.get("shortRate", 50),
            }
    except Exception as e:
        print(f"  CoinGlass liquidation error: {e}")

    # Fallback: Deribit public API for options open interest (shows where hedges cluster)
    try:
        url = "https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=future"
        req = urllib.request.Request(url, headers={"User-Agent": "CathedralTrader/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())

        for item in data.get("result", []):
            oi = item.get("open_interest", 0)
            mark = item.get("mark_price", 0)
            if oi > 0 and mark > 0 and "PERPETUAL" in item.get("instrument_name", ""):
                if "BTC" not in levels:
                    levels["BTC"] = {}
                levels["BTC"]["perp_open_interest"] = oi
                levels["BTC"]["perp_mark_price"] = mark
                levels["BTC"]["perp_funding"] = item.get("funding_8h", 0)
    except Exception as e:
        print(f"  Deribit futures error: {e}")

    return levels


def get_exchange_reserves():
    """Track exchange reserve flows — coins moving on/off exchanges.
    On-exchange = selling pressure. Off-exchange = accumulation.
    Uses CryptoQuant-equivalent public data from CoinGlass."""
    reserves = {}
    try:
        # CoinGlass exchange balance (public endpoint)
        url = "https://open-api.coinglass.com/public/v2/index/bitcoin-exchange-balance"
        req = urllib.request.Request(url, headers={
            "User-Agent": "CathedralTrader/1.0",
            "Accept": "application/json",
        })
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())

        if data.get("data"):
            d = data["data"]
            reserves["BTC"] = {
                "exchange_balance": d.get("balance", 0),
                "change_24h": d.get("change24h", 0),
                "change_7d": d.get("change7d", 0),
            }
    except Exception as e:
        print(f"  Exchange reserves error: {e}")

    # Fallback: Glassnode-style via blockchain.info
    try:
        # Known exchange addresses total balance proxy
        url = "https://blockchain.info/q/totalbc"
        req = urllib.request.Request(url, headers={"User-Agent": "CathedralTrader/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            total_btc = int(resp.read()) / 1e8
        if "BTC" not in reserves:
            reserves["BTC"] = {}
        reserves["BTC"]["total_supply"] = total_btc
    except Exception as e:
        print(f"  Blockchain.info total supply error: {e}")

    return reserves


def get_stablecoin_flows():
    """Track stablecoin supply changes. Minting = new money entering.
    Burning = money leaving. Uses DefiLlama (free, no key)."""
    flows = {}
    try:
        url = "https://stablecoins.llama.fi/stablecoins?includePrices=true"
        req = urllib.request.Request(url, headers={"User-Agent": "CathedralTrader/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())

        for coin in data.get("peggedAssets", []):
            symbol = coin.get("symbol", "")
            if symbol in ("USDT", "USDC", "DAI", "BUSD"):
                circ = coin.get("circulating", {})
                peg_usd = circ.get("peggedUSD", 0) if isinstance(circ, dict) else 0
                flows[symbol] = {
                    "circulating": peg_usd,
                    "name": coin.get("name", symbol),
                }

        # Get 7d change from chains data
        for coin in data.get("peggedAssets", []):
            symbol = coin.get("symbol", "")
            if symbol in flows:
                chain_circ = coin.get("chainCirculating", {})
                # Sum across all chains
                total_now = 0
                for chain_data in chain_circ.values():
                    if isinstance(chain_data, dict):
                        current = chain_data.get("current", {})
                        if isinstance(current, dict):
                            total_now += current.get("peggedUSD", 0)
                if total_now > 0:
                    flows[symbol]["chain_total"] = total_now

    except Exception as e:
        print(f"  Stablecoin flows error: {e}")

    return flows


def get_options_flow():
    """Get options market data from Deribit (largest crypto options exchange).
    Put/Call ratio reveals institutional hedging. Free public API."""
    options = {}
    try:
        # BTC options
        url = "https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=option"
        req = urllib.request.Request(url, headers={"User-Agent": "CathedralTrader/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())

        calls_oi = 0
        puts_oi = 0
        calls_vol = 0
        puts_vol = 0
        max_oi_strike = 0
        max_oi = 0

        for item in data.get("result", []):
            name = item.get("instrument_name", "")
            oi = item.get("open_interest", 0)
            vol = item.get("volume", 0)

            if "-C" in name:  # Call
                calls_oi += oi
                calls_vol += vol
            elif "-P" in name:  # Put
                puts_oi += oi
                puts_vol += vol

            if oi > max_oi:
                max_oi = oi
                max_oi_strike = name

        total_oi = calls_oi + puts_oi
        if total_oi > 0:
            options["BTC"] = {
                "put_call_ratio": round(puts_oi / max(calls_oi, 1), 3),
                "calls_oi": calls_oi,
                "puts_oi": puts_oi,
                "calls_volume": calls_vol,
                "puts_volume": puts_vol,
                "total_oi": total_oi,
                "max_oi_strike": max_oi_strike,
                "max_oi": max_oi,
            }

        # ETH options
        url_eth = "https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=ETH&kind=option"
        req_eth = urllib.request.Request(url_eth, headers={"User-Agent": "CathedralTrader/1.0"})
        with urllib.request.urlopen(req_eth, timeout=10) as resp:
            data_eth = json.loads(resp.read())

        eth_calls = 0
        eth_puts = 0
        for item in data_eth.get("result", []):
            name = item.get("instrument_name", "")
            oi = item.get("open_interest", 0)
            if "-C" in name:
                eth_calls += oi
            elif "-P" in name:
                eth_puts += oi

        if eth_calls + eth_puts > 0:
            options["ETH"] = {
                "put_call_ratio": round(eth_puts / max(eth_calls, 1), 3),
                "calls_oi": eth_calls,
                "puts_oi": eth_puts,
                "total_oi": eth_calls + eth_puts,
            }

    except Exception as e:
        print(f"  Options flow error: {e}")

    return options


def get_github_activity():
    """Track developer activity on major crypto repos.
    Dev activity predicts price 3-6 months out. Free GitHub API."""
    activity = {}
    repos = {
        "BTC": "bitcoin/bitcoin",
        "ETH": "ethereum/go-ethereum",
        "SOL": "anza-xyz/agave",
        "DOT": "paritytech/polkadot-sdk",
        "ATOM": "cosmos/cosmos-sdk",
        "AVAX": "ava-labs/avalanchego",
        "ADA": "IntersectMBO/cardano-node",
        "ARB": "OffchainLabs/nitro",
        "UNI": "Uniswap/v3-core",
        "LINK": "smartcontractkit/chainlink",
    }

    for symbol, repo in repos.items():
        try:
            url = f"https://api.github.com/repos/{repo}/commits?per_page=1"
            req = urllib.request.Request(url, headers={
                "User-Agent": "CathedralTrader/1.0",
                "Accept": "application/vnd.github.v3+json",
            })
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read())
                # Get commit count from Link header (total pages = total commits proxy)
                link = resp.headers.get("Link", "")

            if data and len(data) > 0:
                last_commit = data[0].get("commit", {}).get("committer", {}).get("date", "")
                activity[symbol] = {
                    "repo": repo,
                    "last_commit": last_commit,
                    "days_since_commit": 0,
                }
                if last_commit:
                    try:
                        lc = datetime.fromisoformat(last_commit.replace("Z", "+00:00"))
                        delta = datetime.now(lc.tzinfo) - lc
                        activity[symbol]["days_since_commit"] = delta.days
                    except:
                        pass

            # Rate limit: GitHub allows 60/hr unauthenticated
            import time
            time.sleep(0.5)

        except Exception as e:
            # Don't spam errors for rate limits
            if "403" in str(e):
                print(f"  GitHub rate limited at {symbol}")
                break
            continue

    return activity


def generate_onchain_signals(prices, funding_rates, whale_alerts):
    """Generate signals from on-chain data: funding rates and whale movements."""
    signals = []

    # Funding rate signals: extreme funding = contrarian
    for symbol, rate in funding_rates.items():
        if symbol not in prices:
            continue
        # Very positive funding (>0.05%) = market overleveraged long, lean short
        if rate > 0.0005:
            signals.append({
                "source": "onchain",
                "asset": symbol,
                "direction": "short",
                "strength": min(rate * 1000, 0.85),
                "reasoning": f"{symbol} funding rate {rate*100:.3f}% — overleveraged longs, liquidation cascade risk",
                "type": "funding_rate",
            })
        # Very negative funding (<-0.03%) = shorts paying, lean long
        elif rate < -0.0003:
            signals.append({
                "source": "onchain",
                "asset": symbol,
                "direction": "long",
                "strength": min(abs(rate) * 1000, 0.85),
                "reasoning": f"{symbol} funding rate {rate*100:.3f}% — shorts paying, squeeze potential",
                "type": "funding_rate",
            })

    # Whale movement signals
    for alert in whale_alerts:
        sym = alert["asset"]
        if sym not in prices:
            continue
        if alert["large_tx_count"] >= 5:
            # Many large transactions = big players moving — volatility incoming
            signals.append({
                "source": "onchain",
                "asset": sym,
                "direction": "long",  # whales accumulating is usually bullish
                "strength": min(alert["large_tx_count"] / 15, 0.8),
                "reasoning": f"{sym} whale activity: {alert['large_tx_count']} large txs ({alert['total_btc']:.0f} BTC total). Smart money moving.",
                "type": "onchain_whale",
            })

    return signals


def generate_deep_signals(prices, liquidation_levels, exchange_reserves, stablecoin_flows, options_flow, github_activity):
    """Generate signals from deep/alternative data sources.
    The financial equivalent of Cathedral's hidden knowledge extraction."""
    signals = []

    # ── Liquidation levels: price gets pulled to liquidation clusters ──
    for symbol, liq in liquidation_levels.items():
        if symbol not in prices:
            continue
        long_liq = liq.get("long_liq_usd", 0)
        short_liq = liq.get("short_liq_usd", 0)
        if long_liq > 0 and short_liq > 0:
            ratio = long_liq / max(short_liq, 1)
            if ratio > 1.5:
                # More long liquidations pending = price likely to dip to trigger them
                signals.append({
                    "source": "deep_data",
                    "asset": symbol,
                    "direction": "short",
                    "strength": min(ratio / 3, 0.85),
                    "reasoning": f"{symbol} long liquidations ${long_liq/1e6:.0f}M vs short ${short_liq/1e6:.0f}M — price pulled toward long liquidation cascade",
                    "type": "liquidation_magnet",
                })
            elif ratio < 0.67:
                signals.append({
                    "source": "deep_data",
                    "asset": symbol,
                    "direction": "long",
                    "strength": min(1/max(ratio,0.1) / 3, 0.85),
                    "reasoning": f"{symbol} short liquidations ${short_liq/1e6:.0f}M vs long ${long_liq/1e6:.0f}M — price pulled toward short squeeze",
                    "type": "liquidation_magnet",
                })

        # Deribit perpetual funding (8h rate, more granular than CoinGecko)
        perp_funding = liq.get("perp_funding", 0)
        if perp_funding and abs(perp_funding) > 0.0001:
            direction = "short" if perp_funding > 0 else "long"
            signals.append({
                "source": "deep_data",
                "asset": symbol,
                "direction": direction,
                "strength": min(abs(perp_funding) * 5000, 0.7),
                "reasoning": f"{symbol} Deribit 8h funding {perp_funding*100:.4f}% — {'longs paying, overleveraged' if perp_funding > 0 else 'shorts paying, squeeze building'}",
                "type": "deribit_funding",
            })

    # ── Exchange reserves: off-exchange = accumulation ──
    for symbol, res in exchange_reserves.items():
        if symbol not in prices:
            continue
        change_24h = res.get("change_24h", 0)
        change_7d = res.get("change_7d", 0)
        if change_24h != 0:
            # Negative change = coins leaving exchanges = bullish (accumulation)
            if change_24h < -0.5:  # >0.5% outflow
                signals.append({
                    "source": "deep_data",
                    "asset": symbol,
                    "direction": "long",
                    "strength": min(abs(change_24h) / 3, 0.8),
                    "reasoning": f"{symbol} exchange reserves down {change_24h:.1f}% in 24h — coins moving to cold storage, accumulation signal",
                    "type": "exchange_flow",
                })
            elif change_24h > 0.5:  # >0.5% inflow
                signals.append({
                    "source": "deep_data",
                    "asset": symbol,
                    "direction": "short",
                    "strength": min(change_24h / 3, 0.8),
                    "reasoning": f"{symbol} exchange reserves up {change_24h:.1f}% in 24h — coins moving to exchanges, selling pressure",
                    "type": "exchange_flow",
                })

    # ── Stablecoin flows: minting = new money entering crypto ──
    total_stable = sum(f.get("circulating", 0) for f in stablecoin_flows.values())
    usdt = stablecoin_flows.get("USDT", {})
    usdc = stablecoin_flows.get("USDC", {})
    if total_stable > 0:
        # Compare chain_total to circulating for minting/burning signal
        for name, flow in stablecoin_flows.items():
            chain = flow.get("chain_total", 0)
            circ = flow.get("circulating", 0)
            if chain > 0 and circ > 0:
                delta_pct = ((chain - circ) / circ) * 100
                if abs(delta_pct) > 0.1:
                    signals.append({
                        "source": "deep_data",
                        "asset": "MARKET",
                        "direction": "long" if delta_pct > 0 else "short",
                        "strength": min(abs(delta_pct) / 2, 0.7),
                        "reasoning": f"{name} supply {'expanding' if delta_pct > 0 else 'contracting'} ({delta_pct:+.2f}%) — {'new money entering' if delta_pct > 0 else 'capital leaving'} crypto",
                        "type": "stablecoin_flow",
                    })

    # ── Options flow: Put/Call ratio reveals institutional hedging ──
    for symbol, opts in options_flow.items():
        if symbol not in prices:
            continue
        pcr = opts.get("put_call_ratio", 1.0)
        if pcr > 1.2:
            # High put/call = heavy hedging = contrarian bullish (institutions protecting, often at bottoms)
            signals.append({
                "source": "deep_data",
                "asset": symbol,
                "direction": "long",
                "strength": min((pcr - 1.0) / 1.5, 0.8),
                "reasoning": f"{symbol} put/call ratio {pcr:.2f} — heavy put buying, institutions hedging. Contrarian bullish (extreme hedging often marks bottoms)",
                "type": "options_flow",
            })
        elif pcr < 0.6:
            # Low put/call = complacency = contrarian bearish
            signals.append({
                "source": "deep_data",
                "asset": symbol,
                "direction": "short",
                "strength": min((1.0 - pcr) / 1.0, 0.8),
                "reasoning": f"{symbol} put/call ratio {pcr:.2f} — extreme call dominance, complacency. Contrarian bearish (no one hedging = top signal)",
                "type": "options_flow",
            })

        # Max pain / biggest OI strike
        max_strike = opts.get("max_oi_strike", "")
        if max_strike and opts.get("max_oi", 0) > 100:
            signals.append({
                "source": "deep_data",
                "asset": symbol,
                "direction": "neutral",
                "strength": 0.4,
                "reasoning": f"{symbol} max options OI at {max_strike} ({opts['max_oi']:.0f} contracts) — price gravitates here at expiry",
                "type": "options_magnet",
            })

    # ── GitHub dev activity: dead repos = dead coins ──
    for symbol, dev in github_activity.items():
        if symbol not in prices:
            continue
        days = dev.get("days_since_commit", 0)
        if days > 30:
            signals.append({
                "source": "deep_data",
                "asset": symbol,
                "direction": "short",
                "strength": min(days / 90, 0.7),
                "reasoning": f"{symbol} last GitHub commit {days}d ago ({dev['repo']}) — development stalling, fundamental weakness",
                "type": "dev_activity",
            })
        elif days <= 1:
            signals.append({
                "source": "deep_data",
                "asset": symbol,
                "direction": "long",
                "strength": 0.3,
                "reasoning": f"{symbol} active development — commit today on {dev['repo']}",
                "type": "dev_activity",
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

    funding_rates = get_funding_rates()
    if funding_rates:
        print(f"  Funding rates: {len(funding_rates)} coins")

    whale_alerts = get_whale_alerts()
    if whale_alerts:
        print(f"  Whale alerts: {sum(a['large_tx_count'] for a in whale_alerts)} large txs")

    # Deep data sources — the Cathedral's financial intelligence layer
    print("[crypto-signals] Deep data sources...")

    liquidation_levels = get_liquidation_levels()
    if liquidation_levels:
        print(f"  Liquidation levels: {len(liquidation_levels)} assets")

    exchange_reserves = get_exchange_reserves()
    if exchange_reserves:
        print(f"  Exchange reserves: {len(exchange_reserves)} assets")

    stablecoin_flows = get_stablecoin_flows()
    if stablecoin_flows:
        print(f"  Stablecoin flows: {len(stablecoin_flows)} coins ({', '.join(stablecoin_flows.keys())})")

    options_flow = get_options_flow()
    if options_flow:
        for sym, opts in options_flow.items():
            print(f"  Options {sym}: P/C ratio {opts.get('put_call_ratio', '?')}, OI {opts.get('total_oi', 0):.0f}")

    github_activity = get_github_activity()
    if github_activity:
        active = sum(1 for v in github_activity.values() if v.get("days_since_commit", 99) <= 7)
        print(f"  GitHub: {len(github_activity)} repos tracked, {active} active this week")

    signals = generate_signals(prices, fear_greed, sentiment, news)

    # On-chain signals
    onchain = generate_onchain_signals(prices, funding_rates, whale_alerts)
    signals.extend(onchain)
    print(f"  On-chain signals: {len(onchain)}")

    # Deep signals
    deep = generate_deep_signals(prices, liquidation_levels, exchange_reserves, stablecoin_flows, options_flow, github_activity)
    signals.extend(deep)
    print(f"  Deep data signals: {len(deep)}")

    print(f"  Total signals generated: {len(signals)}")

    # Save output
    output = {
        "timestamp": datetime.now().isoformat(),
        "prices": prices,
        "fear_greed": fear_greed,
        "reddit_sentiment": sentiment,
        "news": news[:10],
        "signals": signals,
        "deep_data": {
            "liquidation_levels": liquidation_levels,
            "exchange_reserves": exchange_reserves,
            "stablecoin_flows": stablecoin_flows,
            "options_flow": options_flow,
            "github_activity": github_activity,
        },
    }

    output_path = OUTPUT_DIR / "crypto-signals-latest.json"
    output_path.write_text(json.dumps(output, indent=2))
    print(f"  Output: {output_path}")

    return output


if __name__ == "__main__":
    run()
