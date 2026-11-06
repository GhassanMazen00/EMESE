"""EMESE store banner, 300 x 100 (3:1): "ايميز لتوريدات الملابس".

Right: the name, the magenta dot of the EMESE logo, "لتوريدات الملابس", and a line of services under a rule
with C M Y print marks. Left: a woven-patch badge (EMESE, the E. mark, uniforms / print / embroidery) on a
tailor's measuring tape. Behind it all a fine twill weave, and a stitched border like a sewn-in label.

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
BADGE_TOP, BADGE_BOTTOM = 'EMESE', 'UNIFORMS • PRINT • EMBROIDERY'

MAGENTA, CYAN, YELLOW = '#e6007e', '#00a3e0', '#ffe500'
COLOURWAYS = {
    'dark': {'bg': '#121212', 'brand': '#ffffff', 'lines': '#d9d5ce', 'weave': ('#ffffff', 0.045),
             'shade': True, 'stitch': ('#ece7df', 0.55), 'drop': 0.4},
    'light': {'bg': '#f1eee8', 'brand': '#000000', 'lines': '#3a3834', 'weave': ('#000000', 0.05),
              'shade': False, 'stitch': ('#000000', 0.35), 'drop': 0.1},
}
PATCH, PATCH_INK = '#f3f1ec', '#111111'         # the badge is the same in both colourways


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

    def arc(self, text, size, cx, cy, R, where='top', track=0.0):
        """Text centred on the top of a circle (tops outward) or the bottom (tops inward), upright, left to
        right, baseline on radius R. Returns path data and the arc length it covers."""
        gl, k = self.glyphs(text, size)
        L = sum(a for _, a, _, _ in gl) + track * (len(gl) - 1)
        pen = SVGPathPen(self.gs, ntos=num)
        s = 0.0
        for g, a, _, _ in gl:
            mid, u0 = s + a / 2, -a / 2
            if where == 'top':
                th = (mid - L / 2) / R
                c, sn = math.cos(th), math.sin(th)
                m = (k * c, k * sn, k * sn, -k * c, cx + R * sn + u0 * c, cy - R * c + u0 * sn)
            else:
                th = math.pi + (L / 2 - mid) / R
                c, sn = math.cos(th), math.sin(th)
                m = (-k * c, -k * sn, -k * sn, k * c, cx + R * sn - u0 * c, cy - R * c - u0 * sn)
            self.gs[g].draw(TransformPen(pen, m))
            s += a + track
        return pen.getCommands(), L


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
    """A tailor's measuring tape in the brand yellow, with cm ticks and numbers, crossing behind the badge."""
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

def badge_layout(cx=46, cy=50, R=31):
    r_in = R * 0.66
    Rm = (R - 2.2 + r_in) / 2                   # middle of the lettering band
    top = {'id': 'badge-top', 'face': HEAVY, 'size': 6.2, 'track': 2.2, 'R': Rm - 2.2, 'where': 'top', 'text': BADGE_TOP}
    bottom = {'id': 'badge-bottom', 'face': SEMI, 'size': 3.9, 'track': 0.35, 'R': Rm + 1.4, 'where': 'bottom',
              'text': BADGE_BOTTOM}
    for a in (top, bottom):
        a['d'], a['L'] = a['face'].arc(a['text'], a['size'], cx, cy, a['R'], a['where'], a['track'])
    # magenta stitches halfway between the end of the top arc and the start of the bottom one
    half_t, half_b = top['L'] / (2 * top['R']), bottom['L'] / (2 * bottom['R'])
    ang = (half_t + (math.pi - half_b)) / 2
    dots = [(cx + Rm * math.sin(s * ang), cy - Rm * math.cos(s * ang)) for s in (-1, 1)]
    return {'cx': cx, 'cy': cy, 'R': R, 'r_in': r_in, 'arcs': (top, bottom), 'dots': dots}


def badge(b, c, arcs_svg):
    cx, cy, R, r_in = b['cx'], b['cy'], b['R'], b['r_in']
    out = ['<g id="badge">\n',
           f'<circle cx="{cx}" cy="{num(cy + 1)}" r="{num(R + 1.4)}" fill="#000" fill-opacity="{c["drop"]}"/>\n',
           f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="{PATCH}"/>\n',
           f'<circle cx="{cx}" cy="{cy}" r="{num(R - 2.2)}" fill="none" stroke="{PATCH_INK}" stroke-width="0.7" '
           f'stroke-dasharray="1.2 1.6" stroke-linecap="round"/>\n',
           f'<circle cx="{cx}" cy="{cy}" r="{num(r_in)}" fill="{PATCH_INK}"/>\n',
           f'<circle cx="{cx}" cy="{cy}" r="{num(r_in - 1.8)}" fill="none" stroke="{PATCH}" stroke-opacity="0.55" '
           f'stroke-width="0.55" stroke-dasharray="1 1.4" stroke-linecap="round"/>\n',
           arcs_svg]
    out += [f'<circle cx="{num(x)}" cy="{num(y)}" r="1" fill="{MAGENTA}"/>\n' for x, y in b['dots']]
    # the E. mark of the EMESE logo
    size = r_in * 1.25
    _, w, bx = SERIF.run('E', size)
    base = cy + (bx[3] - bx[1]) / 2
    d, _, bx = SERIF.run('E', size, cx - r_in * 0.12 - w / 2, base)
    out.append(f'<path id="badge-mark" d="{d}" fill="{PATCH}"/>\n')
    out.append(f'<circle cx="{num(bx[2] + r_in * 0.16)}" cy="{num(base - r_in * 0.09)}" r="{num(r_in * 0.09)}" '
               f'fill="{MAGENTA}"/>\n</g>\n')
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

def document(c, title, defs_extra, text_svg, arcs_svg, layout):
    b, items, dot, rl = layout
    defs = ('<defs>\n<clipPath id="edge"><rect width="300" height="100"/></clipPath>\n'
            '<radialGradient id="shade-g" cx="0.62" cy="0.45" r="0.75">'
            '<stop offset="0" stop-color="#fff" stop-opacity="0.07"/><stop offset="1" stop-color="#000" stop-opacity="0.25"/>'
            f'</radialGradient>\n{defs_extra}</defs>\n')
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
            f'width="{W}" height="{H}" viewBox="0 0 {W} {H}">\n<title>{title}</title>\n' + defs +
            f'<rect id="background" width="{W}" height="{H}" fill="{c["bg"]}"/>\n'
            '<g id="art" clip-path="url(#edge)">\n' + weave(c) + shade(c) + tape() + badge(b, c, arcs_svg) + '</g>\n'
            '<g id="text">\n' + text_svg +
            f'<circle id="dot" cx="{num(dot["cx"])}" cy="{num(dot["cy"])}" r="{num(dot["r"])}" fill="{MAGENTA}"/>\n'
            + rule(rl, c) + '</g>\n' + border(c) + '</svg>\n')


def outlined(c, layout):
    b, items, _, _ = layout
    text_svg = ''
    for it in items:
        d, _, _ = it['face'].run(it['text'], it['size'], it['x'], it['base'])
        text_svg += f'<path id="{it["id"]}" d="{d}" fill="{c[it["role"]]}"><title>{it["text"]}</title></path>\n'
    arcs = ''.join(f'<path id="{a["id"]}" d="{a["d"]}" fill="{PATCH_INK}"><title>{a["text"]}</title></path>\n'
                   for a in b['arcs'])
    return document(c, 'ايميز لتوريدات الملابس | EMESE banner', '', text_svg, arcs, layout)


def editable(c, layout):
    b, items, _, _ = layout
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
    # badge lettering on half-circle guides (top: over the top, bottom: under the bottom, both left to right)
    guides, arcs = '', ''
    for a in b['arcs']:
        R, cx, cy = a['R'], b['cx'], b['cy']
        sweep = 1 if a['where'] == 'top' else 0
        guides += (f'<path id="{a["id"]}-guide" d="M{num(cx - R)} {num(cy)}A{num(R)} {num(R)} 0 0 {sweep} '
                   f'{num(cx + R)} {num(cy)}" fill="none"/>\n')
        # letter-spacing also follows the last letter: shift by half of it to stay centred
        off = math.pi * R / 2 + a['track'] / 2
        arcs += (f'<text id="{a["id"]}" font-family="Alexandria, sans-serif" font-weight="{a["face"].weight}" '
                 f'font-size="{a["size"]}" letter-spacing="{a["track"]}" fill="{PATCH_INK}">'
                 f'<textPath href="#{a["id"]}-guide" xlink:href="#{a["id"]}-guide" startOffset="{num(off)}" '
                 f'text-anchor="middle">{a["text"]}</textPath></text>\n')
    return document(c, 'ايميز لتوريدات الملابس | EMESE banner (editable)', f'<style>{faces}</style>\n{guides}',
                    text_svg, arcs, layout)


def main():
    items, dot, rl = text_layout()
    layout = (badge_layout(), items, dot, rl)
    for name, c in COLOURWAYS.items():
        out = ROOT if name == 'dark' else os.path.join(ROOT, 'light')
        os.makedirs(out, exist_ok=True)
        open(os.path.join(out, 'emese-banner.svg'), 'w', encoding='utf-8').write(outlined(c, layout))
        open(os.path.join(out, 'emese-banner-editable.svg'), 'w', encoding='utf-8').write(editable(c, layout))
        print('wrote', name)


if __name__ == '__main__':
    main()
