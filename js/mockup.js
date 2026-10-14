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
uniform float uUseInk, uDesignOn, uReveal, uBox;
uniform vec3 uFoil;

vec3 toLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSrgb(vec3 c) { c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec2 decodeUV(vec2 p) {
  vec3 e = floor(texture2D(uUV, p).rgb * 255.0 + 0.5);
  float ulo = floor(e.b / 16.0);
  float vlo = e.b - ulo * 16.0;
  return vec2(e.r * 16.0 + ulo, e.g * 16.0 + vlo) / 4095.0;
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
float designA(vec2 t) {
  if (t.x < 0.0 || t.y < 0.0 || t.x > 1.0 || t.y > 1.0) return 0.0;
  return texture2D(uDesign, vec2(t.x, 1.0 - t.y)).a;
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

  vec2 uv;
  if (uDesignOn > 0.5 && m.r > 0.001 && printUV(p, uv)) {
    vec2 t = designT(uv);
    vec4 dz = vec4(0.0);
    if (t.x >= 0.0 && t.y >= 0.0 && t.x <= 1.0 && t.y <= 1.0) dz = texture2D(uDesign, vec2(t.x, 1.0 - t.y));
    float a = dz.a * m.r;
    vec3 dcol = uUseInk > 0.5 ? uInk : toLin(dz.rgb / max(dz.a, 0.001));

    // relief: how the design edge catches the key light (from top left)
    float physW = max(uWidth * uPhysW, 0.001);           // metres across the design
    float e = 0.0009 / physW;                            // ~1 mm in design space
    float gx = designA(t + vec2(e, 0.0)) - designA(t - vec2(e, 0.0));
    float gy = designA(t + vec2(0.0, e)) - designA(t - vec2(0.0, e));
    float relief = (-gx + gy) * 0.5;
    float hl = clamp(lum(L) / 1.2, 0.0, 1.0);

    if (uMode == 0) {            // DTF / screen / digital: ink film on top
      base = mix(alb, dcol, a * 0.97);
      mod_ = 1.0 + relief * 0.12 * a;
      extra = vec3(a * 0.02 * hl);
    } else if (uMode == 1) {     // sublimation: dye inside the fibres
      base = mix(alb, dcol * alb / max(lum(alb0), 0.2), a * 0.93);
    } else if (uMode == 2) {     // UV / UV DTF: raised, glossy
      base = mix(alb, dcol, a);
      mod_ = 1.0 + relief * 0.45;
      extra = vec3(a * uGloss * pow(hl, 4.0));
    } else if (uMode == 3) {     // embroidery: satin stitches, raised thread
      float n = physW / 0.0011;
      float st = fract((t.x * cos(0.8) + t.y * sin(0.8)) * n);
      float thread = 0.72 + 0.28 * smoothstep(0.0, 0.5, st) * smoothstep(1.0, 0.5, st);
      base = mix(alb, dcol * thread, a);
      float shadow = designA(t + vec2(-e * 1.4, e * 1.4)) * (1.0 - a);
      mod_ = (1.0 + relief * 0.9) * (1.0 - shadow * 0.35);
      extra = vec3(a * 0.05 * hl * thread);
    } else if (uMode == 4) {     // laser: no ink, the surface itself changes
      vec3 burned = alb * vec3(0.42, 0.33, 0.27);            // wood, light leather, paper
      vec3 frosted = alb + vec3(0.16, 0.15, 0.14);           // dark leather turns lighter
      vec3 revealed = mix(vec3(0.62), alb, 0.12);            // coated metal shows bare steel
      vec3 tgt = uReveal > 0.5 ? revealed : (lum(alb) < 0.06 ? frosted : burned);
      base = mix(alb, tgt, a);
      mod_ = 1.0 - relief * 0.35;
    } else if (uMode == 5) {     // hot foil: metallic, slightly debossed
      base = mix(alb, uFoil * 0.35, a);
      mod_ = 1.0 - relief * 0.4;
      extra = uFoil * a * (0.15 * hl + 0.85 * pow(hl, 2.5));
    }
  }
  vec3 product = base * mod_ * L + spec + extra * L;
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
      'uCenter', 'uWidth', 'uRot', 'uAspect', 'uPhysW', 'uMode', 'uGloss', 'uInk', 'uUseInk', 'uDesignOn', 'uReveal', 'uFoil', 'uBox']) {
      this.u[n] = gl.getUniformLocation(prog, n);
    }
    this.tex = {};
    ['uPhoto', 'uLight', 'uAlbedo', 'uUV', 'uMask', 'uDesign', 'uSpec'].forEach((n, i) => {
      gl.uniform1i(this.u[n], i);
    });
    this.state = { tint: null, mode: 'print', ink: null, gloss: 0.15, u: 0.5, v: 0.5, w: 0.4, rot: 0, reveal: false, foil: '#d4af37', design: true };
    this.product = null;
  }

  _texture(unit, source, { nearest = false, mipmap = false } = {}) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    let t = this.tex[unit];
    if (!t) { t = this.tex[unit] = gl.createTexture(); }
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    const f = nearest ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmap ? gl.LINEAR_MIPMAP_LINEAR : f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (mipmap) gl.generateMipmap(gl.TEXTURE_2D);
  }

  /* Show a loaded product (from loadProduct). */
  setProduct(prod) {
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
    this._texture(5, canvas, { mipmap: true });
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
    return { u: ((this._uv[i] << 4) | ulo) / 4095, v: ((this._uv[i + 1] << 4) | vlo) / 4095 };
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
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

/* Draw an image (logo) into a square power-of-two canvas, centred with padding. */
export function designFromImage(img, size = 1024, pad = 0.02) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const k = (size * (1 - pad * 2)) / Math.max(iw, ih);
  x.drawImage(img, (size - iw * k) / 2, (size - ih * k) / 2, iw * k, ih * k);
  return c;
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
  lines.forEach((l, i) => {
    x.direction = /[؀-ۿ]/.test(l) ? 'rtl' : 'ltr';
    x.fillText(l, size / 2, size / 2 + (i - (lines.length - 1) / 2) * lh);
  });
  return c;
}
