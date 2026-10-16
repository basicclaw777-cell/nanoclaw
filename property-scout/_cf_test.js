const puppeteer = require('puppeteer');

const URL = 'https://www.28hse.com/buy/office/a2/dg123/housetype-industrail_building';

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--lang=zh-HK,zh',
    ],
    defaultViewport: { width: 1366, height: 900 },
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-HK,zh;q=0.9,en;q=0.8' });

  console.log('goto...');
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });

  // wait up to 30s for challenge to clear -> look for property cards
  let cards = 0;
  let title = '';
  for (let i = 0; i < 30; i++) {
    title = await page.title();
    cards = await page.$$eval('.item.property_item', els => els.length).catch(() => 0);
    if (cards > 0) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('title:', title);
  console.log('cards:', cards);

  // also try generic item class
  const anyItem = await page.$$eval('[class*="property_item"]', els => els.length).catch(() => 0);
  console.log('property_item class count:', anyItem);

  const bodyLen = (await page.content()).length;
  console.log('body length:', bodyLen);

  // dump a text snippet to confirm real content vs challenge
  const text = await page.evaluate(() => document.body.innerText.slice(0, 1200));
  console.log('---TEXT SNIPPET---');
  console.log(text);
  console.log('---END---');

  await browser.close();
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
