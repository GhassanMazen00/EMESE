/* EMESE: photoreal mockup compositor.
 *
 * Each product in assets/mockups/<id>/ was rendered in Blender (tools/mockups)
 * with a few data passes. Here we put any design onto that photo, in linear light:
 *
 *   product = newAlbedo * light + spec
 *
 * light is the diffuse light that reached the surface and spec the gloss/sheen on
 * top. newAlbedo is the product colour (keeping its knit or grain) with the design
 * laid in, so prints pick up the real folds, curvature and lighting of the shot.
 */

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `
#ifdef GL_EXT_shader_texture_lod
#extension GL_EXT_shader_texture_lod : enable
#endif
precision highp float;
varying vec2 vUv;
uniform sampler2D uPhoto, uLight, uAlbedo, uUV, uMask, uDesign, uSpec;
uniform vec2 uSize;
uniform float uLightScale, uSpecScale;
uniform vec3 uBaseLin;
uniform vec3 uTint;
uniform float uUseTint;
uniform vec2 uCenter;
uniform float uWidth, uRot, uAspect, uPhysW;
uniform int uMode;          // 0 print, 1 dye, 2 uv, 3 stitch, 4 laser, 5 foil
uniform float uGloss;
uniform vec3 uInk;
uniform float uUseInk, uDesignOn, uReveal, uBox, uFlipV, uPitch, uRelief;
uniform vec3 uFoil;

vec3 toLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSrgb(vec3 c) { c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec2 decodeUV(vec2 p) {
  vec3 e = floor(texture2D(uUV, p).rgb * 255.0 + 0.5);
  float ulo = floor(e.b / 16.0);
  float vlo = e.b - ulo * 16.0;
  vec2 uv = vec2(e.r * 16.0 + ulo, e.g * 16.0 + vlo) / 4095.0;
  if (uFlipV > 0.5) uv.y = 1.0 - uv.y;
  return uv;
}
// uv for this texel, borrowing a neighbour on anti-aliased edges
bool printUV(vec2 p, out vec2 uv) {
  vec2 px = 1.0 / uSize;
  if (texture2D(uMask, p).b > 0.5) { uv = decodeUV(p); return true; }
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    vec2 q = p + vec2(cos(a), sin(a)) * px * 1.5;
    if (texture2D(uMask, q).b > 0.5) { uv = decodeUV(q); return true; }
  }
  uv = vec2(0.0);
  return false;
}
// design texture coordinate for a print uv
vec2 designT(vec2 uv) {
  vec2 d = uv - uCenter;
  d.x = d.x - floor(d.x + 0.5);      // wrap around cylinders
  d.x *= uAspect;                    // to print-height units
  float c = cos(-uRot), s = sin(-uRot);
  d = vec2(c * d.x - s * d.y, s * d.x + c * d.y);
  float W = uWidth * uAspect;
  return d / W + 0.5;
}
/* The design is sampled with gradients we measure ourselves (neighbouring texels of the print uv).
 * The GPU's own estimate breaks wherever the print area ends (a seam, a drawcord, the edge of a
 * mug's print zone): it would pick a blurred mip level and smear the whole logo into those pixels. */
#ifdef GL_EXT_shader_texture_lod
#define DTEX(c, gx, gy) texture2DGradEXT(uDesign, c, gx, gy)
#else
#define DTEX(c, gx, gy) texture2D(uDesign, c)
#endif
vec4 design(vec2 t, vec2 gx, vec2 gy) {
  if (t.x < 0.0 || t.y < 0.0 || t.x > 1.0 || t.y > 1.0) return vec4(0.0);
  return DTEX(vec2(t.x, 1.0 - t.y), vec2(gx.x, -gx.y), vec2(gy.x, -gy.y));
}
float designA(vec2 t, vec2 gx, vec2 gy) { return design(t, gx, gy).a; }
// print uv at a neighbouring texel, when it has one
bool uvAt(vec2 q, out vec2 uv) {
  uv = vec2(0.0);
  if (texture2D(uMask, q).b < 0.5) return false;
  uv = decodeUV(q);
  return true;
}
// change of the design coordinate per screen pixel along one axis, from the two neighbours; the
// smaller side wins, so a fold or seam next to this pixel does not count as a jump
vec2 designStep(vec2 t, bool ha, vec2 ua, bool hb, vec2 ub) {
  vec2 a = designT(ua), b = designT(ub);
  if (ha && hb) return length(a - t) < length(t - b) ? a - t : t - b;
  if (ha) return a - t;
  if (hb) return t - b;
  return vec2(0.0);
}

void main() {
  vec2 p = (floor(vUv * uSize) + 0.5) / uSize;
  p.y = 1.0 - p.y;
  vec3 photo = toLin(texture2D(uPhoto, p).rgb);
  vec4 m = texture2D(uMask, p);
  vec3 L = toLin(texture2D(uLight, p).rgb) * uLightScale;
  vec3 alb0 = toLin(texture2D(uAlbedo, p).rgb);
  vec3 spec = toLin(texture2D(uSpec, p).rgb) * uSpecScale;
  float cover = max(m.r, m.g);
  vec3 alb = alb0;
  // recolour but keep the material's own texture (knit, grain) relative to its mean colour
  if (uUseTint > 0.5 && m.g > 0.001) alb = uTint * mix(vec3(1.0), clamp(alb0 / max(uBaseLin, vec3(0.02)), 0.6, 1.4), 0.65);

  vec3 base = alb;
  float mod_ = 1.0;
  vec3 extra = vec3(0.0);
  vec3 glow = vec3(0.0);   // light not tied to the diffuse pass (metal reflections)

  vec2 uv;
  if (uDesignOn > 0.5 && m.r > 0.001 && printUV(p, uv)) {
    vec2 px1 = 1.0 / uSize, uR, uL, uU, uD;
    bool hR = uvAt(p + vec2(px1.x, 0.0), uR), hL = uvAt(p - vec2(px1.x, 0.0), uL);
    bool hU = uvAt(p + vec2(0.0, px1.y), uU), hD = uvAt(p - vec2(0.0, px1.y), uD);
    vec2 t = designT(uv);
    vec2 gx = designStep(t, hR, uR, hL, uL), gy = designStep(t, hU, uU, hD, uD);
    vec4 dz = design(t, gx, gy);
    float a = dz.a * m.r;
    // the design texture is premultiplied (clean edges and mipmaps): undo it for the ink colour
    vec3 dcol = uUseInk > 0.5 ? uInk : toLin(clamp(dz.rgb / max(dz.a, 0.004), 0.0, 1.0));

    // relief: how the design edge catches the key light (from top left). Measured in screen pixels:
    // a raised or engraved edge is a hairline highlight and shadow, never a shifted copy of the logo.
    float physW = max(uWidth * uPhysW, 0.001);           // metres across the design
    float px = max(length(gx), length(gy));               // design units per screen pixel
    float e = clamp(px, 0.0005, max(0.0005, min(0.0004 / physW, 0.012)));   // one pixel, never more than 0.4 mm or 1.2%
    float rx = designA(t + vec2(e, 0.0), gx, gy) - designA(t - vec2(e, 0.0), gx, gy);
    float ry = designA(t + vec2(0.0, e), gx, gy) - designA(t - vec2(0.0, e), gx, gy);
    float relief = (-rx + ry) * 0.5;
    float hl = clamp(lum(L) / 1.2, 0.0, 1.0);
    float glossy = clamp(lum(spec) * 5.0, 0.0, 1.0);    // the surface already shines (mugs, metal)

    if (uMode == 0) {            // DTF / screen / digital: ink film on top
      base = mix(alb, dcol, a * 0.97);
      mod_ = 1.0 + relief * 0.12 * a;
      extra = vec3(a * 0.02 * hl);
    } else if (uMode == 1) {     // sublimation: dye inside the fibres
      base = mix(alb, dcol * alb / max(lum(alb0), 0.2), a * 0.93);
    } else if (uMode == 2) {     // UV / UV DTF: raised, glossy
      base = mix(alb, dcol, a);
      mod_ = 1.0 + relief * 0.45;
      extra = vec3(a * uGloss * 0.35 * pow(hl, 6.0) * (1.0 - glossy));
    } else if (uMode == 3) {     // embroidery: satin stitches, raised thread
      float n = physW / uPitch;
      float sc = (t.x * cos(0.8) + t.y * sin(0.8)) * n;
      float st = fract(sc);
      float thread = 0.72 + 0.28 * smoothstep(0.0, 0.5, st) * smoothstep(1.0, 0.5, st);
      // threads finer than the pixels would alias into broken letters: average them out
      vec2 dir = vec2(cos(0.8), sin(0.8)) * n;
      float fw = abs(dot(gx, dir)) + abs(dot(gy, dir));
      thread = mix(thread, 0.86, clamp((fw - 0.3) / 0.3, 0.0, 1.0));
      base = mix(alb, dcol * thread, a);
      float shadow = designA(t + vec2(-e * 1.5, e * 1.5), gx, gy) * (1.0 - a);
      mod_ = (1.0 + relief * 0.9 * uRelief) * (1.0 - shadow * 0.35 * uRelief);
      extra = vec3(a * 0.05 * hl * thread);
    } else if (uMode == 4) {     // laser: no ink, the surface itself changes
      vec3 burned = alb * vec3(0.42, 0.33, 0.27);            // wood, light leather, paper
      vec3 frosted = alb + vec3(0.16, 0.15, 0.14);           // dark leather turns lighter
      vec3 revealed = mix(vec3(0.62), alb, 0.12);            // coated metal shows bare steel
      vec3 tgt = uReveal > 0.5 ? revealed : (lum(alb) < 0.06 ? frosted : burned);
      base = mix(alb, tgt, a);
      mod_ = 1.0 - relief * 0.35;
    } else if (uMode == 5) {     // hot foil: metallic, slightly debossed
      base = mix(alb, uFoil * 0.45, a);
      mod_ = 1.0 - relief * 0.4;
      glow = uFoil * a * (0.16 + 0.42 * smoothstep(0.0, 1.0, hl)) * (1.0 + relief * 0.6);
    }
  }
  vec3 product = base * mod_ * L + spec + extra * L + glow;
  vec3 lin = mix(photo, product, cover);
  // dashed frame around the design while it is being moved or resized
  vec2 bu;
  if (uBox > 0.5 && m.r > 0.001 && printUV(p, bu)) {
    vec2 t = designT(bu);
    float th = 0.006;
    bool inside = t.x > -th && t.y > -th && t.x < 1.0 + th && t.y < 1.0 + th;
    float edge = min(min(abs(t.x), abs(1.0 - t.x)), min(abs(t.y), abs(1.0 - t.y)));
    if (inside && edge < th) {
      float dash = step(0.5, fract((t.x + t.y) * 24.0));
      lin = mix(lin, mix(vec3(0.02), vec3(1.0), dash), 0.85);
    }
  }
  gl_FragColor = vec4(toSrgb(lin), 1.0);
}`;

const MODES = { print: 0, dye: 1, uv: 2, stitch: 3, laser: 4, foil: 5 };
const cache = new Map();

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('failed to load ' + src));
    img.src = src;
  });
}

let manifestP = null;
export function manifest(base = 'assets/mockups/') {
  return (manifestP ||= fetch(base + 'manifest.json').then(r => r.json()));
}

/* Fetch every pass for one product (cached). */
export function loadProduct(id, base = 'assets/mockups/') {
  if (cache.has(id)) return cache.get(id);
  const p = Promise.all([
    manifest(base),
    ...['photo.webp', 'light.webp', 'albedo.webp', 'uv.png', 'mask.png', 'spec.webp'].map(f => loadImage(`${base}${id}/${f}`))
  ]).then(([man, photo, light, albedo, uv, mask, spec]) => ({ id, meta: man[id], photo, light, albedo, uv, mask, spec }));
  cache.set(id, p);
  p.catch(() => cache.delete(id)); // allow a retry after a failed load
  return p;
}

const hexToLin = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
};

export class MockupView {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false, antialias: false });
    if (!gl) throw new Error('WebGL unavailable');
    gl.getExtension('EXT_shader_texture_lod');     // design sampled with our own gradients (see FRAG)
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
    this.gl = gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    this.prog = prog;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const n of ['uPhoto', 'uLight', 'uAlbedo', 'uUV', 'uMask', 'uDesign', 'uSpec', 'uSize', 'uLightScale', 'uSpecScale', 'uBaseLin', 'uTint', 'uUseTint',
      'uCenter', 'uWidth', 'uRot', 'uAspect', 'uPhysW', 'uMode', 'uGloss', 'uInk', 'uUseInk', 'uDesignOn', 'uReveal', 'uFoil', 'uBox', 'uFlipV', 'uPitch', 'uRelief']) {
      this.u[n] = gl.getUniformLocation(prog, n);
    }
    this.tex = {};
    ['uPhoto', 'uLight', 'uAlbedo', 'uUV', 'uMask', 'uDesign', 'uSpec'].forEach((n, i) => {
      gl.uniform1i(this.u[n], i);
    });
    this.state = { tint: null, mode: 'print', ink: null, gloss: 0.15, u: 0.5, v: 0.5, w: 0.4, rot: 0, reveal: false, foil: '#d4af37', design: true };
    this.product = null;
  }

  _texture(unit, source, { nearest = false, mipmap = false, premultiply = false } = {}) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    let t = this.tex[unit];
    if (!t) { t = this.tex[unit] = gl.createTexture(); }
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    const f = nearest ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmap ? gl.LINEAR_MIPMAP_LINEAR : f);
    // logos on surfaces seen at an angle (cap front, tilted labels) stay sharp along the slant
    if (mipmap && this.aniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (mipmap) gl.generateMipmap(gl.TEXTURE_2D);
  }

  /* Show a loaded product (from loadProduct). pick: false skips the CPU copy used for dragging. */
  setProduct(prod, { pick = true } = {}) {
    this.product = prod;
    const [w, h] = prod.meta.size;
    this.canvas.width = w;
    this.canvas.height = h;
    this._texture(0, prod.photo, { nearest: true });
    this._texture(1, prod.light, { nearest: true });
    this._texture(2, prod.albedo, { nearest: true });
    this._texture(3, prod.uv, { nearest: true });
    this._texture(4, prod.mask, { nearest: true });
    this._texture(6, prod.spec, { nearest: true });
    if (!pick) { this._uv = this._mask = null; return; }
    // CPU copy of uv + mask for pointer picking
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
    x.drawImage(prod.uv, 0, 0);
    this._uv = x.getImageData(0, 0, w, h).data;
    x.clearRect(0, 0, w, h);
    x.drawImage(prod.mask, 0, 0);
    this._mask = x.getImageData(0, 0, w, h).data;
  }

  /* The design must be a square, power-of-two canvas (e.g. 1024×1024). */
  setDesign(canvas) {
    this._texture(5, canvas, { mipmap: true, premultiply: true });
    this.designAspect = canvas.logoAspect || 1;
  }

  set(patch) {
    Object.assign(this.state, patch);
    return this;
  }

  /* Print-area uv under a client point, or null off the print area. */
  uvAt(clientX, clientY) {
    if (!this.product) return null;
    const r = this.canvas.getBoundingClientRect();
    const [w, h] = this.product.meta.size;
    const x = Math.floor(((clientX - r.left) / r.width) * w);
    const y = Math.floor(((clientY - r.top) / r.height) * h);
    if (x < 0 || y < 0 || x >= w || y >= h) return null;
    const i = (y * w + x) * 4;
    if (this._mask[i + 2] < 128) return null;
    const ulo = this._uv[i + 2] >> 4, vlo = this._uv[i + 2] & 15;
    const v = ((this._uv[i + 1] << 4) | vlo) / 4095;
    return { u: ((this._uv[i] << 4) | ulo) / 4095, v: this.product.meta.flipV ? 1 - v : v };
  }

  render() {
    if (!this.product) return;
    const gl = this.gl, u = this.u, s = this.state, meta = this.product.meta;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.uniform2f(u.uSize, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uLightScale, meta.lightScale);
    gl.uniform1f(u.uSpecScale, meta.specScale || 0);
    gl.uniform3fv(u.uBaseLin, meta.baseLinear || [0.8, 0.8, 0.8]);
    gl.uniform1f(u.uUseTint, s.tint ? 1 : 0);
    gl.uniform3fv(u.uTint, s.tint ? hexToLin(s.tint) : [1, 1, 1]);
    gl.uniform2f(u.uCenter, s.u, s.v);
    gl.uniform1f(u.uWidth, s.w);
    gl.uniform1f(u.uRot, s.rot);
    gl.uniform1f(u.uAspect, meta.printAspect);
    gl.uniform1f(u.uPhysW, meta.widthM || 0.3);
    gl.uniform1i(u.uMode, MODES[s.mode] ?? 0);
    gl.uniform1f(u.uGloss, s.gloss);
    gl.uniform1f(u.uUseInk, s.ink ? 1 : 0);
    gl.uniform3fv(u.uInk, s.ink ? hexToLin(s.ink) : [0, 0, 0]);
    gl.uniform1f(u.uDesignOn, s.design ? 1 : 0);
    gl.uniform1f(u.uReveal, s.reveal ? 1 : 0);
    gl.uniform3fv(u.uFoil, hexToLin(s.foil));
    gl.uniform1f(u.uBox, s.box ? 1 : 0);
    gl.uniform1f(u.uFlipV, meta.flipV ? 1 : 0);
    gl.uniform1f(u.uPitch, s.pitch || 0.0011);
    gl.uniform1f(u.uRelief, s.relief ?? 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

/* The visible part of an image: the box around pixels that are not (nearly) transparent. */
function opaqueBox(img) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const k = Math.min(1, 512 / Math.max(w, h));            // measure on a small copy, it's fast
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, c.width, c.height);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) {
    for (let i = 0; i < c.width; i++) {
      if (d[(y * c.width + i) * 4 + 3] > 10) {
        if (i < x0) x0 = i; if (i > x1) x1 = i;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w, h };
  const pad = 1;
  return {
    x: Math.max(0, (x0 - pad) / k), y: Math.max(0, (y0 - pad) / k),
    w: Math.min(w, (x1 + 1 + pad) / k) - Math.max(0, (x0 - pad) / k),
    h: Math.min(h, (y1 + 1 + pad) / k) - Math.max(0, (y0 - pad) / k)
  };
}

/* A square design canvas with the image's visible part centred and as large as it fits.
 * Empty margins around an uploaded logo are trimmed, so its size and position are what you see.
 * The canvas remembers the logo's shape (width / height) for fitting it to a print area. */
export function designFromImage(img, size = 1024, pad = 0.02) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  const b = opaqueBox(img);
  const k = (size * (1 - pad * 2)) / Math.max(b.w, b.h);
  x.drawImage(img, b.x, b.y, b.w, b.h, (size - b.w * k) / 2, (size - b.h * k) / 2, b.w * k, b.h * k);
  c.logoAspect = b.w / b.h;
  return c;
}

/* Where a design goes for a placement (preset) of a product, scaled down if needed so its real
 * shape fits inside the print area: a square or tall logo on a cap front must not run into the
 * brim or the button. `place` is {u, v, w} from the product's manifest. */
export function fitPlace(meta, place, logoAspect = 1, margin = 0.92) {
  const pa = meta.printAspect || 1;                       // print area width / height
  const hAvail = Math.max(0.05, 2 * Math.min(place.v, 1 - place.v) * margin);   // in print heights
  const hPerW = pa * Math.min(1, 1 / Math.max(logoAspect, 0.01));             // logo height per unit of w
  const hMax = place.maxH ? Math.min(place.maxH, hAvail) : hAvail;          // maxH: a product's own limit
  const w = Math.min(place.w, hMax / hPerW);
  return { u: place.u, v: place.v, w };
}

/* Text design: one or two lines, fitted to the square. */
export function designFromText(text, { font = '"Alexandria", sans-serif', weight = 800, color = '#141414', size = 1024 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const lines = String(text || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 3);
  if (!lines.length) return c;
  x.fillStyle = color;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  let fs = size * 0.5;
  const fits = () => {
    x.font = `${weight} ${fs}px ${font}`;
    return lines.every(l => x.measureText(l).width <= size * 0.96) && fs * 1.25 * lines.length <= size * 0.96;
  };
  while (!fits() && fs > 10) fs *= 0.94;
  const lh = fs * 1.25;
  let maxW = 0;
  lines.forEach((l, i) => {
    x.direction = /[؀-ۿ]/.test(l) ? 'rtl' : 'ltr';
    x.fillText(l, size / 2, size / 2 + (i - (lines.length - 1) / 2) * lh);
    maxW = Math.max(maxW, x.measureText(l).width);
  });
  c.logoAspect = maxW / (lh * lines.length);
  return c;
}
