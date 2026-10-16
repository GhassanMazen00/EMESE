"""Structured six-panel baseball cap.

The crown is lofted from Bezier meridians that run from the sweatband up to the
button: steep at the structured front, rounder at the back. Panels pillow a
little between pinched seams; twin topstitching, embroidered eyelets and the
fabric button follow. The pre-curved brim is a crescent bent down at the sides
with a rolled edge and eight rows of stitching that follow its outline.
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector

import lib
from lib import connect, node, principled
from products import sum_sockets, sweep, textured_albedo, tube_curve

A_X, A_Y = 0.091, 0.100             # sweatband half-axes (side, front-back); front is -y
APEX = Vector((0.0, 0.012, 0.099))
SEAMS = [-math.pi / 2 + k * math.pi / 3 for k in range(6)]
WHITE = (0.86, 0.86, 0.85)


C_BEND = 2.4                        # brim curvature carried into the front of the band


def front_weight(phi):
    a = abs(((phi + math.pi / 2 + math.pi) % (2 * math.pi)) - math.pi)     # angle from centre front
    t = min(max((a - math.radians(58)) / math.radians(40), 0.0), 1.0)
    return 1 - t * t * (3 - 2 * t)


def base(phi):
    x = A_X * math.cos(phi)
    return Vector((x, A_Y * math.sin(phi), -C_BEND * x * x * front_weight(phi)))


def _bez(p0, p1, p2, p3, t):
    a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t ** 3
    return p0 * a + p1 * b + p2 * c + p3 * d


def seam_delta(phi):
    """Signed angle to the nearest seam."""
    return ((phi + math.pi / 2 + math.pi / 6) % (math.pi / 3)) - math.pi / 6


def crown_point(phi, v, detail=True):
    B = base(phi)
    front = max(0.0, -math.sin(phi))
    back = max(0.0, math.sin(phi))
    h1 = 0.060 + 0.026 * front ** 1.5 - 0.012 * back
    lean = 0.006 + 0.012 * back - 0.008 * front
    k2 = 0.060 + 0.018 * front ** 2 + 0.008 * back
    d = Vector((B.x - APEX.x, B.y - APEX.y, 0.0)).normalized()
    p = _bez(B, B + Vector((-d.x * lean, -d.y * lean, h1 + B.z * 0.4)), APEX + d * k2, APEX, v)
    if not detail:
        return p
    # panels pillow between the seams (less on the stiff front), seams pinch in
    dl = seam_delta(phi)
    f = abs(dl) / (math.pi / 6)
    r_h = math.hypot(p.x, p.y - APEX.y * v)
    arc = abs(dl) * r_h
    amp = 0.0011 + 0.0016 * (1 - front)
    out = amp * (1 - (1 - f) ** 2) * math.sin(math.pi * min(v, 1.0)) ** 0.8
    out -= 0.0010 * math.exp(-(arc / 0.0017) ** 2) * (1 - v ** 6)
    c = Vector((0.0, 0.004, 0.035))
    n = (p - c).normalized()
    return p + n * out


def build_crown(NA=720, NV=150):
    bm = bmesh.new()
    rows = []
    for j in range(NV):
        v = (j / NV) ** 0.95 * 0.992
        rows.append([bm.verts.new(crown_point(-math.pi + 2 * math.pi * i / NA, v)) for i in range(NA)])
    top = bm.verts.new(APEX)
    # surface coordinates (metres): around the band, up the meridian; the twill follows them
    up = [[0.0] * NA]
    for j in range(1, NV):
        up.append([up[j - 1][i] + (rows[j][i].co - rows[j - 1][i].co).length for i in range(NA)])
    uvl = bm.loops.layers.uv.new('CrownUV')
    circ = 0.59

    def put(face, cols, js):
        for loop, i, j in zip(face.loops, cols, js):
            loop[uvl].uv = (circ * i / NA, up[j][i % NA] if j < NV else up[NV - 1][0] + 0.004)
    for j in range(NV - 1):
        for i in range(NA):
            f = bm.faces.new((rows[j][i], rows[j][(i + 1) % NA], rows[j + 1][(i + 1) % NA], rows[j + 1][i]))
            put(f, (i, i + 1, i + 1, i), (j, j, j + 1, j + 1))
    for i in range(NA):
        f = bm.faces.new((rows[-1][i], rows[-1][(i + 1) % NA], top))
        put(f, (i, i + 1, i), (NV - 1, NV - 1, NV))
    obj = lib.mesh_object('crown', bm)
    sol = obj.modifiers.new('sol', 'SOLIDIFY')
    sol.thickness = 0.0020
    sol.offset = -1
    lib.apply_modifiers(obj)
    lib.smooth(obj)
    return obj


# ------------------------------------------------------------- brim ---
BRIM_SPAN = math.radians(70)        # each side of centre front
BRIM_D = 0.073


def brim_frame(NS=181):
    """Inner edge points, outward directions and depth along the brim."""
    out = []
    for i in range(NS):
        s = -1 + 2 * i / (NS - 1)
        phi = -math.pi / 2 + s * BRIM_SPAN
        p = base(phi)
        n = Vector((math.cos(phi) / A_X, math.sin(phi) / A_Y, 0)).normalized()
        depth = BRIM_D * (1 - abs(s) ** 1.8)
        out.append((s, p - n * 0.004, n, depth + 0.004))
    return out


def brim_surface(s, p, n, depth, t):
    q = p + n * (depth * t)
    # pre-curved: the band's arch continues outwards, the bill tips forward a little
    q.z = p.z - (0.005 + 0.016 * s * s) * t ** 1.2 - C_BEND * (q.x * q.x - p.x * p.x) * 0.9 - 0.0012
    return q


def build_brim(NS=181, NT=36, NR=10, half=0.0019):
    frame = brim_frame(NS)
    grid = [[brim_surface(s, p, n, d, j / NT) for j in range(NT + 1)] for s, p, n, d in frame]
    bm = bmesh.new()
    uv_v = []
    rows = []
    for i, (s, p, n, d) in enumerate(frame):
        col = grid[i]
        # normals of the bent surface
        up = []
        for j in range(NT + 1):
            a = col[min(j + 1, NT)] - col[max(j - 1, 0)]
            b = grid[min(i + 1, NS - 1)][j] - grid[max(i - 1, 0)][j]
            nn = b.cross(a).normalized()
            if nn.z < 0:
                nn = -nn
            up.append(nn)
        ring = []
        # top surface (inner -> outer), rolled edge, bottom surface (outer -> inner)
        for j in range(NT + 1):
            ring.append((col[j] + up[j] * half, (1 - j / NT) * d))
        e = (col[NT] - col[NT - 1]).normalized()
        for k in range(1, NR):
            a = math.pi / 2 - math.pi * k / NR
            ring.append((col[NT] + up[NT] * (half * math.sin(a)) + e * (half * 0.85 * math.cos(a)), -0.001 * k / NR))
        for j in range(NT, -1, -1):
            ring.append((col[j] - up[j] * half, -(1 - j / NT) * d - 0.002))
        rows.append([bm.verts.new(c) for c, _ in ring])
        uv_v.append([vv for _, vv in ring])
    # along-the-edge distance for each ring position (stitch dashes)
    nring = len(rows[0])
    along = np.zeros((NS, nring))
    for i in range(1, NS):
        for k in range(nring):
            along[i, k] = along[i - 1, k] + (rows[i][k].co - rows[i - 1][k].co).length
    faces = []
    for i in range(NS - 1):
        for k in range(nring - 1):
            faces.append(bm.faces.new((rows[i][k], rows[i + 1][k], rows[i + 1][k + 1], rows[i][k + 1])))
    obj = lib.mesh_object('brim', bm)
    me = obj.data
    uvl = me.uv_layers.new(name='BrimUV')
    uvs = [(along[i, k], uv_v[i][k]) for i in range(NS) for k in range(nring)]   # vertex creation order
    for loop in me.loops:
        uvl.data[loop.index].uv = uvs[loop.vertex_index]
    lib.smooth(obj)
    return obj


# --------------------------------------------------------- materials ---
def twill(name, color=WHITE, structured=False, uv_map=None):
    """Cotton twill: fine diagonal wales (along the surface when a UV map is given), slubs, soft sheen."""
    m = principled(name, color=color, rough=0.86, sheen=0.45, sheen_rough=0.5, spec=0.32)
    co = lib.tex_coord(m)
    rot = node(m, 'ShaderNodeMapping')
    rot.inputs['Rotation'].default_value = (0.0, 0.0, 0.785)
    if uv_map:
        uvn = node(m, 'ShaderNodeUVMap')
        uvn.uv_map = uv_map
        connect(m, uvn.outputs['UV'], rot.inputs['Vector'])
    else:
        connect(m, co, rot.inputs['Vector'])
    tw = node(m, 'ShaderNodeTexWave', _wave_type='BANDS', _bands_direction='X', Scale=1300.0, Distortion=1.2, Detail=1.0)
    connect(m, rot.outputs['Vector'], tw.inputs['Vector'])
    slub = lib.noise(m, co, 220.0, detail=3, rough=0.55)
    soft = lib.noise(m, co, 30.0, detail=3)
    tex = sum_sockets(m, [tw.outputs['Fac'], slub.outputs['Fac'], soft.outputs['Fac']], [0.3, 0.45, 0.25 if structured else 0.45])
    textured_albedo(m, color, tex, amount=0.05)
    return m, co, tex


def _math(m, op, a, b=None, value=None):
    n = node(m, 'ShaderNodeMath', _operation=op)
    if isinstance(a, (int, float)):
        n.inputs[0].default_value = a
    else:
        connect(m, a, n.inputs[0])
    if b is not None:
        if isinstance(b, (int, float)):
            n.inputs[1].default_value = b
        else:
            connect(m, b, n.inputs[1])
    return n.outputs['Value']


def _band(m, x, centre, width):
    """1 near x == centre, falling to 0 over `width` (smooth)."""
    d = _math(m, 'ABSOLUTE', _math(m, 'SUBTRACT', x, centre))
    r = node(m, 'ShaderNodeMapRange', _interpolation_type='SMOOTHSTEP', **{'From Min': 0.0, 'From Max': width, 'To Min': 1.0, 'To Max': 0.0})
    connect(m, d, r.inputs['Value'])
    return r.outputs['Result']


def _dashes(m, along, period=0.0030, duty=0.74):
    ph = _math(m, 'DIVIDE', _math(m, 'FLOORED_MODULO', along, period), period)
    r = node(m, 'ShaderNodeMapRange', _interpolation_type='SMOOTHSTEP', **{'From Min': duty - 0.12, 'From Max': duty, 'To Min': 1.0, 'To Max': 0.0})
    connect(m, ph, r.inputs['Value'])
    lo = node(m, 'ShaderNodeMapRange', _interpolation_type='SMOOTHSTEP', **{'From Min': 0.0, 'From Max': 0.1, 'To Min': 0.0, 'To Max': 1.0})
    connect(m, ph, lo.inputs['Value'])
    return _math(m, 'MULTIPLY', r.outputs['Result'], lo.outputs['Result'])


def stitch_rows(m, dist, along, rows, width=0.00042, groove=True):
    """Thread dashes at |dist| == each row; returns (height, shade)."""
    dash = _dashes(m, along)
    h = None
    sh = None
    for r in rows:
        line = _band(m, dist, r, width)
        th = _math(m, 'MULTIPLY', line, dash)
        sink = _band(m, dist, r, width * 3.0)
        hh = _math(m, 'SUBTRACT', _math(m, 'MULTIPLY', th, 1.0), _math(m, 'MULTIPLY', sink, 0.55))
        s_ = _math(m, 'MULTIPLY', sink, _math(m, 'SUBTRACT', 1.0, dash))
        h = hh if h is None else _math(m, 'ADD', h, hh)
        sh = s_ if sh is None else _math(m, 'ADD', sh, s_)
    return h, sh


def finish(m, color, tex, extra_h, extra_shade, micro=0.22, stitch=0.55):
    """Wire base colour (fabric x stitch shading) and a two-stage bump."""
    p = m.node_tree.nodes['Principled BSDF']
    # replace the albedo chain's multiplier with one that includes the stitch shading
    mr = node(m, 'ShaderNodeMapRange', **{'From Min': 0.0, 'From Max': 1.0, 'To Min': 0.95, 'To Max': 1.012})
    connect(m, tex, mr.inputs['Value'])
    shade = _math(m, 'MULTIPLY', mr.outputs['Result'], _math(m, 'SUBTRACT', 1.0, _math(m, 'MULTIPLY', extra_shade, 0.22)))
    mul = node(m, 'ShaderNodeMix', _data_type='RGBA', _blend_type='MULTIPLY', Factor=1.0)
    mul.inputs['A'].default_value = (*color, 1)
    connect(m, shade, mul.inputs['B'])
    connect(m, mul.outputs['Result'], p.inputs['Base Color'])
    b1 = node(m, 'ShaderNodeBump', Strength=micro, Distance=0.0008)
    connect(m, tex, b1.inputs['Height'])
    b2 = node(m, 'ShaderNodeBump', Strength=stitch, Distance=0.0004)
    connect(m, extra_h, b2.inputs['Height'])
    connect(m, b1.outputs['Normal'], b2.inputs['Normal'])
    connect(m, b2.outputs['Normal'], p.inputs['Normal'])


def crown_material(name, color=WHITE):
    m, co, tex = twill(name, color, structured=True, uv_map='CrownUV')
    sep = node(m, 'ShaderNodeSeparateXYZ')
    connect(m, co, sep.inputs['Vector'])
    y = sep.outputs['Y']
    phi = _math(m, 'ARCTAN2', y, sep.outputs['X'])
    dl = _math(m, 'SUBTRACT', _math(m, 'FLOORED_MODULO', _math(m, 'ADD', phi, math.pi / 2 + math.pi / 6), math.pi / 3), math.pi / 6)
    rh = node(m, 'ShaderNodeVectorMath', _operation='LENGTH')
    comb = node(m, 'ShaderNodeCombineXYZ')
    connect(m, sep.outputs['X'], comb.inputs['X'])
    connect(m, y, comb.inputs['Y'])
    connect(m, comb.outputs['Vector'], rh.inputs['Vector'])
    dist = _math(m, 'MULTIPLY', _math(m, 'ABSOLUTE', dl), rh.outputs['Value'])
    # distance from the button, as "along the seam"
    dv = node(m, 'ShaderNodeVectorMath', _operation='DISTANCE')
    connect(m, co, dv.inputs[0])
    dv.inputs[1].default_value = tuple(APEX)
    near_top = node(m, 'ShaderNodeMapRange', _interpolation_type='SMOOTHSTEP', **{'From Min': 0.012, 'From Max': 0.02, 'To Min': 0.0, 'To Max': 1.0})
    connect(m, dv.outputs['Value'], near_top.inputs['Value'])
    h, sh = stitch_rows(m, dist, dv.outputs['Value'], [0.0030, 0.0052])
    seam = _band(m, dist, 0.0, 0.0007)
    h = _math(m, 'MULTIPLY', _math(m, 'SUBTRACT', h, _math(m, 'MULTIPLY', seam, 1.4)), near_top.outputs['Result'])
    sh = _math(m, 'MULTIPLY', _math(m, 'ADD', sh, seam), near_top.outputs['Result'])
    finish(m, color, tex, h, sh)
    return m


def brim_material(name, color=WHITE):
    m, co, tex = twill(name, color, structured=True, uv_map='BrimUV')
    uv = node(m, 'ShaderNodeUVMap')
    uv.uv_map = 'BrimUV'
    sep = node(m, 'ShaderNodeSeparateXYZ')
    connect(m, uv.outputs['UV'], sep.inputs['Vector'])
    rows = [0.0055 + k * 0.0064 for k in range(8)]
    h, sh = stitch_rows(m, sep.outputs['Y'], sep.outputs['X'], rows)
    finish(m, color, tex, h, sh)
    return m


# --------------------------------------------------------------- scene ---
def build_cap():
    lib.reset()
    crown = build_crown()
    m_print = crown_material('print')
    m_body = crown_material('body')
    crown.data.materials.clear()
    crown.data.materials.append(m_print)
    crown.data.materials.append(m_body)
    me = crown.data
    uvl = me.uv_layers.new(name='PrintUV')
    W, H, z0 = 0.140, 0.078, 0.014
    R_FRONT = 0.100
    centre = Vector((0, 0.004, 0.035))
    for poly in me.polygons:
        c = poly.center
        outer = poly.normal.dot((c - centre).normalized()) > 0
        front = c.y < -0.03 and abs(c.x) < 0.085 and z0 - 0.008 < c.z < z0 + H + 0.012
        poly.material_index = 0 if (outer and front) else 1
    for loop in me.loops:
        co = me.vertices[loop.vertex_index].co
        phi = math.atan2(co.y, co.x)
        u = ((phi + math.pi / 2) * R_FRONT + W / 2) / W
        uvl.data[loop.index].uv = (u, (co.z - z0) / H)

    brim = build_brim()
    lib.assign(brim, brim_material('body_brim'))
    parts = [crown, brim]

    # fabric-covered button
    bmb = bmesh.new()
    bmesh.ops.create_uvsphere(bmb, u_segments=40, v_segments=20, radius=0.0088)
    btn = lib.mesh_object('squatchee', bmb)
    btn.scale.z = 0.40
    btn.location = APEX + Vector((0, 0, 0.0010))
    lib.smooth(btn)
    btn_m, _, btex = twill('body_button')
    lib.assign(btn, btn_m)
    parts.append(btn)

    # embroidered eyelets, one per panel
    eyelet_m = principled('eyelet', color=(0.04, 0.04, 0.04), rough=0.85)
    for k in range(6):
        phi = SEAMS[k] + math.pi / 6
        p = crown_point(phi, 0.62)
        q = crown_point(phi, 0.625)
        r = crown_point(phi + 0.01, 0.62)
        n = (r - p).cross(q - p).normalized()
        if n.dot(p - Vector((0, 0.004, 0.035))) < 0:
            n = -n
        t1 = (r - p).normalized()
        t2 = n.cross(t1).normalized()
        ring_pts = [tuple(p + n * 0.0005 + (t1 * math.cos(a) + t2 * math.sin(a)) * 0.0027) for a in [i * 2 * math.pi / 24 for i in range(25)]]
        ring = tube_curve(f'eyelet{k}', ring_pts, 0.00085, res=3)
        lib.assign(ring, btn_m)
        parts.append(ring)
        hole = bmesh.new()
        bmesh.ops.create_circle(hole, cap_ends=True, segments=20, radius=0.0021)
        h = lib.mesh_object(f'hole{k}', hole)
        h.matrix_world = Matrix.Translation(p + n * 0.0002) @ n.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        lib.assign(h, eyelet_m)
        parts.append(h)

    # shown upright, as if on a head, floating a little above the table (the shadow grounds it)
    pose = Euler((0, 0, -0.45)).to_matrix().to_4x4() @ Euler((-0.05, 0, 0)).to_matrix().to_4x4()
    for o in parts:
        o.matrix_world = pose @ o.matrix_world
    bpy.context.view_layer.update()
    zmin = min((o.matrix_world @ v.co).z for o in (crown, brim) for v in o.data.vertices)
    for o in parts:
        o.location.z += 0.012 - zmin

    sweep(color=(0.72, 0.70, 0.67), radius=0.4, depth=1.5, height=1.2, width=3)
    lib.world_color((1.0, 0.985, 0.965), 0.07)
    lib.area_light((-0.62, -0.40, 0.62), (0, 0, 0.05), 4.0, 0.6, color=(1.0, 0.972, 0.94))
    lib.area_light((0.50, 0.55, 0.50), (0, 0, 0.06), 1.6, 0.4, color=(0.92, 0.95, 1.0))
    lib.area_light((0.60, -0.40, 0.18), (0, 0, 0.05), 0.35, 0.6, color=(0.95, 0.96, 1.0))
    lib.camera((-0.09, -0.68, 0.25), (0.0, -0.01, 0.058), lens=85)
    return dict(tintable=True, print_aspect=W / H, spec_blur=6.0,   # fabric sheen is soft: no denoiser blotches
                default={'u': 0.5, 'v': 0.5, 'w': 0.5},
                extra={'presets': {'center': {'u': 0.5, 'v': 0.5, 'w': 0.5}, 'big': {'u': 0.5, 'v': 0.5, 'w': 0.72}}})


SCENES = {'cap': build_cap}
