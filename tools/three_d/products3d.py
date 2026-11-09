"""Export the products built in Blender (tools/mockups) as GLB models for the web 360° studio.
Run with Blender's Python (the bpy module):

    python tools/three_d/products3d.py <out_dir> [mug pen ...]

For each product: the scene is built by its tools/mockups builder, the photo set (floor, sweep, backdrop
cloth, lights, camera) is dropped, modifiers are applied and heavy meshes thinned, then every surface is
baked to plain textures (colour, roughness, normal), because Blender's procedural materials do not exist
on the web. Materials end up named like the garments': "tint:..." take the visitor's colour (print area
and body), "keep:..." stay (metal, pages, zip teeth...). PrintUV, the print area in 0..1, is kept for
the print faces and moved to (-4, -4) everywhere else. The photo's camera direction is saved, so a flat
item (cards, notebook) opens seen from above like in its photo.
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'mockups'))

import bpy                      # noqa: E402
import bmesh                    # noqa: E402
import numpy as np              # noqa: E402
from mathutils import Vector    # noqa: E402

import products                 # noqa: E402
import accessories              # noqa: E402

SCENES = {**products.SCENES, **accessories.SCENES}
SKIP = {'tee'}                                      # the T-shirt comes from garments.py now
BACKDROP = {'ground', 'sweep', 'fabric', 'denim'}
FIXED = {'chrome', 'steel', 'pages', 'band', 'ribbon', 'lid', 'eyelet', 'string', 'teeth', 'tape', 'grip'}
OFF = (-4.0, -4.0)
MAX_POLYS = 40000


def log(*a):
    print('[products3d]', *a, flush=True)


def tintable(name):
    return name == 'print' or name.startswith('body')


def clean_scene():
    for o in list(bpy.context.scene.objects):
        if o.type != 'MESH' or o.name in BACKDROP:
            bpy.data.objects.remove(o, do_unlink=True)
    return [o for o in bpy.context.scene.objects if o.type == 'MESH']


def apply_modifiers(objs):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def thin(o, budget):
    n = len(o.data.polygons)
    if n <= budget:
        return
    m = o.modifiers.new('thin', 'DECIMATE')
    m.ratio = budget / n
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=m.name)


def ensure_uv(o):
    """A UVMap without overlaps for baking, first in the list; PrintUV (if any) second."""
    me = o.data
    if 'UVMap' not in me.uv_layers:
        me.uv_layers.new(name='UVMap')
    me.uv_layers.active = me.uv_layers['UVMap']
    for x in bpy.context.scene.objects:
        x.select_set(False)
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004)
    bpy.ops.object.mode_set(mode='OBJECT')
    # UVMap must come first (glTF TEXCOORD_0), PrintUV second (TEXCOORD_1)
    if 'PrintUV' in me.uv_layers and me.uv_layers[0].name != 'UVMap':
        pu = [tuple(d.uv) for d in me.uv_layers['PrintUV'].data]
        me.uv_layers.remove(me.uv_layers['PrintUV'])
        nl = me.uv_layers.new(name='PrintUV')
        for i, uv in enumerate(pu):
            nl.data[i].uv = uv
    for l in list(me.uv_layers):
        if l.name not in ('UVMap', 'PrintUV'):
            me.uv_layers.remove(l)
    me.uv_layers.active = me.uv_layers['UVMap']


def bake_size(o):
    d = max(o.dimensions)
    return 1024 if d > 0.08 else (512 if d > 0.02 else 256)


def bake(o, kind, img):
    for s in o.material_slots:
        nt = s.material.node_tree
        tex = nt.nodes.get('__bake') or nt.nodes.new('ShaderNodeTexImage')
        tex.name = '__bake'
        tex.image = img
        nt.nodes.active = tex
    for x in bpy.context.scene.objects:
        x.select_set(False)
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    kw = {'type': kind, 'margin': 6, 'use_clear': True}
    if kind == 'DIFFUSE':
        kw['pass_filter'] = {'COLOR'}
    if kind == 'NORMAL':
        kw['normal_space'] = 'TANGENT'
    bpy.ops.object.bake(**kw)


def principled_values(m):
    b = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if b is None:
        return 0.0, 0.5
    return float(b.inputs['Metallic'].default_value), float(b.inputs['Roughness'].default_value)


def bake_object(o, pid, tint):
    """Bake colour, roughness and normal of every material of o into three images, then give o new
    glTF-friendly materials (one per original slot) that use them."""
    n = bake_size(o)
    imgs = {}
    for kind, cs in (('DIFFUSE', 'sRGB'), ('ROUGHNESS', 'Non-Color'), ('NORMAL', 'Non-Color')):
        img = bpy.data.images.new(f'{pid}_{o.name}_{kind.lower()}', n, n, alpha=False, float_buffer=False)
        img.colorspace_settings.name = cs
        bake(o, kind, img)
        imgs[kind] = img
    if tint:
        # a tintable surface: make its colour average white, so the chosen colour multiplies cleanly
        px = np.array(imgs['DIFFUSE'].pixels[:], np.float32).reshape(-1, 4)
        used = px[:, :3].max(1) > 0.02
        mean = px[used, :3].mean(0) if used.any() else np.ones(3)
        px[:, :3] = np.clip(px[:, :3] / np.maximum(mean, 0.05) * 0.96, 0, 1)
        imgs['DIFFUSE'].pixels[:] = px.ravel()
    for img in imgs.values():
        img.pack()
    new = []
    for s in o.material_slots:
        old = s.material
        metal, rough = principled_values(old)
        is_tint = tint and tintable(old.name)
        m = bpy.data.materials.new(('tint:' if is_tint else ('print:' if old.name == 'print' else 'keep:')) + old.name)
        m.use_nodes = True
        nt = m.node_tree
        b = nt.nodes['Principled BSDF']
        b.inputs['Metallic'].default_value = metal
        uv = nt.nodes.new('ShaderNodeUVMap')
        uv.uv_map = 'UVMap'
        for kind, sock in (('DIFFUSE', 'Base Color'), ('ROUGHNESS', 'Roughness')):
            t = nt.nodes.new('ShaderNodeTexImage')
            t.image = imgs[kind]
            nt.links.new(uv.outputs['UV'], t.inputs['Vector'])
            nt.links.new(t.outputs['Color'], b.inputs[sock])
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = imgs['NORMAL']
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(uv.outputs['UV'], t.inputs['Vector'])
        nt.links.new(t.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
        s.material = m
        new.append(m.name)
    return new


def print_uv_only_on_print(o):
    """PrintUV stays on the print faces; everything else goes to OFF, where no logo can land."""
    me = o.data
    if 'PrintUV' not in me.uv_layers:
        return 0
    pl = me.uv_layers['PrintUV'].data
    pidx = {i for i, s in enumerate(o.material_slots) if s.material and s.material.name == 'print'}
    n = 0
    for p in me.polygons:
        if p.material_index in pidx:
            n += 1
            continue
        for li in p.loop_indices:
            pl[li].uv = OFF
    return n


def view_dir(cam, target):
    """Camera direction in glTF axes (Y up, Z towards the viewer)."""
    d = (cam.location - target).normalized()
    return [round(d.x, 4), round(d.z, 4), round(-d.y, 4)]


def build(pid, out):
    meta = SCENES[pid]()
    cam = bpy.context.scene.camera
    cam_loc = cam.location.copy() if cam else Vector((0, -1, 0.3))
    objs = clean_scene()
    apply_modifiers(objs)
    objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    target = (lo + hi) / 2

    class _C:
        location = cam_loc
    vdir = view_dir(_C, target)

    tint = bool(meta.get('tintable'))
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 16
    sc.cycles.device = 'CPU'
    mats, faces = [], 0
    for o in objs:
        # print faces first, before slots are replaced
        print_names = [s.material.name if s.material else '' for s in o.material_slots]
        thin(o, MAX_POLYS)
        for p in o.data.polygons:
            p.use_smooth = p.use_smooth
        ensure_uv(o)
        faces += print_uv_only_on_print(o)
        mats += bake_object(o, pid, tint)
    for o in bpy.context.scene.objects:
        o.select_set(o.type == 'MESH')
    path = os.path.join(out, f'{pid}.glb')
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_yup=True,
        export_texcoords=True, export_normals=True, export_materials='EXPORT',
        export_image_format='WEBP', export_image_quality=86,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14, export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=14)
    presets = (meta.get('extra') or {}).get('presets') or {'center': meta['default']}
    size = [round(v, 4) for v in (hi.x - lo.x, hi.z - lo.z, hi.y - lo.y)]
    log(pid, 'objects', len(objs), 'print faces', faces, 'size', size, f'{os.path.getsize(path) / 1e6:.2f} MB')
    return {'file': f'{pid}.glb', 'size': size, 'printAspect': round(meta['print_aspect'], 4),
            'presets': presets, 'default': meta['default'], 'viewDir': vdir, 'tintable': tint,
            'materials': sorted(set(mats))}


def main():
    out = sys.argv[1]
    ids = sys.argv[2:] or [k for k in SCENES if k not in SKIP]
    mpath = os.path.join(out, 'models.json')
    meta = json.load(open(mpath)) if os.path.exists(mpath) else {}
    for pid in ids:
        meta[pid] = {**meta.get(pid, {}), **build(pid, out)}
        json.dump(meta, open(mpath, 'w'), indent=1)


if __name__ == '__main__':
    main()
