// Render the review+development markdown into a clean web page, linked from the
// /pandamericano door so it's findable from the lobby room, not just the vault.
const fs = require('fs');
const path = require('path');
const SLUG = process.argv[2] || 'pandamericano';
const ROUTE = SLUG === 'pandamericano' ? '/pandamericano' : '/' + SLUG;
const MD = path.join(process.env.HOME, 'cathedral-vault', '06_Methods', `${SLUG}-review-and-development.md`);
const OUT = path.join(process.env.HOME, 'nanoclaw', `${SLUG}-review.html`);

let md = fs.readFileSync(MD, 'utf8').replace(/^---[\s\S]*?---\n/, ''); // strip frontmatter
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pandamericano — Review & Development</title>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<style>
*{box-sizing:border-box}body{font-family:'Inter',-apple-system,system-ui,sans-serif;background:#f6f7fa;color:#1a1d24;margin:0;padding:32px;line-height:1.62}
.wrap{max-width:820px;margin:0 auto;background:#fff;border:1px solid #e4e7ec;border-radius:14px;padding:40px 44px}
.back{display:inline-block;margin-bottom:18px;color:#0e9f6e;text-decoration:none;font-size:13px;font-weight:600}
.back:hover{text-decoration:underline}
h1{font-size:26px;font-weight:800;letter-spacing:-.5px;margin:.2em 0 .1em}
h2{font-size:19px;font-weight:700;margin:1.5em 0 .4em;padding-top:.6em;border-top:1px solid #eef0f4;color:#0b6e4a}
h3,strong{color:#1a1d24}
p,li{font-size:15px}ul{padding-left:22px}
code{background:#eef0f4;padding:1px 6px;border-radius:5px;font-size:13px}
blockquote{border-left:3px solid #0e9f6e;margin:0;padding:4px 16px;color:#475067;background:#f3faf6;border-radius:0 8px 8px 0}
em{color:#0b6e4a;font-style:normal;font-weight:600}
.foot{color:#8a93a6;font-size:11px;font-family:monospace;margin-top:30px;border-top:1px solid #eef0f4;padding-top:12px}
</style></head><body><div class="wrap">
<a class="back" href="${ROUTE}">← back to the framework</a>
<div id="content"></div>
<div class="foot">vault: 06_Methods/pandamericano-review-and-development.md · harvested from 88GB Cuban camp footage</div>
</div>
<script>document.getElementById('content').innerHTML = marked.parse(${JSON.stringify(md)});</script>
</body></html>`;
fs.writeFileSync(OUT, html);
console.log('WROTE ' + OUT);
