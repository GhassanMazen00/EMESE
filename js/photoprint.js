/* EMESE: a logo made on a real product photo (stock photos in assets/photos/), by technique:
 * printed into the fabric's folds, embroidered in satin stitches that stand off the cloth, or
 * engraved / burned into wood, metal and leather. Everything the effect needs comes from the photo
 * itself: its large-scale shading (folds, curvature, light) bends and shades the logo, its fine
 * detail (knit, grain) shows through ink, and its highlights stay on top of glossy prints.
 *
 * A placement (assets/photos/photos.json) says where the logo's square goes:
 *   { kind: 'quad', pts: [[x,y] top-left, top-right, bottom-right, bottom-left] }  flat-ish surfaces
 *   { kind: 'cyl', top: [x,y], bottom: [x,y], r, sag }  mugs, bottles, pens: the square's vertical
 *     centre line, the cylinder radius and how far a ring bows toward the camera (all 0..1 of the photo)
 * plus optional `occlude` polygons (things in front: drawstrings, a strap) and `fold` (bend strength).
 */

const VERT = `attribute vec2 aPos; varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
varying vec2 vUv;
uniform sampler2D uPhoto, uBlur, uDesign, uMask;
uniform vec2 uSize;
uniform int uKind;            // 0 quad, 1 cylinder
uniform mat3 uHinv;           // photo -> design square (quad)
uniform vec2 uTop, uBot;      // cylinder centre line (photo 0..1, y down)
uniform float uR, uSag;
uniform int uMode;            // 0 print, 1 embroidery, 2 engrave, 3 foil, 4 glossy print
uniform int uMat;             // engraving: 0 wood, 1 metal, 2 leather
uniform vec3 uInk;
uniform float uUseInk, uLightInk, uLref, uFold, uStitch, uOpacity;

vec3 toLin(vec3 c) { return pow(c, vec3(2.2)); }
vec3 toSrgb(vec3 c) { return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)); }
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash(float n) { return fract(sin(n * 91.345) * 47453.5453); }

vec2 designT(vec2 p) {
  if (uKind == 0) {
    vec3 h = uHinv * vec3(p, 1.0);
    return h.xy / h.z;
  }
  vec2 a = uBot - uTop;
  float L = length(a * uSize);
  vec2 ax = a / max(length(a), 1e-6);
  vec2 n = vec2(-ax.y, ax.x);
  vec2 d = (p - uTop) * uSize;
  float s = dot(d, n * uSize / length(n * uSize)) / (uR * uSize.x);
  if (abs(s) >= 1.0) return vec2(-1.0);
  float th = asin(s);
  float along = dot(d, normalize(a * uSize)) - uSag * uSize.y * cos(th);
  return vec2(th / (L / (uR * uSize.x)) + 0.5, along / L);
}
float designA(vec2 t, float bias) {
  if (t.x < 0.0 || t.y < 0.0 || t.x > 1.0 || t.y > 1.0) return 0.0;
  return texture2D(uDesign, t, bias).a;
}

void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y);
  vec3 photo = toLin(texture2D(uPhoto, p).rgb);
  vec3 blur = toLin(texture2D(uBlur, p).rgb);
  float Lp = lum(photo), Lb = max(lum(blur), 1e-3);
  float shade = clamp(Lb / uLref, 0.15, 1.8);     // folds, curvature, light falloff
  float tex = clamp(Lp / Lb, 0.6, 1.5);           // knit, grain, weave

  // the cloth's folds bend the print: push design coordinates along the shading slope
  vec2 px = 1.0 / uSize;
  float gx = lum(toLin(texture2D(uBlur, p + vec2(px.x * 3.0, 0.0)).rgb)) - lum(toLin(texture2D(uBlur, p - vec2(px.x * 3.0, 0.0)).rgb));
  float gy = lum(toLin(texture2D(uBlur, p + vec2(0.0, px.y * 3.0)).rgb)) - lum(toLin(texture2D(uBlur, p - vec2(0.0, px.y * 3.0)).rgb));
  vec2 t = designT(p + vec2(gx, gy) / uLref * uFold * px * 40.0);

  float occl = texture2D(uMask, p).r;
  float a = designA(t, 0.0) * (1.0 - occl) * uOpacity;
  vec4 dz = (t.x >= 0.0 && t.y >= 0.0 && t.x <= 1.0 && t.y <= 1.0) ? texture2D(uDesign, t) : vec4(0.0);
  vec3 dcol = clamp(dz.rgb / max(dz.a, 0.004), 0.0, 1.0);
  if (uLightInk > 0.5) {                          // dark parts of the logo go light on a dark product
    float sat = max(max(dcol.r, dcol.g), dcol.b) - min(min(dcol.r, dcol.g), dcol.b);
    dcol = mix(dcol, vec3(0.95, 0.94, 0.91), clamp((1.0 - sat * 3.0) * (1.0 - lum(dcol) * 1.5), 0.0, 1.0));
  }
  if (uUseInk > 0.5) dcol = uInk;
  vec3 ink = toLin(dcol);

  // design-space size of one photo pixel, for edges measured in pixels
  float dpx = max(length(dFdx(t)), length(dFdy(t)));
  vec2 lightDir = normalize(vec2(-0.6, -0.8));     // key light from the top left (photo space ~ design space)
  vec3 outc = photo;

  if (uMode == 0) {                               // DTF / screen print: ink film following the cloth
    vec3 printed = ink * shade * mix(1.0, tex, 0.5);
    printed += vec3(0.025) * pow(shade, 3.0);     // a faint plastisol sheen
    outc = mix(photo, printed, a * 0.97);
  } else if (uMode == 4) {                        // glossy print on glaze or coating: highlights stay on top
    vec3 printed = ink * shade;
    float hl = smoothstep(0.62, 0.95, Lp);
    outc = mix(photo, mix(printed, photo, hl * 0.9), a);
  } else if (uMode == 1) {                        // embroidery: satin threads laid side by side
    float aS = smoothstep(0.3, 0.7, designA(t, 0.4)) * (1.0 - occl);
    float body = designA(t, 2.2);                 // ~1 in the middle of a stroke, falling to the edges
    vec2 thr = normalize(vec2(0.26, 0.97));       // the threads' direction (slightly off vertical)
    vec2 nrm = vec2(thr.y, -thr.x);
    float q = dot(t, nrm) / uStitch;
    float f = fract(q), row = floor(q);
    // each thread is a little cylinder: lit on the side facing the light, dark where it meets the next
    float across = sin(3.14159 * f);
    float facing = 0.5 + 0.5 * sin(6.28318 * (f - 0.25)) * sign(dot(nrm, -lightDir));
    float thread = (0.55 + 0.32 * pow(across, 0.6) + 0.2 * facing * across) * (0.92 + 0.14 * hash(row));
    float aa = clamp(1.6 - fwidth(q) * 1.4, 0.0, 1.0);
    thread = mix(0.82, thread, aa);
    // raised: brighter on the crown of each stroke, sinking into the cloth at the edges
    float dome = mix(0.7, 1.05, smoothstep(0.35, 0.95, body));
    float rim = designA(t - lightDir * dpx * 2.0, 1.2) - designA(t + lightDir * dpx * 2.0, 1.2);
    vec3 th = ink * shade * thread * dome * (1.0 - 0.3 * max(-rim, 0.0)) + vec3(0.05) * max(rim, 0.0) * shade;
    th += vec3(0.04) * pow(across, 6.0) * facing * shade;         // a glint along each thread
    float shadow = designA(t - lightDir * dpx * 3.5, 2.0) * (1.0 - aS) * (1.0 - occl);
    outc = photo * (1.0 - 0.45 * shadow);
    outc = mix(outc, th, aS);
  } else if (uMode == 2) {                        // engraving: the material itself, cut in
    float rim = designA(t + lightDir * dpx * 2.0, 1.0) - designA(t - lightDir * dpx * 2.0, 1.0);
    vec3 cut;
    if (uMat == 0) cut = photo * vec3(0.36, 0.25, 0.17) * mix(1.0, tex, 0.6);            // burned wood
    else if (uMat == 1) cut = vec3(0.62, 0.62, 0.63) * shade * (0.85 + 0.3 * hash(floor(t.y / max(dpx, 1e-4)) + floor(t.x * 3.0)));  // bare metal
    else cut = photo * 0.5 * mix(1.0, tex, 0.4);                                       // pressed leather
    cut *= 1.0 - 0.45 * max(rim, 0.0);            // the wall facing away from the light
    cut += (uMat == 1 ? vec3(0.2) : vec3(0.05)) * max(-rim, 0.0) * shade;
    outc = mix(photo, cut, a);
    if (uMat == 0) {                              // a little scorch around the burn
      float halo = designA(t, 2.5) * (1.0 - a);
      outc *= 1.0 - 0.18 * halo;
    }
  } else {                                        // hot foil: metal pressed into the surface
    float rim = designA(t + lightDir * dpx * 2.0, 1.0) - designA(t - lightDir * dpx * 2.0, 1.0);
    vec3 foil = ink * (0.28 + 0.95 * pow(shade, 2.0)) + vec3(0.35) * pow(max(shade - 0.7, 0.0), 2.0);
    foil *= 1.0 - 0.35 * max(rim, 0.0);
    outc = mix(photo, foil, a);
  }
  gl_FragColor = vec4(toSrgb(outc), 1.0);
}`;

const MODES = { print: 0, stitch: 1, engrave: 2, foil: 3, gloss: 4 };
const MATS = { wood: 0, metal: 1, leather: 2 };

const hexLin = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => v / 255);
};

/* homography mapping the unit square (design) to 4 points, inverted: photo -> design */
function homographyInv(pts) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = pts;
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / den, h = (dx1 * sy - sx * dy1) / den;
  const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0;
  const d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;
  // forward: [x y w] = M [u v 1], M = [[a b c],[d e f],[g h 1]]; invert it
  const M = [a, b, c, d, e, f, g, h, 1];
  const A = M[4] * M[8] - M[5] * M[7], B = -(M[3] * M[8] - M[5] * M[6]), C = M[3] * M[7] - M[4] * M[6];
  const D = -(M[1] * M[8] - M[2] * M[7]), E = M[0] * M[8] - M[2] * M[6], F = -(M[0] * M[7] - M[1] * M[6]);
  const G = M[1] * M[5] - M[2] * M[4], H = -(M[0] * M[5] - M[2] * M[3]), I = M[0] * M[4] - M[1] * M[3];
  const det = M[0] * A + M[1] * B + M[2] * C;
  // rows of the inverse: [A D G; B E H; C F I] / det; WebGL wants column-major
  return new Float32Array([A, B, C, D, E, F, G, H, I].map(v => v / det));
}

export class PhotoPrint {
  constructor(canvas = document.createElement('canvas')) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false, antialias: false });
    if (!gl) throw new Error('WebGL unavailable');
    gl.getExtension('OES_standard_derivatives');
    this.gl = gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const n of ['uPhoto', 'uBlur', 'uDesign', 'uMask', 'uSize', 'uKind', 'uHinv', 'uTop', 'uBot', 'uR', 'uSag', 'uMode', 'uMat',
                     'uInk', 'uUseInk', 'uLightInk', 'uLref', 'uFold', 'uStitch', 'uOpacity']) this.u[n] = gl.getUniformLocation(prog, n);
    gl.uniform1i(this.u.uPhoto, 0); gl.uniform1i(this.u.uBlur, 1); gl.uniform1i(this.u.uDesign, 2); gl.uniform1i(this.u.uMask, 3);
    this.tex = [];
  }

  _texture(unit, src, { mipmap = false, premultiply = false } = {}) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    const t = this.tex[unit] || (this.tex[unit] = gl.createTexture());
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmap ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (mipmap) gl.generateMipmap(gl.TEXTURE_2D);
  }

  /* photo: a loaded square image; spec: its entry in photos.json */
  setPhoto(photo, spec) {
    const n = photo.naturalWidth || photo.width;
    this.size = n;
    this.spec = spec;
    this.canvas.width = this.canvas.height = n;
    this._texture(0, photo);
    // large-scale shading: a blurred copy of the photo
    const b = document.createElement('canvas');
    b.width = b.height = n;
    const bx = b.getContext('2d', { willReadFrequently: true });
    bx.filter = `blur(${Math.round(n * (spec.blur || 0.012))}px)`;
    bx.drawImage(photo, 0, 0);
    this._texture(1, b);
    // reference brightness of the print area: the median of the blurred photo there
    const box = this._box(spec.place);
    const d = bx.getImageData(Math.round(box[0] * n), Math.round(box[1] * n), Math.max(1, Math.round((box[2] - box[0]) * n)), Math.max(1, Math.round((box[3] - box[1]) * n))).data;
    const ls = [];
    for (let i = 0; i < d.length; i += 16) {
      const l = 0.2126 * (d[i] / 255) ** 2.2 + 0.7152 * (d[i + 1] / 255) ** 2.2 + 0.0722 * (d[i + 2] / 255) ** 2.2;
      ls.push(l);
    }
    ls.sort((x, y) => x - y);
    this.lref = Math.max(ls[Math.floor(ls.length * 0.6)] || 0.5, 0.01);
    // things in front of the print area
    const m = document.createElement('canvas');
    m.width = m.height = 512;
    const mx = m.getContext('2d');
    mx.fillStyle = '#000'; mx.fillRect(0, 0, 512, 512);
    mx.fillStyle = '#fff';
    for (const poly of spec.occlude || []) {
      mx.beginPath();
      poly.forEach(([x, y], i) => (i ? mx.lineTo(x * 512, y * 512) : mx.moveTo(x * 512, y * 512)));
      mx.closePath(); mx.fill();
    }
    mx.filter = 'blur(1px)';
    this._texture(3, m);
  }

  _box(pl) {
    const pts = pl.kind === 'quad' ? pl.pts : [[pl.top[0] - pl.r, pl.top[1]], [pl.bottom[0] + pl.r, pl.bottom[1]]];
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }

  /* design: a square canvas (designFromImage / designFromText in mockup.js) */
  setDesign(design) {
    this._texture(2, design, { mipmap: true, premultiply: true });
  }

  /* opts: { mode, material, ink, lightInk } override the photo's own spec */
  render(opts = {}) {
    const gl = this.gl, u = this.u, s = { ...this.spec, ...opts }, pl = s.place;
    gl.viewport(0, 0, this.size, this.size);
    gl.uniform2f(u.uSize, this.size, this.size);
    gl.uniform1i(u.uKind, pl.kind === 'quad' ? 0 : 1);
    if (pl.kind === 'quad') gl.uniformMatrix3fv(u.uHinv, false, homographyInv(pl.pts));
    else {
      gl.uniform2f(u.uTop, pl.top[0], pl.top[1]);
      gl.uniform2f(u.uBot, pl.bottom[0], pl.bottom[1]);
      gl.uniform1f(u.uR, pl.r);
      gl.uniform1f(u.uSag, pl.sag || 0);
    }
    gl.uniform1i(u.uMode, MODES[s.mode] ?? 0);
    gl.uniform1i(u.uMat, MATS[s.material] ?? 0);
    gl.uniform1f(u.uUseInk, s.ink ? 1 : 0);
    gl.uniform3fv(u.uInk, s.ink ? hexLin(s.ink) : [0, 0, 0]);
    gl.uniform1f(u.uLightInk, s.lightInk ? 1 : 0);
    gl.uniform1f(u.uLref, this.lref);
    gl.uniform1f(u.uFold, s.fold ?? 1);
    gl.uniform1f(u.uStitch, s.stitch || 0.012);
    gl.uniform1f(u.uOpacity, s.opacity ?? 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }
}

let specsP = null;
export const photoSpecs = () => (specsP ||= fetch(new URL('../assets/photos/photos.json', import.meta.url)).then(r => r.json()));
