"""Regenerate thumb.webp for every rendered product (plain Python + Pillow)."""
import os
import sys

from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'mockups')
sys.path.insert(0, os.path.dirname(__file__))


def make_thumb(photo, path, size=240):
    w, h = photo.size
    c = int(min(w, h) * 0.82)
    box = ((w - c) // 2, (h - c) // 2, (w + c) // 2, (h + c) // 2)
    photo.crop(box).resize((size, size), Image.LANCZOS).save(path, quality=82, method=6)


for name in sorted(os.listdir(ROOT)):
    src = os.path.join(ROOT, name, 'photo.webp')
    if os.path.exists(src):
        make_thumb(Image.open(src).convert('RGB'), os.path.join(ROOT, name, 'thumb.webp'))
        print('thumb', name)
