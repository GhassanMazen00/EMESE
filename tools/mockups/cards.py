"""Bake the logo onto product photos for the parts of the site that don't need the live studio:

  assets/mockups/<id>/card.webp   product cards in "What we make" (640 px, cropped in)
  assets/mockups/<id>/hero.webp   the swipeable proof card at the top of the page (960 px)

Same compositing as js/mockup.js, every technique (print, sublimation, UV, embroidery,
laser, foil), in numpy, so those parts of the page are plain images: light and instant.
Run again after replacing assets/logo.png:

    python tools/mockups/cards.py
"""
import json
import os
import re

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MOCK = os.path.join(ROOT, 'assets', 'mockups')

# technique -> (shader mode, settings); mirrors TECHS in js/catalog.js
TECH = {
    'dtf': ('print', {}), 'screen': ('print', {}), 'digital': ('print', {}),
    'sub': ('dye', {}),
    'uv': ('uv', {'gloss': 0.12}), 'uvdtf': ('uv', {'gloss': 0.5}),
    'stitch': ('stitch', {}), 'woven': ('stitch', {'pitch': 0.00032, 'relief': 0.12}),
    'laser': ('laser', {}), 'foil': ('foil', {}),
}

# product cards: tint (None keeps the shot), technique, ink (None = the logo's own colours; foil colour for foil),
# optionally a design of the customer's own and the preset it sits at (default: assets/logo.png at the default spot)
STREETWEAR = {'design': 'assets/designs/emese-streetwear.png', 'place': 'chest'}
CARDS = {
    'tee': ('#f2f1ee', 'dtf', None),
    'polo': ('#1f2b4a', 'stitch', '#f6f4ef'),
    'polo_ls': ('#f2f1ee', 'stitch', None),
    'hoodie': (None, 'dtf', None, STREETWEAR),
    'apron': ('#262626', 'dtf', '#f6f4ef'),
    'cap': ('#1f2b4a', 'stitch', '#f6f4ef'),
    'zipper': ('#262626', 'laser', None),
    'label': ('#262626', 'woven', '#f6f4ef'),
    'patch': ('#b07a4b', 'laser', None),
    'hangtag': ('#c7a97f', 'digital', '#141414'),
    'notebook': ('#262626', 'foil', '#d4af37'),
    'pen': ('#262626', 'laser', None),
    'flag': ('#1f2b4a', 'dtf', '#f6f4ef'),
    'cards': ('#f4f3ef', 'digital', None),
    'mug': ('#f4f3ef', 'sub', None),
    'mousepad': ('#f2f1ee', 'sub', None),
    'keychain': (None, 'laser', None),
    'tote': ('#e8dcc4', 'screen', '#141414'),
    'tumbler': ('#1f2b4a', 'laser', None),
}

# how much of the shot the card shows (products that fill the frame need it all)
CARD_CROP = {'cap': 1.0, 'hoodie': 0.93, 'polo': 0.93, 'polo_ls': 0.93}

# hero slides, in the order index.html lists them
HERO = [
    ('polo', '#1f2b4a', 'stitch', '#f6f4ef'),
    ('hoodie', None, 'dtf', None, STREETWEAR),
    ('cap', '#1f2b4a', 'stitch', '#f6f4ef'),
    ('tee', '#f2f1ee', 'dtf', None),
    ('zipper', '#262626', 'laser', None),
    ('label', '#262626', 'woven', '#f6f4ef'),
    ('mug', '#f4f3ef', 'sub', None),
    ('notebook', '#262626', 'foil', '#d4af37'),
    ('patch', '#b07a4b', 'laser', None),
    ('polo_ls', '#f2f1ee', 'stitch', None),
    ('apron', '#262626', 'dtf', '#f6f4ef'),
    ('tumbler', '#1f2b4a', 'laser', None),
    ('cards', '#161616', 'foil', '#d4af37'),
    ('hangtag', '#c7a97f', 'digital', '#141414'),
    ('tote', '#e8dcc4', 'screen', '#141414'),
    ('pen', '#262626', 'laser', None),
    ('flag', '#1f2b4a', 'sub', '#f6f4ef'),
    ('keychain', None, 'laser', None),
]


def catalog():
    """widthM and reveal per product, read from js/catalog.js (single source of truth)."""
    src = open(os.path.join(ROOT, 'js', 'catalog.js'), encoding='utf-8').read()
    out = {}
    for m in re.finditer(r"\{ id: '(\w+)'([^}]*)\}", src):
        w = re.search(r'widthM: ([\d.]+)', m.group(2))
        out[m.group(1)] = (float(w.group(1)) if w else 0.3, 'reveal: true' in m.group(2))
    return out


def to_lin(c):
    c = c.astype(np.float32) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def hex_lin(h):
    return to_lin(np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32))


def lum(c):
    return c[..., 0] * 0.2126 + c[..., 1] * 0.7152 + c[..., 2] * 0.0722


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def load(pid, name):
    return np.array(Image.open(os.path.join(MOCK, pid, name)).convert('RGB'))


def bilinear(img, x, y):
    h, w = img.shape[:2]
    x = np.clip(x, 0, w - 1.001)
    y = np.clip(y, 0, h - 1.001)
    x0 = np.floor(x).astype(int)
    y0 = np.floor(y).astype(int)
    fx = (x - x0)[..., None]
    fy = (y - y0)[..., None]
    a = img[y0, x0] * (1 - fx) + img[y0, x0 + 1] * fx
    b = img[y0 + 1, x0] * (1 - fx) + img[y0 + 1, x0 + 1] * fx
    return a * (1 - fy) + b * fy


def logo_square(size=1024, pad=0.02):
    img = Image.open(os.path.join(ROOT, 'assets', 'logo.png')).convert('RGBA')
    k = size * (1 - 2 * pad) / max(img.size)
    img = img.resize((max(1, int(img.width * k)), max(1, int(img.height * k))), Image.LANCZOS)
    sq = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    sq.paste(img, ((size - img.width) // 2, (size - img.height) // 2), img)
    return np.array(sq).astype(np.float32) / 255.0


def design(logo, tx, ty, alpha_only=False):
    """Sample the design at design-space coordinates (0..1, y up); transparent outside."""
    n = logo.shape[0]
    inside = (tx >= 0) & (tx <= 1) & (ty >= 0) & (ty <= 1)
    out = np.zeros(tx.shape + ((1,) if alpha_only else (4,)), np.float32)
    if inside.any():
        s = bilinear(logo[..., 3:4] if alpha_only else logo, tx[inside] * (n - 1), (1 - ty[inside]) * (n - 1))
        out[inside] = s
    return out[..., 0] if alpha_only else out


def design_square(path):
    img = Image.open(os.path.join(ROOT, path)).convert('RGBA')
    side = max(img.size)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(img, ((side - img.width) // 2, (side - img.height) // 2), img)
    return np.array(sq.resize((1024, 1024), Image.LANCZOS)).astype(np.float32) / 255.0


def composite(pid, meta, tint, tech, ink, logo, width_m=0.3, reveal=False, place=None):
    photo = to_lin(load(pid, 'photo.webp'))
    L = to_lin(load(pid, 'light.webp')) * meta['lightScale']
    alb0 = to_lin(load(pid, 'albedo.webp'))
    spec = to_lin(load(pid, 'spec.webp')) * meta.get('specScale', 0)
    mask = load(pid, 'mask.png').astype(np.float32) / 255.0
    uvp = load(pid, 'uv.png').astype(np.int32)
    pm, tm, valid = mask[..., 0], mask[..., 1], mask[..., 2] > 0.5
    mode, opts = TECH[tech]

    alb = alb0.copy()
    if tint and meta.get('tintable'):
        base = np.maximum(np.array(meta['baseLinear'], np.float32), 0.02)
        tex = 1 + (np.clip(alb0 / base, 0.6, 1.4) - 1) * 0.65
        alb = np.where(tm[..., None] > 0.001, hex_lin(tint) * tex, alb0)

    u = ((uvp[..., 0] << 4) | (uvp[..., 2] >> 4)) / 4095.0
    v = ((uvp[..., 1] << 4) | (uvp[..., 2] & 15)) / 4095.0
    # anti-aliased edges have no valid uv: borrow a neighbour's, like the shader does
    ok = valid.copy()
    for k in range(8):
        a = k * np.pi / 4
        dx, dy = int(round(np.cos(a) * 1.5)), int(round(np.sin(a) * 1.5))
        nv = np.roll(np.roll(valid, dy, 0), dx, 1)
        take = ~ok & nv & (pm > 0.001)
        u = np.where(take, np.roll(np.roll(u, dy, 0), dx, 1), u)
        v = np.where(take, np.roll(np.roll(v, dy, 0), dx, 1), v)
        ok |= take
    if meta.get('flipV'):
        v = 1 - v
    d = (meta.get('presets') or {}).get(place) or meta['default']
    aspect = meta['printAspect']
    W = d['w'] * aspect
    ddx = u - d['u']
    ddx = (ddx - np.floor(ddx + 0.5)) * aspect
    tx = ddx / W + 0.5
    ty = (v - d['v']) / W + 0.5
    on = ok & (pm > 0.001)
    # like the studio's mipmaps: shrink the design to about the size it lands on the photo,
    # so thin strokes average out instead of breaking up
    if on.sum() > 16:
        gy, gx = np.gradient(np.where(on, tx, np.nan))
        step = np.nanmedian(np.hypot(gx, gy)[on])
        want = int(np.clip(2.0 / max(step, 1e-6), 64, logo.shape[0]))
        if want < logo.shape[0]:
            logo = np.asarray(Image.fromarray((logo * 255 + 0.5).astype(np.uint8), 'RGBA')
                              .resize((want, want), Image.LANCZOS)).astype(np.float32) / 255.0

    dz = np.zeros(photo.shape[:2] + (4,), np.float32)
    dz[on] = design(logo, tx[on], ty[on])
    a = (dz[..., 3] * pm)[..., None]
    if ink:
        dcol = np.broadcast_to(hex_lin(ink), photo.shape)
    else:
        dcol = to_lin(np.clip(dz[..., :3] / np.maximum(dz[..., 3:4], 1e-3), 0, 1) * 255)

    phys = max(d['w'] * width_m, 0.001)
    e = 0.0009 / phys
    relief = np.zeros(photo.shape[:2], np.float32)

    def A(ox, oy):
        r = np.zeros(photo.shape[:2], np.float32)
        r[on] = design(logo, tx[on] + ox, ty[on] + oy, alpha_only=True)
        return r
    if mode != 'dye':
        relief = (-(A(e, 0) - A(-e, 0)) + (A(0, e) - A(0, -e))) * 0.5
    relief = relief[..., None]
    hl = np.clip(lum(L) / 1.2, 0, 1)[..., None]

    base, mod, extra, glow = alb, 1.0, 0.0, 0.0
    if mode == 'print':
        base = alb * (1 - a * 0.97) + dcol * a * 0.97
        mod = 1 + relief * 0.12 * a
        extra = a * 0.02 * hl
    elif mode == 'dye':
        tgt = dcol * alb / np.maximum(lum(alb0), 0.2)[..., None]
        base = alb * (1 - a * 0.93) + tgt * a * 0.93
    elif mode == 'uv':
        base = alb * (1 - a) + dcol * a
        mod = 1 + relief * 0.45
        extra = a * opts.get('gloss', 0.15) * hl ** 4
    elif mode == 'stitch':
        pitch, rel = opts.get('pitch', 0.0011), opts.get('relief', 1.0)
        n = phys / pitch
        sc = (tx * np.cos(0.8) + ty * np.sin(0.8)) * n
        st = np.mod(sc, 1.0)[..., None]
        thread = 0.72 + 0.28 * smoothstep(0.0, 0.5, st) * smoothstep(1.0, 0.5, st)
        # threads finer than the pixels would alias into broken letters: average them out
        gy, gx = np.gradient(np.where(on, sc, 0.0))
        fw = np.where(on, np.minimum(np.abs(gx) + np.abs(gy), 5.0), 0.0)[..., None]
        thread = thread + (0.86 - thread) * np.clip((fw - 0.3) / 0.3, 0, 1)
        base = alb * (1 - a) + dcol * thread * a
        shadow = A(-e * 1.4, e * 1.4)[..., None] * (1 - a)
        mod = (1 + relief * 0.9 * rel) * (1 - shadow * 0.35 * rel)
        extra = a * 0.05 * hl * thread
    elif mode == 'laser':
        burned = alb * np.array([0.42, 0.33, 0.27], np.float32)
        frosted = alb + np.array([0.16, 0.15, 0.14], np.float32)
        revealed = 0.62 * 0.88 + alb * 0.12
        tgt = revealed if reveal else np.where((lum(alb) < 0.06)[..., None], frosted, burned)
        base = alb * (1 - a) + tgt * a
        mod = 1 - relief * 0.35
    elif mode == 'foil':
        foil = hex_lin(ink or '#d4af37')
        base = alb * (1 - a) + foil * 0.45 * a
        mod = 1 - relief * 0.4
        glow = foil * a * (0.16 + 0.42 * smoothstep(0.0, 1.0, hl)) * (1 + relief * 0.6)

    cover = np.maximum(pm, tm)[..., None]
    product = base * mod * L + spec + extra * L + glow
    out = photo * (1 - cover) + product * cover
    return Image.fromarray((to_srgb(out) * 255 + 0.5).astype(np.uint8))


def main():
    man = json.load(open(os.path.join(MOCK, 'manifest.json')))
    cat = catalog()
    logo = logo_square()
    ready = lambda pid: pid in man and os.path.exists(os.path.join(MOCK, pid, 'spec.webp'))

    def make(pid, tint, tech, ink, extra=None):
        w, rv = cat.get(pid, (0.3, False))
        art = design_square(extra['design']) if extra else logo
        return composite(pid, man[pid], tint, tech, ink, art, w, rv, place=extra and extra.get('place'))
    for pid, (tint, tech, ink, *extra) in CARDS.items():
        if not ready(pid):
            continue
        img = make(pid, tint, tech, ink, *extra)
        s = img.size[0]
        c = int(s * CARD_CROP.get(pid, 0.86))
        img = img.crop(((s - c) // 2, (s - c) // 2, (s + c) // 2, (s + c) // 2)).resize((640, 640), Image.LANCZOS)
        img.save(os.path.join(MOCK, pid, 'card.webp'), quality=84, method=6)
        print('card', pid)
    for pid, tint, tech, ink, *extra in HERO:
        if not ready(pid):
            continue
        img = make(pid, tint, tech, ink, *extra).resize((960, 960), Image.LANCZOS)
        img.save(os.path.join(MOCK, pid, 'hero.webp'), quality=80, method=6)
        print('hero', pid)


if __name__ == '__main__':
    main()
