/* EMESE: hero showcase, real 3D products on a slow turntable inside the proof card */
import { BUILDERS, createStage, dress, fontsReady, reduceMotion } from './products3d.js';

const SHOWCASE = [
  { id: 'tee',      tech: 'dtf',    base: '#1c1c1c', ink: '#ffe500', label: 'تيشيرت · طباعة DTF' },
  { id: 'mug',      tech: 'uvdtf',  base: '#f4f2ed', ink: '#ec008c', label: 'مج · UV DTF' },
  { id: 'notebook', tech: 'laser',  base: '#6b3f26', ink: '#f6f4ef', label: 'كشكول جلد · حفر ليزر' },
  { id: 'tee',      tech: 'stitch', base: '#1f2b4a', ink: '#f6f4ef', label: 'يونيفورم · لوجو متطرّز' },
  { id: 'pen',      tech: 'laser',  base: '#1f2b4a', ink: '#f6f4ef', label: 'قلم معدن · حفر ليزر' },
  { id: 'card',     tech: 'uv',     base: '#1c1c1c', ink: '#c9a24a', label: 'كروت · طباعة UV' }
];
const DIST = { tee: 8.4, mug: 6.6, notebook: 6.9, pen: 6.2, card: 6.2, flag: 7.8 };
const SHOW_MS = 5200;
const FADE_MS = 450;

const host = document.getElementById('heroStage');
const proof = document.querySelector('.proof');
if (host && proof) init().catch((e) => console.warn('[EMESE hero]', e));

async function init() {
  let stage;
  try { stage = createStage(host, { rims: false, exposure: 1.12, shadowOpacity: 0.22, pixelRatio: 2 }); }
  catch (e) { return; } // no WebGL: the SVG illustrations stay as the fallback

  const { renderer, scene, camera, floor, pivot, key } = stage;
  key.position.set(1.2, 7, 3.5); // light from above so shadows sit under the product
  proof.classList.add('is-3d');

  await fontsReady();
  const items = SHOWCASE.map((s) => {
    const p = BUILDERS[s.id]();
    dress(p, { ...s, text: 'EMESE' });
    return { ...s, p };
  });

  // Rebuild the progress dots for the 3D set.
  const dots = document.getElementById('proofDots');
  dots.innerHTML = items.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('');
  const label = document.getElementById('proofLabel');
  const pid = document.getElementById('proofId');

  let idx = -1, shownAt = 0;
  function show(i) {
    if (idx >= 0) pivot.remove(items[idx].p.group);
    idx = i;
    const it = items[i];
    pivot.add(it.p.group);
    floor.position.y = it.p.floorY;
    label.textContent = it.label;
    pid.textContent = `PROOF ${String(i + 1).padStart(2, '0')}`;
    [...dots.children].forEach((d, j) => d.classList.toggle('on', j === i));
    shownAt = performance.now();
    frame();
  }

  function frame() {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    camera.aspect = w / h;
    const d = (DIST[items[idx]?.id] || 7) * Math.max(1, 1.0 / camera.aspect);
    camera.position.set(0, 0.55, d);
    camera.lookAt(0, -0.1, 0);
    camera.updateProjectionMatrix();
  }
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    if (idx >= 0) frame();
  }
  new ResizeObserver(resize).observe(host);
  resize();
  show(0);

  // Gentle parallax from the pointer, so the card feels physical.
  let px = 0, py = 0, tx = 0, ty = 0;
  if (!reduceMotion) {
    window.addEventListener('pointermove', (e) => {
      tx = (e.clientX / innerWidth - 0.5) * 2;
      ty = (e.clientY / innerHeight - 0.5) * 2;
    }, { passive: true });
  }

  let fading = false;
  function next() {
    if (fading) return;
    fading = true;
    host.classList.add('fade');
    setTimeout(() => {
      show((idx + 1) % items.length);
      host.classList.remove('fade');
      fading = false;
    }, FADE_MS);
  }

  const ease = (t) => 0.5 - Math.cos(Math.PI * t) / 2;
  let running = false, raf = 0, pausedAt = 0;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const k = Math.min(1, (now - shownAt) / SHOW_MS);
    // Each product makes a slow quarter-ish turn while it's on stage.
    const turn = reduceMotion ? 0 : -0.55 + ease(k) * 1.1;
    px += (tx - px) * 0.05; py += (ty - py) * 0.05;
    pivot.rotation.y = turn + px * 0.18;
    pivot.rotation.x = py * 0.06;
    pivot.position.y = reduceMotion ? 0 : Math.sin(now / 900) * 0.04;
    renderer.render(scene, camera);
    if (k >= 1 && !document.hidden) next();
  }
  function start() { if (running) return; running = true; shownAt += pausedAt ? performance.now() - pausedAt : 0; raf = requestAnimationFrame(loop); }
  function stop() { if (!running) return; running = false; pausedAt = performance.now(); cancelAnimationFrame(raf); }
  let visible = false;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; visible ? start() : stop(); }).observe(host);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : visible && start()));
}
