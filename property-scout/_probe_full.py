from playwright.sync_api import sync_playwright

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

URL = "https://www.28hse.com/buy/office/a2/dg21/housetype-industrail_building"

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    ctx = browser.new_context(user_agent=UA, viewport={"width": 1366, "height": 900},
                              locale="zh-HK", timezone_id="Asia/Hong_Kong")
    page = ctx.new_page()
    try:
        page.goto(URL, timeout=40000, wait_until="domcontentloaded")
        page.wait_for_timeout(5000)
        cards = page.locator("div.item.property_item")
        print("total cards:", cards.count())
        for i in range(min(5, cards.count())):
            c = cards.nth(i)
            txt = c.inner_text()
            href = ""
            try:
                href = c.locator("a.detail_page").first.get_attribute("href")
            except Exception:
                pass
            has_img = c.locator("div.image img").count() > 0
            print(f"\n===== CARD {i} (img={has_img}) =====")
            print("HREF:", href)
            print("TEXT:")
            print(txt)
    except Exception as e:
        print("ERROR:", type(e).__name__, str(e)[:500])
    finally:
        browser.close()
