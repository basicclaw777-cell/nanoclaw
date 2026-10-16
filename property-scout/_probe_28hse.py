from playwright.sync_api import sync_playwright

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    ctx = browser.new_context(user_agent=UA, viewport={"width": 1366, "height": 900},
                              locale="zh-HK", timezone_id="Asia/Hong_Kong")
    page = ctx.new_page()
    try:
        page.goto("https://www.28hse.com/", timeout=30000, wait_until="domcontentloaded")
        page.wait_for_timeout(4000)
        print("TITLE:", page.title())
        print("URL:", page.url)
        body = page.inner_text("body")[:800]
        print("BODY_PREVIEW:", body.replace("\n", " | ")[:800])
        links = page.eval_on_selector_all(
            "a", "els => els.map(e => ({t: (e.innerText||'').trim().slice(0,40), h: e.href}))")
        seen = set()
        for l in links:
            h = l.get("h", "")
            if h and any(k in h for k in ("buy", "rent", "industrial", "office", "commercial", "工")):
                key = (l["t"], h)
                if key not in seen:
                    seen.add(key)
                    print(f"  {l['t'][:30]:32} -> {h}")
    except Exception as e:
        print("ERROR:", type(e).__name__, str(e)[:500])
    finally:
        browser.close()
