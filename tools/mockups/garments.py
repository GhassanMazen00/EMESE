"""Flat-lay garments: polo (short / long sleeve) and hoodie.

Same recipe as the tee in products.py: a thin solid cut from the garment outline,
voxel-remeshed so its edges roll softly, creases added as height, then trims
(collar, placket, rib bands, hood, pocket) laid on top.
"""
import math

import bmesh
import bpy
from mathutils import Vector

import lib
from lib import connect, node, principled
from products import (_crease, backdrop_paper, bezier, knit_height, line_groove, prism, sum_sockets,
                      textured_albedo, tube_curve)

T = 0.008                       # garment thickness (two layers of fabric)
TOP = T / 2
WHITE = (0.86, 0.86, 0.85)


# ------------------------------------------------------------- materials ---
def pique_material(name, color=WHITE, grooves=()):
    """Polo pique: a fine honeycomb relief."""
    m = principled(name, color=color, rough=0.92, sheen=0.3, sheen_rough=0.55, spec=0.35)
    co = lib.tex_coord(m)
    vor = node(m, 'ShaderNodeTexVoronoi', Scale=520.0, _feature='SMOOTH_F1')
    connect(m, co, vor.inputs['Vector'])
    slub = lib.noise(m, co, 90.0, detail=4, rough=0.6)
    soft = lib.noise(m, co, 14.0, detail=3)
    tex = sum_sockets(m, [vor.outputs['Distance'], slub.outputs['Fac'], soft.outputs['Fac']], [0.5, 0.3, 0.4])
    textured_albedo(m, color, tex, amount=0.07)
    parts, weights = [tex], [1.0]
    for p0, p1, offs in grooves:
        parts.append(line_groove(m, co, p0, p1, offs))
        weights.append(0.9)
    lib.add_bump(m, sum_sockets(m, parts, weights), strength=0.3, distance=0.0012)
    return m


def fleece_material(name, color=WHITE, grooves=()):
    """Heavy fleece: smooth face, soft irregular surface."""
    m = principled(name, color=color, rough=0.96, sheen=0.5, sheen_rough=0.6, spec=0.3)
    co = lib.tex_coord(m)
    knit = knit_height(m, co, wale=170.0)
    fuzz = lib.noise(m, co, 260.0, detail=5, rough=0.7)
    tex = sum_sockets(m, [knit, fuzz.outputs['Fac']], [0.5, 0.5])
    textured_albedo(m, color, tex, amount=0.06)
    parts, weights = [tex], [1.0]
    for p0, p1, offs in grooves:
        parts.append(line_groove(m, co, p0, p1, offs))
        weights.append(0.9)
    lib.add_bump(m, sum_sockets(m, parts, weights), strength=0.26, distance=0.0012)
    return m


def rib_material(name, color=WHITE, angle=0.0, scale=210.0):
    """1x1 rib knit: raised cords running along `angle` (radians from +Y)."""
    m = principled(name, color=color, rough=0.93, sheen=0.35, spec=0.35)
    co = lib.tex_coord(m)
    mp = node(m, 'ShaderNodeMapping')
    mp.inputs['Rotation'].default_value = (0, 0, angle)
    connect(m, co, mp.inputs['Vector'])
    wave = node(m, 'ShaderNodeTexWave', _wave_type='BANDS', _bands_direction='X', Scale=scale, Distortion=0.4, Detail=1.0)
    connect(m, mp.outputs['Vector'], wave.inputs['Vector'])
    textured_albedo(m, color, wave.outputs['Fac'], amount=0.1)
    lib.add_bump(m, wave.outputs['Fac'], strength=0.45, distance=0.001)
    return m


# --------------------------------------------------------------- helpers ---
def solid(name, outline, z0, z1, cut=None, voxel=0.0022, smooth_iter=6):
    obj = prism(name, outline, z0, z1)
    if cut:
        cutter = prism('cut', cut, z0 + (z1 - z0) * 0.6, z1 + 0.02)
        mod = obj.modifiers.new('cut', 'BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.object = cutter
        mod.solver = 'EXACT'
        lib.apply_modifiers(obj)
        bpy.data.objects.remove(cutter)
    rm = obj.modifiers.new('remesh', 'REMESH')
    rm.mode = 'VOXEL'
    rm.voxel_size = voxel
    sm = obj.modifiers.new('smooth', 'SMOOTH')
    sm.factor = 0.6
    sm.iterations = smooth_iter
    lib.apply_modifiers(obj)
    lib.smooth(obj)
    return obj


def lift(obj, fn, dz=0.0):
    for v in obj.data.vertices:
        v.co.z += fn(v.co.x, v.co.y) + dz


def slots(obj, mats):
    obj.data.materials.clear()
    for m in mats:
        obj.data.materials.append(m)


def body_print(obj, m_print, m_body, W, y0, H, x_center=0.0):
    """Top faces of the body are printable; PrintUV spans W x H from (x_center-W/2, y0)."""
    slots(obj, [m_print, m_body])
    me = obj.data
    uvl = me.uv_layers.new(name='PrintUV')
    for poly in me.polygons:
        c = poly.center
        poly.material_index = 0 if (poly.normal.z > 0.35 and c.z > TOP - 0.0016) else 1
    for loop in me.loops:
        co = me.vertices[loop.vertex_index].co
        uvl.data[loop.index].uv = ((co.x - x_center + W / 2) / W, (co.y - y0) / H)


def mirror(right):
    left = [(-x, y) for x, y in reversed(right[1:])]
    return right + left[:-1]


def band_quad(p_out0, p_out1, depth, inward):
    """A rib band along the edge p_out0 -> p_out1, `depth` wide towards `inward` (unit 2D)."""
    a, b = Vector(p_out0), Vector(p_out1)
    n = Vector(inward).normalized() * depth
    return [tuple(a), tuple(b), tuple(b + n), tuple(a + n)]


def studio(cam_y=0.012, cam_z=2.25, lens=72, ground=(0.50, 0.485, 0.46)):
    backdrop_paper(color=ground).location.z = -T / 2 - 0.0003
    lib.world_color((1.0, 0.985, 0.96), 0.08)
    lib.area_light((-1.5, 0.7, 1.05), (0, 0, 0), 34, 1.0, color=(1.0, 0.97, 0.93))
    lib.area_light((1.3, -0.9, 1.6), (0, 0, 0), 6, 2.0, color=(0.93, 0.95, 1.0))
    lib.camera((0, cam_y, cam_z), (0, cam_y, 0), lens=lens)


def button(name, x, y, z, r=0.0058, mat=None):
    b = prism(name, [(r * math.cos(a), r * math.sin(a)) for a in [i * 2 * math.pi / 32 for i in range(32)]], 0, 0.0016)
    bv = b.modifiers.new('bev', 'BEVEL')
    bv.width = 0.0006
    bv.segments = 3
    lib.apply_modifiers(b)
    lib.smooth(b)
    b.location = (x, y, z)
    if mat:
        lib.assign(b, mat)
    return b


def button_material():
    m = principled('button', color=(0.9, 0.89, 0.86), rough=0.25, spec=0.5, coat=0.6)
    co = lib.tex_coord(m)
    # four thread holes
    holes = None
    for dx, dy in ((0.0016, 0.0016), (-0.0016, 0.0016), (0.0016, -0.0016), (-0.0016, -0.0016)):
        sub = node(m, 'ShaderNodeVectorMath', _operation='DISTANCE')
        connect(m, co, sub.inputs[0])
        sub.inputs[1].default_value = (dx, dy, 0)
        st = node(m, 'ShaderNodeMath', _operation='LESS_THAN')
        st.inputs[1].default_value = 0.0007
        connect(m, sub.outputs['Value'], st.inputs[0])
        if holes is None:
            holes = st.outputs['Value']
        else:
            mx = node(m, 'ShaderNodeMath', _operation='MAXIMUM')
            connect(m, holes, mx.inputs[0])
            connect(m, st.outputs['Value'], mx.inputs[1])
            holes = mx.outputs['Value']
    inv = node(m, 'ShaderNodeMath', _operation='SUBTRACT')
    inv.inputs[0].default_value = 1.0
    connect(m, holes, inv.inputs[1])
    lib.add_bump(m, inv.outputs['Value'], strength=0.8, distance=0.0006)
    return m


# ---------------------------------------------------------------- polo ---
POLO_CREASES = [
    ((0.262, 0.150), (0.150, 0.075), 0.008, 0.0030),
    ((0.258, 0.115), (0.170, 0.010), 0.009, 0.0024),
    ((-0.262, 0.150), (-0.160, 0.085), 0.008, 0.0028),
    ((-0.258, 0.110), (-0.180, 0.020), 0.009, 0.0022),
    ((-0.150, 0.150), (0.020, -0.220), 0.034, 0.0016),
    ((0.120, -0.090), (0.230, -0.320), 0.030, 0.0015),
    ((-0.230, -0.200), (-0.060, -0.340), 0.028, 0.0014),
    ((0.040, 0.300), (0.170, 0.250), 0.012, 0.0012),
]
SLEEVE_LONG_CREASES = [
    ((0.33, 0.10), (0.36, -0.02), 0.010, 0.0025),
    ((0.35, -0.08), (0.39, -0.17), 0.010, 0.0022),
    ((0.37, -0.20), (0.41, -0.28), 0.009, 0.0020),
]


def polo_wrinkles(long_sleeve):
    def fn(x, y):
        p = Vector((x, y))
        z = 0.0016 * (1 + math.sin(9.0 * x + 4.0 * y + 0.6) * math.sin(7.0 * y - 3.0 * x + 1.1))
        z += 0.0008 * (1 + math.sin(17.0 * x - 11.0 * y))
        for a, b, w, h in POLO_CREASES:
            z += _crease(p, a, b, w, h)
        if long_sleeve:
            for a, b, w, h in SLEEVE_LONG_CREASES:
                z += _crease(p, a, b, w, h)
                z += _crease(p, (-a[0], a[1]), (-b[0], b[1]), w, h * 0.9)
        return z
    return fn


def polo_outline(long_sleeve):
    r = []
    r += bezier((0, 0.360), (0.06, 0.364), (0.098, 0.380), 10)       # back neck
    r += bezier((0.098, 0.380), (0.17, 0.364), (0.24, 0.342), 8)     # shoulder
    if long_sleeve:
        r += bezier((0.24, 0.342), (0.36, 0.10), (0.445, -0.285), 18)   # outer sleeve
        r += bezier((0.445, -0.285), (0.40, -0.300), (0.355, -0.300), 6)  # cuff
        r += bezier((0.355, -0.300), (0.30, -0.02), (0.266, 0.150), 16)   # inner sleeve to armpit
    else:
        r += bezier((0.24, 0.342), (0.33, 0.296), (0.405, 0.226), 10)   # sleeve top
        r += bezier((0.405, 0.226), (0.375, 0.170), (0.343, 0.118), 6)  # cuff
        r += bezier((0.343, 0.118), (0.288, 0.124), (0.266, 0.155), 8)  # under sleeve
    r += bezier((0.266, 0.150), (0.256, -0.12), (0.268, -0.372), 16)  # side
    r += bezier((0.268, -0.372), (0.13, -0.382), (0.0, -0.378), 12)   # hem
    return mirror(r)


def collar_outline():
    right_outer = [(0.0, 0.408), (0.06, 0.405), (0.104, 0.392), (0.122, 0.37), (0.11, 0.33), (0.088, 0.288), (0.058, 0.262)]
    right_inner = [(0.026, 0.262), (0.03, 0.29), (0.046, 0.33), (0.056, 0.355), (0.034, 0.369), (0.0, 0.373)]
    # outer edge left->right over the top, then down to the right tip, back up the inner (neck) edge
    left_outer = [(-x, y) for x, y in reversed(right_outer[1:])]
    left_inner = [(-x, y) for x, y in reversed(right_inner[:-1])]
    return left_outer + right_outer + right_inner + left_inner


def build_polo(long_sleeve=False):
    lib.reset()
    wr = polo_wrinkles(long_sleeve)
    scoop = bezier((-0.08, 0.378), (0.0, 0.25), (0.08, 0.378), 24) + [(0.08, 0.378), (0.08, 0.42), (-0.08, 0.42)]
    body = solid('polo', polo_outline(long_sleeve), -T / 2, T / 2, cut=scoop)
    grooves = [((-0.3, -0.352), (0.3, -0.352), [0.0, 0.006])]
    m_print = pique_material('print', grooves=grooves)
    m_body = pique_material('body', grooves=grooves)
    W, y0, H = 0.56, -0.40, 0.80
    body_print(body, m_print, m_body, W, y0, H)
    lift(body, wr)

    rib_h = rib_material('body_rib', angle=0.0)
    trims = []
    # collar: flat-knit, lying over the neckline
    collar = solid('collar', collar_outline(), TOP + 0.0002, TOP + 0.0038, voxel=0.0014, smooth_iter=4)
    collar_m = rib_material('body_collar', angle=math.pi / 2, scale=260.0)
    lib.assign(collar, collar_m)
    trims.append(collar)
    # the collar is folded fabric: a soft roll where it turns over at the neck
    inner = [(0.026, 0.262), (0.03, 0.29), (0.046, 0.33), (0.056, 0.355), (0.034, 0.369), (0.0, 0.373)]
    roll_pts = [(x, y, TOP + 0.0036) for x, y in inner] + [(-x, y, TOP + 0.0036) for x, y in reversed(inner[:-1])]
    roll = tube_curve('collar_roll', roll_pts, 0.0032, res=5)
    for v in roll.data.vertices:
        v.co.z = TOP + 0.0036 + (v.co.z - TOP - 0.0036) * 0.7
    lib.assign(roll, collar_m)
    trims.append(roll)
    # placket with two buttons
    placket = solid('placket', [(-0.017, 0.262), (0.017, 0.262), (0.017, 0.135), (-0.017, 0.135)], TOP + 0.0001, TOP + 0.0022,
                    voxel=0.0012, smooth_iter=3)
    lib.assign(placket, m_body)
    trims.append(placket)
    bm = button_material()
    for i, y in enumerate((0.235, 0.18)):
        trims.append(button(f'btn{i}', 0.0, y, TOP + 0.0024, mat=bm))
    # rib bands on the sleeve ends
    if long_sleeve:
        for s in (1, -1):
            q = band_quad((s * 0.445, -0.285), (s * 0.355, -0.300), 0.055, (-s * 0.18, 0.98))
            band = solid(f'cuff{s}', q, TOP + 0.0001, TOP + 0.0016, voxel=0.0014, smooth_iter=3)
            lib.assign(band, rib_material(f'body_cuff{s}', angle=-s * 0.19))
            trims.append(band)
    else:
        for s in (1, -1):
            a, b = Vector((s * 0.405, 0.226)), Vector((s * 0.343, 0.118))
            d = (b - a).normalized()
            inward = Vector((d.y, -d.x)) if s > 0 else Vector((-d.y, d.x))   # towards the shoulder
            q = band_quad(tuple(a), tuple(b), 0.028, tuple(inward))
            band = solid(f'cuff{s}', q, TOP + 0.0001, TOP + 0.0016, voxel=0.0014, smooth_iter=3)
            lib.assign(band, rib_material(f'body_cuff{s}', angle=math.atan2(inward.x, inward.y)))
            trims.append(band)
    for o in trims:
        lift(o, wr)
    studio(cam_y=-0.01 if long_sleeve else 0.012, cam_z=2.35 if long_sleeve else 2.25)
    ty = lambda y: (y - y0) / H
    tx = lambda x: (x + W / 2) / W
    return dict(
        tintable=True, print_aspect=W / H,
        default={'u': tx(0.115), 'v': ty(0.215), 'w': 0.16},
        extra={'presets': {
            'chest': {'u': tx(0.115), 'v': ty(0.215), 'w': 0.16},
            'center': {'u': 0.5, 'v': ty(0.06), 'w': 0.46},
            'big': {'u': 0.5, 'v': ty(-0.02), 'w': 0.66},
        }},
    )


# -------------------------------------------------------------- hoodie ---
HOODIE_CREASES = [
    ((0.29, 0.15), (0.17, 0.07), 0.010, 0.0030),
    ((-0.29, 0.15), (-0.17, 0.06), 0.010, 0.0028),
    ((0.36, 0.05), (0.38, -0.10), 0.011, 0.0026),
    ((-0.36, 0.05), (-0.38, -0.10), 0.011, 0.0025),
    ((0.40, -0.16), (0.43, -0.25), 0.010, 0.0022),
    ((-0.40, -0.16), (-0.43, -0.25), 0.010, 0.0022),
    ((-0.16, 0.10), (0.05, -0.05), 0.04, 0.0016),
    ((0.12, 0.20), (0.22, 0.10), 0.02, 0.0014),
]


def hoodie_wrinkles(x, y):
    p = Vector((x, y))
    z = 0.0018 * (1 + math.sin(8.0 * x + 4.0 * y + 0.6) * math.sin(6.0 * y - 3.0 * x + 1.1))
    for a, b, w, h in HOODIE_CREASES:
        z += _crease(p, a, b, w, h)
    return z


def hoodie_outline():
    r = []
    r += bezier((0, 0.352), (0.07, 0.36), (0.11, 0.376), 10)
    r += bezier((0.11, 0.376), (0.2, 0.36), (0.285, 0.33), 8)         # dropped shoulder
    r += bezier((0.285, 0.33), (0.40, 0.08), (0.47, -0.25), 18)       # outer sleeve
    r += bezier((0.47, -0.25), (0.43, -0.27), (0.385, -0.272), 6)     # cuff edge
    r += bezier((0.385, -0.272), (0.32, -0.05), (0.292, 0.125), 16)   # inner sleeve
    r += bezier((0.292, 0.125), (0.285, -0.10), (0.29, -0.335), 14)   # side
    r += bezier((0.29, -0.335), (0.14, -0.345), (0.0, -0.342), 12)    # hem (rib band goes on top)
    return mirror(r)


def build_hoodie():
    lib.reset()
    neck = bezier((-0.105, 0.39), (0.0, 0.25), (0.105, 0.39), 24) + [(0.105, 0.39), (0.105, 0.42), (-0.105, 0.42)]
    body = solid('hoodie', hoodie_outline(), -T / 2 - 0.001, T / 2, cut=neck)
    m_print = fleece_material('print')
    m_body = fleece_material('body')
    W, y0, H = 0.58, -0.36, 0.74
    body_print(body, m_print, m_body, W, y0, H)
    lift(body, hoodie_wrinkles)
    trims = []
    # hood lying back behind the shoulders: we see its outer shell, with a centre seam
    hood_out = bezier((-0.13, 0.37), (-0.22, 0.63), (0.0, 0.655), 18) + bezier((0.0, 0.655), (0.22, 0.63), (0.13, 0.37), 18) + \
        bezier((0.13, 0.37), (0.0, 0.34), (-0.13, 0.37), 10)
    hood = solid('hood', hood_out, -T / 2 - 0.0005, T / 2 - 0.0012, voxel=0.0022)
    hood_m = fleece_material('body_hood', grooves=[((0.0, 0.40), (0.0, 0.66), [0.0])])
    lib.assign(hood, hood_m)
    trims.append(hood)
    # neckline: the hood's front edges meet in a soft U, the inside shows a little lining
    neck_cut = bezier((-0.105, 0.39), (0.0, 0.25), (0.105, 0.39), 24) + [(0.105, 0.39), (0.105, 0.42), (-0.105, 0.42)]
    lining = solid('lining', neck_cut[:-2] + [(0.105, 0.39)], -T / 2, -T / 2 + 0.002, voxel=0.0016, smooth_iter=3)
    lib.assign(lining, fleece_material('lining', color=(0.8, 0.8, 0.79)))
    trims.append(lining)
    rim_pts = [(x, y, TOP + 0.0025) for x, y in bezier((-0.112, 0.385), (0.0, 0.245), (0.112, 0.385), 24)] + [(0.112, 0.385, TOP + 0.0025)]
    rim = tube_curve('rim', rim_pts, 0.0075, res=6)
    for v in rim.data.vertices:
        v.co.z = TOP + 0.0025 + (v.co.z - TOP - 0.0025) * 0.6
    lib.assign(rim, hood_m)
    trims.append(rim)
    # drawstrings with metal tips
    cord_m = principled('cord', color=(0.88, 0.87, 0.85), rough=0.8, sheen=0.4)
    tip_m = principled('aglet', color=(0.85, 0.85, 0.86), rough=0.2, metallic=1.0)
    for s in (1, -1):
        pts = [(s * 0.045, 0.30, TOP + 0.007), (s * 0.048, 0.25, TOP + 0.004), (s * 0.052, 0.17, TOP + 0.003), (s * 0.046, 0.10, TOP + 0.003)]
        cord = tube_curve(f'cord{s}', pts, 0.0028, res=4)
        lib.assign(cord, cord_m)
        trims.append(cord)
        tip = tube_curve(f'tip{s}', [(s * 0.045, 0.10, TOP + 0.003), (s * 0.044, 0.078, TOP + 0.003)], 0.0031, res=4)
        lib.assign(tip, tip_m)
        trims.append(tip)
        eye = tube_curve(f'eye{s}', [(s * 0.045 + 0.0055 * math.cos(a), 0.302 + 0.0055 * math.sin(a), TOP + 0.0068)
                                     for a in [i * 2 * math.pi / 16 for i in range(17)]], 0.0012, res=3)
        lib.assign(eye, tip_m)
        trims.append(eye)
    # kangaroo pocket
    pocket = [(-0.17, -0.07)] + bezier((0.17, -0.07), (0.17, -0.20), (0.205, -0.29), 8) + [(0.205, -0.29)] + \
        bezier((-0.205, -0.29), (-0.17, -0.20), (-0.17, -0.07), 8)
    pk = solid('pocket', pocket, TOP + 0.0001, TOP + 0.0028, voxel=0.0016, smooth_iter=4)
    lib.assign(pk, fleece_material('body_pocket', grooves=[((-0.165, -0.078), (0.165, -0.078), [0.0])]))
    trims.append(pk)
    # rib waistband and cuffs
    wb = solid('waist', [(-0.29, -0.335), (0.29, -0.335), (0.29, -0.395), (-0.29, -0.395)], -T / 2, TOP + 0.0012, voxel=0.0018, smooth_iter=4)
    lib.assign(wb, rib_material('body_waist', angle=0.0))
    trims.append(wb)
    for s in (1, -1):
        q = band_quad((s * 0.47, -0.25), (s * 0.385, -0.272), 0.065, (s * 0.25, -0.97))
        cuff = solid(f'cuff{s}', q, -T / 2, TOP + 0.0012, voxel=0.0018, smooth_iter=4)
        lib.assign(cuff, rib_material(f'body_cuff{s}', angle=-s * 0.25))
        trims.append(cuff)
    for o in trims:
        lift(o, hoodie_wrinkles)
    studio(cam_y=0.12, cam_z=2.55)
    ty = lambda y: (y - y0) / H
    tx = lambda x: (x + W / 2) / W
    return dict(
        tintable=True, print_aspect=W / H,
        default={'u': 0.5, 'v': ty(0.10), 'w': 0.48},
        extra={'presets': {
            'center': {'u': 0.5, 'v': ty(0.10), 'w': 0.48},
            'chest': {'u': tx(0.115), 'v': ty(0.215), 'w': 0.16},
            'big': {'u': 0.5, 'v': ty(0.08), 'w': 0.62},
        }},
    )


SCENES = {
    'polo': lambda: build_polo(False),
    'polo_ls': lambda: build_polo(True),
    'hoodie': build_hoodie,
}
