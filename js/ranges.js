/* EMESE: the homepage as a tech pack. The hero plate and the product ranges show each product
 * photo with its print spot called out: technique, placement and size, like a factory spec sheet. */
import { RANGES, TECHS, byId } from './catalog.js';
import { lang } from './i18n.js';

/* Where the logo sits on each display photo (fractions of the square), and how it is made.
 * Sizes are the usual size for that spot; the quote sets the real one. */
const SPEC = {
  polo:        { x: .64, y: .28, t: 'stitch', at: ['الصدر الشمال', 'Left chest'], cm: 9 },
  polo_ls:     { x: .63, y: .26, t: 'stitch', at: ['الصدر الشمال', 'Left chest'], cm: 9 },
  shirt:       { x: 0.63, y: 0.29, t: 'stitch', at: ['الصدر الشمال', 'Left chest'], cm: 8 },
  tee:         { x: .645, y: .255, t: 'dtf', at: ['الصدر الشمال', 'Left chest'], cm: 9 },
  hoodie:      { x: .65, y: .28, t: 'dtf', at: ['الصدر الشمال', 'Left chest'], cm: 9 },
  chef:        { x: .66, y: .37, t: 'stitch', at: ['على الجيب', 'On the pocket'], cm: 8 },
  chefhat:     { x: 0.47, y: 0.76, t: 'stitch', at: ['على الحزام', 'On the band'], cm: 10 },
  apron:       { x: .50, y: .31, t: 'stitch', at: ['الصدر', 'Chest'], cm: 16 },
  mug:         { x: .42, y: .49, t: 'sub', at: ['الواجهة', 'Front'], cm: 8 },
  coasters:    { x: 0.66, y: 0.69, t: 'uv', at: ['الوش', 'Top face'], cm: 6 },
  giftset:     { x: 0.44, y: 0.52, t: 'laser', at: ['على كل قطعة', 'On every piece'], cm: 5 },
  notebook:    { x: .49, y: .42, t: 'foil', at: ['الغلاف', 'Cover'], cm: 7 },
  pen:         { x: .76, y: .27, t: 'laser', at: ['الغطا', 'Cap'], cm: 4 },
  cards:       { x: 0.59, y: 0.42, t: 'uv', at: ['الوشّين', 'Both sides'], cm: 3 },
  tumbler:     { x: .50, y: .46, t: 'laser', at: ['الواجهة', 'Front'], cm: 6 },
  keychain:    { x: 0.42, y: 0.66, t: 'laser', at: ['الوش', 'Face'], cm: 3 },
  featherflag: { x: 0.53, y: 0.4, t: 'sub', at: ['العلم كله', 'Full flag'], cm: 280 },
  lanyard:     { x: 0.3, y: 0.64, t: 'sub', at: ['الشريط والكارت', 'Strap and badge'], cm: 2 },
  tote:        { x: 0.51, y: 0.62, t: 'screen', at: ['الواجهة', 'Front'], cm: 25 },
  cap:         { x: .47, y: .38, t: 'stitch', at: ['قدّام', 'Front panel'], cm: 10 },
  vest:        { x: .64, y: .32, t: 'screen', at: ['الصدر الشمال', 'Left chest'], cm: 9 },
  helmet:      { x: 0.7, y: 0.43, t: 'uvdtf', at: ['قدّام', 'Front'], cm: 8 },
  label:       { x: 0.5, y: 0.48, t: 'woven', at: ['ورا الرقبة', 'Neck'], cm: 5 },
  hangtag:     { x: 0.53, y: 0.5, t: 'foil', at: ['الوش', 'Face'], cm: 4 },
  zipper:      { x: 0.47, y: 0.64, t: 'laser', at: ['الشدّاد', 'Puller'], cm: 2 }
};

const HERO = ['polo', 'chef', 'notebook', 'featherflag', 'cap'];

const STR = {
  ar: { quote: 'اطلبه', items: (n) => `${n.toLocaleString('ar-EG')} منتج`,
        num: (n) => n.toLocaleString('ar-EG'), cm: 'سم', show: (p) => `اعرض ${p}` },
  en: { quote: 'Get a quote', items: (n) => `${n} products`,
        num: (n) => String(n), cm: 'cm', show: (p) => `Show the ${p}` }
};
const L = () => (lang() === 'en' ? 1 : 0);
const S = () => STR[L() ? 'en' : 'ar'];

/* the measurement line under a callout: "تطريز" / "الصدر الشمال · ٩ سم" */
function callout(id) {
  const sp = SPEC[id], l = L(), s = S();
  const size = sp.cm >= 100 ? `${s.num(sp.cm / 100)} ${l ? 'm' : 'م'}` : `${s.num(sp.cm)} ${s.cm}`;
  return { tech: TECHS[sp.t][l ? 'en' : 'ar'], where: `${sp.at[l]} · ${size}` };
}

/* A leader from the logo to a label at the plate's side: an elbow, then a straight run. */
function leader(sp) {
  const side = sp.x > 0.5 ? 1 : -1;               // away from the nearest edge's opposite: towards the open side
  const ex = side > 0 ? 0.97 : 0.03;
  const ey = Math.max(0.08, sp.y - 0.1);
  const kx = sp.x + side * 0.06;
  return { d: `M${sp.x * 100} ${sp.y * 100} L${kx * 100} ${ey * 100} L${ex * 100} ${ey * 100}`, side, ey };
}

function pinHTML(id, big) {
  const sp = SPEC[id], c = callout(id), ld = leader(sp);
  return `<svg class="leader" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="${ld.d}" pathLength="1"/></svg>
    <span class="pin" style="--x:${sp.x};--y:${sp.y}" aria-hidden="true"></span>
    <span class="tag ${ld.side > 0 ? 'tag-r' : 'tag-l'}${big ? ' tag-big' : ''}" style="--ty:${ld.ey}"><b>${c.tech}</b><span class="mono">${c.where}</span></span>`;
}

/* ---------------- hero: one plate, five products, every 5 seconds ---------------- */
function initHero() {
  const plate = document.getElementById('heroPlate');
  const thumbs = document.getElementById('heroThumbs');
  if (!plate || !thumbs) return;
  const img = plate.querySelector('img');
  const over = plate.querySelector('.plate-over');
  const cap = document.getElementById('heroCap');
  let i = 0, timer = 0, paused = false;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function renderThumbs() {
    thumbs.innerHTML = HERO.map((id, k) => {
      const p = byId(id);
      return `<button type="button" data-k="${k}" aria-pressed="${k === i}" aria-label="${S().show(p[L() ? 'en' : 'ar'])}">
        <img src="assets/products/${id}-s.webp" alt="" width="96" height="96" loading="lazy" decoding="async"></button>`;
    }).join('');
  }
  function show(k, first) {
    i = (k + HERO.length) % HERO.length;
    const id = HERO[i], p = byId(id);
    const name = p[L() ? 'en' : 'ar'];
    const apply = () => {
      img.src = `assets/products/${id}.webp`;
      img.alt = name;
      over.innerHTML = pinHTML(id, true);
      cap.innerHTML = `<span>${name}</span><span class="mono">${p.techs.map(t => TECHS[t][L() ? 'en' : 'ar']).join(' · ')}</span>`;
      plate.dataset.id = id;
      plate.classList.remove('drawn');
      requestAnimationFrame(() => requestAnimationFrame(() => plate.classList.add('drawn')));
    };
    if (first || still) apply();
    else {
      plate.classList.add('swap');
      const pre = new Image();
      pre.src = `assets/products/${id}.webp`;
      (pre.decode ? pre.decode() : Promise.resolve()).catch(() => {}).then(() => {
        apply();
        plate.classList.remove('swap');
      });
    }
    thumbs.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
  }
  function tick() {
    clearTimeout(timer);
    if (still) return;
    timer = setTimeout(() => { if (!paused && !document.hidden) show(i + 1); tick(); }, 5000);
  }
  thumbs.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (!b) return;
    show(+b.dataset.k);
    tick();
  });
  const hold = (v) => () => { paused = v; };
  [plate, thumbs].forEach(el => {
    el.addEventListener('pointerenter', hold(true));
    el.addEventListener('pointerleave', hold(false));
    el.addEventListener('focusin', hold(true));
    el.addEventListener('focusout', hold(false));
  });
  renderThumbs();
  show(0, true);
  tick();
  document.addEventListener('langchange', () => { renderThumbs(); show(i, true); });
}

/* ---------------- the ranges ---------------- */
function initRanges() {
  const bar = document.getElementById('rangeBar');
  const wrap = document.getElementById('ranges');
  if (!bar || !wrap) return;

  function render() {
    const l = L(), s = S();
    bar.innerHTML = RANGES.map(r =>
      `<a href="#r-${r.id}">${l ? r.en : r.ar}<small>${s.num(r.items.length)}</small></a>`).join('');
    wrap.innerHTML = RANGES.map((r, ri) => `
      <section class="rset" id="r-${r.id}" aria-labelledby="rh-${r.id}">
        <header class="range-head">
          <h3 id="rh-${r.id}">${l ? r.en : r.ar}</h3>
          <p class="range-for mono">${l ? r.forEn : r.forAr} · ${s.items(r.items.length)}</p>
          <p class="range-d">${l ? r.dEn : r.dAr}</p>
        </header>
        <div class="range-grid n${r.items.length}">
          ${r.items.map((id, k) => {
            const p = byId(id), name = p[l ? 'en' : 'ar'];
            const techs = p.techs.map(t => TECHS[t][l ? 'en' : 'ar']).join(' · ');
            return `<article class="spec${k === 0 ? ' spec-lead' : ''}" data-pid="${id}">
              <figure class="plate">
                <img src="assets/products/${k === 0 ? id : id + '-s'}.webp" alt="${name}" width="${k === 0 ? 960 : 480}" height="${k === 0 ? 960 : 480}" loading="${ri === 0 ? 'eager' : 'lazy'}" decoding="async">
                <div class="plate-over">${pinHTML(id, k === 0)}</div>
                <i class="crop" aria-hidden="true"></i>
              </figure>
              <div class="spec-meta">
                <h4>${name}</h4>
                <p class="spec-tech mono">${techs}</p>
                <div class="spec-act">
                  <a class="act-quote" href="#order" data-quote="${id}">${s.quote}</a>
                </div>
              </div>
            </article>`;
          }).join('')}
        </div>
      </section>`).join('');
    // leaders draw in as each range scrolls into view (once)
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((es) => es.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('drawn'); io.unobserve(e.target); }
      }), { rootMargin: '0px 0px -15% 0px' });
      wrap.querySelectorAll('.plate').forEach(p => io.observe(p));
    } else wrap.querySelectorAll('.plate').forEach(p => p.classList.add('drawn'));
  }
  wrap.addEventListener('click', (e) => {
    const q = e.target.closest('[data-quote]');
    if (!q) return;
    e.preventDefault();
    document.dispatchEvent(new CustomEvent('order:prefill', { detail: { pid: q.dataset.quote } }));
  });
  render();
  document.addEventListener('langchange', render);
}

/* ---------------- machines: each strip plays once as it scrolls in ---------------- */
function initMachines() {
  const rows = document.querySelectorAll('.mx');
  if (!rows.length) return;
  if (!('IntersectionObserver' in window)) { rows.forEach(r => r.classList.add('in')); return; }
  const io = new IntersectionObserver((es) => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { rootMargin: '0px 0px -20% 0px' });
  rows.forEach(r => io.observe(r));
}

initHero();
initRanges();
initMachines();
