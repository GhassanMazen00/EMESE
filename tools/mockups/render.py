"""Render EMESE product mockups into assets/mockups/<id>/ (products made from photos: from_photo.py).

Usage (needs the `bpy` package, i.e. Blender as a Python module):
    python tools/mockups/render.py                # every product
    python tools/mockups/render.py tee mug        # some products
    python tools/mockups/render.py tee --quick    # fast low-sample preview
    python tools/mockups/render.py tee --res 600  # smaller test size
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import lib  # noqa: E402
import products  # noqa: E402
import garments  # noqa: E402
import accessories  # noqa: E402

SCENES = dict(products.SCENES)
SCENES.update(garments.SCENES)
SCENES.update(accessories.SCENES)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))


def main(argv):
    quick = '--quick' in argv
    preview = '--preview' in argv
    res = None
    if '--res' in argv:
        res = int(argv[argv.index('--res') + 1])
    out_root = os.path.join(ROOT, 'assets', 'mockups')
    if '--out' in argv:
        out_root = argv[argv.index('--out') + 1]
    names = [a for a in argv if not a.startswith('--') and not a.isdigit() and a != out_root] or list(SCENES)
    for name in names:
        if res:
            lib.RES = res
        cfg = SCENES[name]()
        lib.render_product(name, os.path.join(out_root, name), quick=quick, preview=preview, **cfg)


if __name__ == '__main__':
    main(sys.argv[1:])
