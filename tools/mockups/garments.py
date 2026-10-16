"""Shared garment helpers (solids, rib knit, buttons) used by the accessories scenes."""
import math

import bpy
from mathutils import Vector

import lib
from lib import connect, node, principled
from products import backdrop_paper, knit_height, line_groove, prism, sum_sockets, textured_albedo

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


# polo and hoodie live in flat_garments.py (2.5D height-field build)


SCENES = {}
