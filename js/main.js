/* EMESE: page interactions (theme, hero proof, reveal, steps, contact) */

// ⚠️ Replace with the real business WhatsApp number (country code, no "+" or spaces).
const WHATSAPP_NUMBER = '201000000000';

/* ---------- light / dark toggle ---------- */
(() => {
  const root = document.documentElement;
  const btn = document.getElementById('themeToggle');
  const meta = document.querySelector('meta[name="theme-color"]');
  const sync = () => {
    const dark = root.getAttribute('data-theme') === 'dark';
    if (meta) meta.setAttribute('content', dark ? '#121110' : '#f4efe6');
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

/* ---------- hero proof card: slow cross-fade between products ---------- */
(() => {
  const items = [...document.querySelectorAll('.proof-item')];
  const dots = [...document.querySelectorAll('#proofDots i')];
  const label = document.getElementById('proofLabel');
  const id = document.getElementById('proofId');
  if (items.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let i = 0;
  setInterval(() => {
    if (document.hidden) return;
    items[i].classList.remove('is-on'); dots[i]?.classList.remove('on');
    i = (i + 1) % items.length;
    items[i].classList.add('is-on'); dots[i]?.classList.add('on');
    label.textContent = items[i].dataset.label;
    id.textContent = `PROOF 0${i + 1}`;
  }, 4200);
})();

/* ---------- reveal on scroll ---------- */
(() => {
  const els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  els.forEach(e => io.observe(e));
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
  const nums = ['٠١', '٠٢', '٠٣', '٠٤', '٠٥', '٠٦'];

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
    num.textContent = nums[i];
    art.innerHTML = svgs[i];
    bar.style.width = `${((i + 1) / steps.length) * 100}%`;
  }
  setStep(0);

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

/* ---------- contact → WhatsApp ---------- */
(() => {
  const form = document.getElementById('contactForm');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = new FormData(form);
    const lines = [
      'أهلًا EMESE 👋',
      `الاسم: ${d.get('name') || ''}`,
      `المنتج: ${d.get('product') || ''}`,
      d.get('qty') ? `الكمية: ${d.get('qty')}` : '',
      d.get('details') ? `التفاصيل: ${d.get('details')}` : '',
      window.__emeseMockup ? `من الاستوديو: ${window.__emeseMockup}` : ''
    ].filter(Boolean);
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join('\n'))}`;
    window.open(url, '_blank', 'noopener');
  });
})();
