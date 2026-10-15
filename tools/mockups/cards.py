"""Bake the product-card photos (assets/mockups/<id>/card.webp) with the logo on them.

Same compositing as js/mockup.js (print mode), in numpy, so the "What we make"
section can show real products without loading the full studio data.
Run again after replacing assets/logo.png:

    python tools/mockups/cards.py
"""
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MOCK = os.path.join(ROOT, 'assets', 'mockups')

# product: (tint or None, ink or None = original logo colours, size factor)
CARDS = {
    'tee': ('#f2f1ee', None, 1.0),
    'polo': ('#1f2b4a', '#f6f4ef', 1.0),
    'polo_ls': ('#f2f1ee', None, 1.0),
    'hoodie': ('#262626', '#f6f4ef', 1.0),
    'apron': ('#262626', '#f6f4ef', 1.0),
    'cap': ('#1f2b4a', '#f6f4ef', 1.0),
    'zipper': ('#262626', '#b9bec6', 1.0),
    'label': ('#262626', '#f6f4ef', 1.0),
    'patch': ('#b07a4b', 'burn', 1.0),
    'hangtag': ('#c7a97f', '#141414', 1.0),
    'notebook': ('#262626', '#d4af37', 1.0),
    'pen': ('#262626', '#c8ccd2', 1.0),
    'flag': ('#1f2b4a', '#f6f4ef', 1.0),
    'cards': ('#f4f3ef', None, 1.0),
    'mug': ('#f4f3ef', None, 1.0),
    'mousepad': ('#f2f1ee', None, 1.0),
    'keychain': (None, 'burn', 1.0),
    'tote': ('#e8dcc4', '#141414', 1.0),
    'tumbler': ('#1f2b4a', '#c8ccd2', 1.0),
}


def to_lin(c):
    c = c.astype(np.float32) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def hex_lin(h):
    return to_lin(np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32))


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


def bake(pid, meta, tint, ink, logo):
    photo = to_lin(load(pid, 'photo.webp'))
    light = to_lin(load(pid, 'light.webp')) * meta['lightScale']
    alb0 = to_lin(load(pid, 'albedo.webp'))
    spec = to_lin(load(pid, 'spec.webp')) * meta.get('specScale', 0)
    mask = load(pid, 'mask.png').astype(np.float32) / 255.0
    uvp = load(pid, 'uv.png').astype(np.int32)
    pm, tm, valid = mask[..., 0], mask[..., 1], mask[..., 2] > 0.5

    alb = alb0.copy()
    if tint and meta.get('tintable'):
        base = np.maximum(np.array(meta['baseLinear'], np.float32), 0.02)
        tex = 1 + (np.clip(alb0 / base, 0.6, 1.4) - 1) * 0.65
        alb = np.where(tm[..., None] > 0.001, hex_lin(tint) * tex, alb0)

    u = ((uvp[..., 0] << 4) | (uvp[..., 2] >> 4)) / 4095.0
    v = ((uvp[..., 1] << 4) | (uvp[..., 2] & 15)) / 4095.0
    if meta.get('flipV'):
        v = 1 - v
    d = meta['default']
    aspect = meta['printAspect']
    dx = u - d['u']
    dx = (dx - np.floor(dx + 0.5)) * aspect
    dy = v - d['v']
    W = d['w'] * aspect
    tx = dx / W + 0.5
    ty = dy / W + 0.5
    inside = valid & (tx >= 0) & (tx <= 1) & (ty >= 0) & (ty <= 1)
    n = logo.shape[0]
    samp = np.zeros(photo.shape[:2] + (4,), np.float32)
    samp[inside] = bilinear(logo, tx[inside] * (n - 1), (1 - ty[inside]) * (n - 1))
    a = (samp[..., 3] * pm)[..., None]
    if ink == 'burn':  # laser: burn into wood or leather
        dcol = alb * np.array([0.42, 0.33, 0.27], np.float32)
    elif ink:
        dcol = np.broadcast_to(hex_lin(ink), photo.shape)
    else:
        dcol = to_lin(np.clip(samp[..., :3] / np.maximum(samp[..., 3:4], 1e-3), 0, 1) * 255)
    newalb = alb * (1 - a * 0.97) + dcol * a * 0.97
    cover = np.maximum(pm, tm)[..., None]
    product = newalb * light + spec
    out = photo * (1 - cover) + product * cover
    img = Image.fromarray((to_srgb(out) * 255 + 0.5).astype(np.uint8))
    w, h = img.size
    c = int(min(w, h) * 0.86)
    img = img.crop(((w - c) // 2, (h - c) // 2, (w + c) // 2, (h + c) // 2)).resize((640, 640), Image.LANCZOS)
    img.save(os.path.join(MOCK, pid, 'card.webp'), quality=84, method=6)
    print('card', pid)


def main():
    man = json.load(open(os.path.join(MOCK, 'manifest.json')))
    logo = logo_square()
    for pid, (tint, ink, _) in CARDS.items():
        if pid in man and os.path.exists(os.path.join(MOCK, pid, 'spec.webp')):
            bake(pid, man[pid], tint, ink, logo)


if __name__ == '__main__':
    main()
