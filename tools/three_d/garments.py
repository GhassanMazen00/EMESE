"""Prepare downloaded 3D garments (Sketchfab, CC Attribution) for the web studio. Run with Blender's
Python (the bpy module):

    python tools/three_d/garments.py <models_dir> <fabric_dir> <out_dir> [tee polo ...]

<models_dir> holds the original GLB downloads (named as in GARMENTS[...]['src']), <fabric_dir> the
normal maps from fabric.py. For each garment this writes <out_dir>/<id>.glb and adds its entry to
<out_dir>/models.json. What happens to each model:

  * all parts joined into one mesh, scaled to real size (metres), centred, front facing the viewer
  * thinned (decimated) to a triangle budget phones can draw smoothly
  * materials split in two: "tint:..." take the colour the visitor picks (body, collar, cuffs, crown),
    "keep:..." stay as they are (buttons, buckle, cord tips); a tint material's own colour texture is
    turned neutral (grey scale, white average) so any colour multiplies cleanly
  * fabric without a texture gets a knit / fleece / rib normal map at its real scale
  * a second UV map, PrintUV, puts the print area of the garment (chest, cap front) in 0..1, the same
    coordinates the photo studio uses; everything outside it sits at (-4, -4), where no logo can land
  * exported as GLB with Draco-compressed geometry and WebP textures
"""
import json
import math
import os
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Vector

GARMENTS = {
    'tee': {
        'src': 'tee3.glb', 'height': 0.72, 'budget': 70000, 'fabric': 'jersey', 'tile': 0.045,
        'tint': ['*'], 'keep': [],
        'print': {'kind': 'planar', 'width': 0.34, 'z': (0.12, 0.84)},
        'presets': {'center': {'u': 0.5, 'v': 0.74, 'w': 0.62}, 'chest': {'u': 0.75, 'v': 0.82, 'w': 0.27},
                    'big': {'u': 0.5, 'v': 0.6, 'w': 0.9}},
        'default': 'center',
    },
    'polo': {
        'src': 'polo17.glb', 'height': 0.74, 'budget': 80000, 'fabric': None, 'tile': 0.05,
        'tint': ['FABRIC', 'hard', 'PT_FABRIC'], 'keep': ['Material1299032'],
        'print': {'kind': 'planar', 'width': 0.34, 'z': (0.10, 0.80)},
        'presets': {'chest': {'u': 0.75, 'v': 0.84, 'w': 0.26}, 'center': {'u': 0.5, 'v': 0.7, 'w': 0.6},
                    'big': {'u': 0.5, 'v': 0.58, 'w': 0.88}},
        'default': 'chest',
    },
    'polo_ls': {
        'src': 'polo2.glb', 'height': 0.74, 'budget': 60000, 'fabric': 'jersey', 'tile': 0.045,
        'tint': ['Back', 'Front', 'Collar', 'Upper', 'Lower', 'Pocket', 'Button'], 'keep': [],
        # the model has its arms held out: bring the sleeves down, bending at the shoulder seam
        'lower_arms': {'materials': ['Upper', 'Lower'], 'angle': 20, 'ramp': 0.11},
        'print': {'kind': 'planar', 'width': 0.32, 'z': (0.10, 0.80)},
        # its pocket is on the wearer's left chest, so the chest logo goes on the other side
        'presets': {'chest': {'u': 0.26, 'v': 0.84, 'w': 0.27}, 'center': {'u': 0.5, 'v': 0.7, 'w': 0.6},
                    'big': {'u': 0.5, 'v': 0.58, 'w': 0.88}},
        'default': 'chest',
    },
    'hoodie': {
        'src': 'hoodie19.glb', 'height': 0.74, 'budget': 80000, 'fabric': 'fleece', 'tile': 0.04,
        'tint': ['Knit_Fleece', 'Rib', 'BTN_FABRIC', 'Holes'], 'keep': ['Straps', 'Material'],
        'print': {'kind': 'planar', 'width': 0.32, 'z': (0.30, 0.72)},
        'presets': {'center': {'u': 0.5, 'v': 0.55, 'w': 0.7}, 'chest': {'u': 0.75, 'v': 0.72, 'w': 0.28},
                    'big': {'u': 0.5, 'v': 0.5, 'w': 0.95}},
        'default': 'center',
    },
    'cap': {
        'src': 'cap0.glb', 'height': None, 'depth': 0.27, 'budget': 60000, 'fabric': None, 'tile': 0.04,
        'tint': ['baseballCap', 'blinn1SG'], 'keep': ['plastic'],
        'print': {'kind': 'cylinder', 'span_deg': 62, 'z': (0.30, 0.86)},
        'presets': {'center': {'u': 0.5, 'v': 0.5, 'w': 0.55}, 'big': {'u': 0.5, 'v': 0.5, 'w': 0.8}},
        'default': 'center',
    },
}

OFF = (-4.0, -4.0)          # PrintUV of everything that is not print area


def log(*a):
    print('[garments]', *a, flush=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_glb(path):
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.context.scene.objects if o.type == 'MESH']


def join_all(meshes):
    """One object, transforms applied, a single UV layer called UVMap."""
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in meshes:
        me = o.data
        while len(me.uv_layers) > 1:
            me.uv_layers.remove(me.uv_layers[-1])
        if len(me.uv_layers) == 0:
            me.uv_layers.new(name='UVMap')
        me.uv_layers[0].name = 'UVMap'
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    for o in list(bpy.context.scene.objects):
        if o is not obj:
            bpy.data.objects.remove(o)
    obj.name = 'garment'
    return obj


def normalise(obj, cfg):
    me = obj.data
    co = np.array([v.co[:] for v in me.vertices])
    lo, hi = co.min(0), co.max(0)
    if cfg.get('height'):
        k = cfg['height'] / (hi[2] - lo[2])
    else:
        k = cfg['depth'] / (hi[1] - lo[1])
    ctr = (lo + hi) / 2
    for v in me.vertices:
        v.co = (Vector(v.co) - Vector(ctr)) * k
    me.update()
    co = np.array([v.co[:] for v in me.vertices])
    return co.min(0), co.max(0)


def lower_arms(obj, cfg):
    """Rotate the sleeve pieces down about each shoulder. The rotation grows from nothing at the seam
    to the full angle a few centimetres down the arm, so the sleeve bends instead of tearing off."""
    la = cfg.get('lower_arms')
    if not la:
        return
    me = obj.data
    idx = {i for i, s in enumerate(obj.material_slots) if s.material and matches(s.material.name, la['materials'])}
    sleeve = set()
    for p in me.polygons:
        if p.material_index in idx:
            sleeve.update(p.vertices)
    for side in (1, -1):
        vs = [i for i in sleeve if me.vertices[i].co.x * side > 0]
        xs = [abs(me.vertices[i].co.x) for i in vs]
        x0 = min(xs)
        top = max(me.vertices[i].co.z for i in vs if abs(me.vertices[i].co.x) < x0 + 0.03)
        piv = Vector((side * (x0 + 0.01), 0, top - 0.015))
        for i in vs:
            v = me.vertices[i]
            d = Vector((v.co.x - piv.x, 0, v.co.z - piv.z))
            t = min(1.0, max(0.0, (abs(v.co.x) - x0) / la['ramp']))
            a = -side * math.radians(la['angle']) * (t * t * (3 - 2 * t))
            c, s_ = math.cos(a), math.sin(a)
            v.co.x = piv.x + c * d.x - s_ * d.z
            v.co.z = piv.z + s_ * d.x + c * d.z
    me.update()


def tris(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def weld(obj, dist=0.0003):
    """Garments come as separate pattern pieces. Join the seams, so thinning cannot open cracks."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    before = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    after = len(bm.verts)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return before - after


def decimate(obj, budget):
    n = tris(obj)
    if n <= budget:
        return n, n
    m = obj.modifiers.new('thin', 'DECIMATE')
    m.ratio = budget / n
    m.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=m.name)
    for p in obj.data.polygons:
        p.use_smooth = True
    return n, tris(obj)


def matches(name, pats):
    return any(p == '*' or p.lower() in name.lower() for p in pats)


def neutral_image(img):
    """Grey-scale copy of a colour texture, brightened so its typical value is near white."""
    px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)
    lum = px[:, :3] @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    ref = max(np.percentile(lum, 70), 1e-3)
    g = np.clip(lum / ref * 0.92, 0, 1)
    out = bpy.data.images.new(img.name + '_neutral', img.size[0], img.size[1], alpha=False)
    out.pixels[:] = np.stack([g, g, g, np.ones_like(g)], 1).ravel()
    out.file_format = 'PNG'
    out.pack()
    return out


def uv_density(obj, mat_index):
    """UV units per metre for the faces of one material slot."""
    me = obj.data
    uvl = me.uv_layers['UVMap'].data
    a_w = a_uv = 0.0
    for p in me.polygons:
        if p.material_index != mat_index:
            continue
        a_w += p.area
        pts = [uvl[li].uv for li in p.loop_indices]
        s = 0.0
        for i in range(1, len(pts) - 1):
            e1, e2 = pts[i] - pts[0], pts[i + 1] - pts[0]
            s += abs(e1.x * e2.y - e1.y * e2.x) / 2
        a_uv += s
    return math.sqrt(a_uv / a_w) if a_w > 0 and a_uv > 0 else 1.0


def fabric_materials(obj, cfg, fabric_dir):
    me = obj.data
    out = {'tint': [], 'keep': []}
    for idx, slot in enumerate(obj.material_slots):
        m = slot.material
        if m is None:
            continue
        tint = matches(m.name, cfg['tint']) and not matches(m.name, cfg['keep'])
        if m.name.startswith(('tint:', 'keep:')):
            continue
        m.name = ('tint:' if tint else 'keep:') + m.name.split('_FRONT')[0][:24]
        out['tint' if tint else 'keep'].append(m.name)
        if not tint or not m.use_nodes:
            continue
        nt = m.node_tree
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        base = bsdf.inputs['Base Color']
        if base.is_linked and base.links[0].from_node.type == 'TEX_IMAGE':
            tex = base.links[0].from_node
            tex.image = neutral_image(tex.image)
        else:
            base.default_value = (1, 1, 1, 1)
        bsdf.inputs['Roughness'].default_value = 0.88
        for k, v in (('Specular IOR Level', 0.25), ('Sheen Weight', 0.35), ('Sheen Roughness', 0.45)):
            if k in bsdf.inputs:
                bsdf.inputs[k].default_value = v
        if 'Sheen Tint' in bsdf.inputs:
            bsdf.inputs['Sheen Tint'].default_value = (1, 1, 1, 1)
        kind = cfg['fabric']
        if 'rib' in m.name.lower():
            kind = 'rib' if kind else None
        if kind and not bsdf.inputs['Normal'].is_linked:
            img = bpy.data.images.load(os.path.join(fabric_dir, f'{kind}.png'))
            img.colorspace_settings.name = 'Non-Color'
            img.pack()
            uvn = nt.nodes.new('ShaderNodeUVMap')
            uvn.uv_map = 'UVMap'
            mp = nt.nodes.new('ShaderNodeMapping')
            s = 1.0 / (uv_density(obj, idx) * cfg['tile'])
            mp.inputs['Scale'].default_value = (s, s, 1)
            tx = nt.nodes.new('ShaderNodeTexImage')
            tx.image = img
            nm = nt.nodes.new('ShaderNodeNormalMap')
            nm.inputs['Strength'].default_value = 0.8
            nt.links.new(uvn.outputs['UV'], mp.inputs['Vector'])
            nt.links.new(mp.outputs['Vector'], tx.inputs['Vector'])
            nt.links.new(tx.outputs['Color'], nm.inputs['Color'])
            nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    return out


def print_uv(obj, cfg, lo, hi):
    """PrintUV: the print area in 0..1, everything else at OFF. Returns (width / height, width in metres)."""
    me = obj.data
    uvl = me.uv_layers.new(name='PrintUV')
    pc = cfg['print']
    H = hi[2] - lo[2]
    z0, z1 = lo[2] + pc['z'][0] * H, lo[2] + pc['z'][1] * H
    tint_idx = {i for i, s in enumerate(obj.material_slots) if s.material and s.material.name.startswith('tint:')}
    y_front = lo[1] + 0.55 * (hi[1] - lo[1])
    for li in range(len(uvl.data)):
        uvl.data[li].uv = OFF
    count = 0
    if pc['kind'] == 'planar':
        W = pc['width']
        x0 = -W / 2
        for p in me.polygons:
            c, n = p.center, p.normal
            if p.material_index not in tint_idx or not (x0 - 0.02 <= c.x <= -x0 + 0.02 and z0 - 0.02 <= c.z <= z1 + 0.02):
                continue
            if n.y > -0.25 or c.y > y_front:
                continue
            count += 1
            for li in p.loop_indices:
                v = me.vertices[me.loops[li].vertex_index].co
                uvl.data[li].uv = ((v.x - x0) / W, (v.z - z0) / (z1 - z0))
        aspect, width = W / (z1 - z0), W
    else:
        span = math.radians(pc['span_deg'])
        crown = [p for p in me.polygons if p.material_index in tint_idx and p.center.z > z0]
        cx = sum(p.center.x for p in crown) / len(crown)
        cy = sum(p.center.y for p in crown) / len(crown)
        rs = []
        for p in me.polygons:
            c, n = p.center, p.normal
            if p.material_index not in tint_idx or not (z0 - 0.01 <= c.z <= z1 + 0.01):
                continue
            rx, ry = c.x - cx, c.y - cy
            r = math.hypot(rx, ry)
            th = math.atan2(rx, -ry)                # 0 straight ahead (the front faces -Y)
            if abs(th) > span + 0.1 or r < 1e-6 or (n.x * rx + n.y * ry) / r < 0.25:
                continue
            count += 1
            rs.append(r)
            for li in p.loop_indices:
                v = me.vertices[me.loops[li].vertex_index].co
                t = math.atan2(v.x - cx, -(v.y - cy))
                uvl.data[li].uv = (t / (2 * span) + 0.5, (v.z - z0) / (z1 - z0))
        R = float(np.median(rs)) if rs else 0.1
        aspect, width = 2 * span * R / (z1 - z0), 2 * span * R
    log('print faces', count, 'aspect', round(aspect, 3), 'width', round(width, 3))
    return aspect, width


def export(obj, path):
    for o in bpy.context.scene.objects:
        o.select_set(o is obj)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_yup=True,
        export_texcoords=True, export_normals=True, export_materials='EXPORT',
        export_image_format='WEBP', export_image_quality=86,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14, export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=14)


def credit(models, src):
    """Title, author, licence and link of the source model, as recorded when it was downloaded."""
    c = json.load(open(os.path.join(models, 'credits.json')))[src.rsplit('.', 1)[0]]
    return {'title': c['name'], 'author': c['user'], 'license': c['license'],
            'url': 'https://sketchfab.com/3d-models/' + c['uid']}


def build(gid, cfg, models, fabric, out):
    reset()
    meshes = import_glb(os.path.join(models, cfg['src']))
    obj = join_all(meshes)
    lo, hi = normalise(obj, cfg)
    if cfg.get('lower_arms'):
        lower_arms(obj, cfg)
        lo, hi = normalise(obj, cfg)
    log('welded', weld(obj), 'seam vertices')
    before, after = decimate(obj, cfg['budget'])
    mats = fabric_materials(obj, cfg, fabric)
    aspect, width = print_uv(obj, cfg, lo, hi)
    path = os.path.join(out, f'{gid}.glb')
    export(obj, path)
    size = [round(float(v), 3) for v in (hi - lo)]
    log(gid, f'tris {before} -> {after}', 'size', size, 'materials', mats, f'{os.path.getsize(path) / 1e6:.2f} MB')
    return {'file': f'{gid}.glb', 'size': size, 'printAspect': round(aspect, 4), 'printWidthM': round(width, 4),
            'materials': mats,
            'presets': cfg['presets'], 'default': cfg['presets'][cfg['default']],
            'credit': credit(models, cfg['src'])}


def main():
    models, fabric, out = sys.argv[1:4]
    ids = sys.argv[4:] or list(GARMENTS)
    os.makedirs(out, exist_ok=True)
    mpath = os.path.join(out, 'models.json')
    meta = json.load(open(mpath)) if os.path.exists(mpath) else {}
    for gid in ids:
        meta[gid] = {**meta.get(gid, {}), **build(gid, GARMENTS[gid], models, fabric, out)}
    json.dump(meta, open(mpath, 'w'), indent=1)


if __name__ == '__main__':
    main()
