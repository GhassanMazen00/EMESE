"""Long-sleeve polo as a 3D "ghost mannequin" shot (front view, hollow, floating).

The body is one smooth surface: a torso with boxy rounded cross-sections and two
sleeves (round cones through shoulder, elbow, wrist and cuff) blended with a smooth
minimum, so shoulders and armpits come out like cut-and-sewn fabric. It is meshed
with marching cubes, folds are pushed along the normals, the neck, hem and cuffs are
opened and the shell gets a fabric thickness, so the inside shows through the neck.
The folded flat-knit collar, the button placket and the buttons are separate pieces.
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from scipy import ndimage
from skimage.measure import marching_cubes

import lib
from lib import connect, node, principled
from products import sum_sockets, sweep, textured_albedo

WHITE = (0.86, 0.86, 0.85)
H = 0.0025                                   # voxel size (m)

# sleeve skeleton (right sleeve; the left one is mirrored): point, radius
SLEEVE = [((0.198, 0.000, 0.640), 0.067),    # armhole, under the shoulder
          ((0.287, -0.008, 0.345), 0.054),   # elbow
          ((0.316, -0.016, 0.112), 0.046),   # wrist, where the cuff is sewn on
          ((0.320, -0.018, 0.045), 0.0405)]  # cuff end
CUFF_T = 0.905                               # along the sleeve, where the rib cuff starts
NECK = {'cx': 0.0, 'cy': 0.014, 'a': 0.072, 'b': 0.066, 'z_front': 0.737, 'z_back': 0.776}


# ------------------------------------------------------------------ SDF ---
def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def round_cone(px, py, pz, a, b, r1, r2):
    """Exact SDF of a cone with spherical caps (Inigo Quilez)."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    ba = b - a
    l2 = ba @ ba
    rr = r1 - r2
    a2 = l2 - rr * rr
    il2 = 1.0 / l2
    pax, pay, paz = px - a[0], py - a[1], pz - a[2]
    y = pax * ba[0] + pay * ba[1] + paz * ba[2]
    z = y - l2
    qx, qy, qz = pax * l2 - ba[0] * y, pay * l2 - ba[1] * y, paz * l2 - ba[2] * y
    x2 = qx * qx + qy * qy + qz * qz
    y2 = y * y * l2
    z2 = z * z * l2
    k = np.sign(rr) * rr * rr * x2
    d3 = (np.sqrt(np.maximum(x2 * a2 * il2, 0)) + y * rr) * il2 - r1
    d1 = np.sqrt(x2 + z2) * il2 - r2
    d2 = np.sqrt(x2 + y2) * il2 - r1
    return np.where(np.sign(z) * a2 * z2 > k, d1, np.where(np.sign(y) * a2 * y2 < k, d2, d3))


def torso_sdf(x, y, z):
    a = np.interp(z, [-0.1, 0.0, 0.25, 0.48, 0.62, 0.8], [0.219, 0.219, 0.212, 0.218, 0.214, 0.20])
    b = np.interp(z, [-0.1, 0.0, 0.25, 0.48, 0.62, 0.8], [0.108, 0.108, 0.102, 0.114, 0.108, 0.088])
    p = 2.5
    q = (np.abs(x) / a) ** p + (np.abs(y + 0.004) / b) ** p
    side = (q ** (1 / p) - 1) * np.minimum(a, b) * 1.05
    ax = np.sqrt((np.abs(x) - 0.07) ** 2 + 0.0004) - 0.02     # soft |x| - 0.07
    ztop = 0.776 - 0.30 * np.maximum(ax, 0) - 0.35 * np.maximum(np.abs(y + 0.01) - 0.03, 0) ** 1.6
    ztop = ztop - 0.036 * np.exp(-((x / 0.07) ** 2 + ((y + 0.07) / 0.05) ** 2))     # front neck scoop
    top = z - ztop
    return smax(side, top, 0.05)


def sleeve_sdf(x, y, z):
    xs = np.abs(x)                      # both sleeves at once
    d = None
    for (p0, r0), (p1, r1) in zip(SLEEVE[:-1], SLEEVE[1:]):
        dd = round_cone(xs, y, z, p0, p1, r0, r1)
        d = dd if d is None else smin(d, dd, 0.012)
    return d


def garment_sdf(x, y, z):
    t = torso_sdf(x, y, z)
    s = sleeve_sdf(x, y, z)
    return smin(t, s, 0.022), t, s


# --------------------------------------------------------------- folds ---
def smooth_noise(shape, cell, seed):
    rng = np.random.default_rng(seed)
    return ndimage.gaussian_filter(rng.standard_normal(shape), cell)


def sleeve_coords(v):
    """For each vertex: (t along the sleeve 0..1, angle around it, sleeve weight helper)."""
    xs = np.abs(v[:, 0])
    pts = np.array([p for p, _ in SLEEVE])
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    cum = np.concatenate([[0], np.cumsum(seg)])
    best = np.full(len(v), np.inf)
    t = np.zeros(len(v))
    ang = np.zeros(len(v))
    q = np.stack([xs, v[:, 1], v[:, 2]], 1)
    for i in range(len(seg)):
        a, b = pts[i], pts[i + 1]
        ab = b - a
        s = np.clip(((q - a) @ ab) / (ab @ ab), 0, 1)
        c = a + s[:, None] * ab
        d = np.linalg.norm(q - c, axis=1)
        upd = d < best
        best[upd] = d[upd]
        t[upd] = ((cum[i] + s * seg[i]) / cum[-1])[upd]
        rel = q - c
        ang[upd] = np.arctan2(rel[:, 1], rel[:, 0])[upd]   # 0 = outward, -pi/2 = front
    return t, ang, cum[-1]


def ridge(px, pz, a, b, w):
    a, b = np.array(a), np.array(b)
    ab = b - a
    s = np.clip(((px - a[0]) * ab[0] + (pz - a[1]) * ab[1]) / (ab @ ab), 0, 1)
    d = np.hypot(px - (a[0] + s * ab[0]), pz - (a[1] + s * ab[1]))
    return np.exp(-(d / w) ** 2) * np.sin(np.pi * s) ** 0.7


def fold_field(v, ws):
    """Displacement (m) along the normal: torso drape and drag lines, sleeve bunching."""
    x, y, z = v[:, 0], v[:, 1], v[:, 2]
    rng = np.random.default_rng(4)
    # torso: long soft vertical folds, stronger towards the hem; armpit drag lines on the front
    ph = rng.uniform(0, 6.28, 4)
    vert = (np.sin(x * 34 + 2.2 * np.sin(z * 5 + ph[0]) + ph[1]) * 0.6 +
            np.sin(x * 61 + 1.7 * np.sin(z * 7 + ph[2]) + ph[3]) * 0.4)
    drape = vert * (0.0016 + 0.0030 * np.clip((0.55 - z) / 0.55, 0, 1))
    front = np.clip(-y / 0.06, 0, 1)
    drag = np.zeros_like(x)
    for s in (1, -1):
        drag += 0.0052 * ridge(x, z, (s * 0.205, 0.545), (s * 0.075, 0.405), 0.011)
        drag += 0.0038 * ridge(x, z, (s * 0.212, 0.505), (s * 0.110, 0.300), 0.012)
        drag += 0.0028 * ridge(x, z, (s * 0.215, 0.470), (s * 0.150, 0.230), 0.010)
        drag -= 0.0024 * ridge(x, z, (s * 0.200, 0.525), (s * 0.090, 0.375), 0.016)   # the valley beside it
    torso = drape + drag * front
    # hem: a gentle wave
    torso += 0.0016 * np.sin(x * 40 + 0.5) * np.exp(-(z / 0.05) ** 2)

    # sleeves: a few soft tilted folds at the elbow, small bunching above the cuff, long folds between
    t, ang, L = sleeve_coords(v)
    sx = np.sign(x)
    a2 = ang * sx                                     # mirror so both sleeves fold alike
    along = t * L
    folds = [  # (position along 0..1, tilt, amplitude, width m, favoured side)
        (0.30, 0.55, 0.0032, 0.010, 0.4), (0.41, -0.35, 0.0044, 0.011, -0.5), (0.50, 0.45, 0.0040, 0.010, 2.6),
        (0.58, -0.25, 0.0030, 0.009, 1.2), (0.70, 0.35, 0.0024, 0.008, -2.0), (0.76, 0.30, 0.0030, 0.006, 0.2),
        (0.81, -0.40, 0.0034, 0.006, 2.2), (0.855, 0.20, 0.0030, 0.005, -1.0),
    ]
    sleeve = np.zeros_like(x)
    r_loc = 0.055
    for pos, tilt, amp, w, side in folds:
        dz = along - pos * L - np.tan(tilt) * r_loc * np.cos(a2 - side)
        reach = 0.55 + 0.45 * np.cos(a2 - side)        # strongest on one side, fading round the back
        sleeve += amp * np.exp(-(dz / w) ** 2) * reach - 0.35 * amp * np.exp(-((dz - 1.6 * w) / w) ** 2) * reach
    sleeve += np.sin(a2 * 2 + t * 6 + 0.7) * 0.0010 * np.clip(t / 0.3, 0, 1)
    under = np.exp(-((np.abs(a2) - math.pi) / 0.5) ** 2) * np.exp(-((t - 0.10) / 0.08) ** 2) * 0.003
    sleeve += under * np.sin(along / 0.012)
    sleeve = np.where(t > CUFF_T - 0.01, 0.0, sleeve)
    return torso * (1 - ws) + sleeve * ws


# ---------------------------------------------------------------- mesh ---
def build_shell():
    xs = np.arange(-0.43, 0.43, H)
    ys = np.arange(-0.17, 0.17, H)
    zs = np.arange(-0.04, 0.83, H)
    X, Y, Z = np.meshgrid(xs, ys, zs, indexing='ij')
    F, _, _ = garment_sdf(X, Y, Z)
    del X, Y, Z
    verts, faces, normals, _ = marching_cubes(F.astype(np.float32), level=0.0, spacing=(H, H, H))
    verts += np.array([xs[0], ys[0], zs[0]])
    # normals from the SDF gradient, outward
    _, ft, fs = garment_sdf(verts[:, 0], verts[:, 1], verts[:, 2])
    ws = 1 / (1 + np.exp(-(ft - fs) / 0.006))           # 1 on the sleeves
    e = 0.0008
    g = np.stack([garment_sdf(verts[:, 0] + e * (i == 0), verts[:, 1] + e * (i == 1), verts[:, 2] + e * (i == 2))[0]
                  for i in range(3)], 1) - garment_sdf(verts[:, 0], verts[:, 1], verts[:, 2])[0][:, None]
    n = g / (np.linalg.norm(g, axis=1, keepdims=True) + 1e-12)
    verts = verts + n * fold_field(verts, ws)[:, None]
    return verts, faces, ft, fs, ws


def open_shell(verts, faces):
    """Faces to keep: everything but the neck opening (hem and cuffs are cut with planes later)."""
    tri = verts[faces]
    c = tri.mean(axis=1)
    x, y, z = c[:, 0], c[:, 1], c[:, 2]
    fn = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    up = np.abs(fn[:, 2]) / (np.linalg.norm(fn, axis=1) + 1e-12)     # winding may be either way here
    nk = NECK
    zn = nk['z_front'] + (nk['z_back'] - nk['z_front']) * np.clip((y - nk['cy'] + nk['b']) / (2 * nk['b']), 0, 1)
    inside = ((x - nk['cx']) / nk['a']) ** 2 + ((y - nk['cy']) / nk['b']) ** 2 < 1
    # only the top of the shoulders goes: the back wall stays, so nothing shows through behind the collar
    neck = inside & (z > zn - 0.03) & (up > 0.55)
    return ~neck


def shirt_object(verts, faces, keep):
    faces = faces[keep]
    # outward winding: compare face normals with the SDF gradient direction (away from the body)
    tri = verts[faces]
    fn = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    c = tri.mean(axis=1)
    e = 0.001
    d0 = garment_sdf(c[:, 0], c[:, 1], c[:, 2])[0]
    g = np.stack([garment_sdf(c[:, 0] + e * (i == 0), c[:, 1] + e * (i == 1), c[:, 2] + e * (i == 2))[0] - d0
                  for i in range(3)], 1)
    if np.mean(np.sum(fn * g, axis=1)) < 0:
        faces = faces[:, ::-1]
    used = np.unique(faces)
    remap = np.full(len(verts), -1, np.int64)
    remap[used] = np.arange(len(used))
    faces = remap[faces]
    v = verts[used].astype(np.float32)
    me = bpy.data.meshes.new('shirt')
    me.vertices.add(len(v))
    me.vertices.foreach_set('co', v.ravel())
    me.loops.add(faces.size)
    me.loops.foreach_set('vertex_index', faces.ravel().astype(np.int32))
    me.polygons.add(len(faces))
    me.polygons.foreach_set('loop_start', (np.arange(len(faces)) * 3).astype(np.int32))
    me.polygons.foreach_set('use_smooth', np.ones(len(faces), bool))
    me.update(calc_edges=True)
    me.validate()
    # clean straight openings: cut the cuffs and the hem with planes (only near each opening)
    bm = bmesh.new()
    bm.from_mesh(me)
    p2, p3 = Vector(SLEEVE[-2][0]), Vector(SLEEVE[-1][0])
    for s in (1, -1):
        a, b = Vector((s * p2.x, p2.y, p2.z)), Vector((s * p3.x, p3.y, p3.z))
        ax = (b - a).normalized()
        region = [f for f in bm.faces if (f.calc_center_median() - b).length < 0.10]
        geom = list({v for f in region for v in f.verts}) + list({e for f in region for e in f.edges}) + region
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=b - ax * 0.001, plane_no=ax, clear_outer=True)
    region = [f for f in bm.faces if abs(f.calc_center_median().x) < 0.25 and f.calc_center_median().z < 0.06]
    geom = list({v for f in region for v in f.verts}) + list({e for f in region for e in f.edges}) + region
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, 0.0), plane_no=(0, 0, -1), clear_outer=True)
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = True
    return lib.link(bpy.data.objects.new('shirt', me))


# ----------------------------------------------------------- materials ---
def pique(name, color=WHITE, rib=False):
    m = principled(name, color=color, rough=0.9, sheen=0.45, sheen_rough=0.5, spec=0.3)
    co = lib.tex_coord(m)
    if rib:
        wave = node(m, 'ShaderNodeTexWave', _wave_type='BANDS', _bands_direction='X', Scale=230.0, Distortion=0.3)
        connect(m, co, wave.inputs['Vector'])
        fine = lib.noise(m, co, 600.0, detail=2)
        tex = sum_sockets(m, [wave.outputs['Fac'], fine.outputs['Fac']], [0.8, 0.2])
        textured_albedo(m, color, tex, amount=0.08)
        lib.add_bump(m, tex, strength=0.5, distance=0.0008)
        return m, co
    vor = node(m, 'ShaderNodeTexVoronoi', Scale=900.0, _feature='SMOOTH_F1')
    connect(m, co, vor.inputs['Vector'])
    slub = lib.noise(m, co, 160.0, detail=4, rough=0.6)
    soft = lib.noise(m, co, 22.0, detail=3)
    tex = sum_sockets(m, [vor.outputs['Distance'], slub.outputs['Fac'], soft.outputs['Fac']], [0.55, 0.3, 0.3])
    textured_albedo(m, color, tex, amount=0.05)
    lib.add_bump(m, tex, strength=0.22, distance=0.0008)
    return m, co


def add_seams(m, co, attr='seam'):
    """Seam grooves from a per-vertex attribute (1 on the seam line) + hem/cuff stitching by height."""
    p = m.node_tree.nodes['Principled BSDF']
    prev = p.inputs['Normal'].links[0].from_socket if p.inputs['Normal'].links else None
    at = node(m, 'ShaderNodeAttribute')
    at.attribute_name = attr
    sep = node(m, 'ShaderNodeSeparateXYZ')
    connect(m, co, sep.inputs['Vector'])
    # twin needle hem stitching 18 and 24 mm above the hem
    rows = None
    for zr in (0.018, 0.024):
        sub = node(m, 'ShaderNodeMath', _operation='SUBTRACT')
        sub.inputs[1].default_value = zr
        connect(m, sep.outputs['Z'], sub.inputs[0])
        ab = node(m, 'ShaderNodeMath', _operation='ABSOLUTE')
        connect(m, sub.outputs['Value'], ab.inputs[0])
        mr = node(m, 'ShaderNodeMapRange', _interpolation_type='SMOOTHSTEP', **{'From Min': 0.0, 'From Max': 0.0006, 'To Min': -1.0, 'To Max': 0.0})
        connect(m, ab.outputs['Value'], mr.inputs['Value'])
        if rows is None:
            rows = mr.outputs['Result']
        else:
            add = node(m, 'ShaderNodeMath', _operation='ADD')
            connect(m, rows, add.inputs[0])
            connect(m, mr.outputs['Result'], add.inputs[1])
            rows = add.outputs['Value']
    neg = node(m, 'ShaderNodeMath', _operation='MULTIPLY')
    neg.inputs[1].default_value = -1.0
    connect(m, at.outputs['Fac'], neg.inputs[0])
    tot = node(m, 'ShaderNodeMath', _operation='ADD')
    connect(m, neg.outputs['Value'], tot.inputs[0])
    connect(m, rows, tot.inputs[1])
    b = node(m, 'ShaderNodeBump', Strength=0.6, Distance=0.0008)
    connect(m, tot.outputs['Value'], b.inputs['Height'])
    if prev is not None:
        connect(m, prev, b.inputs['Normal'])
    connect(m, b.outputs['Normal'], p.inputs['Normal'])


def button_mat():
    return principled('button', color=(0.9, 0.89, 0.86), rough=0.3, spec=0.5, coat=0.5)


# --------------------------------------------------------------- pieces ---
def surface_point(x, z, y0=-0.3, out=0.0, bvh=None):
    """Where a ray from the front along +y meets the shirt (the folded mesh when `bvh` is given)."""
    if bvh is not None:
        hit = bvh.ray_cast(Vector((x, y0, z)), Vector((0, 1, 0)))
        if hit[0] is not None:
            return hit[0] - Vector((0, out, 0)), hit[1]
    y = y0
    for _ in range(80):
        d = garment_sdf(np.array([x]), np.array([y]), np.array([z]))[0][0]
        if d < 1e-4:
            break
        y += d * 0.9
    return Vector((x, y - out, z)), Vector((0, -1, 0))


def build_collar():
    """Folded flat-knit collar: a stand around the neck and a fall that turns down over it."""
    nk = NECK
    A0 = math.radians(11)              # gap at the front: the collar leaves meet above the placket
    NA, NS = 160, 40
    bm = bmesh.new()
    rows = []
    for i in range(NA + 1):
        al = A0 + (2 * math.pi - 2 * A0) * i / NA
        # point on the neckline ellipse (al = 0 is centre front)
        bx, by = nk['a'] * math.sin(al), nk['cy'] - nk['b'] * math.cos(al)
        back = (1 - math.cos(al)) / 2                     # 0 front .. 1 back
        bz = nk['z_front'] + (nk['z_back'] - nk['z_front']) * back - 0.026
        rad = Vector((math.sin(al) / nk['a'], -math.cos(al) / nk['b'], 0)).normalized()
        frontness = math.cos(al) ** 2 if math.cos(al) > 0 else 0.0
        h = 0.030 + 0.004 * back + 0.022                  # stand height (the lowest 22 mm sit inside the neck)
        w = 0.046 + 0.024 * frontness ** 3                # fall reaches further at the points
        drop = 0.030 + 0.032 * frontness ** 3
        base = Vector((bx, by, bz))
        row = []
        for j in range(NS + 1):
            s = j / NS
            if s < 0.42:                                  # stand, leaning in a little
                k = s / 0.42
                p = base + Vector((0, 0, h * k)) - rad * (0.004 * k)
            elif s < 0.52:                                # the fold
                k = (s - 0.42) / 0.10
                a = math.pi * k
                c = base + Vector((0, 0, h)) - rad * 0.004 + rad * 0.0032
                p = c - rad * (0.0032 * math.cos(a)) + Vector((0, 0, 0.0032 * math.sin(a)))
            else:                                         # the fall, out and down onto the shoulders
                k = (s - 0.52) / 0.48
                top = base + Vector((0, 0, h)) + rad * 0.0024
                edge = base + rad * w + Vector((0, 0, h - drop))
                mid = (top + edge) / 2 + rad * 0.010 + Vector((0, 0, 0.006))
                p = top * (1 - k) ** 2 + mid * 2 * k * (1 - k) + edge * k * k
            row.append(bm.verts.new(p))
        rows.append(row)
    for i in range(NA):
        for j in range(NS):
            bm.faces.new((rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]))
    obj = lib.mesh_object('collar', bm)
    # keep the fall off the shirt: push any point that sinks in back out to 3 mm above it
    me = obj.data
    co = np.array([v.co[:] for v in me.vertices])
    d, _, _ = garment_sdf(co[:, 0], co[:, 1], co[:, 2])
    e = 0.0008
    g = np.stack([garment_sdf(co[:, 0] + e * (k == 0), co[:, 1] + e * (k == 1), co[:, 2] + e * (k == 2))[0]
                  for k in range(3)], 1) - d[:, None]
    g /= np.linalg.norm(g, axis=1, keepdims=True) + 1e-12
    push = np.clip(0.0045 - d, 0, None)
    stand = np.arange(len(co)) % (NS + 1) < int(0.52 * NS)
    push[stand] = 0
    co = co + g * push[:, None]
    for v, c in zip(me.vertices, co):
        v.co = c
    sol = obj.modifiers.new('sol', 'SOLIDIFY')
    sol.thickness = 0.0024
    sol.offset = 0
    sub = obj.modifiers.new('sub', 'SUBSURF')
    sub.levels = 1
    lib.apply_modifiers(obj)
    lib.smooth(obj)
    return obj


def build_placket(bvh):
    """Three-button placket on the chest, lying on the folded shirt front."""
    zt, zb, w = 0.768, 0.590, 0.0150         # the top runs up behind the collar ends
    NX, NZ = 10, 50
    bm = bmesh.new()
    grid = []
    for j in range(NZ + 1):
        z = zb + (zt - zb) * j / NZ
        row = []
        for i in range(NX + 1):
            x = -w + 2 * w * i / NX
            p, _ = surface_point(x, z, bvh=bvh)
            edge = min(i, NX - i) / (NX / 2)
            p.y -= 0.0004 + 0.0008 * min(edge * 2.5, 1)    # edges roll into the shirt
            row.append(bm.verts.new(p))
        grid.append(row)
    for j in range(NZ):
        for i in range(NX):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    obj = lib.mesh_object('placket', bm)
    sol = obj.modifiers.new('sol', 'SOLIDIFY')
    sol.thickness = 0.0012
    sol.offset = 1
    lib.apply_modifiers(obj)
    lib.smooth(obj)
    buttons = []
    for k, z in enumerate((0.722, 0.680, 0.638)):
        p, n = surface_point(0.0, z, bvh=bvh)
        prof = [(0.0, 0.0010), (0.0022, 0.0009), (0.0033, 0.0012), (0.0045, 0.0018), (0.0052, 0.0016),
                (0.0055, 0.0008), (0.0053, 0.0), (0.0, 0.0)]
        bmb = bmesh.new()
        vs = [bmb.verts.new((r, 0, h)) for r, h in prof]
        es = [bmb.edges.new((vs[i], vs[i + 1])) for i in range(len(vs) - 1)]
        bmesh.ops.spin(bmb, geom=vs + es, cent=(0, 0, 0), axis=(0, 0, 1), angle=2 * math.pi, steps=40, use_merge=True)
        bmesh.ops.remove_doubles(bmb, verts=bmb.verts, dist=1e-7)
        b = lib.mesh_object(f'button{k}', bmb)
        nn = Vector(n).normalized() if n is not None else Vector((0, -1, 0))
        b.rotation_euler = nn.to_track_quat('Z', 'Y').to_euler()
        b.location = p + nn * 0.0013
        lib.smooth(b)
        buttons.append(b)
    return obj, buttons


# ---------------------------------------------------------------- scene ---
def build_polo_ls():
    lib.reset()
    verts, faces, ft, fs, ws = build_shell()
    keep = open_shell(verts, faces)
    shirt = shirt_object(verts, faces, keep)
    me = shirt.data
    co = np.array([v.co[:] for v in me.vertices])
    _, ft, fs = garment_sdf(co[:, 0], co[:, 1], co[:, 2])
    ws = 1 / (1 + np.exp(-(ft - fs) / 0.006))
    t, ang, L = sleeve_coords(co)
    # seams: armhole (where torso and sleeve meet), shoulder line, cuff join
    seam = np.exp(-((ft - fs) / 0.0016) ** 2) * (co[:, 2] > 0.40)
    shoulder = np.exp(-((co[:, 1] - 0.004) / 0.0018) ** 2) * (co[:, 2] > 0.70) * (np.abs(co[:, 0]) > 0.085) * (ws < 0.5)
    cuffseam = np.exp(-((t - CUFF_T) * L / 0.0018) ** 2) * (ws > 0.5)
    sv = np.clip(seam + shoulder + cuffseam, 0, 1)
    attr = me.attributes.new('seam', 'FLOAT', 'POINT')
    attr.data.foreach_set('value', sv.astype(np.float32))

    m_print, co_p = pique('print')
    m_body, co_b = pique('body')
    m_rib, _ = pique('body_rib', rib=True)
    m_in, _ = pique('body_inside', color=(0.62, 0.62, 0.61))
    for m, c in ((m_print, co_p), (m_body, co_b)):
        add_seams(m, c)
    for m in (m_print, m_body, m_rib, m_in):            # slots only: clearing would wipe face indices
        me.materials.append(m)
    # faces: front torso prints, sleeves and back are body, cuffs are rib
    n_p = len(me.polygons)
    pc = np.empty(n_p * 3, np.float32)
    me.polygons.foreach_get('center', pc)
    pc = pc.reshape(-1, 3)
    pn = np.empty(n_p * 3, np.float32)
    me.polygons.foreach_get('normal', pn)
    pn = pn.reshape(-1, 3)
    _, a_t, a_s = garment_sdf(pc[:, 0], pc[:, 1], pc[:, 2])
    tt = sleeve_coords(pc)[0]
    mi = np.where(a_s < a_t, np.where(tt > CUFF_T, 2, 1), np.where((pc[:, 1] < 0.02) & (pn[:, 1] < 0.25), 0, 1))
    me.polygons.foreach_set('material_index', mi.astype(np.int32))
    W, Hh, z0 = 0.56, 0.80, -0.02
    R = 0.20
    uvl = me.uv_layers.new(name='PrintUV')
    vi = np.empty(len(me.loops), np.int32)
    me.loops.foreach_get('vertex_index', vi)
    lv = co[vi]
    ang_ = np.arctan2(lv[:, 0], -(lv[:, 1] - 0.06))
    uv = np.stack([(ang_ * R + W / 2) / W, (lv[:, 2] - z0) / Hh], 1).astype(np.float32)
    uvl.data.foreach_set('uv', uv.ravel())
    from mathutils.bvhtree import BVHTree
    bvh = BVHTree.FromObject(shirt, bpy.context.evaluated_depsgraph_get())
    placket, buttons = build_placket(bvh)
    sol = shirt.modifiers.new('sol', 'SOLIDIFY')
    sol.thickness = 0.0024
    sol.offset = -1
    sol.material_offset = 3                  # inside of the shell uses the 4th slot
    sol.material_offset_rim = 1
    lib.apply_modifiers(shirt)
    lib.smooth(shirt)

    collar = build_collar()
    m_col, _ = pique('body_collar')
    m_col_in, _ = pique('body_collar_in', color=(0.62, 0.62, 0.61))
    collar.data.materials.append(m_col)
    collar.data.materials.append(m_col_in)
    # the side of the collar facing the neck sits in the shirt's shade
    cm = collar.data
    n_c = len(cm.polygons)
    cc = np.empty(n_c * 3, np.float32)
    cm.polygons.foreach_get('center', cc)
    cn = np.empty(n_c * 3, np.float32)
    cm.polygons.foreach_get('normal', cn)
    cc, cn = cc.reshape(-1, 3), cn.reshape(-1, 3)
    radial = np.stack([cc[:, 0] - NECK['cx'], cc[:, 1] - NECK['cy'], np.zeros(n_c)], 1)
    radial /= np.linalg.norm(radial, axis=1, keepdims=True) + 1e-9
    inner = (np.sum(radial * cn, axis=1) < -0.35)
    cm.polygons.foreach_set('material_index', inner.astype(np.int32))
    lib.assign(placket, m_body)
    bmat = button_mat()
    for b in buttons:
        lib.assign(b, bmat)

    # set: float the shirt above the sweep, studio light from the left like the other shots
    for o in [shirt, collar, placket] + buttons:
        o.location.z += 0.14
    sweep(color=(0.66, 0.645, 0.62), radius=0.8, depth=4.0, height=3.0, width=8).location = (0, 0.75, 0)
    lib.world_color((1.0, 0.985, 0.965), 0.05)
    lib.area_light((-2.2, -2.0, 2.0), (0, 0, 0.55), 58, 2.0, color=(1.0, 0.972, 0.94))
    lib.area_light((2.4, -2.2, 1.2), (0, 0, 0.55), 7, 2.4, color=(0.94, 0.96, 1.0))
    lib.area_light((0.0, 1.2, 2.4), (0, 0, 0.6), 18, 1.2, color=(1.0, 0.98, 0.96))
    lib.camera((0.0, -3.6, 0.84), (0.0, 0.0, 0.56), lens=118)
    ty = lambda z: (z - z0) / Hh
    return dict(tintable=True, print_aspect=W / Hh, spec_blur=6.0,
                default={'u': 0.5 + 0.105 / W, 'v': ty(0.665), 'w': 0.16},
                extra={'presets': {'chest': {'u': 0.5 + 0.105 / W, 'v': ty(0.665), 'w': 0.16},
                                   'center': {'u': 0.5, 'v': ty(0.50), 'w': 0.42},
                                   'big': {'u': 0.5, 'v': ty(0.44), 'w': 0.62}}})


SCENES = {'polo_ls': build_polo_ls}
