"""Headwear and garment accessories: cap (rebuilt), zipper, woven label, hang tag,
leather patch, apron and mouse pad.
"""
import math

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

import lib
from lib import connect, node, principled
from products import (backdrop_paper, bevelled_slab, knit_height, line_groove, planar_print, product_lights, prism,
                      rounded_rect, sum_sockets, sweep, textured_albedo, tube_curve, two_slots, leather, _crease, bezier)
from garments import solid, lift, rib_material, button, button_material, mirror, slots

WHITE = (0.86, 0.86, 0.85)


# ===================================================================== cap ===
CAP_R = (0.094, 0.104)   # crown footprint half-axes (x, y); front is -y
SEAMS = [-math.pi / 2 + k * math.pi / 3 for k in range(6)]


def cap_twill(name, color=WHITE):
    """Cotton twill with panel seams and twin topstitching computed from the angle around the crown."""
    m = principled(name, color=color, rough=0.9, sheen=0.35, sheen_rough=0.6, spec=0.35)
    co = lib.tex_coord(m)
    rot = node(m, 'ShaderNodeMapping')
    rot.inputs['Rotation'].default_value = (0.0, 0.0, 0.785)
    connect(m, co, rot.inputs['Vector'])
    tw = node(m, 'ShaderNodeTexWave', _wave_type='BANDS', _bands_direction='X', Scale=150.0, Distortion=1.2, Detail=2.0)
    connect(m, rot.outputs['Vector'], tw.inputs['Vector'])
    slub = lib.noise(m, co, 300.0, detail=2, rough=0.5)
    tex = sum_sockets(m, [tw.outputs['Fac'], slub.outputs['Fac']], [0.75, 0.25])
    textured_albedo(m, color, tw.outputs['Fac'], amount=0.035)
    lib.add_bump(m, tex, strength=0.16, distance=0.0008)
    return m


def stitch_rows(m, value_socket, rows, width=0.0035, dash=None):
    """Thin dark grooves where `value_socket` equals any of `rows` (a stitch line)."""
    total = None
    for r in rows:
        sub = node(m, 'ShaderNodeMath', _operation='SUBTRACT')
        sub.inputs[1].default_value = r
        connect(m, value_socket, sub.inputs[0])
        ab = node(m, 'ShaderNodeMath', _operation='ABSOLUTE')
        connect(m, sub.outputs['Value'], ab.inputs[0])
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


def add_bump_extra(m, height, strength):
    """Stack an extra bump on top of the material's existing normal chain."""
    p = m.node_tree.nodes['Principled BSDF']
    prev = p.inputs['Normal'].links[0].from_socket if p.inputs['Normal'].links else None
    b = node(m, 'ShaderNodeBump', Strength=strength, Distance=0.0006)
    connect(m, height, b.inputs['Height'])
    if prev is not None:
        connect(m, prev, b.inputs['Normal'])
    connect(m, b.outputs['Normal'], p.inputs['Normal'])


def crown_point(phi, theta):
    """phi: angle around (front = -pi/2); theta: 0 at the band, pi/2 at the button."""
    front = max(0.0, -math.sin(phi))
    back = max(0.0, math.sin(phi))
    h = 0.106 + 0.014 * front - 0.012 * back              # structured front stands taller
    p = 2.35 + 0.55 * front - 0.35 * back                  # a bit squarer at the structured front
    c, s = math.cos(theta), math.sin(theta)
    rr = abs(c) ** (2 / p)
    zz = abs(s) ** (2 / p)
    hm = 0.104
    w = s ** 4
    hh = h * (1 - w) + hm * w                              # meet at one apex
    # panels puff a little between seams, seams pull in
    d = min(abs(((phi - sk + math.pi) % (2 * math.pi)) - math.pi) for sk in SEAMS)
    puff = 1.0 + 0.018 * math.sin(min(d, math.pi / 6) * 3) * math.sin(theta * 2) ** 0.5 - 0.012 * math.exp(-(d / 0.035) ** 2)
    x = CAP_R[0] * rr * math.cos(phi) * puff
    y = CAP_R[1] * rr * math.sin(phi) * puff
    return Vector((x, y, hh * zz))


def build_cap_mesh(NA=192, NT=64):
    bm = bmesh.new()
    rows = []
    for j in range(NT + 1):
        th = (j / NT) * (math.pi / 2) * 0.999
        row = [bm.verts.new(crown_point(-math.pi + 2 * math.pi * i / NA, th)) for i in range(NA)]
        rows.append(row)
    top = bm.verts.new((0, 0, 0.104))
    for j in range(NT):
        for i in range(NA):
            a, b = rows[j][i], rows[j][(i + 1) % NA]
            c, d = rows[j + 1][(i + 1) % NA], rows[j + 1][i]
            bm.faces.new((a, b, c, d))
    for i in range(NA):
        bm.faces.new((rows[NT][i], rows[NT][(i + 1) % NA], top))
    obj = lib.mesh_object('crown', bm)
    sol = obj.modifiers.new('sol', 'SOLIDIFY')
    sol.thickness = 0.0022
    sol.offset = -1
    lib.apply_modifiers(obj)
    lib.smooth(obj)
    return obj


def build_brim(NS=64, NR=20):
    bm = bmesh.new()
    rows = []
    span = 1.06
    for i in range(NS + 1):
        s = -1 + 2 * i / NS
        phi = -math.pi / 2 + s * span
        base = crown_point(phi, 0.0)
        nrm = Vector((math.cos(phi) / CAP_R[0], math.sin(phi) / CAP_R[1], 0)).normalized()
        depth = 0.072 * (1 - abs(s) ** 2.4) ** 0.6
        row = []
        for j in range(NR + 1):
            t = j / NR
            p = base + nrm * (depth * t - 0.004)
            # pre-curved bill: sides bend down, the whole brim tilts slightly down
            p.z = 0.002 - 0.046 * (s * s) * (0.2 + 0.8 * t) - 0.012 * t * t
            row.append(bm.verts.new(p))
        rows.append(row)
    for i in range(NS):
        for j in range(NR):
            bm.faces.new((rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]))
    obj = lib.mesh_object('brim', bm)
    me = obj.data
    uvl = me.uv_layers.new(name='BrimUV')
    for poly in me.polygons:
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            i, j = divmod(vi, NR + 1)
            uvl.data[li].uv = (i / NS, j / NR)
    sol = obj.modifiers.new('sol', 'SOLIDIFY')
    sol.thickness = 0.0042
    sol.offset = 0
    sub = obj.modifiers.new('sub', 'SUBSURF')
    sub.levels = 2
    lib.apply_modifiers(obj)
    lib.smooth(obj)
    return obj


def build_cap():
    lib.reset()
    crown = build_cap_mesh()
    m_print = cap_twill('print')
    m_body = cap_twill('body')
    # seam grooves + twin topstitching, from the angle around the crown
    for m in (m_print, m_body):
        co = lib.tex_coord(m)
        sep = node(m, 'ShaderNodeSeparateXYZ')
        connect(m, co, sep.inputs['Vector'])
        at = node(m, 'ShaderNodeMath', _operation='ARCTAN2')
        connect(m, sep.outputs['Y'], at.inputs[0])
        connect(m, sep.outputs['X'], at.inputs[1])
        # distance (radians) to the nearest of six seams: fold the angle into one 60 degree sector
        off = node(m, 'ShaderNodeMath', _operation='ADD')
        off.inputs[1].default_value = math.pi / 2 + math.pi / 6
        connect(m, at.outputs['Value'], off.inputs[0])
        mod = node(m, 'ShaderNodeMath', _operation='FLOORED_MODULO')
        mod.inputs[1].default_value = math.pi / 3
        connect(m, off.outputs['Value'], mod.inputs[0])
        cen = node(m, 'ShaderNodeMath', _operation='SUBTRACT')
        cen.inputs[1].default_value = math.pi / 6
        connect(m, mod.outputs['Value'], cen.inputs[0])
        ab = node(m, 'ShaderNodeMath', _operation='ABSOLUTE')
        connect(m, cen.outputs['Value'], ab.inputs[0])
        st = stitch_rows(m, ab.outputs['Value'], [0.0, 0.055, 0.075], width=0.006)
        add_bump_extra(m, st, 0.6)
    slots(crown, [m_print, m_body])
    me = crown.data
    uvl = me.uv_layers.new(name='PrintUV')
    W, H, z0 = 0.135, 0.075, 0.012
    for poly in me.polygons:
        c = poly.center
        outer = poly.normal.dot(Vector((c.x, c.y, c.z - 0.03)).normalized()) > 0
        poly.material_index = 0 if (outer and c.y < -0.035 and abs(c.x) < 0.085 and z0 - 0.006 < c.z < z0 + H + 0.012) else 1
    for loop in me.loops:
        co = me.vertices[loop.vertex_index].co
        uvl.data[loop.index].uv = ((co.x + W / 2) / W, (co.z - z0) / H)

    brim = build_brim()
    brim_m = cap_twill('body_brim')
    co_uv = node(brim_m, 'ShaderNodeUVMap')
    co_uv.uv_map = 'BrimUV'
    sep = node(brim_m, 'ShaderNodeSeparateXYZ')
    connect(brim_m, co_uv.outputs['UV'], sep.inputs['Vector'])
    rows = stitch_rows(brim_m, sep.outputs['Y'], [0.93, 0.85, 0.77, 0.69, 0.61, 0.53, 0.45], width=0.012)
    add_bump_extra(brim_m, rows, 0.5)
    lib.assign(brim, brim_m)

    parts = [crown, brim]
    # fabric-covered top button
    bmb = bmesh.new()
    bmesh.ops.create_uvsphere(bmb, u_segments=32, v_segments=16, radius=0.0085)
    btn = lib.mesh_object('squatchee', bmb)
    btn.scale.z = 0.42
    btn.location.z = 0.104 + 0.0018
    lib.smooth(btn)
    lib.assign(btn, m_body)
    parts.append(btn)
    # embroidered eyelets on each panel
    eyelet_m = principled('eyelet', color=(0.05, 0.05, 0.05), rough=0.8)
    for k in range(6):
        phi = SEAMS[k] + math.pi / 6
        p = crown_point(phi, math.radians(52))
        n = (p - Vector((0, 0, 0.02))).normalized()
        ring_pts = []
        t1 = n.cross(Vector((0, 0, 1))).normalized()
        t2 = n.cross(t1).normalized()
        for i in range(17):
            a = i * 2 * math.pi / 16
            q = p + n * 0.0006 + (t1 * math.cos(a) + t2 * math.sin(a)) * 0.0028
            ring_pts.append(tuple(q))
        ring = tube_curve(f'eyelet{k}', ring_pts, 0.0009, res=3)
        lib.assign(ring, m_body)
        parts.append(ring)
        hole = bmesh.new()
        bmesh.ops.create_circle(hole, cap_ends=True, segments=16, radius=0.0021)
        h = lib.mesh_object(f'hole{k}', hole)
        h.matrix_world = Matrix.Translation(p + n * 0.0003) @ n.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        lib.assign(h, eyelet_m)
        parts.append(h)

    # rest the cap naturally: tilted back a little on its brim
    tilt = Euler((-0.12, 0.0, -0.58)).to_matrix().to_4x4()
    for o in parts:
        o.matrix_world = tilt @ o.matrix_world
    bpy.context.view_layer.update()
    zmin = min((o.matrix_world @ v.co).z for o in (crown, brim) for v in o.data.vertices)
    for o in parts:
        o.location.z -= zmin
    sweep(color=(0.74, 0.72, 0.69), radius=0.4, depth=1.5, height=1.2, width=3)
    product_lights(key=(-0.55, -0.5, 0.6), target=(0, 0, 0.05), key_e=2.6, rim_e=1.2, world=0.05)
    lib.camera((-0.07, -0.76, 0.35), (0.0, -0.01, 0.05), lens=85)
    return dict(tintable=True, print_aspect=W / H, spec_blur=4.0,   # fabric sheen is soft; drop denoiser blotches
                default={'u': 0.5, 'v': 0.5, 'w': 0.5},
                extra={'presets': {'center': {'u': 0.5, 'v': 0.5, 'w': 0.5}, 'big': {'u': 0.5, 'v': 0.5, 'w': 0.72}}})


# ============================================================== helpers ===
def weave_material(name, color, scale=600.0, amount=0.12, strength=0.3):
    """Tight woven cloth (labels, tapes, canvas): warp and weft bands."""
    m = principled(name, color=color, rough=0.75, sheen=0.4, sheen_rough=0.5, spec=0.4)
    co = lib.tex_coord(m)
    wx = node(m, 'ShaderNodeTexWave', _wave_type='BANDS', _bands_direction='X', Scale=scale, Distortion=0.3)
    wy = node(m, 'ShaderNodeTexWave', _wave_type='BANDS', _bands_direction='Y', Scale=scale * 1.3, Distortion=0.3)
    connect(m, co, wx.inputs['Vector'])
    connect(m, co, wy.inputs['Vector'])
    n = lib.noise(m, co, 60.0, detail=3)
    tex = sum_sockets(m, [wx.outputs['Fac'], wy.outputs['Fac'], n.outputs['Fac']], [0.4, 0.4, 0.2])
    textured_albedo(m, color, tex, amount=amount)
    lib.add_bump(m, tex, strength=strength, distance=0.0004)
    return m


def jersey_backdrop(color=(0.62, 0.62, 0.63), size=0.6):
    """A piece of knit fabric filling the frame (labels, patches sit on clothes)."""
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=size / 2)
    obj = lib.mesh_object('fabric', bm)
    m = principled('fabric', color=color, rough=0.95, sheen=0.4, spec=0.3)
    co = lib.tex_coord(m)
    k = knit_height(m, co, wale=150.0)
    textured_albedo(m, color, k, amount=0.08)
    lib.add_bump(m, k, strength=0.35, distance=0.0008)
    lib.assign(obj, m)
    return obj


def denim_backdrop(size=0.6):
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=size / 2)
    obj = lib.mesh_object('denim', bm)
    color = (0.10, 0.17, 0.30)
    m = principled('denim', color=color, rough=0.9, sheen=0.3, spec=0.3)
    co = lib.tex_coord(m)
    rot = node(m, 'ShaderNodeMapping')
    rot.inputs['Rotation'].default_value = (0, 0, 0.6)
    connect(m, co, rot.inputs['Vector'])
    tw = node(m, 'ShaderNodeTexWave', _wave_type='BANDS', _bands_direction='X', Scale=260.0, Distortion=2.0, Detail=3.0)
    connect(m, rot.outputs['Vector'], tw.inputs['Vector'])
    slub = lib.noise(m, co, 40.0, detail=5, rough=0.7)
    tex = sum_sockets(m, [tw.outputs['Fac'], slub.outputs['Fac']], [0.6, 0.4])
    mr = node(m, 'ShaderNodeMapRange', **{'From Min': 0.2, 'From Max': 0.8, 'To Min': 0.0, 'To Max': 1.0})
    connect(m, tex, mr.inputs['Value'])
    ramp = node(m, 'ShaderNodeMix', _data_type='RGBA', Factor=0.5)
    ramp.inputs['A'].default_value = (0.06, 0.10, 0.20, 1)
    ramp.inputs['B'].default_value = (0.32, 0.40, 0.52, 1)
    connect(m, mr.outputs['Result'], ramp.inputs['Factor'])
    connect(m, ramp.outputs['Result'], m.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    lib.add_bump(m, tex, strength=0.4, distance=0.0008)
    lib.assign(obj, m)
    return obj


def rect_stitch(m, x0, x1, y0, y1, inset, width=0.0005):
    """A stitched rectangle `inset` from the edges (object XY), corners closed cleanly."""
    co = lib.tex_coord(m)
    sep = node(m, 'ShaderNodeSeparateXYZ')
    connect(m, co, sep.inputs['Vector'])

    def groove(coord, at):
        sub = node(m, 'ShaderNodeMath', _operation='SUBTRACT')
        sub.inputs[1].default_value = at
        connect(m, coord, sub.inputs[0])
        ab = node(m, 'ShaderNodeMath', _operation='ABSOLUTE')
        connect(m, sub.outputs['Value'], ab.inputs[0])
        ss = node(m, 'ShaderNodeMapRange', _interpolation_type='SMOOTHSTEP', **{'From Min': 0.0, 'From Max': width, 'To Min': 1.0, 'To Max': 0.0})
        connect(m, ab.outputs['Value'], ss.inputs['Value'])
        return ss.outputs['Result']

    def within(coord, lo, hi):
        a = node(m, 'ShaderNodeMath', _operation='GREATER_THAN')
        a.inputs[1].default_value = lo - width
        connect(m, coord, a.inputs[0])
        b = node(m, 'ShaderNodeMath', _operation='LESS_THAN')
        b.inputs[1].default_value = hi + width
        connect(m, coord, b.inputs[0])
        mul = node(m, 'ShaderNodeMath', _operation='MULTIPLY')
        connect(m, a.outputs['Value'], mul.inputs[0])
        connect(m, b.outputs['Value'], mul.inputs[1])
        return mul.outputs['Value']

    X, Y = sep.outputs['X'], sep.outputs['Y']
    lines = []
    for at in (y0 + inset, y1 - inset):
        mul = node(m, 'ShaderNodeMath', _operation='MULTIPLY')
        connect(m, groove(Y, at), mul.inputs[0])
        connect(m, within(X, x0 + inset, x1 - inset), mul.inputs[1])
        lines.append(mul.outputs['Value'])
    for at in (x0 + inset, x1 - inset):
        mul = node(m, 'ShaderNodeMath', _operation='MULTIPLY')
        connect(m, groove(X, at), mul.inputs[0])
        connect(m, within(Y, y0 + inset, y1 - inset), mul.inputs[1])
        lines.append(mul.outputs['Value'])
    total = sum_sockets(m, lines, [-1, -1, -1, -1])
    return total


def top_camera(dist, look=(0, 0, 0), tilt=0.0, lens=85):
    lib.camera((look[0], look[1] - dist * math.sin(tilt), dist * math.cos(tilt)), look, lens=lens)


def soft_lights(scale, key_e, world=0.08):
    lib.world_color((1.0, 0.985, 0.96), world)
    lib.area_light((-1.4 * scale, 0.8 * scale, 1.2 * scale), (0, 0, 0), key_e, 1.2 * scale, color=(1.0, 0.97, 0.93))
    lib.area_light((1.3 * scale, -0.9 * scale, 1.5 * scale), (0, 0, 0), key_e * 0.18, 1.8 * scale, color=(0.93, 0.95, 1.0))


# ================================================================ zipper ===
def build_zipper():
    lib.reset()
    L = 0.17
    tape_m = weave_material('tape', (0.05, 0.05, 0.055), scale=900.0, amount=0.25)
    for s in (1, -1):
        tape = bevelled_slab(f'tape{s}', 0.028, L, 0.0009, r=0.0004, bevel=0.0002)
        tape.location = (s * 0.0165, 0, 0.00045)
        lib.assign(tape, tape_m)
    # interlocked metal teeth
    metal = principled('teeth', color=(0.78, 0.78, 0.8), rough=0.22, metallic=1.0)
    bm = bmesh.new()
    pitch = 0.0033
    n = int(L / pitch)
    for i in range(n):
        y = -L / 2 + i * pitch
        for s, off in ((1, 0.0), (-1, pitch / 2)):
            m = Matrix.Translation((s * 0.0011, y + off, 0.0014)) @ Matrix.Diagonal((0.0042, 0.0021, 0.0016, 1))
            bmesh.ops.create_cube(bm, size=1.0, matrix=m)
    teeth = lib.mesh_object('teeth', bm)
    bv = teeth.modifiers.new('bev', 'BEVEL')
    bv.width = 0.0004
    bv.segments = 2
    lib.apply_modifiers(teeth)
    lib.smooth(teeth)
    lib.assign(teeth, metal)
    # painted slider + pull tab (printable)
    paint = principled('body', color=(0.86, 0.86, 0.86), rough=0.3, coat=1.0, coat_rough=0.08, spec=0.5)
    paint_p = principled('print', color=(0.86, 0.86, 0.86), rough=0.3, coat=1.0, coat_rough=0.08, spec=0.5)
    slider = bevelled_slab('slider', 0.0125, 0.02, 0.0055, r=0.003, bevel=0.0012)
    slider.location = (0, 0.03, 0.0042)
    lib.assign(slider, paint)
    tab_outline = [(-0.0045, 0.0), (0.0045, 0.0)] + bezier((0.0045, -0.006), (0.0095, -0.012), (0.0095, -0.02), 6)[:0] + \
        [(0.0055, -0.006), (0.0095, -0.014), (0.0095, -0.040), (0.0085, -0.043), (-0.0085, -0.043), (-0.0095, -0.040), (-0.0095, -0.014), (-0.0055, -0.006)]
    tab = prism('tab', tab_outline, 0.0, 0.0018)
    bv = tab.modifiers.new('bev', 'BEVEL')
    bv.width = 0.0005
    bv.segments = 3
    lib.apply_modifiers(tab)
    lib.smooth(tab)
    tab.location = (0, 0.028, 0.0065)
    tab.rotation_euler.x = 0.07
    two_slots(tab, paint_p, paint)
    bpy.context.view_layer.objects.active = tab
    for o in bpy.context.view_layer.objects:
        o.select_set(o == tab)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    me = tab.data
    uvl = me.uv_layers.new(name='PrintUV')
    PW, PH, py0 = 0.016, 0.03, -0.012
    for poly in me.polygons:
        if poly.normal.z > 0.9:          # the upward face of the (slightly tilted) tab
            poly.material_index = 0
    for loop in me.loops:
        co = me.vertices[loop.vertex_index].co
        uvl.data[loop.index].uv = ((co.x + PW / 2) / PW, (co.y - 0.028 - py0 + PH) / PH)
    ring = tube_curve('ring', [(0.0035 * math.cos(a), 0.029 + 0.0035 * math.sin(a), 0.0068) for a in [i * 2 * math.pi / 12 for i in range(13)]], 0.0009, res=3)
    lib.assign(ring, metal)
    for o in bpy.data.objects:
        if o.type == 'MESH':
            o.rotation_euler.z += 0.5
            o.location.rotate(Euler((0, 0, 0.5)))
    backdrop_paper(color=(0.66, 0.64, 0.61))
    soft_lights(0.25, 2.2)
    top_camera(0.25, look=(0.004, 0.004, 0.0), tilt=0.35, lens=85)
    return dict(tintable=True, print_aspect=PW / PH, default={'u': 0.5, 'v': 0.45, 'w': 0.8},
                extra={'presets': {'center': {'u': 0.5, 'v': 0.45, 'w': 0.8}}})


# ========================================================== woven label ===
def build_label():
    lib.reset()
    jersey_backdrop(color=(0.6, 0.6, 0.61))
    W, H = 0.07, 0.026
    lab = bevelled_slab('label', W, H, 0.0007, r=0.0006, bevel=0.0002)
    lab.location.z = 0.0006
    lib.apply_modifiers(lab)
    mp = weave_material('print', (0.9, 0.89, 0.86), scale=1200.0, amount=0.08, strength=0.25)
    mb = weave_material('body', (0.9, 0.89, 0.86), scale=1200.0, amount=0.08, strength=0.25)
    for m in (mp, mb):
        st = rect_stitch(m, -W / 2, W / 2, -H / 2, H / 2, 0.0028, width=0.0004)
        add_bump_extra(m, st, 0.8)
    two_slots(lab, mp, mb)
    bpy.context.view_layer.objects.active = lab
    for o in bpy.context.view_layer.objects:
        o.select_set(o == lab)
    bpy.ops.object.transform_apply(location=True)
    planar_print(lab, -W / 2 + 0.004, W / 2 - 0.004, -H / 2 + 0.003, H / 2 - 0.003, 0.00095)
    # folded ends tucked under the stitching
    for s in (1, -1):
        fold = bevelled_slab(f'fold{s}', 0.004, H, 0.0012, r=0.0004, bevel=0.0003)
        fold.location = (s * (W / 2 - 0.0012), 0, 0.0009)
        lib.assign(fold, mb)
    for o in bpy.data.objects:
        if o.name.startswith(('label', 'fold')):
            o.rotation_euler.z = -0.12
            o.location.rotate(Euler((0, 0, -0.12)))
    soft_lights(0.25, 1.6)
    top_camera(0.20, tilt=0.25, lens=85)
    return dict(tintable=True, print_aspect=(W - 0.008) / (H - 0.006), default={'u': 0.5, 'v': 0.5, 'w': 0.8},
                extra={'presets': {'center': {'u': 0.5, 'v': 0.5, 'w': 0.8}}})


# ============================================================== hang tag ===
def build_hangtag():
    lib.reset()
    W, H, T = 0.05, 0.09, 0.0006
    outline = [(-W / 2, -H / 2), (W / 2, -H / 2), (W / 2, H / 2 - 0.012), (W / 2 - 0.012, H / 2), (-W / 2 + 0.012, H / 2), (-W / 2, H / 2 - 0.012)]
    tag = prism('tag', outline, 0, T)
    hole = prism('hole', [(0.0028 * math.cos(a), H / 2 - 0.009 + 0.0028 * math.sin(a)) for a in [i * 2 * math.pi / 20 for i in range(20)]], -0.001, 0.002)
    mod = tag.modifiers.new('hole', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.object = hole
    mod.solver = 'EXACT'
    bv = tag.modifiers.new('bev', 'BEVEL')
    bv.width = 0.00015
    bv.segments = 2
    lib.apply_modifiers(tag)
    bpy.data.objects.remove(hole)
    kraft = (0.86, 0.85, 0.82)
    m = principled('body', color=kraft, rough=0.8, spec=0.3)
    mp = principled('print', color=kraft, rough=0.8, spec=0.3)
    for mat in (m, mp):
        co = lib.tex_coord(mat)
        fib = lib.noise(mat, co, 900.0, detail=4)
        textured_albedo(mat, kraft, fib.outputs['Fac'], amount=0.05)
        lib.add_bump(mat, fib.outputs['Fac'], strength=0.12, distance=0.0002)
    two_slots(tag, mp, m)
    planar_print(tag, -W / 2 + 0.003, W / 2 - 0.003, -H / 2 + 0.004, H / 2 - 0.018, T)
    metal = principled('eyelet', color=(0.82, 0.72, 0.45), rough=0.25, metallic=1.0)
    ring = tube_curve('eyelet', [(0.0033 * math.cos(a), H / 2 - 0.009 + 0.0033 * math.sin(a), T + 0.0003) for a in [i * 2 * math.pi / 20 for i in range(21)]], 0.0011, res=4)
    lib.assign(ring, metal)
    string_m = principled('string', color=(0.12, 0.12, 0.12), rough=0.8, sheen=0.4)
    string = tube_curve('string', [(0, H / 2 - 0.009, T + 0.0008), (0.004, H / 2 + 0.01, 0.0012), (0.02, H / 2 + 0.03, 0.0008),
                                   (0.045, H / 2 + 0.02, 0.0008), (0.07, H / 2 + 0.045, 0.0008)], 0.0007, res=3)
    lib.assign(string, string_m)
    for o in (tag, ring, string):
        o.rotation_euler.z = 0.28
        o.location.rotate(Euler((0, 0, 0.28)))
    backdrop_paper(color=(0.66, 0.64, 0.61))
    soft_lights(0.3, 2.4)
    top_camera(0.27, look=(0.002, 0.004, 0.0), tilt=0.3, lens=85)
    return dict(tintable=True, print_aspect=(W - 0.006) / (H - 0.022), default={'u': 0.5, 'v': 0.55, 'w': 0.8},
                extra={'presets': {'center': {'u': 0.5, 'v': 0.55, 'w': 0.8}}})


# ========================================================= leather patch ===
def build_patch():
    lib.reset()
    denim_backdrop()
    W, H, T = 0.075, 0.05, 0.0024
    patch = bevelled_slab('patch', W, H, T, r=0.004, bevel=0.0008)
    patch.location.z = T / 2
    lib.apply_modifiers(patch)
    bpy.context.view_layer.objects.active = patch
    for o in bpy.context.view_layer.objects:
        o.select_set(o == patch)
    bpy.ops.object.transform_apply(location=True)
    mp = leather('print', (0.86, 0.85, 0.83))
    mb = leather('body', (0.86, 0.85, 0.83))
    for m in (mp, mb):
        add_bump_extra(m, rect_stitch(m, -W / 2, W / 2, -H / 2, H / 2, 0.0035, width=0.0005), 0.9)
    two_slots(patch, mp, mb)
    planar_print(patch, -W / 2 + 0.007, W / 2 - 0.007, -H / 2 + 0.007, H / 2 - 0.007, T)
    patch.rotation_euler.z = -0.1
    soft_lights(0.3, 2.6)
    top_camera(0.24, tilt=0.3, lens=85)
    return dict(tintable=True, print_aspect=(W - 0.014) / (H - 0.014), default={'u': 0.5, 'v': 0.5, 'w': 0.85},
                extra={'presets': {'center': {'u': 0.5, 'v': 0.5, 'w': 0.85}}})


# ================================================================= apron ===
def build_apron():
    lib.reset()
    Ta = 0.005
    right = bezier((0.0, 0.40), (0.08, 0.40), (0.15, 0.40), 6) + bezier((0.15, 0.40), (0.17, 0.16), (0.33, 0.06), 14) + \
        bezier((0.33, 0.06), (0.335, -0.2), (0.33, -0.48), 10) + bezier((0.33, -0.48), (0.15, -0.49), (0.0, -0.485), 8)
    outline = mirror(right)
    ap = solid('apron', outline, -Ta / 2, Ta / 2, voxel=0.002)
    from garments import body_print
    import garments
    garments.TOP = Ta / 2
    mp = weave_material('print', WHITE, scale=260.0, amount=0.06, strength=0.25)
    mb = weave_material('body', WHITE, scale=260.0, amount=0.06, strength=0.25)
    W, y0, H = 0.66, -0.49, 0.90

    def wr(x, y):
        p = Vector((x, y))
        z = 0.0014 * (1 + math.sin(7 * x + 3 * y) * math.sin(5 * y - 2 * x + 0.4))
        for a, b, w, h in (((-0.25, 0.0), (-0.1, -0.3), 0.03, 0.002), ((0.2, -0.05), (0.26, -0.4), 0.02, 0.0018), ((-0.12, 0.3), (0.12, 0.25), 0.02, 0.0012)):
            z += _crease(p, a, b, w, h)
        return z
    body_print(ap, mp, mb, W, y0, H)
    garments.TOP = 0.004
    lift(ap, wr)
    trims = []
    pocket = solid('pocket', [(-0.21, -0.08), (0.21, -0.08), (0.21, -0.27), (-0.21, -0.27)], Ta / 2 + 0.0001, Ta / 2 + 0.0022, voxel=0.0016, smooth_iter=3)
    pm = weave_material('body_pocket', WHITE, scale=260.0, amount=0.06, strength=0.25)
    co = lib.tex_coord(pm)
    add_bump_extra(pm, line_groove(pm, co, (0.0, -0.08), (0.0, -0.27), [0.0], 0.0008), 0.8)
    lib.assign(pocket, pm)
    trims.append(pocket)
    strap_m = weave_material('body_strap', WHITE, scale=300.0, amount=0.06)
    neck = tube_curve('neck', [(-0.13, 0.395, Ta), (-0.15, 0.52, Ta), (0.0, 0.60, Ta), (0.15, 0.52, Ta), (0.13, 0.395, Ta)], 0.012, res=4)
    for v in neck.data.vertices:
        v.co.z = Ta + (v.co.z - Ta) * 0.12
    lib.assign(neck, strap_m)
    trims.append(neck)
    for s in (1, -1):
        tie = tube_curve(f'tie{s}', [(s * 0.32, 0.05, Ta), (s * 0.40, 0.02, Ta), (s * 0.43, -0.18, Ta), (s * 0.40, -0.36, Ta)], 0.0115, res=4)
        for v in tie.data.vertices:
            v.co.z = Ta + (v.co.z - Ta) * 0.12
        lib.assign(tie, strap_m)
        trims.append(tie)
    for o in trims:
        lift(o, wr)
    backdrop_paper(color=(0.50, 0.485, 0.46)).location.z = -Ta / 2 - 0.0003
    lib.world_color((1.0, 0.985, 0.96), 0.08)
    lib.area_light((-1.5, 0.7, 1.05), (0, 0, 0), 34, 1.0, color=(1.0, 0.97, 0.93))
    lib.area_light((1.3, -0.9, 1.6), (0, 0, 0), 6, 2.0, color=(0.93, 0.95, 1.0))
    lib.camera((0, 0.05, 2.45), (0, 0.05, 0), lens=72)
    ty = lambda y: (y - y0) / H
    return dict(tintable=True, print_aspect=W / H, default={'u': 0.5, 'v': ty(0.22), 'w': 0.32},
                extra={'presets': {'center': {'u': 0.5, 'v': ty(0.22), 'w': 0.32}, 'big': {'u': 0.5, 'v': ty(0.05), 'w': 0.55}}})


# ============================================================ mouse pad ===
def build_mousepad():
    lib.reset()
    W, H, T = 0.25, 0.21, 0.003
    pad = bevelled_slab('pad', W, H, T, r=0.012, bevel=0.0012)
    pad.location.z = T / 2
    lib.apply_modifiers(pad)
    bpy.context.view_layer.objects.active = pad
    for o in bpy.context.view_layer.objects:
        o.select_set(o == pad)
    bpy.ops.object.transform_apply(location=True)
    mp = weave_material('print', WHITE, scale=1500.0, amount=0.04, strength=0.15)
    mb = weave_material('body', WHITE, scale=1500.0, amount=0.04, strength=0.15)
    for m in (mp, mb):
        add_bump_extra(m, rect_stitch(m, -W / 2, W / 2, -H / 2, H / 2, 0.002, width=0.0009), 0.6)
    two_slots(pad, mp, mb)
    planar_print(pad, -W / 2, W / 2, -H / 2, H / 2, T)
    pad.rotation_euler.z = 0.12
    backdrop_paper(color=(0.70, 0.68, 0.645))
    product_lights(key=(-0.55, 0.35, 0.6), target=(0, 0, 0), key_e=5.5, strip=False, rim_e=0.8, world=0.08)
    lib.camera((0.0, -0.36, 0.52), (0.0, -0.01, 0.0), lens=70)
    return dict(tintable=True, print_aspect=W / H, default={'u': 0.5, 'v': 0.5, 'w': 0.6},
                extra={'presets': {'center': {'u': 0.5, 'v': 0.5, 'w': 0.6}, 'big': {'u': 0.5, 'v': 0.5, 'w': 1.0}}})


SCENES = {
    'cap': build_cap,
    'zipper': build_zipper,
    'label': build_label,
    'hangtag': build_hangtag,
    'patch': build_patch,
    'apron': build_apron,
    'mousepad': build_mousepad,
}
