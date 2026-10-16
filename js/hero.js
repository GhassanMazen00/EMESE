/* EMESE: hero proof card. Real product shots wearing the EMESE logo (baked by
 * tools/mockups/cards.py) in a native scroll-snap strip: the finger drives it
 * directly, so swiping is as smooth as the phone's own scrolling. */
import { byId } from './catalog.js';
import { lang } from './i18n.js';

const SHOW_MS = 4500;
const IDLE_MS = 9000;          // autoplay waits this long after the visitor touches it
const track = document.getElementById('proofTrack');
if (track) init();

function init() {
  const slides = [...track.querySelectorAll('.proof-slide')];
  const n = slides.length;
  const label = document.getElementById('proofLabel');
  const pid = document.getElementById('proofId');
  const dots = document.getElementById('proofDots');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  dots.innerHTML = slides.map((_, i) => `<button type="button" aria-label="${i + 1}"></button>`).join('');
  let idx = -1;
  let lastTouch = 0;

  const rtl = () => getComputedStyle(track).direction === 'rtl';
  const W = () => track.clientWidth || 1;
  const at = () => Math.min(n - 1, Math.max(0, Math.round(Math.abs(track.scrollLeft) / W())));
  const name = (i) => { const p = byId(slides[i].dataset.id); return lang() === 'en' ? p.en : p.ar; };

  function mark(i, force) {
    if (i === idx && !force) return;
    idx = i;
    label.textContent = name(i);
    pid.textContent = `PROOF ${String(i + 1).padStart(2, '0')}`;
    [...dots.children].forEach((d, j) => {
      d.classList.toggle('on', j === i);
      if (j === i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
    });
    // warm the neighbours so a swipe never lands on an empty frame
    for (const k of [i + 1, i + 2, i - 1]) {
      const img = slides[(k + n) % n].querySelector('img');
      if (img.loading === 'lazy') img.loading = 'eager';
    }
  }
  function alts() {
    const en = lang() === 'en';
    slides.forEach((s, i) => { s.querySelector('img').alt = en ? `${name(i)} with the EMESE logo` : `${name(i)} عليه لوجو EMESE`; });
    mark(idx < 0 ? 0 : idx, true);
  }

  let jumping = false;
  function go(i, { wrap = true, instant = false } = {}) {
    const target = wrap ? (i + n) % n : Math.min(n - 1, Math.max(0, i));
    const left = target * W() * (rtl() ? -1 : 1);
    if (instant) { track.scrollTo({ left, behavior: 'auto' }); mark(target); return; }
    const far = Math.abs(target - idx) > 1;
    if (far && !reduce && !jumping) {
      // a long rewind would rush past every product: fade, jump, fade back
      jumping = true;
      track.classList.add('jump');
      setTimeout(() => {
        track.scrollTo({ left, behavior: 'auto' });
        mark(target);
        track.classList.remove('jump');
        jumping = false;
      }, 170);
      return;
    }
    track.scrollTo({ left, behavior: reduce ? 'auto' : 'smooth' });
    mark(target);
  }

  let raf = 0;
  track.addEventListener('scroll', () => {
    if (raf || jumping) return;
    raf = requestAnimationFrame(() => { raf = 0; mark(at()); });
  }, { passive: true });

  const touched = () => { lastTouch = performance.now(); };
  ['pointerdown', 'wheel', 'touchstart', 'keydown'].forEach(ev => track.addEventListener(ev, touched, { passive: true }));
  const user = (fn) => () => { touched(); fn(); };
  document.getElementById('heroNext').addEventListener('click', user(() => go(idx + 1)));
  document.getElementById('heroPrev').addEventListener('click', user(() => go(idx - 1)));
  dots.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) user(() => go([...dots.children].indexOf(b)))();
  });

  // mouse drag on desktop (touch and trackpads scroll natively)
  let drag = null;
  track.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag = { x: e.clientX, left: track.scrollLeft, from: idx };
    track.setPointerCapture(e.pointerId);
    track.classList.add('dragging');
  });
  track.addEventListener('pointermove', (e) => {
    if (drag) track.scrollLeft = drag.left - (e.clientX - drag.x);
  });
  const endDrag = () => {
    if (!drag) return;
    const moved = (track.scrollLeft - drag.left) / W() * (rtl() ? -1 : 1);   // in slides, + = forward
    const from = drag.from;
    drag = null;
    track.classList.remove('dragging');
    go(Math.abs(moved) > 0.12 ? from + Math.sign(moved) : from, { wrap: false });
  };
  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);
  track.addEventListener('lostpointercapture', endDrag);

  document.addEventListener('langchange', () => {
    const keep = Math.max(idx, 0);
    jumping = true;                 // ignore the scroll events the direction flip causes
    alts();
    // switching direction flips the scroll origin: keep the same product in view
    requestAnimationFrame(() => { jumping = false; go(keep, { wrap: false, instant: true }); });
  });
  alts();

  if (reduce) return;
  let visible = true;
  let hover = false;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(track);
  track.closest('.proof').addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hover = true; });
  track.closest('.proof').addEventListener('pointerleave', () => { hover = false; });
  setInterval(() => {
    if (visible && !hover && !drag && !document.hidden && performance.now() - lastTouch > IDLE_MS) go(idx + 1);
  }, SHOW_MS);
}
