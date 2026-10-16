from playwright.sync_api import sync_playwright

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    ctx = browser.new_context(user_agent=UA, viewport={"width": 1366, "height": 900},
                              locale="zh-HK", timezone_id="Asia/Hong_Kong")
    page = ctx.new_page()
    try:
        page.goto("https://www.28hse.com/buy/office", timeout=40000, wait_until="domcontentloaded")
        page.wait_for_timeout(5000)
        print("URL:", page.url)
        print("TITLE:", page.title())
        print("\n=== OFFICE/DISTRICT LINKS ===")
        links = page.eval_on_selector_all(
            "a", "els => els.map(e => ({t:(e.innerText||'').trim(), h:e.href}))")
        seen = set()
        for l in links:
            t, h = l["t"], l.get("h","")
            if not t and "office" in h:
                t = h
            # district filters often contain /office/a### or district text
            if "/buy/office" in h or "/rent/office" in h:
                key = (t, h)
                if key not in seen and t:
                    seen.add(key)
                    print(f"  {t[:40]:42} -> {h[:120]}")
        print("\n=== RESULTS TEXT (first 3500) ===")
        body = page.inner_text("body")
        idx = body.find("工商")
        print(body[:3500].replace("\n", " | ")[:3500])
    except Exception as e:
        print("ERROR:", type(e).__name__, str(e)[:500])
    finally:
        browser.close()
