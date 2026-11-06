"""EMESE store banner, 300 x 100 (3:1): "ايميز لتوريدات الملابس".

Right: the name, the magenta dot of the EMESE logo, "لتوريدات الملابس", and a line of services under a rule
with C M Y print marks. Left: a clothing hang tag (the EMESE. logo, uniforms / print / embroidery, a magenta
band) on its cord, over a tailor's measuring tape. Behind it all a fine twill weave, and a stitched border like
a sewn-in label.

Writes, for each colourway (dark = main, light = alternative):
  emese-banner.svg           everything as shapes: looks the same in every app, scales to any size
  emese-banner-editable.svg  the same design with real, editable text (needs the fonts in fonts/)
Then export.js makes the PDF and PNG files.

    pip install uharfbuzz fonttools
    python design/banner/src/build.py && node design/banner/src/export.js
"""
import base64
import math
import os

import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                    # design/banner
FONTS = os.path.join(ROOT, 'fonts')
W, H = 300, 100                                 # 1 unit = 1 px at 300 x 100, or 1 cm on a 300 x 100 cm print

BRAND = 'ايميز'
LINES = ['لتوريدات', 'الملابس']                 # read right to left: name, then these two, top to bottom
SERVICES = 'يونيفورمات  •  طباعة  •  تطريز  •  كابات'
TAG_LINES = ['UNIFORMS', 'PRINT', 'EMBROIDERY']
TAG_BAND = 'CUSTOM SUPPLIES'

MAGENTA, CYAN, YELLOW = '#e6007e', '#00a3e0', '#ffe500'
COLOURWAYS = {
    'dark': {'bg': '#121212', 'brand': '#ffffff', 'lines': '#d9d5ce', 'weave': ('#ffffff', 0.045),
             'shade': True, 'stitch': ('#ece7df', 0.55), 'drop': 0.45},
    'light': {'bg': '#f1eee8', 'brand': '#000000', 'lines': '#3a3834', 'weave': ('#000000', 0.05),
              'shade': False, 'stitch': ('#000000', 0.35), 'drop': 0.14},
}
CARD, CARD_INK = '#f3f1ec', '#111111'           # the hang tag is the same in both colourways
CORD = '#d8cdb6'                                # natural twine


def num(v):
    return ('%.2f' % v).rstrip('0').rstrip('.')


class Face:
    """A font that shapes text with HarfBuzz (Arabic letters joined correctly) and draws it as SVG paths."""

    def __init__(self, file, family, weight):
        self.file, self.family, self.weight = os.path.join(FONTS, file), family, weight
        self.data = open(self.file, 'rb').read()
        self.tt = TTFont(self.file)
        self.gs = self.tt.getGlyphSet()
        self.upem = self.tt['head'].unitsPerEm
        self.order = self.tt.getGlyphOrder()
        self.hb = hb.Font(hb.Face(self.data))

    def glyphs(self, text, size):
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        hb.shape(self.hb, buf, {})
        k = size / self.upem                    # visual order, left to right, also for Arabic
        return [(self.order[i.codepoint], p.x_advance * k, p.x_offset * k, p.y_offset * k)
                for i, p in zip(buf.glyph_infos, buf.glyph_positions)], k

    def run(self, text, size, x=0.0, baseline=0.0):
        """Path data, advance width and ink box (x0, y0, x1, y1, y down) of text whose left edge is at x."""
        gl, k = self.glyphs(text, size)
        pen, box = SVGPathPen(self.gs, ntos=num), BoundsPen(self.gs)
        cx = 0
        for g, adv, xo, yo in gl:
            t = (k, 0, 0, -k, x + cx + xo, baseline - yo)
            self.gs[g].draw(TransformPen(pen, t))
            self.gs[g].draw(TransformPen(box, t))
            cx += adv
        return pen.getCommands(), cx, box.bounds


HEAVY = Face('Alexandria-Black.ttf', 'Alexandria', 900)
SEMI = Face('Alexandria-SemiBold.ttf', 'Alexandria', 600)
REG = Face('Alexandria-Regular.ttf', 'Alexandria', 400)
SERIF = Face('DMSerifDisplay-Regular.ttf', 'DM Serif Display', 400)


# ---------------------------------------------------------------- pieces drawn the same in both files

def weave(c):
    """Fine diagonal twill lines, like the weave of a fabric."""
    color, op = c['weave']
    d, x = [], -H
    while x < W + H:
        d.append(f'M{num(x)} 0L{num(x + H)} {H}')
        x += 2.6
    return (f'<path id="weave" d="{"".join(d)}" stroke="{color}" stroke-opacity="{op}" stroke-width="0.45" '
            f'fill="none"/>\n')


def shade(c):
    return '<rect id="shade" width="300" height="100" fill="url(#shade-g)"/>\n' if c['shade'] else ''


def tape(x=14, y=112, length=140, angle=-61, width=9.0):
    """A tailor's measuring tape in the brand yellow, with cm ticks and numbers, crossing behind the tag."""
    tr = f'translate({num(x)} {num(y)}) rotate({num(angle)})'
    out = [f'<g id="tape">\n',
           f'<rect transform="{tr} translate(0.9 0.9)" width="{num(length)}" height="{width}" fill="#000" fill-opacity="0.3"/>\n',
           f'<g transform="{tr}">\n',
           f'<rect width="{num(length)}" height="{width}" fill="{YELLOW}"/>\n',
           f'<rect y="{num(width - 0.7)}" width="{num(length)}" height="0.7" fill="#000" fill-opacity="0.18"/>\n']
    step, ticks, i = 1.6, [], 0
    while i * step < length - 1:
        tick = 3.4 if i % 10 == 0 else (2.4 if i % 5 == 0 else 1.5)
        ticks.append(f'M{num(4.5 + i * step)} 0V{num(tick)}')
        i += 1
    out.append(f'<path d="{"".join(ticks)}" stroke="#111" stroke-width="0.32" fill="none"/>\n')
    n = 1
    while 4.5 + n * 10 * step < length - 3:
        t = str(n + 40)
        _, w, _ = REG.run(t, 2.9)
        d, _, _ = REG.run(t, 2.9, 4.5 + n * 10 * step - w / 2, 6.9)
        out.append(f'<path d="{d}" fill="#111"/>\n')
        n += 1
    out.append('</g>\n</g>\n')
    return ''.join(out)


def border(c):
    color, op = c['stitch']
    i = 5
    return (f'<rect id="stitch" x="{i}" y="{i}" width="{W - 2 * i}" height="{H - 2 * i}" rx="3" fill="none" '
            f'stroke="{color}" stroke-opacity="{op}" stroke-width="1" stroke-dasharray="1.6 2.6" stroke-linecap="round"/>\n')


# ---------------------------------------------------------------- layout

TAG = {'cx': 46, 'cy': 53, 'w': 46, 'h': 66, 'angle': 7, 'clip': 9, 'hole': 7}


def spaced(id_, text, cx, base, size, fill, track, live):
    """A line of small capitals with letter spacing, centred on cx: live text or shapes."""
    if live:
        # letter-spacing also follows the last letter: shift by half of it to stay centred
        return (f'<text id="{id_}" x="{num(cx + track / 2)}" y="{num(base)}" font-family="Alexandria, sans-serif" '
                f'font-weight="{SEMI.weight}" font-size="{size}" letter-spacing="{track}" fill="{fill}" '
                f'text-anchor="middle">{text}</text>\n')
    gl, k = SEMI.glyphs(text, size)
    x = cx - (sum(a for _, a, _, _ in gl) + track * (len(gl) - 1)) / 2
    pen = SVGPathPen(SEMI.gs, ntos=num)
    for g, a, xo, yo in gl:
        SEMI.gs[g].draw(TransformPen(pen, (k, 0, 0, -k, x + xo, base - yo)))
        x += a + track
    return f'<path id="{id_}" d="{pen.getCommands()}" fill="{fill}"><title>{text}</title></path>\n'


def wordmark(cx, cy, size):
    """EMESE. as in the logo: DM Serif Display capitals and the magenta dot on the baseline, centred."""
    _, w, bx = SERIF.run('EMESE', size)
    r, gap = size * 0.085, size * 0.05
    base = cy + (bx[3] - bx[1]) / 2
    d, _, bx = SERIF.run('EMESE', size, cx - (w + gap + 2 * r) / 2, base)
    return (f'<g id="tag-logo"><path d="{d}" fill="{CARD_INK}"/>'
            f'<circle cx="{num(bx[2] + gap + r)}" cy="{num(base - r)}" r="{num(r)}" fill="{MAGENTA}"/></g>\n')


def tag(c, live):
    """A clothing swing tag: clipped top corners, a metal eyelet, the cord running up off the banner."""
    t = TAG
    x0, y0, x1, y1, k = -t['w'] / 2, -t['h'] / 2, t['w'] / 2, t['h'] / 2, t['clip']
    shape = f'M{num(x0 + k)} {num(y0)}H{num(x1 - k)}L{num(x1)} {num(y0 + k)}V{num(y1)}H{num(x0)}V{num(y0 + k)}Z'
    hy0 = y0 + t['hole']
    a = math.radians(t['angle'])                # eyelet position on the banner, where the cord starts
    hx, hy = t['cx'] - hy0 * math.sin(a), t['cy'] + hy0 * math.cos(a)
    cord = f'M{num(hx)} {num(hy)}C{num(hx - 2)} {num(hy - 14)} {num(hx + 10)} {num(hy - 22)} {num(hx + 6)} -4'
    out = ['<g id="tag">\n',
           f'<path id="tag-cord-shadow" d="{cord}" transform="translate(0.7 0.9)" stroke="#000" stroke-opacity="0.35" '
           f'stroke-width="1.6" fill="none"/>\n',
           f'<g id="tag-card" transform="translate({t["cx"]} {t["cy"]}) rotate({t["angle"]})">\n',
           f'<path d="{shape}" transform="translate(0.9 1.6)" fill="#000" fill-opacity="{c["drop"]}"/>\n',
           f'<path d="{shape}" fill="{CARD}"/>\n',
           f'<path id="tag-band" d="M{num(x0)} {num(y1 - 9)}H{num(x1)}V{num(y1)}H{num(x0)}Z" fill="{MAGENTA}"/>\n',
           spaced('tag-band-text', TAG_BAND, 0, y1 - 3.4, 3.3, '#ffffff', 0.5, live),
           f'<g id="tag-eyelet"><circle cy="{num(hy0)}" r="3.3" fill="#c7c2b8"/><circle cy="{num(hy0)}" r="2.4" '
           f'fill="#8f8a81"/><circle cy="{num(hy0)}" r="1.8" fill="{c["bg"]}"/></g>\n',
           wordmark(0, -6.8, 11.2),
           f'<path id="tag-rule" d="M-14 1.4H14" stroke="{CARD_INK}" stroke-width="0.4" stroke-opacity="0.6"/>\n']
    out += [spaced(f'tag-line{i + 1}', line, 0, 6.8 + i * 4.6, 3.2, CARD_INK, 0.55, live) for i, line in enumerate(TAG_LINES)]
    out += ['</g>\n', f'<path id="tag-cord" d="{cord}" stroke="{CORD}" stroke-width="1.3" fill="none" '
            f'stroke-linecap="round"/>\n', '</g>\n']
    return ''.join(out)


def text_layout(right=286):
    """Name on the right, dot, the two lines stacked to its left; a rule with C M Y marks and the services."""
    big, small, svc = 45, 15.5, 8.2
    _, wb, bb = HEAVY.run(BRAND, big)
    r = big * 0.085
    g_dot, g_lines = big * 0.09, big * 0.26
    ws = max(SEMI.run(t, small)[1] for t in LINES)
    total = wb + g_dot + 2 * r + g_lines + ws
    _, wsv, bsv = SEMI.run(SERVICES, svc)
    gap1, gap2 = 4.5, 4.0
    top = (H - ((bb[3] - bb[1]) + gap1 + gap2 + (bsv[3] - bsv[1]))) / 2
    base = top - bb[1]
    xb = right - wb
    items = [{'id': 'brand', 'face': HEAVY, 'size': big, 'text': BRAND, 'x': xb, 'w': wb, 'base': base, 'role': 'brand'}]
    lr = xb - g_dot - 2 * r - g_lines           # right edge of the two lines
    for i, t in enumerate(LINES):
        w = SEMI.run(t, small)[1]
        items.append({'id': f'line{i + 1}', 'face': SEMI, 'size': small, 'text': t, 'x': lr - w, 'w': w,
                      'base': base - (len(LINES) - 1 - i) * small * 1.3, 'role': 'lines'})
    left = right - total
    y_rule = top + (bb[3] - bb[1]) + gap1
    items.append({'id': 'services', 'face': SEMI, 'size': svc, 'text': SERVICES, 'x': right - wsv, 'w': wsv,
                  'base': y_rule + gap2 - bsv[1] + 0.5, 'role': 'lines'})
    return items, {'cx': xb - g_dot - r, 'cy': base - r, 'r': r}, {'x': left, 'y': y_rule, 'w': total}


def rule(rl, c):
    out = [f'<g id="rule">\n<rect x="{num(rl["x"])}" y="{num(rl["y"])}" width="{num(rl["w"])}" height="0.5" '
           f'fill="{c["lines"]}" fill-opacity="0.5"/>\n']
    for i, col in enumerate((CYAN, MAGENTA, YELLOW)):
        out.append(f'<rect x="{num(rl["x"] + i * 4.2)}" y="{num(rl["y"] - 0.9)}" width="3.6" height="2.3" fill="{col}"/>\n')
    return ''.join(out) + '</g>\n'


# ---------------------------------------------------------------- the two files

def document(c, title, defs_extra, text_svg, tag_svg, layout):
    items, dot, rl = layout
    defs = ('<defs>\n<clipPath id="edge"><rect width="300" height="100"/></clipPath>\n'
            '<radialGradient id="shade-g" cx="0.62" cy="0.45" r="0.75">'
            '<stop offset="0" stop-color="#fff" stop-opacity="0.07"/><stop offset="1" stop-color="#000" stop-opacity="0.25"/>'
            f'</radialGradient>\n{defs_extra}</defs>\n')
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<svg xmlns="http://www.w3.org/2000/svg" '
            f'width="{W}" height="{H}" viewBox="0 0 {W} {H}">\n<title>{title}</title>\n' + defs +
            f'<rect id="background" width="{W}" height="{H}" fill="{c["bg"]}"/>\n'
            '<g id="art" clip-path="url(#edge)">\n' + weave(c) + shade(c) + tape() + tag_svg + '</g>\n'
            '<g id="text">\n' + text_svg +
            f'<circle id="dot" cx="{num(dot["cx"])}" cy="{num(dot["cy"])}" r="{num(dot["r"])}" fill="{MAGENTA}"/>\n'
            + rule(rl, c) + '</g>\n' + border(c) + '</svg>\n')


def outlined(c, layout):
    items, _, _ = layout
    text_svg = ''
    for it in items:
        d, _, _ = it['face'].run(it['text'], it['size'], it['x'], it['base'])
        text_svg += f'<path id="{it["id"]}" d="{d}" fill="{c[it["role"]]}"><title>{it["text"]}</title></path>\n'
    return document(c, 'ايميز لتوريدات الملابس | EMESE banner', '', text_svg, tag(c, live=False), layout)


def editable(c, layout):
    items, _, _ = layout
    # the fonts travel inside the file so a browser shows it right without installing them;
    # design apps (Illustrator, Inkscape, Figma) use the installed fonts of the same name
    faces = ''.join(f'@font-face{{font-family:"{f.family}";font-weight:{f.weight};'
                    f'src:url(data:font/ttf;base64,{base64.b64encode(f.data).decode()}) format("truetype")}}'
                    for f in (HEAVY, SEMI))
    text_svg = ''
    for it in items:
        # anchored at the middle: the one anchor every app reads the same way for right-to-left text
        text_svg += (f'<text id="{it["id"]}" x="{num(it["x"] + it["w"] / 2)}" y="{num(it["base"])}" '
                     f'font-family="Alexandria, sans-serif" font-weight="{it["face"].weight}" font-size="{it["size"]}" '
                     f'fill="{c[it["role"]]}" text-anchor="middle" direction="rtl" xml:space="preserve">{it["text"]}</text>\n')
    return document(c, 'ايميز لتوريدات الملابس | EMESE banner (editable)', f'<style>{faces}</style>\n',
                    text_svg, tag(c, live=True), layout)


def main():
    layout = text_layout()
    for name, c in COLOURWAYS.items():
        out = ROOT if name == 'dark' else os.path.join(ROOT, 'light')
        os.makedirs(out, exist_ok=True)
        open(os.path.join(out, 'emese-banner.svg'), 'w', encoding='utf-8').write(outlined(c, layout))
        open(os.path.join(out, 'emese-banner-editable.svg'), 'w', encoding='utf-8').write(editable(c, layout))
        print('wrote', name)


if __name__ == '__main__':
    main()
