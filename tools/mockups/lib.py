"""Shared helpers for EMESE product mockup renders (Blender / Cycles).

Every product scene follows one convention so the website can composite any
design onto the photo:

  material name "print"    printable surface (needs the "PrintUV" UV map)
  material name "body*"    rest of the product that can change colour
  anything else            props, backdrop, metal parts... left untouched

For each product we render:
  photo   the beauty shot                       (sRGB)
  light   diffuse light arriving on the product (white-diffuse re-render)
  albedo  the original base colour              (emission pass)
  uv      PrintUV coordinates, 12 bit packed    (1 sample, no filtering)
  mask    R = print coverage, G = tintable coverage

The browser then does, in linear light:
  out = photo + (new_albedo - old_albedo) * light
which recolours the product and lays the print into the real lighting.
"""
import json
import math
import os
import time

import bpy
import bmesh
import numpy as np
from mathutils import Vector
from PIL import Image, ImageFilter

RES = 1200


# ---------------------------------------------------------------- scene ---
def reset(res=None, samples=256):
    res = res or RES
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.view_settings.exposure = 0
    sc.cycles.samples = samples
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.008
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 8
    sc.cycles.caustics_reflective = False
    sc.cycles.caustics_refractive = False
    sc.render.film_transparent = False
    sc.render.threads_mode = 'AUTO'
    world = bpy.data.worlds.new('world')
    sc.world = world
    world.use_nodes = True
    return sc


def world_color(rgb=(1, 1, 1), strength=0.35):
    nt = bpy.context.scene.world.node_tree
    bg = nt.nodes.get('Background')
    bg.inputs['Color'].default_value = (*rgb, 1)
    bg.inputs['Strength'].default_value = strength


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def camera(loc, look_at, lens=85, shift=(0, 0)):
    cam = bpy.data.cameras.new('cam')
    cam.lens = lens
    cam.shift_x, cam.shift_y = shift
    obj = link(bpy.data.objects.new('cam', cam))
    obj.location = loc
    direction = Vector(look_at) - Vector(loc)
    obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = obj
    return obj


def area_light(loc, look_at, energy, size, color=(1, 1, 1), size_y=None, shape='RECTANGLE'):
    light = bpy.data.lights.new('area', 'AREA')
    light.energy = energy
    light.shape = shape
    light.size = size
    light.size_y = size_y or size
    light.color = color
    obj = link(bpy.data.objects.new('area', light))
    obj.location = loc
    direction = Vector(look_at) - Vector(loc)
    obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    return obj


def mesh_object(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return link(bpy.data.objects.new(name, me))


def smooth(obj):
    for p in obj.data.polygons:
        p.use_smooth = True


def apply_modifiers(obj):
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.view_layer.objects:
        o.select_set(o == obj)
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


# ------------------------------------------------------------ materials ---
def principled(name, color=(0.8, 0.8, 0.8), rough=0.5, metallic=0.0, coat=0.0, coat_rough=0.05,
               sheen=0.0, sheen_rough=0.5, spec=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Coat Weight'].default_value = coat
    p.inputs['Coat Roughness'].default_value = coat_rough
    p.inputs['Sheen Weight'].default_value = sheen
    p.inputs['Sheen Roughness'].default_value = sheen_rough
    p.inputs['Specular IOR Level'].default_value = spec
    return m


def node(m, kind, **inputs):
    n = m.node_tree.nodes.new(kind)
    for k, v in inputs.items():
        if k.startswith('_'):
            setattr(n, k[1:], v)
        else:
            n.inputs[k].default_value = v
    return n


def connect(m, a, b):
    m.node_tree.links.new(a, b)


def add_bump(m, height_socket, strength=0.2, distance=0.001):
    p = m.node_tree.nodes['Principled BSDF']
    b = node(m, 'ShaderNodeBump', Strength=strength, Distance=distance)
    connect(m, height_socket, b.inputs['Height'])
    connect(m, b.outputs['Normal'], p.inputs['Normal'])
    return b


def tex_coord(m, space='Object'):
    return node(m, 'ShaderNodeTexCoord').outputs[space]


def noise(m, vec, scale, detail=4, rough=0.5, distortion=0.0):
    n = node(m, 'ShaderNodeTexNoise', Scale=scale, Detail=detail, Roughness=rough, Distortion=distortion)
    connect(m, vec, n.inputs['Vector'])
    return n


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


# ----------------------------------------------------- render variants ---
def _prepare_variants():
    """Add the extra shader branches each material needs for the data passes."""
    for m in bpy.data.materials:
        if not m.use_nodes or 'Principled BSDF' not in m.node_tree.nodes:
            continue
        nt = m.node_tree
        p = nt.nodes['Principled BSDF']
        out = nt.nodes['Material Output']
        v = {}
        v['orig'] = out.inputs['Surface'].links[0].from_socket
        # white diffuse with the same micro normal (keeps fabric/leather texture in the light pass)
        d = nt.nodes.new('ShaderNodeBsdfDiffuse')
        d.inputs['Color'].default_value = (1, 1, 1, 1)
        if p.inputs['Normal'].links:
            nt.links.new(p.inputs['Normal'].links[0].from_socket, d.inputs['Normal'])
        v['light'] = d.outputs['BSDF']
        # albedo as emission
        e = nt.nodes.new('ShaderNodeEmission')
        e.inputs['Strength'].default_value = 1
        if p.inputs['Base Color'].links:
            nt.links.new(p.inputs['Base Color'].links[0].from_socket, e.inputs['Color'])
        else:
            e.inputs['Color'].default_value = p.inputs['Base Color'].default_value
        v['albedo'] = e.outputs['Emission']
        # PrintUV as emission
        if m.name == 'print':
            uvn = nt.nodes.new('ShaderNodeUVMap')
            uvn.uv_map = 'PrintUV'
            sep = nt.nodes.new('ShaderNodeSeparateXYZ')
            comb = nt.nodes.new('ShaderNodeCombineXYZ')
            nt.links.new(uvn.outputs['UV'], sep.inputs['Vector'])
            nt.links.new(sep.outputs['X'], comb.inputs['X'])
            nt.links.new(sep.outputs['Y'], comb.inputs['Y'])
            eu = nt.nodes.new('ShaderNodeEmission')
            eu.inputs['Strength'].default_value = 1
            nt.links.new(comb.outputs['Vector'], eu.inputs['Color'])
            v['uv'] = eu.outputs['Emission']
        # coverage mask
        em = nt.nodes.new('ShaderNodeEmission')
        em.inputs['Strength'].default_value = 1
        v['maskemit'] = em
        v['mask'] = em.outputs['Emission']
        h = nt.nodes.new('ShaderNodeHoldout')
        v['holdout'] = h.outputs['Holdout']
        m['_variants'] = True
        _VARIANTS[m.name] = v


_VARIANTS = {}


def _route(mode, tintable):
    for name, v in _VARIANTS.items():
        m = bpy.data.materials[name]
        out = m.node_tree.nodes['Material Output']
        is_print = name == 'print'
        is_body = name.startswith('body')
        if mode == 'photo':
            sock = v['orig']
        elif mode == 'light':
            sock = v['light'] if (is_print or is_body) else v['orig']
        elif mode == 'albedo':
            sock = v['albedo'] if (is_print or is_body) else v['holdout']
        elif mode == 'uv':
            sock = v['uv'] if is_print else v['holdout']
        elif mode == 'mask':
            if is_print:
                v['maskemit'].inputs['Color'].default_value = (1, 1 if tintable else 0, 0, 1)
                sock = v['mask']
            elif is_body and tintable:
                v['maskemit'].inputs['Color'].default_value = (0, 1, 0, 1)
                sock = v['mask']
            else:
                sock = v['holdout']
        m.node_tree.links.new(sock, out.inputs['Surface'])


def _render(path, fmt, samples, denoise, transparent, filter_width=1.5, bounces=8):
    sc = bpy.context.scene
    sc.cycles.samples = samples
    sc.cycles.use_denoising = denoise
    sc.cycles.use_adaptive_sampling = samples > 16
    sc.cycles.filter_width = filter_width
    sc.cycles.max_bounces = bounces
    sc.render.film_transparent = transparent
    s = sc.render.image_settings
    if fmt == 'EXR':
        s.file_format = 'OPEN_EXR'
        s.color_mode = 'RGBA'
        s.color_depth = '32'
        s.exr_codec = 'ZIP'
    else:
        s.file_format = 'PNG'
        s.color_mode = 'RGB'
        s.color_depth = '8'
    sc.render.filepath = path
    t = time.time()
    bpy.ops.render.render(write_still=True)
    print(f'  rendered {os.path.basename(path)} in {time.time() - t:.0f}s')


def _read_exr(path):
    img = bpy.data.images.load(path)
    w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    bpy.data.images.remove(img)
    return np.flipud(buf.reshape(h, w, 4))


def _srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def _u8(x):
    return (np.clip(x, 0, 1) * 255 + 0.5).astype(np.uint8)


def make_thumb(photo, path, size=240):
    w, h = photo.size
    c = int(min(w, h) * 0.82)  # products sit in the middle: crop in a little
    box = ((w - c) // 2, (h - c) // 2, (w + c) // 2, (h + c) // 2)
    photo.crop(box).resize((size, size), Image.LANCZOS).save(path, quality=82, method=6)


# ------------------------------------------------------------- driver ---
def render_product(pid, out_dir, *, tintable, print_aspect, default, extra=None, samples=128, quick=False, preview=False,
                   spec_blur=0.6):
    """Render all passes for the current scene and write web assets."""
    os.makedirs(out_dir, exist_ok=True)
    if preview:  # photo only, for look development
        _render(os.path.join(out_dir, 'preview.png'), 'PNG', 64 if quick else samples, True, False)
        return
    tmp = os.path.join(out_dir, '_tmp')
    os.makedirs(tmp, exist_ok=True)
    _VARIANTS.clear()
    _prepare_variants()
    sc = bpy.context.scene
    world_strength = sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value
    if quick:
        samples = 48

    print(f'[{pid}]')
    _route('photo', tintable)
    _render(os.path.join(tmp, 'photo.exr'), 'EXR', samples, True, False)
    _route('light', tintable)
    _render(os.path.join(tmp, 'light.exr'), 'EXR', max(64, samples // 2), True, False)

    sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0
    _route('albedo', tintable)
    _render(os.path.join(tmp, 'albedo.exr'), 'EXR', 16, False, True, bounces=0)
    _route('mask', tintable)
    _render(os.path.join(tmp, 'mask.exr'), 'EXR', 32, False, True, bounces=0)
    _route('uv', tintable)
    _render(os.path.join(tmp, 'uv.exr'), 'EXR', 1, False, True, filter_width=0.01, bounces=0)
    sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = world_strength
    _route('photo', tintable)

    # ---- encode for the web
    mask = _read_exr(os.path.join(tmp, 'mask.exr'))
    pm = np.clip(mask[..., 0], 0, 1)
    tm = np.clip(mask[..., 1], 0, 1)
    region = np.maximum(pm, tm) > 0.002

    light = _read_exr(os.path.join(tmp, 'light.exr'))[..., :3]
    lum = light[region].max(axis=1) if region.any() else np.array([1.0])
    S = float(np.percentile(lum, 99.7)) * 1.05 if lum.size else 1.0
    light_enc = _u8(_srgb(light / S)) * region[..., None]

    alb = _read_exr(os.path.join(tmp, 'albedo.exr'))
    albedo = alb[..., :3] / np.clip(alb[..., 3:4], 1e-4, 1)  # un-premultiply at edges
    albedo_enc = _u8(_srgb(albedo)) * region[..., None]

    uvr = _read_exr(os.path.join(tmp, 'uv.exr'))
    u = np.clip(uvr[..., 0], 0, 1) * 4095 + 0.5
    v = np.clip(uvr[..., 1], 0, 1) * 4095 + 0.5
    u = u.astype(np.uint16); v = v.astype(np.uint16)
    covered = uvr[..., 3] > 0.5
    uv_enc = np.zeros(uvr.shape[:2] + (3,), np.uint8)
    uv_enc[..., 0] = (u >> 4) & 255
    uv_enc[..., 1] = (v >> 4) & 255
    uv_enc[..., 2] = ((u & 15) << 4) | (v & 15)
    uv_enc[~covered] = 0

    mask_enc = np.zeros(mask.shape[:2] + (3,), np.uint8)
    mask_enc[..., 0] = _u8(pm)
    mask_enc[..., 1] = _u8(tm)
    # B: 255 where the uv pass is valid (lets the shader skip bad edge texels)
    mask_enc[..., 2] = covered.astype(np.uint8) * 255

    photo_lin = _read_exr(os.path.join(tmp, 'photo.exr'))[..., :3]
    photo = Image.fromarray(_u8(_srgb(photo_lin)))
    photo.save(os.path.join(out_dir, 'photo.webp'), quality=90, method=6)

    # Everything the light pass doesn't explain (gloss, sheen, coat), computed in float
    # here so recolouring in the browser never has to subtract two 8-bit images.
    spec = np.clip(photo_lin - albedo * light, 0, None) * region[..., None]
    sv = spec[region].max(axis=1) if region.any() else np.array([0.0])
    SP = max(float(np.percentile(sv, 99.8)) * 1.05, 0.02) if sv.size else 0.02
    # a whisper of blur drops invisible denoiser grain that would otherwise bloat the file
    Image.fromarray(_u8(_srgb(spec / SP))).filter(ImageFilter.GaussianBlur(spec_blur)).save(
        os.path.join(out_dir, 'spec.webp'), quality=86, method=6)
    make_thumb(photo, os.path.join(out_dir, 'thumb.webp'))
    Image.fromarray(light_enc).save(os.path.join(out_dir, 'light.webp'), quality=92, method=6)
    Image.fromarray(albedo_enc).save(os.path.join(out_dir, 'albedo.webp'), quality=95, method=6)
    Image.fromarray(uv_enc).save(os.path.join(out_dir, 'uv.png'), optimize=True)
    Image.fromarray(mask_enc).save(os.path.join(out_dir, 'mask.png'), optimize=True)

    # mean albedo of the tintable area = the colour the photo was shot in
    base = albedo[tm > 0.9].mean(axis=0) if (tm > 0.9).any() else np.array([0.8, 0.8, 0.8])
    meta = {
        'size': [sc.render.resolution_x, sc.render.resolution_y],
        'lightScale': round(S, 4),
        'specScale': round(SP, 4),
        'tintable': tintable,
        'printAspect': print_aspect,
        'default': default,
        'baseLinear': [round(float(c), 4) for c in base],
    }
    if extra:
        meta.update(extra)
    manifest = os.path.join(os.path.dirname(out_dir), 'manifest.json')
    data = json.load(open(manifest)) if os.path.exists(manifest) else {}
    data[pid] = meta
    json.dump(data, open(manifest, 'w'), indent=2, ensure_ascii=False)
    for f in os.listdir(tmp):
        os.remove(os.path.join(tmp, f))
    os.rmdir(tmp)
    print(f'[{pid}] done  lightScale={S:.3f}')
