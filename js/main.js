/* EMESE: page interactions (theme, language, steps, the load moment, offline app) */
import { applyLang, setLang, lang, ui } from './i18n.js';
import { initEverything } from './everything.js';

/* ---------- language: Arabic by default, English on request ----------
 * Module scripts run in order, so the other modules (brand, order...) have added their
 * strings once the document has finished loading. */
if (lang() === 'en') {
  if (document.readyState === 'complete') applyLang('en');
  else addEventListener('DOMContentLoaded', () => applyLang('en'), { once: true });
}
document.getElementById('langToggle')?.addEventListener('click', () => setLang(lang() === 'en' ? 'ar' : 'en'));

/* ---------- the full catalogue ---------- */
initEverything();

/* ---------- first visit: ask which language. The answer is remembered. ----------
 * Shown as soon as the page is parsed (not after every image has loaded), and the
 * dialog closes before the page re-renders so the tap answers instantly. */
(() => {
  const dlg = document.getElementById('langPick');
  if (!dlg || typeof dlg.showModal !== 'function') return;
  let asked = null;
  try { asked = localStorage.getItem('emese-lang'); } catch (e) { return; /* storage blocked: we could not remember the answer */ }
  if (asked) return;
  let done = false;
  const choose = (l) => {
    if (done) return;
    done = true;
    try { localStorage.setItem('emese-lang', l); } catch (e) { /* ignore */ }
    if (dlg.open) dlg.close();
    // let the dialog disappear first, then switch the page
    if (l !== lang()) requestAnimationFrame(() => requestAnimationFrame(() => setLang(l)));
  };
  dlg.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-lang]');
    if (b) { e.preventDefault(); choose(b.dataset.lang); }
    else if (e.target === dlg) choose(lang());      // a tap outside keeps Arabic
  });
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); choose(lang()); });   // Escape or the phone's back button
  dlg.showModal();
  dlg.querySelector('[data-lang="ar"]').focus({ preventScroll: true });
})();

/* ---------- light / dark toggle ---------- */
(() => {
  const root = document.documentElement;
  const btn = document.getElementById('themeToggle');
  const meta = document.querySelector('meta[name="theme-color"]');
  const sync = () => {
    const dark = root.getAttribute('data-theme') === 'dark';
    if (meta) meta.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim() || (dark ? '#121212' : '#f1eee8'));
    btn?.setAttribute('aria-pressed', String(dark));
  };
  sync();
  btn?.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('emese-theme', next); } catch (e) { /* storage blocked: still switches for this visit */ }
    sync();
  });
})();

/* ---------- phone menu: the section links and the quote button in a sheet under the header ---------- */
(() => {
  const btn = document.getElementById('menuToggle');
  const sheet = document.getElementById('menuSheet');
  if (!btn || !sheet) return;
  const set = (open) => {
    sheet.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    document.documentElement.classList.toggle('menu-open', open);
    if (open) sheet.querySelector('a')?.focus({ preventScroll: true });
  };
  btn.addEventListener('click', () => set(sheet.hidden));
  sheet.addEventListener('click', (e) => { if (e.target.closest('a') || e.target === sheet) set(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) { set(false); btn.focus(); } });
  matchMedia('(min-width: 861px)').addEventListener('change', (e) => { if (e.matches) set(false); });
})();

/* ---------- banner details: measuring tapes, the techniques strip ---------- */
(() => {
  // a tailor's tape: centimetre ticks are CSS, the numbers are spans
  document.querySelectorAll('.tape').forEach((t) => {
    const from = 40 + Math.floor(Math.random() * 40);
    t.innerHTML = '<span class="tape-n">' + Array.from({ length: 60 }, (_, i) => `<b>${from + i}</b>`).join('') + '</span>';
  });
  const MQ = {
    ar: ['تطريز', 'DTF', 'سلك سكرين', 'ليزر', 'UV', 'سبلميشن', 'فويل', 'نسيج', 'يونيفورمات', 'كابات', 'هوديز', 'هدايا شركات'],
    en: ['Embroidery', 'DTF', 'Screen print', 'Laser', 'UV', 'Sublimation', 'Foil', 'Weaving', 'Uniforms', 'Caps', 'Hoodies', 'Corporate gifts']
  };
  const track = document.querySelector('.mq-track');
  const fill = () => {
    if (!track) return;
    const row = MQ[lang() === 'en' ? 'en' : 'ar'].map(t => `<span>${t}</span><i></i>`).join('');
    track.innerHTML = `<div class="mq-row">${row}</div><div class="mq-row">${row}</div>`;
  };
  fill();
  document.addEventListener('langchange', fill);
})();

/* ---------- step-by-step visual ---------- */
(() => {
  const steps = [...document.querySelectorAll('.step')];
  const card = document.getElementById('svCard');
  const num = document.getElementById('svNum');
  const art = document.getElementById('svArt');
  const bar = document.getElementById('svBar');
  if (!steps.length || !card) return;

  const tones = ['var(--c)', 'var(--y)', 'var(--m)', 'var(--paper)', 'var(--c)', 'var(--y)'];

  // Simple illustrations, one per step. They redraw each time a step becomes active.
  const svgs = [
    // 1. idea: chat bubble + sketch
    `<svg viewBox="0 0 200 200">
      <path class="fill-p pop" d="M30 40h120a14 14 0 0 1 14 14v62a14 14 0 0 1-14 14H80l-30 26v-26H30a14 14 0 0 1-14-14V54a14 14 0 0 1 14-14z"/>
      <path class="draw" d="M48 98c10-24 22-30 30-14s16 18 26-4 22-14 30 6"/>
      <circle class="fill-m pop" cx="150" cy="44" r="12" style="animation-delay:.3s"/>
    </svg>`,
    // 2. materials: swatches fan
    `<svg viewBox="0 0 200 200">
      <g transform="translate(100 160)">
        <rect class="fill-c pop" x="-14" y="-130" width="28" height="120" rx="8" transform="rotate(-36)"/>
        <rect class="fill-m pop" x="-14" y="-130" width="28" height="120" rx="8" transform="rotate(-12)" style="animation-delay:.1s"/>
        <rect class="fill-p pop" x="-14" y="-130" width="28" height="120" rx="8" transform="rotate(12)" style="animation-delay:.2s"/>
        <rect class="fill-k pop" x="-14" y="-130" width="28" height="120" rx="8" transform="rotate(36)" style="animation-delay:.3s"/>
        <circle class="fill-p" r="10"/>
      </g>
    </svg>`,
    // 3. design + mockup: tee with logo
    `<svg viewBox="0 0 200 200">
      <path class="fill-p draw" d="M70 30l-40 22 14 32 16-8v86h80V76l16 8 14-32-40-22c-6 12-16 18-30 18s-24-6-30-18z"/>
      <circle class="fill-m pop" cx="100" cy="100" r="22" style="animation-delay:.6s"/>
      <path class="pop" d="M90 100l7 7 14-14" style="animation-delay:.8s"/>
    </svg>`,
    // 4. sample + approval: tag with check
    `<svg viewBox="0 0 200 200">
      <path class="fill-y pop" d="M40 60l50-30h70v100l-50 40H40z"/>
      <circle class="fill-p" cx="140" cy="52" r="8"/>
      <path class="draw" d="M70 100l20 20 40-44" style="stroke-width:8"/>
    </svg>`,
    // 5. machines running: print head + passes
    `<svg viewBox="0 0 200 200">
      <rect class="fill-p" x="24" y="120" width="152" height="44" rx="6"/>
      <rect class="fill-k pop" x="70" y="40" width="60" height="46" rx="8"/>
      <path d="M24 64h152"/>
      <path class="draw" d="M84 96v14M100 96v14M116 96v14" style="stroke-width:5"/>
      <rect class="fill-c pop" x="40" y="132" width="34" height="20" rx="3" style="animation-delay:.2s"/>
      <rect class="fill-m pop" x="83" y="132" width="34" height="20" rx="3" style="animation-delay:.4s"/>
      <rect class="fill-y pop" x="126" y="132" width="34" height="20" rx="3" style="animation-delay:.6s"/>
    </svg>`,
    // 6. packaging + delivery: box with ribbon
    `<svg viewBox="0 0 200 200">
      <path class="fill-p pop" d="M30 70l70-30 70 30v80l-70 30-70-30z"/>
      <path d="M30 70l70 30 70-30M100 100v80"/>
      <path class="fill-m pop" d="M60 56l70 30v26l-14-6v-14L46 62z" style="animation-delay:.3s"/>
      <path class="draw" d="M120 30c10-14 30-10 24 4M120 30c-4-16-24-18-24-2"/>
    </svg>`
  ];

  let current = -1;
  function setStep(i) {
    if (i === current) return;
    current = i;
    steps.forEach((s, j) => s.classList.toggle('active', j === i));
    card.style.setProperty('--tone', tones[i]);
    num.textContent = ui().nums[i];
    art.innerHTML = svgs[i];
    bar.style.width = `${((i + 1) / steps.length) * 100}%`;
  }
  setStep(0);
  document.addEventListener('langchange', () => { num.textContent = ui().nums[current]; });

  // The step whose centre is closest to the viewport's focus line wins.
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const focus = window.innerHeight * 0.55;
      let best = 0, bestD = Infinity;
      steps.forEach((s, j) => {
        const r = s.getBoundingClientRect();
        const d = Math.abs(r.top + r.height / 2 - focus);
        if (d < bestD) { bestD = d; best = j; }
      });
      setStep(best);
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

/* ---------- the one load moment: the slogan prints in three plates, then registers ---------- */
(() => {
  const press = document.querySelector('.press');
  if (!press) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { press.classList.add('registered'); return; }
  requestAnimationFrame(() => requestAnimationFrame(() => press.classList.add('printing')));
  setTimeout(() => press.classList.add('registered'), 1700);
})();

/* ---------- works offline and installs like an app ---------- */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* not critical */ }));
}
