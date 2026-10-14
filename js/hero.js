/* EMESE: hero proof card. Real product renders wearing the EMESE logo, cross-fading. */
import { MockupView, loadProduct, designFromImage } from './mockup.js';
import { TECHS, byId } from './catalog.js';
import { lang } from './i18n.js';

const SHOW = [
  { id: 'tee',      tint: '#262626', tech: 'dtf',    ink: '#f6f4ef' },
  { id: 'mug',      tint: '#f4f3ef', tech: 'sub',    ink: null },
  { id: 'notebook', tint: '#262626', tech: 'foil',   foil: '#d4af37' },
  { id: 'cap',      tint: '#1f2b4a', tech: 'stitch', ink: '#f6f4ef' },
  { id: 'tote',     tint: '#e8dcc4', tech: 'screen', ink: '#141414' },
  { id: 'tumbler',  tint: '#1f2b4a', tech: 'laser' },
  { id: 'cards',    tint: '#161616', tech: 'foil',   foil: '#d4af37' },
  { id: 'pen',      tint: '#262626', tech: 'laser' },
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
  dots.innerHTML = SHOW.map(() => '<i></i>').join('');

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

  await show(0);
  canvas.classList.add('ready');
  document.addEventListener('langchange', setLabel);
  if (reduceMotion) return;

  let visible = true;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(canvas);
  const tick = async () => {
    if (visible && !document.hidden) {
      canvas.classList.add('fade');
      await new Promise(r => setTimeout(r, FADE_MS));
      try { await show((idx + 1) % SHOW.length); } catch (e) { /* keep the current one */ }
      canvas.classList.remove('fade');
    }
    setTimeout(tick, SHOW_MS);
  };
  setTimeout(tick, SHOW_MS);
}
