/* EMESE: mockup studio. Real product renders + the visitor's own logo or text. */
import { MockupView, loadProduct, designFromImage, designFromText, fitPlace } from './mockup.js';
import { PRODUCTS, TECHS, COLOR_NAMES, INKS, FOILS, CATS, byId, luminance } from './catalog.js';
import { lang, ui } from './i18n.js';
import { readLogoFile, setLogo, getLogo } from './logo.js';

const canvas = document.getElementById('mockCanvas');
const canvas3d = document.getElementById('mock3d');
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

/* Which products have a 3D model (assets/3d/models.json): read without loading three.js itself. */
let list3dP = null;
const list3d = () => (list3dP ||= fetch('assets/3d/models.json').then(r => (r.ok ? r.json() : {})).catch(() => ({})));

function init() {
  // two renderers with the same surface: the 3D one (360°) for products with a model,
  // the photo compositor for the rest. `view` is whichever is showing.
  let view2d;
  try { view2d = new MockupView(canvas); }
  catch (e) {
    canvas.insertAdjacentHTML('afterend', `<p class="stage-fallback">${ui().fallback}</p>`);
    canvas.remove();
    return null;
  }
  let view = view2d;
  let view3d = null, mod3d = null, failed3d = false;
  async function get3d() {
    if (view3d || failed3d) return view3d;
    try {
      mod3d = await import('./view3d.js');
      view3d = new mod3d.View3D(canvas3d);
      hook3d();
    } catch (e) {
      console.warn('[EMESE studio] 3D unavailable, using photos', e);
      failed3d = true;
    }
    return view3d;
  }

  const $ = (id) => document.getElementById(id);
  const loading = $('stageLoading');
  const tools = $('stageTools');
  function show3d(on) {
    view = on ? view3d : view2d;
    canvas.hidden = on;
    canvas3d.hidden = !on;
    tools.hidden = !on;
    $('stageHint').textContent = on ? ui().hint3d : ui().hint2d;
    if (on) view3d.resize();
  }
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
    if (!d) return;
    view.setDesign(d);
    if (view3d && view !== view3d) view3d.setDesign(d);
    // a new logo of another shape re-fits the chosen spot, unless the visitor placed it by hand
    if (prod && !state.moved) { applyPlace(state.place, false); syncRanges(); }
    draw();
  }

  // the visitor's logo is shared with the hero and the order form (js/logo.js)
  $('designFile').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try { await setLogo(await readLogoFile(file), file.name); } catch (err) { /* not an image: keep the current design */ }
  });
  function useLogo() {
    const l = getLogo();
    designs.upload = l ? designFromImage(l.canvas) : null;
    if (l) { state.source = 'upload'; state.ink = null; }
    else if (state.source === 'upload') state.source = 'logo';
  }
  document.addEventListener('logo:change', () => { useLogo(); refreshDesign(); renderUI(); });
  useLogo();

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
      const has3d = (await list3d())[pid] && await get3d();
      const p = has3d ? await mod3d.loadModel(pid) : await loadProduct(pid);
      if (state.pid !== pid) return; // another product was picked meanwhile
      p.meta.widthM = def.widthM;
      prod = p;
      show3d(!!has3d);
      view.setProduct(p);
      if (has3d) view.front();
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

  // a placement scales the design so its real shape fits that spot on the product
  function applyPlace(name, redraw = true) {
    const presets = (prod && prod.meta.presets) || {};
    const pr = presets[name] || prod.meta.default;
    const d = currentDesign();
    state.place = name;
    state.moved = false;
    Object.assign(state, fitPlace(prod.meta, pr, (d && d.logoAspect) || 1), { rot: 0 });
    if (redraw) draw();
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
      state.moved = true;
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
      state.moved = true;
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
    state.moved = true;
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
  function onKey(e) {
    const step = e.shiftKey ? 0.05 : 0.01;
    const k = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (k) { e.preventDefault(); state.moved = true; state.u += k[0]; state.v += k[1]; draw(); }
    if (e.key === '+' || e.key === '=') { state.moved = true; state.w = clampW(state.w * 1.08); syncRanges(); draw(); }
    if (e.key === '-') { state.moved = true; state.w = clampW(state.w / 1.08); syncRanges(); draw(); }
  }
  canvas.addEventListener('keydown', onKey);

  /* 3D stage: a drag that starts on the logo moves the logo; any other drag turns the product
   * (OrbitControls), pinch and wheel zoom. Listeners sit on the stage in the capture phase, so they
   * decide before the orbit controls see the event. */
  let drag3 = null;
  function hook3d() {
    const wrap = canvas3d.parentElement;
    wrap.addEventListener('pointerdown', (e) => {
      if (view !== view3d || e.target !== canvas3d || !e.isPrimary || !view3d.onDesign(e.clientX, e.clientY)) return;
      const uv = view3d.uvAt(e.clientX, e.clientY);
      drag3 = { id: e.pointerId, start: uv, u: state.u, v: state.v, last: uv };
      view3d.controls.enabled = false;
      canvas3d.setPointerCapture(e.pointerId);
      hint.classList.add('hide');
      e.stopPropagation();
      e.preventDefault();
    }, true);
    wrap.addEventListener('pointermove', (e) => {
      if (view !== view3d) return;
      if (drag3 && e.pointerId === drag3.id) {
        const uv = view3d.uvAt(e.clientX, e.clientY) || drag3.last;
        drag3.last = uv;
        let du = uv.u - drag3.start.u;
        du -= Math.round(du);
        state.moved = true;
        state.u = drag3.u + du;
        state.v = Math.min(1.1, Math.max(-0.1, drag3.v + (uv.v - drag3.start.v)));
        draw();
        e.stopPropagation();
      } else if (e.pointerType === 'mouse' && e.target === canvas3d) {
        canvas3d.style.cursor = view3d.onDesign(e.clientX, e.clientY) ? 'grab' : 'ew-resize';
      }
    }, true);
    const end = (e) => {
      if (!drag3 || e.pointerId !== drag3.id) return;
      drag3 = null;
      view3d.controls.enabled = true;
    };
    wrap.addEventListener('pointerup', end, true);
    wrap.addEventListener('pointercancel', end, true);
    wrap.addEventListener('wheel', (e) => {
      if (view !== view3d || e.target !== canvas3d || !view3d.onDesign(e.clientX, e.clientY)) return;
      e.preventDefault();
      e.stopPropagation();
      state.moved = true;
      state.w = clampW(state.w * Math.exp(-e.deltaY * 0.0015));
      syncRanges(); draw();
    }, { capture: true, passive: false });
    view3d.controls.addEventListener('start', () => hint.classList.add('hide'));
    canvas3d.tabIndex = 0;
    canvas3d.addEventListener('keydown', onKey);
    const spin = $('stageSpin');
    spin.addEventListener('click', () => {
      view3d.controls.autoRotate = !view3d.controls.autoRotate;
      spin.setAttribute('aria-pressed', String(view3d.controls.autoRotate));
      view3d.requestRender();
    });
    $('stageFront').addEventListener('click', () => {
      view3d.controls.autoRotate = false;
      spin.setAttribute('aria-pressed', 'false');
      view3d.front();
    });
  }

  /* ---------------- controls ---------------- */
  const sizeRange = $('sizeRange'), rotRange = $('rotRange');
  function syncRanges() {
    sizeRange.value = Math.round(state.w * 100);
    rotRange.value = Math.round((((state.rot * 180) / Math.PI + 540) % 360) - 180);
  }
  sizeRange.addEventListener('input', () => { state.moved = true; state.w = clampW(sizeRange.value / 100); draw(); });
  rotRange.addEventListener('input', () => { state.moved = true; state.rot = (rotRange.value * Math.PI) / 180; draw(); });
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

    $('stageTag').textContent = `${def[L()]}${L() === 'en' ? ', ' : '، '}${TECHS[state.tech][L()]}`;
  }

  /* ---------------- download + order ---------------- */
  // what is on the stage now, flattened onto a backdrop (the 3D view is transparent)
  function stageImage(size) {
    view.set({ box: false });
    view.render();
    const src = view === view3d ? canvas3d : canvas;
    const out = document.createElement('canvas');
    out.width = size || src.width; out.height = size ? Math.round(size * src.height / src.width) : src.height;
    const x = out.getContext('2d');
    if (view === view3d) {
      const g = x.createRadialGradient(out.width / 2, out.height * 0.42, 0, out.width / 2, out.height / 2, out.width * 0.75);
      g.addColorStop(0, '#f1eee8'); g.addColorStop(1, '#d9d4cb');
      x.fillStyle = g;
      x.fillRect(0, 0, out.width, out.height);
    }
    x.drawImage(src, 0, 0, out.width, out.height);
    return out;
  }

  $('snapBtn').addEventListener('click', () => {
    const out = stageImage();
    const x = out.getContext('2d');
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

  // "order this": the order form gets the product, method, color and this exact mockup
  $('orderBtn').addEventListener('click', (e) => {
    e.preventDefault();
    const def = byId(state.pid);
    const label = $('stageTag').textContent + (state.color ? (L() === 'en' ? ', ' : '، ') + nameOf(state.color) : '');
    const out = stageImage(Math.min(1200, (view === view3d ? canvas3d : canvas).width));
    out.toBlob((blob) => {
      document.dispatchEvent(new CustomEvent('order:prefill', {
        detail: { pid: def.id, tech: state.tech, color: state.color, blob, label }
      }));
    }, 'image/jpeg', 0.88);
  });

  document.addEventListener('langchange', () => {
    renderUI();
    $('stageHint').textContent = view === view3d ? ui().hint3d : ui().hint2d;
  });

  renderUI();
  return {
    select: (pid) => (byId(pid) ? selectProduct(pid) : selectProduct(state.pid)),
    ensure: () => { if (!prod) selectProduct(state.pid); }
  };
}
