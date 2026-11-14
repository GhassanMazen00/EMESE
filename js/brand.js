/* EMESE: "your logo on everything". The visitor picks their logo once (it stays on their device) and
 * every product shot on the page is redrawn with it: the hero slides and the product cards. */
import { MockupView, loadProduct, designFromImage, fitPlace } from './mockup.js';
import { TECHS, byId, luminance } from './catalog.js';
import { ui, addStrings } from './i18n.js';
import { readLogoFile, setLogo, clearLogo, getLogo, restoreLogo, logoLuminance } from './logo.js';

addStrings({
  'brand.try': 'Try your logo on every product',
  'brand.note': 'Your logo stays on your device. Nothing is uploaded until you send an order.',
  'brand.change': 'Change logo',
  'brand.reset': 'Back to the EMESE logo',
  'brand.drop': 'Drop your logo here'
}, {
  ar: {
    brandWorking: (i, n) => `بنطبع اللوجو بتاعك على المنتجات… ${i.toLocaleString('ar-EG')} من ${n.toLocaleString('ar-EG')}`,
    brandDone: (n) => `اللوجو بتاعك دلوقتي على ${n.toLocaleString('ar-EG')} منتج في الصفحة.`,
    brandType: 'اختار صورة PNG أو JPG أو SVG أو WebP.',
    brandFail: 'الصورة دي ماتفتحتش. جرّب ملف تاني.',
    brandNoGl: 'المتصفح ده مش بيدعم المعاينة. جرّب كروم أو سفاري.'
  },
  en: {
    brandWorking: (i, n) => `Printing your logo on the products… ${i} of ${n}`,
    brandDone: (n) => `Your logo is now on ${n} products on this page.`,
    brandType: 'Pick a PNG, JPG, SVG or WebP image.',
    brandFail: "That image didn't open. Try another file.",
    brandNoGl: "This browser can't draw the previews. Try Chrome or Safari."
  }
});

const root = document.getElementById('brandTry');
if (root) init();

async function init() {
  const file = document.getElementById('brandFile');
  const status = document.getElementById('brandStatus');
  const resetBtn = document.getElementById('brandReset');
  const proof = document.querySelector('.proof-photo');
  let show = null;
  let view = null;
  let run = 0;

  // every image we may redraw, with its original source so "back to EMESE" is instant
  const targets = [];
  document.querySelectorAll('.proof-slide img').forEach((img) => {
    targets.push({ img, id: img.closest('.proof-slide').dataset.id, kind: 'hero', orig: img.getAttribute('src') });
  });
  document.querySelectorAll('img.card-img').forEach((img) => {
    const m = /mockups\/([a-z_]+)\/card\.webp/.exec(img.getAttribute('src') || '');
    if (m) targets.push({ img, id: m[1], kind: 'card', orig: img.getAttribute('src') });
  });

  const say = (text, busy = false) => {
    status.textContent = text;
    status.classList.toggle('busy', busy);
  };

  function looks(t, i) {
    if (t.kind === 'card') return show.cards[t.id];
    const slides = [...document.querySelectorAll('.proof-slide')];
    return show.hero.find(h => h.id === t.id) || show.hero[slides.indexOf(t.img.closest('.proof-slide'))];
  }

  /* Ink for the visitor's logo on this product: its own colors, unless it would vanish. */
  function inkFor(look, logoLum) {
    const mode = TECHS[look.tech].mode;
    if (mode === 'laser' || mode === 'foil') return null;
    const base = look.tint ? luminance(look.tint) : 0.75;
    const ratio = (Math.max(base, logoLum) + 0.05) / (Math.min(base, logoLum) + 0.05);
    if (ratio >= 2.2) return null;
    return base < 0.3 ? '#f6f4ef' : '#141414';
  }

  async function render(t, design, logoLum) {
    const look = looks(t);
    if (!look || !byId(t.id)) return false;
    const prod = await loadProduct(t.id);
    prod.meta.widthM = byId(t.id).widthM;
    view.setProduct(prod, { pick: false });
    view.setDesign(design);
    const tech = TECHS[look.tech];
    const spot = (look.place && prod.meta.presets && prod.meta.presets[look.place]) || prod.meta.default;
    const place = fitPlace(prod.meta, spot, design.logoAspect || 1);
    view.set({
      tint: look.tint, mode: tech.mode, gloss: tech.gloss || 0.15, pitch: tech.pitch, relief: tech.relief,
      ink: tech.mode === 'foil' ? null : inkFor(look, logoLum), foil: tech.mode === 'foil' ? (look.ink || '#d4af37') : '#d4af37',
      reveal: !!byId(t.id).reveal, u: place.u, v: place.v, w: place.w, rot: 0, box: false, design: true
    });
    view.render();
    // same framing as tools/mockups/cards.py
    const src = view.canvas;
    const out = document.createElement('canvas');
    const x = out.getContext('2d');
    x.imageSmoothingQuality = 'high';
    if (t.kind === 'card') {
      const c = Math.round(src.width * (look.crop || 0.86));
      out.width = out.height = 640;
      x.drawImage(src, (src.width - c) / 2, (src.height - c) / 2, c, c, 0, 0, 640, 640);
    } else {
      out.width = out.height = 960;
      x.drawImage(src, 0, 0, 960, 960);
    }
    const blob = await new Promise(r => out.toBlob(r, 'image/webp', 0.86));
    if (!blob) return false;
    if (t.url) URL.revokeObjectURL(t.url);
    t.url = URL.createObjectURL(blob);
    t.img.src = t.url;
    return true;
  }

  // nearest first: the hero slide in view, then whatever is on screen, then the rest
  function order() {
    const vh = innerHeight;
    const score = (t) => {
      const r = t.img.getBoundingClientRect();
      if (t.kind === 'hero') {
        const track = t.img.closest('.proof-track');
        const tr = track.getBoundingClientRect();
        const onSlide = Math.abs(r.left - tr.left) < tr.width / 2;
        return onSlide ? -2 : 1 + Math.abs(r.left - tr.left) / tr.width * 0.01;
      }
      const dist = r.bottom < 0 ? -r.bottom : r.top > vh ? r.top - vh : 0;
      return dist === 0 ? -1 : 2 + dist / vh;
    };
    return [...targets].sort((a, b) => score(a) - score(b));
  }

  async function applyAll() {
    const logo = getLogo();
    if (!logo) return;
    const mine = ++run;
    if (!show) show = await fetch('assets/mockups/showcase.json').then(r => r.json());
    if (!view) {
      try { view = new MockupView(document.createElement('canvas')); }
      catch (e) { say(ui().brandNoGl); return; }
    }
    root.classList.add('on');
    resetBtn.hidden = false;
    const design = designFromImage(logo.canvas);
    const logoLum = logoLuminance(logo.canvas);
    const list = order();
    let done = 0;
    for (const t of list) {
      if (mine !== run) return;               // a newer logo or a reset took over
      say(ui().brandWorking(done + 1, list.length), true);
      try { if (await render(t, design, logoLum)) done++; } catch (e) { /* skip a product that failed to load */ }
      await new Promise(r => setTimeout(r, 0));   // let the page breathe between products
    }
    if (mine === run) say(ui().brandDone(done));
  }

  function resetAll() {
    run++;
    targets.forEach(t => {
      t.img.src = t.orig;
      if (t.url) { URL.revokeObjectURL(t.url); t.url = null; }
    });
    root.classList.remove('on');
    resetBtn.hidden = true;
    say('');
  }

  async function take(f) {
    try {
      const canvas = await readLogoFile(f);
      await setLogo(canvas, f.name);
    } catch (e) {
      say(e.message === 'type' ? ui().brandType : ui().brandFail);
    }
  }

  file.addEventListener('change', () => { if (file.files[0]) take(file.files[0]); file.value = ''; });
  resetBtn.addEventListener('click', () => clearLogo());

  // drop a file on the proof card
  if (proof) {
    ['dragenter', 'dragover'].forEach(ev => proof.addEventListener(ev, (e) => {
      if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
      e.preventDefault();
      proof.classList.add('drop');
    }));
    ['dragleave', 'drop'].forEach(ev => proof.addEventListener(ev, () => proof.classList.remove('drop')));
    proof.addEventListener('drop', (e) => {
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      e.preventDefault();
      take(f);
    });
  }

  document.addEventListener('logo:change', () => (getLogo() ? applyAll() : resetAll()));
  document.addEventListener('langchange', () => {
    if (status.classList.contains('busy') || !status.textContent) return;
    const n = targets.filter(t => t.url).length;
    if (n) say(ui().brandDone(n));
  });
  restoreLogo();
}
