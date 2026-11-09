"""Tileable fabric normal maps for garments that come without a fabric texture.

    python tools/three_d/fabric.py <out_dir>

jersey.png  single jersey knit (T-shirts, polos): columns of interlocking V loops
fleece.png  brushed fleece (hoodies): soft, fine, irregular
rib.png     1x1 rib (cuffs, hems, collars): vertical ribs
Each is 512 x 512, tangent-space, OpenGL convention (green = up), which is what glTF expects.
"""
import os
import sys

import numpy as np
from PIL import Image

N = 512


def normal_map(h, strength):
    """Height field (rows top to bottom) to a tangent-space normal map; wraps at the edges (tileable)."""
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    dy = (np.roll(h, 1, 0) - np.roll(h, -1, 0)) * 0.5      # image rows run down, v runs up
    n = np.stack([-dx * strength, -dy * strength, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return Image.fromarray(((n * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8))


def tile_noise(scale, seed, octaves=3):
    """Smooth periodic noise from a few random Fourier waves (tiles exactly)."""
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:N, 0:N] / N
    out = np.zeros((N, N))
    for o in range(octaves):
        f = scale * 2 ** o
        for _ in range(8):
            kx, ky = rng.integers(-f, f + 1, 2)
            ph = rng.uniform(0, 2 * np.pi)
            out += np.cos(2 * np.pi * (kx * x + ky * y) + ph) / (2 ** o)
    return out / np.abs(out).max()


def jersey(cols=24, rows=32):
    y, x = np.mgrid[0:N, 0:N] / N
    cx = (x * cols) % 1.0
    lean = np.where(cx < 0.5, cx, 1 - cx)                  # the two legs of each loop lean in: a V
    cy = (y * rows + lean * 0.9) % 1.0
    h = np.sin(np.pi * cx) ** 0.6 * (0.55 + 0.45 * np.sin(np.pi * cy) ** 0.8)
    h += 0.12 * tile_noise(6, 1)                            # yarn unevenness
    return normal_map(h, 7.0)


def fleece():
    h = 0.6 * tile_noise(48, 2, 2) + 0.4 * tile_noise(12, 3, 2)
    y, x = np.mgrid[0:N, 0:N] / N
    h += 0.15 * np.sin(np.pi * ((x * 28) % 1.0)) ** 0.6    # the knit just showing through the brushing
    return normal_map(h, 3.0)


def rib(cols=20):
    y, x = np.mgrid[0:N, 0:N] / N
    h = np.sin(np.pi * ((x * cols) % 1.0)) ** 1.5 + 0.08 * tile_noise(8, 4)
    return normal_map(h, 9.0)


if __name__ == '__main__':
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    for name, fn in (('jersey', jersey), ('fleece', fleece), ('rib', rib)):
        fn().save(os.path.join(out, f'{name}.png'))
        print('wrote', name)
