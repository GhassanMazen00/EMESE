/* EMESE: the visitor's own logo, kept on their device and shared by the hero, the studio and the order form. */
const KEY = 'emese-logo';
const MAX = 1200;                  // longest side kept (px)
let current = null;                // { canvas, dataUrl, name }

/* Logos often come on a white background (every JPEG, and many PNGs). Drop that background so
 * the product shows through, as a printer would: every area of the background colour goes, also
 * the inside of letters like A and O. Edge pixels, a mix of logo and background, become partly
 * transparent with the background taken out of their colour, so there is no white halo on a dark
 * shirt. A logo that fills its image with colour (a square badge) or already has transparency is
 * kept as it is. */
export function removeBackground(source) {
  const w = source.naturalWidth || source.width, h = source.naturalHeight || source.height;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(source, 0, 0);
  const img = x.getImageData(0, 0, w, h);
  const d = img.data, n = w * h;

  let clear = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) clear++;
  if (clear > n * 0.01) return c;                       // already transparent around the logo

  // background colour: the most common colour on the border (coarse buckets)
  const counts = new Map();
  const border = [];
  for (let i = 0; i < w; i++) border.push(i, (h - 1) * w + i);
  for (let j = 1; j < h - 1; j++) border.push(j * w, j * w + w - 1);
  const bucket = (p) => ((d[p * 4] >> 4) << 8) | ((d[p * 4 + 1] >> 4) << 4) | (d[p * 4 + 2] >> 4);
  for (const p of border) counts.set(bucket(p), (counts.get(bucket(p)) || 0) + 1);
  let best = 0, bestN = 0;
  counts.forEach((v, k) => { if (v > bestN) { bestN = v; best = k; } });
  if (bestN < border.length * 0.5) return c;            // no plain background: leave the image alone
  let br = 0, bg = 0, bb = 0, m = 0;
  for (const p of border) {
    if (bucket(p) === best) { br += d[p * 4]; bg += d[p * 4 + 1]; bb += d[p * 4 + 2]; m++; }
  }
  br /= m; bg /= m; bb /= m;
  // only a light, neutral background (paper white, light grey); a logo on black keeps its black
  if (Math.min(br, bg, bb) < 200 || Math.max(br, bg, bb) - Math.min(br, bg, bb) > 30) return c;

  const LO = 24, HI = 90;                               // fully background / fully logo
  const dist = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    dist[p] = Math.max(Math.abs(d[p * 4] - br), Math.abs(d[p * 4 + 1] - bg), Math.abs(d[p * 4 + 2] - bb));
  }
  const isBg = (p) => dist[p] < LO;
  for (let p = 0; p < n; p++) {
    if (isBg(p)) { d[p * 4 + 3] = 0; continue; }
    if (dist[p] >= HI) continue;
    // a pixel between logo and background: only on an edge (next to background), never a pale
    // colour inside the logo
    const px = p % w, py = (p - px) / w;
    const edge = (px > 0 && isBg(p - 1)) || (px < w - 1 && isBg(p + 1)) ||
                 (py > 0 && isBg(p - w)) || (py < h - 1 && isBg(p + w));
    if (!edge) continue;
    const a = (dist[p] - LO) / (HI - LO);
    d[p * 4] = Math.min(255, Math.max(0, (d[p * 4] - br * (1 - a)) / a));
    d[p * 4 + 1] = Math.min(255, Math.max(0, (d[p * 4 + 1] - bg * (1 - a)) / a));
    d[p * 4 + 2] = Math.min(255, Math.max(0, (d[p * 4 + 2] - bb * (1 - a)) / a));
    d[p * 4 + 3] = Math.round(a * 255);
  }
  x.putImageData(img, 0, 0);
  return c;
}
export const knockOutWhite = removeBackground;

function toCanvas(img) {
  const w = img.naturalWidth || img.width || 1024, h = img.naturalHeight || img.height || 1024;   // SVGs may have no size
  const k = Math.min(1, MAX / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image'));
    img.src = src;
  });
}

/* Read a picked file into a transparent canvas. Throws 'type' or 'image'. */
export async function readLogoFile(file) {
  if (!file || !/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) throw new Error('type');
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImg(url);
    // SVGs keep their own transparency; everything else loses a plain background if it has one
    return toCanvas(file.type === 'image/svg+xml' ? img : removeBackground(toCanvas(img)));
  } finally {
    URL.revokeObjectURL(url);
  }
}

function announce() {
  document.dispatchEvent(new CustomEvent('logo:change', { detail: current }));
}

export async function setLogo(canvas, name = '') {
  const dataUrl = canvas.toDataURL('image/png');
  current = { canvas, dataUrl, name };
  try { localStorage.setItem(KEY, JSON.stringify({ dataUrl, name })); } catch (e) { /* too big or blocked: keep for this visit */ }
  announce();
  return current;
}

export function clearLogo() {
  current = null;
  try { localStorage.removeItem(KEY); } catch (e) { /* blocked */ }
  announce();
}

export const getLogo = () => current;

/* Restore a logo saved on an earlier visit. */
export async function restoreLogo() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { saved = null; }
  if (!saved || !saved.dataUrl) return null;
  try {
    const img = await loadImg(saved.dataUrl);
    current = { canvas: toCanvas(img), dataUrl: saved.dataUrl, name: saved.name || '' };
    announce();
    return current;
  } catch (e) {
    return null;
  }
}

/* PNG blob of the logo, for uploading with an order. */
export function logoBlob() {
  return new Promise((resolve) => (current ? current.canvas.toBlob(resolve, 'image/png') : resolve(null)));
}

/* Alpha-weighted average luminance (0..1) of a canvas: how light the logo reads. */
export function logoLuminance(canvas) {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(canvas, 0, 0, s, s);
  const d = x.getImageData(0, 0, s, s).data;
  let sum = 0, wsum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    if (a < 0.05) continue;
    const lin = [d[i], d[i + 1], d[i + 2]].map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    sum += a * (0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]);
    wsum += a;
  }
  return wsum ? sum / wsum : 0.5;
}
