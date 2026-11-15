// WhatsApp Business images: profile photo (640 x 640, safe inside WhatsApp's circle crop)
// and catalog photos (1000 x 1000 JPEG, from the site's product shots).
//   node design/whatsapp/src/images.js
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = path.resolve(__dirname, '..');
const font = (f) => 'data:font/ttf;base64,' + fs.readFileSync(path.join(ROOT, 'design', 'banner', 'fonts', f)).toString('base64');
const CATALOG = ['polo', 'polo_ls', 'tee', 'hoodie', 'cap', 'apron', 'mug', 'tumbler', 'notebook', 'pen', 'cards', 'tote', 'flag', 'keychain', 'label', 'patch', 'hangtag', 'zipper'];

const PROFILE = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:S;src:url(${font('DMSerifDisplay-Regular.ttf')})}
*{margin:0;padding:0}
body{width:640px;height:640px;display:grid;place-items:center;position:relative;
  background:#121212 repeating-linear-gradient(45deg,rgba(255,255,255,.05) 0 1px,transparent 1px 7px)}
.mark{font:400 128px/1 S,serif;color:#fff;display:flex;align-items:baseline;gap:8px}
.mark i{width:24px;height:24px;border-radius:50%;background:#e6007e}
.cmy{position:absolute;bottom:150px;left:50%;transform:translateX(-50%);display:flex;gap:6px}
.cmy i{width:22px;height:22px;background:#00a3e0}.cmy i:nth-child(2){background:#e6007e}.cmy i:nth-child(3){background:#ffe500}
</style></head><body><div class="mark">EMESE<i></i></div><div class="cmy"><i></i><i></i><i></i></div></body></html>`;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 640, height: 640 } });
  await p.setContent(PROFILE); await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(OUT, 'emese-whatsapp-profile.png') });
  await b.close();
  const { execFileSync } = require('child_process');
  for (const [i, id] of CATALOG.entries()) {
    const src = path.join(ROOT, 'assets', 'mockups', id, 'hero.webp');
    const dst = path.join(OUT, 'catalog', `${String(i + 1).padStart(2, '0')}-${id}.jpg`);
    execFileSync('python3', ['-c', `from PIL import Image; Image.open(r'${src}').convert('RGB').resize((1000,1000), Image.LANCZOS).save(r'${dst}', quality=90)`]);
  }
  console.log('profile + catalog', CATALOG.length);
})();
