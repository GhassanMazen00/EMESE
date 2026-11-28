const { chromium } = require('playwright');
const [,, W, H, out, fps = '30', only] = process.argv;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: +W, height: +H } });
  await p.goto('http://localhost:8766/intro.html', { waitUntil: 'networkidle' });
  await p.evaluate(() => window.ready); await p.waitForTimeout(800);
  const fs = require('fs'); fs.mkdirSync(out, { recursive: true });
  const N = Math.round(33.5 * +fps);
  const frames = only ? only.split(',').map(Number).map(s => Math.round(s * +fps)) : [...Array(N).keys()];
  for (const f of frames) { await p.evaluate(t => window.render(t), f / +fps); await p.screenshot({ path: `${out}/${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 }); }
  await b.close();
})();
