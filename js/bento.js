/* EMESE: the photo grid at the top. Every 5 seconds all five tiles change together to the next five
 * products. Pauses while the pointer or keyboard focus is on the grid, while it is off screen, and
 * while the tab is hidden; under reduced motion it only changes when a dot is pressed.
 * Photos come from assets/mockups/<id>/hero.webp, or the visitor's own logo version (js/brand.js
 * sends those as 'brand:hero' events). */
import { byId } from './catalog.js';
import { lang } from './i18n.js';

// the big tile first in each set
export const GROUPS = [
  ['polo', 'cap', 'hoodie', 'mug', 'notebook'],
  ['polo_ls', 'tee', 'tumbler', 'cards', 'pen'],
  ['apron', 'tote', 'flag', 'keychain', 'zipper'],
  ['hoodie', 'label', 'patch', 'hangtag', 'cap']
];
const EVERY = 5000;

const grid = document.querySelector('.bento');
if (grid) init();

function init() {
  const tiles = [...grid.querySelectorAll('.tile')];
  const own = new Map();                         // product id -> the visitor's logo version
  const src = (id) => own.get(id) || `assets/mockups/${id}/hero.webp`;
  const name = (id) => { const p = byId(id); return p ? (lang() === 'en' ? p.en : p.ar) : id; };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let g = 0, timer = 0, hover = false, visible = true;

  // dots: one per set
  const dots = document.createElement('div');
  dots.className = 'bento-dots';
  dots.innerHTML = GROUPS.map((_, i) => `<button type="button" aria-label="${i + 1}"></button>`).join('');
  grid.after(dots);
  dots.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) { show([...dots.children].indexOf(b)); restart(); }
  });

  // preload the next set so the change is instant
  const preload = (i) => GROUPS[i % GROUPS.length].forEach(id => { const im = new Image(); im.src = src(id); });

  function label(tile, id) {
    tile.querySelector('.tile-name').textContent = name(id);
    tile.querySelector('img').alt = `${name(id)} EMESE`;
  }

  function show(i, animate = !reduce) {
    g = (i + GROUPS.length) % GROUPS.length;
    [...dots.children].forEach((d, k) => d.setAttribute('aria-current', String(k === g)));
    GROUPS[g].forEach((id, k) => {
      const tile = tiles[k];
      if (!tile || tile.dataset.id === id) return;
      tile.dataset.id = id;
      tile.dataset.try = id;
      const old = tile.querySelector('img');
      if (!animate) { old.src = src(id); label(tile, id); return; }
      const next = old.cloneNode();
      next.src = src(id);
      next.classList.add('in');
      next.style.animationDelay = `${k * 70}ms`;
      next.addEventListener('animationend', () => { next.classList.remove('in'); old.remove(); }, { once: true });
      tile.insertBefore(next, old.nextSibling);
      label(tile, id);
    });
    preload(g + 1);
  }

  function tick() { if (!hover && visible && !document.hidden) show(g + 1); }
  function restart() { clearInterval(timer); if (!reduce) timer = setInterval(tick, EVERY); }

  grid.addEventListener('pointerenter', () => { hover = true; });
  grid.addEventListener('pointerleave', () => { hover = false; });
  grid.addEventListener('focusin', () => { hover = true; });
  grid.addEventListener('focusout', () => { hover = false; });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(grid);

  document.addEventListener('brand:hero', (e) => {
    const { id, url } = e.detail;
    if (url) own.set(id, url); else own.delete(id);
    tiles.forEach(t => { if (t.dataset.id === id) t.querySelector('img').src = src(id); });
  });
  document.addEventListener('langchange', () => tiles.forEach(t => label(t, t.dataset.id)));

  show(0, false);
  restart();
}
