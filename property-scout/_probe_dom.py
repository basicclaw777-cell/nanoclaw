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
        html = page.content()
        # find first occurrence of a listing link (property-#####)
        import re
        m = re.search(r'href="(/buy/office/[^"]*property-\d+[^"]*)"', html)
        print("first listing href:", m.group(1) if m else None)
        # find the anchor text and its container classes: locate via text
        cards = page.locator("a[href*='property-']")
        print("property- links count:", cards.count())
        # print outerHTML of first 2 property links' closest card (go up to a container)
        for i in range(min(2, cards.count())):
            el = cards.nth(i)
            # walk up to find a container with several children
            info = el.evaluate("""(el) => {
                let chain = [];
                let node = el;
                for (let k=0; k<6 && node; k++){
                    chain.push({tag: node.tagName, cls: node.className, id: node.id});
                    node = node.parentElement;
                }
                return chain;
            }""")
            print(f"\n=== card {i} ancestor chain ===")
            for c in info:
                print("  ", c)
            # print the card's text
            try:
                txt = el.evaluate("(el) => { let p=el.closest('div'); return p ? p.innerText : el.innerText }")
                print("  TEXT:", (txt or "")[:400].replace("\n"," | "))
            except Exception as e:
                print("  err", e)
    except Exception as e:
        print("ERROR:", type(e).__name__, str(e)[:500])
    finally:
        browser.close()
