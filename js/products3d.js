/* EMESE: shared 3D product library (models, artwork, print materials, stage) */
import * as THREE from 'three';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';
import { TessellateModifier } from './vendor/TessellateModifier.js';
import { mergeVertices } from './vendor/BufferGeometryUtils.js';

/* =========================================================
   Data
   ========================================================= */
export const TECHS = {
  dtf:    { label: 'DTF',     note: 'بنطبع على فيلم ونكبسه بالحرارة. ألوان كاملة على أي لون قماش، وبيستحمل الغسيل.' },
  stitch: { label: 'تطريز',   note: 'اللوجو بيتخيّط بالخيط غرزة غرزة. شكل رسمي وملمس بارز، ومكانه الطبيعي على الصدر.' },
  sub:    { label: 'سبلميشن', note: 'الحبر بيدخل جوّه ألياف البوليستر أو طبقة المج، فمش هتحسّ بيه خالص. أحلى على الألوان الفاتحة.' },
  uvdtf:  { label: 'UV DTF',  note: 'ستيكر كريستال من غير خلفية، بلمعة وبروز. بيتلزق على أي سطح ناشف.' },
  uv:     { label: 'UV',      note: 'طباعة مباشرة على المنتج والحبر بيتجفف بالأشعة في ساعتها. ألوان قوية بلمسة بارزة.' },
  laser:  { label: 'ليزر',    note: 'الليزر بيحفر جوّه الخامة نفسها، فمالوش لون حبر ومستحيل يتمسح.' }
};

export const COLORS = {
  '#f4f2ed': 'أبيض', '#1c1c1c': 'أسود', '#1f2b4a': 'كحلي', '#b5162b': 'أحمر',
  '#d9c7a5': 'بيج', '#2a7a6f': 'أخضر زيتي', '#6b3f26': 'بني جلد', '#e9e1d1': 'كرافت',
  '#b8bcc4': 'فضي', '#c9a24a': 'دهبي', '#ffe500': 'أصفر', '#00aeef': 'سماوي',
  '#ec008c': 'فوشيا', '#141414': 'أسود', '#f6f4ef': 'أبيض'
};
export const INKS = ['#141414', '#f6f4ef', '#ec008c', '#00aeef', '#ffe500', '#c9a24a', '#b5162b'];

export const PRODUCTS = [
  { id: 'tee',      label: 'تيشيرت', contact: 'يونيفورم مطبوع',  techs: ['dtf', 'stitch', 'sub'],  bases: ['#f4f2ed', '#1c1c1c', '#1f2b4a', '#b5162b', '#d9c7a5', '#2a7a6f'], base: '#1c1c1c', ink: '#ffe500', dist: 7.6 },
  { id: 'notebook', label: 'كشكول',  contact: 'كشاكيل وأجندات',  techs: ['laser', 'uv', 'uvdtf'],  bases: ['#6b3f26', '#1c1c1c', '#1f2b4a', '#b5162b', '#e9e1d1', '#2a7a6f'], base: '#6b3f26', ink: '#f6f4ef', dist: 7.0 },
  { id: 'pen',      label: 'قلم',    contact: 'أقلام',            techs: ['laser', 'uv'],           bases: ['#1f2b4a', '#1c1c1c', '#b8bcc4', '#b5162b', '#c9a24a'],            base: '#1f2b4a', ink: '#f6f4ef', dist: 6.0 },
  { id: 'mug',      label: 'مج',     contact: 'مجات وزمزميات',    techs: ['uvdtf', 'sub', 'uv'],    bases: ['#f4f2ed', '#1c1c1c', '#1f2b4a', '#b5162b', '#2a7a6f'],            base: '#f4f2ed', ink: '#ec008c', dist: 5.4 },
  { id: 'flag',     label: 'علم',    contact: 'أعلام ورايات',     techs: ['sub', 'dtf'],            bases: ['#1f2b4a', '#f4f2ed', '#1c1c1c', '#b5162b', '#ffe500', '#00aeef'], base: '#1f2b4a', ink: '#ffe500', dist: 7.8 },
  { id: 'card',     label: 'كارت',   contact: 'كروت',             techs: ['uv', 'laser'],           bases: ['#1c1c1c', '#f4f2ed', '#1f2b4a', '#6b3f26', '#c9a24a'],            base: '#1c1c1c', ink: '#c9a24a', dist: 6.0 }
];

export const FAMILY = '"Alexandria", "IBM Plex Sans Arabic", sans-serif';
const TAGLINE = 'صُنع في مصر';
export const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* =========================================================
   Colour helpers
   ========================================================= */
const toRGB = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = toRGB(a), B = toRGB(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
const luma = (hex) => { const [r, g, b] = toRGB(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
// What a laser leaves behind: dark materials reveal a lighter layer, light ones burn darker.
export const engraveTone = (base) => luma(base) < 0.45 ? mix(base, '#f1e6d2', 0.62) : mix(base, '#2b1a10', 0.62);

/* =========================================================
   Artwork (drawn to a canvas, used as a texture)
   ========================================================= */
const isArabic = (s) => /[؀-ۿ]/.test(s);

function fit(ctx, text, weight, maxW, maxSize) {
  let size = maxSize;
  for (; size > 12; size -= 3) {
    ctx.font = `${weight} ${size}px ${FAMILY}`;
    if (ctx.measureText(text).width <= maxW) break;
  }
  return size;
}

// Layouts return a list of simple primitives so the same design can be
// painted flat (print), with stitches (embroidery) or as an engraving.
function layoutBadge(ctx, w, h, text) {
  const s = Math.min(w, h), cx = w / 2, cy = h / 2;
  const size = fit(ctx, text, 900, s * 0.62, s * 0.22);
  return [
    { k: 'ring', x: cx, y: cy, r: s * 0.44, lw: s * 0.026 },
    { k: 'ring', x: cx, y: cy, r: s * 0.395, lw: s * 0.008 },
    { k: 'text', t: text, x: cx, y: cy - s * 0.02, size, weight: 900 },
    { k: 'line', x1: cx - s * 0.2, y1: cy + s * 0.105, x2: cx + s * 0.2, y2: cy + s * 0.105, lw: s * 0.008 },
    { k: 'text', t: TAGLINE, x: cx, y: cy + s * 0.2, size: s * 0.058, weight: 600 },
    { k: 'star', x: cx, y: cy - s * 0.3, r: s * 0.035 }
  ];
}
function layoutStrip(ctx, w, h, text) {
  const size = fit(ctx, text, 800, w * 0.78, h * 0.62);
  ctx.font = `800 ${size}px ${FAMILY}`;
  const tw = ctx.measureText(text).width;
  return [
    { k: 'text', t: text, x: w / 2, y: h / 2, size, weight: 800 },
    { k: 'dot', x: w / 2 - tw / 2 - h * 0.3, y: h / 2, r: h * 0.06 },
    { k: 'dot', x: w / 2 + tw / 2 + h * 0.3, y: h / 2, r: h * 0.06 }
  ];
}
function layoutWrap(ctx, w, h, text) {
  const size = fit(ctx, text, 900, w * 0.72, h * 0.36);
  return [
    { k: 'text', t: text, x: w / 2, y: h * 0.44, size, weight: 900 },
    { k: 'line', x1: w * 0.2, y1: h * 0.72, x2: w * 0.33, y2: h * 0.72, lw: h * 0.012 },
    { k: 'line', x1: w * 0.67, y1: h * 0.72, x2: w * 0.8, y2: h * 0.72, lw: h * 0.012 },
    { k: 'text', t: TAGLINE, x: w / 2, y: h * 0.72, size: h * 0.075, weight: 600 }
  ];
}
function layoutCard(ctx, w, h, text) {
  const size = fit(ctx, text, 900, w * 0.74, h * 0.3);
  return [
    { k: 'text', t: text, x: w / 2, y: h * 0.44, size, weight: 900 },
    { k: 'line', x1: w * 0.38, y1: h * 0.66, x2: w * 0.62, y2: h * 0.66, lw: h * 0.01 },
    { k: 'text', t: TAGLINE, x: w / 2, y: h * 0.8, size: h * 0.07, weight: 600 },
    { k: 'star', x: w * 0.08, y: h * 0.14, r: h * 0.035 },
    { k: 'star', x: w * 0.92, y: h * 0.86, r: h * 0.035 }
  ];
}

function paint(ctx, prims, mode) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const p of prims) {
    if (p.k === 'text') {
      ctx.direction = isArabic(p.t) ? 'rtl' : 'ltr';
      ctx.font = `${p.weight} ${p.size}px ${FAMILY}`;
      if (mode === 'outline') { ctx.lineWidth = Math.max(2, p.size * 0.03); ctx.strokeText(p.t, p.x, p.y); }
      else ctx.fillText(p.t, p.x, p.y);
    } else if (p.k === 'ring' && mode !== 'outline') {
      ctx.lineWidth = p.lw; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke();
    } else if (p.k === 'line' && mode !== 'outline') {
      ctx.lineWidth = p.lw; ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke();
    } else if (p.k === 'dot' && mode !== 'outline') {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    } else if (p.k === 'star' && mode !== 'outline') {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? p.r * 0.38 : p.r;
        ctx.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill();
    }
  }
}

// Draws the design onto `canvas`. Returns nothing; caller flags the texture for upload.
export function drawArt(canvas, { layout, text, ink, tech, bg }) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }

  // The pen's print area is a long vertical strip: lay out horizontally, then rotate.
  const rotated = layout === 'strip';
  const lw = rotated ? h : w, lh = rotated ? w : h;
  const layer = document.createElement('canvas');
  layer.width = lw; layer.height = lh;
  const c = layer.getContext('2d');
  const layouts = { badge: layoutBadge, strip: layoutStrip, wrap: layoutWrap, card: layoutCard, flag: layoutBadge };
  const prims = layouts[layout](c, lw, lh, text || 'EMESE');

  c.fillStyle = c.strokeStyle = ink;
  paint(c, prims, 'fill');

  if (tech === 'stitch') {
    // Satin-stitch look: diagonal threads clipped to the artwork + a running-stitch border.
    c.globalCompositeOperation = 'source-atop';
    const step = Math.max(5, lw / 170);
    for (let x = -lh; x < lw; x += step) {
      c.strokeStyle = mix(ink, '#000000', 0.32); c.lineWidth = step * 0.35;
      c.beginPath(); c.moveTo(x, lh); c.lineTo(x + lh * 0.7, 0); c.stroke();
      c.strokeStyle = mix(ink, '#ffffff', 0.22); c.lineWidth = step * 0.18;
      c.beginPath(); c.moveTo(x + step * 0.5, lh); c.lineTo(x + step * 0.5 + lh * 0.7, 0); c.stroke();
    }
    c.globalCompositeOperation = 'source-over';
    c.strokeStyle = mix(ink, '#000000', 0.45);
    c.setLineDash([lw / 120, lw / 260]);
    paint(c, prims, 'outline');
    c.setLineDash([]);
  } else if (tech === 'laser') {
    // Burn texture: fine horizontal scan lines.
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = 'rgba(0,0,0,.14)';
    for (let y = 0; y < lh; y += 4) c.fillRect(0, y, lw, 1.4);
    c.globalCompositeOperation = 'source-over';
  } else if (tech === 'sub') {
    c.globalCompositeOperation = 'destination-in';
    c.fillStyle = 'rgba(0,0,0,.9)'; c.fillRect(0, 0, lw, lh);
    c.globalCompositeOperation = 'source-over';
  }

  if (rotated) {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(layer, -lw / 2, -lh / 2);
    ctx.restore();
  } else {
    ctx.drawImage(layer, 0, 0);
  }
}

/* =========================================================
   Procedural textures
   ========================================================= */
function fabricTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#808080'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 2) {
    x.fillStyle = `rgba(255,255,255,${0.10 + Math.random() * 0.08})`; x.fillRect(0, i, 128, 1);
    x.fillStyle = `rgba(0,0,0,${0.10 + Math.random() * 0.08})`; x.fillRect(i, 0, 1, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(9, 9);
  return t;
}
function grainTexture(repeat = 3) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  const img = x.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 110 + Math.random() * 36;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  return t;
}

/* =========================================================
   Products
   ========================================================= */
function makePrint(geometry, canvasW, canvasH) {
  const canvas = document.createElement('canvas');
  canvas.width = canvasW; canvas.height = canvasH;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshPhysicalMaterial({
    map: tex, transparent: true, alphaTest: 0.04, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
  });
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.renderOrder = 2;
  return { mesh, canvas, tex, mat };
}

// A worn tee isn't flat: the torso wraps around a body and the cloth ripples a little.
const teeWrap = (x, y) => -0.2 * x * x + 0.018 * Math.sin(3.1 * x + 1.7 * y) * Math.sin(2.3 * y - 0.6);

function buildTee() {
  const s = new THREE.Shape();
  s.moveTo(-0.4, 1.3);
  s.quadraticCurveTo(0, 0.98, 0.4, 1.3);
  s.lineTo(1.02, 1.12);
  s.quadraticCurveTo(1.38, 0.95, 1.7, 0.5);
  s.lineTo(1.3, 0.16);
  s.lineTo(1.0, 0.42);
  s.quadraticCurveTo(0.97, -0.4, 1.02, -1.4);
  s.quadraticCurveTo(0, -1.48, -1.02, -1.4);
  s.quadraticCurveTo(-0.97, -0.4, -1.0, 0.42);
  s.lineTo(-1.3, 0.16);
  s.lineTo(-1.7, 0.5);
  s.quadraticCurveTo(-1.38, 0.95, -1.02, 1.12);
  s.closePath();
  const depth = 0.2, bevel = 0.14;
  let geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: 0.1, bevelSegments: 8, curveSegments: 36 });
  geo.translate(0, 0, -depth / 2);
  // Subdivide the flat caps so they can bend, then weld and wrap them.
  geo = new TessellateModifier(0.09, 10).modify(geo);
  geo.deleteAttribute('normal');
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { uv[i * 2] = pos.getX(i); uv[i * 2 + 1] = pos.getY(i); }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo = mergeVertices(geo, 1e-4);
  const P = geo.attributes.position;
  for (let i = 0; i < P.count; i++) P.setZ(i, P.getZ(i) + teeWrap(P.getX(i), P.getY(i)));
  geo.computeVertexNormals();

  const fabric = fabricTexture();
  const body = new THREE.MeshPhysicalMaterial({ roughness: 0.95, bumpMap: fabric, bumpScale: 0.5, sheen: 0.18, sheenRoughness: 0.9, sheenColor: new THREE.Color('#8a8a8a') });
  const g = new THREE.Group();
  const tee = new THREE.Mesh(geo, body); tee.castShadow = true;
  g.add(tee);

  const front = depth / 2 + bevel;
  const onFront = (x, y, lift = 0) => new THREE.Vector3(x, y, front + teeWrap(x, y) + lift);
  const tube = (pts, r, mat) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 3, r, 10, false), mat);

  // Rib collar
  const collarMat = new THREE.MeshPhysicalMaterial({ roughness: 0.9, bumpMap: fabric, bumpScale: 0.5 });
  const neck = new THREE.QuadraticBezierCurve(new THREE.Vector2(-0.42, 1.27), new THREE.Vector2(0, 0.93), new THREE.Vector2(0.42, 1.27));
  g.add(tube(neck.getPoints(24).map(p => onFront(p.x, p.y, -0.005)), 0.045, collarMat));

  // Stitched hems: bottom and both sleeves, as slight ridges in the cloth.
  const hem = [];
  for (let i = 0; i <= 24; i++) { const x = -0.96 + (1.92 * i) / 24; hem.push(onFront(x, -1.44 + 0.04 * (x / 1.02) ** 2 + 0.13, -0.012)); }
  g.add(tube(hem, 0.016, body));
  for (const sx of [1, -1]) {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = 0.1 + 0.8 * (i / 10);
      const x = 1.7 + (1.3 - 1.7) * t - 0.08, y = 0.5 + (0.16 - 0.5) * t + 0.095;
      pts.push(onFront(sx * x, y, -0.012));
    }
    g.add(tube(pts, 0.014, body));
  }

  // The print follows the same curve as the cloth underneath it.
  const printGeo = new THREE.PlaneGeometry(1, 1, 24, 24);
  const flat = Float32Array.from(printGeo.attributes.position.array);
  const print = makePrint(printGeo, 1024, 1024);
  g.add(print.mesh);
  function placePrint(px, py, size) {
    const a = printGeo.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const x = flat[i * 3] * size, y = flat[i * 3 + 1] * size;
      a.setXYZ(i, x, y, teeWrap(px + x, py + y));
    }
    a.needsUpdate = true;
    printGeo.computeVertexNormals();
    print.mesh.position.set(px, py, front + 0.006);
  }

  return {
    group: g, print, layout: 'badge', floorY: -1.75,
    baseMats: [body, collarMat],
    place(tech) {
      // Embroidery sits on the chest like a real logo; prints go big and central.
      if (tech === 'stitch') placePrint(0.48, 0.52, 0.5);
      else placePrint(0, 0.12, 1.25);
    }
  };
}

function buildNotebook() {
  const W = 2.0, H = 2.7;
  const g = new THREE.Group();
  const coverMat = new THREE.MeshStandardMaterial({ roughness: 0.62, bumpMap: grainTexture(4), bumpScale: 0.5 });
  const coverGeo = new RoundedBoxGeometry(W, H, 0.05, 3, 0.022);
  const back = new THREE.Mesh(coverGeo, coverMat); back.position.z = -0.14; back.castShadow = true;
  const front = new THREE.Mesh(coverGeo, coverMat); front.position.z = 0.14; front.castShadow = true;
  const pages = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, H - 0.1, 0.24), new THREE.MeshStandardMaterial({ color: '#f3efe4', roughness: 0.95 }));
  pages.position.x = 0.03;
  g.add(back, front, pages);

  const metal = new THREE.MeshStandardMaterial({ color: '#c9ccd2', metalness: 1, roughness: 0.28 });
  const ringGeo = new THREE.TorusGeometry(0.1, 0.014, 10, 28);
  for (let i = 0; i < 17; i++) {
    const r = new THREE.Mesh(ringGeo, metal);
    r.rotation.y = Math.PI / 2;
    r.position.set(-W / 2 + 0.03, -H / 2 + 0.17 + i * ((H - 0.34) / 16), 0);
    g.add(r);
  }
  const band = new THREE.Mesh(new RoundedBoxGeometry(0.07, H + 0.015, 0.34, 2, 0.02), new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.5 }));
  band.position.x = W / 2 - 0.3;
  g.add(band);

  const print = makePrint(new THREE.PlaneGeometry(1.38, 1.38), 1024, 1024);
  print.mesh.position.set(-0.12, 0.1, 0.14 + 0.025 + 0.002);
  g.add(print.mesh);

  return { group: g, print, layout: 'badge', floorY: -1.6, baseMats: [coverMat] };
}

function buildPen() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshPhysicalMaterial({ metalness: 0.65, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  const chrome = new THREE.MeshStandardMaterial({ color: '#d8dbe0', metalness: 1, roughness: 0.15 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#202020', roughness: 0.85 });

  const add = (geo, mat, x, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  const along = (geo) => { geo.rotateZ(Math.PI / 2); return geo; }; // y-axis → x-axis

  add(along(new THREE.CylinderGeometry(0.12, 0.12, 2.3, 64)), bodyMat, 0.05);
  add(along(new THREE.CylinderGeometry(0.115, 0.1, 0.55, 64)), rubber, -1.37);
  add(along(new THREE.ConeGeometry(0.1, 0.32, 64)), chrome, -1.8);
  add(along(new THREE.ConeGeometry(0.024, 0.08, 24)), chrome, -2.0);
  add(along(new THREE.CylinderGeometry(0.124, 0.124, 0.12, 64)), chrome, 1.25);
  add(along(new THREE.CylinderGeometry(0.118, 0.11, 0.22, 64)), bodyMat, 1.42);
  const cap = add(new THREE.SphereGeometry(0.11, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), chrome, 1.53);
  cap.rotation.z = -Math.PI / 2;
  const clip = add(new RoundedBoxGeometry(1.1, 0.07, 0.04, 2, 0.015), chrome, 0.85, 0, -0.15);
  clip.rotation.z = 0;

  const print = makePrint(along(new THREE.CylinderGeometry(0.1215, 0.1215, 1.6, 64, 1, true, -Math.PI * 0.32, Math.PI * 0.64)), 256, 1536);
  print.mesh.position.x = 0.05;
  g.add(print.mesh);

  g.rotation.z = 0.32;
  g.scale.setScalar(1.15);
  return { group: g, print, layout: 'strip', floorY: -1.25, baseMats: [bodyMat] };
}

function buildMug() {
  const g = new THREE.Group();
  const pts = [[0, -0.8], [0.58, -0.8], [0.63, -0.78], [0.66, -0.72], [0.66, 0.78], [0.645, 0.82], [0.605, 0.82], [0.59, 0.78], [0.59, -0.66], [0, -0.66]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const ceramic = new THREE.MeshPhysicalMaterial({ roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08 });
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 128), ceramic);
  body.castShadow = true;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.075, 24, 64, Math.PI), ceramic);
  handle.rotation.z = -Math.PI / 2;
  handle.scale.set(1, 1.15, 1);
  handle.position.set(0.63, 0.02, 0);
  handle.castShadow = true;
  g.add(body, handle);

  const print = makePrint(new THREE.CylinderGeometry(0.664, 0.664, 1.12, 128, 1, true, -Math.PI * 0.42, Math.PI * 0.84), 1100, 700);
  print.mesh.position.y = 0.02;
  g.add(print.mesh);

  g.rotation.y = -0.35;
  g.scale.setScalar(1.25);
  return { group: g, print, layout: 'wrap', floorY: -1.0, baseMats: [ceramic] };
}

function buildFlag() {
  const g = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: '#d0d3d8', metalness: 1, roughness: 0.25 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 4.1, 24), poleMat);
  pole.position.set(-1.5, -0.35, 0); pole.castShadow = true;
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 16), poleMat);
  finial.position.set(-1.5, 1.74, 0);
  g.add(pole, finial);

  const FW = 2.9, FH = 1.9;
  const geo = new THREE.PlaneGeometry(FW, FH, 60, 36);
  geo.translate(FW / 2, 0, 0);
  const base = Float32Array.from(geo.attributes.position.array);
  const print = makePrint(geo, 1160, 760);
  // The cloth itself carries the full design, so it's opaque and double-sided.
  Object.assign(print.mat, { transparent: false, alphaTest: 0, depthWrite: true, side: THREE.DoubleSide, polygonOffset: false, roughness: 0.85 });
  print.mesh.position.set(-1.47, 0.72, 0);
  print.mesh.castShadow = true;
  g.add(print.mesh);

  return {
    group: g, print, layout: 'flag', fullBleed: true, floorY: -2.4, baseMats: [],
    tick(t) {
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1], k = x / FW;
        p.array[i * 3 + 2] = Math.sin(x * 2.1 - t * 3.0 + y * 0.5) * 0.3 * k + Math.sin(x * 4.3 - t * 4.6) * 0.06 * k;
        p.array[i * 3 + 1] = y - k * k * 0.08;
      }
      p.needsUpdate = true;
      geo.computeVertexNormals();
    }
  };
}

function buildCard() {
  const g = new THREE.Group();
  const cardMat = new THREE.MeshPhysicalMaterial({ roughness: 0.5, clearcoat: 0.3 });
  const geo = new RoundedBoxGeometry(2.6, 1.56, 0.028, 2, 0.012);
  const back = new THREE.Mesh(geo, cardMat);
  back.position.set(0.32, -0.42, -0.28); back.rotation.set(-0.05, 0.1, -0.16); back.castShadow = true;
  const front = new THREE.Mesh(geo, cardMat); front.castShadow = true;
  g.add(back, front);

  const print = makePrint(new THREE.PlaneGeometry(2.6, 1.56), 1300, 780);
  print.mesh.position.z = 0.0145;
  front.add(print.mesh);
  front.rotation.set(-0.08, 0, 0.06);
  front.position.set(-0.1, 0.18, 0.1);

  g.scale.setScalar(1.15);
  return { group: g, print, layout: 'card', floorY: -1.35, baseMats: [cardMat] };
}

export const BUILDERS = { tee: buildTee, notebook: buildNotebook, pen: buildPen, mug: buildMug, flag: buildFlag, card: buildCard };

/* =========================================================
   Print material per technique
   ========================================================= */
export function applyTech(product, tech) {
  const m = product.print.mat;
  const tex = product.print.tex;
  const base = { roughness: 0.6, metalness: 0, clearcoat: 0, clearcoatRoughness: 0.1, bumpMap: null, bumpScale: 1, opacity: 1 };
  const per = {
    dtf:    { roughness: 0.55, clearcoat: 0.12 },
    stitch: { roughness: 0.82, bumpMap: tex, bumpScale: 2.2 },
    sub:    { roughness: 0.9 },
    uvdtf:  { roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03, bumpMap: tex, bumpScale: 1.2 },
    uv:     { roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.12, bumpMap: tex, bumpScale: 0.8 },
    laser:  { roughness: 0.92, bumpMap: tex, bumpScale: -1.2 }
  }[tech];
  Object.assign(m, base, per);
  if (product.fullBleed) Object.assign(m, { roughness: 0.85, clearcoat: 0, bumpMap: null });
  m.needsUpdate = true;
  product.place?.(tech);
}

/* =========================================================
   Stage: renderer, studio lighting and a shadow-catching floor
   ========================================================= */
export function createStage(host, { rims = true, exposure = 1.05, shadowOpacity = 0.32, pixelRatio = 2 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

  scene.add(new THREE.HemisphereLight('#fff6e8', '#2a2622', 0.5));
  const key = new THREE.DirectionalLight('#ffffff', 2.0);
  key.position.set(3, 5, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 20 });
  key.shadow.radius = 6;
  scene.add(key);
  if (rims) {
    const rimM = new THREE.PointLight('#ec008c', 26, 14); rimM.position.set(-4, 2.5, -2.5); scene.add(rimM);
    const rimC = new THREE.PointLight('#00aeef', 22, 14); rimC.position.set(4, -0.5, -2.5); scene.add(rimC);
  }

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: shadowOpacity }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const pivot = new THREE.Group();
  scene.add(pivot);
  return { renderer, scene, camera, floor, pivot, key };
}

/* Paint a built product with a design. */
export function dress(product, { tech, base, ink, text }) {
  product.baseMats.forEach(m => m.color.set(base));
  applyTech(product, tech);
  drawArt(product.print.canvas, {
    layout: product.layout, text: (text || '').trim(), tech,
    ink: tech === 'laser' ? engraveTone(base) : ink,
    bg: product.fullBleed ? base : null
  });
  product.print.tex.needsUpdate = true;
}

/* Resolve once the display fonts are usable on canvas. */
export async function fontsReady() {
  try {
    await Promise.all([
      document.fonts.load('900 64px "Alexandria"', 'EMESE صُنع'),
      document.fonts.load('800 64px "Alexandria"', 'EMESE'),
      document.fonts.load('600 64px "Alexandria"', 'صُنع في مصر')
    ]);
  } catch { /* fallback font is fine */ }
}

export { THREE };
