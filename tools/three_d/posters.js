// Stills of the hero's 3D products, so the page paints at once before three.js loads.
// Renders each with the real viewer (js/view3d.js) and the EMESE logo, on a transparent background.
//   python3 -m http.server 8765   (from the site root, in another terminal)
//   node tools/three_d/posters.js [polo hoodie ...]
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'assets', '3d', 'posters');
const SIZE = 900;

(async () => {
  const ids = process.argv.slice(2);
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: SIZE, height: SIZE } });
  p.on('pageerror', e => console.log('pageerror', e.message));
  await p.route('http://localhost:8765/__poster.html', r => r.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head>
    <script type="importmap">{"imports":{"three":"./vendor/three/three.module.min.js","three/addons/":"./vendor/three/addons/"}}</script>
    <style>html,body{margin:0;background:transparent}canvas{width:${SIZE}px;height:${SIZE}px;display:block}</style></head>
    <body><canvas id="c"></canvas></body></html>` }));
  await p.goto('http://localhost:8765/__poster.html');
  const shots = await p.evaluate(async (ids) => {
    const { View3D, loadModel } = await import('/js/view3d.js');
    const { designFromImage, fitPlace } = await import('/js/mockup.js');
    const { LOOKS } = await import('/js/hero3d.js');
    const img = new Image(); img.src = '/assets/logo.png'; await img.decode();
    const design = designFromImage(img);
    const v = new View3D(document.getElementById('c'));
    const out = [];
    for (const id of (ids.length ? ids : Object.keys(LOOKS))) {
      const prod = await loadModel(id);
      v.setProduct(prod);
      v.setDesign(design);
      const look = LOOKS[id];
      const pl = fitPlace(prod.meta, prod.meta.default, design.logoAspect);
      v.set({ tint: look.tint, mode: look.mode, ink: look.ink, u: pl.u, v: pl.v, w: pl.w, rot: 0, design: true });
      v.front();
      v.render();
      out.push({ id, url: v.canvas.toDataURL('image/webp', 0.9) });
    }
    return out;
  }, ids);
  for (const s of shots) {
    fs.writeFileSync(path.join(OUT, `${s.id}.webp`), Buffer.from(s.url.split(',')[1], 'base64'));
    console.log('poster', s.id, Math.round(fs.statSync(path.join(OUT, `${s.id}.webp`)).size / 1024), 'KB');
  }
  await b.close();
})();
