// The homepage and card photos from the AI product photos: the EMESE logo made on each with its real
// technique (js/photoprint.js), then framed with a little more backdrop around the product.
//   python3 -m http.server 8765        (from the site root, in another terminal)
//   node tools/ai_photos/display.js [polo ...]
// In: tools/ai_photos/<id>.webp|png|jpg and its entry in specs.json.
// Out: assets/mockups/<id>/hero.webp (960) and card.webp (640).
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const HERE = __dirname, ROOT = path.resolve(HERE, '..', '..');
const specs = JSON.parse(fs.readFileSync(path.join(HERE, 'specs.json'), 'utf8'));
const find = (id) => ['webp', 'png', 'jpg', 'jpeg'].map(e => path.join(HERE, `${id}.${e}`)).find(f => fs.existsSync(f));
const mime = (f) => f.endsWith('.png') ? 'image/png' : f.endsWith('.webp') ? 'image/webp' : 'image/jpeg';

(async () => {
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(specs);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('pageerror', e.message));
  await p.goto('http://localhost:8765/bulk.html');
  for (const id of ids) {
    const file = find(id), spec = specs[id];
    if (!file || !spec) { console.log('skip', id); continue; }
    const data = `data:${mime(file)};base64,` + fs.readFileSync(file).toString('base64');
    const url = await p.evaluate(async ({ data, spec }) => {
      const { PhotoPrint, thicken, upscale } = await import('/js/photoprint.js');
      const { designFromImage } = await import('/js/mockup.js');
      const li = new Image(); li.src = '/assets/logo.png'; await li.decode();
      const ph = new Image(); ph.src = data; await ph.decode();
      const pp = new PhotoPrint();
      pp.setPhoto(upscale(ph, 2), spec);
      const d = designFromImage(li);
      pp.setDesign(spec.thicken ? thicken(d, spec.thicken) : d);
      pp.render();
      const o = document.createElement('canvas'); o.width = ph.naturalWidth; o.height = ph.naturalHeight;
      const x = o.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(pp.canvas, 0, 0, o.width, o.height);
      return o.toDataURL('image/png');
    }, { data, spec });
    const tmp = path.join(ROOT, 'assets', 'mockups', id, '_ai.png');
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    fs.writeFileSync(tmp, Buffer.from(url.split(',')[1], 'base64'));
    // frame: extend the backdrop by `pad` on every side (edge colours, softly blurred), then export
    execFileSync('python3', ['-c', `
import numpy as np
from PIL import Image, ImageFilter
im = Image.open(r'${tmp}').convert('RGB'); w, h = im.size; s = max(w, h)
pad = int(s * ${spec.pad || 0})
a = np.pad(np.asarray(im), ((pad + (s - h) // 2, pad + (s - h + 1) // 2), (pad + (s - w) // 2, pad + (s - w + 1) // 2), (0, 0)), mode='edge')
big = Image.fromarray(a); soft = big.filter(ImageFilter.GaussianBlur(s * 0.02))
mask = Image.new('L', big.size, 255); mask.paste(0, (pad + (s - w) // 2, pad + (s - h) // 2, pad + (s - w) // 2 + w, pad + (s - h) // 2 + h))
mask = mask.filter(ImageFilter.GaussianBlur(max(2, pad // 6)))
out = Image.composite(soft, big, mask)
out.resize((960, 960), Image.LANCZOS).save(r'${path.join(ROOT, 'assets', 'mockups', id, 'hero.webp')}', quality=86, method=6)
out.resize((640, 640), Image.LANCZOS).save(r'${path.join(ROOT, 'assets', 'mockups', id, 'card.webp')}', quality=84, method=6)
`]);
    fs.unlinkSync(tmp);
    console.log('done', id);
  }
  await b.close();
})();
