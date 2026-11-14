// LinkedIn company page images: logo (400 x 400) and cover (1128 x 191, exported at 2x).
//   node design/linkedin/src/images.js
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = path.resolve(__dirname, '..');
const font = (f) => 'data:font/ttf;base64,' + fs.readFileSync(path.join(ROOT, 'design', 'banner', 'fonts', f)).toString('base64');
const photo = (id) => 'data:image/webp;base64,' + fs.readFileSync(path.join(ROOT, 'assets', 'mockups', id, 'hero.webp')).toString('base64');
const HEAD = `<meta charset="utf-8"><style>
@font-face{font-family:A;font-weight:900;src:url(${font('Alexandria-Black.ttf')})}
@font-face{font-family:A;font-weight:600;src:url(${font('Alexandria-SemiBold.ttf')})}
@font-face{font-family:S;src:url(${font('DMSerifDisplay-Regular.ttf')})}
*{margin:0;padding:0;box-sizing:border-box}
.twill{background:#121212 repeating-linear-gradient(45deg,rgba(255,255,255,.05) 0 1px,transparent 1px 7px)}
.mark{font-family:S,serif;color:#fff;display:flex;align-items:baseline;direction:ltr}
.mark i{border-radius:50%;background:#e6007e;display:inline-block}
.cmy{display:flex;gap:4px}.cmy i{background:#00a3e0}.cmy i:nth-child(2){background:#e6007e}.cmy i:nth-child(3){background:#ffe500}
</style>`;

const LOGO = `<!doctype html><html><head>${HEAD}<style>
body{width:400px;height:400px;display:grid;place-items:center;position:relative}
.mark{font-size:92px;gap:6px}.mark i{width:18px;height:18px}
.cmy{position:absolute;bottom:58px;left:50%;transform:translateX(-50%)}.cmy i{width:16px;height:16px}
</style></head><body class="twill"><div class="mark">EMESE<i></i></div><div class="cmy"><i></i><i></i><i></i></div></body></html>`;

// the cover: LinkedIn puts the logo over its lower left, so the words sit right and products in the middle
const pics = ['cap', 'hoodie', 'mug', 'notebook'].map(id => `<img src="${photo(id)}">`).join('');
const COVER = `<!doctype html><html lang="ar" dir="rtl"><head>${HEAD}<style>
body{width:1128px;height:191px;display:flex;align-items:center;gap:30px;padding:0 44px 0 220px;overflow:hidden}
.words{display:flex;flex-direction:column;gap:8px;color:#fff;flex:none}
.words b{font:900 30px/1.25 A}.words b em{color:#e6007e;font-style:normal}
.words span{font:600 15px/1.4 A;color:#cfcac2}
.row{display:flex;gap:10px;direction:ltr;margin-inline-start:auto}
.row img{width:108px;height:148px;object-fit:cover;border-radius:14px}
</style></head><body class="twill">
<div class="words"><b>إنت تتخيّل، وإحنا ننفّذ<em>.</em></b><span>يونيفورمات، كابات وهدايا شركات باللوجو بتاعك</span>
<div class="cmy"><i style="width:12px;height:12px"></i><i style="width:12px;height:12px"></i><i style="width:12px;height:12px"></i></div></div>
<div class="row">${pics}</div></body></html>`;

(async () => {
  const b = await chromium.launch();
  let p = await b.newPage({ viewport: { width: 400, height: 400 } });
  await p.setContent(LOGO); await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(OUT, 'emese-linkedin-logo.png') });
  p = await b.newPage({ viewport: { width: 1128, height: 191 }, deviceScaleFactor: 2 });
  await p.setContent(COVER); await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(OUT, 'emese-linkedin-cover.png') });
  await b.close();
  console.log('logo 400x400, cover 2256x382');
})();
