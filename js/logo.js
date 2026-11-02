/* EMESE: the visitor's own logo, kept on their device and shared by the hero, the studio and the order form. */
const KEY = 'emese-logo';
const MAX = 1200;                  // longest side kept (px)
let current = null;                // { canvas, dataUrl, name }

/* JPEGs have no transparency: drop a near-white background. */
export function knockOutWhite(source) {
  const c = document.createElement('canvas');
  c.width = source.naturalWidth || source.width;
  c.height = source.naturalHeight || source.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(source, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    const m = Math.min(d.data[i], d.data[i + 1], d.data[i + 2]);
    if (m > 235) d.data[i + 3] = Math.max(0, (255 - m) * 12);
  }
  x.putImageData(d, 0, 0);
  return c;
}

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
    const src = file.type === 'image/jpeg' ? knockOutWhite(img) : img;
    return toCanvas(src);
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
