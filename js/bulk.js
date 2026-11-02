/* EMESE: bulk names. One mockup and one transparent print file per name (name tags, staff uniforms,
 * personalised notebooks...), zipped in the browser. Works without the order database. */
import { addStrings, ui, lang } from './i18n.js';
import { startPage, HEADER } from './page.js';
import { MockupView, loadProduct, designFromImage } from './mockup.js';
import { PRODUCTS, TECHS, COLOR_NAMES, INKS, byId } from './catalog.js';
import { getLogo, restoreLogo } from './logo.js';
import { makeZip } from './zip.js';

document.getElementById('header').innerHTML = HEADER;

addStrings({
  'bk.title': 'Bulk names',
  'bk.sub': 'For every name on the list: a mockup for the client and a transparent print file for the machine. Everything is made on your device.',
  'bk.names': 'Names (one per line)',
  'bk.namesPh': 'Ahmed Samir\nMona Ali\nOmar Khaled',
  'bk.csv': 'Or upload a CSV sheet (first column)',
  'bk.product': 'Product',
  'bk.method': 'Method',
  'bk.color': 'Product color',
  'bk.ink': 'Text color',
  'bk.font': 'Font',
  'bk.size': 'Size',
  'bk.withLogo': 'Put the logo above the name',
  'bk.make': 'Make the files',
  'bk.preview': 'Preview',
  'bk.previewHint': 'The preview shows the first name.'
}, {
  ar: {
    fonts: { modern: 'مودرن', classic: 'كلاسيك', light: 'خفيف' },
    original: 'لون المنتج الأصلي',
    noNames: 'اكتب اسم واحد على الأقل.',
    tooMany: 'أقصى عدد ٣٠٠ اسم في المرة.',
    working: (i, n) => `بنعمل ${i.toLocaleString('ar-EG')} من ${n.toLocaleString('ar-EG')}…`,
    done: (n) => `جاهز: ${n.toLocaleString('ar-EG')} اسم.`,
    noGl: 'المتصفح ده مش بيدعم المعاينة.',
    zip: 'EMESE-names'
  },
  en: {
    fonts: { modern: 'Modern', classic: 'Classic', light: 'Light' },
    original: 'Original color',
    noNames: 'Add at least one name.',
    tooMany: 'Up to 300 names at a time.',
    working: (i, n) => `Making ${i} of ${n}…`,
    done: (n) => `Done: ${n} names.`,
    noGl: "This browser can't draw the previews.",
    zip: 'EMESE-names'
  }
});

startPage();
const $ = (id) => document.getElementById(id);
const FONTS = {
  modern: { family: '"Alexandria", sans-serif', weight: 800 },
  classic: { family: '"DM Serif Display", serif', weight: 400 },
  light: { family: '"IBM Plex Sans Arabic", sans-serif', weight: 500 }
};
const L = () => (lang() === 'en' ? 'en' : 'ar');
const nameOf = (hex) => (COLOR_NAMES[hex] ? COLOR_NAMES[hex][L() === 'en' ? 1 : 0] : hex);
let view = null;
let logoImg = null;

try { view = new MockupView($('bkCanvas')); } catch (e) { $('bkError').textContent = ui().noGl; $('bkError').hidden = false; }

function names() {
  return $('bkNames').value.split('\n').map(s => s.trim()).filter(Boolean);
}

/* the artwork for one name: transparent 2048 square, optional logo above */
function art(name, size = 2048) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const f = FONTS[$('bkFont').value];
  const withLogo = $('bkLogo').checked && logoImg;
  const box = withLogo ? { top: size * 0.56, h: size * 0.4 } : { top: size * 0.1, h: size * 0.8 };
  if (withLogo) {
    const k = Math.min((size * 0.9) / logoImg.width, (size * 0.44) / logoImg.height);
    x.drawImage(logoImg, (size - logoImg.width * k) / 2, size * 0.06 + (size * 0.44 - logoImg.height * k) / 2, logoImg.width * k, logoImg.height * k);
  }
  x.fillStyle = $('bkInk').value;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.direction = /[؀-ۿ]/.test(name) ? 'rtl' : 'ltr';
  let fs = box.h * 0.8;
  do { x.font = `${f.weight} ${fs}px ${f.family}`; fs *= 0.95; } while (x.measureText(name).width > size * 0.94 && fs > 10);
  x.fillText(name, size / 2, box.top + box.h / 2);
  return c;
}

function square(canvas, size = 1024) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d').drawImage(canvas, 0, 0, size, size);
  return c;
}

async function mockup(name) {
  const pid = $('bkProduct').value;
  const def = byId(pid);
  const prod = await loadProduct(pid);
  prod.meta.widthM = def.widthM;
  view.setProduct(prod, { pick: false });
  view.setDesign(square(art(name)));
  const tech = TECHS[$('bkMethod').value];
  const d = prod.meta.default;
  const color = $('bkColor').value;
  view.set({ tint: color || null, mode: tech.mode, gloss: tech.gloss || 0.15, pitch: tech.pitch, relief: tech.relief,
             ink: null, reveal: !!def.reveal, u: d.u, v: d.v, w: Number($('bkSize').value), rot: 0, box: false, design: true });
  view.render();
}

/* ---------------- form ---------------- */
function fill() {
  const keep = { p: $('bkProduct').value || 'notebook', m: $('bkMethod').value, c: $('bkColor').value, i: $('bkInk').value, f: $('bkFont').value || 'modern' };
  $('bkProduct').innerHTML = PRODUCTS.map(p => `<option value="${p.id}">${p[L()]}</option>`).join('');
  $('bkProduct').value = keep.p;
  const def = byId($('bkProduct').value);
  $('bkMethod').innerHTML = def.techs.map(t => `<option value="${t}">${TECHS[t][L()]}</option>`).join('');
  $('bkMethod').value = def.techs.includes(keep.m) ? keep.m : def.techs[0];
  $('bkColor').innerHTML = (def.colors.length ? def.colors : ['']).map(c => `<option value="${c}">${c ? nameOf(c) : ui().original}</option>`).join('');
  $('bkColor').value = def.colors.includes(keep.c) ? keep.c : (def.colors[0] || '');
  $('bkInk').innerHTML = INKS.map(c => `<option value="${c}">${nameOf(c)}</option>`).join('');
  $('bkInk').value = INKS.includes(keep.i) ? keep.i : INKS[1];
  $('bkFont').innerHTML = Object.keys(FONTS).map(k => `<option value="${k}">${ui().fonts[k]}</option>`).join('');
  $('bkFont').value = keep.f;
}

let pending = 0;
async function preview() {
  if (!view) return;
  const mine = ++pending;
  await new Promise(r => setTimeout(r, 120));
  if (mine !== pending) return;
  try { await mockup(names()[0] || (L() === 'en' ? 'Your name' : 'اسمك')); } catch (e) { /* product failed to load */ }
}

$('bkCsv').addEventListener('change', async () => {
  const file = $('bkCsv').files[0];
  if (!file) return;
  const text = await file.text();
  const list = text.replace(/^﻿/, '').split(/\r?\n/).map(line => {
    const m = /^\s*"((?:[^"]|"")*)"|^([^,;\t]*)/.exec(line);
    return (m[1] != null ? m[1].replace(/""/g, '"') : m[2] || '').trim();
  }).filter(Boolean);
  // a header like "name" or "الاسم" is dropped
  if (list.length && /^(name|names|الاسم|الأسماء)$/i.test(list[0])) list.shift();
  $('bkNames').value = list.join('\n');
  preview();
});

$('bkForm').addEventListener('input', (e) => {
  if (e.target.id === 'bkProduct') fill();
  preview();
});
$('bkForm').addEventListener('change', (e) => {
  if (e.target.id === 'bkProduct') fill();
  preview();
});

$('bkForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('bkError');
  err.hidden = true;
  const list = names();
  const field = $('bkNames').closest('.field');
  field.classList.toggle('bad', !list.length);
  field.querySelector('.err').textContent = list.length ? '' : ui().noNames;
  if (!list.length) { $('bkNames').focus(); return; }
  if (list.length > 300) { err.textContent = ui().tooMany; err.hidden = false; return; }
  if (!view) return;
  const btn = $('bkGo');
  btn.disabled = true;
  const files = [];
  const used = new Map();
  const toBytes = async (canvas, type, q) => new Uint8Array(await (await new Promise(r => canvas.toBlob(r, type, q))).arrayBuffer());
  try {
    for (let i = 0; i < list.length; i++) {
      $('bkStatus').textContent = ui().working(i + 1, list.length);
      const name = list[i];
      let base = `${String(i + 1).padStart(3, '0')}-${name.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60)}`;
      used.set(base, (used.get(base) || 0) + 1);
      if (used.get(base) > 1) base += `-${used.get(base)}`;
      await mockup(name);
      files.push({ name: `mockups/${base}.jpg`, data: await toBytes($('bkCanvas'), 'image/jpeg', 0.88) });
      files.push({ name: `print/${base}.png`, data: await toBytes(art(name), 'image/png') });
      await new Promise(r => setTimeout(r, 0));
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(makeZip(files));
    a.download = `${ui().zip}-${$('bkProduct').value}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    $('bkStatus').textContent = ui().done(list.length);
  } catch (x) {
    err.textContent = String(x.message || x);
    err.hidden = false;
  } finally {
    btn.disabled = false;
    preview();
  }
});

document.addEventListener('langchange', () => { fill(); preview(); });
document.addEventListener('logo:change', () => {
  const l = getLogo();
  logoImg = l ? l.canvas : null;
  $('bkLogo').disabled = !l;
  if (!l) $('bkLogo').checked = false;
  preview();
});
$('bkLogo').disabled = true;
fill();
restoreLogo();
preview();
void designFromImage;
