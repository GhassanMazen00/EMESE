// EMESE launch posts. Writes PNGs for Instagram / Facebook (1080 x 1350) and LinkedIn (1200 x 1200).
//   node design/social/src/posts.js
// Photos: the site's product shots (assets/mockups/<id>/hero.webp), already wearing the EMESE logo.
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = path.resolve(__dirname, '..');
const FONTS = path.join(ROOT, 'design', 'banner', 'fonts');
const photo = (id) => 'data:image/webp;base64,' + fs.readFileSync(path.join(ROOT, 'assets', 'mockups', id, 'hero.webp')).toString('base64');
const font = (f) => 'data:font/ttf;base64,' + fs.readFileSync(path.join(FONTS, f)).toString('base64');

const SIZES = { ig: [1080, 1350], linkedin: [1200, 1200] };

// each post: theme, kicker, headline (html), line under it, photos (1, 2 or 4), and an optional chip on the photo
const POSTS = [
  { id: '01-launch', theme: 'dark', kicker: 'توريدات مخصّصة من مصر', title: 'إنت تتخيّل،<br>وإحنا ننفّذ<b>.</b>',
    line: 'يونيفورمات، كابات، كشاكيل، أقلام وهدايا شركات. باللوجو بتاعك.', photos: ['polo'] },
  { id: '02-try-your-logo', theme: 'light', kicker: 'جديد على الموقع', title: 'جرّب اللوجو بتاعك<br>على كل المنتجات<b>.</b>',
    line: 'ارفع اللوجو على emese-eg.com وشوفه على المنتجات في ثانية.', photos: ['cap', 'mug', 'hoodie', 'notebook'] },
  { id: '03-embroidery', theme: 'light', kicker: 'تطريز', title: 'اللوجو بالخيط،<br>غرزة غرزة<b>.</b>',
    line: 'ملمس بارز وشكل رسمي، بيعيش أكتر من الهدوم نفسها.', photos: ['cap'], chip: 'تطريز' },
  { id: '04-print', theme: 'dark', kicker: 'طباعة', title: 'ألوان كاملة<br>بتستحمل الغسيل<b>.</b>',
    line: 'DTF وسلك سكرين على أي لون قماش، من قطعة لحد آلاف القطع.', photos: ['hoodie'], chip: 'DTF' },
  { id: '05-engraving', theme: 'light', kicker: 'حفر بالليزر', title: 'محفور في الخامة،<br>مستحيل يتمسح<b>.</b>',
    line: 'خشب، جلد، معدن وأكريليك. من غير حبر، وبتفاصيل دقيقة.', photos: ['keychain', 'pen'] },
  { id: '06-uniforms', theme: 'dark', kicker: 'يونيفورم الشركات', title: 'فريقك كله<br>بنفس الشكل<b>.</b>',
    line: 'بولو، تيشيرتات، هوديز ومرايل، بالمقاسات اللي تحتاجها.', photos: ['polo_ls', 'apron'] },
  { id: '07-gifts', theme: 'light', kicker: 'هدايا الشركات', title: 'هدايا عليها<br>اسمك<b>.</b>',
    line: 'مجات، زمزميات، كشاكيل، أقلام وشنط قماش للعملا والفريق.', photos: ['mug', 'tumbler', 'notebook', 'tote'] },
  { id: '08-quote', theme: 'dark', kicker: 'اطلب عرض سعر', title: 'قولّنا عايز إيه،<br>والباقي علينا<b>.</b>',
    steps: ['بتبعتلنا الطلب', 'بنبعتلك السعر والتصميم', 'توافق، وإحنا ننفّذ'], photos: ['tee'] }
];

function html(p, [W, H]) {
  const dark = p.theme === 'dark';
  const pics = p.photos.map(id => `<div class="ph"><img src="${photo(id)}"></div>`).join('');
  const n = p.photos.length;
  const steps = p.steps ? `<ol class="steps">${p.steps.map(s => `<li>${s}</li>`).join('')}</ol>` : '';
  const square = W === H;
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
@font-face{font-family:A;font-weight:900;src:url(${font('Alexandria-Black.ttf')})}
@font-face{font-family:A;font-weight:600;src:url(${font('Alexandria-SemiBold.ttf')})}
@font-face{font-family:A;font-weight:400;src:url(${font('Alexandria-Regular.ttf')})}
@font-face{font-family:S;src:url(${font('DMSerifDisplay-Regular.ttf')})}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{--bg:${dark ? '#121212' : '#f1eee8'};--fg:${dark ? '#ffffff' : '#111111'};--soft:${dark ? '#cfcac2' : '#4a463f'};
  --m:#e6007e;--c:#00a3e0;--y:#ffe500;background:var(--bg);color:var(--fg);font-family:A,sans-serif;
  ${dark ? 'background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.045) 0 1px,transparent 1px 7px);' : 'background-image:repeating-linear-gradient(45deg,rgba(0,0,0,.035) 0 1px,transparent 1px 7px);'}
  display:flex;flex-direction:column;padding:${square ? 64 : 72}px;gap:${square ? 30 : 36}px}
.top{display:flex;justify-content:space-between;align-items:center;direction:ltr}
.mark{font:400 52px/1 S,serif;display:flex;align-items:baseline;gap:4px}
.mark i{width:12px;height:12px;border-radius:50%;background:var(--m)}
.cmy{display:flex;gap:5px}.cmy i{width:18px;height:18px;background:var(--c)}.cmy i:nth-child(2){background:var(--m)}.cmy i:nth-child(3){background:var(--y)}
.kick{font:600 30px/1.3 A;color:var(--soft)}
${square ? `.main{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:44px;align-items:center;min-height:0}
.copy{display:flex;flex-direction:column;gap:22px}
h1{font:900 62px/1.32 A}` : `.copy{display:flex;flex-direction:column;gap:20px}
h1{font:900 88px/1.3 A}`}
h1 b{color:var(--m)}
.line{font:400 ${square ? 28 : 31}px/1.6 A;color:var(--soft)}
.photos{${square ? '' : 'flex:1;'}min-height:0;display:grid;gap:14px;
  grid-template-columns:${n === 1 || (square && n === 2) ? '1fr' : '1fr 1fr'};${n === 4 || (square && n === 2) ? 'grid-template-rows:1fr 1fr;' : ''}${square ? 'height:100%;' : ''}}
.ph{position:relative;border-radius:30px;overflow:hidden;background:#c9c4bb;min-height:0}
.ph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.chip{position:absolute;z-index:2;top:22px;right:22px;font:900 26px/1 A;background:var(--y);color:#111;padding:14px 20px;border-radius:999px;direction:ltr}
.steps{list-style:none;counter-reset:s;display:grid;gap:14px}
.steps li{counter-increment:s;font:600 30px/1.3 A;display:flex;align-items:center;gap:16px}
.steps li::before{content:counter(s,arabic-indic);width:50px;height:50px;flex:none;border-radius:50%;background:var(--y);color:#111;display:grid;place-items:center;font:900 24px/1 A}
.foot{display:flex;justify-content:space-between;align-items:center;direction:ltr;font:600 30px/1 A}
.foot .url{background:var(--fg);color:var(--bg);padding:16px 26px;border-radius:999px}
.foot .tag{color:var(--soft);font:600 26px/1 A;direction:rtl}
</style></head><body>
<div class="top"><div class="mark">EMESE<i></i></div><div class="cmy"><i></i><i></i><i></i></div></div>
${square ? '<div class="main">' : ''}
<div class="copy"><p class="kick">${p.kicker}</p><h1>${p.title}</h1>${p.line ? `<p class="line">${p.line}</p>` : ''}${steps}</div>
<div class="photos">${pics.replace('<div class="ph">', `<div class="ph">${p.chip ? `<span class="chip">${p.chip}</span>` : ''}`)}</div>
${square ? '</div>' : ''}
<div class="foot"><span class="url">emese-eg.com</span><span class="tag">إنت تتخيّل، وإحنا ننفّذ</span></div>
</body></html>`;
}

(async () => {
  const b = await chromium.launch();
  for (const [name, size] of Object.entries(SIZES)) {
    const dir = path.join(OUT, name);
    fs.mkdirSync(dir, { recursive: true });
    const p = await b.newPage({ viewport: { width: size[0], height: size[1] } });
    for (const post of POSTS) {
      await p.setContent(html(post, size));
      await p.evaluate(() => document.fonts.ready);
      await p.waitForTimeout(150);
      await p.screenshot({ path: path.join(dir, `${post.id}.png`) });
    }
    await p.close();
    console.log(name, POSTS.length, 'posts');
  }
  await b.close();
})();
