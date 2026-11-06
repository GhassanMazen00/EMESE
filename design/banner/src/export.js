// EMESE banner: PNG and PDF files from the SVGs that build.py writes.
//   node design/banner/src/export.js
// PNG: 300 x 100 px and 2x, 3x, 10x of it. PDF: vector, 300 x 100 cm, ready for a print shop.
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const W = 300, H = 100;
const SCALES = [1, 2, 3, 10];

(async () => {
  const browser = await chromium.launch();
  for (const dir of [ROOT, path.join(ROOT, 'light')]) {
    const svg = fs.readFileSync(path.join(dir, 'emese-banner.svg'), 'utf8').replace(/<\?xml[^>]*>\s*/, '');
    const page = (scale) => `<!doctype html><html><head><meta charset="utf-8"><title>ايميز لتجارة الملابس</title>
      <style>@page{size:300cm 100cm;margin:0}html,body{margin:0;width:100%;height:100%;overflow:hidden}svg{display:block;width:100%;height:100%}</style>
      </head><body>${svg.replace(/width="\d+" height="\d+"/, '')}</body></html>`;
    for (const s of SCALES) {
      const p = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: s });
      await p.setContent(page(s));
      await p.screenshot({ path: path.join(dir, `emese-banner-${W * s}x${H * s}.png`) });
      await p.close();
    }
    const p = await browser.newPage();
    await p.setContent(page(1));
    await p.pdf({ path: path.join(dir, 'emese-banner-300x100cm.pdf'), width: '300cm', height: '100cm', printBackground: true,
                  margin: { top: 0, right: 0, bottom: 0, left: 0 }, pageRanges: '1' });
    await p.close();
    console.log('exported', path.relative(ROOT, dir) || '.');
  }
  await browser.close();
})();
