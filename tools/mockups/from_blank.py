"""Studio passes straight from a blank product photo (the AI photo pairs in assets/products/).

Each product has a "logo" photo (display) and a "blank" one. The blank is shown as photographed
(no recolouring) and its print area is a quad on the photo: the logo is laid in with a perspective
map (and an optional wrap for round things), and picks up the photo's own shading and texture.

    python tools/mockups/from_blank.py SRC_DIR            # every product
    python tools/mockups/from_blank.py SRC_DIR mug pen
    python tools/mockups/from_blank.py SRC_DIR --preview  # quads drawn on the photos, to check

SRC_DIR holds <id>/blank.png (1254 px squares).
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
MOCK = os.path.join(ROOT, 'assets', 'mockups')
SIZE = 1200

# quad corners as fractions of the photo: top left, top right, bottom right, bottom left.
# wrap: the surface is a cylinder seen side on (mugs, bottles, a hat band); oval: clip to the
# inscribed ellipse (round coasters, an oval key tag).
Q = {
    'shirt':    {'q': [(0.28, 0.17), (0.73, 0.17), (0.73, 0.92), (0.28, 0.92)], 'wrap': 0.6,
                 'default': {'u': 0.68, 'v': 0.84, 'w': 0.2}},
    'chef':     {'q': [(0.56, 0.17), (0.79, 0.17), (0.79, 0.52), (0.56, 0.52)],
                 'default': {'u': 0.5, 'v': 0.78, 'w': 0.55}},
    'chefhat':  {'q': [(0.23, 0.71), (0.77, 0.71), (0.77, 0.965), (0.23, 0.965)], 'wrap': 0.9,
                 'default': {'u': 0.5, 'v': 0.5, 'w': 0.42}},
    'vest':     {'q': [(0.525, 0.16), (0.622, 0.16), (0.622, 0.42), (0.525, 0.42)],
                 'default': {'u': 0.5, 'v': 0.68, 'w': 0.9}},
    'helmet':   {'q': [(0.36, 0.2), (0.76, 0.2), (0.76, 0.6), (0.36, 0.6)], 'wrap': 0.9,
                 'default': {'u': 0.52, 'v': 0.5, 'w': 0.55}},
    'notebook': {'q': [(0.24, 0.1), (0.69, 0.1), (0.69, 0.86), (0.24, 0.86)],
                 'default': {'u': 0.5, 'v': 0.62, 'w': 0.55}},
    'pen':      {'q': [(0.286, 0.686), (0.506, 0.466), (0.534, 0.494), (0.314, 0.714)], 'wrap': 0.0,
                 'default': {'u': 0.5, 'v': 0.5, 'w': 0.85}},
    'cards':    {'q': [(0.11, 0.31), (0.80, 0.145), (0.905, 0.675), (0.20, 0.86)],
                 'default': {'u': 0.5, 'v': 0.5, 'w': 0.5}},
    'mug':      {'q': [(0.21, 0.24), (0.67, 0.24), (0.67, 0.78), (0.21, 0.78)], 'wrap': 0.95,
                 'default': {'u': 0.5, 'v': 0.5, 'w': 0.62}},
    'tumbler':  {'q': [(0.375, 0.4), (0.625, 0.4), (0.625, 0.9), (0.375, 0.9)], 'wrap': 0.95,
                 'default': {'u': 0.5, 'v': 0.62, 'w': 0.75}},
    'coasters': {'q': [(0.425, 0.525), (0.72, 0.525), (0.72, 0.925), (0.425, 0.925)], 'oval': True,
                 'default': {'u': 0.5, 'v': 0.5, 'w': 0.6}},
    'giftset':  {'q': [(0.28, 0.27), (0.575, 0.27), (0.575, 0.86), (0.28, 0.86)],
                 'default': {'u': 0.5, 'v': 0.6, 'w': 0.6}},
    'tote':     {'q': [(0.25, 0.36), (0.76, 0.36), (0.78, 0.92), (0.23, 0.92)],
                 'default': {'u': 0.5, 'v': 0.55, 'w': 0.6}},
    'lanyard':  {'q': [(0.235, 0.555), (0.415, 0.565), (0.41, 0.895), (0.225, 0.885)],
                 'default': {'u': 0.5, 'v': 0.6, 'w': 0.75}},
    'featherflag': {'q': [(0.41, 0.16), (0.64, 0.08), (0.63, 0.70), (0.41, 0.72)],
                 'default': {'u': 0.5, 'v': 0.7, 'w': 0.75}},
    'label':    {'q': [(0.25, 0.34), (0.75, 0.35), (0.75, 0.66), (0.24, 0.66)],
                 'default': {'u': 0.5, 'v': 0.5, 'w': 0.75}},
    'hangtag':  {'q': [(0.35, 0.27), (0.64, 0.24), (0.72, 0.90), (0.42, 0.94)],
                 'default': {'u': 0.5, 'v': 0.55, 'w': 0.75}},
    'zipper':   {'q': [(0.475, 0.45), (0.565, 0.47), (0.515, 0.73), (0.43, 0.71)],
                 'default': {'u': 0.5, 'v': 0.5, 'w': 0.8}},
    'keychain': {'q': [(0.27, 0.52), (0.60, 0.52), (0.60, 0.935), (0.27, 0.935)], 'oval': True,
                 'default': {'u': 0.5, 'v': 0.5, 'w': 0.62}},
}


def to_lin(c):
    c = np.asarray(c, np.float32) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb8(x):
    x = np.clip(x, 0, 1)
    s = np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)
    return (s * 255 + 0.5).astype(np.uint8)


def lum(c):
    return c[..., 0] * 0.2126 + c[..., 1] * 0.7152 + c[..., 2] * 0.0722


def homography(src, dst):
    """3x3 H with H @ [x, y, 1] ~ dst for the four point pairs."""
    A = []
    for (x, y), (u, v) in zip(src, dst):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y, -u])
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y, -v])
    _, _, vt = np.linalg.svd(np.asarray(A, np.float64))
    return vt[-1].reshape(3, 3)


def build(src, pid, cfg, preview=None):
    im = Image.open(os.path.join(src, pid, 'blank.png')).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)
    quad = [(x * SIZE, y * SIZE) for x, y in cfg['q']]
    if preview is not None:
        d = ImageDraw.Draw(im)
        d.polygon(quad, outline=(255, 0, 140), width=4)
        return im
    lin = to_lin(np.asarray(im))

    # print area
    m = Image.new('L', (SIZE * 2, SIZE * 2), 0)
    md = ImageDraw.Draw(m)
    if cfg.get('oval'):
        xs, ys = zip(*quad)
        md.ellipse([min(xs) * 2, min(ys) * 2, max(xs) * 2, max(ys) * 2], fill=255)
    else:
        md.polygon([(x * 2, y * 2) for x, y in quad], fill=255)
    pm = np.asarray(m.resize((SIZE, SIZE), Image.LANCZOS), np.float32) / 255

    # uv by perspective from the quad (v up), then an optional cylinder wrap across u
    H = homography(quad, [(0, 1), (1, 1), (1, 0), (0, 0)])
    yy, xx = np.mgrid[0:SIZE, 0:SIZE].astype(np.float64) + 0.5
    w_ = H[2, 0] * xx + H[2, 1] * yy + H[2, 2]
    u = (H[0, 0] * xx + H[0, 1] * yy + H[0, 2]) / w_
    v = (H[1, 0] * xx + H[1, 1] * yy + H[1, 2]) / w_
    k = cfg.get('wrap', 0.0)
    if k:
        # seen side on, the middle of a cylinder shows more of its surface than its edges
        x = np.clip(2 * u - 1, -0.999, 0.999)
        u = 0.5 + (1 - k) * x / 2 + k * np.arcsin(x) / np.pi
    valid = (pm > 0.5) & (u >= 0) & (u <= 1) & (v >= 0) & (v <= 1)

    # passes: albedo is the photo's smoothed colour, light carries the fine shading and texture
    alb = np.stack([ndimage.gaussian_filter(lin[..., c], 5) for c in range(3)], -1)
    alb = np.maximum(alb, 0.004)
    light = lin / alb
    region = pm > 0.002
    S_ = float(np.percentile(light[region].max(axis=1), 99.7)) * 1.05

    out = os.path.join(MOCK, pid)
    os.makedirs(out, exist_ok=True)
    Image.fromarray(to_srgb8(light / S_) * region[..., None]).save(os.path.join(out, 'light.webp'), quality=94, method=6)
    Image.fromarray(to_srgb8(alb) * region[..., None]).save(os.path.join(out, 'albedo.webp'), quality=95, method=6)
    Image.fromarray(np.zeros((SIZE, SIZE, 3), np.uint8)).save(os.path.join(out, 'spec.webp'), quality=80)
    ph = Image.fromarray(to_srgb8(lin))
    ph.save(os.path.join(out, 'photo.webp'), quality=88, method=6)
    ph.resize((240, 240), Image.LANCZOS).save(os.path.join(out, 'thumb.webp'), quality=82, method=6)
    ui = (np.clip(u, 0, 1) * 4095 + 0.5).astype(np.uint16)
    vi = (np.clip(v, 0, 1) * 4095 + 0.5).astype(np.uint16)
    uvp = np.zeros((SIZE, SIZE, 3), np.uint8)
    uvp[..., 0] = (ui >> 4) & 255
    uvp[..., 1] = (vi >> 4) & 255
    uvp[..., 2] = ((ui & 15) << 4) | (vi & 15)
    uvp[~valid] = 0
    Image.fromarray(uvp).save(os.path.join(out, 'uv.png'), optimize=True)
    mk = np.zeros((SIZE, SIZE, 3), np.uint8)
    mk[..., 0] = (pm * 255 + 0.5).astype(np.uint8)
    mk[..., 2] = valid.astype(np.uint8) * 255
    Image.fromarray(mk).save(os.path.join(out, 'mask.png'), optimize=True)

    # print aspect: the quad's mean width over its mean height, in pixels
    (a, b, c, d) = [np.array(p) for p in quad]
    qw = (np.linalg.norm(b - a) + np.linalg.norm(c - d)) / 2
    qh = (np.linalg.norm(d - a) + np.linalg.norm(c - b)) / 2
    if k:
        qw *= 1 + 0.57 * k                     # unrolled, the front of a cylinder is wider than it looks
    meta = {
        'size': [SIZE, SIZE], 'lightScale': round(S_, 4), 'specScale': 0.0, 'tintable': False,
        'printAspect': round(qw / qh, 4), 'default': cfg['default'], 'baseLinear': [0.8, 0.8, 0.8],
        'presets': {'center': cfg['default']}, 'source': 'blank',
    }
    man_path = os.path.join(MOCK, 'manifest.json')
    man = json.load(open(man_path))
    man[pid] = meta
    json.dump(man, open(man_path, 'w'), indent=2, ensure_ascii=False)
    print(f'[{pid}] from blank  aspect={qw / qh:.2f}')


if __name__ == '__main__':
    src = sys.argv[1]
    args = [a for a in sys.argv[2:] if not a.startswith('--') and not a.endswith('.png')]
    names = args or list(Q)
    if '--preview' in sys.argv:
        T = 400
        cols = 5
        rows = (len(names) + cols - 1) // cols
        sheet = Image.new('RGB', (T * cols, T * rows), 'white')
        for i, n in enumerate(names):
            sheet.paste(build(src, n, Q[n], preview=True).resize((T, T)), ((i % cols) * T, (i // cols) * T))
        sheet.save(sys.argv[-1] if sys.argv[-1].endswith('.png') else 'preview.png')
    else:
        for n in names:
            build(src, n, Q[n])
