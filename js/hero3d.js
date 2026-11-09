/* EMESE: the hero's 3D product. A still poster paints at once (assets/3d/posters/<id>.webp, rendered
 * from the same models); once the page is idle the live model replaces it and turns slowly. The visitor
 * can spin it with a finger (horizontal drags; vertical swipes still scroll the page), switch products
 * with the chips under it, and "try your logo" puts their own logo on it too (js/logo.js).
 * On data saver, or without WebGL, the poster stays. */
import { getLogo } from './logo.js';
import { lang } from './i18n.js';
import { byId } from './catalog.js';

export const LOOKS = {
  polo:   { tint: '#1f2b4a', mode: 'stitch', ink: '#f6f4ef' },
  hoodie: { tint: '#262626', mode: 'print', ink: '#f6f4ef' },
  cap:    { tint: '#1f2b4a', mode: 'stitch', ink: '#f6f4ef' },
  tee:    { tint: '#f2f1ee', mode: 'print', ink: null },
  mug:    { tint: '#f4f3ef', mode: 'dye', ink: null }
};

const stage = document.getElementById('hero3d');
if (stage) init();

function init() {
  const poster = document.getElementById('heroPoster');
  const canvas = document.getElementById('heroCanvas');
  const picks = document.getElementById('heroPicks');
  const label = document.getElementById('heroLabel');
  let pid = picks.querySelector('[aria-checked="true"]')?.dataset.pid || 'polo';
  let view = null, mod = null, mockup = null, emese = null, loading = 0;

  const name = (id) => { const p = byId(id); return p ? (lang() === 'en' ? p.en : p.ar) : id; };
  const setLabel = () => { label.textContent = name(pid); };
  setLabel();
  document.addEventListener('langchange', setLabel);

  function pick(id) {
    pid = id;
    picks.querySelectorAll('[data-pid]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.pid === id)));
    setLabel();
    if (view) show(id);
    else poster.src = `assets/3d/posters/${id}.webp`;
  }
  picks.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pid]');
    if (b) pick(b.dataset.pid);
  });

  async function design() {
    const l = getLogo();
    if (l) return mockup.designFromImage(l.canvas);
    if (!emese) {
      const img = new Image();
      img.src = 'assets/logo.png';
      await img.decode();
      emese = mockup.designFromImage(img);
    }
    return emese;
  }

  async function show(id) {
    const n = ++loading;
    stage.classList.add('busy');
    try {
      const prod = await mod.loadModel(id);
      if (n !== loading) return;
      const d = await design();
      view.setProduct(prod);
      view.setDesign(d);
      const look = LOOKS[id] || {};
      const pl = mockup.fitPlace(prod.meta, prod.meta.default, d.logoAspect || 1);
      // the logo's own colours, light ink on the dark products where they would vanish
      view.set({ tint: look.tint, mode: look.mode, ink: look.ink, u: pl.u, v: pl.v, w: pl.w, rot: 0, design: true });
      view.front();
      stage.classList.add('live');
    } catch (e) {
      console.warn('[EMESE hero] staying on the poster', e);
    } finally {
      if (n === loading) stage.classList.remove('busy');
    }
  }

  async function start() {
    if (view) return;
    try {
      [mod, mockup] = await Promise.all([import('./view3d.js'), import('./mockup.js')]);
      view = new mod.View3D(canvas, { autoRotate: true });
      Object.assign(view.controls, { enableZoom: false, autoRotateSpeed: 1.6, rotateSpeed: 0.7 });
      canvas.style.touchAction = 'pan-y';       // vertical swipes scroll the page, sideways ones spin
      view.controls.addEventListener('start', () => stage.classList.add('touched'));
      await show(pid);
    } catch (e) {
      console.warn('[EMESE hero] no 3D here', e);
      view = null;
    }
  }

  document.addEventListener('logo:change', () => { if (view) show(pid); });

  const saveData = navigator.connection && (navigator.connection.saveData || /2g/.test(navigator.connection.effectiveType || ''));
  if (saveData) return;
  const go = () => ('requestIdleCallback' in window ? requestIdleCallback(start, { timeout: 2500 }) : setTimeout(start, 1200));
  if (document.readyState === 'complete') go();
  else addEventListener('load', go, { once: true });
}
