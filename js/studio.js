/* EMESE: mockup studio. Real product renders + the visitor's own logo or text. */
import { MockupView, loadProduct, designFromImage, designFromText } from './mockup.js';
import { PRODUCTS, TECHS, COLOR_NAMES, INKS, FOILS, CATS, byId, luminance } from './catalog.js';
import { lang, ui } from './i18n.js';

const canvas = document.getElementById('mockCanvas');
const section = document.getElementById('studio');
const body = document.getElementById('studioBody');
const openBtn = document.getElementById('studioOpen');
let studio = null;   // created on first open, so the page stays light until then

function setOpen(open, pid) {
  if (!body) return;
  body.hidden = !open;
  section.classList.toggle('open', open);
  openBtn.setAttribute('aria-expanded', String(open));
  openBtn.querySelector('[data-i18n]').textContent = open ? ui().closeStudio : ui().openStudio;
  if (open) {
    if (!studio) studio = init();
    if (studio && pid) studio.select(pid);
    else if (studio) studio.ensure();
    requestAnimationFrame(() => body.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }));
  } else {
    section.scrollIntoView({ block: 'start' });
  }
}

if (canvas && body) {
  openBtn.addEventListener('click', () => setOpen(body.hidden));
  document.getElementById('studioClose').addEventListener('click', () => setOpen(false));
  // any "try it" link on the page opens the studio
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href="#studio"]');
    if (!a) return;
    e.preventDefault();
    setOpen(true);
  });
  document.addEventListener('studio:open', (e) => setOpen(true, e.detail && e.detail.pid));
  document.addEventListener('langchange', () => {
    openBtn.querySelector('[data-i18n]').textContent = body.hidden ? ui().openStudio : ui().closeStudio;
  });
}

function init() {
  let view;
  try { view = new MockupView(canvas); }
  catch (e) {
    canvas.insertAdjacentHTML('afterend', `<p class="stage-fallback">${ui().fallback}</p>`);
    canvas.remove();
    return null;
  }

  const $ = (id) => document.getElementById(id);
  const loading = $('stageLoading');
  const FONTS = {
    modern: { family: '"Alexandria", sans-serif', weight: 800 },
    classic: { family: '"DM Serif Display", serif', weight: 400 },
    light: { family: '"IBM Plex Sans Arabic", sans-serif', weight: 500 }
  };

  const state = {
    pid: 'polo', cat: 'apparel', tech: 'stitch', color: '#f2f1ee', ink: null, foil: FOILS[0],
    source: 'logo', text: 'EMESE', font: 'modern', place: 'center',
    u: 0.5, v: 0.5, w: 0.4, rot: 0, inkTouched: false, box: false
  };
  const designs = { logo: null, upload: null };
  let prod = null;

  /* ---------------- design texture ---------------- */
  const logoImg = new Image();
  logoImg.src = 'assets/logo.png';
  logoImg.onload = () => { designs.logo = designFromImage(logoImg); refreshDesign(); };

  function currentDesign() {
    if (state.source === 'text') {
      const f = FONTS[state.font];
      return designFromText(state.text || 'EMESE', { font: f.family, weight: f.weight });
    }
    return designs[state.source] || designs.logo;
  }
  function refreshDesign() {
    const d = currentDesign();
    if (d) { view.setDesign(d); draw(); }
  }

  $('designFile').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // JPEGs have no transparency: drop a near-white background.
      const src = /png|svg|webp/i.test(file.type) ? img : knockOutWhite(img);
      designs.upload = designFromImage(src);
      URL.revokeObjectURL(url);
      state.source = 'upload';
      state.ink = null;
      refreshDesign();
      renderUI();
    };
    img.src = url;
  });

  function knockOutWhite(img) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < d.data.length; i += 4) {
      const m = Math.min(d.data[i], d.data[i + 1], d.data[i + 2]);
      if (m > 235) d.data[i + 3] = Math.max(0, (255 - m) * 12);
    }
    x.putImageData(d, 0, 0);
    return c;
  }

  /* ---------------- product loading ---------------- */
  async function selectProduct(pid) {
    const def = byId(pid);
    state.pid = pid;
    state.cat = def.cat;
    if (!def.techs.includes(state.tech)) state.tech = def.techs[0];
    if (!def.colors.includes(state.color)) state.color = def.colors[0] || null;
    loading.classList.add('on');
    renderUI();
    try {
      const p = await loadProduct(pid);
      if (state.pid !== pid) return; // another product was picked meanwhile
      p.meta.widthM = def.widthM;
      prod = p;
      view.setProduct(p);
      // start where this product is usually decorated (chest on polos, centre on tees...)
      const d = p.meta.default, pres = p.meta.presets || {};
      const natural = Object.keys(pres).find(k => Math.abs(pres[k].u - d.u) < 1e-3 && Math.abs(pres[k].v - d.v) < 1e-3 && Math.abs(pres[k].w - d.w) < 1e-3);
      applyPlace(natural || Object.keys(pres)[0] || 'center');
      fitTechToColor(def);
      autoInk();
      refreshDesign();
    } catch (e) {
      console.warn('[EMESE studio]', e);
    } finally {
      if (state.pid === pid) loading.classList.remove('on');
    }
    renderUI();
  }

  // sublimation dye only shows on light colours: on a dark product use another method
  function fitTechToColor(def) {
    if (TECHS[state.tech].mode === 'dye' && state.color && luminance(state.color) < 0.3) {
      state.tech = def.techs.find(t => TECHS[t].mode !== 'dye') || state.tech;
    }
  }

  function applyPlace(name) {
    const presets = (prod && prod.meta.presets) || {};
    const pr = presets[name] || prod.meta.default;
    state.place = name;
    Object.assign(state, { u: pr.u, v: pr.v, w: pr.w, rot: 0 });
    draw();
  }

  // Keep the default logo readable: light ink on dark products unless the visitor chose one.
  function autoInk() {
    if (state.inkTouched || state.source === 'upload') return;
    const dark = state.color && luminance(state.color) < 0.18;
    state.ink = dark ? '#f6f4ef' : null;
  }

  /* ---------------- drawing ---------------- */
  let raf = 0;
  function draw() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (!prod) return;
      const def = byId(state.pid);
      const t = TECHS[state.tech];
      view.set({
        tint: def.colors.length ? state.color : null,
        mode: t.mode, gloss: t.gloss || 0.15, pitch: t.pitch, relief: t.relief,
        ink: t.mode === 'foil' ? null : state.ink,
        foil: state.foil,
        reveal: !!def.reveal,
        u: state.u, v: state.v, w: state.w, rot: state.rot, box: state.box
      });
      view.render();
    });
  }

  /* ---------------- pointer: drag, wheel, pinch ---------------- */
  const pointers = new Map();
  let drag = null, pinch = null;
  const hint = $('stageHint');

  canvas.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, w: state.w, ang: Math.atan2(b.y - a.y, b.x - a.x), rot: state.rot };
      drag = null;
      return;
    }
    const uv = view.uvAt(e.clientX, e.clientY);
    if (uv) {
      drag = { start: uv, u: state.u, v: state.v, last: uv };
      canvas.setPointerCapture(e.pointerId);
      hint.classList.add('hide');
      e.preventDefault();
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      state.w = clampW(pinch.w * d / pinch.d);
      state.rot = pinch.rot + (Math.atan2(b.y - a.y, b.x - a.x) - pinch.ang);
      syncRanges(); draw();
      return;
    }
    if (drag) {
      const uv = view.uvAt(e.clientX, e.clientY) || drag.last;
      drag.last = uv;
      let du = uv.u - drag.start.u;
      du -= Math.round(du); // wrap on cylinders
      state.u = drag.u + du;
      state.v = Math.min(1.1, Math.max(-0.1, drag.v + (uv.v - drag.start.v)));
      draw();
    }
    const over = !!drag || !!pinch || overDesign(e.clientX, e.clientY);
    if (over !== state.box) { state.box = over; draw(); }
    if (e.pointerType === 'mouse') canvas.style.cursor = drag ? 'grabbing' : (over ? 'grab' : 'default');
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) drag = null;
    if (e.pointerType !== 'mouse' && !pointers.size) { state.box = false; draw(); }
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointerleave', () => { if (!drag && state.box) { state.box = false; draw(); } });
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => {
    if (!overDesign(e.clientX, e.clientY)) return; // let the page scroll elsewhere
    e.preventDefault();
    state.w = clampW(state.w * Math.exp(-e.deltaY * 0.0015));
    syncRanges(); draw();
  }, { passive: false });

  function overDesign(x, y) {
    const uv = view.uvAt(x, y);
    if (!uv || !prod) return false;
    const a = prod.meta.printAspect;
    let dx = uv.u - state.u;
    dx -= Math.round(dx);
    dx *= a;
    const dy = uv.v - state.v;
    const half = (state.w * a) / 2;
    return Math.abs(dx) < half * 1.1 && Math.abs(dy) < half * 1.1;
  }
  const clampW = (w) => Math.min(1.2, Math.max(0.04, w));

  // keyboard nudging for accessibility
  canvas.tabIndex = 0;
  canvas.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    const k = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (k) { e.preventDefault(); state.u += k[0]; state.v += k[1]; draw(); }
    if (e.key === '+' || e.key === '=') { state.w = clampW(state.w * 1.08); syncRanges(); draw(); }
    if (e.key === '-') { state.w = clampW(state.w / 1.08); syncRanges(); draw(); }
  });

  /* ---------------- controls ---------------- */
  const sizeRange = $('sizeRange'), rotRange = $('rotRange');
  function syncRanges() {
    sizeRange.value = Math.round(state.w * 100);
    rotRange.value = Math.round((((state.rot * 180) / Math.PI + 540) % 360) - 180);
  }
  sizeRange.addEventListener('input', () => { state.w = clampW(sizeRange.value / 100); draw(); });
  rotRange.addEventListener('input', () => { state.rot = (rotRange.value * Math.PI) / 180; draw(); });
  $('artText').addEventListener('input', (e) => { state.text = e.target.value; refreshDesign(); });

  function radio(container, items, selected, onPick, opts = {}) {
    container.innerHTML = '';
    items.forEach((it) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(it.value === selected));
      if (opts.swatch) {
        if (it.value) b.style.setProperty('--sw', it.value);
        else b.classList.add('sw-original');
        b.setAttribute('aria-label', it.label);
        b.title = it.label;
      } else if (opts.thumb) {
        b.innerHTML = `<img src="assets/mockups/${it.value}/thumb.webp" alt="" loading="lazy"><span>${it.label}</span>`;
      } else {
        b.textContent = it.label;
      }
      if (it.disabled) { b.disabled = true; b.title = it.reason || ''; }
      b.addEventListener('click', () => onPick(it.value));
      container.appendChild(b);
    });
  }

  const L = () => lang();
  const nameOf = (hex) => (COLOR_NAMES[hex] || [hex, hex])[L() === 'en' ? 1 : 0];

  function renderUI() {
    const def = byId(state.pid);
    const s = ui();
    radio($('productTabs'), CATS.map(c => ({ value: c, label: s.cats[c] })), state.cat, (c) => { state.cat = c; renderUI(); });
    radio($('productGrid'), PRODUCTS.filter(p => p.cat === state.cat).map(p => ({ value: p.id, label: p[L()] })), state.pid,
      (id) => selectProduct(id), { thumb: true });

    radio($('designTabs'), [
      { value: 'logo', label: s.designTabs.logo },
      { value: 'upload', label: s.designTabs.upload },
      { value: 'text', label: s.designTabs.text }
    ], state.source, (v) => {
      state.source = v;
      if (v === 'upload' && !designs.upload) $('designFile').click();
      autoInk();
      refreshDesign();
      renderUI();
    });
    $('designUpload').hidden = state.source !== 'upload';
    $('designText').hidden = state.source !== 'text';
    radio($('fontPicker'), Object.keys(FONTS).map(k => ({ value: k, label: s.fonts[k] })), state.font, (k) => {
      state.font = k; refreshDesign(); renderUI();
    });

    radio($('techPicker'), def.techs.map(k => ({ value: k, label: TECHS[k][L()] })), state.tech, (k) => {
      state.tech = k;
      // sublimation dye only shows on light materials: switch to the lightest colour
      if (TECHS[k].mode === 'dye' && state.color && luminance(state.color) < 0.3) {
        state.color = def.colors.slice().sort((x, y) => luminance(y) - luminance(x))[0];
        autoInk();
      }
      draw(); renderUI();
    });
    $('techNote').textContent = TECHS[state.tech][L() === 'en' ? 'noteEn' : 'noteAr'];

    const baseWrap = $('baseSwatches');
    baseWrap.parentElement.hidden = !def.colors.length;
    radio(baseWrap, def.colors.map(c => ({ value: c, label: nameOf(c) })), state.color, (c) => {
      state.color = c; fitTechToColor(def); autoInk(); draw(); renderUI();
    }, { swatch: true });

    const mode = TECHS[state.tech].mode;
    const inkLegend = $('inkLegend');
    if (mode === 'foil') {
      inkLegend.textContent = s.foilLegend;
      radio($('inkSwatches'), FOILS.map(c => ({ value: c, label: nameOf(c) })), state.foil, (c) => {
        state.foil = c; draw(); renderUI();
      }, { swatch: true });
    } else {
      inkLegend.textContent = L() === 'en' ? '5. Print color' : '٥. لون الطباعة';
      const laser = mode === 'laser';
      const items = [{ value: null, label: s.original, disabled: laser, reason: s.inkOff }]
        .concat(INKS.map(c => ({ value: c, label: nameOf(c), disabled: laser, reason: s.inkOff })));
      radio($('inkSwatches'), items, laser ? '__none' : state.ink, (c) => {
        state.ink = c; state.inkTouched = true; draw(); renderUI();
      }, { swatch: true });
    }

    const presets = Object.keys((prod && prod.meta.presets) || { center: 1 });
    radio($('placePicker'), presets.map(k => ({ value: k, label: s.places[k] || k })), state.place, (k) => {
      applyPlace(k); syncRanges(); renderUI();
    });
    syncRanges();

    $('stageTag').textContent = `${def[L()]} · ${TECHS[state.tech][L()]}`;
    window.__emeseMockup = `${def[L()]} / ${TECHS[state.tech][L()]}${state.color ? ' / ' + nameOf(state.color) : ''}`;
  }

  /* ---------------- download + order ---------------- */
  $('snapBtn').addEventListener('click', () => {
    view.set({ box: false });
    view.render();
    const out = document.createElement('canvas');
    out.width = canvas.width; out.height = canvas.height;
    const x = out.getContext('2d');
    x.drawImage(canvas, 0, 0);
    const u = out.width / 100;
    x.font = `400 ${u * 3.4}px "DM Serif Display", serif`;
    x.fillStyle = 'rgba(20,20,20,.55)';
    x.textBaseline = 'bottom';
    x.direction = 'ltr';
    x.textAlign = 'left';
    x.fillText('EMESE', u * 3.5, out.height - u * 3);
    const a = document.createElement('a');
    a.download = `EMESE-${state.pid}-${state.tech}.png`;
    a.href = out.toDataURL('image/png');
    a.click();
  });

  $('orderBtn').addEventListener('click', () => {
    const def = byId(state.pid);
    const sel = document.getElementById('contactProduct');
    if (sel) sel.value = def.contact;
    const details = document.querySelector('#contactForm textarea');
    if (details && !details.value) details.value = ui().orderNote(def[L()], TECHS[state.tech][L()]);
  });

  document.addEventListener('langchange', renderUI);

  renderUI();
  return {
    select: (pid) => (byId(pid) ? selectProduct(pid) : selectProduct(state.pid)),
    ensure: () => { if (!prod) selectProduct(state.pid); }
  };
}
