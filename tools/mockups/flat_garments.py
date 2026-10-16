"""Long-sleeve polo, built with the flat-lay height field (flatlay.py).

Coordinates are metres on the table, +y towards the collar, viewed from above.
"""
import numpy as np

import lib
from lib import principled
from flatlay import Flat, bez3, garment_material, flatlay_studio, mirror_x, offset_line, resample
from garments import button_material
from products import lathe, tube_curve

WHITE = (0.86, 0.86, 0.85)


def lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


class Sleeve:
    """Frame along a sleeve: t from armhole (0) to cuff (1), s across (-1 inner .. +1 outer)."""
    def __init__(self, top0, top1, bot0, bot1):
        self.top0, self.top1, self.bot0, self.bot1 = top0, top1, bot0, bot1

    def at(self, t, s):
        a = lerp(self.bot0, self.bot1, t)     # inner (underarm) edge
        b = lerp(self.top0, self.top1, t)     # outer (top) edge
        return lerp(a, b, (s + 1) / 2)

    def mirrored(self):
        f = lambda p: (-p[0], p[1])
        return Sleeve(f(self.top0), f(self.top1), f(self.bot0), f(self.bot1))


def rib_cuff(F, shell, s, A, B, pitch=0.0019, amp=0.00035, f=0.82, depth=0.0012):
    """Rib cuff below the seam A (inner) -> B (outer) on the right sleeve, mirrored for s = -1."""
    A, B = np.array(A), np.array(B)
    d = (B - A) / np.linalg.norm(B - A)
    down = np.array((d[1], -d[0]))                     # towards the sleeve end
    poly = [A - 0.03 * d, B + 0.03 * d, B + 0.03 * d + 0.1 * down, A - 0.03 * d + 0.1 * down]
    c = F.cover([(s * p[0], p[1]) for p in poly]) * shell
    F.scale_height(c, f)
    F.paint(c, 'body_rib')
    F.ribs(c, (s * down[0], down[1]), pitch=pitch, amp=amp)
    F.seam([(s * p[0], p[1]) for p in (A - 0.004 * d, (A + B) / 2, B + 0.004 * d)], depth=depth, allowance=0)


def sleeve_folds(F, sl, folds):
    """folds: (t0, s0, t1, s1, width, height)"""
    for t0, s0, t1, s1, w, h in folds:
        F.fold(resample([sl.at(t0, s0), sl.at((t0 + t1) / 2, (s0 + s1) / 2), sl.at(t1, s1)], 0.004), w, h)


def both(F, fn):
    fn(1)
    fn(-1)


def shirt_button(name, x, y, z, mat, thread_m, r=0.0060):
    """Four-hole shirt button: raised rim, dished centre, cross-stitched thread."""
    prof = [(0.0, 0.0009), (r * 0.42, 0.0008), (r * 0.62, 0.0011), (r * 0.80, 0.0018), (r * 0.93, 0.0017),
            (r, 0.0010), (r * 0.99, 0.0002), (r * 0.9, 0.0)]
    b = lathe(name, prof, steps=48)
    b.location = (x, y, z)
    lib.assign(b, mat)
    k = 0.0016
    for i, (a, c) in enumerate((((-k, -k), (k, k)), ((-k, k), (k, -k)))):
        t = tube_curve(f'{name}_thread{i}', [(x + a[0], y + a[1], z + 0.0009), (x, y, z + 0.0012), (x + c[0], y + c[1], z + 0.0009)],
                       0.00038, res=3)
        lib.assign(t, thread_m)
    return b


def make_materials(F, spec):
    """spec: name -> (texture, colour). Returns materials in F.mat_names order."""
    mats = []
    for name in F.mat_names:
        tex, col = spec.get(name, spec.get('*'))
        if tex == 'label':
            mats.append(principled(name, color=col, rough=0.55, sheen=0.4))
        else:
            mats.append(garment_material(name, col, F, texture=tex))
    return mats


def attach(obj, mats):
    """Add material slots; clearing slots would also wipe the faces' material indices."""
    for m in mats:
        obj.data.materials.append(m)


# ===================================================================== polo ===
SNP = (0.088, 0.394)          # side neck point
SHP = (0.226, 0.352)          # shoulder point
ARM = (0.262, 0.146)          # armpit
HEM_F = -0.372                # front hem
HEM_B = -0.402                # back tail


def polo_outline(long_sleeve):
    r = [(0.0, 0.384)]
    r += bez3((0.0, 0.384), (0.04, 0.385), (0.07, 0.388), SNP, 8)
    r += bez3(SNP, (0.13, 0.384), (0.19, 0.366), SHP, 10)
    if long_sleeve:
        r += bez3(SHP, (0.30, 0.235), (0.39, 0.0), (0.432, -0.196), 26)          # outer sleeve to the cuff seam
        r += bez3((0.432, -0.196), (0.433, -0.200), (0.429, -0.204), (0.428, -0.208), 2)
        r += bez3((0.428, -0.208), (0.432, -0.23), (0.437, -0.25), (0.440, -0.268), 6)   # cuff outer side
        r += bez3((0.440, -0.268), (0.41, -0.276), (0.38, -0.282), (0.352, -0.288), 8)   # cuff end
        r += bez3((0.352, -0.288), (0.351, -0.265), (0.351, -0.245), (0.350, -0.226), 6)  # cuff inner side
        r += bez3((0.350, -0.226), (0.345, -0.222), (0.344, -0.218), (0.344, -0.214), 2)
        r += bez3((0.344, -0.214), (0.325, -0.11), (0.29, 0.03), ARM, 24)          # underarm to the armpit
    else:
        r += bez3(SHP, (0.29, 0.322), (0.35, 0.274), (0.398, 0.222), 14)
        r += bez3((0.398, 0.222), (0.38, 0.188), (0.36, 0.150), (0.340, 0.115), 8)
        r += bez3((0.340, 0.115), (0.30, 0.121), (0.275, 0.132), ARM, 8)
    r += bez3(ARM, (0.258, 0.02), (0.262, -0.24), (0.266, -0.334), 22)
    r += bez3((0.266, -0.334), (0.267, -0.36), (0.268, -0.38), (0.268, HEM_B + 0.006), 6)
    r += bez3((0.268, HEM_B + 0.006), (0.18, HEM_B - 0.002), (0.09, HEM_B - 0.003), (0.0, HEM_B - 0.003), 14, end=True)
    return mirror_x(r)


def polo_front_hem():
    return bez3((-0.263, HEM_F + 0.004), (-0.12, HEM_F - 0.002), (0.12, HEM_F - 0.002), (0.263, HEM_F + 0.004), 30, end=True)


def armhole(s):
    return [(s * x, y) for x, y in bez3(SHP, (0.236, 0.29), (0.248, 0.20), ARM, 20, end=True)]


def collar_parts():
    # right halves: outer edge (back centre -> point), front edge (point -> placket), fold (placket -> back centre)
    outer = bez3((0.0, 0.407), (0.05, 0.407), (0.082, 0.403), (0.100, 0.392), 10) + \
        bez3((0.100, 0.392), (0.117, 0.382), (0.127, 0.37), (0.127, 0.350), 8) + \
        bez3((0.127, 0.350), (0.126, 0.318), (0.088, 0.268), (0.056, 0.238), 14, end=True)
    front = bez3((0.056, 0.238), (0.043, 0.262), (0.027, 0.29), (0.0155, 0.316), 8)
    inner = bez3((0.0155, 0.316), (0.04, 0.318), (0.063, 0.325), (0.065, 0.341), 8) + \
        bez3((0.065, 0.341), (0.066, 0.356), (0.05, 0.371), (0.0, 0.373), 10, end=True)
    return outer, front, inner


def build_polo(long_sleeve=False):
    lib.reset()
    F = Flat(-0.47, 0.47, -0.43, 0.445, px=0.0004, seed=11 if long_sleeve else 5)
    shell = F.cover(polo_outline(long_sleeve))
    F.shell(shell, H=0.0042, R=0.0062, puff=0.0022, puff_r=0.07)

    # the back tail shows below the front hem: one layer there
    hem_f = polo_front_hem()
    tail = F.cover(hem_f + [(0.30, -0.45), (-0.30, -0.45)])
    F.hole(tail, H_under=0.0024, R=0.0035)

    # neck opening inside the collar: the inside of the back panel
    outer, front, inner = collar_parts()
    neck_right = [(0.0, 0.315), (0.0155, 0.315)] + inner[1:]
    neck = F.cover(mirror_x(neck_right))
    F.hole(neck, H_under=0.0016, R=0.0028)

    # paint: everything body, the front panel prints
    F.paint(shell, 'body')
    front_r = [(0.0, 0.46), (0.20, 0.46), SHP] + bez3(SHP, (0.236, 0.29), (0.248, 0.20), ARM, 20)[1:] + \
        [ARM, (0.30, 0.0), (0.30, -0.45), (0.0, -0.45)]
    F.paint(F.cover(mirror_x(front_r)) * shell, 'print')
    F.paint(tail * shell, 'body')

    # seams: shoulders and set-in sleeves
    shoulder = offset_line(bez3(SNP, (0.13, 0.384), (0.19, 0.366), SHP, 12, end=True), -0.010)
    both(F, lambda s: F.seam([(s * x, y) for x, y in shoulder], allowance=-s))
    both(F, lambda s: F.seam(armhole(s), allowance=s))
    # hems: front, back tail; side vents
    F.hem(hem_f, inward=1, rows=(0.018,))
    tail_hem = bez3((-0.264, HEM_B + 0.004), (-0.12, HEM_B - 0.004), (0.12, HEM_B - 0.004), (0.264, HEM_B + 0.004), 30, end=True)
    F.hem(tail_hem, inward=1, rows=(0.017,))
    both(F, lambda s: F.stitch([(s * 0.252, -0.336), (s * 0.262, -0.336)], dash=0.0011, gap=0.0002))   # vent bartack

    # sleeve ends
    if long_sleeve:
        sl = Sleeve(SHP, (0.432, -0.196), ARM, (0.344, -0.214))
        both(F, lambda s: rib_cuff(F, shell, s, (0.345, -0.221), (0.429, -0.206), pitch=0.0019))
    else:
        def band(s):
            a, b = np.array((0.398, 0.222)), np.array((0.340, 0.115))
            d = (b - a) / np.linalg.norm(b - a)
            n = np.array((d[1], -d[0]))          # towards the shoulder
            q2 = [a + n * 0.027 - d * 0.02, b + n * 0.027 + d * 0.02, b - n * 0.02 + d * 0.02, a - n * 0.02 - d * 0.02]
            pts = [(s * p[0], p[1]) for p in q2]
            c = F.cover(pts) * shell
            F.scale_height(c, 0.85)
            F.paint(c, 'body_rib')
            F.ribs(c, (s * n[0], n[1]), pitch=0.0018)
            F.seam([(s * p[0], p[1]) for p in (a + n * 0.027 - d * 0.004, b + n * 0.027 + d * 0.004)], depth=0.0011, allowance=0)
        both(F, band)

    # placket + buttons
    pk = [(-0.0165, 0.150), (0.0165, 0.150), (0.0165, 0.318), (-0.0165, 0.318)]
    pkc = F.cover(pk)
    F.overlay(pkc, H=0.0013, R=0.0012)
    F.paint(pkc, 'body_placket')
    F.stitch([(-0.0148, 0.318), (-0.0148, 0.1518), (0.0148, 0.1518), (0.0148, 0.318)])
    F.stitch([(-0.0148, 0.166), (0.0148, 0.166)])
    for y in (0.287, 0.229):           # vertical button holes, mostly under the buttons
        F.stitch([(0.0, y - 0.0095), (0.0, y + 0.0095)], dash=0.0007, gap=0.0001, width=0.0006, pull=0.0004)
        F.stitch([(0.0012, y - 0.0095), (0.0012, y + 0.0095)], dash=0.0007, gap=0.0001, width=0.0005, pull=0.0002)

    # collar: folded flat-knit, thickest at the fold, the points curl up a touch
    right = outer + front + inner
    col = F.cover(mirror_x(right))
    sl_, dist_in, _, _, _ = F.line([(x, y) for x, y in mirror_x(inner)], band=0.02)
    lift = np.zeros_like(F.h)
    lift[sl_] = (0.0026 * np.exp(-dist_in / 0.0075)).astype(np.float32)
    for s in (1, -1):
        tip = (s * 0.052, 0.238)
        lift += (0.0011 * np.exp(-((F.X - tip[0]) ** 2 + (F.Y - tip[1]) ** 2) / 0.018 ** 2)).astype(np.float32)
    F.overlay(col, H=0.0024, R=0.0018, lift=lift)
    F.paint(col, 'body_collar')
    F.ribs(col, (0, 1), pitch=0.0013, amp=0.0003,
           phase_fn=lambda X, Y: np.arctan2(Y - 0.33, X) * 0.075)
    outer_full = [(-x, y) for x, y in reversed(outer)] + outer[1:]
    F.stitch(offset_line(outer_full, -0.0035))

    # neck tape and woven label inside the back neck; the opening sits in the collar's shade
    F.ao *= (1 - 0.10 * neck).astype(np.float32)
    tape_in = [(x, y) for x, y in bez3((-0.060, 0.352), (-0.04, 0.366), (0.04, 0.366), (0.060, 0.352), 20, end=True)]
    F.stitch(tape_in)
    lab = F.cover([(-0.013, 0.344), (0.013, 0.344), (0.013, 0.359), (-0.013, 0.359)])
    F.overlay(lab, H=0.0004, R=0.0004)
    F.paint(lab, 'label')

    # folds
    F.billows(cell=0.085, amp=0.0017, seed=3 if long_sleeve else 4)
    F.billows(cell=0.045, amp=0.0006, seed=13)
    both(F, lambda s: F.fold([(s * 0.255, 0.140), (s * 0.20, 0.10), (s * 0.15, 0.072)], 0.009, 0.0024))
    both(F, lambda s: F.fold([(s * 0.250, 0.110), (s * 0.20, 0.04), (s * 0.17, 0.005)], 0.010, 0.0018))
    F.fold([(-0.16, 0.13), (-0.07, -0.03), (0.04, -0.21)], 0.020, 0.0024)
    F.fold([(-0.12, 0.16), (-0.03, 0.03), (0.07, -0.12)], 0.012, 0.0014)
    F.fold([(0.10, -0.06), (0.17, -0.18), (0.22, -0.31)], 0.018, 0.0020)
    F.fold([(-0.22, -0.20), (-0.14, -0.27), (-0.06, -0.33)], 0.014, 0.0018)
    F.fold([(0.04, -0.30), (0.12, -0.34)], 0.008, 0.0014)
    F.fold([(0.13, 0.26), (0.19, 0.22), (0.23, 0.19)], 0.010, 0.0016)
    F.fold([(-0.13, 0.25), (-0.19, 0.20)], 0.010, 0.0014)
    if long_sleeve:
        both(F, lambda s: sleeve_folds(F, sl if s > 0 else sl.mirrored(), [
            (0.18, -0.95, 0.30, 0.5, 0.012, 0.0030),
            (0.33, -0.9, 0.38, 0.7, 0.010, 0.0038),
            (0.47, -0.95, 0.42, 0.85, 0.009, 0.0034),
            (0.56, -0.6, 0.60, 0.4, 0.006, 0.0018),
            (0.64, -0.9, 0.70, 0.6, 0.008, 0.0030),
            (0.80, -0.7, 0.76, 0.85, 0.007, 0.0028),
            (0.88, -0.8, 0.93, 0.0, 0.005, 0.0020),
            (0.90, 0.0, 0.94, 0.8, 0.005, 0.0020),
        ]))
    else:
        sl = Sleeve(SHP, (0.398, 0.222), ARM, (0.340, 0.115))
        both(F, lambda s: sleeve_folds(F, sl if s > 0 else sl.mirrored(), [
            (0.30, -0.8, 0.52, 0.6, 0.010, 0.0024),
            (0.62, -0.9, 0.60, 0.4, 0.008, 0.0016),
        ]))
    F.finish()
    F.detail_image()

    obj = F.mesh('polo')
    W, y0, H = 0.56, -0.40, 0.80
    F.print_uv(obj, W, y0, H)
    mats = make_materials(F, {'*': ('pique', WHITE), 'body_rib': ('jersey', WHITE), 'body_collar': ('jersey', WHITE),
                              'label': ('label', (0.80, 0.78, 0.74))})
    attach(obj, mats)

    bm = button_material()
    bm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.93, 0.92, 0.89, 1)
    thread_m = principled('thread', color=(0.88, 0.87, 0.84), rough=0.7, sheen=0.5)
    for i, y in enumerate((0.287, 0.229)):
        shirt_button(f'btn{i}', 0.0, y, F.z_at(0.0, y) - 0.0002, bm, thread_m)
    flatlay_studio(cam_y=0.0 if long_sleeve else 0.012, cam_z=2.36 if long_sleeve else 2.25)
    ty = lambda y: (y - y0) / H
    tx = lambda x: (x + W / 2) / W
    return dict(
        tintable=True, print_aspect=W / H, spec_blur=3.0,
        default={'u': tx(0.118), 'v': ty(0.205), 'w': 0.16},
        extra={'presets': {
            'chest': {'u': tx(0.118), 'v': ty(0.205), 'w': 0.16},
            'center': {'u': 0.5, 'v': ty(0.06), 'w': 0.46},
            'big': {'u': 0.5, 'v': ty(-0.02), 'w': 0.66},
        }},
    )


SCENES = {
    'polo_ls': lambda: build_polo(True),
}   # the short-sleeve polo and the hoodie now come from real artwork: see from_photo.py
