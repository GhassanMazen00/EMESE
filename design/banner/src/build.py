"""EMESE store banner, 300 x 100 (3:1): "ايميز لتوريدات الملابس".

Writes, for each colourway (dark = main, light = alternative):
  emese-banner.svg           text turned into shapes: looks the same in every app, scales to any size
  emese-banner-editable.svg  the same design with real, editable text (needs the Alexandria font)
Then run export.js for the PDF and PNG files.

    pip install uharfbuzz fonttools
    python design/banner/src/build.py && node design/banner/src/export.js
"""
import base64
import os

import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                   # design/banner
FONTS = os.path.join(ROOT, 'fonts')
W, H = 300, 100

BRAND = 'ايميز'
LINES = ['لتوريدات', 'الملابس']                # read right to left: brand, then these two, top to bottom
MAGENTA = '#e6007e'                             # the dot of the EMESE logo

COLOURWAYS = {
    'dark': {'bg': '#111111', 'brand': '#ffffff', 'lines': '#dcd8d1', 'stitch': '#ece7df', 'stitch_op': 0.62},
    'light': {'bg': '#f3f1ec', 'brand': '#000000', 'lines': '#3a3834', 'stitch': '#000000', 'stitch_op': 0.38},
}

# layout, in banner units (1 unit = 1 px at 300 x 100, or 1 cm on a 300 x 100 cm print)
BIG, SMALL = 52, 18                             # font sizes
LEADING = 1.32                                  # line spacing of the two small lines
STITCH_INSET, STITCH_W, STITCH_DASH = 6.5, 1.1, (1.6, 2.6)


def num(v):
    return ('%.2f' % v).rstrip('0').rstrip('.')


class Face:
    """A font that shapes Arabic with HarfBuzz (letters joined correctly) and draws it as SVG paths."""

    def __init__(self, file, family, weight):
        self.file, self.family, self.weight = os.path.join(FONTS, file), family, weight
        data = open(self.file, 'rb').read()
        self.data = data
        self.tt = TTFont(self.file)
        self.gs = self.tt.getGlyphSet()
        self.upem = self.tt['head'].unitsPerEm
        self.order = self.tt.getGlyphOrder()
        self.hb = hb.Font(hb.Face(data))

    def run(self, text, size, x=0.0, baseline=0.0):
        """Path data, advance width and ink box (x0, y0, x1, y1, y down) of text whose left edge is at x."""
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        hb.shape(self.hb, buf, {})
        k = size / self.upem
        pen, box = SVGPathPen(self.gs, ntos=num), BoundsPen(self.gs)
        cx = 0
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):   # visual order, left to right
            g = self.order[info.codepoint]
            t = (k, 0, 0, -k, x + (cx + pos.x_offset) * k, baseline - pos.y_offset * k)
            self.gs[g].draw(TransformPen(pen, t))
            self.gs[g].draw(TransformPen(box, t))
            cx += pos.x_advance
        return pen.getCommands(), cx * k, box.bounds


HEAVY = Face('Alexandria-Black.ttf', 'Alexandria', 900)
SEMI = Face('Alexandria-SemiBold.ttf', 'Alexandria', 600)


def layout():
    """Where everything goes. The brand word on the right, the magenta dot after it (to its left, as
    Arabic runs right to left), then the two small lines stacked and aligned right."""
    _, wb, bb = HEAVY.run(BRAND, BIG)
    small = [(t, SEMI.run(t, SMALL)[1]) for t in LINES]
    ws = max(w for _, w in small)
    r = BIG * 0.085                              # dot radius
    g_dot, g_lines = BIG * 0.09, BIG * 0.30      # brand to dot, dot to the small lines
    total = ws + g_lines + 2 * r + g_dot + wb
    x0 = (W - total) / 2
    base = H / 2 - (bb[1] + bb[3]) / 2           # the brand word's ink centred top to bottom
    xb = x0 + ws + g_lines + 2 * r + g_dot
    right = x0 + ws
    items = [{'id': 'brand', 'face': HEAVY, 'size': BIG, 'text': BRAND, 'x': xb, 'w': wb, 'base': base, 'role': 'brand'}]
    for i, (t, w) in enumerate(small):
        b = base - (len(small) - 1 - i) * SMALL * LEADING   # last line sits on the brand's baseline
        items.append({'id': f'line{i + 1}', 'face': SEMI, 'size': SMALL, 'text': t, 'x': right - w, 'w': w,
                      'base': b, 'role': 'lines'})
    dot = {'cx': xb - g_dot - r, 'cy': base - r, 'r': r}
    return items, dot


def head(title, extra=''):
    return (f'<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">\n'
            f'<title>{title}</title>\n{extra}')


def frame(c):
    i = STITCH_INSET
    return (f'<rect id="background" width="{W}" height="{H}" fill="{c["bg"]}"/>\n'
            f'<rect id="stitch" x="{i}" y="{i}" width="{num(W - 2 * i)}" height="{num(H - 2 * i)}" rx="3" fill="none" '
            f'stroke="{c["stitch"]}" stroke-opacity="{c["stitch_op"]}" stroke-width="{STITCH_W}" '
            f'stroke-dasharray="{STITCH_DASH[0]} {STITCH_DASH[1]}" stroke-linecap="round"/>\n')


def dot_el(dot):
    return f'<circle id="dot" cx="{num(dot["cx"])}" cy="{num(dot["cy"])}" r="{num(dot["r"])}" fill="{MAGENTA}"/>\n'


def outlined(c, items, dot):
    body = frame(c) + '<g id="text">\n'
    for it in items:
        d, _, _ = it['face'].run(it['text'], it['size'], it['x'], it['base'])
        body += f'<path id="{it["id"]}" d="{d}" fill="{c[it["role"]]}"><title>{it["text"]}</title></path>\n'
    body += '</g>\n' + dot_el(dot)
    return head('ايميز لتوريدات الملابس | EMESE banner') + body + '</svg>\n'


def editable(c, items, dot):
    # the fonts ride along inside the file, so a browser shows it right without installing them;
    # design apps (Illustrator, Inkscape, Figma) use the installed font of the same name
    faces = ''.join(
        f'@font-face{{font-family:"{f.family}";font-weight:{f.weight};'
        f'src:url(data:font/ttf;base64,{base64.b64encode(f.data).decode()}) format("truetype")}}'
        for f in (HEAVY, SEMI))
    body = frame(c) + '<g id="text">\n'
    for it in items:
        # anchored at the middle: the one anchor every app reads the same way for right-to-left text
        body += (f'<text id="{it["id"]}" x="{num(it["x"] + it["w"] / 2)}" y="{num(it["base"])}" '
                 f'font-family="Alexandria, sans-serif" font-weight="{it["face"].weight}" font-size="{it["size"]}" '
                 f'fill="{c[it["role"]]}" text-anchor="middle" direction="rtl" xml:space="preserve">{it["text"]}</text>\n')
    body += '</g>\n' + dot_el(dot)
    return head('ايميز لتوريدات الملابس | EMESE banner (editable)', f'<defs><style>{faces}</style></defs>\n') + body + '</svg>\n'


def main():
    items, dot = layout()
    for name, c in COLOURWAYS.items():
        out = ROOT if name == 'dark' else os.path.join(ROOT, 'light')
        os.makedirs(out, exist_ok=True)
        open(os.path.join(out, 'emese-banner.svg'), 'w', encoding='utf-8').write(outlined(c, items, dot))
        open(os.path.join(out, 'emese-banner-editable.svg'), 'w', encoding='utf-8').write(editable(c, items, dot))
        print('wrote', os.path.relpath(out, ROOT) if out != ROOT else '.', 'svg + editable svg')


if __name__ == '__main__':
    main()
