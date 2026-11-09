/* EMESE: 360° product viewer. Real 3D models (assets/3d/*.glb) that turn under the finger, with the
 * visitor's logo printed on the fabric or surface in the shader.
 *
 * Every model carries a second UV map, PrintUV: the print area (chest, cap front, mug wall...) in 0..1,
 * the same coordinates the photo studio uses, so a placement {u, v, w, rot} means the same thing in
 * both. Outside the print area PrintUV is (-4, -4) and no logo can land there.
 *
 * Same surface as MockupView (js/mockup.js): setProduct, setDesign, set, render, uvAt.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const BASE = new URL('../assets/3d/', import.meta.url).href;
const MODES = { print: 0, dye: 1, uv: 2, stitch: 3, laser: 4, foil: 5 };
const WHITE = new THREE.Color(1, 1, 1);

let metaP = null;
export const models = () => (metaP ||= fetch(BASE + 'models.json').then(r => r.json()));

const draco = new DRACOLoader().setDecoderPath(new URL('../vendor/three/addons/libs/draco/', import.meta.url).href);
const loader = new GLTFLoader().setDRACOLoader(draco);
const cache = new Map();

/* Load one model (cached): { id, meta, scene }. Each call returns its own copy of the scene. */
export async function loadModel(id) {
  if (!cache.has(id)) {
    const p = Promise.all([models(), loader.loadAsync(BASE + id + '.glb')])
      .then(([all, gltf]) => ({ id, meta: all[id], gltf }));
    cache.set(id, p);
    p.catch(() => cache.delete(id));
  }
  const { meta, gltf } = await cache.get(id);
  return { id, meta, scene: gltf.scene.clone(true) };
}

/* ---- the logo, printed in the material's own shader ---- */
const DECAL_VERT_PARS = `
#ifndef USE_UV1
attribute vec2 uv1;
#endif
varying vec2 vPrintUV;`;
const DECAL_FRAG_PARS = `
varying vec2 vPrintUV;
uniform sampler2D uDesign;
uniform vec2 uCenter;
uniform float uWidth, uAspect, uRot, uPhysW, uDesignOn, uUseInk, uGloss, uPitch, uRelief, uReveal;
uniform int uMode;
uniform vec3 uInk, uFoil;
vec2 designT(vec2 uv) {
  vec2 d = uv - uCenter;
  d.x *= uAspect;
  float c = cos(-uRot), s = sin(-uRot);
  d = vec2(c * d.x - s * d.y, s * d.x + c * d.y);
  return d / (uWidth * uAspect) + 0.5;
}
// bump from a height that is only known per pixel (three's perturbNormalArb)
vec3 decalBump(vec3 pos, vec3 n, float h, float faceDir) {
  vec3 sx = dFdx(pos), sy = dFdy(pos);
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * n - grad);
}`;
// after map_fragment: diffuse colour, and the numbers later chunks need
const DECAL_COLOR = `
  vec2 dT = designT(vPrintUV);
  float onArea = step(-1.0, vPrintUV.x) * uDesignOn;
  vec4 dz = texture2D(uDesign, dT);
  float inside = step(0.0, dT.x) * step(dT.x, 1.0) * step(0.0, dT.y) * step(dT.y, 1.0);
  float dA = dz.a * inside * onArea;
  vec3 dCol = uUseInk > 0.5 ? uInk : clamp(dz.rgb / max(dz.a, 0.004), 0.0, 1.0);
  float thread = 1.0;
  float dH = 0.0;                                   // relief height, metres
  if (uMode == 0) {                                 // DTF / screen / digital: an ink film on top
    diffuseColor.rgb = mix(diffuseColor.rgb, dCol, dA * 0.97);
    dH = dA * 0.00025;
  } else if (uMode == 1) {                          // sublimation: dye inside the fibres
    float l = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    diffuseColor.rgb = mix(diffuseColor.rgb, dCol * min(l * 1.25, 1.0), dA * 0.93);
  } else if (uMode == 2) {                          // UV / UV DTF: raised, glossy
    diffuseColor.rgb = mix(diffuseColor.rgb, dCol, dA);
    dH = dA * 0.0004;
  } else if (uMode == 3) {                          // embroidery: satin stitches
    float n = uPhysW / max(uPitch, 0.0002);
    float sc = (dT.x * 0.6967 + dT.y * 0.7174) * n;
    float st = fract(sc);
    float fw = fwidth(sc);
    thread = mix(0.74 + 0.26 * smoothstep(0.0, 0.5, st) * smoothstep(1.0, 0.5, st), 0.88, clamp((fw - 0.35) / 0.35, 0.0, 1.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, dCol * thread, dA);
    dH = dA * uRelief * (0.0007 + 0.00025 * thread);
  } else if (uMode == 4) {                          // laser: the surface itself changes
    vec3 burned = diffuseColor.rgb * vec3(0.42, 0.33, 0.27);
    vec3 frosted = diffuseColor.rgb + vec3(0.16, 0.15, 0.14);
    vec3 revealed = mix(vec3(0.62), diffuseColor.rgb, 0.12);
    float l = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    diffuseColor.rgb = mix(diffuseColor.rgb, uReveal > 0.5 ? revealed : (l < 0.06 ? frosted : burned), dA);
    dH = -dA * 0.0002;
  } else {                                          // hot foil: metal, slightly debossed
    diffuseColor.rgb = mix(diffuseColor.rgb, uFoil, dA);
    dH = -dA * 0.00015;
  }`;
const DECAL_ROUGH = `
  if (uMode == 0) roughnessFactor = mix(roughnessFactor, 0.55, dA);
  else if (uMode == 2) roughnessFactor = mix(roughnessFactor, mix(0.32, 0.12, uGloss), dA);
  else if (uMode == 3) roughnessFactor = mix(roughnessFactor, 0.48, dA);
  else if (uMode == 5) roughnessFactor = mix(roughnessFactor, 0.24, dA);`;
const DECAL_METAL = `
  if (uMode == 5) metalnessFactor = mix(metalnessFactor, 1.0, dA);
  if (uMode == 4 && uReveal > 0.5) metalnessFactor = mix(metalnessFactor, 1.0, dA);`;
const DECAL_NORMAL = `
  // a print covers the knit: flatten the fabric's own bumps under it, then add the print's edge
  normal = normalize(mix(normal, nonPerturbedNormal, dA * (uMode == 1 ? 0.0 : 0.85)));
  normal = decalBump(-vViewPosition, normal, dH, faceDirection);`;
const DECAL_SHEEN = `
  #ifdef USE_SHEEN
    material.sheenColor *= 1.0 - dA * (uMode == 1 ? 0.2 : 0.9);
  #endif`;

function decal(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + DECAL_VERT_PARS)
      // glTF stores V top-down: turn it back so v runs up the garment, as in the photo studio
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n  vPrintUV = vec2(uv1.x, 1.0 - uv1.y);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + DECAL_FRAG_PARS)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + DECAL_COLOR)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + DECAL_ROUGH)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + DECAL_METAL)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + DECAL_NORMAL)
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n' + DECAL_SHEEN);
  };
  material.customProgramCacheKey = () => 'emese-decal';
  material.needsUpdate = true;
}

/* soft round shadow under the product: cheaper than real shadows, and kind to phones */
function contactShadow() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.42)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.16)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = -1;
  return m;
}

export class View3D {
  constructor(canvas, { autoRotate = false, interactive = true, onChange = null } = {}) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: false });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.93;
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(r), 0.04).texture;
    pm.dispose();
    // a warm key from the top left, like the photo studio's softbox
    const key = new THREE.DirectionalLight(0xfff4e8, 1.9);
    key.position.set(-1.2, 2.0, 1.6);
    this.scene.add(key);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 0.25));
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
    this.shadow = contactShadow();
    this.scene.add(this.shadow);
    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    this.controls = new OrbitControls(this.camera, canvas);
    Object.assign(this.controls, {
      enableDamping: true, dampingFactor: 0.08, enablePan: false, rotateSpeed: 0.9,
      minPolarAngle: Math.PI * 0.18, maxPolarAngle: Math.PI * 0.62, autoRotate, autoRotateSpeed: 1.4
    });
    this.controls.enabled = interactive;
    this.controls.addEventListener('change', () => this.requestRender());
    this.uniforms = {
      uDesign: { value: null }, uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uWidth: { value: 0.4 },
      uAspect: { value: 1 }, uRot: { value: 0 }, uPhysW: { value: 0.1 }, uDesignOn: { value: 1 },
      uUseInk: { value: 0 }, uInk: { value: new THREE.Color(0, 0, 0) }, uFoil: { value: new THREE.Color('#d4af37') },
      uGloss: { value: 0.15 }, uPitch: { value: 0.0004 }, uRelief: { value: 1 }, uReveal: { value: 0 }, uMode: { value: 0 }
    };
    this.state = { tint: null, mode: 'print', u: 0.5, v: 0.5, w: 0.4, rot: 0, ink: null, foil: '#d4af37', gloss: 0.15,
                   pitch: 0.0004, relief: 1, reveal: false, design: true };
    this.onChange = onChange;
    this.product = null;
    this._dirty = true;
    this._loop = this._loop.bind(this);
    this._running = false;
    this._visible = true;
    this._resize = new ResizeObserver(() => this.resize());
    this._resize.observe(canvas);
    this.resize();
    this._io = new IntersectionObserver(([e]) => { this._visible = e.isIntersecting; if (this._visible) this.requestRender(); });
    this._io.observe(canvas);
  }

  resize() {
    const w = this.canvas.clientWidth || 300, h = this.canvas.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.product) this.frame();
    this.requestRender();
  }

  /* prod: from loadModel() */
  setProduct(prod) {
    if (this.product) this.holder.remove(this.product.scene);
    this.product = prod;
    const root = prod.scene;
    root.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      o.material = mats.map((m) => {
        const c = m.clone();
        // tint:... takes the chosen colour and can carry the logo; print:... carries it in its own colour
        c.userData.tint = /^tint:/.test(m.name);
        c.userData.base = c.color.clone();
        c.envMapIntensity = 0.78;
        // cloth sheen: subtle, and in the cloth's own colour (a white sheen turns every colour pastel)
        if (c.userData.tint && 'sheen' in c) c.sheen = Math.min(c.sheen, 0.12);
        if (/^(tint|print):/.test(m.name) && o.geometry.attributes.uv1) decal(c, this.uniforms);
        return c;
      });
      if (o.material.length === 1) o.material = o.material[0];
    });
    this.holder.add(root);
    this.uniforms.uAspect.value = prod.meta.printAspect || 1;
    // sit the product on the floor, centred
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
    root.position.sub(new THREE.Vector3(ctr.x, box.min.y, ctr.z));
    this.size = size;
    this.shadow.scale.set(size.x * 1.5, size.z * 2.2 + size.x * 0.4, 1);
    this.shadow.position.y = 0.001;
    this.frame();
    this.applyState();
  }

  /* camera distance so the whole product fits, from any side */
  frame() {
    const s = this.size;
    if (!s) return;
    const radius = 0.5 * Math.hypot(s.x, s.y, s.z);
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const fit = radius / Math.sin(Math.min(fov, fov * this.camera.aspect) / 2) * 1.02;
    const target = new THREE.Vector3(0, s.y * 0.5, 0);
    const dir = this.camera.position.clone().sub(this.controls.target);
    if (dir.lengthSq() < 1e-6 || !this._framed) {
      const v = this.product.meta.viewDir;          // the angle of the product's photo, if it has one
      if (v) dir.set(v[0], v[1], v[2]); else dir.set(0, 0.12, 1);
    }
    // flat things (cards, notebook) are seen from above; standing ones from the side
    const flat = s.y < 0.35 * Math.max(s.x, s.z);
    this.controls.minPolarAngle = flat ? 0.04 * Math.PI : 0.18 * Math.PI;
    this.controls.maxPolarAngle = flat ? 0.47 * Math.PI : 0.62 * Math.PI;
    this.controls.target.copy(target);
    this.camera.position.copy(target).add(dir.normalize().multiplyScalar(fit));
    this.controls.minDistance = fit * 0.45;
    this.controls.maxDistance = fit * 1.6;
    this.camera.near = fit / 50;
    this.camera.far = fit * 10;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this._framed = true;
  }

  /* back to the front view */
  front() {
    this._framed = false;
    this.frame();
    this.requestRender();
  }

  setDesign(canvas) {
    const old = this.uniforms.uDesign.value;
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.premultiplyAlpha = true;
    t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    this.uniforms.uDesign.value = t;
    if (old) old.dispose();
    this.designAspect = canvas.logoAspect || 1;
    this.requestRender();
  }

  set(patch) {
    Object.assign(this.state, patch);
    this.applyState();
    return this;
  }

  applyState() {
    const s = this.state, u = this.uniforms, meta = this.product && this.product.meta;
    u.uCenter.value.set(s.u, s.v);
    u.uWidth.value = s.w;
    u.uRot.value = s.rot || 0;
    u.uMode.value = MODES[s.mode] ?? 0;
    u.uDesignOn.value = s.design ? 1 : 0;
    u.uUseInk.value = s.ink ? 1 : 0;
    if (s.ink) u.uInk.value.set(s.ink);
    u.uFoil.value.set(s.foil || '#d4af37');
    u.uGloss.value = s.gloss ?? 0.15;
    u.uPitch.value = s.pitch || 0.0004;
    u.uRelief.value = s.relief ?? 1;
    u.uReveal.value = s.reveal ? 1 : 0;
    u.uPhysW.value = Math.max(0.005, s.w * ((meta && (meta.printWidthM || meta.widthM)) || 0.3));
    if (this.product) {
      this.product.scene.traverse((o) => {
        if (!o.isMesh) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (!m.userData.tint) continue;
          if (s.tint) m.color.set(s.tint);
          else m.color.copy(m.userData.base);
          if ('sheen' in m) m.sheenColor.copy(m.color).lerp(WHITE, 0.25);
        }
      });
    }
    this.requestRender();
  }

  requestRender() {
    this._dirty = true;
    if (!this._running) { this._running = true; requestAnimationFrame(this._loop); }
  }

  _loop() {
    const moving = this.controls.update();       // damping and auto-rotate keep the loop going
    if ((this._dirty || moving || this.controls.autoRotate) && this._visible) {
      this.renderer.render(this.scene, this.camera);
      this._dirty = false;
    }
    if (this._dirty || moving || (this.controls.autoRotate && this._visible) || this._dragging) requestAnimationFrame(this._loop);
    else this._running = false;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
    this._dirty = false;
  }

  /* PrintUV under a client point, or null off the print area */
  uvAt(clientX, clientY) {
    if (!this.product) return null;
    const r = this.canvas.getBoundingClientRect();
    const p = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(p, this.camera);
    const hit = ray.intersectObject(this.product.scene, true)[0];
    if (!hit || !hit.uv1 || hit.uv1.x < -1) return null;
    return { u: hit.uv1.x, v: 1 - hit.uv1.y };
  }

  /* is the point on the logo itself (so a drag moves the logo, not the camera)? */
  onDesign(clientX, clientY) {
    const uv = this.uvAt(clientX, clientY);
    if (!uv) return false;
    const s = this.state, a = this.uniforms.uAspect.value;
    const dx = (uv.u - s.u) * a, dy = uv.v - s.v;
    const c = Math.cos(-s.rot), sn = Math.sin(-s.rot);
    const tx = (c * dx - sn * dy) / (s.w * a) + 0.5, ty = (sn * dx + c * dy) / (s.w * a) + 0.5;
    const la = this.designAspect || 1;
    const hw = la >= 1 ? 0.5 : 0.5 * la, hh = la >= 1 ? 0.5 / la : 0.5;
    return Math.abs(tx - 0.5) <= hw && Math.abs(ty - 0.5) <= hh;
  }

  snapshot(type = 'image/png') {
    this.render();
    return new Promise((res) => this.canvas.toBlob(res, type, 0.92));
  }

  dispose() {
    this._resize.disconnect();
    this._io.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
