/* EMESE: hero proof card. Real product renders wearing the EMESE logo, cross-fading. */
import { MockupView, loadProduct, designFromImage } from './mockup.js';
import { TECHS, byId } from './catalog.js';
import { lang } from './i18n.js';

const SHOW = [
  { id: 'polo',     tint: '#1f2b4a', tech: 'stitch', ink: '#f6f4ef' },
  { id: 'hoodie',   tint: '#262626', tech: 'dtf',    ink: '#f6f4ef' },
  { id: 'cap',      tint: '#f2f1ee', tech: 'stitch', ink: null },
  { id: 'tee',      tint: '#f2f1ee', tech: 'dtf',    ink: null },
  { id: 'zipper',   tint: '#262626', tech: 'laser' },
  { id: 'label',    tint: '#262626', tech: 'woven',  ink: '#f6f4ef' },
  { id: 'mug',      tint: '#f4f3ef', tech: 'sub',    ink: null },
  { id: 'notebook', tint: '#262626', tech: 'foil',   foil: '#d4af37' },
  { id: 'patch',    tint: '#b07a4b', tech: 'laser' },
  { id: 'polo_ls',  tint: '#f2f1ee', tech: 'stitch', ink: null },
  { id: 'apron',    tint: '#262626', tech: 'dtf',    ink: '#f6f4ef' },
  { id: 'tumbler',  tint: '#1f2b4a', tech: 'laser' },
  { id: 'cards',    tint: '#161616', tech: 'foil',   foil: '#d4af37' },
  { id: 'hangtag',  tint: '#c7a97f', tech: 'digital', ink: '#141414' },
  { id: 'tote',     tint: '#e8dcc4', tech: 'screen', ink: '#141414' },
  { id: 'pen',      tint: '#262626', tech: 'laser' },
  { id: 'flag',     tint: '#1f2b4a', tech: 'sub',    ink: '#f6f4ef' },
  { id: 'keychain', tint: null,      tech: 'laser' }
];
const SHOW_MS = 4800;
const FADE_MS = 500;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = document.getElementById('heroCanvas');
if (canvas) init().catch((e) => console.warn('[EMESE hero]', e));

async function init() {
  const label = document.getElementById('proofLabel');
  const pid = document.getElementById('proofId');
  const dots = document.getElementById('proofDots');
  dots.innerHTML = SHOW.map((_, i) => `<button type="button" aria-label="${i + 1}"></button>`).join('');

  let view;
  try { view = new MockupView(canvas); } catch (e) { return; }

  const logo = await new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = 'assets/logo.png';
  });
  view.setDesign(designFromImage(logo));

  let idx = -1;
  const setLabel = () => {
    if (idx < 0) return;
    const s = SHOW[idx], l = lang();
    label.textContent = `${byId(s.id)[l]} · ${TECHS[s.tech][l]}`;
  };

  async function show(i) {
    const s = SHOW[i];
    const prod = await loadProduct(s.id);
    prod.meta.widthM = byId(s.id).widthM;
    view.setProduct(prod);
    const d = prod.meta.default;
    view.set({
      tint: s.tint, mode: TECHS[s.tech].mode, gloss: TECHS[s.tech].gloss || 0.15,
      pitch: TECHS[s.tech].pitch, relief: TECHS[s.tech].relief,
      ink: s.ink || null, foil: s.foil || '#d4af37', reveal: !!byId(s.id).reveal,
      u: d.u, v: d.v, w: d.w, rot: 0
    });
    view.render();
    idx = i;
    setLabel();
    pid.textContent = `PROOF ${String(i + 1).padStart(2, '0')}`;
    [...dots.children].forEach((el, j) => el.classList.toggle('on', j === i));
    loadProduct(SHOW[(i + 1) % SHOW.length].id).catch(() => {}); // warm the next one
  }

  for (let i = 0; i < SHOW.length; i++) {   // start with the first product that loads
    try { await show(i); break; } catch (e) { /* try the next one */ }
  }
  canvas.classList.add('ready');
  document.addEventListener('langchange', setLabel);

  // navigation: arrows, dots, swipe; autoplay pauses after the visitor takes over
  let busy = false, lastTouch = 0;
  async function go(target) {
    if (busy) return;
    busy = true;
    canvas.classList.add('fade');
    await new Promise(r => setTimeout(r, reduceMotion ? 0 : FADE_MS));
    const n = SHOW.length;
    const step = target > idx || (idx === n - 1 && target === 0) ? 1 : -1;
    for (let k = 0; k < n; k++) {   // skip anything that fails to load
      try { await show(((target + k * step) % n + n) % n); break; } catch (e) { /* try the next one */ }
    }
    canvas.classList.remove('fade');
    busy = false;
  }
  const user = (fn) => { lastTouch = performance.now(); fn(); };
  const rtl = () => document.documentElement.dir === 'rtl';
  const next = () => go((idx + 1) % SHOW.length);
  const prev = () => go((idx - 1 + SHOW.length) % SHOW.length);
  document.getElementById('heroNext').addEventListener('click', () => user(next));
  document.getElementById('heroPrev').addEventListener('click', () => user(prev));
  dots.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) user(() => go([...dots.children].indexOf(b)));
  });
  let sx = null, sy = null;
  canvas.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
  canvas.addEventListener('pointerup', (e) => {
    if (sx == null) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    sx = null;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    // swipe towards the reading direction's start = forward
    const forward = rtl() ? dx > 0 : dx < 0;
    user(forward ? next : prev);
  });
  canvas.closest('.proof').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const forward = (e.key === 'ArrowLeft') === rtl();
    user(forward ? next : prev);
  });

  if (reduceMotion) return;
  let visible = true;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(canvas);
  setInterval(() => {
    if (visible && !document.hidden && performance.now() - lastTouch > 12000) next();
  }, SHOW_MS);
}
