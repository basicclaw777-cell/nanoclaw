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
        print("URL:", page.url)
        print("TITLE:", page.title())
        # candidate listing card containers
        for sel in ["div.search_ls_contain", "div.listing-container", "li.search_list",
                    "div[class*='ls_']", "div[class*='listing']", "div[class*='item']"]:
            n = page.locator(sel).count()
            print(f"selector {sel!r}: {n} nodes")
        # dump first 2 card outerHTML (truncated) to learn structure
        cards = page.locator("div[class*='ls']")
        print("\n=== div[class*=ls] count:", cards.count())
        # generic: dump results region text
        body = page.inner_text("body")
        # find the region after '工商' heading / search results
        print("\n=== BODY (search result region, chars 2000-7000) ===")
        print(body[2000:7000].replace("\n", " | "))
    except Exception as e:
        print("ERROR:", type(e).__name__, str(e)[:500])
    finally:
        browser.close()
