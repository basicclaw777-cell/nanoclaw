from playwright.sync_api import sync_playwright
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
url = "https://www.28hse.com/buy/office/a2/dg123/housetype-industrail_building"
with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=False)
    ctx = browser.new_context(user_agent=UA, viewport={"width":1366,"height":900}, locale="zh-HK", timezone_id="Asia/Hong_Kong")
    page = ctx.new_page()
    page.goto(url, timeout=60000, wait_until="domcontentloaded")
    page.wait_for_timeout(6000)
    print("TITLE:", page.title())
    print("URL:", page.url)
    body = page.inner_text("body")
    print("LEN:", len(body))
    print("PREVIEW:", body[:600].replace("\n"," | "))
    cards = page.locator("div.item.property_item")
    print("CARDS:", cards.count())
    browser.close()
