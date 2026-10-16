"""EMESE product scenes. Run with Blender's Python (bpy):

    python tools/mockups/render.py tee mug ...

Units are metres. Every scene ends by calling lib.render_product().
"""
import math
import random

import bmesh
import bpy
from mathutils import Vector

import lib
from lib import connect, node, principled


# --------------------------------------------------------------- helpers ---
def bezier(p0, c, p1, n=16):
    pts = []
    for i in range(n):
        t = i / n
        a = (1 - t) ** 2
        b = 2 * (1 - t) * t
        d = t * t
        pts.append((a * p0[0] + b * c[0] + d * p1[0], a * p0[1] + b * c[1] + d * p1[1]))
    return pts


def prism(name, outline, z0, z1):
    bm = bmesh.new()
    bottom = [bm.verts.new((x, y, z0)) for x, y in outline]
    top = [bm.verts.new((x, y, z1)) for x, y in outline]
    bm.faces.new(bottom[::-1])
    bm.faces.new(top)
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bottom[i], bottom[j], top[j], top[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return lib.mesh_object(name, bm)


def backdrop_paper(color=(0.80, 0.78, 0.745), size=6.0):
    """Matte paper/plaster surface with very subtle tonal variation."""
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=size / 2)
    obj = lib.mesh_object('ground', bm)
    m = principled('ground', color=color, rough=0.92)
    co = lib.tex_coord(m)
    n1 = lib.noise(m, co, 3.0, detail=6)
    ramp = node(m, 'ShaderNodeMapRange', **{'From Min': 0.3, 'From Max': 0.7, 'To Min': 0.94, 'To Max': 1.03})
    connect(m, n1.outputs['Fac'], ramp.inputs['Value'])
    mul = node(m, 'ShaderNodeMix', _data_type='RGBA', _blend_type='MULTIPLY', Factor=1.0)
    mul.inputs['A'].default_value = (*color, 1)
    connect(m, ramp.outputs['Result'], mul.inputs['B'])
    connect(m, mul.outputs['Result'], m.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    fine = lib.noise(m, co, 900.0, detail=2)
    lib.add_bump(m, fine.outputs['Fac'], strength=0.08, distance=0.0004)
    lib.assign(obj, m)
    return obj


def sweep(color=(0.80, 0.78, 0.745), radius=0.6, depth=3.0, height=2.5, width=6.0):
    """Seamless photo backdrop: floor that curves up into a wall behind the product."""
    prof = [(y, 0.0) for y in (-depth, -0.5, 0.0)]
    for i in range(1, 17):
        a = (i / 16) * (math.pi / 2)
        prof.append((math.sin(a) * radius, radius - math.cos(a) * radius))
    prof.append((radius, height))
    bm = bmesh.new()
    rows = []
    for x in (-width / 2, width / 2):
        rows.append([bm.verts.new((x, y, z)) for y, z in prof])
    for i in range(len(prof) - 1):
        bm.faces.new((rows[0][i], rows[1][i], rows[1][i + 1], rows[0][i + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = lib.mesh_object('sweep', bm)
    lib.smooth(obj)
    m = principled('sweep', color=color, rough=0.95)
    lib.assign(obj, m)
    return obj


def line_groove(m, co, p0, p1, offsets, width=0.0012):
    """Height contribution of stitch grooves parallel to the segment p0->p1 (object XY)."""
    d = Vector((p1[0] - p0[0], p1[1] - p0[1], 0)).normalized()
    nrm = (-d.y, d.x, 0)
    sub = node(m, 'ShaderNodeVectorMath', _operation='SUBTRACT')
    sub.inputs[1].default_value = (p0[0], p0[1], 0)
    connect(m, co, sub.inputs[0])
    dot = node(m, 'ShaderNodeVectorMath', _operation='DOT_PRODUCT')
    dot.inputs[1].default_value = nrm
    connect(m, sub.outputs['Vector'], dot.inputs[0])
    total = None
    for off in offsets:
        a = node(m, 'ShaderNodeMath', _operation='SUBTRACT')
        a.inputs[1].default_value = off
        connect(m, dot.outputs['Value'], a.inputs[0])
        ab = node(m, 'ShaderNodeMath', _operation='ABSOLUTE')
        connect(m, a.outputs['Value'], ab.inputs[0])
        ss = node(m, 'ShaderNodeMapRange', _interpolation_type='SMOOTHSTEP', **{'From Min': 0.0, 'From Max': width, 'To Min': -1.0, 'To Max': 0.0})
        connect(m, ab.outputs['Value'], ss.inputs['Value'])
        if total is None:
            total = ss.outputs['Result']
        else:
            add = node(m, 'ShaderNodeMath', _operation='ADD')
            connect(m, total, add.inputs[0])
            connect(m, ss.outputs['Result'], add.inputs[1])
            total = add.outputs['Value']
    return total


def sum_sockets(m, socks, weights):
    total = None
    for s, w in zip(socks, weights):
        mul = node(m, 'ShaderNodeMath', _operation='MULTIPLY')
        mul.inputs[1].default_value = w
        connect(m, s, mul.inputs[0])
        if total is None:
            total = mul.outputs['Value']
        else:
            add = node(m, 'ShaderNodeMath', _operation='ADD')
            connect(m, total, add.inputs[0])
            connect(m, mul.outputs['Value'], add.inputs[1])
            total = add.outputs['Value']
    return total


def knit_height(m, co, wale=150.0):
    """Jersey knit micro relief + fibre irregularity."""
    wave = node(m, 'ShaderNodeTexWave', _wave_type='BANDS', _bands_direction='X', Scale=wale, Distortion=3.0, Detail=2.0)
    connect(m, co, wave.inputs['Vector'])
    fib = lib.noise(m, co, 420.0, detail=2)
    slub = lib.noise(m, co, 90.0, detail=4, rough=0.65)   # yarn slubs / uneven knit
    soft = lib.noise(m, co, 14.0, detail=3)
    return sum_sockets(m, [wave.outputs['Fac'], fib.outputs['Fac'], slub.outputs['Fac'], soft.outputs['Fac']], [0.16, 0.34, 0.42, 0.5])


# ------------------------------------------------------------------- tee ---
def tee_outline():
    right = []
    right += bezier((0, 0.352), (0.06, 0.356), (0.095, 0.372), 10)          # back neckline
    right += bezier((0.095, 0.372), (0.17, 0.358), (0.235, 0.338), 8)       # shoulder
    right += bezier((0.235, 0.338), (0.325, 0.293), (0.395, 0.228), 10)     # sleeve top
    right += bezier((0.395, 0.228), (0.366, 0.174), (0.335, 0.122), 6)      # cuff
    right += bezier((0.335, 0.122), (0.282, 0.128), (0.262, 0.158), 8)      # sleeve underside to armpit
    right += bezier((0.262, 0.158), (0.252, -0.10), (0.262, -0.345), 16)    # side seam
    right += bezier((0.262, -0.345), (0.13, -0.356), (0.0, -0.352), 12)     # hem
    left = [(-x, y) for x, y in reversed(right[1:])]
    return right + left[:-1]


def front_neck():
    return bezier((-0.095, 0.372), (0.0, 0.262), (0.095, 0.372), 28) + [(0.095, 0.372)]


def _crease(p, a, b, w, h, power=1.0):
    a = Vector(a); b = Vector(b)
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    d = (p - (a + ab * t)).length
    return h * math.exp(-(d / w) ** 2) * math.sin(math.pi * t) ** power


TEE_CREASES = [
    # armpit drag lines, fanning towards the chest
    ((0.262, 0.150), (0.150, 0.075), 0.007, 0.0030),
    ((0.258, 0.120), (0.165, 0.010), 0.008, 0.0024),
    ((0.255, 0.170), (0.180, 0.150), 0.006, 0.0018),
    ((-0.262, 0.150), (-0.160, 0.085), 0.007, 0.0028),
    ((-0.258, 0.115), (-0.175, 0.020), 0.008, 0.0022),
    # sleeves
    ((0.300, 0.300), (0.330, 0.150), 0.009, 0.0022),
    ((0.350, 0.255), (0.360, 0.160), 0.007, 0.0016),
    ((-0.305, 0.295), (-0.335, 0.155), 0.009, 0.0020),
    # long soft body folds
    ((-0.150, 0.180), (0.020, -0.200), 0.034, 0.0016),
    ((0.120, -0.080), (0.230, -0.300), 0.030, 0.0015),
    ((-0.230, -0.180), (-0.060, -0.320), 0.028, 0.0014),
    ((0.040, 0.290), (0.170, 0.240), 0.010, 0.0014),
    # hem ripple
    ((-0.200, -0.300), (-0.120, -0.345), 0.008, 0.0016),
    ((0.050, -0.305), (0.120, -0.345), 0.008, 0.0016),
]


def tee_wrinkles(x, y):
    """Height above the table (always >= 0): soft undulation plus thin creases."""
    p = Vector((x, y))
    z = 0.0016 * (1 + math.sin(9.0 * x + 4.0 * y + 0.6) * math.sin(7.0 * y - 3.0 * x + 1.1))
    z += 0.0008 * (1 + math.sin(17.0 * x - 11.0 * y))
    for a, b, w, h in TEE_CREASES:
        z += _crease(p, a, b, w, h)
    return z


def textured_albedo(m, color, height, amount=0.08):
    """Let micro relief also show in the base colour, so the denoiser keeps it."""
    mr = node(m, 'ShaderNodeMapRange', **{'From Min': 0.0, 'From Max': 1.0, 'To Min': 1.0 - amount, 'To Max': 1.0 + amount * 0.25})
    connect(m, height, mr.inputs['Value'])
    mul = node(m, 'ShaderNodeMix', _data_type='RGBA', _blend_type='MULTIPLY', Factor=1.0)
    mul.inputs['A'].default_value = (*color, 1)
    connect(m, mr.outputs['Result'], mul.inputs['B'])
    connect(m, mul.outputs['Result'], m.node_tree.nodes['Principled BSDF'].inputs['Base Color'])


def fabric_material(name, color, co_kind='Object', hem=True):
    m = principled(name, color=color, rough=0.93, sheen=0.35, sheen_rough=0.55, spec=0.35)
    co = lib.tex_coord(m, co_kind)
    knit = knit_height(m, co)
    textured_albedo(m, color, knit, amount=0.075)
    parts = [knit]
    weights = [1.0]
    if hem:
        # double-needle coverstitch: bottom hem and both cuffs
        parts.append(line_groove(m, co, (-0.3, -0.327), (0.3, -0.327), [0.0, 0.0065]))
        weights.append(0.9)
        for s in (1, -1):
            p0, p1 = (s * 0.395, 0.228), (s * 0.335, 0.122)
            # move the line 22 mm inside the cuff
            off = -0.021  # inward from the cuff edge
            parts.append(line_groove(m, co, p0, p1, [off * (1 if s > 0 else -1), (off - 0.0065) * (1 if s > 0 else -1)]))
            weights.append(0.9)
    height = sum_sockets(m, parts, weights)
    lib.add_bump(m, height, strength=0.32, distance=0.0012)
    return m


def build_tee():
    sc = lib.reset()
    T = 0.008
    outline = tee_outline()
    tee = prism('tee', outline, -T / 2, T / 2)
    # cut the front neck scoop down to reveal the inside of the back panel
    scoop = front_neck()
    cut_outline = scoop + [(0.095, 0.40), (-0.095, 0.40)]
    cutter = prism('cut', cut_outline[:-1] if cut_outline[0] == cut_outline[-1] else cut_outline, 0.0008, 0.02)
    mod = tee.modifiers.new('cut', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.object = cutter
    mod.solver = 'EXACT'
    lib.apply_modifiers(tee)
    bpy.data.objects.remove(cutter)
    rm = tee.modifiers.new('remesh', 'REMESH')
    rm.mode = 'VOXEL'
    rm.voxel_size = 0.0022
    sm = tee.modifiers.new('smooth', 'SMOOTH')
    sm.factor = 0.6
    sm.iterations = 6
    lib.apply_modifiers(tee)

    # materials: top surface is printable, the rest is body
    m_print = fabric_material('print', (0.86, 0.86, 0.85))
    m_body = fabric_material('body', (0.86, 0.86, 0.85))
    me = tee.data
    me.materials.clear()
    me.materials.append(m_print)
    me.materials.append(m_body)
    W, y0, H = 0.56, -0.37, 0.76
    uvl = me.uv_layers.new(name='PrintUV')
    for poly in me.polygons:
        c = poly.center
        top = poly.normal.z > 0.35 and c.z > T / 2 - 0.0016
        poly.material_index = 0 if top else 1
    for loop in me.loops:
        co = me.vertices[loop.vertex_index].co
        uvl.data[loop.index].uv = ((co.x + W / 2) / W, (co.y - y0) / H)
    for v in me.vertices:
        v.co.z += tee_wrinkles(v.co.x, v.co.y)
    lib.smooth(tee)

    # rib collar (front scoop + back neck), sitting on the cut edges
    def rib(name, pts, z, r=0.0052, flat=0.55):
        curve = bpy.data.curves.new(name, 'CURVE')
        curve.dimensions = '3D'
        sp = curve.splines.new('POLY')
        sp.points.add(len(pts) - 1)
        for i, (x, y) in enumerate(pts):
            sp.points[i].co = (x, y, z + tee_wrinkles(x, y), 1)
        curve.bevel_depth = r
        curve.bevel_resolution = 6
        curve.use_fill_caps = True
        obj = lib.link(bpy.data.objects.new(name, curve))
        obj.scale.z = 1.0
        bpy.context.view_layer.objects.active = obj
        for o in bpy.context.view_layer.objects:
            o.select_set(o == obj)
        bpy.ops.object.convert(target='MESH')
        obj = bpy.context.view_layer.objects.active
        for v in obj.data.vertices:
            v.co.z = z + tee_wrinkles(v.co.x, v.co.y) + (v.co.z - z - tee_wrinkles(v.co.x, v.co.y)) * flat
        lib.smooth(obj)
        return obj
    rib_m = principled('body_rib', color=(0.86, 0.86, 0.85), rough=0.93, sheen=0.35, spec=0.35)
    co = lib.tex_coord(rib_m)
    wave = node(rib_m, 'ShaderNodeTexWave', _wave_type='RINGS', Scale=900.0, Distortion=0.3)
    mp = node(rib_m, 'ShaderNodeMapping')
    mp.inputs['Location'].default_value = (0, -0.37, 0)
    connect(rib_m, co, mp.inputs['Vector'])
    # radial ribs around the neck centre
    sepx = node(rib_m, 'ShaderNodeSeparateXYZ')
    connect(rib_m, co, sepx.inputs['Vector'])
    sub = node(rib_m, 'ShaderNodeMath', _operation='SUBTRACT')
    sub.inputs[1].default_value = 0.37
    connect(rib_m, sepx.outputs['Y'], sub.inputs[0])
    at = node(rib_m, 'ShaderNodeMath', _operation='ARCTAN2')
    connect(rib_m, sub.outputs['Value'], at.inputs[0])
    connect(rib_m, sepx.outputs['X'], at.inputs[1])
    sn = node(rib_m, 'ShaderNodeMath', _operation='SINE')
    mul = node(rib_m, 'ShaderNodeMath', _operation='MULTIPLY')
    mul.inputs[1].default_value = 260.0
    connect(rib_m, at.outputs['Value'], mul.inputs[0])
    connect(rib_m, mul.outputs['Value'], sn.inputs[0])
    lib.add_bump(rib_m, sn.outputs['Value'], strength=0.35, distance=0.0008)
    front_rib = rib('rib_front', front_neck(), T / 2 - 0.0012, r=0.0058)
    back_pts = bezier((-0.095, 0.372), (0.0, 0.340), (0.095, 0.372), 24) + [(0.095, 0.372)]
    back_rib = rib('rib_back', back_pts, 0.0012, r=0.0048)
    for o in (front_rib, back_rib):
        lib.assign(o, rib_m)

    # woven neck label inside the back
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=1)
    label = lib.mesh_object('label', bm)
    label.scale = (0.012, 0.007, 1)
    label.location = (0, 0.335, 0.0012 + tee_wrinkles(0, 0.335) + 0.0006)
    lab_m = principled('label', color=(0.82, 0.8, 0.76), rough=0.45, sheen=0.4)
    lib.assign(label, lab_m)

    backdrop_paper(color=(0.50, 0.485, 0.46)).location.z = -T / 2 - 0.0003
    lib.world_color((1.0, 0.985, 0.96), 0.08)
    lib.area_light((-1.5, 0.7, 1.05), (0, 0, 0), 34, 1.0, color=(1.0, 0.97, 0.93))
    lib.area_light((1.3, -0.9, 1.6), (0, 0, 0), 6, 2.0, color=(0.93, 0.95, 1.0))
    lib.camera((0, 0.012, 2.25), (0, 0.012, 0), lens=72)
    return dict(
        tintable=True,
        print_aspect=W / H,
        default={'u': 0.5, 'v': (0.13 - y0) / H, 'w': 0.5},
        extra={'presets': {
            'center': {'u': 0.5, 'v': (0.13 - y0) / H, 'w': 0.5},
            'chest': {'u': (0.105 + W / 2) / W, 'v': (0.24 - y0) / H, 'w': 0.17},
            'big': {'u': 0.5, 'v': (0.02 - y0) / H, 'w': 0.72},
        }},
    )


# ------------------------------------------------------------ generics ---
def lathe(name, profile, steps=160):
    """Revolve an (r, z) profile around Z."""
    bm = bmesh.new()
    verts = [bm.verts.new((r, 0, z)) for r, z in profile]
    edges = [bm.edges.new((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1), angle=2 * math.pi, steps=steps, use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = lib.mesh_object(name, bm)
    lib.smooth(obj)
    return obj


def tube_curve(name, pts, radius, flatten=1.0, res=8):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    sp = curve.splines.new('BEZIER')
    sp.bezier_points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        bp = sp.bezier_points[i]
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    curve.bevel_depth = radius
    curve.bevel_resolution = res
    curve.use_fill_caps = True
    obj = lib.link(bpy.data.objects.new(name, curve))
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.view_layer.objects:
        o.select_set(o == obj)
    bpy.ops.object.convert(target='MESH')
    obj = bpy.context.view_layer.objects.active
    lib.smooth(obj)
    return obj


def cylindrical_print_uv(obj, z0, z1, r_min, angle_center=-math.pi / 2, axis='Z'):
    """Faces on the outer wall between z0..z1 become 'print'; u wraps around, v goes up."""
    me = obj.data
    uvl = me.uv_layers.new(name='PrintUV')
    for poly in me.polygons:
        c = poly.center
        r = math.hypot(c.x, c.y)
        if poly.material_index == 1 and z0 <= c.z <= z1 and r >= r_min and abs(poly.normal.z) < 0.5:
            poly.material_index = 0
    for poly in me.polygons:
        us = []
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            a = math.atan2(co.y, co.x) - angle_center
            u = ((a / (2 * math.pi)) + 0.5) % 1.0
            us.append(u)
        # keep a face from straddling the wrap seam (behind the product, never seen)
        if max(us) - min(us) > 0.5:
            us = [u if u > 0.5 else u + 1 for u in us]
        for li, u in zip(poly.loop_indices, us):
            co = me.vertices[me.loops[li].vertex_index].co
            uvl.data[li].uv = (u, (co.z - z0) / (z1 - z0))


def two_slots(obj, m_print, m_body):
    me = obj.data
    me.materials.clear()
    me.materials.append(m_print)
    me.materials.append(m_body)
    for p in me.polygons:
        p.material_index = 1


def product_lights(key=(-0.55, -0.45, 0.55), target=(0, 0, 0.05), key_e=7.0, key_size=0.55,
                   strip=True, rim_e=2.2, world=0.09):
    lib.world_color((1.0, 0.985, 0.965), world)
    lib.area_light(key, target, key_e, key_size, color=(1.0, 0.972, 0.94))
    if strip:  # tall softbox: the long specular highlight product photos have
        lib.area_light((-0.32, -0.38, 0.14), target, key_e * 0.45, 0.05, size_y=0.45, color=(1, 1, 1))
    lib.area_light((0.45, 0.55, 0.40), target, rim_e, 0.5, color=(0.92, 0.95, 1.0))
    lib.area_light((0.55, -0.35, 0.15), target, key_e * 0.18, 0.6, color=(0.95, 0.96, 1.0))


# ------------------------------------------------------------------- mug ---
def build_mug():
    lib.reset()
    R, H = 0.041, 0.096
    prof = [(0, 0.0045), (0.033, 0.0045), (0.0345, 0.0008), (0.0365, 0.0), (0.0395, 0.0009), (0.0408, 0.0035),
            (R, 0.008)]
    prof += [(R, 0.008 + (H - 0.016) * i / 24) for i in range(1, 25)]
    prof += [(R - 0.0003, H - 0.004), (R - 0.0012, H - 0.0006), (R - 0.0025, H), (R - 0.0037, H - 0.0007),
             (R - 0.0042, H - 0.004), (R - 0.0042, 0.016), (R - 0.006, 0.0115), (R - 0.012, 0.0095), (0, 0.0095)]
    mug = lathe('mug', prof, steps=192)
    glaze = principled('body', color=(0.88, 0.875, 0.86), rough=0.07, spec=0.5)
    glaze_p = principled('print', color=(0.88, 0.875, 0.86), rough=0.07, spec=0.5)
    two_slots(mug, glaze_p, glaze)
    cylindrical_print_uv(mug, 0.014, 0.086, R - 0.0005)
    handle = tube_curve('handle', [(R - 0.003, 0, 0.079), (0.066, 0, 0.081), (0.075, 0, 0.056), (0.068, 0, 0.030),
                                    (R - 0.003, 0, 0.022)], 0.0062)
    handle.scale.y = 0.72
    lib.assign(handle, glaze)
    sweep(color=(0.74, 0.72, 0.69), radius=0.35, depth=1.5, height=1.2, width=3)
    product_lights(target=(0, 0, 0.045), key_e=3.6, rim_e=1.4, world=0.06)
    lib.camera((-0.12, -0.47, 0.16), (0.008, 0, 0.046), lens=85)
    circ = 2 * math.pi * R
    return dict(tintable=True, print_aspect=circ / 0.072,
                default={'u': 0.46, 'v': 0.5, 'w': 0.27},
                extra={'presets': {'center': {'u': 0.46, 'v': 0.5, 'w': 0.27}, 'big': {'u': 0.46, 'v': 0.5, 'w': 0.4}}})


# --------------------------------------------------------------- tumbler ---
def build_tumbler():
    lib.reset()
    R, H = 0.036, 0.205
    prof = [(0, 0.0), (R - 0.004, 0.0), (R - 0.001, 0.0012), (R, 0.005)]
    prof += [(R, 0.005 + (H - 0.045) * i / 30) for i in range(1, 31)]
    prof += [(R - 0.001, H - 0.035), (R - 0.006, H - 0.024), (0.026, H - 0.017), (0.025, H - 0.012), (0, H - 0.012)]
    body = lathe('tumbler', prof, steps=192)
    coat = principled('body', color=(0.85, 0.85, 0.84), rough=0.42, spec=0.45)
    coat_p = principled('print', color=(0.85, 0.85, 0.84), rough=0.42, spec=0.45)
    two_slots(body, coat_p, coat)
    cylindrical_print_uv(body, 0.03, 0.15, R - 0.0005)
    steel = principled('steel', color=(0.82, 0.82, 0.83), rough=0.18, metallic=1.0)
    ring = lathe('ring', [(0, H - 0.0125), (0.0255, H - 0.0125), (0.026, H - 0.004), (0.0255, H), (0, H)], steps=128)
    lib.assign(ring, steel)
    lid_m = principled('lid', color=(0.03, 0.03, 0.03), rough=0.5)
    lid = lathe('lid', [(0, H - 0.001), (0.0245, H - 0.001), (0.0245, H + 0.022), (0.023, H + 0.026), (0, H + 0.026)], steps=128)
    lib.assign(lid, lid_m)
    loop = tube_curve('loop', [(-0.016, 0, H + 0.024), (-0.012, 0, H + 0.040), (0.012, 0, H + 0.040), (0.016, 0, H + 0.024)], 0.0035)
    lib.assign(loop, lid_m)
    sweep(color=(0.74, 0.72, 0.69), radius=0.4, depth=1.5, height=1.2, width=3)
    product_lights(key=(-0.6, -0.55, 0.7), target=(0, 0, 0.1), key_e=5.5, rim_e=1.6, world=0.06)
    lib.camera((-0.07, -0.80, 0.24), (0.0, 0, 0.118), lens=85)
    circ = 2 * math.pi * R
    return dict(tintable=True, print_aspect=circ / 0.12,
                default={'u': 0.486, 'v': 0.55, 'w': 0.3},
                extra={'presets': {'center': {'u': 0.486, 'v': 0.55, 'w': 0.3}, 'big': {'u': 0.486, 'v': 0.5, 'w': 0.42}}})


# -------------------------------------------------------------- notebook ---
def rounded_rect(w, h, r, n=8):
    pts = []
    for cx, cy, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def bevelled_slab(name, w, h, t, r=0.004, bevel=0.0008):
    obj = prism(name, rounded_rect(w, h, r), -t / 2, t / 2)
    bv = obj.modifiers.new('bevel', 'BEVEL')
    bv.width = bevel
    bv.segments = 3
    bv.limit_method = 'ANGLE'
    lib.apply_modifiers(obj)
    lib.smooth(obj)
    return obj


def planar_print(obj, x0, x1, y0, y1, top_z):
    """Faces facing up near top_z inside the rectangle become 'print' with planar UVs."""
    me = obj.data
    uvl = me.uv_layers.new(name='PrintUV')
    for poly in me.polygons:
        c = poly.center
        if poly.normal.z > 0.9 and abs(c.z - top_z) < 0.0004 and x0 <= c.x <= x1 and y0 <= c.y <= y1:
            poly.material_index = 0
    for loop in me.loops:
        co = me.vertices[loop.vertex_index].co
        uvl.data[loop.index].uv = ((co.x - x0) / (x1 - x0), (co.y - y0) / (y1 - y0))


def leather(name, color):
    m = principled(name, color=color, rough=0.55, spec=0.4, sheen=0.15)
    co = lib.tex_coord(m)
    vor = node(m, 'ShaderNodeTexVoronoi', Scale=900.0, _feature='SMOOTH_F1')
    connect(m, co, vor.inputs['Vector'])
    n = lib.noise(m, co, 220.0, detail=3)
    h = sum_sockets(m, [vor.outputs['Distance'], n.outputs['Fac']], [0.7, 0.3])
    lib.add_bump(m, h, strength=0.25, distance=0.0004)
    return m


def build_notebook():
    lib.reset()
    W, Hh, T = 0.148, 0.21, 0.017
    ct = 0.0022
    body_m = leather('body', (0.86, 0.85, 0.83))
    print_m = leather('print', (0.86, 0.85, 0.83))
    front = bevelled_slab('cover_front', W + 0.004, Hh + 0.006, ct, r=0.005)
    front.location.z = T - ct / 2
    two_slots(front, print_m, body_m)
    lib.apply_modifiers(front)
    me = front.data
    for v in me.vertices:
        v.co.z += front.location.z
    front.location.z = 0
    planar_print(front, -W / 2, W / 2 - 0.022, -Hh / 2, Hh / 2, T)
    back = bevelled_slab('cover_back', W + 0.004, Hh + 0.006, ct, r=0.005)
    back.location.z = ct / 2
    lib.assign(back, body_m)
    spine = prism('spine', rounded_rect(0.006, Hh + 0.006, 0.0025), 0.0, T)
    spine.location.x = -W / 2 - 0.0005
    lib.assign(spine, body_m)
    # page block with fine page lines
    pages = prism('pages', rounded_rect(W - 0.004, Hh - 0.002, 0.004), ct, T - ct)
    pm = principled('pages', color=(0.93, 0.91, 0.86), rough=0.85)
    co = lib.tex_coord(pm)
    wave = node(pm, 'ShaderNodeTexWave', _wave_type='BANDS', _bands_direction='Z', Scale=1400.0, Distortion=0.5)
    connect(pm, co, wave.inputs['Vector'])
    lib.add_bump(pm, wave.outputs['Fac'], strength=0.2, distance=0.0002)
    lib.assign(pages, pm)
    # elastic band and ribbon
    band_m = principled('band', color=(0.025, 0.025, 0.025), rough=0.6, sheen=0.5)
    band = prism('band', rounded_rect(0.0075, Hh + 0.0075, 0.002), -0.0006, T + 0.0011)
    band.location.x = W / 2 - 0.016
    lib.assign(band, band_m)
    rib_m = principled('ribbon', color=(0.55, 0.06, 0.08), rough=0.4, sheen=0.6)
    ribbon = prism('ribbon', [(-0.003, 0.0), (0.003, 0.0), (0.004, -0.045), (0.0, -0.040), (-0.004, -0.045)], 0.0004, 0.0008)
    ribbon.location = (-0.03, -Hh / 2 + 0.002, 0.0)
    ribbon.rotation_euler.z = 0.15
    lib.assign(ribbon, rib_m)
    nb = [front, back, spine, pages, band, ribbon]
    for o in nb:
        o.rotation_euler.z += -0.22
        o.location.rotate(__import__('mathutils').Euler((0, 0, -0.22)))
    backdrop_paper(color=(0.70, 0.68, 0.645))
    product_lights(key=(-0.55, 0.35, 0.6), target=(0, 0, 0), key_e=6, strip=False, rim_e=0.8, world=0.08)
    lib.camera((0.0, -0.20, 0.42), (0.0, -0.005, 0.0), lens=70)
    return dict(tintable=True, print_aspect=(W - 0.022) / Hh,
                default={'u': 0.5, 'v': 0.56, 'w': 0.55},
                extra={'presets': {'center': {'u': 0.5, 'v': 0.56, 'w': 0.55}, 'corner': {'u': 0.75, 'v': 0.12, 'w': 0.3}}})


# ------------------------------------------------------------------- pen ---
def build_pen():
    lib.reset()
    L, R = 0.098, 0.0056
    # barrel along X
    prof = [(0, 0), (R * 0.9, 0)] + [(R, 0.002 + (L - 0.004) * i / 30) for i in range(31)] + [(R * 0.9, L), (0, L)]
    barrel = lathe('barrel', prof, steps=96)
    paint = principled('body', color=(0.85, 0.85, 0.85), rough=0.25, coat=1.0, coat_rough=0.04, spec=0.5)
    paint_p = principled('print', color=(0.85, 0.85, 0.85), rough=0.25, coat=1.0, coat_rough=0.04, spec=0.5)
    two_slots(barrel, paint_p, paint)
    me = barrel.data
    uvl = me.uv_layers.new(name='PrintUV')
    z0, z1 = 0.022, 0.082
    for poly in me.polygons:
        c = poly.center
        if z0 <= c.z <= z1 and math.hypot(c.x, c.y) > R * 0.98:
            poly.material_index = 0
    for loop in me.loops:
        co = me.vertices[loop.vertex_index].co
        a = math.atan2(co.y, co.x)
        # v around the barrel, centred on the side that faces up after rotation
        # v runs around the barrel so text reads upright on the side facing the camera
        uvl.data[loop.index].uv = ((co.z - z0) / (z1 - z0), 1.0 - (((a - math.pi / 2) / (2 * math.pi) + 0.5) % 1.0))
    chrome = principled('chrome', color=(0.9, 0.9, 0.92), rough=0.08, metallic=1.0)
    grip = lathe('grip', [(0, 0), (R * 0.98, 0), (R * 0.95, 0.022), (0.0045, 0.03), (0, 0.03)], steps=96)
    grip.location.z = -0.028
    grip_m = principled('grip', color=(0.03, 0.03, 0.03), rough=0.7)
    lib.assign(grip, grip_m)
    tip = lathe('tip', [(0, 0), (0.0045, 0), (0.0012, -0.016), (0.0006, -0.019), (0, -0.0195)], steps=96)
    tip.location.z = -0.028
    lib.assign(tip, chrome)
    cap = lathe('cap', [(0, 0), (R * 1.02, 0), (R * 1.02, 0.008), (R * 0.7, 0.0115), (0, 0.012)], steps=96)
    cap.location.z = L
    lib.assign(cap, chrome)
    clip = tube_curve('clip', [(0, R + 0.0016, L + 0.006), (0, R + 0.0028, L - 0.01), (0, R + 0.0026, L - 0.045), (0, R + 0.0012, L - 0.05)], 0.0013, res=4)
    clip.scale.x = 2.2
    lib.assign(clip, chrome)
    parts = [barrel, grip, tip, cap, clip]
    from mathutils import Euler, Matrix
    rot = Euler((0, math.pi / 2, 0.42)).to_matrix().to_4x4()
    for o in parts:
        o.matrix_world = Matrix.Translation((-0.035, -0.012, R + 0.0002)) @ rot @ o.matrix_world
    backdrop_paper(color=(0.70, 0.68, 0.645))
    product_lights(key=(-0.35, 0.3, 0.45), target=(0, 0, 0), key_e=2.6, strip=False, rim_e=0.5, world=0.07)
    lib.area_light((0.0, -0.05, 0.35), (0, 0, 0), 0.7, 0.04, size_y=0.5, color=(1, 1, 1))
    lib.camera((0.0, -0.16, 0.31), (-0.004, 0.0, 0.0), lens=82)
    return dict(tintable=True, print_aspect=(z1 - z0) / (2 * math.pi * R),
                default={'u': 0.5, 'v': 0.25, 'w': 0.6},
                extra={'presets': {'center': {'u': 0.5, 'v': 0.25, 'w': 0.6}}})


# ----------------------------------------------------------------- cards ---
def build_cards():
    lib.reset()
    W, H, T = 0.09, 0.05, 0.0006
    m = principled('body', color=(0.88, 0.87, 0.85), rough=0.75, spec=0.3)
    mp = principled('print', color=(0.88, 0.87, 0.85), rough=0.75, spec=0.3)
    for mat in (m, mp):
        co = lib.tex_coord(mat)
        n = lib.noise(mat, co, 2400.0, detail=3)
        lib.add_bump(mat, n.outputs['Fac'], strength=0.12, distance=0.0002)
    from mathutils import Euler, Matrix
    stack = []
    for i, (dx, dy, rz) in enumerate([(0.012, -0.018, -0.32), (0.006, -0.010, -0.18), (-0.004, 0.004, 0.06)]):
        c = bevelled_slab(f'card{i}', W, H, T, r=0.0025, bevel=0.0002)
        c.location = (dx, dy, T / 2 + i * T)
        c.rotation_euler.z = rz
        lib.assign(c, m)
        stack.append(c)
    top = stack[-1]
    two_slots(top, mp, m)
    lib.apply_modifiers(top)
    bpy.context.view_layer.objects.active = top
    for o in bpy.context.view_layer.objects:
        o.select_set(o == top)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    me = top.data
    uvl = me.uv_layers.new(name='PrintUV')
    rz = 0.06
    ca, sa = math.cos(-rz), math.sin(-rz)
    zt = 2 * T + T
    for poly in me.polygons:
        if poly.normal.z > 0.9 and poly.center.z > zt - 0.0002:
            poly.material_index = 0
    for loop in me.loops:
        co = me.vertices[loop.vertex_index].co
        x, y = co.x + 0.004, co.y - 0.004
        lx, ly = x * ca - y * sa, x * sa + y * ca
        uvl.data[loop.index].uv = (lx / W + 0.5, ly / H + 0.5)
    backdrop_paper(color=(0.62, 0.60, 0.57))
    product_lights(key=(-0.4, 0.3, 0.45), target=(0, 0, 0), key_e=2.4, strip=False, rim_e=0.5, world=0.07)
    lib.camera((0.0, -0.15, 0.21), (0.002, -0.004, 0.0), lens=70)
    return dict(tintable=True, print_aspect=W / H,
                default={'u': 0.5, 'v': 0.52, 'w': 0.62},
                extra={'presets': {'center': {'u': 0.5, 'v': 0.52, 'w': 0.62}, 'corner': {'u': 0.25, 'v': 0.75, 'w': 0.3}}})


# -------------------------------------------------------------- keychain ---
def wood(name):
    """Light birch/beech plywood face: soft growth rings with fibre noise."""
    m = principled(name, color=(0.6, 0.4, 0.22), rough=0.62, spec=0.35)
    co = lib.tex_coord(m)
    mapping = node(m, 'ShaderNodeMapping')
    mapping.inputs['Location'].default_value = (0.03, -0.25, 0.0)
    mapping.inputs['Scale'].default_value = (1.0, 0.35, 1.0)
    connect(m, co, mapping.inputs['Vector'])
    wave = node(m, 'ShaderNodeTexWave', _wave_type='RINGS', Scale=18.0, Distortion=2.2, Detail=3.0, **{'Detail Scale': 0.8})
    connect(m, mapping.outputs['Vector'], wave.inputs['Vector'])
    fib = node(m, 'ShaderNodeMapping')
    fib.inputs['Scale'].default_value = (60.0, 1.5, 60.0)
    connect(m, co, fib.inputs['Vector'])
    fn = lib.noise(m, fib.outputs['Vector'], 4.0, detail=6, rough=0.6)
    mixf = sum_sockets(m, [wave.outputs['Fac'], fn.outputs['Fac']], [0.55, 0.45])
    ramp = node(m, 'ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.25
    ramp.color_ramp.elements[0].color = (0.58, 0.40, 0.23, 1)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (0.80, 0.63, 0.43, 1)
    connect(m, mixf, ramp.inputs['Fac'])
    connect(m, ramp.outputs['Color'], m.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    lib.add_bump(m, fn.outputs['Fac'], strength=0.06, distance=0.0002)
    return m


def build_keychain():
    lib.reset()
    D, T = 0.048, 0.004
    disc = prism('disc', rounded_rect(D, D, D / 2 - 0.0001, n=24), 0, T)
    hole = prism('hole', rounded_rect(0.006, 0.006, 0.0029, n=12), -0.001, T + 0.001)
    hole.location.y = D / 2 - 0.006
    mod = disc.modifiers.new('hole', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.object = hole
    mod.solver = 'EXACT'
    bv = disc.modifiers.new('bevel', 'BEVEL')
    bv.width = 0.0004
    bv.segments = 3
    bv.limit_method = 'ANGLE'
    lib.apply_modifiers(disc)
    bpy.data.objects.remove(hole)
    lib.smooth(disc)
    wd = wood('print')
    wb = wood('body')
    two_slots(disc, wd, wb)
    planar_print(disc, -D / 2, D / 2, -D / 2, D / 2, T)
    steel = principled('steel', color=(0.85, 0.85, 0.87), rough=0.15, metallic=1.0)
    import mathutils
    ring = tube_curve('ring2', [(0.0105 * math.cos(a), D / 2 + 0.005 + 0.0105 * math.sin(a), 0.0016) for a in [i * 2 * math.pi / 10 for i in range(11)]], 0.0008, res=3)
    lib.assign(ring, steel)
    for o in (disc, ring):
        o.rotation_euler.z = -0.35
        o.location.rotate(mathutils.Euler((0, 0, -0.35)))
    backdrop_paper(color=(0.66, 0.64, 0.61))
    product_lights(key=(-0.3, 0.25, 0.35), target=(0, 0, 0), key_e=2.2, strip=False, rim_e=0.4, world=0.08)
    lib.camera((0.0, -0.075, 0.17), (0.0, 0.004, 0.0), lens=85)
    return dict(tintable=False, print_aspect=1.0,
                default={'u': 0.5, 'v': 0.45, 'w': 0.62},
                extra={'presets': {'center': {'u': 0.5, 'v': 0.45, 'w': 0.62}}})


# ------------------------------------------------------------------- tote ---
def build_tote():
    lib.reset()
    W, H, T = 0.38, 0.42, 0.006
    bag = prism('tote', rounded_rect(W, H, 0.004), -T / 2, T / 2)
    rm = bag.modifiers.new('remesh', 'REMESH')
    rm.mode = 'VOXEL'
    rm.voxel_size = 0.002
    sm = bag.modifiers.new('smooth', 'SMOOTH')
    sm.factor = 0.5
    sm.iterations = 4
    lib.apply_modifiers(bag)

    def canvas(name):
        m = principled(name, color=(0.86, 0.85, 0.82), rough=0.95, sheen=0.3, spec=0.3)
        co = lib.tex_coord(m)
        wx = node(m, 'ShaderNodeTexWave', _wave_type='BANDS', _bands_direction='X', Scale=150.0, Distortion=2.5, Detail=2.0)
        wy = node(m, 'ShaderNodeTexWave', _wave_type='BANDS', _bands_direction='Y', Scale=150.0, Distortion=2.5, Detail=2.0)
        connect(m, co, wx.inputs['Vector'])
        connect(m, co, wy.inputs['Vector'])
        n = lib.noise(m, co, 30.0, detail=4)
        hem = line_groove(m, co, (-0.2, H / 2 - 0.025), (0.2, H / 2 - 0.025), [0.0, 0.006], width=0.0013)
        h = sum_sockets(m, [wx.outputs['Fac'], wy.outputs['Fac'], n.outputs['Fac'], hem], [0.4, 0.4, 0.5, 1.0])
        weave = sum_sockets(m, [wx.outputs['Fac'], wy.outputs['Fac'], n.outputs['Fac']], [0.35, 0.35, 0.3])
        textured_albedo(m, (0.86, 0.85, 0.82), weave, amount=0.06)
        lib.add_bump(m, h, strength=0.22, distance=0.0012)
        return m
    mp, mb = canvas('print'), canvas('body')
    two_slots(bag, mp, mb)
    me = bag.data
    uvl = me.uv_layers.new(name='PrintUV')
    for poly in me.polygons:
        if poly.normal.z > 0.35 and poly.center.z > T / 2 - 0.0015:
            poly.material_index = 0
    for loop in me.loops:
        co = me.vertices[loop.vertex_index].co
        uvl.data[loop.index].uv = (co.x / W + 0.5, co.y / H + 0.5)

    def tote_z(x, y):
        p = Vector((x, y))
        z = 0.0012 * (1 + math.sin(8 * x + 5 * y) * math.sin(6 * y - 4 * x + 0.7))
        for a, b, w, h in [((-0.17, 0.2), (-0.05, 0.05), 0.012, 0.0022), ((0.17, 0.18), (0.08, 0.02), 0.012, 0.002),
                           ((-0.12, -0.18), (0.10, -0.12), 0.016, 0.0016), ((0.15, -0.2), (0.17, 0.0), 0.01, 0.0014)]:
            z += _crease(p, a, b, w, h)
        return z
    for v in me.vertices:
        v.co.z += tote_z(v.co.x, v.co.y)
    lib.smooth(bag)
    # two webbing handles lying above the bag (front and back strap, slightly offset)
    for k, (dx, lift) in enumerate(((0.0, 0.0), (0.018, 0.0045))):
        z = T / 2 + 0.002 + lift
        pts = [(-0.075 + dx, H / 2 - 0.035, z), (-0.088 + dx, H / 2 + 0.09, z), (0.0 + dx, H / 2 + 0.19 - k * 0.01, z),
               (0.088 + dx, H / 2 + 0.09, z), (0.075 + dx, H / 2 - 0.035, z)]
        strap = tube_curve(f'strap{k}', pts, 0.0125, res=4)
        for v in strap.data.vertices:
            v.co.z = z + (v.co.z - z) * 0.09
        lib.assign(strap, mb)
    backdrop_paper(color=(0.50, 0.485, 0.46)).location.z = -T / 2 - 0.0003
    lib.world_color((1.0, 0.985, 0.96), 0.08)
    lib.area_light((-1.5, 0.7, 1.05), (0, 0, 0), 30, 1.0, color=(1.0, 0.97, 0.93))
    lib.area_light((1.3, -0.9, 1.6), (0, 0, 0), 5, 2.0, color=(0.93, 0.95, 1.0))
    lib.camera((0, 0.075, 1.5), (0, 0.075, 0), lens=72)
    return dict(tintable=True, print_aspect=W / H,
                default={'u': 0.5, 'v': 0.5, 'w': 0.55},
                extra={'presets': {'center': {'u': 0.5, 'v': 0.5, 'w': 0.55}, 'big': {'u': 0.5, 'v': 0.47, 'w': 0.78}}})


# ------------------------------------------------------------------- flag ---
def build_flag():
    lib.reset()
    FW, FH = 0.30, 0.20
    top = 0.44
    # cloth: a fine grid that waves away from the pole
    bm = bmesh.new()
    NX, NY = 90, 60
    grid = []
    for j in range(NY + 1):
        row = []
        for i in range(NX + 1):
            u, v = i / NX, j / NY
            x = u * FW
            wave = 0.03 * u ** 1.1 * math.sin(u * 2.4 * math.pi - 0.4 + v * 0.6) + 0.007 * u * math.sin(u * 6 * math.pi + v * 2.0)
            droop = -0.012 * u ** 2 * (1 - v)
            row.append(bm.verts.new((x, wave, top - FH + v * FH + droop)))
        grid.append(row)
    for j in range(NY):
        for i in range(NX):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    cloth = lib.mesh_object('cloth', bm)
    sol = cloth.modifiers.new('sol', 'SOLIDIFY')
    sol.thickness = 0.0012
    lib.apply_modifiers(cloth)
    lib.smooth(cloth)
    satin = lambda n: principled(n, color=(0.86, 0.86, 0.85), rough=0.42, sheen=0.6, sheen_rough=0.3, spec=0.45)
    mp, mb = satin('print'), satin('body')
    two_slots(cloth, mp, mb)
    me = cloth.data
    uvl = me.uv_layers.new(name='PrintUV')
    for poly in me.polygons:
        if poly.normal.y < -0.2:   # the face towards the camera
            poly.material_index = 0
    for loop in me.loops:
        co = me.vertices[loop.vertex_index].co
        uvl.data[loop.index].uv = (co.x / FW, (co.z - (top - FH)) / FH)
    chrome = principled('chrome', color=(0.9, 0.9, 0.92), rough=0.1, metallic=1.0)
    pole = lathe('pole', [(0, 0.0), (0.0035, 0.0), (0.0035, top + 0.012), (0, top + 0.012)], steps=48)
    pole.location.x = -0.004
    lib.assign(pole, chrome)
    finial = lathe('finial', [(0, 0), (0.006, 0.002), (0.007, 0.008), (0.004, 0.016), (0, 0.02)], steps=48)
    finial.location = (-0.004, 0, top + 0.012)
    lib.assign(finial, chrome)
    base = lathe('base', [(0, 0), (0.045, 0), (0.047, 0.003), (0.046, 0.009), (0.040, 0.012), (0.008, 0.016), (0, 0.016)], steps=96)
    base.location.x = -0.004
    lib.assign(base, chrome)
    for o in (cloth, pole, finial, base):
        o.location.x -= 0.11
    sweep(color=(0.74, 0.72, 0.69), radius=0.4, depth=1.5, height=1.4, width=3)
    product_lights(key=(-0.7, -0.6, 0.8), target=(0, 0, 0.3), key_e=3.4, rim_e=1.2, world=0.05)
    lib.camera((0.10, -1.40, 0.42), (-0.01, 0, 0.235), lens=85)
    return dict(tintable=True, print_aspect=FW / FH,
                default={'u': 0.5, 'v': 0.5, 'w': 0.6},
                extra={'presets': {'center': {'u': 0.5, 'v': 0.5, 'w': 0.6}, 'big': {'u': 0.5, 'v': 0.5, 'w': 0.88}}})


SCENES = {
    'tee': build_tee,
    'tote': build_tote,
    'mug': build_mug,
    'tumbler': build_tumbler,
    'notebook': build_notebook,
    'pen': build_pen,
    'cards': build_cards,
    'keychain': build_keychain,
    'flag': build_flag,
}
