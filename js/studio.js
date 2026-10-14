/* EMESE: 3D studio, live product mockups built with three.js */
import {
  THREE, TECHS, COLORS, INKS, PRODUCTS, FAMILY, reduceMotion,
  engraveTone, drawArt, BUILDERS, applyTech, createStage, fontsReady
} from './products3d.js';
/* =========================================================
   Scene
   ========================================================= */
const host = document.getElementById('stage');
if (host) init().catch((err) => fail(err));

function fail(err) {
  console.warn('[EMESE studio]', err);
  host.innerHTML = '<p class="stage-fallback">المعاينة الـ3D مش شغالة على الجهاز ده، بس ممكن تكلّمنا ونبعتلك موكب جاهز.</p>';
}

async function init() {
  let stage;
  try { stage = createStage(host); } catch (e) { fail(e); return; }
  const { renderer, scene, camera, floor, pivot } = stage;

  /* ---------- state ---------- */
  const state = { product: PRODUCTS[0], tech: PRODUCTS[0].techs[0], base: PRODUCTS[0].base, ink: PRODUCTS[0].ink, text: 'EMESE' };
  const built = {};
  let current = null;
  let popT = 1;

  function getBuilt(id) { return built[id] ||= BUILDERS[id](); }

  function refreshArt() {
    const p = current;
    const ink = state.tech === 'laser' ? engraveTone(state.base) : state.ink;
    drawArt(p.print.canvas, { layout: p.layout, text: state.text.trim(), ink, tech: state.tech, bg: p.fullBleed ? state.base : null });
    p.print.tex.needsUpdate = true;
  }
  function refreshBase() {
    current.baseMats.forEach(m => m.color.set(state.base));
    if (current.fullBleed) refreshArt();
  }

  function showProduct(def) {
    if (current) pivot.remove(current.group);
    current = getBuilt(def.id);
    pivot.add(current.group);
    floor.position.y = current.floorY;
    popT = reduceMotion ? 1 : 0;
    refreshBase();
    applyTech(current, state.tech);
    refreshArt();
    frame();
  }

  /* ---------- framing ---------- */
  function frame() {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    const aspect = w / h;
    camera.aspect = aspect;
    const d = state.product.dist * Math.max(1, 1.05 / aspect);
    camera.position.set(0, 0.35, d);
    camera.lookAt(0, -0.05, 0);
    camera.updateProjectionMatrix();
  }
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    frame();
  }
  new ResizeObserver(resize).observe(host);
  resize();

  /* ---------- drag to rotate ---------- */
  let spin = 0, spinTarget = 0, tilt = 0, tiltTarget = 0, dragging = false, lastX = 0, lastY = 0, lastInput = -1e9;
  const hint = document.querySelector('.stage-hint');
  host.addEventListener('pointerdown', (e) => {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    host.setPointerCapture(e.pointerId);
    hint?.classList.add('hide');
  });
  host.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    spinTarget += (e.clientX - lastX) * 0.012;
    tiltTarget = THREE.MathUtils.clamp(tiltTarget + (e.clientY - lastY) * 0.006, -0.5, 0.5);
    lastX = e.clientX; lastY = e.clientY;
    lastInput = performance.now();
  });
  const end = () => { dragging = false; lastInput = performance.now(); };
  host.addEventListener('pointerup', end);
  host.addEventListener('pointercancel', end);

  /* ---------- loop (only while visible) ---------- */
  const clock = new THREE.Clock();
  let running = false, raf = 0;
  function loop() {
    raf = requestAnimationFrame(loop);
    const t = clock.getElapsedTime();
    const idle = !dragging && performance.now() - lastInput > 2500;
    if (idle) {
      // Drift back to the front, then sway gently.
      spinTarget += (Math.round(spinTarget / (Math.PI * 2)) * Math.PI * 2 - spinTarget) * 0.03;
      tiltTarget *= 0.95;
    }
    spin += (spinTarget - spin) * 0.12;
    tilt += (tiltTarget - tilt) * 0.12;
    const sway = reduceMotion ? 0 : Math.sin(t * 0.6) * 0.32;
    pivot.rotation.y = spin + sway;
    pivot.rotation.x = tilt;
    pivot.position.y = reduceMotion ? 0 : Math.sin(t * 1.2) * 0.05;

    if (popT < 1) {
      popT = Math.min(1, popT + 0.045);
      const e = 1 + 2.2 * Math.pow(popT - 1, 3) + 1.2 * Math.pow(popT - 1, 2); // easeOutBack
      pivot.scale.setScalar(Math.max(0.001, e));
    } else pivot.scale.setScalar(1);

    current?.tick?.(reduceMotion ? 0.6 : t);
    renderer.render(scene, camera);
  }
  const vis = new IntersectionObserver(([en]) => {
    if (en.isIntersecting && !running) { running = true; clock.start(); loop(); }
    else if (!en.isIntersecting && running) { running = false; cancelAnimationFrame(raf); }
  }, { rootMargin: '100px' });
  vis.observe(host);

  /* =========================================================
     UI
     ========================================================= */
  const $ = (id) => document.getElementById(id);
  const productPicker = $('productPicker'), techPicker = $('techPicker'), techNote = $('techNote');
  const baseSw = $('baseSwatches'), inkSw = $('inkSwatches'), textInput = $('artText'), tag = $('stageTag');

  function radio(container, items, selected, onPick, opts = {}) {
    container.innerHTML = '';
    items.forEach((it) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(it.value === selected));
      if (opts.swatch) { b.style.setProperty('--sw', it.value); b.setAttribute('aria-label', it.label); b.title = it.label; }
      else b.textContent = it.label;
      if (it.disabled) { b.disabled = true; b.title = it.reason || ''; }
      b.addEventListener('click', () => onPick(it.value));
      container.appendChild(b);
    });
  }

  function renderUI() {
    const p = state.product;
    radio(productPicker, PRODUCTS.map(d => ({ value: d.id, label: d.label })), p.id, (id) => {
      const def = PRODUCTS.find(d => d.id === id);
      state.product = def;
      if (!def.techs.includes(state.tech)) state.tech = def.techs[0];
      state.base = def.base; state.ink = def.ink;
      showProduct(def); renderUI();
    });
    radio(techPicker, Object.entries(TECHS).map(([k, v]) => ({
      value: k, label: v.label, disabled: !p.techs.includes(k), reason: `مش مناسبة لل${p.label}`
    })), state.tech, (k) => {
      state.tech = k; applyTech(current, k); refreshArt(); renderUI();
    });
    techNote.textContent = TECHS[state.tech].note;
    radio(baseSw, p.bases.map(c => ({ value: c, label: COLORS[c] || c })), state.base, (c) => {
      state.base = c; refreshBase(); if (state.tech === 'laser') refreshArt(); renderUI();
    }, { swatch: true });
    const laser = state.tech === 'laser';
    radio(inkSw, INKS.map(c => ({ value: c, label: COLORS[c] || c, disabled: laser, reason: 'الليزر مالوش حبر' })), laser ? null : state.ink, (c) => {
      state.ink = c; refreshArt(); renderUI();
    }, { swatch: true });
    tag.textContent = `${p.label} • ${TECHS[state.tech].label}`;
    window.__emeseMockup = `${p.label} / ${TECHS[state.tech].label} / لون ${COLORS[state.base] || state.base} / «${state.text.trim() || 'EMESE'}»`;
  }

  textInput.addEventListener('input', () => { state.text = textInput.value; refreshArt(); renderUI(); });

  // Download a framed PNG of the current view.
  $('snapBtn').addEventListener('click', () => {
    renderer.render(scene, camera);
    const src = renderer.domElement;
    const out = document.createElement('canvas');
    out.width = src.width; out.height = src.height;
    const x = out.getContext('2d');
    const grd = x.createRadialGradient(out.width / 2, out.height * 0.38, 0, out.width / 2, out.height * 0.38, out.width * 0.75);
    grd.addColorStop(0, '#3a3631'); grd.addColorStop(0.55, '#201e1b'); grd.addColorStop(1, '#161513');
    x.fillStyle = grd; x.fillRect(0, 0, out.width, out.height);
    x.drawImage(src, 0, 0);
    const u = out.width / 100;
    x.fillStyle = '#f4efe6'; x.font = `400 ${u * 4}px "DM Serif Display", ${FAMILY}`; x.textBaseline = 'top'; x.direction = 'ltr'; x.textAlign = 'left';
    x.fillText('EMESE', u * 4, u * 4);
    x.font = `600 ${u * 2.2}px ${FAMILY}`; x.direction = 'rtl'; x.textAlign = 'right'; x.fillStyle = 'rgba(244,239,230,.7)';
    x.fillText(`${state.product.label} • ${TECHS[state.tech].label}`, out.width - u * 4, u * 5);
    const a = document.createElement('a');
    a.download = `EMESE-${state.product.id}-${state.tech}.png`;
    a.href = out.toDataURL('image/png');
    a.click();
  });

  // "Order this" pre-fills the contact form.
  $('orderBtn').addEventListener('click', () => {
    const sel = document.getElementById('contactProduct');
    if (sel) sel.value = state.product.contact;
    const details = document.querySelector('#contactForm textarea');
    if (details && !details.value) details.value = `عايز ${state.product.label} بطريقة ${TECHS[state.tech].label}، والتصميم: «${state.text.trim() || 'EMESE'}».`;
  });

  showProduct(state.product);
  renderUI();

  // Redraw once the display font is ready so the canvas uses it.
  await fontsReady();
  refreshArt();
}
