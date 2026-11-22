// The link preview image (assets/og.jpg, 1200 x 630): shown when emese-eg.com is shared on WhatsApp, Facebook, LinkedIn.
//   node design/social/src/og.js
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const font = (f) => 'data:font/ttf;base64,' + fs.readFileSync(path.join(ROOT, 'design', 'banner', 'fonts', f)).toString('base64');
const photo = (id) => 'data:image/webp;base64,' + fs.readFileSync(path.join(ROOT, 'assets', 'mockups', id, 'hero.webp')).toString('base64');
const HTML = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
@font-face{font-family:A;font-weight:900;src:url(${font('Alexandria-Black.ttf')})}
@font-face{font-family:A;font-weight:600;src:url(${font('Alexandria-SemiBold.ttf')})}
@font-face{font-family:S;src:url(${font('DMSerifDisplay-Regular.ttf')})}
*{margin:0;padding:0;box-sizing:border-box}
body{width:1200px;height:630px;display:grid;grid-template-columns:1fr 560px;gap:40px;padding:56px;color:#fff;font-family:A;
  background:#121212 repeating-linear-gradient(45deg,rgba(255,255,255,.045) 0 1px,transparent 1px 7px)}
.copy{display:flex;flex-direction:column;justify-content:space-between}
.mark{font:400 56px/1 S,serif;direction:ltr;align-self:flex-end;display:flex;align-items:baseline;gap:5px}
.mark i{width:12px;height:12px;border-radius:50%;background:#e6007e}
h1{font:900 64px/1.3 A}h1 b{color:#e6007e}
p{font:600 24px/1.5 A;color:#cfcac2}
.url{font:600 24px/1 A;direction:ltr;align-self:flex-end;background:#fff;color:#111;padding:14px 22px;border-radius:999px}
.grid{display:grid;grid-template-columns:1.3fr 1fr;grid-template-rows:1fr 1fr;gap:12px;direction:ltr}
.grid img{width:100%;height:100%;object-fit:cover;border-radius:22px}.grid img:first-child{grid-row:1/span 2}
</style></head><body>
<div class="copy"><div class="mark">EMESE<i></i></div>
<div><h1>إنت تتخيّل،<br>وإحنا ننفّذ<b>.</b></h1><p>يونيفورمات، كابات وهدايا شركات باللوجو بتاعك</p></div>
<span class="url">emese-eg.com</span></div>
<div class="grid"><img src="${photo('polo')}"><img src="${photo('cap')}"><img src="${photo('mug')}"></div>
</body></html>`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.setContent(HTML); await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(ROOT, 'assets', 'og.jpg'), type: 'jpeg', quality: 88 });
  await b.close();
  console.log('assets/og.jpg', Math.round(fs.statSync(path.join(ROOT, 'assets', 'og.jpg')).size / 1024), 'KB');
})();
