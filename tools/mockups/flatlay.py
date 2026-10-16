"""Flat-lay garments as a 2.5D height field.

A garment lying on a table is (almost) a height field, so instead of extruding
outlines into stiff slabs we paint it on a fine grid, the way a sculptor would:

  shell     the garment silhouette; its edges roll over softly (two layers of
            fabric with some air between them) and the middle puffs up a little
  holes     openings (neck, hood) that show the single layer underneath
  overlays  pieces sewn on top (collar, placket, pocket) with their own roll
  seams     pinched grooves with the seam allowance ridging one side
  stitches  dashed thread lines (hems, topstitching), into a bump map
  ribs      rib knit cords following a direction, into the bump map
  folds     soft ridges and billows on top of everything

The height grid becomes one dense mesh; the fine detail (stitches, ribs, seam
lines) goes into a float image used as bump and as a little ambient darkening.
"""
import math
import os
import tempfile

import bpy
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

import lib
from lib import connect, node, principled


# ---------------------------------------------------------------- shapes ---
def bez3(p0, c0, c1, p1, n=16, end=False):
    """Cubic Bezier points (without the end point unless `end`)."""
    out = []
    m = n + 1 if end else n
    for i in range(m):
        t = i / n
        a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t ** 3
        out.append((a * p0[0] + b * c0[0] + c * c1[0] + d * p1[0], a * p0[1] + b * c0[1] + c * c1[1] + d * p1[1]))
    return out


def mirror_x(right):
    """Right half (from the centre line down/around) -> closed symmetric outline."""
    left = [(-x, y) for x, y in reversed(right)]
    if abs(right[0][0]) < 1e-9:
        left = left[:-1]
    if abs(right[-1][0]) < 1e-9:
        left = left[1:]
    return right + left


def offset_line(pts, d):
    """Offset an open polyline by d (positive = to the left of travel)."""
    p = np.asarray(pts, float)
    n = len(p)
    out = []
    for i in range(n):
        a = p[max(i - 1, 0)]
        b = p[min(i + 1, n - 1)]
        t = b - a
        t /= np.linalg.norm(t) + 1e-12
        out.append(tuple(p[i] + d * np.array([-t[1], t[0]])))
    return out


def resample(pts, step):
    """Even spacing along a polyline (keeps the ends)."""
    p = np.asarray(pts, float)
    seg = np.linalg.norm(np.diff(p, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    n = max(2, int(s[-1] / step) + 1)
    t = np.linspace(0, s[-1], n)
    return list(zip(np.interp(t, s, p[:, 0]), np.interp(t, s, p[:, 1])))


def roll(d, R):
    """Quarter-round edge profile: 0 at the edge, 1 at distance R inside."""
    t = np.clip(d / R, 0.0, 1.0)
    return np.sqrt(1.0 - (1.0 - t) ** 2)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ grid ---
class Flat:
    def __init__(self, x0, x1, y0, y1, px=0.0004, seed=7):
        self.x0, self.y0, self.px = x0, y0, px
        self.nx = int(round((x1 - x0) / px))
        self.ny = int(round((y1 - y0) / px))
        self.x1, self.y1 = x0 + self.nx * px, y0 + self.ny * px
        xs = (x0 + (np.arange(self.nx) + 0.5) * px).astype(np.float32)
        ys = (y0 + (np.arange(self.ny) + 0.5) * px).astype(np.float32)
        self.X, self.Y = np.meshgrid(xs, ys)          # row i <-> y0 + i*px (y up)
        shape = (self.ny, self.nx)
        self.h = np.zeros(shape, np.float32)          # macro height (m)
        self.wr = np.zeros(shape, np.float32)         # folds (m), faded at the silhouette
        self.det = np.zeros(shape, np.float32)        # micro height for the bump map (m)
        self.ao = np.ones(shape, np.float32)          # albedo multiplier
        self.mat = np.full(shape, -1, np.int16)
        self.mat_names = []
        self.rng = np.random.default_rng(seed)

    # ---- rasterising
    def cover(self, poly, ss=3):
        img = Image.new('L', (self.nx * ss, self.ny * ss), 0)
        pts = [((x - self.x0) / self.px * ss, (y - self.y0) / self.px * ss) for x, y in poly]
        ImageDraw.Draw(img).polygon(pts, fill=255)
        a = np.asarray(img, np.float32).reshape(self.ny, ss, self.nx, ss).mean(axis=(1, 3))
        return a / 255.0

    def inside(self, cov):
        """Distance to the edge (m) for points inside, 0 outside, with sub-pixel edge."""
        d = ndimage.distance_transform_edt(cov > 0.5).astype(np.float32) * self.px
        return np.where(cov > 0.5, np.maximum(d + (cov - 1.0) * self.px, 0), 0).astype(np.float32)

    def outside(self, cov):
        return ndimage.distance_transform_edt(cov <= 0.5).astype(np.float32) * self.px

    def _box(self, pts, band):
        p = np.asarray(pts)
        i0 = max(0, int((p[:, 1].min() - band - self.y0) / self.px))
        i1 = min(self.ny, int((p[:, 1].max() + band - self.y0) / self.px) + 2)
        j0 = max(0, int((p[:, 0].min() - band - self.x0) / self.px))
        j1 = min(self.nx, int((p[:, 0].max() + band - self.x0) / self.px) + 2)
        return slice(i0, i1), slice(j0, j1)

    def line(self, pts, band=0.01, closed=False):
        """Distance to a polyline, arc length along it and side (+1 left), near the line only."""
        pts = list(pts) + ([pts[0]] if closed else [])
        sl = self._box(pts, band)
        X, Y = self.X[sl], self.Y[sl]
        dist = np.full(X.shape, np.inf, np.float32)
        along = np.zeros(X.shape, np.float32)
        side = np.ones(X.shape, np.float32)
        i_off, j_off = sl[0].start, sl[1].start
        s0 = 0.0
        for (ax, ay), (bx, by) in zip(pts[:-1], pts[1:]):
            ex, ey = bx - ax, by - ay
            L2 = ex * ex + ey * ey
            if L2 < 1e-14:
                continue
            si, sj = self._box([(ax, ay), (bx, by)], band)
            ss = (slice(si.start - i_off, si.stop - i_off), slice(sj.start - j_off, sj.stop - j_off))
            x, y = X[ss], Y[ss]
            t = np.clip(((x - ax) * ex + (y - ay) * ey) / L2, 0, 1)
            dx, dy = x - (ax + t * ex), y - (ay + t * ey)
            d = np.sqrt(dx * dx + dy * dy)
            cur = dist[ss]
            upd = d < cur
            cur[upd] = d[upd]
            along[ss][upd] = (s0 + t * math.sqrt(L2))[upd]
            cr = ex * (y - ay) - ey * (x - ax)
            side[ss][upd] = np.where(cr >= 0, 1.0, -1.0)[upd]
            s0 += math.sqrt(L2)
        return sl, dist, along, side, s0

    # ---- building blocks
    def shell(self, cov, H, R, puff=0.0, puff_r=0.08):
        d = self.inside(cov)
        self.d_shell = d
        self.cov_shell = cov
        self.h = np.where(cov > 0.5, H * roll(d, R) + puff * (1 - np.exp(-d / puff_r)), 0).astype(np.float32)
        return d

    def hole(self, cov, H_under, R=0.004, R_under=0.004):
        """An opening in the top layer showing the single layer beneath."""
        under = H_under * roll(self.d_shell, R_under)
        k = roll(self.outside(cov), R)
        self.h = (under + (self.h - under) * k).astype(np.float32)

    def scale_height(self, cov, f, soft=0.006):
        """Thinner fabric (rib bands): scale the height inside `cov`, blended over `soft`."""
        k = smoothstep(0, soft, self.inside(cov))
        self.h *= (1 - k * (1 - f)).astype(np.float32)

    def overlay(self, cov, H, R, base_blur=2.0, lift=None):
        """A piece sewn on top: follows the surface below and adds its own rolled thickness."""
        d = self.inside(cov)
        base = ndimage.gaussian_filter(self.h, base_blur)
        add = H * roll(d, R)
        if lift is not None:
            add = add + lift * roll(d, R)
        self.h = np.where(cov > 0.5, np.maximum(self.h, base + add), self.h).astype(np.float32)
        # whatever detail was drawn below is hidden now
        k = smoothstep(0.0, 0.0008, d)
        self.det *= (1 - k).astype(np.float32)
        self.ao = (self.ao * (1 - k) + k).astype(np.float32)
        return d

    def hem(self, edge, inward, depth=0.022, rows=(0.016, 0.0225), ridge=0.00035):
        """Turned-up hem along an edge polyline: double thickness band + stitch rows.
        `inward` = +1 if the garment lies to the left of the edge's direction of travel."""
        sl, dist, along, side, L = self.line(edge, band=depth + 0.006)
        inn = side == inward
        band = (1 - smoothstep(depth - 0.002, depth + 0.001, dist)) * inn
        self.h[sl] += (band * ridge).astype(np.float32)
        for r in rows:
            self.stitch(offset_line(edge, r * inward))

    def paint(self, cov, name):
        if name not in self.mat_names:
            self.mat_names.append(name)
        self.mat[cov > 0.5] = self.mat_names.index(name)

    def seam(self, pts, depth=0.0009, width=0.0022, allowance=1, closed=False):
        """A sewn seam: pinched groove, a fine fold line in the bump and the allowance ridge."""
        sl, dist, along, side, L = self.line(pts, band=0.014, closed=closed)
        g = np.exp(-(dist / width) ** 2)
        self.h[sl] -= (g * depth).astype(np.float32)
        if allowance:
            ridge = smoothstep(0.0, 0.002, dist) * (1 - smoothstep(0.006, 0.010, dist)) * (side == allowance)
            self.h[sl] += (ridge * 0.00045).astype(np.float32)
        self.det[sl] -= (np.exp(-(dist / 0.00045) ** 2) * 0.00035).astype(np.float32)
        self.ao[sl] *= (1 - 0.22 * np.exp(-(dist / 0.0009) ** 2)).astype(np.float32)

    def stitch(self, pts, dash=0.0028, gap=0.0010, width=0.00042, closed=False, pull=0.00022, strength=1.0):
        """A row of thread stitches: raised dashes sitting in a slight groove."""
        sl, dist, along, side, L = self.line(pts, band=0.004, closed=closed)
        period = dash + gap
        ph = np.mod(along, period)
        on = smoothstep(0.0, 0.0004, ph) * (1 - smoothstep(dash - 0.0004, dash, ph))
        thread = np.exp(-(dist / width) ** 2) * on
        groove = np.exp(-(dist / (width * 3.2)) ** 2)
        self.det[sl] += ((thread * 0.00030 - groove * pull) * strength).astype(np.float32)
        self.ao[sl] *= (1 - (0.16 * groove * (1 - on) + 0.05 * thread) * strength).astype(np.float32)

    def ribs(self, cov, direction, pitch=0.0018, amp=0.00035, phase_fn=None):
        """Rib knit cords running along `direction` (unit 2D) inside `cov`."""
        nx_, ny_ = -direction[1], direction[0]
        proj = self.X * nx_ + self.Y * ny_ if phase_fn is None else phase_fn(self.X, self.Y)
        wave = 0.5 + 0.5 * np.cos(2 * math.pi * proj / pitch)
        k = smoothstep(0.0, 0.0015, self.inside(cov))
        self.det += ((wave ** 1.6) * amp * k).astype(np.float32)
        self.ao *= (1 - 0.07 * (1 - wave) * k).astype(np.float32)

    def fold(self, pts, w, h, taper=0.8, sharp=0.55):
        """A soft fabric fold along a polyline: sharp-ish crest, wide skirts, tapered ends."""
        sl, dist, along, side, L = self.line(pts, band=w * 4)
        prof = sharp * np.exp(-(dist / w) ** 2) + (1 - sharp) * np.exp(-dist / (1.6 * w))
        tp = np.clip(np.sin(np.pi * np.clip(along / max(L, 1e-6), 0, 1)), 0, 1) ** taper
        self.wr[sl] += (h * prof * tp).astype(np.float32)

    def billows(self, cell=0.07, amp=0.0015, seed=1):
        rng = np.random.default_rng(seed)
        c = max(2, int(cell / self.px))
        g = rng.standard_normal((self.ny // c + 4, self.nx // c + 4)).astype(np.float32)
        g = ndimage.gaussian_filter(g, 0.9)
        z = ndimage.zoom(g, c, order=3)[c:c + self.ny, c:c + self.nx]
        z /= z.std() + 1e-9
        self.wr += (z * amp).astype(np.float32)

    def finish(self, fade=0.018):
        """Fold field joins the height, faded out at the silhouette so edges still touch down."""
        k = smoothstep(0.0, fade, self.d_shell)
        self.h = np.where(self.cov_shell > 0.5, self.h + self.wr * k, self.h).astype(np.float32)
        self.h = np.maximum(self.h, 0)
        self.hs = ndimage.gaussian_filter(self.h, 1.2)

    def z_at(self, x, y):
        j = (x - self.x0) / self.px - 0.5
        i = (y - self.y0) / self.px - 0.5
        return float(ndimage.map_coordinates(self.hs, [[i], [j]], order=1)[0])

    # ---- to Blender
    def mesh(self, name, step=3, floor=-0.0008):
        hs = self.hs
        H = hs[::step, ::step]
        M = self.mat[::step, ::step]
        ny, nx = H.shape
        inside = M >= 0
        # keep a quad when any corner is inside
        q = inside[:-1, :-1] | inside[1:, :-1] | inside[:-1, 1:] | inside[1:, 1:]
        used = np.zeros_like(inside)
        used[:-1, :-1] |= q
        used[1:, :-1] |= q
        used[:-1, 1:] |= q
        used[1:, 1:] |= q
        idx = np.full(H.shape, -1, np.int64)
        idx[used] = np.arange(used.sum())
        X = self.X[::step, ::step][used]
        Y = self.Y[::step, ::step][used]
        Z = np.where(inside, H, floor)[used]
        verts = np.stack([X, Y, Z], axis=1).astype(np.float32)
        qi, qj = np.nonzero(q)
        faces = np.stack([idx[qi, qj], idx[qi, qj + 1], idx[qi + 1, qj + 1], idx[qi + 1, qj]], axis=1)
        me = bpy.data.meshes.new(name)
        me.vertices.add(len(verts))
        me.vertices.foreach_set('co', verts.ravel())
        me.loops.add(faces.size)
        me.loops.foreach_set('vertex_index', faces.ravel().astype(np.int32))
        me.polygons.add(len(faces))
        me.polygons.foreach_set('loop_start', (np.arange(len(faces)) * 4).astype(np.int32))
        # material of the face centre (full resolution sample)
        ci = np.clip(qi * step + step // 2, 0, self.ny - 1)
        cj = np.clip(qj * step + step // 2, 0, self.nx - 1)
        fm = self.mat[ci, cj]
        # faces just outside the silhouette take their nearest inside neighbour's material
        if (fm < 0).any():
            near = ndimage.distance_transform_edt(self.mat < 0, return_distances=False, return_indices=True)
            fm = np.where(fm >= 0, fm, self.mat[near[0][ci, cj], near[1][ci, cj]])
        me.polygons.foreach_set('material_index', fm.astype(np.int32))
        me.polygons.foreach_set('use_smooth', np.ones(len(faces), bool))
        me.update(calc_edges=True)
        me.validate()
        obj = lib.link(bpy.data.objects.new(name, me))
        return obj

    def print_uv(self, obj, W, y0, H, x_center=0.0):
        me = obj.data
        uvl = me.uv_layers.new(name='PrintUV')
        co = np.empty(len(me.vertices) * 3, np.float32)
        me.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3)
        vi = np.empty(len(me.loops), np.int32)
        me.loops.foreach_get('vertex_index', vi)
        u = (co[vi, 0] - x_center + W / 2) / W
        v = (co[vi, 1] - y0) / H
        uvl.data.foreach_set('uv', np.stack([u, v], axis=1).ravel().astype(np.float32))

    def detail_image(self, name='garment_detail'):
        """Write micro height and albedo shading as 16-bit maps and load them.
        (Pixels poked into a generated float image don't reach Cycles, files do.)"""
        det = ndimage.gaussian_filter(self.det, 0.5) * 1000.0          # mm
        ao = ndimage.gaussian_filter(self.ao, 0.6)
        folder = tempfile.mkdtemp(prefix='emese_')
        self.images = []
        for key, arr in (('height', np.clip((det + 1.0) / 2.0, 0, 1)), ('shade', np.clip(ao, 0, 1))):
            path = os.path.join(folder, f'{name}_{key}.png')
            # image rows go top-down, ours go bottom-up
            Image.fromarray((np.flipud(arr) * 65535 + 0.5).astype(np.uint16)).save(path)
            img = bpy.data.images.load(path)
            img.colorspace_settings.name = 'Non-Color'
            self.images.append(img)
        return self.images


# ------------------------------------------------------------- materials ---
def garment_material(name, color, flat, texture='jersey', micro=0.3):
    """Knit fabric + the garment's detail image (stitches, seams, ribs) as bump and shading."""
    m = principled(name, color=color, rough=0.93, sheen=0.4, sheen_rough=0.55, spec=0.3)
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    co = lib.tex_coord(m)
    from products import knit_height, sum_sockets
    if texture == 'pique':
        vor = node(m, 'ShaderNodeTexVoronoi', Scale=560.0, _feature='SMOOTH_F1')
        connect(m, co, vor.inputs['Vector'])
        slub = lib.noise(m, co, 90.0, detail=4, rough=0.6)
        soft = lib.noise(m, co, 14.0, detail=3)
        tex = sum_sockets(m, [vor.outputs['Distance'], slub.outputs['Fac'], soft.outputs['Fac']], [0.55, 0.3, 0.35])
        amount, strength = 0.06, micro * 0.7
    elif texture == 'fleece':
        knit = knit_height(m, co, wale=190.0)
        fuzz = lib.noise(m, co, 300.0, detail=5, rough=0.7)
        soft = lib.noise(m, co, 18.0, detail=3)
        tex = sum_sockets(m, [knit, fuzz.outputs['Fac'], soft.outputs['Fac']], [0.35, 0.45, 0.35])
        amount, strength = 0.06, micro * 0.85
    elif texture == 'lining':
        fuzz = lib.noise(m, co, 420.0, detail=6, rough=0.75)
        soft = lib.noise(m, co, 25.0, detail=3)
        tex = sum_sockets(m, [fuzz.outputs['Fac'], soft.outputs['Fac']], [0.7, 0.3])
        amount, strength = 0.09, micro * 0.6
    else:
        tex = knit_height(m, co)
        amount, strength = 0.07, micro

    # detail image lookup in garment space
    mp = node(m, 'ShaderNodeMapping')
    sx, sy = 1.0 / (flat.x1 - flat.x0), 1.0 / (flat.y1 - flat.y0)
    mp.inputs['Scale'].default_value = (sx, sy, 1)
    mp.inputs['Location'].default_value = (-flat.x0 * sx, -flat.y0 * sy, 0)
    connect(m, co, mp.inputs['Vector'])
    taps = []
    for img in flat.images:
        im = node(m, 'ShaderNodeTexImage', _interpolation='Cubic', _extension='EXTEND')
        im.image = img
        connect(m, mp.outputs['Vector'], im.inputs['Vector'])
        taps.append(im.outputs['Color'])
    height_tap, shade_tap = taps

    # base colour: fabric texture x stitch/seam shading
    mr = node(m, 'ShaderNodeMapRange', **{'From Min': 0.0, 'From Max': 1.0, 'To Min': 1.0 - amount, 'To Max': 1.0 + amount * 0.25})
    connect(m, tex, mr.inputs['Value'])
    shade = node(m, 'ShaderNodeMath', _operation='MULTIPLY')
    connect(m, mr.outputs['Result'], shade.inputs[0])
    connect(m, shade_tap, shade.inputs[1])
    mul = node(m, 'ShaderNodeMix', _data_type='RGBA', _blend_type='MULTIPLY', Factor=1.0)
    mul.inputs['A'].default_value = (*color, 1)
    connect(m, shade.outputs['Value'], mul.inputs['B'])
    connect(m, mul.outputs['Result'], p.inputs['Base Color'])

    # bump: fabric micro relief, then the detail map (stored in mm)
    b1 = node(m, 'ShaderNodeBump', Strength=strength, Distance=0.0012)
    connect(m, tex, b1.inputs['Height'])
    b2 = node(m, 'ShaderNodeBump', Strength=1.0, Distance=0.002)   # map value 0..1 = 2 mm
    connect(m, height_tap, b2.inputs['Height'])
    connect(m, b1.outputs['Normal'], b2.inputs['Normal'])
    connect(m, b2.outputs['Normal'], p.inputs['Normal'])
    return m


def flatlay_studio(cam_y=0.0, cam_z=2.3, lens=72, ground=(0.50, 0.485, 0.46), key=34):
    from products import backdrop_paper
    backdrop_paper(color=ground).location.z = 0.0
    lib.world_color((1.0, 0.985, 0.96), 0.08)
    lib.area_light((-1.5, 0.75, 1.0), (0, 0, 0), key, 1.0, color=(1.0, 0.97, 0.93))
    lib.area_light((1.3, -0.9, 1.6), (0, 0, 0), 6, 2.0, color=(0.93, 0.95, 1.0))
    lib.camera((0, cam_y, cam_z), (0, cam_y, 0), lens=lens)
