"""Turn a real (or stock) product photo into a studio-ready mockup in assets/mockups/<id>/.

The photo is a blank, light-coloured product (no logo) cut out from its background
(photos/<id>/photo.jpg|png + photos/<id>/alpha.png, e.g. made with `rembg`, or straight from
a vector file's shapes). This script:

  * puts it on the same warm paper backdrop as the rendered shots, carrying its own
    floor shadow over, and relights it a little from the left like the rest
  * splits it into the passes js/mockup.js uses: light (shading and knit), a flat
    albedo, a soft sheen, the print area and its UV map (with a gentle wrap around
    the body and a displacement that follows the folds), so the studio can recolour
    it and lay any logo into the folds

    python tools/mockups/from_photo.py            # every photo product
    python tools/mockups/from_photo.py hoodie

Then run cards.py to refresh the product card and the hero slide.
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
MOCK = os.path.join(ROOT, 'assets', 'mockups')
SIZE = 1200
ALB = 0.80          # linear albedo the shot is treated as (white fabric)
SHEEN = 0.03        # sheen added on top, what keeps dark colours from going flat

# Coordinates below are pixels of photos/<id>/photo.jpg.
PHOTOS = {
    'hoodie': {
        'height': 0.80, 'top': 0.06,                     # product height and top margin in the square
        'print': [(330, 392), (420, 284), (560, 300), (615, 306), (680, 300), (815, 282), (915, 395),
                  (852, 640), (852, 1062), (380, 1062), (384, 640)],
        'cut': [([(563, 284), (572, 300), (575, 400), (577, 500), (578, 600), (578, 707)], 11),     # drawcords
                ([(672, 287), (667, 300), (664, 400), (661, 500), (661, 600), (662, 709)], 11)],
        'uv': {'cx': 615, 'bottom': 1065, 'W': 500, 'H': 740, 'R': 330, 'displace': 4.0},
        'default': {'u': 0.5, 'v': 0.76, 'w': 0.46},
        'presets': {'center': {'u': 0.5, 'v': 0.76, 'w': 0.46},
                    'chest': {'u': 0.762, 'v': 0.842, 'w': 0.27},
                    'big': {'u': 0.5, 'v': 0.68, 'w': 0.68}},
    },
    # vector illustration (Vecteezy, 3D polo white t-shirt), front view rendered from the EPS
    'polo': {
        'height': 0.80, 'top': 0.07, 'neutral': True, 'grain': 0.018, 'exposure': 0.95, 'contrast': 1.35,
        'drop': {'gap': 0.05, 'rx': 0.34, 'ry': 0.022, 'strength': 0.5},
        'print': [(205, 225), (450, 125), (555, 300), (670, 210), (780, 300), (890, 125), (1140, 225),
                  (1045, 690), (1062, 1700), (270, 1700), (295, 690)],
        'cut': [([(670, 200), (670, 462)], 74)],                          # placket and buttons
        'uv': {'cx': 670, 'bottom': 1700, 'W': 784, 'H': 1500, 'R': 520, 'displace': 4.0},
        'default': {'u': 0.748, 'v': 0.853, 'w': 0.17},
        'presets': {'chest': {'u': 0.748, 'v': 0.853, 'w': 0.17},
                    'center': {'u': 0.5, 'v': 0.667, 'w': 0.42},
                    'big': {'u': 0.5, 'v': 0.6, 'w': 0.62}},
    },
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


def polyfit_surface(img, keep, deg=3):
    """Smooth per-channel surface fitted through the pixels where `keep` is true."""
    h, w = keep.shape
    yy, xx = np.mgrid[0:h, 0:w]
    xs, ys = xx / w - 0.5, yy / h - 0.5
    terms = [xs ** i * ys ** j for i in range(deg + 1) for j in range(deg + 1 - i)]
    A = np.stack([t[keep] for t in terms], 1)
    out = np.zeros(img.shape, np.float32)
    for c in range(img.shape[2]):
        coef, *_ = np.linalg.lstsq(A, img[..., c][keep], rcond=None)
        out[..., c] = sum(k * t for k, t in zip(coef, terms))
    return out


def backdrop():
    """The rendered garments' paper backdrop, as a smooth surface (fitted on the tee shot)."""
    p = to_lin(np.array(Image.open(os.path.join(MOCK, 'tee', 'photo.webp')).convert('RGB')))
    m = np.array(Image.open(os.path.join(MOCK, 'tee', 'mask.png')))[..., 1] > 0
    keep = ~ndimage.binary_dilation(m, iterations=45)
    bg = polyfit_surface(p, keep)
    rng = np.random.default_rng(3)
    grain = ndimage.gaussian_filter(rng.standard_normal(bg.shape[:2]).astype(np.float32), 0.8) * 0.006
    return np.clip(bg * (1 + grain[..., None]), 0, 1)


def build(pid, cfg):
    folder = os.path.join(HERE, 'photos', pid)
    name = next(f for f in sorted(os.listdir(folder)) if f.startswith('photo.'))
    src = np.array(Image.open(os.path.join(folder, name)).convert('RGB'))
    alpha = np.array(Image.open(os.path.join(HERE, 'photos', pid, 'alpha.png')).convert('L')).astype(np.float32) / 255
    sh, sw = alpha.shape
    lin = to_lin(src)
    # edge pixels still hold some of the old white background: give them the colour of the
    # nearest solid pixel, and tighten the matte, so no light fringe shows on dark colours
    core = alpha > 0.92
    iy, ix = ndimage.distance_transform_edt(~core, return_distances=False, return_indices=True)
    lin_prod = lin[iy, ix]
    edge = np.clip((alpha - 0.3) / 0.45, 0, 1)
    edge = edge * edge * (3 - 2 * edge)

    # the photo's own floor shadow: how much darker than its clean backdrop each pixel is
    solid = alpha > 0.02
    clear = ~ndimage.binary_dilation(solid, iterations=25) & (lum(lin) > 0.80)
    bg0 = polyfit_surface(lin, clear, deg=2)
    shadow = np.clip(lum(lin) / np.maximum(lum(bg0), 1e-3), 0, 1)
    shadow = np.where(solid, 1.0, shadow)
    shadow = ndimage.gaussian_filter(shadow, 1.5) ** 0.9

    # place it in the square
    ys, xs = np.nonzero(alpha > 0.5)
    s = cfg['height'] * SIZE / (ys.max() - ys.min())
    ox = SIZE / 2 - (xs.min() + xs.max()) / 2 * s
    oy = cfg['top'] * SIZE - ys.min() * s

    def place(a, order=1, fill=0.0):
        """Resample a photo-space array into the square."""
        yy, xx = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32)
        px, py = (xx + 0.5 - ox) / s - 0.5, (yy + 0.5 - oy) / s - 0.5
        if a.ndim == 2:
            return ndimage.map_coordinates(a, [py, px], order=order, mode='constant', cval=fill)
        return np.stack([ndimage.map_coordinates(a[..., c], [py, px], order=order, mode='constant', cval=fill)
                         for c in range(a.shape[2])], -1)

    A = np.clip(place(edge), 0, 1)
    P = np.clip(place(lin_prod, fill=1.0), 0, 1)
    SH = np.clip(place(shadow, fill=1.0), 0, 1)
    bd = backdrop()
    yy, xx = np.mgrid[0:SIZE, 0:SIZE]
    if 'drop' in cfg:
        # artwork with no floor shadow of its own: a soft one under the hem, like the hoodie's
        fy, fx = np.nonzero(A > 0.5)
        w_, h_ = fx.max() - fx.min(), fy.max() - fy.min()
        dr = cfg['drop']
        cx_, cy_ = (fx.min() + fx.max()) / 2, fy.max() + dr['gap'] * h_
        blob = np.exp(-(((xx - cx_) / (dr['rx'] * w_)) ** 2 + ((yy - cy_) / (dr['ry'] * h_)) ** 2) * 1.6)
        SH = SH * (1 - dr['strength'] * ndimage.gaussian_filter(blob, 6))
    if cfg.get('contrast'):
        # soft illustration shading: deepen the folds a little so dark colours keep their shape
        m_ = lum(P)[A > 0.5].mean()
        P = P * ((np.maximum(lum(P), 1e-4) / m_) ** (cfg['contrast'] - 1))[..., None]
    if cfg.get('neutral'):
        # an illustration's colour cast is not the fabric's: keep only the shading
        P = np.repeat(lum(P)[..., None], 3, -1)
    if cfg.get('grain'):
        rng = np.random.default_rng(5)
        g = ndimage.gaussian_filter(rng.standard_normal((SIZE, SIZE)).astype(np.float32), 0.7)
        g += 0.5 * ndimage.gaussian_filter(rng.standard_normal((SIZE, SIZE)).astype(np.float32), 2.0)
        P = P * (1 + cfg['grain'] * g / g.std())[..., None]

    # relight: the studio key light comes from the left, and the room is warm
    side = (lum(bd) / lum(bd).mean()) ** 0.3
    side = ndimage.gaussian_filter(side, 40)
    warm = np.array([1.0, 0.985, 0.955], np.float32)
    prod = P * (cfg.get('exposure', 0.86) * side)[..., None] * warm

    # split into the compositor's passes: prod = ALB * light + sheen
    L0 = lum(prod) / ALB
    sheen = SHEEN * np.clip(L0, 0, 2) ** 2
    light = np.clip((prod - sheen[..., None]) / ALB, 0, None)

    back = bd * SH[..., None]
    photo = back * (1 - A[..., None]) + (ALB * light + sheen[..., None]) * A[..., None]

    # print area: the front panel, minus whatever lies on top of it (drawcords)
    img = Image.new('L', (SIZE * 2, SIZE * 2), 0)
    d = ImageDraw.Draw(img)
    T = lambda p: ((p[0] * s + ox) * 2, (p[1] * s + oy) * 2)
    d.polygon([T(p) for p in cfg['print']], fill=255)
    for line, width in cfg.get('cut', []):
        d.line([T(p) for p in line], fill=0, width=int(width * s * 2), joint='curve')
    pm = np.asarray(img.resize((SIZE, SIZE), Image.LANCZOS), np.float32) / 255 * A
    tm = A

    # UV: around a gentle cylinder across the body, up the front; folds nudge the print
    uvc = cfg['uv']
    px, py = (xx + 0.5 - ox) / s, (yy + 0.5 - oy) / s
    dx = np.clip((px - uvc['cx']) / uvc['R'], -0.999, 0.999)
    u = 0.5 + uvc['R'] * np.arcsin(dx) / uvc['W']
    v = (uvc['bottom'] - py) / uvc['H']
    shade = ndimage.gaussian_filter(lum(light), 3.0)
    ref = shade[pm > 0.5].mean() if (pm > 0.5).any() else 1.0
    disp = (shade / max(ref, 1e-3) - 1.0) * uvc['displace'] / s
    u = u + disp / uvc['W']
    v = v + disp / uvc['H']
    valid = pm > 0.5

    # ---- write the assets (same encodings as lib.render_product)
    out = os.path.join(MOCK, pid)
    os.makedirs(out, exist_ok=True)
    region = np.maximum(pm, tm) > 0.002
    S_ = float(np.percentile(light[region].max(axis=1), 99.7)) * 1.05
    Image.fromarray(to_srgb8(light / S_) * region[..., None]).save(os.path.join(out, 'light.webp'), quality=92, method=6)
    alb = np.zeros_like(light)
    alb[region] = ALB
    Image.fromarray(to_srgb8(alb)).save(os.path.join(out, 'albedo.webp'), quality=95, method=6)
    SP = float(np.percentile(sheen[region], 99.8)) * 1.05
    spec = np.repeat((sheen / SP)[..., None], 3, -1) * region[..., None]
    Image.fromarray(to_srgb8(spec)).filter(ImageFilter.GaussianBlur(1.0)).save(os.path.join(out, 'spec.webp'), quality=86, method=6)
    ph = Image.fromarray(to_srgb8(photo))
    ph.save(os.path.join(out, 'photo.webp'), quality=90, method=6)
    c = int(SIZE * 0.82)
    ph.crop(((SIZE - c) // 2,) * 2 + ((SIZE + c) // 2,) * 2).resize((240, 240), Image.LANCZOS).save(
        os.path.join(out, 'thumb.webp'), quality=82, method=6)
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
    mk[..., 1] = (tm * 255 + 0.5).astype(np.uint8)
    mk[..., 2] = valid.astype(np.uint8) * 255
    Image.fromarray(mk).save(os.path.join(out, 'mask.png'), optimize=True)

    meta = {
        'size': [SIZE, SIZE], 'lightScale': round(S_, 4), 'specScale': round(SP, 4), 'tintable': True,
        'printAspect': uvc['W'] / uvc['H'], 'default': cfg['default'],
        'baseLinear': [ALB, ALB, ALB], 'presets': cfg['presets'], 'source': 'photo',
    }
    man_path = os.path.join(MOCK, 'manifest.json')
    man = json.load(open(man_path))
    man[pid] = meta
    json.dump(man, open(man_path, 'w'), indent=2, ensure_ascii=False)
    print(f'[{pid}] from photo  lightScale={S_:.3f}')


if __name__ == '__main__':
    names = sys.argv[1:] or list(PHOTOS)
    for n in names:
        build(n, PHOTOS[n])
